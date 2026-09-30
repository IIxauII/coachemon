# The lag run

The repeatable measurement every before/after comparison of the panel's lag is judged by (#484, built in #499). One
run is autoplay on the Orion tab through the store hub: it starts a fresh Classic run with a fixed team in a spare
save slot, plays waves 1–20 acting on the card's act line (switch, learn, shop), and drains the panel's meter after
every action. A comparison is 3 runs before and 3 after, back to back, on the same day and the same game build.

## Setup

Once per machine:

- **Orion with the Coachemon store build of the commit under test.** `cd extension && npx wxt build -b chrome --mode
  store`, then load `extension/.output/chrome-mv3-store/` in Orion's extension manager. The meter's `drain` and the
  `driver` stamp are in it from #499 on; an older build makes the run stop at its first drain with `no meter to
  drain`.
- **Develop → Allow JavaScript from Apple Events** on in Orion. The run reads the meter and reloads the tab through
  AppleScript, as `read.sh orion` does.
- **A spare save slot.** Pick one of Slot 1–5 on the save-slot screen that holds nothing of yours: every run
  overwrites it. `--slot` is 0-based, so Slot 5 is `--slot 4`.
- **The fixed team is unlocked.** Bulbasaur, Charmander and Squirtle (9 points) unless `--team` says otherwise. Keep
  the team the same across a comparison.

Before every run:

- **Low Power Mode off** (System Settings → Battery). The run refuses to start while it is on: it throttles the frames
  being measured.
- **Mains power**, and no sleep for the run's length (`caffeinate -dims` in another terminal).
- **One `pokerogue.net` tab in Orion, logged in, in the foreground**: its window in front, not minimised, not covered.
  A hidden tab gets no frames, and a report that says `tab hidden N×` is not comparable.
- **No other driver on the tab**: no Claude session playing, no `watch.ts`.

## Command

```sh
npm run lag:run -- --slot 4
```

The run refuses to start on a hidden tab or with Low Power Mode on. It reloads the tab, waits for the title screen,
starts the run and plays until the first command of wave 21, a lost run (`status:run_over`), or a refusal. Each action prints a line (`card` or `rule`: whether the card decided it). It ends with a
summary line, and the log is at `.cache/lag-run/<start time>.jsonl`.

Options: `--team A,B,C` changes the team, `--waves N` the length (keep 20 for a comparison), `--log <file>` the log's
path.

A run that stops early with `error:` or `status:` is not a lag run: fix what stopped it and run it again.

## Report

One run, or several side by side:

```sh
npm run lag:report -- .cache/lag-run/<run>.jsonl
```

A comparison, 3 runs a side:

```sh
npm run lag:report -- --before <b1> <b2> <b3> --after <a1> <a2> <a3>
```

## Reading it

Every action opens a **window** that runs until the next drain, so the animations an action starts land in its window.
A window counts toward a **moment** when its action met it:

| moment | the window of |
|---|---|
| trainer fight + switch-out | our switch's commit, or a turn where the trainer withdrew its mon, on a trainer wave |
| wave end + level-up/learn | a turn that levelled a mon up or taught a move, and the learn prompt's answers |
| shop pick | every buy and reward pick on the shop |
| faint + replacement | the turn our mon fainted, and sending out the next |

- **tick ms p50 / p95 / max** are the panel's refreshes: the JavaScript of one refresh, per `__coachHud.stats()`
  (#481). Style, layout and paint land in the frame after it, so they show as gaps, not ticks.
- **gaps ≥ 50** are frames that took 50 ms or more, with their p50 / p95 / max. The meter records gaps from 34 ms; the
  report keeps 50 and up.
- **driver gaps** are gaps a hub command's page work ran inside, however little of it. They are the measurement's own
  cost, reported apart with their own p50 / p95 / max and never compared. Only the command's synchronous work in the
  page is the driver's: the animations and phases a press sets off are the game's, and land in ordinary gaps.
- **card: <kind>** rows cut the same numbers by the card up at the time: a gap goes to the card its refreshes drew, else
  the card last drawn before it.
- A moment **not met** on either side is not compared. Whole-run totals are reported, not judged.

The log keeps each window's raw ticks and gaps (stage by stage), so a cell that moves can be traced to the refreshes
behind it.

## Cost

No human time once set up. Wall time per run: 20–40 min estimated in #484, replaced by the baseline's measured figure
on #499.
