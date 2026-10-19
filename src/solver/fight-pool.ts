import type { PredicateRead } from "../game/port.ts";
import { isPool, type WorkerPool } from "./pool.ts";
import type { NotStarted } from "./worker.ts";

/** A trainer fight, by the run's seed and the live battle's wave. */
export type Fight = { seed: string; wave: number };

/**
 * A pool one solve plays its search on. `warm` is a pool an earlier solve started, whose `root` is that solve's start;
 * `done` hands it back, `broken` for one the solve saw fail, which is closed rather than kept.
 */
export type Lease = { pool: WorkerPool; warm: boolean; done(broken: boolean): Promise<void> };

type Held = { fight: Fight; pool: Promise<WorkerPool | NotStarted> };

const same = (a: Fight, b: Fight) => a.seed === b.seed && a.wave === b.wave;

/**
 * The pool kept warm for one fight (#677): its first solve starts it, every later solve of that fight — a re-solve off
 * the oracle line, or a solve started again from the first turn — takes it as it stands, and it is closed once `ended`
 * says the fight is over or a solve for another fight starts.
 */
export class FightPool {
  readonly #ended: (fight: Fight) => Promise<void>;
  #held: Held | null = null;

  constructor(ended: (fight: Fight) => Promise<void>) {
    this.#ended = ended;
  }

  async take(fight: Fight, start: () => Promise<WorkerPool | NotStarted>): Promise<Lease | NotStarted> {
    let warm = true;
    if (this.#held === null || !same(this.#held.fight, fight)) {
      const last = this.#held;
      // Held before anything is awaited, so a second solve of the fight waits on this pool rather than starting one.
      const held: Held = { fight, pool: (last ? close(last) : Promise.resolve()).then(start) };
      this.#held = held;
      warm = false;
      void this.#ended(fight).then(() => this.#drop(held), () => this.#drop(held));
    }
    const held = this.#held as Held;
    const pool = await held.pool;
    if (!isPool(pool)) {
      if (this.#held === held) this.#held = null;
      return pool;
    }
    return { pool, warm, done: broken => (broken ? this.#drop(held) : Promise.resolve()) };
  }

  async #drop(held: Held): Promise<void> {
    if (this.#held !== held) return;
    this.#held = null;
    await close(held);
  }
}

async function close(held: Held): Promise<void> {
  const pool = await held.pool;
  if (isPool(pool)) await pool.close();
}

export const FIGHT_LOOK_MS = 30_000;

export const FIGHT_UNREAD_MS = 600_000;

/**
 * The read carries no seed, so a new run at the same wave reads as the same fight until its solve, for another seed,
 * takes the pool.
 */
export async function fightEnded(
  game: { read(): Promise<PredicateRead> },
  clock: { now(): number; sleep(ms: number): Promise<void> },
  fight: Fight,
): Promise<void> {
  let unreadSince: number | null = null;
  for (;;) {
    await clock.sleep(FIGHT_LOOK_MS);
    const read = await game.read();
    if (read.ready) {
      if (read.wave !== fight.wave || read.turn === null) return;
      unreadSince = null;
    } else {
      unreadSince ??= clock.now();
      if (clock.now() - unreadSince >= FIGHT_UNREAD_MS) return;
    }
  }
}
