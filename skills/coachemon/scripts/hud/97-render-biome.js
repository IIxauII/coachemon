// Biome choice card (SelectBiomePhase's OPTION_SELECT), as **group**s (#349 §1): `act` · `options` · `notes`, the
// same three every light card takes. Loads after 90-render: only call these from a draw, never at load time. Takes
// the `biomeModel` view.
// `options` is one line per biome — `★ Swamp 72` — with the encounter type mix, the species met most, the trainers
// met, every reason (the gym leader ahead among them), the best catch, the wild boss on the tenth wave and where the
// biome leads next. The call is `act.summary`, read off the model and never written here (§6).
import { biomeSummary } from "./47-biome.js";
import { FS, badge, bar, dim, group, h, line, mon, some } from "./90-render.js";

export const drawBiome = m => {
  // The header is the card's own identity line; the strip takes it in #356.
  const header = bar("🗺", "Next biome", m.from ? h("span", { ...dim, fontWeight: "normal", fontSize: FS.tiny }, `from ${m.from}`) : null);
  // Under Hardcore or a no-heal Limited Support the fainted don't come back at the X1 heal: say who the card left out.
  const fainted = m.fainted
    ? line("✚", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `judged without ${m.fainted} fainted — no revive at the next heal`)) : null;
  if (!m.options.some(o => o.score != null)) {
    // Nothing scored: an ordinary card with exactly one `act` group, and the shell never special-cases it (§1).
    // There is no judged list yet, so there is nothing for `options` to be.
    return [group("act", "Now", biomeSummary(m), [header,
      ...m.options.map(o => line("·", "#9aa", h("span", {}, o.label))),
      line("", "#9aa", h("span", { ...dim, fontSize: FS.tiny },
        m.unread ? `unread: ${m.unread}` : m.data ? "no spawn data for these biomes" : "reading the game's biome tables…"))])];
  }
  const COLOR = { pick: "#6d6", close: "#ec4", worse: "#9aa" };
  const MARK = { pick: "★", close: "≈", worse: "·" };
  const options = [];
  for (const o of m.options) {
    if (o.score == null) { options.push(line("?", "#9aa", h("span", dim, `${o.label} — no data`))); continue; }
    const color = COLOR[o.verdict];
    const name = h("span", { color, fontWeight: "bold", marginRight: "3px" }, o.label);
    const score = h("span", { color, marginRight: "3px" }, `${o.score}`);
    score.title = `offense ${o.offense} · defense ${o.defense} · catches ${o.opportunity} · big fight ${o.bossFit}`;
    // A rule between one biome and the next; the boundary above the first is `act`'s, which the shell draws (§1).
    options.push(h("div", options.length ? { marginTop: "4px", paddingTop: "3px", borderTop: "1px solid rgba(255,255,255,.12)" } : {},
      line(MARK[o.verdict], color, name, h("span", { flex: "1" }), ...o.mix.map(([t, pct]) => badge(t, `${pct}%`)), score)));
    if (o.common?.length) {
      options.push(line("·", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `mostly ${o.common.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.trainers) {
      options.push(line("👤", "#9aa", h("span", { ...dim, fontSize: FS.tiny }, `trainers ${o.trainers.pct}%: ${o.trainers.names.join(" · ")}`)));
    }
    for (const r of o.reasons) {
      // The catch names its species by icon (the name when the sprite isn't loaded) and then only what it's good for.
      options.push(r.catch && o.catch
        ? line("🎯", "#c9f", h("span", dim, "catch"), mon(o.catch.icon, o.catch.name, 18), h("span", dim, o.catch.tags.join(" · ")))
        : line(r.good ? "✓" : "✗", r.good ? "#6d6" : "#e77", h("span", {}, r.text)));
    }
    if (o.fight && !o.fight.gym && o.fight.foes.length) {
      options.push(line("👑", "#fa4", h("span", { ...dim, fontSize: FS.tiny }, `W${o.fight.wave} boss: ${o.fight.foes.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.onward?.length) {
      options.push(line("→", "#9aa", h("span", { ...dim, fontSize: FS.tiny },
        o.onward.map(x => `${x.rare ? "★" : ""}${x.name}${x.chance > 1 ? ` (1/${x.chance})` : ""}`).join(" · "))));
    }
  }
  // `options` heads its pane with its label alone — the biomes themselves say it one glance lower (§6).
  return [
    some("act", "Now", biomeSummary(m), [header, fainted]),
    some("options", "Biomes", null, options),
  ].filter(Boolean);
};
