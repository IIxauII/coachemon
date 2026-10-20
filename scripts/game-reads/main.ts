import { fileURLToPath } from "node:url";
import { check, format, loadRepo, type Repo } from "./check.ts";
import { REGISTRY, registryEntries } from "./registry/index.ts";

let repo: Repo;
try {
  repo = loadRepo(fileURLToPath(new URL("../..", import.meta.url)));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const problems = check(repo, REGISTRY);
for (const p of problems) console.log(format(p));
if (problems.length > 0) {
  console.log(
    `\nFAIL: ${problems.length} problems. Register each game read in scripts/game-reads/registry/ (the area's file), mark a ` +
      "hand constant that copies game data with `// @mirrors <id>` and a Mirror entry, and drop entries nothing reads. A " +
      'name the game declares needs an entry even where our code, the DOM or Node declares it too: from: "ours" when the ' +
      "name is ours.",
  );
  process.exit(1);
}
console.log(`OK: ${repo.reads.length} reads across the scanned files resolve to ${registryEntries(REGISTRY)} registry entries.`);
