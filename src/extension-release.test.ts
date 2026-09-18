import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error: plain .mjs without type declarations, because semantic-release loads it as a plugin
import { EXTENSION_PATHS, keep, splitPaths, touches } from "../scripts/release/extension-commits.mjs";
import {
  missingSubmitEnv,
  releaseArtifacts,
  releaseVersion,
  sourcesZipName,
  submitsToStores,
  zipName,
} from "../scripts/release/artifacts.ts";
import { isSemver, stampVersion } from "../scripts/release/version.ts";

test("a commit counts for the extension when it touched anything the extension ships", () => {
  assert.equal(touches(["extension/src/background/index.ts"]), true);
  assert.equal(touches(["src/protocol/wire.ts"]), true);
  assert.equal(touches(["src/page/dispatch.ts"]), true);
  assert.equal(touches(["skills/coachemon/scripts/hud/90-render.js"]), true);
  // One shipped path among server-only ones is still a bump: a HUD fix bumps both streams (§14.2).
  assert.equal(touches(["src/hub/hub.ts", "docs/spec/extension-distribution.md", "src/page/acts.ts"]), true);
});

test("a server-only commit does not count for the extension", () => {
  assert.equal(touches(["src/hub/hub.ts", "src/driver.ts"]), false);
  assert.equal(touches(["docs/spec/extension-distribution.md"]), false);
  assert.equal(touches([]), false);
});

test("the shipped paths are whole-directory prefixes, not name prefixes", () => {
  // Every prefix ends in `/`, so a sibling whose name merely starts the same way never counts.
  for (const prefix of EXTENSION_PATHS as string[]) assert.equal(prefix.endsWith("/"), true);
  assert.equal(touches(["extension-notes/plan.md"]), false);
  assert.equal(touches(["src/pages/index.ts"]), false);
  assert.equal(touches(["src/protocols.ts"]), false);
});

test("keep drops the commits whose diff missed the extension", () => {
  const paths: Record<string, string[]> = {
    a: ["extension/wxt.config.ts"],
    b: ["src/hub/hub.ts"],
    // A merge commit has no diff of its own under `git diff-tree -r`, so it drops out.
    c: [],
    d: ["skills/coachemon/scripts/hud/05-randbats.js"],
  };
  const commits = Object.keys(paths).map(hash => ({ hash }));
  assert.deepEqual(keep(commits, (hash: string) => paths[hash]).map((c: { hash: string }) => c.hash), ["a", "d"]);
});

test("0.x never submits to a store, 1.0.0 on always does", () => {
  assert.equal(submitsToStores("0.1.0"), false);
  assert.equal(submitsToStores("0.37.2"), false);
  assert.equal(submitsToStores("1.0.0"), true);
  assert.equal(submitsToStores("2.3.4"), true);
});

test("a version is three numbers, with an optional prerelease", () => {
  assert.equal(isSemver("0.1.0"), true);
  assert.equal(isSemver("1.0.0-beta.1"), true);
  assert.equal(isSemver("0.0.0-placeholder"), true);
  assert.equal(isSemver("1.0"), false);
  assert.equal(isSemver("v1.0.0"), false);
  assert.equal(isSemver(""), false);
});

test("stamping the version leaves the rest of package.json as it was", () => {
  const pkg = `{\n  "name": "coachemon-extension",\n  "version": "0.0.0-placeholder",\n  "private": true\n}\n`;
  const stamped = `{\n  "name": "coachemon-extension",\n  "version": "0.1.0",\n  "private": true\n}\n`;
  assert.equal(stampVersion(pkg, "0.1.0"), stamped);
  // Re-stamping the version it already carries is not a failure.
  assert.equal(stampVersion(stamped, "0.1.0"), stamped);
  assert.throws(() => stampVersion(`{ "name": "coachemon-extension" }`, "0.1.0"), /no "version" field/);
});

test("a prerelease is refused, because the artifacts could not be named for it", () => {
  // WXT names a zip after the manifest, whose version is three numbers, so `submit` would look for a zip that the
  // build wrote under a different name. `isSemver` admits a prerelease; the release stream does not.
  assert.equal(releaseVersion("0.1.0"), "0.1.0");
  assert.throws(() => releaseVersion("1.0.0-beta.1"), /cannot release a prerelease \(1\.0\.0-beta\.1\)/);
});

test("a NUL-separated diff keeps a non-ASCII path whole", () => {
  // `git diff-tree -z` writes the bytes as they are and ends every path with a NUL, including the last.
  const paths = ["extension/src/café.ts", "src/hub/hub.ts"];
  assert.deepEqual(splitPaths(`${paths.join("\0")}\0`), paths);
  assert.equal(touches(splitPaths("extension/src/café.ts\0")), true);
  assert.deepEqual(splitPaths(""), []);
});

test("a release ships four artifacts, and the submit credentials are named once", () => {
  assert.deepEqual(releaseArtifacts("0.1.0"), [
    "coachemon-chrome-0.1.0.zip",
    "coachemon-firefox-0.1.0.zip",
    "coachemon-safari-web-extension-0.1.0.zip",
    "coachemon-0.1.0-sources.zip",
  ]);
  assert.deepEqual(missingSubmitEnv({}).length, 6);
  assert.deepEqual(missingSubmitEnv({ CHROME_EXTENSION_ID: "x" }).includes("CHROME_EXTENSION_ID"), false);
  // An empty string is as absent as an unset variable: that is what an unconfigured GitHub secret expands to.
  assert.deepEqual(missingSubmitEnv({ CHROME_EXTENSION_ID: "" }).includes("CHROME_EXTENSION_ID"), true);
});

test("the release artifacts are named as the spec lists them", () => {
  assert.equal(zipName("chrome", "0.1.0"), "coachemon-chrome-0.1.0.zip");
  assert.equal(zipName("firefox", "0.1.0"), "coachemon-firefox-0.1.0.zip");
  // Safari's says what it holds, because §14.6 unzips it and hands the folder to `safari-web-extension-converter`.
  assert.equal(zipName("safari", "0.1.0"), "coachemon-safari-web-extension-0.1.0.zip");
  assert.equal(sourcesZipName("0.1.0"), "coachemon-0.1.0-sources.zip");
});
