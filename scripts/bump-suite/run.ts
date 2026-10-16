/** `npm run bump:suite -- --version <new>`: the suite at a game version not yet stamped, one pass/fail per step (pin-bump.md). */
import { parseArgs } from "node:util";
import { logsAt, runSuite, steps } from "./suite.ts";

const { values: args } = parseArgs({ options: { version: { type: "string" } } });
if (!args.version || !/^\d+(\.\d+)+$/.test(args.version)) {
  console.error("Usage: npm run bump:suite -- --version <game version>, such as 1.12.1.1");
  process.exit(2);
}

const results = await runSuite(steps(args.version), { logs: logsAt(args.version), print: line => console.log(line) });
const failed = results.filter(r => !r.ok).map(r => r.name);
console.log(failed.length === 0 ? `\nOK: the suite passes at ${args.version}.` : `\nFAIL at ${args.version}: ${failed.join(", ")}.`);
process.exit(failed.length === 0 ? 0 : 1);
