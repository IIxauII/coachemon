# Coach HUD: ⚔ turn line vs ♟ fight plan — divergence and authority (#113)

Research for [#113](https://github.com/IIxauII/pokerogue-mcp/issues/113), branch `research/hud-authority`, read
against `origin/master` at `731941d` (0.20.0: after #137, #151, #173, #181). Primary source throughout is the HUD source
(`skills/coach-pokerogue/scripts/hud/`) and the pinned-game spec (`skills/coach-pokerogue/references/game-code.md`).
Paths below are relative to `skills/coach-pokerogue/scripts/hud/` unless given in full.

**What is measured here.** Counts come from **42 mocked battle states**: the golden tests' own states plus states built
to hit one bucket each. They are **scenario counts, not how often this happens on real waves**. The mocks use the HUD's own
damage approximation, not the game's `getAttackDamage`. Real-wave frequencies are in "Live measurement" below, from a run on 2026-09-18.

Harness: `research/hud-authority/` (`agreement.js`, `dump.mjs`, `live.mjs`; last offline run in `dump.out.txt`).

---

## Answer in short

- **Neither model is right across the board, and they fail in different ways.**
  - ⚔ is right about **this turn's mechanics**: which foe is really there (a predicted switch), status and setup moves,
    what a move costs its user, and who can act in doubles.
  - ♟ is right about **which mon to spend**: letting a doomed mon fall so the next one comes in free, not feeding an
    on-KO boost, and keeping the one answer to a later foe healthy.
  - Every case where ♟ was right is a `mon` verdict. Every `move`, `target` and `action` verdict went to ⚔.
- **Recommendation: ⚔ is the authority; ♟ is re-searched with step 1 pinned to ⚔'s action and prices the difference.**
  This is "⚔ seeds ♟", plus a priced alternative line, plus ♟'s value fed back into ⚔ as the terms #170 needs.
  Before that, fix two ♟ input bugs that account for 11 of the 18 disagreements: aiming at a foe that is switching
  out, and doubles steps nobody can take.
- **Cost is small.** A pinned re-search on the tables the unpinned search already built took ≤ 4 ms on a 6 v 6 mock,
  against ~250 ms for the cold ♟ search itself.
- **Confirmed live** (19 trainer decisions, 2026-09-18): they disagree on **37 %** of decisions, and every `move`,
  `target` and `action` verdict again went to ⚔. The live split is **23 % in singles against 67 % in doubles**, so
  **the doubles fix comes first** — offline counts had put the predicted-switch fix ahead of it. ♟ also turns out to
  run **only in trainer battles**, which bounds the whole problem.
- ♟ **never runs on a wild wave**, boss or not (`teamPlan` is absent), so no wild wave can show a disagreement.

---

## 1. The 8 buckets, re-checked against current code

| # | Bucket | At current code | Scenario disagreements (primary) | Who's right, on the merits |
|---|---|---|---|---|
| 1 | Different objective | **Real, shape changed.** ⚔ scores `danger − eTurnsWe − lost + (pWe − pThey) − costs − feed` (`30-planner.js:896-900`), now exact for 2 turns (`deeper`, `:905-932`, #137). ♟ scores `tpValue`: 100 per KO, a standing foe's share dealt, 25 × HP % (`35-team-plan.js:365-378`). The beam is `TP_BEAM` 24 (`:15`) and every ending is weighted by its odds (`:403-411`, #137/#71). | 2 | ♟ where the long horizon matters (`answer-on-field`: it sacrifices Golduck on Kleavor to keep Mamoswine, the only Xurkitree answer). Unclear in a lost fight (`cyrus-4v6 Blastoise vs Houndoom`). |
| 2 | Move rule for the same matchup | **Real.** ♟ `tpOurMove` takes the fewest turns, then the most expected damage (`35-team-plan.js:32-33`). It carries no self-cost, so recoil never shows in ♟'s HP. ⚔ prices `DRAWBACK_COST` 0.25 (`30-planner.js:893,1416`), `KEEP_BONUS` (`:1422`), ally hits, depth-2 follow-ups and status plays. | 1 | **⚔** (`recoil-vs-clean`: Blaze Kick over Flare Blitz for the same 2HKO; ♟'s "91 % left" leaves out the recoil). |
| 3 | Granularity | **Real, narrower.** ♟ exchanges still run until one side faints (`tpFight`, `35-team-plan.js:217-323`). ⚔ now has `then` (Fake Out then attack, setup then attack). No scenario had it as the cause. | 0 | — |
| 4 | Reserve holdback | **Real, narrower than it looks.** ♟ holds `reserve` back from every foe but the win condition (`35-team-plan.js:389-392,472-484`). ⚔ still has no reserve idea (`fieldPlan` never reads it). #173 only surfaces it in `summary()` (`90-render.js:242-246`: `saveFor`, the plan line). **New:** `sweep` sends the best answer first (`35-team-plan.js:449-461`) and a win condition needs ≥ 2 KOs (`:467`). A foe with **one clean answer** (Guzma's Xurkitree vs Mamoswine) is therefore never a win condition, and `reserve` never protects that answer. | **0.** The counterfactual (♟ re-searched without the holdback) never turned a disagreement into agreement, including states built for it. | — (the #90 §A case is really bucket 1, when ♟'s beam catches it at all) |
| 5 | Free entry vs paid switch | **Real.** ⚔ vetoes a switch-in when P(KO'd before acting) ≥ 0.25 (`30-planner.js:884-885`), keeps the field unless a switch beats it by 3 (`:1221-1222`), and has no credit for a free entry after a faint. #173 added `feedCost` (`:895`). ♟ gives a voluntary switch-in one entry hit (`35-team-plan.js:271-273`), the replacement after a faint comes in `free` (`:388`), and it labels sacrifices (`:494-499`). | 3 | Split. **♟** in `beast-boost-fodder` (let Pidgey fall, Blastoise in free; the teamplantest golden is built on exactly this). **⚔** in `battle/switchin` (♟ pays for a switch-in that falls without scratching Lycanroc; the plan's value is identical either way). **Contested** in `doomed-lead`: ⚔ stays only because it vetoes the switch; ♟ pays for Mamoswine to keep a 20 % Jolteon that can't act. Neither names the free entry. |
| 6 | Predicted enemy switch | **Real, and the most common.** ⚔ plans against `facing`, the predicted switch-in (`30-planner.js:1579`). ♟'s starting foe is whichever foe is on the field (`35-team-plan.js:438-445`). | **6** | **⚔, every time.** ♟ aims at the mon leaving: Aura Wheel into a Gyarados that is switching out. ♟'s own step 2 usually already faces the switch-in. |
| 7 | Fidelity gap | **Real, shape changed.** #173 brought drain, on-KO boosts, wave tokens and item thieves into ♟ (`35-team-plan.js:161-169,175-197`). Still missing: status and setup moves, a status the mon already has costing turns (only token status does, `:280`), and doubles, which are planned as 1 v 1 with **one** mon counted as on the field (`:438`, `:546`). | 5 (3 status/setup, 2 doubles) | **⚔** for status and setup: in `swords-dance` and `spore`, ♟ calls the fight lost where ⚔'s setup line wins it. **♟ is wrong** in doubles: its steps are actions nobody can take (below and live case #1). |
| 8 | Cache keys | **Not a decision-time source.** The ♟ key (`35-team-plan.js:425`) moves with turn and HP. At the command phase a plan built outside it is always rebuilt (`:428`), and within one turn at the same HP only slot 1's locked command changes ⚔ (by design). **Between commands** (animations) ⚔ drops to the approximation while ♟ keeps its command-phase plan. | 0 at the command phase; **8 of 42** verdicts change mid-animation | Harmless for decisions. It only matters for anything that reads the panel mid-turn (watcher lines, a user glancing during animations). |
| 9 | **New:** ⚔ stay margin | ⚔ keeps a field that isn't failing unless a switch beats it by 3, and shows the better switch as `optional` (`30-planner.js:1221-1224`). ♟ has no hysteresis. | 1 | Tie (`battle/single`: plan value −1.1 if pinned to ⚔'s choice). Render the optional switch as agreeing. |

Totals over 42 scenarios: 24 agree, 10 `mon`, 2 `target`, 4 `move`, 2 `action` (a verdict added here: the right mon,
move and target, but ♟ has it "switch in" while it is already out).

### Other findings
- **⚔ inside doubles: a "spare hit" is never moved to the other foe** (live case #1 (a)). `spareHit` only swaps a
  *drawback* move for a clean one (`30-planner.js:1094-1097,1110-1114`). Each slot's own score rewards its fastest KO
  (`:896-900`), and the joint value counts only KO chances (`:1141-1177`). So chip damage on the other foe is worth
  nothing, and both slots stay on the foe that is already falling. The game's redirect (`:1167`) sends the second hit
  on anyway, but the panel says otherwise. This is not a ⚔-vs-♟ issue: it needs its own ticket.
- **A third voice:** the foe rows' `➜ … later` picks come from `duel` (`30-planner.js:1596-1616`), not from ♟. They can
  name a different mon for a later foe than ♟'s steps do. Not measured.
- **The pinned plan's value can't be trusted where ♟ misreads the field.** In bucket 6, pinning ♟ to ⚔'s switch-in
  costs "−200, win → loss", because ♟ scores that switch-in against the foe that is leaving. Fix bucket 6 before using
  the value.

---

## 2. Live case #1 — W12 Plains, trainer double "Glenn & Adelaide"

From the user's screenshot. Foes: Budew L8 (17 %, Poison Point), Toxel L8 (100 %, Static). Ours on the field:
Bulbasaur L10 (PAR) and Charmander L8 (PSN); Squirtle on the bench.

- **⚔:** Bulbasaur Tackle → Budew and Charmander Scratch → Budew, both "1 hit · spare hit — KO without it"; ◎ focus
  Budew, "KO before it moves".
- **♟** (approximate, winnable):
  1. Bulbasaur, "switch in, takes a hit", Tackle → Budew, KO, 15 % left.
  2. Squirtle Water Gun → Toxel, falls, foe at 42 %.
  3. Charmander, free, Ember → Toxel, KO, 68 % left.

**Reconstructed** as `live1/w12-glenn-adelaide` in `dump.mjs`. Stats come from base stats at those levels; HP bars and
movesets are estimates. It reproduces the ⚔ line exactly, and it reproduces ♟'s "switch in" for a mon already on the
field. With Bulbasaur listed first the plan gives it to Charmander; with Charmander first, step 1 happens to agree.
The live plan giving it to Bulbasaur means `cur` was Charmander, so Charmander came first in the live party list;
which order that was can't be settled offline. The live read, fed to `hudAgreement`, gives verdict `action`,
bucket 7, `planBenchesInWhileFieldStands`.

The coordinator's four readings, checked:
- **(a) Both slots on Budew, "spare hit".** **Confirmed.** It is inside ⚔ (see "Other findings"), and Static plays no
  part: the planner doesn't model Static's contact paralysis, and the reconstruction, which has no Static either,
  makes the same pick.
- **(b) ♟ step 1 "switch in" for a mon on the field; Squirtle sacrificed while Charmander is out.** **Confirmed, and
  worse than "approximate".** `tpView` counts one party member on the field as `cur` (`35-team-plan.js:438,445`).
  `tpSearch` treats every other living mon, the second field mon included, as a paid `switch` (`:388`). When Squirtle
  falls, `cur` is empty, so Charmander, which never left, comes in "free". In doubles ♟'s steps are not actions.
- **(c) Scratch vs Ember.** **Rejected as a bucket-2 case.** ♟ has no Charmander → Budew step: its Charmander step is
  against Toxel, a different matchup. Into a Budew at 4 HP, Scratch and Ember both KO. Both models cap expected damage
  at the target's HP (`10-damage.js` `fromApprox`), tie, and keep the first move listed: ⚔ through `better`
  (`30-planner.js:1040`), ♟ through its strict `>` (`35-team-plan.js:33`). Same tie-break, same move.
- **(d) PAR/PSN in ⚔ but not ♟.** **Partly.**
  - Poison chip: both. ♟'s `tpHealProfile` asks `endOfTurnHp` about the mon with its status on (`35-team-plan.js:124-134`).
  - Paralysis's halved Speed: both. ♟'s speed order comes from `threatFrom`'s `actionOrder`, which uses `getEffectiveStat`.
  - Paralysis's 1-in-8 lost turn: **⚔ only** (`30-planner.js:188,677`). ♟ only counts statuses from wave tokens (`35-team-plan.js:280`).

---

## 3. Recommendation: ⚔ is the authority; ♟ is pinned to it and prices the difference

**The model.** The ⚔ line decides this turn: mon, move, target, switch or stay. The ♟ plan is re-searched with step 1
pinned to that action, so it explains the rest of the fight instead of contradicting this turn. ♟ also runs its
unpinned search. When the unpinned plan is clearly better, meaning the value gap Δ passes a first-cut threshold
(~20, a fifth of a KO) or the result flips from win to loss, ♟ shows one priced alternative:
`♟ prefers: let Pidgey fall → Blastoise in free (+12)`. It never shows a competing step list. For #170, that same Δ
becomes a term in ⚔'s score, so a stay or switch that ♟ values enters the turn decision as a cost or credit, not as
an override.

**Why not the other candidates:**
- **♟ constrains ⚔** (the plan picks the mon). This would put ♟'s errors on screen as the decision. 11 of the 18
  disagreements are ♟ misreading the field (6 predicted switches, 2 doubles, 3 status/setup lines). Pinning ⚔ to ♟'s
  mon cost 1.1–11.9 turn-score units in the ordinary cases, and hit the −99 "KO'd before it acts" option in both
  veto cases (`battle/switchin`, `doomed-lead`). (Of those 11, the 6 predicted switches and 2 doubles are ♟ misreading
  the field; the 3 status/setup lines are actions ♟ can't express.)
- **One model** (depth in `fieldPlan`, the plan derived from its tree). This is #71's direction, but `fieldPlan` costs
  a full field search per node. It is too expensive to reach the end of a 6 v 6 fight at a 1 s refresh.
- **Keep both and render the disagreement.** This is cheap but leaves the user choosing, which is the complaint.
  It survives here only as the priced alternative line.

**Trade-offs.**
- ♟'s long-horizon insight now acts only through Δ. A real trap with a small Δ gets through, and Δ carries ♟'s coarse
  value function: `doomed-lead` shows it paying to keep a 20 % mon that can't act.
- In return the screen never shows an impossible or mistargeted step, and every ♟ step 1 is the ⚔ action by
  construction.

**Prerequisites** (♟ input fixes, independent of the authority change). **Ordered by the live frequencies**, which
put doubles first — the offline counts had these the other way round:
1. Doubles: ♟ counts every field mon as out (a set of current mons, not one index). If that is too big, it stops
   rendering per-step actions in doubles and shows only the foe order and answers. This removes the `action` verdicts
   and the doubles `target` ones — **4 of the 7 live disagreements, and all 4 in the one trainer double**.
2. ♟ starts facing the predicted switch-in (`fcur` from `predictSwitches`), not the foe on the field. This removes
   bucket 6 — 6 of 18 offline, 1 of 7 live, and ⚔ was right every time in both.
3. ♟'s step for the ⚔ matchup uses ⚔'s move; later steps charge a move's self-cost to the user's HP. This removes
   bucket 2.

**How it meets #170** (blocked by #113; this shape unblocks it):
- **§A reserved answers.** Pricing "exposing a reserved answer" becomes Δ between ⚔'s option and the pinned plan
  that keeps the answer back. First extend who counts as reserved: `reserve` never covers a foe with a single clean
  answer (`sweep`, `35-team-plan.js:449-469`). #170's per-foe answer matrix is the missing input.
- **§E free entry when doomed.** ⚔'s "stay" option for a doomed mon gets ♟'s value of the stay-and-fall line, which
  brings the next mon in free, as a credit. ⚔ names that mon from pinned ♟ step 2.
- **§G trainer send-in.** Pinned ♟ step 2's foe is already the game's send-in prediction (`tpNextFoe`,
  `35-team-plan.js:357-361`). ⚔ can show `next in likely: X → answer Y` from it.
- The #170 goldens (Guzma w165 turns 1 and 3) should assert on ⚔ with ♟ pinned. Neither turn reproduced #90's line
  offline on approximate damage, so they need the game's numbers or hand tables like `plannertest.mjs`.

### Refresh-budget cost (mocks, median of 7, this machine)

| State | ♟ tables | ♟ search (cold) | Pinned re-search on warm tables | ⚔ `fieldPlan` (cold) | Whole model per mid-turn HP change |
|---|---|---|---|---|---|
| Guzma w165 6 v 6 | 2.5 ms | 252.8 ms | 3.5 ms | 1.7 ms | 13.3 ms |
| Cyrus 4 v 6 | 1.3 ms | 3.5 ms | 0.5 ms | 0.3 ms | 2.4 ms |
| Cyrus 3 v 2 | 0.2 ms | 5.9 ms | 0 ms | 0.2 ms | 0.3 ms |
| W12 double 3 v 2 | 0.2 ms | 0.8 ms | 0 ms | 0.9 ms | 1.5 ms |

- The ♟ search is the expensive part once rosters are full: odds-weighted exchanges branch on damage levels. It runs
  once per turn-and-HP key.
- A pinned re-search reuses the fight memo on the tables, so the recommendation adds about 1–2 % of the cold search:
  one pinned search per turn, or up to one per ⚔ candidate mon (≤ 6 in singles, ~20 ms on 6 v 6) if Δ feeds ⚔'s
  score for every option.
- Live, the tables dominate instead: every our × foe `moveOutcomes`/`threatFrom` is a game call. That cost is not
  measurable offline. `window.__coachHud.stats()` (`lastTickMs`, `maxTickMs`) is sampled by the live poller.

---

## Live measurement (run of 2026-09-18)

Run against the current HUD build (`origin/master` `1c7e95e`, 0.35.0) in Chrome, on a fresh classic run: Bulbasaur /
Charmander / Squirtle, plus a Skwovet caught on W2. `live.mjs sample` was called at every command phase **before**
choosing, and **the ⚔ line was followed at every disagreement**, so the run doubles as a ⚔-authority playthrough. Raw
log: `research/hud-authority/live-log.jsonl` (21 rows; `live.mjs report` reproduces the tally).

### Frequencies on real waves

| | slot-0 decisions | agree | disagree | rate |
|---|---|---|---|---|
| Singles (Youngster Neal W5, Rival Ivy W8) | 13 | 10 | 3 | **23 %** |
| Doubles (Crush Kin Kiyo & Aisha W12) | 6 | 2 | 4 | **67 %** |
| All trainer decisions | 19 | 12 | 7 | **37 %** |

Verdicts: `agree` 12, `mon` 2, `move` 2, `target` 2, `action` 1.
Primary bucket: **7** ×4, **2** ×1, **6** ×1, **9** ×1 (bucket 2 also rides along as a secondary bucket on W12 t4).

**Doubles disagree roughly three times as often as singles.** That is the single biggest change from the offline
picture, where the mocks made bucket 6 look dominant.

### ♟ exists only in trainer battles

Checked directly in the page, not inferred: on W9 (wild double) and W10 (**wild boss** double, Fletchling with 2 boss
segments) `window.__coachHud.last().teamPlan` is absent and `hudAgreement` returns no verdict at all. So the
⚔-vs-♟ disagreement is **bounded to trainer battles**; wild waves, boss or not, can never show it, and ♟ costs nothing
there. Both wild waves are in the log (verdict `n/a`) and are excluded from the table above.

### Bucket 7 (doubles fidelity) dominates, in three shapes

Every disagreement in the one trainer double was bucket 7:

- **`target` ×2** (W12 t1, t2). ⚔ coordinates both slots onto Timburr (`Bulbasaur Vine Whip→Timburr ; Squirtle Water
  Pulse→Timburr`); ♟ names **one** mon and aims it at the other foe (`Bulbasaur Vine Whip→Sawk`). ⚔ is right: the
  focused pair KO'd Timburr on t2 without either of ours being touched.
- **`move` ×1** (W12 t4, buckets `[7,2]`). Sawk at 4 HP: ⚔ Vine Whip, ♟ Tackle. Both KO, so this is the bucket-2
  tie-break again, stacked on the doubles gap.
- **`action` ×1** (W12 t5). **♟ says "⇄ switch in Squirtle" while Squirtle is already on the field.** This is live
  case #1 (b) — `tpView` counting one party member as `cur` and treating the second field mon as a paid switch —
  reproduced on a real wave rather than in a reconstruction. Confirmed.

### Bucket 6 confirmed, and ⚔'s prediction was correct

W8 t2, Rival Ivy: ⚔ `⇄Charmander Ember→Pidove` (planning against the predicted switch-in) against ♟
`Bulbasaur Vine Whip→Squirtle` (aiming at the foe on the field). Following ⚔, **the rival did switch**: Pidove came
in and Charmander faced exactly the foe ⚔ had planned for, while ♟'s move would have hit the mon that was leaving.
One occurrence, but it went ⚔'s way, as all six did offline.

### Buckets 9 and 2 in singles

- **9** (W5 t3): ⚔ keeps Bulbasaur in on Wurmple; ♟ prefers switching to Charmander for the 2× Ember. ⚔'s stay margin
  holding, as offline. Unresolved on the merits either way — the fight was won comfortably.
- **2** (W8 t5): Pidove at 1 HP, ⚔ Ember vs ♟ Scratch. Both KO; different tie-break, no consequence.

### Refresh-budget cost, live

`__coachHud.stats()` at each of the 19 samples: **median 1 ms, max 452 ms**. The 452 ms is the first sample of the
session (cold tables and first game-code calls); every later sample sat at 0–3 ms. Against the HUD's 1 s tick that is
comfortable, but note the rosters here were small — at most 3 foes — so the 253 ms cold ♟ search measured on the
6 v 6 Guzma mock was never approached live. The live table cost on a full roster is still unmeasured.

### What this changes in the recommendation

**The direction stands: ⚔ is the authority, ♟ re-searched pinned to it.** Every `move`, `target` and `action`
verdict went to ⚔ again, and the one case where ♟ had a point (bucket 9) is a `mon` verdict, exactly as offline.

What changes is **priority among the prerequisites**: the doubles fix (prerequisite 2) should land **before** the
predicted-switch fix (prerequisite 1). Offline ranking put bucket 6 first on a count of 6 vs 2; on real waves it is
4 doubles vs 1 predicted switch, and the doubles failures are the ones that put a literally impossible instruction on
screen ("switch in" a mon that is already out), which is worse for trust than a mistargeted but coherent step.

### Still not measured

- **A boss win condition.** No *trainer* boss appeared in waves 1–13; W10's boss was wild, and ♟ does not run on wild
  waves, so bucket 4 (reserve holdback) stayed unexercised — as it did offline, where it caused 0 disagreements.
  Reaching one needs a gym leader or a deeper run.
- **Full rosters.** Largest live enemy roster was 3 (Kiyo & Aisha). The 6 v 6 costs and the `sweep` / win-condition
  paths need a late-game run.
- **The Δ threshold** for the priced alternative line, which no amount of verdict counting settles.

---

## Still open after the live run

(Real-wave frequencies and the live tick cost were the two big ones; both are answered in "Live measurement" above.
Bucket 6 does **not** dominate on real trainers — bucket 7 does.)

- **Game damage.** The mocks use the approximation. Guzma turn 1 and turn 3 don't reproduce #90's HUD lines, so those
  goldens need the game's numbers.
- **Who is right in `doomed-lead` and `cyrus-4v6 Blastoise vs Houndoom`.** It depends on numbers the mocks can't give.
- **The Δ threshold** for the priced alternative (~20 is a first cut), and whether ♟'s value function (100 / KO,
  25 × HP %) is good enough to feed ⚔'s score.
- **Live table cost** of ♟ on a **full 6 v 6 roster**. Measured live only up to 3 foes, where it is 0–3 ms.
- **W12:** the live party order, and whether Static on contact should count against Tackle and Scratch into Toxel.
  No model has it.

## Reproduce

```sh
node research/hud-authority/dump.mjs                  # the table above; --json for the raw rows; --only <regex>
node skills/coach-pokerogue/scripts/test/run.mjs      # goldens unchanged: the harness only rewrites the bundle in memory
node research/hud-authority/live.mjs report           # the live tally, from live-log.jsonl
```
