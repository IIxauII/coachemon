import assert from "node:assert/strict";
import { test } from "node:test";
import { offPage, onPage, send } from "./fake-page.ts";

/** A COMMAND screen whose `processInput` records what reached it. */
function commandScene(inputs: number[]) {
  const h = { active: true, cursor: 0 };
  return {
    ui: { mode: 2, handlers: { 2: h }, processInput: (b: number) => inputs.push(b) },
    phaseManager: { currentPhase: { phaseName: "CommandPhase" } },
    currentBattle: { waveIndex: 3, turn: 1 },
  };
}

test("an act on the fingerprint it was decided on runs", t => {
  const inputs: number[] = [];
  onPage(t, commandScene(inputs));
  const { fine } = send("probe", {});
  assert.deepEqual(send("press", { button: 3, fine }), { ok: true, mode: 2 });
  assert.deepEqual(inputs, [3]);
});

test("an act refuses moved when the game left the fingerprint it was decided on, and does nothing (§10.2)", t => {
  const inputs: number[] = [];
  const scene = commandScene(inputs);
  onPage(t, scene);
  const { fine: before } = send("probe", {});
  scene.ui.handlers[2].cursor = 1;
  const { fine: now } = send("probe", {});
  assert.notEqual(now, before);
  assert.deepEqual(send("press", { button: 3, fine: before }), { ok: false, why: "moved", fine: now });
  assert.deepEqual(inputs, []);
});

test("every act checks the fingerprint, not only press", t => {
  const scene = commandScene([]);
  onPage(t, scene);
  const acts = [
    send("key", { button: "ACTION", fine: "stale" }),
    send("cursor.option", { index: 0, fine: "stale" }),
    send("cursor.shop", { row: 1, col: 0, fine: "stale" }),
    send("cursor.starter", { index: 0, fine: "stale" }),
    send("cursor.learn", { row: 0, fine: "stale" }),
    send("modal", { index: 0, fine: "stale" }),
  ];
  for (const r of acts) assert.equal(r.why, "moved", JSON.stringify(r));
});

test("off the game every command but probe refuses with the locator's reason", t => {
  offPage(t);
  assert.deepEqual(send("menu", {}), { ok: false, why: "no-phaser" });
  assert.deepEqual(send("press", { button: 0, fine: "x" }), { ok: false, why: "no-phaser" });
  assert.deepEqual(send("snapshot", { detail: "lean" }), { ok: false, why: "no-phaser" });
  const probe = send("probe", {});
  assert.equal(probe.ready, false);
  assert.equal(probe.why, "no-phaser");
});
