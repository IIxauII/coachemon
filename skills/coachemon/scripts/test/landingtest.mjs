import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { mon, TRAITS } from "./fake-mon.mjs";
import { fakeTurn } from "./fake-turn.mjs";
import { fightState } from "./fake-fight.mjs";
import { BerryType } from "../../../../src/enums/generated.ts";

mountHud({ scene: { currentBattle: { waveIndex: 10, turn: 1 }, getField: () => [], getPlayerParty: () => [], getEnemyParty: () => [] } });
const D = globalThis.__hud["10-damage"];
const { stateOf, land, landTurnEnd, luckKey, landingKey, koCurve, koTurns } = D;
const { tpTables, tpFight } = globalThis.__hud["35-team-plan"];

const held = (name, n = 1) => new ({ [name]: class { getStackCount() { return n; } } })[name]();
const tokens = n => (n ? [Object.assign(held("EnemyEndureChanceModifier", n), { chance: 2 })] : []);
const berries = (type, n) => (n ? [Object.assign(held("BerryModifier", n), { berryType: type })] : []);
// `token` is the wave's endure chance in stacks of 2 %; `sitrus` and `enigma` the berries held, and `pouch` the side's
// Berry Pouch stacks; `moves` as fake-mon.mjs's `mon` takes them.
const targetMon = ({ name = "target", hp = 100, maxHp = hp, boss = 0, idx, sturdy = false, band = 0, seed = false, sitrus = 0, enigma = 0, player = false, trainer = false, moves = [] } = {}) =>
  mon(name, 50, ["Normal"], [maxHp, 100, 100, 100, 100, 100], moves, true, hp, {
    isPlayer: () => player, bossSegments: boss, bossSegmentIndex: idx ?? Math.max(0, boss - 1), formIndex: 0, waveData: {},
    hasAbilityWithAttr: a => sturdy && a === "PreDefendFullHpEndureAbAttr", ...(trainer ? { hasTrainer: () => true } : {}),
    getHeldItems: () => [...(band ? [held("SurviveDamageModifier", band)] : []), ...(seed ? [held("PokemonInstantReviveModifier")] : []),
      ...berries(BerryType.SITRUS, sitrus), ...berries(BerryType.ENIGMA, enigma)],
  });
const pouches = n => (n ? [held("PreserveBerryModifier", n)] : []);
// A target's facts as the fakes read them (fake-turn.mjs).
const factsOf = (o = {}) => D.targetFacts({ enemyModifiers: [...tokens(o.token ?? 0), ...pouches(o.pouch ?? 0)], finalBoss: !!o.finalBoss }, targetMon(o));
const at = (o = {}) => stateOf(factsOf(o));
const sure = (d, n = 1) => ({ d, n });
// `[hp, bar, p, dealt, hits]` per outcome, with `R` for a spent Reviver Seed and `T` for a spent token.
// `S`, `E`: the Sitrus and Enigma Berries held; `F`: a super-effective hit landed this turn.
const marks = s => `${s.revived ? "R" : ""}${s.tok ? "T" : ""}${s.sitrus ? `S${s.sitrus}` : ""}${s.enigmas ? `E${s.enigmas}` : ""}${s.fed ? "F" : ""}`;
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

// The states the invariants sweep, and the uses and hits they take.
const STATES = [at(), at({ sturdy: true }), at({ band: 2 }), at({ token: 5 }), at({ hp: 100, maxHp: 200, seed: true }), at({ hp: 300, boss: 3, token: 5 }),
  at({ hp: 300, boss: 3, sturdy: true, band: 1, token: 10, seed: true }), at({ hp: 10, band: 1 }), at({ hp: 100, finalBoss: true, band: 1 }),
  at({ hp: 200, sitrus: 2, enigma: 1, pouch: 1 }), at({ hp: 200, boss: 2, sitrus: 1, enigma: 2, seed: true })];
const USES = [sure(0), sure(50), sure(99.5), sure(100), sure(150), sure(300, 2), sure(450, 3), { d: 151, n: 2.4 }, { d: 120, n: 1, se: 0.4 }, { d: 60, n: 2, se: 1 }];
const HITS = [{}, { ignoresSturdy: true }, { ohko: true }, { factor: bar => 1 + bar / 2 }, { e: 2 }];
const ENDS = [{}, { before: -30, after: 10 }, { before: 25, after: -60 }, { after: -500, eats: false }, { before: NaN, after: 40 }];
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
