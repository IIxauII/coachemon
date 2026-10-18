import type { Input, LearnPick, PartySlot } from "./oracle-line.ts";

export const title = (key: string) =>
  key
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const STAGES = ["Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];

const mon = ({ slot, species }: PartySlot) => `${title(species)} (slot ${slot})`;

const learned = ({ move, forget, ...at }: LearnPick) =>
  forget === null ? `${mon(at)} declines ${title(move)}` : `${mon(at)} forgets ${title(forget)} for ${title(move)}`;

/** In the order the turn asks: the command, each learn pick, then the faint replacement. */
export function describeInput(input: Input): string {
  const act =
    input.kind === "move" ? `${input.tera ? "Tera + " : ""}${title(input.move)}`
    : input.kind === "switch" ? `switch → ${mon(input.to)}`
    : "played for us";
  const replacement = input.replacement ? [`replacement ${mon(input.replacement)}`] : [];
  return [act, ...(input.learns ?? []).map(learned), ...replacement].join(", ");
}
