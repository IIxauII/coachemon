/**
 * What the build makes beyond WXT's own output (§5.2): `hud.js`, the build id, and the notices every artifact carries.
 * Build-time only — `wxt.config.ts` and the tests import this, never the extension bundle.
 */
import { createHash } from "node:crypto";
import { stripComments } from "../../../skills/coach-pokerogue/scripts/hud-bundle.mjs";
import { EVENT } from "../relay/channel.ts";

/**
 * The string every script carries until the build id is known. The id is a hash over `hud.js` and `page.js`, which do
 * not exist until they are written, so the define puts this in and `stamp` swaps it for the real id afterwards (§5.2).
 */
export const BUILD_PLACEHOLDER = "__COACHEMON_BUILD__";

/**
 * `hud.js`: `bundle("hud")` untouched but for the wrapper, then comment-stripped, which is what removes the comment
 * lines quoting PokéRogue's code (§5.2). The wrapper is the world check (§9.4) and the build id the card events carry
 * (§9.1); the bundle's own prelude already replaces a running panel (§9.6).
 */
export function hudScript(bundled: string): string {
  const wrongWorld = `{ build: COACHEMON_BUILD, side: "hud" }`;
  return stripComments(`(() => {
const COACHEMON_BUILD = ${JSON.stringify(BUILD_PLACEHOLDER)};
// Seen from the MAIN world the relay's own-world marker is undefined; seeing it means this script ran isolated (§9.4).
if (typeof __coachemonIsolated !== "undefined") {
  document.dispatchEvent(new CustomEvent(${JSON.stringify(EVENT.wrongWorld)}, { detail: JSON.stringify(${wrongWorld}) }));
  return;
}
${bundled}
})();
`);
}

/** `<version>+<first 12 hex of sha256 over hud.js and page.js before stamping>` (§5.2). */
export function buildId(version: string, parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return `${version}+${hash.digest("hex").slice(0, 12)}`;
}

/** Puts the real id in wherever the define left the placeholder. */
export function stamp(text: string, build: string): string {
  return text.replaceAll(BUILD_PLACEHOLDER, build);
}

/** `THIRD_PARTY_NOTICES.md` with its corresponding-source version filled in (§15). */
export function notices(text: string, version: string): string {
  return text.replaceAll("extension-v<version>", `extension-v${version}`);
}
