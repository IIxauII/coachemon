// The pivot card (CONTEXT.md, `Pivot`). The pick is asked while the turn is still resolving, so no turn read is opened
// for it (CONTEXT.md, `Turn read`): the card shows the type chart's facts, and the pick the command's battle card
// planned while the field it was planned on holds (#530).
import { effectiveness, iconOf, typesOf } from "./01-core.js";
import { isPivot } from "./02-decision.js";
import { damagingTypes } from "./08-party.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const pctOf = p => { const max = tryDo(() => p.getMaxHp(), 0); return max > 0 ? Math.round((100 * p.hp) / max) : 0; };

// Not "the foe has chosen": an Emergency Exit from end-of-turn damage asks before the next turn's choice.
const WITHHELD = "mid-turn, no turn read: the turn is still resolving";
// A held oracle line's pivot leads instead (60-card.js).
export const pivotLeadingCall = m => (m.planned ? `send ${m.planned.name}` : "your pick");

// The pivot's own phase, from its first frame: the party screen's fade included, so nothing builds a battle card there.
export const pivotScreen = s => {
  const ph = tryDo(() => s.phaseManager.getCurrentPhase());
  return isPivot(ph) ? ph : null;
};

const benchOf = (m, foes) => {
  const attacks = foes.flatMap(f => f.attacks.map(type => ({ from: f.name, type, e: effectiveness(type, m) })));
  return {
    name: m.name, icon: iconOf(m), hp: pctOf(m), types: tryDo(() => typesOf(m), []),
    hits: attacks.filter(a => a.e >= 2),
    resists: attacks.length > 0 && attacks.every(a => a.e <= 0.5),
  };
};

// Read inside a run read, which restores whatever a game call it makes might move.
export const pivotModel = (run, ph) => {
  const s = run.scene, b = s.currentBattle;
  const party = tryDo(() => s.getPlayerParty(), []), enemies = tryDo(() => s.getEnemyParty(), []);
  const field = b?.double ? 2 : 1;
  const foes = enemies.filter(f => f && f.hp > 0 && tryDo(() => f.isOnField(), true))
    .map(f => ({ id: f.id, name: f.name, icon: iconOf(f), hp: pctOf(f), types: tryDo(() => typesOf(f), []), attacks: damagingTypes(f) }));
  const out = party[ph.fieldIndex] ?? null;
  return {
    kind: "pivot",
    turn: b?.turn ?? null,
    slot: ph.fieldIndex ?? 0,
    out: out ? { name: out.name, icon: iconOf(out) } : null,
    // The party screen sends only from past the field (game-code.md §9).
    bench: party.slice(field).filter(p => p && p.hp > 0).map(p => benchOf(p, foes)),
    foes,
    fallen: enemies.filter(f => f && f.hp <= 0).map(f => f.id),
  };
};

const foesMoved = (m, against) => {
  const now = new Set(m.foes.map(f => f.id)), then = new Set(against.map(f => f.id));
  return [...against.filter(f => !now.has(f.id)).map(f => `${f.name} ${m.fallen.includes(f.id) ? "fell" : "left the field"}`),
    ...m.foes.filter(f => !then.has(f.id)).map(f => `${f.name} came in`)].join(", ");
};
// `from`: the battle card built for the last battle decision. Its field plan's pick for the mon leaving holds only on
// this turn, still on the bench, against the foes it was planned on; otherwise `unplanned` says why.
export const pivotPlanned = (m, from) => {
  const no = unplanned => ({ planned: null, unplanned });
  if (from?.kind !== "battle" || !from.field || from.wave !== m.wave || from.turn !== m.turn) return no("no plan from this turn's command");
  const pick = from.field.slots.find(sl => sl.name === m.out?.name)?.pivot;
  if (!pick) return no(`the plan at the command sent no one in for ${m.out?.name ?? "the mon leaving"}`);
  if (!m.bench.some(b => b.name === pick.name)) return no(`${pick.name}, planned at the command, is down`);
  const moved = foesMoved(m, from.against ?? []);
  return moved ? no(`planned for ${pick.name}, but ${moved}`) : { planned: pick, unplanned: null };
};

const effText = e => `×${+e.toFixed(2)}`;
export const hitsText = m => (m.hits.length ? `hit by ${m.hits.map(x => `${x.from}'s ${x.type} ${effText(x.e)}`).join(", ")}`
  : m.resists ? "resists every foe attack type" : null);
const benchText = m => [`${m.name} ${m.hp}%`, m.types.join("/"), hitsText(m)].filter(Boolean).join(" ");

export const pivotPickSummary = m => (m.planned ? `${pivotLeadingCall(m)} (planned at the command)`
  : `${pivotLeadingCall(m)} — ${m.unplanned ? `${m.unplanned} · ` : ""}${WITHHELD}`);
export const pivotSummary = (m, act) => [act, ...m.bench.map(benchText)].join(" · ");
