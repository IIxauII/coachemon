// A persistent record of every turn played from a fork point: (fork point, input) → the children the worker returned.
// A played turn is deterministic (the fork check, #655; #663's byte-for-byte rerun), so a method that asks for a turn
// already recorded gets the same children without the game. Fork points are kept compressed and handed to the search
// as `fp:<hash>` handles; the hash leaves out the save's timestamp and play time, which differ between runs.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import type { Action, Child } from "../../../../../src/solver/search.ts";

export const HANDLE = "fp:";

export function normalHash(forkPoint: string): string {
  const fork = JSON.parse(forkPoint);
  const session = JSON.parse(fork.session);
  delete session.timestamp;
  delete session.playTime;
  fork.session = JSON.stringify(session);
  return createHash("sha1").update(JSON.stringify(fork)).digest("hex").slice(0, 20);
}

/** The requested input a returned child answers: its faint replacement taken off, a `queued` one back to `null`. */
export function asked(input: Action): string {
  if (input === null || input.kind === "queued") return "null";
  const { replacement: _, ...rest } = input as Record<string, unknown>;
  return JSON.stringify(rest);
}

export class Tree {
  private readonly forks = new Map<string, Buffer>();
  private readonly turns = new Map<string, Child[]>();
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const line of this.lines("forks.jsonl")) {
      const { h, z } = JSON.parse(line);
      this.forks.set(h, Buffer.from(z, "base64"));
    }
    for (const line of this.lines("turns.jsonl")) {
      const { k, c } = JSON.parse(line);
      this.turns.set(k, c);
    }
  }

  private lines(file: string): string[] {
    const p = path.join(this.dir, file);
    return existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean) : [];
  }

  get size() {
    return { forks: this.forks.size, turns: this.turns.size };
  }

  /** The handle for a fork point, kept if new. */
  handle(forkPoint: string): string {
    if (forkPoint.startsWith(HANDLE)) return forkPoint;
    const h = normalHash(forkPoint);
    if (!this.forks.has(h)) {
      const z = deflateSync(forkPoint);
      this.forks.set(h, z);
      appendFileSync(path.join(this.dir, "forks.jsonl"), `${JSON.stringify({ h, z: z.toString("base64") })}\n`);
    }
    return HANDLE + h;
  }

  forkPoint(handle: string): string {
    const z = this.forks.get(handle.slice(HANDLE.length));
    if (!z) throw new Error(`no fork point for ${handle}`);
    return inflateSync(z).toString("utf8");
  }

  key = (handle: string, input: Action) => `${handle.slice(HANDLE.length)}|${asked(input)}`;

  get(handle: string, input: Action): Child[] | undefined {
    return this.turns.get(this.key(handle, input));
  }

  /** `children` as the worker returned them, their fork points still strings. */
  put(handle: string, input: Action, children: Child[]): Child[] {
    const stored = children.map(c => (c.end === "on" ? { ...c, at: { ...c.at, forkPoint: this.handle(c.at.forkPoint) } } : c));
    const k = this.key(handle, input);
    this.turns.set(k, stored);
    appendFileSync(path.join(this.dir, "turns.jsonl"), `${JSON.stringify({ k, c: stored })}\n`);
    return stored;
  }

  /** Every recorded turn, for offline analysis. */
  entries(): IterableIterator<[string, Child[]]> {
    return this.turns.entries();
  }
}
