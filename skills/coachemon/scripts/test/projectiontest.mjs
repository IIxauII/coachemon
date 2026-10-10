// Every level below is the EXP model worked by hand, not a reading taken off it: a wave is a tenth of the climb the
// level cap makes over the decade ahead, the curve is `level³`, and a share is the game's own (game-code.md §15, §17).
// Wave 62 is 8 waves short of the boss on 70, where the cap stands at 56.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { party } from "./fixtures/party.mjs";

class ExpShareModifier {}
const mk = (C, f) => Object.assign(new C(), f);
const expAll = n => mk(ExpShareModifier, { getStackCount: () => n });
const egg = (mon, id, n = 1) => ({ pokemonId: mon.id, type: { id }, getStackCount: () => n });

const scene = { modifiers: [], enemyModifiers: [], gameMode: {}, game: { config: { gameVersion: "1.12.0.11" } } };
let draws = 0;
globalThis.window = globalThis;
globalThis.Phaser = {
  Math: { RND: { _s: "!rnd,live",
    state(v) { if (v !== undefined) { draws++; this._s = v; } return this._s; },
    integerInRange() { draws++; return 0; }, realInRange() { draws++; return 0; }, frac() { draws++; return 0; },
    pick(a) { draws++; return a[0]; }, shuffle(a) { draws++; return a; } } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } },
};
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { levelCapAt, levelProjection } = globalThis.__hud["09-projection"];
const { sandboxBreachCount } = globalThis.__hud["01-core"];

const rndBefore = Phaser.Math.RND.state();
const drawsBefore = draws;
const row = (label, cells) => console.log(`${label.padEnd(26)}${[].concat(cells).join("  ")}`);
// A projected level, with the mark the cap leaves on it.
const at = (p, x, opts) => { const r = p.of(x, opts); return `${r.was}→${r.level}${r.capped ? "=cap" : ""}`; };

// ---- The level cap by wave, which is where the EXP stream is calibrated from
{
  console.log("== level cap");
  row("classic", [10, 20, 30, 50, 70, 80, 200].map(w => `w${w} ${levelCapAt(scene, w)}`));
  row("daily", [10, 30, 50].map(w => `w${w} ${levelCapAt({ gameMode: { isDaily: true } }, w)}`));
  // The four the game's own section states (game-code.md §15).
  assert.deepEqual([10, 20, 50, 200].map(w => levelCapAt(scene, w)), [10, 16, 38, 200]);
  assert.equal(levelCapAt(scene, 30), 24, "and the classic half of the pair Daily is quoted against");
  assert.equal(levelCapAt({ gameMode: { isDaily: true } }, 30), 52, "Daily rounds the wave up and then adds its own");
  assert.equal(levelCapAt(scene, 62), levelCapAt(scene, 70), "a wave is capped by the decade it is in");
  assert.equal(levelCapAt(scene, 0), 10, "wave 0 is wave 1's decade");
}

// ---- The party at the next big fight: the same EXP, and the member furthest behind gains the most levels
{
  const team = party();
  const none = levelProjection(scene, { from: 62, fight: 70 });
  scene.modifiers = [expAll(2)];
  const share = levelProjection(scene, { from: 62, fight: 70 });
  console.log("== party to the boss on 70");
  assert.equal(share.waves, 8, "the waves between, which is what the run calendar hands over");
  assert.equal(share.cap, 56);
  assert.equal(share.expAll, 2, "EXP. All ×2, read off the run");
  row("no EXP. All, benched", team.map(m => `${m.name} ${at(none, m)}`));
  row("EXP. All ×2, benched", team.map(m => `${m.name} ${at(share, m)}`));
  row("fighting them alone", team.map(m => `${m.name} ${at(share, m, { participant: true })}`));
  row("one of two fighting", team.map(m => `${m.name} ${at(share, m, { participant: true, participants: 2 })}`));

  assert.deepEqual(team.map(m => none.of(m).level), [50, 48, 47, 35],
    "a benched party with no EXP. All gains nothing: a non-participant's share is zero");
  assert.deepEqual(team.map(m => share.of(m).level), [53, 51, 50, 41]);
  assert.equal(share.of(team[3]).gained, 6, "Magikarp takes the same EXP as Garchomp…");
  assert.equal(share.of(team[0]).gained, 3, "…and draws twice the levels from it, the curve being cubic");
  assert.deepEqual(team.map(m => share.of(m, { participant: true }).level), [56, 56, 55, 48]);
  assert.deepEqual(team.map(m => share.of(m, { participant: true, participants: 2 }).level), [54, 52, 51, 42],
    "a participant among two takes half the wave");
  assert.equal(share.of(team[0], { participant: true }).capped, true, "Garchomp reaches the cap and stops there");
  assert.equal(share.of(team[0], { participant: true, participants: 2 }).capped, false);
}

// ---- A member at the cap stays there, whatever it holds and however much it fights
{
  const capped = { name: "Sudowoodo", id: "185:56", level: 56, pokerus: true };
  scene.modifiers = [expAll(5), egg(capped, "GOLDEN_EGG")];
  const fed = levelProjection(scene, { from: 62, fight: 70 });
  console.log("== at the cap");
  row("L56, every multiplier", [at(fed, capped, { participant: true }), `gained ${fed.of(capped, { participant: true }).gained}`]);
  assert.equal(fed.of(capped, { participant: true }).level, 56, "a member at the cap takes no share of any wave");
  assert.equal(fed.of(capped, { participant: true }).gained, 0);
  assert.equal(fed.of(capped).level, 56, "benched too");
  assert.equal(fed.of({ level: 60 }, { participant: true }).level, 60, "and a member over the cap is never pulled down to it");
  scene.modifiers = [];
}

// ---- A newcomer far below the party, with and without EXP share and a Lucky Egg
{
  // `getLevelForWave` puts a wild catch on wave 62 at level 38, against a party at 47–50 (newcomer-mechanics.md §1.1).
  const newcomer = { name: "Lucario", id: "448:38", level: 38 };
  const cases = [
    ["benched, no EXP. All", []],
    ["benched, EXP. All ×1", [expAll(1)]],
    ["…and a Lucky Egg", [expAll(1), egg(newcomer, "LUCKY_EGG")]],
    ["…a Golden Egg instead", [expAll(1), egg(newcomer, "GOLDEN_EGG")]],
    ["…Pokérus and a Lucky Egg", [expAll(1), egg(newcomer, "LUCKY_EGG")]],
    ["benched, EXP. All ×5", [expAll(5)]],
    ["fighting every wave", []],
  ];
  console.log("== a newcomer 12 levels behind");
  const got = cases.map(([label, mods], i) => {
    scene.modifiers = mods;
    const p = levelProjection(scene, { from: 62, fight: 70 });
    const x = label.includes("Pokérus") ? { ...newcomer, pokerus: true } : newcomer;
    const r = p.of(x, { participant: label.startsWith("fighting") });
    row(label, [`L${r.was}→${r.level}`, `+${r.gained}`, r.capped ? "=cap" : `${r.cap - r.level} under the cap`, r.confidence]);
    return r.level;
  });
  assert.deepEqual(got, [38, 40, 42, 43, 43, 49, 49]);
  assert.equal(got[0], 38, "with no EXP share a benched newcomer never catches up: it gains nothing at all");
  assert.ok(got[1] > got[0] && got[2] > got[1] && got[3] > got[2], "EXP. All, then the Lucky Egg, then the Golden Egg");
  assert.equal(got[4], got[3], "Pokérus ×1.5 and the Lucky Egg's +40 % land on the same level here");
  assert.equal(got[5], got[6], "five EXP. All stacks give the bench a participant's whole share (0.2 × 5)");
  scene.modifiers = [];
}

// ---- The projection never passes the level cap, and reads it at every wave rather than once
{
  const fed = { name: "Garchomp", id: "445:50", level: 50, pokerus: true };
  scene.modifiers = [egg(fed, "GOLDEN_EGG")];
  console.log("== the cap at every wave");
  const reach = [64, 66, 68, 70, 72].map(fight => {
    const p = levelProjection(scene, { from: 62, fight });
    const r = p.of(fed, { participant: true });
    assert.ok(r.level <= p.cap, `a projection to wave ${fight} stays under the cap`);
    return `w${fight} cap ${p.cap} → ${r.level}`;
  });
  row("force-fed from w62", reach);
  const toBoss = levelProjection(scene, { from: 62, fight: 70 }).of(fed, { participant: true });
  const past = levelProjection(scene, { from: 62, fight: 72 }).of(fed, { participant: true });
  assert.equal(toBoss.level, 56, "the cap holds it at 56 for every wave of the decade");
  assert.equal(past.level, 60, "and only the two waves past 70, where the cap is 64, carry it beyond");
  assert.ok(past.level < 64, "the EXP banked while it sat at 56 is lost, not spent the moment the cap rises");

  // Every member of a full party, every routing, against the cap at the fight.
  scene.modifiers = [expAll(5)];
  const p = levelProjection(scene, { from: 68, fight: 78 });
  for (const m of [...party(), fed, { level: 1 }, { level: 99 }]) {
    for (const opts of [{}, { participant: true }, { participant: true, participants: 6 }]) {
      const r = p.of(m, opts);
      assert.ok(r.level <= Math.max(r.was, p.cap), `${m.name ?? "L" + m.level} stays at or under the cap`);
    }
  }
  row("w68→78, cap 64", [...party(), fed].map(m => `${m.name} ${at(p, m, { participant: true })}`));
  scene.modifiers = [];
}

// ---- Nothing to reach: no fight, no waves, a level that stands
{
  const team = party();
  for (const [label, opts] of [["no fight", { from: 62 }], ["the fight we are on", { from: 70, fight: 70 }],
    ["a fight behind us", { from: 70, fight: 62 }], ["no run at all", {}]]) {
    const p = levelProjection(scene, opts);
    assert.equal(p.waves, 0, `${label}: no wave between`);
    assert.deepEqual(team.map(m => p.of(m, { participant: true }).level), team.map(m => m.level), `${label}: every level stands`);
  }
  const bare = levelProjection(null, { from: 62, fight: 70 });
  // 40³ + 8 waves × (64³ − 56³)/10 = 133 222, which is level 51 on the curve — the same sum the party block runs.
  assert.equal(bare.of({ level: 40 }, { participant: true }).level, 51, "and with no scene the calendar alone still projects");
  assert.equal(bare.of({}).level, 1, "a mon with no level at all is level 1");
  assert.equal(bare.of(null).level, 1);
  console.log("== nothing to reach: ok");
}

// ---- The projection is an estimate, and says so on every answer
{
  const p = levelProjection(scene, { from: 62, fight: 70 });
  assert.equal(p.confidence, "estimate");
  assert.deepEqual([...party(), { level: 1 }].map(m => p.of(m).confidence), Array(5).fill("estimate"),
    "an EXP stream is a model of what the run will do, never a read of it (CONTEXT.md, `Confidence`)");
  assert.equal(levelProjection(scene, { from: 62 }).of(party()[0]).confidence, "estimate",
    "a projection over no waves at all is an estimate too");
}

// ---- Projecting a level draws nothing and breaches nothing
assert.equal(draws - drawsBefore, 0, "the run's RNG was never asked");
assert.equal(Phaser.Math.RND.state(), rndBefore, "and its stream was never set");
assert.equal(sandboxBreachCount(), 0);
assert.equal(globalThis.__coachHud.stats().breaches, 0);

console.log("projection: ok");
