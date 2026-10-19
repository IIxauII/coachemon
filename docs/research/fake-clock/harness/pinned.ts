// The three fights were exported from game 1.12.0.11, and the solver refuses a save from any other version than the
// clone's (src/solver/gate.ts). Up to 1.12.1.2 the game's newest session-save migrator is still v1_12_0_0
// (src/system/version-migration/version-converter.ts:97-103 in the 1.12.1.2 clone), so 1.12.1.2 loads such a save
// unchanged: relabelling it as the pinned version gives the input a 1.12.1.2 player's export would. Check that again
// before relabelling for a later pin.
import { PINNED_GAME_VERSION } from "../../../../src/escape-ladder/lookup.ts";

const RELABEL_FROM = "1.12.0.11";
const RELABEL_TO = ["1.12.1.1", "1.12.1.2"];

type Exported = { save: { gameVersion: string }; liveExport?: { gameVersion: string } };

export function asPinned<T extends Exported>(exported: T): T {
  if (exported.save.gameVersion === PINNED_GAME_VERSION) return exported;
  if (exported.save.gameVersion !== RELABEL_FROM || !RELABEL_TO.includes(PINNED_GAME_VERSION)) {
    throw new Error(`no session migrator check for ${exported.save.gameVersion} → ${PINNED_GAME_VERSION}`);
  }
  const relabel = <S extends { gameVersion: string }>(s: S): S => ({ ...s, gameVersion: PINNED_GAME_VERSION });
  return { ...exported, save: relabel(exported.save), ...(exported.liveExport && { liveExport: relabel(exported.liveExport) }) };
}
