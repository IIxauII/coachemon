import type { Input, PartySlot } from "./oracle-line.ts";

export const title = (key: string) =>
  key
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const mon = ({ slot, species }: PartySlot) => `${title(species)} (slot ${slot})`;

export function describeInput(input: Input): string {
  const act = input.kind === "move" ? `${input.tera ? "Tera + " : ""}${title(input.move)}` : `switch → ${mon(input.to)}`;
  return input.replacement ? `${act}, replacement ${mon(input.replacement)}` : act;
}
