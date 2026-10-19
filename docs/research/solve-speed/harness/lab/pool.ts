// A `Pool` for the search that answers from the recorded tree and plays only what it lacks on the real worker pool.
// `tau` makes it a simulated pool: each try costs `tau` ms of a fake worker's time, so a method's interleaving over
// `size` workers can be replayed from the record without the game.
import { setTimeout as sleep } from "node:timers/promises";
import type { WorkerPool } from "../../../../../src/solver/pool.ts";
import type { Action, Child, Pool } from "../../../../../src/solver/search.ts";
import { asked, type Tree } from "./tree.ts";

export type Tally = { requested: number; unique: number; played: number; realJobs: number };

export class LabPool implements Pool {
  readonly size: number;
  readonly tally: Tally = { requested: 0, unique: 0, played: 0, realJobs: 0 };
  private readonly seen = new Set<string>();
  private free: number;
  private readonly waiting: (() => void)[] = [];
  private readonly tree: Tree;
  private readonly real: WorkerPool | null;
  private readonly opts: { size: number; tau?: number; share?: boolean; maxPlayed?: number };

  constructor(tree: Tree, real: WorkerPool | null, opts: { size: number; tau?: number; share?: boolean; maxPlayed?: number }) {
    this.tree = tree;
    this.real = real;
    this.opts = opts;
    this.size = opts.size;
    this.free = opts.size;
  }

  async expand(forkPoint: string, inputs: readonly Action[]): Promise<Child[]> {
    const handle = this.tree.handle(forkPoint);
    const groups = new Map<string, Child[]>();
    const missing: Action[] = [];
    for (const input of inputs) {
      const got = this.tree.get(handle, input);
      if (got) groups.set(asked(input), got);
      else missing.push(input);
    }
    if (missing.length > 0) {
      if (!this.real) throw new Error(`not recorded: ${handle} ${missing.map(asked).join(" ")}`);
      if (this.opts.maxPlayed !== undefined && this.tally.played >= this.opts.maxPlayed) throw new Error("played the most turns allowed");
      this.tally.realJobs++;
      const children = await this.real.expand(this.tree.forkPoint(handle), missing);
      this.tally.played += children.length;
      for (const input of missing) {
        const mine = children.filter(c => asked(c.input) === asked(input));
        groups.set(asked(input), this.tree.put(handle, input, mine));
      }
    }
    let cost = 0;
    for (const input of inputs) {
      const group = groups.get(asked(input)) ?? [];
      this.tally.requested += group.length;
      const k = this.tree.key(handle, input);
      if (!this.seen.has(k)) {
        this.seen.add(k);
        this.tally.unique += group.length;
        cost += group.length;
      } else if (!this.opts.share) cost += group.length;
    }
    if (this.opts.tau !== undefined && missing.length === 0) await this.occupy(cost * this.opts.tau);
    // As the worker returns them: each input's first child, then each one's other faint replacements.
    const ordered = inputs.map(i => groups.get(asked(i)) ?? []);
    return [...ordered.map(g => g[0]).filter(Boolean), ...ordered.flatMap(g => g.slice(1))];
  }

  /** One of `size` fake workers busy for `ms`. */
  private async occupy(ms: number) {
    if (this.free === 0) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.free--;
    try {
      if (ms > 0) await sleep(ms);
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.free++;
    }
  }
}
