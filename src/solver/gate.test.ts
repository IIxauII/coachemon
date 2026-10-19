import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ArenaTagSide, BattleType, GameModes, MysteryEncounterType, TrainerVariant } from "../enums/generated.ts";
import { carryOf, refuse } from "./gate.ts";
import type { MidFightExtras, Recheck, SessionSave } from "./input.ts";

const PIN = "1.12.0.11";
const drayton: SessionSave = JSON.parse(readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8")).save;
const t5: { save: SessionSave; extras: MidFightExtras } = JSON.parse(
  readFileSync(new URL("./fixtures/gordie-w180.t5.json", import.meta.url), "utf8"),
);
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

test("a known fight's save from an older game passes the gate when the re-check carries it to the clone's version (#703)", () => {
  const save = { ...drayton, gameVersion: "1.12.0.9" };

  assert.equal(refuse({ save, cloneVersion: PIN }, { gameVersion: PIN }, { carried: true }), null);
  assert.equal(refuse({ save: drayton, cloneVersion: "1.12.1.1" }, { gameVersion: "1.12.1.1" }, { carried: true }), null);
});

test("a carried save from a newer game than the clone's still gets no answer: no game migrates a save backwards (#703)", () => {
  const result = refuse({ save: drayton, cloneVersion: "1.12.0.9" }, { gameVersion: "1.12.0.9" }, { carried: true });

  assert.deepEqual(result?.reason, { code: "version_mismatch", live: PIN, clone: "1.12.0.9" });
});

test("a player's save from an older game carries when the live game already serves the clone's version (#764)", () => {
  const save = { ...drayton, gameVersion: "1.12.0.9" };
  const carry = carryOf({ save, liveExport: drayton, cloneVersion: PIN });

  assert.deepEqual(carry, { carried: true });
  assert.equal(refuse({ save, cloneVersion: PIN }, { gameVersion: PIN }, carry), null);
});

test("a player's save never carries while the live game isn't on the clone's version, or from a newer game (#764)", () => {
  const older = { ...drayton, gameVersion: "1.12.0.9" };
  for (const input of [
    { save: older, cloneVersion: PIN },
    { save: older, liveExport: older, cloneVersion: PIN },
    { save: older, liveExport: { ...drayton, gameVersion: "1.12.1.0" }, cloneVersion: PIN },
    { save: drayton, liveExport: older, cloneVersion: "1.12.0.9" },
    { save: drayton, liveExport: drayton, cloneVersion: PIN },
  ]) {
    assert.deepEqual(carryOf(input), { carried: false }, `${input.save.gameVersion} on ${input.liveExport?.gameVersion}`);
  }
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

    assert.deepEqual(ask({ ...t5, extras: { ...t5.extras, arenaTags } })?.reason, { code: "safeguard" });
  }
});

test("an augmented export with every extra passes the gate (#664)", () => {
  assert.equal(ask(t5), null);
});

test("an augmented export missing any extra gets no answer naming each one it lacks (#664)", () => {
  const { turn: _turn, rndState: _rnd, ...rest } = t5.extras;
  const result = ask({ ...t5, extras: { ...rest, arenaTags: null, unread: ["arenaTags"] } as unknown as MidFightExtras });

  assert.deepEqual(result?.reason, { code: "missing_extras", extras: ["arenaTags", "rndState", "turn"] });
  assert.match(result.message, /lacks arenaTags, rndState and turn/);
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
