// Learn-move card model.
// Learn-move: the SUMMARY screen (UiMode 9, summaryUiMode 1) holds the new move; before it opens, the
// "forget a move?" prompt only has LearnMovePhase's moveId, so the move is built from a PokemonMove.
// No game functions run here (the game isn't waiting on a battle command): only move/attr fields are read.
const learnState = s => {
  const h = s.ui.getHandler();
  const double = !!s.currentBattle?.double;
  const party = s.getPlayerParty?.() ?? [];
  if (s.ui.getMode() === 9 && h?.summaryUiMode === 1 && h.newMove) return { pk: h.pokemon, mv: h.newMove, double, party };
  const phase = s.phaseManager?.getCurrentPhase?.();
  if (phase?.phaseName !== "LearnMovePhase") return null;
  const pk = party[phase.partyMemberIndex];
  const pm = pk?.moveset.find(Boolean);
  return pk && pm ? { pk, mv: new pm.constructor(phase.moveId).getMove(), double, party } : null;
};

// A Move object for a move id, built the way LearnMovePhase's prompt is: from any PokemonMove's constructor.
const learnMoveById = (party, id) => {
  const pm = party.flatMap(p => p?.moveset ?? []).find(Boolean);
  try { return pm ? new pm.constructor(id).getMove() : null; } catch { return null; }
};

const { moveScore, learnPlan } = (() => {
  const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
  const attrsOf = (mv, name) => (mv.attrs || []).filter(a => a.constructor?.name === name);
  const isDamaging = mv => !!mv && mv.category !== 2 && (mv.power > 0 || mv.power === -1);
  const unimplemented = mv => / \(N\)$/.test(mv.name ?? "");

  // Fixed damage as the base power that deals about as much at this level with even Atk/Def and no STAB
  // (getBaseDamage: (2L/5+2)·P·A/D/50+2).
  const fixedPower = (dmg, level) => Math.round(Math.max(0, dmg) * 50 / (2 * (level || 50) / 5 + 2));
  // Moves with power −1 in the move data: power set by the target or the moment. Stand-ins, by attribute:
  // [attr, power(pk, mv, attr), note, fixed damage (no STAB, no type effectiveness)?]
  const STAND_INS = [
    ["LevelDamageAttr", pk => fixedPower(pk.level, pk.level), "damage = level", true],
    ["RandomLevelDamageAttr", pk => fixedPower(pk.level, pk.level), "damage ≈ level", true],
    // Half the target's HP: about a quarter of a same-level foe's max HP over a fight, and it can't KO.
    ["TargetHalfHpDamageAttr", pk => fixedPower((2.1 * pk.level + 10) / 4, pk.level), "halves HP · can't KO", true],
    ["FixedDamageAttr", (pk, mv, a) => fixedPower(a.damage ?? 0, pk.level), "fixed damage", true],
    ["MatchHpAttr", () => 40, "HP to yours", true],
    ["UserHpDamageAttr", () => 40, "damage = your HP", true],
    ["CounterDamageAttr", () => 40, "needs to be hit first", true],
    ["WeightPowerAttr", () => 60, "weight-based"],
    ["CompareWeightPowerAttr", () => 60, "weight-based"],
    ["GyroBallPowerAttr", () => 60, "speed-based"],
    ["ElectroBallPowerAttr", () => 60, "speed-based"],
    ["LowHpPowerAttr", () => 40, "strong at low HP"],
    ["FriendshipPowerAttr", (pk, mv, a) => Math.max(1, Math.floor((a.invert ? 255 - (pk.friendship ?? 0) : pk.friendship ?? 0) / 2.5)), "friendship"],
    ["OpponentHighHpPowerAttr", () => 60, "weaker as the foe tires"],
    ["MagnitudePowerAttr", () => 71, "random power"],
    ["PresentPowerAttr", () => 52, "may heal the foe"],
    ["BeatUpAttr", (pk, mv, a, party) => 15 * Math.max(1, party.filter(p => p?.hp > 0 && !(p.status?.effect > 0)).length), "party-based"],
    ["SpitUpPowerAttr", () => 30, "needs Stockpile"],
    ["LessPPMorePowerAttr", () => 60, "stronger as PP drops"],
    ["PunishmentPowerAttr", () => 60, "stronger vs boosts"],
  ];
  const standIn = (pk, mv, party) => {
    for (const [name, power, note, fixed] of STAND_INS) {
      const a = attrsOf(mv, name)[0];
      if (a) return { power: power(pk, mv, a, party), note, fixed: !!fixed };
    }
    return { power: 60, note: "variable power", fixed: false };
  };

  // Expected hits and the per-hit power multiple they add up to. MultiHitType 0 `_2`, 1 `_2_TO_5` (mean 3.1, Skill
  // Link 5), 2 `_3`, 3 `_10`, 4 Beat Up. Triple Axel/Kick grow by the base power each hit and check accuracy per hit
  // (CHECK_ALL_HITS 65536): Σ a^(k+1)·(k+1). Otherwise only the first hit can miss.
  const multiHit = (pk, mv, acc, party) => {
    const mh = attrsOf(mv, "MultiHitAttr")[0];
    if (!mh) return { hits: 1, factor: acc };
    const skillLink = abilitiesOf(pk).includes("Skill Link");
    const type = mh.intrinsicMultiHitType ?? mh.multiHitType ?? 1;
    const n = type === 1 ? (skillLink ? 5 : 3.1) : type === 0 ? 2 : type === 2 ? 3 : type === 3 ? 10
      : Math.max(1, party.filter(p => p?.hp > 0 && !(p.status?.effect > 0)).length);
    const grows = attrsOf(mv, "MultiHitPowerIncrementAttr").length > 0;
    const checkAll = (mv.hasFlag ? mv.hasFlag(65536) : grows) && !skillLink;
    if (!checkAll && !grows) return { hits: n, factor: acc * n };
    let factor = 0, reach = 1, hits = 0;
    for (let k = 0; k < Math.round(n); k++) {
      reach *= checkAll || k === 0 ? acc : 1;
      factor += reach * (grows ? k + 1 : 1);
      hits += reach;
    }
    return { hits: Math.round(hits * 10) / 10, factor };
  };

  // Defending types a set of moves hits super-effectively (single types). Fixed damage ignores effectiveness.
  const isFixed = mv => mv.power === -1 && STAND_INS.some(([name, , , fixed]) => fixed && attrsOf(mv, name).length);
  const seTypes = moves => new Set(moves.filter(m => isDamaging(m) && !isFixed(m)).flatMap(m => CHART[TYPES[m.type]]?.[0] ?? []));
  // A status move that raises the user's own stats (Calm Mind, Swords Dance, Dragon Dance): worth something when it
  // boosts the stat this mon attacks with and it has no such setup move yet. `value` is in the same rough units as
  // effective power; null when the move isn't setup.
  const setupOf = (pk, mv, current) => {
    if (mv.category !== 2) return null;
    const boosts = attrsOf(mv, "StatStageChangeAttr").filter(a => a.selfTarget && (a.stages ?? 0) > 0);
    if (!boosts.length) return null;
    const atk = pk.getStat(1), spa = pk.getStat(3);
    const main = new Set([atk >= spa * 0.9 ? 1 : null, spa >= atk * 0.9 ? 3 : null].filter(Boolean));
    const weight = i => (main.has(i) ? 30 : i === 5 ? 20 : i === 2 || i === 4 ? 10 : i === 1 || i === 3 ? 5 : 3);
    let value = 0;
    const parts = [];
    for (const a of boosts) {
      for (const i of a.stats ?? []) value += weight(i) * a.stages;
      parts.push(`+${a.stages} ${(a.stats ?? []).map(i => STAT_NAMES[i]).join("/")}`);
    }
    const boostsMain = boosts.some(a => (a.stats ?? []).some(i => main.has(i)));
    const hasSetup = current.some(o => o !== mv && o.category === 2 && attrsOf(o, "StatStageChangeAttr")
      .some(a => a.selfTarget && (a.stages ?? 0) > 0 && (a.stats ?? []).some(i => main.has(i))));
    if (!boostsMain) value *= 0.5;
    if (hasSetup) value *= 0.3;
    return { value: Math.round(value), text: parts.join(" "), fits: boostsMain && !hasSetup };
  };
  const movesOf = p => (p?.moveset ?? []).filter(Boolean).map(pm => { try { return pm.getMove(); } catch { return null; } }).filter(Boolean);

  // Effective power of a move on this pokémon: power × expected hits × accuracy × STAB × how well its attack stat
  // suits the category, then adjusted for what it costs or adds, each adjustment named in `notes` so the card can
  // show why. `others`: this mon's other moves; `teamSe`: types the rest of the party already hits super-effectively.
  // null value for status moves, which can't be scored.
  const moveScore = (pk, mv, others, double, ctx = {}) => {
    const party = ctx.party ?? [pk];
    const teamSe = ctx.teamSe ?? null;
    if (!isDamaging(mv)) return { value: null, notes: [] };
    const notes = [];
    const type = TYPES[mv.type];
    if (unimplemented(mv)) return { value: 0, notes: ["not implemented"], power: 0 };
    const atk = pk.getStat(1), spa = pk.getStat(3);
    const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
    let power = mv.power;
    let fixed = false;
    if (!(power > 0)) {
      const s = standIn(pk, mv, party);
      power = s.power; fixed = s.fixed;
      notes.push(s.note);
    }
    // Technician: ×1.5 on hits of base power ≤ 60 (after variable power).
    const grows = attrsOf(mv, "MultiHitPowerIncrementAttr").length > 0;
    if (!fixed && abilitiesOf(pk).includes("Technician") && power * (grows ? 3 : 1) <= 60) { power *= 1.5; notes.push("Technician"); }
    const mh = multiHit(pk, mv, acc, party);
    if (mh.hits > 1) notes.push(`${mh.hits} hits`);
    const fit = fixed ? 1 : (mv.category === 0 ? atk : spa) / Math.max(atk, spa);
    const stab = !fixed && typesOf(pk).includes(type) ? 1.5 : 1;
    let value = power * mh.factor * stab * fit;

    // Coverage, by the type chart: defending types this move newly hits super-effectively (more if nobody on the team
    // does), and types that resist every other move of ours but not this one. Not just "no other move of this type".
    const ownSe = seTypes(others);
    const se = fixed ? [] : (CHART[type]?.[0] ?? []).filter(d => !ownSe.has(d));
    const teamOnly = teamSe ? se.filter(d => !teamSe.has(d)) : [];
    const otherTypes = [...new Set(others.filter(o => isDamaging(o) && !isFixed(o)).map(o => TYPES[o.type]))];
    const neutral = fixed ? [] : TYPES.filter(d => !se.includes(d) && vs(type, d) >= 1 && Math.max(0, ...otherTypes.map(t => vs(t, d))) < 1);
    if (se.length || neutral.length) {
      value *= 1 + Math.min(0.3, (se.length ? 0.1 : 0) + 0.04 * se.length + 0.04 * teamOnly.length + 0.02 * neutral.length);
      const list = xs => `${xs.slice(0, 3).join("/")}${xs.length > 3 ? "…" : ""}`;
      if (se.length) notes.push(`SE on ${list(se)}`);
      else if (neutral.length && otherTypes.length) notes.push(`neutral on ${list(neutral)}`);
    }
    const sameType = others.filter(o => isDamaging(o) && TYPES[o.type] === type).length;
    // Same-type redundancy: a second move of a type adds little beyond the stronger one, a third less still.
    if (sameType >= 1) { value *= sameType >= 2 ? 0.6 : 0.75; notes.push(`${sameType + 1}× ${type}`); }

    // The move's own drawbacks, from its attrs: each one discounts the value and is named in `drawbacks` (and notes).
    const drawbacks = [];
    const cost = (mult, text) => { value *= mult; drawbacks.push(text); };
    const ab = abilitiesOf(pk);
    const noIndirect = ab.includes("Magic Guard");
    const recoil = attrsOf(mv, "RecoilAttr")[0];
    if (recoil) {
      const ratio = recoil.damageRatio ?? 0.33;
      // useHp: a share of max HP each use (Chloroblast); else a share of the damage dealt (Rock Head blocks it).
      if (recoil.useHp) { if (!noIndirect) cost(Math.max(0.5, 1 - 0.9 * ratio), `−${Math.round(ratio * 100)}% HP each use`); }
      else if (ab.includes("Rock Head") || noIndirect) notes.push("recoil (blocked)");
      else cost(Math.min(0.8, Math.max(0.5, 1 - ratio)), `recoil ${Math.round(ratio * 100)}% of damage`);
    }
    if (hasAttr(mv, "SacrificialAttr") || hasAttr(mv, "SacrificialAttrOnHit")) cost(0.3, "user faints");
    else if (hasAttr(mv, "HalfSacrificialAttr") && !noIndirect) cost(0.55, "−50% HP each use");
    const frenzy = hasAttr(mv, "FrenzyAttr");
    // Crash damage: High Jump Kick-style moves lose half max HP on a miss or into an immunity.
    if (!frenzy && hasAttr(mv, "MissEffectAttr") && !noIndirect) cost(Math.max(0.7, 0.95 - 0.6 * (1 - acc)), "−50% HP if it misses");
    if (frenzy) cost(0.7, "locks 2–3 turns, then confused");
    if ((mv.restrictions ?? []).some(r => /Consecutive/i.test(r?.i18nkey ?? ""))) cost(0.7, "not twice in a row");
    if (hasAttr(mv, "RemoveTypeAttr")) cost(0.6, `loses its ${type} type`);
    if (hasAttr(mv, "PreUseInterruptAttr")) cost(0.4, "fails if hit first");
    else if (mv.isChargingMove?.()) {
      const charge = mv.chargeAttrs ?? [];
      if (charge.some(a => a.constructor?.name === "SemiInvulnerableAttr")) cost(0.6, "two-turn (dodges)");
      else if (charge.some(a => a.constructor?.name === "WeatherInstantChargeAttr")) cost(0.5, "charge turn (not in sun)");
      else cost(0.5, "charge turn");
    } else if (hasAttr(mv, "RechargeAttr")) cost(0.5, "recharge turn");
    else if ((mv.priority ?? 0) < 0) cost(0.8, "moves last");
    if ((mv.conditions ?? []).some(c => c?.constructor?.name === "FirstMoveCondition")) cost(0.4, "first turn only");
    // Priority picks off weakened foes and faster threats before they act.
    else if ((mv.priority ?? 0) > 0) { value *= 1.25; notes.push(`priority +${mv.priority}`); }

    // Guaranteed self stat changes (chance −1/100): drops cost more on the stat the move attacks with (Overheat's SpA)
    // than on defences (Close Combat); boosts (Flame Charge) add.
    const attackStat = mv.category === 0 ? 1 : 3;
    for (const a of attrsOf(mv, "StatStageChangeAttr")) {
      if (!a.selfTarget || !(mv.chance === -1 || mv.chance === undefined || mv.chance >= 100)) continue;
      const stages = a.stages ?? 0;
      const stats = a.stats ?? [];
      const names = stats.map(i => STAT_NAMES[i]).filter(Boolean).join("/");
      if (!names || !stages) continue;
      if (stages < 0) {
        const loss = stats.reduce((t, i) => t + (i === attackStat ? 0.1 : 0.05) * -stages, 0);
        cost(Math.max(0.7, 1 - loss), `−${-stages} ${names} after use`);
      } else { value *= 1.1; notes.push(`+${stages} ${names}`); }
    }
    notes.push(...drawbacks);
    if (double && SPREAD_TARGETS.includes(mv.moveTarget)) { value *= 1.15; notes.push("spread"); }
    if (fit < 0.9) notes.push(mv.category === 0 ? "weak Atk" : "weak SpA");
    return {
      value: Math.round(value), notes,
      power: Math.round(power), hits: mh.hits, acc: Math.round(acc * 100), stab: stab > 1, fixed,
      se, neutral, teamSe: teamOnly, drawbacks,
    };
  };

  // The whole learn decision for `pk` and move `mv`: each current slot against the new move, which to forget, and
  // what the team gains or loses. Shared by the learn card and the rewards card's TM scoring.
  const learnPlan = (pk, mv, { double = false, party = [pk] } = {}) => {
    const current = movesOf(pk);
    const mates = party.filter(p => p && p !== pk);
    const teamSe = seTypes(mates.flatMap(movesOf));
    const teamTypes = new Set(mates.flatMap(movesOf).filter(isDamaging).map(m => TYPES[m.type]));
    const ctx = { party, teamSe };
    const info = (x, score) => ({ name: x.name, type: TYPES[x.type] ?? "Normal", cat: ["physical", "special", "status"][x.category], ...score });
    // Each slot is judged against the other three, so coverage counts for both the old move and its replacement.
    const moves = current.map((x, i) => {
      const rest = current.filter((_, j) => j !== i);
      const score = moveScore(pk, x, rest, double, ctx);
      const type = TYPES[x.type];
      const onlyOnTeam = mates.length > 0 && isDamaging(x) && !teamTypes.has(type) && !rest.some(o => isDamaging(o) && TYPES[o.type] === type);
      if (onlyOnTeam && score.value !== null) score.notes.push(`only ${type} move on team`);
      return { ...info(x, score), onlyOnTeam, replacement: moveScore(pk, mv, rest, double, ctx).value };
    });
    const gainOf = m => (m.replacement ?? 0) - m.value;
    let compare = -1;
    moves.forEach((m, i) => { if (m.value !== null && (compare < 0 || gainOf(m) > gainOf(moves[compare]))) compare = i; });
    const free = current.length < 4;
    // Scored against the slot it would take (the best one to drop even when skipping), or all four with a free slot.
    const against = free || compare < 0 ? current : current.filter((_, j) => j !== compare);
    const incoming = info(mv, moveScore(pk, mv, against, double, ctx));
    const setup = setupOf(pk, mv, current);
    if (setup) { incoming.setup = setup; incoming.notes.push(`setup ${setup.text}${setup.fits ? "" : " (weak fit)"}`); }
    let kind, forget = -1, gain = 0;
    if (free) { kind = "free"; gain = incoming.value ?? 0; }
    else if (incoming.value === null) kind = "status";
    else if (compare < 0) kind = "only-status";
    else if (moves[compare].replacement > moves[compare].value * 1.1) { kind = "learn"; forget = compare; gain = gainOf(moves[compare]); }
    else { kind = "skip"; gain = gainOf(moves[compare]); }
    const dropped = compare >= 0 && !free ? moves[compare] : null;
    const team = {
      gains: incoming.teamSe ?? [],
      loses: dropped ? dropped.teamSe ?? [] : [],
      // Losing the team's only move of a type, unless the new move is that type.
      // Normal hits nothing super-effectively: losing the last one is no coverage loss worth a warning.
      onlyType: dropped?.onlyOnTeam && dropped.type !== incoming.type && dropped.type !== "Normal" ? dropped.type : null,
    };
    return { moves, incoming, forget, compare: free ? -1 : compare, kind, gain, team, atk: pk.getStat(1), spa: pk.getStat(3) };
  };
  return { moveScore, learnPlan };
})();

const learnModel = ({ pk, mv, double, party }) => {
  const plan = learnPlan(pk, mv, { double, party: party?.length ? party : [pk] });
  const { moves, incoming, forget, compare, team } = plan;
  const verdict = {
    free: ["Learns it — free slot", "#6d6"],
    status: ["Status move — your call", "#fa4"],
    "only-status": ["Only status moves to drop — your call", "#fa4"],
    learn: [`Learn → forget ${moves[forget]?.name}`, "#6d6"],
    skip: [`Skip — not an upgrade${moves[compare] ? ` over ${moves[compare].name}` : ""}`, "#e55"],
  }[plan.kind];
  return {
    kind: "learn", icon: iconOf(pk), name: pk.name, move: incoming, moves, forget, compare, verdict,
    decision: plan.kind, gain: plan.gain, atk: plan.atk, spa: plan.spa, team,
  };
};
