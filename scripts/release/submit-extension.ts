/**
 * semantic-release's `publish` for the extension stream (§14.4): from 1.0.0 on, upload the Chrome and Firefox
 * artifacts to their stores and submit them for review. 0.x is unlisted — it says so and stops.
 *
 * Chrome goes through Web Store API v2: v1.1 stops being supported on 2026-10-15, and v2 is what can cancel a pending
 * review before submitting the newest build (`POST /v2/{name}:cancelSubmission`, confirmed against the API reference
 * and implemented by `publish-browser-extension` behind `--chrome-cancel-pending`). A burst of HUD releases therefore
 * restarts Chrome's review each time, which is accepted.
 *
 * v2 authenticates as a GCP service account, not with the v1.1 client id / secret / refresh token. `release.yml` maps
 * the repo's secrets onto the tool's environment names; nothing secret is passed on the command line.
 *
 * A failed submission fails the job, after the tag and the GitHub Release already exist. The dev resubmits by hand.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isSemver, sourcesZipName, submits, zipName } from "./artifacts.ts";

const version = process.argv[2];
if (!version || !isSemver(version)) {
  console.error("usage: node scripts/release/submit-extension.ts <semver>");
  process.exit(1);
}

if (!submits(version)) {
  console.log(`extension-v${version} is a 0.x release: unlisted, so nothing is submitted to a store (§14.1)`);
  process.exit(0);
}

const extension = fileURLToPath(new URL("../../extension/", import.meta.url));
const output = (name: string) => `.output/${name}`;

// AMO's extension id is the gecko id (§5.3), read off the build that is about to be uploaded so it cannot drift from
// what `manifestFor` wrote.
const firefox = JSON.parse(readFileSync(`${extension}.output/firefox-mv3-store/manifest.json`, "utf8")) as {
  browser_specific_settings?: { gecko?: { id?: string } };
};
const gecko = firefox.browser_specific_settings?.gecko?.id;
if (!gecko) {
  console.error("the Firefox build carries no gecko id, so AMO has nothing to submit against");
  process.exit(1);
}

// Safari is not a store: §14.6 packages and notarizes it by hand from the release's own zip.
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
  { cwd: extension, stdio: "inherit" },
);
