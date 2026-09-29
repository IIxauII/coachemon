// A trainer fight played out exchange by exchange, with HP carried between them: what the one-turn planner can't see.
// The enemy's choices are not branched, it never switches mid-exchange, and a double is planned one of ours against
// one foe at a time.
import { TYPES, effectiveness, iconOf, squeezeDist, typesOf } from "./01-core.js";
import { hitOn, koCurve, koTurns, useOf } from "./10-damage.js";
import { actionOrder, afterSteals, attemptsLost, hitsOn, koBoost, koBoostText, koStageFactor, stealCounts, stealRates, threatFrom, tokenOdds, tokenShift } from "./30-planner.js";

// @only tests: tpHealProfile, tpSendScore, tpFight, tpTables
const TP_BEAM = 24;
const TP_TURNS = 15;
const TP_BRANCHES = 4;

const tpSpread = use => {
  const mean = (use ?? []).reduce((t, x) => t + x.d * x.p, 0);
  return mean > 0 ? squeezeDist(use.map(x => ({ d: x.d / mean, p: x.p, n: x.n ?? 1 })), 4).map(x => ({ r: x.d, p: x.p, n: x.n })) : null;
};
const tpTurns = (turn, o, target) => koTurns(koCurve(turn.mon(target), useOf(o)).by);
const tpFastest = (turn, list, target, turns = o => tpTurns(turn, o, target), dmg = o => o.dmg) => list
  .map(o => ({ o, n: turns(o) }))
  .reduce((b, x) => (!b || x.n < b.n || (x.n === b.n && dmg(x.o) > dmg(b.o)) ? x : b), null)?.o ?? null;

// `dmg` is a use's mean, uncut by the target's HP or bars.
const tpMoveOf = (o, extra) => {
  const use = useOf(o);
  return { name: o.name, type: o.type, cat: o.cat, e: o.e, priority: o.priority ?? 0, dmg: use.reduce((t, x) => t + x.d * x.p, 0), use: tpSpread(use), drain: o.drain ?? 0,
    self: o.self ?? 0,
    charge: !!o.traits?.charge, recharge: !!o.traits?.recharge || !!o.traits?.noRepeat, semiCharge: !!o.traits?.charge && !!o.traits?.semiCharge, ...extra };
};

const tpOurMove = (turn, me, f) => {
  const outs = turn.outcomes(me, f);
  if (turn.live) {
    // Two turns a hit for a charge or recharge move, less the recharge after the last hit, which is never spent.
    const turns = o => (o.expected > 0 ? (o.traits?.charge || o.traits?.recharge ? 2 : 1) * tpTurns(turn, o, f) - (o.traits?.recharge ? 1 : 0) : 99);
    const best = tpFastest(turn, outs, f, turns, o => o.expected);
    if (best?.expected > 0) {
      return tpMoveOf(best, { charge: !!best.traits?.charge, recharge: !!best.traits?.recharge || !!best.traits?.noRepeat, semiCharge: !!best.traits?.charge && !!best.traits?.semiCharge });
    }
  }
  const m = tpFastest(turn, outs.filter(x => x.dmg > 0), f);
  return m ? tpMoveOf(m) : null;
};

// The AI's distribution this turn was scored against the mon on the field, so any other pairing asks for the foe's
// re-picked moves (`next`). `entry` is the hit a switch-in takes coming in, off this turn's pick.
const tpTheirMove = (turn, f, me) => {
  if (turn.live) {
    try {
      const next = !me.isOnField?.() || !f.isOnField?.();
      const t = threatFrom(turn, f, me, null, { next });
      if (Number.isFinite(t?.expected)) {
        const now = next && f.isOnField?.() ? threatFrom(turn, f, me) : t;
        const mean = (t.use ?? []).reduce((sum, x) => sum + x.d * x.p, 0);
        const moved = t.moves.reduce((sum, m) => sum + m.p, 0);
        return {
          dmg: mean > 0 ? mean : t.expected, entry: Number.isFinite(now?.expected) ? now.expected : t.expected, use: tpSpread(t.use),
          name: typeof t.move === "string" ? t.move : t.move?.name ?? null, e: t.move?.e ?? 1, first: t.first, priority: t.move?.priority ?? 0, hits: hitsOn(t),
          drain: t.expected > 0 ? (t.drain ?? 0) / t.expected : 0,
          phys: moved > 0 ? t.moves.reduce((sum, m) => sum + m.p * (m.cat === "special" ? 0 : 1), 0) / moved : 1,
        };
      }
    } catch {}
  }
  const m = tpFastest(turn, turn.outcomes(f, me).filter(x => x.dmg > 0), me);
  return { dmg: m?.dmg ?? 0, name: m?.name ?? null, e: m?.e ?? 1, first: null, priority: m?.priority ?? 0, hits: m?.dmg > 0 ? 1 : 0,
    drain: m?.drain ?? 0, phys: m?.cat === "special" ? 0 : 1 };
};

const tpFoeFirst = (turn, me, f, ours, theirs) => {
  if (Number.isFinite(theirs.first)) return theirs.first;
  if (turn.live && ours && theirs.name) {
    try {
      const a = me.moveset.find(pm => pm?.getName?.() === ours.name), b = f.moveset.find(pm => pm?.getName?.() === theirs.name);
      const p = a && b ? actionOrder(turn, me, a, f, b) : null;
      if (Number.isFinite(p)) return 1 - p;
    } catch {}
  }
  const mine = ours?.priority ?? 0;
  if (theirs.priority !== mine) return theirs.priority > mine ? 1 : 0;
  const a = turn.mon(me).speed, b = turn.mon(f).speed;
  return b > a ? 1 : b < a ? 0 : 0.5;
};

// `getMatchupScore` in two halves (game-code.md §7): our HP moves over the plan, so the game is asked with ours at 0
// and `tpSendScore` puts the HP and Speed factor back. That factor is not always 1 at 0: a slower foe at 21–40 % HP
// comes back halved already, and `tpSendScore` halves it again.
const tpSendBase = (turn, f, me) => {
  const outspeed = (f.isActive?.(true) ? turn.mon(f).speed : f.getStat(Stat.SPD, false)) >= turn.mon(me).speed;
  const v = turn.sendInScore(f, me);
  if (v != null) return { base: v, outspeed };
  // game-less-backed
  const moves = (f.moveset ?? []).map(pm => pm?.getMove?.()).filter(mv => mv && mv.category !== MoveCategory.STATUS);
  const atk = moves.length ? moves.reduce((t, mv) => t + effectiveness(TYPES[mv.type], me) * (typesOf(f).includes(TYPES[mv.type]) ? 1.5 : 1), 0) / moves.length : 1;
  const def = typesOf(me).reduce((x, t) => x / Math.max(effectiveness(t, f), 0.25), 1);
  return { base: atk + def, outspeed };
};
export const tpSendScore = (T, st, fi, mi) => {
  const x = T.send[fi][mi];
  if (typeof x === "number") return x;
  const ratio = (hp, max) => Math.round(hp / max * 100) / 100;
  const fr = ratio(st.fh[fi], T.foeMax[fi]);
  let diff = fr + 1 - ratio(st.oh[mi], T.ourMax[mi]);
  if (x.outspeed) diff *= 1.25;
  else if (fr > 0.2 && fr <= 0.4) diff *= 0.5;
  return x.base * Math.min(diff, 1);
};

// Read at 75 % HP, clear of Sitrus's half: moving it below that folds the berry into every turn's `base`.
const tpHealAt = (turn, p, hp = Math.ceil(p.getMaxHp() * 0.75), se = false) => {
  try { return turn.turnEndHp(Object.create(p, { hp: { value: hp } }), { hp, tookSuperEffective: se }) || 0; } catch { return 0; }
};
// `base` recurs every turn, negative when chip outweighs the heals; `sitrus` and `enigma` are one-shot.
export const tpHealProfile = (turn, p) => {
  const max = p.getMaxHp();
  const at = (hp, se) => tpHealAt(turn, p, hp, se);
  const base = at(Math.ceil(max * 0.75), false);
  return { base, sitrus: Math.max(0, at(Math.floor(max * 0.4), false) - base), enigma: Math.max(0, at(Math.ceil(max * 0.75), true) - base) };
};

export const tpTables = (turn, party, foes, double = false) => {
  const ours = party.map(me => foes.map(f => tpOurMove(turn, me, f)));
  const theirs = foes.map(f => party.map(me => tpTheirMove(turn, f, me)));
  return {
    ours, theirs,
    // In a double both field mons are out, so neither pays an entry hit to act (#113).
    slots: double && party.length >= 2 ? 2 : 1,
    first: party.map((me, mi) => foes.map((f, fi) => tpFoeFirst(turn, me, f, ours[mi][fi], theirs[fi][mi]))),
    send: foes.map(f => party.map(me => tpSendBase(turn, f, me))),
    memo: new Map(),
    // Every hit overrides its `hp` and `bar` with the ones the fight carries.
    foeState: foes.map(f => turn.mon(f).state),
    ourMax: party.map(p => p.getMaxHp()), foeMax: foes.map(f => f.getMaxHp()),
    ourHeal: party.map(p => tpHealProfile(turn, p)), foeHeal: foes.map(p => tpHealProfile(turn, p)),
    foeStart: foes.map(f => f.hp),
    // `koMult`: the factor both sides' on-KO boosts put on a hit, after `atkN` and `defN` KOs, at physical share `phys`.
    ourKo: party.map(koBoost), foeKo: foes.map(koBoost),
    koMult: (atkMon, atkBoost, atkN, defMon, defBoost, defN, phys) => {
      const f = (p, b, n, st) => koStageFactor(p, b, n, st);
      const up = phys * f(atkMon, atkBoost, atkN, Stat.ATK) + (1 - phys) * f(atkMon, atkBoost, atkN, Stat.SPATK);
      const guard = phys * f(defMon, defBoost, defN, Stat.DEF) + (1 - phys) * f(defMon, defBoost, defN, Stat.SPDEF);
      return up / guard;
    },
    party, foes,
    ...tpWear(turn, party, foes, ours),
  };
};

// Wave status tokens and item thieves (30-planner.js). `fromUs[fi][mi]` is what foe `fi` steals from our `mi`, and
// `fromFoe[mi][fi]` the reverse; `ourItems` / `foeItems` are each mon's turn-end HP change after k steals.
const tpWear = (turn, party, foes, ours) => {
  const heal = p => tpHealAt(turn, p);
  const tok = party.map(me => {
    const odds = foes[0] ? tokenOdds(turn, foes[0], me) : null;
    return odds && { odds, shift: tokenShift(odds, me, heal), para: odds.tokens.filter(x => x.effect === StatusEffect.PARALYSIS).reduce((t, x) => t + x.share, 0) };
  });
  const firstPara = party.map((me, mi) => (tok[mi]?.para ? foes.map((f, fi) => {
    const slowed = { id: { value: `${me.id}~paralysed` }, status: { value: { effect: StatusEffect.PARALYSIS } } };
    if (typeof me.getEffectiveStat !== "function") slowed.getStat = { value: i => me.getStat(i) / (i === Stat.SPD ? 2 : 1) };
    const clone = Object.create(me, slowed);
    return tpFoeFirst(turn, clone, f, ours[mi][fi], tpTheirMove(turn, f, clone));
  }) : null));
  const fromUs = foes.map(f => party.map(me => stealRates(f, me)));
  const fromFoe = party.map(me => foes.map(f => stealRates(me, f)));
  return {
    tok, firstPara, fromUs, fromFoe,
    ourItems: party.map((me, mi) => (foes.some((_, fi) => fromUs[fi][mi]) ? afterSteals(me, heal) : null)),
    foeItems: foes.map((f, fi) => (party.some((_, mi) => fromFoe[mi][fi]) ? afterSteals(f, heal) : null)),
  };
};
// The turn-end HP change `fixed` sure steals and Grip Claw's `mean` make, against none; `byCount[k]` is after k.
const tpStolen = (byCount, fixed, mean) => (byCount ? stealCounts(fixed, mean).reduce((t, p, k) => t + p * (byCount[k] - byCount[0]), 0) : 0);

const tpHeal = (hp, max, prof, used, se, extra = 0) => {
  if (!prof || hp < 1) return [hp, used];
  let add = prof.base + extra;
  if (hp < max / 2 && !(used & 1) && prof.sitrus) { add += prof.sitrus; used |= 1; }
  if (se && !(used & 2) && prof.enigma) { add += prof.enigma; used |= 2; }
  return [Math.min(max, hp + add), used];
};

// Carried in `st` besides HP: `ox` the landed enemy hits each of ours has taken (wave status tokens), `od` / `og` the
// Mini Black Hole and Grip Claw steals from it, `fd` / `fg` the same from each foe, and `ok` / `fk` the KOs each side
// has scored for its on-KO boosts. Returns the likelier ending's state with `pWin`, `pLoss`, `pStall` and all three
// `ends`. `over` pins our move for this exchange only (#113), and is never memoised: the key names the pair, not the move.
export const tpFight = (T, st, mi, fi, entry, over = null) => {
  const faints = st.oh.filter(hp => hp < 1).length + st.fh.filter(hp => hp < 1).length;
  const nUs = T.ourKo?.[mi] ? (T.ourKo[mi].any ? faints : st.ok?.[mi] ?? 0) : 0;
  const nFoe = T.foeKo?.[fi] ? (T.foeKo[fi].any ? faints : st.fk?.[fi] ?? 0) : 0;
  const key = !over && T.memo && [mi, fi, entry, Math.round(st.oh[mi]), st.ob[mi], Math.round(st.fh[fi]), st.fs[fi], st.fb[fi], nUs, nFoe,
    ...[st.ox?.[mi], st.od?.[mi], st.og?.[mi], st.fd?.[fi], st.fg?.[fi]].map(x => Math.round((x ?? 0) * 20))].join();
  if (key && T.memo.has(key)) return T.memo.get(key);
  const us = over ?? T.ours[mi][fi], them = T.theirs[fi][mi], foeState = T.foeState?.[fi] ?? { bar: 0 };
  // Speed boosts from them are not modelled.
  const usMul = us && (nUs || nFoe) && T.koMult ? T.koMult(T.party[mi], T.ourKo[mi], nUs, T.foes[fi], T.foeKo[fi], nFoe, us.cat === "special" ? 0 : 1) : 1;
  const themMul = (nUs || nFoe) && T.koMult ? T.koMult(T.foes[fi], T.foeKo[fi], nFoe, T.party[mi], T.ourKo[mi], nUs, them.phys ?? 1) : 1;
  const tok = T.tok?.[mi], robUs = T.fromUs?.[fi]?.[mi], robFoe = T.fromFoe?.[mi]?.[fi];
  const ourUse = us?.use ?? [{ r: 1, p: 1 }], theirUse = them.use ?? [{ r: 1, p: 1 }];
  // A hand-built table or state carries no wear, so every wear field is optional.
  const ox0 = st.ox?.[mi] ?? 0;
  let turns = 0;
  // P(token status by the end of turn `t`); `t` 0 is before this exchange.
  const by = t => (!tok ? 0 : tok.odds.by(ox0 + (entry === "switch" ? them.hits ?? 0 : 0) + (them.hits ?? 0) * Math.max(0, t)));
  // Drain wins back its share of the HP the hits actually took, after the bars and the foe's HP have cut them.
  const hitFoe = (b, o) => {
    const n = Math.max(1, Math.round(o.n ?? 1));
    let st = { ...foeState, hp: b.fh, bar: b.fs };
    for (let k = 0; k < n && st.hp >= 1; k++) {
      st = hitOn(st, us.dmg * o.r * usMul / n);
      b.fg += robFoe?.perHit ?? 0;
    }
    if (us.drain && b.mh >= 1) b.mh = Math.min(T.ourMax[mi], b.mh + (b.fh - st.hp) * us.drain);
    if (us.self) b.mh -= us.self;
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
    const para = tok?.para ? by(turns - 1) * tok.para : 0;
    const pFoe = Math.max(0, Math.min(1, para * (T.firstPara?.[mi]?.[fi] ?? T.first[mi][fi]) + (1 - para) * T.first[mi][fi]));
    const act = tok ? 1 - attemptsLost(tok.odds, by, turns, pFoe) : 1;
    // Dig and Fly are semi-invulnerable on the charge turn, so a foe moving after us misses (game-code.md §5).
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
const tpFoeLeft = r => r.pLoss * (r.ends.loss?.fh ?? 0) + r.pStall * (r.ends.stall?.fh ?? 0);

const tpClone = st => ({ ...st, oh: st.oh.slice(), ob: st.ob.slice(), fh: st.fh.slice(), fs: st.fs.slice(), fb: st.fb.slice(),
  ox: st.ox.slice(), od: st.od.slice(), og: st.og.slice(), fd: st.fd.slice(), fg: st.fg.slice(),
  ok: st.ok?.slice() ?? st.oh.map(() => 0), fk: st.fk?.slice() ?? st.fh.map(() => 0) });
const tpApply = (c, mi, fi, r) => {
  if (c.ok && c.fh[fi] >= 1 && r.fh < 1) c.ok[mi]++;
  if (c.fk && c.oh[mi] >= 1 && r.mh < 1) c.fk[fi]++;
  c.oh[mi] = r.mh; c.ob[mi] = r.mb; c.fh[fi] = r.fh; c.fs[fi] = r.fs; c.fb[fi] = r.fb;
  c.ox[mi] = r.ox; c.od[mi] = r.od; c.og[mi] = r.og; c.fd[fi] = r.fd; c.fg[fi] = r.fg;
};
const tpAlive = hps => hps.flatMap((hp, i) => (hp >= 1 ? [i] : []));

// The trainer scores its send-in against our mon on the field (game-code.md §7): in a double, the one that just acted.
const tpNextFoe = (T, st) => {
  const alive = tpAlive(st.fh);
  const me = st.act ?? st.cur?.[0];
  if (me == null) return alive[0];
  return alive.reduce((b, fi) => (tpSendScore(T, st, fi, me) > tpSendScore(T, st, b, me) ? fi : b), alive[0]);
};

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

// `reserve`: `[{ mi, fi }]`, our `mi` kept off every foe but `fi` while anyone else can still fight. `pin`:
// `{ mi, move, free }`, the ⚔ line's action, fixing the first exchange only (#113).
const tpSearch = (T, start, reserve, pin = null) => {
  let beam = [start];
  const done = [];
  const slots = T.slots ?? 1;
  for (let depth = 0; beam.length && depth <= start.oh.length + start.fh.length + 1; depth++) {
    const next = new Map();
    for (const st of beam) {
      const fi = st.fcur ?? tpNextFoe(T, st);
      // Only a bench mon coming into a full field pays an entry hit, and not at the game's "will you switch?"
      // (`pin.free`, game-code.md §9).
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
          const rest = st.cur.includes(mi) ? st.cur.filter(i => i !== mi) : st.cur.length < slots ? st.cur : st.cur.slice(1);
          c.cur = (end.mh >= 1 ? [...rest, mi] : rest).sort((a, b) => a - b);
          c.act = end.mh >= 1 ? mi : rest[0] ?? null;
          c.fcur = end.fh >= 1 ? fi : null;
          c.result = c.fh.every(hp => hp < 1) ? "win" : c.oh.every(hp => hp < 1) ? "loss" : end.mh >= 1 && end.fh >= 1 ? "stall" : null;
          return c;
        };
        // Only the likelier ending goes on, but the value weighs every ending by its chance.
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


// The predicted switch-in when a foe is leaving, as the ⚔ line has it: ♟ aimed at the mon walking away, and ⚔ was
// right every time (#113).
const tpFacing = (turn, foes) => {
  const here = turn.activeFoes()[0] ?? null;
  if (!here || !turn.live || turn.facts.decision === "check-switch") return here;
  const to = turn.enemyAction(here).switchTo;
  return to && foes.includes(to) ? to : here;
};

const TP_PREFER = 20;
const TP_HOLD = 10;

// ⚔ owns the turn and this model the rest of the fight (#113). `pin` is `{ mi, outcome?, free? }`: `at(pin)`
// re-searches with it as step 1, `after(pin)` reads what that plan says comes next, and `view(pin)` renders it.
const tpModel = (T, double, party, foes, facing) => {
  const ref = p => ({ icon: iconOf(p), name: p.name });
  const pctOf = (hp, max) => Math.round(hp / max * 100);
  const fcur = foes.indexOf(facing);
  const start = {
    oh: party.map(p => p.hp), ob: party.map(() => 0),
    fh: foes.map(f => f.hp), fs: T.foeState.map(x => x.bar), fb: foes.map(() => 0),
    ox: party.map(() => 0), od: party.map(() => 0), og: party.map(() => 0), fd: foes.map(() => 0), fg: foes.map(() => 0),
    ok: party.map(() => 0), fk: foes.map(() => 0),
    cur: party.flatMap((p, i) => (p.isOnField?.() ? [i] : [])), fcur: fcur >= 0 ? fcur : null, steps: [],
  };
  start.act = start.cur[0] ?? null;

  // The win condition is the foe that KOs the most of our team when we throw everyone at it, best answer first.
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

  const matrix = foes.map((f, fi) => tpAlive(start.oh)
    .map(mi => {
      const r = tpFight(T, start, mi, fi, "free");
      return { mi, per: (T.ours[mi][fi]?.dmg ?? 0) / f.hp, beats: r.fh < 1 && r.mh >= 1, acts: r.fh < f.hp };
    })
    .filter(a => a.beats || a.per >= 0.2)
    .sort((a, b) => b.per - a.per));

  const answers = win < 0 ? [] : matrix[win].filter(a => a.per >= 0.2).slice(0, 2);
  // A foe only one of ours beats holds that mon back too: `sweep` needs two KOs to name a win condition, so it never
  // covers one (#170).
  const only = foes.flatMap((f, fi) => {
    if (fi === win || alive < 3 || f.isOnField?.()) return [];
    const beat = matrix[fi].filter(a => a.beats);
    return beat.length === 1 ? [{ mi: beat[0].mi, fi, per: beat[0].per, acts: beat[0].acts }] : [];
  });
  const hold = [...answers.map(a => ({ mi: a.mi, fi: win })), ...only.map(o => ({ mi: o.mi, fi: o.fi }))];
  const reserve = [...new Set(hold.map(h => h.mi))];
  const onlyBy = [...new Set(only.map(o => o.mi))].map(mi => {
    const mine = only.filter(o => o.mi === mi);
    return { mi, fis: mine.map(o => o.fi), per: Math.max(...mine.map(o => o.per)), acts: mine.some(o => o.acts) };
  });

  // The beam is myopic and spends the answers on whatever is in front of them, so the held plan stands unless
  // spending them early is `TP_HOLD` better.
  const held = hold.length ? tpSearch(T, start, hold) : null;
  const free = tpSearch(T, start, []);
  const base = held && (!free || held.val >= free.val - TP_HOLD) ? held : free;

  const atMemo = new Map();
  const at = pin => {
    if (!pin || pin.mi == null || pin.mi < 0) return base;
    const k = `${pin.mi}|${pin.outcome?.name ?? ""}|${pin.free ? "f" : ""}`;
    if (!atMemo.has(k)) {
      const move = pin.outcome?.expected > 0 ? tpMoveOf(pin.outcome) : null;
      atMemo.set(k, tpSearch(T, start, hold, { mi: pin.mi, move, free: !!pin.free }) ?? base);
    }
    return atMemo.get(k);
  };
  const after = pin => {
    const plan = at(pin);
    const [now, next] = plan?.steps ?? [];
    if (!now || !next) return null;
    return {
      // Only a mon already out; the caller checks that this turn is the one it falls on.
      freeEntry: now.entry === "stay" && now.hp < 1 && next.entry === "free" ? { out: ref(party[now.mi]), in: ref(party[next.mi]) } : null,
      // A foe already on the field is a double's other slot, not a send-in.
      nextIn: now.foeHp < 1 && next.fi !== now.fi && next.mi !== now.mi && !foes[next.fi].isOnField?.()
        ? { foe: ref(foes[next.fi]), answer: ref(party[next.mi]) } : null,
    };
  };

  const viewMemo = new Map();
  const view = pin => {
    const k = pin && pin.mi != null && pin.mi >= 0 ? `${pin.mi}|${pin.outcome?.name ?? ""}|${pin.free ? "f" : ""}` : "";
    if (!viewMemo.has(k)) viewMemo.set(k, tpView({ T, party, foes, double, start, win, kills, alive, answers, only, onlyBy, reserve, base, ref, pctOf }, at(pin), !!k));
    return viewMemo.get(k);
  };
  const holdFor = mi => {
    const waiting = hold.filter(x => x.mi === mi && x.fi !== start.fcur && !foes[x.fi].isOnField?.());
    return waiting.length ? { name: waiting.map(x => foes[x.fi].name).join(", ") } : null;
  };
  return { value: base?.val ?? 0, at, after, view, holdFor, reserve, matrix, win };
};

export const teamPlanner = turn => {
  const { trainer, double } = turn.facts;
  const party = turn.facts.party.filter(p => p && p.hp > 0);
  const foes = turn.facts.foes.filter(f => f && f.hp > 0);
  if (!trainer || !party.length || !foes.length) return null;
  // Every game read happens in `tpTables`: the searches read only the tables.
  return tpModel(tpTables(turn, party, foes, double), double, party, foes, tpFacing(turn, foes));
};

export const teamPlan = turn => teamPlanner(turn)?.view(null) ?? null;

const tpView = (M, plan, pinned) => {
  const { T, party, foes, double, start, win, kills, alive, answers, only, onlyBy, reserve, base, ref, pctOf } = M;
  if (!plan) return null;
  const beats = party.map((_, mi) => foes.filter((_, fi) => tpFight(T, start, mi, fi, "free").fh < 1).length);
  const lowValue = mi => !reserve.includes(mi) && (start.oh[mi] / T.ourMax[mi] < 0.35 || beats[mi] === 0);

  const winStep = plan.steps.findIndex(x => x.fi === win);
  const steps = plan.steps.map((x, i) => {
    const us = T.ours[x.mi][x.fi], nextStep = plan.steps[i + 1];
    const why = x.entry === "switch" ? ["switch in, takes a hit"] : [];
    const sacrifice = x.hp < 1 && x.foeHp >= 1 && nextStep?.entry === "free" && lowValue(x.mi)
      && (x.foeFrom - x.foeHp) / x.foeFrom < 0.5;
    const odds = x.odds != null && x.odds < 0.8 ? ` (${Math.round(x.odds * 100)}%)` : "";
    if (x.foeHp < 1) why.push(x.hp >= 1 ? `KO${odds} · ${pctOf(x.hp, T.ourMax[x.mi])}% left` : `trade${odds}`);
    else if (x.hp < 1) why.push(sacrifice ? `sacrifice → ${party[nextStep.mi].name} in free` : `falls${odds} · foe at ${pctOf(x.foeHp, T.foeMax[x.fi])}%`);
    else why.push(`stalls${odds}`);
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

  // One line, never a competing step list: the user still has one decision to follow (#113).
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

  const compact = plan.result === "win" && !warnings.length && !sacrifice.length && !answers.length && !only.length && !prefers;
  return {
    result: plan.result,
    win: win >= 0 ? { ...ref(foes[win]), kills: kills[win], of: alive, boss: !!foes[win].isBoss?.() } : null,
    steps,
    reserve: answers.map(a => ({
      ...ref(party[a.mi]), for: ref(foes[win]), per: Math.min(100, Math.round(a.per * 100)), acts: a.acts,
    })),
    only: onlyBy.map(o => ({ ...ref(party[o.mi]), for: o.fis.map(fi => ref(foes[fi])), per: Math.min(100, Math.round(o.per * 100)), acts: o.acts })),
    prefers,
    pinned: !!pinned,
    sacrifice,
    warnings,
    compact,
    summary: compact ? `winnable · ${[...new Set(steps.map(x => x.send.name))].join(" › ")}` : null,
    approxDoubles: double,
  };
};
