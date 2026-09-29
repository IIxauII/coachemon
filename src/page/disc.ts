import type { Page } from "./locate.ts";

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
 * `h` may be null. `probe` and `menu` both read through this, as `L.disc`, so the two cannot disagree (#133).
 * Self-contained (extension-distribution.md §10.5).
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
