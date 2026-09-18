/**
 * semantic-release's `prepare` for the extension stream (§14.2): put the version being released into
 * `extension/package.json` **in the workspace only**, then build and zip the three store artifacts.
 *
 * Nothing is committed — there is no `@semantic-release/git` in this run, and the `extension-v*` tag is the source of
 * truth for the version. `extension/package.json` keeps its `0.0.0-placeholder` on `master`.
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

// `wxt zip` builds before it zips, so this is the build too. The Firefox run is the only one that also writes the AMO
// sources zip, because that is where WXT turns `zipSources` on by itself.
for (const target of TARGETS) run("npx", ["wxt", "zip", "-b", target, "--mode", "store"]);

// The store-artifact guard (§5.5) reads `.output/`, so this is the first moment it can see what is about to be
// uploaded. `release-extension` builds the artifacts here rather than in a job step, so it has to run the suite here
// too — otherwise nothing between a dev affordance and a store review runs on the shipped build.
run("npm", ["test"]);

// `@semantic-release/github` only warns when an asset cannot be read and publishes anyway, so a missing or misnamed
// zip would cut a release with three artifacts and a green build. Fail here, while `prepare` is still before the tag.
const missing = releaseArtifacts(version).filter(name => !existsSync(join(EXTENSION_DIR, ".output", name)));
if (missing.length > 0) throw new Error(`the build wrote no ${missing.join(", ")}; the release would ship without it`);
