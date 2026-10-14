import { Refusal } from "./envelope.ts";

/**
 * Work stops once `signal` aborts. Its job has ended cancelled by then, so whatever the work reports, returns or throws
 * afterwards is dropped.
 */
export type JobWork = (args: Record<string, unknown>, ctl: { signal: AbortSignal; progress: (line: string) => void }) => Promise<unknown>;

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

  start(kind: string, args: Record<string, unknown>): JobView {
    if (!Object.hasOwn(this.#kinds, kind)) throw new Refusal("unknown_job_kind", `This plugin runs no job of kind ${JSON.stringify(kind)}.`, { kinds: Object.keys(this.#kinds) });
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
    throw new Refusal("unknown_job", `No job ${JSON.stringify(id)}: a job lasts only as long as the plugin process, and only the last ${KEPT_ENDED} to end are kept.`, {
      jobs: [...this.#jobs.keys()],
    });
  }
}

function view(job: Job): JobView {
  return { job: job.id, kind: job.kind, state: job.state, progress: job.progress };
}
