import assert from "node:assert/strict";
import test from "node:test";
import { momentsOf } from "./moments.ts";

test("a switch-out counts only in a trainer fight, ours by the commit step and the foe's by its withdraw (#484)", () => {
  assert.deepEqual(momentsOf({ intent: "switch", messages: [], trainer: true }), ["switch"]);
  assert.deepEqual(momentsOf({ intent: "switch", messages: [], trainer: false }), []);
  assert.deepEqual(momentsOf({ messages: ["Youngster Tommy withdrew\nRattata!", "Youngster Tommy sent out\nPidgey!"], trainer: true }), ["switch"]);
  assert.deepEqual(momentsOf({ messages: ["Youngster Tommy\nwould like to battle!", "Youngster Tommy sent out\nRattata!"], trainer: true }), [], "a lead is no switch");
});

test("a level-up, a learn, a shop pick and our faint are each their moment (#484)", () => {
  assert.deepEqual(momentsOf({ messages: ["Charmander grew to\nLv. 7!"], trainer: false }), ["levelup"]);
  assert.deepEqual(momentsOf({ intent: "learn", messages: [], trainer: false }), ["levelup"]);
  assert.deepEqual(momentsOf({ intent: "shop", messages: [], trainer: false }), ["shop"]);
  assert.deepEqual(momentsOf({ messages: ["Bulbasaur fainted!"], trainer: false }), ["faint"]);
  assert.deepEqual(momentsOf({ intent: "replace", messages: [], trainer: false }), ["faint"]);
  assert.deepEqual(momentsOf({ messages: ["Wild Weedle fainted!", "Foe Sentret fainted!"], trainer: false }), [], "a foe's faint is not ours");
  assert.deepEqual(momentsOf({ messages: ["Foe Pidgey fainted!", "Charmander grew to\nLv. 8!"], trainer: true }), ["levelup"]);
});
