import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recorder } from "./errors.ts";
import { recordErrors } from "./errors.ts";

/** A page global with its own event target and console, so the recorder never touches the test runner's. */
function page(t: { after: (fn: () => void) => void }) {
  const g = globalThis as unknown as Record<string, unknown>;
  const keys = ["addEventListener", "console", "__coachemonErrors"] as const;
  const prev = Object.fromEntries(keys.map(k => [k, g[k]]));
  const target = new EventTarget();
  const printed: unknown[][] = [];
  g.addEventListener = target.addEventListener.bind(target);
  g.console = { error: (...a: unknown[]) => printed.push(a), warn: (...a: unknown[]) => printed.push(a) };
  delete g.__coachemonErrors;
  t.after(() => Object.assign(g, prev));
  const fire = (type: string, fields: Record<string, unknown>) => target.dispatchEvent(Object.assign(new Event(type), fields));
  return { g, fire, printed, rec: () => g.__coachemonErrors as Recorder };
}

test("the recorder stamps uncaught errors and unhandled rejections, and keeps console errors and warnings", t => {
  const p = page(t);
  recordErrors();
  assert.equal(p.rec().at, null);
  p.fire("error", { message: "TypeError: x is undefined" });
  const afterError = p.rec().at;
  assert.equal(typeof afterError, "number");
  p.fire("unhandledrejection", { reason: new Error("fetch failed") });
  (p.g.console as Console).warn("low", 3);
  assert.deepEqual(p.rec().lines.map(l => [l.level, l.text]), [["exception", "TypeError: x is undefined"], ["rejection", "fetch failed"], ["warning", "low 3"]]);
  assert.deepEqual(p.printed, [["low", 3]], "the console still prints");
});

test("the recorder keeps the last 30 lines, 300 characters each, and installs once", t => {
  const p = page(t);
  recordErrors();
  const first = p.rec();
  recordErrors();
  assert.equal(p.rec(), first);
  for (let i = 0; i < 35; i++) (p.g.console as Console).error(`e${i}`.padEnd(400, "!"));
  assert.equal(p.rec().lines.length, 30);
  assert.equal(p.rec().lines[0].text.slice(0, 3), "e5!");
  assert.equal(p.rec().lines[0].text.length, 300);
  assert.equal(p.printed.length, 35, "installed once: one print per call");
});
