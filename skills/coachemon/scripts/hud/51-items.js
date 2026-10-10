// What a held item, mint, EXP item, candy, vitamin or evolution item is worth to *this* party, judged on the member
// it would go to and on the rewards card's scale of 10 a tier. What each item does is the game's (game-code.md §15).
import { TYPES, abilitiesOf, hasAttr, iconOf, natureOf, typesOf } from "./01-core.js";
import { splicerReward } from "./49-fusion.js";
import { relearnBest } from "./50-audit.js";

// Subclasses count. Class names survive minification (game-code.md §22).
export const isA = (t, name) => {
  for (let p = t && Object.getPrototypeOf(t); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (p.constructor?.name === name) return true;
  }
  return false;
};

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const STAT_SHORT = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
// The game's own pool weights for Mystical Rock and the status orbs (game-code.md §15).
const FIELD_MOVES = new Set([MoveId.SUNNY_DAY, MoveId.RAIN_DANCE, MoveId.SANDSTORM, MoveId.SNOWSCAPE, MoveId.HAIL, MoveId.CHILLY_RECEPTION,
  MoveId.ELECTRIC_TERRAIN, MoveId.PSYCHIC_TERRAIN, MoveId.GRASSY_TERRAIN, MoveId.MISTY_TERRAIN]);
const FIELD_ABILITIES = new Set(["Drought", "Orichalcum Pulse", "Drizzle", "Sand Stream", "Sand Spit", "Snow Warning", "Electric Surge",
  "Hadron Engine", "Psychic Surge", "Grassy Surge", "Seed Sower", "Misty Surge"]);
const ORB = {
  TOXIC_ORB: { specific: ["Toxic Boost", "Poison Heal"], opposite: ["Flare Boost"], immuneTypes: ["Poison", "Steel"],
    immuneAbilities: ["Immunity", "Pastel Veil", "Comatose", "Purifying Salt"] },
  FLAME_ORB: { specific: ["Flare Boost"], opposite: ["Toxic Boost", "Poison Heal"], immuneTypes: ["Fire"],
    immuneAbilities: ["Water Veil", "Water Bubble", "Thermal Exchange", "Comatose", "Purifying Salt"] },
};
const STATUS_ABILITIES = ["Quick Feet", "Guts", "Marvel Scale", "Magic Guard"];
// `[species, stats it doubles]` (game-code.md §15).
const SPECIES_BOOSTERS = {
  LIGHT_BALL: [[SpeciesId.PIKACHU], [Stat.ATK, Stat.SPATK]], THICK_CLUB: [[SpeciesId.CUBONE, SpeciesId.MAROWAK, SpeciesId.ALOLA_MAROWAK], [Stat.ATK]],
  METAL_POWDER: [[SpeciesId.DITTO], [Stat.DEF]], QUICK_POWDER: [[SpeciesId.DITTO], [Stat.SPD]],
  DEEP_SEA_SCALE: [[SpeciesId.CLAMPERL], [Stat.SPDEF]], DEEP_SEA_TOOTH: [[SpeciesId.CLAMPERL], [Stat.SPATK]],
};
const LEEK_SPECIES = new Set([SpeciesId.FARFETCHD, SpeciesId.SIRFETCHD, SpeciesId.GALAR_FARFETCHD]);
// Indexed by `BerryType`.
const BERRY_NAMES = ["Sitrus", "Lum", "Enigma", "Liechi", "Ganlon", "Petaya", "Apicot", "Salac", "Lansat", "Starf", "Leppa"];

const movesOf = p => (p.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(Boolean);
const attacks = p => movesOf(p).filter(mv => mv.category !== MoveCategory.STATUS);
const statOf = (p, i) => tryDo(() => p.getStat(i, false), 0) || tryDo(() => p.getStat(i), 0);
const mainStat = p => (statOf(p, Stat.ATK) >= statOf(p, Stat.SPATK) ? Stat.ATK : Stat.SPATK);
const bulk = p => tryDo(() => p.getMaxHp(), 0) * (statOf(p, Stat.DEF) + statOf(p, Stat.SPDEF)) / 2;
const has = (p, names) => abilitiesOf(p).some(a => names.includes(a));
const typesSafe = p => tryDo(() => typesOf(p), []);

const statWeight = (p, i) => {
  const main = mainStat(p);
  if (i === main) return 1;
  if (i === Stat.SPD) return 0.6;
  if (i === Stat.ATK || i === Stat.SPATK) return attacks(p).some(mv => mv.category === (i === Stat.ATK ? MoveCategory.PHYSICAL : MoveCategory.SPECIAL)) ? 0.35 : 0.05;
  return 0.4;
};
const natureValue = (p, n) => {
  const fx = natureOf(n);
  return fx.upStat ? 0.1 * (statWeight(p, fx.upStat) - statWeight(p, fx.downStat)) : 0;
};

// `run` is the run read the shop was built in, which the Splicer's own value is judged inside: the fusion judgment
// runs in a run read and nowhere else (#589). A context built without one prices no Splicer.
export const rewardContext = (s, alive, { bossNext = false, gauntlet = false, double = 0, run = null } = {}) => {
  const wave = s.currentBattle?.waveIndex ?? 0;
  // game-less-backed
  const capOf = () => {
    const w = Math.ceil((wave || 1) / 10) * 10;
    // The difficulty wave `getMaxExpLevel` caps by (game-code.md §15).
    const d = s.gameMode?.isDaily ? w + 30 + Math.floor(w / 5) : w;
    return Math.ceil((1 + d / 2 + (d / 25) ** 2) * 1.2 / 2) * 2 + 2;
  };
  const cap = tryDo(() => s.getMaxExpLevel(), null) ?? capOf();
  const carry = [...alive].sort((a, b) => b.level - a.level || statOf(b, mainStat(b)) - statOf(a, mainStat(a)))[0] ?? null;
  const maxBulk = Math.max(1, ...alive.map(bulk));
  const maxSpeed = Math.max(1, ...alive.map(p => statOf(p, Stat.SPD)));
  const held = p => (s.modifiers ?? []).filter(m => m?.pokemonId != null && m.pokemonId === p.id);
  const holds = (p, id) => held(p).find(m => m.type?.id === id) ?? null;
  const stacks = (p, id) => tryDo(() => holds(p, id)?.getStackCount(), holds(p, id)?.stackCount ?? 0) ?? 0;
  const owned = id => (s.modifiers ?? []).some(m => m?.type?.id === id);
  const role = p => (!carry || p === carry ? 1 : Math.max(0.4, Math.min(1, p.level / Math.max(1, carry.level))));
  return { s, run, wave, cap, carry, alive, bossNext, gauntlet, double, held, holds, stacks, owned, role,
    bulkShare: p => bulk(p) / maxBulk, speedShare: p => statOf(p, Stat.SPD) / maxSpeed };
};

// `fit(p)` → `[value, reason]`, or a falsy value where the item does nothing for `p`.
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

// By held-item id: `(p, ctx, t)` → `[value, reason]`, or `false` where it does nothing for `p` — never the `0` a
// bare `attacks(p).length &&` would hand back.
// @only tests: HELD
export const HELD = {
  LEFTOVERS: (p, c) => [8 + 10 * c.bulkShare(p), `${p.name} · 1/16 HP a turn${stackText(c, p, "LEFTOVERS", 4)}`],
  SHELL_BELL: (p, c) => attacks(p).length > 0 && [6 + 8 * (p === c.carry ? 1 : 0.6), `${p.name} · heals 1/8 of damage dealt${stackText(c, p, "SHELL_BELL", 4)}`],
  FOCUS_BAND: (p, c) => [6 + 4 * (1 - c.bulkShare(p)), `${p.name} · +10% to survive a KO hit${stackText(c, p, "FOCUS_BAND", 5)}`],
  QUICK_CLAW: (p, c) => attacks(p).length > 0 && [4 + 8 * (1 - c.speedShare(p)), `${p.name} · 10% to move first${stackText(c, p, "QUICK_CLAW", 3)}`],
  KINGS_ROCK: (p, c) => attacks(p).length > 0 && [3 + 6 * c.speedShare(p) + (attacks(p).some(mv => hasAttr(mv, "MultiHitAttr")) ? 3 : 0),
    `${p.name} · 10% flinch a hit${stackText(c, p, "KINGS_ROCK", 3)}`],
  REVIVER_SEED: (p, c) => [14 + (c.gauntlet ? 8 : c.bossNext ? 4 : 0), `${p.name} · a second life at ½ HP`],
  SCOPE_LENS: p => attacks(p).length > 0 && [6 + ((has(p, ["Super Luck", "Sniper"]) || attacks(p).some(mv => hasAttr(mv, "HighCritAttr"))) ? 6 : 0),
    `${p.name} · crit 1/24 → 1/8`],
  LEEK: p => (LEEK_SPECIES.has(p.species?.speciesId) || LEEK_SPECIES.has(p.fusionSpecies?.speciesId)) && [18, `${p.name} · +2 crit stages`],
  EVIOLITE: (p, c) => tryDo(() => p.species.getEvolutionLevels().length, 0) > 0 && [8 + 6 * c.bulkShare(p), `${p.name} · ×1.5 Def/SpD until it evolves`],
  MYSTICAL_ROCK: p => (has(p, [...FIELD_ABILITIES]) || (p.moveset ?? []).some(m => FIELD_MOVES.has(m?.moveId))) && [9, `${p.name} · its weather/terrain lasts 2 turns longer`],
  BATON: p => movesOf(p).some(mv => (mv.attrs ?? []).some(a => a.constructor?.name === "StatStageChangeAttr" && a.selfTarget)) && [4, `${p.name} · passes its boosts on a switch`],
  SOUL_DEW: (p, c) => {
    const n = tryDo(() => p.getNature(), p.nature);
    const fit = n == null ? 0 : natureValue(p, n);
    return fit > 0 && [4 + 80 * fit, `${p.name} · ${natureOf(n).name} nature 10% stronger${stackText(c, p, "SOUL_DEW", 10)}`];
  },
  // Any attack rolls it, contact or not, whatever its class name says (game-code.md §15).
  GRIP_CLAW: (p, c) => attacks(p).length > 0 && [9, `${p.name} · 10% to steal an item when it attacks${stackText(c, p, "GRIP_CLAW", 5)}`],
  MINI_BLACK_HOLE: p => [22, `${p.name} · steals an item every turn`],
  WIDE_LENS: (p, c) => {
    const miss = Math.max(0, ...attacks(p).map(mv => (mv.accuracy > 0 ? (100 - mv.accuracy) / 100 : 0)));
    return miss > 0 && [3 + 60 * Math.min(0.15, miss), `${p.name} · +5 accuracy${stackText(c, p, "WIDE_LENS", 3)}`];
  },
  // No more damage, only more hits to roll on (game-code.md §15).
  MULTI_LENS: (p, c) => attacks(p).length > 0 && [6 + (["KINGS_ROCK", "GRIP_CLAW", "SHELL_BELL"].some(id => c.stacks(p, id)) ? 4 : 0),
    `${p.name} · an extra hit (same total damage)`],
  SOOTHE_BELL: p => [1, `${p.name} · friendship grows faster`],
  GOLDEN_PUNCH: p => attacks(p).length > 0 && [5, `${p.name} · money from damage dealt`],
  LUCKY_EGG: (p, c) => p.level < c.cap && [4 + 4 * Math.min(1, (c.cap - p.level) / 10), `${p.name} · +40% EXP, ${c.cap - p.level} levels under the cap`],
  GOLDEN_EGG: (p, c) => p.level < c.cap && [6 + 6 * Math.min(1, (c.cap - p.level) / 10), `${p.name} · +100% EXP, ${c.cap - p.level} levels under the cap`],
};
for (const id of Object.keys(ORB)) {
  const o = ORB[id];
  HELD[id] = (p, c) => {
    if (c.holds(p, "TOXIC_ORB") || c.holds(p, "FLAME_ORB")) return null;
    const statusable = !typesSafe(p).some(t => o.immuneTypes.includes(t)) && !has(p, o.immuneAbilities);
    const moves = (p.moveset ?? []).some(m => m?.moveId === MoveId.FACADE || m?.moveId === MoveId.PSYCHO_SHIFT);
    const good = statusable && (has(p, o.specific) || (has(p, STATUS_ABILITIES) && !has(p, o.opposite)) || moves);
    const reason = abilitiesOf(p).find(a => o.specific.includes(a)) ?? abilitiesOf(p).find(a => STATUS_ABILITIES.includes(a))
      ?? ((p.moveset ?? []).some(m => m?.moveId === MoveId.FACADE) ? "Facade" : "Psycho Shift");
    return good && [14, `${p.name} · ${reason} wants the status`];
  };
}
const berry = (t, p, c) => {
  const b = t.berryType;
  const name = BERRY_NAMES[b] ?? "berry";
  if (b === BerryType.SITRUS || b === BerryType.ENIGMA) return [3 + 3 * c.bulkShare(p), `${p.name} · ${name} heals ¼ HP`];
  if (b === BerryType.LUM) return [4, `${p.name} · Lum cures a status once`];
  if (b === BerryType.LEPPA) return [2 + (attacks(p).some(mv => (mv.pp ?? 20) <= 10) ? 2 : 0), `${p.name} · Leppa refills a move at 0 PP`];
  if (b >= BerryType.LIECHI && b <= BerryType.SALAC) {
    // `BerryType` lists Liechi…Salac in `Stat`'s order, Atk…Spe (game-code.md §3).
    const stat = b - BerryType.LIECHI + Stat.ATK;
    return [(stat === mainStat(p) || stat === Stat.SPD ? 4 : 1) + (has(p, ["Gluttony", "Ripen"]) ? 2 : 0), `${p.name} · +1 ${STAT_SHORT[stat]} in a pinch`];
  }
  return [2, `${p.name} · ${name} in a pinch`];
};

// null for a reward this file doesn't judge, which 52-shop.js then judges itself.
export const rewardValue = (t, ctx, users) => {
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
      return [6 + (stab ? 6 : 2) + (mainStat(p) === (moves[0].category === MoveCategory.PHYSICAL ? Stat.ATK : Stat.SPATK) ? 2 : 0), `${p.name} · +20% ${type} for ${moves[0].name}`];
    };
    return verdict(bestHolder(pool, ctx, fit), `no ${type} attacker`, pool);
  }
  if (cls("SpeciesStatBoosterModifierType")) {
    const [species, stats] = SPECIES_BOOSTERS[t.key] ?? [[], []];
    const fit = p => (species.includes(p.species?.speciesId) || species.includes(p.fusionSpecies?.speciesId))
      && [18, `${p.name} · ×2 ${stats.map(i => STAT_SHORT[i]).join("/")}`];
    return verdict(bestHolder(pool, ctx, fit), "nobody it works for", pool);
  }
  if (cls("BaseStatBoosterModifierType")) {
    const stat = t.stat ?? 0;
    const fit = p => [3 + 9 * (stat === Stat.HP ? 0.45 : statWeight(p, stat)), `${p.name} · +10% base ${STAT_SHORT[stat]}${p === ctx.carry ? " (carry)" : ""}`];
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
  if (cls("FusePokemonModifierType")) return splicerReward(ctx.run, t);
  if (id === "ABILITY_CHARM") {
    return { v: ctx.wave >= 150 ? 1 : 5, why: "hidden abilities on wild mons more often (catching only)" };
  }

  // A member at the cap gains no EXP, and its share is not passed on (game-code.md §15).
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
  // Rare Candy ignores the cap (game-code.md §15).
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
  // Any of `users` evolves on the spot: the select filter already ran the evolution's own checks (game-code.md §15).
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
