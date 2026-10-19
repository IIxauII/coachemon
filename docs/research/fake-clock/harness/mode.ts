// Which harness source the search's workers run. The shipped worker appends the 1 ms poll (src/solver/fast-poll.ts.template)
// to the harness; the replay never does. MODE picks what a worker runs instead:
//   none   the harness alone, as the replay runs it: the unpatched game
//   poll1  as shipped: the harness and the 1 ms poll
// PATCH=<file>[,<file>] is spliced in at the vitest import of either (the fake clock, spin.ts, a tracer). MODE defaults
// to none. Replays are never touched.
import { readFileSync } from "node:fs";
import type { Clone } from "../../../../src/solver/replay.ts";

const ANCHOR = 'import { beforeAll, describe, it, vi } from "vitest";\n';
const FAST_POLL = readFileSync(new URL("../../../../src/solver/fast-poll.ts.template", import.meta.url), "utf8");

export type Mode = "none" | "poll1";

export const mode = (): Mode => {
  const m = process.env.MODE ?? "none";
  if (m !== "none" && m !== "poll1") throw new Error(`no MODE ${m}`);
  return m;
};

export const patchText = () =>
  (process.env.PATCH ?? "")
    .split(",")
    .filter(Boolean)
    .map(f => readFileSync(f, "utf8"))
    .join("\n");

/** The worker's source under `m`, from the shipped worker's. */
export function workerSource(shipped: string, m: Mode, patch: string): string {
  const fast = `\n${FAST_POLL}`;
  if (!shipped.endsWith(fast)) throw new Error("the worker's source no longer ends with the fast poll");
  const base = m === "poll1" ? shipped : shipped.slice(0, -fast.length);
  return patch ? splice(base, patch) : base;
}

function splice(source: string, patch: string) {
  if (!source.includes(ANCHOR)) throw new Error("the template moved: no place to splice the patch");
  return source.replace(ANCHOR, ANCHOR + patch);
}

export const forMode =
  (inner: Clone, m = mode(), patch = patchText()): Clone =>
  r =>
    r.name === "worker" ? inner({ ...r, source: workerSource(r.source, m, patch) }) : inner(r);
