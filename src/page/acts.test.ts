import assert from "node:assert/strict";
import { test } from "node:test";
import { UiMode } from "../enums/generated.ts";
import { onPage, send, starterGrid } from "./fake-page.ts";

/**
 * `BaseOptionSelectUiHandler` at 1.12.1.1: the option under the cursor is `options[cursor + scrollCursor]`, and moving
 * onto an option that is not `selectable` arms `repeatInput`, which replays the next button.
 */
function optionHandler(labels: string[], maxOptions: number, unselectable: number[] = []) {
  const options = labels.map((label, i) => ({ label, selectable: !unselectable.includes(i) }));
  return {
    active: true, cursor: 0, scrollCursor: 0, maxOptions, options, repeatInput: false,
    config: { options: labels.map((label, i) => (unselectable.includes(i) ? { label, selectable: false } : { label })) },
    setCursor(i: number) { this.cursor = i; if (!this.options[this.cursor + this.scrollCursor].selectable) this.repeatInput = true; },
    setScrollCursor(i: number) { this.scrollCursor = i; if (!this.options[this.cursor + this.scrollCursor]?.selectable) this.repeatInput = true; },
  };
}

function optionScene(h: object = optionHandler(["New Game", "Load Game", "Run History", "Menu"], 10)) {
  return { ui: { mode: 13, handlers: { 13: h } }, phaseManager: { currentPhase: { phaseName: "TitlePhase" } } };
}

test("a cursor act reads back the fingerprint after moving, and the next act on it runs (extension-distribution.md §10.2)", t => {
  onPage(t, optionScene());
  const { fine } = send("probe", {});
  const moved = send("cursor.option", { index: 2, fine });
  assert.equal(moved.ok, true);
  assert.equal(moved.fullCursor, 2);
  assert.notEqual(moved.fine, fine, "the cursor is part of the fingerprint");
  assert.equal(moved.fine, send("probe", {}).fine);
  assert.equal(send("cursor.option", { index: 1, fine: moved.fine }).ok, true);
});

test("cursor.option scrolls a long list until the option is in view, and leaves no replayed press armed", t => {
  const h = optionHandler(Array.from({ length: 14 }, (_, i) => `Biome ${i}`), 10, [9]);
  onPage(t, optionScene(h));
  const moved = send("cursor.option", { index: 11, fine: send("probe", {}).fine });
  assert.equal(moved.ok, true);
  assert.equal(h.cursor + h.scrollCursor, 12, "index 11 counts selectable options only, so it is Biome 12");
  assert.equal(moved.fullCursor, 11);
  assert.equal(h.repeatInput, false);
});

test("cursor.option refuses an index past the selectable options", t => {
  onPage(t, optionScene());
  const r = send("cursor.option", { index: 4, fine: send("probe", {}).fine });
  assert.equal(r.ok, false);
});

test("key sends the button as a keydown then a keyup on window, keyCode pinned (extension-distribution.md §10.4)", t => {
  const seen: { type: string; key: string; code: string; keyCode: number; which: number }[] = [];
  const g = globalThis as { window?: unknown; KeyboardEvent?: unknown };
  const prev = { window: g.window, KeyboardEvent: g.KeyboardEvent };
  const target = new EventTarget();
  target.addEventListener("keydown", e => seen.push({ ...pick(e) }));
  target.addEventListener("keyup", e => seen.push({ ...pick(e) }));
  g.window = target;
  // Node has no KeyboardEvent: this one drops `keyCode` and `which` from its init, as some engines do, so only the pin
  // carries them.
  g.KeyboardEvent = class extends Event {
    key: string;
    code: string;
    constructor(type: string, init: { key: string; code: string }) {
      super(type);
      this.key = init.key;
      this.code = init.code;
    }
  };
  t.after(() => Object.assign(g, prev));
  onPage(t, optionScene());
  const { fine } = send("probe", {});
  assert.deepEqual(send("key", { button: "ACTION", fine }), { ok: true });
  assert.deepEqual(seen, [
    { type: "keydown", key: "z", code: "KeyZ", keyCode: 90, which: 90 },
    { type: "keyup", key: "z", code: "KeyZ", keyCode: 90, which: 90 },
  ]);
});

function pick(e: Event) {
  const k = e as Event & { key: string; code: string; keyCode: number; which: number };
  return { type: k.type, key: k.key, code: k.code, keyCode: k.keyCode, which: k.which };
}

test("the starter cursor refuses on the filter bar, where setCursor would move the filter cursor", t => {
  const h = { active: true, cursor: 0, filterMode: true, setCursor: () => assert.fail("setCursor on the filter bar") };
  onPage(t, { ui: { mode: 10, handlers: { 10: h } } });
  const { fine } = send("probe", {});
  assert.deepEqual(send("cursor.starter", { index: 3, fine }), { ok: false, why: "filter-mode" });
});

test("the starter cursor scrolls its row on screen and lands on the grid index, off the start button (game-code.md §23)", t => {
  const ids = Array.from({ length: 120 }, (_, i) => i + 1);
  const names = Object.fromEntries(ids.map(id => [id, `Mon ${id}`]));
  const { h } = starterGrid(names, ids, { cursor: 0, scrollCursor: 0 });
  h.cursorObj.visible = false;
  h.startCursorObj.visible = true;
  onPage(t, { ui: { mode: UiMode.STARTER_SELECT, handlers: { [UiMode.STARTER_SELECT]: h } } });
  const { fine } = send("probe", {});
  const r = send("cursor.starter", { index: 100, fine });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.scrollCursor, 5);
  assert.equal(h.cursor, 55);
  assert.equal(r.cursor, 100);
  assert.equal(r.species, "Mon 101");
  assert.equal(h.cursorObj.visible, true);
  assert.equal(h.startCursorObj.visible, false);
});

test("modal runs the handler's own button action", t => {
  const clicked: number[] = [];
  const h = { active: true, config: { buttonActions: [() => clicked.push(0), () => clicked.push(1)] } };
  onPage(t, { ui: { mode: 20, handlers: { 20: h } } });
  const { fine } = send("probe", {});
  assert.deepEqual(send("modal", { index: 1, fine }), { ok: true, mode: 20 });
  assert.deepEqual(send("modal", { index: 5, fine }), { ok: false, why: "no-button-action" });
  assert.deepEqual(clicked, [1]);
});
