// Every stat below is `calculateStats` worked by hand (game-code.md §24), not a reading taken off the adapter: a
// Garchomp at level 50 with 31 IVs and a neutral nature has 183 HP whoever computes it.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// `abilities` and `moves` are indexed by id, as the game's own tables are.
const ABILITIES = [];
// Disguise is one of the abilities that doesn't work on a fusion, and carries the attr the game refuses it by.
const NO_FUSION = [{ constructor: { name: "NoFusionAbilityAbAttr" } }];
for (const [id, name, attrs = []] of [[5, "Sturdy"], [8, "Sand Veil"], [17, "Immunity"], [26, "Levitate"],
  [39, "Rough Skin"], [61, "Shed Skin"], [110, "Inner Focus"], [136, "Multiscale"],
  [209, "Disguise", NO_FUSION]]) ABILITIES[id] = { name, attrs };
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
const DRATINI = species(147, "Dratini", ["Dragon"], [41, 64, 45, 50, 50, 50], 61);
// The species Dratini stands as once the projection says its line lands (#576): its own abilities, by the index an
// evolution keeps, and a passive of its own.
const DRAGONITE = species(149, "Dragonite", ["Dragon", "Flying"], [91, 134, 95, 100, 100, 80], 110);
DRAGONITE.getAbility = i => (i === 1 ? 136 : 110);
DRAGONITE.getPassiveAbility = () => 39;
// Heat Rotom's base stats and its second type are the form's, not the species'.
const ROTOM = species(479, "Rotom", ["Electric", "Ghost"], [50, 50, 77, 95, 77, 91], 26);
ROTOM.forms = [{ ...ROTOM }, { ...ROTOM, baseStats: [50, 65, 107, 105, 107, 86], type2: TY.indexOf("Fire") }];

const pmOf = id => ({ moveId: id, getMove: () => MOVES[id], getName: () => MOVES[id].name, getMovePp: () => MOVES[id].pp, ppUsed: 0 });
// A live member, shaped as the game's own: `base` is what its `calculateBaseStats()` answers, so a vitamin shows up
// there and nowhere else, and `stats` is the array the game left on it at `level`.
// `fusion` is the other half of a fusion the game has already made: `base` is then the fused base stats its
// `calculateBaseStats()` answers, `types` its fused types and `ability` the other half's (game-code.md §24).
const live = (name, sp, level, stats, { ivs, nature = 0, moves = [], ability = "x", passive = null, attrs = [], hp,
  boss = 0, player = true, stages = [0, 0, 0, 0, 0, 0, 0], items = [], base = null, formIndex = 0, id = 1,
  abilityAttrs = [], types = null, fusion = null, fusionFormIndex = 0 } = {}) => ({
  id, name, level, species: sp, formIndex, ivs, stats, hp: hp ?? stats[0], moveset: moves.map(pmOf),
  fusionSpecies: fusion, fusionFormIndex,
  getMaxHp: () => stats[0], getStat: i => stats[i] ?? 0, getNature: () => nature,
  getTypes: () => types ?? [sp.type1, sp.type2].filter(t => t != null),
  getAbility: () => ({ name: ability, attrs: abilityAttrs }), hasPassive: () => !!passive, getPassiveAbility: () => (passive ? { name: passive } : null),
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

// ---- A member judged as the species it evolves into by the next big fight is scored as that species
{
  const IVS = [31, 31, 31, 31, 31, 31];
  const L30 = [73, 52, 41, 44, 44, 44];
  const mon = live("Dratini", DRATINI, 30, L30, { ivs: IVS, moves: [DRAGON_CLAW], ability: "Shed Skin",
    passive: "Marvel Scale", attrs: ["PreDefendFullHpEndureAbAttr"] });
  const evolved = combatantOf({ mon, level: 45, species: DRAGONITE });
  // Dragonite's own base stats at level 45 with the Dratini's 31 IVs and its neutral nature.
  assert.deepEqual(evolved.stats, [150, 139, 104, 108, 108, 90], "the species it will be, at the level it will be it");
  assert.deepEqual(evolved.getTypes(), [15, 2], "Dragon/Flying, not the Dratini's Dragon");
  assert.equal(evolved.getAbility().name, "Inner Focus", "the evolved species' ability, not the member's Shed Skin");
  assert.equal(evolved.getPassiveAbility().name, "Rough Skin", "and its own passive: a passive is the species'");
  assert.equal(evolved.hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), false,
    "the member's own ability is gone, and its attrs with it");
  assert.deepEqual(evolved.moveset.map(pm => pm.moveId), [DRAGON_CLAW], "the moves it actually knows come along");
  assert.deepEqual([evolved.level, evolved.species, evolved.formIndex], [45, DRAGONITE, 0]);
  console.log(`dratini → dragonite L45 ${row(evolved)} | ${TY[evolved.getTypes()[0]]}/${TY[evolved.getTypes()[1]]} | ${evolved.getAbility().name}`);

  // An evolution keeps the member's ability index, so a hidden or second ability carries over as that index.
  const second = live("Dratini", DRATINI, 30, L30, { ivs: IVS, ability: "Shed Skin" });
  second.abilityIndex = 1;
  assert.equal(combatantOf({ mon: second, level: 45, species: DRAGONITE }).getAbility().name, "Multiscale");
  // A species that cannot be asked answers off its first ability, and leaves a passive it can't name unknown.
  const plain = combatantOf({ mon, level: 45, species: species(148, "Dragonair", ["Dragon"], [61, 84, 65, 70, 70, 70], 61) });
  assert.equal(plain.getAbility().name, "Shed Skin", "Dragonair's `ability1`");
  assert.equal(plain.hasPassive(), false, "unknown is neutral, never the member's own");
  assert.deepEqual(plain.stats, [123, 94, 77, 81, 81, 81], "and off its own base stats");

  // The investment the member has been fed is left behind with its own base-stat row, as a fusion's is: that row
  // answers for the species it is now, never for the one it will be.
  const fed = live("Dratini", DRATINI, 30, [85, 52, 41, 44, 44, 44], { ivs: IVS, base: [61, 64, 45, 50, 50, 50] });
  assert.deepEqual(combatantOf({ mon: fed }).stats, [85, 52, 41, 44, 44, 44], "20 base HP of Protein, while it is a Dratini");
  assert.deepEqual(combatantOf({ mon: fed, level: 45, species: DRAGONITE }).stats, evolved.stats, "and nothing of it once it is a Dragonite");

  // The member as itself, and the member as what it will be, are two duels.
  assert.notEqual(evolved.key, combatantOf({ mon, level: 45 }).key);
  assert.equal(combatantOf({ mon, level: 45, species: DRATINI }).key, combatantOf({ mon, level: 45 }).key,
    "its own species given over is no evolution at all");
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

// ---- A fusion of two halves is the mon the Splicer would make: the fused base stats, types and ability
{
  // Garchomp ← Snorlax: base stats `ceil((a + b) / 2)` stat by stat, so [134, 120, 80, 73, 98, 66], which at level 50
  // with 31 IVs and a neutral nature is the row below. Type 1 is the base's Dragon and Snorlax's only type is the
  // second, and the ability is Snorlax's Immunity (game-code.md §24).
  const FUSED_BASE = [134, 120, 80, 73, 98, 66];
  const FUSED = [209, 140, 100, 93, 118, 86];
  const ivs = [31, 31, 31, 31, 31, 31];
  const moves = [EARTHQUAKE, DRAGON_CLAW];
  const chomp = live("Garchomp", GARCHOMP, 50, [183, 150, 115, 100, 105, 122], { ivs, ability: "Sand Veil", moves });
  const lax = live("Snorlax", SNORLAX, 45, [212, 117, 77, 77, 117, 45], { ivs, ability: "Immunity", id: 2 });
  // The same pair once the player has committed the Splicer: one party member, fused, at the base's level.
  const spliced = live("Garchomp", GARCHOMP, 50, FUSED, { ivs, ability: "Immunity", moves, base: FUSED_BASE,
    types: [15, 0], fusion: SNORLAX });

  const target = combatantOf({ species: SNORLAX, level: 50, moves: [BODY_SLAM], player: false });
  const hypo = combatantOf({ mon: chomp, fuse: { mon: lax } });
  assert.deepEqual(hypo.stats, FUSED, "the fused base stats, at the base half's level");
  assert.deepEqual(hypo.getTypes(), [15, 0], "Dragon/Normal");
  assert.equal(hypo.getAbility().name, "Immunity", "the other half's ability");
  assert.equal(hypo.fusionSpecies, SNORLAX);
  assert.deepEqual(combatantOf({ mon: spliced }).stats, FUSED, "and the committed fusion computes to the same row");
  assert.equal(JSON.stringify(approxOutcomes(env, hypo, target)), JSON.stringify(approxOutcomes(env, spliced, target)),
    "the hypothetical fusion duels as the live fused mon does, move by move");
  assert.equal(JSON.stringify(approxOutcomes(env, target, hypo)), JSON.stringify(approxOutcomes(env, target, spliced)),
    "and takes the foe's the same way");
  assert.equal(hypo.key, combatantOf({ mon: spliced }).key, "so the two are one duel, and share its memo entry");
  assert.notEqual(hypo.key, combatantOf({ mon: chomp }).key, "the unfused base half is not");
  console.log(`garchomp ← snorlax ${row(hypo)} | ${TY[hypo.getTypes()[0]]}/${TY[hypo.getTypes()[1]]} | ${hypo.getAbility().name}`);

  // The other way round the halves weigh the same, and nothing else does.
  const other = combatantOf({ species: SNORLAX, level: 50, ivs, fuse: { species: GARCHOMP } });
  assert.deepEqual(other.stats, FUSED, "half of every base stat, whichever half is the base");
  assert.deepEqual(other.getTypes(), [0, 4], "Normal/Ground");
  assert.equal(other.getAbility().name, "Sand Veil");
  console.log(`snorlax ← garchomp ${row(other)} | ${TY[other.getTypes()[0]]}/${TY[other.getTypes()[1]]} | ${other.getAbility().name}`);

  // The base half keeps its level, its IVs, its nature, its moves and its passive (CONTEXT.md, `Fusion`).
  const own = live("Garchomp", GARCHOMP, 50, [183, 165, 115, 90, 105, 122], { ivs, nature: 3, moves,
    ability: "Sand Veil", passive: "Sand Force" });
  const kept = combatantOf({ mon: own, fuse: { mon: live("Snorlax", SNORLAX, 45, [212, 117, 77, 77, 117, 45], { ability: "Immunity", passive: "Early Bird", id: 2 }) } });
  assert.deepEqual(kept.stats, [209, 154, 100, 83, 118, 86], "Adamant on the fused base stats");
  assert.deepEqual(kept.moveset.map(pm => pm.moveId), moves, "the base's moveset, not the other half's");
  assert.equal(kept.getPassiveAbility().name, "Sand Force", "the base's passive stays, the other half's doesn't come");
  assert.equal(combatantOf({ mon: own, level: 60, fuse: { mon: lax } }).level, 60, "a fusion is projected like any member");

  // A form brings its own half (Heat Rotom's base stats, and the Fire it has over the base's typing).
  const heat = combatantOf({ species: GARCHOMP, level: 50, fuse: { species: ROTOM, form: 1 } });
  assert.deepEqual(heat.stats, [146, 110, 113, 105, 108, 106]);
  assert.deepEqual(heat.getTypes(), [15, 9], "Dragon/Fire");
  assert.equal(heat.getAbility().name, "Levitate", "the form's own ability");
  assert.deepEqual(heat.fusionFormIndex, 1, "and the key tells it from the other Rotom");
  assert.notEqual(heat.key, combatantOf({ species: GARCHOMP, level: 50, fuse: { species: ROTOM } }).key);
  console.log(`garchomp ← heat rotom ${row(heat)} | ${TY[heat.getTypes()[0]]}/${TY[heat.getTypes()[1]]} | ${heat.getAbility().name}`);

  // A half whose only type the base already has gives its typing away for nothing, either way round.
  const dra = combatantOf({ species: GARCHOMP, level: 50, fuse: { species: DRATINI } });
  assert.deepEqual(dra.getTypes(), [15, 4], "the base's own Ground stands as the second type");
  assert.deepEqual(combatantOf({ species: DRATINI, level: 50, fuse: { species: GARCHOMP } }).getTypes(), [15, 4], "Dragon/Ground from the other side too");
  assert.deepEqual(dra.stats, [142, 109, 82, 77, 80, 88], "off the fused base stats [75, 97, 70, 65, 68, 76]");
  assert.equal(dra.getAbility().name, "Shed Skin");
  console.log(`garchomp ← dratini ${row(dra)} | ${TY[dra.getTypes()[0]]}/${TY[dra.getTypes()[1]]} | ${dra.getAbility().name}`);

  // An ability that doesn't work fused leaves the fusion with none at all — the base's is not handed back.
  const hidden = combatantOf({ species: GARCHOMP, level: 50, fuse: { species: SNORLAX, ability: 209 } });
  assert.equal(hidden.getAbility(), null, "Disguise carries NoFusionAbilityAbAttr");
  const disguised = live("Dratini", DRATINI, 30, [73, 52, 41, 44, 44, 44], { ability: "Disguise", abilityAttrs: NO_FUSION, id: 3 });
  assert.equal(combatantOf({ mon: chomp, fuse: { mon: disguised } }).getAbility(), null, "off a live half as well");
  assert.equal(combatantOf({ species: GARCHOMP, level: 50, fuse: { species: SNORLAX }, ability: 5 }).getAbility().name, "Sturdy",
    "an ability given outright still wins");

  // A fusion's attrs answer by name: its ability is the other half's and its passive the base's, so neither member
  // alone can be asked.
  const sturdy = live("Snorlax", SNORLAX, 45, [212, 117, 77, 77, 117, 45], { ability: "Sturdy", attrs: ["PreDefendFullHpEndureAbAttr"], id: 2 });
  assert.equal(combatantOf({ mon: chomp, fuse: { mon: sturdy } }).hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true, "a fused Sturdy endures");
  assert.equal(combatantOf({ mon: chomp, fuse: { mon: lax } }).hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), false,
    "and the base half's own attrs are gone with its ability");

  // Nothing to fuse, and nothing that may be fused.
  assert.equal(combatantOf({ level: 50, fuse: { species: SNORLAX } }), null, "no base half");
  assert.equal(combatantOf({ species: GARCHOMP, level: 50, fuse: {} }), null, "no other half");
  assert.equal(combatantOf({ mon: spliced, fuse: { species: DRATINI } }), null, "the Splicer's filter refuses a fusion");
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

// ---- A stat row given outright is the combatant's own, there being no species to compute one from
{
  // What a preview row hands over (#574): the stats the game itself left on the mon, `Stat`-indexed, and move ids.
  const ROW = [238, 115, 116, 117, 118, 119];
  const c = combatantOf({ name: "Garchomp", stats: ROW, level: 94, types: [15, 4], ability: 8,
    moves: [EARTHQUAKE, DRAGON_CLAW], player: false });
  assert.deepEqual(c.stats, ROW, "the row as given, never recomputed");
  assert.equal(c.getMaxHp(), 238, "`Stat.HP`'s entry is the max HP");
  assert.equal(c.hp, 238, "and it stands at full health");
  assert.equal(c.species, null, "with no species behind it");
  assert.deepEqual(c.getTypes(), [15, 4]);
  assert.equal(c.getAbility().name, "Sand Veil");
  assert.deepEqual(c.moveset.map(pm => pm.moveId), [EARTHQUAKE, DRAGON_CLAW]);

  // It duels exactly as the live mon whose row it is.
  const mon = live("Garchomp", GARCHOMP, 94, ROW, { ability: "Sand Veil", moves: [EARTHQUAKE, DRAGON_CLAW], player: false });
  const target = combatantOf({ species: SNORLAX, level: 94, moves: [BODY_SLAM] });
  assert.equal(JSON.stringify(approxOutcomes(env, c, target)), JSON.stringify(approxOutcomes(env, mon, target)), "ours, move by move");
  assert.equal(JSON.stringify(approxOutcomes(env, target, c)), JSON.stringify(approxOutcomes(env, target, mon)), "and the foe's into it");
  console.log(`given row L94 ${row(c)} | ${shown(duel(c, target))}`);

  // The row wins over everything a stat is otherwise computed from, and anything short of six numbers is no row.
  assert.deepEqual(combatantOf({ species: GARCHOMP, level: 50, ivs: [31, 31, 31, 31, 31, 31], stats: ROW }).stats, ROW);
  assert.deepEqual(combatantOf({ stats: [1, 2, 3, 4, 5] }), null, "five numbers are no stat row");
  assert.deepEqual(combatantOf({ stats: [1, 2, 3, 4, 5, null] }), null, "nor is a gap in one");
  assert.equal(combatantOf({ stats: ROW, hp: 100 }).hp, 100, "health still stands where it is put");
  assert.equal(combatantOf({ stats: [0, 0, 0, 0, 0, 0] }).getMaxHp(), 1, "and max HP has the same floor of 1");
  assert.notEqual(c.key, combatantOf({ name: "Garchomp", stats: [238, 115, 116, 117, 118, 120], level: 94,
    types: [15, 4], ability: 8, moves: [EARTHQUAKE, DRAGON_CLAW], player: false }).key, "a row apart is a duel apart");
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
