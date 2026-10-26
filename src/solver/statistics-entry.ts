/** The fight library's statistics entry: imported by `fight-library.ts` alone, which re-exports what callers need. */
import { z } from "zod";
import { PLUGIN_VERSION } from "../plugin-version.ts";
import { LDS, PORTFOLIO } from "./search.ts";
import type { Reason, SolveInput, SolveReport, SolveResult } from "./solver.ts";

// Contract: this schema is the baseline, and the entry type is inferred from it. A field added later, at any depth, goes
// in `.optional()`; absent means the entry was recorded before the field existed. A value added to a literal union goes
// into its enum. `schema` bumps only when a field's meaning changes, and the read step then upgrades the older shape.

const budget = z.strictObject({ expansions: z.number(), turns: z.number() });

const lds = z.strictObject({ ours: z.number(), alternatives: z.number(), discrepancies: z.number(), expansions: z.number() });

const beam = z.strictObject({ width: z.number(), ours: z.number() });

/** `progress` is the last line the solve reported before its cancel, `null` before any. */
const solveEnd = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("oracle_line") }),
  // Gotcha: any string, so a reason code the solver adds later still reads; an enum here would skip every entry with one.
  z.strictObject({ kind: z.literal("no_answer"), code: z.custom<Reason["code"]>(code => typeof code === "string") }),
  z.strictObject({ kind: z.literal("failed"), failure: z.string() }),
  z.strictObject({ kind: z.literal("cancelled"), progress: z.string().nullable() }),
]);

const poolStats = z.strictObject({
  size: z.number(),
  died: z.number(),
  lastDeath: z.string().nullable(),
  peakHeapMb: z.number().nullable(),
  heapLimitMb: z.number().nullable(),
  slowPoll: z.string().nullable(),
  realClock: z.string().nullable(),
});

const spread = z.strictObject({
  count: z.number(),
  totalMs: z.number(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  maxMs: z.number().nullable(),
});

const counts = z.record(z.string(), z.number()).readonly();

const foundBy = z.discriminatedUnion("stage", [
  z.strictObject({ stage: z.literal("lds"), pass: z.number(), spent: z.number() }),
  z.strictObject({ stage: z.literal("beam"), index: z.number(), turn: z.number(), spent: z.number() }),
]);

const stage = z.discriminatedUnion("stage", [
  z.strictObject({ stage: z.literal("lds"), ended: z.enum(["budget", "exhausted", "won", "stopped"]), spent: z.number(), ms: z.number() }),
  z.strictObject({
    stage: z.literal("beam"),
    index: z.number(),
    ended: z.enum(["emptied", "stalled", "turns", "budget", "won", "stopped"]),
    spent: z.number(),
    ms: z.number(),
  }),
]);

const search = z.strictObject({
  found: foundBy.nullable(),
  stages: z.array(stage).readonly(),
  dropped: counts,
  replays: z.strictObject({ ran: z.number(), failed: counts, ms: z.number() }),
  merged: z.number(),
  stalled: z.number(),
});

const ran = {
  schema: z.literal(1),
  turn: z.int(),
  at: z.string(),
  ended: solveEnd,
  budget,
  lds: lds.nullable(),
  portfolio: z.array(beam).readonly(),
  pluginVersion: z.string(),
  gameVersion: z.string(),
  benchmark: z.strictObject({ set: z.string() }).optional(),
};

const reported = {
  startup: z.strictObject({
    gateMs: z.number(),
    loadMs: z.number().nullable(),
    pool: z.strictObject({ warm: z.boolean(), ms: z.number() }).nullable(),
  }),
  pool: poolStats.nullable(),
  turnTimes: z.strictObject({ restore: spread, play: spread }).nullable(),
  cores: z.number(),
  search: search.optional(),
};

const solved = z.strictObject({ ...ran, ...reported });

/** The solver's report comes whole or not at all: a solve that never reached the solver has none. */
const entry = z.union([solved, z.strictObject(ran)]);

/** One line of a fight's statistics file per solve. */
export type StatisticsEntry = z.infer<typeof entry>;

export type SolveEnd = z.infer<typeof solveEnd>;

export type Recorder = { now: () => Date; pluginVersion: string };

export const RECORDER: Recorder = { now: () => new Date(), pluginVersion: PLUGIN_VERSION };

export function endOf(result: SolveResult | undefined): SolveEnd | null {
  if (result?.kind === "oracle_line") return { kind: "oracle_line" };
  if (result?.kind === "no_answer") return { kind: "no_answer", code: result.reason.code };
  return null;
}

/** `set` marks a benchmark run's entry with its setting set's name. */
export function entryOf(input: SolveInput, turn: number, ended: SolveEnd, report: SolveReport | null, recorder: Recorder, set?: string): StatisticsEntry {
  const settings = {
    schema: 1 as const,
    turn,
    at: recorder.now().toISOString(),
    budget: input.budget,
    lds: input.lds === undefined ? LDS : input.lds,
    portfolio: input.portfolio ?? PORTFOLIO,
    pluginVersion: recorder.pluginVersion,
    gameVersion: input.cloneVersion,
  };
  const marked = set === undefined ? {} : { benchmark: { set } };
  if (report === null) return { ...settings, ended, ...marked };
  // Gotcha: typed as the solved shape, not the union, or a renamed report field would pass as an entry with no report.
  const whole: z.infer<typeof solved> = { ...settings, ...report, ended, ...marked };
  return whole;
}

/** The read step: a line that isn't an entry says why. */
export function readEntry(text: string): StatisticsEntry | { why: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { why: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const read = entry.safeParse(value);
  return read.success ? read.data : { why: whyNot(read.error.issues) };
}

/** Of a union that matched no shape, the issues of the shape it came closest to. */
function whyNot(issues: readonly z.core.$ZodIssue[]): string {
  const [first] = issues;
  const closest =
    issues.length === 1 && first.code === "invalid_union" && first.errors.length > 0
      ? first.errors.reduce((a, b) => (b.length < a.length ? b : a))
      : issues;
  return closest.map(i => `${i.path.length === 0 ? "the entry" : i.path.join(".")}: ${i.message}`).join("; ");
}
