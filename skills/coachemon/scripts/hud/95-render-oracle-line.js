import { oracleLineNow, oracleLineUnasked, pickWords } from "./57-oracle-line.js";
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

// A checkpoint's mark (CONTEXT.md, `Confidence`).
const after = (st, mark) => [h("span", { flex: "1" }), h("span", { ...dim, margin: "0 3px" }, `→ ${mark}`),
  ...st.after.flatMap((m, i) => [i ? h("span", dim, "·") : null, mon(m.icon, m.name, ICON.ref), h("span", dim, `${m.hp}/${m.maxHp}`)])];
const turnOf = st => h("span", { ...dim, marginRight: "3px" }, `T${st.turn}`);
const sendTo = (words, st) => [h("span", { ...ink.ours, margin: "0 3px" }, words), mon(st.send.icon, st.send.name, ICON.mon)];
const picked = p => [mon(p.icon, p.name, ICON.mon), h("span", { ...ink.ours, marginLeft: "3px" }, pickWords(p))];
const thenPicked = p => [h("span", { ...ink.ours, margin: "0 3px" }, "then"), ...picked(p)];

export const drawOracleLine = m => (m?.steps ?? []).map(st => line(MARK[st.at],
  turnOf(st),
  ...act(st.act),
  ...st.learns.flatMap(p => [h("span", { ...dim, margin: "0 3px" }, "·"), ...picked(p)]),
  ...(st.send ? [h("span", { ...dim, margin: "0 3px" }, "· send"), mon(st.send.icon, st.send.name, ICON.mon)] : []),
  ...(st.at === "later" ? [] : after(st, m.mark))));

export const drawOracleStep = m => {
  const st = oracleLineNow(m);
  if (!st) return [];
  const learning = m.learning, picking = !learning && m.faintPick && st.send;
  // A move prompt from a KO by a move comes before the turn's faint prompt (game-code.md §21).
  const toCome = learning ? st.learns.slice(st.learns.indexOf(learning) + 1) : picking ? [] : st.learns;
  return [
    learning ? line("⚔", ...picked(learning), ...after(st, m.mark))
      : picking ? line("⚔", ...sendTo("send", st), ...after(st, m.mark))
      : line(st.act ? "⚔" : "·", turnOf(st), ...act(st.act), ...after(st, m.mark)),
    ...toCome.map(p => line("⤵", ...thenPicked(p), h("span", { ...dim, marginLeft: "3px" }, "at the move prompt"))),
    !picking && st.send ? line("⤵", ...sendTo("then send", st), h("span", { ...dim, marginLeft: "3px" }, "at the faint prompt")) : null,
    !picking && !learning && st.act?.tera ? line("·", h("span", dim, "Tera: ← from Fight to the Tera button")) : null,
    ...oracleLineUnasked(m).map(x => line("·", turnOf(x), ...act(null), ...x.learns.flatMap(thenPicked), ...(x.send ? sendTo("then send", x) : []),
      ...after(x, m.mark))),
  ].filter(Boolean);
};

export const drawOffTheLine = o => (o?.misses ?? []).map(x => line("✗", turnOf(o), mon(x.icon, x.name, ICON.mon),
  h("span", { ...dim, margin: "0 3px" }, "expected"), h("span", {}, x.expected),
  h("span", { ...dim, margin: "0 3px" }, "· came"), h("span", { fontWeight: "bold" }, x.came)));
