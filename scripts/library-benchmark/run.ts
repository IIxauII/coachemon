import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import { solve } from "../../src/solver/solver.ts";
import { findPinnedClone, harnessIn } from "../clone-test/clone-test.ts";
import { LIBRARY, messageOf } from "../library-replay/library-replay.ts";
import { benchmark, settingSets } from "./benchmark.ts";

const SETS = new URL("./sets.json", import.meta.url);

const PROGRESS_EVERY = 1000;

const USAGE =
  "usage: npm run library:benchmark -- [--sets <sets.json>] [--fight <name>]... [--wave <n>]... [--workers <n>] [<folder of fight folders>]";

let parsed;
try {
  parsed = parseArgs({
    options: {
      sets: { type: "string" },
      fight: { type: "string", multiple: true },
      wave: { type: "string", multiple: true },
      workers: { type: "string" },
    },
    allowPositionals: true,
  });
} catch {
  console.error(USAGE);
  process.exit(2);
}
const { values, positionals } = parsed;
const [folder = fileURLToPath(LIBRARY), ...more] = positionals;
const waves = (values.wave ?? []).map(Number);
const workers = values.workers === undefined ? undefined : Number(values.workers);
if (more.length > 0 || waves.some(w => !Number.isInteger(w)) || (workers !== undefined && !(Number.isInteger(workers) && workers > 0))) {
  console.error(USAGE);
  process.exit(2);
}
if (!existsSync(folder)) {
  console.error(`library benchmark: no folder at ${folder}\n${USAGE}`);
  process.exit(2);
}
const setsFile = values.sets ?? fileURLToPath(SETS);
let text: string;
try {
  text = readFileSync(setsFile, "utf8");
} catch (e) {
  console.error(`library benchmark: could not read ${setsFile}: ${messageOf(e)}`);
  process.exit(2);
}
const sets = settingSets(text);
if (!sets.ok) {
  console.error(`library benchmark: ${setsFile}: ${sets.why}`);
  process.exit(2);
}
const found = findPinnedClone();
if ("missing" in found) {
  console.error(`library benchmark: ${found.missing} Set it up with \`${found.how}\``);
  process.exit(2);
}

const inClone = harnessIn(findPinnedClone);
await benchmark(
  folder,
  sets.sets,
  (input, statistics, carry) => {
    let shown = -PROGRESS_EVERY;
    return solve(input, {
      clone: inClone,
      workers,
      carry,
      statistics,
      progress: ({ spent, budget }) => {
        if (spent - shown < PROGRESS_EVERY) return;
        shown = spent;
        console.error(`library benchmark: searched ${spent.toLocaleString("en")} of ${budget.toLocaleString("en")} turns`);
      },
    });
  },
  {
    version: PINNED_GAME_VERSION,
    filter: { fights: values.fight, waves },
    print: console.log,
  },
);
console.log("library benchmark: done; `npm run library:tally` tables these runs beside the live solves");
