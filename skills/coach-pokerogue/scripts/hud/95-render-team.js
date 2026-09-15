// Whole-fight plan section of the battle panel (full view, trainer battles). Loads after 90-render: only call it
// from a draw, never at load time. Takes the `teamPlan` view, or a battle model carrying it as `teamPlan`.
const drawTeamPlan = m => {
  const tp = m?.steps ? m : m?.teamPlan;
  if (!tp || view !== "full") return [];
  const red = "#e55", amber = "#fa4";
  const small = { color: "#9aa", fontSize: "9px" };
  const entryTag = { free: ["free", "#6d6"], switch: ["⇄", amber] }; // a switch-in also says so in `why`
  const out = [
    h("div", { borderTop: "1px solid rgba(255,255,255,.12)", margin: "5px 0 2px" }),
    line("♟", "#c9f", h("span", { fontWeight: "bold" }, "Fight plan"), h("span", { flex: "1" }),
      h("span", { color: tp.result === "win" ? "#6d6" : red }, tp.result === "win" ? "winnable" : "likely lost")),
  ];
  if (tp.win) {
    out.push(line("☠", red, mon(tp.win.icon, tp.win.name, 22), h("span", { fontWeight: "bold", marginLeft: "2px" }, tp.win.name),
      tp.win.boss ? "👑" : null, h("span", { flex: "1" }), h("span", dim, `KOs ${tp.win.kills}/${tp.win.of} · win condition`)));
  }
  for (const r of tp.reserve) {
    out.push(line("🛡", "#6d6", mon(r.icon, r.name, 20), h("span", { ...dim, margin: "0 3px" }, "save for"), mon(r.for.icon, r.for.name, 18),
      h("span", { flex: "1" }), h("span", r.acts ? dim : { color: amber }, `~${r.per}%/turn${r.acts ? "" : " · KO'd first"}`)));
  }
  tp.steps.forEach((st, i) => {
    const tag = entryTag[st.entry];
    out.push(line(`${i + 1}`, "#8cf",
      mon(st.send.icon, st.send.name, 20),
      tag ? h("span", { color: tag[1], fontSize: "9px", marginRight: "2px" }, tag[0]) : null,
      ...(st.move ? [st.type ? badge(st.type) : null, h("span", { marginRight: "2px" }, st.move)] : [h("span", dim, "—")]),
      h("span", dim, "→"), mon(st.vs.icon, st.vs.name, 18),
      h("span", { flex: "1" }),
      h("span", st.sacrifice ? { color: amber, fontSize: "9px" } : small, st.why)));
  });
  for (const x of tp.sacrifice) {
    out.push(line("✝", amber, mon(x.icon, x.name, 20), h("span", { color: amber, margin: "0 3px" }, `${x.hp}% · sacrifice to`),
      mon(x.vs.icon, x.vs.name, 18), h("span", { ...dim, margin: "0 3px" }, "so"), mon(x.frees.icon, x.frees.name, 18),
      h("span", dim, "comes in free")));
  }
  for (const w of tp.warnings) out.push(line("⚠", red, h("span", { color: red }, w)));
  return out;
};
