import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { mon, TRAITS } from "./fake-mon.mjs";
import { fakeTurn } from "./fake-turn.mjs";
import { fightState } from "./fake-fight.mjs";

mountHud({ scene: { currentBattle: { waveIndex: 10, turn: 1 }, getField: () => [], getPlayerParty: () => [], getEnemyParty: () => [] } });
const D = globalThis.__hud["10-damage"];
const { stateOf, land, luckKey, landingKey, koCurve, koTurns } = D;
const { tpTables, tpFight } = globalThis.__hud["35-team-plan"];

const held = (name, n = 1) => new ({ [name]: class { getStackCount() { return n; } } })[name]();
const tokens = n => (n ? [Object.assign(held("EnemyEndureChanceModifier", n), { chance: 2 })] : []);
const BUST = { disguise: 0.125, iceFace: 0 };
class FormBlockDamageAbAttr { constructor(recoil) { Object.assign(this, { formIndex: 0, recoil }); } }
// `token` is the wave's endure chance in stacks of 2 %; `form`: "disguise" or "iceFace", held intact; `moves` as
// fake-mon.mjs's `mon` takes them.
const targetMon = ({ name = "target", hp = 100, maxHp = hp, boss = 0, idx, sturdy = false, band = 0, seed = false, form = null, player = false, trainer = false, moves = [] } = {}) =>
  mon(name, 50, ["Normal"], [maxHp, 100, 100, 100, 100, 100], moves, true, hp, {
    isPlayer: () => player, bossSegments: boss, bossSegmentIndex: idx ?? Math.max(0, boss - 1), formIndex: 0, waveData: {},
    hasAbilityWithAttr: a => (sturdy && a === "PreDefendFullHpEndureAbAttr") || (!!form && a === "FormBlockDamageAbAttr"),
    getAbility: () => ({ name: "x", getAttrs: n => (form && n === "FormBlockDamageAbAttr" ? [new FormBlockDamageAbAttr(BUST[form])] : []) }),
    ...(trainer ? { hasTrainer: () => true } : {}),
    getHeldItems: () => [...(band ? [held("SurviveDamageModifier", band)] : []), ...(seed ? [held("PokemonInstantReviveModifier")] : [])],
  });
// A target's facts as the fakes read them (fake-turn.mjs).
const factsOf = (o = {}) => D.targetFacts({ enemyModifiers: tokens(o.token ?? 0), finalBoss: !!o.finalBoss }, targetMon(o));
const at = (o = {}) => stateOf(factsOf(o));
const sure = (d, n = 1) => ({ d, n });
// `[hp, bar, p, dealt, hits]` per outcome, with `R` for a spent Reviver Seed, `T` for a spent token and `B` for a busted
// Disguise or Ice Face.
const row = outs => outs.map(o => `${+o.state.hp.toFixed(3)}/${o.state.bar}${o.state.revived ? "R" : ""}${o.state.tok ? "T" : ""}${o.state.busted ? "B" : ""} p${+o.p.toFixed(4)} dealt ${+o.dealt.toFixed(3)} ×${o.hits}`).join(" · ");
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
  assert.deepEqual(land(mimikyu, sure(0)), [{ state: mimikyu, p: 1, dealt: 0, hits: 0 }]);
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

// The states the invariants sweep, and the uses and hits they take.
const STATES = [at(), at({ sturdy: true }), at({ band: 2 }), at({ token: 5 }), at({ hp: 100, maxHp: 200, seed: true }), at({ hp: 300, boss: 3, token: 5 }),
  at({ hp: 300, boss: 3, sturdy: true, band: 1, token: 10, seed: true }), at({ hp: 10, band: 1 }), at({ hp: 100, finalBoss: true, band: 1 }),
  at({ form: "disguise" }), at({ hp: 10, maxHp: 100, form: "disguise", band: 1, seed: true }), at({ hp: 300, boss: 3, form: "disguise", token: 5 })];
const USES = [sure(0), sure(50), sure(99.5), sure(100), sure(150), sure(300, 2), sure(450, 3), { d: 151, n: 2.4 }];
const HITS = [{}, { ignoresSturdy: true }, { ignoresDisguise: true }, { ohko: true }, { factor: bar => 1 + bar / 2 }];
const sweep = fn => {
  for (const st of STATES) for (const use of USES) for (const hit of HITS) for (const whole of [false, true]) fn(st, use, hit, whole);
};

// ---- Every outcome's chance is above 0 and they sum to 1, and no input is changed (#1027)
{
  sweep((st, use, hit, whole) => {
    const before = JSON.stringify([st, use, hit]);
    const outs = land(st, use, hit, { whole });
    assert.ok(outs.every(o => o.p > 0));
    assert.ok(Math.abs(outs.reduce((t, o) => t + o.p, 0) - 1) < 1e-12);
    assert.equal(JSON.stringify([st, use, hit]), before);
  });
}

// ---- A state already down and a miss come back as they were, with nothing dealt (#1027)
{
  const st = at();
  for (const use of [sure(0), sure(-5), sure(NaN), sure(Infinity), null]) assert.deepEqual(land(st, use), [{ state: st, p: 1, dealt: 0, hits: 0 }]);
  for (const [hp, whole] of [[0, false], [0, true], [0.5, true]]) {
    const down = stateOf(st.facts, hp);
    assert.deepEqual(land(down, sure(50), {}, { whole }), [{ state: down, p: 1, dealt: 0, hits: 0 }]);
  }
  assert.deepEqual(land(stateOf({ maxHp: 100 }, 100), sure(150)).map(o => [o.state.hp, o.p]), [[0, 1]], "a facts record holding only maxHp is a plain HP pool");
}

// ---- Two states with equal landing keys differ in HP alone, and a Sturdy holder's full HP is its luck (#1027)
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
}

// The discrete part, each field at a value a fresh state never has.
const fresh = stateOf(factsOf());
const DISCRETE = Object.keys(fresh).filter(k => !["hp", "bar", "facts"].includes(k));
const spent = Object.fromEntries(DISCRETE.map(k => [k, typeof fresh[k] === "boolean" ? !fresh[k] : fresh[k] + 1]));

// ---- stateOf carries every field of the discrete part from `from`, and never its HP or bar (#1027)
{
  console.log(`== the discrete part: ${DISCRETE.join(", ")}`);
  const s = stateOf(factsOf(), 40, 0, { ...spent, hp: 7, bar: 3 });
  assert.deepEqual([s.hp, s.bar], [40, 0]);
  for (const k of DISCRETE) assert.equal(s[k], spent[k], k);
}

// ---- Every field of the discrete part survives a missed use from `after1` to the state `start` reopens (#1027)
{
  const rec = { facts: factsOf() };
  const miss = [{ d: 0, p: 1, n: 0 }];
  const once = koCurve(rec, miss, { start: [{ hp: 60, bar: 0, ...spent, p: 1 }] });
  const twice = koCurve(rec, miss, { start: once.after1 });
  for (const [what, after1] of [["after1", once.after1], ["reopened", twice.after1]]) {
    assert.equal(after1.length, 1, what);
    for (const k of DISCRETE) assert.equal(after1[0][k], spent[k], `${what}: ${k}`);
  }
}

// One live fake turn feeds both engines: the KO curve on one side, the real tables and the fight plan on the other.
// `use`: the attacker's one move's spread; the other side deals nothing.
const ATTACKER = [400, 100, 100, 100, 100, 200];
const hitRecord = (use, def) => {
  const mean = use.reduce((t, x) => t + x.d * x.p, 0), max = Math.max(...use.map(x => x.d / (x.n || 1)));
  const n = Math.max(...use.map(x => x.n ?? 1));
  return { name: "Hit", type: "Normal", cat: "physical", e: 1, ignoresSturdy: false, priority: 0, spread: false, acc: 1, dist: [{ n, p: 1 }],
    perHit: Array(n).fill({ max, min: max }), expected: Math.min(mean, def.hp), uncapped: mean, max: Math.min(max * n, def.hp), pKo: 0,
    use, traits: { ...TRAITS }, costs: [], notes: [], live: true };
};
// `ours`: the foe hits us, and these are our luck; else we hit the foe, whose luck is `foe`.
const race = ({ use, foe = {}, ours = null, token = 0 }) => {
  const hitter = (name, player) => mon(name, 50, ["Normal"], ATTACKER, [["Hit", "Normal", 80, "P"]], true, undefined, { isPlayer: () => player, hasTrainer: () => !player });
  const me = ours ? targetMon({ name: "us", player: true, ...ours }) : hitter("us", true);
  const target = ours ? hitter("foe", false) : targetMon({ name: "foe", trainer: true, ...foe });
  const [atk, def] = ours ? [target, me] : [me, target];
  target.getOpponents = () => [me];
  const turn = fakeTurn({ live: true, party: [me], foes: [target], enemyModifiers: tokens(token),
    trainer: { getName: () => "Ace", config: { isBoss: false }, isDouble: () => false },
    outcome: (a, d) => (a === atk ? hitRecord(use, d) : null),
    moves: e => (e === atk ? [{ name: "Hit", type: "Normal", p: 1, score: 10, targets: [0] }] : []) });
  const T = tpTables(turn, [me], [target], false);
  const by = koCurve(turn.mon(def), turn.outcomes(atk, def)[0]).by;
  const plan = tpFight(T, fightState({ oh: [me.hp], ob: [0], fh: [target.hp], fs: [T.foeState[0].bar], fb: [0] }), 0, 0, "free");
  return { by, plan: ours ? plan.lossBy : plan.winBy };
};
const sureUse = (d, n = 1) => [{ d, p: 1, n }];
const rolls = (lo, hi) => Array.from({ length: 16 }, (_, r) => ({ d: lo + (hi - lo) * r / 15, p: 1 / 16, n: 1 }));
const curve = by => by.slice(0, 4).map(x => x.toFixed(3)).join(" ");
// The fight plan drops each branch under 1e-6 a turn, so on fixed damage the two agree only to the few that adds up to.
const EXACT = 1e-5;

// ---- The fight plan's chance the foe is down by each turn is KO pacing's, on fixed damage up to the branches it drops, and within 0.05 where the rolls vary (#1027)
{
  console.log("== KO pacing and the fight plan, on the foe");
  const ROWS = [
    ["plain", { use: sureUse(60) }, EXACT],
    ["plain, rolled", { use: rolls(45, 60) }, 0.05],
    ["Sturdy", { use: sureUse(150), foe: { sturdy: true } }, EXACT],
    ["Focus Band", { use: sureUse(150), foe: { band: 1 } }, EXACT],
    ["endure token", { use: sureUse(150), token: 5 }, EXACT],
    ["Reviver Seed", { use: sureUse(150), foe: { seed: true } }, EXACT],
    ["two bars on a trainer", { use: sureUse(150), foe: { hp: 200, boss: 2 } }, EXACT],
    ["two hits into Sturdy", { use: sureUse(300, 2), foe: { sturdy: true } }, EXACT],
    ["Disguise", { use: sureUse(150), foe: { form: "disguise" } }, EXACT],
    ["two hits into Disguise", { use: sureUse(300, 2), foe: { form: "disguise" } }, EXACT],
    // By turn 2 its branches stand in five classes of luck, one past the branches the fight plan keeps for each.
    ["every luck at once, half the uses missing", { use: [{ d: 0, p: 0.5, n: 0 }, { d: 150, p: 0.5, n: 1 }], foe: { sturdy: true, seed: true, band: 1 }, token: 5 }, EXACT],
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
    ["Focus Band", { use: sureUse(150), ours: { band: 1 } }, EXACT],
    ["Reviver Seed", { use: sureUse(150), ours: { seed: true } }, EXACT],
    ["the foe's two hits into Sturdy", { use: sureUse(300, 2), ours: { sturdy: true } }, EXACT],
    ["Disguise", { use: sureUse(150), ours: { form: "disguise" } }, EXACT],
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
