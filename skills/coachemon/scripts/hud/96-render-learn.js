// Learn-move card (the 40-learn model), as **group**s (#349 §1): `act` — the incoming move and what the swap gains —
// then `options`, the slots it is weighed against, then `audit`, the team line, and `notes`. The verdict is no longer
// a row: it is `act.summary`, read off the model and never written here (§6).
import { learnSummary } from "./40-learn.js";
import { badge, caption, dim, h, ICON, img, ink, line, mon, some } from "./90-render.js";

// "3× Water" (the move would be the third of its type) reads as "3rd Water move".
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const learnNote = n => n.replace(/^(\d+)× (\w+)$/, (_, k, t) => `${ordinal(+k)} ${t} move`);
// What the effective power is made of, as the power's tooltip: the card stays one number per move.
const powerTitle = x => [`base ${x.power}${x.hits > 1 ? ` × ${x.hits} hits` : ""}`, x.acc < 100 ? `${x.acc}% acc` : null,
  x.stab ? "STAB" : null, x.fixed ? "fixed damage" : null].filter(Boolean).join(" · ");
// The strip's caption: whose move this is, and the two attack stats the call is weighed on.
export const captionLearn = m => caption("🎓", `${m.name} learns`, mon(m.icon, m.name, ICON.mon),
  m.atk != null ? h("span", { ...dim, fontWeight: "normal" }, `Atk ${m.atk} / SpA ${m.spa}`) : null);

export const drawLearn = m => {
  // The slot the new move would take: the one to forget, or on a skip the one it lost to.
  const slot = m.forget >= 0 ? m.forget : m.compare;
  // Only-type loss: the slot's own "only X move on team" note becomes a ⚠ by its name; the team line says it.
  const onlyNote = m.team?.onlyType ? `only ${m.team.onlyType} move on team` : null;
  // `tail`: what the row has to add after its power — only the incoming move has any, and only ever the gain.
  // A no-arrow kind, so the law degrades to **ours** alone (#349 §8). Which move to keep is the gutter's question —
  // the marks answer it, and no row ink does.
  const row = (x, mark, warn, tail) => {
    const notes = warn ? x.notes.filter(n => n !== onlyNote) : x.notes;
    const power = h("span", dim, x.value === null ? "status" : `power ${x.value}`);
    // A status move's number is what its effects are worth on the same scale, so its tooltip names those instead.
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
  // Net change only: a type both gained and lost (a same-type swap) is no change.
  const gains = (m.team?.gains ?? []).filter(t => !m.team.loses.includes(t));
  const lost = (m.team?.loses ?? []).filter(t => !m.team.gains.includes(t));
  const teamParts = [
    // The swap's own two halves, both **ours**: the signs say which is which, and a second ink saying it again is
    // the gutter's question asked in the wrong column.
    gains.length ? h("span", ink.ours, `+SE ${gains.slice(0, 3).join("/")}${gains.length > 3 ? "…" : ""}`) : null,
    lost.length ? h("span", ink.ours, `−SE ${lost.slice(0, 3).join("/")}${lost.length > 3 ? "…" : ""}`) : null,
    loses,
  ].filter(Boolean);
  const teamLine = parts => (parts.length
    ? line("", h("span", { ...dim, marginRight: "4px" }, "team:"), ...parts.flatMap((p, i) => [i ? h("span", dim, " · ") : null, p]))
    : null);
  // Effective power the swap gains; on a skip only a loss (a gain under the learn threshold would read as a contradiction).
  // It rode on the verdict line, which is now `act.summary` — and `learnSummary` is the call alone, so the number
  // moves onto the row of the move that gains it rather than leaving with the line it sat on.
  const gain = (m.decision === "learn" || (m.decision === "skip" && m.gain < 0)) && m.gain
    ? h("span", { ...dim, marginLeft: "6px" }, `${m.gain > 0 ? "+" : "−"}${Math.abs(m.gain)} power`) : null;
  // The next big fight went unread, so the roster fits above are missing: said once, dim, only when it happened.
  const blind = m.blind ? line("", h("span", dim, `next big fight unread: ${m.blind}`)) : null;
  // The rule that used to hold the incoming move apart from the slots is gone with it — that boundary is the one
  // between `act` and `options`, which is the shell's to draw (§1).
  return [
    some("act", "Now", learnSummary(m), [row(m.move, "✓", false, gain)]),
    some("options", "Moves", null,
      // The slot losing its move is *removed* — `✗`, the same news as an avoid; the slot the new move lost to on a
      // skip is the pick that kept its place — `★` (#349 §7). `✕` is gone from the panel entirely.
      m.moves.map((x, i) => (i === m.forget ? row(x, "✗", warnAt(i)) : i === slot ? row(x, "★", warnAt(i)) : row(x, "·")))),
    // A learn card runs no team audit — the team line is all it has to say about the team, so the group is headed by
    // its label alone (§6).
    some("audit", "Team", null, [teamLine(teamParts)]),
    some("notes", "Notes", null, [blind]),
  ].filter(Boolean);
};
