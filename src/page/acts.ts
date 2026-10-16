/**
 * `dispatch` has already matched `args.fine` to this page turn (extension-distribution.md §10.2). Self-contained
 * (§10.5).
 */
import type { Located } from "./locate.ts";

/** `fine` comes back only with `moved`: the fingerprint the game is on now. */
export type Refused = { ok: false; why: string; fine?: string };

export type PressResult = { ok: true; mode: number } | Refused;
export type KeyResult = { ok: true } | Refused;
export type CursorOptionResult = { ok: true; fullCursor: number; cursor: number; fine: string } | Refused;
export type CursorShopResult = { ok: true; rowCursor: number; cursor: number; fine: string } | Refused;
export type CursorStarterResult = { ok: true; cursor: number; scrollCursor: number; species: string | null; fine: string } | Refused;
export type CursorLearnResult = { ok: true; moveCursor: number; fine: string } | Refused;
export type ModalResult = { ok: true; mode: number } | Refused;

/** Never judge a press by `processInput`'s return value: it lies both ways (v1-tool-surface.md §1). */
export function press(L: Located, args: { button: number; fine: string }): PressResult {
  L.ui.processInput(args.button);
  return { ok: true, mode: L.ui.mode };
}

/**
 * `keyCode` is pinned as well as set, and a `keydown` never goes out without its `keyup` (extension-distribution.md
 * §10.4).
 */
export function key(_L: Located, args: { button: string; fine: string }): KeyResult {
  // @mirrors KEYS
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

/**
 * `index` counts selectable options only, and so does the `fullCursor` it reads back (extension-distribution.md
 * §10.1). The game's own cursor is the row in view, over `scrollCursor`, which is set first.
 */
export function cursorOption(L: Located, args: { index: number; fine: string }): CursorOptionResult {
  const h = L.ui.handlers[L.ui.mode];
  const options: any[] = Array.isArray(h.options) ? h.options : [];
  const selectable = options.map((o, i) => (o.selectable === false ? -1 : i)).filter(i => i >= 0);
  const to = selectable[args.index];
  if (to === undefined) return { ok: false, why: "no-such-option" };
  const scroll = Math.max(0, Math.min(to - h.maxOptions + 1, options.length - h.maxOptions));
  if (h.scrollCursor !== scroll) h.setScrollCursor(scroll);
  h.setCursor(to - scroll);
  // Gotcha: passing over an unselectable option arms `repeatInput`, and the next press would run twice.
  h.repeatInput = false;
  return { ok: true, fullCursor: selectable.indexOf(h.cursor + h.scrollCursor), cursor: h.cursor, fine: L.fine() };
}

/** `setRowCursor` before `setCursor`: the order is load-bearing (v1-tool-surface.md §7). */
export function cursorShop(L: Located, args: { row: number; col: number; fine: string }): CursorShopResult {
  const h = L.ui.handlers[L.m.MODIFIER_SELECT];
  h.setRowCursor(args.row);
  h.setCursor(args.col);
  return { ok: true, rowCursor: h.rowCursor, cursor: h.cursor, fine: L.fine() };
}

/**
 * `index` and the `cursor` returned are grid indices, while `setCursor` takes an on-screen container, so the row is
 * scrolled on screen first; in filter mode it writes `filterBarCursor` instead (#8, game-code.md §23). The party, start
 * and random cursors are dropped as the game's own moves onto the grid drop them, or ACTION would answer there.
 */
export function cursorStarter(L: Located, args: { index: number; fine: string }): CursorStarterResult {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const h = L.ui.handlers[L.m.STARTER_SELECT];
  if (h.filterMode === true) return { ok: false, why: "filter-mode" };
  const n = (h.filteredStarterIds || []).length;
  // @mirrors starter-grid
  const rows = Math.ceil(n / 9);
  const row = Math.floor(args.index / 9);
  if (row < h.scrollCursor || row > h.scrollCursor + 8) {
    h.scrollCursor = Math.max(0, Math.min(row - 4, rows - 9));
    h.updateScroll();
  }
  for (const c of [h.partyCursorObj, h.startCursorObj, h.randomCursorObj]) __try(() => c.setVisible(false));
  __try(() => h.cursorObj.setVisible(true));
  h.setCursor(args.index - h.scrollCursor * 9);
  return { ok: true, cursor: h.scrollCursor * 9 + h.cursor, scrollCursor: h.scrollCursor, species: __try(() => h.starterContainers[h.cursor].species.name), fine: L.fine() };
}

/** Off `moveSelect`, `setCursor` turns the page instead of moving the row (v1-tool-surface.md §7). */
export function cursorLearn(L: Located, args: { row: number; fine: string }): CursorLearnResult {
  const h = L.ui.handlers[L.m.SUMMARY];
  if (h.moveSelect !== true) return { ok: false, why: "move-select-off" };
  h.setCursor(args.row);
  return { ok: true, moveCursor: h.moveCursor, fine: L.fine() };
}

/** A modal's buttons are mouse-only, so this calls the button's own action (#13). */
export function modal(L: Located, args: { index: number; fine: string }): ModalResult {
  const h = L.ui.handlers[L.ui.mode];
  const fn = h.config && Array.isArray(h.config.buttonActions) ? h.config.buttonActions[args.index] : null;
  if (typeof fn !== "function") return { ok: false, why: "no-button-action" };
  fn();
  return { ok: true, mode: L.ui.mode };
}
