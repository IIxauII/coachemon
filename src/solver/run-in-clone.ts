import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import type { Clone } from "./replay.ts";

const KILL_MS = 5_000;
export const vitestOn = (pnpm: string) => ["npx", "--yes", `pnpm@${pnpm}`, "exec", "vitest"];
const VITEST = vitestOn(reviewed.pinned.pnpm);

export type FoundClone = { clone: string } | { missing: string; how: string };

/** `find` is asked again at each run. */
export const harnessIn =
  (find: () => FoundClone, pnpm = reviewed.pinned.pnpm): Clone =>
  async ({ name, source, input, env, heapMb, signal }) => {
    const found = find();
    if ("missing" in found) return { missing: `${found.missing} Set it up with \`${found.how}\`` };
    // vitest hands `execArgv` to the fork the test runs in, and not to itself.
    const args = heapMb === undefined ? [] : [`--execArgv=--max-old-space-size=${heapMb}`];
    return testInClone({ clone: found.clone, name, source, input, env, args, signal, echo: false, vitest: vitestOn(pnpm) });
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
  bundle?: string;
  /** Handed to the test as a file at `COACH_IN`. */
  input?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Forward vitest's stdout as it comes; its stderr always is. */
  echo: boolean;
  vitest?: string[];
  /** Ends the run early, as an interrupt does, but settles with what the test wrote by then. */
  signal?: AbortSignal;
};

/**
 * `report` is vitest's JSON report and `out` whatever the test wrote at `COACH_OUT`, each absent if the test never wrote
 * it; `output` is vitest's stdout and stderr together. vitest's exit code is left out (game-code.md §13).
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
 * in. Interrupted by SIGINT or SIGTERM, it never settles: the signal ends the process once every test has removed its
 * files (#658).
 */
export const testInClone = async (t: CloneTest): Promise<CloneTestResult> => {
  const stem = `coach-${t.name}-${randomUUID().slice(0, 8)}`;
  const tests = path.join(t.clone, "test/tests");
  const bundlePath = path.join(tests, `.${stem}.bundle.js`);
  const testPath = path.join(tests, `${stem}.test.ts`);
  const reportPath = path.join(tests, `.${stem}.report.json`);
  const inPath = path.join(tests, `.${stem}.in.json`);
  const outPath = path.join(tests, `.${stem}.out.json`);
  // Naming a reporter on the command line replaces the clone's own, whose per-test banners are all that separate one
  // case's phase log from the next's: this shim names it back beside the JSON one.
  const reporterPath = path.join(t.clone, "test/reporters", `.${stem}.reporter.ts`);
  // Left to its default, Ctrl-C ends this process before the `finally`, and no later test removes files named for this
  // one alone (#658).
  const interrupt = new AbortController();
  const stop = (signal: NodeJS.Signals) => interrupt.abort(signal);
  process.on("SIGINT", stop).on("SIGTERM", stop);
  try {
    if (t.bundle !== undefined) writeFileSync(bundlePath, t.bundle);
    if (t.input !== undefined) writeFileSync(inPath, t.input);
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
        signal: t.signal === undefined ? interrupt.signal : AbortSignal.any([interrupt.signal, t.signal]),
        env: {
          ...process.env,
          ...t.env,
          ...(t.bundle !== undefined && { COACH_BUNDLE: bundlePath }),
          ...(t.input !== undefined && { COACH_IN: inPath }),
          COACH_OUT: outPath,
          COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        },
      },
    );
    return { report: readOr(reportPath, JSON.parse), out: readOr(outPath, text => text), output };
  } finally {
    for (const artifact of [bundlePath, inPath, testPath, reportPath, outPath, reporterPath]) {
      rmSync(artifact, { force: true });
    }
    process.off("SIGINT", stop).off("SIGTERM", stop);
    if (interrupt.signal.aborted) {
      process.kill(process.pid, interrupt.signal.reason);
      // A test still running catches the signal, and the process lives until it too has cleaned up: returning meanwhile
      // would hand this one's partial result over as an answer.
      await new Promise<never>(() => {});
    }
  }
};

const tee = (
  file: string,
  args: string[],
  { cwd, echo, signal, env }: { cwd: string; echo: boolean; signal: AbortSignal; env: NodeJS.ProcessEnv },
): Promise<string> =>
  new Promise(resolve => {
    // Its own process group, so an abort reaches the fork the test runs in: killing npx alone left that running (#663).
    // In the background, so it must never read the terminal, or SIGTTIN stops it.
    const child = spawn(file, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const signalGroup = (sig: NodeJS.Signals) => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, sig);
      } catch {}
    };
    let hard: NodeJS.Timeout | undefined;
    // A test hung in a job may never act on the SIGTERM, and `close` waits on every process in the group.
    const kill = () => {
      signalGroup("SIGTERM");
      hard = setTimeout(() => signalGroup("SIGKILL"), KILL_MS).unref();
    };
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
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
    });
    // Never on `error`: `close` waits for every process holding the pipes, a failed start included.
    child.on("close", () => {
      signal.removeEventListener("abort", kill);
      clearTimeout(hard);
      resolve(output);
    });
  });
