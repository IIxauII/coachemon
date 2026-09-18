import assert from "node:assert/strict";
import { test } from "node:test";
import { safariAppZipName, zipName } from "../scripts/release/artifacts.ts";
import {
  APP_NAME,
  BUNDLE_ID,
  developerIdIdentities,
  exportOptions,
  packagedVersion,
  pickIdentity,
  repoFromRemote,
  safariPaths,
  safariSteps,
  teamIdFrom,
} from "../scripts/release/safari.ts";

const PLAN = {
  version: "0.1.0",
  work: "/w",
  identity: "Developer ID Application: Jane Dev (AB12CD34EF)",
  profile: "coachemon",
  repo: "IIxauII/pokerogue-mcp",
};

test("the notarized app's zip is named for the release, not for what the packager fed on", () => {
  // The release already carries `coachemon-safari-web-extension-<v>.zip`, the unpackaged folder (§14.2). The hand
  // build adds a second Safari asset, and the two names must not collide on the same release.
  assert.equal(safariAppZipName("0.1.0"), "Coachemon-safari-0.1.0.zip");
  assert.notEqual(safariAppZipName("0.1.0"), zipName("safari", "0.1.0"));
});

test("a Developer ID Application identity is picked out of the keychain's listing", () => {
  const listing = [
    `  1) AAAA1111 "Apple Development: Jane Dev (XXXXXXXXXX)"`,
    `  2) BBBB2222 "Developer ID Application: Jane Dev (AB12CD34EF)"`,
    `  3) CCCC3333 "Developer ID Installer: Jane Dev (AB12CD34EF)"`,
    `     3 valid identities found`,
  ].join("\n");
  assert.deepEqual(developerIdIdentities(listing), ["Developer ID Application: Jane Dev (AB12CD34EF)"]);
  // An installer identity cannot sign an app, and a development one is not notarizable: neither is a candidate.
  assert.deepEqual(developerIdIdentities(`  1) AAAA "Apple Development: Jane Dev (XXXXXXXXXX)"`), []);
  assert.deepEqual(developerIdIdentities(""), []);
});

test("picking an identity refuses to guess when the keychain holds none or several", () => {
  const one = "Developer ID Application: Jane Dev (AB12CD34EF)";
  const two = "Developer ID Application: Jane Dev Ltd (ZZ99YY88XX)";
  assert.equal(pickIdentity([one], undefined), one);
  assert.throws(() => pickIdentity([], undefined), /no Developer ID Application identity/);
  assert.throws(() => pickIdentity([one, two], undefined), /--identity/);
  // Named explicitly, the same keychain is unambiguous.
  assert.equal(pickIdentity([one, two], two), two);
  assert.throws(() => pickIdentity([one], two), /not in the keychain/);
});

test("the team id comes off the identity, so it is never configured twice", () => {
  assert.equal(teamIdFrom("Developer ID Application: Jane Dev (AB12CD34EF)"), "AB12CD34EF");
  assert.throws(() => teamIdFrom("Developer ID Application: Jane Dev"), /no team id/);
  // A parenthesised name is not a team id: only the trailing ten-character code is.
  assert.throws(() => teamIdFrom("Developer ID Application: Jane (Dev)"), /no team id/);
});

test("the repo is read off a remote in either spelling", () => {
  assert.equal(repoFromRemote("https://" + "github.com/IIxauII/pokerogue-mcp.git"), "IIxauII/pokerogue-mcp");
  assert.equal(repoFromRemote("git@" + "github.com:IIxauII/pokerogue-mcp.git\n"), "IIxauII/pokerogue-mcp");
  assert.equal(repoFromRemote("https://" + "github.com/IIxauII/pokerogue-mcp"), "IIxauII/pokerogue-mcp");
  assert.throws(() => repoFromRemote("not-a-remote"), /no owner\/name/);
});

test("the export options ask for a Developer ID export of exactly one team", () => {
  const plist = exportOptions("AB12CD34EF");
  assert.match(plist, /<key>method<\/key>\s*<string>developer-id<\/string>/);
  assert.match(plist, /<key>teamID<\/key>\s*<string>AB12CD34EF<\/string>/);
  // `upload` would hand the app to Apple's distribution service; this build is a download from a GitHub Release.
  assert.match(plist, /<key>destination<\/key>\s*<string>export<\/string>/);
  // Manual signing with no certificate named is what makes an export go looking for a provisioning profile.
  assert.match(plist, /<key>signingCertificate<\/key>\s*<string>Developer ID Application<\/string>/);
});

test("the downloaded folder is checked against the version being released", () => {
  assert.equal(packagedVersion(`{"manifest_version":3,"version":"0.1.0"}`), "0.1.0");
  assert.throws(() => packagedVersion(`{"manifest_version":3}`), /no version/);
});

test("the steps run in the one order that produces a stapled artifact", () => {
  // Notarization staples nothing into the zip it was handed: that zip is a scratch file, and the asset the release
  // carries is cut from the app *after* stapling. Uploading the submitted zip would ship an unstapled app.
  assert.deepEqual(safariSteps(PLAN).map(step => step.id), [
    "download",
    "unpack",
    "package",
    "archive",
    "export",
    "zip-for-notarization",
    "notarize",
    "staple",
    "validate",
    "gatekeeper",
    "zip-asset",
    "upload",
  ]);
});

test("the runner's post-unpack check hangs off an id, not off a printed sentence", () => {
  // `safari-release.ts` runs the manifest-version guard after the step whose id is `unpack`. Were that a title match,
  // rewording the line would silently stop the guard running and nothing would say so.
  const unpack = safariSteps(PLAN).filter(step => step.id === "unpack");
  assert.equal(unpack.length, 1);
  assert.notEqual(unpack[0].title, unpack[0].id);
});

test("the converter is driven exactly as §14.6 spells it out, under the name it really has", () => {
  const step = safariSteps(PLAN).find(s => s.command === "xcrun" && s.args[0].startsWith("safari-web-extension"));
  assert.ok(step, "no converter step");
  const paths = safariPaths(PLAN);
  assert.deepEqual(step.args, [
    // The converter, not the "packager" §14.6 named: `xcrun` finds no such tool, so the spec's name would abort
    // every run three steps in. Apple's page is titled "Packaging a web extension for Safari"; the tool is not.
    "safari-web-extension-converter",
    paths.unpacked,
    "--project-location", paths.project,
    "--app-name", APP_NAME,
    "--bundle-identifier", BUNDLE_ID,
    "--macos-only",
    "--copy-resources",
    "--no-open",
    "--no-prompt",
  ]);
});

test("the archive is hardened and signed with the Developer ID identity", () => {
  const step = safariSteps(PLAN).find(s => s.id === "archive");
  assert.ok(step, "no archive step");
  const settings = step.args.join(" ");
  // Notarization rejects a build without the hardened runtime, and a secure timestamp is required with it.
  assert.match(settings, /ENABLE_HARDENED_RUNTIME=YES/);
  assert.match(settings, /OTHER_CODE_SIGN_FLAGS=.*--timestamp/);
  assert.match(settings, /CODE_SIGN_IDENTITY=Developer ID Application/);
  assert.match(settings, /DEVELOPMENT_TEAM=AB12CD34EF/);
  // Automatic signing in a CI-less shell picks whatever profile Xcode last cached; this build names its identity.
  assert.match(settings, /CODE_SIGN_STYLE=Manual/);
});

test("notarization waits, so the next step cannot staple an unapproved app", () => {
  const step = safariSteps(PLAN).find(s => s.id === "notarize");
  assert.ok(step, "no notarytool step");
  assert.deepEqual(step.args.slice(0, 2), ["notarytool", "submit"]);
  assert.ok(step.args.includes("--wait"));
  assert.deepEqual(step.args.slice(-2), ["--keychain-profile", "coachemon"]);
  // The password never reaches the command line: `notarytool store-credentials` put it in the keychain (runbook).
  assert.equal(step.args.some(arg => arg.includes("password")), false);
});

test("Gatekeeper is asked the question a downloaded app actually faces", () => {
  const step = safariSteps(PLAN).find(s => s.id === "gatekeeper");
  assert.ok(step, "no gatekeeper step");
  // `-t install` is the installer-package assessment; the default, `execute`, is what a downloaded .app meets.
  assert.equal(step.args.includes("-t"), false);
  assert.deepEqual(step.args.slice(0, 2), ["-a", "-vvv"]);
});

test("the upload targets the release the artifacts were downloaded from", () => {
  const steps = safariSteps({ ...PLAN, version: "0.2.3" });
  const download = steps.find(s => s.id === "download");
  const upload = steps.find(s => s.id === "upload");
  assert.ok(download && upload, "no gh steps");
  assert.equal(download.args[2], "extension-v0.2.3");
  assert.equal(upload.args[2], "extension-v0.2.3");
  assert.ok(download.args.includes(zipName("safari", "0.2.3")));
  assert.ok(upload.args.some(arg => arg.endsWith(safariAppZipName("0.2.3"))));
});

test("both gh steps name the repo, because neither runs inside a checkout", () => {
  // Every step runs in the scratch directory, and the repo is private: `gh` can neither read a remote there nor fall
  // back to a public guess. Without this the very first step dies and the release is never touched.
  const gh = safariSteps(PLAN).filter(s => s.command === "gh");
  assert.equal(gh.length, 2);
  for (const step of gh) {
    const at = step.args.indexOf("--repo");
    assert.ok(at !== -1, `${step.title} names no repo`);
    assert.equal(step.args[at + 1], "IIxauII/pokerogue-mcp");
  }
});

test("every step names a command and nothing is left interactive", () => {
  for (const step of safariSteps(PLAN)) {
    assert.ok(step.title.length > 0, "a step with no title");
    assert.ok(step.command.length > 0, `${step.title} runs nothing`);
    // `--no-open`/`--no-prompt` on the converter and `--wait` on notarytool are the three that would block on a human.
    assert.equal(step.args.includes("--open"), false);
  }
});
