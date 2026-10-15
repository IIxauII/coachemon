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
