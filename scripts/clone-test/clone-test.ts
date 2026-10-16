import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";
import reviewed from "../../src/escape-ladder/reviewed.json" with { type: "json" };
import type { ClonePin } from "../../src/solver/clone.ts";
import type { FoundClone } from "../../src/solver/run-in-clone.ts";

export {
  type CloneTest,
  type CloneTestResult,
  harnessIn,
  testInClone,
  vitestOn,
  type VitestReport,
} from "../../src/solver/run-in-clone.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUD = path.resolve(HERE, "../../skills/coachemon/scripts/hud");

/** The clone pinned to the reviewed game version, or what it lacks and the command that provides it. */
export const findPinnedClone = (): FoundClone => findClone(checkoutOf(reviewed.pinned.gameVersion));

type Env = Record<string, string | undefined>;

/** The game version the suite's clone steps run at: the pin, or `COACHEMON_GAME_VERSION` during a bump, before its stamp. */
export const suiteVersion = (env: Env = process.env): string => env.COACHEMON_GAME_VERSION || reviewed.pinned.gameVersion;

export const checkoutOf = (version: string, cwd = process.cwd()): string => path.resolve(cwd, ".cache/pokerogue", `v${version}`);

/** The drift checkout at the suite's version, or what it lacks and the command that provides it. */
export const findSuiteClone = (env: Env = process.env, cwd = process.cwd()): FoundClone => {
  const version = suiteVersion(env);
  if (existsSync(checkoutOf(version, cwd))) return findClone(checkoutOf(version, cwd));
  return {
    missing: `No clone at ${checkoutOf(version, cwd)}.`,
    how: `npm run drift:check -- --version ${version}   # then its submodules and pnpm (pin-bump.md)`,
  };
};

/** The pin a stamp records for the game checkout at `source`: its commit, its submodules and the pnpm it names. */
export const pinOf = (gameVersion: string, source: string): ClonePin => {
  const rev = (what: string) => execFileSync("git", ["-C", source, "rev-parse", what], { encoding: "utf8" }).trim();
  const packageManager = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8")).packageManager ?? "";
  const pnpm = /^pnpm@([^+]+)/.exec(packageManager)?.[1];
  if (pnpm === undefined) throw new Error(`${source}/package.json names no pnpm packageManager to set a clone up with.`);
  return { gameVersion, sha: rev("HEAD"), locales: rev("HEAD:locales"), assets: rev("HEAD:assets"), pnpm };
};

/** The pin a player's clone at the suite's version is set up from: read off its drift checkout until a stamp writes it. */
export const suitePin = (env: Env = process.env, cwd = process.cwd()): ClonePin => {
  const gameVersion = env.COACHEMON_GAME_VERSION;
  if (!gameVersion) return reviewed.pinned;
  return pinOf(gameVersion, checkoutOf(gameVersion, cwd));
};

export const findClone = (clone: string): FoundClone => {
  if (!existsSync(clone)) {
    // A worktree's `drift:check` leaves a bare clone, and provisioning it re-fetches the 815 MB `assets` submodule
    // (#296).
    return {
      missing: `No pinned clone at ${clone}.`,
      how: "npm run drift:check   # in a worktree: ln -s <main-checkout>/.cache .cache",
    };
  }
  if (!existsSync(path.join(clone, "node_modules"))) {
    return { missing: `The clone at ${clone} has no dependencies.`, how: `cd ${clone} && pnpm install --frozen-lockfile` };
  }
  // An empty submodule is the quiet failure: every battle a test starts dies in `populateMoveAnim` with no hint of
  // why, and the failure passes for the oracle's answer.
  for (const sub of ["assets", "locales"]) {
    if (readdirSync(path.join(clone, sub)).length === 0) {
      return {
        missing: `The clone's \`${sub}\` submodule is empty.`,
        how: `cd ${clone} && git submodule update --init --depth 1 ${sub}`,
      };
    }
  }
  return { clone };
};

/** The clone at the suite's game version, or exit 2: no answer (game-code.md §13). */
export const suiteClone = (): string => {
  const found = findSuiteClone();
  if ("clone" in found) return found.clone;
  console.error(`${found.missing}\n\n  ${found.how}\n`);
  process.exit(2);
};

export const hudBundle = (): string => {
  // Never `99-start.js`: its refresh loop would tick game code against the harness's own game.
  const files = readdirSync(HUD)
    .filter(f => f.endsWith(".js") && f !== "99-start.js")
    .sort()
    .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);
  return bundle("hud", { expose: true, files });
};
