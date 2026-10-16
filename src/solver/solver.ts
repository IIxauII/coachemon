import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { augmentedExport } from "./extras.ts";
import { refuse } from "./gate.ts";
import type { Budget, Recheck, SolveInput } from "./input.ts";
import { noAnswer } from "./no-answer.ts";
import type { Input, NoAnswer, SolveResult } from "./oracle-line.ts";
import { type Clone, replay } from "./replay.ts";
import { type Progress, search } from "./search.ts";
import { type Checks, startWorker, type Worker } from "./worker.ts";

export type * from "./input.ts";
export type * from "./oracle-line.ts";
export { type Clone, type CloneRun, replay } from "./replay.ts";
export { type Known, readScript, type Script } from "./script.ts";
export type { Progress } from "./search.ts";
export type { Checks, Miss } from "./worker.ts";

export const DEFAULT_BUDGET: Budget = { expansions: 3000, turns: 40 };

const RECHECK: Recheck | null = "recheck" in reviewed ? (reviewed.recheck as Recheck) : null;

export type SolveDeps = {
  clone: Clone;
  progress?: (progress: Progress) => void;
  /** The dev's `oracle:battle --unchecked`: solve on a version the re-check hasn't passed. Never a player's (#665). */
  unchecked?: boolean;
};

export async function solve(input: SolveInput, { clone, progress, unchecked = false }: SolveDeps): Promise<SolveResult> {
  const refused = refuse(input, unchecked ? passed(input.cloneVersion) : RECHECK);
  if (refused) return refused;
  const loaded = await replay(input, { inputs: [] }, clone);
  if (loaded.kind === "no_answer") return loaded;

  return withWorker(clone, input, async worker => {
    const searched = await search({
      root: worker.root,
      pool: worker,
      validate: inputs => replay(input, { inputs: [...inputs] }, clone),
      budget: input.budget,
      progress,
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
): Promise<CheckResult> {
  // The checks are what the harness re-check runs (#665), so they can't wait on one having passed.
  const refused = refuse(given, passed(given.cloneVersion));
  if (refused) return refused;
  return withWorker(clone, given, async worker => {
    try {
      return { kind: "checked", checks: await worker.check(inputs) };
    } catch (e) {
      return noAnswer({ code: "harness_failed", why: e instanceof Error ? e.message : String(e) });
    }
  });
}

const passed = (gameVersion: string): Recheck => ({ gameVersion });

async function withWorker<T>(
  clone: Clone,
  given: Pick<SolveInput, "save" | "extras" | "cloneVersion">,
  use: (worker: Worker) => Promise<T>,
): Promise<T | NoAnswer> {
  const { save, cloneVersion } = given;
  const worker = await startWorker(clone, save, augmentedExport(given)?.forkPoint);
  if ("missing" in worker) return noAnswer({ code: "no_clone", version: cloneVersion, cause: worker.missing });
  if ("failed" in worker) return noAnswer({ code: "harness_failed", why: worker.failed });
  try {
    return await use(worker);
  } finally {
    await worker.close();
  }
}
