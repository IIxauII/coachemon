// The party judged as a whole, and whether a newcomer is worth it to it. Nothing here draws, and nothing weighs:
// `partyReasons` hands back reasons with no numbers on them, and what each is worth is the asking card's.
import { TYPES, vs, effectiveness, defenderOf, typesOf, hasAttr } from "./01-core.js";

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

const formOf = (sp, i) => (i != null && Array.isArray(sp?.forms) && sp.forms.length ? sp.forms[i] ?? sp : sp);
// `calculateBaseStats` logs "Applied …" to the page's console once per vitamin, Shuckle Juice or Old Gateau, every
// tick, so it is cached against `level` and `stats`: whatever moves its answer also rewrites them (game-code.md §20).
// A copy goes out each time, as the game's own call does, or a caller's mutation poisons the cache.
const baseStatsCache = new WeakMap();
const baseStatsOf = mon => {
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

const UPGRADE_BST = 100, UPGRADE_FLOOR = 400, UPGRADE_LEVEL_GAP = 10;
const HOLE_MIN_PARTY = 3, HOLE_MIN_TYPES = 2;

// `luck` is `partyLuck` of the members alone, with no Daily roll and no event terms: a card that spends against luck
// calls `partyLuck` itself.
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
    weakTypes: TYPES.filter(t => {
      const n = weakTo(t).length;
      return n >= 2 && n > members.filter(p => effectiveness(t, p) <= 0.5).length;
    }),
    holes: TYPES.filter(d => !ourTypes.some(t => vs(t, d) >= 2)),
    get weakest() { return rest().weakest; },
    get roots() { return rest().roots; },
    get luck() { return rest().luck; },
  };
};

// `cand`: `{ species, fusion?, level, types, moveTypes?, abilities? }`. A live mon works only if the caller passes its
// `types`: they are never read off it.
export const partyReasons = (profile, cand, { replacing = profile?.weakest?.mon ?? null } = {}) => {
  const out = [];
  if (!profile?.members.length || !cand) return out;
  const types = cand.types ?? [];
  const def = { types, abilities: cand.abilities ?? [] };
  if (profile.roots.has(rootOf(cand))) out.push({ kind: "dupe" });

  const covers = profile.weakTypes.filter(t => effectiveness(t, def) <= 0.5);
  if (covers.length) out.push({ kind: "covers", types: covers });

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
