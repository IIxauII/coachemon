// What the coach reads off a move's attributes, read once (#128). No battle state, and no game calls beyond the move's
// and its attributes' own methods, so it works outside a battle; what a trait is worth stays with each caller.

import { SPREAD_TARGETS } from "./01-core.js";

// Subclasses count. Class names survive minification (game-code.md §22).
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

// `selfTarget` alone misses a move aimed at the user's side, like Howl (game-code.md §14). So each effect carries
// `self` (the game's `selfTarget`), `side` (aimed at the user's side at all) and `ally` (at a partner's slot), and each
// caller draws its own line.
const SELF_SIDE = new Set([MoveTarget.USER, MoveTarget.NEAR_ALLY, MoveTarget.ALLY, MoveTarget.USER_OR_NEAR_ALLY,
  MoveTarget.USER_AND_ALLIES, MoveTarget.USER_SIDE, MoveTarget.PARTY]);
const ALLY_ONLY = new Set([MoveTarget.NEAR_ALLY, MoveTarget.ALLY]);
const sideFlags = (mv, a) => ({ self: !!a?.selfTarget, side: SELF_SIDE.has(mv?.moveTarget), ally: ALLY_ONLY.has(mv?.moveTarget) });
// A negative `chance` is certain, like 100: every move that doesn't roll passes −1 (game-code.md §5).
const guaranteedChance = mv => !(mv?.chance > 0 && mv.chance < 100);
// These read the target's chosen command, which doesn't exist yet while we choose (game-code.md §6). Upper Hand is
// left out on purpose: it needs a priority move from the target, not just an attack.
const COMMAND_CONDITION = [MoveId.SUCKER_PUNCH, MoveId.THUNDERCLAP];
// Gigaton Hammer and Blood Moon share one restriction, known here by its i18n key (game-code.md §5).
const NO_REPEAT_KEY = "battle:moveDisabledConsecutive";

// One use's hit count, before the target's HP or a boss bar cuts it short (game-code.md §2).
const hitShape = (mv, user, party, target) => {
  const mh = firstAttr(mv, "MultiHitAttr");
  let type = mh ? mh.multiHitType ?? mh.intrinsicMultiHitType : null;
  if (mh && attrsNamed(mv, "ChangeMultiHitTypeAttr").length && user?.species?.speciesId === SpeciesId.BATTLE_BOND_GRENINJA && user?.formIndex === 1) type = MultiHitType.THREE;
  const skillLink = hasAbAttr(user, "MaxMultiHitAbAttr");
  const beatUp = () => (party ?? []).reduce((t, p) => t + (p && (p.id === user?.id || !(p.status?.effect > StatusEffect.NONE)) ? 1 : 0), 0);
  let dist = type == null ? [{ n: 1, p: 1 }]
    : type === MultiHitType.TWO_TO_FIVE ? (skillLink ? [{ n: 5, p: 1 }] : [{ n: 2, p: 0.35 }, { n: 3, p: 0.35 }, { n: 4, p: 0.15 }, { n: 5, p: 0.15 }])
    : [{ n: type === MultiHitType.TWO ? 2 : type === MultiHitType.THREE ? 3 : type === MultiHitType.TEN ? 10 : Math.max(1, beatUp()), p: 1 }];
  const spread = SPREAD_TARGETS.includes(mv?.moveTarget);
  const enhanced = (...args) => (typeof mv?.canBeMultiStrikeEnhanced === "function" ? !!mv.canBeMultiStrikeEnhanced(...args) : !mh && !spread);
  const lenses = heldStackOf(user, "PokemonMultiHitModifier");
  const lensStrikes = lenses && enhanced(user) ? lenses : 0;
  const extra = (hasAbAttr(user, "AddSecondStrikeAbAttr") && enhanced(user, true, target ?? undefined) ? 1 : 0) + lensStrikes;
  if (extra) dist = dist.map(x => ({ n: x.n + extra, p: x.p }));
  const grows = attrsNamed(mv, "MultiHitPowerIncrementAttr").length > 0;
  // Rounded off the float noise, so 2–5 prints as 3.1.
  const mean = Math.round(dist.reduce((t, x) => t + x.n * x.p, 0) * 1e4) / 1e4;
  return { dist, mean, checkAll: moveFlag(mv, MoveFlags.CHECK_ALL_HITS) && !skillLink, grows, lenses: lensStrikes };
};

// `party` only counts Beat Up's strikes; `target` only refines Parental Bond's spread check.
export const moveTraits = (mv, user = null, { party = null, target = null } = {}) => {
  const guarded = hasAbAttr(user, "BlockNonDirectDamageAbAttr");
  const charging = !!mv?.isChargingMove?.();
  const chargeAttrs = mv?.chargeAttrs ?? [];
  const instant = chargeAttrs.filter(a => isAttr(a, "InstantChargeAttr"));
  const weatherCharge = instant.filter(a => isAttr(a, "WeatherInstantChargeAttr")).flatMap(a => a.weatherTypes ?? []);
  const charge = charging
    ? { skip: instant.length ? { weather: weatherCharge } : null, now: (u = user) => instant.some(a => { try { return !!a.condition?.(u, mv); } catch { return false; } }) }
    : false;
  // `useHp`: the ratio is of max HP, not of the damage dealt (game-code.md §5).
  const rec = firstAttr(mv, "RecoilAttr");
  const recoil = rec
    ? { ratio: rec.damageRatio ?? 0.25, useHp: !!rec.useHp, blocked: !rec.unblockable && (guarded || hasAbAttr(user, "BlockRecoilDamageAttr")) }
    : null;
  // A frenzy move's MissEffectAttr only ends its lock, so it never crashes (game-code.md §5).
  const lock = attrsNamed(mv, "FrenzyAttr").length > 0;
  // Guaranteed self stat changes, boosts included.
  const drops = {};
  if (guaranteedChance(mv)) {
    for (const a of attrsNamed(mv, "StatStageChangeAttr")) {
      if (!a.selfTarget || !(a.stages ?? 0)) continue;
      for (const st of a.stats ?? []) drops[st] = (drops[st] ?? 0) + a.stages;
    }
  }
  // `stages` is before Simple, Contrary and the ±6 cap, which the caller applies live.
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
  // Strength Sap is a `HitHealAttr` too, but heals by a stat and carries `healStat` (game-code.md §18).
  const drainAttr = attrsNamed(mv, "HitHealAttr").find(a => a.healStat == null) ?? null;
  // `type` is a `PokemonType` index. Whether the move does anything is the attribute's `getCondition`, left to the
  // caller.
  const setType = firstAttr(mv, "ChangeTypeAttr"), addType = firstAttr(mv, "AddTypeAttr");
  const typeChange = setType ? { kind: "set", type: setType.type } : addType ? { kind: "add", type: addType.type } : null;
  return {
    charge, semiCharge: charging && chargeAttrs.some(a => isAttr(a, "SemiInvulnerableAttr")),
    recharge: attrsNamed(mv, "RechargeAttr").length > 0,
    interrupt: attrsNamed(mv, "PreUseInterruptAttr").length > 0,
    needsAttack: COMMAND_CONDITION.includes(mv?.id),
    // Fake Out and First Impression put `FirstMoveCondition` in `conditionsSeq3`, not `conditions` (game-code.md §5).
    once: [mv?.conditions, mv?.conditionsSeq2, mv?.conditionsSeq3].some(cs => (cs ?? []).some(c => isAttr(c, "FirstMoveCondition"))),
    lock, noRepeat: (mv?.restrictions ?? []).some(r => r?.i18nkey === NO_REPEAT_KEY),
    recoil, halfSac: !guarded && attrsNamed(mv, "HalfSacrificialAttr").length > 0,
    crash: !guarded && !lock && attrsNamed(mv, "MissEffectAttr").length > 0,
    selfKo: attrsNamed(mv, "SacrificialAttrOnHit").length ? "onHit" : attrsNamed(mv, "SacrificialAttr").length ? "always" : null,
    drops, removesType: attrsNamed(mv, "RemoveTypeAttr").length > 0, guarded, typeChange,
    hits: hitShape(mv, user, party, target),
    flinches: attrsNamed(mv, "FlinchAttr").length > 0,
    stages, inflicts, tags, heal, hazard: trap ? { tag: trap.tagType } : null,
    protect: attrsNamed(mv, "ProtectAttr").length > 0,
    cutHp: cut ? { ratio: cut.cutRatio ?? 2 } : null,
    drain: drainAttr ? { ratio: drainAttr.healRatio ?? 0.5 } : null,
    // Concrete class names, where `isAttr` counts subclasses: a `LeechSeedAttr` is not also a bare
    // `AddBattlerTagAttr` here.
    attrNames: new Set((mv?.attrs ?? []).map(a => a?.constructor?.name).filter(Boolean)),
  };
};

const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
const pct = x => `${Math.round(x)}%`;
// `amounts`, where the caller has them: `recoil` as a share of max HP (0–1), `sun` whether the party can skip a weather
// charge, `type` the move's live type.
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
  const drops = Object.entries(t.drops ?? {}).filter(([, n]) => n < 0);
  if (drops.length) {
    const by = new Map();
    for (const [st, n] of drops) by.set(n, [...(by.get(n) ?? []), STAT_NAMES[st] ?? st]);
    out.push(`${[...by].map(([n, stats]) => `−${-n} ${stats.join("/")}`).join(" ")} after use`);
  }
  return out;
};
