import assert from "node:assert/strict";
import { test } from "node:test";
import { PINNED_GAME_VERSION } from "../escape-ladder/lookup.ts";
import { progressFingerprint, StuckDetector, type ActingCall, type Choice } from "./detector.ts";

const SHOP = "SelectModifierPhase|6||0|Increases a Pokémon's level by 1.";
const SHOP_PARTY = "SelectModifierPhase|8||0|Increases a Pokémon's level by 1.";
const SUMMARY = "SelectModifierPhase|9||0|";
const SHOP_OPTIONS = ["Reroll", "Manage Items", "Check Team", "Lock Rarities", "Rare Candy", "Lure", "Potion"];

const option = (label: string): Choice => ({ kind: "option", label });
const button = (name: string): Choice => ({ kind: "button", button: name });

function call(screen: string, before: string, after: string, choice: Choice, over: Partial<ActingCall> = {}): ActingCall {
  return {
    screen,
    before: { fingerprint: before, settled: true },
    after: { fingerprint: after, settled: true },
    choice,
    tutorialActive: false,
    ...over,
  };
}

const at = (screen: string, fingerprint: string, options: readonly string[] | null = null) => ({
  screen,
  fingerprint,
  settled: true,
  liveVersion: PINNED_GAME_VERSION,
  tutorialActive: false,
  options,
});

/** #6's 147-iteration loop: pick Rare Candy in the shop, CANCEL out of the party it opens, repeat. */
function shopPartyLoop(detector: StuckDetector, rounds: number) {
  for (let i = 0; i < rounds; i++) {
    detector.recordActing(call("MODIFIER_SELECT", SHOP, SHOP_PARTY, option("Rare Candy")));
    detector.recordActing(call("PARTY/MODIFIER", SHOP_PARTY, SHOP, button("CANCEL")));
  }
}

test("a healthy run whose fingerprints never repeat is not stuck", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 30; i++) detector.recordActing(call("COMMAND", `fp${i}`, `fp${i + 1}`, option("Fight")));

  assert.deepEqual(detector.assess(at("COMMAND", "fp30")), { status: "ok" });
});

test("three identical level-up messages stay under the threshold", () => {
  const detector = new StuckDetector();
  const levelUp = "LevelUpPhase|0||0|Bulbasaur grew to Lv. 6!";
  detector.recordActing(call("PARTY/MODIFIER:options", "a", levelUp, option("Apply")));
  detector.recordActing(call("MESSAGE", levelUp, levelUp, button("ACTION")));
  detector.recordActing(call("MESSAGE", levelUp, levelUp, button("ACTION")));

  assert.equal(detector.assess(at("MESSAGE", levelUp)).status, "ok");
});

test("the fifth sighting of a fingerprint in the window is a loop", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 3);
  assert.equal(detector.assess(at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS)).status, "ok");

  shopPartyLoop(detector, 1);
  const result = detector.assess(at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS));

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.verdict, "loop");
  assert.equal(result.stuck.repeats, 5);
  assert.deepEqual(
    result.stuck.cycle?.map(m => [m.fingerprint, m.screen]),
    [[SHOP, "MODIFIER_SELECT"], [SHOP_PARTY, "PARTY/MODIFIER"]],
  );
});

/** #35's shop run: Potion, pick the pokémon, Apply. The screens repeat; only the money says whether the purchase went through. */
function shopPurchases(detector: StuckDetector, rounds: number, spend: number) {
  const read = { phaseName: "SelectModifierPhase", modeChain: [], cursor: 0, messageText: null, wave: 15, turn: 1 };
  const shop = (money: number) => progressFingerprint({ ...read, mode: 6, money });
  const party = (money: number) => progressFingerprint({ ...read, mode: 8, money });
  let money = 1000;
  for (let i = 0; i < rounds; i++) {
    detector.recordActing(call("MODIFIER_SELECT", shop(money), party(money), option("Potion")));
    detector.recordActing(call("PARTY/MODIFIER", party(money), shop(money - spend), option("Apply")));
    money -= spend;
  }
  return shop(money);
}

test("repeat shop purchases that spend money are progress, not a loop", () => {
  const detector = new StuckDetector();
  const now = shopPurchases(detector, 6, 66);

  assert.equal(detector.assess(at("MODIFIER_SELECT", now, SHOP_OPTIONS)).status, "ok");
});

test("the same shop↔party cycle with the money unchanged still trips", () => {
  const detector = new StuckDetector();
  const now = shopPurchases(detector, 4, 0);
  const result = detector.assess(at("MODIFIER_SELECT", now, SHOP_OPTIONS));

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.verdict, "loop");
});

test("a loop reported on the party screen is not promoted: its CANCEL is spent, but the shop's is not", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 4);
  detector.recordActing(call("MODIFIER_SELECT", SHOP, SHOP_PARTY, option("Rare Candy")));
  const result = detector.assess(at("PARTY/MODIFIER", SHOP_PARTY));

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.verdict, "loop");
  assert.equal(result.stuck.ladder.exhausted, true);
  const shop = result.stuck.cycle?.find(m => m.screen === "MODIFIER_SELECT");
  assert.equal(shop?.ladder.exhausted, false);
  assert.equal(shop?.ladder.rungs[shop.ladder.next!].rung.do, "press");
});

test("a loop lists the options already chosen on this fingerprint and the ones not yet tried", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 5);
  const result = detector.assess(at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS));

  assert.equal(result.status, "stuck");
  assert.deepEqual(result.stuck.tried, [option("Rare Candy")]);
  assert.deepEqual(result.stuck.untried, ["Reroll", "Manage Items", "Check Team", "Lock Rarities", "Lure", "Potion"]);
});

test("a loop's ladder offers the shop's CANCEL, the exit the 147-iteration loop never took", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 5);
  const result = detector.assess(at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS));

  assert.equal(result.status, "stuck");
  const { ladder } = result.stuck;
  assert.equal(ladder.status, "ladder");
  assert.deepEqual(ladder.rungs[ladder.next!].rung, {
    do: "press",
    button: "CANCEL",
    risk: "safe",
    effect: "opens the skip-item CONFIRM; answering Yes there forfeits this wave's reward",
    provenance: "source",
  });
  assert.equal(ladder.exhausted, false);
});

test("presses that never move the fingerprint are a dead end", () => {
  const detector = new StuckDetector();
  detector.recordActing(call("PARTY/SWITCH:options", "p", SUMMARY, option("Summary")));
  for (let i = 0; i < 5; i++) detector.recordActing(call("SUMMARY", SUMMARY, SUMMARY, button("ACTION")));
  const result = detector.assess(at("SUMMARY", SUMMARY));

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.verdict, "dead_end");
  assert.equal(result.stuck.cycle, undefined);
  assert.deepEqual(result.stuck.tried, [button("ACTION")]);
});

test("a decision whose outcome was a settle timeout does not tick the window", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 8; i++) {
    detector.recordActing({
      ...call("PARTY/MODIFIER:options", SHOP_PARTY, SHOP_PARTY, option("Apply")),
      after: { fingerprint: SHOP_PARTY, settled: false },
    });
  }

  assert.equal(detector.assess(at("PARTY/MODIFIER:options", SHOP_PARTY)).status, "ok");
});

test("a decision pressed from a timed-out read does not tick the window", () => {
  // run4's stall: the prototype pressed 4 ms after each timeout, and its ring took a duplicate every time.
  const detector = new StuckDetector();
  for (let i = 0; i < 8; i++) {
    detector.recordActing({
      ...call("PARTY/MODIFIER:options", SHOP_PARTY, SHOP_PARTY, button("ACTION")),
      before: { fingerprint: SHOP_PARTY, settled: false },
    });
  }

  assert.equal(detector.assess(at("PARTY/MODIFIER:options", SHOP_PARTY)).status, "ok");
});

test("a timed-out decision is admitted once, when a resume settles, and the resume itself never ticks", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 3; i++) detector.recordActing(call("SUMMARY", SUMMARY, SUMMARY, button("ACTION")));
  detector.recordActing({
    ...call("SUMMARY", SUMMARY, SUMMARY, button("ACTION")),
    after: { fingerprint: SUMMARY, settled: false },
  });
  assert.equal(detector.repeatsOf(SUMMARY), 4);

  detector.recordRead({ fingerprint: SUMMARY, settled: false });
  detector.recordRead({ fingerprint: SUMMARY, settled: true });
  assert.equal(detector.assess(at("SUMMARY", SUMMARY)).status, "stuck");

  detector.recordRead({ fingerprint: SUMMARY, settled: true });
  detector.recordRead({ fingerprint: SUMMARY, settled: true });
  const result = detector.assess(at("SUMMARY", SUMMARY));
  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.repeats, 5);
});

test("a new acting call discards a pending timed-out decision instead of admitting it", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 3; i++) detector.recordActing(call("SUMMARY", SUMMARY, SUMMARY, button("ACTION")));
  detector.recordActing({
    ...call("SUMMARY", SUMMARY, SUMMARY, button("ACTION")),
    after: { fingerprint: SUMMARY, settled: false },
  });
  detector.recordActing({
    ...call("SUMMARY", SUMMARY, "elsewhere", button("CANCEL")),
    before: { fingerprint: SUMMARY, settled: false },
  });
  detector.recordRead({ fingerprint: SUMMARY, settled: true });

  assert.equal(detector.assess(at("SUMMARY", SUMMARY)).status, "ok");
});

test("a state sampled off a timeout is never judged stuck", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 6; i++) detector.recordActing(call("SUMMARY", SUMMARY, SUMMARY, button("ACTION")));

  assert.equal(detector.assess({ ...at("SUMMARY", SUMMARY), settled: false }).status, "ok");
});

test("decisions made under a tutorial are not admitted", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 6; i++) {
    detector.recordActing(call("MESSAGE", "tut", "tut", button("ACTION"), { tutorialActive: true }));
  }

  assert.equal(detector.assess(at("MESSAGE", "tut")).status, "ok");
});

test("under a tutorial a stuck report carries a suppressed ladder and is never promoted", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 12; i++) detector.recordActing(call("SUMMARY", SUMMARY, SUMMARY, button("CANCEL")));
  const result = detector.assess({ ...at("SUMMARY", SUMMARY), tutorialActive: true });

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.ladder.status, "suppressed");
  assert.equal(result.stuck.ladder.exhausted, false);
  assert.deepEqual(result.stuck.ladder.rungs, []);
});

test("a live version other than the pin keeps detecting but offers no rung", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 5);
  const result = detector.assess({ ...at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS), liveVersion: "9.9.9" });

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.ladder.status, "suppressed");
  assert.equal(result.stuck.ladder.next, null);
});

test("rungs are marked spent as decisions on this fingerprint use them", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 5);
  detector.recordActing(call("MODIFIER_SELECT", SHOP, "confirm", button("CANCEL")));
  detector.recordActing(call("CONFIRM", "confirm", SHOP, option("No")));
  const result = detector.assess(at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS));

  assert.equal(result.status, "stuck");
  const { ladder } = result.stuck;
  assert.deepEqual(
    ladder.rungs.map(r => [r.rung.do, r.spent]),
    [["press", true], ["select_untried_option", false], ["reload", false]],
  );
  assert.equal(ladder.next, 1);
});

test("spending every rung before the reload promotes stuck to run_interrupted", () => {
  const detector = new StuckDetector();
  detector.recordActing(call("PARTY/SWITCH:options", "p", SUMMARY, option("Summary")));
  for (let i = 0; i < 5; i++) detector.recordActing(call("SUMMARY", SUMMARY, SUMMARY, button("CANCEL")));
  const result = detector.assess(at("SUMMARY", SUMMARY));

  assert.equal(result.status, "run_interrupted");
  assert.equal(result.cause, "ladder_exhausted");
  assert.equal(result.stuck.verdict, "dead_end");
  assert.equal(result.stuck.ladder.exhausted, true);
  assert.equal(result.stuck.ladder.rungs[result.stuck.ladder.next!].rung.do, "reload");
});

test("the untried-option rung is spent only once every readable option has been tried", () => {
  const detector = new StuckDetector();
  const faint = "SwitchPhase|8||0|";
  for (let i = 0; i < 5; i++) detector.recordActing(call("PARTY/FAINT_SWITCH", faint, faint, option("Bulbasaur")));
  const partway = detector.assess(at("PARTY/FAINT_SWITCH", faint, ["Bulbasaur", "Squirtle"]));
  assert.equal(partway.status, "stuck");
  assert.deepEqual(partway.stuck.untried, ["Squirtle"]);

  detector.recordActing(call("PARTY/FAINT_SWITCH", faint, faint, option("Squirtle")));
  assert.equal(detector.assess(at("PARTY/FAINT_SWITCH", faint, ["Bulbasaur", "Squirtle"])).status, "run_interrupted");
  // Unreadable options can never prove the rung spent, so nothing is promoted.
  assert.equal(detector.assess(at("PARTY/FAINT_SWITCH", faint, null)).status, "stuck");
});

test("a wait rung is spent by a settled read that found the screen unchanged", () => {
  const detector = new StuckDetector();
  const text = "BattleEndPhase|0||0|Nothing to see";
  for (let i = 0; i < 5; i++) detector.recordActing(call("MESSAGE", text, text, button("ACTION")));
  const before = detector.assess(at("MESSAGE", text));
  assert.equal(before.status, "stuck");
  assert.deepEqual(before.stuck.ladder.rungs.map(r => r.spent), [false, true, false]);

  detector.recordRead({ fingerprint: text, settled: true });
  assert.equal(detector.assess(at("MESSAGE", text)).status, "run_interrupted");
});

test("a no-escape screen is reported on sight, without spending presses to prove it", () => {
  const detector = new StuckDetector();
  const result = detector.assess(at("ALERT_MODAL", "alert"));

  assert.equal(result.status, "run_interrupted");
  assert.equal(result.cause, "ladder_exhausted");
  assert.equal(result.stuck.verdict, "dead_end");
  assert.equal(result.stuck.onSight, true);
});

test("an unmodelled screen reports stuck with no rungs and is never promoted", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 12; i++) detector.recordActing(call("UNKNOWN(52)", "u", "u", button("ACTION")));
  const result = detector.assess(at("UNKNOWN(52)", "u"));

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.ladder.status, "unknown_screen");
});

test("reset forgets the window, for a new run", () => {
  const detector = new StuckDetector();
  shopPartyLoop(detector, 5);
  detector.reset();

  assert.equal(detector.assess(at("MODIFIER_SELECT", SHOP, SHOP_OPTIONS)).status, "ok");
});

test("a screen whose table entry makes no rung claim is never promoted, however stuck", () => {
  const detector = new StuckDetector();
  for (let i = 0; i < 12; i++) detector.recordActing(call("PARTY", "base", "base", button("ACTION")));
  const result = detector.assess(at("PARTY", "base"));

  assert.equal(result.status, "stuck");
  assert.equal(result.stuck.ladder.exhausted, false);
});
