import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";

type Hud = { summary?: () => unknown; card?: () => unknown };

/** Install a HUD on the page, the way the panel leaves itself on `window`. */
function hud(t: { after: (fn: () => void) => void }, panel: Hud | null) {
  const g = globalThis as { __coachHud?: Hud };
  const prev = g.__coachHud;
  if (panel === null) delete g.__coachHud;
  else g.__coachHud = panel;
  t.after(() => {
    if (prev === undefined) delete g.__coachHud;
    else g.__coachHud = prev;
  });
}

const scene = { ui: { mode: 0, handlers: {} }, currentBattle: { waveIndex: 12, turn: 1 } };

test("no panel on the page refuses no-hud (§10.1)", t => {
  onPage(t, scene);
  hud(t, null);
  assert.deepEqual(send("card", {}), { ok: false, why: "no-hud" });
});

test("the card read is the card event's own fields plus the summary (§11.1, §11.4)", t => {
  onPage(t, scene);
  const summary = { kind: "battle", wave: 12, verdict: "danger", field: "Charizard Ember → Rattata · 1 hit" };
  hud(t, { summary: () => summary, card: () => ({ kind: "battle", key: "12", wave: 12, verdict: "danger", text: "⚔ Charizard Ember" }) });
  assert.deepEqual(send("card", {}), { ok: true, kind: "battle", key: "12", wave: 12, verdict: "danger", text: "⚔ Charizard Ember", summary });
});

test("a panel with nothing to coach reads as a card of nulls, not as a missing panel", t => {
  onPage(t, scene);
  hud(t, { summary: () => null, card: () => null });
  assert.deepEqual(send("card", {}), { ok: true, kind: null, key: null, wave: null, verdict: null, text: null, summary: null });
});

test("a panel from before the card events falls back to what its summary says", t => {
  onPage(t, scene);
  hud(t, { summary: () => ({ kind: "rewards", wave: 15, verdict: null }) });
  const r = send("card", {});
  assert.equal(r.kind, "rewards");
  assert.equal(r.wave, 15);
  assert.equal(r.key, null);
  assert.equal(r.text, null);
});

test("a panel that throws reads as a card of nulls: a broken HUD never fails the coach's read", t => {
  onPage(t, scene);
  hud(t, {
    summary: () => {
      throw new Error("planner blew up");
    },
    card: () => {
      throw new Error("planner blew up");
    },
  });
  assert.deepEqual(send("card", {}), { ok: true, kind: null, key: null, wave: null, verdict: null, text: null, summary: null });
});
