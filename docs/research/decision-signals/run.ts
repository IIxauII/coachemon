/**
 * Research harness for #518 (research branch only, never merged): the watch (`watch.js`) read against the real game,
 * headless, at each kind of decision, next to the overlay's own detectors.
 *
 *   node docs/research/decision-signals/run.ts [vitest args]     # writes .cache/decision-signals/<stamp>.json
 *
 * The encounter oracle's mechanics (scripts/encounter-oracle/run.ts): upstream's vitest harness in the pinned clone
 * plays to each decision, and the overlay bundle and the watch are evaluated against that live scene. The timings are
 * V8 (Node), not Orion; `bench-jsc.js` is the JavaScriptCore number.
 */
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../../skills/coachemon/scripts/hud-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const HUD = path.join(ROOT, "skills/coachemon/scripts/hud");
const reviewed = JSON.parse(readFileSync(path.join(ROOT, "src/escape-ladder/reviewed.json"), "utf8"));
const clone = path.join(ROOT, `.cache/pokerogue/v${reviewed.pinned.gameVersion}`);

const files = readdirSync(HUD).filter(f => f.endsWith(".js") && f !== "99-start.js").sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
const outDir = path.join(ROOT, ".cache/decision-signals");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const bundlePath = path.join(clone, "test/tests/.coach-signals.bundle.js");
const watchPath = path.join(clone, "test/tests/.coach-watch.js");
const testPath = path.join(clone, "test/tests/coach-signals.test.ts");
try {
  writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
  copyFileSync(path.join(HERE, "watch.js"), watchPath);
  writeFileSync(testPath, readFileSync(path.join(HERE, "signals.test.ts.template"), "utf8"));
  const code = await new Promise<number>(resolve => {
    const child = spawn("npx", ["--yes", "pnpm@10.33.2", "exec", "vitest", "run", "test/tests/coach-signals.test.ts",
      "--testTimeout=600000", ...process.argv.slice(2)], {
      cwd: clone, stdio: "inherit",
      env: { ...process.env, COACH_BUNDLE: bundlePath, COACH_OUT: out, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    child.on("exit", c => resolve(c ?? 1));
  });
  console.log(`\ndecision-signals: vitest exited ${code}; results in ${path.relative(ROOT, out)}`);
} finally {
  for (const f of [bundlePath, watchPath, testPath]) rmSync(f, { force: true });
}
