# Page-world execution across Chrome, Firefox and Safari

Research for [#99](https://github.com/IIxauII/pokerogue-mcp/issues/99), a child of
[#98 Map: HUD as a browser extension](https://github.com/IIxauII/pokerogue-mcp/issues/98).
Read **2026-09-16**; every version and date below is as of that day.

Vocabulary is `CONTEXT.md`. This document introduces no domain term — *world*, *content script*,
*manifest* and *extension* are the platforms' words, not ours, and are used only as the platforms use them.

Each claim is tagged:

- **[primary]** — stated by the engine vendor's own docs, spec, compat data or source.
- **[measured]** — observed by this research against the live network or the repo.
- **[disputed]** — primary sources disagree, or a vendor claim is contradicted by a developer report.
- **[inferred]** — a conclusion drawn here, not stated anywhere. Verify before depending on it.

---

## 0. The short answer

All three engines can run extension code in the page's own JS world today, and **the parity constraint
holds** — but only on the imperative path, and only above a floor that is high on Safari.

| Capability | Chrome | Firefox | Safari |
| --- | --- | --- | --- |
| `content_scripts[].world: "MAIN"` (manifest) | **111** | **128** | **18** |
| `scripting.executeScript({world:"MAIN"})` | **95** | **128** | **15.4** [disputed] |
| `scripting.registerContentScripts({world:"MAIN"})` | **102** | **128** | **16.4** |
| `userScripts` API (MV3) | 120 | 136 | **never** |
| `web_accessible_resources` + injected `<script>` | yes | yes | yes |

Release dates: Chrome 95 = 2021-10-19, 102 = 2022-05-24, 111 = 2023-03-07, 120 = 2023-12-05;
Firefox 128 = 2024-07-09; Safari 18 = September 2024.

Source for the whole table: MDN browser-compat-data, `webextensions/manifest/content_scripts.json`,
`webextensions/api/scripting.json`, `webextensions/api/userScripts.json`,
`webextensions/manifest/web_accessible_resources.json`, read from
[`mdn/browser-compat-data@main`](https://github.com/mdn/browser-compat-data) on 2026-09-16. **[primary]**

Safari's row is the binding one. `content_scripts[].world` needs **Safari 18** (September 2024), which is
the effective floor for a declarative, one-manifest build. Everything below Safari 18 needs the imperative
path, and the `userScripts` API — Chrome's and Firefox's most capable page-world mechanism — does not exist
on Safari at all and never has. **[primary]**

---

## 1. Chrome / Chromium

### 1.1 Versions

- `content_scripts[].world`: **Chrome 111** (stable 2023-03-07). **[primary]** BCD says 111, and the
  Chromium source confirms it by tag diff: at
  [`110.0.5481.77/extensions/common/api/content_scripts.idl`](https://chromium.googlesource.com/chromium/src/+/refs/tags/110.0.5481.77/extensions/common/api/content_scripts.idl)
  the field is `[nodoc]` and commented *"Currently manifest scripts will always run in the isolated world
  and this field should not be specified. Eventually, main world support may be added."*; at
  [`111.0.5563.64`](https://chromium.googlesource.com/chromium/src/+/refs/tags/111.0.5563.64/extensions/common/api/content_scripts.idl)
  the same field reads *"The JavaScript "world" to run the script in. Defaults to ISOLATED. Only available
  in Manifest V3 extensions."*
  **Flag:** developer.chrome.com carries no version badge on the manifest `world` key and "What's new"
  has no Chrome 111 entry for it, so 111 rests on Chromium source plus BCD, not on a Google doc.
  Note the last clause: **in Chrome the manifest `world` key is MV3-only.**
- `scripting.executeScript({world:"MAIN"})`: **Chrome 95** (stable 2021-10-19). BCD's 95 looks
  inconsistent against its own Chrome 102 for `scripting.ExecutionWorld` and
  `RegisteredContentScript.world`, but the two are different features and BCD is right on both:
  **[primary]**
  - Chrome 95: *"The `chrome.scripting` API's `executeScript()` method can now inject scripts directly
    into a page's main world."* — [What's new in Chrome extensions](https://developer.chrome.com/docs/extensions/whats-new).
    Corroborated in source: [`95.0.4638.54/chrome/common/extensions/api/scripting.idl`](https://chromium.googlesource.com/chromium/src/+/refs/tags/95.0.4638.54/chrome/common/extensions/api/scripting.idl)
    already declares `enum ExecutionWorld { ISOLATED, MAIN }` and `ExecutionWorld? world;` on `ScriptInjection`.
  - Chrome 102: *"Dynamically registered content scripts can now specify the world that assets will be
    injected into."* — same page. BCD's `ExecutionWorld` = 102 is dating the **promotion of the enum to
    the shared `extensionTypes.ExecutionWorld` type**, not the arrival of MAIN.
  - The BCD PR that set these ([#18878](https://github.com/mdn/browser-compat-data/pull/18878), Rob Wu,
    2023-02-14) cites [`e5ad3451`](https://chromium.googlesource.com/chromium/src/+/e5ad3451c17b21341b0b9019b074801c44c92c9f)
    for the Chrome 102 half.
- `chrome.userScripts`: **Chrome 120** (2023-12-05), `worldId` **Chrome 133** (2025-02-04),
  `userScripts.execute()` **Chrome 135** (2025-04-01). MV3 only; the doc's own sample manifest sets
  `"minimum_chrome_version": "120"`. **[primary]**

Milestone stable dates from [chromiumdash](https://chromiumdash.appspot.com/fetch_milestone_schedule).
None of these floors matter for a 2026 listing — Chrome is far past all of them. Chrome is the easy engine.

### 1.2 What the MAIN world costs you

Chrome's content-script guide is explicit on the two facts that shape the design:

> "When a content script is injected into the main world, the CSP of the page applies."
> — [developer.chrome.com, Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) **[primary]**

> "There are risks involved when using the `"MAIN"` world. The host page can access and interfere with the injected script."
> — [developer.chrome.com, content_scripts manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts) **[primary]**

Consequences:

1. **No `chrome.*` in the MAIN world.** Chrome's list of APIs a content script may call directly
   (`dom`, `i18n`, `storage`, `runtime.connect/getManifest/getURL/id/onConnect/onMessage/sendMessage`)
   applies to the *isolated* world. A MAIN-world script has the page's globals and nothing else. **[primary]**
2. **The documented cross-world channel is the DOM.** Chrome's own guide routes page↔extension traffic
   through `window.postMessage()` into an isolated content script, which then uses
   `chrome.runtime.sendMessage` / `chrome.runtime.connect`. **[primary]**
3. **The page's CSP governs the MAIN-world script.** A page that shipped
   `script-src 'self'` could block it. See §4 for what `pokerogue.net` actually serves.

Chrome states the isolated-world policy explicitly by contrast — *"Content scripts running in isolated
worlds have the following Content Security Policy (CSP): `script-src 'self' 'wasm-unsafe-eval'
'inline-speculation-rules' chrome-extension://…/; object-src 'self';`"* — and then the MAIN-world sentence
above. **[primary]** The clinching statement is on the `userScripts` page, which names the one world that
*is* exempt: `USER_SCRIPT` — *"Specifies the execution environment that is specific to user scripts and is
exempt from the page's CSP"* — against `MAIN` — *"the execution environment shared with the host page's
JavaScript"*, with no exemption offered.
([chrome.userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)) **[primary]**
Chromium's own CSP bypass keys off the world id
(`ContentSecurityPolicy::ShouldBypassMainWorldDeprecated` → `IsolatedWorldCSP::Get().HasContentSecurityPolicy(worldId)`,
`third_party/blink/renderer/core/frame/csp/content_security_policy.cc`), so it structurally cannot apply to
main-world execution, and `chrome-extension:` is registered with several powers in
`extensions/renderer/dispatcher.cc` but **not** CSP bypass. **[primary, source-derived]**

### 1.3 `chrome.userScripts` is not an option for this listing

`chrome.userScripts` gives arbitrary page-world code with named worlds and per-world CSP — exactly what a
292 KB HUD bundle wants. It is unusable here for two reasons:

- **It requires the user to turn something on.** Chrome's own reference: before **Chrome 138** the user had
  to "Enable Developer Mode by clicking the toggle switch next to **Developer mode**"; from Chrome 138 "The
  **Allow User Scripts** toggle is on each extension's details page."
  ([chrome.userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)) **[primary]**
  Either way it is off by default for an ordinary player installing from the Web Store.
- **Safari has never implemented it.** BCD: `userScripts` → `safari: false`, `safari_ios: mirror`. **[primary]**

Under the *all three engines day one* constraint, `userScripts` is dead on arrival. Note this: it removes
the only mechanism that would have let the HUD get its own named world with its own CSP.

---

## 2. Firefox

### 2.1 Versions

Everything page-world landed at once, in **Firefox 128, released 2024-07-09**, under
[bug 1736575](https://bugzilla.mozilla.org/show_bug.cgi?id=1736575) (RESOLVED FIXED, target milestone
"128 Branch", resolved 2024-06-04). Mozilla's own release note, verbatim: **[primary]**

> "Support is now provided for scripts to run in the web page execution environment. This is provided
> through support for `MAIN` in `ExecutionWorld` for the `scripting` API, the addition of `world` to the
> `contentScripts.register()` API, and support for `world` in the `content_scripts` manifest key
> (Firefox bug 1736575)."
> — [Firefox 128 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/128)

So: `content_scripts[].world: "MAIN"`, `scripting.executeScript({world:"MAIN"})`,
`scripting.RegisteredContentScript.world` and the MV2-only `contentScripts.register({world})` are **all
Firefox 128**. Note the split BCD records inside `executeScript`: the `world` parameter and
`"ISOLATED"` arrived in **102**, `"MAIN"` only in **128**. **[primary]**

- `browser.userScripts` (MV3 form): **Firefox 136**, `userScripts.execute()` **Firefox 153**. An
  *incompatible* MV2 `userScripts` API exists and is documented separately as
  [userScripts (Legacy)](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/userScripts_legacy). **[primary]**
- **Unlike Chrome, Firefox allows `world` in MV2 as well as MV3.** The schema has no
  `min_manifest_version` gate: `"world": {"$ref": "extensionTypes.ExecutionWorld", "optional": true,
  "default": "ISOLATED"}` in
  [`toolkit/components/extensions/schemas/manifest.json`](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/extensions/schemas/manifest.json). **[primary]**

MDN's prose on `world` is terse and gives no version; the compat table is the authority:

> `"MAIN"` — "The web page's execution environment. This environment is shared with the web page without
> isolation. Scripts in this environment don't have any access to the APIs that are only available to content scripts."
> — [MDN, manifest.json/content_scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts) **[primary]**

**MDN's prose and its compat tables disagree, twice, and the tables win.** The `scripting/ExecutionWorld`
and `content_scripts` pages carry no Firefox version caveat in prose, so prose alone implies MAIN works
wherever `scripting` does (102) — only the table says 128. And `scripting/executeScript` prose says
"Firefox 101" where BCD says 102 everywhere. **[disputed]**

### 2.1b Three Firefox-specific traps

1. **`world` is silently ignored on Firefox 102–127 — the manifest installs and the script runs ISOLATED.**
   The `ContentScript` schema declares `"additionalProperties": {"$ref": "UnrecognizedProperty"}`, and
   `UnrecognizedProperty` is `{"id": "UnrecognizedProperty", "type": "any", "deprecated": "An unexpected
   property was found in the WebExtension manifest."}`. A `deprecated` string **warns to the browser console
   and drops the property**; it does not error (`Schemas.sys.mjs`). **[primary]**
   → **Feature-detect `world` at runtime. Never trust the manifest to tell you it took.**
2. **Firefox 128 leaks the injected script's full source into page-visible stack traces.** The 128
   implementation compiled MAIN-world code through an internal `data:` URL, so "the full script source
   appears when any callee (potentially from the web page) examines the stack trace, in `new Error().stack`"
   — fixed in **Firefox 129**
   ([bug 1900410](https://bugzilla.mozilla.org/show_bug.cgi?id=1900410)). **[primary]**
   → If the HUD's source should not be trivially readable by the page, the Firefox floor is **129, not 128**.
3. **MAIN-world scripts show as `<anonymous code>` in devtools**, intentionally, as anti-fingerprinting
   ([bug 1910624](https://bugzilla.mozilla.org/show_bug.cgi?id=1910624), still NEW). The workaround is a
   `//# sourceURL=…` comment, which is also visible to the page. **[primary]** Debugging the HUD on Firefox
   will be worse than on Chrome.

### 2.1c Firefox deliberately makes MAIN-world injection CSP-**independent** — the opposite of Chrome

This is the sharpest engine divergence in the whole document, and MDN documents none of it. Bugzilla does:

- [Bug 1736575](https://bugzilla.mozilla.org/show_bug.cgi?id=1736575) comment #16 records that the first
  `executeScript` + `func` prototype *"does not work when the page has a CSP"*; comment #17 is the
  follow-up patch titled **"Support func in main world in scripting.executeScript despite strict CSP"**.
  Both landed in the same Firefox 128 push. **[primary]**
- [Bug 1900410](https://bugzilla.mozilla.org/show_bug.cgi?id=1900410) comment #0, Rob Wu: *"In bug 1736575,
  I introduced the use of a `data:`-URL in order to have a way to get a `PrecompiledScript` that can
  execute independently of the page's CSP."* **[primary]**

For the `web_accessible_resources` route the split is finer still on Firefox: **WAR file URLs bypass the
page CSP** ([bug 1207394](https://bugzilla.mozilla.org/show_bug.cgi?id=1207394), FIXED in Firefox 48; its
tests include *"Load and run a script on a page with a CSP that would normally forbid loading and running
scripts"*), but **inline `<script>` text injected by a content script does not** —
[bug 1267027](https://bugzilla.mozilla.org/show_bug.cgi?id=1267027), *"[meta] Page CSP should not apply to
content inserted by content scripts"*, filed 2016-04-24 and **still NEW after ten years**. **[primary]**

### 2.2 Why the isolated-world fallback is worse on Firefox than it looks

Firefox is the only engine that offers an *alternative* to MAIN world: Xray vision plus
`wrappedJSObject` / `cloneInto` / `exportFunction`. The ticket asks whether that is a viable fallback.
**It is not, for this HUD.** The reasons are documented, not speculative.

Start from the wall itself:

> "Content scripts cannot see JavaScript variables defined by page scripts."
> — [MDN, Content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) **[primary]**

That alone disqualifies the plain isolated world: the HUD's scene locator resolves the bare identifier
`Phaser` — a page global — and `docs/spec/v1-tool-surface.md` §1 principle 2 fixes that locator as
`Phaser.Display.Canvas.CanvasPool.pool` → `.game` → `game.scene.getScene('battle')`. In an isolated world
`Phaser` is `undefined`. **[primary + measured]**

`wrappedJSObject` waives Xray and does give the real page object, transitively:

> "Note that once you do this, you can no longer rely on any of this object's properties or functions being,
> or doing, what you expect. […] Also note that unwrapping is transitive: when you use `wrappedJSObject`,
> any properties of the unwrapped object are themselves unwrapped (and therefore unreliable)."
> — [MDN, Sharing objects with page scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts) **[primary]**

So `window.wrappedJSObject.Phaser…getScene('battle')` would in principle reach the live scene and let
`def.getAttackDamage(...)` be called. What breaks is everything the HUD does *around* that call:

- **Every object the HUD passes into a game function must be `cloneInto`'d, and every callback
  `exportFunction`'d.** `cloneInto` uses the structured clone algorithm and "by default it excludes
  functions". **[primary]** The HUD's calls into game code pass option objects (the `simulated` flag and
  friends, per `skills/coach-pokerogue/references/game-code.md` §0) and arrays; `skills/coach-pokerogue/scripts/hud/10-damage.js`
  also hands closures around freely. Each such boundary becomes an explicit marshalling site. **[measured]**
- **`globalThis` is not `window`.** "in Firefox's content scripts, `globalThis` is a distinct object
  inheriting from `window`". **[primary]** The HUD is delivered as one IIFE written against page semantics
  (`skills/coach-pokerogue/scripts/hud/00-prelude.js` sets `window.__coachHud` and reads `document.documentElement.dataset`).
- **The marshalling is unbounded.** There is no seam here. The HUD is ~292 KB across 17 modules that walk
  live Phaser and PokéRogue objects constantly. Every property read, every method call, every `constructor.name`
  walk in `isA()` would sit on the unwrapped side. Rewriting that for Xray is not a fallback; it is a second HUD.
  **[inferred]**

**Verdict: Firefox's Xray/`wrappedJSObject` route is a real capability but the wrong tool at this size.**
It is worth keeping in mind only as an escape hatch for a *small* read (one property, one scalar), never
for the HUD.

### 2.3 The extension origin is not stable on Firefox

Firefox serves web-accessible resources from `moz-extension://<uuid>` where the UUID is generated
**per install**, not per extension, and MDN names the CSP consequence directly:

> "`<extension-UUID>` is not your extension's ID. This ID is randomly generated for every browser instance.
> This prevents websites from fingerprinting a browser by examining the extensions it has installed."
> — [MDN, `web_accessible_resources`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources)

> "In Firefox: Resources are assigned a random UUID that changes for every instance of Firefox:
> `moz-extension://«random-UUID»/«path»`. **This randomness can prevent you from doing things, such as adding
> your extension's URL to another domain's CSP policy.**"
> — [MDN, Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) **[primary]**

Chrome's `key` manifest property (which pins the extension ID, and with it the origin) is unsupported in
Firefox; `browser_specific_settings.gecko.id` pins the add-on ID but **not** the UUID. BCD records
`web_accessible_resources.use_dynamic_url` as `firefox: false` precisely because the URL is *already*
dynamic there. **[primary]** So a page could never allowlist the Firefox extension's origin in its CSP —
though on Firefox that does not matter, because WAR URLs bypass the page CSP anyway (§2.1c).

---

## 3. Safari

Safari is where the parity constraint actually bites, and where the sources are thinnest. Apple's own
documentation pages (`developer.apple.com/documentation/safariservices/…`) are client-rendered and returned
no article body to a fetch on 2026-09-16 **[measured]** — so Apple's release notes could not be read
directly. The best available primary source for Safari is MDN's compat data, which since
[mdn/browser-compat-data#27058](https://github.com/mdn/browser-compat-data/pull/27058) (merged 2025-06-17)
is maintained by **`xeenon` — Timothy Hatcher, Apple's WebKit web-extensions engineer** — who states there
that he "went through and updated all web extension BCD data for Safari […] correcting items for older
releases that were wrong or missing. […] Cross-referenced Safari release notes and bugs." That makes BCD's
Safari column a first-party claim, not a third-party guess. **[primary]**

### 3.1 Versions

- `content_scripts[].world: "MAIN"`: **Safari 18** (September 2024), `safari_ios` mirrors it. **[primary]**
- `scripting.registerContentScripts({world:"MAIN"})`: **Safari 16.4**. Independently confirmed by an Apple
  Frameworks Engineer on the developer forum, April 2023: *"Safari 16.4 does support "MAIN" for
  registerContentScripts."*
  ([Apple Developer Forums thread 728849](https://developer.apple.com/forums/thread/728849)) **[primary]**
- `scripting.executeScript({world:"MAIN"})`: BCD says **Safari 15.4**. **[disputed]** — this is the one value
  in the table with no corroboration. It predates `registerContentScripts` world support by a full year,
  which is an odd shape, and no Apple release note or WebKit blog post announcing it could be found. It
  survived `xeenon`'s 2025 audit unchanged, which is meaningful but not proof.
- `chrome.userScripts` / `browser.userScripts`: **not supported, any version**. **[primary]**

There is also a live developer report on the same forum thread that `world: "MAIN"` via
`registerContentScripts` "doesn't appear to work" when tested on Safari 16.4.1 desktop, left unanswered by
Apple. **[disputed]** — that report is one developer's unreproduced claim, but it is the only testing
evidence in the record and it contradicts the vendor.

**Do not treat any Safari world-support claim below Safari 18 as settled without testing it on a real
Safari build.** That is the single largest piece of unverified risk in this document.

### 3.2 Safari's other parity breaks on content scripts

Two of these are recorded as compat *notes*, i.e. they are Safari behaviours with no Chrome or Firefox
counterpart. **[primary]**

1. **Content scripts do not run until the user grants site access.** BCD, on
   `manifest.content_scripts` for Safari: *"Content scripts are not applied to tabs until the user grants
   permission via the extension's access popover in the toolbar."* And on `run_at`: *"Additional loads
   after permission is granted will respect `run_at`."* On iOS the same gate exists as an "access alert".
   Chrome and Firefox inject on a matching `host_permissions` grant without a per-site click.
   **This is a hard day-one UX divergence:** the Safari HUD is invisible until the player clicks the toolbar
   popover and grants `pokerogue.net`.
2. **`injectImmediately` is ignored.** BCD note on `scripting.executeScript.injectImmediately` for Safari:
   *"Scripts are always injected immediately."* Timing control the other two engines give you does not exist.
3. **`include_globs` / `exclude_globs` are unsupported** on Safari
   ([webkit.org/b/246492](https://webkit.org/b/246492)); only `matches` / `exclude_matches` work. Minor here
   (one host), but it constrains the manifest.
4. **The extension base URL is always dynamic.** BCD note: *"The extension's base URL is always dynamic in
   Safari."* Same consequence as Firefox's per-install UUID (§2.3).
5. **`web_accessible_resources.extension_ids` is unsupported** on Safari. Irrelevant to a single-extension
   design, noted for completeness.

---

## 4. What `pokerogue.net` serves as CSP

**Measured on 2026-09-16.** The ticket's hypothesis is confirmed, and then some: there is no CSP at all.

```
$ curl -sSIL https://pokerogue.net
HTTP/2 200
date: Wed, 16 Sep 2026 06:09:27 GMT
content-type: text/html
server: cloudflare
last-modified: Sun, 23 Aug 2026 19:51:20 GMT
cache-control: public, s-maxage=31536000, max-age=0
cf-cache-status: HIT
strict-transport-security: max-age=15552000; includeSubDomains; preload
```

- **No `Content-Security-Policy` header.** **[measured]**
- **No `Content-Security-Policy-Report-Only` header.** **[measured]**
- **No `<meta http-equiv="Content-Security-Policy">`** in the document. The only `http-equiv` meta on the
  page is `<meta http-equiv="audience" content="General">`. **[measured]**
- Re-fetched with a cache-buster and `Cache-Control: no-cache` to force `cf-cache-status: MISS` — the origin
  response is identical, so this is not a stale edge-cached header set. **[measured]**
- The JS bundle (`/assets/index-CTFFh6u_.js`, 1 035 104 bytes) also carries no CSP header. **[measured]**

Two independent confirmations that `script-src` is not merely absent but *not enforced anywhere*:

1. The page ships its own inline `<script>` registering `./service-worker.js` — an inline script with no
   nonce and no hash. **[measured]**
2. Cloudflare's own bot-management shim on the page creates a hidden iframe and sets
   `d.innerHTML = "window.__CF$cv$params={…}"` on a fresh `<script>` element — i.e. Cloudflare itself relies
   on inline script execution being permitted on this origin. **[measured]**

**Conclusion.** Every page-world mechanism in this document works on `pokerogue.net` today: declarative
`world: "MAIN"`, imperative `executeScript({world:"MAIN"})`, and the `web_accessible_resources` +
injected-`<script>` fallback all run unimpeded. **[measured]**

**Standing risk, and it is not symmetric.** This is a property of a third-party site the project does not
control, and the map puts *"Any change to PokéRogue itself"* out of scope — so the project cannot fix it if
it changes. If PokéRogue ever ships `script-src 'self'`, the three engines diverge:

| | Chrome | Firefox | Safari |
| --- | --- | --- | --- |
| `world: "MAIN"` content script under a page CSP | **breaks** [primary] | **survives** [primary] | **unknown** [inferred] |
| WAR + `<script src="…">` under a page CSP | **breaks** [primary] | **survives** [primary] | **unknown** [inferred] |
| Inline `<script>` text injected by a content script | breaks | **breaks** [primary] | unknown |

- **Chrome breaks.** *"When a content script is injected into the main world, the CSP of the page applies."*
  The exemption exists only for the `USER_SCRIPT` world, which Safari does not have (§1.2, §1.3).
- **Firefox survives, on purpose.** MAIN-world injection was explicitly built to run "independently of the
  page's CSP", and WAR file URLs bypass page CSP outright (§2.1c). Inline `<script>` *text* is the one
  Firefox route that still breaks — bug 1267027, open ten years.
- **Safari is unknown.** Neither Apple nor WebKit documents whether a Safari MAIN-world content script is
  subject to the page's CSP. **[inferred: unknown]** A genuine gap in the record, stated as such.

The extension origin is not allowlistable on Firefox or Safari either way (dynamic UUID, §2.3/§3.2), so
"ask PokéRogue to allowlist us" is not a recovery path on two of three engines.

A `trusted-types` policy on the page would break the injected-`<script>` fallback independently of
`script-src`. Not present today. **[measured]**

---

## 5. The fallback, and what breaks it

`web_accessible_resources` + an isolated content script that appends
`<script src="{browser,chrome}.runtime.getURL('hud.js')">` to the document works on all three engines
(`web_accessible_resources` is supported since Chrome ≤54 / Firefox 48 / Safari 14; the MV3 `resources`+`matches`
form since Chrome 88 / Firefox 109 / Safari 15.4 **[primary]**). It is the classic route and it predates
`world: "MAIN"` everywhere.

What breaks it:

- **A page `script-src` that does not allow the extension origin.** Fatal **on Chrome**, and unfixable
  there by allowlisting on the other two because the origin is per-install. **On Firefox this is not fatal:
  WAR URLs bypass the page CSP (bug 1207394, §2.1c).** Safari unknown. Not an issue today (§4).
  **[primary + measured]**
- **`trusted-types` on the page.** Not an issue today. **[measured]**
- **Ordering.** The injected `<script>` runs asynchronously relative to the page's own module graph; the
  declarative `world: "MAIN"` + `run_at: "document_start"` path gives a stronger ordering guarantee — except
  on Safari, where `injectImmediately` is ignored and the user's site-access grant gates the first injection
  entirely (§3.2). **[primary]**
- **Nothing about it is cheaper than `world: "MAIN"`.** It needs the extra isolated content script anyway,
  and it exposes `hud.js` at a fetchable URL. **[inferred]**

**Recommendation: use `content_scripts[].world: "MAIN"` as the single path on all three engines.** The
fallback's only advantage would be reaching Safari < 18, and Safari < 18 has other blockers anyway
(§3.1 disputed, §6).

---

## 6. Where the three cannot be made to behave the same

Named explicitly, as the ticket demands. These are not "minor differences"; each one is a place where the
same extension build produces a different experience.

1. **Safari 18 is the floor, and it is set by Safari alone.** A single declarative manifest using
   `content_scripts[].world: "MAIN"` requires Chrome 111 / Firefox 128 / **Safari 18**. Chrome 111
   (Mar 2023) and Firefox 128 (Jul 2024) are ancient; Safari 18 (Sep 2024) is tied to macOS Sonoma/Sequoia
   and is not something a user can update independently of the OS in the way Chrome and Firefox are.
   **The extension's minimum macOS is therefore decided by Safari, not by us.** **[primary + inferred]**
2. **Safari gates content scripts behind a per-site user grant; the others do not.** BCD, Safari note on
   `content_scripts`. The Safari HUD does not appear on first visit to `pokerogue.net` — the player must
   click the toolbar popover. No Chrome or Firefox onboarding step corresponds to it. **[primary]**
3. **`userScripts` exists on Chrome and Firefox and will never exist on Safari.** BCD: `safari: false`.
   Any design that wanted a named world with its own CSP, or runtime-updatable HUD code without a store
   review, cannot have it on all three. **[primary]**
4. **Injection timing is not controllable on Safari.** `injectImmediately` is documented as ignored
   ("Scripts are always injected immediately"), and the first injection is deferred to the permission grant
   regardless of `run_at`. If the HUD's bootstrap depends on beating the game's own module graph, Chrome and
   Firefox can guarantee it and Safari cannot. **[primary]**
5. **The three engines apply the page's CSP to MAIN-world code differently, and two of them documented it
   in opposite directions.** Chrome: *"the CSP of the page applies"* — a page CSP kills the HUD. Firefox:
   MAIN-world injection was deliberately built to execute *"independently of the page's CSP"*
   (bug 1900410), and WAR URLs bypass it too. Safari: undocumented. Today this is moot because
   `pokerogue.net` serves no CSP (§4) — but it means **the three engines are not merely untested against a
   CSP, they are known to behave differently**, and no single build can be made CSP-proof on all three.
   **[primary ×2, inferred ×1]**
6. **Firefox silently ignores an unknown `world` key; Chrome and Safari's behaviour on their own
   pre-support versions is not established.** On Firefox 102–127 the manifest installs, a console warning
   is emitted, and the script runs ISOLATED — i.e. the HUD would appear to install and then quietly read
   nothing. Any engine-support check must be a **runtime feature-detect**, not a manifest assumption.
   **[primary]**
7. **`world` is MV3-only on Chrome and available in MV2 on Firefox.** A single manifest cannot exploit
   that; it just means Firefox has an escape hatch Chrome does not. **[primary]**
8. **Firefox 128 leaks the injected source into page-readable stack traces; 129 does not.** If that
   matters, Firefox's floor is 129 while Chrome's and Safari's are unaffected. **[primary]**
9. **The extension origin is stable only on Chrome.** Firefox uses a per-install `moz-extension://<uuid>`;
   Safari's base URL is "always dynamic". Anything that wants to be recognised by the page, or allowlisted
   by it, works on Chrome only. **[primary]**
10. **`include_globs`/`exclude_globs` do not exist on Safari.** A match-pattern-only manifest is the common
   denominator. **[primary]**
11. **Firefox's `globalThis !== window` inside content scripts.** Only relevant if any extension code runs
   isolated — but the relay content script (§1.2) will. Code shared between the relay and the HUD cannot
   assume the two are the same object on Firefox. **[primary]**

---

## 7. What this means for the map

Read against #98's locked decisions.

**Compatible with the lock.** *"All three engines day one"* survives: `content_scripts[].world: "MAIN"` is
real on all three, and `pokerogue.net` serves no CSP to block it. The HUD can keep its current shape — one
page-world bundle reaching `Phaser` as a bare global and calling `getAttackDamage`, the enemy-AI move
choice and the biome pools directly, exactly as it does through CDP today. No rewrite of the HUD's ~292 KB
is forced by the move to an extension. **[inferred]**

**Puts pressure on the lock.**

- *"All three engines day one"* now has a price tag that was not visible at charting: a **Safari 18 minimum**,
  and a **Safari-only per-site permission click** before the HUD ever appears. The map's *"Player-facing
  onboarding and first-run UX"* fog is now known to be engine-asymmetric, not uniform.
- *"The extension replaces CDP and Apple Events"* — the Apple Events route works on **Orion**, which the
  `coach-pokerogue` skill supports today (`skills/coach-pokerogue/SKILL.md`). The map names Chrome, Firefox
  and Safari; it does not name Orion. Retiring the AppleScript route drops Orion unless Orion's Chrome- or
  Firefox-extension compatibility is confirmed. **No primary source on Orion's `world: "MAIN"` support was
  found.** **[inferred: unknown]** This is a scope question the map has not asked.

- *"All three engines day one"* again, on resilience rather than capability: the three engines are **known**
  to react differently to a page CSP (§4, §6.5) — Chrome dies, Firefox survives. Parity today does not
  imply parity tomorrow, and the map treats parity as a standing constraint, not a launch-day snapshot.

**Does not contradict any locked decision.** Nothing found here forces a second build, a staged rollout,
or a different HUD bootstrap per engine — which closes the map's *"Whether one engine's injection path
forces a different HUD bootstrap than the others"* fog with a **no**, conditional on the Safari 18 floor
being acceptable. One qualification: the bootstrap is the same on all three, but it must **feature-detect
the world at runtime** rather than trust the manifest, because Firefox 102–127 accepts `world` and silently
ignores it (§2.1b). That is a shared bootstrap with a probe, not three bootstraps.

---

## 8. Fog this opens

New questions that are now specifiable:

1. **Is Safari 18 an acceptable floor?** It is an OS-coupled version. What share of the audience is below it,
   and does the map accept shipping nothing to them, rather than the Safari-16.4 imperative path whose
   support is [disputed] (§3.1)?
2. **What does the Safari site-access grant do to first-run UX?** The HUD is silent until a toolbar click
   that has no Chrome or Firefox equivalent. Does onboarding branch per engine, or does it teach the Safari
   flow to everyone?
3. **Does `world: "MAIN"` actually work on a real Safari build?** Every Safari claim here rests on compat
   data plus one 2023 forum reply, against one unanswered developer report that it did not work. This needs
   one hour on a real Safari.
4. **Is Orion in or out?** See §7. The Apple Events route the map retires is Orion's only route today.
5. **What is the relay contract between the MAIN-world HUD and the isolated content script?** The HUD already
   writes to `document.documentElement.dataset.mcpOut`, which crosses every world on every engine. Whether
   the extension keeps that channel or moves to `window.postMessage` is a design decision this research does
   not make, but it is now the next thing to decide.
6. **What happens if PokéRogue ships a CSP?** Now partly answered and worse than "unknown": Chrome breaks,
   Firefox survives by design, Safari is undocumented (§4). So a CSP would not degrade the product evenly —
   it would take Chrome out while Firefox kept working. Worth a monitoring stanza in `scripts/drift.ts`,
   which already watches the game code the HUD leans on: **watch `pokerogue.net`'s response headers for a
   `Content-Security-Policy` appearing.**
7. **What is the runtime feature-detect for page-world support?** Firefox 102–127 accepts `world` and
   ignores it (§2.1b). The extension needs a positive probe — the MAIN-world script announcing itself —
   and a defined behaviour when the probe fails. That contract is unwritten.

---

## Sources

All read 2026-09-16.

**Compat data (machine-readable, first-party-maintained for Safari):**

- [`mdn/browser-compat-data` `webextensions/manifest/content_scripts.json`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/content_scripts.json)
- [`webextensions/api/scripting.json`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/scripting.json)
- [`webextensions/api/userScripts.json`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/userScripts.json)
- [`webextensions/manifest/web_accessible_resources.json`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/web_accessible_resources.json)
- [PR #18878 — Add compatibility data for `scripting.ExecutionWorld`](https://github.com/mdn/browser-compat-data/pull/18878) (Rob Wu, Mozilla, 2023-02-14)
- [PR #27058 — Update web extension data for Safari 26 and correct versioning for some older releases](https://github.com/mdn/browser-compat-data/pull/27058) (Timothy Hatcher, Apple, 2025-06-17)

**Chrome:**

- [Content scripts — developer.chrome.com](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [`content_scripts` manifest key — developer.chrome.com](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [What's new in Chrome extensions](https://developer.chrome.com/docs/extensions/whats-new)
- [`chrome.userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [`chrome.scripting`](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- Chromium source by tag: [`95.0.4638.54 scripting.idl`](https://chromium.googlesource.com/chromium/src/+/refs/tags/95.0.4638.54/chrome/common/extensions/api/scripting.idl), [`110.0.5481.77 content_scripts.idl`](https://chromium.googlesource.com/chromium/src/+/refs/tags/110.0.5481.77/extensions/common/api/content_scripts.idl), [`111.0.5563.64 content_scripts.idl`](https://chromium.googlesource.com/chromium/src/+/refs/tags/111.0.5563.64/extensions/common/api/content_scripts.idl)
- [Chromium `e5ad3451c17b21341b0b9019b074801c44c92c9f`](https://chromium.googlesource.com/chromium/src/+/e5ad3451c17b21341b0b9019b074801c44c92c9f)
- [chromiumdash milestone schedule](https://chromiumdash.appspot.com/fetch_milestone_schedule) (stable dates)

**Firefox:**

- [MDN — `manifest.json/content_scripts`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)
- [MDN — Content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [MDN — Sharing objects with page scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts)
- [MDN — `web_accessible_resources`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources)
- [MDN — Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities)
- [MDN — Firefox 128 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/128); [Firefox 128.0 release notes](https://www.firefox.com/en-US/firefox/128.0/releasenotes/) (2024-07-09)
- [Bugzilla 1736575 — MAIN world support](https://bugzilla.mozilla.org/show_bug.cgi?id=1736575) (comments 16–17 on strict CSP)
- [Bugzilla 1900410 — data: URL `PrecompiledScript`, source leaked in stack traces, fixed 129](https://bugzilla.mozilla.org/show_bug.cgi?id=1900410)
- [Bugzilla 1207394 — WAR URLs bypass page CSP](https://bugzilla.mozilla.org/show_bug.cgi?id=1207394) (FIXED, Firefox 48)
- [Bugzilla 1267027 — \[meta\] Page CSP should not apply to content inserted by content scripts](https://bugzilla.mozilla.org/show_bug.cgi?id=1267027) (NEW since 2016)
- [Bugzilla 1910624 — MAIN-world scripts show as `<anonymous code>`](https://bugzilla.mozilla.org/show_bug.cgi?id=1910624) (NEW)
- [Bugzilla 1759932](https://bugzilla.mozilla.org/show_bug.cgi?id=1759932), [1766615](https://bugzilla.mozilla.org/show_bug.cgi?id=1766615)
- [`toolkit/components/extensions/schemas/manifest.json`](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/extensions/schemas/manifest.json) (`world` has no `min_manifest_version`; `UnrecognizedProperty`)

**Safari / WebKit:**

- [Apple Developer Forums thread 728849 — Support for `world: "MAIN"`](https://developer.apple.com/forums/thread/728849)
- [webkit.org/b/246492 — `include_globs`/`exclude_globs`](https://webkit.org/b/246492)
- [News from WWDC24: WebKit in Safari 18 beta](https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/) — contains **no** web-extension `world` announcement.
- Apple's `developer.apple.com/documentation/safariservices/*` pages are client-rendered and returned no body to a fetch; they could not be used as a source.

**Measured against the live site and this repo:**

- `https://pokerogue.net` response headers and document (2026-09-16), `https://pokerogue.net/assets/index-CTFFh6u_.js`
- `docs/spec/v1-tool-surface.md` §1, `skills/coach-pokerogue/scripts/hud/*.js`,
  `skills/coach-pokerogue/references/game-code.md`, `skills/coach-pokerogue/SKILL.md`
