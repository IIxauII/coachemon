// Battle planning: who should be on the field, what each slot does, and the per-foe rows.
// While the game waits for a command, the numbers come from its own code (`moveOutcomes`/`moveOutcome` in
// 10-damage, `enemyMoveDistribution` in 20-enemy-ai); otherwise — and in mocks without those — from the `hits`
// approximation, so the panel always renders.

// ---- When a switch is free (read from the live build's phases; see game-code.md §9)
// - CheckSwitchPhase ("Will you switch Pokémon?" → CONFIRM): queued only when an encounter starts — EncounterPhase.end,
//   a mystery-encounter battle, a loaded save, a retry — never in trainer battles (battleType 1) and never when a
//   trainer sends in its next mon; skipped under battle style "Set", or when the mon is trapped, frenzied or
//   commanded, or no bench mon is healthy. Doubles ask once per slot. Yes → SwitchPhase → the swap happens before
//   TurnInitPhase: no enemy hit, no turn lost, and the enemy picks its first command against our new field.
// - Faint replacement (FaintPhase → SwitchPhase modal, no return) runs after TurnEndPhase: free too.
// - U-turn / Volt Switch / Baton Pass / Eject Button (a deferred SwitchPhase with return) switch mid-turn: the
//   enemy's already-chosen moves still land on the switch-in if it moves later. Not free.
// - A regular switch command resolves before moves: the switch-in takes the hit, its move waits a turn.
// Both prompts wait on UI input with no phase mid-execution, so the sandboxed game calls are as safe as in the
// CommandPhase — though turnData isn't reset until TurnInitPhase.
const plannerReady = s => awaitingDecision(s) !== null;

// The same damage and threat numbers are asked for many times in one refresh (every candidate field, the rows, the
// team plan). They only change with the turn, someone's HP or who is on the field.
let plannerMemo = { key: null, map: new Map() };
const planMemo = (s, k, fn) => {
  const b = s.currentBattle;
  const mons = [...(s.getPlayerParty?.() ?? []), ...(s.getEnemyParty?.() ?? [])];
  const key = [b?.waveIndex, b?.turn, b?.enemySwitchCounter, awaitingDecision(s),
    ...mons.map(p => p && `${p.id}:${p.hp}:${p.bossSegmentIndex ?? ""}:${p.isOnField?.() ? 1 : 0}`)].join("|");
  if (plannerMemo.key !== key) plannerMemo = { key, map: new Map() };
  if (!plannerMemo.map.has(k)) plannerMemo.map.set(k, fn());
  return plannerMemo.map.get(k);
};

const pmName = pm => pm?.getName?.() ?? pm?.name ?? "";
const bossBarsLeft = p => (p.isBoss?.() && p.bossSegments > 1 ? Math.max(1, (p.bossSegmentIndex ?? p.bossSegments - 1) + 1) : 1);
const healAtEnd = (s, p) => (plannerReady(s) && typeof endOfTurnHeal === "function" ? endOfTurnHeal(p) || 0 : 0);
// "Triple Axel ×3", "Bullet Seed ×2–5": multi-hit moves change KO math more than their power suggests.
const hitCounts = o => {
  const ns = (o?.dist ?? []).filter(d => d.p > 0).map(d => d.n);
  if (!ns.length || Math.max(...ns) <= 1) return null;
  return Math.min(...ns) === Math.max(...ns) ? `${ns[0]}` : `${Math.min(...ns)}–${Math.max(...ns)}`;
};

// All hits of the likeliest hit count at max roll, before any boss-bar clamp.
const rawMax = o => {
  const n = o.dist?.length ? o.dist.reduce((b, d) => (d.p > b.p ? d : b)).n : 1;
  return o.perHit?.length ? o.perHit.slice(0, n).reduce((t, h) => t + (h.max ?? 0), 0) : o.max;
};
// P(foe uses a Protect-type move this turn), from the enemy AI's distribution (game code only).
const protectChance = (s, foe) => planMemo(s, `protect:${foe.id}`, () => {
  if (!plannerReady(s) || !foe.isOnField?.() || typeof enemyMoveDistribution !== "function") return 0;
  return (enemyMoveDistribution(s, foe) ?? []).reduce((sum, d) => {
    const pm = foe.moveset[d.slot] ?? foe.moveset.find(m => m?.getName() === d.name);
    const mv = pm?.getMove?.();
    return sum + (mv && hasAttr(mv, "ProtectAttr") ? d.p : 0);
  }, 0);
});

// Fallback only: the game applies ¾ spread damage itself when a spread move has two or more targets.
const spreadMult = (s, atk) => {
  if (!s.currentBattle?.double) return 1;
  const enemies = s.getEnemyParty?.() ?? [];
  const mine = enemies.includes(atk);
  return (s.getField?.() ?? []).filter(p => p && p.hp > 0 && enemies.includes(p) !== mine).length >= 2 ? 0.75 : 1;
};

// Every usable damaging move of `atk` into `def`, in the damage module's record shape plus `pm` (the moveset entry,
// for turn order) and `dmg` (expected damage, what the rows show).
const planOutcomes = (s, atk, def) => planMemo(s, `o:${atk.id}>${def.id}`, () => {
  const pmOf = name => atk.moveset.find(m => m?.getName() === name) ?? null;
  if (plannerReady(s) && typeof moveOutcomes === "function") {
    const live = moveOutcomes(s, atk, def);
    if (live?.length) return live.map(o => ({ ...o, pm: pmOf(o.name), dmg: o.expected, live: true }));
  }
  const foe = (s.getEnemyParty?.() ?? []).includes(atk);
  const mult = spreadMult(s, atk);
  const bars = bossBarsLeft(def);
  return hits(atk, def, foe).map(x => {
    const dmg = x.dmg * (x.spread ? mult : 1);
    return { ...x, dmg, pm: pmOf(x.name) ?? x, expected: dmg, max: dmg, acc: 1, dist: [{ n: 1, p: 1 }], notes: [], pKo: bars <= 1 && dmg >= def.hp ? 1 : 0, live: false };
  });
});

// P(a acts before b) this turn. A null move is a switch/item/run, which resolves before any move. Otherwise
// priority, then bracket (Quick Claw 10 %/stack, Quick Draw 30 % for attacks → first in bracket), then effective
// Speed, reversed under Trick Room; ties are a coin flip.
const NO_MOVE_INFO = { priority: 0 };
const quickChance = (p, mv) => {
  let stack = 0;
  for (const m of p.getHeldItems?.() ?? []) if (m.constructor?.name === "BypassSpeedChanceModifier") stack += m.getStackCount?.() ?? 1;
  const draw = abilitiesOf(p).includes("Quick Draw") && mv?.category !== 2 ? 0.3 : 0;
  return 1 - (1 - Math.min(1, 0.1 * stack)) * (1 - draw);
};
const actionOrder = (s, a, aPm, b, bPm) => {
  if (!aPm || !bPm) return !aPm && !bPm ? 0.5 : aPm ? 0 : 1;
  const info = (p, pm) => {
    const mv = pm.getMove?.() ?? pm;
    const priority = mv.getPriority ? mv.getPriority(p, true) : mv.priority ?? 0;
    const bracket = mv.getPriorityModifier ? mv.getPriorityModifier(p, true) : 1;
    return { priority, bracket, quick: bracket === 1 ? quickChance(p, mv) : 0 };
  };
  const x = info(a, aPm), y = info(b, bPm);
  if (x.priority !== y.priority) return x.priority > y.priority ? 1 : 0;
  const speed = p => (p.getEffectiveStat ? p.getEffectiveStat(5) : stat(p, 5));
  const sa = speed(a), sb = speed(b);
  const trickRoom = !!s.arena?.getTag?.("TRICK_ROOM");
  const bySpeed = sa === sb ? 0.5 : (sa > sb) !== trickRoom ? 1 : 0;
  const cmp = (ba, bb) => (ba === bb ? bySpeed : ba > bb ? 1 : 0);
  const qa = x.quick, qb = y.quick;
  return qa * qb * cmp(2, 2) + qa * (1 - qb) * cmp(2, y.bracket) + (1 - qa) * qb * cmp(x.bracket, 2) + (1 - qa) * (1 - qb) * cmp(x.bracket, y.bracket);
};

// What `foe` is likely to use on `me`, as [{ o (outcome or null for status moves), name, type, p }]. The enemy AI's
// own distribution when the foe is on the field and the game waits for a command — it was scored against our mon
// on the field, which is also what a switch-in eats this turn. For next turn (`next`), or a foe not yet on the
// field, the AI's rule is replayed on damage: moves that KO go first, then the SMART chain with damage standing in
// for the move score. Without game code: the hardest-hitting move, always.
// A foe with nobody to aim at (our slot is empty while we pick a fainted mon's replacement) has no real distribution:
// the AI scores every move −∞ and the chain stops on the first, so the replay path answers instead.
const likelyMoves = (s, foe, me, outs, next) => {
  const live = plannerReady(s);
  if (live && !next && foe.isOnField?.() && (foe.getOpponents?.() ?? [me]).length && typeof enemyMoveDistribution === "function") {
    const dist = enemyMoveDistribution(s, foe);
    if (dist?.length) {
      const idx = me.isOnField?.() ? me.getBattlerIndex?.() : null;
      return dist.map(d => {
        const o = outs.find(x => x.name === d.name) ?? null;
        // Share of this move that lands on `me` (doubles). A bench mon coming in takes an average slot's share.
        const ts = d.targetDist?.length ? d.targetDist : d.targets ?? [];
        let tp = 1;
        if (s.currentBattle?.double && ts.length) {
          if (typeof ts[0] === "object") tp = o?.spread ? 1 : idx == null ? ts.reduce((t, x) => t + (x.p ?? 0), 0) / 2 : ts.find(x => x.battlerIndex === idx)?.p ?? 0;
          else tp = o?.spread ? (idx == null || ts.includes(idx) ? 1 : 0) : idx == null ? 1 / 2 : ts.includes(idx) ? 1 / ts.length : 0;
        }
        return { o, name: d.name, type: d.type ?? o?.type, p: d.p * tp };
      });
    }
  }
  const pool = outs.filter(o => o.expected > 0).sort((a, b) => b.expected - a.expected);
  if (!pool.length) return [];
  if (!live || !pool[0].live) {
    const top = pool.reduce((w, o) => (o.max > w.max ? o : w));
    return [{ o: top, name: top.name, type: top.type, p: 1 }];
  }
  const kos = pool.filter(o => (o.perHit?.[0]?.max ?? o.max) >= me.hp);
  const list = kos.length ? kos : pool;
  if (foe.aiType === 0) return list.map(o => ({ o, name: o.name, type: o.type, p: 1 / list.length }));
  const advance = i => (foe.aiType === 1 ? 0.375 : Math.min(1, Math.round(list[i + 1].expected / list[i].expected * 50) / 100));
  let reach = 1;
  return list.map((o, i) => {
    const stop = i < list.length - 1 ? 1 - advance(i) : 1;
    const p = reach * stop;
    reach *= 1 - stop;
    return { o, name: o.name, type: o.type, p };
  });
};

// P(`p` gets to use `mv` this turn, or next turn with `next`), as MovePhase rolls it in the live build: recharging
// after Hyper Beam → 0 (this turn only); asleep → 0 until its sleep counter runs out (one faster with Early Bird)
// unless the move works asleep (Sleep Talk, Snore); frozen → 1/4 thaw, sure once its freeze counter runs out, or a
// move that thaws the user; paralysis → 7/8; confused with turns left → 2/3.
const actChance = (p, mv = null, next = false) => {
  const later = next ? 1 : 0;
  if (!next && p.getTag?.("RECHARGING")) return 0;
  const moveHas = (name, test = () => true) => (mv?.attrs ?? []).some(a => a.constructor?.name === name && test(a));
  const st = p.status;
  let q = 1;
  if (st?.effect === 4 && !moveHas("BypassSleepAttr")) {
    const early = p.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr") ? 1 : 0;
    if ((st.sleepTurnsRemaining ?? 0) - 1 - later - early * (1 + later) > 0) return 0;
  }
  if (st?.effect === 5 && !moveHas("HealStatusEffectAttr", a => a.selfTarget) && (st.freezeTurnsRemaining ?? 0) - 1 - later > 0) q *= 0.25;
  if (st?.effect === 3) q *= 7 / 8;
  const confused = p.getTag?.("CONFUSED");
  if (confused && (confused.turnCount ?? 0) - later > 1) q *= 2 / 3;
  return q;
};
// Turns before `p` can act at all: sleep left, or a recharge turn now.
const actDelay = p => {
  if (p.getTag?.("RECHARGING")) return 1;
  const st = p.status;
  if (st?.effect !== 4) return 0;
  const early = p.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr") ? 1 : 0;
  return Math.max(0, Math.ceil((st.sleepTurnsRemaining ?? 0) / (1 + early)) - 1);
};

// How `foe` threatens `me` over its likely moves: expected damage (for scoring), the worst max roll among moves it
// might realistically pick (for the 💀 flag), P(KO this turn at current HP) with a crit as a small extra risk, and
// P(foe acts before me) — `koFirst` weights that by the moves that KO. `myPm` is our planned move (turn order).
// Damage uses our true abilities (not the AI's view): the AI's blind spots decide what it picks, not what it deals.
// Each move is weighted by the chance the foe gets to use it (`actChance`: sleep, freeze, paralysis, confusion).
const threatFrom = (s, foe, me, myPm = null, { next = false } = {}) => planMemo(s, `t:${foe.id}>${me.id}:${pmName(myPm)}:${next}`, () => {
  const outs = planOutcomes(s, foe, me);
  const moves = likelyMoves(s, foe, me, outs, next);
  if (!moves.length) return null;
  const live = plannerReady(s) && typeof moveOutcome === "function" && outs.some(o => o.live);
  let expected = 0, pKo = 0, first = 0, koFirst = 0, worst = null, likely = null;
  const kos = [];
  for (const m of moves) {
    if (!likely || m.p > likely.p) likely = m;
    if (!(m.p > 0)) continue;
    const pm = m.o?.pm ?? foe.moveset.find(x => x?.getName() === m.name) ?? NO_MOVE_INFO;
    const order = actionOrder(s, foe, pm, me, myPm ?? NO_MOVE_INFO);
    first += m.p * order;
    if (!m.o) continue;
    let ko = m.o.pKo ?? 0;
    if (live && m.p >= 0.1 && ko < 1 && m.o.pm) {
      const crit = moveOutcome(s, foe, me, m.o.pm, { crit: true });
      const cp = m.o.critChance ?? 1 / 24;
      if (crit) ko = (1 - cp) * ko + cp * (crit.pKo ?? 0);
    }
    const p = m.p * actChance(foe, pm.getMove?.() ?? null, next);
    expected += p * m.o.expected;
    pKo += p * ko;
    koFirst += p * ko * order;
    if (p >= 0.05 && (!worst || m.o.max > worst.o.max)) worst = m;
    kos.push({ p, max: m.o.max, pKo: ko, acc: m.o.acc ?? 1 });
  }
  const brief = m => m && { name: m.name, type: m.type, e: m.o?.e ?? null, p: m.p, hits: hitCounts(m.o) };
  return {
    expected, worst: worst?.o.max ?? 0, pKo, first, koFirst: pKo > 0 ? koFirst / pKo : first,
    move: brief(likely), worstMove: brief(worst), moves: kos, hp: me.hp, from: foe.name, live,
  };
});

// P(KO) of a threat against `me` at a different HP (after an incoming hit): below the max roll the chance grows
// with how deep into the 85–100 % roll range the HP sits. Without game code it's all or nothing, like the rest
// of the approximation.
const koChanceAt = (t, hp) => {
  if (!t) return 0;
  if (hp <= 0) return 1;
  if (hp >= t.hp) return t.pKo;
  return Math.min(1, t.moves.reduce((sum, m) => sum + m.p * (m.max < hp ? 0
    : !t.live ? 1 : Math.max(m.pKo, m.acc * Math.min(1, (m.max - hp) / (0.15 * m.max) + 1 / 16))), 0));
};
// Turns a threat needs to KO `me` from `hp`, a heal at turn end included.
const foeTurns = (s, t, me, hp) => (!t || !(t.expected > 0) ? 9
  : koChanceAt(t, hp) >= 0.5 ? 1 : Math.min(9, Math.max(2, turnsToKo(hp + healAtEnd(s, me), t.expected))));

// Hits of `dmgAt(i)` (the i-th use) to clear each HP chunk in turn; a boss bar's boundary wastes the overflow.
const hitsToKo = (chunks, dmgAt) => {
  let n = 0;
  for (let hp of chunks) {
    while (hp > 0 && n < 9) { const d = dmgAt(n); if (!(d > 0)) return 9; hp -= d; n++; }
  }
  return Math.min(9, n);
};

// One-on-one from now: `me` repeats `pm` into `foe` while `foe` answers with its likely moves. Turn 1 is played
// with the real odds — order, accuracy, rolls, crits, Sturdy/Focus Band (inside pKo); later turns by expected
// damage, with boss bars (each clamps a hit at its boundary) and turn-end heals. Options: `hp` (ours after an
// incoming hit), `free` (the foe is switching in and doesn't act this turn), `next` (the foe re-picks its move
// against us next turn), `outcome` (our move's record, if already at hand).
// The move's own costs are priced in: turns (charge, recharge, not twice in a row, Outrage's confusion, falling
// Atk/SpA on repeats, our sleep or paralysis), the HP it costs us (recoil, Steel Beam, crash, contact chip, lowered
// defences, self-KO) and `cost` — our max HP it spends plus a little for a lock-in — for scoring ties.
const exchange = (s, me, pm, foe, opts = {}) => {
  const hp = opts.hp ?? me.hp;
  const mine = opts.outcome ?? planOutcomes(s, me, foe).find(o => o.name === pmName(pm)) ?? null;
  const t = threatFrom(s, foe, me, pm, { next: !!opts.next });
  const pFirst = t ? 1 - (t.pKo > 0 ? t.koFirst : t.first) : 1;
  const pF = opts.free ? 1 : pFirst;
  // Chance our move does its job when chosen: we get to act, Focus Punch isn't hit first, Sucker Punch meets an
  // attack, a foe mid-Dig / Fly has come out first. `steady`: the part that recurs on later turns.
  const foeAttacks = opts.free || !t ? 0 : Math.min(1, t.moves.reduce((sum, m) => sum + m.p, 0));
  const needs = (mine?.interrupt ? 1 - foeAttacks * (1 - pF) : 1) * (mine?.needsAttack ? foeAttacks * pF : 1);
  const steady = (me.status?.effect === 3 ? 7 / 8 : 1) * needs;
  const now = actChance(me, pm?.getMove?.() ?? null, !!opts.next) * needs * (mine?.semi ? 1 - pF : 1);
  const qWe = mine?.charge ? 0 : (mine?.pKo ?? 0) * now;
  const qThey = opts.free ? 0 : koChanceAt(t, hp);
  const maxHp = me.getMaxHp?.() ?? hp;
  let turnsWe = 9, hitsWe = 9, delay = 0, selfSpent = 0, defUp = 1;
  if (mine?.expected > 0) {
    // Mean damage when it lands: misses are already in turn 1's odds, and a boss bar clamps each turn's hit.
    const perTurn = mine.expected / Math.max(mine.acc ?? 1, 0.3) * steady;
    const bars = bossBarsLeft(foe);
    const seg = foe.getMaxHp() / (foe.bossSegments || 1);
    // Overheat-type drops to the stat the move attacks with weaken every repeat.
    const atkStat = mine.cat === "special" ? 3 : 1;
    const drop = mine.drops?.[atkStat] ?? 0;
    const s0 = me.summonData?.statStages?.[atkStat - 1] ?? 0;
    const byTurns = drop
      ? hitsToKo(bars > 1 ? [foe.hp - seg * (bars - 1) + healAtEnd(s, foe), ...Array(bars - 1).fill(seg)] : [foe.hp + healAtEnd(s, foe)],
        i => perTurn * stage(Math.max(-6, s0 + drop * i)) / stage(s0))
      : bars > 1
        ? turnsToKo(foe.hp - seg * (bars - 1) + healAtEnd(s, foe), perTurn) + (bars - 1) * turnsToKo(seg, perTurn)
        : turnsToKo(foe.hp + healAtEnd(s, foe), perTurn);
    hitsWe = (mine.pKo ?? 0) * steady >= 0.5 ? 1 : Math.min(9, Math.max(2, byTurns));
    // Turns around the hits: sleep or a recharge now, a foe hidden mid-Dig that we'd outspeed; a charging turn per
    // hit, a lost turn between hits (recharge, or a move that can't be used twice in a row); Outrage's lock runs
    // 2–3 turns and the confusion after it wastes a third of up to two more hits.
    delay = actDelay(me) + (mine.semi && pF >= 0.5 ? 1 : 0);
    const cycle = mine.recharge || mine.noRepeat ? 2 * hitsWe - 1 : mine.charge ? 2 * hitsWe : hitsWe;
    const confusedHits = mine.lock ? Math.min(Math.max(0, hitsWe - 2), 2) : 0;
    turnsWe = mine.once && hitsWe > 1 ? 9 : Math.min(9, Math.ceil(delay + cycle + confusedHits * 0.5));
    // Confusion hurts itself with a typeless 40-power physical hit a third of the time.
    const confusionHit = confusedHits && ((2 * me.level / 5 + 2) * 40 * stat(me, 1) / stat(me, 2) / 50 + 2) * 0.925;
    selfSpent = (mine.self ?? 0) * Math.min(hitsWe, turnsWe) + confusedHits * 1.5 * confusionHit / 3;
    // Lowered Def / SpD (Close Combat, V-create) after the first use: the foe hits harder on the rest.
    const soften = st => (mine.drops?.[st] ? stage(me.summonData?.statStages?.[st - 1] ?? 0) / stage(Math.max(-6, (me.summonData?.statStages?.[st - 1] ?? 0) + mine.drops[st])) : 1);
    if (hitsWe > 1 && (mine.drops?.[2] || mine.drops?.[4])) defUp = 1 + ((soften(2) + soften(4)) / 2 - 1) * (hitsWe - 1) / hitsWe;
  }
  // Our own toll comes off the HP the foe has to get through (front-loaded); if it alone would drop us, we go down
  // around our last hit.
  const selfKo = mine?.selfKo ?? 0;
  const budget = hp - selfSpent;
  const foeT = defUp > 1 && t ? { ...t, expected: t.expected * defUp } : t;
  let turnsThey = Math.min(9, (budget > 0 ? foeTurns(s, foeT, me, budget) : Math.max(1, Math.min(turnsWe, 9))) + (opts.free ? 1 : 0));
  if (selfKo >= 0.5) turnsThey = Math.min(turnsThey, delay + 1);
  const weFirst = pF * qWe + (1 - pF) * (1 - qThey) * qWe;
  const theyFirst = (1 - pF) * qThey + pF * (1 - qWe) * qThey;
  const rest = Math.max(0, 1 - weFirst - theyFirst);
  const later = turnsWe < turnsThey ? 1 : turnsWe > turnsThey ? 0 : pFirst;
  const taken = turnsWe >= 9 ? turnsThey : Math.max(0, turnsWe - pFirst - (opts.free ? 1 : 0));
  const hpLeft = Math.max(0, hp - (t?.expected ?? 0) * defUp * taken - selfSpent) * (1 - selfKo);
  return {
    pWeKoFirst: weFirst + rest * later, pTheyKoFirst: theyFirst + rest * (1 - later),
    expectedHpLeft: Math.round(hpLeft),
    turnsWe, turnsThey, pFirst, hitsWe,
    cost: Math.min(1, (selfSpent + selfKo * Math.max(0, hp - selfSpent)) / maxHp) + (mine?.lock ? 0.1 : 0),
  };
};

// Who should be on the field now and what each slot does. For doubles every pair of healthy party members is
// tried with every option per slot — a single-target move into either foe, or a spread move into both — scored by
// turns to KO against how fast the worst foe KOs that member, plus who wins the exchange (order, accuracy, KO
// odds), with a bonus for pairs that cover both foes.
// `active`: the foes our moves land on this turn (a predicted switch-in replaces the mon leaving).
// `attackers`: the foes that actually attack this turn — a mon switching out doesn't, nor does its switch-in.
// `freeSwitch`: the game is offering a switch before the turn (CheckSwitchPhase): a switch-in takes no hit and loses
// no turn, so every candidate field starts the coming turn fresh.
// `locked`: slot 1's command phase, with slot 0's command already in (`lockedCommand`): that slot is kept as chosen
// and only its partner is searched.
const fieldPlan = (s, party, active, double, attackers = active, { freeSwitch = false, locked = null } = {}) => {
  // Our side has two slots whenever two of us can stand, even if only one foe is left; `pair`: two foes to aim at.
  const slots = double && party.length >= 2 ? 2 : 1;
  const pair = double && active.length === 2;
  const current = party.filter(p => p.isOnField?.());
  const lock = slots === 2 && locked && party.includes(locked.switchIn ?? locked.me) ? locked : null;

  // A voluntary switch-in is hit before it acts, by moves the AI picked against the mon leaving.
  const inMemo = new Map();
  const incoming = me => {
    if (!inMemo.has(me)) {
      const ts = attackers.map(f => threatFrom(s, f, me)).filter(Boolean).sort((a, b) => b.expected - a.expected);
      // Game-code threats already split single-target moves between our slots; the approximation assumes the
      // worst foe hits it plus half of the other.
      const dmg = ts.some(t => t.live) ? ts.reduce((sum, t) => sum + t.expected, 0) : (ts[0]?.worst ?? 0) + (ts[1]?.worst ?? 0) * 0.5;
      const ko = 1 - ts.reduce((keep, t) => keep * (1 - koChanceAt(t, me.hp)), 1);
      inMemo.set(me, { dmg, ko });
    }
    return inMemo.get(me);
  };

  // `entering`: switched in by choice this turn — it arrives with the incoming hit taken and a turn lost (its move
  // happens next turn, against what the foe then picks for it), and a switch-in likely to be KO'd coming in is
  // never an option. A foe that is itself switching in doesn't attack this turn: a mon that stays gets a free hit.
  // `mine`: slot 0's locked command, when `me` is that slot.
  const options = (me, entering, mine = null) => {
    const inc = entering ? incoming(me) : { dmg: 0, ko: 0 };
    const hp = me.hp - inc.dmg;
    // A switch-in must get to act once: count it lost if it's KO'd coming in, or survives only to be KO'd next
    // turn before it moves (the foe re-picks against it, on the HP the entry hit left).
    const beforeActing = hp <= 0 ? 1 : 1 - active.reduce((keep, f) => {
      const t = threatFrom(s, f, me, null, { next: true });
      return keep * (1 - koChanceAt(t, hp) * (t?.koFirst ?? 0));
    }, 1);
    const lostChance = entering ? inc.ko + (1 - inc.ko) * beforeActing : 0;
    if (hp <= 0 || lostChance >= 0.25) return [{ me, move: null, target: null, turns: 9, hits: 9, score: -99, hp: 0 }];
    const lost = entering ? 1 : 0;
    const free = f => !entering && !attackers.includes(f);
    // A mon not yet on the field faces what the foe picks for it, not the move it chose against the current field.
    const next = entering || !me.isOnField?.();
    const danger = Math.min(...active.map(f => Math.min(9, foeTurns(s, threatFrom(s, f, me, null, { next }), me, hp) + (free(f) ? 1 : 0))));
    const trade = (o, f) => exchange(s, me, o.pm, f, { hp, outcome: o, free: free(f), next });
    const cost = o => (drawback(o) ? DRAWBACK_COST : 0);
    const one = (o, fi) => {
      const x = trade(o, active[fi]);
      const turns = x.turnsWe + lost;
      return { me, move: o, target: fi, turns, hits: x.turnsWe, score: danger - turns + (x.pWeKoFirst - x.pTheyKoFirst) - (x.cost ?? 0) - cost(o), hp };
    };
    // `each`: turns to KO each foe; `hits` is when both are down.
    const both = o => {
      const other = planOutcomes(s, me, active[1]).find(x => x.name === o.name);
      const xs = [trade(o, active[0]), other ? trade(other, active[1]) : null];
      const each = xs.map(x => x?.turnsWe ?? 9);
      const hits = Math.max(...each);
      if (hits + lost >= 9) return null;
      const edge = Math.min(...xs.filter(Boolean).map(x => x.pWeKoFirst - x.pTheyKoFirst - (x.cost ?? 0)));
      return { me, move: o, target: "both", turns: hits + lost, hits, each, score: danger - hits - lost + 1 + edge - cost(o), hp };
    };
    if (mine) {
      // Scored like any option so the partner's search and the joint see it; a move the planner can't score
      // (status, Struggle) is shown as chosen and aims nowhere.
      const name = pmName(mine.pm) || "Struggle";
      const o = mine.target == null ? null : planOutcomes(s, me, active[mine.target === "both" ? 0 : mine.target]).find(x => x.name === name);
      const p = o && (mine.target === "both" ? (pair ? both(o) : one(o, 0)) : one(o, mine.target));
      const mv = mine.pm?.getMove?.();
      const bare = { me, move: { name, type: TYPES[mv?.type] ?? null, cat: mv?.category === 2 ? "status" : null, pm: mine.pm, expected: 0 }, target: null, turns: 9, hits: 9, score: 0, hp };
      return [{ ...(p ?? bare), locked: true }];
    }
    const out = [];
    active.forEach((f, fi) => {
      // Against two foes a spread move always hits both, so it only counts as the "both" option below. Besides the
      // best move, keep the best one without a drawback or a hit on our partner: the pair's score may prefer it.
      let best = null, clean = null;
      const better = (a, b) => !a || b.score > a.score || (b.score === a.score && b.move.expected > a.move.expected);
      for (const o of planOutcomes(s, me, f)) {
        if (!(o.expected > 0) || (pair && o.spread)) continue;
        const x = one(o, fi);
        if (better(best, x)) best = x;
        if (!drawback(o) && !(slots === 2 && hitsAlly(o)) && better(clean, x)) clean = x;
      }
      if (best) out.push(best);
      if (clean && clean !== best) out.push(clean);
    });
    if (pair) {
      for (const o of planOutcomes(s, me, active[0]).filter(x => x.spread && x.expected > 0)) {
        const p = both(o);
        if (p) out.push(p);
      }
    }
    if (!out.length) out.push({ me, move: null, target: null, turns: 9, hits: 9, score: danger - 9, hp });
    return out;
  };
  const cache = new Map();
  const opt = (me, entering) => {
    const mine = lock && !lock.switchIn && me === lock.me ? lock : null;
    const k = `${party.indexOf(me)}|${entering}|${!!mine}`;
    if (!cache.has(k)) cache.set(k, options(me, entering, mine));
    return cache.get(k);
  };

  // Every candidate field. Newcomers fill empty slots (a fainted member's) for free; any beyond that are
  // voluntary switches (`payers`), which take the incoming hit — unless the switch is free. `swaps` counts the
  // voluntary switches either way.
  const empty = Math.max(0, slots - current.length);
  const free = freeSwitch ? slots : empty;
  const plans = [];
  // Per pick, besides its own score: `ally`, what a move that hits every other pokémon (Earthquake, Surf) does to
  // our partner — its damage share, and a heavy cost for a likely KO; `spare`, the pair's other hit already does
  // everything this one does, so a move with a drawback (recoil, recharge, a self stat drop) gives way to one without.
  const add = (picks, payers) => {
    const j = slots === 2 || pair ? joint(picks, payers) : null;
    const swaps = Math.max(0, picks.filter(p => !current.includes(p.me)).length - empty);
    const acting = picks.filter(p => p.move?.pm && !payers.includes(p.me));
    const info = picks.map(p => {
      const partner = picks.find(q => q !== p);
      const ally = acting.includes(p) && partner ? allyHit(p, partner.me) : null;
      const spare = !!j && acting.length === 2 && !p.locked && p.target != null && spareHit(picks, payers, p, j);
      // A KO'd partner is lost along with whatever it was going to do.
      let score = p.score - (ally ? ally.share + ally.pKo * (ALLY_KO_COST + Math.max(0, partner.score)) : 0);
      if (spare && drawback(p.move)) {
        const clean = opt(p.me, payers.includes(p.me)).filter(x => x.move && !drawback(x.move)).reduce((b, x) => (!b || x.score > b.score ? x : b), null);
        if (clean) score = Math.min(score, clean.score) - DRAWBACK_COST;
      }
      return { ally, spare, score };
    });
    plans.push({ picks, payers, info, extra: payers.length, swaps, joint: j, score: info.reduce((t, x) => t + x.score, 0) + (j?.value ?? 0) });
  };
  const allyHit = (p, partner) => {
    if (!hitsAlly(p.move)) return null;
    const o = planOutcomes(s, p.me, partner).find(x => x.name === p.move.name);
    return o?.expected > 0 ? { mon: partner, share: Math.min(1, o.expected / partner.getMaxHp()), pKo: o.pKo ?? 0 } : null;
  };
  // Nothing lost without `p`'s hit: its foes still go down, and the pair's value (KOs, KOs before they move,
  // redirected hits) doesn't drop.
  const spareHit = (picks, payers, p, j) => {
    const targets = p.target === "both" ? active.map((_, i) => i) : [p.target];
    if (!targets.every(t => j.foes[t].pKo >= 0.9)) return false;
    return j.value - joint(picks.filter(q => q !== p), payers, picks.map(q => q.me)).value < 0.1;
  };

  // Doubles: where both slots aim is one decision. Each slot's own score only knows its own hit; this adds what the
  // hits do together this turn, per foe: P(KO'd this turn) — two hits in the order they resolve, boss bars clamping
  // each — plus P(KO'd before it acts) × how much that foe was about to do to us (damage, a KO, a setup move).
  // Overkill isn't wasted: when a foe faints, the game retargets the queued single-target moves aimed at it to its
  // ally (FaintPhase → redirectPokemonMoves), so a later slot's hit lands on the other foe. A slot switching in
  // doesn't hit this turn; one likely KO'd before it moves doesn't either; a foe likely to Protect takes nothing.
  const dangerMemo = new Map();
  const danger = (X, mons) => {
    const k = `${X.id}|${mons.map(m => m.id).join()}`;
    if (!dangerMemo.has(k)) {
      dangerMemo.set(k, !attackers.includes(X) ? 0 : Math.min(2, Math.max(0, ...mons.map(m => {
        const t = threatFrom(s, X, m);
        if (!t) return 0;
        const setup = t.live ? Math.max(0, 1 - t.moves.reduce((sum, x) => sum + x.p, 0)) * 0.5 : 0;
        return t.expected / m.getMaxHp() + koChanceAt(t, m.hp) * t.koFirst * 0.5 + setup;
      }))));
    }
    return dangerMemo.get(k);
  };
  // P(`p`'s hit reaches X): it isn't KO'd before it moves and X doesn't Protect.
  const landOf = (p, X) => attackers.reduce((keep, f) => {
    const t = threatFrom(s, f, p.me, p.move.pm);
    return keep * (1 - koChanceAt(t, p.me.hp) * (t?.koFirst ?? 0));
  }, 1) * (1 - protectChance(s, X));
  // `mons`: whose danger counts (defaults to the picks'; kept whole when a pick is left out to weigh its hit).
  const joint = (picks, payers, mons = picks.map(p => p.me)) => {
    const acting = picks.filter(p => p.move && !payers.includes(p.me));
    const foes = active.map(() => ({ pKo: 0, pBefore: 0, redirect: 0, hitters: 0 }));
    active.forEach((X, xi) => {
      const hitters = acting.map(p => {
        const o = p.target === "both" ? planOutcomes(s, p.me, X).find(x => x.name === p.move.name) : p.target === xi ? p.move : null;
        if (!o) return null;
        const land = landOf(p, X);
        const before = attackers.includes(X) ? 1 - (threatFrom(s, X, p.me, p.move.pm)?.first ?? 0) : 1;
        const acc = Math.max(o.acc ?? 1, 0.01);
        return { p, o, land, before, acc, alone: land * (o.pKo ?? 0), roll: Math.min(1, (o.pKo ?? 0) / acc) };
      }).filter(Boolean);
      const f = foes[xi];
      f.hitters = hitters.length;
      if (hitters.length === 1) {
        f.pKo = hitters[0].alone;
        f.pBefore = hitters[0].before * f.pKo;
      } else if (hitters.length === 2) {
        const [a, b] = hitters;
        const q = actionOrder(s, a.p.me, a.p.move.pm, b.p.me, b.p.move.pm);
        const la = a.land * a.acc, lb = b.land * b.acc;
        f.pKo = la * lb * comboKo(X, a, b, q) + la * (1 - lb) * a.roll + (1 - la) * lb * b.roll;
        f.pBefore = a.before * b.before * f.pKo + a.before * (1 - b.before) * a.alone + (1 - a.before) * b.before * b.alone;
        const Y = active[1 - xi];
        if (Y && a.p.target !== "both" && b.p.target !== "both") {
          const redirect = (first, second) => first.alone * second.land * (planOutcomes(s, second.p.me, Y).find(x => x.name === second.o.name)?.pKo ?? 0);
          foes[1 - xi].redirect += q * redirect(a, b) + (1 - q) * redirect(b, a);
        }
      }
    });
    let value = 0;
    active.forEach((X, xi) => {
      const f = foes[xi];
      f.pKo = 1 - (1 - f.pKo) * (1 - Math.min(1, f.redirect));
      value += f.pKo + f.pBefore * danger(X, mons);
    });
    return { value, foes };
  };
  // P(KO | both hits land), `a` acting first with probability `q`. Without game code rolls are max, as elsewhere.
  const comboKo = (X, a, b, q) => {
    const live = a.o.live || b.o.live;
    const roll = (M, need) => (need <= 0 ? 1 : M < need ? 0 : !live ? 1 : Math.min(1, (M - need) / (0.15 * M) + 1 / 16));
    const alone = Math.max(a.roll, b.roll);
    const bars = bossBarsLeft(X);
    if (bars > 2) return alone;
    if (bars === 2) {
      // The first hit stops at the bar boundary; the second must take a whole bar.
      const seg = X.getMaxHp() / X.bossSegments;
      const order = (x, y) => roll(rawMax(x.o), X.hp - seg) * roll(rawMax(y.o), seg);
      return Math.max(alone, q * order(a, b) + (1 - q) * order(b, a));
    }
    return Math.max(alone, roll(rawMax(a.o) + rawMax(b.o), X.hp));
  };
  const fields = [];
  if (slots === 1 || party.length < 2) party.forEach(p => fields.push([p]));
  else for (let i = 0; i < party.length; i++) for (let j = i + 1; j < party.length; j++) fields.push([party[i], party[j]]);
  // A locked slot 0 stays in every field: its mon, or its switch-in (the mon leaving can't take slot 1 back).
  const kept = lock ? fields.filter(m => m.includes(lock.switchIn ?? lock.me) && !(lock.switchIn && m.includes(lock.me))) : fields;
  for (const members of kept) {
    const newcomers = members.filter(p => !current.includes(p));
    const paying = Math.max(0, newcomers.length - free);
    // With one free slot and two newcomers, either of them could be the one that switches in under fire.
    let assignments = paying === 0 ? [[]] : paying === newcomers.length ? [newcomers] : newcomers.map(p => [p]);
    if (lock?.switchIn && assignments.some(a => a.includes(lock.switchIn))) assignments = assignments.filter(a => a.includes(lock.switchIn));
    for (const payers of assignments) {
      const [a, b] = members.map(p => opt(p, payers.includes(p)));
      if (!b) a.forEach(x => add([x], payers));
      else for (const x of a) for (const y of b) add([x, y], payers);
    }
  }
  if (!plans.length) return null;

  // Stay with the current field unless it is actually failing: a member with nothing that damages, a member
  // that loses its trade, or a switch that is clearly better. Switching costs a turn and a free hit, so a
  // merely better field is shown as an optional hint instead — and when everything fails, staying wins ties.
  // A free switch costs nothing, so only a tiny gain isn't worth the churn.
  const top = list => list.reduce((b, p) => (!b || p.score > b.score ? p : b), null);
  const bestAny = top(plans);
  const bestStay = top(plans.filter(p => p.swaps === 0));
  const failing = plan => plan.picks.some(p => !p.locked && (!p.move || p.score < 0));
  const margin = freeSwitch ? 0.5 : 3;
  const stay = !!bestStay && (failing(bestStay) ? bestAny.score <= bestStay.score : bestAny.score - bestStay.score < margin);
  const best = stay ? bestStay : bestAny;
  const alt = stay && bestAny !== bestStay && bestAny.swaps > 0 ? bestAny : null;

  // How badly a foe hits a slot's pokémon. "ko": likely KO (≥ 50 %) and the foe likely acts first; "risk": a likely
  // KO after we act, a real KO chance, or a super-effective hit for half the HP or more. `next`: the hit comes next
  // turn (a switch-in, ours or theirs), so the tag belongs to the `next` step.
  const RANK = { ko: 2, risk: 1 };
  const tagOf = (t, hp, next) => {
    if (!t?.worstMove || !(t.worst > 0) || hp <= 0) return null;
    const ko = koChanceAt(t, hp);
    const pct = Math.round(t.worst / hp * 100);
    const e = t.worstMove.e ?? 1;
    const first = ko > 0 ? t.koFirst : t.first;
    const level = ko >= 0.5 && first >= 0.5 ? "ko" : ko >= 0.5 || (e >= 2 && pct >= 50) || (t.live && ko >= 0.15) ? "risk" : null;
    return level && {
      level, move: t.worstMove.name, type: t.worstMove.type, e, pct: Math.min(pct, 999), from: t.from,
      pko: t.live ? Math.round(ko * 100) : null, hits: t.worstMove.hits, next,
    };
  };
  const worse = (a, b) => (!a ? b : b && RANK[b.level] > RANK[a.level] ? b : a);
  const nowThreat = me => attackers.reduce((w, f) => worse(w, tagOf(threatFrom(s, f, me), me.hp, false)), null);
  const slotThreat = (p, entering) => {
    const faced = typeof p.target === "number" ? [active[p.target]] : active;
    let tag = entering ? null : nowThreat(p.me);
    for (const f of faced) {
      if (entering || !attackers.includes(f)) tag = worse(tag, tagOf(threatFrom(s, f, p.me, p.move?.pm ?? null, { next: true }), entering ? p.hp : p.me.hp, true));
    }
    return tag;
  };
  // Boss bars and multi-hit moves, where they are what decides the call.
  const notesFor = p => {
    const out = [];
    const foe = typeof p.target === "number" ? active[p.target] : null;
    const bars = foe ? bossBarsLeft(foe) : 1;
    if (p.move && bars > 1 && p.hits > 1 && p.hits <= bars) out.push(`boss: ${bars} bars — no 1HKO`);
    const n = hitCounts(p.move);
    if (n) out.push(`${p.move.name} ×${n}`);
    return out;
  };

  // Why the slots aim where they do, when it isn't obvious: both on one foe, or split because both foes go down.
  const targeting = plan => {
    const acting = plan.picks.filter(p => p.move && !plan.payers.includes(p.me));
    if (!plan.joint || acting.length !== 2 || acting.some(p => p.target === null)) return null;
    const [a, b] = acting;
    if (typeof a.target === "number" && a.target === b.target) {
      const X = active[a.target], f = plan.joint.foes[a.target];
      const note = f.pBefore >= 0.5 && attackers.includes(X) ? "KO before it moves" : f.pKo >= 0.5 ? "KO this turn" : "most damage";
      return { kind: "focus", target: { icon: iconOf(X), name: X.name }, note, pko: Math.round(f.pKo * 100) };
    }
    return plan.joint.foes.every(f => f.pKo >= 0.5) ? { kind: "split", note: "both KO" } : null;
  };

  const swaps = plan => {
    const chosen = plan.picks.map(p => p.me);
    const outs = current.filter(p => !chosen.includes(p));
    return chosen.filter(p => !current.includes(p))
      .map((p, i) => ({ out: outs[i] ? { icon: iconOf(outs[i]), name: outs[i].name, threat: nowThreat(outs[i]) } : null, in: { icon: iconOf(p), name: p.name } }));
  };

  // Support moves, kept conservative (the planner only scores damage): Protect for a slot likely KO'd before it
  // moves whose own hit adds little, while its partner likely KOs that foe before it acts anyway; Helping Hand when
  // the partner's ×1.5 hit turns a foe that likely survives into a likely KO, worth more than this slot's own hit.
  const usablePm = pm => pm && (pm.getMovePp?.() ?? 1) - (pm.ppUsed ?? 0) > 0;
  // A Protect after a successful one only works 1 time in 3.
  const protectedLast = me => {
    const last = me.getLastXMoves?.(1)?.[0];
    return !!last && last.result === 1 && me.moveset.some(pm => pm?.moveId === last.move && hasAttr(pm.getMove(), "ProtectAttr"));
  };
  const boostedKo = (b, X) => {
    if (bossBarsLeft(X) > 1) return 0;
    const o = b.target === "both" ? planOutcomes(s, b.me, X).find(x => x.name === b.move.name) : b.move;
    if (!o) return 0;
    const M = rawMax(o) * 1.5;
    const roll = M < X.hp ? 0 : !o.live ? 1 : Math.min(1, (M - X.hp) / (0.15 * M) + 1 / 16);
    return landOf(b, X) * Math.max(o.pKo ?? 0, (o.acc ?? 1) * roll);
  };
  const supportFor = plan => {
    const out = new Map();
    if (plan.picks.length !== 2 || !plan.joint) return out;
    const mons = plan.picks.map(p => p.me);
    plan.picks.forEach((a, i) => {
      const b = plan.picks[1 - i];
      if (a.locked || !a.move || !b.move?.pm || b.target == null || plan.payers.includes(a.me) || plan.payers.includes(b.me)) return;
      const alone = joint([b], plan.payers, mons);
      const protect = a.me.moveset.find(pm => usablePm(pm) && hasAttr(pm.getMove(), "ProtectAttr"));
      if (protect && !protectedLast(a.me) && plan.joint.value - alone.value < 0.5) {
        const X = attackers.find(f => {
          const xi = active.indexOf(f);
          const t = threatFrom(s, f, a.me, a.move.pm);
          return xi >= 0 && koChanceAt(t, a.me.hp) * (t?.koFirst ?? 0) >= 0.5 && alone.foes[xi].pBefore >= 0.5;
        });
        if (X) { out.set(a, { kind: "protect", pm: protect, note: `${b.me.name} KOs ${X.name} first` }); return; }
      }
      const hh = a.me.moveset.find(pm => usablePm(pm) && (pm.getMove().id === 270 || pmName(pm) === "Helping Hand"));
      if (!hh) return;
      const ts = b.target === "both" ? active.map((_, t) => t) : [b.target];
      let gain = 0, turned = null;
      active.forEach((X, t) => {
        const ko = ts.includes(t) ? Math.max(alone.foes[t].pKo, boostedKo(b, X)) : alone.foes[t].pKo;
        gain += ko - plan.joint.foes[t].pKo;
        if (ko >= 0.5 && plan.joint.foes[t].pKo < 0.5) turned = X;
      });
      if (turned && gain >= 0.25) out.set(a, { kind: "helping-hand", pm: hh, helps: b, note: `${b.me.name} KOs ${turned.name}` });
    });
    return out;
  };
  const support = supportFor(best);
  // The rows read these picks: a slot on a support move isn't hitting anything, and a helped hit KOs now.
  const helps = new Set([...support.values()].map(x => x.helps));
  const picks = best.picks.map(p => (support.has(p) ? { ...p, move: null, target: null } : helps.has(p) && typeof p.target === "number" ? { ...p, hits: 1 } : p));

  return {
    picks, // live objects for the per-foe rows; not part of the JSON-safe view
    view: {
      optional: alt ? swaps(alt) : [],
      // Staying is failing but every switch-in would be KO'd coming in: say so rather than stay silent.
      noSafeSwitch: !freeSwitch && best.swaps === 0 && failing(best) && party.length > current.length,
      freeSwitch,
      slots: best.picks.map((p, i) => {
        const enter = best.payers.includes(p.me);
        const sup = support.get(p);
        const { ally, spare } = best.info[i];
        // A spread move that KOs the two foes on different turns: say each, so the rows agree.
        const each = p.target === "both" && p.each && p.each[0] !== p.each[1] ? p.each : null;
        const mv = sup?.pm.getMove();
        // The KO a partner's Helping Hand buys shows on this slot's own line.
        const helped = helps.has(p);
        return {
          icon: iconOf(p.me), name: p.me.name, out: !!p.me.isOnField?.(), enter,
          move: sup ? pmName(sup.pm) : p.move?.name ?? null, type: sup ? TYPES[mv.type] ?? null : p.move?.type ?? null, cat: sup ? "status" : p.move?.cat ?? null,
          target: sup || p.target === null ? null : p.target === "both" ? "both" : { icon: iconOf(active[p.target]), name: active[p.target].name },
          ko: sup || each ? 0 : helped && typeof p.target === "number" ? 1 : p.hits <= 3 ? p.hits : 0,
          helped,
          koEach: sup || p.target !== "both" || !p.each ? null : p.each.map(n => (n <= 3 ? n : 0)),
          threat: slotThreat(p, enter),
          locked: !!p.locked,
          support: sup?.kind ?? null,
          spare: !sup && spare,
          allyHit: !sup && ally ? { icon: iconOf(ally.mon), name: ally.mon.name, pct: Math.round(ally.share * 100), pko: Math.round(ally.pKo * 100) } : null,
          notes: sup ? [sup.note] : [
            ...(p.locked ? ["locked in"] : []),
            ...(helped ? ["with Helping Hand"] : []),
            ...(each ? active.map((f, fi) => each[fi] <= 3 && `${f.name} ${each[fi]} hit${each[fi] > 1 ? "s" : ""}`).filter(Boolean) : []),
            ...notesFor(p),
            ...(ally ? [`hits ${ally.mon.name} ${Math.round(ally.share * 100)}%${ally.pKo >= 0.05 ? ` · ${Math.round(ally.pKo * 100)}% KO` : ""}`] : []),
            ...(spare ? ["spare hit — KO without it"] : []),
          ],
        };
      }),
      switches: swaps(best),
      targeting: targeting({ ...best, picks }),
    },
  };
};

// Moves that hit every other pokémon on the field, our partner included (MoveTarget ALL_OTHERS, ALL_NEAR_OTHERS).
const hitsAlly = o => [2, 4].includes(o?.pm?.getMove?.()?.moveTarget);
// A cost beyond the turn: recoil, fainting, a recharge turn, or lowering the user's own stats.
const DRAWBACK_ATTRS = ["RecoilAttr", "SacrificialAttr", "SacrificialAttrOnHit", "HalfSacrificialAttr", "RechargeAttr"];
const drawback = o => {
  const mv = o?.pm?.getMove?.();
  return !!mv && (DRAWBACK_ATTRS.some(n => hasAttr(mv, n)) || (mv.attrs || []).some(a => a.constructor.name === "StatStageChangeAttr" && a.selfTarget && a.stages < 0));
};
const DRAWBACK_COST = 0.25;
const ALLY_KO_COST = 4;

// Slot 1's command phase in a double battle: slot 0's command is already in `turnCommands[0]` (CommandPhase
// handleFightCommand / tryLeaveField; SelectTargetPhase puts a chosen target on the command itself). A move →
// `{ me, pm, target }` with the target as an index into `active` ("both" for a spread move, null for our side);
// a switch → `{ me, switchIn }` (cursor is the party index). Balls and runs skip slot 1's phase entirely.
const lockedCommand = (s, b, party, active, pair) => {
  const ph = s.phaseManager?.getCurrentPhase?.();
  if (!b.double || ph?.phaseName !== "CommandPhase" || ph.fieldIndex !== 1) return null;
  const cmd = b.turnCommands?.[0];
  const me = party.find(p => p.isOnField?.() && p.getBattlerIndex?.() === 0);
  if (!cmd || cmd.skip || !me) return null;
  if (cmd.command === 2) {
    const switchIn = s.getPlayerParty?.()?.[cmd.cursor];
    return switchIn && party.includes(switchIn) ? { me, switchIn } : null;
  }
  if (cmd.command !== 0) return null;
  const pm = me.moveset[cmd.cursor] ?? me.moveset.find(m => m && m.moveId === cmd.move?.move) ?? null;
  const mv = pm?.getMove?.();
  const bi = (cmd.targets?.length ? cmd.targets : cmd.move?.targets ?? [])[0];
  let target = null;
  if (mv && SPREAD_TARGETS.includes(mv.moveTarget)) target = pair ? "both" : 0;
  else if (bi != null && bi >= 2) {
    const i = active.findIndex(f => f.getBattlerIndex?.() === bi);
    target = i >= 0 ? i : active.length === 1 ? 0 : null;
  }
  return { me, pm, target };
};

// Best 1-v-1 move of `me` into `foe`, by who wins the exchange. For foes no field slot is planned against.
// `partnered`: `me` stands next to a partner, so moves that also hit it are out.
const duel = (s, me, foe, partnered = false) => {
  let best = null;
  for (const o of planOutcomes(s, me, foe)) {
    if (!(o.expected > 0) || (partnered && hitsAlly(o))) continue;
    const x = exchange(s, me, o.pm, foe, { outcome: o, next: !me.isOnField?.() || !foe.isOnField?.() });
    const score = x.turnsThey - x.turnsWe + (x.pWeKoFirst - x.pTheyKoFirst);
    if (!best || score > best.score || (score === best.score && o.expected > best.mine.expected)) best = { me, mine: o, myTurns: x.turnsWe, score };
  }
  return best ?? { me, mine: null, myTurns: 9, score: -9 };
};

// Plain data for one refresh. Its JSON is the change signature, so the DOM is
// only rebuilt when something the panel shows has actually changed.
// While the game waits for a command, the whole refresh runs in one sandbox (every game call it makes).
const model = (s, b, party, foes) => (plannerReady(s) ? sandbox(s, () => battleModel(s, b, party, foes)) : battleModel(s, b, party, foes));
const battleModel = (s, b, party, foes) => {
  const onField = foes.filter(f => f.isOnField?.());
  const active = (onField.length ? onField : foes).slice(0, b.double ? 2 : 1);
  // During a free switch the enemy hasn't decided anything: it picks its first command after our switch, against
  // the field we choose. Its switch rule isn't replayable against a hypothetical field, so predict none now; the
  // CommandPhase refresh predicts against the real field. (CheckSwitchPhase isn't offered in trainer battles.)
  const freeSwitch = awaitingDecision(s) === "check-switch";
  const predicted = freeSwitch ? new Map() : predictSwitches(s, b, active);
  const switching = f => (predicted.get(f)?.ratio ?? 0) >= 1;
  // Plan against the field our moves will actually hit; if a switch is predicted, also keep the plan for
  // the case it stays, shown dim.
  const facing = active.map(f => (switching(f) ? predicted.get(f).to : f));
  // Targets are field positions, so a lock resolved against the field holds for the switch-in taking that position.
  const locked = lockedCommand(s, b, party, active, active.length === 2);
  const plan = fieldPlan(s, party, facing, !!b.double, active.filter(f => !switching(f)), { freeSwitch, locked });
  const ifStay = active.some(switching) ? fieldPlan(s, party, active, !!b.double, active, { locked }) : null;

  // Foes on the field take their pokémon and move from the field plan, so the rows never contradict it.
  // A trainer's waiting mons (or a foe no slot is on) get the best 1-v-1 pick, preferring members not
  // already busy, and are marked `later`.
  const used = new Set(plan?.picks.map(p => p.me) ?? []);
  const pickFor = foe => {
    // A foe predicted to switch out shares its switch-in's pick: that's who the move lands on.
    const target = switching(foe) ? predicted.get(foe).to : foe;
    const ai = facing.indexOf(target);
    const slot = ai >= 0 && plan ? plan.picks.find(p => p.target === ai) ?? plan.picks.find(p => p.target === "both") : null;
    if (slot?.move) {
      const both = slot.target === "both";
      const dmg = both ? planOutcomes(s, slot.me, target).find(x => x.name === slot.move.name)?.expected ?? 0 : slot.move.expected;
      // The slot's own per-foe KO turns, so the row and the ⚔ line agree.
      return { me: slot.me, mine: { ...slot.move, dmg }, myTurns: both ? slot.each?.[ai] ?? turnsToKo(target.hp, dmg) : slot.hits, score: slot.score, later: false, vs: target };
    }
    const paired = (plan?.picks.length ?? 0) === 2;
    const ranked = party.map(me => duel(s, me, foe, paired && ai >= 0 && plan.picks.some(p => p.me === me)))
      .map(m => ({ ...m, rank: m.score - (used.has(m.me) ? 1 : 0) }))
      .sort((x, y) => y.rank - x.rank);
    const pick = ranked[0];
    if (pick) used.add(pick.me);
    return pick ? { ...pick, later: ai < 0 } : null;
  };
  const picks = new Map();
  for (const f of [...facing, ...active, ...foes.filter(f => !active.includes(f) && !facing.includes(f))]) if (!picks.has(f)) picks.set(f, pickFor(f));

  const teamWeak = {};
  const rows = foes.map(foe => {
    // Plain 2× resists are too many to scan mid-battle; only list the hard walls.
    const weak = [], avoid = [];
    for (const t of TYPES) {
      const e = effectiveness(t, foe);
      if (e >= 2) { weak.push([t, e >= 4 ? "×4" : ""]); teamWeak[t] = (teamWeak[t] ?? 0) + 1; }
      else if (e === 0) avoid.push([t, "×0"]);
      else if (e <= 0.25) avoid.push([t, "×¼"]);
    }
    const p = picks.get(foe);
    const vs = p?.vs ?? foe;
    // What this foe likely does to the pokémon we put in front of it (a foe switching out does nothing).
    const t = p?.mine && !switching(foe) ? threatFrom(s, foe, p.me, p.mine.pm ?? null, { next: !p.me.isOnField?.() || !foe.isOnField?.() }) : null;
    const bars = bossBarsLeft(vs);
    const n = p?.mine ? hitCounts(p.mine) : null;
    return {
      icon: iconOf(foe), name: foe.name, lv: foe.level, types: typesOf(foe),
      abilities: abilitiesOf(foe), boss: !!foe.isBoss?.(), status: foe.status?.effect ?? 0,
      hp: Math.round(foe.hp / foe.getMaxHp() * 100),
      weak, avoid,
      switchTo: predicted.has(foe) ? { icon: iconOf(predicted.get(foe).to), name: predicted.get(foe).to.name, sure: switching(foe) } : null,
      likely: t?.move ? {
        move: t.move.name, type: t.move.type, p: t.live ? Math.round(t.move.p * 100) : null,
        first: Math.round(t.first * 100), hits: t.move.hits,
      } : null,
      pick: p?.mine ? {
        icon: iconOf(p.me), name: p.me.name, move: p.mine.name, type: p.mine.type, cat: p.mine.cat,
        pct: Math.min(100, Math.round(p.mine.dmg / vs.getMaxHp() * 100)),
        vs: p.vs && p.vs !== foe ? { icon: iconOf(p.vs), name: p.vs.name } : null,
        ko: p.myTurns <= 3 ? p.myTurns : 0, risky: p.score < 0, later: p.later,
        notes: [...(bars > 1 && p.myTurns > 1 && p.myTurns <= bars ? [`boss: ${bars} bars — no 1HKO`] : []), ...(n ? [`${p.mine.name} ×${n}`] : [])],
      } : null,
    };
  });

  const sendIns = [...(plan?.picks.map(p => p.me) ?? []), ...foes.map(f => picks.get(f)?.me).filter(Boolean)];
  return {
    kind: "battle",
    field: plan?.view ?? null,
    teamPlan: b.trainer ? teamPlan(s, b, party, foes) : null,
    catch: b.trainer ? null : catchAdvice(s, b, party, foes),
    enemySwitches: active.filter(f => predicted.has(f)).map(f => ({
      from: { icon: iconOf(f), name: f.name }, to: { icon: iconOf(predicted.get(f).to), name: predicted.get(f).to.name }, sure: switching(f),
    })),
    ifStay: ifStay ? ifStay.view.slots : null,
    title: `W${b.waveIndex}${b.trainer ? ` · ${b.trainer.getName()}` : ""}`,
    order: [...new Set(sendIns)].map(me => ({ icon: iconOf(me), name: me.name })),
    team: Object.entries(teamWeak).sort((x, y) => y[1] - x[1]).slice(0, 4),
    rows,
  };
};
