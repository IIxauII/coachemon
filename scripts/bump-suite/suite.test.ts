import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pkg from "../../package.json" with { type: "json" };
import { runSuite, steps } from "./suite.ts";

test("the suite's first steps are npm test, stage for stage, so the two cannot drift apart (#711)", () => {
  const [, unit, goldens] = steps("9.1.0");
  assert.equal(`${unit.command} && ${goldens.command}`, pkg.scripts.test);
});

test("every step that reads the game runs at the version named, and nothing else does (#711)", () => {
  const all = steps("9.1.0");
  assert.deepEqual(
    all.map(s => s.name),
    ["typecheck", "unit tests", "HUD goldens", "enums:gen --check", "clone:smoke", "oracle:encounter", "oracle:preview"],
  );
  const atVersion = all.filter(s => s.env?.COACHEMON_GAME_VERSION === "9.1.0").map(s => s.name);
  assert.deepEqual(atVersion, ["clone:smoke", "oracle:encounter", "oracle:preview"]);
  const enums = all.find(s => s.name === "enums:gen --check")!;
  assert.match(enums.command, /--check --version 9\.1\.0 --source \.cache\/pokerogue\/v9\.1\.0/);
});

test("a run passes only when every step does, and keeps each step's output in its own log", async t => {
  const logs = mkdtempSync(path.join(tmpdir(), "bump-suite-"));
  t.after(() => rmSync(logs, { recursive: true, force: true }));
  const printed: string[] = [];
  const results = await runSuite(
    [
      { name: "fine", command: `node -e "console.log('all ' + 'good')"` },
      { name: "broken one", command: `node -e "console.log('it says ' + 'why'); process.exit(3)"`, env: { X: "y" } },
      { name: "sees env", command: `node -e "process.exit(process.env.X === 'y' ? 0 : 1)"`, env: { X: "y" } },
    ],
    { logs, print: line => printed.push(line) },
  );
  assert.deepEqual(
    results.map(r => [r.name, r.ok]),
    [["fine", true], ["broken one", false], ["sees env", true]],
  );
  assert.match(readFileSync(results[1].log, "utf8"), /it says why/);
  const out = printed.join("\n");
  assert.match(out, /FAIL\s+broken one/);
  assert.match(out, /it says why/, "a failed step's tail is printed");
  assert.doesNotMatch(out, /all good/, "a passing step's output stays in its log");
});
