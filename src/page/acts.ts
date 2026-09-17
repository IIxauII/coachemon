/**
 * The act handlers (§10.1). `dispatch` has already checked `fine` against this page turn's fingerprint (§10.2), so each
 * runs on the game the act was decided on. A cursor act reads the fingerprint back after moving, for the next act to
 * expect. Each is self-contained (§10.5).
 */
import type { Located } from "./locate.ts";

/** An act that did nothing: the page refused it, or the game had `moved` off the act's fingerprint, now `fine`. */
export type Refused = { ok: false; why: string; fine?: string };

export type PressResult = { ok: true; mode: number } | Refused;
export type KeyResult = { ok: true } | Refused;
export type CursorOptionResult = { ok: true; fullCursor: number; cursor: number; fine: string } | Refused;
export type CursorShopResult = { ok: true; rowCursor: number; cursor: number; fine: string } | Refused;
export type CursorStarterResult = { ok: true; cursor: number; scrollCursor: number; species: string | null; fine: string } | Refused;
export type CursorLearnResult = { ok: true; moveCursor: number; fine: string } | Refused;
export type ModalResult = { ok: true; mode: number } | Refused;

/** Deliver one button through the game's own input path. The return value is deliberately not read (#7 Principle 4). */
export function press(L: Located, args: { button: number; fine: string }): PressResult {
  L.ui.processInput(args.button);
  return { ok: true, mode: L.ui.mode };
}

/**
 * A button as an untrusted `keydown` then `keyup` on `window` (§10.4). `keyCode` is set in the constructor and pinned
 * as well; Phaser never checks `isTrusted`. The two events alternate `type`, so Phaser's duplicate-event bailout keeps
 * both, and a `keydown` never goes out without its `keyup`.
 */
export function key(_L: Located, args: { button: string; fine: string }): KeyResult {
  const KEYS: Record<string, [string, string, number]> = {
    UP: ["ArrowUp", "ArrowUp", 38],
    DOWN: ["ArrowDown", "ArrowDown", 40],
    LEFT: ["ArrowLeft", "ArrowLeft", 37],
    RIGHT: ["ArrowRight", "ArrowRight", 39],
    ACTION: ["z", "KeyZ", 90],
    CANCEL: ["x", "KeyX", 88],
    SUBMIT: ["Enter", "Enter", 13],
    MENU: ["Escape", "Escape", 27],
  };
  const k = Object.prototype.hasOwnProperty.call(KEYS, args.button) ? KEYS[args.button] : null;
  if (!k) return { ok: false, why: "unknown-key" };
  const g = globalThis as any;
  for (const type of ["keydown", "keyup"]) {
    const e = new g.KeyboardEvent(type, { key: k[0], code: k[1], keyCode: k[2], which: k[2], bubbles: true, cancelable: true });
    Object.defineProperty(e, "keyCode", { get: () => k[2] });
    Object.defineProperty(e, "which", { get: () => k[2] });
    g.window.dispatchEvent(e);
  }
  return { ok: true };
}

/** Option-select family: position the cursor over the unskipped list, then read back what the handler thinks. */
export function cursorOption(L: Located, args: { index: number; fine: string }): CursorOptionResult {
  const h = L.ui.handlers[L.ui.mode];
  h.setCursor(args.index);
  return { ok: true, fullCursor: h.fullCursor, cursor: h.cursor, fine: L.fine() };
}

/** Shop: `setRowCursor` then `setCursor`; order is load-bearing (#7 §7). */
export function cursorShop(L: Located, args: { row: number; col: number; fine: string }): CursorShopResult {
  const h = L.ui.handlers[6];
  h.setRowCursor(args.row);
  h.setCursor(args.col);
  return { ok: true, rowCursor: h.rowCursor, cursor: h.cursor, fine: L.fine() };
}

/**
 * Starter grid: keep the window in sync first (`setCursor` never calls `updateScroll`, #8), then `setCursor`. Refuses in
 * filter mode, where `setCursor(n)` writes `filterBarCursor` instead.
 */
export function cursorStarter(L: Located, args: { index: number; fine: string }): CursorStarterResult {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const h = L.ui.handlers[10];
  if (h.filterMode === true) return { ok: false, why: "filter-mode" };
  const n = (h.filteredStarterContainers || []).length;
  const rows = Math.ceil(n / 9);
  const row = Math.floor(args.index / 9);
  if (row < h.scrollCursor || row > h.scrollCursor + 8) {
    h.scrollCursor = Math.max(0, Math.min(row - 4, rows - 9));
    h.updateScroll();
  }
  h.setCursor(args.index);
  return { ok: true, cursor: h.cursor, scrollCursor: h.scrollCursor, species: __try(() => h.filteredStarterContainers[h.cursor].species.name), fine: L.fine() };
}

/**
 * Learn-move rows: `setCursor` writes `moveCursor` only while `moveSelect` is on; off it, the same call would turn the
 * page, so it refuses instead.
 */
export function cursorLearn(L: Located, args: { row: number; fine: string }): CursorLearnResult {
  const h = L.ui.handlers[9];
  if (h.moveSelect !== true) return { ok: false, why: "move-select-off" };
  h.setCursor(args.row);
  return { ok: true, moveCursor: h.moveCursor, fine: L.fine() };
}

/** Modal family: the handler's own button action, mouse-only by construction (#13). */
export function modal(L: Located, args: { index: number; fine: string }): ModalResult {
  const h = L.ui.handlers[L.ui.mode];
  const fn = h.config && Array.isArray(h.config.buttonActions) ? h.config.buttonActions[args.index] : null;
  if (typeof fn !== "function") return { ok: false, why: "no-button-action" };
  fn();
  return { ok: true, mode: L.ui.mode };
}
