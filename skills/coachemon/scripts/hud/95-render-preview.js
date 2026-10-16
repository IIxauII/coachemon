import { previewKind, previewMark } from "./48-preview.js";
import { badge, dim, h, ICON, ink, line, mon } from "./90-render.js";

export const drawPreview = m => {
  if (!m || m.unavailable) return [];
  const head = `W${m.wave}${previewMark(m, "type")}`;
  const kind = h("span", { ...ink.later, marginRight: "3px" },
    `${previewKind(m)}${m.double ? ` double${previewMark(m, "double")}` : ""}`);
  const who = m.trainer ? `${m.trainer.name}${previewMark(m, "trainer")}` : null;
  const out = [line("", h("span", { fontWeight: "bold", marginRight: "3px" }, `Next ${head}`), kind)];
  if (who) out.push(line("·", h("span", {}, who)));
  for (const f of m.foes) {
    out.push(line(f.segments > 1 ? "👑" : "·",
      mon(f.icon, f.name, ICON.ref), h("span", { marginRight: "3px" }, `L${f.level}${previewMark(m, "foes")}`),
      ...f.types.map(t => badge(t, "")), h("span", { flex: "1" }),
      h("span", dim, [f.ability, f.segments > 1 ? `${f.segments} bars` : null].filter(Boolean).join(" · "))));
    if (f.moves?.length) out.push(line("", h("span", dim, f.moves.join(" · "))));
  }
  if (m.me?.name) out.push(line("·", h("span", dim, "mystery:"), h("span", { marginLeft: "3px" }, m.me.name)));
  const caveats = [...(m.notes ?? [])];
  if (m.missed?.length) caveats.push(`! ${m.missed.join(", ")} has been wrong this run`);
  else if (Object.values(m.confidence ?? {}).includes("replay")) caveats.push("~ holds while nothing else draws first");
  caveats.push("if nothing changes: a catch, evolution, shop pick or biome change re-rolls this");
  out.push(line("", h("span", dim, caveats.join(" · "))));
  return out;
};
