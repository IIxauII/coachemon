// The enemy's choice read twice: the game's own `getNextMove` for this turn, and a re-implementation that gives every
// outcome its chance, for later turns and as the exact call's oracle at a pin bump (game-code.md §6, #183). Calls game
// code but never decides when that is allowed: 25-turn does, and `env` is its `sceneEnv`.
import { SPREAD_TARGETS, TYPES, forcedRng, hasAttr, keepTurnData, sandbox, sandboxBreachCount, withPick } from "./01-core.js";

// The AI skips their conditions (game-code.md §6).
const NO_CONDITION_CHECK = [MoveId.SUCKER_PUNCH, MoveId.UPPER_HAND, MoveId.THUNDERCLAP];
const STRUGGLE = MoveId.STRUGGLE;
const aiHas = (mv, name) => (mv.hasAttr ? mv.hasAttr(name) : hasAttr(mv, name));
const isAttackMove = mv => (mv.is ? mv.is("AttackMove") : mv.category !== MoveCategory.STATUS);
const usableFor = (pm, e, ignorePp = false) => {
  const r = pm.isUsable(e, ignorePp, true);
  return Array.isArray(r) ? r[0] : !!r;
};
const movesetOf = e => (e.getMoveset?.() ?? e.moveset).filter(Boolean);

// `getMoveTargets` as outcomes [{ targets, multiple, p }]: one per opponent for `RANDOM_NEAR_ENEMY`, which draws its
// target (game-code.md §6).
const aiMoveTargets = (e, mv) => {
  const holder = { value: mv.moveTarget };
  const opponents = e.getOpponents(false);
  for (const o of opponents) for (const a of mv.getAttrs?.("VariableTargetAttr") ?? []) a.apply(e, o, mv, [holder]);
  const t = holder.value;
  const ally = e.getAlly?.();
  const own = ally == null ? [e] : [e, ally];
  const out = (set, multiple, p = 1) => ({ targets: set.filter(x => x?.isActive(true)).map(x => x.getBattlerIndex()).filter(x => x !== undefined), multiple, p });
  switch (t) {
    case MoveTarget.USER: case MoveTarget.PARTY: return [out([e], false)];
    case MoveTarget.CURSE: if (!e.isOfType(PokemonType.GHOST, { returnOriginalTypesIfStellar: true })) return [out([e], false)];
    // falls through: a Ghost's Curse targets like OTHER
    case MoveTarget.OTHER: case MoveTarget.ALL_OTHERS: case MoveTarget.NEAR_OTHER: case MoveTarget.ALL_NEAR_OTHERS:
      return [out(ally == null ? opponents : [...opponents, ally], t === MoveTarget.ALL_OTHERS || t === MoveTarget.ALL_NEAR_OTHERS)];
    case MoveTarget.NEAR_ENEMY: case MoveTarget.ALL_NEAR_ENEMIES: case MoveTarget.ALL_ENEMIES: case MoveTarget.ENEMY_SIDE: return [out(opponents, t !== MoveTarget.NEAR_ENEMY)];
    case MoveTarget.RANDOM_NEAR_ENEMY: return opponents.length <= 1 ? [out([opponents[0]], false)] : opponents.map(o => out([o], false, 1 / opponents.length));
    case MoveTarget.ATTACKER: return [{ targets: [BattlerIndex.ATTACKER], multiple: false, p: 1 }];
    case MoveTarget.NEAR_ALLY: case MoveTarget.ALLY: return [out(ally == null ? [] : [ally], false)];
    case MoveTarget.USER_OR_NEAR_ALLY: case MoveTarget.USER_AND_ALLIES: case MoveTarget.USER_SIDE: return [out(own, t !== MoveTarget.USER_OR_NEAR_ALLY)];
    case MoveTarget.ALL: case MoveTarget.BOTH_SIDES: return [out([...own, ...opponents], true)];
  }
  return [out([], false)];
};

// `getNextTargets` as a distribution [{ targets, p }] (game-code.md §6).
const aiNextTargets = (env, e, mv) => {
  const dist = [];
  const active = env.field;
  for (const mt of aiMoveTargets(e, mv)) {
    const cands = active.filter(p => mt.targets.includes(p.getBattlerIndex()));
    if (mt.multiple) { dist.push({ targets: cands.map(p => p.getBattlerIndex()), p: mt.p }); continue; }
    const scored = cands.map(p => [p.getBattlerIndex(), mv.getTargetBenefitScore(e, p, mv) * (p.isPlayer() === e.isPlayer() ? 1 : -1)]);
    scored.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
    if (!scored.length) { dist.push({ targets: aiHas(mv, "CounterDamageAttr") ? [BattlerIndex.ATTACKER] : [], p: mt.p }); continue; }
    let w = scored.map(x => x[1]);
    const lowest = w.at(-1) ?? 0;
    if (lowest < 1) w = w.map(x => x + Math.abs(lowest - 1));
    const cut = w.findIndex(x => x < w[0] / 2);
    if (cut > -1) w = w.slice(0, cut);
    const cum = [];
    w.reduce((t, x) => (t += x, cum.push(t), t), 0);
    const total = cum.at(-1);
    cum.forEach((c, i) => {
      const p = total <= 1 ? (i === 0 ? 1 : 0) : (Math.min(Math.ceil(c), total) - Math.min(Math.ceil(cum[i - 1] ?? 0), total)) / total;
      if (p > 0) dist.push({ targets: [scored[i][0]], p: mt.p * p });
    });
  }
  return dist;
};

// Step 7 of `getNextMove` for one target (game-code.md §6), as branches [{ score, p }]: a condition that draws runs
// with the draw forced both ways, weighted 1/range. `p`: the target when it isn't the mon at field index `bi`.
export const aiTargetScore = (env, e, mv, bi, p = env.slots[bi]) => {
  let n = mv.getUserBenefitScore(e, p, mv) + mv.getTargetBenefitScore(e, p, mv) * ((bi < BattlerIndex.ENEMY) === e.isPlayer() ? 1 : -1);
  if (Number.isNaN(n)) n = 0;
  const rest = () => {
    if (env.s.arena.isMoveWeatherCancelled(e, mv) || env.s.arena.isMoveTerrainCancelled(e, [bi], mv)) return -20;
    if (!isAttackMove(mv)) return n;
    let x = n;
    const eff = p.getMoveEffectiveness(e, mv, !p.waveData.abilityRevealed, undefined, undefined, true);
    if (p.isPlayer() !== e.isPlayer()) { x *= eff; if (e.isOfType(mv.type)) x *= 1.5; }
    else if (eff) { x /= eff; if (e.isOfType(mv.type)) x /= 1.5; }
    return x || -20;
  };
  const unimplemented = mv.isUnimplemented || / \(N\)$/.test(mv.name ?? "");
  if (NO_CONDITION_CHECK.includes(mv.id)) return [{ score: rest(), p: 1 }];
  if (unimplemented) return [{ score: -20, p: 1 }];
  const [pass, ranges] = withPick(() => 0, () => mv.applyConditions(e, p, -1));
  if (!pass) return [{ score: -20, p: 1 }];
  const [passHigh] = ranges.length ? withPick(r => r - 1, () => mv.applyConditions(e, p, -1)) : [true];
  if (passHigh) return [{ score: rest(), p: 1 }];
  const q = ranges.reduce((t, r) => t / r, 1);
  return [{ score: rest(), p: q }, { score: -20, p: 1 - q }];
};

// [{ targets, score, p }]: target outcomes × condition branches, scored as step 7 scores a move (game-code.md §6).
const aiMoveOptions = (env, e, mv) => aiNextTargets(env, e, mv).flatMap(({ targets, p }) => {
  let combos = [{ score: -Infinity, p }];
  for (const bi of targets) {
    if (bi === BattlerIndex.ATTACKER) break;
    const branches = aiTargetScore(env, e, mv, bi);
    combos = combos.flatMap(c => branches.map(br => ({ score: Math.max(c.score, br.score), p: c.p * br.p })));
  }
  return combos.map(c => ({ targets, ...c }));
});

// The chance this move passes step 5's KO filter (game-code.md §6).
const aiKoChance = (env, e, pm) => {
  const mv = pm.getMove();
  if (mv.moveTarget === MoveTarget.ATTACKER || mv.category === MoveCategory.STATUS) return 0;
  const f = env.slots;
  const crit = aiHas(mv, "CritOnlyAttr") || !!e.getTag("ALWAYS_CRIT");
  let chance = 0;
  for (const mt of aiMoveTargets(e, mv)) {
    const ko = mt.targets.map(i => f[i]).filter(p => e.isPlayer() !== p.isPlayer()).some(p =>
      !env.s.arena.isMoveWeatherCancelled(e, mv) && !env.s.arena.isMoveTerrainCancelled(e, [p.getBattlerIndex()], mv)
      && (mv.applyConditions(e, p, -1) || NO_CONDITION_CHECK.includes(mv.id))
      && p.getAttackDamage({ source: e, move: mv, ignoreAbility: !p.waveData.abilityRevealed, ignoreSourceAbility: false,
        ignoreAllyAbility: !p.getAlly?.()?.waveData.abilityRevealed, ignoreSourceAllyAbility: false, isCritical: crit, simulated: true }).damage >= p.hp);
    if (ko) chance += mt.p;
  }
  return chance;
};

// Step 8: the chance the pick ends on each index of the score-sorted pool (game-code.md §6).
const aiChain = (aiType, scores) => {
  const out = [];
  let reach = 1;
  scores.forEach((x, i) => {
    let adv = 0;
    if (i < scores.length - 1) {
      if (aiType === AiType.SMART_RANDOM) adv = 3 / 8;
      else { const r = scores[i + 1] / x; adv = r >= 0 ? Math.min(Math.max(Math.round(r * 50), 0), 100) / 100 : 0; }
    }
    out.push(reach * (1 - adv));
    reach *= adv;
  });
  return out;
};

// `getNextMove`, every outcome with its chance (game-code.md §6), as JSON-safe rows.
const aiDistribution = (env, e) => {
  const moveset = movesetOf(e);
  const rows = new Map();
  const typeOf = mv => { try { return TYPES[e.getMoveType(mv)] ?? TYPES[mv.type]; } catch { return TYPES[mv.type]; } };
  // `id` only for a queued move that isn't in the moveset (called by another move).
  const row = (pm, id = STRUGGLE) => {
    const slot = pm ? moveset.indexOf(pm) : id === STRUGGLE ? -1 : null;
    const k = pm ? slot : `id${id}`;
    if (!rows.has(k)) {
      const mv = pm?.getMove();
      rows.set(k, {
        name: pm ? pm.getName() : id === STRUGGLE ? "Struggle" : `#${id}`, id: mv?.id ?? id, slot,
        type: mv ? typeOf(mv) : "Normal", cat: mv ? ["physical", "special", "status"][mv.category] : "physical",
        spread: SPREAD_TARGETS.includes(mv?.moveTarget), p: 0, score: null, scoreW: 0, tp: new Map(),
      });
    }
    return rows.get(k);
  };
  // `score` is averaged over the outcomes where the move is in the pool (`inPool` = that outcome's chance).
  const add = (r, p, targetDist, score = null, inPool = 0) => {
    r.p += p;
    if (score != null) { r.score = (r.score ?? 0) + score * inPool; r.scoreW += inPool; }
    for (const t of targetDist) for (const bi of t.targets) r.tp.set(bi, (r.tp.get(bi) ?? 0) + p * t.p);
  };
  const whole = (pm, p = 1) => add(row(pm), p, aiNextTargets(env, e, pm.getMove()));

  for (const q of e.getMoveQueue()) {
    const pm = moveset.find(m => m.moveId === q.move);
    if (q.useMode >= MoveUseMode.INDIRECT || (pm && usableFor(pm, e, q.useMode >= MoveUseMode.IGNORE_PP))) {
      add(row(pm, q.move), 1, [{ targets: q.targets ?? [], p: 1 }]);
      return finish(rows);
    }
  }
  const pool = moveset.filter(pm => usableFor(pm, e));
  if (!pool.length) {
    const opp = e.getOpponents().map(p => p.getBattlerIndex());
    add(row(null), 1, opp.map(bi => ({ targets: [bi], p: 1 / opp.length })));
    return finish(rows);
  }
  if (pool.length === 1) { whole(pool[0]); return finish(rows); }
  const encore = e.getTag("ENCORE");
  const encored = encore && pool.find(pm => pm.moveId === encore.moveId);
  if (encored) { whole(encored); return finish(rows); }
  if (e.aiType !== AiType.SMART_RANDOM && e.aiType !== AiType.SMART) { pool.forEach(pm => whole(pm, 1 / pool.length)); return finish(rows); }

  let outcomes = [{ passing: [], p: 1 }];
  for (const pm of pool) {
    const c = aiKoChance(env, e, pm);
    outcomes = outcomes.flatMap(o => [
      ...(c > 0 ? [{ passing: [...o.passing, pm], p: o.p * c }] : []),
      ...(c < 1 ? [{ passing: o.passing, p: o.p * (1 - c) }] : []),
    ]);
  }
  const options = new Map();
  const optionsOf = pm => { if (!options.has(pm)) options.set(pm, aiMoveOptions(env, e, pm.getMove())); return options.get(pm); };
  for (const o of outcomes) {
    const movePool = o.passing.length ? o.passing : pool;
    let combos = [{ picks: [], p: o.p }];
    for (const pm of movePool) combos = combos.flatMap(c => optionsOf(pm).map(opt => ({ picks: [...c.picks, opt], p: c.p * opt.p })));
    for (const c of combos) {
      const order = movePool.map((_, i) => i);
      order.sort((a, b) => { const x = c.picks[a].score, y = c.picks[b].score; return x < y ? 1 : x > y ? -1 : 0; });
      const chain = aiChain(e.aiType, order.map(i => c.picks[i].score));
      order.forEach((i, k) => {
        const pick = c.picks[i];
        add(row(movePool[i]), c.p * chain[k], [{ targets: pick.targets, p: 1 }], pick.score, c.p);
      });
    }
  }
  return finish(rows);
};
// `getNextMove` replayed against `target`, which need not be on the field (game-code.md §6). `hp`: its HP by then.
// Rows as `sceneDistribution`'s, without targets.
export const sceneReplayAI = (env, e, target, { hp = target.hp, bi = target.isOnField?.() ? target.getBattlerIndex() : BattlerIndex.PLAYER } = {}) =>
  keepTurnData([...env.field, target], () => forcedRng(env.s, () => {
    const moveset = movesetOf(e);
    const rows = new Map();
    // A virtual move the foe has queued need not be in its moveset, so a row with no slot is keyed by move id.
    const add = (pm, p, score = null, id = STRUGGLE) => {
      const k = pm ? moveset.indexOf(pm) : id === STRUGGLE ? -1 : `id${id}`;
      if (!rows.has(k)) {
        const mv = pm?.getMove();
        rows.set(k, { name: pm ? pm.getName() : id === STRUGGLE ? "Struggle" : `#${id}`, id: mv?.id ?? id, slot: typeof k === "number" ? k : null,
          type: mv ? TYPES[e.getMoveType(mv)] ?? TYPES[mv.type] : "Normal",
          cat: mv ? ["physical", "special", "status"][mv.category] : "physical", p: 0, score, targets: [], targetDist: [] });
      }
      rows.get(k).p += p;
    };
    const done = () => [...rows.values()].filter(r => r.p > 1e-12).sort((a, b) => b.p - a.p);
    for (const q of e.getMoveQueue()) {
      const pm = moveset.find(m => m.moveId === q.move);
      if (q.useMode >= MoveUseMode.INDIRECT) { add(pm ?? null, 1, null, q.move); return done(); }
      if (pm && usableFor(pm, e, q.useMode >= MoveUseMode.IGNORE_PP)) { add(pm, 1); return done(); }
    }
    const pool = moveset.filter(pm => usableFor(pm, e));
    if (!pool.length) { add(null, 1); return done(); }
    const encore = e.getTag("ENCORE");
    const only = pool.length === 1 ? pool[0] : encore && pool.find(pm => pm.moveId === encore.moveId);
    if (only) { add(only, 1); return done(); }
    if (e.aiType !== AiType.SMART_RANDOM && e.aiType !== AiType.SMART) { pool.forEach(pm => add(pm, 1 / pool.length)); return done(); }
    const aiView = { ignoreAbility: !target.waveData?.abilityRevealed, ignoreSourceAbility: false,
      ignoreAllyAbility: !target.getAlly?.()?.waveData?.abilityRevealed, ignoreSourceAllyAbility: false, simulated: true };
    const kos = pool.filter(pm => {
      const mv = pm.getMove();
      if (mv.moveTarget === MoveTarget.ATTACKER || mv.category === MoveCategory.STATUS || env.s.arena.isMoveWeatherCancelled(e, mv) || env.s.arena.isMoveTerrainCancelled(e, [bi], mv)) return false;
      if (!(mv.applyConditions(e, target, -1) || NO_CONDITION_CHECK.includes(mv.id))) return false;
      const crit = aiHas(mv, "CritOnlyAttr") || !!e.getTag("ALWAYS_CRIT");
      return target.getAttackDamage({ source: e, move: mv, ...aiView, isCritical: crit }).damage >= hp;
    });
    const movePool = kos.length ? kos : pool;
    // An own-side move is scored on the foe itself (game-code.md §6); one with no target at all scores −∞.
    const branchesOf = mv => {
      const outs = aiMoveTargets(e, mv);
      if (outs.every(o => !o.targets.length) || outs.some(o => o.targets.includes(BattlerIndex.ATTACKER))) return [{ score: -Infinity, p: 1 }];
      if (outs.every(o => o.targets.every(t => (t < BattlerIndex.ENEMY) === e.isPlayer()))) return aiMoveOptions(env, e, mv);
      return aiTargetScore(env, e, mv, bi, target);
    };
    let combos = [{ picks: [], p: 1 }];
    for (const pm of movePool) {
      const branches = branchesOf(pm.getMove());
      combos = combos.flatMap(c => branches.map(br => ({ picks: [...c.picks, br], p: c.p * br.p })));
    }
    for (const c of combos) {
      const order = movePool.map((_, i) => i);
      order.sort((a, b) => { const x = c.picks[a].score, y = c.picks[b].score; return x < y ? 1 : x > y ? -1 : 0; });
      const chain = aiChain(e.aiType, order.map(i => c.picks[i].score));
      order.forEach((i, k) => add(movePool[i], c.p * chain[k], c.picks[i].score));
    }
    return done();
  }));

// `targetDist`: the chance of each battler index given this move; `score`: the AI's average score for it.
const finish = rows => [...rows.values()].filter(r => r.p > 1e-12).map(({ tp, scoreW, score, ...r }) => {
  const targetDist = [...tp].map(([battlerIndex, p]) => ({ battlerIndex, p: p / r.p })).sort((a, b) => b.p - a.p);
  return { ...r, score: score == null ? null : Number.isFinite(score / (scoreW || 1)) ? score / (scoreW || 1) : null, targets: targetDist.map(t => t.battlerIndex), targetDist };
}).sort((a, b) => b.p - a.p);

// The enemy's exact move (game-code.md §6, #158): every foe in one sandbox, in field order, so slot 1 sees slot 0's
// draws. A failure gives a reason and nothing else: the caller never substitutes the distribution (#183).
export const EXACT_PAST_PIN = "the live build's enemy AI moved past the pin";
export const EXACT_THREW = "the enemy AI call threw";
export const EXACT_BREACH = "the enemy AI call breached its sandbox";

// Off the prototype: a probe or an extension that wrapped one mon's `getNextMove` would be asked instead of the game.
const protoNextMove = e => { try { return Object.getPrototypeOf(e)?.getNextMove; } catch { return null; } };

// A `TurnMove` as a row in `finish`'s shape.
const exactRow = (e, tm) => {
  const moveset = movesetOf(e);
  const pm = moveset.find(m => m.moveId === tm.move) ?? null;
  const mv = pm?.getMove?.() ?? null;
  const targets = [...(tm.targets ?? [])];
  let type = "Normal";
  if (mv) { try { type = TYPES[e.getMoveType(mv)] ?? TYPES[mv.type]; } catch { type = TYPES[mv.type]; } }
  return {
    name: pm ? pm.getName() : tm.move === STRUGGLE ? "Struggle" : `#${tm.move}`,
    id: mv?.id ?? tm.move, slot: pm ? moveset.indexOf(pm) : tm.move === STRUGGLE ? -1 : null,
    type, cat: mv ? ["physical", "special", "status"][mv.category] : "physical",
    spread: SPREAD_TARGETS.includes(mv?.moveTarget), p: 1, score: null,
    targets, targetDist: targets.map(battlerIndex => ({ battlerIndex, p: 1 })), exact: true,
  };
};

// `foes`: the active foes, already in field order. `ranges`: what our candidate command draws before the enemy
// decides, in draw order.
// @only 25-turn, tests: sceneExactMoves
export const sceneExactMoves = (env, foes, ranges = []) => {
  const s = env.s;
  const battle = s?.currentBattle;
  // `randSeedInt` is only needed to make our own command's draws: a turn with none is not gated on it.
  if (!battle || (ranges.length && typeof battle.randSeedInt !== "function")) return { ok: false, reason: EXACT_PAST_PIN };
  const calls = foes.map(e => [e, protoNextMove(e)]);
  if (calls.some(([, f]) => typeof f !== "function")) return { ok: false, reason: EXACT_PAST_PIN };
  const saved = foes.map(e => { const arr = e.summonData?.moveQueue; return [e, arr, arr ? [...arr] : null]; });
  // `getNextMove` can clear the queue by assigning a new array (game-code.md §6), so the old array goes back too.
  const restore = () => { for (const [e, arr, items] of saved) if (arr) { arr.splice(0, arr.length, ...items); e.summonData.moveQueue = arr; } };
  const before = sandboxBreachCount();
  let rows;
  try {
    rows = sandbox(s, () => {
      for (const r of ranges) if (r > 1) battle.randSeedInt(r);
      return calls.map(([e, f]) => [e, exactRow(e, f.call(e))]);
    });
  } catch {
    return { ok: false, reason: EXACT_THREW };
  } finally { restore(); }
  if (sandboxBreachCount() !== before) return { ok: false, reason: EXACT_BREACH };
  return { ok: true, moves: new Map(rows) };
};

// `outcomesOf(e, foe)` is the turn's own read of what `e` does to `foe`: this file makes no game call for it.
export const approxDistribution = (e, outcomesOf) => {
  try {
    const best = new Map();
    for (const o of e.getOpponents?.() ?? []) {
      for (const x of outcomesOf(e, o)) {
        const cur = best.get(x.name);
        const ko = x.dmg >= o.hp || !!cur?.ko;
        if (!cur || x.dmg > cur.dmg) best.set(x.name, { ...x, ko, target: o.getBattlerIndex?.() });
        else cur.ko = ko;
      }
    }
    let pool = [...best.values()];
    if (pool.some(x => x.ko)) pool = pool.filter(x => x.ko);
    pool.sort((a, b) => b.dmg - a.dmg);
    const chain = aiChain(e.aiType === AiType.SMART_RANDOM ? AiType.SMART_RANDOM : AiType.SMART, pool.map(x => x.dmg));
    return pool.map((x, i) => ({
      name: x.name, type: x.type, cat: x.cat, spread: x.spread, p: chain[i], score: x.dmg, approx: true,
      targets: x.target == null ? [] : [x.target], targetDist: x.target == null ? [] : [{ battlerIndex: x.target, p: 1 }],
    })).filter(r => r.p > 0);
  } catch { return []; }
};

// `[{ name, id, slot /* index in e's moveset, −1 Struggle */, type, cat, spread, p, score, targets, targetDist }]`
// @only 25-turn, tests: sceneDistribution, sceneReplayAI, sceneSwitches, sceneSendInScore, aiTargetScore
export const sceneDistribution = (env, e) => keepTurnData(env.field, () => forcedRng(env.s, () => aiDistribution(env, e)));

// `skipTurn` (game-code.md §7): no move and no switch.
export const skipsTurn = (env, e) => !!env.mysteryEncounter?.skipEnemyBattleTurns
  || !!(env.double && e.getAlly?.()?.getTag?.("COMMANDED") && [e.getAbility?.(), e.hasPassive?.() && e.getPassiveAbility?.()].some(a => a?.id === AbilityId.COMMANDER));

// `EnemyCommandPhase`'s switch check (game-code.md §7). Both slots can name the same party index, and slot 1 then
// brings back the mon slot 0 withdrew (#285): so the index is asked of the live party and the arrival read off a
// replay of the game's swap. `back` marks such a return.
export const sceneSwitches = (env, active) => {
  const tr = env.trainer;
  const out = new Map();
  if (!tr?.getPartyMemberMatchupScores) return out;
  const party = [...env.foes];
  const slots = [...active].sort((x, y) => (x.getFieldIndex?.() ?? 0) - (y.getFieldIndex?.() ?? 0));
  let counter = env.enemySwitchCounter ?? 0;
  for (const e of slots) {
    let switched = false;
    try {
      if (!e.getMoveQueue().length && !e.isTrapped()) {
        const scores = tr.getPartyMemberMatchupScores(e.trainerSlot, true);
        if (scores.length) {
          const own = e.getOpponents().map(o => e.getMatchupScore(o));
          const avg = own.reduce((t, x) => t + x, 0) / own.length;
          const best = tr.getSortedPartyMemberMatchupScores(scores)[0][1];
          const w = 1 - (counter ? 0.1 ** (1 / counter) : 0);
          if (best * w >= avg * (tr.config.isBoss ? 2 : 3)) {
            switched = true;
            const i = tr.getNextSummonIndex(e.trainerSlot, scores);
            const to = party[i];
            // A skipped command never runs its swap (game-code.md §7).
            if (to && !skipsTurn(env, e)) {
              out.set(e, { to, ratio: 1, back: !!to.isOnField?.() });
              // An on-field mon's party index is its field index (game-code.md §7).
              const fi = e.getFieldIndex?.() ?? env.foes.indexOf(e);
              if (fi >= 0) { party[i] = party[fi]; party[fi] = to; }
            }
          }
        }
      }
    } catch {}
    counter = switched ? counter + 1 : Math.max(counter - 1, 0);
  }
  return out;
};

// Asked with our HP at 0, which leaves the HP factor at 1 unless `f` is slower and at 20–40 % HP (game-code.md §7).
// The plan puts our HP back itself.
export const sceneSendInScore = (env, f, me) => {
  const v = f.getMatchupScore(Object.create(me, { hp: { value: 0 } }));
  return Number.isFinite(v) ? v : null;
};
