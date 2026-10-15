import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ArenaTagSide, BattleType, GameModes, MysteryEncounterType, TrainerVariant } from "../enums/generated.ts";
import { refuse } from "./gate.ts";
import type { MidFightExtras, Recheck, SessionSave } from "./input.ts";

const PIN = "1.12.0.11";
const drayton: SessionSave = JSON.parse(readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8")).save;
const doubleDrayton = { ...drayton, trainer: { trainerType: drayton.trainer!.trainerType, variant: TrainerVariant.DOUBLE } };

const ask = (
  input: { save?: SessionSave; extras?: MidFightExtras },
  recheck: Recheck | null = { gameVersion: PIN },
) => refuse({ save: drayton, cloneVersion: PIN, ...input }, recheck);

test("a wave-start save at the clone's re-checked version passes the gate (#659)", () => {
  assert.equal(ask({}), null);
});

test("a save from a newer game gets no answer naming the live version and the version solving waits on (#659)", () => {
  const result = ask({ save: { ...drayton, gameVersion: "1.12.1.0" } });

  assert.deepEqual(result?.reason, { code: "version_mismatch", live: "1.12.1.0", clone: PIN });
  assert.match(result.message, /live game is 1\.12\.1\.0/);
  assert.match(result.message, /runs on 1\.12\.0\.11/);
  assert.match(result.message, /waits on a Coachemon release pinned to 1\.12\.1\.0/);
});

test("a save from an older game than the clone's waits on the game catching up, not on a release (#659)", () => {
  const result = ask({ save: { ...drayton, gameVersion: "1.12.0.9" } });

  assert.deepEqual(result?.reason, { code: "version_mismatch", live: "1.12.0.9", clone: PIN });
  assert.match(result.message, /live game is 1\.12\.0\.9/);
  assert.match(result.message, /waits on the game serving 1\.12\.0\.11/);
});

test("a Daily gets no answer, never one that waits on a release: solving is not offered there at all (#659)", () => {
  for (const save of [
    { ...drayton, gameMode: GameModes.DAILY },
    { ...drayton, gameMode: GameModes.DAILY, gameVersion: "1.12.1.0" },
  ]) {
    const result = ask({ save });

    assert.deepEqual(result?.reason, { code: "daily" });
    assert.match(result.message, /Daily/);
  }
});

test("a game version whose harness re-check has not passed gets no answer, with no record or another version's (#659)", () => {
  for (const recheck of [null, { gameVersion: "1.12.0.10" }]) {
    const result = ask({}, recheck);

    assert.deepEqual(result?.reason, { code: "not_rechecked", version: PIN });
    assert.match(result.message, /re-checked on game version 1\.12\.0\.11/);
  }
});

test("a Mystery Encounter battle gets no answer, by its battle type or its encounter (#659)", () => {
  const encounter = MysteryEncounterType.FIGHT_OR_FLIGHT;
  for (const save of [
    { ...drayton, battleType: BattleType.MYSTERY_ENCOUNTER, mysteryEncounterType: encounter, trainer: null },
    { ...drayton, mysteryEncounterType: encounter },
  ]) {
    assert.deepEqual(ask({ save })?.reason, { code: "mystery_encounter" });
  }
});

test("a double gets no answer: a trainer saved as a double, or a wild battle with two foes (#659)", () => {
  const [foe] = drayton.enemyParty;
  for (const save of [doubleDrayton, { ...drayton, battleType: BattleType.WILD, trainer: null, enemyParty: [foe, foe] }]) {
    assert.deepEqual(ask({ save })?.reason, { code: "double" });
  }
});

test("Safeguard up mid-fight gets no answer, on either side, though no save ever carries it (#659)", () => {
  for (const side of [ArenaTagSide.PLAYER, ArenaTagSide.ENEMY]) {
    const arenaTags = [
      { tagType: "REFLECT", side: ArenaTagSide.PLAYER },
      { tagType: "SAFEGUARD", side },
    ];

    assert.deepEqual(ask({ extras: { arenaTags } })?.reason, { code: "safeguard" });
  }
});

test("an item the clone drops on load gets no answer naming it: a type or a class the pinned game lacks (#659)", () => {
  const [ours] = drayton.modifiers;
  const [theirs] = drayton.enemyModifiers;
  const save = {
    ...drayton,
    modifiers: [...drayton.modifiers, { ...ours, typeId: "GOLDEN_SHINY_CHARM" }],
    enemyModifiers: [...drayton.enemyModifiers, { ...theirs, className: "FutureHeldItemModifier" }],
  };
  const result = ask({ save });

  assert.deepEqual(result?.reason, { code: "dropped_item", items: ["GOLDEN_SHINY_CHARM", theirs.typeId] });
  assert.match(result.message, new RegExp(`GOLDEN_SHINY_CHARM, ${theirs.typeId}`));
});

test("a fight the oracle can't replay is refused for itself, not for a re-check a release would bring (#659)", () => {
  assert.deepEqual(ask({ save: doubleDrayton }, null)?.reason, { code: "double" });
});
