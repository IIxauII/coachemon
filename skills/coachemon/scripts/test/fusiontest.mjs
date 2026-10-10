import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { wholeCard } from "./panel.mjs";

class ModifierType {}
class PokemonModifierType extends ModifierType {}
class FusePokemonModifierType extends PokemonModifierType {}
class PokemonHpRestoreModifierType extends PokemonModifierType {}

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const MOVES = {};
let nextMove = 1;
// A slot carries what a duel reads as well as what a card reads: the accuracy, PP, target and priority of the move,
// without which nothing can be put on a member against a threat and the judgment has no pair to score (#589).
const move = (name, type, power, category) => { const id = nextMove++; MOVES[id] = { id, name, type: TY.indexOf(type), power, category, accuracy: 100, pp: 15, moveTarget: 3, priority: 0, flags: 0, attrs: [] }; return id; };
const MV = {
  dragonClaw: move("Dragon Claw", "Dragon", 80, 0), earthquake: move("Earthquake", "Ground", 100, 0), waterfall: move("Waterfall", "Water", 80, 0),
  bounce: move("Bounce", "Flying", 85, 0), dragonRush: move("Dragon Rush", "Dragon", 100, 0), bodySlam: move("Body Slam", "Normal", 85, 0), splash: move("Splash", "Normal", 0, 2),
  tackle: move("Tackle", "Normal", 40, 0), aquaTail: move("Aqua Tail", "Water", 90, 0), playRough: move("Play Rough", "Fairy", 90, 0),
  shadowClaw: move("Shadow Claw", "Ghost", 70, 0),
};
class PokemonMove {
  constructor(id) { this.moveId = id; this.ppUsed = 0; }
  getMove() { return MOVES[this.moveId]; }
  getMovePp() { return 15; }
  getName() { return MOVES[this.moveId].name; }
}
let monId = 0;
// `spliced` is Spliced Endless, where an *unfused* mon runs on half its own base-stat row and fusing undoes the
// halving: the game does that inside `calculateBaseStats` (game-code.md §20, §24), so the fixture does too — which
// is the whole of how the judgment sees the mode, the fused half coming off the species' own row either way.
const mon = (name, types, base, ability, moves, f = {}, spliced = false) => {
  const species = { speciesId: 1000 + monId, name, baseStats: base, baseTotal: base.reduce((a, b) => a + b, 0), type1: TY.indexOf(types[0]),
    type2: types[1] ? TY.indexOf(types[1]) : null, getEvolutionLevels: () => f.evolutions ?? [], getName: () => name };
  const max = Math.floor((2 * base[0] + 20) * (f.level ?? 40) / 100) + (f.level ?? 40) + 10;
  return {
    id: ++monId, name, level: f.level ?? 40, hp: f.fainted ? 0 : max, getMaxHp: () => max, species, fusionSpecies: null, formIndex: 0, abilityIndex: 0,
    ivs: [20, 20, 20, 20, 20, 20], nature: f.nature ?? 0, getNature() { return this.nature; }, customPokemonData: { types: [] },
    getSpeciesForm: () => species, getTypes: () => species.type2 == null ? [species.type1] : [species.type1, species.type2],
    getAbility: () => ({ name: ability, attrs: f.noFusion ? [{ constructor: { name: "NoFusionAbilityAbAttr" } }] : [] }),
    hasPassive: () => !!f.passive, getPassiveAbility: () => ({ name: f.passive, attrs: [] }),
    getStat: () => 100, getIconAtlasKey: () => "pokemon_icons_1", getIconId: () => name,
    // What the judgment reads off a live member beyond the above: its own base-stat row, what a release would
    // destroy, and whether a challenge bars it from the fight it is judged at (#589).
    calculateBaseStats: () => (spliced ? base.map(x => Math.ceil(x / 2)) : base.slice()),
    getHeldItems: () => [], isAllowedInChallenge: () => true, isAllowedInBattle() { return this.hp > 0; }, isPlayer: () => true, luck: 0,
    moveset: moves.map(id => new PokemonMove(id)),
  };
};
const party = (spliced = false) => {
  monId = 0;
  const mons = [
    ["Garchomp", ["Dragon", "Ground"], [108, 130, 95, 80, 85, 102], "Rough Skin", [MV.dragonClaw, MV.earthquake], { level: 50, nature: 3, passive: "Sand Force" }],
    ["Salamence", ["Dragon", "Flying"], [95, 135, 80, 110, 80, 100], "Intimidate", [MV.dragonRush, MV.bounce], { level: 22 }],
    ["Snorlax", ["Normal"], [160, 110, 65, 65, 110, 30], "Thick Fat", [MV.bodySlam], { level: 45 }],
    ["Magikarp", ["Water"], [20, 10, 55, 15, 20, 80], "Swift Swim", [MV.splash, MV.tackle], { level: 20, evolutions: [[1002, 20]] }],
    ["Azumarill", ["Water", "Fairy"], [100, 50, 80, 60, 80, 50], "Huge Power", [MV.aquaTail, MV.playRough], { level: 42 }],
    ["Mimikyu", ["Ghost", "Fairy"], [55, 90, 80, 50, 105, 96], "Disguise", [MV.shadowClaw], { level: 30, noFusion: true }],
  ];
  return mons.map(a => mon(...a, spliced));
};

// ---- The threat side: the standard threats the fusion judgment is read against (#578, #589).
// Real species with their real base-stat rows, every one of them a name the randbats snapshot lists, since the name
// is the only key that join has — and none of them a party species above, so no member of ours is ever drawn as a
// threat against itself. `[speciesId, name, types, baseStats]`, the id ordering the pool and so breaking the ties.
const DEX = [
  [18, "Pidgeot", ["Normal", "Flying"], [83, 80, 75, 70, 70, 101]],
  [36, "Clefable", ["Fairy"], [95, 70, 73, 95, 90, 60]],
  [59, "Arcanine", ["Fire"], [90, 110, 80, 100, 80, 95]],
  [65, "Alakazam", ["Psychic"], [55, 50, 45, 135, 95, 120]],
  [68, "Machamp", ["Fighting"], [90, 130, 80, 65, 85, 55]],
  [76, "Golem", ["Rock", "Ground"], [80, 120, 130, 55, 65, 45]],
  [89, "Muk", ["Poison"], [105, 105, 75, 65, 100, 50]],
  [94, "Gengar", ["Ghost", "Poison"], [60, 65, 60, 130, 75, 110]],
  [101, "Electrode", ["Electric"], [60, 50, 70, 80, 80, 150]],
  [121, "Starmie", ["Water", "Psychic"], [60, 75, 85, 100, 85, 115]],
  [131, "Lapras", ["Water", "Ice"], [130, 85, 80, 85, 95, 60]],
  [149, "Dragonite", ["Dragon", "Flying"], [91, 134, 95, 100, 100, 80]],
  [181, "Ampharos", ["Electric"], [90, 75, 85, 115, 90, 55]],
  [197, "Umbreon", ["Dark"], [95, 65, 110, 60, 130, 65]],
  [212, "Scizor", ["Bug", "Steel"], [70, 130, 100, 55, 80, 65]],
  [213, "Shuckle", ["Bug", "Rock"], [20, 10, 230, 10, 230, 5]],
  [214, "Heracross", ["Bug", "Fighting"], [80, 125, 75, 40, 95, 85]],
  [227, "Skarmory", ["Steel", "Flying"], [65, 80, 140, 40, 70, 70]],
  [232, "Donphan", ["Ground"], [90, 120, 120, 60, 60, 50]],
  [241, "Miltank", ["Normal"], [95, 80, 105, 40, 70, 100]],
  [242, "Blissey", ["Normal"], [255, 10, 10, 75, 135, 55]],
  [248, "Tyranitar", ["Rock", "Dark"], [100, 134, 110, 95, 100, 61]],
  [350, "Milotic", ["Water"], [95, 60, 79, 100, 125, 81]],
  [376, "Metagross", ["Steel", "Psychic"], [80, 135, 130, 95, 90, 70]],
  [461, "Weavile", ["Dark", "Ice"], [70, 120, 65, 45, 85, 125]],
  [465, "Tangrowth", ["Grass"], [100, 100, 125, 110, 50, 50]],
];
const threatSpecies = ([id, name, types, base]) => ({
  speciesId: id, name, baseStats: base, baseTotal: base.reduce((a, b) => a + b, 0),
  type1: TY.indexOf(types[0]), type2: types[1] ? TY.indexOf(types[1]) : null,
  getEvolutionLevels: () => [], getName: () => name, getIconAtlasKey: () => "k", getIconId: () => String(id),
});
const registry = {
  getAllSpecies: () => DEX.map(threatSpecies),
  getSpecies: id => { const row = DEX.find(r => r[0] === id); return row ? threatSpecies(row) : null; },
  getEvolutions: () => [],
};
// The move table the threats' sets index: the snapshot's own names, each an attack of 80 whose type walks the chart
// so that no single typing is immune to the whole set. *Which* move a threat brings is threatstest's and
// judgmenttest's subject, not this file's — here the threats only have to be real enough to rank fusions against.
// The snapshot comes out of the bundle, so the table is built on first read and not before.
let moveTable = null;
const threatMoves = () => {
  if (moveTable) return moveTable;
  moveTable = [null];
  for (const name of globalThis.__hud["05-randbats"].RANDBATS.m) {
    const i = moveTable.length;
    moveTable.push({ id: i, name, type: i % TY.length, power: 80, accuracy: 100, category: i % 2, pp: 10,
      moveTarget: 3, priority: 0, flags: 0, attrs: [] });
  }
  return moveTable;
};

const splicers = () => Object.assign(new FusePokemonModifierType(), { name: "DNA Splicers", iconImage: "dna_splicers", tier: 4, id: "DNA_SPLICERS",
  selectFilter: p => (p.fusionSpecies ? "no effect" : null) });
const potion = () => Object.assign(new PokemonHpRestoreModifierType(), { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 });

// `screen`: "party" or "rewards". `partyUiMode` 9 is SPLICE.
const mount = ({ screen = "party", spliced = false, members = party(spliced), picked = null, partyUiMode = 9, hardcore = false, free = [] }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const filter = p => (p.fusionSpecies || (hardcore && p.hp <= 0) ? "no effect" : null);
  const handler = screen === "party"
    ? { partyUiMode, selectFilter: filter, transferMode: picked != null, transferCursor: picked ?? -1, cursor: 0 }
    : { options: free.map(t => ({ modifierTypeOption: { type: t, cost: 0 } })), shopOptionsRows: [], rerollCost: 250 };
  const scene = {
    // Wave 52, so the next big fight is wave 60 and the level cap there is 48: the party below straddles it rather
    // than standing twelve levels over it, which is what leaves the duels behind the judgment close enough that
    // *which* pair the Splicer makes moves the team value at all (`CLAMP` is ±3 a threat).
    money: 500, pokeballCounts: {}, modifiers: [], currentBattle: { waveIndex: 52, double: false },
    ui: { getMode: () => (screen === "party" ? 8 : 6), getHandler: () => handler },
    phaseManager: { getCurrentPhase: () => ({ phaseName: "SelectModifierPhase" }) },
    getPlayerParty: () => members, getEnemyParty: () => [],
    gameMode: { isSplicedOnly: spliced, challenges: hardcore ? [{ id: 12, value: 1 }] : [] },
  };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  // The chunk scan finds nothing under node, so hand over the tables it would have found and tick again: without
  // them there is no threat set, and the judgment every pair is ranked by has nothing to judge against (#589).
  globalThis.__hud["04-game-tables"].setGameTables({ species: registry, moves: threatMoves() });
  globalThis.__hud["98-watch"].rebuild();
  globalThis.__ft = { readRun: globalThis.__hud["26-run"].readRun, fusionOptions: globalThis.__hud["49-fusion"].fusionOptions };
  return { el, scene, model: globalThis.__coachHud.last(), summary: globalThis.__coachHud.summary() };
};

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const lines = el => wholeCard(el)
  .map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

const show = (label, opts) => {
  const last = mount(opts);
  console.log(`== ${label}\n${lines(last.el)}`);
  const m = last.model;
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m), `${label}: JSON-safe`);
  console.log(`summary ${opts.screen === "rewards" ? last.summary?.rewards : last.summary?.fusion}`);
  return m;
};

// ---- The Splicer's party screen, nothing picked: the best fusions in pick order.
let best;
{
  const m = show("full party", {});
  assert.equal(m.kind, "fusion");
  assert.ok(m.rows.length === 3 && m.rows[0].fuse, "a fusion worth making");
  best = m.rows[0];
  assert.notEqual(best.base.name, "Magikarp", "never a weak base");
  assert.notEqual(best.other.name, "Garchomp", "the carry isn't spent as the other half");
  for (let i = 1; i < m.rows.length; i++) assert.ok(m.rows[i - 1].value >= m.rows[i].value, "best first");
}

// ---- A first pick made: only fusions onto it, and the card says to back out for a better one elsewhere.
{
  const m = show("Magikarp picked first", { picked: 3 });
  assert.ok(m.rows.every(r => r.base.name === "Magikarp"));
  assert.equal(m.picked.name, "Magikarp");
  assert.ok(m.better && m.better.base.name === best.base.name, "a better fusion elsewhere");
}

// ---- Hardcore's filter keeps a fainted member out of both picks.
{
  const members = party();
  members[1].hp = 0;
  const m = show("Hardcore, Salamence fainted", { members, hardcore: true });
  assert.ok(m.rows.every(r => r.base.name !== "Salamence" && r.other.name !== "Salamence"));
}

// ---- Fusing a party of two leaves one, so no fusion is worth it and the call is to back out.
{
  const m = show("two members", { members: party().filter(p => ["Garchomp", "Magikarp"].includes(p.name)) });
  assert.ok(m.rows.length && m.rows.every(r => !r.fuse), "no fusion clears the bar");
}

// ---- Halved unfused base stats make the best fusion worth far more (game-code.md §24).
{
  const m = show("Spliced Endless", { spliced: true });
  assert.equal(m.spliced, true);
  // In turns now, not in percent of a carry's power: a figure the judgment's own CLAMP of 3 a threat bounds, so
  // "far more" is a clear turn of team value rather than the twenty points the retired scale was read in (#589).
  assert.ok(m.rows[0].value > best.value + 1, `${m.rows[0].value} vs ${best.value}`);
}

// ---- Mimikyu's Disguise doesn't work fused: the fusion taking it in says so.
{
  const members = party().filter(p => ["Snorlax", "Mimikyu", "Salamence", "Azumarill"].includes(p.name));
  const { scene, model: m } = mount({ members, picked: 0 });
  const row = m.rows.find(r => r.other.name === "Mimikyu");
  assert.ok(row, "Snorlax ← Mimikyu is listed");
  // The pairs are only reachable from inside a run read now, the judgment running there and nowhere else (#589).
  const { readRun, fusionOptions } = globalThis.__ft;
  const f = readRun(scene, run => fusionOptions(run).options.find(x => x.a.name === "Snorlax" && x.b.name === "Mimikyu"));
  assert.equal(f.ability, null);
  assert.ok(f.notes.some(n => /Disguise doesn't work fused/.test(n)), JSON.stringify(f.notes));
  console.log(`== Snorlax ← Mimikyu\n${f.notes.join(" · ")}\n${f.why.join(" · ")}`);
}

// ---- Another party screen (a plain check) draws no fusion card.
{
  const { model } = mount({ partyUiMode: 11 });
  assert.notEqual(model?.kind, "fusion");
  console.log(`== party screen, not splicing\nkind ${model?.kind ?? null}`);
}

// ---- The rewards screen: the Splicer is taken for its best fusion, and passed over when none is worth a slot.
{
  const m = show("rewards, full party", { screen: "rewards", free: [potion(), splicers()] });
  const sp = m.free.find(f => f.name === "DNA Splicers");
  assert.equal(m.free[m.pick], sp);
  assert.match(sp.why, /^fuse \w+ ← \w+ · \+\d+/);
  assert.ok(sp.holder && sp.v < 40, "judged by the fusion, not the Master tier");
}
{
  const m = show("rewards, two members", { screen: "rewards", members: party().filter(p => ["Garchomp", "Magikarp"].includes(p.name)), free: [potion(), splicers()] });
  const sp = m.free.find(f => f.name === "DNA Splicers");
  assert.ok(sp.v < 0, sp.why);
  assert.match(sp.why, /no fusion worth a member · best Garchomp ← Magikarp/);
}
console.log("ok");
