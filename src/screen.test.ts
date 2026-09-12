import assert from "node:assert/strict";
import { test } from "node:test";
import { LADDER } from "./escape-ladder/table.ts";
import { isSettingsMode, screenId, type Discriminators } from "./screen.ts";

const none: Discriminators = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

test("plain modes map to their name", () => {
  assert.equal(screenId(2, none), "COMMAND");
  assert.equal(screenId(6, none), "MODIFIER_SELECT");
});

test("PARTY carries the PartyUiMode and the option phase", () => {
  assert.equal(screenId(8, { ...none, partyUiMode: 1 }), "PARTY/FAINT_SWITCH");
  assert.equal(screenId(8, { ...none, partyUiMode: 4, optionsMode: true }), "PARTY/MODIFIER:options");
  assert.equal(screenId(8, none), "PARTY");
});

test("SAVE_SLOT, SUMMARY and ALERT_MODAL discriminators", () => {
  assert.equal(screenId(7, { ...none, saveSlotUiMode: 1 }), "SAVE_SLOT/SAVE");
  assert.equal(screenId(7, { ...none, saveSlotUiMode: 0 }), "SAVE_SLOT/LOAD");
  assert.equal(screenId(9, { ...none, summaryUiMode: 1 }), "SUMMARY/LEARN_MOVE");
  assert.equal(screenId(9, { ...none, summaryUiMode: 0 }), "SUMMARY");
  assert.equal(screenId(47, { ...none, alertClosable: true }), "ALERT_MODAL/CLOSABLE");
});

test("unknown mode degrades to UNKNOWN(n)", () => {
  assert.equal(screenId(99, none), "UNKNOWN(99)");
});

test("every composite id the driver can produce for PARTY has a ladder entry", () => {
  for (let p = 0; p < 14; p++) {
    const id = screenId(8, { ...none, partyUiMode: p });
    assert.ok(id in LADDER, `${id} missing from the escape ladder`);
  }
});

test("settings modes are 18–24", () => {
  assert.ok(isSettingsMode(18) && isSettingsMode(24));
  assert.ok(!isSettingsMode(17) && !isSettingsMode(25));
});
