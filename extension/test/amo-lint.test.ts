/**
 * The AMO linter step (§5.6). The guard (§5.5) checks what *we* decided the manifest should say; `addons-linter` is
 * what AMO's own review runs, so it is the only check in CI that can tell us their verdict before a submission does.
 *
 * The whole step hangs on one flag, for the reason §5.6 gives: the linter exits **0** on warnings, and every finding
 * that has reached us from a submission so far was a warning rather than an error — the data-collection floor on
 * desktop (#379) and on Android (#380), and `hud.js`'s dynamic `import()` (#381). So the second test pins the flag's
 * effect against the linter itself rather than trusting its documented default.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LINTER = fileURLToPath(new URL("../node_modules/.bin/addons-linter", import.meta.url));

/** The built artifact the step lints, which is what the store zip is made of (§5.6). */
const ARTIFACT = ".output/firefox-mv3-store";

const workflow = () => readFileSync(join(ROOT, ".github/workflows/extension.yml"), "utf8").split("\n");

/**
 * A minimal add-on that trips a warning and nothing else: `strict_min_version` under the floor that
 * `data_collection_permissions` needs, which is #379 and #380 exactly. Written fresh per run, outside the repo.
 */
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

test("CI lints the built Firefox artifact, and gates on warnings (§5.6)", () => {
  const lines = workflow();
  // The `- run:` line itself, never a comment that merely names the tool: §5.6's prose does that constantly.
  const linter = lines.findIndex(line => /^\s*-\s+run:.*addons-linter/.test(line));
  assert.notEqual(linter, -1, "no addons-linter step in the extension workflow");

  const step = lines[linter]!;
  assert.ok(step.includes("--warnings-as-errors"), "the linter step must gate on warnings, or #379, #380 and #381 pass it");
  assert.ok(step.includes(ARTIFACT), `the linter step must lint ${ARTIFACT}`);

  // The artifact has to exist before it can be linted, so the step comes after the build that writes it.
  const build = lines.findIndex(line => line.includes("build:all"));
  assert.notEqual(build, -1, "no build:all step in the extension workflow");
  assert.ok(build < linter, "the linter step must come after build:all, which writes the artifact it reads");
});

test("the linter is pinned here, so a release of it cannot turn master red (§5.6)", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "extension/package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  assert.ok(pkg.devDependencies?.["addons-linter"], "addons-linter must be an extension devDependency, so the lockfile holds its version");

  // `npm exec --no` runs that pinned copy or fails; `npx` would quietly fetch the latest release instead.
  const step = workflow().find(line => /^\s*-\s+run:.*addons-linter/.test(line))!;
  assert.ok(step.includes("npm exec --no"), "the step must run the pinned copy, never fetch one");
});

test("only --warnings-as-errors makes a warning fail the linter", () => {
  const dir = warningOnlyAddon();

  const gated = lint(["--warnings-as-errors", dir]);
  assert.notEqual(gated.status, 0, `a warning must fail the gated run\n${gated.stdout}`);

  // Not a style preference: this is the default the step would silently inherit if the flag were ever dropped.
  assert.equal(lint([dir]).status, 0, "the linter's own default still passes warnings; the comment above is now stale");
});
