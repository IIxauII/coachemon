/** The slim copy of the plugin a release ships: what it holds, and what a file in it reaches (extension-distribution.md §14.7). */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

const SHIPPED_DIRS = ["src/", "skills/"];
const SHIPPED_FILES = [
  ".claude-plugin/plugin.json",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "README.md",
  "PRIVACY.md",
];

const LEFT_OUT = [
  /\.test\.ts$/,
  /\/fixtures\//,
  /^skills\/coachemon\/scripts\/test\//,
  /^src\/(hub\/fake-ext|page\/fake-page|game\/fake-game|stuck\/replay|escape-ladder\/at-pin|enums\/parse|hub\/checks|server-env)\.ts$/,
];

/** Whether the repo-relative `file` ships. */
export const shipped = (file: string): boolean =>
  SHIPPED_FILES.includes(file) || (SHIPPED_DIRS.some(dir => file.startsWith(dir)) && !LEFT_OUT.some(rule => rule.test(file)));

const SIDE_EFFECT = /^\s*import\s*["']([^"']+)["']/gm;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
// `import type` is erased before Node runs the file, so it reaches nothing.
const IMPORT = /^\s*(?:import|export)\s(?!type\s)[^"';]*?from\s*["']([^"']+)["']/gm;
const URL_READ = /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;
const BESIDE = /dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)\s*,\s*["']([^"']+)["']/g;
// A shell script's `here` is its own directory: `here=$(cd "$(dirname "$0")" && pwd)`.
const HERE = /"\$here\/([^"$]+)"/g;
const PLUGIN_ROOT = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'`\s]+)/g;

type Reach = { path: string } | { package: string };

/** What `file` loads at runtime: repo-relative paths, and the packages it imports by name. */
function reaches(file: string, text: string): Reach[] {
  const out: Reach[] = [];
  for (const [, rooted] of text.matchAll(PLUGIN_ROOT)) out.push({ path: rooted });
  const beside = (spec: string) => out.push({ path: path.posix.join(path.posix.dirname(file), spec) });
  if (file.endsWith(".sh")) for (const [, spec] of text.matchAll(HERE)) beside(spec);
  // Anything else is data, `harness.test.ts.template` included: it imports from the game clone it is written into.
  if (!/\.(ts|mjs|js)$/.test(file)) return out;
  for (const [, spec] of [IMPORT, SIDE_EFFECT, DYNAMIC].flatMap(form => [...text.matchAll(form)])) {
    if (spec.startsWith(".")) beside(spec);
    else if (!isBuiltin(spec)) out.push({ package: spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/") });
  }
  for (const form of [URL_READ, BESIDE]) for (const [, spec] of text.matchAll(form)) beside(spec);
  return out;
}

/** Writes the copy of `ref` into the empty directory `out`, and returns the paths written. */
export function assemble(repo: string, ref: string, out: string): string[] {
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, maxBuffer: 256 * 1024 * 1024 });
  const files = git(["ls-tree", "-r", "-z", "--name-only", ref]).toString("utf8").split("\0").filter(f => f !== "" && shipped(f));
  // `git archive` keeps the executable bit, which `read.sh` needs: `watch.mjs` runs it by path.
  execFileSync("tar", ["-x", "-C", out], { input: git(["archive", "--format=tar", ref, "--", ...files]) });

  const pkg = path.join(out, "package.json");
  const { devDependencies, scripts, ...runtime } = JSON.parse(readFileSync(pkg, "utf8")) as Record<string, unknown>;
  writeFileSync(pkg, `${JSON.stringify(runtime, null, 2)}\n`);
  // Prunes `ref`'s own lock rather than resolving afresh (extension-distribution.md §14.7).
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"], { cwd: out, stdio: "pipe" });
  return files;
}

/** Every file git sees under `root`, uncommitted ones included; only a shipped file's text is read. */
export function workingTree(root: string): Map<string, string> {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const files = listed.split("\0").filter(f => f !== "" && existsSync(path.join(root, f)));
  return new Map(files.map(f => [f, shipped(f) ? readFileSync(path.join(root, f), "utf8") : ""]));
}

/** What a shipped file in `tree` (repo-relative path → text) reaches that the copy does not hold, one line each. */
export function strays(tree: ReadonlyMap<string, string>): string[] {
  const files = [...tree.keys()];
  const dependencies = Object.keys((JSON.parse(tree.get("package.json") ?? "{}") as { dependencies?: object }).dependencies ?? {});
  const under = (target: string) => (target.endsWith("/") ? files.filter(f => f.startsWith(target)) : files.filter(f => f === target));
  const out: string[] = [];
  for (const [file, text] of tree) {
    if (!shipped(file)) continue;
    for (const reach of reaches(file, text)) {
      if ("package" in reach) {
        if (!dependencies.includes(reach.package)) out.push(`${file} imports ${reach.package}, which is not a runtime dependency`);
        continue;
      }
      const found = under(reach.path);
      if (found.length === 0) out.push(`${file} reaches ${reach.path}, which does not exist`);
      else if (!found.some(shipped)) out.push(`${file} reaches ${reach.path}, which the plugin copy leaves out`);
    }
  }
  return out;
}
