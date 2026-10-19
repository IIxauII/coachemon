# How can a solve finish sooner on a player's machine?

Research for #681, "Research: how can a solve finish sooner on a player's machine?", under #657, "Solve a trainer fight
on the seed in the coach plugin, and the boss-fight plan". It builds on #655, "How should a solve search a fight, and
what does it cost the player's machine?" (`research/solve-search`), and measures the solver as #663, "Solver: the
bounded worker pool", shipped it.

A solve's time is roughly **tries × cost per try ÷ workers**. A **try** is what #655 called an expansion: restore a
fork point, play one turn. This research looks at each factor in turn.

**Scope.** Settled 2026-10-16: measured on game version 1.12.1.1 (the pin after #734); the earlier 1.12.0.11
measurements are kept at 8674bed for comparison. #734 is the pull request that bumped the pin
(`src/escape-ladder/reviewed.json`, `pinned.gameVersion` 1.12.1.1, sha `bdfbef65`). Every 1.12.0.11 number below can be
read with `git show 8674bed:docs/research/solve-speed/<same path>`.

**Setup.** Measured on 2026-10-16, Node 26.

- **The host** is an Apple M4 with 10 cores and 16 GB. Other sessions shared it. Each run's 1-minute load average is
  logged beside it. It was 1.0–2.5 while the beams were recorded (`runs/lab/record.log`) and 2.3–6.2 during the other
  search methods (`runs/lab/methods/methods.log`). Absolute times are pessimistic, so compare runs with each other.
- **The lab** (`harness/lab/`) runs the shipped worker pool (`src/solver/pool.ts`) with 3 workers. It records every
  try in a tree on disk and plays on the game only what the tree lacks (`harness/lab/pool.ts`). The three portfolio
  beams were recorded **unpatched**. The other methods ran with the **poll1** patch (`harness/patches/poll1.ts`, §4)
  on top of those trees. A won line is always replayed unpatched.
- **The laptop** is a podman VM, `coach-laptop`, with 4 vCPUs and 8 GiB on the same host. The shipped solve runs in a
  `coach` container (`harness/Containerfile`, `harness/laptop.sh`, `harness/solve-shipped.ts`). It uses 2 workers,
  which is what `poolSize` gives 4 cores (`min(cores − 2, 6)`, `src/solver/pool.ts:6`). A `tab` container keeps
  pokerogue.net open in headless Chromium the whole time. The plugin's own `setUpClone` set up the VM's 1.12.1.1 clone
  in 18.7 s (`harness/setup-clone.ts`).

**Reading the lab's counts.** `harness/lab/run.ts` and `pool.ts` keep three tallies:

- `requested` counts every try a method asks for, repeats included. A shipped search with no turn cache plays exactly
  this many.
- `unique` counts distinct (fork point, input) pairs. It differs from `requested` only for methods that revisit a
  position: iterative widening and limited discrepancy search.
- `played` counts the tries the tree lacked, which the game actually played. It depends on which runs came before, so
  a lab run's **seconds are not comparable** between runs. Compare `requested` and `unique`.

`python3 -I harness/lab/summary.py <runs/lab subdir>` prints all three for every run.

**The fixtures had to be relabelled** (`harness/pinned.ts`). The three fights (`src/solver/fixtures/gordie-w180.json`,
`drayton-w188.json`, `kieran-w190.json`) are 1.12.0.11 saves. The solver refuses a save from any game version other
than the clone's (`src/solver/gate.ts:23`). Its `carried` exception is only for the pin-bump re-check (#703, "Pin bump:
let the harness re-check reach a new game version"). The first 1.12.1.1 run searched and then failed every replay with
`version_mismatch`, 133 replays and no answer.

The relabel is sound. 1.12.1.1's newest session-save migrator is `v1_12_0_0`
(`src/system/version-migration/version-converter.ts:97-103` in the 1.12.1.1 clone), so the game loads a 1.12.0.11
session save unchanged. Relabelling `save` and `liveExport` therefore gives the solver the input the game would build
itself. `asPinned()` throws for any pair other than 1.12.0.11 → 1.12.1.1, so a later pin has to check this again
before reusing it. **[verified]**

Every claim is tagged **[verified]** (measured or read in source here), **[inference]** (follows from what was measured)
or **[unverified]**.

## Answer

- **The cheapest large win is per try.** **[verified]**
  - Unpatched, a try costs 447 ms on one worker, and the worker is about 90% idle. It is waiting on the test
    framework's 50 ms phase poll (`test/framework/phase-interceptor.ts:132`).
  - Polling every 1 ms instead (poll1) brings a try to 69 ms, 6.4× cheaper. Every job compared with the unpatched
    recording matched it.
  - On a whole search, poll1 retraced Gordie's 8@0.5 beam exactly: 1,657 tries, the same 14-turn line, one replay,
    won. It took 59 s instead of 348 s, 5.9× faster.
- **The patch is safe because the replay is not patched.** **[verified]**
  - Only the search's workers run poll1. The replay that validates a win runs the untouched harness. A shortcut that
    broke the game would cost time, never show a wrong line.
  - At the 1.12.0.11 → 1.12.1.1 bump, poll1 needed zero edits. This is one bump, not an estimate of every bump.
  - The faster `spin.ts` patch is **unsafe**. 4 of 102 jobs ran into 20 s timeouts, and 3 jobs came back different
    from the recording.
- **Fewer tries: run the beams in order of preference.** **[verified]** in simulation on recorded trees.
  - With 8@1 first, the three fights need 8,847 tries to the first win instead of the even split's 16,534, **46.5%
    fewer**. Every verdict stays the same.
- **Other search methods win in far fewer tries, but none may answer "no answer" alone.** **[verified]**
  - Limited discrepancy search (LDS) won every fight in 304–680 unique tries (at most 888 requested). The shipped
    portfolio needs 3,914–7,647.
  - Best-first is erratic (231–5,419). Iterative widening ranges from 375 to 3,500.
  - On Kieran, beams 8@0.5 and 16@0.5 each run out of budget and say "no answer" alone. That is **wrong**: 8@1 wins.
    So a fast method can go in front of the portfolio, but "no answer" must wait until the full portfolio is
    exhausted.
- **No pruning filter is exact.** **[verified]**
  - Skipping moves that leave the foe untouched would have cut 6 of 11 winning lines on Gordie, 4 of 11 on Drayton
    and 6 of 9 on Kieran.
  - Merging identical positions is already done after a turn is played (`src/solver/search.ts:217-218`). It cannot
    be done before playing, and it is not exact either, because the signature leaves the draws out.
- **On the 4-vCPU laptop, poll1 brings a full solve from 16–31 minutes to under 5.** **[verified]**
  - Unpatched, the VM with 2 workers took 945–1,847 s to the first win. With poll1 it took 153–277 s, 6.2–6.7×
    faster, and found the same line, input for input, which replayed and won (§1).
  - A stand-in for the game tab's main thread kept 58–60 fps beside 1 to 6 workers, patched or not (§6).
- **Recommendation.** **[inference]** Ship the poll1 patch in the worker harness only. Order the portfolio by
  preference with 8@1 first, and put LDS in front of it once the order is in. Ship no pruning filter. Draft tickets
  are in §8.

## 1. Measure: a full solve on a 4-core, 8 GB laptop

The VM runs the shipped `solve()` exactly as the plugin does: the bounded pool, the three-beam portfolio, 3,000 tries
per beam (`DEFAULT_BUDGET`, `src/solver/solver.ts:22`) and the validation replay. `harness/vm-batch.sh` runs each
fight shipped, then the same with poll1, then the worker-count sweep in §6.

The batch ran for 94 minutes on 2026-10-16 and 17. Each row comes from
`runs/laptop/<fight>/summary.json` and `runs/laptop/<fight>-poll1/summary.json`: `totalS` and `bootS` (the pool's
start-up), `expansions`, and `pool.peakHeapMb`. "Time to first win" is `totalS`, because the solve stops at its first
replayed win.

| Fight | Solve | Time to first win | Tries | Peak heap per worker | Line |
|---|---|---|---|---|---|
| Gordie W180 | shipped | 1,304 s (21.7 min) | 4,953 | 337 MB | 14 turns, 6 alive |
| Drayton W188 | shipped | 945 s (15.7 min) | 3,914 | 349 MB | 10 turns, 6 alive |
| Kieran W190 | shipped | 1,847 s (30.8 min) | 7,590 | 336 MB | 25 turns, 5 alive |
| Gordie W180 | poll1 | 198 s (3.3 min) | 5,262 | 343 MB | 14 turns, 6 alive |
| Drayton W188 | poll1 | 153 s (2.6 min) | 4,203 | 344 MB | 10 turns, 6 alive |
| Kieran W190 | poll1 | 277 s (4.6 min) | 8,041 | 351 MB | 25 turns, 5 alive |

- **poll1 cut the time to the first win 6.2–6.7×.** The search played 28.9–30.8 tries/s against 3.9–4.2 unpatched,
  counted as `expansions ÷ (totalS − bootS)`. **[verified]**
- **Each pair found the same line, input for input.** It is also the line 1.12.0.11 found: the `line` record in
  `progress.jsonl` is byte-identical across the three runs of each fight. Every line replayed and won. **[verified]**
- **poll1 counts 289–451 more tries because the replay is not patched.** The winning beam waits for its replay
  (`src/solver/search.ts:174,222`), but the other beams keep dispatching until `finish` sets `over` (`:96-98`).
  `expansions` is the last progress count (`harness/solve-shipped.ts:62`). In every run, 5 more processes ran for the
  last 8–12 s; these are the replay's. Each pair reached the replay at nearly the same count: 4,919 and 4,927 on
  Gordie, 3,876 and 3,905 on Drayton, 7,582 and 7,582 on Kieran, sampled every 2 s. During the replay, the unpatched
  workers added 8–38 tries and the poll1 workers 298–459. **[verified]** The even split (`fairer`, `:236`) makes the
  count at the win depend on job timing, which accounts for the few tries' difference at the replay's start.
  **[inference]**
- **With poll1, boot and replay are 10–17% of the solve.** The pool booted in 15.8–15.9 s (18.5–23.3 s unpatched),
  and the replay took about 10–12 s. **[verified]** to the 2 s sampling.
- **Unpatched, 1.12.1.1 matches 1.12.0.11.** Drayton played the same 3,914 tries. Gordie differed by 30 tries and
  Kieran by 76, all within 57 of the simulation (§2). Gordie and Drayton were 0.6% faster, and Kieran 5.2%, on a host
  that was far less loaded (below). **[verified]**
- **Memory stayed flat.** Peak heap per worker was 336–351 MB against the 864 MB limit. The VM had at most 4.3–4.5 GB
  in use, the tab included. **[verified]**

Host load during the batch (`runs/laptop/hostload.txt`, the M4's 1-minute load average every 10 s): 1.4–5.3, median
2.7. During the three shipped solves it was 1.4–4.5, median 2.7 (Gordie's median 3.0, Drayton's 3.1, Kieran's 2.1).
The 10-core host had cores to spare, unlike during the 1.12.0.11 runs. **[verified]**

**The 1.12.0.11 baselines** are the same VM, the same 2 workers and the game tab open (8674bed,
`runs/laptop/<fight>/summary.json`). **[verified]**

| Fight | Time to first win | Tries | Peak heap per worker | Line |
|---|---|---|---|---|
| Gordie W180 | 1,312 s (21.9 min) | 4,983 | 343 MB | 14 turns, 6 alive |
| Drayton W188 | 951 s (15.8 min) | 3,914 | 342 MB | 10 turns, 6 alive |
| Kieran W190 | 1,948 s (32.5 min) | 7,666 | 344 MB | 25 turns, 5 alive |

The pool booted in 26–31 s. The host was oversubscribed during those runs. Its load reached 55–59 with 13–14 GB in
use (8674bed `runs/laptop/hostload.txt`), so Kieran's time especially may be inflated. That is why it is measured
again here.

The first-win tries match the portfolio simulation (§2) to within 20 tries: 4,973, 3,914 and 7,647. **[verified]** So
the lab's try counts carry over to the shipped solve. **[inference]**

## 2. Fewer tries

### Ordering the beams by preference **[verified]** in simulation

`harness/lab/sims.sh` replays the portfolio over each fight's recorded tree with 3 fake workers at a fixed cost per
try. The scheduling policy is then the only thing that changes. The two policies are:

- `fair`: the shipped even share by actions dispatched (`fairer`, `src/solver/search.ts:236`);
- `priority`: always serve the earliest beam in the order that has a job queued, so later beams only fill idle
  workers (`harness/lab/beam.ts`).

Tries to the first win (`requested`, with no sharing between beams) are in `runs/lab/sims/<fight>-w3/`:

| Schedule | Gordie | Drayton | Kieran | Total | vs shipped |
|---|---|---|---|---|---|
| fair (shipped) | 4,973 (T14) | 3,914 (T10) | 7,647 (T25) | 16,534 | — |
| priority, 8@0.5 → 8@1 → 16@0.5 | 2,263 (T14) | 2,049 (T10) | 6,326 (T25) | 10,638 | −35.7% |
| **priority, 8@1 → 8@0.5 → 16@0.5** | 3,107 (T22) | 1,999 (T10) | 3,741 (T25) | **8,847** | **−46.5%** |
| priority, 16@0.5 → 8@0.5 → 8@1 | 2,565 (T9) | 2,936 (T9) | 8,713 (T25) | 14,214 | −14.0% |

- **Ordering cannot turn a winnable fight into a wrong "no answer".** The order changes only which beam runs first.
  "No answer" still waits for every beam (`src/solver/search.ts:76-78`). On Kieran with the default order, 8@0.5
  spends its whole budget, and then 8@1 wins. **[verified]**
- **8@1 first is best overall, because it is the one beam that wins Kieran alone.** The price is Gordie's first win: a
  22-turn line instead of the 14-turn one. **[verified]**
- **Two variants did not help.** `--share` lets one beam's try count for another. It never helped much and was often
  worse. `early` replays a win as soon as its job returns. It saved at most about 200 tries, and on Gordie with the
  fair split it cost 855 more. **[verified]**
- **The cut is about the same as on 1.12.0.11.** 8@1 first saved 47% there and 46.5% here. **[verified]**

### Skipping positions that recur **[verified]** + **[inference]**

- **The shipped beam already merges children that share a `sig()`.** `sig()` is the search's state signature, and
  the merge keeps the best-scored child (`src/solver/search.ts:217-218`). That happens after the turn is played.
- **A transposition is only known after playing.** Two orders of moves reach the same position only once both have
  been played, so skipping a recurring position before simulating it is not possible. **[inference]**
- **The merge is not exact.** `sig()` leaves the draws out on purpose (`src/solver/harness.test.ts.template:598-599`).
  The battle RNG reseeds from the battle seed and the turn (`src/battle.ts:486-505`). `incrementTurn` clears the seed
  state (`src/battle.ts:177`). Moody and Mini Black Hole draw after the turn is incremented
  (`src/data/abilities/ab-attrs.ts:4332,4341`, `src/modifier/modifier.ts:3194,3211`). Phaser's RND reseeds only at
  wave and run boundaries (`src/battle-scene.ts:2010-2030`). So two orders that reach one `sig()` can differ in what
  they will draw next. All paths are in the 1.12.1.1 clone. **[verified]** in source.
- **How many sibling tries are duplicates** is in `runs/lab/prune/<fight>.json`, as `dupExact` (same `sig()`) and
  `dupNoPp` (same apart from PP):

  | Fight | Tries in tree | `dupExact` | `dupNoPp` |
  |---|---|---|---|
  | Gordie | 11,819 | 1,774 (15.0%) | 2,655 (22.5%) |
  | Drayton | 11,087 | 3,008 (27.1%) | 3,367 (30.4%) |
  | Kieran | 12,684 | 2,957 (23.3%) | 3,581 (28.2%) |

  These are the merges that already happen. They are not tries a filter could save. **[inference]**

### Trying likely moves first **[inference]**

A beam plays every legal action of every node it keeps. The order inside a layer changes when a win is noticed, not
how many tries the layer costs. Move ordering pays only in methods that do not expand everything, and LDS and
best-first are exactly that (§5).

## 3. Cheaper tries: where one try's time goes

`harness/profile.ts` runs one shipped worker (`src/solver/worker.ts`) over fixed fork points of Gordie's recorded tree,
one job per legal action. It times each job and checks the job's children against the recording (`runs/profile/`):

| Run | Forks / jobs / tries | Per try | Median job | Jobs compared: same / differ |
|---|---|---|---|---|
| unpatched (`bench-none-10forks.json`) | 10 / 102 / 122 | **447 ms** | 410 ms | 18 / 0 |
| poll at 10 ms (`bench-poll10-10forks.json`) | 10 / 102 / 122 | 141 ms (3.2×) | 129 ms | 18 / 0 |
| **poll at 1 ms (`bench-poll1-10forks.json`)** | 10 / 102 / 122 | **69 ms (6.4×)** | 66 ms | 18 / 0 |
| `spin.ts` (`bench-spin-10forks.json`) | 10 / 102 / 122 | 2,637 ms | 14 ms | **15 / 3** |
| unpatched, under the CPU profiler | 10 / 102 / 122 | 435 ms | 396 ms | 18 / 0 |
| poll1, under the CPU profiler | 30 / 272 / 414 | 50 ms (8.7×) | 47 ms | 36 / 0 |

The other jobs (84 of 102, and 236 of 272 under the profiler) played children the recording lacks, so they could not
be compared. On 1.12.0.11 the same bench gave 428 ms unpatched and 55 ms with poll1 (7.8×). **[verified]**

**Where the time goes** (`runs/profile/cpu-unpatched-10forks.txt` and `cpu-poll1-30forks.txt`, summarised by
`harness/prof.py`). Both profiles include the worker's boot. **[verified]**

- **Waiting.** The unpatched profile sampled 59.2 s, and 53.0 s of it was idle (90%). With poll1, 19.7 s of 26.0 s
  was idle (76%), over 3.4× as many tries.
  - The cause is the test framework's phase loop. `PhaseInterceptor.run` starts a phase, then checks every 50 ms
    whether it ended (`test/framework/phase-interceptor.ts:132`). The scene's `MockClock` fires delayed calls on a
    real 1 ms timer (`test/mocks/mock-clock.ts:6-17`). So a phase that ends within a millisecond or two still costs
    up to 50 ms. **[verified]** in source.
  - Much of what remains with poll1 is the 1 ms poll and the 1 ms clock. **[inference]**
- **Busy time, by source.** The shares below are of busy time, unpatched first and then poll1. Busy time is the
  smaller part of the wall time. **[verified]**
  - **Harness overhead.** The coach test file takes 3.8% / 6.1%, and the test framework 3.8% / 3.8%. The restore
    (`initSessionFromData`) is 13.0% / 18.5% inclusive.
  - **Message delays and timers.** These are the idle time above, not busy time.
  - **Text lookups.** i18next takes 9.2% / 9.5%. Text already finishes at once
    (`test/mocks/mocks-container/mock-text.ts:25-26,82-108`).
  - **Graphics objects.** Phaser takes 5.1% / 5.5%, game UI 9.9% / 9.9% and jsdom 6.6% / 5.7%. Tweens already finish
    at once (`test/framework/game-wrapper.ts:119-143`).
  - **vitest itself** takes 0.4% / 0.3%.
  - **The rest** is the game's own logic (field, data, items, phases and the like, together about 25–30%), native
    builtins (12–14%), node internals (8%) and garbage collection (4.5% / 6.4%).
- **Text, graphics and vitest together are under a third of a try's busy time**, and busy time is about a tenth of an
  unpatched try. No cut to them can come near what the poll gives. **[inference]**

## 4. A sped-up copy for the search

**The design.** The patch is spliced into the harness source only for the run named `worker` (`src/solver/worker.ts:101`).
It is spliced in at the vitest import (`harness/lab/run.ts`, `harness/solve-shipped.ts`, `harness/profile.ts`). The
replay that validates a win is named `replay` (`src/solver/replay.ts:85`) and runs untouched. A patch that changed the
game's behaviour would make the search chase lines that then fail their replay. That costs time, never a wrong oracle
line. **[verified]** in the harness source.

### poll1 retraces exactly **[verified]**

- **Per try.** Every job compared in §3 matched the unpatched recording: 18 of 18 on 10 forks and 36 of 36 on 30
  forks, none differing.
- **A whole search.** Gordie's 8@0.5 beam ran with poll1 on an empty tree, so nothing came from the recording
  (`runs/lab/patched/gordie-w180-beam_8_0.5.json`). It gave the same 1,657 tries and the same 14-turn line, input for
  input, as the unpatched recording (`runs/lab/gordie-w180/beam_8_0.5.json`). One replay, in the untouched game, won.
  It took 59 s against 348 s (5.9×). On 1.12.0.11: 71 s against 342 s.
- **Across the pin change.** The Kieran beams were recorded with poll1 on 1.12.0.11 and unpatched on 1.12.1.1, and the
  try counts and verdicts match: 8@0.5 3,006 no answer, 8@1 2,696 won at T25. **[inference]** This is more evidence
  that poll1 changes nothing, but it spans the pin change.

### `spin.ts` is unsafe **[verified]**

`harness/patches/spin.ts` re-checks on every turn of the event loop instead of on a timer. With `COACH_CLOCK=1` it also
ticks the clock itself (`runs/profile/bench-spin-10forks.json`).

- The median job took 14 ms, but 4 of the 102 jobs took 60–100 s, running into the harness's 20 s timeouts.
- **3 jobs came back with children that differ from the recording.**
- The 1.12.0.11 sample covered 3 forks and saw neither problem: 22 ms per try, 9 of 9 the same. It was too small.

A patch that changes what a turn does fails its replays and wastes the time it saved. One that hangs costs more than
the poll. **[inference]**

### The cost at each pin bump

**Observed at one bump, 1.12.0.11 → 1.12.1.1: zero patch edits.** **[verified]** for this bump only.

- `poll1.ts` applied unchanged. `PhaseInterceptor.run` still polls at 50 ms at the same line, and the only changes in
  that file are log renames.
- The only port work was the fixture relabel (`harness/pinned.ts`, Setup). That is a cost of the research's
  fixtures, not of the patch.

This is one bump, not an estimate. **[inference]** The patch replaces `PhaseInterceptor.run` whole and reads its
`state` and `logPhase`, so an upstream change to that method is what would cost an edit. A shipped patch should
therefore check the method it replaces and fall back to the unpatched poll when it differs. The fallback makes a
changed upstream cost only speed until the patch is re-checked (§8).

## 5. Other search methods

The methods are in `harness/lab/methods.ts`. They use the beam's own pool, score (Σ foe HP lost + w × Σ our HP
fraction, with w the our-HP weight), stall rule (6 turns with no foe HP lost) and 40-turn limit. All ran with poll1 and
3 workers (`runs/lab/methods/<fight>/`). Budgets were 3,000 tries per width for iterative widening and 9,000 in all for
LDS and best-first (`harness/lab/methods.sh`).

- **Limited discrepancy search (LDS)**, `lds:<w>:2:2`. Iteration k follows the best child at every turn, except on
  paths whose deviations add up to at most k. Following the r-th best child costs r. Only the 2 best children are ever
  followed, and k goes up to 2.
- **Iterative widening**, `iw:<w>`. The beam runs at width 2, then 4, 8 and 16, stopping at the first win. A narrow
  width's "no answer" only starts the next width.
- **Best-first**, `bf:<w>:<λ>`. It expands the best node anywhere in the tree, by score − λ × turns played. λ = 0 is
  greedy, and λ > 0 trades depth for breadth like weighted A*. A `sig()` is expanded once.

### Tries to the first win **[verified]**

Cells give `unique` tries, with `requested` in brackets where it differs, and the turn of the win. The first two rows
are the simulated portfolio (§2), counted as `requested`. The beam rows are from `runs/lab/<fight>/beam_*.json`.

| Method | Gordie W180 | Drayton W188 | Kieran W190 |
|---|---|---|---|
| portfolio, even split (shipped) | 4,973, T14 | 3,914, T10 | 7,647, T25 |
| portfolio, 8@1 first | 3,107, T22 | 1,999, T10 | 3,741, T25 |
| beam 8@0.5 alone | 1,657, T14 | 1,309, T10 | 3,006, **no answer** |
| beam 8@1 alone | 2,145, T22 | 1,293, T10 | 2,696, T25 |
| beam 16@0.5 alone | 2,026, T9 | 2,338, T9 | 3,011, **no answer** |
| iterative widening, w 0.5 | 1,585 (1,941), T25 | 375, T10 | 930, T31 |
| iterative widening, w 1 | 699, T24 | 1,594 (1,941), T24 | 3,500 (4,277), T25 |
| **LDS, w 0.5** | 388, T33 | 405, T24 | 680 (888), T31 |
| **LDS, w 1** | 349, T24 | 304, T22 | 579 (880), T32 |
| best-first, w 0.5, λ 0 | 4,653, T35 | 639, T21 | 558, T26 |
| best-first, w 1, λ 0 | 231, T14 | 772, T25 | 1,123, T22 |
| best-first, w 0.5, λ 0.25 | 351, T13 | 1,960, T13 | 1,243, T16 |
| best-first, w 1, λ 0.25 | 410, T10 | 5,419, T15 | 1,010, T15 |

Every non-beam method found a win on every fight, and every win replayed. Best-first w 1, λ 0.25 is new on Gordie and
was not run on 1.12.0.11.

- **LDS is the steadiest.** It won all three fights in 304–680 unique tries, 8–14× fewer than the shipped portfolio.
  Gordie and Drayton needed no deviation (k = 0: the best-scored child at every turn). Kieran needed one (k = 1).
  **[verified]**
- **LDS's lines are long:** 22–33 turns against the beams' 9–25. A longer oracle line is still exact, but the player
  has more inputs to make. **[inference]**
- **Best-first is erratic.** It ran from 231 to 5,419 tries, and no setting was good on all three fights. **[verified]**
- **Iterative widening is no better than the preference-ordered portfolio** on Kieran (3,500–4,277 at w 1), and it
  revisits positions at each width. **[verified]**

### Is "no answer" still trustworthy?

- **The narrow beams answer wrongly on their own.** On Kieran, beams 8@0.5 and 16@0.5 each spend their budget and say
  "no answer", while 8@1 wins at T25 (`runs/lab/kieran-w190/`). **[verified]**
- **Any method's "no answer" is only as wide as its search.** LDS with k ≤ 2 and 2 alternatives looks at a thin slice
  of the tree. Running out of discrepancies there says nothing about the rest of the tree. **[inference]**
- **So a fast method may go in front of the portfolio but not replace it.** A win from it is checked like any other.
  A failure from it hands over to the full portfolio, and only the portfolio, exhausted, says "no answer". The shipped
  rule already holds this for the beams (`src/solver/search.ts:76-78`). **[inference]**
- **No method in this table gave a wrong "no answer".** Each won on each fight. That is three fights, not a guarantee.
  **[verified]**
- **What a failed LDS stage costs is not measured.** Every LDS run here found a win before exhausting k ≤ 2.
  **[unverified]**

### Best-first's memory

- **The workers' heaps did not change.** Peak heap per worker (`pool.peakHeapMb` in each run's JSON) was 273–357 MB
  across every 1.12.1.1 lab run. The unpatched beams gave 280–337 MB and the poll1 methods 273–357 MB. Best-first
  falls in the same band at 273–356 MB, against a reported limit of 864 MB (`HEAP_MB = 768`,
  `src/solver/worker.ts:13`). **[verified]**
- **Best-first's cost is in the coordinator.** The coordinator is the process that runs the search and holds every
  frontier node's fork point (`Position.forkPoint`, `src/solver/search.ts:12`). **[verified]** in source.
- **A fork point is about 30 KB raw, 3.7–3.8 KB deflated.** That is the mean of 400 sampled fork points per fight in
  the 1.12.1.1 lab's scratch trees: Gordie 30.6 KB / 3.7 KB, Drayton 30.8 / 3.8, Kieran 29.5 / 3.8. The figure
  matches 1.12.0.11. **[verified]**
- **The largest best-first frontier was about 109 MB raw.** That was 3,631 nodes, on Drayton with w 1, λ 0.25
  (`result.extra.peakFrontier`): about 109 MB raw, 14 MB deflated. Gordie with w 0.5, λ 0 peaked at 2,615 nodes,
  about 78 MB. **[inference]** from node count × size. The coordinator's heap itself was not measured.
- **A beam holds far less.** It keeps at most its width in nodes, plus one layer's children while it scores them: a
  few MB for the three beams together. **[inference]**

### Pruning before simulating **[verified]**

`harness/lab/prune.ts` reads each recorded tree. It counts the move tries that left the foe's side unchanged: every
foe's HP, status, and the on-field foe's stat stages and tags. That is the widest form of "a move the target is immune
to, status on a target that already has one, a boost already at its cap". It then checks every winning line found for
such a move (`runs/lab/prune/<fight>.json`).

| Fight | Move tries | Left the foe untouched | Winning lines that used such a move |
|---|---|---|---|
| Gordie | 7,645 | 2,342 (30.6%) | 6 of 11 |
| Drayton | 6,397 | 2,433 (38.0%) | 4 of 11 |
| Kieran | 6,953 | 2,390 (34.4%) | 6 of 9 |

- **Real wins use such moves.** Examples are Bounce's charge turn (Gordie beam 8@1 at T17 and Kieran beam 8@1 at
  T10), and Rest, Hyper Voice, Leaf Storm, Hurricane, Tri Attack and Body Slam on turns where they left the foe
  unchanged.
- **The game gives "doing nothing" consequences.** A failed or immune move still spends PP
  (`src/phases/move-phase.ts:209`, `move-effect-phase.ts:249,949-952`). An Absorb-type ability still heals on an
  immune hit (`ab-attrs.ts:439-463`). Opportunist copies a boost requested at +6 (`ab-attrs.ts:4660-4672`,
  `stat-stage-change-phase.ts:76-80,327-335`). **[verified]** in the 1.12.1.1 source.
- **One change since 1.12.0.11.** Dancer now copies only a dance move that hit (`move-effect-phase.ts:905-934`).
  Neither side in the three fights has Dancer. **[verified]**

**No filter is exact on any of the three fights**, so none is recommended. Merging was covered in §2.

### Set aside: MCTS, nested Monte Carlo and a learned value function **[inference]**

- **Monte Carlo Tree Search and nested Monte Carlo search** score a position by playing random fights to the end,
  about 4 s each unpatched (#681).
  - A fight lasts 10–35 turns, so one random playout costs tens of tries. LDS's whole search to the first win is
    300–900 tries, which buys a few dozen playouts.
  - Random play also scores a position by how a random line ends, which says little about a line that needs a planned
    surprise. Gordie's needs T7 Bug Bite on the Enigma.
  - poll1 makes a playout cheaper but leaves the ratio the same.
- **A learned value function** needs training data across many fights and a model per game version.
  - Three fights exist.
  - The pin moved once during this research, and six of Drayton's eight non-beam methods shifted with it (§7).
  - A model trained on one version would need re-checking at every bump, which is the cost the poll patch avoids.
- **The measurements do not change this.** The cheap methods already win in hundreds of tries.

## 6. Workers and CPU

The sweep ran at the end of the §1 batch, with the frame stand-in beside it.

`harness/vm-batch.sh` runs Gordie at 1, 2, 3, 4 and 6 workers on the 4-vCPU VM: unpatched with `BUDGET=100` tries per
beam, then poll1 with `BUDGET=300`. Each row comes from `runs/laptop/scale-unpatched-w<N>/summary.json` and
`runs/laptop/scale-poll1-w<N>/summary.json`. Throughput is `expansions ÷ (totalS − bootS)`.

| Workers | Unpatched, BUDGET=100: tries/s | Unpatched: boot | poll1, BUDGET=300: tries/s | poll1: boot | Peak heap per worker, unpatched / poll1 | VM memory in use, peak |
|---|---|---|---|---|---|---|
| 1 | 1.58 | 18.9 s | 14.6 | 15.4 s | 268 / 341 MB | 2.9 / 2.9 GB |
| 2 (`poolSize(4)`) | 2.87 (1.8×) | 19.1 s | 29.7 (2.0×) | 16.7 s | 269 / 344 MB | 3.8 / 4.0 GB |
| 3 | 4.07 (2.6×) | 20.1 s | 38.7 (2.7×) | 19.7 s | 266 / 354 MB | 4.8 / 5.1 GB |
| 4 | 5.00 (3.2×) | 23.0 s | 53.9 (3.7×) | 23.8 s | 317 / 357 MB | 5.7 / 5.8 GB |
| 6 | 6.91 (4.4×) | 31.3 s | 60.0 (4.1×) | 30.5 s | 295 / 340 MB | 7.2 / 7.7 GB |

- **Unpatched, throughput grows past the core count.** 6 workers on 4 vCPUs played 4.4× the tries of 1, because an
  unpatched worker is mostly idle (§3). The VM's load1 had a median of 1.0 at 2 workers and 5.6 at 6. **[verified]**
- **With poll1 the gain flattens past 4 workers:** 3.7× at 4 and 4.1× at 6, with the VM's load1 median at 4.3 and
  5.0. **[verified]**
- **Boot grows with the pool**, from 15–19 s at 1–2 workers to 31 s at 6, because every worker starts at once. On this
  short search that ate the gain: poll1 took 45.5 s in all at 6 workers against 40.5 s at 4. **[verified]**
- **6 workers filled most of the 8 GiB VM**, with 7.2–7.7 GB in use, the tab included. **[verified]** On an 8 GB machine
  with 8 or more cores, `poolSize` gives 6 workers, which leaves little for the browser. **[inference]**
- **The sweep's searches are short.** They end by turn 2 unpatched and by turn 5 with poll1, so their tries/s are not
  the full solves' (§1: 3.9–4.2 unpatched and 28.9–30.8 with poll1, at 2 workers). **[verified]**

**Frames.** `harness/frames.ts` is a stand-in thread that does 8 ms of work per 1/60 s frame. Every 5 s it reports the
frames it finished per second and how late the latest one started (`runs/laptop/frames.jsonl`). Each run's figure
covers its `mem.jsonl` from the first sample to the last, boot included. **[verified]**

| Workers | Unpatched: lowest fps | Unpatched: longest stall | poll1: lowest fps | poll1: longest stall |
|---|---|---|---|---|
| none (the 60 s before the sweep) | 60.0 | 5 ms | — | — |
| 1 | 60.0 | 5 ms | 59.9 | 8 ms |
| 2 (`poolSize(4)`) | 60.0 | 6 ms | 59.8 | 27 ms |
| 3 | 59.7 | 14 ms | 57.9 | 89 ms |
| 4 | 59.5 | 19 ms | 59.1 | 13 ms |
| 6 | 58.5 | 19 ms | 58.8 | 13 ms |

- **The stand-in kept its frames at every count.** The median 5 s window was 60 fps everywhere except poll1 at 6
  workers, where it was 59.6. **[verified]**
- **Stalls over 10 ms fell during boot, apart from poll1 at 2 and 3 workers.** The 89 ms stall came 9 s into
  poll1's 3-worker search. **[verified]**
- **The poll1 runs are short.** At 4 and 6 workers the search after boot lasted 15–17 s, which is 2–3 windows.
  **[verified]**

**Why a stand-in.** The VM's own Chromium tab renders in software, so it cannot show what a solve takes from the game.
On 1.12.0.11, `harness/tab.ts` logged it at a median of 1.8 fps, within 0–3.1, during the solves (8674bed
`runs/laptop/tab.jsonl`). It drew about as few frames with no solve running. The stand-in shows what the solve's CPU
use leaves for one busy thread. It does not show the real tab. **[verified]** for the VM tab; the stand-in is
**[inference]** about a real one.

**What is known without the sweep.**

- **The worker sits idle unpatched, so on a free core it uses little CPU.** About 90% of an unpatched worker's time is
  idle (§3). **[verified]**
- **With poll1 a worker is busy about a quarter of the time** (76% idle) and does 6–9× the tries. **[verified]**
- **The `min(cores − 2, 6)` cap matters more once poll1 ships.** Its two spare cores are what keep the game's tab
  playable. The sweep tested it against a patched pool for the stand-in only (above); a real tab is untested.
  **[inference]**
- **LDS and best-first can leave workers idle.** They expand one node at a time and spread its actions over the
  workers. A node with fewer legal actions than there are workers leaves the rest idle, so their wall time on 6
  workers is untested. **[inference]**

## 7. 1.12.0.11 → 1.12.1.1

Each lab run on 1.12.1.1 was compared with the same file at 8674bed. **[verified]**

- **All beams are the same.** Every beam on every fight has the same try count, turn and verdict. The one exception
  is Kieran 16@0.5, which spent 3,011 tries instead of 3,008. Both are a last job overshooting the 3,000 budget, with
  the same 17 layers and the same "no answer".
- **Gordie and Kieran methods are the same.** Every method gives the same tries and turn as on 1.12.0.11.
- **Drayton methods shifted**, and each version is deterministic.

  | Drayton method | 1.12.0.11 unique, turn | 1.12.1.1 unique, turn |
  |---|---|---|
  | iterative widening, w 0.5 | 375, T10 | 375, T10 |
  | iterative widening, w 1 | 1,227, T15 | 1,594, T24 |
  | LDS, w 0.5 | 400, T25 | 405, T24 |
  | LDS, w 1 | 288, T18 | 304, T22 |
  | best-first, w 0.5, λ 0 | 426, T18 | 639, T21 |
  | best-first, w 1, λ 0 | 2,168, T21 | 772, T25 |
  | best-first, w 0.5, λ 0.25 | 3,430, T13 | 1,960, T13 |
  | best-first, w 1, λ 0.25 | 5,419, T15 | 5,419, T15 |

- **The shift is deterministic on both versions.** Drayton's `lds:1:2:2` was run again with poll1, on an empty tree
  and 3 workers. On 1.12.1.1 with the current harness it gave 304 tries and T22 again. With 8674bed's harness on the
  1.12.0.11 clone it gave 288 and T18 again (`runs/lab/determinism/`). The lab is deterministic, so the differences
  come from the pin change (the game plus the relabelled fixture), not from noise. **[verified]**
- **Which game change causes it is not pinned down.** **[unverified]** One candidate is Drayton's Dragonite, which
  knows Metronome (move 118), a move that draws from the game's move list. Every beam try was identical, so the
  difference lies in parts of the tree only the other methods reached. **[inference]**
- **Per-try cost barely moved.** It went from 428 to 447 ms unpatched and from 55 to 69 ms with poll1 (§3). The host
  load differed between those runs. **[verified]**

## 8. Recommendation **[inference]**

**Ship the poll patch first, then the preference-ordered portfolio, then LDS in front of it, and no pruning filter.**

- **The poll patch** changes the cost per try by 6–9×, with no observed change to any result. Its risk is contained by
  the validation replay that already exists.
- **The preference order** is a change to one comparator for a 46.5% cut in tries. It leaves "no answer" exactly as
  wide as now.
- **LDS** cuts the first win to a few hundred tries on all three fights. It needs its own budget and the portfolio
  behind it.

On the laptop, the poll patch alone brought the 16–31-minute first wins to 2.6–4.6 minutes, with the same lines (§1).
The estimate from the 1.12.0.11 baselines was 3–6 minutes. **[verified]** The preference order would about halve
Kieran's again: it needs 3,741 tries instead of 7,647 in simulation. At the measured 31 tries/s, plus 16 s of boot and
about 12 s of replay, that is roughly 2.5 minutes. **[inference]**

The draft tickets below are to be filed as native sub-issues of #657.

### Draft: Solver: poll the phase loop every 1 ms in the search's workers

The search's workers spend about 90% of each try waiting on the test framework's 50 ms phase poll
(`test/framework/phase-interceptor.ts:132`). Polling every 1 ms made a try 6.4× cheaper, and it retraced a whole Gordie
beam exactly (#681 findings §3–4). Splice `harness/patches/poll1.ts` (from `research/solve-speed`) into the harness
source of the run named `worker` only, leaving `replay` untouched, so every win is still validated in the unpatched
game. Before patching, the worker checks that the `PhaseInterceptor.run` it replaces is the one the patch was written
against. If it is not, the worker keeps the unpatched poll and reports it, so a changed upstream costs speed, never a
result. Register `PhaseInterceptor.run`, `state` and `logPhase` as game reads so the pin-bump drift check names them.
Acceptance: Gordie's 8@0.5 beam with the patch plays the same tries and line as without it, and a solve whose patch
check fails still answers, unpatched.

### Draft: Solver: run the portfolio's beams in order of preference, 8@1 first

The portfolio shares the pool evenly between its three beams (`fairer`, `src/solver/search.ts:236`). Serving the
earliest beam that has work queued first, with the order 8@1, 8@0.5, 16@0.5, needed 46.5% fewer tries to the first win
across Gordie, Drayton and Kieran in simulation, with the same verdicts (#681 findings §2). Later beams only fill idle
workers. "No answer" still waits for every beam to end, as now. Gordie's first win becomes the 22-turn line instead of
the 14-turn one. Acceptance: the order is a constant beside `PORTFOLIO`, and a test shows that a first beam spending its
budget does not end the search while a later beam can still win.

### Draft: Solver: limited discrepancy search ahead of the beam portfolio

Limited discrepancy search won all three benchmark fights in 304–680 unique tries (at most 888 requested), against
3,914–7,647 for the shipped portfolio (#681 findings §5). Run it first, with its own try budget. The most any run here
needed was 888 requested tries; the ticket sets the cap from that. Validate any win it finds by the usual replay. When
it finds no win, hand over to the full (preference-ordered) portfolio. Only the portfolio, exhausted, may say "no
answer", because single narrow searches answer wrongly on Kieran. Count tries as the shipped search would play them:
with no turn cache, `requested` is the cost. Watch its line length, which ran 22–33 turns against the beams' 9–25.
Its wall time on more workers is untested, because it expands one node at a time. Acceptance: all three fixtures solve
with it; the time to "no answer" on a fight with no win is reported; a failed LDS stage never ends the solve.

### Recorded: no pruning filter

No filter that skips moves before simulating is exact. A filter for "a move that leaves the foe untouched" (immune
target, status already present, boost at cap, or anything else that leaves the foe unchanged) would have cut 6 of 11
winning lines on Gordie, 4 of 11 on Drayton and 6 of 9 on Kieran. The game gives such moves consequences: PP spent,
Absorb heals, Opportunist copies. Merging identical positions already happens after a turn is played, and it is not
exact, because the state signature leaves the draws out (#681 findings §2, §5). Ship none.

## Not yet measured

- **Worker scaling over a whole solve.** The sweep's searches end by turn 5 (§6), and only Gordie was swept.
- **A real game tab beside a solve on a machine that renders it in hardware.** The VM's tab cannot show playability.
- **The coordinator's heap during best-first.** It was estimated from frontier size × fork-point size.
- **A failed LDS stage**: its cost in tries when the fight has no win within k ≤ 2, and so what LDS adds before an
  honest "no answer".
- **LDS and best-first on 6 workers**, where one-node-at-a-time expansion may leave workers idle.
- **The game change behind the Drayton shift** (§7).
- **poll1 together with the preference order or LDS in a shipped solve.** poll1 is measured end to end (§1). The
  order and LDS are measured only in the lab.
- **A fourth fight.** Three fights are the benchmark. No method's "no answer" has been tested on a fight that has no
  win.

## Files

All paths are under `docs/research/solve-speed/`.

| Path | What it is |
|---|---|
| `harness/pinned.ts` | Relabels the 1.12.0.11 fixtures as the 1.12.1.1 pin (Setup) |
| `harness/patches/poll1.ts`, `spin.ts` | The two runtime patches to the test framework (§3, §4) |
| `harness/profile.ts`, `bench-patch.sh`, `prof.py` | The per-try bench and the CPU profile summary (§3) |
| `harness/lab/run.ts`, `pool.ts`, `tree.ts`, `beam.ts`, `methods.ts` | The lab: one method on one fight over a recorded tree |
| `harness/lab/record.sh`, `methods.sh`, `sims.sh`, `redo.sh` | Recording the beams, the methods, the portfolio sims, and the whole lab stage in one script |
| `harness/lab/prune.ts`, `compare-trees.ts`, `summary.py` | Pruning counts, tree comparison, and the run tally |
| `harness/solve-shipped.ts`, `laptop.sh`, `vm-batch.sh`, `sample.ts`, `setup-clone.ts`, `Containerfile` | The shipped solve in the laptop VM (§1, §6) |
| `harness/frames.ts`, `tab.ts`, `cpu.ts`, `hostload.sh` | The frame stand-in, the real tab's probe, and machine sampling |
| `runs/lab/<fight>/` | The three beams, recorded unpatched, plus `record.log` with the load per run |
| `runs/lab/patched/` | Gordie 8@0.5 with poll1 on an empty tree (§4) |
| `runs/lab/methods/<fight>/` | The other methods with poll1, plus `methods.log` |
| `runs/lab/determinism/` | Drayton LDS w 1 again on each version, from an empty tree (§7) |
| `runs/lab/sims/<fight>-w3/` | The portfolio scheduling simulations (§2) |
| `runs/lab/prune/` | Pruning and merge counts per fight (§2, §5) |
| `runs/profile/` | Benches and CPU profiles (§3). `cpu-boot-only.txt` is from 1.12.0.11 |
| `runs/laptop/` | The VM's 1.12.1.1 batch: `<fight>/` and `<fight>-poll1/` solves, `scale-*-w<N>/` sweep, `frames.jsonl`, `hostload.txt` (§1, §6) |

To re-run the whole lab stage on whichever game version is pinned (about an hour on the M4, 3 workers):

```sh
sh docs/research/solve-speed/harness/lab/redo.sh <scratch-trees-dir>
python3 -I docs/research/solve-speed/harness/lab/summary.py docs/research/solve-speed/runs/lab/methods
```
