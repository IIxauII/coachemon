/** The solver a player's plugin runs. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import {
  type Clone,
  DEFAULT_BUDGET,
  type ReplayResult,
  readScript,
  replay,
  type Script,
  type SolveInput,
  type SolveResult,
  solve,
} from "../../src/solver/solver.ts";
import { findPinnedClone, testInClone } from "../clone-test/clone-test.ts";
import { printReplay } from "./print.ts";

const ORACLE_LINE = 0;
const REPLAYED = 0;
const NO_ANSWER = 2;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function exitNoAnswer(why: string): never {
  console.log(`no answer: ${why}`);
  process.exit(NO_ANSWER);
}

const { values, positionals } = parseArgs({ options: { replay: { type: "string" } }, allowPositionals: true });
const [file] = positionals;
if (file === undefined) {
  console.error("usage: npm run oracle:battle -- [--replay <script.json>] <export.json>");
  process.exit(NO_ANSWER);
}

let exported: Pick<SolveInput, "save" | "extras" | "live" | "liveExport">;
try {
  const json = JSON.parse(readFileSync(file, "utf8"));
  exported = "save" in json ? json : { save: json };
} catch (err) {
  exitNoAnswer(`could not read ${file}: ${messageOf(err)}`);
}

if (values.replay !== undefined) {
  let script: Script;
  try {
    script = readScript(readFileSync(values.replay, "utf8"));
  } catch (err) {
    exitNoAnswer(`could not read ${values.replay}: ${messageOf(err)}`);
  }
  const inClone: Clone = async ({ name, source, input }) => {
    const found = findPinnedClone();
    if ("missing" in found) return { missing: `${found.missing} Set it up with \`${found.how}\`` };
    return testInClone({ clone: found.clone, name, source, input, echo: false });
  };
  let result: ReplayResult;
  try {
    result = await replay({ ...exported, cloneVersion: PINNED_GAME_VERSION }, script, inClone);
  } catch (err) {
    exitNoAnswer(`the replay failed: ${messageOf(err)}`);
  }
  if (result.kind === "no_answer") exitNoAnswer(result.message);
  console.log(printReplay(result.replay));
  process.exit(REPLAYED);
}

let result: SolveResult;
try {
  result = await solve({ ...exported, cloneVersion: PINNED_GAME_VERSION, budget: DEFAULT_BUDGET });
} catch (err) {
  exitNoAnswer(`the solver failed: ${messageOf(err)}`);
}
if (result.kind === "oracle_line") {
  console.log(JSON.stringify(result.oracleLine, null, 2));
  process.exit(ORACLE_LINE);
}
exitNoAnswer(result.message);
