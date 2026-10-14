/**
 * The solver a player's plugin runs, run from the repo on an export against the pinned game version, so a player's
 * "no answer" or a wrong oracle line can be reproduced. The export is a wave-start save, or `{ save, extras }`.
 */
import { readFileSync } from "node:fs";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import { DEFAULT_BUDGET, solve, type SolveInput, type SolveResult } from "../../src/solver/solver.ts";

const LINE = 0;
const NO_ANSWER = 2;

const read = (file: string): Pick<SolveInput, "save" | "extras"> => {
  const exported = JSON.parse(readFileSync(file, "utf8"));
  return "save" in exported ? exported : { save: exported };
};

const [file] = process.argv.slice(2);
if (file === undefined) {
  console.error("usage: npm run oracle:battle <export.json>");
  process.exit(NO_ANSWER);
}

let result: SolveResult;
try {
  result = await solve({ ...read(file), gameVersion: PINNED_GAME_VERSION, budget: DEFAULT_BUDGET });
} catch (err) {
  console.log(`no answer: could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(NO_ANSWER);
}
console.log(result.kind === "line" ? JSON.stringify(result.line, null, 2) : `no answer: ${result.message}`);
// The solver's result alone: a clone run's own exit code is flipped by Node ≥25's `localStorage` artefact (#658).
process.exit(result.kind === "line" ? LINE : NO_ANSWER);
