/** The solver a player's plugin runs. */
import { readFileSync } from "node:fs";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import { DEFAULT_BUDGET, solve, type SolveInput, type SolveResult } from "../../src/solver/solver.ts";

const ORACLE_LINE = 0;
const NO_ANSWER = 2;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const [file] = process.argv.slice(2);
if (file === undefined) {
  console.error("usage: npm run oracle:battle <export.json>");
  process.exit(NO_ANSWER);
}

let exported: Pick<SolveInput, "save" | "extras">;
try {
  const json = JSON.parse(readFileSync(file, "utf8"));
  exported = "save" in json ? json : { save: json };
} catch (err) {
  console.log(`no answer: could not read ${file}: ${messageOf(err)}`);
  process.exit(NO_ANSWER);
}

let result: SolveResult;
try {
  result = await solve({ ...exported, cloneVersion: PINNED_GAME_VERSION, budget: DEFAULT_BUDGET });
} catch (err) {
  console.log(`no answer: the solver failed: ${messageOf(err)}`);
  process.exit(NO_ANSWER);
}
if (result.kind === "oracle_line") {
  console.log(JSON.stringify(result.oracleLine, null, 2));
  process.exit(ORACLE_LINE);
}
console.log(`no answer: ${result.message}`);
process.exit(NO_ANSWER);
