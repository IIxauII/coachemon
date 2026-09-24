// Whole-fight plan section of the battle panel (trainer battles). Loads after 90-render: only call it from a draw,
// never at load time. Takes the `teamPlan` view, or a battle model carrying it as `teamPlan`.
// The whole plan, always: the enemy win condition, who to reserve for it, sacrifices, the step order and the
// warnings. Doubles: the plan is worked out one-on-one, so its steps are approximate.
import { badge, dim, h, ICON, ink, line, mon } from "./90-render.js";

export const drawTeamPlan = m => {
  const tp = m?.steps ? m : m?.teamPlan;
  if (!tp) return [];
  const lost = tp.result !== "win";
  const approx = !!m?.double;
  // The fight plan is every turn but the one in front of the player, so the whole section is **later** (#349 §8) —
  // the ink the `plan` group's own frame wears. Whether a step is a sacrifice, a warning or the plan simply being
  // lost is the gutter's question and the row's own words; it was never the ink's, which is what the three amber,
  // red and green spends here were doing.
  const entryTag = { free: "free", switch: "⇄" }; // a switch-in also says so in `why`
  const out = [
    line("", h("span", { fontWeight: "bold" }, "Fight plan"), approx ? h("span", { ...dim, marginLeft: "4px" }, "steps approximate") : null,
      h("span", { flex: "1" }),
      h("span", ink.later, lost ? "likely lost" : "winnable")),
  ];
  if (tp.win) {
    out.push(line("💀", mon(tp.win.icon, tp.win.name, ICON.mon), h("span", { fontWeight: "bold", marginLeft: "2px" }, tp.win.name),
      tp.win.boss ? "👑" : null, h("span", { flex: "1" }), h("span", dim, `KOs ${tp.win.kills}/${tp.win.of} · win condition`)));
  }
  for (const r of tp.reserve) {
    out.push(line("⤵", mon(r.icon, r.name, ICON.mon), h("span", { ...dim, margin: "0 3px" }, "save for"), mon(r.for.icon, r.for.name, ICON.ref),
      h("span", { flex: "1" }), h("span", r.acts ? dim : ink.later, `~${r.per}%/turn${r.acts ? "" : " · KO'd first"}`)));
  }
  // Foes still to come that only one of ours beats: the ⚔ line prices spending it, this says who and for what.
  for (const r of tp.only ?? []) {
    out.push(line("🔒", mon(r.icon, r.name, ICON.mon), h("span", { ...dim, margin: "0 3px" }, "only answer to"),
      ...r.for.flatMap((f, i) => [i ? h("span", dim, ",") : null, mon(f.icon, f.name, ICON.ref)]),
      h("span", { flex: "1" }), h("span", r.acts ? dim : ink.later, `~${r.per}%/turn${r.acts ? "" : " · KO'd first"}`)));
  }
  tp.steps.forEach((st, i) => {
    const tag = entryTag[st.entry];
    // The step's own number is the row's, not the gutter's: the gutter says what kind of news a row is, and an
    // ordinal is neither good nor bad. `➜` is what the gutter carries instead — a step is what lands later — and the
    // `~` a double's approximate plan wears stays a confidence suffix on the ordinal it qualifies (#349 §7).
    out.push(line("➜",
      h("span", { ...dim, marginRight: "3px" }, `${i + 1}.${approx ? "~" : ""}`),
      mon(st.send.icon, st.send.name, ICON.mon),
      tag ? h("span", { ...ink.later, marginRight: "2px" }, tag) : null,
      ...(st.move ? [st.type ? badge(st.type) : null, h("span", { marginRight: "2px" }, st.move)] : [h("span", dim, "—")]),
      h("span", dim, "→"), mon(st.vs.icon, st.vs.name, ICON.ref),
      h("span", { flex: "1" }),
      h("span", st.sacrifice ? ink.later : dim, st.why),
      st.notes?.length ? h("span", { ...dim, marginLeft: "4px" }, st.notes.join(" · ")) : null));
  });
  for (const x of tp.sacrifice) {
    out.push(line("✗", mon(x.icon, x.name, ICON.mon), h("span", { ...ink.later, margin: "0 3px" }, `${x.hp}% · sacrifice to`),
      mon(x.vs.icon, x.vs.name, ICON.ref), h("span", { ...dim, margin: "0 3px" }, "so"), mon(x.frees.icon, x.frees.name, ICON.ref),
      h("span", dim, "comes in free")));
  }
  // The plan's own preferred turn, priced, when it is clearly better than the one the ⚔ line chose (#113). One line,
  // never a competing step list: the ⚔ line still decides the turn.
  if (tp.prefers) {
    out.push(line("≈", h("span", { ...ink.later, marginRight: "3px" }, "prefers:"), h("span", {}, tp.prefers.text),
      h("span", { ...dim, marginLeft: "4px" }, tp.prefers.flips ? `(+${tp.prefers.gain} · turns the fight)` : `(+${tp.prefers.gain})`)));
  }
  for (const w of tp.warnings) out.push(line("⚠", h("span", ink.later, w)));
  if (tp.notes?.length) out.push(line("·", h("span", dim, tp.notes.join(" · "))));
  return out;
};
