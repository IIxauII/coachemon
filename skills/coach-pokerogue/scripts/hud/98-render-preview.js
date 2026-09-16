// Next-wave card (the 48-preview model) and its plain-text summary. Loads after 90-render: only call these from a
// draw or a summary, never at load time.
// Mini: one line — `🔮 W13 trainer Youngster Ben · double · Machop L9, Geodude L10`. Full adds a row per foe with its
// types, ability and moves, the boss bars, and a footer naming anything the preview can't promise.
// A field the preview can't pin is marked: `~` it holds only while the game draws what this replay draws, `?` it is a
// guess, `!` it has already been wrong once this run (see `window.__coachHud.preview()`).
// Nothing is drawn when the preview is unavailable — a build past the pin, or no run seed: the tally is the place
// that reports drift, and a card that nags on every tick is worse than a quiet one.
const PREVIEW_MARK = { exact: "", replay: "~", estimate: "?" };
const previewMark = (m, field) => (m.missed?.includes(field) ? "!" : PREVIEW_MARK[m.tier?.[field]] ?? "");
const previewKind = m => (m.type === "me" ? "mystery" : m.fixed ? `★ ${m.type}` : m.type);
// `Machop L9, Geodude L10`, or `2 mons L9–10` when there are too many to name.
const previewFoes = (m, long) => {
  if (!m.foes?.length) return m.me?.name ? m.me.name : "—";
  if (long || m.foes.length <= 2) return m.foes.map(f => `${f.name} L${f.level}`).join(", ");
  const lv = m.foes.map(f => f.level);
  return `${m.foes.length} mons L${Math.min(...lv)}–${Math.max(...lv)}`;
};

const drawPreview = (m, viewOverride) => {
  if (!m || m.unavailable) return [];
  const v = viewOverride ?? view;
  const head = `W${m.wave}${previewMark(m, "type")}`;
  const kind = h("span", { color: m.type === "trainer" ? "#fa4" : m.type === "me" ? "#c9f" : "#9aa", marginRight: "3px" },
    `${previewKind(m)}${m.double ? ` double${previewMark(m, "double")}` : ""}`);
  const who = m.trainer ? `${m.trainer.name}${previewMark(m, "trainer")}` : null;
  if (v !== "full") {
    return [line("🔮", "#9aa", h("span", { marginRight: "3px" }, head), kind,
      h("span", dim, `${who ? `${who} · ` : ""}${previewFoes(m, false)}${previewMark(m, "foes")}`))];
  }
  // A section inside the shop or battle card, not a card of its own: its own rule above it, and no view buttons.
  const out = [h("div", sep), line("🔮", "#9aa", h("span", { fontWeight: "bold", marginRight: "3px" }, `Next ${head}`), kind)];
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
  else if (Object.values(m.tier ?? {}).includes("replay")) caveats.push("~ holds while nothing else draws first");
  if (caveats.length) out.push(line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, caveats.join(" · "))));
  return out;
};

// `W13 trainer Youngster Ben (double) — Machop L9, Geodude L10`, for the watcher and the battle read.
const previewSummary = m => {
  if (!m || m.unavailable) return null;
  const who = m.trainer ? ` ${m.trainer.name}` : "";
  const marks = [...new Set(["type", "trainer", "foes", "double"].map(f => previewMark(m, f)).filter(Boolean))].join("");
  return `W${m.wave} ${previewKind(m)}${who}${m.double ? " (double)" : ""} — ${previewFoes(m, true)}${marks ? ` [${marks}]` : ""}`;
};
