import { noAnswer, Unanswered } from "./no-answer.ts";
import type { Action, Child, Pool, Position } from "./search.ts";
import { type NotStarted, type Worker, WorkerDied } from "./worker.ts";

// (#655)
export const poolSize = (cores: number) => Math.max(1, Math.min(cores - 2, 6));

const TRIES = 3;

/**
 * `peakHeapMb` is the most any worker's job has left on its heap, before collection; `lastDeath`, why one last died;
 * `slowPoll`, why a worker last started on the game's own phase poll (#759).
 */
export type PoolStats = {
  size: number;
  died: number;
  lastDeath: string | null;
  peakHeapMb: number | null;
  heapLimitMb: number | null;
  slowPoll: string | null;
};

export const slowPollNote = (why: string) => `the search's workers kept the game's own phase poll, as ${why}`;

export type WorkerPool = Pool & { root: Position; stats(): PoolStats; close(): Promise<void> };

type Job = { forkPoint: string; inputs: readonly Action[]; died: number; done: (c: Child[]) => void; fail: (e: unknown) => void };

/** `null` is a worker to start before its next job: one that died, or never started. */
type Slot = { worker: Worker | null; busy: boolean };

const closedPool = () => new Error("the pool closed");

/**
 * `size` workers, started together, each playing one job at a time. A worker that dies is replaced, and its job goes
 * to the front of the queue. A job `TRIES` workers died on ends the solve with "no answer", as does the clone going.
 */
export async function startPool(size: number, start: () => Promise<Worker | NotStarted>, version: string): Promise<WorkerPool | NotStarted> {
  const started = await Promise.all(Array.from({ length: size }, start));
  const workers = started.filter((w): w is Worker => "root" in w);
  const missing = started.find(w => "missing" in w);
  if (missing || workers.length === 0) {
    await Promise.all(workers.map(w => w.close()));
    return missing ?? (started[0] as NotStarted);
  }

  const slots: Slot[] = started.map(w => ({ worker: "root" in w ? w : null, busy: false }));
  const queue: Job[] = [];
  const closing: Promise<void>[] = [];
  // Waited on by `close`, so a worker started as the pool closes is closed with it.
  const starting = new Set<Promise<unknown>>();
  let died = 0;
  let lastDeath: string | null = null;
  let closed = false;
  let peakHeapMb: number | null = null;
  let heapLimitMb: number | null = null;
  let slowPoll = workers.findLast(w => w.slowPoll !== null)?.slowPoll ?? null;

  const restart = (slot: Slot) => {
    const fresh = start().then(w => {
      if ("root" in w) {
        slot.worker = w;
        slowPoll = w.slowPoll ?? slowPoll;
      }
      return w;
    });
    starting.add(fresh);
    return fresh.finally(() => starting.delete(fresh));
  };

  const play = async (slot: Slot, job: Job) => {
    try {
      let worker = slot.worker;
      if (worker === null) {
        const fresh = await restart(slot);
        if ("missing" in fresh) throw new Unanswered(noAnswer({ code: "no_clone", version, cause: fresh.missing }));
        if ("failed" in fresh) throw new WorkerDied(fresh.failed);
        if (closed) return job.fail(closedPool());
        worker = fresh;
      }
      const children = await worker.expand(job.forkPoint, job.inputs);
      const heap = worker.heap();
      if (heap) {
        peakHeapMb = Math.max(peakHeapMb ?? 0, heap.usedMb);
        heapLimitMb = heap.limitMb;
      }
      job.done(children);
    } catch (e) {
      // Closing ends the jobs still playing: no worker died of it, and none is left to play them again.
      if (closed) return job.fail(closedPool());
      if (!(e instanceof WorkerDied)) return job.fail(e);
      died++;
      lastDeath = e.message;
      if (slot.worker) closing.push(slot.worker.close());
      slot.worker = null;
      if (++job.died >= TRIES) return job.fail(new Unanswered(noAnswer({ code: "workers_died", died, why: e.message })));
      queue.unshift(job);
    }
  };

  const pump = () => {
    for (const slot of slots) {
      if (closed || queue.length === 0) return;
      if (slot.busy) continue;
      const job = queue.shift() as Job;
      slot.busy = true;
      void play(slot, job).finally(() => {
        slot.busy = false;
        pump();
      });
    }
  };

  return {
    size,
    root: workers[0].root,
    expand: (forkPoint, inputs) =>
      new Promise((done, fail) => {
        if (closed) return fail(closedPool());
        queue.push({ forkPoint, inputs, died: 0, done, fail });
        pump();
      }),
    stats: () => ({ size, died, lastDeath, peakHeapMb, heapLimitMb, slowPoll }),
    async close() {
      closed = true;
      for (const job of queue.splice(0)) job.fail(closedPool());
      await Promise.allSettled(starting);
      await Promise.all([...closing, ...slots.map(slot => slot.worker?.close())]);
    },
  };
}
