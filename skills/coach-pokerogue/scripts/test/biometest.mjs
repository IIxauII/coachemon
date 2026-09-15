// Biome choice card: on SelectBiomePhase's option screen the HUD ranks the offered biomes for the party — spawn types
// weighted by tier odds and time of day, how the party's moves hit them and how they hit the party, catches that fill a
// gap. Game tables are mocked with small invented pools (not the game's), injected the way loadGameTables would find
// them. Covers: the pick and its reasons, the rendered card in both views and the summary line, the card before the
// tables load, option labels resolved by link order when names don't match, tier and time-of-day weighting, and
// legend-like species kept out of early waves. Prints the rendered card, so run.mjs keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };

// ---- Species registry mock: id → { name, types, bst, evos: [[id, level]], root, legendary }
const SPECIES = {
  1: ["Wooper", ["Water","Ground"], 210, [[2, 20]]], 2: ["Quagsire", ["Water","Ground"], 430],
  3: ["Ekans", ["Poison"], 288, [[4, 22]]], 4: ["Arbok", ["Poison"], 448],
  5: ["Croagunk", ["Poison","Fighting"], 300, [[6, 37]]], 6: ["Toxicroak", ["Poison","Fighting"], 490],
  7: ["Gulpin", ["Poison"], 302],
  8: ["Mudkip", ["Water"], 310, [[9, 16], [10, 36]]], 9: ["Marshtomp", ["Water","Ground"], 405], 10: ["Swampert", ["Water","Ground"], 535],
  11: ["Toxapex", ["Poison","Water"], 495],
  20: ["Machop", ["Fighting"], 305, [[21, 28]]], 21: ["Machoke", ["Fighting"], 405],
  22: ["Magnemite", ["Electric","Steel"], 325, [[23, 30]]], 23: ["Magneton", ["Electric","Steel"], 465],
  24: ["Timburr", ["Fighting"], 305, [[25, 25]]], 25: ["Gurdurr", ["Fighting"], 405],
  26: ["Drilbur", ["Ground"], 328, [[27, 31]]], 27: ["Excadrill", ["Ground","Steel"], 508],
  28: ["Conkeldurr", ["Fighting"], 505],
  30: ["Sableye", ["Dark","Ghost"], 380], 31: ["Houndour", ["Dark","Fire"], 330],
  40: ["Azelf", ["Psychic"], 580, [], true],
  50: ["Garchomp", ["Dragon","Ground"], 600], 51: ["Snorlax", ["Normal"], 540], 52: ["Lapras", ["Water","Ice"], 535], 53: ["Pidgeotto", ["Normal","Flying"], 349, [[54, 36]]], 54: ["Pidgeot", ["Normal","Flying"], 479], 55: ["Alakazam", ["Psychic"], 500],
};
const roots = { 2: 1, 4: 3, 6: 5, 9: 8, 10: 8, 21: 20, 23: 22, 25: 24, 27: 26, 28: 24, 54: 53 };
const species = id => {
  const [name, types, bst, evos = [], legendary = false] = SPECIES[id];
  return { speciesId: id, name, type1: TY.indexOf(types[0]), type2: types[1] ? TY.indexOf(types[1]) : null, baseTotal: bst, legendary,
    getEvolutionLevels: () => evos, getRootSpeciesId: () => roots[id] ?? id, getIconAtlasKey: () => "k", getIconId: () => String(id) };
};
const registry = { getSpecies: id => { if (!SPECIES[id]) throw new Error(`no species ${id}`); return species(id); }, getAllSpecies: () => Object.keys(SPECIES).map(Number).map(species) };

// ---- Biomes: pool[tier][timeOfDay], -1 = all day. Invented pools shaped like the game's.
const tiers = (spec, t = {}) => Object.fromEntries([0,1,2,3,4,5,6,7,8].map(i => [i, { [-1]: spec[i] ?? [], 0: [], 1: [], 2: [], 3: [], ...(t[i] ?? {}) }]));
const BIOMES = new Map([
  [3, { biomeId: 3, pokemonPool: tiers({ 0: [53] }), trainerChance: 8, biomeLinks: [7, 26, [30, 4]] }],
  [7, { biomeId: 7, pokemonPool: tiers({ 0: [1, 3, 7], 1: [5], 2: [8], 4: [40], 5: [11] }, { 0: { 2: [5], 3: [5] } }), trainerChance: 8, biomeLinks: [19, 3] }],
  [26, { biomeId: 26, pokemonPool: tiers({ 0: [20, 22], 1: [24, 26], 5: [28] }), trainerChance: 6, biomeLinks: [[41, 3], 21] }],
  [30, { biomeId: 30, pokemonPool: tiers({ 0: [30, 31] }), trainerChance: 4, biomeLinks: [3] }],
]);
const NAMES = { 3: "Tall Grass", 7: "Swamp", 19: "Graveyard", 21: "Factory", 26: "Construction Site", 30: "Slum", 41: "Laboratory" };
const tables = (over = {}) => ({ biomes: BIOMES, species: registry, biomeName: id => NAMES[id] ?? `biome${id}`, ...over });

// ---- Party
const pk = (id, lv, moves, ability = "x") => {
  const sp = species(id);
  return { id: `p${id}`, name: sp.name, level: lv, hp: 100, getMaxHp: () => 100, species: sp,
    getTypes: () => [sp.type1, sp.type2].filter(t => t != null), getAbility: () => ({ name: ability }), hasPassive: () => false,
    getIconAtlasKey: () => "k", getIconId: () => String(id),
    moveset: moves.map(([n, t, p, c]) => ({ moveId: n, getName: () => n, getMove: () => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c] }) })) };
};
const team = () => [
  pk(50, 40, [["Earthquake","Ground",100,"P"],["Dragon Claw","Dragon",80,"P"]]),
  pk(51, 38, [["Body Slam","Normal",85,"P"]]),
  pk(52, 38, [["Surf","Water",90,"S"],["Ice Beam","Ice",90,"S"]]),
  pk(55, 37, [["Psychic","Psychic",90,"S"]]),
];

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

// Mounts the HUD on a biome-choice scene. `tables`: what loadGameTables would have found (null: not loaded yet).
const mount = ({ view = "full", labels = ["Swamp", "Construction Site"], party = team(), wave = 30, from = 3, offset = 0, t = tables(), dex = {} } = {}) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const handler = { config: { options: labels.map(label => ({ label, handler: () => true })) } };
  const scene = {
    phaseManager: { getCurrentPhase: () => ({ phaseName: "SelectBiomePhase" }) },
    currentBattle: { waveIndex: wave }, arena: { biomeId: from }, waveCycleOffset: offset,
    ui: { getMode: () => 15, getHandler: () => handler }, getPlayerParty: () => party, getEnemyParty: () => [],
    gameData: { dexData: dex },
  };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => view, setItem() {} };
  // Inject the tables before the first tick; expose the model builder for the test only.
  const src = bundle("hud")
    .replace("// ---- 50-shop.js", `setGameTables(globalThis.__biomeTables);\n// ---- 50-shop.js`)
    .replace(/\}\)\(\);\s*$/, "globalThis.__bm = { spawnsFor };\n})();\n");
  globalThis.__biomeTables = t;
  eval(src);
  return { el, scene, handler, model: () => globalThis.__coachHud.last() };
};

const jsonSafe = (x, label) => assert.equal(JSON.stringify(JSON.parse(JSON.stringify(x))), JSON.stringify(x), `${label}: JSON-safe`);

// ---- 1. Garchomp / Snorlax / Lapras: Swamp (Water/Ground/Poison) over Construction Site (Fighting/Steel, Snorlax weak).
{
  for (const view of ["full", "mini"]) {
    const { el } = mount({ view });
    console.log(`== swamp vs construction site (${view})\n${lines(el)}`);
    if (view === "full") console.log(`summary ${JSON.stringify(globalThis.__coachHud.summary())}`);
  }
  const m = mount().model();
  jsonSafe(m, "model");
  assert.equal(m.kind, "biome");
  assert.deepEqual(m.options.map(o => o.id), [7, 26], "labels resolve to biome ids by name");
  const [swamp, site] = m.options;
  assert.equal(m.pick, 0, "Swamp is the pick");
  assert.equal(swamp.verdict, "pick");
  assert.ok(swamp.score > site.score);
  assert.equal(swamp.mix[0][0], "Poison", "Swamp is mostly Poison");
  assert.ok(site.mix.some(([t]) => t === "Fighting"), "Construction Site shows Fighting");
  assert.ok(site.reasons.some(r => !r.good && /Snorlax.* weak/.test(r.text)), `Snorlax weak to Construction Site: ${JSON.stringify(site.reasons)}`);
  assert.ok(swamp.reasons.some(r => r.good && /hit SE/.test(r.text)), "several mons hit Swamp SE");
  assert.ok(site.onward.some(x => x.name === "Laboratory" && x.rare && x.chance === 3), "onward links name a rare biome and its chance");
  // Ekans is new and, as Arbok at the party's level, resists the Fighting the team is weak to.
  assert.equal(swamp.catch?.name, "Arbok", "the catch is taken at the party's level");
  assert.deepEqual(swamp.catch.tags, ["covers Fighting", "new"]);
  assert.deepEqual(swamp.common.map(([n]) => n).slice(0, 2), ["Toxicroak", "Quagsire"], "the species met most, evolved by level (a lone uncommon one leads)");
  assert.equal(globalThis.__coachHud.summary().biome.split(" · ")[0].startsWith("Swamp"), true);
}

// ---- 2. Tables not found yet: the card lists the options and says it's still reading; no pick, no summary verdict.
{
  const { el } = mount({ t: null });
  console.log(`== no tables\n${lines(el)}`);
  const m = globalThis.__coachHud.last();
  assert.equal(m.pick, -1);
  assert.ok(m.options.every(o => o.score == null));
  assert.equal(globalThis.__coachHud.summary().biome, "Swamp · Construction Site");
}

// ---- 3. Localized labels the name lookup can't match: resolved by position among the current biome's links.
{
  const m = mount({ labels: ["Sumpf", "Baustelle", "Slum"], t: tables({ biomeName: undefined }) }).model();
  assert.deepEqual(m.options.map(o => o.id), [7, 26, 30], "three labels, three links: matched in order");
  const two = mount({ labels: ["Sumpf", "Baustelle"], t: tables({ biomeName: undefined }) }).model();
  assert.ok(two.options.every(o => o.id == null && o.score == null), "a rolled-out link makes order ambiguous: no guess");
}

// ---- 4. Weighting: tier odds (common ≫ rare ≫ ultra rare), the boss wave as one in ten, legend-like species kept out
// before wave 55, and Croagunk's extra dusk/night entry only counted when the next ten waves reach dusk.
{
  const { scene } = mount({ wave: 30 });
  const at = (wave, offset = 0) => { scene.waveCycleOffset = offset; return globalThis.__bm.spawnsFor(scene, 7, wave); };
  const w = (list, id) => list.find(e => e.id === id)?.w ?? 0;
  const early = at(30);
  assert.ok(Math.abs(early.reduce((t, e) => t + e.w, 0) - 1) < 1e-9, "weights sum to 1");
  assert.equal(w(early, 40), 0, "no Azelf before wave 55");
  const late = at(60);
  assert.ok(w(late, 40) > 0 && w(late, 40) < 0.005, `ultra rare is a trace: ${w(late, 40)}`);
  // Ekans shares 356/512 with two others; Mudkip gets 26/512 plus the empty super/ultra rare tiers that drop to it.
  const day1 = at(0); // waves 1–10: all day, so no night-only entries in the common tier
  assert.ok(Math.abs(w(day1, 3) / w(day1, 8) - (356 / 3) / 32) < 1e-9, "tier odds split evenly within a tier, empty tiers drop down");
  assert.ok(Math.abs(w(early, 11) - 0.1) < 1e-9 && early.find(e => e.id === 11).wild === 0, "the lone boss species is the boss wave's tenth");
  const day = at(0), dusk = at(14);
  assert.ok(w(dusk, 5) > w(day, 5), `dusk adds Croagunk: day ${w(day, 5).toFixed(3)} vs dusk ${w(dusk, 5).toFixed(3)}`);
}

// ---- 5. A caught species isn't "new", and a team member's line isn't a catch at all.
{
  const caught = mount({ dex: { 4: { caughtAttr: 1n } } }).model().options[0];
  // Arbok caught: it only covers the weakness now, so a new Poison mon that also resists Fighting (Gulpin) outranks it.
  assert.equal(caught.catch?.name, "Gulpin");
  assert.deepEqual(caught.catch.tags, ["covers Fighting", "new"]);
  const withArbok = mount({ party: [...team(), pk(4, 36, [["Poison Jab","Poison",80,"P"]])] }).model().options[0];
  assert.ok(!withArbok.reasons.some(r => r.catch && /Arbok/.test(r.text)), JSON.stringify(withArbok.reasons));
}
console.log("ok");
