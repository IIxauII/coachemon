import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { mon } from "./fake-mon.mjs";

mountHud({ scene: { currentBattle: { waveIndex: 10, turn: 1 }, getField: () => [], getPlayerParty: () => [], getEnemyParty: () => [] } });
const D = globalThis.__hud["10-damage"];
const { stateOf, land, luckKey, landingKey, koCurve } = D;

const held = (name, n = 1) => new ({ [name]: class { getStackCount() { return n; } } })[name]();
// A target's facts as the fakes read them (fake-turn.mjs): `token` is the wave's endure chance in stacks of 2 %.
const factsOf = ({ hp = 100, maxHp = hp, boss = 0, idx, sturdy = false, band = 0, seed = false, token = 0, finalBoss = false, player = false } = {}) => {
  const p = mon("target", 50, ["Normal"], [maxHp, 100, 100, 100, 100, 100], [], true, hp, {
    isPlayer: () => player, bossSegments: boss, bossSegmentIndex: idx ?? Math.max(0, boss - 1), formIndex: 0, waveData: {},
    hasAbilityWithAttr: a => sturdy && a === "PreDefendFullHpEndureAbAttr",
    getHeldItems: () => [...(band ? [held("SurviveDamageModifier", band)] : []), ...(seed ? [held("PokemonInstantReviveModifier")] : [])],
  });
  return D.targetFacts({ enemyModifiers: token ? [Object.assign(held("EnemyEndureChanceModifier", token), { chance: 2 })] : [], finalBoss }, p);
};
const at = (o = {}) => stateOf(factsOf(o));
const sure = (d, n = 1) => ({ d, n });
// `[hp, bar, p, dealt, hits]` per outcome, with `R` for a spent Reviver Seed and `T` for a spent token.
const row = outs => outs.map(o => `${+o.state.hp.toFixed(3)}/${o.state.bar}${o.state.revived ? "R" : ""}${o.state.tok ? "T" : ""} p${+o.p.toFixed(4)} dealt ${+o.dealt.toFixed(3)} ×${o.hits}`).join(" · ");
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

// The states the invariants sweep, and the uses and hits they take.
const STATES = [at(), at({ sturdy: true }), at({ band: 2 }), at({ token: 5 }), at({ hp: 100, maxHp: 200, seed: true }), at({ hp: 300, boss: 3, token: 5 }),
  at({ hp: 300, boss: 3, sturdy: true, band: 1, token: 10, seed: true }), at({ hp: 10, band: 1 }), at({ hp: 100, finalBoss: true, band: 1 })];
const USES = [sure(0), sure(50), sure(99.5), sure(100), sure(150), sure(300, 2), sure(450, 3), { d: 151, n: 2.4 }];
const HITS = [{}, { ignoresSturdy: true }, { ohko: true }, { factor: bar => 1 + bar / 2 }];
const sweep = fn => {
  for (const st of STATES) for (const use of USES) for (const hit of HITS) for (const whole of [false, true]) fn(st, use, hit, whole);
};

// ---- Every outcome's chance is above 0 and they sum to 1, and no input is changed
{
  sweep((st, use, hit, whole) => {
    const before = JSON.stringify([st, use, hit]);
    const outs = land(st, use, hit, { whole });
    assert.ok(outs.every(o => o.p > 0));
    assert.ok(Math.abs(outs.reduce((t, o) => t + o.p, 0) - 1) < 1e-12);
    assert.equal(JSON.stringify([st, use, hit]), before);
  });
}

// ---- A state already down and a miss come back as they were, with nothing dealt
{
  const st = at();
  for (const use of [sure(0), sure(-5), sure(NaN), sure(Infinity), null]) assert.deepEqual(land(st, use), [{ state: st, p: 1, dealt: 0, hits: 0 }]);
  for (const [hp, whole] of [[0, false], [0, true], [0.5, true]]) {
    const down = stateOf(st.facts, hp);
    assert.deepEqual(land(down, sure(50), {}, { whole }), [{ state: down, p: 1, dealt: 0, hits: 0 }]);
  }
  assert.deepEqual(land(stateOf({ maxHp: 100 }, 100), sure(150)).map(o => [o.state.hp, o.p]), [[0, 1]], "a facts record holding only maxHp is a plain HP pool");
}

// ---- Two states with equal landing keys differ in HP alone, and a Sturdy holder's full HP is its luck
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

// ---- stateOf carries every field of the discrete part from `from`, and never its HP or bar
{
  console.log(`== the discrete part: ${DISCRETE.join(", ")}`);
  const s = stateOf(factsOf(), 40, 0, { ...spent, hp: 7, bar: 3 });
  assert.deepEqual([s.hp, s.bar], [40, 0]);
  for (const k of DISCRETE) assert.equal(s[k], spent[k], k);
}

// ---- Every field of the discrete part survives a missed use from `after1` to the state `start` reopens
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

console.log("ok");
