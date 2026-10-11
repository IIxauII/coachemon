// Team value (CONTEXT.md, `Team value`) and the judgment every newcomer card will read: what the party at the next
// big fight is worth against the threat set, in turn score, and what a newcomer's swap changes. It runs inside a run
// read and nowhere else — `run.memo` carries the pair scores, so the cards of one run read share them — and it draws
// nothing: every duel is the approx matrix over combatants the adapter built off the field.
import { stat } from "./01-core.js";
import { bigFightsAhead } from "./03-calendar.js";
import { formOf, partyAtFight } from "./08-party.js";
import { combatantOf, duelEnv, itemKeyOf, pricesItem } from "./09-combatant.js";
import { levelCapAt, levelProjection } from "./09-projection.js";
import { approxOutcomes, barBreakFactors, koChanceAt, koCurve, koTurns, targetFacts, useOf } from "./10-damage.js";
import { standardThreats } from "./11-threats.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// All seven in turns, and a change to any of them is a golden diff someone reviews (#567).
export const CLAMP = 3;
export const BACKUP = 0.5;
export const REVENGE = 0.5;
export const SWITCH_IN = 0.25;
export const EXPOSURE = n => 0.2 * n * n;
export const MARGIN = 0.1;
export const UNKNOWN_ITEM = 0.1;

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
 *
 * `of` is how many members stood in the row, which is the party a reason's exposure is counted out of: dead weight is
 * not one of them, so "beats 4 of 5" is of the five that can fight.
 */
const rowOf = (threat, pairs) => {
  const ranked = [...pairs].sort((a, b) => b.s - a.s);
  const beaten = pairs.filter(x => x.s < 0);
  const revenge = pairs.some(x => x.revenge), switchIn = pairs.some(x => x.switchIn);
  return {
    threat: threat.label, kind: threat.kind,
    answer: ranked[0] ?? null, backup: ranked[1] ?? null, beaten: beaten.map(x => x.name), of: pairs.length,
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
 *
 * The memo key holds what this reads beyond the run key (26-run.js), which is the projection's own run-wide and
 * per-member inputs — the run key carries the modifier *count*, so an EXP share stacking up, a Lucky Egg handed from
 * one member to another or Pokérus turning up would all leave it fixed — and each moveset, which the combatant the
 * slot carries reads and the run key does not either.
 */
const slotsAt = (run, fight) => {
  const s = run?.scene ?? null;
  const here = waveOf(run);
  const party = (run?.facts?.party ?? []).filter(Boolean);
  const proj = levelProjection(s, { from: here, fight });
  const key = JSON.stringify([fight, here, proj.expAll,
    party.map(mon => [...proj.inputs(mon), (mon.moveset ?? []).map(m => m?.moveId ?? null),
      heldOf(mon).map(itemKeyOf)])]);
  return run.memo("value-party", key, () => build(s, party, proj, { here, fight }));
};

const heldOf = mon => (tryDo(() => mon.getHeldItems(), []) ?? []).filter(Boolean);
// 30-planner's own read: an item that says nothing about itself is taken as transferable, which is what the game's
// own default is.
const goesWithIt = m => m.isTransferable !== false;

/**
 * What releasing `mon` would destroy: `items` is how many of them go with it, `gone` the ones the adapter can price,
 * which `releaseOf` hands to the member that stays, and `unpriced` the stacks nothing prices — each copy is an item
 * the release destroys, so three of a thing is three times the flat charge.
 *
 * The investment the member was fed stays with it and is in neither: a vitamin does not move house
 * (`isTransferable`), it is in the member's live stats already, and the release destroys the member either way, so it
 * is never counted twice (#567).
 */
const releasedBy = mon => {
  const gone = heldOf(mon).filter(goesWithIt);
  const unpriced = gone.filter(m => !pricesItem(m)).reduce((t, m) => t + stacksOf(m), 0);
  return { items: gone.length, unpriced, gone: gone.filter(pricesItem) };
};
const stacksOf = m => Math.max(1, Math.floor(tryDo(() => m.getStackCount(), m?.stackCount ?? 1) ?? 1));

const build = (s, party, proj, { here, fight }) => {
  const at = partyAtFight(s, party, { from: here, fight });
  const slots = party.map(mon => {
    const dead = at.dead.find(d => d.mon === mon);
    // A member that cannot fight earns no participant's share of the EXP on the way, so what its items are worth is
    // priced on it at the level the bench carries it to — the newcomer's own projection.
    const p = dead ? proj.of(mon) : proj.of(mon, { participant: true, participants: at.members.length });
    const spec = { level: p.level, species: p.species, form: p.form };
    const release = releasedBy(mon);
    // The member as it would stand holding `extra` on top of its own, which is how a release is priced on whoever
    // stays: the items the party keeps are the items the duel is re-run with.
    const holding = extra => combatantOf({ ...spec, mon, items: [...heldOf(mon), ...extra] });
    if (dead) return { mon, name: mon.name ?? null, dead: dead.why, combatant: null, projection: null, release };
    return { mon, name: mon.name ?? null, dead: null, projection: p, release, holding,
      combatant: combatantOf({ ...spec, mon }) };
  });
  return { fight, slots, revive: at.revive, confidence: proj.confidence };
};

const isLive = x => !!x && (Array.isArray(x.moveset) || typeof x.getTypes === "function");
const specOf = x => (x?.mon ? x : isLive(x) ? { mon: x } : x ?? {});

// The share of the level cap a wild mon spawns at (#567: ~0.75–0.8 of it), at the top of that band, and a golden diff
// to change like the six above.
export const CATCH_LEVEL = 0.8;

export const catchLevelAt = (s, wave) => Math.max(1, Math.round(CATCH_LEVEL * levelCapAt(s, wave)));

const STAND_IN_SLOTS = 4; // what the game gives a mon, and what the duel reads

/**
 * The last `STAND_IN_SLOTS` level-up moves `species`' learnset hands out at or below `level`, in learnset order.
 *
 * The randbats snapshot is deliberately not read here. It is a prior for breaking ties between movesets the coach
 * cannot see (CONTEXT.md, `Moveset prior`), and a competitive set is nothing like what a wild spawn turns up knowing:
 * a biome sold on one would promise a catch that does not exist (#567, out of scope).
 */
const learnsetMoves = (species, form, level) => {
  const f = formOf(species, form);
  const rows = tryDo(() => (typeof f?.getLevelMoves === "function" ? f : species).getLevelMoves(), []) ?? [];
  return rows
    .filter(r => Array.isArray(r) && typeof r[1] === "number" && (r[0] ?? 0) <= level)
    .slice(-STAND_IN_SLOTS)
    .map(r => r[1]);
};

/**
 * The newcomer as a combatant, at the level it reaches by the fight. It joins on the bench, so only EXP share, a
 * Lucky Egg and its own distance from the cap catch it up (#567, story 7).
 *
 * A spec with no live mon behind it is a **stand-in** — a biome species, a trade offer — and is built the way the game
 * builds a wild mon (#580): the expected catch level for the wave the run stands on where the spec names no level of
 * its own, the last four level-up learnset moves at that level, the species' default ability, no passive, and the
 * adapter's neutral IVs and nature. It is marked `standIn` and carries `estimate`, whatever its other inputs say,
 * because not one of those is the mon the player would actually be handed.
 *
 * The moves are the ones it is caught *with*, not the ones it would have learnt by the fight: a live member is judged
 * on the moves it knows now too (#567, story 9), and a card that promised a move the mon has yet to learn would be
 * read as a promise the duel does not keep.
 */
const newcomerOf = (run, fight, spec) => {
  const s = run?.scene ?? null;
  const mon = spec.mon ?? null;
  const standIn = !mon;
  const species = spec.species ?? mon?.species ?? null;
  const form = spec.form ?? mon?.formIndex ?? 0;
  // An offer that names a level — a Safari mon, a trade — keeps it; only a species nobody has met falls back to what
  // the wave would spawn.
  const level = Math.max(1, Math.floor(spec.level ?? mon?.level ?? (standIn ? catchLevelAt(s, waveOf(run)) : 1)));
  // An explicit `moves` wins, for an offer that names the set the mon comes with.
  const moves = spec.moves ?? (standIn ? learnsetMoves(species, form, level) : undefined);
  const p = levelProjection(s, { from: waveOf(run), fight })
    .of(mon ?? { species, formIndex: form, level });
  const built = items => combatantOf({ ...spec, mon, moves, level: p.level, species: p.species ?? species,
    form: p.form ?? form, ...(items ? { items } : {}) });
  const combatant = built(null);
  const own = spec.items ?? (mon ? heldOf(mon) : []);
  return {
    combatant, projection: p, standIn, name: combatant?.name ?? null,
    // A newcomer is one of the members that stay, so a release can be priced on it too (#581).
    holding: extra => built([...own, ...extra]),
    // A newcomer a challenge bars is dead weight the moment it joins (CONTEXT.md, `Dead weight`).
    barred: mon ? !tryDo(() => mon.isAllowedInChallenge(), true) : false,
    confidence: standIn ? weakestOf(p.confidence, CONFIDENCE.estimate) : p.confidence,
  };
};

/**
 * The release cost of one slot: the turns the member's **transferable** held items would add to the best remaining
 * member's threat row, which is where they would go if the member stayed and the player moved them (#567, story 10).
 *
 * `stay` is the party after the swap, the newcomer among it. Threat by threat, the items are handed to the member
 * whose pair score is that row's answer — rebuilt through the adapter holding its own and the gone ones together —
 * and the row is charged what the answer gains by them, never less than nothing. So what a release destroys is what
 * the gone items are worth *to the party that stays*: an item nothing left can use costs about nothing to release,
 * whatever it was worth to the member that carried it. A Thick Club leaves with the only Marowak.
 *
 * The mean over the threats, so the cost is in the turns per threat `teamValue` is, and ΔV can be netted against it.
 *
 * An item the adapter cannot price is charged a flat `UNKNOWN_ITEM` rather than taken as free: the duel is a race to
 * a KO, so a Leftovers or a Shell Bell does nothing in it that a stat multiplier could stand in for.
 */
const releaseOf = (run, env, set, slot, stay) => {
  const r = slot.release;
  const flat = UNKNOWN_ITEM * r.unpriced;
  const out = { items: r.items, unpriced: r.unpriced, flat };
  const threats = set?.threats ?? [];
  if (!r.gone.length || !threats.length || !stay?.length) return { ...out, cost: flat, worth: 0 };
  // One rebuild per member of the party that stays, however many threats ask for it.
  const laden = new Map();
  const withGone = m => {
    if (!laden.has(m)) laden.set(m, tryDo(() => m.holding(r.gone)));
    return laden.get(m);
  };
  const sOn = (c, th) => (c ? pairOf(run, env, c, th.combatant).s : null);
  const worth = threats.reduce((t, th) => {
    const best = stay.reduce((b, m) => (!b || sOn(m.combatant, th) > sOn(b.combatant, th) ? m : b), null);
    const was = sOn(best.combatant, th);
    const now = sOn(withGone(best), th);
    return t + (now === null ? 0 : Math.max(0, now - was));
  }, 0) / threats.length;
  return { ...out, cost: flat + worth, worth };
};

export const MAX_REASONS = 2; // "up to two reasons" (#567)

// A threat is named by what it stands for and nothing else: a type under its own name, a stat shape under `the` and
// its label, which is what makes either read as a sentence. Not the species standing for it — a reason the player can
// argue with is about Electric, not about the Jolteon the pick happened to land on.
const named = row => (row.kind === "archetype" ? `the ${row.threat}` : row.threat);

const sOf = p => p?.s ?? 0;

/**
 * What one threat's row says moved, as the three parts of the row's value that can move: the answer's margin, the
 * discounted backup, and the exposure the row is docked. All three are in turns, so the largest of them is the part
 * worth saying — and a gain is positive in each, exposure included, since the row subtracts it.
 *
 * The credits are left out: `revenge` and `switchIn` are flat and earned by whoever happens to be on the party, so a
 * reason built on one would say the swap changed a threat when all it changed was which member pays for it.
 */
const partsOf = (b, a) => [
  { part: "answer", d: sOf(a.answer) - sOf(b.answer) },
  { part: "backup", d: BACKUP * (sOf(a.backup) - sOf(b.backup)) },
  { part: "exposure", d: EXPOSURE(b.beaten.length) - EXPOSURE(a.beaten.length) },
];

/**
 * The words, pinned by the goldens (#567): the two the decision names outright are "no answer left to Electric" and
 * "Electric now beats 4 of 6", and the rest are those two read the other way.
 *
 * An answer and a backup are said on whether the party has one at all — a margin over the threat, which is what makes
 * it an answer — and not on the turns alone. A party that loses to a threat by less than it did has gained something,
 * but it has not gained a *better answer*: it has none to be better, and a card that said so would be read as a
 * promise the duel does not keep.
 */
const wordsOf = (part, gain, b, a) => {
  const who = named(a);
  if (part === "exposure") {
    const n = `${who} now beats ${a.beaten.length} of ${a.of}`;
    return gain ? `${n}, down from ${b.beaten.length}` : n;
  }
  const one = part === "answer" ? "an answer" : "a backup"; // the article the noun takes, where it needs one
  const had = sOf(b[part]) > 0, has = sOf(a[part]) > 0;
  if (gain) return has ? (had ? `a better ${part} to ${who}` : `${one} to ${who} at last`) : `nearer ${one} to ${who}`;
  return had ? (has ? `a weaker ${part} to ${who}` : `no ${part} left to ${who}`) : `further from ${one} to ${who}`;
};

/**
 * Up to `MAX_REASONS` reasons for the call: each a threat whose answer, backup or exposure moved most between the
 * before and after rows, named by type or archetype, as a gain or a loss.
 *
 * They are read off the very rows the verdict was, so a reason can never argue with the call it explains (#567, story
 * 20): `gain` is the direction of the call — take and swap are gains, skip is a loss — and a change the other way is
 * not a reason for it. A move smaller than `MARGIN` is not a reason either: the margin is what the judgment already
 * calls noise, and the goldens print to the tenth of a turn it is set in.
 *
 * One reason per threat, the biggest of its three parts, so two reasons are two threats rather than one twice.
 */
const reasonsOf = (before, after, gain) => {
  if (!after) return [];
  return before.rows
    .map((b, i) => {
      const a = after.rows[i];
      if (!a || a.threat !== b.threat) return null;
      const best = partsOf(b, a).reduce((x, y) => (Math.abs(y.d) > Math.abs(x.d) ? y : x));
      return { ...best, b, a };
    })
    .filter(x => x && (gain ? x.d >= MARGIN : x.d <= -MARGIN))
    // Stable, so a tie between two threats falls to the one the threat set lists first.
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, MAX_REASONS)
    .map(x => ({ threat: x.a.threat, kind: x.a.kind, part: x.part, gain, delta: x.d,
      text: wordsOf(x.part, gain, x.b, x.a) }));
};

// The two plain cases, said plainly (#567, story 17): a member that holds its slot for nothing, and a newcomer that
// would hold one for nothing the moment it joined.
const plainDead = (name, why) => ({ kind: "dead weight", name, why,
  text: `${name ?? "it"} is dead weight: ${why === "barred" ? "a challenge bars it" : "fainted with no way back"}` });
const plainBarred = name => ({ kind: "barred", name,
  text: `a challenge bars ${name ?? "it"}: dead weight the moment it joins` });

/**
 * Judge a newcomer by the team value its swap makes (#567). `newcomer` is a live mon, or a spec the combatant
 * adapter builds; `replace` forces the member that leaves, for a GTS offer where the traded member is the one going,
 * and skips the search. `fight` overrides the wave to judge at, which is otherwise the next big fight ahead.
 *
 * The verdict is `take` for a free slot, `swap` with the member the search picked, or `skip`. `replaced` carries the
 * search's pick whether or not the swap clears the margin, so a card can say who would have gone. `release` is what
 * that release destroys and `cost` its parts, `net` is ΔV less the release, `reasons` are the threats the call is read
 * off, and `plain` the one case that needs no threat at all. The roster half of the threat set is #592's, so what
 * comes back here is judged on the standard threats alone.
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
    fight: at, wave: set.wave, verdict: "skip", replaced: null, delta: 0, release: 0, margin: MARGIN, net: 0,
    reasons: [], plain: null, before, after: null, newcomer: nc,
    confidence: weakestOf(set.confidence, party.confidence, nc.confidence),
  };
  if (set.unavailable || !nc.combatant) {
    return { ...out, unavailable: set.unavailable ?? "the newcomer has no stats to duel with" };
  }
  // Nothing is scored with a barred newcomer on the party, so there are no rows to read a reason off: the bar is the
  // whole of what the card has to say.
  if (nc.barred) return { ...out, plain: plainBarred(nc.name) };

  const joining = { name: nc.name, combatant: nc.combatant, holding: nc.holding };
  if (party.slots.length < PARTY_SIZE) {
    const after = teamValue(run, set, [...live, joining]);
    const delta = after.v - before.v;
    // Holding a free slot open costs nothing, so there is no release to net off (#567).
    const verdict = delta > MARGIN ? "take" : "skip";
    return { ...out, verdict, delta, net: delta, after, reasons: reasonsOf(before, after, verdict !== "skip") };
  }

  const forced = replace ? party.slots.filter(x => x.mon === replace || x.name === replace) : party.slots;
  // The pair scores are memoised per member and threat, so swapping a slot out re-reads the rows rather than the
  // duels: a full search over six members is the budget's uncached cost once (#567).
  const env = duelEnv(s);
  const tried = forced.map(slot => {
    const stay = [...live.filter(x => x !== slot), joining];
    const after = teamValue(run, set, stay);
    const cost = releaseOf(run, env, set, slot, stay);
    return { slot, after, delta: after.v - before.v, release: cost.cost, cost };
  });
  // The release is netted off inside the search as well as outside it: a member worth a little less than another to
  // the team, but carrying what the team would lose, is the dearer of the two to release (#567, story 10).
  const best = tried.reduce((b, x) => (!b || x.delta - x.release > b.delta - b.release ? x : b), null);
  if (!best) return { ...out, unavailable: "no member to replace" };
  const net = best.delta - best.release;
  const verdict = net > MARGIN ? "swap" : "skip";
  return {
    ...out, verdict, delta: best.delta, release: best.release, cost: best.cost, net, after: best.after, tried,
    replaced: { mon: best.slot.mon, name: best.slot.name, dead: best.slot.dead },
    reasons: reasonsOf(before, best.after, verdict !== "skip"),
    // The plain case is dead weight *replaced*: a card that isn't swapping it has nothing plain to say about it.
    plain: verdict === "swap" && best.slot.dead ? plainDead(best.slot.name, best.slot.dead) : null,
  };
};
