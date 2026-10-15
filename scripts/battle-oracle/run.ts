/** The solver a player's plugin runs. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import {
  checkForks,
  DEFAULT_BUDGET,
  type PoolStats,
  type ReplayResult,
  readScript,
  replay,
  type Script,
  type SolveInput,
  type SolveResult,
  solve,
} from "../../src/solver/solver.ts";
import { findPinnedClone, harnessIn } from "../clone-test/clone-test.ts";
import { printChecks, printOracleLine, printReplay } from "./print.ts";

const ORACLE_LINE = 0;
const REPLAYED = 0;
const CHECKED = 0;
const CHECK_FAILED = 1;
const NO_ANSWER = 2;
const PROGRESS_EVERY = 100;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function exitNoAnswer(why: string): never {
  console.log(`no answer: ${why}`);
  process.exit(NO_ANSWER);
}

const { values, positionals } = parseArgs({
  options: {
    replay: { type: "string" },
    check: { type: "string" },
    unchecked: { type: "boolean", default: false },
    workers: { type: "string" },
  },
  allowPositionals: true,
});
const [file] = positionals;
if (file === undefined) {
  console.error("usage: npm run oracle:battle -- [--replay <script.json> | --check <script.json> | --unchecked [--workers <n>]] <export.json>");
  process.exit(NO_ANSWER);
}

let exported: Pick<SolveInput, "save" | "extras" | "live" | "liveExport">;
try {
  const json = JSON.parse(readFileSync(file, "utf8"));
  exported = "save" in json ? json : { save: json };
} catch (err) {
  exitNoAnswer(`could not read ${file}: ${messageOf(err)}`);
}

const inClone = harnessIn(findPinnedClone);

const scripted = (path: string): Script => {
  try {
    return readScript(readFileSync(path, "utf8"));
  } catch (err) {
    exitNoAnswer(`could not read ${path}: ${messageOf(err)}`);
  }
};

if (values.replay !== undefined) {
  const script = scripted(values.replay);
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

if (values.check !== undefined) {
  const { inputs } = scripted(values.check);
  const result = await checkForks({ ...exported, cloneVersion: PINNED_GAME_VERSION }, inputs, inClone);
  if (result.kind === "no_answer") exitNoAnswer(result.message);
  const { passed, text } = printChecks(result.checks);
  console.log(text);
  process.exit(passed ? CHECKED : CHECK_FAILED);
}

if (values.unchecked) console.error("oracle: --unchecked solves on a game version the harness re-check hasn't passed");
const workers = values.workers === undefined ? undefined : Number(values.workers);
if (workers !== undefined && !(Number.isInteger(workers) && workers > 0)) exitNoAnswer(`--workers ${values.workers} is not a count`);
let shown = -PROGRESS_EVERY;
let last: PoolStats | undefined;
const started = Date.now();
const poolLine = ({ size, died, peakHeapMb, heapLimitMb }: PoolStats) =>
  `${size} workers, ${died} died, heap peak ${peakHeapMb ?? "?"} of ${heapLimitMb ?? "?"} MB`;
let result: SolveResult;
try {
  result = await solve(
    { ...exported, cloneVersion: PINNED_GAME_VERSION, budget: DEFAULT_BUDGET },
    {
      clone: inClone,
      unchecked: values.unchecked,
      workers,
      progress: ({ spent, budget, pool }) => {
        last = pool;
        if (spent - shown < PROGRESS_EVERY) return;
        shown = spent;
        const secs = Math.round((Date.now() - started) / 1000);
        const searched = `${spent.toLocaleString("en")} of ${budget.toLocaleString("en")} turns`;
        console.error(`oracle: searched ${searched}, ${secs} s; ${poolLine(pool)}`);
      },
    },
  );
} catch (err) {
  exitNoAnswer(`the solver failed: ${messageOf(err)}`);
}
if (last) console.error(`oracle: done in ${Math.round((Date.now() - started) / 1000)} s; ${poolLine(last)}`);
if (result.kind === "oracle_line") {
  console.log(printOracleLine(result.oracleLine));
  process.exit(ORACLE_LINE);
}
exitNoAnswer(result.message);
