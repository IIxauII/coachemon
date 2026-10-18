import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { test } from "node:test";
import type { SessionSave } from "./input.ts";
import type { Clone, CloneRun } from "./replay.ts";
import { startWorker, WorkerDied } from "./worker.ts";

const save: SessionSave = JSON.parse(readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8")).save;
const tackle = { kind: "move", move: "TACKLE", tera: false } as const;
const root = { sig: "root", hp: { ours: [1], foes: [1] }, legal: [tackle], forkPoint: "root" };

/** Stands in for the harness's serve mode: `answer` replies to each job, or ends the run with what it returns. */
function fakeHarness(answer: (job: { kind: string; inputs: unknown[] }) => object | { exit: CloneRun }) {
  const runs: { input: string; env?: Record<string, string>; heapMb?: number }[] = [];
  let finished = 0;
  const clone: Clone = ({ input, env, heapMb, signal }) =>
    new Promise<CloneRun>(resolve => {
      runs.push({ input, env, heapMb });
      const socket = connect(Number(env?.COACH_PORT), "127.0.0.1", () => {
        socket.write(`${JSON.stringify({ kind: "root", root })}\n`);
      });
      signal?.addEventListener("abort", () => {
        socket.destroy();
        resolve({ out: undefined });
      });
      createInterface({ input: socket }).on("line", line => {
        const job = JSON.parse(line);
        const reply = answer(job);
        if ("exit" in reply) {
          socket.destroy();
          return resolve(reply.exit as CloneRun);
        }
        socket.write(`${JSON.stringify({ id: job.id, ...reply })}\n`);
      });
      socket.on("close", () => resolve({ out: undefined }));
    }).finally(() => finished++);
  return { clone, runs, ended: () => finished };
}

const heap = { usedMb: 412, limitMb: 864 };
const won = (inputs: unknown[]) => ({
  children: inputs.map(input => ({ input, end: "won", hp: { ours: [1], foes: [0] } })),
  heap,
});

test("a worker hands the harness the save and its port, and comes back with the harness's root (#662)", async () => {
  const { clone, runs } = fakeHarness(job => won(job.inputs));

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  await worker.close();

  assert.deepEqual(worker.root, root);
  assert.deepEqual(JSON.parse(runs[0].input), { save, inputs: [] });
  assert.match(runs[0].env?.COACH_PORT ?? "", /^\d+$/);
});

test("a worker started mid-fight hands the harness the fork point it starts at (#664)", async () => {
  const { clone, runs } = fakeHarness(job => won(job.inputs));
  const worker = await startWorker(clone, save, "at T5");
  assert.ok("root" in worker);

  await worker.expand("root", [tackle]);
  await worker.close();

  assert.equal(runs.length, 1);
  assert.deepEqual(JSON.parse(runs[0].input), { save, inputs: [], at: "at T5" });
});

test("a worker plays every job in one process, and ends it when closed (#663)", async () => {
  const { clone, runs, ended } = fakeHarness(job => won(job.inputs));
  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);

  for (let i = 0; i < 100; i++) await worker.expand("root", Array(10).fill(tackle));
  await worker.close();

  assert.equal(runs.length, 1);
  assert.equal(ended(), 1);
});

test("a clone that isn't set up is a worker that never started, naming what it lacks (#662)", async () => {
  const clone: Clone = async () => ({ missing: "No pinned clone at .cache/pokerogue/v1.12.0.11." });

  assert.deepEqual(await startWorker(clone, save), { missing: "No pinned clone at .cache/pokerogue/v1.12.0.11." });
});

test("a worker that stops mid-job fails the job with the harness's own error (#662)", async () => {
  const out = JSON.stringify({ error: "RangeError: Maximum call stack size exceeded\n    at reload" });
  const { clone } = fakeHarness(() => ({ exit: { out } }));
  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);

  await assert.rejects(worker.expand("root", [tackle]), (e: Error) => {
    assert.ok(e instanceof WorkerDied);
    assert.match(e.message, /the worker stopped: RangeError: Maximum call stack size exceeded$/);
    return true;
  });
  await worker.close();
});

test("a job the harness answers with an error fails with its first line, and the worker hasn't died (#662, #663)", async () => {
  const { clone } = fakeHarness(() => ({ error: "TypeError: no fork point\n    at restore" }));
  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);

  await assert.rejects(worker.expand("root", [tackle]), (e: Error) => {
    assert.ok(!(e instanceof WorkerDied));
    assert.equal(e.message, "TypeError: no fork point");
    return true;
  });
  await worker.close();
});

test("a worker runs under a 768 MB heap cap, and says what its last job left on the heap (#663)", async () => {
  const { clone, runs } = fakeHarness(job => won(job.inputs));
  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);

  assert.equal(worker.heap(), null);
  await worker.expand("root", [tackle]);
  await worker.close();

  assert.equal(runs[0].heapMb, 768);
  assert.deepEqual(worker.heap(), heap);
});

test("a harness answer that strays from the protocol fails the job rather than reaching the search (#662)", async () => {
  const { clone } = fakeHarness(() => ({ children: [{ input: tackle, end: "drawn" }] }));
  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);

  await assert.rejects(worker.expand("root", [tackle]));
  await worker.close();
});

test("a child whose turn took learn picks reaches the search with them, on a turn the game plays for us too (#673)", async () => {
  const learns = [{ slot: 0, species: "BULBASAUR", move: "LEECH_SEED", forget: null }];
  const children = [
    { input: { ...tackle, learns }, end: "won", hp: { ours: [1], foes: [0] } },
    { input: { kind: "queued", learns }, end: "won", hp: { ours: [1], foes: [0] } },
  ];
  const { clone } = fakeHarness(() => ({ children, heap }));
  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);

  const got = await worker.expand("root", [tackle, null]);
  await worker.close();

  assert.deepEqual(got, children);
});
