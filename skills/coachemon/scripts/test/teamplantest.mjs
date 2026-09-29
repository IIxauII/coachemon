// The boss Weavile outspeeds and KOs all four of ours.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { onGame } from "./game-proto.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// moves: [name, type, power, cat, target=3]
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, boss = 0, next) => onGame({
  next, id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field,
  isBoss: () => boss > 0, bossSegments: boss, bossSegmentIndex: boss - 1,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c, target = 3], i) => ({ moveId: i + 1, getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target }), getMovePp: () => 10, ppUsed: 0 })),
});
const party = [
  mon("Morpeko", 100, ["Electric","Dark"], "Hunger Switch", [260,250,160,150,160,250], [["Aura Wheel","Electric",110,"P"],["Crunch","Dark",80,"P"]], true),
  mon("Scrafty", 100, ["Dark","Fighting"], "Intimidate", [290,250,280,100,280,120], [["High Jump Kick","Fighting",130,"P"],["Crunch","Dark",80,"P"]], false, 151),
  mon("Blastoise", 100, ["Water"], "Torrent", [300,200,260,230,270,180], [["Hydro Pump","Water",110,"S"],["Focus Blast","Fighting",120,"S"]], false, 150),
  mon("Venusaur", 100, ["Grass","Poison"], "Overgrow", [310,200,240,240,240,170], [["Giga Drain","Grass",75,"S"],["Sludge Bomb","Poison",90,"S"]], false, 90),
];
const foes = [
  mon("Honchkrow", 100, ["Dark","Flying"], "Super Luck", [320,280,160,220,160,200], [["Brave Bird","Flying",120,"P"],["Night Slash","Dark",70,"P"]], true),
  mon("Crobat", 100, ["Poison","Flying"], "Inner Focus", [300,230,200,160,200,290], [["Cross Poison","Poison",70,"P"],["Air Slash","Flying",75,"S"]], false),
  mon("Gyarados", 100, ["Water","Flying"], "Moxie", [330,260,210,160,230,200], [["Waterfall","Water",80,"P"],["Crunch","Dark",80,"P"]], false),
  mon("Houndoom", 100, ["Dark","Fire"], "Flash Fire", [290,190,170,260,190,230], [["Flamethrower","Fire",90,"S"],["Dark Pulse","Dark",80,"S"]], false),
  mon("Magnezone", 100, ["Electric","Steel"], "Sturdy", [280,160,270,290,210,140], [["Thunderbolt","Electric",90,"S"],["Flash Cannon","Steel",80,"S"]], false),
  // Triple Axel's power is its three hits summed: the approximate model counts one hit per move. Brick Break is never
  // its best hit, but without it Houndoom ties Weavile's matchup score and a roll picks the send-in (game-code.md §7).
  mon("Weavile", 110, ["Dark","Ice"], "Pressure", [560,330,190,110,210,320], [["Triple Axel","Ice",120,"P"],["Brick Break","Fighting",75,"P"]], false, undefined, 2),
];

const run = (phase, { party: ours = party, foes: theirs = foes, double = false, enemyModifiers } = {}) => {
  const party = ours, foes = theirs;
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase } : null) };
  for (const f of foes) f.getOpponents = () => party.filter(p => p.isOnField());
  const trainer = { getName: () => "Cyrus", config: { isBoss: true }, isDouble: () => false };
  const scene = { phaseManager: pm, getField: () => [...party, ...foes].filter(p => p.isOnField()), currentBattle: { waveIndex: 115, turn: 1, double, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes, enemyModifiers };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const { teamPlan, tpHealProfile, tpSendScore, tpFight, tpTables } = globalThis.__hud["35-team-plan"];
  const { readTurn } = globalThis.__hud["25-turn"];
  globalThis.__tp = { readTurn, teamPlan, drawTeamPlan: globalThis.__hud["95-render-team"].drawTeamPlan, tpHealProfile, tpSendScore, tpFight, tpTables };
  const plan = readTurn(scene, turn => teamPlan(turn));
  return { plan, scene, nodes: globalThis.__tp.drawTeamPlan(plan) };
};

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const t0 = performance.now();
const { plan, scene, nodes } = run(null);
const ms = performance.now() - t0;
console.log(nodes.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));

assert.equal(JSON.stringify(JSON.parse(JSON.stringify(plan))), JSON.stringify(plan), "plan is JSON-safe");
assert.equal(plan.win?.name, "Weavile", "Weavile is the win condition");
assert.equal(plan.win.kills, 4, "Weavile KOs all four");

const reserved = plan.reserve.map(r => r.name).sort();
assert.deepEqual(reserved, ["Blastoise", "Scrafty"], "Scrafty and Blastoise are saved");
assert.ok(plan.reserve.every(r => r.for.name === "Weavile"), "saved for Weavile");
const firstWeavile = plan.steps.findIndex(x => x.vs.name === "Weavile");
assert.ok(firstWeavile > 0, "the plan reaches Weavile");
assert.ok(plan.steps.slice(0, firstWeavile).every(x => !reserved.includes(x.send.name)), "no answer is spent before Weavile comes in");

assert.deepEqual(plan.sacrifice.map(x => x.name), ["Venusaur"], "Venusaur is the sacrifice");
const sac = plan.steps.findIndex(x => x.sacrifice);
assert.equal(plan.steps[sac].send.name, "Venusaur");
assert.equal(plan.steps[sac + 1].entry, "free", "the sacrifice buys a free switch-in");
assert.ok(reserved.includes(plan.steps[sac + 1].send.name), "and the free switch-in is an answer");

assert.notEqual(plan.result, "win");
assert.ok(plan.warnings.some(w => /^likely lost/.test(w) && w.includes("Weavile")), "warns the fight is likely lost to Weavile");

assert.deepEqual(globalThis.__tp.readTurn(scene, turn => globalThis.__tp.teamPlan(turn)), plan, "the same turn gives the same plan");
assert.ok(ms < 500, `cheap enough to run every turn (${ms.toFixed(0)} ms incl. bundling)`);

// In the command phase the game-code paths are missing on the mocks: the plan falls back to the approximation, not
// a throw.
const live = run("CommandPhase").plan;
assert.equal(live.win?.name, "Weavile");
assert.equal(globalThis.Phaser.Math.RND.state(), "!rnd,0", "sandbox restored the RNG");
assert.ok(!plan.compact && plan.summary === null, "a lost fight is never compact");
assert.equal(plan.approxDoubles, false);

// An early trainer with nothing to plan around: the plan is a win in two steps and no more. In a double battle the
// plan is still one-on-one exchanges, and says so.
{
  const ours = [
    mon("Charizard", 30, ["Fire","Flying"], "Blaze", [95,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true),
    mon("Blastoise", 30, ["Water"], "Torrent", [95,58,70,62,75,55], [["Surf","Water",90,"S"]], true),
  ];
  const youngster = [
    mon("Rattata", 12, ["Normal"], "Run Away", [32,20,15,12,15,30], [["Tackle","Normal",40,"P"]], true),
    mon("Pidgey", 12, ["Normal","Flying"], "Keen Eye", [34,18,17,16,16,26], [["Gust","Flying",40,"S"]], true),
  ];
  const single = run(null, { party: ours, foes: youngster }).plan;
  console.log(`== easy trainer\n${single.summary}`);
  assert.equal(single.result, "win");
  assert.ok(single.compact, `compact: ${JSON.stringify(single)}`);
  assert.match(single.summary, /^winnable · Charizard/);
  const double = run(null, { party: ours, foes: youngster, double: true }).plan;
  assert.ok(double.approxDoubles, "doubles are flagged as approximated");
  assert.ok(double.compact);
  // Counting one field mon as `cur` read the other as a switch, and put "⇄ switch in X" on screen for a mon already
  // out (#113).
  assert.deepEqual(double.steps.map(x => x.entry), double.steps.map(() => "stay"), `no step pays to switch in a mon already out: ${JSON.stringify(double.steps)}`);
}
// Turn-end chip carries into the fight as a negative per-turn change.
{
  const { scene: s } = run(null);
  const zard = mon("Charizard", 30, ["Fire","Flying"], "Blaze", [96,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true);
  s.arena = { weather: { weatherType: 3 } };
  assert.deepEqual(globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, zard)), { base: -6, sitrus: 0, enigma: 0 }, "sandstorm chip in the profile");
  // A Sitrus is read at the HP after the chip (game-code.md §21): 38/96, chipped to 32, heals a quarter of max.
  const held = Object.assign(new ({ BerryModifier: class { berryType = 0; getStackCount() { return 1; } } }).BerryModifier(), {});
  assert.deepEqual(globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, Object.assign(zard, { getHeldItems: () => [held] }))), { base: -6, sitrus: 24, enigma: 0 }, "Sitrus after the chip");
}
// Item thieves and wave status tokens carry through the exchange: a long Blastoise–Snorlax fight.
{
  const item = (name, props = {}, n = 1) => Object.assign(new ({ [name]: class { isTransferable = true; getStackCount() { return n; } } })[name](), props);
  const token = effect => new ({ EnemyAttackStatusEffectChanceModifier: class { effect = effect; chance = effect === 1 ? 0.05 : 0.025; getStackCount() { return 10; } } }).EnemyAttackStatusEffectChanceModifier();
  const blastoise = (items = []) => Object.assign(mon("Blastoise", 60, ["Water"], "Torrent", [200,100,120,160,120,80], [["Water Gun","Water",40,"S"]], true), { getHeldItems: () => items });
  const snorlax = (items = []) => Object.assign(mon("Snorlax", 60, ["Normal"], "Thick Fat", [300,80,90,65,110,30], [["Tackle","Normal",40,"P"]], true), { getHeldItems: () => items });
  const step = opts => run(null, opts).plan.steps[0];
  const plain = step({ party: [blastoise([item("TurnHealModifier")])], foes: [snorlax()] });
  const robbed = step({ party: [blastoise([item("TurnHealModifier")])], foes: [snorlax([item("TurnHeldItemTransferModifier")])] });
  console.log(`== thieves and tokens\n${plain.why}`);
  assert.ok(robbed.hp < plain.hp, `a foe's Mini Black Hole takes our Leftovers (${plain.hp}% → ${robbed.hp}%)`);
  const bare = step({ party: [blastoise()], foes: [snorlax([item("TurnHealModifier")])] });
  const clawed = step({ party: [blastoise([item("ContactHeldItemTransferChanceModifier", { chance: 0.1 }, 5)])], foes: [snorlax([item("TurnHealModifier")])] });
  assert.ok(bare.foeHp > 0 && clawed.foeHp === 0, `our Grip Claw takes its Leftovers, and the fight (${bare.why} → ${clawed.why})`);
  const poisoned = step({ party: [blastoise()], foes: [snorlax()], enemyModifiers: [token(1)] });
  const clean = step({ party: [blastoise()], foes: [snorlax()] });
  assert.ok(poisoned.hp < clean.hp, `poison tokens chip us (${clean.hp}% → ${poisoned.hp}%)`);
  const slept = step({ party: [blastoise()], foes: [snorlax()], enemyModifiers: [token(4)] });
  assert.ok(slept.hp < clean.hp, `sleep tokens cost us turns, so Snorlax gets more hits in (${clean.hp}% → ${slept.hp}%)`);
}
// The trainer's send-in is scored at the HP the plan has reached: a worn-down Morpeko makes a 30 % bench mon a better
// send-in than a healthy one does.
{
  const { tpSendScore } = globalThis.__tp;
  const T = { send: [[{ base: 3, outspeed: false }], [{ base: 3, outspeed: true }]], foeMax: [100, 100], ourMax: [200] };
  const at = (ourHp, fi) => Math.round(tpSendScore(T, { oh: [ourHp], fh: [30, 30] }, fi, 0) * 1000) / 1000;
  assert.deepEqual([at(200, 0), at(20, 0), at(200, 1), at(20, 1)], [0.45, 1.8, 1.125, 3], "the HP factor follows the simulated HP");
}
// Speed order and rolls as chances: a mirror match at a speed tie with a coin-flip KO is a coin flip, not a sure win.
{
  const { tpFight } = globalThis.__tp;
  const rolls = [{ r: 0.92, p: 0.5 }, { r: 1.08, p: 0.5 }];
  const T = { ours: [[{ dmg: 100, use: rolls }]], theirs: [[{ dmg: 100, e: 1, use: rolls }]], first: [[0.5]], ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [null] };
  const r = tpFight(T, { oh: [200], ob: [0], fh: [200], fs: [0], fb: [0] }, 0, 0, "free");
  console.log(`== mirror at a speed tie\nwin ${r.pWin.toFixed(3)} · loss ${r.pLoss.toFixed(3)}`);
  assert.ok(Math.abs(r.pWin - r.pLoss) < 1e-9 && Math.abs(r.pWin + r.pLoss - 1) < 1e-9, `symmetric (${r.pWin}, ${r.pLoss})`);
  T.first = [[0]];
  const faster = tpFight(T, { oh: [200], ob: [0], fh: [200], fs: [0], fb: [0] }, 0, 0, "free");
  assert.ok(faster.pWin > 0.8 && faster.pWin < 1, `outspeeding wins most, not all: ${faster.pWin}`);
}
// Drain (#90): the foe heals 30 of each 60 it lands, so our 100 a turn needs a fourth turn (300 → 230 → 160 → 90).
{
  const { tpFight } = globalThis.__tp;
  const T = drain => ({ ours: [[{ dmg: 100 }]], theirs: [[{ dmg: 60, e: 1, drain }]], first: [[0]], ourMax: [400], foeMax: [300], ourHeal: [null], foeHeal: [null] });
  const st = () => ({ oh: [400], ob: [0], fh: [300], fs: [0], fb: [0] });
  const [plain, drained] = [0, 0.5].map(d => tpFight(T(d), st(), 0, 0, "free"));
  console.log(`== drain\n${plain.turns} → ${drained.turns} turns`);
  assert.deepEqual([plain.turns, drained.turns], [3, 4], "the foe's drain costs us a turn");
  // Ours: three hits win back 50 each against its two of 60 (200 → 230), never past max (390 → 380, not 420).
  const ours = { ...T(0), ours: [[{ dmg: 100, drain: 0.5 }]] };
  assert.equal(tpFight(ours, { ...st(), oh: [200] }, 0, 0, "free").mh, 230, "our drain heals on every hit");
  assert.equal(tpFight(ours, { ...st(), oh: [390] }, 0, 0, "free").mh, 380, "never past max");
  // Recoil (#235): 400 − 2×60 = 280 for a cost-free move, and 3 × 20 less for one that spends 20 a use.
  const recoil = self => tpFight({ ...T(0), ours: [[{ dmg: 100, self }]] }, st(), 0, 0, "free").mh;
  assert.deepEqual([recoil(0), recoil(20)], [280, 220], "recoil is spent on every landed use");
}
// On-KO boosts (#90, game-code.md §18): each KO Buzzwole's Beast Boost scores raises its Atk a stage.
{
  const { tpTables, tpFight } = globalThis.__tp;
  const { scene: s } = run(null);
  const beastBoost = {
    hasAbilityWithAttr: a => a === "PostVictoryStatStageChangeAbAttr",
    getAbility: () => ({ name: "Beast Boost", getAttrs: a => (a === "PostVictoryStatStageChangeAbAttr" ? [{ changes: () => [{ stat: 1, stages: 1 }] }] : []) }),
  };
  const buzzwole = extra => Object.assign(mon("Buzzwole", 100, ["Bug","Fighting"], "Beast Boost", [400,300,300,100,100,200], [["Lunge","Bug",80,"P"]], true), extra);
  // Blastoise is faster and 2HKOs only on high rolls, so it takes about two Lunges however many KOs Buzzwole has had.
  const blastoise = mon("Blastoise", 100, ["Water"], "Torrent", [400,150,300,150,300,250], [["Hydro Pump","Water",110,"S"]], false);
  const hitsOn = (foe, fk) => {
    const T = globalThis.__tp.readTurn(s, turn => tpTables(turn, [blastoise], [foe], false));
    return 400 - tpFight(T, { oh: [400], ob: [0], fh: [400], fs: [0], fb: [0], ok: [0], fk: [fk] }, 0, 0, "free").mh;
  };
  const boosted = [0, 1, 2].map(k => hitsOn(buzzwole(beastBoost), k));
  const plainHits = [0, 1, 2].map(k => hitsOn(buzzwole({}), k));
  console.log(`== beast boost\nBlastoise loses ${boosted.map(Math.round).join(" / ")} HP after 0 / 1 / 2 KOs (no ability: ${plainHits.map(Math.round).join(" / ")})`);
  assert.ok(plainHits.every(x => x === plainHits[0]), "no ability, no change");
  assert.ok(boosted[0] === plainHits[0] && boosted[1] > boosted[0] && boosted[2] > boosted[1], "each KO fed makes its hits hurt more");
  // The plan names the step that feeds it: a worn Pidgey chips Buzzwole past half and falls, and Blastoise comes in
  // free.
  const fodder = mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [60,450,30,30,30,300], [["Brave Bird","Flying",120,"P"]], true, 10);
  const puncher = Object.assign(mon("Buzzwole", 100, ["Bug","Fighting"], "Beast Boost", [400,300,300,100,100,200], [["Lunge","Bug",80,"P"],["Thunder Punch","Electric",75,"P"]], true), beastBoost);
  const plan = run(null, { party: [fodder, blastoise], foes: [puncher] }).plan;
  console.log(`== feeding Beast Boost\n${plan.steps.map(x => `${x.send.name} → ${x.vs.name}: ${x.why}`).join("\n")}`);
  const fed = plan.steps.find(x => x.send.name === "Pidgey");
  assert.ok(fed && fed.hp === 0, `Pidgey falls to Buzzwole: ${JSON.stringify(plan.steps)}`);
  assert.match(fed.why, /feeds Beast Boost \+1 Atk/, "a fall into Beast Boost is named");
}
console.log("ok");
