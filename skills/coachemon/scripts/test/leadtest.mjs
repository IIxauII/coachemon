import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { mon, species } from "./fixtures/party.mjs";
import { cat as CAT, TY } from "./fake-mon.mjs";

globalThis.window = globalThis;
globalThis.Phaser = {
  Math: { RND: { _s: "!rnd,live", state(v) { if (v !== undefined) this._s = v; return this._s; },
    integerInRange() { return 0; }, realInRange() { return 0; }, frac() { return 0; }, pick(a) { return a[0]; },
    shuffle(a) { return a; } } },
  Display: { Canvas: { CanvasPool: { pool: [] } } },
};
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {}, appendChild() {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { leadAdvice } = globalThis.__hud["51-lead"];
const { readRun } = globalThis.__hud["26-run"];

// `[name, type, power, category]`, by id from 1: what a preview row's `moveIds` index.
const FOE_MOVES = [["Rock Slide", "Rock", 75, "P"], ["Earthquake", "Ground", 100, "P"], ["Energy Ball", "Grass", 90, "S"],
  ["Psychic", "Psychic", 90, "S"]];
const MOVES = [null, ...FOE_MOVES.map(([name, type, power, cat], i) => ({ id: i + 1, name, type: TY.indexOf(type), power,
  accuracy: 100, category: CAT[cat], pp: 10, moveTarget: 3, priority: 0, flags: 0, attrs: [] }))];
const moveId = name => MOVES.findIndex(m => m?.name === name);
globalThis.__hud["04-game-tables"].setGameTables({ species: { getSpecies: () => null, getAllSpecies: () => [] },
  moves: MOVES, abilities: [] });

const sum = xs => xs.reduce((t, x) => t + x, 0);
const ours = (id, name, types, base) => species(id, name, types, sum(base), { base });
const SP = {
  charizard: ours(6, "Charizard", ["Fire", "Flying"], [78, 84, 78, 109, 85, 100]),
  typhlosion: ours(157, "Typhlosion", ["Fire"], [78, 84, 78, 109, 85, 100]),
  swampert: ours(260, "Swampert", ["Water", "Ground"], [100, 110, 90, 85, 90, 60]),
  meganium: ours(154, "Meganium", ["Grass"], [80, 82, 100, 83, 100, 80]),
};
// The fixture's `hp` is a number, not a share: one past every max HP here is full health, which the combatant caps.
const full = (sp, level, moves, opts = {}) => mon(sp, level, moves, { hp: 999, ...opts });
const MV = {
  flamethrower: ["Flamethrower", "Fire", 90, "S"],
  airSlash: ["Air Slash", "Flying", 75, "S"],
  surf: ["Surf", "Water", 90, "S"],
  energyBall: ["Energy Ball", "Grass", 90, "S"],
};

// A preview row as 48-preview.js `foeData` hands it: `stats` the `Stat`-indexed row, `moveIds` into `MOVES`.
const foe = (name, level, types, stats, moves) => ({ name, level, types, stats, moveIds: moves.map(moveId),
  ability: null, passive: null, segments: 0 });
const GOLEM = foe("Golem", 44, ["Rock", "Ground"], [131, 117, 126, 60, 69, 51], ["Rock Slide", "Earthquake"]);
const RHYDON = foe("Rhydon", 44, ["Ground", "Rock"], [153, 126, 117, 51, 51, 47], ["Rock Slide", "Earthquake"]);
const EXEGGUTOR = foe("Exeggutor", 44, ["Grass", "Psychic"], [144, 95, 86, 122, 78, 60], ["Energy Ball", "Psychic"]);
const preview = (foes, { type = "trainer", double = false, confidence = "exact", wave = 45 } = {}) => ({
  kind: "preview", wave, type, double, foes, trainer: type === "trainer" ? { name: "Hiker" } : null,
  confidence: { type: "exact", trainer: confidence, foes: confidence, double: confidence, levels: confidence }, missed: [],
});
const sceneOf = party => ({ seed: "lead-1", modifiers: [], enemyModifiers: [], currentBattle: { waveIndex: 44 },
  arena: { biomeId: 3 }, gameMode: { isBoss: w => w % 10 === 0, isFixedBattle: () => false, hasTrainers: true },
  getPlayerParty: () => party, getEnemyParty: () => [] });
const advise = (party, pv) => readRun(sceneOf(party), run => leadAdvice(run, pv));
const show = (label, a) => console.log(`== ${label}\n${a ? JSON.stringify(a) : "quiet"}`);
// Only Swampert beats Golem: Rock Slide is ×4 on Charizard and ×2 on Typhlosion, and Golem resists Fire.
const TRIO = () => [
  full(SP.charizard, 45, [MV.flamethrower, MV.airSlash]),
  full(SP.typhlosion, 45, [MV.flamethrower]),
  full(SP.swampert, 45, [MV.surf]),
];

// ---- A lead that loses the opener gives way to the one member on the bench that wins it
{
  const a = advise(TRIO(), preview([GOLEM]));
  show("single: Charizard loses to Golem", a);
  assert.equal(a.swaps.length, 1);
  const [sw] = a.swaps;
  assert.deepEqual([sw.out.name, sw.out.slot, sw.in.name, sw.in.slot, sw.foe], ["Charizard", 0, "Swampert", 2, "Golem"]);
  assert.ok(sw.out.s < 0, `the lead loses it: ${sw.out.s}`);
  assert.ok(sw.in.s > 0, `the one leading instead wins it: ${sw.in.s}`);
}

// ---- A wild opener is judged like a trainer's
{
  const a = advise(TRIO(), preview([GOLEM], { type: "wild" }));
  show("wild single: Charizard loses to Golem", a);
  assert.deepEqual(a.swaps.map(sw => [sw.out.name, sw.in.name]), [["Charizard", "Swampert"]]);
}

// ---- A fainted slot 0 does not lead, so the member behind it is the one judged and swapped
{
  const [, typhlosion, swampert] = TRIO();
  const fainted = full(SP.charizard, 45, [MV.flamethrower], { hp: 0, allowed: false });
  const a = advise([fainted, typhlosion, swampert], preview([GOLEM]));
  show("fainted slot 0: Typhlosion leads and loses", a);
  assert.deepEqual(a.swaps.map(sw => [sw.out.name, sw.out.slot, sw.in.name, sw.in.slot]), [["Typhlosion", 1, "Swampert", 2]]);
}

// ---- A double: a lead gives way only when both openers beat it, and each slot takes its own member from the bench
{
  const [charizard, typhlosion, swampert] = TRIO();
  const meganium = full(SP.meganium, 45, [MV.energyBall]);
  const rocks = preview([GOLEM, RHYDON], { double: true });

  const one = advise([swampert, charizard, typhlosion, meganium], rocks);
  show("double: Charizard loses to both, Swampert holds", one);
  assert.deepEqual(one.swaps.map(sw => [sw.out.name, sw.out.slot, sw.in.name, sw.in.slot]), [["Charizard", 1, "Meganium", 3]]);

  const two = advise([charizard, typhlosion, swampert, meganium], rocks);
  show("double: both leads lose to both", two);
  assert.deepEqual(two.swaps.map(sw => [sw.out.name, sw.out.slot]), [["Charizard", 0], ["Typhlosion", 1]]);
  assert.deepEqual(two.swaps.map(sw => sw.in.name).sort(), ["Meganium", "Swampert"], "two members, never one twice");
  for (const sw of two.swaps) {
    assert.ok(sw.in.s > 0 && sw.out.s < 0, `${sw.in.name} wins against ${sw.foe} where ${sw.out.name} loses`);
  }

  // Charizard loses to Golem but beats Exeggutor: it holds its slot.
  const split = advise([charizard, swampert, typhlosion, meganium], preview([GOLEM, EXEGGUTOR], { double: true }));
  show("double: Charizard beats one opener of the two", split);
  assert.equal(split, null);

  const blind = advise([charizard, typhlosion, swampert, meganium], preview([GOLEM, null], { double: true }));
  show("double: one opener unreadable", blind);
  assert.equal(blind, null);
}

// ---- Two members on the bench that win by the same score: the earlier slot leads
{
  const [charizard, typhlosion, swampert] = TRIO();
  const twin = full(SP.swampert, 45, [MV.surf]);
  const a = advise([charizard, typhlosion, swampert, twin], preview([GOLEM]));
  show("tie: two Swamperts on the bench", a);
  assert.deepEqual(a.swaps.map(sw => [sw.in.name, sw.in.slot]), [["Swampert", 2]]);
}

// ---- The advice is as sure as the preview fields it rests on: the foes, their levels and whether it is a double
{
  const sure = advise(TRIO(), preview([GOLEM]));
  assert.deepEqual([sure.confidence, sure.missed], ["exact", false]);
  const rolled = { ...preview([GOLEM], { type: "wild" }), confidence: { type: "replay", trainer: null, foes: "estimate",
    double: "replay", levels: "replay" } };
  assert.equal(advise(TRIO(), rolled).confidence, "estimate");
  const grunt = { ...preview([GOLEM]), confidence: { type: "exact", trainer: "estimate", foes: "exact", double: "exact",
    levels: "exact" } };
  assert.equal(advise(TRIO(), grunt).confidence, "exact");
  const wrong = advise(TRIO(), { ...preview([GOLEM]), missed: ["double"] });
  show("a preview whose double has been wrong this run", wrong);
  assert.equal(wrong.missed, true);
  assert.equal(advise(TRIO(), { ...preview([GOLEM]), missed: ["trainer"] }).missed, false);
}

// ---- Quiet: the lead wins, nobody behind it wins, or there is no opener to judge
{
  const [charizard, typhlosion, swampert] = TRIO();
  const cases = {
    "the lead wins it": [[swampert, charizard, typhlosion], preview([GOLEM])],
    "nobody behind it wins": [[charizard, typhlosion], preview([GOLEM])],
    "one member standing": [[charizard], preview([GOLEM])],
    "a mystery encounter fields no foes": [TRIO(), { ...preview([]), type: "me", me: { name: "Mysterious Chest" } }],
    "no preview": [TRIO(), null],
    "a preview that could not be read": [TRIO(), { kind: "preview", wave: 45, unavailable: "the live build has no addEnemyPokemon" }],
  };
  for (const [label, [party, pv]] of Object.entries(cases)) {
    const a = advise(party, pv);
    show(`quiet: ${label}`, a);
    assert.equal(a, null, label);
  }
}

// ---- The rewards card says the reorder in its act group, before the free reward that would close the shop
{
  const { drawRewards } = globalThis.__hud["96-render-rewards"];
  const { rewardsSummary } = globalThis.__hud["52-shop"];
  const txt = n => (n == null || n === false ? "" : typeof n === "string" ? n : (n.children ?? []).map(txt).join(" "));
  const actOf = m => drawRewards(m).find(g => g.id === "act").rows.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const card = (lead, buys = []) => ({ kind: "rewards", money: 900, left: 900 - buys.reduce((t, b) => t + b.cost, 0), buys,
    free: [{ name: "Potion", icon: "potion", v: 5, why: "heals Swampert" }], pick: 0, reroll: null, rerollAhead: null,
    bossNext: false, gauntlet: false, luck: null, wave: 44, affordable: 1, ahead: null, audit: null, lead });

  const single = advise(TRIO(), { ...preview([GOLEM]), confidence: { type: "exact", trainer: "exact", foes: "replay",
    double: "exact", levels: "exact" } });
  console.log(`== rewards card: one swap\n${actOf(card(single)).join("\n")}\nsummary ${rewardsSummary(card(single))}`);
  assert.equal(rewardsSummary(card(single)), "lead with Swampert over Charizard (beats Golem) [~] · take Potion");
  const act = actOf(card(single));
  assert.equal(act[0], "reorder first — taking the free reward closes the shop");
  assert.equal(act[1], "⇄ lead Swampert switch with Charizard · beats Golem~");
  assert.ok(act.indexOf(act.find(t => t.startsWith("★"))) > 1, "the take comes after the reorder");

  const potion = { name: "Potion", icon: "potion", cost: 300, target: null, targetName: "Swampert", why: "60% HP" };
  assert.equal(actOf(card(single, [potion]))[0], "buy and reorder first — taking the free reward closes the shop");

  const [charizard, typhlosion, swampert] = TRIO();
  const pair = advise([charizard, typhlosion, swampert, full(SP.meganium, 45, [MV.energyBall])], preview([GOLEM, RHYDON], { double: true }));
  console.log(`== rewards card: two swaps\n${actOf(card(pair)).join("\n")}\nsummary ${rewardsSummary(card(pair))}`);
  assert.equal(rewardsSummary(card(pair)),
    "lead with Meganium over Charizard (beats Golem), Swampert over Typhlosion (beats Golem) · take Potion");

  const missed = { ...single, missed: true };
  assert.match(rewardsSummary(card(missed)), / \[!\] · take Potion$/);
  assert.equal(rewardsSummary(card(null)), "take Potion", "no lead, no clause");
  assert.equal(actOf(card(null))[0].startsWith("★"), true, "and no reorder hint");
}

console.log("ok");
