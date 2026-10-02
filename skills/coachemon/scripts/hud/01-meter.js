// The meter outlives `__coachHud.stop()`: its frame watcher keeps running with the panel off, read as
// `window.__coachMeter.stats()`, until the next copy's meter replaces it (#481, #482). Every number is
// `performance.now()` milliseconds.
const RING = { ticks: 120, gaps: 200, events: 100, loaf: 50, decisions: 60 };
const GAP_MS = 34;
const LATE_MS = 250;
const BUCKETS = [20, 34, 50, 100, 250];
const TRACK = { devtools: { dataType: "track-entry", track: "Coach panel" } };

const now = () => performance.now();
const r1 = x => Math.round(x * 10) / 10;
const ring = n => {
  const a = [];
  return { push: x => { a.push(x); if (a.length > n) a.shift(); }, all: () => a.slice() };
};

// A user-timing entry is kept by the page until cleared, so each is cleared as soon as it is made; an inspector
// has recorded it by then.
const mark = name => { try { performance.mark(name); performance.clearMarks(name); } catch {} };
const measure = (name, start, duration) => {
  try { performance.measure(name, { start, duration, detail: TRACK }); performance.clearMeasures(name); } catch {}
};

let started, ticks, gaps, events, loaf, decisions, hist, frames, hidden, maxMs, watch;
// The open decision rides into the next window as well, so a report keeps a decision's last copy by `id`.
let decision = null, decisionSeq = 0;
const reset = () => {
  started = now();
  ticks = ring(RING.ticks); gaps = ring(RING.gaps); events = ring(RING.events); loaf = ring(RING.loaf);
  decisions = ring(RING.decisions);
  if (decision) decisions.push(decision);
  hist = BUCKETS.map(() => 0).concat(0);
  frames = 0; hidden = 0; maxMs = 0; watch = { frames: 0, ms: 0 };
};

let open = null, seq = 0;
const nest = [];
// The overlay's work and the driver's since the last frame: what a gap is charged with. `reset` leaves it alone: a
// drain between a long refresh and the next frame charged that frame's gap to nobody (#515).
const since = { ms: 0, stage: null, top: 0, ticks: [], driver: 0, longest: 0, kind: null, wave: null };
// In place, so a frame with nothing to charge allocates nothing (#541).
const clearSince = () => {
  since.ms = 0; since.stage = null; since.top = 0; since.driver = 0; since.longest = 0; since.kind = null; since.wave = null;
  since.ticks.length = 0;
};
const ended = [];
let awaitingNext = null;
reset();

// A refresh opened inside another is part of it, so a clock tick and the tick it calls are one record.
export const refresh = (why, fn) => {
  if (open) return fn();
  const t0 = now();
  const rec = open = { seq: ++seq, why, at: r1(t0), kind: null, wave: null, mode: null, phase: null, drew: false, ms: 0, stages: {} };
  mark("coach:refresh");
  try { return fn(); } finally {
    open = null;
    const ms = now() - t0;
    let inStages = 0, top = null, topMs = 0;
    for (const [k, v] of Object.entries(rec.stages)) {
      inStages += v;
      if (!top || v > topMs) { top = k; topMs = v; }
      rec.stages[k] = r1(v);
    }
    rec.stages.other = r1(Math.max(0, ms - inStages));
    rec.ms = r1(ms);
    maxMs = Math.max(maxMs, rec.ms);
    ticks.push(rec);
    ended.push(rec);
    since.ms += ms;
    since.ticks.push(rec.seq);
    if (top && rec.stages[top] > since.top) { since.top = rec.stages[top]; since.stage = top; }
    if (ms > since.longest) { since.longest = ms; since.kind = rec.kind; since.wave = rec.wave; }
    if (decision) charge(decision, rec, t0, ms);
    mark("coach:idle");
    measure("coach:refresh", t0, ms);
  }
};

// Exclusive time: a stage run inside another is subtracted from it, so a record's stages sum to its `ms`.
export const stage = (name, fn) => {
  if (!open) return fn();
  const rec = open, t0 = now();
  mark(`coach:${name}`);
  nest.push(0);
  try { return fn(); } finally {
    const d = now() - t0, inner = nest.pop();
    rec.stages[name] = (rec.stages[name] ?? 0) + d - inner;
    if (nest.length) nest[nest.length - 1] += d;
    measure(`coach:${name}`, t0, d);
  }
};

export const note = fields => { if (open) Object.assign(open, fields); };

// A decision (CONTEXT.md), every time relative to `at`. `drawn` is the end of the first refresh that came back with its
// kind of card, and `late` the overlay's ms more than `LATE_MS` in (#519).
export const decisionBegin = (kind, card, wave) => {
  decisionEnd();
  decision = { id: ++decisionSeq, kind, card, wave, at: r1(now()), ready: null, input: null, drawn: null, refreshes: 0, ms: 0, late: 0, end: null };
  decisions.push(decision);
};
export const decisionAt = field => { if (decision && decision[field] === null) decision[field] = r1(now() - decision.at); };
export const decisionEnd = () => {
  if (!decision) return;
  decision.end = r1(now() - decision.at);
  decision = null;
};
const charge = (d, rec, t0, ms) => {
  const end = t0 + ms;
  d.refreshes++;
  d.ms = r1(d.ms + ms);
  d.late = r1(d.late + Math.max(0, end - Math.max(t0, d.at + LATE_MS)));
  if (d.drawn === null && rec.kind === d.card) d.drawn = r1(end - d.at);
  rec.decision = d.id;
};

// A hub command answered in the page: never the panel's work, so it opens no record (#499).
const driver = fn => {
  const t0 = now();
  mark("coach:driver");
  try { return fn(); } finally {
    const d = now() - t0;
    since.driver += d;
    mark("coach:idle");
    measure("coach:driver", t0, d);
  }
};

// The panel's refresh time inside `[from, to]`, from the ticks still in the ring.
const panelIn = (from, to) => {
  let ms = 0;
  for (const t of ticks.all()) ms += Math.max(0, Math.min(to, t.at + t.ms) - Math.max(from, t.at));
  return r1(ms);
};

const bucketOf = gap => {
  let i = 0;
  while (i < BUCKETS.length && gap >= BUCKETS[i]) i++;
  return i;
};
let prev = null, raf = 0, live = true, hook = null;
// Run at the end of every frame callback, so a refresh it opens is charged to the frame after (#518). Its own time
// leaves those refreshes out.
export const onFrame = fn => { hook = fn; };
const runHook = t => {
  const t0 = now(), overlay = since.ms;
  try { hook(t); } catch {}
  watch.frames++;
  watch.ms += now() - t0 - (since.ms - overlay);
};
const frame = t => {
  if (!live) return;
  raf = requestAnimationFrame(frame);
  if (prev !== null) {
    const gap = t - prev;
    frames++;
    hist[bucketOf(gap)]++;
    if (awaitingNext) { awaitingNext.next = r1(gap); awaitingNext = null; }
    for (let i = 0; i < ended.length; i++) ended[i].frame = r1(gap);
    if (ended.length) awaitingNext = ended[ended.length - 1];
    if (gap >= GAP_MS) {
      // `kind` and `wave` are the longest refresh's, which a drain may have handed back in the window before.
      gaps.push({ at: r1(prev), gap: r1(gap), panel: r1(since.ms), driver: r1(since.driver),
        stage: since.driver > since.top ? "driver" : since.stage, ticks: since.ticks, kind: since.kind, wave: since.wave });
      // The gap keeps the array, and `clearSince` empties it in place.
      since.ticks = [];
    }
  }
  clearSince();
  ended.length = 0;
  prev = t;
  if (hook) runHook(t);
};
// A hidden tab gets no frames, so the gap across it is the time away, not a stall.
const onVisibility = () => { if (document.visibilityState === "hidden") { prev = null; hidden++; } };

const observe = (type, opts, keep) => {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return null;
    const o = new PerformanceObserver(list => { for (const e of list.getEntries()) keep(e); });
    o.observe({ type, ...opts });
    return o;
  } catch { return null; }
};
const observers = {
  event: observe("event", { durationThreshold: 16 }, e => events.push({
    at: r1(e.startTime), name: e.name, ms: r1(e.duration), delay: r1(e.processingStart - e.startTime),
    run: r1(e.processingEnd - e.processingStart), panel: panelIn(e.startTime, e.startTime + e.duration),
  })),
  loaf: observe("long-animation-frame", {}, e => loaf.push({
    at: r1(e.startTime), ms: r1(e.duration), blocking: r1(e.blockingDuration ?? 0),
    render: e.renderStart ? r1(e.startTime + e.duration - e.renderStart) : null,
    panel: panelIn(e.startTime, e.startTime + e.duration),
    scripts: [...(e.scripts ?? [])].sort((a, b) => b.duration - a.duration).slice(0, 3).map(s => ({
      ms: r1(s.duration), src: String(s.sourceURL ?? "").split("/").pop() || null, fn: s.sourceFunctionName || null, invoker: s.invoker || null,
    })),
  })),
};

let facts = () => ({});
export const meterFacts = fn => { facts = fn; };

const summary = list => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return { n: list.length, mean: r1(list.reduce((a, b) => a + b, 0) / list.length), p95: sorted[Math.floor(0.95 * (sorted.length - 1))], max: sorted[sorted.length - 1] };
};

export const meterStats = () => {
  const all = ticks.all(), g = gaps.all();
  const names = [...new Set(all.flatMap(t => Object.keys(t.stages)))];
  let extra = {};
  try { extra = facts() ?? {}; } catch {}
  return {
    since: r1(started), now: r1(now()),
    facts: {
      ua: navigator.userAgent, crossOriginIsolated: globalThis.crossOriginIsolated ?? null,
      visibility: globalThis.document?.visibilityState ?? null, watching: live && !!raf, gapMs: GAP_MS,
      observes: Object.keys(observers).filter(k => observers[k]), ...extra,
    },
    lastTickMs: all.length ? all[all.length - 1].ms : 0, maxTickMs: maxMs,
    frames: { n: frames, hidden, under: Object.fromEntries(BUCKETS.map((b, i) => [b, hist[i]]).concat([["more", hist[BUCKETS.length]]])) },
    refresh: summary(all.map(t => t.ms)),
    stages: Object.fromEntries(names.map(k => [k, summary(all.filter(t => k in t.stages).map(t => t.stages[k]))])),
    stalls: { n: g.length, ms: r1(g.reduce((a, x) => a + x.gap, 0)), panel: r1(g.reduce((a, x) => a + x.panel, 0)), driver: r1(g.reduce((a, x) => a + x.driver, 0)) },
    watch: { frames: watch.frames, ms: r1(watch.ms) },
    ticks: all, gaps: g, events: events.all(), loaf: loaf.all(), decisions: decisions.all(),
  };
};

const stop = () => {
  live = false;
  try { cancelAnimationFrame(raf); } catch {}
  for (const o of Object.values(observers)) o?.disconnect();
  document.removeEventListener?.("visibilitychange", onVisibility);
  if (window.__coachMeter === meter) delete window.__coachMeter;
};
const drain = () => { const s = meterStats(); reset(); return s; };
const meter = { stats: meterStats, reset, drain, driver, stop };
window.__coachMeter?.stop?.();
window.__coachMeter = meter;
if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
document.addEventListener?.("visibilitychange", onVisibility);
