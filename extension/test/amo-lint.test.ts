/**
 * The AMO linter step (§5.6). The guard (§5.5) checks what *we* decided the manifest should say; `addons-linter` is
 * what AMO's own review runs, so it is the only check in CI that can tell us their verdict before a submission does.
 *
 * The whole step hangs on one flag. `addons-linter` exits **0** on warnings by default, and every finding that has
 * reached us from a submission so far was a warning, never an error: the data-collection floor on desktop (#379) and
 * on Android (#380), and `hud.js`'s dynamic `import()` (#381). A step without `--warnings-as-errors` would have been
 * green on all three — indistinguishable from having no step at all, which is what #384 was opened about. So the
 * second test below pins the flag's effect against the linter itself, rather than trusting its documented default.
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

/** The artifact AMO is handed, which is also the one the step lints (§5.6). */
const TARGET = ".output/firefox-mv3-store";

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
  const linter = lines.findIndex(line => line.includes("addons-linter"));
  assert.notEqual(linter, -1, "no addons-linter step in the extension workflow");

  const step = lines[linter]!;
  assert.ok(step.includes("--warnings-as-errors"), "the linter step must gate on warnings, or #379, #380 and #381 pass it");
  assert.ok(step.includes(TARGET), `the linter step must lint ${TARGET}`);

  // The artifact has to exist before it can be linted, so the step comes after the build that writes it.
  const build = lines.findIndex(line => line.includes("build:all"));
  assert.notEqual(build, -1, "no build:all step in the extension workflow");
  assert.ok(build < linter, "the linter step must come after build:all, which writes the artifact it reads");
});

test("only --warnings-as-errors makes a warning fail the linter", () => {
  const dir = warningOnlyAddon();

  const gated = lint(["--warnings-as-errors", dir]);
  assert.notEqual(gated.status, 0, `a warning must fail the gated run\n${gated.stdout}`);

  // Not a style preference: this is the default the step would silently inherit if the flag were ever dropped.
  assert.equal(lint([dir]).status, 0, "the linter's own default still passes warnings; the comment above is now stale");
});
