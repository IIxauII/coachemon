import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { readExtras } from "./extras.ts";
import type { Lease } from "./fight-pool.ts";
import type { Battle, MidFightExtras, SessionSave, SolveInput } from "./input.ts";
import { noAnswer, Unanswered } from "./no-answer.ts";
import type { Input } from "./oracle-line.ts";
import type { WorkerPool } from "./pool.ts";
import type { Clone } from "./replay.ts";
import { DEFAULT_BUDGET, gate, solve } from "./solver.ts";

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

/** A warm pool whose every turn loses, so the search ends in no win; it records what it was asked. */
function warmLease(answer: Partial<Pick<WorkerPool, "rootAt">> = {}) {
  const asked = { rootAt: [] as unknown[][], expand: [] as { forkPoint: string; signal?: AbortSignal }[], done: [] as boolean[] };
  const pool: WorkerPool = {
    size: 2,
    root: { sig: "an earlier start", hp: { ours: [1], foes: [1] }, legal: [tackle], forkPoint: "earlier" },
    rootAt: answer.rootAt ?? (async (...args) => {
      asked.rootAt.push(args);
      return { sig: "t5", hp: { ours: [1], foes: [1] }, legal: [tackle], forkPoint: "t5" };
    }),
    expand: async (forkPoint, inputs, signal) => {
      asked.expand.push({ forkPoint, signal });
      return inputs.map(input => ({ input, end: "lost", hp: { ours: [0], foes: [1] } }));
    },
    stats: () => ({ size: 2, died: 0, lastDeath: null, peakHeapMb: null, heapLimitMb: null, slowPoll: null, realClock: null }),
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
