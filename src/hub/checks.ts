/**
 * The per-engine smoke checks (extension-distribution.md §16). Nothing here opens a socket or reads the clock: it all
 * goes through `CheckDeps`.
 */
import type { HubState, TabInfo } from "../protocol/wire.ts";

/** extension-distribution.md §2 */
export const ENGINES = ["chrome", "firefox", "safari", "orion"] as const;

/** The transport pass bar (extension-distribution.md §2). */
export const IDLE_MS = 5 * 60_000;
export const BAR_MS = 1_000;

export type CheckName = "relay" | "keepalive";

export type CheckResult = { check: CheckName; pass: boolean; ms: number | null; note: string };

export type EngineResult = {
  engine: string;
  target: string;
  flavour: string;
  version: string;
  at: string;
  idleMs: number;
  checks: CheckResult[];
};

export type NotReached = { reached: false; why: string };
export type Reached = { reached: true; result: EngineResult };
export type RunOutcome = Reached | NotReached;

/** Plain JSON: a run merges into the last run's file. */
export type Ledger = Record<string, EngineResult>;

/** Not the client's `CommandAnswer`: importing the client drags `ws` and `child_process` into this module's graph. */
export type Answer = { ok: true; result?: unknown } | { ok: false; code: string; message: string };

export type CheckDeps = {
  send: (name: string, args: Record<string, unknown>) => Promise<Answer>;
  state: () => Promise<HubState | null>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Named in the lines only; `send` and `state` do the dialling. */
  port: number;
  say?: (line: string) => void;
};

type Ctx = CheckDeps & { say: (line: string) => void };

export type CheckOptions = {
  /** Orion runs the Chrome or the Firefox build, so the wire cannot name it: the dev does. */
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
  // The hub refuses every command, reads included, with more than one counted tab (extension-distribution.md §7.5).
  if (ready.length > 1) return { reached: false, why: `${ready.length} pokerogue.net tabs are connected; close all but one` };

  const ext = state.extensions.find(e => e.conn === ready[0]!.conn);
  if (ext === undefined) return { reached: false, why: "the counted tab's extension is not in the hub's state" };

  // Either flavour: §16's Orion premise is about the store zip, so refusing a store build refuses the one run that
  // matters.
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

/** Any answer passes, an unbooted game's `ready: false` included (extension-distribution.md §9.2). */
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

/** (extension-distribution.md §9.3, §9.4) */
function notReady(tabs: readonly TabInfo[]): string {
  if (tabs.length === 0) return "no pokerogue.net tab is connected; open or reload pokerogue.net";
  const wrong = tabs.filter(t => t.state === "wrong-world");
  if (wrong.length > 0) return "the page scripts ran isolated on this engine: `world: \"MAIN\"` is not honoured (§9.4)";
  return `no tab is ready (states: ${tabs.map(t => t.state).join(", ")})`;
}

export function merge(ledger: Ledger, result: EngineResult): Ledger {
  return { ...ledger, [result.engine]: result };
}

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

export function allPassed(ledger: Ledger): boolean {
  const results = Object.values(ledger);
  return results.length > 0 && results.every(r => r.checks.every(c => c.pass));
}
