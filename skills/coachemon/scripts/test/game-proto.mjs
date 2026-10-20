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

const SPD = 5;
const hpRatio = (hp, max) => Math.round(hp / max * 100) / 100;
// `Pokemon.getMatchupScore` for a mon off the field (game-code.md §7), its type scores fixed at `this.typeScore`.
export function benchMatchupScore(o) {
  const own = hpRatio(this.hp, this.getMaxHp());
  let hpDiffRatio = own + (1 - hpRatio(o.hp, o.getMaxHp()));
  if (this.getStat(SPD) >= o.getStat(SPD)) hpDiffRatio *= 1.25;
  else if (own > 0.2 && own <= 0.4) hpDiffRatio *= 0.5;
  return this.typeScore * Math.min(hpDiffRatio, 1);
}
