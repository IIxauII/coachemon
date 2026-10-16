import assert from "node:assert/strict";
import { test } from "node:test";
import { starterGrid } from "./fake-page.ts";
import { starter } from "./starter.ts";

const NAMES: Record<number, string> = { 1: "Bulbasaur", 4: "Charmander", 7: "Squirtle" };

test("a species is named off screen without adding a sprite to the scene", () => {
  // Only Bulbasaur and Charmander fill a container; Squirtle is in no container at all.
  const { h, sprites } = starterGrid(NAMES, [1, 4]);
  const { nameOf } = starter(h);
  assert.equal(nameOf(7), "Squirtle");
  assert.equal(nameOf(4), "Charmander");
  assert.equal(sprites.added, 0);
});

test("the value limit is the number after the slash in the party value label", () => {
  const { h } = starterGrid(NAMES, [1]);
  h.valueLimitLabel.text = "7.5/12";
  assert.equal(starter(h).valueLimit(), 12);
});

test("a label without a limit reads as no limit", () => {
  const { h } = starterGrid(NAMES, [1]);
  h.valueLimitLabel.text = "";
  assert.equal(starter(h).valueLimit(), null);
});

test("with no starter handler nothing is named and there is no limit", () => {
  const { nameOf, valueLimit } = starter(undefined);
  assert.equal(nameOf(1), null);
  assert.equal(valueLimit(), null);
});
