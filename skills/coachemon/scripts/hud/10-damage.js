// Calls game code but never decides when that is allowed: 25-turn opens the one sandbox, predicts Tera and keys every
// answer before a `scene*` export runs, and `env` is its `sceneEnv`. Every other export is pure.
import { SPREAD_TARGETS, TYPES, abilitiesOf, effectiveness, forcedRng, gameVersionOf, hasMoldBreaker, keepTurnData, lumsHeld, movesetOf, squeezeDist, stage, stat, typesOf, versionAtLeast } from "./01-core.js";
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
  const holds = (p, id) => { try { return !!p.hasAbility?.(id); } catch { return false; } };
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

const substituteHp = t => {
  try { const hp = t.getTag?.("SUBSTITUTE")?.hp; return hp > 0 ? hp : 0; } catch { return 0; }
};
// The current form's Disguise or Ice Face, where its ability applies (game-code.md §8).
const formBlock = t => abAttrs(t, "FormBlockDamageAbAttr").find(a => a.formIndex === t.formIndex) ?? null;
// An intact Disguise or Ice Face as `{ chip }`, the HP its bust costs, else null (game-code.md §8).
const disguiseOf = (t, maxHp) => {
  const b = formBlock(t);
  return b ? { chip: b.recoil > 0 ? Math.max(1, Math.floor(maxHp * b.recoil)) : 0 } : null;
};
// Whether `def`'s form block, if any, stops `atk`'s `move`, by the attr's own condition (game-code.md §8).
const meetsBlock = (def, atk, move) => {
  const b = formBlock(def);
  try { return typeof b?.condition !== "function" || !!b.condition(def, atk, move); } catch { return true; }
};
// @only 25-turn, 12-value, tests: targetFacts
// @mirrors target-facts
export const targetFacts = (env, t, ignoreAbility = false) => {
  const maxHp = t.getMaxHp();
  const sitrus = sitrusOf(env, t), enigma = enigmaOf(env, t);
  const segs = t.bossSegments > 0 && (t.isBoss?.() ?? true) ? t.bossSegments : 0;
  const enemy = typeof t.isPlayer === "function" && !t.isPlayer();
  const endure = enemy && !t.waveData?.endured ? (env?.enemyModifiers ?? []).find(m => m.constructor.name === "EnemyEndureChanceModifier") : null;
  return {
    maxHp, hp: t.hp, boss: segs > 0, segs, segSize: segs ? maxHp / segs : 0, idx: segs ? t.bossSegmentIndex ?? segs - 1 : 0,
    minIdx: env?.finalBoss && !t.formIndex ? 1 : 0,
    finalBoss: enemy && !!env?.finalBoss && !t.formIndex,
    sturdy: !ignoreAbility && maxHp > 1 && ability(t, "PreDefendFullHpEndureAbAttr"),
    multiscale: !ignoreAbility && holds(t, AbilityId.MULTISCALE),
    shadowShield: holds(t, AbilityId.SHADOW_SHIELD),
    pFocus: Math.min(1, 0.1 * stack(t, "SurviveDamageModifier")),
    pEndure: endure ? Math.min(1, (endure.chance ?? 2) * (endure.getStackCount?.() ?? 1) / 100) : 0,
    // Reviver Seed (game-code.md §8).
    revive: stack(t, "PokemonInstantReviveModifier") ? Math.max(1, Math.floor(maxHp / 2)) : 0,
    disguise: ignoreAbility ? null : disguiseOf(t, maxHp),
    // The Substitute's HP left, 0 for none (game-code.md §8).
    sub: substituteHp(t),
    enigma, sitrus, others: othersOf(t, sitrus, enigma),
    unnerve: ability(t, "PreventBerryUseAbAttr"),
    shellBell: shellBellOf(env, t),
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
// Landing (CONTEXT.md, `Landing`): what one hit does to the side it lands on (game-code.md §2, §3, §8, §21). A Landing
// state is `{ hp, bar, facts }` and the discrete part, made by `stateOf`, `land` and `landTurnEnd` and read, never
// written. Team value lands no berries and no turn end (#1024).
// A Landing state's discrete part is every field but `hp`, `bar` and `facts`: `revived`, the Reviver Seed is spent;
// `tok`, the enemy endure token is spent for the wave; `busted`, a Disguise or Ice Face has taken its hit; `sub`, the
// Substitute's HP left, 0 for none; `sitrus` / `enigmas`, the Sitrus and Enigma Berries held; `others`, the stack held
// of each of `facts.others`' berry types, replaced and never written; `fed`, a super-effective hit landed this turn,
// which the turn end clears. A field `from` lacks starts fresh for `f`.
const fresh = (f, hp, bar, from = null) => {
  const others = pick(from, "others", UNSET);
  return { hp, bar, revived: pick(from, "revived", false), tok: pick(from, "tok", false), busted: pick(from, "busted", false),
    sub: pick(from, "sub", f?.sub > 0 ? f.sub : 0), sitrus: pick(from, "sitrus", f?.sitrus?.left ?? 0),
    enigmas: pick(from, "enigmas", f?.enigma?.left ?? 0), others: others !== UNSET ? others : f?.others?.length ? f.others.map(x => x.left) : NO_OTHERS,
    fed: pick(from, "fed", false), facts: f };
};
const UNSET = Symbol("unset");
const pick = (from, k, v) => {
  if (!from) return v;
  const x = from[k];
  return x !== undefined || k in from ? x : v;
};
const NO_OTHERS = [];
const DISCRETE = Object.keys(fresh(null)).filter(k => k !== "hp" && k !== "bar" && k !== "facts");
const LUCK = ["revived", "tok", "busted"];
const REST = DISCRETE.filter(k => !LUCK.includes(k) && k !== "others");
const NO_HIT = {}, NO_FACTS = {};
// `from` carries a discrete part to the new state, a Landing state, an `after1` entry or a search-state entry; its HP
// and bar are never read.
// @only 25-turn, 35-team-plan, tests: stateOf
export const stateOf = (facts, hp = facts.hp, bar = null, from = null) => fresh(facts, hp, bar ?? facts.idx ?? 0, from);
// The state a side keeps once it leaves the field: its Substitute is gone (game-code.md §8).
// @only 35-team-plan, tests: benched
export const benched = s => (s.sub > 0 ? { ...s, sub: 0 } : s);
// The Sitrus Berry's trigger: `getHpRatio` rounds to a whole percent (game-code.md §3).
const belowHalf = (hp, max) => Math.round((hp / max) * 100) / 100 < 0.5;
const seOf = h => ((h?.e ?? 1) >= 2 ? 1 : 0);
// Shell Bell's heal on `dealt`, what a move took off its targets, before its holder's max HP caps it; 0 for none
// (game-code.md §8).
// @only 30-planner: shellBellHeal
export const shellBellHeal = (bell, dealt) => (bell?.stacks > 0 && dealt > 0 ? Math.floor(Math.max(1, Math.floor(dealt * bell.stacks / 8)) * (bell.charm ?? 1)) : 0);
// Landing's down rule: with `whole`, a side is down below 1 HP (#527), else at 0 or less.
const stands = (hp, whole) => (whole ? hp >= 1 : hp > 0);
// A boss's bar once damage that passes its bars leaves it on `hp`, never above `bar` (game-code.md §3).
const barAfter = (f, bar, hp) => (f.boss ? Math.max(0, Math.min(bar, Math.ceil(Math.max(0, hp) / f.segSize) - 1)) : bar);
// The user's cost `d` off HP `hp` at bar `bar`, with no luck: through its bars, or with `past` beyond them, its bar then
// following its HP (game-code.md §3, §8). Returns [hp, bar].
const paid = (uf, hp, bar, d, past) => {
  if (!(d > 0)) return [hp, bar];
  if (!past) {
    const [dd, after] = barStep(uf, hp, bar, d);
    return [Math.max(0, hp - dd), after];
  }
  const left = Math.max(0, hp - (uf.finalBoss && bar < 1 ? Math.min(d, hp - 1) : d));
  return [left, barAfter(uf, bar, left)];
};
// `user` after what its use did for it, in the game's order: what the use costs it, its recoil on `dealt` and what the
// target's Substitute lost, then the chip of each of the `reached` strikes past that Substitute, then a landed use's own
// cost; then the berries it stole, its drain on `dealt`, and its Shell Bell on `dealt` and the Substitute's loss, which
// asks for its HP below full once the costs are paid and before either heal has run (game-code.md §3, §8, §18). A user
// down gets nothing, and a negative drain (Liquid Ooze) lands through its bars with no luck (§21). Gotcha: a use of
// several strikes pays every strike's cost ahead of its first heal, where the game heals each strike's drain and berry
// before the next strike's chip (§3, §18).
const repaid = (user, hit, whole, stolen, dealt, subDealt, reached) => {
  const uf = user.facts ?? NO_FACTS, max = uf.maxHp ?? Infinity;
  if (!stands(user.hp, whole)) return user;
  let hp = user.hp, bar = user.bar;
  const cost = hit.userCost;
  if (cost) {
    if (cost.recoil > 0 && dealt + subDealt > 0) [hp, bar] = paid(uf, hp, bar, Math.max(1, Math.floor((dealt + subDealt) * cost.recoil)), true);
    for (let k = 0; k < reached && cost.strike > 0; k++) [hp, bar] = paid(uf, hp, bar, cost.strike, false);
    [hp, bar] = paid(uf, hp, bar, cost.landed, true);
    if (!stands(hp, whole)) return stateOf(uf, hp, bar, user);
  }
  const room = hp < max;
  if (stolen > 0) hp = Math.min(max, hp + stolen);
  const drain = dealt > 0 && Number.isFinite(hit.drain) ? dealt * hit.drain : 0;
  if (drain > 0) hp = Math.min(max, hp + drain);
  else if (drain < 0) {
    const [d, after] = barStep(uf, hp, bar, -drain);
    hp = Math.max(0, hp - d);
    bar = after;
  }
  const bell = room && stands(hp, whole) ? shellBellHeal(uf.shellBell, dealt + subDealt) : 0;
  if (bell > 0) hp = Math.min(max, hp + bell);
  return hp === user.hp && bar === user.bar ? user : stateOf(uf, hp, bar, user);
};
// `user` after a use that missed its standing target: its crash, through its bars (game-code.md §8). Gotcha: Steel
// Beam's half on a miss passes them in the game.
const missedBy = (user, hit, whole) => {
  const d = hit.userCost?.missed;
  if (!(d > 0) || !stands(user.hp, whole)) return user;
  const [hp, bar] = paid(user.facts ?? NO_FACTS, user.hp, user.bar, d, false);
  return stateOf(user.facts ?? NO_FACTS, hp, bar, user);
};
// A carrier is a Landing state's fields, without `facts`, at its chance `p`, with `stop`, `dealt`, `subDealt`, `hits`,
// and `subHits`, the hits its Substitute took.
const fork = (b, hp, bar, p, taken, tok = b.tok) => ({ ...b, hp, bar, tok, p, dealt: b.dealt + taken, hits: b.hits + 1 });
const stand = (b, hp, bar, endure, taken, out) => {
  if (endure) out.push(fork(b, hp, bar, b.p * endure, taken, true));
  if (endure < 1) out.push(fork(b, hp, bar, b.p * (1 - endure), taken));
};
// The hit an intact Disguise or Ice Face takes, and its bust's chip (game-code.md §8). Returns the share that goes
// down, as `strike` does.
const bust = (f, b, whole, out, down) => {
  const left = b.hp - (f.disguise.chip || 0);
  const bar = barAfter(f, b.bar, left);
  const c = Object.assign(fork(b, left, bar, b.p, 0), { busted: true });
  if (stands(left, whole)) { out.push(c); return 0; }
  if (f.revive && !b.revived) {
    out.push(Object.assign(c, { hp: f.revive, revived: true, stop: true }));
    return 0;
  }
  const hp = Math.max(0, left);
  down?.(b.p, { ...b, hp, busted: true }, hp, bar);
  return b.p;
};
// Multiscale and Shadow Shield (game-code.md §1, §8). Gotcha: a `cut` "in" hit is doubled back below full HP, which
// can come out 1 HP short of the game's, its halving having been floored (§2).
const cutOn = (f, hp, d, hit) => {
  if (hit.cut === "never" || (!f.shadowShield && hit.ignoresAbility)) return d;
  const full = hp >= f.maxHp;
  if (hit.cut === "in") return full ? d : d * 2;
  return full ? d * 0.5 : d;
};
// One hit of `d` on carrier `b`, in the game's order (game-code.md §3, §8). Pushes what stands onto `out`, a revive
// among it with `stop` set, and returns the share that goes down, handing it to `down(p, b, hp, bar)` with the HP the
// hit left. `luck` false: turn-end chip, which nothing survives on luck, no cut halves and no Substitute meets
// (§21). `whole`: as `stands`. A Substitute takes the hit as cut, whole, ahead of a Disguise, the bars and the luck,
// and its loss is `subDealt` (§8).
const strike = (f, b, d, hit, whole, luck, out, down = null) => {
  const shielded = luck && b.sub > 0 && d > 0 && !hit.ignoresSub;
  if (luck && !shielded && f.disguise && !b.busted && !hit.ignoresDisguise && d > 0) return bust(f, b, whole, out, down);
  if (luck && (f.multiscale || f.shadowShield)) d = cutOn(f, b.hp, d, hit);
  if (shielded) {
    out.push({ ...b, sub: Math.max(0, b.sub - d), subDealt: b.subDealt + Math.min(b.sub, d), hits: b.hits + 1, subHits: b.subHits + 1 });
    return 0;
  }
  const [dealt, bar] = barStep(f, b.hp, b.bar, Math.max(0, d), !!hit.ohko);
  const left = b.hp - dealt;
  // The token rolls on the damage before the bar clamps it, and a roll on a hit the clamp or Sturdy already stops
  // still spends it (game-code.md §3).
  const endure = luck && !b.tok && !stands(b.hp - d, whole) ? f.pEndure || 0 : 0;
  if (stands(left, whole)) { stand(b, left, bar, endure, dealt, out); return 0; }
  if (luck && f.sturdy && !hit.ignoresSturdy && b.hp >= f.maxHp) { stand(b, 1, bar, endure, b.hp - 1, out); return 0; }
  const focus = luck ? f.pFocus || 0 : 0;
  if (endure) out.push(fork(b, 1, bar, b.p * endure, b.hp - 1, true));
  if (focus) {
    const q = b.p * (1 - endure) * focus;
    if (q > 0) out.push(fork(b, 1, bar, q, b.hp - 1));
  }
  const gone = luck ? b.p * (1 - endure) * (1 - focus) : b.p;
  if (!(gone > 0)) return 0;
  const hp = Math.max(0, left);
  if (luck && f.revive && !b.revived) {
    const c = fork(b, f.revive, bar, gone, b.hp - hp);
    c.revived = true;
    c.stop = true;
    out.push(c);
    return 0;
  }
  down?.(gone, b, hp, bar);
  return gone;
};
// Marks `fed` the share `se` of carrier `b` that a super-effective hit landed on, where it holds an Enigma Berry; the
// rest goes onto `out` first, unmarked (game-code.md §3).
const feed = (b, se, out) => {
  if (se > 0 && b.enigmas > 0) {
    const q = Math.min(1, se);
    if (q < 1) out.push({ ...b, p: b.p * (1 - q) });
    b.p *= q;
    b.fed = true;
  }
  out.push(b);
};
// A steal off carrier `b`, onto `out`: a carrier for each berry type it holds, at an even share of its chance, with one
// berry off that type, and `b` itself where it holds none (game-code.md §3). `heals[type]`, where given, is what that
// berry heals the thief, added to `stolen`.
const pluck = (f, b, heals, out) => {
  const others = b.others ?? NO_OTHERS;
  let n = (b.sitrus > 0) + (b.enigmas > 0);
  for (const k of others) if (k > 0) n++;
  if (!n) { out.push(b); return; }
  const p = b.p / n;
  const took = (c, type) => {
    c.p = p;
    if (heals) c.stolen = (b.stolen || 0) + (heals[type] || 0);
    out.push(c);
  };
  if (b.sitrus > 0) took({ ...b, sitrus: b.sitrus - 1 }, BerryType.SITRUS);
  if (b.enigmas > 0) took({ ...b, enigmas: b.enigmas - 1 }, BerryType.ENIGMA);
  others.forEach((k, i) => {
    if (k > 0) took({ ...b, others: others.map((x, j) => (j === i ? x - 1 : x)) }, f.others?.[i]?.type);
  });
};
// Carrier `b` after the signed change `d`, onto `out`: a heal caps at max HP and leaves the bar, and chip lands through
// the bars with no luck, handing what it fells to `down` (game-code.md §3, §21).
const shift = (f, b, d, whole, out, down) => {
  if (d < 0) {
    strike(f, b, -d, NO_HIT, whole, false, out, down);
    return;
  }
  if (d > 0) b.hp = Math.min(f.maxHp ?? Infinity, b.hp + d);
  out.push(b);
};
// One turn end on carrier `b`, onto `out` with its mark cleared: the signed change `before`, then the berries, both
// reading the HP from before either heals, then the rest of `total` (game-code.md §3, §21). `sit` / `enigma`: the
// Sitrus and Enigma Berry facts it may eat, null for none. `between(b, out)`: a step of the caller's ahead of the
// berries. Gotcha: with nothing it could eat, `total` lands as one change.
const endTurn = (f, b, before, total, sit, enigma, whole, out, down = null, between = null) => {
  const eatsE = !!enigma && b.fed && b.enigmas > 0;
  b.fed = false;
  if (!eatsE && !(sit && b.sitrus > 0)) {
    shift(f, b, total, whole, out, down);
    return;
  }
  const mid = [], standing = [];
  shift(f, b, before, whole, mid, down);
  for (const c of mid) if (between) between(c, standing); else standing.push(c);
  const keepE = eatsE && enigma.keep > 0 ? enigma.keep : 0, keepS = sit?.keep > 0 ? sit.keep : 0;
  for (const r of standing) {
    const eatsS = !!sit && r.sitrus > 0 && belowHalf(r.hp, f.maxHp);
    const heal = (eatsE ? enigma.heal : 0) + (eatsS ? sit.heal : 0);
    const ate = keepE ? [{ ...r, p: r.p * keepE }, r] : [r];
    if (eatsE) {
      if (keepE) r.p *= 1 - keepE;
      r.enigmas--;
    }
    for (const e of ate) {
      const kept = [e];
      if (eatsS) {
        if (keepS) {
          kept.push({ ...e, p: e.p * keepS });
          e.p *= 1 - keepS;
        }
        e.sitrus--;
      }
      for (const o of kept) {
        o.hp = Math.min(f.maxHp ?? Infinity, o.hp + heal);
        shift(f, o, total - before, whole, out, down);
      }
    }
  }
};
// One use point, `n` hits of `d / n` at `fac(bar)` each, landed on `b` up to a faint or a revive (game-code.md §2):
// what stands, in a fixed order. A stealing hit steals on each strike that reaches past a Substitute (§3).
const landUse = (f, b, d, n, fac, hit, whole, down) => {
  const heals = hit.steals && typeof hit.steals === "object" ? hit.steals : null;
  let live = [b];
  for (let k = 0; k < n; k++) {
    const next = [];
    for (const x of live) {
      if (x.stop) next.push(x);
      else if (!hit.steals) strike(f, x, d / n * (fac ? fac(x.bar) : 1), hit, whole, true, next, down);
      else {
        const struck = [];
        strike(f, x, d / n * (fac ? fac(x.bar) : 1), hit, whole, true, struck, down);
        for (const c of struck) if (c.subDealt > x.subDealt) next.push(c); else pluck(f, c, heals, next);
      }
    }
    live = next;
  }
  return live;
};
// Contract: every hit record sets each race fact, `null` allowed, so none is left off (#995). `raceFacts(o)` sets
// them off `o`, a flag false and any other null where `o` has none.
const RACE_FLAGS = ["ignoresSturdy", "ignoresSub", "ignoresAbility", "ignoresDisguise"];
// @only 35-team-plan, tests: RACE_FACTS, raceFacts
export const RACE_FACTS = [...RACE_FLAGS, "cut", "cat", "e", "steals", "userCost"];
export const raceFacts = o => {
  const x = {};
  for (const k of RACE_FACTS) x[k] = RACE_FLAGS.includes(k) ? !!o?.[k] : o?.[k] ?? null;
  return x;
};
// `use`: one point of a use's spread, `{ d, n, se }`, `d` the whole use before the target's HP or bars cut it, and `se`
// its super-effective share. `hit`: the hit record, each field read by name and an absent one off, its `e` standing in
// for a missing `se`; `cut` is "in" where its numbers already hold a full-HP holder's Multiscale or Shadow Shield, and
// "never" where nothing halves it. `steals`: a Bug Bite's or Pluck's, each strike that reaches the target takes one of its
// berries, a knockout's included (game-code.md §3); `drain`, the signed share of `dealt` its user wins back; `userCost`,
// what the use costs its user, null for nothing: `recoil`, its share of what the use dealt; `strike`, the HP each strike
// that reaches the target costs it (Rough Skin, Iron Barbs); `landed`, what a use that lands costs it beside those
// (Chloroblast, Steel Beam); `missed`, what a miss costs it (a crash), each absent one 0 (game-code.md §8). Each
// outcome's `dealt` is what the use took off its target through the bars, counted before a revive and without a bust's
// chip, `subDealt` what it took off the target's Substitute, and `hits` the hits that landed, on either. What stands
// having taken damage on a super-effective share is marked for an Enigma Berry it holds. `user`: the attacker's Landing
// state, where `steals` holds the heal each berry type gives it; each outcome's `user` is it after what the use cost it,
// then the berries it stole, its drain and its Shell Bell, all only while it stands (game-code.md §3, §8, §18).
// Gotcha: a hit a Substitute takes drains 0 here, where the game heals at least 1 off the user's last hit (§8).
// @only 35-team-plan, tests: land, landTurnEnd, luckKey, landingKey
export const land = (state, use, hit = NO_HIT, { whole = false, user = null } = {}) => {
  const d = use?.d, h = hit ?? NO_HIT, f = state?.facts ?? NO_FACTS;
  const up = stands(state?.hp, whole);
  if (!up || !(d > 0) || !Number.isFinite(d)) {
    return [user ? { state, user: up ? missedBy(user, h, whole) : user, p: 1, dealt: 0, subDealt: 0, hits: 0 } : { state, p: 1, dealt: 0, subDealt: 0, hits: 0 }];
  }
  // Gotcha: `plain` repeats `strike`'s and `landUse`'s arithmetic for one hit; a rule either gains joins `plain`'s
  // guard, or a plain hit skips it.
  const plain = !user && !h.steals && !(state.sub > 0) && !(f.disguise && !state.busted) && !f.multiscale && !f.shadowShield
    && !(f.enigma?.heal > 0) && Math.max(1, Math.round(use.n ?? 1)) === 1;
  if (plain) {
    const hp = state.hp, dd = d * (h.factor ? h.factor(state.bar) : 1);
    const [dealt, bar] = barStep(f, hp, state.bar, Math.max(0, dd), !!h.ohko);
    const left = hp - dealt;
    const endure = !state.tok && !stands(hp - dd, whole) ? f.pEndure || 0 : 0;
    if (!endure && stands(left, whole)) return [{ state: stateOf(f, left, bar, state), p: 1, dealt, subDealt: 0, hits: 1 }];
    if (!endure && !f.pFocus && !(f.sturdy && !h.ignoresSturdy && hp >= f.maxHp) && !(f.revive && !state.revived)) {
      const to = Math.max(0, left);
      return [{ state: stateOf(f, to, bar, state), p: 1, dealt: hp - to, subDealt: 0, hits: 1 }];
    }
  }
  const heals = h.steals && typeof h.steals === "object" ? h.steals : null;
  // Outcome `o` off carrier `c`, with its user after the berries `c` stole and the `reached` strikes past the Substitute.
  const outcome = (o, c, reached) => {
    if (user) o.user = repaid(user, h, whole, c.stolen || 0, o.dealt, o.subDealt, reached);
    return o;
  };
  const downs = [];
  const downed = (p, b, hp, bar) => {
    downs.push(outcome({ state: stateOf(f, hp, bar, b), p, dealt: b.dealt + (b.hp - hp), subDealt: b.subDealt, hits: b.hits + 1 }, b, b.hits + 1 - b.subHits));
  };
  const stood = landUse(f, { ...state, p: 1, stop: false, dealt: 0, subDealt: 0, hits: 0, subHits: 0 }, d, Math.max(1, Math.round(use.n ?? 1)), h.factor ?? null, h, whole,
    h.steals ? (p, b, hp, bar) => {
      const taken = [];
      pluck(f, { ...b, p }, heals, taken);
      for (const c of taken) downed(c.p, c, hp, bar);
    } : downed);
  const se = f.enigma?.heal > 0 ? use.se ?? seOf(h) : 0;
  let fed = stood;
  if (se > 0) {
    fed = [];
    for (const c of stood) feed(c, c.dealt > 0 ? se : 0, fed);
  }
  const outs = [];
  for (const c of fed) outs.push(outcome({ state: stateOf(f, c.hp, c.bar, c), p: c.p, dealt: c.dealt, subDealt: c.subDealt, hits: c.hits }, c, c.hits - c.subHits));
  for (const o of downs) outs.push(o);
  return outs;
};
const num = x => (Number.isFinite(x) ? x : 0);
// One turn's end on `state`, after its last `land` of the turn (game-code.md §3, §21). `before` / `after`: the signed
// change ahead of the berries and after them. Between them it eats its Sitrus Berry below half HP, one a turn, and its
// Enigma Berry after a super-effective hit landed this turn, unless `eats` is false (an opposing Unnerve); a Berry Pouch
// keeps each berry it eats on an outcome of its own. Chip lands through the bars with no luck. `whole` is `land`'s. A
// state already down comes back as it was.
export const landTurnEnd = (state, { before = 0, after = 0, eats = true, whole = false } = {}) => {
  const f = state?.facts ?? NO_FACTS;
  if (!stands(state?.hp, whole)) return [{ state, p: 1 }];
  const pre = num(before), total = pre + num(after);
  const ate = x => (eats && x?.heal > 0 ? x : null);
  const sit = ate(f.sitrus), enigma = ate(f.enigma);
  if (!total && !state.fed && !(sit && state.sitrus > 0)) return [{ state, p: 1 }];
  const outs = [], downs = [];
  endTurn(f, { ...state, p: 1, stop: false, dealt: 0, subDealt: 0, hits: 0 }, pre, total, sit, enigma, whole, outs,
    (p, c, hp, bar) => downs.push({ state: stateOf(f, hp, bar, c), p }));
  const res = outs.map(c => ({ state: stateOf(f, c.hp, c.bar, c), p: c.p }));
  for (const d of downs) res.push(d);
  return res;
};
// Gotcha: a rule `strike` gains that acts only at full HP joins this list, or a merge averages it away.
const hasFullHpRule = f => !!(f?.sturdy || f?.multiscale || f?.shadowShield);
export const luckKey = (s, f = s.facts) => `${+s.revived}${+s.tok}${hasFullHpRule(f) ? +(s.hp >= f.maxHp) : ""}${f?.disguise ? +s.busted : ""}${s.sub > 0 ? "S" : ""}`;
// `sub` stands in for the state's own Substitute HP.
const keyWith = (s, f, sub) => {
  let k = `${luckKey(s, f)}|${s.bar}`;
  for (const x of REST) k += `|${x === "sub" ? sub : s[x]}`;
  return s.others?.length ? `${k}|${s.others.join()}` : k;
};
export const landingKey = (s, f = s.facts) => keyWith(s, f, s.sub);
// Contract: true only where `landingKey(a) === landingKey(b)`, and false wherever their facts or a field of their
// discrete part differ, so a false still has to ask `landingKey`.
// @only 35-team-plan, tests: sameLanding
export const sameLanding = (a, b) => {
  if (a === b) return true;
  const f = a.facts;
  if (f !== b.facts || a.bar !== b.bar || a.revived !== b.revived || a.tok !== b.tok || a.busted !== b.busted || a.sub !== b.sub
    || a.sitrus !== b.sitrus || a.enigmas !== b.enigmas || a.fed !== b.fed) return false;
  if (hasFullHpRule(f) && (a.hp >= f.maxHp) !== (b.hp >= f.maxHp)) return false;
  const x = a.others?.length ? a.others : NO_OTHERS, y = b.others?.length ? b.others : NO_OTHERS;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};
// `perHit[k]`: Map damage → p for hit k; `dist`: [{ n, p }] hit counts; `checkAll`: every hit rolls, else only the
// first. A miss or a faint ends the move (game-code.md §2). No revive: a seed holder's `pKo` of 0 prices its seed.
const resolve = (f, perHit, dist, acc, checkAll, hit = NO_HIT) => {
  const rf = { ...f, revive: 0 };
  const add = (m, st, p) => {
    if (!(p > 0)) return;
    const k = `${st.hp}|${landingKey(st, rf)}`;
    const e = m.get(k);
    if (e) e.p += p; else m.set(k, { ...st, p });
  };
  const atLeast = n => dist.filter(x => x.n >= n).reduce((t, x) => t + x.p, 0);
  const done = new Map();
  let live = new Map();
  add(live, { ...stateOf(rf, f.hp, f.idx), stop: false, dealt: 0, subDealt: 0, hits: 0 }, 1);
  const hitsMax = Math.max(...dist.map(x => x.n));
  for (let k = 0; k < hitsMax && live.size; k++) {
    const go = (k ? atLeast(k + 1) / atLeast(k) : atLeast(1)) * (k === 0 || checkAll ? acc : 1);
    const next = new Map();
    for (const st of live.values()) {
      if (st.hp <= 0) { add(done, st, st.p); continue; }
      add(done, st, st.p * (1 - go));
      for (const [d, p] of perHit[Math.min(k, perHit.length - 1)]) {
        const out = [];
        let fell = null;
        strike(rf, { ...st, p: st.p * go * p }, d, hit, false, true, out, (q, b, hp, bar) => { fell = { ...b, hp, bar, p: q }; });
        for (const ns of out) add(next, ns, ns.p);
        if (fell) add(next, fell, fell.p);
      }
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
const berryPouch = (env, p) => Math.min(10, 3 * sideModifiers(env, p, "PreserveBerryModifier")
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

// A KO-curve branch: a carrier, its discrete part `from`'s.
const branch = (hp, bar, from, p) => {
  const b = { hp, bar, p, stop: false, dealt: 0, subDealt: 0, hits: 0, subHits: 0 };
  for (const k of DISCRETE) b[k] = from[k];
  return b;
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
// `by[n − 1]`: P(the target is down by the end of use n). `rec` is `turn.mon(target)`, which carries no race
// facts; `hit` is the hit record that does (`land`'s, then `cat` and `e`, an absent one off), and its use is
// `useOf`'s, a bare use array reading as `{ use }`. `scale(i, broken)`: the damage factor on use i (0-based)
// with `broken` bars gone; `act(i)`: the chance use i happens at all. `turnEnd`: the signed HP change after
// each use survived, or a function of the use count. `guard` false: a wild boss's defence never rises as its
// bars break, which it otherwise does at the `cat` ("physical" or "special") of use 2's hit. `firstKo`: this
// turn's exact odds for use 1, when the caller has them. `useAt(i)`: the hit of use i (from 1) where it
// differs from `hit`, taking each race fact it lacks from `hit`. `start`: branches from an earlier turn, p
// summing to 1. `chain`: a Markov chain stepped once a use, `{ from, step }`: `from` its states
// `[{ s, p }]`, p summing to 1, and `step(s)` its transitions `[{ s, p, act }]`, p summing to 1, the use going off only on
// an `act` one; a state `s` is an object keyed by `s.key`. `after1`: the branches standing after use 1, p summing to
// 1, each with its HP, bar and discrete part. `perChunk`: the uses each bar takes before it more likely than not breaks.
// `downAt[n − 1]`: the chain's states `[{ s, p }]` of what went down on use n, empty without a `chain`. Each use's turn
// end is Landing's, `beforeBerry` the part of `turnEnd` ahead of the berries. Unless `feeds` is false, the target eats
// its Enigma Berry (`facts.enigma`) there after a landed use, at its super-effective share: a point's own `se`, else its
// hit's `e`. `preHeal(i)`: `{ p, heal }`, a heal the target takes before use i at share `p` of it, and after it, ahead of
// the turn end, otherwise; null for none. `sitrus`: the target eats its Sitrus Berry (`facts.sitrus`) there too; null eats
// none, and otherwise it counts the Sitrus Berries item thieves have taken off the target by use n's turn end, n from 1: a
// number, or a function of n. A berry taken before the curve is one its `start` branches no longer hold.
export const koCurve = (rec, hit, { hp, bar = null, start = null, scale = () => 1, act = () => 1, turnEnd = 0, beforeBerry = 0, firstKo = null, useAt = null, chain = null, preHeal = null, sitrus = null, feeds = true, guard = true } = {}) => {
  const f = rec.facts;
  const own = Array.isArray(hit) ? { use: hit } : hit ?? {};
  const hitOf = later => (later && !Array.isArray(later) ? { ...own, ...later } : own);
  const berry = feeds && f.enigma?.heal > 0 ? f.enigma : null;
  const sit = sitrus != null && f.sitrus?.heal > 0 ? f.sitrus : null;
  const sitHeld = f.sitrus?.left ?? 0;
  const goneBy = n => (n < 1 ? 0 : typeof sitrus === "function" ? sitrus(n) : sitrus ?? 0);
  // The share of the Sitrus Berries still unstolen after use n that use n + 1's item thieves take.
  const stealRate = n => {
    const room = sitHeld - goneBy(n);
    return sit && room > 1e-12 ? Math.max(0, Math.min(1, (goneBy(n + 1) - goneBy(n)) / room)) : 0;
  };
  // Takes `rate` of `b`'s Sitrus Berries, a fraction of one at that chance, changing `b` in place; what stands goes onto
  // `out`. Gotcha: the take scales with `b`'s own count, but an item thief draws an item, whatever its stack
  // (game-code.md §8), so a stack eaten down from two loses its last at about half the game's rate.
  const steal = (b, rate, out) => {
    const x = b.sitrus * rate;
    if (!(x > 0)) { out.push(b); return; }
    const sure = Math.floor(x), q = x - sure;
    if (q > 0) out.push({ ...b, p: b.p * q, sitrus: b.sitrus - sure - 1 });
    b.p *= 1 - q;
    b.sitrus -= sure;
    out.push(b);
  };
  const init = stateOf(f, hp ?? f.hp, bar);
  const bars = init.bar + 1;
  const cat = guard && bars > 1 && rec.bars ? hitOf(useAt ? useAt(1) : null).cat : null;
  const rises = cat ? rec.bars(cat === "special" ? Stat.SPDEF : Stat.DEF, bars) : null;
  const pointsOf = h => (Array.isArray(h) ? h : useOf(h)).map(x => ({ d: x.d, p: x.p, n: x.d > 0 ? Math.max(1, Math.round(x.n ?? 1)) : 0, se: x.se }));
  const first = pointsOf(hit);
  const from = chain?.from ?? NO_CHAIN;
  const stepOf = chain ? chain.step : () => NO_STEP;
  const reopen = x => {
    const s = stateOf(f, x.hp, x.bar ?? init.bar, x);
    return branch(s.hp, s.bar, s, x.p);
  };
  let states = (start?.length ? start.map(reopen) : [branch(init.hp, init.bar, init, 1)])
    .flatMap(b => from.map(c => inChain(branch(b.hp, b.bar, b, b.p * c.p), c.s)));
  const by = [], downAt = [];
  const brokeAt = Array(bars).fill(KO_USES);
  let down = 0, after1 = [];
  for (let i = 0; i < KO_USES; i++) {
    const later = i && useAt ? useAt(i) : null;
    const points = later ? pointsOf(later) : first;
    const useHit = hitOf(later);
    const a = Math.max(0, Math.min(1, act(i)));
    const factors = [];
    const factor = broken => (factors[broken] ??= scale(i, broken) * (rises ? rises[Math.min(broken, bars - 1)] : 1));
    const atBar = b => factor(init.bar - b);
    const struck = [];
    let fell = 0, fellTo = chain ? new Map() : null, onto = null;
    const fallen = gone => {
      fell += gone;
      if (fellTo) addShare(fellTo, onto, gone);
    };
    const wentOff = i === 0 ? new Map() : null;
    const pre = preHeal?.(i);
    const early = pre?.heal > 0 ? Math.max(0, Math.min(1, pre.p)) : 0;
    // `late`: this branch takes `pre`'s heal at the turn end.
    const split = pre?.heal > 0 ? states.flatMap(st => [
      ...(early > 0 ? [inChain(branch(Math.min(f.maxHp, st.hp + pre.heal), st.bar, st, st.p * early), st.s)] : []),
      ...(early < 1 ? [Object.assign(inChain(branch(st.hp, st.bar, st, st.p * (1 - early)), st.s), { late: true })] : []),
    ]) : states;
    for (const st of split) {
      const mark = struck.length;
      for (const to of stepOf(st.s)) {
        const go = to.act ? a : 0, p = st.p * to.p;
        if (go < 1) struck.push(inChain(branch(st.hp, st.bar, st, p * (1 - go)), to.s));
        if (wentOff && go > 0) addShare(wentOff, to.s, p * go);
        onto = to.s;
        for (const x of points) {
          const q = p * go * x.p;
          if (!(q > 0)) continue;
          const branches = landUse(f, branch(st.hp, st.bar, st, q), x.d, x.n, atBar, useHit, false, fallen);
          const fed = berry && x.d > 0 ? x.se ?? seOf(useHit) : 0;
          for (const b of branches) {
            b.stop = false;
            feed(inChain(b, to.s), b.dealt > 0 ? fed : 0, struck);
          }
        }
      }
      if (st.late) for (let k = mark; k < struck.length; k++) struck[k].late = true;
    }
    if (i === 0 && firstKo != null && !start) {
      const standing = struck.reduce((t, x) => t + x.p, 0);
      const k = Math.min(1, firstKo);
      const offs = shares([...wentOff.values()], from);
      if (standing > 0) for (const x of struck) x.p *= (1 - k) / standing;
      else if (k < 1) {
        // They survived a use that landed.
        const landed = points.filter(x => x.d > 0), mass = landed.reduce((t, x) => t + x.p, 0);
        const fed = berry && mass > 0 ? landed.reduce((t, x) => t + x.p * (x.se ?? seOf(own)), 0) / mass : 0;
        for (const c of offs) {
          const left = [], lone = branch(1, init.bar, init, (1 - k) * c.p);
          if (own.steals) pluck(f, lone, null, left); else left.push(lone);
          for (const b of left) feed(inChain(b, c.s), fed, struck);
        }
      }
      fell = k;
      if (fellTo) fellTo = new Map(offs.map(c => [c.s?.key, { s: c.s, p: k * c.p }]));
    }
    down += fell;
    const h = typeof turnEnd === "function" ? turnEnd(i + 1) : turnEnd;
    const h0 = typeof beforeBerry === "function" ? beforeBerry(i + 1) : beforeBerry;
    const chipped = (gone, b) => {
      down += gone;
      if (fellTo) addShare(fellTo, b.s, gone);
    };
    const stolen = stealRate(i);
    const robs = (b, out) => steal(b, stolen, out);
    const ended = [];
    for (const b of struck) {
      if (b.late) b.hp = Math.min(f.maxHp, b.hp + pre.heal);
      endTurn(f, b, h0, h, sit, berry, false, ended, chipped, robs);
    }
    const groups = new Map();
    // A standing Substitute's HP is squeezed in place of its owner's, at the owner's exact HP: keyed exactly, a curve
    // of weak rolled hits into one ran for seconds (#1033).
    for (const b of ended) {
      const shield = b.sub > 0;
      const key = `${shield ? keyWith(b, f, `S${b.hp}`) : landingKey(b, f)}${chain ? `|${b.s.key}` : ""}`;
      if (!groups.has(key)) groups.set(key, { b, pts: [] });
      groups.get(key).pts.push({ d: shield ? b.sub : b.hp, p: b.p });
    }
    states = [...groups.values()].flatMap(({ b, pts }) => squeezeDist(pts, KO_LEVELS).filter(x => x.p > 1e-9).map(x => {
      const c = inChain(branch(b.sub > 0 ? b.hp : x.d, b.bar, b, x.p), b.s);
      if (b.sub > 0) c.sub = x.d;
      return c;
    }));
    downAt.push(fellTo ? [...fellTo.values()].filter(x => x.p > 0) : []);
    if (i === 0) {
      const p = states.reduce((t, x) => t + x.p, 0);
      after1 = p > 0 ? states.map(x => {
        const e = { hp: x.hp, bar: x.bar };
        for (const k of DISCRETE) e[k] = x[k];
        e.p = x.p / p;
        return e;
      }) : [];
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
// `p`'s Shell Bell stacks, with its side's Healing Charm, which scales the heal; null for none or under Heal Block
// (game-code.md §8, §18).
const shellBellOf = (env, p) => {
  const stacks = stack(p, "HitHealModifier");
  return stacks > 0 && !p.getTag?.("HEAL_BLOCK") ? { stacks, charm: healingCharm(env, p) } : null;
};
const sitrusOf = (env, p) => quarterBerryOf(env, p, BerryType.SITRUS);
// The berries `p` holds that its `sitrus` and `enigma` facts don't count, a stack a type as `[{ type, left }]`, null for
// none: a steal draws over them too (game-code.md §3).
const othersOf = (p, sitrus, enigma) => {
  const out = items(p).filter(m => m.constructor.name === "BerryModifier" && !(m.berryType === BerryType.SITRUS && sitrus) && !(m.berryType === BerryType.ENIGMA && enigma))
    .map(m => ({ type: m.berryType, left: m.getStackCount?.() ?? m.stackCount ?? 1 }));
  return out.length ? out : null;
};
// In the game's own phase order (game-code.md §21).
const endOfTurnSteps = (env, p, { hp = p.hp, sitrus = true } = {}) => {
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
// Signed, with no boss bars in the way, and no Enigma Berry: that is Landing's turn end's, as is the Sitrus under
// `sitrus` false, and no Shell Bell, which is Landing's use's (game-code.md §8). `hp`: the HP it will have by then;
// `beforeBerries`: only the part ahead of the BerryPhase. Reads fields and item and ability attributes only.
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
  const ohko = first.result === HitResult.ONE_HIT_KO;
  const fixed = !ohko && attrs(move, "FixedDamageAttr").length > 0;
  const ignoresSturdy = ignoreAbility || (fixed && fixedIgnoresSturdy(env));
  const ignoresSub = pastSub(atk, move);
  // Disguise and Ice Face (game-code.md §8).
  const ignoresDisguise = ignoreAbility || fixed || ohko || !meetsBlock(def, atk, move);
  const facts = targetFacts(env, def, ignoreAbility);
  // (game-code.md §1, §2)
  const cut = fixed || ohko ? "never" : !gameIgnore && facts.hp >= facts.maxHp && (facts.multiscale || facts.shadowShield) ? "in" : null;
  const base = { name: pm.getName(), type, cat, e, priority, spread, spreadApplied, traits: t, self: 0, userCost: null, bypassProtect: bypassesProtect(atk, def, move), ignoresAbility: ignoreAbility, ignoresDisguise, cut,
    steals: stealsOff(t, def, ignoreAbility) };
  const blocked = cancelledBy(env, atk, def, move);
  if (first.cancelled || first.result === HitResult.NO_EFFECT || first.result === HitResult.IMMUNE || blocked) {
    return { ...base, acc: 0, crit: 0, dist, perHit: [{ max: 0, min: 0 }], targetHp: def.hp, expected: 0, uncapped: 0, max: 0, pKo: 0, revive: 0, costs: [], notes: [blocked ? `stopped by ${blocked}` : "no effect"], use: [{ d: 0, p: 1, n: 0 }], focus: 0, ignoresSturdy, ignoresSub, flinch: 0 };
  }

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
  const use = useDist(perHit, dist, acc, checkAll);

  const f = ignoresSturdy && facts.sturdy ? { ...facts, sturdy: false } : facts;
  // The simulated call ignores Disguise and Ice Face, which Landing applies (game-code.md §1).
  const strikes = { ignoresSturdy, ignoresSub, ohko, ignoresAbility: ignoreAbility, ignoresDisguise, cut };
  // What the use deals is priced past a Substitute, as `use` is; `pKo` is not (game-code.md §8).
  const shielded = facts.sub > 0 && !ignoresSub;
  const bare = shielded ? { ...facts, sub: 0 } : facts;
  const ends = resolve(bare, perHit, dist, acc, checkAll, strikes);
  const expected = f.hp - ends.reduce((t, x) => t + x.p * Math.max(0, x.hp), 0);
  const kos = shielded ? resolve(facts, perHit, dist, acc, checkAll, strikes) : ends;
  const pKo = f.revive ? 0 : kos.filter(x => x.hp <= 0).reduce((t, x) => t + x.p, 0);
  // Expected damage a use before the target's HP or a bar cuts it: what later turns deal.
  const uncapped = perHit.reduce((t, m, k) => t + (k === 0 || checkAll ? acc ** (k + 1) : acc)
    * dist.filter(x => x.n > k).reduce((u, x) => u + x.p, 0) * [...m].reduce((u, [d, p]) => u + d * p, 0), 0);
  const [worst] = resolve({ ...bare, pFocus: 0, pEndure: 0 }, maxes.map(d => new Map([[d, 1]])), [{ n: hitsMax, p: 1 }], 1, false, strikes);

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
  // Landing's `userCost`, what a use costs its user once it lands or misses (game-code.md §8).
  const cost = { strike: 0, recoil: 0, landed: 0, missed: 0 };
  const half = Math.max(1, Math.floor(maxHp / 2));
  if (contact && !t.guarded && maxHp && ability(def, "PostDefendContactDamageAbAttr")) {
    const [abName, ratio] = [def.getAbility?.(), def.hasPassive?.() ? def.getPassiveAbility?.() : null]
      .flatMap(a => (a?.getAttrs?.("PostDefendContactDamageAbAttr") ?? []).map(x => [a.name, x.damageRatio])).find(Boolean) ?? ["contact", 8];
    cost.strike = Math.max(1, Math.floor(maxHp / (ratio || 8)));
    const chip = cost.strike * landed;
    self += chip;
    fromTarget.push(`${abName}: ≈−${Math.round(chip / maxHp * 100)}%`);
  }
  let recoilShare = null;
  if (t.recoil && !t.recoil.blocked && maxHp) {
    const fixed = Math.max(1, Math.floor(maxHp * t.recoil.ratio));
    if (t.recoil.useHp) cost.landed += fixed;
    else cost.recoil = t.recoil.ratio;
    const hurt = t.recoil.useHp ? fixed * acc : expected * t.recoil.ratio;
    self += hurt;
    recoilShare = hurt / maxHp;
  }
  if (t.halfSac && maxHp) {
    self += half;
    cost.landed += half;
    cost.missed += half;
  }
  if (t.crash && maxHp) {
    if (acc < 1) self += half * (1 - acc);
    cost.missed += half;
  }
  const userCost = cost.strike || cost.recoil || cost.landed || cost.missed ? cost : null;
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
  if (shielded) notes.push("substitute");
  if (f.disguise && !ignoresDisguise) notes.push("disguise");
  if (crit === 1) notes.push("crit");
  if (semi) notes.push("target semi-invulnerable");
  return {
    ...base, acc, crit, dist, semi, self, userCost, selfKo, drain,
    perHit: maxes.map((max, k) => ({ max, min: Math.min(max, lows[k] ?? Math.floor(max * 0.85)) })), targetHp: f.hp,
    expected, uncapped, max: f.hp - Math.max(0, worst.hp), pKo, revive: f.revive, sub: shielded ? facts.sub : 0, costs, notes,
    use, focus: f.pFocus, ignoresSturdy, ignoresSub, flinch: flinchChance(atk, def, move, ignoreAbility),
  };
};

// By ability name and move flag, never `ignoresAbilities`: a combatant can't answer the game's call, and here it would
// run unsandboxed (#995).
const approxIgnoresAbilities = (atk, mv) => hasMoldBreaker(atk) || hasFlag(mv, MoveFlags.IGNORE_ABILITIES);
// A hit that gets past a Substitute: a sound move, one that ignores it, or an Infiltrator's (game-code.md §8).
// @mirrors sub-bypass
const pastSub = (atk, mv) => hasFlag(mv, MoveFlags.SOUND_BASED) || hasFlag(mv, MoveFlags.IGNORE_SUBSTITUTE) || ability(atk, "InfiltratorAbAttr");
// A record's `steals`: true for a Bug Bite or Pluck, null for any other move or where the target's Sticky Hold stops it
// (game-code.md §3).
const stealsOff = (t, def, ignoreAbility) => (t.attrNames?.has("StealEatBerryAttr") && (ignoreAbility || !ability(def, "BlockItemTheftAbAttr")) ? true : null);
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
  const e = effectiveness(type, d, mv, { ignoreAbilities: approxIgnoresAbilities(a, mv) });
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
  const ignoresSturdy = approxIgnoresAbilities(atk, mv);
  const ignoresSub = pastSub(atk, mv);
  const ignoresDisguise = ignoresSturdy || !meetsBlock(def, atk, mv);
  const facts = targetFacts(env, def, ignoresSturdy);
  const shielded = facts.sub > 0 && !ignoresSub;
  const once = f => resolve({ ...f, pFocus: 0, pEndure: 0 }, [new Map([[Math.max(0, max), 1]])], [{ n: 1, p: 1 }], 1, false, { ignoresDisguise, ignoresSub })[0];
  const hit = once({ ...facts, sub: 0 });
  const end = { hp: Math.max(0, hit.hp), ko: (shielded ? once(facts) : hit).hp <= 0 };
  const { revive, pFocus } = facts;
  const rolls = new Map();
  addRolls(rolls, max, 1);
  const t = traitsNow(env, atk, mv, false, def);
  return {
    // `raw`: the estimate before the target's HP cuts it, which is what a `dmg` for the rows is taken from.
    raw: x.dmg,
    name: x.name, type: x.type, cat: x.cat, e: x.e, priority: x.priority, spread: x.spread, spreadApplied: false, traits: t, semi: false, self: 0, userCost: null,
    acc, crit: 0, dist: [{ n: 1, p: 1 }], perHit: [{ max, min: Math.floor(max * 0.85) }], targetHp: def.hp,
    expected: Math.min(def.hp - end.hp, max * 0.925) * acc, uncapped: max * 0.925 * acc, max: def.hp - end.hp, pKo: end.ko && !revive ? acc : 0, revive, sub: shielded ? facts.sub : 0,
    costs: costNotes(t, { type: x.type }), notes: ["estimate"], live: false,
    use: useDist([rolls], [{ n: 1, p: 1 }], acc, false), focus: pFocus, ignoresSturdy, ignoresSub, ignoresAbility: ignoresSturdy, ignoresDisguise, cut: null, steals: stealsOff(t, def, ignoresSturdy),
    flinch: flinchChance(atk, def, mv, false), drain: drainRatio(env, atk, def, t),
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
// approximation. One priced into a Substitute (`sub`) keeps its own odds at any HP.
export const koChanceAt = (o, hp) => {
  if (!o) return 0;
  if (hp <= 0) return 1;
  if (o.revive) return 0;
  if (o.sub > 0 || hp >= (o.targetHp ?? Infinity)) return o.pKo ?? 0;
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
