/**
 * Mystery Encounter oracle: the coach's encounter card judged against the real game, headless.
 *
 *   npm run oracle:encounter                 # every case
 *   npm run oracle:encounter -- -t "Part"    # vitest's name filter, passed through
 *
 * The encounter card re-implements what each encounter's option closures do, because they can't be read from the
 * page (`46-encounter.js`). Everything else the HUD claims is checked against a mock, which can only say the port
 * matches what we *think* the game does. This runs the card against the game itself: upstream's vitest harness
 * plays the encounter headless in the pinned clone, the card reads that live scene, and the claims it makes are
 * compared with what the game then actually did.
 *
 * Every exact claim the card makes is walked: the teleport destination, the part-timer's pay, the chest (both its
 * prize tiers and its trap), the store's four shops, who the fallout burns, and the vitamin dealer's new nature.
 * The take / ok / avoid call is judgement and stays unchecked.
 *
 * What it exits with:
 *
 *   0  every case run agrees with the game
 *   1  a case disagrees — the card contradicts the game, and nothing else says that
 *   2  no verdict: the clone is not provisioned, vitest produced no results, or the run raised an unhandled error
 *      the oracle does not recognise, so its results cannot be vouched for
 *
 * The exit code of `vitest` itself is *not* that signal and must not be used as one. The pinned clone raises one
 * unhandled rejection per test file during i18n init, which vitest counts as a run failure however the cases went;
 * upstream's own encounter tests exit 1 in this clone for the same reason. So the verdict is read from vitest's
 * own results (a JSON report), and unhandled errors are classified: the clone's known one is noted and ignored,
 * any other is a refusal to judge. Fixing the rejection by stubbing `localStorage` early was rejected on purpose —
 * it would let `initFonts` run where upstream's tests have it reject, and the oracle must not alter the game it is
 * questioning.
 *
 * Dev-only. Nothing here ships: the oracle lives in this repo, the game stays in `.cache`, and the four files this
 * writes into the clone are removed again on the way out. Run it at a pin bump, beside `npm run drift:check`: a
 * moved hash says "re-read this", the oracle says "the numbers still match".
 *
 * It needs the pinned clone with its dependencies, which `drift:check` alone does not leave behind:
 *
 *   npm run drift:check                                  # clones .cache/pokerogue/v<pin>
 *   cd .cache/pokerogue/v<pin>
 *   git submodule update --init --depth 1 locales assets # assets carries the battle animations
 *   pnpm install --frozen-lockfile                       # pnpm 10, node >= 24.9
 *
 * In an agent worktree `drift:check` leaves a *bare* clone — no submodules, no `node_modules` — and provisioning it
 * again re-fetches the 815 MB `assets` submodule. Point the worktree at the main checkout's instead:
 *
 *   ln -s /path/to/main/checkout/.cache .cache
 *
 * Without `assets`, every option that starts a battle dies in `populateMoveAnim` — upstream's own encounter tests
 * fail the same way, so a red run there is the clone, not the card.
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

/** Exit codes. `NO_VERDICT` covers every way the oracle can decline to judge; only `DISAGREES` accuses the card. */
const AGREES = 0;
const DISAGREES = 1;
const NO_VERDICT = 2;

const missing = (what: string, how: string): never => {
  console.error(`${what}\n\n  ${how}\n`);
  process.exit(NO_VERDICT);
};

if (!existsSync(clone)) {
  // In a worktree `drift:check` leaves a bare clone, and provisioning it re-fetches the 815 MB `assets` submodule,
  // so point at the main checkout's `.cache` rather than building a second one.
  missing(`No pinned clone at ${clone}.`, "npm run drift:check   # in a worktree: ln -s <main-checkout>/.cache .cache");
}
if (!existsSync(path.join(clone, "node_modules"))) {
  missing(`The clone at ${clone} has no dependencies.`, `cd ${clone} && pnpm install --frozen-lockfile`);
}
// An empty submodule is the quiet failure: every option that starts a battle dies in `populateMoveAnim` with no
// hint of why, so say it here rather than let a red run look like the card's fault.
for (const sub of ["assets", "locales"]) {
  if (readdirSync(path.join(clone, sub)).length === 0) {
    missing(`The clone's \`${sub}\` submodule is empty.`, `cd ${clone} && git submodule update --init --depth 1 ${sub}`);
  }
}

// The HUD as one eval-able script, minus `99-start.js`: the oracle calls the card directly and must never start a
// refresh loop that ticks game code against the harness's own game.
const files = readdirSync(HUD)
  .filter(f => f.endsWith(".js") && f !== "99-start.js")
  .sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
const bundlePath = path.join(clone, "test/tests/.coach-oracle.bundle.js");
const testPath = path.join(clone, "test/tests/coach-oracle.test.ts");
const reportPath = path.join(clone, "test/tests/.coach-oracle.report.json");
// Naming a reporter on the command line replaces the clone's own, and its per-test banners are what separate one
// case's phase log from the next's. Re-export it as a default export so it can be named back alongside the JSON one.
const reporterPath = path.join(clone, "test/reporters/.coach-default-reporter.ts");

/** Run a command, streaming its output to the terminal while keeping a copy to read the verdict out of. */
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
    child.on("error", () => resolve(output));
    child.on("close", () => resolve(output));
  });

const ANSI = /\[[0-9;]*m/g;
/** vitest's own tally of unhandled errors, which it reports separately from, and alongside, the test results. */
const ERROR_TALLY = /^\s*Errors\s+(\d+)\s+errors?\s*$/m;
/**
 * The clone's own unhandled rejection, raised once per test file and never the card's fault: `globalThis.localStorage`
 * is undefined at module scope under vitest's jsdom, and upstream defines it only later, in its `beforeAll` stubs, so
 * i18n's init callback rejects before any stub exists. Upstream's own encounter tests raise it in this clone too.
 * Should a pin bump fix it upstream there is simply nothing left to match, and the run stays green.
 */
const CLONE_I18N_REJECTION = /Cannot read properties of undefined \(reading 'getItem'\)[\s\S]{0,200}?src\/i18n\.ts/g;

type Report = {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
};

/** What the run says, read from vitest's results rather than its exit code. */
const judge = (output: string): number => {
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
    console.error("\noracle: no verdict — vitest produced no results. Its own output is above.");
    return NO_VERDICT;
  }

  const { numPassedTests: agree, numFailedTests: disagree, numPendingTests: skipped } = report;
  const tally = `${agree} agree, ${disagree} disagree${skipped ? `, ${skipped} not run` : ""}`;
  // A name filter that matches nothing leaves every case pending. Nothing was asked of the game, so there is
  // nothing to vouch for, and green would be a lie.
  if (agree === 0 && disagree === 0) {
    console.error(`\noracle: no verdict — ${tally}. Nothing was run; check the name filter.`);
    return NO_VERDICT;
  }
  if (disagree > 0) {
    console.error(`\noracle: ${tally} — the card contradicts the game. The failures are above.`);
    return DISAGREES;
  }
  if (!report.success) {
    console.error(`\noracle: no verdict — ${tally}, but vitest failed outside the cases. Its own output is above.`);
    return NO_VERDICT;
  }
  if (unrecognised > 0) {
    console.error(
      `\noracle: no verdict — ${tally}, but ${unrecognised} of ${raised} unhandled errors are ones the oracle does\n` +
        "        not recognise, so this run cannot be vouched for. See Unhandled Errors above.",
    );
    return NO_VERDICT;
  }
  const ignored = known
    ? `\n        ${known} unhandled error${known === 1 ? "" : "s"} ignored: the clone's own i18n rejection, which upstream's tests raise too.`
    : "";
  console.log(`\noracle: ${tally}.${ignored}`);
  return AGREES;
};

let code = NO_VERDICT;
try {
  rmSync(reportPath, { force: true }); // never judge a run by the leftovers of the last one
  writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
  writeFileSync(testPath, readFileSync(TEMPLATE, "utf8"));
  writeFileSync(reporterPath, 'export { CustomDefaultReporter as default } from "./custom-default-reporter";\n');
  code = judge(
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
} finally {
  for (const artifact of [bundlePath, testPath, reportPath, reporterPath]) {
    rmSync(artifact, { force: true });
  }
}
process.exit(code);
