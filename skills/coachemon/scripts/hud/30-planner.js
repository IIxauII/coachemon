// Battle planning: who should be on the field, what each slot does, and the per-foe rows.
//
// Everything it knows about the live battle it asks the **turn** (`25-turn.js`) — damage, the enemy AI, the
// per-mon reads, the plain facts of the wave. It never sees the scene, opens no sandbox, and keeps no cache of its
// own: `turn.memo` is one turn's memory, and `turn.live` is the only thing it has to know about where the numbers
// came from. Against an approximate turn every answer still comes back, labelled, so the panel always renders.

// ---- When a switch is free (read from the game's phases; see game-code.md §9)
// - CheckSwitchPhase ("Will you switch Pokémon?" → CONFIRM): queued only when an encounter starts — EncounterPhase.end,
//   a mystery-encounter battle, a loaded save, a retry — never in trainer battles (battleType 1) and never when a
//   trainer sends in its next mon; skipped under battle style "Set", or when the mon is trapped, frenzied or
//   commanded, or no bench mon is healthy. Doubles ask once per slot. Yes → SwitchPhase → the swap happens before
//   TurnInitPhase: no enemy hit, no turn lost, and the enemy picks its first command against our new field.
// - Faint replacement (FaintPhase → SwitchPhase modal, no return) runs after TurnEndPhase: free too.
// - U-turn / Volt Switch / Baton Pass (a deferred SwitchPhase with return) switch mid-turn: the
//   enemy's already-chosen moves still land on the switch-in if it moves later. Not free.
// - A regular switch command resolves before moves: the switch-in takes the hit, its move waits a turn.
// Both prompts wait on UI input with no phase mid-execution, so the sandboxed game calls are as safe as in the
// CommandPhase — though turnData isn't reset until TurnInitPhase. Which of them we are in is `turn.facts.decision`.

import { ABILITY_IMMUNE, ABILITY_IMMUNE_FLAG, CONTACT_PUNISH, FIELD_TRAPS, MOVE_TRAPS, SPREAD_TARGETS, STATUS_FRAMES, TYPES, abilitiesOf, effectiveness, iconOf, moveHasFlag, squeezeDist, stage, stat, typesOf, vs } from "./01-core.js";
import { moveTraits } from "./07-move-traits.js";
import { koChanceAt, koCurve, koTurn, koTurns, rawMax, useOf } from "./10-damage.js";

const pmName = pm => pm?.getName?.() ?? pm?.name ?? "";
const bossBarsLeft = p => (p.isBoss?.() && p.bossSegments > 1 ? Math.max(1, (p.bossSegmentIndex ?? p.bossSegments - 1) + 1) : 1);
// Turn-end HP change, signed: heals +, weather / status chip −. `dealt`: damage `p` deals a turn (Shell Bell).
// Only against a live turn: pacing an approximation's single damage number against real chip and heals reads as
// precision the rest of that plan doesn't have.
const healAtEnd = (turn, p, dealt = 0) => (turn.live ? turn.turnEndHp(p, { dealt }) : 0) || 0;
const heldStack = (p, name) => (p.getHeldItems?.() ?? []).filter(m => m.constructor?.name === name).reduce((t, m) => t + (m.getStackCount?.() ?? 1), 0);
// "Triple Axel ×3", "Bullet Seed ×2–5": multi-hit moves change KO math more than their power suggests.
const hitCounts = o => {
  const ns = (o?.dist ?? []).filter(d => d.p > 0).map(d => d.n);
  if (!ns.length || Math.max(...ns) <= 1) return null;
  return Math.min(...ns) === Math.max(...ns) ? `${ns[0]}` : `${Math.min(...ns)}–${Math.max(...ns)}`;
};

// P(foe uses a Protect-type move this turn), from the enemy AI's distribution.
const protectChance = (turn, foe) => turn.memo(`protect:${foe.id}`, () => {
  if (!turn.live || !foe.isOnField?.()) return 0;
  return (turn.enemyAction(foe).moves ?? []).reduce((sum, d) => {
    const pm = foe.moveset[d.slot] ?? foe.moveset.find(m => m?.getName() === d.name);
    const mv = pm?.getMove?.();
    return sum + (mv && moveTraits(mv).protect ? d.p : 0);
  }, 0);
});

// Fallback only: the game applies ¾ spread damage itself when a spread move has two or more targets.
const spreadMult = (turn, atk) => {
  const { double, foes, field } = turn.facts;
  if (!double) return 1;
  const mine = foes.includes(atk);
  return field.filter(p => p && p.hp > 0 && foes.includes(p) !== mine).length >= 2 ? 0.75 : 1;
};

// What a move costs its user, the way the game itself measures it. The game's only such notion is the enemy AI's
// move scoring, so the planner uses that rather than a hand-kept list of attributes: `benefit` is the expected score
// of **full step 7** of `getNextMove` for our move against this target (20-enemy-ai's `aiTargetScore`), which covers
// `getUserBenefitScore` + `getTargetBenefitScore × sign`, the condition branches, × effectiveness × 1.5 STAB, and
// the 0 → −20 rule. Both signs count, so Stone Edge's HighCrit +3 is a bonus and Brave Bird's recoil a penalty.
// Without game functions (the approximation, the mocks) it is 0 and nothing is nudged.
const AI_POINT = 0.25 / 6;

// Every usable damaging move of `atk` into `def`, in the damage module's record shape plus `pm` (the moveset entry,
// for turn order), `dmg` (expected damage, what the rows show) and `benefit` (the AI's own score for it, above).
export const planOutcomes = (turn, atk, def) => turn.memo(`o:${atk.id}>${def.id}`, () => {
  const pmOf = name => atk.moveset.find(m => m?.getName() === name) ?? null;
  const outs = turn.outcomes(atk, def);
  // What the records say, not what the turn is: a live turn can still fall back to the approximation for a move the
  // game refuses to price, and the rows must not claim it as a live number (#130 — `planOutcomes` used to).
  if (outs.some(o => o.live)) {
    return outs.map(o => {
      const pm = pmOf(o.name);
      return { ...o, pm, dmg: o.expected, benefit: turn.benefit(atk, def, pm?.getMove?.()) };
    });
  }
  // The approximation is one number a move, so the record is only what a number can say: no rolls, no hit counts,
  // no traits — the planner reads `live` and stops asking for what isn't there.
  const mult = spreadMult(turn, atk);
  const bars = bossBarsLeft(def);
  return outs.map(x => {
    const dmg = x.dmg * (x.spread ? mult : 1);
    return { name: x.name, type: x.type, cat: x.cat, e: x.e, priority: x.priority ?? 0, spread: x.spread,
      pm: pmOf(x.name) ?? x, dmg, expected: dmg, max: dmg, acc: 1, dist: [{ n: 1, p: 1 }], benefit: 0, costs: [], notes: [],
      pKo: bars <= 1 && dmg >= def.hp ? 1 : 0, targetHp: def.hp, live: false };
  });
});

// P(a acts before b) this turn. A null move is a switch/item/run, which resolves before any move. Otherwise
// priority, then bracket (Quick Claw 10 %/stack, Quick Draw 30 % for attacks → first in bracket), then effective
// Speed, reversed under Trick Room; ties are a coin flip.
const NO_MOVE_INFO = { priority: 0 };
// Quick Claw (`randBattleSeedInt(10) < stacks`, up to 3) and Quick Draw (30 %, damaging moves only) both add the
// BYPASS_SPEED tag, and `getPriorityModifier` reads that tag *before* any ability bracket: the tag goes first in the
// bracket whatever Stall or Mycelium Might would otherwise have said. Mycelium Might blocks the tag itself on a status
// move (`BypassSpeedTag.canAdd` → PreventBypassSpeedChanceAbAttr), so neither can fire on one.
// Not modelled: both rolls draw from the battle stream, and Quick Draw draws before it checks the move is damaging.
const quickChance = (p, category) => {
  const status = category === MoveCategory.STATUS;
  if (status && abilitiesOf(p).includes("Mycelium Might")) return 0;
  let stack = 0;
  for (const m of p.getHeldItems?.() ?? []) if (m.constructor?.name === "BypassSpeedChanceModifier") stack += m.getStackCount?.() ?? 1;
  const draw = abilitiesOf(p).includes("Quick Draw") && !status ? 0.3 : 0;
  return 1 - (1 - Math.min(1, 0.1 * stack)) * (1 - draw);
};
// `thisTurn`: the order is for the turn the game is waiting on, so the tie the shuffle has already drawn is knowable
// (`turn.speedTie`); a later turn's, or a mon that has no phase in the queue, stays a coin flip.
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

// ---- Our own command's draw, which lands before the enemy decides (spec §6, #158)
// `CommandPhase.handleFightCommand` resolves a `RANDOM_NEAR_ENEMY` move's target with
// `getMoveTargets` → `randBattleSeedInt(<near enemies>)` as the command is made, and `EnemyCommandPhase` runs after
// it — so with two or more opponents the foe's pick is a function of **our** command, and one such draw flipped it
// live (#158). The prediction is therefore made per candidate command: these are the ranges to draw first.
// A command already committed (slot 0's, read at slot 1's prompt) has made its draw against the live stream
// already, so the stream we predict from is past it and there is nothing to simulate.
// Not covered, and why such a row is `~` rather than exact: at slot 0's prompt in a double, slot 1's command is
// still to come and may draw too; and a `VariableTargetAttr` that turns another target into a random one.
const commandDraws = (turn, me, myPm) => {
  if (!turn.facts.double || !me?.isOnField?.()) return [];
  const mv = myPm?.getMove?.();
  if (!mv || mv.moveTarget !== MoveTarget.RANDOM_NEAR_ENEMY) return [];
  const n = (me.getOpponents?.(false) ?? []).filter(Boolean).length;
  return n > 1 ? [n] : [];
};

// What `foe` is likely to use on `me`, as [{ o (outcome or null for status moves), name, type, p }]. The enemy AI's
// own distribution when the foe is on the field and the game waits for a command — it was scored against our mon
// on the field, which is also what a switch-in eats this turn. For next turn (`next`), or a foe not yet on the
// field, the AI's choice is replayed against `me` with the game's own move scores (`aiReplay`), status moves
// included; where that can't run, on damage: moves that KO go first, then the SMART chain with damage standing in
// for the move score. Without game code: the hardest-hitting move, always.
// A foe with nobody to aim at (our slot is empty while we pick a fainted mon's replacement) has no real distribution:
// the AI scores every move −∞ and the chain stops on the first, so the replay path answers instead.
export const likelyMoves = (turn, foe, me, outs, next, ranges = []) => {
  const live = turn.live;
  if (live && !next && foe.isOnField?.() && (foe.getOpponents?.() ?? [me]).length) {
    const dist = turn.enemyAction(foe, { ranges }).moves;
    if (dist?.length) {
      const idx = me.isOnField?.() ? me.getBattlerIndex?.() : null;
      return dist.map(d => {
        const o = outs.find(x => x.name === d.name) ?? null;
        // Share of this move that lands on `me` (doubles). A bench mon coming in takes an average slot's share.
        const ts = d.targetDist?.length ? d.targetDist : d.targets ?? [];
        let tp = 1;
        if (turn.facts.double && ts.length) {
          if (typeof ts[0] === "object") tp = o?.spread ? 1 : idx == null ? ts.reduce((t, x) => t + (x.p ?? 0), 0) / 2 : ts.find(x => x.battlerIndex === idx)?.p ?? 0;
          else tp = o?.spread ? (idx == null || ts.includes(idx) ? 1 : 0) : idx == null ? 1 / 2 : ts.includes(idx) ? 1 / ts.length : 0;
        }
        // The outcome's type is the one the move lands with (Tera Blast becomes the Tera type); the AI scored it
        // before Terastallizing, so its own row's type can be stale.
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

// P(`p` gets to use `mv` this turn, or next turn with `next`), as MovePhase rolls it: recharging
// after Hyper Beam → 0 (this turn only); asleep → 0 until its sleep counter runs out (one faster with Early Bird)
// unless the move works asleep (Sleep Talk, Snore); frozen → 1/4 thaw, sure once its freeze counter runs out, or a
// move that thaws the user; paralysis → 7/8; confused with turns left → 2/3.
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
// Turns before `p` can act at all: sleep left, or a recharge turn now.
const actDelay = p => {
  if (p.getTag?.("RECHARGING")) return 1;
  const st = p.status;
  if (st?.effect !== StatusEffect.SLEEP) return 0;
  const early = p.hasAbilityWithAttr?.("ReduceStatusEffectDurationAbAttr") ? 1 : 0;
  return Math.max(0, Math.ceil((st.sleepTurnsRemaining ?? 0) / (1 + early)) - 1);
};

// How `foe` threatens `me` over its likely moves: expected damage (for scoring), the worst max roll among moves it
// might realistically pick (for the 💀 flag), P(KO this turn at current HP) with crit rolls included, and
// P(foe acts before me) — `koFirst` weights that by the moves that KO. `myPm` is our planned move (turn order).
// Damage uses our true abilities (not the AI's view): the AI's blind spots decide what it picks, not what it deals.
// Each move is weighted by the chance the foe gets to use it (`actChance`: sleep, freeze, paralysis, confusion).
// `boost`: the stat stages its setup moves are expected to add a turn ({ [stat 1–5]: stages }), which later turns of
// a fight scale its hits and our hits into it by (`setupRamp`).
export const threatFrom = (turn, foe, me, myPm = null, { next = false } = {}) => turn.memo(`t:${foe.id}>${me.id}:${pmName(myPm)}:${next}`, () => {
  const outs = planOutcomes(turn, foe, me);
  const ranges = next ? [] : commandDraws(turn, me, myPm);
  const moves = likelyMoves(turn, foe, me, outs, next, ranges);
  if (!moves.length) return null;
  // The enemy's own turn, so the threat says how sure it is of the move it is built on: `exact` where the game's own
  // call answered for this command, `replay` where that answer rode on a draw our command made, `estimate`
  // otherwise (a later turn, a foe not out yet, no game code).
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
  // A turn's damage from it over its likely moves; a status move or a lost turn deals nothing.
  const dealt = use.reduce((sum, x) => sum + x.p, 0);
  if (dealt < 1) use.push({ d: 0, p: 1 - dealt, n: 0 });
  const brief = m => m && { name: m.name, type: m.type, e: m.o?.e ?? null, p: m.p, hits: hitCounts(m.o) };
  return {
    expected, worst: worst?.o.max ?? 0, pKo, first, koFirst: pKo > 0 ? koFirst / pKo : first,
    move: brief(likely), worstMove: brief(worst), moves: kos, hp: me.hp, from: foe.name, live, use: squeezeDist(use, 12),
    exact: !!exactRow, confidence: exactRow ? action.confidence : "estimate",
    // The slots the exact move is aimed at, as battler indices — the game's own answer, not a share.
    targets: exactRow ? [...(exactRow.targets ?? [])] : null,
    revive: Math.max(0, ...kos.map(k => k.revive)),
    boost: Object.keys(boost).length ? boost : null,
    // HP its drain moves give it back a turn (Liquid Ooze on `me`: taken off it), from the damage they deal.
    drain: drained,
  };
});

// Stat stages `p` gains for each KO, as FaintPhase.doFaint hands them out: PostVictoryStatStageChangeAbAttr when its own
// hit faints a foe (Moxie, Beast Boost on its highest stat, Chilling / Grim Neigh, As One, Battle Bond's non-Greninja
// form), PostKnockOutStatStageChangeAbAttr when anyone faints (Soul-Heart). { up: { [stat 1–5]: stages a KO },
// ability, any } (`any`: every faint counts, not only its own KOs), or null. Speed counts only for the name (the
// damage multipliers below leave it out). A suppressed ability (Neutralizing Gas) gives nothing.
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
// Damage factor after `n` KOs' worth of `boost` on stat `st`, from the stages `p` has now (capped at +6).
export const koStageFactor = (p, boost, n, st) => {
  const k = boost?.up?.[st] ?? 0;
  if (!k || !(n > 0)) return 1;
  const s0 = p?.isOnField?.() ? p.summonData?.statStages?.[st - 1] ?? 0 : 0;
  return stage(Math.max(-6, Math.min(6, s0 + k * n))) / stage(s0);
};
const STAT_ABBR = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
export const koBoostText = b => Object.entries(b.up).map(([st, n]) => `${n > 0 ? "+" : "−"}${Math.abs(n)} ${STAT_ABBR[st]}`).join(" ");
// What feeding `foe` one KO costs the fight still to come, in turns of ours: FEED_COST a stage it gains on an attacking
// stat or Speed, half that on a defence. Nothing once nobody else is left to face it.
const feedCost = (foe, others) => {
  const b = others > 0 ? koBoost(foe) : null;
  if (!b) return 0;
  return Object.entries(b.up).reduce((t, [st, n]) => t + Math.max(0, n) * ([Stat.DEF, Stat.SPDEF].includes(+st) ? 0.5 : 1), 0) * FEED_COST;
};
// A foe that sets up hits harder each turn it does: its damage on turn j (1 = this turn) against this turn's, from the
// Atk / SpA stages it's expected to have added by then (`t.boost`), weighed by how much of its damage is physical.
// Null when it isn't raising an attacking stat.
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

// P(KO) of a threat against `me` at a different HP (after an incoming hit): each likely move's `koChanceAt`, by its share.
const threatKoAt = (t, hp) => (!t ? 0 : hp <= 0 ? 1 : Math.min(1, t.moves.reduce((sum, m) => sum + m.p * koChanceAt(m, hp), 0)));
// Wave status tokens (EnemyAttackStatusEffectChanceModifier): each landed hit of an enemy attack rolls every token,
// `chance`·stack each (5 % burn/poison, 2.5 % the rest), and the first status to land blocks the others.
const statusTokens = (turn, foe, me) => {
  if (!foe || foe.isPlayer?.() || me.status?.effect) return [];
  return turn.facts.enemyModifiers.filter(m => m.constructor?.name === "EnemyAttackStatusEffectChanceModifier")
    .map(m => ({ effect: m.effect, q: Math.min(1, (m.chance ?? 0.025) * (m.getStackCount?.() ?? 1)) }))
    .filter(x => x.q > 0 && turn.mon(me).canTake(x.effect, foe));
};
// Share of attempts a status cancels, by attempt since it landed (MovePhase): sleep lasts 2 (⅓) or 3 (⅔) turns and
// ticks down before the check, so it cancels 1 or 2 attempts (Early Bird ticks twice: 1 at most, ⅔); freeze starts
// at 3 and cancels each of the first two attempts ¾ of the time (a ¼ thaw), the third always thaws. Paralysis
// cancels 1 in 8 for good (`attemptsLost`).
const STATUS_SKIP = {
  [StatusEffect.SLEEP]: (a, early) => (early ? (a === 0 ? 2 / 3 : 0) : a === 0 ? 1 : a === 1 ? 2 / 3 : 0),
  [StatusEffect.FREEZE]: a => (a === 0 ? 3 / 4 : a === 1 ? 9 / 16 : 0),
};
// The wave tokens `foe`'s hits can hand `me`: `by(x)`, P(`me` has a token's status after x landed hits), and each
// token's `share` of that. Null when none can land.
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
// Turn-end HP change a token's status adds to `me` (poison and burn chip, Poison Heal), weighted by the shares.
// `heal(p)`: the turn-end HP change of `p`.
export const tokenShift = (odds, me, heal) => {
  const base = heal(me);
  return odds.tokens.reduce((sum, x) => sum + x.share * (heal(Object.create(me, { status: { value: { effect: x.effect, toxicTurnCount: 0 } } })) - base), 0);
};
// Expected share of `me`'s attempt on turn k that token statuses cancel, from `by(t)` — P(statused by the end of turn
// t), t = 0 before this fight — and P(the foe moves first). A status from a hit before our move cancels that turn's.
// Sleep and freeze from before the fight are taken as worn off; paralysis stays.
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
// What wave status tokens do to `me`'s own turns in a fight with `foe`, which lands `hitsPerTurn` hits a turn and moves
// first with `pFoeFirst`: `act(k)`, the share of turn k's attempt not cancelled, and `para(k)`, P(paralysed by then).
// Null when no token can cancel anything.
export const tokenActs = (turn, foe, me, hitsPerTurn, pFoeFirst) => {
  const odds = hitsPerTurn > 0 ? tokenOdds(turn, foe, me) : null;
  if (!odds?.tokens.some(x => x.effect === StatusEffect.PARALYSIS || STATUS_SKIP[x.effect])) return null;
  const by = t => odds.by(hitsPerTurn * t);
  return {
    act: k => 1 - attemptsLost(odds, by, k, pFoeFirst),
    para: k => odds.tokens.filter(x => x.effect === StatusEffect.PARALYSIS).reduce((sum, x) => sum + x.share, 0) * by(k),
  };
};

// Item thieves `foe` holds against `me`. Grip Claw (ContactHeldItemTransferChanceModifier) rolls 10 %·stack on each
// landed hit of an attack, before turn end; Mini Black Hole (TurnHeldItemTransferModifier) steals once per its stack
// at turn end, after `me`'s own heals. Sticky Hold blocks both.
const THIEVES = { ContactHeldItemTransferChanceModifier: "Grip Claw", TurnHeldItemTransferModifier: "Mini Black Hole" };
const transferable = p => (p.getHeldItems?.() ?? []).filter(m => m.isTransferable !== false);
const thieves = (foe, me) => (me.hasAbilityWithAttr?.("BlockItemTheftAbAttr") || !transferable(me).length ? []
  : (foe.getHeldItems?.() ?? []).filter(m => THIEVES[m.constructor?.name]));
// { perHit, perTurn }: expected Grip Claw steals per landed hit, Mini Black Hole steals per turn.
export const stealRates = (foe, me) => {
  let perHit = 0, perTurn = 0;
  for (const m of thieves(foe, me)) {
    const n = m.getStackCount?.() ?? 1;
    if (m.constructor.name === "TurnHeldItemTransferModifier") perTurn += n;
    else perHit += Math.min(1, (m.chance ?? 0.1) * n);
  }
  return perHit || perTurn ? { perHit, perTurn } : null;
};
// P(k steals) for k = 0..9 (9 takes the tail): `fixed` sure steals plus Grip Claw's, Poisson with mean `mean`.
export const stealCounts = (fixed, mean) => {
  const out = Array(10).fill(0);
  let pk = Math.exp(-mean), rest = 1;
  for (let k = 0; fixed + k < 9; k++) { out[fixed + k] = pk; rest -= pk; pk *= mean / (k + 1); }
  out[9] += Math.max(0, rest);
  return out;
};
// `me`'s turn-end HP change after 0..9 steals ([k]: after k), by `heal(p)`. A steal picks one of the transferable
// items still held, at random, and takes one of its stacks (HeldItemTransferModifier.apply); an item at no stacks
// is gone.
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

// Turn-end HP change of `me` at the end of turn j (1 = this turn) of a fight with `foe`, which lands `hitsPerTurn`
// hits a turn on it: `at(j)`. Constant (`flat`) unless
// - the foe's hits can hand `me` a status whose chip or heal (Poison Heal) then comes every turn: weighted by the
//   chance it has landed by turn j;
// - the foe steals `me`'s items: what they add (Leftovers, Shell Bell, berries; an orb's chip) is weighed over how
//   many steals there may have been by then.
// Toxic's chip grows by a 16th each turn it stays on.
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
// A turn-end HP change (a number, or one by turn) plus the HP a side's drain moves win back each turn.
const withDrain = (heal, drain) => (!drain ? heal : typeof heal === "function" ? j => heal(j) + drain : heal + drain);

// How a threat wears `me` down from `hp` (a `koCurve` over its uses, one a turn), turn-end HP changes included.
// `dealt`: what we deal a turn, for Shell Bell. `foe`: who the threat is from (its tokens and thieves). `mult(j)`: its
// damage on turn j against the expected, when that changes over the fight (a boss's boosts as its bars break, our
// lowered defences). `act(i)`: the chance it gets its i-th attack off (our flinches). Its setup moves ramp its later
// hits (`setupRamp`). Chip can finish the job on the hit turn (or alone, against a foe that doesn't attack). `drain`: HP
// our own drain moves win back a turn (negative into Liquid Ooze).
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
// Turns a threat needs to KO `me` from `hp`: its curve's `koTurns`.
const foeTurns = (turn, t, me, hp, opts = {}) => koTurns(foeCurve(turn, t, me, hp, opts).by);

// One-on-one from now: `me` repeats `pm` into `foe` while `foe` answers with its likely moves. Turn 1 is played
// with the real odds — order, accuracy, rolls, crits, Sturdy/Focus Band (inside pKo); later turns KO or don't from
// each use's damage distribution (`koCurve`), with boss bars (each clamps a hit at its boundary; a wild boss's Def/SpD
// and Atk/SpA rise when one breaks), a Reviver Seed's second life, turn-end heals and chip (with wave status tokens and
// item thieves), a faster foe's King's Rock flinches and our own move's flinch. Who KOs first is a race over those
// curves, turn by turn, a speed tie a coin flip on each. Options: `hp` (ours after an incoming hit), `after` (a turn
// already played: `turn1` of an earlier exchange, whose HP branches both curves start from — this turn's exact odds
// don't hold there, the distributions do), `free` (the foe is switching in and doesn't act this turn), `next` (the foe
// re-picks its move against us next turn), `outcome` (our move's record, if already at hand), `foeAct(i)` (the share of
// its i-th attempt from now that a status we gave it leaves standing: sleep). A foe likely to Protect this turn blocks
// our move, and a foe setting up raises the defence our later hits meet and may come to outspeed us.
// The move's own costs are priced in: turns (charge, recharge, not twice in a row, Outrage's confusion, falling
// Atk/SpA on repeats, our sleep or paralysis), the HP it costs us (recoil, Steel Beam, crash, contact chip, lowered
// defences, self-KO) and `cost` — our max HP it spends plus a little for a lock-in — for scoring ties.
// `turn1`: this turn alone — P(we KO first), P(they do), and the HP branches each side stands on if neither does
// (`foe`, `me`, each summing to 1; `hp` our average), which depth 2 plays on from.
export const exchange = (turn, me, pm, foe, opts = {}) => {
  const hp = opts.hp ?? me.hp;
  const after = opts.after ?? null;
  const exact = !after;
  const mine = opts.outcome ?? planOutcomes(turn, me, foe).find(o => o.name === pmName(pm)) ?? null;
  // What the move itself costs over turns (07-move-traits, through the outcome record); what those turns are worth
  // is this module's.
  const mt = mine?.traits ?? {};
  const t = threatFrom(turn, foe, me, pm, { next: !!opts.next });
  const pFirst = t ? 1 - (t.pKo > 0 ? t.koFirst : t.first) : 1;
  const pF = opts.free ? 1 : pFirst;
  // Chance our move does its job when chosen: we get to act, Focus Punch isn't hit first, Sucker Punch meets an
  // attack, a foe mid-Dig / Fly has come out first. `steady`: the part that recurs on later turns.
  const foeAttacks = opts.free || !t ? 0 : Math.min(1, t.moves.reduce((sum, m) => sum + m.p, 0));
  const needs = (mt.interrupt ? 1 - foeAttacks * (1 - pF) : 1) * (mt.needsAttack ? foeAttacks * pF : 1);
  // Protect this turn only: a second one in a row mostly fails, and the replay of later turns can't see the first.
  const guard = opts.free || opts.next || after || mine?.bypassProtect ? 0 : protectChance(turn, foe);
  // King's Rock: 10 % a stack to flinch us with each attack that lands before we move.
  const flinch = Math.min(1, 0.1 * heldStack(foe, "FlinchChanceModifier")) * foeAttacks;
  const steady = (me.status?.effect === StatusEffect.PARALYSIS ? 7 / 8 : 1) * needs * (1 - flinch * (1 - pF));
  // Wave status tokens: sleep, freeze and paralysis the foe's hits may hand us cancel some of our later attempts.
  const acts = opts.free || !t ? null : tokenActs(turn, foe, me, hitsOn(t), 1 - pF);
  const now = actChance(me, pm?.getMove?.() ?? null, !!opts.next) * needs * (mine?.semi ? 1 - pF : 1) * (acts ? acts.act(1) : 1) * (1 - guard);
  // Our move's flinch (Fake Out, Iron Head): a landed hit before the foe moves cancels its move that turn.
  const ourFlinch = opts.free ? 0 : Math.min(1, (mine?.flinch ?? 0) * (mine?.acc ?? 1));
  const maxHp = me.getMaxHp?.() ?? hp;
  const bars = bossBarsLeft(foe);
  const trainerBoss = foe.hasTrainer?.() ?? !!turn.facts.trainer;
  let turnsWe = 9, hitsWe = 9, delay = 0, selfSpent = 0, defUp = 1, foeMult = null, foeAfter1 = after?.foe ?? null;
  let weBy = () => 0, qWe = 0, confusion = 0;
  if (mine?.expected > 0) {
    // Overheat-type drops to the stat the move attacks with weaken every repeat.
    const atkStat = mine.cat === "special" ? Stat.SPATK : Stat.ATK;
    const drop = mt.drops?.[atkStat] ?? 0;
    const s0 = me.summonData?.statStages?.[atkStat - 1] ?? 0;
    // Its turn-end HP change, with our item thieves on it (`steady` of our hits land a turn).
    const course = turnEndCourse(turn, foe, me, steady * (mine.acc ?? 1) * ((mine.dist ?? []).reduce((sum, d) => sum + d.n * d.p, 0) || 1), t?.expected ?? 0);
    // Its drain moves (Leech Life) win back part of what they deal us every turn it stands.
    const heal = withDrain(course.flat ? course.base : course.at, t?.drain ?? 0);
    // Its own setup raising (or Shell Smash lowering) the defence this move meets, by our i-th use.
    const defStat = mine.cat === "special" ? Stat.SPDEF : Stat.DEF;
    const defUpBy = t?.boost?.[defStat] ?? 0;
    const d0 = foe.summonData?.statStages?.[defStat - 1] ?? 0;
    const scale = i => stage(Math.max(-6, s0 + drop * i)) / stage(s0)
      * (defUpBy ? stage(d0) / stage(Math.max(-6, Math.min(6, d0 + defUpBy * i))) : 1);
    // Turns around the hits: sleep or a recharge now, a foe hidden mid-Dig that we'd outspeed; a charging turn per
    // hit, a lost turn between hits (recharge, or a move that can't be used twice in a row); Outrage's lock runs
    // 2–3 turns and the confusion after it wastes a third of up to two more hits.
    delay = actDelay(me) + (mine.semi && pF >= 0.5 ? 1 : 0);
    // Use 1 is this turn's move unless it charges or waits: then this turn's exact odds are its own.
    const nowUse = !mt.charge && delay === 0;
    qWe = nowUse ? (mine.pKo ?? 0) * now : 0;
    // Through what's left of its bars (a wild boss's Def / SpD rising as each breaks) and a Reviver Seed's second life.
    const curve = koCurve(turn.mon(foe), useOf(mine), {
      scale, turnEnd: heal, cat: mine.cat,
      act: i => (i === 0 && nowUse ? now : steady * (acts ? acts.act(i + 1) : 1)),
      firstKo: exact && nowUse ? qWe : null, start: after?.foe,
    });
    // The uses each bar takes: they pace a wild boss's own boosts below.
    const perChunk = curve.perChunk;
    if (!exact && nowUse) qWe = curve.by[0];
    hitsWe = koTurn(curve.by);
    const cycle = mt.recharge || mt.noRepeat ? 2 * hitsWe - 1 : mt.charge ? 2 * hitsWe : hitsWe;
    const confusedHits = mt.lock ? Math.min(Math.max(0, hitsWe - 2), 2) : 0;
    confusion = confusedHits * 0.5;
    turnsWe = mt.once && hitsWe > 1 ? 9 : Math.min(9, Math.ceil(delay + cycle + confusedHits * 0.5));
    // Uses made by the end of turn j, for the race.
    const usesBy = j => {
      const k = j - delay;
      if (k <= 0) return 0;
      const n = mt.charge ? Math.floor(k / 2) : mt.recharge || mt.noRepeat ? Math.ceil(k / 2) : k;
      return Math.min(9, mt.once ? Math.min(1, n) : n);
    };
    weBy = j => (usesBy(j) ? curve.by[usesBy(j) - 1] : 0);
    if (nowUse) foeAfter1 = curve.after1;
    // The foe's own boosts from those breaks (by how much of its damage is physical), from the turn our hit breaks
    // each bar: that turn's hit from it is boosted only if we moved first.
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
    // Confusion hurts itself with a typeless 40-power physical hit a third of the time.
    const confusionHit = confusedHits && ((2 * me.level / 5 + 2) * 40 * stat(me, Stat.ATK) / stat(me, Stat.DEF) / 50 + 2) * 0.925;
    selfSpent = (mine.self ?? 0) * Math.min(hitsWe, turnsWe) + confusedHits * 1.5 * confusionHit / 3;
    // Lowered Def / SpD (Close Combat, V-create) after the first use: the foe hits harder on the rest.
    const soften = st => (mt.drops?.[st] ? stage(me.summonData?.statStages?.[st - 1] ?? 0) / stage(Math.max(-6, (me.summonData?.statStages?.[st - 1] ?? 0) + mt.drops[st])) : 1);
    if (hitsWe > 1 && (mt.drops?.[Stat.DEF] || mt.drops?.[Stat.SPDEF])) defUp = 1 + ((soften(Stat.DEF) + soften(Stat.SPDEF)) / 2 - 1) * (hitsWe - 1) / hitsWe;
  }
  // Our own toll comes off the HP the foe has to get through (front-loaded); if it alone would drop us, we go down
  // around our last hit.
  const selfKo = mt.selfKo === "always" ? 1 : mt.selfKo === "onHit" ? mine?.acc ?? 1 : 0;
  const budget = hp - selfSpent;
  const foeT = defUp !== 1 && t ? { ...t, expected: t.expected * defUp } : t;
  // Its attacks our flinch cancels: this turn's if we move first and act, later ones only for a repeatable move.
  const foeAct = i => (1 - ourFlinch * (i === 0 ? pF * now : mt.once ? 0 : pFirst * steady)) * (opts.foeAct ? opts.foeAct(i) : 1);
  const mult = foeMult || defUp !== 1 ? j => (foeMult ? foeMult(j) : 1) * defUp : null;
  const myStart = after?.me.map(x => ({ ...x, hp: x.revived ? x.hp : x.hp - selfSpent })).filter(x => x.hp > 0);
  // Our drain move wins back its share of what it deals on each turn it lands.
  const ourDrain = (mine?.drain ?? 0) * (mine?.expected ?? 0) * steady;
  const theirs = budget > 0 ? foeCurve(turn, foeT, me, budget, {
    dealt: mine?.uncapped ?? mine?.expected ?? 0, foe, mult, act: foeAct, start: myStart?.length ? myStart : null, drain: ourDrain,
  }) : null;
  const turnsFoe = theirs ? koTurn(theirs.by) : Math.max(1, Math.min(turnsWe, 9));
  const lag = opts.free ? 1 : 0;
  let turnsThey = Math.min(9, turnsFoe + lag);
  if (selfKo >= 0.5) turnsThey = Math.min(turnsThey, delay + 1);
  // P(we're down by the end of turn j): its curve a turn late when it's switching in, our self-KO after our move.
  const theyBy = j => {
    const k = Math.min(9, j - lag);
    const by = theirs ? (k >= 1 ? theirs.by[k - 1] : 0) : j >= turnsFoe + lag ? 1 : 0;
    return 1 - (1 - by) * (1 - (j >= delay + 2 ? selfKo : 0));
  };
  const qThey = opts.free ? 0 : exact ? threatKoAt(t, hp) * foeAct(0) : theirs?.by[0] ?? 1;
  const weFirst = pF * qWe + (1 - pF) * (1 - qThey) * qWe * (1 - flinch);
  const theyFirst = (1 - pF) * qThey + pF * (1 - qWe) * qThey;
  // Who moves first on the deciding turn: a token's paralysis by then halves our Speed.
  let pLast = pFirst;
  const pPara = acts && turnsWe < 9 ? acts.para(turnsWe - 1) : 0;
  if (pPara > 0) {
    const slowed = { id: { value: `${me.id}~paralysed` }, status: { value: { effect: StatusEffect.PARALYSIS } } };
    if (typeof me.getEffectiveStat !== "function") slowed.getEffectiveStat = { value: i => stat(me, i) / (i === Stat.SPD ? 2 : 1) };
    const tp = threatFrom(turn, foe, Object.create(me, slowed), pm, { next: !!opts.next });
    pLast = (1 - pPara) * pFirst + pPara * (tp ? 1 - (tp.pKo > 0 ? tp.koFirst : tp.first) : pFirst);
  }
  // A foe boosting its Speed (Dragon Dance) passes us once it has the stages it needs, unless our move has priority:
  // our share of moving first on the deciding turn falls with the stages it's expected to have gained by then.
  const speedUp = t?.boost?.[Stat.SPD] ?? 0;
  if (speedUp > 0 && turnsWe > 1 && turnsWe < 9 && !((mine?.priority ?? 0) > 0) && pLast > 0) {
    const mySpe = turn.mon(me).speed, foeSpe = turn.mon(foe).speed, s5 = foe.summonData?.statStages?.[Stat.SPD - 1] ?? 0;
    let need = 0;
    while (s5 + need < 6 && foeSpe * stage(s5 + need) / stage(s5) <= mySpe) need++;
    if (need > 0 && foeSpe * stage(s5 + need) / stage(s5) > mySpe) pLast *= Math.max(0, 1 - speedUp * (turnsWe - 1) / need);
  }
  // The race after turn 1: each side's chance to KO on turn j given it hasn't yet, taken as independent; on a turn
  // both would, the order decides.
  const hazard = (F, j) => (F(j - 1) >= 1 ? 1 : Math.max(0, (F(j) - F(j - 1)) / (1 - F(j - 1))));
  let pWe = weFirst, pThey = theyFirst, standing = Math.max(0, 1 - weFirst - theyFirst);
  for (let j = 2; j <= 9 && standing > 1e-6; j++) {
    const a = hazard(weBy, j), b = hazard(theyBy, j);
    pWe += standing * a * (1 - b + b * pLast);
    pThey += standing * b * (1 - a + a * (1 - pLast));
    standing *= (1 - a) * (1 - b);
  }
  // Expected turns to each KO, for scoring: `turnsWe` / `turnsThey` are the likely ones the panel shows.
  const expTurns = F => Math.min(9, 1 + Array.from({ length: 8 }, (_, j) => 1 - F(j + 1)).reduce((t, x) => t + x, 0));
  const taken = turnsWe >= 9 ? turnsThey : Math.max(0, turnsWe - pLast - lag);
  const boosted = foeMult && taken > 0 ? Array.from({ length: Math.ceil(taken) }, (_, i) => foeMult(i + 1)).reduce((sum, x) => sum + x, 0) / Math.ceil(taken) : 1;
  const hpLeft = Math.max(0, Math.min(maxHp, hp - (t?.expected ?? 0) * defUp * boosted * taken - selfSpent + ourDrain * Math.min(taken, turnsWe))) * (1 - selfKo);
  return {
    pWeKoFirst: Math.min(1, Math.round(pWe * 1e9) / 1e9), pTheyKoFirst: Math.min(1, Math.round(pThey * 1e9) / 1e9),
    expectedHpLeft: Math.round(hpLeft),
    turnsWe, turnsThey, pFirst, hitsWe,
    eTurnsWe: Math.min(9, expTurns(weBy) + confusion), eTurnsThey: expTurns(theyBy),
    cost: Math.min(1, (selfSpent + selfKo * Math.max(0, hp - selfSpent)) / maxHp) + (mt.lock ? 0.1 : 0),
    turn1: (() => {
      // Our branches in real HP: the curve front-loaded every use's self-cost, turn 1 has only paid one.
      const me1 = opts.free || !theirs ? [{ hp, p: 1 }]
        : theirs.after1.map(x => ({ ...x, hp: x.revived ? x.hp : Math.min(hp, x.hp + selfSpent - (mine?.self ?? 0)) }));
      return {
        we: weFirst, they: theyFirst, me: me1, hp: me1.reduce((t, x) => t + x.p * x.hp, 0),
        foe: foeAfter1 ?? [{ hp: foe.hp, p: 1 }],
      };
    })(),
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
// Does `a`, a **move trap** of `foe` (`01-core`'s `MOVE_TRAPS`), bite `move`: an immunity (by type, or by move flag -
// Soundproof and co.), a damage cut, or a punish on contact? Read off the engine mons the plan still holds, so it
// sees the move's flags and the foe's real abilities. Intimidate only on a foe coming in (on the field its drop is
// already in our stat stages); never Sturdy, which the KO model already counts. A **field trap** is not asked here at
// all — it holds whatever we pick. The one place that asks, so the slot line and the foe rows agree: the slot line
// asks it of the move it picked, the rows of a whole pool.
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
// The move traps the slot's own move runs into, on the foes it actually hits. Field traps are left to the foe rows:
// they say nothing about the move this line picked.
const trapsOn = (p, active) => {
  if (!p.move?.pm?.getMove?.() || p.self || p.target === null || p.target === undefined) return [];
  const foes = p.target === "both" ? active : [active[p.target]];
  return [...new Set(foes.filter(Boolean).flatMap(foe => abilitiesOf(foe).filter(a => MOVE_TRAPS.has(a) && bites(a, foe, p.move))))];
};

export const fieldPlan = (turn, party, active, double, attackers = active, { freeSwitch = false, locked = null, team = null } = {}) => {
  // Our side has two slots whenever two of us can stand, even if only one foe is left; `pair`: two foes to aim at.
  const slots = double && party.length >= 2 ? 2 : 1;
  const pair = double && active.length === 2;
  const current = party.filter(p => p.isOnField?.());
  const lock = slots === 2 && locked && party.includes(locked.switchIn ?? locked.me) ? locked : null;
  // The real turn, under a name nothing shadows. The scorers below take a **hypothesis** — the state a status play
  // would make (#262) — and shadow `turn` with its own turn, so the same code answers on either state. These two are
  // the only way a hypothesis is read: `turnOf` for the turn to ask, `actOn` for the share of a foe's attempts that
  // still happen once the status has cost it some (`foeCurve`'s `act`, `exchange`'s `foeAct`).
  const now = turn;
  const turnOf = hyp => hyp?.at ?? now;
  const actOn = (hyp, mon) => hyp?.lost?.find(x => x.mon === mon)?.act ?? null;

  // A voluntary switch-in is hit before it acts, by moves the AI picked against the mon leaving.
  const inMemo = new Map();
  const incoming = me => {
    if (!inMemo.has(me)) {
      const ts = attackers.map(f => threatFrom(turn, f, me)).filter(Boolean).sort((a, b) => b.expected - a.expected);
      // Game-code threats already split single-target moves between our slots; the approximation assumes the
      // worst foe hits it plus half of the other.
      const dmg = ts.some(t => t.live) ? ts.reduce((sum, t) => sum + t.expected, 0) : (ts[0]?.worst ?? 0) + (ts[1]?.worst ?? 0) * 0.5;
      const ko = 1 - ts.reduce((keep, t) => keep * (1 - threatKoAt(t, me.hp)), 1);
      inMemo.set(me, { dmg, ko });
    }
    return inMemo.get(me);
  };

  // `entering`: switched in by choice this turn — it arrives with the incoming hit taken and a turn lost (its move
  // happens next turn, against what the foe then picks for it), and a switch-in likely to be KO'd coming in is
  // never an option. A foe that is itself switching in doesn't attack this turn: a mon that stays gets a free hit.
  // `mine`: slot 0's locked command, when `me` is that slot.
  const options = (me, entering, mine = null, hyp = null) => {
    // `hyp`: the turn a status play would make (#262) — the state written on (`at`), the HP a heal puts back
    // (`bump`), and the attempts the status costs each foe it hit (`lost`, the `foeAct` share #74 already models,
    // shifted so index 0 is this turn's attempt). Shadowing `turn` means nothing in the body has to know. Under a
    // hypothesis the search is bounded to this turn — no depth 2, no status plays of its own — and `incoming` stays
    // on the real turn: a switch-in takes its entry hit before any of this lands.
    const turn = turnOf(hyp);
    const assumed = !!hyp;
    const inc = entering ? incoming(me) : { dmg: 0, ko: 0 };
    const hp = Math.min(me.getMaxHp?.() ?? Infinity, me.hp - inc.dmg + (hyp?.bump ?? 0));
    // A switch-in must get to act once: count it lost if it's KO'd coming in, or survives only to be KO'd next
    // turn before it moves (the foe re-picks against it, on the HP the entry hit left).
    const beforeActing = hp <= 0 ? 1 : 1 - active.reduce((keep, f) => {
      const t = threatFrom(turn, f, me, null, { next: true });
      return keep * (1 - threatKoAt(t, hp) * (t?.koFirst ?? 0));
    }, 1);
    const lostChance = entering ? inc.ko + (1 - inc.ko) * beforeActing : 0;
    if (hp <= 0 || lostChance >= 0.25) return [{ me, move: null, target: null, turns: 9, hits: 9, score: -99, hp: 0 }];
    const lost = entering ? 1 : 0;
    const free = f => !entering && !attackers.includes(f);
    // A mon not yet on the field faces what the foe picks for it, not the move it chose against the current field.
    const next = entering || !me.isOnField?.();
    const danger = Math.min(...active.map(f => Math.min(9, foeTurns(turn, threatFrom(turn, f, me, null, { next }), me, hp, { foe: f, act: actOn(hyp, f) ?? undefined }) + (free(f) ? 1 : 0))));
    const trade = (o, f) => exchange(turn, me, o.pm, f, { hp, outcome: o, free: free(f), next, foeAct: actOn(hyp, f) });
    const last = entering ? null : lastMoveOf(me);
    const cost = o => -(o.benefit ?? 0) * AI_POINT - (last != null && o.pm?.moveId === last ? KEEP_BONUS : 0);
    // Falling to a foe with an on-KO boost (Beast Boost, Moxie) arms it against whoever comes next.
    const feed = f => feedCost(f, party.length - 1);
    const one = (o, fi) => {
      const x = trade(o, active[fi]);
      const turns = x.turnsWe + lost;
      return { me, move: o, target: fi, turns, hits: x.turnsWe, score: danger - x.eTurnsWe - lost + (x.pWeKoFirst - x.pTheyKoFirst) - (x.cost ?? 0) - cost(o) - feed(active[fi]) * x.pTheyKoFirst, hp, trade: x };
    };
    // A single-target hit that resolves after its target has fallen is **redirected onto the surviving foe** by the
    // game — `FaintPhase` → `redirectPokemonMoves` retargets every still-queued single-target move aimed at the
    // fainted mon, with no accuracy, type or range check — so it carries the move this slot chose for the target,
    // not one picked for the survivor. `redirScore` is what that redirected hit is worth; `mix` prices the blend (#236).
    // A move the survivor is immune to buys nothing, and scores the empty turn the same way a mon with no move does.
    const withRedirScore = x => {
      if (!pair || x.play || typeof x.target !== "number" || !x.move?.pm) return x;
      const oi = 1 - x.target;
      const y = planOutcomes(turn, me, active[oi]).find(z => z.name === x.move.name);
      return { ...x, redirScore: y?.expected > 0 ? one(y, oi).score : danger - 9 };
    };
    // Depth 2: this turn's move played out exactly — the order, its KO odds, its flinch — then, from the HP it is
    // expected to leave on both sides, the best move for the rest of the fight against what the foe re-picks. It
    // finds what repeating one move can't: Fake Out then an attack, a big hit then a priority finisher. Kept when it
    // beats repeating the move by more than a rounding error (DEPTH_GAIN); `then` names the follow-up.
    const deeper = x => {
      const o = x.move, f = active[x.target], t1 = x.trade?.turn1;
      if (!t1 || o.traits?.charge || o.traits?.recharge || o.traits?.lock || o.traits?.selfKo || o.semi || actDelay(me)) return x;
      const standing = 1 - t1.we - t1.they;
      if (standing < 0.05) return x;
      // A follow-up that also hits our partner isn't weighed here: the joint scoring only sees this turn's hits.
      const pool = planOutcomes(turn, me, f).filter(y => y.expected > 0 && !(pair && y.spread) && !(slots === 2 && hitsAlly(y)) && !(y === o && o.traits?.once));
      const cands = [...new Set([...[...pool].sort((a, b) => b.expected - a.expected).slice(0, 2), ...pool.filter(y => (y.priority ?? 0) > 0).slice(0, 1),
        ...(pool.includes(o) ? [o] : [])])];
      const value = y => {
        const x2 = exchange(turn, me, y.pm, f, { hp: t1.hp, after: t1, outcome: y, next: true });
        return { y, x2, v: x2.eTurnsThey - x2.eTurnsWe + x2.pWeKoFirst - x2.pTheyKoFirst - (x2.cost ?? 0) };
      };
      const tried = cands.map(value);
      const best = tried.reduce((b, t) => (!b || t.v > b.v ? t : b), null);
      if (!best || best.y === o) return x;
      const scoreOf = ({ x2 }) => {
        const eTurns = 1 + (1 - t1.we) * x2.eTurnsWe;
        const edge = t1.we + standing * x2.pWeKoFirst - (t1.they + standing * x2.pTheyKoFirst);
        const spent = Math.min(1, (o.self ?? 0) / (me.getMaxHp?.() || hp)) + (x2.cost ?? 0);
        return danger - eTurns - lost + edge - spent - cost(o) - feed(f) * (t1.they + standing * x2.pTheyKoFirst);
      };
      const score = scoreOf(best);
      const { y, x2 } = best;
      if (!(score > x.score + DEPTH_GAIN)) return x;
      const hits = t1.we >= 0.5 ? 1 : Math.min(9, 1 + x2.turnsWe);
      return { ...x, turns: hits + lost, hits, score, then: y };
    };
    // A spread move is scored on **every foe it actually hits**: one it can't touch — a flag or type immunity, Wonder
    // Guard — contributes nothing rather than sinking the option, because the move still does its work on the other
    // side. `each`: turns to KO each foe (9 for one it never touches); `hits` is when the foes it does hit are down;
    // the move carries the record of the first of them, and the bonus for covering two foes is earned only by hitting
    // two.
    // Takes the move's name, not one foe's record of it: the record differs per foe, and picking one up front is what
    // made this read a double as one foe.
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
        score: danger - slow - lost + (hit.length > 1 ? 1 : 0) + edge - cost(both0), hp };
    };
    // Status moves (single battles): this turn spent on a setup move, a status, a heal or a hazard, then the best
    // attack from what it leaves. Turn 1 is an `exchange` in which we deal nothing; its effect is written onto the mons
    // for the turns after (`turn.assuming`), so the game's own damage, turn-end and AI code price them — the boosted
    // hits, the paralysed foe's lost Speed, its moves re-picked against our boosts — and the attack is chosen there.
    // The move has to work: we act (not asleep, flinched or KO'd first) and it isn't Protected, dodged, bounced or met
    // by an immunity; when it doesn't, the fight plays on from the unchanged state. A heal changes our HP branches
    // instead, and a sleep or paralysis that lands before the foe moves can cancel this turn's hit too. Scored like a
    // depth-2 line, less STATUS_COST.
    // What a status play is worth before anything is scored on it, and the same for either battle: the exchange it
    // shares with an attack (for who moves first), how often it works at all, and how it reads on the line. A play
    // that works less than a twentieth of the time isn't offered. Null there, so both callers drop it.
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
    const playOption = (info, play, fi) => {
      const start = playStart(info, play, fi);
      if (!start) return null;
      const { f, pm, mv, t, x1, pF, works, maxHp } = start;
      const t1 = x1.turn1;
      let they = t1.they, mine1 = t1.me;
      if (play.kind === "heal") {
        // Healed after its hit when it moves first; before, so the heal can lift us out of this turn's KO, otherwise.
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
      // The state the move would make is a turn of its own: the game's damage, turn-end and AI code answer on it,
      // in its own memo slots, and the real turn is untouched.
      // With nothing to attack with, the turns after the play are still worth pricing: `exchange` reads a null move
      // as dealing nothing, so the line is the foe wearing us down against a mon the play has slowed, and what the
      // play is worth is the damage it keeps off us rather than the KO it brings nearer (#263). Bailing here instead
      // is what left a slot with no damaging move a dead end — the one case a status play is all there is.
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
      // The same nudge every attacking option gets: what the game's own scoring makes of this move here.
      const nudge = turn.benefit(me, f, mv) * AI_POINT;
      const hits = Math.min(9, 1 + landed.x2.turnsWe);
      return {
        me, move: { name: info.name, type: info.type, cat: "status", pm, expected: 0, notes: [] }, target: fi, self: !!play.self,
        turns: hits + lost, hits, score: danger - eTurns - lost + edge - spent + start.keep + bonus + nudge - STATUS_COST, hp, then: landed.y,
        effect: start.effect,
      };
    };
    // A status play in a double has no 1-v-1 follow-up to be scored from: `follow()` would price the effect against
    // the whole of one foe's damage where the field splits it, which is what #74 excluded doubles over. The candidate
    // carries the effect and how often it works, and `add` prices it against the partner's pick on the state it makes
    // (#262). What is settled here is only the part no partner changes: the turn it spends, what it costs, the
    // nudges every option gets. `hits` is filled in by the caller, which knows how soon this slot was going to KO.
    const playCandidate = (info, play, fi) => {
      const start = playStart(info, play, fi);
      if (!start) return null;
      const { f, mv, pF, works, maxHp } = start;
      // The same nudge every attacking option gets: what the game's own scoring makes of this move against this
      // foe. The per-slot cap cuts on that discounted by how often the play works, so a sure Spore outranks a
      // Hypnosis the foe shrugs off two times in five rather than tying with it.
      const benefit = turn.benefit(me, f, mv);
      // Attempts the status costs the foe, indexed from this turn's: sleep and freeze cancel this one too when we
      // move first (`skip0`), and #74's `foeAct` answers for every one after it. Nothing here writes on the state —
      // `getNextMove` picks a move whether or not the mon is asleep — so this is the only place the effect is felt.
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
      // Scored like any option so the partner's search and the joint see it; a move the planner can't score
      // (status, Struggle) is shown as chosen and aims nowhere.
      const name = pmName(mine.pm) || "Struggle";
      // A locked spread move is scored the same way a chosen one is — `both` reads every foe itself, so this path
      // never picks one foe's record up front either.
      const aimed = mine.target === "both" ? 0 : mine.target;
      const o = mine.target == null ? null : planOutcomes(turn, me, active[aimed]).find(x => x.name === name);
      const p = mine.target === "both" && pair ? both(name) : o && one(o, aimed);
      const mv = mine.pm?.getMove?.();
      const bare = { me, move: { name, type: TYPES[mv?.type] ?? null, cat: mv?.category === MoveCategory.STATUS ? "status" : null, pm: mine.pm, expected: 0 }, target: null, turns: 9, hits: 9, score: 0, hp };
      return [withRedirScore({ ...(p ?? bare), locked: true })];
    }
    const out = [];
    active.forEach((f, fi) => {
      // Against two foes a spread move always hits both, so it only counts as the "both" option below. Besides the
      // best move, keep the best one without a drawback or a hit on our partner: the pair's score may prefer it.
      let best = null, clean = null;
      const better = (a, b) => !a || b.score > a.score || (b.score === a.score && b.move.expected > a.move.expected);
      const scored = planOutcomes(turn, me, f).filter(o => o.expected > 0 && !(pair && o.spread)).map(o => one(o, fi));
      // Depth 2 for every move of a single slot; in doubles the three best and any move that lives on turn 1
      // (priority, a flinch, first turn only).
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
      // Every spread move that hits *either* foe: enumerating against `active[0]` alone loses one that slot is
      // immune to, even though it still hits the other untouched.
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
    // In a double a status play doesn't compete with this slot's attacks here — it has no standalone worth until the
    // partner's pick is known — so it rides alongside them and the field search prices it (#262). Capped per slot:
    // every candidate costs the search a hypothesis both slots are re-scored on, so only the few the game's own
    // scoring rates highest are carried, and a self-targeted play is kept once rather than once per foe.
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
    if (!out.length) out.push({ me, move: null, target: null, turns: 9, hits: 9, score: danger - 9, hp });
    return out;
  };
  const cache = new Map();
  const opt = (me, entering, hyp = null) => {
    const mine = lock && !lock.switchIn && me === lock.me ? lock : null;
    const k = `${party.indexOf(me)}|${entering}|${!!mine}|${hyp?.key ?? ""}`;
    if (!cache.has(k)) cache.set(k, options(me, entering, mine, hyp));
    return cache.get(k);
  };

  // Every candidate field. Newcomers fill empty slots (a fainted member's) for free; any beyond that are
  // voluntary switches (`payers`), which take the incoming hit — unless the switch is free. `swaps` counts the
  // voluntary switches either way.
  const empty = Math.max(0, slots - current.length);
  const free = freeSwitch ? slots : empty;
  const plans = [];
  // What the whole-fight plan makes of the rest of the fight once this mon has taken the turn (#113: ⚔ decides the
  // turn, ♟ prices it). Single battles only — the plan reads a double as one-on-one exchanges, and #113 measured
  // every one of its doubles disagreements as the plan misreading the field. Pinned on the mon, not its move: one
  // search per candidate member, memoised by the plan itself.
  const planValueOf = picks => {
    if (!team || slots !== 1 || !picks[0]) return null;
    const mi = party.indexOf(picks[0].me);
    return mi < 0 ? null : team.at({ mi, free: freeSwitch })?.val ?? null;
  };
  // Per pick, besides its own score: `ally`, what a move that hits every other pokémon (Earthquake, Surf) does to
  // our partner — its damage share, and a heavy cost for a likely KO; `spare`, the pair's other hit already does
  // everything this one does, so a move with a drawback (recoil, recharge, a self stat drop) gives way to one without.
  // Voluntary switches beyond the free slots, and mons pulled back out the turn after they came in — the same two
  // counts whichever way the field is priced.
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
      // Both slots on one foe: whichever hit resolves second finds the target already gone that often, and the game
      // sends it to the survivor instead, carrying the move it chose here. Worth its `alt` in that branch and its own
      // score in the rest, so focusing is never charged for a hit it still lands, and spreading wins exactly when the
      // slot has a better move for the other foe than the one the redirect would carry (#236).
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
  // A double's status play, priced as one exchange of the field rather than two 1-v-1s (#262). Each play lands or it
  // doesn't, so the field is the weighted mix over which of them did; in each branch the effect is written with
  // `turn.assuming` **before the partner slot is scored**, so Spore in slot 0 changes what slot 1's option is worth.
  // A slot that spent its turn is worth what its own best move is worth on that state (one turn later, hence the −1
  // already in the candidate's score), and the joint hits are whatever still attacks. Nothing here looks past the
  // turn: `options` under a hypothesis searches no second one.
  const statusField = (picks, payers, sps) => {
    const mons = picks.map(p => p.me);
    const parts = picks.map(() => 0);
    // The option each slot is shown as taking: the one the likeliest branch scored, which is the only branch whose
    // numbers the row can honestly carry.
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
      // A heal writes no state: it is the HP the slot that played it is scored on that changes.
      const hyp = bump => ({ at, lost, bump, key: `${tag}|${bump}` });
      const hits = [];
      picks.forEach((p, i) => {
        const entering = payers.includes(p.me);
        if (p.play) {
          const best = opt(p.me, entering, hyp(landed.includes(p) ? p.heal : 0))
            .reduce((b, x) => (x.play || (b && b.score >= x.score) ? b : x), null);
          parts[i] += w * (best?.score ?? -9);
        } else {
          // The partner's own pick, re-scored on the state — or, where the hypothesis has taken that option away,
          // the score it had on the real turn.
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
  // Unlike the ordinary path, these picks carry the priced score rather than their own: a status candidate's own
  // score is only the turn it spends, and everything downstream (the stay margin, the slot rows) reads a real one.
  const addStatus = (picks, payers, sps) => {
    const { parts, jv, shown } = statusField(picks, payers, sps);
    const raw = picks.map((p, i) => (p.play ? p.score : 0) + parts[i]);
    // A partner's spread move still costs us the ally it hits. `spare` needs two hits, so a field with a status play
    // in it has none.
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
  // P(`p`'s hit finds its target already fainted, and is redirected onto the other foe): the partner aimed at the
  // same foe, moves first, and fells it. Only single-target hits redirect, and only with two foes to move between;
  // a slot switching in lands no hit at all, and a status play is priced as a field, not a hit (#262).
  const redirectOdds = (p, q, payers) => {
    if (!pair || !q || p.redirScore == null || p.play || q.play) return 0;
    if (typeof p.target !== "number" || q.target !== p.target) return 0;
    if (!q.move?.pm || !p.move?.pm || payers.includes(p.me) || payers.includes(q.me)) return 0;
    const qFirst = 1 - actionOrder(now, p.me, p.move.pm, q.me, q.move.pm);
    return qFirst * landOf(q, active[p.target]) * (q.move.pKo ?? 0);
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
  const danger = (X, mons, hyp = null) => {
    const turn = turnOf(hyp);
    // A foe whose attempt a status play costs it does that much less to us this turn.
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
  // `mons`: whose danger counts (defaults to the picks'; kept whole when a pick is left out to weigh its hit).
  const joint = (picks, payers, mons = picks.map(p => p.me), hyp = null) => {
    const turn = turnOf(hyp);
    // A status play lands no hit: what it does to the field is priced in `statusField`, not counted here (#262).
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
      value += f.pKo + f.pBefore * danger(X, mons, hyp);
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

  // The fight plan's verdict as a cost on this turn's options: the best candidate pays nothing, and every other one
  // pays what the rest of the fight loses by taking the turn that way — spending the only answer to a later foe,
  // paying for a switch a doomed mon's faint would have given free. It is a term in ⚔'s score, never an override.
  const bestPlanVal = Math.max(-Infinity, ...plans.flatMap(p => (p.planVal == null ? [] : [p.planVal])));
  if (Number.isFinite(bestPlanVal)) {
    for (const p of plans) {
      if (p.planVal == null) continue;
      p.planCost = Math.min(PLAN_CAP, (bestPlanVal - p.planVal) * PLAN_POINT);
      p.score -= p.planCost;
    }
  }

  // Stay with the current field unless it is actually failing: a member with nothing that damages, a member
  // that loses its trade, or a switch that is clearly better. Switching costs a turn and a free hit, so a
  // merely better field is shown as an optional hint instead — and when everything fails, staying wins ties.
  // A free switch costs nothing, so only a tiny gain isn't worth the churn.
  const top = list => list.reduce((b, p) => (!b || p.score > b.score ? p : b), null);
  const bestAny = top(plans);
  const bestStay = top(plans.filter(p => p.swaps === 0));
  // A mon on the field that is going down this turn whatever we do — the foe's hit takes it, or turn-end residual
  // does — has nothing left to lose (#170 §E). Switching it out trades its last action for an entry hit, while
  // letting it fall brings the next mon in free.
  const doomedMemo = new Map();
  const doomedNowOf = me => {
    if (!doomedMemo.has(me)) {
      const ko = 1 - attackers.reduce((keep, f) => keep * (1 - threatKoAt(threatFrom(turn, f, me), me.hp)), 1);
      doomedMemo.set(me, me.hp + healAtEnd(turn, me) <= 0 || ko >= DOOMED);
    }
    return doomedMemo.get(me);
  };
  // …or a field the fight plan needs elsewhere: the stay margin is there to stop the advice flipping between
  // near-equal turns, and spending the only answer to a foe still to come is not a near-equal turn (#170 §A).
  const failing = plan => plan.picks.some(p => !p.locked && (!p.move || p.score < 0)) || (plan.planCost ?? 0) >= PLAN_FAIL;
  const margin = freeSwitch ? 0.5 : 3;
  // Staying can be "failing" only because the mon on the field is spending its last turn. That is not a reason to
  // pay for a switch, so the ordinary margin applies and the free entry its faint buys is kept (#170 §E).
  const dying = plan => plan.picks.filter(p => !p.locked && (!p.move || p.score < 0));
  const lastStand = !!bestStay && (bestStay.planCost ?? 0) < PLAN_FAIL
    && dying(bestStay).length > 0 && dying(bestStay).every(p => current.includes(p.me) && doomedNowOf(p.me));
  const stay = !!bestStay && (failing(bestStay) && !lastStand ? bestAny.score <= bestStay.score : bestAny.score - bestStay.score < margin);
  const best = stay ? bestStay : bestAny;
  const alt = stay && bestAny !== bestStay && bestAny.swaps > 0 ? bestAny : null;

  // How badly a foe hits a slot's pokémon. "ko": likely KO (≥ 50 %) and the foe likely acts first; "risk": a likely
  // KO after we act, a real KO chance, or a super-effective hit for half the HP or more. `next`: the hit comes next
  // turn (a switch-in, ours or theirs), so the tag belongs to the `next` step.
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
  // Boss bars and multi-hit moves, where they are what decides the call.
  const notesFor = p => {
    const out = [];
    const foe = typeof p.target === "number" ? active[p.target] : null;
    const bars = foe ? bossBarsLeft(foe) : 1;
    if (p.move && bars > 1 && p.hits > 1 && p.hits <= bars) out.push(`boss: ${bars} bars — no 1HKO`);
    if (p.effect) out.push(p.effect);
    if (p.then) out.push(`then ${p.then.name}`);
    const fed = foe && (p.trade?.pTheyKoFirst ?? 0) >= 0.5 && party.length > 1 ? koBoost(foe) : null;
    if (fed) out.push(`KO feeds ${foe.name}'s ${fed.ability} (${koBoostText(fed)})`);
    // The fight plan is keeping this mon for a foe still to come (#170 §A) and taking the turn with it costs the
    // rest of the fight enough for the plan to mind: name the foe it was being kept for. When the plan doesn't mind
    // — it wanted this mon out anyway — there is nothing being spent and nothing to say.
    const saved = (best.planCost ?? 0) >= PLAN_NOTE ? team?.holdFor(party.indexOf(p.me)) : null;
    if (saved) out.push(`saved for ${saved.name}`);
    const n = hitCounts(p.move);
    if (n) out.push(`${p.move.name} ×${n}`);
    // What the move costs its user (07-move-traits' wording, with 10-damage's amounts): HP, lock-in, stat drops,
    // lost turns.
    out.push(...(p.move?.costs ?? []));
    // A foe that can take this mon's items.
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

  // Why a paid switch-in is cheap: the share of its HP the hits aimed at the mon leaving take off it, and how it takes
  // the likeliest of them (the foe that hits hardest) — immune, resisted, or weak.
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

  // Support moves, kept conservative (the planner only scores damage): Protect for a slot likely KO'd before it
  // moves whose own hit adds little, while its partner likely KOs that foe before it acts anyway; Helping Hand when
  // the partner's ×1.5 hit turns a foe that likely survives into a likely KO, worth more than this slot's own hit.
  const usablePm = pm => pm && (pm.getMovePp?.() ?? 1) - (pm.ppUsed ?? 0) > 0;
  // A Protect after a successful one only works 1 time in 3.
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
  // The rows read these picks: a slot on a support move isn't hitting anything, and a helped hit KOs now.
  const helps = new Set([...support.values()].map(x => x.helps));
  const picks = best.picks.map(p => (support.has(p) ? { ...p, move: null, target: null } : helps.has(p) && typeof p.target === "number" ? { ...p, hits: 1 } : p));

  // This turn's action, for the fight plan to be re-searched around (#113 "⚔ seeds ♟"), and what that plan says
  // comes next: the mon a doomed field mon's faint brings in free (#170 §E), and the foe the trainer sends after our
  // KO with the answer the plan puts in front of it (#170 §G).
  // In a double the plan still runs one exchange at a time, against the foe in slot 0: pin the ⚔ slot aimed there,
  // so its step 1 is an action the player is actually being told to take. (The score term stays out of doubles —
  // `planValueOf` — but a plan that contradicts the line on screen is the thing #113 set out to end.)
  const chosen = slots === 1 ? best.picks[0]
    : best.picks.find(p => !p.play && (p.target === 0 || p.target === "both")) ?? best.picks.find(p => !p.play) ?? best.picks[0];
  const pin = team && chosen ? { mi: party.indexOf(chosen.me), outcome: chosen.move, free: freeSwitch } : null;
  const ahead = pin && pin.mi >= 0 ? team.after(pin) : null;
  // The plan's step 1 ends with our mon down, but a step is a whole exchange: the free entry is only this turn's
  // news when the turn model says the mon is going down on this one. The exchange the pick is in counts too — a foe
  // switching in is not an `attackers` threat yet, but it is the one this turn trades with.
  const doomedNow = !!chosen && (doomedNowOf(chosen.me) || (chosen.trade?.pTheyKoFirst ?? 0) >= 0.5);

  return {
    picks, // live objects for the per-foe rows; not part of the JSON-safe view
    pin: pin && pin.mi >= 0 ? pin : null,
    view: {
      optional: alt ? swaps(alt) : [],
      // The fight plan's read of what follows this turn.
      freeEntry: doomedNow ? ahead?.freeEntry ?? null : null,
      nextIn: ahead?.nextIn ?? null,
      // Staying is failing but every switch-in would be KO'd coming in: say so rather than stay silent. Not when one
      // is offered as optional — a mon on its last turn keeps the field (#170 §E), and the switch is there to take.
      noSafeSwitch: !freeSwitch && best.swaps === 0 && failing(best) && !alt && party.length > current.length,
      freeSwitch,
      slots: best.picks.map((p, i) => {
        const enter = best.payers.includes(p.me);
        const sup = support.get(p);
        const { ally, spare, redir } = best.info[i];
        // A spread move that KOs the two foes on different turns: say each, so the rows agree.
        const each = p.target === "both" && p.each && p.each[0] !== p.each[1] ? p.each : null;
        const mv = sup?.pm.getMove();
        // The KO a partner's Helping Hand buys shows on this slot's own line.
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
          // A slot with nothing left to do says which restriction emptied its pool, where one did. Asked only then:
          // with a move to recommend the reason is behind us, and the ✦ on the foe row already carries the abilities.
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

// Moves that hit every other pokémon on the field, our partner included (MoveTarget ALL_OTHERS, ALL_NEAR_OTHERS).
const hitsAlly = o => [MoveTarget.ALL_OTHERS, MoveTarget.ALL_NEAR_OTHERS].includes(o?.pm?.getMove?.()?.moveTarget);
// A move the game's own scoring marks down: recoil, fainting, a self stat drop, a condition it can't meet. With no
// game functions every move is 0, so nothing counts as a drawback and the clean alternative is simply the best move.
export const drawback = o => (o?.benefit ?? 0) < 0;
const ALLY_KO_COST = 4;
// How likely the redirect has to be before the spare-hit row names the foe it will land on instead of calling the hit
// spare. Below it the target usually survives the partner's hit, so "KO without it" is still the likelier outcome and
// the shorter line is the honest one (#236).
const REDIR_NOTE = 0.25;
// Consistency (after PokéLLMon): between near-equal options the advice shouldn't flip from turn to turn. A mon out
// since before last turn keeps a small edge for the move it used last; switching a mon straight back out the turn
// after it came in (a switch or a faint's replacement: `tempSummonData.turnCount` restarts at 1 when it's summoned and
// counts up at turn end, one short for a switch made as a command) costs extra.
const KEEP_BONUS = 0.15;
const DEPTH_GAIN = 0.1;
const FLIP_COST = 0.5;
// The whole-fight plan's value, in turn-score units (#113). Its scale is 100 a foe KO'd, so #113's "clearly better"
// threshold of 20 — a fifth of a KO — comes to 0.4 of a turn. Capped: the plan's value function is coarse (it skips
// status, stat changes and mid-exchange switches), so it nudges the turn call and never overrides this turn's
// mechanics, which #113 measured as ⚔'s to decide. Both are first cuts.
const PLAN_POINT = 0.02;
const PLAN_CAP = 3;
// How much the plan has to mind before the ⚔ line names the foe it was keeping a mon for.
const PLAN_NOTE = 0.25;
// …and before the field counts as failing, so the stay margin stops protecting it.
const PLAN_FAIL = 1;
// How sure a mon's fall this turn has to be before the turn counts as its last (#170 §E).
const DOOMED = 0.8;
// A status move gives up a sure hit for a modelled effect: it has to win by this much (first cut).
const STATUS_COST = 0.2;
// How many status plays a slot carries into a double's field search (#262), best first by the game's own score for
// the move. Each one costs the search a hypothesis both slots are re-scored on, so the cap is what keeps the render
// budget in reach; a first cut, like the weights around it.
const STATUS_CANDS = 2;
// A whole HP bar of a trainer's mon still to come, in turns of ours: what a hazard's chip is worth (first cut).
const HAZARD_TURNS = 2;
// A stage a foe's on-KO ability (Beast Boost, Moxie) gains from KOing us, in turns of ours, while others are left to
// face it (first cut).
const FEED_COST = 0.5;

// ---- Status moves as this turn's action
// What a status move of `me`'s does to a fight with `f`, if it's one the planner can price, or null:
// - setup: its own stat stages (`selfStages`), and Belly Drum's HP (`hpCost`);
// - status: poison, toxic, paralysis, sleep or burn on a foe that can take it (`canSetStatus`). Written on as a status
//   with no turns counted, so paralysis's lost Speed and 1-in-8 lost moves, burn's weaker physical hits and poison's
//   chip come from the game's own numbers and `actChance`; sleep's lost attempts go by `foeAct` (STATUS_SKIP), and
//   `skip0` is the share of this turn's attempt it cancels when ours lands first;
// - heal: its own HP (`amount`: Recover, Roost, the weather heals by the weather). Rest is left out;
// - hazard: Stealth Rock, Spikes or Toxic Spikes in a trainer battle, worth the HP they take off the mons still to
//   come (`value`, in turns);
// - types: Soak or Magic Powder (the foe's types become one) and Forest's Curse or Trick-or-Treat (a third type on
//   top), written onto the foe so every later number is the game's own on the new typing.
// This turn's incoming hit is priced on the state as it stands, the way every play here is: a foe we retype, burn or
// paralyse after it has moved is unchanged for that one hit, and only a sleep or paralysis that lands first cancels it.
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
  // - types: a typing written onto the foe (Soak and Magic Powder replace its types with one; Forest's Curse and
  //   Trick-or-Treat add a third). The follow-up attack and the foe's own hits are then scored on the new typing by
  //   the game's own code, which reads the two fields the hypothesis writes — so Soak on a Steel foe takes away its
  //   Steel STAB and its Steel resistances in one move. The game's own conditions say when it does nothing: a
  //   Terastallized target keeps its Tera type, Multitype and RKS System refuse a rewrite, and neither move may hand
  //   the target a typing it already has.
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
    // The weather the heal is judged in is live; how much it heals there is the attribute's own answer.
    const ratio = t.heal.ratioIn(turn.mon(me).weather, me, f);
    return { kind: "heal", self: true, amount: Math.max(1, Math.floor(max * ratio)), note: `heal ${Math.round(ratio * 100)}%` };
  }
  if (t.hazard) {
    const v = hazardValue(turn, me, t.hazard.tag);
    return v && { kind: "hazard", self: true, value: v.turns, note: `${v.n} to come` };
  }
  return null;
};
// Stealth Rock (⅛ × Rock effectiveness), a Spikes layer (⅛, then ⅙ and ¼ in all) or Toxic Spikes' poison on each of the
// trainer's mons still to come (EntryHazardTag): the share of its HP each loses, as turns (HAZARD_TURNS a bar), and
// how many it touches. Magic Guard blocks the chip; Spikes need the mon grounded; a grounded Poison type soaks up
// Toxic Spikes, so none is counted then. Null in a wild battle or with nobody left to come.
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
    // Poison's chip over a few turns out, then a smaller step to toxic.
    if (tagType === "TOXIC_SPIKES") return guarded(p) || !turn.mon(p).canTake(StatusEffect.POISON, me) ? 0 : layers ? 0.1 : 0.25;
    return 0;
  };
  const shares = coming.map(p => Math.min(p.hp / p.getMaxHp(), share(p)));
  const total = shares.reduce((t, x) => t + x, 0);
  return total > 0 ? { turns: total * HAZARD_TURNS, n: shares.filter(x => x > 0).length } : null;
};
const lastMoveOf = me => ((me.tempSummonData?.turnCount ?? 0) >= 2 ? me.getLastXMoves?.(1)?.[0]?.move ?? null : null);
const cameInLastTurn = (turn, p) => (p.tempSummonData?.turnCount ?? 2) <= 1 && (turn.facts.turn ?? 1) > 1;

// Slot 1's command phase in a double battle: slot 0's command is already in `turnCommands[0]` (CommandPhase
// handleFightCommand / tryLeaveField; SelectTargetPhase puts a chosen target on the command itself). A move →
// `{ me, pm, target }` with the target as an index into `active` ("both" for a spread move, null for our side);
// a switch → `{ me, switchIn }` (cursor is the party index). Balls and runs skip slot 1's phase entirely.
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

// Best 1-v-1 move of `me` into `foe`, by who wins the exchange. For foes no field slot is planned against.
// `partnered`: `me` stands next to a partner, so moves that also hit it are out.
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

// The mons an exact move is aimed at, for the `↯` row: the game's own target list, as mons on the field. A spread
// move names both; a move aimed at the foe's own side (setup, a heal) names nothing, because the row is about what
// the move does to us. Null where the move isn't exact — the row then says how likely it is instead.
const aimedAt = (turn, t, foe) => {
  if (!t?.exact || !t.targets?.length) return null;
  const ours = t.targets.map(bi => turn.facts.field.find(p => p?.getBattlerIndex?.() === bi))
    .filter(p => p && p !== foe && !turn.facts.foes.includes(p));
  return ours.length ? ours.map(p => ({ icon: iconOf(p), name: p.name })) : null;
};

// Plain data for one refresh: the field, the switches and a row per foe. Its JSON is part of the change signature, so
// the DOM is only rebuilt when something the panel shows has actually changed. 60-card composes it with the fight
// plan and the catch advice, and opens the sandbox all three run in.
// `team`: the whole-fight plan's model (35-team-plan's `teamPlanner`), built by 60-card before this one and handed in
// so the ⚔ line can price what a turn costs the rest of the fight. Null on a wild wave, where there is no plan.
export const battleModel = (turn, { team = null } = {}) => {
  const { double, trainer, wave } = turn.facts;
  // ---- The one gate (#183)
  // This turn's plan is played on the enemy's **exact** move, so the exact call is load-bearing: if the game's own
  // code can't be asked at a decision, the coach says so rather than quietly advising from an estimate. Everything
  // that reads the enemy model reads it through this file — the battle card's rows and field plan, the fight plan,
  // the catch advice — so the gate lives here, once, and they stop together. A breach retries on the next refresh;
  // the flicker is accepted. There is no fallback to the distribution, for display or for advice.
  const gate = turn.exact?.() ?? { ok: true };
  if (!gate.ok) return { kind: "battle", unavailable: gate.reason, title: `W${wave}${trainer ? ` · ${trainer.getName()}` : ""}`,
    field: null, pin: null, enemySwitches: [], ifStay: null, order: [], team: [], rows: [] };
  const party = turn.facts.party.filter(p => p && p.hp > 0);
  const foes = turn.facts.foes.filter(f => f && f.hp > 0);
  const active = turn.activeFoes();
  // During a free switch the enemy hasn't decided anything: it picks its first command after our switch, against
  // the field we choose. Its switch rule isn't replayable against a hypothetical field, so predict none now; the
  // CommandPhase refresh predicts against the real field. (CheckSwitchPhase isn't offered in trainer battles.)
  const freeSwitch = turn.facts.decision === "check-switch";
  const predicted = new Map(freeSwitch ? [] : active.flatMap(f => {
    const to = turn.enemyAction(f).switchTo;
    return to ? [[f, { to, ratio: 1 }]] : [];
  }));
  const switching = f => (predicted.get(f)?.ratio ?? 0) >= 1;
  // Plan against the field our moves will actually hit; if a switch is predicted, also keep the plan for
  // the case it stays, shown dim.
  const facing = active.map(f => (switching(f) ? predicted.get(f).to : f));
  // Targets are field positions, so a lock resolved against the field holds for the switch-in taking that position.
  const locked = lockedCommand(turn, party, active, active.length === 2);
  // The panel refreshes every second; a plan only changes with what the turn's key covers (and slot 0's command).
  const ids = mons => mons.map(p => p.id).join();
  const lockKey = locked ? `${locked.me.id}:${locked.switchIn?.id ?? ""}:${pmName(locked.pm)}:${locked.target}` : "";
  const attackers = active.filter(f => !switching(f));
  const plan = turn.memo(`field:${ids(party)}|${ids(facing)}|${ids(attackers)}|${double}|${freeSwitch}|${lockKey}`,
    () => fieldPlan(turn, party, facing, double, attackers, { freeSwitch, locked, team }));
  const ifStay = active.some(switching)
    ? turn.memo(`stay:${ids(party)}|${ids(active)}|${double}|${lockKey}`, () => fieldPlan(turn, party, active, double, active, { locked }))
    : null;

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
      // A status move's row shows the damage of the attack it sets up.
      const then = slot.move.cat === "status" ? slot.then ?? null : null;
      const dmg = both ? planOutcomes(turn, slot.me, target).find(x => x.name === slot.move.name)?.expected ?? 0 : (then ?? slot.move).expected;
      // The slot's own per-foe KO turns, so the row and the ⚔ line agree.
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
    // `✦` marks an ability that changes one of **our** options, not merely one the foe has. A field trap always does,
    // so it shows on sight; a move trap is asked of the whole damaging pool of the mons we put on the field, never of
    // the move the ⚔ line picked — an immunity shows even though — because — it took the only move worth using, while
    // one nothing of ours runs into (Intimidate on a foe already out, a cut on a type we don't carry, a contact
    // punisher when our pool is special) stays off. Sturdy is in neither set: the KO count already has it.
    const ourside = [...new Set([...(plan?.picks.map(q => q.me) ?? []), ...(p?.me ? [p.me] : [])])];
    const pool = ourside.flatMap(me => planOutcomes(turn, me, foe));
    const traps = abilitiesOf(foe).filter(a => FIELD_TRAPS.has(a) || (MOVE_TRAPS.has(a) && pool.some(o => bites(a, foe, o))));
    // What this foe likely does to the pokémon we put in front of it (a foe switching out does nothing).
    const t = p?.mine && !switching(foe) ? threatFrom(turn, foe, p.me, p.mine.pm ?? null, { next: !p.me.isOnField?.() || !foe.isOnField?.() }) : null;
    const bars = bossBarsLeft(vs);
    const n = p?.mine ? hitCounts(p.mine) : null;
    return {
      icon: iconOf(foe), name: foe.name, lv: foe.level, types: typesOf(foe), tera: turn.mon(foe).tera,
      traps, boss: !!foe.isBoss?.(), status: foe.status?.effect ?? 0,
      hp: Math.round(foe.hp / foe.getMaxHp() * 100),
      weak, avoid,
      switchTo: predicted.has(foe) ? { icon: iconOf(predicted.get(foe).to), name: predicted.get(foe).to.name, sure: switching(foe) } : null,
      // The exact move is named as fact: the absence of a `% likely` is what marks it, and `confidence` says
      // whether it rode on a draw our own command made (`replay`, shown `~`).
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
    // This turn's action, so 60-card can render the fight plan around it rather than against it.
    pin: plan?.pin ?? null,
    enemySwitches: active.filter(f => predicted.has(f)).map(f => ({
      from: { icon: iconOf(f), name: f.name }, to: { icon: iconOf(predicted.get(f).to), name: predicted.get(f).to.name }, sure: switching(f),
    })),
    ifStay: ifStay ? ifStay.view.slots : null,
    title: `W${wave}${trainer ? ` · ${trainer.getName()}` : ""}`,
    order: [...new Set(sendIns)].map(me => ({ icon: iconOf(me), name: me.name })),
    team: Object.entries(teamWeak).sort((x, y) => y[1] - x[1]).slice(0, 4),
    rows,
  };
};
