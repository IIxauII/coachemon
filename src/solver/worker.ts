import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { SessionSave } from "./input.ts";
import type { Checkpoint, Input } from "./oracle-line.ts";
import { type Clone, harnessJob } from "./replay.ts";
import { checkpoint, input } from "./schema.ts";
import type { Child, Hp, Pool, Position } from "./search.ts";

// (#655)
const HEAP_MB = 768;
const BOOT_MS = 600_000;
const EXPAND_MS = 300_000;
const CHECKS_MS = 3_600_000;
const CLOSE_MS = 60_000;

type TurnEnd = "won" | "lost" | "on" | { illegal: string };
export type Played = { input: Input | null; turn: number; checkpoint: Checkpoint; end: TurnEnd };
/** `from` is the turn the straight run was restored at, `turn` the first one it played otherwise. */
export type Miss = { from: number; turn: number; want: Played; got: Played };
/** The fork check and the chained-restore check, and the straight run both were held to (#655). */
export type Checks = { straight: readonly { turn: number; end: TurnEnd }[]; fork: readonly Miss[]; chain: readonly Miss[] };

const hp = z.object({ ours: z.array(z.number()), foes: z.array(z.number()) }) satisfies z.ZodType<Hp>;
const position = z.object({
  sig: z.string(),
  hp,
  legal: z.array(input.nullable()),
  forkPoint: z.string(),
}) satisfies z.ZodType<Position>;
const child = z.discriminatedUnion("end", [
  z.object({ input: input.nullable(), end: z.literal("on"), at: position }),
  z.object({ input: input.nullable(), end: z.enum(["won", "lost"]), hp }),
  z.object({ input: input.nullable(), end: z.literal("dropped"), why: z.string() }),
]) satisfies z.ZodType<Child>;
/** `limitMb` is V8's for the process: the cap, and room for the young generation. */
export type HeapUse = { usedMb: number; limitMb: number };
const heapUse = z.object({ usedMb: z.number(), limitMb: z.number() }) satisfies z.ZodType<HeapUse>;
const turnEnd = z.union([z.enum(["won", "lost", "on"]), z.object({ illegal: z.string() })]) satisfies z.ZodType<TurnEnd>;
const played = z.object({ input: input.nullable(), turn: z.int(), checkpoint, end: turnEnd }) satisfies z.ZodType<Played>;
const miss = z.object({ from: z.int(), turn: z.int(), want: played, got: played }) satisfies z.ZodType<Miss>;
const checks = z.object({
  straight: z.array(z.object({ turn: z.int(), end: turnEnd })),
  fork: z.array(miss),
  chain: z.array(miss),
}) satisfies z.ZodType<Checks>;

export type Worker = Pick<Pool, "expand"> & {
  root: Position;
  /** The position a solve from `save` starts at, `at` its fork point past the first turn: loaded as the boot loads its own (#677). */
  rootAt(save: SessionSave, at?: string): Promise<Position>;
  /** Why the worker plays on the game's own phase poll; `null` once the fast poll is in (#759). */
  slowPoll: string | null;
  /** Why the worker's timers wait on real time; `null` once the fake clock is in (#782). */
  realClock: string | null;
  /** The last job's report; `null` before one has finished. */
  heap(): HeapUse | null;
  check(inputs: readonly Input[]): Promise<Checks>;
  close(): Promise<void>;
};

/** A worker that never started: what the clone lacks, or why the harness stopped. */
export type NotStarted = { missing: string } | { failed: string };

/**
 * The worker's process is gone or stopped answering, and the job it had never finished: another worker can play it.
 * Not an error the harness answered with, which a fresh process would only answer again.
 */
export class WorkerDied extends Error {}

/**
 * One long-lived harness in the clone, serving the search: it restores a fork point and plays one turn, as many times
 * as it is asked.
 */
export async function startWorker(clone: Clone, save: SessionSave, at?: string): Promise<Worker | NotStarted> {
  const running = await spawn(clone, save, at);
  if (!("root" in running)) return running;
  let heap: HeapUse | null = null;
  return {
    root: running.root,
    slowPoll: running.slowPoll,
    realClock: running.realClock,
    async expand(forkPoint, inputs): Promise<Child[]> {
      const answer = await running.ask({ kind: "expand", forkPoint, inputs }, EXPAND_MS);
      const parsed = z.object({ children: z.array(child), heap: heapUse }).parse(answer);
      heap = parsed.heap;
      return parsed.children;
    },
    async rootAt(save, at) {
      return z.object({ root: position }).parse(await running.ask({ kind: "root", save, at }, EXPAND_MS)).root;
    },
    heap: () => heap,
    async check(inputs) {
      return checks.parse(await running.ask({ kind: "checks", inputs }, CHECKS_MS));
    },
    close: running.close,
  };
}

type Running = { root: Position; slowPoll: string | null; realClock: string | null; ask(message: object, ms: number): Promise<unknown>; close(): Promise<void> };

async function spawn(clone: Clone, save: SessionSave, at?: string): Promise<Running | NotStarted> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const connected = new Promise<Socket>(resolve => server.once("connection", resolve));
  const harness = readFileSync(new URL("./harness.test.ts.template", import.meta.url), "utf8");
  const fakeClock = readFileSync(new URL("./fake-clock.ts.template", import.meta.url), "utf8");
  const fastPoll = readFileSync(new URL("./fast-poll.ts.template", import.meta.url), "utf8");
  const pollReport = path.join(tmpdir(), `coach-poll-${randomUUID()}.json`);
  const clockReport = path.join(tmpdir(), `coach-clock-${randomUUID()}.json`);
  const dropReports = () => {
    rmSync(pollReport, { force: true });
    rmSync(clockReport, { force: true });
  };
  const kill = new AbortController();
  const run = clone({
    name: "worker",
    source: `${harness}\n${fakeClock}\n${fastPoll}`,
    input: JSON.stringify(harnessJob(save, [], at)),
    env: { COACH_PORT: String(port), COACH_POLL_OUT: pollReport, COACH_CLOCK_OUT: clockReport },
    heapMb: HEAP_MB,
    signal: kill.signal,
  });
  const ended = run.then(result => {
    if ("missing" in result) return { missing: result.missing };
    return { failed: `the worker stopped${whyStopped(result.out)}` };
  });
  // A hung harness never reads the socket's end, so it would outlive the solve (#663).
  const stop = async () => {
    await within(CLOSE_MS, run, () => kill.abort());
    await run;
  };

  const socket = await within(BOOT_MS, Promise.race([connected, ended]), () => ({ failed: "the worker took too long to start" }));
  if (!("write" in socket)) {
    if ("failed" in socket) kill.abort();
    await run;
    server.close();
    dropReports();
    return socket;
  }
  const stopped = (why: NotStarted) => new WorkerDied("missing" in why ? why.missing : why.failed);
  const lines = createInterface({ input: socket })[Symbol.asyncIterator]();
  const next = async (ms: number, what: string): Promise<Record<string, unknown>> => {
    const line = await within(ms, Promise.race([lines.next(), ended.then(why => Promise.reject(stopped(why)))]), () => {
      throw new WorkerDied(`the worker took longer than ${ms / 1000} s to ${what}`);
    });
    if (line.done) {
      throw stopped(await within(CLOSE_MS, ended, () => ({ failed: "the worker closed its socket" })));
    }
    return JSON.parse(line.value);
  };

  let hello;
  try {
    hello = z.object({ kind: z.literal("root"), root: position }).parse(await next(BOOT_MS, "start"));
  } catch (e) {
    socket.end();
    await stop();
    socket.destroy();
    server.close();
    dropReports();
    return { failed: e instanceof Error ? e.message : String(e) };
  }

  let id = 0;
  return {
    root: hello.root,
    slowPoll: takeReport(pollReport, pollReportShape, "the fast poll"),
    realClock: takeReport(clockReport, clockReportShape, "the fake clock"),
    async ask(message, ms) {
      socket.write(`${JSON.stringify({ ...message, id: ++id })}\n`);
      const answer = await next(ms, "answer");
      if (typeof answer.error === "string") throw new Error(answer.error.split("\n")[0]);
      return answer;
    },
    async close() {
      socket.end();
      await stop();
      socket.destroy();
      server.close();
    },
  };
}

/** `late`'s answer once `ms` pass first; the timer goes when `work` settles, so it never holds the process open. */
async function within<T, L>(ms: number, work: Promise<T>, late: () => L): Promise<T | L> {
  const timer = new AbortController();
  try {
    return await Promise.race([work, sleep(ms, undefined, { signal: timer.signal }).then(late)]);
  } finally {
    timer.abort();
  }
}

const reportShape = (on: string, off: string): z.ZodType<string | null, unknown> =>
  z.union([z.object({ [on]: z.literal(true) }).transform(() => null), z.object({ [off]: z.string() }).transform(r => r[off] as string)]);
const pollReportShape = reportShape("fast", "slow");
const clockReportShape = reportShape("fake", "real");

/** The harness writes the fast poll's and the fake clock's reports before it says hello: `null`, or why one stood down. */
function takeReport(file: string, shape: z.ZodType<string | null, unknown>, what: string): string | null {
  let report;
  try {
    report = shape.safeParse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return `${what} never reported`;
  } finally {
    rmSync(file, { force: true });
  }
  return report.success ? report.data : `${what}'s report doesn't read`;
}

function whyStopped(out: string | undefined): string {
  if (out === undefined) return ", writing nothing";
  try {
    const { error } = JSON.parse(out) as { error?: string };
    return error === undefined ? "" : `: ${error.split("\n")[0]}`;
  } catch {
    return ", writing a report that is not JSON";
  }
}
