// Judging a newcomer by what the party is worth against the standard threats (#578). The threat side is the real
// join the HUD does in the page — real species with real base stats, every one of them a species the randbats
// snapshot lists, and their four slots the snapshot's own set — while the moves those slots name are given a real
// type, power, category and priority here, which is what a duel reads them for. The *party* side is the fixture's
// own: real species with their real rows, deliberately outside the registry below, so no member of ours can be
// drawn as a threat against itself.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { mon, species, TY } from "./fixtures/party.mjs";

const STATUS = 2; // the game's `MoveCategory.STATUS`
const SINGLE_TYPE = 1, LIMITED_SUPPORT = 8, HARDCORE = 9; // `Challenges`, which only the bundle's prelude holds

// `[speciesId, name, types, baseStats]`, by the game's own species ids — which order the pool, and so break every
// tie in the pick. Magikarp is the one species here the snapshot files under what it evolves into, so it never
// reaches the pool: it is in the registry for the evolution a projection walks, and nothing else.
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
  [94, "Gengar", ["Ghost", "Poison"], [60, 65, 60, 130, 75, 110]],
  [97, "Hypno", ["Psychic"], [85, 73, 70, 73, 115, 67]],
  [99, "Kingler", ["Water"], [55, 130, 115, 50, 50, 75]],
  [101, "Electrode", ["Electric"], [60, 50, 70, 80, 80, 150]],
  [103, "Exeggutor", ["Grass", "Psychic"], [95, 95, 85, 125, 75, 55]],
  [105, "Marowak", ["Ground"], [60, 80, 110, 50, 80, 45]],
  [110, "Weezing", ["Poison"], [65, 90, 120, 85, 70, 60]],
  [119, "Seaking", ["Water"], [80, 92, 65, 65, 80, 68]],
  [121, "Starmie", ["Water", "Psychic"], [60, 75, 85, 100, 85, 115]],
  [124, "Jynx", ["Ice", "Psychic"], [65, 50, 35, 115, 95, 95]],
  [129, "Magikarp", ["Water"], [20, 10, 55, 15, 20, 80]],
  [130, "Gyarados", ["Water", "Flying"], [95, 125, 79, 60, 100, 81]],
  [131, "Lapras", ["Water", "Ice"], [130, 85, 80, 85, 95, 60]],
  [134, "Vaporeon", ["Water"], [130, 65, 60, 110, 95, 65]],
  [135, "Jolteon", ["Electric"], [65, 65, 60, 110, 95, 130]],
  [136, "Flareon", ["Fire"], [65, 130, 60, 95, 110, 65]],
  [142, "Aerodactyl", ["Rock", "Flying"], [80, 105, 65, 60, 75, 130]],
  [143, "Snorlax", ["Normal"], [160, 110, 65, 65, 110, 30]],
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
  [227, "Skarmory", ["Steel", "Flying"], [65, 80, 140, 40, 70, 70]],
  [229, "Houndoom", ["Dark", "Fire"], [75, 90, 50, 110, 80, 95]],
  [230, "Kingdra", ["Water", "Dragon"], [75, 95, 95, 95, 95, 85]],
  [232, "Donphan", ["Ground"], [90, 120, 120, 60, 60, 50]],
  [241, "Miltank", ["Normal"], [95, 80, 105, 40, 70, 100]],
  [242, "Blissey", ["Normal"], [255, 10, 10, 75, 135, 55]],
  [248, "Tyranitar", ["Rock", "Dark"], [100, 134, 110, 95, 100, 61]],
  [286, "Breloom", ["Grass", "Fighting"], [60, 130, 80, 60, 60, 70]],
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
// The one line a projection walks here: level 20, no item and no condition, so the coach can read that it lands.
const EVOS = { 129: [{ speciesId: 130, level: 20 }] };
const sum = xs => xs.reduce((t, x) => t + x, 0);
const SPECIES_BY_ID = new Map(DEX.map(([id, name, types, base]) =>
  [id, species(id, name, types, sum(base), { base, evos: (EVOS[id] ?? []).map(e => [e.speciesId, e.level]) })]));
// The game's registry, as `04-game-tables` finds it. Deliberately not in id order: the pool is what sorts the pick.
const SPECIES = {
  getSpecies: id => SPECIES_BY_ID.get(id) ?? null,
  getAllSpecies: () => [...SPECIES_BY_ID.values()].reverse(),
  getEvolutions: id => EVOS[id] ?? [],
};
const ABILITIES = [];

// ---- The move table the game's own stands in for.
// Every move the snapshot names is in it, from id 1, because a set indexes it. A status move — these, by name, are
// the snapshot's — carries no power; everything else is an attack, and one a threat actually brings is given its own
// type, power, category and priority below, since that is what the duel scores. The assertion under `MOVES` holds
// the table to that: a move any threat carries and this file has not typed fails the test rather than duelling as a
// Normal 80.
const STATUS_MOVES = ["Agility", "Aurora Veil", "Belly Drum", "Bulk Up", "Calm Mind", "Coil", "Cosmic Power", "Curse",
  "Defog", "Destiny Bond", "Dragon Dance", "Encore", "Glare", "Haze", "Heal Bell", "Hone Claws", "Hypnosis",
  "Iron Defense", "Leech Seed", "Lovely Kiss", "Milk Drink", "Moonlight", "Morning Sun", "Nasty Plot", "Pain Split",
  "Protect", "Quiver Dance", "Rapid Spin", "Recover", "Rest", "Roar", "Rock Polish", "Roost", "Shell Smash",
  "Sleep Powder", "Sleep Talk", "Snowscape", "Soft-Boiled", "Spikes", "Spore", "Stealth Rock", "Sticky Web",
  "Strength Sap", "Substitute", "Swords Dance", "Synthesis", "Taunt", "Thunder Wave", "Toxic", "Toxic Spikes",
  "Trick", "Trick Room", "Will-O-Wisp", "Wish"];
// `name: [type, power, category, priority]`. The six moves the game prices from the situation carry its own power of
// −1, which the duel reads as an attack it cannot score.
const FACTS = {
  "Accelerock": ["Rock", 40, "P", 1], "Aerial Ace": ["Flying", 60, "P"], "Air Slash": ["Flying", 75, "S"],
  "Ancient Power": ["Rock", 60, "S"], "Aqua Jet": ["Water", 40, "P", 1], "Aqua Tail": ["Water", 90, "P"],
  "Aura Sphere": ["Fighting", 80, "S"], "Avalanche": ["Ice", 60, "P", -4], "Beat Up": ["Dark", 10, "P"],
  "Bite": ["Dark", 60, "P"], "Blizzard": ["Ice", 110, "S"], "Body Press": ["Fighting", 80, "P"],
  "Body Slam": ["Normal", 85, "P"], "Boomburst": ["Normal", 140, "S"], "Brave Bird": ["Flying", 120, "P"],
  "Brick Break": ["Fighting", 75, "P"], "Bug Bite": ["Bug", 60, "P"], "Bug Buzz": ["Bug", 90, "S"],
  "Bullet Punch": ["Steel", 40, "P", 1], "Bullet Seed": ["Grass", 25, "P"], "Close Combat": ["Fighting", 120, "P"],
  "Crabhammer": ["Water", 100, "P"], "Cross Chop": ["Fighting", 100, "P"], "Crunch": ["Dark", 80, "P"],
  "Dark Pulse": ["Dark", 80, "S"], "Dazzling Gleam": ["Fairy", 80, "S"], "Discharge": ["Electric", 80, "S"],
  "Double-Edge": ["Normal", 120, "P"], "Draco Meteor": ["Dragon", 130, "S"], "Dragon Claw": ["Dragon", 80, "P"],
  "Dragon Darts": ["Dragon", 50, "P"], "Dragon Pulse": ["Dragon", 85, "S"], "Dragon Tail": ["Dragon", 60, "P", -6],
  "Drain Punch": ["Fighting", 75, "P"], "Drill Peck": ["Flying", 80, "P"], "Drill Run": ["Ground", 80, "P"],
  "Dual Wingbeat": ["Flying", 40, "P"], "Earth Power": ["Ground", 90, "S"], "Earthquake": ["Ground", 100, "P"],
  "Energy Ball": ["Grass", 90, "S"], "Explosion": ["Normal", 250, "P"], "Extreme Speed": ["Normal", 80, "P", 2],
  "Facade": ["Normal", 70, "P"], "Fake Out": ["Normal", 40, "P", 3], "Fire Blast": ["Fire", 110, "S"],
  "Fire Fang": ["Fire", 65, "P"], "Fire Punch": ["Fire", 75, "P"], "First Impression": ["Bug", 90, "P", 2],
  "Flamethrower": ["Fire", 90, "S"], "Flare Blitz": ["Fire", 120, "P"], "Flash Cannon": ["Steel", 80, "S"],
  "Flip Turn": ["Water", 60, "P"], "Focus Blast": ["Fighting", 120, "S"], "Foul Play": ["Dark", 95, "P"],
  "Freeze-Dry": ["Ice", 70, "S"], "Giga Drain": ["Grass", 75, "S"], "Grass Knot": ["Grass", -1, "S"],
  "Gunk Shot": ["Poison", 120, "P"], "Gyro Ball": ["Steel", -1, "P"], "Head Smash": ["Rock", 150, "P"],
  "Headbutt": ["Normal", 70, "P"], "Heat Wave": ["Fire", 95, "S"], "Heavy Slam": ["Steel", -1, "P"],
  "Hex": ["Ghost", 65, "S"], "High Horsepower": ["Ground", 95, "P"], "High Jump Kick": ["Fighting", 130, "P"],
  "Hurricane": ["Flying", 110, "S"], "Hydro Pump": ["Water", 110, "S"], "Hyper Voice": ["Normal", 90, "S"],
  "Ice Beam": ["Ice", 90, "S"], "Ice Fang": ["Ice", 65, "P"], "Ice Punch": ["Ice", 75, "P"],
  "Ice Shard": ["Ice", 40, "P", 1], "Ice Spinner": ["Ice", 80, "P"], "Icicle Crash": ["Ice", 85, "P"],
  "Icicle Spear": ["Ice", 25, "P"], "Icy Wind": ["Ice", 55, "S"], "Iron Head": ["Steel", 80, "P"],
  "Judgment": ["Normal", 100, "S"], "Knock Off": ["Dark", 65, "P"], "Leaf Blade": ["Grass", 90, "P"],
  "Leaf Storm": ["Grass", 130, "S"], "Leech Life": ["Bug", 80, "P"], "Liquidation": ["Water", 85, "P"],
  "Low Kick": ["Fighting", -1, "P"], "Mach Punch": ["Fighting", 40, "P", 1], "Megahorn": ["Bug", 120, "P"],
  "Meteor Beam": ["Rock", 120, "S"], "Mirror Coat": ["Psychic", -1, "S"], "Moonblast": ["Fairy", 95, "S"],
  "Mud Shot": ["Ground", 55, "S"], "Muddy Water": ["Water", 90, "S"], "Night Shade": ["Ghost", -1, "S"],
  "Night Slash": ["Dark", 70, "P"], "Outrage": ["Dragon", 120, "P"], "Overheat": ["Fire", 130, "S"],
  "Petal Blizzard": ["Grass", 90, "P"], "Play Rough": ["Fairy", 90, "P"], "Poison Jab": ["Poison", 80, "P"],
  "Poltergeist": ["Ghost", 110, "P"], "Power Gem": ["Rock", 80, "S"], "Power Whip": ["Grass", 120, "P"],
  "Psychic": ["Psychic", 90, "S"], "Psychic Fangs": ["Psychic", 85, "P"], "Psychic Noise": ["Psychic", 75, "S"],
  "Psycho Cut": ["Psychic", 70, "P"], "Psyshock": ["Psychic", 80, "S"], "Pursuit": ["Dark", 40, "P"],
  "Quick Attack": ["Normal", 40, "P", 1], "Rage Fist": ["Ghost", 50, "P"], "Return": ["Normal", 102, "P"],
  "Rock Blast": ["Rock", 25, "P"], "Rock Slide": ["Rock", 75, "P"], "Rock Tomb": ["Rock", 60, "P"],
  "Scald": ["Water", 80, "S"], "Scale Shot": ["Dragon", 25, "P"], "Seed Bomb": ["Grass", 80, "P"],
  "Seismic Toss": ["Fighting", -1, "P"], "Shadow Ball": ["Ghost", 80, "S"], "Shadow Claw": ["Ghost", 70, "P"],
  "Shadow Sneak": ["Ghost", 40, "P", 1], "Sludge Bomb": ["Poison", 90, "S"], "Sludge Wave": ["Poison", 95, "S"],
  "Spirit Shackle": ["Ghost", 80, "P"], "Stomping Tantrum": ["Ground", 75, "P"], "Stone Edge": ["Rock", 100, "P"],
  "Stored Power": ["Psychic", 20, "S"], "Sucker Punch": ["Dark", 70, "P", 1], "Super Fang": ["Normal", -1, "P"],
  "Superpower": ["Fighting", 120, "P"], "Surf": ["Water", 90, "S"], "Tail Slap": ["Normal", 25, "P"],
  "Tera Blast": ["Normal", 80, "S"], "Throat Chop": ["Dark", 80, "P"], "Thunder": ["Electric", 110, "S"],
  "Thunder Fang": ["Electric", 65, "P"], "Thunder Punch": ["Electric", 75, "P"],
  "Thunderbolt": ["Electric", 90, "S"], "Trailblaze": ["Grass", 50, "P"], "Tri Attack": ["Normal", 80, "S"],
  "Triple Axel": ["Ice", 20, "P"], "U-turn": ["Bug", 70, "P"], "Vacuum Wave": ["Fighting", 40, "S", 1],
  "Volt Switch": ["Electric", 70, "S"], "Waterfall": ["Water", 80, "P"], "Wave Crash": ["Water", 120, "P"],
  "Wild Charge": ["Electric", 90, "P"], "Wood Hammer": ["Grass", 120, "P"], "X-Scissor": ["Bug", 80, "P"],
  "Zen Headbutt": ["Psychic", 80, "P"],
};
const CAT = { P: 0, S: 1 };

let draws = 0, sets = 0;
globalThis.window = globalThis;
globalThis.Phaser = {
  Math: { RND: { _s: "!rnd,live",
    state(v) { if (v !== undefined) { sets++; this._s = v; } return this._s; },
    integerInRange() { draws++; return 0; }, realInRange() { draws++; return 0; }, frac() { draws++; return 0; },
    pick(a) { draws++; return a[0]; }, shuffle(a) { draws++; return a; } } },
  Display: { Canvas: { CanvasPool: { pool: [] } } },
};
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {}, appendChild() {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { RANDBATS } = globalThis.__hud["05-randbats"];
const { standardThreats } = globalThis.__hud["11-threats"];
const { BACKUP, CATCH_LEVEL, CLAMP, EXPOSURE, MARGIN, MAX_REASONS, PARTY_SIZE, REVENGE, SWITCH_IN, UNKNOWN_ITEM,
  judgeNewcomer, teamValue, weakestMember } = globalThis.__hud["12-value"];
const { combatantOf } = globalThis.__hud["09-combatant"];
const { levelCapAt } = globalThis.__hud["09-projection"];
const { readRun } = globalThis.__hud["26-run"];
const { sandboxBreachCount } = globalThis.__hud["01-core"];

const MOVES = [null];
for (const name of RANDBATS.m) {
  const f = FACTS[name];
  const status = STATUS_MOVES.includes(name);
  MOVES.push({ id: MOVES.length, name, type: TY.indexOf(f ? f[0] : "Normal"), power: status ? 0 : f ? f[1] : 80,
    accuracy: 100, category: status ? STATUS : CAT[f?.[2] ?? "P"], pp: 10, moveTarget: 3, priority: f?.[3] ?? 0,
    flags: 0, attrs: [] });
}
globalThis.__hud["04-game-tables"].setGameTables({ species: SPECIES, moves: MOVES, abilities: ABILITIES });

// ---- Our side: real species with their real rows, none of them in the registry above.
const ours = (id, name, types, base) => species(id, name, types, sum(base), { base });
const OURS = {
  blastoise: ours(9, "Blastoise", ["Water"], [79, 83, 100, 85, 105, 78]),
  charizard: ours(6, "Charizard", ["Fire", "Flying"], [78, 84, 78, 109, 85, 100]),
  dodrio: ours(85, "Dodrio", ["Normal", "Flying"], [60, 110, 70, 60, 60, 100]),
  empoleon: ours(395, "Empoleon", ["Water", "Steel"], [84, 86, 88, 111, 101, 60]),
  feraligatr: ours(160, "Feraligatr", ["Water"], [85, 105, 100, 79, 83, 78]),
  hitmonlee: ours(106, "Hitmonlee", ["Fighting"], [50, 120, 53, 35, 110, 87]),
  kangaskhan: ours(115, "Kangaskhan", ["Normal"], [105, 95, 80, 40, 80, 90]),
  lanturn: ours(171, "Lanturn", ["Water", "Electric"], [125, 58, 58, 76, 76, 67]),
  ludicolo: ours(272, "Ludicolo", ["Water", "Grass"], [80, 70, 70, 90, 100, 70]),
  meganium: ours(154, "Meganium", ["Grass"], [80, 82, 100, 83, 100, 80]),
  nidoking: ours(34, "Nidoking", ["Poison", "Ground"], [81, 102, 77, 85, 75, 85]),
  politoed: ours(186, "Politoed", ["Water"], [90, 75, 75, 90, 100, 70]),
  poliwrath: ours(62, "Poliwrath", ["Water", "Fighting"], [90, 95, 95, 70, 90, 70]),
  roserade: ours(407, "Roserade", ["Grass", "Poison"], [60, 70, 65, 125, 105, 90]),
  sceptile: ours(254, "Sceptile", ["Grass"], [70, 85, 65, 105, 85, 120]),
  sunflora: ours(192, "Sunflora", ["Grass"], [75, 75, 55, 105, 85, 30]),
  swampert: ours(260, "Swampert", ["Water", "Ground"], [100, 110, 90, 85, 90, 60]),
  typhlosion: ours(157, "Typhlosion", ["Fire"], [78, 84, 78, 109, 85, 100]),
  wailord: ours(321, "Wailord", ["Water"], [170, 90, 45, 90, 45, 60]),
};
// The moves of ours the duels below run on, as the fixture takes them: `[name, type, power, category]`.
const M = {
  surf: ["Surf", "Water", 90, "S"],
  waterfall: ["Waterfall", "Water", 80, "P"],
  iceBeam: ["Ice Beam", "Ice", 90, "S"],
  energyBall: ["Energy Ball", "Grass", 90, "S"],
  gigaDrain: ["Giga Drain", "Grass", 75, "S"],
  sludgeBomb: ["Sludge Bomb", "Poison", 90, "S"],
  earthquake: ["Earthquake", "Ground", 100, "P"],
  bodySlam: ["Body Slam", "Normal", 85, "P"],
  crunch: ["Crunch", "Dark", 80, "P"],
  thunderbolt: ["Thunderbolt", "Electric", 90, "S"],
  flamethrower: ["Flamethrower", "Fire", 90, "S"],
  closeCombat: ["Close Combat", "Fighting", 120, "P"],
  drillPeck: ["Drill Peck", "Flying", 80, "P"],
  tackle: ["Tackle", "Normal", 40, "P"],
  // The four a stand-in's learnset hands it below, so a live mon can be built with the very same set.
  aquaTail: ["Aqua Tail", "Water", 90, "P"],
  dragonPulse: ["Dragon Pulse", "Dragon", 85, "S"],
};

// ---- The run the judgment reads: wave 44, every tenth wave a boss, so the next big fight ahead is wave 50.
const sceneOf = (party, { challenges = [], modifiers = [], wave = 44, seed = "judge-1" } = {}) => ({
  seed, modifiers, enemyModifiers: [], currentBattle: { waveIndex: wave }, arena: { biomeId: 3 },
  gameMode: { isBoss: w => w % 10 === 0, isFixedBattle: () => false, hasTrainers: true, challenges },
  getPlayerParty: () => party, getEnemyParty: () => [], game: { config: { gameVersion: "1.12.0.11" } },
});
const expShare = stacks => ({ constructor: { name: "ExpShareModifier" }, getStackCount: () => stacks });
const luckyEgg = p => ({ pokemonId: p.id, type: { id: "LUCKY_EGG" }, getStackCount: () => 1 });

const judge = (party, newcomer, opts = {}, sceneOpts = {}) =>
  readRun(sceneOf(party, sceneOpts), run => judgeNewcomer(run, newcomer, opts));

// ΔV, the release and the net value, in tenths of a turn, which is the grain the margin is set in.
const t1 = x => { const v = Math.round(x * 10) / 10 || 0; return `${v > 0 ? "+" : v < 0 ? "-" : " "}${Math.abs(v).toFixed(1)}`; };
// Every judgment printed below is held to #579's four rules, whatever else the probe it belongs to asserts: at most
// two reasons, each naming a threat of the very rows the verdict came off, each a move the judgment would not itself
// call noise, and not one of them pointing the other way from the call it explains.
const checkReasons = (label, j) => {
  const gain = j.verdict !== "skip";
  assert.ok(j.reasons.length <= MAX_REASONS, `${label}: at most ${MAX_REASONS} reasons, not ${j.reasons.length}`);
  assert.deepEqual([...new Set(j.reasons.map(r => r.threat))].length, j.reasons.length,
    `${label}: two reasons are two threats, not one threat twice`);
  for (const r of j.reasons) {
    const row = (j.after?.rows ?? []).find(x => x.threat === r.threat);
    assert.ok(row, `${label}: "${r.text}" names a threat of the rows the verdict was read off`);
    assert.equal(r.kind, row.kind, `${label}: and names it by type or archetype`);
    assert.ok(["type", "archetype"].includes(r.kind));
    assert.ok(r.text.includes(r.threat), `${label}: "${r.text}" says which threat it is about`);
    assert.ok(["answer", "backup", "exposure"].includes(r.part),
      `${label}: a reason is an answer, a backup or an exposure`);
    assert.equal(r.gain, gain, `${label}: "${r.text}" points the other way from ${j.verdict}`);
    assert.equal(r.delta > 0, gain, `${label}: "${r.text}" is worth ${t1(r.delta)} to a ${j.verdict}`);
    assert.ok(Math.abs(r.delta) >= MARGIN, `${label}: "${r.text}" moved less than the margin`);
  }
  if (j.plain) {
    assert.ok(["dead weight", "barred"].includes(j.plain.kind), `${label}: ${j.plain.kind} is not a plain case`);
    assert.ok(j.plain.text.length > 0 && !/\bundefined\b/.test(j.plain.text), `${label}: ${j.plain.text}`);
  }
};
// The plain case, if there is one, and then the words of each reason with the row and the turns it was read off.
const said = (label, j) => {
  if (j.plain) console.log(`      ! ${j.plain.text}`);
  for (const r of j.reasons) {
    console.log(`      ${r.gain ? "+" : "-"} ${`${r.threat} ${r.part}`.padEnd(22)} ${t1(r.delta)}  ${r.text}`);
  }
  checkReasons(label, j);
};
const show = (label, j) => {
  console.log(`  ${label.padEnd(30)} ${j.verdict.padEnd(5)} ${(j.replaced?.name ?? "-").padEnd(11)}`
    + ` dV ${t1(j.delta)}  release ${j.release.toFixed(1)}  net ${t1(j.net)}  ${j.plain ? j.plain.kind : ""}`);
  said(label, j);
};

// Where the page's RNG stood before a single judgment ran, which is where the last assertion finds it again.
const drawsBefore = draws, setsBefore = sets, rndBefore = Phaser.Math.RND.state();

console.log(`== constants: clamp ${CLAMP}  backup ${BACKUP}  revenge ${REVENGE}  switch-in ${SWITCH_IN}`
  + `  margin ${MARGIN}  exposure ${[1, 2, 3, 4].map(n => EXPOSURE(n).toFixed(1)).join("/")}`
  + `  unknown item ${UNKNOWN_ITEM}  party ${PARTY_SIZE}`);

// ---- Every move a threat brings is one this file has typed
{
  const set = readRun(sceneOf([]), run => standardThreats(run, { fight: 50 }));
  const carried = new Set(set.threats.flatMap(t => t.combatant.moveset.map(pm => pm.getName())));
  const untyped = [...carried].filter(name => !FACTS[name] && !STATUS_MOVES.includes(name)).sort();
  assert.deepEqual(untyped, [], "a move a threat duels with carries its own type, power and category");
  console.log(`== wave ${set.wave}: ${set.threats.length} threats at level ${set.level}, ${carried.size} moves between them`);
}

// ---- The rows of one party, threat by threat: the answer, the backup, who the threat beats, and the row's value
const CAP = 38; // `levelCapAt` at wave 50, which is where a party that has kept pace stands
const WATERS = (level = CAP) => [
  mon(OURS.blastoise, level, [M.surf, M.iceBeam, M.bodySlam], { ability: "Torrent" }),
  mon(OURS.feraligatr, level, [M.waterfall, M.crunch, M.iceBeam], { ability: "Torrent" }),
  mon(OURS.politoed, level, [M.surf, M.iceBeam, M.bodySlam], { ability: "Water Absorb" }),
  mon(OURS.wailord, level, [M.surf, M.bodySlam, M.iceBeam], { ability: "Water Veil" }),
  mon(OURS.lanturn, level, [M.surf, M.thunderbolt, M.iceBeam], { ability: "Volt Absorb" }),
  mon(OURS.meganium, level, [M.energyBall, M.bodySlam, M.earthquake], { ability: "Overgrow" }),
];
{
  const party = WATERS();
  const j = judge(party, mon(OURS.swampert, CAP, [M.surf, M.waterfall], { ability: "Torrent" }));
  console.log(`== the all-Water party's rows, V ${j.before.v.toFixed(2)} over ${j.before.rows.length} threats`);
  for (const r of j.before.rows) {
    console.log(`  ${r.threat.padEnd(14)} ${r.answer.name.padEnd(11)} s ${t1(r.answer.s)}`
      + ` backup ${r.backup.name.padEnd(11)} ${t1(r.backup.s)}  beaten ${r.beaten.length}`
      + `${r.revenge ? " revenge" : ""}${r.switchIn ? " switch-in" : ""}  row ${t1(r.value)}`);
    assert.equal(r.value, r.answer.s + BACKUP * r.backup.s + (r.revenge ? REVENGE : 0) + (r.switchIn ? SWITCH_IN : 0)
      - EXPOSURE(r.beaten.length), `${r.threat}: the row is the answer, the backup, the credits and the exposure`);
  }
  assert.equal(j.before.v, j.before.rows.reduce((t, r) => t + r.value, 0) / j.before.rows.length,
    "V is the mean over the threats, so the roster half can be given equal say (#592)");

  // The same six through the module's own seam, as a card below will read them: a party already at the cap gains
  // nothing on the way to the fight, so `teamValue` over the adapter's combatants is what the judgment read.
  const direct = readRun(sceneOf(party), run => teamValue(run, standardThreats(run, { fight: 50 }),
    party.map(p => ({ name: p.name, combatant: combatantOf({ mon: p, level: CAP, species: p.species }) }))));
  assert.equal(direct.v, j.before.v, "and `teamValue` over those combatants is the very value it judged against");
  assert.equal(direct.confidence, "exact", "the standard threats being exactly what the game would field");
  assert.equal(j.confidence, "estimate", "while the judgment is only ever as sure as the projection behind it");
}

// ---- One lopsided duel is clamped, and no pair score ever stands outside the clamp
{
  const j = judge(WATERS(), mon(OURS.swampert, CAP, [M.surf, M.waterfall], { ability: "Torrent" }));
  const pairs = j.before.rows.flatMap(r => [r.answer, r.backup]);
  assert.ok(pairs.every(p => Math.abs(p.s) <= CLAMP), "every pair score is inside the clamp");
  const clamped = pairs.filter(p => Math.abs(p.raw) > CLAMP);
  assert.ok(clamped.length > 0, "and at least one duel was lopsided enough to need it");
  const worst = clamped.reduce((b, p) => (Math.abs(p.raw) > Math.abs(b.raw) ? p : b));
  console.log(`== clamped: ${clamped.length} of ${pairs.length} pairs, the worst ${worst.name} raw ${t1(worst.raw)}`
    + ` -> s ${t1(worst.s)}`);
  assert.equal(Math.abs(worst.s), CLAMP);
}

// ---- An all-Water party keeps the one member that answers what Water cannot
{
  const party = WATERS();
  const j = judge(party, mon(OURS.swampert, CAP, [M.surf, M.waterfall], { ability: "Torrent" }));
  console.log("== another Water into the all-Water party");
  show("Swampert", j);
  const answers = name => j.before.rows.filter(r => r.answer.name === name).length;
  const order = [...j.tried].sort((a, b) => a.delta - b.delta).map(x => x.slot.name);
  console.log(`  cheapest to release last: ${order.map(n => `${n} (${answers(n)})`).join(", ")}`);
  assert.notEqual(j.replaced?.name, "Meganium", "the Grass member is not the one the search picks");
  // Only the party's own best answer is worth more to it than its one Grass member: of the six, those two are the
  // ones the search is least willing to release.
  assert.deepEqual(order.slice(0, 2), ["Feraligatr", "Meganium"]);
  assert.ok(answers("Meganium") >= 4, "which is what it answers that no Water of theirs does");
}

// ---- The lowest-BST member is kept while it is the only answer to anything, and a heavier double goes instead
{
  // Poliwrath is the lightest of the six and the only Fighting among them; Typhlosion is the heaviest and brings
  // Charizard's Fire a second time.
  const party = [
    mon(OURS.charizard, CAP, [M.flamethrower, M.drillPeck], { ability: "Blaze" }),
    mon(OURS.typhlosion, CAP, [M.flamethrower, M.bodySlam], { ability: "Blaze" }),
    mon(OURS.sceptile, CAP, [M.energyBall, M.bodySlam], { ability: "Overgrow" }),
    mon(OURS.empoleon, CAP, [M.surf, M.iceBeam], { ability: "Torrent" }),
    mon(OURS.roserade, CAP, [M.energyBall, M.sludgeBomb], { ability: "Natural Cure" }),
    mon(OURS.poliwrath, CAP, [M.closeCombat, M.waterfall], { ability: "Water Absorb" }),
  ];
  const j = judge(party, mon(OURS.swampert, CAP, [M.surf, M.earthquake], { ability: "Torrent" }),
    {}, { seed: "judge-bst" });
  console.log("== the lightest member of six, against the heaviest newcomer of the lot");
  show("Swampert", j);
  const answers = name => j.before.rows.filter(r => r.answer.name === name).length;
  const beaten = name => j.before.rows.filter(r => r.beaten.includes(name)).length;
  const byName = new Map(j.tried.map(x => [x.slot.name, x.delta]));
  const order = [...byName].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  console.log(`  cheapest to release last: ${order.map(n => `${n} (answers ${answers(n)}, beaten ${beaten(n)})`).join(", ")}`);
  assert.equal(Math.min(...party.map(p => p.species.baseTotal)), OURS.poliwrath.baseTotal,
    "Poliwrath is the lightest of the six by base-stat total");
  assert.notEqual(j.replaced?.name, "Poliwrath", "and not the one the search releases");
  const released = party.find(p => p.name === j.replaced.name);
  assert.ok(released.species.baseTotal > OURS.poliwrath.baseTotal,
    "what goes is heavier than the lightest: a base-stat total is not what the judgment weighs");
  assert.ok(answers("Poliwrath") >= 3 && answers("Poliwrath") > answers(released.name),
    "the lightest stays because it answers threats the heavier member it keeps its slot over does not");
}

// ---- A newcomer that stacks the party's weakness is worth less than one of the same weight that covers it
{
  const party = () => [
    mon(OURS.blastoise, CAP, [M.surf, M.bodySlam], { ability: "Torrent" }),
    mon(OURS.feraligatr, CAP, [M.waterfall, M.bodySlam], { ability: "Torrent" }),
    mon(OURS.politoed, CAP, [M.surf, M.bodySlam], { ability: "Water Absorb" }),
    mon(OURS.wailord, CAP, [M.surf, M.bodySlam], { ability: "Water Veil" }),
    mon(OURS.lanturn, CAP, [M.surf, M.bodySlam], { ability: "Volt Absorb" }),
    mon(OURS.swampert, CAP, [M.surf, M.bodySlam], { ability: "Torrent" }),
  ];
  // Two newcomers of the same base-stat total, at the same level, with the same two moves bar their type.
  assert.equal(OURS.empoleon.baseTotal, OURS.sceptile.baseTotal, "the same weight, so only the typing differs");
  const stacks = judge(party(), mon(OURS.empoleon, CAP, [M.surf, M.bodySlam], { ability: "Torrent" }),
    {}, { seed: "judge-stack" });
  const covers = judge(party(), mon(OURS.sceptile, CAP, [M.energyBall, M.bodySlam], { ability: "Overgrow" }),
    {}, { seed: "judge-stack" });
  console.log("== a sixth Water, or the Grass the six of them are missing");
  show("Empoleon (Water/Steel)", stacks);
  show("Sceptile (Grass)", covers);
  const beaten = j => j.after.rows.reduce((t, r) => t + r.beaten.length, 0);
  console.log(`  members the threats beat: ${beaten(stacks)} with the Water, ${beaten(covers)} with the Grass`);
  assert.ok(covers.delta > stacks.delta, "the one that covers the hole is worth more than the one that stacks it");
  assert.ok(beaten(stacks) > beaten(covers), "the stacking newcomer loses where the party already loses");
}

// ---- An evolution the projection cannot see landing by the fight leaves the newcomer as it stands
{
  const party = WATERS().slice(0, 5);
  // It carries the line's own STAB, which it keeps through the evolution: what the evolution changes is the 115
  // points of Attack behind it.
  const karp = () => mon(SPECIES.getSpecies(129), 10, [M.waterfall], { ability: "Swift Swim" });
  const share = { modifiers: [expShare(1)], seed: "judge-evo" };
  const at50 = judge(party, karp(), {}, share);
  const at60 = judge(party, karp(), { fight: 60 }, share);
  // Five EXP shares carry it most of the way to the cap, where the line it crosses is worth something; and the same
  // mon with its evolutions switched off is the one thing the player can do to stop a line the projection can see
  // landing, which is the control.
  const fed = { modifiers: [expShare(5)], seed: "judge-evo-fed" };
  const evolved = judge(party, karp(), {}, fed);
  const paused = judge(party, mon(SPECIES.getSpecies(129), 10, [M.waterfall],
    { ability: "Swift Swim", pauseEvolutions: true }), {}, fed);
  const stands = j => `${j.newcomer.projection.species.name} L${j.newcomer.projection.level}`
    + ` [${j.newcomer.combatant.getTypes().map(t => TY[t]).join("/")}] ${j.newcomer.combatant.getMaxHp()} hp`;
  console.log("== a Magikarp at level 10, one EXP share, judged at two fights");
  console.log(`  at the fight on 50 it stands as ${stands(at50)}`);
  console.log(`  at the fight on 60 it stands as ${stands(at60)}`);
  console.log(`  on five shares it reaches the fight on 50 as ${stands(evolved)}`);
  console.log(`  and with its evolutions paused, ${stands(paused)}`);
  show("at the next big fight", at50);
  show("at the one after", at60);
  show("five shares", evolved);
  show("five shares, paused", paused);
  assert.deepEqual(at50.newcomer.projection.evolved, [], "level 19 by wave 50: the line does not land by then");
  assert.equal(at50.newcomer.projection.species.name, "Magikarp", "so it is duelled as the Magikarp it still is");
  assert.equal(at60.newcomer.projection.evolved.map(sp => sp.name).join(), "Gyarados", "by wave 60 it does land");
  assert.equal(at60.newcomer.projection.species.name, "Gyarados");
  assert.equal(at60.newcomer.name, "Magikarp", "the mon keeps its own name through it");
  assert.deepEqual(paused.newcomer.projection.evolved, [], "a paused line lands nowhere");
  assert.equal(paused.newcomer.projection.level, evolved.newcomer.projection.level, "at the very same level");
  assert.ok(evolved.delta > paused.delta, "a Gyarados at that level is worth more to them than a Magikarp at it");
}

// ---- A newcomer far below the party's level, and what EXP share and a Lucky Egg do for it
{
  const party = WATERS().slice(0, 5);
  const karp = () => mon(SPECIES.getSpecies(129), 10, [M.tackle], { ability: "Swift Swim" });
  const egg = karp();
  const runs = [
    ["nothing", karp(), []],
    ["Lucky Egg alone", egg, [luckyEgg(egg)]],
    ["one EXP share", karp(), [expShare(1)]],
    ["EXP share and Lucky Egg", egg, [expShare(1), luckyEgg(egg)]],
    ["five EXP shares", karp(), [expShare(5)]],
  ];
  console.log("== a level 10 newcomer into a party at the cap");
  const levels = [];
  // One seed for all five, so every read keys the same run: what the EXP routing moves has to come out of the memo
  // keys that name it, not out of a run key per scenario (26-run's `runKeyOf` carries the modifier *count* alone).
  for (const [label, nc, modifiers] of runs) {
    const j = judge(party, nc, {}, { modifiers, seed: "judge-exp" });
    levels.push(j.newcomer.projection.level);
    console.log(`  ${label.padEnd(24)} L${String(j.newcomer.projection.level).padEnd(3)} ${j.newcomer.name.padEnd(9)}`
      + ` ${j.verdict.padEnd(5)} dV ${t1(j.delta)}`);
    said(label, j);
  }
  assert.equal(levels[0], 10, "a bench share of nothing is nothing");
  assert.equal(levels[1], 10, "and a Lucky Egg multiplies it (game-code.md §17), so it is nothing too");
  assert.ok(levels[2] > levels[0] && levels[3] > levels[2], "a share moves it, and the egg moves the share");
  assert.ok(levels[4] > levels[3], "and five shares is the whole of one wave's EXP");
  assert.ok(levels[4] <= 38, "no projection reaches past the cap at the fight");
}

// ---- One run key, three EXP routings for the party itself, each read answered with its own levels
{
  // The run key holds each member's species, level, luck and whether it stands, plus the modifier *count* (26-run's
  // `runKeyOf`). None of the three reads below moves any of it — six members at one level, one modifier each time —
  // while what the projection reads changes every time: which member holds the Lucky Egg, and whether a member has
  // Pokérus. So all three share one memo bucket, and the memo keyed on the run key alone would hand the second and
  // third reads the levels the first one was projected with.
  const LOW = 10; // far enough under the cap that 40 % of a participant's share is worth whole levels
  const read = ({ egg = 0, rus = -1 } = {}) => {
    const party = WATERS(LOW).map((p, i) => (i === rus ? { ...p, pokerus: true } : p));
    const j = judge(party, mon(OURS.swampert, CAP, [M.surf, M.earthquake], { ability: "Torrent" }),
      {}, { modifiers: [luckyEgg(party[egg])], seed: "judge-memo" });
    return j.tried.map(x => x.slot.projection.level);
  };
  const held = read();
  const moved = read({ egg: 5 });
  const rus = read({ rus: 0 });
  const bare = held[1]; // the four members carrying nothing, which every read projects alike
  console.log("== one run key, the Lucky Egg on the first member and then the last, and then Pokérus with it");
  for (const [label, levels] of [["egg on Blastoise", held], ["egg on Meganium", moved], ["and Pokérus", rus]]) {
    console.log(`  ${label.padEnd(18)} ${WATERS(LOW).map((p, i) => `${p.name} L${levels[i]}`).join(", ")}`);
  }
  assert.ok(held[0] > bare, "the member holding the egg is projected past the five who hold nothing");
  assert.deepEqual(held.slice(1), [bare, bare, bare, bare, bare], "and the egg moves nobody else");
  assert.deepEqual(moved, [bare, bare, bare, bare, bare, held[0]],
    "the egg handed to the last member moves that one instead, which the run key cannot tell apart");
  assert.ok(rus[0] > held[0], "and Pokérus on the holder is half a share again on top of the egg");
  assert.deepEqual(rus.slice(1), held.slice(1), "while the five without it stand where they stood");
}

// ---- A free slot is taken when the newcomer is worth more than the margin, and skipped when it is not
{
  const party = WATERS().slice(0, 4);
  console.log("== four members and two free slots");
  const good = judge(party, mon(OURS.sceptile, CAP, [M.energyBall, M.iceBeam, M.surf, M.bodySlam],
    { ability: "Overgrow" }), {}, { seed: "judge-slot" });
  const bad = judge(party, mon(OURS.sunflora, 20, [M.tackle], { ability: "Chlorophyll" }), {}, { seed: "judge-slot" });
  const beaten = (j, name) => j.after.rows.filter(r => r.beaten.includes(name)).length;
  show("Sceptile at the cap", good);
  show("Sunflora at level 20", bad);
  console.log(`  of ${good.after.rows.length} threats, the one is beaten by ${beaten(good, "Sceptile")}`
    + ` and the other by ${beaten(bad, "Sunflora")}`);
  assert.equal(good.verdict, "take", "a free slot costs nothing to fill, so anything past the margin is taken");
  assert.equal(good.replaced, null, "there being nobody to release");
  assert.equal(good.release, 0);
  assert.equal(good.net, good.delta, "so the net value is the whole of ΔV");
  assert.equal(good.tried, undefined, "and no swap was searched");
  assert.equal(bad.verdict, "skip");
  assert.ok(bad.delta <= MARGIN, "a newcomer the threats beat is not worth even a free slot");
}

// ---- Dead weight contributes nothing, and the slot it holds is the plain case a swap takes
// Five at the cap, each of them worth keeping, and a sixth that went down. The five matter: against a party whose
// every live member earns its slot, the cheapest slot to take is the one nobody is standing in.
const FAINTED = () => [
  mon(OURS.blastoise, CAP, [M.surf, M.iceBeam, M.bodySlam], { ability: "Torrent" }),
  mon(OURS.feraligatr, CAP, [M.waterfall, M.crunch, M.iceBeam], { ability: "Torrent" }),
  mon(OURS.charizard, CAP, [M.flamethrower, M.drillPeck], { ability: "Blaze" }),
  mon(OURS.wailord, CAP, [M.surf, M.bodySlam, M.iceBeam], { ability: "Water Veil", hp: 0, allowed: false }),
  mon(OURS.typhlosion, CAP, [M.flamethrower, M.bodySlam], { ability: "Blaze" }),
  mon(OURS.meganium, CAP, [M.energyBall, M.bodySlam, M.earthquake], { ability: "Overgrow" }),
];
{
  console.log("== a fainted member, under three calendars");
  const nc = () => mon(OURS.sceptile, CAP, [M.energyBall, M.iceBeam, M.surf, M.bodySlam], { ability: "Overgrow" });
  const hardcore = judge(FAINTED(), nc(), {}, { challenges: [{ id: HARDCORE, value: 1 }], seed: "judge-hc" });
  const noSupport = judge(FAINTED(), nc(), {}, { challenges: [{ id: LIMITED_SUPPORT, value: 3 }], seed: "judge-ls" });
  // Limited Support 2 takes the shops and leaves the heals, so wave 51's heal is the only way back — out of reach of
  // the fight on 50, and in reach of the one on 60.
  const healDue = judge(FAINTED(), nc(), { fight: 60 },
    { challenges: [{ id: LIMITED_SUPPORT, value: 2 }], seed: "judge-heal" });
  show("Hardcore", hardcore);
  show("no heal, no shop", noSupport);
  show("a heal due before the fight", healDue);
  const five = FAINTED().filter(p => p.hp > 0).length;
  for (const j of [hardcore, noSupport]) {
    const dead = j.tried.find(x => x.slot.name === "Wailord");
    assert.equal(dead.slot.dead, "fainted", "with no way back, the member that went down stays down");
    assert.equal(dead.slot.combatant, null, "holding its slot with nothing to duel with");
    assert.equal(j.before.rows.length, j.after.rows.length, "the threats are the same set either way");
    assert.ok(j.before.rows.every(r => r.answer.name !== "Wailord" && !r.beaten.includes("Wailord")),
      "it answers no threat and is exposed to none: dead weight contributes nothing");
  }
  assert.equal(hardcore.before.v, noSupport.before.v, "and the two calendars that strand it agree on what the five are worth");
  // Taking the empty slot grows the party from five to six, and exposure is quadratic in the members a threat beats
  // (`EXPOSURE`), so a sixth that loses more duels than it answers is worth less to the team than the slot standing
  // empty. The search prices that, which is why the swap it picks is not always the dead slot.
  console.log(`  every slot the search tried, against ${five} live members:`);
  console.log(`    ${hardcore.tried.map(x => `${x.slot.name}${x.slot.dead ? "†" : ""} ${t1(x.delta)}`).join("  ")}`);
  assert.ok(hardcore.tried.length === PARTY_SIZE, "the search tried every slot, the dead one included");

  assert.equal(healDue.tried.find(x => x.slot.name === "Wailord").slot.dead, null,
    "a heal before the fight puts it back on its feet, and it duels for its slot like anyone");
  assert.equal(healDue.plain, null, "so there is nothing plain left to say");
  assert.ok(healDue.before.rows.some(r => r.answer.name === "Wailord" || r.beaten.includes("Wailord")),
    "and it stands in the rows it was absent from");

  // The dead slot named outright — a trade that takes the fainted member — is the plain case (#579 words it).
  const forced = judge(FAINTED(), nc(), { replace: "Wailord" },
    { challenges: [{ id: HARDCORE, value: 1 }], seed: "judge-hc" });
  show("Hardcore, the corpse named", forced);
  assert.equal(forced.plain.kind, "dead weight");
  assert.equal(forced.plain.why, "fainted");
  assert.equal(forced.verdict, "swap", "nothing was given up, so anything past the margin is an improvement");
  assert.ok(forced.net > MARGIN);

  // A barred member is dead weight at full health, whatever the calendar says.
  const barred = FAINTED();
  barred[3] = mon(OURS.wailord, CAP, [M.surf, M.bodySlam, M.iceBeam], { ability: "Water Veil", barred: true });
  const j = judge(barred, nc(), { replace: "Wailord" },
    { challenges: [{ id: SINGLE_TYPE, value: 10 }], seed: "judge-barred-member" });
  show("a barred member, named", j);
  assert.equal(j.replaced.dead, "barred", "at full health, and still not on the party the fight is fought with");
  assert.equal(j.plain.kind, "dead weight");
  assert.equal(j.plain.why, "barred");
}

// ---- The weakest member: who the party loses least by, with no newcomer in view (#582)
// The same answer the party profile's `weakest`, the audit's "first to replace" and the Dark Deal's weakest link
// all read, so none of the three can name a different member. Dead weight is weakest at zero, and goes first
// however cheap a live member is to lose.
{
  const weakest = (party, opts = {}, sceneOpts = {}) =>
    readRun(sceneOf(party, sceneOpts), run => weakestMember(run, opts));
  // Every slot, weakest first, with what the party loses by it in turns per threat.
  const ladder = (label, w) => {
    console.log(`  ${label.padEnd(30)} ${(w.name ?? "-").padEnd(11)} costs ${t1(w.cost)}  ${w.dead ?? ""}`);
    console.log(`    ${w.ranked.map(x => `${x.name}${x.dead ? "†" : ""} ${t1(x.cost)}`).join("  ")}`);
    assert.deepEqual(w.ranked.map(x => !!x.dead).sort((a, b) => Number(b) - Number(a)), w.ranked.map(x => !!x.dead),
      `${label}: dead weight first`);
    const live = w.ranked.filter(x => !x.dead);
    assert.deepEqual([...live].sort((a, b) => a.cost - b.cost).map(x => x.name), live.map(x => x.name),
      `${label}: then the cheapest live member to lose`);
    assert.deepEqual({ name: w.name, dead: w.dead, cost: w.cost },
      { name: w.ranked[0].name, dead: w.ranked[0].dead, cost: w.ranked[0].cost },
      `${label}: and the weakest member is the first of them`);
    for (const x of w.ranked) assert.equal(x.dead ? x.cost : 0, 0, `${label}: dead weight costs nothing to lose`);
  };
  console.log("== the weakest member of each fixture party");
  const waters = weakest(WATERS());
  ladder("all-Water, one Grass", waters);
  assert.notEqual(waters.name, "Meganium", "the one member that answers what Water cannot is not the weakest");
  assert.equal(waters.dead, null, "every one of the six can fight, so the weakest is a live member");
  assert.equal(waters.ranked.length, PARTY_SIZE, "and every slot is on the ladder");

  const hardcore = weakest(FAINTED(), {}, { challenges: [{ id: HARDCORE, value: 1 }], seed: "judge-hc" });
  ladder("Hardcore, Wailord down", hardcore);
  assert.equal(hardcore.name, "Wailord", "a member with no way back is weakest whatever the five are worth");
  assert.equal(hardcore.dead, "fainted");
  assert.equal(hardcore.cost, 0, "the party loses nothing at all by a slot nobody is standing in");

  const noSupport = weakest(FAINTED(), {}, { challenges: [{ id: LIMITED_SUPPORT, value: 3 }], seed: "judge-ls" });
  ladder("no heal, no shop", noSupport);
  assert.equal(noSupport.name, "Wailord", "the other calendar that strands it says the same");
  assert.equal(noSupport.v, hardcore.v, "and the two agree on what the party is worth");

  // Limited Support 2 leaves wave 51's heal, which is out of reach of the fight on 50 and in reach of the one on 60.
  const healDue = weakest(FAINTED(), { fight: 60 }, { challenges: [{ id: LIMITED_SUPPORT, value: 2 }], seed: "judge-heal" });
  ladder("a heal due before the fight", healDue);
  assert.ok(healDue.ranked.every(x => !x.dead), "back on its feet, it duels for its slot like anyone");
  // It is still the member the party loses least by — but as a member now, at what its duels are worth, and not at
  // the flat zero a slot nobody is standing in holds.
  assert.equal(healDue.ranked.find(x => x.name === "Wailord").cost, healDue.cost);
  assert.notEqual(healDue.cost, 0, "priced on the duels it fights, not on the slot it holds");

  const barred = FAINTED();
  barred[3] = mon(OURS.wailord, CAP, [M.surf, M.bodySlam, M.iceBeam], { ability: "Water Veil", barred: true });
  const bar = weakest(barred, {}, { challenges: [{ id: SINGLE_TYPE, value: 10 }], seed: "judge-barred-member" });
  ladder("a barred member, at full health", bar);
  assert.equal(bar.name, "Wailord");
  assert.equal(bar.dead, "barred", "a challenge bars it, so the fight is fought without it");

  // The weakest member and a swap's pick are two questions off one party set, and they need not agree: the member
  // the newcomer should replace is the one *its own* swap picks, since the newcomer may cover what that member
  // covered (CONTEXT.md, `Party profile`). So a card that names a replacement names the search's pick, and only a
  // card asking who is expendable — the audit, the Dark Deal — names the weakest.
  const j = judge(FAINTED(), mon(OURS.sceptile, CAP, [M.energyBall, M.iceBeam], { ability: "Overgrow" }), {},
    { challenges: [{ id: HARDCORE, value: 1 }], seed: "judge-hc" });
  console.log(`  a Grass newcomer swaps ${j.replaced.name}, while the weakest member is ${hardcore.name}`);
  assert.deepEqual(j.tried.map(x => x.slot.name).sort(), hardcore.ranked.map(x => x.name).sort(),
    "both read the same six slots");
  assert.equal(hardcore.v, j.before.v, "and the same party value behind them");
}

// ---- What a release destroys: the items the member it takes would have handed on (#581)
// A released member leaves with everything transferable it holds, so two slots worth the same to the team are not
// equally cheap to empty. The approx duel models no item at all, so the adapter prices the ones it can as the
// multipliers they are (game-code.md §15) and charges a flat `UNKNOWN_ITEM` for every stack it cannot — and a swap
// worth taking off a party carrying nothing is one to turn down off a party carrying (stories 10, 15).
{
  // `getHeldItems` is the whole of what a duel and a release read off a member, so this is a member carrying.
  const carrying = (p, items) => ({ ...p, getHeldItems: () => items });
  // A held item as the game keeps one: the modifier's own class is what the adapter prices it by, and its stack
  // count how many of it the member holds.
  const itemOf = (cls, stacks, fields = {}) => {
    const C = class {};
    Object.defineProperty(C, "name", { value: cls });
    return Object.assign(new C(), { getStackCount: () => stacks, ...fields });
  };
  // Leftovers heals between turns, which is outside the race to the KO a duel is scored on: nothing it can price.
  const leftovers = n => itemOf("TurnHealModifier", n);
  // Mystic Water, +20 % per stack to the holder's Water moves, which *is* a multiplier the duel reads.
  const mysticWater = n => itemOf("AttackTypeBoosterModifier", n, { moveType: TY.indexOf("Water") });
  // A Miracle Seed, the same item for Grass moves — and in this party, an item one member alone has a move for.
  const miracleSeed = n => itemOf("AttackTypeBoosterModifier", n, { moveType: TY.indexOf("Grass") });
  // A vitamin: the points are in the live mon's own stats already, and the item does not move house with it.
  const vitamin = n => itemOf("BaseStatModifier", n, { stats: [1], multiplier: 1 + 0.1 * n, isTransferable: false });

  const SEED = { seed: "judge-release" };
  const nc = () => mon(OURS.swampert, CAP, [M.surf, M.waterfall], { ability: "Torrent" });
  const wailordHolds = items =>
    judge(WATERS().map(p => (p.name === "Wailord" ? carrying(p, items) : p)), nc(), {}, SEED);
  const allHold = items => judge(WATERS().map(p => carrying(p, items)), nc(), {}, SEED);
  const slotOf = (j, name) => j.tried.find(x => x.slot.name === name);
  const costs = j => j.tried.map(x =>
    `${x.slot.name} ${x.cost.items} item${x.cost.items === 1 ? "" : "s"}`
    + ` ${x.cost.flat.toFixed(2)}+${x.cost.worth.toFixed(2)}`).join(", ");

  const bare = wailordHolds([]);
  const one = wailordHolds([leftovers(1)]);
  const five = wailordHolds([leftovers(5)]);
  const invested = wailordHolds([vitamin(3)]);
  const booster = wailordHolds([mysticWater(3)]);
  // The same booster for a type the party has one move of: Meganium's Energy Ball, and nothing behind it.
  const seeded = judge(WATERS().map(p => (p.name === "Meganium" ? carrying(p, [miracleSeed(3)]) : p)), nc(), {}, SEED);
  console.log("== the slot the search would empty, and what emptying it would destroy");
  show("holding nothing", bare);
  show("one Leftovers", one);
  show("five Leftovers", five);
  show("three vitamins", invested);
  show("three Mystic Water", booster);
  show("three Miracle Seed", seeded);
  for (const [label, j] of [["nothing", bare], ["one Leftovers", one], ["five", five], ["vitamins", invested],
      ["Mystic Water", booster], ["Miracle Seed", seeded]]) {
    console.log(`  ${label.padEnd(13)} ${costs(j)}`);
    assert.equal(j.net, j.delta - j.release, `${label}: the net value is ΔV less what the release destroys`);
    assert.equal(j.verdict === "swap", j.net > MARGIN, `${label}: a swap is an improvement past the margin`);
  }
  assert.equal(bare.replaced.name, "Wailord", "the slot the search empties when none of the six carries anything");
  assert.equal(bare.release, 0, "which costs nothing to empty");
  assert.ok(bare.delta - slotOf(bare, "Lanturn").delta < UNKNOWN_ITEM,
    "and the slot behind it is worth less to the team than one stack of an item the duel cannot price");

  // So one Leftovers on the member the search had picked is enough to send it to the member behind it.
  assert.equal(slotOf(one, "Wailord").cost.cost, UNKNOWN_ITEM, "an item a duel cannot be given costs the flat charge");
  assert.equal(slotOf(one, "Wailord").cost.worth, 0, "none of it priced, so none of it read off a duel");
  assert.equal(slotOf(one, "Wailord").delta, bare.delta, "the member duels as it did: the item was never in the duel");
  assert.equal(one.replaced.name, "Lanturn", "and the search releases the member behind it instead");
  assert.equal(one.release, 0, "that one carrying nothing");
  assert.ok(one.delta < bare.delta, "which is worth less to the party than the slot it passed over");
  assert.equal(slotOf(five, "Wailord").cost.cost, 5 * UNKNOWN_ITEM, "five stacks of it is five charges");
  assert.equal(slotOf(five, "Wailord").cost.items, 1, "of the one item");

  // The vitamin is investment, not an item that moves house: the party keeps it whoever goes, so it is not counted
  // against the release, and what it bought is in the live stats the duel already read.
  assert.equal(slotOf(invested, "Wailord").cost.cost, 0, "an untransferable item is not counted");
  assert.equal(slotOf(invested, "Wailord").cost.items, 0, "nothing of it goes with the member");
  assert.equal(invested.replaced.name, bare.replaced.name, "so the search is the very one it ran off a bare party");
  assert.equal(invested.delta, bare.delta, "and not one duel of it came out differently");

  // A booster the adapter can price costs what the duels say it is worth rather than the flat charge — and what it is
  // worth is what it is worth to the party that *stays*: the member answering each threat once the swap is made is
  // rebuilt holding the gone items on top of its own, and the row is charged what that answer gains by them. Three
  // stacks of a Water booster off a party of Waters lands on whoever answers next, so the slot is dear to empty.
  const priced = slotOf(booster, "Wailord");
  assert.equal(priced.cost.flat, 0, "nothing flat about an item the duel was given");
  assert.equal(priced.cost.cost, priced.cost.flat + priced.cost.worth, "the cost being the two halves together");
  assert.ok(priced.cost.worth > UNKNOWN_ITEM,
    "three stacks of a Water booster handed to five Waters is worth more than one unpriceable stack");
  assert.ok(priced.delta < bare.delta, "the party being worth more for one of its own holding it");
  assert.ok(priced.delta - priced.release < bare.delta, "so the slot is dearer to empty for what it carries");
  assert.equal(booster.replaced.name, "Lanturn", "and this slot too goes to the member behind it");

  // The other way round: an item nothing left in the party could use costs about nothing to release, however much it
  // was worth to the member carrying it. Meganium is the one member of the six with a Grass move, so a Miracle Seed
  // lifts its own duels — the party is worth more for its holding one — and the moment it goes there is nobody left
  // to hand the seed to. A release destroys what the party loses, not what the released member had.
  const stranded = slotOf(seeded, "Meganium");
  assert.ok(seeded.before.v > bare.before.v, "the seed is worth something to the party while Meganium holds it");
  assert.equal(stranded.cost.items, 1, "and it is transferable, so the release does take it");
  assert.equal(stranded.cost.flat, 0, "the adapter prices it, so none of it is charged flat");
  assert.equal(stranded.cost.worth, 0, "and it is worth nothing to the five Waters that stay: no Grass move between them");
  assert.equal(stranded.cost.cost, 0, "which is the whole of what releasing it costs");

  // The same seed on the same member, with one Water of the six traded for a Grass that stays: now there is somebody
  // to hand it to, and the slot costs what the seed is worth to them.
  const heir = judge(WATERS().map(p => (p.name === "Lanturn"
    ? mon(OURS.sceptile, CAP, [M.energyBall, M.bodySlam], { ability: "Overgrow" })
    : p.name === "Meganium" ? carrying(p, [miracleSeed(3)]) : p)), nc(), {}, SEED);
  show("the seed with an heir to it", heir);
  console.log(`  Meganium's slot: ${stranded.cost.worth.toFixed(2)} with no Grass behind it,`
    + ` ${slotOf(heir, "Meganium").cost.worth.toFixed(2)} with Sceptile behind it`);
  assert.ok(slotOf(heir, "Meganium").cost.worth > 0,
    "the very item that cost nothing to release costs something once a member that can use it stays");

  // The cost orders the whole search and not just its first two: with the two cheapest slots carrying, the member
  // behind both of them is the one released.
  const twoHold = judge(WATERS().map(p => (["Wailord", "Lanturn"].includes(p.name) ? carrying(p, [leftovers(1)]) : p)),
    nc(), {}, SEED);
  show("the cheapest two carrying", twoHold);
  assert.equal(twoHold.replaced.name, "Politoed", "the third-cheapest slot, which carries nothing");
  assert.ok(slotOf(twoHold, "Politoed").delta < slotOf(twoHold, "Wailord").delta,
    "worth less to the team than either of them, and cheaper than both once the items are counted");

  // Six slots carrying the same thing: no slot is cheaper than another, the cost comes straight off the net, and the
  // swap the party would have made carrying nothing is one it should turn down.
  const carried = n => allHold([leftovers(n)]);
  const [cheap, dear] = [carried(1), carried(6)];
  console.log("== all six of them carrying, one stack each and then six");
  show("one Leftovers each", cheap);
  show("six Leftovers each", dear);
  assert.equal(bare.verdict, "swap");
  assert.equal(cheap.verdict, "swap", "one stack each leaves the swap well past the margin");
  assert.equal(dear.verdict, "skip", "six of it does not: ΔV − release cost > margin is what an improvement is");
  assert.equal(dear.delta, bare.delta, "the same swap, worth the same change in team value");
  assert.equal(dear.replaced.name, bare.replaced.name, "out of the same member's slot");
  for (const [n, j] of [[1, cheap], [6, dear]]) {
    assert.equal(j.release, n * UNKNOWN_ITEM, `${n} unpriceable stacks cost ${n} charges`);
    assert.deepEqual([...new Set(j.tried.map(x => x.release))], [n * UNKNOWN_ITEM], "every slot of the six alike");
  }

  // Replacing dead weight costs only its release cost (story 15): the corpse is worth nothing to give up, so what
  // the swap pays for is what it is carrying — and here one stack of it is enough to turn the swap down.
  const corpse = items => judge(FAINTED().map(p => (p.name === "Wailord" ? carrying(p, items) : p)),
    mon(OURS.sceptile, CAP, [M.energyBall, M.iceBeam, M.surf, M.bodySlam], { ability: "Overgrow" }),
    { replace: "Wailord" }, { challenges: [{ id: HARDCORE, value: 1 }], seed: "judge-hc" });
  const [empty, pockets, spent] = [corpse([]), corpse([leftovers(1)]), corpse([vitamin(3)])];
  console.log("== the fainted member named, holding nothing, one Leftovers, and three vitamins");
  show("a corpse", empty);
  show("a corpse carrying", pockets);
  show("a corpse's investment", spent);
  assert.equal(empty.replaced.dead, "fainted");
  assert.equal(empty.release, 0, "dead weight is free to release");
  assert.equal(empty.verdict, "swap", "so anything past the margin takes the slot");
  assert.equal(pockets.delta, empty.delta, "what it carries changes nothing about what the party is worth");
  assert.equal(pockets.release, UNKNOWN_ITEM, "and is the whole of what the release costs");
  assert.equal(pockets.net, empty.delta - UNKNOWN_ITEM, "which is all that stands between the two calls");
  assert.equal(pockets.verdict, "skip", "and more than the slot was worth: a corpse with pockets is not free");
  assert.equal(pockets.plain, null, "a card that is not swapping it has nothing plain to say about it");
  assert.equal(spent.release, 0, "while what was spent on it was never the release's to destroy");
  assert.equal(spent.verdict, empty.verdict, "so the investment leaves the call where it found it");
}

// ---- A newcomer the challenge bars is dead weight on arrival, and never an improvement
{
  const j = judge(WATERS(), mon(OURS.meganium, CAP, [M.energyBall, M.bodySlam, M.earthquake], { barred: true }),
    {}, { challenges: [{ id: SINGLE_TYPE, value: 10 }], seed: "judge-barred" });
  console.log("== a newcomer Single Type bars");
  show("Meganium, barred", j);
  assert.equal(j.plain.kind, "barred");
  assert.equal(j.verdict, "skip");
  assert.equal(j.delta, 0);
  assert.equal(j.after, null, "nothing was scored with it on the party: it would not be on it");
  assert.equal(j.tried, undefined, "and no swap was searched for a newcomer that cannot be on the party");
  assert.equal(j.before.rows.length, j.before.rows.filter(r => r.answer).length, "the party's own rows stand either way");
}

// ---- A forced replacement skips the search and judges the one swap it was given
{
  const party = WATERS();
  const j = judge(party, mon(OURS.swampert, CAP, [M.surf, M.waterfall], { ability: "Torrent" }),
    { replace: "Meganium" }, { seed: "judge-forced" });
  console.log("== the replacement forced, as a trade forces it");
  show("Swampert for Meganium", j);
  assert.equal(j.tried.length, 1, "one swap tried, not six");
  assert.equal(j.replaced.name, "Meganium");
}

// ---- The reason the decision words itself: the swap that gives away the only answer to a type says so
// Five Grass members the Grass threat of the set is at home among, and the one Fire that answers it.
const GRASSES = () => [
  mon(OURS.charizard, CAP, [M.flamethrower, M.drillPeck], { ability: "Blaze" }),
  mon(OURS.meganium, CAP, [M.energyBall, M.bodySlam], { ability: "Overgrow" }),
  mon(OURS.sceptile, CAP, [M.energyBall, M.bodySlam], { ability: "Overgrow" }),
  mon(OURS.sunflora, CAP, [M.gigaDrain, M.bodySlam], { ability: "Chlorophyll" }),
  mon(OURS.roserade, CAP, [M.energyBall, M.sludgeBomb], { ability: "Natural Cure" }),
  mon(OURS.ludicolo, CAP, [M.surf, M.energyBall], { ability: "Swift Swim" }),
];
{
  // A trade forced on that member — a GTS offer naming the member it takes — is the swap that empties the row
  // outright rather than handing it down to a backup.
  const party = GRASSES();
  const j = judge(party, mon(OURS.blastoise, CAP, [M.surf, M.bodySlam], { ability: "Torrent" }),
    { replace: "Charizard" }, { seed: "judge-only-answer" });
  console.log("== the only answer to the Grass threat traded away, among five Grass members");
  show("Blastoise for Charizard", j);
  const was = name => j.before.rows.find(r => r.threat === name);
  const now = name => j.after.rows.find(r => r.threat === name);
  for (const name of ["Grass", "Flying"]) {
    console.log(`  ${name.padEnd(7)} ${was(name).answer.name} ${t1(was(name).answer.s)},`
      + ` beating ${was(name).beaten.length} of ${was(name).of}, and after the trade`
      + ` ${now(name).answer.name} ${t1(now(name).answer.s)}, beating ${now(name).beaten.length}`
      + ` of ${now(name).of}`);
  }
  assert.equal(was("Grass").answer.name, "Charizard", "the Fire is the party's answer to the Grass threat");
  assert.ok(was("Grass").answer.s > 0 && now("Grass").answer.s <= 0, "and the trade leaves the party none");
  assert.equal(j.verdict, "skip", "which is why the trade is one to turn down");
  // The two phrasings the decision names outright, on the call they explain (#567).
  assert.deepEqual(j.reasons.map(r => r.text), ["no answer left to Grass", "Flying now beats 6 of 6"]);
  assert.deepEqual(j.reasons.map(r => r.part), ["answer", "exposure"]);
  assert.deepEqual(j.reasons.map(r => r.gain), [false, false], "both losses, on the call that turns it down");
}

// ---- Speed is worth one hit: a fast newcomer and a slow one of the same bulk and power score differently
{
  const party = WATERS();
  const base = [140, 110, 90, 110, 90, 0];
  const stand = spd => ({ mon: mon(OURS.blastoise, CAP, [M.surf, M.bodySlam], { ability: "Torrent" }),
    stats: [...base.slice(0, 5), spd] });
  const fast = judge(party, stand(140), {}, { seed: "judge-speed" });
  const slow = judge(party, stand(40), {}, { seed: "judge-speed" });
  const first = j => j.after.rows.filter(r => r.answer.first === true).length;
  console.log("== the same bulk and power, at two speeds");
  show("speed 140", fast);
  show("speed 40", slow);
  console.log(`  rows whose answer moves first: ${first(fast)} fast, ${first(slow)} slow`);
  assert.ok(fast.delta > slow.delta, "moving first is one fewer hit taken (story 36)");
  assert.ok(first(fast) > first(slow));
}

// ---- The whole vocabulary a reason is said in, swept out of every swap the two parties above allow
{
  // Each judgment above pins the words of its own call; this sweeps the two parties against three newcomers each,
  // every slot forced in turn, and pins the *shapes* those calls are said in — the threat under an X and its counts
  // under an n. A phrasing this file has never read is then a golden diff rather than a surprise on a card.
  const sweeps = [["the Water six", WATERS], ["the Grass six", GRASSES]];
  const comers = [
    ["Blastoise", () => mon(OURS.blastoise, CAP, [M.surf, M.bodySlam], { ability: "Torrent" })],
    ["Sunflora", () => mon(OURS.sunflora, CAP, [M.gigaDrain, M.bodySlam], { ability: "Chlorophyll" })],
    ["Kangaskhan", () => mon(OURS.kangaskhan, CAP, [M.bodySlam], { ability: "Early Bird" })],
    // Two worth having, so the sweep reads the gains as well as the losses.
    ["Sceptile", () => mon(OURS.sceptile, CAP, [M.energyBall, M.iceBeam, M.surf, M.bodySlam],
      { ability: "Overgrow" })],
    ["Swampert", () => mon(OURS.swampert, CAP, [M.earthquake, M.iceBeam, M.surf, M.bodySlam],
      { ability: "Torrent" })],
    ["Charizard", () => mon(OURS.charizard, CAP, [M.flamethrower, M.drillPeck, M.crunch, M.bodySlam],
      { ability: "Blaze" })],
  ];
  const seen = new Map();
  let judged = 0, reasons = 0;
  for (const [label, party] of sweeps) {
    for (const victim of party().map(p => p.name)) {
      for (const [name, nc] of comers) {
        const j = judge(party(), nc(), { replace: victim }, { seed: "judge-vocab" });
        checkReasons(`${label} -${victim} +${name}`, j);
        judged++;
        reasons += j.reasons.length;
        for (const r of j.reasons) {
          const shape = r.text.replace(r.kind === "archetype" ? `the ${r.threat}` : r.threat, "X")
            .replace(/\d+/g, "n");
          const at = seen.get(shape) ?? { n: 0, gain: r.gain, part: r.part };
          seen.set(shape, { ...at, n: at.n + 1 });
          assert.equal(at.gain ?? r.gain, r.gain, `"${shape}" is a gain in one call and a loss in another`);
        }
      }
    }
  }
  console.log(`== ${reasons} reasons over ${judged} forced swaps, in ${seen.size} phrasings:`);
  const order = [...seen].sort(([x, a], [y, b]) =>
    Number(b.gain) - Number(a.gain) || a.part.localeCompare(b.part) || x.localeCompare(y));
  for (const [shape, at] of order) {
    console.log(`  ${at.gain ? "+" : "-"} ${at.part.padEnd(8)} ${String(at.n).padStart(3)}  ${shape}`);
  }
  assert.deepEqual([...new Set(order.map(([, at]) => `${at.gain ? "gain" : "loss"} ${at.part}`))].sort(),
    ["gain answer", "gain backup", "gain exposure", "loss answer", "loss backup", "loss exposure"],
    "the sweep reads every part of a row, moving either way, so no phrasing goes unread");
  // Every phrasing says which threat it is about and which way the row went, and nothing says both ways at once.
  for (const [shape, at] of order) {
    assert.ok(shape.includes("X"), `"${shape}" names no threat`);
    assert.ok(/^(an answer|a backup|a better|a weaker|no answer|no backup|nearer|further from|X now beats)/.test(shape),
      `"${shape}" is outside the vocabulary this file has read`);
    assert.equal(/\bdown from\b/.test(shape), at.gain && at.part === "exposure",
      `"${shape}" counts down only where the exposure it reads fell`);
  }
}

// ---- A stand-in newcomer: a species and a form, with nothing alive behind it (#580)
{
  // A species the game's registry knows and the randbats snapshot does not. The snapshot lists no not-fully-evolved
  // species (05-randbats' own `e`), so a species added here reaches `getSpecies` without reaching the threat pool:
  // the stand-in is judged against the same threats every probe above was, and never against one of its own name.
  const idOf = new Map();
  MOVES.forEach((mv, id) => { if (mv && !idOf.has(mv.name)) idOf.set(mv.name, id); });
  // `[level, moveId]`, as the game's `getLevelMoves` hands it over. Level 35 is above the level a catch on this wave
  // joins at, and the two oldest entries are the ones the four slots push out.
  const LEARNSET = [[1, "Quick Attack"], [5, "Agility"], [11, "Aqua Tail"], [17, "Crunch"], [23, "Dragon Pulse"],
    [29, "Ice Beam"], [35, "Outrage"]];
  const DRAGONAIR = {
    ...species(148, "Dragonair", ["Dragon"], 420, { base: [61, 84, 65, 70, 70, 70] }),
    ability1: { name: "Shed Skin" }, // the species' default, which a wild spawn comes out with
    getLevelMoves: () => LEARNSET.map(([lv, name]) => [lv, idOf.get(name)]),
  };
  SPECIES_BY_ID.set(148, DRAGONAIR);
  assert.ok(!readRun(sceneOf([]), run => standardThreats(run, { fight: 50 }))
    .threats.some(t => t.species.speciesId === 148), "a stand-in's species is no threat of the set it is judged by");

  const party = WATERS();
  const j = judge(party, { species: DRAGONAIR }, {}, { seed: "judge-stand-in" });
  const nc = j.newcomer;
  const names = nc.combatant.moveset.map(pm => pm.getName());
  const cap = levelCapAt(null, 44); // the cap on the wave the catch happens on, not the one at the fight
  console.log("== a stand-in Dragonair, with no live mon behind it");
  console.log(`  caught at L${nc.projection.was}, ${(nc.projection.was / cap).toFixed(2)} of the cap ${cap},`
    + ` and judged at L${nc.projection.level} knowing ${names.join(", ")}`);
  console.log(`  ability ${nc.combatant.getAbility()?.name ?? "-"},`
    + ` passive ${nc.combatant.getPassiveAbility()?.name ?? "-"}, stand-in ${nc.standIn}, ${j.confidence}`);
  show("Dragonair, a stand-in", j);
  assert.equal(nc.standIn, true, "nothing alive behind it, which is what the card marks");
  assert.equal(nc.confidence, "estimate", "so none of its four inputs is the mon the player would be handed");
  assert.equal(j.confidence, "estimate");
  assert.equal(nc.projection.was, Math.round(CATCH_LEVEL * cap), "it joins at the expected catch level for the wave");
  assert.ok(nc.projection.was / cap >= 0.75 && nc.projection.was / cap <= 0.8, "which is 0.75-0.8 of the cap (#567)");
  assert.deepEqual(names, ["Aqua Tail", "Crunch", "Dragon Pulse", "Ice Beam"],
    "and knows the last four level-up moves of its learnset at that level");
  assert.deepEqual(names, LEARNSET.filter(([lv]) => lv <= nc.projection.was).slice(-4).map(([, name]) => name),
    "the two oldest pushed out of the four slots, and level 35 still ahead of it");
  assert.equal(nc.combatant.hasPassive(), false, "a wild spawn comes with no passive");
  assert.equal(nc.combatant.getAbility().name, "Shed Skin", "and with the species' default ability");

  // A stand-in is an estimate of a mon, so the mon it estimates has to come out with the same answer: the same
  // species at the same level, the same four moves, that ability and no passive — alive this time, and judged live.
  // Both are `estimate`, the projection behind either making them so; the flag is what tells a card which it holds.
  const live = mon(DRAGONAIR, nc.projection.level, [M.aquaTail, M.crunch, M.dragonPulse, M.iceBeam],
    { ability: "Shed Skin" });
  const twin = judge(party, live, {}, { seed: "judge-stand-in" });
  show("Dragonair, alive", twin);
  assert.equal(twin.newcomer.standIn, false);
  assert.deepEqual([...nc.combatant.stats], [...twin.newcomer.combatant.stats],
    "the stand-in's neutral IVs and nature are the live mon's own");
  assert.equal(twin.verdict, j.verdict, "a stand-in and a live mon of the same build get the same verdict");
  assert.equal(t1(twin.delta), t1(j.delta), "worth the same change in team value");
  assert.equal(twin.replaced?.name ?? null, j.replaced?.name ?? null, "out of the same member's slot");
  assert.deepEqual(twin.reasons.map(r => r.text), j.reasons.map(r => r.text), "said in the same words");

  // And again on a call that goes the other way, so the agreement is not two skips agreeing to do nothing: the same
  // six far enough below the cap that a level 30 catch is worth having, judged as a stand-in and then alive.
  const low = WATERS(16);
  const wanted = judge(low, { species: DRAGONAIR }, {}, { seed: "judge-stand-in-low" });
  const wantedLive = judge(low, mon(DRAGONAIR, wanted.newcomer.projection.level,
    [M.aquaTail, M.crunch, M.dragonPulse, M.iceBeam], { ability: "Shed Skin" }), {}, { seed: "judge-stand-in-low" });
  console.log("== the same stand-in into six members at level 16, and the live mon it estimates");
  show("Dragonair, a stand-in", wanted);
  show("Dragonair, alive", wantedLive);
  assert.notEqual(wanted.verdict, "skip", "a catch above the party's own level is one to take");
  assert.equal(wantedLive.verdict, wanted.verdict, "which the live mon of that build is told too");
  assert.equal(t1(wantedLive.delta), t1(wanted.delta));
  assert.equal(wantedLive.replaced?.name ?? null, wanted.replaced?.name ?? null);
  assert.deepEqual(wantedLive.reasons.map(r => r.text), wanted.reasons.map(r => r.text));

  // A spec that names a level of its own keeps it: a Safari offer or a trade knows the mon's level, and only a
  // species the player has not met yet falls back to what the wave would spawn.
  const named = judge(party, { species: DRAGONAIR, level: 12 }, {}, { seed: "judge-stand-in" });
  console.log(`  a stand-in offered at L12 is judged at L${named.newcomer.projection.level}`
    + ` knowing ${named.newcomer.combatant.moveset.map(pm => pm.getName()).join(", ")}`);
  assert.equal(named.newcomer.projection.was, 12, "the level it was offered at, not the one the wave would spawn");
  assert.deepEqual(named.newcomer.combatant.moveset.map(pm => pm.getName()), ["Quick Attack", "Agility", "Aqua Tail"],
    "and the learnset read at that level, which is three moves and not four");
}

// ---- The full swap search over six members, inside the cost budget
{
  const party = WATERS();
  const nc = () => mon(OURS.swampert, CAP, [M.surf, M.earthquake], { ability: "Torrent" });
  const run = seed => { const t = performance.now(); judge(party, nc(), {}, { seed }); return performance.now() - t; };
  const cold = run("judge-cost");
  const warm = run("judge-cost");
  // The budget is 4 ms memoised and 22–30 ms uncached (#567). The ceilings here are several times that: a loaded
  // machine is slower than the page, and a golden that fails on load would say nothing about the search.
  assert.ok(cold < 150, `a full swap search over six members, uncached: ${cold.toFixed(1)} ms`);
  assert.ok(warm < 25, `and the same search off the memo: ${warm.toFixed(1)} ms`);
  console.log("== the full swap search over six members is inside the budget, cold and memoised");
}

// ---- Judging a newcomer draws nothing and breaches nothing
assert.equal(draws - drawsBefore, 0, "the run's RNG was never asked");
assert.equal(Phaser.Math.RND.state(), rndBefore, "and its stream stands where it stood");
assert.ok(sets - setsBefore > 0, "the run read's sandbox put it back, which is the only write to it");
assert.equal(sandboxBreachCount(), 0);
assert.equal(globalThis.__coachHud.stats().breaches, 0);

console.log("judgment: ok");
