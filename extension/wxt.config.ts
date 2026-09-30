/**
 * Built by `wxt build -b chrome|firefox|safari --mode store|dev` only; `wxt dev` is not a supported build
 * (extension-distribution.md §5.2).
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";
import { sourcesZipName, zipName } from "../scripts/release/artifacts.ts";
import { bundle } from "../skills/coachemon/scripts/hud-bundle.mjs";
import { DEV_PORT, STORE_PORT } from "../src/protocol/version.ts";
import type { Flavour, Target } from "../src/protocol/wire.ts";
import { BUILD_PLACEHOLDER, buildId, hudScript, notices, stamp, walk } from "./src/build/artifact.ts";
import { SAFARI_BACKGROUND, manifestFor, storeVersion } from "./src/build/manifest.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = join(root, "..");
const version = storeVersion(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);

/** Anything but the dev flavour is a store build: a plain `wxt build` must never produce a dev artifact (extension-distribution.md §5.4). */
const flavourOf = (mode: string): Flavour => (mode === "dev" ? "dev" : "store");

const targetOf = (browser: string): Target => {
  if (browser === "firefox" || browser === "safari") return browser;
  // Orion installs the Chrome or the Firefox build; it is never a target of its own (extension-distribution.md §2).
  if (browser !== "chrome") throw new Error(`unknown target browser ${browser}; build -b chrome|firefox|safari`);
  return "chrome";
};

export default defineConfig({
  srcDir: ".",
  imports: false,
  // WXT defaults Firefox and Safari to MV2.
  manifestVersion: 3,
  mode: "store",
  // Without `{{mode}}`, a dev build overwrites the store build of the same browser.
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}-{{mode}}",
  manifest: ({ browser, mode }) => manifestFor({ target: targetOf(browser), flavour: flavourOf(mode), version }),
  vite: ({ browser, mode }) => ({
    define: {
      COACHEMON_BUILD: JSON.stringify(BUILD_PLACEHOLDER),
      // The whole URL, not a port: the guard looks for `ws://127.0.0.1:47147` literally
      // (extension-distribution.md §5.5).
      COACHEMON_HUB_URL: JSON.stringify(`ws://127.0.0.1:${flavourOf(mode) === "dev" ? DEV_PORT : STORE_PORT}/`),
      COACHEMON_TARGET: JSON.stringify(targetOf(browser)),
      COACHEMON_FLAVOUR: JSON.stringify(flavourOf(mode)),
      COACHEMON_VERSION: JSON.stringify(version),
    },
  }),
  zip: {
    // Only has to tell the browsers apart: `zip:extension:done` renames it to `zipName`'s
    // (extension-distribution.md §14.2).
    artifactTemplate: "coachemon-{{browser}}-{{version}}.zip",
    sourcesTemplate: sourcesZipName("{{version}}"),
    // The AMO sources zip: what `npx wxt build -b firefox` needs, and no more (extension-distribution.md §5.7).
    sourcesRoot: "..",
    includeSources: [
      "extension/**",
      "src/protocol/**",
      "src/page/**",
      "src/enums/generated.ts",
      // This config imports it, so `wxt build` inside the zip cannot load without it.
      "scripts/release/artifacts.ts",
      "skills/coachemon/scripts/hud-bundle.mjs",
      "skills/coachemon/scripts/hud/**",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "SOURCES.md",
    ],
    excludeSources: ["extension/.output/**", "extension/node_modules/**", "extension/.wxt/**"],
  },
  hooks: {
    /** The HUD bypasses WXT's bundler (extension-distribution.md §5.2). */
    "build:publicAssets": (_wxt, files) => {
      files.push(
        { relativeDest: "hud.js", contents: hudScript(bundle("hud")) },
        // (extension-distribution.md §15)
        { relativeDest: "LICENSE", contents: readFileSync(join(repo, "LICENSE"), "utf8") },
        {
          relativeDest: "THIRD_PARTY_NOTICES.md",
          contents: notices(readFileSync(join(repo, "THIRD_PARTY_NOTICES.md"), "utf8"), version),
        },
      );
    },
    /**
     * WXT rewrites an MV3 background to a service worker after `manifestFor`, so Safari's `scripts` goes back in here
     * (extension-distribution.md §5.3).
     */
    "build:manifestGenerated": (wxt, manifest) => {
      if (wxt.config.browser === "safari") (manifest as Record<string, unknown>).background = SAFARI_BACKGROUND;
    },
    "build:done": wxt => {
      const out = wxt.config.outDir;
      const build = buildId(version, ["hud.js", "page.js"].map(f => readFileSync(join(out, f), "utf8")));
      // Every `.js`, not a list of names: a chunk left unwalked ships the placeholder.
      for (const rel of walk(out, name => name.endsWith(".js"))) {
        const path = join(out, rel);
        const before = readFileSync(path, "utf8");
        const after = stamp(before, build);
        if (after !== before) writeFileSync(path, after);
      }
      wxt.logger.info(`Coachemon build ${build}`);
    },
    /**
     * `artifactTemplate` cannot branch on the browser, and Safari's artifact is not named for it
     * (extension-distribution.md §14.2).
     */
    "zip:extension:done": (wxt, zipPath) => {
      if (flavourOf(wxt.config.mode) !== "store") {
        throw new Error(`wxt zip is for store builds only; --mode ${wxt.config.mode} would overwrite a store artifact`);
      }
      const named = join(dirname(zipPath), zipName(targetOf(wxt.config.browser), version));
      if (named !== zipPath) renameSync(zipPath, named);
      wxt.logger.info(`Coachemon artifact ${basename(named)}`);
    },
  },
});
