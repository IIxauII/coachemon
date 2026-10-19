import assert from "node:assert/strict";
import { test } from "node:test";
import { MoveId, SpeciesId, StatusEffect } from "../enums/generated.ts";
import { GORDIE_LINE } from "./fixtures/oracle-line.ts";
import { pageOracleLine } from "./oracle-line.ts";

const withoutIds = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (["move", "species", "status"].includes(k) ? undefined : x)));

test("the page gets every move, species and status of the oracle line as the game's own id (#670)", () => {
  const [t11, , t13, t14, , t16] = pageOracleLine(GORDIE_LINE).steps;
  assert.deepEqual(t11.input, { kind: "switch", to: { slot: 4, species: SpeciesId.LEAVANNY } });
  assert.deepEqual(t13.input, { kind: "move", move: MoveId.BUG_BITE, tera: false, replacement: { slot: 5, species: SpeciesId.GOLBAT } });
  assert.deepEqual(t16.input, { kind: "move", move: MoveId.HYDRO_PUMP, tera: true });
  assert.deepEqual(t14.checkpoint.foes.find(m => m.species === SpeciesId.TYRANITAR)?.status, StatusEffect.TOXIC);
  assert.deepEqual(t14.checkpoint.ours.find(m => m.species === SpeciesId.GOLBAT)?.status, StatusEffect.NONE);
});

test("the rest of the oracle line reaches the page as the solver wrote it (#670)", () => {
  assert.deepEqual(withoutIds(pageOracleLine(GORDIE_LINE)), withoutIds(GORDIE_LINE));
});

test("a turn with no input of its own stays one with no input (#670)", () => {
  const line = { ...GORDIE_LINE, steps: [{ ...GORDIE_LINE.steps[0], input: null }] };
  assert.equal(pageOracleLine(line).steps[0].input, null);
});

test("a turn the game plays for us reaches the page with its faint replacement as the game's own id (#702)", () => {
  const line = { ...GORDIE_LINE, steps: [{ ...GORDIE_LINE.steps[0], input: { kind: "queued", replacement: { slot: 5, species: "GOLBAT" } } as const }] };
  assert.deepEqual(pageOracleLine(line).steps[0].input, { kind: "queued", replacement: { slot: 5, species: SpeciesId.GOLBAT } });
});

test("a step's learn picks reach the page as the game's own ids, a declined one's forget as null (#673)", () => {
  const learns = [
    { slot: 5, species: "GOLBAT", move: "CROSS_POISON", forget: "BITE" },
    { slot: 5, species: "GOLBAT", move: "AIR_SLASH", forget: null },
  ] as const;
  const steps = [
    { ...GORDIE_LINE.steps[0], input: { kind: "move", move: "BUG_BITE", tera: false, learns } as const },
    { ...GORDIE_LINE.steps[1], input: { kind: "queued", learns: [learns[1]] } as const },
  ];
  const [moved, queued] = pageOracleLine({ ...GORDIE_LINE, steps }).steps;
  const airSlash = { slot: 5, species: SpeciesId.GOLBAT, move: MoveId.AIR_SLASH, forget: null };

  assert.deepEqual(moved.input, {
    kind: "move",
    move: MoveId.BUG_BITE,
    tera: false,
    learns: [{ slot: 5, species: SpeciesId.GOLBAT, move: MoveId.CROSS_POISON, forget: MoveId.BITE }, airSlash],
  });
  assert.deepEqual(queued.input, { kind: "queued", learns: [airSlash] });
});

test("a double step reaches the page with each command's move and switch, and each replacement, as the game's own ids (#788)", () => {
  const input = {
    kind: "double",
    commands: [{ kind: "move", move: "EARTH_POWER", tera: false, target: { side: "foes", field: 0 } }, { kind: "switch", to: { slot: 3, species: "SNORLAX" } }],
    replacements: [{ slot: 5, species: "GYARADOS", field: 1 }],
    learns: [{ slot: 0, species: "PROBOPASS", move: "POWER_GEM", forget: null }],
  } as const;
  const line = { ...GORDIE_LINE, steps: [{ ...GORDIE_LINE.steps[0], input }, { ...GORDIE_LINE.steps[1], input: { kind: "double", commands: [null, null], replacements: [input.replacements[0]] } as const }] };

  const [both, queued] = pageOracleLine(line).steps;

  assert.deepEqual(both.input, {
    kind: "double",
    commands: [
      { kind: "move", move: MoveId.EARTH_POWER, tera: false, target: { side: "foes", field: 0 } },
      { kind: "switch", to: { slot: 3, species: SpeciesId.SNORLAX } },
    ],
    replacements: [{ slot: 5, species: SpeciesId.GYARADOS, field: 1 }],
    learns: [{ slot: 0, species: SpeciesId.PROBOPASS, move: MoveId.POWER_GEM, forget: null }],
  });
  assert.deepEqual(queued.input, { kind: "double", commands: [null, null], replacements: [{ slot: 5, species: SpeciesId.GYARADOS, field: 1 }] });
});
