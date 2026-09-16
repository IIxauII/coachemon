# Loopback transport on Chrome and Firefox

Ticket: [#161](https://github.com/IIxauII/pokerogue-mcp/issues/161). Observed on **2026-09-16**, **Chrome 153.0.8010.47** and **Firefox 156.0** on macOS 26.2, driven by the agent alone. Everything below is observation, not documentation. **Status: resolved.**

**Short answer.** **Loopback passes on both engines, but not by the same means.**

- **Chrome:** the background service worker sends a WebSocket text frame to the local process every 20 s. It passed **15 of 15** idle commands at 13–65 ms, with the tab visible or hidden, with Local Network Access checks at their defaults or disabled, and with or without an `http://127.0.0.1/*` host permission.
- **Firefox:** the content script in the `pokerogue.net` tab sends a runtime message to the background every 20 s. It passed **15 of 15** at 17–80 ms, visible or hidden. WebSocket traffic does **not** keep a Firefox event page alive.

Nothing needs to fall back to native messaging.

## Setup

- **Probe:** [`loopback-chrome-firefox/probe/`](loopback-chrome-firefox/probe/) is a throwaway MV3 extension adapted from the [Orion probe](https://github.com/IIxauII/pokerogue-mcp/blob/research/orion-transport/docs/research/orion-transport.md). `build.mjs` builds one source into seven **variants** for each target. Each variant differs only in how its background holds the channel:

  | Variant | Channel | Keepalive | `http://127.0.0.1/*` |
  |---|---|---|---|
  | `ws` (control) | WebSocket | none | yes |
  | `ws-ka` | WebSocket | background sends a text frame every 20 s | yes |
  | `poll` | long-poll `fetch`, held 25 s | none (re-polls at once) | yes |
  | `tab-ka` | WebSocket | content script sends `runtime.sendMessage` every 20 s | yes |
  | `ws-ka-noperm` | as `ws-ka` | as `ws-ka` | **no** |
  | `poll-noperm` | as `poll` | none | **no** |
  | `ws-ka-defaultcsp` (Firefox only) | as `ws-ka`, with Firefox's default MV3 CSP | as `ws-ka` | yes |

  Every other Firefox build sets `content_security_policy.extension_pages` to `script-src 'self'` (see §3). A command goes background → `tabs.sendMessage` → isolated content script → `postMessage` → MAIN-world script, which reads the live game. The answer comes back as `POST /ack`.
- **Listener:** [`loopback-chrome-firefox/listener.mjs`](loopback-chrome-firefox/listener.mjs) on `127.0.0.1:47161`. After **330 s** with no commands, it sends one command to every probe and scores each probe separately: **PASS** needs a MAIN-world answer within 1 s. A probe with no live channel gets the command if it reconnects within 20 s. Its answer still counts from the original send.
- **Targets:** all three ran at once against one listener, one browser profile each, each with a visible `pokerogue.net` tab:
  - `chrome-lna`: Chrome with default flags.
  - `chrome-nolna`: Chrome with `--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets`.
  - `firefox`.
- **Chrome install, no debugger on the worker.** Chrome 153 logs `--load-extension is not allowed in Google Chrome, ignoring.`, even with `DisableLoadExtensionCommandLineSwitch` disabled. Extensions loaded through CDP's `Extensions.loadUnpacked` do not survive a relaunch. [`chrome.mjs --hold`](loopback-chrome-firefox/chrome.mjs) therefore keeps the install session's `--remote-debugging-pipe` open. That connection is browser-level only and never attaches to a worker target. The `ws` control variant is the check: its worker died 30 s after going idle, so the pipe does not keep workers alive.
- **Firefox install:** [`firefox.mjs`](loopback-chrome-firefox/firefox.mjs) installs each build as a temporary add-on over the Remote Debugging Protocol, then closes the connection. Temporary add-ons idle out like any other add-on: the event pages suspended 30 s after going idle.
- **Runs:**
  - **Run 1** ([`probe-log.run1.jsonl`](loopback-chrome-firefox/probe-log.run1.jsonl)): one idle cycle. The dev clicked through a Firefox dialog partway through; its content was not recorded.
  - **Run 2** ([`probe-log.jsonl`](loopback-chrome-firefox/probe-log.jsonl)): 17 commands over 1 h 28 min: one warm-up command, then 16 sent after 330 s idle. The last of them came after the tabs became visible again and landed after the tables below were read.

  Run 2 reproduced run 1's first cycle verdict for verdict.

## 1. The pass bar

Run 2. Each cell is the latency in ms; **H** means `document.hidden` was true in the tab. The warm-up command (sent while Chrome's pages were still loading) and the command at 22:22 are not shown.

| Variant | Chrome, LNA default | Chrome, LNA disabled | Firefox |
|---|---|---|---|
| `ws` | FAIL ×15 | FAIL ×15 | FAIL ×15 |
| `ws-ka` | **PASS ×15**, 13–63 (12 hidden) | **PASS ×15**, 14–64 (12 hidden) | FAIL ×15 |
| `ws-ka-noperm` | **PASS ×15**, 14–64 | **PASS ×15**, 15–65 | FAIL ×15 |
| `poll`, `poll-noperm` | FAIL ×15 | FAIL ×15 | FAIL ×15 |
| `tab-ka` | PASS while visible; hidden alternates PASS / **SLOW 13–19 s** | same | **PASS ×15**, 17–80 (12 hidden) |
| `ws-ka-defaultcsp` | n/a | n/a | FAIL: never connected |

Every FAIL was *no live channel*: the background had unloaded, and nothing woke it before the command's 20 s window closed. No command was delivered and then lost.

## 2. Background lifecycle

- **Chrome's worker unloads 30 s after its last event, whatever sockets it holds open.** `ws` closed its socket after 30–31 s idle, and `poll` dropped its held request at the same moment.
  - **Receiving a long-poll response does not count as activity.**
  - **Sending a WebSocket frame does:** `ws-ka` sent 265–266 frames over the run and never restarted.
- **Firefox's event page suspends 30 s after its last extension event, and the WebSocket keepalive does not prevent it.** `runtime.onSuspend` fired on every variant except `tab-ka`, 30 s after the last command, with an open socket and 20 s keepalive frames.
  - A suspended page is not woken by anything the local process can do.
  - **A runtime message from the content script does count:** `tab-ka` never suspended.
- **Chrome `tab-ka` breaks in a hidden tab.** Once the tab was hidden, its worker restarted **every 60 s exactly** (`bg-start` at hh:mm:04 for over an hour). The content script's 20 s timer was being run at most once a minute, so the worker idled out between wakes. A command sent while the worker was down waited for the next wake, 13–19 s later. Chrome `ws-ka` does not depend on a page timer, so it did not care.
- **Firefox `tab-ka` held up in a hidden tab.** It passed in all 12 hidden cycles, so Firefox did not stretch the 20 s content-script timer past the 30 s idle limit.

## 3. Firefox rewrites `ws://` to a failed TLS handshake under its default MV3 CSP

With no `content_security_policy` in the manifest:
- **Every `ws://127.0.0.1` connection from a Firefox MV3 background closed with code 1015** (TLS handshake failure) and never reached the listener.
- **`fetch("http://127.0.0.1/...")` from the same background worked:** run 1's default-CSP `poll` builds held their polls.

Setting `content_security_policy.extension_pages` to `"script-src 'self'"` fixed it: every Firefox WebSocket opened on the next launch. `ws-ka-defaultcsp` kept failing alongside, as the control. The behaviour is consistent with an `upgrade-insecure-requests` directive that upgrades `ws:` but exempts loopback `http:`. That reading is not checked against Mozilla's source or docs.

So a Firefox build must pick one:
- a manifest CSP override, whose AMO review acceptance is untested; or
- `fetch` instead of a WebSocket for the transport.

## 4. Local Network Access and the host permission

- **LNA made no observable difference on Chrome 153.** Both profiles opened every socket and completed every `fetch` from the worker. No prompt appeared: the dev reported only a Firefox dialog. The only Chrome difference was in timing (§1), and it did not track the LNA setting. Which LNA behaviour Chrome 153 enables by default was not inspected.
- **Neither engine needs `http://127.0.0.1/*`.**
  - WebSocket is not subject to CORS.
  - `fetch` without the permission worked only because the listener answers `access-control-allow-origin: *`. On Firefox, `permissions.contains` reported `false` for the no-permission builds.
  - A transport that uses `fetch` without the permission must send CORS headers, which opens the endpoint to every web origin. A WebSocket-only transport needs neither.
- The peer's `Origin` is `chrome-extension://<id>` on Chrome and `moz-extension://<per-install UUID>` on Firefox. The Firefox UUID is random per install, so pairing cannot pin it in advance.

## 5. Side finding for the hidden-tab ticket

**The transport reached MAIN-world code in a hidden tab on both engines, but the game loop was frozen.** `game.loop.frame` stayed at the same value for all 12 hidden cycles:
- Chrome `ws-ka`: 58652.
- Firefox `tab-ka`: 64790 to 64797, a handful of frames over an hour.

It resumed as soon as the tab was visible again (70559 and 92395 at 22:22). Why the tabs were hidden was not recorded: covered windows, a sleeping display or a locked screen. A command gets through, but a `press` would sit unprocessed. This is [Game loop in a hidden tab without focus emulation](https://github.com/IIxauII/pokerogue-mcp/issues/174).

## Not tested

- **Hidden tab, deliberately.** The hidden cycles above were incidental; the cause and the window state are unknown.
- **One build with both keepalives** (`ws-ka` + `tab-ka`), which would run the same code on both engines. Firefox with `poll` + `tab-ka` (no CSP override) was not run either. Both follow from the parts measured, but neither ran.
- **Sleep/wake, browser restart, extension update** mid-session.
- **Store-signed builds.** Unpacked (Chrome) and temporary (Firefox) builds only. Neither store changes network reach, per the ticket.
- **Other versions.** Only Chrome 153 and Firefox 156, not the Firefox 128 floor.
- **AMO review** of a manifest CSP without `upgrade-insecure-requests`.
