/**
 * Composite screen id (#7 §4): `ui.mode` alone does not identify a screen.
 * `PARTY(8)` is fourteen screens told apart by `partyUiMode`, each with a
 * different meaning and escape; `SAVE_SLOT`, `SUMMARY` and `ALERT_MODAL`
 * carry their own discriminators. The id is what Claude reasons about and the
 * key the escape ladder answers to.
 */
import { NAMES, SaveSlotUiMode, SummaryUiMode, UiMode } from "./enums/generated.ts";

export type Discriminators = {
  partyUiMode: number | null;
  optionsMode: boolean;
  saveSlotUiMode: number | null;
  summaryUiMode: number | null;
  alertClosable: boolean;
  filterMode: boolean;
  transferMode: boolean;
};

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
    default:
      return name;
  }
}

/** Six settings modes carry `requireReload`, and the reload fires on leaving Settings (#11). Acting tools refuse here. */
export function isSettingsMode(mode: number): boolean {
  return mode >= UiMode.SETTINGS && mode <= UiMode.KEYBOARD_BINDING;
}
