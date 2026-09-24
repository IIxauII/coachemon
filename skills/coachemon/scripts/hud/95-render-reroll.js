// Reroll preview on the rewards card (the `rerollAhead` model from 52-shop's `rerollAdvice`) and its plain-text line.
// Loads after 90-render: only call these from a draw or a summary, never at load time.
// A line per roll (the lock as it stands, then toggled when a Lock Capsule is held) with its cost and verdict, and
// the offers of the first under it.
// Every line is `~`: it holds while nothing else draws from the stream before the press. `!` once a reroll this run came
// out different from its preview (`window.__coachHud.reroll()`).
import { rerollLabel, rerollMark } from "./50-reroll.js";
import { dim, h, ink, itemImg, line } from "./90-render.js";

// A reroll is a shop action the player is taking now, so the section is **ours** (#349 §8) — it draws inside `act`,
// whose frame wears the same ink. Whether the reroll is worth it is the verdict's own words; it was never the ink's
// question, which is why the four verdicts no longer carry four colours.
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
      // The best offer is the pick, so it wears `★`; a tier bump is a word, because the only mark it could take —
      // `▲` — already means *foe weak to*, and a 17th mark costs more than a word does (#349 §7).
      out.push(line(f === b ? "★" : "·", itemImg(f.icon, f.name),
        h("span", f === b ? {} : dim, `${f.name}${f.upgraded ? " upgraded" : ""}`), h("span", { flex: "1" }),
        h("span", dim, f.holder ? `${f.holder.name} · ${f.why.replace(`${f.holder.name} · `, "")}` : f.why)));
    }
  });
  return out;
};
