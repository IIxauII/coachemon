// Biome choice card (SelectBiomePhase's OPTION_SELECT) and its plain-text summary. Loads after 90-render: only call
// these from a draw or a summary, never at load time. Takes the `biomeModel` view.
// Mini: one line per option — `★ Swamp 72 — Garchomp resists, 3 mons hit SE`. Full adds the encounter type mix, the
// species met most, the trainers met, every reason (the gym leader ahead among them), the best catch, the wild boss on
// the tenth wave and where the biome leads next.
import { FS, badge, bar, dim, h, line, mon, tab, view } from "./90-render.js";

export const drawBiome = m => {
  const pick = m.pick >= 0 ? m.options[m.pick] : null;
  if (view() === "closed") return [tab("🗺", pick ? h("span", {}, pick.label) : null)];
  const header = bar("🗺", "Next biome", m.from ? h("span", { ...dim, fontWeight: "normal", fontSize: FS.tiny }, `from ${m.from}`) : null);
  // Under Hardcore or a no-heal Limited Support the fainted don't come back at the X1 heal: say who the card left out.
  const fainted = m.fainted && view() === "full"
    ? line("✚", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `judged without ${m.fainted} fainted — no revive at the next heal`)) : null;
  if (!m.options.some(o => o.score != null)) {
    return [header, ...m.options.map(o => line("·", "#9aa", h("span", {}, o.label))),
      line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, m.data ? "no spawn data for these biomes" : "reading the game's biome tables…"))];
  }
  const COLOR = { pick: "#6d6", close: "#ec4", worse: "#9aa" };
  const MARK = { pick: "★", close: "≈", worse: "·" };
  const out = [header, fainted].filter(Boolean);
  for (const o of m.options) {
    if (o.score == null) { out.push(line("?", "#9aa", h("span", dim, `${o.label} — no data`))); continue; }
    const color = COLOR[o.verdict];
    const name = h("span", { color, fontWeight: "bold", marginRight: "3px" }, o.label);
    const score = h("span", { color, marginRight: "3px" }, `${o.score}`);
    score.title = `offense ${o.offense} · defense ${o.defense} · catches ${o.opportunity} · big fight ${o.bossFit}`;
    if (view() === "mini") {
      out.push(line(MARK[o.verdict], color, name, score, h("span", dim, `— ${o.reasons.filter(r => !r.catch).slice(0, 2).map(r => r.text).join(", ")}`)));
      continue;
    }
    out.push(h("div", { marginTop: "4px", paddingTop: "3px", borderTop: "1px solid rgba(255,255,255,.12)" },
      line(MARK[o.verdict], color, name, h("span", { flex: "1" }), ...o.mix.map(([t, pct]) => badge(t, `${pct}%`)), score)));
    if (o.common?.length) {
      out.push(line("·", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `mostly ${o.common.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.trainers) {
      out.push(line("👤", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `trainers ${o.trainers.pct}%: ${o.trainers.names.join(" · ")}`)));
    }
    for (const r of o.reasons) {
      // The catch names its species by icon (the name when the sprite isn't loaded) and then only what it's good for.
      out.push(r.catch && o.catch
        ? line("🎯", "#c9f", h("span", dim, "catch"), mon(o.catch.icon, o.catch.name, 18), h("span", dim, o.catch.tags.join(" · ")))
        : line(r.good ? "✓" : "✗", r.good ? "#6d6" : "#e77", h("span", {}, r.text)));
    }
    if (o.fight && !o.fight.gym && o.fight.foes.length) {
      out.push(line("👑", "#fa4", h("span", { ...dim, fontSize: FS.tiny }, `W${o.fight.wave} boss: ${o.fight.foes.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.onward?.length) {
      out.push(line("→", "#9aa", h("span", { ...dim, fontSize: FS.tiny },
        o.onward.map(x => `${x.rare ? "★" : ""}${x.name}${x.chance > 1 ? ` (1/${x.chance})` : ""}`).join(" · "))));
    }
  }
  return out;
};
