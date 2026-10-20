import { commanded, intoField, learned, mon, title } from "./describe.ts";
import type { Input, Luck, MonState, OracleLine, Step } from "./oracle-line.ts";

export type ShortOracleLine = {
  kind: "oracle_line";
  wave: number;
  turns: number;
  steps: readonly ShortStep[];
  luck: readonly Luck[];
  /** Each receipt step with `passed` or `pending`: `versions passed`. */
  receipt: readonly string[];
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

export function shortOracleLine({ wave, steps, luck, receipt }: OracleLine): ShortOracleLine {
  return {
    kind: "oracle_line",
    wave,
    turns: steps.length,
    steps: steps.map(shortStep),
    luck,
    receipt: receipt.map(r => `${r.step} ${r.pending ? "pending" : "passed"}`),
  };
}

function shortStep({ turn, input, checkpoint }: Step): ShortStep {
  const field = (side: readonly MonState[]) => side.filter(m => m.onField).map(onField);
  return { turn, ...asked(input), ours: field(checkpoint.ours), foes: field(checkpoint.foes) };
}

function asked(input: Input | null): Omit<ShortStep, "turn" | "ours" | "foes"> {
  if (input === null) return {};
  if (input.kind === "double") {
    return {
      command: input.commands.map(c => c && commanded(c)),
      ...listed("replacements", input.replacements?.map(intoField)),
      ...listed("pivots", input.pivots?.map(intoField)),
      ...listed("learns", input.learns?.map(learned)),
    };
  }
  return {
    ...(input.kind !== "queued" && { command: commanded(input) }),
    ...listed("replacements", input.replacement && [mon(input.replacement)]),
    ...listed("pivots", input.pivots?.map(mon)),
    ...listed("learns", input.learns?.map(learned)),
  };
}

const listed = <K extends string>(key: K, items: readonly string[] | undefined) => (items?.length ? { [key]: items } : {}) as Partial<Record<K, readonly string[]>>;

function onField(m: MonState): string {
  const status = m.status === "NONE" ? "" : ` ${title(m.status)}`;
  const bars = m.bossBars === undefined ? "" : ` (${m.bossBars} bars)`;
  return `${title(m.species)} ${m.hp}/${m.maxHp}${status}${bars}`;
}
