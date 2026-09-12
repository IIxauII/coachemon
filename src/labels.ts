/**
 * Label matching for `select_option` (#7 §6.3): normalise both sides, then
 * match exactly. No fuzzy matching — on a screen where `Apply` and `Cancel`
 * are one keystroke apart and one of them can end a run, a confident wrong
 * match is the worst available failure.
 */

/** Strip BBCode (`[shadow]Apply[/shadow]` is real, #6), trim, collapse whitespace, case-fold. */
export function normalizeLabel(label: string | null | undefined): string {
  return (label ?? "")
    .replace(/\[\/?[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export type Match<T> = { kind: "one"; option: T } | { kind: "none" } | { kind: "many"; options: T[] };

export function matchLabel<T extends { label: string | null }>(options: readonly T[], label: string): Match<T> {
  const wanted = normalizeLabel(label);
  const hits = options.filter(o => o.label !== null && normalizeLabel(o.label) === wanted);
  if (hits.length === 1) return { kind: "one", option: hits[0] };
  if (hits.length === 0) return { kind: "none" };
  return { kind: "many", options: hits };
}
