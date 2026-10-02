import assert from "node:assert/strict";
import { PerformanceObserver as NodeObserver, performance as nodePerf } from "node:perf_hooks";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { bundle } from "../hud-bundle.mjs";
import { BattlerIndex, PartyUiMode, UiMode } from "../../../../src/enums/generated.ts";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc");

let clock = 0, frameCb = null, ticker = null;
Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: {
  now: () => clock, mark() {}, clearMarks() {}, measure() {}, clearMeasures() {},
} });
globalThis.requestAnimationFrame = cb => { frameCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => { frameCb = null; };

// The game the overlay looks at. Every field is read through the scene on each frame, so a step changes it in place.
const TY = ["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water", "Grass"];
const mv = (id, n, t, p, c) => ({ moveId: id, getName: () => n, getMovePp: () => 10, ppUsed: 0,
  getMove: () => ({ id, name: n, type: TY.indexOf(t), power: p, category: c, accuracy: 100, moveTarget: 3, isChargingMove: () => false, attrs: [] }) });
const mon = (id, name, moves) => ({ id, name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => [TY.indexOf("Fire")],
  getAbility: () => ({ name: "x" }), getStat: () => 100, getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves });
const full = mon(11, "Charmeleon", [mv(33, "Tackle", "Normal", 40, 0), mv(52, "Ember", "Fire", 40, 1), mv(225, "Dragon Breath", "Normal", 60, 1), mv(10, "Scratch", "Normal", 40, 0)]);
const three = mon(12, "Bulbasaur", [mv(33, "Tackle", "Normal", 40, 0), mv(22, "Vine Whip", "Grass", 45, 0), mv(45, "Growl", "Normal", 0, 2)]);
const g = {
  phase: null, mode: UiMode.MESSAGE, handler: {}, handlers: {}, money: 1000, lock: false,
  battle: { waveIndex: 7, turn: 1, double: false, turnCommands: {} },
  party: [full, three],
  modifiers: [{ pokemonId: 11, stackCount: 1, type: { id: "LEFTOVERS" } }, { pokemonId: 12, stackCount: 2, type: { id: "BERRY" } }, { stackCount: 1, type: { id: "EXP_SHARE" } }],
};
const game = {
  get currentBattle() { return g.battle; }, get money() { return g.money; }, get modifiers() { return g.modifiers; },
  get lockModifierTiers() { return g.lock; },
  phaseManager: { getCurrentPhase: () => g.phase },
  ui: { getMode: () => g.mode, getHandler: () => g.handler, get handlers() { return g.handlers; } },
  getPlayerParty: () => g.party, getEnemyParty: () => [],
};
let scene = null;

globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
const node = tag => ({ tagName: tag, style: {}, children: [], addEventListener() {}, remove() {}, append() {}, replaceChildren() {} });
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node, visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
globalThis.setInterval = fn => { ticker = fn; return 0; };
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud"));
scene = game;

const frame = () => { clock += 16; const cb = frameCb; frameCb = null; cb?.(clock); };
const decisions = () => __coachHud.stats().decisions;
const fmt = d => `#${d.id} ${d.kind}/${d.card} w${d.wave} ready ${d.ready} input ${d.input} drawn ${d.drawn} end ${d.end}`;
// One frame of the game in the state `change` leaves it in; prints the decision records that frame added or touched.
let seen = "";
const step = (label, change = () => {}) => {
  change();
  frame();
  const all = decisions(), now = JSON.stringify(all);
  const last = all.at(-1);
  console.log(label.padEnd(36), now === seen ? "·" : last ? fmt(last) : "");
  seen = now;
  return all;
};
const count = kind => decisions().filter(d => d.kind === kind).length;

// ---- a command is ready once its prompt is up, and target select and the commit window stay inside it
{
  const cmd = { phaseName: "CommandPhase", fieldIndex: 0 };
  step("the prompt's message", () => { g.phase = cmd; g.mode = UiMode.MESSAGE; });
  step("command menu", () => { g.mode = UiMode.COMMAND; });
  assert.deepEqual([decisions().at(-1).ready, decisions().at(-1).input], [16, 16]);
  step("fight menu", () => { g.mode = UiMode.FIGHT; });
  step("target select", () => { g.phase = { phaseName: "SelectTargetPhase", fieldIndex: 0 }; g.mode = UiMode.TARGET_SELECT; });
  step("commit window", () => { g.phase = cmd; g.mode = UiMode.MESSAGE; });
  assert.equal(count("command"), 1, "target select and the commit window are the command's own frames");
  step("the enemy has chosen", () => { g.battle.turnCommands[BattlerIndex.ENEMY] = { move: 1 }; g.phase = { phaseName: "MoveEffectPhase" }; });
  assert.equal(decisions().at(-1).end, 80);
}

// ---- a U-turn's party screen is not a decision, and the next turn's command is
{
  step("U-turn party screen", () => { g.phase = { phaseName: "SwitchPhase", isModal: true, doReturn: true, fieldIndex: 0 }; g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.SWITCH }; });
  assert.equal(decisions().at(-1).kind, "command", "no record for a mid-turn switch-in pick");
  step("next turn", () => { g.battle.turnCommands = {}; g.battle.turn = 2; g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.mode = UiMode.COMMAND; g.handler = {}; });
  assert.equal(count("command"), 2);
}

// ---- in a double, slot 1 is its own decision, and cancelling back to slot 0 asks slot 0's again
{
  step("double, slot 0", () => { g.battle.double = true; g.battle.turn = 3; g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; });
  step("slot 0's target select", () => { g.phase = { phaseName: "SelectTargetPhase", fieldIndex: 0 }; g.mode = UiMode.TARGET_SELECT; });
  step("slot 1", () => { g.phase = { phaseName: "CommandPhase", fieldIndex: 1 }; g.mode = UiMode.COMMAND; });
  step("slot 1's target select", () => { g.phase = { phaseName: "SelectTargetPhase", fieldIndex: 1 }; g.mode = UiMode.TARGET_SELECT; });
  step("cancel back to slot 0", () => { g.phase = { phaseName: "CommandPhase", fieldIndex: 0 }; g.mode = UiMode.COMMAND; });
  assert.equal(count("command"), 5);
  g.battle.double = false;
}

// ---- a free switch is asked once the question is up, and its party screen is the same decision
{
  const check = { phaseName: "CheckSwitchPhase", fieldIndex: 0 };
  step("free switch, the question's text", () => { g.phase = check; g.mode = UiMode.MESSAGE; });
  step("free switch, yes or no", () => { g.mode = UiMode.CONFIRM; });
  step("its party screen", () => { g.phase = { phaseName: "SwitchPhase", isModal: false, doReturn: true, fieldIndex: 0 }; g.mode = UiMode.PARTY; });
  assert.equal(count("free-switch"), 1);
  assert.deepEqual([decisions().at(-1).ready, decisions().at(-1).input], [16, 16]);
}

// ---- a replacement is ready once its party screen is up
{
  step("replacement, the faint's message", () => { g.phase = { phaseName: "SwitchPhase", isModal: true, doReturn: false, fieldIndex: 0 }; g.mode = UiMode.MESSAGE; });
  step("replacement, party up", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.FAINT_SWITCH }; });
  assert.equal(count("replacement"), 1);
  assert.deepEqual([decisions().at(-1).ready, decisions().at(-1).input], [16, 16]);
}

// ---- a shop takes input after its reveal, and a buy, a lock toggle, an item transfer and a reroll each ask anew
{
  const offers = { options: [], awaitingActionInput: false };
  let shop = { phaseName: "SelectModifierPhase" };
  step("shop, offers not out yet", () => { g.phase = shop; g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  step("shop reveal", () => { offers.options = [1, 2, 3]; });
  step("shop takes input", () => { offers.awaitingActionInput = true; });
  assert.deepEqual([decisions().at(-1).ready, decisions().at(-1).input], [16, 32]);
  step("Revive's party screen", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.MODIFIER }; });
  assert.equal(count("reward"), 1, "picking a target is the same decision");
  step("back after buying it", () => { g.money = 700; g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  step("lock capsule toggled", () => { g.lock = true; });
  step("transfer screen", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.MODIFIER_TRANSFER }; });
  step("Leftovers handed over", () => { g.modifiers[0].pokemonId = 12; });
  step("back from the transfer", () => { g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  step("reroll", () => { shop = g.phase = { phaseName: "SelectModifierPhase" }; g.money = 450; });
  assert.equal(count("reward"), 5);
  step("splice screen", () => { g.mode = UiMode.PARTY; g.handler = { partyUiMode: PartyUiMode.SPLICE }; });
  step("splice done", () => { g.party = [full]; });
  step("back to the shop", () => { g.mode = UiMode.MODIFIER_SELECT; g.handler = offers; });
  assert.deepEqual([count("fusion"), count("reward")], [2, 6]);
  g.party = [full, three];
}

// ---- a learn into a full moveset is a decision, an automatic or already-known one is not, and its card's arrival is kept
{
  step("auto-learn, three moves", () => { g.phase = { phaseName: "LearnMovePhase", partyMemberIndex: 1, moveId: 99 }; g.mode = UiMode.MESSAGE; g.handler = {}; });
  step("already known", () => { g.phase = { phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: 52 }; });
  assert.equal(count("learn"), 0);
  step("learn, the prompt's message", () => { g.phase = { phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: 53 }; });
  step("learn, forget a move?", () => { g.mode = UiMode.CONFIRM; });
  step("learn, the summary", () => { g.mode = UiMode.SUMMARY; g.handler = { summaryUiMode: 1, pokemon: full, newMove: mv(53, "Flamethrower", "Fire", 90, 1).getMove() }; });
  clock += 4;
  ticker();
  step("the clock drew its card", () => {});
  const d = decisions().at(-1);
  assert.deepEqual([d.kind, d.ready, d.input, d.drawn, d.refreshes], ["learn", 0, 16, 36, 1]);
  assert.equal(__coachHud.last()?.kind, "learn");
  assert.equal(__coachHud.stats().ticks.at(-1).why, "clock");
}

// ---- a biome, an encounter and the starter screen open input once their block lifts
{
  const menu = { config: { options: [1, 2] }, blockInput: true };
  step("biome, blocked", () => { g.phase = { phaseName: "SelectBiomePhase" }; g.mode = UiMode.OPTION_SELECT; g.handler = menu; });
  step("biome, open", () => { menu.blockInput = false; });
  const me = { encounterOptions: [], blockInput: true };
  step("encounter, before its options", () => { g.phase = { phaseName: "MysteryEncounterPhase" }; g.mode = UiMode.MYSTERY_ENCOUNTER; g.handler = me; });
  step("encounter, options out", () => { me.encounterOptions = [1, 2]; });
  step("encounter, open", () => { me.blockInput = false; });
  step("starter, loading", () => { g.phase = { phaseName: "SelectStarterPhase" }; g.mode = UiMode.STARTER_SELECT; g.handlers = {}; });
  step("starter, ready", () => { g.handlers = { [UiMode.STARTER_SELECT]: { starterSelectCallback: () => {} } }; });
  const by = kind => decisions().filter(d => d.kind === kind).map(d => [d.ready, d.input]);
  assert.deepEqual([by("biome"), by("encounter"), by("starter")], [[[0, 16]], [[16, 32]], [[16, 16]]]);
}

// ---- a drain hands back the decisions so far, and the open one carries on into the next window
{
  const cmd = { phaseName: "CommandPhase", fieldIndex: 0 };
  step("a command before the drain", () => { g.battle = { waveIndex: 8, turn: 1, double: false, turnCommands: {} }; g.phase = cmd; g.mode = UiMode.COMMAND; g.handler = {}; });
  const drained = __coachMeter.drain().decisions;
  step("its menu after the drain", () => { g.mode = UiMode.FIGHT; });
  step("the turn plays", () => { g.phase = { phaseName: "TurnStartPhase" }; g.mode = UiMode.MESSAGE; });
  const [d] = decisions();
  console.log(`drained ${drained.length} then ${decisions().map(fmt).join(" | ")}`);
  assert.equal(drained.at(-1).id, d.id, "the open decision is in both windows");
  assert.deepEqual([decisions().length, d.wave, d.end], [1, 8, 32]);
}

// ---- the watch's look opens no refresh, and a frame where the decision holds allocates nothing
{
  const N = 100000;
  g.phase = { phaseName: "SelectModifierPhase" }; g.mode = UiMode.MODIFIER_SELECT; g.handler = { options: [1], awaitingActionInput: true };
  const before = __coachHud.stats();
  for (let i = 0; i < N; i++) frame();
  const collections = [];
  const watcher = new NodeObserver(list => collections.push(...list.getEntries().map(e => e.startTime)));
  watcher.observe({ entryTypes: ["gc"] });
  gc();
  const from = nodePerf.now(), heap = process.memoryUsage().heapUsed;
  for (let i = 0; i < N; i++) frame();
  const grew = process.memoryUsage().heapUsed - heap, to = nodePerf.now();
  await new Promise(r => setTimeout(r, 10));
  watcher.disconnect();
  const after = __coachHud.stats();
  console.log(`watch frames ${after.watch.frames - before.watch.frames} refreshes ${after.ticks.length - before.ticks.length}`);
  assert.equal(after.ticks.length, before.ticks.length, "the watch opened no refresh");
  assert.deepEqual(collections.filter(t => t >= from && t <= to), [], "a collection ran inside the measured frames");
  assert.ok(grew < N, `the heap grew ${grew} bytes over ${N} frames`);
}

