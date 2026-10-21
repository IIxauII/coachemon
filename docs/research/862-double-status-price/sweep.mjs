// `sweep.mjs`: the lock scene perturbed — Outrage's hit, the foe's own pick after it, our hit, who is faster — and
// whether each design offers Protect there, with its margin over attacking. `singles` is the lead's own duel at
// #860's prices, the same number singles would show; the others are the double's designs.
import { doubleScenario, CONFIGS } from "./double-score.mjs";

const DESIGNS = { singles: CONFIGS["own + redirect + singles prices"], credit: CONFIGS.proposed };
const best = (plans, f) => plans.filter(p => p.swaps === 0 && f(p)).reduce((b, p) => (!b || p.score > b.score ? p : b), null);
const lead = p => p.picks.find(q => q.me === "Lead");
const margin = sc => {
  const out = {};
  for (const [k, cfg] of Object.entries(DESIGNS)) {
    const { plans } = doubleScenario(sc, cfg);
    const pr = best(plans, p => lead(p)?.move === "Protect"), at = best(plans, p => lead(p)?.move && lead(p).move !== "Protect");
    out[k] = pr && at ? pr.score - at.score : null;
  }
  return out;
};
const r2 = v => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2));
let agree = 0, n = 0;
const rows = [];
for (const foeSpe of [120, 60]) for (const outrage of [80, 110, 130, 150, 200, 300]) for (const own of [40, 60, 100, 150]) for (const ours of [80, 110, 160]) {
  const m = margin({ outrage, own, ours, foeSpe });
  if (m.singles == null || m.credit == null) continue;
  n++;
  const same = (m.singles > 0) === (m.credit > 0);
  if (same) agree++;
  else rows.push(`| ${foeSpe > 80 ? "foe" : "we"} | ${outrage} | ${own} | ${ours} | ${r2(m.singles)} | ${r2(m.credit)} |`);
}
console.log(`${agree} of ${n} perturbed turns pick the same way under both designs. The ones that differ:\n`);
console.log("| Faster | Outrage | Own pick | Ice Beam | Margin, singles prices | Margin, danger credit |\n| --- | --- | --- | --- | --- | --- |");
for (const r of rows) console.log(r);
