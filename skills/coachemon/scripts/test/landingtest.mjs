import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { mon, TRAITS } from "./fake-mon.mjs";
import { fakeTurn } from "./fake-turn.mjs";
import { fightState } from "./fake-fight.mjs";
import { AbilityId, BerryType } from "../../../../src/enums/generated.ts";

mountHud({ scene: { currentBattle: { waveIndex: 10, turn: 1 }, getField: () => [], getPlayerParty: () => [], getEnemyParty: () => [] } });
const D = globalThis.__hud["10-damage"];
const { stateOf, land, landTurnEnd, luckKey, landingKey, benched, koCurve, koTurns } = D;
const { tpTables, tpFight } = globalThis.__hud["35-team-plan"];

const held = (name, n = 1) => new ({ [name]: class { getStackCount() { return n; } } })[name]();
const tokens = n => (n ? [Object.assign(held("EnemyEndureChanceModifier", n), { chance: 2 })] : []);
const berries = (type, n) => (n ? [Object.assign(held("BerryModifier", n), { berryType: type })] : []);
const BUST = { disguise: 0.125, iceFace: 0 };
class FormBlockDamageAbAttr { constructor(recoil) { Object.assign(this, { formIndex: 0, recoil }); } }
// `token` is the wave's endure chance in stacks of 2 %; `cut` "multiscale" or "shadow shield"; `form`: "disguise" or
// "iceFace", held intact; `sub` the HP of the Substitute it stands behind; `sitrus` and `enigma` the berries held, and
// `pouch` the side's Berry Pouch stacks, `lum` the Lum Berries held beside them; `bell` its Shell Bell stacks, `charm` the
// side's Healing Charm stacks and `healBlock` a Heal Block on it; `moves` as fake-mon.mjs's `mon` takes them.
const CUTS = { multiscale: AbilityId.MULTISCALE, "shadow shield": AbilityId.SHADOW_SHIELD };
const targetMon = ({ name = "target", hp = 100, maxHp = hp, boss = 0, idx, sturdy = false, cut = null, band = 0, seed = false, form = null, sub = 0, sitrus = 0, enigma = 0, lum = 0, bell = 0, healBlock = false, player = false, trainer = false, moves = [] } = {}) =>
  mon(name, 50, ["Normal"], [maxHp, 100, 100, 100, 100, 100], moves, true, hp, {
    isPlayer: () => player, bossSegments: boss, bossSegmentIndex: idx ?? Math.max(0, boss - 1), formIndex: 0, waveData: {},
    hasAbilityWithAttr: a => (sturdy && a === "PreDefendFullHpEndureAbAttr") || (!!form && a === "FormBlockDamageAbAttr"),
    hasAbility: id => !!cut && id === CUTS[cut],
    getAbility: () => ({ name: "x", getAttrs: n => (form && n === "FormBlockDamageAbAttr" ? [new FormBlockDamageAbAttr(BUST[form])] : []) }),
    ...(trainer ? { hasTrainer: () => true } : {}),
    getHeldItems: () => [...(band ? [held("SurviveDamageModifier", band)] : []), ...(seed ? [held("PokemonInstantReviveModifier")] : []),
      ...berries(BerryType.SITRUS, sitrus), ...berries(BerryType.ENIGMA, enigma), ...berries(BerryType.LUM, lum), ...(bell ? [held("HitHealModifier", bell)] : [])],
    getTag: t => (sub && t === "SUBSTITUTE" ? { tagType: t, hp: sub } : healBlock && t === "HEAL_BLOCK" ? { tagType: t } : null),
  });
const pouches = n => (n ? [held("PreserveBerryModifier", n)] : []);
// A target's facts as the fakes read them (fake-turn.mjs).
const charms = n => (n ? [Object.assign(held("HealingBoosterModifier", n), { multiplier: 1.1 })] : []);
const factsOf = (o = {}) => D.targetFacts({ modifiers: charms(o.charm ?? 0), enemyModifiers: [...tokens(o.token ?? 0), ...pouches(o.pouch ?? 0)], finalBoss: !!o.finalBoss }, targetMon(o));
const at = (o = {}) => stateOf(factsOf(o));
const sure = (d, n = 1) => ({ d, n });
// `[hp, bar, p, dealt, hits]` per outcome, with `R` for a spent Reviver Seed, `T` for a spent token and `B` for a busted
// Disguise or Ice Face; `S`, `E`: the Sitrus and Enigma Berries held, `O` each other berry type's; `F`: a super-effective
// hit landed this turn.
const marks = s => `${s.revived ? "R" : ""}${s.tok ? "T" : ""}${s.busted ? "B" : ""}${s.sitrus ? `S${s.sitrus}` : ""}${s.enigmas ? `E${s.enigmas}` : ""}${s.others.length ? `O${s.others.join("")}` : ""}${s.fed ? "F" : ""}`;
const row = outs => outs.map(o => `${+o.state.hp.toFixed(3)}/${o.state.bar}${marks(o.state)} p${+o.p.toFixed(4)}${"dealt" in o ? ` dealt ${+o.dealt.toFixed(3)} ×${o.hits}` : ""}`).join(" · ");
const show = (what, outs) => console.log(`${what}: ${row(outs)}`);
const shape = outs => outs.map(o => [+o.state.hp.toFixed(6), o.state.bar, o.state.revived, o.state.tok, +o.p.toFixed(6), o.hits]);

// ---- A boss's bars clamp each hit on its own, a hit past a bar by twice its size breaks two, and the classic final boss keeps 1 HP on its last bar (game-code.md §3)
{
  console.log("== bars");
  const boss = at({ hp: 300, boss: 3 });
  const one = land(boss, sure(150));
  show("one hit of 150 into 300 over three bars", one);
  assert.deepEqual(shape(one), [[200, 1, false, false, 1, 1]]);
  const two = land(boss, sure(150, 2));
  show("two hits of 75", two);
  assert.deepEqual(shape(two), [[200, 1, false, false, 1, 2]]);
  assert.equal(two[0].dealt, 100);
  const past = land(boss, sure(300));
  show("one hit of 300", past);
  assert.deepEqual(shape(past), [[100, 0, false, false, 1, 1]]);
  const through = land(boss, sure(500));
  assert.deepEqual(shape(through), [[0, 0, false, false, 1, 1]], "a big enough hit KOs through every bar");
  const hurt = stateOf(boss.facts, 250);
  assert.deepEqual(shape(land(hurt, sure(150, 3))), [[100, 0, false, false, 1, 3]], "three hits of 50 from 250 clamp one by one");
  assert.deepEqual(shape(land(hurt, sure(150))), [[200, 1, false, false, 1, 1]], "one of 150 stops at the bar");
  const two2 = at({ hp: 200, boss: 2 });
  const first = land(two2, sure(150));
  assert.deepEqual(shape(first), [[100, 0, false, false, 1, 1]]);
  assert.deepEqual(shape(land(first[0].state, sure(150))), [[0, 0, false, false, 1, 1]]);
  const eternatus = at({ hp: 100, finalBoss: true });
  const floor = land(eternatus, sure(999));
  show("the final boss on its last bar, hit for 999", floor);
  assert.deepEqual(shape(floor), [[1, 0, false, false, 1, 1]]);
}

// ---- Sturdy holds a full-HP holder on 1 HP, never a hurt one or a hit that pierces it, and a use's second hit gets through (game-code.md §3)
{
  console.log("== Sturdy");
  const full = at({ sturdy: true });
  const held1 = land(full, sure(150));
  show("full HP, hit for 150", held1);
  assert.deepEqual(shape(held1), [[1, 0, false, false, 1, 1]]);
  assert.equal(held1[0].dealt, 99);
  assert.deepEqual(shape(land(stateOf(full.facts, 99), sure(150))), [[0, 0, false, false, 1, 1]], "Sturdy needs full HP");
  assert.deepEqual(shape(land(full, sure(150), { ignoresSturdy: true })), [[0, 0, false, false, 1, 1]], "a hit that pierces it");
  const twice = land(full, sure(300, 2));
  show("full HP, two hits of 150", twice);
  assert.deepEqual(shape(twice), [[0, 0, false, false, 1, 2]]);
}

// ---- Multiscale and Shadow Shield halve a hit while their holder is at full HP, and not once it is below it (game-code.md §8)
{
  console.log("== Multiscale and Shadow Shield");
  for (const cut of ["multiscale", "shadow shield"]) {
    const full = at({ hp: 200, cut });
    const halved = land(full, sure(150));
    show(`${cut}, full HP, hit for 150 of 200`, halved);
    assert.deepEqual(shape(halved), [[125, 0, false, false, 1, 1]]);
    assert.equal(halved[0].dealt, 75);
    const lethal = land(full, sure(300));
    show(`${cut}, full HP, hit for 300`, lethal);
    assert.deepEqual(shape(lethal), [[50, 0, false, false, 1, 1]], "the cut stops a lethal hit");
    assert.deepEqual(shape(land(stateOf(full.facts, 199), sure(150))), [[49, 0, false, false, 1, 1]], "below full HP");
  }
}

// ---- A multi-hit use's second hit lands on a Multiscale holder below full HP, unhalved (game-code.md §8)
{
  const twice = land(at({ hp: 200, cut: "multiscale" }), sure(300, 2));
  show("multiscale, full HP, two hits of 150", twice);
  assert.deepEqual(shape(twice), [[0, 0, false, false, 1, 2]]);
  assert.equal(twice[0].dealt, 200);
}

// ---- Mold Breaker gets past Multiscale and not Shadow Shield (game-code.md §1)
{
  const mold = { ignoresAbility: true };
  assert.deepEqual(shape(land(at({ hp: 200, cut: "multiscale" }), sure(150), mold)), [[50, 0, false, false, 1, 1]], "Multiscale");
  assert.deepEqual(shape(land(at({ hp: 200, cut: "shadow shield" }), sure(150), mold)), [[125, 0, false, false, 1, 1]], "Shadow Shield");
}

// ---- A hit whose numbers already hold the cut is not halved again at full HP and lands whole below it, and fixed damage never meets it (game-code.md §1, §2, §8)
{
  const full = at({ hp: 200, cut: "multiscale" });
  const asked = { cut: "in" };
  assert.deepEqual(shape(land(full, sure(75), asked)), [[125, 0, false, false, 1, 1]], "at full HP");
  assert.deepEqual(shape(land(stateOf(full.facts, 199), sure(75), asked)), [[49, 0, false, false, 1, 1]], "below it");
  const twice = land(full, sure(150, 2), asked);
  show("multiscale, full HP, two hits the game asked at full HP for 75 each", twice);
  assert.deepEqual(shape(twice), [[0, 0, false, false, 1, 2]]);
  assert.deepEqual(shape(land(full, sure(150), { cut: "never" })), [[50, 0, false, false, 1, 1]], "fixed damage");
}

// ---- The endure token rolls on the hit's damage before the bar clamps it, is spent where the clamp or Sturdy already stops the hit, and only once a wave (game-code.md §3)
{
  console.log("== the endure token");
  const plain = at({ token: 5 });
  const saved = land(plain, sure(150));
  show("10 % token, hit for 150 of 100", saved);
  assert.deepEqual(shape(saved), [[1, 0, false, true, 0.1, 1], [0, 0, false, false, 0.9, 1]]);
  const boss = at({ hp: 200, boss: 2, token: 5 });
  const clamped = land(boss, sure(250));
  show("a 2-bar boss on 200, hit for 250", clamped);
  assert.deepEqual(shape(clamped), [[100, 0, false, true, 0.1, 1], [100, 0, false, false, 0.9, 1]]);
  assert.deepEqual(shape(land(boss, sure(150))), [[100, 0, false, false, 1, 1]], "a hit short of its HP before the clamp rolls nothing");
  const sturdy = land(at({ sturdy: true, token: 5 }), sure(150));
  assert.deepEqual(shape(sturdy), [[1, 0, false, true, 0.1, 1], [1, 0, false, false, 0.9, 1]], "Sturdy saves, and the roll still spends the token");
  const spent = stateOf(plain.facts, 100, 0, saved[0].state);
  assert.deepEqual(shape(land(spent, sure(150))), [[0, 0, false, true, 1, 1]], "a spent token rolls no more");
  const both = land(plain, sure(300, 2));
  show("two hits of 150", both);
  assert.deepEqual(shape(both), [[0, 0, false, false, 0.9, 1], [0, 0, false, true, 0.1, 2]], "the save covers only the hit it rolled on");
}

// ---- A Focus Band saves a lethal hit at 1 HP one time in ten per stack, every hit (game-code.md §3)
{
  console.log("== Focus Band");
  const band = at({ band: 1 });
  const one = land(band, sure(150));
  show("hit for 150 of 100", one);
  assert.deepEqual(shape(one), [[1, 0, false, false, 0.1, 1], [0, 0, false, false, 0.9, 1]]);
  const two = land(band, sure(300, 2));
  show("two hits of 150", two);
  assert.deepEqual(shape(two), [[1, 0, false, false, 0.01, 2], [0, 0, false, false, 0.9, 1], [0, 0, false, false, 0.09, 2]]);
}

// ---- A Reviver Seed brings its holder back at half HP once, ending the use that felled it (game-code.md §8)
{
  console.log("== Reviver Seed");
  const seed = at({ hp: 100, maxHp: 200, seed: true });
  const back = land(seed, sure(300, 3));
  show("100 of 200, three hits of 100", back);
  assert.deepEqual(shape(back), [[100, 0, true, false, 1, 1]]);
  assert.equal(back[0].dealt, 100, "dealt counts the HP the hit took before the revive");
  assert.deepEqual(shape(land(back[0].state, sure(300))), [[0, 0, true, false, 1, 1]], "once");
}

// ---- An intact Disguise takes a use's first hit whole, and busting it costs an eighth of max HP (game-code.md §8)
{
  console.log("== Disguise");
  const first = land(at({ form: "disguise" }), sure(150));
  show("full HP, hit for 150", first);
  assert.deepEqual(shape(first), [[88, 0, false, false, 1, 1]]);
  assert.equal(first[0].state.busted, true);
  assert.equal(first[0].dealt, 0, "the bust's chip is no damage the hit dealt");
}

// ---- A use's second hit lands on the busted form, and a later use meets no disguise (game-code.md §8)
{
  const mimikyu = at({ form: "disguise" });
  const twice = land(mimikyu, sure(300, 2));
  show("two hits of 150", twice);
  assert.deepEqual(shape(twice), [[0, 0, false, false, 1, 2]]);
  assert.equal(twice[0].dealt, 88);
  const [busted] = land(mimikyu, sure(150));
  const later = land(busted.state, sure(150));
  show("busted on 88, hit for 150", later);
  assert.deepEqual(shape(later), [[0, 0, false, false, 1, 1]]);
  assert.deepEqual(shape(land(stateOf(mimikyu.facts, 100, 0, busted.state), sure(150))), [[0, 0, false, false, 1, 1]], "the bust carries through `from`");
}

// ---- Ice Face's bust costs nothing; Disguise's chip lands through the bars on no Focus Band or token, and only a Reviver Seed outlives it (game-code.md §8)
{
  assert.deepEqual(shape(land(at({ form: "iceFace" }), sure(150))), [[100, 0, false, false, 1, 1]], "Ice Face");
  const low = at({ hp: 10, maxHp: 100, form: "disguise", band: 10, token: 50 });
  assert.deepEqual(shape(land(low, sure(150))), [[0, 0, false, false, 1, 1]], "12 of chip into 10 HP");
  const seeded = land(at({ hp: 10, maxHp: 100, form: "disguise", seed: true }), sure(300, 2));
  show("10 of 100 with a Reviver Seed, two hits of 150", seeded);
  assert.deepEqual(shape(seeded), [[50, 0, true, false, 1, 1]]);
  const boss = land(at({ hp: 105, maxHp: 200, boss: 2, form: "disguise" }), sure(150));
  show("105 of a 2-bar 200, hit for 150", boss);
  assert.deepEqual(shape(boss), [[80, 0, false, false, 1, 1]]);
  assert.deepEqual(shape(land(at({ hp: 12.5, maxHp: 100, form: "disguise", band: 10 }), sure(5), {}, { whole: true })), [[0.5, 0, false, false, 1, 1]], "under `whole`, a chip leaving a sliver fells it");
}

// ---- A hit that ignores the form block, a Mold Breaker's or a fixed-damage one, lands whole and busts nothing, and a miss busts nothing (game-code.md §8)
{
  const mimikyu = at({ form: "disguise" });
  const through = land(mimikyu, sure(60), { ignoresDisguise: true });
  assert.deepEqual(shape(through), [[40, 0, false, false, 1, 1]]);
  assert.equal(through[0].state.busted, false);
  assert.deepEqual(land(mimikyu, sure(0)), [{ state: mimikyu, p: 1, dealt: 0, subDealt: 0, hits: 0 }]);
}

// ---- An intact Disguise is luck that can stop a lethal hit, so its luck key tells it from a busted one (#1034)
{
  const facts = factsOf({ form: "disguise" });
  const [busted] = land(stateOf(facts), sure(150));
  assert.notEqual(luckKey(stateOf(facts, 88)), luckKey(busted.state));
  assert.equal(luckKey(stateOf(factsOf(), 88, 0, busted.state)), luckKey(stateOf(factsOf(), 88)), "no form block, nothing to tell");
}

// ---- Under `whole` a hit leaving under 1 HP is lethal and rolls the target's luck; without it the sliver stands (#527)
{
  console.log("== whole");
  const band = at({ hp: 10, band: 1 });
  const whole = land(band, sure(9.5), {}, { whole: true });
  show("a Focus Band holder on 10, hit for 9.5, whole", whole);
  assert.deepEqual(shape(whole), [[1, 0, false, false, 0.1, 1], [0.5, 0, false, false, 0.9, 1]]);
  const sliver = land(band, sure(9.5));
  show("…without", sliver);
  assert.deepEqual(shape(sliver), [[0.5, 0, false, false, 1, 1]]);
  assert.deepEqual(shape(land(stateOf(band.facts, 0.5), sure(3), {}, { whole: true })), [[0.5, 0, false, false, 1, 0]], "under 1 HP is already down");
}

// `[hp, bar, Sitrus held, Enigmas held, fed, p]` per turn-end outcome.
const ended = outs => outs.map(o => [+o.state.hp.toFixed(6), o.state.bar, o.state.sitrus, o.state.enigmas, o.state.fed, +o.p.toFixed(6)]);

// ---- A Sitrus Berry is eaten below half HP by the ratio rounded to 0.01, so 99 of 200 keeps it and 98 eats it (game-code.md §3)
{
  console.log("== the Sitrus Berry at the turn end");
  const at99 = landTurnEnd(stateOf(factsOf({ maxHp: 200, sitrus: 1 }), 99));
  show("99 of 200", at99);
  assert.deepEqual(ended(at99), [[99, 0, 1, 0, false, 1]]);
  const at98 = landTurnEnd(stateOf(factsOf({ maxHp: 200, sitrus: 1 }), 98));
  show("98 of 200", at98);
  assert.deepEqual(ended(at98), [[148, 0, 0, 0, false, 1]]);
}

// ---- A stack of Sitrus Berries is eaten one a turn end, while any is held (game-code.md §3)
{
  const two = stateOf(factsOf({ maxHp: 200, sitrus: 2 }), 60);
  const first = landTurnEnd(two);
  assert.deepEqual(ended(first), [[110, 0, 1, 0, false, 1]]);
  const second = landTurnEnd(stateOf(two.facts, 60, 0, first[0].state));
  assert.deepEqual(ended(second), [[110, 0, 0, 0, false, 1]]);
  assert.deepEqual(ended(landTurnEnd(stateOf(two.facts, 60, 0, second[0].state))), [[60, 0, 0, 0, false, 1]], "none left");
}

// ---- A Berry Pouch keeps each berry it eats at its own chance, as a branch that still holds it (game-code.md §3)
{
  const pouched = landTurnEnd(stateOf(factsOf({ maxHp: 200, sitrus: 1, pouch: 1 }), 98));
  show("a Sitrus Berry at 98 of 200, one Pouch stack", pouched);
  assert.deepEqual(ended(pouched), [[148, 0, 0, 0, false, 0.7], [148, 0, 1, 0, false, 0.3]]);
}

// ---- An Enigma Berry is eaten at the turn end of a turn a super-effective hit landed, on that share of the use alone (game-code.md §3)
{
  console.log("== the Enigma Berry");
  const st = stateOf(factsOf({ hp: 200, enigma: 1 }));
  const hit = land(st, { d: 70, se: 1 });
  show("hit super-effectively for 70", hit);
  const fed = landTurnEnd(hit[0].state);
  show("…its turn end", fed);
  assert.deepEqual(ended(fed), [[180, 0, 0, 0, false, 1]]);
  assert.deepEqual(ended(landTurnEnd(land(st, { d: 70 })[0].state)), [[130, 0, 0, 1, false, 1]], "a neutral hit feeds nothing");
  assert.deepEqual(ended(landTurnEnd(land(st, { d: 70 }, { e: 2 })[0].state)), [[180, 0, 0, 0, false, 1]], "the hit's `e` stands in for a point's `se`");
  const part = land(st, { d: 70, se: 0.4 });
  show("super-effective on 40 % of the use", part);
  assert.deepEqual(part.map(o => [o.state.fed, +o.p.toFixed(6)]), [[false, 0.6], [true, 0.4]]);
  assert.deepEqual(ended(landTurnEnd(land(st, { d: 0, se: 1 })[0].state)), [[200, 0, 0, 1, false, 1]], "a miss feeds nothing");
}

// ---- A strike a Disguise takes lands no damage, so it feeds no Enigma Berry, and the use's next strike does (game-code.md §3, §8)
{
  const st = stateOf(factsOf({ hp: 200, form: "disguise", enigma: 1 }));
  const busted = land(st, { d: 70, se: 1 });
  show("a Disguise holder with an Enigma Berry, hit super-effectively for 70", busted);
  assert.deepEqual(busted.map(o => [o.state.busted, o.state.fed]), [[true, false]]);
  assert.deepEqual(land(st, { d: 140, n: 2, se: 1 }).map(o => [o.state.busted, o.state.fed]), [[true, true]], "two strikes of 70");
}

// ---- Both berries read the HP from before either heals, between the change ahead of the berries and the rest (game-code.md §3, §21)
{
  const both = stateOf(factsOf({ maxHp: 200, sitrus: 1, enigma: 1 }), 120);
  const fed = land(both, { d: 22, se: 1 })[0].state;
  assert.deepEqual(ended(landTurnEnd(fed)), [[198, 0, 0, 0, false, 1]], "98 eats both");
  const sitrus = stateOf(factsOf({ maxHp: 200, sitrus: 1 }), 110);
  assert.deepEqual(ended(landTurnEnd(sitrus, { before: -20, after: -10 })), [[130, 0, 0, 0, false, 1]], "chip ahead of the berries brings it under half");
  assert.deepEqual(ended(landTurnEnd(sitrus, { after: -20 })), [[90, 0, 1, 0, false, 1]], "chip after them comes too late");
  assert.deepEqual(ended(landTurnEnd(sitrus, { before: 100, after: -10 })), [[190, 0, 1, 0, false, 1]], "a heal caps at max HP");
}

// ---- An opposing Unnerve keeps every berry uneaten, and the turn's mark goes either way (game-code.md §3)
{
  const st = land(stateOf(factsOf({ maxHp: 200, sitrus: 1, enigma: 1 }), 120), { d: 22, se: 1 })[0].state;
  assert.equal(st.fed, true);
  assert.deepEqual(ended(landTurnEnd(st, { eats: false })), [[98, 0, 1, 1, false, 1]]);
}

// ---- Turn-end chip stops at a boss bar and lands through Sturdy, the endure token, a Focus Band and a Reviver Seed, and a heal never raises a bar back (game-code.md §3, §21)
{
  console.log("== turn-end chip");
  const boss = stateOf(factsOf({ hp: 200, boss: 2 }), 130);
  const clamped = landTurnEnd(boss, { before: -50 });
  show("a 2-bar boss on 130 of 200, 50 of chip", clamped);
  assert.deepEqual(ended(clamped), [[100, 0, 0, 0, false, 1]]);
  assert.deepEqual(ended(landTurnEnd(clamped[0].state, { after: 60 })), [[160, 0, 0, 0, false, 1]]);
  const lucky = stateOf(factsOf({ sturdy: true, band: 5, token: 50, seed: true }));
  const chip = landTurnEnd(lucky, { before: -150 });
  show("every luck at full HP, 150 of chip", chip);
  assert.deepEqual(ended(chip), [[0, 0, 0, 0, false, 1]]);
  assert.equal(chip[0].state.revived, false, "no Reviver Seed on chip");
  assert.deepEqual(ended(landTurnEnd(stateOf(lucky.facts, 0), { after: 50 })), [[0, 0, 0, 0, false, 1]], "a state already down stays down");
}

// `[hp, bar, Substitute HP, p, dealt, the Substitute's loss, hits]` per outcome.
const subShape = outs => outs.map(o => [+o.state.hp.toFixed(6), o.state.bar, +o.state.sub.toFixed(6), +o.p.toFixed(6), +o.dealt.toFixed(6), +o.subDealt.toFixed(6), o.hits]);
const subRow = outs => outs.map(o => `${+o.state.hp.toFixed(3)}/${o.state.bar} sub ${+o.state.sub.toFixed(3)} p${+o.p.toFixed(4)} dealt ${+o.dealt.toFixed(3)} · sub lost ${+o.subDealt.toFixed(3)} ×${o.hits}`).join(" · ");

// ---- A Substitute takes a hit for its owner, leaving the owner's HP, bars and luck alone, its excess lost (game-code.md §8)
{
  console.log("== a Substitute");
  const sub = at({ sub: 25 });
  const took = land(sub, sure(20));
  console.log(`a 25 HP Substitute hit for 20: ${subRow(took)}`);
  assert.deepEqual(subShape(took), [[100, 0, 5, 1, 0, 20, 1]]);
  const lucky = at({ sub: 25, sturdy: true, band: 1, seed: true });
  const broke = land(lucky, sure(150));
  console.log(`…for 150, behind Sturdy, a Focus Band and a Reviver Seed: ${subRow(broke)}`);
  assert.deepEqual(subShape(broke), [[100, 0, 0, 1, 0, 25, 1]], "no luck is rolled, and the 125 past it reach nobody");
  assert.equal(broke[0].state.revived, false);
  const boss = at({ hp: 300, boss: 3, sub: 75 });
  assert.deepEqual(subShape(land(boss, sure(150))), [[300, 2, 0, 1, 0, 75, 1]], "a boss's bars stay as they were");
}

// ---- A Substitute takes a hit as Multiscale cut it, and keeps its owner at the full HP the cut needs (game-code.md §8)
{
  const three = land(at({ sub: 60, cut: "multiscale" }), sure(300, 3));
  console.log(`a 60 HP Substitute in front of Multiscale, three hits of 100: ${subRow(three)}`);
  assert.deepEqual(subShape(three), [[50, 0, 0, 1, 50, 60, 3]], "50 and 50 break it, and the third is still halved");
}

// ---- A hit a Substitute takes meets no Disguise, which takes the first hit that gets past it (game-code.md §8)
{
  const three = land(at({ sub: 25, form: "disguise" }), sure(120, 3));
  console.log(`a 25 HP Substitute in front of a Disguise, three hits of 40: ${subRow(three)} · busted ${three[0].state.busted}`);
  assert.deepEqual(subShape(three), [[48, 0, 0, 1, 40, 25, 3]], "the first breaks it, the Disguise takes the second at 12 HP of chip, and the third hits");
  assert.equal(three[0].state.busted, true);
  const past = land(at({ sub: 25, form: "disguise" }), sure(40), { ignoresSub: true });
  assert.deepEqual([subShape(past), past[0].state.busted], [[[88, 0, 25, 1, 0, 0, 1]], true], "a hit past the Substitute busts it at once");
}

// ---- A Substitute broken mid-use leaves the use's later hits to its owner (game-code.md §2, §8)
{
  const sub = at({ sub: 25, sturdy: true });
  const three = land(sub, sure(120, 3));
  console.log(`a 25 HP Substitute in front of Sturdy, three hits of 40: ${subRow(three)}`);
  assert.deepEqual(subShape(three), [[20, 0, 0, 1, 80, 25, 3]], "the first breaks it, 15 lost, and the next two hit, Sturdy's full HP and all");
  const two = land(at({ sub: 25 }), sure(20, 2));
  assert.deepEqual(subShape(two), [[100, 0, 5, 1, 0, 20, 2]], "two it outlasts");
}

// ---- A side that leaves the field leaves its Substitute behind and keeps the rest of its discrete part (game-code.md §8)
{
  const sub = land(at({ sub: 25, seed: true, hp: 60, maxHp: 100 }), sure(160, 2))[0].state;
  const off = benched(sub);
  assert.deepEqual([sub.sub, sub.revived], [0, true], "the first hit broke it and the second spent the seed");
  assert.equal(off, sub, "nothing to leave");
  const standing = at({ sub: 25, token: 5 });
  const left = benched(stateOf(standing.facts, 70, 0, { ...standing, tok: true }));
  assert.deepEqual([left.hp, left.sub, left.tok], [70, 0, true]);
  assert.equal(standing.sub, 25, "the state it came from is untouched");
  assert.equal(stateOf(left.facts, 70, 0, left).sub, 0, "and a state reopened from it stands behind none");
}

// ---- A sound move, one that ignores a Substitute, or an Infiltrator's, hits the owner as if it were not there (game-code.md §8)
{
  const past = land(at({ sub: 25 }), sure(40), { ignoresSub: true });
  console.log(`a hit past a 25 HP Substitute for 40: ${subRow(past)}`);
  assert.deepEqual(subShape(past), [[60, 0, 25, 1, 40, 0, 1]]);
}

// ---- A hit a Substitute takes rolls no endure token, which a later hit on its owner still may (game-code.md §8)
{
  const sub = at({ sub: 25, token: 5 });
  const first = land(sub, sure(150));
  console.log(`a 10 % token behind a 25 HP Substitute, hit for 150: ${row(first)}`);
  assert.deepEqual(shape(first), [[100, 0, false, false, 1, 1]]);
  const next = land(first[0].state, sure(150));
  console.log(`…and again: ${row(next)}`);
  assert.deepEqual(shape(next), [[1, 0, false, true, 0.1, 1], [0, 0, false, false, 0.9, 1]]);
}

// ---- A hit a Substitute takes deals its owner nothing, and the Substitute loses at most the HP it had (game-code.md §8)
{
  const sub = at({ sub: 25 });
  assert.deepEqual([20, 40].map(d => land(sub, sure(d))[0]).map(o => [o.dealt, o.subDealt]), [[0, 20], [0, 25]]);
  const broken = land(sub, sure(100, 2))[0];
  assert.deepEqual([broken.dealt, broken.subDealt], [50, 25], "the hit after the one that broke it is the owner's");
}

// `[hp, Sitrus held, Enigmas held, each other type's held, p]` per outcome.
const stash = outs => outs.map(o => [+o.state.hp.toFixed(6), o.state.sitrus, o.state.enigmas, o.state.others.join(), +o.p.toFixed(6)]);
const BITE = { steals: true };

// ---- A steal draws evenly over the berry types its target holds, whatever each stack, and takes one off the stack it draws (game-code.md §3)
{
  console.log("== a Bug Bite's steal");
  const st = at({ hp: 200, sitrus: 2, enigma: 1, lum: 1 });
  const drawn = land(st, sure(30), BITE);
  show("Sitrus x2, an Enigma and a Lum, hit for 30", drawn);
  assert.deepEqual(stash(drawn), [[170, 1, 1, "1", 0.333333], [170, 2, 0, "1", 0.333333], [170, 2, 1, "0", 0.333333]]);
  const [last] = land(stateOf(st.facts, 170, 0, { ...st, sitrus: 1, enigmas: 0, others: [0] }), sure(30), BITE);
  assert.deepEqual(stash([last]), [[140, 0, 0, "0", 1]], "one type left: it is sure to go");
  assert.deepEqual(stash(land(stateOf(st.facts, 140, 0, last.state), sure(30), BITE)), [[110, 0, 0, "0", 1]], "none left: nothing to take");
}

// ---- A steal holds on a knockout, and a miss steals nothing (game-code.md §3)
{
  const st = at({ sitrus: 1, lum: 1 });
  const felled = land(st, sure(150), BITE);
  show("a Sitrus and a Lum, hit for 150 of 100", felled);
  assert.deepEqual(stash(felled), [[0, 0, 0, "1", 0.5], [0, 1, 0, "0", 0.5]]);
  assert.deepEqual(land(st, sure(0), BITE), [{ state: st, p: 1, dealt: 0, subDealt: 0, hits: 0 }]);
}

// ---- A hit a Substitute takes steals nothing, and the strikes that reach its owner once it breaks each steal again (game-code.md §3, §8)
{
  const st = at({ sub: 25, sitrus: 2 });
  assert.deepEqual(stash(land(st, sure(20), BITE)), [[100, 2, 0, "", 1]], "it stands");
  assert.deepEqual(stash(land(st, sure(30), BITE)), [[100, 2, 0, "", 1]], "the strike that breaks it is still its own");
  const two = land(st, sure(80, 2), BITE);
  show("a 25 HP Substitute in front of Sitrus x2, two strikes of 40", two);
  assert.deepEqual(stash(two), [[60, 1, 0, "", 1]]);
  assert.deepEqual(stash(land(st, sure(120, 3), BITE)), [[20, 0, 0, "", 1]], "three strikes: two reach it");
  assert.deepEqual(stash(land(st, sure(20), { ...BITE, ignoresSub: true })), [[80, 1, 0, "", 1]], "an Infiltrator's reaches it at once");
}

// What each berry type heals our thief, as the fight plan tables it: the Sitrus a quarter of 200, the Lum nothing.
const HEALS = { steals: { [BerryType.SITRUS]: 50, [BerryType.LUM]: 0 } };
const thief = hp => stateOf({ maxHp: 200 }, hp);

// ---- A steal heals its user what the berry it drew is worth after the chip the use costs it, through Landing alone, up to its max HP (game-code.md §3, §8)
{
  console.log("== a steal's user");
  // From full 200, its own 30 of chip first, then the Sitrus's 50: back to 200, where a heal ahead of the chip would be
  // capped at 200 and leave it on 170.
  const user = thief(200);
  const chipped = { ...HEALS, userCost: { strike: 30 } };
  const outs = land(at({ hp: 200, sitrus: 1, lum: 1 }), sure(30), chipped, { user });
  console.log(`a Sitrus and a Lum, hit for 30 by a thief on 200 of 200 that pays 30 of chip: ${outs.map(o => `S${o.state.sitrus} O${o.state.others.join("")} → us ${o.user.hp} p${o.p}`).join(" · ")}`);
  assert.deepEqual(outs.map(o => [o.state.sitrus, o.state.others.join(), o.user.hp, o.p]), [[0, "1", 200, 0.5], [1, "0", 170, 0.5]]);
  const free = thief(170);
  assert.equal(land(at({ hp: 200, sitrus: 1, lum: 1 }), sure(30), HEALS, { user: free })[1].user, free, "a berry worth nothing, at no cost, leaves it as it was");
  const felled = land(at({ sitrus: 1 }), sure(150), chipped, { user: thief(100) });
  assert.deepEqual(felled.map(o => [o.state.hp, o.user.hp]), [[0, 120]], "a knockout's steal heals it too, after the felling strike's chip");
  const missed = land(at({ sitrus: 1 }), sure(0), chipped, { user });
  assert.deepEqual(missed, [{ state: missed[0].state, user, p: 1, dealt: 0, subDealt: 0, hits: 0 }], "a miss costs nothing and heals nothing");
}

// ---- A user its own chip downs eats nothing, though the berry is gone (game-code.md §3)
{
  for (const [hp, whole] of [[30.5, true], [30, false]]) {
    const outs = land(at({ hp: 200, sitrus: 1 }), sure(30), { ...HEALS, userCost: { strike: 30 } }, { whole, user: thief(hp) });
    assert.deepEqual(outs.map(o => [o.state.sitrus, +o.user.hp.toFixed(3)]), [[0, +(hp - 30).toFixed(3)]], `on ${hp} HP${whole ? ", whole" : ""}`);
  }
}

// A user of ours on `hp` of 200, `o` as `targetMon` takes it.
const ourUser = (hp, o = {}) => stateOf(factsOf({ hp: 200, player: true, ...o }), hp);
const userHp = outs => outs.map(o => +o.user.hp.toFixed(3));

// ---- A drain heals its user its share of what the use took off the target, up to its max HP, and only while it stands (game-code.md §18)
{
  console.log("== drain");
  const drain = { drain: 0.5 };
  const outs = land(at({ hp: 200 }), sure(80), drain, { user: ourUser(100) });
  console.log(`80 into 200, drained by a user on 100 of 200: ${outs.map(o => `dealt ${o.dealt} → us ${o.user.hp}`).join(" · ")}`);
  assert.deepEqual(userHp(outs), [140]);
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), drain, { user: ourUser(190) })), [200], "up to its max HP");
  assert.deepEqual(userHp(land(at({ hp: 60 }), sure(150), drain, { user: ourUser(100) })), [130], "on the 60 a knockout took");
  assert.deepEqual(userHp(land(at({ sturdy: true }), sure(150), drain, { user: ourUser(100) })), [149.5], "on the 99 Sturdy let through");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(0), drain, { user: ourUser(100) })), [100], "a miss drains nothing");
  for (const [hp, whole] of [[0.5, true], [0, false]]) {
    const user = ourUser(hp);
    assert.equal(land(at({ hp: 200 }), sure(80), drain, { whole, user })[0].user, user, `a user on ${hp} HP drains nothing${whole ? ", whole" : ""}`);
  }
  assert.ok(!("user" in land(at({ hp: 200 }), sure(80), drain)[0]), "without a user, KO pacing's, the record prices it");
}

// ---- A negative drain, into Liquid Ooze, takes its share off the user through its bars, with no luck to save it (game-code.md §18, §21)
{
  const ooze = { drain: -0.5 };
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), ooze, { user: ourUser(100) })), [60]);
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), ooze, { user: ourUser(30, { sturdy: true, band: 10, seed: true }) })), [0], "no Sturdy, Focus Band or Reviver Seed");
  const boss = stateOf(factsOf({ hp: 200, boss: 2 }), 120);
  const clamped = land(at({ hp: 200 }), sure(80), ooze, { user: boss })[0].user;
  assert.deepEqual([clamped.hp, clamped.bar], [100, 0], "a boss's bar stops it");
}

// ---- Shell Bell heals its holder an eighth a stack of what the use took, its target's Substitute's loss included, floored and at least 1, once the use is done (game-code.md §8)
{
  console.log("== Shell Bell");
  const rows = [["one Shell Bell, 80 dealt", sure(80), {}, {}], ["four", sure(80), {}, { bell: 4 }], ["3 dealt", sure(3), {}, {}],
    ["two hits of 40", sure(80, 2), {}, {}], ["Healing Charm x2", sure(80), {}, { charm: 2 }], ["into a 25 HP Substitute", sure(80), { sub: 25 }, {}]];
  const healed = rows.map(([what, use, target, user]) => {
    const outs = land(at({ hp: 200, ...target }), use, {}, { user: ourUser(100, { bell: 1, ...user }) });
    console.log(`${what}: ${outs.map(o => `dealt ${o.dealt} + ${o.subDealt} → us ${o.user.hp}`).join(" · ")}`);
    return userHp(outs)[0];
  });
  assert.deepEqual(healed, [110, 140, 101, 110, 112, 103]);
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(0), {}, { user: ourUser(100, { bell: 1 }) })), [100], "a miss heals nothing");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), {}, { user: ourUser(100, { bell: 1, healBlock: true }) })), [100], "Heal Block");
}

// ---- Drain reads only what reached the target, so a hit its Substitute takes drains nothing, where Shell Bell heals on the Substitute's loss (game-code.md §8)
{
  const outs = land(at({ hp: 200, sub: 25 }), sure(80), { drain: 0.5 }, { user: ourUser(100, { bell: 1 }) });
  assert.deepEqual(outs.map(o => [o.dealt, o.subDealt, o.user.hp]), [[0, 25, 103]]);
}

// ---- Shell Bell asks for full HP before the use's own heals, so a full-HP holder draining into Liquid Ooze heals nothing back (game-code.md §8, §18)
{
  const ooze = { drain: -0.5 };
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), ooze, { user: ourUser(200, { bell: 1 }) })), [160], "full HP: the Ooze alone");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), ooze, { user: ourUser(190, { bell: 1 }) })), [160], "190: the Ooze, then the bell's 10");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), { drain: 0.5 }, { user: ourUser(190, { bell: 1 }) })), [200], "the drain fills it, and the bell heals nothing more");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), ooze, { user: ourUser(30, { bell: 1 }) })), [0], "a holder the Ooze downs heals nothing");
}

// ---- A use's recoil takes its share of what the use dealt, its target's Substitute's loss included, floored and at least 1, once after its last strike and past its user's bars (game-code.md §8)
{
  console.log("== recoil");
  const recoil = r => ({ userCost: { recoil: r } });
  const rows = [["a quarter of 80", at({ hp: 200 }), sure(80)], ["of 3", at({ hp: 200 }), sure(3)], ["of three hits of 1", at({ hp: 200 }), sure(3, 3)],
    ["into a 25 HP Substitute", at({ hp: 200, sub: 25 }), sure(80)], ["of the 60 a knockout took", at({ hp: 60 }), sure(150)]];
  const left = rows.map(([what, target, use]) => {
    const outs = land(target, use, recoil(0.25), { user: ourUser(200) });
    console.log(`${what}: ${outs.map(o => `dealt ${o.dealt} + ${o.subDealt} → us ${o.user.hp}`).join(" · ")}`);
    return userHp(outs)[0];
  });
  assert.deepEqual(left, [180, 199, 199, 194, 185]);
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(0), recoil(0.25), { user: ourUser(200) })), [200], "a miss deals nothing to take it from");
  const boss = land(at({ hp: 200 }), sure(80), recoil(0.5), { user: stateOf(factsOf({ hp: 200, boss: 2 }), 120) })[0].user;
  assert.deepEqual([boss.hp, boss.bar], [80, 0], "past a boss's bar, which follows its HP");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), recoil(0.25), { user: ourUser(200, { bell: 1 }) })), [190], "a Shell Bell holder its recoil took off full HP heals on its bell");
  assert.ok(!("user" in land(at({ hp: 200 }), sure(80), recoil(0.25))[0]), "without a user, KO pacing's, the record prices it");
}

// ---- Rough Skin or Iron Barbs chips its attacker on each strike that reaches past a Substitute, the one that fells its holder too, and a boss attacker's bar stops it (game-code.md §8)
{
  console.log("== contact chip");
  const barbs = { userCost: { strike: 25 } };
  const rows = [["two hits", at({ hp: 200 }), sure(80, 2)], ["a knockout", at({ hp: 60 }), sure(150)],
    ["two hits, the first into a 25 HP Substitute", at({ hp: 200, sub: 25 }), sure(60, 2)], ["into a Disguise", at({ hp: 200, form: "disguise" }), sure(80)]];
  const left = rows.map(([what, target, use]) => {
    const outs = land(target, use, barbs, { user: ourUser(200) });
    console.log(`${what}: ${outs.map(o => `×${o.hits} → us ${o.user.hp}`).join(" · ")}`);
    return userHp(outs)[0];
  });
  assert.deepEqual(left, [150, 175, 175, 175]);
  const boss = land(at({ hp: 200 }), sure(80, 2), barbs, { user: stateOf(factsOf({ hp: 200, boss: 2 }), 120) })[0].user;
  assert.deepEqual([boss.hp, boss.bar], [75, 0], "the first chip stops at the bar, the second lands below it");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), barbs, { user: ourUser(20, { band: 10, seed: true }) })), [0], "no Focus Band or Reviver Seed outlives it");
}

// ---- A user its own recoil fells heals nothing back, and no Sturdy, Focus Band or Reviver Seed saves it (game-code.md §8, §18)
{
  const hit = { drain: 0.5, userCost: { recoil: 0.25 } };
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), hit, { user: ourUser(20, { bell: 1 }) })), [0], "its 20 of recoil fells it ahead of its drain and its Shell Bell");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), hit, { whole: true, user: ourUser(20.5) })), [0.5], "under `whole` the half HP it leaves is down");
  const lucky = stateOf(factsOf({ hp: 80, player: true, sturdy: true, band: 10, seed: true }), 80);
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(200), { userCost: { recoil: 0.5 } }, { user: lucky })), [0]);
}

// ---- A miss costs its user its crash, and a use that lands what it costs beside recoil and contact chip, Steel Beam's half or Chloroblast's (game-code.md §8)
{
  const crash = { userCost: { missed: 100 } }, beam = { userCost: { landed: 100 } };
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(0), crash, { user: ourUser(200) })), [100], "a miss crashes");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), crash, { user: ourUser(200) })), [200], "a use that lands doesn't");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(80), beam, { user: ourUser(200) })), [100], "a landed Steel Beam costs its half");
  assert.deepEqual(userHp(land(at({ hp: 200 }), sure(0), beam, { user: ourUser(200) })), [200], "and a miss costs only `missed`");
  assert.deepEqual(userHp(land(stateOf(factsOf({ hp: 200 }), 0), sure(0), crash, { user: ourUser(200) })), [200], "a target already down meets no use");
  const boss = land(at({ hp: 200 }), sure(0), crash, { user: stateOf(factsOf({ hp: 200, boss: 2 }), 120) })[0].user;
  assert.deepEqual([boss.hp, boss.bar], [100, 0], "a boss's bar stops a crash");
}

// The states the invariants sweep, and the uses and hits they take.
const STATES = [at(), at({ sturdy: true }), at({ band: 2 }), at({ token: 5 }), at({ hp: 100, maxHp: 200, seed: true }), at({ hp: 300, boss: 3, token: 5 }),
  at({ hp: 300, boss: 3, sturdy: true, band: 1, token: 10, seed: true }), at({ hp: 10, band: 1 }), at({ hp: 100, finalBoss: true, band: 1 }),
  at({ cut: "multiscale", sturdy: true, band: 1 }), at({ hp: 300, boss: 3, cut: "shadow shield", token: 5 }),
  at({ form: "disguise" }), at({ hp: 10, maxHp: 100, form: "disguise", band: 1, seed: true }), at({ hp: 300, boss: 3, form: "disguise", token: 5 }),
  at({ hp: 200, sitrus: 2, enigma: 1, pouch: 1 }), at({ hp: 200, boss: 2, sitrus: 1, enigma: 2, seed: true }), at({ hp: 200, form: "disguise", enigma: 1 }),
  at({ sub: 25, sturdy: true, token: 5 }), at({ hp: 300, boss: 3, sub: 75, band: 1, seed: true }), at({ sub: 25, cut: "multiscale" }),
  at({ sub: 25, form: "disguise" }), at({ hp: 200, sub: 50, enigma: 1 }), at({ hp: 200, sitrus: 2, enigma: 1, lum: 1 }), at({ sub: 25, sitrus: 1, lum: 2, seed: true })];
const USES = [sure(0), sure(50), sure(99.5), sure(100), sure(150), sure(300, 2), sure(450, 3), { d: 151, n: 2.4 }, { d: 120, n: 1, se: 0.4 }, { d: 60, n: 2, se: 1 }];
const HITS = [{}, { ignoresSturdy: true }, { ignoresDisguise: true }, { ohko: true }, { factor: bar => 1 + bar / 2 }, { cut: "in" }, { cut: "never" }, { ignoresAbility: true },
  { ignoresSub: true }, { e: 2 }, { steals: true }, { steals: true, ignoresSub: true }, HEALS, { drain: 0.5 }, { drain: -0.75 },
  { userCost: { strike: 20, recoil: 0.25, landed: 10, missed: 30 } }, { ...HEALS, drain: 0.5, userCost: { strike: 30 } }];
const ENDS = [{}, { before: -30, after: 10 }, { before: 25, after: -60 }, { after: -500, eats: false }, { before: NaN, after: 40 }];
const sweep = fn => {
  for (const st of STATES) for (const use of USES) for (const hit of HITS) for (const whole of [false, true]) fn(st, use, hit, whole);
};

// ---- Every outcome's chance is above 0 and they sum to 1, and no input is changed, its user's included (#1027, #1029, #1030, #1036)
{
  const users = [thief(180), ourUser(180, { bell: 2 })];
  sweep((st, use, hit, whole) => {
    for (const opts of [{ whole }, ...users.map(user => ({ whole, user }))]) {
      const before = JSON.stringify([st, use, hit, users]);
      const outs = land(st, use, hit, opts);
      assert.ok(outs.every(o => o.p > 0));
      assert.ok(Math.abs(outs.reduce((t, o) => t + o.p, 0) - 1) < 1e-12);
      assert.equal(JSON.stringify([st, use, hit, users]), before);
      const user = opts.user;
      assert.ok(outs.every(o => ("user" in o) === !!user && (!user || ((hit.drain < 0 || hit.userCost || o.user.hp >= user.hp) && o.user.hp >= 0 && o.user.hp <= 200))));
    }
  });
}

// ---- Every turn end's chances are above 0 and sum to 1, it changes no input, and what stands carries no mark of the turn (#1028)
{
  sweep((st, use, hit, whole) => {
    for (const { state } of land(st, use, hit, { whole })) {
      for (const end of ENDS) {
        const before = JSON.stringify([state, end]);
        const outs = landTurnEnd(state, { ...end, whole });
        assert.ok(outs.every(o => o.p > 0));
        assert.ok(Math.abs(outs.reduce((t, o) => t + o.p, 0) - 1) < 1e-12);
        assert.equal(JSON.stringify([state, end]), before);
        const up = s => (whole ? s.hp >= 1 : s.hp > 0);
        if (up(state)) assert.ok(outs.every(o => !o.state.fed));
        else assert.deepEqual(outs, [{ state, p: 1 }]);
      }
    }
  });
}

// ---- A state already down and a miss come back as they were, with nothing dealt (#1027)
{
  const st = at();
  for (const use of [sure(0), sure(-5), sure(NaN), sure(Infinity), null]) assert.deepEqual(land(st, use), [{ state: st, p: 1, dealt: 0, subDealt: 0, hits: 0 }]);
  for (const [hp, whole] of [[0, false], [0, true], [0.5, true]]) {
    const down = stateOf(st.facts, hp);
    assert.deepEqual(land(down, sure(50), {}, { whole }), [{ state: down, p: 1, dealt: 0, subDealt: 0, hits: 0 }]);
  }
  assert.deepEqual(land(stateOf({ maxHp: 100 }, 100), sure(150)).map(o => [o.state.hp, o.p]), [[0, 1]], "a facts record holding only maxHp is a plain HP pool");
}

// ---- Two states with equal landing keys differ in HP alone, and a Sturdy holder's full HP and a standing Substitute are luck (#1027, #1033)
{
  const fields = s => Object.keys(s).filter(k => k !== "hp" && k !== "facts");
  const firsts = new Map();
  sweep((st, use, hit, whole) => {
    for (const { state: b } of land(st, use, hit, { whole })) {
      const k = `${STATES.indexOf(st)}#${landingKey(b)}`;
      if (!firsts.has(k)) firsts.set(k, b);
      const a = firsts.get(k);
      assert.deepEqual(fields(b).map(x => b[x]), fields(a).map(x => a[x]));
    }
  });
  assert.ok(firsts.size > STATES.length);
  const sturdy = factsOf({ sturdy: true });
  assert.notEqual(luckKey(stateOf(sturdy, 100)), luckKey(stateOf(sturdy, 99)));
  assert.equal(luckKey(stateOf(factsOf(), 100)), luckKey(stateOf(factsOf(), 99)));
  const sub = at({ sub: 25 });
  assert.notEqual(luckKey(sub), luckKey(land(sub, sure(30))[0].state), "broken");
  assert.equal(luckKey(sub), luckKey(land(sub, sure(10))[0].state), "still standing, at any HP");
}

// ---- A Multiscale or Shadow Shield holder's full HP is its luck (#1032)
{
  for (const cut of ["multiscale", "shadow shield"]) {
    const f = factsOf({ cut });
    assert.notEqual(luckKey(stateOf(f, 100)), luckKey(stateOf(f, 99)), cut);
  }
}

// The discrete part, each field at a value a fresh state never has.
const fresh = stateOf(factsOf());
const DISCRETE = Object.keys(fresh).filter(k => !["hp", "bar", "facts"].includes(k));
const spent = Object.fromEntries(DISCRETE.map(k => [k, typeof fresh[k] === "boolean" ? !fresh[k] : Array.isArray(fresh[k]) ? [...fresh[k], 1] : fresh[k] + 1]));

// ---- stateOf carries every field of the discrete part from `from`, and never its HP or bar (#1027)
{
  console.log(`== the discrete part: ${DISCRETE.join(", ")}`);
  const s = stateOf(factsOf(), 40, 0, { ...spent, hp: 7, bar: 3 });
  assert.deepEqual([s.hp, s.bar], [40, 0]);
  for (const k of DISCRETE) assert.equal(s[k], spent[k], k);
}

// ---- Two states sameLanding calls the same have one landing key, and a field of the discrete part apart, a Sturdy holder's full HP or facts of their own make them two (#1027)
{
  const { sameLanding } = D;
  const o = { sturdy: true, form: "disguise", sub: 25, sitrus: 1, enigma: 1, lum: 1 };
  const f = factsOf(o), base = stateOf(f);
  const flip = v => (typeof v === "boolean" ? !v : Array.isArray(v) ? [...v, 1] : v + 1);
  for (const k of DISCRETE) assert.equal(sameLanding(base, stateOf(f, base.hp, base.bar, { ...base, [k]: flip(base[k]) })), false, k);
  assert.equal(sameLanding(base, stateOf(f, base.hp - 1, base.bar, base)), false);
  assert.equal(sameLanding(base, stateOf(factsOf(o))), false);
  const outs = [];
  sweep((st, use, hit, whole) => { for (const { state } of land(st, use, hit, { whole })) outs.push(state); });
  for (let i = 0; i < outs.length; i++) {
    for (let j = i; j < Math.min(outs.length, i + 40); j++) if (sameLanding(outs[i], outs[j])) assert.equal(landingKey(outs[i]), landingKey(outs[j]));
  }
}

// ---- Every field of the discrete part survives a missed use from `after1` to the state `start` reopens, but the turn's mark, which its turn end clears (#1027, #1028)
{
  const rec = { facts: factsOf() };
  const miss = [{ d: 0, p: 1, n: 0 }];
  const once = koCurve(rec, miss, { start: [{ hp: 60, bar: 0, ...spent, p: 1 }] });
  const twice = koCurve(rec, miss, { start: once.after1 });
  for (const [what, after1] of [["after1", once.after1], ["reopened", twice.after1]]) {
    assert.equal(after1.length, 1, what);
    for (const k of DISCRETE) assert.equal(after1[0][k], k === "fed" ? false : spent[k], `${what}: ${k}`);
  }
}

// One live fake turn feeds both engines: the KO curve on one side, the real tables and the fight plan on the other.
// `use`: the attacker's one move's spread, `hit` the race facts its record sets past these; the other side deals nothing.
const ATTACKER = [400, 100, 100, 100, 100, 200];
const hitRecord = (use, def, hit) => {
  const mean = use.reduce((t, x) => t + x.d * x.p, 0), max = Math.max(...use.map(x => x.d / (x.n || 1)));
  const n = Math.max(...use.map(x => x.n ?? 1));
  return { name: "Hit", type: "Normal", cat: "physical", e: 1, ignoresSturdy: false, ignoresAbility: false, cut: null, priority: 0, spread: false, acc: 1, dist: [{ n, p: 1 }],
    perHit: Array(n).fill({ max, min: max }), expected: Math.min(mean, def.hp), uncapped: mean, max: Math.min(max * n, def.hp), pKo: 0,
    use, traits: { ...TRAITS }, costs: [], notes: [], live: true, ...hit };
};
// `ours`: the foe hits us, and these are our luck; else we hit the foe, whose luck is `foe`. `pouch`: the foe side's Berry
// Pouch stacks. KO pacing eats the Sitrus Berry with no steals.
const race = ({ use, foe = {}, ours = null, token = 0, pouch = 0, hit = {} }) => {
  const hitter = (name, player) => mon(name, 50, ["Normal"], ATTACKER, [["Hit", "Normal", 80, "P"]], true, undefined, { isPlayer: () => player, hasTrainer: () => !player });
  const me = ours ? targetMon({ name: "us", player: true, ...ours }) : hitter("us", true);
  const target = ours ? hitter("foe", false) : targetMon({ name: "foe", trainer: true, ...foe });
  const [atk, def] = ours ? [target, me] : [me, target];
  target.getOpponents = () => [me];
  const turn = fakeTurn({ live: true, party: [me], foes: [target], enemyModifiers: [...tokens(token), ...pouches(pouch)],
    trainer: { getName: () => "Ace", config: { isBoss: false }, isDouble: () => false },
    outcome: (a, d) => (a === atk ? hitRecord(use, d, hit) : null),
    moves: e => (e === atk ? [{ name: "Hit", type: "Normal", p: 1, score: 10, targets: [0] }] : []) });
  const T = tpTables(turn, [me], [target], false);
  const by = koCurve(turn.mon(def), turn.outcomes(atk, def)[0], { sitrus: 0 }).by;
  const plan = tpFight(T, fightState({ oh: [me.hp], fh: [target.hp], fs: [T.foeState[0].bar] }), 0, 0, "free");
  return { by, plan: ours ? plan.lossBy : plan.winBy };
};
const sureUse = (d, n = 1) => [{ d, p: 1, n }];
const rolls = (lo, hi) => Array.from({ length: 16 }, (_, r) => ({ d: lo + (hi - lo) * r / 15, p: 1 / 16, n: 1 }));
const curve = by => by.slice(0, 4).map(x => x.toFixed(3)).join(" ");
// Gotcha: the fight plan drops each branch under 1e-6 a turn, so a row whose luck splits a fixed hit that fine agrees
// only to what the dropped branches add up to, ten of them at most.
const EXACT = 1e-9, PRUNED = 10 * 1e-6;

// ---- KO pacing lands each use on a standing Substitute first, and turn-end chip on its owner (game-code.md §8, §21)
{
  const rec = { facts: factsOf({ sub: 25 }) };
  assert.deepEqual(koCurve(rec, sureUse(60)).by.slice(0, 3), [0, 0, 1], "60 breaks it, then 40 are left");
  const chip = koCurve(rec, [{ d: 0, p: 1, n: 0 }], { turnEnd: -10 }).after1;
  assert.deepEqual(chip.map(x => [x.hp, x.sub]), [[90, 25]]);
}

// ---- A standing Substitute's HP spread is squeezed as its owner's is, so a curve of weak rolled hits into it stays cheap (#1033)
{
  const rec = { facts: factsOf({ hp: 400, sub: 100 }) };
  const t0 = performance.now();
  koCurve(rec, rolls(15, 25), { turnEnd: -10 });
  const ms = performance.now() - t0;
  assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
}

// ---- KO pacing's Bug Bite draws per branch, so a Sitrus x2 holder beside a Lum holds no Sitrus at turn 2's berries (game-code.md §3, #915)
{
  // 98 of 200, 30 a use: 68 eats one (118), and turn 2's draw takes the last Sitrus where the Lum went first, and the Lum
  // where the Sitrus did; 88 eats nothing, 58, 28, down on use 5.
  const rec = { facts: factsOf({ hp: 98, maxHp: 200, sitrus: 2, lum: 1 }) };
  const bite = { use: sureUse(30), steals: true };
  const once = koCurve(rec, bite, { sitrus: 0 });
  const twice = koCurve(rec, bite, { sitrus: 0, start: once.after1 });
  console.log(`== #915: Sitrus x2 and a Lum from 98 of 200, one sure Bug Bite of 30 a turn\nby ${curve(once.by)} · after turn 1 `
    + `${once.after1.map(x => `${x.hp} S${x.sitrus} O${x.others.join("")} p${x.p}`).join(", ")} · after turn 2 ${twice.after1.map(x => `${x.hp} S${x.sitrus}`).join(", ")}`);
  assert.deepEqual(once.by.slice(0, 5), [0, 0, 0, 0, 1]);
  assert.deepEqual([...new Set(twice.after1.map(x => `${x.hp} S${x.sitrus}`))], ["88 S0"]);
}

// ---- A depth-2 curve seeded from an unnerved one has the earlier steal taken off already (game-code.md §3, #915)
{
  // 200 of 200 holding one Sitrus, 60 a use. Unnerved, it eats nothing, but the steal still lands; the next curve's 140 →
  // 80 has no Sitrus to eat (20, down on use 3), where a kept one would heal 80 to 130 and last a use more.
  const rec = { facts: factsOf({ hp: 200, sitrus: 1 }) };
  const unnerved = koCurve(rec, { use: sureUse(60), steals: true }, { sitrus: null });
  const next = koCurve(rec, sureUse(60), { sitrus: 0, start: unnerved.after1 });
  assert.deepEqual(unnerved.after1.map(x => [x.hp, x.sitrus]), [[140, 0]]);
  assert.deepEqual(next.by.slice(0, 4), [0, 0, 1, 1]);
}

// ---- The fight plan's chance the foe is down by each turn is KO pacing's, on fixed damage up to the branches it drops, and within 0.05 where the rolls vary (#1027)
{
  console.log("== KO pacing and the fight plan, on the foe");
  const ROWS = [
    ["plain", { use: sureUse(60) }, EXACT],
    ["plain, rolled", { use: rolls(45, 60) }, 0.05],
    ["Sturdy", { use: sureUse(150), foe: { sturdy: true } }, EXACT],
    ["Focus Band", { use: sureUse(150), foe: { band: 1 } }, PRUNED],
    ["endure token", { use: sureUse(150), token: 5 }, EXACT],
    ["Reviver Seed", { use: sureUse(150), foe: { seed: true } }, EXACT],
    ["two bars on a trainer", { use: sureUse(150), foe: { hp: 200, boss: 2 } }, EXACT],
    ["two hits into Sturdy", { use: sureUse(300, 2), foe: { sturdy: true } }, EXACT],
    ["Multiscale", { use: sureUse(150), foe: { cut: "multiscale" } }, EXACT],
    ["two hits into Shadow Shield", { use: sureUse(150, 2), foe: { cut: "shadow shield" } }, EXACT],
    ["Multiscale, the record asked at full HP", { use: sureUse(60), foe: { cut: "multiscale" }, hit: { cut: "in" } }, EXACT],
    ["Disguise", { use: sureUse(150), foe: { form: "disguise" } }, EXACT],
    ["two hits into Disguise", { use: sureUse(300, 2), foe: { form: "disguise" } }, EXACT],
    // By turn 2 its branches stand in five classes of luck, one past the branches the fight plan keeps for each.
    ["every luck at once, half the uses missing", { use: [{ d: 0, p: 0.5, n: 0 }, { d: 150, p: 0.5, n: 1 }], foe: { sturdy: true, seed: true, band: 1 }, token: 5 }, PRUNED],
    ["Substitute", { use: sureUse(60), foe: { sub: 25 } }, EXACT],
    ["Substitute, rolled weak enough to leave it standing", { use: rolls(10, 30), foe: { hp: 40, sub: 20 } }, 0.05],
    ["two hits, through a Substitute into Sturdy", { use: sureUse(300, 2), foe: { sub: 25, sturdy: true } }, EXACT],
    ["a sound move past a Substitute", { use: sureUse(60), foe: { sub: 25 }, hit: { ignoresSub: true } }, EXACT],
    ["Sitrus Berry at 49.5 %", { use: sureUse(101), foe: { hp: 200, sitrus: 1 } }, EXACT],
    ["Sitrus Berry at 49.0 %", { use: sureUse(102), foe: { hp: 200, sitrus: 1 } }, EXACT],
    ["Enigma Berry", { use: sureUse(70), hit: { e: 2 }, foe: { hp: 200, enigma: 1 } }, EXACT],
    ["Berry Pouch on a Sitrus Berry", { use: sureUse(70), foe: { hp: 200, sitrus: 1 }, pouch: 1 }, EXACT],
    ["Bug Bite into a Sitrus x2 and a Lum, from 98 of 200", { use: sureUse(30), foe: { hp: 98, maxHp: 200, sitrus: 2, lum: 1 }, hit: { steals: true } }, EXACT],
    ["our recoil and contact chip, which land on us alone", { use: sureUse(60), hit: { userCost: { strike: 10, recoil: 0.25, landed: 0, missed: 0 } } }, EXACT],
  ];
  for (const [what, setup, tol] of ROWS) {
    const { by, plan } = race(setup);
    console.log(`${what}: KO pacing ${curve(by)} · fight plan ${curve(plan)}`);
    for (let t = 0; t < 9; t++) assert.ok(Math.abs(by[t] - plan[t]) < tol);
  }
}

// ---- The fight plan's chance we are down by each turn is KO pacing's on us, the foe's multi-hit use landing hit by hit (#1027)
{
  console.log("== KO pacing and the fight plan, on us");
  const ROWS = [
    ["plain", { use: sureUse(60), ours: {} }, EXACT],
    ["plain, rolled", { use: rolls(45, 60), ours: {} }, 0.05],
    ["Sturdy", { use: sureUse(150), ours: { sturdy: true } }, EXACT],
    ["Focus Band", { use: sureUse(150), ours: { band: 1 } }, PRUNED],
    ["Reviver Seed", { use: sureUse(150), ours: { seed: true } }, EXACT],
    ["the foe's two hits into Sturdy", { use: sureUse(300, 2), ours: { sturdy: true } }, EXACT],
    ["Multiscale", { use: sureUse(150), ours: { cut: "multiscale" } }, EXACT],
    ["Multiscale, the record asked at full HP", { use: sureUse(60), ours: { cut: "multiscale" }, hit: { cut: "in" } }, EXACT],
    ["Disguise", { use: sureUse(150), ours: { form: "disguise" } }, EXACT],
    ["Substitute", { use: sureUse(60), ours: { sub: 25 } }, EXACT],
    ["the foe's sound move past our Substitute", { use: sureUse(60), ours: { sub: 25 }, hit: { ignoresSub: true } }, EXACT],
    ["the foe's recoil and contact chip, which land on it alone", { use: sureUse(60), ours: {}, hit: { userCost: { strike: 10, recoil: 0.25, landed: 0, missed: 0 } } }, EXACT],
  ];
  for (const [what, setup, tol] of ROWS) {
    const { by, plan } = race(setup);
    console.log(`${what}: KO pacing ${curve(by)} · fight plan ${curve(plan)}`);
    for (let t = 0; t < 9; t++) assert.ok(Math.abs(by[t] - plan[t]) < tol);
  }
}

// ---- A 100 HP foe hit for 150 takes as many turns in both engines with Sturdy, a Reviver Seed, a Focus Band or the endure token (#1027)
{
  const probe = [["sturdy", { foe: { sturdy: true } }], ["seed", { foe: { seed: true } }], ["band", { foe: { band: 1 } }], ["token", { token: 5 }]]
    .map(([what, setup]) => ({ what, ...race({ use: sureUse(150), ...setup }) }));
  const line = k => probe.map(x => `${x.what} ${koTurns(x[k]).toFixed(2)}`).join(" · ");
  console.log(`== the probe\nKO pacing:  ${line("by")}\nfight plan: ${line("plan")}`);
  assert.equal(line("plan"), line("by"));
  assert.equal(line("by"), "sturdy 2.00 · seed 2.00 · band 1.11 · token 1.10");
}

console.log("ok");
