/** Composite screen id (v1-tool-surface.md §4). Only the game adapter computes it; every read carries its Screen. */
import { NAMES, SaveSlotUiMode, SummaryUiMode, UiMode } from "./enums/generated.ts";
import type { Discriminators } from "./page/disc.ts";

export type { Discriminators };

export function modeName(mode: number): string | null {
  return NAMES.UiMode[mode] ?? null;
}

export function screenId(mode: number, d: Discriminators): string {
  const name = modeName(mode);
  if (name === null) return `UNKNOWN(${mode})`;
  switch (mode) {
    case UiMode.PARTY: {
      const sub = d.partyUiMode === null ? null : (NAMES.PartyUiMode[d.partyUiMode] ?? null);
      const head = sub === null ? name : `${name}/${sub}`;
      return d.optionsMode ? `${head}:options` : head;
    }
    case UiMode.SAVE_SLOT:
      if (d.saveSlotUiMode === SaveSlotUiMode.SAVE) return `${name}/SAVE`;
      if (d.saveSlotUiMode === SaveSlotUiMode.LOAD) return `${name}/LOAD`;
      return name;
    case UiMode.SUMMARY:
      return d.summaryUiMode === SummaryUiMode.LEARN_MOVE ? `${name}/LEARN_MOVE` : name;
    case UiMode.ALERT_MODAL:
      return d.alertClosable ? `${name}/CLOSABLE` : name;
    case UiMode.STARTER_SELECT:
      return d.filterMode ? `${name}/FILTER` : name;
    default:
      return name;
  }
}

/** Six settings carry `requireReload`, and the reload fires on leaving Settings (#11, v1-tool-surface.md §6.5). */
export function isSettingsMode(mode: number): boolean {
  return mode >= UiMode.SETTINGS && mode <= UiMode.KEYBOARD_BINDING;
}
