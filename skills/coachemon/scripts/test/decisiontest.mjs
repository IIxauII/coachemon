import assert from "node:assert/strict";
import { PerformanceObserver as NodeObserver, performance as nodePerf } from "node:perf_hooks";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { bundle } from "../hud-bundle.mjs";
import { BattlerIndex, PartyUiMode, UiMode } from "../../../../src/enums/generated.ts";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc");
const later = setTimeout;

let clock = 0, frameCb = null, ticker = null;
const tasks = [], events = [];
Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: {
  now: () => clock, mark() {}, clearMarks() {}, measure() {}, clearMeasures() {},
} });
globalThis.requestAnimationFrame = cb => { frameCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => { frameCb = null; };
globalThis.setTimeout = fn => { tasks.push(fn); return tasks.length; };
globalThis.clearTimeout = () => {};

// The game the overlay looks at. Every field is read through the scene on each frame, so a step changes it in place.
const TY = ["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon"];
const MOVES = {
  10: ["Scratch", "Normal", 40, 0], 22: ["Vine Whip", "Grass", 45, 0], 33: ["Tackle", "Normal", 40, 0], 45: ["Growl", "Normal", 0, 2],
  52: ["Ember", "Fire", 40, 1], 53: ["Flamethrower", "Fire", 90, 1], 225: ["Dragon Breath", "Dragon", 60, 1],
};
// A class, because `learnState` builds the offered move through its moveset's own constructor.
class Move {
  constructor(id) { this.moveId = id; this.ppUsed = 0; }
  getName() { return MOVES[this.moveId][0]; }
  getMovePp() { return 10; }
  getMove() {
    const [name, t, power, category] = MOVES[this.moveId];
    return { id: this.moveId, name, type: TY.indexOf(t), power, category, accuracy: 100, moveTarget: 3, isChargingMove: () => false, attrs: [] };
  }
}
const mon = (id, name, types, moves) => ({ id, name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)),
  getAbility: () => ({ name: "x" }), hasPassive: () => false, getStat: () => 100, summonData: { statStages: [0, 0, 0, 0, 0, 0, 0] },
  isOnField: () => true, isBoss: () => false, species: { legendary: false }, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0,
  status: null, getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => new Move(m)) });
const full = mon(11, "Charmeleon", ["Fire"], [33, 52, 225, 10]);
const three = mon(12, "Bulbasaur", ["Grass", "Poison"], [33, 22, 45]);
const foe = id => { const f = mon(id, "Paras", ["Bug", "Grass"], [10]); f.getOpponents = () => [g.party[0]]; return f; };
const battle = (waveIndex, turn) => ({ waveIndex, turn, double: false, enemySwitchCounter: 0, turnCommands: {}, trainer: null,
  getBattlerCount() { return this.double ? 2 : 1; } });
const g = {
  phase: null, mode: UiMode.MESSAGE, handler: {}, handlers: {}, money: 1000, lock: false,
  battle: battle(7, 1), party: [full, three], foes: [],
  modifiers: [{ pokemonId: 11, stackCount: 1, type: { id: "LEFTOVERS" } }, { pokemonId: 12, stackCount: 2, type: { id: "BERRY" } }, { stackCount: 1, type: { id: "EXP_SHARE" } }],
};
g.foes = [foe(21)];
const game = {
  get currentBattle() { return g.battle; }, get money() { return g.money; }, get modifiers() { return g.modifiers; },
  get lockModifierTiers() { return g.lock; },
  // The calendar the road group reads (game-code.md §12), as `shoptest.mjs` keeps it.
  gameMode: { isClassic: true, isWaveFinal: w => w === 200, isBoss: w => w % 10 === 0, isFixedBattle: w => w === 8, getFixedBattle: () => ({}), hasChallenge: () => false, challenges: [] },
  phaseManager: { getCurrentPhase: () => g.phase },
  ui: { getMode: () => g.mode, getHandler: () => g.handler, get handlers() { return g.handlers; } },
  getPlayerParty: () => g.party, getEnemyParty: () => g.foes, getField: () => [g.party[0], ...g.foes],
};
let scene = null;

globalThis.window = globalThis;
globalThis.COACHEMON_BUILD = "0.0.0+decision";
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
const node = tag => ({ tagName: tag, style: {}, children: [], addEventListener() {}, remove() {}, append() {}, replaceChildren() {} });
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node, visibilityState: "visible",
  addEventListener() {}, removeEventListener() {}, dispatchEvent: e => { events.push(e); return true; } };
globalThis.setInterval = fn => { ticker = fn; return 0; };
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud"));

const frame = () => { clock += 16; const cb = frameCb; frameCb = null; cb?.(clock); };
const runTasks = () => { while (tasks.length) tasks.shift()(); };
const decisions = () => __coachHud.stats().decisions;
const fmt = d => `#${d.id} ${d.kind}/${d.card} w${d.wave} ready ${d.ready} input ${d.input} drawn ${d.drawn} end ${d.end}`;
// The refresh records opened since the last call, each as `why:kind`.
let seq = 0;
const opened = () => {
  const t = __coachHud.stats().ticks.filter(r => r.seq > seq);
  if (t.length) seq = t.at(-1).seq;
  return t.map(r => `${r.why}${r.failed ? ":failed" : r.kind ? `:${r.kind}` : ""}`);
};
// One frame of the game in the state `change` leaves it in, then the tasks it queued unless `road` is false. Prints the
// newest decision record, or `·` when no record changed, and the refreshes the step opened.
let seen = "";
const step = (label, change = () => {}, { road = true } = {}) => {
  change();
  frame();
  if (road) runTasks();
  const all = decisions(), now = JSON.stringify(all);
  const last = all.at(-1), built = opened();
  console.log(label.padEnd(36), now === seen ? "·" : last ? fmt(last) : "", built.length ? `| ${built.join(" ")}` : "");
  seen = now;
  return built;
};
const count = kind => decisions().filter(d => d.kind === kind).length;
const cards = () => events.filter(e => e.type === "coachemon:card").map(e => JSON.parse(e.detail));

console.log("mounted with no game".padEnd(36), `| ${opened().join(" ")}`);
scene = game;

// ---- a command builds on its first ready frame, its road group in the task after, and its other screens build nothing
{
  const cmd = { phaseName: "CommandPhase", fieldIndex: 0 };
  assert.deepEqual(step("the prompt's message", () => { g.phase = cmd; g.mode = UiMode.MESSAGE; }), []);
  assert.deepEqual(step("command menu", () => { g.mode = UiMode.COMMAND; }), ["watch:battle", "road:battle"]);
  assert.deepEqual([decisions().at(-1).ready, decisions().at(-1).input], [16, 16]);
  assert.equal(__coachHud.last()?.kind, "battle");
  step("fight menu", () => { g.mode = UiMode.FIGHT; });
  step("target select", () => { g.phase = { phaseName: "SelectTargetPhase", fieldIndex: 0 }; g.mode = UiMode.TARGET_SELECT; });
  step("commit window", () => { g.phase = cmd; g.mode = UiMode.MESSAGE; });
  assert.equal(count("command"), 1, "target select and the commit window are the command's own frames");
  step("the enemy has chosen", () => { g.battle.turnCommands[BattlerIndex.ENEMY] = { move: 1 }; g.phase = { phaseName: "MoveEffectPhase" }; });
  assert.equal(decisions().at(-1).end, 80);
  assert.equal(__coachHud.stats().ticks.filter(t => t.why === "watch").length, 1, "one build for the whole decision");
}

// ---- a U-turn's party screen builds nothing, and the next turn's command builds
{
  const held = __coachHud.last();
  assert.deepEqual(step("U-turn party screen", () => { g.phase = { phaseName: "SwitchPhase", isModal: true, doReturn: true, fieldIndex: 0 }; g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.SWITCH }; }), []);
  assert.equal(decisions().at(-1).kind, "command", "no record for a mid-turn switch-in pick");
  assert.equal(__coachHud.last(), held, "the card is held through the switch-in pick");
  assert.deepEqual(step("next turn", () => { g.battle.turnCommands = {}; g.battle.turn = 2; g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.mode = UiMode.COMMAND; g.handler = {}; }),
    ["watch:battle", "road:battle"]);
  assert.equal(count("command"), 2);
}

// ---- a press before the road task runs leaves the road group to the next decision
{
  assert.deepEqual(step("turn 3, the card alone", () => { g.battle.turn = 3; }, { road: false }), ["watch:battle"]);
  step("pressed at once", () => { g.battle.turnCommands[BattlerIndex.ENEMY] = { move: 1 }; g.phase = { phaseName: "MoveEffectPhase" }; g.mode = UiMode.MESSAGE; }, { road: false });
  runTasks();
  assert.deepEqual(opened(), [], "the road task found its decision gone");
}

// ---- a faint, a level-up and a new wave between decisions build nothing, and the card is held
{
  const held = __coachHud.last();
  const between = [
    ...step("the foe faints", () => { g.foes[0].hp = 0; g.phase = { phaseName: "FaintPhase" }; }),
    ...step("a level-up", () => { g.phase = { phaseName: "LevelUpPhase" }; }),
    ...step("a new wave", () => { g.battle = battle(8, 1); g.foes = [foe(22)]; g.phase = { phaseName: "EncounterPhase" }; }),
  ];
  assert.deepEqual(between, []);
  assert.equal(__coachHud.last(), held);
  assert.equal(__coachHud.summary().wave, 7);
  assert.deepEqual(step("its first command", () => { g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.mode = UiMode.COMMAND; }), ["watch:battle", "road:battle"]);
  assert.equal(__coachHud.summary().wave, 8);
}

// ---- in a double, slot 1 is its own decision, and cancelling back to slot 0 asks slot 0's again
{
  step("double, slot 0", () => { g.battle.double = true; g.battle.turn = 3; g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; });
  step("slot 0's target select", () => { g.phase = { phaseName: "SelectTargetPhase", fieldIndex: 0 }; g.mode = UiMode.TARGET_SELECT; });
  step("slot 1", () => { g.phase = { phaseName: "CommandPhase", fieldIndex: 1 }; g.mode = UiMode.COMMAND; });
  step("slot 1's target select", () => { g.phase = { phaseName: "SelectTargetPhase", fieldIndex: 1 }; g.mode = UiMode.TARGET_SELECT; });
  step("cancel back to slot 0", () => { g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.mode = UiMode.COMMAND; });
  assert.equal(count("command"), 7);
  g.battle.double = false;
}

// ---- a free switch builds once the question is up, and its party screen is the same decision
{
  const check = { phaseName: "CheckSwitchPhase", fieldIndex: 0 };
  assert.deepEqual(step("free switch, the question's text", () => { g.phase = check; g.mode = UiMode.MESSAGE; }), []);
  // The same turn: the battle card it gets back already has its road group.
  assert.deepEqual(step("free switch, yes or no", () => { g.mode = UiMode.CONFIRM; }), ["watch:battle"]);
  assert.deepEqual(step("its party screen", () => { g.phase = { phaseName: "SwitchPhase", isModal: false, doReturn: true, fieldIndex: 0 }; g.mode = UiMode.PARTY; }), []);
  assert.equal(count("free-switch"), 1);
}

// ---- a replacement builds once its party screen is up
{
  assert.deepEqual(step("replacement, the faint's message", () => { g.phase = { phaseName: "SwitchPhase", isModal: true, doReturn: false, fieldIndex: 0 }; g.mode = UiMode.MESSAGE; }), []);
  assert.deepEqual(step("replacement, party up", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.FAINT_SWITCH }; }), ["watch:battle"]);
  assert.equal(count("replacement"), 1);
}

// ---- a shop builds once its offers are out, and a buy, a lock toggle, an item transfer and a reroll each build again
{
  const offers = { options: [], awaitingActionInput: false };
  let shop = { phaseName: "SelectModifierPhase" };
  const watched = () => __coachHud.stats().ticks.filter(t => t.why === "watch").length;
  const before = watched();
  step("shop, offers not out yet", () => { g.phase = shop; g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  const potion = { modifierTypeOption: { type: { id: "POTION", name: "Potion", iconImage: "potion", tier: 0 }, cost: 0 } };
  step("shop reveal", () => { offers.options = [potion, potion, potion]; });
  step("shop takes input", () => { offers.awaitingActionInput = true; });
  step("Revive's party screen", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.MODIFIER }; });
  assert.equal(watched() - before, 1, "picking a target is the same decision");
  step("back after buying it", () => { g.money = 700; g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  step("lock capsule toggled", () => { g.lock = true; });
  step("transfer screen", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.MODIFIER_TRANSFER }; });
  step("Leftovers handed over", () => { g.modifiers[0].pokemonId = 12; });
  step("back from the transfer", () => { g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  step("reroll", () => { shop = g.phase = { phaseName: "SelectModifierPhase" }; g.money = 450; });
  assert.equal(count("reward"), 5);
  assert.equal(watched() - before, 5, "each of the shop's decisions built once");
  step("splice screen", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.SPLICE }; });
  step("splice done", () => { g.party = [full]; });
  step("back to the shop", () => { g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  assert.deepEqual([count("fusion"), count("reward")], [2, 6]);
  g.party = [full, three];
}

// ---- a learn into a full moveset builds, and an automatic or already-known one does not
{
  assert.deepEqual(step("auto-learn, three moves", () => { g.phase = { phaseName: "LearnMovePhase", partyMemberIndex: 1, moveId: 53 }; g.mode = UiMode.MESSAGE; g.handler = {}; }), []);
  assert.deepEqual(step("already known", () => { g.phase = { phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: 52 }; }), []);
  assert.equal(count("learn"), 0);
  assert.deepEqual(step("learn, the prompt's message", () => { g.phase = { phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: 53 }; }), ["watch:learn"]);
  step("learn, forget a move?", () => { g.mode = UiMode.CONFIRM; });
  step("learn, the summary", () => { g.mode = UiMode.SUMMARY; g.handler = { summaryUiMode: 1, pokemon: full, newMove: new Move(53).getMove() }; });
  const d = decisions().at(-1);
  assert.deepEqual([d.kind, d.ready, d.input, d.drawn, d.refreshes], ["learn", 0, 16, 0, 1]);
  assert.equal(__coachHud.last()?.kind, "learn");
  console.log(`learn card ${__coachHud.summary().learn}`);}

// ---- a biome, an encounter and the starter screen build once ready, and open input once their block lifts
{
  const menu = { config: { options: [1, 2] }, blockInput: true };
  step("biome, blocked", () => { g.phase = { phaseName: "SelectBiomePhase" }; g.mode = UiMode.OPTION_SELECT; g.handler = menu; });
  step("biome, open", () => { menu.blockInput = false; });
  const me = { encounterOptions: [], blockInput: true };
  step("encounter, before its options", () => { g.battle.mysteryEncounter = { encounterType: 0, encounterTier: 0 }; g.phase = { phaseName: "MysteryEncounterPhase" }; g.mode = UiMode.MYSTERY_ENCOUNTER; g.handler = me; });
  step("encounter, options out", () => { me.encounterOptions = [1, 2]; });
  step("encounter, open", () => { me.blockInput = false; });
  step("starter, loading", () => { delete g.battle.mysteryEncounter; g.phase = { phaseName: "SelectStarterPhase" }; g.mode = UiMode.STARTER_SELECT; g.handlers = {}; });
  step("starter, ready", () => { g.handlers = { [UiMode.STARTER_SELECT]: { starterSelectCallback: () => {} } }; });
  const by = kind => decisions().filter(d => d.kind === kind).map(d => [d.ready, d.input, d.refreshes]);
  assert.deepEqual([by("biome"), by("encounter"), by("starter")], [[[0, 16, 1]], [[16, 32, 1]], [[16, 16, 1]]]);
}

// ---- the streamed card goes again once its road group lands
{
  const before = cards().length;
  // A free switch: the command's live read in this game stops at the exact gate, which hides the road.
  step("a free switch, the card alone", () => { g.battle = battle(9, 1); g.foes = [foe(23)]; g.phase = { phaseName: "CheckSwitchPhase", fieldIndex: 0 }; g.mode = UiMode.CONFIRM; g.handler = {}; g.handlers = {}; }, { road: false });
  const bare = cards().slice(before);
  runTasks();
  assert.deepEqual(opened(), ["road:battle"]);
  const sent = cards().slice(before);
  const road = c => c.groups.find(x => x.id === "road")?.summary ?? null;
  for (const c of sent) console.log(`streamed ${c.kind} ${c.key} ${c.verdict} | road ${road(c)}`);
  assert.deepEqual([bare.length, sent.length], [1, 2]);
  assert.deepEqual([road(sent[0]), typeof road(sent[1])], [null, "string"], "the second carries the road group");
  const { build: _, ...body } = sent[1];
  assert.deepEqual(body, __coachHud.card(), "the second is the card the hub reads");
  step("its party screen", () => { g.phase = { phaseName: "SwitchPhase", isModal: false, doReturn: true, fieldIndex: 0 }; g.mode = UiMode.PARTY; });
  assert.equal(cards().length - before, 2, "nothing more until the next decision");
}

// ---- with no frames the fallback builds a new decision once, with frames it builds nothing, and the title takes the card down
{
  ticker();
  const framed = opened();
  g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.mode = UiMode.COMMAND; g.handler = {};
  ticker();
  const quiet = opened();
  ticker();
  const again = opened();
  console.log(`frames stop: ${framed.join(" ")}, then a new decision: ${quiet.join(" ")}, then ${again.join(" ")}`);
  assert.deepEqual([framed, quiet, again], [["fallback"], ["fallback:battle"], ["fallback"]]);
  frame();
  g.battle.turn = 3;
  ticker();
  assert.deepEqual(opened(), ["fallback"], "a frame since the last tick: the watch builds, not the fallback");
  assert.deepEqual(step("the frame after", () => {}), ["watch:battle", "road:battle"]);
  step("back to the title", () => { g.phase = { phaseName: "TitlePhase" }; g.mode = UiMode.TITLE; g.handler = {}; });
  assert.equal(__coachHud.last()?.kind, "battle", "held until the fallback looks");
  ticker();
  assert.deepEqual([opened(), __coachHud.last()], [["fallback"], null]);
}

// ---- a drain hands back the decisions so far, and the open one carries on into the next window
{
  const cmd = { phaseName: "CommandPhase", fieldIndex: 0 };
  step("a command before the drain", () => { g.battle = battle(8, 1); g.phase = cmd; g.mode = UiMode.COMMAND; g.handler = {}; });
  const drained = __coachMeter.drain().decisions;
  step("its menu after the drain", () => { g.mode = UiMode.FIGHT; });
  step("the turn plays", () => { g.phase = { phaseName: "TurnStartPhase" }; g.mode = UiMode.MESSAGE; });
  const [d] = decisions();
  console.log(`drained ${drained.length} then ${decisions().map(fmt).join(" | ")}`);
  assert.equal(drained.at(-1).id, d.id, "the open decision is in both windows");
  assert.deepEqual([decisions().length, d.wave, d.end], [1, 8, 32]);
}

// ---- a frame where the decision holds opens no refresh and allocates nothing
{
  const N = 100000;
  g.phase = { phaseName: "SelectModifierPhase" }; g.mode = UiMode.MODIFIER_SELECT; g.handler = { options: [1], awaitingActionInput: true };
  frame();
  runTasks();
  const before = __coachHud.stats();
  for (let i = 0; i < N; i++) frame();
  const collections = [];
  const watcher = new NodeObserver(list => collections.push(...list.getEntries().map(e => e.startTime)));
  watcher.observe({ entryTypes: ["gc"] });
  gc();
  const from = nodePerf.now(), heap = process.memoryUsage().heapUsed;
  for (let i = 0; i < N; i++) frame();
  const grew = process.memoryUsage().heapUsed - heap, to = nodePerf.now();
  await new Promise(r => later(r, 10));
  watcher.disconnect();
  const after = __coachHud.stats();
  console.log(`watch frames ${after.watch.frames - before.watch.frames} refreshes ${after.ticks.at(-1).seq - before.ticks.at(-1).seq}`);
  assert.equal(after.ticks.at(-1).seq, before.ticks.at(-1).seq, "the watch opened no refresh");
  assert.deepEqual(collections.filter(t => t >= from && t <= to), [], "a collection ran inside the measured frames");
  assert.ok(grew < N, `the heap grew ${grew} bytes over ${N} frames`);
  opened();
}

// ---- `stop()` unhooks the frame callback
{
  const watched = __coachMeter.stats().watch.frames;
  __coachHud.stop();
  g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.battle = battle(10, 1); g.mode = UiMode.COMMAND; g.handler = {};
  frame();
  runTasks();
  const s = __coachMeter.stats();
  console.log(`after stop: watch frames ${s.watch.frames - watched}, refreshes ${s.ticks.filter(t => t.seq > seq).length}`);
  assert.deepEqual([s.watch.frames, s.ticks.filter(t => t.seq > seq).length], [watched, 0]);
}
