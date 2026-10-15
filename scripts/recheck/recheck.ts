import { readFileSync } from "node:fs";
import type { Input, ReplayResult } from "../../src/solver/oracle-line.ts";
import { type CheckResult, readScript, type Script, type SolveInput } from "../../src/solver/solver.ts";
import { printChecks } from "../battle-oracle/print.ts";

export type Given = Pick<SolveInput, "save" | "live" | "liveExport" | "cloneVersion">;

export type RecheckDeps = {
  replay(given: Given, script: Script): Promise<ReplayResult>;
  checkForks(given: Given, inputs: readonly Input[]): Promise<CheckResult>;
};

/** The real lines that matched live at every checkpoint (#660). */
const KNOWN_FIGHTS = [
  { stem: "gordie-w180", name: "Gordie W180" },
  { stem: "drayton-w188", name: "Drayton W188" },
  { stem: "kieran-w190", name: "Kieran W190" },
];

const FIXTURES = new URL("../../src/solver/fixtures/", import.meta.url);

/** `failed` names each fight that failed and how, empty when the re-check passed. Each line of `text` goes to `print` as it comes. */
export async function recheck(
  version: string,
  deps: RecheckDeps,
  print: (line: string) => void = () => {},
): Promise<{ failed: string[]; text: string }> {
  const fights = KNOWN_FIGHTS.map(({ stem, name }) => ({
    name,
    given: { ...JSON.parse(readFileSync(new URL(`${stem}.json`, FIXTURES), "utf8")), cloneVersion: version } as Given,
    script: readScript(readFileSync(new URL(`${stem}.win.script.json`, FIXTURES), "utf8")),
  }));
  const failed: string[] = [];
  const text: string[] = [];
  const say = (...lines: string[]) => {
    text.push(...lines);
    lines.forEach(line => print(line));
  };
  say(`re-check: replaying the known fights on game version ${version}`);

  for (const { name, given, script } of fights) {
    const result = await deps.replay(given, script);
    if (result.kind === "no_answer") {
      failed.push(`${name} didn't replay`);
      say(`  ${name}: no answer: ${result.message}`);
      continue;
    }
    const { outcome, steps } = result.replay;
    say(`  ${name}: replayed, ${outcome} in ${steps.at(-1)?.turn ?? 0} turns, every fact live recorded reproduced`);
  }
  if (failed.length > 0) {
    say("re-check: the fork and chained-restore checks didn't run, since a known fight didn't replay");
    return { failed, text: text.join("\n") };
  }

  say("re-check: the fork and chained-restore checks");
  for (const { name, given, script } of fights) {
    const result = await deps.checkForks(given, script.inputs);
    if (result.kind === "no_answer") {
      failed.push(`${name}'s checks got no answer`);
      say(`  ${name}: no answer: ${result.message}`);
      continue;
    }
    const { straight, fork, chain } = result.checks;
    // The checks hold every restore to the worker's own straight run, so that run must be the line the replay won.
    const end = straight.at(-1)?.end ?? "on";
    if (end !== script.known?.outcome) failed.push(`${name}'s straight run ended ${JSON.stringify(end)}, not as live did`);
    if (fork.length > 0) failed.push(`${name}'s fork check failed`);
    if (chain.length > 0) failed.push(`${name}'s chained-restore check failed`);
    say(`  ${name}`, ...printChecks(result.checks).text.split("\n").map(line => `    ${line}`));
  }
  return { failed, text: text.join("\n") };
}
