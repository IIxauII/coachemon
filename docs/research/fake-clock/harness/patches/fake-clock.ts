// The fake clock, spliced into the worker's harness at its vitest import (mode.ts). Every `setTimeout` and
// `setInterval` made after this module runs goes on one fake clock: the scene's MockClock tick
// (test/mocks/mock-clock.ts), the prompt handler's check (test/helpers/prompt-handler.ts), the harness's learn and
// game-over watches, and the intervals `vi.waitUntil` polls with, which this swaps for a copy on the fake clock.
//
// While anything waits in `vi.waitUntil` (every wait of the phase interceptor), the driver fires the next due timer as
// soon as the process is idle: after a real `setImmediate`, which runs only once the microtask queue is empty. One
// timer per turn of the event loop, in Node's order: by due time, then by when it was last scheduled. With nothing
// waiting, the clock follows real time, 1 ms per real ms, as the real timers would.
//
// Not faked: `Date` and `performance` (the game reads the real date: src/timed-event-manager.ts, save timestamps),
// `setImmediate`, `queueMicrotask` and `process.nextTick` (the driver needs the real ones to know the process is idle).
//
// FAKE_CLOCK_IMPL=vitest uses vitest's own fake timers (`vi.useFakeTimers`) for the same timers, with delays coerced as
// Node coerces them, driven by the same loop through the installed clock's `next()`.
// COACH_FAKE_REPORT=<file> gets {fake: true} once installed, or {slow: why}.
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

type Fake = { id: number; fn: (...a: unknown[]) => void; args: unknown[]; due: number; every: number | null; seq: number; ref: boolean; handle: object };

/** One clock: `next()` fires the first due timer and says whether there was one. */
type Clock = { now(): number; first(): number | null; next(): boolean; count(): number };

function handClock(): Clock {
  let now = 0;
  let seq = 0;
  let ids = 0;
  const timers = new Map<number, Fake>();
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
        t.due = now + (t.every ?? coerce(t.due - now));
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
    timers.set(id, { id, fn, args, due: now + d, every: repeat ? d : null, seq: ++seq, ref: true, handle });
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
    let best: Fake | null = null;
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
      if (t.every === null) timers.delete(t.id);
      try {
        t.fn(...t.args);
      } finally {
        // Node puts an interval back after its callback, as the last of the timers due with it.
        if (t.every !== null && timers.get(t.id) === t) {
          t.due = now + t.every;
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
  // vitest's fake timers take `setInterval(fn)` as an interval of NaN and `setInterval(fn, 0)` as one of 0 ms: the
  // first never fires again, the second fires forever without the clock moving. Node makes both 1 ms.
  // FAKE_VITEST_RAW=1 leaves them as vitest has them, to show what that does.
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
const clock = fakeImpl === "vitest" ? vitestClock() : handClock();
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
      // Nobody waits on the clock: let real time catch up to the next timer, as the real one would.
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
    // Real time keeps its lead over the fake clock from here, not from boot.
    if (fastWaits > 0) base = performance.now() - clock.now();
  }
}

/** vitest's `waitUntil` (vitest/dist/chunks/test.*.js), on the fake clock, with the driver running fast while it waits. */
function fakeWaitUntil<T>(callback: () => T | Promise<T>, options: number | { interval?: number; timeout?: number } = {}): Promise<T> {
  const { interval = 50, timeout = 1e3 } = typeof options === "number" ? { timeout: options } : options;
  const poll = process.env.FAKE_POLL_MS && interval === 50 ? Number(process.env.FAKE_POLL_MS) : interval;
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
    intervalId = setInterval(checkCallback, poll);
  });
}

let fakeReport: { fake: true; impl: string } | { slow: string };
try {
  (vi as any).waitUntil = fakeWaitUntil;
  void drive();
  fakeReport = { fake: true, impl: fakeImpl };
} catch (e) {
  Object.assign(globalThis, { setTimeout: real.setTimeout, setInterval: real.setInterval, clearTimeout: real.clearTimeout, clearInterval: real.clearInterval });
  fakeReport = { slow: `the fake clock failed: ${e instanceof Error ? e.message : String(e)}` };
}
if (process.env.COACH_FAKE_REPORT) writeFakeReport(process.env.COACH_FAKE_REPORT, JSON.stringify(fakeReport));
(globalThis as any).__fakeClock = { clock, stats: fakeClockStats, waits: () => fastWaits };
// FAKE_STATS_OUT=<file>: each worker keeps <file>.<pid> up to date, every real second, with how many timers the driver
// fired (in all, and while something waited) and how far the fake clock went. A worker is often stopped with no exit event.
if (process.env.FAKE_STATS_OUT) {
  const statsOut = `${process.env.FAKE_STATS_OUT}.${process.pid}`;
  const writeStats = () =>
    writeFakeReport(statsOut, JSON.stringify({ ...fakeClockStats, fakeMs: clock.now(), timers: clock.count(), date: new Date().toISOString(), uptimeMs: Math.round(performance.now()) }));
  real.setInterval(writeStats, 1000).unref();
  process.on("exit", writeStats);
}
