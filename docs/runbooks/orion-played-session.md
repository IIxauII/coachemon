# A played session on Orion, measured

The checklist for [#485](https://github.com/IIxauII/coachemon/issues/485): the player plays, the agent reads. It is one
session of eight short segments, each a Web Inspector recording plus one read of the panel's meter, and two facts only
the live game knows. The reasoning behind each step is the research note linked from
[#482](https://github.com/IIxauII/coachemon/issues/482).

Commands below run from the repo root. `read.sh` is `skills/coachemon/scripts/read.sh`.

## Once, before playing

1. **The machine.** Low Power Mode off (System Settings › Battery), the Mac on power, nothing heavy running. Low Power
   Mode turns every frame into a 30 ms frame and would double the baseline.
2. **The folder.** `mkdir -p ~/coachemon-485` and a `notes.txt` in it with the Orion version (Orion › About Orion),
   the WebKit build its release notes name, `sw_vers -productVersion`, and whether Orion updated itself since the last
   session.
3. **The tab.** pokerogue.net in the front window, visible, not covered, zoom at 100%. No tab switching while a segment
   runs; if you have to, say so and that segment is played again.
4. **Apple Events.** Develop › *Allow JavaScript from Apple Events* on. Switch it off after the session.
5. **The build.** `read.sh orion stats | jq '.stats.facts | {lang, sprites, fps, setTimeoutLoop, crossOriginIsolated, observes}'`.
   `lang` and `sprites` come from the panel that landed with #485. If both keys are missing, the running panel is older:
   the session still works, and the two facts are answered by hand (below). If `setTimeoutLoop` is `true`, stop and
   say so: the frame watcher and the game would run on different clocks.
6. **Web Inspector.** Open it on the game tab (Develop › Show Web Inspector, or `⌥⌘I`; if neither works, `⇧⌘C` and
   close the element pane). Timelines tab: turn on **JavaScript & Events** and **Layout & Rendering**, show the
   **Rendering Frames** view, and leave Memory, Screenshots and JavaScript Allocations off. Record five seconds of any
   screen and check that a `hud.js` frame shows up in the call tree. Write its URL's scheme (`moz-extension://` or
   `chrome-extension://`) into `notes.txt`.

## Per segment

The meter keeps only its last couple of minutes of refreshes and frame gaps (`RING` in
`skills/coachemon/scripts/hud/01-meter.js`), so every segment is read and reset on its own, and each stays under a
minute of play.

1. In the Web Inspector console: `__coachMeter.reset()`.
2. Start the Timelines recording, play the segment, stop the recording.
3. Export the recording (`⌘S`) into `~/coachemon-485` as `<n>-<segment>.json`.
4. `read.sh orion stats > ~/coachemon-485/<n>-<segment>.stats.json`. Without Apple Events, run
   `copy(JSON.stringify({ stats: (window.__coachHud ?? __coachMeter).stats() }))` in the console and paste it into that
   file instead: the same shape `read.sh` writes.
5. One line in `notes.txt`: where you *felt* a freeze ("after my Thunderbolt", "when the shop opened"), or `none`.

| n | segment              | play                                                                                                     |
|---|----------------------|----------------------------------------------------------------------------------------------------------|
| 1 | `trainer-switch`     | a trainer fight through the trainer sending in, or switching to, its next mon                            |
| 2 | `own-switch`         | switch one of your own mons out mid-fight                                                                |
| 3 | `levelling-ko`       | a KO that levels a party member, through the level-up text                                               |
| 4 | `shop`               | the reward shop after a wave: open it, move the cursor over the items, pick one                          |
| 5 | `move-learn`         | a move-learn prompt, through the choice                                                                  |
| 6 | `mystery`            | a mystery encounter, from its intro to its outcome                                                       |
| 7 | `baseline-1`         | `read.sh orion hud-off` first, then one ordinary wave with the panel off                                 |
| 8 | `baseline-2`         | a second ordinary wave, the panel still off                                                              |

A segment that happens to cover a second moment (a level-up that brings a move-learn) is named for both:
`3-levelling-ko+move-learn`. After segment 8, reload the tab to bring the panel back; `hud-off` has no restart.

## The two facts

Read these from `6-mystery.stats.json`, the last read with the panel on; the baseline segments draw nothing, so their
sprite counts stand still.

- **The game's language** is `.stats.facts.lang`. With an older panel, run `localStorage.getItem("prLang")` in the
  console. `i18next.resolvedLanguage` throws there: the console has no `i18next` global (game-code.md §22). A `null`
  means the page could not reach its storage; ask for `navigator.language` from the console instead.
- **A sprite the panel keeps failing to find** is an entry in `.stats.facts.sprites` with `found: false` whose
  `misses` keeps climbing from segment 1 to segment 6. An entry that turned `found: true` was only a late atlas. With
  an older panel, the agent looks instead for `clock` ticks with `drew: true` on an unchanged `kind` and `wave`: a card
  redrawn every second is the symptom.

## Handing it back

Tell the agent where the folder is. The agent reads the `.stats.json` files and the Timelines exports and posts to #485:

- the per-stage refresh timings per segment
- every frame gap of `GAP_MS` and up (`01-meter.js`), with the panel's stage and milliseconds inside it, the baseline
  segments alongside; a late frame under `GAP_MS` is only counted, in `frames.under`, with no stage
- the Event Timing entries for the key presses that froze
- the language and the sprite answer
- the notes

The exports themselves stay local: they are large, and they are only needed to name the function inside a long frame.
