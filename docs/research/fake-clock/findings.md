# Can the search's workers run on a fake clock?

Research for #775, "Research: run the search's workers on a fake clock, so a try never waits on a real timer", under
#657. It builds on #681's findings (`docs/research/solve-speed/findings.md`, kept on this branch), §3 and §4.

**The question.** A worker with the 1 ms poll (#759) still sits idle about three quarters of each try, waiting on real
1 ms timers. Can those timers run on a **fake clock** instead: a scheduler that, whenever the process has nothing left
to run, jumps straight to the next due timer? And does every try then still play exactly as on the unpatched game?

**Words used here.**

- **unpatched**: the harness as the replay runs it (`src/solver/replay.ts`), with the game's own 50 ms phase poll.
- **poll1**: the shipped worker, the harness plus the 1 ms poll (`src/solver/fast-poll.ts.template`, #759).
- **fake clock**: poll1 plus the fake-clock patch (`harness/patches/fake-clock.ts`). It is what would ship.
- **fake50**: the fake clock without poll1, so the phase poll stays at the game's 50 ms, on the fake clock.
- **spin**: `spin.ts` from #681 (`docs/research/solve-speed/harness/patches/spin.ts`), run as #681 ran it, with
  `COACH_CLOCK=1`.
- A **job** is one input played from one fork point. A job returns one **child** per turn it played: one, or one per
  faint replacement the turn offered.

**Setup.** Measured on 2026-10-19, Node 26.9, on game version **1.12.1.2**, the pin
(`src/escape-ladder/reviewed.json`, sha `b271d3e6`).

- **The clone** was set up by the plugin's own `setUpClone` (`docs/research/solve-speed/harness/setup-clone.ts`) in
  7.3 s: the game, its locales, one battle animation and its dependencies, and no `assets` submodule. The harness finds
  it through `.cache/pokerogue/v1.12.1.2`, a link in this worktree only. **[verified]**
- **The fixtures are relabelled again** (`harness/pinned.ts`). They are 1.12.0.11 saves. 1.12.1.2's newest
  session-save migrator is still `v1_12_0_0` (`src/system/version-migration/version-converter.ts:97-103` in the
  1.12.1.2 clone). `v1_12_0_1`, `v1_12_0_3`, `v1_12_0_10` and `v1_12_1_0` add system and settings migrators only. So
  1.12.1.2 loads a 1.12.0.11 session save unchanged, and #681's reasoning holds. `asPinned()` now allows 1.12.0.11 →
  1.12.1.1 or 1.12.1.2 and throws for anything else. **[verified]**
- **The shipped code does not make the relabel unnecessary.** Since #681, `src/solver` gained #764's carry
  (`carryOf`, `src/solver/gate.ts:12-14`). It lets an older save through only when the live export already says the
  clone's version. The fixtures' live exports say 1.12.0.11, so the gate would still refuse them. **[verified]**
- **The shipped worker now always carries poll1** (`src/solver/worker.ts` joins the `harness` and `fastPoll` sources).
  So every harness here picks the worker's source with `MODE` (`harness/mode.ts`). `none` strips poll1 off again,
  which is the unpatched game. `poll1` keeps it. `PATCH` splices a patch in at the vitest import of either. The replay
  is never touched. **[verified]**
- **The host** is an Apple M4 with 10 cores (4 performance, 6 efficiency) and 16 GB, shared with other sessions. Its
  1-minute load average was 2.7–10.5 during these runs and is logged beside each one. Compare runs with each other, not
  with #681's. Compared pairs ran back to back; the whole searches ran in the order poll1, fake, fake, poll1.
- **The lab** is #681's (`docs/research/solve-speed/harness/lab/`), driven by `harness/lab-run.ts` with 3 workers. The
  bench is #681's `profile.ts` (`harness/profile.ts`). It now keeps every job's children, so two runs over the same
  fork points compare **job by job**, not only where the recorded tree has the job.

Every claim is tagged **[verified]** (measured, or read in source here), **[inference]** (follows from what was
measured) or **[unverified]**. Clone paths are relative to the 1.12.1.2 clone.

## Answer

- **Yes, and it retraces the unpatched game exactly.** **[verified]**
  - On the per-try bench every job matched the unpatched run, child for child: 102 of 102 on 10 fork points and 272 of
    272 on 30. No job timed out.
  - A trace of every phase start, interceptor state, UI mode, prompt, input and one-off delayed call came out in the
    same order as unpatched on all 101 traced jobs.
  - Gordie W180's 8@0.5 beam on an empty tree played the same 1,657 tries and the same 14-turn line, input for input,
    twice. Its replay, unpatched, won both times.
- **A try costs 14 ms instead of poll1's 60 ms, 4.3× cheaper**, on the 30-fork bench. Unpatched it costs 474 ms.
  **[verified]**
- **A whole search is 2.4–5.2× faster, but a whole solve only 9–38% faster.** **[verified]**
  - Inside the shipped solve, the search played 86–161 tries/s against poll1's 29–40 on all three fights. Every pair
    found the same line, and every line replayed and won.
  - The rest of a solve did not change: 16–27 s before the search starts (the load check's replay and the pool's
    boot) and 11–17 s after it (the validation replay). With the fake clock the search is 2–6 s of a 30–48 s solve.
- **`spin.ts` failed for one reason.** **[verified]** It re-checks the phase on every turn of the event loop. So a
  turn's phases run before the prompt handler's 1 ms check gets a turn, and that check is what expires the
  target-select prompt the move helper queues. Left queued, the prompt either makes the harness drop the child as
  "left 1 prompts queued", or, when our lead faints, blocks the faint-switch prompt behind it until the 20 s timeout.
- **Ship it** in the workers only, beside poll1, with a check that falls back to poll1. **[inference]** The draft
  build ticket is in §6.

## 1. Why `spin.ts` broke

**Re-run on 1.12.1.2.** The 10-fork bench picks the same fork points as #681's: each of the 102 jobs returned as many
children as there, and the per-job times correlate at 0.9999 with #681's unpatched bench. That they are the same jobs
is **[inference]**. Spin ran three times (`runs/profile/bench-spin*-10forks.json`, `runs/spin/why.txt`).
**[verified]**

| Run | Jobs that match unpatched | Jobs that differ | Of those, hung (20 s timeouts) |
|---|---|---|---|
| spin | 61 of 102 | 41 | 4 (jobs 93–96, 60–100 s each) |
| spin, traced | 65 of 102 | 37 | 4 (jobs 93–96) |
| spin without `COACH_CLOCK` | 93 of 102 | 9 | 4 (jobs 93–96) |

- **#681 saw 3 differing jobs because it compared only 18 jobs**, those its recorded tree held. Compared job by job,
  more than a third differ, and which ones changes from run to run. The 4 hangs are the same 4 job numbers as #681's.
  **[verified]**

**The trace** (`harness/patches/trace.ts`, compared by `harness/trace-diff.py`) logs, in order: every phase the
interceptor starts, its state and target, every UI mode change, every prompt the prompt handler runs, every input, and
every delayed call on the scene's clock. Two unpatched runs gave the same trace on every job. **[verified]**

**What differs: one prompt that is never taken off the queue.** **[verified]**

- `game.move.select` queues three prompts (`test/helpers/move-helper.ts:84-100`). The third is for target selection,
  `SelectTargetPhase`/`TARGET_SELECT` (`test/framework/game-manager.ts:281-307`). A single battle never asks for a
  target, so this prompt only ever **expires**. It expires when the prompt handler's check runs while `CommandPhase`,
  `MovePhase`, `TurnStartPhase` or `TurnEndPhase` is current (`game-manager.ts:302-306`).
- That check is a real `setInterval` with no delay, which Node makes 1 ms (`test/helpers/prompt-handler.ts:80`). It
  looks only at the first prompt in the queue (`prompt-handler.ts:108-136`).
- **Unpatched**, the interceptor's `to` re-checks the phase from its own 1 ms interval
  (`test/framework/phase-interceptor.ts:86-107`, `interval: 0`). Between two phases a timer tick always passes, and
  the prompt handler's interval, made earlier, fires first. In both unpatched traces the prompt expired at
  `TurnStartPhase` on every one of the 72 move children. The 49 other children are switches, which queue no target
  prompt.
- **With spin**, `to` and `run` re-check on `setImmediate`, which comes before any timer. A turn whose phases end
  within a millisecond runs from the command to the next command with no prompt-handler tick in between, and the prompt
  never expires. In the traced run that happened on 48 of the 72 move children.

**What the game did differently: nothing. The harness refused the turn.** **[verified]**

- **Without a faint (33 children)**, the turn plays exactly as unpatched up to the next command. Then the harness finds
  the stale prompt still queued (`strayPrompts`, `src/solver/harness.test.ts.template:147-152`) and drops the child as
  "left 1 prompts queued" (`:786-789`). A dropped child is a different child, so the job differs.
- **With our lead fainting (15 children, all in jobs 93–96)**, the harness queues the faint replacement's prompt for
  `SwitchPhase`/`PARTY` (`:289-294`) behind the stale one. `SwitchPhase` is not among the phases that expire the stale
  prompt, and the handler never looks past it. The party screen waits for input until spin's 20 s limit throws "Timed
  out in waitUntil!". Each of jobs 93–96 plays five children, one per replacement, and 3 to 5 of them time out: the
  60–100 s jobs. That the stale prompt is the one blocking the queue is **[inference]** from the source and the trace,
  which shows no prompt running after `PARTY`.
- **Every child where the prompt expired came back the same as unpatched**, faint or not (`runs/spin/why.txt`).
- **Without `COACH_CLOCK`, spin fails the same two ways**: 5 children dropped for the stray prompt and 8 timeouts
  (`runs/profile/bench-spin-noclock-10forks.json`). Fewer, because without the extra ticks a turn takes longer and a
  prompt-handler tick lands inside it more often. **[verified]** for the counts; the reason is **[inference]**.

**The ticket's two candidates.** The second is close: a check ran after the game had moved past what it looks for. But
it is the prompt handler's check, not one of the harness's watchers, and the game itself played no differently. The
first candidate, the clock ticking mid-step, is not needed: spin fails the same way without it. **[verified]**

**The 1.12.1.1 runs** cannot be told apart job by job: #681's bench kept no children. Its 4 hangs are at the same job
numbers, and its 3 differing jobs were spin children that the tree had recorded. **[inference]** that they were the
same stray prompt.

**What this means for any faster clock.** The harness and the test framework talk through timers, not only through
the game: a prompt is answered, or expires, only when the prompt handler's interval fires. A patch keeps the game's
behaviour only if it keeps that order: each phase check comes after the timers due before it, and the timers fire in
Node's order. **[inference]**

## 2. The fake clock

`harness/patches/fake-clock.ts` is spliced in at the vitest import of the worker's harness, as #681's patches were.

**What it fakes, and why.** **[verified]** in the patch's source.

- **`setTimeout`, `setInterval`, `clearTimeout` and `clearInterval`**, for every timer made after the patch runs.
  Those are all the timers on a try's path: the scene's `MockClock` tick (`test/mocks/mock-clock.ts:9`), the prompt
  handler's check (`prompt-handler.ts:80`), the harness's learn watch and game-over watch
  (`harness.test.ts.template:189,259`), and the game's own few (`src/data/battle-anims.ts:440,549`, waiting on an
  animation to load).
- **`vi.waitUntil`**, swapped for a copy of vitest's own (`vitest/dist/chunks/test.DNmyFkvJ.js:3407-3451` in vitest
  4.1.11) that polls on the fake clock. vitest's version polls on the real timers it saved at start-up, whatever is
  faked, so without the swap the phase poll would stay real. Every wait of the phase interceptor goes through it, in
  `run` and in `to` (`phase-interceptor.ts:86,132`), and so does poll1's, which calls the same `vi` object.
- **Not faked: `Date` and `performance`.** The game reads the date for its timed events
  (`src/timed-event-manager.ts:30,51`) and stamps saves with it. With `Date` untouched, a worker's `new Date()` read
  the real time while its fake clock ran 4.5 s ahead of real time (`runs/profile/cpu-fake-30forks.stats.json`: `date`
  11:40:58 UTC, written at 13:40:58 CEST; `fakeMs` 17,542 against 13,078 ms of uptime). The timed-event manager is
  switched off in tests anyway (`test/framework/game-wrapper.ts:207`), but April Fools is read straight from the date
  (`timed-event-manager.ts:51`). **[verified]**
- **Not faked: `setImmediate`, `queueMicrotask` and `process.nextTick`.** The driver needs the real ones to know the
  process has nothing left to run.

**How it is driven.** **[verified]** in the patch's source.

- One loop waits for a real `setImmediate`, which runs only once the microtask queue is empty, then fires **one**
  timer: the first due, ties broken by when each was last scheduled. That is Node's order for timers of one duration,
  where an interval goes back in line after its own callback.
- **It runs fast only while something waits.** While any `vi.waitUntil` is pending, the loop fires the next timer at
  once, whatever its due time. With nothing waiting, between jobs, the clock follows real time, 1 ms per real ms, as
  the real timers would. Code that waits on a timer outside `vi.waitUntil` is never stuck, only not sped up.
- **Delays are coerced as Node coerces them**: anything outside [1, 2³¹ − 1] ms is 1 ms.
- The game's 20 s timeout (`TEST_TIMEOUT`, `test/constants.ts`) now runs on the fake clock, so a stuck phase fails
  after 20 s of fake time, a fraction of a second of real time.
- It fired about 190 timers per try on the 30-fork bench, worker boot included
  (`runs/profile/cpu-fake-30forks.stats.json`). **[verified]**

**vitest's own fake timers, tried first.** **[verified]**

- `vi.useFakeTimers` (`@sinonjs/fake-timers`, bundled in vitest 4.1.11) mishandles both timer forms the test framework
  uses (`harness/vitest-timers.probe.ts`, `runs/profile/vitest-timers-probe.txt`):
  - `setInterval(fn)` with no delay, the prompt handler's form, fires once, then gets a due time of `NaN` and never
    fires again.
  - `setInterval(fn, 0)`, `to`'s form, fires forever without the clock moving.
  - Node makes both 1 ms.
- Run as is (`FAKE_CLOCK_IMPL=vitest FAKE_VITEST_RAW=1`), a worker never finished booting. It fired 2.07 million timers
  in 42 s and the clock never moved from its start (`runs/profile/vitest-raw.txt`).
- With delays coerced as Node does (`FAKE_CLOCK_IMPL=vitest`), vitest's clock works: 272 of 272 jobs matched, at
  14.9 ms per try. Its tie order differs from Node's (by creation, not by last scheduling). It also ties the fake clock
  to vitest's internals: the clock it hangs on the installed `setTimeout`, which vitest does not document.
- **Choice: the hand-rolled clock.** It is about 100 lines, keeps Node's order, depends on nothing inside vitest, and
  was 7% faster per try here. **[inference]**

## 3. Fidelity

### The per-try bench **[verified]**

One worker plays every legal action of 10 or 30 fork points of Gordie's tree, one job each. The tree is the unpatched
8@0.5 beam recorded on 1.12.1.2 (`runs/lab/gordie-w180-beam_8_0.5-none.json`). Every run is compared job by job, child
for child, with the unpatched run (`runs/profile/bench-*.json`, `vsRef`).

| Run | 10 forks, 102 jobs: same / differ | 30 forks, 272 jobs: same / differ | Timeouts |
|---|---|---|---|
| poll1 | 102 / 0 | 272 / 0 | 0 |
| fake50 | 102 / 0 | 272 / 0 | 0 |
| **fake clock** | **102 / 0** | **272 / 0** | **0** |
| fake clock on vitest's timers, coerced | 102 / 0 | 272 / 0 | 0 |
| spin | 61 / 41 | — | 4 jobs |

**The traces agree too.** The fake clock and fake50 gave the same sequence of phase starts, interceptor states and
targets, UI modes, prompts, inputs and one-off delayed calls as unpatched, on every traced job
(`runs/trace/compare.txt`). Two unpatched runs agree with each other in the same way. Only the play-time counter, a
repeating event that fires on every clock tick, differs in how often it fires; its value is already left out of the
fork point's hash (`docs/research/solve-speed/harness/lab/tree.ts`, `normalHash`). The last job of each fake run was
not traced, because its trace was still buffered when the worker stopped. Its children matched. **[verified]**

### A whole beam **[verified]**

Gordie W180's 8@0.5 beam ran with 3 workers, each run on an empty tree, so every try was played (`runs/lab/`):

| Run | Tries | Line | Replay | Seconds | Load (start, end) |
|---|---|---|---|---|---|
| unpatched (the recording) | 1,657 | 14 turns | won | 345.9 | 2.7, 4.8 |
| poll1 | 1,657 | the same | won | 71.3 | 4.1, 5.7 |
| fake clock | 1,657 | the same | won | 35.0 | 5.7, 6.4 |
| fake clock, again | 1,657 | the same | won | 31.8 | 4.1, 5.5 |
| poll1, again | 1,657 | the same | won | 63.4 | 5.5, 4.8 |

- "The same" is the whole path, input for input.
- **1.12.1.2 changed nothing here.** Unpatched, it played #681's 1.12.1.1 count and line exactly
  (`docs/research/solve-speed/runs/lab/gordie-w180/beam_8_0.5.json`).

### The shipped solve **[verified]**

All four solves of each fight in §4 found the same line, input for input, and its unpatched replay won
(`runs/solve/<fight>-<n>-<variant>.progress.jsonl`, the last line).

## 4. Speed

### Per try **[verified]**

| Run | 10 forks: per try | 30 forks: per try | vs poll1 (30 forks) |
|---|---|---|---|
| unpatched | 426 ms | 474 ms | 0.13× |
| poll1 | 55 ms | 60 ms | 1× |
| fake50 | 32 ms | 37 ms | 1.6× |
| **fake clock** | **15 ms** | **14 ms** | **4.3×** |
| fake clock on vitest's timers, coerced | 15 ms | 15 ms | 4.1× |
| spin | 2,471 ms (median job 11 ms) | — | — |

- **Three benches at once**, as in a 3-worker search, cost more each: 65 ms per try for poll1 and 19 ms for the fake
  clock, 3.4× (`runs/profile/contend.log`, load 4.1–6.5). A worker that is always busy shares the machine.
  **[verified]**
- **fake50 is a fallback in itself.** It keeps the game's own 50 ms poll, needs no copy of `PhaseInterceptor.run`, and
  is still 1.6× faster than poll1. **[verified]**

### A whole search and a whole solve **[verified]**

**The beam** (§3): poll1 took 54–59 s from the pool being up to the replay's win, and the fake clock 23–24 s, 2.4×.
That is less than the per-try 4.3×. Why is **[unverified]**. Candidates are the beam's layers, each of which waits for
its slowest job, and the contention above.

**The shipped solve** is `solve()` exactly as the plugin runs it (`harness/solve.ts`): the load check, the pool, the
discrepancy search ahead of the portfolio (#761), and the validation replay. It ran with 3 workers, each fight four
times in the order poll1, fake, fake, poll1 (`runs/solve/`, `runs/batch-solve.log`).

| Fight | Tries | Line | Whole solve: poll1 | Whole solve: fake clock | Search: poll1 | Search: fake clock |
|---|---|---|---|---|---|---|
| Gordie W180 | 349 | 24 turns | 50.9, 47.6 s | 48.2, 34.3 s | 10.9, 12.1 s (29–32/s) | 4.1, 2.3 s (86–152/s) |
| Drayton W188 | 266 | 16 turns | 37.9, 33.9 s | 35.7, 29.6 s | 6.9, 6.6 s (38–40/s) | 2.2, 1.8 s (119–149/s) |
| Kieran W190 | 880 | 32 turns | 59.7, 59.3 s | 36.0, 37.5 s | 25.2, 27.1 s (33–35/s) | 5.5, 5.9 s (150–161/s) |

"Search" runs from the first progress event to the last. Before it, 16–27 s went to the load check's replay and the
pool's boot. After it, 11–17 s went to the validation replay. Neither depends on the variant.

- **The search played 2.7–5.2× as many tries per second.** The lowest is Gordie's first fake run, at load 5.3–7.7.
- **The whole solve is 9–38% faster**, as the means of each pair: Gordie 49 → 41 s, Drayton 36 → 33 s, Kieran
  60 → 37 s.
- **With the fake clock, the search is the smaller part of a solve.** The two unpatched replays and the pool's boot
  take 27–44 s of a 30–48 s solve. Speeding the search up further would buy little. **[inference]**
- **These are the shipped search's tries.** With LDS ahead of the portfolio (#761), every fight won in its first stage,
  in 266–880 tries. #681's lab on 1.12.1.1 counted Gordie's LDS at 349 tries and T24, and Kieran's at 880 requested and
  T32, as here. Drayton's was 304 and T22 there and is 266 and a 16-turn line here. Whether 1.12.1.2 or a difference
  between the shipped LDS and the lab's moved it is **[unverified]**. It does not touch the comparison: both variants
  played the same 266.

### What a try is still spent on **[verified]**

V8's CPU profile of one worker over the 30-fork bench, from its first job on, summarised by `harness/prof.py`
(`runs/profile/cpu-fake-30forks.txt`, `cpu-poll1-30forks.txt`). Under the profiler a try cost 14.8 ms with the fake
clock and 49.6 ms with poll1.

- **Idle fell from 84% to 23%.** poll1 was idle 17.9 s of 21.4 s, the fake clock 1.5 s of 6.5 s. What is left idle is
  the gap between jobs, while the bench compares the last job's children and sends the next. **[inference]**
- **Busy time per try rose from 8.2 to 11.7 ms.** Why is **[unverified]**. The driver's own functions are 1.2% of busy
  time. A worker that is always busy may run on an efficiency core more often than one that is mostly idle.
- **Shares of busy time, fake clock (poll1)**:
  - Restoring the fork point: `initSessionFromData` 20.2% (27.5%) inclusive, plus `reload` 8.4%, `sweep` 5.1% and
    `reloadSession` 5.1%.
  - Text lookups, i18next: 12.0% (11.1%).
  - The game's own logic (field, data, items, phases, other): about 39% (34%).
  - Phaser 7.9%, game UI 5.3%, jsdom 3.5%, the test framework 5.3%, garbage collection 5.6%.
  - The harness's own code 7.3%. Building the child's `position` and `forkPoint` takes 4.2% and 3.0% inclusive.
- **There is no timer left to remove.** What remains is the game restoring a save and playing a turn. About a third of
  it is the restore, which every try does. **[inference]**

## 5. The cost at each pin bump

**What the fake clock relies on.** **[verified]** in the patch and the clone.

| It relies on | Where | What a change would do |
|---|---|---|
| The phase interceptor waits through `vi.waitUntil` | `phase-interceptor.ts:86,132` | A wait that bypasses it is not sped up: the clock follows real time there |
| `vi.waitUntil`'s behaviour, which the fake one copies | vitest 4.1.11, `test.DNmyFkvJ.js:3407-3451` | A changed poll order would not be copied |
| Every timer on a try's path is made through the global `setInterval` or `setTimeout` at call time | `mock-clock.ts:9`, `prompt-handler.ts:80`, the harness | A timer bound at import would stay real, beside the fake ones |
| Nothing inside `MockClock`, `PromptHandler` or the game's own timer users | — | — |

- **It copies no game method.** poll1 copies `PhaseInterceptor.run`. The fake clock replaces only vitest's `waitUntil`
  and the timer globals. **[verified]**
- **At the last three bumps, none of it moved.** **[verified]**
  - `phase-interceptor.ts`, `prompt-handler.ts`, `mock-clock.ts`, `game-wrapper.ts` and `reload-helper.ts` are
    byte-identical in the 1.12.1.1, 1.12.1.2 and 1.12.1.3 clones, and all three use vitest 4.1.11. The 1.12.1.3 clone
    is the shared `.cache` one a pin-bump session set up today.
  - From 1.12.0.11 to 1.12.1.1, `phase-interceptor.ts` and `prompt-handler.ts` changed only by log renames and
    `ui.getMode()` → `ui.mode`. Both still wait through `vi.waitUntil`. vitest went from 4.1.9 to 4.1.11, and
    `waitUntil` is byte-identical in the two.
  - So a check that asks "do `run` and `to` still wait through `vi.waitUntil`?" would have passed at all three bumps.
    A copy of the whole of `to` would have failed at the first, for log renames alone. **[inference]**
- **A moved dependency costs speed, never a line.** The replay that validates a win stays unpatched, as with poll1.
  **[inference]**

**How a shipped version would check and fall back.** **[inference]** At module load, before it installs anything, as
poll1 does:

1. `String(vi.waitUntil)` matches a mirrored copy of vitest's, whitespace aside.
2. `PhaseInterceptor.prototype.run` and `.to` both still call `vi.waitUntil`.
3. The sources of `MockClock` and `PromptHandler` still call the global `setInterval`, not one imported from
   `node:timers`.

If any check fails, it installs nothing. The worker plays on poll1, or on the slow poll if poll1's own check failed,
and reports why, as `COACH_POLL_OUT` reports poll1's fallback. The checks run before any timer exists, so there is
nothing to undo. Checks 2 and 3 can be registered as game reads. Check 1 reads vitest, which the drift check does not
hash, so only the check at load guards it.

## 6. Recommendation **[inference]**

**Ship the fake clock in the search's workers, on top of poll1, with a fallback to poll1.** It removes the last of the
waiting from a try, 4.3× per try, and it played every job and a whole beam exactly as the unpatched game. Its risk is
the same as poll1's and is held by the same unpatched replay. It copies no game method.

**Then look at the solve's fixed costs, not the search.** With the fake clock, the load check's replay, the pool's boot
and the validation replay are most of a solve. That is a new question, not answered here.

### Draft: Solver: run the search's workers on a fake clock

```markdown
## Parent

#657

## What to build

With the 1 ms poll (#759), a search worker still waits on real 1 ms timers for most of each try: the scene's
`MockClock` tick, the prompt handler's check, the harness's learn and game-over watches, and the phase poll itself.
#775 ran them all on one **fake clock**, which fires the next due timer as soon as the process is idle, instead of
waiting for real time to pass.

Findings: [`docs/research/fake-clock/findings.md`](https://github.com/IIxauII/coachemon/blob/research/fake-clock/docs/research/fake-clock/findings.md)
on `research/fake-clock`. The prototype is
[`harness/patches/fake-clock.ts`](https://github.com/IIxauII/coachemon/blob/research/fake-clock/docs/research/fake-clock/harness/patches/fake-clock.ts).
All measured on game version 1.12.1.2.

- **Per try:** 14 ms against the fast poll's 60 ms (4.3×), on the 30-fork bench. Every job matched the unpatched game
  child for child: 102 of 102 and 272 of 272. No timeouts.
- **A whole beam:** Gordie W180's 8@0.5 beam played the same 1,657 tries and the same 14-turn line, twice, and its
  replay won. 32–35 s against the fast poll's 63–71 s.
- **The shipped solve, 3 workers:** the search played 2.7–5.2× as many tries per second on all three fights, with the
  same lines, every one replayed and won. The whole solve is only 9–38% faster (Kieran 60 → 37 s), because the load
  check, the pool's boot and the validation replay don't change.
- **Why `spin.ts` failed and this doesn't:** spin re-checked phases before the prompt handler's 1 ms check could run,
  so the move helper's target-select prompt never expired. The fake clock keeps Node's timer order, and traces of
  every phase, UI mode, prompt and input matched the unpatched game's on every traced job.

Build:

- Splice the fake clock into the harness source of the run named `worker` only (`src/solver/worker.ts`), beside the
  fast poll. The run named `replay` (`src/solver/replay.ts`) stays untouched, so every win is still validated on the
  unpatched game. A fake clock that changed the game's behaviour would then cost time, never a wrong **oracle line**.
- Fake `setTimeout`, `setInterval`, `clearTimeout` and `clearInterval`, and replace `vi.waitUntil` with a copy of
  vitest's that polls on the fake clock. Leave `Date` and `performance` real: the game reads the real date for timed
  events and save stamps. Leave `setImmediate`, `queueMicrotask` and `process.nextTick` real: the driver needs them to
  know the process is idle.
- The driver fires one timer at a time, in Node's order (due time, then when it was last scheduled), each after a real
  `setImmediate`. It runs fast only while a `vi.waitUntil` is pending, and follows real time otherwise. Delays outside
  [1, 2³¹ − 1] ms are 1 ms, as in Node. Use a hand-rolled clock, not `vi.useFakeTimers`: vitest's fake timers lose the
  prompt handler's `setInterval(fn)` and loop forever on `setInterval(fn, 0)` (findings §2).
- Before installing anything, the worker checks that `vi.waitUntil` is the one the fake clock copies, that
  `PhaseInterceptor.run` and `.to` still wait through `vi.waitUntil`, and that `MockClock` and `PromptHandler` still
  make their intervals with the global `setInterval`. If a check fails, it installs nothing, keeps the fast poll, and
  reports why beside the fast poll's report, so a changed upstream costs speed, never a result.
- Register `PhaseInterceptor.run`, `PhaseInterceptor.to`, `MockClock` and `PromptHandler` as game reads, so the
  pin-bump drift check names them. vitest's `waitUntil` is not game source: the check at load is what guards it.

## Acceptance criteria

- [ ] Only the `worker` run carries the fake clock; the `replay` run's harness source is byte-identical to today's
- [ ] Gordie W180's 8@0.5 beam with the fake clock plays the same tries and the same line as without it
- [ ] `new Date()` inside a worker reads the real date
- [ ] When a check fails, the worker plays on the fast poll, the solve still answers, and the fallback is reported
- [ ] `PhaseInterceptor.run`, `PhaseInterceptor.to`, `MockClock` and `PromptHandler` are registered game reads
- [ ] A full solve of one of the three fights (Gordie W180, Drayton W188, Kieran W190) with the fake clock is timed and
      replays a win

## Blocked by

None. It can start now.
```

## Not yet measured

- **The 4-vCPU laptop VM**, where #681 measured the shipped solve. A fake-clock worker keeps a whole core busy, so 2
  workers on 4 vCPUs with the game tab beside them are untested.
- **Why the beam gained 2.4× and not 4×**, and why busy time per try rose from 8.2 to 11.7 ms (§4).
- **More fights and more fork points.** Job-by-job fidelity is measured on Gordie's fork points (102 + 272 jobs) and
  Gordie's whole beam; on Drayton and Kieran, only on the line each shipped solve found.
- **More than 3 workers.** Every run used 3.
- **The fallback path.** The checks in §5 are a design. No run exercised a failed check.
- **What moved Drayton's LDS** from 304 tries and T22 to 266 and a 16-turn line (§4).
- **The solve's fixed costs**: the load check's replay, the pool's boot and the validation replay, now most of a solve.

## Files

Paths are under `docs/research/fake-clock/`. #681's harness and the runs this builds on are copied in, unchanged, at
`docs/research/solve-speed/` (`findings.md`, `harness/`, `runs/profile/`, `runs/lab/<fight>/`, `runs/lab/patched/`).
The lab's `beam.ts`, `methods.ts`, `pool.ts` and `tree.ts` are used from there.

| Path | What it is |
|---|---|
| `harness/patches/fake-clock.ts` | The fake clock: hand-rolled, or vitest's with `FAKE_CLOCK_IMPL=vitest` (§2) |
| `harness/patches/trace.ts`, `trace-diff.py`, `spin-why.py` | The tracer, the job-by-job trace comparison, and spin's children against the stale prompt (§1, §3) |
| `harness/mode.ts` | Which source the workers run: unpatched, poll1, and a patch on either |
| `harness/pinned.ts` | Relabels the 1.12.0.11 fixtures as 1.12.1.1 or 1.12.1.2 (Setup) |
| `harness/profile.ts`, `bench.sh`, `trace.sh`, `contend.sh`, `cpu.sh`, `prof.py` | The per-try bench, its variants, traced runs, three benches at once, and the CPU profiles (§1, §3, §4) |
| `harness/lab-run.ts`, `solve.ts`, `batch.sh` | The lab's beam and the shipped solve, poll1 and the fake clock back to back (§3, §4) |
| `harness/vitest-timers.probe.ts` | What vitest's fake timers do with the test framework's timer forms (§2) |
| `runs/lab/gordie-w180-beam_8_0.5-*.json`, `runs/batch-beam.log` | The beams: unpatched (the recording), poll1 and the fake clock, each pair twice (the second pair is logged in `runs/batch-solve.log`) |
| `runs/solve/`, `runs/batch-solve.log` | The shipped solves, four per fight, with their progress and lines |
| `runs/profile/bench-*-{10,30}forks.json`, `bench-*.log` | The per-try benches, with every job's children digest and `vsRef` |
| `runs/profile/cpu-*`, `contend.log`, `vitest-*.txt` | CPU profiles, the driver's counts, three benches at once, vitest's timers |
| `runs/spin/why.txt`, `runs/trace/` | Spin's children against the stale prompt, and the trace comparisons |

To run it again (traces are not kept: about 2 MB per run, and about 1 GB for spin):

```sh
node docs/research/solve-speed/harness/setup-clone.ts <home>   # then link <home>/clone/v<pin>/game as .cache/pokerogue/v<pin>
MODE=none node docs/research/fake-clock/harness/lab-run.ts --fight src/solver/fixtures/gordie-w180.json \
  --tree <trees>/gordie-w180 --method beam:8:0.5 --workers 3 --out <out.json>
sh docs/research/fake-clock/harness/bench.sh <trees>/gordie-w180 <scratch>/bench10 10 poll1 fake50 fake fakevitest spin
sh docs/research/fake-clock/harness/trace.sh <trees>/gordie-w180 <scratch>/bench10/none/jobs.json <scratch>/trace none1 none2 fake spin
python3 -I docs/research/fake-clock/harness/spin-why.py <scratch>/trace none2 spin fake
sh docs/research/fake-clock/harness/batch.sh <scratch> beam solve beam2
```
