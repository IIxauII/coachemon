// Every level below is the EXP model worked by hand, not a reading taken off it: a wave is a tenth of the climb the
// level cap makes over the decade ahead, the curve is `level³`, and a share is the game's own (game-code.md §15, §17).
// Wave 62 is 8 waves short of the boss on 70, where the cap stands at 56.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { party, species, SPECIES } from "./fixtures/party.mjs";

// The species registry the chunk scan hands over (game-code.md §23): `getSpecies(id)`, and `getEvolutions(id)` whose
// entries carry a `level`, an `item` and a `condition`. Dratini's line is levelled, Golbat's conditional, Magneton's
// held behind an item, and Tyrogue's two branches carry nothing to tell them apart.
let validated = 0;
const SP = {
  dratini: species(147, "Dratini", ["Dragon"], 300),
  dragonair: species(148, "Dragonair", ["Dragon"], 420, { root: 147 }),
  dragonite: species(149, "Dragonite", ["Dragon", "Flying"], 600, { root: 147 }),
  golbat: species(42, "Golbat", ["Poison", "Flying"], 455, { root: 41 }),
  crobat: species(169, "Crobat", ["Poison", "Flying"], 535, { root: 41 }),
  magneton: species(82, "Magneton", ["Electric", "Steel"], 465, { root: 81 }),
  magnezone: species(462, "Magnezone", ["Electric", "Steel"], 535, { root: 81 }),
  tyrogue: species(236, "Tyrogue", ["Fighting"], 210),
  hitmonlee: species(106, "Hitmonlee", ["Fighting"], 455, { root: 236 }),
  hitmonchan: species(107, "Hitmonchan", ["Fighting"], 455, { root: 236 }),
};
const EVOS = {
  147: [{ speciesId: 148, level: 35 }],
  148: [{ speciesId: 149, level: 45 }],
  // Crobat's own friendship check, which holds for the Golbat below and is never asked all the same.
  42: [{ speciesId: 169, level: 40, condition: { validate: () => { validated++; return true; } } }],
  82: [{ speciesId: 462, level: 1, item: "THUNDER_STONE" }],
  129: [{ speciesId: 130, level: 20 }],
  236: [{ speciesId: 106, level: 40 }, { speciesId: 107, level: 40 }],
};
const REG = {
  getSpecies: id => Object.values(SP).find(sp => sp.speciesId === id) ?? null,
  getEvolutions: id => EVOS[id] ?? [],
};

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
// The species a projection says the mon stands as at the fight, and the line it walked to get there.
const name = r => (r.evolved.length ? `${r.evolved.map(sp => sp.name).join("→")} (evolved)`
  : `${r.species?.name ?? "—"} (as it is)`);

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

// ---- An evolution counts only where it lands by the fight, and the level that lands it is the projected one
{
  // The three projections below are the same EXP model as above, from wave 62 to the boss on 70: a mon at level 30
  // reaches 34 on a fifth of a participant's share, 37 on two fifths, and 45 fighting every wave itself.
  const dratini = { name: "Dratini", id: "147:30", level: 30, species: SP.dratini };
  const to = mods => { scene.modifiers = mods; return levelProjection(scene, { from: 62, fight: 70 }); };
  const BENCHED = [expAll(1)], FED = [expAll(2)];

  console.log("== an evolution by the next big fight");
  // Before the registry lands there is no evolved species to score at all, so nothing evolves.
  assert.equal(to([]).of(dratini, { participant: true }).species, SP.dratini, "no species registry, no evolution");
  assert.deepEqual(to([]).of(dratini, { participant: true }).evolved, []);
  globalThis.__hud["04-game-tables"].setGameTables({ species: REG });

  const stands = to(BENCHED).of(dratini);
  const once = to(FED).of(dratini);
  const whole = to([]).of(dratini, { participant: true });
  row("Dratini, benched", [`L${stands.was}→${stands.level}`, name(stands)]);
  row("…two EXP. All stacks", [`L${once.was}→${once.level}`, name(once)]);
  row("…fighting every wave", [`L${whole.was}→${whole.level}`, name(whole)]);
  assert.deepEqual([stands.level, once.level, whole.level], [34, 37, 45]);
  assert.equal(stands.species, SP.dratini, "Dragonair is one level out of reach at 34, so the mon is scored as it is");
  assert.deepEqual(stands.evolved, []);
  assert.equal(once.species, SP.dragonair, "at 37 the level has landed…");
  assert.deepEqual(once.evolved, [SP.dragonair]);
  assert.equal(whole.species, SP.dragonite, "…and at 45 the whole line has");
  assert.deepEqual(whole.evolved, [SP.dragonair, SP.dragonite], "every species it passes through, in order");
  assert.equal(whole.form, 0, "the registry names a species, not a form");
  assert.equal(whole.confidence, "estimate", "an evolution read off a projected level is no more than an estimate");

  // A condition is refused on purpose, and it does not matter that this one holds: a condition reads the mon as it
  // stands now, where the question is whether it holds at the fight. The evolution's own `validate` is never called.
  const golbat = { name: "Golbat", id: "42:30", level: 30, species: SP.golbat, friendship: 255 };
  const gone = to([]).of(golbat, { participant: true });
  row("Golbat, friendship 255", [`L${gone.was}→${gone.level}`, name(gone)]);
  assert.equal(gone.species, SP.golbat, "Crobat's level is reached at 45 and its condition is refused anyway");
  assert.deepEqual(gone.evolved, []);
  assert.equal(validated, 0, "and nothing asked the condition to validate itself");

  // Luck is not counted: an evolution item is applied the moment it is drawn, so it is never held and never in the
  // bag (game-code.md §15), and a line waiting on one never lands.
  const magneton = { name: "Magneton", id: "82:30", level: 30, species: SP.magneton };
  const stone = to([]).of(magneton, { participant: true });
  row("Magneton, no stone", [`L${stone.was}→${stone.level}`, name(stone)]);
  assert.equal(stone.species, SP.magneton, "a Thunder Stone has to be drawn, which is luck");

  // A member standing past its own evolution level has not evolved for a reason the coach cannot read, and the
  // projection does not evolve it either. The fixture's Magikarp is eleven levels past Gyarados' 20.
  const karp = party()[3];
  const unevolved = to(FED).of(karp, { participant: true });
  row("Magikarp, L35 past 20", [`L${unevolved.was}→${unevolved.level}`, name(unevolved)]);
  assert.equal(unevolved.species, SPECIES.magikarp, "whatever is holding it back is not a thing the coach can see");
  assert.deepEqual(unevolved.evolved, []);

  // The player may switch a member's evolutions off, and a branch with no condition on either side — which no line
  // in the game has — is refused rather than guessed at.
  const paused = to([]).of({ ...dratini, pauseEvolutions: true }, { participant: true });
  const forked = to([]).of({ name: "Tyrogue", id: "236:30", level: 30, species: SP.tyrogue }, { participant: true });
  assert.equal(paused.species, SP.dratini, "evolutions paused on the member");
  assert.equal(forked.species, SP.tyrogue, "two landing branches, and no way to tell which the game would take");
  row("paused / a bare branch", [name(paused), name(forked)]);

  // A stand-in with no species yet, and a member going nowhere.
  assert.equal(to([]).of({ level: 30 }, { participant: true }).species, null, "nothing to evolve");
  assert.deepEqual(to([]).of({ level: 30 }, { participant: true }).evolved, []);
  const held = to([]).of({ level: 30, species: SP.dratini, formIndex: 2 });
  assert.equal(held.species, SP.dratini, "no EXP at all, so no level and no evolution");
  assert.equal(held.form, 2, "and the member keeps the form it is standing in");
  scene.modifiers = [];
}

// ---- Projecting a level draws nothing and breaches nothing
assert.equal(draws - drawsBefore, 0, "the run's RNG was never asked");
assert.equal(Phaser.Math.RND.state(), rndBefore, "and its stream was never set");
assert.equal(sandboxBreachCount(), 0);
assert.equal(globalThis.__coachHud.stats().breaches, 0);

console.log("projection: ok");
