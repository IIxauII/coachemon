/** The extension stream's `publish`, after the tag and the GitHub Release exist (extension-distribution.md §14.4). */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXTENSION_DIR,
  missingSubmitEnv,
  releaseVersion,
  sourcesZipName,
  submitsToStores,
  zipName,
} from "./artifacts.ts";
import { versionArg } from "./version.ts";

const version = releaseVersion(versionArg("scripts/release/submit-extension.ts"));
// `verifyRelease` passes `--verify`, before the tag is cut: check that a submission could succeed, and submit nothing.
const verifyOnly = process.argv.includes("--verify");

if (!submitsToStores(version)) {
  console.log(`extension-v${version} is a 0.x release: unlisted, so nothing is submitted to a store (extension-distribution.md §14.1)`);
  process.exit(0);
}

const missing = missingSubmitEnv(process.env);
if (missing.length > 0) {
  console.error(`cannot submit extension-v${version}: ${missing.join(", ")} missing from the environment (extension-distribution.md §14.4)`);
  process.exit(1);
}
if (verifyOnly) {
  console.log(`extension-v${version} submits to both stores, and every credential it needs is present (extension-distribution.md §14.4)`);
  process.exit(0);
}

const built = join(EXTENSION_DIR, ".output", "firefox-mv3-store", "manifest.json");
const firefox = JSON.parse(readFileSync(built, "utf8")) as {
  browser_specific_settings?: { gecko?: { id?: string } };
};
const gecko = firefox.browser_specific_settings?.gecko?.id;
if (!gecko) {
  console.error("the Firefox build carries no gecko id, so AMO has nothing to submit against");
  process.exit(1);
}

const output = (name: string) => join(".output", name);

// Safari is not a store: extension-distribution.md §14.6 packages and notarizes it by hand from the release's own zip.
execFileSync(
  "npx",
  [
    "wxt",
    "submit",
    "--chrome-api-version", "v2",
    "--chrome-cancel-pending",
    "--chrome-zip", output(zipName("chrome", version)),
    "--firefox-extension-id", gecko,
    "--firefox-zip", output(zipName("firefox", version)),
    "--firefox-sources-zip", output(sourcesZipName(version)),
  ],
  { cwd: EXTENSION_DIR, stdio: "inherit" },
);
