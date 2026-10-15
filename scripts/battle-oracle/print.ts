import { describeInput, title } from "../../src/solver/describe.ts";
import type { MonState, Replay } from "../../src/solver/oracle-line.ts";

const STAGES = ["Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];

const mon = (m: MonState) =>
  [
    `${title(m.species)}${m.onField ? "*" : ""} ${m.hp}/${m.maxHp}`,
    m.status === "NONE" ? "" : title(m.status),
    m.tera ? "Tera" : "",
    ...m.statStages.map((stage, i) => (stage === 0 ? "" : `${STAGES[i]}${stage > 0 ? "+" : ""}${stage}`)),
    m.bossBars === undefined ? "" : `${m.bossBars} bar${m.bossBars === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" ");

export function printReplay({ outcome, steps, receipt }: Replay): string {
  return [
    `replayed: ${outcome} in ${steps.at(-1)?.turn ?? 0} turns`,
    ...steps.flatMap(({ turn, input, checkpoint }) => [
      `T${turn}`.padEnd(4) + (input === null ? "(no input)" : describeInput(input)),
      `    ours  ${checkpoint.ours.map(mon).join(" · ")}`,
      `    foes  ${checkpoint.foes.map(mon).join(" · ")}`,
    ]),
    "receipt",
    ...receipt.map(({ step, checked }) => `    ${step}: ${checked}`),
  ].join("\n");
}
