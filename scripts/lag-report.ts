/**
 * `node scripts/lag-report.ts <run.jsonl>…` reports each lag run; `--before a b c --after d e f` compares two sets
 * (docs/lag-run.md).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { compare, formatComparison, formatRun, parseRun } from "./lag-run/report.ts";

const argv = process.argv.slice(2);
const read = (f: string) => parseRun(readFileSync(f, "utf8"));
const b = argv.indexOf("--before"), a = argv.indexOf("--after");

if (b > -1 && a > -1) {
  const [before, after] = b < a ? [argv.slice(b + 1, a), argv.slice(a + 1)] : [argv.slice(b + 1), argv.slice(a + 1, b)];
  const runs = { before: before.map(read), after: after.map(read) };
  console.log(formatComparison(compare(runs.before.map(r => r.windows), runs.after.map(r => r.windows)), runs));
} else if (argv.length) {
  console.log(argv.map(f => formatRun(basename(f), read(f))).join("\n\n"));
} else {
  console.error("usage: node scripts/lag-report.ts <run.jsonl>… | --before <a> <b> <c> --after <d> <e> <f>");
  process.exit(2);
}
