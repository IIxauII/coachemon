// The game's own tables, read out of its loaded chunks: the one place in the HUD that reaches into the page's modules.
// Every card that needs game data — species, abilities, moves, egg moves, biomes, trainer configs, the timed event
// manager, the reward roll's two functions — asks here, and gets null while the read hasn't landed.
//
// The live build keeps function and class names and exports these across chunks (loading-scene exports allBiomes,
// FadeOut exports the species data registry and getBiomeName). `loadGameTables` imports the already-loaded /assets/*.js
// modules again — the browser hands back the same module instances, nothing re-runs — and picks the exports by shape:
// a Map whose values carry biomeLinks + pokemonPool, an object with getSpecies/getAllSpecies, a function named
// getBiomeName, the trainer configs (an object whose values carry trainerType + partyTemplates), and the timed event
// manager (getShinyCatchMultiplier; the catch card's shiny odds), and for the starter card the ability and move lists
// (arrays indexed by id: an ability has a name and no power, a move has power and pp) and the egg moves (species id →
// four move ids). It's async, so the first refresh or two draw a card without game data. Without the trainer configs
// the biome card leaves the trainer waves out, as it does fixed waves. Nothing is copied from the game.
//
// The scan matches mostly by shape — the structure of what a chunk exports — and by name only where the shape says
// nothing: `getBiomeName`, and the two reward functions. So it has no drift-ref block of its own in
// `scripts/hud-deps.ts`: what each table *means* is the reading card's dependency and sits in that card's block, the
// reward pair under 50-reroll's. (`getBiomeName` is in no block, which it wasn't before this file either: a rename
// upstream drops the biome card's labels to `#id` with no drift signal.)

let tables = null, triedAt = -Infinity;
// @only tests: setGameTables, setRewardFns
export const setGameTables = t => { tables = t; };
// The reward roll's two module functions, for 50-reroll's preview. Kept apart from `tables`: a build that renamed
// them still has biome data, and a build without biome data can still roll rewards.
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
// Retried every 30 s while not found: the HUD may be injected before the game has loaded its chunks.
const loadGameTables = () => {
  if ((tables && rewardFns) || Date.now() - triedAt < 30000) return;
  triedAt = Date.now();
  // Only the game's own Vite chunks (`/assets/<name>-<hash>.js`, loaded as script or modulepreload): importing a URL
  // that was never a module would run it anew.
  let urls = [];
  try {
    urls = [...new Set(performance.getEntriesByType("resource")
      .filter(e => ["script", "link", "other"].includes(e.initiatorType) && e.name.startsWith(location.origin)
        && /\/assets\/[\w.-]+-[\w-]{8}\.js$/.test(e.name))
      .map(e => e.name))];
  } catch {}
  if (!urls.length) return;
  const found = {};
  Promise.all(urls.map(u => import(u).then(ns => scan(ns, found), () => {})))
    .then(() => {
      if (!tables && found.biomes && found.species) setGameTables(found);
      if (!rewardFns && REWARD_FNS.every(k => found[k])) setRewardFns({ regenerate: found[REWARD_FNS[0]], options: found[REWARD_FNS[1]] });
    });
};

// The game's timed event manager, or null while the tables aren't read (starts the read).
export const gameEvents = () => { loadGameTables(); return tables?.events ?? null; };
// `{ regenerate, options }`: the reward roll's module functions, or null while they aren't found (starts the read).
export const gameRewardFns = () => { loadGameTables(); return rewardFns; };
// The tables themselves (`species`, `abilities`, `moves`, `eggMoves` among them), or null while they aren't read
// (starts the read).
export const gameTables = () => { loadGameTables(); return tables; };
