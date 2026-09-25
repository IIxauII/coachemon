# Extension distribution

How the coach HUD and the agent transport ship as one public browser extension, **Coachemon**, on Chrome, Firefox, Safari and Orion, and how the MCP server moves off CDP and Apple Events onto it. Settled by [Map: HUD as a browser extension](https://github.com/IIxauII/coachemon/issues/98); written by [Write the distribution spec](https://github.com/IIxauII/coachemon/issues/111). The build tickets are cut from this document (§17).

Every claim here is a decision from a closed ticket on that map or a fact carried from one, linked by the ticket's name. A few details the tickets explicitly left to "the spec" are chosen here and marked **(picked here)**: port numbers, event names, envelope fields, status wording, secret names, job order and a handful of identifiers. They carry no evidence beyond fitting the decisions around them, and are the cheap part to change.

Facts are tagged the way [The v1 tool surface](v1-tool-surface.md) tags them:

- **[live]**: observed on a real browser against `pokerogue.net`, with the version named.
- **[doc]**: from a browser vendor's or store's own documentation, never exercised here.
- **[unverified]**: an accepted premise nobody measured. §16 lists every one; a build ticket that meets one checks it rather than assuming it.

Vocabulary is `CONTEXT.md`. *Hub*, *command*, *driver*, *card*, *verdict*, *settled*, *snapshot*, *menu*, *screen* and *progress fingerprint* are defined there. This document also says **target browser** (Chrome, Firefox, Safari, Orion) and **store** (Chrome Web Store, AMO, the Safari download), because Orion installs the Chrome and Firefox builds and so engine no longer lines up with store. Never call the local process a *host*: Apple's *host app* is the browser. Apple's own words are used as-is: **containing app**, **native app extension**, **packager**, **notarization**.

The repo, plugin and skill were renamed to `coachemon` outside this spec, in [Rename repo, plugin and skill to coachemon](https://github.com/IIxauII/coachemon/issues/138). Paths and names below are post-rename.

---

## 1. Principles

A build ticket that cannot satisfy one of these reopens the decision; it does not work around it.

1. **One extension, one build per store, one source.** The HUD runs for every player. The agent transport comes alive only when a hub answers on the loopback port. `skills/coachemon/scripts/hud/*.js` stays the single HUD source, bundled unchanged by `hud-bundle.mjs`.
2. **The store build contains no interpreter.** Everything that crosses into the page is a named **command** from one closed, shared table with typed arguments. No arbitrary JS, no fetched logic, no remote data table. Chrome bans "an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data" **[doc]** ([Store cost, review latency and policy exposure](https://github.com/IIxauII/coachemon/issues/102)).
3. **Logic that may change stays out of review.** The extension answers single reads and single acts in one page turn. Settling, stuck detection, auto-advance, cursor walks, label matching and `start_run` live in the MCP server, which ships with the plugin ([Command vocabulary between hub clients and the extension](https://github.com/IIxauII/coachemon/issues/188)).
4. **Nothing is written to the player's machine.** No setup command, no native-messaging manifest, no shim, no config file. Pairing is installing the extension and the plugin ([Pairing protocol: MCP server and extension](https://github.com/IIxauII/coachemon/issues/107)).
5. **Web pages are the threat.** The loopback listener defends against drive-by pages and DNS rebinding. Same-user local processes and other installed extensions are outside the model, because the vocabulary is closed and never carries typed form text.
6. **Never guess which save.** With more than one connected game tab, reads refuse as well as acts ([Migration off CDP and Apple Events](https://github.com/IIxauII/coachemon/issues/108)).
7. **Nothing reloads the player's tab.** A reload is destructive on the escape ladder, so no build executes one on its own.
8. **Zero telemetry, ever.** The extension's only network traffic is the loopback socket, and the HUD's import of `pokerogue.net`'s own chunks (§5.2).
9. **Artwork never ships.** No Pokémon or PokéRogue art in the icon, screenshots or bundle. Everything drawn comes from the live page ([Trademark exposure for a public listing](https://github.com/IIxauII/coachemon/issues/104)).

---

## 2. Targets and stores

Four target browsers, three stores. Every target carries the HUD **and** the transport on day one ([Orion after the AppleScript route retires](https://github.com/IIxauII/coachemon/issues/118), [What Safari without a transport costs](https://github.com/IIxauII/coachemon/issues/120)).

| Target | Installs from | Build | Floor | Background | Keepalive that holds it |
|---|---|---|---|---|---|
| **Chrome** | Chrome Web Store | `chrome-mv3` | 111 | `service_worker` | service worker sends a socket frame every 20 s **[live]** Chrome 153 |
| **Firefox** | AMO (listed) | `firefox-mv3` | 142 | `scripts` (event page) | content script messages the background every 20 s **[live]** Firefox 156 |
| **Safari** (macOS) | Developer ID-signed, notarized download from the GitHub Release | `safari-mv3` → packager | 18 | `scripts` | unmeasured **[unverified]** |
| **Orion** (macOS) | the CWS or AMO listing, player's choice | none of its own | Orion 1.1.2 tested | runs `service_worker` as a persistent page **[live]** | none needed **[live]** |

**Transport pass bar**, the same for every target: the hub delivers a command to an open `pokerogue.net` tab **within about 1 s after 5 or more minutes idle**, by whatever the extension does (held socket, keepalive, reconnect) ([What Safari without a transport costs](https://github.com/IIxauII/coachemon/issues/120)). The per-engine smoke checks in §16 use it as their acceptance line.

The floors are set by `content_scripts[].world: "MAIN"`: Chrome 111, Firefox 128, Safari 18 **[doc]** ([Page-world execution across Chrome, Firefox and Safari](https://github.com/IIxauII/coachemon/issues/99)). Firefox alone ships a floor above its own — 142, set by `data_collection_permissions` rather than by the page world (§5.3). Every build carries **both** keepalives plus reconnect-on-wake, since the combination is untested and Safari's is unmeasured (§8.2).

### 2.1 Where the targets differ, and what each difference costs

- **Page world.** `world: "MAIN"` works on Chrome, Firefox 128+, Safari 26.2 **[live]** and Orion 1.1.2 **[live]**. Firefox 102–127 silently runs such a script isolated; the manifest floor, higher still at 142, makes those versions uninstallable (§9.4). `browser` is defined in Safari's MAIN world and undefined in Orion's **[live]**, so nothing detects the world by `browser`.
- **`pokerogue.net` serves no CSP** of any kind **[live]** 2026-09-16. If it ever ships one, Chrome applies it to MAIN-world code and Firefox does not **[doc]**. Nothing watches for that (out of scope, §18).
- **Site access.** Safari runs nothing until the player grants access in Safari › Settings › Extensions; no prompt appears, and the grant injects into an already open tab without a reload **[live]** Safari 26.2. Chrome and Orion do **not** inject into tabs open at install; the player reloads **[live]** Orion.
- **Loopback.** Chrome and Firefox pass the transport bar with no `127.0.0.1` host permission and no Local Network Access prompt **[live]** Chrome 153, Firefox 156. Orion passes **[live]**, but only unsigned sideloads were tested, and only with `http://127.0.0.1/*` declared; the store builds declare none **[unverified]** on Orion. Safari's background page reached `127.0.0.1` over `fetch` and WebSocket on an unsigned temporary build **[live]** Safari 26.2; a signed build is **[unverified]** and ships anyway, with no HUD-only fallback.
- **Firefox's default MV3 CSP breaks `ws://127.0.0.1`** (close code 1015) **[live]**. The Firefox build overrides `extension_pages` (§5.3).
- **Hidden tabs freeze the game loop.** On Chrome a background tab, a minimised window and a window covered by another app all stop `requestAnimationFrame` **[live]** Chrome 153. The driver's settles pump the loop (§10.3). Firefox, Safari and Orion are unmeasured.
- **Origins are not stable.** Firefox's `moz-extension://` UUID is per install; Safari's `safari-web-extension://` UUID changes on re-add; Orion's AMO build flipped from `moz-extension://` to `chrome-extension://` across a restart **[live]**. Nothing pins an extension id or scheme (§7.4).
- **Safari packaging.** No framework packages Safari. The build stops at the `safari-mv3` folder, and the dev runs the packager, signs and notarizes by hand (§14.6).

---

## 3. Listing identity

From [Name and listing identity](https://github.com/IIxauII/coachemon/issues/105), with Apple's App Store removed by [Ask Pagefault Games for written permission](https://github.com/IIxauII/coachemon/issues/123).

| Element | Decision |
|---|---|
| Name | **Coachemon**, slug `coachemon`, identical on CWS, AMO, the Safari app and the extension manifest. There is no reserve title: "Rogue Coach" existed only for App Review, which is out of scope. No trademark is filed. |
| Icon | An original mark: **a capped coachemon face** — a grinning face under a coach's cap, authored as a 16×16 pixel grid and drawn up from that grid for every larger size. It is nobody's creature: no ball, no red/white split circle, no borrowed silhouette, nothing from PokéRogue's logo or favicon. Sizes 16, 32, 48, 128 (store tile 128; Safari app icon set generated from the 1024 master). |
| Screenshots | **Clean fixture renders only**: the HUD drawn from a fixture snapshot, sprite fallbacks as text, on the game's own letterbox colour — the colour the panel really does sit on off 16:9, and the one the panel's gold rule keeps its 5.33:1 against ([#349 §12](https://github.com/IIxauII/coachemon/issues/349)). No game canvas, no franchise art, no real captures. |
| Typeface in a shot | **A shot may render the game's own two faces**, declared from the pinned clone, because a shot must show the panel as it draws and the panel wears the game's own type rule. The font files are rendered into the page and **never committed or redistributed**; nothing else of the game's is admitted (#349 §12). |
| Promo tiles | **The mark set in type**: the icon beside the wordmark and a tagline, on the mark's own field. The screenshots are what show the panel; a tile is the branding surface next to them. Same rule as the title — the tagline never names the game. |
| Game in copy | "PokéRogue" named plainly in the description body as the site the extension works on. Never in the title or keywords. "Pokémon" appears only in the disclaimer. |
| Orion | Named in the CWS and AMO description bodies only. |
| Positioning | HUD first. One closing paragraph says it can also connect a local AI agent over MCP, naming Claude nominatively with no implied endorsement. |
| Disclaimer | Fixed, on every listing and inside the extension: *"Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company."* The extension has no About page, so the manifest `description` — shown on every browser's extension page — is the **single carrier** inside the extension **(picked here)**. The panel drew it as a dim footer line until [The disclaimer leaves the panel](https://github.com/IIxauII/coachemon/issues/362): the footer hung off the full view, and retiring that view for the strip and drawer orphaned it, so it was deleted from the HUD source rather than rehoused. The panel draws no disclaimer. |
| Publisher | `IIxauII` on CWS and AMO. The Safari download is signed with the dev's individual Developer ID; it has no product page. |
| Language | English only. |
| Support | Email only, the listing's contact address. The repo is public but not a support surface. |
| Homepage | Manifest `homepage_url` is the repo (`https://github.com/IIxauII/coachemon`). |
| Privacy policy | `PRIVACY.md` at the repo root, published by GitHub Pages from `master` / root. Its URL (`https://iixauii.github.io/coachemon/PRIVACY`) goes into the CWS and AMO listings. |

### 3.1 Description skeleton (picked here)

Wording is free; the order and the fixed lines are not.

1. One sentence: a coach overlay for PokéRogue that reads the game you are playing and shows what to do this turn.
2. What the cards cover: battles, learning a move, rewards, biome choice, Mystery Encounters, the next big fight.
3. Where it runs: pokerogue.net, in Chrome, Firefox or Orion (CWS and AMO bodies), and nowhere else.
4. Privacy: nothing leaves your computer; no account, no tracking.
5. Closing paragraph: *it can also connect a local AI agent, such as Claude, over MCP, so the agent can follow or play the same game; this needs the Coachemon plugin on the same computer.*
6. Source: AGPL-3.0-only, with the source for each version at the matching `extension-v*` tag of the repo.
7. The disclaimer line.

---

## 4. Architecture

```
 Claude Code session            Claude Code session (coach)
 ┌──────────────────┐           ┌──────────────────┐  ┌───────────────┐
 │ MCP server       │           │ MCP server       │  │ watch CLI     │
 │ (plugin, stdio)  │           │ (read-only tools)│  │ (Monitor)     │
 └────────┬─────────┘           └────────┬─────────┘  └──────┬────────┘
          │ ws, no Origin                │                   │
          └──────────────┬───────────────┴───────────────────┘
                         ▼
               ┌───────────────────┐   one per machine, detached,
               │ hub               │   127.0.0.1:47147 (dev 47148)
               │ (plugin src/hub/) │   routes commands, holds the driver
               └─────────┬─────────┘   grant, counts tabs, fans out events
                         │ ws, Origin: <browser>-extension://…
        ┌────────────────┼──────────────────┬───────────────────┐
        ▼                ▼                  ▼                   ▼
   Chrome ext.      Firefox ext.       Safari ext.        Orion (CWS or
   background       background         background         AMO build)
        │ runtime messaging (tabs.sendMessage / runtime.sendMessage)
        ▼
   relay.js (ISOLATED world, document_start), one per pokerogue.net tab
        │ synchronous CustomEvent on document, JSON-string detail
        ▼
   page.js (MAIN)  ─ command handlers        hud.js (MAIN) ─ the HUD,
                                               pushes card events
```

- **The hub** is a thin router shipped in the plugin (§7).
- **The extension background** owns the one WebSocket to the hub per browser, and forwards commands to tabs (§8).
- **`relay.js`** is the isolated-world content script. It is the only part that talks to both the background and the page (§9).
- **`page.js`** holds the command handlers, built from `src/page/*.ts`. **`hud.js`** is `bundle("hud")`, untouched.

---

## 5. The extension package

From [Build pipeline for three engines](https://github.com/IIxauII/coachemon/issues/106), amended by the pairing, vocabulary and relay tickets.

### 5.1 Layout

```
extension/                       nested package, own lockfile, NOT an npm workspace
  package.json                   name "coachemon-extension", version "0.0.0-placeholder", private
  package-lock.json
  wxt.config.ts                  per-browser manifest function, build hooks
  tsconfig.json
  entrypoints/
    background.ts                transport (§8)
    relay.ts                     unlisted script → relay.js; the ISOLATED content script (§9)
    page.ts                      unlisted script → page.js; imports ../../src/page/*
  src/
    messages.ts                  runtime messaging between a relay and the background (§8.3)
    build-env.d.ts               the compile-time constants wxt.config.ts defines (§5.2)
    transport/                   hub socket, keepalive, backoff, consent
    relay/                       the channel and the relay contract (§9)
    page/                        the MAIN-world half: handler registration and the reply channel (§10.5)
    build/                       manifests and hud.js, imported by wxt.config.ts (§5.2, §5.3)
    dev/                         dev dispatch table and reload client (dev mode only)
  public/icons/                  16, 32, 48, 128
  test/
    guard.test.ts                store-artifact guard (§5.5)
    relay.test.ts                relay unit tests against a fake document
src/protocol/                    shared by hub, server and extension
  commands.ts                    the store command table (§10.1)
  wire.ts                        hub frame types (§7.6)
  version.ts                     PROTOCOL, PRODUCT, STORE_PORT, DEV_PORT
src/page/                        command handlers as real functions (§10.5)
```

- **Not a workspace.** Claude Code installs the plugin with `npm ci --ignore-scripts`; a workspace would pull WXT (about 155 packages, 53 MB) into every player's cache and a nested lockfile does not **[live]**.
- **Shared code lives under the repo's `src/`**, imported by relative path from `extension/`. It is plain TypeScript with no dependencies, so the server and hub use it with Node's type stripping and the extension build bundles it.
- Glue is TypeScript; the HUD stays plain JS.

### 5.2 Build

- **WXT**, per-browser via `wxt build -b chrome|firefox|safari --mode store|dev`. MV3 is forced for Firefox and Safari (WXT defaults both to MV2).
- **The HUD bypasses WXT's bundler.** A `build:publicAssets` hook (or equivalent WXT hook) calls `bundle("hud")` from `skills/coachemon/scripts/hud-bundle.mjs`, strips comments, wraps it in the world check and build id (§9.4, §9.6), and writes `hud.js` into the output. The manifest lists it by hand. The HUD tests keep exercising the raw `bundle()`.
- **Comments are stripped from `hud.js` in every build**, dev and store. This removes the 17 comment lines that quote PokéRogue code.
- **`hud.js` calls `import()` nowhere.** The Firefox add-on linter warns on an `import()` argument it cannot see is a literal, and the HUD's chunk scan is the one place that reaches the game's own modules ([hud.js: unsafe call to import()](https://github.com/IIxauII/coachemon/issues/381)). The scan injects one `<script type="module">` per chunk whose own source imports that one URL as a string literal instead. The guard checks the built file for the call, and `src/hud-bundle.test.ts` checks the bundle.
- **`page.js` and `relay.js`** are WXT unlisted scripts, listed by hand in the manifest next to `hud.js`. A WXT
  content script would emit to `content-scripts/relay.js` and generate a `content_scripts` entry of its own; as
  unlisted scripts both land at the output root and every content script is declared in one place, exactly as §5.3
  spells them out ([The extension package](https://github.com/IIxauII/coachemon/issues/203)).
- **Build id.** Every script gets `COACHEMON_BUILD = "<version>+<first 12 hex of sha256 over hud.js and page.js before stamping>"` (picked here), injected by define.
- **`LICENSE` and `THIRD_PARTY_NOTICES.md`** from the repo root are copied into every output folder (§15).
- **Outputs** use WXT's defaults, `extension/.output/<browser>-mv3-<mode>/` (`-store` or `-dev`), gitignored. `wxt zip` makes per-browser store zips and the Firefox sources zip.
- **The build stays offline.** `hud/05-randbats.js` is bundled as committed, so AMO's reviewer build reproduces.
- **`wxt dev` is not used**: it force-adds `tabs` and `scripting`, runs a throwaway profile, does not watch `hud/`, and covers neither Safari nor Orion.

### 5.3 Manifests

Generated by `wxt.config.ts`. Values are exact; WXT may reorder keys.

**Common to every target (store flavour):**

```jsonc
{
  "manifest_version": 3,
  "name": "Coachemon",
  "version": "<X.Y.Z from extension/package.json, stamped by CI>",
  "description": "Unofficial coach overlay for PokéRogue. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.",
  "homepage_url": "https://github.com/IIxauII/coachemon",
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" },
  "content_scripts": [
    { "matches": ["https://pokerogue.net/*"], "js": ["relay.js"], "run_at": "document_start", "world": "ISOLATED" },
    { "matches": ["https://pokerogue.net/*"], "js": ["page.js", "hud.js"], "run_at": "document_idle", "world": "MAIN" }
  ]
}
```

No `permissions`, `optional_permissions`, `host_permissions` or `optional_host_permissions` on any target. The static match grants site access by itself.

**Chrome** adds:

```jsonc
{ "minimum_chrome_version": "111", "background": { "service_worker": "background.js" } }
```

**Firefox** adds:

```jsonc
{
  "background": { "scripts": ["background.js"] },
  "action": { "default_title": "Coachemon: click once to let a local AI agent read this game" },
  "content_security_policy": { "extension_pages": "script-src 'self'" },
  "browser_specific_settings": {
    "gecko": {
      "id": "coachemon@iixauii.github.io",
      "strict_min_version": "142.0",
      "data_collection_permissions": { "required": ["none"], "optional": ["websiteContent"] }
    }
  }
}
```

- The gecko id is picked here and is permanent once AMO has seen it.
- **The floor is 142, not the 128 the page world would need.** `data_collection_permissions` is mandatory on AMO — since 2025-11-03 for new extensions, and for every extension through the first half of 2026 **[doc]** — and the key was understood by Firefox 140 and Firefox for Android 142. The linter warns once per target whose floor predates the key, and with no `gecko_android` key it checks Android against this same floor, so 128 drew both warnings — desktop and Android ([#380](https://github.com/IIxauII/coachemon/issues/380)). 142 clears both. It is above the 140 the desktop warning asked for, because Android is the binding one and a single floor serves both: addons-linter on the built store artifact drops from three warnings to one **[live]**, the survivor being §6's declared `import()`.
- **No `gecko_android` key, deliberately.** Omitting it is what marks the add-on desktop-only **[doc]**; declaring it would also have silenced the Android warning, by offering Coachemon on Firefox for Android, where nothing can reach a hub on `127.0.0.1`. The cost of the floor is Firefox 128–141, ESR 140 included.
- The CSP override drops the default `upgrade-insecure-requests`, which turns `ws://127.0.0.1` into a failing TLS handshake **[live]**. If AMO rejects the override, the Firefox build alone switches its hub connection to `fetch` long-poll (§8.1); that fallback is named, not built.
- If AMO rejects `required: ["none"]` next to an optional list, the fallback is `required: ["websiteContent"]` and no consent click (§8.4).

**Safari** adds:

```jsonc
{
  "background": { "scripts": ["background.js"], "persistent": false },
  "browser_specific_settings": { "safari": { "strict_min_version": "18.0" } }
}
```

No host permission for `127.0.0.1` on Safari either; a signed build needing one is part of the accepted risk (§16). Whether Safari enforces `strict_min_version` is **[unverified]**; the Safari 18 floor is also stated with the download.

Chrome needs no `key`: nothing pins the extension id.

### 5.4 Flavours

`--mode dev` adds, on top of store:

| Addition | Why |
|---|---|
| `permissions: ["scripting", "activeTab"]`, `host_permissions: ["<all_urls>"]` | `screenshot` (`tabs.captureVisibleTab`) and re-injection into open tabs |
| the dev dispatch table: `eval`, `screenshot`, `reload` (§10.6) | `scripts/eval.ts`, the transcript screenshot, the dev loop |
| hub port **47148** instead of 47147 | a dev build next to a store install never double-counts a tab |
| the reload client | the dev loop below |

**Dev loop.** A watcher (`extension/scripts/dev.ts`, picked here) over `skills/coachemon/scripts/hud/`, `src/page/`, `src/protocol/` and `extension/` reruns the dev build per target, then sends a `dev-reload` frame through the dev hub. The dev background calls `runtime.reload()` and, after restarting, re-injects `page.js` and `hud.js` into open `pokerogue.net` tabs with `scripting.executeScript`; both scripts replace an older copy in place (§9.6), so a run keeps its place. Where an engine cannot, the dev reloads by hand. Whether Firefox, Safari and Orion honour this is unmeasured.

### 5.5 The store-artifact guard

`extension/test/guard.test.ts` runs after every build in CI and fails the job on any of:

1. A store manifest with any key from `permissions`, `optional_permissions`, `host_permissions`, `optional_host_permissions`, or containing `nativeMessaging`, `scripting`, `tabs`, `storage`, `activeTab` or `<all_urls>` anywhere.
2. A store artifact's files containing `47148`, `eval(`, `new Function(`, `screenshot`, `captureVisibleTab`, `executeScript`, `runtime.reload` or `dev-reload`; or **not** containing `ws://127.0.0.1:47147`. (The HUD contains none of these today.)
3. A dev artifact containing `47147`.
4. **Dispatch keys.** The guard loads the built `page.js` in a `node:vm` context with a fake `document`, dispatches a relay hello, and reads the command list from the page's hello (§9.3). For a store artifact that list must **equal** `STORE_COMMANDS` from `src/protocol/commands.ts`, and contain none of the dev names.
5. `LICENSE` or `THIRD_PARTY_NOTICES.md` missing from any artifact.

The string checks are a backstop; check 4 is the real one. If a vendored library trips a string check, the build ticket narrows that check to our own entry chunks; it never drops it.

### 5.6 CI

A `extension` job in a new `.github/workflows/extension.yml` (picked here) on every push and pull request: `npm ci --ignore-scripts` at the root, `npm ci` in `extension/`, `wxt build` for three browsers × two modes, the guard, `relay.test.ts`. No uploads; releases are §14.

### 5.7 AMO sources zip

`wxt zip -b firefox` also produces the sources zip. `sourcesRoot` is the repo root, limited to:

`extension/` (without `.output/` and `node_modules/`), `src/protocol/`, `src/page/`, `src/enums/generated.ts`, `scripts/release/artifacts.ts`, `skills/coachemon/scripts/hud-bundle.mjs`, `skills/coachemon/scripts/hud/`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, and a `SOURCES.md` for the reviewer:

```
Requires Node >= 23.6 (TypeScript type stripping) and npm.
cd extension && npm ci && npx wxt build -b firefox --mode store
Output: extension/.output/firefox-mv3-store/
```

`hud-bundle.mjs` imports `src/enums/generated.ts`, and `wxt.config.ts` imports `scripts/release/artifacts.ts` for the artifact names, which is why those two are included: without either, the reviewer's own build cannot even load the config. CI stamps `extension/package.json` before zipping (§14.2), so the sources zip already carries the real version.

---

## 6. Permissions and privacy disclosure

From [Permission set and privacy disclosure](https://github.com/IIxauII/coachemon/issues/110), as amended by the pairing ticket.

**The permission set is the static content-script match on `https://pokerogue.net/*` and nothing else, on every target.** Optional `nativeMessaging` is dropped everywhere, no loopback host permission is declared anywhere, and there is no `scripting`, `tabs` or `storage`. The HUD's view preference stays in the page's own `localStorage["coach-hud-panel"]`. Not `*.pokerogue.net`: the beta site was never reviewed against.

**What the transport never carries:** typed form text. The `menu` command does not return modal input values (today's `extra.inputs` on login, register and change-password is removed). `screenshot` and `eval` exist only in dev builds.

**Single purpose:** a coaching overlay for PokéRogue. The agent link is an optional way for the player's own AI assistant to use the same coach.

**Disclosure covers the extension and its hop to the local program, not what that program does next.**

| Store | What to file |
|---|---|
| **Chrome Web Store** | Single purpose as above. Host access justification: "Runs the coach overlay on pokerogue.net and nowhere else." **Remote code: Yes**, justification: "The overlay loads pokerogue.net's own JavaScript modules, from pokerogue.net, inside pokerogue.net's page, to read the game's tables. No code is loaded from anywhere else." Data usage: website content, processed on the device and optionally passed to a program on the same computer; not sold, not transferred, not used for anything but the single purpose. Privacy policy URL. |
| **AMO** | Licence: *GNU Affero General Public License v3.0 only*. The manifest's `data_collection_permissions` (§5.3). Source-code submission with the sources zip (§5.7). Privacy policy URL. |
| **Safari (Developer ID)** | No store disclosure exists. `PRIVACY.md` is linked from the GitHub Release notes. |

**`PRIVACY.md` says** (picked here, plain words): Coachemon reads the PokéRogue game in your tab to draw the coach. Nothing is sent to any server. If you run the Coachemon plugin for Claude Code on the same computer, the extension passes game state and coach text to that program over a local connection (`127.0.0.1`), and only while a pokerogue.net tab is open; on Firefox only after you click the Coachemon icon once. What that program does with it is governed by that program. No analytics, no accounts, no cookies of our own. Contact: the listing email.

---

## 7. The hub

From [Pairing protocol: MCP server and extension](https://github.com/IIxauII/coachemon/issues/107) and [Command vocabulary between hub clients and the extension](https://github.com/IIxauII/coachemon/issues/188).

### 7.1 Process

- **One detached local process per machine** owns the `127.0.0.1` listener. Every MCP server and every watch CLI is its client; every browser's extension connects to it.
- **Source:** `src/hub/` in the plugin, entry `src/hub/main.ts`, run by the same `node` as the server. It updates with the plugin. No installer on any OS.
- **Dependency:** `ws` (^8) becomes a runtime dependency of the plugin, for the hub's server and for Node clients (picked here). Node clients use `ws` rather than the global `WebSocket` so that they send **no `Origin` header**.
- **A thin router.** It routes commands between one client and one tab, counts tabs across every browser, holds the driver grant, and fans out events. It knows nothing about the game and caches nothing.

### 7.2 Lifecycle

1. A client (server or watch CLI) connects to `ws://127.0.0.1:<port>/`.
2. **Connection refused** → it spawns `node <its own plugin root>/src/hub/main.ts --port <port>` with `detached: true` (own process group), `stdio: ["ignore", "ignore", "pipe"]`, and retries the connection every 100 ms for up to 3 s, reading the child's stderr meanwhile. Once connected, or once the child exits, it destroys the pipe and `unref()`s the child. Nothing is written to disk.
3. Two clients spawning at once is harmless: the second hub gets `EADDRINUSE` and exits 0 silently.
4. **Connected but no valid `welcome` within 1 s** (§7.6) → a foreign process holds the port: status rung 1.
5. **Child exited with a non-zero code and no hub answers** → status rung 2, with the first stderr line.
6. **Idle exit:** the hub exits after **10 minutes** with no clients **and** no counted tabs. Open extension connections without a counted tab do not keep it alive; those extensions redial on their next keepalive tick.

The store hub listens on **47147**, the dev hub on **47148** (picked here; both in IANA's unassigned 47101–47556 block, and below macOS's ephemeral range). Both are hardcoded, with no override, because the extension cannot read configuration. Which port a server uses: 47147, or 47148 when run from a checkout with `COACHEMON_DEV=1` (picked here), which is how `scripts/eval.ts`, `smoke.ts` and `autoplay.ts` reach a dev build.

### 7.3 Version skew between plugin copies

Every client and the hub compare **plugin versions** (`package.json` `version`) in the handshake.

| Case | Behaviour |
|---|---|
| equal | proceed |
| client newer than hub, **no driver holds the grant** | the client sends `retire`; the hub closes every connection and exits; the client spawns its own hub (§7.2) |
| client newer than hub, a driver holds the grant | the client refuses every tool call with *"Another session is driving on an older Coachemon hub. Finish or close that session, then retry."* |
| hub newer than client | the client refuses every tool call with *"This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session."* |

### 7.4 Authentication

Checked on the HTTP upgrade request, before any frame:

1. `Host` must equal `127.0.0.1:<port>` exactly, or the upgrade gets 403. This defeats DNS rebinding.
2. `Origin` absent → a **local client**.
3. `Origin` with scheme `chrome-extension:`, `moz-extension:` or `safari-web-extension:` → a **browser**. The id is **not** checked.
4. Any other `Origin` → 403.

The listener binds `127.0.0.1` only. Then **hellos both ways** (§7.6): the hub proves itself with the product marker, so a squatter on the port gets nothing from the extension.

### 7.5 Driver grant, tabs, events

- **Grant.** Held per client connection. Taken by a `claim` frame, which a server sends when an acting tool call starts (`press`, `select_option`, `start_run`), or implicitly by the first `act` command from that client. Released when that socket closes. A second client's claim or act while the grant is held → `contended`. Reads never need the grant. The pidfile lock (`src/cdp/lock.ts`, `driver.lock`) is deleted.
- **Pump gate.** `probe` with `pump: true` counts as an act for gating but never claims: from a client that does not hold the grant it refuses `not-driver`.
- **Tabs.** A tab is keyed by extension connection id + the browser's tab id. It counts once its relay has announced the page handlers ready (§9.3) and the extension has consent (§8.4). Tabs are counted across every connected browser.
- **Routing.** A command from a client goes to the one counted tab. Zero tabs → `no-tab` at once; more than one → `tabs` at once, with the tab list. The hub queues nothing.
- **Events.** `card` and `coach-error` events from a tab fan out to every subscribed client. With more than one tab, the hub forwards no events and sends each subscriber one `notice` of kind `tabs`; when the count returns to one it sends a `notice` of kind `resume`.

### 7.6 Wire frames

All frames are JSON text messages. Types live in `src/protocol/wire.ts`. `PRODUCT = "coachemon-hub"`. Field names are picked here.

**Browser ↔ hub**

| Direction | Frame |
|---|---|
| ext → hub | `{"t":"hello","protocol":1,"version":"1.2.0","target":"chrome"\|"firefox"\|"safari","flavour":"store"\|"dev","build":"<build id>","consent":true,"commands":["probe","menu",…]}` |
| hub → ext | `{"t":"welcome","product":"coachemon-hub","protocol":1,"version":"<plugin version>"}` |
| ext → hub | `{"t":"tab","tab":123,"state":"ready"\|"gone"\|"wrong-world","title":"PokéRogue"}` |
| ext → hub | `{"t":"consent","consent":true}` |
| ext → hub | `{"t":"ping"}` (keepalive; the hub ignores it) |
| hub → ext | `{"t":"cmd","id":17,"tab":123,"name":"probe","args":{"pump":true}}` |
| ext → hub | `{"t":"reply","id":17,"ok":true,"result":{…}}` or `{"t":"reply","id":17,"ok":false,"code":"no-handler"\|"threw"\|"too-large"\|"wrong-world"\|"tab-gone","message":"…"}` |
| ext → hub | `{"t":"event","tab":123,"kind":"card"\|"coach-error","body":{…}}` |

**Client ↔ hub**

| Direction | Frame |
|---|---|
| client → hub | `{"t":"hello","role":"server"\|"watch","version":"<plugin version>","pid":4242}` |
| hub → client | `{"t":"welcome","product":"coachemon-hub","protocol":1,"version":"<plugin version>"}` |
| client → hub | `{"t":"retire"}` (§7.3) |
| client → hub | `{"t":"claim"}` → `{"t":"claimed","ok":true}` or `{"t":"claimed","ok":false,"code":"contended"}` |
| client → hub | `{"t":"state"}` → `{"t":"state","extensions":[{"conn":1,"target":"firefox","version":"1.2.0","flavour":"store","protocol":1,"consent":false,"commands":["probe",…]}],"tabs":[{"conn":1,"tab":123,"target":"firefox","title":"PokéRogue","state":"ready"}],"driver":"you"\|"other"\|null}` |
| client → hub | `{"t":"cmd","id":5,"name":"press","args":{…}}` |
| hub → client | `{"t":"reply","id":5,"ok":true,"result":{…}}` or `{"t":"reply","id":5,"ok":false,"code":"<hub or relay code>","message":"…","tabs":[…]}` |
| client → hub | `{"t":"subscribe"}` |
| hub → client | `{"t":"event","kind":"card"\|"coach-error","body":{…}}`, `{"t":"notice","kind":"tabs"\|"resume","tabs":[…]}` |

**Hub-level refusal codes:** `no-tab`, `tabs`, `unknown-command` (not in the shared table), `missing-command` (in the table but not in that extension's hello), `protocol` (extension outside the window, §8.5), `contended`, `not-driver`, `timeout` (no reply from the extension within **5 s**, picked here). Relay-level codes pass through unchanged (§9.7).

---

## 8. Extension transport

### 8.1 Dialing

- **The extension dials only while a `pokerogue.net` tab is present**: when a relay announces a ready tab, then on each 20 s keepalive tick while disconnected, and on every background start (reconnect-on-wake). No game tab, no loopback traffic.
- **URL:** `ws://127.0.0.1:47147/` (store) or `ws://127.0.0.1:47148/` (dev). WebSocket on all four targets.
- **On open:** send `hello`, then one `tab` frame per ready tab the background knows of.
- **Welcome check:** no `welcome` with `product: "coachemon-hub"` within 2 s, or a wrong product → close, and back off **10 minutes** before dialing again (picked here).
- **Close or error:** retry after 1 s, 2 s, 5 s, then every 20 s while a tab is present.
- **Firefox fallback, only if AMO rejects the CSP override:** the same frames over `fetch` long-poll to `http://127.0.0.1:47147/poll` and `POST /send`. The hub then answers `OPTIONS` and sends `access-control-allow-origin` only for extension-scheme origins. Not built unless needed.

### 8.2 Keepalives, in every build

1. **Background → hub:** while connected, send `{"t":"ping"}` every 20 s. This is what holds Chrome's service worker **[live]**.
2. **Relay → background:** every 20 s, each relay sends `runtime.sendMessage({t:"keepalive", tab ready state})`. This is what holds Firefox's event page **[live]**. On Chrome in a hidden tab the relay's timer is clamped to once a minute **[live]**, so it cannot be the Chrome keepalive; it is harmless there.
3. **Reconnect-on-wake:** the background re-learns tabs from keepalive messages after any restart and dials again (§8.1). This is Safari's only assumed mechanism.

### 8.3 Forwarding

- Background → tab: `tabs.sendMessage(tab, {t:"cmd", id, name, args})`, with no `tabs` permission.
- Tab → background: the relay's `sendResponse` carries the reply; events arrive as `runtime.sendMessage({t:"event", kind, body})`, and `sender.tab.id` keys them.
- The background never inspects results. It enforces the 1 MB cap a second time on the frame it sends.

### 8.4 Firefox consent

- The Firefox build connects and sends `hello` with `consent: false`, then **no `tab` frames, no replies and no events** until the player consents. Status rung 5 names the click.
- **Every Firefox that can install this build** has built-in data consent, since the floor is 142 (§5.3): `action.onClicked` → `permissions.request({ data_collection: ["websiteContent"] })`. Consent is `permissions.contains` on the same. Nothing is detected first and nothing is stored.
- Firefox 128–139 had no built-in data consent, and carried a custom consent experience instead **[doc]** — the same click, recorded in the extension origin's own `localStorage`. The 142 floor retired those versions, and that path went with them ([#380](https://github.com/IIxauII/coachemon/issues/380)).
- **The action's title says what the click allows** (§5.3's `default_title`), and a test pins its wording. Firefox draws its own permission prompt, but the title is the only thing the player reads *before* deciding to click at all, so it names the agent link rather than the extension.
- Consent granted → the background sends `{"t":"consent","consent":true}` and the tabs.
- Chrome, Safari and Orion have no consent step and always send `consent: true`. The Firefox build tells Firefox from Orion by `runtime.getBrowserInfo()`: only `name: "Firefox"` takes the consent path above; anything else, Orion running the AMO build included, counts as consented **[unverified]** (Orion's answer to `getBrowserInfo` was never observed).
- If AMO forces `required: ["websiteContent"]` (§5.3), consent is implied by install and the click goes away.

### 8.5 Protocol window

- `PROTOCOL` is an integer in `src/protocol/version.ts`, starting at **1**, baked into the extension at build time.
- The hub accepts an extension whose `protocol` is `PROTOCOL` or `PROTOCOL - 1`. The server keeps the previous protocol's command shapes working until the next bump, which covers Chrome review lag.
- Extension older than the window → its commands refuse `protocol`; status: update the extension. Newer than the plugin → status: update the plugin.
- **What bumps it** (§10.7): removing a command, or changing what an existing command's arguments or result mean. Adding a command, an optional argument or a result field does not.
- **A tool that needs a command the connected extension did not list** refuses alone, with the rung 4 "update the extension" wording; every other tool keeps working.

---

## 9. Relay contract

From [MAIN↔isolated relay contract](https://github.com/IIxauII/coachemon/issues/193). Names and fields picked here.

### 9.1 Channel

- `document.dispatchEvent(new CustomEvent("coachemon:<kind>", { detail: "<JSON string>" }))`, both directions. The detail is always a string, so Firefox Xray wrappers and `cloneInto` never come up.
- Every envelope carries `build`, the sender's build id.

| Event | Sent by | Detail |
|---|---|---|
| `coachemon:hello` | relay, page | `{"build":"…","side":"relay"\|"page","commands":[…]}` (`commands` from the page only; the guard reads it, §5.5) |
| `coachemon:cmd` | relay | `{"build":"…","id":42,"name":"probe","args":{…}}` |
| `coachemon:reply` | page | `{"build":"…","id":42,"ok":true,"result":{…}}` or `{"build":"…","id":42,"ok":false,"code":"threw","message":"…"}` |
| `coachemon:card` | hud | `{"build":"…","kind":"battle","key":"…","wave":12,"verdict":"danger","text":"…"}` |
| `coachemon:coach-error` | hud | `{"build":"…","message":"…"}` |
| `coachemon:wrong-world` | page, hud | `{"build":"…","side":"page"\|"hud"}` |

### 9.2 Replies are synchronous

The relay records `id` as pending and dispatches `coachemon:cmd`. The page handler runs inside that dispatch and dispatches `coachemon:reply` before returning. **If no reply for `id` has arrived when `dispatchEvent` returns, the relay answers `no-handler` at once**, with no timer.

Synchronous cross-world dispatch is established in principle only **[unverified]** off Chrome. The build's smoke run checks it per engine (§16). The named fallback, for an engine that dispatches asynchronously: that engine's relay waits for the reply with a **1 s** timeout on the same channel, answering `no-handler` on expiry. The hub contract does not change.

### 9.3 Readiness: double announce

- Relay and page each dispatch `coachemon:hello` on load, and answer a hello from the other side with their own once. Load order therefore never matters, including Safari injecting into an open tab.
- **A tab is ready once the relay holds a page hello with its own build id.** The relay then sends the background `{t:"tab", state:"ready", title: document.title}`. Presence does not wait on the HUD (a HUD failure is a `coach-error`, and `card` answers `no-hud`) or on game boot (`probe` reports `ready: false` and the server's settle waits).
- `pagehide` → the relay sends `{t:"tab", state:"gone"}`.
- A tab open before install never gets the scripts on Chrome or Orion, so it is not counted; rung 7 says *open or reload*.

### 9.4 World check

- **Manifest floors** (§5.3) make Firefox 102–127, the known silent-isolated case, uninstallable — and in fact everything below 142.
- **Runtime backstop, timing-free:** `relay.js` runs at `document_start` and sets `globalThis.__coachemonIsolated = COACHEMON_BUILD` in its own world. `page.js` and the wrapper around `hud.js` check `typeof __coachemonIsolated !== "undefined"` first. If they can see it they ran isolated: they dispatch `coachemon:wrong-world`, register no handlers, and the HUD does not start.
- The relay reports `{t:"tab", state:"wrong-world"}`; the tab is not counted; status rung 6.

### 9.5 Forgery exposure

- **No nonce or secret.** Anything in the MAIN world, `pokerogue.net`'s scripts or another extension's, can already call Phaser, so a forged command to our handlers grants nothing, and a secret passed through the shared DOM would be visible anyway.
- **Only the upward direction is defended, by structure.** The relay never turns a page-originated event into a command. It forwards upward only:
  1. `coachemon:reply` whose `id` is one of its own pending commands and whose `build` is its own;
  2. `coachemon:card` and `coachemon:coach-error` with exactly the declared keys and types, and its own `build`.
  Everything else is dropped. The Firefox consent gate (§8.4) sits at this same point.
- **Accepted:** page code can observe replies and card text, which it can read from the game anyway, and can forge a well-shaped `card` event.

### 9.6 Stale instances

- On load, `page.js` calls `window.__coachemonPage?.stop()` and installs its own `window.__coachemonPage = { build, stop }`. The HUD wrapper does the same through the existing `window.__coachHud.stop()` (`hud/00-prelude.js`). The newest copy always wins. A copy with no build id (one injected by `read.sh` during the opt-in period) is replaced like any other.
- **The relay pairs only with page scripts of its own build.** After an extension update on Chrome or Orion, the old relay is orphaned, the tab drops out of the hub, and rung 7 says reload. **Nothing reloads the tab.**

### 9.7 Relay failure codes

Separate from a command's own `{ok:false, why}` result (§10):

| Code | Meaning | Server treats it as |
|---|---|---|
| `no-handler` | dispatch returned with no reply | a vanished tab: keep settling until the call budget |
| `threw` | the handler threw; only the message crosses | the read failed this poll |
| `too-large` | a reply or event over **1 MB**, dropped at the relay | an error naming the command |
| `wrong-world` | page scripts ran isolated | unreachable, rung 6 |

The background adds `tab-gone` when `tabs.sendMessage` fails because the tab closed.

---

## 10. Command vocabulary

From [Command vocabulary between hub clients and the extension](https://github.com/IIxauII/coachemon/issues/188). The table's contents are fixed there; names, argument and result shapes are finalised here.

### 10.1 The store table

`src/protocol/commands.ts` exports `STORE_COMMANDS`, one frozen record per command: `{ kind: "read" | "act", args: <schema>, since: <protocol> }`. The hub refuses names not in it; the extension registers exactly these handlers in a store build.

Every handler first runs the scene locator (today's `__locate`). If the game is not ready it returns `{ ok: false, why: "<locator reason>" }` (`no-phaser`, `empty-pool`, `no-game-in-pool`, `not-booted`, `no-battle-scene`), except `probe`, which returns `{ ready: false, why }`.

| Command | Kind | Args | Result | Replaces in `src/game/js.ts` |
|---|---|---|---|---|
| `probe` | read | `{ pump?: boolean, tail?: boolean }` | `PREDICATE`'s result, plus `frame`, `pumped: boolean`, `errorAt: number \| null` (epoch ms of the latest uncaught page error or unhandled rejection seen), and with `tail: true` also `console: {t, level, text}[]` (last 30 page errors and warnings, 300 chars each) | `PREDICATE`, `FRAME`, CDP `onException`, `consoleTail()` |
| `menu` | read | `{}` | `READER`'s result, **without** `extra.inputs` | `READER` |
| `snapshot` | read | `{ detail: "lean" \| "party" \| "items" \| "full" }` | `snapshot(detail)`'s result; `full` adds the coach's battle fields (§11.4) | `snapshot(detail)` |
| `starters` | read | `{}` | `STARTER_INFO`'s result plus `owned` (§11.4) | `STARTER_INFO`, `probe.js` starters |
| `card` | read | `{}` | `{ ok: true, kind, key, wave, verdict, groups, text, summary }` (`groups` is the card's groups with their rows flattened — `[]` where the panel has nothing drawn, null where the panel is from a build before the field; `summary` is `__coachHud.summary()`), or `{ ok: false, why: "no-hud" }` | `probe.js`'s `hud` field |
| `press` | act | `{ button: number, fine: string }` | `{ ok: true, mode }` | `press(n)` |
| `key` | act | `{ button: "UP"\|"DOWN"\|"LEFT"\|"RIGHT"\|"ACTION"\|"CANCEL"\|"SUBMIT"\|"MENU", fine: string }` | `{ ok: true }` | CDP `rawKey` |
| `cursor.option` | act | `{ index: number, fine: string }` (unskipped index) | `{ ok: true, fullCursor, cursor }` | `optionSelectSetCursor` |
| `cursor.shop` | act | `{ row: number, col: number, fine: string }` | `{ ok: true, rowCursor, cursor }` | `shopSetCursor` |
| `cursor.starter` | act | `{ index: number, fine: string }` | `{ ok: true, cursor, scrollCursor, species }`, or `why: "filter-mode"` | `starterSetCursor` |
| `cursor.learn` | act | `{ row: number, fine: string }` | `{ ok: true, moveCursor }`, or `why: "move-select-off"` | `learnMoveSetCursor` |
| `modal` | act | `{ index: number, fine: string }` | `{ ok: true, mode }`, or `why: "no-button-action"` | `modalButton(i)` |

- **One cursor command per menu family with a setter.** A future family's setter is a new `cursor.<family>` command: additive, no bump. The server reads the extension's command list to decide per family whether to jump or press-walk; the press-walk fallback already exists.
- **No `reload` in any store build.** The escape ladder's terminal rung is reported to the agent as "reload the tab by hand" and never executed.

### 10.2 Every act carries the expected fingerprint

`fine` is the fine fingerprint from the server's last settled `probe`. The handler recomputes it in the same page turn, before acting. If it differs it returns `{ ok: false, why: "moved", fine: <current> }` and does nothing. The server treats `moved` like an unsettled read and settles again. This closes today's race between the guard evaluate and the press evaluate.

### 10.3 Pump

- `probe { pump: true }` runs **one** `game.loop.tick()` before reading, when `game.loop.frame` has not advanced since the previous `probe` this page script answered, and reports `pumped: true`.
- **Only the driver's settles pump.** A server that holds the grant sets `pump: true` on every settle poll, reads included; the hub refuses it from anyone else (`not-driver`).
- This replaces the `loop_frozen` refusal for the agent. Readers never advance the player's game: in a hidden tab a coach read times out with diagnostic reason `loop-frozen` (frame unchanged across the whole budget).
- Measured on Chrome only: settles in 412–428 ms hidden, against about 207 ms visible **[live]**. Other engines **[unverified]**.

### 10.4 `key`

Dispatches an untrusted `keydown` then `keyup` on `window`, with `keyCode` set in the constructor and pinned by `Object.defineProperty` as well. Keys are today's `RAW_KEYS` (`src/driver.ts`). Phaser never checks `isTrusted` **[live]** Chrome. The two events alternate `type`, so Phaser's duplicate-event bailout keeps both, and a `keydown` never goes out without its `keyup`. The server's one-retry rule is unchanged (§6.4 of the v1 spec). `InputsController.keyboardKeyDown` and `getButtonWithKeycode` join `scripts/hud-deps.ts`'s drift list; an upstream `isTrusted` check would kill only this rung. Firefox and Safari **[unverified]**.

### 10.5 Page handlers

- `src/page/*.ts` holds `locate()` and one exported function per command, each **self-contained**: `(L, args) => result`, no imports, no closure over module state except through `L`. Today's `js.ts` string bodies become these functions verbatim; the pasted values become `args`.
- `extension/entrypoints/page.ts` imports them, registers them in the dispatch table, and handles the relay protocol.
- **During the opt-in period** the CDP transport evaluates the same functions: `((locate, handler, args) => { const L = locate(); return L.ready ? handler(L, args) : …; })(${locate}, ${handler}, ${JSON.stringify(args)})`. One source serves both transports until CDP is deleted.
- `src/game/js.test.ts` moves to `src/page/*.test.ts`. The scene locator stays duplicated between `src/page/` and the HUD, as today.
- **Generated enums travel as an argument.** A self-contained handler cannot import `UiMode`, so `src/page/modes.ts` exports `PAGE_MODES` (`{ m: UiMode, sm: SummaryUiMode }`) and each transport hands it to `dispatch`: the CDP link serializes it into the expression, the extension imports it. `dispatch` puts it on `L` as `L.m`/`L.sm`, so a pin bump that renumbers a mode moves every page comparison with it (#164). `src/page/modes.test.ts` scans the stringified handlers and fails on a bare numeric mode or handler index.

### 10.6 Dev-only table

- `extension/src/dev/commands.ts`, imported only under `--mode dev`: `eval { source: string }` → the JSON value or `{ ok: false, why: "threw", message }`; `screenshot {}` → `{ ok: true, png: <base64> }` via the background's `tabs.captureVisibleTab`, chunked across frames of at most 1 MB; `reload {}` → the dev loop's extension reload (§5.4).
- **Dev commands sit outside the protocol integer**; a dev build always pairs with a server from the same checkout. The hub routes them only to a `flavour: "dev"` extension.
- The guard asserts none of these names reach a store artifact (§5.5).

### 10.7 Bumping `PROTOCOL`

Bump when removing a command, renaming one, or changing what an existing argument or result field means. Do not bump when adding a command, an optional argument, or a result field. From 1.0.0 on, a bump is an extension major release (§14.1).

---

## 11. Coach reads, card events and the watch CLI

### 11.1 The `card` event

- **The HUD pushes a `card` event whenever the card it shows changes**: a new decision, or a changed verdict. It dispatches `coachemon:card` from `hud/98-tick.js`'s tick, deduplicated on `key` + `verdict`.
- Fields:
  - `kind`: `battle`, `learn`, `reward`, `biome` or `encounter` (the HUD's `rewards` card is sent as `reward`).
  - `key`: the dedupe key the HUD already derives per kind (wave for a battle; wave + pokémon + move for learn; wave + free reward names for rewards; wave for a biome choice; wave + encounter for an encounter).
  - `wave`.
  - `verdict`: for a battle, the glossary's **verdict** (`easy`, `trainer`, `danger`, `catch`, `fight`); for other kinds, the leading call of the matching field of `cardSummary()` as the HUD already writes it (the learn call, the rewards line's first clause, the biome pick, the encounter's `take …`, `your call` or `not judged`).
  - `groups`: **the card's own groups** (#349 §5), in the fixed tab order, each `{ id, label, summary, rows: string[] }`. Nodes cannot cross a wire, so a group arrives with its rows already flattened — an agent reading the stream reads a group by name instead of parsing lines. The relay's card detail type, its exact-key gate and its validator carry it; the hub forwards bodies opaquely and needs no change. A card is about 1 KB against the 1 MiB detail cap.
  - `text`: **the card's own plain-text rendering**, **derived from `groups`** by the HUD's render layer — every group in the fixed order, headed by `label` and `summary`, then its rows one per line — so the two cannot disagree by construction. Groups are built once per fire and both projections come off them.
- A HUD failure dispatches `coachemon:coach-error` once per distinct message.
- **Late join:** a subscriber issues a `card` read right after subscribing.

### 11.2 The watch CLI

Replaces `skills/coachemon/scripts/watch.mjs`. File: `skills/coachemon/scripts/watch.ts`, run under `Monitor` as `node <skill dir>/scripts/watch.ts` (picked here). It is a hub client with `role: "watch"`: no JS, no injection, never claims the grant.

1. Connect (spawning the hub if needed, §7.2). If the game isn't reachable, print the status ladder line (§12.3), then retry every 5 s, printing the line again only when it changes.
2. `subscribe`, then issue a `card` read and print it.
3. Print one line per event. Lines are summaries, because notifications truncate; `read_card` has the rest.

```
BATTLE w12 · danger | <first line of text>
LEARN w14 · your call | <first line of text>
REWARDS w15 · buy first | <first line of text>
BIOME w20 · <pick> | <first line of text>
ENCOUNTER w23 · not judged | <first line of text>
COACH ERROR <message>
TABS <rung 8 line>
RESUMED
```

On a `resume` notice the CLI prints `RESUMED` and issues a `card` read again, printing its line. The first line of `text` is cut at 300 characters. `NEW BATTLE`, `DANGER` and `LIKELY LOST` are gone: a battle whose card turns dangerous mid-wave is a new `BATTLE … · danger` line for the same wave.

### 11.3 Coach reply rules, rewritten against verdicts

These replace `SKILL.md`'s watcher list and reply rules at the flip.

- **`BATTLE · easy`:** no reply.
- **`BATTLE · catch`:** one line, only if you'd weigh the catch differently from the card.
- **`BATTLE · danger`**, including a mid-wave change to danger: 2–3 lines, move first: what to click, then the threat and the out (switch, sacrifice, heal).
- **`BATTLE · trainer`:** send-in order and the win condition, at most 4 lines. Don't repeat the ⚔ line. If the card's fight plan says *likely lost*, say what the plan salvages (chip the win condition, keep the saved mon healthy) before the player spends another mon.
- **`BATTLE · fight`:** reply only to add what the card can't see: ability traps, the long horizon.
- **`LEARN`:** reply only when the verdict is `your call` or you disagree: lost coverage, setup and status value, recoil, accuracy, spread moves in doubles.
- **`REWARDS`:** when the card's audit names a ✗ finding before a big fight, say what fixes it on this screen; otherwise only what the card can't judge. Buy shop items before taking the free reward.
- **`BIOME`:** reply only to add what the card doesn't weigh: an evil-team boss or rival ahead, a gym leader's signature mons, a rare biome two steps away, a close call.
- **`ENCOUNTER`:** reply on `not judged` or `your call`, weighing the options from `read_card`; or when the run's longer plan disagrees.
- **`COACH ERROR`:** report it; don't stay silent.
- **`TABS`:** tell the player to close all but one pokerogue.net tab; the coach can't read anything until then.

### 11.4 Read-only MCP tools for the coach

The coach reads through the same MCP server, never through `read.sh`. The coach skill still never calls `press`, `select_option` or `start_run`.

| Tool | Command | Returns |
|---|---|---|
| `get_state(detail?)` (existing) | `snapshot` | as today; `detail: "full"` now also carries, per party **and** enemy member: `types`, `ability`, `passive`, `stats` (via `getStat`), `statStages`, `status`, `onField`, `boss`, `bossBars`, `held`, and moves with type, power, category, accuracy and PP; plus `trainer` (name or null) and the party's non-held `items`. These are `probe.js`'s battle fields, moved. |
| `read_card()` (new) | `card` | the envelope header plus `kind`, `wave`, `verdict`, `groups` (the card's groups, rows flattened — the same list the card event carries, so a late join catches up on a decision already on screen), `text`, and `summary` (the fields `read.sh battle`'s `hud` had). `summary` is the read's liveness gate and is read on its own, so the structured read keeps working with no panel drawn. |
| `read_starters()` (new) | `starters` | `owned`: unlocked species by dex id with `ivTotal`, `passiveUnlocked`, `hiddenAbility`, `eggMoves`, `costReduction`, `candy`, and `cost` (null off the starter grid); plus the grid fields `start_run` uses |

`read_card` and `read_starters` settle like every reading tool, return the envelope, and need no grant.

**The extension toggle that turns the HUD on or off is the HUD's own header control** (the close control in the panel's corner, and the glyph that reopens it), which ships inside the extension. It is not a popup or an extension setting, because the permission set has no `storage` and the pairing ticket leaves the extension no UI. `read.sh hud` / `hud-off` are gone. The panel has three states — **strip**, **strip + drawer** and **closed** — switched by the caret and the × in its own corner, and one key holds the state and the last open group together, in the page's `localStorage["coach-hud-panel"]`, so the panel the player left is the panel they come back to. A dismissal is stored as a flag over the view it covers, so reopening restores the strip or the drawer the player was in. That key replaces the one that held the view alone, whose three values migrate once and are then dropped.

---

## 12. MCP server changes

### 12.1 The transport seam

- `Driver` stops taking `CdpSession` concretely. It takes a `GameLink` (picked here) with one method per command in §10.1 plus `screenshot()` and `commands: ReadonlySet<string>`.
- `src/cdp/link.ts` implements it over `CdpSession.evaluate` with the §10.5 wrapper; `press`'s `fine` check runs inside the same evaluate. `src/hub/link.ts` implements it over the hub.
- **Opt-in:** `COACHEMON_TRANSPORT=hub` (picked here) selects the hub link. Only the dev sets it. Unset means CDP, until the flip deletes both the variable and the CDP link.

### 12.2 Tools after the flip

| Tool | Change |
|---|---|
| `status` | Rewritten payload, §12.3. Never launches a browser. |
| `get_state`, `read_menu` | Transport only; `get_state full` gains the coach fields (§11.4). |
| `select_option`, `press`, `start_run` | Send `claim` at call start; refuse `contended` if refused. `loop_frozen` is removed; the settle pumps (§10.3). The raw-key rung uses `key`. |
| `screenshot` | Needs the dev table. Against a store build it returns an error `unavailable`: *"screenshot needs a dev build of Coachemon. Use read_menu or get_state to see the screen."* |
| `read_card`, `read_starters` | New, read-only (§11.4). |

Every tool, acting or reading, first checks reachability. Unreachable → error `unreachable` carrying `rung` and `line` from §12.3. More than one tab → `tabs`, with the list. A needed command missing from the extension → `missing_command` with the rung 4 wording.

### 12.3 `status` and the ladder

```jsonc
{
  "status": "ok",
  "reachable": true,
  "reach": null,                      // or { "rung": 7, "line": "…" } when unreachable
  "browsers": [{ "target": "chrome", "version": "1.2.0", "flavour": "store", "protocol": 1, "consent": true }],
  "tabs": 1,
  "driver": "you" | "other" | null,
  "game_version": "1.12.0.11",
  "pinned_version": "1.12.0.11",
  "version_match": true,
  "run_live": true,
  "run": "live",
  "wave": 4,
  "screen": "COMMAND",
  "settled": true,
  "busy_reason": null
}
```

`attached`, `tab_contended`, `lock_holder` and `chrome_launched_by_server` are removed.

**When the game isn't reachable**, `status` returns the line from the **first failing rung**, evaluated over every connected browser. The watch CLI prints the same line. Wording picked here:

| Rung | Condition | Line |
|---|---|---|
| 1 | port held by something that isn't the hub | `Port <port> is held by <process name> (pid <n>), not the Coachemon hub. Quit it, then retry.` (process from `lsof -nP -iTCP:<port> -sTCP:LISTEN` where available, else `another program`) |
| 2 | hub can't start | `The Coachemon hub would not start: <first stderr line>.` |
| 3 | hub up, no browser connected | `No browser has Coachemon connected. Install Coachemon (Chrome Web Store or Firefox Add-ons; Orion installs either; Safari: the signed download from GitHub Releases, then allow it on pokerogue.net in Safari Settings › Extensions) and open pokerogue.net.` |
| 4 | a connected extension outside the protocol window, or missing a needed command | `Coachemon <version> in <target> is too old for this plugin. Update the extension.` / `Coachemon <version> in <target> is newer than this plugin. Update the plugin: claude plugin update coachemon.` |
| 5 | Firefox connected without consent | `Coachemon in Firefox is waiting for your OK: click the Coachemon icon in the toolbar once.` |
| 6 | a tab reported wrong world | `Coachemon can't reach the game in <target>. Update <target>.` |
| 7 | no ready tab | `Coachemon is connected, but no pokerogue.net tab is ready. Open or reload pokerogue.net.` |
| 8 | more than one ready tab | `<n> pokerogue.net tabs are open (<target>: <title>; …). Close all but one.` |

### 12.4 Diagnostics

The fixed diagnostic block keeps its shape. `console_tail` comes from `probe { tail: true }`, requested only when building a non-`ok` result. The hang watch's unhandled-rejection corroboration reads `errorAt` from each `probe`.

---

## 13. Migration off CDP and Apple Events

From [Migration off CDP and Apple Events](https://github.com/IIxauII/coachemon/issues/108), with Orion's carve-out removed by [Agent transport on Orion](https://github.com/IIxauII/coachemon/issues/150) and the pump from [Game loop in a hidden tab without focus emulation](https://github.com/IIxauII/coachemon/issues/174).

### 13.1 Opt-in, then one hard flip

- **Until the flip**, the hub link ships behind `COACHEMON_TRANSPORT=hub`, for dogfooding against sideloaded 0.x builds. The default stays CDP. No release lets players choose between transports, and the plugin never depends on a sideloaded extension.
- **The flip is one ordinary 0.x server release**, cut **only once the CWS and AMO 1.0.0 listings are both public**. If either store rejects the listing, the flip waits and CDP keeps working. Safari does not gate it.
- **No protection for existing installs**: no deprecation release, detection shim or migration note. The `coachemon` plugin rename needs no migration either.

### 13.2 What the flip deletes or rewrites

| Today | After the flip |
|---|---|
| `src/cdp/session.ts`, `src/cdp/link.ts`, `COACHEMON_TRANSPORT` | deleted |
| Launching or attaching Chrome, `~/.coachemon/chrome-profile`, port 9222 | deleted. The server never starts a browser. The profile directory is left on disk. |
| `keepAlive` (CDP focus emulation), `loop_frozen` | deleted; the driver's settles pump (§10.3) |
| `rawKey` (CDP `Input.dispatchKeyEvent`) | the `key` command |
| `onException`, `consoleTail` | `probe`'s `errorAt` and `tail` |
| `Page.captureScreenshot` | dev-table `screenshot` |
| `src/cdp/lock.ts`, `driver.lock` | deleted; the hub's grant |
| Tab choice (first page in `/json/list`) | exactly one ready tab, or refuse |
| `src/game/js.ts` | deleted; `src/page/*.ts` |
| `skills/coachemon/scripts/read.sh`, `probe.js`, `watch.mjs` (Chrome and Orion branches) | deleted; `read_card`, `read_starters`, `get_state`, `watch.ts` |
| Orion "Allow JavaScript from Apple Events" instructions | deleted |
| `scripts/eval.ts`, `smoke.ts`, `autoplay.ts` | kept, run against a paired dev build on port 47148 with `COACHEMON_DEV=1` |
| Escape ladder `reload` rung, effect "CDP page reload…" | kept as a reported rung; effect text becomes "reload the pokerogue.net tab by hand; the run resumes from the last synced save via Continue" |
| README; `play-pokerogue` and `coachemon` `SKILL.md`; `plugin.json` description and the `cdp` keyword; code comments naming CDP | rewritten. `play-pokerogue` relies on `read_menu`/`get_state` for unknown and stuck screens, since store builds have no screenshot. `coachemon` gets §11.3's rules. |
| `docs/spec/v1-tool-surface.md` | kept as a historical record, with a one-line banner pointing here |

### 13.3 What the player does

Install Coachemon in their browser, install the plugin, open (or reload) pokerogue.net, and on Firefox click the icon once. The agent plays the player's own tab, logged in as the player.

---

## 14. Release

From [Release channel, versioning, and how fixes reach users](https://github.com/IIxauII/coachemon/issues/109). §14.1–§14.4 applied in [Extension: release pipeline and store submission](https://github.com/IIxauII/coachemon/issues/207); §14.6 in [Extension: Safari release checklist](https://github.com/IIxauII/coachemon/issues/209).

### 14.1 Scheme

- **Semver on its own tags, `extension-v<X.Y.Z>`.** Fits Chrome's integer-only `version` and Safari's `CFBundleShortVersionString`.
- **Major = a breaking protocol change** (§10.7), from 1.0.0 on.
- **0.x is unlisted.** Its GitHub Releases carry store-flavour zips for the three builds, for sideloading. No 0.x release uses a breaking-change marker, because semantic-release would jump to 1.0.0.
- **Seed:** before the first extension commit lands, tag the current `master` as `extension-v0.0.0`, so the first release is 0.1.0 rather than 1.0.0.
- **1.0.0** is cut deliberately: an extension commit with a `BREAKING CHANGE:` footer reading "first listed release". The dev creates the CWS and AMO listings by hand from that release's zips.

### 14.2 Second semantic-release run

- **Config:** `extension/.releaserc.json`, `tagFormat: "extension-v${version}"`, `branches: ["master"]`. semantic-release runs with `extension/` as its working directory.
- **Path filter:** a local plugin, `scripts/release/extension-commits.mjs` (picked here), wraps `@semantic-release/commit-analyzer` and `@semantic-release/release-notes-generator`. It keeps only commits whose `git diff-tree --no-commit-id --name-only -r <sha>` touches `extension/`, `src/protocol/`, `src/page/` or `skills/coachemon/scripts/hud/`. A HUD fix bumps both streams, which is correct. A server-only commit never bumps the extension. **(picked here, amending the release ticket's two paths)** `src/protocol/` and `src/page/` are added because they ship in the extension and did not exist when the release ticket fixed the filter; leaving them out would let a change to shipped page code skip the extension stream.
- **The weekly randbats refresh commit** (`chore(hud)`, from `.github/workflows/randbats.yml`) rewrites `hud/05-randbats.js`, so the path filter picks it up, but it is a `chore`, so it bumps nothing. The plugin's `chore(release)` commit no longer touches that file — the refresh left the release job in #291.
- **Stamping:** `@semantic-release/exec` `prepareCmd` runs `node ../scripts/release/stamp-extension.ts ${nextRelease.version}`, which writes the version into `extension/package.json` **in the workspace only**, then builds and zips. **Nothing is committed**; there is no `@semantic-release/git` in this run. The tag is the source of truth.
- **Artifacts** on the GitHub Release: `coachemon-chrome-<v>.zip`, `coachemon-firefox-<v>.zip`, `coachemon-<v>-sources.zip`, `coachemon-safari-web-extension-<v>.zip` (the unpackaged folder), via `@semantic-release/github`. A fifth, `Coachemon-safari-<v>.zip`, is added to the same release by hand afterwards (§14.6); CI neither writes nor checks for it.

### 14.3 Job order in `release.yml`

1. **`release`** (today's job, unchanged): typecheck, test, the plugin's semantic-release. It may push a `chore(release)` commit and a `v*` tag.
2. **`release-extension`**, `needs: release`: check out `master` fresh with `fetch-depth: 0`, so it builds on top of the plugin's release commit when there is one and ships that commit's randbats; Node 24; `npm ci --ignore-scripts` at the root; `npm ci` in `extension/`; `npx -p semantic-release@25 -p @semantic-release/exec@7 semantic-release` in `extension/`.

Both jobs sit in the existing `release` concurrency group, so two pushes never interleave.

### 14.4 Store submission

- **Every `extension-v*` release after 1.0.0 auto-submits to both CWS and AMO**, in `publishCmd`. 1.0.0 is the listings' first package, uploaded by hand. 0.x never submits.
- **Tool:** `wxt submit` (publish-browser-extension 5 or later), which speaks **Chrome Web Store API v2**; v1 stops being supported on 2026-10-15 **[doc]**.
- **Chrome review pending:** cancel the pending submission through the API, then upload and submit the newest. A burst of HUD releases restarts Chrome's review each time; accepted. **Confirmed** by the release ticket: `POST /v2/{name}:cancelSubmission` "can be used to cancel the review of a pending submission" **[doc]**, and `publish-browser-extension` calls it behind `--chrome-cancel-pending` when `fetchStatus` reports `PENDING_REVIEW`.
- **Secrets** (picked here, corrected by the release ticket), mapped by the job onto the tool's environment names: `CWS_EXTENSION_ID`, `CWS_PUBLISHER_ID`, `CWS_SERVICE_ACCOUNT_EMAIL`, `CWS_SERVICE_ACCOUNT_PRIVATE_KEY`, `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`. **API v2 authenticates as a GCP service account**, so the client id, client secret and refresh token this section first listed are v1.1's and are not used. AMO's extension id is the gecko id (§5.3), read off the built Firefox manifest rather than configured twice.
- **A failed submission fails the job** after the tag and GitHub Release exist. The dev resubmits by hand; nothing retries.

### 14.5 How fixes reach players

- Chrome: its review, "a few days… up to a few weeks", with no expedite **[doc]**, then Chrome's update check every few hours.
- Firefox: signed within about 24 hours, then Firefox's auto-update **[doc]**.
- Safari: when the player downloads the new build.
- **When a PokéRogue update breaks the HUD, the installed extension does nothing**: no dependency probe, no version warning, no gate. It runs, possibly wrong, until a fixed version clears review. Detection stays manual. The fix path: re-pin with `npm run drift:check -- --stamp`, fix, merge, and the release auto-submits.

### 14.6 Safari, by hand, every release

On the dev's Mac, with an individual Apple Developer Program membership (enrolled off-map) and Xcode:

1. Download `coachemon-safari-web-extension-<v>.zip` from the release and unzip it.
2. `xcrun safari-web-extension-converter <folder> --project-location <tmp> --app-name Coachemon --bundle-identifier io.github.iixauii.coachemon --macos-only --copy-resources --no-open --no-prompt` (bundle identifier picked here). **Corrected in ticket 10**: this said `safari-web-extension-packager`, after the title of Apple's page ("Packaging a web extension for Safari"). The tool Xcode ships is the **converter**; `xcrun` finds no packager on any Mac, so the name as written aborted every run at this step. `--no-prompt` is also added, or the converter stops on its warning summary waiting for a human. The containing app is the converter's generated near-shell and stays that way: Apple's Developer ID route has no review, and Attachment 7 bars bundling the extension with an app that has a different purpose.
3. Archive with the Developer ID Application identity (hardened runtime on).
4. `xcrun notarytool submit Coachemon.zip --wait`, then `xcrun stapler staple Coachemon.app`.
5. `gh release upload extension-v<v> Coachemon-safari-<v>.zip`, with the `.app` zipped by `ditto -c -k --keepParent`.

No auto-update, no Homebrew, no Sparkle: players re-download. Nothing in any build scripts or automates turning the extension on, per Attachment 7 §1.1.

Carried out by `npm run release:safari -- <version>` (`scripts/release/safari-release.ts`), whose plan is the pure `scripts/release/safari.ts` and whose setup is [the runbook](../runbooks/safari-release.md). Corrections the script makes to the steps above, all found while writing it:

- **The tool is `safari-web-extension-converter`**, not the packager step 2 named. See step 2.
- **The zip handed to `notarytool` is a scratch file.** Notarization writes nothing back into it, so the release's asset is cut from the app **after** stapling; uploading the submitted zip would ship an app that Gatekeeper passes only while the player is online.
- **The asset is `Coachemon-safari-<v>.zip`**, apart from the release's `coachemon-safari-web-extension-<v>.zip`, so the two Safari assets sit on one release without colliding.
- **Both `gh` calls name `--repo`.** The build runs in a scratch directory, which is no checkout, and the repo is private, so `gh` has nothing to infer from.
- **Gatekeeper is asked with plain `spctl -a -vvv`.** `-t install` is the installer-package assessment; the default, `execute`, is what a downloaded `.app` meets.

---

## 15. Licence and notices

From [Licence and contribution grant before the first listing](https://github.com/IIxauII/coachemon/issues/135). Applied in [Extension: licence and third-party notices](https://github.com/IIxauII/coachemon/issues/200), except `extension/package.json`, which ticket 4 creates.

- **`LICENSE`** at the repo root: the full GNU AGPL-3.0 text. It covers the whole repo, the extension package included. Copyright holder `IIxauII`.
- `"license": "AGPL-3.0-only"` in the root `package.json` and `extension/package.json`.
- **No inbound grant**: no CLA, no DCO, no CONTRIBUTING line, and nothing that mentions one. Thin copyright in agent-written code is not addressed.
- **`THIRD_PARTY_NOTICES.md`** at the root, shipped in every extension artifact because `hud.js` is comment-stripped:
  - `pkmn/randbats`: the full MIT licence text, naming `hud/05-randbats.js` (today it says "MIT" and carries no notice).
  - PokéRogue: "The coach overlay contains code modified from PokéRogue (https://github.com/pagefaultgames/pokerogue), Copyright Pagefault Games and contributors, licensed AGPL-3.0-only." (AGPL §5)
  - Corresponding source: "The complete source for this version is at https://github.com/IIxauII/coachemon/tree/extension-v<version>." The build fills in the version.
- **`skills/coachemon/references/game-code.md`** keeps its quotes and gains one line at the top: source repo `pagefaultgames/pokerogue`, the tag the quotes were read from (`v1.12.0.11`), AGPL-3.0-only, Pagefault Games contributors.
- **No per-file SPDX headers.**
- The AMO sources zip already covers Firefox's corresponding source.

---

## 16. Accepted risks and unverified premises

Each was accepted knowingly by a closed ticket. None blocks building; a build ticket that can check one cheaply does.

| Premise | From | What the build does about it |
|---|---|---|
| Loopback reaches `127.0.0.1` on a Developer ID-signed, notarized Safari build, without a host permission | [Loopback transport on a signed Safari build](https://github.com/IIxauII/coachemon/issues/160) (ruled out of scope) | ships anyway; no HUD-only fallback |
| Safari's background page survives idle long enough, given both keepalives plus reconnect-on-wake (the unsigned page unloaded after about 32 s) | same | reconnect-on-wake (§8.2) |
| `background.scripts` is right for Safari rather than `service_worker` | same | `scripts` (§5.3) |
| Developer ID can carry a Safari web extension at all | same | the first Safari release is the check |
| One build carrying both keepalives works on Chrome and Firefox | [Loopback transport on Chrome and Firefox](https://github.com/IIxauII/coachemon/issues/161) | smoke run per engine |
| Synchronous `CustomEvent` dispatch across worlds on Firefox, Safari and Orion; the marker's visibility to a mis-worlded script | [MAIN↔isolated relay contract](https://github.com/IIxauII/coachemon/issues/193) | **relay check per engine in `scripts/smoke.ts`**: one `probe` must come back synchronously; fallback in §9.2 |
| The pump settles a hidden tab on Firefox, Safari and Orion | [Game loop in a hidden tab without focus emulation](https://github.com/IIxauII/coachemon/issues/174) | none; readers time out, the driver pumps |
| `key` (untrusted keydown) drives the game on Firefox and Safari | [Synthetic input a Phaser game accepts](https://github.com/IIxauII/coachemon/issues/101) | the retry rung only |
| Orion reaches loopback without a `127.0.0.1` host permission, from a store-installed build (tested only as unsigned sideloads with the permission declared) | [Agent transport on Orion](https://github.com/IIxauII/coachemon/issues/150) | smoke run on Orion with the store zip |
| Orion's opt-in auto-update of store installs clears site permissions (orionfeedback #7361) | [Orion after the AppleScript route retires](https://github.com/IIxauII/coachemon/issues/118) | none; rung 7 covers the missing tab |
| Orion after sleep/wake (orionfeedback #14474), long idle, hidden tab | [Agent transport on Orion](https://github.com/IIxauII/coachemon/issues/150) | reconnect-on-wake |
| AMO accepts the `extension_pages` CSP override, and `required: ["none"]` beside an optional list | [Pairing protocol: MCP server and extension](https://github.com/IIxauII/coachemon/issues/107), [Permission set and privacy disclosure](https://github.com/IIxauII/coachemon/issues/110) | named fallbacks (§5.3, §8.1) |
| A CWS reviewer accepts the declared remote code (`04-game-tables.js`'s chunk import) | [Permission set and privacy disclosure](https://github.com/IIxauII/coachemon/issues/110) | declared Yes (§6) |
| Chrome Web Store API v2 can cancel a pending review — **confirmed, no longer a premise** | [Release channel, versioning, and how fixes reach users](https://github.com/IIxauII/coachemon/issues/109) | `:cancelSubmission` **[doc]**, wired as `--chrome-cancel-pending` (§14.4) |
| The 142 floor is worth its cost: Firefox 128–141, ESR 140 included, cannot install at all | [#379](https://github.com/IIxauII/coachemon/issues/379) and [#380](https://github.com/IIxauII/coachemon/issues/380), the desktop and Android halves of one floor | none; any lower floor is a linter warning (§5.3) |
| Nintendo does not act on the -ÉMON name | [Name and listing identity](https://github.com/IIxauII/coachemon/issues/105) | no trademark filed; answer the listing email |
| Chrome's Local Network Access leaves extension workers alone as enforcement rolls out | [Loopback transport on Chrome and Firefox](https://github.com/IIxauII/coachemon/issues/161) | none |

---

## 17. Build tickets cut from this

In dependency order. Each inherits §1 and the **[unverified]** premises it touches.

1. **Licence and notices**: §15. Independent; lands first.
2. **Shared protocol and page handlers behind a seam**: `src/protocol/`, `src/page/` from `js.ts`, `GameLink` with the CDP implementation (§10.1, §10.2, §10.5, §12.1). The server still runs on CDP, all tests green.
3. **The hub and the hub link**: `src/hub/`, `ws`, lifecycle, skew, auth, frames, grant, tabs, events, `COACHEMON_TRANSPORT=hub`, the status ladder (§7, §12). Testable with a fake extension client.
4. **The extension package**: `extension/`, WXT, manifests, flavours, HUD build hook, background transport, keepalives, Firefox consent, relay, guard, CI workflow, AMO sources zip (§5, §8, §9).
5. **Card events and coach reads**: `cardText`, `coachemon:card` / `coach-error` in the HUD, `read_card`, `read_starters`, `get_state full` fields (§11.1, §11.4).
6. **Watch CLI**: `watch.ts` behind the opt-in (§11.2).
7. **Dev tooling**: dev table, dev loop, `eval`/`smoke`/`autoplay` on port 47148, and the per-engine relay and keepalive smoke checks (§5.4, §10.6, §16).
8. **Release pipeline**: seed tag, second semantic-release, path filter, stamping, zips, `release-extension` job, submission and secrets (§14.1–§14.4).
9. **Listing assets**: icon, fixture screenshots, description, `PRIVACY.md`, GitHub Pages (§3, §6).
10. **Safari release checklist**: §14.6 as a script or a checklist in the repo. Needs the membership.
11. **The flip**: §13.2 in one release. **Blocked until the CWS and AMO 1.0.0 listings are both public.**

---

## 18. Out of scope

Ruled beyond this delivery on the map, and not specified here:

- Developer-program enrolment and store submission as acts (this spec describes them; doing them is execution).
- The Mac App Store and iOS; asking Pagefault Games for permission.
- Orion on iOS, iPadOS, Linux and Windows.
- A remote, version-keyed data table.
- Per-mode HUD gating; any change to PokéRogue.
- Community support and player issue triage; monetisation.
- Whether the enemy AI's move score is called, rewritten or kept.
- Player onboarding and first-run UX beyond the status lines, including how minimum versions are stated, Safari's Settings grant and Orion's third-party toggle.
- What the HUD does while an agent drives the same tab.
- Store rejection recovery.
- Data versus art exposure for species and move names in a listing.
- Firefox site-access revocation after install.
- Drift watches on `pokerogue.net`'s response headers, and on the input path beyond `keyboardKeyDown` and `getButtonWithKeycode` (those two do join the drift list, §10.4).
- Chrome's two-extension cap for new publishers and median review latency.
- Measuring off-Chrome behaviour beyond the smoke checks in §16.
- Daily Run and leaderboard rules for agent-driven runs and seed previews.
- Whether runtime-call routes for derived HUD logic work on a live tab.
