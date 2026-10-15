import { readFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { SessionSave } from "./input.ts";
import type { Checkpoint, Input } from "./oracle-line.ts";
import { type Clone, harnessJob } from "./replay.ts";
import { checkpoint, input } from "./schema.ts";
import type { Child, Hp, Pool, Position } from "./search.ts";

// (#655)
const RECYCLE_AFTER = 250;
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
const turnEnd = z.union([z.enum(["won", "lost", "on"]), z.object({ illegal: z.string() })]) satisfies z.ZodType<TurnEnd>;
const played = z.object({ input: input.nullable(), turn: z.int(), checkpoint, end: turnEnd }) satisfies z.ZodType<Played>;
const miss = z.object({ from: z.int(), turn: z.int(), want: played, got: played }) satisfies z.ZodType<Miss>;
const checks = z.object({
  straight: z.array(z.object({ turn: z.int(), end: turnEnd })),
  fork: z.array(miss),
  chain: z.array(miss),
}) satisfies z.ZodType<Checks>;

export type Worker = Pool & {
  root: Position;
  check(inputs: readonly Input[]): Promise<Checks>;
  close(): Promise<void>;
};

/** A worker that never started: what the clone lacks, or why the harness stopped. */
export type NotStarted = { missing: string } | { failed: string };

/**
 * One long-lived harness in the clone, serving the search: it restores a fork point and plays one turn, as many times
 * as it is asked. Started again in a fresh process after every `RECYCLE_AFTER` turns it has played.
 */
export async function startWorker(clone: Clone, save: SessionSave, at?: string): Promise<Worker | NotStarted> {
  const first = await spawn(clone, save, at);
  if (!("root" in first)) return first;
  // A promise, so `close` reaches a process still starting: closed before it connects, it would outlive the solve and
  // leave its files in the clone (#662).
  let current: Promise<Running> = Promise.resolve(first);
  let turnsPlayed = 0;
  const fresh = () => {
    if (turnsPlayed < RECYCLE_AFTER) return current;
    turnsPlayed = 0;
    const old = current;
    current = (async () => {
      await (await old).close();
      const next = await spawn(clone, save, at);
      if (!("root" in next)) throw new Error(`a fresh worker didn't start: ${"missing" in next ? next.missing : next.failed}`);
      return next;
    })();
    return current;
  };
  return {
    size: 1,
    root: first.root,
    async expand(forkPoint, inputs): Promise<Child[]> {
      const answer = await (await fresh()).ask({ kind: "expand", forkPoint, inputs }, EXPAND_MS);
      const { children } = z.object({ children: z.array(child) }).parse(answer);
      turnsPlayed += children.length;
      return children;
    },
    async check(inputs) {
      return checks.parse(await (await fresh()).ask({ kind: "checks", inputs }, CHECKS_MS));
    },
    close: () => current.then(running => running.close(), () => {}),
  };
}

type Running = { root: Position; ask(message: object, ms: number): Promise<unknown>; close(): Promise<void> };

async function spawn(clone: Clone, save: SessionSave, at?: string): Promise<Running | NotStarted> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const connected = new Promise<Socket>(resolve => server.once("connection", resolve));
  const source = readFileSync(new URL("./harness.test.ts.template", import.meta.url), "utf8");
  const run = clone({ name: "worker", source, input: JSON.stringify(harnessJob(save, [], at)), env: { COACH_PORT: String(port) } });
  const ended = run.then(result => {
    if ("missing" in result) return { missing: result.missing };
    return { failed: `the worker stopped${whyStopped(result.out)}` };
  });

  const socket = await within(BOOT_MS, Promise.race([connected, ended]), () => ({ failed: "the worker took too long to start" }));
  if (!("write" in socket)) {
    server.close();
    return socket;
  }
  const stopped = (why: NotStarted) => new Error("missing" in why ? why.missing : why.failed);
  const lines = createInterface({ input: socket })[Symbol.asyncIterator]();
  const next = async (ms: number, what: string): Promise<Record<string, unknown>> => {
    const line = await within(ms, Promise.race([lines.next(), ended.then(why => Promise.reject(stopped(why)))]), () => {
      throw new Error(`the worker took longer than ${ms / 1000} s to ${what}`);
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
    socket.destroy();
    server.close();
    return { failed: e instanceof Error ? e.message : String(e) };
  }

  let id = 0;
  return {
    root: hello.root,
    async ask(message, ms) {
      socket.write(`${JSON.stringify({ ...message, id: ++id })}\n`);
      const answer = await next(ms, "answer");
      if (typeof answer.error === "string") throw new Error(answer.error.split("\n")[0]);
      return answer;
    },
    async close() {
      socket.end();
      await within(CLOSE_MS, run, () => undefined);
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

function whyStopped(out: string | undefined): string {
  if (out === undefined) return ", writing nothing";
  try {
    const { error } = JSON.parse(out) as { error?: string };
    return error === undefined ? "" : `: ${error.split("\n")[0]}`;
  } catch {
    return ", writing a report that is not JSON";
  }
}
