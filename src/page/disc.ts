import type { Page } from "./locate.ts";

/** The Screen's discriminators off the current handler: the adapter turns them into the Screen id (#133). */
export type Discriminators = {
  partyUiMode: number | null;
  optionsMode: boolean;
  saveSlotUiMode: number | null;
  summaryUiMode: number | null;
  alertClosable: boolean;
  filterMode: boolean;
  transferMode: boolean;
};

/**
 * The discriminators off handler `h`, which may be null. One function for `probe` and `menu`, handed to both through
 * `L`, so the two reads cannot read them differently (#133). Self-contained (§10.5).
 */
export function disc(h: Page): Discriminators {
  return {
    partyUiMode: h && typeof h.partyUiMode === "number" ? h.partyUiMode : null,
    optionsMode: h ? h.optionsMode === true : false,
    saveSlotUiMode: h && typeof h.uiMode === "number" ? h.uiMode : null,
    summaryUiMode: h && typeof h.summaryUiMode === "number" ? h.summaryUiMode : null,
    alertClosable: h ? h.allowClosing === true : false,
    filterMode: h ? h.filterMode === true : false,
    transferMode: h ? h.transferMode === true : false,
  };
}
