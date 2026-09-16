// Biome route advisor: when the game offers a choice of next biome (the party holds a Map), which one suits the party.
//
// ---- How the game decides (read from the pinned source, v1.12.0.11; not called live)
// SelectBiomePhase.start: `let{biomeLinks:v}=allBiomes.get(arena.biomeId)`; links are ids or [id, n] (offered with
// chance 1/n); with a MapModifier and more than one left: `ui.setMode(15 /* OPTION_SELECT */, {options: biomes.map(b =>
// ({label: getBiomeName(b), handler}))})`. The handler closes over the id, so an option is only its localized label.
// Biome data (`allBiomes`, a Map BiomeId → {pokemonPool, trainerPool, trainerChance, biomeLinks}) is module-private:
// nothing on the scene holds another biome's pools (Arena copies only its own). pokemonPool[tier][timeOfDay] lists
// species ids; tier 0–4 COMMON…ULTRA_RARE, 5–8 BOSS…BOSS_ULTRA_RARE; timeOfDay -1 ALL, 0 DAWN, 1 DAY, 2 DUSK, 3 NIGHT.
// Arena.randomSpecies: tier from randSeedInt(512) (156+ common, 32+ uncommon, 6+ rare, 1+ super rare, 0 ultra) or
// randSeedInt(64) for a boss (20+ boss, 6+ rare, 1+ super rare, 0 ultra); an empty tier drops to the one below; a
// legend-like species (BST < 660) rerolls before wave 55 (BST ≥ 660: before 80); then getWildSpeciesForLevel may evolve
// it (random, around its evolution level). Arena.getTimeOfDay: ABYSS always night, else (wave + waveCycleOffset) % 40:
// < 15 day, < 20 dusk, < 35 night, else dawn.
//
// ---- Where the tables come from at runtime
// The live build keeps function and class names and exports these across chunks (loading-scene exports allBiomes,
// FadeOut exports the species data registry and getBiomeName). `loadGameTables` imports the already-loaded /assets/*.js
// modules again — the browser hands back the same module instances, nothing re-runs — and picks the exports by shape:
// a Map whose values carry biomeLinks + pokemonPool, an object with getSpecies/getAllSpecies, a function named
// getBiomeName, and the timed event manager (getShinyCatchMultiplier; the catch card's shiny odds). It's async, so the
// first refresh or two draw the card without spawn data. Nothing is copied from the game.
//
// ---- Scoring (per offered biome, explainable on purpose)
// Spawns: every species in the pool for the next 10 waves' times of day, weighted by the tier odds above; the boss wave
// counts as one wave in ten. Each is taken at the party's top level along its evolution line (by level only).
// - offense: per spawn, the best multiplier any party move reaches (STAB ×1.5): SE 1, neutral 0.5, resisted 0.
// - defense: per spawn, share of the party resisting all its types minus the share weak to one of them.
// - catch: species that cover a team weakness, clearly outclass the weakest member, or are new to the dex (light).
// score = 50·offense + 25·(defense + 1) + up to 8 for catches, 0–108.
const { biomeScreen, biomeModel, gameEvents, setGameTables, spawnsFor } = (() => {
  const TIER_ODDS = [356, 124, 26, 5, 1].map(x => x / 512);
  const BOSS_ODDS = [44, 14, 5, 1].map(x => x / 64);
  const BOSS_SHARE = 0.1;
  const ABYSS = 24;
  // How much a catch counts, by tier: a common one is there to meet, an ultra rare one mostly isn't.
  const CATCH_TIER = [1, 1, 0.6, 0.3, 0.15];
  // Rare destinations worth naming when an option can lead there.
  const RARE_ONWARD = new Set([25, 28, 41]); // SPACE, FAIRY_CAVE, LABORATORY

  let tables = null, triedAt = -Infinity;
  const setGameTables = t => { tables = t; };
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
      } else if (typeof v === "object" && typeof v.getShinyCatchMultiplier === "function") {
        found.events ??= v;
      }
    }
  };
  // Retried every 30 s while not found: the HUD may be injected before the game has loaded its chunks.
  const loadGameTables = () => {
    if (tables || Date.now() - triedAt < 30000) return;
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
      .then(() => { if (found.biomes && found.species) tables = found; });
  };

  // The game's timed event manager, or null while the tables aren't read (starts the read).
  const gameEvents = () => { loadGameTables(); return tables?.events ?? null; };

  const biomeScreen = (s, h) => s.ui.getMode() === 15 && s.phaseManager?.getCurrentPhase?.()?.phaseName === "SelectBiomePhase"
    && !!h?.config?.options?.length;

  const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const nameOf = id => tryDo(() => tables.biomeName(id), `#${id}`);
  const linkId = l => (Array.isArray(l) ? l[0] : l);

  // Option labels → biome ids: by the game's own localized name; failing that, by position among the current biome's
  // links (the options are those links, in order, minus the ones that didn't roll).
  const resolveOptions = (s, labels) => {
    const links = tryDo(() => [...tables.biomes.get(s.arena.biomeId).biomeLinks], []);
    const ids = [...new Set([...links.map(linkId), ...(tables?.biomes?.keys() ?? [])])];
    const byName = labels.map(l => ids.find(id => nameOf(id) === l) ?? null);
    if (byName.every(x => x != null)) return byName;
    return labels.length === links.length ? links.map(linkId) : byName;
  };

  const speciesById = id => tryDo(() => tables.species.getSpecies(id));
  const typesOfSpecies = sp => [sp.type1, sp.type2].filter(t => t != null).map(t => TYPES[t]).filter(Boolean);
  // The species a spawn is likely to be at `level`: the last evolution along its line reached by level (item and
  // friendship evolutions carry no real level and are skipped).
  const atLevel = (sp, level) => {
    let pick = sp;
    for (const [id, lv] of tryDo(() => sp.getEvolutionLevels(), [])) {
      if (typeof lv === "number" && lv > 1 && lv <= level) pick = speciesById(id) ?? pick;
    }
    return pick;
  };

  const timesOfDay = (s, biomeId, wave) => {
    const out = [0, 0, 0, 0];
    for (let w = wave + 1; w <= wave + 10; w++) {
      const c = (w + (s.waveCycleOffset ?? 0)) % 40;
      out[biomeId === ABYSS ? 3 : c < 15 ? 1 : c < 20 ? 2 : c < 35 ? 3 : 0] += 0.1;
    }
    return out;
  };

  // Weighted spawns: [{ id, tier, w, wild }] with w summing to 1 (wild waves 0.9, the boss wave 0.1); `wild` is the
  // non-boss part of w, `tier` the most common tier the species is in.
  const spawns = (s, biome, wave) => {
    const tod = timesOfDay(s, biome.biomeId, wave);
    const byId = new Map();
    const add = (id, tier, w) => {
      const e = byId.get(id) ?? { id, tier, w: 0, wild: 0 };
      e.tier = Math.min(e.tier, tier);
      e.w += w;
      if (tier <= 4) e.wild += w;
      byId.set(id, e);
    };
    const midWave = wave + 5; // the reroll is per wave; the biome's middle stands in for all ten
    const legalAt = id => {
      const sp = speciesById(id);
      if (!sp) return false;
      if (!(sp.legendary || sp.subLegendary || sp.mythical)) return true;
      return midWave >= (sp.baseTotal >= 660 ? 80 : 55);
    };
    const pass = (tiers, odds, share) => {
      tod.forEach((todShare, t) => {
        if (!todShare) return;
        const lists = tiers.map(tier => {
          const pool = biome.pokemonPool?.[tier] ?? {};
          return [...(pool[-1] ?? []), ...(pool[t] ?? [])].filter(legalAt);
        });
        odds.forEach((p, i) => {
          let j = i;
          while (j > 0 && !lists[j].length) j--; // an empty tier drops to the one below
          const list = lists[j];
          for (const id of list) add(id, tiers[j], share * todShare * p / list.length);
        });
      });
    };
    pass([0, 1, 2, 3, 4], TIER_ODDS, 1 - BOSS_SHARE);
    pass([5, 6, 7, 8], BOSS_ODDS, BOSS_SHARE);
    const total = [...byId.values()].reduce((t, e) => t + e.w, 0) || 1;
    return [...byId.values()].map(e => ({ ...e, w: e.w / total, wild: e.wild / total }));
  };

  const big = x => { try { return BigInt(x ?? 0); } catch { return 0n; } };
  const rootIdOf = sp => tryDo(() => sp.getRootSpeciesId(true), sp?.speciesId);
  const joinNames = names => (names.length > 2 ? `${names.length} mons` : names.join(" & "));

  const judge = (s, id, party, level, wave) => {
    const biome = tryDo(() => tables.biomes.get(id));
    if (!biome) return null;
    const spawnList = spawns(s, biome, wave).map(e => {
      const sp = atLevel(speciesById(e.id), level);
      return { ...e, sp, types: typesOfSpecies(sp) };
    }).filter(e => e.types.length);
    if (!spawnList.length) return null;

    const moves = party.map(p => {
      const own = typesOf(p);
      return [...new Set(damagingTypes(p))].map(t => ({ t, stab: own.includes(t) ? 1.5 : 1 }));
    });
    const mult = (t, types) => types.reduce((x, d) => x * vs(t, d), 1);
    let offense = 0, defense = 0;
    const se = party.map(() => 0), weak = party.map(() => 0), resist = party.map(() => 0);
    const typeShare = {};
    for (const e of spawnList) {
      for (const t of e.types) typeShare[t] = (typeShare[t] ?? 0) + e.w;
      let best = 0;
      party.forEach((p, i) => {
        let mine = 0;
        for (const m of moves[i]) {
          const x = mult(m.t, e.types);
          if (x >= 2) mine = Math.max(mine, 2);
          best = Math.max(best, x * m.stab);
        }
        if (mine >= 2) se[i] += e.w;
        const worst = Math.max(...e.types.map(t => effectiveness(t, p)));
        if (worst >= 2) { weak[i] += e.w; defense -= e.w / party.length; }
        else if (worst <= 0.5) { resist[i] += e.w; defense += e.w / party.length; }
      });
      offense += e.w * (best >= 2 ? 1 : best >= 1 ? 0.5 : 0);
    }

    // Catches: non-boss spawns that cover a team weakness, clearly outclass the weakest member, or are new to the dex.
    const weakTypes = teamWeakTypes(party);
    const roots = new Set(party.map(p => rootIdOf(p.species)));
    const fin = party.map(p => finalBstOf(p).final).filter(Boolean);
    const weakest = fin.length ? Math.min(...fin) : 0;
    const dex = s.gameData?.dexData ?? {};
    const catches = [];
    for (const e of spawnList) {
      if (e.tier > 4 || !(e.wild > 0) || roots.has(rootIdOf(e.sp))) continue;
      const covers = weakTypes.filter(t => mult(t, e.types) <= 0.5);
      const bst = finalBstOf({ species: e.sp }).final;
      const upgrade = weakest && bst >= 400 && bst >= weakest + 100;
      const fresh = !big(dex[e.sp.speciesId]?.caughtAttr); // the species met, after evolving
      const value = (covers.length ? 1 : 0) + (upgrade ? 1 : 0) + (fresh ? 0.5 : 0);
      if (value < 1) continue;
      const tags = [covers.length ? `covers ${covers.slice(0, 2).join("/")}` : null, upgrade ? `BST ~${bst}` : null, fresh ? "new" : null].filter(Boolean);
      catches.push({ name: tryDo(() => e.sp.name, `#${e.id}`), icon: tryDo(() => [e.sp.getIconAtlasKey(0), String(e.sp.getIconId(false, 0))]),
        tier: e.tier, value: value * CATCH_TIER[e.tier], tags });
    }
    catches.sort((a, b) => b.value - a.value);
    const opportunity = Math.min(1, catches.slice(0, 3).reduce((t, c) => t + c.value, 0) / 3);

    const score = Math.round(50 * offense + 25 * (defense + 1) + 8 * opportunity);
    const mix = Object.entries(typeShare).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, x], i) => i === 0 || x >= 0.15)
      .map(([t, x]) => [t, Math.round(x * 100)]);
    // The species met most, by name at the party's level (a line in several tiers adds up).
    const met = {};
    for (const e of spawnList) { const n = tryDo(() => e.sp.name, `#${e.id}`); met[n] = (met[n] ?? 0) + e.w; }
    const common = Object.entries(met).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, x]) => [n, Math.round(x * 100)]);

    // Reasons, worst news first: who's weak, who resists, who hits it, what's worth catching.
    const names = pred => party.filter((_, i) => pred(i)).map(p => p.name);
    const weakNames = names(i => weak[i] >= 0.35), resistNames = names(i => resist[i] >= 0.4), hitters = names(i => se[i] >= 0.4);
    const reasons = [];
    if (weakNames.length) reasons.push({ good: false, text: `${joinNames(weakNames)} weak` });
    if (resistNames.length) reasons.push({ good: true, text: `${joinNames(resistNames)} resist${resistNames.length === 1 ? "s" : ""}` });
    if (hitters.length >= 2) reasons.push({ good: true, text: `${hitters.length} mons hit SE` });
    else if (hitters.length === 1) reasons.push({ good: false, text: `only ${hitters[0]} hits SE` });
    else reasons.push({ good: false, text: "nothing hits SE" });
    if (catches[0]) reasons.push({ good: true, catch: true, text: `catch ${catches[0].name} (${catches[0].tags.join(", ")})` });

    const onward = tryDo(() => [...biome.biomeLinks], []).map(l => ({ name: nameOf(linkId(l)), rare: RARE_ONWARD.has(linkId(l)), chance: Array.isArray(l) ? l[1] : 1 }));
    return {
      score, offense: Math.round(offense * 100), defense: Math.round(defense * 100), opportunity: Math.round(opportunity * 100),
      mix, common, reasons, catch: catches[0] ? { name: catches[0].name, icon: catches[0].icon, tags: catches[0].tags } : null,
      trainerChance: biome.trainerChance ?? null, onward,
    };
  };

  let cache = { key: null, value: null };
  const biomeModel = (s, h) => {
    loadGameTables();
    const labels = h.config.options.map(o => String(o.label ?? ""));
    const wave = s.currentBattle?.waveIndex ?? 0;
    const party = s.getPlayerParty().filter(Boolean);
    const key = JSON.stringify([!!tables, wave, labels, party.map(p => [p.id, p.level, p.moveset.filter(Boolean).map(m => m.moveId ?? tryDo(() => m.getName()))])]);
    if (cache.key === key) return cache.value;
    const level = Math.max(1, ...party.map(p => p.level ?? 1));
    const ids = tables ? resolveOptions(s, labels) : labels.map(() => null);
    const options = labels.map((label, i) => ({ label, id: ids[i], ...(ids[i] != null && party.length ? judge(s, ids[i], party, level, wave) ?? {} : {}) }));
    const scored = options.filter(o => o.score != null);
    const best = scored.reduce((b, o) => (!b || o.score > b.score ? o : b), null);
    for (const o of scored) o.verdict = o === best ? "pick" : best.score - o.score <= 5 ? "close" : "worse";
    const value = {
      kind: "biome", from: tables ? nameOf(s.arena?.biomeId) : null, options,
      pick: best ? options.indexOf(best) : -1, data: !!tables,
    };
    cache = { key, value };
    return value;
  };

  // The weighted spawn list of one biome as the next ten waves after `wave` would see it (tests, live checks).
  const spawnsFor = (s, id, wave) => (tables?.biomes?.get(id) ? spawns(s, tables.biomes.get(id), wave) : null);

  return { biomeScreen, biomeModel, gameEvents, setGameTables, spawnsFor };
})();
