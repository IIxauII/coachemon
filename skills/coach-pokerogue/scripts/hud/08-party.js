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
// A fusion's base stats are its two species' averaged stat by stat, rounded up (`Pokemon.calculateBaseStats`): a fused
// mon is judged by the pair, not by the species it shows.
const bstOf = (sp, fu) => {
  if (!fu) return sp?.baseTotal ?? 0;
  if (Array.isArray(sp?.baseStats) && Array.isArray(fu.baseStats)) return sp.baseStats.reduce((t, x, i) => t + Math.ceil((x + (fu.baseStats[i] ?? 0)) / 2), 0);
  return Math.ceil(((sp?.baseTotal ?? 0) + (fu.baseTotal ?? 0)) / 2);
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
const speciesFinal = sp => {
  const bst = sp?.baseTotal ?? 0, n = stagesLeft(sp);
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
  if (!fu) return speciesFinal(sp);
  const a = speciesFinal(sp), b = speciesFinal(fu), bst = bstOf(sp, fu);
  return a.estimated || b.estimated ? { bst, final: Math.ceil((a.final + b.final) / 2), estimated: true } : { bst, final: bst, estimated: false };
};

/**
 * The party's luck. `getPartyLuckValue` (modifier-type.ts) sums the luck of everyone allowed in battle and clamps to
 * 14; the timed-event boost it adds on top isn't readable from the scene, so this is a floor, not the value.
 */
export const partyLuck = party => {
  const allowed = (party ?? []).filter(p => tryDo(() => p.isAllowedInBattle(), true));
  return Math.max(0, Math.min(14, allowed.reduce((t, p) => t + (tryDo(() => p.getLuck(), 0) ?? 0), 0)));
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
 * - `luck` — `partyLuck`.
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
