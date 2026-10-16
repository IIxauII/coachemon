import { dim, h, ink, line } from "./90-render.js";

export const drawAudit = a => {
  const found = a?.findings ?? [];
  if (!found.length) return [];
  const MAX = 8;
  const out = [line("", h("span", { fontWeight: "bold", marginRight: "3px" }, "Team audit"),
    a.vs ? h("span", dim, `vs W${a.vs.wave} ${a.vs.who}`) : null)];
  for (const f of found.slice(0, MAX)) {
    out.push(line(f.level === "high" ? "✗" : "·", f.text));
    if (f.relearn) {
      const r = f.relearn;
      out.push(line("", h("span", ink.later,
        `↺ Memory Mushroom: relearn ${r.move}${r.forget ? ` over ${r.forget}` : ""} · +${r.gain} power`)));
    }
  }
  if (found.length > MAX) out.push(line("", h("span", dim, `+${found.length - MAX} more`)));
  return out;
};
