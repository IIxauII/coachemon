import { badge, dim, h, ICON, ink, line, mon } from "./90-render.js";

const MARK = { done: "✓", now: "▸", later: "·" };

const act = a => {
  if (!a) return [h("span", dim, "no input")];
  if (a.kind === "switch") return [h("span", { ...ink.ours, marginRight: "3px" }, "⇄"), mon(a.to.icon, a.to.name, ICON.mon)];
  return [
    a.by ? mon(a.by.icon, a.by.name, ICON.mon) : null,
    ...(a.tera ? [h("span", { ...ink.ours, marginLeft: "3px" }, "Tera"), a.tera.type ? badge(a.tera.type) : null, h("span", { ...dim, marginRight: "3px" }, "+")] : []),
    a.type ? badge(a.type) : null,
    h("span", { fontWeight: "bold" }, a.move),
  ];
};

const after = st => [h("span", { flex: "1" }), h("span", { ...dim, margin: "0 3px" }, "→"),
  ...st.after.flatMap((m, i) => [i ? h("span", dim, "·") : null, mon(m.icon, m.name, ICON.ref), h("span", dim, `${m.hp}/${m.maxHp}`)])];

export const drawOracleLine = m => (m?.steps ?? []).map(st => line(MARK[st.at],
  h("span", { ...dim, marginRight: "3px" }, `T${st.turn}`),
  ...act(st.act),
  ...(st.send ? [h("span", { ...dim, margin: "0 3px" }, "· send"), mon(st.send.icon, st.send.name, ICON.mon)] : []),
  ...(st.at === "later" ? [] : after(st))));
