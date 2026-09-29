import { ptsText, startersSummary } from "./51-starters.js";
import { caption, dim, group, h, ICON, ink, line, mon, sep, some } from "./90-render.js";

export const captionStarters = m => caption("🌱", "Starters",
  h("span", { ...dim, fontWeight: "normal" }, `${ptsText(m.spent)}/${m.limit} pts`));

export const drawStarters = m => {
  const best = m.picks[0];
  const chosen = m.chosen.length
    ? line("✓", h("span", { ...dim, marginRight: "3px" }, "picked:"), ...m.chosen.map(x => mon(x.icon, x.name, ICON.mon)),
        m.full ? h("span", dim, "· team full") : m.room <= 0 ? h("span", dim, "· no points left") : null)
    : null;
  if (!best) return [group("act", "Now", startersSummary(m), [chosen])];
  const teamTail = t => [h("span", { ...dim, marginLeft: "4px" }, `${ptsText(t.cost)} pts · SE vs ${t.covers} types`),
    t.weak.length ? h("span", { ...ink.ours, marginLeft: "4px" }, `· weak ${t.weak.join("/")}`) : null,
    t.noCarry ? h("span", { ...ink.ours, marginLeft: "4px" }, "· no carry") : null];
  const options = [];
  m.picks.forEach((t, i) => {
    options.push(i ? h("div", sep) : null,
      line(i ? "·" : "★", h("span", { fontWeight: "bold" }, t.label), ...teamTail(t)));
    for (const x of t.members) {
      options.push(line("", mon(x.icon, x.name, ICON.mon),
        h("span", x.chosen ? dim : { fontWeight: "bold" }, x.name), x.chosen ? h("span", { ...ink.ours, marginLeft: "2px" }, "✓") : null,
        h("span", { ...dim, marginLeft: "3px" }, `${ptsText(x.cost)}`),
        x.role ? h("span", { ...ink.ours, marginLeft: "3px" }, x.role) : null,
        h("span", { flex: "1" }),
        h("span", dim, x.why.join(" · "))));
    }
  });
  const v = m.viewing;
  if (v) {
    options.push(h("div", sep), line("·", h("span", dim, "cursor:"), mon(v.icon, v.name, ICON.mon), h("span", {}, v.name),
      h("span", { ...dim, marginLeft: "3px" }, `${ptsText(v.cost)} pts · #${v.rank} of ${v.of}${v.inPick ? ` · in ${v.inPick}` : ""}`),
      h("span", { flex: "1" }), h("span", dim, v.why.join(" · "))));
  }
  const noteText = [m.fresh ? "Fresh Start: no passives, egg moves or luck" : null, m.mono ? "single type: shared weaknesses not counted" : null,
    m.inverse ? "Inverse Battle: coverage inverted" : null, m.data ? null : "final forms estimated until the game's tables load"].filter(Boolean);
  return [
    some("act", "Now", startersSummary(m), [chosen]),
    some("options", "Proposals", null, options),
    some("notes", "Notes", null, noteText.length ? [line("", h("span", dim, noteText.join(" · ")))] : []),
  ].filter(Boolean);
};
