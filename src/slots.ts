/** `slot` is 0-based, but everything a refusal says names a slot by the label `select_option` accepts (#29). */

import { UiMode } from "./enums/generated.ts";

export type SlotOption = { i: number | string; label: string | null; hasData?: unknown };

export type SlotPlan<T extends SlotOption> = {
  /** Unresolved `hasData` counts as free. */
  free: string[];
  occupied: string[];
  chosen: T | undefined;
};

export const slotLabel = (o: SlotOption): string => o.label ?? `Slot ${Number(o.i) + 1}`;

export function planSlot<T extends SlotOption>(options: readonly T[], slot: number | undefined): SlotPlan<T> {
  const free = options.filter(o => o.hasData !== true);
  return {
    free: free.map(slotLabel),
    occupied: options.filter(o => o.hasData === true).map(slotLabel),
    chosen: slot === undefined ? free[0] : options.find(o => Number(o.i) === slot),
  };
}

/**
 * The switch question after a free slot is a CONFIRM too, under `CheckSwitchPhase`, and the chain can hold stale
 * entries below its top (#30, game-code.md §25).
 */
export function isOverwriteConfirm(r: { mode: number; phaseName: string | null; modeChain: readonly number[] }): boolean {
  return r.mode === UiMode.CONFIRM && r.phaseName === "SelectStarterPhase" && r.modeChain.at(-1) === UiMode.SAVE_SLOT;
}
