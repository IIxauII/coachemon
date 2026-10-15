import { MoveId, SpeciesId, StatusEffect } from "../enums/generated.ts";
import type { PageOracleLine } from "../page/oracle-line.ts";
import type { Input, MonState, OracleLine, PartySlot } from "../solver/solver.ts";

type PageStep = PageOracleLine["steps"][number];

const slot = (p: PartySlot) => ({ ...p, species: SpeciesId[p.species] });

const mon = (m: MonState) => ({ ...m, species: SpeciesId[m.species], status: StatusEffect[m.status] });

function input({ replacement, ...i }: Input): NonNullable<PageStep["input"]> {
  const ids = i.kind === "move" ? { ...i, move: MoveId[i.move] } : { ...i, to: slot(i.to) };
  return replacement === undefined ? ids : { ...ids, replacement: slot(replacement) };
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
