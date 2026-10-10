// Team value (CONTEXT.md, `Team value`) and the judgment every newcomer card will read: what the party at the next
// big fight is worth against the threat set, in turn score, and what a newcomer's swap changes. It runs inside a run
// read and nowhere else — `run.memo` carries the pair scores, so the cards of one run read share them — and it draws
// nothing: every duel is the approx matrix over combatants the adapter built off the field.
import { stat } from "./01-core.js";
import { bigFightsAhead } from "./03-calendar.js";
import { partyAtFight } from "./08-party.js";
import { combatantOf, duelEnv } from "./09-combatant.js";
import { levelProjection } from "./09-projection.js";
import { approxOutcomes, barBreakFactors, koChanceAt, koCurve, koTurns, targetFacts, useOf } from "./10-damage.js";
import { standardThreats } from "./11-threats.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// All six in turns, and a change to any of them is a golden diff someone reviews (#567).
export const CLAMP = 3;
export const BACKUP = 0.5;
export const REVENGE = 0.5;
export const SWITCH_IN = 0.25;
export const EXPOSURE = n => 0.2 * n * n;
export const MARGIN = 0.1;

// The health a revenge kill comes in on, and the share of our own health the hit a switch-in takes has to stay under.
const WEAKENED = 0.5, SWITCH_IN_HP = 1 / 3;
const NO_KO = 9; // `koTurns`' own ceiling, which is what a side with nothing that damages scores

export const PARTY_SIZE = 6; // `PLAYER_PARTY_MAX_SIZE` (game-code.md §23)

const CONFIDENCE = { exact: "exact", replay: "replay", estimate: "estimate" };
const RANK = [CONFIDENCE.exact, CONFIDENCE.replay, CONFIDENCE.estimate];
// 48-preview's own pair, which this file is below.
const weakestOf = (...cs) => RANK[Math.max(0, ...cs.filter(Boolean).map(c => RANK.indexOf(c)))];

const bestHit = os => os.reduce((b, o) => (!b || o.dmg > b.dmg ? o : b), null);

// The turns `atk` needs to put `def` down — `def`'s boss bars, Sturdy and Focus Band included — and the move it gets
// there with, which is the hit the credits below are priced off.
const koRace = (env, atk, def) => {
  const best = bestHit(approxOutcomes(env, atk, def).filter(o => o.dmg > 0));
  if (!best) return { turns: NO_KO, best: null };
  const rec = { facts: targetFacts(env, def), bars: (st, n) => barBreakFactors(def, st, n) };
  return { turns: koTurns(koCurve(rec, useOf(best), { cat: best.cat }).by), best };
};

// Who moves first, by the move each would actually use and then by speed: true for `me`, false for `foe`, null where
// the game would roll it, which a read never does.
const movesFirst = (me, mine, foe, theirs) => {
  const p = (mine?.priority ?? 0) - (theirs?.priority ?? 0);
  if (p !== 0) return p > 0;
  const d = stat(me, Stat.SPD) - stat(foe, Stat.SPD);
  return d === 0 ? null : d > 0;
};

/**
 * The pair score s(m, t): the turns the threat needs to put the member down, less the turns the member needs on it,
 * clamped to ±`CLAMP` so that one lopsided duel can't drown the rest of the team (#567, story 37).
 *
 * The approx duel ignores speed, so moving first is added here, as the one hit the slower side takes extra
 * (story 36). Only one side moves first, so speed is worth ±1 and never ±2.
 *
 * `revenge` and `switchIn` are the two credits the threat's row pays for, read off the same duel: a member that
 * outspeeds the threat and still kills it from `WEAKENED` health, and a member that loses the duel but takes the
 * threat's best hit for under `SWITCH_IN_HP` of its own health.
 */
const pairScore = (env, m, t) => {
  const mine = koRace(env, m, t);
  const theirs = koRace(env, t, m);
  const first = movesFirst(m, mine.best, t, theirs.best);
  const raw = (theirs.turns + (first === true ? 1 : 0)) - (mine.turns + (first === false ? 1 : 0));
  const s = Math.max(-CLAMP, Math.min(CLAMP, raw));
  return {
    s, raw, first, turns: mine.turns, taken: theirs.turns,
    move: mine.best?.name ?? null,
    revenge: first === true && !!mine.best
      && koChanceAt(mine.best, Math.max(1, Math.ceil(t.getMaxHp() * WEAKENED))) >= 0.5,
    switchIn: s < 0 && (theirs.best?.dmg ?? 0) < m.getMaxHp() * SWITCH_IN_HP,
  };
};

const pairOf = (run, env, m, t) => run.memo("pair", `${m.key}|${t.key}`, () => pairScore(env, m, t));

/**
 * One threat's row: the answer's margin, a discounted backup, the two credits once each however many members earn
 * them, less the exposure of every member the threat beats in the speed-aware race.
 *
 * Dead weight is not among `pairs` at all, so it neither answers a threat nor is exposed to one (CONTEXT.md, `Dead
 * weight`) — and a party with nobody left scores a flat zero rather than a loss, there being nothing to sweep.
 */
const rowOf = (threat, pairs) => {
  const ranked = [...pairs].sort((a, b) => b.s - a.s);
  const beaten = pairs.filter(x => x.s < 0);
  const revenge = pairs.some(x => x.revenge), switchIn = pairs.some(x => x.switchIn);
  return {
    threat: threat.label, kind: threat.kind,
    answer: ranked[0] ?? null, backup: ranked[1] ?? null, beaten: beaten.map(x => x.name),
    revenge, switchIn,
    value: (ranked[0]?.s ?? 0) + BACKUP * (ranked[1]?.s ?? 0) + (revenge ? REVENGE : 0) + (switchIn ? SWITCH_IN : 0)
      - EXPOSURE(beaten.length),
  };
};

/**
 * What `members` — each `{ name, combatant }` — are worth against `set`, in turns per threat. The mean, not the sum,
 * so that the standard half and the roster half of the threat set can be given equal say when #592 lands the second
 * of them.
 */
export const teamValue = (run, set, members) => {
  const env = duelEnv(run?.scene ?? null);
  const rows = (set?.threats ?? []).map(t =>
    rowOf(t, members.map(m => ({ name: m.name, ...pairOf(run, env, m.combatant, t.combatant) }))));
  return { v: rows.length ? rows.reduce((sum, r) => sum + r.value, 0) / rows.length : 0, rows,
    confidence: set?.confidence ?? CONFIDENCE.exact };
};

const waveOf = run => Math.max(1, Math.floor(run?.facts?.wave ?? 0) || 1);
const nextBigFight = (s, here) => bigFightsAhead(s, here)[0]?.wave ?? null;

/**
 * The party at the next big fight as combatants, one slot per member in party order: `combatant` is the member at
 * the level the projection reaches and the species it stands as there, and dead weight holds its slot with no
 * combatant at all.
 *
 * The members fight the waves in between and share their EXP, which is the one routing the coach can read: a bench
 * share each would project a party that never fights.
 */
const slotsAt = (run, fight) => run.memo("value-party", String(fight), () => {
  const s = run?.scene ?? null;
  const here = waveOf(run);
  const party = (run?.facts?.party ?? []).filter(Boolean);
  const at = partyAtFight(s, party, { from: here, fight });
  const proj = levelProjection(s, { from: here, fight });
  const slots = party.map(mon => {
    const dead = at.dead.find(d => d.mon === mon);
    if (dead) return { mon, name: mon.name ?? null, dead: dead.why, combatant: null, projection: null };
    const p = proj.of(mon, { participant: true, participants: at.members.length });
    return { mon, name: mon.name ?? null, dead: null, projection: p,
      combatant: combatantOf({ mon, level: p.level, species: p.species, form: p.form }) };
  });
  return { fight, slots, revive: at.revive, confidence: proj.confidence };
});

const isLive = x => !!x && (Array.isArray(x.moveset) || typeof x.getTypes === "function");
const specOf = x => (x?.mon ? x : isLive(x) ? { mon: x } : x ?? {});

/**
 * The newcomer as a combatant, at the level it reaches by the fight. It joins on the bench, so only EXP share, a
 * Lucky Egg and its own distance from the cap catch it up (#567, story 7).
 *
 * A spec with no live mon behind it is built from what it names and marked `estimate`; the wild-spawn build a biome
 * species or a trade offer needs — its catch level, its learnset moves, no passive — is #580's.
 */
const newcomerOf = (run, fight, spec) => {
  const s = run?.scene ?? null;
  const mon = spec.mon ?? null;
  const level = Math.max(1, Math.floor(spec.level ?? mon?.level ?? 1));
  const p = levelProjection(s, { from: waveOf(run), fight })
    .of(mon ?? { species: spec.species ?? null, formIndex: spec.form ?? 0, level });
  const combatant = combatantOf({ ...spec, mon, level: p.level, species: p.species ?? spec.species,
    form: p.form ?? spec.form });
  return {
    combatant, projection: p, name: combatant?.name ?? null,
    // A newcomer a challenge bars is dead weight the moment it joins (CONTEXT.md, `Dead weight`).
    barred: mon ? !tryDo(() => mon.isAllowedInChallenge(), true) : false,
    confidence: mon ? p.confidence : weakestOf(p.confidence, CONFIDENCE.estimate),
  };
};

const RELEASE = 0; // #581 prices the held items a release destroys; until then a release costs nothing

/**
 * Judge a newcomer by the team value its swap makes (#567). `newcomer` is a live mon, or a spec the combatant
 * adapter builds; `replace` forces the member that leaves, for a GTS offer where the traded member is the one going,
 * and skips the search. `fight` overrides the wave to judge at, which is otherwise the next big fight ahead.
 *
 * The verdict is `take` for a free slot, `swap` with the member the search picked, or `skip`. `replaced` carries the
 * search's pick whether or not the swap clears the margin, so a card can say who would have gone. Reasons are #579's
 * and the roster half of the threat set is #592's, so what comes back here is judged on the standard threats alone.
 */
export const judgeNewcomer = (run, newcomer, { replace = null, fight = null } = {}) => {
  const s = run?.scene ?? null;
  const here = waveOf(run);
  const at = fight ?? nextBigFight(s, here);
  const set = standardThreats(run, { fight: at ?? here });
  const party = slotsAt(run, at);
  const live = party.slots.filter(x => x.combatant);
  const before = teamValue(run, set, live);
  const spec = specOf(newcomer);
  const nc = newcomerOf(run, at, spec);
  const out = {
    fight: at, wave: set.wave, verdict: "skip", replaced: null, delta: 0, release: RELEASE, margin: MARGIN, net: 0,
    plain: null, before, after: null, newcomer: nc,
    confidence: weakestOf(set.confidence, party.confidence, nc.confidence),
  };
  if (set.unavailable || !nc.combatant) {
    return { ...out, unavailable: set.unavailable ?? "the newcomer has no stats to duel with" };
  }
  if (nc.barred) return { ...out, plain: { kind: "barred", name: nc.name } };

  const joining = { name: nc.name, combatant: nc.combatant };
  if (party.slots.length < PARTY_SIZE) {
    const after = teamValue(run, set, [...live, joining]);
    const delta = after.v - before.v;
    // Holding a free slot open costs nothing, so there is no release to net off (#567).
    return { ...out, verdict: delta > MARGIN ? "take" : "skip", delta, net: delta, after };
  }

  const forced = replace ? party.slots.filter(x => x.mon === replace || x.name === replace) : party.slots;
  // The pair scores are memoised per member and threat, so swapping a slot out re-reads the rows rather than the
  // duels: a full search over six members is the budget's uncached cost once (#567).
  const tried = forced.map(slot => {
    const after = teamValue(run, set, [...live.filter(x => x !== slot), joining]);
    return { slot, after, delta: after.v - before.v, release: RELEASE };
  });
  const best = tried.reduce((b, x) => (!b || x.delta - x.release > b.delta - b.release ? x : b), null);
  if (!best) return { ...out, unavailable: "no member to replace" };
  const net = best.delta - best.release;
  const verdict = net > MARGIN ? "swap" : "skip";
  return {
    ...out, verdict, delta: best.delta, release: best.release, net, after: best.after, tried,
    replaced: { mon: best.slot.mon, name: best.slot.name, dead: best.slot.dead },
    // The plain case is dead weight *replaced*: a card that isn't swapping it has nothing plain to say about it.
    plain: verdict === "swap" && best.slot.dead
      ? { kind: "dead weight", name: best.slot.name, why: best.slot.dead } : null,
  };
};
