import { biomeSummary } from "./47-biome.js";
import { badge, caption, dim, group, h, ICON, ink, line, mon, some } from "./90-render.js";

export const captionBiome = m => caption("🗺", "Next biome",
  m.from ? h("span", { ...dim, fontWeight: "normal" }, `from ${m.from}`) : null);

export const drawBiome = m => {
  const fainted = m.fainted
    ? line("⚠", h("span", dim, `judged without ${m.fainted} fainted — no revive at the next heal`)) : null;
  if (!m.options.some(o => o.score != null)) {
    return [group("act", "Now", biomeSummary(m), [
      ...m.options.map(o => line("·", h("span", {}, o.label))),
      line("", h("span", dim,
        m.unread ? `unread: ${m.unread}` : m.data ? "no spawn data for these biomes" : "reading the game's biome tables…"))])];
  }
  const MARK = { pick: "★", close: "≈", worse: "·" };
  const options = [];
  for (const o of m.options) {
    if (o.score == null) { options.push(line("·", h("span", dim, `${o.label} — no data`))); continue; }
    const name = h("span", { ...ink.ours, fontWeight: "bold", marginRight: "3px" }, o.label);
    const score = h("span", { ...ink.ours, marginRight: "3px" }, `${o.score}`);
    score.title = `offense ${o.offense} · defense ${o.defense} · catches ${o.opportunity} · big fight ${o.bossFit}`;
    // Not the loop index: an unscored option above has already pushed a row of its own.
    options.push(h("div", options.length ? { marginTop: "4px", paddingTop: "3px", borderTop: "1px solid rgba(255,255,255,.12)" } : {},
      line(MARK[o.verdict], name, h("span", { flex: "1" }), ...o.mix.map(([t, pct]) => badge(t, `${pct}%`)), score)));
    if (o.common?.length) {
      options.push(line("·", h("span", dim, `mostly ${o.common.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.trainers) {
      options.push(line("·", h("span", dim, `trainers ${o.trainers.pct}%: ${o.trainers.names.join(" · ")}`)));
    }
    for (const r of o.reasons) {
      options.push(r.catch && o.catch
        ? line("★", h("span", dim, "catch"), mon(o.catch.icon, o.catch.name, ICON.ref), h("span", dim, o.catch.tags.join(" · ")))
        : line(r.good ? "✓" : "✗", h("span", {}, r.text)));
    }
    if (o.fight && !o.fight.gym && o.fight.foes.length) {
      options.push(line("👑", h("span", dim, `W${o.fight.wave} boss: ${o.fight.foes.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.onward?.length) {
      options.push(line("·", h("span", dim,
        `onward: ${o.onward.map(x => `${x.rare ? "rare " : ""}${x.name}${x.chance > 1 ? ` (1/${x.chance})` : ""}`).join(" · ")}`)));
    }
  }
  return [
    some("act", "Now", biomeSummary(m), []),
    some("options", "Biomes", null, options),
    some("notes", "Notes", null, [fainted]),
  ].filter(Boolean);
};
