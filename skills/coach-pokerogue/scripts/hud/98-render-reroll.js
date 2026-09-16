// Reroll preview on the rewards card (the `rerollAhead` model from 50-shop's `rerollAdvice`) and its plain-text line.
// Loads after 90-render: only call these from a draw or a summary, never at load time.
// Mini: nothing unless a reroll is worth it — `🎲 reroll $500 → Leftovers ✓`. Full: a line per roll (the lock as it
// stands, then toggled when a Lock Capsule is held) with its cost and verdict, and the offers of the first under it.
// Every line is `~`: it holds while nothing else draws from the stream before the press. `!` once a reroll this run came
// out different from its preview (`window.__coachHud.reroll()`).
const REROLL_VERDICT = { reroll: ["✓ worth it", "#6d6"], "instead of buys": ["✓ over the buys", "#ec4"], keep: ["keep", "#9aa"], short: ["can't pay", "#e77"] };
const rerollMark = r => (r.missed ? "!" : "~");
const rerollLabel = (r, roll) => (!r.canLock ? "reroll" : roll.lock === r.locked ? (roll.lock ? "reroll locked" : "reroll")
  : roll.lock ? "lock, reroll" : "unlock, reroll");
const rerollBest = roll => (roll.best >= 0 ? roll.offers[roll.best] : null);

const drawReroll = (m, viewOverride) => {
  const r = m.rerollAhead;
  const v = viewOverride ?? view;
  if (!r) return m.reroll && v === "full" ? [line("🎲", "#8cf", h("span", dim, m.reroll))] : [];
  const worth = roll => roll.verdict === "reroll" || roll.verdict === "instead of buys";
  if (v !== "full") {
    const roll = r.rolls.find(worth);
    if (!roll) return [];
    const b = rerollBest(roll);
    return [line(roll.lock ? "🔒" : "🎲", REROLL_VERDICT[roll.verdict][1], h("span", { marginRight: "3px" }, `${rerollLabel(r, roll)} $${roll.cost}${rerollMark(r)} →`),
      itemImg(b.icon, b.name), h("span", { fontWeight: "bold" }, b.name), h("span", { ...dim, marginLeft: "3px" }, REROLL_VERDICT[roll.verdict][0]))];
  }
  const out = [];
  r.rolls.forEach((roll, i) => {
    const [text, color] = REROLL_VERDICT[roll.verdict];
    const b = rerollBest(roll);
    out.push(line(roll.lock ? "🔒" : "🎲", color, h("span", { marginRight: "3px" }, `${rerollLabel(r, roll)} $${roll.cost}${rerollMark(r)}`),
      h("span", { color, marginRight: "3px" }, text),
      h("span", { ...dim, fontSize: FS.tiny }, i === 0 && b ? `best ${b.name} (${roll.gain >= 0 ? "+" : ""}${roll.gain})`
        : roll.offers.map(f => f.name).join(" · "))));
    if (i > 0) return;
    for (const f of roll.offers) {
      out.push(line(f === b ? "›" : "·", f === b ? color : "#9aa", itemImg(f.icon, f.name),
        h("span", f === b ? {} : dim, `${f.name}${f.upgraded ? " ⬆" : ""}`), h("span", { flex: "1" }),
        h("span", { color: "#9aa", fontSize: FS.tiny }, f.holder ? `${f.holder.name} · ${f.why.replace(`${f.holder.name} · `, "")}` : f.why)));
    }
  });
  return out;
};

// `reroll $500 → Leftovers, TM Crunch, Revive (reroll) [~]`, for the watcher and the rewards read.
const rerollSummary = m => {
  const r = m.rerollAhead;
  if (!r) return null;
  return r.rolls.map(roll => `${rerollLabel(r, roll)} $${roll.cost} → ${roll.offers.map(f => f.name).join(", ")} (${roll.verdict}) [${rerollMark(r)}]`).join(" · ");
};
