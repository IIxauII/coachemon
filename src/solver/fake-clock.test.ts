import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const TEMPLATE = readFileSync(new URL("./fake-clock.ts.template", import.meta.url), "utf8");
/** The template's copy of vitest's `waitUntil`, which the stub `vi` carries unless a test swaps it. */
const VITEST_WAIT_UNTIL = /const UPSTREAM_WAIT_UNTIL = `([\s\S]*?)`;/.exec(TEMPLATE)?.[1].replace(/\\(.)/g, "$1");

/** The game's sources the fake clock checks, as they stand at the pin; a test swaps one to see the clock stand down. */
const STUBS = {
  vitest: `export const vi = { waitUntil: ${VITEST_WAIT_UNTIL} };`,
  interceptor: `import { vi } from "vitest";
export class PhaseInterceptor {
  async to(target) { await vi.waitUntil(async () => true, { interval: 0, timeout: 20000 }); }
  async run(phase) { await vi.waitUntil(() => this.state !== "running", { interval: 50, timeout: 20000 }); }
}`,
  mockClock: `export class MockClock {
  constructor(scene) { setInterval(() => { this.preUpdate(); this.update(); }, 1); }
}`,
  promptHandler: `export class PromptHandler {
  constructor(game) { PromptHandler.runInterval = setInterval(() => this.doPromptCheck()); }
}`,
};

const HOOKS = `import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const stubs = {
  vitest: "vitest.mjs",
  "#test/framework/phase-interceptor": "interceptor.mjs",
  "#test/mocks/mock-clock": "mock-clock.mjs",
  "#test/helpers/prompt-handler": "prompt-handler.mjs",
};
registerHooks({
  resolve(specifier, context, next) {
    const stub = stubs[specifier];
    return stub ? { url: pathToFileURL(new URL(stub, import.meta.url).pathname).href, shortCircuit: true } : next(specifier, context);
  },
});`;

type Run = { out: any; report: unknown };

/**
 * Runs `body` in a Node process of its own, after the fake clock has loaded against `stubs`: the clock fakes the
 * process's timers, so it must not be the test runner's. `body` hands its result to `emit`.
 */
async function withClock(body: string, stubs: Partial<typeof STUBS> = {}, env: Record<string, string> = {}): Promise<Run> {
  const dir = mkdtempSync(path.join(tmpdir(), "coach-fake-clock-"));
  try {
    const all = { ...STUBS, ...stubs };
    writeFileSync(path.join(dir, "fake-clock.ts"), TEMPLATE);
    writeFileSync(path.join(dir, "vitest.mjs"), `${all.vitest}\nexport const original = vi.waitUntil;`);
    writeFileSync(path.join(dir, "interceptor.mjs"), all.interceptor);
    writeFileSync(path.join(dir, "mock-clock.mjs"), all.mockClock);
    writeFileSync(path.join(dir, "prompt-handler.mjs"), all.promptHandler);
    writeFileSync(path.join(dir, "hooks.mjs"), HOOKS);
    writeFileSync(
      path.join(dir, "scenario.mjs"),
      `import "./fake-clock.ts";
import { vi } from "vitest";
const emit = value => { console.log(JSON.stringify(value)); process.exit(0); };
${body}`,
    );
    const report = path.join(dir, "report.json");
    const { stdout } = await promisify(execFile)(process.execPath, ["--import", "./hooks.mjs", "scenario.mjs"], {
      cwd: dir,
      env: { ...process.env, COACH_CLOCK_OUT: report, ...env },
      timeout: 20_000,
    });
    let written: unknown = null;
    try {
      written = JSON.parse(readFileSync(report, "utf8"));
    } catch {}
    return { out: JSON.parse(stdout), report: written };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("while a vi.waitUntil is pending, the fake clock fires a timer 10 s off within a real second (#782)", async () => {
  const { out, report } = await withClock(`
const start = performance.now();
let fired = false;
setTimeout(() => (fired = true), 10_000);
await vi.waitUntil(() => fired, { interval: 1, timeout: 5_000 });
emit({ realMs: performance.now() - start });
`);

  assert.deepEqual(report, { fake: true });
  assert.ok(out.realMs < 1_000, `took ${out.realMs} real ms`);
});

test("timers of one duration fire as Node fires them: first due, then first scheduled, an interval back in line after its callback (#782)", async () => {
  const { out } = await withClock(`
const fired = [];
const a = setInterval(() => fired.push("a"));
setInterval(() => fired.push("b"), 0);
setTimeout(() => fired.push("c"), 1);
setTimeout(() => fired.push("d"), -5);
setInterval(() => fired.push("e"), 1, "unused");
await vi.waitUntil(() => fired.length >= 11, { interval: 1, timeout: 5_000 });
clearInterval(a);
const after = fired.length;
await vi.waitUntil(() => fired.length >= after + 4, { interval: 1, timeout: 5_000 });
emit(fired.slice(0, after + 4));
`);

  assert.deepEqual(out, ["a", "b", "c", "d", "e", "a", "b", "e", "a", "b", "e", "b", "e", "b", "e"]);
});

test("a worker on the fake clock reads the real date while its clock runs ahead (#782)", async () => {
  const { out } = await withClock(`
const date = new Date();
let fired = false;
setTimeout(() => (fired = true), 5_000);
await vi.waitUntil(() => fired, { interval: 1, timeout: 5_000 });
emit({ dateMoved: new Date().getTime() - date.getTime() });
`);

  assert.ok(out.dateMoved < 1_000, `the date moved ${out.dateMoved} ms`);
});

test("the fake vi.waitUntil times out in real time, while its polling runs on the fake clock (#782)", async () => {
  const { out } = await withClock(`
let ticks = 0;
setInterval(() => ticks++, 1);
const start = performance.now();
const error = await vi.waitUntil(() => false, { interval: 1, timeout: 300 }).catch(e => e.message);
emit({ error, realMs: performance.now() - start, ticks });
`);

  assert.equal(out.error, "Timed out in waitUntil!");
  assert.ok(out.realMs >= 290, `timed out after ${out.realMs} real ms`);
  assert.ok(out.ticks > 300, `only ${out.ticks} fake ms passed`);
});

test("with no vi.waitUntil pending, the fake clock follows real time (#782)", async () => {
  const { out } = await withClock(`
const start = performance.now();
setTimeout(() => emit({ realMs: performance.now() - start }), 200);
`);

  assert.ok(out.realMs >= 190, `fired after ${out.realMs} real ms`);
});

test("a cleared timer stays cleared, refreshed or not, as in Node (#782)", async () => {
  const { out } = await withClock(`
const fired = [];
const cleared = setTimeout(() => fired.push("cleared"), 1);
clearTimeout(cleared);
cleared.refresh();
setTimeout(() => fired.push("kept"), 2);
await vi.waitUntil(() => fired.length > 0, { interval: 1, timeout: 5_000 });
await vi.waitUntil(() => true, { interval: 1, timeout: 5_000 });
emit(fired);
`);

  assert.deepEqual(out, ["kept"]);
});

const GLOBAL_TIMERS = `import { setTimeout as nodeTimeout } from "node:timers";
const { original } = await import("vitest");
emit({ timersReal: setTimeout === nodeTimeout, waitUntilKept: vi.waitUntil === original });`;

for (const [what, stubs, why] of [
  [
    "a vi.waitUntil unlike vitest's",
    { vitest: "export const vi = { waitUntil: async function waitUntil(callback) { return callback(); } };" },
    "vi.waitUntil is not the one the fake clock copies",
  ],
  [
    "a PhaseInterceptor.to that waits some other way",
    { interceptor: STUBS.interceptor.replace("async to(target) { await vi.waitUntil", "async to(target) { await this.until") },
    "PhaseInterceptor.to no longer waits through vi.waitUntil",
  ],
  [
    "a PhaseInterceptor whose run can't be read",
    { interceptor: STUBS.interceptor.replace("async run(phase) {", 'get run() { throw new Error("no run here"); }\n  async ran(phase) {') },
    "the fake clock failed: no run here",
  ],
  [
    "a MockClock that ticks on an imported setInterval",
    { mockClock: `import * as timers from "node:timers";\n${STUBS.mockClock.replace("setInterval(", "timers.setInterval(")}` },
    "MockClock no longer ticks on the global setInterval",
  ],
  [
    "a PromptHandler that no longer checks on an interval",
    { promptHandler: STUBS.promptHandler.replace("setInterval(() => this.doPromptCheck())", "queueMicrotask(() => this.doPromptCheck())") },
    "PromptHandler no longer checks its prompts on the global setInterval",
  ],
] as const) {
  test(`facing ${what}, the fake clock installs nothing and says why (#782)`, async () => {
    const { out, report } = await withClock(GLOBAL_TIMERS, stubs);

    assert.deepEqual(report, { real: why });
    assert.deepEqual(out, { timersReal: true, waitUntilKept: true });
  });
}

test("a fake clock that can't write its report takes itself back out (#782)", async () => {
  const { out } = await withClock(GLOBAL_TIMERS, {}, { COACH_CLOCK_OUT: "/nonexistent/coach-clock.json" });

  assert.deepEqual(out, { timersReal: true, waitUntilKept: true });
});
