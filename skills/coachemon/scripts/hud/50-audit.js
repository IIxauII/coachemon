// How the party is built, judged between waves (CONTEXT.md, `Team audit`; game-code.md §17). A finding is
// `{ kind, level, text, mon? }`: `level` "high" for what loses fights, "low" for what only costs tempo.
import { TYPES, abilitiesOf, effectiveness, typesOf, vs } from "./01-core.js";
import { isDamaging, isFixed, learnAdvice, learnMoveById, slotScores } from "./40-learn.js";
import { doubleOdds } from "./49-ahead.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const movesOf = p => (p?.moveset ?? []).filter(Boolean).map(pm => tryDo(() => pm.getMove())).filter(Boolean);
const nameOf = mv => String(mv?.name ?? "").replace(/ \(N\)$/, "");
const list = (xs, n = 3) => `${xs.slice(0, n).join("/")}${xs.length > n ? ` +${xs.length - n}` : ""}`;
const typedAttacks = p => movesOf(p).filter(mv => isDamaging(mv) && !isFixed(mv) && mv.power !== 0);

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

const typeHoles = (party, rosterTypes) => {
  const ours = new Set(party.flatMap(p => typedAttacks(p).map(mv => TYPES[mv.type])));
  if (!ours.size) return [];
  // Not Normal: only Fighting hits it super-effectively, so nearly every party would name it.
  const holes = TYPES.filter(d => d !== "Normal" && ![...ours].some(t => vs(t, d) >= 2));
  if (!holes.length) return [];
  const ahead = holes.filter(t => rosterTypes.has(t));
  const sorted = [...ahead, ...holes.filter(t => !rosterTypes.has(t))];
  return [{ kind: "coverage", level: ahead.length ? "high" : "low", types: sorted,
    text: `nothing hits ${list(sorted, 4)} super-effectively${ahead.length ? ` — ${list(ahead, 2)} ahead` : ""}` }];
};

const WEAK_STATUS = 20;
const OFF_STAT = 0.75;
const slotFindings = (p, party, double) => {
  const scored = tryDo(() => slotScores(p, { double, party }));
  if (!scored?.moves?.length) return [];
  const moves = movesOf(p);
  const out = [];
  const add = (text, slot, level = "low") => out.push({ kind: "slot", level, text: `${p.name}: ${text}`, mon: p.name, slot });
  const own = tryDo(() => typesOf(p), []);
  const attacks = scored.moves.map((x, i) => ({ x, mv: moves[i] })).filter(({ mv }) => mv && isDamaging(mv));
  if (!attacks.length) add("no attacking move", null, "high");
  // Fixed damage and a type the scorer can't pin (Weather Ball) claim no STAB either way.
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
    // `alone` is the move's worth before the learn scorer's crowded-moveset penalty: a mostly-status moveset is its
    // own finding, made once (#233).
    const own = x.alone ?? x.value;
    if (x.value !== null && own < WEAK_STATUS && !out.some(f => f.slot === x.name)) add(`${x.name} does little${x.why ? ` (${x.why})` : ""}`, x.name);
  }
  if (status.length >= 3 && attacks.length <= 1) add(`${attacks.length} attack, ${status.length} status moves`, null, "high");
  return out;
};

const RELEARN_MIN_GAIN = 10;
const relearnMemo = new Map();
// The best move a Memory Mushroom could put back (game-code.md §17), or null when none clears `RELEARN_MIN_GAIN`.
// Blind to the roster ahead, like the slot scores: both are party checks (#122).
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

// A party at the cap gains nothing from any EXP item (game-code.md §17).
const EXP_CLASSES = new Set(["ExpBoosterModifier", "ExpShareModifier"]);
const expAtCap = (s, party) => {
  const stacks = (s.modifiers ?? []).filter(m => EXP_CLASSES.has(m?.constructor?.name))
    .reduce((t, m) => t + (tryDo(() => m.getStackCount(), m.stackCount ?? 1) ?? 1), 0);
  const cap = tryDo(() => s.getMaxExpLevel());
  if (!stacks || cap == null || !party.length || party.some(p => p.level < cap)) return [];
  return [{ kind: "investment", level: "low",
    text: `whole party at the Lv ${cap} cap: ${stacks} EXP item stacks do nothing — take battle items` }];
};

const ATK_DOUBLED = ["Huge Power", "Pure Power"];
const onStat = (p, mv) => {
  const atk = tryDo(() => p.getStat(Stat.ATK), 0) * (tryDo(() => abilitiesOf(p), []).some(a => ATK_DOUBLED.includes(a)) ? 2 : 1);
  const spa = tryDo(() => p.getStat(Stat.SPATK), 0);
  return mv.category === MoveCategory.PHYSICAL ? atk >= spa * OFF_STAT : spa >= atk * OFF_STAT;
};
// With the move passed, `effectiveness` counts the foe's flag immunities too: Soundproof against a sound move.
const answersTo = (p, foe) => typedAttacks(p).filter(mv => effectiveness(TYPES[mv.type], foe, mv) >= 2 && onStat(p, mv))
  .map(mv => ({ name: nameOf(mv), acc: mv.accuracy > 0 ? mv.accuracy : 100 }));

// Gale Wings only: Triage's draining attacks move first too and aren't counted (game-code.md §17).
const PRIORITY_ABILITIES = new Set(["Gale Wings"]);
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

// `canSetStatus`'s type checks alone (game-code.md §17).
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

const weakestLink = (party, foes, wave) => {
  const idle = party.filter(p => !foes.some(f => answersTo(p, f).length));
  if (!idle.length || idle.length === party.length || party.length < 4) return [];
  return [{ kind: "link", level: "low",
    text: `${list(idle.map(p => p.name), 2)} ${idle.length === 1 ? "answers" : "answer"} nothing at W${wave} — first to replace` }];
};

// `ahead` is `aheadModel`'s. The memo key holds what the audit reads beyond the run key: the roster and each moveset.
export const teamAudit = (run, ahead) => {
  const party = run.facts.party;
  if (!party.length) return null;
  const next = ahead?.next;
  const foes = next?.foes?.length ? next.foes : [];
  const key = JSON.stringify([next?.wave, foes.map(f => [f.name, f.level]), party.map(p => [p.id, (p.moveset ?? []).map(m => m?.moveId)])]);
  return run.memo("audit", key, () => build(run, party, next, foes));
};
const build = (run, party, next, foes) => {
  const s = run.scene;
  const wave = run.facts.wave;
  const double = tryDo(() => doubleOdds(s, wave + 1), 0);
  const findings = [];
  if (foes.length) {
    findings.push(...singleAnswers(party, foes, next.wave), ...speedCheck(party, foes, next.wave));
  }
  findings.push(...sharedWeakness(party),
    ...typeHoles(party, new Set(foes.flatMap(f => f.types ?? []))));
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
  const rank = f => (f.level === "high" ? 0 : f.kind === "coverage" ? 2 : 1);
  const sorted = findings.map((f, i) => ({ ...f, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i).map(({ i, ...f }) => f);
  for (const [mon, fix] of fixes) {
    const at = sorted.find(f => f.kind === "slot" && f.mon === mon && f.level === "high")
      ?? sorted.find(f => f.kind === "slot" && f.mon === mon && fix.forget && f.slot === fix.forget)
      ?? sorted.find(f => f.kind === "slot" && f.mon === mon);
    if (at) at.relearn = fix;
  }
  return { wave, vs: foes.length ? { wave: next.wave, who: next.trainer ?? next.label } : null, findings: sorted };
};

export const auditSummary = a => {
  const found = a?.findings ?? [];
  if (!found.length) return null;
  const text = f => `${f.text}${f.relearn ? ` (relearn ${f.relearn.move}${f.relearn.forget ? ` over ${f.relearn.forget}` : ""})` : ""}`;
  return `${found.length} issue${found.length === 1 ? "" : "s"}: ${found.slice(0, 3).map(text).join("; ")}`;
};
