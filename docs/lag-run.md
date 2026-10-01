# The lag run

The repeatable measurement every before/after comparison of the overlay's lag is judged by (#484, built in #499,
extended to wave 50 in #508). One run is autoplay on the Orion tab through the store hub: it starts a fresh Classic run
with a fixed team in a spare save slot, plays waves 1–50 acting on the card's act line (switch, learn, shop) and its catch line, and
drains the overlay's meter after every action. A comparison is 3 runs before and 3 after, back to back, on the same day and the same game build.

## Setup

Once per machine:

- **Orion with the Coachemon store build of the commit under test.** `cd extension && npx wxt build -b chrome --mode
  store`, then load `extension/.output/chrome-mv3-store/` in Orion's extension manager. The meter's `drain` and the
  `driver` stamp are in it from #499 on; an older build makes the run stop at its first drain with `no meter to
  drain`. The game's language and missed sprites are in it from #504 on; an older build's report says `not in this
  build` for both.
- **Develop → Allow JavaScript from Apple Events** on in Orion. The run reads the meter and reloads the tab through
  AppleScript, as `read.sh orion` does.
- **Auto-play allowed for pokerogue.net** in Orion's website settings. The run reloads the tab, and WebKit keeps a
  reloaded page's audio locked until a real click; the heal after every boss wave waits on its jingle, so a locked
  tab hangs on a black screen at wave 10. The run checks after the reload and stops with `audio-locked`.
- **A spare save slot.** Pick one of Slot 1–5 on the save-slot screen that holds nothing of yours: every run
  overwrites it. `--slot` is 0-based, so Slot 5 is `--slot 4`.
- **The fixed team is unlocked.** Larvitar, Machop and Growlithe (10 points) unless `--team` says otherwise. Keep
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

The run refuses to start on a hidden tab, with Low Power Mode on, or with the tab's audio locked (`audio-locked`). It
reloads the tab, waits for the title screen, starts the run and plays until the first command of wave 51, a lost run
(`status:run_over`), a refusal, or a wave that has not ended in 1000 calls (`stalled:<screen>`). The server's `stuck`
verdict is only advice: the run goes on. A lost battle is retried up to three times a wave, or once per benched mon with a bigger party. A retry replays the battle's
seed, so the same plays would lose the same way: each retry opens by switching to the next benched mon, round the bench
again once it runs out. At the first read of every wave it asks `get_state` what the wave is (battle type, double,
trainer, boss, the party's levels), a hub command like any other. Each action prints a line (`card` or `rule`: whether
the card decided it). It ends with a summary line carrying the game's language and missed sprites, and the log is at
`.cache/lag-run/<start time>.jsonl`.

Options: `--team A,B,C` changes the team, `--waves N` the length (keep 50 for a comparison), `--log <file>` the log's
path. `--reroll` rerolls once a shop, ahead of the buys, wherever the card's act line can pay for it, so the shop
card's draw after a reroll is measured (#516); it spends money a comparison's runs don't, so a comparison leaves it off.

The team grows by the card's catch line: where it says `catch <mon> — <ball> <odds>`, the run throws that ball, up to
three a wave. Into a full party it throws only when the line says `party full: replaces <mon>`, and releases that
mon. It takes an EXP item (EXP. All, the EXP. Charms, Lucky and Golden Egg), else a Rare Candy, ahead of the card's reward, since only the
mons that fight earn EXP otherwise. The three starters alone lose the gym leader at wave 30, and a caught bench left
to fall behind loses at wave 35 (#508).

`--team coach` takes the first team the starters card proposes: the run opens the grid, reads the card, backs out to
the title and starts with that team. The log's `team` record names it; a comparison passes those names to `--team` so
every run of it plays the same team.

**A run that lost its tab** (closed, or the page crashed) stops with `no meter to drain`, and the game's session is
saved at the wave it was on. Reopen pokerogue.net in front, check no `node src/server.ts` of the stopped run is left
holding the tab (every press is refused `contended` while one is), and take it back up:
`npm run lag:run -- --slot 4 --resume .cache/lag-run/<run>.jsonl`. It skips the reload and the new run, appends to
that log, and its summary counts both parts' calls and play time; the minutes with no tab are not in it.

**A usable run** reached wave 30. One that stops at wave 51 (`waves-reached`) is whole. One that stops earlier, lost
or stalled, counts for the waves it finished: the wave it stopped on is left out of the report, since its numbers
hold a lost battle's retries or a loop. A run that stops before wave 30 is not a lag run: fix what stopped it, or take
it again. A comparison compares a wave only where both sides finished it, and says how many runs a side did.

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

### Per wave

The per-wave table is what every fix ticket reports before and after (#486). A comparison pools, wave by wave, the
runs that finished that wave, and prints each cell as `before → after`.

- **kind** is the wave's battle: `wild single`, `wild double`, `wild boss`, `trainer single` / `double`, `rival`,
  `gym leader`, `elite four`, `champion`, `evil team`, `evil team boss`, `mystery encounter`. A trainer wave shows its
  intro's name, class and all. `?` is a wave whose `get_state` did not answer.
- **what happened** is what the numbers depend on: level-ups (the party's levels at this wave's first read against the
  next's), moves learnt, our faints, our switches and the foe's, catches, shop picks, a `--reroll` run's rerolls, and retries of a lost battle.
- **turn card ms** is a refresh at `CommandPhase` that drew a new battle card: the freeze at a new turn's prompt. p95
  / max and how many.
- **preview recomputes** are refreshes whose `road` stage (the run read) took 5 ms or more: a cached read is under 2.
  In brackets, how many landed in a phase other than a prompt (`CommandPhase`, `CheckSwitchPhase`, `SelectTargetPhase`,
  `SelectModifierPhase`, `LearnMovePhase`, `SwitchPhase`, `SelectBiomePhase`, `MysteryEncounterPhase` and the title
  and starter screens), which is to say inside an animation. Their `road` ms beside.
- **shop card ms** is the wave's first refresh that drew the shop (`rewards`) card.
- **overlay-made hitches** are gaps of 50 ms or more with 34 ms or more of the overlay's refreshes inside, and in
  brackets that overlay ms summed.
- **overlay share of hitch time** is the overlay's ms inside all gaps of 50 ms or more over those gaps' ms. Driver
  gaps count in both.

A refresh belongs to the wave the game was on when it ran; a gap to the wave of the refresh it held, else of the one
before it. So the next wave's encounter, drawn during the last shop pick's window, is the next wave's.

The line above the table says the game's **language** (`prLang`, unset in an English game) and the sprites the overlay
asked the game for and missed, with how often: the evidence for or against the missing-sprite rebuild (#486).

### Shop card by stage

A log whose overlay notes the shop (#516) gets a table of the shop card's draws below the per-wave one: per wave, the
first draw, the first after each reroll (`reroll`) and the first after each buy (`buy`), with the party's size, the TMs
on offer and in the previewed rolls, the refresh's ms and its exclusive stages. Inside `read`, the rewards card's run
read is `shop.run` (the sandbox and the run facts) around `shop.model` (the model's own code), which holds
`shop.ahead` (`aheadModel`), `shop.needs` (the needs and both `planBuys`), `shop.context` (`rewardContext`),
`shop.judge` (the free options) with `shop.tm` (`tmAdvice`), `shop.roll` (`rerollPreview`), `shop.rollJudge`
(`rerollAdvice`) with `shop.rollTm`, and `shop.audit` (`teamAudit`). `odds` is every `doubleOdds` call, wherever it
runs. `read` keeps what is left: the screen checks and the account read.

### Per moment

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
- **driver gaps** are gaps a hub command's page work took more of than the overlay's refreshes. They are the
  measurement's own cost, reported apart with their own p50 / p95 / max and never compared. Only the command's
  synchronous work in the page is the driver's: the animations and phases a press sets off are the game's, and land in
  ordinary gaps. A drain that runs between a refresh and its frame leaves the gap charged to that refresh from #515's
  build on; an older build's log files it with the overlay at about 0 ms, and its overlay share is too low.
- **card: <kind>** rows cut the same numbers by the card up at the time: a gap goes to the card its refreshes drew, else
  the card last drawn before it.
- A moment **not met** on either side is not compared. Whole-run totals are reported, not judged.

The log keeps each window's raw ticks and gaps (stage by stage), so a cell that moves can be traced to the refreshes
behind it.

## Cost

No human time once set up. Waves 1–20 took 9–15 min (#486), so expect 25–40 min for waves 1–50 and about 3 h for a
comparison of 6 runs. Expect more runs to stop early than at wave 20: a lost run, a screen autoplay can't handle. The
trainer switch-out moment was not met in the wave-20 baselines: the card rarely plays a switch-out.
