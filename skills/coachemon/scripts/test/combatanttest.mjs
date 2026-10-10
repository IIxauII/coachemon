// Every stat below is `calculateStats` worked by hand (game-code.md §24), not a reading taken off the adapter: a
// Garchomp at level 50 with 31 IVs and a neutral nature has 183 HP whoever computes it.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// `abilities` and `moves` are indexed by id, as the game's own tables are.
const ABILITIES = [];
for (const [id, name] of [[5, "Sturdy"], [8, "Sand Veil"], [17, "Immunity"], [26, "Levitate"], [39, "Rough Skin"]]) ABILITIES[id] = { name };
const MOVES = [];
const move = (id, name, type, power, { pp = 10, cat = 0, acc = 100 } = {}) =>
  (MOVES[id] = { id, name, type: TY.indexOf(type), power, accuracy: acc, category: cat, pp, moveTarget: 3, priority: 0, flags: 0, attrs: [] });
const [EARTHQUAKE, DRAGON_CLAW, BODY_SLAM, GROWL] = [89, 337, 34, 45];
move(EARTHQUAKE, "Earthquake", "Ground", 100);
move(DRAGON_CLAW, "Dragon Claw", "Dragon", 80, { pp: 15 });
move(BODY_SLAM, "Body Slam", "Normal", 85, { pp: 15 });
move(GROWL, "Growl", "Normal", 0, { pp: 40, cat: 2 });

const species = (id, name, types, baseStats, ability1) => ({
  speciesId: id, name, baseStats, baseTotal: baseStats.reduce((t, x) => t + x, 0), ability1,
  type1: TY.indexOf(types[0]), type2: types[1] == null ? null : TY.indexOf(types[1]),
  getName: () => name, getRootSpeciesId: () => id, getEvolutionLevels: () => [],
});
const GARCHOMP = species(445, "Garchomp", ["Dragon", "Ground"], [108, 130, 95, 80, 85, 102], 8);
const SNORLAX = species(143, "Snorlax", ["Normal"], [160, 110, 65, 65, 110, 30], 17);
// Heat Rotom's base stats and its second type are the form's, not the species'.
const ROTOM = species(479, "Rotom", ["Electric", "Ghost"], [50, 50, 77, 95, 77, 91], 26);
ROTOM.forms = [{ ...ROTOM }, { ...ROTOM, baseStats: [50, 65, 107, 105, 107, 86], type2: TY.indexOf("Fire") }];

const pmOf = id => ({ moveId: id, getMove: () => MOVES[id], getName: () => MOVES[id].name, getMovePp: () => MOVES[id].pp, ppUsed: 0 });
// A live member, shaped as the game's own: `base` is what its `calculateBaseStats()` answers, so a vitamin shows up
// there and nowhere else, and `stats` is the array the game left on it at `level`.
const live = (name, sp, level, stats, { ivs, nature = 0, moves = [], ability = "x", passive = null, attrs = [], hp,
  boss = 0, player = true, stages = [0, 0, 0, 0, 0, 0, 0], items = [], base = null, formIndex = 0, id = 1 } = {}) => ({
  id, name, level, species: sp, formIndex, ivs, stats, hp: hp ?? stats[0], moveset: moves.map(pmOf),
  getMaxHp: () => stats[0], getStat: i => stats[i] ?? 0, getNature: () => nature,
  getTypes: () => [sp.type1, sp.type2].filter(t => t != null),
  getAbility: () => ({ name: ability }), hasPassive: () => !!passive, getPassiveAbility: () => (passive ? { name: passive } : null),
  hasAbilityWithAttr: a => attrs.includes(a), getHeldItems: () => items, getTag: () => null,
  calculateBaseStats: () => (base ?? sp.baseStats).slice(),
  summonData: { statStages: stages, abilitiesApplied: new Set(), tags: [] },
  waveData: { abilitiesApplied: new Set(), abilityRevealed: true, endured: false },
  turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
  bossSegments: boss, bossSegmentIndex: boss ? boss - 1 : 0, isBoss: () => boss > 0,
  isPlayer: () => player, isOnField: () => true,
});

const scene = { modifiers: [], enemyModifiers: [], game: { config: { gameVersion: "1.12.0.11" } } };
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
const { combatantOf, duelEnv } = globalThis.__hud["09-combatant"];
const { approxOutcomes } = globalThis.__hud["10-damage"];
const { sandboxBreachCount } = globalThis.__hud["01-core"];
globalThis.__hud["04-game-tables"].setGameTables({ moves: MOVES, abilities: ABILITIES });

const env = duelEnv(scene);
const rndBefore = Phaser.Math.RND.state();
const drawsBefore = draws;
const row = c => c.stats.join("/");
const duel = (a, d) => approxOutcomes(env, a, d).map(o => ({ name: o.name, e: o.e, max: o.max, pKo: o.pKo, dmg: Math.round(o.dmg) }));
const shown = x => x.map(o => `${o.name} ×${o.e} ${o.max}${o.pKo ? ` pKo ${o.pKo}` : ""}`).join(", ");

// ---- A live member passes through at its own level and duels exactly as it does itself
{
  const L50 = [183, 150, 115, 100, 105, 122];
  const mon = live("Garchomp", GARCHOMP, 50, L50, { ivs: [31, 31, 31, 31, 31, 31], ability: "Sand Veil", moves: [EARTHQUAKE, DRAGON_CLAW, GROWL] });
  const c = combatantOf({ mon });
  assert.deepEqual(c.stats, L50, "the game's own stats, recomputed from its base stats");
  assert.equal(c.level, 50);
  assert.deepEqual(c.getTypes(), [15, 4]);
  assert.equal(c.getAbility().name, "Sand Veil");
  const foe = combatantOf({ species: SNORLAX, level: 50, moves: [BODY_SLAM], player: false });
  assert.equal(JSON.stringify(approxOutcomes(env, c, foe)), JSON.stringify(approxOutcomes(env, mon, foe)), "ours, move by move");
  assert.equal(JSON.stringify(approxOutcomes(env, foe, c)), JSON.stringify(approxOutcomes(env, foe, mon)), "and the foe's into it");
  assert.deepEqual(duel(c, foe).map(o => o.name), ["Earthquake", "Dragon Claw"], "status moves are not duel moves");
  console.log(`live L50 ${row(c)} | ${shown(duel(c, foe))}`);
  console.log(`foe L50 ${row(foe)} | ${shown(duel(foe, c))}`);

  // A vitamin is in the member's own base stats and nowhere else (game-code.md §20).
  const fed = live("Garchomp", GARCHOMP, 50, L50, { ivs: [31, 31, 31, 31, 31, 31], base: [128, 130, 95, 80, 85, 102] });
  assert.deepEqual(combatantOf({ mon: fed }).stats, [203, 150, 115, 100, 105, 122], "20 base HP of Protein, carried over");
}

// ---- The same species at another level gets the game's stats for that level
{
  const at = level => combatantOf({ species: GARCHOMP, level });
  assert.deepEqual(at(35).stats, [125, 101, 76, 66, 69, 81]);
  assert.deepEqual(at(50).stats, [175, 142, 107, 92, 97, 114]);
  assert.deepEqual(at(100).stats, [341, 280, 210, 180, 190, 224]);
  assert.equal(at(50).getMaxHp(), 175, "max HP is the HP stat");
  assert.equal(at(50).hp, 175, "and a combatant stands at full health");
  assert.equal(at(0).level, 1, "level 1 is the floor");
  // A member judged at the level it will be at the next big fight keeps its own IVs and nature.
  const mon = live("Garchomp", GARCHOMP, 50, [183, 150, 115, 100, 105, 122], { ivs: [31, 31, 31, 31, 31, 31] });
  assert.deepEqual(combatantOf({ mon, level: 60 }).stats, [218, 179, 137, 119, 125, 146]);
  assert.equal(combatantOf({ species: GARCHOMP, level: 50, ability: "Wonder Guard" }).stats[0], 1, "Wonder Guard caps HP at 1");
  assert.equal(combatantOf({ level: 50 }), null, "nothing to compute from");
  for (const level of [35, 50, 100]) console.log(`garchomp L${level} neutral ${row(at(level))}`);
}

// ---- A form brings its own base stats, types and ability, and no form index is the first
{
  const at = form => combatantOf({ species: ROTOM, level: 50, form });
  assert.deepEqual(at(undefined).stats, [117, 62, 89, 107, 89, 103]);
  assert.deepEqual(at(1).stats, [117, 77, 119, 117, 119, 98]);
  assert.deepEqual(at(undefined).getTypes(), [12, 7]);
  assert.deepEqual(at(1).getTypes(), [12, 9], "Electric/Fire");
  assert.equal(at(1).getAbility().name, "Levitate", "the form's own ability, where none is given");
  assert.equal(at(9).stats[1], 62, "a form index the species hasn't got falls back to the species");
  console.log(`rotom ${row(at(undefined))} | heat ${row(at(1))}`);
}

// ---- Unknown IVs and nature are neutral, and a known pair moves the stats the game's way
{
  const at = extra => combatantOf({ species: GARCHOMP, level: 50, ...extra }).stats;
  assert.deepEqual(at({}), at({ ivs: [15, 15, 15, 15, 15, 15], nature: 0 }), "neutral is 15 IVs and Hardy");
  assert.deepEqual(at({ ivs: [31, 31, 31, 31, 31, 31] }), [183, 150, 115, 100, 105, 122]);
  assert.deepEqual(at({ ivs: [0, 0, 0, 0, 0, 0] }), [168, 135, 100, 85, 90, 107]);
  // Adamant: Atk ×1.1 up, SpA ×0.9 down.
  assert.deepEqual(at({ ivs: [31, 31, 31, 31, 31, 31], nature: 3 }), [183, 165, 115, 90, 105, 122]);
  // Modest, the other way — and `Math.ceil(100 * 1.1)` is 111, not 110: the game's own ceil over the same inexact 1.1.
  assert.deepEqual(at({ ivs: [31, 31, 31, 31, 31, 31], nature: 15 }), [183, 135, 115, 111, 105, 122]);
  console.log(`garchomp L50 adamant 31s ${at({ ivs: [31, 31, 31, 31, 31, 31], nature: 3 }).join("/")}`);
}

// ---- Moves given by id come with no PP spent, and an id the table doesn't know is dropped
{
  const c = combatantOf({ species: GARCHOMP, level: 50, moves: [EARTHQUAKE, DRAGON_CLAW, GROWL, 60006] });
  assert.deepEqual(c.moveset.map(pm => pm.moveId), [EARTHQUAKE, DRAGON_CLAW, GROWL]);
  assert.deepEqual(c.moveset.map(pm => pm.getMovePp() - pm.ppUsed), [10, 15, 40], "full PP, every slot");
  assert.deepEqual(c.moveset.map(pm => pm.getName()), ["Earthquake", "Dragon Claw", "Growl"]);
  assert.deepEqual(combatantOf({ species: GARCHOMP, level: 50 }).moveset, [], "no moves and no live member: nothing to use");
}

// ---- Boss bars clamp a hit on the combatant they are given to, and the bar it stands on says which
{
  const atk = combatantOf({ species: GARCHOMP, level: 50, ivs: [31, 31, 31, 31, 31, 31], nature: 3, moves: [EARTHQUAKE] });
  const bossOf = extra => combatantOf({ species: SNORLAX, level: 50, player: false, ...extra });
  const plain = duel(atk, bossOf({}))[0];
  const barred = duel(atk, bossOf({ boss: 2 }))[0];
  const lastBar = duel(atk, bossOf({ boss: 2, bar: 0 }))[0];
  assert.equal(plain.max, 144, "227 HP takes the whole hit");
  assert.equal(barred.max, 113, "the first of two bars stops it at the boundary");
  assert.equal(lastBar.max, 144, "on the last bar there is no boundary left");
  assert.equal(bossOf({ boss: 2 }).isBoss(), true);
  assert.deepEqual([bossOf({ boss: 2 }).bossSegments, bossOf({ boss: 2 }).bossSegmentIndex], [2, 1]);
  assert.deepEqual([bossOf({ boss: 5, bar: 9 }).bossSegments, bossOf({ boss: 5, bar: 9 }).bossSegmentIndex], [5, 4], "a bar past the last is the last");
  const hurt = bossOf({ boss: 2, hp: 500 });
  assert.equal(hurt.hp, hurt.getMaxHp(), "health is capped at max HP");
  console.log(`snorlax ${row(bossOf({}))} | 1 bar ${plain.max} | 2 bars ${barred.max} | 2 bars, last ${lastBar.max}`);
}

// ---- An ability given by id or name is the one the duel asks for, by name and by attr
{
  const nuke = combatantOf({ species: GARCHOMP, level: 50, ivs: [31, 31, 31, 31, 31, 31], nature: 3, moves: [EARTHQUAKE] });
  const prey = extra => combatantOf({ species: SNORLAX, level: 10, player: false, ...extra });
  assert.deepEqual(prey({}).stats, [53, 28, 19, 19, 28, 12]);
  assert.equal(duel(nuke, prey({}))[0].pKo, 1, "a level 50 Earthquake flattens it");
  const sturdy = prey({ ability: 5 });
  assert.equal(sturdy.getAbility().name, "Sturdy", "an ability id reads off the game's table");
  assert.equal(sturdy.hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true, "and brings the attr the duel asks Sturdy for");
  const held = duel(nuke, sturdy)[0];
  assert.equal(held.pKo, 0, "Sturdy holds");
  assert.equal(held.max, 52, "on 1 HP");
  assert.equal(prey({ ability: null }).getAbility(), null, "null is no ability, not an absent one");
  assert.equal(prey({ attrs: ["PreDefendFullHpEndureAbAttr"] }).hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true, "an attr can be given on its own");
  const passive = prey({ ability: 5, passive: 39 });
  assert.equal(passive.hasPassive(), true);
  assert.equal(passive.getPassiveAbility().name, "Rough Skin", "a passive id too");
  assert.equal(prey({}).hasPassive(), false, "and no passive unless it is given one");
  // Both names reach the type chart, which is the other thing the duel asks an ability for.
  assert.equal(duel(nuke, prey({ ability: "Levitate" }))[0].e, 0, "Levitate is immune to the Earthquake");
  assert.equal(duel(nuke, prey({ ability: null, passive: "Levitate" }))[0].e, 0, "as a passive as well");

  // A member's own ability answers off the member, so its attrs come along; an overridden one no longer can.
  const mon = live("Snorlax", SNORLAX, 10, [53, 28, 19, 19, 28, 12], { ability: "Sturdy", attrs: ["PreDefendFullHpEndureAbAttr"], player: false });
  assert.equal(combatantOf({ mon }).hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true);
  assert.equal(combatantOf({ mon, ability: null }).hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), false);
  const over = combatantOf({ mon, ability: "Sturdy" });
  assert.equal(over.hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true, "...unless the name brings the attr itself");
  assert.equal(combatantOf({ mon, passive: "Sturdy" }).hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true, "a passive Sturdy brings it too");
}

// ---- Stat stages are the ones asked for, and a member is adapted off the field, not on it
{
  const stages = [2, 0, 0, 0, 0, 0, 0]; // +2 Atk: the slots start at Atk, there being no stage on HP.
  const mon = live("Garchomp", GARCHOMP, 50, [183, 150, 115, 100, 105, 122], { ivs: [31, 31, 31, 31, 31, 31], moves: [EARTHQUAKE], stages });
  const foe = combatantOf({ species: SNORLAX, level: 50, player: false });
  assert.deepEqual(combatantOf({ mon }).summonData.statStages, [0, 0, 0, 0, 0, 0, 0], "the +2 Atk it is standing on is left on the field");
  assert.ok(duel(combatantOf({ mon }), foe)[0].max < duel(mon, foe)[0].max, "so it hits for less than it does right now");
  assert.equal(JSON.stringify(approxOutcomes(env, combatantOf({ mon, stages }), foe)), JSON.stringify(approxOutcomes(env, mon, foe)), "and for the same once asked for them");
}

// ---- The key tells apart everything the duel reads off a combatant, and nothing else
{
  const spec = { species: GARCHOMP, level: 50, ivs: [31, 31, 31, 31, 31, 31], nature: 3, moves: [EARTHQUAKE, DRAGON_CLAW], ability: 5, boss: 2 };
  const key = extra => combatantOf({ ...spec, ...extra }).key;
  assert.equal(key(), key(), "the same combatant, twice");
  assert.equal(typeof key(), "string", "so a pair score can be memoised on it");
  assert.equal(key({ name: "Chompy", id: 7 }), key(), "a nickname is not a duel fact");
  // The duel reads `stats`, never the IVs behind them, so an IV the floor swallows shares the memo entry (#572).
  assert.equal(key({ ivs: [30, 31, 31, 31, 31, 31] }), key(), "an HP IV of 30 is 183 HP at level 50 too");
  const APART = [["species", { species: SNORLAX }], ["level", { level: 51 }], ["ivs", { ivs: [31, 29, 31, 31, 31, 31] }],
    ["nature", { nature: 0 }], ["moves", { moves: [EARTHQUAKE] }], ["pp", { moves: [DRAGON_CLAW, EARTHQUAKE] }],
    ["ability", { ability: 8 }], ["passive", { passive: 39 }], ["attrs", { attrs: ["ReverseDrainAbAttr"] }],
    ["hp", { hp: 100 }], ["bars", { boss: 3 }], ["bar", { bar: 0 }], ["stages", { stages: [2, 0, 0, 0, 0, 0, 0] }],
    ["side", { player: false }], ["form", { form: 1 }]];
  const seen = new Map([[key(), "base"]]);
  for (const [what, extra] of APART) {
    const k = key(extra);
    assert.ok(!seen.has(k), `${what} must move the key (collides with ${seen.get(k)})`);
    seen.set(k, what);
  }
  const mon = live("Garchomp", GARCHOMP, 50, [183, 150, 115, 100, 105, 122], { ivs: [31, 31, 31, 31, 31, 31] });
  assert.equal(combatantOf({ mon }).key, combatantOf({ mon }).key, "a live member, adapted twice");
  assert.notEqual(combatantOf({ mon }).key, combatantOf({ mon, level: 60 }).key);
  console.log(`keys apart: ${seen.size}`);
}

// ---- Building a combatant draws nothing and breaches nothing
assert.equal(draws - drawsBefore, 0, "the run's RNG was never asked");
assert.equal(Phaser.Math.RND.state(), rndBefore, "and its stream was never set");
assert.equal(sandboxBreachCount(), 0);
assert.equal(globalThis.__coachHud.stats().breaches, 0);

console.log("combatant: ok");
