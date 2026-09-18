/**
 * semantic-release's `prepare` for the extension stream (§14.2): put the version being released into
 * `extension/package.json` **in the workspace only**, then build and zip the three store artifacts.
 *
 * Nothing is committed — there is no `@semantic-release/git` in this run, and the `extension-v*` tag is the source of
 * truth for the version. `extension/package.json` keeps its `0.0.0-placeholder` on `master`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Target } from "../../src/protocol/wire.ts";
import { EXTENSION_DIR, releaseVersion } from "./artifacts.ts";
import { stampVersion, versionArg } from "./version.ts";

const version = releaseVersion(versionArg("scripts/release/stamp-extension.ts"));

const pkg = join(EXTENSION_DIR, "package.json");
writeFileSync(pkg, stampVersion(readFileSync(pkg, "utf8"), version));

// `wxt zip` builds before it zips, so this is the build too. The Firefox run is the only one that also writes the AMO
// sources zip, because that is where WXT turns `zipSources` on by itself.
const targets: Target[] = ["chrome", "firefox", "safari"];
for (const target of targets) {
  execFileSync("npx", ["wxt", "zip", "-b", target, "--mode", "store"], { cwd: EXTENSION_DIR, stdio: "inherit" });
}
