/**
 * The `hang` verdict: #11's save-failure hang, identified positively.
 *
 * A rejected `verify` fetch propagates into `EncounterPhase`'s un-caught
 * `.then`, so the phase never ends and the UI sits at `MESSAGE(0)` with
 * `onActionInput === null`. No button reaches it. The settle predicate reads
 * that as busy forever, so it never settles and never yields a decision for
 * the ring detector — this watch reads the settle loop's polls instead.
 *
 * That is not a clock deciding the run is dead (#14 forbids that): it is a
 * signature proving no input can work, held long enough to rule out the same
 * signature's normal, transient appearance while encounter text is set up.
 * Source-derived; never reproduced live.
 */

/**
 * Dwell for an uncorroborated hold: the call budget (#14's `CALL_BUDGET_MS`).
 * The `EncounterPhase` → first `COMMAND` leg has never been cleanly measured
 * (#7 §6.6), so nothing shorter is defensible. It still reports on the first
 * call that exhausts its budget, instead of after five decisions that a hung
 * game can never produce.
 */
export const HANG_DWELL_MS = 30_000;

/**
 * Dwell once the page has thrown an unhandled rejection since the last poll that
 * broke the hold (#11's CDP signature, `Runtime.exceptionThrown`). The rejection
 * is the save failing; the dwell only confirms the phase did not move on. 20 polls.
 */
export const HANG_CORROBORATED_MS = 2_000;

/** One settle-loop poll, or `null` when the scene locator was unavailable (#14 `scene-unavailable`). */
export type HangPoll = {
  t: number;
  mode: number;
  phaseName: string | null;
  /** `handler.onActionInput != null`. */
  onActionInput: boolean;
} | null;

export type HangAssessment =
  | { status: "ok" }
  | { status: "run_interrupted"; cause: "save_hang"; hang: { heldMs: number; corroborated: boolean } };

const MESSAGE = 0;

export class HangWatch {
  #since: number | null = null;
  #last: number | null = null;
  /** `t` of the last poll that broke the hold. A rejection after it belongs to this hold. */
  #brokeAt = -Infinity;
  #rejectedAt: number | null = null;

  /** Every settle-loop poll, across calls. Never reset between calls: a resume keeps holding. */
  poll(p: HangPoll): void {
    if (p === null) return;
    if (p.mode === MESSAGE && p.phaseName === "EncounterPhase" && !p.onActionInput) {
      this.#since ??= p.t;
      this.#last = p.t;
      return;
    }
    this.#since = null;
    this.#last = null;
    this.#brokeAt = p.t;
  }

  /** The page threw an unhandled rejection at `t`. */
  unhandledRejection(t: number): void {
    this.#rejectedAt = t;
  }

  assess(): HangAssessment {
    if (this.#since === null || this.#last === null) return { status: "ok" };
    const heldMs = this.#last - this.#since;
    const corroborated = this.#rejectedAt !== null && this.#rejectedAt > this.#brokeAt;
    if (heldMs < (corroborated ? HANG_CORROBORATED_MS : HANG_DWELL_MS)) return { status: "ok" };
    return { status: "run_interrupted", cause: "save_hang", hang: { heldMs, corroborated } };
  }
}
