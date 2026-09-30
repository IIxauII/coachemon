/** The Safari release as a pure plan, which `safari-release.ts` carries out on the dev's Mac (extension-distribution.md §14.6). */
import { join } from "node:path";
import { safariAppZipName, zipName } from "./artifacts.ts";

/** Picked by extension-distribution.md §3 and §14.6. */
export const APP_NAME = "Coachemon";
export const BUNDLE_ID = "io.github.iixauii.coachemon";

export const extensionTag = (version: string): string => `extension-v${version}`;

/** Code branches on `id`, never on `title`: a check hung off display text stops running when the sentence is reworded. */
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
  version: string;
  /** A scratch directory. Everything the build writes lands under it and nothing outside it is touched. */
  work: string;
  /** The full `Developer ID Application: …` string, as the keychain spells it. */
  identity: string;
  /** The `notarytool store-credentials` profile holding the app-specific password (`docs/runbooks/safari-release.md`). */
  profile: string;
  /** `owner/name`, told because `gh` runs outside the checkout (extension-distribution.md §14.6). */
  repo: string;
};

export function safariPaths({ work, version }: Pick<SafariPlan, "work" | "version">) {
  const exported = join(work, "export");
  return {
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
 * An `Apple Development` identity is not notarizable and a `Developer ID Installer` one signs packages, not apps, so
 * neither is a candidate though both sit in the same listing.
 */
export function developerIdIdentities(listing: string): string[] {
  return [...listing.matchAll(IDENTITY)].map(match => match[1]);
}

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

/** Either spelling `git remote get-url` hands back, SSH or HTTPS. */
export function repoFromRemote(url: string): string {
  const match = REMOTE.exec(url.trim());
  if (!match) throw new Error(`no owner/name in the remote ${url}`);
  return match[1];
}

export function teamIdFrom(identity: string): string {
  const match = TEAM_ID.exec(identity.trim());
  if (!match) throw new Error(`no team id in ${identity}; expected a trailing "(TEAMID1234)"`);
  return match[1];
}

/** `destination: export` writes the app to disk rather than handing it to Apple's distribution service. */
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

export function packagedVersion(manifest: string): string {
  const version = (JSON.parse(manifest) as { version?: string }).version;
  if (!version) throw new Error("the downloaded extension carries no version in its manifest");
  return version;
}

/**
 * `notarytool submit --wait` exits 0 on any *final* verdict, `Invalid` among them, so the status is read rather than
 * inferred: otherwise the run walks on to `stapler staple`, which fails for want of a ticket and leaves the dev reading
 * a staple failure for a notarization problem (#241).
 */
export function acceptedSubmissionId(output: string, profile: string): string {
  let verdict: { id?: string; status?: string; message?: string };
  try {
    verdict = JSON.parse(output) as typeof verdict;
  } catch {
    throw new Error(`notarytool printed no JSON verdict to read:\n${output.trim()}`);
  }
  const { id, status, message } = verdict;
  if (!id || !status) throw new Error(`notarytool's verdict carries no id and status:\n${output.trim()}`);
  if (status !== "Accepted") {
    throw new Error(
      `Apple did not accept submission ${id}: ${status}${message ? ` — ${message}` : ""}\n` +
        `  xcrun notarytool log ${id} --keychain-profile ${profile}`,
    );
  }
  return id;
}

/** extension-distribution.md §14.6 as commands, in order. */
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
        "--repo", plan.repo,
        "--pattern", zipName("safari", plan.version),
        "--dir", plan.work,
        "--clobber",
      ],
    },
    {
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
        // The converter, not a packager: `xcrun` finds none (extension-distribution.md §14.6).
        "safari-web-extension-converter",
        p.unpacked,
        "--project-location", p.project,
        "--app-name", APP_NAME,
        "--bundle-identifier", BUNDLE_ID,
        "--macos-only",
        "--copy-resources",
        "--no-open",
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
      // JSON, so `acceptedSubmissionId` can read the verdict `--wait`'s exit code hides (#241). The profile stays last,
      // where the runbook reads it off the runner's listing.
      args: [
        "notarytool", "submit", p.submitted,
        "--wait",
        "--output-format", "json",
        "--keychain-profile", plan.profile,
      ],
    },
    {
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
      id: "gatekeeper",
      title: "Check what Gatekeeper makes of it",
      command: "spctl",
      // No `-t` (extension-distribution.md §14.6).
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
