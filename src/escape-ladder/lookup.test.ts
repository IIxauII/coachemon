import assert from "node:assert/strict";
import { test } from "node:test";
import { PartyUiMode, SaveSlotUiMode, UiMode } from "../enums/generated.ts";
import { ladderFor, PINNED_GAME_VERSION } from "./lookup.ts";

const PINNED = PINNED_GAME_VERSION;

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
  const report = ladderFor({ screen: "MODIFIER_SELECT", liveVersion: "0.0.1", tutorialActive: false });

  assert.equal(report.status, "suppressed");
  assert.equal(report.reason, "version_mismatch");
  assert.deepEqual(report.rungs, []);
  assert.match(report.message, /0\.0\.1/);
  assert.ok(report.message.includes(PINNED), report.message);
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

test("every UiMode the game has has a reviewed entry", () => {
  const unresolved = Object.keys(UiMode).filter(
    screen => ladderFor({ screen, liveVersion: PINNED, tutorialActive: false }).status !== "ladder",
  );
  assert.deepEqual(unresolved, []);
});

test("every PartyUiMode and SaveSlotUiMode has its own entry, never the mode's generic one", () => {
  const generic = [
    ...Object.keys(PartyUiMode).map(sub => `PARTY/${sub}`),
    ...Object.keys(SaveSlotUiMode).map(sub => `SAVE_SLOT/${sub}`),
  ].filter(screen => {
    const report = ladderFor({ screen, liveVersion: PINNED, tutorialActive: false });
    return report.status !== "ladder" || report.matched !== screen;
  });
  assert.deepEqual(generic, []);
});
