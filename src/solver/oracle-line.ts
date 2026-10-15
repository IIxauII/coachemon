import type { MoveId, SpeciesId, StatusEffect } from "../enums/generated.ts";
import type { Battle } from "./input.ts";

export type SolveResult = { kind: "oracle_line"; oracleLine: OracleLine } | NoAnswer;

export type ReplayResult = { kind: "replayed"; replay: Replay } | NoAnswer;

/** Scripted inputs played forward from the save to where they end. Not an oracle line: no win is promised (#660). */
export type Replay = {
  confidence: "replay";
  outcome: Outcome;
  steps: readonly Step[];
  receipt: Receipt;
  /** Empty only where the harness reported every step's draws and none went our way (#701). */
  luck: readonly Luck[];
};

/** `open`: the inputs ran out with the fight still on. */
export type Outcome = "won" | "lost" | "open";

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

/**
 * A won fight's last is read once the battle has ended: after the end-of-turn effects that follow the last faint, with
 * the foes' held items dropped, as live shows it (#660).
 */
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

/** Which steps of the replay protocol passed, or wait on live, and what each one checked (#636). */
export type Receipt = readonly {
  step: ValidationStep;
  checked: string;
  /** Left to the first live checkpoint to pass, as a known turn is on a first attempt (#661). */
  pending?: true;
}[];

export type ValidationStep = "versions" | "load_hygiene" | "wave_start_save" | "scene_matches" | "known_turn";

/** A draw that went the oracle line's way with less than a sure chance (#701). `what` names that chance. */
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
  | { code: "no_live_battle" }
  | { code: "no_live_export" }
  | { code: "not_wave_start" }
  | { code: "save_mismatch"; save: { wave: number; battleSeed?: string }; live: Battle }
  | { code: "no_clone"; version: string; cause: string }
  | { code: "clone_version"; clone: string; pinned: string }
  | { code: "load_hygiene"; rule: HygieneRule; detail: string }
  /** `index` into the inputs, null on a turn that took none. */
  | { code: "illegal_step"; index: number | null; turn: number; why: string; tried: Input | null; legal: readonly Input[] }
  | { code: "scene_mismatch"; differences: readonly string[] }
  | { code: "known_turn_missed"; misses: readonly string[] }
  | { code: "harness_failed"; why: string }
  /** `unreplayed` says why each win found failed replay; `dropped` counts the turns the harness couldn't play. */
  | { code: "no_win"; beams: readonly BeamEnd[]; unreplayed: readonly string[]; dropped: number };

/** `ours` weighs our side's HP beside the foes' HP lost. */
export type Beam = { width: number; ours: number };

/** `turn` counts from where the solve started. */
export type BeamEnd = Beam & { ended: "emptied" | "stalled" | "turns" | "budget"; turn: number; expansions: number };

/** The harness traps a replay checks it stayed out of (#632). */
export type HygieneRule = "max_rolls" | "overrides" | "enemy_items" | "item_totals" | "stray_prompt";
