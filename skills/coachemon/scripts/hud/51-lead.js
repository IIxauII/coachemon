// Who should lead into the next wave (#713): a member that wins the preview's opener where the lead loses it. It
// judges the party as the reward screen holds it and moves nobody.
import { iconOf, weakestConfidence } from "./01-core.js";
import { combatantOf, previewFoeOf } from "./09-combatant.js";
import { duel } from "./12-value.js";
import { confidenceMark } from "./48-preview.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

const RESTS_ON = ["foes", "levels", "double"];

// A fainted slot 0 does not lead: the first allowed member after it does (game-code.md §32).
const standing = party => party.map((mon, slot) => ({ mon, slot }))
  .filter(x => tryDo(() => x.mon.isAllowedInBattle(), (x.mon.hp ?? 0) > 0));

const side = (x, s) => ({ name: x.mon.name ?? null, slot: x.slot, icon: tryDo(() => iconOf(x.mon)), s });

/**
 * A swap per lead slot that every opener beats, to the member behind the leads that wins its duel against an opener
 * by the most, one member per slot; null when no slot needs one or nobody behind can take it. A tie keeps the party's
 * order. `foe` is the opener the incoming member wins against, and each side's `s` is its pair score against it.
 */
export const leadAdvice = (run, preview) => {
  if (!preview || preview.unavailable || !preview.foes?.length) return null;
  const n = preview.double ? 2 : 1;
  const openers = preview.foes.slice(0, n).map(row => ({ row, c: tryDo(() => previewFoeOf(row)) })).filter(o => o.c);
  const up = standing(run.facts.party ?? []);
  if (!openers.length || up.length <= n) return null;
  const built = new Map();
  const scores = x => {
    if (!built.has(x)) built.set(x, combatantOf({ mon: x.mon, hp: x.mon.hp }));
    return openers.map(o => duel(run, built.get(x), o.c).s);
  };
  const top = ss => ss.reduce((b, s, i) => (s > ss[b] ? i : b), 0);
  const bench = up.slice(n);
  const taken = new Set();
  const swaps = [];
  for (const lead of up.slice(0, n)) {
    const was = scores(lead);
    if (was.some(s => s >= 0)) continue;
    const best = bench.filter(x => !taken.has(x))
      .map(x => { const ss = scores(x); return { x, i: top(ss), s: ss[top(ss)] }; })
      .filter(c => c.s > 0).sort((a, b) => b.s - a.s)[0];
    if (!best) continue;
    taken.add(best.x);
    swaps.push({ out: side(lead, was[best.i]), in: side(best.x, best.s), foe: openers[best.i].row.name });
  }
  if (!swaps.length) return null;
  const c = preview.confidence ?? {};
  return { wave: preview.wave, swaps,
    confidence: weakestConfidence(c.foes, c.levels, c.double),
    missed: (preview.missed ?? []).some(f => RESTS_ON.includes(f)) };
};

export const leadMark = l => (l.missed ? "!" : confidenceMark(l.confidence));

export const leadSummary = l => {
  if (!l) return null;
  const mark = leadMark(l);
  return `lead with ${l.swaps.map(sw => `${sw.in.name} over ${sw.out.name} (beats ${sw.foe})`).join(", ")}${mark ? ` [${mark}]` : ""}`;
};
