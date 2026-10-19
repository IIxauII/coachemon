import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { test } from "node:test";
import ts from "typescript";
import type { SessionSave } from "./input.ts";
import type { Clone, CloneRun } from "./replay.ts";
import { startWorker, WorkerDied } from "./worker.ts";

const save: SessionSave = JSON.parse(readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8")).save;
const tackle = { kind: "move", move: "TACKLE", tera: false } as const;
const root = { sig: "root", hp: { ours: [1], foes: [1] }, legal: [tackle], forkPoint: "root" };

const HARNESS = readFileSync(new URL("./harness.test.ts.template", import.meta.url), "utf8");
const FAST_POLL = readFileSync(new URL("./fast-poll.ts.template", import.meta.url), "utf8");
const FAKE_CLOCK = readFileSync(new URL("./fake-clock.ts.template", import.meta.url), "utf8");

/**
 * Stands in for the harness's serve mode: `answer` replies to each job, or ends the run with what it returns. `poll` and
 * `clock` are what the fast poll and the fake clock write before the harness connects, `null` for one that writes
 * nothing.
 */
function fakeHarness(
  answer: (job: { kind: string; inputs: unknown[] }) => object | { exit: CloneRun },
  poll: object | null = { fast: true },
  clock: object | null = { fake: true },
) {
  const runs: { name: string; source: string; input: string; env?: Record<string, string>; heapMb?: number }[] = [];
  let finished = 0;
  const clone: Clone = ({ name, source, input, env, heapMb, signal }) =>
    new Promise<CloneRun>(resolve => {
      runs.push({ name, source, input, env, heapMb });
      if (poll !== null && env?.COACH_POLL_OUT) writeFileSync(env.COACH_POLL_OUT, JSON.stringify(poll));
      if (clock !== null && env?.COACH_CLOCK_OUT) writeFileSync(env.COACH_CLOCK_OUT, JSON.stringify(clock));
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

/** Every name a module's top level declares: its imports' local names, and its variables, functions, classes and types. */
function topLevelNames(source: string): string[] {
  const names: string[] = [];
  for (const s of ts.createSourceFile("joined.ts", source, ts.ScriptTarget.Latest).statements) {
    if (ts.isImportDeclaration(s)) {
      const clause = s.importClause;
      if (clause?.name) names.push(clause.name.text);
      const bound = clause?.namedBindings;
      if (bound && ts.isNamespaceImport(bound)) names.push(bound.name.text);
      if (bound && ts.isNamedImports(bound)) names.push(...bound.elements.map(e => e.name.text));
    } else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name) {
      names.push(s.name.text);
    }
  }
  return names;
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

test("a warm worker roots a later start of its fight in the harness it runs, handing it the save and the fork point (#677)", async () => {
  const asked: Record<string, unknown>[] = [];
  const later = { ...root, sig: "t9", forkPoint: "t9" };
  const { clone, runs } = fakeHarness(job => {
    asked.push(job);
    return job.kind === "root" ? { root: later } : won(job.inputs);
  });

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  const rooted = await worker.rootAt(save, "t9");
  await worker.close();

  assert.deepEqual(rooted, later);
  assert.deepEqual(asked.map(({ kind, save: s, at }) => ({ kind, save: s, at })), [{ kind: "root", save, at: "t9" }]);
  assert.equal(runs.length, 1, "no second harness started");
});

test("a worker's harness is the replay's with the fake clock and the fast poll after it, and their reports clear it (#759, #782)", async () => {
  const { clone, runs } = fakeHarness(job => won(job.inputs));

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  await worker.close();

  assert.equal(runs[0].name, "worker");
  assert.equal(runs[0].source, `${HARNESS}\n${FAKE_CLOCK}\n${FAST_POLL}`);
  assert.equal(worker.slowPoll, null);
  assert.equal(worker.realClock, null);
  assert.equal(existsSync(runs[0].env?.COACH_POLL_OUT ?? ""), false, "the poll's report is removed once read");
  assert.equal(existsSync(runs[0].env?.COACH_CLOCK_OUT ?? ""), false, "the clock's report is removed once read");
});

test("the harness, the fake clock and the fast poll declare no top-level name twice, as one module (#782)", () => {
  const names = [HARNESS, FAKE_CLOCK, FAST_POLL].flatMap(source => topLevelNames(source));
  const twice = names.filter((n, i) => names.indexOf(n) !== i);

  assert.deepEqual(twice, []);
});

test("a worker whose fake clock stood down still serves, and says why it runs on real time (#782)", async () => {
  const { clone } = fakeHarness(job => won(job.inputs), { fast: true }, { real: "vi.waitUntil is not the one the fake clock copies" });

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  const children = await worker.expand("root", [tackle]);
  await worker.close();

  assert.equal(children.length, 1);
  assert.equal(worker.slowPoll, null);
  assert.equal(worker.realClock, "vi.waitUntil is not the one the fake clock copies");
});

test("a worker whose fake clock wrote nothing counts as running on real time (#782)", async () => {
  const { clone } = fakeHarness(job => won(job.inputs), { fast: true }, null);

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  await worker.close();

  assert.equal(worker.realClock, "the fake clock never reported");
});

test("a worker whose fast poll stood down still serves, and says why it polls the slow way (#759)", async () => {
  const { clone } = fakeHarness(job => won(job.inputs), { slow: "PhaseInterceptor.run is not the one the fast poll copies" });

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  const children = await worker.expand("root", [tackle]);
  await worker.close();

  assert.equal(children.length, 1);
  assert.equal(worker.slowPoll, "PhaseInterceptor.run is not the one the fast poll copies");
});

test("a worker whose fast poll wrote nothing counts as polling the slow way (#759)", async () => {
  const { clone } = fakeHarness(job => won(job.inputs), null);

  const worker = await startWorker(clone, save);
  assert.ok("root" in worker);
  await worker.close();

  assert.equal(worker.slowPoll, "the fast poll never reported");
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
