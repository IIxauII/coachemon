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
  const groups = [{ id: "act", label: "Act", summary: "Charizard Ember → Rattata · 1 hit", rows: [] }];
  hud(t, { summary: () => summary, card: () => ({ kind: "battle", key: "12", wave: 12, verdict: "danger", groups, text: "⚔ Charizard Ember" }) });
  assert.deepEqual(send("card", {}), { ok: true, kind: "battle", key: "12", wave: 12, verdict: "danger", groups, text: "⚔ Charizard Ember", summary });
});

test("a late join reads the decision on screen by group and not by line (§11.1, #361)", t => {
  onPage(t, scene);
  const groups = [
    { id: "act", label: "Act", summary: "Charizard Ember → Rattata · 1 hit", rows: [] },
    { id: "foes", label: "Foes", summary: "we're weak to Rock ×2", rows: ["💀 Charizard ← Lycanroc Stone Edge"] },
  ];
  hud(t, { summary: () => ({ kind: "battle" }), card: () => ({ kind: "battle", key: "12", wave: 12, verdict: "danger", groups, text: "x" }) });
  const r = send("card", {});
  assert.deepEqual(r.groups, groups);
  assert.equal(r.groups?.find((g: { id: string }) => g.id === "foes")?.rows[0], "💀 Charizard ← Lycanroc Stone Edge");
});

test("a panel that is not carrying groups reads null rather than an empty card (§11.4)", t => {
  onPage(t, scene);
  hud(t, { summary: () => ({ kind: "battle" }), card: () => ({ kind: "battle", key: "12", wave: 12, verdict: "easy", groups: "act", text: "x" }) });
  assert.equal(send("card", {}).groups, null);
});

test("a panel with nothing to coach reads as a card of nulls, not as a missing panel", t => {
  onPage(t, scene);
  hud(t, { summary: () => null, card: () => null });
  assert.deepEqual(send("card", {}), { ok: true, kind: null, key: null, wave: null, verdict: null, groups: null, text: null, summary: null });
});

test("the structured summary is read with no panel drawn at all: a read never needs a document (§11.4)", t => {
  onPage(t, scene);
  hud(t, { summary: () => ({ kind: "rewards", wave: 15, verdict: null }) });
  const r = send("card", {});
  assert.equal(r.kind, "rewards");
  assert.equal(r.wave, 15);
  assert.equal(r.key, null);
  assert.equal(r.groups, null);
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
  assert.deepEqual(send("card", {}), { ok: true, kind: null, key: null, wave: null, verdict: null, groups: null, text: null, summary: null });
});
