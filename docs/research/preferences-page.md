# What an options page can reach on Chrome, Firefox and Orion

Research for [Whether an options page opens on Chrome, Firefox and Orion, and what it can reach](https://github.com/IIxauII/coachemon/issues/1017),
a ticket on the map [#1010](https://github.com/IIxauII/coachemon/issues/1010). It gathers the facts that
[Who reads and writes the settings behind the preferences page, and when it may connect](https://github.com/IIxauII/coachemon/issues/1020)
puts to the owner, and the storage facts that
[Which route each engine uses, with which chord, and where its binding lives](https://github.com/IIxauII/coachemon/issues/1021)
needs. **It decides nothing.** The preferences page itself is settled (owner, 2026-10-20, in
[#820](https://github.com/IIxauII/coachemon/issues/820)): it is the browser's options page (`options_ui`), and `solving`
is its first setting.

Read 2026-11-08. This repo's code is cited at `master` [`a25d4635`][repo]. Chromium source is `main` at `e6dce90d6634`
(and `e58a1eb3d829` for the `tabs.create` check), and Firefox source is `mozilla-firefox/firefox` `main` at
`b42441b06bc2`. Orion tracker threads are `https://orionfeedback.org/d/<id>`. Nothing was built, loaded or run for this
note. Every claim carries a tag:

- **[docs]**: vendor documentation, Kagi's own help and support sheet included.
- **[source]**: engine source at the named revision, or this repo's code.
- **[measured]**: someone actually observed it, either in this repo (named) or in a cited tracker thread (third party, dated).
- **[inferred]**: reasoning from the above. Check it before relying on it.

Vocabulary is `CONTEXT.md`: **hub**, **relay**, **panel**, **overlay**, **reach**, **command** (the hub's word; the
browser's is `manifest.commands`). The *preferences page* is #820's name for the options page and is not in the
glossary yet.

---

## Short answer

1. **It opens on Chrome and Firefox; Orion is the open one.** Chrome embeds `options_ui` in a dialog on
   `chrome://extensions` by default. Firefox embeds it in `about:addons` → Preferences. Both open a tab when
   `open_in_tab: true` is set, and both support `runtime.openOptionsPage()` **[docs, source]**. Orion claims full
   support for `openOptionsPage` **[docs]**. Its tracker, though, has open reports of options pages rendering empty
   with both a Chrome-store and an AMO build, and of `openOptionsPage()` resolving without doing anything **[measured,
   third-party]**. Nothing found says how Orion treats `open_in_tab`. Only a hand check settles Orion.
2. **The page can message the background with no permission. It reaches the relay only through a tab id, and the hub
   only if it dials itself.** `runtime.sendMessage` from the page reaches the background, and does not reach content
   scripts **[docs]**. Today's background drops any message that lacks `sender.tab` **[source]**. Chrome leaves
   `sender.tab` unset for embedded options **[docs]**, so an embedded page's message is dropped. The extension dials the
   hub only while a ready pokerogue.net tab is present **[source]**, as `PRIVACY.md` promises. Nothing listens on the
   hub's port unless a Claude session has spawned the hub **[source]**.
3. **The hub can't answer a question from the extension today.** No frame from the extension asks anything, and the hub
   silently drops frames it doesn't know **[source]**. `readSettings` and `writeSettings` are 20 lines: one boolean in
   `<COACHEMON_HOME or ~/.coachemon>/settings.json`, overwritten whole and not atomically **[source]**. The hub imports
   neither, and it would inherit its home from whichever client spawned it **[source]**.
4. **Firefox's gate lives in the background's transport, not in the extension as a whole.** Every frame except the hello
   and the keepalive ping is held until consent, wherever it started **[source]**. A socket the page opened itself would
   pass no gate. Mozilla's policy defines collection as data handled "outside of the add-on or the local browser" and
   doesn't mention a localhost socket **[docs]**.
5. **The guard bans words in the manifest only, so a binding can live in extension storage without `storage`.**
   `options_ui` passes the guard, and so does what WXT writes for it **[source]**. `localStorage` (in extension pages,
   not in Chrome's service worker) and IndexedDB (in both) need no permission **[docs]**. How long either survives
   differs by engine and is unknown on Orion. `PRIVACY.md` and the store disclosure promise "two entries … in the
   page's `localStorage`" **[source]**.

---

## 1. Support per engine

### 1.1 Per-engine table

| | Chrome (MV3) | Firefox (MV3, floor 142) | Orion, Chrome-flavoured build | Orion, Firefox build |
|---|---|---|---|---|
| **Default (`open_in_tab` unset)** | Embedded in a dialog on `chrome://extensions` (`?options=<id>`) **[source]** | Embedded in `about:addons` → the add-on's **Preferences** tab **[docs, source]** | Not documented; no thread found on `open_in_tab` or embedding | Same |
| **`open_in_tab: true`** | A plain tab at `chrome-extension://<id>/options.html` **[source]** | A normal tab (`switchToTabHavingURI`) **[docs, source]** | Not documented. A 2022 thread, still Planned, reports options opening "a new tab … [that] has no address" (#744) **[measured, third-party]** | Same |
| **Where the player finds it** | Right-click the toolbar icon → Options; or Details → Extension options on `chrome://extensions` **[docs, source]** | `about:addons` → the add-on → Preferences **[docs, source]**; a toolbar context-menu entry was not checked | Tools → Extensions → Manage Extensions → the extension's settings **[docs]** | Same **[docs]** |
| **`runtime.openOptionsPage()`** | Opens it in a tab or the dialog, or focuses one already open; `lastError` if there is no options page **[docs, source]** | Opens it, or rejects with "No options page" / "No browser window available" **[docs, source]** | Kagi's support sheet: "Full support" **[docs]**. #14703 (Orion 1.1.3, 2026-10-16, Under Review): resolves but does nothing when called from an extension page iframed into a web page **[measured, third-party]** | Same |
| **Known caveats** | Embedded: "the Tabs API cannot be used", `sender.tab` is not set, links open in a new tab, `window.close()` closes the dialog, the dialog is at least 400 px wide and at most 640 px tall **[docs, source]**; `chrome_style` is a manifest error in MV3 **[source]** | Embedded pages get view type `tab`; links open in a new tab **[source]**; `browser_style: true` is unsupported in MV3 from 118 **[docs]** | #10576 (2025-03-26, Planned): a Chrome-store extension's settings page is empty when opened from Manage Extensions **[measured, third-party]**; Orion 1.1 (2026-06-23) "Fixed … options pages not loading because the extension engine was not starting" **[docs]**; #11976: options pages can't start a download **[measured, third-party]** | #10576's 2025-04-26 reply: "seeing this in both the Firefox and Chrome versions" **[measured, third-party]**. The origin's scheme can flip (§5.3) |
| **Background the page talks to** | Service worker; a message wakes it **[docs]** | Event page with a DOM **[docs]** | Runs `service_worker` as a persistent page with a `document` **[measured]** (`research/orion-transport`, Orion 1.1.2) | Persistent page with a `document` **[measured]**, same note |

Safari is out of scope. No source covering it came up for free.

### 1.2 Detail

**Chrome.**

- **Manifest keys.**
  - `options_ui` with `open_in_tab` false is embedded "in chrome://extensions rather than opened in a new tab".
    `options_page` opens "in a new tab" ([options page doc][c-options]) **[docs]**.
  - The default is in the source: `open_in_tab = options_ui->open_in_tab.value_or(false)`
    ([`options_page_info.cc`][c-optinfo]) **[source]**.
  - `chrome_style` fails the load in MV3 (`kChromeStyleInvalidForManifestV3`, same file) **[source]**.
- **Where the player finds it.** "by right-clicking the extension icon in the toolbar and then selecting options", or
  on `chrome://extensions` under Details ([options page doc][c-options]) **[docs]**. The context menu's Options entry
  "will only be visible if it has an options page" ([`extension_context_menu_model.cc`][c-ctxmenu]) **[source]**.
  This repo's Chrome build declares no `action` ([`manifest.ts:67-71`][manifest-chrome]) **[source]**. That Chrome
  still gives it a toolbar icon (in the Extensions menu) to right-click is **[inferred]**, unverified.
- **`openOptionsPage()`.** "the page may be opened in a new tab, within chrome://extensions, within an App, or it may
  just focus an open options page. It will never cause the caller page to reload" ([runtime reference][c-runtime])
  **[docs]**. It navigates to `chrome://extensions?options=<id>` when embedded and to the page URL when in a tab
  ([`extension_tab_util.cc`][c-tabutil]) **[source]**.
- **Embedded caveats, quoted.** These come from the options page doc's "Consider the differences" section
  ([options page doc][c-options]) **[docs]**:
  - "Because embedded options code is not hosted in a tab, the Tabs API cannot be used. Use runtime.connect() and
    runtime.sendMessage() instead".
  - "If an extension's options page sends a message using runtime.connect() or runtime.sendMessage(), the sender's tab
    will not be set, and the sender's URL will be the options page URL."
  - "the embedded box may not find a good size for some types of content … provide fixed minimum dimensions".
- **Embedded caveats, from source** ([`extension_options_guest.cc`][c-guest], [`options_dialog.ts`][c-dialog])
  **[source]**:
  - External links and new windows open as new foreground tabs.
  - `window.close()` closes the dialog.
  - The dialog is at least 400 px wide and at most `min(0.9 × window height, 640)` px tall.

**Firefox.**

- **Manifest keys.**
  - `open_in_tab`: "If `false`, the options page opens in the browser's add-on manager … Defaults to `false`"
    ([MDN `options_ui`][f-optionsui]) **[docs]**.
  - `browser_style` defaults to `false` in MV3 from 115, and "Do not set `browser_style` to true: it's not supported
    in Manifest V3, from Firefox 118" ([MDN `options_ui`][f-optionsui]) **[docs]**.
  - `options_page` is ignored when `options_ui` is present ([MDN `options_page`][f-optionspage]) **[docs]**.
  - In source, the page is `options_ui?.page ?? options_page`, and `open_in_tab` falls back to `false`
    (`Extension.sys.mjs` l.1155–1171) **[source]**.
- **The about:addons tab** is labelled "Preferences", or "Options" on Windows (`aboutAddons.ftl` l.381–385)
  **[source]**.
- **`openOptionsPage()`.** It "opens it", and the promise rejects if the operation fails
  ([MDN `openOptionsPage`][f-openoptions]) **[docs]**. When embedded it opens `addons://detail/<id>/preferences`, and in
  a tab it uses `switchToTabHavingURI` (`ext-browser.js` l.69–96) **[source]**.
- **Embedded pages:**
  - They default to view type `tab` (`ext-browser.js` l.47–48) **[source]**.
  - A link clicked in the embedded page opens a new tab (test `browser_ext_optionsPage_links_open_in_tabs.js`)
    **[source]**.
  - The page "can use all the WebExtension APIs that the add-on has permissions for"
    ([MDN Options pages][f-optionspages]) **[docs]**.

**Orion, both builds.**

- **What Kagi says.**
  - "Orion has its own implementation of the entire WebExtensions APIs collection", "currently at about 70%", and
    options live under Tools → Extensions → Manage Extensions ([Orion macOS extensions][o-ext]) **[docs]**.
  - Kagi's support sheet ([linked from its technical page][o-tech]; [sheet][o-sheet], undated, first tab, macOS
    column) marks these "Full support" **[docs]**:
    - `runtime`: `openOptionsPage`, `sendMessage`, `connect`, `onMessage`, `onMessageExternal`, `getBrowserInfo`,
      `MessageSender.url`;
    - `tabs`: `query`, `sendMessage`, `create`;
    - `permissions`: `request`, `contains`, `onAdded`;
    - `commands`: `update`, `reset`.
  - The sheet has no rows for manifest keys (`options_ui`, `options_page`), for `permissions` `data_collection`, or for
    `commands.openShortcutSettings`.
- **What the tracker says about options pages** **[measured, third-party]**:
  - Open: #10576 (an empty settings page, reported for both the Chrome and Firefox versions of the same extension),
    #14703 (`openOptionsPage()` is a no-op from an iframed extension page) and #744 (an options tab with no address).
  - Marked done: #9733 (a blank options page), #12665 (options would not open with either build) and #1512 (a popup's
    Options button did nothing; the workaround was right-click → Options).
  - The same thread says how "both" builds were tested only for #10576 and #12665. Nobody reports `open_in_tab`
    either way.
- **How the two builds differ for an options page:**
  - **The origin.** In this repo's own probe, the AMO build's origin flipped from `moz-extension://` to
    `chrome-extension://` (same id) across a restart ([`research/orion-transport`][orion-note] §1, Orion 1.1.2)
    **[measured]**. In #5549 (2023), Orion "pretends to be Google Chrome" in the UA and in `getBrowserInfo()`; the same
    probe saw `Firefox/132.0` in the AMO build's UA **[measured]**. What `getBrowserInfo()` returns for the Firefox
    build today is unobserved, which is already an unverified premise in spec §8.4.
  - **`data_collection`.** Nothing found says whether Orion implements it.
  - **The id.** In 2023 Orion keyed Firefox extensions by "md5 of web-extension name" and ignored `gecko.id` (#4330)
    **[measured, third-party]**. Current behaviour is unverified.
  - **Sideloads.** An unpacked build's id is `md5(path)` (#411; `CLAUDE.md` → Sideload builds) **[measured]**, so the
    options page's origin, and anything stored under it, follows the folder.

---

## 2. What the page can talk to

### 2.1 The background, with `runtime` messaging

- **The browsers deliver it, with no permission.**
  - Chrome: "If sending to your extension, the runtime.onMessage event will be fired in every frame of your extension
    (except for the sender's frame)" ([runtime reference][c-runtime]) **[docs]**. An incoming event revives a dormant
    service worker ([service worker lifecycle][c-swlife]) **[docs]**.
  - Firefox: "The runtime.onMessage event will be fired in each page in your extension, except for the frame that
    called runtime.sendMessage" ([MDN `sendMessage`][f-sendmessage]) **[docs]**. An event page is restarted when an
    event it listens to fires ([MDN background scripts][f-bg]) **[docs]**.
  - Orion: "Full support" for both calls on its sheet **[docs]**.
- **This background would drop or misread the page's message today.**
  - The listener passes a message on only when `sender.tab?.id` is set, and then hands it to `transport.fromTab` as a
    tab report, keepalive or event ([`background.ts:44-51`][bg-listener]) **[source]**.
  - An embedded Chrome options page sends with "the sender's tab … not set" ([options page doc][c-options]) **[docs]**,
    so its message is dropped.
  - A page opened in a tab does carry a `sender.tab` (Chrome documents `sender.tab` as present for messages from a tab
    **[inferred]**). `fromTab` would then file the page's own tab as a game tab with an undefined state
    ([`transport.ts:79-89`][transport-fromtab]) **[source]**. That tab never counts, because only `ready` counts, but it
    would be sent to the hub.
  - Either way, a preferences message needs its own branch, told apart by message type and by `sender.url` or
    `sender.id` rather than by `sender.tab` **[inferred]**.
- **Chrome's service worker comes back knowing no tabs.** A restarted background re-learns its tabs only from the
  relays' keepalives, every 20 s ([spec §8.2][spec], [`transport.ts:78-89`][transport-fromtab]) **[source]**. If the
  page's message is what wakes the worker, the background can believe no game tab is open for up to 20 s
  **[inferred]**. Orion's backgrounds are persistent pages (§1.1), so they do not restart this way **[measured]**.

### 2.2 The relay

- **`runtime.sendMessage` never reaches it.** "extensions cannot send messages to content scripts using this method. To
  send messages to content scripts, use tabs.sendMessage" (Chrome [runtime reference][c-runtime]; MDN says the same)
  **[docs]**.
- **`tabs.sendMessage` needs no permission, but it does need a tab id.**
  - Chrome's tabs reference lists no permission for it, and says "Most features don't require any permissions"
    ([tabs reference][c-tabs]) **[docs]**. MDN names "options page scripts" as senders ([MDN `tabs.sendMessage`][f-tabssend])
    **[docs]**. The background already uses it with no `tabs` permission ([`background.ts:37-39`][bg-totab])
    **[source]**.
  - Finding the tab is the problem. `Tab.url` and `Tab.title` are "only present if the extension has the "tabs"
    permission or has host permissions for the page", and a `tabs.query` filter on them "is ignored" otherwise
    ([tabs reference][c-tabs]) **[docs]**.
  - In Chrome, content-script matches are "scriptable" hosts, not the "explicit" hosts that unhide `url`
    (`extension_tab_util.cc`, `permissions_data.cc`, `permission_set.cc`) **[source]**. So this extension cannot query
    for its pokerogue.net tab on Chrome **[inferred]**.
  - In Firefox MV3 they do count: `getManifestOrigins()` includes `content_scripts[].matches`, and they are granted at
    install as revocable host permissions (`Extension.sys.mjs` l.1263–1284, l.4416–4436; `ext-tabs-base.js`
    l.194–228) **[source]**.
  - Embedded Chrome options cannot use "the Tabs API" at all, by the doc's own words (§1.2) **[docs]**. The background
    holds the ready tab ids already ([`transport.ts:45-46`][transport-tabs]) **[source]**.
- **The relay obeys any `cmd` from inside the extension.** It answers any message shaped `{t: "cmd"}` and never looks
  at the sender ([`entrypoints/relay.ts:22-27`][relay-entry]) **[source]**. A page that held a tab id could therefore
  run commands in the tab without passing through the hub or the Firefox gate. The answer would stay inside the
  extension **[inferred]**. Other extensions cannot reach this extension's content scripts **[inferred]**: they reach
  it only through `onMessageExternal`, below.

### 2.3 The hub

- **The page counts as a browser to the hub.**
  - An options page's origin is the extension's own (`chrome-extension://…`, `moz-extension://…`).
  - The hub classes any `Origin` with an extension scheme as a browser and checks no id
    ([`hub.ts:22-29`][hub-authorize]; spec §7.4) **[source]**.
  - So a page that opened its own socket would be accepted, and would show up in the hub's `state` as one more
    extension **[inferred]**.
- **Chrome lets the page open that socket.**
  - The default MV3 page CSP is `script-src 'self';`, with no `connect-src` and no `upgrade-insecure-requests`
    ([CSP manifest doc][c-csp]; `csp_info.cc`) **[docs, source]**.
  - Chrome puts `chrome-extension://` origins in the loopback address space (`chrome_content_browser_client.cc`,
    `DetermineAddressSpaceFromURL`) **[source]**. Local Network Access checks only requests that cross into a more
    private space ([LNA guide][c-lna]) **[docs]**. So no prompt is expected **[inferred]**, consistent with the
    background's **[measured]** pass in spec §2.1.
- **Firefox lets it too, through this build's CSP override.**
  - The default MV3 CSP includes `upgrade-insecure-requests` ([MDN CSP][f-csp]) **[docs]**.
  - Firefox's WebSocket code rewrites `ws://` to `wss://` under that directive. Its loopback exemption looks at the
    document's URI, not at the target (`dom/websocket/WebSocket.cpp` l.1771–1784) **[source]**. That fits the close
    code 1015 this repo measured on the background (spec §2.1) **[measured]**.
  - The Firefox build overrides `extension_pages` to `script-src 'self'` ([`manifest.ts:76-77`][manifest-firefox])
    **[source]**. `extension_pages` covers every extension page, the options page included ([MDN CSP][f-csp])
    **[docs]**.
- **Orion:** nothing found on WebSocket or local-network rules for extension pages.
- **The extension dials only with a game tab open.**
  - `#dialIfWanted` returns while no tab is `ready` ([`transport.ts:121-123`][transport-dial]) **[source]**.
  - `PRIVACY.md` promises the traffic happens "only while a `pokerogue.net` tab is open" ([`PRIVACY.md:21-24`][privacy])
    **[source]**. That sentence is in `PRIVACY.md` and spec §6 and §8.1. The store disclosure file
    ([`store-disclosure.md`][disclosure]) does not carry it, but it links the policy.
  - A page that dialled on its own would make the promise false. A page that asks the background stays inside it
    **[inferred]**.
- **No Claude session, no hub.** Only a client (a server or the watch CLI) spawns the hub (spec §7.2). A server
  connects lazily, on its first call that needs the game ([`client.ts:61-67`][client-ready],
  [`link.ts:111-112`][link-presence]). The hub exits after 10 minutes with no clients and no counted tabs
  ([`hub.ts:332-341`][hub-idle]) **[source]**. So when no Claude session is open, or the open one has not touched the
  game yet, nothing answers on `127.0.0.1:47147`, tab or not **[inferred]**.
- **Other extensions can message ours, but only through a listener we don't have.**
  - "If the externally_connectable key is not declared in your extension's manifest, all extensions can connect"
    ([Chrome `externally_connectable`][c-extconn]) **[docs]**. Firefox has the same default
    ([MDN `externally_connectable`][f-extconn]) **[docs]**.
  - Such messages fire `runtime.onMessageExternal` and not `onMessage` ([runtime reference][c-runtime]) **[docs]**. This
    background registers no `onMessageExternal` ([`background.ts`][bg-listener]) **[source]**.
  - So another extension cannot reach our background or the page. It can reach the hub directly, as in the first
    bullet **[inferred]**.

---

## 3. What the hub would need to answer a question

### 3.1 The hub's contract today

- **A router that knows nothing.** The hub "knows nothing about the game and caches nothing"
  ([`hub.ts:1-4`][hub-head]). Spec §7.1 adds: "A thin router. It routes commands between one client and one tab,
  counts tabs across every browser, holds the driver grant, and fans out events." **[source]**
- **Request and reply exist, but only one way round.**
  - A client asks and a tab answers: `cmd` goes client → hub → extension and `reply` comes back
    ([`hub.ts:257-286`][hub-route], [`:186-193`][hub-frombrowser]). A client can also ask the hub itself, with `state`
    and `claim` **[source]**.
  - **Nothing on the extension's side asks.** An extension may send `hello`, `tab`, `consent`, `ping`, `reply` and
    `event`, and the hub sends it only `welcome`, `cmd` and the dev build's `dev-reload`
    ([`wire.ts:51-52`][wire-ext]) **[source]**. `welcome` is the only frame the hub ever sends because an extension
    spoke.
- **Unknown frames are dropped without a word.** `#fromBrowser` and `#fromClient` are switches with no `default`
  ([`hub.ts:170-237`][hub-frombrowser]), and anything that isn't JSON with a string `t` is ignored
  ([`hub.ts:353-361`][hub-parse]) **[source]**. So a hub older than a new settings frame never answers it, and the
  asker needs its own timeout. That is the "plugin too old" state from #820's triage.
- **The session does not choose which hub answers.** One hub runs per port per machine. A newer client retires an older
  hub only while no driver holds the grant; otherwise the older one stays (spec §7.3) **[source]**. A hub that
  answered for `settings.json` would be whichever plugin copy spawned it **[inferred]**.
- **The hub's environment is its spawner's.** `spawnHub` calls `spawn(process.execPath, [entry, "--port", …],
  { detached: true, stdio: […] })` with no `env` ([`client.ts:274-277`][client-spawn]) **[source]**. So the hub
  inherits the first spawning client's environment, `COACHEMON_HOME` included **[inferred]**. Today the hub never reads
  the home.

### 3.2 `settings.json`, `readSettings` and `writeSettings`

- **Where:** `path.join(home, "settings.json")` ([`settings.ts:6`][settings]). `home` is `coachemonHome()`, which is
  `COACHEMON_HOME`, or else `~/.coachemon` ([`home.ts:4-6`][home]) **[source]**.
- **What:** `type Settings = { solving: boolean }` ([`settings.ts:4`][settings]) **[source]**.
- **Read:** it returns `{ solving: stored.solving === true }`. Any error (no file, bad JSON, a half-written file)
  returns `{ solving: false }` ([`settings.ts:8-15`][settings]) **[source]**.
- **Write:** it creates the home, then overwrites the whole file with `JSON.stringify(settings)` and a newline using
  `writeFileSync` ([`settings.ts:17-20`][settings]) **[source]**. It does no merge and no temp-file-and-rename. Three
  consequences **[inferred]**:
  - Two writers race, and the last one wins.
  - A reader that catches a write half-done reads `solving: false`.
  - Once a second setting joins (capture, #787), a writer that passes only `{ solving }` drops it.

  None of this matters while the tool is the only writer. All of it does if the hub writes too.
- **Who reads and writes it today:**
  - The `solving` MCP tool writes the file, then reads it back ([`driver.ts:153-157`][driver-solving]) **[source]**.
  - `startJob` re-reads it before every solving job, and refuses with `solving_off` when solving is off
    ([`driver.ts:270-273`][driver-startjob]) **[source]**. So a value written by anything else takes effect at the next
    job start.
- **The tool's consent wording:** "Turning it on costs about 0.6 GB of disk, a one-time setup and minutes of CPU per
  fight: tell the player that and turn it on only on their yes" ([`tools.ts:152`][tools-solving]) **[source]**.

### 3.3 What answering would add, read off the code

These describe what the code would have to grow. None of them is a design **[inferred]**.

- **New frames.** An extension → hub request frame with an id, for a read and for a write with a value, and a hub →
  extension reply keyed by it. `wire.ts` has neither.
- **If the hub answers:** the hub imports `settings.ts` and resolves a home. Today it imports only `node:http`, `ws` and
  the protocol modules ([`hub.ts:5-11`][hub-head]). This is the widening of the routes-only contract that #820's triage
  named. `settings.json` is not game state, but it is state the hub would own.
- **If a server answers:** the hub needs a hub → client request frame and a rule for which client answers. `ToClient`
  has no request frame ([`wire.ts:82`][wire-client]).
- **The protocol window doesn't cover it.** Spec §10.7 bumps `PROTOCOL` for removing or renaming a command, or for
  changing what a field means, and not for adding one. A new frame type is not a command, so the rule is silent. What
  the page would actually meet is an older hub ignoring the frame (§3.1).
- **Both hubs.** The store hub (47147) and the dev hub (47148) would both read the same `settings.json` whenever they
  share a home (spec §5.4, §7.2).

---

## 4. Firefox's data-consent gate

**In the code:**

- **The gate is one check in the background's transport.**
  - `#send`, which carries every frame but the hello, returns unless the socket is live and consent is held
    ([`transport.ts:241-245`][transport-send]) **[source]**.
  - The hello goes out through `#raw` with `consent: false` ([`transport.ts:134-148`][transport-opened]) **[source]**.
  - **So does the keepalive.** `#ping` calls `#raw`, so an unconsented Firefox sends the hello and then a contentless
    `{"t":"ping"}` every 20 s after the welcome ([`transport.ts:175-179`][transport-ping]) **[source]**. Spec §8.4's
    list of what waits ("no `tab` frames, no replies and no events") is exact. "Nothing but the hello" leaves out the
    ping.
- **Consent is the browser's own state.** `startConsent` grants at once on Chrome and Safari, and on the Firefox build
  whenever `getBrowserInfo()` does not say `Firefox` (Orion, an unverified premise). On Firefox it listens to
  `action.onClicked` → `permissions.request({ data_collection: ["websiteContent"] })`, and checks
  `permissions.contains` once at start ([`consent.ts:20-27`][consent]) **[source]**. **It does not listen to
  `permissions.onAdded`.** So a grant made anywhere but the toolbar click reaches the transport only at the next
  background start **[inferred]**.
- **What that means for traffic that starts on the options page** **[inferred]**:
  - A frame the page hands the background, which the background sends through `#send`, is gated like any other.
  - A frame sent through `#raw` is not gated.
  - A page that opened its own socket (§2.3) passes no gate at all.
  - The gate belongs to the transport object, not to the extension.
- **Extension-origin storage has precedent here.** Before #380 (commit `d645f9e6`), the Firefox 128–139 consent path
  recorded the click "in the extension origin's own `localStorage` — no `storage` permission, and the Firefox build's
  background is an event page, so it has one". That is the comment `d645f9e6` removed from `consent.ts`, added in
  `a0de1552` (#203) **[source]**. It passed the guard, because the guard reads only the manifest (§5.1).

**In the browser and the policy:**

- **The options page could ask for consent itself.**
  - `permissions.request` "may only be called from a user input handler" (`permissions.json` `requireUserInput`,
    `ExtensionCommon.sys.mjs`) **[source]**.
  - User actions include "Clicking a button on a page bundled with the extension". A handler that awaits a promise
    first loses that status ([MDN user actions][f-useractions]) **[docs]**.
  - Requests from options pages embedded in `about:addons` have worked since Firefox 61 (bug 1382953, fixed)
    **[docs]**.
  - So a synchronous click handler on an options-page button can ask for `data_collection`, embedded or in a tab
    **[inferred]**. A type that is already granted returns `true` with no prompt (`ext-permissions.js`) **[source]**.
    `permissions.onAdded` fires on `data_collection` changes **[source]**.
- **What counts as collection.**
  - "data transmission refers to any data that is collected, used, transferred, shared, or handled outside of the
    add-on or the local browser" ([add-on policies][f-policy] §6) **[docs]**.
  - "If the add-on uses native messaging, the Add-on Policies … apply to any data sent to the native application as
    well" ([add-on policies][f-policy] §6) **[docs]**.
  - Neither the policy nor the [consent page][f-consent] mentions localhost or `127.0.0.1` **[docs]**. Treating the
    hub socket like native messaging is a reading, not Mozilla's text **[inferred]**.
- **The category a setting would fall under.** `technicalAndInteraction` covers "Device and browser info, extension
  usage and settings data, crash and error reports". It "cannot be required", and it is opt-out
  ([consent page][f-consent]; [policies][f-policy] §6.2.2.3) **[docs]**. This build declares
  `{ required: ["none"], optional: ["websiteContent"] }` ([`manifest.ts:26`][manifest-dcp]), the same answer filed on
  AMO ([`store-disclosure.md:40`][disclosure]) **[source]**.
- **Orion:** nothing found on `data_collection_permissions` or `permissions.request({ data_collection })`.

**So, for point 4** **[inferred]**:

- In code, the gate covers whatever the background sends through `#send`, wherever it started, and nothing else.
- In policy, whether a settings value sent to the hub is "collection" at all, and under which category, is not settled
  by Mozilla's text.

---

## 5. The store manifest guard, and where a key binding could live

### 5.1 What the guard allows

- **The lists.** `BANNED_MANIFEST_KEYS` = `permissions`, `optional_permissions`, `host_permissions`,
  `optional_host_permissions`. `BANNED_MANIFEST_WORDS` = `nativeMessaging`, `scripting`, `tabs`, `storage`,
  `activeTab`, `<all_urls>` ([`manifest.ts:30-32`][manifest-banned]) **[source]**.
- **The word check is a substring test on the serialised manifest.** It runs
  `JSON.stringify(manifest).includes(word)` ([`guard.test.ts:108-114`][guard-manifest]) **[source]**. So:
  - `options_ui` passes;
  - `open_in_tab` passes, because it contains `tab` and not `tabs`;
  - a page file named, say, `storage.html` or `tabs.html` would fail.
- **What WXT writes for an options entrypoint.** WXT 0.21.4 is the version in `extension/package-lock.json`. It writes
  ([`dist/core/utils/manifest.mjs` l.152–159][wxt-options]) **[source]**:
  - `open_in_tab`, from `openInTab` or else `false`, on every target but Safari;
  - `browser_style`, on Firefox only, and `chrome_style`, everywhere but Firefox, each dropped when unset;
  - `page: "options.html"`.

  No permission is added, and nothing in it is banned. Setting `chromeStyle` would break the Chrome build (§1.2).
- **The file check applies to the options page too.** It bans `47148`, `eval(`, `new Function(`, `Function(`,
  `screenshot`, `captureVisibleTab`, `executeScript`, `runtime.reload` and `dev-reload` in every store file, the options
  page's included ([`guard.test.ts:16`][guard-files], [`:116-122`][guard-manifest]) **[source]**.
- **`localStorage` and `indexedDB` are banned nowhere.** The `storage` ban covers the manifest's text only.
- **The privacy promises are narrower than the guard.**
  - `PRIVACY.md` says "Two entries, on your own machine, both in the page's `localStorage`" and "no storage permission"
    ([`PRIVACY.md:43-51`, `:60-63`][privacy]) **[source]**.
  - The store disclosure files the same two entries ([`store-disclosure.md:17`][disclosure]) **[source]**.
  - A third entry, wherever it is kept, makes "two entries" false until both are amended **[inferred]**. "No storage
    permission" stays true.

### 5.2 Places a binding could live without `storage`

The page-level key is a listener the panel owns. It runs in pokerogue.net's MAIN world, so whatever stores the binding
has to get it into that tab **[source]** (spec §4, §9).

| Where | Permission | Who can read it | Survives | Notes |
|---|---|---|---|---|
| **pokerogue.net's own `localStorage`**, next to `coach-hud-panel` | none; it is already used ([spec §6, §11.4][spec]) **[source]** | The panel, directly. The options page only through background → relay → page, and only while a game tab is open **[inferred]**. Any script in the page can also read and change it (spec §9.5) **[source]** | Clearing pokerogue.net's site data, which also takes the game's own saves **[inferred]** | [#405](https://github.com/IIxauII/coachemon/issues/405) held "the panel's persisted state stays the three fields it already has", which the map lists as likely to break |
| **Extension-origin `localStorage`** | none **[docs]** | Extension pages on every engine. Firefox's background, an event page with a DOM **[docs]**. Not Chrome's service worker: "The Web Storage API is not available for extension service workers" ([lifecycle][c-swlife]) **[docs]**. Orion's backgrounds have a `document` **[measured]**, so probably **[inferred]**. Not content scripts, which "share storage with the host page" ([storage reference][c-storage]) **[docs]** | See §5.3 | Chrome's own docs advise against it ([storage reference][c-storage]) **[docs]** |
| **Extension-origin IndexedDB** | none **[docs]** | Chrome: "accessible in service workers" and in extension pages ([storage and cookies][c-storagecookies]) **[docs]**. Firefox: pages and the background **[inferred]**. Orion: nothing found | See §5.3 | The one no-permission store that both the page and Chrome's service worker can read **[inferred]** |
| **`settings.json` under the home** | none in the manifest | The hub or a server, through a new request and reply (§3.3) | Everything short of deleting the file | Needs a hub, so a Claude session (§2.3) |
| **The browser's own shortcut store** (`manifest.commands`) | none | Firefox can write it with `commands.update()` and `reset()` (60+), open its page with `openShortcutSettings()` (137+) and watch it with `onChanged` (115+) ([BCD][bcd-commands]) **[docs]**. Chrome has only `getAll()` and `onCommand`, plus the `chrome://extensions/shortcuts` page, which an extension page may open with `tabs.create` and no permission (`extension_tab_util.cc` rejects only `javascript:`, `devtools:`, `chrome-untrusted:`, `chrome://feedback` and file URLs without access) **[docs, source]**. Orion's sheet claims `update` and `reset` **[docs]**; its Manage Shortcuts panel *adds* a shortcut rather than replacing one (#11266) **[measured, third-party]** | The browser's profile | Binds a `manifest.commands` chord only, never a page-level key |

### 5.3 How long extension-origin storage lasts, per engine

- **Clearing browsing data, Chrome.**
  - **Chrome's docs disagree.** The storage reference (updated 2026-10-29) says "Data saved using the Web Storage API
    is lost when the user clears their browsing history" ([storage reference][c-storage]). The storage-and-cookies page
    (2023-09-28) says "Extension storage is not cleared when a user clears browsing data. This applies to any data
    stored using web storage APIs (such as Local Storage and IndexedDB)" ([storage and cookies][c-storagecookies])
    **[docs]**.
  - **The source sides with "not cleared".** The settings dialog removes only web origins
    (`settings_clear_browsing_data_handler.cc`). Extension origins match only with `ORIGIN_TYPE_EXTENSION`
    (`chrome_browsing_data_remover_delegate.cc` l.263–266) **[source]**. Not run.
- **Clearing browsing data, Firefox.**
  - **MDN says it can be cleared.** "Firefox clears data stored by extensions using the localStorage API in various
    scenarios where users clear their browsing history and data" ([MDN `storage.local`][f-storagelocal]) **[docs]**.
  - **Current source skips extension origins on "clear all".** `ClearDataService` "clear all" clears only `http`,
    `https` and `file` principals (l.951–956). The old extension localStorage purge returns early under next-gen
    localStorage, which is on by default (`StorageObserver.cpp` l.313–316, `StaticPrefList.yaml` l.5618–5620)
    **[source]**. MDN's warning looks older than that **[inferred]**. Clearing one site was not traced.
- **Eviction.**
  - Chrome: "Storage can also be evicted under heavy memory pressure, although this is rare". The remedies are
    `unlimitedStorage`, which is banned, or `navigator.storage.persist()` ([storage and cookies][c-storagecookies])
    **[docs]**.
  - Firefox never evicts default-persistence data of a `moz-extension` origin (`dom/quota/ActorsParent.cpp`
    ~l.2189–2201) **[source]**.
- **Uninstall and reinstall.**
  - Uninstall wipes the origin's data on Chrome (`data_deleter.cc`) and on Firefox, where IndexedDB and localStorage go
    and the UUID is dropped (`Extension.sys.mjs` l.588–653) **[source]**.
  - On reinstall, Firefox's UUID "is randomly generated for every browser instance"
    ([MDN `web_accessible_resources`][f-war]) **[docs]**, so the origin is new and empty **[inferred]**.
  - Chrome derives an unpacked extension's id from its folder path (`extension.cc` l.159–179) **[source]**.
- **Private windows.** Chrome's default `spanning` mode runs the extension's pages in the regular profile
  ([incognito][c-incognito]) **[docs]**. Firefox runs no extension in private windows by default and has no split
  mode ([MDN `incognito`][f-incognito]) **[docs]**.
- **Orion.**
  - **The origin itself can change.** The AMO build's origin flipped scheme across a restart in this repo's probe
    (§1.2) **[measured]**. Storage keyed by origin would then start empty **[inferred]**. This is untested.
  - **The tracker has a long run of extension settings lost** **[measured, third-party]**:
    - across restarts, for both Chrome and Firefox builds (#5415, 2023, Done);
    - after an update (#7893, 2024, Done);
    - on "Clear browsing data" (#3233, 2022, Under Review);
    - and still open (#10348, 2025, Planned; #6795, 2023, Under Review).
  - Most of these are about `storage.*`, or don't say. None names `localStorage` or IndexedDB in an extension page on
    macOS.

---

## 6. What #820's four open questions now rest on

Facts only. Each question is #820's as carried into
[#1020](https://github.com/IIxauII/coachemon/issues/1020).

**Who reads and writes `settings.json` behind the page?**

- No browser part can touch the file: no file access, no native messaging (spec §6). Only a Node process can.
- The hub has no settings code. It imports only `node:http`, `ws` and the protocol modules. It inherits its home from
  whichever client spawned it, and may be an older plugin copy than the session's (§3.1).
- `writeSettings` overwrites the whole file without a temp-file-and-rename, and `readSettings` turns any error into
  `false` (§3.2).
- Servers re-read the file at every job start (§3.2).
- No frame from the extension asks anything, and older hubs drop unknown frames without a word (§3.1).
- A server answering would need a hub → client request frame and a rule for which client (§3.3).

**Can the page connect with no game tab open?**

- The extension dials only while a ready tab exists, and `PRIVACY.md` promises exactly that (§2.3).
- The page's own origin would be accepted by the hub. Chrome's CSP and Local Network Access don't block it. Firefox's
  build CSP already strips the upgrade that breaks `ws://` (§2.3).
- With no Claude session that has touched the game, there is no hub to reach (§2.3).
- Chrome's service worker can wake for the page knowing no tabs for up to 20 s (§2.1).
- Today's background drops or misfiles a message from the page (§2.1).

**May any installed extension change `solving`?**

- The hub accepts any extension-scheme `Origin` and checks no id (§2.3; spec §7.4).
- Spec §1 principle 5 already places "other installed extensions … outside the model, because the vocabulary is closed
  and never carries typed form text". A settings write would be the first frame from the browser side that changes
  something outside the tab **[inferred]**.
- Other extensions cannot reach our background or page, only the hub (§2.3).
- Any process run by the same user can already write `settings.json` directly **[inferred]**.
- Web pages are refused by the `Origin` check (spec §7.4).
- Turning solving on costs about 0.6 GB of disk, a one-time setup and minutes of CPU per fight
  ([`tools.ts:152`][tools-solving]).

**Does Firefox's data-consent gate apply to the page?**

- The gate covers what the background sends through `#send`, and the hello and ping go out regardless (§4).
- A socket the page opened itself passes no gate (§4).
- An options-page button can call `permissions.request({ data_collection })`, but `consent.ts` would not hear the grant
  until the next background start (§4).
- Mozilla's policy doesn't say whether a value sent to a local program over `127.0.0.1` is collection. If it is, a
  setting fits `technicalAndInteraction`, which cannot be required (§4).
- On Orion, the Firefox build counts as consented only if `getBrowserInfo()` does not say `Firefox`, which was never
  observed (spec §8.4).

**And the fifth, browser support:** Chrome and Firefox are documented and sourced (§1). Orion's options pages have
open reports of empty pages on both builds and no word on `open_in_tab` (§1). A hand check settles it.

---

## 7. What the probe build should confirm by hand

For [#1018](https://github.com/IIxauII/coachemon/issues/1018), whose options page has a dummy `solving` switch, "shows it
opened and on which engine" and writes nothing.

1. **That it opens, on each engine and build:** Chrome, Firefox, Orion with the Chrome-flavoured build, and Orion with
   the Firefox build. Try:
   - the browser's extension page: `chrome://extensions` → Details → Extension options; `about:addons` → Preferences;
     Orion's Tools → Extensions → Manage Extensions;
   - the toolbar icon's context menu → Options. Chrome's build declares no `action`, so record whether there is an icon
     to right-click at all;
   - `runtime.openOptionsPage()`, called from the background.

   For each, record embedded or tab, and blank or drawn. Orion #10576 is a blank page.
2. **What the page draws about where it runs:**
   - `location.origin`, and with it the scheme, which can flip on Orion's Firefox build across a restart;
   - `navigator.userAgent`, `runtime.getBrowserInfo?.()` and `typeof window.KAGI`, which is Kagi's documented Orion
     check ([Orion technical][o-tech]). The `getBrowserInfo` answer on Orion's Firefox build is spec §8.4's unverified
     premise.
3. **Whether the background hears the page:** a `runtime.sendMessage` round trip, and whether `sender.tab` is set. It
   should be unset when embedded on Chrome.
4. **Only if #1018 lets the page store a dummy value**, which goes beyond "writes nothing": does a key in extension
   `localStorage` and IndexedDB survive closing and reopening the page, an Orion restart (both builds), and a build
   swapped into the folder already loaded? And can the background read the IndexedDB value back? On Chrome that is the
   service worker, which has no `localStorage`. No source settles any of this for Orion (§5.3).
5. **Only if the page dials the hub itself:** that the WebSocket opens on Firefox under the build's CSP override (§2.3).
   The page can't use that route without breaking the `PRIVACY.md` promise, so it settles nothing #1020 needs unless
   that promise is reopened.

---

## Sources

**This repo, at [`a25d4635`][repo]**

- `src/hub/hub.ts`: [head][hub-head], [authorize][hub-authorize], [`#fromBrowser`/`#fromClient`][hub-frombrowser], [`#route`][hub-route], [`#checkIdle`][hub-idle], [`parse`][hub-parse]
- `src/hub/client.ts`: [`ready`][client-ready], [`spawnHub`][client-spawn]; `src/hub/link.ts`: [`presence`][link-presence]
- `src/protocol/wire.ts`: [extension frames][wire-ext], [client frames][wire-client]
- [`src/settings.ts`][settings], [`src/home.ts`][home], `src/driver.ts` [`solving`][driver-solving] and [`startJob`][driver-startjob], [`src/tools.ts`][tools-solving]
- `extension/entrypoints/background.ts`: [listener][bg-listener], [`toTab`][bg-totab]; [`extension/entrypoints/relay.ts`][relay-entry]
- `extension/src/transport/transport.ts`: [tabs][transport-tabs], [`fromTab`][transport-fromtab], [`#dialIfWanted`][transport-dial], [`#opened`][transport-opened], [`#ping`][transport-ping], [`#send`][transport-send]
- [`extension/src/transport/consent.ts`][consent]; commits `a0de1552` (#203) and `d645f9e6` (#380, the removed `localStorage` consent path)
- `extension/src/build/manifest.ts`: [data collection][manifest-dcp], [banned lists][manifest-banned], [Chrome][manifest-chrome], [Firefox][manifest-firefox]
- `extension/test/guard.test.ts`: [file check][guard-files], [manifest check][guard-manifest]
- [`PRIVACY.md`][privacy], [`docs/listing/store-disclosure.md`][disclosure], [`docs/spec/extension-distribution.md`][spec] (§1, §2.1, §4, §5.3–§5.5, §6, §7, §8, §9, §10.7, §11.4, §16), `CONTEXT.md`
- [`research/orion-transport`][orion-note] (Orion 1.1.2, 2026-09-16)
- WXT 0.21.4: [`dist/core/utils/manifest.mjs`][wxt-options]

**Chrome**

- Docs: [options page][c-options], [runtime][c-runtime], [tabs][c-tabs], [storage][c-storage], [storage and cookies][c-storagecookies], [service worker lifecycle][c-swlife], [CSP][c-csp], [`externally_connectable`][c-extconn], [incognito][c-incognito], [Local Network Access][c-lna], [commands](https://developer.chrome.com/docs/extensions/reference/api/commands)
- Source, `chromium/src` at `e6dce90d6634`: [`options_page_info.cc`][c-optinfo], [`extension_tab_util.cc`][c-tabutil], [`extension_options_guest.cc`][c-guest], [`options_dialog.ts`][c-dialog], [`extension_context_menu_model.cc`][c-ctxmenu], [`permissions_data.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/extensions/common/permissions/permissions_data.cc), [`permission_set.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/extensions/common/permissions/permission_set.cc), [`csp_info.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/extensions/common/manifest_handlers/csp_info.cc), [`chrome_content_browser_client.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/chrome_content_browser_client.cc), [`chrome_browsing_data_remover_delegate.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/browsing_data/chrome_browsing_data_remover_delegate.cc), [`settings_clear_browsing_data_handler.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/ui/webui/settings/settings_clear_browsing_data_handler.cc), [`data_deleter.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/extensions/data_deleter.cc), [`extension.cc`](https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/extensions/common/extension.cc); at `e58a1eb3d829`: [`tabs_api.cc`](https://chromium.googlesource.com/chromium/src/+/e58a1eb3d829feccb02c7c43f4f9ca190aefc5f6/chrome/browser/extensions/api/tabs/tabs_api.cc), [`extension_tab_util.cc`](https://chromium.googlesource.com/chromium/src/+/e58a1eb3d829feccb02c7c43f4f9ca190aefc5f6/chrome/browser/extensions/extension_tab_util.cc)

**Firefox**

- MDN: [`options_ui`][f-optionsui], [`options_page`][f-optionspage], [Options pages][f-optionspages], [`openOptionsPage`][f-openoptions], [`runtime.sendMessage`][f-sendmessage], [`tabs.sendMessage`][f-tabssend], [`tabs.Tab`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab), [background scripts][f-bg], [CSP][f-csp], [`externally_connectable`][f-extconn], [`storage.local`][f-storagelocal], [`web_accessible_resources`][f-war], [`incognito`][f-incognito], [`browser_specific_settings`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings), [user actions][f-useractions], [`commands.openShortcutSettings`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/commands/openShortcutSettings), [`commands.update`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/commands/update)
- Extension Workshop and add-ons blog: [built-in data consent][f-consent], [add-on policies][f-policy], [data collection consent changes (2025-10-23)](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/)
- BCD: [commands][bcd-commands], [permissions](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/permissions.json)
- Bugzilla: [1447784](https://bugzilla.mozilla.org/show_bug.cgi?id=1447784) (upgrade-insecure-requests spares 127.0.0.0/8 for HTTP), [1382953](https://bugzilla.mozilla.org/show_bug.cgi?id=1382953) (permission requests from embedded options pages)
- Source, [`mozilla-firefox/firefox`](https://github.com/mozilla-firefox/firefox/tree/b42441b06bc2b98160f12ee2dff262dd55583a9f) at `b42441b06bc2`: `toolkit/components/extensions/Extension.sys.mjs`, `browser/components/extensions/parent/ext-browser.js`, `toolkit/components/extensions/parent/ext-tabs-base.js`, `toolkit/locales/en-US/toolkit/about/aboutAddons.ftl`, `browser/components/extensions/test/browser/browser_ext_optionsPage_links_open_in_tabs.js`, `modules/libpref/init/all.js`, `modules/libpref/init/StaticPrefList.yaml`, `dom/base/Document.cpp`, `dom/websocket/WebSocket.cpp`, `netwerk/base/nsNetUtil.cpp`, `toolkit/components/cleardata/ClearDataService.sys.mjs`, `dom/storage/StorageObserver.cpp`, `dom/quota/ActorsParent.cpp`, `dom/quota/OriginInfo.cpp`; and `main` as of 2026-11-08 for `toolkit/components/extensions/parent/ext-permissions.js`, `toolkit/components/extensions/schemas/permissions.json`, `toolkit/components/extensions/ExtensionCommon.sys.mjs`, `toolkit/components/extensions/ExtensionShortcuts.sys.mjs`

**Orion**

- Kagi: [macOS extensions][o-ext], [technical notes][o-tech], [supported-API sheet][o-sheet], [release notes](https://browser.kagi.com/updates/orion-release-notes.html)
- orionfeedback.org threads (`https://orionfeedback.org/d/<id>`): 744, 1512, 3233, 4330, 5415, 5549, 6795, 7893, 9733, 10348, 10576, 11266, 11976, 12665, 14703

[repo]: https://github.com/IIxauII/coachemon/tree/a25d4635f8f42dc2091104ac9c607bea915ee7b0
[hub-head]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/hub.ts#L1-L11
[hub-authorize]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/hub.ts#L22-L29
[hub-frombrowser]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/hub.ts#L170-L237
[hub-route]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/hub.ts#L257-L286
[hub-idle]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/hub.ts#L332-L341
[hub-parse]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/hub.ts#L353-L361
[client-ready]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/client.ts#L61-L67
[client-spawn]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/client.ts#L274-L277
[link-presence]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/hub/link.ts#L111-L112
[wire-ext]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/protocol/wire.ts#L51-L52
[wire-client]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/protocol/wire.ts#L81-L82
[settings]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/settings.ts#L1-L20
[home]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/home.ts#L4-L6
[driver-solving]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/driver.ts#L153-L157
[driver-startjob]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/driver.ts#L270-L273
[tools-solving]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/src/tools.ts#L152
[bg-listener]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/entrypoints/background.ts#L44-L51
[bg-totab]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/entrypoints/background.ts#L37-L39
[relay-entry]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/entrypoints/relay.ts#L22-L27
[transport-tabs]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/transport.ts#L45-L46
[transport-fromtab]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/transport.ts#L78-L89
[transport-dial]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/transport.ts#L121-L132
[transport-opened]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/transport.ts#L134-L148
[transport-ping]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/transport.ts#L175-L179
[transport-send]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/transport.ts#L241-L245
[consent]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/transport/consent.ts#L1-L27
[manifest-dcp]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/build/manifest.ts#L22-L26
[manifest-banned]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/build/manifest.ts#L30-L32
[manifest-chrome]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/build/manifest.ts#L67-L71
[manifest-firefox]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/src/build/manifest.ts#L72-L88
[guard-files]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/test/guard.test.ts#L15-L16
[guard-manifest]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/extension/test/guard.test.ts#L108-L125
[privacy]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/PRIVACY.md
[disclosure]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/docs/listing/store-disclosure.md
[spec]: https://github.com/IIxauII/coachemon/blob/a25d4635f8f42dc2091104ac9c607bea915ee7b0/docs/spec/extension-distribution.md
[orion-note]: https://github.com/IIxauII/coachemon/blob/research/orion-transport/docs/research/orion-transport.md
[wxt-options]: https://unpkg.com/wxt@0.21.4/dist/core/utils/manifest.mjs
[c-options]: https://developer.chrome.com/docs/extensions/develop/ui/options-page
[c-runtime]: https://developer.chrome.com/docs/extensions/reference/api/runtime
[c-tabs]: https://developer.chrome.com/docs/extensions/reference/api/tabs
[c-storage]: https://developer.chrome.com/docs/extensions/reference/api/storage
[c-storagecookies]: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
[c-swlife]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
[c-csp]: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
[c-extconn]: https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable
[c-incognito]: https://developer.chrome.com/docs/extensions/reference/manifest/incognito
[c-lna]: https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access
[c-optinfo]: https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/extensions/common/manifest_handlers/options_page_info.cc
[c-tabutil]: https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/extensions/extension_tab_util.cc
[c-guest]: https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/extensions/browser/guest_view/extension_options/extension_options_guest.cc
[c-dialog]: https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/resources/extensions/options_dialog.ts
[c-ctxmenu]: https://chromium.googlesource.com/chromium/src/+/e6dce90d6634cf4865bed557e42423e427e1d0e5/chrome/browser/extensions/extension_context_menu_model.cc
[f-optionsui]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/options_ui
[f-optionspage]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/options_page
[f-optionspages]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Options_pages
[f-openoptions]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/openOptionsPage
[f-sendmessage]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage
[f-tabssend]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/sendMessage
[f-bg]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
[f-csp]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy
[f-extconn]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable
[f-storagelocal]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local
[f-war]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources
[f-incognito]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito
[f-useractions]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/User_actions
[f-consent]: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
[f-policy]: https://extensionworkshop.com/documentation/publish/add-on-policies/
[bcd-commands]: https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/commands.json
[o-ext]: https://help.kagi.com/orion/browser-extensions/macos-extensions.html
[o-tech]: https://help.kagi.com/orion/misc/technical.html
[o-sheet]: https://docs.google.com/spreadsheets/d/14IgSRVop4psUTgtLZlvYJYrAArhvL3WvRlUdzdQbIoQ/edit
