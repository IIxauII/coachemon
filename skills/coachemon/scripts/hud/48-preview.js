// Next-wave preview: what the run seed has already decided about the wave ahead — wild or trainer, which trainer and
// its exact party, single or double, the levels, the boss bars, or a Mystery Encounter and which one.
//
// ---- How the game decides (read from the pinned source, v1.12.0.11; every method it calls is on the #69 drift list)
// `BattleScene.newBattle()` sows a fresh stream at its top — `resetSeed(w)` does `RND.sow([shiftCharCodes(seed, w)])`
// — and then draws in a fixed order:
//   1. `gameMode.isWaveTrainer(w)`     the trainer-chance roll, and only when `gameMode.hasTrainers` (Endless never
//                                      asks: every non-fixed wave there is wild). Its look-back loop is a fork per
//                                      wave, so it doesn't move the stream; a gym wave, an X0, an X1, a Daily wave
//                                      and a blocked one draw nothing — the rules are 03-calendar.js's
//   2. `isWaveMysteryEncounter(...)`   the ME roll, in a fork at `w * 3000`
//   3. `generateNewBattleTrainer(w)`   the trainer's pool tier and type, then its double and variant rolls
//   4. `checkIsDouble(...)`            the wild double roll
//   5. `new Battle(...)`               in a fork at `w << 3` on the wave seed: the enemy levels
// A fixed wave replaces 1–3 with `getFixedBattle(w).getTrainer()` in a fork at `(seedOffsetWaveIndex || w) << 8`.
// The enemy party is built later, in `EncounterPhase`: a trainer's members each in their own fork
// (`waveIndex + (type << 10) + ((index + 1) << 8)`, or `type + ((index + 1) << 8)` for a static party), a wild
// species straight off the stream through the scene's own `randomSpecies` wrapper.
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
// ---- What is exact and what is a guess (`confidence` per field; `tier` in this file is only ever the game's own
// word for an encounter's rarity)
// - `exact`    decided in a fork whose seed and offset don't depend on where the stream is: the fixed-battle trainer,
//              its party members, the enemy levels, the ME roll and which ME, the boss-bar count.
// - `replay`   right only as long as the game draws nothing between `resetSeed(w)` and that point that this replay
//              doesn't: a generic wave's kind, a generic trainer's identity, the wild double roll, the wild species.
// - `estimate` the arena's species pool is the one it last built, and it rebuilds on entering a biome and again at
//              X5; when the wave ahead falls the other side of a rebuild, the pool it draws from isn't the pool we
//              hold. Also an evil-team grunt's double, which comes off `Math.random` and is nobody's to replay.
// **A field is never surer than what it derives from.** A fork is exact about its own roll, not about its inputs: a
// generic trainer's party members are each their own fork, but the fork is keyed on the trainer the stream picked, so
// a party is only as sure as the trainer, and a trainer only as sure as the wave's kind. `weakest` enforces that, and
// it is why only a fixed wave — whose trainer is a table lookup — reads `exact` end to end.
// Each field is also conditional on the live inputs not moving before the wave starts: a catch, an evolution, a shop
// pick or a biome change re-rolls what depends on the party, the luck value or the biome, which is what the card's
// standing "if nothing changes" line says. Nothing here is promised: `previewCheck` scores every field against the
// wave when it actually arrives, a field that has ever been wrong is shown with `!`, and `window.__coachHud.preview()`
// prints the tally.
import { TYPES, iconOf, sandbox, typesOf } from "./01-core.js";
import { arenaRebuiltBetween, hasTrainers, isGruntWave, kindIsRolled } from "./03-calendar.js";
import { partyLuck } from "./08-party.js";
import { blockedByHealBlock } from "./40-learn.js";
import { gameEvents, spawnTimeOfDay } from "./47-biome.js";

const WILD = BattleType.WILD, TRAINER = BattleType.TRAINER, MYSTERY = BattleType.MYSTERY_ENCOUNTER;
const CONFIDENCE = { exact: "exact", replay: "replay", estimate: "estimate" };
// Weakest wins, so a field can be capped by whatever it derives from. Order: exact > replay > estimate.
const RANK = [CONFIDENCE.exact, CONFIDENCE.replay, CONFIDENCE.estimate];
const weakest = (...cs) => RANK[Math.max(...cs.filter(Boolean).map(c => RANK.indexOf(c)))];
// The scene methods the replay calls. Missing one means the live build moved past the pin: the card says so
// instead of guessing.
const NEEDED = ["executeWithSeedOffset", "isWaveMysteryEncounter", "generateNewBattleTrainer", "checkIsDouble",
  "getEncounterBossSegments", "addEnemyPokemon", "getMysteryEncounter"];
// The wild spawn. `EncounterPhase` calls **`globalScene.randomSpecies(w, level, true)`** — the scene wrapper, whose
// `fromArenaPool` branch is `arena.randomSpecies(w, level, 0, getPartyLuckValue(party))`. Calling the arena method
// directly with the scene's argument list is a different draw: `true` lands in `attempt`, and the luck that shifts
// the tier thresholds is lost. So take the wrapper when the live build has it, and reproduce what it does when it
// doesn't. Guessing the receiver wrong is not a wrong answer but a silent one — the `NEEDED` gate would make the
// card unavailable on every wild wave — so the fallback is by feature, not by assumption.
const wildSpecies = (s, w, level, party) => (typeof s.randomSpecies === "function"
  ? s.randomSpecies(w, level, true)
  : s.arena.randomSpecies(w, level, 0, partyLuck(party, s, gameEvents())));
const hasSpeciesRoll = s => typeof s.randomSpecies === "function" || typeof s.arena?.randomSpecies === "function";

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

const foeOf = p => foeData(p, (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getMove())).filter(Boolean));
const foeData = (p, moves) => ({
  name: p.name ?? tryDo(() => p.species.name, "?"),
  icon: iconOf(p),
  level: p.level ?? null,
  types: tryDo(() => typesOf(p), []),
  ability: tryDo(() => p.getAbility()?.name),
  passive: p.hasPassive?.() ? tryDo(() => p.getPassiveAbility()?.name) : null,
  hp: tryDo(() => p.getMaxHp()),
  // Atk, Def, SpA, SpD, Spe — the same slots as `stat()` in 01-core.
  stats: tryDo(() => [Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD].map(i => p.getStat(i))),
  segments: p.bossSegments ?? 0,
  shiny: !!p.shiny,
  moves: (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getName())).filter(Boolean),
  // The types it can actually attack with: 49-ahead reads these to judge what the party is walking into.
  moveTypes: [...new Set(moves.filter(mv => mv.category !== MoveCategory.STATUS && mv.power > 0).map(mv => TYPES[mv.type]).filter(Boolean))],
  // What a disrupting move would take away from it (40-learn's roster fit): the status moves Taunt stops and
  // Encore locks it into, and the heals Heal Block stops.
  statusMoves: moves.filter(mv => mv.category === MoveCategory.STATUS).map(moveLabel),
  healMoves: moves.filter(blockedByHealBlock).map(moveLabel),
});
const moveLabel = mv => String(mv.name ?? "?").replace(/ \(N\)$/, "");

const trainerName = t => tryDo(() => t.getName(TrainerSlot.NONE, true)) ?? tryDo(() => t.name) ?? "trainer";
const meName = enc => tryDo(() => enc.localizationKey) ?? tryDo(() => enc.constructor?.name) ?? null;

// One wave, replayed. Runs inside the caller's `sandbox`; returns plain data, holding on to no game object.
// The outer fork is the whole trick: `executeWithSeedOffset(fn, w, seed)` sows `shiftCharCodes(seed, w)` — exactly
// what `resetSeed(w)` sows at the top of `newBattle` — and restores the live stream when it returns. `waveSeed` is
// pinned to the previewed wave for the same span, because the game's own code reads it (the `new Battle` fork, and
// anything else that forks on the wave seed).
const replay = (s, w, playerParty) => {
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
      // A fixed battle whose config pins `double` says so; a grunt wave that doesn't takes it from an unseeded roll
      // on `Math.random` (`isGruntWave`, 03-calendar.js), which nothing here or in the run seed can reach.
      const gruntDouble = !!fixedCfg && fixedCfg.double == null && isGruntWave(w);
      if (gruntDouble) notes.push("this grunt's double is an unseeded roll: it can't be read ahead");

      if (fixedCfg) {
        type = fixedCfg.battleType ?? TRAINER;
        forcedDouble = fixedCfg.double;
        trainer = typeof fixedCfg.getTrainer === "function"
          ? fork(s, (fixedCfg.seedOffsetWaveIndex || w) << 8, undefined, () => fixedCfg.getTrainer())
          : null;
        if (type === TRAINER && !trainer) notes.push("this fixed battle names no trainer");
      } else {
        // `handleNonFixedBattle` asks `isWaveTrainer` **only when the mode has trainers**: in Endless and Spliced
        // Endless every non-fixed wave is wild, and the trainer-chance roll is never made. Asking anyway built a
        // trainer on a gym-calendar wave and, on every other wave, spent a draw the game doesn't — which shifts the
        // wild double roll and the species after it.
        type = hasTrainers(s) && gm.isWaveTrainer(w) ? TRAINER : WILD;
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
        // EncounterPhase.isEncounterShinyLocked: END biome under Endless or the Fresh Start challenge. It
        // changes the draw count — a locked spawn never calls `trySetShiny` — so the replay has to get it right.
        const shinyLock = s.arena?.biomeId === BiomeId.END && (!!gm.isEndless || tryDo(() => gm.hasChallenge(Challenges.FRESH_START), false));
        return levels.map((level, e) => {
          let p;
          if (type === TRAINER) {
            p = trainer.genPartyMember(e);
          } else {
            let species = wildSpecies(s, w, level, playerParty);
            // The Golden Bug Net's 10 % swap draws only when the player holds one, so the replay only draws then.
            if (hasBugNet(s) && !gm.isBoss(w) && s.arena?.biomeId !== BiomeId.END && rnd(10) === 0) {
              notes.push("Golden Bug Net can swap this spawn");
            }
            p = s.addEnemyPokemon(species, level, TrainerSlot.NONE, !!s.getEncounterBossSegments(w, level, species), shinyLock);
          }
          battle.enemyParty[e] = p;
          built.push(p);
          return foeOf(p);
        });
      });

      // `arena.pokemonPool` is rebuilt only when the arena is built and as a wave X5 starts (47-biome's
      // `spawnTimeOfDay` on the calendar's `poolAnchorWave`), so what matters is not whether the *clock* turns over
      // between here and the wave ahead but whether the **pool** is rebuilt before it: X1–X4 draw from the X0's pool
      // and X5–X9 from X5's. Read per wave, this called a shift four waves early and missed the one at X5.
      // Two ways the pool we hold isn't the pool the wave ahead draws from, and both are a guess:
      const biomeId = s.arena?.biomeId;
      const here = s.currentBattle?.waveIndex ?? w;
      const todShift = spawnTimeOfDay(s, w, biomeId) !== spawnTimeOfDay(s, here, biomeId);
      // …and the bigger one: a new biome is a **new arena**, built with that biome's own pools. The player picks it
      // at the X0 this replay is standing on, so a preview of the X1 after it is reading the biome being left.
      const biomeShift = arenaRebuiltBetween(here, w);
      const podShift = type === WILD && (todShift || biomeShift);
      if (podShift) notes.push(biomeShift ? "the next biome brings its own spawn pool" : "time of day turns over: the spawn pool shifts");
      return {
        wave: w, type: type === MYSTERY ? "me" : type === TRAINER ? "trainer" : "wild", fixed: !!fixedCfg,
        trainer: trainer ? { name: trainerName(trainer), double: tryDo(() => trainer.isDouble(), false) } : null,
        me: me ? { name: meName(me), tier: me.encounterTier ?? null } : null,
        double, levels, foes, boss: foes.some(f => f.segments > 1),
        confidence: (() => {
          // Whether the wave's kind costs a draw at all is the run calendar's one rule (`kindIsRolled`): a fixed
          // battle, a gym wave, an X0 or X1, a Daily calendar wave, a mode without trainers and a wave the look-back
          // blocks are all settled without touching the stream. Only a wave that really rolls `1/trainerChance` is
          // `replay`, and every field below inherits that through `weakest`.
          const kind = kindIsRolled(s, w) ? CONFIDENCE.replay : CONFIDENCE.exact;
          // A fixed trainer comes with the table entry; every other trainer's identity is drawn on the stream.
          const who = !trainer ? null : weakest(kind, fixedCfg ? CONFIDENCE.exact : CONFIDENCE.replay);
          // A trainer's double is its variant, settled when the trainer was; a wild one is its own roll on the
          // stream. An evil-team grunt is the exception: `getRandomTrainerFunc` gives it a double on `randInt(3)`,
          // which is `Math.random` — unseeded, so no replay reaches it and the next run of this same wave answers
          // differently. That is a guess, not a replay.
          const dbl = gruntDouble ? CONFIDENCE.estimate
            : type === WILD ? weakest(kind, CONFIDENCE.replay) : weakest(kind, who);
          // Each trainer member is a fork of its own — but one keyed on the trainer, so never surer than the trainer.
          // A wild species rides the stream, off a pool that is only the wave ahead's while the arena doesn't
          // rebuild it in between.
          const foesOwn = type === WILD ? (podShift ? CONFIDENCE.estimate : CONFIDENCE.replay) : CONFIDENCE.exact;
          return {
            type: kind,
            trainer: who,
            foes: weakest(kind, who, foesOwn),
            double: dbl,
            // The `w << 3` fork is exact about its own roll, but it is fed the battle type, the trainer and the double.
            levels: weakest(kind, who, dbl),
          };
        })(),
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

// ---- Accuracy, measured rather than claimed
const FIELDS = ["type", "trainer", "foes", "double", "levels"];
const stats = { checked: 0, hit: {}, miss: {}, last: null };
for (const f of FIELDS) { stats.hit[f] = 0; stats.miss[f] = 0; }
let predicted = null; // the last model handed out, kept until its wave arrives

const speciesKey = foes => foes.map(f => f.name).sort().join(",");
// Called every tick. When the predicted wave is the one being played and its enemy party is on the field, score
// each field. A field that has ever missed is drawn with `?` from then on.
export const previewCheck = s => {
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
export const previewStats = () => ({ ...stats, hit: { ...stats.hit }, miss: { ...stats.miss } });
const everMissed = field => stats.miss[field] > 0;

// ---- The model the card draws
// Keyed by wave *and* by every input the replay reads, and a few waves deep: 49-ahead asks for the next big fight
// in the same tick that the card asks for the next wave, and a one-slot cache would replay both every second.
const CACHE_MAX = 6;
const cache = new Map();
export const previewFor = (s, w) => {
  if (!s?.currentBattle || w == null || w < 1) return null;
  const missing = NEEDED.filter(k => typeof s[k] !== "function");
  if (!hasSpeciesRoll(s)) missing.push("randomSpecies");
  if (missing.length || typeof s.gameMode?.isFixedBattle !== "function" || !s.seed) {
    return { kind: "preview", wave: w, unavailable: missing[0] ? `the live build has no ${missing[0]}` : "no run seed" };
  }
  // Everything the replay reads besides the seed: a catch, an evolution, a shop pick or a biome change re-rolls it.
  const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
  const key = JSON.stringify([s.seed, w, s.arena?.biomeId, s.waveCycleOffset, s.offsetGym,
    party.map(p => [p.species?.speciesId, p.level, p.luck]), (s.modifiers ?? []).length,
    (s.mysteryEncounterSaveData?.encounteredEvents ?? []).length, s.mysteryEncounterSaveData?.encounterSpawnChance]);
  const hit = cache.get(key);
  if (hit) return hit;
  const value = tryDo(() => ({ kind: "preview", ...quiet(() => sandbox(s, () => replay(s, w, party))) }),
    { kind: "preview", wave: w, unavailable: "the replay threw" });
  // Measured, not claimed: a field this run has ever got wrong is listed here and the card marks it `?`.
  value.missed = FIELDS.filter(f => everMissed(f) && value.confidence?.[f]);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  // Only the wave actually being walked into is scored on arrival. A look-ahead to a fight ten waves out is never
  // the next wave, so handing it to the tally would score it against the wrong battle and mark honest fields `!`.
  if (!value.unavailable && w === (s.currentBattle?.waveIndex ?? 0) + 1) predicted = { ...value, scored: false };
  return value;
};
// The wave the player is about to walk into.
export const previewNext = s => previewFor(s, (s?.currentBattle?.waveIndex ?? 0) + 1);

// ---- How the card and its one-line summary word a field, and how sure the replay is of it.
// A field the preview can't pin is marked: `~` it holds only while the game draws what this replay draws, `?` it is
// a guess, `!` it has already been wrong once this run.
const PREVIEW_MARK = { exact: "", replay: "~", estimate: "?" };
export const previewMark = (m, field) => (m.missed?.includes(field) ? "!" : PREVIEW_MARK[m.confidence?.[field]] ?? "");
export const previewKind = m => (m.type === "me" ? "mystery" : m.fixed ? `★ ${m.type}` : m.type);
// `Machop L9, Geodude L10`, or `2 mons L9–10` when there are too many to name.
export const previewFoes = (m, long) => {
  if (!m.foes?.length) return m.me?.name ? m.me.name : "—";
  if (long || m.foes.length <= 2) return m.foes.map(f => `${f.name} L${f.level}`).join(", ");
  const lv = m.foes.map(f => f.level);
  return `${m.foes.length} mons L${Math.min(...lv)}–${Math.max(...lv)}`;
};

// `W13 trainer Youngster Ben (double) — Machop L9, Geodude L10`, for the watcher and the battle read.
export const previewSummary = m => {
  if (!m || m.unavailable) return null;
  const who = m.trainer ? ` ${m.trainer.name}` : "";
  const marks = [...new Set(["type", "trainer", "foes", "double"].map(f => previewMark(m, f)).filter(Boolean))].join("");
  return `W${m.wave} ${previewKind(m)}${who}${m.double ? " (double)" : ""} — ${previewFoes(m, true)}${marks ? ` [${marks}]` : ""}`;
};
