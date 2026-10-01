# Where the read stage's seconds go in a trainer fight with six (#514)

Research for [The overlay's read stage blocks the tab 1–13 s per turn card in a trainer fight with a 6-mon party](https://github.com/IIxauII/coachemon/issues/514),
on the map [the overlay's lag while a human plays](https://github.com/IIxauII/coachemon/issues/480). Overlay code at
`b69c00c`.

## Answer

**The time goes to collapsing each exchange's endings, not to the searches.** Almost all of `read` is spent inside
`tpFight` (`35-team-plan.js:186-289`), where `one()` (`:277-282`) reduces each ending's pool to a single branch.
The pool holds every branch that ended in a win, and separately every one that ended in a loss, across all turns of
the exchange. `one()` reduces it with `tpMerge(list, 1)` (`:290-304`), which merges the closest pair again and again,
an O(n³) loop.

The pools reach **372 branches**, and the collapse is **76–84 % of the whole card** when six or five of ours stand
against Tangela with its heals. The beam merge inside the turn loop (`tpMerge(…, 4)`) never sees more than 57 branches
and costs under 5 ms. The game's own damage and AI calls are 20–85 ms in every scenario.

The collapse is also more work than its answer needs. Merging down to a single branch makes every continuous field
(`mh`, `fh`, `ox`, `od`, `og`, `fd`, `fg`, `turns`) exactly the p-weighted mean of the pool, whatever the order. Only
the discrete fields (`fs`, `mb`, `fb`) depend on the order (`merge-one.mjs`, below).

## Method

The encounter oracle's mechanics, aimed at a battle card. `run.ts` bundles the overlay with timers and counters
patched into copies of its sources, never the repo's own:

- `tpFight`, `tpMerge`, `tpSearch` (labelled `held`, `free`, `at`, `at+move`), `tpTables`, the sweep, the matrix and
  `tpView`;
- the turn read's game calls (`asDamage`, which `asAi` goes through, `sceneExactMoves`, `monRecord`);
- the three parts of `composeBattleCard`: `teamPlanner`, `battleModel` and `view`.

`profile.test.ts.template` runs on upstream's vitest harness in the pinned clone (`1.12.0.11`), headless. It rebuilds
wave 25 of the lag run `2026-10-01T10-41-17-742Z`:

- **The fight:** Rival Ivy's Combusken 18, Wattrel 17 and Tangela 16, against Larvitar 15, Machop 13, Taillow 10,
  Growlithe 11, Skwovet 10 and Rockruff 10.
- **The moves:** every move the wave's cards name, plus filler moves.
- **What it times:** `composeBattleCard` built fresh, the cost the overlay pays once per new turn or faint.

Party size is varied by fainting bench mons. Tangela is run both with its heals (Mega Drain, Ingrain, Sleep Powder,
Vine Whip) and without them (Vine Whip, Bind, Poison Powder, Growth). The mid-fight states are 120 random HP draws.

Timings are Node (V8), not Orion (WebKit), so read the ratios and counts, not the milliseconds. At six standing with
all foes up, the harness's median is 839 ms; the field's p50 was 2,310 ms.

## Findings

### 1. `read` split (median of 3, ms, all three foes up)

| scenario | card | game calls | tables | sweep | `held` search | `free` search | all `at` searches | `tpMerge` | memo misses / `tpFight` calls |
|---|---|---|---|---|---|---|---|---|---|
| heals · 6 of ours | 839 | 83 | 87 | 72 | 369 | 227 | 39 | **648** | 326 / 11,433 |
| heals · 5 | 700 | 51 | 53 | 81 | 289 | 249 | 3 | **589** | 236 / 4,383 |
| heals · 4 | 365 | 28 | 25 | 31 | 124 | 150 | 2 | **292** | 144 / 1,488 |
| heals · 3 | 192 | 23 | 22 | 22 | 94 | 27 | 6 | **143** | 66 / 498 |
| heals · 2 | 57 | 18 | 17 | 20 | 3 | 0 | 2 | 23 | 19 / 77 |
| heals · 1 | 39 | 10 | 9 | 21 | 0 | 0 | 0 | 21 | 5 / 13 |
| plain · 6 | 133 | 58 | 58 | 34 | 8 | 5 | 8 | 38 | 44 / 6,890 |
| plain · 5 | 153 | 85 | 90 | 32 | 7 | 2 | 1 | 36 | 37 / 2,331 |
| plain · 4 | 74 | 35 | 36 | 17 | 6 | 0 | 0 | 22 | 30 / 713 |
| plain · 3 | 63 | 37 | 36 | 8 | 2 | 0 | 0 | 10 | 21 / 210 |
| heals · 6 · Tangela down | 124 | 68 | 71 | 16 | 9 | 4 | 5 | 21 | 36 / 4,686 |
| heals · 6 · Wattrel down | 448 | 57 | 59 | 74 | 176 | 87 | 25 | 331 | 163 / 8,718 |

"Tables" includes the game calls made while building them. `tpMerge` time is counted inside the sweep and search
columns, not alongside them. Raw data: `results/scenarios.json`.

### 2. Nearly all of the merge time is `one()` (`results/merge-by-k.json`)

| scenario | card ms | `tpMerge(…, 1)`: calls · ms · largest pool | `tpMerge(…, 4)`: calls · ms · largest input |
|---|---|---|---|
| heals · 6 | 687 | 492 · **507.5** · 372 | 962 · 4.5 · 57 |
| heals · 5 | 566 | 363 · **465** · 372 | 776 · 4.1 · 57 |
| heals · 4 | 360 | 217 · **281** · 293 | 483 · 1.9 · 57 |
| heals · 3 | 197 | 101 · **143** · 293 | 169 · 0.7 · 40 |
| plain · 6 | 200 | 59 · 38 · 300 | 112 · 1.2 · 60 |

A pool of n branches costs about n³/6 distance checks: 372 branches make 8.6 M. One heals card at six of ours makes
**178 M**.

### 3. The tail is the same cubic, not a separate cause (`results/random-hp.json`)

Over 120 random mid-fight HP states (Tangela out, Machop facing it, 5 or 6 of ours):

- Card ms: p50 99, p90 304, max 802. The max is 8× the median.
- Card ms against `tpMerge` distance checks: **r = 0.957**.
- The slowest state spent 725 of its 802 ms in `one()`, with 222 M distance checks.

The field's 12.9 s refresh (#14), 5–6× its neighbours, fits this tail. No special state is needed to explain it.

### 4. The healer multiplies the number of exchanges priced, not their length

`tpFight` never reached `TP_TURNS` in any scenario, and almost every exchange ended within 6 turns, with or without
the heals. What the heals change is how many distinct exchanges get priced.

The memo is keyed on rounded HP (`:190-191`). Drain and Ingrain scatter the foe's HP over many values, so far fewer
calls repeat a key. At six of ours, Tangela with heals made **326 memo misses**, against 44 without them.

Each miss also ends with bigger win and loss pools. The `one()` cost comes out **13×** higher: 507 ms against 38 ms.

### 5. The extra searches per `at` pin are cheap; the first two pay

A refresh does run N + 3 searches: `held`, `free`, one `at` for each candidate the turn line prices, and the `at+move`
for the ⚔ pin. But they all share one memo (`T.memo`, made once per `teamPlanner` call), so every search after the
first two is mostly memo hits.

At six of ours, the seven `at` searches together cost 39 ms against `held` + `free`'s 596 ms. The cost does not scale
as N searches × N⁴. It scales with the number of distinct exchanges `held` and `free` price.

### 6. Moving the collapse to O(n) keeps its answer (`merge-one.mjs`)

The real `tpMerge` was run on 100 random pools of 8–372 branches:

- **Continuous fields:** the result equals the p-weighted mean to within 2.4e-15, the float error.
- **Discrete fields** (`fs`, `mb`, `fb`): the result equals the pool's most likely combination in 97 of 100 pools, and
  the heaviest single branch's in 60 of 100.

The closest-pair merge is still what the turn loop needs at k = 4, where it is cheap.

## The ticket's open questions

1. **Split `read`.** Answered in findings 1–2. The fight plan is 89–96 % of every trainer card over 150 ms, and inside it the
   ending-pool collapse is 68–84 % of the card. The game calls through the turn read are 5–15 % of it at six standing,
   and most of a cheap card.
2. **Reproduce wave 25.** Done headless.
   - Does `tpFight` hit `TP_TURNS`? Never.
   - How many searches per refresh? N + 3, confirmed, but only the first two are expensive (finding 5).
3. **The meter misses some of the overlay's time.** Confirmed in the code, on master after #513:
   - `drain()` → `reset()` (`01-meter.js:24-31`) renews `since` and `ended` but leaves `prev`. A frame gap that spans a
     drain is therefore charged only the work done after the drain, and the refresh before it is charged to nobody.
   - `scripts/lag-run/report.ts:27` files every gap with `driver > 0` as a driver gap, so a 7.5 s refresh with 38 ms of
     driver in its gap leaves the comparison.
   - Both bias **overlay-made hitches** and **overlay share of hitch time**. Neither touches the turn card ms, which
     comes from the refresh records.
4. **Is a six-mon party enough on its own?** Not to reach seconds. Six of ours against a non-healing Tangela build cost
   133 ms here, 6× less than with the heals. That matches waves 20 and 35 in the field, which peaked at 366–374 ms. It
   takes a foe that heals or drains to multiply the exchanges priced, and with them the cubic collapse.
5. **The two runs are not a clean comparison.** The harness sidesteps this by holding the fight fixed and changing one
   thing at a time.

## Limits

- **Engine.** Node (V8), not WebKit. Use the ratios and counts, not the ms.
- **Sets.** Movesets are partly filler, and IVs and natures are normalised (31, Hardy). The harness's plan names
  Combusken as the win condition, where the field's named Tangela. The cost shape held across every variant tried.
- **Exact field states.** Not rebuilt. The log keeps card text, not HP or full sets.

## Reproduce

Needs the pinned clone provisioned as for `npm run oracle:encounter`. In a worktree, link the main checkout's
`.cache`.

```sh
node docs/research/read-stage-stall/run.ts                        # every scenario, 3 reps → .cache/read-stage/<stamp>.json
COACH_REPS=1 COACH_RANDOM=120 node docs/research/read-stage-stall/run.ts -t "random mid-fight"
node docs/research/read-stage-stall/merge-one.mjs                 # the O(n) equivalence check
```

vitest exits 1 on the clone's known i18n rejection, as the oracle documents; read the results file.
