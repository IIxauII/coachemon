import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { coachemonHome } from "../../src/home.ts";
import { importFights, LIBRARY, waiting } from "./library-import.ts";

const USAGE = "usage: npm run library:import -- [--count] [--home <home>] [<library>]";

let parsed;
try {
  parsed = parseArgs({ options: { count: { type: "boolean" }, home: { type: "string" } }, allowPositionals: true });
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

const { imported } = importFights(home, library, new Date());
for (const fight of imported) {
  const what = [
    fight.merged ? "merged" : "new",
    fight.added.length > 0 ? `added ${fight.added.join(", ")}` : "no new files",
    `${fight.statistics} statistics ${fight.statistics === 1 ? "entry" : "entries"}`,
    ...(fight.differs.length > 0 ? [`kept the library's ${fight.differs.join(", ")}, solved there from another position`] : []),
  ];
  console.log(`  ${fight.fight}: ${what.join("; ")}`);
}
console.log(`library import: ${imported.length} ${imported.length === 1 ? "fight" : "fights"} into ${library}, moved aside under ${home}/fights-imported/`);
