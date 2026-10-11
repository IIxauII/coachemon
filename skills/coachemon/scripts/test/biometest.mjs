// The pools and trainers are invented, not the game's: shaped like its tables, small enough to count by hand.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { wholeCard } from "./panel.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };

// id → [name, types, bst, direct evolutions [[id, level, evoLevelThreshold?]], legendary]
const SPECIES = {
  1: ["Wooper", ["Water","Ground"], 210, [[2, 20]]], 2: ["Quagsire", ["Water","Ground"], 430],
  3: ["Ekans", ["Poison"], 288, [[4, 22]]], 4: ["Arbok", ["Poison"], 448],
  5: ["Croagunk", ["Poison","Fighting"], 300, [[6, 37]]], 6: ["Toxicroak", ["Poison","Fighting"], 490],
  7: ["Gulpin", ["Poison"], 302],
  8: ["Mudkip", ["Water"], 310, [[9, 16]]], 9: ["Marshtomp", ["Water","Ground"], 405, [[10, 36]]], 10: ["Swampert", ["Water","Ground"], 535],
  11: ["Toxapex", ["Poison","Water"], 495],
  20: ["Machop", ["Fighting"], 305, [[21, 28]]], 21: ["Machoke", ["Fighting"], 405],
  22: ["Magnemite", ["Electric","Steel"], 325, [[23, 30]]], 23: ["Magneton", ["Electric","Steel"], 465],
  // Gurdurr → Conkeldurr trades: level 1, delayed by thresholds [strong, normal, wild] (game-code.md §10).
  24: ["Timburr", ["Fighting"], 305, [[25, 25]]], 25: ["Gurdurr", ["Fighting"], 405, [[28, 1, [40, 45, 50]]]],
  26: ["Drilbur", ["Ground"], 328, [[27, 31]]], 27: ["Excadrill", ["Ground","Steel"], 508],
  28: ["Conkeldurr", ["Fighting"], 505],
  30: ["Sableye", ["Dark","Ghost"], 380], 31: ["Houndour", ["Dark","Fire"], 330],
  40: ["Azelf", ["Psychic"], 580, [], true],
  50: ["Garchomp", ["Dragon","Ground"], 600], 51: ["Snorlax", ["Normal"], 540], 52: ["Lapras", ["Water","Ice"], 535], 53: ["Pidgeotto", ["Normal","Flying"], 349, [[54, 36]]], 54: ["Pidgeot", ["Normal","Flying"], 479], 55: ["Alakazam", ["Psychic"], 500],
  60: ["Geodude", ["Rock","Ground"], 300, [[61, 25]]], 61: ["Graveler", ["Rock","Ground"], 390],
};
// Each species' real base-stat row, `[hp, atk, def, spa, spd, spe]`, every one summing to the BST declared beside it
// above. The team judgment the catch line is now read off duels every one of them: without a row the combatant adapter
// hands back nothing, the species is no threat of the set and no stand-in either (#587).
const BASE = {
  1: [55, 45, 45, 25, 25, 15], 2: [95, 85, 85, 65, 65, 35],
  3: [35, 60, 44, 40, 54, 55], 4: [60, 95, 69, 65, 79, 80],
  5: [48, 61, 40, 61, 40, 50], 6: [83, 106, 65, 86, 65, 85],
  7: [70, 43, 53, 43, 53, 40],
  8: [50, 70, 50, 50, 50, 40], 9: [70, 85, 70, 60, 70, 50], 10: [100, 110, 90, 85, 90, 60],
  11: [50, 63, 152, 53, 142, 35],
  20: [70, 80, 50, 35, 35, 35], 21: [80, 100, 70, 50, 60, 45],
  22: [25, 35, 70, 95, 55, 45], 23: [50, 60, 95, 120, 70, 70],
  24: [75, 80, 55, 25, 35, 35], 25: [85, 105, 85, 40, 50, 40],
  26: [60, 85, 40, 30, 45, 68], 27: [110, 135, 60, 50, 65, 88],
  28: [105, 140, 95, 55, 65, 45],
  30: [50, 75, 75, 65, 65, 50], 31: [45, 60, 30, 80, 50, 65],
  40: [75, 125, 70, 125, 70, 115],
  50: [108, 130, 95, 80, 85, 102], 51: [160, 110, 65, 65, 110, 30], 52: [130, 85, 80, 85, 95, 60],
  53: [63, 60, 55, 50, 50, 71], 54: [83, 80, 75, 70, 70, 101], 55: [55, 50, 45, 135, 95, 120],
  60: [40, 80, 100, 30, 30, 20], 61: [55, 95, 115, 45, 45, 35],
};
// `[level, moveId]` as the game's `getLevelMoves` hands it over, and the same one for every species: the move table
// below is the randbats snapshot's names as one untyped attack of 80 each, so *which* move a stand-in is caught
// knowing says nothing and only how many does. The last four at or below the catch level are the ones it brings.
const LEARNSET = [[1, 1], [4, 2], [8, 3], [12, 4], [16, 5], [20, 6]];
const evosOf = id => SPECIES[id]?.[3] ?? [];
const parentOf = id => Number(Object.keys(SPECIES).find(k => evosOf(k).some(([e]) => e === id)) ?? NaN) || null;
const flatEvos = id => evosOf(id).flatMap(([e, lv]) => [[e, lv], ...flatEvos(e)]);
const prevoLevels = (id, thresholds) => {
  const out = [];
  for (const k of Object.keys(SPECIES).map(Number)) {
    const e = evosOf(k).find(([x]) => x === id);
    if (!e) continue;
    out.push(thresholds && e[2] ? [k, e[1], e[2]] : [k, e[1]], ...prevoLevels(k, thresholds));
  }
  return out;
};
const rootOf = id => { let cur = id; while (parentOf(cur)) cur = parentOf(cur); return cur; };
const species = id => {
  const [name, types, bst, , legendary = false] = SPECIES[id];
  return { speciesId: id, name, type1: TY.indexOf(types[0]), type2: types[1] ? TY.indexOf(types[1]) : null, baseTotal: bst, legendary,
    baseStats: BASE[id], getLevelMoves: () => LEARNSET, getName: () => name,
    isCatchable: () => !legendary, isOfType: t => types.includes(TY[t]),
    getEvolutionLevels: () => flatEvos(id), getPrevolutionLevels: th => prevoLevels(id, th),
    getRootSpeciesId: () => rootOf(id), getIconAtlasKey: () => "k", getIconId: () => String(id) };
};
const registry = {
  getSpecies: id => { if (!SPECIES[id]) throw new Error(`no species ${id}`); return species(id); },
  getAllSpecies: () => Object.keys(SPECIES).map(Number).map(species),
  getEvolutions: id => evosOf(id).map(([speciesId, level, evoLevelThreshold]) => ({ speciesId, level, evoLevelThreshold })),
  hasPrevolution: id => parentOf(id) != null, getPrevolution: id => parentOf(id),
};

// Black Belt's nested pool entry is one the game rerolls past (game-code.md §10).
const ofType = t => sp => sp.isOfType(TY.indexOf(t));
const TRAINERS = {
  100: { trainerType: 100, name: "Parasol Lady", partyTemplates: [], speciesFilter: ofType("Water") },
  101: { trainerType: 101, name: "Black Belt", partyTemplates: [], speciesPools: { 0: [20, 24], 1: [[5, 6], 5] } },
  200: { trainerType: 200, name: "Janine", partyTemplates: [], isBoss: true, specialtyType: TY.indexOf("Poison"), speciesFilter: ofType("Poison") },
  201: { trainerType: 201, name: "Brock", partyTemplates: [], isBoss: true, specialtyType: TY.indexOf("Rock"), speciesFilter: ofType("Rock") },
};

// pool[tier][timeOfDay], −1 all day; trainerPool[tier].
const tiers = (spec, t = {}) => Object.fromEntries([0,1,2,3,4,5,6,7,8].map(i => [i, { [-1]: spec[i] ?? [], 0: [], 1: [], 2: [], 3: [], ...(t[i] ?? {}) }]));
const trainers = spec => Object.fromEntries([0,1,2,3,4,5,6,7,8].map(i => [i, spec[i] ?? []]));
const swampPool = tiers({ 0: [1, 3, 7], 1: [5], 2: [8], 4: [40], 5: [11] }, { 0: { 2: [5], 3: [5] } });
const BIOMES = new Map([
  [3, { biomeId: 3, pokemonPool: tiers({ 0: [53] }), trainerPool: trainers({}), trainerChance: 8, biomeLinks: [7, 26, [30, 4]] }],
  [7, { biomeId: 7, pokemonPool: swampPool, trainerPool: trainers({ 0: [100], 1: [101], 5: [200] }), trainerChance: 8, biomeLinks: [19, 3] }],
  [26, { biomeId: 26, pokemonPool: tiers({ 0: [20, 22], 1: [24, 26], 5: [28] }), trainerPool: trainers({ 0: [101], 5: [201] }), trainerChance: 6, biomeLinks: [[41, 3], 21] }],
  [30, { biomeId: 30, pokemonPool: tiers({ 0: [30, 31] }), trainerPool: trainers({}), trainerChance: 4, biomeLinks: [3] }],
  // The Swamp with one more rare species: a near tie with it.
  [33, { biomeId: 33, pokemonPool: { ...swampPool, 2: { ...swampPool[2], [-1]: [8, 60] } }, trainerPool: trainers({ 0: [100], 1: [101], 5: [200] }), trainerChance: 8, biomeLinks: [3] }],
]);
const NAMES = { 3: "Tall Grass", 7: "Swamp", 19: "Graveyard", 21: "Factory", 26: "Construction Site", 30: "Slum", 33: "Marsh", 41: "Laboratory" };
// The move table the duels read: the randbats snapshot's own names, every one an untyped attack of 80, which is
// encountertest's table too. What a threat or a stand-in brings is not this file's subject — threatstest and
// judgmenttest pin that side — and the snapshot comes out of the bundle, so it is built on first read and not before.
let moveTable = null;
const movesTable = () => {
  if (moveTable) return moveTable;
  moveTable = [null];
  for (const name of globalThis.__hud["05-randbats"].RANDBATS.m) {
    moveTable.push({ id: moveTable.length, name, type: 0, power: 80, accuracy: 100, category: 0, pp: 10,
      moveTarget: 3, priority: 0, flags: 0, attrs: [] });
  }
  return moveTable;
};
const tables = (over = {}) => ({ biomes: BIOMES, species: registry, trainers: TRAINERS,
  biomeName: id => NAMES[id] ?? `biome${id}`, get moves() { return movesTable(); }, ...over });

const pk = (id, lv, moves, { hp = 100, luck = 0 } = {}) => {
  const sp = species(id);
  return { id: `p${id}`, name: sp.name, level: lv, hp, getMaxHp: () => 100, species: sp,
    getTypes: () => [sp.type1, sp.type2].filter(t => t != null), getAbility: () => ({ name: "x" }), hasPassive: () => false,
    getLuck: () => luck, isAllowedInBattle: () => hp > 0,
    getIconAtlasKey: () => "k", getIconId: () => String(id),
    // A slot carries what a duel reads as well as what a card reads: the PP left, and the move's own accuracy, target
    // and priority. Without them nothing can be put on the member against a threat (#587).
    moveset: moves.map(([n, t, p, c]) => ({ moveId: n, ppUsed: 0, getMovePp: () => 10, getName: () => n,
      getMove: () => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: 100, pp: 10,
        moveTarget: 3, priority: 0, flags: 0, attrs: [] }) })) };
};
const team = (opts = {}) => [
  pk(50, 40, [["Earthquake","Ground",100,"P"],["Dragon Claw","Dragon",80,"P"]], opts.chomp),
  pk(51, 38, [["Body Slam","Normal",85,"P"]], opts.lax),
  pk(52, 38, [["Surf","Water",90,"S"],["Ice Beam","Ice",90,"S"]]),
  pk(55, 37, [["Psychic","Psychic",90,"S"]]),
];
// A full party a catch *does* help, which the catch line being the team judgment on the species makes a different
// fixture from the four above: six mons of 300–479 BST, none of them in either option's pool (so none is skipped as a
// duplicate), all at level 37 — under the level cap of the wave the block below reads, which is what leaves a mon
// caught there worth a slot. Six and not four because the judgment charges a fifth member the exposure of a fifth
// slot (1.8 turns at `EXPOSURE(n) = 0.2n²`), so on a party with a free slot no stand-in clears the margin: the
// verdict a wild catch can reach is `swap`, where the count of mons that can be beaten does not move (#587).
const lowTeam = () => [
  pk(53, 37, [["Gust","Flying",40,"S"]]), pk(54, 37, [["Air Slash","Flying",75,"S"]]),
  pk(60, 37, [["Rock Throw","Rock",50,"P"]]), pk(61, 37, [["Rock Slide","Rock",75,"P"]]),
  pk(30, 37, [["Shadow Claw","Ghost",70,"P"]]), pk(31, 37, [["Ember","Fire",40,"S"]]),
];

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const lines = el => wholeCard(el)
  .map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");


// `t`: what loadGameTables would have found; null is not loaded yet.
const mount = ({ labels = ["Swamp", "Construction Site"], party = team(), wave = 30, from = 3, offset = 0, t = tables(), dex = {}, gameMode } = {}) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const handler = { config: { options: labels.map(label => ({ label, handler: () => true })) } };
  const scene = {
    phaseManager: { getCurrentPhase: () => ({ phaseName: "SelectBiomePhase" }) },
    currentBattle: { waveIndex: wave }, arena: { biomeId: from }, waveCycleOffset: offset, gameMode,
    ui: { getMode: () => 15, getHandler: () => handler }, getPlayerParty: () => party, getEnemyParty: () => [],
    gameData: { dexData: dex },
  };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  // The chunk scan finds nothing under node, so hand over what it would have found and tick again.
  const { setGameTables } = globalThis.__hud["04-game-tables"];
  const { spawnsFor, formsFor, spawnTimeOfDay } = globalThis.__hud["47-biome"];
  setGameTables(t);
  globalThis.__hud["98-watch"].rebuild();
  globalThis.__bm = { spawnsFor, formsFor, spawnTimeOfDay };
  return { el, scene, handler, model: () => globalThis.__coachHud.last() };
};

const jsonSafe = (x, label) => assert.equal(JSON.stringify(JSON.parse(JSON.stringify(x))), JSON.stringify(x), `${label}: JSON-safe`);
const near = (a, b, label, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);

// ---- Swamp is the pick over Construction Site, whose Fighting types Snorlax is weak to
{
  const { el } = mount();
  console.log(`== swamp vs construction site\n${lines(el)}`);
  console.log(`summary ${globalThis.__coachHud.summary().biome}`);
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
  // The catch line is the newcomer judgment on the species as a stand-in now, and these four stand 13–16 levels over
  // the level cap at wave 30: nothing a catch on this wave spawns at is worth a slot to them, so the card names no
  // catch and the term adds nothing to either score. The covers/upgrade/hole tags that used to name one — Toxicroak,
  // on "covers Fighting" alone — are not read here at all (#587). The block below is the same card with a party a
  // catch does help.
  assert.equal(swamp.catch, null, "a party over the wave's level cap has no catch to gain from");
  assert.equal(swamp.opportunity, 0);
  assert.equal(site.catch, null);
  assert.ok(!swamp.reasons.some(r => r.catch), JSON.stringify(swamp.reasons));
  assert.deepEqual(swamp.trainers, { pct: 8, names: ["Parasol Lady", "Black Belt"] }, "the trainers met, by share");
  assert.deepEqual(swamp.fight, { wave: 40, gym: false, foes: [["Toxapex", 100]] }, "wave 40 is the Swamp's wild boss");
  assert.deepEqual(site.fight.foes, [["Gurdurr", 100]], "a level-40 boss Conkeldurr is still a Gurdurr: its trade evolution waits for 45");
  assert.equal(globalThis.__coachHud.summary().biome.split(" · ")[0].startsWith("Swamp"), true);
}

// ---- The catch a biome sells is a species judged as a stand-in: nobody has met it, so the judgment builds it the
// way the game builds a wild mon — the expected catch level for the wave, the last four level-up moves it knows
// there — and the answer is an estimate, which the card marks (#580, #587, story 21)
{
  const { el } = mount({ wave: 60, party: lowTeam() });
  console.log(`== a stand-in judged for a party under the wave's cap\n${lines(el)}`);
  const m = globalThis.__coachHud.last();
  jsonSafe(m, "model");
  const [swamp, site] = m.options;
  console.log(`catch  ${JSON.stringify(site.catch)}`);
  assert.equal(site.catch.name, "Excadrill", "the catch is the spawn worth most to this team, not the rarest");
  assert.equal(site.catch.verdict, "swap", "which is a swap: the party is full");
  assert.equal(site.catch.tags[0], "swap for Pidgeotto", "and the member it comes in for is named on the line");
  assert.equal(site.catch.confidence, "estimate", "nobody has met it, so the figure is an estimate");
  assert.equal(site.catch.tags.at(-1), "estimate", "which the card marks, as the last word on the line (story 21)");
  assert.equal(site.catch.tags[1], `+${site.catch.net.toFixed(1)} turns`, "the team's **net** value — ΔV less what the release destroys");
  assert.ok(site.catch.net > 0.1, `over the judgment's own margin of a tenth of a turn: ${site.catch.net}`);
  assert.deepEqual(site.catch.tags.slice(2, -2),
    ["a backup to Ground at last", "Fighting now beats 4 of 6, down from 5"], "with the judgment's own reasons");
  assert.ok(site.catch.tags.includes("new"), "a species the dex has never seen is new");
  // The acceptance criterion the other way round: no tag on this line comes from `partyReasons` any more.
  assert.ok(!site.catch.tags.some(t => /^(covers|upgrade|hole|hits) /.test(t)), JSON.stringify(site.catch.tags));
  assert.ok(site.reasons.some(r => r.catch && r.good && r.text ===
    `catch Excadrill (${site.catch.tags.join(", ")})`), JSON.stringify(site.reasons));
  assert.ok(site.opportunity > 0, "and the catch is worth a term of the score, tier-weighted as before");
  // The same card, same party: the Swamp's own spawns are all worth less than a tenth of a turn to this team, so it
  // names no catch at all and scores nothing for one. A biome is sold on a catch only where the judgment says take or
  // swap — which is the whole of the change, the old covers/upgrade/hole tag having asked nothing about the cost.
  assert.equal(swamp.catch, null);
  assert.equal(swamp.opportunity, 0);
  assert.equal(m.pick, 1, "and the catch is in the pick");
}

// ---- Before the tables load, the card lists the options and judges none
{
  const { el } = mount({ t: null });
  console.log(`== no tables\n${lines(el)}`);
  const m = globalThis.__coachHud.last();
  assert.equal(m.pick, -1);
  assert.ok(m.options.every(o => o.score == null));
  assert.equal(globalThis.__coachHud.summary().biome, "Swamp · Construction Site");
}

// ---- Labels the name lookup can't match resolve by link order, where the order is unambiguous
{
  const m = mount({ labels: ["Sumpf", "Baustelle", "Slum"], t: tables({ biomeName: undefined }) }).model();
  assert.deepEqual(m.options.map(o => o.id), [7, 26, 30], "three labels, three links: matched in order");
  const two = mount({ labels: ["Sumpf", "Baustelle"], t: tables({ biomeName: undefined }) }).model();
  assert.ok(two.options.every(o => o.id == null && o.score == null), "a rolled-out link makes order ambiguous: no guess");
}

// ---- Spawn weights follow tier odds, time of day, the legend gate and luck (game-code.md §10)
{
  const { scene } = mount({ wave: 30 });
  const at = (wave, offset = 0, luck = 0) => { scene.waveCycleOffset = offset; return globalThis.__bm.spawnsFor(scene, 7, wave, luck).list; };
  const w = (list, id, part = "w") => list.find(e => e.id === id)?.[part] ?? 0;
  const early = at(30);
  near(early.reduce((t, e) => t + e.w, 0), 1, "weights sum to 1");
  assert.equal(w(early, 40), 0, "no Azelf before wave 55");
  const late = at(60);
  assert.ok(w(late, 40) > 0 && w(late, 40) < 0.005, `ultra rare is a trace: ${w(late, 40)}`);
  // Ekans shares 356/512 with two others; Mudkip gets 26/512 plus the empty super/ultra rare tiers that drop to it.
  const day1 = at(0); // waves 1–10 are all day: no dusk or night Croagunk in the common tier
  near(w(day1, 3, "wild") / w(day1, 8, "wild"), (356 / 3) / 32, "tier odds split evenly within a tier, empty tiers drop down");
  near(w(early, 11, "boss"), 0.1, "the lone boss species is the boss wave's tenth");
  assert.equal(early.find(e => e.id === 11).wild, 0);
  const day = at(0), dusk = at(14);
  assert.ok(w(dusk, 5) > w(day, 5), `dusk adds Croagunk: day ${w(day, 5).toFixed(3)} vs dusk ${w(dusk, 5).toFixed(3)}`);
  near(w(at(30, 0, 14), 8, "wild") / w(early, 8, "wild"), 512 / 484, "luck 14 takes 28 off the 512 ceiling, all from the common tier");
}

// ---- A caught species isn't "new", and a team member's line isn't a catch at all
{
  // Both Drilbur forms are marked: the card reads the species met after evolving.
  const caught = mount({ wave: 60, party: lowTeam(), dex: { 26: { caughtAttr: 1n }, 27: { caughtAttr: 1n } } }).model().options[1];
  assert.equal(caught.catch?.name, "Excadrill", "a species already caught is still the catch worth most");
  assert.ok(!caught.catch.tags.includes("new"), `but it is no longer new: ${JSON.stringify(caught.catch.tags)}`);
  // And a species on the team is no catch at all, however well it would judge: the profile's roots are the tally.
  const withDrilbur = mount({ wave: 60, party: [...lowTeam().slice(0, 5), pk(26, 37, [["Dig","Ground",80,"P"]])] })
    .model().options[1];
  assert.ok(!withDrilbur.reasons.some(r => r.catch && /Excadrill/.test(r.text)), JSON.stringify(withDrilbur.reasons));
}

// ---- Trainer shares take the look-back and the gym block, and the gym leader is the big fight (game-code.md §10)
{
  const { scene } = mount({ wave: 30 });
  const share = (wave, part) => globalThis.__bm.spawnsFor(scene, 7, wave)[part];
  const sum = (list, part) => list.reduce((t, e) => t + e[part], 0);
  // Waves 32, 33, then 34–39 with two waves of look-back: 1/8 + 7/64 + 6·49/512.
  near(sum(share(30, "list"), "trainer"), (64 + 56 + 6 * 49) / 512 / 10, "trainer share over waves 31–40");
  // Waves 42–47 roll; 48 and 49 sit within two of the gym at 50.
  const gymWaves = globalThis.__bm.spawnsFor(scene, 7, 40);
  near(sum(gymWaves.list, "trainer"), (64 + 56 + 4 * 49) / 512 / 10, "no trainer rolls next to the gym");
  near(sum(gymWaves.list, "boss"), 0.1, "the gym leader's party is the tenth wave");
  assert.deepEqual(gymWaves.leaders.map(l => [l.name, l.specialty]), [["Janine", "Poison"]]);
  assert.deepEqual(gymWaves.bigFight, { wave: 50, gym: true });
  const parasol = gymWaves.trainers.find(t => t.name === "Parasol Lady");
  assert.deepEqual(parasol.species.map(x => x.id).sort((a, b) => a - b), [1, 8, 11, 52]);
  assert.deepEqual(gymWaves.trainers.find(t => t.name === "Black Belt").species.map(x => x.id), [20, 24, 5]);
}

// ---- The gym leader ahead is a reason and part of the score
{
  const { el } = mount({ wave: 40 });
  console.log(`== gym at wave 50\n${lines(el)}`);
  const [swamp, site] = globalThis.__coachHud.last().options;
  assert.ok(swamp.reasons.some(r => r.gym && r.good && r.text === "W50 gym Poison (Janine): 2 hit SE"), JSON.stringify(swamp.reasons));
  assert.ok(site.reasons.some(r => r.gym && r.good && r.text === "W50 gym Rock (Brock): 2 hit SE, Lapras weak"), JSON.stringify(site.reasons));
  assert.equal(swamp.bossFit, 100);
  assert.equal(site.bossFit, 75);
  const blind = mount({ wave: 40, t: tables({ trainers: undefined }) }).model().options[0];
  assert.equal(blind.fight, null);
  assert.equal(blind.trainers, null);
  assert.ok(blind.score > 0);
  // The scan commits the tables once biomes and species are in and fills the rest in place, so the memo's key
  // counts the tables rather than asking whether there are any (#381).
  const want = mount({ wave: 40 }).model().options[0].trainers;
  const late = tables({ trainers: undefined });
  const landing = mount({ wave: 40, t: late });
  const before = landing.model().options[0].trainers;
  late.trainers = TRAINERS;
  globalThis.__hud["98-watch"].rebuild();
  console.log(`== trainer configs landing late\nbefore  ${JSON.stringify(before)}\nafter   ${JSON.stringify(landing.model().options[0].trainers)}`);
  assert.equal(before, null);
  assert.deepEqual(landing.model().options[0].trainers, want, "the trainers that landed after the card drew");
}

// ---- Wild forms follow the game's evolution thresholds (game-code.md §10)
{
  mount();
  const f = globalThis.__bm.formsFor;
  assert.deepEqual(f(5, 40), { 5: 0.5, 6: 0.5 }, "Croagunk at 40: 37–44, four of eight levels reached");
  assert.deepEqual(f(8, 36), { 9: 7 / 8, 10: 1 / 8 }, "Mudkip at 36: Marshtomp for sure, then Swampert at 36–43");
  assert.deepEqual(f(24, 60), { 28: 1 }, "Timburr at 60: past the wild trade delay (50–60)");
  near(f(24, 55)[28], 6 / 11, "Timburr at 55: six of 50–60");
  assert.deepEqual(f(28, 40, 1), { 25: 1 }, "a boss Conkeldurr at 40 is a Gurdurr (normal delay 45)");
  assert.deepEqual(f(28, 46, 1), { 28: 1 }, "…and itself at 46");
}

// ---- A Daily event seed's forced tier replaces the roll for its wave
{
  const daily = forcedWaves => ({ isDaily: true, dailyConfig: forcedWaves ? { forcedWaves } : undefined, getWaveForDifficulty: w => w + 30, challenges: [] });
  const { scene } = mount({ gameMode: daily() });
  const mudkip = () => globalThis.__bm.spawnsFor(scene, 7, 30).list.find(e => e.id === 8).wild;
  const plain = mudkip();
  scene.gameMode = daily([{ waveIndex: 31, tier: 2 }]);
  // Wave 31 is difficulty 61, so Azelf is legal and Mudkip's share of the wave was 31/512 before the tier was forced.
  near(mudkip() - plain, (1 - 31 / 512) / 10, "one wave's rare share becomes 1");
}

// ---- The fainted are back for the next biome, and out under Hardcore
{
  const party = team({ lax: { hp: 0 } });
  const normal = mount({ party }).model();
  assert.equal(normal.fainted, 0);
  assert.ok(normal.options[1].reasons.some(r => /Snorlax/.test(r.text)), "a fainted Snorlax still fights in the next biome");
  const { el } = mount({ party, gameMode: { challenges: [{ id: 9, value: 1 }] } });
  const hard = globalThis.__coachHud.last();
  console.log(`== hardcore, Snorlax fainted\n${lines(el)}`);
  assert.equal(hard.fainted, 1);
  assert.ok(!hard.options[1].reasons.some(r => /Snorlax/.test(r.text)), JSON.stringify(hard.options[1].reasons));
}

// ---- A shop on the way is a way back too, not only a heal: Limited Support 1 removes the heal but still shops every
// wave, so Snorlax counts at full health where the old special case (heals only) would have called it fainted (#570)
{
  const party = team({ lax: { hp: 0 } });
  const { el } = mount({ party, gameMode: { isFixedBattle: () => false, challenges: [{ id: 8, value: 1 }] } });
  console.log(`== Limited Support 1, no heal but a shop on the way revives Snorlax\n${lines(el)}`);
  const m = globalThis.__coachHud.last();
  assert.equal(m.fainted, 0, "the shop ahead of W40 is a way back");
  assert.ok(m.options[1].reasons.some(r => /Snorlax/.test(r.text)), JSON.stringify(m.options[1].reasons));
}

// ---- A near tie gets a pick anyway, by the unrounded score, and says what decided it
{
  const { el } = mount({ labels: ["Swamp", "Marsh"] });
  console.log(`== swamp vs marsh\n${lines(el)}`);
  const m = globalThis.__coachHud.last();
  const [a, b] = m.options;
  assert.ok(Math.abs(a.score - b.score) <= 2, `a near tie: ${a.score} vs ${b.score}`);
  const best = m.options[m.pick], other = m.options[1 - m.pick];
  assert.equal(other.verdict, "close");
  assert.ok(best.reasons[0].edge && best.reasons[0].text.startsWith(`edges ${other.label} on `), JSON.stringify(best.reasons));
}
// ---- A wave spawns from the pool built at its X0 or X5, not at its own time of day (game-code.md §10)
{
  const { scene } = mount({ offset: 3 });
  const tod = ["dawn", "day", "dusk", "night"];
  const at = w => tod[globalThis.__bm.spawnTimeOfDay(scene, w, 7)];
  console.log("== spawn pool time of day, waveCycleOffset 3");
  console.log([11, 12, 14, 15, 17, 19, 20].map(w => `${w}:${at(w)}`).join("  "));
  // The clock turns DAY → DUSK entering wave 12 and DUSK → NIGHT entering 17, but the pool doesn't move with it.
  assert.equal(at(11), "day");
  assert.equal(at(12), "day", "X1–X4 all spawn from the pool the X0 built");
  assert.equal(at(14), "day");
  assert.equal(at(15), "dusk", "the X5 rebuild is the one that moves it");
  assert.equal(at(17), "dusk", "and it holds to the end of the block, clock or no clock");
  assert.equal(at(20), "dusk");
  assert.equal(tod[globalThis.__bm.spawnTimeOfDay(scene, 12, 24)], "night", "ABYSS (24) is night whatever the wave");
}

// ---- Past Endless wave 250 every wave has a boss share, not only the tenth (game-code.md §10)
{
  const endless = { isEndless: true, hasRandomBosses: true, isWaveFinal: w => w % 250 === 0, isBoss: w => w % 10 === 0,
    isFixedBattle: () => false, getWaveForDifficulty: w => w, challenges: [] };
  const classic = { isClassic: true, isWaveFinal: w => w === 200, isBoss: w => w % 10 === 0, isFixedBattle: () => false,
    getWaveForDifficulty: w => w, challenges: [] };
  const share = (gameMode, wave) => {
    const { scene } = mount({ wave, gameMode });
    return globalThis.__bm.spawnsFor(scene, 7, wave).list.reduce((t, e) => t + e.boss, 0);
  };
  const late = share(endless, 300), early = share(endless, 100), plain = share(classic, 300);
  console.log(`== boss share  endless w301–310 ${late.toFixed(4)}  endless w101–110 ${early.toFixed(4)}  classic ${plain.toFixed(4)}`);
  near(plain, 0.1, "classic: one wave in ten is the boss, and no other");
  near(early, 0.1, "nothing rolls before wave 250");
  // Waves 301–309 each roll `ceil(51/50) × 2 = 4 %`, on top of the tenth wave's certainty.
  near(late, (1 + 9 * 0.04) / 10, "past 250, 4 % of each other wave is a boss too");
  assert.ok(late > plain);
}

// ---- A build that throws draws an unjudged card that says why, rather than killing the panel
{
  const broken = team();
  broken[0].getTypes = () => { throw new Error("no types"); };
  const { el, model } = mount({ party: broken });
  console.log(`== build throws\n${lines(el)}`);
  const m = model();
  jsonSafe(m, "model");
  assert.equal(m.kind, "biome");
  assert.equal(m.pick, -1);
  assert.deepEqual(m.options.map(o => o.label), ["Swamp", "Construction Site"]);
  assert.equal(m.unread, "biome: no types");
  assert.equal(globalThis.__coachHud.summary().biome, "Swamp · Construction Site");
}

console.log("ok");
