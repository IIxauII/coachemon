export type SolveResult = { kind: "line"; line: OracleLine } | NoAnswer;

export type OracleLine = {
  /** With `wave`, keys the line to its fight: the HUD ignores a line for another (#670). */
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

/** Moves and Pokémon by their upstream ids' names (`BUG_BITE`, `LEAVANNY`), as the generated enums spell them. */
export type Input = (
  | { kind: "move"; move: string; tera: boolean }
  | { kind: "switch"; to: PartySlot }
) & {
  /** The faint replacement this step's turn asks for, picked inside the step (#660). */
  replacement?: PartySlot;
};

export type PartySlot = { slot: number; species: string };

/**
 * The battle at the next decision, if the game draws what the oracle drew: after the last step, at the rewards screen,
 * once the end-of-turn effects after the last faint have run (#660).
 */
export type Checkpoint = { ours: readonly MonState[]; foes: readonly MonState[] };

export type MonState = PartySlot & {
  onField: boolean;
  hp: number;
  maxHp: number;
  /** A `StatusEffect` member name, or `null` for none. */
  status: string | null;
  /** ATK, DEF, SPATK, SPDEF, SPD, ACC, EVA. */
  statStages: readonly number[];
  tera: boolean;
  /** Boss bars left; absent on a mon that has none. */
  bossSegments?: number;
};

/** Which steps of the validation protocol ran and passed, and what each one checked (#636). */
export type Receipt = readonly { step: ValidationStep; checked: string }[];

export type ValidationStep = "versions" | "load_hygiene" | "wave_start_save" | "scene_matches" | "known_turn";

/** A draw the line needs to go its way, such as a crit or a miss. */
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
