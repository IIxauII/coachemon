# Which of the battle oracle's HUD candidates are real gaps?

Research for #637, part of the map "seed-exact fight knowledge for the player" (#633). The candidates come from the
battle oracle issue (#632, Gordie W180) and from "Coach and panel findings" in the Ivy W145 log
(`docs/research/gordie-w180/w145-ivy-rayquaza.md` on `research/gordie-w180`).

- **Game:** the pinned clone `.cache/pokerogue/v1.12.0.11`, the version Gordie was played on. Paths below are under its `src/`.
- **HUD:** `skills/coachemon/scripts/hud/` at `origin/master` `aca70ca`. The HUD files these candidates touch have not
  changed in any way that bears on them since 1.11.1, the plugin W145 was played on.
- **Method:** every claim was read in the game source and the HUD. The HUD's own behaviour on four of them was then
  checked with the planner test harness (`scripts/test/plannertest.mjs` helpers, `fake-turn.mjs`): scenarios built
  from the logged fights, run against the real bundle. The scenarios are in the appendix. Nothing here ran the game.

Sizes: **S** is a few lines in one module plus a test. **M** is new logic in one or two modules. **L** is a new kind of
option across modules, plus card UI.

## Verdicts

| # | Candidate | Verdict | HUD module | Size |
|---|---|---|---|---|
| a | Berry theft with Bug Bite / Pluck as our play | gap | 30-planner (turn line), 35-team-plan | M |
| a′ | A foe's Lum Berry voids our status play (found here) | gap | 30-planner `statusPlay` | S |
| b | Instant-Tera free turn (the picked move then fails) | partial | 25-turn, 30-planner, 35-team-plan | S–M |
| c | A predicted foe Tera changes switch magnets | partial | 25-turn, 35-team-plan | M |
| d | Predicted enemy switches, aiming at the incoming foe | modelled | — | — |
| e | Tera advice for our side | gap | 25-turn (hypothesis), 30-planner, 35-team-plan, card | L |
| f | Mean Look's hold ends on switch; Toxic's counter resets on switch-in | not worth it | (30-planner) | S |
| g | One Tera per arena, reset by the party heal | part of (e) | with (e) | S |
| h | SMART move choice | modelled | — | — |
| W1 | A move whose user never gets to act | gap | 30-planner, 35-team-plan | M |
| W2 | Accuracy ties | modelled (display only) | 96-render-battle / 30-planner view | S |
| W3 | Sacrifice chains of mons that die without acting | gap | 35-team-plan | S–M |
| W4 | A super-effective hit feeding an Enigma Berry | gap (turn line), partial (fight plan) | 30-planner, 35-team-plan | S |

## The second-pick contradiction, settled

The game source agrees with `game-code.md:669-673`, not with the battle oracle issue. `getNextMove`
(`field/pokemon.ts:6753-6775`) sorts the pool by score and, for a SMART foe, steps to the next move while
`randBattleSeedInt(100) < Math.round(score[i+1] / score[i] * 50)`. The step chance is `round(ratio · 50) / 100`: about
50% for two near-equal scores, never 1% unless the second scores about a fiftieth of the first.

Gordie's T2 in attempt 1, worked: Rock Slide scores about 57 against Reshiram and Explosion 45–49
(`SacrificialAttr` at Gigalith's HP; the issue's own numbers). The step from Rock Slide to Explosion is therefore
`round(0.79–0.86 · 50)` = **39–43%**, before the further step past Explosion to Spiky Shield or Body Press. The T2
Explosion was a roll of tens of percent that the seed fixed, not a 1% fluke. The "≤1%" in the battle oracle issue reads
as `Math.round(ratio)` without the `· 50`.

The HUD already has this right twice over. Its **exact** read calls the game's own `getNextMove` at the prompt
(`20-enemy-ai.js:306-328`, opened by `25-turn.js:330-337`), so the seeded roll is inside the answer: the attempt-1 card
would have shown Explosion at T2. Its replica for later turns, `aiChain` (`20-enemy-ai.js:124-137`), uses the same
`round(r · 50)`.

## Candidates from the battle oracle issue

### (a) Berry theft with Bug Bite / Pluck — gap, M

**Game.** Pluck and Bug Bite carry `StealEatBerryAttr` (`data/moves/move.ts:10703-10704`, `:10963-10964`; the attribute
`:3448-3489`). On a hit it does nothing against a `BlockItemTheftAbAttr` holder (Sticky Hold, `:3462-3466`) or one with
no berry. Otherwise it picks one held berry **type** with `randBattleSeedInt(heldBerries.length)` (`:3477`), takes one
from that stack and has the user eat it at once. The berry's effect runs with no predicate check (`getBerryEffectFunc`,
`data/berry.ts:69` on): a stolen Enigma heals the thief a quarter, Lum cures its status, Leppa refills PP. The foe loses
the heal or cure it would have had at turn end, when berries are otherwise eaten (`game-code.md:413`).

**HUD.** Nothing prices it. The planner's only item theft is a *foe's* Grip Claw or Mini Black Hole stealing from us
(`30-planner.js:340-354`, `35-team-plan.js:151-170`). Bug Bite and Pluck appear only in mystery encounter text
(`46-encounter.js:48`, `:507`). On the attempt-1 Gordie card Bug Bite is a plain damage pick ("Leavanny physical Bug
Bug Bite ~36% · 3 hits" against Tyranitar).

**What it would take.** The steal as part of the move's worth, in the turn line's exchange and the fight plan's foe
heal profile: the foe's turn-end loses the berry from now on (`10-damage.js:379-384` already reads held berries, so
removing one flows through), and we gain its effect now. The afterSteals pattern (`30-planner.js:364-392`) already
prices "k items gone" as a distribution and fits a uniform draw over berry types.

**Caution for the value.** Which berry goes is a uniform draw over the berry types the foe holds. Gordie's foes held
two to six berry types each (`kit/gordie-teams.json`): Coalossal's Lum was a 1-in-2 steal, Carracosta's Enigma 1-in-6,
Tyranitar's Leppa 1-in-5. The winning line got those three because the seed gave them. The HUD can price the
expectation; only the oracle knows which berry comes out.

**Fights changed.** Gordie T5, T7, T13 (the three steals). W145: none, nobody had the move.

### (a′) A foe's Lum Berry voids our status play — gap, S (found here)

**Game.** Lum's predicate is any status or confusion (`data/berry.ts:27-28`). The berry phase runs at turn end before
the status chip (`game-code.md:413`), so a Toxic or burn into a Lum holder is cured before it deals anything. A sleep
or paralysis still costs the foe this turn's move if we moved first.

**HUD.** `statusPlay` (`30-planner.js:1415-1427`) checks only that the foe has no status and can take this one. It
writes the status as a hypothesis for the whole follow-up and never looks for a Lum. A held Lum is read nowhere in the
planner (only the reward card mentions it, `51-items.js:155`).

**What it would take.** In `statusPlay`: against a Lum holder, a status lasts only this turn's `skip0`; the play is worth
the Lum it burns, which (a) can price.

**Fights changed.** Gordie: Coalossal, Stonjourner and Barbaracle held Lum (the issue's "Lum holders shrug off Toxic
until Bug Bite takes the Lum"). W145: Rayquaza held Lum; the Spore that landed in attempt 2 came after it was spent.

### (b) Instant-Tera free turn — partial, S–M

**Game.** `EnemyCommandPhase` picks the move (`phases/enemy-command-phase.ts:91`) before it queues the Tera (`:93-95`);
`TeraPhase` runs at the start of the turn, before any move (`phases/turn-start-phase.ts:57-67`). Burn Up's condition is
"the user is Fire type, Tera included" (`data/moves/move.ts:11777-11779`). Coalossal Tera Rock is not Fire, so a Burn
Up picked before the Tera fails.

**HUD.** The survey's "nothing catches a move that then fails" is half right. This turn's damage *is* caught, by
accident of the design: the exact pick is made with the Tera off (`25-turn.js:330-337`), but the foe's damage pool is
built with it on, and the pool drops any move whose condition fails (`10-damage.js:25-40`). Burn Up has no damage
record, so `threatFrom` counts it as a move that deals nothing (`30-planner.js:194-201`). Three things are wrong after
that:

1. **The card says nothing.** The foe row still reads `↯ Fire Burn Up → Leavanny` with no damage and no note that it
   fails. A player reads a 4× Fire hit coming.
2. **The zero is carried to every later turn.** The turn line's race reuses this turn's threat for all its turns
   (`30-planner.js:445`, `:538-540`), and the fight plan takes the pairing's per-turn hit from the same threat
   (`35-team-plan.js:51-57`). Coalossal reads as harmless for the whole exchange. The probe in the appendix shows the
   plan's "Leaf Storm → Coalossal KO · 71% left": Leavanny starts at 71% and loses nothing over an exchange of several
   turns.
3. **Next-turn re-picks run with the Tera off.** `replayAI` goes through `asAi`, which turns the predicted Tera off
   (`25-turn.js:261`, `:310-311`). So the next-turn read re-picks Burn Up too, and finds no damage again. In the game,
   next turn Burn Up scores −20 (its condition fails, `field/pokemon.ts:6695-6700`) and Coalossal picks something else.

**What it would take.** A "fails" note on the foe row when the exact pick has no damage record under the predicted
Tera. Later turns re-picked with the Tera on, which is the same fix as (c).

**Fights changed.** Gordie T5: the free turn would have read right but unexplained, and the rest of the exchange too
rosy. The real T6 Stone Edge missed by luck.

### (c) A predicted foe Tera changes switch magnets — partial, M

**Game.** This turn, the switch check and the move pick both run before the Tera (`enemy-command-phase.ts:58-91`), so
asking them with the Tera off is right. After it, the Tera stays for the rest of the battle, across switches out and
back. Only a faint or the end of the battle undoes it (`phases/faint-phase.ts:123`, `battle-scene.ts:1594`).
`getMatchupScore` reads the Tera'd types for defence and STAB (`field/pokemon.ts:2680-2762`), so from the next turn the
foe's own stay-or-switch score and its later send-in score both change. Which bench foe will Tera on entry is known
up front: `trainerAI.instantTeras` holds the team indexes (`data/trainers/trainer-config.ts:79-92`, `willTerastallize`
in `utils/pokemon-utils.ts:160-167`). Gordie's is `[5]`, Coalossal.

**HUD.** This turn is exact: `sceneSwitches` and the exact pick run before the Tera, as the game does
(`25-turn.js:261`, `:305`, `:336`). Past this turn there are two gaps:

1. **A foe predicted to Tera this turn** is asked with the Tera off for every later-turn read: `replayAI`, `sendInScore`
   (`25-turn.js:310-312`), and so the fight plan's send-in scores (`35-team-plan.js:88-97`). Only this turn's damage
   sees the Tera.
2. **A benched instant-Tera foe** is priced at its pre-Tera typing for its whole exchange. Only active foes are put
   into Tera (`25-turn.js:346-349`). The attempt-1 card shows it: Coalossal "Rock Fire … ▲ Ground ×4 … Water ×4",
   plan step "Gyarados free Water Hydro Pump → Coalossal KO (65%)", and "Gyarados only answer to Coalossal". Tera Rock
   halves both of those weaknesses.

The fight plan never switches a foe mid-exchange (`35-team-plan.js:1-3`), so "a Tera removes a magnet" can only
change its send-in order. The magnet itself, Coalossal pulled in against Leavanny until it Teras, has no place in the
current model. That is a limit of the plan, not of the Tera handling.

**What it would take.** In 25-turn: AI calls for later turns with a predicted Tera on, and only this turn's
`EnemyCommandPhase` calls with it off. In 35-team-plan: a benched instant-Tera foe built at its Tera type from its
entry. Both share a fix with (b).

**Fights changed.** Gordie T1–T5: the plan priced Gyarados into Coalossal at Water ×4 and named it the only answer.
The Coalossal pull against Leavanny ran T4–T7.

### (d) Predicted enemy switches, and aiming at the incoming foe — modelled

`sceneSwitches` replays the game's switch check with damping and the boss ×2 bar (`20-enemy-ai.js:364-399` against
`enemy-command-phase.ts:58-89`). The turn line aims at the switch-in standing in for the foe leaving
(`30-planner.js:1518-1524`, `:1552-1555`). A foe switching out isn't an attacker that turn (`:1561`), so a switch of
ours on the same turn takes no entry hit: matching the switch is priced. The fight plan starts from the predicted
switch-in (`35-team-plan.js:412-417`). It covers this turn only; later switches are the fight plan's limit noted in (c).

Fights: Gordie T4, T7, T9 (T9 is the damping), W145 T2–3 (Torterra → Kingdra, which the panel predicted).

### (e) Tera advice for our side — gap, L

**Game.** A Tera command queues `TeraPhase` before any move, and the foe has already picked against our pre-Tera
typing (`turn-init-phase.ts:68-70` puts every `CommandPhase` before the `EnemyCommandPhase`s, and
`turn-start-phase.ts:57-67` the Tera after both). It is the mirror of the foe's instant Tera: the pick sees the old type,
the hit lands on the new one. It needs the Tera Orb modifier and a form that can Tera, not Mega, Max or Ultra Necrozma
(`utils/pokemon-utils.ts:174-190`). It lasts until the end of the battle.

**HUD.** No Tera option for us anywhere. Predicted Tera is foes only (`25-turn.js:346-349`). The only Tera in our
advice is valuing a Tera Shard reward (`51-items.js:250-257`) and the road group's "full heal … Tera" line
(`95-render-ahead.js:29`).

**What it would take.** A "Tera + move" option per mon: a Tera hypothesis written like the foe's (`25-turn.js:17-29`),
picked with the Tera off and landing with it on, scored in the turn line, and carried into the fight plan's tables for
that mon. It also needs the budget (g), and the switch effect: foes' matchup scores against our new type.

**Fights changed.** Gordie T16. Tera Water Gyarados took Stone Edge from 114% to 57% and Hydro Pump into Tyranitar from
36% to 48%, and no foe's matchup cleared the switch bar against it. That was the win. W145: no Tera was played (Mega
Dragonite couldn't).

### (f) Mean Look's hold and Toxic's counter — not worth it

**Mean Look.** Its `TRAPPED` tag is source-linked (`data/battler-tags.ts:658-708`, `isSourceLinked` true). It is removed
when the user leaves the field (`field/pokemon.ts:5657-5664` in `leaveField`; `phases/switch-summon-phase.ts:81-84`). The
HUD never offers Mean Look: `statusPlay` prices setup, status, typing, heal and hazard only and returns nothing for it
(`30-planner.js:1402-1450`). The switch replay already respects a trapped foe (`20-enemy-ai.js:374`). No advice is wrong
today, and pricing it buys one turn's switch denial.

**Toxic counter.** It resets to 0 on every switch-in (`phases/post-summon-phase.ts:18-20`). The tick is
`max · count / 16` after an increment (`phases/post-turn-status-effect-phase.ts:25-46`). The HUD ramps the count inside
an exchange (`30-planner.js:398-399`), where the mon never leaves, so no reset is needed there. The reset matters in two
narrow places: one of ours re-entering badly poisoned is read with its old, higher count, and the fight plan holds the
Toxic chip flat at the current count (`35-team-plan.js:110-119`). Both are small, S, and no logged turn hinged on them.

### (g) One Tera per arena, reset by the party heal — part of (e)

Confirmed, and it can now be marked audited in `game-code.md:1986-1990`. `MAX_TERAS_PER_ARENA = 1` (`constants.ts:114`) is
checked against `arena.playerTerasUsed` (`utils/pokemon-utils.ts:188-190`, the command menu at
`ui/handlers/command-ui-handler.ts:199-204`), which `TeraPhase` raises (`phases/tera-phase.ts:46-47`). The count resets on
a new arena, which comes with every biome (`battle-scene.ts:1623`), on a party heal (`phases/party-heal-phase.ts:48`), and
after a battle with a Terapagos in the party (`battle-scene.ts:1596-1599`). The Tera itself ends after each battle
(`battle-scene.ts:1594`) and on a faint. The HUD needs this only once (e) exists: to know whether a Tera is left, and
that spending it costs the rest of the biome up to the next party heal.

### (h) SMART move choice — modelled

See the contradiction above. The exact read is the game's own call. The replica for later turns follows the
KO-filter, the opposing-target sign flip (`20-enemy-ai.js:72`, against `field/pokemon.ts:6686-6689`) and step 8.

## Additions from the Ivy W145 log

### W1. A move whose user never gets to act — gap, M

W145 T4, attempts 2 and 3: Mega Dragonite at 169 HP against a faster Rayquaza whose Outrage KOs it. The panel called
Dragon Hammer, which never lands. Extreme Speed (+2) breaks a bar first.

**HUD, turn line.** A move's score is `lasts − eTurnsWe − lost + (pWeKoFirst − pTheyKoFirst) − costs`
(`30-planner.js:683-687`). When the race is lost whatever we pick, `pTheyKoFirst` is about 1 for every move. The moves
are then told apart only by `eTurnsWe`, the expected turns to a KO we never live to reach, so the stronger slow move
wins. Nothing credits the damage a move lands before its user falls, though that damage is what carries into the
next exchange. The fight plan's price doesn't separate them either: it pins only the mon, not the move
(`planValueOf`, `30-planner.js:932-936`).

**HUD, fight plan.** Worse: our move's priority is never counted. The order table comes from `threatFrom` with our move
as a priority-0 stand-in (`35-team-plan.js:70-71`, `30-planner.js:195`), and `tpOurMove` picks the fastest KO with no
regard to order (`35-team-plan.js:31-43`).

**Probe** (appendix). The turn line calls `Dragon Hammer → Rayquaza 2 hits` with the tag "before it can act". With
Extreme Speed as Dragonite's only move, the foe row says "moves after", yet the plan says "Extreme Speed → Rayquaza falls
· foe at 100%": it ignores the priority, while the card's danger tag still reads "before it can act". The tag comes from
the threat taken without our pick (`nowThreat`, `30-planner.js:1197-1203`).

**What it would take.** In the turn line, credit the damage landed before falling (or weight `eTurnsWe` by the
chance we act). In the fight plan, take order per move, not per pairing. The danger tag should take the pick's move.

**Fights changed.** W145 T4 in both attempts (in attempt 3 the player switched instead), and T15 of attempt 2 (W2).
Every plan step with a priority finisher, such as W145 attempt 3 T16–17 (Extreme Speed).

### W2. Accuracy ties — modelled; the display hides it

W145 attempt 2 T15: `Quaquaval Mega Kick → Rayquaza · 2 hits` over Close Combat, also "2 hits" and 100% accurate.

Accuracy is priced. A record's use distribution carries the miss (`10-damage.js:597-600`), and the score uses the
expected KO turn `eTurnsWe`, which a 75% move pushes out. The "2 hits" the card shows is the *likely* KO turn, the first
turn past 50%, which a 75% two-hit KO still reaches (0.75² = 56%). So two moves read alike while the score tells them
apart. What decided T15 was W1: Quaquaval was going to land one hit and fall, so the score compared KO turns neither
move reached. With one hit landing, the Silk-Scarf-boosted Mega Kick may even have been the better chip. Showing an
inaccurate pick's accuracy on the line is an S display change. There is no scoring gap of its own.

### W3. Sacrifice chains of mons that die without acting — gap, S–M

W145 attempt 3 T9–13: "sacrifice Breloom → Tentacruel in free, Tentacruel → Crawdaunt in free, Crawdaunt → Raichu in
free" spent two members for no damage.

**HUD.** A plan step is labelled a sacrifice when our mon falls, the foe stands, the next entry is free and the mon is
low value (`35-team-plan.js:547-548`). Nothing asks whether the mon coming in acts. The search's value gives a member
that falls without acting no cost beyond its own HP share, and none at all in a line that ends in a loss, where every
member is at 0 anyway (`tpValue`, `35-team-plan.js:343-356`). So among lines of equal value the beam is indifferent to
which mon dies for nothing. The turn line's "⤵ X falls this turn › Y in free" takes Y from that plan (`30-planner.js:1316-1327`).

**Probe** (appendix). A W145-shaped field (Breloom at 93 HP on the field; Tentacruel, Crawdaunt and Raichu behind; only
Raichu acts before Outrage) gives "Breloom falls this turn › Crawdaunt in free". The plan then throws Crawdaunt and
Tentacruel in before Raichu, with or without Pidgeot on Ivy's bench. The real chain may have had other causes (the
"only answer" reserve for Pidgeot is one candidate); the probe shows the plan produces this shape on its own.

**What it would take.** The log's own rule: a free entry has value only if the mon it brings in acts. Pick the
free-entry mon that acts, and keep the ones that can't for a later sacrifice. Or give a member kept alive some worth
even in a lost line.

**Fights changed.** W145 attempt 3 T9–13. On Gordie the attempt-1 plan's sacrifices (Snorlax, Golbat) were single steps.

### W4. A super-effective hit feeding an Enigma Berry — gap in the turn line, partial in the fight plan

W145 attempt 2 T11–13: Moonblast (super-effective) broke Rayquaza's second bar, and its Enigma Berry healed 25%. The
last bar went from 143 to 250. Thunderbolt (neutral) would have broken the bar and fed nothing.

**Game.** Enigma's predicate is a super-effective or 4× hit taken this turn (`data/berry.ts:29-33`). It heals a quarter
of max HP (`:73-89`), at turn end (`game-code.md:413`). A heal can lift a boss past a broken bar's boundary, but the
bar stays broken.

**HUD.** The turn-end model supports it (`10-damage.js:383`, `tookSuperEffective`). Only the fight plan ever passes it
(`35-team-plan.js:110-119`, applied once on a super-effective use at `:226-228`). The turn line's turn-end
(`30-planner.js:10`, `:396-412`) never does, in either direction: it misses the foe's Enigma after our super-effective
hit and our own Enigma after theirs (Gordie T1, Reshiram's Enigma after Rock Slide). The fight plan picks each
pairing's move by KO turns with no Enigma (`35-team-plan.js:31-43`). It heals for it afterwards but never prefers the
neutral move. Against bars, the bar cap often makes the super-effective and neutral hits equal, and then the heal
decides.

**What it would take.** Pass `tookSuperEffective` from the move's effectiveness in the turn line's turn-end, once per
holder, and let the plan's move pick see it. S.

**Fights changed.** W145 attempt 2 T11–13 (the panel's Moonblast). Attempt 3 T15, where the player chose Thunderbolt
against the panel. Gordie T1 (our side), and T7, where the steal made Carracosta's Enigma moot.

## Not judged here

W145 finding 1, the misleading plan outside the command phase, is about the turn read's estimate mode, not a fight
mechanic. One correction to its guess: the fallback does read `-ate` abilities, passive included (`10-damage.js:674-675`,
`abilitiesOf` in `01-core.js:34`), and boss bars with overflow (`barStep`, `10-damage.js:99-108`). The disagreement has
another cause. Findings 6 and 7 (the audit's dead held items, `watch.mjs` per-turn mode) are outside the map, as its
Out of scope says.

## Surprises for other tickets

- **#639, #640, #641: the AI's second pick is common.** Near-equal scores step to the second move about half the time.
  A boss-fight plan that isn't seed-exact has to branch on it, and a "principles" fallback can't assume the AI plays its
  top-scored move. The HUD's one-turn exact read already includes the seeded roll; nothing past this turn can.
- **#640, #641: berry theft is a lottery outside the oracle.** Bug Bite takes a uniform-random berry type. Gordie's
  three steals were 1-in-2, 1-in-6 and 1-in-5 draws that the seed fixed. As a HUD feature, (a) is worth an expectation,
  much less than the Gordie line suggests.
- **#638: the attempt-1 card already disagrees with the engine on Coalossal.** It prices Coalossal pre-Tera (Water ×4,
  "Gyarados … KO (65%)") and would read its Burn Up turn as harmless for the whole exchange. Expect divergences
  wherever an instant-Tera foe is involved, and wherever we hold a priority move.
- **#638, #639: the fight plan ignores our move's priority.** Any plan shape built on 35-team-plan's exchanges inherits
  it.
- **#641: a vocabulary fix.** `CONTEXT.md`'s **Decision** says a battle decision includes "the free switch offered
  when a foe faints". In v1.12.0.11 the "Will you switch?" prompt (`CheckSwitchPhase`) is queued only at a wild
  encounter's start, a mystery-encounter battle, a session load and a game-over retry. It never comes in a trainer
  battle or after a foe faints (`phases/encounter-phase.ts:598-609`; `game-code.md` §9 already says so). The battle
  oracle comment's "no free switch after an enemy faint" is right. The glossary is wrong.
- **#640: (b) and (c) are one fix**, in 25-turn.js's choice of when the predicted Tera is on, plus a bench instant-Tera
  in 35-team-plan. The survey's "nothing catches a move that then fails" is wrong for this turn's numbers. What's
  missing is the note on the card and the later turns.

## Appendix: probe scenarios

Each was a copy of `plannertest.mjs` lines 1–168, the helpers that evaluate the real HUD bundle against a stubbed turn,
plus the block below, run with `node`. The stub outcome table stands in for the game's damage calls. A move with no
row has no damage record, which is what the game's condition check does to Burn Up under a predicted Tera.

<details><summary>W1, (b) and W3 scenarios and their output</summary>

```js
const oneOnOne = ({ party, foes, dist, stub = outcome, stopped = null, switches = () => new Map(), heal = null }) => render({ party, foes, live: true, dist, switches, stubOutcome: stub, stopped, heal });
const only = (move, type = "Normal") => () => [{ name: move, type, p: 1, score: 10, targets: [0] }];

// W1 (W145 T4): Dragonite 169 HP, slower, one-shot by Outrage. Dragon Hammer 2HKOs, Extreme Speed (+2) 3HKOs.
Object.assign(TABLE, {
  "Dragonite>Dragon Hammer>Rayquaza": [[220], 1, 2], "Dragonite>Extreme Speed>Rayquaza": [[140], 1, 1],
  "Rayquaza>Outrage>Dragonite": [[300], 1, 2], "Raichu>Thunderbolt>Rayquaza": [[150], 1, 1], "Rayquaza>Outrage>Raichu": [[400], 1, 1],
});
const ray = () => [mon("Rayquaza", 129, ["Dragon", "Flying"], [400, 428, 200, 300, 200, 319], [["Outrage", "Dragon", 120, "P"]], true, undefined, { aiType: 2 })];
const raichu = () => mon("Raichu", 130, ["Electric", "Psychic"], [336, 200, 150, 313, 150, 387], [["Thunderbolt", "Electric", 90, "S"]], false);
oneOnOne({ party: [mon("Dragonite", 130, ["Dragon", "Flying"], [420, 390, 200, 461, 200, 299],
  [["Dragon Hammer", "Dragon", 90, "P"], ["Extreme Speed", "Normal", 80, "P", 2]], true, 169), raichu()], foes: ray(), dist: only("Outrage", "Dragon") });
oneOnOne({ party: [mon("Dragonite", 130, ["Dragon", "Flying"], [420, 390, 200, 461, 200, 299],
  [["Extreme Speed", "Normal", 80, "P", 2]], true, 169), raichu()], foes: ray(), dist: only("Outrage", "Dragon") });

// (b): Coalossal's exact pick is Burn Up, which its own Tera makes fail: no damage row for it.
Object.assign(TABLE, { "Leavanny>Leaf Storm>Coalossal": [[150], 0.9, 1], "Coalossal>Stone Edge>Leavanny": [[200], 0.8, 2] });
oneOnOne({ party: [mon("Leavanny", 170, ["Bug", "Grass"], [497, 300, 250, 250, 200, 250], [["Leaf Storm", "Grass", 130, "S"]], true, 351)],
  foes: [mon("Coalossal", 179, ["Rock"], [711, 300, 300, 300, 300, 150], [["Burn Up", "Fire", 130, "S"], ["Stone Edge", "Rock", 100, "P"]], true, 515, { aiType: 2 })],
  dist: only("Burn Up", "Fire") });

// W3 (W145 attempt 3, T9–13): only Raichu acts before Outrage; Pidgeot on the bench, then without it.
Object.assign(TABLE, {
  "Breloom>Drain Punch>Rayquaza": [[40], 1, 0.5], "Rayquaza>Outrage>Breloom": [[339], 1, 1],
  "Tentacruel>Surf>Rayquaza": [[60], 1, 0.5], "Rayquaza>Outrage>Tentacruel": [[431], 1, 1],
  "Crawdaunt>Crabhammer>Rayquaza": [[80], 1, 0.5], "Rayquaza>Outrage>Crawdaunt": [[346], 1, 1],
  "Raichu>Thunderbolt>Rayquaza": [[150], 1, 1], "Rayquaza>Outrage>Raichu": [[437], 1, 1],
  "Raichu>Thunderbolt>Pidgeot": [[400], 1, 2], "Pidgeot>Hurricane>Raichu": [[200], 1, 1],
  "Breloom>Drain Punch>Pidgeot": [[40], 1, 0.5], "Pidgeot>Hurricane>Breloom": [[600], 1, 4],
  "Tentacruel>Surf>Pidgeot": [[100], 1, 1], "Pidgeot>Hurricane>Tentacruel": [[400], 1, 1],
  "Crawdaunt>Crabhammer>Pidgeot": [[120], 1, 1], "Pidgeot>Hurricane>Crawdaunt": [[400], 1, 1],
});
// party: Breloom 93/346 on the field, Tentacruel, Crawdaunt, Raichu (Spe 387); foes: Rayquaza 305/600 (Spe 319), Pidgeot.
```

```
== W1 lost race
⚔ Dragonite 💀 Dragon ×2 100% {Rayquaza's Outrage: ~100% of current HP, before it can act} Dragon Dragon Hammer → Rayquaza 2 hits
⤵ Dragonite falls this turn › Raichu in free
➜ 1. Dragonite Dragon Dragon Hammer → Rayquaza falls · foe at 100%
== W1 Extreme Speed only
⚔ Dragonite 💀 Dragon 100% {Rayquaza's Outrage: ~100% of current HP, before it can act} Normal Extreme Speed → Rayquaza
Rayquaza Rayquaza L129 Dragon Flying 100% ▲ — ↯ Dragon Outrage → Dragonite 100% likely · moves after
➜ 1. Dragonite Normal Extreme Speed → Rayquaza falls · foe at 100%
== (b) failing exact pick
⚔ Leavanny Grass Leaf Storm → Coalossal
Coalossal Coalossal L179 Rock 72% ▲ Grass ↯ Fire Burn Up → Leavanny 100% likely · moves after
➜ 1. Leavanny Grass Leaf Storm → Coalossal KO · 71% left
== W3 sacrifice chain (same with Pidgeot removed)
⤵ Breloom falls this turn › Crawdaunt in free
➜ 1. Breloom Fighting Drain Punch → Rayquaza sacrifice → Crawdaunt in free
➜ 2. Crawdaunt free Water Crabhammer → Rayquaza falls · foe at 44%
➜ 3. Tentacruel free Water Surf → Rayquaza sacrifice → Raichu in free
➜ 4. Raichu free Electric Thunderbolt → Rayquaza falls · foe at 17%
```

</details>
