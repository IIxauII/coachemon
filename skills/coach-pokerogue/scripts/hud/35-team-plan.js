// Whole-fight plan for trainer battles: which of our mons takes which enemy, in the order the trainer sends them,
// with HP carried from one exchange to the next. The one-turn planner can't see that spending the only answer to
// a boss early loses the fight three foes later.
//
// The fight is simulated coarsely. An exchange is one of our mons against one foe until one faints: each side
// deals its expected damage per turn (our best move; the foe's likely move), in speed/priority order, with boss bars
// clamping each hit and turn-end heals and chip in between. A voluntary switch-in takes one hit before it acts; a fainted
// mon's replacement comes in free. After a foe faints the trainer sends the bench mon with the best matchup score
// against the mon we have on the field (trainer.getNextSummonIndex over getPartyMemberMatchupScores, spec §7).
// Our choices are searched with a small beam; the enemy's are not branched. Mid-exchange enemy switches, status,
// stat changes and doubles are not modelled — doubles are planned as one slot against one foe at a time.
const TP_BEAM = 24;
const TP_TURNS = 15;
let teamPlanCache = { key: null, live: false, value: null };

// Our best move into `f` as per-hit damage (expected roll × accuracy): boss bars clamp each hit separately.
const tpOurMove = (s, me, f, live) => {
  if (live && typeof moveOutcomes === "function") {
    try {
      // Best by turns to KO it (a charge or recharge turn per hit counts), then by damage.
      const turns = o => (o.expected > 0 ? (o.charge || o.recharge ? 2 : 1) * Math.ceil(f.hp / o.expected) - (o.recharge ? 1 : 0) : 99);
      const best = (moveOutcomes(s, me, f) ?? []).reduce((b, o) => (!b || turns(o) < turns(b) || (turns(o) === turns(b) && o.expected > b.expected) ? o : b), null);
      if (best?.expected > 0) {
        const n = best.dist?.length ? Math.max(1, Math.round(best.dist.reduce((t, d) => t + d.n * d.p, 0))) : 1;
        const per = best.perHit?.length
          ? Array.from({ length: n }, (_, k) => best.perHit[Math.min(k, best.perHit.length - 1)]).map(x => (x.max + x.min) / 2 * (best.acc ?? 1))
          : [best.expected];
        return { name: best.name, type: best.type, e: best.e, priority: best.priority ?? 0, hits: per, charge: !!best.charge, recharge: !!best.recharge || !!best.noRepeat, semiCharge: !!best.semiCharge };
      }
    } catch {}
  }
  const m = bestMove(me, f);
  return m?.dmg > 0 ? { name: m.name, type: m.type, e: m.e, priority: m.priority ?? 0, hits: [m.dmg] } : null;
};

// What `f` does to `me` per turn, and P(f acts first) when the threat model knows it.
const tpTheirMove = (s, f, me, live) => {
  if (live && typeof threatFrom === "function") {
    try {
      const t = threatFrom(s, f, me);
      if (Number.isFinite(t?.expected)) {
        return { dmg: t.expected, name: typeof t.move === "string" ? t.move : t.move?.name ?? null, e: t.move?.e ?? 1, first: t.first, priority: t.move?.priority ?? 0 };
      }
    } catch {}
  }
  const m = bestMove(f, me, true);
  return { dmg: m?.dmg ?? 0, name: m?.name ?? null, e: m?.e ?? 1, first: null, priority: m?.priority ?? 0 };
};

const tpFoeFirst = (s, me, f, ours, theirs, live) => {
  if (Number.isFinite(theirs.first)) return theirs.first;
  if (live && typeof actionOrder === "function" && ours && theirs.name) {
    try {
      const a = me.moveset.find(pm => pm?.getName?.() === ours.name), b = f.moveset.find(pm => pm?.getName?.() === theirs.name);
      const p = a && b ? actionOrder(s, me, a, f, b) : null;
      if (Number.isFinite(p)) return 1 - p;
    } catch {}
  }
  const mine = ours?.priority ?? 0;
  if (theirs.priority !== mine) return theirs.priority > mine ? 1 : 0;
  const a = stat(me, 5), b = stat(f, 5);
  return b > a ? 1 : b < a ? 0 : 0.5;
};

// Approximation of Pokemon.getMatchupScore(opponent) for when the game can't be asked (and for hypothetical HP,
// which the game call can't take): how hard our types hit the opponent (×1.25 if faster) plus how little its types
// hurt us. The game also weighs HP ratios; left out here.
const tpTypeScore = (f, me) => {
  const atk = typesOf(f).reduce((x, t) => x * effectiveness(t, me), 1) * (stat(f, 5) >= stat(me, 5) ? 1.25 : 1);
  const def = typesOf(me).reduce((x, t) => x / Math.max(effectiveness(t, f), 0.25), 1);
  return atk + def;
};

// Turn-end HP change split into what recurs (Leftovers and other heals, weather and status chip: negative when chip
// wins) and the one-shot berries (Sitrus below half, Enigma after a super-effective hit), read by asking endOfTurnHp
// about the mon at a made-up HP.
const tpHealProfile = (s, p) => {
  if (typeof endOfTurnHp !== "function") return null;
  const max = p.getMaxHp();
  const at = (hp, se) => {
    try { return endOfTurnHp(Object.create(p, { hp: { value: hp } }), { s, hp, tookSuperEffective: se }) || 0; } catch { return 0; }
  };
  const base = at(Math.ceil(max * 0.75), false);
  return { base, sitrus: Math.max(0, at(Math.floor(max * 0.4), false) - base), enigma: Math.max(0, at(Math.ceil(max * 0.75), true) - base) };
};

// calculateBossSegmentDamage (spec §3) → [damage dealt, bossSegmentIndex after the hit].
const tpBossHit = (dmg, hp, seg, minIdx, idx) => {
  if (idx <= 0) return [Math.min(dmg, hp), 0];
  const floorHp = seg * idx;
  const excess = dmg - (hp - Math.round(floorHp));
  if (excess < 0) return [dmg, idx];
  if (excess === 0) return [dmg, idx - 1];
  const c = Math.min(Math.max(Math.floor(Math.log2(excess / seg)), 0), idx - minIdx);
  return [Math.max(Math.floor(hp - floorHp + seg * c), 1), idx - c - 1];
};

const tpTables = (s, party, foes, live) => {
  const ours = party.map(me => foes.map(f => tpOurMove(s, me, f, live)));
  const theirs = foes.map(f => party.map(me => tpTheirMove(s, f, me, live)));
  const final = !!s.currentBattle?.isClassicFinalBoss;
  return {
    ours, theirs,
    first: party.map((me, mi) => foes.map((f, fi) => tpFoeFirst(s, me, f, ours[mi][fi], theirs[fi][mi], live))),
    send: foes.map(f => party.map(me => {
      if (live && typeof f.getMatchupScore === "function") {
        try { const v = f.getMatchupScore(me); if (Number.isFinite(v)) return v; } catch {}
      }
      return tpTypeScore(f, me);
    })),
    boss: foes.map(f => (f.isBoss?.() && f.bossSegments > 1
      ? { seg: f.getMaxHp() / f.bossSegments, min: final && !f.formIndex ? 1 : 0, idx: f.bossSegmentIndex ?? f.bossSegments - 1 } : null)),
    ourMax: party.map(p => p.getMaxHp()), foeMax: foes.map(f => f.getMaxHp()),
    ourHeal: party.map(p => tpHealProfile(s, p)), foeHeal: foes.map(p => tpHealProfile(s, p)),
    foeStart: foes.map(f => f.hp),
  };
};

const tpHeal = (hp, max, prof, used, se) => {
  if (!prof || hp < 1) return [hp, used];
  let add = prof.base;
  if (hp < max / 2 && !(used & 1) && prof.sitrus) { add += prof.sitrus; used |= 1; }
  if (se && !(used & 2) && prof.enigma) { add += prof.enigma; used |= 2; }
  return [Math.min(max, hp + add), used];
};

// One exchange from state `st`: our `mi` against foe `fi` until one faints (or TP_TURNS pass).
// entry "switch": a voluntary switch-in, the foe gets a free hit first.
const tpFight = (T, st, mi, fi, entry) => {
  let mh = st.oh[mi], mb = st.ob[mi], fh = st.fh[fi], fs = st.fs[fi], fb = st.fb[fi];
  const us = T.ours[mi][fi], them = T.theirs[fi][mi], meFirst = T.first[mi][fi] < 0.5, boss = T.boss[fi];
  let turns = 0;
  const hitFoe = () => {
    for (const d of us?.hits ?? []) {
      if (fh < 1) break;
      if (boss) { const [x, idx] = tpBossHit(d, fh, boss.seg, boss.min, fs); fh -= x; fs = idx; } else fh -= d;
    }
  };
  const endTurn = () => {
    [mh, mb] = tpHeal(mh, T.ourMax[mi], T.ourHeal[mi], mb, them.e >= 2);
    [fh, fb] = tpHeal(fh, T.foeMax[fi], T.foeHeal[fi], fb, (us?.e ?? 1) >= 2);
  };
  if (entry === "switch") { mh -= them.dmg; endTurn(); }
  while (mh >= 1 && fh >= 1 && turns < TP_TURNS) {
    turns++;
    // A charging move hits every second turn (hidden meanwhile for Dig / Fly: the foe's later hit misses); a
    // recharging one, or one that can't repeat, loses the turn after each hit.
    const hits = us?.charge ? turns % 2 === 0 : us?.recharge ? turns % 2 === 1 : true;
    const hidden = !hits && us?.semiCharge;
    if (meFirst) { if (hits) hitFoe(); if (fh >= 1 && !hidden) mh -= them.dmg; } else { mh -= them.dmg; if (mh >= 1 && hits) hitFoe(); }
    endTurn();
  }
  return { mh: mh < 1 ? 0 : mh, mb, fh: fh < 1 ? 0 : fh, fs, fb, turns };
};

const tpClone = st => ({ ...st, oh: st.oh.slice(), ob: st.ob.slice(), fh: st.fh.slice(), fs: st.fs.slice(), fb: st.fb.slice() });
const tpAlive = hps => hps.flatMap((hp, i) => (hp >= 1 ? [i] : []));

// The trainer's next mon: best matchup score against the mon we have on the field.
const tpNextFoe = (T, st) => {
  const alive = tpAlive(st.fh);
  if (st.cur == null) return alive[0];
  return alive.reduce((b, fi) => (T.send[fi][st.cur] > T.send[b][st.cur] ? fi : b), alive[0]);
};

// Progress toward winning: each KO'd foe counts fully; a standing foe counts the damage already dealt plus what our
// best remaining mon could still take off it. Surviving HP breaks ties between wins (it carries into later waves).
const tpValue = (T, st, end) => {
  let v = 0;
  const ours = tpAlive(st.oh);
  st.fh.forEach((hp, fi) => {
    if (hp < 1) { v += 100; return; }
    const dealt = Math.max(0, 1 - hp / T.foeStart[fi]);
    let best = 0;
    if (!end) for (const mi of ours) { const r = tpFight(T, st, mi, fi, "free"); best = Math.max(best, 1 - r.fh / hp); }
    v += 100 * (dealt + (1 - dealt) * best);
  });
  st.oh.forEach((hp, mi) => { v += 25 * hp / T.ourMax[mi]; });
  if (st.fh.every(hp => hp < 1)) v += 100;
  return v;
};

// `reserve`: party indices kept away from every foe but `win` while anyone else can still fight.
const tpSearch = (T, start, reserve, win) => {
  let beam = [start];
  const done = [];
  for (let depth = 0; beam.length && depth <= start.oh.length + start.fh.length + 1; depth++) {
    const next = new Map();
    for (const st of beam) {
      const fi = st.fcur ?? tpNextFoe(T, st);
      let cands = tpAlive(st.oh).map(mi => [mi, st.cur == null ? "free" : mi === st.cur ? "stay" : "switch"]);
      if (reserve.length && fi !== win) {
        const spare = cands.filter(([mi]) => !reserve.includes(mi));
        if (spare.length) cands = spare;
      }
      for (const [mi, entry] of cands) {
        const r = tpFight(T, st, mi, fi, entry);
        const c = tpClone(st);
        c.oh[mi] = r.mh; c.ob[mi] = r.mb; c.fh[fi] = r.fh; c.fs[fi] = r.fs; c.fb[fi] = r.fb;
        c.cur = r.mh >= 1 ? mi : null;
        c.fcur = r.fh >= 1 ? fi : null;
        c.steps = [...st.steps, { mi, fi, entry, hp: r.mh, foeFrom: st.fh[fi], foeHp: r.fh, turns: r.turns }];
        const stall = r.mh >= 1 && r.fh >= 1;
        c.result = c.fh.every(hp => hp < 1) ? "win" : c.oh.every(hp => hp < 1) ? "loss" : stall ? "stall" : null;
        c.val = tpValue(T, c, !!c.result);
        if (c.result) { done.push(c); continue; }
        const sig = [c.cur, c.fcur, ...c.oh.map(Math.round), ...c.fh.map(Math.round)].join(",");
        if (!next.has(sig) || next.get(sig).val < c.val) next.set(sig, c);
      }
    }
    beam = [...next.values()].sort((a, b) => b.val - a.val).slice(0, TP_BEAM);
  }
  return done.reduce((b, st) => (!b || st.val > b.val ? st : b), null);
};

const teamPlan = (s, b, party, foes) => {
  if (!b?.trainer || !party.length || !foes.length) return null;
  const live = awaitingCommand(s);
  const key = [b.waveIndex, b.turn, b.enemySwitchCounter, !!b.double, ...party.map(p => `${p.id}:${p.hp}`), ...foes.map(f => `${f.id}:${f.hp}`)].join("|");
  // A plan built from the game's own numbers stays until the turn changes; outside the command phase only the
  // approximation is available, so don't let it replace one.
  if (teamPlanCache.key === key && (teamPlanCache.live || !live)) return teamPlanCache.value;
  const T = live ? sandbox(s, () => tpTables(s, party, foes, true)) : tpTables(s, party, foes, false);
  const value = tpView(T, party, foes, !!b.double);
  teamPlanCache = { key, live, value };
  return value;
};

const tpView = (T, party, foes, double = false) => {
  const ref = p => ({ icon: iconOf(p), name: p.name });
  const pctOf = (hp, max) => Math.round(hp / max * 100);
  const onField = party.findIndex(p => p.isOnField?.());
  const foeOnField = foes.findIndex(f => f.isOnField?.());
  const start = {
    oh: party.map(p => p.hp), ob: party.map(() => 0),
    fh: foes.map(f => f.hp), fs: T.boss.map(x => x?.idx ?? 0), fb: foes.map(() => 0),
    cur: onField >= 0 ? onField : null, fcur: foeOnField >= 0 ? foeOnField : null, steps: [],
  };

  // Win condition: the foe that KOs the most of our team when we throw everyone at it, best answer first.
  const sweep = fi => {
    const st = tpClone(start);
    let kills = 0;
    for (let left = tpAlive(st.oh); left.length && st.fh[fi] >= 1; left = tpAlive(st.oh)) {
      const runs = left.map(mi => ({ mi, r: tpFight(T, st, mi, fi, "free") }));
      const rank = ({ mi, r }) => (r.fh < 1 ? 2 + r.mh / T.ourMax[mi] : 1 - r.fh / st.fh[fi]);
      const { mi, r } = runs.reduce((b, x) => (rank(x) > rank(b) ? x : b));
      st.oh[mi] = r.mh; st.fh[fi] = r.fh; st.fs[fi] = r.fs;
      if (r.mh < 1) kills++;
      else break; // it fell, or neither side can finish the other
    }
    return kills;
  };
  const alive = tpAlive(start.oh).length;
  const kills = foes.map((_, fi) => sweep(fi));
  const hurt = fi => party.reduce((t, _, mi) => t + (T.ours[mi][fi]?.hits.reduce((x, d) => x + d, 0) ?? 0) / foes[fi].hp, 0);
  let win = -1;
  foes.forEach((_, fi) => {
    if (kills[fi] < Math.min(2, alive)) return;
    if (win < 0 || kills[fi] > kills[win] || (kills[fi] === kills[win] && hurt(fi) < hurt(win))) win = fi;
  });

  // Answers: who takes the most off it per turn if they get to act. They're only credible if they do act.
  const answers = win < 0 ? [] : tpAlive(start.oh)
    .map(mi => ({ mi, per: (T.ours[mi][win]?.hits.reduce((x, d) => x + d, 0) ?? 0) / foes[win].hp, r: tpFight(T, start, mi, win, "free") }))
    .map(a => ({ ...a, acts: a.r.fh < foes[win].hp }))
    .filter(a => a.per >= 0.2)
    .sort((a, b) => b.per - a.per)
    .slice(0, 2);
  const reserve = answers.map(a => a.mi);

  // The beam is myopic: left alone it spends the answers on whatever is in front of them. So also search with the
  // answers held back for the win condition, and keep that plan unless spending them early is clearly better.
  const held = reserve.length ? tpSearch(T, start, reserve, win) : null;
  const free = tpSearch(T, start, [], win);
  const plan = held && (!free || held.val >= free.val - 10) ? held : free;
  if (!plan) return null;
  // A sacrifice is a low-value mon: little HP left, or no foe it beats 1-on-1.
  const beats = party.map((_, mi) => foes.filter((_, fi) => tpFight(T, start, mi, fi, "free").fh < 1).length);
  const lowValue = mi => !reserve.includes(mi) && (start.oh[mi] / T.ourMax[mi] < 0.35 || beats[mi] === 0);

  const winStep = plan.steps.findIndex(x => x.fi === win);
  const steps = plan.steps.map((x, i) => {
    const us = T.ours[x.mi][x.fi], nextStep = plan.steps[i + 1];
    const why = x.entry === "switch" ? ["switch in, takes a hit"] : [];
    const sacrifice = x.hp < 1 && x.foeHp >= 1 && nextStep?.entry === "free" && lowValue(x.mi)
      && (x.foeFrom - x.foeHp) / x.foeFrom < 0.5;
    if (x.foeHp < 1) why.push(x.hp >= 1 ? `KO · ${pctOf(x.hp, T.ourMax[x.mi])}% left` : "trade");
    else if (x.hp < 1) why.push(sacrifice ? `sacrifice → ${party[nextStep.mi].name} in free` : `falls · foe at ${pctOf(x.foeHp, T.foeMax[x.fi])}%`);
    else why.push("stalls");
    return {
      vs: ref(foes[x.fi]), send: ref(party[x.mi]), entry: x.entry,
      move: us?.name ?? null, type: us?.type ?? null,
      hp: pctOf(x.hp, T.ourMax[x.mi]), foeHp: pctOf(x.foeHp, T.foeMax[x.fi]),
      sacrifice, why: why.join(" · "),
    };
  });
  const sacrifice = plan.steps.flatMap((x, i) => (steps[i].sacrifice
    ? [{ ...ref(party[x.mi]), hp: pctOf(start.oh[x.mi], T.ourMax[x.mi]), vs: ref(foes[x.fi]), frees: ref(party[plan.steps[i + 1].mi]) }] : []));

  const warnings = [];
  const names = list => list.map(mi => party[mi].name).join(", ");
  const lost = plan.result !== "win" ? "likely lost: " : "";
  const left = plan.fh.filter(hp => hp >= 1).length;
  if (win >= 0) {
    const w = foes[win].name;
    const acting = answers.filter(a => a.acts);
    const faster = tpAlive(start.oh).every(mi => T.first[mi][win] > 0.5);
    if (!answers.length) warnings.push(`${lost}nothing we have hurts ${w} — maximise damage before it comes in`);
    else if (!acting.length) {
      warnings.push(`${lost}${faster ? `nobody outspeeds ${w}` : `nobody survives ${w}`} and it KOs ${kills[win]} of ${alive} — maximise damage before it comes in, keep ${names(reserve)} healthy`);
    } else if (!answers.some(a => a.r.fh < 1)) {
      warnings.push(`${lost}nobody KOs ${w} 1-on-1${faster ? " or outspeeds it" : ""} — maximise damage before it comes in, chip it with ${names(acting.map(a => a.mi))}`);
    } else if (lost) warnings.push(`${lost}the plan runs out with ${left} foe${left > 1 ? "s" : ""} standing — maximise damage into ${w}`);
    const spent = reserve.filter(mi => plan.steps.some((x, i) => x.mi === mi && x.hp < 1 && (winStep < 0 || i < winStep)));
    if (spent.length) warnings.push(`${names(spent)} goes down before ${w} comes in`);
  } else if (lost) warnings.push(`${lost}the plan runs out with ${left} foe${left > 1 ? "s" : ""} standing — maximise damage`);

  // Nothing to plan around (an easy trainer): one line instead of the step list.
  const compact = plan.result === "win" && !warnings.length && !sacrifice.length && !answers.length;
  return {
    result: plan.result,
    win: win >= 0 ? { ...ref(foes[win]), kills: kills[win], of: alive, boss: !!foes[win].isBoss?.() } : null,
    steps,
    reserve: answers.map(a => ({
      ...ref(party[a.mi]), for: ref(foes[win]), per: Math.min(100, Math.round(a.per * 100)), acts: a.acts,
    })),
    sacrifice,
    warnings,
    compact,
    summary: compact ? `winnable · ${[...new Set(steps.map(x => x.send.name))].join(" › ")}` : null,
    // Doubles are simulated as one-on-one exchanges, so the steps are only a rough order.
    approxDoubles: double,
  };
};
