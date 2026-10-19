import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { JobControl } from "../jobs.ts";
import { GORDIE_LINE } from "../game/fixtures/oracle-line.ts";
import type { CloneSetup } from "./clone.ts";
import { noAnswer } from "./no-answer.ts";
import type { Clone, CloneRun, Progress, SolveDeps, SolveInput, SolveResult } from "./solver.ts";
import { solveJob } from "./solve-job.ts";

const drayton = JSON.parse(readFileSync(new URL("./fixtures/drayton-w188.json", import.meta.url), "utf8"));
const INPUT: SolveInput = { ...drayton, cloneVersion: "1.12.0.11", budget: { expansions: 3000, turns: 40 } };
const SET_UP: CloneSetup = { kind: "clone", gameVersion: "1.12.0.11", dir: "/home/.coachemon/clone/v1.12.0.11/game" };
const POOL = { size: 4, died: 0, lastDeath: null, peakHeapMb: null, heapLimitMb: null, slowPoll: null };
const LINE: SolveResult = { kind: "oracle_line", oracleLine: GORDIE_LINE };

function control() {
  const controller = new AbortController();
  const lines: string[] = [];
  const ctl: JobControl = { signal: controller.signal, progress: line => lines.push(line) };
  return { ctl, lines, cancel: () => controller.abort() };
}

/** A clone that records each run it is asked for, and answers with nothing written. */
function recordingClone() {
  const runs: { dir: string; signal?: AbortSignal }[] = [];
  const runIn =
    (dir: string): Clone =>
    async ({ signal }): Promise<CloneRun> => {
      runs.push({ dir, signal });
      return { out: undefined };
    };
  return { runs, runIn };
}

test("a solve job sets up the clone, then solves the fight in it and answers with the solver's result (#672)", async () => {
  const { runs, runIn } = recordingClone();
  let solved: SolveInput | null = null;
  const work = solveJob("/home/.coachemon", {
    setUp: async () => SET_UP,
    runIn,
    solve: async (input, { clone }) => {
      solved = input;
      await clone({ name: "solve", source: "", input: "" });
      return LINE;
    },
  });
  assert.deepEqual(await work({ input: INPUT }, control().ctl), LINE);
  assert.deepEqual(solved, INPUT);
  assert.deepEqual(runs.map(r => r.dir), [SET_UP.dir], "the solve ran in the clone that was set up");
});

test("a solve job whose clone can't be set up answers with the setup's no answer, and solves nothing (#672)", async () => {
  const failed = noAnswer({ code: "no_clone", version: "1.12.0.11", cause: "couldn't reach codeload.github.com for the game (ENOTFOUND)" });
  const work = solveJob("/home/.coachemon", {
    setUp: async () => failed,
    runIn: recordingClone().runIn,
    solve: async () => assert.fail("the solver ran"),
  });
  assert.deepEqual(await work({ input: INPUT }, control().ctl), failed);
});

test("a solve job's progress is how far the search has gone of its budget, once its workers are up (#672)", async () => {
  const { ctl, lines } = control();
  const work = solveJob("/home/.coachemon", {
    setUp: async (_home, { progress }) => {
      progress("setting up the clone for 1.12.0.11, step 1 of 4: fetching the game");
      return SET_UP;
    },
    runIn: recordingClone().runIn,
    solve: async (_input, { progress }: SolveDeps) => {
      const spent = (n: number): Progress => ({ spent: n, budget: 9000, pool: POOL });
      progress?.(spent(0));
      progress?.(spent(1200));
      return LINE;
    },
  });
  await work({ input: INPUT }, ctl);
  assert.deepEqual(lines, [
    "setting up the clone for 1.12.0.11, step 1 of 4: fetching the game",
    "loading the fight in the clone and starting the search's workers",
    "searched 0 of 9,000 turns",
    "searched 1,200 of 9,000 turns",
  ]);
});

test("a solve job whose workers kept the slow poll says so beside its progress (#759)", async () => {
  const { ctl, lines } = control();
  const work = solveJob("/home/.coachemon", {
    setUp: async () => SET_UP,
    runIn: recordingClone().runIn,
    solve: async (_input, { progress }: SolveDeps) => {
      progress?.({ spent: 1200, budget: 9000, pool: { ...POOL, slowPoll: "PhaseInterceptor.run is not the one the fast poll copies" } });
      return LINE;
    },
  });
  await work({ input: INPUT }, ctl);
  assert.equal(
    lines.at(-1),
    "searched 1,200 of 9,000 turns, slowly: the search's workers kept the game's 50 ms phase poll, as PhaseInterceptor.run is not the one the fast poll copies",
  );
});

test("a cancelled solve job stops each clone run it has going, and starts no more (#672)", async () => {
  const { ctl, cancel } = control();
  const { runs, runIn } = recordingClone();
  let after: CloneRun | null = null;
  const work = solveJob("/home/.coachemon", {
    setUp: async () => SET_UP,
    runIn,
    solve: async (_input, { clone }) => {
      await clone({ name: "solve", source: "", input: "" });
      cancel();
      after = await clone({ name: "solve", source: "", input: "" });
      return LINE;
    },
  });
  await work({ input: INPUT }, ctl);
  assert.equal(runs.length, 1, "no run started once cancelled");
  assert.equal(runs[0].signal?.aborted, true, "the run going when the job was cancelled was told to stop");
  assert.ok(after && "missing" in after, JSON.stringify(after));
});
