// The run calendar: what a run's wave numbers alone decide, before any roll — which waves are the final boss, a fixed
// battle, a gym leader or a boss, where the party heals and who comes back from it, and how likely a trainer is on a
// wave. Every rule here is arithmetic on the wave index, the run's own offsets and its challenges; **nothing draws**,
// so an answer holds from any point in a run and costs no seed. What the run seed has already *rolled* is a different
// question, and `48-preview.js` answers it by replaying the draws.
//
// ---- The four rules (read from the pinned source, v1.12.0.11; references/game-code.md §12)
//   final  `gameMode.isWaveFinal(w)`                     Eternatus at 200 in classic; Daily 50; Endless every 250
//   fixed  `gameMode.isFixedBattle(w)`                   the rival, the evil team, the Elite Four, the champion
//   gym    `w % 30 === (offsetGym ? 0 : 20)`             the rule `isWaveTrainer` returns early on
//   boss   `gameMode.isBoss(w)`                          every tenth wave
// A wave can match several (190 is both the champion and a boss wave); the list above is the precedence `waveKind`
// applies, and the one every card reads. There is no second copy of the gym rule anywhere in the HUD.
// The gym rule and the trainer share are both **inside** `isWaveTrainer`, which `handleNonFixedBattle` calls only when
// `gameMode.hasTrainers`: Endless and Spliced Endless have no gym wave and no trainer wave at all, and `hasTrainers`
// is the one place that says so. **Daily keeps the gym rule** even though `isWaveTrainer` returns from its own
// calendar before reaching it: its X0 from 20 to 40 is a trainer drawn from the biome's BOSS pool (`isTrainerBoss`),
// which is a gym leader in all but name, and the cards that care read Daily's own rule anyway. What the Daily
// calendar does change is that **no draw decides any of it**, which is `kindIsRolled`'s business, not `waveKind`'s.
//
// Wave numbers alone decide two more things, so they live here too rather than in the cards that read them:
// `isGruntWave` (the four fixed waves whose double comes off an unseeded roll) and `poolAnchorWave` (the wave whose
// time of day the arena's spawn pool was last built at).
//
// ---- Heals
// `VictoryPhase` pushes `SelectBiomePhase` whenever `isNewBiome()` — in classic, every tenth wave — and
// `SelectBiomePhase.setNextBiomeAndEnd` unshifts `PartyHealPhase` when the *next* wave is an X1. `PartyHealPhase`
// restores HP, cures status, refills every move's PP, revives the fallen and resets `arena.playerTerasUsed`. So a
// classic run heals entering 11, 21 … 191 and nowhere else, and **waves 181–190 hold the four Elite Four fights and
// the champion with no heal between them** — the stretch the rewards card spends against. Two challenges move it:
// Limited Support 1 and 3 drop the heal altogether (`applyPartyHeal` keeps it only at value 2), and Hardcore leaves
// the fainted where they are (`PREVENT_REVIVE`).
//
// ---- Game-less fallbacks
// This is the only file in the HUD that answers a calendar question without the game's own method. Each fallback is
// marked `game-less-backed` where it sits: a caller never writes `% 10` or `% 30` for itself, so a live build that
// hides `gameMode` gets one reading of the run rather than four.
const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

/**
 * Whether the run has trainer battles at all. `handleNonFixedBattle` makes every non-fixed wave wild when
 * `!gameMode.hasTrainers` and never asks `isWaveTrainer`, so in Endless and Spliced Endless there is no gym wave, no
 * trainer share and no trainer-chance roll — a wave's kind is settled without a draw. **Game-less-backed**: with no
 * `hasTrainers` on the mode, every mode but Endless has them, and a build that hides the mode altogether reads as a
 * classic run, as the rest of this file's fallbacks do.
 */
export const hasTrainers = s => s?.gameMode?.hasTrainers ?? !s?.gameMode?.isEndless;

// The one gym rule. `GameMode.isWaveTrainer` returns on it before the chance roll, so a gym wave is a trainer wave
// that costs no draw — and as certain as a fixed battle. The run's last wave is the only exception, which `waveKind`
// takes first; the look-back in `trainerOdds` asks the rule itself, the way the game's own loop does. The rule lives
// *inside* `isWaveTrainer`, so a mode that never asks it has no gym wave: the modulo alone would hand Endless a gym
// leader on 200 that the game never generates.
const gymRule = (s, w) => hasTrainers(s) && w % 30 === (s?.offsetGym ? 0 : 20);

/**
 * The run's last wave. **Game-less-backed**: with no `gameMode.isWaveFinal`, it is 200 in classic and challenge runs,
 * 50 in Daily and every 250th wave in Endless.
 */
const isFinalWave = (s, w) => {
  const gm = s?.gameMode;
  return tryDo(() => gm.isWaveFinal(w),
    !!gm && (gm.isDaily ? w === 50 : gm.isEndless ? w % 250 === 0 : !!gm.isClassic && w === 200));
};

/**
 * A boss wave. **Game-less-backed**: with no `gameMode.isBoss`, every tenth wave is one. Read on its own rather than
 * through `waveKind` where membership is the question and not precedence — the double-battle chance is 32 on an X0
 * wave whether or not that wave is also the gym.
 */
export const isBossWave = (s, w) => tryDo(() => s?.gameMode.isBoss(w), w % 10 === 0);

/** What kind of fight wave `w` is, by the precedence above, or `null` when it is an ordinary wave. */
export const waveKind = (s, w) => {
  if (isFinalWave(s, w)) return "final";
  if (tryDo(() => s.gameMode.isFixedBattle(w), false)) return "fixed";
  if (gymRule(s, w)) return "gym";
  if (isBossWave(s, w)) return "boss";
  return null;
};

// How far ahead the schedule is worth walking. `isFixedBattle` builds a `FixedBattleConfig` and runs the challenge
// hooks on every call, and the panel redraws every second, so the span is bounded and its caller caches.
const SPAN = 30;
/** Every big fight in `[from, from + n)`, in wave order, as `{ wave, kind }`. No RNG: four rules on the wave index. */
export const bigFightsAhead = (s, from, n = SPAN) => {
  if (typeof s?.gameMode?.isFixedBattle !== "function") return [];
  const out = [];
  for (let w = from; w < from + n; w++) {
    const kind = waveKind(s, w);
    if (kind) out.push({ wave: w, kind });
    if (kind === "final") break; // nothing is scheduled past the run's last wave
  }
  return out;
};

const challengeValue = (s, id) => (s?.gameMode?.challenges ?? []).find(c => c?.id === id)?.value ?? 0;
// `LimitedSupportChallenge.applyPartyHeal`: only value 2 keeps the X1 heal, so 1 and 3 are runs with no full heal in
// them at all.
const healsAtAll = s => ![1, 3].includes(challengeValue(s, Challenges.LIMITED_SUPPORT));

/**
 * The next wave the run heals on, or `null` — past the run's last wave, or under a Limited Support that has no heal.
 * **Game-less-backed**: the heal lands on an X1, because `isNewBiome` is every X0 in classic and the heal is unshifted
 * entering the wave after it.
 */
const HEAL_HORIZON = 60;
export const nextHeal = (s, from) => {
  if (!healsAtAll(s)) return null;
  for (let w = from; w < from + HEAL_HORIZON; w++) {
    if (isFinalWave(s, w)) return null;
    if (w % 10 === 1) return w;
  }
  return null;
};

/** Whether that heal brings the fainted back: `PartyHealPhase` skips them under Hardcore, and never runs without a heal. */
export const healRevives = s => healsAtAll(s) && challengeValue(s, Challenges.HARDCORE) <= 0;

/**
 * `isWaveTrainer`'s look-back loop, as the one reading both callers share (`src/game-mode.ts:227-244`): it walks
 * `[max(w − 2, base + 2), min(w + 2, base + 10)]` and gives up on the first gym or fixed battle it meets — which is
 * the *rule* half, costing no draw — counting the earlier waves that rolled before this one, which is the *odds* half.
 * `{ blocked, before }`: blocked means the wave never reaches its own roll at all.
 */
const lookback = (s, w) => {
  const gm = s?.gameMode;
  const base = Math.floor(w / 10) * 10;
  let before = 0;
  for (let v = Math.max(w - 2, base + 2); v <= Math.min(w + 2, base + 10); v++) {
    if (v === w) continue;
    if (gymRule(s, v) || tryDo(() => gm?.isFixedBattle(v), false)) return { blocked: true, before };
    if (v < w) before++;
  }
  return { blocked: false, before };
};

/**
 * How likely wave `w` in `biome` is a trainer battle: `GameMode.isWaveTrainer` (§10) as odds rather than as the roll
 * `48-preview.js` replays. The certainties first — a gym wave always, Daily's X5 and its X0 past 10, and a wave the
 * run's own table has already claimed never — then the 1/`trainerChance` roll each of X2…X9 makes, blocked within two
 * waves of a gym or fixed battle and reduced by the chance a wave in its look-back took the slot first. The chance is
 * the **candidate biome's**, because this answers about a biome the run hasn't entered yet; `kindIsRolled` asks the
 * live arena for the same number, which is the one the wave ahead will really roll against.
 */
export const trainerOdds = (s, w, biome) => {
  const gm = s?.gameMode;
  const kind = waveKind(s, w);
  if (kind === "final" || kind === "fixed") return 0; // not the biome's: the rival, the evil team, the Elite Four
  if (!hasTrainers(s)) return 0; // Endless: `handleNonFixedBattle` never asks
  if (gm?.isDaily) return w % 10 === 5 || (w % 10 === 0 && w > 10) ? 1 : 0;
  if (kind === "gym") return 1;
  if (w % 10 <= 1) return 0; // X1 is skipped for a sprite bug, X0 is a wild boss
  const chance = biome?.trainerChance ?? 0;
  if (!chance) return 0;
  const { blocked, before } = lookback(s, w);
  return blocked ? 0 : (1 - 1 / chance) ** before / chance;
};

/**
 * Whether wave `w`'s **kind** — trainer or wild — is settled by a draw on the live stream rather than by a rule. This
 * is what a preview's `type` confidence turns on: a rule holds from any point in the run (`exact`), a stream draw only
 * holds while the replay draws what the game draws (`replay`).
 *
 * `isWaveTrainer` returns before its `1/trainerChance` roll on every path but one, and `handleNonFixedBattle` doesn't
 * even call it without trainers: a mode with no trainers (Endless), Daily's own calendar (a forced wave, then X5 and
 * X0 past 10), the gym rule, X0 and X1 (a trainer sprite bug), and a biome with no `trainerChance`. The look-back
 * blocks the roll within two waves of a gym or fixed battle — the blocking rule draws nothing itself, so a blocked
 * wave is as certain as a gym wave, even though the look-back's *other* term (an earlier wave taking the slot) is a
 * fork this doesn't read. A fixed battle replaces all of it with a table lookup.
 *
 * **Game-less-backed** in its inputs only: with no `arena.trainerChance` it assumes the roll happens, which is the
 * careful answer — a kind marked `replay` that was really exact costs nothing but a `~`.
 */
export const kindIsRolled = (s, w) => {
  const gm = s?.gameMode;
  if (!gm || !hasTrainers(s) || gm.isDaily) return false;
  const kind = waveKind(s, w);
  if (kind === "final" || kind === "fixed" || kind === "gym") return false;
  if (w % 10 === 0 || w % 10 === 1) return false;
  // `randSeedInt(range)` returns `min` **without drawing** when `range <= 1` (`src/utils/common.ts:101`), so a biome
  // with a trainer chance of 1 is a rule too — every eligible wave is a trainer, and no draw says so.
  if ((s?.arena?.trainerChance ?? 2) <= 1) return false;
  return !lookback(s, w).blocked;
};

/**
 * Whether wave `w` is one of the four **evil-team grunt** waves (35, 62, 64, 112). Their config is the only one whose
 * trainer can arrive as a double without the run seed saying so: `getRandomTrainerFunc` (`src/battle.ts:582`) rolls
 * `randInt(3) === 0` for a grunt, and `randInt` is `Math.random` (`src/utils/common.ts:88`) — unseeded, so no preview
 * and no replay reaches it. The admins and bosses of the same group take no such roll.
 */
const GRUNT_WAVES = [ClassicFixedBossWaves.EVIL_GRUNT_1, ClassicFixedBossWaves.EVIL_GRUNT_2,
  ClassicFixedBossWaves.EVIL_GRUNT_3, ClassicFixedBossWaves.EVIL_GRUNT_4];
export const isGruntWave = w => GRUNT_WAVES.includes(w);

/**
 * The wave whose time of day the arena's spawn pool was last built at. `Arena.updatePoolsForTimeOfDay` runs when the
 * arena is built — `newArena`, during the X0 the next biome is chosen on — and again from `doPostBattleCleanup` as a
 * wave X5 starts (`src/battle-scene.ts:1576`), and nowhere else. So **X1–X4 spawn from the pool the X0 built, and
 * X5–X9 and the closing X0 from the pool X5 built**; wave 1 answers 0, which is the `currentBattle?.waveIndex ?? 0`
 * the title screen's arena read. What that wave's time of day *is* stays with the biome card, which needs the biome.
 */
export const poolAnchorWave = w => {
  const base = Math.floor((w - 1) / 10) * 10;
  return w - base >= 5 ? base + 5 : base;
};

/**
 * Whether the arena itself is rebuilt between waves `from` and `to` — a **new biome**, with its own pools, not just a
 * rebuild of the one we hold. The ten waves an arena covers run X1…X0, and `SelectBiomePhase` asks for the next one on
 * the X0 that ends them, so a preview taken on an X0 of the X1 after it is reading the biome the run is leaving.
 */
export const arenaRebuiltBetween = (from, to) => Math.floor((from - 1) / 10) !== Math.floor((to - 1) / 10);
