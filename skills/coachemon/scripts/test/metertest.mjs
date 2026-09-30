import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

let clock = 0, frameCb = null, entries = 0, visibility = "visible", onVisibility = null;
const observed = {};
Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: {
  now: () => clock,
  mark() { entries++; }, clearMarks() { entries--; },
  measure() { entries++; }, clearMeasures() { entries--; },
} });
globalThis.PerformanceObserver = class {
  static supportedEntryTypes = ["event", "long-animation-frame", "mark"];
  constructor(cb) { this.cb = cb; }
  observe({ type }) { observed[type] = list => this.cb({ getEntries: () => list }); }
  disconnect() {}
};
globalThis.requestAnimationFrame = cb => { frameCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => { frameCb = null; };
const frame = t => { clock = t; const cb = frameCb; frameCb = null; cb?.(t); };

const mount = () => {
  globalThis.window = globalThis; delete globalThis.__coachHud;
  globalThis.Phaser = { Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => ({ game: { loop: { actualFps: 59.7, raf: { isSetTimeOut: false } } } }) }, loop: { actualFps: 59.7, raf: { isSetTimeOut: false } } } } }] } } } };
  const node = () => ({ style: {}, children: [], addEventListener() {}, remove() {}, append() {}, replaceChildren() {} });
  globalThis.document = {
    documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node,
    get visibilityState() { return visibility; },
    addEventListener: (ev, fn) => { if (ev === "visibilitychange") onVisibility = fn; }, removeEventListener() {},
  };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  eval(bundle("hud", { expose: true }));
  return globalThis.__hud["01-meter"];
};

// ---- a refresh's stages are exclusive, so they sum to its time, and a refresh inside it is the same record
{
  const { refresh, stage, note } = mount();
  __coachMeter.reset();
  refresh("clock", () => {
    stage("read", () => { clock += 5; stage("road", () => { clock += 3; }); });
    refresh("tick", () => { note({ kind: "battle", wave: 12 }); clock += 1; });
  });
  const [t] = __coachMeter.stats().ticks;
  console.log(JSON.stringify({ why: t.why, kind: t.kind, wave: t.wave, ms: t.ms, stages: t.stages }));
  assert.equal(__coachMeter.stats().ticks.length, 1);
  assert.deepEqual(t.stages, { read: 5, road: 3, other: 1 });
}

// ---- a stall is charged with the panel's work since the frame before it, and the frames around a refresh ride on it
{
  const { refresh, stage } = mount();
  __coachMeter.reset();
  frame(1000);
  refresh("clock", () => { stage("road", () => { clock += 110; }); stage("dom", () => { clock += 10; }); });
  frame(1140);
  frame(1156);
  frame(1400);
  const s = __coachMeter.stats();
  console.log(JSON.stringify(s.gaps), JSON.stringify({ frame: s.ticks[0].frame, next: s.ticks[0].next }), JSON.stringify(s.frames), JSON.stringify(s.stalls));
  assert.equal(s.gaps[0].panel, 120);
  assert.equal(s.gaps[0].stage, "road");
  assert.equal(s.gaps[1].panel, 0, "a gap with no refresh in it acquits the panel");
}

// ---- a hub command's work is the driver's, so a gap it falls in is stamped `driver` and carries its share (#499)
{
  const { refresh, stage } = mount();
  __coachMeter.reset();
  frame(2000);
  refresh("clock", () => stage("road", () => { clock += 20; }));
  const back = __coachMeter.driver(() => { clock += 40; return "reply"; });
  frame(2100);
  frame(2116);
  frame(2200);
  const s = __coachMeter.stats();
  console.log(JSON.stringify(s.gaps), JSON.stringify(s.stalls));
  assert.equal(back, "reply");
  assert.equal(s.gaps[0].driver, 40);
  assert.equal(s.gaps[0].panel, 20, "a command is not the panel's work");
  assert.equal(s.gaps[0].stage, "driver");
  assert.equal(s.gaps[1].driver, 0);
  assert.equal(s.ticks.length, 1, "a command is no refresh");
}

// ---- a drain hands back the window so far and opens a fresh one, so a long run loses nothing to the rings (#499)
{
  const { refresh } = mount();
  __coachMeter.reset();
  frame(3000);
  refresh("clock", () => { clock += 60; });
  frame(3100);
  const first = __coachMeter.drain();
  frame(3116);
  const second = __coachMeter.stats();
  console.log(JSON.stringify({ ticks: first.ticks.length, gaps: first.gaps.length, then: { ticks: second.ticks.length, gaps: second.gaps.length, frames: second.frames.n } }));
  assert.equal(first.ticks.length, 1);
  assert.equal(second.ticks.length, 0);
  assert.equal(second.frames.n, 1, "the frame watcher carries on across a drain");
}

// ---- the time a tab spends hidden is not a stall
{
  mount();
  __coachMeter.reset();
  frame(0);
  visibility = "hidden"; onVisibility();
  visibility = "visible";
  frame(60000);
  frame(60016);
  const s = __coachMeter.stats();
  console.log(JSON.stringify({ gaps: s.gaps.length, hidden: s.frames.hidden, frames: s.frames.n }));
  assert.equal(s.gaps.length, 0);
}

// ---- the rings are bounded and every user-timing entry is cleared once made
{
  const { refresh, stage } = mount();
  __coachMeter.reset();
  entries = 0;
  for (let i = 0; i < 500; i++) refresh("clock", () => stage("read", () => { clock += 1; }));
  const s = __coachMeter.stats();
  console.log(JSON.stringify({ ticks: s.ticks.length, entries, refresh: s.refresh }));
  assert.equal(s.ticks.length, 120);
  assert.equal(entries, 0);
}

// ---- engine timings of input and long frames are kept with the panel's share of them
{
  const { refresh } = mount();
  __coachMeter.reset();
  clock = 5000;
  refresh("clock", () => { clock += 80; });
  observed.event([{ startTime: 5010, duration: 200, processingStart: 5090, processingEnd: 5100, name: "keydown" }]);
  observed["long-animation-frame"]([{ startTime: 4990, duration: 150, blockingDuration: 100, renderStart: 5120,
    scripts: [{ duration: 78, sourceURL: "chrome-extension://abc/hud.js", sourceFunctionName: "body", invoker: "TimerHandler:setInterval" }] }]);
  const s = __coachMeter.stats();
  console.log(JSON.stringify(s.events), JSON.stringify(s.loaf));
  assert.equal(s.events[0].panel, 70);
}

// ---- the meter outlives the panel's stop, and the next copy's meter replaces it
{
  mount();
  const first = __coachMeter;
  __coachMeter.reset();
  __coachHud.stop();
  assert.equal(globalThis.__coachHud, undefined);
  frame(9000); frame(9016); frame(9100);
  const s = first.stats();
  console.log(JSON.stringify({ frames: s.frames.n, gaps: s.gaps.length, fps: s.facts.fps, setTimeoutLoop: s.facts.setTimeoutLoop, observes: s.facts.observes }));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, "stats is a plain object");
  mount();
  assert.notEqual(__coachMeter, first);
  frame(9200);
  assert.equal(first.stats().frames.n, s.frames.n, "the replaced meter counts nothing more");
}
