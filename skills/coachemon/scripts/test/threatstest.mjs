// The standard threats, built against a species table stood in for the game's: real species, real types and real base
// stats, each one a species the randbats snapshot in the bundle actually lists, so the pick below is the join the HUD
// does in the page. What is not real is the move table: every move the snapshot names is given here, and only whether
// it damages is — which is all the pick reads it for, the four slots going to the moves the duel can score.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const STATUS = 2; // the game's `MoveCategory.STATUS`, which is all the pick asks a move about

// `[speciesId, name, types, baseStats, ability1?]`, by the game's own species ids — which order the pool, and so break
// every tie in the pick.
const DEX = [
  [3, "Venusaur", ["Grass", "Poison"], [80, 82, 83, 100, 100, 80]],
  [12, "Butterfree", ["Bug", "Flying"], [60, 45, 50, 90, 80, 70]],
  [15, "Beedrill", ["Bug", "Poison"], [65, 90, 40, 45, 80, 75]],
  [18, "Pidgeot", ["Normal", "Flying"], [83, 80, 75, 70, 70, 101]],
  [20, "Raticate", ["Normal"], [55, 81, 60, 50, 70, 97]],
  [22, "Fearow", ["Normal", "Flying"], [65, 90, 65, 61, 61, 100]],
  [24, "Arbok", ["Poison"], [60, 95, 69, 65, 79, 80]],
  [28, "Sandslash", ["Ground"], [75, 100, 110, 45, 55, 65]],
  [31, "Nidoqueen", ["Poison", "Ground"], [90, 92, 87, 75, 85, 76]],
  [36, "Clefable", ["Fairy"], [95, 70, 73, 95, 90, 60]],
  [38, "Ninetales", ["Fire"], [73, 76, 75, 81, 100, 100]],
  [51, "Dugtrio", ["Ground"], [35, 100, 50, 50, 70, 120]],
  [53, "Persian", ["Normal"], [65, 70, 60, 65, 65, 115]],
  [55, "Golduck", ["Water", "Psychic"], [80, 82, 78, 95, 80, 85]],
  [59, "Arcanine", ["Fire"], [90, 110, 80, 100, 80, 95]],
  [65, "Alakazam", ["Psychic"], [55, 50, 45, 135, 95, 120]],
  [68, "Machamp", ["Fighting"], [90, 130, 80, 65, 85, 55]],
  [71, "Victreebel", ["Grass", "Poison"], [80, 105, 65, 100, 70, 70]],
  [73, "Tentacruel", ["Water", "Poison"], [80, 70, 65, 80, 120, 100]],
  [76, "Golem", ["Rock", "Ground"], [80, 120, 130, 55, 65, 45]],
  [78, "Rapidash", ["Fire"], [65, 100, 70, 80, 80, 105]],
  [87, "Dewgong", ["Water", "Ice"], [90, 70, 80, 70, 95, 70]],
  [89, "Muk", ["Poison"], [105, 105, 75, 65, 100, 50]],
  [91, "Cloyster", ["Water", "Ice"], [50, 95, 180, 85, 45, 70]],
  [94, "Gengar", ["Ghost", "Poison"], [60, 65, 60, 130, 75, 110], 26],
  [97, "Hypno", ["Psychic"], [85, 73, 70, 73, 115, 67]],
  [99, "Kingler", ["Water"], [55, 130, 115, 50, 50, 75]],
  [101, "Electrode", ["Electric"], [60, 50, 70, 80, 80, 150]],
  [103, "Exeggutor", ["Grass", "Psychic"], [95, 95, 85, 125, 75, 55]],
  [105, "Marowak", ["Ground"], [60, 80, 110, 50, 80, 45]],
  [110, "Weezing", ["Poison"], [65, 90, 120, 85, 70, 60]],
  [119, "Seaking", ["Water"], [80, 92, 65, 65, 80, 68]],
  [121, "Starmie", ["Water", "Psychic"], [60, 75, 85, 100, 85, 115]],
  [124, "Jynx", ["Ice", "Psychic"], [65, 50, 35, 115, 95, 95]],
  [130, "Gyarados", ["Water", "Flying"], [95, 125, 79, 60, 100, 81]],
  [131, "Lapras", ["Water", "Ice"], [130, 85, 80, 85, 95, 60]],
  [134, "Vaporeon", ["Water"], [130, 65, 60, 110, 95, 65]],
  [135, "Jolteon", ["Electric"], [65, 65, 60, 110, 95, 130], 10],
  [136, "Flareon", ["Fire"], [65, 130, 60, 95, 110, 65]],
  [142, "Aerodactyl", ["Rock", "Flying"], [80, 105, 65, 60, 75, 130]],
  [143, "Snorlax", ["Normal"], [160, 110, 65, 65, 110, 30], 17],
  [149, "Dragonite", ["Dragon", "Flying"], [91, 134, 95, 100, 100, 80]],
  [169, "Crobat", ["Poison", "Flying"], [85, 90, 80, 70, 80, 130]],
  [181, "Ampharos", ["Electric"], [90, 75, 85, 115, 90, 55]],
  [197, "Umbreon", ["Dark"], [95, 65, 110, 60, 130, 65]],
  [205, "Forretress", ["Bug", "Steel"], [75, 90, 140, 60, 60, 40]],
  [208, "Steelix", ["Steel", "Ground"], [75, 85, 200, 55, 65, 30]],
  [210, "Granbull", ["Fairy"], [90, 120, 75, 60, 60, 45]],
  [212, "Scizor", ["Bug", "Steel"], [70, 130, 100, 55, 80, 65]],
  [213, "Shuckle", ["Bug", "Rock"], [20, 10, 230, 10, 230, 5]],
  [214, "Heracross", ["Bug", "Fighting"], [80, 125, 75, 40, 95, 85]],
  [225, "Delibird", ["Ice", "Flying"], [45, 55, 45, 65, 45, 75]],
  [227, "Skarmory", ["Steel", "Flying"], [65, 80, 140, 40, 70, 70], 5],
  [229, "Houndoom", ["Dark", "Fire"], [75, 90, 50, 110, 80, 95]],
  [230, "Kingdra", ["Water", "Dragon"], [75, 95, 95, 95, 95, 85]],
  [232, "Donphan", ["Ground"], [90, 120, 120, 60, 60, 50]],
  [241, "Miltank", ["Normal"], [95, 80, 105, 40, 70, 100]],
  [242, "Blissey", ["Normal"], [255, 10, 10, 75, 135, 55]],
  [248, "Tyranitar", ["Rock", "Dark"], [100, 134, 110, 95, 100, 61]],
  [286, "Breloom", ["Grass", "Fighting"], [60, 130, 80, 60, 60, 70]],
  [292, "Shedinja", ["Bug", "Ghost"], [1, 90, 45, 30, 30, 40]],
  [297, "Hariyama", ["Fighting"], [144, 120, 60, 40, 60, 50]],
  [302, "Sableye", ["Dark", "Ghost"], [50, 75, 75, 65, 65, 50]],
  [303, "Mawile", ["Steel", "Fairy"], [50, 85, 85, 55, 55, 50]],
  [306, "Aggron", ["Steel", "Rock"], [70, 110, 180, 60, 60, 50]],
  [330, "Flygon", ["Ground", "Dragon"], [80, 100, 80, 80, 80, 100]],
  [334, "Altaria", ["Dragon", "Flying"], [75, 70, 90, 70, 105, 80]],
  [350, "Milotic", ["Water"], [95, 60, 79, 100, 125, 81]],
  [373, "Salamence", ["Dragon", "Flying"], [95, 135, 80, 110, 80, 100]],
  [376, "Metagross", ["Steel", "Psychic"], [80, 135, 130, 95, 90, 70]],
  [426, "Drifblim", ["Ghost", "Flying"], [150, 80, 44, 90, 54, 80]],
  [429, "Mismagius", ["Ghost"], [60, 60, 60, 105, 105, 105]],
  [430, "Honchkrow", ["Dark", "Flying"], [100, 125, 52, 105, 52, 71]],
  [437, "Bronzong", ["Steel", "Psychic"], [67, 89, 116, 79, 116, 33]],
  [445, "Garchomp", ["Dragon", "Ground"], [108, 130, 95, 80, 85, 102]],
  [448, "Lucario", ["Fighting", "Steel"], [70, 110, 70, 115, 70, 90]],
  [461, "Weavile", ["Dark", "Ice"], [70, 120, 65, 45, 85, 125]],
  [462, "Magnezone", ["Electric", "Steel"], [70, 70, 115, 130, 90, 60]],
  [463, "Lickilicky", ["Normal"], [110, 85, 95, 80, 95, 50]],
  [464, "Rhyperior", ["Ground", "Rock"], [115, 140, 130, 55, 55, 40]],
  [465, "Tangrowth", ["Grass"], [100, 100, 125, 110, 50, 50]],
  [466, "Electivire", ["Electric"], [75, 123, 67, 95, 85, 95]],
  [467, "Magmortar", ["Fire"], [75, 95, 67, 125, 95, 83]],
  [468, "Togekiss", ["Fairy", "Flying"], [85, 50, 95, 120, 115, 80]],
  [472, "Gliscor", ["Ground", "Flying"], [75, 95, 125, 45, 75, 95]],
  [473, "Mamoswine", ["Ice", "Ground"], [110, 130, 80, 70, 60, 80]],
  [477, "Dusknoir", ["Ghost"], [45, 100, 135, 65, 135, 45]],
  [478, "Froslass", ["Ice", "Ghost"], [70, 80, 70, 80, 70, 110]],
  [530, "Excadrill", ["Ground", "Steel"], [110, 135, 60, 50, 65, 88]],
  [534, "Conkeldurr", ["Fighting"], [105, 140, 95, 55, 65, 45]],
  [598, "Ferrothorn", ["Grass", "Steel"], [74, 94, 131, 54, 116, 20]],
  [609, "Chandelure", ["Ghost", "Fire"], [60, 55, 90, 145, 90, 80]],
  [612, "Haxorus", ["Dragon"], [76, 147, 90, 60, 70, 97]],
  [635, "Hydreigon", ["Dark", "Dragon"], [92, 105, 90, 125, 90, 98]],
  [637, "Volcarona", ["Bug", "Fire"], [85, 60, 65, 135, 105, 100]],
];
const SPECIES_BY_ID = new Map(DEX.map(([id, name, types, baseStats, ability1]) => [id, {
  speciesId: id, name, baseStats, baseTotal: baseStats.reduce((t, x) => t + x, 0), ability1,
  type1: TY.indexOf(types[0]), type2: types[1] == null ? null : TY.indexOf(types[1]),
  getName: () => name, getRootSpeciesId: () => id, getEvolutionLevels: () => [],
}]));
// The game's registry, as `04-game-tables` finds it. Deliberately not in id order: the pool is what sorts the pick.
const SPECIES = {
  getSpecies: id => SPECIES_BY_ID.get(id) ?? null,
  getAllSpecies: () => [...SPECIES_BY_ID.values()].reverse(),
};
// The abilities the species above name, by id, as the game's own table is.
const ABILITIES = [];
for (const [id, name] of [[5, "Sturdy"], [10, "Volt Absorb"], [17, "Immunity"], [26, "Levitate"]]) ABILITIES[id] = { name, attrs: [] };

const scene = { modifiers: [], enemyModifiers: [], gameMode: {}, currentBattle: { waveIndex: 44 },
  seed: "seed-1", arena: { biomeId: 3 }, getPlayerParty: () => [], getEnemyParty: () => [],
  game: { config: { gameVersion: "1.12.0.11" } } };
// The same run, under a game mode the calendar can read: every tenth wave is a boss, so the next big fight ahead of
// wave 44 is wave 50.
const BOSS_SCENE = { ...scene, seed: "seed-3", gameMode: { isBoss: w => w % 10 === 0, isFixedBattle: () => false } };
let draws = 0, sets = 0;
globalThis.window = globalThis;
globalThis.Phaser = {
  Math: { RND: { _s: "!rnd,live",
    state(v) { if (v !== undefined) { sets++; this._s = v; } return this._s; },
    integerInRange() { draws++; return 0; }, realInRange() { draws++; return 0; }, frac() { draws++; return 0; },
    pick(a) { draws++; return a[0]; }, shuffle(a) { draws++; return a; } } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } },
};
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {}, appendChild() {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { ARCHETYPES, BAND, bandAt, standardThreats } = globalThis.__hud["11-threats"];
const { RANDBATS } = globalThis.__hud["05-randbats"];
const { levelCapAt } = globalThis.__hud["09-projection"];
const { readRun } = globalThis.__hud["26-run"];
const { sandboxBreachCount } = globalThis.__hud["01-core"];
const setTables = t => globalThis.__hud["04-game-tables"].setGameTables(t);

// Every move the snapshot names, in its own order, from id 1. A move is either a status move — these, by name, are the
// snapshot's — or an attack of 80 power, since the only thing asked of the table here is which of the two a move is.
// The six that work their own damage out carry the game's power of −1, which is an attack all the same.
const STATUS_MOVES = ["Agility", "Aurora Veil", "Belly Drum", "Bulk Up", "Calm Mind", "Coil", "Cosmic Power", "Curse",
  "Defog", "Destiny Bond", "Dragon Dance", "Encore", "Glare", "Haze", "Heal Bell", "Hone Claws", "Hypnosis",
  "Iron Defense", "Leech Seed", "Lovely Kiss", "Milk Drink", "Moonlight", "Morning Sun", "Nasty Plot", "Pain Split",
  "Protect", "Quiver Dance", "Rapid Spin", "Recover", "Rest", "Roar", "Rock Polish", "Roost", "Shell Smash",
  "Sleep Powder", "Sleep Talk", "Snowscape", "Soft-Boiled", "Spikes", "Spore", "Stealth Rock", "Sticky Web",
  "Strength Sap", "Substitute", "Swords Dance", "Synthesis", "Taunt", "Thunder Wave", "Toxic", "Toxic Spikes",
  "Trick", "Trick Room", "Will-O-Wisp", "Wish"];
const STATUS_SET = new Set(STATUS_MOVES);
const SELF_POWERED = new Set(["Counter", "Grass Knot", "Gyro Ball", "Low Kick", "Seismic Toss", "Super Fang"]);
const MOVES = [null];
for (const name of RANDBATS.m) {
  const status = STATUS_SET.has(name);
  MOVES.push({ id: MOVES.length, name, type: 0, power: status ? 0 : SELF_POWERED.has(name) ? -1 : 80,
    accuracy: 100, category: status ? STATUS : 0, pp: 10, moveTarget: 3, priority: 0, flags: 0, attrs: [] });
}
assert.deepEqual(STATUS_MOVES.filter(name => RANDBATS.m.includes(name)), STATUS_MOVES,
  "every status move named above is one the snapshot's sets actually use");

const rndBefore = Phaser.Math.RND.state();
const [drawsBefore, setsBefore] = [draws, sets];
const threatsAt = fight => readRun(scene, run => standardThreats(run, { fight }));
const moveNames = t => t.combatant.moveset.map(pm => pm.getName()).join(", ");
const show = t => `  ${t.label.padEnd(14)} ${t.name.padEnd(11)} BST ${String(t.bst).padStart(3)}`
  + ` ${t.combatant.getTypes().map(x => TY[x]).join("/").padEnd(15)} ${t.combatant.stats.join("/").padEnd(27)} ${moveNames(t)}`;
const print = set => {
  console.log(`== wave ${set.wave}: level ${set.level}, band ${set.band.centre} ±${BAND.half} (${set.band.min}–${set.band.max})`);
  for (const t of set.threats) console.log(show(t));
};

// ---- Before the game's tables land there is nothing to join, and the miss is not kept
{
  setTables(null);
  const none = threatsAt(70);
  assert.deepEqual(none.threats, [], "no species table, no threats");
  assert.ok(none.unavailable, "and it says why");
  assert.equal(none.level, 56, "the fight's level is the wave's either way");
  console.log(`unavailable: ${none.unavailable}`);
  setTables({ species: SPECIES, moves: MOVES, abilities: ABILITIES });
  assert.equal(threatsAt(70).threats.length, TY.length + ARCHETYPES.length, "the read after the tables land asks again");
}

// ---- The set at several waves: eighteen types and four shapes, out of the band the wave asks for
for (const fight of [10, 30, 50, 70, 100, 150]) {
  const set = threatsAt(fight);
  print(set);
  assert.deepEqual(set.threats.filter(t => t.kind === "type").map(t => t.label), TY, `wave ${fight}: every type, in order`);
  assert.deepEqual(set.threats.filter(t => t.kind === "archetype").map(t => t.label), ARCHETYPES.map(a => a[0]),
    `wave ${fight}: the four shapes, in order`);
  assert.equal(new Set(set.threats.map(t => t.species.speciesId)).size, set.threats.length,
    `wave ${fight}: no species stands twice in the set`);
  for (const t of set.threats) {
    assert.equal(t.combatant.level, set.level, "every threat stands at the fight's level");
    assert.equal(t.combatant.isPlayer(), false, "and on the other side");
    assert.ok(t.combatant.moveset.length > 0 && t.combatant.moveset.length <= 4, "with four slots at the most");
    assert.equal(t.key, t.combatant.key, "keyed by the duel it is, so a pair score memoises on it");
  }
  assert.equal(set.confidence, "exact", "a snapshot joined with a table cannot drift");
}

// ---- A type threat is the species of that type nearest the band's centre, a shape the band's best at a pair of stats
{
  const set = threatsAt(70);
  const byLabel = new Map(set.threats.map(t => [t.label, t]));
  assert.equal(set.band.centre, 500, "wave 70 is two thirds of the way from the first boss wave to the century");
  assert.equal(set.level, 56, "and the level cap there is about that wave's boss");
  for (const label of ["Electric", "Steel", "Normal"]) {
    assert.equal(byLabel.get(label).kind, "type");
    assert.ok(byLabel.get(label).combatant.getTypes().includes(TY.indexOf(label)), `the ${label} threat is ${label}`);
    assert.ok(Math.abs(byLabel.get(label).bst - 500) <= BAND.half, `and sits in the band: ${byLabel.get(label).bst}`);
  }
  assert.equal(byLabel.get("Steel").name, "Bronzong", "500, the Steel species the fixture sits on the centre");
  const steel = threatsAt(50).threats.find(t => t.label === "Steel");
  assert.equal(steel.name, "Skarmory", "a band of 433 reaches a lighter Steel");
  assert.equal(steel.combatant.getAbility().name, "Sturdy");
  assert.equal(steel.combatant.hasAbilityWithAttr("PreDefendFullHpEndureAbAttr"), true,
    "and it brings the attr the duel asks Sturdy for");
}

// ---- A type whose species are all heavier than the wave asks stands at its lightest, rather than dropping out
{
  const early = threatsAt(10), late = threatsAt(150);
  assert.equal(early.band.centre, BAND.bst[0], "wave 10 is the band's first anchor");
  assert.equal(late.band.centre, BAND.bst[1], "and the centre stands still past the century");
  assert.equal(early.level, 10, "the cap on wave 10");
  const dragon = s => s.threats.find(t => t.label === "Dragon");
  assert.ok(dragon(early).bst > early.band.max, `the lightest Dragon is heavier than wave 10 asks: ${dragon(early).bst}`);
  assert.notEqual(dragon(early).name, dragon(late).name, "and a later band reaches a heavier one");
}

// ---- The pick is the wave's, and the run read builds it once
{
  const a = threatsAt(70), b = threatsAt(70);
  assert.equal(a, b, "the same wave in one run key is the same set, memoised");
  const fresh = readRun({ ...scene, seed: "seed-2" }, run => standardThreats(run, { fight: 70 }));
  assert.notEqual(fresh, a, "another run key builds its own");
  assert.deepEqual(fresh.threats.map(t => t.key), a.threats.map(t => t.key),
    "to the same answer, the wave being all the pick reads");
  assert.notEqual(threatsAt(100).threats.map(t => t.name).join(), a.threats.map(t => t.name).join(),
    "and another wave is another set");
  const next = readRun(BOSS_SCENE, run => standardThreats(run));
  assert.equal(next.wave, 50, "the next big fight ahead of wave 44");
  assert.deepEqual(next.threats.map(t => t.key), threatsAt(50).threats.map(t => t.key), "which is the wave 50 set");
  console.log(`next big fight: wave ${next.wave}, level ${next.level}, band ${next.band.centre}`);
  // A game mode the calendar can't read yet answers no fight at all, and then the wave the run stands on asks.
  const here = readRun(scene, run => standardThreats(run));
  assert.equal(here.wave, 44);
  assert.equal(here.level, levelCapAt(scene, 44));
  console.log(`no fight: wave ${here.wave}, level ${here.level}, band ${here.band.centre}, ${here.threats.length} threats`);
}

// ---- The band's own arithmetic
{
  assert.deepEqual(bandAt(10), { centre: 300, min: 240, max: 360 });
  assert.deepEqual(bandAt(1), bandAt(10), "a wave before the first anchor is the first anchor");
  assert.deepEqual(bandAt(55), { centre: 450, min: 390, max: 510 });
  assert.deepEqual(bandAt(100), { centre: 600, min: 540, max: 660 });
  assert.deepEqual(bandAt(200), bandAt(100), "and nothing past the century climbs further");
  console.log(`band by wave: ${[10, 30, 50, 70, 100, 150].map(w => `w${w} ${bandAt(w).centre}`).join("  ")}`);
}

// ---- Picking the threats draws nothing and breaches nothing
assert.equal(draws - drawsBefore, 0, "the run's RNG was never asked");
assert.equal(Phaser.Math.RND.state(), rndBefore, "and its stream stands where it stood");
assert.ok(sets - setsBefore > 0, "the run read's sandbox put it back, which is the only write to it");
assert.equal(sandboxBreachCount(), 0);
assert.equal(globalThis.__coachHud.stats().breaches, 0);

console.log("threats: ok");
