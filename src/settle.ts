/**
 * The settle loop (#3, #6, #14, #19, #23).
 *
 * Polls the predicate every 100 ms until the game reports settled for three
 * consecutive samples *and* the fine fingerprint has left its pre-press value
 * (or the change grace has elapsed — some presses legitimately leave it in
 * place, e.g. three identical level-up messages). There is no fatal clock: a
 * settle budget bounds the tool call, never the run. Past the notice
 * threshold the caller is told to send progress; past the call budget the
 * loop returns `timed_out` with a diagnostic, and the next call that presses
 * nothing resumes the wait.
 *
 * A frozen Phaser loop (hidden page without focus emulation, #19/#23) is read
 * as a frame delta of zero across two polls: busy reason `loop-frozen`,
 * outranking whatever the predicate says.
 */
import type { Discriminators } from "./screen.ts";

export const POLL_MS = 100;
export const AGREE = 3;
/** How long to insist the fingerprint leave its pre-press value before accepting an unmoved settle. */
export const CHANGE_GRACE_MS = 3_000;
/** After this much stall the call starts progress notifications; not a return point. */
export const NO_PROGRESS_NOTICE_MS = 6_000;
/** The only return point. Must stay below the client's hard limit and its 120 s auto-background (#20). */
export const CALL_BUDGET_MS = 30_000;
/** Cumulative stall beyond anything observed on a healthy game; a label, not a verdict (#14). */
export const BEYOND_OBSERVED_MS = 90_000;

export type PredicateRead =
  | { ready: false; why: string; frame: number | null; domMode: string | null }
  | {
      ready: true;
      settled: boolean;
      reason: string;
      mode: number;
      phaseName: string | null;
      wave: number | null;
      turn: number | null;
      runLive: boolean;
      tutorialActive: boolean;
      handler: string | null;
      cursor: number | null;
      modeChain: number[];
      messageText: string | null;
      onActionInput: boolean;
      awaitingActionInput: boolean;
      fine: string;
      frame: number | null;
      domMode: string | null;
      gameVersion: string | null;
      disc: Discriminators;
    };

export type Ready = Extract<PredicateRead, { ready: true }>;

export type SettleDeps = {
  poll: () => Promise<PredicateRead | { __throw: string }>;
  /** Every poll, for the hang watch and the phase latch. */
  onPoll?: (read: PredicateRead | null, t: number) => void;
  /** Fired once the stall passes the notice threshold, then about once a second. */
  onStall?: (stallMs: number, reason: string) => void;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number;
};

export type SettleResult = {
  settled: boolean;
  /** The last read, ready or not. */
  last: PredicateRead | null;
  /** Last busy reason seen (or `menu-open`/`awaiting-action` when settled). */
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
    const raw = await deps.poll();
    polls++;
    let read: PredicateRead | null;
    if ("__throw" in raw) {
      read = null;
      reason = `evaluate-threw: ${raw.__throw}`;
    } else {
      read = raw;
      last = raw;
    }
    deps.onPoll?.(read, t);

    // Frame delta: a loop that has not advanced across two polls is frozen, whatever the predicate says (#23).
    const frame = read?.frame ?? null;
    if (frame !== null && lastFrame !== null && frame === lastFrame) frozenPolls++;
    else frozenPolls = 0;
    lastFrame = frame;
    const loopFrozen = frozenPolls >= 1;

    if (read === null) {
      agree = 0;
    } else if (!read.ready) {
      // #14: locator failure during a settle is a busy reason, never a thrown error (reset(true) re-runs launchBattle).
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
