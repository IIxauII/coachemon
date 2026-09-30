// Ticket #509: does the overlay cause the game's own hitches indirectly? Reads one Orion Timelines export and
// attributes every hitch (a frame gap of 50 ms or more) inside the hand-started recording to what the main thread
// did in it, then tests each indirect channel against chance.
//
//   node docs/research/indirect-hitches/analyse.mjs <export.timeline.json> [fromSeconds] [toSeconds]
//
// Everything is in the export's own clock: frames from the rAF callbacks it recorded, the overlay's and the driver's
// work from the meter's `coach:` markers (`coach:refresh` … `coach:idle`, `coach:driver` … `coach:idle`).
import fs from "node:fs";

const [file, fromArg, toArg] = process.argv.slice(2);
const rec = JSON.parse(fs.readFileSync(file, "utf8")).recording;
// The auto-captured page load ends at the export's one discontinuity; the hand-started recording follows it.
const FROM = Number(fromArg ?? rec.discontinuities?.[0]?.endTime ?? rec.startTime);
const TO = Number(toArg ?? rec.endTime);
const HITCH = 0.05, HEAVY = 0.015;
const ms = s => Math.round(s * 10000) / 10;
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "–");

const inside = x => (x.startTime ?? x.timestamp) >= FROM && (x.startTime ?? x.timestamp) <= TO;
const records = rec.records.filter(x => x.startTime !== undefined && inside(x)).sort((a, b) => a.startTime - b.startTime);
const of = (type, ev) => records.filter(x => x.type === `timeline-record-type-${type}` && (!ev || x.eventType === ev));

// --- The overlay's and the driver's intervals, from the meter's markers.
const markerName = m => (typeof m.details === "string" ? m.details : m.details?.name) ?? "";
const markers = rec.markers.filter(m => m.type === "timestamp" && markerName(m).startsWith("coach:") && m.time >= FROM - 1 && m.time <= TO)
  .sort((a, b) => a.time - b.time);
const refreshes = [], drivers = [];
let open = null;
for (const m of markers) {
  const n = markerName(m).slice(6);
  if (n === "refresh" || n === "driver") open = { kind: n, start: m.time, marks: [], stages: new Map() };
  else if (n === "idle" && open) {
    open.end = m.time;
    // A stage runs from its mark to the next one: nested stages make this approximate, never larger than the refresh.
    open.marks.forEach(({ n: s, t }, i) => open.stages.set(s, (open.stages.get(s) ?? 0) + (open.marks[i + 1]?.t ?? open.end) - t));
    (open.kind === "refresh" ? refreshes : drivers).push(open);
    open = null;
  } else if (open) open.marks.push({ n, t: m.time });
}
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const sumIn = (list, a, b, s = x => x.start, e = x => x.end) => list.reduce((t, x) => t + overlap(a, b, s(x), e(x)), 0);

// --- Frames: rAF callbacks within 4 ms of each other are one frame (Phaser's and the meter's watcher).
const rafs = of("script", "animation-frame-fired").map(x => x.startTime);
const frames = [];
for (const t of rafs) if (!frames.length || t - frames.at(-1) > 0.004) frames.push(t);
const hitches = [];
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], b = frames[i];
  if (b - a >= HITCH) hitches.push({ a, b, gap: b - a });
}

// --- What the main thread did inside each hitch.
const gcs = of("script", "garbage-collected");
const layoutEv = ev => of("layout", ev);
const paints = layoutEv("paint");
// The overlay's box is the only DOM painted over the canvas; its paints sit in the page's left margin.
const paintQuads = {};
for (const p of paints) { const k = `${p.quad?.[0]}-${p.quad?.[2]}`; paintQuads[k] = (paintQuads[k] ?? 0) + 1; }
const overlayPaint = p => p.quad && p.quad[2] <= 700;
const busy = records.filter(x => x.endTime > x.startTime && x.type !== "timeline-record-type-rendering-frame");

// Samples: 1 ms each, in JS only. Labelled by the marker interval they fall in, else by the code on their stack.
const S = rec.samples?.[0] ?? { stackTraces: [], durations: [] };
const samples = S.stackTraces.map((t, i) => ({ t: t.timestamp, d: S.durations[i], frames: t.stackFrames }))
  .filter(s => s.t >= FROM && s.t <= TO);
const inList = (list, t) => list.some(x => t >= x.start && t <= x.end);
const label = s => {
  if (inList(refreshes, s.t)) return "overlay";
  if (inList(drivers, s.t)) return "driver";
  const urls = s.frames.map(f => f.url);
  if (urls.some(u => u.startsWith("https://pokerogue.net"))) return "game";
  if (urls.some(u => u.startsWith("user-script"))) return "extension (outside a refresh)";
  return "other";
};
const topGame = s => s.frames.find(f => f.url.startsWith("https://pokerogue.net") && f.name);
for (const s of samples) s.label = label(s);

const union = (list, a, b) => {
  const iv = list.map(x => [Math.max(a, x.startTime), Math.min(b, x.endTime)]).filter(([s, e]) => e > s).sort((p, q) => p[0] - q[0]);
  let t = 0, cs = -1, ce = -1;
  for (const [s, e] of iv) { if (s > ce) { t += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
  return t + (ce - cs);
};
const between = (list, a, b) => list.filter(x => x.endTime > a && x.startTime < b);

for (const h of hitches) {
  const { a, b } = h;
  h.overlay = sumIn(refreshes, a, b);
  h.driver = sumIn(drivers, a, b);
  const g = between(gcs, a, b);
  h.gc = g.reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  h.fullGc = g.filter(x => x.details?.type === "full").reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  h.style = between(layoutEv("recalculate-styles"), a, b).reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  h.layout = between(layoutEv("layout"), a, b).reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  const p = between(paints, a, b);
  h.paintOverlay = p.filter(overlayPaint).reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  h.paintOther = p.filter(x => !overlayPaint(x)).reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  h.composite = between(layoutEv("composite"), a, b).reduce((t, x) => t + overlap(a, b, x.startTime, x.endTime), 0);
  h.busy = union(between(busy, a, b), a, b);
  h.idle = h.gap - h.busy;
  const sm = samples.filter(s => s.t >= a && s.t < b);
  h.samples = {};
  for (const s of sm) h.samples[s.label] = (h.samples[s.label] ?? 0) + s.d;
  h.top = {};
  for (const s of sm) if (s.label === "game") { const f = topGame(s); const k = f ? `${f.name} (${f.url.split("/").pop().replace(/-.*/, "")})` : "?"; h.top[k] = (h.top[k] ?? 0) + s.d; }
  h.overlayFree = h.overlay < 0.001 && h.driver < 0.001;
}

// --- Report.
const total = (list, k) => list.reduce((t, h) => t + (typeof k === "function" ? k(h) : h[k]), 0);
const free = hitches.filter(h => h.overlayFree);
const hitchTime = total(hitches, "gap"), freeTime = total(free, "gap");
console.log(`recording ${FROM.toFixed(1)}–${TO.toFixed(1)} s (${(TO - FROM).toFixed(0)} s): ${frames.length} frames, ${refreshes.length} refreshes, ${drivers.length} driver commands`);
console.log(`hitches ≥ 50 ms: ${hitches.length}, ${ms(hitchTime)} ms; with overlay code in them: ${hitches.length - free.length}; overlay ms inside: ${ms(total(hitches, "overlay"))} (${pct(total(hitches, "overlay"), hitchTime)} of hitch time); driver ms: ${ms(total(hitches, "driver"))}`);
console.log(`overlay-free hitches: ${free.length}, ${ms(freeTime)} ms (${pct(freeTime, hitchTime)} of hitch time)`);
console.log("\nWhat the main thread did in the overlay-free hitches (ms, share of their time):");
for (const k of ["gc", "fullGc", "style", "layout", "paintOverlay", "paintOther", "composite", "busy", "idle"]) console.log(`  ${k.padEnd(13)} ${String(ms(total(free, k))).padStart(8)}  ${pct(total(free, k), freeTime)}`);
const sampleTotals = {};
for (const h of free) for (const [k, v] of Object.entries(h.samples)) sampleTotals[k] = (sampleTotals[k] ?? 0) + v;
console.log("  JS samples by owner:", Object.fromEntries(Object.entries(sampleTotals).map(([k, v]) => [k, `${ms(v)} ms`])));
const tops = {};
for (const h of free) for (const [k, v] of Object.entries(h.top)) tops[k] = (tops[k] ?? 0) + v;
console.log("  game functions on top of the stack:", Object.entries(tops).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k} ${ms(v)}`).join("; "));

// Channel tests: is an overlay-free hitch more likely soon after a heavy refresh than a random frame is?
const heavy = refreshes.filter(r => r.end - r.start >= HEAVY);
// A preview replay is a `road` stage that did real work; an unchanged run key returns in well under a millisecond.
const road = refreshes.filter(r => (r.stages.get("road") ?? 0) >= 0.005);
const after = (list, t, w) => list.some(x => t - x.end >= 0 && t - x.end <= w);
console.log(`\nheavy refreshes (≥ ${HEAVY * 1000} ms): ${heavy.length}; with a preview replay (road ≥ 5 ms): ${road.length}`);

// Busy time in the overlay-free hitches that is neither the game's frame nor GC: whose events and evaluations.
const who = {};
for (const h of free) for (const x of between(busy, h.a, h.b)) {
  if (x.eventType !== "event-dispatched" && x.eventType !== "api-script-evaluated") continue;
  const k = `${x.eventType} ${x.details || ""}`;
  who[k] = (who[k] ?? 0) + overlap(h.a, h.b, x.startTime, x.endTime);
}
console.log("events and evaluations in overlay-free hitches (ms):", Object.fromEntries(Object.entries(who).map(([k, v]) => [k, ms(v)])));
// The lag run's own work outside the meter's `coach:driver` marks: AppleScript evaluations (the meter's drain, the
// tab checks) and the hub's command events. A human session has neither.
const harness = x => x.eventType === "api-script-evaluated" || (x.eventType === "event-dispatched" && /^coachemon:/.test(x.details));
const evals = busy.filter(x => x.eventType === "api-script-evaluated").map(x => x.endTime - x.startTime).sort((p, q) => p - q);
console.log(`AppleScript evaluations: ${evals.length}, p50 ${ms(evals[evals.length >> 1])} ms, p95 ${ms(evals[Math.floor(evals.length * 0.95)])} ms, max ${ms(evals.at(-1))} ms`);
for (const h of free) h.harness = union(between(busy.filter(harness), h.a, h.b), h.a, h.b);
const withHarness = free.filter(h => h.harness >= 0.005);
console.log(`overlay-free hitches with ≥ 5 ms of the lag run's own work: ${withHarness.length}/${free.length}; that work ${ms(total(free, "harness"))} ms (${pct(total(free, "harness"), freeTime)})`);
console.log(`  without it they would still be hitches: ${withHarness.filter(h => h.gap - h.harness >= HITCH).length}/${withHarness.length}`);
for (const [name, list] of [["heavy", heavy], ["road", road]]) for (const w of [0.1, 0.25, 0.5, 1]) {
  const hit = free.filter(h => after(list, h.a, w)).length;
  const base = frames.filter(t => after(list, t, w)).length / frames.length;
  console.log(`  overlay-free hitches starting ≤ ${w * 1000} ms after a ${name} refresh: ${hit}/${free.length} (${pct(hit, free.length)}); frames in those windows by chance: ${pct(base, 1)}`);
}
// GC: are collections more frequent, or longer, just after a heavy refresh (allocation handed to a later frame)?
for (const w of [0.25, 0.5, 1]) {
  const winTime = heavy.length * w;
  const gin = gcs.filter(g => after(heavy, g.startTime, w));
  const rateIn = gin.length / winTime, rateAll = gcs.length / (TO - FROM);
  console.log(`  GCs ≤ ${w * 1000} ms after a heavy refresh: ${gin.length} (${rateIn.toFixed(1)}/s vs ${rateAll.toFixed(1)}/s overall), mean ${ms(gin.reduce((t, g) => t + g.endTime - g.startTime, 0) / (gin.length || 1))} ms vs ${ms(gcs.reduce((t, g) => t + g.endTime - g.startTime, 0) / gcs.length)} ms`);
}
const fulls = gcs.filter(g => g.details?.type === "full");
console.log(`  GCs overall: ${gcs.length} (${fulls.length} full), ${ms(total(gcs, g => g.endTime - g.startTime))} ms; full GC ms ${ms(total(fulls, g => g.endTime - g.startTime))}`);
// The reverse direction: a collection that runs inside a refresh is charged to the overlay whoever made the garbage.
const gcInRefresh = gcs.reduce((t, g) => t + sumIn(refreshes, g.startTime, g.endTime), 0);
const fullInRefresh = fulls.filter(g => sumIn(refreshes, g.startTime, g.endTime) > 0);
console.log(`  GC ms inside refreshes: ${ms(gcInRefresh)} of the overlay's ${ms(total(refreshes, r => r.end - r.start))} ms; full GCs inside a refresh: ${fullInRefresh.length}/${fulls.length} (${ms(total(fullInRefresh, g => g.endTime - g.startTime))} ms)`);
// WebKit runs every collection between tasks (clock-check.mjs), so a refresh's garbage is always collected after
// it. Does a collection follow a heavy refresh more often than it follows any moment? And the bound: were every
// collection in an overlay-free hitch the overlay's, how many of those hitches would it have made?
const gcSoon = (t, w) => gcs.some(g => g.startTime >= t && g.startTime - t <= w);
for (const [label, list] of [["heavy", heavy], ["road", road]]) {
  const hit = list.filter(r => gcSoon(r.end, 0.02)).length;
  const base = frames.filter(t => gcSoon(t, 0.02)).length / frames.length;
  const durs = list.flatMap(r => gcs.filter(g => g.startTime >= r.end && g.startTime - r.end <= 0.02)).map(g => g.endTime - g.startTime);
  console.log(`  a GC within 20 ms after a ${label} refresh: ${hit}/${list.length} (${pct(hit, list.length)}) vs ${pct(base, 1)} after any frame; those GCs mean ${ms(durs.reduce((t, d) => t + d, 0) / (durs.length || 1))} ms`);
}
const madeByGc = free.filter(h => h.gc > 0 && h.gap - h.gc < HITCH);
console.log(`  overlay-free hitches that would fall under ${HITCH * 1000} ms without their GC: ${madeByGc.length}/${free.length}`);
// An eden collection takes what was allocated since the last one: collections between the last refresh and the
// hitch's own mean the refresh's garbage was already gone.
for (const h of madeByGc) {
  const last = refreshes.filter(r => r.end <= h.a).at(-1);
  const g0 = gcs.find(g => g.endTime > h.a && g.startTime < h.b);
  const before = gcs.filter(g => g.startTime >= last.end && g.startTime < g0.startTime).length;
  console.log(`    ${h.a.toFixed(3)} s gap ${ms(h.gap)} gc ${ms(h.gc)} (${g0.details?.type}); last refresh ${ms(h.a - last.end)} ms earlier, ${ms(last.end - last.start)} ms; ${before} collections in between`);
}
const hitchGc = hitches.filter(h => !h.overlayFree);
console.log(`  in hitches with overlay code: GC ${ms(total(hitchGc, "gc"))} ms, full ${ms(total(hitchGc, "fullGc"))} ms of their ${ms(total(hitchGc, "gap"))} ms`);
// Composite after a preview replay: the GPU work of the textures a replay's Text objects uploaded.
const compositeIn = (a, b) => layoutEv("composite").filter(c => c.startTime >= a && c.startTime < b);
const nextFrames = road.map(r => frames.find(t => t > r.end)).filter(Boolean);
const cAfter = nextFrames.flatMap(t => compositeIn(t, t + 0.1)).map(c => c.endTime - c.startTime);
const cAll = layoutEv("composite").map(c => c.endTime - c.startTime).sort((x, y) => x - y);
const p = (arr, q) => ms([...arr].sort((x, y) => x - y)[Math.floor(arr.length * q)] ?? 0);
console.log(`  composite in the 100 ms after a road refresh: n ${cAfter.length}, p50 ${p(cAfter, 0.5)} ms, p95 ${p(cAfter, 0.95)} ms; all composites p50 ${p(cAll, 0.5)}, p95 ${p(cAll, 0.95)}`);
console.log(`  paint quads (x0-x1 → count):`, paintQuads);

console.log("\nThe 15 longest overlay-free hitches:");
for (const h of [...free].sort((x, y) => y.gap - x.gap).slice(0, 15)) {
  const prev = refreshes.filter(r => r.end <= h.a).at(-1);
  console.log(`  ${h.a.toFixed(3)} s  gap ${ms(h.gap)}  gc ${ms(h.gc)}  style+layout ${ms(h.style + h.layout)}  paint ${ms(h.paintOverlay)}/${ms(h.paintOther)}  composite ${ms(h.composite)}  idle ${ms(h.idle)}  | last refresh ${prev ? `${ms(h.a - prev.end)} ms before, ${ms(prev.end - prev.start)} ms, ${[...prev.stages].map(([k, v]) => `${k} ${ms(v)}`).join(",")}` : "none"}  | ${Object.entries(h.top).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, v]) => `${k} ${ms(v)}`).join("; ")}`);
}
