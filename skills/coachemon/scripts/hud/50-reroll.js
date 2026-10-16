// What the rewards screen's next reroll will offer, read off the stream before paying for it (game-code.md §19).
import { gameRewardFns } from "./04-game-tables.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const quiet = fn => {
  const { log, warn, info } = console;
  console.log = console.warn = console.info = () => {};
  try { return fn(); } finally { Object.assign(console, { log, warn, info }); }
};

const rewardPhase = s => {
  const ph = tryDo(() => s.phaseManager.getCurrentPhase());
  return ph?.phaseName === "SelectModifierPhase" ? ph : null;
};
// The lock button shows only with a Lock Capsule (game-code.md §19).
const canLock = s => (s.modifiers ?? []).some(m => m?.constructor?.name === "LockModifierTiersModifier");
const tiersOf = ph => (ph.typeOptions ?? []).map(o => o?.type?.tier).filter(t => t !== undefined);
const offerKey = t => `${t?.name ?? "?"}|${t?.tier ?? "?"}`;

// Everything the roll reads besides the stream (game-code.md §19): an input missing here serves a stale preview.
const inputKey = (s, ph, party) => JSON.stringify([
  tryDo(() => Phaser.Math.RND.state()), s.seed, s.currentBattle?.waveIndex, ph.rerollCount ?? 0, !!s.lockModifierTiers,
  (ph.typeOptions ?? []).map(o => offerKey(o?.type)),
  party.map(p => [p.id, p.species?.speciesId, p.fusionSpecies?.speciesId, p.formIndex, p.level, p.hp, p.status?.effect ?? 0,
    (p.moveset ?? []).map(m => [m?.moveId, m?.ppUsed, m?.ppUp]), tryDo(() => p.getLuck(), 0), tryDo(() => p.getNature()),
    p.teraType, p.abilityIndex]),
  (s.modifiers ?? []).map(m => [m?.type?.id ?? m?.constructor?.name, m?.pokemonId, tryDo(() => m.getStackCount(), m?.stackCount)]),
  s.pokeballCounts,
]);

const roll = (fns, ph, party, lock) => {
  const cost = ph.getRerollCost(lock);
  if (cost < 0) return null;
  const n = (ph.rerollCount ?? 0) + 1;
  const tiers = tiersOf(ph);
  const at = Phaser.Math.RND.state();
  try {
    fns.regenerate(party, ModifierPoolType.PLAYER, n);
    // A fresh phase's count, never the live one's, which counts the wave's custom settings (game-code.md §19).
    const count = new ph.constructor(n, tiers).getModifierCount();
    const options = fns.options(count, party, lock ? tiers : undefined);
    return { lock, cost, types: options.map(o => o.type), upgrades: options.map(o => o.upgradeCount ?? 0) };
  } finally {
    Phaser.Math.RND.state(at);
  }
};

const stats = { checked: 0, hit: 0, miss: 0, last: null };
let pending = null;
// Call while the phase the preview was read on is on show: the tally scores the reroll after it.
export const rerollArm = (s, r) => {
  if (!r?.rolls?.length || !r.byLock) return;
  pending = { phase: rewardPhase(s), wave: s?.currentBattle?.waveIndex, n: r.n, byLock: r.byLock };
};
export const rerollCheck = s => {
  const ph = rewardPhase(s);
  if (!pending) return;
  const wave = s?.currentBattle?.waveIndex;
  if (wave !== pending.wave) { pending = null; return; }
  if (!ph || ph === pending.phase || ph.isCopy || (ph.rerollCount ?? 0) !== pending.n || !ph.typeOptions?.length) return;
  const mine = pending.byLock[String(!!s.lockModifierTiers)];
  if (mine) {
    const actual = ph.typeOptions.map(o => offerKey(o.type));
    if (mine.join(",") === actual.join(",")) stats.hit++;
    else { stats.miss++; stats.last = { wave, reroll: pending.n, mine, actual }; }
    stats.checked++;
  }
  pending = null;
};
export const rerollStats = () => ({ ...stats });

export const rerollPreview = run => {
  const s = run.scene;
  const ph = rewardPhase(s);
  if (!ph) return null;
  const fns = gameRewardFns();
  if (!fns) return { unavailable: "the reward roll isn't found in the live build yet" };
  if (typeof ph.getRerollCost !== "function" || typeof ph.constructor?.prototype?.getModifierCount !== "function") {
    return { unavailable: "the live build's reward phase moved past the pin" };
  }
  const party = run.facts.party;
  const value = run.memo("reroll", inputKey(s, ph, party), () => quiet(() => {
    const lock = !!s.lockModifierTiers;
    try {
      const rolls = [roll(fns, ph, party, lock)].concat(canLock(s) ? [roll(fns, ph, party, !lock)] : []).filter(Boolean);
      return { n: (ph.rerollCount ?? 0) + 1, rolls, canLock: canLock(s), locked: lock,
        byLock: Object.fromEntries(rolls.map(r => [String(r.lock), r.types.map(offerKey)])) };
    } finally {
      // The threshold tables are module-private: regenerating them for the live reroll count is what puts them back
      // (game-code.md §19).
      fns.regenerate(party, ModifierPoolType.PLAYER, ph.rerollCount ?? 0);
    }
  }));
  return value.unavailable ? value : { ...value, missed: stats.miss > 0 };
};

export const rerollMark = r => (r.missed ? "!" : "~");
export const rerollLabel = (r, roll) => (!r.canLock ? "reroll" : roll.lock === r.locked ? (roll.lock ? "reroll locked" : "reroll")
  : roll.lock ? "lock, reroll" : "unlock, reroll");

export const rerollSummary = m => {
  const r = m.rerollAhead;
  if (!r) return null;
  return r.rolls.map(roll => `${rerollLabel(r, roll)} $${roll.cost} → ${roll.offers.map(f => f.name).join(", ")} (${roll.verdict}) [${rerollMark(r)}]`).join(" · ");
};
