import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mountHud } from "./fake-page.mjs";
import { Command, MoveFlags, SpeciesId } from "../../../../src/enums/generated.ts";
import { onGame } from "./game-proto.mjs";
import { cat, TY } from "./fake-mon.mjs";
// `moves`: `[name, type, power, category, target = 3, flags = 0, attrs = []]`; an attr is a class name.
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, next) => onGame({
  // `id` is what the turn keys its memos on, so every mon needs one that tells it from the others.
  id: name, next, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => false,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c, target = 3, flags = 0, attrs = []], i) => ({ moveId: i + 1, getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, flags,
    ...(attrs.length ? { attrs: attrs.map(a => new ({ [a]: class {} })[a]()) } : {}) }), getMovePp: () => 10, ppUsed: 0 })),
});
const teraMon = (...args) => {
  const teraType = TY.indexOf(args.pop());
  const p = mon(...args);
  const base = p.getTypes();
  p.getTeraType = () => teraType;
  p.getTypes = () => (p.isTerastallized ? [teraType] : base);
  return p;
};
// A move of `p`'s whose own condition can say no. The factory's `getMove` builds a fresh object each call, so the
// patched one is frozen in place for the gate and the AI to read the same move back.
const withCondition = (p, move, cond) => {
  const pm = p.moveset.find(m => m.getName() === move);
  const mv = { ...pm.getMove(), applyConditions: user => cond(user) };
  pm.getMove = () => mv;
  return p;
};
const switchIn = teras => ({ double: false, trainer: { isBoss: false }, teras, bench: [1], summonIndex: 1, party: [
  mon("Gyarados", 80, ["Water","Flying"], "Intimidate", [260,170,130,120,150,140], [["Hydro Pump","Water",110,"S"]], true)],
  foes: [
    mon("Barbaracle", 80, ["Rock","Water"], "Tough Claws", [240,190,180,100,130,110], [["Razor Shell","Water",75,"P"]], true),
    teraMon("Coalossal", 80, ["Fire","Rock"], "Steam Engine", [400,160,180,160,250,60], [["Rock Slide","Rock",75,"P"]], false, "Rock")] });
// Our own Tera (#649): Gyarados with a Water Tera against Lycanroc's Stone Edge, on a classic calendar. `game` holds
// what the scene adds: the wave, the arena's count of Teras used, the modifiers and the calendar's mode.
const ORB = { is: n => n === "TerastallizeAccessModifier" };
const CLASSIC = { isClassic: true, isWaveFinal: w => w === 200, isBoss: w => w % 10 === 0, isFixedBattle: () => false, challenges: [] };
const ourTera = ({ wave = 180, used = 0, modifiers = [ORB], mode = CLASSIC, mega = false, terapagos = false, species = null } = {}) => {
  const gyarados = teraMon("Gyarados", 80, ["Water","Flying"], "Intimidate", [260,170,130,120,150,140], [["Waterfall","Water",80,"P"]], true, "Water");
  if (mega) gyarados.isMega = () => true;
  if (species != null) gyarados.hasSpecies = id => id === species;
  const bench = mon("Terapagos", 80, ["Normal"], "Tera Shift", [260,120,130,140,130,90], [["Tackle","Normal",40,"P"]], false);
  bench.hasSpecies = id => terapagos && id === SpeciesId.TERAPAGOS;
  return { double: false, game: { wave, arena: { playerTerasUsed: used }, modifiers, gameMode: mode }, party: [gyarados, bench],
    foes: [mon("Lycanroc", 80, ["Rock"], "Keen Eye", [240,200,120,80,100,120], [["Stone Edge","Rock",100,"P"]], true)] };
};
// The same in a double, Gyarados in slot 0 and Tera-Steel Lucario in slot 1, both on one charge. `locked`: slot 1's
// prompt, slot 0 having pressed the Tera for Waterfall into Lycanroc.
const ourTeraDouble = ({ locked = false, used = 0 } = {}) => {
  const at = (p, bi) => Object.assign(p, { getBattlerIndex: () => bi });
  const party = [
    at(teraMon("Gyarados", 80, ["Water","Flying"], "Intimidate", [260,170,130,120,150,140], [["Waterfall","Water",80,"P"]], true, "Water"), 0),
    at(teraMon("Lucario", 80, ["Fighting","Steel"], "Inner Focus", [240,150,110,180,110,100], [["Vacuum Wave","Fighting",20,"S"]], true, "Steel"), 1),
  ];
  const foes = [
    at(mon("Lycanroc", 80, ["Rock"], "Keen Eye", [240,200,120,80,100,120], [["Stone Edge","Rock",100,"P"]], true), 2),
    at(mon("Golem", 80, ["Rock","Ground"], "Sturdy", [250,180,200,60,80,60], [["Rock Slide","Rock",75,"P",11]], true), 3),
  ];
  return { double: true, game: { wave: 180, arena: { playerTerasUsed: used }, modifiers: [ORB], gameMode: CLASSIC }, party, foes,
    ...(locked ? { fieldIndex: 1, turnCommands: [{ command: Command.FIGHT, cursor: 0, move: { move: 1, targets: [2], useMode: 0 }, targets: [2] }],
      preTurnCommands: [{ command: Command.TERA, targets: [0] }] } : {}) };
};
// Stat i lives at `statStages[i - 1]`.
const withStages = (p, statStages) => { p.summonData.statStages = statStages; return p; };
// Gordie W180 at turn 5, rebuilt from the solver fixture (#648): each mon's level, stats, current HP, Tera type and
// party slot are the fixture's own, and `extras.foes` gives it the `initialTeamIndex` the trainer's instant Tera keys
// on. The T5 enemy party sits in team-index order [5,0,2,3,4,1], so no slot there is its own team index. Typing,
// ability and move data are not in a save, so they are spelled out at the call.
const W180 = JSON.parse(readFileSync(new URL("../../../../src/solver/fixtures/gordie-w180.t5.json", import.meta.url), "utf8"));
const w180Mon = (species, name, types, ability, moves, { ours = false } = {}) => {
  const saved = W180.save[ours ? "party" : "enemyParty"].find(m => m.species === species);
  const live = W180.extras[ours ? "party" : "foes"].find(f => f.id === saved.id);
  const p = ours
    ? mon(name, saved.level, types, ability, saved.stats, moves, W180.save.party.indexOf(saved) === 0, saved.hp)
    : teraMon(name, saved.level, types, ability, saved.stats, moves, live.onField, saved.hp, undefined, TY[saved.teraType]);
  if (!ours) p.initialTeamIndex = live.initialTeamIndex;
  return p;
};
const party = [
  mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Heat Wave","Fire",95,"S",6],["Flare Blitz","Fire",120,"P"],["Air Slash","Flying",75,"S"],["Flamethrower","Fire",90,"S"]], true),
  mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Double-Edge","Normal",120,"P"],["Power Whip","Grass",120,"P"]], true),
  mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Wave Crash","Water",120,"P"],["Hydro Pump","Water",110,"S"],["Flash Cannon","Steel",80,"S"]], false),
  mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["High Jump Kick","Fighting",130,"P"],["Brick Break","Fighting",75,"P"],["Rock Climb","Normal",90,"P"]], false),
];
const scenarios = {
  // A wild wave with nothing to decide is one line.
  easy: { double: false, party, foes: [mon("Rattata", 20, ["Normal"], "Run Away", [60,50,40,30,40,70], [["Tackle","Normal",40,"P"],["Quick Attack","Normal",40,"P"]], true)] },
  easyDouble: { double: true, party, foes: [mon("Rattata", 20, ["Normal"], "Run Away", [60,50,40,30,40,70], [["Tackle","Normal",40,"P"]], true), mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [60,45,40,35,35,56], [["Gust","Flying",40,"S"]], true)] },
  double: { double: true, party, foes: [
    mon("Bisharp", 60, ["Dark","Steel"], "Inner Focus", [152,140,120,70,80,90], [["Iron Head","Steel",80,"P"],["Night Slash","Dark",70,"P"]], true),
    mon("Nidoqueen", 64, ["Poison","Ground"], "Rivalry", [201,120,115,100,110,100], [["Earth Power","Ground",90,"S"],["Sludge Bomb","Poison",90,"S"]], true, undefined, "Sludge Bomb")] },
  // With one foe left in a double, both of our slots still need a move.
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
  // A foe that Terastallizes before it moves is planned against as its Tera type, and its row marked TERA.
  tera: { double: false, trainer: { isBoss: false }, teras: ["Lycanroc"], party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,120], [["Flamethrower","Fire",90,"S"],["Air Slash","Flying",75,"S"]], true, 120)],
    foes: [teraMon("Lycanroc", 70, ["Rock"], "Keen Eye", [200,190,100,80,90,140], [["Stone Edge","Rock",100,"P"]], true, "Steel")] },
  // Gordie W180 (#648). Coalossal Teras to Rock before it moves, so Burn Up — picked while it was still Fire — goes
  // off and fails. The trainer's `shouldTera` says yes to Centiskorch on the bench as well: it comes in at its
  // Fire/Bug, but Teras at its first FIGHT command, before any hit of ours after a faint send-in (game-code.md §7).
  teraFails: { double: false, trainer: { isBoss: false }, teras: ["Coalossal", "Centiskorch"], bench: [], party: [
    mon("Gyarados", 80, ["Water","Flying"], "Intimidate", [260,170,130,120,150,140], [["Waterfall","Water",80,"P"]], true),
    mon("Venusaur", 80, ["Grass","Poison"], "Overgrow", [260,140,140,160,160,120], [["Power Whip","Grass",120,"P"]], false)],
    foes: [
      withCondition(teraMon("Coalossal", 80, ["Fire","Rock"], "Steam Engine", [250,160,180,160,180,60],
        [["Burn Up","Fire",130,"S"],["Rock Slide","Rock",75,"P"]], true, "Rock"), "Burn Up", u => u.getTypes().includes(TY.indexOf("Fire"))),
      teraMon("Centiskorch", 80, ["Fire","Bug"], "Flash Fire", [240,150,120,140,130,100], [["Fire Lash","Fire",80,"P"]], false, "Rock")] },
  // Barbaracle withdraws for Coalossal, which comes in at its Fire/Rock and Teras only at its first FIGHT command, so
  // this turn's Hydro Pump lands at ×4 (#648). `plainSwitchIn` is the same switch with no Tera anywhere.
  teraSwitchIn: switchIn(["Coalossal"]),
  plainSwitchIn: switchIn([]),
  // The same thing on the real party (#648): Gordie W180 at T5, rebuilt from the fixture. `instantTeras` is his own
  // `[5]`, and at T5 team index 5 is Coalossal, in party slot 0 — slot 5 holds Carracosta, which must stay un-Tera'd.
  // The card still reads the harness's own wave; only the mons and their indexes come from W180.
  // `bench: []` is the T5 fact that Coalossal stays in: a foe the trainer withdraws never Teras (`teraNow`).
  w180: { double: false, trainer: { isBoss: false, trainerAI: { instantTeras: [5] } }, bench: [], party: [
    w180Mon(SpeciesId.LEAVANNY, "Leavanny", ["Bug","Grass"], "Swarm", [["Leaf Storm","Grass",130,"S"],["Bug Bite","Bug",60,"P"]], { ours: true }),
    w180Mon(SpeciesId.GYARADOS, "Gyarados", ["Water","Flying"], "Intimidate", [["Hydro Pump","Water",110,"S"],["Hurricane","Flying",110,"S"]], { ours: true })],
    foes: [
      withCondition(w180Mon(SpeciesId.COALOSSAL, "Coalossal", ["Fire","Rock"], "Steam Engine",
        [["Burn Up","Fire",130,"S"],["Stone Edge","Rock",100,"P"]]), "Burn Up", u => u.getTypes().includes(TY.indexOf("Fire"))),
      w180Mon(SpeciesId.GIGALITH, "Gigalith", ["Rock"], "Sand Stream", [["Rock Slide","Rock",75,"P"]]),
      w180Mon(SpeciesId.TYRANITAR, "Tyranitar", ["Rock","Dark"], "Sand Stream", [["Crunch","Dark",80,"P"],["Earthquake","Ground",100,"P"]]),
      w180Mon(SpeciesId.STONJOURNER, "Stonjourner", ["Rock"], "Power Spot", [["Earthquake","Ground",100,"P"],["Body Slam","Normal",85,"P"]]),
      w180Mon(SpeciesId.BARBARACLE, "Barbaracle", ["Rock","Water"], "Tough Claws", [["Stone Edge","Rock",100,"P"],["Razor Shell","Water",75,"P"]]),
      w180Mon(SpeciesId.CARRACOSTA, "Carracosta", ["Water","Rock"], "Solid Rock", [["Rock Slide","Rock",75,"P"],["Brine","Water",65,"S"]])] },
  // The boss wave itself, the charge and the Tera Orb in hand: Tera Water takes Stone Edge from ×2 to ×1 (#649).
  ourTera: ourTera(),
  // No Tera on the card: the charge spent, no Tera Orb, a Mega form, the boss still ahead with no refill before it.
  teraSpent: ourTera({ used: 1 }),
  noTeraOrb: ourTera({ modifiers: [] }),
  teraMega: ourTera({ mega: true }),
  // A Tera that changes the form, which the hypothesis can't price: Ogerpon's mask.
  teraOgerpon: ourTera({ species: SpeciesId.OGERPON }),
  teraBossAhead: ourTera({ wave: 175 }),
  // Offered again: past the biome's last big fight, and before a gym leader whose cleanup refills it for a Terapagos.
  teraLastBigBehind: ourTera({ wave: 175, mode: { ...CLASSIC, isBoss: w => w === 172 } }),
  teraTerapagos: ourTera({ wave: 45, terapagos: true }),
  // A double: each slot may take the Tera, and slot 1 none once slot 0 pressed it.
  teraDouble: ourTeraDouble(),
  teraDoubleLocked: ourTeraDouble({ locked: true }),
  teraDoubleSpent: ourTeraDouble({ used: 1 }),
  // A trap the planned move runs into goes on the foe row's ✦: Fire into Thick Fat.
  trap: { double: false, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Flamethrower","Fire",90,"S"]], true)],
    foes: [mon("Swinub", 20, ["Ice","Ground"], "Thick Fat", [60,50,80,30,30,20], [["Tackle","Normal",40,"P"]], true)] },
  // A move trap our pool can't trigger stays off its row (Rough Skin); a field trap is on it whatever we pick (Moxie).
  fieldTrap: { double: true, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Flamethrower","Fire",90,"S"]], true),
    mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Hydro Pump","Water",110,"S"]], true)],
    foes: [
      mon("Druddigon", 40, ["Dragon"], "Rough Skin", [140,100,90,60,80,50], [["Tackle","Normal",40,"P"]], true),
      mon("Krookodile", 40, ["Ground","Dark"], "Moxie", [150,110,90,60,80,90], [["Crunch","Dark",80,"P"]], true)] },
  // One contact move in the pool turns Rough Skin's ✦ on: the row asks the pool, the ⚔ line the move it picked.
  contactTrap: { double: true, party: [
    mon("Charizard", 66, ["Fire","Flying"], "Blaze", [190,125,118,160,128,148], [["Flare Blitz","Fire",120,"P",3,MoveFlags.MAKES_CONTACT]], true),
    mon("Blastoise", 64, ["Water"], "Torrent", [187,122,144,125,151,116], [["Hydro Pump","Water",110,"S"]], true)],
    foes: [
      mon("Druddigon", 40, ["Dragon"], "Rough Skin", [140,100,90,60,80,50], [["Tackle","Normal",40,"P"]], true),
      mon("Krookodile", 40, ["Ground","Dark"], "Moxie", [150,110,90,60,80,90], [["Crunch","Dark",80,"P"]], true)] },
  // A contact move in the pool runs into Aura Guard, so the row marks it.
  auraGuard: { double: false, party: [
    mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["Brick Break","Fighting",75,"P",3,MoveFlags.MAKES_CONTACT]], true)],
    foes: [mon("Lucario", 40, ["Fighting","Steel"], "Aura Guard", [120,90,70,100,70,90], [["Tackle","Normal",40,"P"]], true)] },
  // A physical move that makes no contact misses Aura Guard, so the row stays clear.
  auraGuardNoContact: { double: false, party: [
    mon("Garchomp", 64, ["Dragon","Ground"], "Sand Veil", [200,170,120,100,100,150], [["Earthquake","Ground",100,"P"]], true)],
    foes: [mon("Lucario", 40, ["Fighting","Steel"], "Aura Guard", [120,90,70,100,70,90], [["Tackle","Normal",40,"P"]], true)] },
  // Sturdy is no trap on either line: the KO count already carries it.
  modelled: { double: false, party: [
    mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["Brick Break","Fighting",75,"P"]], true)],
    foes: [mon("Pineco", 20, ["Bug"], "Sturdy", [60,50,80,30,30,20], [["Tackle","Normal",40,"P"]], true)] },
  // A predicted switch-in's Intimidate is a trap: its drop isn't in our stat stages yet.
  intimidateIn: { double: false, trainer: { isBoss: false }, party: [
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"]], true)],
    foes: [
      mon("Ludicolo", 80, ["Water","Grass"], "Swift Swim", [250,110,120,150,170,110], [["Giga Drain","Grass",75,"S"]], true),
      mon("Arcanine", 80, ["Fire"], "Intimidate", [260,170,130,150,130,140], [["Flare Blitz","Fire",120,"P"]], false)] },
  // A move-flag immunity spares one foe of a spread move, which is still used on the other; Whismur's ✦ is measured
  // against our whole pool, not the move its ⚔ line picked.
  soundproof: { double: true, party: [
    mon("Exploud", 66, ["Normal"], "Scrappy", [200,110,80,140,80,120], [["Hyper Voice","Normal",90,"S",6,MoveFlags.SOUND_BASED]], true),
    mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Power Whip","Grass",120,"P"]], true)],
    foes: [
      mon("Whismur", 30, ["Normal"], "Soundproof", [90,60,50,60,50,40], [["Pound","Normal",40,"P"]], true),
      mon("Rattata", 30, ["Normal"], "Run Away", [80,60,50,40,50,90], [["Tackle","Normal",40,"P"]], true)] },
  // Eelevate is a Ground immunity, so Land's Wrath spares Eelektross and both its row and the ⚔ line mark it (#729).
  eelevate: { double: true, party: [
    mon("Garchomp", 66, ["Dragon","Ground"], "Sand Veil", [210,170,130,110,115,140], [["Land's Wrath","Ground",90,"P",6]], true),
    mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Power Whip","Grass",120,"P"]], true)],
    foes: [
      mon("Eelektross", 40, ["Electric"], "Eelevate", [150,110,80,100,80,50], [["Spark","Electric",65,"P"]], true),
      mon("Rattata", 30, ["Normal"], "Run Away", [80,60,50,40,50,90], [["Tackle","Normal",40,"P"]], true)] },
  // Thousand Arrows gets through Eelevate, so neither line marks it.
  eelevateArrows: { double: true, party: [
    mon("Garchomp", 66, ["Dragon","Ground"], "Sand Veil", [210,170,130,110,115,140], [["Thousand Arrows","Ground",90,"P",6,0,["NeutralDamageAgainstFlyingTypeAttr"]]], true),
    mon("Venusaur", 65, ["Grass","Poison"], "Overgrow", [200,135,122,144,144,118], [["Power Whip","Grass",120,"P"]], true)],
    foes: [
      mon("Eelektross", 40, ["Electric"], "Eelevate", [150,110,80,100,80,50], [["Spark","Electric",65,"P"]], true),
      mon("Rattata", 30, ["Normal"], "Run Away", [80,60,50,40,50,90], [["Tackle","Normal",40,"P"]], true)] },
  // With nothing behind the immunity the turn is lost, and the panel and the card both say so: `no damaging move`
  // never told the player whether to switch, wait or give up on the turn (#263).
  deadEnd: { double: false, party: [
    mon("Exploud", 66, ["Normal"], "Scrappy", [200,110,80,140,80,120], [["Hyper Voice","Normal",90,"S",6,MoveFlags.SOUND_BASED]], true)],
    foes: [mon("Whismur", 30, ["Normal"], "Soundproof", [90,60,50,60,50,40], [["Pound","Normal",40,"P"]], true)] },
  // An Intimidate foe already on the field is no trap: its drop is in our stat stages.
  intimidate: { double: false, party: [
    mon("Scrafty", 64, ["Dark","Fighting"], "Shed Skin", [163,152,172,63,165,80], [["Brick Break","Fighting",75,"P"]], true)],
    foes: [mon("Granbull", 30, ["Fairy"], "Intimidate", [120,90,75,40,60,45], [["Tackle","Normal",40,"P"]], true)] },
  // Both slots of a doubles trainer name the same bench index, so slot 1 sends back the mon slot 0 withdrew — a
  // return, with its own wording (#285). Arcanine's +6 Atk is what shows the return's stages in the golden.
  doubleReturn: { double: true, trainer: { isBoss: false }, bench: [2], summonIndex: 2, party: [
    mon("Blastoise", 80, ["Water"], "Torrent", [250,130,170,140,180,130], [["Wave Crash","Water",120,"P"],["Flash Cannon","Steel",80,"S"]], true),
    mon("Venusaur", 80, ["Grass","Poison"], "Overgrow", [260,140,140,160,160,120], [["Power Whip","Grass",120,"P"],["Sludge Bomb","Poison",90,"S"]], true)],
    foes: [
      withStages(mon("Arcanine", 80, ["Fire"], "Intimidate", [260,170,130,150,130,140], [["Flare Blitz","Fire",120,"P"]], true), [6,0,0,0,0,0,0]),
      mon("Ludicolo", 80, ["Water","Grass"], "Swift Swim", [250,110,120,150,170,110], [["Surf","Water",90,"S"]], true),
      mon("Gyarados", 80, ["Water","Flying"], "Intimidate", [270,155,130,110,160,135], [["Waterfall","Water",80,"P"]], false)] },
};

const cards = {};

for (const [label, sc] of Object.entries(scenarios)) {
  delete globalThis.__queued;
  class PM { queueMessage() { globalThis.__queued = (globalThis.__queued ?? 0) + 1; } getCurrentPhase() { return { phaseName: "CommandPhase", fieldIndex: sc.fieldIndex ?? 0 }; } }
  const pm = new PM();
  const onField = () => sc.party.filter(p => p.isOnField());
  for (const f of sc.foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => { pm.queueMessage("side effect"); return 1; }; f.id = f.name; }
  for (const p of sc.party) p.id = p.name;
  const trainer = sc.trainer ? { getName: () => "Tester", config: sc.trainer, isDouble: () => false,
    getPartyMemberMatchupScores: () => { pm.queueMessage("side effect"); return (sc.bench ?? sc.foes.map((_f, i) => i).slice(1)).map(i => [i, 5]); },
    getSortedPartyMemberMatchupScores: sc2 => sc2.slice().sort((a, b) => b[1] - a[1]),
    getNextSummonIndex: () => sc.summonIndex ?? 1,
    // The game's own instant-Tera test, keyed the way the game keys it: on the mon's team index, never its slot. A
    // scenario carrying `trainerAI.instantTeras` is shaped like the real trainer, indexes and all.
    shouldTera: e => (sc.trainer.trainerAI
      ? !e.isTerastallized && sc.trainer.trainerAI.instantTeras.includes(e.initialTeamIndex)
      : !!sc.teras?.includes(e.name)) } : null;
  const game = sc.game ? { arena: sc.game.arena, modifiers: sc.game.modifiers, gameMode: sc.game.gameMode } : {};
  const scene = { ...game, phaseManager: pm, getField: () => [...onField(), ...sc.foes.filter(f => f.isOnField())], currentBattle: { waveIndex: sc.game?.wave ?? 89, turn: 1, double: sc.double, ...(sc.turnCommands ? { turnCommands: sc.turnCommands, preTurnCommands: sc.preTurnCommands ?? [] } : {}), enemySwitchCounter: 0, getBattlerCount: () => (sc.double ? 2 : 1), trainer }, ui: { mode: 0, getHandler: () => ({}) }, getPlayerParty: () => sc.party, getEnemyParty: () => sc.foes };
  const { card } = mountHud({ scene });
  if (sc.trainer) console.log(`queued during prediction: ${globalThis.__queued ?? 0}; queueMessage restored: ${!Object.prototype.hasOwnProperty.call(pm, "queueMessage") && typeof pm.queueMessage === "function"}`);
  console.log(`== ${label}\n${card()}`);
  const x = globalThis.__coachHud.summary();
  console.log(`summary ${x.verdict} | ${x.field}${x.danger.length ? ` | ${x.danger.map(d => `${d.level === "ko" ? "\u{1F480}" : "\u26a0"} ${d.mon}`).join(" ")}` : ""}${x.plan ? ` | plan: ${x.plan}` : ""}`);
  cards[label] = globalThis.__coachHud.last();
}

// The \u2694 line's move traps are on the card but not in its text.
const trapsOf = (label, slot, foe) => {
  const card = cards[label];
  return { slot: card.field.slots.find(sl => sl.name === slot).traps, row: card.rows.find(r => r.name === foe).traps };
};
assert.deepEqual(trapsOf("eelevate", "Garchomp", "Eelektross"), { slot: ["Eelevate"], row: ["Eelevate"] }, "Land's Wrath into Eelevate");
assert.deepEqual(trapsOf("eelevateArrows", "Garchomp", "Eelektross"), { slot: [], row: [] }, "Thousand Arrows into Eelevate");

// Gordie W180 (#648): the Tera the foe's own pick was made before, and the bench mon that Teras only once it fights.
{
  const row = name => cards.teraFails.rows.find(r => r.name === name);
  const coal = row("Coalossal");
  assert.equal(coal.likely.move, "Burn Up", "the AI's pick is made before the Tera");
  assert.equal(coal.likely.fails, true, "and reads `fails` once the Tera has taken its Fire typing away");
  assert.deepEqual(coal.weak.filter(([t]) => ["Water", "Grass"].includes(t)), [["Water", ""], ["Grass", ""]],
    "Tera Rock is Water ×2 and Grass ×2, not the Water ×4 its Fire/Rock read at");
  const bench = row("Centiskorch");
  assert.equal(bench.tera, "Rock", "a bench mon the trainer Teras names the Tera it will take");
  assert.deepEqual(bench.types, ["Rock"], "and its row shows the typing our hits meet");
  assert.deepEqual(bench.weak.filter(([t]) => ["Water", "Grass", "Rock"].includes(t)), [["Water", ""], ["Grass", ""]],
    "with Tera Rock's weaknesses, not Fire/Bug's Rock ×4");
}

// A predicted switch-in takes this turn's hit at the typing it comes in at, whatever it Teras to later (#648).
{
  const row = (label, name) => cards[label].rows.find(r => r.name === name);
  const [tera, plain] = [row("teraSwitchIn", "Coalossal"), row("plainSwitchIn", "Coalossal")];
  assert.equal(tera.pick.pct, plain.pick.pct, "this turn's Hydro Pump lands at Fire/Rock's ×4");
  assert.ok(tera.pick.ko === 0 || tera.pick.ko > plain.pick.ko, "and the hits after it at Tera Rock's ×2");
  assert.deepEqual([tera.types, tera.tera], [["Rock"], "Rock"], "its row: the Tera every later hit meets");
}

// The fight plan's first exchange against a switch-in gives us the turn it spends coming in (#846): Gyarados outspeeds
// Coalossal and KOs it in two Hydro Pumps, the first of them free, so no Rock Slide ever lands.
{
  const [first] = cards.plainSwitchIn.teamPlan.steps;
  assert.deepEqual([first.vs.name, first.foeHp, first.hp], ["Coalossal", 0, 100], `step 1 KOs it untouched: ${first.why}`);
}

// The plan's first exchange prices our entry-turn hit on a switch-in that Teras later as the ⚔ line does (#825): the
// free Hydro Pump at Fire/Rock ×4, the row's share, then two at Tera Rock ×2 with one Rock Slide taken between.
{
  const card = cards.teraSwitchIn, [slot] = card.field.slots, [first] = card.teamPlan.steps;
  const row = label => cards[label].rows.find(r => r.name === "Coalossal").pick;
  assert.deepEqual([row("teraSwitchIn").pct, slot.ko], [row("plainSwitchIn").pct, 3], "⚔: the first of 3 hits at the entry typing");
  assert.deepEqual([first.vs.name, first.foeHp, first.hp], ["Coalossal", 0, 100 - slot.threat.pct],
    `step 1 KOs it in those 3 hits, not falling with it at 15% as at its Tera throughout: ${first.why}`);
}

// The same against the real party (#648): Gordie W180 at T5, rebuilt from the solver fixture. `instantTeras` is `[5]`,
// a *team* index — and at T5 team index 5 is Coalossal in party slot 0, while party slot 5 holds Carracosta.
{
  const row = name => cards.w180.rows.find(r => r.name === name);
  const coal = row("Coalossal");
  assert.equal(coal.tera, "Rock", "the Tera lands on the foe whose team index is 5, whatever slot it sits in");
  assert.deepEqual(coal.types, ["Rock"], "and its row shows the Tera typing");
  assert.deepEqual(coal.weak.filter(([t]) => ["Water", "Grass"].includes(t)), [["Water", ""], ["Grass", ""]],
    "Water ×2 and Grass ×2 at Tera Rock, not the Water ×4 its Fire/Rock read at");
  assert.equal(coal.likely.move, "Burn Up", "the pick is still made before the Tera");
  assert.equal(coal.likely.fails, true, "and Burn Up reads `fails` once the Tera has taken its Fire typing away");
  const carr = row("Carracosta");
  assert.equal(carr.tera, null, "the foe merely sitting in party slot 5 is team index 1 and carries no Tera");
  assert.deepEqual(carr.types, ["Water", "Rock"], "its row keeps its own typing");
  assert.deepEqual(cards.w180.rows.filter(r => r.tera).map(r => r.name), ["Coalossal"], "and no other foe is Tera'd");
}

// Our Tera is on the ⚔ line only where the game would take it and spending it leaves no big fight without it (#649).
{
  const teraOf = label => cards[label].field.slots[0].tera;
  assert.equal(teraOf("ourTera"), "Water", "the boss wave itself, with the charge and the Tera Orb");
  assert.equal(cards.ourTera.field.slots[0].threat, null, "Stone Edge at ×1 into Tera Water is no longer a danger");
  for (const label of ["teraSpent", "noTeraOrb", "teraMega", "teraOgerpon", "teraBossAhead"]) assert.equal(teraOf(label), null, label);
  assert.equal(cards.teraBossAhead.field.slots[0].threat?.e, 2, "a Tera it would win the turn with is still kept for the boss");
  assert.equal(teraOf("teraLastBigBehind"), "Water", "a wild wave after the biome's last big fight");
  assert.equal(teraOf("teraTerapagos"), "Water", "with a Terapagos, the gym leader's cleanup refills it first");
}

// In a double the two slots share the one charge (game-code.md §17): at slot 0's prompt one of them takes it, and at slot 1's,
// after slot 0 pressed the Tera button, slot 0's move lands at its Tera and slot 1 has none to take.
{
  const slots = label => cards[label].field.slots.map(sl => [sl.name, sl.tera]);
  assert.deepEqual(slots("teraDouble"), [["Gyarados", "Water"], ["Lucario", null]], "one slot Teras, though both could");
  assert.deepEqual(slots("teraDoubleLocked"), [["Gyarados", "Water"], ["Lucario", null]], "slot 0's pressed Tera, and none for slot 1");
  assert.ok(cards.teraDoubleLocked.field.slots[0].locked, "slot 0's command is the locked one");
  assert.deepEqual(slots("teraDoubleSpent"), [["Gyarados", null], ["Lucario", null]], "with the charge spent, neither slot has one");
}
