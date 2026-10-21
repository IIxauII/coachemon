# Pricing a status play in a double, Protect included (#862)

Desk research and prototype for #862, split from #850. Repo refs are to `origin/master` at `e568523f`
(`skills/coachemon/scripts/hud/30-planner.js` unless named). Everything measured comes from the files next to this one:

- `862-double-status-price/prototype.patch`: #850's prototype plus this ticket's switches, all off by default. With
  every switch off, every golden is byte-identical to master. `git apply` it from the repo root first.
- `862-double-status-price/double-score.mjs`: #850's double (our lead with Ice Beam and Protect, Spore or Thunder Wave,
  beside Ally; Salamence locked into Outrage at the lead, beside Snorlax), run through the planner's own `fieldPlan`.
  `--credit` sets the field's price of the lead's play beside its own-duel price, and `--terms` prints each plan's slots.
- `862-double-status-price/sweep.mjs`: the same turn perturbed 144 ways, under the two designs §3 weighs.
- `862-double-status-price/scene-trace.mjs`: a golden test run with the plan trace on, printing a scene's plans.
- `862-double-status-price/blast.mjs`: #850's harness, every HUD golden under a set of switches.
- `862-double-status-price/results.md`: the output, from `results.sh`.

## Short answer

**A double's status play should be priced like a single's: on the playing slot's own duel. Two terms the double
lacks have to come with it, and neither is a singles price.**

1. **The field hypothesis over-credits every play, by up to 5.8 turns** (§1). It scores the playing slot as its attack
   on the state the play makes, a turn later. On that state the foe's cancelled hit lengthens our clock, and our attack
   still lands on the play's turn. The fix is the singles scorer, `playOption`, for the playing slot. The partner stays
   on the **hypothesis**, which is what #262 built it for.
2. **#236's redirect charges a plan whose knockout comes first 3.72 turns** (§2), the partner's clock against the
   foe that survives. A play whose follow-up fells the target next turn never pays it. The fix is the same redirect,
   read off the play's follow-up.
3. **A double does not take #860's singles prices** (§3). They put Protect where it belongs with a turn to spare, but
   they flip three doubles calls by multiplying a race the redirect branch prices against a fallen foe. Instead the
   double credits the hit a play cancels this turn at its **`danger`**, the joint value's own price for a foe's hit.
4. **With those three, Protect is a priced play in a double**: picked in 1, 3, 8 and 9, not in 2, 4–7, 3p or with no
   lock (§4). `supportFor`'s Protect stays for the case the priced play cannot see (§4).

**Judgement call for the owner:** #262's Spore scene and #647's "bare foe" copy of it flip from Spore to Seed Bomb by
0.17 turns (§5). Both lines lose that turn. The old pick rested on 0.92 turns of the over-credit.

## 1. The over-credit in the field hypothesis

`statusField` (`:1371`) prices a double's play as one exchange of the field. The playing slot is worth its best attack
on the hypothesis (`:1394`), plus the candidate's own −1 − `STATUS_COST` (`playCandidate`, `:1228`). The partner is
scored on the same hypothesis.

Against the slot's own duel (`playOption`, `:1172`, the singles price #850 validated), with today's prices
(`results.md` §1, Protect offered):

| Play | Over-credit, range | Largest at | Of it, from `lasts` |
| --- | --- | --- | --- |
| Protect | 0.90 – 5.76 | 3 · Outrage KOs us | all of it in 1–6; 1.26 – 1.95 of 1.81 – 5.22 in 7–9 |
| Spore (sleep) | 1.14 – 3.10 | 4 · we 1HKO it first | 1.14 – 3.04 |
| Thunder Wave (paralysis) | 0.23 – 4.00 | 10 · no lock, we lose the race | 0 – 0.24 |

There are two sources, and they split by move.

- **`lasts` re-read on the hypothesis.** `lasts` (`:1069`) reads `actOn(hyp, f)`, so the attempt the play cancels
  lengthens our clock for every option on that state. Case 4 is Protect with our Ice Beam a sure first-strike 1HKO.
  `lasts` goes 4.25 → 6.76 and Ice Beam 3.88 → 6.38, though Outrage would never have landed. This is #850 §1's
  rejected `stall` again: an attack's `lasts` never credits the hit its knockout prevents, so only the play gains.
  Protect and sleep cancel a whole attempt, so this is most of their over-credit.
- **The race, with our turn-1 hit still in it.** On the hypothesis our attack lands on the play's own turn. The flat
  −1.2 charges the turn as time, not as the race it hands the foe. Paralysis cancels little (`skip0` 1/8), so this is
  nearly all of its gap. In case 10 the field prices Thunder Wave at −3.51, its own duel at −7.51.

**The partner's part is not measured here.** It is re-scored on the same hypothesis, so a partner that fells the foe
first gains `lasts` the same way. In this scene the partner never fells it first (Ally +1.2 under Spore in cases 1
and 7).

## 2. The redirect charge on a plan whose knockout comes first

Cases 4 and 5: our lead 1HKOs a 100 HP Salamence, and Ally's Thunderbolt is aimed there too (`results.md` §3,
config `own`):

| Plan | Lead | Ally | Joint | Plan |
| --- | --- | --- | --- | --- |
| Ice Beam + Thunderbolt | 3.88 | 0.63 × 0.69 + 0.38 × 6.59 = 2.90 | 1.83 | 8.61 |
| Protect + Thunderbolt | 2.61 | 6.59 | 0 | 9.20 |

`redirectOdds` (`:1430`) gives the attack plan 0.63, the chance Ice Beam fells Salamence before Ally moves. Ally's hit
is then worth its `redirScore`, its whole duel against Snorlax. That costs 0.63 × (6.59 − 0.69) = **3.72 turns**, more
than the 1.83 the joint credits for the knockout.

**It is a clock charge, not a fallen foe's hits.** Ally's `lasts` is 7.59 against both foes. Only its own clock
changes: 2.00 turns to fell Salamence, 7.90 to fell Snorlax. Every plan has to fell Snorlax eventually, but only the
plan that fells Salamence *now* charges Ally for it. `redirectOdds` returns 0 when either slot plays (`:1431`), and
`addStatus` sets `redir: 0` for every slot (`:1416`). So a play whose follow-up fells Salamence next turn dodges the
charge, and so do sleep and paralysis.

**Proposal: read the redirect off the play's follow-up too** (switch `redir: "then"`). When the play's own-duel
follow-up aims at the partner's target, the partner takes the redirect at the follow-up's odds. The Protect plan's
Ally drops 6.59 → 2.90, and in cases 4 and 5 the attack plan wins by 2.5 and 2.0. The odds are read off this turn
(Ice Beam's 0.63 against a whole Salamence), so the charge is conservative. Next turn the partner's chip leaves less to
fell.

**Tried and rejected: the redirect branch scored without the fallen foe** (`surv`). #850 §5 saw Lucario pay P they
0.93 to a fallen Hydreigon in #283's scene. Scoring the branch on the survivor alone breaks #236's spread scene,
all five near-sure thresholds on #283's certainty axis, and "slot 1 is planned around Garchomp's Thunder Punch". The
spread plan's race prices the fallen foe as well, so dropping it from one side tilts the comparison.

## 3. The singles prices in a double

#860 prices our mon lost at `MON_LOST` (4 turns) and the HP a duel costs at 1 turn a bar, in singles. In a double,
with §1 and §2 in place:

| Design | Protect off target | Margin, cases 1 / 8 | Doubles calls flipped |
| --- | --- | --- | --- |
| today's doubles prices | 1, 8 | −0.44 / −0.38 | — |
| #860's prices in the double too | none | +1.09 / +0.93 | #283 at 0.55 and 0.5, #650's "the KO it may land", `battletest` W89 |
| the hit a play cancels, at its `danger` | none | +0.12 / +0.09 | — |

**The singles prices flip three calls by multiplying a phantom.** In #283's scene at 0.5, the focus plan's Lucario
carries Aura Sphere onto Snorlax in the redirect branch. That branch's race is priced against Hydreigon's hits, and
Hydreigon has fallen in that branch. At `MON_LOST` 4 the branch's `redirScore` drops 0.96 → −1.41. Close Combat into
Snorlax drops only 2.96 → 2.67, because it wins its race. Today the focus plan wins by 0.24; priced, the spread wins
by 0.65 (`results.md` §6). §2 showed that removing the phantom from that branch alone breaks #236. So the price
doesn't fix the double, it amplifies an inconsistency already in it.

**The double's own price for a cancelled hit.** The joint value already charges a foe's hit this turn: `danger`
(`:1445`) is its share of our bar, plus 0.5 per likely knockout. The joint credits it only to felling the foe before
it acts (`pBefore × d`, `:1508`). A play that cancels the hit without felling the foe gets nothing. Proposal (switch
`dcredit`): credit the play with the share of this turn's attempt it cancels, times that `danger`.

- Protect: `pF × works × skip0` against the protected mon alone.
- Sleep and paralysis: `1 − act(0)` against the field.

It is a turn's price, so a play that lands after the foe has moved (Spore from the slower slot) earns nothing.

**The thin margin is the cost.** Cases 1 and 8 clear by about a tenth of a turn, the margin #850 §2 called too coarse
to rest on in singles. On 144 perturbed turns (`sweep.mjs`) the two designs agree on 138. In all six that differ, the
singles prices protect and the credit attacks. Three are near-ties under the singles prices (+0.01 to +0.08). The
other three are 4HKO races the credit misses by 0.05 to 0.12 (`results.md` §5). So the credit is the
more conservative design, not a noisier one. I recommend it: it moves no doubles call, and it is priced in the
double's own currency.

## 4. Protect in a double

Protect in the double, per design (`results.md` §2):

| Design | Off the target |
| --- | --- |
| today: #262's field hypothesis | 2, 4, 5, 7 |
| #850's own duel | 1, 4, 5, 8 |
| own duel for every play, with the field threat (`own`) | 1, 4, 5, 8 |
| + the follow-up's redirect | 1, 8 |
| + #860's singles prices in the double | none |
| **+ the `danger` credit instead (proposed)** | **none** |

Under the proposal, the lead's margin for Protect over attacking is:

| Case | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Protect − attack | +0.12 | −0.48 | +6.30 | −2.54 | −1.98 | −1.05 | −0.54 | +0.09 | +2.02 |

The card's line: `⚔ Lead Normal Protect blocks Outrage's last use · then Ice Beam`, with the partner's line unchanged.

**The own duel needs the field threat.** `playStart`'s exchange (`:1154`) and `playOption`'s `follow` pass no
`field`. In a double a play's duel against a harmless foe then ignores the foe that threatens the slot, which `trade`
(`:1075`) has priced since #320. Without it, #262's Breloom Spores Munchlax, the harmless foe Salamence fells this turn
(switch `pfield`).

**How `supportFor`'s Protect fits.** `supportFor` (`:1690`) is a rule on the chosen plan: Protect a slot likely felled
before it moves when its partner likely fells that foe first. That is a joint fact the slot's own duel cannot see, and
it needs no lock. The priced play covers the other case, a locked use queued at the slot, where the hit is known and
the lock ends. They overlap only when both hold. There the priced play already picks Protect, because its own duel
reads the lost race, like case 3. So:

- `supportFor` skips a slot whose pick is already a Protect, keeping the play's note;
- the priced Protect's slot gets `slotThreat`'s `guarded` (`:1606`), as #650 did for `supportFor`'s.

Folding `supportFor` into the priced play would need Protect offered without a lock, weighted by the odds that the foe
aims at this slot. That is a separate question.

## 5. Blast radius

`blast.mjs --soft` over all 36 HUD golden tests:

| Switches | Assertions that flip | Other golden lines |
| --- | --- | --- |
| all off | none | none |
| #860's prices alone (`hp`, `loss`) | #90 "stay without the boost" (settled) | #647's Lum scores; Guzma w165's optional switch reads "no safe switch" (already in #869) |
| **proposed** (`dplay`, `pfield`, `redir`, `dcredit`, Protect in doubles) | #262 "Spore is the double's turn line", #647 "a bare foe is still the double's Spore target" | that scene's fight-plan lines |
| proposed, Protect not offered | the same two | the same |
| #860's singles prices in the double too | + #283 at 0.55 and 0.5, #650 "the KO it may land beats a chip it may not", `battletest` W89 Heat Wave → focus | |

**The flip: #262's Spore scene.** Machamp outspeeds both of ours and 1HKOs whichever it hits, and Breloom needs five
Seed Bombs. One of ours falls this turn before acting, whatever we pick, and a Spore that lands after that cannot save
the other. Both lines lose. Proposed, Spore → Machamp scores −5.84 against Seed Bomb's −5.67. The old pick rested on 0.92 turns of the over-credit (field −7.28 against own duel −8.20) (`results.md` §6).

#320's scene is the same field with Breloom faster than Machamp. There Spore lands first: it is picked under the
proposal, Machamp's danger is credited, and Spore → Machamp now beats Spore → Munchlax by 0.70, where today the two tie.
The test's own point, that the partner is scored on the sleep, still passes.

**Recommendation:** accept the flip, and move both assertions onto #320's speeds, where Spore is right.

## 6. Sleep and paralysis

The lead with Spore or Thunder Wave instead of Protect (`results.md` §4):

| Play | Picked today | Picked, proposed |
| --- | --- | --- |
| Spore | every case but 11, including 4, 5 and 9, where Ice Beam 1HKOs | 1, 2, 7, 8: the close races |
| Thunder Wave | 4 and 5, where Ice Beam 1HKOs | none |

Today a double sleeps or paralyses a foe our lead fells this turn. Proposed, it does neither.

**Spore's proposed picks are thin**: +0.32, +0.12, +0.05 and +0.08 over attacking in 1, 2, 7 and 8. Each rests on the
partner's gain from the sleep (Ally +0.6 to +1.2), the part §1 leaves unmeasured. The lead's own duel puts Spore below
Ice Beam in all four, `danger` credit included (only case 2's faster lead earns any, 0.56). So the build should test that no play lands on a
foe the lead fells this turn, not that Spore is picked in 1, 2, 7 and 8.

## 7. Recommendation

**Build it in two tickets, children of #862.**

1. **A double's status play priced on its slot's own duel.** `dplay`, `pfield`, `redir`, `dcredit`. Unblocked. It
   flips #262's Spore scene (owner's call, §5).
2. **Protect as a priced status play in a double.** Blocked by 1 and by #861, whose `statusPlay` branch it extends.

The doubles per-slot scores keep today's prices (decided here, §3; #860's acceptance criteria already hold a double
unchanged).

### Acceptance criteria

**1. A double's status play priced on its slot's own duel**

- In a double, the slot that plays a status move is scored by `playOption` on its own duel. It is no longer scored as
  its best attack on the play's hypothesis less a turn. The partner is still scored on the hypothesis (#262).
- `playOption`'s exchanges price the race by the field threat in a double (`field: worst`, as `trade` does since #320).
  Singles is unchanged.
- A play whose own-duel follow-up aims at the partner's target gives the partner #236's redirect, at the follow-up's
  odds, in both the field path and the own-duel path. The odds are kept apart from this turn's `redir`, so the card's
  "spare hit — goes to …" note shows only a redirect that can happen this turn.
- The play is credited with the share of this turn's attempt it cancels at that foe's `danger`: `1 − act(0)` against
  the field for a status, and against the protected mon alone for a Protect.
- The double's per-slot prices are unchanged: no `MON_LOST` or HP price from #860 in a double.
- Golden diffs are limited to #262's Spore scene and #647's "a bare foe is still the double's Spore target", which
  pick Seed Bomb. Per the owner's decision, move both assertions onto #320's speeds (Breloom faster than Machamp),
  where Spore → Machamp is picked. Every other golden is identical.
- New plannertest scenes: #850's double with Spore and with Thunder Wave. Neither is picked where the lead 1HKOs
  Salamence (cases 4, 5 and 9), and Thunder Wave is picked in none of #850's cases. Spore's picks in the close races
  are not asserted (§6).
- The code comments cite (#862) and state contracts only (`docs/agents/comments.md`). The prototype's switches,
  traces and rationale comments are not copied.

**2. Protect as a priced status play in a double**

- `statusPlay`'s Protect play (#861) is offered in a double only on a foe's locked use queued at this slot. It is not
  offered after a successful Protect, Quick Guard or Wide Guard (`protectedLast`), or against a move that ignores
  Protect.
- Its cancelled hit applies to the protected slot only, never field-wide. It cancels no foe attempt on the
  hypothesis the partner is scored on.
- Plannertest scenes for #850's double (`double-score.mjs` has them as stubs): Protect is picked in 1, 3, 8 and 9.
  Attack is picked in 2, 4, 5, 6 and 7, in 3 after a Protect that held, and with no lock running.
- The Protect slot carries no threat tag for the hit it blocks (`slotThreat`'s `guarded`).
- `supportFor` skips a slot whose pick is already a Protect, and its own Protect is otherwise unchanged.
- Every other golden is identical.

Out of scope by owner decision (#749 → #850): a rule-based Protect gated on the lock's last use.

## Known limits

- **The turns are stubs**, as in #850: single-hit damage tables, no boss bars, items, weather or field effects.
- **Two scenes.** #850's lock double was perturbed 144 ways; #262's and #283's goldens were traced. No live corpus was
  replayed.
- **The margins in cases 1 and 8 are about a tenth of a turn** (§3).
- **The follow-up redirect reads this turn's odds** (§2). It ignores the chip the partner lands first.
- **The partner's part of the hypothesis keeps its `lasts` re-read** (§1). It is not measured here, and Spore's
  proposed picks rest on it (§6).
- **Protect's edge cases are #861's**: Unseen Fist, Spiky Shield's chip, Protect breaking a lock early. In a double,
  Wide Guard and Quick Guard as plays are not covered.
