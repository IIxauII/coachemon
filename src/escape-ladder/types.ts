/**
 * Types for the escape ladder: per screen, the ordered rungs that leave it.
 *
 * The table is hand-curated (see docs/adr/0001-escape-ladder-hand-curated-checked-at-pin-bump.md);
 * these types exist so a rung cannot be written without its risk, its
 * provenance, and — when it costs something — what it discards.
 */

/** What a rung costs. */
export type Risk =
  /** Nothing the run or the profile depends on is lost. */
  | "safe"
  /** Forfeits an in-run choice or opportunity: a reward, a move, an evolution, a run setup. */
  | "lossy"
  /** Loses durable state: a team member, a save slot, persisted prefs, progress since the last save. */
  | "destructive";

/** How the claim is known. `live` means observed in a transcript; `source` means read at the pinned ref. */
export type Provenance = "source" | "live";

/** Buttons a rung may press. `MENU` is deliberately absent: it never reaches a handler (#13). */
export type RungButton = "ACTION" | "CANCEL" | "SUBMIT";

type Costed =
  | { risk: "safe"; discards?: never }
  | { risk: "lossy" | "destructive"; /** Said out loud in the report. */ discards: string };

type RungCommon = Costed & {
  /** What the rung does, in one line. */
  effect: string;
  provenance: Provenance;
  /** Runtime condition under which the rung applies, if any. */
  when?: string;
};

export type Rung =
  | (RungCommon & { do: "press"; button: RungButton })
  /** Must-answer prompts: choose an option not yet tried on this fingerprint. */
  | (RungCommon & { do: "select_untried_option" })
  /** The modal family's own mouse-only exit, `config.buttonActions[index]()`. */
  | (RungCommon & { do: "modal_button_action"; index: number })
  /** Auto-advancing scene: nothing to press, the game moves on its own. */
  | (RungCommon & { do: "wait" })
  /** Terminal rung: CDP page reload. Appended by the lookup, never stored per screen. */
  | (RungCommon & { do: "reload" });

/**
 * What CANCEL does on a screen. Replaces the hand-maintained `cancel_effect`
 * table in the v1 tool surface spec §5; `read_menu` derives it from here.
 */
export type CancelEffect =
  /** Leaves the screen without choosing. */
  | "exits"
  /** Opens a CONFIRM whose "yes" leaves; nothing is lost until it is answered. */
  | "asks_confirm"
  /** Identical to ACTION: answers the prompt. */
  | "consents"
  /** Moves the cursor to the last option and activates it. */
  | "selects_last_option"
  /** The phase re-asks the same question. */
  | "reopens"
  /** Nothing happens (whether or not processInput returns true). */
  | "rejected";

export type ScreenClass =
  /** Ordinary screen with at least one input rung. */
  | "ladder"
  /** The phase will not release it until an option is chosen; backing out is the wrong move. */
  | "must_answer"
  /** Plays out on its own; input at most skips ahead. */
  | "auto"
  /** No input leaves it. Reported on sight; only the terminal reload remains. */
  | "no_escape";

/** `<path at pinned ref>#<Class>.<method>` or `#<function>` — the unit the drift check hashes. */
export type SourceRef = `src/${string}.ts#${string}`;

export type Entry = {
  /** `UiMode` int at the pinned ref. */
  mode: number;
  /** Handler class at `ui.handlers[mode]`. */
  handler: string;
  class: ScreenClass;
  /** Reachable during a run from the critical path, as opposed to title/pause-menu screens. */
  onRunPath: boolean;
  cancel: { effect: CancelEffect; provenance: Provenance; note: string };
  rungs: readonly Rung[];
  /** Methods whose bodies these claims rest on. A hash moving on any of them fails the pin bump. */
  deps: readonly SourceRef[];
  note?: string;
};
