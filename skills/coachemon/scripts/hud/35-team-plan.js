// A trainer fight played out exchange by exchange, with HP carried between them: what the one-turn planner can't see.
// The enemy's choices are not branched, it never switches mid-exchange, and a double is planned one of ours against
// one foe at a time.
import { iconOf, squeezeDist } from "./01-core.js";
import { berryPouch, hitOn, koCurve, koTurns, useOf } from "./10-damage.js";
import { actionOrder, afterSteals, attemptsLost, berryTypesOf, berryWalk, entryOutcomes, hitsOn, koBoost, koBoostText, koStageFactor, laterUse, lessBerry, ourTeraTurn, overWalk, paralysed, sendInAt, sendInBase, stealCounts, stealRates, stealsBerry, stolenDraws, threatFrom, tokenOdds, tokenShift, unnervedBy } from "./30-planner.js";

// @only tests: tpHealProfile, tpSendScore, tpFight, tpTables, tpActs
const TP_BEAM = 24;
const TP_TURNS = 15;
const TP_BRANCHES = 4;
const TP_EARLY = 0.01;

const tpSpread = use => {
  const mean = (use ?? []).reduce((t, x) => t + x.d * x.p, 0);
  return mean > 0 ? squeezeDist(use.map(x => ({ d: x.d / mean, p: x.p, n: x.n ?? 1, se: x.se })), 4).map(x => ({ r: x.d, p: x.p, n: x.n, se: x.se })) : null;
};
// `feeds`: the target eats its Enigma Berry after a super-effective use, as our pick prices it and the foe's AI does
// not (#652).
const tpTurns = (turn, o, target, feeds = false) => koTurns(koCurve(turn.mon(target), useOf(o), { se: feeds ? ((o.e ?? 1) >= 2 ? 1 : 0) : null }).by);
const tpFastest = (turn, list, target, turns = o => tpTurns(turn, o, target), dmg = o => o.dmg) => list
  .map(o => ({ o, n: turns(o) }))
  .reduce((b, x) => (!b || x.n < b.n || (x.n === b.n && dmg(x.o) > dmg(b.o)) ? x : b), null)?.o ?? null;

// `dmg` is a use's mean, uncut by the target's HP or bars. `recharge` covers a move that can't repeat too: both lose
// the turn after each hit.
const tpMoveOf = (o, extra) => {
  const use = useOf(o);
  return { name: o.name, type: o.type, cat: o.cat, e: o.e, priority: o.priority ?? 0, dmg: use.reduce((t, x) => t + x.d * x.p, 0), use: tpSpread(use), drain: o.drain ?? 0,
    self: o.self ?? 0, acc: o.acc ?? 1, steals: !!o.traits?.attrNames?.has("StealEatBerryAttr"),
    charge: !!o.traits?.charge, recharge: !!o.traits?.recharge || !!o.traits?.noRepeat, semiCharge: !!o.traits?.charge && !!o.traits?.semiCharge, ...extra };
};

// `them` is what the foe is bringing back, so the order weighs beside the pace rather than the pace alone (#650).
const tpOurMove = (turn, me, f, them = null) => {
  const outs = turn.outcomes(me, f);
  // The hit of the foe's that landing first cancels, in turns of ours (CONTEXT.md, `Removal price`): a KO one use
  // slower that moves first takes the same number of hits getting there, so order is part of what a move costs.
  const spared = o => {
    if (!them) return 0;
    const p = tpOrder(turn, me, f, o, them);
    return Number.isFinite(p) ? 1 - p : 0;
  };
  const feeds = !unnervedBy(turn, f, me);
  if (turn.live) {
    // Two turns a hit for a charge or recharge move, less the recharge after the last hit, which is never spent.
    const turns = o => (o.expected > 0 ? (o.traits?.charge || o.traits?.recharge ? 2 : 1) * tpTurns(turn, o, f, feeds) - (o.traits?.recharge ? 1 : 0) - spared(o) : 99);
    const best = tpFastest(turn, outs, f, turns, o => o.expected);
    if (best?.expected > 0) {
      return tpMoveOf(best, { charge: !!best.traits?.charge, recharge: !!best.traits?.recharge || !!best.traits?.noRepeat, semiCharge: !!best.traits?.charge && !!best.traits?.semiCharge });
    }
  }
  const m = tpFastest(turn, outs.filter(x => x.dmg > 0), f, o => tpTurns(turn, o, f, feeds) - spared(o));
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
        // `dmg` and `use` are a turn after this one (`laterUse`); `entry` is this turn's.
        const per = laterUse(t) ?? t;
        const mean = (per.use ?? []).reduce((sum, x) => sum + x.d * x.p, 0);
        const moved = t.moves.reduce((sum, m) => sum + m.p, 0);
        return {
          dmg: mean > 0 ? mean : per.expected, entry: Number.isFinite(now?.expected) ? now.expected : t.expected, use: tpSpread(per.use),
          // `first` is the order against a move of ours at priority 0, which is all this table knows: `tpFoeFirst`
          // takes it again per move for anything out of that bracket (#650).
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

// P(the foe acts first), taken against the move of ours it is facing and not against the pairing: a priority move of
// ours lands before a foe that outspeeds it, and the fight plan is only right if it sees that (#650). `threatFrom`
// weighs the foe's own picks against our move; `theirs.first`, then raw priority and Speed, are what is left when the
// game cannot be asked.
const tpFoeFirst = (turn, me, f, ours, theirs) => {
  if (turn.live && ours?.name) {
    try {
      const a = me.moveset.find(pm => pm?.getName?.() === ours.name);
      if (a) {
        const t = threatFrom(turn, f, me, a, { next: !me.isOnField?.() || !f.isOnField?.() });
        if (Number.isFinite(t?.first)) return t.first;
        const b = theirs.name ? f.moveset.find(pm => pm?.getName?.() === theirs.name) : null;
        const p = b ? actionOrder(turn, me, a, f, b) : null;
        if (Number.isFinite(p)) return 1 - p;
      }
    } catch {}
  }
  if (Number.isFinite(theirs.first)) return theirs.first;
  const mine = ours?.priority ?? 0;
  if (theirs.priority !== mine) return theirs.priority > mine ? 1 : 0;
  const a = turn.mon(me).speed, b = turn.mon(f).speed;
  return b > a ? 1 : b < a ? 0 : 0.5;
};

// A priority-0 move's order is the pairing's own, so the table and the pick read one answer.
const tpOrder = (turn, me, f, o, them) => ((o?.priority ?? 0) === 0 && Number.isFinite(them.first) ? them.first : tpFoeFirst(turn, me, f, o, them));

// `firstBy[mi][fi][move]`: the order a move of ours out of the pairing's own pick's priority bracket gets, for a plan
// step pinned to that move (#650).
const tpFirstBy = (turn, me, f, own, them) => {
  const by = {};
  for (const o of turn.outcomes(me, f)) {
    if (!o?.name || o.name === own?.name || (o.priority ?? 0) === (own?.priority ?? 0)) continue;
    const p = tpFoeFirst(turn, me, f, o, them);
    if (Number.isFinite(p)) by[o.name] = p;
  }
  return by;
};

export const tpSendScore = (T, st, fi, mi) => {
  const x = T.send[fi][mi];
  return typeof x === "number" ? x : sendInAt(x, st.fh[fi], T.foeMax[fi], st.oh[mi], T.ourMax[mi]);
};

// Read at 75 % HP, clear of Sitrus's half: moving it below that folds the berry into every turn's `base`.
const tpHealAt = (turn, p, hp = Math.ceil(p.getMaxHp() * 0.75), beforeBerries = false) => {
  try { return turn.turnEndHp(Object.create(p, { hp: { value: hp } }), { hp, beforeBerries }) || 0; } catch { return 0; }
};
// `base` recurs every turn, negative when chip outweighs the heals, and `pre` is its part ahead of the berries; `sitrus`
// heals once, and `enigma` once for each of the `enigmas` it holds. A Berry Pouch leaves each berry held at its `keep`,
// present only under a Pouch and on a mon with one of the two to keep.
export const tpHealProfile = (turn, p) => {
  const max = p.getMaxHp();
  const at = hp => tpHealAt(turn, p, hp);
  const base = at(Math.ceil(max * 0.75));
  const enigma = turn.mon(p).facts.enigma;
  const sitrus = Math.max(0, at(Math.floor(max * 0.4)) - base);
  const keep = sitrus > 0 || enigma ? berryPouch(turn.facts, p) : 0;
  return { base, pre: tpHealAt(turn, p, Math.ceil(max * 0.75), true), sitrus,
    enigma: enigma?.heal ?? 0, enigmas: enigma?.left ?? 0, ...(keep ? { keep } : {}) };
};
const tpCanSteal = (turn, me, f) => turn.outcomes(me, f).some(o => stealsBerry(o, f, me));
// `by[k]`: `f`'s profile after k berries stolen, k from 0 (`kept`) up to all it holds or 9 (#646, #833); `walk`: its
// `berryWalk`.
const tpHealBy = (turn, f, kept, walk) => {
  const supply = Math.min(9, stolenDraws(f, { walk })?.supply ?? 0);
  const profiles = new Map();
  const prof = p => {
    if (!profiles.has(p)) profiles.set(p, tpHealProfile(turn, p));
    return profiles.get(p);
  };
  // A Pouch is the side's, so `keep` stays as it was: a walked mon with no Sitrus or Enigma left carries no `keep`, and
  // mixing it in would give NaN.
  const by = Object.fromEntries(Object.keys(kept).map(key => [key, key === "keep" ? null : overWalk(walk, p => prof(p)[key])]));
  return Array.from({ length: supply + 1 }, (_, k) => (k === 0 ? kept : Object.fromEntries(Object.keys(kept).map(key => [key, key === "keep" ? kept.keep : by[key][k]]))));
};
// What each steal of `me`'s off `f` heals it, as `stealHeal` holds it, from what `f` holds. `stealHealAfter`'s `Map`
// gives the same once `f` has eaten berries of its own, by `tpEatenKey` of `tpHeal`'s `used` bits: its Sitrus, and each
// Enigma (#833).
const tpStealHeal = (turn, me, f, walk) => {
  const draws = (holder, w) => {
    const d = stolenDraws(holder, { eater: me, turn, walk: w });
    return d ? d.eatenAt.slice(0, Math.min(9, d.supply)) : [];
  };
  const types = berryTypesOf(f);
  const enigmas = turn.mon(f).facts.enigma?.left ?? 0;
  const after = new Map();
  for (const sitrus of types.includes(BerryType.SITRUS) ? [0, 1] : [0]) {
    for (let n = 0; n <= enigmas; n++) {
      if (!sitrus && !n) continue;
      let left = sitrus ? lessBerry(f, BerryType.SITRUS) : f;
      for (let k = 0; k < n; k++) left = lessBerry(left, BerryType.ENIGMA);
      after.set(sitrus | (n << 1), draws(left, null));
    }
  }
  return { now: draws(f, walk), after };
};

// `facing`: the foe the first exchange is against, the only one a pinned move's own order is read for. `entering`: it
// is switching in, so `ourEntry[mi][fi]` holds our moves by name at the typing it comes in at, where it Teras later.
export const tpTables = (turn, party, foes, double = false, facing = null, entering = false) => {
  const faced = f => !foes.includes(facing) || f === facing;
  // The foe's side first: which move of ours is worth using against it turns on the order it would get (#650).
  const theirs = foes.map(f => party.map(me => tpTheirMove(turn, f, me)));
  const ours = party.map((me, mi) => foes.map((f, fi) => tpOurMove(turn, me, f, theirs[fi][mi])));
  const first = party.map((me, mi) => foes.map((f, fi) => tpOrder(turn, me, f, ours[mi][fi], theirs[fi][mi])));
  const wear = tpWear(turn, party, foes, ours, faced);
  const foeHeal = foes.map(p => tpHealProfile(turn, p));
  const thieves = party.map(me => foes.map(f => tpCanSteal(turn, me, f)));
  const walks = foes.map((f, fi) => (party.some((_, mi) => thieves[mi][fi]) ? berryWalk(f) : null));
  const steals = party.map((me, mi) => foes.map((f, fi) => (thieves[mi][fi] ? tpStealHeal(turn, me, f, walks[fi]) : null)));
  // In a double both field mons are out, so neither pays an entry hit to act (#113).
  const slots = double && party.length >= 2 ? 2 : 1;
  return {
    ours, theirs, first, slots,
    firstBy: party.map((me, mi) => foes.map((f, fi) => (faced(f) ? tpFirstBy(turn, me, f, ours[mi][fi], theirs[fi][mi]) : {}))),
    // A bench mon switching in spends the entry turn too, so only one out, or filling an empty slot, hits it then.
    ourEntry: party.map(me => foes.map(f => (entering && f === facing && (me.isOnField?.() || party.filter(p => p.isOnField?.()).length < slots)
      ? tpAtEntry(turn, me, f) : null))),
    send: foes.map(f => party.map(me => sendInBase(turn, f, me))),
    memo: new Map(),
    // Every hit overrides its `hp` and `bar` with the ones the fight carries.
    foeState: foes.map(f => turn.mon(f).state),
    ourMax: party.map(p => p.getMaxHp()), foeMax: foes.map(f => f.getMaxHp()),
    ourHeal: party.map(p => tpHealProfile(turn, p)), foeHeal,
    // `foeHealBy[fi][k]`: the foe's profile after k berries stolen, where one of ours can steal one;
    // `stealHeal[mi][fi][k]`: what our (k+1)-th steal off it heals us, uncapped, where we can.
    foeHealBy: foes.map((f, fi) => walks[fi] && tpHealBy(turn, f, foeHeal[fi], walks[fi])),
    stealHeal: steals.map(row => row.map(s => s?.now ?? null)),
    stealHealAfter: steals.map(row => row.map(s => s?.after ?? null)),
    ourUnnerve: party.map(p => !!turn.mon(p).facts.unnerve), foeUnnerve: foes.map(f => !!turn.mon(f).facts.unnerve),
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
    ...wear,
  };
};

const tpAtEntry = (turn, me, f) => {
  const outs = entryOutcomes(turn, me, f);
  return outs?.length ? Object.fromEntries(outs.map(o => [o.name, tpMoveOf(o)])) : null;
};

// `T` with our `mi` at the Tera it takes on step 1, read off `U`, the tables of that mon alone on the Tera's turn (#649).
const tpWithTera = (T, U, mi) => {
  const row = (rows, mine) => rows.map((r, i) => (i === mi ? mine[0] : r));
  const col = (rows, mine) => rows.map((r, fi) => r.map((x, i) => (i === mi ? mine[fi][0] : x)));
  return {
    ...T, memo: new Map(),
    ours: row(T.ours, U.ours), first: row(T.first, U.first), firstBy: row(T.firstBy, U.firstBy), ourEntry: row(T.ourEntry, U.ourEntry),
    theirs: col(T.theirs, U.theirs), send: col(T.send, U.send), fromUs: col(T.fromUs, U.fromUs),
    ourHeal: row(T.ourHeal, U.ourHeal), tok: row(T.tok, U.tok),
    stealHeal: row(T.stealHeal, U.stealHeal), stealHealAfter: row(T.stealHealAfter, U.stealHealAfter),
    foeHealBy: T.foeHealBy.map((by, fi) => by ?? U.foeHealBy[fi]),
    firstPara: row(T.firstPara, U.firstPara), firstParaBy: row(T.firstParaBy, U.firstParaBy),
    fromFoe: row(T.fromFoe, U.fromFoe), ourItems: row(T.ourItems, U.ourItems),
  };
};

// Wave status tokens and item thieves (30-planner.js). `fromUs[fi][mi]` is what foe `fi` steals from our `mi`, and
// `fromFoe[mi][fi]` the reverse; `ourItems` / `foeItems` are each mon's turn-end HP change after k steals.
const tpWear = (turn, party, foes, ours, faced = () => true) => {
  const heal = p => tpHealAt(turn, p);
  const tok = party.map(me => {
    const odds = foes[0] ? tokenOdds(turn, foes[0], me) : null;
    return odds && { odds, shift: tokenShift(odds, me, heal), para: odds.tokens.filter(x => x.effect === StatusEffect.PARALYSIS).reduce((t, x) => t + x.share, 0) };
  });
  const paraOrder = party.map((me, mi) => (tok[mi]?.para ? foes.map((f, fi) => {
    const clone = paralysed(me);
    const them = tpTheirMove(turn, f, clone);
    return { first: tpOrder(turn, clone, f, ours[mi][fi], them), by: faced(f) ? tpFirstBy(turn, clone, f, ours[mi][fi], them) : {} };
  }) : null));
  const firstPara = paraOrder.map(row => row && row.map(x => x.first));
  const firstParaBy = paraOrder.map(row => row && row.map(x => x.by));
  const fromUs = foes.map(f => party.map(me => stealRates(f, me)));
  const fromFoe = party.map(me => foes.map(f => stealRates(me, f)));
  return {
    tok, firstPara, firstParaBy, fromUs, fromFoe,
    ourItems: party.map((me, mi) => (foes.some((_, fi) => fromUs[fi][mi]) ? afterSteals(me, heal) : null)),
    foeItems: foes.map((f, fi) => (party.some((_, mi) => fromFoe[mi][fi]) ? afterSteals(f, heal) : null)),
  };
};
// The turn-end HP change `fixed` sure steals and Grip Claw's `mean` make, against none; `byCount[k]` is after k.
const tpStolen = (byCount, fixed, mean) => (byCount ? stealCounts(fixed, mean).reduce((t, p, k) => t + p * (byCount[k] - byCount[0]), 0) : 0);

// `used`: the berries eaten, each counted in `BERRY_PART`s of one: the Sitrus Berry's below `EATEN_SPAN`, and the
// Enigma Berries' in multiples of it. `se`: a super-effective hit landed this turn. The berries heal, capped, between
// `pre` and the rest of the turn end (game-code.md §21).
const BERRY_PART = 100, EATEN_SPAN = BERRY_PART + 1;
const tpEaten = used => ({ sitrus: used % EATEN_SPAN, enigmas: Math.floor(used / EATEN_SPAN) });
// `used` as `stealHealAfter` keys it: bit 0 the Sitrus, the Enigmas from bit 1 up. Exact without a Berry Pouch; under
// one, a part-eaten berry reads as gone or held.
const tpEatenKey = used => {
  const { sitrus, enigmas } = tpEaten(used);
  return Math.round(sitrus / BERRY_PART) | (Math.round(enigmas / BERRY_PART) << 1);
};
// The chance one of `count` berries is still held once `parts` are eaten, and the parts a trigger at that chance eats.
// Under a Berry Pouch the count eaten is an expectation, and a trigger heals by the chance and keeps `keep` of it
// (#822, #847).
const tpHeldChance = (parts, count, keep) => (keep > 0 ? Math.max(0, Math.min(1, count - parts / BERRY_PART)) : parts / BERRY_PART < count ? 1 : 0);
const tpPartsEaten = (left, keep) => Math.max(1, Math.round(BERRY_PART * left * (1 - keep)));
const tpHeal = (hp, max, prof, used, se, extra = 0) => {
  if (!prof || hp < 1) return [hp, used];
  const pre = prof.pre ?? 0, at = Math.min(max, hp + pre), keep = prof.keep ?? 0;
  let { sitrus, enigmas } = tpEaten(used), berries = 0;
  const sitrusLeft = tpHeldChance(sitrus, 1, keep);
  if (at < max / 2 && sitrusLeft > 0 && prof.sitrus) {
    berries += prof.sitrus * sitrusLeft;
    sitrus += tpPartsEaten(sitrusLeft, keep);
  }
  const enigmaLeft = tpHeldChance(enigmas, prof.enigmas ?? 1, keep);
  if (se && prof.enigma && enigmaLeft > 0) {
    berries += prof.enigma * enigmaLeft;
    enigmas += tpPartsEaten(enigmaLeft, keep);
  }
  used = sitrus + EATEN_SPAN * enigmas;
  if (!berries) return [Math.min(max, hp + prof.base + extra), used];
  return [at < 1 ? at : Math.min(max, Math.min(max, at + berries) + prof.base - pre + extra), used];
};

// Carried in `st` besides HP: `ox` the landed enemy hits each of ours has taken (wave status tokens), `od` / `og` the
// Mini Black Hole and Grip Claw steals from it, `fd` / `fg` the same from each foe, `fl` the berries our Bug Bites have
// taken off each foe, and `ok` / `fk` the KOs each side has scored for its on-KO boosts. Returns the likelier ending's
// state with `pWin`, `pLoss`, `pStall` and all three `ends`. `over` pins our move for this exchange only (#113), and is
// never memoised: the key names the pair, not the move.
// `entering`: the foe spends this exchange's first turn switching in and does not attack, so a switch of ours made that
// turn costs no entry hit (#846), and our hit that turn is `T.ourEntry`'s where it has one (#825).
export const tpFight = (T, st, mi, fi, entry, over = null, entering = false) => {
  const faints = st.oh.filter(hp => hp < 1).length + st.fh.filter(hp => hp < 1).length;
  const nUs = T.ourKo?.[mi] ? (T.ourKo[mi].any ? faints : st.ok?.[mi] ?? 0) : 0;
  const nFoe = T.foeKo?.[fi] ? (T.foeKo[fi].any ? faints : st.fk?.[fi] ?? 0) : 0;
  const key = !over && T.memo && [mi, fi, entry, entering, Math.round(st.oh[mi]), st.ob[mi], Math.round(st.fh[fi]), st.fs[fi], st.fb[fi], st.fl?.[fi] ?? 0, nUs, nFoe,
    ...[st.ox?.[mi], st.od?.[mi], st.og?.[mi], st.fd?.[fi], st.fg?.[fi]].map(x => Math.round((x ?? 0) * 20))].join();
  if (key && T.memo.has(key)) return T.memo.get(key);
  const us = over ?? T.ours[mi][fi], them = T.theirs[fi][mi], foeState = T.foeState?.[fi] ?? { bar: 0 };
  // On-KO Speed boosts are not modelled.
  const usMul = us && (nUs || nFoe) && T.koMult ? T.koMult(T.party[mi], T.ourKo[mi], nUs, T.foes[fi], T.foeKo[fi], nFoe, us.cat === "special" ? 0 : 1) : 1;
  const themMul = (nUs || nFoe) && T.koMult ? T.koMult(T.foes[fi], T.foeKo[fi], nFoe, T.party[mi], T.ourKo[mi], nUs, them.phys ?? 1) : 1;
  const tok = T.tok?.[mi], robUs = T.fromUs?.[fi]?.[mi], robFoe = T.fromFoe?.[mi]?.[fi];
  const stealHeal = T.stealHeal?.[mi]?.[fi], healBy = T.foeHealBy?.[fi];
  const ourUse = us?.use ?? [{ r: 1, p: 1 }];
  // An Unnerve across the pairing keeps both berries uneaten (game-code.md §21).
  const ourBerry = !!T.ourHeal?.[mi]?.enigma && !T.foeUnnerve?.[fi], foeBerry = !!T.foeHeal?.[fi]?.enigma && !T.ourUnnerve?.[mi];
  // Its use's share that lands super-effective feeds our berry branch by branch.
  const theirUse = (them.use ?? [{ r: 1, p: 1 }]).flatMap(t => (ourBerry && t.se > 0 && t.se < 1
    ? [{ ...t, p: t.p * t.se, se: 1 }, { ...t, p: t.p * (1 - t.se), se: 0 }] : [t]));
  // The order the move being run gets, not the pairing's: with `over` pinned that is the card's ⚔ line, whose priority
  // move may land before a foe that outspeeds the pairing's own pick (#650).
  const foeFirst = T.firstBy?.[mi]?.[fi]?.[us?.name] ?? T.first[mi][fi];
  const foeFirstSlowed = T.firstParaBy?.[mi]?.[fi]?.[us?.name] ?? T.firstPara?.[mi]?.[fi] ?? foeFirst;
  // A hand-built table or state carries no wear, so every wear field is optional.
  const ox0 = st.ox?.[mi] ?? 0;
  const entryHit = entry === "switch" && !entering;
  const foeIdle = entering && entry !== "switch";
  const atEntry = foeIdle && us ? T.ourEntry?.[mi]?.[fi]?.[us.name] ?? null : null;
  let turns = 0;
  // P(token status by the end of turn `t`); `t` 0 is before this exchange.
  const by = t => (!tok ? 0 : tok.odds.by(ox0 + (entryHit ? them.hits ?? 0 : 0) + (them.hits ?? 0) * Math.max(0, t - (foeIdle ? 1 : 0))));
  // Drain wins back its share of the HP the hits actually took, after the bars and the foe's HP have cut them.
  const hitFoe = (b, o, mv = us) => {
    const n = Math.max(1, Math.round(o.n ?? 1));
    let st = { ...foeState, hp: b.fh, bar: b.fs };
    for (let k = 0; k < n && st.hp >= 1; k++) {
      st = hitOn(st, mv.dmg * o.r * usMul / n);
      b.fg += robFoe?.perHit ?? 0;
    }
    if (mv.drain && b.mh >= 1) b.mh = Math.min(T.ourMax[mi], b.mh + (b.fh - st.hp) * mv.drain);
    b.fse = (mv.e ?? 1) >= 2;
    // Recoil is paid whether or not the hit finished the foe.
    if (mv.self) b.mh -= mv.self;
    // A landed steal takes the next berry even on a knockout, and its heal comes after our own chip (game-code.md §3).
    const draws = (b.fb && T.stealHealAfter?.[mi]?.[fi]?.get(tpEatenKey(b.fb))) || stealHeal;
    if (us.steals && draws && b.fl < draws.length) {
      if (b.mh >= 1) b.mh = Math.min(T.ourMax[mi], b.mh + draws[b.fl]);
      b.fl++;
    }
    b.fh = st.hp;
    b.fs = st.bar;
  };
  const foeHit = (b, r, se, dmg = them.dmg) => {
    const hit = dmg * r * themMul;
    const dealt = Math.min(hit, Math.max(0, b.mh));
    b.mh -= hit;
    if (them.drain && b.fh >= 1) b.fh = Math.min(T.foeMax[fi], b.fh + dealt * them.drain);
    b.ox += them.hits ?? 0;
    b.og += (robUs?.perHit ?? 0) * (them.hits ?? 0);
    b.mse ||= r > 0 && (se ?? (them.e >= 2 ? 1 : 0)) > 0;
  };
  const endTurn = b => {
    [b.mh, b.mb] = tpHeal(b.mh, T.ourMax[mi], T.ourHeal[mi], b.mb, b.mse && ourBerry, (tok ? tok.shift * by(turns) : 0) + tpStolen(T.ourItems?.[mi], b.od, b.og));
    [b.fh, b.fb] = tpHeal(b.fh, T.foeMax[fi], healBy?.[Math.min(b.fl, healBy.length - 1)] ?? T.foeHeal[fi], b.fb, b.fse && foeBerry, tpStolen(T.foeItems?.[fi], b.fd, b.fg));
    b.mse = b.fse = false;
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
  const start = { p: 1, mh: st.oh[mi], mb: st.ob[mi], fh: st.fh[fi], fs: st.fs[fi], fb: st.fb[fi], ox: ox0, od: st.od?.[mi] ?? 0, og: st.og?.[mi] ?? 0, fd: st.fd?.[fi] ?? 0, fg: st.fg?.[fi] ?? 0, fl: st.fl?.[fi] ?? 0 };
  if (entryHit) {
    for (const t of theirUse) { const b = { ...start, p: t.p }; foeHit(b, t.r, t.se, them.entry ?? them.dmg); endTurn(b); settle(b, standing); }
    standing = tpMerge(standing, TP_BRANCHES, T, mi, fi);
  } else if (entry === "switch") {
    const b = { ...start };
    endTurn(b);
    settle(b, standing);
  } else standing = [start];
  while (standing.length && turns < TP_TURNS) {
    turns++;
    const para = tok?.para ? by(turns - 1) * tok.para : 0;
    const foeIdleNow = foeIdle && turns === 1;
    const pFoe = foeIdleNow ? 0 : Math.max(0, Math.min(1, para * foeFirstSlowed + (1 - para) * foeFirst));
    const act = tok ? 1 - attemptsLost(tok.odds, by, turns, pFoe) : 1;
    const hits = !!us && (us.charge ? turns % 2 === 0 : us.recharge ? turns % 2 === 1 : true);
    const hidden = !!us && !hits && !!us.semiCharge;
    const mv = atEntry && turns === 1 ? atEntry : us;
    const use = mv === us ? ourUse : mv.use ?? [{ r: 1, p: 1 }];
    const ours = hits ? [...(act < 1 ? [{ r: 0, p: 1 - act }] : []), ...use.map(x => ({ ...x, p: x.p * act }))] : [{ r: 0, p: 1 }];
    const next = [];
    for (const b of standing) {
      for (const [foeFirst, w] of [[false, 1 - pFoe], [true, pFoe]]) {
        if (!(w > 0)) continue;
        for (const o of ours) {
          if (!foeFirst) {
            const a = { ...b, p: b.p * w * o.p };
            if (o.r > 0) hitFoe(a, o, mv);
            if (a.fh < 1 || hidden || foeIdleNow) { endTurn(a); settle(a, next); continue; }
            for (const t of theirUse) { const c = { ...a, p: a.p * t.p }; foeHit(c, t.r, t.se); endTurn(c); settle(c, next); }
          } else {
            for (const t of theirUse) {
              const c = { ...b, p: b.p * w * o.p * t.p };
              foeHit(c, t.r, t.se);
              if (c.mh >= 1 && o.r > 0) hitFoe(c, o, mv);
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
  // Collapsing a pool pair by pair with `tpMerge` froze the card for seconds: against a healer it runs to hundreds of
  // branches (#527).
  const one = list => {
    if (!list.length) return null;
    let p = 0, mh = 0, fh = 0, ox = 0, od = 0, og = 0, fd = 0, fg = 0, t = 0;
    const combos = new Map();
    for (const b of list) {
      p += b.p; mh += b.p * b.mh; fh += b.p * b.fh; t += b.p * b.turns;
      ox += b.p * b.ox; od += b.p * b.od; og += b.p * b.og; fd += b.p * b.fd; fg += b.p * b.fg;
      const k = `${b.fs},${b.mb},${b.fb},${b.fl}`;
      const c = combos.get(k);
      if (c) c.p += b.p; else combos.set(k, { p: b.p, b });
    }
    const mode = [...combos.values()].reduce((x, c) => (c.p > x.p ? c : x)).b;
    const at = (sum, k) => (p > 0 ? sum / p : list[0][k]);
    const mhAt = at(mh, "mh"), fhAt = at(fh, "fh");
    return { mh: mhAt < 1 ? 0 : mhAt, mb: mode.mb, fh: fhAt < 1 ? 0 : fhAt, fs: mode.fs, fb: mode.fb, fl: mode.fl, turns: Math.round(at(t, "turns")),
      ox: at(ox, "ox"), od: at(od, "od"), og: at(og, "og"), fd: at(fd, "fd"), fg: at(fg, "fg") };
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
  const far = (a, b) => Math.abs(a.mh - b.mh) / T.ourMax[mi] + Math.abs(a.fh - b.fh) / T.foeMax[fi] + (a.fs !== b.fs || a.mb !== b.mb || a.fb !== b.fb || a.fl !== b.fl ? 1 : 0);
  while (out.length > k) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const d = far(out[i], out[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    const [a, b] = [out[bi], out[bj]];
    const p = a.p + b.p;
    const w = f => (p > 0 ? (a[f] * a.p + b[f] * b.p) / p : a[f]);
    const big = a.p >= b.p ? a : b;
    out.splice(bj, 1);
    out[bi] = { ...big, p, mh: w("mh"), fh: w("fh"), ox: w("ox"), od: w("od"), og: w("og"), fd: w("fd"), fg: w("fg") };
  }
  return out;
};
const tpFoeLeft = r => r.pLoss * (r.ends.loss?.fh ?? 0) + r.pStall * (r.ends.stall?.fh ?? 0);
// `r.fh` is a mean, and a float error puts it under `hp` with no hit landed: a strict `<` let summation order alone
// flip the win-condition warning between "keep X healthy" and "chip it with X" (#527).
export const tpActs = (r, hp) => hp - r.fh >= 1;

const tpClone = st => ({ ...st, oh: st.oh.slice(), ob: st.ob.slice(), fh: st.fh.slice(), fs: st.fs.slice(), fb: st.fb.slice(), fl: st.fl?.slice() ?? st.fh.map(() => 0),
  ox: st.ox.slice(), od: st.od.slice(), og: st.og.slice(), fd: st.fd.slice(), fg: st.fg.slice(),
  ok: st.ok?.slice() ?? st.oh.map(() => 0), fk: st.fk?.slice() ?? st.fh.map(() => 0) });
const tpApply = (c, mi, fi, r) => {
  if (c.ok && c.fh[fi] >= 1 && r.fh < 1) c.ok[mi]++;
  if (c.fk && c.oh[mi] >= 1 && r.mh < 1) c.fk[fi]++;
  c.oh[mi] = r.mh; c.ob[mi] = r.mb; c.fh[fi] = r.fh; c.fs[fi] = r.fs; c.fb[fi] = r.fb; c.fl[fi] = r.fl ?? 0;
  c.ox[mi] = r.ox; c.od[mi] = r.od; c.og[mi] = r.og; c.fd[fi] = r.fd; c.fg[fi] = r.fg;
};
const tpAlive = hps => hps.flatMap((hp, i) => (hp >= 1 ? [i] : []));

// The trainer scores its send-in against our field (game-code.md §7). In a double the plan, one exchange at a time,
// takes the mon that just acted to stand for it.
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
  return v + (st.result === "win" || st.result === "stall" ? 0 : st.early ?? 0);
};

// `reserve`: `[{ mi, fi }]`, our `mi` kept off every foe but `fi` while anyone else can still fight. `pin`:
// `{ mi, move, free }`, the ⚔ line's action, fixing the first exchange only (#113).
const tpSearch = (T, start, reserve, pin = null) => {
  let beam = [start];
  const done = [];
  const slots = T.slots ?? 1;
  const horizon = start.oh.length + start.fh.length + 2;
  for (let depth = 0; depth < horizon && beam.length; depth++) {
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
      const entering = depth === 0 && fi === start.fenter;
      for (const [mi, entry] of cands) {
        const r = tpFight(T, st, mi, fi, entry, depth === 0 && pin?.move && mi === pin.mi ? pin.move : null, entering);
        const child = end => {
          const c = tpClone(st);
          tpApply(c, mi, fi, end);
          const rest = st.cur.includes(mi) ? st.cur.filter(i => i !== mi) : st.cur.length < slots ? st.cur : st.cur.slice(1);
          c.cur = (end.mh >= 1 ? [...rest, mi] : rest).sort((a, b) => a - b);
          c.act = end.mh >= 1 ? mi : rest[0] ?? null;
          c.fcur = end.fh >= 1 ? fi : null;
          c.result = c.fh.every(hp => hp < 1) ? "win" : c.oh.every(hp => hp < 1) ? "loss" : end.mh >= 1 && end.fh >= 1 ? "stall" : null;
          // Every ordering of a lost line deals the same and leaves nobody standing, so without this tie-break the
          // beam spent the members that never act ahead of the one that does (#651).
          c.early = (st.early ?? 0) + TP_EARLY * (horizon - depth) * Math.max(0, st.fh[fi] - end.fh) / T.foeStart[fi];
          return c;
        };
        // Only the likelier ending goes on, so `val` banks every ending the line drops: valued by its last step's
        // endings alone, a line that ends on a gamble forgot the earlier step's win (#651).
        const c = child(r);
        c.steps = [...st.steps, { mi, fi, entry, entering, hp: r.mh, foeFrom: st.fh[fi], foeHp: r.fh, turns: r.turns, odds: r.fh < 1 ? r.pWin : r.mh < 1 ? r.pLoss : r.pStall }];
        const norm = Math.max(1e-9, (r.ends.win ? r.pWin : 0) + (r.ends.loss ? r.pLoss : 0) + (r.ends.stall ? r.pStall : 0));
        let banked = st.banked ?? 0, kept = 0;
        for (const [k, p] of [["win", r.pWin], ["loss", r.pLoss], ["stall", r.pStall]]) {
          const e = r.ends[k];
          if (!e || !(p > 0)) continue;
          if (e.mh === r.mh && e.fh === r.fh) { kept += p / norm; continue; }
          const x = child(e);
          banked += (st.mass ?? 1) * p / norm * tpValue(T, x, !!x.result);
        }
        c.banked = banked;
        c.mass = (st.mass ?? 1) * kept;
        c.val = banked + c.mass * tpValue(T, c, !!c.result);
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
// `entering`: `foe` is that switch-in.
const tpFacing = (turn, foes) => {
  const here = turn.activeFoes()[0] ?? null;
  if (!here || !turn.live || turn.facts.decision === "check-switch") return { foe: here, entering: false };
  const to = turn.enemyAction(here).switchTo;
  return to && foes.includes(to) ? { foe: to, entering: true } : { foe: here, entering: false };
};

const TP_PREFER = 20;
const TP_HOLD = 10;

// ⚔ owns the turn and this model the rest of the fight (#113). `pin` is `{ mi, outcome?, then?, free?, tera? }`:
// `at(pin)` re-searches with it as step 1, `after(pin)` reads what that plan says comes next, and `view(pin)` renders
// it. `entering`: `facing` is the foe switching in this turn. `teraOf(mi)`: the tables with our `mi` Tera'd from step 1
// on, for a pin whose `tera` names the type (#649).
const tpModel = (T, double, party, foes, facing, entering, teraOf = () => T) => {
  const ref = p => ({ icon: iconOf(p), name: p.name });
  const pctOf = (hp, max) => Math.round(hp / max * 100);
  const fcur = foes.indexOf(facing);
  const start = {
    oh: party.map(p => p.hp), ob: party.map(() => 0),
    fh: foes.map(f => f.hp), fs: T.foeState.map(x => x.bar), fb: foes.map(() => 0), fl: foes.map(() => 0),
    ox: party.map(() => 0), od: party.map(() => 0), og: party.map(() => 0), fd: foes.map(() => 0), fg: foes.map(() => 0),
    ok: party.map(() => 0), fk: foes.map(() => 0),
    cur: party.flatMap((p, i) => (p.isOnField?.() ? [i] : [])), fcur: fcur >= 0 ? fcur : null, steps: [],
    // The foe that spends the first exchange's first turn switching in.
    fenter: entering && fcur >= 0 ? fcur : null,
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

  // Per foe, each of ours that answers it one-on-one from a free switch: `per` is one hit's share of the foe's HP,
  // `beats` wins outright, `acts` lands something before falling.
  const matrix = foes.map((f, fi) => tpAlive(start.oh)
    .map(mi => {
      const r = tpFight(T, start, mi, fi, "free");
      return { mi, per: (T.ours[mi][fi]?.dmg ?? 0) / f.hp, beats: r.fh < 1 && r.mh >= 1, acts: tpActs(r, f.hp) };
    })
    .filter(a => a.beats || a.per >= 0.2)
    .sort((a, b) => b.per - a.per));

  const answers = win < 0 ? [] : matrix[win].filter(a => a.per >= 0.2).slice(0, 2);
  // A foe only one of ours beats holds that mon back even when it is not the win condition (#170).
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

  // A pin runs the ⚔ move, else its follow-up: a first-turn-only or foe-dependent move would repeat in a table
  // exchange as though it always worked (#650).
  const pinned = pin => [pin.outcome, pin.then].find(o => o?.expected > 0 && !o.traits?.once && !o.traits?.needsAttack) ?? null;
  const keyOf = pin => (pin && pin.mi != null && pin.mi >= 0 ? `${pin.mi}|${pinned(pin)?.name ?? ""}|${pin.free ? "f" : ""}|${pin.tera ?? ""}` : "");
  const teraMemo = new Map();
  const tablesOf = pin => {
    if (!pin?.tera) return T;
    if (!teraMemo.has(pin.mi)) teraMemo.set(pin.mi, teraOf(pin.mi));
    return teraMemo.get(pin.mi);
  };
  const atMemo = new Map();
  const at = pin => {
    const k = keyOf(pin);
    if (!k) return base;
    if (!atMemo.has(k)) {
      const o = pinned(pin);
      atMemo.set(k, tpSearch(tablesOf(pin), start, hold, { mi: pin.mi, move: o ? tpMoveOf(o) : null, free: !!pin.free }) ?? base);
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
    const k = keyOf(pin);
    const tera = k && pin.tera ? { mi: pin.mi, type: pin.tera, T: tablesOf(pin) } : null;
    if (!viewMemo.has(k)) viewMemo.set(k, tpView({ T, party, foes, double, start, win, kills, alive, answers, only, onlyBy, reserve, base, ref, pctOf }, at(pin), !!k, tera));
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
  // The searches read only the tables `tpTables` builds, never the live game.
  const { foe: facing, entering } = tpFacing(turn, foes);
  const T = tpTables(turn, party, foes, double, facing, entering);
  const teraOf = mi => tpWithTera(T, tpTables(ourTeraTurn(turn, party[mi]), [party[mi]], foes, double, facing, entering), mi);
  return tpModel(T, double, party, foes, facing, entering, teraOf);
};

export const teamPlan = turn => teamPlanner(turn)?.view(null) ?? null;

// `tera`: `{ mi, type, T }`, the pin's Tera, its step 1 pressing it, and the tables the plan was searched on.
const tpView = (M, plan, pinned, tera = null) => {
  const { party, foes, double, start, win, kills, alive, answers, only, onlyBy, reserve, base, ref, pctOf } = M;
  if (!plan) return null;
  const T = tera?.T ?? M.T;
  const beats = party.map((_, mi) => foes.filter((_, fi) => tpFight(T, start, mi, fi, "free").fh < 1).length);
  const lowValue = mi => !reserve.includes(mi) && (start.oh[mi] / T.ourMax[mi] < 0.35 || beats[mi] === 0);

  const winStep = plan.steps.findIndex(x => x.fi === win);
  const steps = plan.steps.map((x, i) => {
    const us = T.ours[x.mi][x.fi], nextStep = plan.steps[i + 1];
    const why = x.entry === "switch" ? [x.entering ? "switch in" : "switch in, takes a hit"] : [];
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
      tera: i === 0 && tera && x.mi === tera.mi ? tera.type : null,
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

  // One line, never a competing step list: the user still has one decision to follow (#113). Single battles only: the
  // pin covers one slot of a double, and the `gain` named the other slot's ⚔ action back as an alternative (#845).
  const prefers = (() => {
    if (double || !pinned || !base || base === plan) return null;
    const gain = base.val - plan.val;
    if (!(gain >= TP_PREFER || (plan.result !== "win" && base.result === "win"))) return null;
    const [a, nxt] = base.steps;
    if (!a) return null;
    const what = a.hp < 1 && nxt?.entry === "free" ? `let ${party[a.mi].name} fall → ${party[nxt.mi].name} in free`
      : a.entry === "switch" ? `${party[a.mi].name} in`
      : `${party[a.mi].name} ${M.T.ours[a.mi][a.fi]?.name ?? "—"} → ${foes[a.fi].name}`;
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
