/**
 * Save-slot choice for `start_run` (#29). The `slot` argument is a 0-based
 * index, but everything a refusal tells the caller names slots by the label
 * `select_option` accepts ("Slot 1".."Slot 5"), so the message, the free and
 * occupied lists and the `next` hint cannot disagree about which slot is meant.
 */

export type SlotOption = { i: number | string; label: string | null; hasData?: unknown };

export type SlotPlan<T extends SlotOption> = {
  /** Labels of slots without a saved run (unresolved `hasData` counts as free, as the screen allows it). */
  free: string[];
  occupied: string[];
  /** The slot to press: `slot` if given, else the lowest free one. Undefined when none qualifies. */
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
