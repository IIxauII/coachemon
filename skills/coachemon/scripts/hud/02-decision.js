// Which decision (CONTEXT.md, `Decision`) the game is waiting on, looked at every frame from fields the game already shows and
// never by hooking it, and handed to the meter's decision records (#518, #537). Allocates nothing per frame.
import { decisionAt, decisionBegin, decisionEnd } from "./01-meter.js";

const CARD_OF = {
  command: "battle", "free-switch": "battle", replacement: "battle", reward: "rewards", fusion: "fusion",
  learn: "learn", biome: "biome", encounter: "encounter", starter: "starters",
};

// `k1`…`k4` hold each kind's key from #537's table, in its order, and are compared by `===`.
const out = { kind: null, k1: null, k2: null, k3: null, k4: null, ready: false, input: false };
const set = (kind, k1, k2, k3, k4, ready, input) => {
  out.kind = kind; out.k1 = k1; out.k2 = k2; out.k3 = k3; out.k4 = k4;
  out.ready = ready; out.input = ready && input;
  return out;
};
const none = () => set(null, null, null, null, null, false, false);
const enemyFree = b => b.turnCommands[BattlerIndex.ENEMY] == null && b.turnCommands[BattlerIndex.ENEMY_2] == null;
const knows = (moveset, id) => {
  for (let i = 0; i < moveset.length; i++) if (moveset[i] && moveset[i].moveId === id) return true;
  return false;
};
// Order-free, so the game re-sorting its modifiers is no change; a transfer moves a stack between holders, which is.
const heldItems = mods => {
  let sig = 0;
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    if (m?.pokemonId == null) continue;
    let h = Math.imul(m.pokemonId | 0, 0x9e3779b1) ^ Math.imul(m.stackCount | 0, 0x85ebca6b);
    const id = m.type?.id ?? "";
    for (let j = 0; j < id.length; j++) h = Math.imul(h ^ id.charCodeAt(j), 0x01000193);
    sig = (sig + (h ^ (h >>> 15))) | 0;
  }
  return sig;
};

const detect = s => {
  const ph = s?.ui ? s.phaseManager?.getCurrentPhase?.() : null;
  if (!ph) return none();
  const ui = s.ui, mode = ui.getMode(), b = s.currentBattle;
  switch (ph.phaseName) {
    case "CommandPhase":
    case "SelectTargetPhase":
      return set("command", b, b.turn, ph.fieldIndex, null, mode !== UiMode.MESSAGE && enemyFree(b), true);
    case "CheckSwitchPhase":
      return set("free-switch", b, ph.fieldIndex, null, null, mode === UiMode.CONFIRM && enemyFree(b), true);
    case "SwitchPhase":
      if (!ph.isModal) return set("free-switch", b, ph.fieldIndex, null, null, mode === UiMode.PARTY && enemyFree(b), true);
      // `doReturn` is a mid-turn switch-in pick: U-turn's, Baton Pass's or Wimp Out's (game-code.md §9).
      if (ph.doReturn) return none();
      return set("replacement", ph, null, null, null, mode === UiMode.PARTY && enemyFree(b), true);
    case "SelectModifierPhase": {
      const h = ui.getHandler();
      if (mode === UiMode.PARTY && h?.partyUiMode === PartyUiMode.SPLICE) return set("fusion", ph, s.getPlayerParty().length, null, null, true, true);
      // A buy, a lock toggle or a transfer keeps the phase and asks anew (#524, #537).
      return set("reward", ph, s.money, s.lockModifierTiers === true, heldItems(s.modifiers ?? []),
        mode === UiMode.MODIFIER_SELECT && (h?.options?.length ?? 0) > 0, h?.awaitingActionInput === true);
    }
    case "LearnMovePhase": {
      const ms = s.getPlayerParty()[ph.partyMemberIndex]?.moveset;
      if (!ms || ms.length < 4 || knows(ms, ph.moveId)) return none();
      return set("learn", ph, null, null, null, true, mode === UiMode.CONFIRM || mode === UiMode.SUMMARY);
    }
    case "SelectBiomePhase": {
      const h = ui.getHandler();
      return set("biome", ph, null, null, null, mode === UiMode.OPTION_SELECT && (h?.config?.options?.length ?? 0) > 0, !h?.blockInput);
    }
    case "MysteryEncounterPhase": {
      const h = ui.getHandler();
      return set("encounter", ph, null, null, null, mode === UiMode.MYSTERY_ENCOUNTER && (h?.encounterOptions?.length ?? 0) > 0, !h?.blockInput);
    }
    case "SelectStarterPhase":
      return set("starter", ph, null, null, null, mode === UiMode.STARTER_SELECT && !!ui.handlers?.[UiMode.STARTER_SELECT]?.starterSelectCallback, true);
    default:
      return none();
  }
};

const NONE = { kind: null, k1: null, k2: null, k3: null, k4: null };
const cur = { ...NONE }, built = { ...NONE };
const same = (x, y) => x.kind === y.kind && x.k1 === y.k1 && x.k2 === y.k2 && x.k3 === y.k3 && x.k4 === y.k4;
const copy = (to, from) => { to.kind = from.kind; to.k1 = from.k1; to.k2 = from.k2; to.k3 = from.k3; to.k4 = from.k4; };

// True on the first ready frame of a decision whose card is not built yet, which the caller then builds.
export const watchFrame = s => {
  const d = detect(s);
  if (!same(d, cur)) {
    copy(cur, d);
    if (d.kind) decisionBegin(d.kind, CARD_OF[d.kind], s.currentBattle?.waveIndex ?? null);
    else decisionEnd();
  }
  if (!d.ready) return false;
  decisionAt("ready");
  if (d.input) decisionAt("input");
  if (same(d, built)) return false;
  copy(built, d);
  return true;
};

export const watchBuilt = () => built.kind !== null && same(cur, built);
export const watchOpen = () => cur.kind !== null;

// The field the held battle card was built for. The field is the front of each party and a send-in swaps party
// entries, so a faint, which swaps none, is no send-in (game-code.md §7).
const field = { battle: null, p0: null, p1: null, e0: null, e1: null };
export const watchField = s => {
  const b = s?.currentBattle ?? null;
  field.battle = b;
  if (!b) return;
  const p = s.getPlayerParty(), e = s.getEnemyParty();
  field.p0 = p[0]; field.e0 = e[0];
  field.p1 = b.double ? p[1] : null; field.e1 = b.double ? e[1] : null;
};
// True on the first frame between decisions that the battle the card was built for has a mon in front it wasn't built
// for. A new wave is a new battle, and sends nothing in.
export const watchSentIn = s => {
  const b = s?.currentBattle;
  if (cur.kind !== null || !b || b !== field.battle) return false;
  const p = s.getPlayerParty(), e = s.getEnemyParty();
  if (p[0] === field.p0 && e[0] === field.e0 && (!b.double || (p[1] === field.p1 && e[1] === field.e1))) return false;
  watchField(s);
  return true;
};
export const watchForget = () => { copy(built, NONE); field.battle = null; };
