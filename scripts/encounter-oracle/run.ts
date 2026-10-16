/**
 * The coach's Mystery Encounter card judged against the real game: upstream's vitest harness plays each encounter
 * headless in the pinned clone, and the claims the card reads off that live scene are compared with what the game did
 * (game-code.md §13).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CloneTestResult, hudBundle, suiteClone, suitePin, testInClone, vitestOn } from "../clone-test/clone-test.ts";

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "oracle.test.ts.template");

/** Exit codes. `NO_ANSWER` covers every way the oracle can decline to answer; only `DISAGREES` accuses the card. */
const AGREES = 0;
const DISAGREES = 1;
const NO_ANSWER = 2;
/** So a stray `return` in `answer` cannot compile into an exit code that means something else. */
type Exit = typeof AGREES | typeof DISAGREES | typeof NO_ANSWER;

const clone = suiteClone();

// Written as an escape, not the raw control byte it used to be: invisible in a diff, it reads as a missing `\u001b`
// and invites a "fix" that would leave a bare ESC in front of `Errors`, where `\s` does not match it.
const ANSI = /\u001b\[[0-9;]*m/g;
const ERROR_TALLY = /^\s*Errors\s+(\d+)\s+errors?\s*$/m;
/**
 * The clone's own i18n rejection (game-code.md §13). Stubbing `localStorage` early would silence it, and alter the game
 * the oracle is questioning.
 */
const CLONE_I18N_REJECTION = /Cannot read properties of undefined \(reading 'getItem'\)[\s\S]{0,200}?src\/i18n\.ts/g;

const answer = ({ report, output }: CloneTestResult): Exit => {
  const plain = output.replace(ANSI, "");
  const raised = Number(ERROR_TALLY.exec(plain)?.[1] ?? "0");
  const known = (plain.match(CLONE_I18N_REJECTION) ?? []).length;
  const unrecognised = raised - known;

  if (!report || report.numTotalTests === 0) {
    console.error("\noracle: no answer — vitest produced no results. Its own output is above.");
    return NO_ANSWER;
  }

  const { numPassedTests: agree, numFailedTests: disagree, numPendingTests: skipped } = report;
  const tally = `${agree} agree, ${disagree} disagree${skipped ? `, ${skipped} not run` : ""}`;
  if (agree === 0 && disagree === 0) {
    console.error(`\noracle: no answer — ${tally}. Nothing was run; check the name filter.`);
    return NO_ANSWER;
  }
  // Before the cases, not after: an error the oracle cannot place may be *why* a case failed, and `1` must mean the
  // card disagrees and nothing else.
  if (unrecognised !== 0) {
    console.error(
      unrecognised > 0
        ? `\noracle: no answer — ${tally}, but ${unrecognised} of ${raised} unhandled errors are ones the oracle does\n` +
            "        not recognise, so this run cannot be vouched for. See Unhandled Errors above."
        : `\noracle: no answer — ${tally}, but the clone's i18n rejection was printed ${known} times against ${raised}\n` +
            "        unhandled errors, so the oracle cannot tell which of them it has accounted for.",
    );
    return NO_ANSWER;
  }
  if (disagree > 0) {
    console.error(`\noracle: ${tally} — the card contradicts the game. The failures are above.`);
    return DISAGREES;
  }
  if (!report.success) {
    console.error(`\noracle: no answer — ${tally}, but vitest failed outside the cases. Its own output is above.`);
    return NO_ANSWER;
  }
  const ignored = known
    ? `\n        ${known} unhandled error${known === 1 ? "" : "s"} ignored: the clone's own i18n rejection, which upstream's tests raise too.`
    : "";
  console.log(`\noracle: ${tally}.${ignored}`);
  return AGREES;
};

let code: Exit = NO_ANSWER;
try {
  code = answer(
    await testInClone({
      clone,
      name: "oracle",
      source: readFileSync(TEMPLATE, "utf8"),
      bundle: hudBundle(),
      args: process.argv.slice(2),
      echo: true,
      vitest: vitestOn(suitePin().pnpm),
    }),
  );
} catch (err) {
  // Uncaught, a throw here exits 1 — which accuses the card.
  console.error(`\noracle: no answer — the oracle failed before it could ask.\n`);
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  code = NO_ANSWER;
}
process.exit(code);
