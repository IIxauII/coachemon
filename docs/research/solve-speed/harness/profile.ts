// Times the unit of search: one shipped worker (`src/solver/worker.ts`) expands a fixed set of recorded fork points,
// every legal action of each, one action per job. Optionally under V8's CPU profiler (PROF=1), optionally with a patch
// spliced into the harness (PATCH=<file>), and each job's children checked against the recorded tree.
// usage: [PROF=1] [PATCH=<file>] [POLL_MS=1] node profile.ts <export.json> <tree-dir> <out-dir> <forks>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findPinnedClone, testInClone } from "../../../../scripts/clone-test/clone-test.ts";
import reviewed from "../../../../src/escape-ladder/reviewed.json" with { type: "json" };
import type { Clone } from "../../../../src/solver/replay.ts";
import type { Child } from "../../../../src/solver/search.ts";
import { startWorker } from "../../../../src/solver/worker.ts";
import { HANDLE, normalHash, Tree } from "./lab/tree.ts";

const [file, treeDir, outDir, count] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const prof = process.env.PROF === "1";
const patch = process.env.PATCH ? readFileSync(process.env.PATCH, "utf8") : "";
const json = JSON.parse(readFileSync(file, "utf8"));
const save = ("save" in json ? json : { save: json }).save;
const found = findPinnedClone();
if (!("clone" in found)) throw new Error(found.missing);
const ANCHOR = 'import { beforeAll, describe, it, vi } from "vitest";\n';
const clone: Clone = ({ name, source, input, env, heapMb, signal }) => {
  if (patch && !source.includes(ANCHOR)) throw new Error("the template moved: no place to splice the patch");
  return testInClone({
    clone: found.clone,
    name,
    source: patch ? source.replace(ANCHOR, ANCHOR + patch) : source,
    input,
    env: {
      ...env,
      ...(process.env.POLL_MS && { COACH_POLL_MS: process.env.POLL_MS }),
      ...(process.env.CLOCK && { COACH_CLOCK: process.env.CLOCK }),
    },
    signal,
    echo: false,
    vitest: ["npx", "--yes", `pnpm@${reviewed.pinned.pnpm}`, "exec", "vitest"],
    args: [
      `--execArgv=--max-old-space-size=${heapMb ?? 768}`,
      ...(prof ? [`--execArgv=--cpu-prof`, `--execArgv=--cpu-prof-dir=${path.resolve(outDir)}`, `--execArgv=--cpu-prof-interval=500`] : []),
    ],
  });
};

// Fork points spread over the recorded tree, the same ones for the same tree.
const tree = new Tree(treeDir);
const forks: { handle: string; legal: unknown[] }[] = [];
const seen = new Set<string>();
for (const [, children] of tree.entries()) {
  for (const c of children) {
    if (c.end !== "on" || seen.has(c.at.forkPoint)) continue;
    seen.add(c.at.forkPoint);
    if (seen.size % 37 === 1 && forks.length < Number(count)) forks.push({ handle: c.at.forkPoint, legal: c.at.legal });
  }
}
/** A child as recorded: fork points by their hash. */
const canon = (cs: Child[]) =>
  JSON.stringify(cs.map(c => (c.end === "on" ? { ...c, at: { ...c.at, forkPoint: c.at.forkPoint.startsWith(HANDLE) ? c.at.forkPoint.slice(HANDLE.length) : normalHash(c.at.forkPoint) } } : c)));

const t0 = Date.now();
const worker = await startWorker(clone, save);
if (!("root" in worker)) throw new Error(JSON.stringify(worker));
const boot = (Date.now() - t0) / 1000;
const jobs = [];
let same = 0;
let differ = 0;
let unrecorded = 0;
for (const { handle, legal } of forks) {
  const forkPoint = tree.forkPoint(handle);
  for (const action of legal) {
    if (process.env.DEBUG_JOBS) console.log(`job ${jobs.length}: ${handle} ${JSON.stringify(action)}`);
    const s = performance.now();
    const children = await worker.expand(forkPoint, [action as never]);
    jobs.push({ ms: performance.now() - s, children: children.length });
    const recorded = tree.get(handle, action as never);
    if (!recorded) unrecorded++;
    else if (canon(recorded) === canon(children)) same++;
    else differ++;
  }
}
await worker.close();
const tries = jobs.reduce((a, j) => a + j.children, 0);
const wall = jobs.reduce((a, j) => a + j.ms, 0) / 1000;
const summary = { patch: process.env.PATCH ?? null, pollMs: process.env.POLL_MS ?? null, boot, forks: forks.length, jobs: jobs.length, tries, wall, perTryMs: (wall * 1000) / tries, sameAsRecorded: same, differ, unrecorded };
writeFileSync(path.join(outDir, "jobs.json"), JSON.stringify({ ...summary, jobs }));
console.log(JSON.stringify(summary));
