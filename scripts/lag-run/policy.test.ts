import assert from "node:assert/strict";
import test from "node:test";
import { decide, freshMemory, heard, refused, type Card, type Menu, type Opt } from "./policy.ts";

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

test("a lost battle is retried once per benched lead, at least three times, then the run is let go (#499)", () => {
  const ask: Menu = { screen: "CONFIRM", wave: 9, text: "Would you like to retry\nthe battle?", options: opts(["Yes", "No"]) };
  const mem = freshMemory();
  assert.deepEqual([1, 2, 3, 4].map(() => decide(ask, null, mem).args.label), ["Yes", "Yes", "Yes", "No"]);
  const six = { ...freshMemory(), party: 6 };
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => decide(ask, null, six).args.label), ["Yes", "Yes", "Yes", "Yes", "Yes", "No"], "a full party lets each benched mon lead once (#508)");
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

test("the trainer's switch prompt is declined when the card plays the mon it names, and the No is the card's (#499)", () => {
  const named: Menu = { screen: "CONFIRM", wave: 3, text: "Will you switch\nCharmander?", options: opts(["Yes", "No"]) };
  assert.deepEqual(decide(named, battle("Charmander Ember → Pidgey"), freshMemory()), { tool: "select_option", args: { label: "No" }, by: "card" });
  assert.deepEqual(decide(named, battle("Squirtle Water Gun → Pidgey"), freshMemory()).args, { label: "Yes" });
});

test("a retry's lead swap that finds no Pokémon option is dropped, not carried to a later wave (#499)", () => {
  const mem = freshMemory();
  decide({ screen: "CONFIRM", wave: 8, text: "Would you like to retry from the start of the battle?", options: opts(["Yes", "No"]) }, null, mem);
  const noSwitch: Menu = { ...command("Larvitar"), wave: 8, options: opts(["Fight", "Ball", "Run"]) };
  assert.deepEqual(decide(noSwitch, battle("Larvitar Bite → Pidgey", 8), mem).args, { label: "Fight" });
  assert.deepEqual(decide({ ...command("Larvitar"), wave: 9 }, battle("Larvitar Bite → Pidgey", 9), mem).args, { label: "Fight" });
});

test("a message on the party screen is dismissed before anything is picked there (#499)", () => {
  const screen = { ...party("PARTY/MOVE_MODIFIER", [["Larvitar Lv.9 30/30"]]), message_pending: true };
  assert.deepEqual(decide(screen, null, freshMemory()), { tool: "press", args: { button: "ACTION" }, by: "rule" });
});

test("an item that had no effect goes back to the shop at once, not to the next mon (#499)", () => {
  const mem = freshMemory();
  const screen = party("PARTY/MODIFIER", [["Larvitar Lv.9 30/30"], ["Machop Lv.9 30/30"]]);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Larvitar Lv.9 30/30" });
  heard(mem, ["It won't have any effect."]);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Cancel" });
  assert.deepEqual(decide(screen, null, mem).args, { label: "Machop Lv.9 30/30" }, "the bounce is one item's, not the wave's");
});

test("a PP item restores a move that is missing PP, and a full move list is cancelled (#499)", () => {
  const moves: Menu = { screen: "PARTY/MOVE_MODIFIER:options", wave: 6, options: opts(["Tackle 35/35", "Bite 20/25", "Cancel"]) };
  assert.deepEqual(decide(moves, null, freshMemory()).args, { label: "Bite 20/25" });
  const full: Menu = { screen: "PARTY/MOVE_MODIFIER:options", wave: 6, options: opts(["Tackle 35/35", "Bite 25/25", "Cancel"]) };
  assert.deepEqual(decide(full, null, freshMemory()).args, { label: "Cancel" });
});

test("each item tries each mon once: one that bounced off a mon does not use that mon up for the next (#499)", () => {
  const shop: Menu = { screen: "MODIFIER_SELECT", wave: 8, options: [
    { i: "1:0", label: "Potion", kind: "reward", col: 0, cost: 0 },
    { i: "1:1", label: "Rare Candy", kind: "reward", col: 1, cost: 0 },
  ] };
  const screen = party("PARTY/MODIFIER", [["Larvitar Lv.9 30/30"]]);
  const mem = freshMemory();
  decide(shop, null, mem);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Larvitar Lv.9 30/30" });
  assert.deepEqual(decide(screen, null, mem).args, { label: "Cancel" });
  decide(shop, null, mem);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Larvitar Lv.9 30/30" });
});

test("a revive goes to a fainted mon (#499)", () => {
  const shop: Menu = { screen: "MODIFIER_SELECT", wave: 3, options: [{ i: "2:2", label: "Revive", kind: "shop", col: 2, cost: 500 }] };
  const mem = freshMemory();
  assert.equal(decide(shop, card("reward", "buy Revive"), mem).args.index, "2:2");
  const screen = party("PARTY/MODIFIER", [["Larvitar Lv.9 30/30"], ["Machop Lv.9 0/30 FNT", { fainted: true }]]);
  assert.deepEqual(decide(screen, null, mem).args, { label: "Machop Lv.9 0/30 FNT" });
});

test("a retried battle opens with a different lead, so the retry does not replay the loss (#499)", () => {
  const ask: Menu = { screen: "CONFIRM", wave: 8, text: "Would you like to retry from the start of the battle?", options: opts(["Yes", "No"]) };
  const mem = freshMemory();
  decide(ask, null, mem);
  const cmd = { ...command("Larvitar"), wave: 8 };
  assert.deepEqual(decide(cmd, battle("Larvitar Rock Throw → Pidgey", 8), mem).args, { label: "Pokémon" });
  const rows: [string, { fainted?: boolean; active?: boolean }?][] = [["Larvitar Lv.9 30/30", { active: true }], ["Machop Lv.9 30/30"], ["Growlithe Lv.9 30/30"]];
  assert.deepEqual(decide({ ...party("PARTY/SWITCH", rows), wave: 8 }, null, mem).args, { label: "Machop Lv.9 30/30" });
  assert.equal(decide({ screen: "PARTY/SWITCH:options", wave: 8, options: opts(["Switch", "Summary", "Cancel"]) }, null, mem).intent, "switch");
  assert.deepEqual(decide({ ...command("Machop"), wave: 8 }, battle("Machop Karate Chop → Pidgey", 8), mem).args, { label: "Fight" }, "only the opening turn swaps");

  decide(ask, null, mem);
  decide(cmd, battle("Larvitar Rock Throw → Pidgey", 8), mem);
  assert.deepEqual(decide({ ...party("PARTY/SWITCH", rows), wave: 8 }, null, mem).args, { label: "Growlithe Lv.9 30/30" }, "the second retry leads with the next mon");
});

const catching = (summary: string | null, rows: string[] = []): Card => ({
  kind: "battle", card_wave: 3, groups: [{ id: "act", label: "Now", summary: "Charmander Ember → Pidgey", rows: [] }, { id: "catch", label: "Catch", summary, rows }],
});
const balls: Menu = { screen: "BALL", wave: 3, options: [...opts(["Poké Ball ×5", "Great Ball ×2"]), { i: 2, label: "Cancel" }] };

test("a card that says catch throws the ball it names (#508)", () => {
  const mem = freshMemory();
  assert.deepEqual(decide(command("Charmander"), catching("catch Pidgey — Great 81%"), mem), { tool: "select_option", args: { label: "Ball" }, by: "card" });
  assert.deepEqual(decide(balls, null, mem), { tool: "select_option", args: { label: "Great Ball ×2" }, by: "card" });
  assert.deepEqual(decide(balls, null, freshMemory()).args, { label: "Poké Ball ×5" }, "with no ball named, the first one held");
});

test("a catch into a full party releases the mon the card says it replaces, and only then (#508)", () => {
  const mem = { ...freshMemory(), party: 6 };
  assert.deepEqual(decide(command("Charmander"), catching("catch Pidgey — Poké 77%"), mem).args, { label: "Fight" }, "no one named to replace");
  const full = catching("catch Pidgey — Poké 77%", ["· team party full: replaces Squirtle"]);
  assert.deepEqual(decide(command("Charmander"), full, mem).args, { label: "Ball" });
  decide(balls, null, mem);
  const prompt: Menu = { screen: "CONFIRM", wave: 3, text: "Your party is full.\nRelease a Pokémon to make room for Pidgey?", options: opts(["Yes", "No"]) };
  assert.deepEqual(decide(prompt, null, mem), { tool: "select_option", args: { label: "Yes" }, by: "card" });
  const rows: [string, { fainted?: boolean; active?: boolean }?][] = [["Charmander Lv.9 30/30", { active: true }], ["Squirtle Lv.12 30/30"], ["Bulbasaur Lv.8 30/30"]];
  assert.deepEqual(decide(party("PARTY/RELEASE", rows), null, mem).args, { label: "Squirtle Lv.12 30/30" });
  assert.deepEqual(decide({ screen: "PARTY/RELEASE:options", wave: 3, options: opts(["Release", "Summary", "Cancel"]) }, null, mem).args, { label: "Release" });
  assert.deepEqual(decide(prompt, null, freshMemory()).args, { label: "No" }, "a catch nobody asked to keep is given up");
});

test("an EXP item or a Rare Candy is taken ahead of the card's reward (#508)", () => {
  const shop: Menu = { screen: "MODIFIER_SELECT", wave: 3, options: [
    { i: "1:0", label: "Potion", kind: "reward" }, { i: "1:1", label: "EXP. All", kind: "reward" },
  ] };
  const rewards: Card = { kind: "reward", card_wave: 3, groups: [{ id: "act", label: "Now", summary: "take Potion", rows: [] }] };
  assert.deepEqual(decide(shop, rewards, freshMemory()), { tool: "select_option", args: { index: "1:1" }, by: "rule", intent: "shop" });
  const candy: Menu = { ...shop, options: [{ i: "1:0", label: "Potion", kind: "reward" }, { i: "1:1", label: "Rare Candy", kind: "reward" }] };
  assert.deepEqual(decide(candy, rewards, freshMemory()).args, { index: "1:1" }, "a Rare Candy too");
});

test("a maybe or a fourth throw in a wave fights instead (#508)", () => {
  assert.deepEqual(decide(command("Charmander"), catching(null), freshMemory()).args, { label: "Fight" });
  const mem = freshMemory();
  for (let i = 0; i < 3; i++) assert.deepEqual(decide(command("Charmander"), catching("catch Pidgey — Poké 30%"), mem).args, { label: "Ball" });
  assert.deepEqual(decide(command("Charmander"), catching("catch Pidgey — Poké 30%"), mem).args, { label: "Fight" });
});
