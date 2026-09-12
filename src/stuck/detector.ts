/**
 * The stuck detector: fingerprint repetition across decisions (#13, #16).
 *
 * The game is settled, presses land, and the progress fingerprint keeps coming
 * back to where it has already been. Two verdicts come from here — `dead_end`
 * and `loop` — and the third, `hang`, is a positive signature read off the
 * settle loop instead (see `hang.ts`), because a hung game never settles and so
 * never produces a decision this detector could count.
 *
 * The detector reports; it never presses. Claude walks the escape ladder and
 * the detector tracks which rungs are spent.
 */
import { ladderFor, type LadderReport } from "../escape-ladder/lookup.ts";
import type { CancelEffect, Rung, ScreenClass } from "../escape-ladder/types.ts";

/**
 * Samples in the window: the current settled read plus the last 11 decisions.
 * #13: a 2-cycle recurs every second decision and hits 5 inside 12.
 */
export const WINDOW = 12;
/** Repeats of the current fingerprint that make it stuck. #6's worst legitimate repeat is 3; headroom 2. */
export const THRESHOLD = 5;

/**
 * The progress fingerprint: #13's five fields, then the battle clock.
 *
 * The five fields are deliberately coarse: adding `optionsCursor` would split a
 * 3-screen cycle into 3 fingerprints needing 15 decisions to trip, which no
 * longer fits the window.
 *
 * `wave` and `turn` are appended because without them every turn's COMMAND
 * prompt is the same fingerprint, and a battle of five turns is a false `loop`
 * (#16's replay: run5 reached 4 on a healthy wave). They cannot split a stuck
 * cycle — nothing a stuck agent does advances the turn — only real progress.
 */
export function progressFingerprint(read: {
  phaseName: string | null;
  mode: number;
  modeChain: readonly number[];
  cursor: number | null;
  messageText: string | null;
  /** `currentBattle.waveIndex`, `null` outside a run. */
  wave: number | null;
  /** `currentBattle.turn`, `null` outside a run. */
  turn: number | null;
}): string {
  return [
    read.phaseName ?? "",
    read.mode,
    read.modeChain.join("."),
    read.cursor ?? "",
    read.messageText ?? "",
    read.wave ?? "",
    read.turn ?? "",
  ].join("|");
}

/** A fingerprint and whether it was read off a real settle (`false`: sampled off a settle timeout). */
export type Sample = { fingerprint: string; settled: boolean };

/** What an acting call delivered. */
export type Choice =
  | { kind: "option"; label: string }
  | { kind: "button"; button: string }
  | { kind: "modal_button"; index: number }
  /** A planned multi-press sequence such as `start_run`: counted once, never matches a rung. */
  | { kind: "planned"; name: string };

/** One acting tool call, however many presses it took inside (cursor walk, auto-advance). */
export type ActingCall = {
  /** Composite screen id the choice was made on. */
  screen: string;
  /** Read before the press. */
  before: Sample;
  /** Read when the call returned. `settled: false` ⇒ the call returned `timed_out`. */
  after: Sample;
  choice: Choice;
  /** `tutorialActive` when the choice was made: CANCEL is ACTION under a tutorial, so these are not decisions. */
  tutorialActive: boolean;
};

export type AssessContext = {
  screen: string;
  fingerprint: string;
  /** Only a settled state is ever judged. A state sampled off a timeout is `ok` here, whatever the ring says. */
  settled: boolean;
  liveVersion: string;
  tutorialActive: boolean;
  /** Option labels read on the current screen (#4), or `null` when unreadable. */
  options: readonly string[] | null;
};

export type RungState = { rung: Rung; spent: boolean };

export type LadderState = {
  status: LadderReport["status"];
  message: string;
  class?: ScreenClass;
  cancelEffect?: CancelEffect;
  rungs: readonly RungState[];
  /** Index of the first unspent rung, or `null` when there are no rungs. Once exhausted, this is the reload. */
  next: number | null;
  /** Every rung before the reload is spent on this fingerprint. Never true for a suppressed or unknown ladder. */
  exhausted: boolean;
};

export type CycleMember = { fingerprint: string; screen: string; ladder: LadderState };

export type StuckReport = {
  verdict: "dead_end" | "loop";
  fingerprint: string;
  screen: string;
  repeats: number;
  window: number;
  /** A no-escape screen, reported without spending presses to prove it. */
  onSight: boolean;
  /** Distinct choices made on this fingerprint within the window, oldest first. */
  tried: readonly Choice[];
  /** Readable option labels not yet chosen on this fingerprint; `null` when the options are unreadable. */
  untried: readonly string[] | null;
  ladder: LadderState;
  /** `loop` only: the fingerprints the loop passes through, starting here, each with its own ladder. */
  cycle?: readonly CycleMember[];
};

export type Assessment =
  | { status: "ok" }
  | { status: "stuck"; stuck: StuckReport }
  /** The ladder is spent and nothing moved: only the reload remains. #11's `run_interrupted`, never taken automatically. */
  | { status: "run_interrupted"; cause: "ladder_exhausted"; stuck: StuckReport };

type Decision = { screen: string; before: string; after: string; choice: Choice; seq: number };

export class StuckDetector {
  #ring: Decision[] = [];
  #seq = 0;
  /** An acting call that returned `timed_out`, waiting for a resume to settle. */
  #pending: ActingCall | null = null;
  /** Settled reads that pressed nothing, as `{ fingerprint, seq of the last decision before it }`. */
  #reads: { fingerprint: string; seq: number }[] = [];

  /** Every acting call, whatever it returned. Only admissible ones enter the ring. */
  recordActing(call: ActingCall): void {
    this.#pending = null;
    if (!call.before.settled || call.tutorialActive) return;
    if (!call.after.settled) {
      this.#pending = call;
      return;
    }
    this.#admit(call, call.after.fingerprint);
  }

  /**
   * Every reading call that settles (or times out) without pressing. It never
   * ticks the window by itself, but a settled read completes a pending
   * timed-out decision exactly once, and spends a `wait` rung.
   */
  recordRead(sample: Sample): void {
    if (!sample.settled) return;
    if (this.#pending) {
      this.#admit(this.#pending, sample.fingerprint);
      this.#pending = null;
      return;
    }
    this.#reads.push({ fingerprint: sample.fingerprint, seq: this.#seq });
    const oldest = this.#ring[0]?.seq ?? this.#seq;
    this.#reads = this.#reads.filter(r => r.seq >= oldest);
  }

  /**
   * Occurrences of `fingerprint` in the window, counting a settled read of it
   * now: the current read plus the fingerprints the last `WINDOW - 1` decisions
   * were made on. That is the prototype's sampling (`one-wave.mjs:278`), which
   * is what fired live on run3.
   */
  repeatsOf(fingerprint: string): number {
    return this.#ring.filter(d => d.before === fingerprint).length + 1;
  }

  /** Forget everything: a new run, or a reload. */
  reset(): void {
    this.#ring = [];
    this.#reads = [];
    this.#pending = null;
  }

  assess(ctx: AssessContext): Assessment {
    if (!ctx.settled) return { status: "ok" };

    const ladder = this.#ladder(ctx.screen, ctx, ctx.fingerprint, ctx.options);
    const onSight = ladder.class === "no_escape";
    const repeats = this.repeatsOf(ctx.fingerprint);
    if (repeats < THRESHOLD && !onSight) return { status: "ok" };

    const madeHere = this.#ring.filter(d => d.before === ctx.fingerprint);
    const verdict = onSight || (madeHere.length > 0 && madeHere.every(d => d.after === d.before)) ? "dead_end" : "loop";
    const tried = distinct(madeHere.map(d => d.choice));
    const triedLabels = new Set(tried.flatMap(c => (c.kind === "option" ? [c.label] : [])));

    const stuck: StuckReport = {
      verdict,
      fingerprint: ctx.fingerprint,
      screen: ctx.screen,
      repeats,
      window: WINDOW,
      onSight,
      tried,
      untried: ctx.options === null ? null : ctx.options.filter(label => !triedLabels.has(label)),
      ladder,
    };

    let exhausted = ladder.exhausted;
    if (verdict === "loop") {
      stuck.cycle = this.#cycle(ctx).map(({ fingerprint, screen }) => ({
        fingerprint,
        screen,
        ladder: fingerprint === ctx.fingerprint ? ladder : this.#ladder(screen, ctx, fingerprint, null),
      }));
      // A loop moved, so this screen's spent ladder alone proves nothing: every screen in it must be spent.
      exhausted = stuck.cycle.every(m => m.ladder.exhausted);
    }

    return exhausted ? { status: "run_interrupted", cause: "ladder_exhausted", stuck } : { status: "stuck", stuck };
  }

  #admit(call: ActingCall, after: string): void {
    this.#ring.push({ screen: call.screen, before: call.before.fingerprint, after, choice: call.choice, seq: ++this.#seq });
    if (this.#ring.length > WINDOW - 1) this.#ring.shift();
  }

  /** Fingerprints in order of first appearance, from the current fingerprint's first occurrence in the window. */
  #cycle(ctx: AssessContext): { fingerprint: string; screen: string }[] {
    const visited = [...this.#ring.map(d => d.before), ctx.fingerprint];
    const members: string[] = [];
    for (const fp of visited.slice(visited.indexOf(ctx.fingerprint))) if (!members.includes(fp)) members.push(fp);
    return members.map(fingerprint => ({
      fingerprint,
      screen:
        fingerprint === ctx.fingerprint
          ? ctx.screen
          : (this.#ring.findLast(d => d.before === fingerprint)?.screen ?? `UNKNOWN(${fingerprint})`),
    }));
  }

  #ladder(
    screen: string,
    ctx: Pick<AssessContext, "liveVersion" | "tutorialActive">,
    fingerprint: string,
    options: readonly string[] | null,
  ): LadderState {
    const report = ladderFor({ screen, liveVersion: ctx.liveVersion, tutorialActive: ctx.tutorialActive });
    if (report.status !== "ladder") {
      return { status: report.status, message: report.message, rungs: [], next: null, exhausted: false };
    }

    const madeHere = this.#ring.filter(d => d.before === fingerprint);
    const oldest = this.#ring[0]?.seq ?? Infinity;
    const waited = this.#reads.some(r => r.fingerprint === fingerprint && r.seq >= oldest);
    const rungs = report.rungs.map(rung => ({ rung, spent: isSpent(rung, madeHere, options, waited) }));
    const firstUnspent = rungs.findIndex(r => !r.spent);
    const ownRungs = rungs.filter(r => r.rung.do !== "reload");
    return {
      status: "ladder",
      message: report.message,
      class: report.class,
      cancelEffect: report.cancelEffect,
      rungs,
      next: firstUnspent === -1 ? null : firstUnspent,
      // An entry that makes no rung claim (base PARTY, base SAVE_SLOT) is not proof that no input leaves it.
      exhausted: (ownRungs.length > 0 || report.class === "no_escape") && ownRungs.every(r => r.spent),
    };
  }
}

function isSpent(rung: Rung, madeHere: readonly Decision[], options: readonly string[] | null, waited: boolean): boolean {
  switch (rung.do) {
    case "press":
      return madeHere.some(d => d.choice.kind === "button" && d.choice.button === rung.button);
    case "modal_button_action":
      return madeHere.some(d => d.choice.kind === "modal_button" && d.choice.index === rung.index);
    case "select_untried_option": {
      // Unreadable options can never prove every one was tried.
      if (options === null || options.length === 0) return false;
      const tried = new Set(madeHere.flatMap(d => (d.choice.kind === "option" ? [d.choice.label] : [])));
      return options.every(label => tried.has(label));
    }
    case "wait":
      return waited;
    case "reload":
      return false;
  }
}

function distinct(choices: readonly Choice[]): Choice[] {
  const seen = new Set<string>();
  return choices.filter(c => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
