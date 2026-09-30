import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { stampVersion, versionArg } from "./release/version.ts";

const version = versionArg("scripts/set-version.ts");

execFileSync("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { stdio: "inherit" });

// `claude plugin update` only picks up a new version when plugin.json changes.
const manifest = ".claude-plugin/plugin.json";
writeFileSync(manifest, stampVersion(readFileSync(manifest, "utf8"), version));
