import assert from "node:assert/strict";
import { test } from "node:test";
import { OTHER_RUN_W180, RUN_SEED, RUN_W176, RUN_W180, WRONG_KEY_W180 } from "./fixtures/saves.ts";
import { waveStartSave } from "./save.ts";

const LIVE = { seed: RUN_SEED, wave: 180 };

test("the wave-start save opens to the JSON the game stored (game-code.md §29)", () => {
  assert.deepEqual(waveStartSave([RUN_W180], LIVE), { seed: RUN_SEED, waveIndex: 180, gameVersion: "1.12.0.11" });
});

test("of every account's copy for the slot, the wave-start save is the one carrying the run's seed (game-code.md §29)", () => {
  assert.equal(waveStartSave([OTHER_RUN_W180, RUN_W180], LIVE)?.seed, RUN_SEED);
  assert.equal(waveStartSave([OTHER_RUN_W180], LIVE), null);
});

test("two copies of the run prefer the battle's wave, and a stale one alone still comes back for its wave to be checked (#636)", () => {
  assert.equal(waveStartSave([RUN_W176, RUN_W180], LIVE)?.waveIndex, 180);
  assert.equal(waveStartSave([RUN_W176], LIVE)?.waveIndex, 176);
});

test("a copy that is not the game's encryption is skipped, never thrown on", () => {
  assert.equal(waveStartSave([WRONG_KEY_W180, "not base64 at all", "", btoa("Salted__")], LIVE), null);
  assert.equal(waveStartSave([], LIVE), null);
});
