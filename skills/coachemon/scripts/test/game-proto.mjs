// What a mocked mon inherits from the game.
//
// The HUD calls the game's own `EnemyPokemon.getNextMove()` for the enemy's exact move (#183), off the **prototype**
// rather than the instance, so a mocked scene has to carry it where the game keeps it. Without it the HUD is looking
// at a build it doesn't recognise and says so — which is the right answer for a real page past the pin, and the
// wrong one for a test double standing in for the pinned game.
//
// A scenario names the pick with `next` (a move name); without one it is the first usable moveset entry, aimed at
// the mon's first opponent — the same shape the game returns (`TurnMove`: move id, targets, use mode).
const usable = (pm, e) => {
  if (typeof pm?.isUsable !== "function") return true;
  const r = pm.isUsable(e, false, true);
  return Array.isArray(r) ? r[0] : !!r;
};
export const GAME_PROTO = {
  getNextMove() {
    const pool = (this.getMoveset?.() ?? this.moveset ?? []).filter(Boolean);
    const queued = (this.getMoveQueue?.() ?? [])[0];
    if (queued) return { ...queued, useMode: queued.useMode ?? 0 };
    const pm = (this.next && pool.find(m => m.getName?.() === this.next)) || pool.find(m => usable(m, this)) || pool[0];
    // A mock that doesn't do battler indices simply names no target; the card then falls back to naming the mon the
    // planner put in front of the foe, as it did before the exact move existed.
    const bi = (this.getOpponents?.() ?? []).filter(Boolean)[0]?.getBattlerIndex?.();
    return { move: pm?.moveId ?? 0, targets: bi === undefined ? [] : [bi], useMode: 0 };
  },
};
// A mocked mon that inherits it. Methods a mock closes over its own object still see that object: the prototype is
// put on before the fields, not wrapped around them afterwards.
export const onGame = fields => Object.assign(Object.create(GAME_PROTO), fields);
