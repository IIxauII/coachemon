import { readFileSync } from "node:fs";
import { type CloneTestResult, hudBundle, suiteClone, suitePin, testInClone, vitestOn } from "./clone-test.ts";

/** Exit codes. `NO_ANSWER` covers every way an oracle can decline to answer; only `DISAGREES` accuses its subject. */
export const AGREES = 0;
export const DISAGREES = 1;
export const NO_ANSWER = 2;
export type Exit = typeof AGREES | typeof DISAGREES | typeof NO_ANSWER;

// Written as an escape, not the raw control byte it used to be: invisible in a diff, it reads as a missing `\u001b`
// and invites a "fix" that would leave a bare ESC in front of `Errors`, where `\s` does not match it.
const ANSI = /\u001b\[[0-9;]*m/g;
const ERROR_TALLY = /^\s*Errors\s+(\d+)\s+errors?\s*$/m;
/**
 * The clone's own i18n rejection (game-code.md §13). Stubbing `localStorage` early would silence it, and alter the game
 * the oracle is questioning.
 */
const CLONE_I18N_REJECTION = /Cannot read properties of undefined \(reading 'getItem'\)[\s\S]{0,200}?src\/i18n\.ts/g;

type Say = { log: (line: string) => void; error: (line: string) => void };

/** `subject` is what a disagreement accuses, as "the card". */
export const verdictOf = ({ report, output }: CloneTestResult, subject: string, say: Say = console): Exit => {
  const plain = output.replace(ANSI, "");
  const raised = Number(ERROR_TALLY.exec(plain)?.[1] ?? "0");
  const known = (plain.match(CLONE_I18N_REJECTION) ?? []).length;
  const unrecognised = raised - known;

  if (!report || report.numTotalTests === 0) {
    say.error("\noracle: no answer — vitest produced no results. Its own output is above.");
    return NO_ANSWER;
  }

  const { numPassedTests: agree, numFailedTests: disagree, numPendingTests: skipped } = report;
  const tally = `${agree} agree, ${disagree} disagree${skipped ? `, ${skipped} not run` : ""}`;
  if (agree === 0 && disagree === 0) {
    say.error(`\noracle: no answer — ${tally}. Nothing was run; check the name filter.`);
    return NO_ANSWER;
  }
  // Before the cases, not after: an error the oracle cannot place may be *why* a case failed, and `1` must mean the
  // subject disagrees and nothing else.
  if (unrecognised !== 0) {
    say.error(
      unrecognised > 0
        ? `\noracle: no answer — ${tally}, but ${unrecognised} of ${raised} unhandled errors are ones the oracle does\n` +
            "        not recognise, so this run cannot be vouched for. See Unhandled Errors above."
        : `\noracle: no answer — ${tally}, but the clone's i18n rejection was printed ${known} times against ${raised}\n` +
            "        unhandled errors, so the oracle cannot tell which of them it has accounted for.",
    );
    return NO_ANSWER;
  }
  if (disagree > 0) {
    say.error(`\noracle: ${tally} — ${subject} contradicts the game. The failures are above.`);
    return DISAGREES;
  }
  if (!report.success) {
    say.error(`\noracle: no answer — ${tally}, but vitest failed outside the cases. Its own output is above.`);
    return NO_ANSWER;
  }
  const ignored = known
    ? `\n        ${known} unhandled error${known === 1 ? "" : "s"} ignored: the clone's own i18n rejection, which upstream's tests raise too.`
    : "";
  say.log(`\noracle: ${tally}.${ignored}`);
  return AGREES;
};

/** Runs `template` in the suite's clone with the HUD bundle loaded, and exits with its verdict on `subject`. */
export const runOracle = async ({ name, template, subject }: { name: string; template: URL; subject: string }) => {
  const clone = suiteClone();
  let code: Exit = NO_ANSWER;
  try {
    code = verdictOf(
      await testInClone({
        clone,
        name,
        source: readFileSync(template, "utf8"),
        bundle: hudBundle(),
        args: process.argv.slice(2),
        echo: true,
        vitest: vitestOn(suitePin().pnpm),
      }),
      subject,
    );
  } catch (err) {
    // Uncaught, a throw here exits 1 — which accuses the subject.
    console.error(`\noracle: no answer — the oracle failed before it could ask.\n`);
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    code = NO_ANSWER;
  }
  process.exit(code);
};
