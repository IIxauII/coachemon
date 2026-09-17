/**
 * The game port (#127): the Driver reaches the game only through these typed operations, never through a JS string.
 *
 * A page throw never leaves an adapter as a throw. Reads degrade to their own not-readable value; acts return
 * `{ ok: false, why, threw }`, so a throwing press and an unavailable scene stay distinct. A dropped socket or a tab
 * that cannot be attached still rejects as an `Error`. Every operation that reaches the tab attaches first, so no
 * caller attaches by hand.
 */
import type { Button } from "../enums/generated.ts";

/**
 * The settle predicate's read: everything the settle loop, the Screen and the fingerprints need, in one read.
 * `screen` is the composite Screen id (`PARTY/SWITCH:options`, `STARTER_SELECT/FILTER`), identified by the adapter.
 */
export type PredicateRead =
  | { ready: false; why: string; frame: number | null; domMode: string | null }
  | {
      ready: true;
      settled: boolean;
      reason: string;
      mode: number;
      screen: string;
      phaseName: string | null;
      wave: number | null;
      turn: number | null;
      money: number | null;
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
    };

export type Ready = Extract<PredicateRead, { ready: true }>;

export type MenuOption = {
  i: number | string;
  label: string | null;
  /** The plain name a decorated label is built from (`Great Ball` in `Great Ball ×9`); selects the option too. */
  name?: string | null;
  [k: string]: unknown;
};

/**
 * The menu reader's read. `screen` is identified from the same read as the family, and the fields a family takes from
 * the Screen's discriminators (party `optionsMode`/`partyUiMode`/`transferMode`, save_slot `uiMode`, the alert's
 * `closable`, starter `filterMode`) are filled into `extra` from that one read too.
 */
export type MenuRead = {
  readable: boolean;
  why?: string;
  mode: number;
  screen: string;
  handler?: string;
  family: string | null;
  options: MenuOption[];
  cursor: number | string | null;
  text: string | null;
  extra: Record<string, unknown>;
};

export type Failed = { ok: false; why: string };

/** What an act did. `threw`: the page threw, as opposed to refusing (no scene, no button action, cursor elsewhere). */
export type Act = { ok: true } | { ok: false; why: string; threw: boolean };

/** Where `setCursor` puts a family's cursor. `ok` means it landed there. */
export type CursorTarget =
  /** An index into the unskipped options. */
  | { family: "option_select"; index: number }
  | { family: "modifier_select"; row: number; col: number }
  | { family: "starter_select"; index: number }
  | { family: "learn_move"; row: number };

/** The starter-select facts `start_run` needs before it presses anything. */
export type StarterGrid = {
  ok: true;
  grid: { i: number; name: string | null; cost: number | null }[];
  valueLimit: number | null;
  party: string[];
  partyValid: boolean | null;
};

export type SnapshotDetail = "lean" | "party" | "items" | "full";

export type ConsoleLine = { t: string; level: string; text: string };

export interface GamePort {
  // game operations
  /** The settle predicate. A throw → `{ ready: false, why }`. */
  read(): Promise<PredicateRead>;
  /** The game loop's frame counter. A throw → `null`. */
  frame(): Promise<number | null>;
  /** The menu reader. A throw → `{ readable: false, why, … }`. */
  menu(): Promise<MenuRead>;
  /** One button through the game's own input path. */
  press(b: Button): Promise<Act>;
  setCursor(t: CursorTarget): Promise<Act & { species?: string }>;
  /** The modal family's own button action. */
  modalButton(i: number): Promise<Act>;
  starterGrid(): Promise<StarterGrid | Failed>;
  snapshot(d: SnapshotDetail): Promise<{ ok: true; snapshot: Record<string, unknown> } | Failed>;
  // tab operations
  /** The button through the raw keyboard. `false`: it has no keyboard equivalent, and nothing was sent. */
  rawKey(b: Button): Promise<boolean>;
  /** Re-apply focus emulation (#23). */
  keepAlive(): Promise<void>;
  attach(): Promise<{ attached: boolean; launchedChrome: boolean }>;
  /** A base64 PNG. */
  screenshot(): Promise<string>;
  /** The page's recent console errors and warnings, for diagnostics. */
  consoleTail(): ConsoleLine[];
  /** Called for every unhandled page exception (#16's hang corroboration). */
  onRejection(cb: (t: number) => void): void;
}
