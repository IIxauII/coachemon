import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LINTER = fileURLToPath(new URL("../node_modules/.bin/addons-linter", import.meta.url));

const ARTIFACT = ".output/firefox-mv3-store";

const workflow = () => readFileSync(join(ROOT, ".github/workflows/extension.yml"), "utf8").split("\n");

/** Where the linter step sits in the workflow: the `- run:` line itself, never a comment that merely names the tool. */
function linterStep(lines: string[]): number {
  const at = lines.findIndex(line => /^\s*-\s+run:.*addons-linter/.test(line));
  assert.notEqual(at, -1, "no addons-linter step in the extension workflow");
  return at;
}

/** Trips a warning and nothing else: `strict_min_version` under the floor `data_collection_permissions` needs (#379, #380). */
function warningOnlyAddon(): string {
  const dir = mkdtempSync(join(tmpdir(), "coachemon-amo-"));
  const manifest = {
    manifest_version: 3,
    name: "Warning fixture",
    version: "1.0.0",
    browser_specific_settings: {
      gecko: { id: "fixture@example.com", strict_min_version: "128.0", data_collection_permissions: { required: ["none"] } },
    },
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

const lint = (args: string[]) => spawnSync(LINTER, args, { encoding: "utf8" });

test("CI lints the built Firefox artifact, and gates on warnings (extension-distribution.md §5.6)", () => {
  const lines = workflow();
  const linter = linterStep(lines);

  const step = lines[linter]!;
  assert.ok(step.includes("--warnings-as-errors"), "the linter step must gate on warnings, or #379, #380 and #381 pass it");
  assert.ok(step.includes(ARTIFACT), `the linter step must lint ${ARTIFACT}`);

  const build = lines.findIndex(line => line.includes("build:all"));
  assert.notEqual(build, -1, "no build:all step in the extension workflow");
  assert.ok(build < linter, "the linter step must come after build:all, which writes the artifact it reads");
});

test("the linter is pinned here, so a release of it cannot turn master red (extension-distribution.md §5.6)", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "extension/package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  assert.ok(pkg.devDependencies?.["addons-linter"], "addons-linter must be an extension devDependency, so the lockfile holds its version");

  // `npm exec --no` runs that pinned copy or fails; `npx` would quietly fetch the latest release instead.
  const lines = workflow();
  assert.ok(lines[linterStep(lines)]!.includes("npm exec --no"), "the step must run the pinned copy, never fetch one");
});

test("only --warnings-as-errors makes a warning fail the linter", () => {
  const dir = warningOnlyAddon();

  const gated = lint(["--warnings-as-errors", dir]);
  assert.notEqual(gated.status, 0, `a warning must fail the gated run\n${gated.stdout}`);

  // The default the step would silently inherit if the flag were ever dropped.
  assert.equal(lint([dir]).status, 0, "the linter's own default still passes warnings; the comment above is now stale");
});
