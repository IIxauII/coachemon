// `MOVE` stands in for `EvoCondKey.MOVE`, which no HUD module names: only the hook below and the rows it rewrites read it.
export const MOVE = "move";

/** `MovesetRandomizerChallenge.applyModifyEvolutions` past its Tyrogue branch, from the pinned source (game-code.md §32). */
export const movesetRandomizer = value => ({
  id: 11, value,
  applyModifyEvolutions(_mon, evos) {
    if (this.value <= 1) return false;
    for (const evo of evos) {
      if (!evo.condition?.data.some(c => c.key === MOVE)) continue;
      if (evo.level === 1) evo.level = evo.evoLevelThreshold?.[0] ?? 50;
      evo.condition.data = evo.condition.data.filter(c => c.key !== MOVE);
      if (evo.condition.data.length === 0) evo.condition = null;
    }
    return true;
  },
});
