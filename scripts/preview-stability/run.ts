/**
 * How often a preview read k waves ahead misses its wave (#590): upstream's vitest harness walks seeded Classic runs
 * headless in the pinned clone, reads `previewFor` 1–10 waves ahead at every wave, and grades each read when its wave
 * comes. A measurement, not a test: it prints the table and writes the records beside it.
 *
 *   npm run oracle:preview -- [--seeds 12] [--last 100] [--out .cache/preview-stability.json] [--verbose]
 *   npm run oracle:preview -- --from .cache/preview-stability.json   # the table again, from a walk's records
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";
import { type Graded, report, type Stop } from "./tally.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUD = path.resolve(HERE, "../../skills/coachemon/scripts/hud");
const TEMPLATE = path.join(HERE, "stability.test.ts.template");
const reviewed = JSON.parse(readFileSync(path.resolve(HERE, "../../src/escape-ladder/reviewed.json"), "utf8"));
const clone = path.resolve(".cache/pokerogue", `v${reviewed.pinned.gameVersion}`);

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

const missing = (what: string, how: string): never => {
  console.error(`${what}\n\n  ${how}\n`);
  process.exit(2);
};
if (!existsSync(path.join(clone, "node_modules"))) {
  missing(`No provisioned clone at ${clone}.`, "npm run drift:check   # in a worktree: ln -s <main-checkout>/.cache .cache");
}
for (const sub of ["assets", "locales"]) {
  if (readdirSync(path.join(clone, sub)).length === 0) {
    missing(`The clone's \`${sub}\` submodule is empty.`, `cd ${clone} && git submodule update --init --depth 1 ${sub}`);
  }
}

// Never `99-start.js`: its refresh loop would tick game code against the harness's own game.
const files = readdirSync(HUD)
  .filter(f => f.endsWith(".js") && f !== "99-start.js")
  .sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
// Names of their own, so an encounter oracle running beside this one keeps its files.
const bundlePath = path.join(clone, "test/tests/.coach-stability.bundle.js");
const testPath = path.join(clone, "test/tests/coach-stability.test.ts");
const recordsPath = path.join(clone, "test/tests/.coach-stability.records.json");

const seeds = Array.from({ length: Number(opt.seeds) }, (_, i) => `coachemon-preview-${String(i).padStart(3, "0")}`);

const vitest = (): Promise<void> =>
  new Promise(resolve => {
    const child = spawn(
      "npx",
      ["--yes", "pnpm@10.33.2", "exec", "vitest", "run", "test/tests/coach-stability.test.ts"],
      {
        cwd: clone,
        stdio: ["inherit", opt.verbose ? "inherit" : "ignore", "inherit"],
        env: {
          ...process.env,
          COACH_BUNDLE: bundlePath,
          COACH_OUT: recordsPath,
          COACH_SEEDS: seeds.join(","),
          COACH_LAST_WAVE: opt.last,
          COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        },
      },
    );
    child.on("close", () => resolve());
  });

try {
  rmSync(recordsPath, { force: true });
  writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
  writeFileSync(testPath, readFileSync(TEMPLATE, "utf8"));
  await vitest();
  if (!existsSync(recordsPath)) {
    missing("The walk wrote no records.", "Its vitest output is above.");
  }
  const records: (Graded | Stop)[] = JSON.parse(readFileSync(recordsPath, "utf8"));
  writeFileSync(opt.out, JSON.stringify(records));
  console.log(report(records));
  console.log(`\nrecords: ${opt.out}`);
} finally {
  for (const artifact of [bundlePath, testPath, recordsPath]) {
    rmSync(artifact, { force: true });
  }
}
