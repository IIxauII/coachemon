# #23 Keeping the game loop running when the page is hidden — prototype findings

Prototype for [#23](https://github.com/IIxauII/pokerogue-mcp/issues/23). Driven live against the owned
profile (`~/.pokerogue-mcp/chrome-profile`, port 9222), Chrome 152.0.7977.83, macOS 26 (Darwin 25.2),
144 Hz display. **No game input at all**: the game sat at `LOADING`/`TITLE`; the probes only moved,
minimized or covered the window, and replayed the UI fade chain with no mode change. Throwaway.

## Verdict

**`Emulation.setFocusEmulationEnabled({enabled: true})` on the server's page session is the fix, on
both browser-ownership paths.** It keeps the Phaser loop at full frame rate while the window is
minimized or the tab is backgrounded, it does not un-minimize or raise the window (no focus theft),
and it needs no launch flags, so it works on an attached Chrome too. Launch flags do **not** fix it.

## Frame rate by condition (Phaser `loop.frame` delta over 5 s; raw rAF identical in every row)

| condition | none | focus emulation | `setWebLifecycleState active` | `Page.bringToFront` |
|---|---|---|---|---|
| front | 144 fps | — | — | — |
| **minimized** | **0**, vis `hidden` | **144**, vis `visible`, window stays minimized | 0 | 144, but **un-minimizes the window** |
| **background tab** | **0**, vis `hidden` | **136–140** | 0 | 144, switches the dev's tab |
| covered by a 2nd Chrome window | 144 (not treated as occluded) | 144 | 144 | 144 |
| window off-screen (-20000,-20000) | 60 (still runs) | 60 | 60 | 60 |

Launched with `--disable-renderer-backgrounding --disable-backgrounding-occluded-windows
--disable-background-timer-throttling`: **minimized and background tab are still 0 fps**. The flags
only restore `setInterval` (1 Hz → 20 Hz while hidden). rAF is what drives Phaser, so they are no fix.

`--headless=new` on the same profile: logged in, reaches `TITLE`, **60 fps**, vis `visible`. Works,
but the UA says `HeadlessChrome` and the dev can't watch the run.

`lab.jsonl` holds every row (`label: baseline` / `flags`).

## The mechanism, unfrozen (`fade.mjs`, `fade.jsonl`)

Replaying `setModeInternal`'s chain (`fadeOut(250)` → `time.delayedCall(100)` → `fadeIn(250)`) while
minimized, polling `ui.overlayActive` every 50 ms:

| emulation | trials | `overlayActive` | frames while held |
|---|---|---|---|
| off | 2 | held the full 8 s, cleared ~800 ms after restore | **0** |
| on | 2 | cleared in **157 ms**, still minimized | 22–23 |

This is #19's stall and its cure on the same code path, without pressing anything.

## Constraints on the fix

- **It lives exactly as long as the CDP session that set it.** Set on one session, session closed,
  measured minimized on a second session: **0 fps, vis `hidden`**. So the server must set it on the
  page session it keeps open, and **re-apply it on every (re)attach**. Whether it survives a page
  reload on the same session (#13's reload rung) was not measured.
- **It holds past Chrome's 5-minute intensive-throttling threshold.** 6 min minimized with emulation
  on: 36 samples, all 140.6–144.1 fps.
- **It blinds `visibilityState`.** With emulation on the page reports `visible` and `hasFocus()`
  true whatever the window does, so a `visibilityState` busy check can no longer see anything.

## Detection

- Across every measured row, `visibilityState === "hidden"` and 0 fps coincided exactly, so without
  emulation it is a sufficient signal. With emulation it is dead weight.
- **Frame delta is free in the settle loop**: it already polls every 100 ms, and reading
  `game.loop.frame` inside the same `Runtime.evaluate` costs nothing extra (locator + frame read
  p50 0.11–0.17 ms; bare `document.visibilityState` p50 0.16–0.29 ms; N=50 each). At 60 fps a
  100 ms poll sees ~6 frames, so "frame unchanged across two consecutive polls" is an unambiguous
  frozen-loop signal, and it is the ground truth #19 asked for — it is independent of *why* the loop
  froze (hidden, emulation lost, display asleep).

## Unmeasured

- **Screen lock / display sleep** — the realistic unattended case. With emulation on, rAF ran even
  minimized, so it plausibly runs here too, but nothing was driven. `node fade.mjs --watch 120000`
  logs fps every 5 s for a human to lock the screen during.
- Occlusion by **another app's** window (a second Chrome window did not count as occlusion).
- An attached Chrome where the dev is actively using other tabs in the same window (emulation was
  measured with a background tab, not with the dev typing into it).
- Any press, any real `setMode`, any battle tween. Only the fade chain was replayed.

## Files

| file | what |
|---|---|
| `lab.mjs` | condition × mitigation matrix, frame/rAF/timer rates, detection cost |
| `fade.mjs` | fade-chain replay while minimized; `--lifetime`, `--long`, `--watch` |
| `launch.sh` | #5's launch command plus extra flags |
| `lab.jsonl`, `fade.jsonl` | raw rows |

Chrome is left **not running**, as it was found.

## Decided with the dev

1. **Fix:** focus emulation on the held page session, re-applied on every (re)attach, on both paths.
   Owned Chrome stays **headed** (the dev can watch). No launch flags, no headless.
2. **Detection:** `game.loop.frame` read on every settle poll; unchanged across two polls ⇒ busy
   reason **`loop-frozen`**, outranking `ui-transition`, with `visibilityState` attached as a
   diagnostic label. Supersedes #19's proposed `page-hidden`.
3. **Pressing while frozen:** re-apply emulation (not a press), re-check frames; still frozen ⇒ refuse
   the press and return the diagnostic. Never `Page.bringToFront`.
4. **Screen lock / display sleep:** not driven; left unmeasured. `loop-frozen` catches it if it freezes.
