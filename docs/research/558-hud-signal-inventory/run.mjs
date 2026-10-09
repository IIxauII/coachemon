// `node docs/research/558-hud-signal-inventory/run.mjs` times the HUD's team-value building blocks on real game objects:
// the encounter oracle's route (scripts/encounter-oracle/run.ts), with the bench test in place of the oracle's.
// Needs the provisioned pinned clone under .cache/pokerogue (in a worktree: link the main checkout's .cache).
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const { bundle } = await import(path.join(ROOT, "skills/coachemon/scripts/hud-bundle.mjs"));
const HUD = path.join(ROOT, "skills/coachemon/scripts/hud");
const reviewed = JSON.parse(readFileSync(path.join(ROOT, "src/escape-ladder/reviewed.json"), "utf8"));
const clone = path.join(ROOT, ".cache/pokerogue", `v${reviewed.pinned.gameVersion}`);
const files = readdirSync(HUD).filter(f => f.endsWith(".js") && f !== "99-start.js").sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")]);
const bundlePath = path.join(clone, "test/tests/.bench558.bundle.js");
const testPath = path.join(clone, "test/tests/bench558.test.ts");
writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
copyFileSync(path.join(HERE, "bench558.test.ts"), testPath);
try {
  const r = spawnSync("npx", ["--yes", "pnpm@10.33.2", "exec", "vitest", "run", "test/tests/bench558.test.ts"], {
    cwd: clone, stdio: ["inherit", "pipe", "pipe"], maxBuffer: 1e9,
    env: { ...process.env, COACH_BUNDLE: bundlePath, BENCH_OUT: path.join(HERE, "bench558.json"), COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  // The one unhandled `getItem` error is the clone's own i18n rejection (game-code.md §13).
  console.log((r.stdout + r.stderr).replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter(l => /✓|×|FAIL|Error|Tests /.test(l)).join("\n"));
} finally {
  rmSync(bundlePath, { force: true });
  rmSync(testPath, { force: true });
}
