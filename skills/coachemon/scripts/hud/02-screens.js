// `probe.js` reads the screen through these too. Reads only: a UI mode, a handler field, the current phase's name.

// Before the summary screen opens, `LearnMovePhase` keeps only the move's id, so the move is built through a moveset
// entry's own `PokemonMove` class (game-code.md §17).
export const learnState = s => {
  const h = s.ui.getHandler();
  const double = !!s.currentBattle?.double;
  const party = s.getPlayerParty?.() ?? [];
  if (s.ui.mode === UiMode.SUMMARY && h?.summaryUiMode === SummaryUiMode.LEARN_MOVE && h.newMove) return { pk: h.pokemon, mv: h.newMove, double, party };
  const phase = s.phaseManager?.getCurrentPhase?.();
  if (phase?.phaseName !== "LearnMovePhase") return null;
  const pk = party[phase.partyMemberIndex];
  const pm = pk?.moveset.find(Boolean);
  return pk && pm ? { pk, mv: new pm.constructor(phase.moveId).getMove(), double, party } : null;
};

// A shop after a wild foe flees has no `options` but is a choice; only the shop closing empties its rows too.
export const rewardsScreen = s => {
  const h = s.ui.getHandler();
  return s.ui.mode === UiMode.MODIFIER_SELECT && (h?.options?.length || h?.shopOptionsRows?.length) ? h : null;
};

export const biomeScreen = (s, h) => s.ui.mode === UiMode.OPTION_SELECT && s.phaseManager?.getCurrentPhase?.()?.phaseName === "SelectBiomePhase"
  && !!h?.config?.options?.length;

export const encounterScreen = (s, h) => s.ui.mode === UiMode.MYSTERY_ENCOUNTER && !!s.currentBattle?.mysteryEncounter
  && Array.isArray(h?.encounterOptions) && h.encounterOptions.length > 0;
