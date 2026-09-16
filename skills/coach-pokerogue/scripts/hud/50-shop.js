// Rewards-screen card model.
// Rewards screen (UiMode 6). Needs come from the party; items are judged by their game class and fields
// (restorePoints / restorePercent, moveId, pokeballType), by who in the party the game itself would let use them
// (PokemonModifierType.selectFilter: null = usable — TM compatibility, evolution/form-change items, held-item stack
// limits), and only then by rarity tier. Nothing here depends on remembering what an item does.
const TIER_NAMES = ["Common", "Great", "Ultra", "Rogue", "Master", "Luxury"];
const isA = (t, name) => {
  for (let p = t && Object.getPrototypeOf(t); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (p.constructor?.name === name) return true;
  }
  return false;
};
const isRevive = t => isA(t, "PokemonReviveModifierType");
const isHeal = t => isA(t, "PokemonHpRestoreModifierType") && !isRevive(t);
const isPp = t => isA(t, "PokemonPpRestoreModifierType");
const isAllPp = t => isA(t, "PokemonAllMovePpRestoreModifierType");
const healOn = (t, p) => Math.max(t.restorePoints ?? 0, Math.floor((t.restorePercent ?? 0) * p.getMaxHp() / 100));
const pct = p => Math.round(p.hp / p.getMaxHp() * 100);

// Who in the party can use a reward, by the game's own select filter (null = usable). null when it can't be told
// (no filter, or the filter throws): callers treat that as unknown, not as "nobody".
const shopUsers = (t, party) => {
  if (typeof t.selectFilter !== "function") return null;
  try { return party.filter(p => t.selectFilter(p) == null); } catch { return null; }
};
// Who can learn a TM: the game's select filter (TmModifierType's is `isTmCompatible(moveId, true)` — species and
// fusion TM lists, minus moves already known); without one, the same check called directly. Members who already know
// the move are dropped either way. null when it can't be told.
const knowsMove = (p, id) => (p.moveset ?? []).some(m => m?.moveId === id);
const tmLearners = (t, party) => {
  let users = shopUsers(t, party);
  if (!users && party.length && party.every(p => typeof p.isTmCompatible === "function")) {
    try { users = party.filter(p => p.isTmCompatible(t.moveId, true)); } catch { users = null; }
  }
  return users && users.filter(p => !knowsMove(p, t.moveId));
};

// TM advice: the learn decision (learnAdvice, the learn card's own) for every member who can learn the move, and the
// best recipient. `take` true with the member gaining the most effective power (or, for a setup move, the member it
// suits), false when nobody gains (`closest` is the nearest miss), null when nobody's card can score it.
// Status moves are scored on the same scale as attacks now (#70), so most of them land in the first branch — the
// `setup` field rides along on the recipient either way, because "setup TM for Comfey (+1 SpA/SpD)" says more than
// "over Tackle".
const tmAdvice = (mv, users, ctx) => {
  const all = users.map(p => ({ p, a: learnAdvice(p, mv, ctx) }));
  const recipient = x => ({ icon: iconOf(x.p), name: x.p.name, forget: x.a.forget, against: x.a.against, slot: x.a.slot, gain: x.a.gain, reason: x.a.reason,
    ...(x.a.setup ? { setup: x.a.setup.text } : {}) });
  const best = all.filter(x => x.a.learn).sort((a, b) => b.a.gain - a.a.gain)[0];
  if (best) return { take: true, best: recipient(best) };
  const setup = all.filter(x => x.a.setup).sort((a, b) => b.a.setup.value - a.a.setup.value)[0];
  if (setup?.a.setup.fits) return { take: true, best: { ...recipient(setup), gain: setup.a.setup.value } };
  if (mv.category === 2 && all.every(x => x.a.learn === null)) return { take: null, best: null };
  // Nobody's card could score it: which slot to drop is the user's call.
  const open = all.find(x => x.a.learn === null);
  if (open) return { take: null, best: recipient(open) };
  const closest = all.filter(x => x.a.learn === false).sort((a, b) => b.a.gain - a.a.gain)[0];
  return { take: false, best: null, closest: closest ? recipient(closest) : null };
};

const shopTier = t => {
  if (t.tier != null) return t.tier;
  try { return t.getOrInferTier?.() ?? null; } catch { return null; }
};
// Forms that need the key item: mega forms for the Mega Bracelet, gigantamax for the Dynamax Band.
const hasFormKey = (p, re) => [p.species, p.fusionSpecies].some(sp => (sp?.forms ?? []).some(f => re.test(f?.formKey ?? "")));

const shopModel = (s, h) => {
  const party = s.getPlayerParty();
  const alive = party.filter(p => p.hp > 0);
  // Every 10th wave is a boss: the reward before it is the last chance to patch the team up.
  const wave = s.currentBattle?.waveIndex ?? 0;
  const bossNext = wave > 0 && wave % 10 === 9;
  const hurtBelow = bossNext ? 80 : 60;
  // Low PP: a damaging move nearly out (≤ a quarter of its PP and ≤ 5 left). Unused status moves and a few PP spent
  // don't count — the game's own Ether weight asks for over half used and ≤ 5 left.
  const lowOn = m => {
    try { if (m.getMove?.()?.category === 2) return false; } catch {}
    const max = m.getMovePp(), left = max - m.ppUsed;
    return m.ppUsed > 0 && left <= Math.min(5, Math.max(1, Math.floor(max / 4)));
  };
  const needs = {
    fainted: party.filter(p => p.hp <= 0),
    status: party.filter(p => p.hp > 0 && (p.status?.effect ?? 0) > 0),
    hurt: party.filter(p => p.hp > 0 && pct(p) < hurtBelow).sort((a, b) => pct(a) - pct(b)),
    lowPp: party.filter(p => p.hp > 0).map(p => ({ p, moves: p.moveset.filter(Boolean).filter(lowOn) })).filter(x => x.moves.length),
  };

  // Shop: buy for the worst needs first while money lasts, skipping the need the free reward covers ([kind, pokémon]).
  // Buying must happen before taking the free reward.
  const shop = (h.shopOptionsRows || []).flat().map(o => ({ t: o.modifierTypeOption.type, cost: o.modifierTypeOption.cost }));
  const byCost = pred => shop.filter(i => pred(i.t)).sort((a, b) => a.cost - b.cost);
  const planBuys = covered => {
    let money = s.money;
    const buys = [];
    const skip = (kind, target) => covered && covered[0] === kind && covered[1] === target;
    const buy = (list, target, kind, why) => {
      const item = list.filter(i => i.cost <= money)[0];
      if (!item) return;
      money -= item.cost;
      buys.push({ name: item.t.name, icon: item.t.iconImage, cost: item.cost, target: iconOf(target), targetName: target.name, why, kind, pokemon: target, t: item.t });
    };
    for (const p of needs.fainted) if (!skip("fainted", p)) buy(byCost(isRevive), p, "fainted", "fainted");
    for (const p of needs.status) if (!skip("status", p)) buy(byCost(t => isA(t, "PokemonStatusHealModifierType")), p, "status", "status");
    for (const p of needs.hurt) {
      if (skip("hurt", p)) continue;
      const missing = p.getMaxHp() - p.hp;
      const heals = byCost(isHeal);
      // Cheapest that tops it up; failing that, the biggest heal affordable.
      const enough = heals.filter(i => healOn(i.t, p) >= missing * 0.8);
      buy(enough.length ? enough : heals.sort((a, b) => healOn(b.t, p) - healOn(a.t, p)), p, "hurt", `${pct(p)}% HP`);
    }
    for (const { p, moves } of needs.lowPp) {
      if (skip("lowPp", p)) continue;
      const m = moves[0];
      const missing = m.ppUsed;
      // Cheapest that restores it all; failing that, any single-move restore we can afford.
      const single = byCost(isPp);
      const list = moves.length >= 2 ? byCost(isAllPp)
        : [...single.filter(i => i.t.restorePoints === -1 || i.t.restorePoints >= missing), ...single];
      buy(list, p, "lowPp", moves.length >= 2 ? `${moves.length} moves low` : `${m.getName()} ${m.getMovePp() - m.ppUsed}/${m.getMovePp()}`);
    }
    return { buys, left: money };
  };
  const baseline = planBuys(null);
  const owned = name => (s.modifiers ?? []).some(m => m?.constructor?.name === name);

  // Free rewards: what the item does for this party now, then rarity tier as a tiebreak for everything else.
  const balls = s.pokeballCounts ?? {};
  const free = (h.options || []).map(o => {
    const t = o.modifierTypeOption.type;
    const tier = shopTier(t);
    let v = (tier ?? 0) * 10;
    let why = TIER_NAMES[tier] ?? "";
    let covers = null;
    const extra = {};
    const users = shopUsers(t, alive);
    // A reward that covers a need: if we'd buy for that need anyway, it's worth the money it saves (take it free, buy
    // one fewer); if we couldn't buy for it, it's worth the need itself. A heal only stands in for a purchase that
    // heals no more than it does, and a heal far short of the damage is worth little.
    const need = (list, kind, bonus, text, none) => {
      if (!list.length) {
        if (bossNext) { v = 2; why = `${none} · spare for the boss`; } else { v = -5; why = none; }
        return;
      }
      const targets = list.map(x => x.p ?? x);
      const boughtFor = p => baseline.buys.find(b => b.kind === kind && b.pokemon === p);
      const enough = p => kind !== "hurt" || healOn(t, p) >= Math.min((p.getMaxHp() - p.hp) * 0.8, healOn(boughtFor(p).t, p));
      const bought = targets.filter(p => boughtFor(p) && enough(p));
      if (kind === "hurt" && !bought.length && targets.every(p => healOn(t, p) < (p.getMaxHp() - p.hp) * 0.5)) {
        v = bossNext ? 6 : 2; covers = null; why = `${text(list[0])} a little`;
      } else if (bought.length) {
        const savings = bought.map(p => ({ p, saved: boughtFor(p).cost })).sort((a, b) => b.saved - a.saved);
        v = 4 + Math.min(10, savings[0].saved / 100) + (bossNext ? 2 : 0);
        covers = [kind, savings[0].p]; why = `${text(list[targets.indexOf(savings[0].p)])} · saves $${savings[0].saved}`;
        extra.saves = savings[0].saved;
      } else {
        v = 10 + bonus + (bossNext ? 4 : 0); covers = [kind, targets[0]]; why = text(list[0]);
      }
    };
    if (isRevive(t)) need(needs.fainted, "fainted", 15, p => `revives ${p.name}`, "nobody fainted");
    else if (isHeal(t)) need(needs.hurt, "hurt", 8, p => `heals ${p.name}`, "party healthy");
    else if (isA(t, "PokemonStatusHealModifierType")) need(needs.status, "status", 8, p => `cures ${p.name}`, "no status");
    else if (isPp(t) || isAllPp(t)) need(needs.lowPp, "lowPp", 6, x => `PP for ${x.p.name}`, "PP fine");
    else if (isA(t, "PokemonLevelIncrementModifierType")) {
      // A permanent level, best spent on the lowest-level member.
      const low = alive.reduce((a, p) => (!a || p.level < a.level ? p : a), null);
      v = 12; why = low ? `+1 level (permanent) · ${low.name} Lv ${low.level}` : "+1 level (permanent)";
    } else if (isA(t, "AllPokemonLevelIncrementModifierType")) {
      v = 25; why = "+1 level for the whole party";
    } else if (isA(t, "PokemonPpUpModifierType")) {
      // Permanent extra PP on one move.
      if (users && !users.length) { v = -3; why = "every move's PP is maxed"; }
      else { v = (t.upPoints ?? 1) >= 3 ? 10 : 8; why = "more PP on a move (permanent)"; }
    } else if (isA(t, "AddVoucherModifierType")) {
      v += 8; why = "egg voucher — outlasts the run";
    } else if (isA(t, "AddPokeballModifierType")) {
      const n = balls[t.pokeballType] ?? 0;
      if (t.pokeballType === 4) { v = Math.max(v, 20); why = `Master Ball — catches anything · you have ${n}`; }
      else { v += n >= 10 ? -4 : n >= 5 ? 1 : 4; why = `you have ${n}`; }
    } else if (isA(t, "TempStatStageBoosterModifierType") || /LURE/.test(t.id ?? "")) {
      // Tier says nothing here: a few battles of a stat stage or more doubles never beats covering a real need.
      v = Math.min(v, 6) - 3; why = /LURE/.test(t.id ?? "") ? "more double battles for a while" : "only lasts a few battles";
    } else if (isA(t, "TmModifierType")) {
      const mv = learnMoveById(party, t.moveId);
      extra.moveId = t.moveId ?? null;
      extra.move = mv ? { name: mv.name, type: TYPES[mv.type] ?? "Normal", cat: ["physical", "special", "status"][mv.category] } : null;
      const users = tmLearners(t, alive);
      if (!users || !mv) { v = 5; why = "TM — can't check who learns it"; extra.tm = null; }
      else if (!users.length) { v = -6; why = "skip · nobody can learn it"; extra.users = []; extra.tm = "skip"; }
      else {
        // The learn card's own decision on every member that can learn it: best recipient wins.
        const advice = tmAdvice(mv, users, { double: !!s.currentBattle?.double, party });
        const b = advice.best;
        extra.users = users.map(p => p.name);
        extra.tm = advice.take ? "take" : advice.take === false ? "skip" : "maybe";
        if (b) extra.best = { icon: b.icon, name: b.name, forget: b.forget, gain: b.gain, ...(b.setup ? { setup: b.setup } : {}) };
        if (advice.take && b.setup) {
          // Setup moves: the member it suits best (boosts the stat it attacks with, no setup move yet).
          v = 10 + Math.min(10, Math.round(b.gain / 10));
          why = `setup TM for ${b.name} (${b.setup})${b.forget ? ` over ${b.forget}` : ""}`;
        } else if (advice.take) {
          v = 5 + Math.min(20, Math.round(b.gain / 6));
          why = `TM for ${b.name}${b.forget ? ` (over ${b.forget})` : " (free slot)"} · +${b.gain} power`;
        } else if (b) {
          v = 3; why = `TM for ${b.name} — ${b.reason}, your call`;
        } else if (advice.take === null) {
          v = 3; why = `status TM — ${users[0].name}${users.length > 1 ? ` +${users.length - 1}` : ""} can learn it`;
        } else {
          const c = advice.closest;
          v = -3; why = `skip · no upgrade for ${users.map(p => p.name).slice(0, 2).join("/")}${c?.against ? ` · ${c.name} keeps ${c.against}` : ""}`;
        }
      }
    } else if (isA(t, "EvolutionItemModifierType") || isA(t, "FormChangeItemModifierType")) {
      const evo = isA(t, "EvolutionItemModifierType");
      if (users) extra.users = users.map(p => p.name);
      if (users?.length) { v = evo ? 25 : 15; why = `${evo ? "evolves" : "changes form of"} ${users[0].name}`; }
      else if (users) { v = -5; why = `nobody can use it`; }
      else why = "check who can use it";
    } else if (t.id === "MEGA_BRACELET" || t.id === "DYNAMAX_BAND") {
      const mega = t.id === "MEGA_BRACELET";
      const can = alive.filter(p => hasFormKey(p, mega ? /^mega/ : /gigantamax/));
      extra.users = can.map(p => p.name);
      if (owned(mega ? "MegaEvolutionAccessModifier" : "GigantamaxAccessModifier")) { v = -5; why = "already have one"; }
      else if (can.length) { v = 20; why = `${can[0].name} can ${mega ? "Mega Evolve (needs its stone)" : "Gigantamax"}`; }
      else { v = -5; why = `nobody on the team can ${mega ? "Mega Evolve" : "Gigantamax"}`; }
    } else if (isA(t, "AttackTypeBoosterModifierType")) {
      const type = TYPES[t.moveType];
      const fits = (users ?? alive).filter(p => p.moveset.filter(Boolean).some(pm => {
        try { const m = pm.getMove(); return m.category !== 2 && m.type === t.moveType; } catch { return false; }
      }));
      extra.users = fits.map(p => p.name);
      if (fits.length) { v += 5; why = `boosts ${type} · ${fits[0].name}`; }
      else { v -= 5; why = users && !users.length ? "everyone's at max stack" : `no ${type} attacker`; }
    } else if (isA(t, "PokemonHeldItemModifierType")) {
      if (users) extra.users = users.map(p => p.name);
      if (users && !users.length) { v -= 8; why = "everyone's at max stack"; }
      else { v += 3; why = "held item"; }
    }
    return {
      name: t.name, icon: t.iconImage, v, why, covers,
      tier, tierName: TIER_NAMES[tier] ?? null, class: t.constructor?.name ?? null, id: t.id ?? null, ...extra,
    };
  });
  const pick = free.reduce((best, f, i) => (best < 0 || f.v > free[best].v ? i : best), -1);
  if (pick >= 0 && free[pick].v < 0) free[pick].why = `least bad · ${free[pick].why}`;
  const { buys, left: money } = planBuys(pick >= 0 ? free[pick].covers : null);
  for (const f of free) delete f.covers; // holds pokémon objects; the model must stay JSON-safe for the signature
  for (const b of buys) { delete b.pokemon; delete b.kind; delete b.t; }

  const reroll = pick >= 0 && free[pick].v < 10 && h.rerollCost > 0 && money >= h.rerollCost * 3
    ? `nothing good — reroll for $${h.rerollCost}?` : null;
  // How many shop items the money covers at all: often none early on, when the shop is irrelevant.
  const affordable = shop.filter(i => i.cost <= s.money).length;
  return { kind: "shop", money: s.money, left: money, buys, free, pick, reroll, bossNext, wave, affordable };
};
