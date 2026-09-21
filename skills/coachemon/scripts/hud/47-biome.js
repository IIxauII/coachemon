// Biome route advisor: when the game offers a choice of next biome (the party holds a Map), which one suits the party.
//
// ---- How the game decides (read from the pinned source, v1.12.0.11; not called live; references/game-code.md §10)
// SelectBiomePhase.start: `let{biomeLinks:v}=allBiomes.get(arena.biomeId)`; links are ids or [id, n] (offered with
// chance 1/n); with a MapModifier and more than one left: `ui.setMode(15 /* OPTION_SELECT */, {options: biomes.map(b =>
// ({label: getBiomeName(b), handler}))})`. The handler closes over the id, so an option is only its localized label.
// Biome data (`allBiomes`, a Map BiomeId → {pokemonPool, trainerPool, trainerChance, biomeLinks}) is module-private:
// nothing on the scene holds another biome's pools (Arena copies only its own). pokemonPool[tier][timeOfDay] lists
// species ids; trainerPool[tier] lists trainer types; tier 0–4 COMMON…ULTRA_RARE, 5–8 BOSS…BOSS_ULTRA_RARE; timeOfDay
// -1 ALL, 0 DAWN, 1 DAY, 2 DUSK, 3 NIGHT. Arena.getTimeOfDay: ABYSS always night, else (wave + waveCycleOffset) % 40:
// < 15 day, < 20 dusk, < 35 night, else dawn.
//
// What each of the ten waves the choice covers holds. Which wave is which, and how likely a trainer is on it, is the
// **run calendar**'s (`03-calendar.js`): a fixed battle or the final wave is not the biome's and is left out, a gym
// wave is always a trainer, X1 and X0 never are, and any other wave rolls 1/trainerChance with its look-back. What is
// left below is what the biome itself decides.
// - A trainer: `Arena.randomTrainerType` rolls randSeedInt(512) over trainerPool tiers 0–4 (156+ common, 32+ uncommon,
//   6+ rare, 1+ super rare, 0 ultra; no luck), or randSeedInt(64) over the boss tiers 5–8 (20+, 6+, 1+, 0) when the
//   biome has a BOSS trainer and `isTrainerBoss` (the gym wave; Daily: X0 in 20–40): the gym leader is the biome's.
//   An empty tier drops to the one below. Its party (`Trainer.genNewPartyMemberSpecies`): the config's speciesPools by
//   the same 512 roll, else `speciesFilter` over every catchable species, taken back to its base form; a gym leader's
//   filter is its specialty type (its signature slots are closures, unreadable, and mostly that type too).
// - Otherwise a wild one: `Arena.randomSpecies` rolls randSeedInt(512 − 2·luck) over the same tier cuts, or
//   randSeedInt(64 − luck/2) on a boss wave (`isBoss`, X0 in classic); a Daily event seed's `forcedWaves` pins the
//   tier. An empty tier drops to the one below; a legend-like species (BST < 660) rerolls before difficulty wave 55
//   (BST ≥ 660: before 80). `getWildSpeciesForLevel` then evolves it by chance (`determineEnemySpecies`): each
//   evolution whose threshold t = max(its required level, evoLevelThreshold[kind]) the spawn has reached is picked evenly and taken
//   when randSeedIntRange(t, round(t·m)) ≤ level (m 1.2 wild, 1.1 boss and trainer), again from the evolved form; a
//   species below its own prevolution's threshold is replaced by the prevolution first. Kind: 2 wild, 1 boss/trainer.
// Mystery Encounters take some wild and trainer waves at random; not modelled.
//
// ---- Where the tables come from at runtime
// `04-game-tables.js`, which reads the game's own chunks. The read is async, so the first refresh or two draw the card
// without spawn data; without the trainer configs the trainer waves are left out, as fixed waves are.
//
// ---- Scoring (per offered biome, explainable on purpose)
// Encounters: every wave's wild and trainer species at those odds, each wave counting once, evolved at the party's top
// level. The party is everyone, because entering an X1 heals and revives — except where the calendar says that heal
// doesn't revive, and then the fainted stay out.
// - offense: per encounter, the best multiplier any party move reaches (STAB ×1.5): SE 1, neutral 0.5, resisted 0.
// - defense: per encounter, share of the party resisting all its types minus the share weak to one of them.
// - catch: wild species that cover a team weakness, clearly outclass the weakest member, or are new to the dex (light).
// - big fight: the biome's tenth wave — its gym leader, or its wild boss — per foe: 1 when two members hit it SE, 0.5
//   for one, minus the share weak to it. It already counts as one wave of ten above; this is on top, because it's the
//   fight that ends a run.
// score = 50·offense + 25·(defense + 1) + up to 8 for catches ± 10 for the big fight. Ties go to the unrounded score.
import { TYPES, effectiveness } from "./01-core.js";
import { healRevives, poolAnchorWave, trainerOdds, waveKind } from "./03-calendar.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { partyLuck, partyProfile, partyReasons, typesOfSpecies } from "./08-party.js";

const TIER_CUTS = [156, 32, 6, 1, 0];
const BOSS_CUTS = [20, 6, 1, 0];
// Pool tiers in the order TIER_CUTS / BOSS_CUTS cut them: a biome's pools by BiomePoolTier, a trainer config's by TrainerPoolTier.
const POOL_TIERS = [BiomePoolTier.COMMON, BiomePoolTier.UNCOMMON, BiomePoolTier.RARE, BiomePoolTier.SUPER_RARE, BiomePoolTier.ULTRA_RARE];
const BOSS_POOL_TIERS = [BiomePoolTier.BOSS, BiomePoolTier.BOSS_RARE, BiomePoolTier.BOSS_SUPER_RARE, BiomePoolTier.BOSS_ULTRA_RARE];
const TRAINER_POOL_TIERS = [TrainerPoolTier.COMMON, TrainerPoolTier.UNCOMMON, TrainerPoolTier.RARE, TrainerPoolTier.SUPER_RARE, TrainerPoolTier.ULTRA_RARE];
const WINDOW = 10;
// What a tier is worth as a catch: a common one is there to meet, an ultra rare one mostly isn't.
const CATCH_TIER = [1, 1, 0.6, 0.3, 0.15];
const TRAINER_TIER = 99; // an encounter from a trainer's party: not a catch
const BOSS_FIT = 10;
// `determineEnemySpecies`'s random factor, by EvoLevelThresholdKind (0 STRONG, 1 NORMAL, 2 WILD).
const EVO_SPREAD = [1, 1.1, 1.2];
// Rare destinations worth naming when an option can lead there.
const RARE_ONWARD = new Set([BiomeId.SPACE, BiomeId.FAIRY_CAVE, BiomeId.LABORATORY]);

// The game tables (`04-game-tables.js`), with the one-time cache clear that goes with them: `formsAt` and
// `trainerParty` answer with nothing while the chunk scan hasn't landed — a missing species registry answers nothing —
// and cache that nothing, so the first read that finds tables drops both caches. The loader fills them once per page,
// which is why once is enough and no invalidation crosses the module line.
let cleared = false;
const readTables = () => {
  const t = gameTables();
  if (t && !cleared) { cleared = true; formsCache.clear(); trainerCache.clear(); }
  return t;
};

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const nameOf = id => tryDo(() => readTables().biomeName(id), `#${id}`);
const linkId = l => (Array.isArray(l) ? l[0] : l);

// Option labels → biome ids: by the game's own localized name; failing that, by position among the current biome's
// links (the options are those links, in order, minus the ones that didn't roll).
const resolveOptions = (s, labels) => {
  const tables = readTables();
  const links = tryDo(() => [...tables.biomes.get(s.arena.biomeId).biomeLinks], []);
  const ids = [...new Set([...links.map(linkId), ...(tables?.biomes?.keys() ?? [])])];
  const byName = labels.map(l => ids.find(id => nameOf(id) === l) ?? null);
  if (byName.every(x => x != null)) return byName;
  return labels.length === links.length ? links.map(linkId) : byName;
};

const speciesById = id => tryDo(() => readTables().species.getSpecies(id));
// P(tier i) for a roll uniform on [0, max), tier i taking the values from cuts[i] up to the tier above's cut.
const tierOdds = (cuts, max) => cuts.map((c, i) => Math.max(0, (i ? Math.min(cuts[i - 1], max) : max) - Math.min(c, max)) / max);
const odds = (pools, tiers, cuts, max, forced = null) => {
  const p = forced != null && tiers.includes(forced) ? tiers.map(t => (t === forced ? 1 : 0)) : tierOdds(cuts, max);
  const out = [];
  p.forEach((x, i) => {
    if (!x) return;
    let j = i;
    while (j > 0 && !pools[j].length) j--; // an empty tier drops to the one below
    if (pools[j].length) out.push({ tier: tiers[j], list: pools[j], p: x });
  });
  return out;
};

// ---- A spawn's species at `level`, as the game's chance of each form: Map id → p.
const formsCache = new Map();
const formsAt = (id, level, kind) => {
  // Before the cache lookup, not after: the read is what drops entries answered without tables, so a caller that comes
  // straight here (`formsFor`) can't be served one.
  const reg = readTables()?.species;
  const key = `${id}|${level}|${kind}`;
  if (formsCache.has(key)) return formsCache.get(key);
  const out = new Map();
  const add = (sid, p) => out.set(sid, (out.get(sid) ?? 0) + p);
  const sp0 = speciesById(id);
  if (!sp0) { formsCache.set(key, out); return out; }
  if (typeof reg?.getEvolutions !== "function") {
    // An older registry without evolution records: the last stage reached by level, as the game's own list gives it.
    let pick = id;
    for (const [eid, lv] of tryDo(() => sp0.getEvolutionLevels(), [])) if (typeof lv === "number" && lv > 1 && lv <= level) pick = eid;
    add(pick, 1);
    formsCache.set(key, out);
    return out;
  }
  const walk = (sp, p, forcePrevo, depth) => {
    if (forcePrevo && tryDo(() => reg.hasPrevolution(sp.speciesId), false)) {
      const pls = tryDo(() => sp.getPrevolutionLevels(true), []);
      for (let i = pls.length - 1; i >= 0; i--) {
        const [pid, lv, thr] = pls[i];
        const t = thr?.[kind] ?? lv;
        if (level < (lv === 1 ? t : Math.min(lv, t))) { add(pid, p); return; }
      }
    }
    const pool = (tryDo(() => reg.getEvolutions(sp.speciesId), []) ?? [])
      .map(e => ({ id: e.speciesId, lv: e.level ?? 0, t: Math.max(e.level ?? 0, e.evoLevelThreshold?.[kind] ?? 0) }))
      .filter(e => e.t > 0 && level >= e.lv && level >= e.t);
    if (!pool.length || depth > 4) { add(sp.speciesId, p); return; }
    for (const e of pool) {
      const q = p / pool.length;
      const hi = Math.round(e.t * EVO_SPREAD[kind]);
      const evolves = Math.min(1, Math.max(0, (level - e.t + 1) / (hi - e.t + 1)));
      const next = evolves > 0 ? speciesById(e.id) : null;
      if (next) walk(next, q * evolves, false, depth + 1);
      add(sp.speciesId, next ? q * (1 - evolves) : q);
    }
  };
  walk(sp0, 1, true, 0);
  for (const [k, v] of out) if (v < 1e-9) out.delete(k);
  formsCache.set(key, out);
  return out;
};

// ---- A trainer type's party, as base species with their chance: [{ id, p }], plus its specialty type.
const trainerCache = new Map();
const rootOfId = (reg, id) => {
  let cur = id;
  for (let i = 0; i < 4; i++) {
    const prev = tryDo(() => (reg.hasPrevolution(cur) ? reg.getPrevolution(cur) : null));
    if (prev == null) break;
    cur = typeof prev === "object" ? prev.speciesId : prev;
  }
  return cur;
};
const trainerParty = type => {
  const tables = readTables(); // before the lookup, for the reason `formsAt` gives
  if (trainerCache.has(type)) return trainerCache.get(type);
  const cfg = tryDo(() => tables.trainers[type]);
  let value = null;
  if (cfg) {
    let species = [];
    if (cfg.speciesPools) {
      const pools = TRAINER_POOL_TIERS.map(t => (tryDo(() => cfg.speciesPools[t], []) ?? []).filter(x => typeof x === "number"));
      const byId = new Map();
      for (const { list, p } of odds(pools, TRAINER_POOL_TIERS, TIER_CUTS, 512)) for (const id of list) byId.set(id, (byId.get(id) ?? 0) + p / list.length);
      species = [...byId].map(([id, p]) => ({ id, p }));
    } else if (typeof cfg.speciesFilter === "function") {
      const ids = new Set();
      for (const sp of tryDo(() => tables.species.getAllSpecies(), [])) {
        if (tryDo(() => (sp.isCatchable?.() ?? true) && cfg.speciesFilter(sp), false)) ids.add(rootOfId(tables.species, sp.speciesId));
      }
      species = [...ids].map(id => ({ id, p: 1 / ids.size }));
    }
    value = { type, name: String(cfg.name ?? `trainer ${type}`), specialty: cfg.specialtyType != null ? TYPES[cfg.specialtyType] ?? null : null, species };
  }
  trainerCache.set(type, value);
  return value;
};

// ---- Which pool a wave spawns from, and when that pool was last built
// `Arena.updatePoolsForTimeOfDay` rebuilds `pokemonPool` from `getTimeOfDay()`, which reads whatever wave is current
// when it runs, and it runs twice per block: when the arena is built and as a wave X5 starts. **Which wave that is**
// is a rule about wave numbers, so it is the run calendar's `poolAnchorWave`; what the time of day *at* that wave
// comes to is this card's, because it needs the biome (ABYSS is night whatever the wave). Reading the time of day at
// the wave itself — which both this card and 48-preview did — moves a pool up to four waves early.
const timeOfDayAt = (s, w, biomeId) => {
  if (biomeId === BiomeId.ABYSS) return TimeOfDay.NIGHT;
  const c = (w + (s?.waveCycleOffset ?? 0)) % 40;
  return c < 15 ? TimeOfDay.DAY : c < 20 ? TimeOfDay.DUSK : c < 35 ? TimeOfDay.NIGHT : TimeOfDay.DAWN;
};
/** The time of day whose pool wave `w` spawns from in `biomeId`: the arena's, at its last rebuild. */
export const spawnTimeOfDay = (s, w, biomeId) => (w == null ? null : timeOfDayAt(s, poolAnchorWave(w), biomeId));

// A wild boss on a wave that isn't a tenth one: `getEncounterBossSegments` rolls `randSeedInt(100)` against
// `min(max(ceil((w − 250) / 50), 0) × 2, 30)` when the mode `hasRandomBosses` — Endless and Spliced Endless — so
// from wave 250 on, 2 % more of every wave is a boss per 50 waves, capped at 30 %. Nothing before 250, and nothing
// in classic. (A legendary, sub-legendary or mythical species is forced to a boss too, but that is decided *after*
// the species roll, not before it, so it moves no pool and isn't weighed here.)
const randomBossChance = (s, w) => (s?.gameMode?.hasRandomBosses
  ? Math.min(Math.max(Math.ceil((w - 250) / 50), 0) * 2, 30) / 100
  : 0);

// ---- What each of the ten waves holds in this biome: [{ w, tod, wild, trainer, boss, gym }], the fixed waves left
// out. Which wave is which, and how likely a trainer is on it, is the run calendar's (03-calendar.js); what is left
// here is the biome's own part — the pool's time of day, and whether the tenth wave's trainer is a gym leader this
// biome can field (`isTrainerBoss`). `boss` is a share, not a flag: a tenth wave always, and past wave 250 in
// Endless a slice of every other wave.
const wavesIn = (s, biome, wave) => {
  const gm = s.gameMode;
  const bossTrainers = (biome.trainerPool?.[BiomePoolTier.BOSS] ?? []).length > 0;
  const out = [];
  for (let w = wave + 1; w <= wave + WINDOW; w++) {
    const kind = waveKind(s, w);
    if (kind === "final" || kind === "fixed") continue; // not the biome's: the run's own table holds them
    const tod = spawnTimeOfDay(s, w, biome.biomeId);
    const trainer = trainerOdds(s, w, biome);
    // `isTrainerBoss`: the gym wave outside END unless the run is classic, and in Daily an X0 from 20 to 40.
    const gym = !!trainer && bossTrainers && (gm?.isDaily
      ? w > 10 && w < 50 && w % 10 === 0
      : kind === "gym" && (biome.biomeId !== BiomeId.END || !!gm?.isClassic));
    const boss = trainer < 1 ? (kind === "boss" ? 1 : randomBossChance(s, w)) : 0;
    out.push({ w, tod, wild: 1 - trainer, trainer, boss, gym });
  }
  return out;
};

// Weighted encounters: [{ id, tier, w, wild, boss, trainer }] with w summing to 1 over the waves the biome decides;
// `wild` is the non-boss wild part of w, `boss` the tenth wave's (wild boss or gym leader), `trainer` a trainer's.
// `id` is the species as it's rolled, before it evolves. Also the trainers met and the tenth wave's foes.
const encounters = (s, biome, wave, luck = 0) => {
  const tables = readTables();
  const gm = s.gameMode;
  const byId = new Map();
  const add = (id, tier, w, part) => {
    const e = byId.get(id) ?? { id, tier, w: 0, wild: 0, boss: 0, trainer: 0 };
    e.tier = Math.min(e.tier, tier);
    e.w += w;
    e[part] += w;
    byId.set(id, e);
  };
  const trainersMet = new Map(), gymLeaders = new Map();
  let bigFight = null, total = 0;
  for (const wv of wavesIn(s, biome, wave)) {
    total += 1;
    if (wv.wild > 0) {
      const difficulty = tryDo(() => gm.getWaveForDifficulty(wv.w, true), wv.w);
      const legalAt = id => {
        const sp = speciesById(id);
        if (!sp) return false;
        if (!(sp.legendary || sp.subLegendary || sp.mythical)) return true;
        return difficulty >= (sp.baseTotal >= 660 ? 80 : 55);
      };
      // `isBossSpecies` asks only the BOSS tier (5) for this pool's time of day, and never an END boss outside
      // classic. (The source's third term, `isWaveFinal`, can't be reached from here: the run's last wave is the
      // run's own, not the biome's, and `wavesIn` drops it before this.)
      const bossPool = (biome.pokemonPool?.[BiomePoolTier.BOSS]?.[TimeOfDay.ALL] ?? []).length + (biome.pokemonPool?.[BiomePoolTier.BOSS]?.[wv.tod] ?? []).length > 0
        && (biome.biomeId !== BiomeId.END || !!gm?.isClassic);
      const forced = gm?.isDaily ? tryDo(() => gm.dailyConfig.forcedWaves.find(f => f.waveIndex === wv.w).tier) : null;
      // The wave's wild share splits between the two pools: a tenth wave is all boss, an Endless wave past 250 a
      // slice of one, everything else none.
      const spawn = (share, asBoss) => {
        if (share <= 0) return;
        const tiers = asBoss ? BOSS_POOL_TIERS : POOL_TIERS;
        const pools = tiers.map(t => [...(biome.pokemonPool?.[t]?.[TimeOfDay.ALL] ?? []), ...(biome.pokemonPool?.[t]?.[wv.tod] ?? [])].filter(legalAt));
        const max = asBoss ? 64 - luck * 0.5 : 512 - luck * 2;
        for (const { tier, list, p } of odds(pools, tiers, asBoss ? BOSS_CUTS : TIER_CUTS, max, forced)) {
          for (const id of list) add(id, tier, share * p / list.length, asBoss ? "boss" : "wild");
        }
      };
      const bossShare = bossPool ? wv.boss : 0;
      spawn(wv.wild * bossShare, true);
      spawn(wv.wild * (1 - bossShare), false);
      // The fight that ends a biome, worth ±10 on the score: the tenth wave's own boss, not a wave that merely
      // might roll one.
      if (bossShare >= 1) bigFight = { wave: wv.w, gym: false };
    }
    if (wv.trainer > 0 && tables?.trainers) {
      const tiers = wv.gym ? BOSS_POOL_TIERS : POOL_TIERS;
      const pools = tiers.map(t => biome.trainerPool?.[t] ?? []);
      for (const { list, p } of odds(pools, tiers, wv.gym ? BOSS_CUTS : TIER_CUTS, wv.gym ? 64 : 512)) {
        for (const type of list) {
          const party = trainerParty(type);
          if (!party) continue;
          const q = wv.trainer * p / list.length;
          const met = wv.gym ? gymLeaders : trainersMet;
          met.set(type, (met.get(type) ?? 0) + q);
          for (const m of party.species) add(m.id, TRAINER_TIER, q * m.p, wv.gym ? "boss" : "trainer");
        }
      }
      if (wv.gym) bigFight = { wave: wv.w, gym: true };
    }
  }
  const sum = [...byId.values()].reduce((t, e) => t + e.w, 0) || 1;
  // Waves nothing could be read for (trainers without their configs) drop out of the weighting.
  const list = [...byId.values()].map(e => ({ ...e, w: e.w / sum, wild: e.wild / sum, boss: e.boss / sum, trainer: e.trainer / sum }));
  const share = m => [...m].map(([type, q]) => ({ ...trainerParty(type), q })).sort((a, b) => b.q - a.q);
  return { list, trainers: share(trainersMet), leaders: share(gymLeaders), bigFight, waves: total };
};

const big = x => { try { return BigInt(x ?? 0); } catch { return 0n; } };
const joinNames = names => (names.length > 2 ? `${names.length} mons` : names.join(" & "));

const judge = (s, id, profile, level, wave, luck) => {
  const party = profile.members;
  const biome = tryDo(() => readTables().biomes.get(id));
  if (!biome) return null;
  const enc = encounters(s, biome, wave, luck);
  const spawnList = enc.list.flatMap(e => [...formsAt(e.id, level, e.wild > 0 ? EvoLevelThresholdKind.WILD : EvoLevelThresholdKind.NORMAL)].map(([fid, fp]) => {
    const sp = speciesById(fid);
    return sp && { ...e, sp, types: typesOfSpecies(sp), w: e.w * fp, wild: e.wild * fp, boss: e.boss * fp };
  })).filter(e => e?.types.length);
  if (!spawnList.length) return null;

  // The party read once, by the one profile every card shares (`08-party.js`): `attacks` is the table this file used
  // to build for itself, and `hitters` / `weakTo` are its two matchup queries. The weights below stay this card's.
  const moves = profile.attacks;
  const hitsSE = (i, types) => moves[i].some(m => effectiveness(m.t, { types }) >= 2);
  const weakTo = (p, types) => types.some(t => profile.weakTo(t).includes(p));
  let offense = 0, defense = 0;
  const se = party.map(() => 0), weak = party.map(() => 0), resist = party.map(() => 0);
  const typeShare = {};
  for (const e of spawnList) {
    for (const t of e.types) typeShare[t] = (typeShare[t] ?? 0) + e.w;
    let best = 0;
    party.forEach((p, i) => {
      for (const m of moves[i]) best = Math.max(best, effectiveness(m.t, { types: e.types }) * m.stab);
      if (hitsSE(i, e.types)) se[i] += e.w;
      const worst = Math.max(...e.types.map(t => effectiveness(t, p)));
      if (worst >= 2) { weak[i] += e.w; defense -= e.w / party.length; }
      else if (worst <= 0.5) { resist[i] += e.w; defense += e.w / party.length; }
    });
    offense += e.w * (best >= 2 ? 1 : best >= 1 ? 0.5 : 0);
  }

  // The tenth wave: a gym leader by specialty type, else the wild boss by species. Per foe: two hitters 1, one 0.5,
  // minus the share of us weak to it.
  const fitOf = types => {
    const hitters = party.filter((_, i) => hitsSE(i, types)).length;
    return (hitters >= 2 ? 1 : hitters ? 0.5 : 0) - party.filter(p => weakTo(p, types)).length / party.length;
  };
  let bossFit = 0, fight = null;
  if (enc.bigFight?.gym && enc.leaders.length) {
    const byType = new Map();
    for (const l of enc.leaders) {
      const types = l.specialty ? [l.specialty] : null;
      if (!types) continue;
      const g = byType.get(l.specialty) ?? { type: l.specialty, names: [], q: 0 };
      g.names.push(l.name); g.q += l.q;
      byType.set(l.specialty, g);
    }
    const groups = [...byType.values()].sort((a, b) => b.q - a.q);
    const q = groups.reduce((t, g) => t + g.q, 0) || 1;
    bossFit = groups.reduce((t, g) => t + (g.q / q) * fitOf([g.type]), 0);
    const hitters = party.filter((_, i) => groups.some(g => hitsSE(i, [g.type]))).map(p => p.name);
    const weakNames = party.filter(p => groups.some(g => g.q / q >= 0.3 && weakTo(p, [g.type]))).map(p => p.name);
    fight = { wave: enc.bigFight.wave, gym: true, types: groups.map(g => ({ type: g.type, names: g.names, pct: Math.round(g.q / q * 100) })), hitters, weak: weakNames };
  } else if (enc.bigFight) {
    const foes = spawnList.filter(e => e.boss > 0);
    const q = foes.reduce((t, e) => t + e.boss, 0);
    if (q > 0) {
      bossFit = foes.reduce((t, e) => t + (e.boss / q) * fitOf(e.types), 0);
      const met = {};
      for (const e of foes) { const n = tryDo(() => e.sp.name, `#${e.id}`); met[n] = (met[n] ?? 0) + e.boss / q; }
      fight = { wave: enc.bigFight.wave, gym: false, foes: Object.entries(met).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, x]) => [n, Math.round(x * 100)]) };
    }
  }

  // Catches: wild non-boss spawns worth a ball for this party. What makes one worth it is the party profile's call,
  // the same question the catch card asks of the mon in front of you — so the same species at the same level gets
  // the same reasons on both cards. A biome candidate is a **species**, with the level this card picks forms at and
  // no moveset, so its own types stand in for what it would hit. The weights and the wording stay here.
  const dex = s.gameData?.dexData ?? {};
  const catches = new Map();
  for (const e of spawnList) {
    if (e.tier > BiomePoolTier.ULTRA_RARE || !(e.wild > 0)) continue;
    const reasons = partyReasons(profile, { species: e.sp, level, types: e.types });
    if (reasons.some(r => r.kind === "dupe")) continue; // its line is already on the team
    const covers = reasons.find(r => r.kind === "covers")?.types ?? [];
    const hole = reasons.find(r => r.kind === "hole")?.types ?? [];
    const upgrade = reasons.find(r => r.kind === "upgrade") ?? null;
    const fresh = !big(dex[e.sp.speciesId]?.caughtAttr); // the species met, after evolving
    const value = ((covers.length ? 1 : 0) + (upgrade ? 1 : 0) + (hole.length ? 0.5 : 0) + (fresh ? 0.5 : 0)) * CATCH_TIER[e.tier];
    if (value < CATCH_TIER[e.tier] || (catches.get(e.sp.speciesId)?.value ?? -1) >= value) continue;
    const tags = [covers.length ? `covers ${covers.slice(0, 2).join("/")}` : null,
      hole.length ? `hits ${hole.slice(0, 2).join("/")}` : null,
      upgrade ? `BST ~${upgrade.final}` : null, fresh ? "new" : null].filter(Boolean);
    catches.set(e.sp.speciesId, { name: tryDo(() => e.sp.name, `#${e.id}`), icon: tryDo(() => [e.sp.getIconAtlasKey(0), String(e.sp.getIconId(false, 0))]),
      tier: e.tier, value, tags });
  }
  const catchList = [...catches.values()].sort((a, b) => b.value - a.value);
  const opportunity = Math.min(1, catchList.slice(0, 3).reduce((t, c) => t + c.value, 0) / 3);

  const raw = 50 * offense + 25 * (defense + 1) + 8 * opportunity + BOSS_FIT * bossFit;
  const mix = Object.entries(typeShare).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, x], i) => i === 0 || x >= 0.15)
    .map(([t, x]) => [t, Math.round(x * 100)]);
  // The species met most, by name at the party's level (a line in several tiers adds up).
  const met = {};
  for (const e of spawnList) { const n = tryDo(() => e.sp.name, `#${e.id}`); met[n] = (met[n] ?? 0) + e.w; }
  const common = Object.entries(met).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, x]) => [n, Math.round(x * 100)]);

  // Reasons, worst news first: who's weak, the gym leader when it's bad news, who resists, who hits it, the gym leader
  // when it's good news, what's worth catching.
  const names = pred => party.filter((_, i) => pred(i)).map(p => p.name);
  const weakNames = names(i => weak[i] >= 0.35), resistNames = names(i => resist[i] >= 0.4), hitters = names(i => se[i] >= 0.4);
  const reasons = [];
  const gymReason = fight?.gym ? (() => {
    const who = fight.types.slice(0, 2).map(g => `${g.type} (${g.names.length > 2 ? `${g.names.length} leaders` : g.names.join("/")})`).join(" or ");
    const how = [fight.hitters.length ? `${fight.hitters.length} hit${fight.hitters.length === 1 ? "s" : ""} SE` : "nothing hits SE",
      fight.weak.length ? `${joinNames(fight.weak)} weak` : null].filter(Boolean).join(", ");
    return { good: bossFit >= 0.25, gym: true, text: `W${fight.wave} gym ${who}: ${how}` };
  })() : null;
  if (weakNames.length) reasons.push({ good: false, text: `${joinNames(weakNames)} weak` });
  if (gymReason && !gymReason.good) reasons.push(gymReason);
  if (resistNames.length) reasons.push({ good: true, text: `${joinNames(resistNames)} resist${resistNames.length === 1 ? "s" : ""}` });
  if (hitters.length >= 2) reasons.push({ good: true, text: `${hitters.length} mons hit SE` });
  else if (hitters.length === 1) reasons.push({ good: false, text: `only ${hitters[0]} hits SE` });
  else reasons.push({ good: false, text: "nothing hits SE" });
  if (gymReason?.good) reasons.push(gymReason);
  if (catchList[0]) reasons.push({ good: true, catch: true, text: `catch ${catchList[0].name} (${catchList[0].tags.join(", ")})` });

  const trainerShare = enc.list.reduce((t, e) => t + e.trainer, 0);
  const onward = tryDo(() => [...biome.biomeLinks], []).map(l => ({ name: nameOf(linkId(l)), rare: RARE_ONWARD.has(linkId(l)), chance: Array.isArray(l) ? l[1] : 1 }));
  return {
    raw, score: Math.round(raw), offense: Math.round(offense * 100), defense: Math.round(defense * 100),
    opportunity: Math.round(opportunity * 100), bossFit: Math.round(bossFit * 100),
    mix, common, reasons, catch: catchList[0] ? { name: catchList[0].name, icon: catchList[0].icon, tags: catchList[0].tags } : null,
    trainers: enc.trainers.length ? { pct: Math.round(trainerShare * 100), names: enc.trainers.slice(0, 3).map(t => t.name) } : null,
    fight, trainerChance: biome.trainerChance ?? null, onward,
  };
};

// What separates two options that round to about the same score: the component with the largest weighted gap.
const edgeOver = (a, b) => {
  const parts = [["offense", 0.5 * (a.offense - b.offense)], ["defense", 0.25 * (a.defense - b.defense)],
    ["the big fight", 0.1 * (a.bossFit - b.bossFit)], ["catches", 0.08 * (a.opportunity - b.opportunity)]];
  const [name, gap] = parts.sort((x, y) => y[1] - x[1])[0];
  return gap > 0 ? name : null;
};

// `run` is the run read, whose memo keeps the model. The wave, the party's levels and standing are the run key's;
// what the card reads beyond that — whether the tables have landed, the options on screen, each member's moveset
// and the run's challenges — is its key within the run.
export const biomeModel = (run, h) => {
  const s = run.scene;
  const tables = readTables();
  const labels = h.config.options.map(o => String(o.label ?? ""));
  const everyone = run.facts.party;
  // Everyone fights in the next biome, because entering an X1 revives the fallen — except where the run calendar
  // says that heal doesn't revive (Hardcore, or a Limited Support with no heal at all).
  const party = healRevives(s) ? everyone : everyone.filter(p => p.hp > 0);
  const key = JSON.stringify([!!tables, labels, party.map(p => [p.id, p.moveset.filter(Boolean).map(m => m.moveId ?? tryDo(() => m.getName()))]),
    (s.gameMode?.challenges ?? []).map(c => [c.id, c.value])]);
  return run.memo("biome", key, () => build(run, tables, labels, everyone, party));
};
const build = (run, tables, labels, everyone, party) => {
  const s = run.scene;
  const wave = run.facts.wave;
  const level = Math.max(1, ...everyone.map(p => p.level ?? 1));
  const luck = partyLuck(everyone, s, gameEvents());
  // The party judged as a whole, once for every option: the coverage table, the two matchup queries and what a catch
  // is worth all come off it (`08-party.js`).
  const profile = partyProfile(party);
  const ids = tables ? resolveOptions(s, labels) : labels.map(() => null);
  const options = labels.map((label, i) => ({ label, id: ids[i], ...(ids[i] != null && party.length ? judge(s, ids[i], profile, level, wave, luck) ?? {} : {}) }));
  const scored = options.filter(o => o.score != null);
  const ranked = [...scored].sort((a, b) => b.raw - a.raw || b.bossFit - a.bossFit || b.defense - a.defense);
  const best = ranked[0] ?? null;
  for (const o of scored) o.verdict = o === best ? "pick" : best.score - o.score <= 5 ? "close" : "worse";
  // A near tie still gets a pick, and says what decided it.
  if (best && ranked[1] && best.score - ranked[1].score <= 2) {
    const edge = edgeOver(best, ranked[1]);
    if (edge) best.reasons.unshift({ good: true, edge: true, text: `edges ${ranked[1].label} on ${edge}` });
  }
  const value = {
    kind: "biome", from: tables ? nameOf(s.arena?.biomeId) : null, options,
    pick: best ? options.indexOf(best) : -1, data: !!tables, trainers: !!tables?.trainers,
    fainted: everyone.length - party.length,
  };
  for (const o of options) delete o.raw;
  return value;
};

// The weighted encounters of one biome as the ten waves after `wave` would see them, and a species' chance of each
// form at a level. Neither is on any card's path: they are what a test, or a hand check against a live tab, reads.
// @only tests: spawnsFor, formsFor
export const spawnsFor = (s, id, wave, luck = 0) => {
  const biome = readTables()?.biomes?.get(id);
  return biome ? encounters(s, biome, wave, luck) : null;
};
export const formsFor = (id, level, kind = EvoLevelThresholdKind.WILD) => Object.fromEntries(formsAt(id, level, kind));

// `Swamp 72 pick — Garchomp resists, 3 mons hit SE · Construction Site 55`, for the watcher and the battle read.
export const biomeSummary = m => m.options.map(o => (o.score == null ? o.label
  : o.verdict === "pick" ? `${o.label} ${o.score} pick — ${o.reasons.slice(0, 3).map(r => r.text).join(", ")}` : `${o.label} ${o.score}`)).join(" · ");
