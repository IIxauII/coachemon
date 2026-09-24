// Catch section of the battle panel (wild battles). Loads after 90-render: only call it from a draw, never at load
// time. Takes the `catchAdvice` view, or a battle model carrying it as `catch`.
// Skips aren't drawn: no line means nothing worth a ball. One line per target —
// `★ catch: [ball] Great 78% — new species, covers Ground weakness` — then the odds of every ball we hold and the reasons.
import { catchTargets } from "./45-catch.js";
import { dim, h, ICON, img, ink, line, mon } from "./90-render.js";

export const drawCatch = m => {
  const c = m?.targets ? m : m?.catch;
  if (!c?.targets?.length) return [];
  // The verdict is the mark alone now: a catch is the pick, a maybe is the close call (#349 §7), and how good the
  // throw is was the one thing the ink beside them was saying twice. Catching is a decision the player is making
  // right now, so every row here is **ours** (§8) — the ink the group's own frame wears.
  const VERDICT = { catch: "★", maybe: "≈" };
  // A reason is *why* to catch, not how good the catch is, so the three kinds are **words** in the row and the
  // gutter stays neutral. One ink across the three, because they differ in kind and the law's question is
  // direction: three inks for three kinds is the spend the law took away.
  const REASON_KIND = { account: "account", team: "team", escape: "escape" };
  // Ball sprites live in the `items` atlas (may not be loaded yet); the name is always spelled out: "Great", "Ultra".
  const ball = x => [img("items", x.key, x.ball, ICON.mark, null),
    h("span", { marginRight: "3px" }, x.ball.replace(/ Ball$/, ""))];
  const pct = p => `${Math.round(p * 100)}%`;
  const out = [];
  const targets = catchTargets(c);
  if (!targets.length) return [];
  for (const t of targets) {
    const best = t.best;
    out.push(line(VERDICT[t.verdict],
      mon(t.icon, t.name, ICON.mon),
      h("span", { ...ink.ours, fontWeight: "bold", marginRight: "3px" }, `${t.verdict}:`),
      best ? ball(t.best) : null,
      best ? h("span", { ...ink.ours, marginRight: "3px" }, pct(t.best.p)) : null,
      h("span", {}, best ? `— ${t.why}` : t.why)));
    out.push(line("", ...t.chance.map(x => h("span", { display: "inline-flex", alignItems: "center", marginRight: "5px", ...(x.p > 0 ? {} : dim) },
      ...ball(x), `×${x.count} ${pct(x.p)}`))));
    for (const r of t.reasons) out.push(line("·",
      h("span", { ...ink.ours, marginRight: "3px" }, REASON_KIND[r.kind]), h("span", dim, r.text)));
  }
  return out;
};
