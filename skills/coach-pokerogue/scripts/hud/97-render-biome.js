// Biome choice card (SelectBiomePhase's OPTION_SELECT) and its plain-text summary. Loads after 90-render: only call
// these from a draw or a summary, never at load time. Takes the `biomeModel` view.
// Mini: one line per option — `★ Swamp 72 — Garchomp resists, 3 mons hit SE`. Full adds the spawn type mix, the
// species met most, every reason, the best catch and where the biome leads next.
const drawBiome = m => {
  const pick = m.pick >= 0 ? m.options[m.pick] : null;
  if (view === "closed") return [tab("🗺", pick ? h("span", {}, pick.label) : null)];
  const header = bar("🗺", "Next biome", m.from ? h("span", { ...dim, fontWeight: "normal", fontSize: "9px" }, `from ${m.from}`) : null);
  if (!m.options.some(o => o.score != null)) {
    return [header, ...m.options.map(o => line("·", "#9aa", h("span", {}, o.label))),
      line("", "#9aa", h("span", { ...dim, fontSize: "9px" }, m.data ? "no spawn data for these biomes" : "reading the game's biome tables…"))];
  }
  const COLOR = { pick: "#6d6", close: "#ec4", worse: "#9aa" };
  const MARK = { pick: "★", close: "≈", worse: "·" };
  const out = [header];
  for (const o of m.options) {
    if (o.score == null) { out.push(line("?", "#9aa", h("span", dim, `${o.label} — no data`))); continue; }
    const color = COLOR[o.verdict];
    const name = h("span", { color, fontWeight: "bold", marginRight: "3px" }, o.label);
    const score = h("span", { color, marginRight: "3px" }, `${o.score}`);
    score.title = `offense ${o.offense} · defense ${o.defense} · catches ${o.opportunity}`;
    if (view === "mini") {
      out.push(line(MARK[o.verdict], color, name, score, h("span", dim, `— ${o.reasons.filter(r => !r.catch).slice(0, 2).map(r => r.text).join(", ")}`)));
      continue;
    }
    out.push(h("div", { marginTop: "4px", paddingTop: "3px", borderTop: "1px solid rgba(255,255,255,.12)" },
      line(MARK[o.verdict], color, name, h("span", { flex: "1" }), ...o.mix.map(([t, pct]) => badge(t, `${pct}%`)), score)));
    if (o.common?.length) {
      out.push(line("·", "#9aa", h("span", { ...dim, fontSize: "9px" }, `mostly ${o.common.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    for (const r of o.reasons) {
      // The catch names its species by icon (the name when the sprite isn't loaded) and then only what it's good for.
      out.push(r.catch && o.catch
        ? line("🎯", "#c9f", h("span", dim, "catch"), mon(o.catch.icon, o.catch.name, 18), h("span", dim, o.catch.tags.join(" · ")))
        : line(r.good ? "✓" : "✗", r.good ? "#6d6" : "#e77", h("span", {}, r.text)));
    }
    if (o.onward?.length) {
      out.push(line("→", "#9aa", h("span", { ...dim, fontSize: "9px" },
        o.onward.map(x => `${x.rare ? "★" : ""}${x.name}${x.chance > 1 ? ` (1/${x.chance})` : ""}`).join(" · "))));
    }
  }
  return out;
};

// `Swamp 72 pick — Garchomp resists, 3 mons hit SE · Construction Site 55`.
const biomeSummary = m => {
  const text = m.options.map(o => (o.score == null ? o.label
    : o.verdict === "pick" ? `${o.label} ${o.score} pick — ${o.reasons.slice(0, 3).map(r => r.text).join(", ")}` : `${o.label} ${o.score}`)).join(" · ");
  return { kind: m.kind, wave: m.wave ?? null, verdict: null, field: null, danger: [], learn: null, rewards: null, biome: text };
};
