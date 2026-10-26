/** Replays the fight library's oracle lines on the current code, and only reports: nothing it finds fails a run (#939). */
import path from "node:path";
import { type Filter, type SolveStart, solveStartsIn } from "../../src/solver/fight-library.ts";
import type { Carry } from "../../src/solver/gate.ts";
import { cause, newerVersion } from "../../src/solver/no-answer.ts";
import type { Reason, ReplayResult } from "../../src/solver/oracle-line.ts";
import type { Script } from "../../src/solver/script.ts";
import type { SolveInput } from "../../src/solver/solver.ts";

export type { Filter };

export const LIBRARY = new URL("../../src/solver/fixtures/library/", import.meta.url);

export type Given = Pick<SolveInput, "save" | "extras" | "live" | "liveExport" | "cloneVersion">;

export type Replay = (given: Given, script: Script, carry: Carry) => Promise<ReplayResult>;

/** `checkpoint` is the turn whose checkpoint was missed first, null where the line strayed otherwise. */
export type Outcome =
  | { kind: "still_wins"; turns: number }
  | { kind: "plays_differently"; checkpoint: number | null; missed: string }
  | { kind: "doesnt_load"; why: string };

export type OracleLineReplay = { fight: string; turn: number; outcome: Outcome };

export const replayOracleLine = (start: SolveStart, version: string, replay: Replay): Promise<Outcome> =>
  replayRead(readOracleLine(start, version), version, replay);

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

function readOracleLine({ input, oracleLine, files }: SolveStart, version: string): Read {
  if ("why" in input) return input;
  if (oracleLine === null) return { why: `${path.basename(files.oracleLine)} is missing` };
  if ("why" in oracleLine) return oracleLine;
  return { given: { ...input, cloneVersion: version }, script: oracleLine };
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

/** Every oracle line in `folder`, a folder of fight folders, replayed on `version`. Each line of `text` goes to `print` as it comes. */
export async function replayLibrary(
  folder: string,
  version: string,
  replay: Replay,
  print: (line: string) => void = () => {},
  filter: Filter = {},
): Promise<{ oracleLines: OracleLineReplay[]; text: string }> {
  const found = solveStartsIn({ library: folder }, filter)
    .filter(start => start.oracleLine !== null)
    .map(start => ({ fight: start.fight.folder, turn: start.turn, read: readOracleLine(start, version) }));
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
