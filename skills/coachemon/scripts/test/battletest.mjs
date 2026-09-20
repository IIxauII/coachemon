import { bundle } from "../hud-bundle.mjs";
import { MoveFlags } from "../../../../src/enums/generated.ts";
import { onGame } from "./game-proto.mjs";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// moves: [name, type, power, cat, target=3, flags=0]
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, next) => onGame({
  // `id` is what the turn keys its memos on, so every mon needs one that tells it from the others.
  id: name, next, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => false,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c, target = 3, flags = 0], i) => ({ moveId: i + 1, getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, flags }), getMovePp: () => 10, ppUsed: 0 })),
});
// A mon whose types follow its Tera flag, the way the game's getTypes does once TeraPhase has run.
const teraMon = (...args) => {
  const teraType = TY.indexOf(args.pop());
  const p = mon(...args);
  const base = p.getTypes();
  p.getTeraType = () => teraType;
  p.getTypes = () => (p.isTerastallized ? [teraType] : base);
  return p;
};
// A mon already carrying stat stages when the panel reads it (Stat i lives at `statStages[i - 1]`).
const withStages = (p, statStages) => { p.summonData.statStages = statStages; return p; };
const party = [
  mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Heat Wave","Fire",95,"S",6],["Flare Blitz","Fire",120,"P"],["Air Slash","Flying",75,"S"],["Flamethrower","Fire",90,"S"]], true),
  mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Double-Edge","Normal",120,"P"],["Power Whip","Grass",120,"P"]], true),
  mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Wave Crash","Water",120,"P"],["Hydro Pump","Water",110,"S"],["Flash Cannon","Steel",80,"S"]], false),
  mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["High Jump Kick","Fighting",130,"P"],["Brick Break","Fighting",75,"P"],["Rock Climb","Normal",90,"P"]], false),
];
const scenarios = {
  // Early-run wild waves with nothing to decide: one line.
  easy: { double: false, party, foes: [mon("Rattata", 20, ["Normal"], "Run Away", [60,50,40,30,40,70], [["Tackle","Normal",40,"P"],["Quick Attack","Normal",40,"P"]], true)] },
  easyDouble: { double: true, party, foes: [mon("Rattata", 20, ["Normal"], "Run Away", [60,50,40,30,40,70], [["Tackle","Normal",40,"P"]], true), mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [60,45,40,35,35,56], [["Gust","Flying",40,"S"]], true)] },
  double: { double: true, party, foes: [
    mon("Bisharp", 60, ["Dark","Steel"], "Inner Focus", [152,140,120,70,80,90], [["Iron Head","Steel",80,"P"],["Night Slash","Dark",70,"P"]], true),
    mon("Nidoqueen", 64, ["Poison","Ground"], "Rivalry", [201,120,115,100,110,100], [["Earth Power","Ground",90,"S"],["Sludge Bomb","Poison",90,"S"]], true, undefined, "Sludge Bomb")] },
  // Doubles with one foe left: both of our slots still need a move.
  lastFoe: { double: true, party, foes: [
    mon("Bisharp", 60, ["Dark","Steel"], "Inner Focus", [152,140,120,70,80,90], [["Iron Head","Steel",80,"P"],["Night Slash","Dark",70,"P"]], false, 0),
    mon("Nidoqueen", 64, ["Poison","Ground"], "Rivalry", [201,120,115,100,110,100], [["Earth Power","Ground",90,"S"],["Sludge Bomb","Poison",90,"S"]], true, undefined, "Sludge Bomb")] },
  threat: { double: false, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,120], [["Flamethrower","Fire",90,"S"],["Air Slash","Flying",75,"S"]], true, 120),
    mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Wave Crash","Water",120,"P"]], false)],
    foes: [mon("Lycanroc", 70, ["Rock"], "Keen Eye", [200,190,100,80,90,140], [["Stone Edge","Rock",100,"P"]], true)] },
  switchin: { double: false, party: [
    mon("Charizard", 80, ["Fire","Flying"], "Blaze", [250,140,130,180,140,150], [["Flamethrower","Fire",90,"S"],["Air Slash","Flying",75,"S"]], true),
    mon("Morpeko", 80, ["Electric","Dark"], "Hunger Switch", [220,150,90,120,100,170], [["Aura Wheel","Electric",110,"P"]], false),
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"]], false, 90)],
    foes: [mon("Lycanroc", 90, ["Rock"], "Tough Claws", [300,300,140,120,150,165], [["Stone Edge","Rock",100,"P"],["Crunch","Dark",80,"P"]], true)] },
  predict: { double: false, trainer: { isBoss: false }, party: [
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"],["Flash Cannon","Steel",80,"S"]], true),
    mon("Venusaur", 80, ["Grass","Poison"], "Overgrow", [260,140,140,160,160,120], [["Power Whip","Grass",120,"P"]], false)],
    foes: [
      mon("Arcanine", 80, ["Fire"], "Intimidate", [260,170,130,150,130,140], [["Flare Blitz","Fire",120,"P"],["Extreme Speed","Normal",80,"P"]], true),
      mon("Ludicolo", 80, ["Water","Grass"], "Swift Swim", [250,110,120,150,170,110], [["Giga Drain","Grass",75,"S"],["Surf","Water",90,"S"]], false)] },
  risk: { double: false, party: [
    mon("Venusaur", 66, ["Grass","Poison"], "Overgrow", [220,135,122,144,144,150], [["Power Whip","Grass",120,"P"]], true)],
    foes: [mon("Aurorus", 66, ["Rock","Ice"], "Refrigerate", [230,90,110,150,120,100], [["Ice Beam","Ice",90,"S"]], true)] },
  single: { double: false, party, foes: [mon("Ninetales", 72, ["Fire"], "Flash Fire", [188,90,100,130,140,130], [["Flamethrower","Fire",90,"S"],["Extrasensory","Psychic",80,"S"]], true)] },
  // A trainer mon that Terastallizes before it moves: the panel plans against the Tera type (Steel here, so
  // Flamethrower is super effective and Stone Edge loses its STAB), and marks the row TERA.
  tera: { double: false, trainer: { isBoss: false }, teras: ["Lycanroc"], party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,120], [["Flamethrower","Fire",90,"S"],["Air Slash","Flying",75,"S"]], true, 120)],
    foes: [teraMon("Lycanroc", 70, ["Rock"], "Keen Eye", [200,190,100,80,90,140], [["Stone Edge","Rock",100,"P"]], true, "Steel")] },
  // A trap the planned move runs into goes on the slot line (collapsed and mini) and on the foe row's ✦: Fire into
  // Thick Fat.
  trap: { double: false, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Flamethrower","Fire",90,"S"]], true)],
    foes: [mon("Swinub", 20, ["Ice","Ground"], "Thick Fat", [60,50,80,30,30,20], [["Tackle","Normal",40,"P"]], true)] },
  // The two kinds of trap, told apart on the foe rows. Our pool is special-only here, so Rough Skin — a contact
  // punisher, and so a move trap — stays off Druddigon's row, while Moxie, a field trap, is on Krookodile's whatever
  // we pick.
  fieldTrap: { double: true, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Flamethrower","Fire",90,"S"]], true),
    mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Hydro Pump","Water",110,"S"]], true)],
    foes: [
      mon("Druddigon", 40, ["Dragon"], "Rough Skin", [140,100,90,60,80,50], [["Tackle","Normal",40,"P"]], true),
      mon("Krookodile", 40, ["Ground","Dark"], "Moxie", [150,110,90,60,80,90], [["Crunch","Dark",80,"P"]], true)] },
  // The same field with a contact move in the pool: that alone turns Rough Skin's ✦ on, although both slots aim at
  // Krookodile and neither ⚔ line runs into it — the row asks the pool, the ⚔ line asks the move it picked.
  contactTrap: { double: true, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Flare Blitz","Fire",120,"P",3,MoveFlags.MAKES_CONTACT]], true),
    mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Hydro Pump","Water",110,"S"]], true)],
    foes: [
      mon("Druddigon", 40, ["Dragon"], "Rough Skin", [140,100,90,60,80,50], [["Tackle","Normal",40,"P"]], true),
      mon("Krookodile", 40, ["Ground","Dark"], "Moxie", [150,110,90,60,80,90], [["Crunch","Dark",80,"P"]], true)] },
  // Not a trap on the slot line, and no ✦ on the row either: Sturdy is already in the damage (the KO count), so it
  // changes none of our options.
  modelled: { double: false, party: [
    mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["Brick Break","Fighting",75,"P"]], true)],
    foes: [mon("Pineco", 20, ["Bug"], "Sturdy", [60,50,80,30,30,20], [["Tackle","Normal",40,"P"]], true)] },
  // The target is predicted to switch to an Intimidate mon: that drop isn't in our stat stages yet, so it's a trap.
  intimidateIn: { double: false, trainer: { isBoss: false }, party: [
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"]], true)],
    foes: [
      mon("Ludicolo", 80, ["Water","Grass"], "Swift Swim", [250,110,120,150,170,110], [["Giga Drain","Grass",75,"S"]], true),
      mon("Arcanine", 80, ["Fire"], "Intimidate", [260,170,130,150,130,140], [["Flare Blitz","Fire",120,"P"]], false)] },
  // An immunity by move flag, not by type: Soundproof stops Hyper Voice on Whismur, but the spread move still hits
  // Rattata untouched, so Exploud uses it and the panel says what the game will do. The slot's trap tags come off the
  // planner's own engine mons, so the flag rules (Soundproof, Bulletproof, Overcoat, Wind Rider) apply to them the
  // way they already do to the damage. Whismur's row keeps its ✦ although the move aimed at Whismur (Venusaur's Power
  // Whip) never meets Soundproof: the ✦ is measured against our whole pool, not the move the ⚔ line picked.
  soundproof: { double: true, party: [
    mon("Exploud", 66, ["Normal"], "Scrappy", [200,110,80,140,80,120], [["Hyper Voice","Normal",90,"S",6,MoveFlags.SOUND_BASED]], true),
    mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Power Whip","Grass",120,"P"]], true)],
    foes: [
      mon("Whismur", 30, ["Normal"], "Soundproof", [90,60,50,60,50,40], [["Pound","Normal",40,"P"]], true),
      mon("Rattata", 30, ["Normal"], "Run Away", [80,60,50,40,50,90], [["Tackle","Normal",40,"P"]], true)] },
  // The same immunity with nothing behind it (#263): one foe, so Hyper Voice hits nobody, and Exploud has no status
  // move and no bench. The turn is lost rather than the member empty, and the panel and the card both say so —
  // `no damaging move` never told the player whether to switch, wait or give up on the turn.
  deadEnd: { double: false, party: [
    mon("Exploud", 66, ["Normal"], "Scrappy", [200,110,80,140,80,120], [["Hyper Voice","Normal",90,"S",6,MoveFlags.SOUND_BASED]], true)],
    foes: [mon("Whismur", 30, ["Normal"], "Soundproof", [90,60,50,60,50,40], [["Pound","Normal",40,"P"]], true)] },
  // Nor an Intimidate foe already on the field, on the slot line or the row: its drop is in our stat stages.
  intimidate: { double: false, party: [
    mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["Brick Break","Fighting",75,"P"]], true)],
    foes: [mon("Granbull", 30, ["Fairy"], "Intimidate", [120,90,75,40,60,45], [["Tackle","Normal",40,"P"]], true)] },
  // Both slots of a doubles trainer name the same bench index (#285): a force-switch has broken the party's tag
  // parity, so they score one bench and `getNextSummonIndex` hands them the same answer. The game resolves them in
  // field order, so slot 1's send-in is the mon slot 0 has already withdrawn — a **return**, with its own wording.
  // Arcanine goes out at +2 Atk and comes back at base, because a switch-in arrives with `resetSummonData()`.
  doubleReturn: { double: true, trainer: { isBoss: false }, bench: [2], summonIndex: 2, party: [
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"],["Flash Cannon","Steel",80,"S"]], true),
    mon("Venusaur", 80, ["Grass","Poison"], "Overgrow", [260,140,140,160,160,120], [["Power Whip","Grass",120,"P"],["Sludge Bomb","Poison",90,"S"]], true)],
    foes: [
      withStages(mon("Arcanine", 80, ["Fire"], "Intimidate", [260,170,130,150,130,140], [["Flare Blitz","Fire",120,"P"]], true), [6,0,0,0,0,0,0]),
      mon("Ludicolo", 80, ["Water","Grass"], "Swift Swim", [250,110,120,150,170,110], [["Surf","Water",90,"S"]], true),
      mon("Gyarados", 80, ["Water","Flying"], "Intimidate", [270,155,130,110,160,135], [["Waterfall","Water",80,"P"]], false)] },
};
const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");
// Every node with a click handler, depth first, to press the panel's buttons.
const buttons = n => (n == null || typeof n === "string" ? [] : [...(n.onclick ? [n] : []), ...(n.children ?? []).flatMap(buttons)]);

for (const [label, sc] of Object.entries(scenarios)) {
  for (const VIEW of ["full", "mini"]) {
    let el;
    globalThis.window = globalThis; delete globalThis.__coachHud; delete globalThis.__queued;
    class PM { queueMessage() { globalThis.__queued = (globalThis.__queued ?? 0) + 1; } getCurrentPhase() { return { phaseName: "CommandPhase" }; } }
    const pm = new PM();
    const onField = () => sc.party.filter(p => p.isOnField());
    for (const f of sc.foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => { pm.queueMessage("side effect"); return 1; }; f.id = f.name; }
    for (const p of sc.party) p.id = p.name;
    const trainer = sc.trainer ? { getName: () => "Tester", config: sc.trainer, isDouble: () => false,
      // `bench` / `summonIndex` let a scenario name the party indices the trainer scores and the one it sends in;
      // the defaults are every foe but the first, and the first of them.
      getPartyMemberMatchupScores: () => { pm.queueMessage("side effect"); return (sc.bench ?? sc.foes.map((_f, i) => i).slice(1)).map(i => [i, 5]); },
      getSortedPartyMemberMatchupScores: sc2 => sc2.slice().sort((a, b) => b[1] - a[1]),
      getNextSummonIndex: () => sc.summonIndex ?? 1, shouldTera: e => !!sc.teras?.includes(e.name) } : null;
    const scene = { phaseManager: pm, getField: () => [...onField(), ...sc.foes.filter(f => f.isOnField())], currentBattle: { waveIndex: 89, turn: 1, double: sc.double, enemySwitchCounter: 0, getBattlerCount: () => (sc.double ? 2 : 1), trainer }, ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => sc.party, getEnemyParty: () => sc.foes };
    globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
    const node = () => { const n = { style: {}, children: [], addEventListener(ev, fn) { if (ev === "click") n.onclick = fn; }, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
    globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
    globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
    globalThis.localStorage = { getItem: () => VIEW, setItem() {} };
    eval(bundle("hud"));
    if (sc.trainer && VIEW === "full") console.log(`queued during prediction: ${globalThis.__queued ?? 0}; queueMessage restored: ${!Object.prototype.hasOwnProperty.call(pm, "queueMessage") && typeof pm.queueMessage === "function"}`);
    console.log(`== ${label} (${VIEW})\n${lines(el)}`);
    if (VIEW === "full") {
      // The card's own line, the way the watcher prints it; its full shape is cardtest's business.
      const x = globalThis.__coachHud.summary();
      console.log(`summary ${x.verdict} | ${x.field}${x.danger.length ? ` | ${x.danger.map(d => `${d.level === "ko" ? "\u{1F480}" : "\u26a0"} ${d.mon}`).join(" ")}` : ""}${x.plan ? ` | plan: ${x.plan}` : ""}`);
    }
    // A collapsed wave: `+` shows the chosen view, and it holds for the rest of the wave.
    const plus = (el.kids ?? []).length === 1 ? buttons(el.kids[0]).find(b => b.children.includes("+")) : null;
    if (plus) {
      plus.onclick({ stopPropagation() {} });
      console.log(`-- after + (${VIEW})\n${lines(el)}`);
    }
  }
}
