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
  // The grid keeps only its 81 on-screen containers, so a species is named through `setSpecies` on a bare object. It
  // looks the species up before it reads `props`, and with none throws before it adds a sprite.
  const setSpecies = __try(() => Object.getPrototypeOf(h.starterContainers[0]).setSpecies);
  return {
    nameOf: id => __try(() => {
      const probe: Page = {};
      try { setSpecies.call(probe, id); } catch (e) {}
      return probe.species.name;
    }),
    valueLimit: () => {
      // The label reads `<party value>/<limit>`.
      const limit = __try(() => Number(/\/([\d.]+)$/.exec(h.valueLimitLabel.text)![1]));
      return Number.isFinite(limit) ? limit : null;
    },
  };
}
