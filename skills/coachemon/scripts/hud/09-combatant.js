// Builds the live-shaped object the approx duel matrix scores (`approxOutcomes`) out of plain data — a species at a
// level, a member at a projected level, a fusion of two halves the player hasn't committed — and refuses the live
// scene: it constructs no game object and draws no RNG, so a run read that calls it stays a read.
import { natureOf } from "./01-core.js";
import { gameTables } from "./04-game-tables.js";
import { baseStatsOf, formOf } from "./08-party.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

const NEUTRAL_IV = 15; // floor(31 / 2)
const NEUTRAL_NATURE = 0; // Hardy: nothing up, nothing down
const BASE_STAGES = [0, 0, 0, 0, 0, 0, 0];
// Sturdy is the one ability the approx duel asks for by attr rather than by name (game-code.md §8).
const ATTRS_BY_ABILITY = { Sturdy: ["PreDefendFullHpEndureAbAttr"] };

// The " (N)" / " (P)" a nickname or a passive hangs off the game's ability names.
const nameOf = x => (typeof x === "string" ? x : x?.name == null ? null : String(x.name).replace(/ \((N|P)\)$/, ""));
const abilityOf = x => (typeof x === "number" ? tryDo(() => gameTables().abilities[x]) : x);
const abilityNameOf = x => nameOf(abilityOf(x));
// The attr `canApplyAbility` refuses on a fusion — Disguise, Zen Mode, Schooling, Stance Change (game-code.md §24).
// An ability given by name alone carries no attrs, and is taken at its word.
const worksFused = ab => !(ab?.attrs ?? []).some(a => a?.constructor?.name === "NoFusionAbilityAbAttr");

// A stat row handed over whole rather than computed: six `Stat`-indexed numbers, or null for anything else.
const statRowOf = xs => {
  if (!Array.isArray(xs) || xs.length < 6) return null;
  const row = xs.slice(0, 6);
  return row.every(x => typeof x === "number" && Number.isFinite(x) && x >= 0) ? row.map(x => Math.floor(x)) : null;
};

// `calculateStats`, re-implemented (game-code.md §24).
const statsAt = (base, level, ivs, nature, ability) => {
  const fx = natureOf(nature);
  return base.map((b, s) => {
    const v = Math.floor((2 * b + (ivs?.[s] ?? NEUTRAL_IV)) * level * 0.01);
    if (s === Stat.HP) return ability === "Wonder Guard" ? 1 : v + level + 10;
    const m = fx.upStat === s ? 1.1 : fx.downStat === s ? 0.9 : 1;
    return m === 1 ? v + 5 : Math.max(1, Math[m > 1 ? "ceil" : "floor"]((v + 5) * m));
  });
};

// A slot built from a move id has none of its PP spent, which is what `plainUsable` reads it by.
const slotOf = (id, table) => {
  const mv = table?.[id];
  return mv ? { moveId: id, getMove: () => mv, getName: () => mv.name, getMovePp: () => mv.pp ?? 0, ppUsed: 0 } : null;
};
const slotKey = pm => [pm?.moveId ?? null, tryDo(() => pm.getMovePp() - pm.ppUsed, 0)];

/**
 * One half of a fusion, read for the three things a fusion takes from it: base stats, a type and an ability. `h` is
 * a spec of its own, `{ mon }` or `{ species, form, ability }`.
 *
 * The base stats are the *form*'s, never a live half's own `calculateBaseStats()`, which the game averages ahead of
 * the base half's vitamins and halves outright in Spliced Endless — a halving fusing then undoes (game-code.md §20,
 * §24). So no vitamin of either half reaches a fusion the player hasn't committed yet.
 */
const halfOf = h => {
  const mon = h?.mon ?? null;
  const species = h?.species ?? mon?.species ?? null;
  const formIndex = h?.form ?? mon?.formIndex ?? 0;
  const form = formOf(species, formIndex);
  const types = (mon && tryDo(() => mon.getTypes())) ?? [form?.type1, form?.type2];
  // The other half lends the ability at its own index, with no fallback to the species' first (game-code.md §24).
  const ability = h?.ability !== undefined ? abilityOf(h.ability)
    : mon ? abilityOf(tryDo(() => mon.getAbility(true)))
      : abilityOf(form?.ability1);
  return { species, formIndex, base: form?.baseStats, type1: types?.[0] ?? null, type2: types?.[1] ?? null, ability };
};
// `calculateBaseStats`' and `getBaseTypes`' fusion halves, re-implemented (game-code.md §24).
const fusedBase = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.map((x, s) => Math.ceil((x + (b[s] ?? 0)) / 2)) : null);
const fusedTypes = (a, b) => {
  let second = a.type2;
  if (b.type2 != null && b.type2 !== a.type1) second = b.type2;
  else if (b.type1 != null && b.type1 !== a.type1) second = b.type1;
  return [a.type1, second].filter((t, i, xs) => t != null && t >= 0 && xs.indexOf(t) === i);
};

/**
 * A duel-ready combatant, or null when there are no base stats to compute from. `spec`:
 *   `mon`      a live member every field below falls back to, judged at `level` rather than its own
 *   `species`  a `PokemonSpecies`, `form` its form index
 *   `level`    the level the stats are computed at
 *   `ivs`      six IVs, `nature` a `Nature`; neutral where unknown
 *   `stats`    a `Stat`-indexed stat row given outright, for a combatant with no species to compute one from — a
 *              **preview**'s foe. It wins over the base stats, the IVs and the nature, which then only name the mon
 *   `moves`    move ids, at full PP; the live moveset where absent
 *   `ability`  an ability name or id, `passive` the same; null for none, absent for the species' or the member's own
 *   `attrs`    ability attr names beyond `ATTRS_BY_ABILITY`, for a combatant with no live member behind it
 *   `boss`     boss bars, `bar` the bar it stands on; `hp` its health, full where absent
 *   `stages`   stat stages, base where absent: a member is judged off the field, never on it (CONTEXT.md, `Return`)
 *   `fuse`     the other half of a fusion the player hasn't committed: a half spec, `{ mon }` or
 *              `{ species, form, ability }`. The rest of the spec is the base half, which keeps its level, IVs,
 *              nature, moves and passive (CONTEXT.md, `Fusion`); the other half lends half of every base stat, a type
 *              and its ability. A base half that is already fused is no combatant, the Splicer refusing a fusion
 */
export const combatantOf = (spec = {}) => {
  const mon = spec.mon ?? null;
  const species = spec.species ?? mon?.species ?? null;
  const formIndex = spec.form ?? mon?.formIndex ?? 0;
  const form = formOf(species, formIndex);
  const level = Math.max(1, Math.floor(spec.level ?? mon?.level ?? 1));
  const ivs = spec.ivs ?? mon?.ivs ?? null;
  const nature = spec.nature ?? tryDo(() => mon.getNature(), mon?.nature) ?? NEUTRAL_NATURE;
  const other = spec.fuse ? halfOf(spec.fuse) : null;
  if (other && mon?.fusionSpecies) return null; // the Splicer's filter refuses a fusion (game-code.md §24)
  const ability = spec.ability !== undefined ? abilityNameOf(spec.ability)
    : other ? (worksFused(other.ability) ? nameOf(other.ability) : null)
      : mon ? abilityNameOf(tryDo(() => mon.getAbility(true)))
        : abilityNameOf(form?.ability1);
  // The passive stays the base half's, fused or not (game-code.md §24).
  const passive = spec.passive !== undefined ? abilityNameOf(spec.passive)
    : mon && tryDo(() => mon.hasPassive(), false) ? abilityNameOf(tryDo(() => mon.getPassiveAbility())) : null;
  const given = statRowOf(spec.stats);
  // A live member's own call folds in its vitamins, its fusion and the Flip Stat challenge (game-code.md §20).
  const base = given ? null : other ? fusedBase(form?.baseStats, other.base) : (mon && baseStatsOf(mon)) ?? form?.baseStats;
  if (!given && !(Array.isArray(base) && base.length >= 6)) return null;

  const stats = given ?? statsAt(base, level, ivs, nature, ability);
  const maxHp = Math.max(1, stats[Stat.HP]);
  const hp = Math.max(0, Math.min(maxHp, spec.hp ?? maxHp));
  const ownTypes = spec.types ?? (mon ? tryDo(() => mon.getTypes()) : null)
    ?? [form?.type1, form?.type2].filter(t => t != null && t >= 0);
  const types = other ? fusedTypes({ type1: ownTypes[0] ?? null, type2: ownTypes[1] ?? null }, other) : ownTypes;
  const moveset = Array.isArray(spec.moves)
    ? spec.moves.map(id => slotOf(id, tryDo(() => gameTables().moves))).filter(Boolean)
    : (mon?.moveset ?? []).filter(Boolean);
  const bars = Math.max(0, Math.floor(spec.boss ?? mon?.bossSegments ?? 0));
  const bar = Math.max(0, Math.min(bars ? bars - 1 : 0, spec.bar ?? (bars ? bars - 1 : 0)));
  const stages = spec.stages ?? BASE_STAGES;
  const player = spec.player ?? tryDo(() => mon.isPlayer(), true) ?? true;
  const attrs = new Set([...(spec.attrs ?? []), ...(ATTRS_BY_ABILITY[ability] ?? []), ...(ATTRS_BY_ABILITY[passive] ?? [])]);
  // An overridden ability is no longer the live member's, so only an untouched one may answer off the member. A
  // fusion answers by name too: its ability is the other half's and its passive the base's, and neither mon alone
  // holds both.
  const hasAttr = spec.ability === undefined && !other && mon
    ? a => tryDo(() => mon.hasAbilityWithAttr(a), false)
    : a => attrs.has(a);
  const fusionSpecies = other?.species ?? mon?.fusionSpecies ?? null;
  const fusionFormIndex = fusionSpecies ? other?.formIndex ?? mon?.fusionFormIndex ?? 0 : null;

  return {
    // Everything the duel reads, so a pair score memoised on it cannot be served to a different duel.
    key: JSON.stringify([species?.speciesId ?? null, fusionSpecies ? [fusionSpecies.speciesId ?? null, fusionFormIndex] : null,
      formIndex, level, stats, types, ability, passive, [...attrs], moveset.map(slotKey), hp, maxHp, bars, bar, stages, player]),
    name: spec.name ?? mon?.name ?? tryDo(() => species.getName(formIndex), species?.name),
    id: spec.id ?? mon?.id ?? null,
    species, fusionSpecies, fusionFormIndex, formIndex, level, stats, hp, moveset,
    bossSegments: bars, bossSegmentIndex: bar,
    summonData: { statStages: stages, abilitiesApplied: new Set(), tags: [] },
    waveData: { abilitiesApplied: new Set(), abilityRevealed: true, endured: false },
    turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
    getMaxHp: () => maxHp,
    getStat: s => stats[s] ?? 0,
    getTypes: () => types,
    getAbility: () => (ability ? { name: ability } : null),
    hasPassive: () => !!passive,
    getPassiveAbility: () => (passive ? { name: passive } : null),
    hasAbilityWithAttr: hasAttr,
    getHeldItems: () => (mon ? tryDo(() => mon.getHeldItems(), []) ?? [] : []),
    getTag: () => null,
    isBoss: () => bars > 0,
    isPlayer: () => !!player,
    isOnField: () => false,
  };
};

/**
 * The `env` the approx duel reads for a duel with no field: who the foe is comes off each side's own `isPlayer`, and
 * the only scene state it reaches for is the two modifier lists.
 */
export const duelEnv = s => ({
  s: s ?? null,
  modifiers: s?.modifiers ?? [],
  enemyModifiers: s?.enemyModifiers ?? [],
  party: () => null,
  finalBoss: false,
  isEnemy: p => tryDo(() => p.isPlayer(), true) === false,
});
