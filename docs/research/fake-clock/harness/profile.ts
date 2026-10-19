// solve-speed's per-try bench (harness/profile.ts there), with the worker's source picked by MODE/PATCH (mode.ts) and
// every job's children kept, so two runs over the same forks compare job by job, not only where the tree has the job.
// One shipped worker (`src/solver/worker.ts`) expands fixed fork points of a recorded tree, every legal action of each,
// one action per job.
// usage: [PROF=1] [MODE=none|poll1] [PATCH=<file>[,<file>]] [REF=<jobs.json>] [JOB_MS=<ms>]
//        node profile.ts <export.json> <tree-dir> <out-dir> <forks>
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import path from "node:path";
import { findPinnedClone, testInClone } from "../../../../scripts/clone-test/clone-test.ts";
import reviewed from "../../../../src/escape-ladder/reviewed.json" with { type: "json" };
import type { Clone } from "../../../../src/solver/replay.ts";
import type { Child } from "../../../../src/solver/search.ts";
import { startWorker } from "../../../../src/solver/worker.ts";
import { HANDLE, normalHash, Tree } from "../../solve-speed/harness/lab/tree.ts";
import { forMode, mode, patchNames } from "./mode.ts";
import { readFight } from "./pinned.ts";

const [file, treeDir, outDir, count] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
rmSync(path.join(outDir, "children.jsonl"), { force: true });
const prof = process.env.PROF === "1";
const save = readFight(file).save;
const found = findPinnedClone();
if (!("clone" in found)) throw new Error(found.missing);
const inner: Clone = ({ name, source, input, env, heapMb, signal }) =>
  testInClone({
    clone: found.clone,
    name,
    source,
    input,
    env: { ...env, ...(process.env.CLOCK && { COACH_CLOCK: process.env.CLOCK }), ...(process.env.TRACE_OUT && { COACH_TRACE_OUT: process.env.TRACE_OUT }) },
    signal,
    echo: false,
    vitest: ["npx", "--yes", `pnpm@${reviewed.pinned.pnpm}`, "exec", "vitest"],
    args: [
      `--execArgv=--max-old-space-size=${heapMb ?? 768}`,
      ...(prof ? [`--execArgv=--cpu-prof`, `--execArgv=--cpu-prof-dir=${path.resolve(outDir)}`, `--execArgv=--cpu-prof-interval=500`] : []),
    ],
  });
const clone = forMode(inner);

// Fork points spread over the recorded tree, the same ones for the same tree.
const tree = new Tree(treeDir);
const forks: { handle: string; legal: unknown[] }[] = [];
const seen = new Set<string>();
for (const [, children] of tree.entries()) {
  for (const c of children) {
    if (c.end !== "on" || seen.has(c.at.forkPoint)) continue;
    seen.add(c.at.forkPoint);
    const only = process.env.ONLY;
    const pick = only ? c.at.forkPoint === `${HANDLE}${only}` : seen.size % 37 === 1;
    if (pick && forks.length < Number(count)) forks.push({ handle: c.at.forkPoint, legal: c.at.legal });
  }
}
/** A child as recorded: fork points by their hash. */
const canon = (cs: Child[]) =>
  JSON.stringify(cs.map(c => (c.end === "on" ? { ...c, at: { ...c.at, forkPoint: c.at.forkPoint.startsWith(HANDLE) ? c.at.forkPoint.slice(HANDLE.length) : normalHash(c.at.forkPoint) } } : c)));
const digest = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const ref: { jobs: { fork: string; action: string; canon: string }[] } | null = process.env.REF ? JSON.parse(readFileSync(process.env.REF, "utf8")) : null;

const load1 = [loadavg()[0]];
const t0 = Date.now();
const worker = await startWorker(clone, save);
if (!("root" in worker)) throw new Error(JSON.stringify(worker));
const boot = (Date.now() - t0) / 1000;
const jobs = [];
let same = 0;
let differ = 0;
let unrecorded = 0;
let refSame = 0;
const refDiffer: number[] = [];
const slow: number[] = [];
const jobMs = Number(process.env.JOB_MS ?? 15_000);
for (const { handle, legal } of forks) {
  const forkPoint = tree.forkPoint(handle);
  for (const action of legal) {
    const i = jobs.length;
    if (process.env.DEBUG_JOBS) console.error(`job ${i}: ${handle} ${JSON.stringify(action)}`);
    const s = performance.now();
    let children: Child[];
    let error: string | undefined;
    try {
      children = await worker.expand(forkPoint, [action as never]);
    } catch (e) {
      children = [];
      error = e instanceof Error ? e.message : String(e);
    }
    const ms = performance.now() - s;
    const c = error ? `error:${error}` : canon(children);
    jobs.push({ ms, children: children.length, fork: handle.slice(HANDLE.length), action: JSON.stringify(action), canon: digest(c), ...(error && { error }) });
    if (ms > jobMs) slow.push(i);
    // Fork points as their hash, so the children can be read and compared later.
    appendFileSync(path.join(outDir, "children.jsonl"), `${JSON.stringify({ i, c })}\n`);
    const recorded = tree.get(handle, action as never);
    if (!recorded) unrecorded++;
    else if (canon(recorded) === c) same++;
    else differ++;
    if (ref) {
      if (ref.jobs[i]?.canon === digest(c)) refSame++;
      else refDiffer.push(i);
    }
  }
}
await worker.close();
load1.push(loadavg()[0]);
const tries = jobs.reduce((a, j) => a + j.children, 0);
const wall = jobs.reduce((a, j) => a + j.ms, 0) / 1000;
const sorted = jobs.map(j => j.ms).sort((a, b) => a - b);
const summary = {
  mode: mode(),
  patch: patchNames(),
  load1,
  boot,
  forks: forks.length,
  jobs: jobs.length,
  tries,
  wall,
  perTryMs: (wall * 1000) / tries,
  medianJobMs: sorted[Math.floor(sorted.length / 2)],
  maxJobMs: sorted.at(-1),
  sameAsRecorded: same,
  differ,
  unrecorded,
  ...(ref && { vsRef: { same: refSame, differ: refDiffer } }),
  slowJobs: slow,
  errors: jobs.flatMap((j, i) => (j.error ? [i] : [])),
};
writeFileSync(path.join(outDir, "jobs.json"), JSON.stringify({ ...summary, jobs }));
console.log(JSON.stringify(summary));
