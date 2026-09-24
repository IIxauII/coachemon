// Next-wave card (the 48-preview model) and its plain-text summary. Loads after 90-render: only call these from a
// draw or a summary, never at load time.
// A row per foe with its types, ability and moves, the boss bars, and a footer naming anything the preview can't
// promise.
// A field the preview can't pin is marked: `~` it holds only while the game draws what this replay draws, `?` it is a
// guess, `!` it has already been wrong once this run (see `window.__coachHud.preview`). The whole card is a read of
// the seed *as the run stands*, so it always closes with "if nothing changes": a catch, an evolution, a shop pick or
// a biome change re-rolls what the replay fed on, mark or no mark.
// Nothing is drawn when the preview is unavailable — a build past the pin, or no run seed: the tally is the place
// that reports drift, and a card that nags on every tick is worse than a quiet one.
import { previewKind, previewMark } from "./48-preview.js";
import { badge, dim, h, ICON, ink, line, mon } from "./90-render.js";

export const drawPreview = m => {
  if (!m || m.unavailable) return [];
  const head = `W${m.wave}${previewMark(m, "type")}`;
  // The preview is a wave that has not arrived, so every row of it is **later** (#349 §8). What kind of wave it is
  // — trainer, mystery encounter or wild — is a subject and not a direction, and the word already says it: three
  // inks for three kinds is the spend the law took away.
  const kind = h("span", { ...ink.later, marginRight: "3px" },
    `${previewKind(m)}${m.double ? ` double${previewMark(m, "double")}` : ""}`);
  const who = m.trainer ? `${m.trainer.name}${previewMark(m, "trainer")}` : null;
  // Rows of the road group, not a card of its own: the shell rules groups apart (#349 §1), and no section has a
  // control of its own.
  const out = [line("", h("span", { fontWeight: "bold", marginRight: "3px" }, `Next ${head}`), kind)];
  if (who) out.push(line("·", h("span", {}, who)));
  for (const f of m.foes) {
    out.push(line(f.segments > 1 ? "👑" : "·",
      mon(f.icon, f.name, ICON.ref), h("span", { marginRight: "3px" }, `L${f.level}${previewMark(m, "foes")}`),
      ...f.types.map(t => badge(t, "")), h("span", { flex: "1" }),
      h("span", dim, [f.ability, f.segments > 1 ? `${f.segments} bars` : null].filter(Boolean).join(" · "))));
    if (f.moves?.length) out.push(line("", h("span", dim, f.moves.join(" · "))));
  }
  // Confidence is not a gutter mark (90-render's alphabet), so the mystery encounter's row takes the neutral `·`
  // and its leading word carries the kind the `?` used to.
  if (m.me?.name) out.push(line("·", h("span", dim, "mystery:"), h("span", { marginLeft: "3px" }, m.me.name)));
  const caveats = [...(m.notes ?? [])];
  if (m.missed?.length) caveats.push(`! ${m.missed.join(", ")} has been wrong this run`);
  else if (Object.values(m.confidence ?? {}).includes("replay")) caveats.push("~ holds while nothing else draws first");
  // Standing, not conditional: every field above is only the wave the seed holds *if nothing changes* first.
  caveats.push("if nothing changes: a catch, evolution, shop pick or biome change re-rolls this");
  out.push(line("", h("span", dim, caveats.join(" · "))));
  return out;
};
