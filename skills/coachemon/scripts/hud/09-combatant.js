// Builds the live-shaped object the approx duel matrix scores (`approxOutcomes`) out of plain data — a species at a
// level, a member at a projected level — and refuses the live scene: it constructs no game object and draws no RNG,
// so a run read that calls it stays a read.
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
const abilityNameOf = x => (typeof x === "number" ? tryDo(() => gameTables().abilities[x].name) : nameOf(x));

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
 * A duel-ready combatant, or null when there are no base stats to compute from. `spec`:
 *   `mon`      a live member every field below falls back to, judged at `level` rather than its own
 *   `species`  a `PokemonSpecies`, `form` its form index
 *   `level`    the level the stats are computed at
 *   `ivs`      six IVs, `nature` a `Nature`; neutral where unknown
 *   `moves`    move ids, at full PP; the live moveset where absent
 *   `ability`  an ability name or id, `passive` the same; null for none, absent for the species' or the member's own
 *   `attrs`    ability attr names beyond `ATTRS_BY_ABILITY`, for a combatant with no live member behind it
 *   `boss`     boss bars, `bar` the bar it stands on; `hp` its health, full where absent
 *   `stages`   stat stages, base where absent: a member is judged off the field, never on it (CONTEXT.md, `Return`)
 */
export const combatantOf = (spec = {}) => {
  const mon = spec.mon ?? null;
  const species = spec.species ?? mon?.species ?? null;
  const formIndex = spec.form ?? mon?.formIndex ?? 0;
  const form = formOf(species, formIndex);
  const level = Math.max(1, Math.floor(spec.level ?? mon?.level ?? 1));
  const ivs = spec.ivs ?? mon?.ivs ?? null;
  const nature = spec.nature ?? tryDo(() => mon.getNature(), mon?.nature) ?? NEUTRAL_NATURE;
  const ability = spec.ability !== undefined ? abilityNameOf(spec.ability)
    : mon ? abilityNameOf(tryDo(() => mon.getAbility(true)))
      : abilityNameOf(form?.ability1);
  const passive = spec.passive !== undefined ? abilityNameOf(spec.passive)
    : mon && tryDo(() => mon.hasPassive(), false) ? abilityNameOf(tryDo(() => mon.getPassiveAbility())) : null;
  // A live member's own call folds in its vitamins, its fusion and the Flip Stat challenge (game-code.md §20).
  const base = (mon && baseStatsOf(mon)) ?? form?.baseStats;
  if (!Array.isArray(base) || base.length < 6) return null;

  const stats = statsAt(base, level, ivs, nature, ability);
  const maxHp = Math.max(1, stats[Stat.HP]);
  const hp = Math.max(0, Math.min(maxHp, spec.hp ?? maxHp));
  const types = spec.types ?? (mon ? tryDo(() => mon.getTypes()) : null)
    ?? [form?.type1, form?.type2].filter(t => t != null && t >= 0);
  const moveset = Array.isArray(spec.moves)
    ? spec.moves.map(id => slotOf(id, tryDo(() => gameTables().moves))).filter(Boolean)
    : (mon?.moveset ?? []).filter(Boolean);
  const bars = Math.max(0, Math.floor(spec.boss ?? mon?.bossSegments ?? 0));
  const bar = Math.max(0, Math.min(bars ? bars - 1 : 0, spec.bar ?? (bars ? bars - 1 : 0)));
  const stages = spec.stages ?? BASE_STAGES;
  const player = spec.player ?? tryDo(() => mon.isPlayer(), true) ?? true;
  const attrs = new Set([...(spec.attrs ?? []), ...(ATTRS_BY_ABILITY[ability] ?? []), ...(ATTRS_BY_ABILITY[passive] ?? [])]);
  // An overridden ability is no longer the live member's, so only an untouched one may answer off the member.
  const hasAttr = spec.ability === undefined && mon
    ? a => tryDo(() => mon.hasAbilityWithAttr(a), false)
    : a => attrs.has(a);

  return {
    // Everything the duel reads, so a pair score memoised on it cannot be served to a different duel.
    key: JSON.stringify([species?.speciesId ?? null, mon?.fusionSpecies?.speciesId ?? null, formIndex, level, stats,
      types, ability, passive, [...attrs], moveset.map(slotKey), hp, maxHp, bars, bar, stages, player]),
    name: spec.name ?? mon?.name ?? tryDo(() => species.getName(formIndex), species?.name),
    id: spec.id ?? mon?.id ?? null,
    species, fusionSpecies: mon?.fusionSpecies ?? null, formIndex, level, stats, hp, moveset,
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
