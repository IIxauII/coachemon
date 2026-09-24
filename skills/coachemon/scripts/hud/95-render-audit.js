// Team audit section of the rewards card (the 50-audit model) and its plain-text summary. Loads after 90-render: only
// call these from a draw or a summary, never at load time.
// Every finding, always: ✗ what loses fights and · what costs tempo, with the Memory Mushroom move under a dead slot
// it would fix.
import { dim, h, ink, line } from "./90-render.js";

export const drawAudit = a => {
  const found = a?.findings ?? [];
  if (!found.length) return [];
  const MAX = 8;
  // Rows of the audit group, not a card of its own: the shell rules groups apart (#349 §1), and no section has a
  // control of its own.
  const out = [line("", h("span", { fontWeight: "bold", marginRight: "3px" }, "Team audit"),
    a.vs ? h("span", dim, `vs W${a.vs.wave} ${a.vs.who}`) : null)];
  for (const f of found.slice(0, MAX)) {
    // A finding's level is its mark, and that is all it is (#349 §7): the size rung that used to say it a second
    // time went with the knob (#349 §4), and the ink that said it a third is the gutter's now — the audit is a
    // group about waves we have not fought yet, so every row in it is **later** whatever the finding says.
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
