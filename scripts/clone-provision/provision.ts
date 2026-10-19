import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { checkoutOf, pnpmOf } from "../clone-test/clone-test.ts";

const GAME_REPO = "https://github.com/pagefaultgames/pokerogue.git";

export type Run = (what: string, command: string, args: readonly string[], cwd: string) => void;

const runInherit: Run = (what, command, args, cwd) => {
  console.log(`clone: ${what}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

const filled = (dir: string) => existsSync(dir) && readdirSync(dir).length > 0;

type Options = { cwd?: string; run?: Run };

/** The drift checkout of the game at `version`, cloned bare (no submodules, no dependencies) if absent. */
export function cloneGame(version: string, { cwd = process.cwd(), run = runInherit }: Options = {}): string {
  const dir = checkoutOf(version, cwd);
  if (!existsSync(dir)) {
    run(`cloning the game at v${version}`, "git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", `v${version}`, GAME_REPO, dir], cwd);
  }
  return dir;
}

/** The drift checkout at `version` with what the harness needs, each step skipped when already done. */
export function provision(version: string, { cwd = process.cwd(), run = runInherit }: Options = {}): string {
  const dir = cloneGame(version, { cwd, run });
  const empty = ["assets", "locales"].filter(sub => !filled(path.join(dir, sub)));
  if (empty.length) run(`fetching ${empty.join(" and ")}`, "git", ["submodule", "update", "--init", "--depth", "1", ...empty], dir);
  if (!existsSync(path.join(dir, "node_modules"))) {
    const pnpm = pnpmOf(dir);
    run(`installing the game's dependencies with pnpm ${pnpm}`, "npx", ["--yes", `pnpm@${pnpm}`, "install", "--frozen-lockfile"], dir);
  }
  return dir;
}
