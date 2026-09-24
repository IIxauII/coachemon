// Whole-fight plan section of the battle panel (trainer battles). Loads after 90-render: only call it from a draw,
// never at load time. Takes the `teamPlan` view, or a battle model carrying it as `teamPlan`.
// The whole plan, always: the enemy win condition, who to reserve for it, sacrifices, the step order and the
// warnings. Doubles: the plan is worked out one-on-one, so its steps are approximate.
import { badge, dim, h, line, mon } from "./90-render.js";

export const drawTeamPlan = m => {
  const tp = m?.steps ? m : m?.teamPlan;
  if (!tp) return [];
  const red = "#e55", amber = "#fa4";
  const lost = tp.result !== "win";
  const approx = !!m?.double;
  const entryTag = { free: ["free", "#6d6"], switch: ["⇄", amber] }; // a switch-in also says so in `why`
  const out = [
    line("♟", "#c9f", h("span", { fontWeight: "bold" }, "Fight plan"), approx ? h("span", { ...dim, marginLeft: "4px" }, "steps approximate") : null,
      h("span", { flex: "1" }),
      h("span", { color: lost ? red : "#6d6" }, lost ? "likely lost" : "winnable")),
  ];
  if (tp.win) {
    out.push(line("☠", red, mon(tp.win.icon, tp.win.name, 22), h("span", { fontWeight: "bold", marginLeft: "2px" }, tp.win.name),
      tp.win.boss ? "👑" : null, h("span", { flex: "1" }), h("span", dim, `KOs ${tp.win.kills}/${tp.win.of} · win condition`)));
  }
  for (const r of tp.reserve) {
    out.push(line("🛡", "#6d6", mon(r.icon, r.name, 20), h("span", { ...dim, margin: "0 3px" }, "save for"), mon(r.for.icon, r.for.name, 18),
      h("span", { flex: "1" }), h("span", r.acts ? dim : { color: amber }, `~${r.per}%/turn${r.acts ? "" : " · KO'd first"}`)));
  }
  // Foes still to come that only one of ours beats: the ⚔ line prices spending it, this says who and for what.
  for (const r of tp.only ?? []) {
    out.push(line("🔒", "#6d6", mon(r.icon, r.name, 20), h("span", { ...dim, margin: "0 3px" }, "only answer to"),
      ...r.for.flatMap((f, i) => [i ? h("span", dim, ",") : null, mon(f.icon, f.name, 18)]),
      h("span", { flex: "1" }), h("span", r.acts ? dim : { color: amber }, `~${r.per}%/turn${r.acts ? "" : " · KO'd first"}`)));
  }
  tp.steps.forEach((st, i) => {
    const tag = entryTag[st.entry];
    out.push(line(`${approx ? "~" : ""}${i + 1}`, "#8cf",
      mon(st.send.icon, st.send.name, 20),
      tag ? h("span", { color: tag[1], marginRight: "2px" }, tag[0]) : null,
      ...(st.move ? [st.type ? badge(st.type) : null, h("span", { marginRight: "2px" }, st.move)] : [h("span", dim, "—")]),
      h("span", dim, "→"), mon(st.vs.icon, st.vs.name, 18),
      h("span", { flex: "1" }),
      h("span", st.sacrifice ? { color: amber } : dim, st.why),
      st.notes?.length ? h("span", { ...dim, marginLeft: "4px" }, st.notes.join(" · ")) : null));
  });
  for (const x of tp.sacrifice) {
    out.push(line("✝", amber, mon(x.icon, x.name, 20), h("span", { color: amber, margin: "0 3px" }, `${x.hp}% · sacrifice to`),
      mon(x.vs.icon, x.vs.name, 18), h("span", { ...dim, margin: "0 3px" }, "so"), mon(x.frees.icon, x.frees.name, 18),
      h("span", dim, "comes in free")));
  }
  // The plan's own preferred turn, priced, when it is clearly better than the one the ⚔ line chose (#113). One line,
  // never a competing step list: the ⚔ line still decides the turn.
  if (tp.prefers) {
    out.push(line("♟", amber, h("span", { color: amber, marginRight: "3px" }, "prefers:"), h("span", {}, tp.prefers.text),
      h("span", { ...dim, marginLeft: "4px" }, tp.prefers.flips ? `(+${tp.prefers.gain} · turns the fight)` : `(+${tp.prefers.gain})`)));
  }
  for (const w of tp.warnings) out.push(line("⚠", red, h("span", { color: red }, w)));
  if (tp.notes?.length) out.push(line("·", "#9aa", h("span", dim, tp.notes.join(" · "))));
  return out;
};
