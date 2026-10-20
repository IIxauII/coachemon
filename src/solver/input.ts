import type { BattleType, GameModes, MysteryEncounterType, TrainerVariant } from "../enums/generated.ts";
import type { ExtrasResult } from "../page/extras.ts";

export type SolveInput = {
  /** The wave-start save, or the session export when `extras` comes with it. */
  save: SessionSave;
  extras?: MidFightExtras;
  /** The battle on the live tab, from the read that gave the save (`SessionRead`). */
  live?: Battle;
  /** The session export from that same read, taken at the decision: the scene a loaded save must match (#661). */
  liveExport?: SessionSave;
  cloneVersion: string;
  budget: Budget;
};

export type Battle = { wave: number; battleSeed: string };

/** The fields of upstream's `SessionSaveData` the solver reads; the rest rides along untouched. */
export type SessionSave = {
  gameVersion: string;
  gameMode: GameModes;
  seed: string;
  waveIndex: number;
  battleType: BattleType;
  mysteryEncounterType?: MysteryEncounterType | -1;
  trainer?: { trainerType: number; variant: TrainerVariant } | null;
  party: readonly unknown[];
  enemyParty: readonly unknown[];
  // A load writes `null` for a side holding no items, and the game's own reviver reads it, or a missing key, as none (#821).
  modifiers?: readonly SavedItem[] | null;
  enemyModifiers?: readonly SavedItem[] | null;
};

export type SavedItem = { typeId: string; className: string; stackCount: number };

/** The extension's `read_extras` (`src/page/extras.ts`), from the same decision as the session export it comes with. */
export type MidFightExtras = Omit<Extract<ExtrasResult, { ok: true }>, "ok">;

/** Each search beam's own, its turns counted from where the solve starts (#655). */
export type Budget = { expansions: number; turns: number };

/** `reviewed.json`'s `recheck`: absent until the pin bump's sign-off runs the harness re-check and writes it (#665). */
export type Recheck = { gameVersion: string };
