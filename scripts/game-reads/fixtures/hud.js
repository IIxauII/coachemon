// @mirrors rare-biomes
const RARE = new Set([BiomeId.SPACE]);
export const lang = () => localStorage.getItem("prLang");
export const rare = s => RARE.has(s.arena.biomeId);
