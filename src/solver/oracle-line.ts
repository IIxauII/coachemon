import type { MoveId, SpeciesId, StatusEffect } from "../enums/generated.ts";

export type SolveResult = { kind: "oracle_line"; oracleLine: OracleLine } | NoAnswer;

export type OracleLine = {
  /** With `wave`, keys the oracle line to its fight: the HUD ignores one for another (#670). */
  seed: string;
  wave: number;
  gameVersion: string;
  steps: readonly Step[];
  receipt: Receipt;
  luck: readonly Luck[];
};

export type Step = {
  /** The battle's own turn: a two-turn move's second turn is a step with no input, so turns can outrun inputs (#660). */
  turn: number;
  input: Input | null;
  checkpoint: Checkpoint;
};

export type Input = (
  | { kind: "move"; move: keyof typeof MoveId; tera: boolean }
  | { kind: "switch"; to: PartySlot }
) & {
  /** The faint replacement this step's turn asks for, picked inside the step (#660). */
  replacement?: PartySlot;
};

export type PartySlot = { slot: number; species: keyof typeof SpeciesId };

/** The last step's is read at the rewards screen, once the end-of-turn effects after the last faint have run (#660). */
export type Checkpoint = { ours: readonly MonState[]; foes: readonly MonState[] };

export type MonState = PartySlot & {
  onField: boolean;
  hp: number;
  maxHp: number;
  status: keyof typeof StatusEffect;
  /** ATK, DEF, SPATK, SPDEF, SPD, ACC, EVA. */
  statStages: readonly number[];
  tera: boolean;
  /** Those left unbroken. */
  bossBars?: number;
};

/** Which steps of the replay protocol ran and passed, and what each one checked (#636). */
export type Receipt = readonly { step: ValidationStep; checked: string }[];

export type ValidationStep = "versions" | "load_hygiene" | "wave_start_save" | "scene_matches" | "known_turn";

/** A draw the oracle line needs to go its way, such as a crit or a miss. */
export type Luck = { turn: number; what: string };

export type NoAnswer = { kind: "no_answer"; reason: Reason; message: string };

export type Reason =
  | { code: "daily" }
  | { code: "version_mismatch"; live: string; clone: string }
  | { code: "not_rechecked"; version: string }
  | { code: "mystery_encounter" }
  | { code: "double" }
  | { code: "safeguard" }
  | { code: "dropped_item"; items: readonly string[] }
  | { code: "not_built" };
