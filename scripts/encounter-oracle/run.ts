/**
 * The coach's Mystery Encounter card judged against the real game: upstream's vitest harness plays each encounter
 * headless in the pinned clone, and the claims the card reads off that live scene are compared with what the game did
 * (game-code.md §13).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUD = path.resolve(HERE, "../../skills/coachemon/scripts/hud");
const TEMPLATE = path.join(HERE, "oracle.test.ts.template");
const reviewed = JSON.parse(readFileSync(path.resolve(HERE, "../../src/escape-ladder/reviewed.json"), "utf8"));
const clone = path.resolve(".cache/pokerogue", `v${reviewed.pinned.gameVersion}`);

/** Exit codes. `NO_ANSWER` covers every way the oracle can decline to answer; only `DISAGREES` accuses the card. */
const AGREES = 0;
const DISAGREES = 1;
const NO_ANSWER = 2;
/** So a stray `return` in `answer` cannot compile into an exit code that means something else. */
type Exit = typeof AGREES | typeof DISAGREES | typeof NO_ANSWER;

const missing = (what: string, how: string): never => {
  console.error(`${what}\n\n  ${how}\n`);
  process.exit(NO_ANSWER);
};

if (!existsSync(clone)) {
  // A worktree's `drift:check` leaves a bare clone, and provisioning it re-fetches the 815 MB `assets` submodule
  // (#296).
  missing(`No pinned clone at ${clone}.`, "npm run drift:check   # in a worktree: ln -s <main-checkout>/.cache .cache");
}
if (!existsSync(path.join(clone, "node_modules"))) {
  missing(`The clone at ${clone} has no dependencies.`, `cd ${clone} && pnpm install --frozen-lockfile`);
}
// An empty submodule is the quiet failure: every option that starts a battle dies in `populateMoveAnim` with no
// hint of why, and the red run looks like the card's fault.
for (const sub of ["assets", "locales"]) {
  if (readdirSync(path.join(clone, sub)).length === 0) {
    missing(`The clone's \`${sub}\` submodule is empty.`, `cd ${clone} && git submodule update --init --depth 1 ${sub}`);
  }
}

// Never `99-start.js`: its refresh loop would tick game code against the harness's own game.
const files = readdirSync(HUD)
  .filter(f => f.endsWith(".js") && f !== "99-start.js")
  .sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
const bundlePath = path.join(clone, "test/tests/.coach-oracle.bundle.js");
const testPath = path.join(clone, "test/tests/coach-oracle.test.ts");
const reportPath = path.join(clone, "test/tests/.coach-oracle.report.json");
// Naming a reporter on the command line replaces the clone's own, whose per-test banners are all that separate one
// case's phase log from the next's: this shim names it back beside the JSON one.
const reporterPath = path.join(clone, "test/reporters/.coach-default-reporter.ts");

const tee = (file: string, args: string[]): Promise<string> =>
  new Promise(resolve => {
    const child = spawn(file, args, {
      cwd: clone,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, COACH_BUNDLE: bundlePath, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    let output = "";
    const forward = (from: Readable, to: NodeJS.WriteStream) =>
      from.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        to.write(chunk);
      });
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on("error", (err: Error) => {
      const said = `\noracle: could not run vitest — ${err.message}\n`;
      output += said;
      process.stderr.write(said);
      resolve(output);
    });
    child.on("close", () => resolve(output));
  });

// Written as an escape, not the raw control byte it used to be: invisible in a diff, it reads as a missing `\u001b`
// and invites a "fix" that would leave a bare ESC in front of `Errors`, where `\s` does not match it.
const ANSI = /\u001b\[[0-9;]*m/g;
const ERROR_TALLY = /^\s*Errors\s+(\d+)\s+errors?\s*$/m;
/**
 * The clone's own i18n rejection (game-code.md §13). Stubbing `localStorage` early would silence it, and alter the game
 * the oracle is questioning.
 */
const CLONE_I18N_REJECTION = /Cannot read properties of undefined \(reading 'getItem'\)[\s\S]{0,200}?src\/i18n\.ts/g;

type Report = {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
};

/** Read from vitest's results, never its exit code: the clone's own rejection makes that 1 however the cases went. */
const answer = (output: string): Exit => {
  const plain = output.replace(ANSI, "");
  const raised = Number(ERROR_TALLY.exec(plain)?.[1] ?? "0");
  const known = (plain.match(CLONE_I18N_REJECTION) ?? []).length;
  const unrecognised = raised - known;

  let report: Report | undefined;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    report = undefined;
  }
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
  rmSync(reportPath, { force: true }); // never answer from the leftovers of the last run
  writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
  writeFileSync(testPath, readFileSync(TEMPLATE, "utf8"));
  writeFileSync(reporterPath, 'export { CustomDefaultReporter as default } from "./custom-default-reporter";\n');
  code = answer(
    await tee("npx", [
      "--yes",
      "pnpm@10.33.2",
      "exec",
      "vitest",
      "run",
      "test/tests/coach-oracle.test.ts",
      `--reporter=./${path.relative(clone, reporterPath)}`,
      "--reporter=json",
      `--outputFile.json=${reportPath}`,
      ...process.argv.slice(2),
    ]),
  );
} catch (err) {
  // Uncaught, a throw here exits 1 — which accuses the card.
  console.error(`\noracle: no answer — the oracle failed before it could ask.\n`);
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  code = NO_ANSWER;
} finally {
  for (const artifact of [bundlePath, testPath, reportPath, reporterPath]) {
    rmSync(artifact, { force: true });
  }
}
process.exit(code);
