// The pivot card (CONTEXT.md, `Pivot`). The pick is asked while the turn is still resolving, so no turn read is opened
// for it (CONTEXT.md, `Turn read`): the card shows only the type chart's facts, and judges no pick (#530).
import { effectiveness, iconOf, typesOf } from "./01-core.js";
import { isPivot } from "./02-decision.js";
import { damagingTypes } from "./08-party.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const pctOf = p => { const max = tryDo(() => p.getMaxHp(), 0); return max > 0 ? Math.round((100 * p.hp) / max) : 0; };

// Not "the foe has chosen": an Emergency Exit from end-of-turn damage asks before the next turn's choice.
const WITHHELD = "mid-turn, no turn read: the turn is still resolving";
export const pivotLeadingCall = () => "your pick";

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
  const party = tryDo(() => s.getPlayerParty(), []);
  const field = b?.double ? 2 : 1;
  const foes = tryDo(() => s.getEnemyParty(), []).filter(f => f && f.hp > 0 && tryDo(() => f.isOnField(), true))
    .map(f => ({ name: f.name, icon: iconOf(f), hp: pctOf(f), types: tryDo(() => typesOf(f), []), attacks: damagingTypes(f) }));
  const out = party[ph.fieldIndex] ?? null;
  return {
    kind: "pivot",
    turn: b?.turn ?? null,
    slot: ph.fieldIndex ?? 0,
    out: out ? { name: out.name, icon: iconOf(out) } : null,
    // The party screen sends only from past the field (game-code.md §9).
    bench: party.slice(field).filter(p => p && p.hp > 0).map(p => benchOf(p, foes)),
    foes,
  };
};

const effText = e => `×${+e.toFixed(2)}`;
export const hitsText = m => (m.hits.length ? `hit by ${m.hits.map(x => `${x.from}'s ${x.type} ${effText(x.e)}`).join(", ")}`
  : m.resists ? "resists every foe attack type" : null);
const benchText = m => [`${m.name} ${m.hp}%`, m.types.join("/"), hitsText(m)].filter(Boolean).join(" ");

export const pivotActSummary = () => `${pivotLeadingCall()} — ${WITHHELD}`;
export const pivotSummary = m => [pivotActSummary(), ...m.bench.map(benchText)].join(" · ");
