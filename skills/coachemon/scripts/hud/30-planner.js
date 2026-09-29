// Everything about the live battle is the turn's (`25-turn.js`): this opens no sandbox and keeps no cache but
// `turn.memo`. Against an approximate turn every answer still comes back, labelled `live: false`.
import { ABILITY_IMMUNE, ABILITY_IMMUNE_FLAG, CONTACT_PUNISH, FIELD_TRAPS, MOVE_TRAPS, SPREAD_TARGETS, STATUS_FRAMES, TYPES, abilitiesOf, effectiveness, iconOf, moveHasFlag, squeezeDist, stage, stat, typesOf, vs } from "./01-core.js";
import { moveTraits } from "./07-move-traits.js";
import { koChanceAt, koCurve, koTurn, koTurns, rawMax, useOf } from "./10-damage.js";

const pmName = pm => pm?.getName?.() ?? pm?.name ?? "";
const bossBarsLeft = p => (p.isBoss?.() && p.bossSegments > 1 ? Math.max(1, (p.bossSegmentIndex ?? p.bossSegments - 1) + 1) : 1);
// Turn-end HP change, signed: heals +, chip −. `dealt`: damage `p` deals a turn (Shell Bell).
const healAtEnd = (turn, p, dealt = 0) => (turn.live ? turn.turnEndHp(p, { dealt }) : 0) || 0;
const heldStack = (p, name) => (p.getHeldItems?.() ?? []).filter(m => m.constructor?.name === name).reduce((t, m) => t + (m.getStackCount?.() ?? 1), 0);
const hitCounts = o => {
  const ns = (o?.dist ?? []).filter(d => d.p > 0).map(d => d.n);
  if (!ns.length || Math.max(...ns) <= 1) return null;
  return Math.min(...ns) === Math.max(...ns) ? `${ns[0]}` : `${Math.min(...ns)}–${Math.max(...ns)}`;
};

const protectChance = (turn, foe) => turn.memo(`protect:${foe.id}`, () => {
  if (!turn.live || !foe.isOnField?.()) return 0;
  return (turn.enemyAction(foe).moves ?? []).reduce((sum, d) => {
    const pm = foe.moveset[d.slot] ?? foe.moveset.find(m => m?.getName() === d.name);
    const mv = pm?.getMove?.();
    return sum + (mv && moveTraits(mv).protect ? d.p : 0);
  }, 0);
});

// Approximation only: live damage already carries the spread ¾ (game-code.md §1).
const spreadMult = (turn, atk) => {
  const { double, foes, field } = turn.facts;
  if (!double) return 1;
  const mine = foes.includes(atk);
  return field.filter(p => p && p.hp > 0 && foes.includes(p) !== mine).length >= 2 ? 0.75 : 1;
};

const AI_POINT = 0.25 / 6;

// The damage module's records plus `pm` (the moveset entry), `dmg` (expected damage) and `benefit`: the enemy AI's
// own step-7 score for our move against this target, either sign (game-code.md §6), 0 without game functions.
export const planOutcomes = (turn, atk, def) => turn.memo(`o:${atk.id}>${def.id}`, () => {
  const pmOf = name => atk.moveset.find(m => m?.getName() === name) ?? null;
  const outs = turn.outcomes(atk, def);
  // The records, not `turn.live`: a live turn still falls back to the approximation for a move the game refuses to
  // price, and the rows claimed that as a live number (#130).
  if (outs.some(o => o.live)) {
    return outs.map(o => {
      const pm = pmOf(o.name);
      return { ...o, pm, dmg: o.expected, benefit: turn.benefit(atk, def, pm?.getMove?.()) };
    });
  }
  const mult = spreadMult(turn, atk);
  const bars = bossBarsLeft(def);
  return outs.map(x => {
    const dmg = x.dmg * (x.spread ? mult : 1);
    return { name: x.name, type: x.type, cat: x.cat, e: x.e, priority: x.priority ?? 0, spread: x.spread,
      pm: pmOf(x.name) ?? x, dmg, expected: dmg, max: dmg, acc: 1, dist: [{ n: 1, p: 1 }], benefit: 0, costs: [], notes: [],
      pKo: bars <= 1 && dmg >= def.hp ? 1 : 0, targetHp: def.hp, live: false };
  });
});

const NO_MOVE_INFO = { priority: 0 };
// Quick Claw and Quick Draw (game-code.md §5).
const quickChance = (p, category) => {
  const status = category === MoveCategory.STATUS;
  if (status && abilitiesOf(p).includes("Mycelium Might")) return 0;
  let stack = 0;
  for (const m of p.getHeldItems?.() ?? []) if (m.constructor?.name === "BypassSpeedChanceModifier") stack += m.getStackCount?.() ?? 1;
  const draw = abilitiesOf(p).includes("Quick Draw") && !status ? 0.3 : 0;
  return 1 - (1 - Math.min(1, 0.1 * stack)) * (1 - draw);
};
// P(`a` acts before `b`). A null move is a switch, item or run, which goes before any move (game-code.md §5).
// `thisTurn`: a speed tie is the game's own shuffle (`turn.speedTie`); on any other turn it is a coin flip.
export const actionOrder = (turn, a, aPm, b, bPm, { thisTurn = false } = {}) => {
  if (!aPm || !bPm) return !aPm && !bPm ? 0.5 : aPm ? 0 : 1;
  const info = (p, pm) => {
    const { priority, bracket, category } = turn.mon(p).order(pm);
    return { priority, bracket, quick: quickChance(p, category) };
  };
  const x = info(a, aPm), y = info(b, bPm);
  if (x.priority !== y.priority) return x.priority > y.priority ? 1 : 0;
  const sa = turn.mon(a).speed, sb = turn.mon(b).speed;
  const trickRoom = turn.facts.trickRoom;
  const bySpeed = sa !== sb ? ((sa > sb) !== trickRoom ? 1 : 0) : (thisTurn ? turn.speedTie(a, b) : null) ?? 0.5;
  const cmp = (ba, bb) => (ba === bb ? bySpeed : ba > bb ? 1 : 0);
  const qa = x.quick, qb = y.quick;
  return qa * qb * cmp(MovePriorityInBracket.FIRST, MovePriorityInBracket.FIRST) + qa * (1 - qb) * cmp(MovePriorityInBracket.FIRST, y.bracket) + (1 - qa) * qb * cmp(x.bracket, MovePriorityInBracket.FIRST) + (1 - qa) * (1 - qb) * cmp(x.bracket, y.bracket);
};

// The draw our `RANDOM_NEAR_ENEMY` command makes before the enemy picks, so the pick is predicted per command
// (game-code.md §6, #158). Not covered, which is why such a row is `~`: at slot 0's prompt slot 1's command is still
// to come and may draw too, and a `VariableTargetAttr` can turn another target random.
const commandDraws = (turn, me, myPm) => {
  if (!turn.facts.double || !me?.isOnField?.()) return [];
  const mv = myPm?.getMove?.();
  if (!mv || mv.moveTarget !== MoveTarget.RANDOM_NEAR_ENEMY) return [];
  const n = (me.getOpponents?.(false) ?? []).filter(Boolean).length;
  return n > 1 ? [n] : [];
};

// [{ o (null for a status move), name, type, p }]: the enemy AI's own distribution for a foe on the field this turn,
// else its choice replayed against `me` (`aiReplay`), else damage standing in for the move score. A foe with nobody
// to aim at (our slot empty mid-replacement) scores every move −∞ (game-code.md §6), so the replay answers for it.
export const likelyMoves = (turn, foe, me, outs, next, ranges = []) => {
  const live = turn.live;
  if (live && !next && foe.isOnField?.() && (foe.getOpponents?.() ?? [me]).length) {
    const dist = turn.enemyAction(foe, { ranges }).moves;
    if (dist?.length) {
      const idx = me.isOnField?.() ? me.getBattlerIndex?.() : null;
      return dist.map(d => {
        const o = outs.find(x => x.name === d.name) ?? null;
        // The share that lands on `me`; a bench mon coming in takes an average slot's.
        const ts = d.targetDist?.length ? d.targetDist : d.targets ?? [];
        let tp = 1;
        if (turn.facts.double && ts.length) {
          if (typeof ts[0] === "object") tp = o?.spread ? 1 : idx == null ? ts.reduce((t, x) => t + (x.p ?? 0), 0) / 2 : ts.find(x => x.battlerIndex === idx)?.p ?? 0;
          else tp = o?.spread ? (idx == null || ts.includes(idx) ? 1 : 0) : idx == null ? 1 / 2 : ts.includes(idx) ? 1 / ts.length : 0;
        }
        // The outcome's type is the one the move lands with (Tera Blast); the AI's row can carry the base type.
        return { o, name: d.name, type: o?.type ?? d.type, p: d.p * tp };
      });
    }
  }
  if (live && outs.some(o => o.live)) {
    const rows = turn.replayAI(foe, me);
    if (rows?.length) {
      return rows.map(d => {
        const o = outs.find(x => x.name === d.name) ?? null;
        return { o, name: d.name, type: o?.type ?? d.type, p: d.p };
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
  if (foe.aiType === AiType.RANDOM) return list.map(o => ({ o, name: o.name, type: o.type, p: 1 / list.length }));
  const advance = i => (foe.aiType === AiType.SMART_RANDOM ? 0.375 : Math.min(1, Math.round(list[i + 1].expected / list[i].expected * 50) / 100));
  let reach = 1;
  return list.map((o, i) => {
    const stop = i < list.length - 1 ? 1 - advance(i) : 1;
    const p = reach * stop;
    reach *= 1 - stop;
    return { o, name: o.name, type: o.type, p };
  });
};

// P(`p` gets to use `mv` this turn, or next turn with `next`) (game-code.md §8).
export const actChance = (p, mv = null, next = false) => {
  const later = next ? 1 : 0;
  if (!next && p.getTag?.("RECHARGING")) return 0;
  const moveHas = (name, test = () => true) => (mv?.attrs ?? []).some(a => a.constructor?.name === name && test(a));
  const st = p.status;
  let q = 1;
  if (st?.effect === StatusEffect.SLEEP && !moveHas("BypassSleepAttr")) {
    const early = p.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr") ? 1 : 0;
    if ((st.sleepTurnsRemaining ?? 0) - 1 - later - early * (1 + later) > 0) return 0;
  }
  if (st?.effect === StatusEffect.FREEZE && !moveHas("HealStatusEffectAttr", a => a.selfTarget) && (st.freezeTurnsRemaining ?? 0) - 1 - later > 0) q *= 0.25;
  if (st?.effect === StatusEffect.PARALYSIS) q *= 7 / 8;
  const confused = p.getTag?.("CONFUSED");
  if (confused && (confused.turnCount ?? 0) - later > 1) q *= 2 / 3;
  return q;
};
const actDelay = p => {
  if (p.getTag?.("RECHARGING")) return 1;
  const st = p.status;
  if (st?.effect !== StatusEffect.SLEEP) return 0;
  const early = p.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr") ? 1 : 0;
  return Math.max(0, Math.ceil((st.sleepTurnsRemaining ?? 0) / (1 + early)) - 1);
};

// `foe`'s likely moves on `me`, each weighted by the chance it gets to use it. `koFirst`: P(it moves first) over the
// moves that KO; `boost`: the stat stages its setup adds a turn ({ [stat 1–5]: stages }). Damage is on our true
// abilities: the AI's blind spots decide what it picks, not what it deals.
export const threatFrom = (turn, foe, me, myPm = null, { next = false } = {}) => turn.memo(`t:${foe.id}>${me.id}:${pmName(myPm)}:${next}`, () => {
  const outs = planOutcomes(turn, foe, me);
  const ranges = next ? [] : commandDraws(turn, me, myPm);
  const moves = likelyMoves(turn, foe, me, outs, next, ranges);
  if (!moves.length) return null;
  // `confidence`: `exact` where the game's own call answered, `replay` where it rode on a draw our command made.
  const action = turn.live && !next && foe.isOnField?.() ? turn.enemyAction(foe, { ranges }) : null;
  const exactRow = action?.exact ? action.moves[0] : null;
  const live = turn.live && outs.some(o => o.live);
  let expected = 0, pKo = 0, first = 0, koFirst = 0, worst = null, likely = null, drained = 0;
  const kos = [], use = [], boost = {};
  for (const m of moves) {
    if (!likely || m.p > likely.p) likely = m;
    if (!(m.p > 0)) continue;
    const pm = m.o?.pm ?? foe.moveset.find(x => x?.getName() === m.name) ?? NO_MOVE_INFO;
    const order = actionOrder(turn, foe, pm, me, myPm ?? NO_MOVE_INFO, { thisTurn: !next });
    first += m.p * order;
    if (!m.o) {
      const up = turn.mon(foe).setup(pm.getMove?.());
      if (up) for (const [st, n] of Object.entries(up)) boost[st] = (boost[st] ?? 0) + m.p * actChance(foe, pm.getMove?.() ?? null, next) * n;
      continue;
    }
    const ko = m.o.pKo ?? 0;
    const p = m.p * actChance(foe, pm.getMove?.() ?? null, next);
    expected += p * m.o.expected;
    drained += p * (m.o.drain ?? 0) * m.o.expected;
    pKo += p * ko;
    koFirst += p * ko * order;
    if (p >= 0.05 && (!worst || m.o.max > worst.o.max)) worst = m;
    const hits = (m.o.dist ?? []).reduce((sum, d) => sum + d.n * d.p, 0) || 1;
    kos.push({ p, max: m.o.max, pKo: ko, acc: m.o.acc ?? 1, revive: m.o.revive ?? 0, cat: m.o.cat, hits, targetHp: me.hp, live });
    for (const x of useOf(m.o)) use.push({ d: x.d, p: x.p * p, n: x.n ?? 1 });
  }
  const dealt = use.reduce((sum, x) => sum + x.p, 0);
  if (dealt < 1) use.push({ d: 0, p: 1 - dealt, n: 0 });
  const brief = m => m && { name: m.name, type: m.type, e: m.o?.e ?? null, p: m.p, hits: hitCounts(m.o) };
  return {
    expected, worst: worst?.o.max ?? 0, pKo, first, koFirst: pKo > 0 ? koFirst / pKo : first,
    move: brief(likely), worstMove: brief(worst), moves: kos, hp: me.hp, from: foe.name, live, use: squeezeDist(use, 12),
    exact: !!exactRow, confidence: exactRow ? action.confidence : "estimate",
    // Battler indices: the game's own answer, not a share.
    targets: exactRow ? [...(exactRow.targets ?? [])] : null,
    revive: Math.max(0, ...kos.map(k => k.revive)),
    boost: Object.keys(boost).length ? boost : null,
    // HP its drain moves give it back a turn; negative into Liquid Ooze.
    drain: drained,
  };
});

// The stat stages `p` gains a KO (game-code.md §18): { up: { [stat 1–5]: stages }, ability, any }, `any` when every
// faint counts and not only its own KOs. Speed is in `up` for the note; the damage factors leave it out.
export const koBoost = p => {
  if (!p) return null;
  const up = {};
  let name = null, any = false;
  try {
    for (const [attr, whose] of [["PostVictoryStatStageChangeAbAttr", false], ["PostKnockOutStatStageChangeAbAttr", true]]) {
      if (!p.hasAbilityWithAttr?.(attr)) continue;
      for (const a of [p.getAbility?.(), p.hasPassive?.() ? p.getPassiveAbility?.() : null]) {
        for (const x of a?.getAttrs?.(attr) ?? []) {
          const changes = whose
            ? [{ stat: typeof x.stat === "function" ? x.stat(p) : x.stat, stages: x.stages }]
            : typeof x.changes === "function" ? x.changes(p) : x.changes ?? [];
          for (const c of changes) if (c.stat >= Stat.ATK && c.stat <= Stat.SPD && c.stages) up[c.stat] = (up[c.stat] ?? 0) + c.stages;
          name ??= a.name;
          any ||= whose;
        }
      }
    }
  } catch { return null; }
  return Object.keys(up).length ? { up, ability: name, any } : null;
};
// The damage factor `n` KOs' worth of `boost` adds on stat `st`.
export const koStageFactor = (p, boost, n, st) => {
  const k = boost?.up?.[st] ?? 0;
  if (!k || !(n > 0)) return 1;
  const s0 = p?.isOnField?.() ? p.summonData?.statStages?.[st - 1] ?? 0 : 0;
  return stage(Math.max(-6, Math.min(6, s0 + k * n))) / stage(s0);
};
const STAT_ABBR = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
export const koBoostText = b => Object.entries(b.up).map(([st, n]) => `${n > 0 ? "+" : "−"}${Math.abs(n)} ${STAT_ABBR[st]}`).join(" ");
// What feeding `foe` one KO costs the fight still to come, in turns of ours.
const feedCost = (foe, others) => {
  const b = others > 0 ? koBoost(foe) : null;
  if (!b) return 0;
  return Object.entries(b.up).reduce((t, [st, n]) => t + Math.max(0, n) * ([Stat.DEF, Stat.SPDEF].includes(+st) ? 0.5 : 1), 0) * FEED_COST;
};
// A setting-up foe's damage on turn j (1 = this turn) against this turn's, as `j => factor`; null when it raises no
// attacking stat.
export const setupRamp = (foe, t) => {
  const g = t?.boost;
  if (!foe || !g || !(g[Stat.ATK] || g[Stat.SPATK]) || !t.moves.length) return null;
  const phys = t.moves.reduce((sum, m) => sum + m.p * (m.cat === "special" ? 0 : 1), 0) / (t.moves.reduce((sum, m) => sum + m.p, 0) || 1);
  const up = (st, j) => {
    const s0 = foe.summonData?.statStages?.[st - 1] ?? 0;
    return stage(Math.max(-6, Math.min(6, s0 + (g[st] ?? 0) * (j - 1)))) / stage(s0);
  };
  return j => phys * up(Stat.ATK, j) + (1 - phys) * up(Stat.SPATK, j);
};
// What a foe's setup this turn adds to its next two turns of hits on `me`, as a share of `me`'s max HP.
const setupDanger = (foe, t, me) => {
  const ramp = setupRamp(foe, t);
  if (!ramp) return 0;
  const mean = t.expected / Math.max(0.1, t.moves.reduce((sum, m) => sum + m.p, 0));
  return Math.min(1, (ramp(2) - 1 + ramp(3) - 1) * mean / me.getMaxHp());
};

const threatKoAt = (t, hp) => (!t ? 0 : hp <= 0 ? 1 : Math.min(1, t.moves.reduce((sum, m) => sum + m.p * koChanceAt(m, hp), 0)));
// Wave status tokens (game-code.md §8).
const statusTokens = (turn, foe, me) => {
  if (!foe || foe.isPlayer?.() || me.status?.effect) return [];
  return turn.facts.enemyModifiers.filter(m => m.constructor?.name === "EnemyAttackStatusEffectChanceModifier")
    .map(m => ({ effect: m.effect, q: Math.min(1, (m.chance ?? 0.025) * (m.getStackCount?.() ?? 1)) }))
    .filter(x => x.q > 0 && turn.mon(me).canTake(x.effect, foe));
};
// The share of an attempt a status cancels, by attempts since it landed (game-code.md §8).
const STATUS_SKIP = {
  [StatusEffect.SLEEP]: (a, early) => (early ? (a === 0 ? 2 / 3 : 0) : a === 0 ? 1 : a === 1 ? 2 / 3 : 0),
  [StatusEffect.FREEZE]: a => (a === 0 ? 3 / 4 : a === 1 ? 9 / 16 : 0),
};
// `by(x)`: P(`me` has a token's status after x landed hits); each token's `share` of that. Null when none can land.
export const tokenOdds = (turn, foe, me) => {
  const tokens = statusTokens(turn, foe, me);
  if (!tokens.length) return null;
  const perHit = 1 - tokens.reduce((keep, x) => keep * (1 - x.q), 1);
  const qSum = tokens.reduce((sum, x) => sum + x.q, 0);
  return {
    tokens: tokens.map(x => ({ ...x, share: x.q / qSum })),
    by: x => 1 - (1 - perHit) ** Math.max(0, x),
    early: !!me.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr"),
  };
};
// The turn-end HP change a token's status adds to `me`, by the shares. `heal(p)`: the turn-end HP change of `p`.
export const tokenShift = (odds, me, heal) => {
  const base = heal(me);
  return odds.tokens.reduce((sum, x) => sum + x.share * (heal(Object.create(me, { status: { value: { effect: x.effect, toxicTurnCount: 0 } } })) - base), 0);
};
// The share of `me`'s attempt on turn k that token statuses cancel. `by(t)`: P(statused by the end of turn t), t = 0
// before this fight. Sleep and freeze from before the fight are taken as worn off; paralysis stays.
export const attemptsLost = (odds, by, k, pFoeFirst) => {
  let lost = 0;
  for (const x of odds.tokens) {
    if (x.effect === StatusEffect.PARALYSIS) { lost += x.share / 8 * (pFoeFirst * by(k) + (1 - pFoeFirst) * by(k - 1)); continue; }
    if (!STATUS_SKIP[x.effect]) continue;
    const skip = a => (a < 0 ? 0 : STATUS_SKIP[x.effect](a, odds.early));
    for (let t = 1; t <= k; t++) lost += x.share * (by(t) - by(t - 1)) * (pFoeFirst * skip(k - t) + (1 - pFoeFirst) * skip(k - t - 1));
  }
  return Math.min(1, lost);
};
// `act(k)`: the share of `me`'s turn-k attempt that tokens leave standing; `para(k)`: P(paralysed by then). Null when
// no token can cancel anything.
export const tokenActs = (turn, foe, me, hitsPerTurn, pFoeFirst) => {
  const odds = hitsPerTurn > 0 ? tokenOdds(turn, foe, me) : null;
  if (!odds?.tokens.some(x => x.effect === StatusEffect.PARALYSIS || STATUS_SKIP[x.effect])) return null;
  const by = t => odds.by(hitsPerTurn * t);
  return {
    act: k => 1 - attemptsLost(odds, by, k, pFoeFirst),
    para: k => odds.tokens.filter(x => x.effect === StatusEffect.PARALYSIS).reduce((sum, x) => sum + x.share, 0) * by(k),
  };
};

// Item thieves (game-code.md §8).
const THIEVES = { ContactHeldItemTransferChanceModifier: "Grip Claw", TurnHeldItemTransferModifier: "Mini Black Hole" };
const transferable = p => (p.getHeldItems?.() ?? []).filter(m => m.isTransferable !== false);
const thieves = (foe, me) => (me.hasAbilityWithAttr?.("BlockItemTheftAbAttr") || !transferable(me).length ? []
  : (foe.getHeldItems?.() ?? []).filter(m => THIEVES[m.constructor?.name]));
// Expected Grip Claw steals per landed hit, Mini Black Hole steals per turn.
export const stealRates = (foe, me) => {
  let perHit = 0, perTurn = 0;
  for (const m of thieves(foe, me)) {
    const n = m.getStackCount?.() ?? 1;
    if (m.constructor.name === "TurnHeldItemTransferModifier") perTurn += n;
    else perHit += Math.min(1, (m.chance ?? 0.1) * n);
  }
  return perHit || perTurn ? { perHit, perTurn } : null;
};
// P(k steals) for k = 0..9, 9 taking the tail: `fixed` sure steals plus a Poisson count with mean `mean`.
export const stealCounts = (fixed, mean) => {
  const out = Array(10).fill(0);
  let pk = Math.exp(-mean), rest = 1;
  for (let k = 0; fixed + k < 9; k++) { out[fixed + k] = pk; rest -= pk; pk *= mean / (k + 1); }
  out[9] += Math.max(0, rest);
  return out;
};
// `me`'s turn-end HP change after k steals, k = 0..9, by `heal(p)`.
export const afterSteals = (me, heal) => {
  const items = me.getHeldItems?.() ?? [];
  const full = items.map(m => m.getStackCount?.() ?? m.stackCount ?? 1);
  const values = new Map();
  const value = st => {
    const key = st.join();
    if (!values.has(key)) {
      const held = items.flatMap((m, i) => (st[i] <= 0 ? [] : st[i] === full[i] ? [m] : [Object.create(m, { getStackCount: { value: () => st[i] }, stackCount: { value: st[i] } })]));
      values.set(key, heal(Object.create(me, { getHeldItems: { value: () => held } })));
    }
    return values.get(key);
  };
  let dist = new Map([[full.join(), { st: full, p: 1 }]]);
  const out = [value(full)];
  for (let k = 1; k <= 9; k++) {
    const next = new Map();
    for (const { st, p } of dist.values()) {
      const left = st.flatMap((n, i) => (n > 0 && items[i].isTransferable !== false ? [i] : []));
      const outs = left.length ? left.map(i => st.map((n, j) => (j === i ? n - 1 : n))) : [st];
      for (const ns of outs) {
        const e = next.get(ns.join());
        if (e) e.p += p / outs.length; else next.set(ns.join(), { st: ns, p: p / outs.length });
      }
    }
    dist = next;
    out.push([...dist.values()].reduce((sum, { st, p }) => sum + p * value(st), 0));
  }
  return out;
};

// `at(j)`: `me`'s turn-end HP change at the end of turn j (1 = this turn) of a fight with `foe`, `flat` when that never
// moves. It moves with Toxic, a status the foe's hits may hand it, and items the foe may steal.
export const turnEndCourse = (turn, me, foe, hitsPerTurn, dealt = 0) => {
  const base = healAtEnd(turn, me, dealt);
  const toxic = me.status?.effect === StatusEffect.TOXIC
    ? j => healAtEnd(turn, Object.create(me, { status: { value: { ...me.status, effect: StatusEffect.TOXIC, toxicTurnCount: (me.status.toxicTurnCount ?? 0) + j - 1 } } }), dealt)
    : null;
  const flat = toxic ? { base, flat: false, at: toxic } : { base, flat: true, at: () => base };
  if (!foe || !(hitsPerTurn >= 0)) return flat;
  const odds = hitsPerTurn > 0 ? tokenOdds(turn, foe, me) : null;
  const statusChange = odds ? tokenShift(odds, me, p => healAtEnd(turn, p, dealt)) : 0;
  const rates = stealRates(foe, me);
  const byCount = rates ? afterSteals(me, p => healAtEnd(turn, p, dealt)) : null;
  const items = byCount && byCount.some(v => v !== base)
    ? j => stealCounts(rates.perTurn * (j - 1), rates.perHit * hitsPerTurn * j).reduce((sum, p, k) => sum + p * (byCount[k] - base), 0)
    : null;
  if (!statusChange && !items) return flat;
  return { base, flat: false, at: j => (toxic ? toxic(j) : base) + (statusChange ? statusChange * odds.by(hitsPerTurn * j) : 0) + (items ? items(j) : 0) };
};
export const hitsOn = t => (t?.moves ?? []).reduce((sum, m) => sum + m.p * (m.acc ?? 1) * (m.hits ?? 1), 0);
// `heal` is a number, or a function of the turn.
const withDrain = (heal, drain) => (!drain ? heal : typeof heal === "function" ? j => heal(j) + drain : heal + drain);

// A threat's `koCurve` on `me` from `hp`, turn-end included. `dealt`: what we deal a turn (Shell Bell); `mult(j)`: its
// damage on turn j against the expected; `act(i)`: the chance its i-th attack goes off; `drain`: what our drain moves
// win back a turn, negative into Liquid Ooze.
export const foeCurve = (turn, t, me, hp, { dealt = 0, foe = null, mult = null, act = () => 1, start = null, drain = 0 } = {}) => {
  const course = turnEndCourse(turn, me, foe, t ? hitsOn(t) : -1, dealt);
  const attacks = !!t && t.expected > 0;
  const ramp = setupRamp(foe, t);
  return koCurve(turn.mon(me), attacks ? t.use ?? [{ d: t.expected, p: 1 }] : [{ d: 0, p: 1 }], {
    hp, start, act, turnEnd: withDrain(course.flat ? course.base : course.at, drain),
    scale: mult || ramp ? i => (mult ? mult(i + 1) : 1) * (ramp ? ramp(i + 1) : 1) : undefined,
    firstKo: attacks && !start ? threatKoAt(t, hp) * act(0) : null,
  });
};
const foeTurns = (turn, t, me, hp, opts = {}) => koTurns(foeCurve(turn, t, me, hp, opts).by);

// One-on-one from now: `me` repeats `pm` into `foe` while `foe` answers with its likely moves. Turn 1 is exact; later
// turns race the two `koCurve`s. Options: `hp` (ours after an incoming hit); `after` (an earlier exchange's `turn1`,
// both curves starting from its branches, where the exact odds don't hold); `free` (the foe switches in and doesn't
// act); `next` (it re-picks against us next turn); `outcome` (our move's record); `foeAct(i)` (the share of its i-th
// attempt a status we gave it leaves standing); `field` and `fieldAct(i)` (in a double, the foe whose hits price the
// race when that isn't the target, #320). `cost`: our max HP the move spends, plus a little for a lock-in.
// `turn1`: P(we KO first), P(they do), and the HP branches each side stands on if neither does, each summing to 1.
export const exchange = (turn, me, pm, foe, opts = {}) => {
  const hp = opts.hp ?? me.hp;
  const after = opts.after ?? null;
  const exact = !after;
  const mine = opts.outcome ?? planOutcomes(turn, me, foe).find(o => o.name === pmName(pm)) ?? null;
  const mt = mine?.traits ?? {};
  const t = threatFrom(turn, foe, me, pm, { next: !!opts.next });
  // Only what comes at us goes field-wide: whether our move works, the target's Protect, our flinch and the bars we
  // break stay the target's own (#320).
  const fieldFoe = opts.field && opts.field !== foe ? opts.field : foe;
  const aimedAtField = fieldFoe === foe;
  const tThey = aimedAtField ? t : threatFrom(turn, fieldFoe, me, pm, { next: !!opts.next });
  // A target that isn't attacking still leaves us the rest of the field to survive.
  const freeThey = opts.free && aimedAtField;
  const pFirst = t ? 1 - (t.pKo > 0 ? t.koFirst : t.first) : 1;
  const pF = opts.free ? 1 : pFirst;
  const pFirstField = aimedAtField ? pFirst : tThey ? 1 - (tThey.pKo > 0 ? tThey.koFirst : tThey.first) : 1;
  const pFField = freeThey ? 1 : pFirstField;
  // Our move doing its job (Focus Punch not hit first, Sucker Punch meeting an attack); `steady`: the part that recurs
  // on later turns.
  const foeAttacks = opts.free || !t ? 0 : Math.min(1, t.moves.reduce((sum, m) => sum + m.p, 0));
  const needs = (mt.interrupt ? 1 - foeAttacks * (1 - pF) : 1) * (mt.needsAttack ? foeAttacks * pF : 1);
  // This turn only: the replay of later turns can't see the first Protect, and a second in a row mostly fails.
  const guard = opts.free || opts.next || after || mine?.bypassProtect ? 0 : protectChance(turn, foe);
  // King's Rock (game-code.md §8).
  const flinch = Math.min(1, 0.1 * heldStack(foe, "FlinchChanceModifier")) * foeAttacks;
  const steady = (me.status?.effect === StatusEffect.PARALYSIS ? 7 / 8 : 1) * needs * (1 - flinch * (1 - pF));
  const acts = opts.free || !t ? null : tokenActs(turn, foe, me, hitsOn(t), 1 - pF);
  const now = actChance(me, pm?.getMove?.() ?? null, !!opts.next) * needs * (mine?.semi ? 1 - pF : 1) * (acts ? acts.act(1) : 1) * (1 - guard);
  const ourFlinch = opts.free ? 0 : Math.min(1, (mine?.flinch ?? 0) * (mine?.acc ?? 1));
  const maxHp = me.getMaxHp?.() ?? hp;
  const bars = bossBarsLeft(foe);
  const trainerBoss = foe.hasTrainer?.() ?? !!turn.facts.trainer;
  let turnsWe = 9, hitsWe = 9, delay = 0, selfSpent = 0, defUp = 1, foeMult = null, foeAfter1 = after?.foe ?? null;
  let weBy = () => 0, qWe = 0, confusion = 0;
  if (mine?.expected > 0) {
    const atkStat = mine.cat === "special" ? Stat.SPATK : Stat.ATK;
    const drop = mt.drops?.[atkStat] ?? 0;
    const s0 = me.summonData?.statStages?.[atkStat - 1] ?? 0;
    const course = turnEndCourse(turn, foe, me, steady * (mine.acc ?? 1) * ((mine.dist ?? []).reduce((sum, d) => sum + d.n * d.p, 0) || 1), t?.expected ?? 0);
    const heal = withDrain(course.flat ? course.base : course.at, t?.drain ?? 0);
    const defStat = mine.cat === "special" ? Stat.SPDEF : Stat.DEF;
    const defUpBy = t?.boost?.[defStat] ?? 0;
    const d0 = foe.summonData?.statStages?.[defStat - 1] ?? 0;
    const scale = i => stage(Math.max(-6, s0 + drop * i)) / stage(s0)
      * (defUpBy ? stage(d0) / stage(Math.max(-6, Math.min(6, d0 + defUpBy * i))) : 1);
    delay = actDelay(me) + (mine.semi && pF >= 0.5 ? 1 : 0);
    const nowUse = !mt.charge && delay === 0;
    qWe = nowUse ? (mine.pKo ?? 0) * now : 0;
    const curve = koCurve(turn.mon(foe), useOf(mine), {
      scale, turnEnd: heal, cat: mine.cat,
      act: i => (i === 0 && nowUse ? now : steady * (acts ? acts.act(i + 1) : 1)),
      firstKo: exact && nowUse ? qWe : null, start: after?.foe,
    });
    const perChunk = curve.perChunk;
    if (!exact && nowUse) qWe = curve.by[0];
    hitsWe = koTurn(curve.by);
    const cycle = mt.recharge || mt.noRepeat ? 2 * hitsWe - 1 : mt.charge ? 2 * hitsWe : hitsWe;
    const confusedHits = mt.lock ? Math.min(Math.max(0, hitsWe - 2), 2) : 0;
    confusion = confusedHits * 0.5;
    turnsWe = mt.once && hitsWe > 1 ? 9 : Math.min(9, Math.ceil(delay + cycle + confusedHits * 0.5));
    const usesBy = j => {
      const k = j - delay;
      if (k <= 0) return 0;
      const n = mt.charge ? Math.floor(k / 2) : mt.recharge || mt.noRepeat ? Math.ceil(k / 2) : k;
      return Math.min(9, mt.once ? Math.min(1, n) : n);
    };
    weBy = j => (usesBy(j) ? curve.by[usesBy(j) - 1] : 0);
    if (nowUse) foeAfter1 = curve.after1;
    // A wild boss's boosts as our hits break its bars (game-code.md §8): on the breaking turn its hit is boosted only
    // if we moved first.
    if (bars > 1 && t?.moves.length && !trainerBoss) {
      const phys = t.moves.reduce((sum, m) => sum + m.p * (m.cat === "special" ? 0 : 1), 0) / (t.moves.reduce((sum, m) => sum + m.p, 0) || 1);
      const [fa, fs] = [Stat.ATK, Stat.SPATK].map(st => turn.mon(foe).bars(st, bars, true));
      const pace = cycle / Math.max(1, hitsWe);
      let hitsSoFar = 0;
      const breaks = perChunk.slice(0, bars - 1).map(n => Math.ceil(delay + (hitsSoFar += n) * pace - 1e-9));
      const factor = b => phys * fa[b] + (1 - phys) * fs[b];
      foeMult = j => {
        const before = breaks.filter(x => x < j).length;
        return breaks.includes(j) ? pF * factor(before + 1) + (1 - pF) * factor(before) : factor(before);
      };
    }
    const confusionHit = confusedHits && ((2 * me.level / 5 + 2) * 40 * stat(me, Stat.ATK) / stat(me, Stat.DEF) / 50 + 2) * 0.925;
    selfSpent = (mine.self ?? 0) * Math.min(hitsWe, turnsWe) + confusedHits * 1.5 * confusionHit / 3;
    const soften = st => (mt.drops?.[st] ? stage(me.summonData?.statStages?.[st - 1] ?? 0) / stage(Math.max(-6, (me.summonData?.statStages?.[st - 1] ?? 0) + mt.drops[st])) : 1);
    if (hitsWe > 1 && (mt.drops?.[Stat.DEF] || mt.drops?.[Stat.SPDEF])) defUp = 1 + ((soften(Stat.DEF) + soften(Stat.SPDEF)) / 2 - 1) * (hitsWe - 1) / hitsWe;
  }
  const selfKo = mt.selfKo === "always" ? 1 : mt.selfKo === "onHit" ? mine?.acc ?? 1 : 0;
  const budget = hp - selfSpent;
  const foeT = defUp !== 1 && tThey ? { ...tThey, expected: tThey.expected * defUp } : tThey;
  const foeAct = i => (1 - ourFlinch * (i === 0 ? pF * now : mt.once ? 0 : pFirst * steady)) * (opts.foeAct ? opts.foeAct(i) : 1);
  const theirAct = aimedAtField ? foeAct : i => (opts.fieldAct ? opts.fieldAct(i) : 1);
  const mult = (aimedAtField && foeMult) || defUp !== 1 ? j => (aimedAtField && foeMult ? foeMult(j) : 1) * defUp : null;
  const myStart = after?.me.map(x => ({ ...x, hp: x.revived ? x.hp : x.hp - selfSpent })).filter(x => x.hp > 0);
  const ourDrain = (mine?.drain ?? 0) * (mine?.expected ?? 0) * steady;
  const theirs = budget > 0 ? foeCurve(turn, foeT, me, budget, {
    dealt: mine?.uncapped ?? mine?.expected ?? 0, foe: fieldFoe, mult, act: theirAct, start: myStart?.length ? myStart : null, drain: ourDrain,
  }) : null;
  const turnsFoe = theirs ? koTurn(theirs.by) : Math.max(1, Math.min(turnsWe, 9));
  const lag = freeThey ? 1 : 0;
  let turnsThey = Math.min(9, turnsFoe + lag);
  if (selfKo >= 0.5) turnsThey = Math.min(turnsThey, delay + 1);
  const theyBy = j => {
    const k = Math.min(9, j - lag);
    const by = theirs ? (k >= 1 ? theirs.by[k - 1] : 0) : j >= turnsFoe + lag ? 1 : 0;
    return 1 - (1 - by) * (1 - (j >= delay + 2 ? selfKo : 0));
  };
  const qThey = freeThey ? 0 : exact ? threatKoAt(tThey, hp) * theirAct(0) : theirs?.by[0] ?? 1;
  const weFirst = pFField * qWe + (1 - pFField) * (1 - qThey) * qWe * (1 - flinch);
  const theyFirst = (1 - pFField) * qThey + pFField * (1 - qWe) * qThey;
  let pLast = pFirstField;
  const pPara = acts && turnsWe < 9 ? acts.para(turnsWe - 1) : 0;
  if (pPara > 0) {
    const slowed = { id: { value: `${me.id}~paralysed` }, status: { value: { effect: StatusEffect.PARALYSIS } } };
    if (typeof me.getEffectiveStat !== "function") slowed.getEffectiveStat = { value: i => stat(me, i) / (i === Stat.SPD ? 2 : 1) };
    const tp = threatFrom(turn, fieldFoe, Object.create(me, slowed), pm, { next: !!opts.next });
    pLast = (1 - pPara) * pFirstField + pPara * (tp ? 1 - (tp.pKo > 0 ? tp.koFirst : tp.first) : pFirstField);
  }
  const speedUp = tThey?.boost?.[Stat.SPD] ?? 0;
  if (speedUp > 0 && turnsWe > 1 && turnsWe < 9 && !((mine?.priority ?? 0) > 0) && pLast > 0) {
    const mySpe = turn.mon(me).speed, foeSpe = turn.mon(fieldFoe).speed, s5 = fieldFoe.summonData?.statStages?.[Stat.SPD - 1] ?? 0;
    let need = 0;
    while (s5 + need < 6 && foeSpe * stage(s5 + need) / stage(s5) <= mySpe) need++;
    if (need > 0 && foeSpe * stage(s5 + need) / stage(s5) > mySpe) pLast *= Math.max(0, 1 - speedUp * (turnsWe - 1) / need);
  }
  // After turn 1 the two sides' KO hazards are taken as independent; on a turn both would KO, the order decides.
  const hazard = (F, j) => (F(j - 1) >= 1 ? 1 : Math.max(0, (F(j) - F(j - 1)) / (1 - F(j - 1))));
  let pWe = weFirst, pThey = theyFirst, standing = Math.max(0, 1 - weFirst - theyFirst);
  for (let j = 2; j <= 9 && standing > 1e-6; j++) {
    const a = hazard(weBy, j), b = hazard(theyBy, j);
    pWe += standing * a * (1 - b + b * pLast);
    pThey += standing * b * (1 - a + a * (1 - pLast));
    standing *= (1 - a) * (1 - b);
  }
  // Expected turns, for scoring; `turnsWe` / `turnsThey` are the likely ones the panel shows.
  const expTurns = F => Math.min(9, 1 + Array.from({ length: 8 }, (_, j) => 1 - F(j + 1)).reduce((t, x) => t + x, 0));
  const taken = turnsWe >= 9 ? turnsThey : Math.max(0, turnsWe - pLast - lag);
  const boosted = foeMult && taken > 0 ? Array.from({ length: Math.ceil(taken) }, (_, i) => foeMult(i + 1)).reduce((sum, x) => sum + x, 0) / Math.ceil(taken) : 1;
  const hpLeft = Math.max(0, Math.min(maxHp, hp - (tThey?.expected ?? 0) * defUp * boosted * taken - selfSpent + ourDrain * Math.min(taken, turnsWe))) * (1 - selfKo);
  return {
    pWeKoFirst: Math.min(1, Math.round(pWe * 1e9) / 1e9), pTheyKoFirst: Math.min(1, Math.round(pThey * 1e9) / 1e9),
    expectedHpLeft: Math.round(hpLeft),
    turnsWe, turnsThey, pFirst, hitsWe,
    eTurnsWe: Math.min(9, expTurns(weBy) + confusion), eTurnsThey: expTurns(theyBy),
    cost: Math.min(1, (selfSpent + selfKo * Math.max(0, hp - selfSpent)) / maxHp) + (mt.lock ? 0.1 : 0),
    turn1: (() => {
      // The curve front-loaded every use's self-cost, and turn 1 has only paid one.
      const me1 = freeThey || !theirs ? [{ hp, p: 1 }]
        : theirs.after1.map(x => ({ ...x, hp: x.revived ? x.hp : Math.min(hp, x.hp + selfSpent - (mine?.self ?? 0)) }));
      return {
        we: weFirst, they: theyFirst, me: me1, hp: me1.reduce((t, x) => t + x.p * x.hp, 0),
        foe: foeAfter1 ?? [{ hp: foe.hp, p: 1 }],
      };
    })(),
  };
};

// Whether `a`, a move trap of `foe`, bites `move`. Intimidate only on a foe coming in — on the field its drop is already
// in our stages — and never Sturdy, which the KO model counts. The slot line and the foe rows both ask here, so they
// agree.
const bites = (a, foe, move) => {
  const mv = move?.pm?.getMove?.();
  if (!mv) return false;
  const type = move.type, phys = move.cat === "physical";
  return ABILITY_IMMUNE[a] === type
    || (ABILITY_IMMUNE_FLAG[a] && moveHasFlag(mv, ABILITY_IMMUNE_FLAG[a]))
    || (a === "Thick Fat" && (type === "Fire" || type === "Ice")) || (a === "Heatproof" && type === "Fire")
    || (a === "Fluffy" && (phys || type === "Fire")) || (a === "Intimidate" && phys && !foe.isOnField?.())
    || a === "Wonder Guard"
    || (CONTACT_PUNISH.includes(a) && moveHasFlag(mv, MoveFlags.MAKES_CONTACT))
    || (["Filter", "Solid Rock", "Prism Armor"].includes(a) && typesOf(foe).reduce((x, d) => x * vs(type, d), 1) >= 2);
};
// The move traps the slot's own move runs into, on the foes it actually hits.
const trapsOn = (p, active) => {
  if (!p.move?.pm?.getMove?.() || p.self || p.target === null || p.target === undefined) return [];
  const foes = p.target === "both" ? active : [active[p.target]];
  return [...new Set(foes.filter(Boolean).flatMap(foe => abilitiesOf(foe).filter(a => MOVE_TRAPS.has(a) && bites(a, foe, p.move))))];
};

// Who should be on the field now and what each slot does. `active`: the foes our moves land on this turn, a predicted
// switch-in standing in for the mon leaving; `attackers`: the foes that attack this turn; `freeSwitch`: the game
// offers a switch before the turn (game-code.md §9); `locked`: slot 0's command is in, and only its partner is searched.
export const fieldPlan = (turn, party, active, double, attackers = active, { freeSwitch = false, locked = null, team = null } = {}) => {
  // Two slots whenever two of us can stand, even against one foe; `pair`: two foes to aim at.
  const slots = double && party.length >= 2 ? 2 : 1;
  const pair = double && active.length === 2;
  const current = party.filter(p => p.isOnField?.());
  const lock = slots === 2 && locked && party.includes(locked.switchIn ?? locked.me) ? locked : null;
  // The scorers below take a hypothesis (#262, CONTEXT.md, `Hypothesis`) and shadow `turn` with its turn; it is read
  // only through these two: `turnOf`, the turn to ask, and `actOn`, the share of a foe's attempts the status leaves.
  const now = turn;
  const turnOf = hyp => hyp?.at ?? now;
  const actOn = (hyp, mon) => hyp?.lost?.find(x => x.mon === mon)?.act ?? null;

  // A voluntary switch-in takes the hits aimed at the mon leaving (game-code.md §9).
  const inMemo = new Map();
  const incoming = me => {
    if (!inMemo.has(me)) {
      const ts = attackers.map(f => threatFrom(turn, f, me)).filter(Boolean).sort((a, b) => b.expected - a.expected);
      // Live threats already split single-target moves between our slots; the approximation takes the worst foe
      // plus half the other.
      const dmg = ts.some(t => t.live) ? ts.reduce((sum, t) => sum + t.expected, 0) : (ts[0]?.worst ?? 0) + (ts[1]?.worst ?? 0) * 0.5;
      const ko = 1 - ts.reduce((keep, t) => keep * (1 - threatKoAt(t, me.hp)), 1);
      inMemo.set(me, { dmg, ko });
    }
    return inMemo.get(me);
  };

  // `entering`: switched in by choice this turn, so it takes the incoming hit and moves next turn. `mine`: slot 0's
  // locked command, when `me` is that slot.
  const options = (me, entering, mine = null, hyp = null) => {
    // `hyp`: `at`, the state written on; `bump`, the HP a heal puts back; `lost`, the attempts the status costs each
    // foe, index 0 this turn's. Under it the search stops at this turn, and `incoming` stays on the real turn: the
    // entry hit lands before the status does.
    const turn = turnOf(hyp);
    const assumed = !!hyp;
    const inc = entering ? incoming(me) : { dmg: 0, ko: 0 };
    const hp = Math.min(me.getMaxHp?.() ?? Infinity, me.hp - inc.dmg + (hyp?.bump ?? 0));
    const beforeActing = hp <= 0 ? 1 : 1 - active.reduce((keep, f) => {
      const t = threatFrom(turn, f, me, null, { next: true });
      return keep * (1 - threatKoAt(t, hp) * (t?.koFirst ?? 0));
    }, 1);
    const lostChance = entering ? inc.ko + (1 - inc.ko) * beforeActing : 0;
    if (hp <= 0 || lostChance >= 0.25) return [{ me, move: null, target: null, turns: 9, hits: 9, score: -99, hp: 0 }];
    const lost = entering ? 1 : 0;
    const free = f => !entering && !attackers.includes(f);
    // A mon not yet on the field faces what the foe picks for it, not what it picked against the current field.
    const next = entering || !me.isOnField?.();
    // The soonest any foe fells this mon: the same for all its options, so it sets their scale and cancels between
    // them. Not `danger`, which is one foe's share of our health this turn (#307, #320).
    const lasts = Math.min(...active.map(f => Math.min(9, foeTurns(turn, threatFrom(turn, f, me, null, { next }), me, hp, { foe: f, act: actOn(hyp, f) ?? undefined }) + (free(f) ? 1 : 0))));
    // The foe whose hits price the race wherever this mon aims (#320).
    const worst = !pair ? null : attackers.reduce((b, f) => {
      const x = threatFrom(turn, f, me, null, { next });
      return !b || (x?.expected ?? 0) > (threatFrom(turn, b, me, null, { next })?.expected ?? 0) ? f : b;
    }, null);
    const trade = (o, f) => exchange(turn, me, o.pm, f, { hp, outcome: o, free: free(f), next, foeAct: actOn(hyp, f), field: worst, fieldAct: actOn(hyp, worst) });
    const last = entering ? null : lastMoveOf(me);
    const cost = o => -(o.benefit ?? 0) * AI_POINT - (last != null && o.pm?.moveId === last ? KEEP_BONUS : 0);
    const feed = f => feedCost(f, party.length - 1);
    const one = (o, fi) => {
      const x = trade(o, active[fi]);
      const turns = x.turnsWe + lost;
      return { me, move: o, target: fi, turns, hits: x.turnsWe, score: lasts - x.eTurnsWe - lost + (x.pWeKoFirst - x.pTheyKoFirst) - (x.cost ?? 0) - cost(o) - feed(active[fi]) * x.pTheyKoFirst, hp, trade: x };
    };
    // A hit whose target has already fainted lands on the survivor carrying the move chosen for the target
    // (CONTEXT.md, `Spare hit`; game-code.md §18): `redirScore` is what it is worth there, and `mix` prices the
    // blend (#236). A move the survivor is immune to scores the empty turn.
    const withRedirScore = x => {
      if (!pair || x.play || typeof x.target !== "number" || !x.move?.pm) return x;
      const oi = 1 - x.target;
      const y = planOutcomes(turn, me, active[oi]).find(z => z.name === x.move.name);
      // At depth 2 like every option: scored flat, carrying the wrong move cost a whole fight, and focusing won exactly
      // when the redirect carried the better move, whatever the odds the partner's hit landed (#283).
      if (!(y?.expected > 0)) return { ...x, redirScore: lasts - 9 };
      const z = one(y, oi);
      return { ...x, redirScore: (entering || assumed ? z : deeper(z)).score };
    };
    // Depth 2: turn 1 exact, then the best follow-up from the HP it leaves, against the foe's re-pick. Kept when it
    // beats repeating the move by `DEPTH_GAIN`; `then` names the follow-up.
    const deeper = x => {
      const o = x.move, f = active[x.target], t1 = x.trade?.turn1;
      if (!t1 || o.traits?.charge || o.traits?.recharge || o.traits?.lock || o.traits?.selfKo || o.semi || actDelay(me)) return x;
      const standing = 1 - t1.we - t1.they;
      if (standing < 0.05) return x;
      // The joint scoring only sees this turn's hits, so a follow-up that hits our partner is out.
      const pool = planOutcomes(turn, me, f).filter(y => y.expected > 0 && !(pair && y.spread) && !(slots === 2 && hitsAlly(y)) && !(y === o && o.traits?.once));
      const cands = [...new Set([...[...pool].sort((a, b) => b.expected - a.expected).slice(0, 2), ...pool.filter(y => (y.priority ?? 0) > 0).slice(0, 1),
        ...(pool.includes(o) ? [o] : [])])];
      const value = y => {
        const x2 = exchange(turn, me, y.pm, f, { hp: t1.hp, after: t1, outcome: y, next: true, field: worst });
        return { y, x2, v: x2.eTurnsThey - x2.eTurnsWe + x2.pWeKoFirst - x2.pTheyKoFirst - (x2.cost ?? 0) };
      };
      const tried = cands.map(value);
      const best = tried.reduce((b, t) => (!b || t.v > b.v ? t : b), null);
      if (!best || best.y === o) return x;
      const scoreOf = ({ x2 }) => {
        const eTurns = 1 + (1 - t1.we) * x2.eTurnsWe;
        const edge = t1.we + standing * x2.pWeKoFirst - (t1.they + standing * x2.pTheyKoFirst);
        const spent = Math.min(1, (o.self ?? 0) / (me.getMaxHp?.() || hp)) + (x2.cost ?? 0);
        return lasts - eTurns - lost + edge - spent - cost(o) - feed(f) * (t1.they + standing * x2.pTheyKoFirst);
      };
      const score = scoreOf(best);
      const { y, x2 } = best;
      if (!(score > x.score + DEPTH_GAIN)) return x;
      const hits = t1.we >= 0.5 ? 1 : Math.min(9, 1 + x2.turnsWe);
      return { ...x, turns: hits + lost, hits, score, then: y };
    };
    // A spread move, on every foe it actually hits: one it can't touch adds nothing rather than sinking the option.
    // `each`: turns to KO each foe, 9 for one untouched. Takes the name, not a record: records differ per foe, and
    // picking one up front read a double as one foe.
    const both = name => {
      const os = active.map(f => planOutcomes(turn, me, f).find(x => x.name === name));
      const xs = os.map((y, i) => (y?.expected > 0 ? trade(y, active[i]) : null));
      const hit = xs.flatMap((x, i) => (x ? [{ x, o: os[i] }] : []));
      if (!hit.length) return null;
      const each = xs.map(x => x?.turnsWe ?? 9);
      const hits = Math.max(...hit.map(({ x }) => x.turnsWe));
      if (hits + lost >= 9) return null;
      const edge = Math.min(...xs.flatMap((x, i) => (x ? [x.pWeKoFirst - x.pTheyKoFirst - (x.cost ?? 0) - feed(active[i]) * x.pTheyKoFirst] : [])));
      const slow = Math.max(...hit.map(({ x }) => x.eTurnsWe));
      const rep = hit[0].o;
      const both0 = hit.length > 1 ? { ...rep, benefit: Math.max(...hit.map(({ o }) => o.benefit ?? 0)) } : rep;
      return { me, move: rep, target: "both", turns: hits + lost, hits, each,
        score: lasts - slow - lost + (hit.length > 1 ? 1 : 0) + edge - cost(both0), hp };
    };
    // What a status play is before it is scored, in either battle: the exchange it shares with an attack, how often it
    // works, and its note. Null below a twentieth, so both callers drop it.
    const playStart = (info, play, fi) => {
      const f = active[fi];
      const pm = info.pm, mv = pm.getMove();
      const x1 = exchange(turn, me, pm, f, { hp, free: free(f), next });
      const pF = free(f) ? 1 : x1.pFirst;
      const t = threatFrom(turn, f, me, pm, { next });
      const aimed = !play.self;
      const guard = aimed && !info.bypassProtect && !free(f) && !next ? protectChance(turn, f) : 0;
      const kingsRock = free(f) || !t ? 0 : Math.min(1, 0.1 * heldStack(f, "FlinchChanceModifier")) * Math.min(1, t.moves.reduce((q, m) => q + m.p, 0));
      const works = actChance(me, mv, next) * (1 - kingsRock * (1 - pF)) * (aimed ? (1 - guard) * info.acc * (info.e > 0 && !info.bounce ? 1 : 0) : 1);
      if (!(works >= 0.05)) return null;
      return {
        f, pm, mv, t, x1, pF, works, maxHp: me.getMaxHp?.() ?? hp,
        keep: last != null && pm.moveId === last ? KEEP_BONUS : 0,
        effect: `${play.note}${aimed && works < 0.995 ? ` ${Math.round(works * 100)}%` : ""}`,
      };
    };
    // A single battle's status play: turn 1 an `exchange` in which we deal nothing, then the best attack on the state
    // the play makes (`turn.assuming`), scored like a depth-2 line less `STATUS_COST`.
    const playOption = (info, play, fi) => {
      const start = playStart(info, play, fi);
      if (!start) return null;
      const { f, pm, mv, t, x1, pF, works, maxHp } = start;
      const t1 = x1.turn1;
      let they = t1.they, mine1 = t1.me;
      if (play.kind === "heal") {
        // Healed after its hit when it moves first, else before it, which can lift us out of this turn's KO.
        const room = Math.max(0, maxHp - hp);
        they = (1 - pF) * t1.they + pF * (works * threatKoAt(t, Math.min(maxHp, hp + play.amount)) + (1 - works) * t1.they);
        mine1 = t1.me.flatMap(b => [{ ...b, p: b.p * (1 - works) },
          { ...b, hp: Math.min(maxHp, b.hp + pF * Math.min(play.amount, room) + (1 - pF) * play.amount), p: b.p * works }]);
      } else if (play.skip0 > 0) {
        const c1 = pF * works * play.skip0;
        they = t1.they * (1 - c1);
        const standing = Math.max(1e-9, 1 - they);
        mine1 = [{ hp, p: c1 / standing }, ...t1.me.map(b => ({ ...b, p: b.p * (1 - c1) * (1 - t1.they) / standing }))];
      }
      if (play.hpCost) mine1 = mine1.map(b => (b.revived ? b : { ...b, hp: Math.max(1, b.hp - play.hpCost) }));
      const standing = 1 - they;
      if (standing < 0.05) return null;
      const mass = mine1.reduce((sum, b) => sum + b.p, 0) || 1;
      const t1p = { ...t1, we: 0, they, me: mine1, hp: mine1.reduce((sum, b) => sum + b.p * b.hp, 0) / mass };
      // With no attack to follow, `exchange` on a null move prices the foe wearing us down on the state the play made:
      // bailing here left a slot with no damaging move a dead end (#263).
      const follow = patches => {
        const t2 = patches ? turn.assuming(patches) : turn;
        const pool = planOutcomes(t2, me, f).filter(y => y.expected > 0 && !y.traits?.once);
        const cands = [...new Set([...[...pool].sort((a, b) => b.expected - a.expected).slice(0, 2), ...pool.filter(y => (y.priority ?? 0) > 0).slice(0, 1)])];
        let best = null;
        for (const y of cands.length ? cands : [null]) {
          const x2 = exchange(t2, me, y?.pm ?? null, f, { hp: t1p.hp, after: t1p, outcome: y, next: true, foeAct: patches && play.foeAct ? play.foeAct(pF) : null });
          const v = x2.eTurnsThey - x2.eTurnsWe + x2.pWeKoFirst - x2.pTheyKoFirst - (x2.cost ?? 0);
          if (!best || v > best.v) best = { y, x2, v };
        }
        return best;
      };
      const landed = follow(play.patches ?? null);
      const w = play.patches ? works : 1;
      const missed = landed && w < 1 ? follow(null) : null;
      if (!landed || (w < 1 && !missed)) return null;
      const mix = k => w * landed.x2[k] + (missed ? (1 - w) * missed.x2[k] : 0);
      const eTurns = 1 + mix("eTurnsWe");
      const edge = standing * (mix("pWeKoFirst") - mix("pTheyKoFirst")) - they - feed(f) * (they + standing * mix("pTheyKoFirst"));
      const spent = (play.hpCost ?? 0) / maxHp + mix("cost");
      const bonus = play.kind === "hazard" ? play.value * works : 0;
      const nudge = turn.benefit(me, f, mv) * AI_POINT;
      const hits = Math.min(9, 1 + landed.x2.turnsWe);
      return {
        me, move: { name: info.name, type: info.type, cat: "status", pm, expected: 0, notes: [] }, target: fi, self: !!play.self,
        turns: hits + lost, hits, score: lasts - eTurns - lost + edge - spent + start.keep + bonus + nudge - STATUS_COST, hp, then: landed.y,
        effect: start.effect,
      };
    };
    // A double's status play is priced by the field search against the partner's pick (#262), not by `follow()`, which
    // would weigh it against one foe's whole damage. `hits` is filled in by the caller.
    const playCandidate = (info, play, fi) => {
      const start = playStart(info, play, fi);
      if (!start) return null;
      const { f, mv, pF, works, maxHp } = start;
      const benefit = turn.benefit(me, f, mv);
      // The attempts the status costs the foe, index 0 this turn's: `skip0` when we move first, `foeAct` after.
      const skipNow = pF * (play.skip0 ?? 0);
      const later = play.foeAct ? play.foeAct(pF) : null;
      const act = skipNow > 0 || later ? i => (i === 0 ? 1 - skipNow : later ? later(i - 1) : 1) : null;
      return {
        me, move: { name: info.name, type: info.type, cat: "status", pm: start.pm, expected: 0, notes: [] }, target: fi, self: !!play.self,
        play, works, rank: benefit * works, hp, turns: 9, hits: 9, foe: f, act,
        heal: play.kind === "heal" ? Math.min(play.amount, Math.max(0, maxHp - hp)) : 0,
        score: -1 - (play.hpCost ?? 0) / maxHp + start.keep + (play.kind === "hazard" ? play.value * works : 0) + benefit * AI_POINT - STATUS_COST,
        effect: start.effect,
      };
    };
    const plays = fi => {
      if (assumed || entering || !turn.live) return [];
      const f = active[fi];
      // A game read that fails on a written-on state drops that option, not the panel.
      return turn.statusMoves(me, f).map(info => {
        try {
          const play = statusPlay(turn, me, f, info);
          if (!play) return null;
          return slots === 1 ? playOption(info, play, fi) : playCandidate(info, play, fi);
        } catch { return null; }
      }).filter(Boolean);
    };
    if (mine) {
      // A move the planner can't score (status, Struggle) is shown as chosen and aims nowhere.
      const name = pmName(mine.pm) || "Struggle";
      const aimed = mine.target === "both" ? 0 : mine.target;
      const o = mine.target == null ? null : planOutcomes(turn, me, active[aimed]).find(x => x.name === name);
      const p = mine.target === "both" && pair ? both(name) : o && one(o, aimed);
      const mv = mine.pm?.getMove?.();
      const bare = { me, move: { name, type: TYPES[mv?.type] ?? null, cat: mv?.category === MoveCategory.STATUS ? "status" : null, pm: mine.pm, expected: 0 }, target: null, turns: 9, hits: 9, score: 0, hp };
      return [withRedirScore({ ...(p ?? bare), locked: true })];
    }
    const out = [];
    active.forEach((f, fi) => {
      // Besides the best, the best without a drawback or a hit on our partner (`clean`): the pair's score may prefer
      // it. Against two foes a spread move is only the "both" option.
      let best = null, clean = null;
      const better = (a, b) => !a || b.score > a.score || (b.score === a.score && b.move.expected > a.move.expected);
      const scored = planOutcomes(turn, me, f).filter(o => o.expected > 0 && !(pair && o.spread)).map(o => one(o, fi));
      const deep = assumed ? [] : slots === 1 ? scored : [...[...scored].sort((a, b) => b.score - a.score).slice(0, 3),
        ...scored.filter(x => x.move.traits?.once || x.move.flinch > 0 || (x.move.priority ?? 0) > 0)];
      for (const x of scored.map(x => (entering || !deep.includes(x) ? x : deeper(x)))) {
        const o = x.move;
        if (better(best, x)) best = x;
        if (!drawback(o) && !(slots === 2 && hitsAlly(o)) && better(clean, x)) clean = x;
      }
      if (slots === 1) for (const x of plays(fi)) {
        if (better(best, x)) best = x;
        if (better(clean, x)) clean = x;
      }
      if (best) out.push(withRedirScore(best));
      if (clean && clean !== best) out.push(withRedirScore(clean));
    });
    if (pair) {
      // Every spread move that hits *either* foe: enumerating `active[0]` alone loses one that foe is immune to.
      const named = new Set();
      for (const f of active) {
        for (const o of planOutcomes(turn, me, f)) {
          if (!o.spread || !(o.expected > 0) || named.has(o.name)) continue;
          named.add(o.name);
          const p = both(o.name);
          if (p) out.push(p);
        }
      }
    }
    // A double's status plays ride alongside the attacks for the field search to price (#262); a self-targeted one
    // once, not once per foe.
    if (slots === 2 && !assumed && !entering) {
      const cands = [], seen = new Set();
      active.forEach((f, fi) => {
        for (const x of plays(fi)) {
          const k = x.self ? `self|${x.move.name}` : `${fi}|${x.move.name}`;
          if (seen.has(k)) continue;
          seen.add(k);
          cands.push(x);
        }
      });
      const soonest = Math.min(9, ...out.filter(x => x.move).map(x => x.hits));
      for (const x of cands.sort((a, b) => b.rank - a.rank).slice(0, STATUS_CANDS)) {
        out.push({ ...x, turns: Math.min(9, soonest + 1), hits: Math.min(9, soonest + 1) });
      }
    }
    if (!out.length) out.push({ me, move: null, target: null, turns: 9, hits: 9, score: lasts - 9, hp });
    return out;
  };
  const cache = new Map();
  const opt = (me, entering, hyp = null) => {
    const mine = lock && !lock.switchIn && me === lock.me ? lock : null;
    const k = `${party.indexOf(me)}|${entering}|${!!mine}|${hyp?.key ?? ""}`;
    if (!cache.has(k)) cache.set(k, options(me, entering, mine, hyp));
    return cache.get(k);
  };

  // Newcomers fill empty slots for free; any beyond are voluntary switches (`payers`), which take the incoming hit
  // unless the switch is free. `swaps` counts the voluntary switches either way.
  const empty = Math.max(0, slots - current.length);
  const free = freeSwitch ? slots : empty;
  const plans = [];
  // The whole-fight plan's value once this mon has taken the turn (#113). Single battles only: it misreads a double
  // as one-on-one exchanges (#113).
  const planValueOf = picks => {
    if (!team || slots !== 1 || !picks[0]) return null;
    const mi = party.indexOf(picks[0].me);
    return mi < 0 ? null : team.at({ mi, free: freeSwitch })?.val ?? null;
  };
  // Per pick: `ally`, what a move that hits every other pokémon does to our partner; `spare`, the pair's other hit
  // already does all this one does, so a move with a drawback gives way to one without (CONTEXT.md, `Spare hit`).
  const swapsIn = picks => Math.max(0, picks.filter(p => !current.includes(p.me)).length - empty);
  const flipsIn = picks => current.filter(p => !picks.some(q => q.me === p) && cameInLastTurn(turn, p)).length;
  const add = (picks, payers) => {
    const sps = slots === 2 ? picks.filter(p => p.play) : [];
    if (sps.length) return addStatus(picks, payers, sps);
    const j = slots === 2 || pair ? joint(picks, payers) : null;
    const swaps = swapsIn(picks);
    const acting = picks.filter(p => p.move?.pm && !payers.includes(p.me));
    const info = picks.map(p => {
      const partner = picks.find(q => q !== p);
      const ally = acting.includes(p) && partner ? allyHit(p, partner.me) : null;
      const spare = !!j && acting.length === 2 && !p.locked && p.target != null && spareHit(picks, payers, p, j);
      // Both slots on one foe: `redir` of the time this hit finds it gone and is worth its `redirScore` (#236).
      const redir = redirectOdds(p, partner, payers);
      const mix = x => (redir > 0 && x?.redirScore != null ? redir * x.redirScore + (1 - redir) * x.score : x?.score ?? 0);
      // A KO'd partner is lost along with whatever it was going to do.
      let score = mix(p) - (ally ? ally.share + ally.pKo * (ALLY_KO_COST + Math.max(0, partner.score)) : 0);
      if (spare && drawback(p.move)) {
        const clean = opt(p.me, payers.includes(p.me)).filter(x => x.move && !x.play && !drawback(x.move)).reduce((b, x) => (!b || x.score > b.score ? x : b), null);
        if (clean) score = Math.min(score, mix(clean)) + (p.move.benefit ?? 0) * AI_POINT;
      }
      return { ally, spare, redir, score };
    });
    plans.push({ picks, payers, info, extra: payers.length, swaps, joint: j, planVal: planValueOf(picks),
      score: info.reduce((t, x) => t + x.score, 0) + (j?.value ?? 0) - flipsIn(picks) * FLIP_COST });
  };
  // A double's status plays as one exchange of the field (#262): the mix over which of them landed, each branch's
  // effect written with `turn.assuming` before the partner slot is scored. A slot that played is worth its best move
  // on that state, a turn later: the −1 already in the candidate's score.
  const statusField = (picks, payers, sps) => {
    const mons = picks.map(p => p.me);
    const parts = picks.map(() => 0);
    // Each slot is shown taking the option the likeliest branch scored.
    const shown = picks.slice();
    let best = -1;
    let jv = 0;
    for (let m = 0; m < 1 << sps.length; m++) {
      const landed = sps.filter((_, i) => (m >> i) & 1);
      const w = sps.reduce((q, x, i) => q * (((m >> i) & 1) ? x.works : 1 - x.works), 1);
      if (!(w > 0)) continue;
      const patches = landed.flatMap(x => x.play.patches ?? []);
      const at = patches.length ? now.assuming(patches) : null;
      const lost = landed.filter(x => x.act).map(x => ({ mon: x.foe, act: x.act }));
      const tag = `${at ? at.key : ""}|${landed.map(x => `${x.me.id}:${x.move.name}`).join()}`;
      // A heal writes no state: it changes the HP the slot that played it is scored on.
      const hyp = bump => ({ at, lost, bump, key: `${tag}|${bump}` });
      const hits = [];
      picks.forEach((p, i) => {
        const entering = payers.includes(p.me);
        if (p.play) {
          const best = opt(p.me, entering, hyp(landed.includes(p) ? p.heal : 0))
            .reduce((b, x) => (x.play || (b && b.score >= x.score) ? b : x), null);
          parts[i] += w * (best?.score ?? -9);
        } else {
          // Where the hypothesis has taken the pick away, the score it had on the real turn.
          const y = opt(p.me, entering, hyp(0)).find(x => !x.play && x.move?.name === p.move?.name && x.target === p.target) || p;
          parts[i] += w * y.score;
          if (w > best) shown[i] = y;
          if (y.move?.pm && !entering) hits.push(y);
        }
      });
      if (hits.length) jv += w * joint(hits, payers, mons, hyp(0)).value;
      best = Math.max(best, w);
    }
    return { parts, jv, shown };
  };
  // The picks carry the priced score, not their own: a status candidate's own is only the turn it spends, and the stay
  // margin and the slot rows read a real one.
  const addStatus = (picks, payers, sps) => {
    const { parts, jv, shown } = statusField(picks, payers, sps);
    const raw = picks.map((p, i) => (p.play ? p.score : 0) + parts[i]);
    const info = picks.map((p, i) => {
      const oi = picks.findIndex(q => q !== p);
      const ally = !p.play && oi >= 0 && !payers.includes(p.me) ? allyHit(p, picks[oi].me) : null;
      return { ally, spare: false, redir: 0, score: raw[i] - (ally ? ally.share + ally.pKo * (ALLY_KO_COST + Math.max(0, raw[oi])) : 0) };
    });
    plans.push({
      picks: picks.map((p, i) => ({ ...shown[i], score: info[i].score })), payers, info, extra: payers.length,
      swaps: swapsIn(picks), joint: null, planVal: planValueOf(picks),
      score: info.reduce((t, x) => t + x.score, 0) + jv - flipsIn(picks) * FLIP_COST,
    });
  };
  const allyHit = (p, partner) => {
    if (!hitsAlly(p.move)) return null;
    const o = planOutcomes(turn, p.me, partner).find(x => x.name === p.move.name);
    return o?.expected > 0 ? { mon: partner, share: Math.min(1, o.expected / partner.getMaxHp()), pKo: o.pKo ?? 0 } : null;
  };
  // P(`p`'s hit finds its target felled by the partner and lands on the other foe) (#236).
  const redirectOdds = (p, q, payers) => {
    if (!pair || !q || p.redirScore == null || p.play || q.play) return 0;
    if (typeof p.target !== "number" || q.target !== p.target) return 0;
    if (!q.move?.pm || !p.move?.pm || payers.includes(p.me) || payers.includes(q.me)) return 0;
    const qFirst = 1 - actionOrder(now, p.me, p.move.pm, q.me, q.move.pm);
    return qFirst * landOf(q, active[p.target]) * (q.move.pKo ?? 0);
  };
  // Nothing lost without `p`'s hit: its foes still go down, and the pair's value doesn't drop.
  const spareHit = (picks, payers, p, j) => {
    const targets = p.target === "both" ? active.map((_, i) => i) : [p.target];
    if (!targets.every(t => j.foes[t].pKo >= 0.9)) return false;
    return j.value - joint(picks.filter(q => q !== p), payers, picks.map(q => q.me)).value < 0.1;
  };

  const dangerMemo = new Map();
  const danger = (X, mons, hyp = null) => {
    const turn = turnOf(hyp);
    const act = actOn(hyp, X);
    const k = `${hyp?.key ?? ""}|${X.id}|${mons.map(m => m.id).join()}`;
    if (!dangerMemo.has(k)) {
      dangerMemo.set(k, !attackers.includes(X) ? 0 : (act ? act(0) : 1) * Math.min(2, Math.max(0, ...mons.map(m => {
        const t = threatFrom(turn, X, m);
        if (!t) return 0;
        const setup = t.live ? setupDanger(X, t, m) : 0;
        return t.expected / m.getMaxHp() + threatKoAt(t, m.hp) * t.koFirst * 0.5 + setup;
      }))));
    }
    return dangerMemo.get(k);
  };
  // P(`p`'s hit reaches X): it isn't KO'd before it moves and X doesn't Protect.
  const landOf = (p, X, hyp = null) => {
    const turn = turnOf(hyp);
    return attackers.reduce((keep, f) => {
      const t = threatFrom(turn, f, p.me, p.move.pm);
      const act = actOn(hyp, f);
      return keep * (1 - threatKoAt(t, p.me.hp) * (t?.koFirst ?? 0) * (act ? act(0) : 1));
    }, 1) * (1 - protectChance(turn, X));
  };
  // A double's hits together this turn, per foe: P(KO'd), overkill redirected to the other foe, plus P(KO'd before it
  // acts) × its `danger`. `mons`: whose danger counts, kept whole when a pick is left out to weigh its hit.
  const joint = (picks, payers, mons = picks.map(p => p.me), hyp = null) => {
    const turn = turnOf(hyp);
    // A status play lands no hit: `statusField` prices it (#262).
    const acting = picks.filter(p => p.move && !p.play && !payers.includes(p.me));
    const foes = active.map(() => ({ pKo: 0, pBefore: 0, redirect: 0, hitters: 0 }));
    active.forEach((X, xi) => {
      const hitters = acting.map(p => {
        const o = p.target === "both" ? planOutcomes(turn, p.me, X).find(x => x.name === p.move.name) : p.target === xi ? p.move : null;
        if (!o) return null;
        const land = landOf(p, X, hyp);
        const act = actOn(hyp, X);
        const before = attackers.includes(X) ? 1 - (threatFrom(turn, X, p.me, p.move.pm)?.first ?? 0) * (act ? act(0) : 1) : 1;
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
        const q = actionOrder(turn, a.p.me, a.p.move.pm, b.p.me, b.p.move.pm);
        const la = a.land * a.acc, lb = b.land * b.acc;
        f.pKo = la * lb * comboKo(X, a, b, q) + la * (1 - lb) * a.roll + (1 - la) * lb * b.roll;
        f.pBefore = a.before * b.before * f.pKo + a.before * (1 - b.before) * a.alone + (1 - a.before) * b.before * b.alone;
        const Y = active[1 - xi];
        if (Y && a.p.target !== "both" && b.p.target !== "both") {
          const redirect = (first, second) => first.alone * second.land * (planOutcomes(turn, second.p.me, Y).find(x => x.name === second.o.name)?.pKo ?? 0);
          foes[1 - xi].redirect += q * redirect(a, b) + (1 - q) * redirect(b, a);
        }
      }
    });
    let value = 0;
    active.forEach((X, xi) => {
      const f = foes[xi];
      f.pKo = 1 - (1 - f.pKo) * (1 - Math.min(1, f.redirect));
      const d = danger(X, mons, hyp);
      value += f.pKo * (1 + REMOVAL_DANGER * d) + f.pBefore * d;
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
      // The first hit stops at the bar boundary (game-code.md §3); the second must take a whole bar.
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
    // With one free slot and two newcomers, either could be the one switching in under fire.
    let assignments = paying === 0 ? [[]] : paying === newcomers.length ? [newcomers] : newcomers.map(p => [p]);
    if (lock?.switchIn && assignments.some(a => a.includes(lock.switchIn))) assignments = assignments.filter(a => a.includes(lock.switchIn));
    for (const payers of assignments) {
      const [a, b] = members.map(p => opt(p, payers.includes(p)));
      if (!b) a.forEach(x => add([x], payers));
      else for (const x of a) for (const y of b) add([x, y], payers);
    }
  }
  if (!plans.length) return null;

  // The fight plan's verdict, as a cost on every option but its best: a term in ⚔'s score, never an override.
  const bestPlanVal = Math.max(-Infinity, ...plans.flatMap(p => (p.planVal == null ? [] : [p.planVal])));
  if (Number.isFinite(bestPlanVal)) {
    for (const p of plans) {
      if (p.planVal == null) continue;
      p.planCost = Math.min(PLAN_CAP, (bestPlanVal - p.planVal) * PLAN_POINT);
      p.score -= p.planCost;
    }
  }

  // Stay unless the field is failing or a switch is clearly better; a merely better field is shown as optional.
  const top = list => list.reduce((b, p) => (!b || p.score > b.score ? p : b), null);
  const bestAny = top(plans);
  const bestStay = top(plans.filter(p => p.swaps === 0));
  // A mon going down this turn whatever we do has nothing left to lose: switching it out trades its last action for an
  // entry hit, while letting it fall brings the next mon in free (#170).
  const doomedMemo = new Map();
  const doomedNowOf = me => {
    if (!doomedMemo.has(me)) {
      const ko = 1 - attackers.reduce((keep, f) => keep * (1 - threatKoAt(threatFrom(turn, f, me), me.hp)), 1);
      doomedMemo.set(me, me.hp + healAtEnd(turn, me) <= 0 || ko >= DOOMED);
    }
    return doomedMemo.get(me);
  };
  // Failing too: a field the fight plan needs elsewhere, since spending the only answer to a foe still to come is not a
  // near-equal turn for the margin to protect (#170).
  const failing = plan => plan.picks.some(p => !p.locked && (!p.move || p.score < 0)) || (plan.planCost ?? 0) >= PLAN_FAIL;
  const margin = freeSwitch ? 0.5 : 3;
  // A field failing only because its mon is spending its last turn keeps the ordinary margin, and the free entry its
  // faint buys (#170).
  const dying = plan => plan.picks.filter(p => !p.locked && (!p.move || p.score < 0));
  const lastStand = !!bestStay && (bestStay.planCost ?? 0) < PLAN_FAIL
    && dying(bestStay).length > 0 && dying(bestStay).every(p => current.includes(p.me) && doomedNowOf(p.me));
  const stay = !!bestStay && (failing(bestStay) && !lastStand ? bestAny.score <= bestStay.score : bestAny.score - bestStay.score < margin);
  const best = stay ? bestStay : bestAny;
  const alt = stay && bestAny !== bestStay && bestAny.swaps > 0 ? bestAny : null;

  // `next`: the hit comes next turn (a switch-in, ours or theirs), so the tag belongs to the `next` step.
  const RANK = { ko: 2, risk: 1 };
  const tagOf = (t, hp, next) => {
    if (!t?.worstMove || !(t.worst > 0) || hp <= 0) return null;
    const ko = threatKoAt(t, hp);
    const pct = Math.round(t.worst / hp * 100);
    const e = t.worstMove.e ?? 1;
    const first = ko > 0 ? t.koFirst : t.first;
    const level = ko >= 0.5 && first >= 0.5 ? "ko" : ko >= 0.5 || (e >= 2 && pct >= 50) || (t.live && ko >= 0.15) ? "risk" : null;
    return level && {
      level, move: t.worstMove.name, type: t.worstMove.type, e, pct: Math.min(pct, 999), from: t.from,
      pko: t.live ? Math.round(ko * 100) : null, hits: t.worstMove.hits, next,
      // A "risk" that is a likely KO all the same, only after our mon has acted once.
      after: level === "risk" && ko >= 0.5 && first < 0.5,
    };
  };
  const worse = (a, b) => (!a ? b : b && RANK[b.level] > RANK[a.level] ? b : a);
  const nowThreat = me => attackers.reduce((w, f) => worse(w, tagOf(threatFrom(turn, f, me), me.hp, false)), null);
  const slotThreat = (p, entering) => {
    const faced = typeof p.target === "number" ? [active[p.target]] : active;
    let tag = entering ? null : nowThreat(p.me);
    for (const f of faced) {
      if (entering || !attackers.includes(f)) tag = worse(tag, tagOf(threatFrom(turn, f, p.me, p.move?.pm ?? null, { next: true }), entering ? p.hp : p.me.hp, true));
    }
    return tag;
  };
  const notesFor = p => {
    const out = [];
    const foe = typeof p.target === "number" ? active[p.target] : null;
    const bars = foe ? bossBarsLeft(foe) : 1;
    if (p.move && bars > 1 && p.hits > 1 && p.hits <= bars) out.push(`boss: ${bars} bars — no 1HKO`);
    if (p.effect) out.push(p.effect);
    if (p.then) out.push(`then ${p.then.name}`);
    const fed = foe && (p.trade?.pTheyKoFirst ?? 0) >= 0.5 && party.length > 1 ? koBoost(foe) : null;
    if (fed) out.push(`KO feeds ${foe.name}'s ${fed.ability} (${koBoostText(fed)})`);
    // The foe the fight plan was keeping this mon for, when taking the turn with it costs enough to mind (#170).
    const saved = (best.planCost ?? 0) >= PLAN_NOTE ? team?.holdFor(party.indexOf(p.me)) : null;
    if (saved) out.push(`saved for ${saved.name}`);
    const n = hitCounts(p.move);
    if (n) out.push(`${p.move.name} ×${n}`);
    out.push(...(p.move?.costs ?? []));
    for (const f of foe ? [foe] : active) {
      for (const m of thieves(f, p.me)) {
        const n = m.getStackCount?.() ?? 1;
        out.push(m.constructor.name === "TurnHeldItemTransferModifier"
          ? `${f.name}'s Mini Black Hole: steals ${n} item${n > 1 ? "s" : ""} a turn`
          : `${f.name}'s Grip Claw: ${Math.round(Math.min(1, (m.chance ?? 0.1) * n) * 100)}% item steal a hit`);
      }
    }
    return out;
  };

  // Null unless the aim needs saying: both on one foe, or split because both foes go down.
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

  // What a paid switch-in takes: its HP share, and the hardest-hitting foe's likeliest move.
  const entryHit = me => {
    const ts = attackers.map(f => threatFrom(turn, f, me)).filter(t => t?.move);
    if (!ts.length) return null;
    const t = ts.reduce((a, b) => (b.expected > a.expected ? b : a));
    return { pct: Math.min(999, Math.round(incoming(me).dmg / me.getMaxHp() * 100)), move: t.move.name, type: t.move.type, e: t.move.e };
  };
  const swaps = plan => {
    const chosen = plan.picks.map(p => p.me);
    const outs = current.filter(p => !chosen.includes(p));
    return chosen.filter(p => !current.includes(p))
      .map((p, i) => ({
        out: outs[i] ? { icon: iconOf(outs[i]), name: outs[i].name, threat: nowThreat(outs[i]) } : null,
        in: { icon: iconOf(p), name: p.name, takes: plan.payers.includes(p) ? entryHit(p) : null },
      }));
  };

  // Support moves, conservative because the planner only scores damage: Protect for a slot likely KO'd before it moves
  // whose partner likely KOs that foe first anyway; Helping Hand when it turns a likely survivor into a likely KO.
  const usablePm = pm => pm && (pm.getMovePp?.() ?? 1) - (pm.ppUsed ?? 0) > 0;
  // Protect's streak (game-code.md §14).
  const protectedLast = me => {
    const last = me.getLastXMoves?.(1)?.[0];
    return !!last && last.result === MoveResult.SUCCESS && me.moveset.some(pm => pm?.moveId === last.move && moveTraits(pm.getMove()).protect);
  };
  const boostedKo = (b, X) => {
    if (bossBarsLeft(X) > 1) return 0;
    const o = b.target === "both" ? planOutcomes(turn, b.me, X).find(x => x.name === b.move.name) : b.move;
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
      const protect = a.me.moveset.find(pm => usablePm(pm) && moveTraits(pm.getMove()).protect);
      if (protect && !protectedLast(a.me) && plan.joint.value - alone.value < 0.5) {
        const X = attackers.find(f => {
          const xi = active.indexOf(f);
          const t = threatFrom(turn, f, a.me, a.move.pm);
          return xi >= 0 && threatKoAt(t, a.me.hp) * (t?.koFirst ?? 0) >= 0.5 && alone.foes[xi].pBefore >= 0.5;
        });
        if (X) { out.set(a, { kind: "protect", pm: protect, note: `${b.me.name} KOs ${X.name} first` }); return; }
      }
      const hh = a.me.moveset.find(pm => usablePm(pm) && (pm.getMove().id === MoveId.HELPING_HAND || pmName(pm) === "Helping Hand"));
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
  const helps = new Set([...support.values()].map(x => x.helps));
  const picks = best.picks.map(p => (support.has(p) ? { ...p, move: null, target: null } : helps.has(p) && typeof p.target === "number" ? { ...p, hits: 1 } : p));

  // This turn's action, for the fight plan to be re-searched around (#113). In a double the plan runs against the foe
  // in slot 0, so the pin is the slot aimed there: its step 1 is then an action the player is actually told to take.
  const chosen = slots === 1 ? best.picks[0]
    : best.picks.find(p => !p.play && (p.target === 0 || p.target === "both")) ?? best.picks.find(p => !p.play) ?? best.picks[0];
  const pin = team && chosen ? { mi: party.indexOf(chosen.me), outcome: chosen.move, free: freeSwitch } : null;
  const ahead = pin && pin.mi >= 0 ? team.after(pin) : null;
  // A plan step is a whole exchange, so its free entry is this turn's news only when the mon goes down on this one —
  // counting the pick's own trade, since a foe switching in is not an `attackers` threat yet.
  const doomedNow = !!chosen && (doomedNowOf(chosen.me) || (chosen.trade?.pTheyKoFirst ?? 0) >= 0.5);

  return {
    picks, // live objects for the per-foe rows; not part of the JSON-safe view
    pin: pin && pin.mi >= 0 ? pin : null,
    view: {
      optional: alt ? swaps(alt) : [],
      freeEntry: doomedNow ? ahead?.freeEntry ?? null : null,
      nextIn: ahead?.nextIn ?? null,
      // Staying is failing and every switch-in would be KO'd coming in; not when a switch is offered as optional (#170).
      noSafeSwitch: !freeSwitch && best.swaps === 0 && failing(best) && !alt && party.length > current.length,
      freeSwitch,
      slots: best.picks.map((p, i) => {
        const enter = best.payers.includes(p.me);
        const sup = support.get(p);
        const { ally, spare, redir } = best.info[i];
        // A spread move that KOs the two foes on different turns: say each, so the rows agree.
        const each = p.target === "both" && p.each && p.each[0] !== p.each[1] ? p.each : null;
        const mv = sup?.pm.getMove();
        const helped = helps.has(p);
        return {
          icon: iconOf(p.me), name: p.me.name, out: !!p.me.isOnField?.(), enter,
          move: sup ? pmName(sup.pm) : p.move?.name ?? null, type: sup ? TYPES[mv.type] ?? null : p.move?.type ?? null, cat: sup ? "status" : p.move?.cat ?? null,
          target: sup || p.target === null || p.self ? null : p.target === "both" ? "both" : { icon: iconOf(active[p.target]), name: active[p.target].name },
          then: sup ? null : p.then?.name ?? null,
          ko: sup || each ? 0 : helped && typeof p.target === "number" ? 1 : p.hits <= 3 ? p.hits : 0,
          helped,
          koEach: sup || p.target !== "both" || !p.each ? null : p.each.map(n => (n <= 3 ? n : 0)),
          threat: slotThreat(p, enter),
          // A slot with nothing left to do says which restriction emptied its pool.
          stopped: sup || p.move || !active[0] ? [] : turn.stopped(p.me, active[0]),
          traps: sup ? [] : trapsOn(p, active),
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
            ...(spare
              ? [redir >= REDIR_NOTE && typeof p.target === "number" && active[1 - p.target]
                ? `spare hit — goes to ${active[1 - p.target].name} if ${active[p.target].name} falls first`
                : "spare hit — KO without it"]
              : []),
          ],
        };
      }),
      switches: swaps(best),
      targeting: targeting({ ...best, picks }),
    },
  };
};

const hitsAlly = o => [MoveTarget.ALL_OTHERS, MoveTarget.ALL_NEAR_OTHERS].includes(o?.pm?.getMove?.()?.moveTarget);
// A move the game's own scoring marks down. Without game functions nothing is.
export const drawback = o => (o?.benefit ?? 0) < 0;
const ALLY_KO_COST = 4;
// `danger` runs to 2, so this caps what a removal adds for the foe's danger near one turn of ours (#320).
const REMOVAL_DANGER = 0.5;
const REDIR_NOTE = 0.25;
const KEEP_BONUS = 0.15;
const DEPTH_GAIN = 0.1;
const FLIP_COST = 0.5;
// The plan scores 100 a KO: #113's "clearly better" 20 × 0.02 = 0.4 of a turn.
const PLAN_POINT = 0.02;
const PLAN_CAP = 3;
const PLAN_NOTE = 0.25;
const PLAN_FAIL = 1;
const DOOMED = 0.8;
const STATUS_COST = 0.2;
// Each costs the field search a hypothesis both slots are re-scored on: raising it spends the render budget (#262).
const STATUS_CANDS = 2;
// Turns of ours a whole HP bar of a mon still to come is worth.
const HAZARD_TURNS = 2;
const FEED_COST = 0.5;

// What a status move of `me`'s does to a fight with `f`, if the planner can price it (game-code.md §14): a `setup`,
// `status`, `heal`, `hazard` or `types` play, its effect as `patches` for the game's own code to price; else null.
// This turn's hit meets the state as it stands: only a sleep or paralysis that lands first cancels it (`skip0`).
const statusPlay = (turn, me, f, info) => {
  const mv = info.pm.getMove?.();
  if (!mv || info.blocked) return null;
  const t = moveTraits(mv, me, { target: f });
  if (t.inflicts.some(x => x.self)) return null;
  const up = turn.mon(me).setup(mv);
  if (up) {
    const names = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
    return {
      kind: "setup", self: true, patches: [{ mon: me, stages: up }], hpCost: t.cutHp ? Math.max(1, Math.floor(me.getMaxHp() / t.cutHp.ratio)) : 0,
      note: Object.entries(up).map(([st, n]) => `${n > 0 ? "+" : "−"}${Math.abs(n)} ${names[st]}`).join(" "),
    };
  }
  const inflict = t.inflicts.find(x => [StatusEffect.POISON, StatusEffect.TOXIC, StatusEffect.PARALYSIS, StatusEffect.SLEEP, StatusEffect.BURN].includes(x.effect));
  if (inflict) {
    if (f.status?.effect || !turn.mon(f).canTake(inflict.effect, me)) return null;
    const early = !!f.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr");
    const skip = a => STATUS_SKIP[StatusEffect.SLEEP](a, early);
    return {
      kind: "status", self: false, patches: [{ mon: f, status: { effect: inflict.effect, toxicTurnCount: 0, sleepTurnsRemaining: 0 } }],
      skip0: inflict.effect === StatusEffect.SLEEP ? skip(0) : inflict.effect === StatusEffect.PARALYSIS ? 1 / 8 : 0,
      // Given it landed on turn 1, the foe's next attempt is its second if we moved first, else its first.
      foeAct: inflict.effect === StatusEffect.SLEEP ? pF => i => 1 - (pF * skip(i + 1) + (1 - pF) * skip(i)) : null,
      note: STATUS_FRAMES[inflict.effect],
    };
  }
  if (t.typeChange) {
    const { kind, type } = t.typeChange;
    const name = TYPES[type];
    if (!name || f.isTerastallized) return null;
    const has = ty => { try { return f.isOfType?.(ty) ?? typesOf(f).includes(TYPES[ty]); } catch { return typesOf(f).includes(TYPES[ty]); } };
    if (kind === "add") return has(type) ? null : { kind: "types", self: false, patches: [{ mon: f, addedType: type }], note: `+${name}` };
    const fixed = [AbilityId.MULTITYPE, AbilityId.RKS_SYSTEM].some(a => { try { return !!f.hasAbility?.(a); } catch { return false; } });
    const now = (() => { try { return f.getTypes?.() ?? []; } catch { return []; } })();
    if (fixed || (now.length === 1 && now[0] === type)) return null;
    return { kind: "types", self: false, patches: [{ mon: f, types: [type] }], note: `pure ${name}` };
  }
  if (t.heal?.self) {
    const max = me.getMaxHp?.() ?? me.hp;
    if (me.hp >= max) return null;
    const ratio = t.heal.ratioIn(turn.mon(me).weather, me, f);
    return { kind: "heal", self: true, amount: Math.max(1, Math.floor(max * ratio)), note: `heal ${Math.round(ratio * 100)}%` };
  }
  if (t.hazard) {
    const v = hazardValue(turn, me, t.hazard.tag);
    return v && { kind: "hazard", self: true, value: v.turns, note: `${v.n} to come` };
  }
  return null;
};
// A hazard's worth against the trainer's mons still to come (game-code.md §14), in turns, and how many it touches.
const hazardValue = (turn, me, tagType) => {
  if (!turn.facts.trainer) return null;
  const coming = turn.facts.foes.filter(p => p && p.hp > 0 && !p.isOnField?.());
  if (!coming.length) return null;
  const layers = turn.facts.hazards(tagType, ArenaTagSide.ENEMY);
  const grounded = p => { try { return p.isGrounded?.() ?? !typesOf(p).includes("Flying"); } catch { return true; } };
  const guarded = p => !!p.hasAbilityWithAttr?.("BlockNonDirectDamageAbAttr");
  if (tagType === "TOXIC_SPIKES" && coming.some(p => grounded(p) && typesOf(p).includes("Poison"))) return null;
  const spikes = n => (n > 0 ? 1 / (10 - 2 * n) : 0);
  const share = p => {
    if (tagType === "STEALTH_ROCK") return turn.mon(p).rockChip;
    if (!grounded(p)) return 0;
    if (tagType === "SPIKES") return guarded(p) ? 0 : spikes(layers + 1) - spikes(layers);
    if (tagType === "TOXIC_SPIKES") return guarded(p) || !turn.mon(p).canTake(StatusEffect.POISON, me) ? 0 : layers ? 0.1 : 0.25;
    return 0;
  };
  const shares = coming.map(p => Math.min(p.hp / p.getMaxHp(), share(p)));
  const total = shares.reduce((t, x) => t + x, 0);
  return total > 0 ? { turns: total * HAZARD_TURNS, n: shares.filter(x => x > 0).length } : null;
};
const lastMoveOf = me => ((me.tempSummonData?.turnCount ?? 0) >= 2 ? me.getLastXMoves?.(1)?.[0]?.move ?? null : null);
const cameInLastTurn = (turn, p) => (p.tempSummonData?.turnCount ?? 2) <= 1 && (turn.facts.turn ?? 1) > 1;

// Slot 0's command, read at slot 1's prompt: a move → `{ me, pm, target }`, `target` an index into `active` ("both" for
// a spread move, null for our side); a switch → `{ me, switchIn }`.
const lockedCommand = (turn, party, active, pair) => {
  const cmd = turn.facts.command;
  const me = party.find(p => p.isOnField?.() && p.getBattlerIndex?.() === BattlerIndex.PLAYER);
  if (!cmd || !me) return null;
  if (cmd.kind === Command.POKEMON) {
    const switchIn = turn.facts.party[cmd.cursor];
    return switchIn && party.includes(switchIn) ? { me, switchIn } : null;
  }
  if (cmd.kind !== Command.FIGHT) return null;
  const pm = me.moveset[cmd.cursor] ?? me.moveset.find(m => m && m.moveId === cmd.move?.move) ?? null;
  const mv = pm?.getMove?.();
  const bi = cmd.targets[0];
  let target = null;
  if (mv && SPREAD_TARGETS.includes(mv.moveTarget)) target = pair ? "both" : 0;
  else if (bi != null && bi >= BattlerIndex.ENEMY) {
    const i = active.findIndex(f => f.getBattlerIndex?.() === bi);
    target = i >= 0 ? i : active.length === 1 ? 0 : null;
  }
  return { me, pm, target };
};

// For foes no field slot is planned against. `partnered`: moves that also hit `me`'s partner are out.
export const duel = (turn, me, foe, partnered = false) => {
  let best = null;
  for (const o of planOutcomes(turn, me, foe)) {
    if (!(o.expected > 0) || (partnered && hitsAlly(o))) continue;
    const x = exchange(turn, me, o.pm, foe, { outcome: o, next: !me.isOnField?.() || !foe.isOnField?.() });
    const score = x.eTurnsThey - x.eTurnsWe + (x.pWeKoFirst - x.pTheyKoFirst);
    if (!best || score > best.score || (score === best.score && o.expected > best.mine.expected)) best = { me, mine: o, myTurns: x.turnsWe, score };
  }
  return best ?? { me, mine: null, myTurns: 9, score: -9 };
};

// Our mons an exact move is aimed at, for the `↯` row; null where the move isn't exact, or aims at the foe's own side.
const aimedAt = (turn, t, foe) => {
  if (!t?.exact || !t.targets?.length) return null;
  const ours = t.targets.map(bi => turn.facts.field.find(p => p?.getBattlerIndex?.() === bi))
    .filter(p => p && p !== foe && !turn.facts.foes.includes(p));
  return ours.length ? ours.map(p => ({ icon: iconOf(p), name: p.name })) : null;
};

// Keyed by the foe that leaves. None during a free switch: the enemy picks its first command after ours (game-code.md
// §9), and its switch rule can't be replayed against a field we haven't chosen.
const predictedSwitches = baseTurn => new Map(baseTurn.facts.decision === "check-switch" ? [] :
  baseTurn.activeFoes().flatMap(f => {
    const a = baseTurn.enemyAction(f);
    return a.switchTo ? [[f, { to: a.switchTo, ratio: 1, back: !!a.switchBack }]] : [];
  }));

// A return (CONTEXT.md, `Return`; #285) is still on the field holding stat stages it loses on landing (game-code.md
// §9). The turn line and the fight plan both take this turn, or the card argues with itself; `ifStay` keeps
// `baseTurn`.
export const arrivalTurn = baseTurn => baseTurn.memo("arrival", () => {
  const arriving = [...predictedSwitches(baseTurn).values()].filter(v => v.back).flatMap(v => {
    const st = v.to.summonData?.statStages ?? [];
    const stages = {};
    for (let i = 1; i <= 5; i++) if (st[i - 1]) stages[i] = -st[i - 1];
    return Object.keys(stages).length ? [{ mon: v.to, stages }] : [];
  });
  return arriving.length ? baseTurn.assuming(arriving) : baseTurn;
});

// Plain data for one refresh, run inside 60-card's sandbox. Its JSON is part of the change signature: whatever goes in
// rebuilds the DOM when it changes. `team`: 35-team-plan's `teamPlanner`, null on a wild wave.
export const battleModel = (baseTurn, { team = null } = {}) => {
  const { double, trainer, wave } = baseTurn.facts;
  // The one gate (#183): without the exact enemy move there is no plan, for display or advice, and every reader of the
  // enemy model stops here together. There is no fallback to the distribution.
  const gate = baseTurn.exact?.() ?? { ok: true };
  if (!gate.ok) return { kind: "battle", unavailable: gate.reason, title: `W${wave}${trainer ? ` · ${trainer.getName()}` : ""}`,
    field: null, pin: null, enemySwitches: [], ifStay: null, order: [], team: [], rows: [] };
  const party = baseTurn.facts.party.filter(p => p && p.hp > 0);
  const foes = baseTurn.facts.foes.filter(f => f && f.hp > 0);
  const active = baseTurn.activeFoes();
  const freeSwitch = baseTurn.facts.decision === "check-switch";
  const predicted = predictedSwitches(baseTurn);
  const switching = f => (predicted.get(f)?.ratio ?? 0) >= 1;
  const facing = active.map(f => (switching(f) ? predicted.get(f).to : f));
  const turn = arrivalTurn(baseTurn);
  // Targets are field positions, so a lock resolved against the field holds for the switch-in taking that position.
  const locked = lockedCommand(turn, party, active, active.length === 2);
  // A `fieldPlan` input the turn's own key doesn't cover belongs in this key, or the memo serves a stale plan.
  const ids = mons => mons.map(p => p.id).join();
  const lockKey = locked ? `${locked.me.id}:${locked.switchIn?.id ?? ""}:${pmName(locked.pm)}:${locked.target}` : "";
  const attackers = active.filter(f => !switching(f));
  const plan = turn.memo(`field:${ids(party)}|${ids(facing)}|${ids(attackers)}|${double}|${freeSwitch}|${lockKey}`,
    () => fieldPlan(turn, party, facing, double, attackers, { freeSwitch, locked, team }));
  const ifStay = active.some(switching)
    ? baseTurn.memo(`stay:${ids(party)}|${ids(active)}|${double}|${lockKey}`, () => fieldPlan(baseTurn, party, active, double, active, { locked }))
    : null;

  // Foes on the field take their pick from the field plan, so the rows never contradict it; any other foe gets the
  // best 1-v-1 pick, preferring members not already busy.
  const used = new Set(plan?.picks.map(p => p.me) ?? []);
  const pickFor = foe => {
    // A foe predicted to switch out shares its switch-in's pick: that's who the move lands on.
    const target = switching(foe) ? predicted.get(foe).to : foe;
    const ai = facing.indexOf(target);
    const slot = ai >= 0 && plan ? plan.picks.find(p => p.target === ai) ?? plan.picks.find(p => p.target === "both") : null;
    if (slot?.move) {
      const both = slot.target === "both";
      // A status move's row shows the damage of the attack it sets up.
      const then = slot.move.cat === "status" ? slot.then ?? null : null;
      const dmg = both ? planOutcomes(turn, slot.me, target).find(x => x.name === slot.move.name)?.expected ?? 0 : (then ?? slot.move).expected;
      // The slot's own KO turns, so the row and the ⚔ line agree.
      return { me: slot.me, mine: { ...slot.move, dmg, then }, myTurns: both ? slot.each?.[ai] ?? koTurn(koCurve(turn.mon(target), [{ d: dmg, p: 1 }]).by) : slot.hits, score: slot.score, later: false, vs: target };
    }
    const paired = (plan?.picks.length ?? 0) === 2;
    const ranked = party.map(me => duel(turn, me, foe, paired && ai >= 0 && plan.picks.some(p => p.me === me)))
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
    const weak = [], avoid = [];
    for (const t of TYPES) {
      const e = effectiveness(t, foe);
      if (e >= 2) { weak.push([t, e >= 4 ? "×4" : ""]); teamWeak[t] = (teamWeak[t] ?? 0) + 1; }
      else if (e === 0) avoid.push([t, "×0"]);
      else if (e <= 0.25) avoid.push([t, "×¼"]);
    }
    const p = picks.get(foe);
    const vs = p?.vs ?? foe;
    // `✦` marks an ability that changes one of our options: a field trap always, a move trap when it bites the damaging
    // pool of the mons we put in front of it, not only the ⚔ line's move.
    const ourside = [...new Set([...(plan?.picks.map(q => q.me) ?? []), ...(p?.me ? [p.me] : [])])];
    const pool = ourside.flatMap(me => planOutcomes(turn, me, foe));
    const traps = abilitiesOf(foe).filter(a => FIELD_TRAPS.has(a) || (MOVE_TRAPS.has(a) && pool.some(o => bites(a, foe, o))));
    const t = p?.mine && !switching(foe) ? threatFrom(turn, foe, p.me, p.mine.pm ?? null, { next: !p.me.isOnField?.() || !foe.isOnField?.() }) : null;
    const bars = bossBarsLeft(vs);
    const n = p?.mine ? hitCounts(p.mine) : null;
    return {
      icon: iconOf(foe), name: foe.name, lv: foe.level, types: typesOf(foe), tera: turn.mon(foe).tera,
      traps, boss: !!foe.isBoss?.(), status: foe.status?.effect ?? 0,
      hp: Math.round(foe.hp / foe.getMaxHp() * 100),
      weak, avoid,
      switchTo: predicted.has(foe) ? { icon: iconOf(predicted.get(foe).to), name: predicted.get(foe).to.name, sure: switching(foe) } : null,
      // An exact move carries no `p`: its absence is what marks it.
      likely: t?.move ? {
        move: t.move.name, type: t.move.type, p: t.exact || !t.live ? null : Math.round(t.move.p * 100),
        confidence: t.confidence ?? "estimate",
        at: aimedAt(turn, t, foe),
        first: Math.round(t.first * 100), hits: t.move.hits,
      } : null,
      pick: p?.mine ? {
        icon: iconOf(p.me), name: p.me.name, move: p.mine.name, type: p.mine.type, cat: p.mine.cat,
        pct: Math.min(100, Math.round(p.mine.dmg / vs.getMaxHp() * 100)),
        vs: p.vs && p.vs !== foe ? { icon: iconOf(p.vs), name: p.vs.name } : null,
        ko: p.myTurns <= 3 ? p.myTurns : 0, risky: p.score < 0, later: p.later,
        notes: [...(bars > 1 && p.myTurns > 1 && p.myTurns <= bars ? [`boss: ${bars} bars — no 1HKO`] : []), ...(n ? [`${p.mine.name} ×${n}`] : []),
          ...(p.mine.then ? [`then ${p.mine.then.name}`] : [])],
      } : null,
    };
  });

  const sendIns = [...(plan?.picks.map(p => p.me) ?? []), ...foes.map(f => picks.get(f)?.me).filter(Boolean)];
  return {
    kind: "battle",
    field: plan?.view ?? null,
    pin: plan?.pin ?? null,
    enemySwitches: active.filter(f => predicted.has(f)).map(f => ({
      from: { icon: iconOf(f), name: f.name }, to: { icon: iconOf(predicted.get(f).to), name: predicted.get(f).to.name }, sure: switching(f),
      // A return needs its own wording (CONTEXT.md, `Return`).
      back: !!predicted.get(f).back,
    })),
    ifStay: ifStay ? ifStay.view.slots : null,
    title: `W${wave}${trainer ? ` · ${trainer.getName()}` : ""}`,
    order: [...new Set(sendIns)].map(me => ({ icon: iconOf(me), name: me.name })),
    team: Object.entries(teamWeak).sort((x, y) => y[1] - x[1]).slice(0, 4),
    rows,
  };
};
