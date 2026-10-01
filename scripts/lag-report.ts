/**
 * `node scripts/lag-report.ts <run.jsonl>…` reports each lag run; `--before a b c --after d e f` compares two sets
 * (lag-run.md §Report).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { decisionsOf, formatKindComparison } from "./lag-run/decisions.ts";
import { type RunLog, compare, formatComparison, formatDecisionFacts, formatRun, parseRun, wavesOf } from "./lag-run/report.ts";
import { formatWaveComparison } from "./lag-run/waves.ts";

const argv = process.argv.slice(2);
const read = (f: string) => parseRun(readFileSync(f, "utf8"));
const at = { before: argv.indexOf("--before"), after: argv.indexOf("--after") };

if (at.before > -1 && at.after > -1) {
  const [before, after] = at.before < at.after
    ? [argv.slice(at.before + 1, at.after), argv.slice(at.after + 1)]
    : [argv.slice(at.before + 1), argv.slice(at.after + 1, at.before)];
  const runs = { before: before.map(read), after: after.map(read) };
  console.log(formatComparison(compare(runs.before.map(r => r.windows), runs.after.map(r => r.windows)), runs));
  console.log("\n" + formatWaveComparison(runs.before.map(wavesOf), runs.after.map(wavesOf)));
  const pooled = (rs: RunLog[]) => rs.flatMap(r => decisionsOf(r.windows as never));
  console.log("\n" + [...runs.before, ...runs.after].map(formatDecisionFacts).join("\n"));
  console.log("\n" + formatKindComparison(pooled(runs.before), pooled(runs.after)));
} else if (argv.length) {
  console.log(argv.map(f => formatRun(basename(f), read(f))).join("\n\n"));
} else {
  console.error("usage: node scripts/lag-report.ts <run.jsonl>… | --before <a> <b> <c> --after <d> <e> <f>");
  process.exit(2);
}
