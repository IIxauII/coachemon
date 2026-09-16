# Verify MAIN-world execution on a real Safari

Ticket: [#119](https://github.com/IIxauII/pokerogue-mcp/issues/119). Observed on **2026-09-16**, **Safari 26.2 on macOS 26.2** (build 25C56), by the dev at the keyboard with the agent reading a loopback listener. Everything below is observation, not documentation, unless marked otherwise.

**Short answer.** `content_scripts[].world: "MAIN"` **works** on Safari 26.2: the script sees `Phaser` as a bare global, finds the live game, reads the `battle` scene and watches frames advance. `scripting.executeScript({world: "MAIN"})` **behaves the same**. Nothing runs until the player grants site access, and Safari gave **no prompt** to do so. The grant happened in Safari › Settings › Extensions, and scripts then injected into the already-open tab within 20 ms, without a reload. **Unplanned but decisive for the transport:** the extension's background page reached `127.0.0.1` over both `fetch` and `WebSocket`, in both directions, before any site access was granted. That contradicts the "strongly negative" prediction in [Native-messaging reach to a local Node process](https://github.com/IIxauII/pokerogue-mcp/issues/100). **Safari below 18 was not tested.** No such machine was available, and the dev declined to find one.

## Setup

- **Probe:** [`safari-main-world/probe/`](safari-main-world/probe/) is a throwaway MV3 extension:
  - `main.js`: declared `world: "MAIN"`.
  - `isolated.js`: default world; relays results and draws an on-page box.
  - `background.js`: uses `background.scripts`, which is non-persistent.
  - Host permissions requested: `https://pokerogue.net/*` and `http://127.0.0.1/*`.
- **Listener:** [`safari-main-world/listener.mjs`](safari-main-world/listener.mjs) on `127.0.0.1:47119`, accepting `POST /report` plus a WebSocket echo. The raw log is [`safari-main-world/probe-log.jsonl`](safari-main-world/probe-log.jsonl) (30 lines).
- **Loading:** Safari › Settings › Advanced › *Show features for web developers*, then Settings › Developer › *Add Temporary Extension…* (password prompt), then select the folder. **No Xcode, no `safari-web-extension-packager`, and no containing app were involved.** Neither tool is installed on the dev Mac. A temporary extension unloads when Safari quits. See [stefanvd.net, 2026-02-01](https://www.stefanvd.net/blog/2026/02/01/how-to-load-and-debug-safari-extensions-without-xcode/).
- **Unsigned:** the extension was **not** packaged, signed or notarized. Every finding below is about Safari's web-extension runtime, not about a shipped build.
- **Page state:** pokerogue.net was at the login screen, so `currentBattle` was null.

## 1. Does manifest `world: "MAIN"` execute in the page world?

**Yes.** From `content:main-result` at 15:58:17.785Z:

| Field | `main.js` (MAIN) | `isolated.js` (ISOLATED) |
|---|---|---|
| `typeof Phaser` | `"object"` | `"undefined"` |
| `typeof browser` | **`"object"`** | `"object"` |
| `typeof chrome` | `"undefined"` | — |
| `"wrappedJSObject" in window` | `false` | — |

The live game, reached by the HUD's own lookup (`Phaser.Display.Canvas.CanvasPool.pool…game`): `Phaser.VERSION` `3.90.0`, scene keys `["battle"]`, `battle` scene present, `ui.getMode()` → `32`, and `loop.frame` advanced over 1 s (`frameAdvanced: true`). The game already existed when `main.js` ran (`elapsedMs: 2`).

**Gotcha for the bootstrap: `browser` is defined in Safari's MAIN world.** Whether Safari exposes it to every page or only because an extension is installed was not isolated. Either way, `typeof browser` cannot tell the worlds apart on Safari. Detect the world by a **page** global (`Phaser`, or the game lookup) instead. On Chrome, `chrome` would be the trap; here `chrome` was absent.

**Relay:** `window.postMessage` from MAIN to ISOLATED delivered. The `documentElement.dataset` fallback was written but was not needed.

## 2. The per-site permission flow

Observed:

1. **Before any grant:** `permissions.contains({origins: ["https://pokerogue.net/*"]})` returned `false` at background start (15:57:41Z and 15:57:43Z). Opening pokerogue.net produced **no content-script report at all**. Nothing runs before the grant.
2. **No prompt.** The dev reports no sheet, banner or in-page prompt on visiting pokerogue.net. The toolbar icon's popover showed only "Temporary".
3. **The grant was made in Settings.** Safari › Settings › Extensions lists the probe under *Temporary*, with Permissions → **"Webpage Contents and Browsing History** — Can read and alter sensitive information on webpages, including passwords, phone numbers, and credit cards, and see your browsing history on pokerogue.net", plus an **Edit Websites…** button. The dev enabled access there. Which choices *Edit Websites…* offers (one day, always, every website) was not recorded.
4. **Grant scope is broader than requested.** `permissions.onAdded` fired at 15:58:16.769Z with `origins: ["*://*.pokerogue.net/*"]`: any scheme and any subdomain, where the manifest asked for `https://pokerogue.net/*`.
5. **Injection is immediate.** `isolated.js` and `main.js` reported from the already-open tab 21–22 ms after the grant. No reload was needed, and none was recorded.
6. **`http://127.0.0.1/*` is not surfaced** anywhere in the Settings permission list.
7. The Settings pane also shows an *Allow in Private Browsing* checkbox (off), a *Shortcuts* section built from the `action`, and *Share across devices* (on).

Not observed: whether a store-installed (signed) extension gets a prompt or badge that a temporary one does not. Also not observed: what the grant looks like from the toolbar popover rather than Settings.

## 3. `scripting.executeScript({world: "MAIN"})`

**Same as the manifest route.** It ran on 5 toolbar clicks (`action.onClicked`) between 15:58:28Z and 15:59:02Z. Every result was `typeof Phaser: "object"`, `gameFound: true`, `battleScene: true`, with `loop.frame` rising 1793 → 3913. The `tabs.onUpdated` route never fired, because the tab had finished loading before the grant and was not reloaded. `tab.url` visibility without the `tabs` permission is therefore untested.

## 4. Safari below 18

**Not tested.** There was no machine, and the dev declined. It stays unverified whether pre-18 fails cleanly or runs ISOLATED silently the way Firefox 102–127 does. The world check in §1 (look for `Phaser`, not `browser`) catches the silent case either way.

## 5. Loopback from the background page (outside the ticket's four questions)

**Works on Safari 26.2 over both fetch and WebSocket.**

- **fetch:** `POST http://127.0.0.1:47119/report` with `content-type: application/json` sent a CORS preflight (`OPTIONS`). The request then arrived with `Origin: safari-web-extension://<uuid>` and got a 200 `ok` back to the extension.
- **WebSocket:** `new WebSocket("ws://127.0.0.1:47119/ws")` connected. The message arrived, and the server's echo came back to the extension (`ws: {ok: true, echo: …}`).
- **Before any grant:** it worked from the first `background-start` (15:57:41Z), before any site access was granted and with `127.0.0.1` never shown in Settings.
- **Every event, 12 of 12, arrived over both channels.**

This contradicts [`native-messaging.md` §5](https://github.com/IIxauII/pokerogue-mcp/blob/research/native-messaging/docs/research/native-messaging.md), which rated Safari "UNCERTAIN but strongly negative" for a localhost WebSocket on the strength of WebKit bug 171934 and an unanswered forum report. What this test does **not** establish:

- **A packaged, signed build:** App Store Connect ZIP packaging, or Developer ID plus a containing app. The containing app's sandbox and its `com.apple.security.network.client` entitlement were not in play.
- **A content script, rather than the background page, reaching loopback.** Not tried.
- **A `background.service_worker`** instead of `background.scripts`.
- **Whether an open WebSocket keeps the background page alive.** See §6.
- **Guideline 4.4.2** ("should not claim access to more websites than strictly necessary"): how a reviewer reads a `127.0.0.1` host permission.

## 6. Background page lifetime

Safari **unloaded the non-persistent background page after about 32 s idle**. The last event was at 15:58:29.5Z, and the next toolbar click at 15:59:01.6Z produced a fresh `background-start`. The site grant **survived the restart** (`originGranted: true`). The probe closed each WebSocket right after its echo, so whether a *held-open* socket keeps the page alive on Safari is unknown. A persistent-connection transport depends on it.

## 7. Synthetic input (from a map fog item)

`new KeyboardEvent("keydown", {key: "F24", code: "F24", keyCode: 135, which: 135})` dispatched on `window` from MAIN reached a capturing listener with **`keyCode: 135` intact** and `isTrusted: false`. The constructor's `keyCode` behaviour is now verified on Safari, not only Chrome. Whether Phaser's `KeyboardManager` acts on it on Safari was not tested; the probe used an unmapped key on purpose.

## Other observations

- The UA string is frozen at `Intel Mac OS X 10_15_7` on an Apple-silicon macOS 26.2 machine. Only `Version/26.2` is reliable, so do not gate on the OS token.
- The extension was added twice in about 2 s, giving two instance UUIDs (`…ea8857b7`, `…5d0f71d5`). Only the second one received the grant and the page traffic.
