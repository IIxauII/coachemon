import type { FieldCommand, FieldReplacement, Input, LearnPick, Luck, MonState, NoAnswer, PartySlot, SolveResult, Step, ValidationStep } from "./oracle-line.ts";

/** What `read_job` answers for a solve unless asked for the full oracle line (#818). */
export type ShortSolveResult = ShortOracleLine | NoAnswer;

export type ShortOracleLine = {
  kind: "oracle_line";
  wave: number;
  turns: number;
  steps: readonly ShortStep[];
  luck: readonly Luck[];
  receipt: Partial<Record<ValidationStep, "passed" | "pending">>;
};

/**
 * `command` is absent on a turn that takes none, and in a double holds one per field slot, null where that slot is asked
 * nothing. `ours` and `foes` are the mons on the field once the turn has played.
 */
export type ShortStep = {
  turn: number;
  command?: string | readonly (string | null)[];
  replacements?: readonly string[];
  pivots?: readonly string[];
  learns?: readonly string[];
  ours: readonly string[];
  foes: readonly string[];
};

export function shortSolveResult(result: SolveResult): ShortSolveResult {
  if (result.kind !== "oracle_line") return result;
  const { wave, steps, luck, receipt } = result.oracleLine;
  return {
    kind: "oracle_line",
    wave,
    turns: steps.length,
    steps: steps.map(shortStep),
    luck,
    receipt: Object.fromEntries(receipt.map(r => [r.step, r.pending ? "pending" : "passed"])),
  };
}

function shortStep({ turn, input, checkpoint }: Step): ShortStep {
  const field = (side: readonly MonState[]) => side.filter(m => m.onField).map(mon);
  return { turn, ...asked(input), ours: field(checkpoint.ours), foes: field(checkpoint.foes) };
}

function asked(input: Input | null): Omit<ShortStep, "turn" | "ours" | "foes"> {
  if (input === null) return {};
  if (input.kind === "double") {
    return {
      command: input.commands.map(c => c && fieldCommand(c)),
      ...listed("replacements", input.replacements?.map(intoField)),
      ...listed("pivots", input.pivots?.map(intoField)),
      ...listed("learns", input.learns?.map(learn)),
    };
  }
  return {
    ...(input.kind !== "queued" && { command: fieldCommand(input) }),
    ...listed("replacements", input.replacement && [party(input.replacement)]),
    ...listed("pivots", input.pivots?.map(party)),
    ...listed("learns", input.learns?.map(learn)),
  };
}

const listed = <K extends string>(key: K, items: readonly string[] | undefined) => (items?.length ? { [key]: items } : {}) as Partial<Record<K, readonly string[]>>;

function fieldCommand(c: FieldCommand): string {
  if (c.kind === "switch") return `switch to ${party(c.to)}`;
  const move = c.tera ? `Tera ${c.move}` : c.move;
  return c.target ? `${move} → ${c.target.side === "foes" ? "foe" : "our"} field ${c.target.field}` : move;
}

const party = (p: PartySlot) => `${p.species} (slot ${p.slot})`;

const intoField = (r: FieldReplacement) => `${party(r)} to field ${r.field}`;

const learn = (l: LearnPick) => (l.forget === null ? `${party(l)} declines ${l.move}` : `${party(l)} learns ${l.move} over ${l.forget}`);

function mon(m: MonState): string {
  const status = m.status === "NONE" ? "" : ` ${m.status}`;
  const bars = m.bossBars === undefined ? "" : ` (${m.bossBars} bars)`;
  return `${m.species} ${m.hp}/${m.maxHp}${status}${bars}`;
}
