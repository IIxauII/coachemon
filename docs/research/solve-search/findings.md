# How should a solve search a fight, and what does it cost the player's machine?

Research for "How should a solve search a fight, and what does it cost the player's machine?", part of the map
"seed-exact fight knowledge for the player". It builds on:

- ADR 0003, "Solving a fight on the seed is an opt-in plugin feature, never the extension's";
- the findings on `research/gordie-w180`, `research/replay-fidelity`, `research/rollout-location` and
  `research/gordie-hud-vs-engine`.

**Setup.** Measured on 2026-10-13 in the shared pinned clone (`v1.12.0.11`, the live **game version**), with Node 26.9.
The machine is an Apple M4: 10 cores (4 performance, 6 efficiency) and 16 GB (`hw.ncpu: 10`,
`hw.memsize: 17179869184`).

**Caveat on load.** The machine was shared. Other sessions and a VM kept the load average between 3 and 7, and it
reached 11.7 during the mid-fight runs. Absolute times are pessimistic. Compare runs with each other, not with other
machines.

Every claim is tagged **[verified]** (measured or read in source here), **[inference]** (follows from what was measured)
or **[unverified]**.

## Answer

**A solve should be an automated beam search over per-turn decisions. It runs on a small pool of long-lived worker
processes that fork from snapshots. The agent does not steer it.**

- **The settled economics were too pessimistic.** **[verified]**
  - One process can play any number of lines, losses included, and it can fork from any decision.
  - A unit of search is then "restore a snapshot, play one turn": about 0.48 s on one worker.
  - The old unit was "boot a process (about 8 s), replay a line from T1 (about 4 s)".
- **On Gordie W180 the beam wins without an agent turn.** **[verified]**
  - Width 8 on 8 workers found a 14-turn win that keeps 5 of 6 alive. It took 1,657 one-turn expansions, 155 s, and a
    peak of 4.5 GB across the pool.
  - The hand-guided line kept 4 of 6 alive over 19 turns.
  - Width 16 found a 9-turn win in 216 s.
- **The beam is fragile, not robust.** **[verified]**
  - Width 1 won in 33 turns. Width 2 found no win in 40 turns, because it looped switching. Width 4 won in 25 turns.
  - At width 8, the heuristic's weight decided everything. Our-HP weight 0.5 won in 14 turns, weight 1 won in 31 turns
    (2,915 expansions), and weight 0 lost every line.
  - At width 8, one of the eight beam nodes carried every win found, for the first five turns.
- **A mid-fight re-solve is cheaper only when the position is late.** **[verified]**
  - From T5 it costs what a solve from T1 costs. From attempt 1's T17 and T19 it took 297–479 expansions (72–89 s).
  - Being off the line is not being lost. From the card's T7 departure the beam found a win with all 6 alive. From
    attempt 1's T9, which the card loses from, it also found a win.
  - From attempt 1's T21 the width-8 beam lost every line within 245 expansions (62 s). That "no answer" was **wrong**:
    the portfolio's width-8 beam at weight 1 found a 10-turn win from the same position, which replayed from T1.
- **A portfolio of three beams is robust where one beam is not, but it costs about three beams.** **[verified]** on
  two roots, on 4 workers; see "Portfolio" in §4.
  - From T1 its first replayed win came at 4,861 expansions, 2.9× the single width-8 beam's 1,657. Its 3,000-expansion
    budget gave up on a fight that is winnable.
  - From attempt 1's T21 it found the win above in 550 expansions (109 s on 4 workers).
- **Recommended defaults.** **[inference]** The basis for each number is in the sections below.
  - `min(cores − 2, 6)` workers, each with a capped heap.
  - A small portfolio of beams, not one beam.
  - A budget of about 3,000 expansions **per beam still running**, not 3,000 in all.
  - Every line replayed from the save before it is shown.

## 1. Harness facts that change the economics

### One process, many lines, losses included **[verified]**

`harness/solve.test.ts` boots the game once, then plays line after line from the T1 save in one vitest process
(`runs/probes/p2-lines-and-fork.txt`):

| Line | Load | Play |
|---|---|---|
| winning line (19 turns) | 0.32 s | 4.36 s |
| attempt 1, lost at T23 | 0.27 s | 5.61 s |
| winning line again, after the loss | 0.27 s | 4.43 s |

Two harness traps had made a loss look fatal:

- **A lost line never reaches `TurnEndPhase`.**
  - Without a fix, `toEndOfTurn()` spins until the harness's 20 s timeout (`test/constants.ts`:
    `TEST_TIMEOUT = 20_000`). Attempt 1 took 25.2 s before the fix and 5.6 s after it
    (`runs/probes/p1-before-fixes.txt`).
  - The fix is a 1 ms watcher. Once `GameOverPhase` is current, it retargets `game.phaseInterceptor` at that phase.
    `PhaseInterceptor.to` reads its target afresh on every pass (`test/framework/phase-interceptor.ts:75-104`).
- **The `getStartingBiome` throw.**
  - It reproduced: before the fix, the reload after a loss threw `TypeError: Cannot read properties of undefined
    (reading 'getStartingBiome')` 24 times out of 24.
  - A fresh `GameManager` in the same process recovers in about 0.5 s. First the test has to do what vitest does
    between tests: `vi.restoreAllMocks()`, then clear `PromptHandler.runInterval`. Otherwise a second `PromptHandler`
    wraps the shared UI's `setModeInternal` spy again, and the calls recurse.
  - With the retarget fix in place, the throw stopped happening: `reloadThrows` was 0 in every later run.

So a process no longer needs to be one line. A worker pays its boot once: 6–9 s of vitest start-up plus about 0.7 s
of game boot. **[verified]**

### Forking from a decision **[verified, after two fixes]**

**What a snapshot is.** It is replay-fidelity's augmented export:

- `getSessionSaveData()`;
- the turn and the RNG state;
- each foe's team index, boss bar and switch counter;
- `tempSummonData` and `waveData`;
- the enemy's on-field `summonData`.

It is taken at a command prompt and restored with `reloadSession()` plus a patch. A restore takes 0.16–0.36 s. The
alternative, replaying from T1, costs about 0.23 s per turn.

**How it was checked** (`runs/probes/c1-chain-fork-bounce.txt`):

- **Fork check.** Snapshot every decision of a line, then restore each one and play the rest of the line. 18 of 18
  matched view for view along the winning line, through the win. 22 of 22 matched along attempt 1, through the loss.
- **Chain check.** Restore, play one step, snapshot, repeat: what a search does. 19 of 19 steps matched along the
  winning line and 23 of 23 along attempt 1.

**The two fixes it needed.** Neither is on replay-fidelity's list:

1. **The toxic counter.** The reload's re-summon resets an on-field mon's `status.toxicTurnCount`. Restored at T15 and
   T16, Tyranitar took exactly 1/16 (36 HP) and 2/16 (71 HP) too little poison. The counter now goes in the snapshot,
   and sleep turns with it.
2. **Aliasing.** `new PokemonSummonData(x)` keeps the arrays it is given. Patched from the snapshot object itself, the
   next turn's stat changes wrote back into the snapshot, so a node restored twice came back changed. A Gyarados
   switch-in's Intimidate stayed on the foe for every later sibling. The first width-8 search "won" on corrupted
   states that did not replay from T1 (`runs/aliased-w8p8.txt`). The fix is to patch from a deep copy.

**Two traps found only in long searched lines** **[verified]**:

- **Forced turns.**
  - On Bounce's second turn the game asks for no command. A move selected anyway leaves its prompts queued, and every
    later step is played one turn late. The queue even survives a reload: a straight replay opened with Hyper Voice
    where Dragon Pulse was asked for.
  - `legal()` now offers only a "wait" step while the active mon has a queued move. Stale prompts are cleared before
    and after every step.
- **Illegal steps.**
  - Asked for a move the game would not offer, the harness plays something else, or waits 20 s.
  - `play()` now checks the step against `legal()` first, so a diverged replay fails at once.

### Forced moves

Bounce's second turn was found by accident. This checks the other turns the game plays for you, on cases built from
the W180 save with the test framework's own overrides: `game.move.changeMoveset` for a moveset, PP set directly, on one
of ours or on the foe's lead (`harness/mkforced.py`, the `forced` job in `solve.test.ts`). Each case is played
chained (restore, step, snapshot, as the search does) and straight from the save, then fork-checked
(`runs/forced/cases.txt`).

| Case | Steps | Forced turns in it | Chained = straight | Fork check | Unasked prompts or timeouts |
|---|---|---|---|---|---|
| Struggle (Snorlax, one Body Slam left) | 6 | 1 Struggle | yes | 5/5 | 0 |
| Struggle with Tera, out and back in | 7 | 2 Struggle, one with Tera | yes | 6/6 | 0 |
| Struggle until Reshiram's Leppa Berry | 2 | none: the berry refills Hyper Voice | yes | 1/1 | 0 |
| Hyper Beam, Giga Impact (Reshiram) | 6 | 1 recharge | yes | 5/5 | 0 |
| Outrage, Thrash, Petal Dance (Reshiram) | 6 | 2 rampage turns, then confusion | yes | 5/5 | 0 |
| Solar Beam, Fly, Dig (Reshiram) | 13 | 5 charge turns | yes | 12/12 | 0 |
| Bounce (Gyarados, as saved) | 7 | 2 | yes | 6/6 | 0 |
| Foe Gigalith with only Hyper Beam | 8 | 1 foe recharge | yes | 7/7 | 0 |
| Foe Gigalith with only Outrage | 8 | 4 forced foe turns over 3 Outrages, confused in between | yes | 7/7 | 0 |
| Foe Gigalith with only Fly | 8 | 1 foe charge | yes | 7/7 | 0 |

- **Struggle was broken; it is fixed.** **[verified]** in source, the fix **[verified]** by the table.
  - `legal()` listed only moves that pass `isUsable`, so a mon with no PP was offered only switches. As the last mon
    standing it was offered nothing, and the search dropped the node without a word: an empty action list expands to
    no children. **[inference]** from `search.py`, not run.
  - The game turns any fight command into Struggle when no move is usable (`CommandPhase.handleFightCommand`,
    `useStruggle`). The move helper refuses a move with no PP, so `play()` sends that fight command itself.
  - `legal()` now offers Struggle, and Tera Struggle while Tera is available, exactly when no move is usable.
  - In the Leppa case `legal()` went back to offering Hyper Voice once the berry refilled it, and offered no Struggle.
- **Recharges, rampages and charge moves were already right.** **[verified]** The Bounce fix (a queued move means
  "wait") covers them. Every forced turn was offered as "wait" only, and the game asked for nothing: no step left an
  unasked prompt and none timed out.
- **The queue check now mirrors the game.** `CommandPhase.tryExecuteQueuedMove` first drops queued moves the mon can no
  longer use, and asks after all when one is missing from the moveset. `legal()` copies that rule now. **[verified]**
  in source. No case reached it (Gravity under Fly, say, or Disable during a rampage). **[unverified]**
- **The state signature now carries the on-field move queues**, so the search cannot merge two nodes that differ only
  by a pending recharge, rampage turn or charge turn. **[verified]** that this changes nothing in W180: see the
  regression below.
- **What a save keeps for these states.**
  - **Ours: everything.** **[verified]** The save holds the active mon's `summonData.moveQueue` and the `RECHARGING`,
    `FRENZY` (with its turn count), `CHARGING`, `FLYING` and `UNDERGROUND` tags. After the reload they came back
    unchanged at every decision in every case. PP and a used Leppa Berry come back too.
  - **The foe's: nothing without the augmented export.** **[verified]** With the foe's on-field `summonData` patch
    turned off (`SS_NO_ENEMY_SUMMON=1`, `runs/forced/cases-no-enemy-summon.txt`), the reload came back with an empty
    queue and no tags where the foe was recharging, mid-Outrage or in the air. All three foe cases then split from the
    straight replay at the next step: 7 differing steps each, and 1, 6 and 1 fork mismatches.
  - So replay-fidelity's field "the enemy's on-field `summonData`" is load-bearing for forced foe turns, and the field
    list needs nothing new for them. **[verified]** Our own confusion surviving a restore was not reached: the
    confused Reshiram fainted on the same turn. **[unverified]**
- **A side effect of editing a benched foe:** giving Carracosta a single move changed which foe the trainer sent in
  next (Tyranitar, not Carracosta). The foe cases edit the lead instead. **[verified]**
- **A search with forced moves in the movesets** (`runs/forced/search-setup.txt`): Reshiram with Outrage, Hyper Beam,
  Solar Beam and Dragon Pulse, and Snorlax with no PP. Width 8 found an 8-turn Outrage sweep, with 5 of its 9 decisions
  forced. It took 565 expansions, with no errors, and 5 of 5 wins replayed from T1. **[verified]** Snorlax never came
  in, so no searched line has a Struggle in it.
- **Regression** (`runs/forced/regress-w8p8-stall6.txt`): width 8, 8 workers, `--stall 6` from T1. It matched the
  `runs/stall/` baseline node for node: the same beam and scores at all 14 layers, 1,657 expansions, the same 21 wins,
  and 5 of 5 replayed from T1. **[verified]**

**What this means for the product** **[inference]**:

- Snapshot forking is sound, but only behind a gate: every line a search finds must replay from the save. That is
  already step 5 of the replay protocol.
- The gate caught both bugs here, and every win reported below passed it.

## 2. Search strategies on Gordie W180

### (a) Agent-steered greedy, as it was played

**From the planning transcript** (`2dc13ff9…`, 2026-10-12, 20:45–21:10 UTC; `harness/brwin.py`) **[verified]**:

- **The search proper** ran 21:04:58–21:08:53. The agent made 6 `br.py` calls of 4–7 alternatives each, about 25 lines
  in all. Each call was one process: about 8 s of boot plus 1–4 s per line.
- **The agent's cost in that window:** 28 turns, 37k output tokens, and 6.7M context tokens read (about 240k per turn).
- **The whole session**, including building the harness and the predictors: 197 turns, 324k output tokens, 33.8M context
  tokens, about 25 minutes.
- **What it leaned on:** attempt 1's loss, the live predictors (`predict.js`, `ai.js`) and the principles in `PLAN.md`.

**What that means for a product** **[inference]**:

- A solve run this way costs an agent turn per batch, with roughly 240k tokens of context each.
- It needs an agent in the loop. The background-job design has none.

### (b) Beam search **[verified]**

**How `harness/search.py` works:**

- At every layer, it expands each beam node by every legal action:
  - each move, and each move with Tera while Tera is available;
  - each switch;
  - each legal replacement when one of ours faints.
- It drops losses and merges children that reach the same state signature.
- It keeps the best W by `Σ foe HP lost + w × Σ our HP fraction`, where w is 0.5 unless stated.
- It stops at the first layer that holds a win, then replays up to five wins from T1.

**Results.** Every run starts from the T1 save on 8 workers (`runs/tally.md`, `runs/sweep/*.txt`):

| W | w | Result | Expansions | Search | Pool peak | Replayed from T1 |
|---|---|---|---|---|---|---|
| 1 | 0.5 | win in 33 turns, 3 of 6 alive | 388 | 52 s | 4.0 GB | 1/1 |
| 2 | 0.5 | no win in 40 turns: loops switching Golbat and Snorlax | 798 | 76 s | 4.8 GB | – |
| 4 | 0.5 | win in 25 turns, 2 of 6 alive | 1,188 | 110 s | 5.5 GB | 4/4 |
| 8 | 0.5 | **win in 14 turns, 5 of 6 alive** | 1,657 | 155 s | 4.5 GB | 5/5 |
| 16 | 0.5 | **win in 9 turns, 5 of 6 alive** | 2,026 | 216 s | 4.9 GB | 5/5 |
| 8 | 0 | every line lost by turn 21 | 1,634 | 146 s | 5.4 GB | – |
| 8 | 1 | win in 31 turns, 4 of 6 alive | 2,915 | 325 s | 5.0 GB | 5/5 |

Pool boot added 14–26 s to every run.

**The decisions it had to get right** (`runs/ancestry.txt`) **[verified]**:

- **Widths 1, 4 and 8 converge on one opening.**
  - Blue Flare or Dragon Pulse, then → Probopass, which eats Gigalith's Explosion at ×¼.
  - Tera Rock Power Gem, then Power Gem into Carracosta.
  - → Reshiram, which sweeps with Dragon Pulse, Fickle Beam and Blue Flare.
- **Width 16 found a different line:** Blue Flare, then **Tera Bug Dragon Pulse** at T3, a Reshiram sweep, and Leavanny
  to finish.
- **None of the found lines uses the hand line's T7 Bug Bite on Carracosta's Enigma.** That turn decides the fight only
  under the card's own continuation. The fight has several unrelated wins.
- **The margin was thin.**
  - At width 8, 1 of 8 beam nodes lay on any win found, at depths 1–5. It was 2 of 8 at depths 6–9, and a majority only
    from depth 12.
  - At width 16 it was 1–2 of 16 at depths 1–5.
  - Together with the heuristic-weight rows, this says one beam configuration can miss a winnable fight.

**What the beam did without: the HUD's turn read.** It was not used. **[verified]**

- Reading the card every turn costs about 1.9 s per turn (40 s against 4 s for a 19-turn line). That is about 4× an
  expansion. **[verified]**
- It could still pay as move ordering in a narrow beam. **[unverified]**

## 3. Concurrency

**Throughput by worker count.** The same workload each time: the first 521 expansions of the width-8 search from T1
(`runs/sweep/p*.txt`). **[verified]**

| Workers | Search | Expansions/s | Per worker | Pool boot | Pool peak | Peak per worker |
|---|---|---|---|---|---|---|
| 1 | 249 s | 2.1 | 2.1 | 6.2 s | 1.5 GB | 1.5 GB |
| 2 | 129 s | 4.1 | 2.0 | 7.3 s | 1.8 GB | 0.9 GB |
| 4 | 78 s | 6.7 | 1.7 | 8.9 s | 2.7 GB | 0.7 GB |
| 8 | 45 s | 11.5 | 1.4 | 15.7 s | 3.5 GB | 0.5 GB |
| 10 | 37 s | 14.2 | 1.4 | 20.6 s | 5.8 GB | 0.6 GB |

What the table shows:

- **Scaling** is near-linear to 2 workers, 80% at 4, and 68% at 8 and 10. This machine has 4 performance cores and was
  already loaded. **[verified]**
- **Memory is elastic, not fixed.** **[verified]**
  - A lone worker's process tree (vitest main plus its fork child) sat near 1.0 GB from its first expansions, and peaked
    at 1.5 GB.
  - With 8–10 workers, each peaked at 0.5–0.7 GB.
  - V8 sizes its heap to the memory it sees, so a heap cap such as `--max-old-space-size` should hold a worker near its
    working set. **[inference]** The cap was not tried, and the floor it reaches is **[unverified]**.
- **One worker's RSS crept** from about 0.27 GB to 0.41 GB over about 190 expansions in a mid-fight run
  (`runs/sweep/mid-a1T9/mem.jsonl`). It may be a slow leak per reload. **[inference]**

**For an 8 GB, 4-core laptop** **[inference]**:

- **Workers and memory.** 2 workers, with heaps capped near 0.6 GB each, leave two cores and about 6 GB for the browser
  running the game and the OS.
- **Speed.** If its cores match a performance core here, 2 workers give about 4 expansions/s.
- **Duration.** A width-8 solve from T1 (about 1,650 expansions) takes about 7 minutes. A late re-solve (250–500
  expansions) takes 1–2 minutes.

## 4. Give-up budget

- **Where wins came.** From T1, the first wins came at 388–2,915 expansions, across every configuration that won.
  Mid-fight, they came at 297–1,681. **[verified]**
- **The one position that ran dry** was attempt 1's T21: Golbat (Tera'd) and Leavanny against Tyranitar, Stonjourner
  and Coalossal. An earlier version of this note said "Golbat alone"; the run's first layer shows Leavanny alive at
  319/497 (`runs/sweep/mid-a1T21/summary.json`). Every width-8 line lost by depth 7, after 245 expansions and 62 s.
  **[verified]** Width 8 with weight 0 also ran dry, at 1,634 expansions, from a position other configurations won.
  - So a beam running dry is not proof that the position is lost. **[verified]** Attempt 1's T21 is winnable: see
    "Portfolio" below.
  - It is still the moment for this beam to stop. **[inference]**
- **Narrow beams can loop without ever losing.** Width 2 spent 40 turns switching. The stall rule ends such a beam but
  does not rescue it: see "Stall rule" below. **[verified]**
- **The suggested budget** **[inference]**, revised after the portfolio runs below:
  - Run a portfolio over one shared pool: width 8 at w = 0.5, width 8 at w = 1, and width 16 at w = 0.5.
  - Stop at the first win that replays from the save.
  - Otherwise stop when every beam has emptied or stalled, or at 3,000 expansions per beam still running, or 40 turns
    past the root. Then say "no answer".
  - 3,000 in all, the first suggestion, is too small: shared three ways, it stopped the T1 solve before any beam won.
  - 3,000 per beam covers every first win seen here, in the beam that found it. In all, that is up to 9,000.
  - Measured on 4 workers, the T1 portfolio took 18 minutes to its first replayed win; at the same rate 9,000 is about
    33 minutes. On a 2-worker laptop it is longer still. That needs a progress line, and it argues for ordering the
    beams rather than sharing fairly: see "Portfolio".

### Stall rule

`--stall 6` drops a child whose foes have lost no more HP than they had lost 6 turns earlier. The searcher counts these
as `stalled_total`. Each width was rerun from T1 on 8 workers with w = 0.5, against its `runs/sweep/` baseline
(`runs/stall/tally.md`, `runs/stall/*.txt`):

| W | Run | Result | Line | Alive | Layers | Expansions to first win (total) | Stalled | Search | Boot | Replayed from T1 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | baseline | no win in 40 turns | – | – | 40 | – (798) | – | 76.4 s | 15.3 s | – |
| 2 | `--stall 6` | beam emptied at depth 37, every line lost or stalled | – | – | 37 | – (753) | 21 | 76.9 s | 28.7 s | – |
| 4 | baseline | win | 25 turns | 2 of 6 | 25 | 1,188 | – | 110.3 s | 13.6 s | 4/4 |
| 4 | `--stall 6` | win, the same 4 lines | 25 turns | 2 of 6 | 25 | 1,188 | 0 | 113.5 s | 25.8 s | 4/4 |
| 8 | baseline | win | 14 turns | 5 of 6 | 14 | 1,657 | – | 154.6 s | 15.3 s | 5/5 |
| 8 | `--stall 6` | win, the same 5 lines | 14 turns | 5 of 6 | 14 | 1,657 | 0 | 158.4 s | 23.3 s | 5/5 |

- **It does not rescue width 2.** **[verified]**
  - The beam was the same as the baseline's, node for node, through depth 30.
  - The foes last lost HP at depth 25, so the rule first fired at depth 31. It cut the beam to one node, which made one
    more chip (Poison Fang on Stonjourner) and then stalled again. Every child at depth 37 was dropped as stalled.
  - Reshiram, Leavanny and Gyarados had fainted by depth 19, and Probopass by depth 30. At depth 30 the best node held
    Snorlax and Golbat against Stonjourner, Tyranitar and Barbaracle. At depth 36 it held Snorlax alone, cycling Rest.
- **Why it cannot rescue** **[inference]**: the rule only prunes once a loop has lasted 6 turns. Width 2 lost the fight
  earlier, while it was still dealing damage. A tighter window would fire sooner, but from the same weak position.
- **It turns an endless loop into an honest "no answer".** **[verified]** Without it, width 2 ran until the 40-turn cap,
  and with no cap it would loop until the expansion budget. With it, the beam emptied after 753 expansions, 45 fewer.
  The saving in time was nil: the looping layers cost about 0.4–0.7 s each.
- **It costs nothing when it does not fire.** **[verified]** At widths 4 and 8 it dropped no node. The beam at every
  layer, the winning lines, the expansions to the first win and the replays from T1 all matched the baselines exactly.
  - The 2–3% longer searches and the 8–15 s longer boots are machine load: the load average was 5–10.5 during these
    runs, against 3–7 for the baselines. **[inference]**
  - The lower pool peaks (2.7–4.0 GB against 4.5–5.5 GB) are memory elasticity under a different machine load, not
    the rule. **[inference]**
- **Not tested: a win that needs 6 turns without damage**, such as setting up or stalling out a foe. The rule would drop
  it. No line found on Gordie W180 needed one. **[unverified]**

### Portfolio

`harness/portfolio.py` runs the three beams of the budget above (W8 at w = 0.5, W8 at w = 1, W16 at w = 0.5, each with
`--stall 6`) as one job on one pool (`runs/portfolio/`, `runs/portfolio/tally.md`). **[verified]** in source:

- **Interleaving: one shared queue, fair by expansions.** The coordinator holds each beam's jobs and writes at most one
  per worker into the pool. The next job comes from the beam with the fewest actions dispatched so far. The beams
  advance independently, so a beam waiting on the tail of its layer leaves the workers to the others.
- **Dedupe across beams by `sig()`.** A node expansion is keyed by its signature. A beam whose node another beam has
  expanded, or is expanding, waits on that expansion and adopts that node's path, because `sig()` leaves out the RNG.
- **A layer with a win** pauses its beam and replays each of its first five wins from T1 as separate jobs, ahead of
  everything else. The first replayed win ends the job.

**Conditions.** The 4-worker runs were made at the user's request, after the first 8-worker run overloaded the machine.
Load was high throughout: a load average of about 13 on 10 cores, with an unrelated VM using about 1 core. During the
8-worker T1 run with a raised budget, swap reached 13 of 14 GB and system time 52%; that run was stopped and its
partial log kept (`p8-t1-budget8000-aborted`). The one-minute load averages taken at the start and end of each run
read 2.5–14 (5-minute: 4–16.5). Every wall-clock number below is
pessimistic and only roughly comparable between runs. **[verified]** Expansion counts do not depend on load or on the
worker count: each beam made the same choices on 4 and 8 workers.

| Root | Run | Workers | Result | Found by | Expansions to the answer (pool total) | Search to replayed win | Pool peak | Replayed from T1 |
|---|---|---|---|---|---|---|---|---|
| T1 | single W8, w 0.5, stall 6 | 4 | win, 14 turns, 5 of 6 alive | – | 1,657 | 259 s + 21 s replay | 4.3 GB | 5/5 |
| T1 | portfolio, budget 3,000 | 8 | **no answer**: budget | – | – (3,186) | 320 s | 4.2 GB | – |
| T1 | portfolio, budget 8,000 | 4 | win, 14 turns, 5 of 6 alive: the single beam's line | W8 at 0.5 | 4,861 (4,896) | 1,067 s | 5.1 GB | 5/5 |
| A1:20 | single W8, w 0.5 | 8 | every line lost (`runs/sweep/mid-a1T21`) | – | – (245) | 62 s | 4.5 GB | – |
| A1:20 | single W8, w 1, stall 6 | 4 | win, 10 more turns, 1 of 6 alive | – | 317 | 80 s + 21 s replay | 3.1 GB | 3/3 |
| A1:20 | portfolio | 8 | win, 10 more turns, 1 of 6 alive | W8 at 1 | 606 (664) | 87 s | 3.3 GB | 3/3 |
| A1:20 | portfolio | 4 | the same win | W8 at 1 | 550 (572) | 109 s | 3.4 GB | 3/3 |

What it shows:

- **It is robust where one beam is not.** **[verified]** From attempt 1's T21, which the single width-8 beam called
  lost, the weight-1 beam found a win: Golbat's Tera Toxic, Toxic and Mean Look, then Leavanny finishes with Bug Bite,
  Leaf Storm and Pollen Puff, ending on Leavanny at 38/497. It replayed from T1 3 times of 3. Off the line, late, with
  two mons left, "no answer" from one beam was a false negative.
- **Each beam is exactly its single-beam run.** **[verified]** Layer for layer, the beam paths matched
  `runs/stall/w8p8-stall6` (14 of 14 layers), `runs/sweep/w16p8` (8 of 8) and `runs/sweep/mid-a1T21` (7 of 7).
  W8 at w = 1 matched `runs/sweep/w8p8-ours1` for 19 layers and split at layer 20, where the stall rule (absent from
  that baseline) dropped 56 nodes. Sharing and interleaving change the cost, never the answer.
- **Its time to the first win is about the number of beams times the winning beam's cost, not the best single beam.**
  **[verified]** From T1 it took 4,861 expansions against the single W8's 1,657: 2.9×. The three beams had
  dispatched 930, 942 and 949 actions. It is less than the sum of the three single runs to their first wins
  (1,657 + 2,915 + 2,026 = 6,598) only because the job stops when one wins. Wall-clock was 3.8× (1,067 s against
  280 s), the rest being the replay queueing behind expansions and the load. **[inference]** for the split.
- **It is cheap when beams die fast.** **[verified]** From A1:20 the two weight-0.5 beams emptied or fell behind, and
  the winner took the pool: 550 expansions in all against the single weight-1 beam's 317, 1.7×.
- **Dedupe saves little after the first layers.** **[verified]** From T1, 54 of 392 node expansions were shared, and
  the pool played 4,896 children for 5,454 the beams consumed: 10% saved. From A1:20 it saved 37% (572 for 901),
  because there the beams overlap for most of the short search.
- **The 3,000 budget in all is too small.** **[verified]** It stopped the T1 portfolio with W8 at 0.5 on layer 10 of
  the 14 it needed.
- **Memory.** **[verified]** The 4-worker pool peaked at 5.1 GB. One worker reached 1.8 GB during the search, and
  2.1 GB during shutdown; the 8-worker pools stayed under 1 GB a worker. The coordinator itself peaked at 70 MB.
  A 4-worker pool lets each worker grow, so §6's recycling at 0.75 GB would fire on a long portfolio. **[inference]**
- **What would cut the cost** **[unverified]**: run the beams in an order of preference rather than fairly, the best
  beam first and the others on idle workers. From T1 that would approach the single W8's 1,657; from A1:20 it would
  first spend the W8 at 0.5's 245 before the weight-1 beam got the pool.

## 5. Mid-fight re-solve

Each root below is the T1 save plus a replayed prefix. By the fork check, that is equivalent to an augmented export.
Every run used width 8, w = 0.5 and 8 workers. **[verified]**

| Root | Why it matters | Result | Expansions | Search | Replayed from T1 |
|---|---|---|---|---|---|
| winning line T1–T4 (T5) | on the line, horizon 15 | win, 18 turns in all, 5 of 6 alive | 1,629 | 188 s | 5/5 |
| winning line T1–T6 + the card's T7 (→ Probopass) | off the line at the deciding turn | win, 22 turns, **6 of 6 alive** | 1,681 | 175 s | 5/5 |
| attempt 1 T1–T8 (T9) | the card loses from here | win, 19 turns, 4 of 6 alive | 1,540 | 178 s | 1/1 |
| attempt 1 T1–T16 (T17) | late | win, 21 turns, 4 of 6 alive | 479 | 89 s | 5/5 |
| attempt 1 T1–T18 (T19) | later | win, 25 turns, 2 of 6 alive | 297 | 72 s | 2/2 |
| attempt 1 T1–T20 (T21) | Golbat and Leavanny | every line lost by depth 7; winnable, see §4 "Portfolio" | 245 | 62 s | – |

What the table shows:

- **The horizon cuts the cost only once it is short.** A beam costs about width × branching per remaining turn, so a
  re-solve from T5 costs what a solve from T1 costs. From T17 on, it cost about a quarter. **[verified]**
- **Off the line is not lost.** Both positions the card loses from were winnable. **[verified]** So was attempt 1's
  T21, where this beam emptied: the weight-1 beam won from it (§4, "Portfolio"). **[verified]**
- **Pool boot is a large share of a late re-solve** (18–26 s against 60–90 s of search). That argues for keeping the
  pool warm for as long as a fight has an **oracle line**. **[inference]**

## 6. Recommendation

1. **Automated search, and no agent in the loop.** Run beams over per-turn decisions, with snapshot forking inside each
   worker and a coordinator outside. The agent starts the job and relays the line.
2. **The gate.** Before anything is shown, replay each line found from the wave-start save, or from the augmented export
   for a mid-fight solve. Only then does it become an **oracle line** with **replay** checkpoints.
   **[inference from §1]**
3. **Workers.** Run `min(cores − 2, 6)` long-lived workers, at least 1, each with a capped heap. Recycle a worker that
   passes about 0.75 GB. **[inference]**
4. **Search and budget.** Run the three-beam portfolio of §4 with the stall rule as a stop condition: it ends a
   looping beam at no cost to one that wins, but it does not rescue one. **[inference]**
   - Stop at the first replayed win. Say "no answer" only when every beam has emptied or stalled, has gone 40 turns
     past the root, or has spent 3,000 expansions of its own. One beam emptying is not an answer: from attempt 1's
     T21 it was wrong. **[verified]** for that position.
   - Expect the first win to cost about three times the best single beam (2.9× from T1, 1.7× from attempt 1's T21),
     since the beams share the pool fairly. **[verified]** on 4 workers. On a laptop that is many minutes, so show a
     progress line. **[inference]**
   - Ordering the beams by preference instead of sharing fairly may bring the cost near the best single beam, at the
     price of reaching a winning second beam later. **[unverified]**
5. **Re-solve when off the line.** Run the same search from the augmented export of the decision where the game left the
   line, on a pool kept warm for the fight. **[inference]**
6. **The harness test that pins a game version** should run the fork check and the chain check, not only a known line.
   Four of the traps found here were in harness plumbing, not in the game. **[inference]**

## Second fight

No second trainer-fight export exists. **[verified]**

- **Ivy W145** (`research/gordie-w180`: `docs/research/gordie-w180/w145-ivy-rayquaza.md`) is a log of reads with no
  session export.
- **The encounter oracle's cases** are Mystery Encounters generated from `src/escape-ladder/reviewed.json`, not battle
  exports.
- **The only other save on this machine** is the wave-176 backup the Gordie handoff mentions. Decrypted, it is a wild
  single (Drapion, `battleType` 0). ADR 0003 offers solving for trainer fights only.

The mid-fight roots above are other positions in the same fight, not another fight.

## Files

| Path | What it is |
|---|---|
| `harness/solve.test.ts` | The worker: probe mode (`SS_MODE=probe`) and long-lived job mode (`SS_MODE=worker`) |
| `harness/run.sh` | Copies the test into the shared clone under a unique name, and always removes it |
| `harness/probe.sh`, `mkprobe.py`, `show_probe.py`, `show_lines.py`, `known_lines.py`, `replay.py` | Probes and views |
| `harness/search.py` | The beam coordinator: worker pool, RSS sampling (`mem.jsonl`) and replay of wins from T1 |
| `harness/sweep.sh`, `harness/batch1.sh` | The batch run here: a single search per call, run in sequence |
| `harness/tally.py`, `harness/ancestry.py` | The tables above |
| `harness/portfolio.py`, `harness/ptally.py` | The three-beam portfolio on one pool, and its table |
| `runs/portfolio/` | The portfolio runs on 8 and 4 workers, the 4-worker single-beam baselines, and `tally.md` |
| `harness/brwin.py`, `harness/brcount2.py` | The planning-transcript measurement in §2a |
| `runs/tally.md`, `runs/ancestry.txt` | Every run in one table, and which beam nodes lay on a win |
| `runs/sweep/<run>/summary.json`, `mem.jsonl`, `runs/sweep/<run>.txt` | Raw results of each run |
| `runs/stall/` | The stall-rule reruns at widths 2, 4 and 8, in the same layout, and their `tally.md` |
| `runs/probes/` | The many-lines, fork, chain and Bounce probes, before and after the fixes |
| `harness/mkforced.py`, `harness/show_forced.py` | The forced-move cases (setup, script) and their summary |
| `runs/forced/` | Forced-move cases with and without the foe's `summonData` patch, a search with a forced-move setup (`search-setup.json`), and the width-8 regression |
| `session-w180.json` | The Gordie W180 T1 export, the same file as the kit's |

`solve.test.ts` in more detail:

- snapshot capture and patch;
- a job's `setup`: a moveset or PP edit applied to the T1 save with the test framework's overrides;
- `legal()`, with the game's queued-move rule and Struggle;
- `play()`, with the game-over retarget, the illegal-step refusal, the stale-prompt clearing and Struggle;
- the fork check, the chain check and the `forced` check.

To rerun a single search, or the forced-move cases:

```sh
python3 -I docs/research/solve-search/harness/search.py /tmp/run --workers 8 --width 8 [--prefix A1:20] [--stall 6] [--setup FILE]
python3 -I docs/research/solve-search/harness/portfolio.py /tmp/pf --workers 4 [--prefix A1:20] [--budget 3000] [--beams 8:0.5,8:1,16:0.5]
mkdir -p /tmp/forced && python3 -I docs/research/solve-search/harness/mkforced.py /tmp/forced/job.json
docs/research/solve-search/harness/probe.sh /tmp/forced && python3 -I docs/research/solve-search/harness/show_forced.py /tmp/forced/out.json
```

## Not yet measured

- **The stall rule in a fight whose win needs 6 or more turns without damage to the foes.** It would drop that line.
- **A stall rule that does more than drop a node**, such as widening the beam when every node stalls.
- **The portfolio with the beams in an order of preference**, the best first and the others on idle workers, against
  the fair share measured here.
- **The portfolio's budget per beam** (3,000 of its own) as a stop rule: suggested from the first wins seen, not run.
- **A portfolio of other members**, such as weight 1 at width 16, or weight 0.75. Weight 1 won from attempt 1's T21,
  where weight 0.5 lost at widths 8 and 16; which weights a portfolio needs is open.
- **The portfolio on an unloaded machine.** Its wall-clock here was taken at load averages of 2.5–14.
- **A heap cap** (`--max-old-space-size`) per worker: the RSS it holds a worker to, and what it costs in speed.
- **Worker memory over a long run**, and the recycling count it needs. On 4 workers one worker reached 1.8 GB in an
  18-minute portfolio search.
- **Throughput on an actual 4-core, 8 GB machine.** §3's laptop numbers are scaled, not measured.
- **A second trainer fight.** None exists yet.
- **A real augmented export from the live tab as a root.** The mid-fight roots here were made in the harness.
- **A searched line that uses Struggle.** The forced-move cases play Struggle chained and straight, but the one search
  with a PP-less mon never sent it in.
- **A queued move the game drops before running it**, such as Fly under Gravity or Outrage after Disable. `legal()`
  copies the game's rule for it, untested.
- **Our own confusion across a restore**, as a rampage leaves it. The foe's was covered.
