/** Build-time only: `wxt.config.ts` and the tests import this, never the extension bundle. */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../../../skills/coachemon/scripts/hud-bundle.mjs";
import { EVENT } from "../relay/channel.ts";

/** The id hashes `hud.js` and `page.js`, which do not exist until written, so the define puts this in and `stamp` swaps it. */
export const BUILD_PLACEHOLDER = "__COACHEMON_BUILD__";

/** Comment-stripped, which is what removes the lines quoting PokéRogue's code (extension-distribution.md §5.2). */
export function hudScript(bundled: string): string {
  const wrongWorld = `{ build: COACHEMON_BUILD, side: "hud" }`;
  return stripComments(`(() => {
const COACHEMON_BUILD = ${JSON.stringify(BUILD_PLACEHOLDER)};
// Seen from the MAIN world the relay's own-world marker is undefined; seeing it means this script ran isolated (extension-distribution.md §9.4).
if (typeof __coachemonIsolated !== "undefined") {
  document.dispatchEvent(new CustomEvent(${JSON.stringify(EVENT.wrongWorld)}, { detail: JSON.stringify(${wrongWorld}) }));
  return;
}
${bundled}
})();
`);
}

export function buildId(version: string, parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return `${version}+${hash.digest("hex").slice(0, 12)}`;
}

export function stamp(text: string, build: string): string {
  return text.replaceAll(BUILD_PLACEHOLDER, build);
}

export function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, keep).map(rel => join(name, rel));
    return keep(name) ? [name] : [];
  });
}

/** `THIRD_PARTY_NOTICES.md` with its corresponding-source version filled in (extension-distribution.md §15). */
export function notices(text: string, version: string): string {
  return text.replaceAll("extension-v<version>", `extension-v${version}`);
}
