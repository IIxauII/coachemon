import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { MOVE, movesetRandomizer } from "./fixtures/challenges.mjs";
import { wholeCard } from "./panel.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// Test fixtures, not game data: [id, name, types, base stats, cost, evolutions [[id, level, item?, condition?]], passive,
// hidden].
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
  [1011, "Dipplin", ["Grass","Dragon"], [80,80,110,95,80,40], 1, [[1019, 1, false, MOVE]], 33, 34],
  [1019, "Hydrapple", ["Grass","Dragon"], [106,80,110,120,80,44]],
];
const ABILITY_NAMES = { 11: "Chlorophyll", 13: "Solar Power", 15: "Rain Dish", 17: "Big Pecks", 19: "Guts", 21: "Lightning Rod", 23: "Moxie", 25: "Multiscale", 27: "Huge Power", 29: "Rough Skin", 31: "Synchronize", 24: "Rattled", 30: "Rough Skin (H)", 33: "Intimidate", 34: "Sand Force" };

const byId = new Map();
for (const [id, name, types, stats, cost, evos = [], passive, hidden] of SPECIES) {
  const sp = {
    speciesId: id, name, type1: TY.indexOf(types[0]), type2: types[1] ? TY.indexOf(types[1]) : null, baseStats: stats,
    baseTotal: stats.reduce((a, b) => a + b, 0), abilityHidden: hidden ?? 0, cost, evos,
    getPassiveAbility: () => passive, getIconAtlasKey: () => "pokemon_icons_1", getIconId: () => String(id),
  };
  byId.set(id, sp);
}
const evoLevel = {}, direct = {};
for (const [id, , , , , evos = []] of SPECIES) {
  let from = id;
  for (const [to, level, item, cond] of evos) { evoLevel[to] = [level, !!item, cond]; (direct[from] ??= []).push(to); from = to; }
}
for (const sp of byId.values()) {
  sp.getEvolutionLevels = () => (direct[sp.speciesId] ?? []).flatMap(to => [[to, evoLevel[to][0]], ...byId.get(to).getEvolutionLevels()]);
}
const registry = {
  getSpecies: id => byId.get(id),
  getAllStarters: () => STARTERS,
  hasEvolutions: id => !!direct[id],
  getEvolutions: id => (direct[id] ?? []).map(to => ({ speciesId: to, level: evoLevel[to][0], item: evoLevel[to][1] ? 1 : 0,
    condition: evoLevel[to][2] ? { data: [{ key: evoLevel[to][2] }] } : null })),
};
const tables = {
  species: registry,
  abilities: Object.assign([], Object.fromEntries(Object.entries(ABILITY_NAMES).map(([k, v]) => [k, { name: v }]))),
  moves: Object.assign([], { 101: { name: "Dragon Dance" }, 102: { name: "Aqua Jet" }, 103: { name: "Extreme Speed" } }),
  eggMoves: { 129: [102, 102, 102, 101], 19: [103, 103, 103, 103] },
};

const STARTERS = [1, 4, 7, 16, 19, 25, 129, 147, 298, 443, 151];
// On no classic grid, so only a challenge run's own list offers it.
const OFF_GRID = [1011];
// Every starter caught but Mew; Magikarp has its passive and rare egg move, Rattata perfect IVs, Squirtle a variant-3
// shiny, Pikachu Pokérus, Gible its passive.
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
const mount = ({ limit = 10, chosen = [], valid = STARTERS, challenges = [], withTables = true, looking = null, onGrid = true, picking = true }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const { dexData, starterData } = account();
  const species = id => byId.get(id);
  const shown = valid.slice(0, 81);
  const containers = shown.map(id => ({ species: species(id), cost: species(id).cost, icon: { texture: { key: "pokemon_icons_1" }, frame: { name: String(id) } } }));
  const handler = {
    starterSelectCallback: picking ? () => {} : null,
    valueLimitLabel: { text: `${chosen.reduce((t, id) => t + species(id).cost, 0)}/${limit}` },
    partyStarterIds: chosen,
    partyStarters: chosen.map(id => ({ speciesId: id, passive: (starterData[id].passiveAttr & 3) === 3, abilityIndex: 0, formIndex: 0 })),
    filteredStarterIds: valid,
    starterContainers: containers,
    pokerusSpeciesIds: [25],
    lastStarterId: looking ?? shown[0],
    cursorObj: { visible: looking !== null && onGrid },
    getStarterDexAttrPropsFromPreferences: () => ({ formIndex: 0, shiny: false, variant: 0, female: false }),
  };
  const scene = {
    ui: { handlers: { 10: handler }, mode: 10, getHandler: () => handler },
    phaseManager: { getCurrentPhase: () => ({ phaseName: "SelectStarterPhase" }) },
    gameData: { dexData, starterData, getSpeciesStarterValue: id => species(id).cost },
    gameMode: { challenges, modeId: challenges.length ? 4 : 0 }, // `GameModes.CHALLENGE`, `GameModes.CLASSIC`
    currentBattle: null, getPlayerParty: () => [], getEnemyParty: () => [], modifiers: [],
  };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  // Under node the chunk scan finds no tables: hand them over and draw again, or the card stays the first tick's
  // estimate.
  if (withTables) {
    globalThis.__hud["04-game-tables"].setGameTables(tables);
    globalThis.__hud["98-watch"].rebuild();
  }
  return { el, model: globalThis.__coachHud.last(), summary: globalThis.__coachHud.summary() };
};

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const lines = el => wholeCard(el)
  .map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

const show = (label, opts) => {
  const last = mount(opts);
  console.log(`== ${label}\n${lines(last.el)}`);
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

// ---- The Moveset Randomizer's MODIFY_EVOLUTIONS at value 2 makes Dipplin's Dragon Cheer evolution a level one, at 50.
{
  const why = value => mount({ challenges: [movesetRandomizer(value)], valid: [...STARTERS, ...OFF_GRID], looking: 1011 })
    .model.viewing?.why.join(" ") ?? "";
  const one = why(1), two = why(2);
  console.log(`== Dipplin under the Moveset Randomizer\nvalue 1 ${one}\nvalue 2 ${two}`);
  assert.ok(/evolves by item or condition/.test(one), one);
  assert.ok(/evolves at L50/.test(two), two);
}

// ---- The Ability Randomizer hides itself while a team is chosen (game-code.md §32), so the grid's ability names are
// not the ones the run hands out: a hidden ability is no reason at all, and from value 2 a passive is one unnamed.
{
  const why = (value, looking) => mount({ challenges: [{ id: 12, value }], looking }).model.viewing?.why.join(" ") ?? "";
  const gible = [1, 2].map(v => why(v, 443)), karp = [1, 2].map(v => why(v, 129));
  console.log(`== the Ability Randomizer\nGible ${gible.join(" | ")}\nMagikarp ${karp.join(" | ")}`);
  assert.ok(/IVs/.test(gible[0]) && !/hidden/.test(gible[0]), `Gible's hidden Rough Skin is no reason: ${gible[0]}`);
  assert.ok(/passive Intimidate \(Gyarados\)/.test(karp[0]), `value 1 leaves passives alone: ${karp[0]}`);
  assert.ok(/passive/.test(karp[1]) && !/Intimidate/.test(karp[1]), `value 2 rolls Gyarados's passive: ${karp[1]}`);
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
