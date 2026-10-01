# The fight plan's search, benchmarked alone

A head start for [The overlay's read stage blocks the tab 1–13 s per turn card in a trainer fight with a 6-mon party](https://github.com/IIxauII/coachemon/issues/514), gathered while grilling [Fix: the freeze when a new turn's card is worked out](https://github.com/IIxauII/coachemon/issues/510). It does not resolve #514: the numbers come from hand-built tables in Node, not from the game in Orion.

## What was measured

One trainer turn card's worth of fight plan work, on `35-team-plan.js` at `b69c00c`:

- `tpModel`: the sweep, the matrix, and the held and free searches;
- `at({ mi, free: false })` for every one of ours standing;
- `view(pin)`, with the pin being our field mon's move.

The run used F = 3 foes and N = 3–6 of ours. Nothing else in the `read` stage was run.

There are three fixtures:

- **quick:** exchanges end in 1–3 turns.
- **stall:** foe 0 heals 1/16 a turn and drains 50% with its hits, while our hits do 8–20% of its HP. Exchanges run 7–15 turns.
- **stall + ties:** stall, with every pairing's speed order uncertain (`first` between 0.2 and 0.8, as paralysis tokens or speed ties give), so both orders branch.

Each figure is the median over seeds (6, or 4 for ties) of per-seed medians of 5 runs (3 for ties), in Node 26. Runs vary by ±30%. Absolute times differ from WebKit's, so compare shapes.

| case | N=3 | N=4 | N=5 | N=6 (max) | `tpFight` calls / misses (N=6) | `tpSearch` runs | `tpMerge` share | `at()` loop share (N=6) |
|---|---|---|---|---|---|---|---|---|
| quick | 11 ms | 34 | 55 | 121 (231) | 12,130 / 999 | 5.8–8.3 | 74–85% | 38% |
| stall | 30 | 120 | 331 | 528 (823) | 8,419 / 664 | 5.5–8.3 | 92–94% | 13% |
| stall + ties | 210 | 467 | 1,547 | 2,100 (4,119) | 9,489 / 892 | 5.8–8.5 | 95–97% | 27% |

## Findings

1. **The search alone reproduces the shape.** In the stall-with-ties case it runs from tens of ms at N = 3 to seconds at N = 5–6. That is about 10× from N = 3 to 6, against about 48× measured in the game (48 ms to 2.3 s). What drives it is the number of exchange turns times the branching per turn: 2 orders × 4 rolls × 4 rolls × 4 standing branches is 128 children per turn.
2. **`tpMerge` is nearly all of it.** Merging the 128 children down to 4 each turn is 59–69% of the time in the stall cases. Merging the win and loss pools down to 1 in `one()` is 28–65%, on lists up to 338 long, and is the larger half in quick fights. The rest of `tpFight` is 1–14%. `tpValue`'s own time and `tpSearch`'s own time are each 0–5%.
3. **The memo hit rate is 80–92%.** The misses are few but each is expensive because of its merges. The held and free searches and the sweep and matrix pay nearly all the misses. The N `at()` searches then mostly hit the shared memo.

## Savings that keep the answer

Each was checked bit-identical in its JSON output on 6 + 4 seeds × 4 party sizes.

- **A closest-pair `tpMerge` in O(n²): 1.4–3.5×,** largest in the stall and ties cases. It is the same greedy merge, with the same pair order, tie-break and arithmetic. It keeps a distance matrix and each row's nearest later neighbour in typed arrays, and builds objects only for the survivors.
- **A template-string memo key:** within noise.
- **Memoising `tpValue` on the exact state:** about half its calls hit, but there is no speed-up, because `tpValue` was already cheap. Reusing whole searches across `at()` calls has little to win, for the same reason.

## Knobs that change the answer

Each is measured on top of the exact `tpMerge`.

- **`TP_TURNS` 10 or 6:** 4–6× and 6–65× faster in the stall cases. But the first step changes in 3–5 of 6 seeds, and the result (win, loss or stall) flips in up to all of them. Not safe.
- **Memo HP rounding to 1% or 3% of max HP:** up to 3.6× (stall) and 5.8× (ties) overall, against about 3× for the exact merge alone. With 1% rounding the base plan's first step never changed and `val` moved by at most 5.1. With 3% under ties the first step changed in 1 of 4 seeds. The result never changed.
- **Beam 12 or 6:** at most about 1.3× more. The first step changed in up to 2 of 6 seeds, and `val` moved by up to 77.
- **Pricing only the top-k act-line candidates with `at()`:** at most saves the `at()` loop, 0–38% of the card. How often it changes the act line was not measured, because the act line's ranking is not in this benchmark.

## Not measured

- The real game's tables. Wave tokens, multi-hit moves and accuracy misses were not modelled, beyond what the ties fixture stands in for.
- JSC timings.
- The rest of the `read` stage: the turn read's game calls and `battleModel`.

## Running it

The scripts are in [`fight-plan-search-bench/`](fight-plan-search-bench/). Run these from that folder:

```sh
git archive b69c00c skills/coachemon/scripts/hud | tar -x --strip-components=3   # the hud/ copy, ignored
node make-copy.mjs        # hud/35-team-plan.bench.js: counters, profiler, knobs, exports
node experiments.mjs      # the variants; raw output kept in exp-normal.txt and exp-ties.txt
```

`bench.mjs` runs one turn card. `fixtures.mjs` builds the tables. `globals.mjs` installs the game enums through `hud-bundle.mjs`'s `enumPrelude`.
