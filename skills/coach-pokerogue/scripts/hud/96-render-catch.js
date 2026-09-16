// Catch section of the battle panel (wild battles). Loads after 90-render: only call it from a draw, never at load
// time. Takes the `catchAdvice` view, or a battle model carrying it as `catch`.
// Skips aren't drawn: no line means nothing worth a ball. Mini: one line per target —
// `🎯 catch: [ball] Great 78% — new species, covers Ground weakness`. Full adds the odds of every ball we hold and the reasons.
const drawCatch = m => {
  const c = m?.targets ? m : m?.catch;
  if (!c?.targets?.length || view === "closed") return [];
  const COLOR = { catch: "#6d6", maybe: "#ec4" };
  const KIND = { account: ["★", "#c9f"], team: ["⚑", "#8cf"], escape: ["⇥", "#fa4"] };
  // Ball sprites live in the `items` atlas (may not be loaded yet); the name is always spelled out: "Great", "Ultra".
  const ball = (x, height = 14) => [img("items", x.key, x.ball, height, null),
    h("span", { marginRight: "3px" }, x.ball.replace(/ Ball$/, ""))];
  const pct = p => `${Math.round(p * 100)}%`;
  const out = view === "full" ? [h("div", { borderTop: "1px solid rgba(255,255,255,.12)", margin: "5px 0 2px" })] : [];
  const targets = c.targets.filter(t => t.verdict !== "skip");
  if (!targets.length) return [];
  for (const t of targets) {
    const color = COLOR[t.verdict];
    const best = t.best;
    out.push(line("🎯", color,
      view === "full" || c.targets.length > 1 ? mon(t.icon, t.name, 20) : null,
      h("span", { color, fontWeight: "bold", marginRight: "3px" }, `${t.verdict}:`),
      best ? ball(t.best) : null,
      best ? h("span", { color, marginRight: "3px" }, pct(t.best.p)) : null,
      h("span", {}, best ? `— ${t.why}` : t.why)));
    if (view !== "full") continue;
    out.push(line("", "#9aa", ...t.chance.map(x => h("span", { display: "inline-flex", alignItems: "center", marginRight: "5px", fontSize: FS.tiny, ...(x.p > 0 ? {} : dim) },
      ...ball(x, 12), `×${x.count} ${pct(x.p)}`))));
    for (const r of t.reasons) out.push(line(KIND[r.kind][0], KIND[r.kind][1], h("span", dim, r.text)));
  }
  return out;
};
