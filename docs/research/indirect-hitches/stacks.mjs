// Zooms into the overlay-free hitches: which record types fill their busy time, how densely the sampler covered them,
// and the full stacks under the texture work, so it can be told whose Text objects were being drawn.
import fs from "node:fs";

const [file] = process.argv.slice(2);
const rec = JSON.parse(fs.readFileSync(file, "utf8")).recording;
const FROM = rec.discontinuities[0].endTime, TO = rec.endTime;
const records = rec.records.filter(x => x.startTime >= FROM && x.startTime <= TO);
const markerName = m => (typeof m.details === "string" ? m.details : m.details?.name) ?? "";
const coach = rec.markers.filter(m => m.type === "timestamp" && markerName(m).startsWith("coach:") && m.time >= FROM).sort((a, b) => a.time - b.time);
const spans = [];
let open = null;
for (const m of coach) {
  const n = markerName(m).slice(6);
  if (n === "refresh" || n === "driver") open = { start: m.time, kind: n };
  else if (n === "idle" && open) { open.end = m.time; spans.push(open); open = null; }
}
// Overlay-free as in analyse.mjs: no refresh inside, and under 1 ms of the driver's polling.
const inGap = (a, b, kind) => spans.filter(s => s.kind === kind).reduce((t, s) => t + Math.max(0, Math.min(b, s.end) - Math.max(a, s.start)), 0);
const overlayFree = (a, b) => inGap(a, b, "refresh") === 0 && inGap(a, b, "driver") < 0.001;
const rafs = records.filter(x => x.eventType === "animation-frame-fired").map(x => x.startTime).sort((a, b) => a - b);
const frames = [];
for (const t of rafs) if (!frames.length || t - frames.at(-1) > 0.004) frames.push(t);
const free = [];
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], b = frames[i];
  if (b - a >= 0.05 && overlayFree(a, b)) free.push([a, b]);
}
const S = rec.samples[0];
const samples = S.stackTraces.map((t, i) => ({ t: t.timestamp, d: S.durations[i], f: t.stackFrames })).filter(s => s.t >= FROM);

const byType = {};
let sampled = 0, span = 0;
for (const [a, b] of free) {
  for (const x of records) {
    if (x.endTime <= a || x.startTime >= b || !(x.endTime > x.startTime)) continue;
    const k = `${x.type.replace("timeline-record-type-", "")}/${x.eventType ?? ""}`;
    byType[k] = (byType[k] ?? 0) + Math.min(b, x.endTime) - Math.max(a, x.startTime);
  }
  const sm = samples.filter(s => s.t >= a && s.t < b);
  sampled += sm.length;
  span += b - a;
}
console.log("overlay-free hitches", free.length, "busy by record type (ms):",
  Object.fromEntries(Object.entries(byType).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, Math.round(v * 1000)])));
console.log("samples in them", sampled, "over", Math.round(span * 1000), "ms");

// Sample spacing inside one busy animation frame: is the sampler really at 1 ms?
// Coverage: samples per ms of every rAF callback of 20 ms or more.
const longRafs = records.filter(x => x.eventType === "animation-frame-fired" && x.endTime - x.startTime >= 0.02);
const cov = longRafs.map(x => samples.filter(s => s.t >= x.startTime && s.t <= x.endTime).length / ((x.endTime - x.startTime) * 1000)).sort((p, q) => p - q);
console.log(`rAF callbacks ≥ 20 ms: ${longRafs.length}; samples per ms p10/p50/p90: ${[0.1, 0.5, 0.9].map(q => cov[Math.floor(cov.length * q)]?.toFixed(2)).join(" / ")}; with none: ${cov.filter(c => c === 0).length}`);
const perSec = {};
for (const s of samples) perSec[Math.floor(s.t / 10) * 10] = (perSec[Math.floor(s.t / 10) * 10] ?? 0) + 1;
console.log("samples per 10 s:", JSON.stringify(perSec));

// Distinct call paths under the texture work in overlay-free hitches (innermost first, 14 frames deep).
const paths = {};
for (const [a, b] of free) for (const s of samples.filter(s => s.t >= a && s.t < b)) {
  if (!s.f.some(f => /_processTexture|updateText|canvasToTexture|texImage/.test(f.name))) continue;
  const p = s.f.slice(0, 14).map(f => `${f.name || "(anon)"}@${f.url.split("/").pop().replace(/-[\w]+\.js$/, "")}:${f.line}`).join(" < ");
  paths[p] = (paths[p] ?? 0) + 1;
}
for (const [p, n] of Object.entries(paths).sort((x, y) => y[1] - x[1]).slice(0, 6)) console.log(`\n${n}× ${p}`);

// The same texture work inside the overlay's refreshes, for comparison.
let inRefresh = 0, outside = 0;
for (const s of samples) {
  if (!s.f.some(f => f.name === "_processTexture")) continue;
  if (spans.some(sp => s.t >= sp.start && s.t <= sp.end)) inRefresh++; else outside++;
}
console.log(`\n_processTexture samples: ${inRefresh} inside the overlay's or driver's spans, ${outside} outside`);
