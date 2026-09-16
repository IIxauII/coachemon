# Agent transport on Orion

Ticket: [#150](https://github.com/IIxauII/pokerogue-mcp/issues/150). Observed on **2026-09-16**, **Orion 1.1.2 on macOS 26.2** (WebKit 625.1.8), with the dev at the keyboard and the agent reading a loopback listener. Everything below is observation, not documentation, unless marked otherwise. **Status: resolved.** The pass bar is met. The dev chose not to run the variants under "Not yet tested"; see "Decisions".

**Short answer.** **Loopback passes the transport pass bar on Orion**, on both the CWS-shape and the AMO-shape build. After **330 s** with no traffic from the local process, a command reached MAIN-world page code on a live `pokerogue.net` tab and its answer came back in **19 ms**. Both backgrounds had been up for 16–17 minutes without ever unloading. Orion runs **both** builds as persistent background pages, **including the one that declares `background.service_worker`**. Per the rescope on #150, routes 1 (Apple Events pull), 3 (native-messaging relay shim) and 4 (downloads drop) therefore do not need to run.

## Setup

- **Probe:** [`orion-transport/probe/`](orion-transport/probe/) is a throwaway MV3 extension with one source and two manifests. `build.sh` writes `dist/cws` and `dist/amo`, plus `.zip` and `.xpi` files.
  - `manifest.cws.json`: `background.service_worker`.
  - `manifest.amo.json`: `background.scripts` plus `browser_specific_settings.gecko`.
  - Both builds: host permissions `https://pokerogue.net/*` and `http://127.0.0.1/*`; `main.js` declared `world: "MAIN"`; `isolated.js` in the default world.
  - `background.js` holds **both** a WebSocket (`ws://127.0.0.1:47150/ws`) and a long-poll (`GET /poll`, held 25 s). On a command it runs `tabs.query` → `tabs.sendMessage` → `isolated.js` → `postMessage` → `main.js`, which reads the live game. The answer returns as `POST /ack`.
- **Listener:** [`orion-transport/listener.mjs`](orion-transport/listener.mjs) on `127.0.0.1:47150`. It sends a command after `--idle` seconds (330) with no command traffic, and scores it **PASS** only when a **MAIN-world** answer comes back within 1 s. The raw log is [`orion-transport/probe-log.jsonl`](orion-transport/probe-log.jsonl).
- **Install:** Orion › Tools › Extensions › **+** › *Install from Disk…*, then `probe150-cws.zip` and `probe150-amo.xpi`, then *Allow on all websites*. Both installed with no signing gate and no developer mode. **Unsigned sideloads only**: nothing here was installed from a store listing.

## 1. Background lifecycle

From `bg-start`:

| Field | CWS build | AMO build |
|---|---|---|
| Declared background | `service_worker` | `scripts` |
| `ServiceWorkerGlobalScope` | **no** | no |
| `document` present | **yes** | yes |
| `browser` global | yes | yes |
| User agent | `… Chrome/146.0.0.0 Safari/625.1.8` | `… Firefox/132.0` |

- **Orion does not run a service worker.** The CWS build's `background.service_worker` executes as a background page with a `document`. The background console attributes its lines to `user-script:<n>`, which suggests Orion injects the background script into a generated page.
- **Persistent over at least 17 minutes:** by the passing idle command, `bgUptimeS` was 1031 (CWS) and 988 (AMO). No `bg-start` appeared between install and that point, apart from the AMO restart described next.
- **The AMO build restarted once, 10 s after install**, most likely on the site-access grant. The first instance connected from origin `moz-extension://7ad24cab…`; **the restarted one connected from `chrome-extension://7ad24cab…`**, with the same id under a different scheme. Anything that pins the loopback peer by `Origin` must accept both schemes, or must not rely on `Origin` at all. This is relevant to [Pairing protocol: MCP server and extension](https://github.com/IIxauII/pokerogue-mcp/issues/107).

## 2. Loopback reach

- **WebSocket and `fetch` to `http://127.0.0.1` both work from the background of both builds**, with the host permission declared. Every `ws-open` and every `/poll` succeeded. No prompt, no Local Network Access dialog and no mixed-content block appeared, since the background page is not an https document.
- **Reconnect works:** two listener restarts (20:05:13Z and 20:12:12Z) each saw both backgrounds reconnect within **0.6–2.2 s**. While the server was down, the background console showed `Failed to load resource: Could not connect to the server` for the poll and `WebSocket connection … failed: … Socket is not connected` / `ws closed 1006`, as expected.

## 3. The pass bar

| Command | Trigger | Idle before | Result | Latency (listener → MAIN → listener) |
|---|---|---|---|---|
| `c1` | manual | 14 s | PASS (AMO; CWS dropped it, see note) | 12 ms |
| `c3` | manual | 40 s | PASS, both builds | 13 ms |
| `rmu4jegww-c1` | **idle 330 s** | **330 s** | **PASS, both builds** | **19 ms** (CWS), 21 ms (AMO) |

The passing idle command was delivered over all four channels at once: two sockets and two held polls. The CWS build acked first, via **WebSocket**. Breakdown: listener → background 2 ms (`bgLagMs`), → tab 10 ms (`tabLagMs`). The page answer showed `typeof Phaser` `object`, wave 50 and `loop.frame` 53045, advancing between commands, with `document.hidden: false`.

**Probe bug, not an Orion finding.** An earlier idle command, `c2` at 20:10:59Z, logged FAIL with no ack. The background dedupes command ids for its whole lifetime, and the listener's ids restarted at `c1` on each listener restart, so both backgrounds silently dropped a `c2` they had already handled. The same bug dropped CWS's copy of the second `c1`. Commit `77d0744` prefixes ids with a per-run token; every command after that fix passed.

## 4. Side findings

- **Manifest `content_scripts[].world: "MAIN"` works on Orion**, answering the map's fog item on it: `main.js` saw `Phaser` as a bare global and read the live game on both builds.
- **`browser` is `undefined` in Orion's MAIN world**, unlike Safari 26.2 where it is an object. World detection by a page global (`Phaser`) works on both.
- **Content scripts do not inject into tabs already open at install.** The pokerogue.net tab loaded before install had no probe until the dev reloaded it (`tabs.sendMessage` → `Could not establish connection. Receiving end does not exist.`). This differs from Safari 26.2, which injected into the open tab on grant. It matters for onboarding, because a reload mid-run can cost the player the current screen.
- **Apple Events `do JavaScript` still works** against the same tab. The coach HUD was re-attached through `read.sh orion hud` during the test, without disturbing the extension's channel.

## Decisions

Made by the dev on 2026-09-16, after the pass:

- **Orion's transport is loopback.** Routes 1, 3 and 4 are not pursued, and the Orion AppleScript route carries no carve-out from the "extension replaces CDP and Apple Events" lock.
- **Either build: both listings name Orion.** The CWS and AMO descriptions both say the extension works in Orion, and the player picks. Nobody is steered to one store.
- **No further variants.** Everything below stays untested; the pass bar was the question.

## Not yet tested

Recorded, not run. **Known risk:** orionfeedback [#14474](https://orionfeedback.org/d/14474) (Orion 1.1.2, "Under Review") reports 1Password's Chrome extension dead after the Mac wakes from sleep until the extension is reloaded. If that hits this extension's background, the transport stays down after wake even though the background's reconnect loop works.

- **Hidden tab / Orion not frontmost:** every command hit a visible tab.
- **WebSocket only** or **long-poll only.** Both ran at once, so it is not isolated which one keeps the background responsive. Given a persistent background page, either is likely enough.
- **Idle beyond ~17 min**, and **sleep/wake** (see the risk above).
- **Without the `http://127.0.0.1/*` host permission.**
- **Store-installed builds** (CWS / AMO listing) rather than sideloads, and Orion's opt-in store auto-update, which reportedly clears site permissions.