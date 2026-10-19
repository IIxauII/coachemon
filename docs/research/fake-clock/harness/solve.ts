// solve-speed's solve-shipped.ts with the workers' source picked by MODE/PATCH (mode.ts): the shipped `solve()` on one
// fight, as a player's plugin runs it (the discrepancy search, then the portfolio, the budget, the replay), with every
// progress event timed. The replay that validates a win always runs the harness untouched. Prints one JSON summary line.
// usage: [BUDGET=<expansions per beam>] [MODE=none|poll1] [PATCH=<file>] node solve.ts <export.json> <clone-dir> <progress.jsonl> [workers]
import { appendFileSync, readFileSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { findClone, harnessIn } from "../../../../scripts/clone-test/clone-test.ts";
import { PINNED_GAME_VERSION } from "../../../../src/escape-ladder/lookup.ts";
import { poolSize } from "../../../../src/solver/pool.ts";
import type { Clone } from "../../../../src/solver/replay.ts";
import { DEFAULT_BUDGET, solve } from "../../../../src/solver/solver.ts";
import { forMode, mode } from "./mode.ts";
import { asPinned } from "./pinned.ts";

const [file, cloneDir, progressOut, workersArg] = process.argv.slice(2);
const clone: Clone = forMode(harnessIn(() => findClone(cloneDir)));
const json = JSON.parse(readFileSync(file, "utf8"));
const exported = asPinned("save" in json ? json : { save: json });
const workers = workersArg ? Number(workersArg) : poolSize(availableParallelism());
const load1 = [loadavg()[0]];
const started = Date.now();
let first: number | null = null;
let last = { spent: 0, pool: null as unknown };
const result = await solve(
  {
    ...exported,
    cloneVersion: PINNED_GAME_VERSION,
    budget: process.env.BUDGET ? { ...DEFAULT_BUDGET, expansions: Number(process.env.BUDGET) } : DEFAULT_BUDGET,
  },
  {
    clone,
    unchecked: true,
    workers,
    progress: ({ spent, budget, pool }) => {
      first ??= Date.now();
      last = { spent, pool };
      appendFileSync(progressOut, `${JSON.stringify({ t: Date.now(), s: (Date.now() - started) / 1000, spent, budget, pool })}\n`);
    },
  },
);
const end = Date.now();
const summary =
  result.kind === "oracle_line"
    ? { kind: "oracle_line", turns: result.oracleLine.steps.length, oursLeft: result.oracleLine.steps.at(-1)?.checkpoint.ours.filter(m => m.hp > 0).length }
    : { kind: "no_answer", message: result.message };
console.log(
  JSON.stringify({
    fight: file.split("/").at(-1),
    mode: mode(),
    patch: process.env.PATCH ? process.env.PATCH.split(",").map(p => p.split("/").at(-1)).join(",") : null,
    load1: [...load1, loadavg()[0]],
    budgetPerBeam: process.env.BUDGET ?? null,
    workers,
    ...summary,
    totalS: (end - started) / 1000,
    bootS: first === null ? null : (first - started) / 1000,
    expansions: last.spent,
    pool: last.pool,
  }),
);
if (result.kind === "oracle_line") appendFileSync(progressOut, `${JSON.stringify({ line: result.oracleLine.steps.map(s => s.input) })}\n`);
