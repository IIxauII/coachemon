# Game loop in a hidden tab without focus emulation

Ticket: [#174](https://github.com/IIxauII/pokerogue-mcp/issues/174). Observed on **2026-09-17**, **Chrome 153.0.8010.47** on macOS 26.2, PokéRogue on **Phaser 3.90.0**. The agent drove it; the dev kept hands off during the counted run. **Status: resolved, Chrome only**, by the dev's choice. Firefox, Safari and Orion were **not measured**.

**Short answer.** **Chrome: works hidden with a named fix.**

- **With no fix, the game never settles while hidden, whether in a background tab, a minimised window or a window covered by another app.** The loop runs at 0 fps. A 600 ms fade stays unfinished for the whole 30 s call budget, then finishes 4–124 ms after the tab is shown again.
- **Pump fix:** each poll by the local process runs one `game.loop.tick()` if no frame ran since the previous poll. The fade then settles in **412–428 ms** in all three states, against about 207 ms when visible. It needs no timer, worker or audio in the page.

## Setup

- **Probe:** [`hidden-tab-game-loop/probe/`](hidden-tab-game-loop/probe/) is a throwaway MV3 extension, reusing the loopback shape from [#161](https://github.com/IIxauII/pokerogue-mcp/issues/161). The background holds a WebSocket to `127.0.0.1:47174` and sends a text frame every 20 s. It performs the window ops itself: `tabs.create` a blank tab over the game tab, `windows.update` to minimise, then restore. Page ops go `tabs.sendMessage` → isolated content script → `postMessage` → MAIN-world `main.js`.
- **Lab:** [`hidden-tab-game-loop/lab.mjs`](hidden-tab-game-loop/lab.mjs) runs each trial like a server call:
  1. Apply the hidden state and wait 1.5 s.
  2. Poll the MAIN world every **100 ms** for 3 s to measure rates.
  3. Replay #23's fade chain: `fadeOut(250)` → `time.delayedCall(100)` → `fadeIn(250)`.
  4. Keep polling every 100 ms until `ui.overlayActive` clears, or until the **30 s** call budget runs out.
  5. Restore the tab.

  A trial counts as clean only if every poll saw `document.hidden` match the state.
- **Covered by another app:** [`cover.js`](hidden-tab-game-loop/cover.js) opens an opaque borderless window at floating level over the browser window's bounds. `osascript` owns the window, so no Automation permission is needed.
- **No CDP on the page.** [`chrome.mjs`](hidden-tab-game-loop/chrome.mjs) loads the unpacked build through `Extensions.loadUnpacked` on a browser-level `--remote-debugging-pipe`, as #161 did. It never attaches to the page and never sets focus emulation. It launches with `--autoplay-policy=no-user-gesture-required`, so the game's audio context runs, as it would for a player who has clicked the tab.
- **Page:** pokerogue.net at the login form (`ui.mode` 32). No run and no real `press`; the fade chain is #23's stand-in for the tweens and timers a press starts.

## 1. Results

Run 2 of [`lab-chrome.jsonl`](hidden-tab-game-loop/lab-chrome.jsonl), with every row clean. Each cell is fade-settle time; loop fps while hidden is in brackets.

| Fix | Background tab | Minimised | Covered by another app |
|---|---|---|---|
| none | **never** (0) | **never** (0) | **never** (0) |
| `pump`: one `loop.tick()` per poll if the frame is stale | **412 ms** (9.7) | **428 ms** (9.5) | **427 ms** (9.4) |
| `worker`: a dedicated worker posts every 16 ms; the page ticks if no frame for 50 ms | **409 ms** (16) | **416 ms** (15.9) | **421 ms** (16) |
| `timeout`: Phaser's `forceSetTimeOut`, rebound after boot | 6.2 s (1) | 6.6 s (1) | 7.0 s (1.3) |
| `timeout-muted`: `timeout` with the game muted | 6.6 s (1) | 6.4 s (1) | 5.3 s (1) |
| `audio`: `timeout-muted` plus a 40 Hz oscillator at gain 0.001 | 209 ms (57.6) | 204 ms (57.8) | 208 ms (57.5) |

Visible baseline: 204–214 ms at 144 fps, whichever fix was installed.

## 2. Mechanism

- **Phaser does not stop its own loop when the page hides.** On `visibilitychange`, `Game.onHidden` calls `TimeStep.pause()`, which in 3.90 only records `_pauseTime` (read live from the page). The freeze comes entirely from the browser: **`requestAnimationFrame` delivers 0 callbacks** in all three hidden states. Calling `loop.tick()` is therefore enough to advance the game, since nothing inside Phaser holds it back.
- **A window covered by another app freezes like a minimised one.** #23 saw full speed under a *second Chrome window*; an opaque window from another process is detected as occlusion and sets `visibilityState` to `hidden`.
- **Page timers are throttled to 1 Hz while hidden**, which rules out the `timeout` fix at 1 fps. The one exception is a page that is producing sound: the oscillator kept `setInterval(50)` at 20/s and the loop at about 58 fps. The game's own music did not do this in run 2, because the game had stayed muted since the `timeout-muted` trials of run 1 (a probe restore bug, see §4). So whether the game's own music exempts the tab was not isolated. Run 0, an aborted run with music playing, shows timers at 20/s in a background tab.
- **The worker's own timer is not throttled** (62.5 messages/s while hidden), and the page's `onmessage` handler runs promptly.
- **`pump` needs no page-side scheduling.** The poll that asks whether the game has settled is also what advances it. It only moves forward while polls arrive, which is exactly while a call waits to settle. Between calls a hidden game stays frozen.

## 3. Choosing among the fixes

This was not decided with the dev. It is recorded here for [Pairing protocol: MCP server and extension](https://github.com/IIxauII/pokerogue-mcp/issues/107) and the spec.

- **`pump`** fits the closed command vocabulary as one named behaviour of the settle read, not a new capability. It adds nothing to the permission set, and it cannot run the game while no agent is waiting. Its cost: about 0.4 s per 600 ms of animation, 2× slower than visible, since `smoothDelta` clamps each step to about 16.7 ms while `inFocus` is false and only the 100 ms polls step. It replaces today's `loop_frozen` refusal: before pressing, the server would pump rather than refuse.
- **`worker`** settles at the same speed and would also let the game run between calls. It needs a blob-URL worker in the page, and it keeps a hidden tab stepping on its own.
- **`audio`** is the fastest, but it only works because the tab counts as audible while nothing can be heard. That is an evasion, not a fix, and would read badly in store review.
- **`timeout` / `timeout-muted`** fit within the 30 s budget, but at 5–7 s per fade, a battle turn with several animations would spill over.

## 4. Caveats

- **Run 1 is partly dirty.** Eight trials in the background-tab and minimised states saw the tab visible on some or all polls (`DIRTY` in `summarize.mjs`); why was not established. Run 2 repeats every cell cleanly, and its values are the ones above.
- **The game stayed muted after run 1's `timeout-muted` and `audio` trials.** The fix's restore did not unmute it, so every later trial ran muted. Run 2's `none`, `pump` and `worker` rows do not depend on audio. For `timeout`, run 2 is the muted case.
- **Run 0** ([`lab-chrome.run0.jsonl`](hidden-tab-game-loop/lab-chrome.run0.jsonl)) stopped when the test Chrome quit mid-run, apparently by hand. The game's music was audible at that point.
- **`clockMsPerS` of about 1,490 for `pump`** is a measurement artefact, not the game running fast. `scene.time.now` jumps to wall-clock time on the first tick after a frozen stretch.

## Not tested

- **Firefox, Safari and Orion.** The dev chose to resolve on Chrome alone. The mechanism is engine-independent (Phaser ticks when told to), but whether each engine freezes rAF in all three states, and whether `tabs.sendMessage` → `postMessage` stays prompt in a hidden tab there, was not measured. #161 saw commands reach MAIN-world code in hidden tabs on Chrome and Firefox.
- **Long hidden idle.** Chrome's intensive throttling after 5 minutes hidden was not exercised. `pump` does not depend on page timers, but the relay path after a long hidden idle was not timed. #161's idle cycles passed in hidden tabs.
- **A real `press`** through `scene.ui.processInput`, a battle turn, or a mode change. Only the fade chain ran.
- **Screen lock and display sleep.**
- **Whether the first tick after a long freeze behaves well.** `smoothDelta` falls back to the delta history, but queued Phaser events were not inspected.
