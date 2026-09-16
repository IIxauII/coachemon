// Reroll preview: what the rewards screen's next reroll will offer, read off the stream before paying for it.
//
// ---- How the game rolls rewards (read from the pinned source, v1.12.0.11; references/game-code.md §19)
// `SelectModifierPhase.start` on the first roll of a wave calls `resetSeed()`, so the reward stream restarts at the wave
// seed; a reroll doesn't, so it continues the stream from wherever the last roll left it. Either way it then calls
// `regenerateModifierPoolThresholds(party, PLAYER, rerollCount)` — the per-tier weight tables, written to module-level
// variables, and a draw for every generator entry in the pool (`generateType(party)`) — and
// `getPlayerModifierTypeOptions(count, party, lockedTiers?, customSettings?)`: per option a tier (`randSeedInt(1024)`),
// the luck-upgrade loop, an item by weight, retries on a duplicate. So a reroll's offers are a pure function of the
// stream position, the party (and its held items, which move the weights) and the reroll count.
//
// `rerollModifiers` queues `SelectModifierPhase(rerollCount + 1, <the tiers on screen>)` and nothing else: **a reroll
// drops the wave's custom reward settings**. After a fixed battle whose rewards were pinned to tiers with luck upgrades
// off, the reroll is an ordinary roll — `3 + ExtraModifierModifier + TempExtraModifierModifier` options, rarities
// rolled, luck upgrading them — and it is only the *first* reroll's cost that the wave's `rerollMultiplier` scales.
// The tiers on screen are passed on, but used only when `scene.lockModifierTiers` is set (the Lock Capsule's toggle,
// which also makes the cost the summed tier values instead of 250); locked tiers still take luck upgrades.
//
// ---- How the preview runs
// Inside `sandbox` (which puts `RND.state()` back): from the live stream position, the game's own
// `regenerateModifierPoolThresholds(party, PLAYER, n)` and `getPlayerModifierTypeOptions(count, party, tiers?)`, with
// `count` from a fresh `SelectModifierPhase(n, tiers)`'s own `getModifierCount` (a phase constructor does nothing
// else). Once with the lock as it stands, and — when the party holds a Lock Capsule — once more with it toggled, each
// from the same stream position. The threshold tables are module-private, so they can't be saved; they are put back by
// regenerating them for the live reroll count and party, which is what the live tables are for every roll that reads
// them (every non-copy `SelectModifierPhase` regenerates before it draws). The two functions are module exports found
// by name by 47-biome's chunk scan; until it has them the card falls back to its old one-line hint.
//
// ---- What it promises
// `replay` (the Preview glossary entry): right only while nothing else draws from the stream between this read and the
// press. Buying, a held-item transfer or a party change moves the weights, and the preview is re-read on the next tick;
// anything that draws without changing an input this key reads is what the arrival check catches. Every reroll the
// player actually makes is scored against the last preview for it, and a miss marks the line `!` for the rest of the run
// (`window.__coachHud.reroll()`).
const { rerollPreview, rerollCheck, rerollStats } = (() => {
  const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  // `getNewModifierTypeOption` logs every item it draws.
  const quiet = fn => {
    const { log, warn, info } = console;
    console.log = console.warn = console.info = () => {};
    try { return fn(); } finally { Object.assign(console, { log, warn, info }); }
  };

  const rewardPhase = s => {
    const ph = tryDo(() => s.phaseManager.getCurrentPhase());
    return ph?.phaseName === "SelectModifierPhase" ? ph : null;
  };
  // `ModifierSelectUiHandler.show`: the lock button is there only with a Lock Capsule.
  const canLock = s => (s.modifiers ?? []).some(m => m?.constructor?.name === "LockModifierTiersModifier");
  const tiersOf = ph => (ph.typeOptions ?? []).map(o => o?.type?.tier).filter(t => t !== undefined);
  const offerKey = t => `${t?.name ?? "?"}|${t?.tier ?? "?"}`;

  // Everything the roll reads besides the stream: the party as the pool weights and generators see it (HP, status, PP,
  // levels, luck, the moves a TM can add, the nature a mint changes, the Tera type a shard offers, the ability an orb
  // wants), the modifiers (held items and their stacks, ball counts), the reroll count and the tiers on screen.
  const inputKey = (s, ph, party) => JSON.stringify([
    tryDo(() => Phaser.Math.RND.state()), s.seed, s.currentBattle?.waveIndex, ph.rerollCount ?? 0, !!s.lockModifierTiers,
    (ph.typeOptions ?? []).map(o => offerKey(o?.type)),
    party.map(p => [p.id, p.species?.speciesId, p.fusionSpecies?.speciesId, p.formIndex, p.level, p.hp, p.status?.effect ?? 0,
      (p.moveset ?? []).map(m => [m?.moveId, m?.ppUsed, m?.ppUp]), tryDo(() => p.getLuck(), 0), tryDo(() => p.getNature()),
      p.teraType, p.abilityIndex]),
    (s.modifiers ?? []).map(m => [m?.type?.id ?? m?.constructor?.name, m?.pokemonId, tryDo(() => m.getStackCount(), m?.stackCount)]),
    s.pokeballCounts,
  ]);

  // One reroll, rolled from the live stream position. Returns the game's ModifierType objects (the card judges them)
  // and the options' upgrade counts; null when rerolling is switched off for this screen.
  const roll = (fns, ph, party, lock) => {
    const cost = ph.getRerollCost(lock);
    if (cost < 0) return null;
    const n = (ph.rerollCount ?? 0) + 1;
    const tiers = tiersOf(ph);
    const at = Phaser.Math.RND.state();
    try {
      fns.regenerate(party, ModifierPoolType.PLAYER, n);
      const count = new ph.constructor(n, tiers).getModifierCount();
      const options = fns.options(count, party, lock ? tiers : undefined);
      return { lock, cost, types: options.map(o => o.type), upgrades: options.map(o => o.upgradeCount ?? 0) };
    } finally {
      Phaser.Math.RND.state(at);
    }
  };

  // ---- Accuracy, measured rather than claimed
  const stats = { checked: 0, hit: 0, miss: 0, last: null };
  // The last preview handed out: the phase it was read on, and the offers per lock state.
  let pending = null;
  // Called every tick, before the card is built. When the screen on show is the reroll the last preview was for, score it.
  const rerollCheck = s => {
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
  const rerollStats = () => ({ ...stats });

  let cache = { key: null, value: null };
  // `{ n, rolls: [{ lock, cost, types, upgrades }], canLock, locked, missed }`, `{ unavailable }`, or null off the
  // rewards screen. The first roll is the lock as it stands; a second, with it toggled, when a Lock Capsule is held.
  const rerollPreview = s => {
    const ph = rewardPhase(s);
    if (!ph) return null;
    const fns = typeof gameRewardFns === "function" ? gameRewardFns() : null;
    if (!fns) return { unavailable: "the reward roll isn't found in the live build yet" };
    if (typeof ph.getRerollCost !== "function" || typeof ph.constructor?.prototype?.getModifierCount !== "function") {
      return { unavailable: "the live build's reward phase moved past the pin" };
    }
    const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
    const key = inputKey(s, ph, party);
    if (cache.key !== key) {
      const lock = !!s.lockModifierTiers;
      const value = tryDo(() => quiet(() => sandbox(s, () => {
        try {
          const rolls = [roll(fns, ph, party, lock)];
          if (canLock(s)) rolls.push(roll(fns, ph, party, !lock));
          return { n: (ph.rerollCount ?? 0) + 1, rolls: rolls.filter(Boolean), canLock: canLock(s), locked: lock };
        } finally {
          fns.regenerate(party, ModifierPoolType.PLAYER, ph.rerollCount ?? 0);
        }
      })), { unavailable: "the reward roll threw" });
      cache = { key, value };
    }
    const value = cache.value;
    if (!value.unavailable && value.rolls.length) {
      pending = { phase: ph, wave: s.currentBattle?.waveIndex, n: value.n,
        byLock: Object.fromEntries(value.rolls.map(r => [String(r.lock), r.types.map(offerKey)])) };
    }
    return { ...value, missed: stats.miss > 0 };
  };

  return { rerollPreview, rerollCheck, rerollStats };
})();
