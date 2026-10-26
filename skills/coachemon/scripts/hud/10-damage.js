// Calls game code but never decides when that is allowed: 25-turn opens the one sandbox, predicts Tera and keys every
// answer before a `scene*` export runs, and `env` is its `sceneEnv`. Every other export is pure.
import { SPREAD_TARGETS, TYPES, abilitiesOf, effectiveness, forcedRng, gameVersionOf, keepTurnData, lumsHeld, movesetOf, squeezeDist, stage, stat, typesOf, versionAtLeast } from "./01-core.js";
import { costNotes, moveTraits } from "./07-move-traits.js";

const reliability = (mv, t = moveTraits(mv)) => {
  if (t.interrupt) return 0.4;
  if (t.charge || t.recharge) return 0.5;
  return mv.priority < 0 ? 0.8 : 1;
};
const FOE_MARGIN = 1.15;

// Subclasses count. Class names survive minification (game-code.md §22).
const isA = (x, name) => {
    for (let c = x?.constructor; c?.name; c = Object.getPrototypeOf(c)) if (c.name === name) return true;
    return false;
  };
  const attrs = (mv, name) => (mv.attrs || []).filter(a => isA(a, name));
  const hasFlag = (mv, f) => (typeof mv.hasFlag === "function" ? mv.hasFlag(f) : !!((mv.flags ?? 0) & f));
  const ability = (p, attr) => { try { return !!p.hasAbilityWithAttr?.(attr); } catch { return false; } };
  const items = p => { try { return p.getHeldItems?.() ?? []; } catch { return []; } };
  const stack = (p, name) => items(p).filter(m => m.constructor.name === name).reduce((t, m) => t + (m.getStackCount?.() ?? m.stackCount ?? 1), 0);
// One gate for `sceneUsable` and `sceneRefused`, so the pool and the reason it shrank can never disagree. A condition
// can draw battle RNG, hence `forcedRng` (game-code.md §6).
const selectable = (env, p, def, pm) => {
  if (typeof pm.isUsable === "function") {
    const r = pm.isUsable(p, false, true);
    if (!(Array.isArray(r) ? r[0] : r)) return false;
  }
  const mv = pm.getMove();
  // A `needsAttack` move's condition reads a command the target hasn't chosen yet: the planner judges it.
  if (typeof mv.applyConditions !== "function" || moveTraits(mv).needsAttack) return true;
  try { return !!forcedRng(env.s, () => mv.applyConditions(p, def, -1)); } catch { return true; }
};
// `status`: the status moves instead of the damaging ones.
// @only 25-turn, tests: sceneUsable
export const sceneUsable = (env, p, def = null, status = false) => {
  const base = plainUsable(p, status);
  return def ? base.filter(pm => selectable(env, p, def, pm)) : base;
};
const RESTRICTIONS = {
  DisabledTag: "Disable", TauntTag: "Taunt", EncoreTag: "Encore", TormentTag: "Torment", ImprisonTag: "Imprison",
  ThroatChoppedTag: "Throat Chop", HealBlockTag: "Heal Block", GorillaTacticsTag: "Gorilla Tactics",
};
const restrictionOn = (p, pm) => {
  for (const t of tagsOf(p)) {
    const name = Object.keys(RESTRICTIONS).find(k => isA(t, k));
    try { if (name && t.isMoveRestricted(pm.moveId, p)) return RESTRICTIONS[name]; } catch { /* next tag */ }
  }
  return null;
};
// The moves the gate refuses, in one pass: `stopped` names the restrictions, and `failing` the damaging moves their
// own condition dropped, which the enemy AI still picks and fails with (game-code.md §6).
// @only 25-turn: sceneRefused
export const sceneRefused = (env, p, def) => {
  const stopped = new Set(), failing = [];
  for (const pm of [...plainUsable(p), ...plainUsable(p, true)]) {
    if (selectable(env, p, def, pm)) continue;
    const why = restrictionOn(p, pm);
    if (why) stopped.add(why);
    else if (pm.getMove().category !== MoveCategory.STATUS) failing.push(pm.getName());
  }
  return { stopped: [...stopped], failing };
};
const plainUsable = (p, status = false) => movesetOf(p)
  .filter(pm => (pm.getMove().category === MoveCategory.STATUS) === status && pm.getMovePp() - pm.ppUsed > 0);
const traitsNow = (env, atk, mv, live, def = null) => {
  const t = moveTraits(mv, atk, { party: env?.party?.(atk) ?? null, target: def });
  return live && t.charge && t.charge.now(atk) ? { ...t, charge: false, semiCharge: false } : t;
};

// `calculateBossSegmentDamage`, verbatim (game-code.md §3).
const bossSegmentDamage = (dmg, hp, segSize, minIdx = 0, idx) => {
  const a = idx ?? Math.ceil(hp / segSize) - 1;
  if (a <= 0) return [dmg, 1];
  const floorHp = segSize * a;
  const excess = dmg - (hp - Math.round(floorHp));
  if (excess < 0) return [dmg, a + 1];
  if (excess === 0) return [dmg, a];
  const c = Math.min(Math.max(Math.floor(Math.log2(excess / segSize)), 0), a - minIdx);
  return [Math.max(Math.floor(hp - floorHp + segSize * c), 1), a - c];
};
// The first game version whose Sturdy stops fixed damage (game-code.md §1).
const STURDY_VS_FIXED_FROM = "1.12.1.0";
// `!versionAtLeast` alone hands an unreadable game version the older rule (#718).
const fixedIgnoresSturdy = env => {
  const v = gameVersionOf(env.s);
  return !!v && !versionAtLeast(v, STURDY_VS_FIXED_FROM);
};

// @only 25-turn, 12-value, tests: targetFacts
// @mirrors target-facts
export const targetFacts = (env, t, ignoreAbility = false) => {
  const maxHp = t.getMaxHp();
  const segs = t.bossSegments > 0 && (t.isBoss?.() ?? true) ? t.bossSegments : 0;
  const enemy = typeof t.isPlayer === "function" && !t.isPlayer();
  const endure = enemy && !t.waveData?.endured ? (env?.enemyModifiers ?? []).find(m => m.constructor.name === "EnemyEndureChanceModifier") : null;
  return {
    maxHp, hp: t.hp, boss: segs > 0, segs, segSize: segs ? maxHp / segs : 0, idx: segs ? t.bossSegmentIndex ?? segs - 1 : 0,
    minIdx: env?.finalBoss && !t.formIndex ? 1 : 0,
    finalBoss: enemy && !!env?.finalBoss && !t.formIndex,
    sturdy: !ignoreAbility && maxHp > 1 && ability(t, "PreDefendFullHpEndureAbAttr"),
    pFocus: Math.min(1, 0.1 * stack(t, "SurviveDamageModifier")),
    pEndure: endure ? Math.min(1, (endure.chance ?? 2) * (endure.getStackCount?.() ?? 1) / 100) : 0,
    // Reviver Seed (game-code.md §8).
    revive: stack(t, "PokemonInstantReviveModifier") ? Math.max(1, Math.floor(maxHp / 2)) : 0,
    enigma: enigmaOf(env, t),
    sitrus: sitrusOf(env, t),
    unnerve: ability(t, "PreventBerryUseAbAttr"),
  };
};
// `EnemyPokemon.damage` before any survival (game-code.md §3): [damage, bar after].
const barStep = (f, hp, bar, d, ohko = false) => {
  let after = bar;
  if (f.boss && !ohko) {
    const [bd, seg] = bossSegmentDamage(d, hp, f.segSize, f.minIdx, bar);
    d = bd;
    after = Math.max(0, Math.min(bar, seg - 1));
  }
  if (f.finalBoss && bar < 1) d = Math.min(d, hp - 1);
  return [d, after];
};
// [[state, p], …]. `tok`: the enemy endure token is spent for the wave (game-code.md §3).
const landHit = (f, st, d, ohko) => {
  let idx;
  // The token rolls on the damage before the bar clamps it, hence `raw` (game-code.md §3).
  const raw = d;
  [d, idx] = barStep(f, st.hp, st.idx, d, ohko);
  const left = st.hp - d;
  if (raw < st.hp) return [[{ hp: left, idx, tok: st.tok }, 1]];
  const endure = st.tok ? 0 : f.pEndure;
  // Sturdy answers before the token can, but the roll still spends it (game-code.md §3).
  if (f.sturdy && st.hp >= f.maxHp) return [
    [{ hp: Math.max(1, left), idx, tok: true }, endure],
    [{ hp: Math.max(1, left), idx, tok: st.tok }, 1 - endure],
  ].filter(([, p]) => p > 0);
  if (left > 0) return [
    [{ hp: left, idx, tok: true }, endure],
    [{ hp: left, idx, tok: st.tok }, 1 - endure],
  ].filter(([, p]) => p > 0);
  return [
    [{ hp: 1, idx, tok: true }, endure],
    [{ hp: 1, idx, tok: st.tok }, (1 - endure) * f.pFocus],
    [{ hp: 0, idx, tok: st.tok }, (1 - endure) * (1 - f.pFocus)],
  ].filter(([, p]) => p > 0);
};
// `perHit[k]`: Map damage → p for hit k; `dist`: [{ n, p }] hit counts; `checkAll`: every hit rolls, else only the
// first. A miss or a faint ends the move (game-code.md §2).
const resolve = (f, perHit, dist, acc, checkAll, ohko = false) => {
  const add = (m, st, p) => {
    if (!(p > 0)) return;
    const k = `${st.hp}|${st.idx}|${st.tok}`;
    const e = m.get(k);
    if (e) e.p += p; else m.set(k, { hp: st.hp, idx: st.idx, tok: st.tok, p });
  };
  const atLeast = n => dist.filter(x => x.n >= n).reduce((t, x) => t + x.p, 0);
  const done = new Map();
  let live = new Map();
  add(live, { hp: f.hp, idx: f.idx, tok: false }, 1);
  const hitsMax = Math.max(...dist.map(x => x.n));
  for (let k = 0; k < hitsMax && live.size; k++) {
    const go = (k ? atLeast(k + 1) / atLeast(k) : atLeast(1)) * (k === 0 || checkAll ? acc : 1);
    const next = new Map();
    for (const st of live.values()) {
      if (st.hp <= 0) { add(done, st, st.p); continue; }
      add(done, st, st.p * (1 - go));
      for (const [d, p] of perHit[Math.min(k, perHit.length - 1)]) for (const [ns, q] of landHit(f, st, d, ohko)) add(next, ns, st.p * go * p * q);
    }
    live = next;
  }
  for (const st of live.values()) add(done, st, st.p);
  return [...done.values()];
};

// One use's damage before the target's HP or a boss bar cuts it: [{ d, p, n }], a miss at 0, where `n` is the hits it
// lands in — a mean where points merged.
const USE_POINTS = 12;
const useDist = (perHit, dist, acc, checkAll) => {
  const atLeast = n => dist.filter(x => x.n >= n).reduce((t, x) => t + x.p, 0);
  const done = new Map();
  const add = (m, d, p, n) => {
    if (!(p > 0)) return;
    const e = m.get(d);
    if (e) { e.n = (e.n * e.p + n * p) / (e.p + p); e.p += p; } else m.set(d, { d, p, n });
  };
  let live = [{ d: 0, p: 1, n: 0 }];
  const hitsMax = Math.max(...dist.map(x => x.n));
  for (let k = 0; k < hitsMax && live.length; k++) {
    const go = (k ? atLeast(k + 1) / (atLeast(k) || 1) : atLeast(1)) * (k === 0 || checkAll ? acc : 1);
    const next = new Map();
    for (const x of live) {
      add(done, x.d, x.p * (1 - go), x.n);
      for (const [d, q] of perHit[Math.min(k, perHit.length - 1)]) add(next, x.d + d, x.p * go * q, k + 1);
    }
    live = squeezeDist([...next.values()], 2 * USE_POINTS);
  }
  for (const x of live) add(done, x.d, x.p, x.n);
  return squeezeDist([...done.values()], USE_POINTS);
};
const sideModifiers = (env, p, name) => ((p?.isPlayer?.() === false ? env?.enemyModifiers : env?.modifiers) ?? [])
  .filter(m => m.constructor?.name === name);
// Drain and Healing Charm (game-code.md §18): the charm scales a negative heal too, deepening what Liquid Ooze takes.
// @only 30-planner: healingCharm
export const healingCharm = (env, p) => sideModifiers(env, p, "HealingBoosterModifier")
  .reduce((t, m) => t * (1 + ((m.multiplier ?? 1.1) - 1) * (m.getStackCount?.() ?? 1)), 1);
// Berry Pouch (game-code.md §3): the chance it leaves a berry `p` eats held.
// @only 35-team-plan: berryPouch
export const berryPouch = (env, p) => Math.min(10, 3 * sideModifiers(env, p, "PreserveBerryModifier")
  .reduce((t, m) => t + (m.getStackCount?.() ?? 1), 0)) / 10;
const drainRatio = (env, atk, def, t) => {
  if (!t.drain) return 0;
  const ratio = t.drain.ratio;
  const charm = healingCharm(env, atk);
  if (ability(def, "ReverseDrainAbAttr")) return ability(atk, "BlockNonDirectDamageAbAttr") ? 0 : -ratio * charm;
  if (atk.getTag?.("HEAL_BLOCK")) return 0;
  return ratio * charm;
};
// game-less-backed: the game's own chance reads both sides' abilities through `canApplyAbility`, which the adapter's
// combatants lack, and a throw here zeroed every duel of a member that knows a flinch move (#583). The Pledge rainbow
// is left out on purpose: an off-field duel has no arena (game-code.md §8).
const appliesAbilities = p => typeof p?.canApplyAbility === "function";
const effectChance = (atk, def, fl, move, ignoreAbility) => {
  if (typeof fl.getMoveChance === "function" && appliesAbilities(atk) && appliesAbilities(def)) {
    return fl.getMoveChance(atk, def, move, false, false);
  }
  const c = fl.effectChanceOverride ?? move.chance ?? -1;
  if (c <= 0) return c;
  const mine = abilitiesOf(atk);
  if (mine.includes("Sheer Force") || (!ignoreAbility && abilitiesOf(def).includes("Shield Dust"))) return 0;
  return mine.includes("Serene Grace") ? Math.min(100, c * 2) : c;
};
// Per landed use, whatever the order: whether the user moves first is the planner's call.
const flinchChance = (atk, def, move, ignoreAbility) => {
  const fl = attrs(move, "FlinchAttr")[0];
  if (!fl || (!ignoreAbility && abilitiesOf(def).includes("Inner Focus"))) return 0;
  const c = effectChance(atk, def, fl, move, ignoreAbility);
  return c < 0 ? 1 : Math.min(1, c / 100);
};

const applyHit = (f, d) => {
  const [end] = resolve({ ...f, pFocus: 0, pEndure: 0 }, [new Map([[Math.max(0, Math.floor(d)), 1]])], [{ n: 1, p: 1 }], 1, false);
  return { hp: Math.max(0, end.hp), ko: end.hp <= 0 };
};

// `bar` is 0 on the last bar and for a non-boss. `tok`: the enemy endure token is spent for the wave.
export const stateOf = (facts, hp = facts.hp, bar = null) => ({ hp, bar: bar ?? facts.idx, revived: false, tok: false, facts });
// No luck: no Focus Band, endure token or Reviver Seed. A state without `facts` has no bars.
export const hitOn = (state, dmg) => {
  const [d, bar] = state.facts ? barStep(state.facts, state.hp, state.bar, Math.max(0, dmg)) : [Math.max(0, dmg), state.bar];
  return { ...state, hp: Math.max(0, state.hp - d), bar };
};
// `stop`: the branch's use has ended (a revive). `left` / `sitrus`: the Enigma / Sitrus Berries it still holds.
const branch = (hp, bar, revived, tok, p, stop = false, left = 0, sitrus = 0) => ({ hp, bar, revived, tok, p, stop, left, sitrus });
// Pushes what stands onto `out` and returns the probability that goes down. `luck` false: turn-end chip, an indirect
// KO, so no endure token, Focus Band or Reviver Seed (game-code.md §21).
const land = (f, b, d, out, luck = true) => {
  const [dealt, bar] = barStep(f, b.hp, b.bar, Math.max(0, d));
  const endure = luck && !b.tok && d >= b.hp ? f.pEndure : 0;
  if (b.hp - dealt > 0) {
    // A roll on a hit the bar clamp already stops still spends the token (game-code.md §3).
    if (endure) out.push(branch(b.hp - dealt, bar, b.revived, true, b.p * endure, false, b.left, b.sitrus));
    if (endure < 1) out.push(branch(b.hp - dealt, bar, b.revived, b.tok, b.p * (1 - endure), false, b.left, b.sitrus));
    return 0;
  }
  let gone = b.p;
  if (luck) {
    if (endure) out.push(branch(1, bar, b.revived, true, b.p * endure, false, b.left, b.sitrus));
    if (f.pFocus) out.push(branch(1, bar, b.revived, b.tok, b.p * (1 - endure) * f.pFocus, false, b.left, b.sitrus));
    gone = b.p * (1 - endure) * (1 - f.pFocus);
  }
  if (!(gone > 0)) return 0;
  if (luck && f.revive && !b.revived) { out.push(branch(f.revive, bar, true, b.tok, gone, true, b.left, b.sitrus)); return 0; }
  return gone;
};
const KO_USES = 9;
const KO_LEVELS = 4;
const NO_CHAIN = [{ s: null, p: 1 }];
const NO_STEP = [{ s: null, p: 1, act: true }];
const inChain = (b, s) => { b.s = s; return b; };
// `m`: a Map of `{ s, p }` by `s.key`.
export const addShare = (m, s, p) => {
  if (!(p > 0)) return;
  const c = m.get(s?.key);
  if (c) c.p += p;
  else m.set(s?.key, { s, p });
};
export const shares = (list, fallback) => {
  const t = list.reduce((sum, c) => sum + c.p, 0);
  return t > 0 ? list.map(c => ({ s: c.s, p: c.p / t })) : fallback;
};
// `by[n − 1]`: P(the target is down by the end of use n). `rec` is `turn.mon(target)`; `use` is `useOf`'s.
// `scale(i, broken)`: the damage factor on use i (0-based) with `broken` bars gone; `act(i)`: the chance use i happens
// at all. `turnEnd`: the signed HP change after each use survived, or a function of the use count. `cat` ("physical"
// or "special"): a wild boss's defence rises as its bars break. `firstKo`: this turn's exact odds for use 1, when the
// caller has them. `useAt(i)`: the `use` of use i (from 1) where it differs from `use`. `start`: branches from an
// earlier turn, p summing to 1. `chain`: a Markov chain stepped once a use, `{ from, step }`: `from` its states
// `[{ s, p }]`, p summing to 1, and `step(s)` its transitions `[{ s, p, act }]`, p summing to 1, the use going off only on
// an `act` one; a state `s` is an object keyed by `s.key`. `after1`: the branches standing after use 1, p summing to
// 1. `perChunk`: the uses each bar takes before it more likely than not breaks. `downAt[n − 1]`: the chain's states
// `[{ s, p }]` of what went down on use n, empty without a `chain`. `se`: the target eats an Enigma Berry
// (`facts.enigma`) after a landed use, at this share of it — a point's own `se` where it carries one; null eats none.
// The berry heals between `beforeBerry`, the part of `turnEnd` the game runs ahead of it, and the rest, and each branch,
// `after1`'s and `start`'s included, carries the berries it has `left`; a Berry Pouch's `keep` share of a feed heals
// and leaves `left` as it was. `preHeal(i)`: `{ p, heal }`, a heal the target takes before use i at share `p` of it, and
// after it, ahead of the turn end, otherwise; null for none. `sitrus`: the target eats a Sitrus Berry (`facts.sitrus`)
// at each turn end that finds it below half, where it eats the Enigma, a Pouch keeping it the same way; null eats none,
// and otherwise it counts the Sitrus Berries steals have taken off the target by use n's turn end, n from 1 and 0 for
// before the curve: a number, or a function of n. A branch's `sitrus` is the Sitrus Berries it still holds.
export const koCurve = (rec, use, { hp, bar = null, start = null, scale = () => 1, act = () => 1, turnEnd = 0, beforeBerry = 0, firstKo = null, cat = null, useAt = null, chain = null, se = null, preHeal = null, sitrus = null } = {}) => {
  const f = rec.facts;
  const berry = se != null && f.enigma?.heal > 0 ? f.enigma : null;
  const held = f.enigma?.left ?? 0;
  const seAt = i => (typeof se === "function" ? se(i) : se);
  const keep = berry?.keep ?? 0;
  const sit = sitrus != null && f.sitrus?.heal > 0 ? f.sitrus : null;
  const sitHeld = f.sitrus?.left ?? 0;
  const goneBy = n => (typeof sitrus === "function" ? sitrus(n) : sitrus ?? 0);
  // The share of the Sitrus Berries still unstolen after use n that use n + 1's steals take.
  const stealRate = n => {
    const room = sitHeld - goneBy(n);
    return sit && room > 1e-12 ? Math.max(0, Math.min(1, (goneBy(n + 1) - goneBy(n)) / room)) : 0;
  };
  // Takes `rate` of `b`'s Sitrus Berries, a fraction of one at that chance, changing `b` in place; what stands goes onto
  // `out`. Gotcha: the take scales with `b`'s own count, but the game draws a stack, whatever its count (game-code.md
  // §8), so a stack eaten down from two loses its last at about half the game's rate.
  const steal = (b, rate, out) => {
    const x = b.sitrus * rate;
    if (!(x > 0)) { out.push(b); return; }
    const sure = Math.floor(x), q = x - sure;
    if (q > 0) out.push({ ...b, p: b.p * q, sitrus: b.sitrus - sure - 1 });
    b.p *= 1 - q;
    b.sitrus -= sure;
    out.push(b);
  };
  // What a branch built from nothing holds: a curve without `start` begins with the steals made before it.
  const rate0 = sit && !start?.length && sitHeld > 0 ? Math.max(0, Math.min(1, goneBy(0) / sitHeld)) : 0;
  const robbed = b => {
    const out = [];
    steal(b, rate0, out);
    return out;
  };
  // The share `fed` of `b` eats a berry at this turn's end, and a Berry Pouch's `keep` of that heals with it still held.
  const pushFed = (out, b, s, fed) => {
    if (fed > 0 && b.left > 0) {
      if (fed < 1) out.push(inChain(branch(b.hp, b.bar, b.revived, b.tok, b.p * (1 - fed), false, b.left, b.sitrus), s));
      if (keep > 0) out.push(inChain(Object.assign(branch(b.hp, b.bar, b.revived, b.tok, b.p * fed * keep, false, b.left, b.sitrus), { fed: true, kept: true }), s));
      b.p *= fed * (1 - keep);
      b.fed = true;
    }
    out.push(inChain(b, s));
  };
  const init = stateOf(f, hp ?? f.hp, bar);
  const bars = init.bar + 1;
  const guard = cat && bars > 1 && rec.bars ? rec.bars(cat === "special" ? Stat.SPDEF : Stat.DEF, bars) : null;
  const pointsOf = u => u.map(x => ({ d: x.d, p: x.p, n: x.d > 0 ? Math.max(1, Math.round(x.n ?? 1)) : 0, se: x.se }));
  const first = pointsOf(use);
  const from = chain?.from ?? NO_CHAIN;
  const stepOf = chain ? chain.step : () => NO_STEP;
  let states = (start?.length
    ? start.map(x => branch(x.hp, x.bar ?? init.bar, !!x.revived, !!x.tok, x.p, false, x.left ?? held, x.sitrus ?? sitHeld))
    : robbed(branch(init.hp, init.bar, false, false, 1, false, held, sitHeld))).flatMap(b => from.map(c => inChain(branch(b.hp, b.bar, b.revived, b.tok, b.p * c.p, false, b.left, b.sitrus), c.s)));
  const by = [], downAt = [];
  const brokeAt = Array(bars).fill(KO_USES);
  let down = 0, after1 = [];
  for (let i = 0; i < KO_USES; i++) {
    const points = i && useAt ? pointsOf(useAt(i)) : first;
    const a = Math.max(0, Math.min(1, act(i)));
    const factors = [];
    const factor = broken => (factors[broken] ??= scale(i, broken) * (guard ? guard[Math.min(broken, bars - 1)] : 1));
    const hit = [];
    let fell = 0, fellTo = chain ? new Map() : null;
    const wentOff = i === 0 ? new Map() : null;
    const pre = preHeal?.(i);
    const early = pre?.heal > 0 ? Math.max(0, Math.min(1, pre.p)) : 0;
    // `late`: this branch takes `pre`'s heal at the turn end.
    const split = pre?.heal > 0 ? states.flatMap(st => [
      ...(early > 0 ? [inChain(branch(Math.min(f.maxHp, st.hp + pre.heal), st.bar, st.revived, st.tok, st.p * early, false, st.left, st.sitrus), st.s)] : []),
      ...(early < 1 ? [Object.assign(inChain(branch(st.hp, st.bar, st.revived, st.tok, st.p * (1 - early), false, st.left, st.sitrus), st.s), { late: true })] : []),
    ]) : states;
    for (const st of split) {
      const mark = hit.length;
      for (const to of stepOf(st.s)) {
        const go = to.act ? a : 0, p = st.p * to.p;
        if (go < 1) hit.push(inChain(branch(st.hp, st.bar, st.revived, st.tok, p * (1 - go), false, st.left, st.sitrus), to.s));
        if (wentOff && go > 0) addShare(wentOff, to.s, p * go);
        for (const x of points) {
          const q = p * go * x.p;
          if (!(q > 0)) continue;
          let branches = [branch(st.hp, st.bar, st.revived, st.tok, q, false, st.left, st.sitrus)];
          for (let k = 0; k < x.n; k++) {
            const next = [];
            for (const b of branches) {
              if (b.stop) next.push(b);
              else {
                const gone = land(f, b, x.d / x.n * factor(init.bar - b.bar), next);
                fell += gone;
                if (fellTo) addShare(fellTo, to.s, gone);
              }
            }
            branches = next;
          }
          const fed = berry && x.d > 0 ? x.se ?? seAt(i) : 0;
          for (const b of branches) {
            b.stop = false;
            pushFed(hit, b, to.s, fed);
          }
        }
      }
      if (st.late) for (let k = mark; k < hit.length; k++) hit[k].late = true;
    }
    if (i === 0 && firstKo != null && !start) {
      const standing = hit.reduce((t, x) => t + x.p, 0);
      const k = Math.min(1, firstKo);
      const offs = shares([...wentOff.values()], from);
      if (standing > 0) for (const x of hit) x.p *= (1 - k) / standing;
      else if (k < 1) {
        // They survived a use that landed.
        const landed = points.filter(x => x.d > 0), mass = landed.reduce((t, x) => t + x.p, 0);
        const fed = berry && mass > 0 ? landed.reduce((t, x) => t + x.p * (x.se ?? seAt(0)), 0) / mass : 0;
        for (const c of offs) for (const b of robbed(branch(1, init.bar, false, false, (1 - k) * c.p, false, held, sitHeld))) pushFed(hit, b, c.s, fed);
      }
      fell = k;
      if (fellTo) fellTo = new Map(offs.map(c => [c.s?.key, { s: c.s, p: k * c.p }]));
    }
    down += fell;
    const h = typeof turnEnd === "function" ? turnEnd(i + 1) : turnEnd;
    const h0 = typeof beforeBerry === "function" ? beforeBerry(i + 1) : beforeBerry;
    // `b` after a signed turn-end change, null where the chip fells it.
    const endStep = (b, d) => {
      if (d > 0) b.hp = Math.min(f.maxHp, b.hp + d);
      else if (d < 0) {
        const out = [];
        const gone = land(f, b, -d, out, false);
        down += gone;
        if (fellTo) addShare(fellTo, b.s, gone);
        return out.length ? inChain(out[0], b.s) : null;
      }
      return b;
    };
    const groups = new Map();
    const settle = b => {
      if (!b) return;
      const key = `${b.bar}|${b.revived}|${b.tok}|${b.left}|${b.sitrus}${chain ? `|${b.s.key}` : ""}`;
      if (!groups.has(key)) groups.set(key, { b, pts: [] });
      groups.get(key).pts.push({ d: b.hp, p: b.p });
    };
    const stolen = stealRate(i);
    for (let b of hit) {
      if (b.late) b.hp = Math.min(f.maxHp, b.hp + pre.heal);
      if (!b.fed && !(sit && b.sitrus > 0)) {
        settle(endStep(b, h));
        continue;
      }
      // `endStep` may hand back a fresh branch, which carries no `fed` or `kept`.
      const { fed, kept } = b;
      b = endStep(b, h0);
      if (!b) continue;
      const standing = [];
      steal(b, stolen, standing);
      for (const r of standing) {
        // Both berries read the HP before either heals (game-code.md §21).
        const eats = sit && r.sitrus > 0 && belowHalf(r.hp, f.maxHp);
        const heal = (fed ? berry.heal : 0) + (eats ? sit.heal : 0);
        if (fed && !kept) r.left--;
        const out = [r];
        if (eats) {
          if (sit.keep > 0) out.push({ ...r, p: r.p * sit.keep });
          r.p *= 1 - sit.keep;
          r.sitrus--;
        }
        for (const o of out) {
          o.hp = Math.min(f.maxHp, o.hp + heal);
          settle(endStep(o, h - h0));
        }
      }
    }
    states = [...groups.values()].flatMap(({ b, pts }) => squeezeDist(pts, KO_LEVELS).filter(x => x.p > 1e-9).map(x => inChain(branch(x.d, b.bar, b.revived, b.tok, x.p, false, b.left, b.sitrus), b.s)));
    downAt.push(fellTo ? [...fellTo.values()].filter(x => x.p > 0) : []);
    if (i === 0) {
      const p = states.reduce((t, x) => t + x.p, 0);
      after1 = p > 0 ? states.map(x => ({ hp: x.hp, bar: x.bar, revived: x.revived, tok: x.tok, left: x.left, sitrus: x.sitrus, p: x.p / p })) : [];
    }
    by.push(Math.min(1, down));
    for (let k = 1; k <= bars; k++) {
      if (brokeAt[k - 1] < KO_USES) continue;
      const gone = down + (k < bars ? states.reduce((t, x) => t + (init.bar - x.bar >= k ? x.p : 0), 0) : 0);
      if (gone >= 0.5) brokeAt[k - 1] = i + 1;
    }
  }
  const perChunk = brokeAt.map((n, k) => Math.max(0, n - (k ? brokeAt[k - 1] : 0)));
  return { by, after1, perChunk, downAt };
};

const abAttrs = (p, name) => (ability(p, name)
  ? [p.getAbility?.(), p.hasPassive?.() ? p.getPassiveAbility?.() : null].flatMap(a => a?.getAttrs?.(name) ?? []) : []);
const frac = (max, n) => Math.max(1, Math.floor(max / n));
// @mirrors weather-spared
const WEATHER_SPARED = { [WeatherType.SANDSTORM]: [PokemonType.GROUND, PokemonType.ROCK, PokemonType.STEEL], [WeatherType.HAIL]: [PokemonType.ICE] };
// @mirrors orb-spared
const ORB_SPARED = { [StatusEffect.POISON]: [PokemonType.POISON, PokemonType.STEEL], [StatusEffect.TOXIC]: [PokemonType.POISON, PokemonType.STEEL], [StatusEffect.BURN]: [PokemonType.FIRE] };
// @mirrors salt-doubled
export const SALT_DOUBLED = [PokemonType.WATER, PokemonType.STEEL];
const opponentsOf = (env, p) => {
  try { const o = p.getOpponents?.(); if (Array.isArray(o)) return o.filter(Boolean); } catch {}
  try { return (env?.field ?? []).filter(q => q && q !== p && q.isPlayer?.() !== p.isPlayer?.()); } catch { return []; }
};
const tagsOf = p => { try { return p.summonData?.tags ?? []; } catch { return []; } };
// The Sitrus Berry's trigger: `getHpRatio` rounds to a whole percent (game-code.md §21).
const belowHalf = (hp, max) => Math.round((hp / max) * 100) / 100 < 0.5;
const berryQuarter = p => Math.max(1, Math.floor(p.getMaxHp() / 4)) * (ability(p, "DoubleBerryEffectAbAttr") ? 2 : 1);
const unnerved = (env, p) => opponentsOf(env, p).some(q => ability(q, "PreventBerryUseAbAttr"));
// One Sitrus or Enigma Berry's heal before the max-HP cap, how many `p` holds, and the chance `keep` that a Berry Pouch
// leaves one it eats held; null under Heal Block. An opposing Unnerve is the reader's to ask, since it turns on who
// faces `p` (game-code.md §3).
const quarterBerryOf = (env, p, type) => {
  const left = items(p).filter(m => m.constructor.name === "BerryModifier" && m.berryType === type)
    .reduce((t, m) => t + (m.getStackCount?.() ?? m.stackCount ?? 1), 0);
  if (!left || p.getTag?.("HEAL_BLOCK")) return null;
  return { heal: Math.floor(berryQuarter(p) * healingCharm(env, p)), left, keep: berryPouch(env, p) };
};
const enigmaOf = (env, p) => quarterBerryOf(env, p, BerryType.ENIGMA);
const sitrusOf = (env, p) => quarterBerryOf(env, p, BerryType.SITRUS);
// In the game's own phase order (game-code.md §21).
const endOfTurnSteps = (env, p, { hp = p.hp, dealt = 0, sitrus = true } = {}) => {
  const steps = [];
  if (hp <= 0) return steps;
  const max = p.getMaxHp();
  const types = p.getTypes?.() ?? [];
  const guard = ability(p, "BlockNonDirectDamageAbAttr");
  const w = env?.weather ?? WeatherType.NONE;
  const weather = w && !(env?.field ?? []).some(q => q && ability(q, "SuppressWeatherEffectAbAttr")) ? w : WeatherType.NONE;
  const inWeather = a => (a.weatherTypes ?? []).includes(weather);
  const blocked = !!p.getTag?.("HEAL_BLOCK");
  const charm = healingCharm(env, p);
  let cur = hp;
  const chip = n => {
    if (cur <= 0 || !(n > 0)) return;
    steps.push({ d: -n });
    cur = Math.max(0, cur - n);
  };
  const queued = (n, cap = max, most = Infinity) => {
    const v = blocked ? 0 : Math.min(Math.floor(n * charm), most);
    if (cur <= 0 || !(v > 0) || cur >= cap) return;
    steps.push({ d: v, cap });
    cur = Math.min(cap, cur + v);
  };
  // Heal Block doesn't stop a negative heal (game-code.md §18).
  const reverse = n => chip(Math.floor(n * charm));

  const shellBells = stack(p, "HitHealModifier");
  if (dealt > 0 && shellBells > 0) queued(frac(dealt * shellBells, 8));

  if (WEATHER_SPARED[weather] && !guard && !types.some(t => WEATHER_SPARED[weather].includes(t))
    && !abAttrs(p, "BlockWeatherDamageAttr").some(a => !a.weatherTypes?.length || inWeather(a))
    && !p.getTag?.("UNDERGROUND") && !p.getTag?.("UNDERWATER")) chip(frac(max, 16));
  if (!guard) for (const a of abAttrs(p, "PostWeatherLapseDamageAbAttr")) if (inWeather(a)) chip(frac(max, 16 / (a.damageFactor ?? 2)));
  for (const a of abAttrs(p, "PostWeatherLapseHealAbAttr")) if (inWeather(a)) queued(frac(max, 16 / (a.healFactor ?? 1)));

  steps.berries = steps.length;
  if (sitrus && cur > 0 && !unnerved(env, p) && belowHalf(cur, max)
    && items(p).some(m => m.constructor.name === "BerryModifier" && m.berryType === BerryType.SITRUS)) queued(berryQuarter(p));

  // A held Lum cures the status first (game-code.md §3). Gotcha: nothing here spends it, so a Lum + Toxic Orb holder
  // reads the orb's fresh toxic every turn of a course, flat at 1/16, where in game the Lum goes after one cure and the
  // count grows; `status &&` below is what restarts that count.
  const status = !unnerved(env, p) && lumsHeld(p) ? 0 : p.status?.effect || 0;
  // A status orb is counted a turn early: in game its status lands after this chip (game-code.md §21).
  const orb = status ? null : items(p).find(m => m.constructor.name === "TurnStatusEffectModifier" && !types.some(t => ORB_SPARED[m.effect]?.includes(t)));
  const effect = status || orb?.effect || 0;
  if ([StatusEffect.POISON, StatusEffect.TOXIC, StatusEffect.BURN].includes(effect) && !guard && !abAttrs(p, "BlockStatusDamageAbAttr").some(a => (a.effects ?? []).includes(effect))) {
    let d = effect === StatusEffect.POISON ? frac(max, 8) : effect === StatusEffect.TOXIC ? Math.max(1, Math.floor(max * (((status && p.status?.toxicTurnCount) || 0) + 1) / 16)) : frac(max, 16);
    if (effect === StatusEffect.BURN) for (const a of abAttrs(p, "ReduceBurnDamageAbAttr")) d = Math.max(1, Math.floor(d * (a.multiplier ?? 0.5)));
    chip(d);
  }

  for (const t of tagsOf(p)) {
    if (isA(t, "IngrainTag") || isA(t, "AquaRingTag")) { queued(frac(max, 16)); continue; }
    if (guard) continue;
    if (isA(t, "SeedTag") || isA(t, "DamagingTrapTag")) chip(frac(max, 8));
    else if (isA(t, "NightmareTag") || isA(t, "CursedTag")) chip(frac(max, 4));
    else if (isA(t, "SaltCuredTag")) chip(frac(max, types.some(x => SALT_DOUBLED.includes(x)) ? 8 : 16));
  }
  // The seeder's payout reads the seeded mon's HP as it stands, so a seed that this turn's chip would fell first
  // still pays here.
  const mine = (() => { try { return p.getBattlerIndex?.(); } catch { return undefined; } })();
  if (mine != null) for (const q of opponentsOf(env, p)) {
    if (ability(q, "BlockNonDirectDamageAbAttr") || !(q.hp > 0)) continue;
    if (!tagsOf(q).some(t => isA(t, "SeedTag") && t.sourceIndex === mine)) continue;
    const taken = Math.min(frac(q.getMaxHp(), 8), q.hp);
    if (ability(q, "ReverseDrainAbAttr")) reverse(taken); else queued(taken);
  }
  queued(frac(max, 16) * stack(p, "TurnHealModifier"));
  if (env?.terrain === TerrainType.GRASSY && (p.isGrounded?.() ?? !types.includes(PokemonType.FLYING))) queued(frac(max, 16));
  if (p.isPlayer?.() === false) {
    for (const m of (env?.enemyModifiers ?? []).filter(x => x.constructor.name === "EnemyTurnHealModifier")) {
      // `preventFullHeal` caps the amount at max − 1, not the HP, so the token can heal to full.
      queued((max * (m.getStackCount?.() ?? 1) * (m.healPercent ?? 2)) / 100, max, max - 1);
    }
  }
  if (abAttrs(p, "PostTurnStatusHealAbAttr").some(a => (a.effects ?? []).includes(effect))) queued(frac(max, 8));
  const asleep = effect === StatusEffect.SLEEP || (() => { try { return !!p.hasAbility?.(AbilityId.COMATOSE); } catch { return false; } })();
  // Asks the sleeper's Magic Guard as well as the holder's, where the game's `apply` asks only the holder's
  // (game-code.md §21): in a double, a Magic Guard sleeper beside one without it takes the chip in game and is
  // spared here.
  const badDreams = q => ability(q, "PostTurnHurtIfSleepingAbAttr") && !ability(q, "BlockNonDirectDamageAbAttr");
  if (asleep && !guard && opponentsOf(env, p).some(badDreams)) chip(frac(max, 8));
  return steps;
};
const applyTurnEnd = (steps, hp, max) => {
  let cur = hp;
  for (const st of steps) {
    if (cur <= 0) return 0;
    cur = st.d > 0 ? Math.max(cur, Math.min(st.cap ?? max, cur + st.d)) : Math.max(0, cur + st.d);
  }
  return cur;
};
// Signed, with no boss bars in the way, and no Enigma Berry: that is `koCurve`'s, as is the Sitrus under `sitrus`
// false. `hp`: the HP it will have by then; `dealt`: this turn's damage dealt, for Shell Bell; `beforeBerries`: only the
// part ahead of the BerryPhase. Reads fields and item and ability attributes only.
// @only 25-turn, tests: sceneTurnEndHp
export const sceneTurnEndHp = (env, p, opts = {}) => {
  const hp = opts.hp ?? p.hp;
  if (hp <= 0) return 0;
  const steps = endOfTurnSteps(env, p, opts);
  return applyTurnEnd(opts.beforeBerries ? steps.slice(0, steps.berries ?? 0) : steps, hp, p.getMaxHp()) - hp;
};

// @mirrors result-mult
const RESULT_MULT = { [HitResult.EFFECTIVE]: 1, [HitResult.EXTREMELY_EFFECTIVE]: 4, [HitResult.SUPER_EFFECTIVE]: 2, [HitResult.NOT_VERY_EFFECTIVE]: 0.5,
  [HitResult.MOSTLY_INEFFECTIVE]: 0.25, [HitResult.ONE_HIT_KO]: 1, [HitResult.NO_EFFECT]: 0, [HitResult.IMMUNE]: 0 };
// The damage roll (game-code.md §1).
// @mirrors add-rolls
const addRolls = (m, max, p) => {
  for (let r = 85; r <= 100; r++) {
    const d = max > 0 ? Math.max(1, Math.floor(max * r / 100)) : 0;
    m.set(d, (m.get(d) ?? 0) + p / 16);
  }
};
// Present's power draws from Phaser's RND (game-code.md §4): pin the draw to price each power.
const withSeed = (seed, fn) => {
  const R = Phaser.Math.RND, own = Object.prototype.hasOwnProperty.call(R, "integerInRange"), orig = R.integerInRange;
  R.integerInRange = min => min + seed;
  try { return fn(); } finally { if (own) R.integerInRange = orig; else delete R.integerInRange; }
};
// Rows are [seed, chance] for `withSeed` (game-code.md §4). The heal is carried as zero damage, and the strikes it
// would cancel still play out.
// @mirrors present
const PRESENT = k => (k === 0
  ? [[0, 41 / 100], [50, 30 / 100], [75, 10 / 100]]
  : [[0, 41 / 80], [50, 30 / 80], [75, 9 / 80]]);
// @mirrors present-heal
const PRESENT_HEAL = 19 / 100;
// Multi-Lens' share of strike `k` (game-code.md §2). `n` is the lens count 07-move-traits already checked.
// @mirrors lens-share
const lensShare = (n, k) => (!n ? 1 : k === 0 ? 1 - 0.25 * n : k === n + 1 ? 1 : 0.25);

// The game's own damage at roll `r`, asked by scaling STAB, which shares the roll's product (game-code.md §1).
const atRoll = (def, r, fn) => {
  if (r >= 1 || typeof def.calculateStabMultiplier !== "function") return fn();
  const own = Object.prototype.hasOwnProperty.call(def, "calculateStabMultiplier"), orig = def.calculateStabMultiplier;
  def.calculateStabMultiplier = function (...a) { return orig.apply(this, a) * r; };
  try { return fn(); } finally { if (own) def.calculateStabMultiplier = orig; else delete def.calculateStabMultiplier; }
};

// Only the last Lock-On or Mind Reader's target (game-code.md §5); without a move history (mocks), any target.
const lockedOn = (atk, def) => {
  if (!atk.getTag?.("IGNORE_ACCURACY")) return false;
  if (typeof atk.getLastXMoves !== "function") return true;
  const aimed = (atk.getLastXMoves(-1) ?? []).find(m => m.move === MoveId.LOCK_ON || m.move === MoveId.MIND_READER);
  return !!aimed?.targets?.includes(def.getBattlerIndex?.());
};
// One strike's hit chance (game-code.md §5).
const accuracy = (atk, def, move, ohko = false) => {
  if (move.moveTarget === MoveTarget.USER) return 1;
  if (ability(atk, "AlwaysHitAbAttr") || ability(def, "AlwaysHitAbAttr") || lockedOn(atk, def)
    || def.getTag?.("ALWAYS_GET_HIT") || (def.getTag?.("TELEKINESIS") && !ohko)) return 1;
  const w = typeof move.calculateBattleAccuracy === "function" ? move.calculateBattleAccuracy(atk, def, true) : move.accuracy;
  if (w === -1 || w == null) return 1;
  const mult = atk.getAccuracyMultiplier?.(def, move) ?? 1;
  return Math.max(0, Math.min(100, Math.ceil(w * mult - 1e-9))) / 100;
};
// `MovePhase` cancels these before the damage step, so the simulated call never sees them (game-code.md §14).
const cancelledBy = (env, atk, def, move) => {
  try {
    if (env.s.arena?.isMoveWeatherCancelled?.(atk, move)) return "weather";
    if (env.s.arena?.isMoveTerrainCancelled?.(atk, [def.getBattlerIndex?.()], move)) return "terrain";
  } catch {}
  return null;
};
const flagApplies = (move, flag, atk, def, fallback) =>
  typeof move.doesFlagEffectApply === "function" ? !!move.doesFlagEffectApply({ flag, user: atk, target: def }) : fallback;
const bypassesProtect = (atk, def, move) => {
  try { return flagApplies(move, MoveFlags.IGNORE_PROTECT, atk, def, hasFlag(move, MoveFlags.IGNORE_PROTECT)); } catch { return false; }
};
const ignoresAbilities = (atk, move) => {
  try { return flagApplies(move, MoveFlags.IGNORE_ABILITIES, atk, undefined, ability(atk, "MoveAbilityBypassAbAttr") || hasFlag(move, MoveFlags.IGNORE_ABILITIES)); } catch { return false; }
};
// `ignoreAbility` alone leaves Levitate up (game-code.md §1, #732).
// @mirrors move-runs
const asMoveRuns = (env, atk, def, move, opts, fn) => {
  const arena = env.s.arena;
  if (!arena || opts.aiView || !ignoresAbilities(atk, move)) return fn();
  const { ignoreAbilities, ignoringEffectSource } = arena;
  const source = atk.getBattlerIndex?.() ?? null;
  arena.ignoreAbilities = true;
  // Off the field both answer -1 (game-code.md §1): exempting the user there would exempt the defender too, so neither
  // is, and the user's own ignorable abilities go quiet as well.
  arena.ignoringEffectSource = source !== def.getBattlerIndex?.() ? source : null;
  try { return fn(); } finally { Object.assign(arena, { ignoreAbilities, ignoringEffectSource }); }
};

const fromGame = (env, atk, def, pm, opts) => {
  const move = pm.getMove();
  if (attrs(move, "CounterDamageAttr").length) return null; // reacts to damage taken this turn: nothing yet
  const aiBlind = !!opts.aiView && !def.waveData?.abilityRevealed;
  const ignoreAbility = aiBlind || ignoresAbilities(atk, move);
  // The live hit leaves the bypass to the arena: `ignoreAbility` would drop Shadow Shield too (game-code.md §1, #732).
  const gameIgnore = aiBlind || (ignoreAbility && !env.s.arena?.ignoreAbilities);
  const ignoreAllyAbility = !!opts.aiView && !def.getAlly?.()?.waveData?.abilityRevealed;
  // A cached Tera Shell result would leak into this move (game-code.md §1); the sandbox restores it.
  if (def.turnData) def.turnData.moveEffectiveness = null;

  const type = TYPES[atk.getMoveType(move)] ?? "Normal";
  const cat = (atk.getMoveCategory?.(def, move) ?? move.category) === MoveCategory.PHYSICAL ? "physical" : "special";
  const priority = move.getPriority?.(atk, true) ?? move.priority ?? 0;
  const spread = SPREAD_TARGETS.includes(move.moveTarget);
  const others = (env.field ?? []).filter(p => p && p !== atk && p.hp > 0 && (p.isOnField?.() ?? true));
  const spreadApplied = spread && (move.moveTarget === MoveTarget.ALL_OTHERS || move.moveTarget === MoveTarget.ALL_NEAR_OTHERS ? others : others.filter(p => p.isPlayer?.() !== atk.isPlayer?.())).length > 1;

  const t = traitsNow(env, atk, move, true, def);
  const dist = t.hits.dist;
  const hitsMax = Math.max(...dist.map(x => x.n));

  // `turnData` is fresh at the prompt, so it is set the way `MoveEffectPhase` would (game-code.md §1). A 2–5 hit
  // move reuses the longest count's numbers: nothing that reads `hitCount` applies to it (§2).
  const call = (k, isCritical) => {
    if (atk.turnData) { atk.turnData.hitCount = hitsMax; atk.turnData.hitsLeft = hitsMax - k; }
    return def.getAttackDamage({ source: atk, move, ignoreAbility: gameIgnore, ignoreSourceAbility: false, ignoreAllyAbility, ignoreSourceAllyAbility: false, isCritical, simulated: true });
  };
  const first = call(0, false);
  const eGame = def.getMoveEffectiveness?.(atk, move, gameIgnore, true);
  const e = first.cancelled ? 0 : typeof eGame === "number" ? eGame : RESULT_MULT[first.result] ?? 1;
  const base = { name: pm.getName(), type, cat, e, priority, spread, spreadApplied, traits: t, self: 0, bypassProtect: bypassesProtect(atk, def, move) };
  const blocked = cancelledBy(env, atk, def, move);
  if (first.cancelled || first.result === HitResult.NO_EFFECT || first.result === HitResult.IMMUNE || blocked) {
    return { ...base, acc: 0, crit: 0, dist, perHit: [{ max: 0, min: 0 }], targetHp: def.hp, expected: 0, uncapped: 0, max: 0, pKo: 0, revive: 0, costs: [], notes: [blocked ? `stopped by ${blocked}` : "no effect"], use: [{ d: 0, p: 1, n: 0 }], focus: 0, flinch: 0 };
  }

  const ohko = first.result === HitResult.ONE_HIT_KO;
  const fixed = !ohko && attrs(move, "FixedDamageAttr").length > 0;
  const psywave = attrs(move, "RandomLevelDamageAttr").length > 0;
  const present = attrs(move, "PresentPowerAttr").length > 0;
  const crit = opts.crit === true ? 1 : opts.crit === false || fixed || ohko ? 0 : (() => {
    if (!ignoreAbility && ability(def, "BlockCritAbAttr")) return 0;
    const side = def.isPlayer?.() ? ArenaTagSide.PLAYER : ArenaTagSide.ENEMY;
    if ((env.arenaTags ?? []).some(t => t.constructor.name === "NoCritTag" && (!t.side || t.side === side))) return 0;
    if (attrs(move, "CritOnlyAttr").length || atk.getTag?.("ALWAYS_CRIT") || (ability(atk, "ConditionalCritAbAttr") && [StatusEffect.POISON, StatusEffect.TOXIC].includes(def.status?.effect))) return 1;
    // @mirrors crit-odds
    return [1 / 24, 1 / 8, 1 / 2, 1][Math.max(0, Math.min(3, def.getCritStage?.(atk, move) ?? 0))];
  })();

  const capped = attrs(move, "ModifiedDamageAttr").length > 0;

  const maxes = [];
  const lows = [];
  const perHit = [];
  for (let k = 0; k < hitsMax; k++) {
    const m = new Map();
    if (ohko) {
      const blocked = !ignoreAbility && ability(def, "BlockOneHitKOAbAttr");
      maxes.push(blocked ? 0 : def.hp);
      m.set(maxes[k], 1);
    } else if (psywave) {
      // Psywave (game-code.md §0).
      const lens = lensShare(t.hits.lenses, k);
      // @mirrors psywave-range
      const fix = r => Math.max(1, Math.floor(Math.max(1, Math.floor(atk.level * (r * 0.01))) * lens));
      for (let r = 50; r <= 150; r++) { const d = fix(r); m.set(d, (m.get(d) ?? 0) + 1 / 101); }
      maxes.push(fix(150));
    } else if (fixed) {
      maxes.push(k ? call(k, false).damage : first.damage);
      m.set(maxes[k], 1);
    } else {
      let top = 0;
      for (const [seed, pv] of present ? PRESENT(k) : [[null, 1]]) {
        const run = (isCritical, r = 1) => {
          const one = () => atRoll(def, r, () => (seed === null && !k && !isCritical && r === 1 ? first : call(k, isCritical))).damage;
          return seed === null ? one() : withSeed(seed, one);
        };
        const spread = (isCritical, p) => {
          const d = run(isCritical, 1);
          if (!capped) { addRolls(m, d, p); return d; }
          for (let r = 85; r <= 100; r++) {
            const v = r === 100 ? d : run(isCritical, r / 100);
            m.set(v, (m.get(v) ?? 0) + p / 16);
            lows[k] = Math.min(lows[k] ?? Infinity, v);
          }
          return d;
        };
        if (crit < 1) top = Math.max(top, spread(false, pv * (1 - crit)));
        if (crit > 0) { const d = spread(true, pv * crit); if (crit === 1) top = Math.max(top, d); }
      }
      if (present && k === 0) m.set(0, (m.get(0) ?? 0) + PRESENT_HEAL);
      maxes.push(top);
    }
    perHit.push(m);
  }
  const acc = accuracy(atk, def, move, ohko);
  const checkAll = t.hits.checkAll;
  // Taken before Disguise zeroes the first hit: a later use meets no disguise.
  const use = useDist(perHit, dist, acc, checkAll);
  // The simulated call ignores Disguise and Ice Face (game-code.md §1).
  const disguise = !ignoreAbility && !!def.getAbility?.()?.getAttrs?.("FormBlockDamageAbAttr")?.some(a => a.formIndex === def.formIndex);
  if (disguise) { perHit[0] = new Map([[0, 1]]); maxes[0] = 0; }

  const facts = targetFacts(env, def, ignoreAbility);
  const f = fixed && facts.sturdy && fixedIgnoresSturdy(env) ? { ...facts, sturdy: false } : facts;
  const ends = resolve(f, perHit, dist, acc, checkAll, ohko);
  const expected = f.hp - ends.reduce((t, x) => t + x.p * Math.max(0, x.hp), 0);
  const pKo = f.revive ? 0 : ends.filter(x => x.hp <= 0).reduce((t, x) => t + x.p, 0);
  // Expected damage a use before the target's HP or a bar cuts it: what later turns deal.
  const uncapped = perHit.reduce((t, m, k) => t + (k === 0 || checkAll ? acc ** (k + 1) : acc)
    * dist.filter(x => x.n > k).reduce((u, x) => u + x.p, 0) * [...m].reduce((u, [d, p]) => u + d * p, 0), 0);
  const [worst] = resolve({ ...f, pFocus: 0, pEndure: 0 }, maxes.map(d => new Map([[d, 1]])), [{ n: hitsMax, p: 1 }], 1, false, ohko);

  // Whether the order lets it land is the planner's (game-code.md §5).
  const semiTag = (def.summonData?.tags ?? []).find(t => isA(t, "SemiInvulnerableTag"));
  const semi = !!semiTag && move.moveTarget !== MoveTarget.USER && !(ability(atk, "AlwaysHitAbAttr") || ability(def, "AlwaysHitAbAttr")
    || lockedOn(atk, def) || attrs(move, "HitsTagAttr").some(h => h.tagType === semiTag.tagType));
  const notes = [];

  // `self`: the HP a use costs its user, with hits counted as if the target never faints before the last.
  const maxHp = atk.getMaxHp?.() ?? 0;
  let self = 0;
  const landed = checkAll
    ? Array.from({ length: hitsMax }, (_, k) => acc ** (k + 1) * dist.filter(x => x.n > k).reduce((t, x) => t + x.p, 0)).reduce((t, x) => t + x, 0)
    : acc * dist.reduce((t, x) => t + x.n * x.p, 0);
  const contact = flagApplies(move, MoveFlags.MAKES_CONTACT, atk, def, hasFlag(move, MoveFlags.MAKES_CONTACT));
  const fromTarget = [];
  if (contact && !t.guarded && maxHp && ability(def, "PostDefendContactDamageAbAttr")) {
    const [abName, ratio] = [def.getAbility?.(), def.hasPassive?.() ? def.getPassiveAbility?.() : null]
      .flatMap(a => (a?.getAttrs?.("PostDefendContactDamageAbAttr") ?? []).map(x => [a.name, x.damageRatio])).find(Boolean) ?? ["contact", 8];
    const chip = Math.max(1, Math.floor(maxHp / (ratio || 8))) * landed;
    self += chip;
    fromTarget.push(`${abName}: ≈−${Math.round(chip / maxHp * 100)}%`);
  }
  let recoilShare = null;
  if (t.recoil && !t.recoil.blocked && maxHp) {
    const hurt = t.recoil.useHp ? Math.max(1, Math.floor(maxHp * t.recoil.ratio)) * acc : expected * t.recoil.ratio;
    self += hurt;
    recoilShare = hurt / maxHp;
  }
  if (t.halfSac && maxHp) self += Math.max(1, Math.floor(maxHp / 2));
  if (t.crash && maxHp && acc < 1) self += Math.max(1, Math.floor(maxHp / 2)) * (1 - acc);
  const selfKo = t.selfKo === "onHit" ? acc : t.selfKo === "always" ? 1 : 0;
  const costs = [...fromTarget, ...costNotes(t, { recoil: recoilShare, type })];
  const drain = drainRatio(env, atk, def, t);
  if (drain > 0) notes.push(`drains ${Math.round(drain * 100)}%`);
  else if (drain < 0) notes.push(`Liquid Ooze: ${base.name} hurts ${Math.round(-drain * 100)}%`);

  if (dist.length > 1) notes.push(`${dist[0].n}–${hitsMax} hits`);
  else if (hitsMax > 1) notes.push(`${hitsMax} hits`);
  if (f.boss && f.idx > 0) notes.push(`boss ${f.idx + 1} bars`);
  if (f.sturdy && f.hp >= f.maxHp) notes.push("sturdy");
  if (f.pFocus) notes.push("focus band");
  if (f.revive) notes.push("reviver seed");
  if (disguise) notes.push("disguise");
  if (crit === 1) notes.push("crit");
  if (semi) notes.push("target semi-invulnerable");
  return {
    ...base, acc, crit, dist, semi, self, selfKo, drain,
    perHit: maxes.map((max, k) => ({ max, min: Math.min(max, lows[k] ?? Math.floor(max * 0.85)) })), targetHp: f.hp,
    expected, uncapped, max: f.hp - Math.max(0, worst.hp), pKo, revive: f.revive, costs, notes,
    use, focus: f.pFocus, flinch: flinchChance(atk, def, move, ignoreAbility),
  };
};

// @mirrors ate
const ATE = { Refrigerate: "Ice", Pixilate: "Fairy", Aerilate: "Flying", Galvanize: "Electric" };
const approx = (a, d, pm) => {
  const mv = pm.getMove();
  if (mv.category === MoveCategory.STATUS || !(mv.power > 0) || pm.getMovePp() - pm.ppUsed <= 0) return null;
  const ab = abilitiesOf(a);
  let type = TYPES[mv.type];
  let power = mv.power;
  const ate = ab.map(x => ATE[x]).find(Boolean);
  if (ate && type === "Normal") { type = ate; power *= 1.2; }
  if (ab.includes("Technician") && power <= 60) power *= 1.5;
  const phys = mv.category === MoveCategory.PHYSICAL;
  let atk = stat(a, phys ? Stat.ATK : Stat.SPATK);
  if (phys && (ab.includes("Huge Power") || ab.includes("Pure Power"))) atk *= 2;
  if (phys && ab.includes("Hustle")) atk *= 1.5;
  const base = ((2 * a.level / 5 + 2) * power * atk / stat(d, phys ? Stat.DEF : Stat.SPDEF)) / 50 + 2;
  const e = effectiveness(type, d, mv);
  const stab = typesOf(a).includes(type) ? (ab.includes("Adaptability") ? 2 : 1.5) : 1;
  let dmg = base * stab * e;
  if (phys && ab.includes("Tough Claws")) dmg *= 1.3;
  if (ab.includes("Sheer Force")) dmg *= 1.3;
  if (ab.includes("Strong Jaw") && /bite|crunch|fang|jaw/i.test(pm.getName())) dmg *= 1.5;
  return { name: pm.getName(), type, cat: phys ? "physical" : "special", e, dmg, spread: SPREAD_TARGETS.includes(mv.moveTarget), priority: mv.priority ?? 0 };
};
const fromApprox = (env, atk, def, pm) => {
  const x = approx(atk, def, pm);
  if (!x) return null;
  const mv = pm.getMove();
  const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
  const max = Math.floor(x.dmg);
  const facts = targetFacts(env, def);
  const end = applyHit(facts, max);
  const { revive, pFocus } = facts;
  const rolls = new Map();
  addRolls(rolls, max, 1);
  const t = traitsNow(env, atk, mv, false, def);
  return {
    // `raw`: the estimate before the target's HP cuts it, which is what a `dmg` for the rows is taken from.
    raw: x.dmg,
    name: x.name, type: x.type, cat: x.cat, e: x.e, priority: x.priority, spread: x.spread, spreadApplied: false, traits: t, semi: false, self: 0,
    acc, crit: 0, dist: [{ n: 1, p: 1 }], perHit: [{ max, min: Math.floor(max * 0.85) }], targetHp: def.hp,
    expected: Math.min(def.hp - end.hp, max * 0.925) * acc, uncapped: max * 0.925 * acc, max: def.hp - end.hp, pKo: end.ko && !revive ? acc : 0, revive,
    costs: costNotes(t, { type: x.type }), notes: ["estimate"], live: false,
    use: useDist([rolls], [{ n: 1, p: 1 }], acc, false), focus: pFocus, flinch: flinchChance(atk, def, mv, false), drain: drainRatio(env, atk, def, t),
  };
};

// `dmg` is what moves are compared by. The game applies the ¾ spread factor and the planner applies its own, so the
// game's comes back out here.
// @mirrors with-dmg
const withDmg = (o, mv, foe) => o && {
  ...o,
  dmg: o.live === false
    ? (o.raw ?? o.max) * (foe ? FOE_MARGIN : reliability(mv))
    : (foe ? o.max : o.expected * reliability(mv)) / (o.spreadApplied ? 0.75 : 1),
};

// @only 25-turn, tests: sceneOutcome, sceneOutcomes, sceneStatusMoves
export const sceneOutcome = (env, atk, def, pm, opts = {}) => {
  try {
    const move = pm.getMove();
    const o = keepTurnData([atk, def], () => asMoveRuns(env, atk, def, move, opts, () => fromGame(env, atk, def, pm, opts)));
    return o && withDmg({ ...o, live: true }, move, env.isEnemy(atk));
  } catch (e) {
    sceneOutcome.lastError = e;
    return approxOutcome(env, atk, def, pm);
  }
};
export const sceneOutcomes = (env, atk, def) => sceneUsable(env, atk, def).map(pm => sceneOutcome(env, atk, def, pm)).filter(Boolean);
// `e` 0: `def` is immune (game-code.md §14); `bounce`: Magic Bounce. `acc` and `e` mean nothing for a move not aimed
// at `def`.
export const sceneStatusMoves = (env, atk, def) => keepTurnData([atk, def], () => sceneUsable(env, atk, def, true).map(pm => {
  const move = pm.getMove();
  try {
    if (def.turnData) def.turnData.moveEffectiveness = null;
    const e = def.getMoveEffectiveness?.(atk, move, false, true) ?? 1;
    return {
      pm, name: pm.getName(), type: TYPES[atk.getMoveType(move)] ?? "Normal", cat: "status", acc: accuracy(atk, def, move), e,
      priority: move.getPriority?.(atk, true) ?? move.priority ?? 0, bypassProtect: bypassesProtect(atk, def, move),
      bounce: ability(def, "ReflectStatusMoveAbAttr") && !ability(atk, "MoveAbilityBypassAbAttr"), blocked: cancelledBy(env, atk, def, move),
    };
  } catch { return null; }
}).filter(Boolean));

export const approxOutcome = (env, atk, def, pm) => withDmg(fromApprox(env, atk, def, pm), pm.getMove(), env.isEnemy(atk));
export const approxOutcomes = (env, atk, def) => plainUsable(atk).map(pm => approxOutcome(env, atk, def, pm)).filter(Boolean);


// The likely KO turn: what the panel calls "2 hits".
export const koTurn = by => { const k = by.findIndex(x => x >= 0.5); return k < 0 ? 9 : k + 1; };
// The expected KO turn.
export const koTurns = by => Math.min(9, 1 + by.slice(0, 8).reduce((t, x) => t + (1 - x), 0));

// All hits of the likeliest hit count at max roll, before any boss-bar clamp.
export const rawMax = o => {
  const n = o.dist?.length ? o.dist.reduce((b, d) => (d.p > b.p ? d : b)).n : 1;
  return o.perHit?.length ? o.perHit.slice(0, n).reduce((t, h) => t + (h.max ?? 0), 0) : o.max;
};
// A record's own `use`, or for one without (an approximation), 16 rolls of `rawMax` rescaled to the record's mean.
export const useOf = o => {
  if (o?.use?.length) return o.use;
  const max = o ? rawMax(o) || o.max || o.dmg || 0 : 0;
  if (!(max > 0)) return [{ d: 0, p: 1, n: 0 }];
  const acc = Math.min(1, o.acc ?? 1);
  const n = o.dist?.length ? o.dist.reduce((b, d) => (d.p > b.p ? d : b)).n : 1;
  const pts = Array.from({ length: 16 }, (_, r) => ({ d: Math.max(1, Math.floor(max * (85 + r) / 100)), p: acc / 16 }));
  const mean = o.uncapped ?? o.expected;
  const k = mean > 0 ? mean / pts.reduce((t, x) => t + x.d * x.p, 0) : 1;
  return squeezeDist([...(acc < 1 ? [{ d: 0, p: 1 - acc, n: 0 }] : []), ...pts.map(x => ({ d: x.d * k, p: x.p, n }))], 12);
};
// A record's KO odds at another HP than its `targetHp`: linear across the roll range, all or nothing for an
// approximation.
export const koChanceAt = (o, hp) => {
  if (!o) return 0;
  if (hp <= 0) return 1;
  if (o.revive) return 0;
  if (hp >= (o.targetHp ?? Infinity)) return o.pKo ?? 0;
  if (!(o.max >= hp)) return 0;
  return o.live === false ? 1 : Math.max(o.pKo ?? 0, (o.acc ?? 1) * Math.min(1, (o.max - hp) / (0.15 * o.max) + 1 / 16));
};

// The damage factor on each bar from now, 1 for the current one, from the expected rise of `st` as a wild boss's bars
// break (game-code.md §3). `offence`: what its own hits gain, not what hits into it lose.
// @mirrors bar-break-factors
export const barBreakFactors = (foe, st, bars, offence = false, trainer = false) => {
  const out = [1];
  if (bars <= 1 || (foe.hasTrainer?.() ?? !!trainer)) return Array(Math.max(1, bars)).fill(1);
  const w = [Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.SPD].map(i => Math.max(0, foe.getStat?.(i, false) || 0));
  const share = w[st - 1] / (w.reduce((t, x) => t + x, 0) || 1);
  const s0 = foe.summonData?.statStages?.[st - 1] ?? 0;
  let up = 0;
  for (let i = 1; i < bars; i++) {
    const idx = bars - 1 - i;
    up += share * (1 + (foe.bossSegments >= 3 && idx === 0 ? 1 : 0) + (foe.bossSegments >= 5 && idx === 1 ? 1 : 0));
    const f = stage(s0) / stage(Math.min(6, s0 + up));
    out.push(offence ? 1 / f : f);
  }
  return out;
};
