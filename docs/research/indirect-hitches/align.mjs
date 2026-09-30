// Checks that a Timelines export and a lag-run log share one clock: each refresh the meter logged should sit on a
// `coach:refresh` marker in the export.
import fs from "node:fs";

const [log, tl] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(tl, "utf8")).recording;
const ticks = new Map(), gaps = new Map();
for (const line of fs.readFileSync(log, "utf8").split("\n")) {
  if (!line) continue;
  const o = JSON.parse(line);
  if (o.kind !== "window" || !o.stats) continue;
  for (const t of o.stats.ticks ?? []) ticks.set(t.seq, t);
  for (const g of o.stats.gaps ?? []) gaps.set(g.at, g);
}
const name = m => (typeof m.details === "string" ? m.details : m.details?.name);
const marks = r.markers.filter(m => name(m) === "coach:refresh").map(m => m.time * 1000);
const inRec = [...ticks.values()].filter(t => t.at > 587500 && t.at < 832000);
const d = inRec.map(t => Math.min(...marks.map(m => Math.abs(m - t.at)))).sort((a, b) => a - b);
console.log("ticks in recording", inRec.length, "refresh marks", marks.length,
  "nearest mark ms p50/p95/max", d[d.length >> 1]?.toFixed(2), d[Math.floor(d.length * 0.95)]?.toFixed(2), d.at(-1)?.toFixed(2));
// The signed offset (export − meter), early and late in the recording: a drift would show as a slope.
const signed = inRec.map(t => {
  const m = marks.reduce((b, x) => (Math.abs(x - t.at) < Math.abs(b - t.at) ? x : b));
  return [t.at, m - t.at];
});
console.log("signed offset first/last", signed.slice(0, 3).map(x => x.map(v => v.toFixed(1))), signed.slice(-3).map(x => x.map(v => v.toFixed(1))));
console.log("gaps logged", gaps.size, "in recording", [...gaps.values()].filter(g => g.at > 587500 && g.at < 832000).length);
console.log("a marker:", JSON.stringify(r.markers.find(m => m.type === "timestamp")));
