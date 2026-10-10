// What the wave index, the run's offsets and its challenges decide before any roll. Nothing here draws, so an answer
// holds from any point in the run; what the seed has already rolled is `48-preview.js`'s.
const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// game-less-backed
export const hasTrainers = s => s?.gameMode?.hasTrainers ?? !s?.gameMode?.isEndless;

// `isWaveTrainer` holds the gym rule, so a mode that never asks it has no gym wave: the modulo alone would hand
// Endless a gym leader on 200 that the game never generates (game-code.md §12).
const gymRule = (s, w) => hasTrainers(s) && w % 30 === (s?.offsetGym ? 0 : 20);

// game-less-backed
const isFinalWave = (s, w) => {
  const gm = s?.gameMode;
  return tryDo(() => gm.isWaveFinal(w),
    !!gm && (gm.isDaily ? w === 50 : gm.isEndless ? w % 250 === 0 : !!gm.isClassic && w === 200));
};

// game-less-backed
// Ask this, not `waveKind`, whether a wave is a boss wave: `waveKind` answers "gym" for 20, which is both.
export const isBossWave = (s, w) => tryDo(() => s?.gameMode.isBoss(w), w % 10 === 0);

export const waveKind = (s, w) => {
  if (isFinalWave(s, w)) return "final";
  if (tryDo(() => s.gameMode.isFixedBattle(w), false)) return "fixed";
  if (gymRule(s, w)) return "gym";
  if (isBossWave(s, w)) return "boss";
  return null;
};

// Every wave in the span costs an `isFixedBattle` call, which builds a config and runs the challenge hooks
// (game-code.md §12).
const SPAN = 30;
export const bigFightsAhead = (s, from, n = SPAN) => {
  if (typeof s?.gameMode?.isFixedBattle !== "function") return [];
  const out = [];
  for (let w = from; w < from + n; w++) {
    const kind = waveKind(s, w);
    if (kind) out.push({ wave: w, kind });
    if (kind === "final") break;
  }
  return out;
};

const challengeValue = (s, id) => (s?.gameMode?.challenges ?? []).find(c => c?.id === id)?.value ?? 0;
// A challenge is on at any value but zero, never only a positive one: the one predicate `GameMode.hasChallenge`
// itself uses (game-code.md §16), and the one every reader of a challenge's on/off state reads here.
export const challengeOn = (s, id) => challengeValue(s, id) !== 0;
// (game-code.md §12)
const healsAtAll = s => ![1, 3].includes(challengeValue(s, Challenges.LIMITED_SUPPORT));

const HEAL_HORIZON = 60;
// game-less-backed
export const nextHeal = (s, from) => {
  if (!healsAtAll(s)) return null;
  for (let w = from; w < from + HEAL_HORIZON; w++) {
    if (isFinalWave(s, w)) return null;
    if (w % 10 === 1) return w;
  }
  return null;
};

export const healRevives = s => healsAtAll(s) && !challengeOn(s, Challenges.HARDCORE);

const SHOP_HORIZON = 12;
// A cleared wave opens the rewards screen, and with it the shop row a Revive is bought from, on every wave but an X0 —
// except under Limited Support 1, whose X1 transition queues one in the removed heal's place (game-code.md §12).
const shopsAtAll = s => ![2, 3].includes(challengeValue(s, Challenges.LIMITED_SUPPORT));
const shopAfter = (s, w) => w % 10 !== 0 || challengeValue(s, Challenges.LIMITED_SUPPORT) === 1;
// game-less-backed
const nextShop = (s, from) => {
  if (!shopsAtAll(s)) return null;
  for (let w = Math.max(1, from); w < from + SHOP_HORIZON; w++) {
    if (isFinalWave(s, w)) return null;
    if (shopAfter(s, w)) return w;
  }
  return null;
};

// How a fainted member gets back on its feet before the big fight on wave `fight`, or null for no way back. Luck is
// never one: a drawn Revive, a Reviver Seed and Sacred Ash don't count, and money is not priced (#569). `from` is the
// wave the run stands on — its own clear still opens a shop, while the heal it entered on is behind it. With no
// `fight` to reach, any way back ahead counts.
export const reviveBefore = (s, from, fight = null) => {
  if (challengeOn(s, Challenges.HARDCORE)) return null;
  const heal = nextHeal(s, from + 1);
  if (heal != null && (fight == null || heal <= fight)) return { kind: "heal", wave: heal };
  const shop = nextShop(s, from);
  if (shop != null && (fight == null || shop < fight)) return { kind: "shop", wave: shop };
  return null;
};

// `isWaveTrainer`'s look-back (game-code.md §10). `blocked`: the wave never reaches its own roll; `before`: the earlier
// waves in the window that roll first.
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

// `isWaveTrainer` as odds (game-code.md §10). The chance is `biome`'s, not the arena's: this answers about a biome the
// run may not have entered, where `kindIsRolled` asks the live arena about the wave it will really roll.
export const trainerOdds = (s, w, biome) => {
  const gm = s?.gameMode;
  const kind = waveKind(s, w);
  if (kind === "final" || kind === "fixed") return 0;
  if (!hasTrainers(s)) return 0;
  if (gm?.isDaily) return w % 10 === 5 || (w % 10 === 0 && w > 10) ? 1 : 0;
  if (kind === "gym") return 1;
  if (w % 10 <= 1) return 0;
  const chance = biome?.trainerChance ?? 0;
  if (!chance) return 0;
  const { blocked, before } = lookback(s, w);
  return blocked ? 0 : (1 - 1 / chance) ** before / chance;
};

// Whether wave `w`'s kind — trainer or wild — is settled by a draw on the live stream rather than by a rule: what a
// preview's `exact` or `replay` confidence turns on. A blocked wave counts as a rule, though an earlier wave in its
// look-back may still take the slot (game-code.md §11).
export const kindIsRolled = (s, w) => {
  const gm = s?.gameMode;
  if (!gm || !hasTrainers(s) || gm.isDaily) return false;
  const kind = waveKind(s, w);
  if (kind === "final" || kind === "fixed" || kind === "gym") return false;
  if (w % 10 === 0 || w % 10 === 1) return false;
  // `randSeedInt` does not draw for a range of 1, so a trainer chance of 1 is a rule too (game-code.md §11).
  // game-less-backed
  if ((s?.arena?.trainerChance ?? 2) <= 1) return false;
  return !lookback(s, w).blocked;
};

// The waves whose trainer may arrive as a double off an unseeded roll, which no replay reaches (game-code.md §12).
const GRUNT_WAVES = [ClassicFixedBossWaves.EVIL_GRUNT_1, ClassicFixedBossWaves.EVIL_GRUNT_2,
  ClassicFixedBossWaves.EVIL_GRUNT_3, ClassicFixedBossWaves.EVIL_GRUNT_4];
export const isGruntWave = w => GRUNT_WAVES.includes(w);

// The wave whose time of day the arena's spawn pool was last built at (game-code.md §10).
export const poolAnchorWave = w => {
  const base = Math.floor((w - 1) / 10) * 10;
  return w - base >= 5 ? base + 5 : base;
};

// A new biome between the two waves, not a pool rebuild. An arena covers X1…X0, so a preview taken on an X0 reads the
// biome the run is leaving.
export const arenaRebuiltBetween = (from, to) => Math.floor((from - 1) / 10) !== Math.floor((to - 1) / 10);
