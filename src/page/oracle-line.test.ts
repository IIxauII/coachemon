import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";
import type { PageOracleLine } from "./oracle-line.ts";

type Hud = { summary?: () => unknown; oracleLine?: (line: unknown) => unknown };

function hud(t: { after: (fn: () => void) => void }, overlay: Hud | null) {
  const g = globalThis as { __coachHud?: Hud };
  const prev = g.__coachHud;
  if (overlay === null) delete g.__coachHud;
  else g.__coachHud = overlay;
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

const line: PageOracleLine = {
  seed: "U0QKEz8wXq3LmN7pR2sT9vYb", wave: 180, gameVersion: "1.12.0.11",
  steps: [{ turn: 7, input: { kind: "move", move: 450, tera: false }, checkpoint: { ours: [], foes: [] } }],
  receipt: [], luck: [],
};

test("no overlay on the page refuses no-hud (#670)", t => {
  onPage(t, scene());
  hud(t, null);
  assert.deepEqual(send("oracle.line", { line }), { ok: false, why: "no-hud" });
});

test("an overlay from before the handoff refuses no-hud, as one that is not there (#670)", t => {
  onPage(t, scene());
  hud(t, { summary: () => null });
  assert.deepEqual(send("oracle.line", { line }), { ok: false, why: "no-hud" });
});

test("the oracle line reaches the overlay as it was sent, writing nothing to the game's frozen scene, and the overlay's answer comes back (#670)", t => {
  onPage(t, scene());
  const handed: unknown[] = [];
  hud(t, { oracleLine: l => { handed.push(l); return { ok: true }; } });
  assert.deepEqual(send("oracle.line", { line }), { ok: true });
  assert.deepEqual(handed, [line]);
});

test("an oracle line the overlay ignores comes back with the overlay's reason (#670)", t => {
  onPage(t, scene());
  hud(t, { oracleLine: () => ({ ok: false, why: "other-fight" }) });
  assert.deepEqual(send("oracle.line", { line }), { ok: false, why: "other-fight" });
});
