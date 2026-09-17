// Team audit section of the rewards card (the 49-audit model) and its plain-text summary. Loads after 90-render: only
// call these from a draw or a summary, never at load time.
// Collapsed, in either view: one line — `🩺 team: 4 issues · Flygon (W165) has one answer: Dudunsparce Blizzard (70%) [+]`.
// Full view opens it by itself when the next big fight is named and the roster finds a single answer or a speed gap:
// what loses that fight. `+` opens it any time for the rest of the wave. Open: every finding, ✗ what loses fights and
// · what costs tempo, with the Memory Mushroom move under a dead slot it would fix.
import { FS, button, dim, h, line, redraw, sep, setView, shownCardWave, view } from "./90-render.js";

let auditOpen = null; // the wave whose audit the user opened
export const drawAudit = a => {
  const found = a?.findings ?? [];
  if (!found.length || view() === "closed") return [];
  const red = "#e77", amber = "#ec4";
  const high = found.some(f => f.level === "high");
  const urgent = !!a.vs && found.some(f => f.kind === "answers" || f.kind === "speed");
  const opened = view() === "full" && ((auditOpen !== null && auditOpen === shownCardWave()) || urgent);
  if (!opened) {
    return [line("🩺", high ? red : amber,
      h("span", { fontWeight: "bold", marginRight: "3px" }, `team: ${found.length} issue${found.length === 1 ? "" : "s"}`),
      h("span", { ...dim, fontSize: FS.tiny }, `· ${found[0].text}`),
      h("span", { flex: "1" }),
      button("+", "Show the team audit", () => { auditOpen = shownCardWave(); view() === "full" ? redraw() : setView("full"); }))];
  }
  const MAX = 8;
  const out = [h("div", sep), line("🩺", high ? red : amber, h("span", { fontWeight: "bold", marginRight: "3px" }, "Team audit"),
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
