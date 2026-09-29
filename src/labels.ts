/** Label matching for `select_option`: exact after normalising, never fuzzy (v1-tool-surface.md §6.3). */

export function normalizeLabel(label: string | null | undefined): string {
  return (label ?? "")
    .replace(/\[\/?[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export type Match<T> = { kind: "one"; option: T } | { kind: "none" } | { kind: "many"; options: T[] };

export type Labelled = { label: string | null; name?: string | null };

/** (CONTEXT.md, `Option`) */
export function optionAnswersTo(option: Labelled, label: string): boolean {
  const wanted = normalizeLabel(label);
  return [option.label, option.name].some(l => typeof l === "string" && normalizeLabel(l) === wanted);
}

export function matchLabel<T extends Labelled>(options: readonly T[], label: string): Match<T> {
  const hits = options.filter(o => optionAnswersTo(o, label));
  if (hits.length === 1) return { kind: "one", option: hits[0] };
  if (hits.length === 0) return { kind: "none" };
  return { kind: "many", options: hits };
}
