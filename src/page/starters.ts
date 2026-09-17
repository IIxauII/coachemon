import type { Located } from "./locate.ts";

/** One unlocked species, as the coach reads it before a run: dex progress plus what it costs on today's grid. */
export type OwnedStarter = {
  id: number;
  /** `null` off the starter grid, where no container carries a cost. */
  cost: number | null;
  ivTotal: number | null;
  passiveUnlocked: boolean;
  hiddenAbility: boolean;
  eggMoves: number | null;
  costReduction: number | null;
  candy: number | null;
};

export type StartersResult = {
  ok: true;
  cursor: number | null;
  scrollCursor: number | null;
  grid: { i: number; name: string | null; id: number | null; cost: number | null }[];
  party: string[];
  valueLimit: number | null;
  partyValid: boolean | null;
  owned: OwnedStarter[];
};

/**
 * Starter-select facts `start_run` needs before it presses anything, and every unlocked species for `read_starters`
 * (§11.4): `owned` is what `probe.js` read off `gameData`, so it answers off the grid too. The filter bar is its own
 * Screen, refused before this read. Self-contained (§10.5).
 */
export function starters(L: Located, _args: Record<string, never>): StartersResult {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const h = __try(() => L.ui.handlers[L.m.STARTER_SELECT]);
  const gd = __try(() => L.scene.gameData);
  const grid: StartersResult["grid"] = __try(() => (h.filteredStarterContainers || []).map((c: any, i: number) => ({
    i, name: __try(() => c.species.name), id: __try(() => c.species.speciesId), cost: __try(() => gd.getSpeciesStarterValue(c.species.speciesId)),
  }))) ?? [];
  // The grid's own costs, so `owned` never prices a species differently from the row the player is looking at.
  const cost = (id: number): number | null => {
    for (let i = 0; i < grid.length; i++) if (grid[i].id === id) return grid[i].cost;
    return null;
  };
  const owned: OwnedStarter[] = __try(() => Object.entries(gd.starterData)
    .filter(([id]) => __try(() => BigInt(gd.dexData[id].caughtAttr) > 0n) === true)
    .map(([id, st]: [string, any]) => ({
      id: +id,
      cost: cost(+id),
      ivTotal: __try(() => gd.dexData[id].ivs.reduce((a: number, b: number) => a + b, 0)),
      passiveUnlocked: __try(() => (st.passiveAttr & L.pa.UNLOCKED) === L.pa.UNLOCKED) === true,
      hiddenAbility: __try(() => (st.abilityAttr & L.ab.ABILITY_HIDDEN) === L.ab.ABILITY_HIDDEN) === true,
      eggMoves: __try(() => st.eggMoves),
      costReduction: __try(() => st.valueReduction),
      candy: __try(() => st.candyCount),
    }))) ?? [];
  return {
    ok: true,
    cursor: __try(() => h.cursor),
    scrollCursor: __try(() => h.scrollCursor),
    grid,
    party: __try(() => (h.starterSpecies || []).map((s: any) => s.name)) ?? [],
    valueLimit: __try(() => h.getValueLimit()),
    partyValid: __try(() => h.isPartyValid()),
    owned,
  };
}
