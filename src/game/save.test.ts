import assert from "node:assert/strict";
import { test } from "node:test";
import { OTHER_RUN, RUN, W176, W180, WRONG_KEY } from "./fixtures/saves.ts";
import { waveStartSave } from "./save.ts";

test("the wave-start save opens to the JSON the game stored (game-code.md §28)", () => {
  assert.deepEqual(waveStartSave([W180], { seed: RUN, wave: 180 }), { seed: RUN, waveIndex: 180, gameVersion: "1.12.0.11" });
});

test("of every account's copy for the slot, the wave-start save is the one carrying the run's seed (game-code.md §28)", () => {
  assert.equal(waveStartSave([OTHER_RUN, W180], { seed: RUN, wave: 180 })?.seed, RUN);
  assert.equal(waveStartSave([OTHER_RUN], { seed: RUN, wave: 180 }), null);
});

test("two copies of the run prefer the battle's wave, and a stale one alone still comes back for its wave to be checked (#636)", () => {
  assert.equal(waveStartSave([W176, W180], { seed: RUN, wave: 180 })?.waveIndex, 180);
  assert.equal(waveStartSave([W176], { seed: RUN, wave: 180 })?.waveIndex, 176);
});

test("a copy that is not the game's encryption is skipped, never thrown on", () => {
  assert.equal(waveStartSave([WRONG_KEY, "not base64 at all", "", btoa("Salted__")], { seed: RUN, wave: 180 }), null);
  assert.equal(waveStartSave([], { seed: RUN, wave: 180 }), null);
});
