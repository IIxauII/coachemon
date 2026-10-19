// The three fights were exported from game 1.12.0.11, and the solver refuses a save from any other version than the
// clone's (src/solver/gate.ts). Up to 1.12.1.2 the game's newest session-save migrator is still v1_12_0_0
// (src/system/version-migration/version-converter.ts in the 1.12.1.2 clone), so 1.12.1.2 loads such a save unchanged:
// relabelling it as the pinned version gives the input a 1.12.1.2 player's export would. Check that again before
// relabelling for a later pin.
import { readFileSync } from "node:fs";
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

/** A fixture file, a bare save or an export, as the pinned version's export. */
export function readFight(file: string) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  return asPinned("save" in json ? json : { save: json });
}
