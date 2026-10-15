import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { refuse } from "./gate.ts";
import type { Budget, Recheck, SolveInput } from "./input.ts";
import { noAnswer } from "./no-answer.ts";
import type { Input, NoAnswer, SolveResult } from "./oracle-line.ts";
import { type Clone, replay } from "./replay.ts";
import { type Progress, search } from "./search.ts";
import { type Checks, type NotStarted, startWorker } from "./worker.ts";

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
  const refused = refuse(input, unchecked ? { gameVersion: input.cloneVersion } : RECHECK);
  if (refused) return refused;
  // Validation steps 1–4 hold for every path or for none, so a broken harness says so before the search, not after it.
  const before = await replay(input, { inputs: [] }, clone);
  if (before.kind === "no_answer") return before;

  const worker = await startWorker(clone, input.save);
  if (!("root" in worker)) return notStarted(worker, input.cloneVersion);
  try {
    const found = await search({
      root: worker.root,
      pool: worker,
      validate: inputs => replay(input, { inputs: [...inputs] }, clone),
      budget: input.budget,
      progress,
    });
    if (found.kind === "no_answer") return found;
    const { steps, receipt } = found.replay;
    return {
      kind: "oracle_line",
      oracleLine: { seed: input.save.seed, wave: input.save.waveIndex, gameVersion: input.cloneVersion, steps, receipt, luck: [] },
    };
  } finally {
    await worker.close();
  }
}

/**
 * The fork check and the chained-restore check on a line from the wave-start save: the harness plumbing a search
 * forks through, which a straight replay never exercises (#655).
 */
export async function checkForks(
  given: Pick<SolveInput, "save" | "extras" | "cloneVersion">,
  inputs: readonly Input[],
  clone: Clone,
): Promise<{ kind: "checked"; checks: Checks } | NoAnswer> {
  // The checks are what the harness re-check runs (#665), so they can't wait on one having passed.
  const refused = refuse(given, { gameVersion: given.cloneVersion });
  if (refused) return refused;
  if (given.extras) return noAnswer({ code: "not_wave_start" });
  const worker = await startWorker(clone, given.save);
  if (!("root" in worker)) return notStarted(worker, given.cloneVersion);
  try {
    return { kind: "checked", checks: await worker.check(inputs) };
  } catch (e) {
    return noAnswer({ code: "harness_failed", why: e instanceof Error ? e.message : String(e) });
  } finally {
    await worker.close();
  }
}

const notStarted = (worker: NotStarted, version: string) =>
  "missing" in worker
    ? noAnswer({ code: "no_clone", version, cause: worker.missing })
    : noAnswer({ code: "harness_failed", why: worker.failed });
