// The watch: which decision the game is waiting on, read every frame from plain fields, never a hook (#487, #518).
// Reads only, and allocates nothing per frame.
import { decisionAt, decisionBegin, decisionEnd } from "./01-meter.js";

export const CARD_OF = {
  command: "battle", "free-switch": "battle", replacement: "battle", reward: "rewards", fusion: "fusion",
  learn: "learn", biome: "biome", encounter: "encounter", starter: "starters",
};

// `a` and `b` are the decision's key, compared by `===`.
const out = { kind: null, a: null, b: null, ready: false, input: false };
const set = (kind, a, b, ready, input) => { out.kind = kind; out.a = a; out.b = b; out.ready = ready; out.input = ready && input; return out; };
const none = () => set(null, null, null, false, false);
const enemyFree = b => b.turnCommands[BattlerIndex.ENEMY] == null && b.turnCommands[BattlerIndex.ENEMY_2] == null;
const knows = (moveset, id) => {
  for (let i = 0; i < moveset.length; i++) if (moveset[i] && moveset[i].moveId === id) return true;
  return false;
};

export const detectDecision = s => {
  const ph = s.phaseManager?.getCurrentPhase?.();
  if (!ph || !s.ui) return none();
  const ui = s.ui, mode = ui.getMode();
  switch (ph.phaseName) {
    case "CommandPhase":
    case "SelectTargetPhase": {
      const b = s.currentBattle;
      return set("command", b, b.turn, mode !== UiMode.MESSAGE && enemyFree(b), true);
    }
    case "CheckSwitchPhase": {
      const b = s.currentBattle;
      return set("free-switch", b, ph.fieldIndex, mode === UiMode.CONFIRM && enemyFree(b), true);
    }
    case "SwitchPhase": {
      const b = s.currentBattle;
      if (!ph.isModal) return set("free-switch", b, ph.fieldIndex, mode === UiMode.PARTY && enemyFree(b), true);
      // `isModal && doReturn` is U-turn's party screen: mid-turn, and not a decision.
      if (!ph.doReturn) return set("replacement", ph, null, mode === UiMode.PARTY && enemyFree(b), true);
      return none();
    }
    case "SelectModifierPhase": {
      const h = ui.getHandler();
      if (mode === UiMode.PARTY && h.partyUiMode === PartyUiMode.SPLICE) return set("fusion", ph, s.getPlayerParty().length, true, true);
      // Keyed on the money too: a shop-row purchase keeps the phase, and the card must follow each buy (#524).
      return set("reward", ph, s.money, mode === UiMode.MODIFIER_SELECT && h.options.length > 0, h.awaitingActionInput === true);
    }
    case "LearnMovePhase": {
      // Under four moves the phase teaches the move in `start()`: no choice is asked.
      const ms = s.getPlayerParty()[ph.partyMemberIndex]?.moveset;
      if (!ms || ms.length < 4 || knows(ms, ph.moveId)) return none();
      return set("learn", ph, null, true, mode === UiMode.CONFIRM || mode === UiMode.SUMMARY);
    }
    case "SelectBiomePhase": {
      const h = ui.getHandler();
      return set("biome", ph, null, mode === UiMode.OPTION_SELECT && (h.config?.options?.length ?? 0) > 0, !h.blockInput);
    }
    case "MysteryEncounterPhase": {
      const h = ui.getHandler();
      return set("encounter", ph, null, mode === UiMode.MYSTERY_ENCOUNTER && (h.encounterOptions?.length ?? 0) > 0, !h.blockInput);
    }
    case "SelectStarterPhase":
      return set("starter", ph, null, mode === UiMode.STARTER_SELECT && !!ui.handlers[UiMode.STARTER_SELECT]?.starterSelectCallback, true);
    default:
      return none();
  }
};

const cur = { kind: null, a: null, b: null }, built = { kind: null, a: null, b: null };
const same = (x, y) => x.kind === y.kind && x.a === y.a && x.b === y.b;
const copy = (to, from) => { to.kind = from.kind; to.a = from.a; to.b = from.b; };

// Contract: true on the first ready frame of a decision whose card has not been built, which the caller then builds.
// Shop → fusion → shop is fresh again on the way back (#518).
export const watchFrame = s => {
  const d = detectDecision(s);
  if (!same(d, cur)) {
    copy(cur, d);
    if (d.kind) decisionBegin(d.kind, CARD_OF[d.kind], s.currentBattle?.waveIndex ?? null);
    else decisionEnd();
  }
  if (!d.kind || !d.ready) return false;
  decisionAt("ready");
  if (d.input) decisionAt("input");
  if (same(d, built)) return false;
  copy(built, d);
  return true;
};

export const watchBuilt = () => built.kind !== null && same(cur, built);
export const watchOpen = () => cur.kind !== null;
