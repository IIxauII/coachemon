// PROTOTYPE — throwaway. Ticket #399, map #391. Nothing here is imported by anything that ships.
//
// Question: what marks the focused control while the panel holds the keyboard, and what does the walk,
// the handover and the release look like — on a panel that already carries four states and one palette.
//
// Serves three things on one port:
//   /            PROTOTYPE-keys.html        the outer page: stage, switcher bar, live readout
//   /panel       PROTOTYPE-keys-panel.html  a 1920x1080 document, so `min(100vw, 177.78vh)` IS the reference game-w
//   /hud.js      the real hud/90-render.js, bundled in expose mode — the panel's own shell, skin and ladder
//   /cards.json  real cards' groups, drawn by the real renderers against the mocked scene the tests use
//   /fonts/*.ttf the game's own faces out of the pinned clone, so the type measures what the player sees
//
// Run: node skills/coachemon/scripts/hud/PROTOTYPE-keys.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "../hud-bundle.mjs";
import { onGame } from "../test/game-proto.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 8399);

// ---- the mocked scene, copied out of test/battletest.mjs (a prototype copies; it never imports a test)
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, next) => onGame({
  id: name, next, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)),
  getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] },
  isOnField: () => field, isBoss: () => false, getIconAtlasKey: () => "pokemon_icons_1", getIconId: () => 6, status: null,
  moveset: moves.map(([n, t, p, c, target = 3, flags = 0], i) => ({ moveId: i + 1, getName: () => n,
    getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, flags }), getMovePp: () => 10, ppUsed: 0 })),
});
const party = [
  mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Heat Wave","Fire",95,"S",6],["Flare Blitz","Fire",120,"P"],["Air Slash","Flying",75,"S"],["Flamethrower","Fire",90,"S"]], true),
  mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Double-Edge","Normal",120,"P"],["Power Whip","Grass",120,"P"]], true),
  mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Wave Crash","Water",120,"P"],["Hydro Pump","Water",110,"S"],["Flash Cannon","Steel",80,"S"]], false),
  mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["High Jump Kick","Fighting",130,"P"],["Brick Break","Fighting",75,"P"],["Rock Climb","Normal",90,"P"]], false),
];
// Four cards, chosen for the ring they produce: a trainer with the most tabs, a danger card, the thinnest
// wild wave (one tab, so the ring is act + caret + x), and a doubles bar.
const scenarios = {
  trainer: { double: false, trainer: { isBoss: false }, party: [
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"],["Flash Cannon","Steel",80,"S"]], true),
    mon("Venusaur", 80, ["Grass","Poison"], "Overgrow", [260,140,140,160,160,120], [["Power Whip","Grass",120,"P"]], false)],
    foes: [
      mon("Arcanine", 80, ["Fire"], "Intimidate", [260,170,130,150,130,140], [["Flare Blitz","Fire",120,"P"],["Extreme Speed","Normal",80,"P"]], true),
      mon("Ludicolo", 80, ["Water","Grass"], "Swift Swim", [250,110,120,150,170,110], [["Giga Drain","Grass",75,"S"],["Surf","Water",90,"S"]], false)] },
  danger: { double: false, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,120], [["Flamethrower","Fire",90,"S"],["Air Slash","Flying",75,"S"]], true, 120),
    mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Wave Crash","Water",120,"P"]], false)],
    foes: [mon("Lycanroc", 70, ["Rock"], "Keen Eye", [200,190,100,80,90,140], [["Stone Edge","Rock",100,"P"]], true)] },
  thin: { double: false, party, foes: [mon("Rattata", 20, ["Normal"], "Run Away", [60,50,40,30,40,70], [["Tackle","Normal",40,"P"],["Quick Attack","Normal",40,"P"]], true)] },
  doubles: { double: true, party, foes: [
    mon("Bisharp", 60, ["Dark","Steel"], "Inner Focus", [152,140,120,70,80,90], [["Iron Head","Steel",80,"P"],["Night Slash","Dark",70,"P"]], true),
    mon("Nidoqueen", 64, ["Poison","Ground"], "Rivalry", [201,120,115,100,110,100], [["Earth Power","Ground",90,"S"],["Sludge Bomb","Poison",90,"S"]], true, undefined, "Sludge Bomb")] },
};

// A drawn node as JSON. The page rebuilds these with the real tag and the real inline styles, so the rows
// in the pane are the renderer's own and not a transcription. `atlas:key/frame` stands in for a sprite the
// page has no atlas for; the page draws it as a dashed box at the frame's real aspect and the real rung height.
const ser = n => {
  if (n == null) return null;
  if (typeof n !== "object") return String(n);
  return { tag: n.tag, style: { ...n.style }, title: n.title ?? null, src: n.src ?? null, kids: n.children.map(ser).filter(k => k != null) };
};

const hudBundle = bundle("hud", { expose: true });

const drawCard = sc => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud; delete globalThis.__hud;
  class PM { queueMessage() {} getCurrentPhase() { return { phaseName: "CommandPhase" }; } }
  const pm = new PM();
  const onField = () => sc.party.filter(p => p.isOnField());
  for (const f of sc.foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; f.id = f.name; }
  for (const p of sc.party) p.id = p.name;
  const trainer = sc.trainer ? { getName: () => "Tester", config: sc.trainer, isDouble: () => false,
    getPartyMemberMatchupScores: () => (sc.bench ?? sc.foes.map((_f, i) => i).slice(1)).map(i => [i, 5]),
    getSortedPartyMemberMatchupScores: s => s.slice().sort((a, b) => b[1] - a[1]),
    getNextSummonIndex: () => sc.summonIndex ?? 1, shouldTera: () => false } : null;
  const scene = { phaseManager: pm, getField: () => [...onField(), ...sc.foes.filter(f => f.isOnField())],
    currentBattle: { waveIndex: 89, turn: 1, double: sc.double, enemySwitchCounter: 0, getBattlerCount: () => (sc.double ? 2 : 1), trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => sc.party, getEnemyParty: () => sc.foes };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } },
    Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene },
      // Say every wanted frame is there and hand back a marker: the rows then carry real <img> geometry.
      textures: { exists: () => true, get: () => ({ has: () => true }), getBase64: (k, f) => `atlas:${k}/${f}` } } } }] } } } };
  const node = tag => { const n = { tag, style: {}, children: [], addEventListener() {}, remove() {},
    append(...k) { n.children.push(...k.filter(x => x != null && x !== "")); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  eval(hudBundle);
  const H = globalThis.__hud;
  const card = H["98-tick"].shownCard();
  const groups = H["98-tick"].shownGroups() ?? [];
  return {
    card: { kind: card.kind, verdict: card.verdict ?? null, wave: card.wave },
    caption: ser(H[`96-render-${card.kind}`].captionBattle?.(card) ?? H["96-render-battle"].captionBattle(card)),
    groups: groups.map(g => ({ id: g.id, label: g.label, summary: g.summary, rows: g.rows.map(ser) })),
  };
};

const cards = {};
for (const [name, sc] of Object.entries(scenarios)) {
  cards[name] = drawCard(sc);
  console.log(`card ${name}: ${cards[name].card.verdict} · tabs ${cards[name].groups.map(g => g.label).join(" ")}`);
}
// A fifth entry, marked synthetic wherever it is shown: the vocabulary caps the bar at five tabs, and no live
// battle card draws that many, so the longest legal bar is assembled out of the trainer card's own drawn groups.
{
  const t = cards.trainer, pool = t.groups;
  cards.wide = { synthetic: true, card: t.card, caption: t.caption,
    groups: [["act", "Now"], ["foes", "Foes"], ["catch", "Catch"], ["plan", "Plan"], ["road", "Road"]]
      .map(([id, label], k) => ({ id, label, summary: pool[k % pool.length].summary, rows: pool[k % pool.length].rows })) };
}
const cardsJson = JSON.stringify(cards);
// The shell alone: no tick, no refresh loop, no game. The page drives the draw itself.
const panelJs = bundle("hud", { expose: true, files: [["90-render.js", readFileSync(here + "90-render.js", "utf8")]] });

// The game's own faces, out of the pinned clone the drift check keeps.
const tag = existsSync(here + "../../../../.cache/pokerogue") ? readdirSync(here + "../../../../.cache/pokerogue")[0] : null;
const fontDir = tag ? `${here}../../../../.cache/pokerogue/${tag}/assets/fonts/` : null;
const FONTS = { "emerald.ttf": "pokemon-emerald-pro.ttf", "pkmnems.ttf": "pkmnems.ttf" };

const send = (res, type, body) => { res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
createServer((req, res) => {
  const path = req.url.split("?")[0];
  try {
    if (path === "/") return send(res, "text/html; charset=utf-8", readFileSync(here + "PROTOTYPE-keys.html"));
    if (path === "/panel") return send(res, "text/html; charset=utf-8", readFileSync(here + "PROTOTYPE-keys-panel.html"));
    if (path === "/hud.js") return send(res, "text/javascript; charset=utf-8", panelJs);
    if (path === "/cards.json") return send(res, "application/json", cardsJson);
    if (path.startsWith("/fonts/") && FONTS[path.slice(7)] && fontDir) {
      return send(res, "font/ttf", readFileSync(fontDir + FONTS[path.slice(7)]));
    }
  } catch (e) { res.writeHead(500); return res.end(String(e.message)); }
  res.writeHead(404); res.end("no");
}).listen(PORT, () => {
  console.log(`\nPROTOTYPE #399 on http://localhost:${PORT}`);
  console.log(fontDir ? `fonts: ${tag}` : "fonts: NOT FOUND (.cache/pokerogue unprovisioned) — falling back to monospace");
});
