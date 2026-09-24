// Starter card (the 51-starters model), as **group**s (#349 §1): `act` · `options` · `notes`, the same three every
// light card takes. Loads after 90-render: only call these from a draw, never at load time.
// `act` is the team so far; `options` is every proposal with its cost, the types its STAB hits and what it's weak
// to, one line per member with its role and reasons, and the species under the cursor as the last row — *Picked*
// and *Viewing* are a row apiece, and neither earns a group of its own. The call is `act.summary`, read off the
// model and never written here (§6).
import { ptsText, startersSummary } from "./51-starters.js";
import { FS, bar, dim, group, h, line, mon, sep, some } from "./90-render.js";

export const drawStarters = m => {
  const best = m.picks[0];
  // The header is the card's own identity line; the strip takes it in #356.
  const header = bar("🌱", "Starters", h("span", { ...dim, fontWeight: "normal" }, `${ptsText(m.spent)}/${m.limit} pts`));
  const ROLE = { carry: "#8cf", support: "#c9f" };
  const chosen = m.chosen.length
    ? line("✓", "#6d6", h("span", { ...dim, marginRight: "3px" }, "picked:"), ...m.chosen.map(x => mon(x.icon, x.name, 20)),
        m.full ? h("span", dim, "· team full") : m.room <= 0 ? h("span", dim, "· no points left") : null)
    : null;
  // Nothing to propose: an ordinary card with exactly one `act` group, and the shell never special-cases it (§1).
  // The line that used to say so is `act.summary` now — `startersSummary` carries it, so it is said once.
  if (!best) return [group("act", "Now", startersSummary(m), [header, chosen])];
  const teamTail = t => [h("span", { ...dim, marginLeft: "4px" }, `${ptsText(t.cost)} pts · SE vs ${t.covers} types`),
    t.weak.length ? h("span", { color: "#fa4", fontSize: FS.tiny, marginLeft: "4px" }, `· weak ${t.weak.join("/")}`) : null,
    t.noCarry ? h("span", { color: "#fa4", fontSize: FS.tiny, marginLeft: "4px" }, "· no carry") : null];
  const options = [];
  m.picks.forEach((t, i) => {
    // A rule between one proposal and the next, never above the first: that boundary is the one between `act` and
    // `options`, which is the shell's to draw (§1).
    options.push(i ? h("div", sep) : null,
      line(i ? "·" : "★", i ? "#9aa" : "#6d6", h("span", { fontWeight: "bold" }, t.label), ...teamTail(t)));
    for (const x of t.members) {
      options.push(line("", "#9aa", mon(x.icon, x.name, 20),
        h("span", x.chosen ? dim : { fontWeight: "bold" }, x.name), x.chosen ? h("span", { color: "#6d6", marginLeft: "2px" }, "✓") : null,
        h("span", { ...dim, marginLeft: "3px" }, `${ptsText(x.cost)}`),
        x.role ? h("span", { color: ROLE[x.role], fontSize: FS.tiny, marginLeft: "3px" }, x.role) : null,
        h("span", { flex: "1" }),
        h("span", { color: "#9aa", fontSize: FS.tiny }, x.why.join(" · "))));
    }
  });
  const v = m.viewing;
  if (v) {
    options.push(h("div", sep), line("👁", "#9aa", mon(v.icon, v.name, 20), h("span", {}, v.name),
      h("span", { ...dim, marginLeft: "3px" }, `${ptsText(v.cost)} pts · #${v.rank} of ${v.of}${v.inPick ? ` · in ${v.inPick}` : ""}`),
      h("span", { flex: "1" }), h("span", { color: "#9aa", fontSize: FS.tiny }, v.why.join(" · "))));
  }
  // Every caveat on one row, joined — unlike the encounter card's, which are a row apiece because each is its own note.
  const noteText = [m.fresh ? "Fresh Start: no passives, egg moves or luck" : null, m.mono ? "single type: shared weaknesses not counted" : null,
    m.inverse ? "Inverse Battle: coverage inverted" : null, m.data ? null : "final forms estimated until the game's tables load"].filter(Boolean);
  // `options` and `notes` head their panes with their label alone — the proposals themselves say it one glance lower (§6).
  return [
    some("act", "Now", startersSummary(m), [header, chosen]),
    some("options", "Proposals", null, options),
    some("notes", "Notes", null, noteText.length ? [line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, noteText.join(" · ")))] : []),
  ].filter(Boolean);
};
