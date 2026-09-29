// The HUD reads `getNextMove` off a mon's direct prototype (#183), so a mock that carries it anywhere else reads as a
// build past the pin. A scenario names the pick with `next` (a move name); without one it is the first usable moveset
// entry, aimed at the mon's first opponent.
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
    const bi = (this.getOpponents?.() ?? []).filter(Boolean)[0]?.getBattlerIndex?.();
    return { move: pm?.moveId ?? 0, targets: bi === undefined ? [] : [bi], useMode: 0 };
  },
};
export const onGame = fields => Object.assign(Object.create(GAME_PROTO), fields);
