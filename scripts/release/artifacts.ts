/**
 * What the extension release names and decides, kept in one place because three callers need it: `wxt.config.ts` names
 * the zips it writes, `stamp-extension.ts` stamps the version, and `submit-extension.ts` decides whether to submit
 * (§14.1–§14.4). Pure on purpose — `src/extension-release.test.ts` covers it.
 */
import type { Target } from "../../src/protocol/wire.ts";

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const VERSION_FIELD = /"version":\s*"[^"]*"/;

export const isSemver = (version: string): boolean => SEMVER.test(version);

/** 0.x is unlisted and sideloaded from its GitHub Release; from 1.0.0 on every release submits to both stores (§14.1). */
export const submits = (version: string): boolean => Number(version.split(".")[0]) >= 1;

/**
 * A store artifact, one per target. Safari's says `safari-web-extension` because it holds the unpackaged folder that
 * §14.6 feeds to `xcrun safari-web-extension-packager`, not something Safari installs.
 */
export const zipName = (target: Target, version: string): string =>
  `coachemon-${target === "safari" ? "safari-web-extension" : target}-${version}.zip`;

/** The AMO sources zip (§5.7), written by the Firefox zip run alone. */
export const sourcesZipName = (version: string): string => `coachemon-${version}-sources.zip`;

/** `extension/package.json` with its version replaced in place, so the file keeps its hand formatting. */
export function stampVersion(text: string, version: string): string {
  if (!VERSION_FIELD.test(text)) throw new Error(`no "version" field to stamp`);
  return text.replace(VERSION_FIELD, `"version": "${version}"`);
}
