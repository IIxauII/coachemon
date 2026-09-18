import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";

/** A move as the page holds it: the moveset entry, with the move it points at. */
function move(name: string, over: Record<string, unknown> = {}) {
  const mv = { power: 90, category: 1, type: 9, accuracy: 100, ...over };
  return { getName: () => name, getMove: () => mv, getMovePp: () => 15, ppUsed: 3 };
}

function mon(name: string, over: Record<string, unknown> = {}) {
  return {
    name,
    species: { name },
    level: 30,
    hp: 40,
    getMaxHp: () => 60,
    status: { effect: 2 },
    isFainted: () => false,
    isActive: () => true,
    getMoveset: () => [move("Flamethrower")],
    getTypes: () => [9, 2],
    getAbility: () => ({ name: "Blaze" }),
    nature: 3,
    ivs: [31, 20, 15, 10, 5, 0],
    stats: [60, 84, 78, 109, 85, 100],
    hasPassive: () => true,
    getPassiveAbility: () => ({ name: "Sturdy" }),
    getStat: (i: number) => [60, 84, 78, 109, 85, 100][i],
    summonData: { statStages: [0, 1, 0, -1, 0, 0] },
    isOnField: () => true,
    isBoss: () => false,
    bossSegments: 1,
    getHeldItems: () => [{ type: { name: "Leftovers" }, stackCount: 1 }],
    ...over,
  };
}

function battleScene(over: Record<string, unknown> = {}) {
  const party = [mon("Charizard")];
  const enemy = [mon("Gyarados", { isBoss: () => true, bossSegments: 3, bossSegmentIndex: 1, getHeldItems: () => [] })];
  return {
    ui: { mode: 0, handlers: {} },
    currentBattle: { waveIndex: 40, turn: 2, double: false, battleType: 1, enemyParty: enemy, trainer: { getName: () => "Rival" } },
    money: 1200,
    arena: { biomeId: 4 },
    modifiers: [{ type: { name: "Lure", id: "LURE" }, stackCount: 2 }],
    enemyModifiers: [],
    getPlayerParty: () => party,
    getPlayerField: () => party,
    ...over,
  };
}

test("lean and party are what they were: the coach's battle fields are full's alone (§11.4)", t => {
  onPage(t, battleScene());
  const lean = send("snapshot", { detail: "lean" });
  assert.equal(lean.party[0].stats, undefined);
  assert.equal(lean.trainer, undefined);
  const party = send("snapshot", { detail: "party" });
  assert.deepEqual(party.party[0].stats, [60, 84, 78, 109, 85, 100]);
  assert.equal(party.party[0].passive, undefined);
  assert.equal(party.party[0].held, undefined);
  assert.equal(party.trainer, undefined);
});

test("full carries probe.js's battle fields per party member (§11.4)", t => {
  onPage(t, battleScene());
  const p = send("snapshot", { detail: "full" }).party[0];
  assert.deepEqual(p.types, [9, 2]);
  assert.equal(p.ability, "Blaze");
  assert.equal(p.passive, "Sturdy");
  assert.deepEqual(p.stats, { hp: 60, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 });
  assert.deepEqual(p.statStages, [0, 1, 0, -1, 0, 0]);
  assert.equal(p.status, 2);
  assert.equal(p.onField, true);
  assert.equal(p.boss, false);
  assert.equal(p.bossBars, null);
  assert.deepEqual(p.held, ["Leftovers x1"]);
  assert.deepEqual(p.moves, [{ name: "Flamethrower", pp: 12, maxPp: 15, power: 90, category: 1, type: 9, accuracy: 100 }]);
});

test("full carries them for the enemy too, bars left of a boss's total included (§11.4)", t => {
  onPage(t, battleScene());
  const e = send("snapshot", { detail: "full" }).enemy[0];
  assert.equal(e.ability, "Blaze");
  assert.equal(e.passive, "Sturdy");
  assert.equal(e.boss, true);
  assert.deepEqual(e.bossBars, { left: 2, of: 3 });
  assert.deepEqual(e.held, []);
  assert.equal(e.moves.length, 1);
});

test("full names the trainer, and null in a wild fight (§11.4)", t => {
  onPage(t, battleScene());
  assert.equal(send("snapshot", { detail: "full" }).trainer, "Rival");
});

test("a wild wave has no trainer and no passive on a mon without one", t => {
  const scene = battleScene();
  delete (scene.currentBattle as Record<string, unknown>).trainer;
  (scene.getPlayerParty() as Record<string, unknown>[])[0].hasPassive = () => false;
  onPage(t, scene);
  const full = send("snapshot", { detail: "full" });
  assert.equal(full.trainer, null);
  assert.equal(full.party[0].passive, null);
});

test("a mon whose every coach path throws still reads, field by field (§6.2 fault isolation)", t => {
  const broken = {
    name: "Broken",
    get species(): never {
      throw new Error("gone");
    },
    getMaxHp: () => {
      throw new Error("gone");
    },
    getTypes: () => {
      throw new Error("gone");
    },
    getStat: () => {
      throw new Error("gone");
    },
    getHeldItems: () => {
      throw new Error("gone");
    },
    hp: 1,
  };
  onPage(t, battleScene({ getPlayerParty: () => [broken], getPlayerField: () => [broken] }));
  const p = send("snapshot", { detail: "full" }).party[0];
  assert.equal(p.name, "Broken");
  assert.equal(p.stats, null);
  assert.equal(p.held, null);
  assert.equal(p.types, null);
});
