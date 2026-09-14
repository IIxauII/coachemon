import assert from "node:assert/strict";
import { test } from "node:test";
import { UiMode } from "./enums/generated.ts";
import { isOverwriteConfirm, planSlot, slotLabel } from "./slots.ts";

// The #28 screen: slots 1–2 hold runs, 3–5 are empty.
const screen = [0, 1, 2, 3, 4].map(i => ({ i, label: `Slot ${i + 1}`, hasData: i < 2 }));

test("free and occupied are the labels select_option accepts", () => {
  const plan = planSlot(screen, undefined);
  assert.deepEqual(plan.free, ["Slot 3", "Slot 4", "Slot 5"]);
  assert.deepEqual(plan.occupied, ["Slot 1", "Slot 2"]);
});

test("the default slot is the lowest free one, named by its own label", () => {
  const plan = planSlot(screen, undefined);
  assert.equal(plan.chosen?.i, 2);
  assert.equal(slotLabel(plan.chosen!), "Slot 3");
  assert.ok(plan.free.includes(slotLabel(plan.chosen!)));
});

test("an explicit slot index picks the option with that index", () => {
  const plan = planSlot(screen, 1);
  assert.equal(slotLabel(plan.chosen!), "Slot 2");
  assert.ok(plan.occupied.includes(slotLabel(plan.chosen!)));
});

test("unresolved hasData counts as free; no free slot leaves chosen undefined", () => {
  assert.deepEqual(planSlot([{ i: 0, label: "Slot 1", hasData: null }], undefined).free, ["Slot 1"]);
  assert.equal(planSlot(screen.map(o => ({ ...o, hasData: true })), undefined).chosen, undefined);
});

test("a missing label falls back to the 1-based name", () => {
  assert.equal(slotLabel({ i: 4, label: null }), "Slot 5");
});

test("the overwrite confirm is a CONFIRM over SAVE_SLOT in SelectStarterPhase, not the wave-1 switch question (#30)", () => {
  assert.equal(isOverwriteConfirm({ mode: UiMode.CONFIRM, phaseName: "SelectStarterPhase", modeChain: [UiMode.TITLE, UiMode.TITLE, UiMode.SAVE_SLOT] }), true);
  assert.equal(isOverwriteConfirm({ mode: UiMode.CONFIRM, phaseName: "CheckSwitchPhase", modeChain: [UiMode.TITLE] }), false);
  assert.equal(isOverwriteConfirm({ mode: UiMode.CONFIRM, phaseName: "SelectStarterPhase", modeChain: [UiMode.TITLE, UiMode.STARTER_SELECT] }), false, "the Begin-with-these-Pokémon confirm");
  assert.equal(isOverwriteConfirm({ mode: UiMode.SAVE_SLOT, phaseName: "SelectStarterPhase", modeChain: [UiMode.TITLE, UiMode.SAVE_SLOT] }), false);
});
