// Safari Zone's three mons, read before the fee is paid: what $1,010 actually buys.
//
// ---- Why this is reachable at all (read from the pinned source, v1.12.0.11)
// The fee decision is the one Safari Zone decision the card used to judge on money alone, and it is the one that
// hangs entirely on something money can't say: three Rattata and a shiny Larvitar cost the same. `summonSafariPokemon`
// (`safari-zone-encounter.ts:281`) sows **its own fork** at `waveIndex × 1000 × safariPokemonRemaining` — 3, 2 and 1 —
// which is *not* the `getSeedOffset()` the option screen moves by 512 on every re-entry. So all three are settled
// before the fee is paid, stay put while the minigame runs, and can be replayed in any order at any time.
//
// ---- The draw, in the game's own order
// Inside each fork, `getRandomEncounterPokemon` (`encounter-phase-utils.ts:989`) runs:
//   1. `getAllValidEventEncounters(false, false, false, …)` — a table read, no draw. **Empty unless a timed event is
//      live**, and the `&&` then short-circuits *before* `randSeedInt(100)`, so with no event the branch costs the
//      stream nothing at all.
//   2. with an event live: `randSeedInt(100) < eventChance`, then `randSeedItem(encounters)` (`Phaser.Math.RND.pick`,
//      and no draw at all when there is exactly one), then that species' `getWildSpeciesForLevel`.
//   3. otherwise `getSafariSpeciesSpawn()` → `getRandomSpeciesByStarterCost([0, 5], NON_LEGEND_PARADOX_POKEMON,
//      undefined, false, false, false)`: `randSeedInt(band.length)` **then** `Phaser.Math.RND.shuffle(band)`, in that
//      order — the index is drawn against the unshuffled array and read out of the shuffled one.
//   4. `new EnemyPokemon(species, level, TrainerSlot.NONE, false)`, whose constructor makes the first shiny roll.
//   5. one extra `trySetShinySeed(64, true, 0)` and one `tryRerollHiddenAbilitySeed(256)` — the "doubled" rolls, and
//      most of what makes a mon worth the fee. The hidden-ability reroll is skipped when the constructor already
//      landed `abilityIndex === 2`, so the replay must skip it too or every later draw shifts.
// `globalScene.addEnemyPokemon(species, level, TrainerSlot.NONE, false)` is the same constructor call with the same
// defaults (`shinyLock = false`, no `dataSource`), and its one extra draw — the boss IV blend — is gated on `boss`,
// which is false here. So it is exact, and it is what `48-preview.js` already uses.
//
// ---- `eventChance` is derivable, not opaque
// It is module state on the encounter file (`50`, `+25` per non-event spawn, reset to `50` by `withOnInit`), so it
// cannot be read off the scene. It doesn't need to be: `withOnInit` fires when the encounter is built, so mon 1 is
// always drawn at 50, and replaying mon 1 says whether it came from the event — which gives mon 2's value, and so on.
// The replay carries the number forward itself, exactly as the game does.
//
// ---- Confidence: `exact`
// The fork is keyed on the wave index and the remaining count, so no amount of play moves it, and the species pool is
// `getAllStarters(true)` — a **static table**, not the arena pool that rebuilds on entering a biome and again at X5,
// which is what caps a wild species at `estimate` in `48-preview.js`. The one live read is the shiny threshold:
// `trySetShinySeed(…, true, …)` multiplies in the timed-event multiplier and applies `ShinyRateBoosterModifier`, the
// player's Shiny Charm stacks. Neither can move between this card and the fee — the only two actions on that screen
// are pay and leave — so the claim cannot drift. It is left as a live read rather than re-derived, which is why the
// threshold is never wrong.
//
// ---- Why 44 and not 48
// This is seed-replay machinery and belongs beside `48-preview.js` by kind, but its only consumer is
// `46-encounter.js` and the bundle's layer rule lets a file import only from lower-numbered ones. So it sits below
// the rule file it feeds, above the two tables it reads (`01-core.js`, `04-game-tables.js`) and clear of everything
// else. It stays a file of its own for the reason the number can't express: `46-encounter.js` is already the HUD's
// biggest rule file, and a seed replay is not a rule.
//
// ---- Degrade, never block
// The species draw needs `getAllStarters` and `getStarterCost` off the species registry `04-game-tables.js` scans out
// of the live chunks, and the event branch needs the timed-event manager. Missing either, the replay declines with a
// reason and the fee option falls back to the money-only line it carried before — the card never guesses at what the
// fee buys.
import { iconOf, typesOf } from "./01-core.js";
import { gameEvents, gameTables } from "./04-game-tables.js";

// `NUM_SAFARI_ENCOUNTERS`. The fork offsets are `waveIndex × 1000 × remaining` for remaining counting down from it.
export const SAFARI_MONS = 3;
// `BASE_SHINY_CHANCE` / `BASE_HIDDEN_ABILITY_RATE` (`balance/rates.ts`), spelled out because the encounter passes the
// defaults and the reroll methods take them as arguments.
const BASE_SHINY_CHANCE = 64, BASE_HIDDEN_ABILITY_RATE = 256;
// `NON_LEGEND_PARADOX_POKEMON` (`balance/special-species-groups.ts`). Every one of these costs more than 5, so the
// exclusion never actually bites the `[0, 5]` band — it is carried so a rebalance upstream can't quietly change the
// pool this replay draws from without the drift check saying so.
const NON_LEGEND_PARADOX = [
  SpeciesId.GREAT_TUSK, SpeciesId.SCREAM_TAIL, SpeciesId.BRUTE_BONNET, SpeciesId.FLUTTER_MANE, SpeciesId.SLITHER_WING,
  SpeciesId.SANDY_SHOCKS, SpeciesId.ROARING_MOON, SpeciesId.WALKING_WAKE, SpeciesId.GOUGING_FIRE,
  SpeciesId.RAGING_BOLT, SpeciesId.IRON_TREADS, SpeciesId.IRON_BUNDLE, SpeciesId.IRON_HANDS, SpeciesId.IRON_JUGULIS,
  SpeciesId.IRON_MOTH, SpeciesId.IRON_THORNS, SpeciesId.IRON_VALIANT, SpeciesId.IRON_LEAVES, SpeciesId.IRON_BOULDER,
  SpeciesId.IRON_CROWN,
];

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
// `randSeedInt` (utils/common): the same three lines, so a replayed draw lands on the same stream position.
const rnd = range => (range <= 1 ? 0 : Phaser.Math.RND.integerInRange(0, range - 1));
// `randSeedItem` (utils/common): one item is picked without touching the stream.
const pick = items => (items.length === 1 ? items[0] : Phaser.Math.RND.pick(items));
const drop = o => { try { o?.destroy?.(); } catch {} };
// The game logs its event chance and every species it builds; a preview is a read, so it leaves nothing behind.
const quiet = fn => {
  const { log, warn, info } = console;
  console.log = console.warn = console.info = () => {};
  try { return fn(); } finally { Object.assign(console, { log, warn, info }); }
};

// What the replay needs off the live build, by feature rather than by version: the species registry with the two
// starter methods `getRandomSpeciesByStarterCost` reads, and the timed-event manager whose encounter list decides
// whether the event branch draws at all. A build missing either is a build this replay would have to guess at.
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

// Whether the three mons can be replayed at all. The tables are scanned out of the page's chunks asynchronously, so
// this flips from false to true partway through an encounter — which is why it belongs in the caller's cache key: a
// card built before the scan landed would otherwise hold its degraded line for the rest of the wave.
export const safariReady = s => !partsOf(s).why;

// `getRandomSpeciesByStarterCost([0, 5], NON_LEGEND_PARADOX_POKEMON, undefined, false, false, false)`. The band widens
// — min down to 0 first, then max up to 10 — until something is in it, which for `[0, 5]` never happens; it is kept
// so the replay stays the game's own function rather than a summary of it.
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
  // The index is drawn first, against the array as it stands; the shuffle comes after and is read at that index.
  const i = rnd(band.length);
  return reg.getSpecies(Phaser.Math.RND.shuffle(band)[i][0].speciesId);
};

// One mon, inside its own fork. Returns the built `EnemyPokemon` and whether it came from the live event, which is
// what carries `eventChance` to the next one.
const drawMon = (s, parts, chance) => {
  const { species: reg, events } = parts;
  const level = s.currentBattle.getLevelForWave();
  // Safari asks for no legendary, no sub-legendary and no mythical, and passes no species filter.
  const eventEncounters = tryDo(() => events.getAllValidEventEncounters(false, false, false, () => true), []) ?? [];
  let sp = null, fromEvent = false, formIndex = null;
  if (chance && eventEncounters.length > 0 && (chance === 100 || rnd(100) < chance)) {
    const enc = pick(eventEncounters);
    fromEvent = true;
    sp = reg.getSpecies(reg.getSpecies(enc.species)
      .getWildSpeciesForLevel(level, !enc.blockEvolution, false, s.gameMode));
    // `formIndex` is assigned after construction and draws nothing, so it is set the same way here.
    formIndex = enc.formIndex;
  } else {
    sp = safariSpecies(reg);
  }
  const p = s.addEnemyPokemon(sp, level, TrainerSlot.NONE, false);
  if (formIndex) p.formIndex = formIndex;
  // The doubled rolls. `isEventEncounter` adds the event arms on top, which for Safari are one more of each.
  const shinyRerolls = 1 + (fromEvent ? 1 : 0), hiddenRerolls = 1 + (fromEvent ? 1 : 0);
  for (let i = 0; i < shinyRerolls; i++) p.trySetShinySeed(BASE_SHINY_CHANCE, true, 0);
  for (let i = 0; i < hiddenRerolls && p.abilityIndex !== 2; i++) p.tryRerollHiddenAbilitySeed(BASE_HIDDEN_ABILITY_RATE);
  return { p, fromEvent };
};

// The default reading of one previewed mon: everything the fee decision is made on except what it is worth to *this*
// account, which is the card's question and needs the account the card holds.
export const safariMonData = p => ({
  name: tryDo(() => p.getNameToRender(), p.name) ?? p.name ?? "?",
  icon: iconOf(p),
  level: p.level ?? null,
  types: tryDo(() => typesOf(p), []),
  ability: tryDo(() => p.getAbility()?.name),
  hiddenAbility: p.abilityIndex === 2,
  shiny: !!tryDo(() => p.isShiny(), p.shiny),
  variant: p.shiny ? (p.variant ?? 0) : null,
  catchRate: tryDo(() => p.species.catchRate),
  speciesId: tryDo(() => p.species.speciesId),
});

// The three mons the fee buys, in the order they are summoned. `read` maps each built mon to what the caller wants
// while it is still alive — the objects are Phaser containers and are destroyed before this returns, exactly as
// `48-preview.js` does with the party it builds.
//
// `{ mons }` on success, `{ why }` when the live build can't be replayed. Never throws.
export const safariPreview = (s, read = safariMonData) => {
  const parts = partsOf(s);
  if (parts.why) return { why: parts.why };
  const w = tryDo(() => s.currentBattle.waveIndex);
  if (!(w > 0)) return { why: "no wave to read" };
  const built = [];
  try {
    return quiet(() => {
      const mons = [];
      // `withOnInit` resets the chance to 50 when the encounter is built, so mon 1 is always drawn at 50 and each
      // one carries the number to the next: reset to 50 by an event spawn, +25 by a non-event one.
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
