/**
 * A local semantic-release plugin: wraps `commit-analyzer` and `release-notes-generator` and hands them only the
 * commits that touched what the extension ships (extension-distribution.md §14.2). Plain `.mjs`, because
 * semantic-release loads a local plugin by path.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** Whole directories, so every prefix ends in `/` (extension-distribution.md §14.2). */
export const EXTENSION_PATHS = [
  "extension/",
  "src/protocol/",
  "src/page/",
  "skills/coachemon/scripts/hud/",
];

export const touches = paths => paths.some(path => EXTENSION_PATHS.some(prefix => path.startsWith(prefix)));

/** A merge commit has no diff of its own under `git diff-tree -r`, so it drops out. */
export const keep = (commits, pathsOf) => commits.filter(commit => touches(pathsOf(commit.hash)));

export const splitPaths = stdout => stdout.split("\0").filter(Boolean);

// `-z`, or `git` C-quotes a path that is not plain ASCII: `extension/src/café.ts` arrives as
// `"extension/src/caf\303\251.ts"`, leading quote and all, and misses every prefix.
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
  // Resolved from `process.argv[1]`, semantic-release's own bin, and on first use: the wrapped plugins are its
  // dependencies, not this repo's, and the tests import this file with no semantic-release installed.
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
