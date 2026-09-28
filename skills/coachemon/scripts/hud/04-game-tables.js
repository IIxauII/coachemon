// The one place in the HUD that reaches into the page's modules (game-code.md §22). Every getter starts the read and
// answers null until it lands.

let tables = null, triedAt = -Infinity;
// @only tests: setGameTables, setRewardFns
export const setGameTables = t => { tables = t; };
const REWARD_FNS = ["regenerateModifierPoolThresholds", "getPlayerModifierTypeOptions"];
let rewardFns = null;
export const setRewardFns = f => { rewardFns = f; };
const scan = (ns, found) => {
  for (const k of Object.keys(ns)) {
    let v;
    try { v = ns[k]; } catch { continue; } // an export still in its temporal dead zone
    if (!v) continue;
    if (v instanceof Map && !found.biomes) {
      const first = v.values().next().value;
      if (first && "biomeLinks" in first && "pokemonPool" in first) found.biomes = v;
    } else if (typeof v === "object" && typeof v.getSpecies === "function" && typeof v.getAllSpecies === "function") {
      found.species ??= v;
    } else if (typeof v === "function" && v.name === "getBiomeName") {
      // In no drift-ref block of `scripts/hud-deps.ts`: an upstream rename drops the biome labels to `#id` silently.
      found.biomeName ??= v;
    } else if (typeof v === "function" && REWARD_FNS.includes(v.name)) {
      found[v.name] ??= v;
    } else if (typeof v === "object" && typeof v.getShinyCatchMultiplier === "function") {
      found.events ??= v;
    } else if (Array.isArray(v)) {
      let first;
      try { first = v[1]; } catch { continue; }
      if (!first || typeof first !== "object" || first.id !== 1 || v.length < 100) continue;
      if ("power" in first && "pp" in first) found.moves ??= v;
      else if (!("power" in first) && typeof first.name === "string" && "attrs" in first) found.abilities ??= v;
    } else if (typeof v === "object" && !Array.isArray(v)) {
      let first;
      try { first = v[Object.keys(v)[0]]; } catch { continue; }
      if (!found.trainers && first && typeof first === "object" && "trainerType" in first && "partyTemplates" in first) found.trainers = v;
      else if (!found.eggMoves && [1, 4, 7].every(id => {
        try { return Array.isArray(v[id]) && v[id].length === 4 && v[id].every(Number.isInteger); } catch { return false; }
      })) found.eggMoves = v;
    }
  }
};
const found = {};
// `tables` is `found` itself, so a chunk that lands later fills it in place: every table stays a maybe to its reader
// after the getter first answers.
const commit = () => {
  if (!tables && found.biomes && found.species) setGameTables(found);
  if (!rewardFns && REWARD_FNS.every(k => found[k])) setRewardFns({ regenerate: found[REWARD_FNS[0]], options: found[REWARD_FNS[1]] });
};
const HANDOFF = "__coachHudChunk";
// A stopped HUD leaves the page as it found it, and this global is the one mark the read leaves behind
// (extension-distribution.md §9.6).
// @only 99-start: dropChunkHandoff
export const dropChunkHandoff = () => { delete window[HANDOFF]; };
// Never `import(url)`: the Firefox add-on linter rejects a computed argument to `import`, and `hud.js` ships inside the
// extension (#381). The URL is a literal in the module's own source instead; appending starts it, and removing it
// cancels nothing.
const inject = url => {
  try {
    const el = document.createElement("script");
    el.type = "module";
    el.textContent = `import * as ns from ${JSON.stringify(url)};window.${HANDOFF}?.(ns);`;
    document.documentElement.appendChild(el);
    el.remove();
  } catch {}
};
const loadGameTables = () => {
  if ((tables && rewardFns) || Date.now() - triedAt < 30000) return;
  triedAt = Date.now();
  // Only the game's own chunks: importing a URL that was never a module would run it anew.
  let urls = [];
  try {
    urls = [...new Set(performance.getEntriesByType("resource")
      .filter(e => ["script", "link", "other"].includes(e.initiatorType) && e.name.startsWith(location.origin)
        && /\/assets\/[\w.-]+-[\w-]{8}\.js$/.test(e.name))
      .map(e => e.name))];
  } catch {}
  if (!urls.length) return;
  window[HANDOFF] = ns => { try { scan(ns, found); } catch {} commit(); };
  for (const u of urls) inject(u);
};

export const gameEvents = () => { loadGameTables(); return tables?.events ?? null; };
// `{ regenerate, options }`
export const gameRewardFns = () => { loadGameTables(); return rewardFns; };
export const gameTables = () => { loadGameTables(); return tables; };
