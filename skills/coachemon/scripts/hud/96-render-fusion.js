// Fusion card (the 49-fusion model, on the party screen a DNA Splicer opens), as **group**s (#349 §1): `act` ·
// `options` · `notes`, the same three every light card takes. Loads after 90-render: only call these from a draw,
// never at load time.
// `options` is up to three fusions in pick order (base ← the half it takes in) with their score and reasons. The
// call line has left the rows: `act.summary` carries it, read off the model and never written here (§6).
import { fusionSummary, signed } from "./49-fusion.js";
import { badge, bar, dim, h, ICON, line, mon, sep, some } from "./90-render.js";

export const drawFusion = m => {
  // The header is the card's own identity line; the strip takes it in #356.
  const header = bar("🧬", "Splice", m.picked ? mon(m.picked.icon, m.picked.name, ICON.mon) : null,
    m.picked ? h("span", { ...dim, fontWeight: "normal" }, "with") : null);
  const row = (f, i) => line(i ? "·" : f.fuse ? "★" : "·", i ? "#9aa" : f.fuse ? "#6d6" : "#9aa",
    mon(f.base.icon, f.base.name, ICON.mon), h("span", { fontWeight: "bold" }, f.base.name),
    h("span", { ...dim, margin: "0 3px" }, "←"), mon(f.other.icon, f.other.name, ICON.mon), h("span", {}, f.other.name),
    h("span", { flex: "1" }),
    h("span", { color: f.fuse ? "#6d6" : "#9aa", marginLeft: "4px" }, signed(f.value)));
  const detail = f => line("", "#9aa", ...f.types.map(t => badge(t)),
    h("span", dim, [...f.why, ...f.notes].join(" · ")));
  // A rule between one candidate and the next, never above the first: that boundary is the one between `act` and
  // `options`, which is the shell's to draw (§1).
  const options = m.rows.flatMap((f, i) => [i ? h("div", sep) : null, row(f, i), detail(f)]);
  const notes = m.spliced ? [line("", "#9aa", h("span", dim, "Spliced Endless: unfused mons run on half their base stats"))] : [];
  // `options` and `notes` head their panes with their label alone — the candidates themselves say it one glance lower (§6).
  return [
    some("act", "Now", fusionSummary(m), [header]),
    some("options", "Fusions", null, options),
    some("notes", "Notes", null, notes),
  ].filter(Boolean);
};
