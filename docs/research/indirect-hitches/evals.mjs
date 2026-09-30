// Whose are the long `api-script-evaluated` records (script run through WebKit's evaluate API: AppleScript's
// `do JavaScript`, and Orion's extension bridge)? Prints the stacks sampled inside the longest ones.
import fs from "node:fs";

const rec = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).recording;
const FROM = rec.discontinuities[0].endTime;
const evals = rec.records.filter(x => x.eventType === "api-script-evaluated" && x.startTime >= FROM)
  .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));
const S = rec.samples[0];
const samples = S.stackTraces.map(t => ({ t: t.timestamp, f: t.stackFrames }));
const perSec = evals.length / (rec.endTime - FROM);
console.log(`${evals.length} evaluations, ${perSec.toFixed(1)}/s; ≥ 5 ms: ${evals.filter(x => x.endTime - x.startTime >= 0.005).length}`);
for (const x of evals.slice(0, 5)) {
  const inside = samples.filter(s => s.t >= x.startTime && s.t <= x.endTime);
  const paths = {};
  for (const s of inside) {
    const p = s.f.slice(0, 6).map(f => `${f.name || "(anon)"}@${f.url.split("/").pop() || "inline"}:${f.line}`).join(" < ");
    paths[p] = (paths[p] ?? 0) + 1;
  }
  console.log(`\n${x.startTime.toFixed(3)} s, ${Math.round((x.endTime - x.startTime) * 1000)} ms, ${inside.length} samples`);
  for (const [p, n] of Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 3)) console.log(`  ${n}× ${p}`);
}
