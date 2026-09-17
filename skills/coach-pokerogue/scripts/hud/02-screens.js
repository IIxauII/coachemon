// Which screen the game is on, for the four cards whose detection the probe needs too: learn-move, rewards, biome
// and Mystery Encounter. One source, so the HUD and `probe.js` can never disagree about what is on screen — the
// watcher's `--no-hud` mode reads learn and rewards off the probe alone.
// Reads only: a UI mode, a handler field, the current phase's name. No game functions run here.

// Learn-move: the SUMMARY screen (summaryUiMode LEARN_MOVE) holds the new move; before it opens, the
// "forget a move?" prompt only has LearnMovePhase's moveId, so the move is built from a PokemonMove.
export const learnState = s => {
  const h = s.ui.getHandler();
  const double = !!s.currentBattle?.double;
  const party = s.getPlayerParty?.() ?? [];
  if (s.ui.getMode() === UiMode.SUMMARY && h?.summaryUiMode === SummaryUiMode.LEARN_MOVE && h.newMove) return { pk: h.pokemon, mv: h.newMove, double, party };
  const phase = s.phaseManager?.getCurrentPhase?.();
  if (phase?.phaseName !== "LearnMovePhase") return null;
  const pk = party[phase.partyMemberIndex];
  const pm = pk?.moveset.find(Boolean);
  return pk && pm ? { pk, mv: new pm.constructor(phase.moveId).getMove(), double, party } : null;
};

// The reward screen's handler: free rewards in `options`, shop rows in `shopOptionsRows`. A screen with no options
// is the shop closing, not a choice.
export const rewardsScreen = s => {
  const h = s.ui.getHandler();
  return s.ui.getMode() === UiMode.MODIFIER_SELECT && h?.options?.length ? h : null;
};

export const biomeScreen = (s, h) => s.ui.getMode() === UiMode.OPTION_SELECT && s.phaseManager?.getCurrentPhase?.()?.phaseName === "SelectBiomePhase"
  && !!h?.config?.options?.length;

export const encounterScreen = (s, h) => s.ui.getMode() === UiMode.MYSTERY_ENCOUNTER && !!s.currentBattle?.mysteryEncounter
  && Array.isArray(h?.encounterOptions) && h.encounterOptions.length > 0;
