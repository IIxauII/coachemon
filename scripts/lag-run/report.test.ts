import assert from "node:assert/strict";
import test from "node:test";
import { compare, dist, parseRun, summarize, type Window } from "./report.ts";

const tick = (seq: number, at: number, ms: number, kind: string | null) => ({ seq, at, ms, kind });
const gap = (at: number, g: number, ticks: number[], driver = 0): { at: number; gap: number; panel: number; driver: number; stage: null; ticks: number[]; kind?: string } =>
  ({ at, gap: g, panel: 0, driver, stage: null, ticks });
const win = (moments: Window["moments"], ticks: ReturnType<typeof tick>[], gaps: ReturnType<typeof gap>[]): Window => ({ moments, stats: { ticks, gaps } });

test("a distribution is nearest-rank p50/p95 and the max, and an empty one is none (#499)", () => {
  assert.deepEqual(dist([5, 1, 3, 2, 4]), { n: 5, p50: 3, p95: 5, max: 5 });
  assert.equal(dist([]), null);
});

test("a run is cut per moment and per card kind; gaps under 50 ms are left out, a driver's are reported apart (#499)", () => {
  const s = summarize([
    win(["shop"], [tick(1, 100, 4, "rewards"), tick(2, 1100, 30, "rewards")], [gap(1090, 120, [2]), gap(2000, 40, []), gap(3000, 90, [], 12)]),
    win([], [tick(3, 4000, 2, "battle")], [gap(4100, 60, [])]),
  ]);
  assert.deepEqual(s.moments.shop, { windows: 1, ticks: { n: 2, p50: 4, p95: 30, max: 30 }, gaps: { n: 1, p50: 120, p95: 120, max: 120 }, driverGaps: { n: 1, p50: 90, p95: 90, max: 90 } });
  assert.equal(s.moments.faint.windows, 0);
  assert.deepEqual(s.kinds.rewards.gaps, { n: 1, p50: 120, p95: 120, max: 120 });
  assert.deepEqual(s.kinds.battle.gaps, { n: 1, p50: 60, p95: 60, max: 60 }, "a gap with no refresh in it goes to the card up before it");
  assert.equal(s.total.ticks!.n, 3);
  assert.equal(s.total.driverGaps!.n, 1);
});

test("a comparison pools three runs a side, and a moment missing on either side is not met (#499)", () => {
  const run = (ms: number, shop: boolean) => [win(shop ? ["shop"] : [], [tick(1, 0, ms, "rewards")], [])];
  const c = compare([run(10, true), run(20, true), run(30, true)], [run(1, true), run(2, false), run(3, true)]);
  assert.equal(c.moments.shop.met, true);
  assert.deepEqual(c.moments.shop.before.ticks, { n: 3, p50: 20, p95: 30, max: 30 });
  assert.deepEqual(c.moments.shop.after.ticks, { n: 2, p50: 1, p95: 3, max: 3 });
  assert.equal(c.moments.faint.met, false);
  assert.equal(c.kinds.rewards.met, true);
});

test("a gap is the driver's only when its commands took more of it than the overlay's refreshes (#515)", () => {
  const s = summarize([win([], [tick(1, 0, 7508, "battle")], [{ ...gap(10, 7660, [1], 38), panel: 7508 }, gap(9000, 90, [], 12)])]);
  assert.deepEqual(s.total.gaps, { n: 1, p50: 7660, p95: 7660, max: 7660 });
  assert.deepEqual(s.total.driverGaps, { n: 1, p50: 90, p95: 90, max: 90 });
});

test("a gap whose refresh a drain handed back in the window before keeps that refresh's card (#515)", () => {
  const s = summarize([
    win([], [tick(1, 0, 7500, "battle")], []),
    win([], [tick(2, 9000, 3, "rewards")], [{ ...gap(1, 7660, [1], 38), panel: 7500, kind: "battle" }]),
  ]);
  assert.equal(s.kinds.battle.gaps!.n, 1);
  assert.equal(s.kinds.rewards.gaps, null);
});

test("a run log reads back its windows, its header and its summary (#499)", () => {
  const log = [
    { kind: "run", team: ["Bulbasaur"], slot: 4, waves: 20 },
    { kind: "call", call: "read_menu" },
    { kind: "window", moments: ["shop"], stats: { ticks: [tick(1, 0, 3, "rewards")], gaps: [] } },
    { kind: "summary", stop: "waves-reached", wallMs: 1_500_000, wave: 21 },
  ].map(x => JSON.stringify(x)).join("\n");
  const r = parseRun(log);
  assert.equal(r.windows.length, 1);
  assert.equal(r.header?.slot, 4);
  assert.equal(r.summary?.stop, "waves-reached");
});
