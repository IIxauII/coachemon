// Stamps a release version into package.json, package-lock.json and the plugin
// manifest. Run by semantic-release's prepare step (see .releaserc.json);
// `claude plugin update` only picks up a new version when plugin.json changes.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { stampVersion, versionArg } from "./release/version.ts";

const version = versionArg("scripts/set-version.ts");

execFileSync("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { stdio: "inherit" });

// Replaced in place rather than re-serialised, to keep the manifest's hand formatting.
const manifest = ".claude-plugin/plugin.json";
writeFileSync(manifest, stampVersion(readFileSync(manifest, "utf8"), version));
