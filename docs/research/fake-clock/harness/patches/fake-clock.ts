// The fake clock (findings.md §2), spliced into the worker's harness at its vitest import (mode.ts).
// FAKE_CLOCK_IMPL=vitest drives vitest's own fake timers instead of the hand-rolled clock; FAKE_VITEST_RAW=1 with it
// leaves vitest's delays uncoerced. COACH_FAKE_REPORT=<file> gets {fake: true, impl} once installed, or {slow: why}
// with nothing installed. FAKE_STATS_OUT=<file> keeps <file>.<pid> up to date with the driver's counts.
import { writeFileSync as writeFakeReport } from "node:fs";

const fakeImpl = process.env.FAKE_CLOCK_IMPL ?? "hand";
const real = {
  setTimeout: globalThis.setTimeout,
  setInterval: globalThis.setInterval,
  clearTimeout: globalThis.clearTimeout,
  clearInterval: globalThis.clearInterval,
  setImmediate: globalThis.setImmediate,
};
const TIMEOUT_MAX = 2 ** 31 - 1;
/** As Node: a delay outside [1, 2^31 − 1], or not a number, is 1 ms. */
const coerce = (delay: unknown) => {
  const d = Number(delay);
  return d >= 1 && d <= TIMEOUT_MAX ? d : 1;
};

type FakeTimer = { id: number; fn: (...a: unknown[]) => void; args: unknown[]; delay: number; due: number; period: number | null; seq: number; ref: boolean };

/** One clock: `next()` fires the first due timer and says whether there was one. */
type Clock = { now(): number; first(): number | null; next(): boolean; count(): number };

function handClock(): Clock {
  let now = 0;
  let seq = 0;
  let ids = 0;
  const timers = new Map<number, FakeTimer>();
  class Timeout {
    readonly id: number;
    constructor(id: number) {
      this.id = id;
    }
    ref() {
      const t = timers.get(this.id);
      if (t) t.ref = true;
      return this;
    }
    unref() {
      const t = timers.get(this.id);
      if (t) t.ref = false;
      return this;
    }
    hasRef() {
      return timers.get(this.id)?.ref ?? false;
    }
    refresh() {
      const t = timers.get(this.id);
      if (t) {
        t.due = now + t.delay;
        t.seq = ++seq;
      }
      return this;
    }
    close() {
      timers.delete(this.id);
      return this;
    }
    [Symbol.toPrimitive]() {
      return this.id;
    }
  }
  const add = (fn: any, delay: unknown, args: unknown[], repeat: boolean) => {
    if (typeof fn !== "function") throw new TypeError("The \"callback\" argument must be of type function");
    const id = ++ids;
    const d = coerce(delay);
    const handle = new Timeout(id);
    timers.set(id, { id, fn, args, delay: d, due: now + d, period: repeat ? d : null, seq: ++seq, ref: true });
    return handle;
  };
  const clear = (h: unknown) => {
    if (h instanceof Timeout) timers.delete(h.id);
    else if (typeof h === "number" && timers.has(h)) timers.delete(h);
    else if (h != null) real.clearTimeout(h as any);
  };
  globalThis.setTimeout = ((fn: any, delay?: unknown, ...args: unknown[]) => add(fn, delay, args, false)) as any;
  globalThis.setInterval = ((fn: any, delay?: unknown, ...args: unknown[]) => add(fn, delay, args, true)) as any;
  globalThis.clearTimeout = clear as any;
  globalThis.clearInterval = clear as any;
  const firstTimer = () => {
    let best: FakeTimer | null = null;
    for (const t of timers.values()) if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
    return best;
  };
  return {
    now: () => now,
    first: () => firstTimer()?.due ?? null,
    count: () => timers.size,
    next() {
      const t = firstTimer();
      if (!t) return false;
      now = Math.max(now, t.due);
      if (t.period === null) timers.delete(t.id);
      try {
        t.fn(...t.args);
      } finally {
        // Node puts an interval back after its callback, as the last of the timers due with it.
        if (t.period !== null && timers.get(t.id) === t) {
          t.due = now + t.period;
          t.seq = ++seq;
        }
      }
      return true;
    },
  };
}

function vitestClock(): Clock {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  const sinon = (globalThis.setTimeout as any).clock;
  if (!sinon || typeof sinon.next !== "function") throw new Error("vitest's fake timers carry no clock to drive");
  const fakeSet = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval };
  // Uncoerced, `setInterval(fn)` never fires again after its first and `setInterval(fn, 0)` fires forever without the
  // clock moving (findings.md §2).
  if (process.env.FAKE_VITEST_RAW !== "1") {
    globalThis.setTimeout = ((fn: any, delay?: unknown, ...args: unknown[]) => fakeSet.setTimeout(fn, coerce(delay), ...args)) as any;
    globalThis.setInterval = ((fn: any, delay?: unknown, ...args: unknown[]) => fakeSet.setInterval(fn, coerce(delay), ...args)) as any;
  }
  const first = () => {
    let best: any = null;
    for (const t of Object.values(sinon.timers ?? {}) as any[]) if (!best || t.callAt < best.callAt) best = t;
    return best?.callAt ?? null;
  };
  return {
    now: () => sinon.now,
    first,
    count: () => sinon.countTimers(),
    next() {
      if (sinon.countTimers() === 0) return false;
      sinon.next();
      return true;
    },
  };
}

let fastWaits = 0;
let clock: Clock;
const idle = () => new Promise<void>(resolve => real.setImmediate(resolve));
const realMs = () => new Promise<void>(resolve => real.setTimeout(resolve, 1).unref());
const fakeClockStats = { fired: 0, fastFired: 0, realSteps: 0 };

async function drive() {
  let base = performance.now() - clock.now();
  for (;;) {
    await idle();
    const due = clock.first();
    if (due === null) {
      await realMs();
      continue;
    }
    if (fastWaits === 0 && due > performance.now() - base) {
      fakeClockStats.realSteps++;
      await realMs();
      continue;
    }
    try {
      if (clock.next()) {
        fakeClockStats.fired++;
        if (fastWaits > 0) fakeClockStats.fastFired++;
      }
    } catch (e) {
      real.setImmediate(() => {
        throw e;
      });
    }
    if (fastWaits > 0) base = performance.now() - clock.now();
  }
}

/** vitest's `waitUntil` (vitest/dist/chunks/test.*.js), on the fake clock, with the driver running fast while it waits. */
function fakeWaitUntil<T>(callback: () => T | Promise<T>, options: number | { interval?: number; timeout?: number } = {}): Promise<T> {
  const { interval = 50, timeout = 1e3 } = typeof options === "number" ? { timeout: options } : options;
  fastWaits++;
  let settled = false;
  const settle = () => {
    if (settled) return false;
    settled = true;
    fastWaits--;
    return true;
  };
  return new Promise<T>((resolve, reject) => {
    let promiseStatus = "idle";
    let timeoutId: any;
    let intervalId: any;
    const onReject = (error?: unknown) => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (settle()) reject(error ?? new Error("Timed out in waitUntil!"));
    };
    const onResolve = (result: T) => {
      if (!result) return;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      if (settle()) resolve(result);
      return true;
    };
    const checkCallback = () => {
      if (promiseStatus === "pending") return;
      try {
        const result = callback();
        if (result !== null && typeof result === "object" && typeof (result as any).then === "function") {
          promiseStatus = "pending";
          (result as Promise<T>).then(
            value => {
              promiseStatus = "resolved";
              onResolve(value);
            },
            error => {
              promiseStatus = "rejected";
              onReject(error);
            },
          );
        } else return onResolve(result as T);
      } catch (error) {
        onReject(error);
      }
    };
    if (checkCallback() === true) return;
    timeoutId = setTimeout(onReject, timeout);
    intervalId = setInterval(checkCallback, interval);
  });
}

let fakeReport: { fake: true; impl: string } | { slow: string };
try {
  clock = fakeImpl === "vitest" ? vitestClock() : handClock();
  (vi as any).waitUntil = fakeWaitUntil;
  void drive();
  fakeReport = { fake: true, impl: fakeImpl };
} catch (e) {
  if (fakeImpl === "vitest") vi.useRealTimers();
  Object.assign(globalThis, { setTimeout: real.setTimeout, setInterval: real.setInterval, clearTimeout: real.clearTimeout, clearInterval: real.clearInterval });
  fakeReport = { slow: `the fake clock failed: ${e instanceof Error ? e.message : String(e)}` };
}
if (process.env.COACH_FAKE_REPORT) writeFakeReport(process.env.COACH_FAKE_REPORT, JSON.stringify(fakeReport));
// A worker is often stopped with no exit event, so the counts are written every real second.
if (process.env.FAKE_STATS_OUT && "fake" in fakeReport) {
  const statsOut = `${process.env.FAKE_STATS_OUT}.${process.pid}`;
  const writeStats = () =>
    writeFakeReport(statsOut, JSON.stringify({ ...fakeClockStats, fakeMs: clock.now(), timers: clock.count(), date: new Date().toISOString(), uptimeMs: Math.round(performance.now()) }));
  real.setInterval(writeStats, 1000).unref();
  process.on("exit", writeStats);
}
