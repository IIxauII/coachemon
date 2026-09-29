import { rerollLabel, rerollMark } from "./50-reroll.js";
import { dim, h, ink, itemImg, line } from "./90-render.js";

const REROLL_VERDICT = { reroll: "✓ worth it", "instead of buys": "✓ over the buys", keep: "keep", short: "can't pay" };
const rerollBest = roll => (roll.best >= 0 ? roll.offers[roll.best] : null);

export const drawReroll = m => {
  const r = m.rerollAhead;
  if (!r) return m.reroll ? [line("🎲", h("span", dim, m.reroll))] : [];
  const out = [];
  r.rolls.forEach((roll, i) => {
    const b = rerollBest(roll);
    out.push(line(roll.lock ? "🔒" : "🎲", h("span", { marginRight: "3px" }, `${rerollLabel(r, roll)} $${roll.cost}${rerollMark(r)}`),
      h("span", { ...ink.ours, marginRight: "3px" }, REROLL_VERDICT[roll.verdict]),
      h("span", dim, i === 0 && b ? `best ${b.name} (${roll.gain >= 0 ? "+" : ""}${roll.gain})`
        : roll.offers.map(f => f.name).join(" · "))));
    if (i > 0) return;
    for (const f of roll.offers) {
      out.push(line(f === b ? "★" : "·", itemImg(f.icon, f.name),
        h("span", f === b ? {} : dim, `${f.name}${f.upgraded ? " upgraded" : ""}`), h("span", { flex: "1" }),
        h("span", dim, f.holder ? `${f.holder.name} · ${f.why.replace(`${f.holder.name} · `, "")}` : f.why)));
    }
  });
  return out;
};
