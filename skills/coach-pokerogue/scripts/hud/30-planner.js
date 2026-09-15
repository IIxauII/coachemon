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
const likelyMoves = (s, foe, me, outs, next) => {
  const live = plannerReady(s);
  if (live && !next && foe.isOnField?.() && typeof enemyMoveDistribution === "function") {
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

// How `foe` threatens `me` over its likely moves: expected damage (for scoring), the worst max roll among moves it
// might realistically pick (for the 💀 flag), P(KO this turn at current HP) with a crit as a small extra risk, and
// P(foe acts before me) — `koFirst` weights that by the moves that KO. `myPm` is our planned move (turn order).
// Damage uses our true abilities (not the AI's view): the AI's blind spots decide what it picks, not what it deals.
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
    expected += m.p * m.o.expected;
    pKo += m.p * ko;
    koFirst += m.p * ko * order;
    if (m.p >= 0.05 && (!worst || m.o.max > worst.o.max)) worst = m;
    kos.push({ p: m.p, max: m.o.max, pKo: ko, acc: m.o.acc ?? 1 });
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

// One-on-one from now: `me` repeats `pm` into `foe` while `foe` answers with its likely moves. Turn 1 is played
// with the real odds — order, accuracy, rolls, crits, Sturdy/Focus Band (inside pKo); later turns by expected
// damage, with boss bars (each clamps a hit at its boundary) and turn-end heals. Options: `hp` (ours after an
// incoming hit), `free` (the foe is switching in and doesn't act this turn), `next` (the foe re-picks its move
// against us next turn), `outcome` (our move's record, if already at hand).
const exchange = (s, me, pm, foe, opts = {}) => {
  const hp = opts.hp ?? me.hp;
  const mine = opts.outcome ?? planOutcomes(s, me, foe).find(o => o.name === pmName(pm)) ?? null;
  const t = threatFrom(s, foe, me, pm, { next: !!opts.next });
  const qWe = mine?.pKo ?? 0;
  const qThey = opts.free ? 0 : koChanceAt(t, hp);
  let turnsWe = 9;
  if (mine?.expected > 0) {
    // Mean damage when it lands: misses are already in turn 1's odds, and a boss bar clamps each turn's hit.
    const perTurn = mine.expected / Math.max(mine.acc ?? 1, 0.3);
    const bars = bossBarsLeft(foe);
    const seg = foe.getMaxHp() / (foe.bossSegments || 1);
    const byTurns = bars > 1
      ? turnsToKo(foe.hp - seg * (bars - 1) + healAtEnd(s, foe), perTurn) + (bars - 1) * turnsToKo(seg, perTurn)
      : turnsToKo(foe.hp + healAtEnd(s, foe), perTurn);
    turnsWe = qWe >= 0.5 ? 1 : Math.min(9, Math.max(2, byTurns));
  }
  const turnsThey = Math.min(9, foeTurns(s, t, me, hp) + (opts.free ? 1 : 0));
  const pFirst = t ? 1 - (t.pKo > 0 ? t.koFirst : t.first) : 1;
  const pF = opts.free ? 1 : pFirst;
  const weFirst = pF * qWe + (1 - pF) * (1 - qThey) * qWe;
  const theyFirst = (1 - pF) * qThey + pF * (1 - qWe) * qThey;
  const rest = Math.max(0, 1 - weFirst - theyFirst);
  const later = turnsWe < turnsThey ? 1 : turnsWe > turnsThey ? 0 : pFirst;
  const taken = turnsWe >= 9 ? turnsThey : Math.max(0, turnsWe - pFirst - (opts.free ? 1 : 0));
  return {
    pWeKoFirst: weFirst + rest * later, pTheyKoFirst: theyFirst + rest * (1 - later),
    expectedHpLeft: Math.max(0, Math.round(hp - (t?.expected ?? 0) * taken)),
    turnsWe, turnsThey, pFirst,
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
const fieldPlan = (s, party, active, double, attackers = active, { freeSwitch = false } = {}) => {
  const slots = double && active.length === 2 ? 2 : 1;
  const current = party.filter(p => p.isOnField?.());

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
  const options = (me, entering) => {
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
    const out = [];
    active.forEach((f, fi) => {
      // In doubles a spread move always hits both, so it only counts as the "both" option below.
      let best = null;
      for (const o of planOutcomes(s, me, f)) {
        if (!(o.expected > 0) || (slots === 2 && o.spread)) continue;
        const x = trade(o, f);
        const turns = x.turnsWe + lost;
        const score = danger - turns + (x.pWeKoFirst - x.pTheyKoFirst);
        if (!best || score > best.score || (score === best.score && o.expected > best.move.expected)) best = { me, move: o, target: fi, turns, hits: x.turnsWe, score, hp };
      }
      if (best) out.push(best);
    });
    if (slots === 2) {
      for (const o of planOutcomes(s, me, active[0]).filter(x => x.spread && x.expected > 0)) {
        const other = planOutcomes(s, me, active[1]).find(x => x.name === o.name);
        const xs = [trade(o, active[0]), other ? trade(other, active[1]) : null];
        const hits = Math.max(xs[0].turnsWe, xs[1]?.turnsWe ?? 9);
        const edge = Math.min(...xs.filter(Boolean).map(x => x.pWeKoFirst - x.pTheyKoFirst));
        if (hits + lost < 9) out.push({ me, move: o, target: "both", turns: hits + lost, hits, score: danger - hits - lost + 1 + edge, hp });
      }
    }
    if (!out.length) out.push({ me, move: null, target: null, turns: 9, hits: 9, score: danger - 9, hp });
    return out;
  };
  const cache = new Map();
  const opt = (me, entering) => {
    const k = `${party.indexOf(me)}|${entering}`;
    if (!cache.has(k)) cache.set(k, options(me, entering));
    return cache.get(k);
  };

  // Every candidate field. Newcomers fill empty slots (a fainted member's) for free; any beyond that are
  // voluntary switches (`payers`), which take the incoming hit — unless the switch is free. `swaps` counts the
  // voluntary switches either way.
  const empty = Math.max(0, slots - current.length);
  const free = freeSwitch ? slots : empty;
  const plans = [];
  const add = (picks, payers) => {
    const j = slots === 2 ? joint(picks, payers) : null;
    const swaps = Math.max(0, picks.filter(p => !current.includes(p.me)).length - empty);
    plans.push({ picks, payers, extra: payers.length, swaps, joint: j, score: picks.reduce((t, p) => t + p.score, 0) + (j?.value ?? 0) });
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
  const joint = (picks, payers) => {
    const mons = picks.map(p => p.me);
    const acting = picks.filter(p => p.move && !payers.includes(p.me));
    const foes = active.map(() => ({ pKo: 0, pBefore: 0, redirect: 0, hitters: 0 }));
    active.forEach((X, xi) => {
      const hitters = acting.map(p => {
        const o = p.target === "both" ? planOutcomes(s, p.me, X).find(x => x.name === p.move.name) : p.target === xi ? p.move : null;
        if (!o) return null;
        const alive = attackers.reduce((keep, f) => {
          const t = threatFrom(s, f, p.me, p.move.pm);
          return keep * (1 - koChanceAt(t, p.me.hp) * (t?.koFirst ?? 0));
        }, 1);
        const land = alive * (1 - protectChance(s, X));
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
  for (const members of fields) {
    const newcomers = members.filter(p => !current.includes(p));
    const paying = Math.max(0, newcomers.length - free);
    // With one free slot and two newcomers, either of them could be the one that switches in under fire.
    const assignments = paying === 0 ? [[]] : paying === newcomers.length ? [newcomers] : newcomers.map(p => [p]);
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
  const failing = plan => plan.picks.some(p => !p.move || p.score < 0);
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

  return {
    picks: best.picks, // live objects for the per-foe rows; not part of the JSON-safe view
    view: {
      optional: alt ? swaps(alt) : [],
      // Staying is failing but every switch-in would be KO'd coming in: say so rather than stay silent.
      noSafeSwitch: !freeSwitch && best.swaps === 0 && failing(best) && party.length > current.length,
      freeSwitch,
      slots: best.picks.map(p => {
        const enter = best.payers.includes(p.me);
        return {
          icon: iconOf(p.me), name: p.me.name, out: !!p.me.isOnField?.(), enter,
          move: p.move?.name ?? null, type: p.move?.type ?? null, cat: p.move?.cat ?? null,
          target: p.target === "both" ? "both" : p.target === null ? null : { icon: iconOf(active[p.target]), name: active[p.target].name },
          ko: p.hits <= 3 ? p.hits : 0,
          threat: slotThreat(p, enter),
          notes: notesFor(p),
        };
      }),
      switches: swaps(best),
      targeting: targeting(best),
    },
  };
};

// Best 1-v-1 move of `me` into `foe`, by who wins the exchange. For foes no field slot is planned against.
const duel = (s, me, foe) => {
  let best = null;
  for (const o of planOutcomes(s, me, foe)) {
    if (!(o.expected > 0)) continue;
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
  const plan = fieldPlan(s, party, facing, !!b.double, active.filter(f => !switching(f)), { freeSwitch });
  const ifStay = active.some(switching) ? fieldPlan(s, party, active, !!b.double) : null;

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
      return { me: slot.me, mine: { ...slot.move, dmg }, myTurns: both ? turnsToKo(target.hp, dmg) : slot.hits, score: slot.score, later: false, vs: target };
    }
    const ranked = party.map(me => duel(s, me, foe))
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
