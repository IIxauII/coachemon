import assert from "node:assert/strict";
import { test } from "node:test";
import { ladderFor } from "./lookup.ts";

const PINNED = "1.12.0.11";

test("a known screen offers its curated rungs, ending with the reload", () => {
  const report = ladderFor({ screen: "MODIFIER_SELECT", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "ladder");
  assert.equal(report.rungs[0].do, "press");
  assert.deepEqual(report.rungs.at(-1), {
    do: "reload",
    risk: "destructive",
    discards: "all progress since the last save — up to four waves",
    effect: "CDP page reload; the run resumes from the last synced save via Continue",
    provenance: "source",
  });
});

test("a live version other than the pinned one suppresses every rung and says why", () => {
  const report = ladderFor({ screen: "MODIFIER_SELECT", liveVersion: "1.12.1.0", tutorialActive: false });

  assert.equal(report.status, "suppressed");
  assert.equal(report.reason, "version_mismatch");
  assert.deepEqual(report.rungs, []);
  assert.match(report.message, /1\.12\.1\.0/);
  assert.match(report.message, /1\.12\.0\.11/);
});

test("an active tutorial suppresses the ladder, because CANCEL acts as ACTION there", () => {
  const report = ladderFor({ screen: "MODIFIER_SELECT", liveVersion: PINNED, tutorialActive: true });

  assert.equal(report.status, "suppressed");
  assert.equal(report.reason, "tutorial_active");
  assert.deepEqual(report.rungs, []);
});

test("a composite id falls back from the option phase to the mode-wide option entry", () => {
  const report = ladderFor({ screen: "PARTY/FAINT_SWITCH:options", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "ladder");
  assert.equal(report.matched, "PARTY:options");
  assert.equal(report.cancelEffect, "exits");
});

test("CANCEL on a faint switch is reported as doing nothing, and the ladder asks for an untried option", () => {
  const report = ladderFor({ screen: "PARTY/FAINT_SWITCH", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "ladder");
  assert.equal(report.class, "must_answer");
  assert.equal(report.cancelEffect, "rejected");
  assert.equal(report.rungs[0].do, "select_untried_option");
});

test("CANCEL in the shop opens the skip-item confirm rather than leaving", () => {
  const report = ladderFor({ screen: "MODIFIER_SELECT", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "ladder");
  assert.equal(report.cancelEffect, "asks_confirm");
});

test("a discriminator the table does not know falls back to the mode's entry", () => {
  const report = ladderFor({ screen: "SAVE_SLOT/SOMETHING_NEW", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "ladder");
  assert.equal(report.matched, "SAVE_SLOT");
});

test("an unmodelled screen gets no rungs, not even the reload", () => {
  const report = ladderFor({ screen: "UNKNOWN(52)", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "unknown_screen");
  assert.deepEqual(report.rungs, []);
});

test("an unclosable alert is reported as no-escape on sight, leaving only the reload", () => {
  const report = ladderFor({ screen: "ALERT_MODAL", liveVersion: PINNED, tutorialActive: false });

  assert.equal(report.status, "ladder");
  assert.equal(report.class, "no_escape");
  assert.deepEqual(
    report.rungs.map(r => r.do),
    ["reload"],
  );
  assert.match(report.message, /progress since the last save/);
});

test("every UiMode at the pinned ref has a reviewed entry", () => {
  // UiMode at v1.12.0.11 / e4e9b53, src/enums/ui-mode.ts, in declaration order.
  const pinnedUiModes = [
    "MESSAGE", "TITLE", "COMMAND", "FIGHT", "BALL", "TARGET_SELECT", "MODIFIER_SELECT", "SAVE_SLOT", "PARTY",
    "SUMMARY", "STARTER_SELECT", "EVOLUTION_SCENE", "EGG_HATCH_SCENE", "EGG_HATCH_SUMMARY", "CONFIRM",
    "OPTION_SELECT", "MENU", "MENU_OPTION_SELECT", "SETTINGS", "SETTINGS_DISPLAY", "SETTINGS_AUDIO",
    "SETTINGS_GAMEPAD", "GAMEPAD_BINDING", "SETTINGS_KEYBOARD", "KEYBOARD_BINDING", "ACHIEVEMENTS", "GAME_STATS",
    "EGG_LIST", "EGG_GACHA", "POKEDEX", "POKEDEX_SCAN", "POKEDEX_PAGE", "LOGIN_OR_REGISTER", "LOGIN_FORM",
    "REGISTRATION_FORM", "LOADING", "UNAVAILABLE", "CHALLENGE_SELECT", "RENAME_POKEMON", "RENAME_RUN",
    "RUN_HISTORY", "RUN_INFO", "TEST_DIALOGUE", "AUTO_COMPLETE", "ADMIN", "MYSTERY_ENCOUNTER",
    "CHANGE_PASSWORD_FORM", "ALERT_MODAL",
  ];

  const unresolved = pinnedUiModes.filter(
    screen => ladderFor({ screen, liveVersion: PINNED, tutorialActive: false }).status !== "ladder",
  );
  assert.deepEqual(unresolved, []);
});
