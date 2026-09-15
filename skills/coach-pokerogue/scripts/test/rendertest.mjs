// Card rendering in both views, and the watcher's summary of each card: the learn-move card (mini names the move to
// forget) and the fight plan one-liner that `+` opens.
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
  if (view === "full") console.log(`summary ${JSON.stringify(globalThis.__coachHud.summary())}`);
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
