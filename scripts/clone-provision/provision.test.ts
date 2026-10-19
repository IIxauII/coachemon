import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { checkoutOf } from "../clone-test/clone-test.ts";
import { provision, type Run } from "./provision.ts";

const home = (t: TestContext) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "clone-provision-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
};

/** Records each step and does what its command would to the checkout, so the next step sees it done. */
const recorder = (packageManager = "pnpm@10.34.5+sha512.abc") => {
  const steps: string[] = [];
  const run: Run = (_what, command, args, cwd) => {
    steps.push([command, ...args].join(" "));
    if (args.includes("clone")) {
      const dir = args.at(-1)!;
      mkdirSync(path.join(dir, "assets"), { recursive: true });
      mkdirSync(path.join(dir, "locales"));
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager }));
    }
    if (args.includes("submodule")) for (const sub of args.filter(a => a === "assets" || a === "locales")) writeFileSync(path.join(cwd, sub, "x"), "");
    if (args.includes("install")) mkdirSync(path.join(cwd, "node_modules"));
  };
  return { steps, run };
};

test("a version with no checkout is cloned, its submodules fetched and installed with the game's own pnpm", t => {
  const cwd = home(t);
  const { steps, run } = recorder();
  const dir = provision("9.1.0", { cwd, run });
  assert.equal(dir, checkoutOf("9.1.0", cwd));
  assert.equal(steps.length, 3);
  assert.match(steps[0], /^git .*clone .*--branch v9\.1\.0 https:\/\/github\.com\/pagefaultgames\/pokerogue\.git /);
  assert.equal(steps[1], "git submodule update --init --depth 1 assets locales");
  assert.equal(steps[2], "npx --yes pnpm@10.34.5 install --frozen-lockfile");
});

test("a checkout already set up runs nothing, and one half set up runs only what it lacks", t => {
  const cwd = home(t);
  const first = recorder();
  provision("9.1.0", { cwd, run: first.run });
  const again = recorder();
  provision("9.1.0", { cwd, run: again.run });
  assert.deepEqual(again.steps, []);

  rmSync(path.join(checkoutOf("9.1.0", cwd), "locales", "x"));
  const half = recorder();
  provision("9.1.0", { cwd, run: half.run });
  assert.deepEqual(half.steps, ["git submodule update --init --depth 1 locales"]);
});

test("a checkout whose game names no pnpm is refused before installing", t => {
  const cwd = home(t);
  const { steps, run } = recorder("npm@10");
  assert.throws(() => provision("9.1.0", { cwd, run }), /packageManager/);
  assert.equal(steps.length, 2);
});
