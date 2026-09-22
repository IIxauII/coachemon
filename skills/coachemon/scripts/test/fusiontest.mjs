// Fusion advisor: on the party screen a DNA Splicer opens, the best fusions in pick order (base first), the partners
// for a first pick already made (and a better fusion elsewhere), the select filter (Hardcore's fainted rule), a small
// party where no fusion is worth the member it spends, Spliced Endless's halved base stats, and an ability that doesn't work fused.
// On the rewards screen, the Splicer is worth its best fusion, not its rarity tier. Prints the rendered cards and
// summaries, so run.mjs also keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

class ModifierType {}
class PokemonModifierType extends ModifierType {}
class FusePokemonModifierType extends PokemonModifierType {}
class PokemonHpRestoreModifierType extends PokemonModifierType {}

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// Test fixtures, not game data. Moves: [name, type, power, category].
const MOVES = {};
let nextMove = 1;
const move = (name, type, power, category) => { const id = nextMove++; MOVES[id] = { id, name, type: TY.indexOf(type), power, category, attrs: [] }; return id; };
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
// [name, types, base stats, ability, moves]
const mon = (name, types, base, ability, moves, f = {}) => {
  const species = { speciesId: 1000 + monId, name, baseStats: base, baseTotal: base.reduce((a, b) => a + b, 0), type1: TY.indexOf(types[0]),
    type2: types[1] ? TY.indexOf(types[1]) : null, getEvolutionLevels: () => f.evolutions ?? [] };
  const max = Math.floor((2 * base[0] + 20) * (f.level ?? 40) / 100) + (f.level ?? 40) + 10;
  return {
    id: ++monId, name, level: f.level ?? 40, hp: f.fainted ? 0 : max, getMaxHp: () => max, species, fusionSpecies: null, formIndex: 0, abilityIndex: 0,
    ivs: [20, 20, 20, 20, 20, 20], nature: f.nature ?? 0, getNature() { return this.nature; }, customPokemonData: { types: [] },
    getSpeciesForm: () => species, getTypes: () => species.type2 == null ? [species.type1] : [species.type1, species.type2],
    getAbility: () => ({ name: ability, attrs: f.noFusion ? [{ constructor: { name: "NoFusionAbilityAbAttr" } }] : [] }),
    hasPassive: () => !!f.passive, getPassiveAbility: () => ({ name: f.passive, attrs: [] }),
    getStat: () => 100, getIconAtlasKey: () => "pokemon_icons_1", getIconId: () => name,
    moveset: moves.map(id => new PokemonMove(id)),
  };
};
const party = () => {
  monId = 0;
  return [
    mon("Garchomp", ["Dragon", "Ground"], [108, 130, 95, 80, 85, 102], "Rough Skin", [MV.dragonClaw, MV.earthquake], { level: 50, nature: 3, passive: "Sand Force" }),
    mon("Salamence", ["Dragon", "Flying"], [95, 135, 80, 110, 80, 100], "Intimidate", [MV.dragonRush, MV.bounce], { level: 22 }),
    mon("Snorlax", ["Normal"], [160, 110, 65, 65, 110, 30], "Thick Fat", [MV.bodySlam], { level: 45 }),
    mon("Magikarp", ["Water"], [20, 10, 55, 15, 20, 80], "Swift Swim", [MV.splash, MV.tackle], { level: 20, evolutions: [[1002, 20]] }),
    mon("Azumarill", ["Water", "Fairy"], [100, 50, 80, 60, 80, 50], "Huge Power", [MV.aquaTail, MV.playRough], { level: 42 }),
    mon("Mimikyu", ["Ghost", "Fairy"], [55, 90, 80, 50, 105, 96], "Disguise", [MV.shadowClaw], { level: 30, noFusion: true }),
  ];
};

const splicers = () => Object.assign(new FusePokemonModifierType(), { name: "DNA Splicers", iconImage: "dna_splicers", tier: 4, id: "DNA_SPLICERS",
  selectFilter: p => (p.fusionSpecies ? "no effect" : null) });
const potion = () => Object.assign(new PokemonHpRestoreModifierType(), { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 });

// `screen`: "party" (the Splicer's party screen, `partyUiMode` 9 SPLICE unless given) or "rewards".
const mount = ({ screen = "party", members = party(), picked = null, partyUiMode = 9, hardcore = false, spliced = false, free = [] }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const filter = p => (p.fusionSpecies || (hardcore && p.hp <= 0) ? "no effect" : null);
  const handler = screen === "party"
    ? { partyUiMode, selectFilter: filter, transferMode: picked != null, transferCursor: picked ?? -1, cursor: 0 }
    : { options: free.map(t => ({ modifierTypeOption: { type: t, cost: 0 } })), shopOptionsRows: [], rerollCost: 250 };
  const scene = {
    money: 500, pokeballCounts: {}, modifiers: [], currentBattle: { waveIndex: 42, double: false },
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
  return { el, model: globalThis.__coachHud.last(), summary: globalThis.__coachHud.summary() };
};

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");
const show = (label, opts) => {
  const last = mount(opts);
  console.log(`== ${label}\n${lines(last.el)}`);
  const m = last.model;
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m), `${label}: JSON-safe`);
  console.log(`summary ${opts.screen === "rewards" ? last.summary?.rewards : last.summary?.fusion}`);
  return m;
};

// ---- 1. The Splicer's party screen, nothing picked: the best fusions in pick order.
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

// ---- 2. Magikarp was picked first: only fusions onto it, and the card says to back out for the better one.
{
  const m = show("Magikarp picked first", { picked: 3 });
  assert.ok(m.rows.every(r => r.base.name === "Magikarp"));
  assert.equal(m.picked.name, "Magikarp");
  assert.ok(m.better && m.better.base.name === best.base.name, "a better fusion elsewhere");
}

// ---- 3. Hardcore: a fainted Salamence can't be picked either way.
{
  const members = party();
  members[1].hp = 0;
  const m = show("Hardcore, Salamence fainted", { members, hardcore: true });
  assert.ok(m.rows.every(r => r.base.name !== "Salamence" && r.other.name !== "Salamence"));
}

// ---- 4. Two members: fusing leaves one, so nothing is worth it and the call is to back out.
{
  const m = show("two members", { members: party().filter(p => ["Garchomp", "Magikarp"].includes(p.name)) });
  assert.ok(m.rows.length && m.rows.every(r => !r.fuse), "no fusion clears the bar");
}

// ---- 5. Spliced Endless: every unfused mon runs on half its base stats, so the best fusion is worth far more.
{
  const m = show("Spliced Endless", { spliced: true });
  assert.equal(m.spliced, true);
  assert.ok(m.rows[0].value > best.value + 20, `${m.rows[0].value} vs ${best.value}`);
}

// ---- 6. Mimikyu's Disguise doesn't work fused: the fusion taking it in says so.
{
  const members = party().filter(p => ["Snorlax", "Mimikyu", "Salamence", "Azumarill"].includes(p.name));
  const m = mount({ members, picked: 0 }).model;
  const row = m.rows.find(r => r.other.name === "Mimikyu");
  assert.ok(row, "Snorlax ← Mimikyu is listed");
  const { fusionOptions } = globalThis.__hud["49-fusion"];
  const f = fusionOptions({ getPlayerParty: () => members, modifiers: [], gameMode: {} }).options.find(x => x.a.name === "Snorlax" && x.b.name === "Mimikyu");
  assert.equal(f.ability, null);
  assert.ok(f.why.some(r => /Disguise doesn't work fused/.test(r.text)));
  console.log(`== Snorlax ← Mimikyu\n${f.why.map(r => r.text).join(" · ")}`);
}

// ---- 7. Another party screen (a plain check) draws no fusion card.
{
  const { model } = mount({ partyUiMode: 11 });
  assert.notEqual(model?.kind, "fusion");
  console.log(`== party screen, not splicing\nkind ${model?.kind ?? null}`);
}

// ---- 8. The rewards screen: the Splicer is taken for its best fusion, and passed over when none is worth a slot.
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
