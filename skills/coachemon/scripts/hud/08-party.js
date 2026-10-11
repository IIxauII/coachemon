// The party judged as a whole: the types it hits, the types it fears, its luck, and the set of it that reaches the
// next big fight. Nothing here draws and nothing scores — whether a newcomer is worth it is 12-value's judgment,
// which prices what the team loses inside a run read. The tallies below are only the words a reason is said in (#593).
import { TYPES, vs, effectiveness, defenderOf, typesOf, hasAttr } from "./01-core.js";
import { reviveBefore } from "./03-calendar.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// These ignore the type chart (game-code.md §1). 40-learn's `STAND_INS` marks the same list `fixed`: change both.
const FIXED_DAMAGE_ATTRS = ["LevelDamageAttr", "RandomLevelDamageAttr", "TargetHalfHpDamageAttr", "FixedDamageAttr",
  "MatchHpAttr", "UserHpDamageAttr", "CounterDamageAttr"];
const movesOf = p => (p?.moveset ?? []).filter(Boolean).map(pm => { try { return pm.getMove(); } catch { return null; } }).filter(Boolean);
// `power` −1 is a coverage move too: requiring `power > 0` read a Steel foe whose STAB is Gyro Ball as having no Steel
// attack at all (#266).
export const isCoverage = mv => mv.category !== MoveCategory.STATUS && (mv.power > 0 || mv.power === -1)
  && !FIXED_DAMAGE_ATTRS.some(a => hasAttr(mv, a));
export const damagingTypes = p => [...new Set(movesOf(p).filter(isCoverage).map(mv => TYPES[mv.type]).filter(Boolean))];
export const typesOfSpecies = sp => [sp?.type1, sp?.type2].filter(t => t != null).map(t => TYPES[t]).filter(Boolean);

export const formOf = (sp, i) => (i != null && Array.isArray(sp?.forms) && sp.forms.length ? sp.forms[i] ?? sp : sp);
// `calculateBaseStats` logs "Applied …" to the page's console once per vitamin, Shuckle Juice or Old Gateau, every
// tick, so it is cached against `level` and `stats`, which whatever moves its answer recalculates (game-code.md §20).
// `calculateStats` floors, though, so a +1 base stat on a low-level mon can leave `stats` as they were and go unseen.
// A copy goes out each time, as the game's own call does, or a caller's mutation poisons the cache.
const baseStatsCache = new WeakMap();
export const baseStatsOf = mon => {
  if (!mon || typeof mon !== "object") return undefined;
  const key = `${mon.level}|${(mon.stats ?? []).join(",")}`;
  const hit = baseStatsCache.get(mon);
  const stats = hit && hit.key === key ? hit.stats : tryDo(() => mon.calculateBaseStats());
  if (!hit || hit.key !== key) baseStatsCache.set(mon, { key, stats });
  return Array.isArray(stats) ? stats.slice() : stats;
};
const bstOf = (sp, fu, mon) => {
  const own = mon && baseStatsOf(mon);
  if (Array.isArray(own) && own.length) return own.reduce((t, x) => t + x, 0);
  const a = formOf(sp, mon?.formIndex), b = fu && formOf(fu, mon?.fusionFormIndex);
  if (!b) return a?.baseTotal ?? 0;
  if (Array.isArray(a?.baseStats) && Array.isArray(b.baseStats)) return a.baseStats.reduce((t, x, i) => t + Math.ceil((x + (b.baseStats[i] ?? 0)) / 2), 0);
  return Math.ceil(((a?.baseTotal ?? 0) + (b.baseTotal ?? 0)) / 2);
};
// `getEvolutionLevels()` flattens every descendant (game-code.md §23): two stages left when the first two entries are
// consecutive ids at different levels (Charmander 5@16, 6@36), else one (Eevee's branches share a level).
const stagesLeft = sp => {
  const evos = tryDo(() => sp?.getEvolutionLevels?.());
  if (!Array.isArray(evos) || !evos.length) return 0;
  const [a, b] = evos;
  return b && b[0] === a[0] + 1 && b[1] !== a[1] ? 2 : 1;
};
const speciesFinal = (sp, mon) => {
  const bst = bstOf(sp, null, mon), n = stagesLeft(sp);
  if (!n || !bst) return { bst, final: bst, estimated: false };
  return { bst, final: Math.round(Math.max(bst * 1.3 ** n, bst + 110 * n, 400 + 90 * (n - 1))), estimated: true };
};
export const finalBstOf = x => {
  const sp = x?.species, fu = x?.fusion ?? x?.fusionSpecies ?? null;
  const mon = x ?? null;
  if (!fu) return speciesFinal(sp, mon);
  // Only the form index: the mon's own stats are the fused pair's, not this half's.
  const a = speciesFinal(sp, mon && { formIndex: mon.formIndex }), b = speciesFinal(fu, mon && { formIndex: mon.fusionFormIndex });
  const bst = bstOf(sp, fu, mon);
  return a.estimated || b.estimated ? { bst, final: Math.ceil((a.final + b.final) / 2), estimated: true } : { bst, final: bst, estimated: false };
};

// `getPartyLuckValue`, re-implemented (game-code.md §12). Without `s` a Daily run is not rolled, and without `event`
// (`gameEvents()`) the event's two terms fall away: either way the answer is a floor.
export const partyLuck = (party, s = null, event = null) => {
  const gm = s?.gameMode;
  if (gm?.isDaily && typeof s.executeWithSeedOffset === "function" && s.seed) {
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

/**
 * The party at the next big fight (CONTEXT.md, `Dead weight`): `members` counts every member at full health however
 * hurt it is now, and `dead` is the dead weight holding its slot at zero. `from` is the wave the run stands on and
 * `fight` the wave to reach — with no `fight`, nothing is out of reach and only a challenge bars a member.
 */
export const partyAtFight = (s, party, { from = 0, fight = null } = {}) => {
  const revive = reviveBefore(s, from, fight);
  const members = [], dead = [];
  for (const p of (party ?? []).filter(Boolean)) {
    const why = !tryDo(() => p.isAllowedInChallenge(), true) ? "barred"
      : (p.hp ?? 0) <= 0 && !revive ? "fainted" : null;
    if (why) dead.push({ mon: p, name: p.name ?? null, why });
    else members.push(p);
  }
  return { members, dead, revive };
};

/**
 * The party judged as a whole (CONTEXT.md, `Party profile`): the types it hits, the types it can't, the types
 * several members are weak to — and its **weakest member**, which is a team-value question and not a tally.
 *
 * So `weakest` is handed in rather than worked out here: it is 12-value's `weakestMember` answer, `mon` and all,
 * which runs inside a run read and lives above this file. A reader holding only a profile has none, which is the
 * point — the weakest member comes out of a run read or it doesn't come at all (#582). The tallies never score
 * anything and are only the vocabulary a reason is phrased in.
 *
 * `luck` is `partyLuck` of the members alone, with no Daily roll and no event terms: a card that spends against luck
 * calls `partyLuck` itself.
 */
export const partyProfile = (party, { weakest = null } = {}) => {
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
  // `roots` and `luck` on first read only, so a caller after coverage alone pays for neither.
  let lazy = null;
  const rest = () => {
    if (lazy) return lazy;
    lazy = { roots: new Set(members.map(rootOf)), luck: partyLuck(members) };
    return lazy;
  };
  return {
    members, attacks, ourTypes, hitters, weakTo,
    weakTypes: TYPES.filter(t => {
      const n = weakTo(t).length;
      return n >= 2 && n > members.filter(p => effectiveness(t, p) <= 0.5).length;
    }),
    holes: TYPES.filter(d => !ourTypes.some(t => vs(t, d) >= 2)),
    weakest,
    get roots() { return rest().roots; },
    get luck() { return rest().luck; },
  };
};
