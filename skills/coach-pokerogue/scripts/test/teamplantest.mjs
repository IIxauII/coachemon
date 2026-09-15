// Whole-fight team plan against a Cyrus-like trainer: our four (Morpeko full, Scrafty 52%, Blastoise 50%,
// Venusaur 29%) against six, the last a boss Weavile that outspeeds and KOs everyone. Asserts the plan names
// Weavile as the win condition, saves Scrafty/Blastoise for it, sacrifices Venusaur for a free switch-in and says
// the fight is likely lost. Prints the rendered section, so run.mjs also keeps a golden of it.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// moves: [name, type, power, cat, target=3]
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, boss = 0) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field,
  isBoss: () => boss > 0, bossSegments: boss, bossSegmentIndex: boss - 1,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c, target = 3]) => ({ getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target }), getMovePp: () => 10, ppUsed: 0 })),
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
  // Triple Axel's 20/40/60 hits, summed: the approximate damage model counts one hit per move.
  mon("Weavile", 110, ["Dark","Ice"], "Pressure", [560,330,190,110,210,320], [["Triple Axel","Ice",120,"P"],["Night Slash","Dark",70,"P"]], false, undefined, 2),
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
  // The planner lives inside the bundle's IIFE; expose it for the test only.
  eval(bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__tp = { teamPlan, drawTeamPlan, tpHealProfile };\n})();\n"));
  const plan = globalThis.__tp.teamPlan(scene, scene.currentBattle, party, foes);
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

// Cached per turn: the same call again is free and returns the same view.
assert.equal(globalThis.__tp.teamPlan(scene, scene.currentBattle, party, foes), plan, "second call hits the cache");
assert.ok(ms < 500, `cheap enough to run every turn (${ms.toFixed(0)} ms incl. bundling)`);

// During the command phase it goes through the sandbox and the game-code paths; with those missing on the mocks it
// must fall back to the same approximation, not throw.
const live = run("CommandPhase").plan;
assert.equal(live.win?.name, "Weavile");
assert.equal(globalThis.Phaser.Math.RND.state(), "!rnd,0", "sandbox restored the RNG");
assert.ok(!plan.compact && plan.summary === null, "a lost fight is never compact");
assert.equal(plan.approxDoubles, false);

// An early trainer with nothing to plan around: the plan collapses to one line. In a double battle the plan is still
// one-on-one exchanges, and says so.
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
}
// Turn-end chip carries into the fight as a negative per-turn change: a sandstorm takes 1/16 a turn.
{
  const { scene: s } = run(null);
  const zard = mon("Charizard", 30, ["Fire","Flying"], "Blaze", [96,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true);
  s.arena = { weather: { weatherType: 3 } };
  assert.deepEqual(globalThis.__tp.tpHealProfile(s, zard), { base: -6, sitrus: 0, enigma: 0 }, "sandstorm chip in the profile");
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
console.log("ok");
