import assert from "node:assert/strict";
import { test } from "node:test";
import { UiMode } from "../enums/generated.ts";
import { onPage, send } from "./fake-page.ts";

/** One unlocked species as `gameData` holds it: the dex entry it was caught with, and its starter progress. */
function gameData(over: Record<string, unknown> = {}) {
  return {
    dexData: {
      4: { caughtAttr: 255n, ivs: [31, 20, 15, 10, 5, 0] },
      7: { caughtAttr: 0n, ivs: [31, 31, 31, 31, 31, 31] },
    },
    starterData: {
      4: { passiveAttr: 1, abilityAttr: 5, eggMoves: 3, valueReduction: 1, candyCount: 40 },
      7: { passiveAttr: 0, abilityAttr: 1, eggMoves: 0, valueReduction: 0, candyCount: 0 },
    },
    getSpeciesStarterValue: (id: number) => (id === 4 ? 3 : 4),
    ...over,
  };
}

/** The starter grid, with `starters` cursor state and two containers on it. */
function gridScene() {
  const h = {
    cursor: 2,
    scrollCursor: 1,
    filteredStarterContainers: [{ species: { name: "Charmander", speciesId: 4 } }, { species: { name: "Squirtle", speciesId: 7 } }],
    starterSpecies: [{ name: "Charmander" }],
    getValueLimit: () => 10,
    isPartyValid: () => true,
  };
  return { ui: { mode: UiMode.STARTER_SELECT, handlers: { [UiMode.STARTER_SELECT]: h } }, gameData: gameData() };
}

test("the grid fields start_run uses are unchanged, and every unlocked species comes with them (§11.4)", t => {
  onPage(t, gridScene());
  const r = send("starters", {});
  assert.equal(r.ok, true);
  assert.equal(r.cursor, 2);
  assert.equal(r.scrollCursor, 1);
  assert.deepEqual(r.grid, [{ i: 0, name: "Charmander", id: 4, cost: 3 }, { i: 1, name: "Squirtle", id: 7, cost: 4 }]);
  assert.deepEqual(r.party, ["Charmander"]);
  assert.equal(r.valueLimit, 10);
  assert.equal(r.partyValid, true);
  // Only what the dex says was caught is owned: Squirtle's `caughtAttr` is 0.
  assert.deepEqual(r.owned, [{ id: 4, cost: 3, ivTotal: 81, passiveUnlocked: true, hiddenAbility: true, eggMoves: 3, costReduction: 1, candy: 40 }]);
});

test("off the starter grid the owned species still read, with no cost and an empty grid (§11.4)", t => {
  onPage(t, { ui: { mode: UiMode.TITLE, handlers: {} }, gameData: gameData() });
  const r = send("starters", {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.grid, []);
  assert.equal(r.cursor, null);
  assert.equal(r.valueLimit, null);
  assert.deepEqual(r.owned.map((o: { id: number; cost: number | null }) => [o.id, o.cost]), [[4, null]]);
});

test("a species the dex holds but starterData does not is skipped rather than read as unowned bits", t => {
  onPage(t, { ui: { mode: UiMode.TITLE, handlers: {} }, gameData: gameData({ starterData: {} }) });
  assert.deepEqual(send("starters", {}).owned, []);
});

test("a gameData that throws on every path leaves the read ok and empty (§6.2 fault isolation)", t => {
  onPage(t, {
    ui: { mode: UiMode.TITLE, handlers: {} },
    get gameData(): never {
      throw new Error("no save loaded");
    },
  });
  const r = send("starters", {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.owned, []);
  assert.deepEqual(r.grid, []);
});
