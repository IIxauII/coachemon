/**
 * Where the extension release's artifacts live and what they are called (§14.2), in one place because three callers
 * need to agree: `wxt.config.ts` writes them, `stamp-extension.ts` builds them and `submit-extension.ts` uploads them.
 */
import { fileURLToPath } from "node:url";
import type { Target } from "../../src/protocol/wire.ts";

/** The extension package: the directory every `wxt` command runs in, and where `.output/` ends up. */
export const EXTENSION_DIR = fileURLToPath(new URL("../../extension/", import.meta.url));

/** 0.x is unlisted and sideloaded from its GitHub Release; from 1.0.0 on every release submits to both (§14.1). */
export const submitsToStores = (version: string): boolean => Number(version.split(".")[0]) >= 1;

/**
 * The version the artifacts are named for, which is the one the manifest carries. WXT names a zip after the manifest,
 * and `storeVersion` keeps only three numbers there, so a prerelease would be uploaded looking for a zip written
 * under another name. `branches: ["master"]` cuts no prerelease today; this refuses one loudly rather than quietly.
 */
export function releaseVersion(version: string): string {
  if (version.includes("-")) throw new Error(`the extension stream cannot release a prerelease (${version})`);
  return version;
}

/**
 * A store artifact, one per target. Safari's says `safari-web-extension` because it holds the unpackaged folder that
 * §14.6 feeds to `xcrun safari-web-extension-packager`, not something Safari installs.
 */
export const zipName = (target: Target, version: string): string =>
  `coachemon-${target === "safari" ? "safari-web-extension" : target}-${version}.zip`;

/** The AMO sources zip (§5.7), written by the Firefox zip run alone. */
export const sourcesZipName = (version: string): string => `coachemon-${version}-sources.zip`;
