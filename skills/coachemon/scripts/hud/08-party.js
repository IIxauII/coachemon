// The party profile: the run's team judged as a whole, and one query for "is this newcomer worth it for this party".
// Four cards ask those two questions — the catch card about the wild mon in front of you, the biome card about what a
// biome spawns, the Mystery Encounter card about a GTS offer and the fight it sets up, the look-ahead about the roster
// coming — and before this file each carried its own copy of the type table, its own weakest-member rule and its own
// notion of a team hole. They now read one profile, and **keep their own weights**: what a reason is *worth* is the
// card's business, so `partyReasons` hands back reasons with no numbers on them.
//
// Nothing here draws. It reads the party's movesets and calls four pure game methods (`getLuck`,
// `isAllowedInBattle`, `getRootSpeciesId`, `getEvolutionLevels`), each guarded, so a build that hides one loses that
// reason rather than the profile.
//
// ---- What a mon attacks with
// One table, `attacks`: per member, the types it can actually hit for damage, each flagged for STAB. Two rules in it
// were read differently by different cards before, and the wider reading wins in both, because a coverage move is
// coverage however its power is worked out:
//   - **Variable power counts.** A move the game prices from the situation (`power === -1`: Grass Knot, Gyro Ball,
//     Return) is a damaging move of its type. The catch, biome and look-ahead cards used to require `power > 0` and
//     so read a Grass Knot mon as having no Grass at all; the learn card already counted it.
//   - **Fixed damage does not.** Seismic Toss, Night Shade, Super Fang and co. ignore type effectiveness entirely
//     (§4.3), so they are no one's answer to anything. The learn card already excluded them.
import { TYPES, vs, effectiveness, defenderOf, typesOf, hasAttr } from "./01-core.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// The attributes that set damage outright, so the type chart never enters into it. The same list the learn card's
// stand-in powers mark `fixed` (40-learn's `STAND_INS`): damage from a level, from the target's HP, or a flat number.
const FIXED_DAMAGE_ATTRS = ["LevelDamageAttr", "RandomLevelDamageAttr", "TargetHalfHpDamageAttr", "FixedDamageAttr",
  "MatchHpAttr", "UserHpDamageAttr", "CounterDamageAttr"];
const movesOf = p => (p?.moveset ?? []).filter(Boolean).map(pm => { try { return pm.getMove(); } catch { return null; } }).filter(Boolean);
const isCoverage = mv => mv.category !== MoveCategory.STATUS && (mv.power > 0 || mv.power === -1)
  && !FIXED_DAMAGE_ATTRS.some(a => hasAttr(mv, a));
/** The types a mon can hit for damage, once each. The one table the cards used to keep four copies of. */
export const damagingTypes = p => [...new Set(movesOf(p).filter(isCoverage).map(mv => TYPES[mv.type]).filter(Boolean))];
/** A species' own types by name, for a candidate that is a species and not a mon (a biome spawn, a GTS offer). */
export const typesOfSpecies = sp => [sp?.type1, sp?.type2].filter(t => t != null).map(t => TYPES[t]).filter(Boolean);

// ---- How strong a line is
// `Pokemon.calculateBaseStats` starts from the **form**'s stats (`getSpeciesForm(true)` → `species.forms[formIndex]`),
// flips them under the Flip Stat challenge (no change to the total), adds Shuckle Juice and Old Gateau, averages a
// fusion's two halves stat by stat rounding up, halves them in Spliced Endless, then adds vitamins. A live mon answers
// for itself — nothing there draws or writes, so it needs no sandbox; the species stats stand in for a candidate that
// is only a species (a biome spawn, a GTS offer) and for a build that hides the method.
// With no mon there is no form either: `getSpeciesForm(true)` needs one, so a bare species is worth its own row and
// not form 0's. The two are equal for effectively every species, but the species is what the caller handed over.
const formOf = (sp, i) => (i != null && Array.isArray(sp?.forms) && sp.forms.length ? sp.forms[i] ?? sp : sp);
// The call is pure, but the three `applyModifiers` inside it reach `BattleScene.applyModifiersInternal`, which
// `console.log`s "Applied …" once per applied modifier (`src/battle-scene.ts:2949,2974`) — so a party carrying
// vitamins, Shuckle Juice or Old Gateau would print to the page's console on every HUD tick. The answer only moves
// when one of those modifiers is added or removed, and that rewrites the mon's own `stats` as well, so it is cached
// against them: same mon, same level, same stats, same base stats — no call, and no log.
const baseStatsCache = new WeakMap();
const baseStatsOf = mon => {
  if (!mon || typeof mon !== "object") return undefined;
  const key = `${mon.level}|${(mon.stats ?? []).join(",")}`;
  const hit = baseStatsCache.get(mon);
  if (hit && hit.key === key) return hit.stats;
  const stats = tryDo(() => mon.calculateBaseStats());
  baseStatsCache.set(mon, { key, stats });
  return stats;
};
const bstOf = (sp, fu, mon) => {
  const own = mon && baseStatsOf(mon);
  if (Array.isArray(own) && own.length) return own.reduce((t, x) => t + x, 0);
  const a = formOf(sp, mon?.formIndex), b = fu && formOf(fu, mon?.fusionFormIndex);
  if (!b) return a?.baseTotal ?? 0;
  if (Array.isArray(a?.baseStats) && Array.isArray(b.baseStats)) return a.baseStats.reduce((t, x, i) => t + Math.ceil((x + (b.baseStats[i] ?? 0)) / 2), 0);
  return Math.ceil(((a?.baseTotal ?? 0) + (b.baseTotal ?? 0)) / 2);
};
// A line's strength is its final evolution's BST, not the current stage's: an unevolved Spinarak (190) isn't weaker
// than a wild 400. The game only exposes evolutions as species ids (`PokemonSpecies.getEvolutionLevels()` →
// [[speciesId, level], …], every descendant flattened, a pure data read), so the final BST is estimated from how many
// stages are left: two when the first two entries are consecutive ids at different levels (Charmander 5@16, 6@36;
// Oddish 44@21, 45@item), else one (Eevee's and Tyrogue's branches share a level).
const stagesLeft = sp => {
  const evos = tryDo(() => sp?.getEvolutionLevels?.());
  if (!Array.isArray(evos) || !evos.length) return 0;
  const [a, b] = evos;
  return b && b[0] === a[0] + 1 && b[1] !== a[1] ? 2 : 1;
};
// Typical growth per stage: ×1.3, +110, and a floor near 400 for a line's final form (Spinarak 190 → Ariados 400,
// Charmander 309 → Charizard 534, Pidgey 251 → Pidgeot 479).
const speciesFinal = (sp, mon) => {
  const bst = bstOf(sp, null, mon), n = stagesLeft(sp);
  if (!n || !bst) return { bst, final: bst, estimated: false };
  return { bst, final: Math.round(Math.max(bst * 1.3 ** n, bst + 110 * n, 400 + 90 * (n - 1))), estimated: true };
};
/**
 * How strong a mon's line ends up: `{ bst, final, estimated }`. Takes a live mon (`fusionSpecies`), a candidate the
 * cards build by hand (`{ species, fusion }`) or a bare species (`{ species }`). A fusion grows along both lines: the
 * average of each half's final BST.
 */
export const finalBstOf = x => {
  const sp = x?.species, fu = x?.fusion ?? x?.fusionSpecies ?? null;
  // A mon carries its own form indices and, in a live build, its own finished stats; a candidate the cards build by
  // hand carries neither, and falls back to the species row.
  const mon = x ?? null;
  if (!fu) return speciesFinal(sp, mon);
  // Each half's own line, so only its form carries over: the mon's stats are the fused pair's, not this half's.
  const a = speciesFinal(sp, mon && { formIndex: mon.formIndex }), b = speciesFinal(fu, mon && { formIndex: mon.fusionFormIndex });
  const bst = bstOf(sp, fu, mon);
  return a.estimated || b.estimated ? { bst, final: Math.ceil((a.final + b.final) / 2), estimated: true } : { bst, final: bst, estimated: false };
};

/**
 * The party's luck — `getPartyLuckValue` (modifier-type.ts, §12), re-implemented. It is what shifts a wild spawn's
 * tier thresholds and buys a reward a tier upgrade, so the number matters wherever it is read.
 *
 * **In Daily it is not the party's at all**: a `randSeedInt(15)` in a fork at offset 0 on the run seed, or the event
 * seed's own `luck` when the config names one. A fork is a read — `executeWithSeedOffset` puts the stream back — so it
 * costs nothing to ask, and without it a Daily run's luck was quietly the party's sum, which it never is.
 *
 * Elsewhere it sums `getLuck()` over the members `isAllowedInBattle()`, **+1 for each whose species the timed event
 * boosts**, clamps to 0–14, and then adds the event's own `luckBoost`, capped at 14 again. Both event terms need the
 * timed event manager, which is 47-biome's chunk scan's (`gameEvents()`); pass it as `event` where the caller has it.
 * Without it the two terms fall away and the value is a floor, which is what it always was.
 *
 * `s` is the scene, needed only for the Daily fork; called without it, a Daily run falls back to that same floor.
 */
export const partyLuck = (party, s = null, event = null) => {
  const gm = s?.gameMode;
  if (gm?.isDaily && typeof s.executeWithSeedOffset === "function" && s.seed) {
    // `getDailyEventSeedLuck`: an event seed's config may pin the value outright, and only 0–14 is taken.
    const pinned = gm.dailyConfig?.luck;
    if (typeof pinned === "number" && pinned >= 0 && pinned <= 14) return pinned;
    let rolled = null;
    tryDo(() => s.executeWithSeedOffset(() => { rolled = Phaser.Math.RND.integerInRange(0, 14); }, 0, s.seed));
    if (rolled != null) return rolled;
  }
  const boosted = tryDo(() => event.getEventLuckBoostedSpecies(), []) ?? [];
  const allowed = (party ?? []).filter(p => tryDo(() => p.isAllowedInBattle(), true));
  const luck = Math.max(0, Math.min(14, allowed.reduce((t, p) =>
    t + (tryDo(() => p.getLuck(), 0) ?? 0) + (boosted.includes(p?.species?.speciesId) ? 1 : 0), 0)));
  return Math.min(14, luck + (tryDo(() => event.getEventLuckBoost(), 0) ?? 0));
};

const rootOf = x => tryDo(() => x.species.getRootSpeciesId(true), x?.species?.speciesId) ?? x?.species?.speciesId;

// A clear upgrade over the member it would replace: this much more final BST, a real mon and not a route-1 one beating
// another, and not so far below that member's level that it would have to catch up first.
const UPGRADE_BST = 100, UPGRADE_FLOOR = 400, UPGRADE_LEVEL_GAP = 10;
// A team hole is only worth naming once there is a team: with one or two members, everything looks like a hole.
const HOLE_MIN_PARTY = 3, HOLE_MIN_TYPES = 2;

/**
 * The whole party at a glance. `attacks` and the two matchup queries are what the cards score with; `weakest`, `roots`
 * and `luck` cost a game call each and are worked out on first read, so a caller that wants only coverage pays nothing
 * for them.
 *
 * - `attacks` — per member, `[{ t, stab }]`: the types it hits for damage, `stab` 1.5 on its own types.
 * - `weakTypes` — attacking types two or more of us are weak to, and more of us are weak to than resist.
 * - `holes` — defending types nothing on the team hits super-effectively.
 * - `weakest` — `{ mon, final, estimated, level }`: the lowest final BST, the lower level breaking a tie.
 * - `roots` — the party's root species ids, which is what makes a catch a duplicate.
 * - `luck` — `partyLuck` of the members alone: a profile has no scene and no event manager, so this is the floor, not
 *   the Daily roll or the event's terms. A card that spends against luck calls `partyLuck` itself, with both.
 * - `hitters(defender)` — the members that hit it super-effectively (a live mon, a preview foe or a plain defender).
 * - `weakTo(type)` — the members that type hits super-effectively.
 */
export const partyProfile = party => {
  const members = (party ?? []).filter(Boolean);
  const attacks = members.map(p => {
    const own = typesOf(p);
    return damagingTypes(p).map(t => ({ t, stab: own.includes(t) ? 1.5 : 1 }));
  });
  const ourTypes = [...new Set(attacks.flat().map(a => a.t))];
  const weakTo = type => members.filter(p => effectiveness(type, p) >= 2);
  const hitters = defender => {
    const d = defenderOf(defender);
    return members.filter((_, i) => attacks[i].some(a => effectiveness(a.t, d) >= 2));
  };
  let lazy = null;
  const rest = () => {
    if (lazy) return lazy;
    const fin = members.map(finalBstOf);
    let at = -1;
    members.forEach((p, i) => {
      if (at < 0 || fin[i].final < fin[at].final || (fin[i].final === fin[at].final && (p.level ?? 0) < (members[at].level ?? 0))) at = i;
    });
    lazy = {
      weakest: at < 0 ? null : { mon: members[at], final: fin[at].final, estimated: fin[at].estimated, level: members[at].level ?? 0 },
      roots: new Set(members.map(rootOf)),
      luck: partyLuck(members),
    };
    return lazy;
  };
  return {
    members, attacks, ourTypes, hitters, weakTo,
    // Attacking types that hit two or more of us super-effectively and that more of us are weak to than resist.
    weakTypes: TYPES.filter(t => {
      const n = weakTo(t).length;
      return n >= 2 && n > members.filter(p => effectiveness(t, p) <= 0.5).length;
    }),
    // Defending types no damaging move of ours hits super-effectively.
    holes: TYPES.filter(d => !ourTypes.some(t => vs(t, d) >= 2)),
    get weakest() { return rest().weakest; },
    get roots() { return rest().roots; },
    get luck() { return rest().luck; },
  };
};

/**
 * Whether a newcomer is worth it for this party, as reasons with **no weights**: the card that asked decides what each
 * one is worth and how to word it. `cand` is `{ species, fusion?, level, types, moveTypes? }` — a live mon works too,
 * as long as the caller passes its types. With no `moveTypes` the species' own types stand in, the way the look-ahead
 * already treats a foe whose moveset it can't see, so the same species at the same level gets the same reasons on
 * every card.
 *
 * - `{ kind: "covers", types }` — team weaknesses it resists.
 * - `{ kind: "hole", types }` — team holes it hits super-effectively (a team of `HOLE_MIN_PARTY`, at least
 *   `HOLE_MIN_TYPES` of them).
 * - `{ kind: "upgrade", final, estimated, against }` — a clear upgrade over `replacing`, which defaults to the
 *   weakest member.
 * - `{ kind: "dupe" }` — its line is already on the team, so it adds nothing.
 */
export const partyReasons = (profile, cand, { replacing = profile?.weakest?.mon ?? null } = {}) => {
  const out = [];
  if (!profile?.members.length || !cand) return out;
  const types = cand.types ?? [];
  const def = { types, abilities: cand.abilities ?? [] };
  if (profile.roots.has(rootOf(cand))) out.push({ kind: "dupe" });

  const covers = profile.weakTypes.filter(t => effectiveness(t, def) <= 0.5);
  if (covers.length) out.push({ kind: "covers", types: covers });

  // What it brings that no one else has: the team's holes its own damaging moves hit, or — when its moveset isn't
  // knowable (a species on the biome card, an offer on the GTS screen) — the ones its types hit.
  if (profile.members.length >= HOLE_MIN_PARTY) {
    const theirs = cand.moveTypes?.length ? cand.moveTypes : types;
    const adds = profile.holes.filter(d => theirs.some(t => vs(t, d) >= 2));
    if (adds.length >= HOLE_MIN_TYPES) out.push({ kind: "hole", types: adds });
  }

  const against = replacing ? { mon: replacing, ...finalBstOf(replacing), level: replacing.level ?? 0 } : null;
  if (against?.final) {
    const mine = finalBstOf(cand);
    if (mine.final >= UPGRADE_FLOOR && mine.final >= against.final + UPGRADE_BST
      && (cand.level ?? 0) >= against.level - UPGRADE_LEVEL_GAP) {
      out.push({ kind: "upgrade", final: mine.final, estimated: mine.estimated,
        against: { mon: against.mon, name: against.mon?.name ?? null, final: against.final, estimated: against.estimated } });
    }
  }
  return out;
};
