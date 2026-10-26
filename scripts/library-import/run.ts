import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import { coachemonHome } from "../../src/home.ts";
import { replay } from "../../src/solver/solver.ts";
import { findPinnedClone, harnessIn } from "../clone-test/clone-test.ts";
import { described } from "../library-replay/library-replay.ts";
import { importFights, LIBRARY, waiting } from "./library-import.ts";

const USAGE = "usage: npm run library:import -- [--count | --remind] [--home <home>] [<library>]";

let parsed;
try {
  parsed = parseArgs({ options: { count: { type: "boolean" }, remind: { type: "boolean" }, home: { type: "string" } }, allowPositionals: true });
} catch {
  console.error(USAGE);
  process.exit(2);
}
const { values, positionals } = parsed;
if (positionals.length > 1) {
  console.error(USAGE);
  process.exit(2);
}
const home = values.home ?? coachemonHome();
const [library = fileURLToPath(LIBRARY)] = positionals;

if (values.count) {
  console.log(waiting(home));
  process.exit(0);
}

if (values.remind) {
  const count = waiting(home);
  if (count > 0)
    console.log(
      `${count} recorded ${count === 1 ? "fight is" : "fights are"} waiting for import into the fight library. ` +
        "At a natural pause, offer `/import-fights` once this session; run it only on a yes.",
    );
  process.exit(0);
}

const inClone = harnessIn(findPinnedClone);
const { imported } = await importFights(home, library, new Date(), {
  version: PINNED_GAME_VERSION,
  replay: (given, script, carry) => replay(given, script, inClone, carry),
});
for (const fight of imported) {
  const what = [
    fight.merged ? "merged" : "new",
    fight.added.length > 0 ? `added ${fight.added.join(", ")}` : "no new files",
    `${fight.statistics} statistics ${fight.statistics === 1 ? "entry" : "entries"}`,
    ...(fight.differs.length > 0 ? [`kept the library's ${fight.differs.join(", ")}, solved there from another position`] : []),
  ];
  console.log(`  ${fight.fight}: ${what.join("; ")}`);
  for (const { turn, outcome } of fight.failed) console.log(`    turn ${turn}'s oracle line ${described(outcome, PINNED_GAME_VERSION)}`);
  if (fight.nicknames.length > 0) console.log(`    nicknames: ${fight.nicknames.join(", ")}`);
}
console.log(`library import: ${imported.length} ${imported.length === 1 ? "fight" : "fights"} into ${library}, moved aside under ${home}/fights-imported/`);
const failed = imported.reduce((n, fight) => n + fight.failed.length, 0);
console.log(`library import: ${failed} new oracle ${failed === 1 ? "line" : "lines"} failed to replay on ${PINNED_GAME_VERSION}`);
const nicknames = [...new Set(imported.flatMap(fight => fight.nicknames))].sort();
console.log(`library import: nicknames found: ${nicknames.length > 0 ? nicknames.join(", ") : "none"}`);
