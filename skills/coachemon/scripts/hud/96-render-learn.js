// Learn-move card (the 40-learn model). Full: the incoming move, every slot it is weighed against, the team line and
// the call. Mini: the incoming move, the slot it would take, and the call.
import { FS, badge, bar, dim, h, img, line, mon, tab, view } from "./90-render.js";

// "3× Water" (the move would be the third of its type) reads as "3rd Water move".
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const learnNote = n => n.replace(/^(\d+)× (\w+)$/, (_, k, t) => `${ordinal(+k)} ${t} move`);
// What the effective power is made of, as the power's tooltip: the card stays one number per move.
const powerTitle = x => [`base ${x.power}${x.hits > 1 ? ` × ${x.hits} hits` : ""}`, x.acc < 100 ? `${x.acc}% acc` : null,
  x.stab ? "STAB" : null, x.fixed ? "fixed damage" : null].filter(Boolean).join(" · ");
export const drawLearn = m => {
  if (view() === "closed") return [tab("🎓", mon(m.icon, m.name, 20))];
  const header = bar("🎓", `${m.name} learns`, mon(m.icon, m.name, 20),
    view() === "full" && m.atk != null ? h("span", { ...dim, fontWeight: "normal", fontSize: FS.tiny }, `Atk ${m.atk} / SpA ${m.spa}`) : null);
  // The slot the new move would take: the one to forget, or on a skip the one it lost to.
  const slot = m.forget >= 0 ? m.forget : m.compare;
  // Only-type loss: the slot's own "only X move on team" note becomes a ⚠ by its name; the team line says it.
  const onlyNote = m.team?.onlyType ? `only ${m.team.onlyType} move on team` : null;
  const row = (x, mark, color, warn) => {
    const notes = warn ? x.notes.filter(n => n !== onlyNote) : x.notes;
    const power = h("span", dim, x.value === null ? "status" : `power ${x.value}`);
    // A status move's number is what its effects are worth on the same scale, so its tooltip names those instead.
    if (x.value !== null && x.power != null) power.title = powerTitle(x);
    else if (x.value !== null && x.why) power.title = x.why;
    return line(mark, color,
      badge(x.type), img("categories", x.cat, x.cat, 12, null),
      h("span", { fontWeight: "bold", marginLeft: "2px" }, x.name),
      warn ? h("span", { color: "#fa4", marginLeft: "3px" }, "⚠") : null,
      h("span", { flex: "1" }),
      notes.length ? h("span", { color: "#9aa", fontSize: FS.tiny, marginRight: "4px" }, notes.map(learnNote).join(" · ")) : null,
      power);
  };
  const warnAt = i => i === slot && !!onlyNote;
  const loses = onlyNote ? h("span", { color: "#fa4" }, `⚠ loses only ${m.team.onlyType} move`) : null;
  // Net change only: a type both gained and lost (a same-type swap) is no change.
  const gains = (m.team?.gains ?? []).filter(t => !m.team.loses.includes(t));
  const lost = (m.team?.loses ?? []).filter(t => !m.team.gains.includes(t));
  const teamParts = [
    gains.length ? h("span", { color: "#6d6" }, `+SE ${gains.slice(0, 3).join("/")}${gains.length > 3 ? "…" : ""}`) : null,
    lost.length ? h("span", { color: "#e77" }, `−SE ${lost.slice(0, 3).join("/")}${lost.length > 3 ? "…" : ""}`) : null,
    loses,
  ].filter(Boolean);
  const teamLine = parts => (parts.length
    ? line("", "#9aa", h("span", { ...dim, marginRight: "4px" }, "team:"), ...parts.flatMap((p, i) => [i ? h("span", dim, " · ") : null, p]))
    : null);
  // Effective power the swap gains; on a skip only a loss (a gain under the learn threshold would read as a contradiction).
  const gain = (m.decision === "learn" || (m.decision === "skip" && m.gain < 0)) && m.gain
    ? h("span", { ...dim, fontWeight: "normal", marginLeft: "6px" }, `${m.gain > 0 ? "+" : "−"}${Math.abs(m.gain)} power`) : null;
  const verdict = h("div", { color: m.verdict[1], fontWeight: "bold", marginTop: "3px" }, m.verdict[0], view() === "full" ? gain : null);
  // The next big fight went unread, so the roster fits above are missing: said once, dim, only when it happened.
  const blind = m.blind ? line("", "#9aa", h("span", dim, `next big fight unread: ${m.blind}`)) : null;
  if (view() === "mini") {
    return [header, row(m.move, "✚", "#6d6"), m.forget >= 0 ? row(m.moves[m.forget], "✕", "#e55", warnAt(m.forget)) : null,
      m.forget >= 0 ? teamLine([loses].filter(Boolean)) : null, verdict].filter(Boolean);
  }
  return [header, row(m.move, "✚", "#6d6"),
    h("div", { borderTop: "1px solid rgba(255,255,255,.12)", margin: "3px 0" }),
    ...m.moves.map((x, i) => (i === m.forget ? row(x, "✕", "#e55", warnAt(i)) : i === slot ? row(x, "↔", "#fa4", warnAt(i)) : row(x, "·", "#9aa"))),
    teamLine(teamParts), blind, verdict].filter(Boolean);
};
