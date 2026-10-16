/**
 * How often a preview misses its wave, by how far ahead it was read (#590). A measurement, not a test: it prints the
 * table and saves the records, which `--from` prints again.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { hudBundle, suiteClone, suitePin, testInClone, vitestOn } from "../clone-test/clone-test.ts";
import { type Graded, report, type Stop } from "./tally.ts";

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "stability.test.ts.template");

const { values: opt } = parseArgs({
  options: {
    seeds: { type: "string", default: "12" },
    verbose: { type: "boolean", default: false },
    last: { type: "string", default: "100" },
    out: { type: "string", default: ".cache/preview-stability.json" },
    from: { type: "string" },
  },
});

if (opt.from) {
  console.log(report(JSON.parse(readFileSync(opt.from, "utf8"))));
  process.exit(0);
}

const clone = suiteClone();
const seeds = Array.from({ length: Number(opt.seeds) }, (_, i) => `coachemon-preview-${String(i).padStart(3, "0")}`);

const { out } = await testInClone({
  clone,
  name: "stability",
  source: readFileSync(TEMPLATE, "utf8"),
  bundle: hudBundle(),
  env: { COACH_SEEDS: seeds.join(","), COACH_LAST_WAVE: opt.last },
  echo: opt.verbose,
  vitest: vitestOn(suitePin().pnpm),
});
if (out === undefined) {
  console.error("The walk wrote no records.\n\n  Its errors are above; --verbose adds vitest's output.\n");
  process.exit(2);
}
const records: (Graded | Stop)[] = JSON.parse(out);
writeFileSync(opt.out, JSON.stringify(records));
console.log(report(records));
console.log(`\nrecords: ${opt.out}`);
