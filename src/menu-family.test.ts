import assert from "node:assert/strict";
import { test } from "node:test";
import { Button } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import type { FamilyExtra, MenuOption, MenuRead } from "./game/port.ts";
import { planSelect, step, type StepRule } from "./menu-family.ts";

/** A readable menu of one family, on its own Screen. */
function menuOf<F extends keyof FamilyExtra>(family: F, extra: FamilyExtra[F], options: MenuOption[], screen: string = family.toUpperCase()): MenuRead {
  return { readable: true, mode: -1, screen, family, options, cursor: 0, text: null, messagePending: false, extra } as MenuRead;
}

const labelled = (...labels: string[]): MenuOption[] => labels.map((label, i) => ({ i, label }));

function refusal(f: () => unknown): Refusal {
  try {
    f();
  } catch (e) {
    if (e instanceof Refusal) return e;
    throw e;
  }
  assert.fail("expected a refusal");
}

// ------------------------------------------------------------------ step

const steps: Record<StepRule, [cursor: number, to: number, button: Button][]> = {
  list: [[0, 2, Button.DOWN], [3, 1, Button.UP], [4, 0, Button.UP]],
  // UP/DOWN ±2 across rows, LEFT/RIGHT ±1 along one.
  grid2x2: [[0, 1, Button.RIGHT], [1, 0, Button.LEFT], [0, 3, Button.DOWN], [1, 2, Button.DOWN], [3, 0, Button.UP], [2, 3, Button.RIGHT]],
  // The party slot list only ever cycles forward: 0..n-1 → 6 (Cancel) → 0.
  down_cycle: [[0, 6, Button.DOWN], [6, 0, Button.DOWN], [3, 1, Button.DOWN]],
  // Enemies 2,3 on top, player field 0,1 below; nothing wraps (#40).
  battler_grid: [[2, 1, Button.DOWN], [3, 0, Button.DOWN], [1, 3, Button.UP], [0, 2, Button.UP], [3, 2, Button.LEFT], [2, 3, Button.RIGHT], [0, 1, Button.RIGHT], [1, 0, Button.LEFT]],
};

for (const [rule, rows] of Object.entries(steps) as [StepRule, [number, number, Button][]][]) {
  test(`step ${rule}`, () => {
    for (const [cursor, to, button] of rows) assert.equal(step(rule, cursor, to), button, `${rule}: ${cursor} → ${to}`);
  });
}

// ----------------------------------------------------------- planSelect

test("option_select sets the cursor over the unskipped list and walks it as a list when that misses", () => {
  const menu = menuOf("option_select", { unskippedIndices: [0, 2], selectedIndex: 0 }, labelled("Classic", "Daily Run", "Cancel"));
  const plan = planSelect(menu, menu.options[2]);
  assert.deepEqual(plan.reach, { kind: "set", to: { family: "option_select", index: 1 }, miss: "walk", walk: { to: 1, rule: "list" } });
  assert.deepEqual(plan.commit, { kind: "action" });
  assert.deepEqual(plan.choice, { kind: "option", label: "cancel" });
  assert.deepEqual(plan.extra, {});
});

test("option_select without unskipped indices sets the option's own index", () => {
  const menu = menuOf("option_select", { unskippedIndices: null, selectedIndex: 0 }, labelled("Yes", "No"));
  assert.deepEqual(planSelect(menu, menu.options[1]).reach, { kind: "set", to: { family: "option_select", index: 1 }, miss: "walk", walk: { to: 1, rule: "list" } });
});

test("option_select refuses option_skipped on an option the handler skips", () => {
  const menu = menuOf("option_select", { unskippedIndices: [0, 2], selectedIndex: 0 }, labelled("Classic", "Daily Run", "Cancel"));
  const r = refusal(() => planSelect(menu, menu.options[1]));
  assert.equal(r.code, "option_skipped");
  assert.deepEqual(r.detail.options, ["Classic", "Daily Run", "Cancel"]);
});

const commands = labelled("Fight", "Ball", "Pokémon", "Run");

for (const family of ["command", "fight", "mystery_encounter"] as const) {
  test(`${family} walks its 2×2 grid`, () => {
    const extra = { command: { fieldIndex: 0, catchable: true }, fight: { fieldIndex: 0 }, mystery_encounter: {} }[family];
    const menu = menuOf(family, extra as FamilyExtra[typeof family], labelled("A", "B", "C", "D"));
    const plan = planSelect(menu, menu.options[3]);
    assert.deepEqual(plan.reach, { kind: "walk", to: 3, rule: "grid2x2" });
    assert.deepEqual(plan.commit, { kind: "action" });
  });
}

test("command refuses Ball in a trainer battle, by position, and still plans the other commands (#56)", () => {
  const menu = menuOf("command", { fieldIndex: 0, catchable: false }, commands);
  const r = refusal(() => planSelect(menu, menu.options[1]));
  assert.equal(r.code, "cannot_catch_trainer");
  assert.deepEqual(r.detail, { screen: "COMMAND", options: ["fight", "ball", "pokémon", "run"], cursor: 0 });
  assert.deepEqual(planSelect(menu, menu.options[3]).reach, { kind: "walk", to: 3, rule: "grid2x2" });
});

test("command takes Ball in a wild battle (#56)", () => {
  const menu = menuOf("command", { fieldIndex: 0, catchable: true }, commands);
  assert.deepEqual(planSelect(menu, menu.options[1]).reach, { kind: "walk", to: 1, rule: "grid2x2" });
});

const balls: MenuOption[] = [
  { i: 0, label: "Poké Ball ×13", name: "Poké Ball", ballType: 0, count: 13 },
  { i: 1, label: "Great Ball ×9", name: "Great Ball", ballType: 1, count: 9 },
  { i: 2, label: "Cancel" },
];

test("ball walks a list to the ball in a wild battle (#46)", () => {
  const menu = menuOf("ball", { catchable: true }, balls);
  const plan = planSelect(menu, menu.options[1]);
  assert.deepEqual(plan.reach, { kind: "walk", to: 1, rule: "list" });
  assert.deepEqual(plan.choice, { kind: "option", label: "great ball ×9" });
});

test("ball refuses every ball row in a trainer battle but still takes Cancel (#56)", () => {
  const menu = menuOf("ball", { catchable: false }, balls);
  assert.equal(refusal(() => planSelect(menu, menu.options[0])).code, "cannot_catch_trainer");
  assert.equal(refusal(() => planSelect(menu, menu.options[1])).code, "cannot_catch_trainer");
  assert.deepEqual(planSelect(menu, menu.options[2]).reach, { kind: "walk", to: 2, rule: "list" });
});

const targets: MenuOption[] = [{ i: 2, label: "Starly" }, { i: 3, label: "Caterpie" }, { i: 1, label: "Lillipup" }];

test("target_select walks the BattlerIndex grid to a single target (#40)", () => {
  const menu = menuOf("target_select", { isMultipleTargets: false }, targets);
  for (const t of targets) {
    const plan = planSelect(menu, t);
    assert.deepEqual(plan.reach, { kind: "walk", to: t.i, rule: "battler_grid" });
    assert.deepEqual(plan.extra, {});
  }
});

test("a spread move needs no cursor: any listed target commits with ACTION and reports targets: all (#33)", () => {
  const menu = menuOf("target_select", { isMultipleTargets: true }, targets);
  const plan = planSelect(menu, targets[1]);
  assert.deepEqual(plan.reach, { kind: "none" });
  assert.deepEqual(plan.commit, { kind: "action" });
  assert.deepEqual(plan.extra, { targets: "all" });
});

test("modifier_select sets row then column and refuses when that misses", () => {
  const menu = menuOf("modifier_select", { rows: [], rowCursor: 1, colCursor: 0, money: 1000, rerollCost: 250 }, [{ i: "2:1", label: "Revive", row: 2, col: 1 }]);
  assert.deepEqual(planSelect(menu, menu.options[0]).reach, { kind: "set", to: { family: "modifier_select", row: 2, col: 1 }, miss: "refuse" });
});

test("starter_select sets the grid index and refuses when that misses", () => {
  const menu = menuOf("starter_select", { scrollCursor: 0, party: [], partyValue: 0, valueLimit: 10, partyValid: null, filterMode: false }, [{ i: 0, label: "Bulbasaur" }, { i: 7, label: "Charmander" }]);
  assert.deepEqual(planSelect(menu, menu.options[1]).reach, { kind: "set", to: { family: "starter_select", index: 7 }, miss: "refuse" });
});

const learnMove = menuOf(
  "learn_move",
  { moveSelect: true, page: 2, pokemon: "Charmander", newMove: "Metal Claw" },
  ["Scratch", "Growl", "Ember", "Flare Blitz", "Metal Claw"].map((label, i) => ({ i, label, forget: i < 4 })),
  "SUMMARY/LEARN_MOVE",
);

test("learn_move sets a moveset row to forget it, walking the rows as a list when that misses (#31)", () => {
  assert.deepEqual(planSelect(learnMove, learnMove.options[1]).reach, { kind: "set", to: { family: "learn_move", row: 1 }, miss: "walk", walk: { to: 1, rule: "list" } });
});

test("learn_move sets row 4 to decline the new move (#31)", () => {
  const plan = planSelect(learnMove, learnMove.options[4]);
  assert.deepEqual(plan.reach, { kind: "set", to: { family: "learn_move", row: 4 }, miss: "walk", walk: { to: 4, rule: "list" } });
  assert.deepEqual(plan.commit, { kind: "action" });
});

test("party walks its slots as a DOWN-cycle and its option phase as a list", () => {
  const slots = menuOf("party", { optionsScroll: false, optionsMode: false, partyUiMode: 0, transferMode: false }, [...labelled("Fletchling", "Charmander"), { i: 6, label: "Cancel" }]);
  assert.deepEqual(planSelect(slots, slots.options[2]).reach, { kind: "walk", to: 6, rule: "down_cycle" });
  const verbs = menuOf("party", { optionsScroll: false, optionsMode: true, partyUiMode: 0, transferMode: false }, labelled("Shift", "Summary", "Cancel"));
  assert.deepEqual(planSelect(verbs, verbs.options[1]).reach, { kind: "walk", to: 1, rule: "list" });
});

test("save_slot and menu walk a list", () => {
  const slots = menuOf("save_slot", { uiMode: 1 }, labelled("Slot 1", "Slot 2", "Slot 3"));
  assert.deepEqual(planSelect(slots, slots.options[2]).reach, { kind: "walk", to: 2, rule: "list" });
  const menu = menuOf("menu", {}, labelled("Game Settings", "Achievements", "Save and Quit"));
  assert.deepEqual(planSelect(menu, menu.options[1]).reach, { kind: "walk", to: 1, rule: "list" });
});

test("modal needs no cursor and commits through its own button action", () => {
  const menu = menuOf("modal", { formLabels: ["Username"], inputs: [""] }, labelled("Login", "Register"));
  const plan = planSelect(menu, menu.options[1]);
  assert.deepEqual(plan.reach, { kind: "none" });
  assert.deepEqual(plan.commit, { kind: "modal_button", index: 1 });
  assert.deepEqual(plan.choice, { kind: "modal_button", index: 1 });
});

test("an option-less family refuses no_options", () => {
  const unreadable: MenuRead = { readable: false, why: "reader threw", mode: -1, screen: "UNKNOWN(-1)", family: null, options: [], cursor: null, text: null, messagePending: false, extra: {} };
  const menus: MenuRead[] = [
    menuOf("acknowledge", { awaitingActionInput: true }, [], "MESSAGE"),
    menuOf("paged_viewer", { page: 0 }, [], "SUMMARY"),
    menuOf("unmapped", { ownKeys: [], texts: null }, []),
    unreadable,
  ];
  const target = { i: 0, label: "anything" };
  for (const menu of menus) assert.equal(refusal(() => planSelect(menu, target)).code, "no_options", String(menu.family));
});
