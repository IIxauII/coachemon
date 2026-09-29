import { badge, dim, h, ICON, ink, line, mon } from "./90-render.js";

export const drawTeamPlan = m => {
  const tp = m?.steps ? m : m?.teamPlan;
  if (!tp) return [];
  const lost = tp.result !== "win";
  const approx = !!m?.double;
  const entryTag = { free: "free", switch: "⇄" };
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
  for (const r of tp.only ?? []) {
    out.push(line("🔒", mon(r.icon, r.name, ICON.mon), h("span", { ...dim, margin: "0 3px" }, "only answer to"),
      ...r.for.flatMap((f, i) => [i ? h("span", dim, ",") : null, mon(f.icon, f.name, ICON.ref)]),
      h("span", { flex: "1" }), h("span", r.acts ? dim : ink.later, `~${r.per}%/turn${r.acts ? "" : " · KO'd first"}`)));
  }
  tp.steps.forEach((st, i) => {
    const tag = entryTag[st.entry];
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
  if (tp.prefers) {
    out.push(line("≈", h("span", { ...ink.later, marginRight: "3px" }, "prefers:"), h("span", {}, tp.prefers.text),
      h("span", { ...dim, marginLeft: "4px" }, tp.prefers.flips ? `(+${tp.prefers.gain} · turns the fight)` : `(+${tp.prefers.gain})`)));
  }
  for (const w of tp.warnings) out.push(line("⚠", h("span", ink.later, w)));
  if (tp.notes?.length) out.push(line("·", h("span", dim, tp.notes.join(" · "))));
  return out;
};
