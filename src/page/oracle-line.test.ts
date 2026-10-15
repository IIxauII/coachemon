import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";
import type { PageLine } from "./oracle-line.ts";

type Hud = { summary?: () => unknown; oracleLine?: (line: unknown) => unknown };

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

const deepFreeze = <T>(v: T): T => {
  if (typeof v === "object" && v !== null) {
    for (const x of Object.values(v)) deepFreeze(x);
    Object.freeze(v);
  }
  return v;
};

const scene = () => deepFreeze({ seed: "U0QKEz8wXq3LmN7pR2sT9vYb", ui: { mode: 0, handlers: {} }, currentBattle: { waveIndex: 180, turn: 7 } });

const line: PageLine = {
  seed: "U0QKEz8wXq3LmN7pR2sT9vYb", wave: 180, gameVersion: "1.12.0.11",
  steps: [{ turn: 7, input: { kind: "move", move: 450, tera: false }, checkpoint: { ours: [], foes: [] } }],
  receipt: [], luck: [],
};

test("no panel on the page refuses no-hud (#670)", t => {
  onPage(t, scene());
  hud(t, null);
  assert.deepEqual(send("oracle.line", { line }), { ok: false, why: "no-hud" });
});

test("a panel from before the handoff refuses no-hud, as one that is not there (#670)", t => {
  onPage(t, scene());
  hud(t, { summary: () => null });
  assert.deepEqual(send("oracle.line", { line }), { ok: false, why: "no-hud" });
});

test("the line reaches the panel as it was sent, writing nothing to the game's frozen scene, and the panel's answer comes back (#670)", t => {
  onPage(t, scene());
  const handed: unknown[] = [];
  hud(t, { oracleLine: l => { handed.push(l); return { ok: true }; } });
  assert.deepEqual(send("oracle.line", { line }), { ok: true });
  assert.deepEqual(handed, [line]);
});

test("a line the panel ignores comes back with the panel's reason (#670)", t => {
  onPage(t, scene());
  hud(t, { oracleLine: () => ({ ok: false, why: "other-fight" }) });
  assert.deepEqual(send("oracle.line", { line }), { ok: false, why: "other-fight" });
});
