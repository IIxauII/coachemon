import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUD = path.resolve(HERE, "../../skills/coachemon/scripts/hud");
const VITEST = ["npx", "--yes", "pnpm@10.33.2", "exec", "vitest"];

/** The clone pinned to the reviewed game version, or exit 2: no answer (game-code.md §13). */
export const pinnedClone = (): string => {
  const reviewed = JSON.parse(readFileSync(path.resolve(HERE, "../../src/escape-ladder/reviewed.json"), "utf8"));
  const clone = path.resolve(".cache/pokerogue", `v${reviewed.pinned.gameVersion}`);
  const missing = (what: string, how: string): never => {
    console.error(`${what}\n\n  ${how}\n`);
    process.exit(2);
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
  return clone;
};

export const hudBundle = (): string => {
  // Never `99-start.js`: its refresh loop would tick game code against the harness's own game.
  const files = readdirSync(HUD)
    .filter(f => f.endsWith(".js") && f !== "99-start.js")
    .sort()
    .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
  return bundle("hud", { expose: true, files });
};

export type VitestReport = {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
};

export type CloneTest = {
  clone: string;
  /** Goes into the name of every file copied in. */
  name: string;
  /** The test file's text. */
  source: string;
  /** The bundle's text: the test is handed its path as `COACH_BUNDLE`. */
  bundle: string;
  args?: string[];
  env?: Record<string, string>;
  /** Forward vitest's stdout as it comes; its stderr always is. */
  echo: boolean;
  vitest?: string[];
};

/**
 * `report` is vitest's JSON report and `out` whatever the test wrote at `COACH_OUT`, each absent if the test never wrote
 * it; `output` is vitest's stdout and stderr together. There is no exit code: the clone's own i18n rejection makes it 1
 * however the cases went (game-code.md §13).
 */
export type CloneTestResult = { report: VitestReport | undefined; out: string | undefined; output: string };

const readOr = <T>(file: string, parse: (text: string) => T): T | undefined => {
  try {
    return parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

/**
 * Copies the test into the clone under a name no other test shares, runs vitest on it, and removes every file it copied
 * in.
 */
export const testInClone = async (t: CloneTest): Promise<CloneTestResult> => {
  const stem = `coach-${t.name}-${randomUUID().slice(0, 8)}`;
  const tests = path.join(t.clone, "test/tests");
  const bundlePath = path.join(tests, `.${stem}.bundle.js`);
  const testPath = path.join(tests, `${stem}.test.ts`);
  const reportPath = path.join(tests, `.${stem}.report.json`);
  const outPath = path.join(tests, `.${stem}.out.json`);
  // Naming a reporter on the command line replaces the clone's own, whose per-test banners are all that separate one
  // case's phase log from the next's: this shim names it back beside the JSON one.
  const reporterPath = path.join(t.clone, "test/reporters", `.${stem}.reporter.ts`);
  // Left to its default, Ctrl-C ends this process before the `finally`, and no later test removes files named for this
  // one alone (#658).
  const interrupt = new AbortController();
  const stop = () => interrupt.abort();
  process.on("SIGINT", stop).on("SIGTERM", stop);
  try {
    writeFileSync(bundlePath, t.bundle);
    writeFileSync(testPath, t.source);
    writeFileSync(reporterPath, 'export { CustomDefaultReporter as default } from "./custom-default-reporter";\n');
    const [file, ...prefix] = t.vitest ?? VITEST;
    const output = await tee(
      file,
      [
        ...prefix,
        "run",
        path.relative(t.clone, testPath),
        `--reporter=./${path.relative(t.clone, reporterPath)}`,
        "--reporter=json",
        `--outputFile.json=${reportPath}`,
        ...(t.args ?? []),
      ],
      {
        cwd: t.clone,
        echo: t.echo,
        signal: interrupt.signal,
        env: {
          ...process.env,
          ...t.env,
          COACH_BUNDLE: bundlePath,
          COACH_OUT: outPath,
          COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        },
      },
    );
    return { report: readOr(reportPath, JSON.parse), out: readOr(outPath, text => text), output };
  } finally {
    process.off("SIGINT", stop).off("SIGTERM", stop);
    for (const artifact of [bundlePath, testPath, reportPath, outPath, reporterPath]) {
      rmSync(artifact, { force: true });
    }
  }
};

const tee = (
  file: string,
  args: string[],
  { cwd, echo, signal, env }: { cwd: string; echo: boolean; signal: AbortSignal; env: NodeJS.ProcessEnv },
): Promise<string> =>
  new Promise(resolve => {
    const child = spawn(file, args, { cwd, env, signal, stdio: ["inherit", "pipe", "pipe"] });
    let output = "";
    const forward = (from: Readable, to: NodeJS.WriteStream | undefined) =>
      from.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        to?.write(chunk);
      });
    forward(child.stdout, echo ? process.stdout : undefined);
    forward(child.stderr, process.stderr);
    child.on("error", (err: Error) => {
      const said = `\noracle: could not run vitest — ${err.message}\n`;
      output += said;
      process.stderr.write(said);
      resolve(output);
    });
    child.on("close", () => resolve(output));
  });
