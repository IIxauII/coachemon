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
import { FS, badge, dim, h, line, mon } from "./90-render.js";

export const drawPreview = m => {
  if (!m || m.unavailable) return [];
  const head = `W${m.wave}${previewMark(m, "type")}`;
  const kind = h("span", { color: m.type === "trainer" ? "#fa4" : m.type === "me" ? "#c9f" : "#9aa", marginRight: "3px" },
    `${previewKind(m)}${m.double ? ` double${previewMark(m, "double")}` : ""}`);
  const who = m.trainer ? `${m.trainer.name}${previewMark(m, "trainer")}` : null;
  // Rows of the road group, not a card of its own: the shell rules groups apart (#349 §1), and no section has a
  // control of its own.
  const out = [line("🔮", "#9aa", h("span", { fontWeight: "bold", marginRight: "3px" }, `Next ${head}`), kind)];
  if (who) out.push(line("·", "#fa4", h("span", {}, who)));
  for (const f of m.foes) {
    out.push(line(f.segments > 1 ? "👑" : "·", f.segments > 1 ? "#fa4" : "#9aa",
      mon(f.icon, f.name, 18), h("span", { marginRight: "3px" }, `L${f.level}${previewMark(m, "foes")}`),
      ...f.types.map(t => badge(t, "")), h("span", { flex: "1" }),
      h("span", { ...dim, fontSize: FS.tiny }, [f.ability, f.segments > 1 ? `${f.segments} bars` : null].filter(Boolean).join(" · "))));
    if (f.moves?.length) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, f.moves.join(" · "))));
  }
  if (m.me?.name) out.push(line("?", "#c9f", h("span", {}, m.me.name)));
  const caveats = [...(m.notes ?? [])];
  if (m.missed?.length) caveats.push(`! ${m.missed.join(", ")} has been wrong this run`);
  else if (Object.values(m.confidence ?? {}).includes("replay")) caveats.push("~ holds while nothing else draws first");
  // Standing, not conditional: every field above is only the wave the seed holds *if nothing changes* first.
  caveats.push("if nothing changes: a catch, evolution, shop pick or biome change re-rolls this");
  out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, caveats.join(" · "))));
  return out;
};
