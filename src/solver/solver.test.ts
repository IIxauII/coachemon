import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ArenaTagSide, BattleType, GameModes, MysteryEncounterType, TrainerVariant } from "../enums/generated.ts";
import { DEFAULT_BUDGET, type SessionSave, type SolveInput, solve } from "./solver.ts";

const PIN = "1.12.0.11";
const drayton: SessionSave = JSON.parse(
  readFileSync(new URL("./fixtures/drayton-w188.wave-start.json", import.meta.url), "utf8"),
);

const ask = (input: Partial<SolveInput>) =>
  solve({ save: drayton, gameVersion: PIN, budget: DEFAULT_BUDGET, recheck: { gameVersion: PIN }, ...input });

test("a save the gate lets through gets no answer, because solving is not built yet (#659)", async () => {
  assert.deepEqual(await ask({}), {
    kind: "no_answer",
    reason: { code: "not_built" },
    message: "solving not built yet",
  });
});

test("a save from a newer game gets no answer naming the live version and the version solving waits on (#659)", async () => {
  const result = await ask({ save: { ...drayton, gameVersion: "1.12.1.0" } });

  assert.equal(result.kind, "no_answer");
  assert.deepEqual(result.reason, { code: "version_mismatch", live: "1.12.1.0", clone: PIN });
  assert.match(result.message, /live game is 1\.12\.1\.0/);
  assert.match(result.message, /runs on 1\.12\.0\.11/);
  assert.match(result.message, /waits on a Coachemon release pinned to 1\.12\.1\.0/);
});

test("a Daily gets no answer, never one that waits on a release: solving is not offered there at all (#659)", async () => {
  for (const save of [
    { ...drayton, gameMode: GameModes.DAILY },
    { ...drayton, gameMode: GameModes.DAILY, gameVersion: "1.12.1.0" },
  ]) {
    const result = await ask({ save });

    assert.equal(result.kind, "no_answer");
    assert.deepEqual(result.reason, { code: "daily" });
    assert.match(result.message, /Daily/);
  }
});

test("a game version whose harness re-check has not passed gets no answer, with no record or another version's (#659)", async () => {
  for (const recheck of [null, { gameVersion: "1.12.0.10" }]) {
    const result = await ask({ recheck });

    assert.equal(result.kind, "no_answer");
    assert.deepEqual(result.reason, { code: "not_rechecked", version: PIN });
    assert.match(result.message, /re-checked on game version 1\.12\.0\.11/);
  }
});

test("a Mystery Encounter battle gets no answer, by its battle type or its encounter (#659)", async () => {
  const encounter = MysteryEncounterType.FIGHT_OR_FLIGHT;
  for (const save of [
    { ...drayton, battleType: BattleType.MYSTERY_ENCOUNTER, mysteryEncounterType: encounter, trainer: null },
    { ...drayton, mysteryEncounterType: encounter },
  ]) {
    const result = await ask({ save });

    assert.equal(result.kind, "no_answer");
    assert.deepEqual(result.reason, { code: "mystery_encounter" });
  }
});

test("a double gets no answer, as the game decides one on load: a double trainer, or a wild battle with two foes (#659)", async () => {
  const [foe] = drayton.enemyParty;
  for (const save of [
    { ...drayton, trainer: { trainerType: drayton.trainer!.trainerType, variant: TrainerVariant.DOUBLE } },
    { ...drayton, battleType: BattleType.WILD, trainer: null, enemyParty: [foe, foe] },
  ]) {
    const result = await ask({ save });

    assert.equal(result.kind, "no_answer");
    assert.deepEqual(result.reason, { code: "double" });
  }
});

test("Safeguard up mid-fight gets no answer, on either side, though no save ever carries it (#659)", async () => {
  for (const side of [ArenaTagSide.PLAYER, ArenaTagSide.ENEMY]) {
    const arenaTags = [
      { tagType: "REFLECT", side: ArenaTagSide.PLAYER },
      { tagType: "SAFEGUARD", side },
    ];
    const result = await ask({ extras: { arenaTags } });

    assert.equal(result.kind, "no_answer");
    assert.deepEqual(result.reason, { code: "safeguard" });
  }
});

test("an item the clone drops on load gets no answer naming it: a type or a class the pinned game lacks (#659)", async () => {
  const [ours] = drayton.modifiers;
  const [theirs] = drayton.enemyModifiers;
  const save = {
    ...drayton,
    modifiers: [...drayton.modifiers, { ...ours, typeId: "GOLDEN_SHINY_CHARM" }],
    enemyModifiers: [...drayton.enemyModifiers, { ...theirs, className: "FutureHeldItemModifier" }],
  };
  const result = await ask({ save });

  assert.equal(result.kind, "no_answer");
  assert.deepEqual(result.reason, { code: "dropped_item", items: ["GOLDEN_SHINY_CHARM", theirs.typeId] });
  assert.match(result.message, new RegExp(`GOLDEN_SHINY_CHARM, ${theirs.typeId}`));
});

test("a fight the oracle can't replay is refused for itself, not for a re-check a release would bring (#659)", async () => {
  const save = { ...drayton, trainer: { trainerType: drayton.trainer!.trainerType, variant: TrainerVariant.DOUBLE } };

  const result = await ask({ save, recheck: null });

  assert.equal(result.kind, "no_answer");
  assert.deepEqual(result.reason, { code: "double" });
});

test("a save from an older game than the clone's waits on the game catching up, not on a release (#659)", async () => {
  const result = await ask({ save: { ...drayton, gameVersion: "1.12.0.9" } });

  assert.equal(result.kind, "no_answer");
  assert.deepEqual(result.reason, { code: "version_mismatch", live: "1.12.0.9", clone: PIN });
  assert.match(result.message, /live game is 1\.12\.0\.9/);
  assert.match(result.message, /waits on the game serving 1\.12\.0\.11/);
});
