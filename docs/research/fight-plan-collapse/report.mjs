// PROTOTYPE for #526: the comparison table out of a run.ts results file (the newest in .cache/collapse-proto by default).
//   node docs/research/fight-plan-collapse/report.mjs [results.json]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(ROOT, ".cache/collapse-proto");
const file = process.argv[2] ?? path.join(dir, readdirSync(dir).filter(f => f.endsWith(".json")).sort().at(-1));
const rows = JSON.parse(readFileSync(file, "utf8"));

const p90 = a => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(0.9 * a.length))];
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const r1 = x => (x == null ? "–" : x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
const share = (n, of) => (n ? `**${n}**/${of}` : `0/${of}`);

const groups = [
  ["Heals: fixed states (3 reps)", r => r.name.startsWith("heals") && !r.berries && r.random == null],
  ["Heals: random mid-fight states", r => r.name.startsWith("heals") && !r.berries && r.random != null],
  ["Heals, a Sitrus Berry on every mon (fixed and random)", r => r.berries],
  ["Control, no healer (fixed and random)", r => r.name.startsWith("plain")],
];
const ids = Object.keys(rows[0].variants);
const actKey = o => JSON.stringify(o.act);
const stepKey = o => JSON.stringify(o.steps?.map(s => [s.mi, s.fi, s.entry]));
const winnable = o => o.result === "win";
// What else the fight plan shows: everything in its view but the result and win condition already counted.
const planRest = o => JSON.stringify({ ...o.plan, result: undefined, win: undefined });
// The card's plan as the player reads it: who goes in against whom with what, the "prefers" hint, and the warnings.
const routeKey = o => JSON.stringify(o.plan?.steps?.map(s => [s.send.name, s.vs.name, s.entry, s.move]));
const prefKey = o => JSON.stringify(o.plan?.prefers && [o.plan.prefers.text, o.plan.prefers.flips]);
const warnKey = o => JSON.stringify(o.plan?.warnings?.map(w => w.replace(/\d+/g, "#")));

const unstable = rows.flatMap(r => Object.entries(r.variants).filter(([, o]) => !o.stable).map(([id]) => `${r.name} / ${id}`));
console.log(`results: ${path.relative(ROOT, file)} · ${rows.length} states · variants: ${ids.join(", ")}`);
if (unstable.length) console.log(`UNSTABLE across reps (card differed between reps): ${unstable.join("; ")}`);

for (const [title, pick] of groups) {
  const rs = rows.filter(pick);
  if (!rs.length) continue;
  const n = rs.length;
  const baseMs = rs.map(r => med(r.variants.base.ms));
  console.log(`\n### ${title}: ${n} states · base card p50 ${r1(med(baseMs))} ms, max ${r1(Math.max(...baseMs))} ms · base collapse ${r1(rs.reduce((t, r) => t + med(r.variants.base.collapseMs), 0) / rs.reduce((t, r) => t + med(r.variants.base.ms), 0) * 100)}% of card time\n`);
  console.log("| variant | card p50 ms (×) | card p90 ms (×) | card max ms (×) | act line: move/target | verdict flips | win condition | hint line (prefers) | plan route (ties†) | warnings | anything on the card | plan value drift p50 · max | odds drift, same route |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const id of ids) {
    const ms = rs.map(r => med(r.variants[id].ms));
    const p50 = med(ms), max = Math.max(...ms);
    let act = 0, flip = 0, win = 0, hint = 0, routes = 0, ties = 0, warns = 0, card = 0;
    const dv = [], dodds = [];
    for (const r of rs) {
      const b = r.variants.base, o = r.variants[id];
      if (actKey(o) !== actKey(b)) act++;
      if (winnable(o) !== winnable(b)) flip++;
      if (o.win !== b.win) win++;
      if (prefKey(o) !== prefKey(b)) hint++;
      if (routeKey(o) !== routeKey(b)) { routes++; if (stepKey(o) !== stepKey(b) && Math.abs(o.value - b.value) < 1e-6) ties++; }
      if (warnKey(o) !== warnKey(b)) warns++;
      if (o.sig !== b.sig) card++;
      if (o.value != null && b.value != null) dv.push(Math.abs(o.value - b.value));
      if (stepKey(o) === stepKey(b)) b.steps?.forEach((x, i) => dodds.push(Math.abs(x.odds - o.steps[i].odds)));
    }
    console.log(`| ${id} | ${r1(p50)} (${r1(med(baseMs) / p50)}×) | ${r1(p90(ms))} (${r1(p90(baseMs) / p90(ms))}×) | ${r1(max)} (${r1(Math.max(...baseMs) / max)}×) | ${share(act, n)} | ${share(flip, n)} | ${share(win, n)} | ${share(hint, n)} | ${share(routes, n)}${routes ? ` (${ties}†)` : ""} | ${share(warns, n)} | ${share(card, n)} | ${r1(med(dv))} · ${r1(Math.max(0, ...dv))} | ${dodds.length ? `${(Math.max(...dodds) * 100).toFixed(1)} pts` : "–"} |`);
  }
}
console.log("\n† the unpinned plan took another route at exactly the same value: a tie the beam's sort broke the other way.");

// Where the rest of the card goes once the collapse is cheap: medians over the heal states, per variant.
console.log("\n### What is left of a heals card, per variant (sums over all heal states, ms)\n");
console.log("| variant | card | collapse | beam merge (k = 4) | game calls | everything else | `tpFight` runs (memo misses) |");
console.log("|---|---|---|---|---|---|---|");
for (const id of ids) {
  const rs = rows.filter(r => r.name.startsWith("heals"));
  const sum = f => rs.reduce((t, r) => t + f(r.variants[id]), 0);
  const card = sum(o => med(o.ms)), col = sum(o => med(o.collapseMs)), k4 = sum(o => o.mergeK4Ms), game = sum(o => o.gameMs ?? 0);
  console.log(`| ${id} | ${r1(card)} | ${r1(col)} | ${r1(k4)} | ${r1(game)} | ${r1(card - col - k4 - game)} | ${sum(o => o.fightRuns)} |`);
}

// The full view of what changed, per state: the act line, the verdict and the plan's first steps.
if (process.env.DETAIL) {
  const stepsText = o => (o.plan?.steps ?? []).slice(0, 4).map(s => `${s.send.name}→${s.vs.name}`).join(" ");
  for (const r of rows) {
    const b = r.variants.base;
    for (const id of ids.filter(i => process.env.DETAIL === "1" || process.env.DETAIL.split(",").includes(i))) {
      const o = r.variants[id];
      if (o.sig === b.sig) continue;
      const what = [
        actKey(o) !== actKey(b) && `act "${b.actText}" → "${o.actText}"`,
        winnable(o) !== winnable(b) && `verdict ${b.result} → ${o.result}`,
        o.win !== b.win && `win ${b.win} → ${o.win}`,
        stepKey(o) !== stepKey(b) && `steps ${stepsText(b)} → ${stepsText(o)}`,
        planRest(o) !== planRest(b) && stepKey(o) === stepKey(b) && "plan text only",
        planRest(o) === planRest(b) && stepKey(o) === stepKey(b) && "outside the plan",
      ].filter(Boolean);
      console.log(`${r.name} · ${id}: ${what.join(" · ")} · value ${b.value?.toFixed(2)} → ${o.value?.toFixed(2)}`);
    }
  }
}
