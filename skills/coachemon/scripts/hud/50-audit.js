// Team audit: what is wrong with how the party is built, said between waves while there is still a shop, a TM or a
// Memory Mushroom to fix it with. Every other card judges one decision; this one judges the team the decisions made.
// It came out of two lost runs (#89): a wave-165 Guzma loss at level parity, where only one mon outsped the bosses and
// one Blizzard was the only answer to Flygon, and a wave-30 Whitney loss where half the party was weak to Fighting,
// nobody resisted Rock, and a Diglett eleven levels behind carried a Normal move as its only attack. Everything the
// audit needed was on the party snapshot; no card said it.
//
// Two kinds of check, told apart because they rest on different things:
// - **Party checks** read only the party. The party profile (CONTEXT.md): a type most of us are weak to and nobody
//   resists, the types no move of ours hits super-effectively. Then each member: dead move slots (and the level-up move a Memory Mushroom would put in one), members left
//   far behind the carry, EXP items stacked on a party that sits at the level cap.
// - **Roster checks** read the next big fight's roster from 49-ahead (the preview's replay, only within its look-ahead
//   window): who outspeeds its fastest foe, a foe only one member hits super-effectively, a status move most of the
//   roster is immune to, and the member that answers nothing in it.
// The game rules it rests on are in references/game-code.md §17. The thresholds are first cuts. A finding is `{ kind, level, text, mon? }`: `level` "high" for what loses fights
// (single answers, speed, a shared weakness), "low" for what only costs tempo.
import { TYPES, abilitiesOf, effectiveness, typesOf, vs } from "./01-core.js";
import { isDamaging, isFixed, learnAdvice, learnMoveById, slotScores } from "./40-learn.js";
import { doubleOdds } from "./49-ahead.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const movesOf = p => (p?.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(Boolean);
const nameOf = mv => String(mv?.name ?? "").replace(/ \(N\)$/, "");
const list = (xs, n = 3) => `${xs.slice(0, n).join("/")}${xs.length > n ? ` +${xs.length - n}` : ""}`;
// Attacks whose type the chart applies to: fixed damage (Seismic Toss) hits everything for the same number.
const typedAttacks = p => movesOf(p).filter(mv => isDamaging(mv) && !isFixed(mv) && mv.power !== 0);

// ---- Party checks
// A shared weakness: an attacking type at least two of us (and a third of the party) take double from, with nobody
// resisting it — so there is no safe switch-in when it comes. Ability immunities count as a resist (`effectiveness`).
const sharedWeakness = party => {
  if (party.length < 2) return [];
  return TYPES.map(t => {
    const mult = party.map(p => tryDo(() => effectiveness(t, p), 1));
    return { t, weak: party.filter((_, i) => mult[i] >= 2), quad: party.filter((_, i) => mult[i] >= 4), resist: mult.filter(m => m <= 0.5).length };
  }).filter(x => x.weak.length >= Math.max(2, Math.ceil(party.length / 3)) && x.resist === 0)
    .sort((a, b) => b.weak.length - a.weak.length || b.quad.length - a.quad.length)
    .slice(0, 2)
    .map(x => ({ kind: "weakness", level: "high", type: x.t,
      text: `${x.weak.length} of ${party.length} weak to ${x.t}${x.quad.length ? ` (${x.quad.map(p => p.name).join("/")} ×4)` : ""}, nobody resists` }));
};

// Defending types no attack of ours hits super-effectively. Single types, as the chart has them: a dual type is hit
// super-effectively by anything that hits either half, so the single types are the holes worth naming. Types the next
// big fight brings go first.
const typeHoles = (party, rosterTypes) => {
  const ours = new Set(party.flatMap(p => typedAttacks(p).map(mv => TYPES[mv.type])));
  if (!ours.size) return [];
  // Normal is left out: only Fighting hits it super-effectively, and nothing resists being hit neutrally by the rest.
  const holes = TYPES.filter(d => d !== "Normal" && ![...ours].some(t => vs(t, d) >= 2));
  if (!holes.length) return [];
  const ahead = holes.filter(t => rosterTypes.has(t));
  const sorted = [...ahead, ...holes.filter(t => !rosterTypes.has(t))];
  return [{ kind: "coverage", level: ahead.length ? "high" : "low", types: sorted,
    text: `nothing hits ${list(sorted, 4)} super-effectively${ahead.length ? ` — ${list(ahead, 2)} ahead` : ""}` }];
};

// Dead or weak move slots, by rules a player would name, scored with the learn card's own `slotScores` so the two
// cards can't disagree about a move:
// - no attack of the mon's own type (no STAB), or no attack at all;
// - an attack on the stat it doesn't use (Play Rough on Atk 223 / SpA 312);
// - setup that boosts only the attack stat it doesn't use (Nasty Plot on a physical attacker);
// - a second attack of a type it already has, the weaker of the two;
// - a status move the learn scorer rates as nearly worthless (Growl, Leer, Helping Hand in singles);
// - a moveset that is mostly status.
const WEAK_STATUS = 20;      // a status slot scored below this is dead weight (Scary Face 16, Growl 8; Howl on a physical attacker 30)
const OFF_STAT = 0.75;       // an attack on a stat below this share of the other one
const slotFindings = (p, party, double) => {
  const scored = tryDo(() => slotScores(p, { double, party }));
  if (!scored?.moves?.length) return [];
  const moves = movesOf(p);
  const out = [];
  const add = (text, slot, level = "low") => out.push({ kind: "slot", level, text: `${p.name}: ${text}`, mon: p.name, slot });
  const own = tryDo(() => typesOf(p), []);
  const attacks = scored.moves.map((x, i) => ({ x, mv: moves[i] })).filter(({ mv }) => mv && isDamaging(mv));
  if (!attacks.length) add("no attacking move", null, "high");
  // Fixed damage and a type the scorer can't pin (Weather Ball) claim no STAB either way, so they don't count against it.
  else if (own.length && !attacks.some(({ x }) => x.stab || x.fixed || x.notes?.includes("type varies"))) {
    add(`no ${list(own, 2)} attack (no STAB)`, null, attacks.length === 1 ? "high" : "low");
  }
  const { atk, spa } = scored;
  for (const { x, mv } of attacks) {
    if (x.fixed) continue;
    const [mine, other, stat] = mv.category === MoveCategory.PHYSICAL ? [atk, spa, "Atk"] : [spa, atk, "SpA"];
    if (mine < other * OFF_STAT) add(`${x.name} is ${x.cat} on ${stat} ${mine} (${stat === "Atk" ? "SpA" : "Atk"} ${other})`, x.name);
  }
  const main = atk >= spa * 0.9 && spa >= atk * 0.9 ? null : atk > spa ? Stat.ATK : Stat.SPATK;
  for (const [i, x] of scored.moves.entries()) {
    const mv = moves[i];
    if (!mv || mv.category !== MoveCategory.STATUS || main == null) continue;
    const boosts = (mv.attrs ?? []).filter(a => a.constructor?.name === "StatStageChangeAttr" && (a.stages ?? 0) > 0
      && (a.selfTarget || [MoveTarget.USER, MoveTarget.USER_AND_ALLIES, MoveTarget.USER_SIDE].includes(mv.moveTarget)));
    const stats = [...new Set(boosts.flatMap(a => a.stats ?? []))];
    if (stats.length && stats.every(s => s === (main === Stat.ATK ? Stat.SPATK : Stat.ATK))) add(`${x.name} boosts ${main === Stat.ATK ? "SpA" : "Atk"}, it attacks with ${main === Stat.ATK ? "Atk" : "SpA"}`, x.name);
  }
  const byType = new Map();
  for (const { x } of attacks) if (!x.fixed) byType.set(x.type, [...(byType.get(x.type) ?? []), x]);
  for (const [type, xs] of byType) {
    if (xs.length < 2) continue;
    const [keep, ...rest] = [...xs].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    for (const r of rest) add(`${r.name} is a second ${type} attack (${keep.name})`, r.name);
  }
  const status = scored.moves.filter((_, i) => moves[i]?.category === MoveCategory.STATUS);
  for (const x of status) {
    if (x.value !== null && x.value < WEAK_STATUS && !out.some(f => f.slot === x.name)) add(`${x.name} does little${x.why ? ` (${x.why})` : ""}`, x.name);
  }
  if (status.length >= 3 && attacks.length <= 1) add(`${attacks.length} attack, ${status.length} status moves`, null, "high");
  return out;
};

// The best move a Memory Mushroom could put back: every move the game's relearn list offers this mon, run through
// the learn card's own decision, the biggest gain that clears the learn threshold. `getLearnableLevelMoves()`
// (pokemon.ts) is `[level, MoveId][]`: level-up moves at or under its level (evolution, prevolution and fusion moves
// included), its unlocked egg moves when it was a starter outside Daily and Fresh Start, and TMs it has used, minus
// what it knows — the list `RememberMoveModifier` indexes. A pure read of learnsets. `double` as for the learn card.
// null when nothing is an upgrade.
const RELEARN_MIN_GAIN = 10;
// Judged blind to the roster ahead (#122), like the slot scores whose dead slot it fixes: both are party checks.
// Memoised: the rewards card asks every tick, and each call runs the learn decision once per relearnable move.
const relearnMemo = new Map();
export const relearnBest = (p, party, double = 0) => {
  const ids = (tryDo(() => p.getLearnableLevelMoves(), []) ?? []).map(x => (Array.isArray(x) ? x[1] : x));
  const key = JSON.stringify([p.id, p.level, (p.moveset ?? []).map(m => m?.moveId), ids, Math.round(double * 100),
    party.map(q => [q.id, q.level, (q.moveset ?? []).map(m => m?.moveId)])]);
  if (relearnMemo.has(key)) return relearnMemo.get(key);
  const found = relearnScan(p, party, double, ids);
  relearnMemo.set(key, found);
  while (relearnMemo.size > 24) relearnMemo.delete(relearnMemo.keys().next().value);
  return found;
};
const relearnScan = (p, party, double, ids) => {
  let best = null;
  for (const id of new Set(ids)) {
    const mv = learnMoveById(party, id);
    if (!mv) continue;
    const a = tryDo(() => learnAdvice(p, mv, { double, party }));
    if (!a?.learn || (a.gain ?? 0) < RELEARN_MIN_GAIN) continue;
    if (!best || a.gain > best.gain) best = { move: nameOf(mv), type: TYPES[mv.type] ?? "Normal", forget: a.forget, gain: a.gain };
  }
  return best;
};

// Members far behind the carry can't switch into anything, so the top of the party absorbs every hit. Behind is
// at least 5 levels and under three quarters of the carry's level: 12 against 23 is a problem at wave 30, 150
// against 162 is not.
const levelSpread = (s, party) => {
  if (party.length < 2) return [];
  const carry = party.reduce((a, p) => (!a || p.level > a.level ? p : a), null);
  const behind = party.filter(p => p !== carry && carry.level - p.level >= 5 && p.level < carry.level * 0.75)
    .sort((a, b) => a.level - b.level);
  if (!behind.length) return [];
  const share = (s.modifiers ?? []).filter(m => m?.constructor?.name === "ExpShareModifier")
    .reduce((t, m) => t + (tryDo(() => m.getStackCount(), m.stackCount ?? 1) ?? 1), 0);
  return [{ kind: "levels", level: behind.length >= 2 || carry.level - behind[0].level >= 10 ? "high" : "low",
    text: `${list(behind.map(p => `${p.name} L${p.level}`), 3)} trail ${carry.name} L${carry.level} — lead ${behind.length === 1 ? "it" : "them"} on easy waves${share ? ` (EXP. All ×${share} feeds the bench)` : ""}` }];
};

// EXP items bought for a party that sits at the level cap: EXP past `getMaxExpLevel()` is lost, so every stack
// held is a pick that could have been a battle item.
const EXP_CLASSES = new Set(["ExpBoosterModifier", "ExpShareModifier"]);
const expAtCap = (s, party) => {
  const stacks = (s.modifiers ?? []).filter(m => EXP_CLASSES.has(m?.constructor?.name))
    .reduce((t, m) => t + (tryDo(() => m.getStackCount(), m.stackCount ?? 1) ?? 1), 0);
  const cap = tryDo(() => s.getMaxExpLevel());
  if (!stacks || cap == null || !party.length || party.some(p => p.level < cap)) return [];
  return [{ kind: "investment", level: "low",
    text: `whole party at the Lv ${cap} cap: ${stacks} EXP item stacks do nothing — take battle items` }];
};

// ---- Roster checks, against the next big fight's foes (plain data from 48-preview's `foeOf`)
// A replayed foe is a plain defender, so `effectiveness` reads it the way it reads a mon on the field: one type
// chart, one ability-immunity table (01-core's `defenderOf`).
// A member's answers to a foe: its attacks that hit it super-effectively off the stat it actually attacks with (a
// Play Rough on Atk 223 beside SpA 312 is not an answer), with their accuracy. Atk counts Huge / Pure Power, as the
// learn card's does.
const ATK_DOUBLED = ["Huge Power", "Pure Power"];
const onStat = (p, mv) => {
  const atk = tryDo(() => p.getStat(Stat.ATK), 0) * (tryDo(() => abilitiesOf(p), []).some(a => ATK_DOUBLED.includes(a)) ? 2 : 1);
  const spa = tryDo(() => p.getStat(Stat.SPATK), 0);
  return mv.category === MoveCategory.PHYSICAL ? atk >= spa * OFF_STAT : spa >= atk * OFF_STAT;
};
// The move is in hand here, so the foe's flag immunities count too — a Soundproof foe has no answer to take from
// a sound move, whatever the chart says about its types.
const answersTo = (p, foe) => typedAttacks(p).filter(mv => effectiveness(TYPES[mv.type], foe, mv) >= 2 && onStat(p, mv))
  .map(mv => ({ name: nameOf(mv), acc: mv.accuracy > 0 ? mv.accuracy : 100 }));

// Speed: the fight is decided by who moves first more than by levels. Flag when at most one of us outspeeds the
// roster's fastest foe and nobody has a priority attack to go around it. Raw Speed on both sides: no stages, items
// or abilities, which move during the fight.
const PRIORITY_ABILITIES = new Set(["Gale Wings"]); // Flying moves at full HP; Prankster and Triage don't attack
const speedCheck = (party, foes, wave) => {
  const fastest = foes.reduce((a, f) => ((f.stats?.[Stat.SPD - 1] ?? 0) > (a?.stats?.[Stat.SPD - 1] ?? -1) ? f : a), null);
  const spe = fastest?.stats?.[Stat.SPD - 1]; // 48-preview's `stats` is Atk…Spe, no HP
  if (!spe) return [];
  const faster = party.filter(p => tryDo(() => p.getStat(Stat.SPD), 0) > spe);
  const priority = party.filter(p => typedAttacks(p).some(mv => (mv.priority ?? 0) > 0)
    || (tryDo(() => abilitiesOf(p), []).some(a => PRIORITY_ABILITIES.has(a)) && typedAttacks(p).some(mv => TYPES[mv.type] === "Flying")));
  if (faster.length >= 2 || priority.length) return [];
  return [{ kind: "speed", level: "high",
    text: `${faster.length ? `only ${faster[0].name} outspeeds` : "nobody outspeeds"} ${fastest.name} (Spe ${spe}) at W${wave} · no priority attack` }];
};

const singleAnswers = (party, foes, wave) => foes.map(f => {
  const who = party.map(p => ({ p, moves: answersTo(p, f) })).filter(x => x.moves.length);
  if (who.length !== 1) return null;
  const m = who[0].moves.sort((a, b) => b.acc - a.acc)[0];
  return { kind: "answers", level: "high",
    text: `${f.name} (W${wave}) has one answer: ${who[0].p.name} ${m.name}${m.acc < 100 ? ` (${m.acc}%)` : ""}` };
}).filter(Boolean);

// StatusEffect → the types it can't land on: `Pokemon.canSetStatus`'s type checks. Corrosion on the user cancels
// the poison ones (`IgnoreTypeStatusEffectImmunityAbAttr`); the foes' abilities are left out.
const STATUS_IMMUNE = { [StatusEffect.POISON]: ["Poison", "Steel"], [StatusEffect.TOXIC]: ["Poison", "Steel"], [StatusEffect.PARALYSIS]: ["Electric"],
  [StatusEffect.FREEZE]: ["Ice"], [StatusEffect.BURN]: ["Fire"] };
const deadStatus = (party, foes, wave) => party.flatMap(p => movesOf(p).filter(mv => mv.category === MoveCategory.STATUS).flatMap(mv => {
  const a = (mv.attrs ?? []).find(x => x.constructor?.name === "StatusEffectAttr" && !x.selfTarget);
  const immune = STATUS_IMMUNE[a?.effect];
  if (!immune || ((a.effect === StatusEffect.POISON || a.effect === StatusEffect.TOXIC) && tryDo(() => abilitiesOf(p), []).includes("Corrosion"))) return [];
  const n = foes.filter(f => (f.types ?? []).some(t => immune.includes(t))).length;
  return n * 2 >= foes.length && n ? [{ kind: "slot", level: "low", mon: p.name,
    text: `${p.name}: ${nameOf(mv)} can't land on ${n} of ${foes.length} foes at W${wave}` }] : [];
}));

// The member that hits nothing in the roster super-effectively: first in line to replace, when someone else does.
const weakestLink = (party, foes, wave) => {
  const idle = party.filter(p => !foes.some(f => answersTo(p, f).length));
  if (!idle.length || idle.length === party.length || party.length < 4) return [];
  return [{ kind: "link", level: "low",
    text: `${list(idle.map(p => p.name), 2)} ${idle.length === 1 ? "answers" : "answer"} nothing at W${wave} — first to replace` }];
};

// ---- The audit
// `ahead`: 49-ahead's model (for the roster, when it is near enough to be named). Cached on everything it reads.
let cache = { key: null, value: null };
export const teamAudit = (s, ahead) => {
  const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
  if (!party.length) return null;
  const wave = s.currentBattle?.waveIndex ?? 0;
  const next = ahead?.next;
  const foes = next?.foes?.length ? next.foes : [];
  const key = JSON.stringify([wave, next?.wave, foes.map(f => [f.name, f.level]), (s.modifiers ?? []).length,
    party.map(p => [p.id, p.species?.speciesId, p.level, p.hp > 0, (p.moveset ?? []).map(m => m?.moveId)])]);
  if (cache.key === key) return cache.value;
  const double = tryDo(() => doubleOdds(s, wave + 1), 0);
  const findings = [];
  if (foes.length) {
    findings.push(...singleAnswers(party, foes, next.wave), ...speedCheck(party, foes, next.wave));
  }
  findings.push(...sharedWeakness(party),
    ...typeHoles(party, new Set(foes.flatMap(f => f.types ?? []))));
  // Dead slots, and the relearn that fixes one: named once per member, on its highest-ranked finding (below).
  const fixes = new Map();
  for (const p of party) {
    const slots = slotFindings(p, party, double);
    if (!slots.length) continue;
    const fix = tryDo(() => relearnBest(p, party, double));
    if (fix) fixes.set(p.name, fix);
    findings.push(...slots);
  }
  if (foes.length) findings.push(...deadStatus(party, foes, next.wave), ...weakestLink(party, foes, next.wave));
  findings.push(...levelSpread(s, party), ...expAtCap(s, party));
  // What loses fights first; among the rest, a standing coverage hole last — almost every party has some, and it
  // shouldn't be the line the collapsed card leads with while a dead slot is there to fix.
  const rank = f => (f.level === "high" ? 0 : f.kind === "coverage" ? 2 : 1);
  const sorted = findings.map((f, i) => ({ ...f, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i).map(({ i, ...f }) => f);
  for (const [mon, fix] of fixes) {
    // The slot it replaces when that slot is flagged; else the member's top finding.
    const at = sorted.find(f => f.kind === "slot" && f.mon === mon && f.level === "high")
      ?? sorted.find(f => f.kind === "slot" && f.mon === mon && fix.forget && f.slot === fix.forget)
      ?? sorted.find(f => f.kind === "slot" && f.mon === mon);
    if (at) at.relearn = fix;
  }
  const value = { wave, vs: foes.length ? { wave: next.wave, who: next.trainer ?? next.label } : null, findings: sorted };
  cache = { key, value };
  return value;
};

// `4 issues: Flygon (W165) has one answer: Dudunsparce Blizzard (70%); only Crobat outspeeds Flygon …`, what loses
// fights first.
export const auditSummary = a => {
  const found = a?.findings ?? [];
  if (!found.length) return null;
  const text = f => `${f.text}${f.relearn ? ` (relearn ${f.relearn.move}${f.relearn.forget ? ` over ${f.relearn.forget}` : ""})` : ""}`;
  return `${found.length} issue${found.length === 1 ? "" : "s"}: ${found.slice(0, 3).map(text).join("; ")}`;
};
