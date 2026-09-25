# Does a browser shortcut reach the panel with no permissions

Research for [#392](https://github.com/IIxauII/coachemon/issues/392), a child of [#391](https://github.com/IIxauII/coachemon/issues/391)
*Operate the coach panel from the keyboard*. Read by [#397](https://github.com/IIxauII/coachemon/issues/397), which settles where the
key handling lives.

Facts are tagged as `docs/spec/extension-distribution.md` tags them: **[doc]** from a vendor's own documentation, **[live]** observed
on a real browser with the version named, **[unverified]** otherwise. Nothing here was exercised against a `commands` entry — no build
declares one — so every claim *about `commands`* is **[doc]**. The delivery half is **[live]**, because the transport already makes
exactly that hop on three of the four targets.

---

## 1. The answer

**Yes on Chrome, Firefox and Orion. On Safari, yes for the key and no for the rebinding, below Safari 26.**

A manifest `commands` entry costs no permission on any target: it is a manifest key, like `content_scripts`, and the four manifests
already declare manifest keys. The grab key arrives in the background, and the background already reaches the panel — the store build
has been calling `tabs.sendMessage` into the relay with no `permissions` and no `host_permissions` since it shipped. Nothing new is
spent, nothing banned by §5.5 is named, and the `commands` key trips no word the guard bans.

The one target where the premise breaks is Safari. `browser.commands` works there from Safari 14 **[doc]**, but *changing* the
shortcut was not supported until **Safari 26** **[doc]** — and the store manifest's Safari floor is `18.0` (§5.3). A player on
Safari 18–18.6 gets whatever `suggested_key` says and has no way to change it. That is not a reason to abandon the approach; it is a
reason for the Safari floor to be re-argued, or for the feature to be declared Safari-26-and-up.

---

## 2. What the repo already proves, before any vendor doc

The load-bearing half of the question — *can the background deliver a message to a content script with no permissions* — is not
hypothetical here. It is the extension's whole transport.

- `extension/entrypoints/background.ts` forwards every command with
  `toTab: (tab, message) => Promise.resolve(browser.tabs.sendMessage(tab, message))`, under a comment that already states the finding:
  *"No `tabs` permission: a tab we have a content script in is addressable by id anyway (§8.3)."*
- §8.3 of the spec says the same: *"Background → tab: `tabs.sendMessage(tab, {t:"cmd", id, name, args})`, with no `tabs` permission."*
- The upward direction keys on `sender.tab?.id` in `runtime.onMessage`, also with no permission, and `browser.tabs.onRemoved` is
  registered with no permission.
- §2's transport pass bar — *the hub delivers a command to an open `pokerogue.net` tab within about 1 s after 5 or more minutes idle* —
  is recorded **[live]** on Chrome 153, Firefox 156 and Orion 1.1.2. Each of those passes is a `tabs.sendMessage` from a torn-down or
  idle background into a content script, from a manifest with no permissions at all.

So for Chrome, Firefox and Orion the delivery leg is **[live]** and already in production. The only untested leg is the one *before*
it: `commands.onCommand` firing at all.

`extension/src/build/manifest.ts` bans the words `nativeMessaging`, `scripting`, `tabs`, `storage`, `activeTab` and `<all_urls>` from
the store manifest, and `extension/test/guard.test.ts` enforces that against `JSON.stringify(manifest)`. A `commands` entry contains
none of those words, so **adding `commands` does not trip §5.5 check 1** — provided the command's `description` string avoids them too,
which is free.

---

## 3. `commands` is a manifest key, not a permission

| Target | `commands` manifest key | `commands.onCommand` | Source |
|---|---|---|---|
| Chrome | 25+ | 25+ | Chrome docs; MDN BCD **[doc]** |
| Firefox | 48+ (desktop; **not** Firefox for Android) | 48+ | MDN BCD **[doc]** |
| Safari | 14+, but **rebinding only from 26** | 14+ | MDN BCD, Apple release notes **[doc]** |
| Orion (macOS) | full support, `update`/`reset` included | full support | Kagi's own API sheet **[doc]** |

Chrome's reference states the requirement plainly: *"The following keys must be declared in the manifest to use this API:
`"commands"`"* — a manifest key, with no accompanying `permissions` entry. MDN lists the `commands` key as `Mandatory: No`,
`Manifest version: 2 or higher`, with no permission attached.

Firefox for Android is `false` in BCD for the whole `commands` API **[doc]**. This costs nothing: the add-on is deliberately
desktop-only (§5.3, no `gecko_android` key).

Orion's own support sheet (linked from `help.kagi.com/orion/misc/technical.html`) lists, for Orion macOS, `commands.Command`,
`commands.getAll`, `commands.onCommand`, `commands.reset` and `commands.update` as *Full support*, and `tabs.sendMessage` as *Full
support* on both macOS and iOS **[doc]**. `commands.onCommand` is *No support* on Orion iOS/iPadOS — irrelevant, since nothing on iOS
can reach a hub on `127.0.0.1` anyway.

---

## 4. Delivery: background → relay → panel, with no permissions

The vendor docs corroborate what §8.3 already does.

- **Chrome.** The `chrome.tabs` reference says *"Most features don't require any permissions to use"*, and pins what the `tabs`
  permission actually buys: *"This permission does not give access to the `browser.tabs` namespace. Instead, it grants an extension the
  ability to call `tabs.query()` against four sensitive properties on `tabs.Tab` instances: `url`, `pendingUrl`, `title`, and
  `favIconUrl`."* `tabs.sendMessage` is not among them. **[doc]**
- **Firefox.** MDN's `tabs` page is explicit: *"You can use most of this API without any special permission."* The only listed
  exceptions are `Tab.url`/`Tab.title`/`Tab.favIconUrl` (and filtering by them in `tabs.query()`), and `tabs.executeScript()` /
  `tabs.insertCSS()`, which need a host permission. `tabs.sendMessage` is in neither list, and MDN's `tabs.sendMessage` page carries no
  Permissions section at all. **[doc]**
- **Firefox MV3 host grant.** Extension Workshop's migration guide: *"From Firefox 127, host permissions listed in `host_permissions`
  and `content_scripts` are displayed in the install prompt and granted on installation."* The floor is 142, so every Firefox that can
  install this build grants the `https://pokerogue.net/*` match at install. **[doc]**, and **[live]** Firefox 156 by §2.
- **Safari.** Apple's compatibility page lists the manifest keys and JavaScript APIs that differ in Safari; **`commands` is not among
  them**, and Apple explicitly defers: *"To evaluate compatibility for JavaScript extension APIs in your Safari web extension, see
  Mozilla's compatibility table."* **[doc]**
- **Orion.** `tabs.sendMessage` *Full support* on macOS **[doc]**, and the transport bar passes **[live]** Orion 1.1.2 (§2).

One thing the docs do **not** carry, and the repo does: Chrome's match-patterns page says match patterns are used both for *"Injecting
content script"* and for *"Declaring host permissions that some Chrome APIs require in addition to their own permissions"* — it does
not state that a `content_scripts` match confers host access for messaging. The reason it does not need to is that messaging into your
*own* content script is not host access. §2's live passes settle it.

**The last hop is already built.** The panel is MAIN-world (`hud.js`), where no extension API exists — §2.1 records `browser` as
undefined in Orion's MAIN world **[live]**, and the relay exists precisely because MAIN cannot hear `runtime`. So anything arriving in
the background reaches the panel through the ISOLATED relay's `coachemon:*` `CustomEvent` channel
(`extension/src/relay/relay.ts`, `extension/src/relay/channel.ts`, §9.1). That is one more message type on an existing channel, not a
new capability.

---

## 5. How many commands, and what a collision looks like

- **Chrome: unlimited commands, at most four suggested keys.** *"An extension can have many commands, but may specify at most four
  suggested keyboard shortcuts."* **[doc]** One is all this effort wants (§391: *One manifest `commands` entry, and nothing else is
  rebindable*).
- **Firefox: MDN states no limit** on either count. **[doc]**
- **A shortcut must carry a modifier on Chrome.** *"Extension command shortcuts must include either `Ctrl` or `Alt`"*, with `Command`
  or `MacCtrl` substituting for `Ctrl` on macOS; `Shift` is optional-only. **[doc]** So the grab key cannot be a bare key — no bare
  `Tab`, no bare backtick, no bare letter. BCD also has `F1`–`F12` as *not supported* on Chrome, while Firefox 53+ and Safari 14+ allow
  them **[doc]** — so a single default that works on all four targets is a `Ctrl`/`Alt`/`Command` combination, not a function key.
- **A collision is silent, and the player sees nothing.** Chrome: *"If an extension attempts to register a shortcut that is already
  used by another extension, the second extension's shortcut won't register as expected"*, and *"Certain operating system and Chrome
  shortcuts (e.g. window management) always take priority over Extension command shortcuts and cannot be overridden."* **[doc]** MDN
  is blunter: *"If a key combination is already used by the browser (like `"Ctrl+P"`) or by an existing add-on, then you can't override
  it. You can define it, but your event handler will not be called when the user presses the key combination."* **[doc]**

  So the failure mode is **a key that does nothing**, with no error, no badge and no notice. Whatever the panel does when it gets the
  keyboard, it must be discoverable some other way, or a player whose default collided will conclude the feature does not exist.

---

## 6. Where a player rebinds it

| Target | Where | Tag |
|---|---|---|
| Chrome | `chrome://extensions/shortcuts` — *"The user can manually add more shortcuts from the `chrome://extensions/shortcuts` dialog."* | **[doc]** |
| Firefox | `about:addons` → gear → **Manage Extension Shortcuts** | **[doc]** |
| Safari **26+** | Safari Settings | **[doc]** |
| Safari **18–18.6** | **nowhere** | **[doc]** |
| Orion | **no documented extension-shortcuts page** | **[unverified]** |

A player may assign a key to a command that shipped with no `suggested_key` at all, on both Chrome and Firefox **[doc]**. That is the
safest default: ship the command with *no* suggested key, let the browser's own page own the binding, and have no collision to lose to.
The cost is that the feature is off until the player binds it.

**Safari is the interesting row.** MDN's compat data records Safari support for the `commands` manifest key as *partial* from 14 through
18.6, with the note **"Changing the keyboard shortcut for a command is not supported"**, and full support from **26**
(released 2025-09-15) **[doc]**. Apple's own Safari 26.0 release notes confirm the change, in the Web Extensions section:

> "Added support to show Web Extension commands in the menubar on macOS and iPadOS. On macOS, users can customize the keyboard shortcut
> associated with a command in Safari Settings. (99049863)"

and, in the same notes:

> "Fixed including the extension's icon in the commands menu item and prevented customization using System Settings. (135360504)"

Two consequences. First, **Safari 26 also puts the command in the menubar**, which is a discoverability route no other target has — and
a way for a Safari player to trigger the grab with no key at all. Second, **macOS System Settings › Keyboard › App Shortcuts is
explicitly *not* a fallback on Safari**: Apple closed it deliberately.

The store manifest declares `"safari": { "strict_min_version": "18.0" }` (§5.3), and whether Safari even enforces that is already
**[unverified]** in §16. Everything actually exercised on Safari in this repo was on **26.2** **[live]** (§2.1). So the practical
exposure is narrow, but the *declared* floor and the rebinding floor disagree by eight major versions.

**Orion documents no extension-shortcuts page.** Its keyboard-shortcuts help page covers only changing *Orion's own* shortcuts through
macOS System Settings: *"You can change the keyboard shortcuts for Orion or other apps based on your specific needs."* **[doc]** Whether
Orion surfaces an extension command in a menu (which is what would make the macOS App Shortcuts route work) is **[unverified]** — it was
not observed, and Kagi does not say. Orion's sheet claims `commands.update` and `commands.reset` as *Full support* on macOS **[doc]**,
which would let an extension rebind its own key programmatically, but this effort has no settings surface to drive them from (§391) and
neither Chrome nor Safari has them (`update`/`reset`: Firefox 60+, Chrome and Safari `false` **[doc]**). So they are not a portable
answer.

---

## 7. Does the key reach a background that has been torn down

Yes on Chrome and Firefox, by documented design. Unmeasured on Safari and Orion.

- **Chrome MV3 service worker.** It idles out *"After 30 seconds of inactivity"*, and *"Events and calls to extension APIs reset these
  timers, and if the service worker has gone dormant, an incoming event will revive them."* **[doc]** The listener must be registered
  synchronously: *"Event handlers in service workers need to be declared in the global scope… This ensures that they are registered
  synchronously on initial script execution."* **[doc]** `background.ts` already does exactly this, and its own header comment says why.
- **Firefox event page.** *"Background scripts unload after a few seconds of inactivity"*, and they *"are restarted automatically when
  Firefox calls one of their WebExtensions API events listeners"*, with *"Listeners must be registered synchronously from the start of
  the page."* **[doc]**
- **Safari.** Apple confirms the teardown but not the wake: *"With manifest version 3, all background pages are nonpersistent."*
  **[doc]** §16 already carries the measurement that matters — *the unsigned page unloaded after about 32 s* — and the transport's
  answer to it is reconnect-on-wake (§8.2), which is a *reconnect*, not a proof that an inbound event revives the page. **Whether
  `commands.onCommand` wakes a torn-down Safari background is [unverified]**, and it is the single riskiest fact in this ticket.
- **Orion.** §2 records Orion running the `service_worker` as a *persistent* page **[live]** 1.1.2, so there is nothing to wake. That
  is the easy case, assuming it holds.

A second Safari caveat, from §2.1 **[live]** Safari 26.2: *"Safari runs nothing until the player grants access in Safari › Settings ›
Extensions; no prompt appears."* So on Safari the grab key can fire in a live background and still reach nothing, because there is no
content script in the tab to send to. The panel is not drawn in that state either, so the player is not missing anything they can see —
but the key is silently dead for the same reason the coach is.

---

## 8. Is there a permission-free route that skips the background

**Yes, and it is cheaper than the browser one — it just cannot be rebound.**

`hud.js` runs in the page's MAIN world at `document_idle`. A `keydown` listener on `window` at capture, inside `hud/`, needs no
manifest key, no background and no permission, and it ships down **both** injection routes — the extension *and* the CDP transport the
server still evaluates (§10.5, §12.1). The panel already does the equivalent for the mouse: `90-render.js` stops `click`, `mousedown`,
`pointerdown` and `touchstart` from reaching the game at the panel root. There is no `keydown` anywhere in `skills/coachemon/scripts/hud/`
today.

What that route cannot do is let a player rebind the key. No browser shortcuts page can see a page-level DOM listener — that is the
whole distinction §391 leans on when it says *"the keys inside a focused panel are ordinary DOM events that no browser shortcut UI can
see."* It also means the grab key must be chosen to avoid whatever PokéRogue itself binds, which is [#393](https://github.com/IIxauII/coachemon/issues/393)'s
question, and it cannot use a `Ctrl`/`Command` combination safely without fighting the browser's own bindings.

The `_execute_action` reserved command is a third route: it opens the extension's action popup without dispatching `onCommand`, and
without a background **[doc]**. It is no use here — the Firefox build's `action` exists only to carry the data-collection consent click
(§8.4), Chrome and Safari declare no `action` at all, and §391 rules out a popup outright.

A content script cannot register a browser-level shortcut by itself on any target: `commands` is a manifest key whose event is
delivered to the extension's background context. **[doc]**

---

## 9. What this forces

1. **`commands` is affordable, and §6 stands.** The store manifest gains one key and still declares no permission of any kind. No
   banned word is named, and §5.5 check 1 keeps passing. §6 does not reopen. What §5.3 gains is one `commands` entry per target, and
   `extension/src/build/manifest.test.ts` pins it like every other key.
2. **Ship it with no `suggested_key`.** A default that collides is silently dead and the player is told nothing. With no suggested key
   there is nothing to collide, the browser's own page owns the binding from the start, and the four-shortcut budget is untouched.
   The cost is that the feature is inert until bound, so the panel has to say the key exists somewhere the player will read.
3. **A default, if one is wanted anyway, must be a `Ctrl`/`Alt`/`Command` combination.** Chrome forbids a bare key and forbids function
   keys; Firefox and Safari allow F1–F12 and Chrome does not. One cross-target default is therefore a modifier combination.
4. **Safari's floor and Safari's rebinding disagree.** Rebinding arrived in Safari 26; the manifest says 18. Either the Safari floor
   moves to 26 for this feature, or the feature is documented as fixed-key on Safari 18–18.6, or the Safari build carries no `commands`
   entry at all and uses the page-level route. This is a decision, not a detail, and it belongs to #397 or a ticket of its own.
5. **Safari gets one thing no other target does**: Safari 26 shows the command in the menubar, which is a mouse-reachable trigger and a
   discoverability surface for free.
6. **One [unverified] premise is created, for §16**: *a `commands.onCommand` event wakes a torn-down Safari background.* Everything
   else in this ticket is [doc] or [live]. The cheap check is the per-engine smoke run that §16 already provisions.
7. **The page-level route stays live as the fallback and as the CDP answer.** It costs nothing, it works under both injection routes,
   and it is what the feature degrades to wherever the browser command does not arrive. #397's real question is therefore not
   *browser-or-page* but *browser-and-page*, and what the second one does when the first never fires.
8. **Nothing here makes the grab a `command` in `CONTEXT.md`'s sense.** That word means *one step the hub carries to a game tab*, and
   this step comes from the browser, unasked, with no hub involved. It travels the relay's channel but it is not hub traffic, and #397
   needs a name for it that is not *command*.

---

## Sources

Vendor primary sources, all fetched 2026-09-25.

- Chrome, `chrome.commands` reference — https://developer.chrome.com/docs/extensions/reference/api/commands
- Chrome, `chrome.tabs` reference — https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome, match patterns — https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Chrome, service worker lifecycle — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome, service worker events — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events
- MDN, `commands` manifest key — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands
- MDN, `tabs` API permissions — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs
- MDN, `tabs.sendMessage` — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/sendMessage
- MDN, background scripts / event pages — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
- MDN browser-compat-data, `webextensions.api.commands` and `webextensions.manifest.commands` (v8.1.3) — https://bcd.developer.mozilla.org/bcd/api/v0/current/webextensions.manifest.commands.json
- Extension Workshop, MV3 migration guide — https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
- Apple, Safari 26.0 release notes, Web Extensions — https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes
- Apple, assessing your Safari web extension's browser compatibility — https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility
- Kagi, Orion WebExtensions API support — https://help.kagi.com/orion/misc/technical.html and its linked support sheet
- Kagi, Orion keyboard shortcuts — https://help.kagi.com/orion/support-and-community/keyboard-shortcuts.html
