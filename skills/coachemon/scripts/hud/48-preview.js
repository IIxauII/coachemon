// A wave ahead, replayed with the game's own calls in the game's own order inside a seed fork: a read, never a draw on
// the live stream (game-code.md §11).
import { TYPES, iconOf, typesOf } from "./01-core.js";
import { arenaRebuiltBetween, hasTrainers, isGruntWave, kindIsRolled } from "./03-calendar.js";
import { gameEvents } from "./04-game-tables.js";
import { isCoverage, partyLuck } from "./08-party.js";
import { blockedByHealBlock } from "./40-learn.js";
import { spawnTimeOfDay } from "./47-biome.js";

const WILD = BattleType.WILD, TRAINER = BattleType.TRAINER, MYSTERY = BattleType.MYSTERY_ENCOUNTER;
const CONFIDENCE = { exact: "exact", replay: "replay", estimate: "estimate" };
const RANK = [CONFIDENCE.exact, CONFIDENCE.replay, CONFIDENCE.estimate];
const weakest = (...cs) => RANK[Math.max(...cs.filter(Boolean).map(c => RANK.indexOf(c)))];
const NEEDED = ["executeWithSeedOffset", "isWaveMysteryEncounter", "generateNewBattleTrainer", "checkIsDouble",
  "getEncounterBossSegments", "addEnemyPokemon", "getMysteryEncounter"];
// The scene's wrapper first: the arena's method called with the scene's arguments is a different draw
// (game-code.md §11).
const wildSpecies = (s, w, level, party) => (typeof s.randomSpecies === "function"
  ? s.randomSpecies(w, level, true)
  : s.arena.randomSpecies(w, level, 0, partyLuck(party, s, gameEvents())));
const hasSpeciesRoll = s => typeof s.randomSpecies === "function" || typeof s.arena?.randomSpecies === "function";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
// `randSeedInt`, re-implemented (game-code.md §11).
const rnd = range => (range <= 1 ? 0 : Phaser.Math.RND.integerInRange(0, range - 1));
// `shiftCharCodes`, re-implemented (game-code.md §11). Not `scene.waveSeed`: that is the current wave's.
const waveSeedOf = (seed, w) => [...String(seed)].map(c => String.fromCharCode(c.charCodeAt(0) + w)).join("");

const fork = (s, offset, seedOverride, fn) => {
  let out = null;
  s.executeWithSeedOffset(() => { out = fn(); }, offset, seedOverride);
  return out;
};
const quiet = fn => {
  const { log, warn, info } = console;
  console.log = console.warn = console.info = () => {};
  try { return fn(); } finally { Object.assign(console, { log, warn, info }); }
};
// `genPartyMember` reads the wave, the levels and the party so far off `currentBattle`, and the `EnemyPokemon`
// constructor the wave and the party's length (game-code.md §11).
const withBattle = (s, battle, fn) => {
  const live = s.currentBattle;
  s.currentBattle = battle;
  try { return fn(); } finally { s.currentBattle = live; }
};
const drop = o => { try { o?.destroy?.(); } catch {} };

const foeOf = p => foeData(p, (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getMove())).filter(Boolean));
const foeData = (p, moves) => {
  const attacks = moves.filter(isCoverage).map(mv => TYPES[mv.type]).filter(Boolean);
  return {
    name: p.name ?? tryDo(() => p.species.name, "?"),
    icon: iconOf(p),
    level: p.level ?? null,
    types: tryDo(() => typesOf(p), []),
    ability: tryDo(() => p.getAbility()?.name),
    passive: p.hasPassive?.() ? tryDo(() => p.getPassiveAbility()?.name) : null,
    hp: tryDo(() => p.getMaxHp()),
    // Atk, Def, SpA, SpD, Spe: no HP.
    stats: tryDo(() => [Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD].map(i => p.getStat(i))),
    segments: p.bossSegments ?? 0,
    shiny: !!p.shiny,
    moves: (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getName())).filter(Boolean),
    // One entry per attacking move, repeats kept, so a share of it is a share of the moveset (#266).
    attackTypes: attacks,
    statusMoves: moves.filter(mv => mv.category === MoveCategory.STATUS).map(moveLabel),
    healMoves: moves.filter(blockedByHealBlock).map(moveLabel),
  };
};
const moveLabel = mv => String(mv.name ?? "?").replace(/ \(N\)$/, "");

const trainerName = t => tryDo(() => t.getName(TrainerSlot.NONE, true)) ?? tryDo(() => t.name) ?? "trainer";
const meName = enc => tryDo(() => enc.localizationKey) ?? tryDo(() => enc.constructor?.name) ?? null;

// Runs inside the caller's `sandbox`, and returns plain data holding no game object.
const replay = (s, w, playerParty) => {
  const gm = s.gameMode;
  const notes = [];
  const built = [];
  const waveSeed = waveSeedOf(s.seed, w);
  const liveWaveSeed = s.waveSeed;
  s.waveSeed = waveSeed;
  try {
    return fork(s, w, s.seed, () => {
      const fixedCfg = tryDo(() => (gm.isFixedBattle(w) ? gm.getFixedBattle(w) : null));
      let type, trainer = null, forcedDouble, me = null;
      // A grunt's double is `Math.random`, unseeded (game-code.md §12).
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
        // A mode without trainers never asks `isWaveTrainer` (game-code.md §11). Asking anyway built a trainer on a
        // gym-calendar wave and elsewhere spent a draw the game doesn't, shifting the wild double roll and the species
        // after it (#179).
        type = hasTrainers(s) && gm.isWaveTrainer(w) ? TRAINER : WILD;
        if (s.isWaveMysteryEncounter(type, w)) {
          type = MYSTERY;
        } else if (type === TRAINER) {
          trainer = s.generateNewBattleTrainer(w);
        }
      }
      if (trainer) built.push(trainer);

      const double = !!s.checkIsDouble({ double: forcedDouble, battleType: type, waveIndex: w, trainer });
      const battle = fork(s, w << 3, waveSeed,
        () => new (s.currentBattle.constructor)(gm, { waveIndex: w, battleType: type, trainer, double }));
      const levels = [...(battle.enemyLevels ?? [])];

      const foes = withBattle(s, battle, () => {
        if (type === MYSTERY) {
          me = fork(s, w * 16, undefined, () => s.getMysteryEncounter());
          return [];
        }
        // `isEncounterShinyLocked`, re-implemented (game-code.md §11).
        const shinyLock = s.arena?.biomeId === BiomeId.END && (!!gm.isEndless || tryDo(() => gm.hasChallenge(Challenges.FRESH_START), false));
        return levels.map((level, e) => {
          let p;
          if (type === TRAINER) {
            p = trainer.genPartyMember(e);
          } else {
            let species = wildSpecies(s, w, level, playerParty);
            if (hasBugNet(s) && !gm.isBoss(w) && s.arena?.biomeId !== BiomeId.END && rnd(10) === 0) {
              notes.push("Golden Bug Net can swap this spawn");
            }
            p = s.addEnemyPokemon(species, level, TrainerSlot.NONE, !!s.getEncounterBossSegments(w, level, species), shinyLock);
          }
          // Each member joins the party before the next is generated, which reads it (game-code.md §11).
          battle.enemyParty[e] = p;
          built.push(p);
          return foeOf(p);
        });
      });

      // The pool rebuilds with a new arena and at X5, not when the clock turns (game-code.md §10): read per wave, this
      // called a shift four waves early and missed the one at X5 (#179).
      const biomeId = s.arena?.biomeId;
      const here = s.currentBattle?.waveIndex ?? w;
      const todShift = spawnTimeOfDay(s, w, biomeId) !== spawnTimeOfDay(s, here, biomeId);
      const biomeShift = arenaRebuiltBetween(here, w);
      const podShift = type === WILD && (todShift || biomeShift);
      if (podShift) notes.push(biomeShift ? "the next biome brings its own spawn pool" : "time of day turns over: the spawn pool shifts");
      return {
        wave: w, type: type === MYSTERY ? "me" : type === TRAINER ? "trainer" : "wild", fixed: !!fixedCfg,
        trainer: trainer ? { name: trainerName(trainer), double: tryDo(() => trainer.isDouble(), false) } : null,
        me: me ? { name: meName(me), tier: me.encounterTier ?? null } : null,
        double, levels, foes, boss: foes.some(f => f.segments > 1),
        confidence: (() => {
          const kind = kindIsRolled(s, w) ? CONFIDENCE.replay : CONFIDENCE.exact;
          const who = !trainer ? null : weakest(kind, fixedCfg ? CONFIDENCE.exact : CONFIDENCE.replay);
          const dbl = gruntDouble ? CONFIDENCE.estimate
            : type === WILD ? weakest(kind, CONFIDENCE.replay) : weakest(kind, who);
          // A fork is exact about its own roll, not about its inputs: a trainer's members are keyed on the trainer,
          // and the levels' fork on the type, the trainer and the double (game-code.md §11).
          const foesOwn = type === WILD ? (podShift ? CONFIDENCE.estimate : CONFIDENCE.replay) : CONFIDENCE.exact;
          return {
            type: kind,
            trainer: who,
            foes: weakest(kind, who, foesOwn),
            double: dbl,
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

const hasBugNet = s => (s.modifiers ?? []).some(m => m?.constructor?.name === "BoostBugSpawnModifier");

const FIELDS = ["type", "trainer", "foes", "double", "levels"];
const stats = { checked: 0, hit: {}, miss: {}, last: null };
for (const f of FIELDS) { stats.hit[f] = 0; stats.miss[f] = 0; }
let predicted = null;
// Only the next wave's model: one armed for a fight further out is scored against the wrong battle and marks honest
// fields `!`.
export const previewArm = value => { if (value && !value.unavailable) predicted = { ...value, scored: false }; };

const speciesKey = foes => foes.map(f => f.name).sort().join(",");
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

// Memoised by the wave alone, so every other input the replay reads must be in the run key. A replay that throws
// comes back as the run read's `{ unavailable }`.
export const previewFor = (run, w) => {
  const s = run.scene;
  if (!s?.currentBattle || w == null || w < 1) return null;
  const missing = NEEDED.filter(k => typeof s[k] !== "function");
  if (!hasSpeciesRoll(s)) missing.push("randomSpecies");
  if (missing.length || typeof s.gameMode?.isFixedBattle !== "function" || !s.seed) {
    return { kind: "preview", wave: w, unavailable: missing[0] ? `the live build has no ${missing[0]}` : "no run seed" };
  }
  const value = run.memo("preview", w, () => {
    const model = { kind: "preview", ...quiet(() => replay(s, w, run.facts.party)) };
    model.missed = FIELDS.filter(f => everMissed(f) && model.confidence?.[f]);
    return model;
  });
  return value.kind ? value : { kind: "preview", wave: w, unavailable: value.unavailable };
};
export const previewNext = run => previewFor(run, run.facts.wave + 1);

const PREVIEW_MARK = { exact: "", replay: "~", estimate: "?" };
export const previewMark = (m, field) => (m.missed?.includes(field) ? "!" : PREVIEW_MARK[m.confidence?.[field]] ?? "");
// A fixed battle is named in a word, not `★`: on the panel that means the pick (#349).
export const previewKind = m => (m.type === "me" ? "mystery" : m.fixed ? `fixed ${m.type}` : m.type);
const previewFoes = (m, long) => {
  if (!m.foes?.length) return m.me?.name ? m.me.name : "—";
  if (long || m.foes.length <= 2) return m.foes.map(f => `${f.name} L${f.level}`).join(", ");
  const lv = m.foes.map(f => f.level);
  return `${m.foes.length} mons L${Math.min(...lv)}–${Math.max(...lv)}`;
};

export const previewSummary = m => {
  if (!m || m.unavailable) return null;
  const who = m.trainer ? ` ${m.trainer.name}` : "";
  const marks = [...new Set(["type", "trainer", "foes", "double"].map(f => previewMark(m, f)).filter(Boolean))].join("");
  return `W${m.wave} ${previewKind(m)}${who}${m.double ? " (double)" : ""} — ${previewFoes(m, true)}${marks ? ` [${marks}]` : ""}`;
};
