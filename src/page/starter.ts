import type { Page } from "./locate.ts";

export type StarterReads = {
  nameOf: (id: number) => string | null;
  valueLimit: () => number | null;
};

/**
 * `h` is the starter-select handler, and may be missing. `menu` and `starters` both read through this, as `L.starter`,
 * so the two cannot disagree (#733). Self-contained (extension-distribution.md §10.5).
 */
export function starter(h: Page): StarterReads {
  const __try = (f: () => Page) => { try { return f(); } catch (e) { return null; } };
  // On a bare object `setSpecies` looks the species up, then throws on the missing `props` before it adds a sprite, so
  // naming a species leaves the scene alone (game-code.md §23).
  const setSpecies = __try(() => Object.getPrototypeOf(h.starterContainers[0]).setSpecies);
  return {
    nameOf: id => __try(() => {
      const probe: Page = {};
      try { setSpecies.call(probe, id); } catch (e) {}
      return probe.species.name;
    }),
    valueLimit: () => {
      // (game-code.md §23)
      const limit = __try(() => Number(/\/([\d.]+)$/.exec(h.valueLimitLabel.text)![1]));
      return Number.isFinite(limit) ? limit : null;
    },
  };
}
