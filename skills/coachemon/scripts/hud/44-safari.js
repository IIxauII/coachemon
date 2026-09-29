// Safari Zone's three mons, replayed before the fee is paid (game-code.md §13). It calls game code and never decides
// when that is allowed: `executeWithSeedOffset` has no `try`/`finally` (§11), so a throw inside a fork leaves the live
// stream sown at the fork's offset, and only the run read's sandbox (`26-run.js`) puts it back.
import { gameEvents, gameTables } from "./04-game-tables.js";

// `NUM_SAFARI_ENCOUNTERS`
export const SAFARI_MONS = 3;
const BASE_SHINY_CHANCE = 64, BASE_HIDDEN_ABILITY_RATE = 256;
// `NON_LEGEND_PARADOX_POKEMON`. Keep it even where it excludes nothing: an upstream rebalance can make it bite, and the
// drift check watches it (`scripts/hud-deps.ts`).
const NON_LEGEND_PARADOX = [
  SpeciesId.GREAT_TUSK, SpeciesId.SCREAM_TAIL, SpeciesId.BRUTE_BONNET, SpeciesId.FLUTTER_MANE, SpeciesId.SLITHER_WING,
  SpeciesId.SANDY_SHOCKS, SpeciesId.ROARING_MOON, SpeciesId.WALKING_WAKE, SpeciesId.GOUGING_FIRE,
  SpeciesId.RAGING_BOLT, SpeciesId.IRON_TREADS, SpeciesId.IRON_BUNDLE, SpeciesId.IRON_HANDS, SpeciesId.IRON_JUGULIS,
  SpeciesId.IRON_MOTH, SpeciesId.IRON_THORNS, SpeciesId.IRON_VALIANT, SpeciesId.IRON_LEAVES, SpeciesId.IRON_BOULDER,
  SpeciesId.IRON_CROWN,
];

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
// `randSeedInt` and `randSeedItem`, draw for draw (game-code.md §11).
const rnd = range => (range <= 1 ? 0 : Phaser.Math.RND.integerInRange(0, range - 1));
const pick = items => (items.length === 1 ? items[0] : Phaser.Math.RND.pick(items));
const drop = o => { try { o?.destroy?.(); } catch {} };
// The game logs its event chance and every species it builds.
const quiet = fn => {
  const { log, warn, info } = console;
  console.log = console.warn = console.info = () => {};
  try { return fn(); } finally { Object.assign(console, { log, warn, info }); }
};

const partsOf = s => {
  if (typeof s?.executeWithSeedOffset !== "function" || typeof s.addEnemyPokemon !== "function") {
    return { why: "this build doesn't expose the seed fork the three mons are drawn in" };
  }
  const species = gameTables()?.species;
  if (!species || typeof species.getAllStarters !== "function" || typeof species.getStarterCost !== "function") {
    return { why: "the game's starter table hasn't been read yet" };
  }
  const events = gameEvents();
  if (!events || typeof events.getAllValidEventEncounters !== "function") {
    return { why: "the game's event table hasn't been read yet" };
  }
  return { species, events };
};

// Flips from false to true partway through an encounter, when the chunk scan lands, so it belongs in the caller's
// cache key: a card built before the scan would hold its degraded line for the rest of the wave.
export const safariReady = s => !partsOf(s).why;

// `getRandomSpeciesByStarterCost([0, 5], NON_LEGEND_PARADOX_POKEMON, undefined, false, false, false)`. The band
// widening never runs for `[0, 5]`; it is kept so the replay stays the game's own function.
const safariSpecies = reg => {
  let min = 0, max = 5;
  const filtered = [];
  for (const sp of reg.getAllStarters(true)) {
    if (!sp || NON_LEGEND_PARADOX.includes(sp.speciesId) || sp.subLegendary || sp.legendary || sp.mythical) continue;
    filtered.push([sp, reg.getStarterCost(sp.speciesId)]);
  }
  let band = filtered.filter(e => e[1] >= min && e[1] <= max);
  while (band.length === 0 && !(min === 0 && max === 10)) {
    if (min > 0) min--; else max++;
    band = filtered.filter(e => e[1] >= min && e[1] <= max);
  }
  if (band.length === 0) return reg.getSpecies(SpeciesId.BULBASAUR);
  // The index is drawn before the shuffle and read out of it (game-code.md §13): swapping the two picks another species.
  const i = rnd(band.length);
  return reg.getSpecies(Phaser.Math.RND.shuffle(band)[i][0].speciesId);
};

const drawMon = (s, parts, chance) => {
  const { species: reg, events } = parts;
  const level = s.currentBattle.getLevelForWave();
  // Never behind `tryDo`: a swallowed throw reads as an empty list, which is a different draw rather than a missing one.
  const eventEncounters = events.getAllValidEventEncounters(false, false, false, () => true) ?? [];
  let sp = null, fromEvent = false, formIndex = null;
  if (chance && eventEncounters.length > 0 && (chance === 100 || rnd(100) < chance)) {
    const enc = pick(eventEncounters);
    fromEvent = true;
    sp = reg.getSpecies(reg.getSpecies(enc.species)
      .getWildSpeciesForLevel(level, !enc.blockEvolution, false, s.gameMode));
    formIndex = enc.formIndex;
  } else {
    sp = safariSpecies(reg);
  }
  const p = s.addEnemyPokemon(sp, level, TrainerSlot.NONE, false);
  if (formIndex) p.formIndex = formIndex;
  // An event spawn rolls each once more (`isEventEncounter`, game-code.md §13).
  const shinyRerolls = 1 + (fromEvent ? 1 : 0), hiddenRerolls = 1 + (fromEvent ? 1 : 0);
  for (let i = 0; i < shinyRerolls; i++) p.trySetShinySeed(BASE_SHINY_CHANCE, true, 0);
  for (let i = 0; i < hiddenRerolls && p.abilityIndex !== 2; i++) p.tryRerollHiddenAbilitySeed(BASE_HIDDEN_ABILITY_RATE);
  return { p, fromEvent };
};

// @only 46-encounter, tests: safariMonData
export const safariMonData = p => ({
  name: tryDo(() => p.getNameToRender(), p.name) ?? p.name ?? "?",
  level: p.level ?? null,
  hiddenAbility: p.abilityIndex === 2,
  shiny: !!tryDo(() => p.isShiny(), p.shiny),
});

// Never throws. `read` sees each mon while it lives: they are Phaser containers, destroyed before this returns.
// @only 46-encounter, tests: safariPreview
export const safariPreview = (s, read) => {
  const parts = partsOf(s);
  if (parts.why) return { why: parts.why };
  const w = tryDo(() => s.currentBattle.waveIndex);
  if (!(w > 0)) return { why: "no wave to read" };
  const built = [];
  try {
    return quiet(() => {
      const mons = [];
      // `eventChance`, carried from mon to mon as the game does (game-code.md §13).
      let chance = 50, seenEvent = false;
      for (let remaining = SAFARI_MONS; remaining >= 1; remaining--) {
        let drawn = null;
        s.executeWithSeedOffset(() => { drawn = drawMon(s, parts, chance); }, w * 1000 * remaining);
        if (!drawn) return { why: "the seed fork didn't run" };
        built.push(drawn.p);
        mons.push(read(drawn.p));
        if (drawn.fromEvent) { seenEvent = true; chance = 50; } else if (!seenEvent) chance += 25;
      }
      return { mons };
    });
  } catch (e) {
    return { why: `couldn't read the three mons: ${e.message}` };
  } finally {
    for (const p of built) drop(p);
  }
};
