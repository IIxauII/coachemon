import { fileURLToPath } from "node:url";
import { check, format, loadRepo } from "./check.ts";
import { REGISTRY, registryEntries } from "./registry/index.ts";

const repo = loadRepo(fileURLToPath(new URL("../..", import.meta.url)));
const problems = check(repo, REGISTRY);
for (const p of problems) console.log(format(p));
if (problems.length > 0) {
  console.log(
    `\nFAIL: ${problems.length} problems. Register each game read in scripts/game-reads/registry/ (the area's file), mark a ` +
      "hand constant that copies game data with `// @mirrors <id>` and a Mirror entry, and drop entries nothing reads.",
  );
  process.exit(1);
}
console.log(`OK: ${repo.reads.length} reads across the scanned files resolve to ${registryEntries(REGISTRY)} registry entries.`);
