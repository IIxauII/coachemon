import type { FieldCommand, FieldReplacement, Input, LearnPick, PartySlot } from "./oracle-line.ts";

export const title = (key: string) =>
  key
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const STAGES = ["Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];

export const mon = ({ slot, species }: PartySlot) => `${title(species)} (slot ${slot})`;

export const intoField = (r: FieldReplacement) => `${mon(r)} into field ${r.field}`;

export const learned = ({ move, forget, ...at }: LearnPick) =>
  forget === null ? `${mon(at)} declines ${title(move)}` : `${mon(at)} forgets ${title(forget)} for ${title(move)}`;

export const commanded = (c: FieldCommand) => {
  if (c.kind === "switch") return `switch → ${mon(c.to)}`;
  const target = c.target ? ` → ${c.target.side === "foes" ? "foe" : "our"} field ${c.target.field}` : "";
  return `${c.tera ? "Tera + " : ""}${title(c.move)}${target}`;
};

/**
 * The command, each pivot, each learn pick, then the faint replacements. `field` is who stands in each field slot as the
 * turn starts, where the caller knows it: a double's commands name their mon by it.
 */
export function describeInput(input: Input, field: readonly (PartySlot | undefined)[] = []): string {
  if (input.kind === "double") {
    const acts = input.commands.flatMap((c, i) => (c ? [`${field[i] ? title(field[i].species) : `field ${i}`}: ${commanded(c)}`] : []));
    const replacements = (input.replacements ?? []).map(r => `replacement ${intoField(r)}`);
    const pivots = (input.pivots ?? []).map(p => `pivot ${intoField(p)}`);
    return [acts.length > 0 ? acts.join(" · ") : "played for us", ...pivots, ...(input.learns ?? []).map(learned), ...replacements].join(", ");
  }
  const act =
    input.kind === "move" ? `${input.tera ? "Tera + " : ""}${title(input.move)}`
    : input.kind === "switch" ? `switch → ${mon(input.to)}`
    : "played for us";
  const replacement = input.replacement ? [`replacement ${mon(input.replacement)}`] : [];
  return [act, ...(input.pivots ?? []).map(p => `pivot ${mon(p)}`), ...(input.learns ?? []).map(learned), ...replacement].join(", ");
}
