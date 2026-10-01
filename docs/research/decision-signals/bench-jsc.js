// Research benchmark for #518: the watch (`watch.js`) on a synthetic scene shaped like PokéRogue's, timed per kind and
// over a mixed frame sequence. Runs under JavaScriptCore's shell and under Node alike:
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m bench-jsc.js
//   node bench-jsc.js
//
// The shapes copy the game's (pinned 1.12.0.11): phases are class instances whose `phaseName` is an own field set in
// the constructor, `PhaseManager.getCurrentPhase()` returns a field, `UI.getMode()`/`getHandler()` read `mode` and
// `handlers[mode]` (48 handlers, each its own class), `Battle.turnCommands` is `Object.fromEntries` over BattlerIndex.
import { makeWatch } from "./watch.js";

const now = typeof preciseTime === "function" ? () => preciseTime() * 1e3 : () => performance.now();
const say = typeof globalThis.print === "function" ? globalThis.print : (...a) => console.log(...a);
const engine = typeof preciseTime === "function" ? "JavaScriptCore (jsc shell)" : `V8 (node ${process.version})`;

const UiMode = { MESSAGE: 0, TITLE: 1, COMMAND: 2, FIGHT: 3, BALL: 4, TARGET_SELECT: 5, MODIFIER_SELECT: 6, SAVE_SLOT: 7,
  PARTY: 8, SUMMARY: 9, STARTER_SELECT: 10, EVOLUTION_SCENE: 11, CONFIRM: 14, OPTION_SELECT: 15, MYSTERY_ENCOUNTER: 45 };
const PartyUiMode = { SWITCH: 0, FAINT_SWITCH: 1, POST_BATTLE_SWITCH: 2, TM_MODIFIER: 6, SPLICE: 9 };
const BattlerIndex = { ATTACKER: -1, PLAYER: 0, PLAYER_2: 1, ENEMY: 2, ENEMY_2: 3 };
const E = { UiMode, PartyUiMode, BattlerIndex };

// ---- phases: a base chain like the game's (Phase → BattlePhase → FieldPhase …), one class per name
class Phase { start() {} end() {} }
class BattlePhase extends Phase {}
class FieldPhase extends BattlePhase {}
class PokemonPhase extends FieldPhase { constructor(i = 0) { super(); this.battlerIndex = i; this.player = true; this.fieldIndex = i; } }
class PartyMemberPokemonPhase extends FieldPhase {
  constructor(i, player) { super(); this.partyMemberIndex = i; this.fieldIndex = i < 2 ? i : -1; this.player = player; }
}
const phaseClass = (name, Base = BattlePhase) => ({ [name]: class extends Base { constructor(...a) { super(...a); this.phaseName = name; } } })[name];
// Phases the game runs between decisions, so the `phaseName` read sees as many shapes as it does in a real turn.
const BUSY = ["TurnInitPhase", "EnemyCommandPhase", "TurnStartPhase", "MovePhase", "MoveEffectPhase", "MoveEndPhase",
  "DamageAnimPhase", "FaintPhase", "VictoryPhase", "ExpPhase", "LevelUpPhase", "MessagePhase", "ShowAbilityPhase",
  "HideAbilityPhase", "StatStageChangePhase", "WeatherEffectPhase", "BerryPhase", "TurnEndPhase", "BattleEndPhase",
  "EncounterPhase", "SummonPhase", "PostSummonPhase", "SwitchSummonPhase", "ReturnPhase", "NewBattlePhase",
  "SwitchBiomePhase", "PartyHealPhase", "ModifierRewardPhase", "EvolutionPhase", "CheckStatusEffectPhase",
  "PostTurnStatusEffectPhase", "ToggleDoublePositionPhase", "PositionalTagPhase", "GameOverPhase", "EggLapsePhase",
  "AttemptCapturePhase", "ShowPartyExpBarPhase", "HidePartyExpBarPhase", "PokemonHealPhase", "MoneyRewardPhase"]
  .map(n => phaseClass(n, PokemonPhase));
const CommandPhase = phaseClass("CommandPhase", FieldPhase);
const SelectTargetPhase = phaseClass("SelectTargetPhase", PokemonPhase);
class CheckSwitchPhase extends BattlePhase { constructor(f, u) { super(); this.phaseName = "CheckSwitchPhase"; this.fieldIndex = f; this.useName = u; } }
class SwitchPhase extends BattlePhase {
  constructor(t, f, modal, ret) { super(); this.phaseName = "SwitchPhase"; this.fieldIndex = f; this.switchType = t; this.isModal = modal; this.doReturn = ret; }
}
class SelectModifierPhase extends BattlePhase {
  constructor(r = 0) { super(); this.phaseName = "SelectModifierPhase"; this.rerollCount = r; this.modifierTiers = undefined; this.customModifierSettings = undefined; this.isCopy = false; this.typeOptions = []; }
}
class LearnMovePhase extends PartyMemberPokemonPhase {
  constructor(i, id) { super(i, true); this.phaseName = "LearnMovePhase"; this.moveId = id; this.messageMode = 0; this.learnMoveType = 0; this.cost = -1; }
}
const SelectBiomePhase = phaseClass("SelectBiomePhase");
class MysteryEncounterPhase extends Phase { constructor(o) { super(); this.phaseName = "MysteryEncounterPhase"; this.FIRST_DIALOGUE_PROMPT_DELAY = 300; this.optionSelectSettings = o; } }
const SelectStarterPhase = phaseClass("SelectStarterPhase", Phase);

class PhaseManager {
  constructor() { this.phaseQueue = { levels: [[]], currentLevel: 0 }; this.dynamicQueueManager = {}; this.currentPhase = null; this.standbyPhase = null; }
  getCurrentPhase() { return this.currentPhase; }
}

// ---- UI: 48 handlers, each its own class, the decision ones with the fields the watch reads
class UiHandler { constructor(mode) { this.mode = mode; this.active = false; this.cursor = 0; } }
const handlers = Array.from({ length: 48 }, (_, i) => new ({ [`H${i}`]: class extends UiHandler {} })[`H${i}`](i));
class PartyUiHandler extends UiHandler { constructor() { super(UiMode.PARTY); this.partyUiMode = 0; this.fieldIndex = -1; this.selectCallback = null; this.transferMode = false; } }
class ModifierSelectUiHandler extends UiHandler { constructor() { super(UiMode.MODIFIER_SELECT); this.options = []; this.shopOptionsRows = []; this.awaitingActionInput = false; } }
class OptionSelectUiHandler extends UiHandler { constructor() { super(UiMode.OPTION_SELECT); this.config = null; this.blockInput = false; } }
class MysteryEncounterUiHandler extends UiHandler { constructor() { super(UiMode.MYSTERY_ENCOUNTER); this.overrideSettings = undefined; this.encounterOptions = []; this.blockInput = true; } }
class StarterSelectUiHandler extends UiHandler { constructor() { super(UiMode.STARTER_SELECT); this.starterSelectCallback = null; } }
handlers[UiMode.PARTY] = new PartyUiHandler();
handlers[UiMode.MODIFIER_SELECT] = new ModifierSelectUiHandler();
handlers[UiMode.OPTION_SELECT] = new OptionSelectUiHandler();
handlers[UiMode.MYSTERY_ENCOUNTER] = new MysteryEncounterUiHandler();
handlers[UiMode.STARTER_SELECT] = new StarterSelectUiHandler();
class UI {
  constructor() { this.mode = UiMode.MESSAGE; this.modeChain = []; this.handlers = handlers; this.overlayActive = false; }
  getMode() { return this.mode; }
  getHandler() { return this.handlers[this.mode]; }
}

class PokemonMove { constructor(id) { this.moveId = id; this.ppUsed = 0; this.ppUp = 0; } }
class Pokemon { constructor(id, moves) { this.id = id; this.hp = 100; this.moveset = moves.map(m => new PokemonMove(m)); } }
class Battle {
  constructor(wave) {
    this.waveIndex = wave; this.turn = 1; this.double = false;
    this.turnCommands = Object.fromEntries(Object.values(BattlerIndex).map(b => [b, null]));
  }
}
class Scene {
  constructor() {
    this.phaseManager = new PhaseManager(); this.ui = new UI(); this.currentBattle = new Battle(12);
    this.party = [new Pokemon(1, [33, 45, 52, 98]), new Pokemon(2, [10, 43]), new Pokemon(3, [1, 2, 3, 4])];
  }
  getPlayerParty() { return this.party; }
}

// ---- one state per kind, each as the frame after the decision opened
const s = new Scene();
const at = (phase, mode, prep = () => {}) => () => { s.phaseManager.currentPhase = phase; s.ui.mode = mode; prep(); };
const STATES = {
  command: at(new CommandPhase(0), UiMode.COMMAND),
  "command (target select)": at(new SelectTargetPhase(0), UiMode.TARGET_SELECT),
  "free switch (question)": at(new CheckSwitchPhase(0, false), UiMode.CONFIRM),
  "free switch (party)": at(new SwitchPhase(3, 0, false, true), UiMode.PARTY, () => { handlers[UiMode.PARTY].partyUiMode = PartyUiMode.POST_BATTLE_SWITCH; }),
  replacement: at(new SwitchPhase(1, 0, true, false), UiMode.PARTY, () => { handlers[UiMode.PARTY].partyUiMode = PartyUiMode.FAINT_SWITCH; }),
  reward: at(new SelectModifierPhase(), UiMode.MODIFIER_SELECT, () => { handlers[UiMode.MODIFIER_SELECT].options = [{}, {}, {}]; }),
  learn: at(new LearnMovePhase(0, 200), UiMode.MESSAGE),
  biome: at(new SelectBiomePhase(), UiMode.OPTION_SELECT, () => { handlers[UiMode.OPTION_SELECT].config = { options: [{}, {}], delay: 1000 }; }),
  encounter: at(new MysteryEncounterPhase(), UiMode.MYSTERY_ENCOUNTER, () => { handlers[UiMode.MYSTERY_ENCOUNTER].encounterOptions = [{}, {}, {}]; }),
  starter: at(new SelectStarterPhase(), UiMode.STARTER_SELECT, () => { handlers[UiMode.STARTER_SELECT].starterSelectCallback = () => {}; }),
  fusion: at(new SelectModifierPhase(), UiMode.PARTY, () => { handlers[UiMode.PARTY].partyUiMode = PartyUiMode.SPLICE; }),
  "no decision (MovePhase)": at(new BUSY[3](0), UiMode.MESSAGE),
};

const { watch, reset } = makeWatch(E);
let sink = 0;

// Cold: the first frames after the overlay loads, before the engine has optimised `watch`. Runs before anything else
// has called it. Each state is held 8 frames, as in the mixed sequence below.
{
  const order = Object.values(STATES);
  const chunks = [];
  let f = 0;
  for (const size of [1, 59, 540, 5400]) {
    const t0 = now();
    for (let i = 0; i < size; i++, f++) {
      if ((f & 7) === 0) order[(f >> 3) % order.length]();
      sink += watch(s).fresh ? 1 : 0;
    }
    chunks.push([size, ((now() - t0) * 1e6) / size]);
  }
  say(`cold, ns per frame: ${chunks.map(([n, ns]) => `${n === 1 ? "first frame" : `next ${n}`} ${ns.toFixed(0)}`).join(", ")}`);
  reset();
}
const time = (setup, n) => {
  setup();
  for (let i = 0; i < 2e5; i++) sink += watch(s).ready ? 1 : 0;
  const t0 = now();
  for (let i = 0; i < n; i++) sink += watch(s).ready ? 1 : 0;
  return ((now() - t0) * 1e6) / n;
};

const N = 2e6;
const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1];
say(`engine: ${engine}`);
say(`per kind, ns per watch() call, median of 5 x ${N} calls (one state held, as while a decision or an animation lasts):`);
for (const [name, setup] of Object.entries(STATES)) {
  const runs = Array.from({ length: 5 }, () => time(setup, N));
  say(`  ${name.padEnd(26)} ${median(runs).toFixed(1)}`);
}

// A mixed sequence: every state above, plus all forty busy phases, switched every few frames, so every read site
// sees every shape it meets in play. This is the number to quote per frame.
const busy = BUSY.map((P, i) => at(new P(0), i % 3 ? UiMode.MESSAGE : UiMode.EVOLUTION_SCENE));
const seq = [];
for (let r = 0; r < 4; r++) for (const st of [...Object.values(STATES), ...busy]) seq.push(st);
const mixed = n => {
  let i = 0;
  const t0 = now();
  for (let f = 0; f < n; f++) {
    if ((f & 7) === 0) { seq[i](); i = (i + 1) % seq.length; reset(); }
    sink += watch(s).fresh ? 1 : 0;
  }
  return ((now() - t0) * 1e6) / n;
};
mixed(2e5);
const runs = Array.from({ length: 5 }, () => mixed(N));
say(`mixed: ${median(runs).toFixed(1)} ns per frame (median of 5 x ${N}; includes switching state every 8 frames)`);
// The state switch alone, so it can be taken off the mixed number.
const switchOnly = n => {
  let i = 0;
  const t0 = now();
  for (let f = 0; f < n; f++) if ((f & 7) === 0) { seq[i](); i = (i + 1) % seq.length; reset(); }
  return ((now() - t0) * 1e6) / n;
};
switchOnly(2e5);
say(`  of which the harness's state switch: ${median(Array.from({ length: 5 }, () => switchOnly(N))).toFixed(1)} ns per frame`);
say(`(sink ${sink > 0})`);
