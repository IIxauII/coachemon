import { fusionSummary, inTurns } from "./49-fusion.js";
import { badge, caption, dim, h, ICON, ink, line, mon, sep, some } from "./90-render.js";

export const captionFusion = m => caption("🧬", "Splice", m.picked ? mon(m.picked.icon, m.picked.name, ICON.mon) : null,
  m.picked ? h("span", { ...dim, fontWeight: "normal" }, "with") : null);

export const drawFusion = m => {
  const row = (f, i) => line(i ? "·" : f.fuse ? "★" : "·",
    mon(f.base.icon, f.base.name, ICON.mon), h("span", { fontWeight: "bold" }, f.base.name),
    h("span", { ...dim, margin: "0 3px" }, "←"), mon(f.other.icon, f.other.name, ICON.mon), h("span", {}, f.other.name),
    h("span", { flex: "1" }),
    h("span", { ...(f.fuse ? ink.ours : dim), marginLeft: "4px" }, inTurns(f.value)));
  const detail = f => line("", ...f.types.map(t => badge(t)),
    h("span", dim, [...f.why, ...f.notes].join(" · ")));
  const options = m.rows.flatMap((f, i) => [i ? h("div", sep) : null, row(f, i), detail(f)]);
  const notes = m.spliced ? [line("", h("span", dim, "Spliced Endless: unfused mons run on half their base stats"))] : [];
  return [
    some("act", "Now", fusionSummary(m), []),
    some("options", "Fusions", null, options),
    some("notes", "Notes", null, notes),
  ].filter(Boolean);
};
