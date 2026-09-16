# Extension build: framework or zero-dep bundler

Ticket: [#106 Build pipeline for three engines](https://github.com/IIxauII/pokerogue-mcp/issues/106), under the map [#98](https://github.com/IIxauII/pokerogue-mcp/issues/98). Researched **2026-09-16** against official docs, source at tagged releases, issue trackers and the npm registry. Install weights were measured locally (method in §9). Anything not confirmed by a primary source is marked **UNVERIFIED**.

**Short answer.**
- **No framework does Safari packaging for a store.** WXT and Plasmo leave `xcrun safari-web-extension-packager` to you, and so does CRXJS. Extension.js runs the old `converter` name plus `xcodebuild`, but only for local dev. The Safari wrapper is hand-built on every route.
- **No framework is needed for the MAIN-world HUD.** Every live framework would either rewrite the shared-scope HUD through its bundler, or have to be routed around so the prebuilt `bundle()` output reaches the manifest untouched. The one exception is Extension.js's "classic concat". So the framework's core value, its bundler, is exactly the part the HUD must avoid.
- **What a framework does buy:** per-browser manifest shaping, zips, the AMO sources zip, a dev reload loop, and `submit` to CWS and AMO.
- **Plasmo is out.** It is effectively abandoned, and it cannot emit a static MAIN-world content script at all.
- **WXT is the only serious framework,** with a bus factor of about 1.
- **Weight never reaches players if isolated.** A nested `extension/package.json` with its own lockfile keeps any choice out of every player's plugin cache. npm workspaces do not.

## Comparison

| | **WXT** | **Plasmo** | **CRXJS** | **Extension.js** | **Bedframe** | **zero-dep (+ web-ext)** |
|---|---|---|---|---|---|---|
| Latest release | 0.21.4, 2026-08-11 | 0.90.5, 2025-05-17 | 2.7.1, 2026-07-01 | 4.1.19, 2026-09-15 | cli 0.1.2, 2026-03-17 | web-ext 10.6.0, 2026-08-04 |
| Status | Active, pre-1.0, bus factor ≈1 | **Abandoned** (no maintainer activity for 16 months) | Active, bus factor ≈1, ESM-only major pending | Very active, bus factor 1, telemetry on | Dormant wrapper around CRXJS 2.3.0 | Mozilla-owned, regular releases |
| Chrome MV3 | yes | yes | yes | yes | yes | hand-written manifest |
| Firefox MV3 | yes, but **defaults to MV2**; emits `background.scripts`; warns if `data_collection_permissions` missing | "experimental"; forces `service_worker`→`scripts` | yes, `background.scripts`; gecko types incl. `data_collection_permissions` | yes, `firefox:`/`gecko:` key prefixes | via CRXJS 2.3.0 | hand-written; `web-ext lint` validates `data_collection_permissions` |
| Safari | manifest tweaks only, **defaults to MV2**, no packager | none | none | dev only: runs `safari-web-extension-converter` + `xcodebuild` | an npm script calling the converter | hand-run packager (same on every route) |
| Static `world: "MAIN"` | yes | **no**: moved to runtime `registerContentScripts` and adds `scripting` | yes (2.3.0+) | yes, but **inserts a bridge content script** | via CRXJS 2.3.0 | yes |
| Prebuilt non-module HUD | yes: `build:publicAssets` hook + hand-written manifest entry | no clean route | only via a `renderCrxManifest` hook (UNVERIFIED) | native classic-file concat through Rspack (not byte-identical) | as CRXJS | it is the HUD's current shape |
| Dev reload | Chrome and Firefox via web-ext + websocket; tabs reloaded, not re-injected; no Safari | websocket; buggy; no Safari | Vite HMR; no browser launch | Chrome, Firefox, Safari; re-injects into open tabs | as CRXJS | web-ext run (Chrome, Firefox) or hand-built |
| Dev-only permissions/files | yes (`manifest({mode})`, hooks) | permissions only | yes (`defineManifest({mode})`) | no mode split in manifest | no (mode = browser) | trivial (own code) |
| Zips / AMO sources zip | yes / yes | zip / no | no / no | yes / yes (`--zip-source`) | `zip -r` / UNVERIFIED | web-ext build zip / `git archive` |
| Store submit | CWS, AMO, Edge, Opera | via stale `bpp` | none | none | CWS (old CLI), AMO, Edge | `web-ext sign` (AMO); `publish-browser-extension` or `chrome-webstore-upload-cli` (CWS) |
| Measured install | 155 pkgs / 53 MB (+web-ext: 453 / 130 MB) | 646 / 493 MB | 70 / 51 MB (with vite) | 359 / 133 MB | 436 / 243 MB | 0; web-ext 329 / 81 MB; publish-browser-extension 4 / 0.4 MB |

## 1. Maintenance

### WXT
- **Releases:** 0.21.4 on 2026-08-11 (`npm view wxt time`, [releases](https://github.com/wxt-dev/wxt/releases)). About 20 core releases in the last 12 months, with gaps from 2025-09-05 to 2025-12-16 and since 2026-08-11.
- **Still pre-1.0 and still breaking.** 0.21.1 carried 13 breaking changes, including Node >=22 and `web-ext` becoming a peer dependency. 0.21.0 is deprecated as an invalid release ([CHANGELOG](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/CHANGELOG.md)).
- **Issue health:** 164 open issues and 51 open PRs. 169 issues opened and 157 closed in the last year (GitHub search API).
- **Bus factor ≈1.** aklinker1 wrote 240 of 534 commits in the last year. The next human has 36 (`gh api repos/wxt-dev/wxt/stats/contributors`).
- **Ownership:** moved to the `wxt-dev` org (`repos/aklinker1/wxt` redirects; transfer date UNVERIFIED). Funding is GitHub Sponsors only ([FUNDING.yml](https://github.com/wxt-dev/wxt/blob/main/.github/FUNDING.yml)).

### Plasmo: effectively abandoned
- **Last publish:** `plasmo@0.90.5` on 2025-05-17 ([npm](https://www.npmjs.com/package/plasmo)).
- **Last maintainer commit:** `9369e28` on 2025-05-17 ([commits](https://github.com/PlasmoHQ/plasmo/commits/main)).
- **No merges since then:** zero PRs merged since 2025-05-18 (GitHub search `is:pr is:merged merged:>2025-05-18`).
- **The "recent activity" is a bot.** `pushed_at` is today, but the [events API](https://api.github.com/repos/PlasmoHQ/plasmo/events) shows only renovate[bot] pushing its own branches.
- **Backlog:** 347 open issues and 24 open PRs.
- **Maintainers silent:** of 113 issue and PR comments since 2025-05-18, none is from an OWNER or MEMBER.
- **"Is this maintained?" gets no maintainer answer.** [#1345](https://github.com/PlasmoHQ/plasmo/issues/1345) (2026-02-07) got only community replies. Those say the core team moved on (UNVERIFIED) and point to WXT, Extension.js, or the fork `Extension-Master/extenso`.
- **No shutdown statement.** The README still promotes the paid Itero product ([README](https://github.com/PlasmoHQ/plasmo#readme)).
- **Frozen dependencies:**
  - Plasmo pins `@parcel/core` 2.9.3, from 2023-06-25 (`npm view plasmo dependencies`).
  - Its `@plasmohq/parcel-*` plugins last published 2025-02 to 2025-05.
  - Its publishing action [`bpp`](https://github.com/PlasmoHQ/bpp) last released v3.8.0 on 2025-02-09.

### CRXJS (`@crxjs/vite-plugin`)
- **Releases:** 2.7.1 on 2026-07-01, 8 releases in 12 months ([npm](https://www.npmjs.com/package/@crxjs/vite-plugin)). Last commit 2026-09-13.
- **The 2025 archival threat was resolved.** It was announced 2025-02-04 and lifted 2025-06-10 when a new maintainer shipped 2.0 ([Discussion #974](https://github.com/crxjs/chrome-extension-tools/discussions/974)).
- **Bus factor ≈1:** Toumash wrote 84 of the last 100 commits.
- **Major pending:** an ESM-only major is queued in [`.changeset`](https://github.com/crxjs/chrome-extension-tools/tree/main/.changeset).

### Extension.js (`extension`)
- **Releases:** 4.1.19 on 2026-09-15; 4.0.0 on 2026-06-30 ([npm](https://www.npmjs.com/package/extension), [4.0 post](https://extension.js.org/blog/announcing-4-0-0.md)). Most of its 421 publishes in 12 months are canaries.
- **Issue health:** 6 open issues and 0 open PRs.
- **Bus factor 1:** cezaraugusto has 2,658 commits; the next human has 16.
- **Telemetry:** PostHog, **on by default in interactive terminals** ([telemetry docs](https://extension.js.org/docs/features/telemetry-and-privacy.md)).

### Bedframe
- **Releases:** cli 0.1.2 on 2026-03-17, core 0.1.0 on 2026-03-10. Only dependabot merges since ([repo](https://github.com/nyaggah/bedframe)).
- **Pins an old CRXJS:** `@crxjs/vite-plugin` 2.3.0 (`npm view @bedframe/core dependencies`).

### web-ext and the publishing CLIs
- **web-ext:** 10.6.0 on 2026-08-04, releases every 1–6 weeks since 10.0.0 on 2026-03-13 ([releases](https://github.com/mozilla/web-ext/releases)). Owned by the `mozilla` org; 223 open issues and PRs.
- **publish-browser-extension:** 6.1.1 on 2026-08-10 ([releases](https://github.com/aklinker1/publish-browser-extension/releases)).
- **chrome-webstore-upload-cli:** 4.0.1 on 2026-05-28 ([repo](https://github.com/fregante/chrome-webstore-upload-cli)).

### Other options, briefly
- **vite-plugin-web-extension (aklinker1):** its README says it will be deprecated in favour of WXT ([repo](https://github.com/aklinker1/vite-plugin-web-extension)).
- **@samrum/vite-plugin-web-extension:** dormant since 2024-09-26 ([repo](https://github.com/samrum/vite-plugin-web-extension)).
- **webextension-toolbox:** only dependabot activity since Feb 2024 ([repo](https://github.com/webextension-toolbox/webextension-toolbox)).
- **extension-cli:** dead since 2022 ([repo](https://github.com/mobilefirstllc/extension-cli)).
- **@parcel/config-webextension:** maintained with Parcel 2.16.4 (Feb 2026); MAIN-world handling UNVERIFIED ([repo](https://github.com/parcel-bundler/parcel)).

## 2. Browser targets and per-browser manifests

### WXT
- **Firefox and Safari default to MV2.** `manifestVersion ?? (browser === 'firefox' || browser === 'safari' ? 2 : 3)` ([resolve-config.ts L82-84](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/resolve-config.ts#L82-L84), verified). MV3 needs `manifestVersion: 3` or `--mv3`.
- **Background key:** Firefox MV3 gets `background.scripts`, Chrome gets `service_worker` ([manifest.ts L240-249](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/manifest.ts#L240-L249)).
- **`data_collection_permissions`:** passes through from the `manifest` config. WXT warns when it is missing on Firefox ([manifest.ts L118-141](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/manifest.ts#L118-L141), verified; added in [#1976](https://github.com/wxt-dev/wxt/pull/1976)).
- **Safari:** `-b safari` only drops a couple of keys, e.g. `options_ui.open_in_tab` ([manifest.ts L596](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/manifest.ts#L596)). The docs say to run `xcrun safari-web-extension-packager .output/safari-mv2` yourself, and that Safari publishing is not supported ([publishing#safari](https://wxt.dev/guide/essentials/publishing.html#safari)).
- **Overrides:** `manifest` can be a function of `{browser, manifestVersion, mode, command}` ([manifest config](https://wxt.dev/guide/essentials/config/manifest.html)). Entrypoints take per-browser `include`/`exclude` ([target-different-browsers](https://wxt.dev/guide/essentials/target-different-browsers.html)).

### Plasmo
- **Support levels:** Firefox MV3 is "experimental", and `safari-mv3` "requires some workaround": run Apple's converter yourself ([FAQ](https://docs.plasmo.com/framework/workflows/faq)). The Safari RFC [#233](https://github.com/PlasmoHQ/plasmo/issues/233) has been open since 2022.
- **Background key:** for Firefox, `service_worker` is rewritten to `scripts` ([handle-background.ts](https://github.com/PlasmoHQ/plasmo/blob/main/core/parcel-transformer-manifest/src/handle-background.ts)).
- **Overrides:** `manifest.overrides[<browser>]` in package.json is merged in ([base.ts](https://github.com/PlasmoHQ/plasmo/blob/main/cli/plasmo/src/features/manifest-factory/base.ts)).
- **`data_collection_permissions`:** not referenced anywhere in the source. Pass-through is UNVERIFIED.

### CRXJS
- **Targets:** only `browser: 'firefox' | 'chrome'` ([types.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/types.ts)).
- **Firefox:** `background.scripts` is emitted ([plugin-background.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/plugin-background.ts)); gecko `data_collection_permissions` types arrived in 2.5.0 ([CHANGELOG](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/CHANGELOG.md)).
- **Safari:** nothing ([#1222](https://github.com/crxjs/chrome-extension-tools/issues/1222)).
- **Overrides:** the manifest can be a function of Vite's `ConfigEnv` ([defineManifest.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/defineManifest.ts)).

### Extension.js
- **Overrides:** manifest keys can carry browser prefixes (`chromium:`, `firefox:`/`gecko:`, `safari:`/`webkit:`) at any depth ([browser-specific-fields](https://extension.js.org/docs/features/browser-specific-fields.md)).
- **Trap:** `chromium:` keys also apply to Safari, and Safari key filtering keeps `nativeMessaging` ([spec](https://github.com/extension-js/extension.js/blob/main/programs/develop/plugin-web-extension/feature-manifest/manifest-lib/__spec__/filter-keys-safari.spec.ts)). A `safari:permissions` override would be needed.
- **Safari build:** needs macOS and full Xcode; runs the converter plus `xcodebuild` with ad-hoc signing ([Safari docs](https://extension.js.org/docs/browsers/safari.md), [run-safari](https://github.com/extension-js/extension.js/tree/main/programs/extension/browsers/run-safari/safari-launch)).

### Safari for everyone
- **The packager builds an Xcode project with a containing app.** Flags include `--project-location`, `--bundle-identifier`, `--copy-resources`, `--macos-only`, `--rebuild-project`, `--no-open` and `--no-prompt` ([Apple](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)).
- **App Store Connect's ZIP packager is web UI in Xcode Cloud,** aimed at TestFlight and the App Store ([Apple](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect), [WWDC26 216](https://developer.apple.com/videos/play/wwdc2026/216/)).
  - No upload API was found (absence UNVERIFIED).
  - Developer ID is not mentioned (UNVERIFIED as an exclusion).
- **Developer ID means signing and notarizing the app yourself** ([distributing](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension), [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
- **No framework automates any of this for release.**

## 3. Static `content_scripts[].world: "MAIN"`

- **WXT: yes.** `defineContentScript({ world: 'MAIN' })` writes `content_scripts[].world` ([content-scripts.ts L66](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/content-scripts.ts#L66)).
  - Its docs still call MAIN "only supported by Chromium browsers" ([content-scripts guide](https://wxt.dev/guide/essentials/content-scripts.html#isolated-world-vs-main-world)).
  - Open PR [#2621](https://github.com/wxt-dev/wxt/pull/2621) corrects that, citing Firefox 128.
- **Plasmo: no.**
  - MAIN-world scripts are filtered out of the manifest ("TODO: Remove this when Chrome natively supports mainworld for CS", [base.ts](https://github.com/PlasmoHQ/plasmo/blob/main/cli/plasmo/src/features/manifest-factory/base.ts)).
  - They are registered at runtime with `chrome.scripting.registerContentScripts`, and `scripting` is added automatically ([bgsw-main-world-script.ts](https://github.com/PlasmoHQ/plasmo/blob/main/cli/plasmo/src/features/background-service-worker/bgsw-main-world-script.ts)).
  - That breaks the no-`scripting` store permission set from [#110](https://github.com/IIxauII/pokerogue-mcp/issues/110).
  - On Firefox that call is reported broken ([#1304](https://github.com/PlasmoHQ/plasmo/issues/1304)).
  - A hand-written `world` in the package.json manifest fails the content-script schema, which has `additionalProperties: false` ([schema.ts](https://github.com/PlasmoHQ/plasmo/blob/main/core/parcel-transformer-manifest/src/schema.ts)). This comes from reading the source, not from running it.
- **CRXJS: yes.** Manifest MAIN scripts since 2.3.0, and dev HMR for them since 2.7.0 ([CHANGELOG](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/CHANGELOG.md)).
- **Extension.js: yes, but the manifest changes.** For each `world: "MAIN"` entry it inserts an isolated-world "bridge" content script ([content_scripts.ts](https://github.com/extension-js/extension.js/blob/main/programs/develop/plugin-web-extension/feature-manifest/manifest-overrides/common/content_scripts.ts), verified).
  - The code has no dev/production branch there, so the store build probably ships the extra script too (UNVERIFIED at runtime).
  - Its source comment calls `world` "Chromium-only".
- **Zero-dep: yes.** Whatever the hand-written manifest says. `web-ext lint` accepts `MAIN` ([addons-linter schema](https://github.com/mozilla/addons-linter/blob/master/src/schema/imported/extension_types.json)).

## 4. Consuming the prebuilt, non-module HUD bundle

The HUD is 22 files sharing one top-level scope, concatenated by `bundle()` in `skills/coach-pokerogue/scripts/hud-bundle.mjs`. Any bundler that treats them as modules, or wraps them, changes semantics.

### WXT: yes, by routing around Vite
- **Emit the bundle with a hook.** `'build:publicAssets': (wxt, files: ResolvedPublicFile[])` accepts `{ relativeDest, contents }` and writes the string verbatim ([types.ts L1448](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/types.ts#L1448), [build-entrypoints.ts L43-68](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/building/build-entrypoints.ts#L43-L68)). The hook can call `bundle(mode)`.
- **Declare it by hand.** A hand-written `content_scripts` entry in `manifest` is kept: WXT merges user config first and only appends ([manifest.ts L438-439](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/manifest.ts#L438-L439)).
- **The normal route rewrites the code.** A `*.content.js` entrypoint always goes through a Vite IIFE build with a `main()` wrapper ([vite/index.ts L124-196](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/builders/vite/index.ts#L124-L196), [main-world entrypoint](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/virtual/content-script-main-world-entrypoint.ts)).
- **Catch 1:** WXT throws `No entrypoints found` when `entrypoints/` is empty, so a real background or popup must exist ([find-entrypoints.ts L266-270](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/building/find-entrypoints.ts#L266-L270)).
- **Catch 2:** edits to `hud/*.js` outside the WXT root are not watched in dev ([detect-dev-changes.ts L142-153](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/building/detect-dev-changes.ts#L142-L153)). A dev HUD rebuild needs our own watcher.

### Plasmo: no clean route
- Paths in the manifest override are bundled through Parcel ([handle-content-scripts.ts](https://github.com/PlasmoHQ/plasmo/blob/main/core/parcel-transformer-manifest/src/handle-content-scripts.ts)).
- Every bundle is wrapped in a function by `parcel-optimizer-encapsulate` ([source](https://github.com/PlasmoHQ/plasmo/blob/main/core/parcel-optimizer-encapsulate/src/index.ts)).
- `raw:` copies a file but only returns a URL ([import docs](https://docs.plasmo.com/framework/import)), so we would have to register it at runtime.

### CRXJS: not through the manifest
- Every `content_scripts[].js` goes through Vite, possibly as a second IIFE library build ([plugin-contentScripts_iife.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/plugin-contentScripts_iife.ts)).
- A custom plugin's `renderCrxManifest` hook runs after that rewrite and could add a `public/` file as the MAIN entry ([plugin-manifest.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/plugin-manifest.ts)). UNVERIFIED.

### Extension.js: closest native fit
- A `content_scripts.js` array of plain files with no import/export is concatenated into one shared scope ([content-scripts guide](https://extension.js.org/docs/implementation-guide/content-scripts.md), [classic-concat.ts](https://github.com/extension-js/extension.js/blob/main/programs/develop/plugin-web-extension/shared/classic-concat.ts)).
- It still passes through Rspack, so the output is not byte-identical to `bundle()`.
- Whether classic groups also get the mount wrapper is UNVERIFIED.
- The IIFE wrapper and `__MODE__` substitution in `bundle()` would not be reproduced.

### Zero-dep
The output of `bundle()` is the file. Nothing to route around.

## 5. Dev loop

### WXT
- **Browser launch:** through `web-ext` (`webExt.cmd.run` with web-ext's own reload off). web-ext is an optional peer dependency since 0.21.1 ([runners/web-ext.ts](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/runners/web-ext.ts)).
- **Reloads:** a websocket in the dev background triggers `runtime.reload()`. For real content-script entrypoints it re-registers them and **reloads matching tabs**, rather than re-injecting ([reload-content-scripts.ts](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/virtual/utils/reload-content-scripts.ts)).
- **A `public/` HUD would get a full extension reload** ([create-file-reloader.ts](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/create-file-reloader.ts#L248-L275)).
- **Safari:** no runner; it just logs "load manually" ([runners/safari.ts](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/runners/safari.ts)).
- **`wxt` dev force-adds to the manifest:**
  - `tabs` and `scripting`
  - the dev-server host permission
  - a localhost CSP
  - on MV3, it moves entrypoint content scripts into runtime registration

  Sources: [manifest.ts L498-545](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/manifest.ts#L498-L545), [FAQ](https://wxt.dev/guide/resources/faq.html#why-aren-t-content-scripts-added-to-the-manifest).

### Plasmo
- Websocket HMR on port 1815. A content-script change reloads the extension and the active tab ([dev docs](https://docs.plasmo.com/framework/workflows/dev), [runtimes](https://github.com/PlasmoHQ/plasmo/tree/main/core/parcel-runtime/src/runtimes)).
- The MAIN-world reload path is a "(?)" comment in source.
- Open [#664](https://github.com/PlasmoHQ/plasmo/issues/664): "Development server usually doesn't update the extension".

### CRXJS
Vite websocket HMR, with a `liveReload` option ([types.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/types.ts)). It does not launch browsers. Firefox dev loading code from `http://localhost` is UNVERIFIED against MV3 CSP.

### Extension.js
- Launches Chrome and Firefox (Firefox via RDP), classifies reloads, and **re-injects changed content scripts into open tabs** ([reload-and-hmr](https://extension.js.org/docs/features/reload-and-hmr.md)).
- Safari: incremental `xcodebuild` resync, about 4 s per save ([Safari docs](https://extension.js.org/docs/browsers/safari.md)).

### web-ext on its own
- **Targets:** `firefox-desktop`, `firefox-android` and `chromium`. No Safari ([command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)).
- **Firefox:** installs a temporary add-on and reloads it over RDP ([remote.js](https://github.com/mozilla/web-ext/blob/master/src/firefox/remote.js)).
- **Chromium:** since 8.8.0 it launches Chrome with `--remote-debugging-pipe --enable-unsafe-extension-debugging` and loads through CDP `Extensions.loadUnpacked` ([chromium.js](https://github.com/mozilla/web-ext/blob/master/src/extension-runners/chromium.js), [8.8.0](https://github.com/mozilla/web-ext/releases/tag/8.8.0)). That fixed branded Chrome 137+, which dropped `--load-extension` ([#3443](https://github.com/mozilla/web-ext/issues/3443), [Chrome extension news](https://developer.chrome.com/blog/extension-news-june-2025)).
- **Pipe mode sets `navigator.webdriver`,** so web-ext adds `--disable-blink-features=AutomationControlled` (chromium.js).
- **Watching a generated directory:** `--source-dir` can be a build output, and `--watch-file`/`--watch-ignored` let an external build trigger reloads (command reference).
- **Always launches its own Chrome** via `chrome-launcher` (chromium.js). It cannot attach to the project's existing `~/.pokerogue-mcp/chrome-profile` process (UNVERIFIED beyond reading source). `--chromium-profile` plus `--keep-profile-changes` can point at that user-data-dir.

### Re-injection into already-open tabs
- **Chrome does not run manifest content scripts in tabs that were open before install or reload.** The standard workaround is `scripting.executeScript` from `onInstalled`. This is from the Google-hosted [chromium-extensions group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/l6hwu8YSR0w), not from developer.chrome.com, where no statement was found.
- **Firefox:** UNVERIFIED. MDN is silent ([content_scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)).
- **Safari 26.2 injected into the open tab on grant,** without a reload ([Safari MAIN-world research](https://github.com/IIxauII/pokerogue-mcp/blob/research/safari-main-world/docs/research/safari-main-world.md)).
- **Consequence:** any dev loop that wants the HUD live without a page reload needs `scripting` plus host access in the dev flavour. WXT and Plasmo reload the tab instead; Extension.js re-injects.

## 6. Build flavours: dev permissions and files the store build physically excludes

The requirement comes from [#110](https://github.com/IIxauII/pokerogue-mcp/issues/110): eval and `captureVisibleTab` only in dev.

- **WXT: yes.**
  - `--mode` exists on `build` and `zip`, and `manifest: ({mode}) => …` can add `scripting`, `activeTab`/`<all_urls>` and `http://127.0.0.1/*` ([build-mode](https://wxt.dev/guide/essentials/config/build-mode.html)).
  - Files: entrypoint `include`/`exclude` only take browsers. Mode exclusion goes through `filterEntrypoints` or an `entrypoints:resolved` hook ([find-entrypoints.ts L153, L415-436](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/utils/building/find-entrypoints.ts#L153)). Removal inside the hook is UNVERIFIED.
  - A `build:publicAssets` hook can just skip emitting dev files by mode.
  - Use `wxt build --mode dev`, not `wxt` dev, to control the exact manifest, because dev force-adds `tabs` and `scripting` (§5).
- **Plasmo: permissions only.** A manifest key whose env var is missing is dropped ([manifest customization](https://docs.plasmo.com/framework/customization/manifest), [env](https://docs.plasmo.com/framework/env)). No per-flavour file exclusion found (UNVERIFIED).
- **CRXJS: yes.** `defineManifest` receives `{command, mode}` ([defineManifest.ts](https://github.com/crxjs/chrome-extension-tools/blob/main/packages/vite-plugin/src/node/defineManifest.ts)).
- **Extension.js: no manifest mode split.** Prefixes are per browser only; mode `.env` files reach code, not the manifest ([environment-variables](https://extension.js.org/docs/features/environment-variables.md)). An Rspack `config` hook might do it (UNVERIFIED).
- **Bedframe: no.** Vite `mode` is already the browser name ([bedframe.ts](https://github.com/nyaggah/bedframe/blob/main/packages/core/src/lib/bedframe.ts)).
- **Zero-dep: trivial.** The flavour is an overlay the build script merges or skips.

## 7. Store packaging and submission

### WXT
- **Zips:** `wxt zip -b <browser>`. Firefox and Opera also get a **sources zip by default** (`sourcesRoot` defaults to the project root, `includeSources` `**/*`, `node_modules`/`.output`/dotfiles excluded) ([resolve-config.ts L297-332](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/resolve-config.ts#L297-L332), [publishing](https://wxt.dev/guide/essentials/publishing.html#firefox-addon-store)).
- **Sources zip gap:** with WXT in a nested `extension/`, the sources zip would miss `skills/coach-pokerogue/scripts/hud/` unless `sourcesRoot` is widened to the repo root.
- **Submit:** `wxt submit` uses `publish-browser-extension`, covering CWS, AMO (with sources), Edge and Opera, not Safari.

### Plasmo
`plasmo package` zips ([package.ts](https://github.com/PlasmoHQ/plasmo/blob/main/cli/plasmo/src/commands/package.ts)). No sources zip. `bpp` covers chrome, firefox (with `sourceZip`), edge and opera, and is frozen ([bpp](https://github.com/PlasmoHQ/bpp#readme)).

### Extension.js
`build --zip --zip-source`. `publish` only makes an extension.dev share link; there is no store upload ([build](https://extension.js.org/docs/commands/build.md), [publish](https://extension.js.org/docs/commands/publish.md)).

### CRXJS
No zip or submit in source (UNVERIFIED beyond code search).

### Bedframe
`zip` shells out to `zip -r`. `publish` wraps `chrome-webstore-upload-cli@3`, `web-ext sign` and the Edge API ([publish.ts](https://github.com/nyaggah/bedframe/blob/main/packages/cli/src/commands/publish.ts)).

### web-ext
- **`build`:** zip only, no sources zip ([command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)).
- **`sign`:** uses the AMO submission API by default since [8.0.0](https://github.com/mozilla/web-ext/releases/tag/8.0.0). Flags: `--channel listed|unlisted`, `--upload-source-code <archive>`, `--amo-metadata <json>`.
- **Lint rules:** the linter enforces `MISSING_DATA_COLLECTION_PERMISSIONS` and `NONE_DATA_COLLECTION_IS_EXCLUSIVE` ([manifestjson.js](https://github.com/mozilla/addons-linter/blob/master/src/messages/manifestjson.js)).
  - The second rule matters for [#110](https://github.com/IIxauII/pokerogue-mcp/issues/110), which plans `required: ["none"]` alongside an optional `websiteContent`.
  - Its description scopes it to `/browser_specific_settings/gecko/data_collection_permissions/required`: "none" must not sit with other **required** permissions. So the linter does not reject that combination. Whether AMO review accepts it is still undocumented.

### Chrome Web Store API
- **API v1 is supported only until 2026-10-15** ([CWS API v2](https://developer.chrome.com/blog/cws-api-v2)). Any CWS CLI must speak v2.
- **Clients already on v2:**
  - `publish-browser-extension` ≥5, which also supports service accounts ([config reference](https://github.com/aklinker1/publish-browser-extension/blob/main/docs/config-reference.md))
  - `chrome-webstore-upload` 6.x, which needs `publisherId` ([v6.0.0](https://github.com/fregante/chrome-webstore-upload/releases/tag/v6.0.0))
- **Requirements:** an OAuth client and refresh token, or a service account, plus 2-step verification ([using-api](https://developer.chrome.com/docs/webstore/using-api), [service-accounts](https://developer.chrome.com/docs/webstore/service-accounts)).

## 8. Minification and comment stripping

Policy background, from [#110](https://github.com/IIxauII/pokerogue-mcp/issues/110): CWS forbids obfuscation but allows "collapsing files together", and AMO requires source for generated or concatenated output ([source-code-submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)). [#134](https://github.com/IIxauII/pokerogue-mcp/issues/134) notes that stripping comments removes the 17 comment lines quoting PokéRogue code.

- **WXT:** sets no `minify` for production, so Vite's default applies; it only disables minify in dev ([vite/index.ts L61-64](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/core/builders/vite/index.ts#L61-L64), [Vite build options](https://vite.dev/config/build-options)).
  - Override with `vite: () => ({ build: { minify: false } })` ([vite config](https://wxt.dev/guide/essentials/config/vite.html)).
  - Default comment handling UNVERIFIED.
  - A HUD emitted through `build:publicAssets` bypasses Vite, so it is never minified. Comment stripping becomes our own code either way.
- **Plasmo:** SWC minify by default with `comments: "some"`, mangle and compress. `--no-minify` keeps comments ([parcel-optimizer-es](https://github.com/PlasmoHQ/plasmo/blob/main/core/parcel-optimizer-es/src/index.ts), [build docs](https://docs.plasmo.com/framework/workflows/build)).
- **CRXJS:** Vite `build.minify`. Whether the secondary IIFE build inherits it is UNVERIFIED.
- **Extension.js:** Rspack/SWC minify in production by default ([Rspack optimization](https://rspack.rs/config/optimization)). Overridable via the `config` hook.
- **Zero-dep:** no minification today. Stripping whole-line `//` comments from the HUD is a few lines. A general JS comment stripper that handles strings, regexes and templates is not; it would need a tokenizer (UNVERIFIED effort).

## 9. Install weight, and where the dependency can live

### Why it matters
Claude Code installs a plugin's dependencies in its cache with `npm ci --ignore-scripts` whenever the plugin root has `package.json` plus `package-lock.json`. The install has a **60-second timeout**, and an install that runs longer "is treated as failed" ([plugins reference](https://code.claude.com/docs/en/plugins-reference), section "Node.js package dependencies"). `npm ci` installs devDependencies unless `--omit=dev` or `NODE_ENV=production` ([npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci), [config: omit](https://docs.npmjs.com/cli/v11/using-npm/config)). **Root devDependencies reach every user.** The repo root lock currently resolves 97 packages.

### Measured
Measured 2026-09-16 on macOS arm64, npm 11.12.1 and Node 25.9.0. Each entry is a fresh `npm install --save-dev --ignore-scripts` in a scratch dir, counting lockfile packages and `du -sk node_modules`:

| Install | Packages | Size | Largest contributors |
|---|---|---|---|
| `wxt` (brings required peer `vite`) | 155 | 53 MB | rolldown binary 16 MB, lightningcss 8 MB |
| `wxt` + `web-ext` (needed for `wxt` dev browser launch) | 453 | 130 MB | |
| `plasmo` | 646 | **493 MB** | `@parcel/*` 214 MB, `@plasmohq/*` 85 MB, swc 25 MB |
| `@crxjs/vite-plugin` + `vite` | 70 | 51 MB | |
| `vite` alone | 40 | 29 MB | |
| `extension` | 359 | 133 MB | `@rspack` 46 MB, webpack 13 MB |
| `@bedframe/cli` | 436 | 243 MB | `@microsoft/api-extractor` 38 MB, TypeScript native 26 MB |
| `web-ext` | 329 | 81 MB | `@mdn/browser-compat-data` 19 MB, eslint |
| `publish-browser-extension` | 4 | 0.4 MB | |
| `chrome-webstore-upload-cli` | 6 | 0.7 MB | |

`npm view wxt peerDependenciesMeta` shows `web-ext`, `eslint` and `typescript` as optional, and `vite` as required.

### Workspaces vs nested package (tested in a scratch dir, same npm)
- **npm workspaces do NOT isolate.** A root with `"workspaces": ["extension"]`, where `extension/package.json` has a devDependency:
  - Root `npm ci --ignore-scripts` **installed that devDependency** into root `node_modules`.
  - Only `--omit=dev` skipped it, and Claude Code does not pass that.
  - This matches npm's docs: `workspaces` unset means install and ci link workspaces ([config: workspaces](https://docs.npmjs.com/cli/v11/using-npm/config#workspaces)). See also [npm/cli#6670](https://github.com/npm/cli/issues/6670).
- **A nested `extension/package.json` with its own `package-lock.json`, not a workspace, DOES isolate.**
  - Root `npm ci --ignore-scripts` installed only the root dependency.
  - `extension/node_modules` was not created, and the root lock never mentions the nested dependency.
  - npm: `package-lock.json` "will be ignored if found in any place other than the root project" ([package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)).
  - The nested source files still get copied into the plugin cache as plain files (not measured).
- **WXT and Extension.js accept a nested root.** WXT commands take `[root]` ([commands.ts](https://github.com/wxt-dev/wxt/blob/wxt-v0.21.4/packages/wxt/src/cli/commands.ts)); Extension.js takes `build [project-path]` ([build](https://extension.js.org/docs/commands/build.md)).
- **Node versions:** WXT needs Node >=22, Extension.js >=22.12 and web-ext >=20, all compatible with the repo's `>=23.6`.

## 10. Lock-in and fights with the constraints

### WXT
- Pre-1.0 with breaking minors (0.21.1: 13 breaking changes) and a single core maintainer.
- MV2 defaults on Firefox and Safari are a footgun for a 3-engine MV3 spec.
- `wxt` dev mutates the manifest (adds `tabs`/`scripting`, moves content scripts), so dev and store manifests diverge beyond our own flavour overlay.
- The HUD must bypass WXT's own content-script system (§4), so WXT contributes nothing to the one script that matters. It adds a mandatory `entrypoints/` layout, the `.wxt/` and `.output/` dirs, and a recommended `postinstall: wxt prepare` ([installation](https://wxt.dev/guide/installation.html)).
- Auto-imports can be disabled ([auto-imports](https://wxt.dev/guide/essentials/config/auto-imports.html#disabling-auto-imports)).

### Plasmo
- Abandoned, with a 2023 Parcel.
- Cannot emit a static MAIN-world script without adding `scripting`.
- Wraps bundles in a function; React- and Parcel-specific import schemes.

### CRXJS
- No Safari, no packaging, and an ESM-only major pending.
- HUD bypass unverified.

### Extension.js
- The inserted bridge content script likely ships in the store manifest.
- No manifest dev/prod split, so the dev flavour is hard.
- Telemetry is on by default.
- Bus factor 1.
- `chromium:` keys leak to Safari.
- Its own docs and source call MAIN "Chromium-only".

### Bedframe
Stale CRXJS 2.3.0 underneath; mode locked to the browser name.

### web-ext
- **Dev runner:** always spawns its own browser in automation-flavoured pipe mode. It sits beside the project's existing Chrome launcher rather than replacing it.
- **Weight:** 329 packages. Keep it nested or run it via `npx`.

## What zero-dep (+ optional web-ext) would have to hand-build

Rough effort, assuming one person who knows the repo.

| Piece | What it is | Effort |
|---|---|---|
| **Manifest overlay** | `extension/manifest.base.json` plus per-engine patches (Firefox: `browser_specific_settings.gecko` with `data_collection_permissions` and `background.scripts`; Chrome: `background.service_worker`; Safari: drop `nativeMessaging`) plus a dev-flavour patch (`scripting`, `activeTab`/`<all_urls>`, `http://127.0.0.1/*`, eval and screenshot files). A ~30-line deep merge with array union for `permissions`. | ~0.5 day |
| **Build script** | For each `{engine} × {store, dev}`: write `dist/<engine>-<flavour>/`, copy static files, write `bundle(mode)` output as the MAIN-world script, write the merged manifest. Physically omits dev files from store dirs. Reuses `bundle()` directly, so tests keep importing it. | ~0.5 day |
| **Zips** | Node has no zip writer. Options: shell out to `zip -r` (present on macOS), use `web-ext build` for Firefox and Chrome dirs, or a ~100-line stored/deflate writer on `node:zlib` (`deflateRawSync`, `crc32` since Node 22.2, UNVERIFIED version). | 1–4 h |
| **AMO sources zip** | `git archive --format=zip HEAD` plus a build-instructions file. The build is one Node command with no dependencies, which is the easiest possible AMO reviewer story. | 1–2 h |
| **Dev reload over loopback** | `fs.watch` on `hud/` and `extension/` rebuilds `dist/*-dev`. A tiny `node:http` endpoint on `127.0.0.1` serves a build counter by long-poll or streaming `fetch` (Node has no built-in WebSocket server). The dev-flavour background polls it, calls `runtime.reload()`, then re-injects the MAIN script into open pokerogue tabs with `scripting.executeScript({world: "MAIN"})` (dev flavour already has `scripting`). Loopback from the background page works on Safari 26.2 ([Safari research](https://github.com/IIxauII/pokerogue-mcp/blob/research/safari-main-world/docs/research/safari-main-world.md)); Chrome and Firefox dev loopback UNVERIFIED here. Alternative for Chrome and Firefox: `web-ext run --source-dir dist/<engine>-dev --watch-file …` via `npx`, accepting its own browser profile. | ~1 day hand-built; ~1 h with web-ext |
| **Lint** | `npx web-ext lint --source-dir dist/firefox-store` in CI; validates MAIN and `data_collection_permissions`. | ~1 h |
| **Store upload** | AMO: `npx web-ext sign --channel listed --upload-source-code …`. CWS: `npx publish-browser-extension` (4 packages) or `chrome-webstore-upload-cli` (v2 API); both can run in CI without entering any lockfile the plugin installs. | ~0.5 day incl. credentials |
| **Safari** | `xcrun safari-web-extension-packager dist/safari-store --project-location … --bundle-identifier … --macos-only --no-open --no-prompt`, then Developer ID signing and notarization, or the App Store Connect web packager. **Identical on every route.** | Not a differentiator |
| **Comment stripping** | Only if [#134](https://github.com/IIxauII/pokerogue-mcp/issues/134) decides to strip. Whole-line `//` comments are trivial; full JS comment removal needs a tokenizer. | 1 h to UNVERIFIED |

**Total:** roughly 2–3 days hand-built, or 1.5–2 days using `web-ext` and `publish-browser-extension` through `npx` or a nested lockfile.

**What WXT would give instead:** zips, the sources zip, submit and a Chrome/Firefox reload runner. It would not give MAIN-world HUD handling (bypassed), Safari (manual), or a clean dev manifest (`wxt build --mode` needed). Against that: 155–453 packages in a nested lockfile, pre-1.0 churn and MV2 defaults.
