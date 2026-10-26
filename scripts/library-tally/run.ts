import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { coachemonHome } from "../../src/home.ts";
import { statisticsEntriesIn } from "../../src/solver/fight-library.ts";
import { LIBRARY } from "../library-replay/library-replay.ts";
import { report } from "./tally.ts";

const USAGE = "usage: npm run library:tally -- [--home | <folder of fight folders>]";

let parsed;
try {
  parsed = parseArgs({ options: { home: { type: "boolean" } }, allowPositionals: true });
} catch {
  console.error(USAGE);
  process.exit(2);
}
const { values, positionals } = parsed;
if (positionals.length > 1 || (values.home && positionals.length > 0)) {
  console.error(USAGE);
  process.exit(2);
}
const [folder = values.home ? coachemonHome() : fileURLToPath(LIBRARY)] = positionals;
if (!existsSync(folder)) {
  console.error(`library tally: no folder at ${folder}\n${USAGE}`);
  process.exit(2);
}

const { entries, unread } = statisticsEntriesIn(values.home ? { home: folder } : { library: folder });
console.log(`library tally: ${entries.length} statistics ${entries.length === 1 ? "entry" : "entries"} under ${folder}\n`);
console.log(report(entries));
if (unread.length > 0) console.log(`\nskipped, not an entry: ${unread.join(", ")}`);
