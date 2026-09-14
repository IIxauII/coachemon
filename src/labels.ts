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

/**
 * Whether `label` names `option`: its label, or its `name` where the label decorates one (`Great Ball ×9`, #46).
 */
export function labelMatches(option: { label: string | null; name?: unknown }, label: string): boolean {
  const wanted = normalizeLabel(label);
  return [option.label, option.name].some(l => typeof l === "string" && normalizeLabel(l) === wanted);
}

export function matchLabel<T extends { label: string | null; name?: unknown }>(options: readonly T[], label: string): Match<T> {
  const hits = options.filter(o => labelMatches(o, label));
  if (hits.length === 1) return { kind: "one", option: hits[0] };
  if (hits.length === 0) return { kind: "none" };
  return { kind: "many", options: hits };
}
