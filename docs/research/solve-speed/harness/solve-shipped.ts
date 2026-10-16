// The shipped `solve()` on one fight, as a player's plugin runs it (the bounded pool, the portfolio, the budget), with
// every progress event timed. Prints one JSON summary line last.
// usage: [BUDGET=<expansions per beam>] node solve-shipped.ts <export.json> <clone-dir> <progress.jsonl> [workers]
import { appendFileSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { findClone, harnessIn } from "../../../../scripts/clone-test/clone-test.ts";
import { PINNED_GAME_VERSION } from "../../../../src/escape-ladder/lookup.ts";
import { poolSize } from "../../../../src/solver/pool.ts";
import { DEFAULT_BUDGET, solve } from "../../../../src/solver/solver.ts";

const [file, cloneDir, progressOut, workersArg] = process.argv.slice(2);
const json = JSON.parse(readFileSync(file, "utf8"));
const exported = "save" in json ? json : { save: json };
const workers = workersArg ? Number(workersArg) : poolSize(availableParallelism());
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
    clone: harnessIn(() => findClone(cloneDir)),
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
    fight: file,
    workers,
    cores: availableParallelism(),
    ...summary,
    totalS: (end - started) / 1000,
    bootS: first === null ? null : (first - started) / 1000,
    expansions: last.spent,
    pool: last.pool,
  }),
);
if (result.kind === "oracle_line") appendFileSync(progressOut, `${JSON.stringify({ line: result.oracleLine.steps.map(s => s.input) })}\n`);
