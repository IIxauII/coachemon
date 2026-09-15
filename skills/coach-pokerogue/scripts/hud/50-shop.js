// Rewards-screen card model.
// Rewards screen (UiMode 6). Needs come from the party; items are judged by their game class and fields
// (restorePoints / restorePercent), and free rewards by the game's own rarity tier — nothing here depends on
// remembering what an item does.
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

const shopModel = (s, h) => {
  const party = s.getPlayerParty();
  const needs = {
    fainted: party.filter(p => p.hp <= 0),
    status: party.filter(p => p.hp > 0 && (p.status?.effect ?? 0) > 0),
    hurt: party.filter(p => p.hp > 0 && pct(p) < 60).sort((a, b) => pct(a) - pct(b)),
    lowPp: party.filter(p => p.hp > 0).map(p => ({
      p, moves: p.moveset.filter(Boolean).filter(m => m.getMovePp() - m.ppUsed <= Math.max(1, Math.floor(m.getMovePp() / 4))),
    })).filter(x => x.moves.length),
  };

  // Free rewards: tier sets the baseline, then what the party needs right now.
  const balls = s.pokeballCounts ?? {};
  const free = (h.options || []).map(o => {
    const t = o.modifierTypeOption.type;
    let v = (t.tier ?? 0) * 10;
    let why = TIER_NAMES[t.tier] ?? "";
    let covers = null;
    if (isRevive(t)) {
      if (needs.fainted.length) { v += 15; covers = ["fainted", needs.fainted[0]]; why = `revives ${needs.fainted[0].name}`; } else { v -= 5; why = "nobody fainted"; }
    } else if (isHeal(t)) {
      if (needs.hurt.length) { v += 12; covers = ["hurt", needs.hurt[0]]; why = `heals ${needs.hurt[0].name}`; } else { v -= 5; why = "party healthy"; }
    } else if (isA(t, "PokemonStatusHealModifierType")) {
      if (needs.status.length) { v += 12; covers = ["status", needs.status[0]]; why = `cures ${needs.status[0].name}`; } else { v -= 5; why = "no status"; }
    } else if (isPp(t) || isAllPp(t)) {
      if (needs.lowPp.length) { v += 10; covers = ["lowPp", needs.lowPp[0]]; why = `PP for ${needs.lowPp[0].p.name}`; } else { v -= 5; why = "PP fine"; }
    } else if (isA(t, "AddVoucherModifierType")) {
      v += 8; why = "egg voucher — outlasts the run";
    } else if (isA(t, "AddPokeballModifierType")) {
      const n = balls[t.pokeballType] ?? 0;
      v += n >= 10 ? -4 : 2; why = `you have ${n}`;
    } else if (isA(t, "TempStatStageBoosterModifierType") || /LURE/.test(t.id ?? "")) {
      v -= 3; why = "only lasts a few battles";
    } else if (isA(t, "TmModifierType")) {
      why = "TM — check who can learn it";
    } else if (isA(t, "PokemonHeldItemModifierType")) {
      v += 3; why = "held item";
    }
    return { name: t.name, icon: t.iconImage, v, why, covers };
  });
  const pick = free.reduce((best, f, i) => (best < 0 || f.v > free[best].v ? i : best), -1);
  if (pick >= 0 && free[pick].v < 0) free[pick].why = `least bad · ${free[pick].why}`;
  const covered = pick >= 0 ? free[pick].covers : null;
  const skip = (kind, target) => covered && covered[0] === kind && (covered[1] === target || covered[1]?.p === target);
  for (const f of free) delete f.covers; // holds pokémon objects; the model must stay JSON-safe for the signature

  // Shop: buy for the worst needs first while money lasts. Buying must happen before taking the free reward.
  const shop = (h.shopOptionsRows || []).flat().map(o => ({ t: o.modifierTypeOption.type, cost: o.modifierTypeOption.cost }));
  let money = s.money;
  const buys = [];
  const buy = (list, target, why) => {
    const item = list.filter(i => i.cost <= money)[0];
    if (!item) return;
    money -= item.cost;
    buys.push({ name: item.t.name, icon: item.t.iconImage, cost: item.cost, target: iconOf(target), targetName: target.name, why });
  };
  const byCost = pred => shop.filter(i => pred(i.t)).sort((a, b) => a.cost - b.cost);
  for (const p of needs.fainted) if (!skip("fainted", p)) buy(byCost(isRevive), p, "fainted");
  for (const p of needs.status) if (!skip("status", p)) buy(byCost(t => isA(t, "PokemonStatusHealModifierType")), p, "status");
  for (const p of needs.hurt) {
    if (skip("hurt", p)) continue;
    const missing = p.getMaxHp() - p.hp;
    const heals = byCost(isHeal);
    // Cheapest that tops it up; failing that, the biggest heal affordable.
    const enough = heals.filter(i => healOn(i.t, p) >= missing * 0.8);
    buy(enough.length ? enough : heals.sort((a, b) => healOn(b.t, p) - healOn(a.t, p)), p, `${pct(p)}% HP`);
  }
  for (const { p, moves } of needs.lowPp) {
    if (skip("lowPp", p)) continue;
    const m = moves[0];
    const missing = m.ppUsed;
    const list = moves.length >= 2 ? byCost(isAllPp) : byCost(t => isPp(t) && (t.restorePoints === -1 || t.restorePoints >= missing));
    buy(list, p, moves.length >= 2 ? `${moves.length} moves low` : `${m.getName()} ${m.getMovePp() - m.ppUsed}/${m.getMovePp()}`);
  }

  const reroll = pick >= 0 && free[pick].v < 10 && h.rerollCost > 0 && money >= h.rerollCost * 3
    ? `nothing good — reroll for $${h.rerollCost}?` : null;
  return { kind: "shop", money: s.money, left: money, buys, free, pick, reroll };
};
