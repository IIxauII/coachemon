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
- **A worker leaks about 1.1 MB of live heap per expansion, and it never levels off.** **[verified]** A heap cap
  alone only turns that into an OOM; it costs no speed and changes no answer before then. See "Heap cap and memory
  over time" in §3.
- **On two game-generated stand-in fights the beams won cheaply.** These are Elite Four Lacey (W186) and Crispin (W182),
  with the same team and run seed. **[verified]** See "Second fight (stand-in)".
  - Every recommended beam won, with all 6 alive, in 1,109–2,214 expansions, and every win replayed.
  - Both fights suit this team, so they do not test the fragility Gordie showed. They are weaker evidence than a real
    second export.
- **Recommended defaults.** **[inference]** The basis for each number is in the sections below.
  - `min(cores − 2, 6)` workers, each with a 768 MB heap cap, recycled after 250 expansions of its own.
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
  - "Elastic" was a misreading. A worker's heap grows with the number of expansions *it* has played, and fewer workers
    each play more of the same workload. See "Heap cap and memory over time" below. **[verified]**
- **One worker's RSS crept** from about 0.27 GB to 0.41 GB over about 190 expansions in a mid-fight run
  (`runs/sweep/mid-a1T9/mem.jsonl`). It is a leak: about 1.1 MB of live heap per expansion. See below. **[verified]**

**For an 8 GB, 4-core laptop** (the first estimate, superseded by "Laptop-class pool (approximated)" below)
**[inference]**:

- **Workers and memory.** 2 workers, with heaps capped near 0.6 GB each, leave two cores and about 6 GB for the browser
  running the game and the OS.
- **Speed.** If its cores match a performance core here, 2 workers give about 4 expansions/s.
- **Duration.** A width-8 solve from T1 (about 1,650 expansions) takes about 7 minutes. A late re-solve (250–500
  expansions) takes 1–2 minutes.

### Heap cap and memory over time

`SS_HEAP_MB=N` makes `run.sh` add `--max-old-space-size=N` to `NODE_OPTIONS`. `heap.sh` is `sweep.sh` with that cap and
a memory gate before each run. Each worker writes the heap limit it actually runs under (`v8.getHeapStatistics()`) to
its ready file, and its RSS and heap use after every job go to `heap.jsonl`. With `SS_GC_EVERY=N` it also forces a full
GC every Nth job and reports the heap left after it: the live set. `search.py` now stops when a worker dies, instead of
waiting forever for an answer that will not come, and kills each worker's whole process tree at the end.
Raw runs, tables and per-layer timelines are in `runs/heap/` (`harness/heaptally.py`).

**Load during these runs** **[verified]** (`runs/heap/*.load`): 15:13–15:55, one search at a time. The one-minute load
average was 1.7–3.6, free memory 54–68%, and swap held at 3.40–3.53 GB of 5.12 GB the whole time. This was a quieter
machine than the earlier sections had. No PokéRogue tab was open: the coachemon Chrome profile was running, but its
DevTools target list was empty and it had no renderer process.

**The cap reaches the forked worker.** **[verified]** The fork's environment carried `--max-old-space-size`, and its
`heap_size_limit` was 480, 608 and 864 MB under caps of 384, 512 and 768. The young generation accounts for the extra
96 MB. Uncapped, the limit was 4,192 MB. The vitest parent gets the same cap.

**The 521-step workload** (`--width 8 --budget-children 500` from T1). The 1-worker uncapped row is the first 5 layers
of the long run below. **[verified]**

| Workers | Cap | Outcome | Search | Steps/s | Pool peak | Worker tree peak | Fork RSS peak | Same as `runs/sweep/` |
|---|---|---|---|---|---|---|---|---|
| 1 | none | 521 steps | 238 s | 2.19 | 2.2 GB | 2.2 GB | 1.7 GB | yes, p1 |
| 1 | 768 MB | **OOM** between steps 301 and 521 (a forced GC every 5 jobs) | – | – | – | 1.1 GB | 0.8 GB | yes, up to the OOM |
| 1 | 512 MB | **OOM** between steps 221 and 301 | – | – | – | 1.05 GB | 0.64 GB | yes, up to the OOM |
| 1 | 384 MB | **OOM** between steps 13 and 133 | – | – | – | 0.83 GB | 0.41 GB | – |
| 4 | none | 521 steps | 76 s | 6.86 | 3.2 GB | 0.95 GB | 0.52 GB | yes, p4 |
| 4 | 512 MB | 521 steps | 76 s | 6.86 | 3.5 GB | 0.91 GB | 0.50 GB | yes, p4 |
| 4 | 384 MB | **OOM** of one worker between steps 301 and 521 | – | – | – | 0.74 GB | 0.43 GB | yes, up to the OOM |

"Same" means the same children, distinct states, beam paths and beam scores at every layer. Every OOM is V8's
"Ineffective mark-compacts near heap limit" (`runs/heap/*/oom.txt`). The uncapped rows match the sweep's times (249 s
and 78 s then).

- **The cap does not slow the search before the limit.** **[verified]** The per-layer times of the uncapped and 768 MB
  single workers are equal to 0.2 s (L1–L4: 7.0/75.8/30.9/29.9 s against 7.0/75.9/31.1/30.0 s). At 4 workers, 512 MB
  took 76.0 s against 75.9 s.
- **It does not change the answer.** **[verified]** Every run matched the sweep's beam node for node, as far as it got.
- **It does not lower the pool peak.** **[verified]** A worker is three processes: `run.sh`, the vitest parent and the
  fork that runs the test. The vitest parent holds 350–420 MB through boot and the first layers, and falls to 60–130 MB
  later (`mem.jsonl`: the tree minus its largest process). The pool peak lands in that window, so capping the fork
  leaves it where it was: 3.5 GB capped against 3.2 GB uncapped, at 4 workers. Why the parent's RSS falls (pages
  freed, or compressed by macOS) is **[unverified]**.
- **A cap alone only turns a slow leak into a crash.** It holds a worker down until the live heap reaches it, then the
  worker dies. **[verified]**

**Memory over a long run: a leak, not a plateau.** One worker, width 8 from T1, `--all-wins --budget-children 2000`
(`runs/heap/tally.md`, timelines). **[verified]**

| Layer ending at step | Uncapped: fork RSS (max) | Uncapped: heap after a job | 768 MB: heap after a job | 768 MB: live heap after a full GC (step) |
|---|---|---|---|---|
| 13 | 0.41 GB | 263 MB | 246 MB | – |
| 133 | 0.63 GB | 287–447 MB | 285–434 MB | 303 MB (~73) |
| 221 | 0.75 GB | 454–549 MB | 442–544 MB | 389 MB (~144), 445 MB (~199) |
| 301 | 0.87 GB | 532–692 MB | 530–635 MB | 496 MB (~251), 553 MB (301) |
| 521 | 1.74 GB | 689–1,559 MB | 638–749 MB, then OOM | 697 MB (~440), then OOM |
| 1,031 | 2.59 GB | up to 2.72 GB | – | – |
| 1,657 (first win) | 3.04 GB | up to 3.28 GB | – | – |
| 2,083 | 3.08 GB | up to 3.35 GB | – | – |

A job reports the step count at the start of its layer. The step at each forced GC is estimated from the job's place
in its layer, as if the layer's expansions were spread evenly over its jobs.

- **The live set grows about 1.1 MB per expansion and does not level off.** **[verified]** After a forced full GC the
  heap held 303 MB at about step 73 and 697 MB at about step 440, a straight line of 1.0–1.1 MB per step from about
  220 MB. The worker died soon after, 170 MB short of its 864 MB limit. Uncapped, the heap used after a job kept
  rising to 3.35 GB at step 2,083, and the worker's process tree peaked at 3.4 GB.
- **A worker dies when its live heap comes within about 150 MB of its limit**, the room a job needs for its own
  allocations. **[inference]** from the three OOM windows below.
- **An uncapped worker would also die, at about 3,500 expansions of its own**, when 220 MB plus 1.1 MB a step comes
  within 150 MB of the 4,192 MB default limit. **[inference]** It fits the 4-worker T1 portfolio: about 1,200
  expansions a worker, a live heap near 1.5 GB, and one worker at 1.8–2.1 GB RSS.
- **The uncapped worker slowed as it grew.** **[inference]** It ran at 2.19 steps/s over the first 521 and 1.37 over all
  2,083. Its per-layer rate fell from 6.3–7× slower than the 8-worker sweep's (where each worker stays small) to
  8–9.3× slower by layers 12–13. Some of that is the layers and the load, not the heap.
- **The long uncapped run is the sweep's width-8 search, unchanged.** **[verified]** Its beam matched `runs/sweep/w8p8`
  at all 14 layers. It found the same 14-turn win at 1,657 expansions, which replayed from T1 5 times of 5.
- **Where it leaks is not known.** Each expansion is a restore (`reloadSession()` plus the patch) and one played turn.
  Either could hold on to it. **[unverified]** A heap-snapshot diff would say.

**So recycling is needed, and the cap is its backstop.** **[inference]** A worker lasts about
(heap limit − 370 MB) / 1.1 MB expansions: about 100 at a 384 MB cap, 215 at 512 MB and 450 at 768 MB. The observed
windows were 13–133, 221–301 and 301–521. Recycling after 250 expansions at a 768 MB cap keeps the live heap near
0.5 GB, with about 200 expansions of margin. A recycle costs a boot of 6–9 s, against about 125 s of work for 250 expansions at 2 steps/s:
5–7%.

### Laptop-class pool (approximated)

This Mac is **not** a laptop-class machine. It is an M4 with 4 performance and 6 efficiency cores and 16 GB, against
the 4 cores and 8 GB in question. The runs below only show what 2 and 3 workers do here, with the 768 MB cap. Each worker
played 170–260 expansions, under the 450 a worker lasts at that cap. No game tab was open in the browser (see "Load
during these runs" above), so the browser's own load is not in these numbers. **[verified]**

| Workers | Cap | Search | Steps/s | Per worker | Pool boot | Pool peak | Worker tree peak | Fork RSS peak | Same as `runs/sweep/` |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 768 MB | 125 s | 4.17 | 2.09 | 6.3 s | 2.3 GB | 1.16 GB | 0.72 GB | yes |
| 3 | 768 MB | 96 s | 5.45 | 1.82 | 8.0 s | 2.4 GB | 0.84 GB | 0.59 GB | yes |
| 4 | 512 MB | 76 s | 6.86 | 1.72 | – | 3.5 GB | 0.91 GB | 0.50 GB | yes |

The uncapped sweep ran 2 workers at 4.1 steps/s, so the cap cost nothing here either. **[verified]**

**The laptop estimate, updated** **[inference]**: 2 workers at a 768 MB cap, each recycled after 250 expansions, at
the 4.2 steps/s measured here. This assumes the laptop's cores match an M4 performance core, which is **[unverified]**
and probably optimistic.

- **Memory.** About 1.2 GB a worker at its peak: the fork under its limit plus the vitest parent at boot. That is about
  2.3–2.8 GB for the pool, which leaves about 5 GB of 8 for the OS and the browser running the game.
- **A single width-8 solve from T1** (1,657 expansions): about 6.6 minutes, plus boot and 3 recycles a worker. That is
  about 7 minutes, as §3 estimated.
- **The portfolio from T1.** Its first replayed win came at 4,861 expansions: about 20 minutes, plus about 10 recycles
  a worker (about 1.5 minutes).
- **The portfolio's full budget** (3,000 expansions per beam still running, about 9,000 in all) takes about
  36 minutes before it can say "no answer", and 38–40 minutes with recycles.
- **A late re-solve** like attempt 1's T21 (550 expansions in the portfolio) takes about 2–3 minutes.
- **Without recycling** the 9,000 budget cannot finish on 2 workers. Each worker would play about 4,500 expansions,
  past the roughly 3,500 at which even an uncapped worker exhausts its default heap.

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
  On 4 workers each played about 1,200 expansions, and the leak measured in §3 accounts for that growth. **[inference]**
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
3. **Workers.** Run `min(cores − 2, 6)` long-lived workers, at least 1. **[inference]** for the count.
   - Cap each worker's heap at 768 MB (`--max-old-space-size=768`, a heap limit of 864 MB). It costs no speed and
     changes no answer. **[verified]**
   - Recycle each worker after 250 expansions of its own. Its live heap grows about 1.1 MB per expansion, and at
     768 MB it dies after about 450. A recycle costs 5–7% in boots. **[inference]** from §3's measurements.
   - Recycle by count, not by RSS. Heap use after a job swings by 100–200 MB with the garbage not yet collected, so an
     RSS threshold fires late or at random. If a threshold is wanted as well, use about 0.7 GB of the fork's RSS: its
     RSS around step 301 was 0.79–0.89 GB. **[inference]**
   - The coordinator must treat a dead worker as a lost job, and re-queue it on a fresh worker. `search.py` now stops
     instead of hanging; `portfolio.py` still waits forever. Neither re-queues. **[verified]** in source.
   - Do not count on the cap for the pool peak. Each vitest parent holds 350–420 MB through boot. A product worker
     that is not a vitest run would not pay that. **[inference]**
   - On a 4-core, 8 GB laptop: 2 workers, about 2.3–2.8 GB for the pool, about 7 minutes for a single width-8 beam from
     T1, about 20 minutes for the portfolio's first win from T1, and up to about 40 minutes for its full budget. These
     are scaled from this Mac, not measured on a laptop. **[inference]**
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
   - The stand-in fights support the 3,000 per beam: every first win there came at 1,109–2,214. They say nothing new
     about which weights the portfolio needs, since both weights made the same choices there. **[verified]** for the
     counts, **[inference]** for the reading.
5. **Re-solve when off the line.** Run the same search from the augmented export of the decision where the game left the
   line, on a pool kept warm for the fight. **[inference]**
6. **The harness test that pins a game version** should run the fork check and the chain check, not only a known line.
   Four of the traps found here were in harness plumbing, not in the game. **[inference]**

## Second fight

No second trainer-fight export exists. **[verified]** The stand-in below has the game generate other trainer fights
for the Gordie team instead.

- **Ivy W145** (`research/gordie-w180`: `docs/research/gordie-w180/w145-ivy-rayquaza.md`) is a log of reads with no
  session export.
- **The encounter oracle's cases** are Mystery Encounters generated from `src/escape-ladder/reviewed.json`, not battle
  exports.
- **The only other save on this machine** is the wave-176 backup the Gordie handoff mentions. Decrypted, it is a wild
  single (Drapion, `battleType` 0). ADR 0003 offers solving for trainer fights only.

The mid-fight roots above are other positions in the same fight, not another fight.

### Second fight (stand-in)

**This is not a second export.** It is the same team and the same run seed as Gordie W180. Only the foes are new,
and the game generated them, not us. That makes it weaker evidence than a real second fight: the team, its items and
its Tera are the ones every earlier search used, and the two fights below turned out to suit that team. Raw runs,
scripts and sessions are in `runs/standin/` (`runs/standin/tally.md`).

**How the fights were built** (`runs/standin/construct.test.ts`, `construct.sh`, `construct-out.json`):

- **Which waves can be trainer fights.** **[verified]** in source.
  - In classic mode, waves 182, 184, 186 and 188 are fixed Elite Four battles, 190 is the champion and 195 the rival
    (`src/enums/fixed-boss-waves.ts`, `src/data/trainers/fixed-battle-configs.ts`).
  - Each picks its trainer from a pool with `getRandomTrainerFunc`. `BattleScene.handleFixedBattle` calls it under
    `executeWithSeedOffset(… << 8)`, so the pick depends only on the run seed and the wave.
  - `getRandomTrainerFunc` gives a double battle only to evil-team grunts. Every Elite Four battle is a single.
  - Mystery Encounters happen only on waves 10–180, so none of these waves can be one.
  - Waves 181, 183 and 185 are wild. 181 ends in 1, and `isWaveTrainer` never makes those trainer waves. 183 and
    185 sit within 2 waves of a fixed battle, which also rules out a trainer.
- **The route.** The game's own flow, from the W180 save to the wave. **[verified]**
  - Load the W180 save in the harness. Set Gordie's benched foes to 0 HP and faint the lead with the test framework's
    `doKillOpponents`.
  - Then `toNextWave`, which skips the shop. The game then runs its victory, the biome pick, the wave-181 party heal
    and wave 181, a wild Xatu that is killed the same way. Waves 183 (Grumpig) and 185 (Unown) went the same way.
  - At each Elite Four wave the script keeps the session that `EncounterPhase` hands to `saveAll` before the summon:
    the **wave-start save** that Continue loads, as replay-fidelity's Fix A asks. The test framework's
    `ReloadHelper` stubs `saveAll`, so the script stubs it too and keeps a copy.
  - A first attempt read `gameData.getSession()` instead. It got the stale W180 save back, because `ReloadHelper`
    mocks that call with the session it last loaded. That is the stale-save trap the Gordie handoff hit in a real
    browser.
- **Inputs we chose, and what they change.**
  - **The biome.** After wave 180 the Map offered Ancient Ruins or Construction Site, and the script took Ruins.
    Ruins has no weather or terrain. The choice cannot change the Elite Four trainer or party, which come from the
    seed and the wave alone. **[verified]** for the trainer pick, in source; **[inference]** for the party.
  - **No experience between waves** (`game.override.xpMultiplier(0)`). It touches only experience points. So our team
    reaches the stand-in wave at the W180 save's levels (174–175), moves and items. The two temporary battle items
    ran out by the game's own rules (41 modifiers at W180, 40 at 182, 39 at 186). A real run would arrive a few levels
    higher, since the level cap had risen to 188, so this makes the stand-in harder, not easier. **[inference]**
  - **HP and PP.** Nothing was restored by hand. The game's wave-181 party heal left every member at full HP and PP
    with no status, and the kill turns spent no PP. All of this is in the saves. **[verified]**
- **Checks.** Every one passed for all three waves (182, 184, 186). **[verified]**
  - `battleType` is TRAINER, `mysteryEncounterType` is −1, and the battle is not double. `waveIndex` and
    `gameVersion` (`1.12.0.11`) are right.
  - Each save was reloaded in the same process. The game derived the same `battleSeed`, the same trainer and the same
    six foes, with the same species, levels, HP, moves, abilities, held items, boss bars and Tera types.
  - A second construction run produced identical trainers, parties and battle seeds.

**The fights built** **[verified]** (`construct-out.json`):

| Wave | Trainer | Foes (lead first) | Battle seed |
|---|---|---|---|
| 182 | Elite Four Crispin (fire) | Rotom (Levitate), Exeggutor, Camerupt (Trick Room), Magmortar (Flame Body), Blaziken (boss, 2 bars, passive Defiant), Incineroar | `0x4Rw1CVIMqNgeF9` |
| 184 | Elite Four Amarys (steel) | Skarmory (Sturdy), Reuniclus (Focus Band, Magic Guard), Dugtrio (Substitute), Empoleon (King's Shield), Metagross (boss, 2 bars), Klinklang | `6e4K5SvaLGQ5NW0m` |
| 186 | Elite Four Lacey (fairy) | Whimsicott (Prankster, Sleep Powder), Primarina, Granbull (Intimidate), Alcremie (Chilly Reception), Excadrill (boss, 2 bars, Sandstorm, passive Sturdy), Sylveon (Baton Pass) | `eOlqgbmoAVD9yufr` |

Lacey and Crispin were searched. Lacey was picked because she brings the most mechanics W180 did not have: sleep,
Prankster, an Intimidate switch-in, Baton Pass and a fairy type that hits our dragon. Crispin was picked as a second,
with Trick Room, Flame Body and a Defiant boss. Amarys was built but not searched.

**The searches.** These are the recommended beams, run one after another as solo runs on 4 workers. All used
`--stall 6`, a 3,000-expansion budget, a depth cap of 40 and `SS_HEAP_MB=1536` (a heap limit of 1,632 MB on every
worker). **[verified]**

| Fight | Beam | Result | Expansions to first win | Line | Alive | Search (boot) | Replay | Pool peak | Worker tree peak | Largest heap after a job | Replayed from T1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lacey W186 | W8, w 0.5 | win | 1,341 | 13 turns | 6 of 6 | 207 s (10 s) | 25 s | 2.7 GB | 0.78 GB | 965 MB | 5/5 |
| Lacey W186 | W8, w 1 | win, the same line | 1,341 | 13 turns | 6 of 6 | 203 s (12 s) | 25 s | 2.7 GB | 0.82 GB | 859 MB | 5/5 |
| Lacey W186 | W16, w 0.5 | win | 2,214 | 12 turns | 6 of 6 | 339 s (12 s) | 16 s | 3.3 GB | 1.12 GB | 1,174 MB | 3/3 |
| Crispin W182 | W8, w 0.5 | win | 1,109 | 10 turns | 6 of 6 | 202 s (10 s) | 19 s | 2.9 GB | 0.76 GB | 885 MB | 5/5 |
| Crispin W182 | W8, w 1 | win, the same beam at every layer | 1,109 | 10 turns | 6 of 6 | 201 s (8 s) | 19 s | 3.1 GB | 0.79 GB | 831 MB | 5/5 |
| Crispin W182 | W16, w 0.5 | win, the same line as W8 | 2,090 | 10 turns | 6 of 6 | 350 s (9 s) | 20 s | 3.7 GB | 1.11 GB | 1,274 MB | 5/5 |

- **No beam lost, stalled, hit an error or lost a worker.** **[verified]** Every win replayed from the wave-start
  save. Each worker played about 280–550 expansions (the total over 4), under the brief's 900. The largest heap a job
  reported was 1,274 MB of the 1,632 MB limit.
- **Every line is Reshiram alone.** **[verified]** It never switches. Against Lacey it fires Blue Flare and Hyper
  Voice, with Tera at T12 (W8) or T10 (W16). Against Crispin it uses Blue Flare, Fickle Beam, Dragon Pulse and
  Hyper Voice, with Tera at T6. It ends at 580/622 against Lacey and 601/622 against Crispin, and no other member comes
  in.
- **Weight 0.5 or 1 made no difference here.** **[verified]** Against Crispin the two W8 beams were the same at every
  layer. Against Lacey they differed at 3 of 13 layers but found the same first win at the same count.
  Reshiram did take damage: the best Lacey node fell to 247/583 at depth 5. But no line needed another member, so
  the our-HP term had nothing to trade against. **[inference]**
- **The portfolio's equivalent.** **[inference]** from the solo runs, since each beam makes the choices of its solo
  run.
  - Under fair sharing all three beams advance at the same expansion count. The two W8 beams reach their first win
    together, at 1,341 of their own (Lacey) and 1,109 (Crispin). W8 at w = 0.5 is listed first, so it wins first.
  - Without dedupe that is about 3 × 1,341 = 4,000 expansions for Lacey and 3 × 1,109 = 3,300 for Crispin, against
    4,861 from Gordie's T1.
  - Dedupe would cut this more than it did on Gordie. The two W8 beams share every node against Crispin, and most
    nodes against Lacey, so the weight-1 beam would cost close to nothing extra: about 2 × the W8 count, or
    2,200–2,700.
  - The 3,000 budget per beam covers every first win here.

**Against Gordie W180** **[verified]** for the numbers, **[inference]** for the reading:

- **Cost: the same range, a little lower.** W8 at w = 0.5 needed 1,109–1,341 expansions, against Gordie's 1,657.
  W16 needed 2,090–2,214, against 2,026. Wall-clock per W8 beam was about 200 s on 4 workers, against 259 s for
  Gordie's W8 on 4 workers in §4. The load was lower here (a one-minute load average of 1.9–3.8).
- **The same beams win, but here they are not tested.** All three won with every member alive. On Gordie, W8 at w = 1
  took 31 turns and 2,915 expansions, and only 1 of 8 beam nodes carried the win in the early layers. Here every
  member of the portfolio found a short Reshiram sweep, because a fire Elite Four and a fairy Elite Four are both weak
  to a fire-type dragon at level 174. These fights do not show the fragility §2 found on Gordie.
- **Which weight is better: no evidence either way.** That is still open (see "Not yet measured").

**What W180 did not exercise, and what happened:**

- **Our team levels up mid-fight.** **[verified]** that max HP rose. **[inference]** that it is a level-up.
  - Every member's max HP grew as foes fell: Reshiram went 577 → 583 → 590 → … → 622, and the benched members grew
    too (Leavanny 497 → 536). Experience Share and a level cap now at 188 put the levels up on each KO. At W180 the
    cap held the team.
  - The snapshot carries this, since level and experience are in the save. Every line through it replayed.
  - `sig()` has no level or experience in it. Two nodes alike but for experience could merge. **[unverified]** whether
    that ever changes a choice.
- **An Intimidate reached our lead.** **[verified]** Reshiram ended Lacey's fight at −2 Attack. That was harmless,
  since it attacks specially.
- **A foe Terastallized.** **[verified]** On the best Lacey nodes from depth 12, Excadrill is Tera'd. No error came of it.
  The winning lines' end states do not show whether Excadrill had Tera'd there. **[unverified]**
- **Trainer boss bars.** **[verified]** Blaziken and Excadrill (2 bars each) were knocked out inside lines that
  replayed. So the `bossSegmentIndex` patch held across restores.
- **Not shown to have fired:** sleep, Trick Room, Baton Pass, Chilly Reception, Substitute, King's Shield, Defiant
  and Flame Body. None of the lines was replayed with its messages. The foes may have used some of these moves; the
  replays matched either way. **[unverified]**
- **No T1 entry effect landed on our side.** Neither foe lead (Whimsicott, Rotom) has one. So the wave-start-save fix
  for entry effects was not tested by these fights. **[verified]**
- **No new forced moves** appeared in any line. **[unverified]** whether a foe's Outrage or a recharge occurred off
  the lines.

**Machine.** **[verified]** (`runs/standin/*.load`) Each run was one search at a time, behind `heap.sh`'s gate. Free
memory stayed at 50–67%. Swap rose from 3.1 GB to 4.8 GB over the session, and the system grew its swap file from 4 to
5 GB. After the last Crispin beam, swap stood above the 4 GB limit with none of these processes running, so no more
runs were started.

## Files

| Path | What it is |
|---|---|
| `harness/solve.test.ts` | The worker: probe mode (`SS_MODE=probe`) and long-lived job mode (`SS_MODE=worker`) |
| `harness/run.sh` | Copies the test into the shared clone under a unique name, and always removes it |
| `harness/probe.sh`, `mkprobe.py`, `show_probe.py`, `show_lines.py`, `known_lines.py`, `replay.py` | Probes and views |
| `harness/search.py` | The beam coordinator: worker pool, RSS sampling (`mem.jsonl`), each job's RSS and heap (`heap.jsonl`), and replay of wins from T1 |
| `harness/heap.sh`, `harness/heaptally.py` | One search with an optional heap cap behind a memory gate, and the heap tables and timelines |
| `runs/heap/` | The heap-cap runs at 1–4 workers, the two long single-worker runs, `tally.md` and the machine load of each run |
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
| `runs/standin/construct.test.ts`, `construct.sh` | Builds the stand-in fights: the game's own flow from the W180 save to the Elite Four waves, keeping each wave-start save and checking its reload |
| `runs/standin/session-w182-crispin.json`, `session-w184-amarys.json`, `session-w186-lacey.json` | The stand-in wave-start saves; `construct-out.json` and `construct-log.txt` are the run that made them |
| `runs/standin/<fight>-<beam>/`, `*.txt`, `*.load`, `tally.md`, `standin_tally.py` | The six stand-in searches and their table |

`solve.test.ts` in more detail:

- snapshot capture and patch;
- a job's `setup`: a moveset or PP edit applied to the T1 save with the test framework's overrides;
- `legal()`, with the game's queued-move rule and Struggle;
- `play()`, with the game-over retarget, the illegal-step refusal, the stale-prompt clearing and Struggle;
- the fork check, the chain check and the `forced` check.

To rerun a single search, or the forced-move cases:

```sh
python3 -I docs/research/solve-search/harness/search.py /tmp/run --workers 8 --width 8 [--prefix A1:20] [--stall 6] [--setup FILE]
SS_GC_EVERY=5 docs/research/solve-search/harness/heap.sh /tmp/heap p1-h768 768 --workers 1 --width 8 --budget-children 500
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
- **Where the worker leaks.** About 1.1 MB per expansion, in the restore or the played turn. A heap-snapshot diff
  across a few hundred expansions would say, and a fix would make recycling unnecessary.
- **Recycling itself**: a coordinator that retires a worker after 250 expansions and re-queues a dead worker's job,
  and its real overhead against the 5–7% estimated.
- **Throughput on an actual 4-core, 8 GB machine.** §3's laptop numbers are scaled from 2 and 3 workers on this Mac,
  not measured.
- **The pool with the game tab open.** No PokéRogue tab was open during the heap runs.
- **A worker that is not a vitest run**, and what it saves against the vitest parent's 350–420 MB at boot.
- **Whether a recycled worker keeps its early speed.** The uncapped worker fell from 2.19 to 1.37 steps/s over 2,083
  expansions, but layer content and load confound that.
- **A real second trainer fight.** None exists yet. The stand-in (Lacey W186, Crispin W182) uses the Gordie team and
  run seed, and both fights suit that team. Either a real export, or a stand-in the team is weak against, would
  test the beams harder. W188 (the dragon-type Elite Four pool) or W190 (the champion) can be built with
  `construct.sh … 188,190` in about 30 s.
- **Amarys W184**, built and checked, but not searched.
- **The stand-in lines with their messages.** Whether sleep, Trick Room, Baton Pass, Chilly Reception, Substitute,
  Defiant or Flame Body fired in any searched line is not known.
- **Experience in `sig()`.** Mid-fight level-ups (the W186 team levels up on each KO) are in the snapshot but not in
  the state signature.
- **A real augmented export from the live tab as a root.** The mid-fight roots here were made in the harness.
- **A searched line that uses Struggle.** The forced-move cases play Struggle chained and straight, but the one search
  with a PP-less mon never sent it in.
- **A queued move the game drops before running it**, such as Fly under Gravity or Outrage after Disable. `legal()`
  copies the game's rule for it, untested.
- **Our own confusion across a restore**, as a rampage leaves it. The foe's was covered.
