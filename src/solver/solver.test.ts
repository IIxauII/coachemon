import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { readExtras } from "./extras.ts";
import type { Lease } from "./fight-pool.ts";
import type { Battle, MidFightExtras, SessionSave, SolveInput } from "./input.ts";
import { noAnswer, Unanswered } from "./no-answer.ts";
import type { Input } from "./oracle-line.ts";
import type { TurnTimes, WorkerPool } from "./pool.ts";
import type { Clone } from "./replay.ts";
import { DEFAULT_BUDGET, gate, solve, type SolveReport } from "./solver.ts";

const RECHECKED = reviewed.recheck.gameVersion;
const drayton: { live: Battle; liveExport: SessionSave; save: SessionSave } = JSON.parse(
  readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8"),
);
/** A run saved at a wave's start on an older game, continued after the game updated to the clone's version (#763). */
const continued = {
  ...drayton,
  liveExport: { ...drayton.liveExport, gameVersion: RECHECKED },
  cloneVersion: RECHECKED,
  budget: DEFAULT_BUDGET,
};

test("a player's wave-start save from an older game passes the gate once the live game serves the clone's version (#764)", () => {
  assert.notEqual(drayton.save.gameVersion, RECHECKED, "the fixture's save is from an older game");
  assert.equal(gate(continued), null);
  assert.equal(gate({ ...continued, liveExport: drayton.liveExport })?.reason.code, "version_mismatch");
});

test("a player's solve of a continued run carries its save, holding the scene to the live export as migrated (#764)", async () => {
  const handed: Parameters<Clone>[0][] = [];
  const clone: Clone = async job => {
    handed.push(job);
    return { out: undefined };
  };

  const result = await solve(continued, { clone, workers: 1 });

  assert.equal(result.kind === "no_answer" && result.reason.code, "harness_failed");
  assert.deepEqual(JSON.parse(handed[0].input), { save: drayton.save, inputs: [], liveExport: continued.liveExport });
});

test("a dev's solve given a carry carries an older save whose live export is not on the clone's version, as the re-check does (#950)", async () => {
  const handed: Parameters<Clone>[0][] = [];
  const clone: Clone = async job => {
    handed.push(job);
    return { out: undefined };
  };
  const library = { ...continued, liveExport: drayton.liveExport };

  const result = await solve(library, { clone, workers: 1, carry: { carried: true } });

  assert.equal(result.kind === "no_answer" && result.reason.code, "harness_failed");
  assert.deepEqual(JSON.parse(handed[0].input), { save: drayton.save, inputs: [], liveExport: drayton.liveExport });
});

const totals = (items: SessionSave["modifiers"]) => {
  const out: Record<string, number> = {};
  for (const { typeId, stackCount } of items ?? []) out[typeId] = (out[typeId] ?? 0) + stackCount;
  return out;
};

/** Gordie's W180 at turn 5, as the extension read it, on the clone's version. */
const t5: { save: SessionSave; extras: MidFightExtras } = JSON.parse(
  readFileSync(new URL("./fixtures/gordie-w180.t5.json", import.meta.url), "utf8"),
  (k, v) => (k === "gameVersion" ? RECHECKED : v),
);
const RESOLVE: SolveInput = { ...t5, cloneVersion: RECHECKED, budget: { expansions: 4, turns: 2 } };

/** A clone whose every run loads `RESOLVE`'s scene cleanly. */
const loadsT5: Clone = async () => ({
  out: JSON.stringify({
    version: RECHECKED,
    hygiene: {
      realRng: { constructed: true, reloaded: true },
      overrides: [],
      enemyItemsBeforeReload: 0,
      items: { ours: totals(t5.save.modifiers), foes: totals(t5.save.enemyModifiers) },
    },
    battle: { wave: 180, battleSeed: t5.extras.battleSeed },
    scene: t5.save,
    steps: [],
    end: "won",
  }),
});

const tackle: Input = { kind: "move", move: "TACKLE", tera: false };

const NONE = { count: 0, totalMs: 0, p50Ms: null, p95Ms: null, maxMs: null };
const NO_TURNS: TurnTimes = { restore: NONE, play: NONE };

/** A warm pool whose every turn loses, so the search ends in no win; it records what it was asked. */
function warmLease(answer: Partial<Pick<WorkerPool, "rootAt" | "turnTimes">> = {}) {
  const asked = { rootAt: [] as unknown[][], expand: [] as { forkPoint: string; signal?: AbortSignal }[], done: [] as boolean[] };
  const pool: WorkerPool = {
    size: 2,
    root: { sig: "an earlier start", hp: { ours: [1], foes: [1] }, stages: { ours: [[]], foes: [[]] }, legal: [tackle], forkPoint: "earlier" },
    rootAt: answer.rootAt ?? (async (...args) => {
      asked.rootAt.push(args);
      return { sig: "t5", hp: { ours: [1], foes: [1] }, stages: { ours: [[]], foes: [[]] }, legal: [tackle], forkPoint: "t5" };
    }),
    expand: async (forkPoint, inputs, signal) => {
      asked.expand.push({ forkPoint, signal });
      return inputs.map(input => ({ input, end: "lost", hp: { ours: [0], foes: [1] } }));
    },
    stats: () => ({ size: 2, died: 0, lastDeath: null, peakHeapMb: null, heapLimitMb: null, slowPoll: null, realClock: null }),
    turnTimes: answer.turnTimes ?? (() => NO_TURNS),
    close: async () => assert.fail("a warm pool is the fight's to close"),
  };
  const lease: Lease = { pool, warm: true, done: async broken => void asked.done.push(broken) };
  return { lease, asked };
}

test("a re-solve on the fight's warm pool roots its own start on it, searches from there under its own signal and hands the pool back (#677)", async () => {
  const { lease, asked } = warmLease();
  const signal = new AbortController().signal;
  let started = 0;

  const result = await solve(RESOLVE, {
    clone: loadsT5,
    signal,
    pools: async start => {
      started++;
      assert.equal(typeof start, "function");
      return lease;
    },
  });

  assert.equal(result.kind === "no_answer" && result.reason.code, "no_win", JSON.stringify(result));
  const read = readExtras(t5.save, t5.extras);
  assert.deepEqual(asked.rootAt, [[t5.save, read.kind === "read" ? read.forkPoint : assert.fail(), signal]]);
  assert.equal(asked.expand[0].forkPoint, "t5", "the search starts where this solve does, not where the pool's first did");
  assert.ok(asked.expand.every(e => e.signal === signal));
  assert.deepEqual(asked.done, [false], "a pool that answered every job is kept warm");
  assert.equal(started, 1);
});

test("a re-solve whose warm pool can't root it answers no answer and hands the pool back as broken (#677)", async () => {
  const { lease, asked } = warmLease({
    rootAt: async () => {
      throw new Unanswered(noAnswer({ code: "workers_died", died: 3, why: "the worker stopped, writing nothing" }));
    },
  });

  const result = await solve(RESOLVE, { clone: loadsT5, pools: async () => lease });

  assert.equal(result.kind === "no_answer" && result.reason.code, "workers_died");
  assert.deepEqual(asked.done, [true]);
});

test("a cancelled re-solve hands its warm pool back whole, whatever its jobs ended in (#677)", async () => {
  const solveCtl = new AbortController();
  const { lease, asked } = warmLease({
    rootAt: async () => {
      solveCtl.abort();
      throw new Error("the solve was cancelled");
    },
  });

  await solve(RESOLVE, { clone: loadsT5, pools: async () => lease, signal: solveCtl.signal });

  assert.deepEqual(asked.done, [false]);
});

test("a solve given no discrepancy search goes straight to the beams (#934)", async () => {
  const { lease } = warmLease();

  const result = await solve({ ...RESOLVE, lds: null }, { clone: loadsT5, pools: async () => lease });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail(JSON.stringify(result));
  assert.equal(reason.code === "no_win" && reason.lds, null);
});

test("a solve given a one-beam list runs only that beam (#934)", async () => {
  const { lease } = warmLease();

  const result = await solve({ ...RESOLVE, portfolio: [{ width: 1, ours: 0.5 }] }, { clone: loadsT5, pools: async () => lease });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail(JSON.stringify(result));
  assert.deepEqual(reason.code === "no_win" && reason.beams.map(({ width, ours }) => ({ width, ours })), [{ width: 1, ours: 0.5 }]);
});

test("a solve given neither runs the discrepancy search, then every beam of the default list (#934)", async () => {
  const { lease } = warmLease();

  const result = await solve(RESOLVE, { clone: loadsT5, pools: async () => lease });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail(JSON.stringify(result));
  assert.deepEqual(reason.code === "no_win" && [reason.lds?.ended, reason.beams.map(({ width, ours }) => ({ width, ours }))], [
    "exhausted",
    [
      { width: 8, ours: 1 },
      { width: 8, ours: 0.5 },
      { width: 16, ours: 0.5 },
    ],
  ]);
});

test("a solve hands on how its search went, and answers as it would without (#940)", async () => {
  const reported: SolveReport[] = [];

  const result = await solve({ ...RESOLVE, lds: null, portfolio: [{ width: 1, ours: 0.5 }] }, {
    clone: loadsT5,
    pools: async () => warmLease().lease,
    statistics: s => reported.push(s),
  });

  assert.equal(result.kind === "no_answer" && result.reason.code, "no_win");
  assert.deepEqual(
    reported.map(({ search }) => [search?.found, search?.stages.map(({ stage, ended, spent }) => ({ stage, ended, spent }))]),
    [[null, [{ stage: "beam", ended: "emptied", spent: 1 }]]],
  );
});

/** A clock that moves only when a fake says the work took time. */
function fakeClock() {
  let t = 1_000;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** The report but how its search went, whose stage times run on the search's own wall clock (#940). */
const beforeSearch = ({ search: _, ...report }: SolveReport) => report;

const STATS = { size: 3, died: 1, lastDeath: "the worker ran out of heap", peakHeapMb: 812, heapLimitMb: 4096, slowPoll: "the page's poll was not found", realClock: null };

test("a solve on a pool started for it reports the gate, the load check and the pool's start, then the pool's final stats and the machine's cores (#942)", async () => {
  const clock = fakeClock();
  const { lease } = warmLease();
  const own: Lease = { pool: { ...lease.pool, root: await lease.pool.rootAt(t5.save), stats: () => STATS }, warm: false, done: async () => {} };
  const reported: SolveReport[] = [];

  const result = await solve(RESOLVE, {
    clone: async run => {
      clock.advance(40);
      return loadsT5(run);
    },
    pools: async () => {
      clock.advance(900);
      return own;
    },
    clock,
    cores: 12,
    statistics: report => reported.push(report),
  });

  assert.equal(result.kind === "no_answer" && result.reason.code, "no_win", JSON.stringify(result));
  assert.deepEqual(reported.map(beforeSearch), [{ startup: { gateMs: 0, loadMs: 40, pool: { warm: false, ms: 900 } }, pool: STATS, turnTimes: NO_TURNS, cores: 12 }]);
});

test("a solve on the fight's warm pool reports that it was warm and how long rooting its start on it took (#942)", async () => {
  const clock = fakeClock();
  const { lease } = warmLease({
    rootAt: async () => {
      clock.advance(30);
      return { sig: "t5", hp: { ours: [1], foes: [1] }, stages: { ours: [[]], foes: [[]] }, legal: [tackle], forkPoint: "t5" };
    },
  });
  const reported: SolveReport[] = [];

  await solve(RESOLVE, { clone: loadsT5, pools: async () => lease, clock, cores: 4, statistics: report => reported.push(report) });

  assert.deepEqual(reported.map(beforeSearch), [
    {
      startup: { gateMs: 0, loadMs: 0, pool: { warm: true, ms: 30 } },
      pool: { size: 2, died: 0, lastDeath: null, peakHeapMb: null, heapLimitMb: null, slowPoll: null, realClock: null },
      turnTimes: NO_TURNS,
      cores: 4,
    },
  ]);
});

test("a solve the gate refuses still reports its gate time, with no load check and no pool (#942)", async () => {
  const reported: unknown[] = [];

  const result = await solve(
    { ...RESOLVE, cloneVersion: "1.12.0.1" },
    { clone: async () => assert.fail("the gate let it through"), clock: fakeClock(), cores: 8, statistics: report => reported.push(report) },
  );

  assert.equal(result.kind === "no_answer" && result.reason.code, "version_mismatch");
  assert.deepEqual(reported, [{ startup: { gateMs: 0, loadMs: null, pool: null }, pool: null, turnTimes: null, cores: 8 }]);
});

test("a solve whose pool never started reports how long it tried, and no pool's stats (#942)", async () => {
  const clock = fakeClock();
  const reported: unknown[] = [];

  const result = await solve(RESOLVE, {
    clone: loadsT5,
    pools: async () => {
      clock.advance(2_500);
      return { failed: "the harness wrote nothing" };
    },
    clock,
    cores: 8,
    statistics: report => reported.push(report),
  });

  assert.equal(result.kind === "no_answer" && result.reason.code, "harness_failed");
  assert.deepEqual(reported, [{ startup: { gateMs: 0, loadMs: 0, pool: { warm: false, ms: 2_500 } }, pool: null, turnTimes: null, cores: 8 }]);
});

test("a solve hands its report over as it starts and fills in each stage as it ends, so a cancel reads the stages reached (#942)", async () => {
  const clock = fakeClock();
  const { lease } = warmLease();
  let report: unknown;
  const seen: Record<string, unknown> = {};

  await solve(RESOLVE, {
    clone: async run => {
      seen.loading ??= structuredClone(report);
      clock.advance(40);
      return loadsT5(run);
    },
    pools: async () => {
      seen.leasing = structuredClone(report);
      return lease;
    },
    clock,
    cores: 4,
    statistics: handed => (report = handed),
  });

  assert.deepEqual(seen, {
    loading: { startup: { gateMs: 0, loadMs: null, pool: null }, pool: null, turnTimes: null, cores: 4 },
    leasing: { startup: { gateMs: 0, loadMs: 40, pool: null }, pool: null, turnTimes: null, cores: 4 },
  });
});

test("a solve reports how long the turns it asked its pool for took to restore and to play, and no other solve's (#943)", async () => {
  const signal = new AbortController().signal;
  const times: TurnTimes = {
    restore: { count: 6, totalMs: 120.6, p50Ms: 18.2, p95Ms: 31, maxMs: 31 },
    play: { count: 6, totalMs: 1_480, p50Ms: 240, p95Ms: 402.5, maxMs: 402.5 },
  };
  const { lease } = warmLease({ turnTimes: asked => (asked === signal ? times : NO_TURNS) });
  const reported: SolveReport[] = [];

  await solve(RESOLVE, { clone: loadsT5, pools: async () => lease, signal, clock: fakeClock(), cores: 4, statistics: report => reported.push(report) });

  assert.deepEqual(reported.map(({ turnTimes }) => turnTimes), [times]);
});
