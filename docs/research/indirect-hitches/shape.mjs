// Prints one record of every kind in a Timelines export, and the sampler's shape, so the analysis reads real fields.
import fs from "node:fs";

const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).recording;
const seen = new Set();
for (const x of r.records) {
  const k = `${x.type}/${x.eventType ?? ""}`;
  if (seen.has(k) || x.startTime < 600) continue;
  seen.add(k);
  console.log(k, JSON.stringify(x).slice(0, 700));
}
const s = r.samples[0];
console.log("stackTraces", s.stackTraces.length, "durations", s.durations?.length);
console.log("sample timestamps", s.stackTraces.slice(0, 3).map(t => t.timestamp), s.stackTraces.slice(-3).map(t => t.timestamp));
console.log("durations head", s.durations?.slice(0, 5));
const urls = {};
for (const t of s.stackTraces) for (const f of t.stackFrames) urls[f.url.replace(/\?.*/, "")] = (urls[f.url.replace(/\?.*/, "")] ?? 0) + 1;
console.log(Object.entries(urls).sort((a, b) => b[1] - a[1]).slice(0, 15));
