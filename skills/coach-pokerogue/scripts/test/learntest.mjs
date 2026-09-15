import { bundle } from "../hud-bundle.mjs";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// [name, type, power, cat, acc, attrs, charging, target]
const mv = ([n, t, p, c, a = 100, attrs = [], charge = false, target = 3]) => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: target, isChargingMove: () => charge, attrs: attrs.map(x => ({ constructor: { name: x } })) });
const mon = (name, types, atk, spa, moves) => ({ name, level: 64, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })) });
const cases = [
  ["Charizard ← Flare Blitz", mon("Charizard", ["Fire","Flying"], 122, 154, [["Heat Wave","Fire",95,"S",90,[],false,6],["Dragon Breath","Dragon",60,"S"],["Air Slash","Flying",75,"S",95],["Flamethrower","Fire",90,"S"]]), ["Flare Blitz","Fire",120,"P",100,["RecoilAttr"]], true],
  ["Venusaur ← Solar Beam", mon("Venusaur", ["Grass","Poison"], 133, 142, [["Double-Edge","Normal",120,"P",100,["RecoilAttr"]],["Sleep Powder","Grass",-1,"X",75],["Synthesis","Grass",-1,"X"],["Power Whip","Grass",120,"P",85]]), ["Solar Beam","Grass",120,"S",100,[],true], true],
  ["Blastoise ← Skull Bash", mon("Blastoise", ["Water"], 119, 121, [["Aqua Tail","Water",90,"P",90],["Flash Cannon","Steel",80,"S"],["Wave Crash","Water",120,"P",100,["RecoilAttr"]],["Hydro Pump","Water",110,"S",80]]), ["Skull Bash","Normal",130,"P",100,[],true], true],
  ["Scrafty ← Head Smash", mon("Scrafty", ["Dark","Fighting"], 150, 62, [["Focus Punch","Fighting",150,"P"],["Rock Climb","Normal",90,"P",85],["Brick Break","Fighting",75,"P"],["High Jump Kick","Fighting",130,"P",90]]), ["Head Smash","Rock",150,"P",80,["RecoilAttr"]], true],
];
for (const [label, pk, newMove, double] of cases) {
  let el; const ds = {};
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const scene = { currentBattle: { double }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: pk, newMove: mv(newMove) }) }, getEnemyParty: () => [], getPlayerParty: () => [pk] };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], title: "", addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: ds }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud"));
  const txt = n => typeof n === "string" ? n : n.children.map(txt).join(" ");
  console.log(`== ${label}\n` + el.kids.slice(1).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
}
