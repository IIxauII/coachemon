import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { BattlerIndex, PartyUiMode, UiMode } from "../../../../src/enums/generated.ts";

let clock = 0;
Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: {
  now: () => clock, mark() {}, clearMarks() {}, measure() {}, clearMeasures() {},
} });
globalThis.window = globalThis;
globalThis.Phaser = { Display: { Canvas: { CanvasPool: { pool: [] } } } };
const node = () => ({ style: {}, children: [], addEventListener() {}, remove() {}, append() {}, replaceChildren() {} });
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node, visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud", { expose: true }));
const { watchFrame, watchBuilt } = globalThis.__hud["02-watch"];

const battle = { turn: 1, turnCommands: {} };
const party = [{ moveset: [{ moveId: 1 }, { moveId: 2 }, { moveId: 3 }, { moveId: 4 }] }, { moveset: [{ moveId: 1 }] }];
const scene = (phase, mode, handler = {}) => ({
  currentBattle: battle, getPlayerParty: () => party,
  phaseManager: { getCurrentPhase: () => phase },
  ui: { getMode: () => mode, getHandler: () => handler, handlers: {} },
});
const step = (label, s) => {
  clock += 16;
  const fresh = watchFrame(s);
  const d = __coachMeter.stats().decisions.at(-1);
  console.log(label.padEnd(34), fresh ? "build" : "-    ", d ? `${d.kind} ready ${d.ready} input ${d.input} end ${d.end}` : "");
  return fresh;
};
__coachMeter.reset();

// ---- a command is built on its first ready frame, and both slots and the commit window are the same decision
assert.equal(step("command, slot 0", scene({ phaseName: "CommandPhase" }, UiMode.COMMAND)), true);
assert.equal(step("command, same frame again", scene({ phaseName: "CommandPhase" }, UiMode.COMMAND)), false);
assert.equal(step("commit window", scene({ phaseName: "CommandPhase" }, UiMode.MESSAGE)), false);
assert.equal(step("command, slot 1", scene({ phaseName: "CommandPhase" }, UiMode.COMMAND)), false);
assert.equal(step("target select", scene({ phaseName: "SelectTargetPhase" }, UiMode.TARGET_SELECT)), false);
assert.equal(watchBuilt(), true);
battle.turnCommands[BattlerIndex.ENEMY] = { move: 1 };
assert.equal(step("the enemy has chosen", scene({ phaseName: "MoveEffectPhase" }, UiMode.MESSAGE)), false);
assert.equal(watchBuilt(), false);
battle.turnCommands = {}; battle.turn = 2;
assert.equal(step("next turn", scene({ phaseName: "CommandPhase" }, UiMode.COMMAND)), true);

// ---- a shop takes input only after its reveal, a purchase is the same decision, and back from a fusion it is new
const shop = { phaseName: "SelectModifierPhase" };
const offers = { options: [1, 2, 3], awaitingActionInput: false };
assert.equal(step("shop reveal", scene(shop, UiMode.MODIFIER_SELECT, offers)), true);
offers.awaitingActionInput = true;
assert.equal(step("shop takes input", scene(shop, UiMode.MODIFIER_SELECT, offers)), false);
assert.equal(step("TM party screen", scene(shop, UiMode.PARTY, { partyUiMode: PartyUiMode.TM_MODIFIER })), false);
assert.equal(step("splice screen", scene(shop, UiMode.PARTY, { partyUiMode: PartyUiMode.SPLICE })), true);
assert.equal(step("back to the shop", scene(shop, UiMode.MODIFIER_SELECT, offers)), true);

// ---- a learn into a full moveset is a decision; under four moves, or a move it knows, is none
assert.equal(step("auto-learn, three moves", scene({ phaseName: "LearnMovePhase", partyMemberIndex: 1, moveId: 9 }, UiMode.MESSAGE)), false);
assert.equal(step("already known", scene({ phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: 3 }, UiMode.MESSAGE)), false);
const learn = { phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: 9 };
assert.equal(step("learn, prompted message", scene(learn, UiMode.MESSAGE)), true);
assert.equal(step("learn, forget a move?", scene(learn, UiMode.CONFIRM)), false);

// ---- a U-turn's party screen is not a decision; a faint's replacement is, once the party screen is up
assert.equal(step("U-turn party screen", scene({ phaseName: "SwitchPhase", isModal: true, doReturn: true }, UiMode.PARTY)), false);
const faint = { phaseName: "SwitchPhase", isModal: true, doReturn: false };
assert.equal(step("replacement, fading", scene(faint, UiMode.MESSAGE)), false);
assert.equal(step("replacement, party up", scene(faint, UiMode.PARTY)), true);

// ---- a biome and an encounter open input only once their block lifts
const biome = { phaseName: "SelectBiomePhase" };
const menu = { config: { options: [1, 2] }, blockInput: true };
assert.equal(step("biome, blocked", scene(biome, UiMode.OPTION_SELECT, menu)), true);
menu.blockInput = false;
assert.equal(step("biome, open", scene(biome, UiMode.OPTION_SELECT, menu)), false);
const [d] = __coachMeter.stats().decisions.filter(x => x.kind === "biome");
assert.deepEqual([d.ready, d.input], [0, 16]);
