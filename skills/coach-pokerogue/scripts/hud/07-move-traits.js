// Move traits: everything the coach reads off a move's *attributes*, read once (#128).
//
// Before this, 10-damage, the planner and the learn card each walked `mv.attrs` for the same things and drifted
// apart — two hit models for a 2–5 hitter, Focus/charge/priority constants copied three ways, and the planner
// picking which cost to show by regex-matching the English text 10-damage had written. This module owns the reads;
// what a trait is *worth* stays with each caller (10-damage's `reliability`, the learn card's value multipliers,
// the planner's benefit nudge), because a per-turn damage discount and a card value are not the same currency.
//
// Input: the move and its user (abilities, form, held items, and — for Beat Up — its party). **No battle state and
// no game calls**, so the learn card can use it outside a battle. What depends on the moment stays with callers:
// whether an instant charge holds now (`charge.now`), accuracy, recoil HP from the damage actually dealt, the
// flinch chance (Serene Grace, Shield Dust, Inner Focus), Simple / Contrary, the ±6 stage cap, `canSetStatus`, the
// weather. Methods on the move object itself (`isChargingMove`, `canBeMultiStrikeEnhanced`, `hasFlag`) are move
// data, not battle state, and are used where the game uses them.
//
// Attribute classes are matched through the prototype chain, so a subclass counts (FixedDamageAttr covers Seismic
// Toss); `attrNames` holds the *concrete* class names instead, for callers whose own tables are keyed that way
// (the learn card's status values, where a LeechSeedAttr must not also count as a bare AddBattlerTagAttr).

import { SPREAD_TARGETS } from "./01-core.js";

// Class names survive minification; subclasses count.
const isAttr = (x, name) => {
  for (let c = x?.constructor; c?.name; c = Object.getPrototypeOf(c)) if (c.name === name) return true;
  return false;
};
const attrsNamed = (mv, name) => (mv?.attrs ?? []).filter(a => isAttr(a, name));
const firstAttr = (mv, name) => attrsNamed(mv, name)[0] ?? null;
const hasAbAttr = (p, attr) => { try { return !!p?.hasAbilityWithAttr?.(attr); } catch { return false; } };
const heldStackOf = (p, name) => {
  try { return (p?.getHeldItems?.() ?? []).filter(m => m?.constructor?.name === name).reduce((t, m) => t + (m.getStackCount?.() ?? m.stackCount ?? 1), 0); } catch { return 0; }
};
const moveFlag = (mv, f) => (typeof mv?.hasFlag === "function" ? mv.hasFlag(f) : !!((mv?.flags ?? 0) & f));

// A move aimed at the user's own side changes stats on that side even when the attribute doesn't say so (Howl
// carries no `selfTarget`, only this target). Each effect below therefore carries three flags, since callers draw
// the line differently: `self` is the game's own `selfTarget`, `side` that the move is aimed at the user's side at
// all, and `ally` that it is aimed at a partner's slot — which the learn card counts as the user's side (there is
// nobody else to aim at) and the planner does not (it is the partner's stats that move, not ours).
const SELF_SIDE = new Set([MoveTarget.USER, MoveTarget.NEAR_ALLY, MoveTarget.ALLY, MoveTarget.USER_OR_NEAR_ALLY,
  MoveTarget.USER_AND_ALLIES, MoveTarget.USER_SIDE, MoveTarget.PARTY]);
const ALLY_ONLY = new Set([MoveTarget.NEAR_ALLY, MoveTarget.ALLY]);
const sideFlags = (mv, a) => ({ self: !!a?.selfTarget, side: SELF_SIDE.has(mv?.moveTarget), ally: ALLY_ONLY.has(mv?.moveTarget) });
// A stat change counts as guaranteed when the move doesn't roll for it: `chance` −1 (or absent) or 100.
const guaranteedChance = mv => !(mv?.chance > 0 && mv.chance < 100);
// Sucker Punch and Thunderclap read the target's chosen command, which doesn't exist yet while we choose. (Upper
// Hand needs a priority move from the target: left out.)
const COMMAND_CONDITION = [MoveId.SUCKER_PUNCH, MoveId.THUNDERCLAP];
// Gigaton Hammer / Blood Moon can't be picked twice in a row; the game says so through this restriction's i18n key.
const NO_REPEAT_KEY = "battle:moveDisabledConsecutive";

// The count distribution of one use, before the target's HP or a boss bar cuts it (§2). A bare MultiHitAttr is
// TWO_TO_FIVE: 7/20, 7/20, 3/20, 3/20 for 2–5 (mean 3.1), or 5 flat with Skill Link. Water Shuriken becomes THREE
// for Ash-Greninja; Beat Up hits once for the user plus once per party member with no status. Parental Bond and
// each Multi-Lens stack add a strike to a move that can take one (`target` only refines Parental Bond's spread
// check, which is why it is optional).
const hitShape = (mv, user, party, target) => {
  const mh = firstAttr(mv, "MultiHitAttr");
  let type = mh ? mh.multiHitType ?? mh.intrinsicMultiHitType : null;
  if (mh && attrsNamed(mv, "ChangeMultiHitTypeAttr").length && user?.species?.speciesId === SpeciesId.GRENINJA && user?.formIndex === 2) type = MultiHitType.THREE;
  const skillLink = hasAbAttr(user, "MaxMultiHitAbAttr");
  const beatUp = () => (party ?? []).reduce((t, p) => t + (p && (p.id === user?.id || !(p.status?.effect > StatusEffect.NONE)) ? 1 : 0), 0);
  let dist = type == null ? [{ n: 1, p: 1 }]
    : type === MultiHitType.TWO_TO_FIVE ? (skillLink ? [{ n: 5, p: 1 }] : [{ n: 2, p: 0.35 }, { n: 3, p: 0.35 }, { n: 4, p: 0.15 }, { n: 5, p: 0.15 }])
    : [{ n: type === MultiHitType.TWO ? 2 : type === MultiHitType.THREE ? 3 : type === MultiHitType.TEN ? 10 : Math.max(1, beatUp()), p: 1 }];
  const spread = SPREAD_TARGETS.includes(mv?.moveTarget);
  const enhanced = (...args) => (typeof mv?.canBeMultiStrikeEnhanced === "function" ? !!mv.canBeMultiStrikeEnhanced(...args) : !mh && !spread);
  const lenses = heldStackOf(user, "PokemonMultiHitModifier");
  const extra = (hasAbAttr(user, "AddSecondStrikeAbAttr") && enhanced(user, true, target ?? undefined) ? 1 : 0) + (lenses && enhanced(user) ? lenses : 0);
  if (extra) dist = dist.map(x => ({ n: x.n + extra, p: x.p }));
  // Triple Kick / Axel grow by the base power each strike; CHECK_ALL_HITS rolls accuracy for every strike, unless
  // Skill Link is holding the count at its maximum.
  const grows = attrsNamed(mv, "MultiHitPowerIncrementAttr").length > 0;
  // `mean` is rounded off the last binary bits so 2–5 reads as 3.1, the number the cards print.
  const mean = Math.round(dist.reduce((t, x) => t + x.n * x.p, 0) * 1e4) / 1e4;
  return { dist, mean, checkAll: moveFlag(mv, MoveFlags.CHECK_ALL_HITS) && !skillLink, grows };
};

// Everything the coach reads off `mv`'s attributes, for `user`. `party` is only Beat Up's count; `target` only
// refines Parental Bond's spread check.
export const moveTraits = (mv, user = null, { party = null, target = null } = {}) => {
  const guarded = hasAbAttr(user, "BlockNonDirectDamageAbAttr"); // Magic Guard: no recoil, crash or self-inflicted chip
  // Turns and failure.
  const charging = !!mv?.isChargingMove?.();
  const chargeAttrs = mv?.chargeAttrs ?? [];
  // The instant-charge condition as data (Solar Beam's sun) plus the closure that judges it against a live user.
  const instant = chargeAttrs.filter(a => isAttr(a, "InstantChargeAttr"));
  const weatherCharge = instant.filter(a => isAttr(a, "WeatherInstantChargeAttr")).flatMap(a => a.weatherTypes ?? []);
  const charge = charging
    ? { skip: instant.length ? { weather: weatherCharge } : null, now: (u = user) => instant.some(a => { try { return !!a.condition?.(u, mv); } catch { return false; } }) }
    : false;
  // Costs to the user. Recoil is a share of the damage dealt, or — `useHp` (Chloroblast) — of max HP; Rock Head and
  // Magic Guard stop both unless the attribute is `unblockable` (Struggle).
  const rec = firstAttr(mv, "RecoilAttr");
  const recoil = rec
    ? { ratio: rec.damageRatio ?? 0.25, useHp: !!rec.useHp, blocked: !rec.unblockable && (guarded || hasAbAttr(user, "BlockRecoilDamageAttr")) }
    : null;
  // Outrage's MissEffectAttr only ends its lock, so a frenzy move never crashes.
  const lock = attrsNamed(mv, "FrenzyAttr").length > 0;
  // Guaranteed self stat changes, signed: Overheat's −2 SpA, Close Combat's −1 Def/SpD, Flame Charge's +1 Spe.
  const drops = {};
  if (guaranteedChance(mv)) {
    for (const a of attrsNamed(mv, "StatStageChangeAttr")) {
      if (!a.selfTarget || !(a.stages ?? 0)) continue;
      for (const st of a.stats ?? []) drops[st] = (drops[st] ?? 0) + a.stages;
    }
  }
  // Status effects, as data. `stages` keeps every stat change (a foe's drops included) with the stages this user
  // would get — Simple / Contrary and the ±6 cap are the caller's, live. `heal.ratioIn` asks the attribute what it
  // heals in a weather, so Synthesis and Moonlight are read here rather than by each card.
  const stages = attrsNamed(mv, "StatStageChangeAttr").map(a => {
    let n = a.stages ?? 0;
    try { if (typeof a.getLevels === "function") n = a.getLevels(user); } catch {}
    return { stats: a.stats ?? [], stages: n, chance: mv?.chance ?? -1, ...sideFlags(mv, a), cls: a.constructor?.name ?? "" };
  });
  const inflicts = attrsNamed(mv, "StatusEffectAttr").map(a => ({ effect: a.effect, chance: mv?.chance ?? -1, ...sideFlags(mv, a), cls: a.constructor?.name ?? "" }));
  const tags = attrsNamed(mv, "AddBattlerTagAttr").map(a => ({ tag: a.tagType, ...sideFlags(mv, a), cls: a.constructor?.name ?? "" }));
  const healAttr = firstAttr(mv, "HealAttr");
  const heal = healAttr
    ? {
      ratio: healAttr.healRatio ?? 0.5, self: healAttr.selfTarget !== false, cls: healAttr.constructor?.name ?? "",
      // The weather ratio the attribute itself gives (WeatherHealAttr), or a BoostHealAttr's two ratios.
      ratioIn: (w, u = user, t = target) => {
        try {
          if (typeof healAttr.getWeatherHealRatio === "function") return healAttr.getWeatherHealRatio(w);
          if (isAttr(healAttr, "BoostHealAttr")) return healAttr.condition?.(u, t, mv) ? healAttr.boostedHealRatio ?? healAttr.healRatio ?? 0.5 : healAttr.normalHealRatio ?? healAttr.healRatio ?? 0.5;
        } catch {}
        return healAttr.healRatio ?? 0.5;
      },
    }
    : null;
  const trap = firstAttr(mv, "AddArenaTrapTagAttr");
  const cut = firstAttr(mv, "CutHpStatStageBoostAttr");
  // Drain (Giga Drain, Leech Life): the share of a hit's damage that heals its user. Strength Sap heals by a stat,
  // not by damage, and carries `healStat`: not drain. Heal Block, Healing Charm and Liquid Ooze are the caller's.
  const drainAttr = attrsNamed(mv, "HitHealAttr").find(a => a.healStat == null) ?? null;
  return {
    charge, semiCharge: charging && chargeAttrs.some(a => isAttr(a, "SemiInvulnerableAttr")),
    recharge: attrsNamed(mv, "RechargeAttr").length > 0,
    interrupt: attrsNamed(mv, "PreUseInterruptAttr").length > 0,
    needsAttack: COMMAND_CONDITION.includes(mv?.id),
    // Fake Out / First Impression: the game hangs FirstMoveCondition off any of the three condition lists.
    once: [mv?.conditions, mv?.conditionsSeq2, mv?.conditionsSeq3].some(cs => (cs ?? []).some(c => isAttr(c, "FirstMoveCondition"))),
    lock, noRepeat: (mv?.restrictions ?? []).some(r => r?.i18nkey === NO_REPEAT_KEY),
    recoil, halfSac: !guarded && attrsNamed(mv, "HalfSacrificialAttr").length > 0,
    crash: !guarded && !lock && attrsNamed(mv, "MissEffectAttr").length > 0,
    // Explosion faints its user either way; Final Gambit only when it hits.
    selfKo: attrsNamed(mv, "SacrificialAttrOnHit").length ? "onHit" : attrsNamed(mv, "SacrificialAttr").length ? "always" : null,
    drops, removesType: attrsNamed(mv, "RemoveTypeAttr").length > 0, guarded,
    hits: hitShape(mv, user, party, target),
    flinches: attrsNamed(mv, "FlinchAttr").length > 0,
    stages, inflicts, tags, heal, hazard: trap ? { tag: trap.tagType } : null,
    protect: attrsNamed(mv, "ProtectAttr").length > 0,
    cutHp: cut ? { ratio: cut.cutRatio ?? 2 } : null,
    drain: drainAttr ? { ratio: drainAttr.healRatio ?? 0.5 } : null,
    attrNames: new Set((mv?.attrs ?? []).map(a => a?.constructor?.name).filter(Boolean)),
  };
};

const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
const pct = x => `${Math.round(x)}%`;
// What a move costs its user, one wording per kind, in the order a reader meets them: the turns it spends, the HP
// it burns, the stats it gives up. `amounts` carries this matchup's numbers when the caller has them — `recoil` as
// a share of the user's max HP (0–1), `sun` whether the party can skip a weather charge, `type` the move's live
// type for the one it gives away. Both the ⚔ line's `costs` and the learn card's drawbacks read from here, so the
// two cards can't word the same cost two ways.
export const costNotes = (t, amounts = {}) => {
  if (!t) return [];
  const out = [];
  if (t.charge) {
    out.push(t.semiCharge ? "two-turn (dodges)"
      : !t.charge.skip ? "charge turn"
      : amounts.sun === false ? "charge turn (not in sun)" : "charge turn (skipped in sun)");
  } else if (t.recharge) out.push("recharge turn");
  if (t.interrupt) out.push("fails if hit first");
  if (t.needsAttack) out.push("fails unless the foe attacks");
  if (t.once) out.push("first turn only");
  if (t.lock) out.push("locks 2–3 turns, then confused");
  if (t.noRepeat) out.push("not twice in a row");
  if (t.recoil) {
    out.push(t.recoil.blocked ? "recoil (blocked)"
      : amounts.recoil != null ? `recoil ≈−${pct(amounts.recoil * 100)}`
      : t.recoil.useHp ? `−${pct(t.recoil.ratio * 100)} HP each use`
      : `recoil ${pct(t.recoil.ratio * 100)} of damage`);
  }
  if (t.halfSac) out.push("−50% HP each use");
  if (t.crash) out.push("−50% HP if it misses");
  if (t.selfKo) out.push("user faints");
  if (t.removesType) out.push(`loses its ${amounts.type ?? "own"} type`);
  // Only the drops: a guaranteed *boost* (Flame Charge's +1 Spe) is in `drops` too, signed, but it is no cost. Stats
  // that fall by the same amount are named together, the way the move reads: Close Combat's "−1 Def/SpD".
  const drops = Object.entries(t.drops ?? {}).filter(([, n]) => n < 0);
  if (drops.length) {
    const by = new Map();
    for (const [st, n] of drops) by.set(n, [...(by.get(n) ?? []), STAT_NAMES[st] ?? st]);
    out.push(`${[...by].map(([n, stats]) => `−${-n} ${stats.join("/")}`).join(" ")} after use`);
  }
  return out;
};
