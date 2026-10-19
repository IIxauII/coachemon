import { availableParallelism } from "node:os";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { augmentedExport } from "./extras.ts";
import { type Carry, carryOf, refuse } from "./gate.ts";
import type { Budget, Recheck, SolveInput } from "./input.ts";
import type { Lease } from "./fight-pool.ts";
import { noAnswer, Unanswered } from "./no-answer.ts";
import type { Input, NoAnswer, Reason, SolveResult } from "./oracle-line.ts";
import { type Clone, replay } from "./replay.ts";
import { isPool, type PoolStats, poolSize, startPool, type WorkerPool } from "./pool.ts";
import { search, type Progress as Spent } from "./search.ts";
import { type Checks, type NotStarted, startWorker, type Worker } from "./worker.ts";

export type * from "./input.ts";
export type * from "./oracle-line.ts";
export { type Clone, type CloneRun, replay } from "./replay.ts";
export { type Known, readScript, type Script } from "./script.ts";
export { type PoolStats, slowWorkersNote } from "./pool.ts";

export type Progress = Spent & { pool: PoolStats };
export type { Checks, Miss } from "./worker.ts";

export const DEFAULT_BUDGET: Budget = { expansions: 3000, turns: 40 };

const RECHECK: Recheck | null = "recheck" in reviewed ? (reviewed.recheck as Recheck) : null;

/** The refusal gate `solve` opens with. */
export const gate = (input: Pick<SolveInput, "save" | "extras" | "liveExport" | "cloneVersion">): NoAnswer | null =>
  refuse(input, RECHECK, carryOf(input));

export type SolveDeps = {
  clone: Clone;
  progress?: (progress: Progress) => void;
  /** The dev's `oracle:battle --unchecked`: solve on a version the re-check hasn't passed. Never a player's (#665). */
  unchecked?: boolean;
  /** The pool's size, sized for the machine unless given. */
  workers?: number;
  /**
   * Where the search's pool comes from, `start` starting one on the clone it is given: by default a pool started for
   * this solve and closed after it, else one kept warm for the fight (#677).
   */
  pools?: (start: (clone: Clone) => Promise<WorkerPool | NotStarted>) => Promise<Lease | NotStarted>;
  /** The solve's own: once it aborts, its jobs still queued on a pool the fight keeps warm end (#677). */
  signal?: AbortSignal;
};

const BROKE_THE_POOL: ReadonlySet<Reason["code"]> = new Set(["no_clone", "workers_died", "harness_failed"]);

export async function solve(
  input: SolveInput,
  { clone, progress, unchecked = false, workers = poolSize(availableParallelism()), pools = start => ownPool(start(clone)), signal }: SolveDeps,
): Promise<SolveResult> {
  const carry = carryOf(input);
  const refused = refuse(input, unchecked ? passed(input.cloneVersion) : RECHECK, carry);
  if (refused) return refused;
  const loaded = await replay(input, { inputs: [] }, clone, carry);
  if (loaded.kind === "no_answer") return loaded;

  const at = augmentedExport(input)?.forkPoint;
  const leased = await pools(on => startPool(workers, () => startWorker(on, input.save, at), input.cloneVersion));
  if (!("pool" in leased)) return notStarted(leased, input.cloneVersion);
  const { pool, warm } = leased;
  let broken = false;
  const unanswered = (answer: NoAnswer) => {
    // A cancelled solve's jobs end as failures of its own, never of the pool's.
    broken = !signal?.aborted && BROKE_THE_POOL.has(answer.reason.code);
    return answer;
  };
  try {
    const root = warm ? await pool.rootAt(input.save, at, signal) : pool.root;
    const searched = await search({
      root,
      pool: { size: pool.size, expand: (forkPoint, inputs) => pool.expand(forkPoint, inputs, signal) },
      validate: inputs => replay(input, { inputs: [...inputs] }, clone, carry),
      budget: input.budget,
      progress: spent => progress?.({ ...spent, pool: pool.stats() }),
    });
    if (searched.kind === "no_answer") return unanswered(searched);
    const { steps, receipt, luck } = searched.replay;
    return {
      kind: "oracle_line",
      oracleLine: { seed: input.save.seed, wave: input.save.waveIndex, gameVersion: input.cloneVersion, steps, receipt, luck },
    };
  } catch (e) {
    return unanswered(e instanceof Unanswered ? e.answer : noAnswer({ code: "harness_failed", why: e instanceof Error ? e.message : String(e) }));
  } finally {
    await leased.done(broken);
  }
}

async function ownPool(starting: Promise<WorkerPool | NotStarted>): Promise<Lease | NotStarted> {
  const started = await starting;
  if (!isPool(started)) return started;
  return { pool: started, warm: false, done: () => started.close() };
}

function notStarted(started: NotStarted, version: string): NoAnswer {
  if ("missing" in started) return noAnswer({ code: "no_clone", version, cause: started.missing });
  return noAnswer({ code: "harness_failed", why: started.failed });
}

export type CheckResult = { kind: "checked"; checks: Checks } | NoAnswer;

export async function checkForks(
  given: Pick<SolveInput, "save" | "extras" | "liveExport" | "cloneVersion">,
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
  if ("missing" in started || "failed" in started) return notStarted(started, version);
  try {
    return await use(started);
  } finally {
    await started.close();
  }
}
