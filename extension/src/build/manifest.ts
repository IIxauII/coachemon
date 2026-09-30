/**
 * Every content script is listed here by hand: WXT adds no manifest entry for an unlisted script, and `hud.js` is
 * written by the build hook (extension-distribution.md §5.2, §5.3).
 */
import type { Flavour, Target } from "../../../src/protocol/wire.ts";

/** The listing's fixed disclaimer (extension-distribution.md §3). */
export const DESCRIPTION =
  "Unofficial coach overlay for PokéRogue. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";

export const HOMEPAGE = "https://github.com/IIxauII/coachemon";

/** Permanent once AMO has seen it (extension-distribution.md §5.3). */
export const GECKO_ID = "coachemon@iixauii.github.io";

/** A test pins this wording (extension-distribution.md §8.4). */
export const ACTION_TITLE = "Coachemon: click once to let a local AI agent read this game";

/** Not `*.pokerogue.net`: the beta site was never reviewed against (extension-distribution.md §6). */
export const MATCHES = ["https://pokerogue.net/*"];

/**
 * Also filed by hand on AMO's form, and `src/listing.test.ts` pins the filing to this: change both or the listing
 * states something false (extension-distribution.md §5.3, §6).
 */
export const DATA_COLLECTION_PERMISSIONS = { required: ["none"], optional: ["websiteContent"] };

export type Manifest = Record<string, unknown>;

/** One list for the guard and for `manifestFor`'s test (extension-distribution.md §5.5). */
export const BANNED_MANIFEST_KEYS = ["permissions", "optional_permissions", "host_permissions", "optional_host_permissions"];
export const BANNED_MANIFEST_WORDS = ["nativeMessaging", "scripting", "tabs", "storage", "activeTab", "<all_urls>"];

/**
 * `scripts` rather than `service_worker` is an accepted premise (extension-distribution.md §16). WXT normalises an MV3
 * background to a service worker, so `wxt.config.ts` puts this back in `build:manifestGenerated`.
 */
export const SAFARI_BACKGROUND = { scripts: ["background.js"], persistent: false };

/** Before CI stamps it, `extension/package.json` holds `0.0.0-placeholder`, which no browser accepts (extension-distribution.md §14.2). */
export function storeVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "0.0.0";
}

export function manifestFor(o: { target: Target; flavour: Flavour; version: string }): Manifest {
  const common: Manifest = {
    // No `manifest_version`: WXT sets it from `manifestVersion: 3` in `wxt.config.ts`, and warns if a manifest sets it
    // too (extension-distribution.md §5.2).
    name: "Coachemon",
    version: storeVersion(o.version),
    description: DESCRIPTION,
    homepage_url: HOMEPAGE,
    icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
    content_scripts: [
      { matches: MATCHES, js: ["relay.js"], run_at: "document_start", world: "ISOLATED" },
      { matches: MATCHES, js: ["page.js", "hud.js"], run_at: "document_idle", world: "MAIN" },
    ],
    ...perTarget(o.target),
  };
  // extension-distribution.md §5.4.
  return o.flavour === "dev"
    ? { ...common, permissions: ["scripting", "activeTab"], host_permissions: ["<all_urls>"] }
    : common;
}

function perTarget(target: Target): Manifest {
  if (target === "chrome") {
    // 111 is `world: "MAIN"`'s floor, and nothing pins the extension id, so no `key` (extension-distribution.md §5.3).
    return { minimum_chrome_version: "111", background: { service_worker: "background.js" } };
  }
  if (target === "firefox") {
    return {
      background: { scripts: ["background.js"] },
      action: { default_title: ACTION_TITLE },
      // Drops MV3's default `upgrade-insecure-requests`, which turns `ws://127.0.0.1` into a failing TLS handshake.
      content_security_policy: { extension_pages: "script-src 'self'" },
      browser_specific_settings: {
        // 142, not `world: "MAIN"`'s 128: with no `gecko_android` key the linter checks Android against this floor, and
        // Android gained `data_collection_permissions` only at 142. Adding that key would offer the add-on on Android
        // (#379, #380, extension-distribution.md §5.3).
        gecko: {
          id: GECKO_ID,
          strict_min_version: "142.0",
          data_collection_permissions: DATA_COLLECTION_PERMISSIONS,
        },
      },
    };
  }
  // Whether Safari enforces `strict_min_version` is unverified (extension-distribution.md §5.3).
  return {
    background: SAFARI_BACKGROUND,
    browser_specific_settings: { safari: { strict_min_version: "18.0" } },
  };
}
