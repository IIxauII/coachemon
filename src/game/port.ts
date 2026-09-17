/**
 * The game port (#127): the Driver reaches the game only through these typed operations, never through a JS string.
 *
 * A page throw never leaves an adapter as a throw. Reads degrade to their own not-readable value; acts return
 * `{ ok: false, why, threw }`, so a throwing press and an unavailable scene stay distinct. A dropped socket or a tab
 * that cannot be attached still rejects as an `Error`. Every operation that reaches the tab attaches first, so no
 * caller attaches by hand.
 */
import type { Button } from "../enums/generated.ts";
import type { ConsoleLine } from "../page/errors.ts";
import type { MenuOption } from "../page/menu.ts";
import type { SnapshotDetail } from "../page/snapshot.ts";
import type { Tab } from "./link.ts";

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

/**
 * What an act did. `threw`: the page threw, as opposed to refusing (no scene, no button action, cursor elsewhere).
 * Every act carries the fine fingerprint it was decided on; `why: "moved"` means the game had left it, so nothing was
 * done (§10.2). `fine`, when present, is the fingerprint the act left the game on: the next act's to expect.
 */
export type Act = { ok: true; fine?: string } | { ok: false; why: string; threw: boolean; fine?: string };

export const MOVED = "moved";

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

export type { MenuOption, SnapshotDetail, ConsoleLine };

/** The Driver's way to the game: typed game operations, plus the tab's CDP side until the flip (§13.2). */
export interface GamePort extends Tab {
  // game operations
  /** The settle predicate. A throw → `{ ready: false, why }`. */
  read(): Promise<PredicateRead>;
  /** The game loop's frame counter. A throw → `null`. */
  frame(): Promise<number | null>;
  /** The menu reader. A throw → `{ readable: false, why, … }`. */
  menu(): Promise<MenuRead>;
  /** One button through the game's own input path, if the game is still on `fine`. */
  press(b: Button, fine: string): Promise<Act>;
  setCursor(t: CursorTarget, fine: string): Promise<Act & { species?: string }>;
  /** The modal family's own button action, if the game is still on `fine`. */
  modalButton(i: number, fine: string): Promise<Act>;
  starterGrid(): Promise<StarterGrid | Failed>;
  snapshot(d: SnapshotDetail): Promise<{ ok: true; snapshot: Record<string, unknown> } | Failed>;
  /** A base64 PNG. */
  screenshot(): Promise<string>;
}
