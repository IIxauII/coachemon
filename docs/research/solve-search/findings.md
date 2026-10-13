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
  - From attempt 1's T21 every line lost within 245 expansions (62 s). That is a fast, honest "no answer".
- **Recommended defaults.** **[inference]** The basis for each number is in the sections below.
  - `min(cores − 2, 6)` workers, each with a capped heap.
  - A small portfolio of beams, not one beam.
  - A budget of about 3,000 expansions.
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
- **The one position that ran dry** was attempt 1's T21: Golbat alone against Stonjourner, Tyranitar and Coalossal.
  Every line lost by depth 7, after 245 expansions and 62 s. **[verified]** Width 8 with weight 0 also ran dry, at
  1,634 expansions, from a position other configurations won.
  - So a beam running dry is not proof that the position is lost. **[verified]**
  - It is still the moment for this beam to stop. **[inference]**
- **Narrow beams can loop without ever losing.** Width 2 spent 40 turns switching. The stall rule ends such a beam but
  does not rescue it: see "Stall rule" below. **[verified]**
- **The suggested budget** **[inference]**:
  - Run a portfolio over one shared pool: width 8 at w = 0.5, width 8 at w = 1, and width 16 at w = 0.5.
  - Stop at the first win that replays from the save.
  - Otherwise stop when every beam has emptied or stalled, or at 3,000 expansions in all, or 40 turns past the root.
  - Then say "no answer".
  - The 3,000 covers every first win seen here.
  - On this machine at 8 workers that is about 4–5 minutes. On a 2-worker laptop it is about 12 minutes, which needs a
    progress line or a smaller budget.

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
| attempt 1 T1–T20 (T21) | Golbat alone | every line lost by depth 7 | 245 | 62 s | – |

What the table shows:

- **The horizon cuts the cost only once it is short.** A beam costs about width × branching per remaining turn, so a
  re-solve from T5 costs what a solve from T1 costs. From T17 on, it cost about a quarter. **[verified]**
- **Off the line is not lost.** Both positions the card loses from were winnable. **[verified]**
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
   looping beam at no cost to one that wins, but it does not rescue one. Stop at the first replayed win, or at
   3,000 expansions, or after 40 turns, and then say "no answer". **[inference]**
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
| `harness/brwin.py`, `harness/brcount2.py` | The planning-transcript measurement in §2a |
| `runs/tally.md`, `runs/ancestry.txt` | Every run in one table, and which beam nodes lay on a win |
| `runs/sweep/<run>/summary.json`, `mem.jsonl`, `runs/sweep/<run>.txt` | Raw results of each run |
| `runs/stall/` | The stall-rule reruns at widths 2, 4 and 8, in the same layout, and their `tally.md` |
| `runs/probes/` | The many-lines, fork, chain and Bounce probes, before and after the fixes |
| `session-w180.json` | The Gordie W180 T1 export, the same file as the kit's |

`solve.test.ts` in more detail:

- snapshot capture and patch;
- `legal()`;
- `play()`, with the game-over retarget, the illegal-step refusal and the stale-prompt clearing;
- the fork check and the chain check.

To rerun a single search:

```sh
python3 -I docs/research/solve-search/harness/search.py /tmp/run --workers 8 --width 8 [--prefix A1:20] [--stall 6]
```

## Not yet measured

- **The stall rule in a fight whose win needs 6 or more turns without damage to the foes.** It would drop that line.
- **A stall rule that does more than drop a node**, such as widening the beam when every node stalls.
- **The three-beam portfolio** of §4 as one job: what it costs before the first replayed win.
- **A heap cap** (`--max-old-space-size`) per worker: the RSS it holds a worker to, and what it costs in speed.
- **Worker memory over a long run**, and the recycling count it needs.
- **Throughput on an actual 4-core, 8 GB machine.** §3's laptop numbers are scaled, not measured.
- **A second trainer fight.** None exists yet.
- **A real augmented export from the live tab as a root.** The mid-fight roots here were made in the harness.
- **A line with Struggle** (every move out of PP). `legal()` offers no step for it, so such a child would time out and
  be pruned as an error.
