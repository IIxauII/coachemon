/**
 * The Safari release, by hand, every release (§14.6). Safari is not a store: nothing in CI can produce this artifact,
 * because it needs the dev's individual Apple Developer Program membership, their Developer ID signing identity in a
 * local keychain, and Xcode. So this half is the plan — pure, and covered by `src/safari-release.test.ts` — and
 * `safari-release.ts` is the runner that carries it out on the dev's Mac.
 *
 * The order is the part worth pinning down. `notarytool` returns a ticket that lives on Apple's servers; `stapler`
 * writes it into the app so a first launch offline is not a refusal. Neither touches the zip that was submitted, so
 * the asset the release carries has to be cut from the app *after* stapling. Uploading the submitted zip would ship
 * an app that passes Gatekeeper only while the player is online.
 */
import { join } from "node:path";
import { safariAppZipName, zipName } from "./artifacts.ts";

/**
 * The containing app's name and bundle identifier (§14.6, both picked by the spec). The app is the packager's
 * generated near-shell and stays that way: the Developer ID route has no review, and Attachment 7 bars bundling the
 * extension with an app that has a different purpose.
 */
export const APP_NAME = "Coachemon";
export const BUNDLE_ID = "io.github.iixauii.coachemon";

/** The tag the extension stream cuts (§14.1); both the download and the upload address the same release. */
export const extensionTag = (version: string): string => `extension-v${version}`;

/** One command in the plan, with the line the runner prints before it. */
export type SafariStep = { title: string; command: string; args: string[] };

export type SafariPlan = {
  /** The version being released, three numbers, as the release's artifacts are named for it. */
  version: string;
  /** A scratch directory. Everything the build writes lands under it and nothing outside it is touched. */
  work: string;
  /** The full `Developer ID Application: …` string, as the keychain spells it. */
  identity: string;
  /** The `notarytool store-credentials` profile holding the app-specific password (see the runbook). */
  profile: string;
};

/** Every path the plan writes or reads, derived from the scratch directory alone so a dry run names real files. */
export function safariPaths(work: string, version: string) {
  const exported = join(work, "export");
  return {
    /** The release's own Safari asset: the unpackaged web extension, not something Safari installs. */
    download: join(work, zipName("safari", version)),
    unpacked: join(work, "extension"),
    project: join(work, "project"),
    xcodeproj: join(work, "project", APP_NAME, `${APP_NAME}.xcodeproj`),
    archive: join(work, `${APP_NAME}.xcarchive`),
    exportOptions: join(work, "ExportOptions.plist"),
    exported,
    app: join(exported, `${APP_NAME}.app`),
    /** Scratch: what notarization is handed. It never carries the ticket, so it is never the release's asset. */
    submitted: join(work, `${APP_NAME}-notarize.zip`),
    /** The asset the release gets, cut from the stapled app. */
    asset: join(work, safariAppZipName(version)),
  };
}

const IDENTITY = /"(Developer ID Application: [^"]+)"/g;
const TEAM_ID = /\(([A-Z0-9]{10})\)$/;

/**
 * The Developer ID Application identities in `security find-identity -v -p codesigning` output. An `Apple
 * Development` identity is not notarizable and a `Developer ID Installer` one signs packages, not apps, so neither is
 * a candidate even though both sit in the same listing.
 */
export function developerIdIdentities(listing: string): string[] {
  return [...listing.matchAll(IDENTITY)].map(match => match[1]);
}

/** The identity to sign with: the only candidate, or the one named on the command line. Never a guess. */
export function pickIdentity(candidates: string[], asked: string | undefined): string {
  if (asked) {
    if (!candidates.includes(asked)) {
      throw new Error(`${asked} is not in the keychain; it holds ${candidates.join(", ") || "no such identity"}`);
    }
    return asked;
  }
  if (candidates.length === 0) {
    throw new Error("no Developer ID Application identity in the keychain; see docs/runbooks/safari-release.md");
  }
  if (candidates.length > 1) {
    throw new Error(`the keychain holds ${candidates.length} Developer ID identities; name one with --identity`);
  }
  return candidates[0];
}

/** The team id, read off the identity rather than configured a second time where it could drift from it. */
export function teamIdFrom(identity: string): string {
  const match = TEAM_ID.exec(identity.trim());
  if (!match) throw new Error(`no team id in ${identity}; expected a trailing "(TEAMID1234)"`);
  return match[1];
}

/**
 * `-exportArchive`'s options. `developer-id` is the route with no review; `destination: export` writes the app to
 * disk rather than handing it to Apple's distribution service, which is what a GitHub Release download needs.
 */
export function exportOptions(teamId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>developer-id</string>
  <key>destination</key>
  <string>export</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>signingStyle</key>
  <string>manual</string>
</dict>
</plist>
`;
}

/**
 * The version in a built manifest. The runner compares it with the version it was asked for: `gh release download`
 * would happily fetch nothing and leave a stale unzip in place, and a near-shell around last release's extension is
 * the kind of thing only a player would find.
 */
export function packagedVersion(manifest: string): string {
  const version = (JSON.parse(manifest) as { version?: string }).version;
  if (!version) throw new Error("the downloaded extension carries no version in its manifest");
  return version;
}

/** §14.6 as commands, in order. Pure: the runner executes these, and a dry run prints them. */
export function safariSteps(plan: SafariPlan): SafariStep[] {
  const p = safariPaths(plan.work, plan.version);
  const tag = extensionTag(plan.version);
  const teamId = teamIdFrom(plan.identity);
  return [
    {
      title: `Download ${zipName("safari", plan.version)} from ${tag}`,
      command: "gh",
      args: ["release", "download", tag, "--pattern", zipName("safari", plan.version), "--dir", plan.work, "--clobber"],
    },
    {
      // `ditto -x -k` and not `unzip`: the same tool that writes the asset, and it keeps macOS metadata intact.
      title: "Unpack the web extension",
      command: "ditto",
      args: ["-x", "-k", p.download, p.unpacked],
    },
    {
      title: `Package the extension into the ${APP_NAME} near-shell`,
      command: "xcrun",
      args: [
        "safari-web-extension-packager",
        p.unpacked,
        "--project-location", p.project,
        "--app-name", APP_NAME,
        "--bundle-identifier", BUNDLE_ID,
        "--macos-only",
        "--copy-resources",
        "--no-open",
      ],
    },
    {
      title: "Archive with the Developer ID Application identity, hardened runtime on",
      command: "xcodebuild",
      args: [
        "-project", p.xcodeproj,
        "-scheme", APP_NAME,
        "-configuration", "Release",
        "-destination", "generic/platform=macOS",
        "-archivePath", p.archive,
        "archive",
        "CODE_SIGN_STYLE=Manual",
        "CODE_SIGN_IDENTITY=Developer ID Application",
        `DEVELOPMENT_TEAM=${teamId}`,
        "ENABLE_HARDENED_RUNTIME=YES",
        // Notarization refuses a signature without a secure timestamp, and the hardened runtime requires one.
        "OTHER_CODE_SIGN_FLAGS=--timestamp",
      ],
    },
    {
      title: `Export ${APP_NAME}.app from the archive`,
      command: "xcodebuild",
      args: [
        "-exportArchive",
        "-archivePath", p.archive,
        "-exportPath", p.exported,
        "-exportOptionsPlist", p.exportOptions,
      ],
    },
    {
      title: "Zip the app for notarization (scratch, not the release's asset)",
      command: "ditto",
      args: ["-c", "-k", "--keepParent", p.app, p.submitted],
    },
    {
      title: "Submit for notarization and wait for Apple's verdict",
      command: "xcrun",
      args: ["notarytool", "submit", p.submitted, "--wait", "--keychain-profile", plan.profile],
    },
    {
      // Without the ticket in the bundle, a player who is offline on first launch is refused by Gatekeeper.
      title: "Staple the notarization ticket into the app",
      command: "xcrun",
      args: ["stapler", "staple", p.app],
    },
    {
      title: "Validate the stapled ticket",
      command: "xcrun",
      args: ["stapler", "validate", p.app],
    },
    {
      // What the player's Mac will ask on first launch, asked here instead, where an answer is still cheap.
      title: "Check what Gatekeeper makes of it",
      command: "spctl",
      args: ["-a", "-vvv", "-t", "install", p.app],
    },
    {
      title: `Zip the stapled app as ${safariAppZipName(plan.version)}`,
      command: "ditto",
      args: ["-c", "-k", "--keepParent", p.app, p.asset],
    },
    {
      title: `Upload it to ${tag}`,
      command: "gh",
      args: ["release", "upload", tag, p.asset, "--clobber"],
    },
  ];
}
