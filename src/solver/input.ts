import type { ArenaTagSide, BattleType, GameModes, MysteryEncounterType, TrainerVariant } from "../enums/generated.ts";

export type SolveInput = {
  /** The wave-start save, or the session export when `extras` comes with it. */
  save: SessionSave;
  extras?: MidFightExtras;
  cloneVersion: string;
  budget: Budget;
};

/** The fields of upstream's `SessionSaveData` the solver reads; the rest rides along untouched. */
export type SessionSave = {
  gameVersion: string;
  gameMode: GameModes;
  seed: string;
  waveIndex: number;
  battleType: BattleType;
  mysteryEncounterType?: MysteryEncounterType | -1;
  trainer?: { trainerType: number; variant: TrainerVariant } | null;
  enemyParty: readonly unknown[];
  modifiers: readonly SavedItem[];
  enemyModifiers: readonly SavedItem[];
};

export type SavedItem = { typeId: string; className: string };

/** The live mid-fight reads a save lacks (#664). */
export type MidFightExtras = {
  /** Every arena tag on the field, Safeguard included, which no save keeps (game-code.md §28). */
  arenaTags: readonly { tagType: string; side: ArenaTagSide }[];
};

/** Each search beam's own, its turns counted from where the solve starts (#655). */
export type Budget = { expansions: number; turns: number };

/** `reviewed.json`'s `recheck`: absent until the pin bump's sign-off runs the harness re-check and writes it (#665). */
export type Recheck = { gameVersion: string };
