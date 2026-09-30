# Does the overlay cause the game's own hitches indirectly? (#509)

**No hitch in the recording traces back to the overlay: 0 of 21 overlay-free hitches.** The indirect cost that does
exist, garbage collected just after a heavy refresh, lands in the refresh's own gap, not in the game's.

## The recording

- One lag run on Orion (WebKit 605.1.15, store build, waves 1–21, Larvitar / Machop / Growlithe, slot 0). Log:
  `.cache/lag-run/2026-09-30T23-18-47-366Z.jsonl`.
- A Web Inspector Timelines recording over its waves 12–21: 245 s of page time, 587.4–832.5 s. Instruments: Layout &
  Rendering, JavaScript & Events (1 ms sampler, GC), CPU, Memory. Screenshots and Network were off.
- The export is at `.cache/lag-run/2026-09-30T23-18-47-366Z.timeline.json` (71 MB) on the owner's machine. **It is not
  committed:** its page-load network entries carry the session's cookies.
- The stretch had no trainer fight. Wild turns, level-ups, learn prompts, shops and party switches were all in it.

A *hitch* is a frame gap of 50 ms or more, measured between rAF callbacks as the meter does. A hitch is
*overlay-free* when no `coach:refresh` … `coach:idle` span lies inside it and under 1 ms of `coach:driver` does.

## Method

Everything is read in the export's own clock:

- **Frames** come from the rAF callbacks it recorded.
- **The overlay's and the driver's work** comes from the meter's `performance.mark`s. All 244 `coach:refresh` markers sit
  inside the timer task that ran them (`clock-check.mjs`).
- **The meter's log** agrees on the same stretch (`meter-check.mjs`): 46 gaps of 50 ms or more against 51 here, and 43% of
  hitch time overlay against 42%.
- **The inspector inflates the overlay's JS:** it is 42% of hitch time here, against 10–12% in the baseline runs (#486).
  So the proportions under the profiler are not comparable to the baselines. The attribution inside the game's own
  hitches is what this answers.

```sh
node docs/research/indirect-hitches/analyse.mjs .cache/lag-run/2026-09-30T23-18-47-366Z.timeline.json
```

## Findings

**What the 21 overlay-free hitches (1,399 ms) were:** the main thread was busy 97% of the time and idle 2.6%.

| | ms | share |
|---|---:|---:|
| GC (all partial; no full GC) | 56 | 4% |
| composite | 101 | 7% |
| style, layout, paint | 0.5 | 0% |
| the overlay box's paints | 0 | 0% |
| everything else (the game's frame, its events and microtasks) | ~1,200 | ~86% |

The sampler names the game's code in them. It is mostly WebGL texture uploads (`texImage2D` ← `_processTexture` ←
`updateText` / `CanvasTexture`), and every stack under them is the game building its own UI: `PartySlot` ←
`populatePartySlots` ← `show` ← `doSetMode`, and `populatePageContainer`. The sampler is sparse (21 of 32 rAF
callbacks of 20 ms or more got no sample), so it names code but does not size it. The record durations size it.

**Channel by channel:**

- **Timing.**
  - After a heavy refresh (≥ 15 ms, 37 of them): 0 of 21 overlay-free hitches start within 100, 250, 500 or 1,000 ms.
    Chance puts 1.7%, 4%, 7.8% and 15.2% of frames in those windows, about 3 hitches at 1 s.
  - After a heavy preview replay (`road` ≥ 5 ms, 20 of them): 0 of 21 within 1 s, where chance predicts 1.7.
- **Garbage collection.**
  - WebKit ran all 4,027 collections between script tasks, never inside one (`clock-check.mjs`). So a refresh's garbage is
    never collected on its own clock.
  - A GC follows within 20 ms of 32 of 37 heavy refreshes (86.5%) and 19 of 20 heavy replays (95%). After any frame it is
    31.6%. Those GCs average 4–5 ms.
  - Those collections sit in the refresh's own gap, which is already overlay-made. The meter's refresh ms leaves them
    out; its gap numbers include them.
  - Two overlay-free hitches (53 and 50.3 ms) would drop below 50 ms without their GC. Neither traces to the overlay: the
    last refresh before them was light (0.2 ms and 1.4 ms), and 2 and 9 collections ran in between, so that garbage was
    already gone.
  - Collection rate within 1 s of a heavy refresh is 15.8/s, against 16.4/s overall.
- **GPU and textures.**
  - The preview replay's Text uploads run synchronously inside its refreshes, where the meter already charges them: 379
    `_processTexture` samples in the overlay's spans.
  - Composite in the 100 ms after a heavy replay has p50 2.1 ms and p95 5.1 ms, against 2.4 and 3.3 ms overall. That is a
    2 ms tail per frame, too small to make a hitch.
- **Style, layout and paint.** The overlay box's paints (quad x 365–648, 75 in the recording) fall in no overlay-free
  hitch. Style and layout total 0.5 ms across all 21.

**Not the overlay's, and not the game's:**

- Two overlay-free hitches hold long `api-script-evaluated` records (47–55 ms): script run through WebKit's evaluate API,
  outside every `coach:` mark and unsampled.
  - Without that work, neither would be a hitch.
  - It is the lag run's AppleScript drain or Orion's extension bridge; this recording cannot tell which.
  - Neither is a refresh, nor anything a refresh handed off.
- Where a press's evaluation is sampled, it is the game handling the input synchronously inside the meter's `driver()`:
  `driver` → `processInput` → `shiftPhase` → the new screen's `updateInfo`. So the meter stamps that work `driver`.
