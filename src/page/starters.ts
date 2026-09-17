import type { Located } from "./locate.ts";

export type StartersResult = {
  ok: true;
  cursor: number;
  scrollCursor: number;
  grid: { i: number; name: string | null; id: number | null; cost: number | null }[];
  party: string[];
  valueLimit: number | null;
  partyValid: boolean | null;
};

/**
 * Starter-select facts `start_run` needs before it presses anything. The filter bar is its own Screen, refused before
 * this read. Self-contained (§10.5).
 */
export function starters(L: Located, _args: Record<string, never>): StartersResult {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const h = L.ui.handlers[10];
  const gd = L.scene.gameData;
  const grid = (h.filteredStarterContainers || []).map((c: any, i: number) => ({ i, name: __try(() => c.species.name), id: __try(() => c.species.speciesId), cost: __try(() => gd.getSpeciesStarterValue(c.species.speciesId)) }));
  return {
    ok: true, cursor: h.cursor, scrollCursor: h.scrollCursor,
    grid, party: (h.starterSpecies || []).map((s: any) => s.name),
    valueLimit: __try(() => h.getValueLimit()), partyValid: __try(() => h.isPartyValid()),
  };
}
