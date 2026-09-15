// Predictions of what the enemy AI does this turn.
// Trainer switch prediction with the game's own code. EnemyCommandPhase (read from the live build): a trainer's
// active mon that isn't trapped or locked into a move switches when
//   bestBenchScore × (1 − 0.1^(1/enemySwitchCounter)) ≥ avg own matchup score × (boss ? 2 : 3)
// and sends trainer.getNextSummonIndex(). Switches resolve before moves, so our attack lands on the switch-in.
// getMatchupScore isn't fully side-effect free — non-simulated type checks can queue a strong-winds message or
// an ability display — so every call runs inside `sandbox`, and only once per turn.
// Game calls run inside `sandbox` (01-core.js).
const muted = sandbox;
let switchCache = { key: null, value: new Map() };
const predictSwitches = (s, b, active) => {
  const tr = b.trainer;
  if (!tr?.getPartyMemberMatchupScores) return new Map();
  const key = [b.waveIndex, b.turn, b.enemySwitchCounter, ...s.getField().map(p => p && `${p.id}:${p.hp}`)].join("|");
  if (switchCache.key === key) return switchCache.value;
  const out = new Map();
  const enemies = s.getEnemyParty();
  muted(s, () => {
    for (const e of active) {
      try {
        if (e.getMoveQueue().length || e.isTrapped()) continue;
        const scores = tr.getPartyMemberMatchupScores(e.trainerSlot, true);
        if (!scores.length) continue;
        const own = e.getOpponents().map(o => e.getMatchupScore(o));
        const avg = own.reduce((t, x) => t + x, 0) / own.length;
        const best = tr.getSortedPartyMemberMatchupScores(scores)[0][1];
        const counter = b.enemySwitchCounter;
        const w = 1 - (counter ? 0.1 ** (1 / counter) : 0);
        if (best * w < avg * (tr.config.isBoss ? 2 : 3)) continue;
        const to = enemies[tr.getNextSummonIndex(e.trainerSlot, scores)];
        if (to && ![...out.values()].some(v => v.to === to)) out.set(e, { to, ratio: 1 });
      } catch {}
    }
  });
  switchCache = { key, value: out };
  return out;
};
