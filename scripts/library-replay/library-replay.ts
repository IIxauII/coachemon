/** Replays the fight library's oracle lines on the current code, and only reports: nothing it finds fails a run (#939). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Carry } from "../../src/solver/gate.ts";
import { cause, newerVersion } from "../../src/solver/no-answer.ts";
import type { Reason, ReplayResult } from "../../src/solver/oracle-line.ts";
import { readScript, type Script, WIN_SCRIPT } from "../../src/solver/script.ts";
import type { SolveInput } from "../../src/solver/solver.ts";

export const LIBRARY = new URL("../../src/solver/fixtures/library/", import.meta.url);

export type Given = Pick<SolveInput, "save" | "extras" | "live" | "liveExport" | "cloneVersion">;

export type Replay = (given: Given, script: Script, carry: Carry) => Promise<ReplayResult>;

/** `checkpoint` is the turn whose checkpoint was missed first, null where the line strayed otherwise. */
export type Outcome =
  | { kind: "still_wins"; turns: number }
  | { kind: "plays_differently"; checkpoint: number | null; missed: string }
  | { kind: "doesnt_load"; why: string };

export type OracleLineReplay = { fight: string; turn: number; outcome: Outcome };

/** `stem` is a fight folder's `turn-<n>`: what that solve started from, and the oracle line it found. */
export const replayOracleLine = (stem: string, version: string, replay: Replay): Promise<Outcome> =>
  replayRead(readOracleLine(stem, version), version, replay);

async function replayRead(read: Read, version: string, replay: Replay): Promise<Outcome> {
  if ("why" in read) return { kind: "doesnt_load", why: read.why };
  const { given, script } = read;
  const result = await replay(given, script, carryTo(given, version));
  if (result.kind === "replayed") return { kind: "still_wins", turns: result.replay.steps.at(-1)?.turn ?? 0 };
  const { reason } = result;
  const onThePin = given.save.gameVersion === version;
  if (PLAYED_OTHERWISE.has(reason.code) || (onThePin && !THE_CLONES.has(reason.code))) return differently(reason);
  return { kind: "doesnt_load", why: causeOf(reason) };
}

export const carryTo = (given: Given, version: string): Carry => ({ carried: newerVersion(version, given.save.gameVersion) });

/** The replays that loaded the fight and then played it otherwise than its oracle line. */
const PLAYED_OTHERWISE: ReadonlySet<Reason["code"]> = new Set(["known_turn_missed", "illegal_step"]);

/** A save already on the pin that fails to replay is a regression, unless the clone at the pin is what failed. */
const THE_CLONES: ReadonlySet<Reason["code"]> = new Set(["no_clone", "clone_version", "version_mismatch", "not_rechecked"]);

const causeOf = (reason: Reason) => cause(reason).replace(/\.$/, "");

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Read = { given: Given; script: Script } | { why: string };

/** `file` is a fight folder's `turn-<n>.json`, what one solve started from. */
export function readSolveStart(file: string): SolveInput | { why: string } {
  try {
    const kept = JSON.parse(readFileSync(file, "utf8")) as SolveInput;
    return typeof kept?.save?.gameVersion === "string" ? kept : { why: `${path.basename(file)} holds no save` };
  } catch (e) {
    return { why: `${path.basename(file)} doesn't read: ${messageOf(e)}` };
  }
}

function readOracleLine(stem: string, version: string): Read {
  const name = path.basename(stem);
  const kept = readSolveStart(`${stem}.json`);
  if ("why" in kept) return kept;
  const given: Given = { ...kept, cloneVersion: version };
  try {
    return { given, script: readScript(readFileSync(`${stem}${WIN_SCRIPT}`, "utf8")) };
  } catch (e) {
    return { why: `${name}${WIN_SCRIPT} doesn't read as a script: ${messageOf(e)}` };
  }
}

const AT_TURN = /^turn (\d+): /;

function differently(reason: Reason): Outcome {
  if (reason.code !== "known_turn_missed") {
    return { kind: "plays_differently", checkpoint: null, missed: causeOf(reason) };
  }
  const first = reason.misses.map(miss => AT_TURN.exec(miss)?.[1]).find(turn => turn !== undefined);
  if (first === undefined) return { kind: "plays_differently", checkpoint: null, missed: reason.misses.join("; ") };
  const at = `turn ${first}: `;
  const missed = reason.misses.filter(miss => miss.startsWith(at)).map(miss => miss.slice(at.length));
  return { kind: "plays_differently", checkpoint: Number(first), missed: missed.join("; ") };
}

export const described = (outcome: Outcome, version: string): string => {
  switch (outcome.kind) {
    case "still_wins":
      return `still wins, won in ${outcome.turns} turns`;
    case "plays_differently":
      return outcome.checkpoint === null
        ? `plays differently: ${outcome.missed}`
        : `plays differently from the checkpoint after turn ${outcome.checkpoint}: ${outcome.missed}`;
    case "doesnt_load":
      return `doesn't load on ${version}, skipped: ${outcome.why}`;
  }
};

const WON = /^turn-(\d+)\.win\.script\.json$/;

/** Each solve in a fight folder that found an oracle line, by the turn it started from. */
function wonTurns(fight: string): number[] {
  return readdirSync(fight)
    .flatMap(file => {
      const turn = WON.exec(file)?.[1];
      return turn === undefined ? [] : [Number(turn)];
    })
    .sort((a, b) => a - b);
}

/** A fight is selected when it is any of `fights`, by its folder or its fight's name, and on any of `waves`; unset keeps all. */
export type Filter = { fights?: readonly string[]; waves?: readonly number[] };

/** The recorder's `<seed>-w<wave>-<fight>`. */
const FIGHT = /^.+-w(\d+)-([a-z0-9-]+)$/;

function selected(fight: string, { fights, waves }: Filter): boolean {
  const [, wave, name] = FIGHT.exec(fight) ?? [];
  if (fights?.length && !fights.some(f => f === fight || f === name)) return false;
  return !waves?.length || waves.includes(Number(wave));
}

/** The fight folders in `folder` that `filter` selects, in name order. */
export const fightFolders = (folder: string, filter: Filter): string[] =>
  readdirSync(folder)
    .sort()
    .filter(fight => selected(fight, filter) && statSync(path.join(folder, fight)).isDirectory());

/** Every oracle line in `folder`, a folder of fight folders, replayed on `version`. Each line of `text` goes to `print` as it comes. */
export async function replayLibrary(
  folder: string,
  version: string,
  replay: Replay,
  print: (line: string) => void = () => {},
  filter: Filter = {},
): Promise<{ oracleLines: OracleLineReplay[]; text: string }> {
  const found = fightFolders(folder, filter).flatMap(fight =>
    wonTurns(path.join(folder, fight)).map(turn => ({ fight, turn, read: readOracleLine(path.join(folder, fight, `turn-${turn}`), version) })),
  );
  const text: string[] = [];
  const say = (line: string) => {
    text.push(line);
    print(line);
  };
  say(`library replay: replaying ${found.length} oracle line${found.length === 1 ? "" : "s"} in ${folder} on game version ${version}`);
  const carried = new Map<string, number>();
  for (const { read } of found) {
    if (!("given" in read) || !carryTo(read.given, version).carried) continue;
    const from = read.given.save.gameVersion;
    carried.set(from, (carried.get(from) ?? 0) + 1);
  }
  for (const [from, n] of carried) say(`library replay: carrying the ${from} saves of ${n} oracle line${n === 1 ? "" : "s"} to ${version}`);

  const oracleLines: OracleLineReplay[] = [];
  for (const { fight, turn, read } of found) {
    const outcome = await replayRead(read, version, replay);
    oracleLines.push({ fight, turn, outcome });
    say(`  ${fight} turn ${turn}: ${described(outcome, version)}`);
  }
  const count = (kind: Outcome["kind"]) => oracleLines.filter(l => l.outcome.kind === kind).length;
  say(
    `library replay: still wins: ${count("still_wins")}, plays differently: ${count("plays_differently")}, ` +
      `doesn't load: ${count("doesnt_load")} (skipped)`,
  );
  return { oracleLines, text: text.join("\n") };
}
