// The standard half of the threat set (CONTEXT.md, `Threat set`). The wave alone decides it — the run itself is read
// for nothing but its level cap — so the half is *exact* where the roster half carries its preview's confidence.
import { TYPES } from "./01-core.js";
import { bigFightsAhead } from "./03-calendar.js";
import { gameTables } from "./04-game-tables.js";
import { RANDBATS } from "./05-randbats.js";
import { combatantOf } from "./09-combatant.js";
import { levelCapAt } from "./09-projection.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// The BST band the pick runs in: a centre that ramps from `bst[0]` at `wave[0]` to `bst[1]` at `wave[1]` and stands
// there after, `half` wide either side (#577).
export const BAND = { wave: [10, 100], bst: [300, 600], half: 60 };

export const bandAt = wave => {
  const [w0, w1] = BAND.wave, [b0, b1] = BAND.bst;
  const at = Math.min(w1, Math.max(w0, Math.floor(wave) || w0));
  const centre = Math.round(b0 + (b1 - b0) * (at - w0) / (w1 - w0));
  return { centre, min: centre - BAND.half, max: centre + BAND.half };
};

// A shape scores the *weaker* of the two stats it lives by, never their sum (#577): a sum lets one huge stat carry a
// species that has nothing else, and gives the bulky attacker slot to a Shuckle that cannot attack and the physical
// wall slot to a Blissey that cannot take a hit.
export const ARCHETYPES = [
  ["fast sweeper", b => Math.min(b[Stat.SPD], Math.max(b[Stat.ATK], b[Stat.SPATK]))],
  ["physical wall", b => Math.min(b[Stat.HP], b[Stat.DEF])],
  ["special wall", b => Math.min(b[Stat.HP], b[Stat.SPDEF])],
  ["bulky attacker", b => Math.min(Math.max(b[Stat.ATK], b[Stat.SPATK]), Math.min(b[Stat.DEF], b[Stat.SPDEF]))],
];

// 40-learn's `rbId`/`rbAt`, which this file is below: a nickname like "constructor" must not reach up the prototype
// chain and hand back a function.
const rbId = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const rbAt = (table, id) => (table && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null);
const moveName = mv => String(mv?.name ?? "").replace(/ \(N\)$/, "");
// Whether a move damages at all, which is what decides the four slots a threat carries. Not 08-party's `isCoverage`:
// that asks what the type chart makes of a move, and drops a Seismic Toss the duel is perfectly able to score.
const hits = mv => !!mv && mv.category !== MoveCategory.STATUS && (mv.power > 0 || mv.power === -1);

const SLOTS = 4; // what the game gives a mon, and what the duel reads

// The snapshot's first set for the species, as move ids the game knows, damaging moves first: a set of more than four
// spends the four on the duel rather than on a Protect.
const setMoves = (sets, idOf, table) => {
  const ids = (sets?.[0] ?? []).slice(1).map(i => idOf.get(RANDBATS.m[i])).filter(id => id != null);
  return [...ids.filter(id => hits(table[id])), ...ids.filter(id => !hits(table[id]))].slice(0, SLOTS);
};

/**
 * Every species randbats lists that the game's own table knows, with its BST, its types and its set moves: the
 * snapshot carries neither a BST nor a type, so the name is the only key the join has. A species whose sets the
 * snapshot files under a form key (`f`) or under what it evolves into (`e`) is left out — a threat stands for its own
 * species, at its own stats.
 */
const poolOf = () => {
  const t = gameTables();
  const moves = t?.moves ?? [];
  const idOf = new Map();
  // Lowest id wins, as the game's own move list is ordered.
  moves.forEach((mv, id) => { if (mv?.name && !idOf.has(moveName(mv))) idOf.set(moveName(mv), id); });
  const out = [];
  for (const sp of tryDo(() => t.species.getAllSpecies(), []) ?? []) {
    const sets = rbAt(RANDBATS.s, rbId(sp?.name));
    const base = sp?.baseStats;
    if (!sets?.length || !Array.isArray(base) || base.length < 6) continue;
    out.push({
      species: sp,
      id: sp.speciesId ?? 0,
      bst: sp.baseTotal ?? base.reduce((t2, x) => t2 + x, 0),
      base,
      types: [sp.type1, sp.type2].filter(x => x != null && x >= 0),
      moves: setMoves(sets, idOf, moves),
    });
  }
  // The species id orders the pool, so every tie below breaks the same way from one read to the next.
  return out.sort((a, b) => a.id - b.id);
};

// The best of `pool` by `score`, highest first, ties to the lower species id — which the pool's own order settles.
const bestBy = (pool, score) => pool.reduce((best, e) => (best == null || score(e) > score(best) ? e : best), null);

// A band the type picks have left thinner than this widens to the `POOL_MIN` species nearest its centre, and never to
// the pool: the band early in a run holds very few species — randbats lists none that can still evolve — and the four
// shapes taken off the whole pool would hand a wave 10 party a Tyranitar (#577).
const POOL_MIN = 8;
const shapePool = (pool, band, taken) => {
  const left = pool.filter(x => !taken.has(x.id));
  const near = left.sort((a, b) => Math.abs(a.bst - band.centre) - Math.abs(b.bst - band.centre) || a.id - b.id);
  const inBand = near.filter(x => x.bst >= band.min && x.bst <= band.max);
  return inBand.length >= POOL_MIN ? inBand : near.slice(0, POOL_MIN);
};

// A threat takes the adapter's own neutral nature and full IVs: a spread of its own would be a second set of chosen
// numbers judging the party.
const threatOf = (e, level, kind, label, type) => {
  const combatant = combatantOf({ species: e.species, level, moves: e.moves, player: false });
  return combatant && { kind, label, type: type ?? null, species: e.species, bst: e.bst, combatant,
    name: combatant.name, key: combatant.key };
};

const buildThreats = (s, wave) => {
  const band = bandAt(wave);
  const level = levelCapAt(s, wave);
  const pool = poolOf();
  const threats = [];
  const taken = new Set();
  // One species per type, nearest the band's centre: the band's own edges never bind this pick, so a type whose
  // species are all heavier than the wave asks (an early Dragon) stands at its lightest rather than dropping out of
  // the set. A species of two types stands for the earlier of them only — the set's value is a mean over it, and a
  // Mawile standing for Steel and Fairy both would get two votes out of twenty-two (#577).
  for (let type = 0; type < TYPES.length; type++) {
    const same = pool.filter(x => x.types.includes(type));
    const left = same.filter(x => !taken.has(x.id));
    const e = bestBy(left.length ? left : same, x => -Math.abs(x.bst - band.centre));
    const t = e && threatOf(e, level, "type", TYPES[type], type);
    if (t) { threats.push(t); taken.add(e.id); }
  }
  // Then the shapes, out of the band and off what the types left — the same reason the types don't share a species.
  for (const [label, score] of ARCHETYPES) {
    const e = bestBy(shapePool(pool, band, taken), x => score(x.base));
    const t = e && threatOf(e, level, "archetype", label, null);
    if (t) { threats.push(t); taken.add(e.id); }
  }
  return { wave, level, band, threats, confidence: "exact" };
};

const UNREADY = "the game's species table hasn't been read yet";

/**
 * The standard threats for the big fight on wave `fight`, the next big fight ahead of the run where the caller names
 * none and the wave the run stands on where there is no fight to read.
 *
 * The game's tables land partway through a run; an answer taken before they do says `unavailable` and is never
 * memoised, so the next read asks again.
 */
export const standardThreats = (run, { fight = null } = {}) => {
  const s = run?.scene ?? null;
  const here = Math.max(1, Math.floor(run?.facts?.wave ?? 0) || 1);
  const wave = Math.max(1, Math.floor(fight ?? bigFightsAhead(s, here)[0]?.wave ?? here) || 1);
  const ready = typeof tryDo(() => gameTables().species.getAllSpecies) === "function" && !!tryDo(() => gameTables().moves);
  if (!ready) return { wave, level: levelCapAt(s, wave), band: bandAt(wave), threats: [], confidence: "exact", unavailable: UNREADY };
  return run.memo("threats", String(wave), () => buildThreats(s, wave));
};
