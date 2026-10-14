import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { type CloneTestResult, testInClone } from "./clone-test.ts";

// Stands in for vitest: `FAKE` picks what it does, and the report echoes back the test and bundle it was handed.
const FAKE_VITEST = `
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const testFile = args[1];
const report = args.find(a => a.startsWith("--outputFile.json="))?.slice("--outputFile.json=".length);
const mode = process.env.FAKE;
await new Promise(r => setTimeout(r, { slow: 300, hang: 60_000 }[mode] ?? 0));
process.stdout.write("vitest says hello\\n");
process.stderr.write("vitest grumbles\\n");
if (mode === "no-report") process.exit(1);
writeFileSync(process.env.COACH_OUT, JSON.stringify({ wrote: "records" }));
writeFileSync(report, JSON.stringify({
  success: true, numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0,
  testFile, source: readFileSync(testFile, "utf8"), bundle: readFileSync(process.env.COACH_BUNDLE, "utf8"),
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
  const vitest = [process.execPath, fake];
  const run = (mode: string, source = "the test") =>
    testInClone({
      clone,
      name: "probe",
      source,
      bundle: `bundle for ${source}`,
      env: { FAKE: mode },
      echo: false,
      vitest,
    });
  const leftovers = () =>
    [...readdirSync(path.join(clone, "test/tests")), ...readdirSync(path.join(clone, "test/reporters"))].sort();
  return { root, clone, vitest, run, leftovers };
};

const echoed = ({ report }: CloneTestResult) =>
  report as unknown as { testFile: string; source: string; bundle: string };

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

test("a test that writes no report has no report, and leaves no files behind (#658)", async t => {
  const s = scratch(t);
  const { report, out } = await s.run("no-report");
  assert.equal(report, undefined);
  assert.equal(out, undefined);
  assert.deepEqual(s.leftovers(), UPSTREAM);
});

test("a vitest that cannot start has no report, says why, and leaves no files behind (#658)", async t => {
  const s = scratch(t);
  const { report, output } = await testInClone({
    clone: s.clone,
    name: "probe",
    source: "",
    bundle: "",
    echo: false,
    vitest: [path.join(s.root, "no-such-vitest")],
  });
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

test("a test interrupted with SIGINT still leaves no files behind (#658)", async t => {
  const s = scratch(t);
  const caller = path.join(s.root, "caller.mjs");
  const module = pathToFileURL(path.resolve(import.meta.dirname, "clone-test.ts")).href;
  const hang = { clone: s.clone, name: "probe", source: "", bundle: "", env: { FAKE: "hang" }, echo: false };
  const options = { ...hang, vitest: s.vitest };
  writeFileSync(
    caller,
    `import { testInClone } from ${JSON.stringify(module)};\nawait testInClone(${JSON.stringify(options)});\n`,
  );
  const child = spawn(process.execPath, [caller], { stdio: "ignore" });
  const exited = new Promise(resolve => child.on("close", resolve));
  while (s.leftovers().length === UPSTREAM.length) await sleep(20);
  child.kill("SIGINT");
  await exited;
  assert.deepEqual(s.leftovers(), UPSTREAM);
});
