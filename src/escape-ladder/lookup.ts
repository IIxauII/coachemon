import reviewed from "./reviewed.json" with { type: "json" };
import { LADDER } from "./table.ts";
import type { CancelEffect, Entry, Rung, ScreenClass } from "./types.ts";

export const PINNED_GAME_VERSION: string = reviewed.pinned.gameVersion;

/** The terminal rung, below every screen's own. Version-independent, but suppressed with the rest. */
export const RELOAD: Rung = {
  do: "reload",
  risk: "destructive",
  discards: "all progress since the last save — up to four waves",
  effect: "CDP page reload; the run resumes from the last synced save via Continue",
  provenance: "source",
};

export type LadderQuery = {
  /** Composite screen id from `read_menu`, e.g. `PARTY/FAINT_SWITCH:options`, or `UNKNOWN(<int>)`. */
  screen: string;
  /** `game.config.gameVersion` read live. */
  liveVersion: string;
  /** `tutorialActive` on the current handler: CANCEL behaves as ACTION under a tutorial. */
  tutorialActive: boolean;
};

export type LadderReport =
  | {
      status: "suppressed";
      reason: "version_mismatch" | "tutorial_active";
      message: string;
      rungs: readonly [];
    }
  | {
      status: "unknown_screen";
      screen: string;
      message: string;
      rungs: readonly [];
    }
  | {
      status: "ladder";
      screen: string;
      /** The table key that answered, after composite-id fallback. */
      matched: string;
      class: ScreenClass;
      cancelEffect: CancelEffect;
      rungs: readonly Rung[];
      message: string;
    };

const TABLE: Readonly<Record<string, Entry>> = LADDER;

/** `PARTY/FAINT_SWITCH:options` → `PARTY/FAINT_SWITCH:options`, `PARTY:options`, `PARTY/FAINT_SWITCH`, `PARTY`. */
function candidates(screen: string): string[] {
  const [head, suffix] = screen.split(":", 2);
  const mode = head.split("/", 1)[0];
  const keys = suffix === undefined ? [head, mode] : [screen, `${mode}:${suffix}`, head, mode];
  return [...new Set(keys)];
}

export function ladderFor({ screen, liveVersion, tutorialActive }: LadderQuery): LadderReport {
  if (liveVersion !== PINNED_GAME_VERSION) {
    return {
      status: "suppressed",
      reason: "version_mismatch",
      message:
        `Escape ladder suppressed: the live game is ${liveVersion} but the ladder was reviewed against ` +
        `${PINNED_GAME_VERSION}. Its per-screen claims may press the wrong thing on this build, so no rung is ` +
        `offered. Stuck detection still runs.`,
      rungs: [],
    };
  }
  if (tutorialActive) {
    return {
      status: "suppressed",
      reason: "tutorial_active",
      message:
        "Escape ladder suppressed: a tutorial is showing, and under a tutorial CANCEL behaves exactly like ACTION. " +
        "Advance the tutorial first.",
      rungs: [],
    };
  }

  const matched = candidates(screen).find(key => key in TABLE);
  if (matched === undefined) {
    return {
      status: "unknown_screen",
      screen,
      message: `No escape ladder for ${screen}: the screen is not in the reviewed table. No rung is offered.`,
      rungs: [],
    };
  }

  const entry = TABLE[matched];
  const reloadWarning =
    "The last rung is a page reload: it discards all progress since the last save (up to four waves).";
  return {
    status: "ladder",
    screen,
    matched,
    class: entry.class,
    cancelEffect: entry.cancel.effect,
    rungs: [...entry.rungs, RELOAD],
    message:
      entry.class === "no_escape"
        ? `${screen} cannot be left by any input. ${reloadWarning}`
        : reloadWarning,
  };
}
