import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";

/** An OPTION_SELECT whose `setCursor` moves the cursor over its unskipped list. */
function optionScene() {
  const h = { active: true, cursor: 0, fullCursor: 0, setCursor(i: number) { this.cursor = i; this.fullCursor = i; } };
  return { ui: { mode: 13, handlers: { 13: h } }, phaseManager: { currentPhase: { phaseName: "TitlePhase" } } };
}

test("a cursor act reads back the fingerprint after moving, and the next act on it runs (§10.2)", t => {
  onPage(t, optionScene());
  const { fine } = send("probe", {});
  const moved = send("cursor.option", { index: 2, fine });
  assert.equal(moved.ok, true);
  assert.equal(moved.fullCursor, 2);
  assert.notEqual(moved.fine, fine, "the cursor is part of the fingerprint");
  assert.equal(moved.fine, send("probe", {}).fine);
  assert.equal(send("cursor.option", { index: 1, fine: moved.fine }).ok, true);
});

test("key sends the button as a keydown then a keyup on window, keyCode pinned (§10.4)", t => {
  const seen: { type: string; key: string; code: string; keyCode: number; which: number }[] = [];
  const g = globalThis as { window?: unknown; KeyboardEvent?: unknown };
  const prev = { window: g.window, KeyboardEvent: g.KeyboardEvent };
  const target = new EventTarget();
  target.addEventListener("keydown", e => seen.push({ ...pick(e) }));
  target.addEventListener("keyup", e => seen.push({ ...pick(e) }));
  g.window = target;
  // Node has no KeyboardEvent: this one drops keyCode from its init, as some engines do, so only the pin carries it.
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

test("modal runs the handler's own button action", t => {
  const clicked: number[] = [];
  const h = { active: true, config: { buttonActions: [() => clicked.push(0), () => clicked.push(1)] } };
  onPage(t, { ui: { mode: 20, handlers: { 20: h } } });
  const { fine } = send("probe", {});
  assert.deepEqual(send("modal", { index: 1, fine }), { ok: true, mode: 20 });
  assert.deepEqual(send("modal", { index: 5, fine }), { ok: false, why: "no-button-action" });
  assert.deepEqual(clicked, [1]);
});
