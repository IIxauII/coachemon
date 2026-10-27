import assert from "node:assert/strict";
import test from "node:test";
import type { CloneTestResult, VitestReport } from "./clone-test.ts";
import { AGREES, DISAGREES, NO_ANSWER, verdictOf } from "./oracle.ts";

const REJECTION = "TypeError: Cannot read properties of undefined (reading 'getItem')\n ❯ src/i18n.ts:204:36\n";
const tally = (n: number) => `      Errors  ${n} error${n === 1 ? "" : "s"}\n`;
const report = (passed: number, failed: number): VitestReport => ({
  success: failed === 0,
  numTotalTests: passed + failed,
  numPassedTests: passed,
  numFailedTests: failed,
  numPendingTests: 0,
});
const run = (result: CloneTestResult) => {
  const said: string[] = [];
  const code = verdictOf(result, "the subject", { log: line => said.push(line), error: line => said.push(line) });
  return { code, said: said.join("\n") };
};

test("every case passing agrees, past the clone's own i18n rejection (#296)", () => {
  const { code, said } = run({ report: report(3, 0), out: undefined, output: `\u001b[31m${REJECTION}\u001b[39m${tally(1)}` });
  assert.equal(code, AGREES);
  assert.match(said, /3 agree, 0 disagree\.\n.*1 unhandled error ignored/);
});

test("a failing case accuses the subject", () => {
  const { code, said } = run({ report: report(2, 1), out: undefined, output: REJECTION + tally(1) });
  assert.equal(code, DISAGREES);
  assert.match(said, /the subject contradicts the game/);
});

test("an unhandled error the oracle cannot place is no answer, a failing case or not", () => {
  const { code } = run({ report: report(2, 1), out: undefined, output: REJECTION + "TypeError: something else\n" + tally(2) });
  assert.equal(code, NO_ANSWER);
});

test("a run that wrote no report is no answer", () => {
  assert.equal(run({ report: undefined, out: undefined, output: "" }).code, NO_ANSWER);
});
