import { MoveId, SpeciesId, StatusEffect } from "../enums/generated.ts";
import type { PageOracleLine } from "../page/oracle-line.ts";
import type { FieldCommand, Input, LearnPick, MonState, OracleLine, PartySlot } from "../solver/solver.ts";

type PageStep = PageOracleLine["steps"][number];

const slot = <P extends PartySlot>(p: P) => ({ ...p, species: SpeciesId[p.species] });

const mon = (m: MonState) => ({ ...m, species: SpeciesId[m.species], status: StatusEffect[m.status] });

const pick = (l: LearnPick) => ({
  ...l,
  species: SpeciesId[l.species],
  move: MoveId[l.move],
  forget: l.forget === null ? null : MoveId[l.forget],
});

const command = (c: FieldCommand | null) =>
  c === null ? null : c.kind === "move" ? { ...c, move: MoveId[c.move] } : { ...c, to: slot(c.to) };

function input(i: Input): NonNullable<PageStep["input"]> {
  if (i.kind === "double") {
    const { replacements, learns, pivots, commands } = i;
    return {
      kind: "double",
      commands: [command(commands[0]), command(commands[1])],
      ...(pivots !== undefined && { pivots: pivots.map(slot) }),
      ...(replacements !== undefined && { replacements: replacements.map(slot) }),
      ...(learns !== undefined && { learns: learns.map(pick) }),
    };
  }
  const { replacement, learns, pivots, ...rest } = i;
  const ids =
    rest.kind === "move" ? { ...rest, move: MoveId[rest.move] }
    : rest.kind === "switch" ? { ...rest, to: slot(rest.to) }
    : rest;
  return {
    ...ids,
    ...(pivots !== undefined && { pivots: pivots.map(slot) }),
    ...(learns !== undefined && { learns: learns.map(pick) }),
    ...(replacement !== undefined && { replacement: slot(replacement) }),
  };
}

export function pageOracleLine(line: OracleLine): PageOracleLine {
  return {
    ...line,
    steps: line.steps.map(st => ({
      ...st,
      input: st.input && input(st.input),
      checkpoint: { ours: st.checkpoint.ours.map(mon), foes: st.checkpoint.foes.map(mon) },
    })),
  };
}
