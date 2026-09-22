// Fusion card (the 49-fusion model, on the party screen a DNA Splicer opens) and its plain-text summary. Loads after
// 90-render: only call these from a draw or a summary, never at load time.
// Up to three fusions in pick order (base ← the half it takes in) with their score and reasons, then the call.
import { fusionCall, signed } from "./49-fusion.js";
import { FS, badge, bar, closed, dim, h, line, mon, sep, tab } from "./90-render.js";

export const drawFusion = m => {
  const top = m.rows[0];
  if (closed()) return [tab("🧬", top ? mon(top.base.icon, top.base.name, 20) : null)];
  const header = bar("🧬", "Splice", m.picked ? mon(m.picked.icon, m.picked.name, 20) : null,
    m.picked ? h("span", { ...dim, fontWeight: "normal" }, "with") : null);
  const row = (f, i) => line(i ? "·" : f.fuse ? "★" : "·", i ? "#9aa" : f.fuse ? "#6d6" : "#9aa",
    mon(f.base.icon, f.base.name, 20), h("span", { fontWeight: "bold" }, f.base.name),
    h("span", { ...dim, margin: "0 3px" }, "←"), mon(f.other.icon, f.other.name, 20), h("span", {}, f.other.name),
    h("span", { flex: "1" }),
    h("span", { color: f.fuse ? "#6d6" : "#9aa", marginLeft: "4px" }, signed(f.value)));
  const detail = f => line("", "#9aa", ...f.types.map(t => badge(t)),
    h("span", { color: "#9aa", fontSize: FS.tiny }, [...f.why, ...f.notes].join(" · ")));
  const call = h("div", { color: top?.fuse && !m.better ? "#6d6" : "#fa4", fontWeight: "bold", marginTop: "3px" }, fusionCall(m));
  const out = [header];
  m.rows.forEach((f, i) => out.push(i ? h("div", sep) : null, row(f, i), detail(f)));
  out.push(call);
  if (m.spliced) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, "Spliced Endless: unfused mons run on half their base stats")));
  return out.filter(Boolean);
};
