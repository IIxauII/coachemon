import { learnSummary } from "./40-learn.js";
import { badge, caption, dim, h, ICON, img, ink, line, mon, some } from "./90-render.js";

const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const learnNote = n => n.replace(/^(\d+)× (\w+)$/, (_, k, t) => `${ordinal(+k)} ${t} move`);
const powerTitle = x => [`base ${x.power}${x.hits > 1 ? ` × ${x.hits} hits` : ""}`, x.acc < 100 ? `${x.acc}% acc` : null,
  x.stab ? "STAB" : null, x.fixed ? "fixed damage" : null].filter(Boolean).join(" · ");
export const captionLearn = m => caption("🎓", `${m.name} learns`, mon(m.icon, m.name, ICON.mon),
  m.atk != null ? h("span", { ...dim, fontWeight: "normal" }, `Atk ${m.atk} / SpA ${m.spa}`) : null);

export const drawLearn = m => {
  const slot = m.forget >= 0 ? m.forget : m.compare;
  // 40-learn's `scoreSlots` writes this note: change both.
  const onlyNote = m.team?.onlyType ? `only ${m.team.onlyType} move on team` : null;
  const row = (x, mark, warn, tail) => {
    const notes = warn ? x.notes.filter(n => n !== onlyNote) : x.notes;
    const power = h("span", dim, x.value === null ? "status" : `power ${x.value}`);
    if (x.value !== null && x.power != null) power.title = powerTitle(x);
    else if (x.value !== null && x.why) power.title = x.why;
    return line(mark,
      badge(x.type), img("categories", x.cat, x.cat, ICON.mark, null),
      h("span", { fontWeight: "bold", marginLeft: "2px" }, x.name),
      warn ? h("span", { ...ink.ours, marginLeft: "3px" }, "⚠") : null,
      h("span", { flex: "1" }),
      notes.length ? h("span", { ...dim, marginRight: "4px" }, notes.map(learnNote).join(" · ")) : null,
      power, tail);
  };
  const warnAt = i => i === slot && !!onlyNote;
  const loses = onlyNote ? h("span", ink.ours, `⚠ loses only ${m.team.onlyType} move`) : null;
  const gains = (m.team?.gains ?? []).filter(t => !m.team.loses.includes(t));
  const lost = (m.team?.loses ?? []).filter(t => !m.team.gains.includes(t));
  const teamParts = [
    gains.length ? h("span", ink.ours, `+SE ${gains.slice(0, 3).join("/")}${gains.length > 3 ? "…" : ""}`) : null,
    lost.length ? h("span", ink.ours, `−SE ${lost.slice(0, 3).join("/")}${lost.length > 3 ? "…" : ""}`) : null,
    loses,
  ].filter(Boolean);
  const teamLine = parts => (parts.length
    ? line("", h("span", { ...dim, marginRight: "4px" }, "team:"), ...parts.flatMap((p, i) => [i ? h("span", dim, " · ") : null, p]))
    : null);
  const gain = (m.decision === "learn" || (m.decision === "skip" && m.gain < 0)) && m.gain
    ? h("span", { ...dim, marginLeft: "6px" }, `${m.gain > 0 ? "+" : "−"}${Math.abs(m.gain)} power`) : null;
  const blind = m.blind ? line("", h("span", dim, `next big fight unread: ${m.blind}`)) : null;
  return [
    some("act", "Now", learnSummary(m), [row(m.move, "✓", false, gain)]),
    some("options", "Moves", null,
      m.moves.map((x, i) => (i === m.forget ? row(x, "✗", warnAt(i)) : i === slot ? row(x, "★", warnAt(i)) : row(x, "·")))),
    some("audit", "Team", null, [teamLine(teamParts)]),
    some("notes", "Notes", null, [blind]),
  ].filter(Boolean);
};
