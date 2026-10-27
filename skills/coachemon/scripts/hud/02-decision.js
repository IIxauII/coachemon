// Which decision (CONTEXT.md, `Decision`) the game is waiting on, looked at every frame from fields the game already shows and
// never by hooking it (#518, #537). Allocates nothing per frame, and keeps nothing between frames.
import { learnAsked } from "./01-core.js";
const CARD_OF = {
  command: "battle", "free-switch": "battle", replacement: "battle", reward: "rewards", fusion: "fusion",
  learn: "learn", biome: "biome", encounter: "encounter", starter: "starters", pivot: "pivot",
};

// `k1`…`k4` hold each kind's key from #537's table as #544 and #714 widened it, in its order, and are compared by `===`. One
// object, written over on every look: a caller that keeps a look copies it.
const out = { kind: null, card: null, k1: null, k2: null, k3: null, k4: null, ready: false, input: false };
const set = (kind, k1, k2, k3, k4, ready, input) => {
  out.kind = kind; out.card = CARD_OF[kind] ?? null; out.k1 = k1; out.k2 = k2; out.k3 = k3; out.k4 = k4;
  out.ready = ready; out.input = ready && input;
  return out;
};
const none = () => set(null, null, null, null, null, false, false);
const enemyFree = b => b.turnCommands[BattlerIndex.ENEMY] == null && b.turnCommands[BattlerIndex.ENEMY_2] == null;
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
// Each member's id and moves, slot by slot, folded onto `sig`: a move forgotten on the summary screen (game-code.md §17)
// changes it, and so does a reordered party (#713, #714).
const partyMoves = (party, sig) => {
  for (let i = 0; i < party.length; i++) {
    const p = party[i], ms = p?.moveset;
    sig = Math.imul(sig ^ (p?.id | 0), 0x01000193);
    if (ms) for (let j = 0; j < ms.length; j++) sig = Math.imul(sig ^ (ms[j]?.moveId | 0), 0x01000193);
  }
  return sig;
};

// The game opens one party screen for both: `doReturn` alone tells a pivot (CONTEXT.md, `Pivot`) from a faint's
// replacement (game-code.md §9).
export const isReplacement = ph => ph?.phaseName === "SwitchPhase" && !!ph.isModal && !ph.doReturn;
export const isPivot = ph => ph?.phaseName === "SwitchPhase" && !!ph.isModal && !!ph.doReturn;

export const detect = s => {
  const ph = s?.ui ? s.phaseManager?.getCurrentPhase?.() : null;
  if (!ph) return none();
  const ui = s.ui, mode = ui.mode, b = s.currentBattle;
  switch (ph.phaseName) {
    case "CommandPhase":
    case "SelectTargetPhase":
      // Slot 0's command is a new object on every commit (game-code.md §25).
      return set("command", b, b.turn, ph.fieldIndex, ph.fieldIndex === 1 ? b.turnCommands[0] ?? null : null,
        mode !== UiMode.MESSAGE && enemyFree(b), true);
    case "CheckSwitchPhase":
      return set("free-switch", b, ph.fieldIndex, null, null, mode === UiMode.CONFIRM && enemyFree(b), true);
    case "SwitchPhase":
      if (!ph.isModal) return set("free-switch", b, ph.fieldIndex, null, null, mode === UiMode.PARTY && enemyFree(b), true);
      // Mid-turn, so the enemy has already chosen: a pivot never waits on `enemyFree`.
      if (isPivot(ph)) return set("pivot", ph, null, null, null, mode === UiMode.PARTY, true);
      if (!isReplacement(ph)) return none();
      return set("replacement", ph, null, null, null, mode === UiMode.PARTY && enemyFree(b), true);
    case "SelectModifierPhase": {
      const h = ui.getHandler(), party = s.getPlayerParty();
      // Between two visits, money stands in for a purchase (a TM, an item), the held items for a transfer (#544).
      const members = partyMoves(party, heldItems(s.modifiers ?? []));
      if (mode === UiMode.PARTY && h?.partyUiMode === PartyUiMode.SPLICE) {
        return set("fusion", ph, party.length, s.money, members, true, true);
      }
      // A buy, a lock toggle, a transfer or a party change keeps the phase and asks anew (#524, #537).
      return set("reward", ph, s.money, s.lockModifierTiers === true, members,
        mode === UiMode.MODIFIER_SELECT && (h?.options?.length || h?.shopOptionsRows?.length) > 0, h?.awaitingActionInput === true);
    }
    case "LearnMovePhase":
      if (!learnAsked(s.getPlayerParty(), ph)) return none();
      return set("learn", ph, null, null, null, true, mode === UiMode.CONFIRM || mode === UiMode.SUMMARY);
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
