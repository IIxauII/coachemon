// Stamps a release version into package.json, package-lock.json and the plugin
// manifest. Run by semantic-release's prepare step (see .releaserc.json);
// `claude plugin update` only picks up a new version when plugin.json changes.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: node scripts/set-version.ts <semver>");
  process.exit(1);
}

execFileSync("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { stdio: "inherit" });

// Replace in place rather than re-serialise, to keep the manifest's hand formatting.
const manifest = ".claude-plugin/plugin.json";
const before = readFileSync(manifest, "utf8");
const after = before.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
if (after === before && !before.includes(`"version": "${version}"`)) {
  console.error(`no "version" field found in ${manifest}`);
  process.exit(1);
}
writeFileSync(manifest, after);
