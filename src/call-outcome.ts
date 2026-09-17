/**
 * Call outcomes (#126): what status and diagnostic a tool call returns, decided over the whole call.
 *
 * One instance per Driver owns everything that lives across calls and decides a status: the run latch, the stall
 * counts, the hang watch, the stuck detector and the menu-action-in-flight flag. It is fed every settle poll, the
 * call's opening settle, the moment before its first press and how the call ended — settled, out of time or refused —
 * and answers all three the same way. The Driver keeps presentation: payload, notes and hints.
 *
 * Ordering is part of the interface: `waited` → `pressing` (only if anything is pressed) → `end`, exactly one `end`
 * per call. An acting call whose opening settle times out never pressed, so it ends as a `read`.
 *
 * ADR-0002: the module derives the Progress fingerprint from `Ready` reads itself. The fine fingerprint arrives only
 * inside a `SettleResult` and is copied into the diagnostic, never compared.
 */
import { UiMode } from "./enums/generated.ts";
import type { Diagnostic, Status } from "./envelope.ts";
import type { PredicateRead, Ready } from "./game/port.ts";
import { modeName, screenId } from "./screen.ts";
import { BEYOND_OBSERVED_MS, type SettleResult } from "./settle.ts";
import { progressFingerprint, StuckDetector, type Choice, type StuckReport } from "./stuck/detector.ts";
import { HangWatch } from "./stuck/hang.ts";

/** What happened to the run beats what the screen is doing, and both beat the clock. */
const RANK: Record<Status, number> = { ok: 0, timed_out: 1, stuck: 2, run_over: 3, run_interrupted: 4 };

export function worst(...statuses: Status[]): Status {
  return statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "ok");
}

export type RunState = "live" | "over" | "interrupted" | "none";

export type Escape = Pick<StuckReport, "verdict" | "untried" | "tried" | "ladder" | "cycle">;

export type Outcome = { status: Status; diagnostic?: Diagnostic; escape?: Escape };

export type CallEnd =
  /** Pressed nothing: its settle is the opening one. */
  | { kind: "read"; settle: SettleResult; options: string[] | null }
  /** Pressed, and returned a result: `settle` is the last one. */
  | { kind: "acting"; pre: Ready; choice: Choice; settle: SettleResult; options: string[] | null }
  /** Threw. `settle` is the call's last settle, or `null` when it never settled anything. */
  | { kind: "refused"; pre: Ready | null; choice: Choice | null; settle: SettleResult | null };

type Latch = { sawRun: boolean; gameOver: boolean; interrupted: boolean };
type StallCounts = { resumeCount: number; cumulativeMs: number };

const NO_RUN: Latch = { sawRun: false, gameOver: false, interrupted: false };
const NO_STALL: StallCounts = { resumeCount: 0, cumulativeMs: 0 };

export class CallOutcomes {
  readonly #detector = new StuckDetector();
  readonly #hang = new HangWatch();
  #latch: Latch = NO_RUN;
  /** The wait in progress: whether the game has settled since the last call that ran out of time, and its counts. */
  #wait = { pending: false, ...NO_STALL };
  #menuActionInFlight = false;

  // Per call, cleared by `end`.
  #opening: SettleResult | null = null;
  #pressedOn: Ready | null = null;
  /** The counts this call's diagnostic reports: the wait its last settle belongs to. */
  #counts: StallCounts = NO_STALL;

  /** Every settle poll: the run latch and the hang watch. */
  poll(read: PredicateRead, t: number): void {
    if (!read.ready) {
      this.#hang.poll(null);
      return;
    }
    this.#hang.poll({ t, mode: read.mode, phaseName: read.phaseName, onActionInput: read.onActionInput });
    if (read.runLive && !this.#latch.sawRun) this.#latch = { ...NO_RUN, sawRun: true };
    if (read.phaseName === "GameOverPhase") this.#latch = { ...this.#latch, gameOver: true };
    if (read.phaseName === "LoginPhase" && this.#latch.sawRun && !this.#latch.gameOver && !this.#menuActionInFlight) {
      // #11: LoginPhase mid-session with no GameOverPhase and no menu action in flight ⇒ reset(true), the save failed.
      this.#latch = { ...this.#latch, interrupted: true };
    }
    // Back at the title: whatever ended the run has been latched by now.
    if (read.mode === UiMode.TITLE && read.settled) this.#latch = { ...this.#latch, sawRun: false };
  }

  /** The page threw an unhandled rejection: corroborates a save hang. */
  rejection(t: number): void {
    this.#hang.unhandledRejection(t);
  }

  /** The call's opening settle. If the last call ran out of time, this is a resume. */
  waited(s: SettleResult): void {
    this.#opening = s;
    if (this.#wait.pending) {
      this.#wait.resumeCount++;
      this.#wait.cumulativeMs += s.stallMs;
    }
    this.#counts = { resumeCount: this.#wait.resumeCount, cumulativeMs: this.#wait.cumulativeMs };
    if (!s.settled) return;
    this.#wait = { pending: false, ...NO_STALL };
    // A settled read completes a timed-out decision still pending, so it carries weight even on an acting call.
    this.#detector.recordRead({ fingerprint: progressOf(s.last as Ready), settled: true });
  }

  /** Just before the call's first press. */
  pressing(p: { menuAction: boolean; on: Ready }): void {
    this.#menuActionInFlight = p.menuAction;
    this.#pressedOn = p.on;
    // The opening settle settled, so whatever this call waits on from here is a new wait.
    this.#counts = NO_STALL;
  }

  /** `start_run` is starting a run: nothing from before it applies. */
  newRun(): void {
    this.#detector.reset();
    this.#latch = NO_RUN;
  }

  runState(read: Ready | null): RunState {
    if (this.#latch.interrupted) return "interrupted";
    if (read?.runLive) return "live";
    if (this.#latch.gameOver) return "over";
    return "none";
  }

  /** Exactly once per call, however it ended. */
  end(e: CallEnd): Outcome {
    if (e.kind === "acting") {
      this.#recordActing(e.pre, e.choice, e.settle);
    } else if (e.kind === "refused" && this.#pressedOn !== null && e.choice !== null) {
      // The opening settle came before the press: without a settle after it, the decision waits for the next read.
      this.#recordActing(e.pre ?? this.#pressedOn, e.choice, e.settle === this.#opening ? null : e.settle);
    }
    // A deliberate choice that takes the game off the title (Continue, Load Game, New Game) is the human's answer to
    // run_interrupted. A press that leaves it on TITLE, or a call refused there, is not.
    const after = e.settle !== null && e.settle !== this.#opening && e.settle.last?.ready ? e.settle.last : null;
    if (this.#latch.interrupted && this.#pressedOn?.mode === UiMode.TITLE && after !== null && after.mode !== UiMode.TITLE) {
      this.#latch = NO_RUN;
    }
    const outcome = this.#judge(e.settle, e.kind === "refused" ? null : e.options);

    if (e.settle !== null) this.#wait = e.settle.settled ? { pending: false, ...NO_STALL } : { ...this.#wait, pending: true };
    this.#menuActionInFlight = false;
    this.#opening = null;
    this.#pressedOn = null;
    this.#counts = NO_STALL;
    return outcome;
  }

  #recordActing(pre: Ready, choice: Choice, after: SettleResult | null): void {
    const before = progressOf(pre);
    const read = after?.settled && after.last?.ready ? after.last : null;
    this.#detector.recordActing({
      screen: screenId(pre.mode, pre.disc),
      before: { fingerprint: before, settled: true },
      after: { fingerprint: read ? progressOf(read) : before, settled: read !== null },
      choice,
      tutorialActive: pre.tutorialActive,
    });
  }

  /** Every status that applies, in precedence order within a rank; the worst rank wins, the first of it reports. */
  #judge(s: SettleResult | null, options: string[] | null): Outcome {
    const last = s?.last?.ready ? s.last : null;
    const diagnostic = (reason: string, more: Partial<Diagnostic> = {}): Diagnostic | undefined =>
      s === null ? undefined : { ...this.#diagnostic(s), reason, ...more };
    const found: Outcome[] = [];

    const hang = this.#hang.assess();
    if (hang.status === "run_interrupted") {
      found.push({ status: "run_interrupted", diagnostic: diagnostic("save-hang", { cause: hang.cause, hang: hang.hang }) });
    }
    if (this.#latch.interrupted) {
      found.push({ status: "run_interrupted", diagnostic: diagnostic("login-phase-mid-session", { cause: "save_failed" }) });
    }
    if (this.#latch.gameOver && !last?.runLive) {
      found.push({ status: "run_over", diagnostic: diagnostic("game-over-phase") });
    }
    if (s !== null && s.settled && last !== null) {
      // Only a settled fingerprint is ever judged stuck.
      const a = this.#detector.assess({
        screen: screenId(last.mode, last.disc),
        fingerprint: progressOf(last),
        settled: true,
        liveVersion: last.gameVersion ?? "",
        tutorialActive: last.tutorialActive,
        options,
      });
      if (a.status === "run_interrupted") {
        found.push({ status: "run_interrupted", diagnostic: diagnostic("ladder-exhausted", { cause: a.cause, stuck: a.stuck }) });
      } else if (a.status === "stuck") {
        const { verdict, untried, tried, ladder, cycle } = a.stuck;
        found.push({ status: "stuck", diagnostic: diagnostic(`stuck:${verdict}`, { stuck: a.stuck }), escape: { verdict, untried, tried, ladder, cycle } });
      }
    } else if (s !== null) {
      found.push({ status: "timed_out", diagnostic: diagnostic(s.reason) });
    }

    const status = worst(...found.map(f => f.status));
    const chosen = found.find(f => f.status === status);
    if (!chosen) return { status };
    return {
      status,
      ...(chosen.diagnostic ? { diagnostic: chosen.diagnostic } : {}),
      ...(chosen.escape ? { escape: chosen.escape } : {}),
    };
  }

  #diagnostic(s: SettleResult): Diagnostic {
    const last = s.last && s.last.ready ? s.last : null;
    return {
      reason: s.reason,
      mode: { int: last?.mode ?? null, name: last ? modeName(last.mode) : null },
      phase_name: last?.phaseName ?? null,
      fingerprint: last?.fine ?? null,
      elapsed_ms: s.elapsedMs,
      stall_ms: s.stallMs,
      fp_moved: s.fpMoved,
      mode_from_dom: s.last?.domMode ?? null,
      resume_count: this.#counts.resumeCount,
      cumulative_stall_ms: this.#counts.cumulativeMs,
      beyond_observed: this.#counts.cumulativeMs + s.stallMs >= BEYOND_OBSERVED_MS,
      loop_frozen: s.loopFrozen,
    };
  }
}

/** The Progress fingerprint (ADR-0002) of a settled read. */
function progressOf(r: Ready): string {
  return progressFingerprint({ phaseName: r.phaseName, mode: r.mode, modeChain: r.modeChain, cursor: r.cursor, messageText: r.messageText, wave: r.wave, turn: r.turn, money: r.money });
}
