// Team audit section of the rewards card (the 50-audit model) and its plain-text summary. Loads after 90-render: only
// call these from a draw or a summary, never at load time.
// Every finding, always: ✗ what loses fights and · what costs tempo, with the Memory Mushroom move under a dead slot
// it would fix.
import { FS, closed, dim, h, line } from "./90-render.js";

export const drawAudit = a => {
  const found = a?.findings ?? [];
  if (!found.length || closed()) return [];
  const red = "#e77", amber = "#ec4";
  const high = found.some(f => f.level === "high");
  const MAX = 8;
  // Rows of the audit group, not a card of its own: the shell rules groups apart (#349 §1), and no section has a
  // control of its own.
  const out = [line("🩺", high ? red : amber, h("span", { fontWeight: "bold", marginRight: "3px" }, "Team audit"),
    a.vs ? h("span", dim, `vs W${a.vs.wave} ${a.vs.who}`) : null)];
  for (const f of found.slice(0, MAX)) {
    out.push(line(f.level === "high" ? "✗" : "·", f.level === "high" ? red : amber,
      h("span", f.level === "high" ? {} : { fontSize: FS.small }, f.text)));
    if (f.relearn) {
      const r = f.relearn;
      out.push(line("", "#9aa", h("span", { color: "#6d6", fontSize: FS.tiny },
        `↺ Memory Mushroom: relearn ${r.move}${r.forget ? ` over ${r.forget}` : ""} · +${r.gain} power`)));
    }
  }
  if (found.length > MAX) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `+${found.length - MAX} more`)));
  return out;
};
