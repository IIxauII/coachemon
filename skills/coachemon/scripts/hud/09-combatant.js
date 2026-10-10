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

const stacksOf = m => Math.max(1, Math.floor(tryDo(() => m.getStackCount(), m?.stackCount ?? 1) ?? 1));

/**
 * What a held item does to the mon holding it, where anything here can price it at all, by the game's own class
 * (game-code.md §15) and nearest class first up the chain:
 *   `stat`       a stat multiplier, which the adapter folds into the stat row
 *   `evolution`  the same, while the species it holds for can still evolve (an Eviolite)
 *   `species`    the same, for the species it was made for (a Light Ball, a Thick Club, the DeepSea pair)
 *   `power`      a move-power multiplier on its own type (a type booster), which the adapter folds into the moveset
 *   `duel`       an item the approx matrix reads off `getHeldItems` itself — a Focus Band's save, a Reviver Seed's
 *                second life — so there is nothing left for the adapter to apply
 *
 * An item outside this table is one nothing here prices: the matrix never reads it and the adapter cannot turn it
 * into a stat or a multiplier, so what it is worth has to be charged flat rather than taken as free (12-value's
 * `UNKNOWN_ITEM`). Leftovers and a Shell Bell are the plainest of them: the duel is a race to a KO and carries no
 * end of turn to heal on.
 */
const PRICED = {
  EvolutionStatBoosterModifier: "evolution",
  SpeciesStatBoosterModifier: "species",
  StatBoosterModifier: "stat",
  AttackTypeBoosterModifier: "power",
  SurviveDamageModifier: "duel",
  PokemonInstantReviveModifier: "duel",
};
const pricingOf = m => {
  for (let c = m?.constructor; c?.name; c = Object.getPrototypeOf(c)) if (PRICED[c.name]) return PRICED[c.name];
  return null;
};
// @only 12-value, tests: pricesItem
export const pricesItem = m => !!pricingOf(m);

const canEvolve = sp => (tryDo(() => sp.getEvolutionLevels(), []) ?? []).length > 0;

/**
 * `row` with every stat multiplier the held items carry applied to it. The game applies these in `getEffectiveStat`
 * rather than in `calculateStats`, so they go on the row the combatant hands over: the row is the whole of what the
 * duel reads a stat off.
 *
 * A booster that will not say how much it multiplies by moves nothing, and one that names no species is taken at its
 * word, as an ability given by name alone is. An Eviolite holds only while the species can still evolve, and at the
 * game's ×1.25 where one half of a fusion can and the other cannot (game-code.md §15).
 */
const boostStats = (row, items, { species, fusionSpecies }) => {
  const mult = [1, 1, 1, 1, 1, 1];
  let any = false;
  for (const m of items) {
    const how = pricingOf(m);
    if (how !== "stat" && how !== "evolution" && how !== "species") continue;
    const stats = Array.isArray(m.stats) ? m.stats : [];
    let by = typeof m.multiplier === "number" && m.multiplier > 0 ? m.multiplier : 1;
    if (how === "evolution") {
      const halves = fusionSpecies ? [species, fusionSpecies] : [species];
      const n = halves.filter(canEvolve).length;
      by = n === halves.length ? by : n ? 1.25 : 1;
    }
    if (how === "species" && Array.isArray(m.species)
      && !m.species.includes(species?.speciesId) && !m.species.includes(fusionSpecies?.speciesId)) continue;
    for (const s of stats) {
      if (typeof s !== "number" || !(s >= 0) || s > 5) continue;
      mult[s] *= by;
      any = any || by !== 1;
    }
  }
  return any ? row.map((v, s) => (mult[s] === 1 ? v : Math.max(1, Math.floor(v * mult[s])))) : row;
};

// The power each move type's boosters multiply by: `floor(power × (1 + 0.2 × stacks))` (game-code.md §15).
const powerBoosts = items => {
  const by = new Map();
  for (const m of items) {
    if (pricingOf(m) !== "power" || typeof m.moveType !== "number") continue;
    by.set(m.moveType, (by.get(m.moveType) ?? 1) * (1 + 0.2 * stacksOf(m)));
  }
  return by;
};
/**
 * `pm` with its move's power multiplied, for a slot a type booster lifts. The move object keeps its own prototype —
 * the duel asks it for `hasFlag` and reads its attrs — so only the power is laid over it. A move the game prices
 * from the situation (power −1) carries no power to lift.
 */
const boostSlot = (pm, by) => {
  const mv = tryDo(() => pm.getMove());
  const f = mv ? by.get(mv.type) : null;
  if (!f || !(mv.power > 0)) return pm;
  const lifted = Object.create(mv, { power: { value: Math.floor(mv.power * f), enumerable: true } });
  return Object.create(pm, { getMove: { value: () => lifted } });
};

// What a held item is to a combatant's key and to a memo keyed on it: the class the duel and the adapter price it by,
// how many of it, and the fields either reads.
export const itemKeyOf = m => [m?.constructor?.name ?? null, stacksOf(m), pricingOf(m), m?.stats ?? null,
  m?.multiplier ?? null, m?.moveType ?? null, m?.species ?? null, m?.isTransferable ?? null];

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
 *   `species`  a `PokemonSpecies`, `form` its form index. A species over a live member is that member judged as the
 *              form it evolves into by the next big fight (CONTEXT.md, `Level projection`): the species then decides
 *              the base stats, the typing, the ability — at the member's own ability index, which an evolution keeps
 *              — and the passive, and the member keeps its level as given, its IVs, its nature and its moves. The
 *              stat investment it has been fed is left behind with its own base-stat row, as a fusion's is, that row
 *              answering for the species it is now rather than the one it will be
 *   `level`    the level the stats are computed at
 *   `ivs`      six IVs, `nature` a `Nature`; neutral where unknown
 *   `stats`    a `Stat`-indexed stat row given outright, for a combatant with no species to compute one from — a
 *              **preview**'s foe. It wins over the base stats, the IVs and the nature, which then only name the mon
 *   `moves`    move ids, at full PP; the live moveset where absent
 *   `items`    the held items it carries, the live member's own where absent and none where there is no member. The
 *              ones the adapter can price (`PRICED`) are applied here, as the stat and power multipliers the game
 *              applies them as; the whole list is handed on through `getHeldItems`, which is where the duel reads
 *              the few it prices itself. A member scored without its items — what a release destroys — is the same
 *              spec with `items` cut down to what stays behind
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
  // A member judged as the species it evolves into: everything the species itself decides comes off the form from
  // here on, and nothing of it off the member.
  const evolved = !!(mon && species && species !== mon.species);
  // An evolution keeps the member's ability *index*, so the evolved species' ability at that index is the one it
  // comes out with (game-code.md §23).
  const evolvedAbility = () => tryDo(() => form.getAbility(mon.abilityIndex ?? 0)) ?? form?.ability1;
  const ability = spec.ability !== undefined ? abilityNameOf(spec.ability)
    : other ? (worksFused(other.ability) ? nameOf(other.ability) : null)
      : evolved ? abilityNameOf(evolvedAbility())
        : mon ? abilityNameOf(tryDo(() => mon.getAbility(true)))
          : abilityNameOf(form?.ability1);
  // The passive stays the base half's, fused or not (game-code.md §24), but it is the *species*' own, so an evolved
  // member brings the evolved species' passive rather than the one it has now (game-code.md §23).
  const passive = spec.passive !== undefined ? abilityNameOf(spec.passive)
    : mon && tryDo(() => mon.hasPassive(), false)
      ? abilityNameOf(evolved ? tryDo(() => species.getPassiveAbility(formIndex)) : tryDo(() => mon.getPassiveAbility()))
      : null;
  const given = statRowOf(spec.stats);
  // A live member's own call folds in its vitamins, its fusion and the Flip Stat challenge (game-code.md §20) — all
  // of them read off the species it is now, which is why an evolved member computes from the form's base stats.
  const own = evolved ? null : mon && baseStatsOf(mon);
  const base = given ? null : other ? fusedBase(form?.baseStats, other.base) : own ?? form?.baseStats;
  if (!given && !(Array.isArray(base) && base.length >= 6)) return null;

  const fusionSpecies = other?.species ?? mon?.fusionSpecies ?? null;
  const fusionFormIndex = fusionSpecies ? other?.formIndex ?? mon?.fusionFormIndex ?? 0 : null;
  const held = (spec.items ?? (mon ? tryDo(() => mon.getHeldItems(), []) : []) ?? []).filter(Boolean);
  const stats = boostStats(given ?? statsAt(base, level, ivs, nature, ability), held, { species, fusionSpecies });
  const maxHp = Math.max(1, stats[Stat.HP]);
  const hp = Math.max(0, Math.min(maxHp, spec.hp ?? maxHp));
  const ownTypes = spec.types ?? (mon && !evolved ? tryDo(() => mon.getTypes()) : null)
    ?? [form?.type1, form?.type2].filter(t => t != null && t >= 0);
  const types = other ? fusedTypes({ type1: ownTypes[0] ?? null, type2: ownTypes[1] ?? null }, other) : ownTypes;
  const powers = powerBoosts(held);
  const slots = Array.isArray(spec.moves)
    ? spec.moves.map(id => slotOf(id, tryDo(() => gameTables().moves))).filter(Boolean)
    : (mon?.moveset ?? []).filter(Boolean);
  const moveset = powers.size ? slots.map(pm => boostSlot(pm, powers)) : slots;
  const bars = Math.max(0, Math.floor(spec.boss ?? mon?.bossSegments ?? 0));
  const bar = Math.max(0, Math.min(bars ? bars - 1 : 0, spec.bar ?? (bars ? bars - 1 : 0)));
  const stages = spec.stages ?? BASE_STAGES;
  const player = spec.player ?? tryDo(() => mon.isPlayer(), true) ?? true;
  const attrs = new Set([...(spec.attrs ?? []), ...(ATTRS_BY_ABILITY[ability] ?? []), ...(ATTRS_BY_ABILITY[passive] ?? [])]);
  // An overridden ability is no longer the live member's, so only an untouched one may answer off the member. A
  // fusion answers by name too: its ability is the other half's and its passive the base's, and neither mon alone
  // holds both. An evolved member's pair is the evolved species', which the member cannot be asked about either.
  const hasAttr = spec.ability === undefined && !other && !evolved && mon
    ? a => tryDo(() => mon.hasAbilityWithAttr(a), false)
    : a => attrs.has(a);
  return {
    // Everything the duel reads, so a pair score memoised on it cannot be served to a different duel. The held items
    // are in it whole: the boosted stats and moveset above carry only the ones the adapter prices, while the duel
    // reads the rest off `getHeldItems` for itself.
    key: JSON.stringify([species?.speciesId ?? null, fusionSpecies ? [fusionSpecies.speciesId ?? null, fusionFormIndex] : null,
      formIndex, level, stats, types, ability, passive, [...attrs], moveset.map(slotKey), hp, maxHp, bars, bar, stages, player,
      held.map(itemKeyOf)]),
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
    getHeldItems: () => held,
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
