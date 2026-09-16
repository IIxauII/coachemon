// Reward context: what a held item, mint, EXP item, candy, vitamin or evolution item is worth to *this* party.
// 50-shop.js asks `rewardValue` first and falls back to its own need / TM / ball / tier logic when it answers null.
// Every item is judged on the member it would go to — the best holder among those the game's select filter lets
// hold it — with that member named in the reason. Effects, stack limits and the level cap are the game's own
// (references/game-code.md §15); the weights are first cuts on the rewards card's scale, where covering a real need
// is 10–30 and the tier alone is 10 a step.
const { rewardContext, rewardValue } = (() => {
  const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const STAT_SHORT = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
  // MoveId values the game's own pool weights check (init-modifier-pools.ts): status-orb users and weather / terrain
  // setters. MoveFlags.MAKES_CONTACT is bit 0.
  const FACADE = 263, PSYCHO_SHIFT = 375;
  const FIELD_MOVES = new Set([201, 240, 241, 258, 580, 581, 604, 678, 912, 914]);
  const FIELD_ABILITIES = new Set(["Drought", "Orichalcum Pulse", "Drizzle", "Sand Stream", "Sand Spit", "Snow Warning", "Electric Surge",
    "Hadron Engine", "Psychic Surge", "Grassy Surge", "Seed Sower", "Misty Surge"]);
  const ORB = {
    TOXIC_ORB: { specific: ["Toxic Boost", "Poison Heal"], opposite: ["Flare Boost"], immuneTypes: ["Poison", "Steel"],
      immuneAbilities: ["Immunity", "Pastel Veil", "Comatose", "Purifying Salt"] },
    FLAME_ORB: { specific: ["Flare Boost"], opposite: ["Toxic Boost", "Poison Heal"], immuneTypes: ["Fire"],
      immuneAbilities: ["Water Veil", "Water Bubble", "Thermal Exchange", "Comatose", "Purifying Salt"] },
  };
  const STATUS_ABILITIES = ["Quick Feet", "Guts", "Marvel Scale", "Magic Guard"];
  // SpeciesStatBoosterModifierTypeGenerator.items: [SpeciesId…], the stats it doubles.
  const SPECIES_BOOSTERS = {
    LIGHT_BALL: [[25], [1, 3]], THICK_CLUB: [[104, 105, 2105], [1]], METAL_POWDER: [[132], [2]], QUICK_POWDER: [[132], [5]],
    DEEP_SEA_SCALE: [[366], [4]], DEEP_SEA_TOOTH: [[366], [3]],
  };
  const LEEK_SPECIES = new Set([83, 865, 4083]);
  // BerryType: SITRUS, LUM, ENIGMA, LIECHI, GANLON, PETAYA, APICOT, SALAC, LANSAT, STARF, LEPPA. Pinch berries raise
  // the stat at index − 2 (Liechi → Atk …) below a quarter HP.
  const BERRY_NAMES = ["Sitrus", "Lum", "Enigma", "Liechi", "Ganlon", "Petaya", "Apicot", "Salac", "Lansat", "Starf", "Leppa"];

  const movesOf = p => (p.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(Boolean);
  const attacks = p => movesOf(p).filter(mv => mv.category !== 2);
  const statOf = (p, i) => tryDo(() => p.getStat(i, false), 0) || tryDo(() => p.getStat(i), 0);
  // The stat a member attacks with: the higher of Atk and SpA.
  const mainStat = p => (statOf(p, 1) >= statOf(p, 3) ? 1 : 3);
  const bulk = p => tryDo(() => p.getMaxHp(), 0) * (statOf(p, 2) + statOf(p, 4)) / 2;
  const has = (p, names) => abilitiesOf(p).some(a => names.includes(a));
  const typesSafe = p => tryDo(() => typesOf(p), []);
  const flagged = (mv, bit) => tryDo(() => moveHasFlag(mv, bit), false);

  // How much each stat matters to a member, for natures and vitamins: the stat it attacks with most, Speed next, its
  // bulk after that, the attack stat it doesn't use least of all.
  const statWeight = (p, i) => {
    const main = mainStat(p);
    if (i === main) return 1;
    if (i === 5) return 0.6;
    if (i === 1 || i === 3) return attacks(p).some(mv => mv.category === (i === 1 ? 0 : 1)) ? 0.35 : 0.05;
    return 0.4;
  };
  const natureValue = (p, n) => {
    const fx = natureOf(n);
    return fx.upStat ? 0.1 * (statWeight(p, fx.upStat) - statWeight(p, fx.downStat)) : 0;
  };

  // ---- The party as the rewards card sees it. The **carry** is the member the run leans on: the highest level (EXP
  // follows whoever fights), ties to the harder hitter. The **level cap** is `getMaxExpLevel()` — EXP past it is lost
  // and a member at it gets no share at all, while a Rare Candy ignores it.
  const rewardContext = (s, alive, { bossNext = false, gauntlet = false, double = 0 } = {}) => {
    const wave = s.currentBattle?.waveIndex ?? 0;
    const capOf = () => {
      const w = Math.ceil((wave || 1) / 10) * 10;
      return Math.ceil((1 + w / 2 + (w / 25) ** 2) * 1.2 / 2) * 2 + 2;
    };
    const cap = tryDo(() => s.getMaxExpLevel(), null) ?? capOf();
    const carry = [...alive].sort((a, b) => b.level - a.level || statOf(b, mainStat(b)) - statOf(a, mainStat(a)))[0] ?? null;
    const maxBulk = Math.max(1, ...alive.map(bulk));
    const maxSpeed = Math.max(1, ...alive.map(p => statOf(p, 5)));
    const held = p => (s.modifiers ?? []).filter(m => m?.pokemonId != null && m.pokemonId === p.id);
    const holds = (p, id) => held(p).find(m => m.type?.id === id) ?? null;
    const stacks = (p, id) => tryDo(() => holds(p, id)?.getStackCount(), holds(p, id)?.stackCount ?? 0) ?? 0;
    const owned = id => (s.modifiers ?? []).some(m => m?.type?.id === id);
    // A member's share of the fight: the carry in full, the rest by how close to its level they are.
    const role = p => (!carry || p === carry ? 1 : Math.max(0.4, Math.min(1, p.level / Math.max(1, carry.level))));
    return { s, wave, cap, carry, alive, bossNext, gauntlet, double, held, holds, stacks, owned, role,
      bulkShare: p => bulk(p) / maxBulk, speedShare: p => statOf(p, 5) / maxSpeed };
  };

  // The member an item does the most for, and what it is worth there: `fit(p)` → [value, reason] or null.
  const bestHolder = (users, ctx, fit) => {
    let best = null;
    for (const p of users) {
      const r = fit(p);
      if (!r) continue;
      const v = r[0] * ctx.role(p);
      if (!best || v > best.v + 1e-9 || (Math.abs(v - best.v) < 1e-9 && p === ctx.carry)) best = { p, v, why: r[1] };
    }
    return best;
  };
  const verdict = (best, none, users) => (best
    ? { v: Math.round(best.v), why: best.why, holder: { icon: iconOf(best.p), name: best.p.name }, users: users.map(p => p.name) }
    : { v: -4, why: none, users: users.map(p => p.name) });
  const stackText = (ctx, p, id, max) => {
    const n = ctx.stacks(p, id);
    return n ? ` (${n + 1}/${max})` : "";
  };

  // ---- Held items by id. Each: (p, ctx, t) → [value, reason] or null when it does nothing for that member.
  const HELD = {
    LEFTOVERS: (p, c) => [8 + 10 * c.bulkShare(p), `${p.name} · 1/16 HP a turn${stackText(c, p, "LEFTOVERS", 4)}`],
    SHELL_BELL: (p, c) => attacks(p).length && [6 + 8 * (p === c.carry ? 1 : 0.6), `${p.name} · heals 1/8 of damage dealt${stackText(c, p, "SHELL_BELL", 4)}`],
    FOCUS_BAND: (p, c) => [6 + 4 * (1 - c.bulkShare(p)), `${p.name} · +10% to survive a KO hit${stackText(c, p, "FOCUS_BAND", 5)}`],
    // Moving first matters to the slow; flinching needs moving first, and rolls once a hit.
    QUICK_CLAW: (p, c) => attacks(p).length && [4 + 8 * (1 - c.speedShare(p)), `${p.name} · 10% to move first${stackText(c, p, "QUICK_CLAW", 3)}`],
    KINGS_ROCK: (p, c) => attacks(p).length && [3 + 6 * c.speedShare(p) + (attacks(p).some(mv => hasAttr(mv, "MultiHitAttr")) ? 3 : 0),
      `${p.name} · 10% flinch a hit${stackText(c, p, "KINGS_ROCK", 3)}`],
    REVIVER_SEED: (p, c) => [14 + (c.gauntlet ? 8 : c.bossNext ? 4 : 0), `${p.name} · a second life at ½ HP`],
    SCOPE_LENS: p => attacks(p).length && [6 + ((has(p, ["Super Luck", "Sniper"]) || attacks(p).some(mv => hasAttr(mv, "HighCritAttr"))) ? 6 : 0),
      `${p.name} · crit 1/24 → 1/8`],
    LEEK: p => (LEEK_SPECIES.has(p.species?.speciesId) || LEEK_SPECIES.has(p.fusionSpecies?.speciesId)) && [18, `${p.name} · +2 crit stages`],
    EVIOLITE: (p, c) => tryDo(() => p.species.getEvolutionLevels().length, 0) > 0 && [8 + 6 * c.bulkShare(p), `${p.name} · ×1.5 Def/SpD until it evolves`],
    MYSTICAL_ROCK: p => (has(p, [...FIELD_ABILITIES]) || (p.moveset ?? []).some(m => FIELD_MOVES.has(m?.moveId))) && [9, `${p.name} · its weather/terrain lasts 2 turns longer`],
    BATON: p => movesOf(p).some(mv => (mv.attrs ?? []).some(a => a.constructor?.name === "StatStageChangeAttr" && a.selfTarget)) && [4, `${p.name} · passes its boosts on a switch`],
    // Soul Dew pushes the nature further both ways: worth it only when the nature already favours the stats it uses.
    SOUL_DEW: (p, c) => {
      const n = tryDo(() => p.getNature(), p.nature);
      const fit = n == null ? 0 : natureValue(p, n);
      return fit > 0 && [4 + 80 * fit, `${p.name} · ${natureOf(n).name} nature 10% stronger${stackText(c, p, "SOUL_DEW", 10)}`];
    },
    GRIP_CLAW: (p, c) => {
      const share = attacks(p).filter(mv => flagged(mv, 1)).length / Math.max(1, attacks(p).length);
      return share > 0 && [3 + 6 * share, `${p.name} · 10% to steal an item on contact${stackText(c, p, "GRIP_CLAW", 5)}`];
    },
    MINI_BLACK_HOLE: p => [22, `${p.name} · steals an item every turn`],
    WIDE_LENS: (p, c) => {
      const miss = Math.max(0, ...attacks(p).map(mv => (mv.accuracy > 0 ? (100 - mv.accuracy) / 100 : 0)));
      return miss > 0 && [3 + 60 * Math.min(0.15, miss), `${p.name} · +5 accuracy${stackText(c, p, "WIDE_LENS", 3)}`];
    },
    // Multi Lens splits the same damage over more hits (the first ×(1 − ¼·stacks), each extra ×¼): no more damage,
    // only more rolls for flinch, steals, contact abilities and Shell Bell.
    MULTI_LENS: (p, c) => attacks(p).length && [6 + (["KINGS_ROCK", "GRIP_CLAW", "SHELL_BELL"].some(id => c.stacks(p, id)) ? 4 : 0),
      `${p.name} · an extra hit (same total damage)`],
    SOOTHE_BELL: p => [1, `${p.name} · friendship grows faster`],
    GOLDEN_PUNCH: p => attacks(p).length && [5, `${p.name} · money from damage dealt`],
    // Lucky and Golden Eggs only come from Mystery Encounters: EXP for the holder, nothing at the level cap.
    LUCKY_EGG: (p, c) => p.level < c.cap && [4 + 4 * Math.min(1, (c.cap - p.level) / 10), `${p.name} · +40% EXP, ${c.cap - p.level} levels under the cap`],
    GOLDEN_EGG: (p, c) => p.level < c.cap && [6 + 6 * Math.min(1, (c.cap - p.level) / 10), `${p.name} · +100% EXP, ${c.cap - p.level} levels under the cap`],
  };
  for (const id of Object.keys(ORB)) {
    const o = ORB[id];
    HELD[id] = (p, c) => {
      if (c.holds(p, "TOXIC_ORB") || c.holds(p, "FLAME_ORB")) return null;
      const statusable = !typesSafe(p).some(t => o.immuneTypes.includes(t)) && !has(p, o.immuneAbilities);
      const moves = (p.moveset ?? []).some(m => m?.moveId === FACADE || m?.moveId === PSYCHO_SHIFT);
      const good = statusable && (has(p, o.specific) || (has(p, STATUS_ABILITIES) && !has(p, o.opposite)) || moves);
      const reason = abilitiesOf(p).find(a => o.specific.includes(a)) ?? abilitiesOf(p).find(a => STATUS_ABILITIES.includes(a))
        ?? ((p.moveset ?? []).some(m => m?.moveId === FACADE) ? "Facade" : "Psycho Shift");
      return good && [14, `${p.name} · ${reason} wants the status`];
    };
  }
  const berry = (t, p, c) => {
    const b = t.berryType;
    const name = BERRY_NAMES[b] ?? "berry";
    if (b === 0 || b === 2) return [3 + 3 * c.bulkShare(p), `${p.name} · ${name} heals ¼ HP`];
    if (b === 1) return [4, `${p.name} · Lum cures a status once`];
    if (b === 10) return [2 + (attacks(p).some(mv => (mv.pp ?? 20) <= 10) ? 2 : 0), `${p.name} · Leppa refills a move at 0 PP`];
    if (b >= 3 && b <= 7) {
      const stat = b - 2;
      return [(stat === mainStat(p) || stat === 5 ? 4 : 1) + (has(p, ["Gluttony", "Ripen"]) ? 2 : 0), `${p.name} · +1 ${STAT_SHORT[stat]} in a pinch`];
    }
    return [2, `${p.name} · ${name} in a pinch`];
  };

  // ---- The verdict for one reward, or null for anything this file doesn't judge.
  const rewardValue = (t, ctx, users) => {
    const id = t.id ?? "";
    const pool = users ?? ctx.alive;
    const cls = n => isA(t, n);
    if (users && !users.length && cls("PokemonHeldItemModifierType")) return { v: -8, why: "everyone's at max stack", users: [] };

    if (cls("BerryModifierType")) return verdict(bestHolder(pool, ctx, p => berry(t, p, ctx)), "no use for the berry", pool);
    if (cls("AttackTypeBoosterModifierType")) {
      const type = TYPES[t.moveType];
      const fit = p => {
        const moves = attacks(p).filter(mv => mv.type === t.moveType);
        if (!moves.length) return null;
        const stab = typesSafe(p).includes(type);
        return [6 + (stab ? 6 : 2) + (mainStat(p) === (moves[0].category === 0 ? 1 : 3) ? 2 : 0), `${p.name} · +20% ${type} for ${moves[0].name}`];
      };
      return verdict(bestHolder(pool, ctx, fit), `no ${type} attacker`, pool);
    }
    if (cls("SpeciesStatBoosterModifierType")) {
      const [species, stats] = SPECIES_BOOSTERS[t.key] ?? [[], []];
      const fit = p => (species.includes(p.species?.speciesId) || species.includes(p.fusionSpecies?.speciesId))
        && [18, `${p.name} · ×2 ${stats.map(i => STAT_SHORT[i]).join("/")}`];
      return verdict(bestHolder(pool, ctx, fit), "nobody it works for", pool);
    }
    // Vitamins: +10% base stat a stack, up to the stat's IV — the select filter already drops a member at its limit.
    if (cls("BaseStatBoosterModifierType")) {
      const stat = t.stat ?? 0;
      const fit = p => [3 + 9 * (stat === 0 ? 0.45 : statWeight(p, stat)), `${p.name} · +10% base ${STAT_SHORT[stat]}${p === ctx.carry ? " (carry)" : ""}`];
      return verdict(bestHolder(pool, ctx, fit), "nobody can take more", pool);
    }
    if (cls("PokemonHeldItemModifierType") && HELD[id]) {
      return verdict(bestHolder(pool, ctx, p => HELD[id](p, ctx, t) || null), `does nothing for this team`, pool);
    }

    if (cls("PokemonNatureChangeModifierType")) {
      const n = t.nature;
      const fx = natureOf(n);
      const label = `${fx.name}${fx.up ? ` +${fx.up} −${fx.down}` : " (neutral)"}`;
      const fit = p => {
        const now = tryDo(() => p.getNature(), p.nature);
        const delta = natureValue(p, n) - (now == null ? 0 : natureValue(p, now));
        return delta > 0.005 && [Math.min(22, 4 + 120 * delta), `${p.name} · ${label}${now == null ? "" : `, was ${natureOf(now).name}`}`];
      };
      const best = bestHolder(pool, ctx, fit);
      return best ? verdict(best, "", pool) : { v: -3, why: `${label} · no better for anyone`, users: pool.map(p => p.name) };
    }
    if (id === "ABILITY_CHARM") {
      return { v: ctx.wave >= 150 ? 1 : 5, why: "hidden abilities on wild mons more often (catching only)" };
    }

    // EXP. Members at the cap get nothing and their share isn't passed on, so every EXP item is worth the members
    // still under it — the carry at the cap gains nothing from any of them.
    const under = ctx.alive.filter(p => p.level < ctx.cap);
    if (id === "EXP_SHARE") {
      const bench = under.filter(p => p !== ctx.carry);
      return bench.length
        ? { v: 6 + 3 * Math.min(3, bench.length), why: `EXP for the bench · ${bench.length} under the Lv ${ctx.cap} cap` }
        : { v: 1, why: `nobody on the bench under the Lv ${ctx.cap} cap` };
    }
    if (cls("ExpBoosterModifierType")) {
      return under.length
        ? { v: 4 + 2 * Math.min(3, under.length) + ((t.boostPercent ?? 25) >= 60 ? 3 : 0), why: `more EXP · ${under.length} under the Lv ${ctx.cap} cap` }
        : { v: 1, why: `whole party at the Lv ${ctx.cap} cap` };
    }
    if (id === "CANDY_JAR") return { v: 4, why: "Rare Candies give an extra level" };
    // Rare Candy ignores the cap. Best on a member one level short of evolving, then on the carry once EXP can't
    // level it, then on whoever is furthest behind.
    if (cls("PokemonLevelIncrementModifierType")) {
      const evolves = ctx.alive.find(p => tryDo(() => p.species.getEvolutionLevels(), []).some(([, lv]) => lv === p.level + 1)
        && !p.pauseEvolutions && !ctx.holds(p, "EVIOLITE"));
      if (evolves) return { v: 18, why: `${evolves.name} · evolves at Lv ${evolves.level + 1}`, holder: { icon: iconOf(evolves), name: evolves.name } };
      const c = ctx.carry;
      if (c && c.level >= ctx.cap) return { v: 12, why: `${c.name} · Lv ${c.level}, at the Lv ${ctx.cap} cap where EXP can't level it`, holder: { icon: iconOf(c), name: c.name } };
      const low = ctx.alive.reduce((a, p) => (!a || p.level < a.level ? p : a), null);
      return { v: 12, why: low ? `${low.name} · Lv ${low.level}, furthest behind` : "+1 level (permanent)", ...(low ? { holder: { icon: iconOf(low), name: low.name } } : {}) };
    }
    if (cls("AllPokemonLevelIncrementModifierType")) {
      const capped = ctx.alive.filter(p => p.level >= ctx.cap).length;
      return { v: 25, why: `+1 level for the whole party${capped ? ` · ${capped} at the Lv ${ctx.cap} cap` : ""}` };
    }
    // Evolution items: the select filter already checks the evolution's level and condition, and it evolves at once.
    // Prefer the carry; an Eviolite holder gives up its boost.
    if (cls("EvolutionItemModifierType") && users) {
      if (!users.length) return { v: -5, why: "nobody can use it", users: [] };
      const fit = p => ctx.holds(p, "EVIOLITE") ? [12, `${p.name} · evolves now, losing its Eviolite boost`] : [22 + (p === ctx.carry ? 3 : 0), `${p.name} · evolves now`];
      const best = [...users].map(p => ({ p, r: fit(p) })).sort((a, b) => b.r[0] - a.r[0])[0];
      return { v: best.r[0], why: best.r[1], holder: { icon: iconOf(best.p), name: best.p.name }, users: users.map(p => p.name) };
    }
    if (cls("TerastallizeModifierType")) {
      const type = TYPES[t.teraType] ?? "Stellar";
      const fit = p => {
        if (p.teraType === t.teraType) return null;
        const moves = attacks(p).filter(mv => mv.type === t.teraType);
        return moves.length ? [5 + (typesSafe(p).includes(type) ? 3 : 5), `${p.name} · Tera ${type} powers ${moves[0].name}`] : [2, `${p.name} · Tera ${type} (defensive only)`];
      };
      return verdict(bestHolder(pool, ctx, fit), "nobody can change Tera type", pool);
    }
    // Memory Mushroom: the member whose relearn list holds the biggest upgrade, by the learn card's own decision
    // (49-audit's `relearnBest`). Nothing worth relearning is worth little: the mushroom is spent on pick.
    if (cls("RememberMoveModifierType") && users) {
      if (!users.length) return { v: -3, why: "nobody has a move to relearn", users: [] };
      const fixes = users.map(p => ({ p, fix: tryDo(() => relearnBest(p, ctx.alive.includes(p) ? ctx.alive : [...ctx.alive, p], ctx.double ?? 0)) }))
        .filter(x => x.fix).sort((a, b) => b.fix.gain * ctx.role(b.p) - a.fix.gain * ctx.role(a.p));
      const best = fixes[0];
      if (!best) return { v: 1, why: "no relearnable move beats what they know", users: users.map(p => p.name) };
      const f = best.fix;
      return { v: 5 + Math.min(15, Math.round(f.gain * ctx.role(best.p) / 6)),
        why: `${best.p.name} · relearn ${f.move}${f.forget ? ` over ${f.forget}` : ""} · +${f.gain} power`,
        holder: { icon: iconOf(best.p), name: best.p.name }, users: users.map(p => p.name) };
    }
    return null;
  };

  return { rewardContext, rewardValue };
})();
