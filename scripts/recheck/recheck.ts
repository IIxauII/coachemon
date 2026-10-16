import { readFileSync } from "node:fs";
import type { Carry } from "../../src/solver/gate.ts";
import { andJoined } from "../../src/solver/no-answer.ts";
import type { Input, ReplayResult } from "../../src/solver/oracle-line.ts";
import { type CheckResult, readScript, type Script, type SolveInput } from "../../src/solver/solver.ts";
import { printChecks } from "../battle-oracle/print.ts";

export type Given = Pick<SolveInput, "save" | "live" | "liveExport" | "cloneVersion">;

export type RecheckDeps = {
  replay(given: Given, script: Script, carry: Carry): Promise<ReplayResult>;
  checkForks(given: Given, inputs: readonly Input[], carry: Carry): Promise<CheckResult>;
};

/** The real lines that matched live at every checkpoint (#660). */
const KNOWN_FIGHTS = [
  { stem: "gordie-w180", name: "Gordie W180" },
  { stem: "drayton-w188", name: "Drayton W188" },
  { stem: "kieran-w190", name: "Kieran W190" },
];

const FIXTURES = new URL("../../src/solver/fixtures/", import.meta.url);

/** The replays a new version's own rules can fail. Any other failure would fail a fight recorded on it too. */
const PLAYED_OTHERWISE: ReadonlySet<string> = new Set(["scene_mismatch", "illegal_step", "known_turn_missed"]);

/** The names of the carried fights, by the game version each was recorded on. */
function carriedFrom(fights: readonly { name: string; given: Given; carry: Carry }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { name, given, carry } of fights) {
    if (carry.carried) out.set(given.save.gameVersion, [...(out.get(given.save.gameVersion) ?? []), name]);
  }
  return out;
}

/** `failed` names each fight that failed and how, empty when the re-check passed. Each line of `text` goes to `print` as it comes. */
export async function recheck(
  version: string,
  deps: RecheckDeps,
  print: (line: string) => void = () => {},
): Promise<{ failed: string[]; text: string }> {
  const fights = KNOWN_FIGHTS.map(({ stem, name }) => {
    const given = { ...JSON.parse(readFileSync(new URL(`${stem}.json`, FIXTURES), "utf8")), cloneVersion: version } as Given;
    return {
      name,
      given,
      script: readScript(readFileSync(new URL(`${stem}.win.script.json`, FIXTURES), "utf8")),
      carry: { carried: given.save.gameVersion !== version },
    };
  });
  const failed: string[] = [];
  const text: string[] = [];
  const say = (...lines: string[]) => {
    text.push(...lines);
    lines.forEach(line => print(line));
  };
  say(`re-check: replaying the known fights on game version ${version}`);
  for (const [from, names] of carriedFrom(fights)) {
    say(`re-check: carrying the ${from} saves of ${andJoined(names)} to ${version}`);
  }

  const playedOtherwise: typeof fights = [];
  for (const fight of fights) {
    const { name, given, script, carry } = fight;
    const result = await deps.replay(given, script, carry);
    if (result.kind === "no_answer") {
      failed.push(`${name} didn't replay`);
      say(`  ${name}: no answer: ${result.message}`);
      if (PLAYED_OTHERWISE.has(result.reason.code)) playedOtherwise.push(fight);
      continue;
    }
    const { outcome, steps } = result.replay;
    say(`  ${name}: replayed, ${outcome} in ${steps.at(-1)?.turn ?? 0} turns, every fact live recorded reproduced`);
  }
  if (failed.length > 0) {
    say("re-check: the fork and chained-restore checks didn't run, since a known fight didn't replay");
    for (const [from, names] of carriedFrom(playedOtherwise)) {
      const how = `on ${version}: "Record a known fight again" in docs/runbooks/pin-bump.md.`;
      say(
        names.length === 1
          ? `re-check: ${names[0]} was recorded on ${from}. Where ${version} changed its line, record a fight in its place ${how}`
          : `re-check: ${andJoined(names)} were recorded on ${from}. Where ${version} changed their lines, record fights ` +
              `in their place ${how}`,
      );
    }
    return { failed, text: text.join("\n") };
  }

  say("re-check: the fork and chained-restore checks");
  for (const { name, given, script, carry } of fights) {
    const result = await deps.checkForks(given, script.inputs, carry);
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
