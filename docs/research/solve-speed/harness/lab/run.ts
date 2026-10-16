// One search method on one fight, over the recorded tree, playing on the real pool only what the tree lacks.
// usage: node run.ts --fight <export.json> --tree <dir> --method <m> [--workers 6] [--sim <ms per try>] [--share]
//                    [--budget 3000] [--out <file.json>]
// methods: portfolio[:fair|:priority][:early][:order=0,1,2]   beam:<width>:<w>   iw:<w>[:widths=2,4,8,16]
//          lds:<w>:<alternatives>:<maxK>   bf:<w>:<lambda>[:<parallel>]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { findPinnedClone, harnessIn } from "../../../../../scripts/clone-test/clone-test.ts";
import { PINNED_GAME_VERSION } from "../../../../../src/escape-ladder/lookup.ts";
import type { Input } from "../../../../../src/solver/oracle-line.ts";
import { startPool, type WorkerPool } from "../../../../../src/solver/pool.ts";
import { replay } from "../../../../../src/solver/replay.ts";
import { type Action, PORTFOLIO, type Position } from "../../../../../src/solver/search.ts";
import { startWorker } from "../../../../../src/solver/worker.ts";
import { beams, type Verdict } from "./beam.ts";
import { bestFirst, lds } from "./methods.ts";
import { LabPool } from "./pool.ts";
import { Tree } from "./tree.ts";
import { asPinned } from "../pinned.ts";

const { values } = parseArgs({
  options: {
    fight: { type: "string" },
    tree: { type: "string" },
    method: { type: "string" },
    workers: { type: "string", default: "6" },
    sim: { type: "string" },
    share: { type: "boolean", default: false },
    budget: { type: "string", default: "3000" },
    out: { type: "string" },
    "max-played": { type: "string" },
  },
});
const fight = values.fight as string;
const treeDir = values.tree as string;
const method = values.method as string;
const workers = Number(values.workers);
const budget = Number(values.budget);
const json = JSON.parse(readFileSync(fight, "utf8"));
const exported = asPinned("save" in json ? json : { save: json });
const input = { ...exported, cloneVersion: PINNED_GAME_VERSION };
const inClone = harnessIn(findPinnedClone);
// PATCH=<file>: the search's workers run the harness with the patch spliced in; replays run it untouched.
const patch = process.env.PATCH ? readFileSync(process.env.PATCH, "utf8") : "";
const ANCHOR = 'import { beforeAll, describe, it, vi } from "vitest";\n';
const clone: typeof inClone = r => (patch && r.name === "worker" ? inClone({ ...r, source: r.source.replace(ANCHOR, ANCHOR + patch) }) : inClone(r));
const tree = new Tree(treeDir);
const t0 = Date.now();
const log = (s: string) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

const rootFile = path.join(treeDir, "root.json");
let real: WorkerPool | null = null;
let root: Position;
if (values.sim !== undefined && existsSync(rootFile)) {
  root = JSON.parse(readFileSync(rootFile, "utf8"));
} else {
  const started = await startPool(workers, () => startWorker(clone, input.save), PINNED_GAME_VERSION);
  if (!("root" in started)) throw new Error(`pool: ${JSON.stringify(started)}`);
  real = started;
  root = { ...started.root, forkPoint: tree.handle(started.root.forkPoint) };
  if (!existsSync(rootFile)) writeFileSync(rootFile, JSON.stringify(root));
  log(`pool of ${workers} up`);
}
const pool = new LabPool(tree, real, {
  size: workers,
  tau: values.sim === undefined ? undefined : Number(values.sim),
  share: values.share,
  maxPlayed: values["max-played"] === undefined ? undefined : Number(values["max-played"]),
});

const validations = path.join(treeDir, "validate.jsonl");
const verdicts = new Map<string, Verdict>(
  existsSync(validations)
    ? readFileSync(validations, "utf8")
        .split("\n")
        .filter(Boolean)
        .map(l => {
          const { k, v } = JSON.parse(l);
          return [k, v];
        })
    : [],
);
let replays = 0;
const validate = async (p: Action[]): Promise<Verdict> => {
  const inputs = p.filter((a): a is Input => a !== null);
  const k = JSON.stringify(inputs);
  const known = verdicts.get(k);
  if (known) return known;
  replays++;
  const r = await replay(input, { inputs }, clone);
  const v: Verdict =
    r.kind === "replayed" ? { won: r.replay.outcome === "won", why: r.replay.outcome } : { won: false, why: r.reason.code };
  verdicts.set(k, v);
  appendFileSync(validations, `${JSON.stringify({ k, v })}\n`);
  log(`replayed a ${inputs.length}-input line: ${JSON.stringify(v)}`);
  return v;
};

const tick = setInterval(() => log(`tries ${pool.tally.requested} (unique ${pool.tally.unique}), played ${pool.tally.played}`), 30_000);
const [name, ...args] = method.split(":");
let result: object;
const tries = () => (values.share ? pool.tally.unique : pool.tally.requested);
if (name === "portfolio" || name === "beam") {
  const flags = new Set(args.filter(a => !a.includes("=") && Number.isNaN(Number(a))));
  const order = args.find(a => a.startsWith("order="))?.slice(6).split(",").map(Number);
  const portfolio =
    name === "beam" ? [{ width: Number(args[0]), ours: Number(args[1]) }] : order ? order.map(i => PORTFOLIO[i]) : PORTFOLIO;
  result = await beams({
    root,
    pool,
    validate,
    portfolio,
    budget,
    policy: flags.has("priority") ? "priority" : "fair",
    earlyWin: flags.has("early"),
  });
} else if (name === "iw") {
  const ours = Number(args[0]);
  const widths = (args.find(a => a.startsWith("widths="))?.slice(7) ?? "2,4,8,16").split(",").map(Number);
  const steps = [];
  let found = null;
  for (const width of widths) {
    const o = await beams({ root, pool, validate, portfolio: [{ width, ours }], budget });
    steps.push({ width, kind: o.kind, triesAfter: tries(), beam: o.beams[0], ...(o.kind === "found" && { turn: o.turn }) });
    if (o.kind === "found") {
      found = o;
      break;
    }
  }
  result = { kind: found ? "found" : "no_answer", steps, ...(found && { path: found.path, turn: found.turn }) };
} else if (name === "lds") {
  result = await lds(root, { pool, validate, ours: Number(args[0]), budget, alternatives: Number(args[1]), maxK: Number(args[2]), tries });
} else if (name === "bf") {
  result = await bestFirst(root, { pool, validate, ours: Number(args[0]), budget, lambda: Number(args[1]), tries, parallel: Number(args[2] ?? 1) });
} else throw new Error(`no method ${method}`);
clearInterval(tick);

const summary = {
  fight: path.basename(fight),
  method,
  patch: process.env.PATCH ? path.basename(process.env.PATCH) : null,
  workers,
  sim: values.sim ?? null,
  share: values.share,
  budget,
  seconds: (Date.now() - t0) / 1000,
  tally: pool.tally,
  replays,
  tree: tree.size,
  pool: real?.stats() ?? null,
  result,
};
if (values.out) writeFileSync(values.out, JSON.stringify(summary, null, 1));
const r = result as { kind: string; path?: Action[]; turn?: number };
console.log(
  JSON.stringify({ ...summary, result: { kind: r.kind, turn: r.turn, inputs: r.path?.filter(a => a !== null).length } }),
);
await real?.close();
process.exit(0);
