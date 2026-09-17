// Biome choice card: on SelectBiomePhase's option screen the HUD ranks the offered biomes for the party — wild and
// trainer encounters over the ten waves the biome covers (tier odds, time of day, luck, trainer odds, the gym leader or
// wild boss on the tenth wave), how the party's moves hit them and how they hit the party, catches that fill a gap.
// Game tables are mocked with small invented pools and trainers (not the game's), injected the way loadGameTables would
// find them. Covers: the pick and its reasons, the rendered card in both views and the summary line, the card before
// the tables load, option labels resolved by link order when names don't match, tier and time-of-day weighting,
// legend-like species kept out of early waves, the trainer odds and their block near a gym, the gym leader as the big
// fight, wild evolutions and forced prevolutions by the game's level thresholds, luck and a Daily forced tier, who
// counts when fainted, and a near tie that names what decided it. Prints the rendered card, so run.mjs keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };

// ---- Species registry mock: id → [name, types, bst, direct evolutions [[id, level, evoLevelThreshold?]], legendary]
const SPECIES = {
  1: ["Wooper", ["Water","Ground"], 210, [[2, 20]]], 2: ["Quagsire", ["Water","Ground"], 430],
  3: ["Ekans", ["Poison"], 288, [[4, 22]]], 4: ["Arbok", ["Poison"], 448],
  5: ["Croagunk", ["Poison","Fighting"], 300, [[6, 37]]], 6: ["Toxicroak", ["Poison","Fighting"], 490],
  7: ["Gulpin", ["Poison"], 302],
  8: ["Mudkip", ["Water"], 310, [[9, 16]]], 9: ["Marshtomp", ["Water","Ground"], 405, [[10, 36]]], 10: ["Swampert", ["Water","Ground"], 535],
  11: ["Toxapex", ["Poison","Water"], 495],
  20: ["Machop", ["Fighting"], 305, [[21, 28]]], 21: ["Machoke", ["Fighting"], 405],
  22: ["Magnemite", ["Electric","Steel"], 325, [[23, 30]]], 23: ["Magneton", ["Electric","Steel"], 465],
  // Gurdurr → Conkeldurr is a trade evolution: level 1, delayed by per-kind thresholds (strong, normal, wild).
  24: ["Timburr", ["Fighting"], 305, [[25, 25]]], 25: ["Gurdurr", ["Fighting"], 405, [[28, 1, [40, 45, 50]]]],
  26: ["Drilbur", ["Ground"], 328, [[27, 31]]], 27: ["Excadrill", ["Ground","Steel"], 508],
  28: ["Conkeldurr", ["Fighting"], 505],
  30: ["Sableye", ["Dark","Ghost"], 380], 31: ["Houndour", ["Dark","Fire"], 330],
  40: ["Azelf", ["Psychic"], 580, [], true],
  50: ["Garchomp", ["Dragon","Ground"], 600], 51: ["Snorlax", ["Normal"], 540], 52: ["Lapras", ["Water","Ice"], 535], 53: ["Pidgeotto", ["Normal","Flying"], 349, [[54, 36]]], 54: ["Pidgeot", ["Normal","Flying"], 479], 55: ["Alakazam", ["Psychic"], 500],
  60: ["Geodude", ["Rock","Ground"], 300, [[61, 25]]], 61: ["Graveler", ["Rock","Ground"], 390],
};
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

// ---- Trainer configs: a filter trainer, a pool trainer (a nested entry the game rerolls past), two gym leaders.
const ofType = t => sp => sp.isOfType(TY.indexOf(t));
const TRAINERS = {
  100: { trainerType: 100, name: "Parasol Lady", partyTemplates: [], speciesFilter: ofType("Water") },
  101: { trainerType: 101, name: "Black Belt", partyTemplates: [], speciesPools: { 0: [20, 24], 1: [[5, 6], 5] } },
  200: { trainerType: 200, name: "Janine", partyTemplates: [], isBoss: true, specialtyType: TY.indexOf("Poison"), speciesFilter: ofType("Poison") },
  201: { trainerType: 201, name: "Brock", partyTemplates: [], isBoss: true, specialtyType: TY.indexOf("Rock"), speciesFilter: ofType("Rock") },
};

// ---- Biomes: pool[tier][timeOfDay], -1 = all day; trainerPool[tier]. Invented pools shaped like the game's.
const tiers = (spec, t = {}) => Object.fromEntries([0,1,2,3,4,5,6,7,8].map(i => [i, { [-1]: spec[i] ?? [], 0: [], 1: [], 2: [], 3: [], ...(t[i] ?? {}) }]));
const trainers = spec => Object.fromEntries([0,1,2,3,4,5,6,7,8].map(i => [i, spec[i] ?? []]));
const swampPool = tiers({ 0: [1, 3, 7], 1: [5], 2: [8], 4: [40], 5: [11] }, { 0: { 2: [5], 3: [5] } });
const BIOMES = new Map([
  [3, { biomeId: 3, pokemonPool: tiers({ 0: [53] }), trainerPool: trainers({}), trainerChance: 8, biomeLinks: [7, 26, [30, 4]] }],
  [7, { biomeId: 7, pokemonPool: swampPool, trainerPool: trainers({ 0: [100], 1: [101], 5: [200] }), trainerChance: 8, biomeLinks: [19, 3] }],
  [26, { biomeId: 26, pokemonPool: tiers({ 0: [20, 22], 1: [24, 26], 5: [28] }), trainerPool: trainers({ 0: [101], 5: [201] }), trainerChance: 6, biomeLinks: [[41, 3], 21] }],
  [30, { biomeId: 30, pokemonPool: tiers({ 0: [30, 31] }), trainerPool: trainers({}), trainerChance: 4, biomeLinks: [3] }],
  // The Swamp with one more rare species: nearly the same card.
  [33, { biomeId: 33, pokemonPool: { ...swampPool, 2: { ...swampPool[2], [-1]: [8, 60] } }, trainerPool: trainers({ 0: [100], 1: [101], 5: [200] }), trainerChance: 8, biomeLinks: [3] }],
]);
const NAMES = { 3: "Tall Grass", 7: "Swamp", 19: "Graveyard", 21: "Factory", 26: "Construction Site", 30: "Slum", 33: "Marsh", 41: "Laboratory" };
const tables = (over = {}) => ({ biomes: BIOMES, species: registry, trainers: TRAINERS, biomeName: id => NAMES[id] ?? `biome${id}`, ...over });

// ---- Party
const pk = (id, lv, moves, { hp = 100, luck = 0 } = {}) => {
  const sp = species(id);
  return { id: `p${id}`, name: sp.name, level: lv, hp, getMaxHp: () => 100, species: sp,
    getTypes: () => [sp.type1, sp.type2].filter(t => t != null), getAbility: () => ({ name: "x" }), hasPassive: () => false,
    getLuck: () => luck, isAllowedInBattle: () => hp > 0,
    getIconAtlasKey: () => "k", getIconId: () => String(id),
    moveset: moves.map(([n, t, p, c]) => ({ moveId: n, getName: () => n, getMove: () => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c] }) })) };
};
const team = (opts = {}) => [
  pk(50, 40, [["Earthquake","Ground",100,"P"],["Dragon Claw","Dragon",80,"P"]], opts.chomp),
  pk(51, 38, [["Body Slam","Normal",85,"P"]], opts.lax),
  pk(52, 38, [["Surf","Water",90,"S"],["Ice Beam","Ice",90,"S"]]),
  pk(55, 37, [["Psychic","Psychic",90,"S"]]),
];

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

// Mounts the HUD on a biome-choice scene. `tables`: what loadGameTables would have found (null: not loaded yet).
const mount = ({ view = "full", labels = ["Swamp", "Construction Site"], party = team(), wave = 30, from = 3, offset = 0, t = tables(), dex = {}, gameMode } = {}) => {
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
  globalThis.localStorage = { getItem: () => view, setItem() {} };
  eval(bundle("hud", { expose: true }));
  // The chunk scan finds nothing under node: hand over what it would have found, and draw the card again.
  const { setGameTables, spawnsFor, formsFor } = globalThis.__hud["47-biome"];
  setGameTables(t);
  globalThis.__hud["90-render"].tick();
  globalThis.__bm = { spawnsFor, formsFor };
  return { el, scene, handler, model: () => globalThis.__coachHud.last() };
};

const jsonSafe = (x, label) => assert.equal(JSON.stringify(JSON.parse(JSON.stringify(x))), JSON.stringify(x), `${label}: JSON-safe`);
const near = (a, b, label, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);

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
  assert.deepEqual(swamp.trainers, { pct: 8, names: ["Parasol Lady", "Black Belt"] }, "the trainers met, by share");
  assert.deepEqual(swamp.fight, { wave: 40, gym: false, foes: [["Toxapex", 100]] }, "wave 40 is the Swamp's wild boss");
  assert.deepEqual(site.fight.foes, [["Gurdurr", 100]], "a level-40 boss Conkeldurr is still a Gurdurr: its trade evolution waits for 45");
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

// ---- 4. Weighting: tier odds (common ≫ rare ≫ ultra rare), each wave once, legend-like species kept out before wave 55,
// Croagunk's extra dusk/night entry only counted when the waves reach dusk, and luck lowering the roll's ceiling.
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
  const day1 = at(0); // waves 1–10: all day, so no night-only entries in the common tier
  near(w(day1, 3, "wild") / w(day1, 8, "wild"), (356 / 3) / 32, "tier odds split evenly within a tier, empty tiers drop down");
  near(w(early, 11, "boss"), 0.1, "the lone boss species is the boss wave's tenth");
  assert.equal(early.find(e => e.id === 11).wild, 0);
  const day = at(0), dusk = at(14);
  assert.ok(w(dusk, 5) > w(day, 5), `dusk adds Croagunk: day ${w(day, 5).toFixed(3)} vs dusk ${w(dusk, 5).toFixed(3)}`);
  near(w(at(30, 0, 14), 8, "wild") / w(early, 8, "wild"), 512 / 484, "luck 14 takes 28 off the 512 ceiling, all from the common tier");
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

// ---- 6. Trainer waves: X2–X9 roll 1 in trainerChance, less the chance either of the two waves before already hit, and
// not at all within two waves of a gym. The gym wave itself is always a trainer: the biome's gym leader.
{
  const { scene } = mount({ wave: 30 });
  const share = (wave, part) => globalThis.__bm.spawnsFor(scene, 7, wave)[part];
  const sum = (list, part) => list.reduce((t, e) => t + e[part], 0);
  // Waves 32, 33, then 34–39 with two waves of look-back: 1/8 + 7/64 + 6·49/512.
  near(sum(share(30, "list"), "trainer"), (64 + 56 + 6 * 49) / 512 / 10, "trainer share over waves 31–40");
  // Waves 41–50: 48 and 49 sit within two of the gym at 50, which is a trainer for sure.
  const gymWaves = globalThis.__bm.spawnsFor(scene, 7, 40);
  near(sum(gymWaves.list, "trainer"), (64 + 56 + 4 * 49) / 512 / 10, "no trainer rolls next to the gym");
  near(sum(gymWaves.list, "boss"), 0.1, "the gym leader's party is the tenth wave");
  assert.deepEqual(gymWaves.leaders.map(l => [l.name, l.specialty]), [["Janine", "Poison"]]);
  assert.deepEqual(gymWaves.bigFight, { wave: 50, gym: true });
  // A trainer's party: the pool trainer's nested entry is skipped, the filter trainer's species are taken to their base form.
  const parasol = gymWaves.trainers.find(t => t.name === "Parasol Lady");
  assert.deepEqual(parasol.species.map(x => x.id).sort((a, b) => a - b), [1, 8, 11, 52]);
  assert.deepEqual(gymWaves.trainers.find(t => t.name === "Black Belt").species.map(x => x.id), [20, 24, 5]);
}

// ---- 7. The gym leader ahead as a reason and in the score: Janine's Poison meets two SE hitters and no weakness;
// Brock's Rock meets two hitters but Lapras is weak.
{
  const { el } = mount({ wave: 40 });
  console.log(`== gym at wave 50 (full)\n${lines(el)}`);
  const [swamp, site] = globalThis.__coachHud.last().options;
  assert.ok(swamp.reasons.some(r => r.gym && r.good && r.text === "W50 gym Poison (Janine): 2 hit SE"), JSON.stringify(swamp.reasons));
  assert.ok(site.reasons.some(r => r.gym && r.good && r.text === "W50 gym Rock (Brock): 2 hit SE, Lapras weak"), JSON.stringify(site.reasons));
  assert.equal(swamp.bossFit, 100);
  assert.equal(site.bossFit, 75);
  // Without the trainer configs the trainer waves drop out of the weighting, and there is no gym to judge.
  const blind = mount({ wave: 40, t: tables({ trainers: undefined }) }).model().options[0];
  assert.equal(blind.fight, null);
  assert.equal(blind.trainers, null);
  assert.ok(blind.score > 0);
}

// ---- 8. Wild evolutions by the game's thresholds: an even chance per level across [t, round(1.2·t)], a delayed trade
// evolution, and a forced prevolution for a boss below its own threshold.
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

// ---- 9. A Daily event seed's forced tier: wave 31's first spawn comes from the rare tier.
{
  const daily = forcedWaves => ({ isDaily: true, dailyConfig: forcedWaves ? { forcedWaves } : undefined, getWaveForDifficulty: w => w + 30, challenges: [] });
  const { scene } = mount({ gameMode: daily() });
  const mudkip = () => globalThis.__bm.spawnsFor(scene, 7, 30).list.find(e => e.id === 8).wild;
  const plain = mudkip();
  scene.gameMode = daily([{ waveIndex: 31, tier: 2 }]);
  // Daily: wave 35 and 40 are trainers (40 the gym leader), so eight wild waves. Wave 31 counts as difficulty 61, so
  // Azelf is legal and the ultra rare roll no longer drops to Mudkip: 31/512 of it goes to certain.
  near(mudkip() - plain, (1 - 31 / 512) / 10, "one wave's rare share becomes 1");
}

// ---- 10. The fainted: back for the next biome (the X1 heal revives), out under Hardcore.
{
  const party = team({ lax: { hp: 0 } });
  const normal = mount({ party }).model();
  assert.equal(normal.fainted, 0);
  assert.ok(normal.options[1].reasons.some(r => /Snorlax/.test(r.text)), "a fainted Snorlax still fights in the next biome");
  const { el } = mount({ party, gameMode: { challenges: [{ id: 9, value: 1 }] } });
  const hard = globalThis.__coachHud.last();
  console.log(`== hardcore, Snorlax fainted (full)\n${lines(el)}`);
  assert.equal(hard.fainted, 1);
  assert.ok(!hard.options[1].reasons.some(r => /Snorlax/.test(r.text)), JSON.stringify(hard.options[1].reasons));
}

// ---- 11. A near tie gets a pick anyway, by the unrounded score, and says what decided it.
{
  const { el } = mount({ view: "mini", labels: ["Swamp", "Marsh"] });
  console.log(`== swamp vs marsh (mini)\n${lines(el)}`);
  const m = globalThis.__coachHud.last();
  const [a, b] = m.options;
  assert.ok(Math.abs(a.score - b.score) <= 2, `a near tie: ${a.score} vs ${b.score}`);
  const best = m.options[m.pick], other = m.options[1 - m.pick];
  assert.equal(other.verdict, "close");
  assert.ok(best.reasons[0].edge && best.reasons[0].text.startsWith(`edges ${other.label} on `), JSON.stringify(best.reasons));
}
console.log("ok");
