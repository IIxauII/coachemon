import assert from "node:assert/strict";
import test from "node:test";
import { decide, freshMemory, refused, type Card, type Menu, type Opt } from "./policy.ts";

const opts = (labels: string[], extra: Partial<Opt>[] = []): Opt[] => labels.map((label, i) => ({ i, label, ...extra[i] }));
const command = (active: string): Menu => ({ screen: "COMMAND", wave: 3, text: `What will\n${active} do?`, options: opts(["Fight", "Ball", "Pokémon", "Run"]) });
const fight = (labels: string[], power: number[]): Menu => ({
  screen: "FIGHT", wave: 3, options: opts(labels), extra: { moves: labels.map((l, i) => (l === "-" ? null : { pp: 10, power: power[i] })) },
});
const party = (screen: string, rows: [string, { fainted?: boolean; active?: boolean }?][]): Menu => ({
  screen, wave: 3, options: [...rows.map(([label, o], i) => ({ i, label, fainted: false, active: false, ...o })), { i: 6, label: "Cancel", synthetic: true }],
});
const battle = (act: string, wave = 3): Card => ({ kind: "battle", card_wave: wave, groups: [{ id: "act", label: "Now", summary: act, rows: [] }] });
const card = (kind: string, act: string): Card => ({ kind, card_wave: 3, groups: [{ id: "act", label: "Now", summary: act, rows: [] }] });

test("the card's move is the one used, and its target is the one aimed at (#499)", () => {
  const mem = freshMemory();
  assert.deepEqual(decide(command("Charmander"), battle("Charmander Ember → Rattata · 1 hit"), mem), { tool: "select_option", args: { label: "Fight" }, by: "card" });
  assert.deepEqual(decide(fight(["Scratch", "Growl", "Ember", "-"], [40, 0, 40, 0]), null, mem), { tool: "select_option", args: { label: "Ember" }, by: "card" });
  const target: Menu = { screen: "TARGET_SELECT", wave: 3, options: opts(["Pidgey", "Rattata"]) };
  assert.deepEqual(decide(target, null, mem).args, { index: 1 });
  const twins: Menu = { screen: "TARGET_SELECT", wave: 3, options: opts(["Zigzagoon", "Zigzagoon"]) };
  assert.deepEqual(decide(twins, null, freshMemory()).args, { index: 0 }, "two foes of one name are told apart by index");
});

test("a card naming a benched mon switches to it, and the commit step is the switch-out (#499)", () => {
  const mem = freshMemory();
  assert.deepEqual(decide(command("Charmander"), battle("Squirtle Water Gun → Rattata"), mem).args, { label: "Pokémon" });
  const screen = party("PARTY/SWITCH", [["Charmander Lv.7 20/24", { active: true }], ["Bulbasaur Lv.6 0/22 FNT", { fainted: true }], ["Squirtle Lv.5 20/20"]]);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Squirtle Lv.5 20/20" });
  const commit = decide({ screen: "PARTY/SWITCH:options", wave: 3, options: opts(["Switch", "Summary", "Cancel"]) }, null, mem);
  assert.deepEqual(commit, { tool: "select_option", args: { label: "Switch" }, by: "card", intent: "switch" });
});

test("a switch the party screen cannot make is cancelled once, and the next command fights (#499)", () => {
  const mem = freshMemory();
  decide(command("Charmander"), battle("Squirtle Water Gun → Rattata"), mem);
  const screen = party("PARTY/SWITCH", [["Charmander Lv.7 20/24", { active: true }], ["Squirtle Lv.5 0/20 FNT", { fainted: true }]]);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Cancel" });
  assert.deepEqual(decide(command("Charmander"), battle("Squirtle Water Gun → Rattata"), mem).args, { label: "Fight" });
});

test("without a card for this wave the rule plays: fight, strongest move (#499)", () => {
  const mem = freshMemory();
  assert.deepEqual(decide(command("Charmander"), battle("Squirtle Water Gun", 2), mem), { tool: "select_option", args: { label: "Fight" }, by: "rule" });
  assert.deepEqual(decide(fight(["Scratch", "Ember", "-", "-"], [40, 60, 0, 0]), null, mem), { tool: "select_option", args: { label: "Ember" }, by: "rule" });
  assert.deepEqual(decide(command("Charmander"), null, freshMemory()).by, "rule");
});

test("a double never switches on the card, and each slot takes its own move (#499)", () => {
  const mem = freshMemory();
  assert.deepEqual(decide(command("Squirtle"), battle("Charmander Ember → Pidgey ; Squirtle Water Gun → Rattata"), mem).args, { label: "Fight" });
  assert.deepEqual(decide(fight(["Tackle", "Water Gun"], [40, 40]), null, mem).args, { label: "Water Gun" });
});

test("a faint is replaced by the mon the card plays, else the first one standing (#499)", () => {
  const rows: [string, { fainted?: boolean; active?: boolean }?][] = [["Charmander Lv.7 0/24 FNT", { fainted: true, active: true }], ["Bulbasaur Lv.6 22/22"], ["Squirtle Lv.5 20/20"]];
  assert.deepEqual(decide(party("PARTY/FAINT_SWITCH", rows), battle("Squirtle Water Gun → Rattata"), freshMemory()).args, { label: "Squirtle Lv.5 20/20" });
  assert.deepEqual(decide(party("PARTY/FAINT_SWITCH", rows), null, freshMemory()).args, { label: "Bulbasaur Lv.6 22/22" });
  const commit = decide({ screen: "PARTY/FAINT_SWITCH:options", wave: 3, options: opts(["Send Out", "Summary", "Cancel"]) }, null, freshMemory());
  assert.equal(commit.intent, "replace");
});

test("the free switch after a foe goes down is taken only when the card plays a benched mon (#499)", () => {
  const rows: [string, { fainted?: boolean; active?: boolean }?][] = [["Charmander Lv.7 20/24", { active: true }], ["Squirtle Lv.5 20/20"]];
  assert.deepEqual(decide(party("PARTY/POST_BATTLE_SWITCH", rows), battle("Squirtle Water Gun → Pidgey"), freshMemory()).args, { label: "Squirtle Lv.5 20/20" });
  assert.deepEqual(decide(party("PARTY/POST_BATTLE_SWITCH", rows), battle("Charmander Ember → Pidgey"), freshMemory()).args, { label: "Cancel" });
});

test("a learn follows the card: forget what it names, or decline (#499)", () => {
  const ask: Menu = { screen: "CONFIRM", wave: 3, text: "Should a move be forgotten and\nreplaced with Flamethrower?", options: opts(["Yes", "No"]) };
  const mem = freshMemory();
  assert.deepEqual(decide(ask, card("learn", "Learn → forget Ember · ⚠ loses only Fire move"), mem), { tool: "select_option", args: { label: "Yes" }, by: "card", intent: "learn" });
  const rows: Menu = { screen: "SUMMARY/LEARN_MOVE", wave: 3, options: opts(["Scratch", "Growl", "Ember", "Smokescreen", "Flamethrower"], [{}, {}, {}, {}, { new: true }]) };
  assert.deepEqual(decide(rows, card("learn", "Learn → forget Ember"), mem).args, { label: "Ember" });

  assert.deepEqual(decide(ask, card("learn", "Skip — not an upgrade over Ember"), freshMemory()).args, { label: "No" });
  const stop: Menu = { screen: "CONFIRM", wave: 3, text: "Stop trying to teach\nFlamethrower?", options: opts(["Yes", "No"]) };
  assert.deepEqual(decide(stop, null, freshMemory()).args, { label: "Yes" });
  assert.deepEqual(decide(rows, null, freshMemory()).args, { label: "Flamethrower" }, "no forget named: decline");
});

test("the shop buys what the card buys, once each, then takes its reward for the mon it names (#499)", () => {
  const shop: Menu = {
    screen: "MODIFIER_SELECT", wave: 3, options: [
      { i: "0:0", label: "Reroll", kind: "buttons", col: 0, cost: null },
      { i: "1:0", label: "Potion", kind: "reward", col: 0, cost: 0 },
      { i: "1:1", label: "Leftovers", kind: "reward", col: 1, cost: 0 },
      { i: "2:0", label: "Potion", kind: "shop", col: 0, cost: 200 },
    ],
  };
  const rewards = card("reward", "take Leftovers → Squirtle · buy Potion");
  const mem = freshMemory();
  assert.deepEqual(decide(shop, rewards, mem), { tool: "select_option", args: { index: "2:0" }, by: "card", intent: "shop" });
  assert.deepEqual(decide(party("PARTY/MODIFIER", [["Charmander Lv.7 20/24"], ["Squirtle Lv.5 20/20"]]), null, mem).args, { label: "Charmander Lv.7 20/24" }, "a buy names no mon");
  assert.deepEqual(decide(shop, rewards, mem), { tool: "select_option", args: { index: "1:1" }, by: "card", intent: "shop" });
  assert.deepEqual(decide(party("PARTY/MODIFIER", [["Charmander Lv.7 20/24"], ["Squirtle Lv.5 20/20"]]), null, mem).args, { label: "Squirtle Lv.5 20/20" });
});

test("an item bounced back to the party screen goes to the next mon, then gives up (#499)", () => {
  const mem = freshMemory();
  const screen = party("PARTY/MODIFIER", [["Charmander Lv.7 24/24"], ["Squirtle Lv.5 20/20"]]);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Charmander Lv.7 24/24" });
  assert.deepEqual(decide(screen, null, mem).args, { label: "Squirtle Lv.5 20/20" });
  assert.deepEqual(decide(screen, null, mem).args, { label: "Cancel" });
});

test("a reward that came back unused is not taken again: the next one is, then the shop is skipped (#499)", () => {
  const shop: Menu = { screen: "MODIFIER_SELECT", wave: 9, options: [
    { i: "1:0", label: "Potion", kind: "reward", col: 0, cost: 0 },
    { i: "1:1", label: "Ether", kind: "reward", col: 1, cost: 0 },
  ] };
  const ether = { kind: "reward", card_wave: 9, groups: [{ id: "act", label: "Now", summary: "take Ether → Bulbasaur", rows: [] }] };
  const mem = freshMemory();
  assert.deepEqual(decide(shop, ether, mem).args, { index: "1:1" });
  refused(mem);
  assert.deepEqual(decide(shop, ether, mem).args, { index: "1:1" }, "a pick the game refused never happened");
  assert.deepEqual(decide(shop, ether, mem).args, { index: "1:0" });
  assert.deepEqual(decide(shop, ether, mem), { tool: "press", args: { button: "CANCEL" }, by: "rule" });
  const skip: Menu = { screen: "CONFIRM", wave: 9, text: "Are you sure you want to skip taking an item?", options: opts(["Yes", "No"]) };
  assert.deepEqual(decide(skip, null, mem).args, { label: "Yes" });
});

test("a lost battle is retried three times a wave, then the run is let go (#499)", () => {
  const ask: Menu = { screen: "CONFIRM", wave: 9, text: "Would you like to retry\nthe battle?", options: opts(["Yes", "No"]) };
  const mem = freshMemory();
  assert.deepEqual([1, 2, 3, 4].map(() => decide(ask, null, mem).args.label), ["Yes", "Yes", "Yes", "No"]);
});

test("a PP item's move list takes the first move, since no verb there commits it (#499)", () => {
  const moves: Menu = { screen: "PARTY/MOVE_MODIFIER:options", wave: 6, options: opts(["Tackle", "Vine Whip", "Cancel"]) };
  assert.deepEqual(decide(moves, null, freshMemory()).args, { label: "Tackle" });
});

test("with no rewards card the shop takes the first reward, and leaving an empty shop is no pick (#499)", () => {
  const shop: Menu = { screen: "MODIFIER_SELECT", wave: 3, options: [{ i: "1:0", label: "Potion", kind: "reward", col: 0, cost: 0 }] };
  assert.deepEqual(decide(shop, null, freshMemory()), { tool: "select_option", args: { index: "1:0" }, by: "rule", intent: "shop" });
  const empty: Menu = { screen: "MODIFIER_SELECT", wave: 3, options: [{ i: "0:4", label: "Continue", kind: "buttons", col: 4, cost: null }] };
  const mem = freshMemory();
  assert.equal(decide(empty, null, mem).intent, undefined);
  assert.deepEqual(decide(empty, null, mem), { tool: "press", args: { button: "CANCEL" }, by: "rule" }, "a Continue that did nothing is not pressed again");
});

test("the trainer's switch prompt is taken when the card plays one mon, so its free switch can follow (#484)", () => {
  const ask: Menu = { screen: "CONFIRM", wave: 3, text: "Will you switch\nPokémon?", options: opts(["Yes", "No"]) };
  assert.deepEqual(decide(ask, battle("Squirtle Water Gun → Pidgey"), freshMemory()).args, { label: "Yes" });
  assert.deepEqual(decide(ask, null, freshMemory()).args, { label: "No" });
});
