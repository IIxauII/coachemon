/** Cuts the plugin copy of the release `package.json` names, smokes it, and appends it to the `plugin` branch
 * (extension-distribution.md §14.7). Without `--push` it stops before the commit and leaves the copy for a look.
 * Usage: node scripts/release/publish-plugin.ts [--push <remote url>] */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assemble } from "./plugin-copy.ts";
import { smoke } from "./plugin-smoke.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BRANCH = "refs/heads/plugin";

const argv = process.argv.slice(2);
const remote = argv[0] === "--push" ? argv[1] : undefined;
if (argv.length > 0 && !remote) {
  console.error("usage: node scripts/release/publish-plugin.ts [--push <remote url>]");
  process.exit(2);
}

const git = (args: string[], env?: NodeJS.ProcessEnv) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", env: { ...process.env, ...env } }).trim();
const version = (JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")) as { version: string }).version;
// The tag, not HEAD (extension-distribution.md §14.7).
const source = git(["rev-parse", "--verify", `v${version}^{commit}`]);

let parent: string | undefined;
if (remote) {
  parent = git(["ls-remote", remote, BRANCH]).split("\t")[0] || undefined;
  if (parent) {
    git(["fetch", "--no-tags", remote, BRANCH]);
    const held = (JSON.parse(git(["show", `${parent}:package.json`])) as { version: string }).version;
    if (held === version) {
      console.log(`the plugin branch already holds ${version}`);
      process.exit(0);
    }
  }
}

const work = mkdtempSync(path.join(tmpdir(), "coach-plugin-"));
const out = path.join(work, "copy");
mkdirSync(out);
const files = assemble(REPO, source, out);

// Written before the smoke, whose `npm ci` fills `out` with a `node_modules`.
const index = { GIT_INDEX_FILE: path.join(work, "index") };
execFileSync("git", ["--work-tree", out, "update-index", "--add", "-z", "--stdin"], { cwd: REPO, env: { ...process.env, ...index }, input: files.join("\0") });
const tree = git(["write-tree"], index);

const failures = await smoke(out);
if (failures.length > 0) {
  console.error(`the plugin copy of ${version} failed its smoke, so nothing was pushed:\n${failures.map(f => `  ${f}`).join("\n")}`);
  process.exit(1);
}
if (!remote) {
  console.log(`the plugin copy of ${version} passed its smoke: tree ${tree}, files in ${out}`);
  process.exit(0);
}

const message = `chore(release): plugin copy of ${version}\n\nBuilt from ${source}.`;
const commit = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message]);
git(["push", remote, `${commit}:${BRANCH}`]);
console.log(`pushed the plugin copy of ${version} as ${commit}`);
