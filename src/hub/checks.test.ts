/**
 * The per-engine smoke checks (§16) on a fake clock: the five-minute idle is a number the test hands over, not a wait.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BAR_MS, IDLE_MS, allPassed, merge, report, runChecks, type Answer, type CheckDeps, type EngineResult, type Ledger } from "./checks.ts";
import type { ExtensionInfo, HubState, TabInfo } from "../protocol/wire.ts";

const COMMANDS = ["probe", "menu"];

function ext(o: Partial<ExtensionInfo> = {}): ExtensionInfo {
  return { conn: 1, target: "chrome", version: "1.2.0", flavour: "dev", protocol: 1, consent: true, commands: COMMANDS, ...o };
}

function tab(o: Partial<TabInfo> = {}): TabInfo {
  return { conn: 1, tab: 5, target: "chrome", title: "PokéRogue", state: "ready", ...o };
}

/** A hub whose state is fixed and whose commands answer from a queue, on a clock the test advances by answering. */
function deps(o: { state?: HubState | null; answers?: Answer[]; cost?: number[] } = {}): CheckDeps & { asked: string[]; slept: number[] } {
  const asked: string[] = [];
  const slept: number[] = [];
  let now = 1_000;
  const answers = [...(o.answers ?? [])];
  const cost = [...(o.cost ?? [])];
  return {
    asked,
    slept,
    port: 47148,
    now: () => now,
    sleep: async ms => void (slept.push(ms), (now += ms)),
    state: async () =>
      o.state === undefined ? { t: "state", extensions: [ext()], tabs: [tab()], driver: null } : o.state,
    send: async name => {
      asked.push(name);
      now += cost.shift() ?? 5;
      return answers.shift() ?? { ok: true, result: { ready: true } };
    },
  };
}

const at = "2026-09-18T00:00:00.000Z";

const result = async (d: CheckDeps, o = {}): Promise<EngineResult> => {
  const run = await runChecks(d, { at, ...o });
  assert.ok(run.reached, run.reached ? "" : run.why);
  return run.result;
};

// --------------------------------------------------------------- reaching

test("no hub is recorded, not thrown, and names the port actually dialled", async () => {
  const run = await runChecks(deps({ state: null }), { at });
  assert.equal(run.reached, false);
  assert.match(run.reached ? "" : run.why, /no hub answered on 127\.0\.0\.1:47148/);
});

test("no ready tab says so, and a wrong-world tab says which premise failed (§9.4)", async () => {
  const none = await runChecks(deps({ state: { t: "state", extensions: [ext()], tabs: [], driver: null } }), { at });
  assert.match(none.reached ? "" : none.why, /no pokerogue\.net tab is connected/);
  const isolated = await runChecks(deps({ state: { t: "state", extensions: [ext()], tabs: [tab({ state: "wrong-world" })], driver: null } }), { at });
  assert.match(isolated.reached ? "" : isolated.why, /ran isolated/);
});

test("more than one tab is not an engine result: the hub refuses every command (§7.5)", async () => {
  const state: HubState = { t: "state", extensions: [ext()], tabs: [tab(), tab({ tab: 6 })], driver: null };
  const run = await runChecks(deps({ state }), { at });
  assert.match(run.reached ? "" : run.why, /2 pokerogue\.net tabs/);
});

test("a store build is checked too: §16's Orion premise is about the store zip", async () => {
  const state: HubState = { t: "state", extensions: [ext({ flavour: "store" })], tabs: [tab()], driver: null };
  const r = await result(deps({ state }), { engine: "orion" });
  assert.equal(r.flavour, "store");
  assert.equal(r.checks.every(c => c.pass), true);
});

// ------------------------------------------------------------ the checks

test("one probe that comes back at all is the relay premise (§9.2)", async () => {
  const d = deps();
  const r = await result(d);
  assert.deepEqual(d.asked, ["probe", "probe"]);
  assert.equal(r.checks[0]?.check, "relay");
  assert.equal(r.checks[0]?.pass, true);
});

test("`no-handler` from a ready tab is an engine that dispatches asynchronously (§9.2)", async () => {
  const d = deps({ answers: [{ ok: false, code: "no-handler", message: "no page handler answered probe" }] });
  const r = await result(d);
  assert.equal(r.checks[0]?.pass, false);
  assert.match(r.checks[0]?.note ?? "", /asynchronous/);
});

test("another refusal is inconclusive, and says which one it was", async () => {
  const d = deps({ answers: [{ ok: false, code: "timeout", message: "probe got no answer" }] });
  const r = await result(d);
  assert.equal(r.checks[0]?.pass, false);
  assert.match(r.checks[0]?.note ?? "", /inconclusive: the hub refused timeout/);
});

test("the keepalive check idles 5 minutes, then holds the command to the 1 s bar (§2)", async () => {
  const d = deps({ cost: [5, 300] });
  const r = await result(d);
  assert.deepEqual(d.slept, [IDLE_MS]);
  assert.deepEqual(r.checks[1], {
    check: "keepalive",
    pass: true,
    ms: 300,
    note: "a command reached the tab 300 ms after 300 s idle",
  });
});

test("a command slower than the bar fails the check rather than rounding to it (§2)", async () => {
  const r = await result(deps({ cost: [5, BAR_MS + 1] }));
  assert.equal(r.checks[1]?.pass, false);
});

test("a tab unreachable after the idle is the keepalive failing, and says what it refused with", async () => {
  const d = deps({ answers: [{ ok: true }, { ok: false, code: "no-tab", message: "No pokerogue.net tab is connected." }] });
  const r = await result(d);
  assert.equal(r.checks[1]?.pass, false);
  assert.match(r.checks[1]?.note ?? "", /unreachable after the idle: no-tab/);
});

test("the idle is the dev's to shorten, and the result records what it actually was", async () => {
  const d = deps();
  const r = await result(d, { idleMs: 30_000 });
  assert.deepEqual(d.slept, [30_000]);
  assert.equal(r.idleMs, 30_000);
});

test("Orion runs someone else's build, so the engine is named and the build recorded as it stands (§2)", async () => {
  const r = await result(deps(), { engine: "orion" });
  assert.equal(r.engine, "orion");
  assert.equal(r.target, "chrome");
});

// --------------------------------------------------------- the ledger

const passed = (engine: string, pass = true): EngineResult => ({
  engine,
  target: "chrome",
  flavour: "dev",
  version: "1.2.0",
  at,
  idleMs: IDLE_MS,
  checks: [
    { check: "relay", pass, ms: 4, note: "" },
    { check: "keepalive", pass, ms: 120, note: "" },
  ],
});

test("a later run replaces that engine's result and leaves the others alone", () => {
  const ledger = merge(merge({}, passed("chrome")), passed("firefox"));
  const again = merge(ledger, { ...passed("chrome"), version: "1.3.0" });
  assert.equal(again.chrome?.version, "1.3.0");
  assert.equal(again.firefox?.version, "1.2.0");
});

test("the report keeps a line for every engine of §2, reached or not", () => {
  const text = report(merge({}, passed("chrome")));
  assert.match(text, /^chrome .*pass/m);
  for (const engine of ["firefox", "safari", "orion"]) {
    assert.match(text, new RegExp(`^${engine}\\s+—\\s+not reached\\s+not reached`, "m"));
  }
});

test("one failing check fails the run; an empty ledger is not a pass", () => {
  assert.equal(allPassed({}), false);
  assert.equal(allPassed(merge({}, passed("chrome"))), true);
  const mixed: Ledger = merge(merge({}, passed("chrome")), passed("firefox", false));
  assert.equal(allPassed(mixed), false);
});
