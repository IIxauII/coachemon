import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { AbilityId, EvoCondKey, MoveCategory, MoveTarget, Stat, TerrainType, WeatherType } from "../../../../src/enums/generated.ts";
import { TY } from "./fake-mon.mjs";

// Test fixtures, not game data: [id, name, types, base stats, cost,
// evolutions [[id, level, item?, condition data?, evoLevelThreshold?]], passive, hidden].
const SPECIES = [
  [1, "Bulbasaur", ["Grass","Poison"], [45,49,49,65,65,45], 3, [[2, 16], [3, 32]], 11, 12],
  [2, "Ivysaur", ["Grass","Poison"], [60,62,63,80,80,60]],
  [3, "Venusaur", ["Grass","Poison"], [80,82,83,100,100,80]],
  [4, "Charmander", ["Fire"], [39,52,43,60,50,65], 3, [[5, 16], [6, 36]], 13, 14],
  [5, "Charmeleon", ["Fire"], [58,64,58,80,65,80]],
  [6, "Charizard", ["Fire","Flying"], [78,84,78,109,85,100]],
  [7, "Squirtle", ["Water"], [44,48,65,50,64,43], 3, [[8, 16], [9, 36]], 15, 16],
  [8, "Wartortle", ["Water"], [59,63,80,65,80,58]],
  [9, "Blastoise", ["Water"], [79,83,100,85,105,78]],
  [16, "Pidgey", ["Normal","Flying"], [40,45,40,35,35,56], 1, [[17, 18], [18, 36]], 17, 18],
  [17, "Pidgeotto", ["Normal","Flying"], [63,60,55,50,50,71]],
  [18, "Pidgeot", ["Normal","Flying"], [83,80,75,70,70,101]],
  [19, "Rattata", ["Normal"], [30,56,35,25,35,72], 1, [[20, 20]], 19, 20],
  [20, "Raticate", ["Normal"], [55,81,60,50,70,97]],
  [25, "Pikachu", ["Electric"], [35,55,40,50,50,90], 1, [[26, 1, true]], 21, 22],
  [26, "Raichu", ["Electric"], [60,90,55,90,80,110]],
  [129, "Magikarp", ["Water"], [20,10,55,15,20,80], 1, [[130, 20]], 23, 24],
  [130, "Gyarados", ["Water","Flying"], [95,125,79,60,100,81], undefined, [], 33, 23],
  [147, "Dratini", ["Dragon"], [41,64,45,50,50,50], 4, [[148, 30], [149, 55]], 25, 26],
  [148, "Dragonair", ["Dragon"], [61,84,65,70,70,70]],
  [149, "Dragonite", ["Dragon","Flying"], [91,134,95,100,100,80]],
  [298, "Azurill", ["Normal","Fairy"], [50,20,40,20,40,20], 1, [[183, 1, true], [184, 18]], 27, 28],
  [183, "Marill", ["Water","Fairy"], [70,20,50,20,50,40]],
  [184, "Azumarill", ["Water","Fairy"], [100,50,80,60,80,50]],
  [443, "Gible", ["Dragon","Ground"], [58,70,45,40,45,42], 6, [[444, 24], [445, 48]], 29, 30],
  [444, "Gabite", ["Dragon","Ground"], [68,90,65,50,55,82]],
  [445, "Garchomp", ["Dragon","Ground"], [108,130,95,80,85,102], undefined, [], 29, 34],
  [151, "Mew", ["Psychic"], [100,100,100,100,100,100], 8, [], 31, 32],
  [193, "Yanma", ["Bug","Flying"], [65,65,45,75,45,95], 3, [[469, 33, false, [{ key: EvoCondKey.MOVE, move: 246 }]]], 33, 34],
  [469, "Yanmega", ["Bug","Flying"], [86,76,86,116,56,95]],
  [1011, "Dipplin", ["Grass","Dragon"], [80,80,110,95,80,40], 3, [[1019, 1, false, [{ key: EvoCondKey.MOVE, move: 913 }], [56, 68, 80]]], 35, 36],
  [1019, "Hydrapple", ["Grass","Dragon"], [106,80,110,120,80,44]],
  [656, "Froakie", ["Water"], [41,56,40,62,44,71], 3, [[657, 16], [658, 36]], 37, 38],
  [657, "Frogadier", ["Water"], [54,63,52,83,56,97]],
  // Invented: no species in the game holds a form-change ability hidden, and Greninja's is Protean.
  [658, "Greninja", ["Water","Dark"], [72,95,67,103,71,122], undefined, [], 37, AbilityId.BATTLE_BOND],
  [479, "Rotom", ["Electric","Ghost"], [50,50,77,95,77,91], 3, [], 41],
  [86, "Seel", ["Water"], [65,45,55,45,70,45], 2, [[87, 34]], 51],
  [87, "Dewgong", ["Water","Ice"], [90,70,80,70,95,70]],
  [56, "Mankey", ["Fighting"], [40,80,35,35,45,70], 2, [[57, 28]], 53],
  [57, "Primeape", ["Fighting"], [65,105,60,60,70,95]],
  [312, "Minun", ["Electric"], [60,40,50,75,85,95], 1, [], 55],
  [263, "Zigzagoon", ["Normal"], [38,30,41,30,41,60], 1, [[264, 20]], 57],
  [264, "Linoone", ["Normal"], [78,70,61,50,61,100], undefined, [], 57],
  [436, "Bronzor", ["Steel","Psychic"], [57,24,86,24,86,23], 2, [[437, 33]], 41],
  [437, "Bronzong", ["Steel","Psychic"], [67,89,116,79,116,33], undefined, [], 41],
  [37, "Vulpix", ["Fire"], [38,41,40,50,65,65], 2, [[38, 1, true]], 60],
  [38, "Ninetales", ["Fire"], [73,76,75,81,100,100], undefined, [], 60],
  [587, "Emolga", ["Electric","Flying"], [55,75,60,75,60,103], 2, [], 62],
];
// Each form's [types, base stats, passive]; form 0 is the species' own.
const FORMS = {
  479: [[["Electric","Ghost"], [50,50,77,95,77,91], 41], [["Electric","Fire"], [50,65,107,105,107,86], 42],
    [["Electric","Water"], [50,60,107,100,107,86], 43]],
};
const ABILITY_NAMES = { 11: "Chlorophyll", 13: "Solar Power", 15: "Rain Dish", 17: "Big Pecks", 19: "Guts", 21: "Lightning Rod", 23: "Moxie", 25: "Multiscale", 27: "Huge Power", 29: "Rough Skin", 31: "Synchronize", 41: "Levitate", 42: "Flame Body", 43: "Water Absorb", 24: "Rattled", 30: "Rough Skin (H)", 33: "Intimidate", 34: "Sand Force", [AbilityId.BATTLE_BOND]: "Battle Bond",
  51: "Thick Fat", 53: "Anger Point", 55: "Friend Guard", 57: "Pickup", 60: "Drought", 62: "Electric Surge" };
// The card knows an attribute by its class name (game-code.md §22), so each fixture attribute is an instance of a class
// named like the game's.
const attr = (name, fields = {}) => Object.assign(new ({ [name]: class {} })[name](), fields);
const ABILITY_ATTRS = {
  33: [attr("PostSummonStatStageChangeAbAttr")],
  55: [attr("AlliedFieldDamageReductionAbAttr")],
  57: [attr("PostBattleLootAbAttr")],
  60: [attr("PostSummonWeatherChangeAbAttr", { weatherType: WeatherType.SUNNY }), attr("PostBiomeChangeWeatherChangeAbAttr")],
  62: [attr("PostSummonTerrainChangeAbAttr", { terrainType: TerrainType.ELECTRIC }), attr("PostBiomeChangeTerrainChangeAbAttr")],
};

const byId = new Map();
const formData = (id, types, stats, hidden) => ({
  speciesId: id, type1: TY.indexOf(types[0]), type2: types[1] ? TY.indexOf(types[1]) : null, baseStats: stats,
  baseTotal: stats.reduce((a, b) => a + b, 0), abilityHidden: hidden ?? 0,
});
for (const [id, name, types, stats, cost, evos = [], passive, hidden] of SPECIES) {
  const sp = {
    ...formData(id, types, stats, hidden), name, cost, evos,
    forms: (FORMS[id] ?? []).map(([t, st]) => formData(id, t, st, hidden)),
    getPassiveAbility: (f = 0) => FORMS[id]?.[f]?.[2] ?? passive,
    getIconAtlasKey: () => "pokemon_icons_1", getIconId: () => String(id),
  };
  byId.set(id, sp);
}
const evoLevel = {}, direct = {};
for (const [id, , , , , evos = []] of SPECIES) {
  let from = id;
  for (const [to, level, item, cond, delay] of evos) { evoLevel[to] = [level, !!item, cond, delay]; (direct[from] ??= []).push(to); from = to; }
}
for (const sp of byId.values()) {
  sp.getEvolutionLevels = () => (direct[sp.speciesId] ?? []).flatMap(to => [[to, evoLevel[to][0]], ...byId.get(to).getEvolutionLevels()]);
}
const registry = {
  getSpecies: id => byId.get(id),
  getAllStarters: () => STARTERS,
  getEvolutions: id => (direct[id] ?? []).map(to => ({ speciesId: to, level: evoLevel[to][0], item: evoLevel[to][1] ? 1 : 0,
    condition: evoLevel[to][2] ? { data: evoLevel[to][2] } : null, evoLevelThreshold: evoLevel[to][3] })),
};
const move = (name, type, category, power, moveTarget = MoveTarget.NEAR_OTHER, attrs = []) =>
  ({ name, type: TY.indexOf(type), category, power, moveTarget, chance: -1, attrs });
const tables = {
  species: registry,
  abilities: Object.assign([], Object.fromEntries(Object.entries(ABILITY_NAMES).map(([k, v]) => [k, { name: v, attrs: ABILITY_ATTRS[k] ?? [] }]))),
  moves: Object.assign([], {
    101: move("Dragon Dance", "Dragon", MoveCategory.STATUS, -1, MoveTarget.USER, [attr("StatStageChangeAttr", { stats: [Stat.ATK, Stat.SPD], stages: 1, selfTarget: true })]),
    102: move("Aqua Jet", "Water", MoveCategory.PHYSICAL, 40),
    103: move("Extreme Speed", "Normal", MoveCategory.PHYSICAL, 80),
    104: move("Bouncy Bubble", "Water", MoveCategory.SPECIAL, 60),
    105: move("Ice Beam", "Ice", MoveCategory.SPECIAL, 90),
    106: move("Encore", "Normal", MoveCategory.STATUS, -1),
    107: move("Seismic Toss", "Fighting", MoveCategory.PHYSICAL, -1, MoveTarget.NEAR_OTHER, [attr("LevelDamageAttr")]),
    108: move("Techno Blast", "Normal", MoveCategory.SPECIAL, 120, MoveTarget.NEAR_OTHER, [attr("TechnoBlastTypeAttr")]),
    109: move("Gyro Ball", "Steel", MoveCategory.PHYSICAL, -1, MoveTarget.NEAR_OTHER, [attr("GyroBallPowerAttr")]),
    // The game marks a move it has not implemented with this suffix on its name.
    110: move("Bitter Malice (N)", "Ghost", MoveCategory.SPECIAL, 75),
  }),
  eggMoves: { 129: [102, 102, 102, 101], 19: [103, 103, 103, 103], 86: [102, 102, 102, 104], 56: [102, 102, 102, 105], 312: [102, 102, 102, 106] },
};

const STARTERS = [1, 4, 7, 16, 19, 25, 129, 147, 298, 443, 151];
// Off the classic grid, so only a challenge's `valid` list offers them.
const YANMA = 193, DIPPLIN = 1011, FROAKIE = 656, ROTOM = 479;
const SEEL = 86, MANKEY = 56, MINUN = 312, ZIGZAGOON = 263, BRONZOR = 436, VULPIX = 37, EMOLGA = 587;
const OFF_GRID = [YANMA, DIPPLIN, FROAKIE, ROTOM, SEEL, MANKEY, MINUN, ZIGZAGOON, BRONZOR, VULPIX, EMOLGA];
// Every starter caught but Mew; Magikarp has its passive and rare egg move, Rattata perfect IVs, Squirtle a variant-3
// shiny, Pikachu Pokérus, Gible its passive, Froakie its hidden ability, Rotom its passive and forms 1 and 2 but not 0.
// Seel and Mankey have their rare egg move, Minun its passive and rare egg move, and Zigzagoon, Bronzor, Vulpix and
// Emolga their passive.
const account = () => {
  const dexData = {}, starterData = {};
  for (const id of [...STARTERS, ...OFF_GRID]) {
    dexData[id] = { caughtAttr: 1n | 4n | 16n | 128n, ivs: [10, 10, 10, 10, 10, 10] };
    starterData[id] = { abilityAttr: 1, passiveAttr: 0, eggMoves: 0, valueReduction: 0 };
  }
  starterData[129] = { ...starterData[129], passiveAttr: 3, eggMoves: 8 | 1 };
  dexData[19].ivs = [31, 31, 31, 31, 31, 31];
  dexData[7].caughtAttr |= 2n | 64n;
  starterData[443] = { ...starterData[443], passiveAttr: 1, abilityAttr: 1 | 4 };
  starterData[FROAKIE] = { ...starterData[FROAKIE], abilityAttr: 1 | 4 };
  dexData[ROTOM].caughtAttr = 1n | 4n | 16n | (128n << 1n) | (128n << 2n);
  starterData[ROTOM] = { ...starterData[ROTOM], passiveAttr: 1 };
  for (const id of [SEEL, MANKEY]) starterData[id].eggMoves = 8;
  starterData[MINUN] = { ...starterData[MINUN], passiveAttr: 1, eggMoves: 8 };
  for (const id of [ZIGZAGOON, BRONZOR, VULPIX, EMOLGA]) starterData[id].passiveAttr = 1;
  delete dexData[151];
  return { dexData, starterData };
};

// Fresh Start's STARTER_SELECT_MODIFY strips unlocks but, from 1.12.1.0, leaves shiny and variants (game-code.md §23).
const freshStart = {
  id: 4, value: 1, applyStarterChoice: () => true,
  applyStarterSelectModify: (id, dexEntry, starterDataEntry) => {
    Object.assign(starterDataEntry, { eggMoves: 0, passiveAttr: 0, abilityAttr: starterDataEntry.abilityAttr & 3, valueReduction: 0 });
    for (let i = 0; i < 6; i++) dexEntry.ivs[i] = Math.min(dexEntry.ivs[i], 15);
    return true;
  },
};
// `valid`: the grid's challenge-filtered ids, which a challenge run's candidates come from; the other modes take the
// registry's starters.
// `getSpeciesDefaultDexAttrProps`' form (game-code.md §23).
const defaultForm = caught => { for (let i = 0; i < 32; i++) if (caught & (128n << BigInt(i))) return i; return 0; };
// `forms`: a saved form preference per species id.
// `unlocks`: starter data laid over the account's, by species id. `rare`: a rare egg move id in place of the table's,
// by species id.
const mount = ({ limit = 10, chosen = [], valid = STARTERS, challenges = [], withTables = true, looking = null, onGrid = true, picking = true, forms = {}, unlocks = {}, rare = {} }) => {
  const { dexData, starterData } = account();
  for (const [id, st] of Object.entries(unlocks)) Object.assign(starterData[id], st);
  const species = id => byId.get(id);
  const shown = valid.slice(0, 81);
  const containers = shown.map(id => ({ species: species(id), cost: species(id).cost, icon: { texture: { key: "pokemon_icons_1" }, frame: { name: String(id) } } }));
  const starterPreferences = Object.fromEntries(Object.entries(forms).map(([id, formIndex]) => [id, { formIndex }]));
  const props = id => ({ formIndex: starterPreferences[id]?.formIndex ?? defaultForm(dexData[id].caughtAttr), shiny: false, variant: 0, female: false });
  const handler = {
    starterPreferences,
    starterSelectCallback: picking ? () => {} : null,
    valueLimitLabel: { text: `${chosen.reduce((t, id) => t + species(id).cost, 0)}/${limit}` },
    partyStarterIds: chosen,
    partyStarters: chosen.map(id => ({ speciesId: id, passive: (starterData[id].passiveAttr & 3) === 3, abilityIndex: 0, formIndex: props(id).formIndex })),
    filteredStarterIds: valid,
    starterContainers: containers,
    pokerusSpeciesIds: [25],
    lastStarterId: looking ?? shown[0],
    cursorObj: { visible: looking !== null && onGrid },
    getStarterDexAttrPropsFromPreferences: props,
  };
  const scene = {
    ui: { handlers: { 10: handler }, mode: 10, getHandler: () => handler },
    phaseManager: { getCurrentPhase: () => ({ phaseName: "SelectStarterPhase" }) },
    gameData: { dexData, starterData, getSpeciesStarterValue: id => species(id).cost },
    gameMode: { challenges, modeId: challenges.length ? 4 : 0 }, // `GameModes.CHALLENGE`, `GameModes.CLASSIC`
    currentBattle: null, getPlayerParty: () => [], getEnemyParty: () => [], modifiers: [],
  };
  const { card } = mountHud({ scene });
  // Under node the chunk scan finds no tables: hand them over and draw again, or the card stays the first tick's
  // estimate.
  if (withTables) {
    const eggMoves = { ...tables.eggMoves };
    for (const [id, move] of Object.entries(rare)) eggMoves[id] = [...(eggMoves[id] ?? [102, 102, 102]).slice(0, 3), move];
    globalThis.__hud["04-game-tables"].setGameTables({ ...tables, eggMoves });
    globalThis.__hud["98-watch"].rebuild();
  }
  return { card, handler, model: globalThis.__coachHud.last(), summary: globalThis.__coachHud.summary() };
};

const show = (label, opts) => {
  const last = mount(opts);
  console.log(`== ${label}\n${last.card()}`);
  console.log(`summary ${last.summary?.starters}`);
  return last.model;
};
const costOf = name => byId.get([...byId.values()].find(sp => sp.name === name).speciesId).cost;
const checkBudget = (m, limit, label) => {
  assert.ok(m.picks.length > 0, `${label}: a proposal`);
  for (const t of m.picks) {
    const names = t.members.map(x => x.name);
    assert.ok(names.length <= 6, `${label}: at most six`);
    assert.equal(new Set(names).size, names.length, `${label}: no duplicates`);
    const cost = names.reduce((s, n) => s + costOf(n), 0);
    assert.ok(cost <= limit, `${label}: ${t.label} costs ${cost} of ${limit}`);
    assert.equal(t.cost, cost, `${label}: ${t.label} shows its cost`);
    assert.ok(!names.includes("Mew"), `${label}: uncaught Mew is never proposed`);
  }
};

// ---- A classic grid, nothing picked yet: three proposals within 10 points, the cursor on Rattata.
{
  const m = show("classic, 10 points", { looking: 19 });
  checkBudget(m, 10, "classic");
  assert.equal(m.kind, "starters");
  assert.deepEqual(m.picks.map(t => t.label).slice(0, 1), ["best"]);
  assert.ok(m.viewing && m.viewing.name === "Rattata", "cursor line");
  const karp = m.picks[0].members.find(x => x.name === "Magikarp") ?? m.picks.flatMap(t => t.members).find(x => x.name === "Magikarp");
  if (karp) assert.ok(karp.why.some(w => /passive Intimidate|rare egg move Dragon Dance/.test(w)), "Magikarp's unlocks are named");
}

// ---- The card names the final form's passive and hidden ability, after that form where the starter's differs.
{
  const karp = mount({ looking: 129 }).model.viewing.why;
  assert.ok(karp.includes("passive Intimidate (Gyarados)"), karp.join(" · "));
  const gible = mount({ looking: 443 }).model.viewing.why;
  assert.ok(gible.includes("passive Rough Skin"), gible.join(" · "));
  assert.ok(gible.includes("hidden Sand Force (Garchomp)"), gible.join(" · "));
}

// ---- Gible is already on the team: every proposal keeps it and spends the 4 points left.
{
  const m = show("Gible picked", { chosen: [443] });
  checkBudget(m, 10, "chosen");
  for (const t of m.picks) assert.ok(t.members.some(x => x.name === "Gible" && x.chosen), `${t.label} keeps Gible`);
  assert.equal(m.spent, 6);
}

// ---- The game's tables aren't read yet: finals are estimated, and the card says so.
{
  const m = show("no tables", { withTables: false });
  checkBudget(m, 10, "no tables");
  assert.equal(m.data, false);
}

// ---- Single type, 1 point: Azurill is valid only through Marill, so a strict member is picked (game-code.md §23).
{
  const water = { id: 1, value: 11, applyStarterChoice: (sp, holder) => { if (sp.type1 !== 10 && sp.type2 !== 10) holder.value = false; return true; } };
  const m = show("single type, 1 point", { limit: 1, valid: [7, 129, 298], challenges: [water] });
  checkBudget(m, 1, "mono");
  for (const t of m.picks) assert.ok(t.members.some(x => x.name === "Magikarp" || x.name === "Squirtle"), `${t.label} has a strict Water member`);
  assert.equal(m.mono, true);
}

// ---- Fresh Start: no passive, egg moves, luck or high IVs reach the reasons.
{
  const m = show("Fresh Start", { challenges: [freshStart], looking: 129 });
  checkBudget(m, 10, "fresh");
  const why = m.picks.flatMap(t => t.members.flatMap(x => x.why)).concat(m.viewing?.why ?? []).join(" ");
  assert.ok(!/passive|egg move|luck|IVs 186/.test(why), `Fresh Start strips unlocks: ${why}`);
}

// ---- The Moveset Randomizer's STARTER_SELECT_MODIFY takes egg moves off the grid, so none is a reason.
{
  const randomizer = { id: 11, value: 1, applyStarterSelectModify: (id, dexEntry, starterDataEntry) => { starterDataEntry.eggMoves = 0; return true; } };
  const { model } = mount({ challenges: [randomizer], looking: 129 });
  const why = model.picks.flatMap(t => t.members.flatMap(x => x.why)).concat(model.viewing?.why ?? []).join(" ");
  assert.ok(!/egg move/.test(why), why);
  assert.ok(/passive Intimidate/.test(why), why);
}

// ---- The Ability Randomizer at 1 rerolls every ability slot, the hidden one too, but leaves the passive.
{
  const m = show("Ability Randomizer 1", { challenges: [{ id: 12, value: 1 }], looking: 443 });
  const why = m.viewing.why.join(" ");
  assert.ok(!/hidden/.test(why), why);
  assert.ok(/passive Rough Skin/.test(why), why);
}

// ---- From 2 it rerolls the passive as well: still a second ability, but not the species' own.
{
  const own = mount({ challenges: [{ id: 12, value: 1 }], looking: 443 }).model.viewing;
  const m = show("Ability Randomizer 2", { challenges: [{ id: 12, value: 2 }], looking: 443 });
  const why = m.viewing.why.join(" ");
  assert.ok(/random passive/.test(why) && !/Rough Skin/.test(why), why);
  assert.ok(m.viewing.value < own.value, `${m.viewing.value} < ${own.value}`);
}

// ---- At 3 it spares the form-change abilities from the reroll, so Greninja keeps a hidden Battle Bond.
{
  const at = value => mount({ challenges: [{ id: 12, value }], valid: [...STARTERS, FROAKIE], looking: FROAKIE }).model.viewing.why;
  assert.ok(at(3).includes("hidden Battle Bond (Greninja)"), at(3).join(" · "));
  assert.ok(!at(2).some(w => /hidden/.test(w)), at(2).join(" · "));
}

// ---- The Moveset Randomizer at 1 rerolls the level-up moves, so Yanma won't learn the move Yanmega needs.
const yanmaUnder = value => ({ challenges: [{ id: 11, value }], valid: [...STARTERS, YANMA], looking: YANMA });
{
  const yanmaOff = mount(yanmaUnder(0)).model.viewing;
  const m = show("Moveset Randomizer 1", yanmaUnder(1));
  assert.ok(/Yanmega needs a move/.test(m.viewing.why.join(" ")), m.viewing.why.join(" "));
  assert.ok(m.viewing.value < yanmaOff.value, `${m.viewing.value} < ${yanmaOff.value}`);
}

// ---- From 2 it drops the move from the evolution, which leaves Yanma a plain level-33 evolver.
{
  const yanmaOff = mount(yanmaUnder(0)).model.viewing;
  const m = show("Moveset Randomizer 2", yanmaUnder(2));
  const why = m.viewing.why.join(" ");
  assert.ok(/final BST 515 \(Yanmega\)/.test(why) && !/condition|needs a move/.test(why), why);
  assert.ok(m.viewing.value > yanmaOff.value, `${m.viewing.value} > ${yanmaOff.value}`);
}

// ---- From 2 a level-1 evolution that needs a move lands on 50, whatever its `evoLevelThreshold` (game-code.md §23).
{
  const { model } = mount({ challenges: [{ id: 11, value: 2 }], valid: [...STARTERS, DIPPLIN], looking: DIPPLIN });
  assert.ok(model.viewing.why.includes("but evolves at L50"), model.viewing.why.join(" · "));
}

// ---- Under the Moveset Randomizer only the stats name a carry, so bulky Venusaur and Blastoise are none.
{
  const off = mount({ challenges: [{ id: 11, value: 0 }], valid: [1, 7] }).model.picks[0];
  assert.ok(!off.noCarry && off.members.some(x => x.role === "carry"), JSON.stringify(off));
  const m = show("Moveset Randomizer, bulky starters", { challenges: [{ id: 11, value: 1 }], valid: [1, 7] });
  assert.ok(m.picks[0].noCarry && !m.picks[0].members.some(x => x.role === "carry"), JSON.stringify(m.picks[0]));
}

// Rotom alone on the grid: an idle challenge makes `valid` the candidates.
const rotom = opts => ({ challenges: [{ id: 11, value: 0 }], valid: [ROTOM], looking: ROTOM, ...opts });

// ---- Without form 0 caught, Rotom is valued as Heat Rotom, the lowest form caught.
{
  const m = show("Rotom, form 0 uncaught", rotom());
  const why = m.viewing.why.join(" · ");
  assert.ok(m.viewing.why.includes("BST 520 from L5") && /final BST 520/.test(why), why);
  assert.ok(m.viewing.why.includes("passive Flame Body"), why);
  // Electric/Fire hits Water, Flying, Grass, Ice, Bug and Steel; Electric/Ghost would hit four.
  assert.equal(m.picks[0].covers, 6, JSON.stringify(m.picks[0]));
}

// ---- A saved preference for another caught form wins: Wash Rotom.
{
  const m = show("Rotom, Wash saved", rotom({ forms: { [ROTOM]: 2 } }));
  const why = m.viewing.why.join(" · ");
  assert.ok(m.viewing.why.includes("BST 510 from L5"), why);
  assert.ok(m.viewing.why.includes("passive Water Absorb · immune to Water"), why);
  // Electric/Water hits Water, Flying, Fire, Ground and Rock.
  assert.equal(m.picks[0].covers, 5, JSON.stringify(m.picks[0]));
}

// ---- Cycling the form on the grid saves the preference, and the card follows it.
{
  const { handler } = mount(rotom());
  handler.starterPreferences[ROTOM] = { formIndex: 2 };
  globalThis.__hud["98-watch"].rebuild();
  const why = globalThis.__coachHud.last().viewing.why;
  assert.ok(why.includes("passive Water Absorb · immune to Water"), why.join(" · "));
}

// ---- On the team, Rotom is the form its grid entry was added as, its passive unlocked but not switched on.
{
  const m = show("Rotom picked as Wash", rotom({ chosen: [ROTOM], forms: { [ROTOM]: 2 } }));
  assert.ok(m.chosen[0].why.includes("but Water Absorb is off"), m.chosen[0].why.join(" · "));
}

// One species alone on the grid, under the cursor.
const alone = (id, opts) => ({ challenges: [{ id: 11, value: 0 }], valid: [id], looking: id, ...opts });

// ---- A setup rare egg move names its stages.
{
  const why = mount({ looking: 129 }).model.viewing.why;
  assert.ok(why.includes("rare egg move Dragon Dance (setup +1 Atk/Spe)"), why.join(" · "));
}

// ---- A damaging one names its power, type and category, and STAB and stat fit on the final form.
{
  const seel = show("Seel, rare egg move", alone(SEEL)).viewing.why;
  assert.ok(seel.includes("rare egg move Bouncy Bubble (60 Water special · STAB)"), seel.join(" · "));
  // Primeape's Atk 105 against SpA 60: a special move is off its weaker attacking stat.
  const mankey = mount(alone(MANKEY)).model.viewing.why;
  assert.ok(mankey.includes("rare egg move Ice Beam (90 Ice special · weak SpA)"), mankey.join(" · "));
}

// ---- Fixed damage, a power or type the move works out in battle, and an unimplemented move each say so.
{
  const rare = (id, move) => mount(alone(id, { rare: { [id]: move }, unlocks: { [id]: { eggMoves: 8 } } })).model.viewing.why;
  const toss = rare(MANKEY, 107);
  assert.ok(toss.includes("rare egg move Seismic Toss (Fighting physical · fixed damage)"), toss.join(" · "));
  const techno = rare(SEEL, 108);
  assert.ok(techno.includes("rare egg move Techno Blast (120 special · type varies)"), techno.join(" · "));
  const gyro = rare(BRONZOR, 109);
  assert.ok(gyro.includes("rare egg move Gyro Ball (Steel physical · power varies · STAB)"), gyro.join(" · "));
  const malice = rare(SEEL, 110);
  assert.ok(malice.includes("rare egg move Bitter Malice (not implemented)"), malice.join(" · "));
}

// ---- Any other status move is named as one.
{
  const why = mount(alone(MINUN)).model.viewing.why;
  assert.ok(why.includes("rare egg move Encore (status)"), why.join(" · "));
}

// ---- A passive that does nothing in a single battle weighs 1 and says why; any other keeps its 8.
{
  const m = show("Minun, ally-only passive", alone(MINUN));
  assert.ok(m.viewing.why.includes("passive Friend Guard · ally-only, nothing in singles"), m.viewing.why.join(" · "));
  const off = mount(alone(MINUN, { unlocks: { [MINUN]: { passiveAttr: 0 } } })).model.viewing.value;
  assert.equal(m.viewing.value - off, 1);
  const zig = mount(alone(ZIGZAGOON)).model.viewing;
  assert.ok(zig.why.includes("passive Pickup · no effect on a fight"), zig.why.join(" · "));
  const zigOff = mount(alone(ZIGZAGOON, { unlocks: { [ZIGZAGOON]: { passiveAttr: 0 } } })).model.viewing.value;
  assert.equal(zig.value - zigOff, 1);
  const bronzor = mount(alone(BRONZOR)).model.viewing.value;
  const bronzorOff = mount(alone(BRONZOR, { unlocks: { [BRONZOR]: { passiveAttr: 0 } } })).model.viewing.value;
  assert.equal(bronzor - bronzorOff, 8);
}

// ---- An immunity names the type, and whether the final form is weak to it.
{
  const why = show("Bronzor, Levitate", alone(BRONZOR)).viewing.why;
  assert.ok(why.includes("passive Levitate · immune to Ground, its weakness"), why.join(" · "));
}

// ---- A weather or terrain setter names what it boosts on the final form; terrain boosts only a grounded user.
{
  const vulpix = show("Vulpix, Drought", alone(VULPIX)).viewing.why;
  assert.ok(vulpix.includes("passive Drought · sun boosts its Fire"), vulpix.join(" · "));
  const emolga = mount(alone(EMOLGA)).model.viewing.why;
  assert.ok(emolga.includes("passive Electric Surge · sets Electric Terrain"), emolga.join(" · "));
}

// ---- Off the grid the last species looked at is no cursor line, though the handler still holds its id.
{
  const { model } = mount({ looking: 19, onGrid: false });
  assert.equal(model.viewing, null);
}

// ---- The Pokédex (no team being chosen) draws no starter card.
{
  const { model } = mount({ picking: false });
  assert.notEqual(model?.kind, "starters");
  console.log(`== not choosing a team\nkind ${model?.kind ?? null}`);
}
