# Attributing a main-thread stall to a script on Orion (WebKit), Chrome second

Research for [#482](https://github.com/IIxauII/coachemon/issues/482), a child of [#480 Map: the panel's lag while a human plays](https://github.com/IIxauII/coachemon/issues/480). It feeds [#485 Measure a played session on Orion](https://github.com/IIxauII/coachemon/issues/485). The question: **how is a main-thread stall attributed to a script on Orion, and what does the panel's instrumentation have to record because the engine will not?**

Nothing here decides anything. It is evidence and a recommendation for the map to accept, amend or reject.

Vocabulary is `CONTEXT.md` — **card**, **group**, **turn read**, **run read**, **preview**, **journal**, **settled**, **flavour**. The panel's own words for its loop are not in the glossary yet (#480); here *tick* is the body `setInterval` runs once a second in `hud/99-start.js`, and a *stage* is one of the calls inside it (`rerollCheck`, `previewCheck`, `readCard`, `journalCheck`, the draw, the stream). *Frame gap* is the time between two consecutive `requestAnimationFrame` callbacks; a *stall* is a frame gap long enough to be seen.

Every non-obvious claim carries a link to the thing that owns it. Facts are tagged **[measured]** (observed on a real browser by this repo's own tickets), **[source]** (read from the implementation's source at a named revision: WebKit `main` on 2026-09-30 unless said otherwise), **[docs]** (stated by the vendor or the spec) or **[unverified]** (§8). The map's own rule holds: the prior note on `research/extension-performance` was not read.

---

## 1. The short answer

- **No WebKit ships `longtask` or `long-animation-frame`, and none is in trunk.** `PerformanceObserver.supportedEntryTypes` on WebKit `main` lists `event`, `first-input`, `largest-contentful-paint`, `mark`, `measure`, `navigation`, `paint`, `resource` and nothing else **[source]**. The two standards-position requests are open with no position after three and eight years. So the engine will not tell a page *which script* held the thread. What it will tell a page, since Safari 26.2 (and so on Orion's newer WebKit), is *how long the player's own key press took to paint* — Event Timing.
- **The attribution the engine does offer is off-page: Web Inspector's Timelines.** Its JavaScript & Events timeline is a 1 ms sampling profiler whose frames carry function name, URL, line and column; its Rendering Frames timeline shows every frame's length split into Script, Layout, Paint and Other; the whole recording exports to JSON with `⌘S` and imports back into any Web Inspector. `performance.mark()` lands in that recording as a marker; `performance.measure()` does not.
- **Orion is not "Safari's WebKit".** Orion 1.0.5+ bundles its own WebKit built from trunk (`WebKit 625.1.8`, commits `305084@main…308417@main`, in the 1.0.7 notes), newer than the Safari 26.2 the same Mac runs, and the Web Inspector inside it is that WebKit's. Orion has a Safari-style Develop menu; Inspect Element is `⇧⌘C`.
- **A rAF cadence watcher in the panel sees exactly the frames Phaser sees.** Both are animation-frame callbacks on the same document, run in one pass per rendering update in registration order; WebKit's throttling (`VisuallyIdle`, `LowPowerMode`, thermal → 30 ms; `OutsideViewport` → 10 s) is a per-page set that applies to both alike. So a gap the watcher records is a gap the game suffered, and it can be stamped with the panel's stage at that moment — that stamp is the attribution, and only the panel can make it.
- **`performance.now()` on a non-cross-origin-isolated page is 1 ms coarse on WebKit** (20 µs only when `crossOriginIsolated`). Stage timings under a millisecond read as 0; gaps of 50 ms read fine.
- **Chrome adds what WebKit lacks and nothing the panel needs to change for:** `long-animation-frame` entries name the culprit script's `sourceURL`, `sourceFunctionName` and `sourceCharPosition` with no instrumentation at all, and the same `performance.mark`/`measure` calls, given a `detail.devtools` object, draw the panel's stages on their own track in the Performance panel. `chrome-devtools-mcp` records the trace to a file over CDP.

The recommendation (§7): the panel records **per-stage timings inside the tick**, a **frame-gap watcher stamped with the running stage**, an **Event Timing observer** for the player's own inputs, and **`performance.mark` at every stage boundary** so a Web Inspector export can be read against them; the played session on Orion captures a **Timelines export per scripted moment** plus the panel's counters, pulled by the agent through `read.sh orion`, and five facts only the machine at the keyboard knows.

---

## 2. What the engine reports to the page

### 2.1 `PerformanceObserver` entry types on WebKit

| entry type | WebKit `main` | Safari | Orion 1.1.x (WebKit 625) | attribution it gives |
|---|---|---|---|---|
| `longtask` | absent | never | absent | — |
| `long-animation-frame` | absent | never | absent | — |
| `mark`, `measure` | unconditional | long-standing | yes | whatever the page names |
| `event`, `first-input` | behind `EventTimingEnabled`, **stable, default on** (off in WebKitLegacy) | **26.2** (2025-12-12) | yes (625 > 623) | per input event: processing start/end and time to next paint |
| `largest-contentful-paint` | `supportsLargestContentfulPaint()` | 26.2 | yes | load only, irrelevant here |
| `paint`, `navigation`, `resource` | yes | yes | yes | load only |

Sources:

- The list is [`PerformanceObserver::supportedEntryTypes` in `Source/WebCore/page/PerformanceObserver.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/PerformanceObserver.cpp) **[source]**: `event` and `first-input` under `document->settings().eventTimingEnabled()`, `largest-contentful-paint` under `supportsLargestContentfulPaint()`, `paint` under `supportsPaintTiming()`, and `mark`, `measure`, `navigation`, `resource` unconditionally. The file has no occurrence of `longtask` or `long-animation-frame`.
- `EventTimingEnabled` in [`Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml) **[source]**: "Enable the Event Timing API and supporting instrumentation", `status: stable`, default `true`, `false` only for WebKitLegacy. No `LongTasks*` or `LongAnimationFrame*` preference exists in that file.
- Safari 26.2's release notes, 2025-12-12: "Added support for the Event Timing API. (160970604)" and "Added support for Largest Contentful Paint web performance metric. (163498163)" — [developer.apple.com/documentation/safari-release-notes/safari-26_2-release-notes](https://developer.apple.com/documentation/safari-release-notes/safari-26_2-release-notes) **[docs]**. Neither Long Tasks nor Long Animation Frames appears in any Safari 26.x note.
- MDN's compat data has `PerformanceLongTaskTiming` at `version_added: false` for Safari and Safari iOS (Chrome 58) — [`api/PerformanceLongTaskTiming.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PerformanceLongTaskTiming.json) **[docs]**.
- WebKit's standards positions: [#52 Long Tasks API](https://github.com/WebKit/standards-positions/issues/52) (opened 2018, open, no `position:` label, "Needs position") and [#283 Performance timeline – Long Animation Frames](https://github.com/WebKit/standards-positions/issues/283) (opened 2023-11-22, open, no position; the request notes LoAF "arguably present[s] some mitigation" of #52's privacy concern) **[docs]**. [#420 Event Timing](https://github.com/WebKit/standards-positions/issues/420) carries `concerns: duplication, interoperability` yet shipped anyway. Nothing suggests a long-task signal is coming.

What Event Timing is worth here: an `event` entry is made for each input event ([w3c.github.io/event-timing](https://w3c.github.io/event-timing/); Chrome 76, Firefox 89, Safari 26.2 per [BCD `PerformanceEventTiming.json`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PerformanceEventTiming.json)) with `startTime` (the event's timestamp), `processingStart` ("a timestamp captured at the beginning of the event dispatch algorithm"), `processingEnd` and a `duration` "from when the physical user input occurs (estimated via the Event's timeStamp) to the next time the rendering … is updated"; entries are only delivered when `duration` reaches the observer's `durationThreshold` — "by default … 104 or greater", and "the maximum between 16 and options's durationThreshold value" **[docs]**. So it says nothing about a stall between key presses, but when the player presses a key while the tick holds the thread — the exact freeze #480 describes — the entry's `processingStart − startTime` is the engine's own measurement of the wait, and `duration` of the whole freeze up to the paint. That is a number the panel cannot fake, and the checklist should have it.

### 2.2 `performance.now()` resolution

[`Source/WebCore/page/Performance.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/Performance.cpp) **[source]**: `static Seconds timePrecision { 1_ms };` and `now()` returns `reduceTimeResolution(MonotonicTime::now() − m_timeOrigin)`. `Performance::allowHighPrecisionTime()` raises it to `Seconds::highTimePrecision()` = 20 µs ([`Seconds.h`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WTF/wtf/Seconds.h)), and its only caller is [`ScriptExecutionContext::setCrossOriginMode`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/dom/ScriptExecutionContext.cpp) when the mode is `Isolated`. Whether pokerogue.net is cross-origin isolated is not known from here; the panel can record `self.crossOriginIsolated` and the reading tells which resolution every stage number has. At 1 ms a stage that takes 0.4 ms reads 0 or 1 at random; sums over a session are still right on average, and the stalls in question are tens of milliseconds.

### 2.3 What the panel does today

`hud/99-start.js` times the whole tick with `performance.now()` around `tick(); stream();` and keeps `lastTickMs` and `maxTickMs`, exposed through `window.__coachHud.stats()` **[source, this repo]**. It records no stages, no frame gaps, no timestamps, no history, and nothing survives `__coachHud.stop()`. On WebKit that is all the page-side evidence there is.

---

## 3. Web Inspector against Orion

### 3.1 Whose WebKit, whose inspector

- Orion's macOS release notes state a bundled WebKit per release: **1.0.7 (2026-05-18)** "WebKit 625.1.8 (macOS 14.0+) — This release includes WebKit changes between: 305084@main…308417@main"; **1.0.5 (2026-04-08)** "WebKit 624.1.7 (macOS 14.0+) — 302450@main…305083@main"; **1.0.1 (2025-12-22)** "WebKit 624.1.2.19.2 (macOS 14.0+)"; earlier "Latest WebKit 622.1.15.19.2 (macOS 14+)" — [cdn.kagi.com/updates/orion-release-notes.html](https://cdn.kagi.com/updates/orion-release-notes.html) **[docs]**. Kagi's own description: Orion uses "bleeding-edge WebKit builds, not yet available in Safari" — [blog.kagi.com/orion-features](https://blog.kagi.com/orion-features) **[docs]**. The dev's Orion 1.1.2 reported WebKit 625.1.8 on macOS 26.2 (`research/orion-transport`, 2026-09-16) **[measured]**, while that macOS's Safari is 26.2 = WebKit 20623.1.14 (the 26.2 release notes) — Orion's engine is two branch numbers ahead of the OS's.
- Web Inspector's front end is part of the WebKit tree (`Source/WebInspectorUI`), so the inspector Orion opens is its bundled WebKit's, not the OS's; its Timelines tab therefore has whatever `main` had at `308417@main` (May 2026), including the Safari 26.2 additions **[source]**. Orion's notes list Web Inspector crashes fixed in its own releases ("[WebInspector Crash] TypeError … `target.NetworkAgent.setResourceCachingDisabled`", 0.99.133.2; "Web Inspector crashes in latest RC", 0.99.127), which is what a bundled inspector looks like **[docs]**.
- Orion's Develop menu: the help site's *Show Console Errors* page says "Click the **Develop** menu. Click **Show Console Errors Indicator**", and the indicator lets you "quickly open Console and inspect the errors" — [help.kagi.com/orion/features/show-errors.html](https://help.kagi.com/orion/features/show-errors.html) **[docs]**. Orion 1.1 (2026-06-23) added a "Service workers inspector in the Develop menu" **[docs]**. Kagi's founder on the tracker: "Inspect element in Orion already has a keyboard shortcut (shift cmd C) and like any other Orion menu shortcut, you can change it to anything you like using macOS settings" — [orionfeedback.org/d/3669](https://orionfeedback.org/d/3669-inspect-element-shortcut-in-context-menu), 2022-11-15 **[docs]**; and on porting Chrome's DevTools, "Probably would take few $MM to rip WebKit dev tools out and put this in" — [orionfeedback.org/d/2948](https://orionfeedback.org/d/2948-possible-to-use-chrome-developer-tools-in-orion), 2024-11-05 **[docs]**. The exact menu item name and whether `⌥⌘I` opens the inspector on every page is §8.
- For comparison, a third-party app embedding WebKit is inspectable only if it sets `WKWebView.isInspectable` (macOS 13.3+) and then from Safari's Develop menu — [webkit.org/blog/13936](https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/) **[docs]**. Orion does not need that route: it exposes its own inspector, which is why "Orion" never appears in Safari's Develop menu.
- Also on Orion's Develop menu: *Allow JavaScript from Apple Events*, which `skills/coachemon/scripts/read.sh orion` relies on to run a probe in the tab through `osascript` and read `window.__coachHud` back **[source, this repo]**. That is the agent's route to the panel's counters without the player copying anything.

### 3.2 The Timelines tab

From [webkit.org/web-inspector/timelines-tab/](https://webkit.org/web-inspector/timelines-tab/) **[docs]**:

- Timelines: Screenshots, Network Requests, Layout & Rendering, Media & Animations, JavaScript & Events, CPU, Memory, JavaScript Allocations, and the Rendering Frames view.
- "Timeline recordings can be started, stopped, or resumed via the Start recording (and Stop recording) button or by pressing space in the Timelines Tab."
- "Complete recordings can be exported by clicking Export or pressing ⌘S. Previously exported recordings can later be imported by clicking Import or via drag-and-drop."
- JavaScript & Events "samples JavaScript activity to produce call trees, organized either by the sequential entry to script (e.g. script evaluation, event dispatch, setTimeout, etc.) that contained the activity or as a time-independent combined call tree."
- Rendering Frames: frames on the x-axis, "the time it took for that frame to execute" on the y, "horizontal lines for 30 FPS and 60 FPS are general indicators of time (~33ms and ~16ms respectively)", each frame broken into JavaScript, Layout, Paint and Other.

What the sampler records **[source]**: the timeline agent starts it with `scriptProfilerAgent->startTracking(true)` ([`InspectorTimelineAgent.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/inspector/agents/InspectorTimelineAgent.cpp)); [`InspectorScriptProfilerAgent.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/agents/InspectorScriptProfilerAgent.cpp) runs JSC's `SamplingProfiler` and, on stop, emits every stack trace's frames with `setName(stackFrame.displayName(vm))`, `setUrl(stackFrame.url())`, `setLine`/`setColumn` (function start, plus the expression's line and column when known). The interval is `Options::sampleInterval`, default **1000 µs** ([`OptionsList.h`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/runtime/OptionsList.h): "Time between stack traces in microseconds"), with a random jitter so it does not lock to a system tick ([`SamplingProfiler.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/runtime/SamplingProfiler.cpp)). A 60 ms stall in `readCard` shows as ~60 samples whose top frames name `readCard` and the functions under it, by the URL `hud.js` loads from.

The export **[source]**: [`TimelineRecordingContentView._exportTimelineRecording`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebInspectorUI/UserInterface/Views/TimelineRecordingContentView.js) writes `<name>.json` containing `{version: WI.TimelineRecording.SerializationVersion (1), recording: recording.exportData(), overview: …}`; [`TimelineRecording.exportData`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebInspectorUI/UserInterface/Models/TimelineRecording.js) holds `displayName, startTime, endTime, discontinuities, instrumentTypes, records, markers, memoryPressureEvents, samples` — `samples` being the stack traces — and `import` reads the same shape (plus the legacy `sampleStackTraces`/`sampleDurations`). So the JSON is self-contained: the agent can parse it (records with start/end times per frame and per script entry; samples with named frames) without opening an inspector, and the dev can re-open it in Safari's Web Inspector on any Mac.

### 3.3 User Timing in the recording

- `performance.mark()` reaches the inspector: [`PerformanceUserTiming::mark`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/PerformanceUserTiming.cpp) calls `InspectorInstrumentation::performanceMark(context, markName, timestamp)`, and [`InspectorTimelineAgent::didPerformanceMark`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/inspector/agents/InspectorTimelineAgent.cpp) appends a `TimelineRecordType::TimeStamp` record with the mark's name — the same record `console.timeStamp()` makes (`didTimeStamp`) **[source]**. Those are the vertical markers on the overview and rows in the events list.
- `performance.measure()` makes **no** inspector record: neither `Performance::measure` nor `PerformanceUserTiming::measure` instruments anything **[source]**. What `measure` does on Darwin is emit an `os_signpost` interval in category `WebKitPerformance`, and only when the WebContent process was started with the environment variable `WebKitPerformanceSignpostEnabled=1` (`isSignpostEnabled()` in `Performance.cpp`; WebKit's own benchmark driver passes it as `__XPC_WebKitPerformanceSignpostEnabled` to the launched Safari — [`osx_safari_driver.py`](https://raw.githubusercontent.com/WebKit/WebKit/main/Tools/Scripts/webkitpy/benchmark_runner/browser_driver/osx_safari_driver.py)) **[source]**. That is an Instruments route (a *Points of Interest*-style track of every `measure`, across processes), not a Web Inspector one; it is not needed for #485 and is listed in §8 as untried on Orion.

So for a recording to be readable against the panel's stages, the panel must call `performance.mark` at each stage boundary; the marks then bracket the sampled stacks and the long frames in the same JSON. The `measure` calls cost nothing on WebKit and pay off on Chrome (§5.2).

### 3.4 Safari proper

Same inspector, same tab, same export; Safari's Develop menu is switched on in Settings › Advanced › "Show features for web developers", Web Inspector opens with `⌥⌘I` ([webkit.org/web-inspector/enabling-web-inspector](https://webkit.org/web-inspector/enabling-web-inspector/)) **[docs]**, and the menu additionally offers Feature Flags, which are Safari's own preferences and do not reach Orion's bundled WebKit. Safari 26.2 on the dev's Mac runs WebKit 623, one step behind Orion's 625; nothing in this note depends on the difference except that Event Timing is present in both. Safari Technology Preview carries its own WebKit again ([webkit.org/downloads](https://webkit.org/downloads/)) and is not what Orion runs.

---

## 4. Does a rAF watcher see what Phaser sees?

### 4.1 One rendering update, one callback list

The HTML standard's *run the animation frame callbacks* takes the document's map of callbacks, gets its keys, and for each handle still present invokes the callback with the same `now` — [html.spec.whatwg.org, Animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames) **[docs]**. WebKit does that literally: [`ScriptedAnimationController::serviceRequestAnimationFrameCallbacks`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/dom/ScriptedAnimationController.cpp) copies `m_callbackDataList`, runs every callback not yet fired or cancelled in stored order in one pass, and defers callbacks registered during the pass to the next frame **[source]**. Two consequences:

- A watcher registered with `requestAnimationFrame` in `hud.js` and Phaser's `TimeStep` callback run in the **same** rendering update with the **same** timestamp. A gap between two of the watcher's callbacks is, to the millisecond, the gap between two of Phaser's.
- Registration order decides who runs first inside the frame, not who sees the gap. The watcher measuring `now − previousNow` is independent of that order; a watcher measuring `performance.now() − now` (how late the frame started relative to its timestamp) is not, and is not needed.

### 4.2 Throttling is per page, so it is the same for both

`ScriptedAnimationController::throttlingReasons()` returns `page->throttlingReasons() | m_throttlingReasons` **[source]** and the interval is [`preferredFrameInterval(reasons, nominalFramesPerSecond, preferFrameRatesNear60FPS)`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/graphics/AnimationFrameRate.cpp) with the constants in [`AnimationFrameRate.h`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/graphics/AnimationFrameRate.h) **[source]**:

| reason | interval |
|---|---|
| none | `FullSpeedAnimationInterval` 15 ms (60 fps), or the display's nominal rate when not preferring ~60 |
| `VisuallyIdle`, `LowPowerMode`, `NonInteractedCrossOriginFrame`, `AggressiveThermalMitigation` | `HalfSpeedThrottlingAnimationInterval` 30 ms, `IntervalThrottlingFactor` 2 |
| `OutsideViewport` | `AggressiveThrottlingAnimationInterval` 10 s |

`Page` adds `LowPowerMode` from `m_lowPowerModeNotifier->isLowPowerModeEnabled()` and `ThermalMitigation` from `m_thermalMitigationNotifier->thermalMitigationEnabled()` ([`Page.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/Page.cpp)) **[source]**. Whatever the reason, it halves or stops *both* loops; there is no path that throttles one `requestAnimationFrame` client and not another in the same document. Two measurement consequences: **Low Power Mode on the Mac turns every frame into a 30 ms frame** and would double the baseline, so the session must have it off; and a hidden or occluded tab stops delivering frames, so a watcher must discard gaps that span a `visibilitychange`.

### 4.3 Phaser's loop

[`Phaser.Core.TimeStep.start`](https://raw.githubusercontent.com/phaserjs/phaser/master/src/core/TimeStep.js) hands its `step` to [`Phaser.DOM.RequestAnimationFrame.start(step, forceSetTimeOut, delay)`](https://raw.githubusercontent.com/phaserjs/phaser/master/src/dom/RequestAnimationFrame.js), which does `window.requestAnimationFrame(this.step)` unless `forceSetTimeOut` is set, and records the choice in `isSetTimeOut` **[source, phaser `master`; the game runs Phaser 3.90.0 per `research/safari-main-world` [measured]]**. On blur `inFocus` drops; on focus `resetDelta()` runs; when hidden, the pause is timed and subtracted on resume; with `smoothStep` the delta history clamps a long gap to the minimum-FPS delta so the simulation does not leap **[source]**. So the game's own `game.loop` carries `actualFps`, `delta`, `rawDelta` and `raf.isSetTimeOut`, all readable from the MAIN world; if `isSetTimeOut` is ever true the watcher and the game are on different clocks and the comparison is void — the checklist reads it once.

### 4.4 The tick's own timer

The tick is a 1000 ms `setInterval`. In [`DOMTimer.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/DOMTimer.cpp) repeating timers clamp to `minIntervalForRepeatingTimers` 1 ms, to 4 ms past nesting level 5, and to `minIntervalForNonUserObservableChangeTimers` 1 s only for timers whose script made no user-observable change; alignment to a coarse grid comes from `Page::setTimerThrottlingState` when the page loses `ActivityState::IsVisible` (`hiddenPageDOMTimerThrottlingEnabled`), with `m_domTimerAlignmentInterval` growing on `m_domTimerAlignmentIntervalIncreaseTimer` **[source]**. A visible tab's one-second tick is neither clamped nor aligned; it fires as a plain task between frames, and any frame it delays is the watcher's to see. (Chrome: foreground timers are untouched unless under 4 ms at chain depth ≥ 5; hidden tabs align to 1 s, then to 1 min after five minutes; rAF "will wait for the page to be visible" — [developer.chrome.com/blog/timer-throttling-in-chrome-88](https://developer.chrome.com/blog/timer-throttling-in-chrome-88) **[docs]**.)

### 4.5 So

Yes: a rAF cadence watcher in `hud.js` sees the same stalls Phaser's loop suffers, on Orion as on Chrome, because both are one document's animation frame callbacks under one throttling set. What it does not see is *why* — for that the watcher has to be told which stage was running, and only the panel knows.

---

## 5. Chrome, for the second engine

### 5.1 Long Animation Frames

Chrome 123+ ([developer.chrome.com/docs/web-platform/long-animation-frames](https://developer.chrome.com/docs/web-platform/long-animation-frames)) **[docs]**; the spec is [w3c.github.io/long-animation-frames](https://w3c.github.io/long-animation-frames/) **[docs]**. A `long-animation-frame` entry is any task, or task plus the rendering update it forces, over 50 ms, with `blockingDuration` (the part over 50 ms per task), `renderStart`, `styleAndLayoutStart`, `firstUIEventTimestamp`, and `scripts[]`: for each script that ran, `invokerType` (`user-callback`, `event-listener`, `resolve-promise`, `reject-promise`, `classic-script`, `module-script`), `invoker` (a timer callback is named by its handler kind and `setInterval`/`setTimeout`; a listener by target, event type and id or src), `sourceURL`, `sourceFunctionName`, `sourceCharPosition`, `executionStart`, `duration`, `forcedStyleAndLayoutDuration`, `pauseDuration`, `windowAttribution`. That is the attribution WebKit will not give: the tick's `setInterval` callback, in `hud.js`, at a character offset, with how much of the frame it took. `longtask` (Chrome 58, [w3c.github.io/longtasks](https://w3c.github.io/longtasks/)) is weaker: its `TaskAttributionTiming` names only the container (`containerType/Src/Id/Name`), never a script **[docs]**.

### 5.2 The Performance panel and CDP

- The DevTools Performance panel extensibility API ([developer.chrome.com/docs/devtools/performance/extension](https://developer.chrome.com/docs/devtools/performance/extension)) **[docs]**: `performance.mark`/`measure` with `detail: { devtools: { dataType: "track-entry" | "marker", track, trackGroup, color, properties, tooltipText } }` draw on a named custom track ("Show custom tracks" in capture settings); markers go to the Timings track where plain User Timing already appears; `console.timeStamp(label, start, end, track, trackGroup, color)` is the zero-cost variant that exists only for DevTools. WebKit ignores `detail.devtools` and still records the `mark` as a TimeStamp (§3.3), so one set of calls serves both.
- Over CDP the panel is the `Tracing` domain (`Tracing.start` with categories, `dataCollected`, `tracingComplete`) and the `Profiler` domain (sampled call frames with URL, function, line) — [chromedevtools.github.io/devtools-protocol/tot/Tracing/](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/), [/tot/Profiler/](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/) **[docs]**. This repo's Chrome path already speaks CDP (`read.sh chrome` uses `Runtime.evaluate` on port 9222), and the installed `chrome-devtools-mcp` exposes `performance_start_trace` (`reload`, `autoStop`, `filePath` "to save the raw trace data"), `performance_stop_trace` and `performance_analyze_insight` — [docs/tool-reference.md](https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/docs/tool-reference.md) **[docs]**. The saved trace loads into DevTools' Performance panel or Perfetto.
- `chrome://tracing` / Perfetto ([ui.perfetto.dev](https://ui.perfetto.dev)) is the same trace-event stream with every process and thread (compositor, GPU, raster) rather than the renderer main thread alone; nothing in #480 needs it unless a stall turns out not to be on the main thread.

### 5.3 What the panel can rely on, per engine

| | WebKit (Orion, Safari) | Chrome |
|---|---|---|
| script named by the engine, on-page | no | `long-animation-frame.scripts[]` |
| input-to-paint, on-page | `event` (Safari 26.2+, Orion 625) | `event` (Chrome 76) |
| stage timings, on-page | only what the panel records | same, plus LoAF cross-check |
| off-page recording | Web Inspector Timelines → JSON; 1 ms sampler with function/URL/line | Performance panel / CDP trace → JSON; sampler; custom tracks from `measure` |
| driven by the agent | `read.sh orion` via Apple Events reads counters; no inspector automation | `chrome-devtools-mcp` records the trace itself |
| yielding primitives for a fix | no `requestIdleCallback` (only behind an experimental flag — [caniuse](https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/requestidlecallback.json)), no `scheduler.postTask`/`yield` ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Scheduler.json)); `setTimeout`, `MessageChannel`, `requestAnimationFrame` only | all of them |

The last row is for the mitigation tickets, not this one: anything that chunks the tick on WebKit has to do it by hand.

---

## 6. Where the attribution has to come from

Putting §2–§5 together, on Orion there are three witnesses, and each covers what the others cannot:

1. **The panel's own clock, per stage.** The only thing that says *which* stage. 1 ms coarse (§2.2), page-side, cheap, and readable by the agent through `read.sh orion` at any moment of the session.
2. **A frame-gap watcher in the panel.** The only page-side witness of the *game's* stall (§4). Meaningless unless every gap carries the stage that was running, so it has to be one mechanism with (1), not a separate script.
3. **Web Inspector's Timelines export.** The only witness with stacks and with the frame's Script/Layout/Paint split, and the only one that can say a long frame was *not* the panel (game code, layout, GC). It is off-page, needs the player's hands, and reads against (1) only if the panel drops `performance.mark`s into it.

Event Timing is a fourth, narrow witness — the player's key press that got stuck — and the strongest single number for the freeze the map describes, because the engine timed it.

Nothing on Orion attributes a stall to a script without (1)+(2); Web Inspector on its own would attribute it to a function but not to a card, a wave or a stage. On Chrome, LoAF makes (1)+(2) verifiable rather than unnecessary: the instrumentation must be the same on both engines or the before/after numbers the map demands are not comparable.

---

## 7. Recommendation

### 7.1 What the panel must record itself

For the instrumentation ticket that precedes #485. All of it in `hud.js`, in the MAIN world, kept small enough to be part of the cost it measures.

1. **Per-stage timings inside the tick.** Around each stage — `rerollCheck`, `previewCheck`, `readCard` (and inside it the turn read as its own stage, since it calls the game's own code), `journalCheck`, the draw (`shownGroups()` → `KIND[kind].draw`), the DOM write (`el.replaceChildren`), `stream()`/`wireCard` — record `count`, `lastMs`, `maxMs`, `totalMs`, and keep a ring of the last ~300 ticks as `{t0, stages: {name: ms}, kind, wave}` with `t0` from `performance.now()`. Card `kind` and `wave` on every entry, so a stall can be read as "rewards card, wave 43, draw stage" without the inspector.
2. **A frame-gap watcher stamped with the stage.** One `requestAnimationFrame` loop for the life of the page: on each callback compute `gap = now − prev`; when `gap ≥ 50 ms` (LoAF's threshold, so Chrome's entries and ours count the same thing) push `{t: prev, gap, stage, kind, wave, hidden}` where `stage` is whatever the tick set into a module-level "current stage" variable if the tick's `[t0, t1]` overlaps `[prev, now]`, else `null` — the null ones are the game's own stalls, the baseline. Drop or flag gaps that span a `visibilitychange`. Keep totals: frames, gaps ≥ 50 ms with a stage, gaps ≥ 50 ms without one, worst gap of each. **The watcher must outlive `__coachHud.stop()`**: the baseline waves in #485 are played with the panel stopped, and today `stop()` tears everything down; the watcher should sit under its own handle (say `__coachHud.watch`) that `stop()` leaves running, or `stop()` should take a flag.
3. **An Event Timing observer.** `new PerformanceObserver(cb).observe({type: "event", durationThreshold: 16})` plus `first-input`; record for each entry `{name, startTime, processingStart, processingEnd, duration, stage-at-startTime, kind, wave}`. This is the engine's own timing of the player's key press through the freeze; the observer costs nothing on Orion (Safari 26.2's API, present in WebKit 625) and is silent on Safari < 26.2 without failing. Guard it with `PerformanceObserver.supportedEntryTypes.includes("event")`.
4. **`performance.mark` at every stage boundary, and a `measure` per stage.** Names like `coach:tick`, `coach:readCard`, `coach:draw`, each `measure` with `detail: { devtools: { track: "coach" } }`. On WebKit the marks become TimeStamp markers in a Timelines recording and the measures cost a signpost check; on Chrome the measures draw the stages on their own track and LoAF entries line up with them. Also mark `coach:gap` from the watcher when a stamped gap is recorded, so the export shows where the panel *thinks* it stalled next to where the sampler says it did.
5. **The facts the numbers need to be read.** Once, at start: `navigator.userAgent`, `self.crossOriginIsolated` (1 ms vs 20 µs clock), `Phaser.VERSION`, `game.loop.raf.isSetTimeOut`, `screen` dimensions and `devicePixelRatio`, `document.visibilityState`; and on every read, `game.loop.actualFps`.
6. **A read for all of it.** `__coachHud.stats()` grows to return the stage table, the watcher's totals, the gap ring, the event entries and the facts, as one JSON — the probe already reads `stats()` through `read.sh`, so the agent pulls it on Orion via Apple Events without the player pasting a thing. A `__coachHud.statsReset()` marks the boundary between scripted moments.
7. **On Chrome only, a LoAF observer** (`type: "long-animation-frame"`, guarded by `supportedEntryTypes`) recording each entry's `blockingDuration` and its `scripts[]` filtered to `sourceURL` ending in `hud.js`, with `sourceFunctionName` and `sourceCharPosition`. This is the engine checking (1)+(2); a stage the watcher blames that LoAF never names is a bug in the instrumentation.

Not recommended: a `MessageChannel`/`setTimeout(0)` ping as the stall detector. It measures task-queue latency, which is not what the player sees; the frame gap is, and §4 shows it is the same gap Phaser gets.

### 7.2 What the played session on Orion should capture

For the checklist #485 hands the player. Each line is something the player must do or say; the agent does the reading.

Before playing:

- Orion › About: the Orion version; `sw_vers` for macOS; the WebKit build from the release notes for that Orion (§3.1). Whether Orion updated itself since the last session.
- **Low Power Mode off** (System Settings › Battery) and the Mac on power; no other heavy app. §4.2: Low Power Mode halves every frame and would double the baseline.
- The pokerogue.net tab **visible, in the front window, not occluded, not zoomed out** for the whole recording; no tab switching while a recording runs. If the player must switch, say so and the agent discards that segment.
- Develop › *Allow JavaScript from Apple Events* on for the session, off afterwards (`skills/coachemon/SKILL.md`).
- Open Web Inspector on the game tab (Develop menu, or `⇧⌘C` and close the element pane), Timelines tab; enable **JavaScript & Events**, **Layout & Rendering** and the **Rendering Frames** view; leave Memory, Screenshots and JavaScript Allocations off. Confirm once that a `hud.js` frame appears in the call tree by its extension URL — that is the name the sampler will use (§8).
- Agent reads `stats()` once for the facts (7.1 item 5) and resets.

Per scripted moment (the list in #485: trainer fight with an enemy switch, own switch-out, a levelling KO, the shop, a move-learn prompt, a mystery encounter, then two waves with the panel stopped):

- Player presses space in Timelines to start, plays the moment, presses space to stop; **Export (`⌘S`)** as `<moment>.json` into one folder. One recording per moment, under a minute each, so the files stay small and the sampler's stacks stay readable.
- Player says "done"; the agent runs `read.sh orion hud` (or the stats read) and `statsReset()`.
- Player notes, in a word, when they *felt* the freeze ("after my Thunderbolt", "when the shop opened") — this pairs with the Event Timing entry and the stamped gap.
- For the baseline waves: `__coachHud.stop()` with the watcher left alive (7.1 item 2), same recording, same read.

The two facts the code cannot know (from #485): `i18next.resolvedLanguage` in the console, and whether `__coachHud.stats()` reports a sprite the panel keeps failing to find.

What to paste back: the folder of `.json` exports attached to the ticket, and nothing else by hand — the counters come through `read.sh`. If Apple Events cannot be enabled, the player runs `copy(JSON.stringify(__coachHud.stats()))` in the console after each moment and pastes.

What the agent does with an export: parse `recording.records` for frames over 50 ms and their Script/Layout/Paint split, `recording.markers`/TimeStamp records for the `coach:*` marks, and `recording.samples` for the stacks inside each long frame, then compare with the stamped gaps from `stats()`. Agreement on Orion, plus LoAF's `scripts[]` on a Chrome repeat of the same moments, is the attribution the map asks for.

---

## 8. Unverified

Listed rather than written down as fact; the session in #485 settles the ones marked *session*.

- **Orion's inspector menu item and shortcut.** Documented: the Develop menu exists, Inspect Element is `⇧⌘C` (2022). Not documented: the item's exact name and whether `⌥⌘I` works on every page (one tracker thread says it does not on some sites). *Session.*
- **How `hud.js` is named in Orion's call tree.** Orion's extension origin has been seen as both `moz-extension://` and `chrome-extension://` (`research/orion-transport`); the sampler reports `stackFrame.url()`, so the frames will carry one of those, but which, and whether the WXT wrapper hides the module-level names, is unobserved. `hud.js` is comment-stripped but not minified (`extension/src/build/artifact.ts`), and its functions are `const name = () =>` bindings whose names JSC infers, so the sampler should name them. *Session.*
- **Whether pokerogue.net is cross-origin isolated** (20 µs vs 1 ms clock). The panel records `crossOriginIsolated`. *Session.*
- **Whether the game forces `setTimeout`** (`game.loop.raf.isSetTimeOut`). Phaser defaults to rAF; PokéRogue's config was not read. *Session.*
- **The export's size** for a one-minute recording with the JS sampler on. Unmeasured; the checklist keeps segments short.
- **The signpost route** (`measure` → Instruments via `WebKitPerformanceSignpostEnabled`) on Orion: the variable is read in the WebContent process, and whether Orion's bundled WebKit's XPC services inherit it from a `launchctl`/`open --env` launch is untested. Not needed for #485.
- **Whether Safari's Web Inspector can be pointed at Orion's tabs** through the `isInspectable` path. Orion has its own inspector, so this was not pursued.
- **The refresh rate Orion actually drives** on a ProMotion display (`preferFrameRatesNear60FPS` exists in `preferredFrameInterval`; which value Orion passes is unread). The watcher's frame count over a known interval answers it. *Session.*
