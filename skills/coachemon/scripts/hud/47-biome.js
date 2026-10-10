// Biome route advisor: when the game offers a choice of next biome (the party holds a Map), which one suits the party.
// Mystery Encounter waves are not modelled.
import { TYPES, effectiveness } from "./01-core.js";
import { bigFightsAhead, poolAnchorWave, trainerOdds, waveKind } from "./03-calendar.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { partyAtFight, partyLuck, partyProfile, partyReasons, typesOfSpecies } from "./08-party.js";

// `generateNonBossBiomeTier` / `generateBossBiomeTier`'s cuts (game-code.md §10).
const TIER_CUTS = [156, 32, 6, 1, 0];
const BOSS_CUTS = [20, 6, 1, 0];
// In the order `TIER_CUTS` / `BOSS_CUTS` cut them.
const POOL_TIERS = [BiomePoolTier.COMMON, BiomePoolTier.UNCOMMON, BiomePoolTier.RARE, BiomePoolTier.SUPER_RARE, BiomePoolTier.ULTRA_RARE];
const BOSS_POOL_TIERS = [BiomePoolTier.BOSS, BiomePoolTier.BOSS_RARE, BiomePoolTier.BOSS_SUPER_RARE, BiomePoolTier.BOSS_ULTRA_RARE];
const TRAINER_POOL_TIERS = [TrainerPoolTier.COMMON, TrainerPoolTier.UNCOMMON, TrainerPoolTier.RARE, TrainerPoolTier.SUPER_RARE, TrainerPoolTier.ULTRA_RARE];
const WINDOW = 10;
const CATCH_TIER = [1, 1, 0.6, 0.3, 0.15];
const TRAINER_TIER = 99; // an encounter from a trainer's party: not a catch
const BOSS_FIT = 10;
// `determineEnemySpecies`' random factor, indexed by `EvoLevelThresholdKind` (game-code.md §10).
const EVO_SPREAD = [1, 1.1, 1.2];
// 46-encounter's `RARE_BIOMES` is the same set: change both.
const RARE_ONWARD = new Set([BiomeId.SPACE, BiomeId.FAIRY_CAVE, BiomeId.LABORATORY]);

// `formsAt` and `trainerParty` cache the nothing they answer before the chunk scan lands, and the scan fills the tables
// in a chunk at a time (#381): a read that finds more tables than the last drops both caches. `biomeModel`'s memo key
// counts the same tables. Count the values, not the keys: a table the scan found nothing for leaves its name behind.
const tablesPresent = t => (t ? Object.values(t).filter(Boolean).length : 0);
let clearedAt = 0;
const readTables = () => {
  const t = gameTables();
  const n = tablesPresent(t);
  if (n > clearedAt) { clearedAt = n; formsCache.clear(); trainerCache.clear(); }
  return t;
};

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const nameOf = id => tryDo(() => readTables().biomeName(id), `#${id}`);
const linkId = l => (Array.isArray(l) ? l[0] : l);

// Option labels → biome ids by the game's own localized name; failing that, by position: the options are the links in
// order, less those that didn't roll (game-code.md §10).
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
    while (j > 0 && !pools[j].length) j--;
    if (pools[j].length) out.push({ tier: tiers[j], list: pools[j], p: x });
  });
  return out;
};

// A spawn's species at `level`, as the game's chance of each form: `Map id → p` (game-code.md §10).
const formsCache = new Map();
const formsAt = (id, level, kind) => {
  // Before the cache lookup: the read is what drops an answer cached without the tables.
  const reg = readTables()?.species;
  const key = `${id}|${level}|${kind}`;
  if (formsCache.has(key)) return formsCache.get(key);
  const out = new Map();
  const add = (sid, p) => out.set(sid, (out.get(sid) ?? 0) + p);
  const sp0 = speciesById(id);
  if (!sp0) { formsCache.set(key, out); return out; }
  if (typeof reg?.getEvolutions !== "function") {
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

// A trainer type's party as base species with their chance, `[{ id, p }]`, plus its specialty type.
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
  const tables = readTables(); // before the lookup, as in `formsAt`
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

const timeOfDayAt = (s, w, biomeId) => {
  if (biomeId === BiomeId.ABYSS) return TimeOfDay.NIGHT;
  const c = (w + (s?.waveCycleOffset ?? 0)) % 40;
  return c < 15 ? TimeOfDay.DAY : c < 20 ? TimeOfDay.DUSK : c < 35 ? TimeOfDay.NIGHT : TimeOfDay.DAWN;
};
// The time of day of the pool wave `w` spawns from, which was built at `poolAnchorWave(w)`: read at `w` itself, a pool
// moves up to four waves early (game-code.md §10).
export const spawnTimeOfDay = (s, w, biomeId) => (w == null ? null : timeOfDayAt(s, poolAnchorWave(w), biomeId));

// `getEncounterBossSegments`' random bosses off a tenth wave (game-code.md §10).
const randomBossChance = (s, w) => (s?.gameMode?.hasRandomBosses
  ? Math.min(Math.max(Math.ceil((w - 250) / 50), 0) * 2, 30) / 100
  : 0);

// `[{ w, tod, wild, trainer, boss, gym }]` for the waves the biome decides. `boss` is a share, not a flag.
const wavesIn = (s, biome, wave) => {
  const gm = s.gameMode;
  const bossTrainers = (biome.trainerPool?.[BiomePoolTier.BOSS] ?? []).length > 0;
  const out = [];
  for (let w = wave + 1; w <= wave + WINDOW; w++) {
    const kind = waveKind(s, w);
    if (kind === "final" || kind === "fixed") continue;
    const tod = spawnTimeOfDay(s, w, biome.biomeId);
    const trainer = trainerOdds(s, w, biome);
    // `isTrainerBoss` (game-code.md §10).
    const gym = !!trainer && bossTrainers && (gm?.isDaily
      ? w > 10 && w < 50 && w % 10 === 0
      : kind === "gym" && (biome.biomeId !== BiomeId.END || !!gm?.isClassic));
    const boss = trainer < 1 ? (kind === "boss" ? 1 : randomBossChance(s, w)) : 0;
    out.push({ w, tod, wild: 1 - trainer, trainer, boss, gym });
  }
  return out;
};

// `list`: `[{ id, tier, w, wild, boss, trainer }]`, `w` summing to 1 over the waves the biome decides and split into
// the other three; `id` is the species as rolled, before it evolves.
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
      // The game also lets an END boss spawn on the final wave, which `wavesIn` has dropped (game-code.md §10).
      const bossPool = (biome.pokemonPool?.[BiomePoolTier.BOSS]?.[TimeOfDay.ALL] ?? []).length + (biome.pokemonPool?.[BiomePoolTier.BOSS]?.[wv.tod] ?? []).length > 0
        && (biome.biomeId !== BiomeId.END || !!gm?.isClassic);
      const forced = gm?.isDaily ? tryDo(() => gm.dailyConfig.forcedWaves.find(f => f.waveIndex === wv.w).tier) : null;
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
      // Only a tenth wave's sure boss is the big fight, not a wave that merely might roll one.
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

  const dex = s.gameData?.dexData ?? {};
  const catches = new Map();
  for (const e of spawnList) {
    if (e.tier > BiomePoolTier.ULTRA_RARE || !(e.wild > 0)) continue;
    const reasons = partyReasons(profile, { species: e.sp, level, types: e.types });
    if (reasons.some(r => r.kind === "dupe")) continue;
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
  const met = {};
  for (const e of spawnList) { const n = tryDo(() => e.sp.name, `#${e.id}`); met[n] = (met[n] ?? 0) + e.w; }
  const common = Object.entries(met).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, x]) => [n, Math.round(x * 100)]);

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

// The weights are `raw`'s over 100: change both.
const edgeOver = (a, b) => {
  const parts = [["offense", 0.5 * (a.offense - b.offense)], ["defense", 0.25 * (a.defense - b.defense)],
    ["the big fight", 0.1 * (a.bossFit - b.bossFit)], ["catches", 0.08 * (a.opportunity - b.opportunity)]];
  const [name, gap] = parts.sort((x, y) => y[1] - x[1])[0];
  return gap > 0 ? name : null;
};

// The memo key counts the tables rather than asking for any: the trainer configs and the biome names can land after the
// card first drew, and a model built without them has to be rebuilt (#381).
export const biomeModel = (run, h) => {
  const s = run.scene;
  const wave = run.facts.wave;
  const tables = readTables();
  const labels = h.config.options.map(o => String(o.label ?? ""));
  const everyone = run.facts.party;
  // The party at the next big fight (CONTEXT.md, `Dead weight`): a heal or a shop on the way is a way back, so the
  // old "everyone when heals revive, else standing" special case is gone (#570).
  const fight = bigFightsAhead(s, wave + 1)[0]?.wave ?? null;
  const party = partyAtFight(s, everyone, { from: wave, fight }).members;
  const key = JSON.stringify([tablesPresent(tables), labels, party.map(p => [p.id, p.moveset.filter(Boolean).map(m => m.moveId ?? tryDo(() => m.getName()))]),
    (s.gameMode?.challenges ?? []).map(c => [c.id, c.value])]);
  const value = run.memo("biome", key, () => build(run, tables, labels, everyone, party));
  if (value.kind) return value;
  // Never a kind-less card: the panel can't draw one.
  return { kind: "biome", from: null, options: labels.map(label => ({ label, id: null })), pick: -1,
    data: !!tables, trainers: false, fainted: 0, unread: value.unavailable };
};
const build = (run, tables, labels, everyone, party) => {
  const s = run.scene;
  const wave = run.facts.wave;
  const level = Math.max(1, ...everyone.map(p => p.level ?? 1));
  const luck = partyLuck(everyone, s, gameEvents());
  const profile = partyProfile(party);
  const ids = tables ? resolveOptions(s, labels) : labels.map(() => null);
  const options = labels.map((label, i) => ({ label, id: ids[i], ...(ids[i] != null && party.length ? judge(s, ids[i], profile, level, wave, luck) ?? {} : {}) }));
  const scored = options.filter(o => o.score != null);
  const ranked = [...scored].sort((a, b) => b.raw - a.raw || b.bossFit - a.bossFit || b.defense - a.defense);
  const best = ranked[0] ?? null;
  for (const o of scored) o.verdict = o === best ? "pick" : best.score - o.score <= 5 ? "close" : "worse";
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

// @only tests: spawnsFor, formsFor
export const spawnsFor = (s, id, wave, luck = 0) => {
  const biome = readTables()?.biomes?.get(id);
  return biome ? encounters(s, biome, wave, luck) : null;
};
export const formsFor = (id, level, kind = EvoLevelThresholdKind.WILD) => Object.fromEntries(formsAt(id, level, kind));

// `Swamp 72 pick — Garchomp resists, 3 mons hit SE · Construction Site 55`, for the watcher and the battle read.
export const biomeSummary = m => m.options.map(o => (o.score == null ? o.label
  : o.verdict === "pick" ? `${o.label} ${o.score} pick — ${o.reasons.slice(0, 3).map(r => r.text).join(", ")}` : `${o.label} ${o.score}`)).join(" · ");
