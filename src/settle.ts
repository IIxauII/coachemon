/**
 * The settle loop (#3, #6, #14, #19, #23). Its budget bounds a tool call, never the run: `timed_out` is not fatal
 * (v1-tool-surface.md §3).
 */
import type { PredicateRead } from "./game/port.ts";

export const POLL_MS = 100;
export const AGREE = 3;
/**
 * Some presses legitimately leave the fine fingerprint in place, as three identical level-up messages do
 * (v1-tool-surface.md §6.8).
 */
export const CHANGE_GRACE_MS = 3_000;
/** Starts progress notifications; not a return point. */
export const NO_PROGRESS_NOTICE_MS = 6_000;
/**
 * The only return point, shared by every settle in one tool call (#34). Must stay below the client's hard limit and its
 * 120 s auto-background (#20).
 */
export const CALL_BUDGET_MS = 30_000;
/** Beyond any stall observed on a healthy game; a label, not a verdict (#14). */
export const BEYOND_OBSERVED_MS = 90_000;

export type SettleDeps = {
  poll: () => Promise<PredicateRead>;
  onPoll?: (read: PredicateRead, t: number) => void;
  onStall?: (stallMs: number, reason: string) => void;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number;
};

export type SettleResult = {
  settled: boolean;
  last: PredicateRead | null;
  reason: string;
  elapsedMs: number;
  /** Time since the fine fingerprint last changed. */
  stallMs: number;
  polls: number;
  /** Whether the fingerprint ever left its pre-press value. `null` when there was no pre-press value. */
  fpMoved: boolean | null;
  loopFrozen: boolean;
  aborted: boolean;
};

export async function settle(deps: SettleDeps, preFp: string | null): Promise<SettleResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const budget = deps.budgetMs ?? CALL_BUDGET_MS;
  const start = now();
  let lastFp: string | null = null;
  let lastChange = start;
  let agree = 0;
  let polls = 0;
  let fpMoved: boolean | null = preFp === null ? null : false;
  let lastFrame: number | null = null;
  let frozenPolls = 0;
  let last: PredicateRead | null = null;
  let reason = "unpolled";
  let lastNotice = 0;

  for (;;) {
    const t = now();
    const read = await deps.poll();
    polls++;
    last = read;
    deps.onPoll?.(read, t);

    // Frame delta: a loop that has not advanced across two polls is frozen, whatever the predicate says (#23).
    const frame = read.frame;
    if (frame !== null && lastFrame !== null && frame === lastFrame) frozenPolls++;
    else frozenPolls = 0;
    lastFrame = frame;
    const loopFrozen = frozenPolls >= 1;

    if (!read.ready) {
      // A locator failure mid-settle is a busy reason, never a throw: `reset(true)` re-runs `launchBattle` (#14).
      agree = 0;
      reason = `scene-unavailable: ${read.why}`;
    } else {
      if (read.fine !== lastFp) {
        lastFp = read.fine;
        lastChange = t;
        agree = 0;
      }
      if (preFp !== null && read.fine !== preFp) fpMoved = true;
      agree = read.settled && !loopFrozen ? agree + 1 : 0;
      reason = loopFrozen ? "loop-frozen" : read.reason;
      const moved = preFp === null || fpMoved === true || t - start > CHANGE_GRACE_MS;
      if (agree >= AGREE && moved) {
        return { settled: true, last: read, reason, elapsedMs: now() - start, stallMs: now() - lastChange, polls, fpMoved, loopFrozen: false, aborted: false };
      }
    }

    const elapsed = now() - start;
    const stall = now() - lastChange;
    if (stall >= NO_PROGRESS_NOTICE_MS && now() - lastNotice >= 1_000) {
      lastNotice = now();
      deps.onStall?.(stall, reason);
    }
    const aborted = deps.signal?.aborted === true;
    if (elapsed >= budget || aborted) {
      return { settled: false, last, reason, elapsedMs: elapsed, stallMs: stall, polls, fpMoved, loopFrozen, aborted };
    }
    await sleep(POLL_MS);
  }
}
