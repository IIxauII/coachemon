// Next-wave preview: what the run seed has already decided about the wave ahead — wild or trainer, which trainer and
// its exact party, single or double, the levels, the boss bars, or a Mystery Encounter and which one.
//
// ---- How the game decides (read from the pinned source, v1.12.0.11; every method it calls is on the #69 drift list)
// `BattleScene.newBattle()` sows a fresh stream at its top — `resetSeed(w)` does `RND.sow([shiftCharCodes(seed, w)])`
// — and then draws in a fixed order:
//   1. `gameMode.isWaveTrainer(w)`     the trainer-chance roll (its look-back loop is a fork per wave, so it doesn't
//                                      move the stream; a gym wave, `w % 30 === (offsetGym ? 0 : 20)`, draws nothing)
//   2. `isWaveMysteryEncounter(...)`   the ME roll, in a fork at `w * 3000`
//   3. `generateNewBattleTrainer(w)`   the trainer's pool tier and type, then its double and variant rolls
//   4. `checkIsDouble(...)`            the wild double roll
//   5. `new Battle(...)`               in a fork at `w << 3` on the wave seed: the enemy levels
// A fixed wave replaces 1–3 with `getFixedBattle(w).getTrainer()` in a fork at `(seedOffsetWaveIndex || w) << 8`.
// The enemy party is built later, in `EncounterPhase`: a trainer's members each in their own fork
// (`waveIndex + (type << 10) + ((index + 1) << 8)`, or `type + ((index + 1) << 8)` for a static party), a wild
// species straight off the stream through `arena.randomSpecies`.
//
// ---- How the preview runs
// `executeWithSeedOffset(fn, offset, seedOverride)` saves and restores `RND.state()`, `rngOffset` and
// `rngSeedOverride`, so `s.executeWithSeedOffset(fn, w, s.seed)` sows exactly what `resetSeed(w)` sows and puts the
// live stream back afterwards: replaying a wave is a read. Inside it the preview calls the game's own methods in the
// game's own order, with `s.currentBattle` swapped for the `Battle` it just built — `genPartyMember`, the
// `EnemyPokemon` constructor and `getMysteryEncounter` all read the wave index, the levels and the party so far off
// it. Everything is synchronous, so both restores are exact. The `Trainer` and `EnemyPokemon` objects it builds are
// Phaser containers that are never added to the field (`newBattle` does that, not the constructors) and are
// destroyed before the model is returned.
//
// ---- What is exact and what is a guess (`tier` per field)
// - `exact`    decided in a fork whose seed and offset don't depend on where the stream is: the fixed-battle trainer,
//              every trainer party member, the enemy levels, the ME roll and which ME, the boss-bar count.
// - `replay`   right only as long as the game draws nothing between `resetSeed(w)` and that point that this replay
//              doesn't: a generic trainer's identity, the wild double roll, the wild species.
// - `estimate` the arena's species pool is the one loaded for *this* wave's time of day; when the next wave falls in
//              another one, the pool it draws from isn't the pool we hold.
// Each field is also conditional on the live inputs not moving before the wave starts: a catch, an evolution, a shop
// pick or a biome change re-rolls what depends on the party, the luck value or the biome. Nothing here is promised:
// `previewCheck` scores every field against the wave when it actually arrives, a field that has ever been wrong is
// shown with `?`, and `window.__coachHud.preview()` prints the tally.
const { previewFor, previewNext, previewCheck, previewStats, fixedAhead } = (() => {
  const WILD = 0, TRAINER = 1, MYSTERY = 3; // BattleType
  const SLOT_NONE = 0; // TrainerSlot.NONE
  const BIOME_END = 50;
  const TIER = { exact: "exact", replay: "replay", estimate: "estimate" };
  // The scene methods the replay calls. Missing one means the live build moved past the pin: the card says so
  // instead of guessing.
  const NEEDED = ["executeWithSeedOffset", "isWaveMysteryEncounter", "generateNewBattleTrainer", "checkIsDouble",
    "getEncounterBossSegments", "randomSpecies", "addEnemyPokemon", "getMysteryEncounter"];

  const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  // `randSeedInt` (utils/common): the same three lines, so a replayed draw lands on the same stream position.
  const rnd = range => (range <= 1 ? 0 : Phaser.Math.RND.integerInRange(0, range - 1));
  // `shiftCharCodes` (utils/common): the wave seed is the run seed with every char code shifted by the wave. The
  // game holds it in `scene.waveSeed`, but that is the *current* wave's; the preview needs the one ahead.
  const waveSeedOf = (seed, w) => [...String(seed)].map(c => String.fromCharCode(c.charCodeAt(0) + w)).join("");

  const fork = (s, offset, seedOverride, fn) => {
    let out = null;
    s.executeWithSeedOffset(() => { out = fn(); }, offset, seedOverride);
    return out;
  };
  // The game logs the wave seed and every pool tier it rolls, and Phaser warns about a trainer texture that hasn't
  // been loaded yet. A preview is a read: it leaves nothing on the console.
  const quiet = fn => {
    const { log, warn, info } = console;
    console.log = console.warn = console.info = () => {};
    try { return fn(); } finally { Object.assign(console, { log, warn, info }); }
  };
  // `genPartyMember` and the EnemyPokemon constructor read the wave index, the levels and the party built so far off
  // `globalScene.currentBattle`. Synchronous, so nothing else sees the swap.
  const withBattle = (s, battle, fn) => {
    const live = s.currentBattle;
    s.currentBattle = battle;
    try { return fn(); } finally { s.currentBattle = live; }
  };
  const drop = o => { try { o?.destroy?.(); } catch {} };

  const foeOf = p => ({
    name: p.name ?? tryDo(() => p.species.name, "?"),
    icon: iconOf(p),
    level: p.level ?? null,
    types: tryDo(() => typesOf(p), []),
    ability: tryDo(() => p.getAbility()?.name),
    passive: p.hasPassive?.() ? tryDo(() => p.getPassiveAbility()?.name) : null,
    hp: tryDo(() => p.getMaxHp()),
    // 1 atk, 2 def, 3 spa, 4 spd, 5 spe — the same slots as `stat()` in 01-core.
    stats: tryDo(() => [1, 2, 3, 4, 5].map(i => p.getStat(i))),
    segments: p.bossSegments ?? 0,
    shiny: !!p.shiny,
    moves: (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getName())).filter(Boolean),
  });

  const trainerName = t => tryDo(() => t.getName(SLOT_NONE, true)) ?? tryDo(() => t.name) ?? "trainer";
  const meName = enc => tryDo(() => enc.localizationKey) ?? tryDo(() => enc.constructor?.name) ?? null;

  // One wave, replayed. Runs inside the caller's `sandbox`; returns plain data, holding on to no game object.
  // The outer fork is the whole trick: `executeWithSeedOffset(fn, w, seed)` sows `shiftCharCodes(seed, w)` — exactly
  // what `resetSeed(w)` sows at the top of `newBattle` — and restores the live stream when it returns. `waveSeed` is
  // pinned to the previewed wave for the same span, because the game's own code reads it (the `new Battle` fork, and
  // anything else that forks on the wave seed).
  const replay = (s, w) => {
    const gm = s.gameMode;
    const notes = [];
    const built = []; // everything to destroy before returning
    const waveSeed = waveSeedOf(s.seed, w);
    const liveWaveSeed = s.waveSeed;
    s.waveSeed = waveSeed;
    try {
      return fork(s, w, s.seed, () => {
        const fixedCfg = tryDo(() => (gm.isFixedBattle(w) ? gm.getFixedBattle(w) : null));
        let type, trainer = null, forcedDouble, me = null;

        if (fixedCfg) {
          type = fixedCfg.battleType ?? TRAINER;
          forcedDouble = fixedCfg.double;
          trainer = typeof fixedCfg.getTrainer === "function"
            ? fork(s, (fixedCfg.seedOffsetWaveIndex || w) << 8, undefined, () => fixedCfg.getTrainer())
            : null;
          if (type === TRAINER && !trainer) notes.push("this fixed battle names no trainer");
        } else {
          type = gm.isWaveTrainer(w) ? TRAINER : WILD;
          if (s.isWaveMysteryEncounter(type, w)) {
            type = MYSTERY;
          } else if (type === TRAINER) {
            trainer = s.generateNewBattleTrainer(w);
          }
        }
        if (trainer) built.push(trainer);

        const double = !!s.checkIsDouble({ double: forcedDouble, battleType: type, waveIndex: w, trainer });
        // `new Battle` is the only way to get the enemy levels: `getLevelForWave` is a Battle method and draws.
        const battle = fork(s, w << 3, waveSeed,
          () => new (s.currentBattle.constructor)(gm, { waveIndex: w, battleType: type, trainer, double }));
        const levels = [...(battle.enemyLevels ?? [])];

        const foes = withBattle(s, battle, () => {
          if (type === MYSTERY) {
            me = fork(s, w * 16, undefined, () => s.getMysteryEncounter());
            return [];
          }
          // The `EncounterPhase` loop, in its order: each member is read into the party before the next is generated.
          // EncounterPhase.isEncounterShinyLocked: END biome under Endless or the Fresh Start challenge (4). It
          // changes the draw count — a locked spawn never calls `trySetShiny` — so the replay has to get it right.
          const shinyLock = s.arena?.biomeId === BIOME_END && (!!gm.isEndless || tryDo(() => gm.hasChallenge(4), false));
          return levels.map((level, e) => {
            let p;
            if (type === TRAINER) {
              p = trainer.genPartyMember(e);
            } else {
              let species = s.randomSpecies(w, level, true);
              // The Golden Bug Net's 10 % swap draws only when the player holds one, so the replay only draws then.
              if (hasBugNet(s) && !gm.isBoss(w) && s.arena?.biomeId !== BIOME_END && rnd(10) === 0) {
                notes.push("Golden Bug Net can swap this spawn");
              }
              p = s.addEnemyPokemon(species, level, SLOT_NONE, !!s.getEncounterBossSegments(w, level, species), shinyLock);
            }
            battle.enemyParty[e] = p;
            built.push(p);
            return foeOf(p);
      });
      });

      // `arena.pokemonPool` holds the species lists for *this* wave's time of day; the game rebuilds it when the
      // clock turns over, and a wild spawn read off the pool we hold is then a guess.
      const podShift = type === WILD && timeOfDayFor(s, w) !== timeOfDayFor(s, s.currentBattle?.waveIndex ?? w);
      if (podShift) notes.push("time of day turns over: the spawn pool shifts");
      return {
        wave: w, type: type === MYSTERY ? "me" : type === TRAINER ? "trainer" : "wild", fixed: !!fixedCfg,
        trainer: trainer ? { name: trainerName(trainer), double: tryDo(() => trainer.isDouble(), false) } : null,
        me: me ? { name: meName(me), tier: me.encounterTier ?? null } : null,
        double, levels, foes, boss: foes.some(f => f.segments > 1),
        tier: {
          // A fixed wave's kind is a table lookup; a generic wave's is the trainer-chance roll off the stream.
          type: fixedCfg ? TIER.exact : TIER.replay,
          trainer: !trainer ? null : fixedCfg ? TIER.exact : TIER.replay,
          // Every trainer member and the ME are forks of their own; a wild species rides the stream and the pool.
          foes: type === WILD ? (podShift ? TIER.estimate : TIER.replay) : TIER.exact,
          double: fixedCfg || type === TRAINER ? TIER.exact : TIER.replay,
          levels: TIER.exact,
        },
        notes,
      };
      });
    } finally {
      s.waveSeed = liveWaveSeed;
      for (const o of built) drop(o);
    }
  };

  // The player's Golden Bug Net, by the modifier's own class name (the game checks `BoostBugSpawnModifier`).
  const hasBugNet = s => (s.modifiers ?? []).some(m => m?.constructor?.name === "BoostBugSpawnModifier");
  // Arena.getTimeOfDay: ABYSS (24) is always night; otherwise (wave + waveCycleOffset) % 40.
  const timeOfDayFor = (s, w) => {
    if (w == null) return null;
    if (s.arena?.biomeId === 24) return 3;
    const c = (w + (s.waveCycleOffset ?? 0)) % 40;
    return c < 15 ? 1 : c < 20 ? 2 : c < 35 ? 3 : 0;
  };

  // ---- Accuracy, measured rather than claimed
  const FIELDS = ["type", "trainer", "foes", "double", "levels"];
  const stats = { checked: 0, hit: {}, miss: {}, last: null };
  for (const f of FIELDS) { stats.hit[f] = 0; stats.miss[f] = 0; }
  let predicted = null; // the last model handed out, kept until its wave arrives

  const speciesKey = foes => foes.map(f => f.name).sort().join(",");
  // Called every tick. When the predicted wave is the one being played and its enemy party is on the field, score
  // each field. A field that has ever missed is drawn with `?` from then on.
  const previewCheck = s => {
    const b = s?.currentBattle;
    if (!predicted || !b || b.waveIndex !== predicted.wave || predicted.scored) return;
    const party = tryDo(() => s.getEnemyParty(), []) ?? [];
    if (!party.length && !b.isBattleMysteryEncounter?.()) return;
    const actual = {
      type: b.isBattleMysteryEncounter?.() ? "me" : b.trainer ? "trainer" : "wild",
      trainer: b.trainer ? trainerName(b.trainer) : null,
      foes: speciesKey(party.map(foeOf)),
      double: !!b.double,
      levels: party.map(p => p.level).join(","),
    };
    const mine = {
      type: predicted.type, trainer: predicted.trainer?.name ?? null, foes: speciesKey(predicted.foes),
      double: predicted.double, levels: predicted.levels.join(","),
    };
    const wrong = [];
    for (const f of FIELDS) {
      if (f === "trainer" && mine.type !== "trainer") continue;
      if (f === "foes" && mine.type === "me") continue;
      if (String(mine[f]) === String(actual[f])) stats.hit[f]++;
      else { stats.miss[f]++; wrong.push(f); }
    }
    stats.checked++;
    if (wrong.length) stats.last = { wave: b.waveIndex, wrong, mine, actual };
    predicted.scored = true;
  };
  const previewStats = () => ({ ...stats, hit: { ...stats.hit }, miss: { ...stats.miss } });
  const everMissed = field => stats.miss[field] > 0;

  // ---- The model the card draws
  let cache = { key: null, value: null };
  const previewFor = (s, w) => {
    if (!s?.currentBattle || w == null || w < 1) return null;
    const missing = NEEDED.filter(k => typeof s[k] !== "function");
    if (missing.length || typeof s.gameMode?.isFixedBattle !== "function" || !s.seed) {
      return { kind: "preview", wave: w, unavailable: missing[0] ? `the live build has no ${missing[0]}` : "no run seed" };
    }
    // Everything the replay reads besides the seed: a catch, an evolution, a shop pick or a biome change re-rolls it.
    const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
    const key = JSON.stringify([s.seed, w, s.arena?.biomeId, s.waveCycleOffset, s.offsetGym,
      party.map(p => [p.species?.speciesId, p.level, p.luck]), (s.modifiers ?? []).length,
      (s.mysteryEncounterSaveData?.encounteredEvents ?? []).length, s.mysteryEncounterSaveData?.encounterSpawnChance]);
    if (cache.key === key) return cache.value;
    const value = tryDo(() => ({ kind: "preview", ...quiet(() => sandbox(s, () => replay(s, w))) }),
      { kind: "preview", wave: w, unavailable: "the replay threw" });
    // Measured, not claimed: a field this run has ever got wrong is listed here and the card marks it `?`.
    value.missed = FIELDS.filter(f => everMissed(f) && value.tier?.[f]);
    cache = { key, value };
    if (!value.unavailable) predicted = { ...value, scored: false };
    return value;
  };
  // The wave the player is about to walk into.
  const previewNext = s => previewFor(s, (s?.currentBattle?.waveIndex ?? 0) + 1);

  // Which of the next `n` waves hold a fixed battle (rival, evil team, gym, Elite Four, Eternatus). No RNG: the
  // schedule is the game mode's own table plus the gym rule. #68 turns this into the look-ahead card.
  const fixedAhead = (s, from, n = 20) => {
    const gm = s?.gameMode;
    if (typeof gm?.isFixedBattle !== "function") return [];
    const out = [];
    for (let w = from; w < from + n; w++) {
      const gym = w % 30 === (s.offsetGym ? 0 : 20) && !tryDo(() => gm.isWaveFinal(w), false);
      if (tryDo(() => gm.isFixedBattle(w), false)) out.push({ wave: w, kind: "fixed" });
      else if (gym) out.push({ wave: w, kind: "gym" });
    }
    return out;
  };

  return { previewFor, previewNext, previewCheck, previewStats, fixedAhead };
})();
