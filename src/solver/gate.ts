import { BattleType, GameModes } from "../enums/generated.ts";
import { MODIFIER_CLASSES, MODIFIER_TYPE_IDS } from "../enums/modifiers.ts";
import { readExtras } from "./extras.ts";
import type { Recheck, SolveInput } from "./input.ts";
import { newerVersion, noAnswer } from "./no-answer.ts";
import type { NoAnswer } from "./oracle-line.ts";

/** `carried` lets a save from an older game through, which the game's own load migrates (#703). */
export type Carry = { carried?: boolean };

/** The live export's `gameVersion` is the live game's own: the game stamps an export with it (#764). */
export const carryOf = ({ save, liveExport, cloneVersion }: Pick<SolveInput, "save" | "liveExport" | "cloneVersion">): Carry => ({
  carried: newerVersion(cloneVersion, save.gameVersion) && liveExport?.gameVersion === cloneVersion,
});

/**
 * The fights no oracle line can be trusted in, read off the input alone, before any clone runs. A refusal that waits on
 * a release comes after every one that would outlast it, except the version check: the pinned version's tables are
 * what read the fight's own refusals, so it goes ahead of them.
 */
export function refuse(
  { save, extras, liveExport, cloneVersion }: Pick<SolveInput, "save" | "extras" | "liveExport" | "cloneVersion">,
  recheck: Recheck | null,
  { carried = false }: Carry = {},
): NoAnswer | null {
  if (save.gameMode === GameModes.DAILY) return noAnswer({ code: "daily" });
  if (save.gameVersion !== cloneVersion && !(carried && newerVersion(cloneVersion, save.gameVersion))) {
    // The save's version is the game that wrote it, not the tab's (#763, game-code.md §29, §31).
    const live = liveExport?.gameVersion ?? null;
    return noAnswer({ code: "version_mismatch", save: save.gameVersion, live, clone: cloneVersion });
  }
  if (save.battleType === BattleType.MYSTERY_ENCOUNTER || (save.mysteryEncounterType ?? -1) !== -1) {
    return noAnswer({ code: "mystery_encounter" });
  }
  if (extras) {
    const read = readExtras(save, extras);
    if (read.kind === "missing") return noAnswer({ code: "missing_extras", extras: read.extras });
    if (read.read.arenaTags.some(tag => tag.tagType === "SAFEGUARD")) return noAnswer({ code: "safeguard" });
  }
  // The drops a save shows before a load; a throw inside the item's type, or a clamped stack, shows only after one
  // (game-code.md §28).
  const dropped = [...(save.modifiers ?? []), ...(save.enemyModifiers ?? [])].filter(
    item => !MODIFIER_TYPE_IDS.has(item.typeId) || !MODIFIER_CLASSES.has(item.className),
  );
  if (dropped.length > 0) return noAnswer({ code: "dropped_item", items: dropped.map(item => item.typeId) });
  if (recheck?.gameVersion !== cloneVersion) return noAnswer({ code: "not_rechecked", version: cloneVersion });
  return null;
}
