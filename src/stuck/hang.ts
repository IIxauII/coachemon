/**
 * The `hang` verdict: #11's save-failure hang, a rejected per-wave save that leaves the phase on `MESSAGE(0)` with no
 * `onActionInput`, where no press reaches it (game-code.md §26). Source-derived; never reproduced live.
 */

/**
 * An uncorroborated hold waits out `CALL_BUDGET_MS`: a healthy encounter shows the same signature through its intro and
 * its unprompted text (game-code.md §26), for a time never measured (v1-tool-surface.md §6.6).
 */
export const HANG_DWELL_MS = 30_000;

/** Once the page has thrown the save's unhandled rejection (extension-distribution.md §12.4). 20 polls. */
export const HANG_CORROBORATED_MS = 2_000;

/** One settle-loop poll, or `null` when the scene locator was unavailable (#14 `scene-unavailable`). */
export type HangPoll = {
  t: number;
  mode: number;
  phaseName: string | null;
  onActionInput: boolean;
} | null;

export type HangAssessment =
  | { status: "ok" }
  | { status: "run_interrupted"; cause: "save_hang"; hang: { heldMs: number; corroborated: boolean } };

const MESSAGE = 0;

export class HangWatch {
  #since: number | null = null;
  #last: number | null = null;
  #brokeAt = -Infinity;
  #rejectedAt: number | null = null;

  /** Every settle-loop poll, across calls. Never reset between calls: a resume keeps holding. */
  poll(p: HangPoll): void {
    if (p === null) return;
    // Only wave 1 is an `EncounterPhase`: a later save hangs in a subclass with its own `phaseName` (#488).
    if (p.mode === MESSAGE && p.phaseName === "EncounterPhase" && !p.onActionInput) {
      this.#since ??= p.t;
      this.#last = p.t;
      return;
    }
    this.#since = null;
    this.#last = null;
    this.#brokeAt = p.t;
  }

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
