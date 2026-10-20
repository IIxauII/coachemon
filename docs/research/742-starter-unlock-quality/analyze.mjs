// `node docs/research/742-starter-unlock-quality/analyze.mjs` prints the README's tables from results.json and
// history.json, and writes the headline numbers to analysis.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = JSON.parse(readFileSync(path.join(HERE, "results.json"), "utf8"));
const h = JSON.parse(readFileSync(path.join(HERE, "history.json"), "utf8"));
const byName = new Map(r.starters.map(s => [s.name, s]));
const pct = (a, b) => `${Math.round((100 * a) / b)} %`;
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * f)]; };
const rank = xs => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const out = []; idx.forEach(([, i], k) => { out[i] = k; }); return out; };
const spearman = (a, b) => {
  const ra = rank(a), rb = rank(b), n = a.length, ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return +(num / Math.sqrt(da * db)).toFixed(2);
};
const w = id => r.weights.egg[id];
const cell = e => `${e.kind}${e.gain == null ? "" : ` ${e.gain > 0 ? "+" : ""}${e.gain}`}`;
const out = {};

console.log("## The nine rare-slot changes (learn card on the final form's stand-in, L50)\n");
console.log("| Starter → final | Stand-in moves | Before | gain | After | gain | Card says | #740 said |");
console.log("|---|---|---|---|---|---|---|---|---|");
const said = ["much weaker", "weaker", "weaker", "loses STAB nuke", "sidegrade", "sidegrade", "sidegrade", "sidegrade", "sidegrade"];
r.patch.forEach((p, i) => {
  const d = (p.after.gain ?? 0) - (p.before.gain ?? 0);
  const verdict = Math.abs(d) < 15 ? "sidegrade" : d > 0 ? "stronger" : "weaker";
  console.log(`| ${p.starter} → ${p.final} | ${p.standIn.join(", ")} | ${p.before.name} | ${cell(p.before)} | ${p.after.name} | ${cell(p.after)} | ${verdict} (${d > 0 ? "+" : ""}${d}) | ${said[i]} |`);
});

const STRONG = ["Gible", "Joltik", "Oshawott", "Lapras", "Mew", "Tarountula", "Oddish", "Elekid", "Beldum", "Mankey", "Magikarp", "Squirtle", "Larvesta"];
const WEAK = ["Spinarak", "Gulpin", "Ekans", "Guzzlord", "Stunky", "Venonat", "Emolga", "Luvdisc", "Sableye", "Shuckle"];
const sample = names => {
  console.log("| Starter → final | Rare egg move | Cat. | Learn card | vs | Derived weight (flat 6) |");
  console.log("|---|---|---|---|---|---|");
  for (const n of names) {
    const s = byName.get(n), e = s.eggs[3];
    console.log(`| ${n} → ${s.final} | ${e.name} | ${e.cat} | ${cell(e)} | ${e.against ?? "—"} | ${w(s.id).toFixed(1)} |`);
  }
};
console.log("\n## Sample: commonly cited strong rare egg moves\n");
sample(STRONG);
console.log("\n## Sample: rare egg moves of little use to the final form\n");
sample(WEAK);

const rare = r.starters.filter(s => s.eggs[3]).map(s => ({ s, e: s.eggs[3] }));
const status = rare.filter(x => x.e.cat === "status"), damaging = rare.filter(x => x.e.cat !== "status");
const gains = xs => xs.map(x => x.e.gain).filter(g => g != null);
out.rare = {
  total: rare.length, status: status.length, damaging: damaging.length,
  unscorable: rare.filter(x => x.e.gain == null).length,
  skipped: rare.filter(x => x.e.kind === "skip").length,
  skippedStatus: status.filter(x => x.e.kind === "skip").length,
  medianGain: { all: med(gains(rare)), status: med(gains(status)), damaging: med(gains(damaging)) },
  gainQuantiles: { p10: q(gains(rare), 0.1), p25: q(gains(rare), 0.25), p50: q(gains(rare), 0.5), p75: q(gains(rare), 0.75), p90: q(gains(rare), 0.9) },
  derivedWeight: { zero: Object.values(r.weights.egg).filter(x => x === 0).length, capped: Object.values(r.weights.egg).filter(x => x >= 12).length,
    p10: q(Object.values(r.weights.egg), 0.1), median: med(Object.values(r.weights.egg)), p90: q(Object.values(r.weights.egg), 0.9) },
  scale: r.weights.scale,
};
const lv = r.levels.filter(x => [30, 50, 80].every(l => typeof x.at[l] === "number"));
out.levelSpearman = { n: lv.length, l30_l50: spearman(lv.map(x => x.at[30]), lv.map(x => x.at[50])), l50_l80: spearman(lv.map(x => x.at[50]), lv.map(x => x.at[80])) };
const setupNames = new Map();
for (const x of status) (setupNames.get(x.e.name) ?? setupNames.set(x.e.name, []).get(x.e.name)).push(x.e.gain);

console.log("\n## Passive signals on the final forms' passives\n");
const kinds = {};
for (const [id, v] of Object.entries(r.weights.passive)) {
  const k = `${v.kind}`;
  (kinds[k] ??= { n: 0, w: {}, ex: new Set() }).n++;
  kinds[k].w[v.w] = (kinds[k].w[v.w] ?? 0) + 1;
  const s = r.starters.find(x => String(x.id) === id);
  if (kinds[k].ex.size < 5) kinds[k].ex.add(s.passive.name);
}
console.log("| Signal | Starters | Weights given | Example passives |");
console.log("|---|---|---|---|");
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`| ${k} | ${v.n} (${pct(v.n, r.starters.length)}) | ${Object.entries(v.w).map(([x, n]) => `${n}× ${x}`).join(", ")} | ${[...v.ex].join(", ")} |`);
}
const passives = new Set(r.starters.map(s => s.passive.name)), attrs = new Set(r.starters.flatMap(s => s.passive.attrs));
out.passives = { starters: r.starters.length, distinctPassives: passives.size, distinctAttrClasses: attrs.size,
  movedOffFlat: Object.values(r.weights.passive).filter(v => v.w !== 8).length };

console.log("\n## Proposal changes against flat weights (synthetic accounts)\n");
console.log("| Account profile | Accounts | egg | egg (damaging only) | passive | passive (inert only) | both | control: shuffled egg |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [p, v] of Object.entries(r.sims)) {
  const c = k => `${pct(v[k].best, v.accounts)} best · ${pct(v[k].any, v.accounts)} any · ${v[k].swappedPerAccount}`;
  console.log(`| ${p} | ${v.accounts} | ${c("egg")} | ${c("eggDamaging")} | ${c("passive")} | ${c("passiveInert")} | ${c("both")} | ${c("shuffledEgg")} |`);
}
out.sims = r.sims;

console.log("\n## Upstream churn per release (history.json)\n");
const s = h.summary;
out.history = { releases: s.releasesCovered, withRare: s.releasesWithRareSlotChange, withStarterPassive: s.releasesWithStarterPassiveChange,
  rare: s.rareSlotChangesPerRelease, starterPassive: s.starterPassiveSpeciesChangedPerRelease, byLine: s.totalsByLine };
console.log(JSON.stringify(out.history, null, 1));
writeFileSync(path.join(HERE, "analysis.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log("\n", JSON.stringify({ rare: out.rare, levelSpearman: out.levelSpearman, passives: out.passives }, null, 1));
