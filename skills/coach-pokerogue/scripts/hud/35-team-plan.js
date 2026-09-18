// Whole-fight plan for trainer battles: which of our mons takes which enemy, in the order the trainer sends them,
// with HP carried from one exchange to the next. The one-turn planner can't see that spending the only answer to
// a boss early loses the fight three foes later.
//
// The fight is simulated coarsely. An exchange is one of our mons against one foe until one faints: each side
// hits with our best move and the foe's likely moves, from a few damage levels (a miss, the rolls, a crit) each turn,
// in both speed orders weighted by their chance (a tie is a coin flip), with boss bars clamping each hit and turn-end
// heals and chip in between — a few HP branches carried turn to turn, so a coin-flip KO stays one. A voluntary
// switch-in takes one hit before it acts; a fainted mon's replacement comes in free. After a foe faints the trainer
// sends the bench mon with the best matchup score against the mon we have on the field, at the HP the plan has left it
// on (trainer.getNextSummonIndex over getPartyMemberMatchupScores, spec §7). Our choices are searched with a small
// beam, each exchange's likelier ending carried on and the others weighed in its value; the enemy's choices are not
// branched. Mid-exchange enemy switches, status, stat changes and doubles are not modelled — doubles are planned as
// one slot against one foe at a time.
const TP_BEAM = 24;
const TP_TURNS = 15;
const TP_BRANCHES = 4;
let teamPlanCache = { key: null, live: false, value: null };

// A use's damage distribution (`use`, [{ d, p, n }]) as up to four levels relative to its mean ([{ r, p, n }]): the
// miss, the low and high rolls, the crit, each with the hits it lands in. Null when there's nothing to spread.
const tpSpread = use => {
  const mean = (use ?? []).reduce((t, x) => t + x.d * x.p, 0);
  return mean > 0 ? squeezeDist(use.map(x => ({ d: x.d / mean, p: x.p, n: x.n ?? 1 })), 4).map(x => ({ r: x.d, p: x.p, n: x.n })) : null;
};
// Turns `o` (an outcome or `hits` record) needs to KO `target` on its own: the KO pacing core's expected use.
const tpTurns = (o, target) => koTurns(koCurve(target, useOf(o)).by);
// The record in `list` that KOs `target` soonest (`turns`), then the hardest hitting (`dmg`).
const tpFastest = (list, target, turns = o => tpTurns(o, target), dmg = o => o.dmg) => list
  .map(o => ({ o, n: turns(o) }))
  .reduce((b, x) => (!b || x.n < b.n || (x.n === b.n && dmg(x.o) > dmg(b.o)) ? x : b), null)?.o ?? null;

// One of our moves as the plan reads it: its mean damage a use (`dmg`, uncut by the target's HP or bars) and its
// damage levels (`use`). Takes an outcome record, so the ⚔ line's own pick can be handed straight to the plan.
const tpMoveOf = (o, extra) => {
  const use = useOf(o);
  return { name: o.name, type: o.type, cat: o.cat, e: o.e, priority: o.priority ?? 0, dmg: use.reduce((t, x) => t + x.d * x.p, 0), use: tpSpread(use), drain: o.drain ?? 0,
    charge: !!o.traits?.charge, recharge: !!o.traits?.recharge || !!o.traits?.noRepeat, semiCharge: !!o.traits?.charge && !!o.traits?.semiCharge, ...extra };
};

// Our best move into `f`, by turns to KO it then damage, whose hits land one by one on the game's bar rule (`hitOn`).
const tpOurMove = (s, me, f, live) => {
  const view = (o, extra) => tpMoveOf(o, extra);
  if (live && typeof moveOutcomes === "function") {
    try {
      // Best by turns to KO it (a charge or recharge turn per hit counts), then by damage.
      const turns = o => (o.expected > 0 ? (o.traits?.charge || o.traits?.recharge ? 2 : 1) * tpTurns(o, f) - (o.traits?.recharge ? 1 : 0) : 99);
      const best = tpFastest(moveOutcomes(s, me, f) ?? [], f, turns, o => o.expected);
      if (best?.expected > 0) {
        return view(best, { charge: !!best.traits?.charge, recharge: !!best.traits?.recharge || !!best.traits?.noRepeat, semiCharge: !!best.traits?.charge && !!best.traits?.semiCharge });
      }
    } catch {}
  }
  const m = tpFastest(hits(me, f).filter(x => x.dmg > 0), f);
  return m ? view(m) : null;
};

// What `f` does to `me` per turn (its mean, uncut by `me`'s HP, and its damage levels), and P(f acts first) when the
// threat model knows it. The AI's distribution this turn was scored against the mon on the field, so a mon not on the
// field, or a foe not on it, gets the foe's re-picked moves (`next`); `entry` is the hit a switch-in takes coming in.
const tpTheirMove = (s, f, me, live) => {
  if (live && typeof threatFrom === "function") {
    try {
      const next = !me.isOnField?.() || !f.isOnField?.();
      const t = threatFrom(s, f, me, null, { next });
      if (Number.isFinite(t?.expected)) {
        const now = next && f.isOnField?.() ? threatFrom(s, f, me) : t;
        const mean = (t.use ?? []).reduce((sum, x) => sum + x.d * x.p, 0);
        const moved = t.moves.reduce((sum, m) => sum + m.p, 0);
        return {
          dmg: mean > 0 ? mean : t.expected, entry: Number.isFinite(now?.expected) ? now.expected : t.expected, use: tpSpread(t.use),
          name: typeof t.move === "string" ? t.move : t.move?.name ?? null, e: t.move?.e ?? 1, first: t.first, priority: t.move?.priority ?? 0, hits: hitsOn(t),
          // The share of its damage its drain moves win back, and how much of its damage is physical (for boosts).
          drain: t.expected > 0 ? (t.drain ?? 0) / t.expected : 0,
          phys: moved > 0 ? t.moves.reduce((sum, m) => sum + m.p * (m.cat === "special" ? 0 : 1), 0) / moved : 1,
        };
      }
    } catch {}
  }
  const m = tpFastest(hits(f, me, true).filter(x => x.dmg > 0), me);
  return { dmg: m?.dmg ?? 0, name: m?.name ?? null, e: m?.e ?? 1, first: null, priority: m?.priority ?? 0, hits: m?.dmg > 0 ? 1 : 0,
    drain: m?.drain ?? 0, phys: m?.cat === "special" ? 0 : 1 };
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
  const a = stat(me, Stat.SPD), b = stat(f, Stat.SPD);
  return b > a ? 1 : b < a ? 0 : 0.5;
};

// The trainer's send-in score for bench mon `f` against our `me` (Pokemon.getMatchupScore, pinned source): its
// attack and defence type scores, times min(1, its HP ratio + 1 − ours), ×1.25 when it outspeeds us, else ×0.5 at
// 20–40 % HP. Our HP moves over the plan, so the game is asked once with ours at 0 — the HP factor then caps at 1 and
// the call returns the type scores alone — and `tpSendScore` puts the HP back. Without game code, a type-chart stand-in.
const tpSendBase = (s, f, me, live) => {
  const speed = p => (typeof p.getEffectiveStat === "function" ? p.getEffectiveStat(Stat.SPD) : stat(p, Stat.SPD));
  const outspeed = (f.isActive?.(true) ? speed(f) : f.getStat(Stat.SPD, false)) >= speed(me);
  if (live && typeof f.getMatchupScore === "function") {
    try {
      const v = f.getMatchupScore(Object.create(me, { hp: { value: 0 } }));
      if (Number.isFinite(v)) return { base: v, outspeed };
    } catch {}
  }
  // The game's own shape: attack, its damaging moves' effectiveness into us (×1.5 for its own type) averaged; defence,
  // how little our types hurt it.
  const moves = (f.moveset ?? []).map(pm => pm?.getMove?.()).filter(mv => mv && mv.category !== MoveCategory.STATUS);
  const atk = moves.length ? moves.reduce((t, mv) => t + effectiveness(TYPES[mv.type], me) * (typesOf(f).includes(TYPES[mv.type]) ? 1.5 : 1), 0) / moves.length : 1;
  const def = typesOf(me).reduce((x, t) => x / Math.max(effectiveness(t, f), 0.25), 1);
  return { base: atk + def, outspeed };
};
const tpSendScore = (T, st, fi, mi) => {
  const x = T.send[fi][mi];
  if (typeof x === "number") return x;
  const ratio = (hp, max) => Math.round(hp / max * 100) / 100;
  const fr = ratio(st.fh[fi], T.foeMax[fi]);
  let diff = fr + 1 - ratio(st.oh[mi], T.ourMax[mi]);
  if (x.outspeed) diff *= 1.25;
  else if (fr > 0.2 && fr <= 0.4) diff *= 0.5;
  return x.base * Math.min(diff, 1);
};

// Turn-end HP change split into what recurs (Leftovers and other heals, weather and status chip: negative when chip
// wins) and the one-shot berries (Sitrus below half, Enigma after a super-effective hit), read by asking endOfTurnHp
// about the mon at a made-up HP.
const tpHealAt = (s, p, hp = Math.ceil(p.getMaxHp() * 0.75), se = false) => {
  if (typeof endOfTurnHp !== "function") return 0;
  try { return endOfTurnHp(Object.create(p, { hp: { value: hp } }), { s, hp, tookSuperEffective: se }) || 0; } catch { return 0; }
};
const tpHealProfile = (s, p) => {
  if (typeof endOfTurnHp !== "function") return null;
  const max = p.getMaxHp();
  const at = (hp, se) => tpHealAt(s, p, hp, se);
  const base = at(Math.ceil(max * 0.75), false);
  return { base, sitrus: Math.max(0, at(Math.floor(max * 0.4), false) - base), enigma: Math.max(0, at(Math.ceil(max * 0.75), true) - base) };
};

const tpTables = (s, party, foes, live, double = false) => {
  const ours = party.map(me => foes.map(f => tpOurMove(s, me, f, live)));
  const theirs = foes.map(f => party.map(me => tpTheirMove(s, f, me, live)));
  return {
    ours, theirs,
    // How many of ours stand at once. In a double both field mons are out, so neither pays to act (#113 bucket 7).
    slots: double && party.length >= 2 ? 2 : 1,
    first: party.map((me, mi) => foes.map((f, fi) => tpFoeFirst(s, me, f, ours[mi][fi], theirs[fi][mi], live))),
    send: foes.map(f => party.map(me => tpSendBase(s, f, me, live))),
    memo: new Map(),
    // Each foe's standing as the KO pacing core reads it (boss bars, the final boss's floor); its HP and bar are carried.
    foeState: foes.map(f => stateOf(f)),
    ourMax: party.map(p => p.getMaxHp()), foeMax: foes.map(f => f.getMaxHp()),
    ourHeal: party.map(p => tpHealProfile(s, p)), foeHeal: foes.map(p => tpHealProfile(s, p)),
    foeStart: foes.map(f => f.hp),
    // On-KO boosts (Beast Boost, Moxie, Soul-Heart) on each side, and the damage factor `n` KOs' worth gives a hit
    // (`atk`: the attacker's boosts for a physical share `phys`; `def`: the defender's).
    ourKo: party.map(koBoost), foeKo: foes.map(koBoost),
    koMult: (atkMon, atkBoost, atkN, defMon, defBoost, defN, phys) => {
      const f = (p, b, n, st) => koStageFactor(p, b, n, st);
      const up = phys * f(atkMon, atkBoost, atkN, Stat.ATK) + (1 - phys) * f(atkMon, atkBoost, atkN, Stat.SPATK);
      const guard = phys * f(defMon, defBoost, defN, Stat.DEF) + (1 - phys) * f(defMon, defBoost, defN, Stat.SPDEF);
      return up / guard;
    },
    party, foes,
    ...tpWear(s, party, foes, live, ours, theirs),
  };
};

// Wave status tokens on our mons and item thieves on both sides (30-planner): the token odds and what their status
// adds at turn end, who moves first once paralysed, each side's steal rates, and each mon's turn-end HP change after
// k steals.
const tpWear = (s, party, foes, live, ours, theirs) => {
  const heal = p => tpHealAt(s, p);
  const tok = party.map(me => {
    const odds = foes[0] ? tokenOdds(s, foes[0], me) : null;
    return odds && { odds, shift: tokenShift(odds, me, heal), para: odds.tokens.filter(x => x.effect === StatusEffect.PARALYSIS).reduce((t, x) => t + x.share, 0) };
  });
  const firstPara = party.map((me, mi) => (tok[mi]?.para ? foes.map((f, fi) => {
    const slowed = { id: { value: `${me.id}~paralysed` }, status: { value: { effect: StatusEffect.PARALYSIS } } };
    if (typeof me.getEffectiveStat !== "function") slowed.getStat = { value: i => me.getStat(i) / (i === Stat.SPD ? 2 : 1) };
    const clone = Object.create(me, slowed);
    return tpFoeFirst(s, clone, f, ours[mi][fi], tpTheirMove(s, f, clone, live), live);
  }) : null));
  const fromUs = foes.map(f => party.map(me => stealRates(f, me)));
  const fromFoe = party.map(me => foes.map(f => stealRates(me, f)));
  return {
    tok, firstPara, fromUs, fromFoe,
    ourItems: party.map((me, mi) => (foes.some((_, fi) => fromUs[fi][mi]) ? afterSteals(me, heal) : null)),
    foeItems: foes.map((f, fi) => (party.some((_, mi) => fromFoe[mi][fi]) ? afterSteals(f, heal) : null)),
  };
};
// Turn-end HP change from `byCount` (after k steals) with `fixed` sure steals and Grip Claw's `mean`, against none.
const tpStolen = (byCount, fixed, mean) => (byCount ? stealCounts(fixed, mean).reduce((t, p, k) => t + p * (byCount[k] - byCount[0]), 0) : 0);

const tpHeal = (hp, max, prof, used, se, extra = 0) => {
  if (!prof || hp < 1) return [hp, used];
  let add = prof.base + extra;
  if (hp < max / 2 && !(used & 1) && prof.sitrus) { add += prof.sitrus; used |= 1; }
  if (se && !(used & 2) && prof.enigma) { add += prof.enigma; used |= 2; }
  return [Math.min(max, hp + add), used];
};

// One exchange from state `st`: our `mi` against foe `fi` until one faints (or TP_TURNS pass).
// entry "switch": a voluntary switch-in, the foe gets a free hit first.
// Carried between exchanges: `ox` the landed enemy hits each of our mons has taken (wave status tokens), `od`/`og`
// the Mini Black Hole steals and Grip Claw's expected steals from it, `fd`/`fg` the same from each foe.
// Each turn every standing branch plays both speed orders (weighted by P(foe first), paralysis from tokens mixed in)
// and each side's damage levels (`use`; a table without them hits for its mean); what's left standing is merged back
// to TP_BRANCHES by closeness. Returns the likelier ending in the old shape ({ mh, fh, … , turns }) with `pWin` (the
// foe falls first), `pLoss`, `pStall` and `ends` ({ win, loss, stall }, each such a state or null).
// `over`: our move for this exchange only — the ⚔ line's own pick, pinned into the plan's first step (#113
// prerequisite 3). It is never memoised, since the key names the pair, not the move.
const tpFight = (T, st, mi, fi, entry, over = null) => {
  // KOs each side's on-KO boost has had so far (Soul-Heart counts every faint).
  const faints = st.oh.filter(hp => hp < 1).length + st.fh.filter(hp => hp < 1).length;
  const nUs = T.ourKo?.[mi] ? (T.ourKo[mi].any ? faints : st.ok?.[mi] ?? 0) : 0;
  const nFoe = T.foeKo?.[fi] ? (T.foeKo[fi].any ? faints : st.fk?.[fi] ?? 0) : 0;
  const key = !over && T.memo && [mi, fi, entry, Math.round(st.oh[mi]), st.ob[mi], Math.round(st.fh[fi]), st.fs[fi], st.fb[fi], nUs, nFoe,
    ...[st.ox?.[mi], st.od?.[mi], st.og?.[mi], st.fd?.[fi], st.fg?.[fi]].map(x => Math.round((x ?? 0) * 20))].join();
  if (key && T.memo.has(key)) return T.memo.get(key);
  const us = over ?? T.ours[mi][fi], them = T.theirs[fi][mi], foeState = T.foeState?.[fi] ?? { bar: 0 };
  // Those boosts on either side, as factors on each side's hits (Speed boosts aren't modelled).
  const usMul = us && (nUs || nFoe) && T.koMult ? T.koMult(T.party[mi], T.ourKo[mi], nUs, T.foes[fi], T.foeKo[fi], nFoe, us.cat === "special" ? 0 : 1) : 1;
  const themMul = (nUs || nFoe) && T.koMult ? T.koMult(T.foes[fi], T.foeKo[fi], nFoe, T.party[mi], T.ourKo[mi], nUs, them.phys ?? 1) : 1;
  const tok = T.tok?.[mi], robUs = T.fromUs?.[fi]?.[mi], robFoe = T.fromFoe?.[mi]?.[fi];
  const ourUse = us?.use ?? [{ r: 1, p: 1 }], theirUse = them.use ?? [{ r: 1, p: 1 }];
  // Tables or states without them (built by hand) carry no wear.
  const ox0 = st.ox?.[mi] ?? 0;
  let turns = 0;
  // P(token status by the end of turn t), t = 0 before this exchange, from the landed hits expected by then.
  const by = t => (!tok ? 0 : tok.odds.by(ox0 + (entry === "switch" ? them.hits ?? 0 : 0) + (them.hits ?? 0) * Math.max(0, t)));
  // Our damage level `o` lands its hits one by one on the foe's bars (`hitOn`). A drain move (Giga Drain, Leech Life)
  // wins back its share of the HP they actually took.
  const hitFoe = (b, o) => {
    const n = Math.max(1, Math.round(o.n ?? 1));
    let st = { ...foeState, hp: b.fh, bar: b.fs };
    for (let k = 0; k < n && st.hp >= 1; k++) {
      st = hitOn(st, us.dmg * o.r * usMul / n);
      b.fg += robFoe?.perHit ?? 0;
    }
    if (us.drain && b.mh >= 1) b.mh = Math.min(T.ourMax[mi], b.mh + (b.fh - st.hp) * us.drain);
    b.fh = st.hp;
    b.fs = st.bar;
  };
  const foeHit = (b, r, dmg = them.dmg) => {
    const hit = dmg * r * themMul;
    const dealt = Math.min(hit, Math.max(0, b.mh));
    b.mh -= hit;
    if (them.drain && b.fh >= 1) b.fh = Math.min(T.foeMax[fi], b.fh + dealt * them.drain);
    b.ox += them.hits ?? 0;
    b.og += (robUs?.perHit ?? 0) * (them.hits ?? 0);
  };
  const endTurn = b => {
    [b.mh, b.mb] = tpHeal(b.mh, T.ourMax[mi], T.ourHeal[mi], b.mb, them.e >= 2, (tok ? tok.shift * by(turns) : 0) + tpStolen(T.ourItems?.[mi], b.od, b.og));
    [b.fh, b.fb] = tpHeal(b.fh, T.foeMax[fi], T.foeHeal[fi], b.fb, (us?.e ?? 1) >= 2, tpStolen(T.foeItems?.[fi], b.fd, b.fg));
    // Mini Black Hole steals after the heals, if its holder is still up.
    if (robUs && b.fh >= 1) b.od += robUs.perTurn;
    if (robFoe && b.mh >= 1) b.fd += robFoe.perTurn;
  };
  const pools = { win: [], loss: [] };
  const settle = (b, list) => {
    if (b.fh < 1) pools.win.push({ ...b, turns });
    else if (b.mh < 1) pools.loss.push({ ...b, turns });
    else list.push(b);
  };
  let standing = [];
  const start = { p: 1, mh: st.oh[mi], mb: st.ob[mi], fh: st.fh[fi], fs: st.fs[fi], fb: st.fb[fi], ox: ox0, od: st.od?.[mi] ?? 0, og: st.og?.[mi] ?? 0, fd: st.fd?.[fi] ?? 0, fg: st.fg?.[fi] ?? 0 };
  if (entry === "switch") {
    for (const t of theirUse) { const b = { ...start, p: t.p }; foeHit(b, t.r, them.entry ?? them.dmg); endTurn(b); settle(b, standing); }
    standing = tpMerge(standing, TP_BRANCHES, T, mi, fi);
  } else standing = [start];
  while (standing.length && turns < TP_TURNS) {
    turns++;
    // Paralysed (by a token) by now, we're half as fast: the two orders' chances mixed by how likely that is.
    const para = tok?.para ? by(turns - 1) * tok.para : 0;
    const pFoe = Math.max(0, Math.min(1, para * (T.firstPara?.[mi]?.[fi] ?? T.first[mi][fi]) + (1 - para) * T.first[mi][fi]));
    const act = tok ? 1 - attemptsLost(tok.odds, by, turns, pFoe) : 1;
    // A charging move hits every second turn (hidden meanwhile for Dig / Fly: the foe's later hit misses); a
    // recharging one, or one that can't repeat, loses the turn after each hit.
    const hits = !!us && (us.charge ? turns % 2 === 0 : us.recharge ? turns % 2 === 1 : true);
    const hidden = !!us && !hits && !!us.semiCharge;
    const ours = hits ? [...(act < 1 ? [{ r: 0, p: 1 - act }] : []), ...ourUse.map(x => ({ ...x, p: x.p * act }))] : [{ r: 0, p: 1 }];
    const next = [];
    for (const b of standing) {
      for (const [foeFirst, w] of [[false, 1 - pFoe], [true, pFoe]]) {
        if (!(w > 0)) continue;
        for (const o of ours) {
          if (!foeFirst) {
            const a = { ...b, p: b.p * w * o.p };
            if (o.r > 0) hitFoe(a, o);
            if (a.fh < 1 || hidden) { endTurn(a); settle(a, next); continue; }
            for (const t of theirUse) { const c = { ...a, p: a.p * t.p }; foeHit(c, t.r); endTurn(c); settle(c, next); }
          } else {
            for (const t of theirUse) {
              const c = { ...b, p: b.p * w * o.p * t.p };
              foeHit(c, t.r);
              if (c.mh >= 1 && o.r > 0) hitFoe(c, o);
              endTurn(c);
              settle(c, next);
            }
          }
        }
      }
    }
    standing = tpMerge(next.filter(b => b.p > 1e-6), TP_BRANCHES, T, mi, fi);
  }
  const mass = list => list.reduce((t, b) => t + b.p, 0);
  const one = list => {
    if (!list.length) return null;
    const b = tpMerge(list, 1, T, mi, fi)[0];
    const turnsAt = list.reduce((t, x) => t + x.p * (x.turns ?? turns), 0) / (b.p || 1);
    return { mh: b.mh < 1 ? 0 : b.mh, mb: b.mb, fh: b.fh < 1 ? 0 : b.fh, fs: b.fs, fb: b.fb, turns: Math.round(turnsAt), ox: b.ox, od: b.od, og: b.og, fd: b.fd, fg: b.fg };
  };
  const ends = { win: one(pools.win), loss: one(pools.loss), stall: one(standing.map(b => ({ ...b, turns }))) };
  const pWin = mass(pools.win), pLoss = mass(pools.loss), pStall = Math.max(0, 1 - pWin - pLoss);
  const likely = pWin >= pLoss && pWin >= pStall ? ends.win : pLoss >= pStall ? ends.loss : ends.stall;
  const out = { ...likely, pWin, pLoss, pStall, ends };
  if (key) T.memo.set(key, out);
  return out;
};
// Branches cut down to `k` by joining the two closest (HP on both sides, as shares of max HP; a different boss bar or
// berry state counts as far) into their weighted mean; the heavier one's bar and berry state are kept.
const tpMerge = (list, k, T, mi, fi) => {
  const out = list.slice();
  const far = (a, b) => Math.abs(a.mh - b.mh) / T.ourMax[mi] + Math.abs(a.fh - b.fh) / T.foeMax[fi] + (a.fs !== b.fs || a.mb !== b.mb || a.fb !== b.fb ? 1 : 0);
  while (out.length > k) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const d = far(out[i], out[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    const [a, b] = [out[bi], out[bj]];
    const p = a.p + b.p;
    const w = f => (p > 0 ? (a[f] * a.p + b[f] * b.p) / p : a[f]);
    const big = a.p >= b.p ? a : b;
    out.splice(bj, 1);
    out[bi] = { ...big, p, mh: w("mh"), fh: w("fh"), ox: w("ox"), od: w("od"), og: w("og"), fd: w("fd"), fg: w("fg"), ...(a.turns != null ? { turns: w("turns") } : {}) };
  }
  return out;
};
// The HP a fight is expected to leave the foe on (0 when it falls).
const tpFoeLeft = r => r.pLoss * (r.ends.loss?.fh ?? 0) + r.pStall * (r.ends.stall?.fh ?? 0);

const tpClone = st => ({ ...st, oh: st.oh.slice(), ob: st.ob.slice(), fh: st.fh.slice(), fs: st.fs.slice(), fb: st.fb.slice(),
  ox: st.ox.slice(), od: st.od.slice(), og: st.og.slice(), fd: st.fd.slice(), fg: st.fg.slice(),
  ok: st.ok?.slice() ?? st.oh.map(() => 0), fk: st.fk?.slice() ?? st.fh.map(() => 0) });
// Carry an exchange's result into state `c`, counting the KO it scored for the side's on-KO boosts (`ok`, `fk`).
const tpApply = (c, mi, fi, r) => {
  if (c.ok && c.fh[fi] >= 1 && r.fh < 1) c.ok[mi]++;
  if (c.fk && c.oh[mi] >= 1 && r.mh < 1) c.fk[fi]++;
  c.oh[mi] = r.mh; c.ob[mi] = r.mb; c.fh[fi] = r.fh; c.fs[fi] = r.fs; c.fb[fi] = r.fb;
  c.ox[mi] = r.ox; c.od[mi] = r.od; c.og[mi] = r.og; c.fd[fi] = r.fd; c.fg[fi] = r.fg;
};
const tpAlive = hps => hps.flatMap((hp, i) => (hp >= 1 ? [i] : []));

// The trainer's next mon: best matchup score against the mon we have on the field, at the HP it's on by then. In a
// double that is the mon that just acted, since the plan runs one exchange at a time.
const tpNextFoe = (T, st) => {
  const alive = tpAlive(st.fh);
  const me = st.act ?? st.cur?.[0];
  if (me == null) return alive[0];
  return alive.reduce((b, fi) => (tpSendScore(T, st, fi, me) > tpSendScore(T, st, b, me) ? fi : b), alive[0]);
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
    if (!end) for (const mi of ours) best = Math.max(best, 1 - tpFoeLeft(tpFight(T, st, mi, fi, "free")) / hp);
    v += 100 * (dealt + (1 - dealt) * best);
  });
  st.oh.forEach((hp, mi) => { v += 25 * hp / T.ourMax[mi]; });
  if (st.fh.every(hp => hp < 1)) v += 100;
  return v;
};

// `reserve`: [{ mi, fi }] — our `mi` is kept away from every foe but `fi` while anyone else can still fight.
// `pin`: this turn's action as the ⚔ line decided it — `{ mi, move }`, the mon that acts and, when the planner scored
// a damaging move for it, that move. It fixes the first exchange only; the rest of the fight is searched as usual.
// This is #113's "⚔ seeds ♟": the plan explains the rest of the fight instead of contradicting the turn.
const tpSearch = (T, start, reserve, pin = null) => {
  let beam = [start];
  const done = [];
  const slots = T.slots ?? 1;
  for (let depth = 0; beam.length && depth <= start.oh.length + start.fh.length + 1; depth++) {
    const next = new Map();
    for (const st of beam) {
      const fi = st.fcur ?? tpNextFoe(T, st);
      // Every mon on the field is out: only a mon coming off the bench into a full field pays an entry hit. The game
      // asking "will you switch?" before the turn is the exception — that switch is free (`pin.free`).
      const entryOf = (mi, free) => (st.cur.includes(mi) ? "stay" : free || st.cur.length < slots ? "free" : "switch");
      const alive = tpAlive(st.oh);
      let cands = alive.map(mi => [mi, entryOf(mi, false)]);
      if (depth === 0 && pin && alive.includes(pin.mi)) cands = [[pin.mi, entryOf(pin.mi, pin.free)]];
      else if (reserve.length) {
        const spare = cands.filter(([mi]) => !reserve.some(r => r.mi === mi && r.fi !== fi));
        if (spare.length) cands = spare;
      }
      for (const [mi, entry] of cands) {
        const r = tpFight(T, st, mi, fi, entry, depth === 0 && pin?.move && mi === pin.mi ? pin.move : null);
        const child = end => {
          const c = tpClone(st);
          tpApply(c, mi, fi, end);
          // Who else is left on the field: a mon already out just leaves its own slot when it falls, a mon coming
          // into an empty slot displaces nobody, and one coming into a full field takes the place of the mon that
          // was standing there — whether it paid for the switch or the game handed it one.
          const rest = st.cur.includes(mi) ? st.cur.filter(i => i !== mi) : st.cur.length < slots ? st.cur : st.cur.slice(1);
          c.cur = (end.mh >= 1 ? [...rest, mi] : rest).sort((a, b) => a - b);
          c.act = end.mh >= 1 ? mi : rest[0] ?? null;
          c.fcur = end.fh >= 1 ? fi : null;
          c.result = c.fh.every(hp => hp < 1) ? "win" : c.oh.every(hp => hp < 1) ? "loss" : end.mh >= 1 && end.fh >= 1 ? "stall" : null;
          return c;
        };
        // The likelier ending goes on; the value weighs every ending by its chance.
        const c = child(r);
        c.steps = [...st.steps, { mi, fi, entry, hp: r.mh, foeFrom: st.fh[fi], foeHp: r.fh, turns: r.turns, odds: r.fh < 1 ? r.pWin : r.mh < 1 ? r.pLoss : r.pStall }];
        c.val = [["win", r.pWin], ["loss", r.pLoss], ["stall", r.pStall]].reduce((v, [k, p]) => {
          const e = r.ends[k];
          if (!e || !(p > 0)) return v;
          const x = e.mh === r.mh && e.fh === r.fh ? c : child(e);
          return v + p * tpValue(T, x, !!x.result);
        }, 0) / Math.max(1e-9, (r.ends.win ? r.pWin : 0) + (r.ends.loss ? r.pLoss : 0) + (r.ends.stall ? r.pStall : 0));
        if (c.result) { done.push(c); continue; }
        const sig = [c.cur.join("-"), c.act, c.fcur, ...c.oh.map(Math.round), ...c.fh.map(Math.round), ...c.ok, ...c.fk].join(",");
        if (!next.has(sig) || next.get(sig).val < c.val) next.set(sig, c);
      }
    }
    beam = [...next.values()].sort((a, b) => b.val - a.val).slice(0, TP_BEAM);
  }
  return done.reduce((b, st) => (!b || st.val > b.val ? st : b), null);
};


// The foe the plan should aim at: the one the ⚔ line plans against, which is the predicted switch-in when a foe is
// leaving (#113 bucket 6 — ♟ used to aim at the mon that was walking away, and ⚔ was right every time). Outside a
// command phase, and during a free switch where the enemy has decided nothing, it is simply the foe on the field.
const tpFacing = (s, b, foes) => {
  const onField = foes.filter(f => f.isOnField?.());
  const active = (onField.length ? onField : foes).slice(0, b.double ? 2 : 1);
  const here = active[0] ?? null;
  if (!here || !awaitingCommand(s) || awaitingDecision(s) === "check-switch" || typeof predictSwitches !== "function") return here;
  try {
    const p = predictSwitches(s, b, active).get(here);
    return (p?.ratio ?? 0) >= 1 && foes.includes(p.to) ? p.to : here;
  } catch { return here; }
};

// How far ahead of the pinned plan the free one has to be before the panel says so (#113: ~a fifth of a KO).
const TP_PREFER = 20;
// How much better spending an answer early has to be before the plan gives up holding it back.
const TP_HOLD = 10;

// Everything the fight plan knows before this turn's action is chosen: the tables, the starting state, the win
// condition, who answers which foe, and the searches. `at(pin)` re-searches with the ⚔ line's action pinned as step 1,
// `after(pin)` reads what that plan says comes next, and `view(pin)` renders it. #113 made ⚔ the authority for the
// turn and this the model that explains the rest of the fight around it.
const tpModel = (T, b, party, foes, facing) => {
  const ref = p => ({ icon: iconOf(p), name: p.name });
  const pctOf = (hp, max) => Math.round(hp / max * 100);
  const double = !!b.double;
  const fcur = foes.indexOf(facing);
  const start = {
    oh: party.map(p => p.hp), ob: party.map(() => 0),
    fh: foes.map(f => f.hp), fs: T.foeState.map(x => x.bar), fb: foes.map(() => 0),
    ox: party.map(() => 0), od: party.map(() => 0), og: party.map(() => 0), fd: foes.map(() => 0), fg: foes.map(() => 0),
    ok: party.map(() => 0), fk: foes.map(() => 0),
    // Every mon standing on the field, not just the first: in a double neither of ours pays to act.
    cur: party.flatMap((p, i) => (p.isOnField?.() ? [i] : [])), fcur: fcur >= 0 ? fcur : null, steps: [],
  };
  start.act = start.cur[0] ?? null;

  // Win condition: the foe that KOs the most of our team when we throw everyone at it, best answer first.
  const sweep = fi => {
    const st = tpClone(start);
    let kills = 0;
    for (let left = tpAlive(st.oh); left.length && st.fh[fi] >= 1; left = tpAlive(st.oh)) {
      const runs = left.map(mi => ({ mi, r: tpFight(T, st, mi, fi, "free") }));
      const rank = ({ mi, r }) => (r.fh < 1 ? 2 + r.mh / T.ourMax[mi] : 1 - r.fh / st.fh[fi]);
      const { mi, r } = runs.reduce((b, x) => (rank(x) > rank(b) ? x : b));
      tpApply(st, mi, fi, r);
      if (r.mh < 1) kills++;
      else break; // it fell, or neither side can finish the other
    }
    return kills;
  };
  const alive = tpAlive(start.oh).length;
  const kills = foes.map((_, fi) => sweep(fi));
  const hurt = fi => party.reduce((t, _, mi) => t + (T.ours[mi][fi]?.dmg ?? 0) / foes[fi].hp, 0);
  let win = -1;
  foes.forEach((_, fi) => {
    if (kills[fi] < Math.min(2, alive)) return;
    if (win < 0 || kills[fi] > kills[win] || (kills[fi] === kills[win] && hurt(fi) < hurt(win))) win = fi;
  });

  // The per-foe answer matrix (#170 §A): who answers each foe 1-on-1 — `per` the share of its HP they take a turn,
  // `beats` they win the exchange outright, `acts` they get to hurt it at all. It is an input, not a panel section:
  // it picks the win condition's answers and the foes only one of ours beats, which are what the ⚔ line prices.
  const matrix = foes.map((f, fi) => tpAlive(start.oh)
    .map(mi => {
      const r = tpFight(T, start, mi, fi, "free");
      return { mi, per: (T.ours[mi][fi]?.dmg ?? 0) / f.hp, beats: r.fh < 1 && r.mh >= 1, acts: r.fh < f.hp };
    })
    .filter(a => a.beats || a.per >= 0.2)
    .sort((a, b) => b.per - a.per));

  // Answers to the win condition: the two hardest hitters, kept back for it.
  const answers = win < 0 ? [] : matrix[win].filter(a => a.per >= 0.2).slice(0, 2);
  // A foe only one of ours beats is its own reason to hold that mon back, even when it is not the win condition
  // (`sweep` needs two KOs to call something a win condition, so Guzma's Xurkitree never was one). Only for a foe
  // still to come — there is nothing to save a mon for against the one it is standing in front of — and only with a
  // bench worth choosing from: with two mons left, "only one of them beats it" is not news.
  const only = foes.flatMap((f, fi) => {
    if (fi === win || alive < 3 || f.isOnField?.()) return [];
    const beat = matrix[fi].filter(a => a.beats);
    return beat.length === 1 ? [{ mi: beat[0].mi, fi, per: beat[0].per, acts: beat[0].acts }] : [];
  });
  const hold = [...answers.map(a => ({ mi: a.mi, fi: win })), ...only.map(o => ({ mi: o.mi, fi: o.fi }))];
  const reserve = [...new Set(hold.map(h => h.mi))];
  // One line per mon, not per foe: a mon that is the only answer to two foes is one thing to know.
  const onlyBy = [...new Set(only.map(o => o.mi))].map(mi => {
    const mine = only.filter(o => o.mi === mi);
    return { mi, fis: mine.map(o => o.fi), per: Math.max(...mine.map(o => o.per)), acts: mine.some(o => o.acts) };
  });

  // The beam is myopic: left alone it spends the answers on whatever is in front of them. So also search with them
  // held back, and keep that plan unless spending them early is clearly better.
  const held = hold.length ? tpSearch(T, start, hold) : null;
  const free = tpSearch(T, start, []);
  const base = held && (!free || held.val >= free.val - TP_HOLD) ? held : free;

  const atMemo = new Map();
  // The plan with this turn's ⚔ action as its first step. `pin`: `{ mi, move }` — the mon that acts and, when the
  // planner picked a damaging move for it, that move as an outcome record.
  const at = pin => {
    if (!pin || pin.mi == null || pin.mi < 0) return base;
    const k = `${pin.mi}|${pin.outcome?.name ?? ""}|${pin.free ? "f" : ""}`;
    if (!atMemo.has(k)) {
      const move = pin.outcome?.expected > 0 ? tpMoveOf(pin.outcome) : null;
      atMemo.set(k, tpSearch(T, start, hold, { mi: pin.mi, move, free: !!pin.free }) ?? base);
    }
    return atMemo.get(k);
  };
  // What the pinned plan says happens after this turn (#170 §E and §G): the mon that comes in free when ours falls,
  // and the foe the trainer then sends, with the answer the plan puts in front of it.
  const after = pin => {
    const plan = at(pin);
    const [now, next] = plan?.steps ?? [];
    if (!now || !next) return null;
    return {
      // Only for a mon that is already out: a switch-in falling at the end of its own exchange is several turns off,
      // and the caller checks that this turn is the one it falls on.
      freeEntry: now.entry === "stay" && now.hp < 1 && next.entry === "free" ? { out: ref(party[now.mi]), in: ref(party[next.mi]) } : null,
      // Worth saying only when the plan wants a different mon in front of the foe the trainer is about to send: when
      // it is the same mon that is fighting now, the foe rows already show the order.
      nextIn: now.foeHp < 1 && next.fi !== now.fi && next.mi !== now.mi ? { foe: ref(foes[next.fi]), answer: ref(party[next.mi]) } : null,
    };
  };

  const viewMemo = new Map();
  const view = pin => {
    const k = pin && pin.mi != null && pin.mi >= 0 ? `${pin.mi}|${pin.outcome?.name ?? ""}|${pin.free ? "f" : ""}` : "";
    if (!viewMemo.has(k)) viewMemo.set(k, tpView({ T, party, foes, double, start, win, kills, alive, answers, only, onlyBy, reserve, base, ref, pctOf }, at(pin), !!k));
    return viewMemo.get(k);
  };
  // The foe the plan is keeping `mi` back for, if any — what the ⚔ line spends when it sends that mon in now. Only
  // for a foe still to come: a mon standing in front of the very foe it is the answer to is not being saved.
  const holdFor = mi => {
    const waiting = hold.filter(x => x.mi === mi && x.fi !== start.fcur && !foes[x.fi].isOnField?.());
    return waiting.length ? { name: waiting.map(x => foes[x.fi].name).join(", ") } : null;
  };
  return { value: base?.val ?? 0, at, after, view, holdFor, reserve, matrix, win };
};

const teamPlanner = (s, b, party, foes) => {
  if (!b?.trainer || !party.length || !foes.length) return null;
  const live = awaitingCommand(s);
  const key = [b.waveIndex, b.turn, b.enemySwitchCounter, !!b.double, ...party.map(p => `${p.id}:${p.hp}`), ...foes.map(f => `${f.id}:${f.hp}`)].join("|");
  // A plan built from the game's own numbers stays until the turn changes; outside the command phase only the
  // approximation is available, so don't let it replace one.
  if (teamPlanCache.key === key && (teamPlanCache.live || !live)) return teamPlanCache.value;
  // Both game reads go through the one sandbox: the tables, and the enemy switch `tpFacing` asks about (§0).
  const read = () => ({ T: tpTables(s, party, foes, live, !!b.double), facing: tpFacing(s, b, foes) });
  const { T, facing } = live ? sandbox(s, read) : read();
  // The searches read only those tables, so they need no sandbox of their own.
  const value = tpModel(T, b, party, foes, facing);
  teamPlanCache = { key, live, value };
  return value;
};

// The plan with nothing pinned — the shape 95-render-team and the summary read.
const teamPlan = (s, b, party, foes) => teamPlanner(s, b, party, foes)?.view(null) ?? null;

// One plan rendered. `plan` is the search result being shown (pinned to the ⚔ line when `pinned`); everything the
// fight is judged by comes from the model around it.
const tpView = (M, plan, pinned) => {
  const { T, party, foes, double, start, win, kills, alive, answers, only, onlyBy, reserve, base, ref, pctOf } = M;
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
    // How sure the step's ending is, when it's closer to a coin flip than a given.
    const odds = x.odds != null && x.odds < 0.8 ? ` (${Math.round(x.odds * 100)}%)` : "";
    if (x.foeHp < 1) why.push(x.hp >= 1 ? `KO${odds} · ${pctOf(x.hp, T.ourMax[x.mi])}% left` : `trade${odds}`);
    else if (x.hp < 1) why.push(sacrifice ? `sacrifice → ${party[nextStep.mi].name} in free` : `falls${odds} · foe at ${pctOf(x.foeHp, T.foeMax[x.fi])}%`);
    else why.push(`stalls${odds}`);
    // A KO it scores on us while it stays standing powers it up for the steps after.
    const fed = x.hp < 1 && x.foeHp >= 1 && nextStep ? T.foeKo?.[x.fi] : null;
    if (fed) why.push(`feeds ${fed.ability} ${koBoostText(fed)}`);
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
      warnings.push(`${lost}${faster ? `nobody outspeeds ${w}` : `nobody survives ${w}`} and it KOs ${kills[win]} of ${alive} — maximise damage before it comes in, keep ${names(answers.map(a => a.mi))} healthy`);
    } else if (!answers.some(a => a.beats)) {
      warnings.push(`${lost}nobody KOs ${w} 1-on-1${faster ? " or outspeeds it" : ""} — maximise damage before it comes in, chip it with ${names(acting.map(a => a.mi))}`);
    } else if (lost) warnings.push(`${lost}the plan runs out with ${left} foe${left > 1 ? "s" : ""} standing — maximise damage into ${w}`);
    const spent = answers.map(a => a.mi).filter(mi => plan.steps.some((x, i) => x.mi === mi && x.hp < 1 && (winStep < 0 || i < winStep)));
    if (spent.length) warnings.push(`${names(spent)} goes down before ${w} comes in`);
  } else if (lost) warnings.push(`${lost}the plan runs out with ${left} foe${left > 1 ? "s" : ""} standing — maximise damage`);

  // The free plan's own first move, priced, when it is clearly better than the turn the ⚔ line chose (#113). Never a
  // competing step list: one line, so the user still has one decision to follow.
  const prefers = (() => {
    if (!pinned || !base || base === plan) return null;
    const gain = base.val - plan.val;
    if (!(gain >= TP_PREFER || (plan.result !== "win" && base.result === "win"))) return null;
    const [a, nxt] = base.steps;
    if (!a) return null;
    const what = a.hp < 1 && nxt?.entry === "free" ? `let ${party[a.mi].name} fall → ${party[nxt.mi].name} in free`
      : a.entry === "switch" ? `${party[a.mi].name} in`
      : `${party[a.mi].name} ${T.ours[a.mi][a.fi]?.name ?? "—"} → ${foes[a.fi].name}`;
    return { text: what, gain: Math.round(gain), flips: plan.result !== "win" && base.result === "win" };
  })();

  // Nothing to plan around (an easy trainer): one line instead of the step list.
  const compact = plan.result === "win" && !warnings.length && !sacrifice.length && !answers.length && !only.length && !prefers;
  return {
    result: plan.result,
    win: win >= 0 ? { ...ref(foes[win]), kills: kills[win], of: alive, boss: !!foes[win].isBoss?.() } : null,
    steps,
    reserve: answers.map(a => ({
      ...ref(party[a.mi]), for: ref(foes[win]), per: Math.min(100, Math.round(a.per * 100)), acts: a.acts,
    })),
    // Foes only one of ours beats, and who that is (#170 §A). The ⚔ line prices exposing them.
    only: onlyBy.map(o => ({ ...ref(party[o.mi]), for: o.fis.map(fi => ref(foes[fi])), per: Math.min(100, Math.round(o.per * 100)), acts: o.acts })),
    prefers,
    pinned: !!pinned,
    sacrifice,
    warnings,
    compact,
    summary: compact ? `winnable · ${[...new Set(steps.map(x => x.send.name))].join(" › ")}` : null,
    // Doubles are simulated as one-on-one exchanges, so the steps are only a rough order.
    approxDoubles: double,
  };
};
