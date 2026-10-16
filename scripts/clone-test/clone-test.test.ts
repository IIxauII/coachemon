import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { type CloneTest, type CloneTestResult, testInClone } from "./clone-test.ts";

// Stands in for vitest: `FAKE` picks what it does, and the report echoes back the test, bundle and input it was handed. Like
// vitest behind npx, it goes on writing for a while after a SIGTERM.
const FAKE_VITEST = `
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const testFile = args[1];
const report = args.find(a => a.startsWith("--outputFile.json="))?.slice("--outputFile.json=".length);
const mode = process.env.FAKE;
const mark = name => writeFileSync(new URL(name + "-" + process.pid, import.meta.url), "");
process.on("SIGTERM", () => mode !== "deaf" && setTimeout(() => {
  writeFileSync(process.env.COACH_OUT, "late");
  mark("exited");
  process.exit(1);
}, 100));
if (mode === "hang" || mode === "deaf") mark("listening");
if (mode === "fork") {
  const { spawn } = await import("node:child_process");
  const fork = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], { stdio: "inherit" });
  writeFileSync(new URL("forked-" + fork.pid, import.meta.url), "");
}
await new Promise(r => setTimeout(r, { slow: 300, hang: 60_000, fork: 60_000, deaf: 60_000 }[mode] ?? 0));
process.stdout.write("vitest says hello\\n");
process.stderr.write("vitest grumbles\\n");
if (mode === "no-report") process.exit(1);
writeFileSync(process.env.COACH_OUT, JSON.stringify({ wrote: "records" }));
writeFileSync(report, JSON.stringify({
  success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
  testFile, source: readFileSync(testFile, "utf8"),
  bundle: process.env.COACH_BUNDLE ? readFileSync(process.env.COACH_BUNDLE, "utf8") : null,
  input: process.env.COACH_IN ? readFileSync(process.env.COACH_IN, "utf8") : null,
}));
process.exit(1);
`;

const UPSTREAM = ["custom-default-reporter.ts", "upstream.test.ts"];

const scratch = (t: TestContext) => {
  const root = mkdtempSync(path.join(tmpdir(), "clone-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const clone = path.join(root, "clone");
  mkdirSync(path.join(clone, "test/tests"), { recursive: true });
  mkdirSync(path.join(clone, "test/reporters"), { recursive: true });
  writeFileSync(path.join(clone, "test/tests/upstream.test.ts"), "");
  writeFileSync(path.join(clone, "test/reporters/custom-default-reporter.ts"), "");
  const fake = path.join(root, "fake-vitest.mjs");
  writeFileSync(fake, FAKE_VITEST);
  const options = (mode: string, source = "the test"): CloneTest => ({
    clone,
    name: "probe",
    source,
    bundle: `bundle for ${source}`,
    env: { FAKE: mode },
    echo: false,
    vitest: [process.execPath, fake],
  });
  const run = (mode: string, source?: string) => testInClone(options(mode, source));
  const leftovers = () =>
    [...readdirSync(path.join(clone, "test/tests")), ...readdirSync(path.join(clone, "test/reporters"))].sort();
  const marks = (name: string) => readdirSync(root).filter(f => f.startsWith(`${name}-`)).length;
  return { root, clone, options, run, leftovers, marks };
};

const echoed = ({ report }: CloneTestResult) =>
  report as unknown as { testFile: string; source: string; bundle: string | null; input: string | null };

test("a passing report reads as passing though vitest exits 1 (#658)", async t => {
  const s = scratch(t);
  const { report, out, output } = await s.run("pass");
  assert.equal(report?.success, true);
  assert.equal(report?.numPassedTests, 1);
  assert.deepEqual(JSON.parse(out ?? ""), { wrote: "records" });
  assert.match(output, /vitest says hello/);
  assert.match(output, /vitest grumbles/);
});

test("two tests started at once in one clone each run their own files and leave none behind (#658)", async t => {
  const s = scratch(t);
  const [a, b] = (await Promise.all([s.run("slow", "test A"), s.run("slow", "test B")])).map(echoed);
  assert.notEqual(a.testFile, b.testFile);
  assert.deepEqual([a.source, a.bundle], ["test A", "bundle for test A"]);
  assert.deepEqual([b.source, b.bundle], ["test B", "bundle for test B"]);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

test("a test is handed its input at COACH_IN and needs no bundle, and leaves no files behind (#660)", async t => {
  const s = scratch(t);
  const { bundle: _, ...options } = s.options("pass");
  const { input, bundle } = echoed(await testInClone({ ...options, input: "the job" }));
  assert.deepEqual([input, bundle], ["the job", null]);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

test("a test that writes no report has no report, and leaves no files behind (#658)", async t => {
  const s = scratch(t);
  const { report, out } = await s.run("no-report");
  assert.equal(report, undefined);
  assert.equal(out, undefined);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

test("a vitest that cannot start has no report, says why, and leaves no files behind (#658)", async t => {
  const s = scratch(t);
  const { report, output } = await testInClone({ ...s.options("pass"), vitest: [path.join(s.root, "no-such-vitest")] });
  assert.equal(report, undefined);
  assert.match(output, /could not run vitest/);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

test("a test that throws while copying in removes what it already copied (#658)", async t => {
  const s = scratch(t);
  rmSync(path.join(s.clone, "test/reporters"), { recursive: true });
  await assert.rejects(s.run("pass"));
  assert.deepEqual(readdirSync(path.join(s.clone, "test/tests")), ["upstream.test.ts"]);
});

test("a test ended by its signal settles once every process it started has ended, the test's own fork included (#663)", async t => {
  const s = scratch(t);
  const stop = new AbortController();
  const run = testInClone({ ...s.options("fork"), signal: stop.signal });
  while (s.marks("forked") < 1) await sleep(20);
  stop.abort();
  const { out } = await run;

  const fork = Number(readdirSync(s.root).find(f => f.startsWith("forked-"))?.slice("forked-".length));
  // Once reaped: a fork that died before vitest is a zombie until vitest goes too.
  for (let i = 0; i < 100 && alive(fork); i++) await sleep(20);
  assert.equal(alive(fork), false);
  assert.equal(out, "late");
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

test("a test that never acts on its SIGTERM is killed, so ending it is bounded (#663)", async t => {
  const s = scratch(t);
  const stop = new AbortController();
  const run = testInClone({ ...s.options("deaf"), signal: stop.signal });
  while (s.marks("listening") < 1) await sleep(20);
  const asked = Date.now();
  stop.abort();
  await run;

  assert.ok(Date.now() - asked < 15_000);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("two tests interrupted with SIGINT outlast vitest, leave no files behind, and never settle before the signal ends the process (#658)", async t => {
  const s = scratch(t);
  const caller = path.join(s.root, "caller.mjs");
  const settled = path.join(s.root, "settled");
  const module = pathToFileURL(path.resolve(import.meta.dirname, "clone-test.ts")).href;
  writeFileSync(
    caller,
    `import { writeFileSync } from "node:fs";\nimport { testInClone } from ${JSON.stringify(module)};\n` +
      `for (const _ of [1, 2]) testInClone(${JSON.stringify(s.options("hang"))})` +
      `.then(() => writeFileSync(${JSON.stringify(settled)}, ""));\n`,
  );
  const child = spawn(process.execPath, [caller], { stdio: "ignore" });
  const ended = new Promise(resolve => child.on("close", (_code, signal) => resolve(signal)));
  while (s.marks("listening") < 2) await sleep(20);
  child.kill("SIGINT");
  assert.equal(await ended, "SIGINT");
  assert.equal(s.marks("exited"), 2);
  assert.equal(existsSync(settled), false);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});
