import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Refusal } from "./envelope.ts";

/**
 * `signal` aborts once the job has ended cancelled, and nothing stops the work but itself: whatever it reports, returns
 * or throws after that is dropped.
 */
export type JobWork = (args: Record<string, unknown>, ctl: JobControl) => Promise<unknown>;

export type JobControl = { signal: AbortSignal; progress: (line: string) => void };

export type JobKinds = Readonly<Record<string, JobWork>>;

export type JobState = "running" | "done" | "failed" | "cancelled";

/** `end_file` appears once the job has ended, for a watcher outside this process to wait on (#673). */
export type JobView = { job: string; kind: string; state: JobState; progress: string | null; end_file: string; result?: unknown; failure?: string };

export const KEPT_ENDED = 16;

const STALE_END_MS = 24 * 3600_000;

type Job = { id: string; kind: string; state: JobState; progress: string | null; endFile: string; result?: unknown; failure?: string; controller: AbortController };

export class Jobs {
  readonly #kinds: JobKinds;
  readonly #jobs = new Map<string, Job>();
  readonly #ended: string[] = [];
  readonly #endsIn: string;
  /** Job ids restart with each process and two plugin processes can share one home: without it, both write `solve-1`'s end to one file. */
  readonly #processTag = randomBytes(4).toString("hex");
  #started = 0;

  constructor(kinds: JobKinds, endsIn: string) {
    this.#kinds = kinds;
    this.#endsIn = endsIn;
    clearStaleEnds(endsIn);
  }

  runs(kind: string): boolean {
    return Object.hasOwn(this.#kinds, kind);
  }

  /** False too for an id this server never held or has dropped: a job is dropped only once it has ended. */
  running(id: string): boolean {
    return this.#jobs.get(id)?.state === "running";
  }

  start(kind: string, args: Record<string, unknown>): JobView {
    if (!this.runs(kind)) throw new Refusal("unknown_job_kind", `This server runs no job of kind ${JSON.stringify(kind)}.`, { kinds: Object.keys(this.#kinds) });
    const work = this.#kinds[kind];
    const id = `${kind}-${++this.#started}`;
    const endFile = path.join(this.#endsIn, `${this.#processTag}-${id}.json`);
    const job: Job = { id, kind, state: "running", progress: null, endFile, controller: new AbortController() };
    this.#jobs.set(job.id, job);
    const ctl = {
      signal: job.controller.signal,
      progress: (line: string) => {
        if (job.state === "running") job.progress = line;
      },
    };
    void new Promise(resolve => resolve(work(args, ctl))).then(
      result => this.#end(job, { state: "done", result }),
      (e: unknown) => this.#end(job, { state: "failed", failure: e instanceof Error ? e.message : String(e) }),
    );
    return view(job);
  }

  poll(id: string): JobView {
    return view(this.#job(id));
  }

  read(id: string): JobView {
    const job = this.#job(id);
    if (job.state === "done") return { ...view(job), result: job.result };
    if (job.state === "failed") return { ...view(job), failure: job.failure };
    return view(job);
  }

  cancel(id: string): JobView {
    const job = this.#job(id);
    if (this.#end(job, { state: "cancelled" })) job.controller.abort();
    return view(job);
  }

  #end(job: Job, end: Pick<Job, "state" | "result" | "failure">): boolean {
    if (job.state !== "running") return false;
    Object.assign(job, end);
    writeEnd(job);
    this.#ended.push(job.id);
    while (this.#ended.length > KEPT_ENDED) {
      const id = this.#ended.shift()!;
      removeEnd(this.#jobs.get(id)!.endFile);
      this.#jobs.delete(id);
    }
    return true;
  }

  #job(id: string): Job {
    const job = this.#jobs.get(id);
    if (job) return job;
    throw new Refusal("unknown_job", `No job ${JSON.stringify(id)}: a job lasts only as long as the server process, and only the last ${KEPT_ENDED} to end are kept.`, {
      jobs: [...this.#jobs.keys()],
    });
  }
}

function view(job: Job): JobView {
  return { job: job.id, kind: job.kind, state: job.state, progress: job.progress, end_file: job.endFile };
}

/** Another plugin process may share the home, its coach still waiting on a fresh end file. */
function clearStaleEnds(dir: string): void {
  const before = Date.now() - STALE_END_MS;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (statSync(file).mtimeMs < before) removeEnd(file);
    } catch {
      // Another plugin process cleared it first.
    }
  }
}

/** Whole or not at all, so a watcher never reads half a file. */
function writeEnd(job: Job): void {
  const { end_file: _file, ...ended } = view(job);
  const part = `${job.endFile}.part`;
  try {
    mkdirSync(path.dirname(job.endFile), { recursive: true });
    writeFileSync(part, JSON.stringify(ended) + "\n");
    renameSync(part, job.endFile);
  } catch {
    // An end file that won't write never fails the job.
  }
}

/** Never throws: `#end` calls it where a throw would go unhandled. */
function removeEnd(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    // An end file left behind goes once it is a day old.
  }
}
