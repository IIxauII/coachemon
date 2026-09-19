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

/**
 * One command in the plan: `id` is what code branches on, `title` the line the runner prints. Two fields and not one
 * because the runner has a check to run after the unpack, and hanging that off display text means rewording a
 * sentence silently stops it running.
 */
export type SafariStep = { id: StepId; title: string; command: string; args: string[] };

export type StepId =
  | "download"
  | "unpack"
  | "package"
  | "archive"
  | "export"
  | "zip-for-notarization"
  | "notarize"
  | "staple"
  | "validate"
  | "gatekeeper"
  | "zip-asset"
  | "upload";

export type SafariPlan = {
  /** The version being released, three numbers, as the release's artifacts are named for it. */
  version: string;
  /** A scratch directory. Everything the build writes lands under it and nothing outside it is touched. */
  work: string;
  /** The full `Developer ID Application: …` string, as the keychain spells it. */
  identity: string;
  /** The `notarytool store-credentials` profile holding the app-specific password (see the runbook). */
  profile: string;
  /** `owner/name` of the repo carrying the release. `gh` runs outside the checkout, so it is told rather than asked. */
  repo: string;
};

/**
 * Every path the plan writes or reads, derived from the scratch directory alone so a dry run names real files. It
 * takes the plan rather than the two fields, so the runner and `safariSteps` cannot derive a path from different ones.
 */
export function safariPaths({ work, version }: Pick<SafariPlan, "work" | "version">) {
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

const REMOTE = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/;

/**
 * `owner/name` out of a remote URL, in either spelling `git remote get-url` can hand back. Read off the checkout
 * rather than written down, so a fork or a rename does not leave this script uploading to somebody else's release.
 */
export function repoFromRemote(url: string): string {
  const match = REMOTE.exec(url.trim());
  if (!match) throw new Error(`no owner/name in the remote ${url}`);
  return match[1];
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
  <key>signingCertificate</key>
  <string>Developer ID Application</string>
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

/**
 * The submission id from a notarization Apple accepted, or a refusal naming the log command.
 *
 * `notarytool submit --wait` exits `0` once Apple returns a *final* verdict, `Invalid` among them: the exit code says
 * the submission finished, not that it passed. So the status is read rather than inferred. Without this the run walks
 * on to `stapler staple`, which fails for want of a ticket to staple — nothing is uploaded either way, because the
 * upload is the last step, but the dev is left reading a staple failure for a notarization problem (#241).
 */
export function acceptedSubmissionId(output: string, profile: string): string {
  let verdict: { id?: string; status?: string; message?: string };
  try {
    verdict = JSON.parse(output) as typeof verdict;
  } catch {
    throw new Error(`notarytool printed no JSON verdict to read:\n${output.trim()}`);
  }
  const { id, status, message } = verdict;
  // Both, because the refusal below is only actionable when it can name the submission to fetch the log for.
  if (!id || !status) throw new Error(`notarytool's verdict carries no id and status:\n${output.trim()}`);
  if (status !== "Accepted") {
    throw new Error(
      `Apple did not accept submission ${id}: ${status}${message ? ` — ${message}` : ""}\n` +
        `  xcrun notarytool log ${id} --keychain-profile ${profile}`,
    );
  }
  return id;
}

/** §14.6 as commands, in order. Pure: the runner executes these, and a dry run prints them. */
export function safariSteps(plan: SafariPlan): SafariStep[] {
  const p = safariPaths(plan);
  const tag = extensionTag(plan.version);
  const teamId = teamIdFrom(plan.identity);
  return [
    {
      id: "download",
      title: `Download ${zipName("safari", plan.version)} from ${tag}`,
      command: "gh",
      args: [
        "release", "download", tag,
        // Named, never inferred: every step runs in the scratch directory, which is no checkout, and the repo is
        // private, so `gh` has neither a remote to read there nor a public fallback to guess from.
        "--repo", plan.repo,
        "--pattern", zipName("safari", plan.version),
        "--dir", plan.work,
        "--clobber",
      ],
    },
    {
      // `ditto -x -k` and not `unzip`: the same tool that writes the asset, and it keeps macOS metadata intact.
      id: "unpack",
      title: "Unpack the web extension",
      command: "ditto",
      args: ["-x", "-k", p.download, p.unpacked],
    },
    {
      id: "package",
      title: `Package the extension into the ${APP_NAME} near-shell`,
      command: "xcrun",
      args: [
        // `safari-web-extension-converter`, and not the `safari-web-extension-packager` §14.6 named: Apple's page is
        // titled "Packaging a web extension for Safari", but the tool it documents is the converter, and `xcrun`
        // finds no packager on any Mac. The spec is corrected where it says this.
        "safari-web-extension-converter",
        p.unpacked,
        "--project-location", p.project,
        "--app-name", APP_NAME,
        "--bundle-identifier", BUNDLE_ID,
        "--macos-only",
        "--copy-resources",
        "--no-open",
        // Without it the converter stops on its warning summary and waits for a human a scripted run has not got.
        "--no-prompt",
      ],
    },
    {
      id: "archive",
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
      id: "export",
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
      id: "zip-for-notarization",
      title: "Zip the app for notarization (scratch, not the release's asset)",
      command: "ditto",
      args: ["-c", "-k", "--keepParent", p.app, p.submitted],
    },
    {
      id: "notarize",
      title: "Submit for notarization and wait for Apple's verdict",
      command: "xcrun",
      // `--output-format json` so the verdict can be read: `--wait` exits 0 on a rejection just as happily as on an
      // approval, and `acceptedSubmissionId` is what tells the two apart (#241). It costs the progress chatter, which
      // is why the runner prints the submission id itself. Placed before `--keychain-profile` so the profile stays
      // last, where the runner's own listing and the runbook both read it.
      args: [
        "notarytool", "submit", p.submitted,
        "--wait",
        "--output-format", "json",
        "--keychain-profile", plan.profile,
      ],
    },
    {
      // Without the ticket in the bundle, a player who is offline on first launch is refused by Gatekeeper.
      id: "staple",
      title: "Staple the notarization ticket into the app",
      command: "xcrun",
      args: ["stapler", "staple", p.app],
    },
    {
      id: "validate",
      title: "Validate the stapled ticket",
      command: "xcrun",
      args: ["stapler", "validate", p.app],
    },
    {
      // What the player's Mac will ask on first launch, asked here instead, where an answer is still cheap.
      id: "gatekeeper",
      title: "Check what Gatekeeper makes of it",
      command: "spctl",
      // No `-t`: `spctl`'s default assessment is `execute`, which is what happens to a downloaded `.app`. `install` is
      // the installer-package assessment, and answers a question nobody will ask of this artifact.
      args: ["-a", "-vvv", p.app],
    },
    {
      id: "zip-asset",
      title: `Zip the stapled app as ${safariAppZipName(plan.version)}`,
      command: "ditto",
      args: ["-c", "-k", "--keepParent", p.app, p.asset],
    },
    {
      id: "upload",
      title: `Upload it to ${tag}`,
      command: "gh",
      args: ["release", "upload", tag, p.asset, "--repo", plan.repo, "--clobber"],
    },
  ];
}
