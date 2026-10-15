import { Refusal } from "./envelope.ts";

/**
 * `signal` aborts once the job has ended cancelled, and nothing stops the work but itself: whatever it reports, returns
 * or throws after that is dropped.
 */
export type JobWork = (args: Record<string, unknown>, ctl: JobControl) => Promise<unknown>;

export type JobControl = { signal: AbortSignal; progress: (line: string) => void };

export type JobKinds = Readonly<Record<string, JobWork>>;

export type JobState = "running" | "done" | "failed" | "cancelled";

export type JobView = { job: string; kind: string; state: JobState; progress: string | null; result?: unknown; failure?: string };

export const KEPT_ENDED = 16;

type Job = { id: string; kind: string; state: JobState; progress: string | null; result?: unknown; failure?: string; controller: AbortController };

export class Jobs {
  readonly #kinds: JobKinds;
  readonly #jobs = new Map<string, Job>();
  readonly #ended: string[] = [];
  #started = 0;

  constructor(kinds: JobKinds) {
    this.#kinds = kinds;
  }

  runs(kind: string): boolean {
    return Object.hasOwn(this.#kinds, kind);
  }

  start(kind: string, args: Record<string, unknown>): JobView {
    if (!this.runs(kind)) throw new Refusal("unknown_job_kind", `This server runs no job of kind ${JSON.stringify(kind)}.`, { kinds: Object.keys(this.#kinds) });
    const work = this.#kinds[kind];
    const job: Job = { id: `${kind}-${++this.#started}`, kind, state: "running", progress: null, controller: new AbortController() };
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
    this.#ended.push(job.id);
    while (this.#ended.length > KEPT_ENDED) this.#jobs.delete(this.#ended.shift()!);
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
  return { job: job.id, kind: job.kind, state: job.state, progress: job.progress };
}
