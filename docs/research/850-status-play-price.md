# Pricing a status play's turn against what it buys (#850)

Desk research and prototype for #850, split from #749. Repo refs are to `origin/master` at `99dc938`
(`skills/coachemon/scripts/hud/30-planner.js` unless named). Everything measured comes from the files next to this one:

- `850-status-play-price/prototype.patch`: the planner changes, each behind a `P850` switch, all off by default.
  Applied with every switch off, every golden is byte-identical to master. `git apply` it from the repo root first.
- `850-status-play-price/turn-score.mjs`: #749's stubbed turns (Salamence locked into Outrage, our lead with Ice Beam
  and Protect), plus three with no lock, run through the planner's own `fieldPlan`. Nothing is re-derived by hand:
  Protect is scored by `playOption` like any other status play. `results.md` is its output, from
  `turn-score.mjs today stall left hp loss4 hp+loss2 hp+loss4 "hp+loss4, STATUS_COST 0"`, then `--terms today hp+loss4`,
  then `--double today "own duel" '{"protect":true,"dprotect":"own","hp":1,"loss":4,"scope":"all"}'`.
- `850-status-play-price/blast.mjs`: every HUD golden test under a set of switches. `--soft` logs failed assertions
  and runs on, so one flip doesn't hide the rest.

## Short answer

**The stall turn is charged right. What the turn buys is priced wrong, in two places, and fixing them is a singles
change with one judgement call.**

1. **Our mon lost costs 1 turn today.** `pWe − pThey` is a bare probability added to turns, which makes losing a duel
   2 turns worse than winning it. Price our mon lost at **4 turns** (the `ALLY_KO_COST` a double already charges for a
   partner we knock out) and the score picks Protect exactly where #749's cases said it should.
2. **HP is not priced at all**, for an attack or a play. Charge the HP a duel costs the mon fighting it at **1 turn a
   whole bar**, the rate `cost` already charges for recoil.
3. **Doubles stay as they are.** Their joint value already prices our HP and our losses through `danger`. Protect
   needs a separate design there: both ways of pricing it that I tried pick it where it is wrong (§6).

**Judgement call for the owner:** any loss price above ~1.04 turns flips one existing call, #90's "stay without the
boost" (§5). Mamoswine stays into a 51/49 duel today. Priced, the coach switches to the Crobat that resists Lunge.

Two of #749's numbers were measured before #650 landed. Since then, the planner already prefers Protect in case 9
and by much more in case 3 (§4).

## 1. Where the charge comes from

`one()` (`:1081`) and `playOption` (`:1171`) on the same duel, with Protect offered (`today` in `results.md`):

| Term | `one()` (attack) | `playOption` (play, then the best attack) |
| --- | --- | --- |
| margin base | `lasts` | `lasts` (same number) |
| our clock | `eTurnsWe` | `1 + mix("eTurnsWe")` (`:1213`) |
| fell before landing | `pNeverUsed × FOE_BAR` | `(they + standing × pNeverUsed₂) × FOE_BAR` |
| race | `pWe − pThey` | `standing × (pWe₂ − pThey₂) − they` (`:1214`) |
| extra | | `− STATUS_COST` (0.2) |

Case 1 (foe faster, Outrage 150, own pick 60, we 3HKO): Ice Beam 1.18, Protect 0.74. `lasts` is 4.25 for both. The
clocks are 3.31 and 4.31. The race goes from 0.62 / 0.38 to 1.00 / 0.00, so it is worth +0.77. Protect pays 1 + 0.2
for it and ends at −0.43.

So **the charge is exactly one turn plus `STATUS_COST`, not a turn plus the race lost.** The race is credited at par.
The turn is right as time: the knockout does come a turn later. What is wrong is what the score is willing to pay for:

- the race is priced as a bare probability, with our mon lost at 1 turn (§2);
- the 100 HP Protect keeps (126 vs 33) is worth nothing (§3).

**Tried and rejected: reading the play's margin off the state it leaves** (`stall`: `1 + lasts` from after the
blocked hit). It makes Protect beat a first-strike 1HKO (case 4, +1.25; `stall` in `results.md`). The attack's
`lasts` is the same for every option of the mon, so it never credits the hit an attack prevents by knocking out first.
Only the play would have been credited. #262's doubles hypothesis has the same flaw (§6).

**`STATUS_COST` is not load-bearing.** At 0 nothing flips beyond the one call §5 names. It was added as "a status move
gives up a sure hit for a modelled effect: it has to win by this much (first cut)" (`c2a5204`), a model-risk margin
like `DEPTH_GAIN` (0.1). It is still needed in that role, as 0.2 turns, and should say so.

## 2. The win chance in turns

`edge = pWe − pThey` adds a probability to turns. Read as turns, it prices a knockout of the foe at 1 (the bare-fact
part of the removal price) and **our mon lost at 1**. With `standing` near 0, losing the duel is 2 turns worse than
winning it.

CONTEXT.md's **Turn score** says a mon of ours lost is worth the turns its absence costs. The planner already puts a
number on that in doubles: `ALLY_KO_COST` (4, `:1787`), what a partner knocked out by our spread move costs on top of
its own score. `FOE_BAR` (4) is the matching price for a foe's whole bar left to the rest of the team.

**Proposal:** `edge = pWe − MON_LOST × pThey`, with `MON_LOST` = 4 turns of ours, the same constant as
`ALLY_KO_COST`. It applies wherever singles prices a race: `one()`, `deeper`, `playOption` and its `follow`.

Does the score charge an attack that loses the duel for losing our mon? Today it charges 1 turn plus `feed`, and
`pNeverUsed × FOE_BAR` when the attacker never lands. The fight plan's `planCost` sees the loss across the fight, but
it is capped and pinned to the attack (§3).

| Loss price (turns) | Picks Protect in | Margin, case 1 / case 8 |
| --- | --- | --- |
| 1 (today) | 3, 9 | −0.43 / −0.38 |
| 2 (with HP) | 1, 3, 8, 9 | +0.32 / +0.11 |
| 4 (with HP) | 1, 3, 8, 9 | +1.09 / +0.93 |
| 4 (alone) | 1, 3, 8, 9 | +0.72 / +0.84 |

The smallest loss price that reaches case 8 is ~1.7. At 2 the margin is a tenth of a turn on a coarse model. At 4 it
is about a turn, and the number already exists in the planner.

## 3. HP kept

**The turn score prices no HP for any option**, not only for status plays. Case 5: attacking leaves 112 HP, Protect
213, and both win for sure. Case 4: attacking leaves 250. Both score 3.88. `lasts − eTurnsWe` is a race margin
(`lasts` is per mon, the same for all its options). An attack that keeps more HP only shows it through a shorter clock.

The planner already prices our HP in turns in two places:

- `cost` charges what a move spends of our HP at 1 turn per whole bar (`:981`).
- A double's `danger` (`:1444`) charges a foe's hit at its share of our bar, plus 0.5 per likely knockout, through the
  joint value.

**Proposal:** in singles, charge **the HP a duel costs the mon fighting it, at 1 turn a whole bar**, measured from its
HP before any entry hit and excluding what `cost` already charged. A mon's options all start from the same HP, so this
ranks them exactly as crediting the HP each keeps would. Charging the cost rather than crediting the kept HP is what
makes it fair to a switch: the mon leaving takes its HP to the bench, and a credit would count only the switch-in's.

Alone, it picks Protect in 3 and 9 only, but it is what makes a heal or a Protect count the HP it saves (case 5: −1.26
→ −0.86; still attack, as it should be).

**The fight plan needs no change for this.** It does value HP carried (25 points a bar against 100 a foe KO,
`35-team-plan.js:415`). But it sees a status play only as its follow-up: `pinned` skips a pin with no damage
(`35-team-plan.js:565`). So Protect and Ice Beam pin the same Ice Beam and get the same `planVal`. The plan is neutral
between them, not wrong. Read in the code, not measured.

## 4. The dead-attacker clock (case 9)

`eTurnsWe` is our knockout clock from our hits alone, as if our mon lived to land them all. For a race margin that is
the right number. It reads how far short we fall, and the other side is `lasts`.

**What #749 called the blind spot is charged since #650** (`b676cb2`, merged after #749's base `c151b0e`). The share
of the time our mon falls before landing a hit pays `FOE_BAR` (4 turns, `:1080`). #749's harness left that term out.
In the real planner today, with Protect offered:

| Case | #749 measured | Planner today |
| --- | --- | --- |
| 3 · Outrage KOs | +0.80 | **+4.80** |
| 9 · we slower, both its hits KO | −0.82 | **+0.52** |

Cases 1, 2 and 4–8 match #749 to the hundredth.

**Tried and rejected: the foe's bar left when we fall** (`left`), charging `FOE_BAR` × the foe's HP share still
standing whenever we fall, not only when we never land. It flips four existing calls, among them #650's own "a setup
that never lands a hit is not the call" and #283's certainty axis in a double. The race margin already reads a near
miss.

## 5. Blast radius

`blast.mjs --soft` over all 36 HUD golden tests, the planner and fight-plan goldens included (`plannertest`,
`teamplantest`, `bossplantest`, `battletest`, `cardtest`):

| Switches | Assertions that flip | Golden lines that change |
| --- | --- | --- |
| HP alone | #90 "stay without the boost" | #647's Lum table prints scores (picks unchanged) |
| loss 4 alone | #90 | the same |
| HP + loss 2 / 4, Protect offered | #90 | the same |
| any of these with HP and loss in doubles too | + #283's certainty axis at 0.55 and 0.5, #650's "the KO it may land beats a chip", `battletest` W89 Heat Wave → focus | |
| `left` | + #650's setup, + #170 "with nothing to save it for, Mamoswine attacks", + #283 ×2 | |

`teamplantest` and `damagetest` each failed once on their timing assertion under load. Both pass on a rerun, and
neither touches scoring.

**The #74 status-play scenarios all hold**: Swords Dance, Spore, Slack Off, Stealth Rock, Soak, the dead-end Spore,
and the "not when the hit already 2HKOs / into a sleeping foe / into a Tera foe / with no bench" negatives. So do the
#647 Lum picks and both fight-plan goldens.

**The flip: #90's close call** (`plannertest.mjs`, "A close call it tips"). Mamoswine in a speed tie needs three
Earthquakes to Buzzwole's two Lunges, and Crobat resists Lunge but chips slowly. Today staying scores +0.02, its duel
51 / 49, so the stay is not `failing` (`:1572`) and the switch is only optional. Priced, the stay scores below 0, so
the coach switches to Crobat (`now: ⇄ Mamoswine out › Crobat in · takes ~6% · resists Lunge`). The test was tuned to
sit 0.02 above the line: **any** loss price above ~1.04 turns flips it, and so does the HP price alone (the duel costs
Mamoswine its 150 HP).

Does it read right? I think so: staying loses Mamoswine about half the time for nothing Crobat can't do safely. But it
moves where a coin-flip stay counts as failing in every single battle, which no golden but this one measures. That is
the owner's call.

**Why doubles are left out.** Applied to doubles too, the HP and loss prices flip three more calls. The cause is
double counting, not better play. A double's joint value already charges a foe's hit at its share of our bar plus 0.5
per likely knockout (`danger`). And #236's redirect branch prices the partner's race against a foe the branch has
already removed (in #283's scene Lucario pays P they 0.93 to a fallen Hydreigon). Raising the loss price doubles that
phantom charge. So the build gates both terms to `slots === 1`.

## 6. Protect as a priced play

Prototype: `statusPlay` returns `{ kind: "protect", self: true, skip0: 1 }` for a move with `ProtectAttr`, unless the
last move succeeded and was a Protect (the game's streak, `ProtectAttr.getCondition`, `move.ts:6812-6833` at
1.12.1.3). `playOption` already prices `skip0`: Protect's +4 priority makes `pF` 1, so this turn's hit is cancelled,
and the follow-up exchange starts one use later in the lock.

**Singles, at HP + loss 4** (`results.md`):

| Case | Protect − attack | Card |
| --- | --- | --- |
| 1 · foe faster, Outrage 150, we 3HKO | +1.09 | Protect |
| 3 · Outrage KOs | +8.30 | Protect |
| 8 · foe faster, Outrage 130, we 4HKO | +0.93 | Protect |
| 9 · we slower, both its hits KO | +1.52 | Protect |
| 2 · as 1, foe slower | −0.39 | Ice Beam |
| 4 · we faster and 1HKO | −1.26 | Ice Beam |
| 5 · we slower, 1HKO, Outrage 150 | −0.86 | Ice Beam |
| 6 · Outrage resisted | −1.24 | Ice Beam |
| 7 · own pick as strong | −0.91 | Ice Beam |
| 3p · as 3, Protect held last turn | not offered | Ice Beam |
| 10–12 · no lock | −1.20 each | Ice Beam |

With no lock, Protect only puts the same duel off a turn, so it scores exactly one turn plus `STATUS_COST` below
attacking. Priced, it is never a general-purpose stall.

The card the prototype draws: `⚔ Lead ⚠ Dragon 100% Normal Protect blocks Outrage's last use · then Ice Beam`. The
slot is still tagged for the hit it blocks. #650 already guards `supportFor`'s Protect (`slotThreat(…, guarded)`), and
the play needs the same.

**Doubles: not yet.** `supportFor`'s one Protect case (the partner knocks that foe out first) never applies to these
turns, so the card attacks into case 3's sure knockout. Offering Protect as a play was measured both ways:

- **Through #262's field hypothesis** (`playCandidate` → `statusField`): picked in every lock case but 6, so wrongly in
  2, 4, 5 and 7. The hypothesis cancels the foe's attempt for the whole field and re-scores the slot's attack on that state. In case 4 the
  lead's Ice Beam goes from 3.88 to 6.38, because `lasts` loses Outrage's hit and the turn-1 Ice Beam still lands. The
  −1 turn doesn't offset it. This is the `stall` flaw from §1, and it already applies to sleep and paralysis in a
  double.
- **On the slot's own duel** (`dprotect: "own"`: `playOption`, joined to the field as a pick that lands no hit): picked
  in 3, 4, 5 and 9 at today's prices, and in 1, 3, 4, 5, 8 and 9 with HP and loss priced in doubles too. So 4 and 5 are
  wrong either way. There, #236's redirect charges the attack plan about 3 turns: once the lead's Ice Beam fells
  Salamence first, the partner's Thunderbolt is scored as a whole race against Snorlax (−3.28 against +2.62), and a
  plan that puts the knockout off a turn dodges that charge.

Both failures come from existing doubles machinery, not from Protect. They are the follow-up's to fix.

## 7. Recommendation

**Build the singles change in two tickets; open a research ticket for doubles.**

1. **Turn score: price our mon lost and the HP a duel costs, in singles.** Unblocked. Flips #90 (owner's call, above).
2. **Protect as a priced status play in singles.** Blocked by 1: without it, Protect is picked in 3 and 9 only.
3. **Research: a status play in a double**, the over-credit in #262's field hypothesis and the redirect charge (§6),
   ending with Protect in a double as a priced play. Until then, a double does not offer Protect as a play.

### Acceptance criteria

**1. Turn score: our mon lost and the HP a duel costs (singles)**

- In a single battle, every scorer that prices a race (`one()`, `deeper` and its follow-up value, `playOption` and its
  `follow`) charges P(they KO first) at `MON_LOST` turns. `MON_LOST` is one constant shared with `ALLY_KO_COST` (4),
  not a second 4. P(we KO first) stays at 1.
- The same scorers charge the HP the duel costs the mon fighting it at 1 turn a whole bar. It is measured from the mon's
  HP before any entry hit, against the foe's hits net of our drain, and does not count again what `cost` already
  charges (recoil, a play's `hpCost`).
- A double is unchanged: the per-slot scores and `both()` keep today's terms, and every doubles golden is identical.
- Golden diffs are limited to #90's "A close call it tips" (it now switches to Crobat; rewrite that assertion per the
  owner's decision) and the scores printed in #647's Lum table. Every pick there is unchanged.
- CONTEXT.md's **Turn score** entry states the two prices with their units. "Mon lost" gets a glossary line or a
  `/domain-modeling` note.
- The code comments cite (#850) and state contracts only (`docs/agents/comments.md`). The prototype's rationale
  comments and its dead `unlanded` are not copied.

**2. Protect as a priced status play (singles)**

- `statusPlay` returns a play for a move with `ProtectAttr` in a single battle: self, no patches, this turn's hit
  cancelled (`skip0` 1), shown as `Protect · blocks <move>'s last use` on a lock's last use and `Protect · blocks
  <move>` otherwise. Wording is the owner's to settle; #749 §5 proposed `— <foe> still ends confused`.
- It is not offered after a successful Protect, Quick Guard or Wide Guard last turn (the game's streak,
  `ProtectAttr.getCondition`). It is not offered where the foe's move this turn ignores Protect (`IGNORE_PROTECT`, or
  contact from an Unseen Fist user). It is not offered in a double (ticket 3).
- Plannertest scenes for #749's cases: Protect picked in 1, 3, 8 and 9. Attack in 2, 4, 5, 6 and 7, in 3 after a
  Protect that held, and with no lock running (10–12).
- The Protect slot carries no threat tag for the hit it blocks (`slotThreat`'s `guarded`, as #650 did for
  `supportFor`'s Protect).
- The #74 status-play scenarios and #647's Lum picks are unchanged.

**3. Research: a status play in a double**

- Measure the over-credit in #262's field hypothesis (a slot's `lasts` re-read with the foe's attempt cancelled
  field-wide, while its attack still lands this turn). Cover sleep and paralysis, which use the same hypothesis, as
  well as Protect.
- Measure #236's redirect charge on a plan whose knockout comes first.
- Decide whether a double's per-slot scores take the singles prices from ticket 1, given `danger` already prices our HP
  and losses through the joint value.
- End with Protect as a priced play in a double on this doc's scene (picked in 1, 3, 8 and 9; not in 2, 4–7), and say
  how `supportFor`'s Protect fits with it.

Out of scope by owner decision (#749 → #850): a rule-based Protect gated on the lock's last use.

## Known limits

- **The turns are stubs**: single-hit damage tables, no boss bars, items, weather or field effects; `expectedHpLeft`
  and the new HP share are the planner's coarse figures along the expected path.
- **The blast radius is the goldens only.** No live corpus was replayed. How often the `failing` change in §5 moves a
  real stay is not measured.
- **Doubles was measured on one scene** (the lead locked on, a partner, Snorlax beside Salamence).
- **Protect's edge cases are not in the prototype**: a foe move that ignores Protect (`IGNORE_PROTECT`, Unseen Fist),
  Quick Guard or Wide Guard counting toward the streak (the game counts them), Protect breaking a lock with uses still
  left (the follow-up exchange assumes the lock runs on, which under-prices it), and the contact chip of Spiky Shield
  and the like.
- **Fight-plan neutrality (§3) is read from the code**, not measured.
