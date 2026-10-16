import { availableParallelism } from "node:os";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { augmentedExport } from "./extras.ts";
import { type Carry, refuse } from "./gate.ts";
import type { Budget, Recheck, SolveInput } from "./input.ts";
import { noAnswer } from "./no-answer.ts";
import type { Input, NoAnswer, SolveResult } from "./oracle-line.ts";
import { type Clone, replay } from "./replay.ts";
import { type PoolStats, poolSize, startPool, type WorkerPool } from "./pool.ts";
import { search, type Progress as Spent } from "./search.ts";
import { type Checks, type NotStarted, startWorker, type Worker } from "./worker.ts";

export type * from "./input.ts";
export type * from "./oracle-line.ts";
export { type Clone, type CloneRun, replay } from "./replay.ts";
export { type Known, readScript, type Script } from "./script.ts";
export type { PoolStats } from "./pool.ts";

export type Progress = Spent & { pool: PoolStats };
export type { Checks, Miss } from "./worker.ts";

export const DEFAULT_BUDGET: Budget = { expansions: 3000, turns: 40 };

const RECHECK: Recheck | null = "recheck" in reviewed ? (reviewed.recheck as Recheck) : null;

/** The refusal gate `solve` opens with. */
export const gate = (input: Pick<SolveInput, "save" | "extras" | "cloneVersion">): NoAnswer | null => refuse(input, RECHECK);

export type SolveDeps = {
  clone: Clone;
  progress?: (progress: Progress) => void;
  /** The dev's `oracle:battle --unchecked`: solve on a version the re-check hasn't passed. Never a player's (#665). */
  unchecked?: boolean;
  /** The pool's size, sized for the machine unless given. */
  workers?: number;
};

export async function solve(
  input: SolveInput,
  { clone, progress, unchecked = false, workers = poolSize(availableParallelism()) }: SolveDeps,
): Promise<SolveResult> {
  const refused = refuse(input, unchecked ? passed(input.cloneVersion) : RECHECK);
  if (refused) return refused;
  const loaded = await replay(input, { inputs: [] }, clone);
  if (loaded.kind === "no_answer") return loaded;

  const at = augmentedExport(input)?.forkPoint;
  const started = await startPool(workers, () => startWorker(clone, input.save, at), input.cloneVersion);
  return withStarted<WorkerPool, SolveResult>(started, input.cloneVersion, async pool => {
    const searched = await search({
      root: pool.root,
      pool,
      validate: inputs => replay(input, { inputs: [...inputs] }, clone),
      budget: input.budget,
      progress: spent => progress?.({ ...spent, pool: pool.stats() }),
    });
    if (searched.kind === "no_answer") return searched;
    const { steps, receipt, luck } = searched.replay;
    return {
      kind: "oracle_line",
      oracleLine: { seed: input.save.seed, wave: input.save.waveIndex, gameVersion: input.cloneVersion, steps, receipt, luck },
    };
  });
}

export type CheckResult = { kind: "checked"; checks: Checks } | NoAnswer;

export async function checkForks(
  given: Pick<SolveInput, "save" | "extras" | "cloneVersion">,
  inputs: readonly Input[],
  clone: Clone,
  carry: Carry = {},
): Promise<CheckResult> {
  // The checks are what the harness re-check runs (#665), so they can't wait on one having passed.
  const refused = refuse(given, passed(given.cloneVersion), carry);
  if (refused) return refused;
  return withStarted(await startWorker(clone, given.save, augmentedExport(given)?.forkPoint), given.cloneVersion, async worker => {
    try {
      return { kind: "checked", checks: await worker.check(inputs) };
    } catch (e) {
      return noAnswer({ code: "harness_failed", why: e instanceof Error ? e.message : String(e) });
    }
  });
}

const passed = (gameVersion: string): Recheck => ({ gameVersion });

async function withStarted<W extends Worker | WorkerPool, T>(
  started: W | NotStarted,
  version: string,
  use: (worker: W) => Promise<T>,
): Promise<T | NoAnswer> {
  if ("missing" in started) return noAnswer({ code: "no_clone", version, cause: started.missing });
  if ("failed" in started) return noAnswer({ code: "harness_failed", why: started.failed });
  try {
    return await use(started);
  } finally {
    await started.close();
  }
}
