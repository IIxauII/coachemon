/**
 * semantic-release's `prepare` for the extension stream (§14.2): put the version being released into
 * `extension/package.json` **in the workspace only**, then build and zip the three store artifacts.
 *
 * Nothing is committed — there is no `@semantic-release/git` in this run, and the `extension-v*` tag is the source of
 * truth for the version. `extension/package.json` keeps its `0.0.0-placeholder` on `master`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Target } from "../../src/protocol/wire.ts";
import { isSemver, stampVersion } from "./artifacts.ts";

const version = process.argv[2];
if (!version || !isSemver(version)) {
  console.error("usage: node scripts/release/stamp-extension.ts <semver>");
  process.exit(1);
}

const extension = fileURLToPath(new URL("../../extension/", import.meta.url));
const pkg = `${extension}package.json`;
writeFileSync(pkg, stampVersion(readFileSync(pkg, "utf8"), version));

// `wxt zip` builds before it zips, so this is the build too. The Firefox run is the only one that also writes the AMO
// sources zip, because that is where WXT turns `zipSources` on by itself.
const targets: Target[] = ["chrome", "firefox", "safari"];
for (const target of targets) {
  execFileSync("npx", ["wxt", "zip", "-b", target, "--mode", "store"], { cwd: extension, stdio: "inherit" });
}
