import { availableParallelism } from "node:os";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { augmentedExport } from "./extras.ts";
import { type Carry, carryOf, refuse } from "./gate.ts";
import type { Budget, Recheck, SolveInput } from "./input.ts";
import type { Lease } from "./fight-pool.ts";
import { noAnswer, Unanswered } from "./no-answer.ts";
import type { Input, NoAnswer, Reason, SolveResult } from "./oracle-line.ts";
import { type Clone, replay } from "./replay.ts";
import { isPool, type PoolStats, poolSize, startPool, type TurnTimes, type WorkerPool } from "./pool.ts";
import { type Position, search, type SearchStatistics, type Progress as Spent } from "./search.ts";
import { type Checks, type NotStarted, startWorker, type Worker } from "./worker.ts";

export type * from "./input.ts";
export type * from "./oracle-line.ts";
export { type Clone, type CloneRun, replay } from "./replay.ts";
export { type Known, readScript, type Script } from "./script.ts";
export { type PoolStats, slowWorkersNote, type Spread, type TurnTimes } from "./pool.ts";

export type Progress = Spent & { pool: PoolStats };
export type { Checks, Miss } from "./worker.ts";

/**
 * What a solve spent before its search, and the pool it searched on (#942), each part filled in as its stage ends: `null`
 * is a stage the solve never reached, or one still going when a cancel reads it. `startup.pool` runs from asking for the
 * pool to the search's first position on it, so a warm one's is rooting this solve's start on it; `pool` is the pool's
 * own stats as it was handed back, and `turnTimes` the turns this solve's jobs played on it (#943). `search` is how the
 * search went (#940), absent until it has ended.
 */
export type SolveReport = {
  startup: { gateMs: number; loadMs: number | null; pool: { warm: boolean; ms: number } | null };
  pool: PoolStats | null;
  turnTimes: TurnTimes | null;
  cores: number;
  search?: SearchStatistics;
};

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
  clock?: { now(): number };
  /** The machine's, unless given. */
  cores?: number;
  /** Handed the solve's report once, as it starts; the solve fills it in as it goes. */
  statistics?: (report: SolveReport) => void;
};

const CLOCK = { now: () => performance.now() };

const BROKE_THE_POOL: ReadonlySet<Reason["code"]> = new Set(["no_clone", "workers_died", "harness_failed"]);

export async function solve(input: SolveInput, deps: SolveDeps): Promise<SolveResult> {
  const { clock = CLOCK, cores = availableParallelism() } = deps;
  const report: SolveReport = { startup: { gateMs: 0, loadMs: null, pool: null }, pool: null, turnTimes: null, cores };
  deps.statistics?.(report);
  return solving(input, { ...deps, workers: deps.workers ?? poolSize(cores) }, report, clock);
}

async function solving(
  input: SolveInput,
  { clone, progress, unchecked = false, workers, pools = start => ownPool(start(clone)), signal }: SolveDeps & { workers: number },
  report: SolveReport,
  clock: { now(): number },
): Promise<SolveResult> {
  const since = (start: number) => Math.round(clock.now() - start);
  const carry = carryOf(input);
  let start = clock.now();
  const refused = refuse(input, unchecked ? passed(input.cloneVersion) : RECHECK, carry);
  report.startup.gateMs = since(start);
  if (refused) return refused;
  start = clock.now();
  const loaded = await replay(input, { inputs: [] }, clone, carry).finally(() => (report.startup.loadMs = since(start)));
  if (loaded.kind === "no_answer") return loaded;

  const at = augmentedExport(input)?.forkPoint;
  start = clock.now();
  const leased = await pools(on => startPool(workers, () => startWorker(on, input.save, at), input.cloneVersion));
  if (!("pool" in leased)) {
    report.startup.pool = { warm: false, ms: since(start) };
    return notStarted(leased, input.cloneVersion);
  }
  const { pool, warm } = leased;
  let broken = false;
  const unanswered = (answer: NoAnswer) => {
    // A cancelled solve's jobs end as failures of its own, never of the pool's.
    broken = !signal?.aborted && BROKE_THE_POOL.has(answer.reason.code);
    return answer;
  };
  try {
    let root: Position;
    try {
      root = warm ? await pool.rootAt(input.save, at, signal) : pool.root;
    } finally {
      report.startup.pool = { warm, ms: since(start) };
    }
    const searched = await search({
      root,
      pool: { size: pool.size, expand: (forkPoint, inputs) => pool.expand(forkPoint, inputs, signal) },
      validate: inputs => replay(input, { inputs: [...inputs] }, clone, carry),
      budget: input.budget,
      lds: input.lds,
      portfolio: input.portfolio,
      progress: spent => progress?.({ ...spent, pool: pool.stats() }),
      statistics: statistics => (report.search = statistics),
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
    report.pool = pool.stats();
    report.turnTimes = pool.turnTimes(signal);
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
