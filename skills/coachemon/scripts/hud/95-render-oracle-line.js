import { oracleLineNow, oracleLineUnasked } from "./57-oracle-line.js";
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

// Every checkpoint is a replay claim (CONTEXT.md, `Oracle line`).
const after = st => [h("span", { flex: "1" }), h("span", { ...dim, margin: "0 3px" }, "→ ~"),
  ...st.after.flatMap((m, i) => [i ? h("span", dim, "·") : null, mon(m.icon, m.name, ICON.ref), h("span", dim, `${m.hp}/${m.maxHp}`)])];
const turnOf = st => h("span", { ...dim, marginRight: "3px" }, `T${st.turn}`);
const sendTo = (words, st) => [h("span", { ...ink.ours, margin: "0 3px" }, words), mon(st.send.icon, st.send.name, ICON.mon)];

export const drawOracleLine = m => (m?.steps ?? []).map(st => line(MARK[st.at],
  turnOf(st),
  ...act(st.act),
  ...(st.send ? [h("span", { ...dim, margin: "0 3px" }, "· send"), mon(st.send.icon, st.send.name, ICON.mon)] : []),
  ...(st.at === "later" ? [] : after(st))));

// The `act` group while the oracle line holds: this turn's step, then the inputs that are easy to get wrong.
export const drawOracleStep = m => {
  const st = oracleLineNow(m);
  if (!st) return [];
  const picking = m.pick && st.send;
  return [
    picking ? line("⚔", ...sendTo("send", st), ...after(st))
      : line(st.act ? "⚔" : "·", turnOf(st), ...act(st.act), ...after(st)),
    !picking && st.send ? line("⤵", ...sendTo("then send", st), h("span", { ...dim, marginLeft: "3px" }, "at the faint prompt")) : null,
    !picking && st.act?.tera ? line("·", h("span", dim, "Tera: ← from Fight to the Tera button")) : null,
    ...oracleLineUnasked(m).map(x => line("·", turnOf(x), ...act(null), ...after(x))),
  ].filter(Boolean);
};
