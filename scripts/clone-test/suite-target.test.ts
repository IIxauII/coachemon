import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import reviewed from "../../src/escape-ladder/reviewed.json" with { type: "json" };
import { checkoutOf, findSuiteClone, suitePin, suiteVersion } from "./clone-test.ts";

const SHA = (c: string) => c.repeat(40);

/** A drift checkout of `version` under `cwd/.cache/pokerogue`, its submodules gitlinks only, as `git clone --depth 1` leaves them. */
const checkout = (t: TestContext, version: string, packageManager: string | undefined) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "suite-target-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const dir = checkoutOf(version, cwd);
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(packageManager ? { packageManager } : {}));
  git("add", "package.json");
  git("update-index", "--add", "--cacheinfo", `160000,${SHA("a")},assets`);
  git("update-index", "--add", "--cacheinfo", `160000,${SHA("b")},locales`);
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "game");
  return { cwd, dir, sha: git("rev-parse", "HEAD") };
};

test("unset, the suite runs at the pin and sets up the pinned clone (#711)", () => {
  assert.equal(suiteVersion({}), reviewed.pinned.gameVersion);
  assert.deepEqual(suitePin({}), reviewed.pinned);
});

test("COACHEMON_GAME_VERSION moves the suite to a version not yet stamped, pinned from its drift checkout (#711)", t => {
  const { cwd, sha } = checkout(t, "9.1.0", "pnpm@10.34.5+sha512.abc");
  const env = { COACHEMON_GAME_VERSION: "9.1.0" };
  assert.equal(suiteVersion(env), "9.1.0");
  assert.deepEqual(suitePin(env, cwd), { gameVersion: "9.1.0", sha, assets: SHA("a"), locales: SHA("b"), pnpm: "10.34.5" });
});

test("a target version whose checkout names no pnpm cannot be set up", t => {
  const { cwd } = checkout(t, "9.1.0", undefined);
  assert.throws(() => suitePin({ COACHEMON_GAME_VERSION: "9.1.0" }, cwd), /packageManager/);
});

test("the suite's clone is the drift checkout at its version, and names what it lacks (#711)", t => {
  const { cwd, dir } = checkout(t, "9.1.0", "pnpm@10.34.5");
  const found = findSuiteClone({ COACHEMON_GAME_VERSION: "9.1.0" }, cwd);
  assert.ok("missing" in found);
  assert.match(found.missing, new RegExp(`${dir}.*no dependencies`));
  const absent = findSuiteClone({ COACHEMON_GAME_VERSION: "9.2.0" }, cwd);
  assert.ok("missing" in absent);
  assert.match(absent.missing, /v9\.2\.0/);
});
