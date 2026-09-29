import { catchTargets } from "./45-catch.js";
import { dim, h, ICON, img, ink, line, mon } from "./90-render.js";

export const drawCatch = m => {
  const c = m?.targets ? m : m?.catch;
  if (!c?.targets?.length) return [];
  const VERDICT = { catch: "★", maybe: "≈" };
  const REASON_KIND = { account: "account", team: "team", escape: "escape" };
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
