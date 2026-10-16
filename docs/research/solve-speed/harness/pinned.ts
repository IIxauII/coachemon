// The three fights were exported from game 1.12.0.11, and the solver refuses a save from any other version than the
// clone's (src/solver/gate.ts). From 1.12.0.11 to 1.12.1.1 the game has no session-save migrator (the newest is
// v1_12_0_0, src/system/version-migration/version-converter.ts in the 1.12.1.1 clone), so 1.12.1.1 loads such a save
// unchanged: relabelling it as the pinned version gives the input a 1.12.1.1 player's export would. Check that again
// before relabelling for a later pin.
import { PINNED_GAME_VERSION } from "../../../../src/escape-ladder/lookup.ts";

const RELABEL_FROM = "1.12.0.11";
const RELABEL_TO = "1.12.1.1";

type Exported = { save: { gameVersion: string }; liveExport?: { gameVersion: string } };

export function asPinned<T extends Exported>(exported: T): T {
  if (exported.save.gameVersion === PINNED_GAME_VERSION) return exported;
  if (exported.save.gameVersion !== RELABEL_FROM || PINNED_GAME_VERSION !== RELABEL_TO) {
    throw new Error(`no session migrator check for ${exported.save.gameVersion} → ${PINNED_GAME_VERSION}`);
  }
  const relabel = <S extends { gameVersion: string }>(s: S): S => ({ ...s, gameVersion: PINNED_GAME_VERSION });
  return { ...exported, save: relabel(exported.save), ...(exported.liveExport && { liveExport: relabel(exported.liveExport) }) };
}
