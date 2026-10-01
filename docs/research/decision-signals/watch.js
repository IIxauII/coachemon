// Research prototype for #518, never shipped: the per-frame read the note `decision-signals.md` proposes.
// `E` is the game's enums by name ({ UiMode, PartyUiMode, BattlerIndex }), so the same file runs on the real game,
// on the synthetic scene of `bench-jsc.js`, and in the live probe.
export const makeWatch = E => {
  // Gotcha: never spelled `E.BattlerIndex.ENEMY`, which upstream's inline-enum plugin rewrites to `E.2` under vitest.
  const U = E.UiMode, P = E.PartyUiMode, BI = E.BattlerIndex, ENEMY = BI["ENEMY"];
  // Contract: one object reused every frame, so a frame allocates nothing.
  const out = { kind: null, a: null, b: null, ready: false, fresh: false };
  const last = { kind: null, a: null, b: null };
  const none = () => { out.kind = null; out.a = null; out.b = null; out.ready = false; return out; };
  const set = (kind, a, b, ready) => { out.kind = kind; out.a = a; out.b = b; out.ready = ready; return out; };
  const enemyFree = b => b.turnCommands[ENEMY] == null && b.turnCommands[ENEMY + 1] == null;
  const knows = (moveset, id) => {
    for (let i = 0; i < moveset.length; i++) if (moveset[i] && moveset[i].moveId === id) return true;
    return false;
  };

  const detect = s => {
    const ph = s.phaseManager?.getCurrentPhase();
    if (!ph || !s.ui) return none();
    const ui = s.ui, mode = ui.getMode();
    switch (ph.phaseName) {
      case "CommandPhase":
      case "SelectTargetPhase": {
        const b = s.currentBattle;
        return set("command", b, b.turn, mode !== U.MESSAGE && enemyFree(b));
      }
      case "CheckSwitchPhase": {
        const b = s.currentBattle;
        return set("free-switch", b, ph.fieldIndex, mode === U.CONFIRM && enemyFree(b));
      }
      case "SwitchPhase": {
        const b = s.currentBattle;
        if (!ph.isModal) return set("free-switch", b, ph.fieldIndex, mode === U.PARTY && enemyFree(b));
        if (!ph.doReturn) return set("replacement", ph, null, mode === U.PARTY && enemyFree(b));
        return none();
      }
      case "SelectModifierPhase": {
        const h = ui.getHandler();
        if (mode === U.PARTY && h.partyUiMode === P.SPLICE) return set("fusion", ph, s.getPlayerParty().length, true);
        return set("reward", ph, null, mode === U.MODIFIER_SELECT && h.options.length > 0);
      }
      case "LearnMovePhase": {
        const pk = s.getPlayerParty()[ph.partyMemberIndex];
        const ms = pk?.moveset;
        return ms && ms.length >= 4 && !knows(ms, ph.moveId) ? set("learn", ph, null, true) : none();
      }
      case "SelectBiomePhase": {
        const h = ui.getHandler();
        return set("biome", ph, null, mode === U.OPTION_SELECT && (h.config?.options?.length ?? 0) > 0);
      }
      case "MysteryEncounterPhase": {
        const h = ui.getHandler();
        return set("encounter", ph, null, mode === U.MYSTERY_ENCOUNTER && (h.encounterOptions?.length ?? 0) > 0);
      }
      case "SelectStarterPhase":
        return set("starter", ph, null, mode === U.STARTER_SELECT && !!ui.handlers[U.STARTER_SELECT]?.starterSelectCallback);
      default:
        return none();
    }
  };

  const watch = s => {
    const d = detect(s);
    d.fresh = d.kind !== null && d.ready && (d.kind !== last.kind || d.a !== last.a || d.b !== last.b);
    if (d.fresh) { last.kind = d.kind; last.a = d.a; last.b = d.b; }
    return d;
  };
  const reset = () => { last.kind = null; last.a = null; last.b = null; };
  return { watch, detect, reset };
};
