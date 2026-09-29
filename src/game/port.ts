/**
 * The Driver reaches the game only through these typed operations, never through a JS string (#127). A page throw never
 * leaves an adapter as a throw; a dropped socket or a tab that cannot be attached still rejects. Every operation that
 * reaches the tab attaches first, so no caller attaches by hand.
 */
import type { Button } from "../enums/generated.ts";
import type { CardResult } from "../page/card.ts";
import type { ConsoleLine } from "../page/errors.ts";
import type { MenuOption } from "../page/menu.ts";
import type { SnapshotDetail } from "../page/snapshot.ts";
import type { StartersResult } from "../page/starters.ts";
import type { Tab } from "./link.ts";

/** `screen` is the composite Screen id (v1-tool-surface.md §4). */
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

export type FightMove = { name: string; pp: number; maxPp: number; power: number | null; category: number | null; type: number | null };

export type ShopRow = { row: number; kind: "buttons" | "reward" | "shop"; items: { col: number; label: string | null; cost?: number | null; desc?: string | null; visible?: boolean }[] };

export type FamilyExtra = {
  option_select: { unskippedIndices: number[] | null; selectedIndex: number };
  command: { fieldIndex: number; catchable: boolean | null };
  fight: { fieldIndex: number; moves?: (FightMove | null)[] };
  ball: { catchable: boolean | null };
  target_select: { isMultipleTargets: boolean };
  modifier_select: { rows: ShopRow[]; rowCursor: number; colCursor: number; money: number; rerollCost: number | null };
  save_slot: { uiMode: number | null };
  party: { optionsScroll: boolean; optionsMode: boolean; partyUiMode: number | null; transferMode: boolean };
  starter_select: {
    scrollCursor: number;
    party: { name: string; cost: number | null }[];
    partyValue: number;
    valueLimit: number | null;
    partyValid: boolean | null;
    filterMode: boolean;
  };
  acknowledge: { awaitingActionInput: boolean; closable?: boolean };
  learn_move: { moveSelect: boolean; page: number; pokemon: string | null; newMove: string | null };
  paged_viewer: { page: number };
  modal: { formLabels: (string | null)[] };
  menu: {};
  mystery_encounter: {};
  unmapped: { ownKeys: string[]; texts: string[] | null };
};

export type Family = keyof FamilyExtra;

export type MenuReadBase = {
  readable: boolean;
  why?: string;
  mode: number;
  screen: string;
  handler?: string;
  options: MenuOption[];
  cursor: number | string | null;
  text: string | null;
  /** A handler's own message box waits for ACTION and swallows every cursor press (#44). */
  messagePending: boolean;
};

/**
 * `family: null` identified no menu (a throw, no handler); a reader branch that threw carries `extra.error`. `screen`
 * and the `extra` fields the Screen's discriminators decide come from the same read as `family` (v1-tool-surface.md §4).
 */
export type MenuRead =
  | { [F in Family]: MenuReadBase & { family: F; extra: FamilyExtra[F] & { error?: string } } }[Family]
  | (MenuReadBase & { family: null; extra: { error?: string } });

export type Failed = { ok: false; why: string };

/**
 * `threw`: the page threw, as opposed to refusing (no scene, no button action, cursor elsewhere). `why: "moved"`: the
 * game had left the `fine` the act was given, so nothing was done (extension-distribution.md §10.2). `fine`, when
 * present, is the fingerprint the act left the game on, the one the next act expects.
 */
export type Act = { ok: true; fine?: string } | { ok: false; why: string; threw: boolean; fine?: string };

export const MOVED = "moved";

export type CursorTarget =
  /** An index into the unskipped options. */
  | { family: "option_select"; index: number }
  | { family: "modifier_select"; row: number; col: number }
  | { family: "starter_select"; index: number }
  | { family: "learn_move"; row: number };

/** (extension-distribution.md §11.4) */
export type StarterGrid = StartersResult;

export type CardRead = Extract<CardResult, { ok: true }>;

export type { MenuOption, SnapshotDetail, ConsoleLine };

export interface GamePort extends Tab {
  /** A throw → `{ ready: false, why }`. */
  read(): Promise<PredicateRead>;
  /** The game loop's frame counter. A throw → `null`. */
  frame(): Promise<number | null>;
  /** A throw → `{ readable: false, why, … }`. */
  menu(): Promise<MenuRead>;
  /** One button through the game's own input path. */
  press(b: Button, fine: string): Promise<Act>;
  /** `ok`: the cursor landed on `t`. */
  setCursor(t: CursorTarget, fine: string): Promise<Act & { species?: string }>;
  /** The modal family's own button action. */
  modalButton(i: number, fine: string): Promise<Act>;
  starters(): Promise<StarterGrid | Failed>;
  /** The card the panel is showing (extension-distribution.md §11.1). No panel → `{ ok: false, why: "no-hud" }`. */
  card(): Promise<CardRead | Failed>;
  snapshot(d: SnapshotDetail): Promise<{ ok: true; snapshot: Record<string, unknown> } | Failed>;
  /** A base64 PNG. */
  screenshot(): Promise<string>;
}
