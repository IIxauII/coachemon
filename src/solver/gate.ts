import { BattleType, GameModes, TrainerVariant } from "../enums/generated.ts";
import { MODIFIER_CLASSES, MODIFIER_TYPE_IDS } from "../enums/modifiers.ts";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import type { NoAnswer } from "./line.ts";
import { noAnswer } from "./no-answer.ts";
import type { Recheck, SolveInput } from "./solver.ts";

const STAMPED: Recheck | null = "recheck" in reviewed ? (reviewed.recheck as Recheck) : null;

/**
 * The refusal gate: the cases no line can be trusted in, read off the input alone, before any clone runs. The fight's
 * own refusals go before the re-check, so no player waits on a release that would still refuse the fight; only the
 * version check goes ahead of them, because the pinned version's tables are what read the rest of the save.
 */
export function refuse({ save, extras, gameVersion: clone, recheck = STAMPED }: SolveInput): NoAnswer | null {
  if (save.gameMode === GameModes.DAILY) return noAnswer({ code: "daily" });
  if (save.gameVersion !== clone) return noAnswer({ code: "version_mismatch", live: save.gameVersion, clone });
  // `-1` is upstream's "no encounter", which every save that has none carries.
  if (save.battleType === BattleType.MYSTERY_ENCOUNTER || (save.mysteryEncounterType ?? -1) !== -1) {
    return noAnswer({ code: "mystery_encounter" });
  }
  // A trainer's `enemyParty` is its whole team, so only the variant tells its double from its single.
  const double =
    save.battleType === BattleType.WILD ? save.enemyParty.length > 1 : save.trainer?.variant === TrainerVariant.DOUBLE;
  if (double) return noAnswer({ code: "double" });
  if (extras?.arenaTags.some(tag => tag.tagType === "SAFEGUARD")) return noAnswer({ code: "safeguard" });
  // `toModifier`'s two silent drops that show before a load; a throw inside the item's type, or a clamped stack,
  // shows only after one (#660).
  const dropped = [...save.modifiers, ...save.enemyModifiers].filter(
    item => !MODIFIER_TYPE_IDS.has(item.typeId) || !MODIFIER_CLASSES.has(item.className),
  );
  if (dropped.length > 0) return noAnswer({ code: "dropped_item", items: dropped.map(item => item.typeId) });
  if (recheck?.gameVersion !== clone) return noAnswer({ code: "not_rechecked", version: clone });
  return null;
}
