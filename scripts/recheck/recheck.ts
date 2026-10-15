/** The harness re-check the pin bump's stamp runs (#665): the known fights replayed, then the fork and chained-restore checks. */
import { readFileSync } from "node:fs";
import type { Input, NoAnswer, ReplayResult } from "../../src/solver/oracle-line.ts";
import { type Checks, readScript, type Script, type SolveInput } from "../../src/solver/solver.ts";
import { printChecks } from "../battle-oracle/print.ts";

type Given = Pick<SolveInput, "save" | "live" | "liveExport" | "cloneVersion">;

export type CheckResult = { kind: "checked"; checks: Checks } | NoAnswer;

export type RecheckDeps = {
  replay(given: Given, script: Script): Promise<ReplayResult>;
  checkForks(given: Given, inputs: readonly Input[]): Promise<CheckResult>;
};

/** The real lines that matched live at every checkpoint (#660), each a fixture and its `.win.script.json`. */
const KNOWN_FIGHTS = ["gordie-w180", "drayton-w188", "kieran-w190"];

const FIXTURES = new URL("../../src/solver/fixtures/", import.meta.url);

const titled = (stem: string) => stem.replace(/^(\w)(\w*)-w(\d+)$/, (_, first, rest, wave) => `${first.toUpperCase()}${rest} W${wave}`);

/** `failed` names each fight that failed and how, empty when the re-check passed. Each line of `text` goes to `print` as it comes. */
export async function recheck(
  version: string,
  deps: RecheckDeps,
  print: (line: string) => void = () => {},
): Promise<{ failed: string[]; text: string }> {
  const fights = KNOWN_FIGHTS.map(stem => ({
    name: titled(stem),
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
      failed.push(`${name}'s fork or chained-restore check failed`);
      say(`  ${name}: no answer: ${result.message}`);
      continue;
    }
    const checked = printChecks(result.checks);
    if (!checked.passed) failed.push(`${name}'s fork or chained-restore check failed`);
    say(`  ${name}`, ...checked.text.split("\n").map(line => `    ${line}`));
  }
  return { failed, text: text.join("\n") };
}
