/**
 * Mystery Encounter oracle: the coach's encounter card judged against the real game, headless.
 *
 *   npm run oracle:encounter                 # every case
 *   npm run oracle:encounter -- -t "Part"    # vitest's name filter, passed through
 *
 * The encounter card re-implements what each encounter's option closures do, because they can't be read from the
 * page (`46-encounter.js`). Everything else the HUD claims is checked against a mock, which can only say the port
 * matches what we *think* the game does. This runs the card against the game itself: upstream's vitest harness
 * plays the encounter headless in the pinned clone, the card reads that live scene, and the claims it makes are
 * compared with what the game then actually did.
 *
 * Every exact claim the card makes is walked: the teleport destination, the part-timer's pay, the chest (both its
 * prize tiers and its trap), the store's four shops, who the fallout burns, and the vitamin dealer's new nature.
 * The take / ok / avoid call is judgement and stays unchecked.
 *
 * Dev-only. Nothing here ships: the oracle lives in this repo, the game stays in `.cache`, and the two files this
 * writes into the clone are removed again on the way out. Run it at a pin bump, beside `npm run drift:check`: a
 * moved hash says "re-read this", the oracle says "the numbers still match".
 *
 * It needs the pinned clone with its dependencies, which `drift:check` alone does not leave behind:
 *
 *   npm run drift:check                                  # clones .cache/pokerogue/v<pin>
 *   cd .cache/pokerogue/v<pin>
 *   git submodule update --init --depth 1 locales assets # assets carries the battle animations
 *   pnpm install --frozen-lockfile                       # pnpm 10, node >= 24.9
 *
 * Without `assets`, every option that starts a battle dies in `populateMoveAnim` — upstream's own encounter tests
 * fail the same way, so a red run there is the clone, not the card.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUD = path.resolve(HERE, "../../skills/coachemon/scripts/hud");
const TEMPLATE = path.join(HERE, "oracle.test.ts.template");
const reviewed = JSON.parse(readFileSync(path.resolve(HERE, "../../src/escape-ladder/reviewed.json"), "utf8"));
const clone = path.resolve(".cache/pokerogue", `v${reviewed.pinned.gameVersion}`);

const missing = (what: string, how: string): never => {
  console.error(`${what}\n\n  ${how}\n`);
  process.exit(2);
};

if (!existsSync(clone)) {
  missing(`No pinned clone at ${clone}.`, "npm run drift:check");
}
if (!existsSync(path.join(clone, "node_modules"))) {
  missing(`The clone at ${clone} has no dependencies.`, `cd ${clone} && pnpm install --frozen-lockfile`);
}
// An empty submodule is the quiet failure: every option that starts a battle dies in `populateMoveAnim` with no
// hint of why, so say it here rather than let a red run look like the card's fault.
for (const sub of ["assets", "locales"]) {
  if (readdirSync(path.join(clone, sub)).length === 0) {
    missing(`The clone's \`${sub}\` submodule is empty.`, `cd ${clone} && git submodule update --init --depth 1 ${sub}`);
  }
}

// The HUD as one eval-able script, minus `99-start.js`: the oracle calls the card directly and must never start a
// refresh loop that ticks game code against the harness's own game.
const files = readdirSync(HUD)
  .filter(f => f.endsWith(".js") && f !== "99-start.js")
  .sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
const bundlePath = path.join(clone, "test/tests/.coach-oracle.bundle.js");
const testPath = path.join(clone, "test/tests/coach-oracle.test.ts");

let code = 0;
try {
  writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
  writeFileSync(testPath, readFileSync(TEMPLATE, "utf8"));
  execFileSync("npx", ["--yes", "pnpm@10.33.2", "exec", "vitest", "run", "test/tests/coach-oracle.test.ts", ...process.argv.slice(2)], {
    cwd: clone,
    stdio: "inherit",
    env: { ...process.env, COACH_BUNDLE: bundlePath, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
} catch {
  code = 1;
} finally {
  rmSync(bundlePath, { force: true });
  rmSync(testPath, { force: true });
}
process.exit(code);
