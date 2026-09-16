# Synthetic input a Phaser game accepts

Research for [#101](https://github.com/IIxauII/pokerogue-mcp/issues/101), a child of map
[#98 Map: HUD as a browser extension](https://github.com/IIxauII/pokerogue-mcp/issues/98).
Read against PokéRogue **v1.12.0.11** (the pinned ref in `src/escape-ladder/reviewed.json`),
Phaser **3.90.0**, Chrome **153.0.8010.47**. 2026-09-16.

## Verdict

**The locked decision survives.** An extension can drive PokéRogue on all three engines, and it
does not need trusted events to do it.

Two independent reasons, either of which is sufficient:

1. **The press path this repo actually uses is not an input event.** `press` calls
   `scene.ui.processInput(button)` through `Runtime.evaluate` — a main-world function call. The
   CDP Input domain is only the §6.4 retry rung. A main-world content script
   (`"world": "MAIN"`, Chrome 111 / Firefox 128 / Safari 18) can make exactly the same call.
2. **The fallback rung works untrusted anyway.** Measured on a live tab: a `KeyboardEvent` with
   `isTrusted: false`, dispatched on `window` from page-world JS, moved the real
   `TitleUiHandler` cursor. Neither Phaser nor PokéRogue reads `isTrusted`.

`chrome.debugger` therefore is not needed for input, on any engine. That matters, because it
only exists on one of them.

---

## A. The game's actual input pipeline

### A.0 The premise needs correcting: `press` does not go through CDP Input

The ticket says "`press` currently goes through CDP's Input domain". That is the *fallback*, not
the path.

`src/driver.ts#press` first calls `#pressAndSettle`, which is
([`src/driver.ts:493`](../../src/driver.ts)):

```ts
const r = await this.session.evaluate<{ ok: boolean; why?: string }>(js.press(button));
```

and `js.press` is ([`src/game/js.ts:398`](../../src/game/js.ts)):

```js
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
L.ui.processInput(BUTTON);
return { ok: true, mode: L.ui.mode };
```

That is a direct call into the game's own `UI.processInput` with a `Button` enum int — no DOM
event, no keyboard, no browser input plumbing. It reaches `scene.ui` via `__locate()`, which
walks `Phaser.Display.Canvas.CanvasPool.pool` to find the live `Game`
([`src/game/js.ts` PRELUDE](../../src/game/js.ts)).

Only when that press leaves the fine fingerprint unmoved does `press` retry through the raw
keyboard, once ([`src/driver.ts:196-203`](../../src/driver.ts)):

```ts
if (unmoved && !landedUnseen && rawKey) {
  // §6.4: retry once through the raw keyboard, never through processInput again.
  rawFallback = true;
  const [key, code, keyCode] = rawKey;
  await this.session.rawKey(key, code, keyCode);
```

`rawKey` is the only use of `Input.dispatchKeyEvent` in the repo
([`src/cdp/session.ts:227`](../../src/cdp/session.ts)), and its own comment already states the
finding this ticket asks for: *"Phaser binds to `window`, so a dispatched key reaches the game
(#9)."* It sends `keyDown` then `keyUp` with `windowsVirtualKeyCode`/`nativeVirtualKeyCode` set.

So the trusted-event surface area is one retry rung out of eight buttons, and `select_option`'s
cursor walk goes through `#pressAndSettle` too — i.e. through `processInput`.

### A.1 Where the game listens: `window`

PokéRogue builds its `Phaser.Game` with
([`src/main.ts:24`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/main.ts)):

```js
input: {
  mouse: { target: "app" },
  touch: { target: "app" },
  gamepad: true,
},
```

There is no `input.keyboard` key. Phaser's config resolution
([`Config.js:218-230`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Config.js)):

```js
this.inputKeyboard = GetValue(config, 'input.keyboard', true);
this.inputKeyboardEventTarget = GetValue(config, 'input.keyboard.target', window);
```

so keyboard input is **enabled** and the target falls through to `window`.
`KeyboardManager.boot` then confirms it
([`KeyboardManager.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardManager.js)):

```js
this.target = config.inputKeyboardEventTarget;
this.addCapture(config.inputKeyboardCapture);
if (!this.target && window) { this.target = window; }
if (this.enabled && this.target) { this.startListeners(); }
```

and `startListeners` attaches plain bubble-phase DOM listeners:

```js
target.addEventListener('keydown', this.onKeyDown, false);
target.addEventListener('keyup', this.onKeyUp, false);
```

**Not** the canvas, **not** `document`, **not** `#app`. `window`, verified live below.

The mouse/touch target *is* `#app` — relevant only if an extension ever wants the DOM
`#touchControls` route instead ([`src/touch-controls.ts`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/touch-controls.ts)
binds `touchstart`/`pointerdown`/`touchend`/`pointerup` on those nodes). That is a third
possible surface; it is not needed and was not tested.

### A.2 Phaser does not check `isTrusted`

`grep isTrusted` over `KeyboardManager.js` and `KeyboardPlugin.js` at v3.90.0: **zero hits.**
The full guard in `onKeyDown` is:

```js
if (event.defaultPrevented || !_this.enabled || !_this.manager) { return; }
_this.queue.push(event);
_this.manager.events.emit(InputEvents.MANAGER_PROCESS);
```

`defaultPrevented`, `enabled`, `manager` — nothing about provenance. `KeyboardPlugin.update`
then drains that queue on the next step and re-emits, gated only by
`isActive()` → `this.enabled && this.scene.sys.canInput()`, and `canInput` is a scene-lifecycle
check (`status > PENDING && status <= RUNNING`,
[`Systems.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/Systems.js)) — not a
focus or trust check.

### A.3 What PokéRogue does with it

`InputsController.setupKeyboard` subscribes on the Phaser plugin, not the DOM
([`src/inputs-controller.ts:146`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/inputs-controller.ts)):

```ts
globalScene.input.keyboard?.on("keydown", this.keyboardKeyDown, this).on("keyup", this.keyboardKeyUp, this);
```

and the handler maps by **`event.keyCode`** (line 325):

```ts
keyboardKeyDown(event: KeyboardEvent): void {
  this.lastSource = "keyboard";
  this.ensureKeyboardIsInit();
  const buttonDown = getButtonWithKeycode(this.getActiveConfig(Device.KEYBOARD)!, event.keyCode);
  if (buttonDown != null) {
    if (this.buttonLock.includes(buttonDown)) { return; }
    this.events.emit("input_down", { controller_type: "keyboard", button: buttonDown });
```

From there `UiInputs` turns `input_down` into `ui.processInput(button)` — the same entry point
the primary press path calls directly. So the whole chain is:

```
window keydown → KeyboardManager.queue → KeyboardPlugin.update → InputsController.keyboardKeyDown
  → events.emit("input_down") → UiInputs → ui.processInput(button)
```

Nothing in that chain reads `isTrusted`, `event.sourceCapabilities`, or anything else that
distinguishes a synthetic event.

### A.4 Empirical confirmation (live tab)

Run against a fresh `https://pokerogue.net/` tab in Chrome 153, game version reported as
`1.12.0.11`, all JS evaluated in the page world. Script kept at
`scratchpad/probe.mjs` / `probe2.mjs` (not committed; ~120 lines of CDP glue around three
`Runtime.evaluate` calls).

**Probe 1 — does an untrusted event reach the listener and Phaser's queue?** Dispatched
`new KeyboardEvent('keydown', { key:'ScrollLock', code:'ScrollLock', keyCode:145, bubbles:true, cancelable:true })`
on `window` (keyCode 145 is bound to nothing in the game, so zero side effect):

```json
{
 "keyboardManagerTarget": "window",
 "kmEnabled": true,
 "constructedKeyCode": 145,
 "constructedIsTrusted": false,
 "listenerSaw": [{ "isTrusted": false, "key": "ScrollLock", "code": "ScrollLock",
                   "keyCode": 145, "which": 145, "type": "keydown", "target": "window" }],
 "queuedByPhaser": 1
}
```

`KeyboardManager.target === window` confirmed on the live object, and Phaser's queue grew by one
for an `isTrusted: false` event.

**Probe 2 — does it drive the game end to end?** On the real title screen
(`ui.mode === 1`, handler `TitleUiHandler`, active), dispatched `keydown`+`keyup` for ArrowDown,
then ArrowUp (net-zero: the cursor returns where it started):

```json
{
 "before":    { "mode": 1, "handler": "TitleUiHandler", "cursor": 0 },
 "afterDown": { "mode": 1, "handler": "TitleUiHandler", "cursor": 1 },
 "afterUp":   { "mode": 1, "handler": "TitleUiHandler", "cursor": 0 },
 "emittedOnArrowDown": [{ "button": 1, "src": "keyboard" }],
 "emittedOnArrowUp":   [{ "button": 0, "src": "keyboard" }],
 "lastSource": "keyboard"
}
```

`button: 1` is `Button.DOWN`, `button: 0` is `Button.UP`
([`src/enums/generated.ts`](../../src/enums/generated.ts)). Exactly one `input_down` per press,
`controller_type: "keyboard"`, and the handler's cursor actually moved. **Untrusted keyboard
events drive PokéRogue.**

### A.5 Two traps, both real

**Trap 1 — `keyCode` must be set explicitly.** Both Phaser (`var code = event.keyCode` in
`KeyboardPlugin.update`) and PokéRogue (`getButtonWithKeycode(..., event.keyCode)`) key entirely
off the legacy attribute. `key`/`code` are ignored. Measured in Chrome 153:

```json
{ "ctorKeyCode": 90, "ctorWhich": 90, "withoutKeyCode": 0, "definePropertyFallback": 90 }
```

`new KeyboardEvent('keydown', { keyCode: 90 })` yields `keyCode === 90` (and `which === 90`);
omit it and you get `0`, which maps to no button and is silently swallowed. The UI Events spec
treats `keyCode`/`charCode`/`which` as legacy attributes retained for compatibility
([UI Events §3.5.1.2](https://www.w3.org/TR/uievents/)); the legacy `KeyboardEventInit` members
are what make the constructor form work. **Only verified in Chrome here.** If Firefox or Safari
ignore the init member, `Object.defineProperty(ev, 'keyCode', { get: () => 90 })` works — also
measured, returns `90` — and is the safe way to write it once for all three.

`src/driver.ts#RAW_KEYS` already carries the right triples (`ArrowUp/38`, `z/90`, `x/88`,
`Enter/13`, `Escape/27`, …); an extension should reuse that table verbatim rather than re-derive it.

**Trap 2 — Phaser's duplicate-event bailout.** `KeyboardPlugin.update` contains:

```js
//  Duplicate event bailout
if (code === this.prevCode && event.timeStamp === this.prevTime && event.type === this.prevType)
{
    continue;
}
```

and two `KeyboardEvent`s constructed back to back share a `timeStamp` (measured:
`timeStampsEqualBackToBack: true`, both `4578.200000047684` — Chrome coarsens
`performance.now()`). Firing `keydown` then `keyup` alternates `type`, so the pair survives —
which is why probe 2 was clean — but **two identical `keydown`s in the same task would have the
second dropped silently.** Always send the down/up pair, never two downs; and if a caller ever
wants a held/repeat press, it must separate them by at least one coarsened tick.

A third, softer hazard: `InputsController.keyboardKeyDown` pushes onto `buttonLock` and starts a
`setInterval` repeat, cleared only by `keyboardKeyUp`. A dispatched `keydown` without a matching
`keyup` leaves the game repeating that button forever. (Observed incidentally in an early probe
that fired into a `LoadingModalUiHandler`: 24 `input_down` emissions from two presses.)

---

## B. Per-engine extension capability

### B.1 The path that needs no special permission: the MAIN world

Content scripts run in an isolated world by default — *"JavaScript variables in an extension's
content scripts are not visible to the host page… none of these (web page, content scripts, and
any running extensions) can access the context and variables of the others"*
([Chrome content-scripts docs](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)).
That isolation is fatal for this repo's approach: `Phaser`, `CanvasPool`, `scene.ui` and
`processInput` are page JS objects, invisible from an isolated world.

`"world": "MAIN"` removes the isolation, and it is portable. MDN browser-compat-data for
`manifest.json > content_scripts > world`
([`webextensions/manifest/content_scripts.json`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/content_scripts.json)):

| | Chrome | Firefox | Safari |
|---|---|---|---|
| `content_scripts[].world` | **111** | **128** | **18** |

All three engines, no permission warning for it, and `scripting.executeScript({ world: "MAIN" })`
is the dynamic equivalent (`scripting` shows the user *no* warning at all,
[permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)).

Two constraints that come with MAIN:

- **The page's CSP applies** to main-world scripts, not the extension's
  ([Chrome content-scripts docs](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)).
  Checked: `pokerogue.net` sends **no** `Content-Security-Policy` response header and carries no
  CSP `<meta>` tag, so nothing to work around today. This is a drift risk worth a note — if the
  game ever ships a CSP, main-world injection is the thing that breaks.
- **No `chrome.*` API access** from the main world; the main-world half needs a
  `window.postMessage` bridge to an isolated content script for anything that talks to the
  extension. (The HUD already lives in the page world — `skills/coach-pokerogue/scripts/hud/00-prelude.js`
  says *"injected into the page world"* — so this is the bootstrap it already has, just
  differently delivered. The detail of that bootstrap belongs to the page-world ticket.)

### B.2 Chrome: `chrome.debugger` exists, and is available to store listings, but is not needed

`chrome.debugger` *"serves as an alternate transport for Chrome's remote debugging protocol"* and
lets an extension *"attach to one or more tabs to instrument network interaction, debug
JavaScript, mutate the DOM and CSS"*
([API reference](https://developer.chrome.com/docs/extensions/reference/api/debugger)). It
requires the `"debugger"` manifest permission and would give byte-identical behaviour to
today's `Input.dispatchKeyEvent` — trusted events included.

**Can a public Chrome Web Store listing declare it?** Nothing in policy forbids it. The Program
Policies say only *"Request access to the narrowest permissions necessary to implement your
Product's features or services"*
([Use of Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions)),
and the review process warns that *"Reviews may take longer for extensions that request broad
host permissions or sensitive execution permissions"*, listing *"dangerous permission requests"*
among the triggers for closer review
([review process](https://developer.chrome.com/docs/webstore/review-process)). Chromium itself
treats store-distributed debugger extensions as expected: the infobar-suppression path is
explicitly scoped to *policy-installed* extensions, implying ordinary installed ones get the
banner.

**What it costs the user.** Three distinct, permanent frictions:

1. **Install-time warning.** `debugger` shows *"Access the page debugger backend."* **and**
   *"Read and change all your data on all websites."*
   ([permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)) —
   the harshest string the store has, on a listing aimed at casual players.
2. **A persistent banner, every attach.** `IDS_DEV_TOOLS_INFOBAR_LABEL` in
   [`chrome/app/generated_resources.grd`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/app/generated_resources.grd):
   > `"<CLIENT_NAME>" started debugging this browser`

   The Chromium string's own `desc` is the damning part: *"The label does not disappear until the
   user dismisses it, even if the debugger is detached."* Suppression requires launching Chrome
   with `--silent-debugger-extension-api` (`::switches::kSilentDebuggerExtensionAPI`, checked in
   `ExtensionDevToolsClientHost::Attach`,
   [`debugger_api.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/extensions/api/debugger/debugger_api.cc))
   or enterprise policy install — neither available to a store user. **This is exactly the
   command-line-flag friction the extension was supposed to abolish.** Adopting `chrome.debugger`
   would trade the port-9222 debug profile for a different permanent banner.
3. **Single-client contention.** `kAlreadyAttachedError: "Another debugger is already attached to
   the * with id: *."` — opening DevTools on the game tab, or any other debugger extension,
   locks the extension out. That is a new, engine-level source of the **contended** condition
   the driver already models.

One incidental upside if it were ever used for the transport: while attached, Chromium holds an
MV3 service-worker keepalive with `ServiceWorkerExternalRequestTimeoutType::kDoesNotTimeout`
(`debugger_api.cc`), so the worker cannot be killed mid-session.

**Recommendation: do not declare `debugger`.** It buys nothing the MAIN world does not already
give, and it costs the listing its two worst permission strings plus a banner on every attach.

### B.3 Firefox: there is no equivalent. None.

Firefox ships **no** `browser.debugger` / `chrome.debugger` API. Verified three ways:

- MDN browser-compat-data has **no** `webextensions/api/debugger` entry at all — 53 WebExtension
  API files, `debugger` is not one of them
  ([mdn/browser-compat-data `webextensions/api/`](https://github.com/mdn/browser-compat-data/tree/main/webextensions/api)).
- Gecko's own schema directories list every API Firefox implements. Neither
  [`toolkit/components/extensions/schemas/`](https://github.com/mozilla/gecko-dev/tree/master/toolkit/components/extensions/schemas)
  (alarms, cookies, downloads, `scripting`, `runtime`, `user_scripts`, …) nor
  [`browser/components/extensions/schemas/`](https://github.com/mozilla/gecko-dev/tree/master/browser/components/extensions/schemas)
  (bookmarks, `devtools*`, history, tabs, …) contains a `debugger.json`.

The nearest thing is `devtools.inspectedWindow.eval`, and it is not a substitute: it is only
reachable from a `devtools_page`, which only exists while the user has the DevTools panel open
on that tab. Not viable for a background transport.

So there is no way for a Firefox extension to produce a trusted key event. **Firefox is the
engine that decides this question**, and its only answer is page-world dispatch — which, per
part A, is enough.

### B.4 Safari: also no equivalent

Safari Web Extensions expose a fixed namespace set, enumerated in WebKit's source. The full
API directory
([`Source/WebKit/WebProcess/Extensions/API/`](https://github.com/WebKit/WebKit/tree/main/Source/WebKit/WebProcess/Extensions/API))
is: Action, Alarms, Bookmarks, Commands, Cookies, DOM, DeclarativeNetRequest, DevTools (+
InspectedWindow / Network / Panels / ExtensionPanel), Event, Extension, Localization, Menus,
Namespace, Notifications, Offscreen, Permissions, Port, Runtime, **Scripting**, SidePanel,
SidebarAction, Storage, StorageArea, Tabs, WebNavigation, WebRequest, Windows. **No
`WebExtensionAPIDebugger.h`.** Same conclusion as Firefox, same mitigation: `world: "MAIN"`
(Safari 18) plus untrusted dispatch.

### B.5 The fallback, and what it cannot do

Page-world dispatch — `window.dispatchEvent(new KeyboardEvent(...))` from a `world: "MAIN"`
script — is what replaces `Input.dispatchKeyEvent`. Proven in part A. Its limits:

- **`keyCode` is mandatory** (A.5 trap 1). Use `RAW_KEYS` plus the `defineProperty` belt-and-braces.
- **Always dispatch the `keyup`** (A.5 trap 2 / repeat interval).
- **`event.isTrusted` is `false` and stays false.** Nothing the game reads today, but it is a
  one-line change upstream (`if (!event.isTrusted) return`) that would break only the fallback
  rung, not `processInput`. Worth adding to the `hud-deps.ts` drift watch alongside
  `InputsController.keyboardKeyDown`.
- **It cannot defeat the browser's own trust gates** — no fullscreen request, no clipboard write,
  no autoplay unmute, no file picker from a synthetic click. None of these are on any escape
  ladder rung, so this does not bite today. It would bite if a future rung ever needed a
  user-gesture-gated API.
- **It cannot reach chrome:// pages, the Web Store, or another extension's UI.** Irrelevant here;
  the target is one `pokerogue.net` tab.
- **The page can see it.** A main-world script is indistinguishable from page script, so the game
  could in principle detect the HUD. Not a concern for an AGPL fan tool, noted for completeness.

Dispatching from the *isolated* world onto the shared DOM would also reach the page's listeners,
but it is the wrong tool: it cannot read `scene.ui` back, so it cannot settle, fingerprint, or
read a menu. MAIN is required for the reads regardless, so input rides along for free.

---

## What this means for map #98

- **"The extension replaces CDP and Apple Events" — unchanged, and better supported than the
  charting assumed.** The premise that the extension would have to reproduce trusted input is
  wrong on both counts: the press path does not use input events, and the fallback works
  untrusted on every engine.
- **"Whether `play-pokerogue`'s press semantics survive extension input limits"** (Not yet
  specified) — resolved. They survive intact. `press`, `select_option`'s cursor walk, the
  auto-advance loop and the §6.4 raw retry all port unchanged; only the transport under
  `session.evaluate` / `session.rawKey` changes.
- **No locked decision is contradicted.**

## Fog this opens

1. **`chrome.debugger` is now an explicitly rejected option, not an unexplored one** — worth
   recording as an ADR, because "why doesn't the Chrome build just use CDP, it's right there"
   will be asked again. The answer is the banner, which reintroduces the exact friction the
   extension exists to remove.
2. **Minimum engine versions are now pinned by `world: "MAIN"`**: Chrome 111, Firefox 128,
   Safari 18. Safari 18 in particular means macOS Sequoia-era Safari — the extension cannot
   support older Safari at all. That is a listing-metadata decision map #98 has not made.
3. **A new drift-watch surface.** `InputsController.keyboardKeyDown`, `getButtonWithKeycode` and
   PokéRogue's Phaser game config (`input.keyboard` absent ⇒ target is `window`) are now load-
   bearing for the extension in a way they were not for CDP. They are not in `HUD_DEPS` or
   `GLOBAL_DEPS` today.
4. **Contention gets an engine-level shape on Chrome only** if `debugger` is ever adopted
   (`kAlreadyAttachedError`). If it is not adopted — the recommendation — the **driver** concept
   needs no change.
5. **Untested on Firefox and Safari.** Everything in part A was measured in Chrome 153. The
   Phaser and PokéRogue source facts are engine-independent, but `new KeyboardEvent({keyCode})`
   and the `timeStamp` coarsening were not re-measured on Gecko or WebKit. A ten-line check on
   each is cheap and should happen before the spec locks.

## Sources

Primary, in the order they are leaned on:

- This repo: `src/driver.ts`, `src/game/js.ts`, `src/cdp/session.ts`, `src/enums/generated.ts`,
  `src/escape-ladder/reviewed.json`, `skills/coach-pokerogue/scripts/hud/00-prelude.js`.
- PokéRogue v1.12.0.11: [`src/main.ts`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/main.ts),
  [`src/inputs-controller.ts`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/inputs-controller.ts),
  [`src/touch-controls.ts`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/touch-controls.ts).
- Phaser v3.90.0: [`KeyboardManager.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardManager.js),
  [`KeyboardPlugin.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardPlugin.js),
  [`Config.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Config.js),
  [`Systems.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/Systems.js).
- Live measurement: Chrome 153.0.8010.47 against `https://pokerogue.net/`, game version 1.12.0.11.
- Chrome: [debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger),
  [permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list),
  [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
  [Use of Permissions policy](https://developer.chrome.com/docs/webstore/program-policies/permissions),
  [review process](https://developer.chrome.com/docs/webstore/review-process).
- Chromium source: [`chrome/app/generated_resources.grd`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/app/generated_resources.grd)
  (`IDS_DEV_TOOLS_INFOBAR_LABEL`),
  [`chrome/browser/extensions/api/debugger/debugger_api.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/extensions/api/debugger/debugger_api.cc).
- Firefox: [gecko-dev toolkit schemas](https://github.com/mozilla/gecko-dev/tree/master/toolkit/components/extensions/schemas),
  [gecko-dev browser schemas](https://github.com/mozilla/gecko-dev/tree/master/browser/components/extensions/schemas).
- Safari/WebKit: [`Source/WebKit/WebProcess/Extensions/API/`](https://github.com/WebKit/WebKit/tree/main/Source/WebKit/WebProcess/Extensions/API).
- Compat: [mdn/browser-compat-data `webextensions/`](https://github.com/mdn/browser-compat-data/tree/main/webextensions).
- Spec: [UI Events §3.5.1.2, legacy key attributes](https://www.w3.org/TR/uievents/).
