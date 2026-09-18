/**
 * The per-engine smoke checks (§16), run by `scripts/smoke.ts` against whichever build is connected.
 *
 * Either flavour, on either port: both checks are one `probe`, which is a store command, and the Orion premise §16
 * names is specifically about a store install — "smoke run on Orion with the store zip". A dev-only checker could
 * never run the one check that premise asks for.
 *
 * Two premises are checked, both of them [unverified] off Chrome and both cheap to check here:
 *
 * 1. **Relay.** Synchronous cross-world `CustomEvent` dispatch (§9.2). The relay answers `no-handler` when no reply
 *    for the command arrived before `dispatchEvent` returned, so one `probe` that comes back at all is the proof; a
 *    `no-handler` against a tab the hub counts as ready is an engine that dispatches asynchronously, and §9.2's 1 s
 *    timeout is the named fallback for it.
 * 2. **Keepalive.** §2's transport pass bar, the same for every target: a command reaches the tab **within about 1 s
 *    after 5 or more minutes idle**, by whatever the extension does — held socket, keepalive, reconnect. Both
 *    keepalives ship in one build, which is itself unverified on Chrome and Firefox (§8.2, §16).
 *
 * One engine at a time: with more than one counted tab the hub refuses reads as well as acts (§1.6, §7.5), so a run
 * checks the engine that is connected now and the ledger remembers the rest. An engine that was never reached keeps
 * its place in the report, which is what "records a result for any it cannot" means.
 *
 * Nothing here talks to a socket: `CheckDeps` is the hub client's surface, so a test drives all of it on a fake clock.
 */
import type { HubState, TabInfo } from "../protocol/wire.ts";

/**
 * The four engines of §2. An **engine** is the browser running a build; a **target** is the build it runs. They are
 * the same word for three of them and not for Orion, which installs the Chrome or the Firefox build, so an engine
 * cannot be read off the wire and the dev names it. The spec keeps both words for this reason — "the per-engine smoke
 * checks in §16", against a `target` in every frame.
 */
export const ENGINES = ["chrome", "firefox", "safari", "orion"] as const;

/** §2's pass bar: about 1 s, after 5 or more minutes idle. */
export const IDLE_MS = 5 * 60_000;
export const BAR_MS = 1_000;

export type CheckName = "relay" | "keepalive";

export type CheckResult = { check: CheckName; pass: boolean; ms: number | null; note: string };

/** What one run learned about one engine, and everything the report needs to print it. */
export type EngineResult = {
  engine: string;
  target: string;
  flavour: string;
  version: string;
  at: string;
  idleMs: number;
  checks: CheckResult[];
};

/** A run that never got as far as an engine: no hub, no tab, or more than one. */
export type NotReached = { reached: false; why: string };
export type Reached = { reached: true; result: EngineResult };
export type RunOutcome = Reached | NotReached;

/** Every engine's latest result, by engine name. Kept as plain JSON so a run can merge into the last one's file. */
export type Ledger = Record<string, EngineResult>;

/**
 * What one command came to. Narrower than the hub client's own `CommandAnswer` on purpose: everything here runs
 * against a fake, and importing the client would drag `ws` and `child_process` into this module's graph for two
 * fields. The caller adapts in a line.
 */
export type Answer = { ok: true; result?: unknown } | { ok: false; code: string; message: string };

export type CheckDeps = {
  send: (name: string, args: Record<string, unknown>) => Promise<Answer>;
  state: () => Promise<HubState | null>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** The loopback port these checks are running against, so a line about no hub names the one actually dialled. */
  port: number;
  /** Progress, so five minutes of waiting is not five minutes of silence. */
  say?: (line: string) => void;
};

/** `CheckDeps` with the progress line resolved once, so the two checks are not handed it a second time beside `d`. */
type Ctx = CheckDeps & { say: (line: string) => void };

export type CheckOptions = {
  /** What to call the engine in the ledger. Orion runs someone else's build, so it can only be named by the dev. */
  engine?: string;
  idleMs?: number;
  barMs?: number;
  at?: string;
};

export async function runChecks(d: CheckDeps, o: CheckOptions = {}): Promise<RunOutcome> {
  const idleMs = o.idleMs ?? IDLE_MS;
  const barMs = o.barMs ?? BAR_MS;
  const c: Ctx = { ...d, say: d.say ?? (() => {}) };

  const state = await d.state();
  if (state === null) return { reached: false, why: `no hub answered on 127.0.0.1:${d.port}; open pokerogue.net in the browser under test` };

  const ready = state.tabs.filter(t => t.state === "ready");
  if (ready.length === 0) return { reached: false, why: notReady(state.tabs) };
  // The hub refuses a command with more than one counted tab, so the checks cannot run and would not mean an engine.
  if (ready.length > 1) return { reached: false, why: `${ready.length} pokerogue.net tabs are connected; close all but one` };

  const ext = state.extensions.find(e => e.conn === ready[0]!.conn);
  if (ext === undefined) return { reached: false, why: "the counted tab's extension is not in the hub's state" };

  // Either flavour: both checks are `probe`, a store command, and §16's Orion premise is specifically about the store
  // zip — "smoke run on Orion with the store zip" — so refusing a store build would refuse the one run that matters.
  c.say(`checking ${o.engine ?? ext.target} — ${ext.target} ${ext.flavour} ${ext.version} on 127.0.0.1:${d.port}`);
  const checks = [await relay(c), await keepalive(c, idleMs, barMs)];
  return {
    reached: true,
    result: {
      engine: o.engine ?? ext.target,
      target: ext.target,
      flavour: ext.flavour,
      version: ext.version,
      at: o.at ?? new Date(d.now()).toISOString(),
      idleMs,
      checks,
    },
  };
}

/**
 * One `probe` against a tab the hub already counts as ready. What it answers does not matter — an unbooted game is a
 * perfectly good `ready: false` — only that an answer came back at all rather than the relay's `no-handler` (§9.2).
 */
async function relay(d: Ctx): Promise<CheckResult> {
  const t0 = d.now();
  const a = await d.send("probe", {});
  const ms = d.now() - t0;
  if (a.ok) {
    d.say(`  relay: the page answered in ${ms} ms`);
    return { check: "relay", pass: true, ms, note: "the page answered inside the dispatch that delivered the command" };
  }
  if (a.code === "no-handler") {
    d.say("  relay: FAIL — the dispatch returned with no reply");
    return { check: "relay", pass: false, ms, note: "cross-world dispatch is asynchronous on this engine; build §9.2's 1 s timeout for it" };
  }
  d.say(`  relay: inconclusive — ${a.code}`);
  return { check: "relay", pass: false, ms, note: `inconclusive: the hub refused ${a.code} (${a.message})` };
}

/** §2's pass bar, by the only measurement that means anything: leave it alone long enough, then ask for one command. */
async function keepalive(d: Ctx, idleMs: number, barMs: number): Promise<CheckResult> {
  d.say(`  keepalive: idle for ${Math.round(idleMs / 1000)} s, then one command`);
  await d.sleep(idleMs);
  const t0 = d.now();
  const a = await d.send("probe", {});
  const ms = d.now() - t0;
  if (!a.ok) {
    d.say(`  keepalive: FAIL — ${a.code} after ${Math.round(idleMs / 1000)} s idle`);
    return { check: "keepalive", pass: false, ms, note: `the tab was unreachable after the idle: ${a.code} (${a.message})` };
  }
  const pass = ms <= barMs;
  d.say(`  keepalive: ${pass ? "pass" : "FAIL"} — the command reached the tab in ${ms} ms (bar: ${barMs} ms)`);
  return { check: "keepalive", pass, ms, note: `a command reached the tab ${ms} ms after ${Math.round(idleMs / 1000)} s idle` };
}

/** Why no tab counts, in the words the tab states themselves give (§9.3, §9.4). */
function notReady(tabs: readonly TabInfo[]): string {
  if (tabs.length === 0) return "no pokerogue.net tab is connected; open or reload pokerogue.net";
  const wrong = tabs.filter(t => t.state === "wrong-world");
  if (wrong.length > 0) return "the page scripts ran isolated on this engine: `world: \"MAIN\"` is not honoured (§9.4)";
  return `no tab is ready (states: ${tabs.map(t => t.state).join(", ")})`;
}

export function merge(ledger: Ledger, result: EngineResult): Ledger {
  return { ...ledger, [result.engine]: result };
}

/** The ledger as a table, every engine of §2 on it, the ones never reached included. */
export function report(ledger: Ledger): string {
  const rows = ENGINES.map(engine => {
    const r = ledger[engine];
    if (r === undefined) return [engine, "—", "not reached", "not reached", ""];
    const cell = (name: CheckName) => {
      const c = r.checks.find(x => x.check === name);
      if (c === undefined) return "not run";
      return `${c.pass ? "pass" : "FAIL"}${c.ms === null ? "" : ` (${c.ms} ms)`}`;
    };
    return [engine, `${r.target} ${r.version}`, cell("relay"), cell("keepalive"), r.at];
  });
  const head = ["engine", "build", "relay", `keepalive (§2 bar)`, "checked"];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(width[i] ?? 0)).join("  ").trimEnd();
  return [line(head), line(width.map(w => "-".repeat(w))), ...rows.map(line)].join("\n");
}

/** Whether every engine on the ledger passed everything it ran: the run's own exit code. */
export function allPassed(ledger: Ledger): boolean {
  const results = Object.values(ledger);
  return results.length > 0 && results.every(r => r.checks.every(c => c.pass));
}
