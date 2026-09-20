/**
 * The manifests (§5.3, §5.4), as one pure function per target so the tests pin them exactly and `wxt.config.ts` stays
 * a wiring file. The store flavour declares **no permissions of any kind**: the static content-script match on
 * `https://pokerogue.net/*` is the whole permission set, on every target (§6).
 *
 * `relay.js` and `page.js` are WXT unlisted scripts, so they land at the output root and WXT adds nothing to the
 * manifest by itself; `hud.js` is written by the build hook (§5.2). Every content script is therefore listed here by
 * hand, which is also what keeps this file the single answer to "what does the reviewer see".
 *
 * 1.0.0 is the first version these manifests are listed under: 0.x ships unlisted by design, and from 1.0.0 the
 * release uploads and submits to both stores itself rather than a human filing the build by hand (§14.1, §14.4).
 */
import type { Flavour, Target } from "../../../src/protocol/wire.ts";

/** The listing's fixed disclaimer, which lives in `description` because the extension has no About page (§3). */
export const DESCRIPTION =
  "Unofficial coach overlay for PokéRogue. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";

/** After the rename; the repo is the homepage on every listing (§3). */
export const HOMEPAGE = "https://github.com/IIxauII/coachemon";

/** Permanent once AMO has seen it (§5.3). */
export const GECKO_ID = "coachemon@iixauii.github.io";

/** What the Firefox toolbar button says it does, which is the 128–139 consent experience itself (§8.4). */
export const ACTION_TITLE = "Coachemon: click once to let a local AI agent read this game";

/** Not `*.pokerogue.net`: the beta site was never reviewed against (§6). */
export const MATCHES = ["https://pokerogue.net/*"];

/** What AMO is told the extension collects, declared in the manifest and filed by hand on the form (§5.3, §6).
 * Exported so `src/listing.test.ts` can pin the filing to it: a change here that the filing did not follow would
 * otherwise leave a false statement standing on the listing. */
export const DATA_COLLECTION_PERMISSIONS = { required: ["none"], optional: ["websiteContent"] };

export type Manifest = Record<string, unknown>;

/**
 * What a store manifest may not have, and may not so much as mention (§5.5 check 1). One list, read by the guard that
 * checks the built artifact and by the test that checks `manifestFor`: two copies drift, and the first pair did.
 */
export const BANNED_MANIFEST_KEYS = ["permissions", "optional_permissions", "host_permissions", "optional_host_permissions"];
export const BANNED_MANIFEST_WORDS = ["nativeMessaging", "scripting", "tabs", "storage", "activeTab", "<all_urls>"];

/**
 * Safari's background: `scripts` rather than `service_worker`, which is an accepted premise (§16). WXT normalises an
 * MV3 background to a service worker, so `wxt.config.ts` puts this back in `build:manifestGenerated`.
 */
export const SAFARI_BACKGROUND = { scripts: ["background.js"], persistent: false };

/**
 * A store version string from whatever `extension/package.json` holds. Before CI stamps it that is
 * `0.0.0-placeholder`, which no browser accepts, so the numeric prefix is taken and the rest dropped (§14.2).
 */
export function storeVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "0.0.0";
}

export function manifestFor(o: { target: Target; flavour: Flavour; version: string }): Manifest {
  const common: Manifest = {
    // `manifest_version` is not set here: WXT owns it, from `manifestVersion: 3` in `wxt.config.ts`, and warns if a
    // manifest sets it too. It is 3 on every target, MV2 defaults for Firefox and Safari included (§5.2).
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
  // The dev flavour alone gets permissions, for `screenshot` and for re-injection into open tabs (§5.4).
  return o.flavour === "dev"
    ? { ...common, permissions: ["scripting", "activeTab"], host_permissions: ["<all_urls>"] }
    : common;
}

function perTarget(target: Target): Manifest {
  if (target === "chrome") {
    // The floor is `world: "MAIN"`'s, and nothing pins the extension id, so Chrome needs no `key` (§5.3).
    return { minimum_chrome_version: "111", background: { service_worker: "background.js" } };
  }
  if (target === "firefox") {
    return {
      background: { scripts: ["background.js"] },
      action: { default_title: ACTION_TITLE },
      // Drops MV3's default `upgrade-insecure-requests`, which turns `ws://127.0.0.1` into a failing TLS handshake.
      content_security_policy: { extension_pages: "script-src 'self'" },
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          strict_min_version: "128.0",
          data_collection_permissions: DATA_COLLECTION_PERMISSIONS,
        },
      },
    };
  }
  // Whether Safari enforces `strict_min_version` is unverified; the Safari 18 floor is stated with the download too.
  return {
    background: SAFARI_BACKGROUND,
    browser_specific_settings: { safari: { strict_min_version: "18.0" } },
  };
}
