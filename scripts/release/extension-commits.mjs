/**
 * The extension stream's commit filter (§14.2), a local semantic-release plugin. Its two hooks wrap the stock
 * `commit-analyzer` and `release-notes-generator` and hand them only the commits that touched what the extension
 * ships, so a server-only commit never bumps the extension stream and a HUD fix bumps both.
 *
 * The wrapped plugins are not installed anywhere in this repo: they are semantic-release's own dependencies, and the
 * release toolchain is deliberately not a devDependency (see `.github/workflows/release.yml`). So resolution starts
 * from the running `semantic-release` bin rather than from this file, and happens on first use — the tests import
 * `touches` and `keep` without a semantic-release install in sight.
 *
 * Plain `.mjs`, because semantic-release loads a local plugin by path and Node would have to strip types for it.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** What the extension ships (§14.2). Whole directories, so every prefix ends in `/`. */
export const EXTENSION_PATHS = [
  "extension/",
  "src/protocol/",
  "src/page/",
  "skills/coachemon/scripts/hud/",
];

/** Whether one commit's changed paths reach the extension. One shipped path among server-only ones is enough. */
export const touches = paths => paths.some(path => EXTENSION_PATHS.some(prefix => path.startsWith(prefix)));

/**
 * The commits that count, given a way to read one commit's changed paths. A merge commit has no diff of its own under
 * `git diff-tree -r`, so it drops out; its `Merge pull request` subject bumps nothing anyway.
 */
export const keep = (commits, pathsOf) => commits.filter(commit => touches(pathsOf(commit.hash)));

/**
 * The paths one commit changed, from the repo root whatever the cwd is, which is what `EXTENSION_PATHS` are.
 *
 * `-z` matters: without it `git` C-quotes any path that is not plain ASCII, so `extension/src/café.ts` arrives as
 * `"extension/src/caf\303\251.ts"` — leading quote and all — and would miss every prefix.
 */
export const splitPaths = stdout => stdout.split("\0").filter(Boolean);

const gitPaths = cwd => hash =>
  splitPaths(
    execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", hash], { cwd, encoding: "utf8" }),
  );

const wrapped = new Map();

async function plugin(name) {
  if (!wrapped.has(name)) wrapped.set(name, load(name));
  return await wrapped.get(name);
}

async function load(name) {
  // `process.argv[1]` is semantic-release's own bin, and `commit-analyzer` and `release-notes-generator` are its
  // dependencies, so they resolve from there whether npx installed semantic-release or a package did.
  try {
    const module = await import(pathToFileURL(createRequire(process.argv[1]).resolve(name)).href);
    return module.default ?? module;
  } catch (cause) {
    throw new Error(`cannot resolve ${name}; it ships with semantic-release, so run this under semantic-release`, {
      cause,
    });
  }
}

const extensionOnly = context => ({ ...context, commits: keep(context.commits, gitPaths(context.cwd)) });

export const analyzeCommits = async (config, context) =>
  (await plugin("@semantic-release/commit-analyzer")).analyzeCommits(config, extensionOnly(context));

export const generateNotes = async (config, context) =>
  (await plugin("@semantic-release/release-notes-generator")).generateNotes(config, extensionOnly(context));
