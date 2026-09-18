// Starter card (the 51-starters model) and its plain-text summary. Loads after 90-render: only call these from a draw or
// a summary, never at load time.
// Full: every proposal with its cost, the types its STAB hits and what it's weak to, one line per pick with its role and
// reasons, then the species under the cursor. Mini: the best proposal on one line.
import { ptsText } from "./51-starters.js";
import { FS, bar, dim, h, line, mon, sep, tab, view } from "./90-render.js";

export const drawStarters = m => {
  const best = m.picks[0];
  const lead = best?.members.find(x => x.role === "carry") ?? best?.members[0];
  if (view() === "closed") return [tab("🌱", lead ? mon(lead.icon, lead.name, 20) : null)];
  const header = bar("🌱", "Starters", h("span", { ...dim, fontWeight: "normal" }, `${ptsText(m.spent)}/${m.limit} pts`));
  const ROLE = { carry: "#8cf", support: "#c9f" };
  const chosen = m.chosen.length
    ? line("✓", "#6d6", h("span", { ...dim, marginRight: "3px" }, "picked:"), ...m.chosen.map(x => mon(x.icon, x.name, 20)),
        m.full ? h("span", dim, "· team full") : m.room <= 0 ? h("span", dim, "· no points left") : null)
    : null;
  if (!best) return [header, chosen, line("·", "#9aa", h("span", dim, m.full || m.room <= 0 ? "nothing to add" : "no caught starter fits"))].filter(Boolean);
  const teamTail = t => [h("span", { ...dim, marginLeft: "4px" }, `${ptsText(t.cost)} pts · SE vs ${t.covers} types`),
    t.weak.length ? h("span", { color: "#fa4", fontSize: FS.tiny, marginLeft: "4px" }, `· weak ${t.weak.join("/")}`) : null,
    t.noCarry ? h("span", { color: "#fa4", fontSize: FS.tiny, marginLeft: "4px" }, "· no carry") : null];
  if (view() === "mini") {
    return [header, chosen,
      line("★", "#6d6", ...best.members.flatMap((x, i) => [i ? h("span", dim, "+") : null, mon(x.icon, x.name, 20),
        x.chosen ? null : h("span", { fontWeight: x.role === "carry" ? "bold" : "normal" }, x.name)]), ...teamTail(best))].filter(Boolean);
  }
  const out = [header, chosen];
  m.picks.forEach((t, i) => {
    out.push(h("div", sep), line(i ? "·" : "★", i ? "#9aa" : "#6d6", h("span", { fontWeight: "bold" }, t.label), ...teamTail(t)));
    for (const x of t.members) {
      out.push(line("", "#9aa", mon(x.icon, x.name, 20),
        h("span", x.chosen ? dim : { fontWeight: "bold" }, x.name), x.chosen ? h("span", { color: "#6d6", marginLeft: "2px" }, "✓") : null,
        h("span", { ...dim, marginLeft: "3px" }, `${ptsText(x.cost)}`),
        x.role ? h("span", { color: ROLE[x.role], fontSize: FS.tiny, marginLeft: "3px" }, x.role) : null,
        h("span", { flex: "1" }),
        h("span", { color: "#9aa", fontSize: FS.tiny }, x.why.join(" · "))));
    }
  });
  const v = m.viewing;
  if (v) {
    out.push(h("div", sep), line("👁", "#9aa", mon(v.icon, v.name, 20), h("span", {}, v.name),
      h("span", { ...dim, marginLeft: "3px" }, `${ptsText(v.cost)} pts · #${v.rank} of ${v.of}${v.inPick ? ` · in ${v.inPick}` : ""}`),
      h("span", { flex: "1" }), h("span", { color: "#9aa", fontSize: FS.tiny }, v.why.join(" · "))));
  }
  const notes = [m.fresh ? "Fresh Start: no passives, egg moves or luck" : null, m.mono ? "single type: shared weaknesses not counted" : null,
    m.inverse ? "Inverse Battle: coverage inverted" : null, m.data ? null : "final forms estimated until the game's tables load"].filter(Boolean);
  if (notes.length) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, notes.join(" · "))));
  return out.filter(Boolean);
};
