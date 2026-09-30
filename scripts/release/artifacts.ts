/**
 * Three callers must agree on these names: `wxt.config.ts` writes the artifacts, `stamp-extension.ts` builds them and
 * `submit-extension.ts` uploads them (extension-distribution.md §14.2).
 */
import { fileURLToPath } from "node:url";
import type { Target } from "../../src/protocol/wire.ts";

export const EXTENSION_DIR = fileURLToPath(new URL("../../extension/", import.meta.url));

/** Orion is never a target of its own (extension-distribution.md §2). */
export const TARGETS: Target[] = ["chrome", "firefox", "safari"];

export const submitsToStores = (version: string): boolean => Number(version.split(".")[0]) >= 1;

/**
 * Refuses a prerelease: WXT names a zip after the manifest, where `storeVersion` keeps only three numbers, so a
 * prerelease would be uploaded looking for a zip written under another name.
 */
export function releaseVersion(version: string): string {
  if (version.includes("-")) throw new Error(`the extension stream cannot release a prerelease (${version})`);
  return version;
}

/** Safari's holds the unpackaged folder extension-distribution.md §14.6 feeds to the converter, not something Safari installs. */
export const zipName = (target: Target, version: string): string =>
  `coachemon-${target === "safari" ? "safari-web-extension" : target}-${version}.zip`;

/** The AMO sources zip (extension-distribution.md §5.7), written by the Firefox zip run alone. */
export const sourcesZipName = (version: string): string => `coachemon-${version}-sources.zip`;

/** Added by hand after the release is cut, so it is not in `releaseArtifacts` (extension-distribution.md §14.6). */
export const safariAppZipName = (version: string): string => `Coachemon-safari-${version}.zip`;

export const releaseArtifacts = (version: string): string[] => [
  ...TARGETS.map(target => zipName(target, version)),
  sourcesZipName(version),
];

/** What `wxt submit` reads; `release.yml` maps the repo's secrets onto these names (extension-distribution.md §14.4). */
export const SUBMIT_ENV = [
  "CHROME_EXTENSION_ID",
  "CHROME_PUBLISHER_ID",
  "CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL",
  "CHROME_SERVICE_ACCOUNT_PRIVATE_KEY",
  "FIREFOX_JWT_ISSUER",
  "FIREFOX_JWT_SECRET",
];

export const missingSubmitEnv = (env: Record<string, string | undefined>): string[] =>
  SUBMIT_ENV.filter(name => !env[name]);
