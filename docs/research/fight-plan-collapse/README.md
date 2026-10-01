# PROTOTYPE: faster ways to price a fight plan's exchanges, and what each changes on the card (#526)

Throwaway, on `prototype/fight-plan-collapse`, never merged. For [Prototype: faster ways to price a fight plan's
exchanges, and what each changes on the card](https://github.com/IIxauII/coachemon/issues/526), on the map [the
overlay's lag while a human plays](https://github.com/IIxauII/coachemon/issues/480). Overlay code at `33bcf24` (v1.16.1).

## What it is

The #514 harness (`research/read-stage-stall`). It rebuilds wave 25 (Rival Ivy: Combusken, Wattrel, Tangela against six
of ours) in the pinned game, headless, and builds the trainer battle card. The bundle is patched so that four things
switch at run time through `globalThis.__V`:

- how `tpFight`'s `one()` collapses an ending pool;
- how its memo keys HP;
- what shape the pools have;
- what is pruned before the collapse.

Every state is then carded once per variant. The variants are interleaved within each rep, so warm-up favours none.
For every card the harness keeps:

- the act line (who, move, target);
- the plan's verdict, win condition, route, warnings and "prefers" hint;
- the plan's value and its step odds;
- a hash of the whole card.

The real `tpMerge` is the baseline (`base`).

## Candidates

| id | collapse of an ending pool | other change |
|---|---|---|
| `base` | today: `tpMerge(list, 1)`, closest pair again and again, O(n³) | – |
| `exact` | the same merge in O(n²) (`tpMergeNN2` from `research/fight-plan-search-bench`) | – |
| `mode` | O(n): p-weighted mean of the continuous fields, `fs`/`mb`/`fb` of the heaviest combination | – |
| `heavy` | O(n): the same mean, `fs`/`mb`/`fb` of the heaviest single branch | – |
| `bucket` | no list at all: each branch folds into running sums and a mass per (`fs`,`mb`,`fb`) as it settles | same answer as `mode` |
| `*+prune` | as named | branches under 0.1 % of the pool's mass left out of the collapse (not out of the odds) |
| `*+roundN` | as named | memo keys HP in steps of N % of max HP instead of whole points |

## Results (`results/report.md`, raw data `results/final.json.gz`)

260 states:

- 12 fixed heals states, 3 reps each;
- 160 random mid-fight heals states, with Tangela or Combusken out and 4–6 of ours;
- 44 heals states with a Sitrus Berry on every mon, so the discrete fields really vary (15 % of pools mix them);
- 44 no-healer control states.

Timings are Node (V8): read the ratios.

**Speed** (card ms; × against `base`):

| variant | heals fixed p50 · p90 · max | heals random p50 · p90 · max | berries p90 · max | control p90 |
|---|---|---|---|---|
| `base` | 130 · 297 · 347 | 45 · 160 · 416 | 190 · 491 | 54 |
| `exact` | 2.7× · 3.4× · 3.0× | 1.3× · 2.6× · 4.1× | 2.8× · 5.0× | 1.5× |
| `mode` | 5.4× · 7.0× · 5.7× | 1.7× · 4.2× · 8.9× | 4.6× · 7.2× | 1.6× |
| `bucket` | 5.8× · 7.2× · 6.5× | 1.7× · 4.2× · 8.5× | 5.1× · 7.5× | 1.6× |
| `base+prune` | 5.9× · 7.5× · 7.2× | 1.7× · 4.2× · 5.5× | 5.1× · 9.3× | 1.7× |
| `mode+round3` | 5.6× · 7.4× · 7.6× | 1.7× · 4.2× · 5.8× | 4.9× · 9.2× | 1.4× |

**What the player would see change**, over the 204 random and berry heals states and the 44 control states. On the 12
fixed heals states, `exact`, `mode`, `heavy` and `bucket` change nothing at all; pruning or rounding change the route on
1–3 of them.

| variant | act line move/target | verdict flips | win condition | "prefers" hint | plan route | warnings | plan value drift max |
|---|---|---|---|---|---|---|---|
| `exact` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `mode` / `bucket` | 0 | 0 | 0 | 4 | 69 (37 exact-value ties) + 12 control (10 ties) | 57 + 7 control | 211 (one state) |
| `heavy` | 0 | 0 | 0 | 5 | 70 (37 ties) + 12 control | 57 + 7 control | 211 |
| `base+prune` | 0 | 0 | 0 | 5 + 1 control | 59 + 12 control | 69 + 13 control | 31; 100 control |
| `mode+round3` | 0 | 0 | 0 | 10 + 1 control | 91 + 17 control | 57 + 7 control | 211; 101 control |
| `mode+round1` | 0 | **1** | 0 | 10 | 94 + 14 control | 58 + 7 control | 211 |

## Findings

1. **`exact` is a free 2.6–3.4× at p90** with byte-identical cards. Its collapse is still a third of what is left of the
   card (2.9 of 8.4 s over all heals states).
2. **Any O(n) collapse takes the collapse off the card.** Over all heals states it falls from 11.1 s to 0.4 s, 66 % of
   the card down to 7 %. That is 4–5× at p90 and 7–9× at the max. `mode`, `heavy` and `bucket` are within noise of
   each other.
3. **Nothing an O(n) collapse changes comes from the collapse's own answer.** Its continuous fields are today's to
   float error. Every visible change goes through one of three things:
   - **Ties.** Half the route changes are plans of exactly the same value, and the beam's sort breaks the tie the
     other way.
   - **The `acts` knife edge.** Every warning change (64 of 64 under `mode`) is the win-condition warning switching
     between "keep X healthy" and "chip it with X". `acts` is `r.fh < f.hp` (`35-team-plan.js:449`), a strict `<` on an
     expected HP. 259 of 260 states have at least one `acts` check within 1e-9 of the foe's HP (`results/acts-edge.json`
     counts them), so summation order alone decides it. Today's answer there is no truer than the new one.
   - **Coin-flip exchanges.** In 4 heals states a new "prefers" hint appears or goes. The worst, random #53: Taillow
     into Tangela is 50.1 % against 50.5 %, the plan follows the other ending, and the unpinned plan's value goes from
     200 to 411. The card's own verdict and act line stay; the hint "let Growlithe fall → Skwovet in free" appears.
4. **`mode` against `heavy`:** with berries, their cards differ in 1 of 44 states. The choice barely matters on the
   card. `mode` is the one that follows a rule: the most likely combination, not one branch.
5. **Pruning and rounding buy nothing on top of an O(n) collapse.**
   - With an O(n) collapse, the card is the same speed with or without them (5.7–5.9 s over all heals states).
   - They change more: pruning moves the plan value by up to 100 in the control.
   - 1 % rounding is a *finer* key than today's whole HP points for any mon under 100 HP. At wave 25 it runs 15 % more
     exchanges and flipped one verdict.
   - `base+prune` alone matches `mode`'s speed, but changes more than `mode` does.
6. **What is left once the collapse is O(n)** (`mode`, all heals states): game calls 49 %, the rest of the plan and
   battle model 41 %, collapse 7 %, the beam's keep-4 merge 2 %. The keep-4 merge is not worth touching. The next cost
   is the game's own damage and AI calls.

## Limits

- Node, not WebKit: the ratios carry, the ms do not. The lag runs in #510 judge the fix on Orion.
- One trainer, wave 25, fillers in the movesets, IVs 31 and Hardy natures, as in #514.
- A tie or knife edge counted as "changed" is still a change the player sees once. Whether it matters is the owner's
  call.

## Re-run

Needs the pinned clone provisioned as for `npm run oracle:encounter`. In a worktree, link the main checkout's `.cache`.

```sh
COACH_REPS=3 COACH_RANDOM=120 COACH_RANDOM2=40 node docs/research/fight-plan-collapse/run.ts   # → .cache/collapse-proto/<stamp>.json
node docs/research/fight-plan-collapse/report.mjs                                              # newest results; DETAIL=mode for per-state changes
COACH_VARIANTS=base,mode node docs/research/fight-plan-collapse/run.ts -t "berries"            # a subset
```

vitest exits 1 on the clone's known i18n rejection; read the results file. `gunzip -k results/final.json.gz` to re-report
the kept run.
