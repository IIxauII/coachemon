import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import { refuse } from "./gate.ts";
import type { Budget, Recheck, SolveInput } from "./input.ts";
import { noAnswer } from "./no-answer.ts";
import type { SolveResult } from "./oracle-line.ts";

export type * from "./input.ts";
export type * from "./oracle-line.ts";
export { type Clone, type CloneRun, replay } from "./replay.ts";
export { type Known, misses, readScript, type Script } from "./script.ts";

export const DEFAULT_BUDGET: Budget = { expansions: 3000, turns: 40 };

const RECHECK: Recheck | null = "recheck" in reviewed ? (reviewed.recheck as Recheck) : null;

export async function solve(input: SolveInput): Promise<SolveResult> {
  return refuse(input, RECHECK) ?? noAnswer({ code: "not_built" });
}
