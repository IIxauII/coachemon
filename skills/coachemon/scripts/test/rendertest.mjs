// Card rendering in both views, and the watcher's summary of each card: the learn-move card (mini names the move to
// forget) with its team line and only-type warning, the rewards card's TM recipient and boss-next tag, and the fight
// plan one-liner that `+` opens.
import { bundle } from "../hud-bundle.mjs";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const mv = ([n, t, p, c, a = 100]) => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: 3, isChargingMove: () => false, attrs: [] });
const pk = (name, types, atk, spa, moves) => ({ name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })) });

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const mount = (scene, view) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener(ev, fn) { if (ev === "click") n.onclick = fn; }, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => view, setItem() {} };
  eval(bundle("hud"));
  return el;
};
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

// Learn: Tackle is the clear drop for Flamethrower.
const charmeleon = pk("Charmeleon", ["Fire"], 64, 80, [["Tackle","Normal",40,"P"],["Ember","Fire",40,"S"],["Dragon Breath","Dragon",60,"S"],["Scratch","Normal",40,"P"]]);
for (const view of ["full", "mini"]) {
  const scene = { currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] };
  const el = mount(scene, view);
  console.log(`== learn (${view})\n${lines(el)}`);
  if (view === "full") console.log(`summary ${globalThis.__coachHud.summary().learn}`);
}

// Fight plan: a plain win is one line until `+` opens it for the wave.
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "Blaze" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => false,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c]) => ({ getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: 3 }), getMovePp: () => 10, ppUsed: 0 })),
});
const party = [mon("Charizard", 50, ["Fire","Flying"], [160,100,90,130,100,120], [["Flamethrower","Fire",90,"S"]], true)];
const foes = [mon("Paras", 20, ["Bug","Grass"], [50,40,40,30,40,20], [["Scratch","Normal",40,"P"]], true), mon("Oddish", 20, ["Grass","Poison"], [50,40,40,40,40,20], [["Absorb","Grass",20,"S"]], false)];
for (const f of foes) f.getOpponents = () => party;
const trainer = { getName: () => "Youngster", config: { isBoss: false }, isDouble: () => false, getPartyMemberMatchupScores: () => [[1, 5]], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
for (const view of ["full", "mini"]) {
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene, view);
  console.log(`== plan (${view})\n${lines(el)}`);
  const find = n => (n == null || typeof n === "string" ? null : n.onclick && n.title === "Show the fight plan" ? n : (n.children ?? []).map(find).find(Boolean));
  const open = el.kids.map(find).find(Boolean);
  open?.onclick({ stopPropagation() {} });
  console.log(`-- after + (${view})\n${lines(el)}`);
}

// Learn with a team: Espeon trades Bite, the team's only Dark move, for Earth Power — the team line carries the SE
// types gained and the only-type loss, and mini keeps just that warning.
const espeon = pk("Espeon", ["Psychic"], 65, 130, [["Bite","Dark",60,"P"],["Psychic","Psychic",90,"S"],["Shadow Ball","Ghost",80,"S"],["Dazzling Gleam","Fairy",80,"S"]]);
const lapras = pk("Lapras", ["Water","Ice"], 85, 85, [["Surf","Water",90,"S"],["Ice Beam","Ice",90,"S"]]);
for (const view of ["full", "mini"]) {
  const scene = { currentBattle: { waveIndex: 27, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: espeon, newMove: mv(["Earth Power","Ground",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [espeon, lapras] };
  const el = mount(scene, view);
  console.log(`== learn team (${view})\n${lines(el)}`);
  if (view === "full") console.log(`summary ${globalThis.__coachHud.summary().learn}`);
}

// Rewards before a boss: the TM row shows its best recipient and the move it replaces, full view adds who can use the
// other rewards, and the watcher's summary names the recipient.
{
  class ModifierType {}
  class PokemonModifierType extends ModifierType {}
  class TmModifierType extends PokemonModifierType {}
  class PokemonHeldItemModifierType extends PokemonModifierType {}
  class AddPokeballModifierType extends ModifierType {}
  const MOVES = { 1: ["Tackle","Normal",40,"P"], 2: ["Spark","Electric",65,"P"], 3: ["Bite","Dark",60,"P"], 4: ["Quick Attack","Normal",40,"P"], 5: ["Fire Fang","Fire",65,"P",95], 6: ["Heat Wave","Fire",95,"S",90] };
  class PokemonMove {
    constructor(id) { this.moveId = id; this.ppUsed = 0; }
    getMove() { return mv(MOVES[this.moveId]); }
    getName() { return MOVES[this.moveId][0]; }
    getMovePp() { return 20; }
  }
  const member = (name, types, atk, spa, ids) => ({ ...pk(name, types, atk, spa, []), status: null, species: { forms: [] }, moveset: ids.map(id => new PokemonMove(id)) });
  const morpeko = member("Morpeko", ["Electric","Dark"], 95, 70, [2, 3, 1, 4]);
  const charizard = member("Charizard", ["Fire","Flying"], 110, 150, [6]);
  const team = [charizard, morpeko];
  const free = [
    Object.assign(new TmModifierType(), { name: "TM Fire Fang", iconImage: "tm", tier: 1, moveId: 5, selectFilter: p => (p === morpeko ? null : "no effect") }),
    Object.assign(new PokemonHeldItemModifierType(), { name: "Leftovers", iconImage: "leftovers", tier: 0, selectFilter: () => null }),
    Object.assign(new AddPokeballModifierType(), { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 }),
  ];
  const handler = { options: free.map(t => ({ modifierTypeOption: { type: t, cost: 0 } })), shopOptionsRows: [], rerollCost: 250 };
  for (const view of ["full", "mini"]) {
    const scene = { money: 500, pokeballCounts: { 1: 20 }, modifiers: [], currentBattle: { waveIndex: 29 }, ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => team, getEnemyParty: () => [] };
    const el = mount(scene, view);
    console.log(`== rewards boss next (${view})\n${lines(el)}`);
    if (view === "full") console.log(`summary ${globalThis.__coachHud.summary().rewards}`);
  }
}
