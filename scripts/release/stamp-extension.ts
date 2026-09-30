/**
 * The extension stream's `prepare` (extension-distribution.md §14.2). The version is stamped into the workspace only and
 * never committed: the `extension-v*` tag is the version, and `extension/package.json` stays `0.0.0-placeholder`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXTENSION_DIR, releaseArtifacts, releaseVersion, TARGETS } from "./artifacts.ts";
import { stampVersion, versionArg } from "./version.ts";

const version = releaseVersion(versionArg("scripts/release/stamp-extension.ts"));
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: EXTENSION_DIR, stdio: "inherit" });

const pkg = join(EXTENSION_DIR, "package.json");
writeFileSync(pkg, stampVersion(readFileSync(pkg, "utf8"), version));

// `wxt zip` builds before it zips, so this is the build too.
for (const target of TARGETS) run("npx", ["wxt", "zip", "-b", target, "--mode", "store"]);

// The store-artifact guard (extension-distribution.md §5.5) reads `.output/`, which exists only from here: without this
// run, nothing tests the shipped build before a store review.
run("npm", ["test"]);

// `@semantic-release/github` only warns on an asset it cannot read and publishes anyway, so a missing zip would cut a
// green release without it.
const missing = releaseArtifacts(version).filter(name => !existsSync(join(EXTENSION_DIR, ".output", name)));
if (missing.length > 0) throw new Error(`the build wrote no ${missing.join(", ")}; the release would ship without it`);
