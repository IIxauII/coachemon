import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import { checkForks, replay } from "../../src/solver/solver.ts";
import { findPinnedClone, harnessIn } from "../clone-test/clone-test.ts";
import { promote } from "./promote.ts";
import { FIXTURES, KNOWN_FIGHTS_FILE, recheck } from "./recheck.ts";

const { values, positionals } = parseArgs({ options: { stem: { type: "string" } }, allowPositionals: true });
const [kept] = positionals;
if (kept === undefined) {
  console.error(
    [
      "usage: npm run recheck:promote -- [--stem <name>] <fight folder>",
      "  <home>/fights/<seed>-w<wave>-<fight> before library:import, <home>/fights-imported/<when>/<seed>-w<wave>-<fight> after it",
    ].join("\n"),
  );
  process.exit(2);
}

const inClone = harnessIn(findPinnedClone);
const out = await promote(
  kept,
  {
    fixtures: fileURLToPath(FIXTURES),
    knownFights: fileURLToPath(KNOWN_FIGHTS_FILE),
    pin: PINNED_GAME_VERSION,
    recheck: fight =>
      recheck(
        PINNED_GAME_VERSION,
        { replay: (given, script, carry) => replay(given, script, inClone, carry), checkForks: (given, inputs, carry) => checkForks(given, inputs, inClone, carry) },
        console.log,
        [fight],
      ),
  },
  values.stem,
);
if ("refused" in out) {
  console.error(`\nNot promoted: ${out.refused}`);
  process.exit(1);
}
console.log(`\nPromoted ${out.promoted.name}: src/solver/fixtures/${out.promoted.stem}.json and its oracle line, named in scripts/recheck/known-fights.json.`);
