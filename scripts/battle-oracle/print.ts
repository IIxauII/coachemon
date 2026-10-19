import { describeInput, STAGES, title } from "../../src/solver/describe.ts";
import { NO_LUCK } from "../../src/solver/luck.ts";
import type { Checks, Miss } from "../../src/solver/worker.ts";
import type { Luck, MonState, OracleLine, Receipt, Replay, Step } from "../../src/solver/oracle-line.ts";

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

// Our field slots are the party's first two (game-code.md §34).
const fieldBefore = (steps: readonly Step[], i: number) => steps[i - 1]?.checkpoint.ours.slice(0, 2).map(m => (m.onField ? m : undefined));

const turns = (steps: readonly Step[]) =>
  steps.flatMap(({ turn, input, checkpoint }, i) => [
    `T${turn}`.padEnd(4) + (input === null ? "(no input)" : describeInput(input, fieldBefore(steps, i))),
    `    ours  ${checkpoint.ours.map(mon).join(" · ")}`,
    `    foes  ${checkpoint.foes.map(mon).join(" · ")}`,
  ]);

const receipted = (receipt: Receipt) => [
  "receipt",
  ...receipt.map(({ step, checked, pending }) => `    ${step}${pending ? " (pending)" : ""}: ${checked}`),
];

const luckLines = (luck: readonly Luck[]) =>
  luck.length === 0
    ? [`luck: rides none: ${NO_LUCK}`]
    : [`luck: rides ${luck.length} draw${luck.length === 1 ? "" : "s"}`, ...luck.map(({ turn, what }) => `    ${`T${turn}`.padEnd(4)}${what}`)];

export function printReplay({ outcome, steps, luck, receipt }: Replay): string {
  return [`replayed: ${outcome} in ${steps.at(-1)?.turn ?? 0} turns`, ...turns(steps), ...luckLines(luck), ...receipted(receipt)].join(
    "\n",
  );
}

export function printOracleLine({ steps, luck, receipt }: OracleLine): string {
  const ours = steps.at(-1)?.checkpoint.ours ?? [];
  const left = ours.filter(m => m.hp > 0).length;
  return [
    `oracle line: wins in ${steps.at(-1)?.turn ?? 0} turns with ${left} of ${ours.length} left`,
    ...turns(steps),
    ...luckLines(luck),
    ...receipted(receipt),
  ].join("\n");
}

const missed = ({ from, turn, want, got }: Miss) => {
  const off = [...want.checkpoint.ours, ...want.checkpoint.foes].flatMap(w => {
    const g = [...got.checkpoint.ours, ...got.checkpoint.foes].find(m => m.species === w.species && m.slot === w.slot);
    return JSON.stringify(g) === JSON.stringify(w) ? [] : [`${g ? mon(g) : `no ${title(w.species)}`}, straight ${mon(w)}`];
  });
  const end = JSON.stringify(want.end) === JSON.stringify(got.end) ? [] : [`ended ${JSON.stringify(got.end)}, straight ${JSON.stringify(want.end)}`];
  return `restored at T${from}, T${turn} played otherwise: ${[...end, ...off].join("; ")}`;
};

export function printChecks({ straight, fork, chain }: Checks): { passed: boolean; text: string } {
  const forks = Math.max(straight.length - 1, 0);
  const forkFrom = new Set(fork.map(m => m.from));
  return {
    passed: fork.length === 0 && chain.length === 0,
    text: [
      `straight: ${straight.length} turns, ended ${JSON.stringify(straight.at(-1)?.end ?? "on")}`,
      `fork check: ${forks - forkFrom.size} of ${forks} restores played the rest the same`,
      ...fork.map(m => `    ${missed(m)}`),
      `chained-restore check: ${chain.length === 0 ? `all ${straight.length} turns` : "a turn"} played the same chained`,
      ...chain.map(m => `    ${missed(m)}`),
    ].join("\n"),
  };
}
