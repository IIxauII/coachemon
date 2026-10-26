// A wave ahead, replayed with the game's own calls in the game's own order inside a seed fork: a read, never a draw on
// the live stream (game-code.md §11).
import { TYPES, iconOf, typesOf, weakestConfidence } from "./01-core.js";
import { arenaRebuiltBetween, hasTrainers, isGruntWave, kindIsRolled, waveKind } from "./03-calendar.js";
import { gameEvents } from "./04-game-tables.js";
import { isCoverage, partyLuck } from "./08-party.js";
import { blockedByHealBlock } from "./40-learn.js";
import { spawnTimeOfDay } from "./47-biome.js";

const WILD = BattleType.WILD, TRAINER = BattleType.TRAINER, MYSTERY = BattleType.MYSTERY_ENCOUNTER;
const CONFIDENCE = { exact: "exact", replay: "replay", estimate: "estimate" };
// @mirrors needed
const NEEDED = ["executeWithSeedOffset", "isWaveMysteryEncounter", "generateNewBattleTrainer", "checkIsDouble",
  "getEncounterBossSegments", "addEnemyPokemon", "getMysteryEncounter"];
// The scene's wrapper first: the arena's method called with the scene's arguments is a different draw
// (game-code.md §11). Checked by feature rather than listed in `NEEDED`, which would drop the arena fallback.
const wildSpecies = (s, w, level, party) => (typeof s.randomSpecies === "function"
  ? s.randomSpecies(w, level, true)
  : s.arena.randomSpecies(w, level, 0, partyLuck(party, s, gameEvents())));
const hasSpeciesRoll = s => typeof s.randomSpecies === "function" || typeof s.arena?.randomSpecies === "function";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
// `randSeedInt`, re-implemented (game-code.md §11).
// @mirrors rand-seed-int
const rnd = range => (range <= 1 ? 0 : Phaser.Math.RND.integerInRange(0, range - 1));
// `shiftCharCodes`, re-implemented (game-code.md §11). Not `scene.waveSeed`: that is the current wave's.
// @mirrors wave-seed-of
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
// The replay's calls read the battle off `currentBattle` (game-code.md §11). `fn` must be synchronous: the live
// battle is back the moment it returns.
const withBattle = (s, battle, fn) => {
  const live = s.currentBattle;
  s.currentBattle = battle;
  try { return fn(); } finally { s.currentBattle = live; }
};
// The battle `newBattle` runs under (game-code.md §11, §12): built under the live one instead, an evil team read from
// further out fielded the wrong party (#622).
const battleBefore = (s, w) => Object.create(s.currentBattle, { waveIndex: { value: w - 1 } });
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
    // The `Stat`-indexed row a combatant is rebuilt from whole, this row carrying no species to compute one from.
    // `Stat.HP`'s entry is `getMaxHp`, which is what answers it (game-code.md §24).
    stats: tryDo(() => [Stat.HP, Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD]
      .map(i => (i === Stat.HP ? p.getMaxHp() : p.getStat(i)))),
    segments: p.bossSegments ?? 0,
    shiny: !!p.shiny,
    moves: (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getName())).filter(Boolean),
    // The ids behind those names, which no display name can be turned back into: a combatant's moveset is built from
    // move ids, so a row with names alone leaves a previewed foe nothing to attack with.
    moveIds: (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.moveId ?? m.getMove()?.id)).filter(id => id != null),
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
// @mirrors new-battle-replay
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
      let me = null;
      // A grunt's double is `Math.random`, unseeded (game-code.md §12).
      const gruntDouble = !!fixedCfg && fixedCfg.double == null && isGruntWave(w);
      if (gruntDouble) notes.push("this grunt's double is an unseeded roll: it can't be read ahead");

      const { type, trainer, double, battle } = withBattle(s, battleBefore(s, w), () => {
        let type, trainer = null, forcedDouble;
        if (fixedCfg) {
          type = fixedCfg.battleType ?? TRAINER;
          forcedDouble = fixedCfg.double;
          trainer = typeof fixedCfg.getTrainer === "function"
            ? fork(s, (fixedCfg.seedOffsetWaveIndex || w) << 8, undefined, () => fixedCfg.getTrainer())
            : null;
          if (type === TRAINER && !trainer) notes.push("this fixed battle names no trainer");
        } else {
          // A mode without trainers never asks `isWaveTrainer` (game-code.md §11). Asking anyway built a trainer on a
          // gym-calendar wave and elsewhere spent a draw the game doesn't, shifting the wild double roll and the
          // species after it (#179).
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
        return { type, trainer, double, battle };
      });
      const battleLevels = [...(battle.enemyLevels ?? [])];

      const foes = withBattle(s, battle, () => {
        if (type === MYSTERY) {
          me = fork(s, w * 16, undefined, () => s.getMysteryEncounter());
          return [];
        }
        // `isEncounterShinyLocked`, re-implemented (game-code.md §11).
        const shinyLock = s.arena?.biomeId === BiomeId.END && (!!gm.isEndless || tryDo(() => gm.hasChallenge(Challenges.FRESH_START), false));
        return battleLevels.map((level, e) => {
          let p;
          if (type === TRAINER) {
            p = trainer.genPartyMember(e);
            // A trainer's member can be re-levelled or re-formed once built, its stats still the old ones (game-code.md
            // §11).
            tryDo(() => p.calculateStats());
          } else {
            let species = wildSpecies(s, w, level, playerParty);
            // The Golden Bug Net's draw (game-code.md §11): its roll only names a note, but skipping it desyncs the
            // stream.
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
      // A gym leader or a wild boss read on the X0 before it is replayed off the arena the run is leaving, not its own
      // (game-code.md §10, #590).
      const leftBehind = biomeShift && ["gym", "boss"].includes(waveKind(s, w));
      if (leftBehind && trainer) notes.push("the next biome brings its own gym leader");
      return {
        wave: w, type: type === MYSTERY ? "me" : type === TRAINER ? "trainer" : "wild", fixed: !!fixedCfg,
        trainer: trainer ? { name: trainerName(trainer), double: tryDo(() => trainer.isDouble(), false) } : null,
        me: me ? { name: meName(me), tier: me.encounterTier ?? null } : null,
        // The battle's levels predate a rival member's re-levelling: read off them, the rival's fight 2 previewed a 16
        // as a 14 (#621).
        double, levels: type === MYSTERY ? battleLevels : foes.map(f => f.level), foes, boss: foes.some(f => f.segments > 1),
        confidence: (() => {
          const kind = kindIsRolled(s, w) ? CONFIDENCE.replay : CONFIDENCE.exact;
          const who = !trainer ? null
            : leftBehind ? CONFIDENCE.estimate : weakestConfidence(kind, fixedCfg ? CONFIDENCE.exact : CONFIDENCE.replay);
          const dbl = gruntDouble || leftBehind ? CONFIDENCE.estimate
            : type === WILD ? weakestConfidence(kind, CONFIDENCE.replay) : weakestConfidence(kind, who);
          // A fork is exact about its own roll, not about its inputs: a trainer's members are keyed on the trainer,
          // and the levels' fork on the type, the trainer and the double (game-code.md §11).
          const foesOwn = type === WILD ? (podShift ? CONFIDENCE.estimate : CONFIDENCE.replay) : CONFIDENCE.exact;
          return {
            type: kind,
            // A grunt's name is as unseeded as its double (game-code.md §12), and missed under an `exact` claim. Its
            // party isn't, so `foes` keeps `who` (#623).
            trainer: gruntDouble ? CONFIDENCE.estimate : who,
            foes: weakestConfidence(kind, who, foesOwn),
            double: dbl,
            levels: weakestConfidence(kind, who, dbl),
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
// The wave the game is playing, in the fields a preview is graded on; null until its foes are out.
export const previewActual = s => {
  const b = s?.currentBattle;
  if (!b) return null;
  const party = tryDo(() => s.getEnemyParty(), []) ?? [];
  if (!party.length && !b.isBattleMysteryEncounter?.()) return null;
  return {
    wave: b.waveIndex,
    type: b.isBattleMysteryEncounter?.() ? "me" : b.trainer ? "trainer" : "wild",
    trainer: b.trainer ? trainerName(b.trainer) : null,
    foes: speciesKey(party.map(foeOf)),
    double: !!b.double,
    levels: party.map(p => p.level).join(","),
  };
};
// Scores nothing: the tally is `previewCheck`'s alone.
export const previewGrade = (m, actual) => {
  const mine = {
    type: m.type, trainer: m.trainer?.name ?? null, foes: speciesKey(m.foes),
    double: m.double, levels: m.levels.join(","),
  };
  const right = [], wrong = [];
  for (const f of FIELDS) {
    if (f === "trainer" && mine.type !== "trainer") continue;
    // An ME fields no foes, so the battle levels its read carries always graded wrong, and marked a right call `!`
    // (#590).
    if ((f === "foes" || f === "levels") && mine.type === "me") continue;
    (String(mine[f]) === String(actual[f]) ? right : wrong).push(f);
  }
  return { right, wrong, mine, actual };
};
export const previewCheck = s => {
  if (!predicted || predicted.scored || s?.currentBattle?.waveIndex !== predicted.wave) return;
  const actual = previewActual(s);
  if (!actual) return;
  const { right, wrong, mine } = previewGrade(predicted, actual);
  for (const f of right) stats.hit[f]++;
  for (const f of wrong) stats.miss[f]++;
  stats.checked++;
  if (wrong.length) {
    const { wave, ...seen } = actual;
    stats.last = { wave, wrong, mine, actual: seen };
  }
  predicted.scored = true;
};
export const previewStats = () => ({ ...stats, hit: { ...stats.hit }, miss: { ...stats.miss } });
const everMissed = field => stats.miss[field] > 0;

// The replay key (#520): what `replay` reads of the live run. The base is read on every wave and decides the wave's
// kind, so the base's first replay names the part that follows it.
const classOf = m => m?.constructor?.name ?? null;
const stacksOf = (mods, cls) => (mods ?? []).filter(m => classOf(m) === cls)
  .reduce((t, m) => t + (tryDo(() => m.getStackCount(), m.stackCount ?? 1) ?? 1), 0);
const EGG_PHASES = ["EggLapsePhase", "EggHatchPhase"];
const baseKey = (s, w) => {
  const me = s.mysteryEncounterSaveData;
  return [s.seed, s.currentBattle?.waveIndex ?? null, w, s.arena?.biomeId ?? null, s.arena?.lastTimeOfDay ?? null,
    (me?.encounteredEvents ?? []).length, me?.encounterSpawnChance ?? null,
    tryDo(() => gameEvents().activeEvent()?.name),
    stacksOf(s.modifiers, "HiddenAbilityRateBoosterModifier"),
    (s.enemyModifiers ?? []).filter(m => classOf(m) === "EnemyFusionChanceModifier").map(m => [m.chance ?? null, stacksOf([m], classOf(m))]),
    EGG_PHASES.includes(tryDo(() => s.phaseManager.getCurrentPhase().phaseName))];
};

const DOUBLE_ATTR = "DoubleBattleChanceAbAttr";
// `applySingleAbAttrs`' gate, once for the ability and once for a passive that differs from it.
const doubleApplications = p => {
  const own = tryDo(() => p.getAbility());
  if (typeof own?.hasAttr !== "function") return tryDo(() => p.hasAbilityWithAttr(DOUBLE_ATTR), false) ? 1 : 0;
  const passive = tryDo(() => (p.hasPassive() ? p.getPassiveAbility() : null));
  return (tryDo(() => p.canApplyAbility(false) && own.hasAttr(DOUBLE_ATTR), false) ? 1 : 0)
    + (passive && passive.id !== own.id && tryDo(() => p.canApplyAbility(true) && passive.hasAttr(DOUBLE_ATTR), false) ? 1 : 0);
};
// `getDoubleBattleChance` divides by 4 per lure and per application, and past three every chance draws alike (#520).
const doubleKey = s => {
  const field = tryDo(() => s.getPlayerField(), null) ?? tryDo(() => s.getPlayerParty().filter(Boolean).slice(0, 1), []);
  const lures = (s.modifiers ?? []).filter(m => classOf(m) === "DoubleBattleChanceBoosterModifier").length;
  return Math.min(3, lures + field.reduce((t, p) => t + doubleApplications(p), 0));
};

// The encounter-level money requirements (#520).
// @mirrors me-money-multipliers
const ME_MONEY = [1.5, 1.75, 2, 4];
// One entry per member, in no order, covering every encounter's primary requirement: the count that qualifies is what
// draws, and a count per reason misses a member trading one reason to qualify for another.
const meMember = p => JSON.stringify([
  (r => r >= 0.51 && r <= 1)(tryDo(() => p.getHpRatio(), (p.hp ?? 0) / (tryDo(() => p.getMaxHp(), 1) || 1))),
  tryDo(() => p.isOfType(PokemonType.BUG, { includeTeraType: false }), false),
  (tryDo(() => p.getHeldItems(), []) ?? []).map(it => JSON.stringify([classOf(it), it.type?.moveType ?? null, !!it.isTransferable])).sort(),
]);
const battleAt = (s, w) => Object.create(s.currentBattle, { waveIndex: { value: w } });
const KIND_KEY = {
  trainer: s => [doubleKey(s), !!s.currentBattle?.double],
  wild: (s, w, party) => [doubleKey(s), partyLuck(party, s, gameEvents()), stacksOf(s.modifiers, "ShinyRateBoosterModifier"), hasBugNet(s)],
  me: (s, w, party) => [
    ME_MONEY.filter(m => tryDo(() => withBattle(s, battleAt(s, w), () => s.getWaveMoneyAmount(m)), Infinity) <= (s.money ?? 0)).length,
    stacksOf(s.modifiers, "BerryModifier") >= 6,
    Math.min(4, party.filter(p => tryDo(() => p.isAllowedInBattle(), true)).length),
    party.map(meMember).sort(),
  ],
};

const buildModel = (s, w, party) => {
  try { return { kind: "preview", ...quiet(() => replay(s, w, party)) }; } catch (e) { return { unavailable: `preview: ${e?.message ?? e}` }; }
};
// `missed` is the tally's as it stands: a build the key holds outlives the misses scored after it (#520).
const marked = new WeakMap();
const withMissed = value => {
  const missed = FIELDS.filter(f => everMissed(f) && value.confidence?.[f]);
  const was = marked.get(value);
  if (was && was.missed.join() === missed.join()) return was;
  const model = { ...value, missed };
  marked.set(value, model);
  return model;
};

// `key` is the replay key the model is held under, null where nothing was replayed.
// @only 49-ahead: previewRead
export const previewRead = (run, w) => {
  const s = run.scene;
  if (!s?.currentBattle || w == null || w < 1) return { key: null, model: null };
  const missing = NEEDED.filter(k => typeof s[k] !== "function");
  if (!hasSpeciesRoll(s)) missing.push("randomSpecies");
  if (missing.length || typeof s.gameMode?.isFixedBattle !== "function" || !s.seed) {
    return { key: null, model: { kind: "preview", wave: w, unavailable: missing[0] ? `the live build has no ${missing[0]}` : "no run seed" } };
  }
  const party = run.facts.party;
  const base = JSON.stringify(baseKey(s, w));
  let model = null;
  const build = () => (model ??= buildModel(s, w, party));
  const kind = run.memoExact("preview-kind", base, () => build().type ?? null);
  const key = JSON.stringify([base, kind, KIND_KEY[kind]?.(s, w, party) ?? null]);  const value = run.memoExact("preview", key, build);
  return { key, model: value.kind ? withMissed(value) : { kind: "preview", wave: w, unavailable: value.unavailable } };
};
export const previewFor = (run, w) => previewRead(run, w).model;
export const previewNext = run => previewFor(run, run.facts.wave + 1);

const CONFIDENCE_MARK = { exact: "", replay: "~", estimate: "≈" };
export const confidenceMark = c => CONFIDENCE_MARK[c] ?? "";
export const previewMark = (m, field) => (m.missed?.includes(field) ? "!" : confidenceMark(m.confidence?.[field]));
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
