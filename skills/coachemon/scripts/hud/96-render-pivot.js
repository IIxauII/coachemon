import { hitsText, pivotActSummary } from "./53-pivot.js";
import { oracleLineSummary } from "./57-oracle-line.js";
import { badge, caption, dim, h, hpBar, ICON, ink, line, mon, some } from "./90-render.js";
import { drawOracleLine } from "./95-render-oracle-line.js";

const leaves = m => (m.out ? `${m.out.name} leaves the field` : null);
export const captionPivot = m => caption("⇄", "Pivot",
  m.out ? mon(m.out.icon, m.out.name, ICON.mon) : null, leaves(m) ? h("span", { ...dim, fontWeight: "normal" }, "leaves the field") : null);

const types = ts => ts.map(t => badge(t));
const benchRow = b => line(b.hits.length ? "⚠" : b.resists ? "✓" : "·",
  mon(b.icon, b.name, ICON.mon), hpBar(b.hp), ...types(b.types),
  hitsText(b) ? h("span", { ...(b.hits.length ? ink.theirs : dim), marginLeft: "3px" }, hitsText(b)) : null);
const foeRow = f => line("·",
  mon(f.icon, f.name, ICON.mon), hpBar(f.hp), ...types(f.types),
  h("span", { ...dim, margin: "0 3px" }, f.attacks.length ? "attacks:" : "no attacking move known"), ...types(f.attacks));

// No row of `act` judges a pick: the marks are the type chart's, never a recommendation.
export const drawPivot = m => [
  some("act", "Now", pivotActSummary(), m.bench.length ? m.bench.map(benchRow) : [line("·", h("span", dim, "no one left to send"))],
    leaves(m)),
  some("foes", "Foes", null, m.foes.map(foeRow)),
  // A held oracle line, drawn as the battle card draws it: its step names the pick it solved for.
  m.heldLine ? some("plan", "Plan", oracleLineSummary(m.heldLine), drawOracleLine(m.heldLine)) : null,
].filter(Boolean);
