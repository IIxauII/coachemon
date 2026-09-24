// Catch section of the battle panel (wild battles). Loads after 90-render: only call it from a draw, never at load
// time. Takes the `catchAdvice` view, or a battle model carrying it as `catch`.
// Skips aren't drawn: no line means nothing worth a ball. One line per target —
// `🎯 catch: [ball] Great 78% — new species, covers Ground weakness` — then the odds of every ball we hold and the reasons.
import { catchTargets } from "./45-catch.js";
import { dim, h, ICON, img, line, mon } from "./90-render.js";

export const drawCatch = m => {
  const c = m?.targets ? m : m?.catch;
  if (!c?.targets?.length) return [];
  const COLOR = { catch: "#6d6", maybe: "#ec4" };
  const KIND = { account: ["★", "#c9f"], team: ["⚑", "#8cf"], escape: ["⇥", "#fa4"] };
  // Ball sprites live in the `items` atlas (may not be loaded yet); the name is always spelled out: "Great", "Ultra".
  const ball = x => [img("items", x.key, x.ball, ICON.mark, null),
    h("span", { marginRight: "3px" }, x.ball.replace(/ Ball$/, ""))];
  const pct = p => `${Math.round(p * 100)}%`;
  const out = [];
  const targets = catchTargets(c);
  if (!targets.length) return [];
  for (const t of targets) {
    const color = COLOR[t.verdict];
    const best = t.best;
    out.push(line("🎯", color,
      mon(t.icon, t.name, ICON.mon),
      h("span", { color, fontWeight: "bold", marginRight: "3px" }, `${t.verdict}:`),
      best ? ball(t.best) : null,
      best ? h("span", { color, marginRight: "3px" }, pct(t.best.p)) : null,
      h("span", {}, best ? `— ${t.why}` : t.why)));
    out.push(line("", "#9aa", ...t.chance.map(x => h("span", { display: "inline-flex", alignItems: "center", marginRight: "5px", ...(x.p > 0 ? {} : dim) },
      ...ball(x), `×${x.count} ${pct(x.p)}`))));
    for (const r of t.reasons) out.push(line(KIND[r.kind][0], KIND[r.kind][1], h("span", dim, r.text)));
  }
  return out;
};
