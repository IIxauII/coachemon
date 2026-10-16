import { BattleType, GameModes, TrainerVariant } from "../enums/generated.ts";
import { MODIFIER_CLASSES, MODIFIER_TYPE_IDS } from "../enums/modifiers.ts";
import { readExtras } from "./extras.ts";
import type { Recheck, SolveInput } from "./input.ts";
import { noAnswer } from "./no-answer.ts";
import type { NoAnswer } from "./oracle-line.ts";

/**
 * `carried`: the pin bump's re-check replays a known fight's save from an older game, which the clone migrates on load
 * as it migrates a player's (#703). Never a player's own solve.
 */
export type Carry = { carried?: boolean };

/**
 * The fights no oracle line can be trusted in, read off the input alone, before any clone runs. A refusal that waits on
 * a release comes after every one that would outlast it, except the version check: the pinned version's tables are
 * what read the fight's own refusals, so it goes ahead of them.
 */
export function refuse(
  { save, extras, cloneVersion }: Pick<SolveInput, "save" | "extras" | "cloneVersion">,
  recheck: Recheck | null,
  { carried = false }: Carry = {},
): NoAnswer | null {
  if (save.gameMode === GameModes.DAILY) return noAnswer({ code: "daily" });
  const older = save.gameVersion.localeCompare(cloneVersion, undefined, { numeric: true }) < 0;
  if (save.gameVersion !== cloneVersion && !(carried && older)) {
    return noAnswer({ code: "version_mismatch", live: save.gameVersion, clone: cloneVersion });
  }
  if (save.battleType === BattleType.MYSTERY_ENCOUNTER || (save.mysteryEncounterType ?? -1) !== -1) {
    return noAnswer({ code: "mystery_encounter" });
  }
  // A trainer's `enemyParty` is its whole team, so only the variant tells its double from its single
  // (game-code.md §28).
  const double =
    save.battleType === BattleType.WILD ? save.enemyParty.length > 1 : save.trainer?.variant === TrainerVariant.DOUBLE;
  if (double) return noAnswer({ code: "double" });
  if (extras) {
    const read = readExtras(save, extras);
    if (read.kind === "missing") return noAnswer({ code: "missing_extras", extras: read.extras });
    if (read.read.arenaTags.some(tag => tag.tagType === "SAFEGUARD")) return noAnswer({ code: "safeguard" });
  }
  // The drops a save shows before a load; a throw inside the item's type, or a clamped stack, shows only after one
  // (game-code.md §28).
  const dropped = [...save.modifiers, ...save.enemyModifiers].filter(
    item => !MODIFIER_TYPE_IDS.has(item.typeId) || !MODIFIER_CLASSES.has(item.className),
  );
  if (dropped.length > 0) return noAnswer({ code: "dropped_item", items: dropped.map(item => item.typeId) });
  if (recheck?.gameVersion !== cloneVersion) return noAnswer({ code: "not_rechecked", version: cloneVersion });
  return null;
}
