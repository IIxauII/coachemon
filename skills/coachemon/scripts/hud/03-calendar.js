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

// The one gym rule. `GameMode.isWaveTrainer` returns on it before the chance roll, so a gym wave is a trainer wave
// that costs no draw — and as certain as a fixed battle. The run's last wave is the only exception, which `waveKind`
// takes first; the look-back in `trainerOdds` asks the rule itself, the way the game's own loop does.
const gymRule = (s, w) => w % 30 === (s?.offsetGym ? 0 : 20);

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
 * How likely wave `w` in `biome` is a trainer battle: `GameMode.isWaveTrainer` (§10) as odds rather than as the roll
 * `48-preview.js` replays. The certainties first — a gym wave always, Daily's X5 and its X0 past 10, and a wave the
 * run's own table has already claimed never — then the 1/`trainerChance` roll each of X2…X9 makes, blocked within two
 * waves of a gym or fixed battle and reduced by the chance a wave in its look-back took the slot first.
 */
export const trainerOdds = (s, w, biome) => {
  const gm = s?.gameMode;
  const kind = waveKind(s, w);
  if (kind === "final" || kind === "fixed") return 0; // not the biome's: the rival, the evil team, the Elite Four
  if (gm?.isDaily) return w % 10 === 5 || (w % 10 === 0 && w > 10) ? 1 : 0;
  if (kind === "gym") return 1;
  if (w % 10 <= 1) return 0; // X1 is skipped for a sprite bug, X0 is a wild boss
  const chance = biome?.trainerChance ?? 0;
  if (!chance) return 0;
  const base = Math.floor(w / 10) * 10;
  let before = 0;
  for (let v = Math.max(w - 2, base + 2); v <= Math.min(w + 2, base + 10); v++) {
    if (v === w) continue;
    if (gymRule(s, v) || tryDo(() => gm.isFixedBattle(v), false)) return 0;
    if (v < w) before++;
  }
  return (1 - 1 / chance) ** before / chance;
};
