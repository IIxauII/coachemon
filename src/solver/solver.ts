import { refuse } from "./gate.ts";
import type { SolveResult } from "./line.ts";
import { noAnswer } from "./no-answer.ts";

export type * from "./line.ts";

/** The fields of upstream's `SessionSaveData` the solver reads; the rest rides along untouched. */
export type SessionSave = {
  gameVersion: string;
  gameMode: number;
  seed: string;
  waveIndex: number;
  battleType: number;
  mysteryEncounterType?: number;
  trainer?: { trainerType: number; variant: number } | null;
  enemyParty: readonly unknown[];
  modifiers: readonly SavedItem[];
  enemyModifiers: readonly SavedItem[];
};

export type SavedItem = { typeId: string; className: string };

/** The live mid-fight reads a save lacks, which make it an augmented export (#664). */
export type MidFightExtras = {
  /** Every arena tag on the field: a save keeps only the serializable ones, and Safeguard is not one (#636). */
  arenaTags: readonly { tagType: string; side: number }[];
};

export type Budget = { expansions: number; turns: number };

/** Each beam's own (#655). */
export const DEFAULT_BUDGET: Budget = { expansions: 3000, turns: 40 };

/** What the pin bump's sign-off writes once the harness re-check passes on a game version (#665). */
export type Recheck = { gameVersion: string };

export type SolveInput = {
  /** The wave-start save, or the session export when `extras` makes it an augmented export. */
  save: SessionSave;
  extras?: MidFightExtras;
  /** The clone's, which the save's own must equal. */
  gameVersion: string;
  budget: Budget;
  /** Defaults to the record `drift:check --stamp` writes into `reviewed.json`; `null` is no record. */
  recheck?: Recheck | null;
};

export async function solve(input: SolveInput): Promise<SolveResult> {
  return refuse(input) ?? noAnswer({ code: "not_built" });
}
