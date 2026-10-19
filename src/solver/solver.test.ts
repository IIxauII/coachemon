import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import type { Battle, SessionSave } from "./input.ts";
import type { Clone } from "./replay.ts";
import { DEFAULT_BUDGET, gate, solve } from "./solver.ts";

const RECHECKED = reviewed.recheck.gameVersion;
const drayton: { live: Battle; liveExport: SessionSave; save: SessionSave } = JSON.parse(
  readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8"),
);
/** A run saved at a wave's start on an older game, continued after the game updated to the clone's version (#763). */
const continued = {
  ...drayton,
  liveExport: { ...drayton.liveExport, gameVersion: RECHECKED },
  cloneVersion: RECHECKED,
  budget: DEFAULT_BUDGET,
};

test("a player's wave-start save from an older game passes the gate once the live game serves the clone's version (#764)", () => {
  assert.notEqual(drayton.save.gameVersion, RECHECKED, "the fixture's save is from an older game");
  assert.equal(gate(continued), null);
  assert.equal(gate({ ...continued, liveExport: drayton.liveExport })?.reason.code, "version_mismatch");
});

test("a player's solve of a continued run carries its save, holding the scene to the live export as migrated (#764)", async () => {
  const handed: Parameters<Clone>[0][] = [];
  const clone: Clone = async job => {
    handed.push(job);
    return { out: undefined };
  };

  const result = await solve(continued, { clone, workers: 1 });

  assert.equal(result.kind === "no_answer" && result.reason.code, "harness_failed");
  assert.deepEqual(JSON.parse(handed[0].input), { save: drayton.save, inputs: [], liveExport: continued.liveExport });
});
