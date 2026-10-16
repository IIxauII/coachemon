/**
 * Sets up the player's clone in the coachemon home as the plugin's job does, then boots upstream's harness in it and
 * plays a turn. Exits 0 when the turn played and 2 otherwise, read off vitest's report (game-code.md §13).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coachemonHome } from "../../src/home.ts";
import { setUpClone } from "../../src/solver/clone.ts";
import { suitePin, testInClone, vitestOn } from "../clone-test/clone-test.ts";

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "smoke.test.ts.template");

const pin = suitePin();
// A setup prunes every older version in its home: at a version not yet stamped, the player's own home would lose the
// clone the plugin solves with.
const home =
  process.env.COACHEMON_GAME_VERSION && !process.env.COACHEMON_HOME ? path.resolve(".cache/coachemon-home") : coachemonHome();
const setup = await setUpClone(home, { signal: new AbortController().signal, progress: line => console.log(line) }, { pin });
if (setup.kind !== "clone") {
  console.error(`\nclone: no answer — ${setup.message}`);
  process.exit(2);
}
console.log(`clone: set up at ${setup.dir}`);

const { report } = await testInClone({
  clone: setup.dir,
  name: "clone-smoke",
  source: readFileSync(TEMPLATE, "utf8"),
  bundle: "",
  echo: true,
  vitest: vitestOn(pin.pnpm),
});
if (report?.numPassedTests !== 1) {
  console.error("\nclone: no answer — the harness didn't play a turn in the clone. Its own output is above.");
  process.exit(2);
}
console.log("\nclone: the harness booted in the clone and played a turn.");
