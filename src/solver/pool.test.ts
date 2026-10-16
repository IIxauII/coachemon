import assert from "node:assert/strict";
import { test } from "node:test";
import type { Input, ReplayResult } from "./oracle-line.ts";
import { poolSize, startPool } from "./pool.ts";
import { type Action, type Child, type Position, search } from "./search.ts";
import { type NotStarted, type Worker, WorkerDied } from "./worker.ts";

const tackle: Input = { kind: "move", move: "TACKLE", tera: false };
const root: Position = { sig: "root", hp: { ours: [1], foes: [1] }, legal: [tackle], forkPoint: "root" };
const won = (inputs: readonly Action[]): Child[] => inputs.map(input => ({ input, end: "won", hp: { ours: [1], foes: [0] } }));
const replayed: ReplayResult = { kind: "replayed", replay: { confidence: "replay", outcome: "won", steps: [], receipt: [], luck: [] } };
const BUDGET = { expansions: 3000, turns: 40 };

type Fake = { n: number; jobs: number; closed: boolean };

/**
 * Workers started by a script: `job` answers a worker's jobs, or "die" for it to die on one; `boot` is the nth start's
 * fate, `null` for a worker that started; `heapMb` is what a worker's jobs leave on its heap.
 */
function fakeWorkers({
  job = (_w: Fake, inputs: readonly Action[]): Child[] | "die" => won(inputs),
  boot = (_n: number): NotStarted | null => null,
  heapMb = (_w: Fake): number | null => null,
} = {}) {
  const started: Fake[] = [];
  let running = 0;
  let mostAtOnce = 0;
  const start = async (): Promise<Worker | NotStarted> => {
    const n = started.length;
    const fate = boot(n);
    started.push({ n, jobs: 0, closed: fate !== null });
    if (fate !== null) return fate;
    const fake = started[n];
    let used: number | null = null;
    return {
      root,
      async expand(_forkPoint, inputs) {
        running++;
        mostAtOnce = Math.max(mostAtOnce, running);
        await new Promise(resolve => setTimeout(resolve, 1));
        running--;
        fake.jobs++;
        const answer = job(fake, inputs);
        if (answer === "die") throw new WorkerDied("the worker stopped, writing nothing");
        used = heapMb(fake);
        return answer;
      },
      heap: () => (used === null ? null : { usedMb: used, limitMb: 864 }),
      check: async () => assert.fail("no check in a pool"),
      async close() {
        fake.closed = true;
      },
    };
  };
  return { start, started, mostAtOnce: () => mostAtOnce };
}

test("a pool is cores − 2 workers, at most 6 and at least 1 (#663)", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 6, 8, 10, 16].map(poolSize),
    [1, 1, 1, 2, 4, 6, 6, 6],
  );
});

test("a pool starts its workers at once and plays as many jobs at a time as it has workers (#663)", async () => {
  const fakes = fakeWorkers();
  const pool = await startPool(3, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  await Promise.all(Array.from({ length: 9 }, () => pool.expand("root", [tackle])));
  await pool.close();

  assert.equal(pool.size, 3);
  assert.deepEqual(pool.root, root);
  assert.equal(fakes.started.length, 3);
  assert.equal(fakes.mostAtOnce(), 3);
  assert.ok(fakes.started.every(w => w.closed));
});

test("a dead worker's job goes to a fresh worker, and the solve completes (#663)", async () => {
  // The first worker dies on its second job.
  const fakes = fakeWorkers({ job: (w, inputs) => (w.n === 0 && w.jobs === 2 ? "die" : won(inputs)) });
  const pool = await startPool(1, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  const first = await pool.expand("root", [tackle]);
  const second = await pool.expand("root", [tackle]);
  await pool.close();

  assert.deepEqual([first, second], [won([tackle]), won([tackle])]);
  assert.equal(fakes.started.length, 2);
  assert.ok(fakes.started[0].closed);
  assert.equal(pool.stats().died, 1);
  assert.equal(pool.stats().lastDeath, "the worker stopped, writing nothing");
});

test("closing a pool ends the jobs it is playing, and no worker closed under one counts as dead (#663)", async () => {
  // A closed worker's job fails as the real one's does: its process ends under it.
  const fakes = fakeWorkers({ job: (w, inputs) => (w.closed ? "die" : won(inputs)) });
  const pool = await startPool(2, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  const playing = [pool.expand("root", [tackle]), pool.expand("root", [tackle]), pool.expand("root", [tackle])];
  await pool.close();
  const settled = await Promise.allSettled(playing);

  assert.deepEqual(
    settled.map(s => s.status === "rejected" && (s.reason as Error).message),
    ["the pool closed", "the pool closed", "the pool closed"],
  );
  assert.equal(pool.stats().died, 0);
  assert.equal(fakes.started.length, 2);
});

test("a search on a pool whose workers keep dying still finds the win (#663)", async () => {
  // Both workers die on their first job; the fresh ones don't.
  const fakes = fakeWorkers({ job: (w, inputs) => (w.n < 2 && w.jobs === 1 ? "die" : won(inputs)) });
  const pool = await startPool(2, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  const result = await search({ root: pool.root, pool, validate: async () => replayed, budget: BUDGET });
  await pool.close();

  assert.equal(result.kind, "found");
  assert.equal(pool.stats().died, 2);
});

test("a pool whose workers all die ends in no answer saying so, never a hang (#663)", async () => {
  const fakes = fakeWorkers({ job: () => "die" });
  const pool = await startPool(6, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  const result = await Promise.race([
    search({ root: pool.root, pool, validate: async () => replayed, budget: BUDGET }),
    new Promise<"hung">(resolve => setTimeout(resolve, 5_000, "hung").unref()),
  ]);
  await pool.close();

  assert.ok(result !== "hung" && result.kind === "no_answer");
  assert.equal(result.reason.code, "workers_died");
  assert.match(result.message, /the oracle's workers kept dying.*the last: the worker stopped, writing nothing/);
  assert.ok(fakes.started.every(w => w.closed));
});

test("a worker that dies on one job each time ends the solve, though the others play on (#663)", async () => {
  const fakes = fakeWorkers({ job: (_w, inputs) => (inputs.length === 2 ? "die" : won(inputs)) });
  const pool = await startPool(3, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  const others = Array.from({ length: 20 }, () => pool.expand("root", [tackle]));
  await assert.rejects(pool.expand("root", [tackle, tackle]), (e: Error & { answer?: { reason: { code: string } } }) => {
    assert.equal(e.answer?.reason.code, "workers_died");
    return true;
  });
  await Promise.allSettled(others);
  await pool.close();

  assert.equal(pool.stats().died, 3);
});

test("a worker that didn't start with the others is started again for a job, its slot not lost (#663)", async () => {
  const fakes = fakeWorkers({ boot: n => (n === 1 ? { failed: "the worker took too long to start" } : null) });
  const pool = await startPool(2, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  await Promise.all(Array.from({ length: 4 }, () => pool.expand("root", [tackle])));
  await pool.close();

  assert.equal(fakes.started.length, 3);
  assert.equal(fakes.mostAtOnce(), 2);
});

test("a pool none of whose workers start never starts, with the first one's reason (#663)", async () => {
  const fakes = fakeWorkers({ boot: () => ({ failed: "the worker stopped: SyntaxError" }) });

  assert.deepEqual(await startPool(2, fakes.start, "1.12.0.11"), { failed: "the worker stopped: SyntaxError" });
});

test("a clone gone from under a pool ends the solve as no clone, at its start or on a restart (#663)", async () => {
  const missing = { missing: "No pinned clone at .cache/pokerogue/v1.12.0.11." };
  const atStart = fakeWorkers({ boot: n => (n === 1 ? missing : null) });
  assert.deepEqual(await startPool(2, atStart.start, "1.12.0.11"), missing);
  assert.ok(atStart.started[0].closed);

  const later = fakeWorkers({ job: () => "die", boot: n => (n > 0 ? missing : null) });
  const pool = await startPool(1, later.start, "1.12.0.11");
  assert.ok("expand" in pool);
  const result = await search({ root: pool.root, pool, validate: async () => replayed, budget: BUDGET });
  await pool.close();
  assert.equal(result.kind === "no_answer" && result.reason.code, "no_clone");
});

test("a pool reports the most heap any of its workers has used (#663)", async () => {
  const fakes = fakeWorkers({ heapMb: w => 300 + 100 * w.n });
  const pool = await startPool(2, fakes.start, "1.12.0.11");
  assert.ok("expand" in pool);

  await Promise.all(Array.from({ length: 4 }, () => pool.expand("root", [tackle])));
  await pool.close();

  assert.deepEqual(pool.stats(), { size: 2, died: 0, lastDeath: null, peakHeapMb: 400, heapLimitMb: 864 });
});
