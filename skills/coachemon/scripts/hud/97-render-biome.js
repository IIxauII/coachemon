// Biome choice card (SelectBiomePhase's OPTION_SELECT), as **group**s (#349 §1): `act` · `options` · `notes`, the
// same three every light card takes. Loads after 90-render: only call these from a draw, never at load time. Takes
// the `biomeModel` view.
// `options` is one line per biome — `★ Swamp 72` — with the encounter type mix, the species met most, the trainers
// met, every reason (the gym leader ahead among them), the best catch, the wild boss on the tenth wave and where the
// biome leads next. The call is `act.summary`, read off the model and never written here (§6).
import { biomeSummary } from "./47-biome.js";
import { badge, caption, dim, group, h, ICON, ink, line, mon, some } from "./90-render.js";

// The strip's caption: the choice, and the biome it is being made from.
export const captionBiome = m => caption("🗺", "Next biome",
  m.from ? h("span", { ...dim, fontWeight: "normal" }, `from ${m.from}`) : null);

export const drawBiome = m => {
  // Under Hardcore or a no-heal Limited Support the fainted don't come back at the X1 heal: say who the card left
  // out. It is a footnote on how the scores were arrived at, not a supporting line for the call, so it is `notes` —
  // the same place the encounter card puts "not judged yet".
  const fainted = m.fainted
    ? line("⚠", h("span", dim, `judged without ${m.fainted} fainted — no revive at the next heal`)) : null;
  if (!m.options.some(o => o.score != null)) {
    // Nothing scored: an ordinary card with exactly one `act` group, and the shell never special-cases it (§1).
    // There is no judged list yet, so there is nothing for `options` to be.
    return [group("act", "Now", biomeSummary(m), [
      ...m.options.map(o => line("·", h("span", {}, o.label))),
      line("", h("span", dim,
        m.unread ? `unread: ${m.unread}` : m.data ? "no spawn data for these biomes" : "reading the game's biome tables…"))])];
  }
  // A no-arrow kind, so the law degrades to **ours** alone (#349 §8). Which biome to take is the gutter's question,
  // answered by `★` · `≈` · `·` — so the three verdicts no longer carry three inks saying it again.
  const MARK = { pick: "★", close: "≈", worse: "·" };
  const options = [];
  for (const o of m.options) {
    // Confidence is not a gutter mark (90-render's alphabet); the row's own "no data" carries the kind.
    if (o.score == null) { options.push(line("·", h("span", dim, `${o.label} — no data`))); continue; }
    const name = h("span", { ...ink.ours, fontWeight: "bold", marginRight: "3px" }, o.label);
    const score = h("span", { ...ink.ours, marginRight: "3px" }, `${o.score}`);
    score.title = `offense ${o.offense} · defense ${o.defense} · catches ${o.opportunity} · big fight ${o.bossFit}`;
    // A rule between one biome and the next; the boundary above the first is `act`'s, which the shell draws (§1).
    // Keyed on what is already in the group rather than on the loop index, because an unscored option above this
    // one has pushed a row of its own and this is no longer the first thing in the pane.
    options.push(h("div", options.length ? { marginTop: "4px", paddingTop: "3px", borderTop: "1px solid rgba(255,255,255,.12)" } : {},
      line(MARK[o.verdict], name, h("span", { flex: "1" }), ...o.mix.map(([t, pct]) => badge(t, `${pct}%`)), score)));
    if (o.common?.length) {
      options.push(line("·", h("span", dim, `mostly ${o.common.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.trainers) {
      options.push(line("·", h("span", dim, `trainers ${o.trainers.pct}%: ${o.trainers.names.join(" · ")}`)));
    }
    for (const r of o.reasons) {
      // The catch names its species by icon (the name when the sprite isn't loaded) and then only what it's good for.
      options.push(r.catch && o.catch
        ? line("★", h("span", dim, "catch"), mon(o.catch.icon, o.catch.name, ICON.ref), h("span", dim, o.catch.tags.join(" · ")))
        : line(r.good ? "✓" : "✗", h("span", {}, r.text)));
    }
    if (o.fight && !o.fight.gym && o.fight.foes.length) {
      options.push(line("👑", h("span", dim, `W${o.fight.wave} boss: ${o.fight.foes.map(([n, pct]) => `${n} ${pct}%`).join(" · ")}`)));
    }
    if (o.onward?.length) {
      // `★` means one thing — the pick — so a rare exit is the word `rare`, and the row leads with `onward` where
      // the arrow used to carry the kind.
      options.push(line("·", h("span", dim,
        `onward: ${o.onward.map(x => `${x.rare ? "rare " : ""}${x.name}${x.chance > 1 ? ` (1/${x.chance})` : ""}`).join(" · ")}`)));
    }
  }
  // `options` and `notes` head their panes with their label alone — the biomes themselves say it one glance lower
  // (§6) — and `notes` isn't drawn at all on the ordinary card that has no footnote to make.
  // `act.summary` is the model's line over the offered biomes, so it is never empty on a card the game produced:
  // an option list is what the biome screen is.
  return [
    some("act", "Now", biomeSummary(m), []),
    some("options", "Biomes", null, options),
    some("notes", "Notes", null, [fainted]),
  ].filter(Boolean);
};
