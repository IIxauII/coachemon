# Protect on the last use of a foe's lock-in (#749)

Desk research for #749 (part of #716). Game refs are to the pinned clone at **1.12.1.3**
(`.cache/pokerogue/v1.12.1.3`, `pinned` in `src/escape-ladder/reviewed.json`); repo refs are to `origin/master` at
`c151b0e`. The scripts next to this file produced every measured number:

- `749-protect-last-lock/rosters.ts` (+ `rosters.test.ts.template`, raw output `rosters.json`): the game's own party
  generator, run in the pinned clone.
- `749-protect-last-lock/turn-score.mjs`: the planner's `exchange` on stubbed singles turns, in the shape of
  `plannertest.mjs`'s foe-lock scenario.

## Short answer

**Build it as a narrow rule-based suggestion, like `supportFor`'s Protect, not by pricing.** Suggest Protect on a
foe's last locked use only when that use is a likely knockout of the slot it is queued at (no safe switch-in having
been picked), and Protect did not succeed last turn. Do it in both singles and doubles, per slot.

Why:

- **It comes up at the fights that matter.** From wave ~75 on, about one generic trainer in six fields a lock-in
  user, and so does one boss-tier fight in four or five: gym leaders from W80, evil-team admins and bosses, the Elite
  Four and the champion. Before W55 it almost never happens.
- **The trade is simple and the same in every case.** Both lines end with the foe confused: the game confuses on the
  count reaching 0 whatever that last use did. So Protect swaps the locked hit for one more of the foe's own hits at
  the end of the race, at the cost of one turn of ours. It decides the duel when the locked hit is the knockout;
  elsewhere it mostly buys HP, which the turn score does not price.
- **It does not fall out of the existing scoring, and pricing it there would not make it fall out either.** Protect is
  never an option in singles (`statusPlay` returns null for it). Priced the way `playOption` prices a status play,
  it is charged a full turn plus `STATUS_COST` and credited only the change in who knocks out first. So it loses even
  where it is strictly better: attacking into a sure knockout scores 0.8 turns above a Protect that wins the duel
  22 % of the time (case 9 below).
- **The immune switch-in needs nothing.** Since #783 the switch pricing already confuses the foe only when the
  immune switch-in takes the last use, and the card already picks that switch (case 3b).

## 1. How often it comes up

Measured with `rosters.ts`: for every Classic trainer type, at the waves its class meets us, the game's own
`Trainer.genPartyMember` (the call `EncounterPhase` makes, `src/phases/encounter-phase.ts:111`) builds the party on
fresh seeds. A member counts when its generated moveset holds Thrash, Petal Dance, Outrage or Raging Fury. Waves:
generic trainers at 15, 35, …, 175. Gym leaders at 20, 50, …, 170 (`w % 30 === 20`). The fixed battles
(`src/enums/fixed-boss-waves.ts`): grunts 35/62/64/112, admins 66/114/164, bosses 115/165, Elite Four 182–188,
champion 190, rivals 8/25/55/95/145/195.

| Class | Types | Types that ever carry one | Parties with one | Members with one |
| --- | --- | --- | --- | --- |
| generic | 63 | 56 | 10.2 % | 4.7 % |
| evil grunt | 10 | 7 | 5.6 % | 2.1 % |
| evil admin | 26 | 18 | 17.6 % | 3.6 % |
| evil boss | 20 | 12 | 30 % | 5.8 % |
| gym leader | 74 | 42 | 17.2 % | 4.3 % |
| elite four | 42 | 13 | 22.6 % | 5.8 % |
| champion | 16 | 7 | 28.1 % | 6.3 % |
| rival | 6 | 2 | 16.7 % | 3.8 % |

By wave (parties with one): generic 0 % at W15, 0.3 % at W35, 2 % at W55, 8.6 % at W75, then 15–17 % from W95 to W175.
Gym leaders: 0 % at W20, 3 % at W50, 20 % at W80, 26–28 % from W110 on. Evil grunts 0 % until W64, 22 % at W112. Admins
3.5 % at W66, 25 % at W114 and W164. Bosses 28 % at W115, 32 % at W165. Elite Four 23 %, champion 28 %. Rivals 0 % up
to W95; RIVAL_5 and RIVAL_6 (W145, W195) drew Rayquaza with Outrage in one of the two samples.

**Why the late start:** the lock moves sit late in the level-up learnsets (Petal Dance from level 28; Thrash and Outrage
from 1 on a few species, usually much later). Outrage is an ultra-tier TM, and trainers only draw ultra TMs from
level 55 (`ULTRA_TIER_TM_LEVEL_REQUIREMENT`, `src/data/balance/moves/moveset-generation.ts:62`; tier at
`src/data/balance/tm-pool-tiers.ts:78`). Thrash, Petal Dance and Raging Fury aren't TMs at all. Egg moves come in
from level 80 for trainers that allow them (`:65`).

**Who carries it.** Outrage is the most common, then Thrash, then Petal Dance. Raging Fury is rare (Firebreather and
Backers: Infernape, Arcanine). The rosters that run one most often, where the 12-seed run covered them:

- Dragon Tamer 92 % (W135), Aroma Lady 75 %, Dancer 67 %, Snow Ace Trainer 67 %; Ace Trainer, Depot Agent, Maid,
  Officer, Pilot and Rich 50 %.
- Ghetsis's second fight 100 % (Kyurem Outrage, Eelektross Thrash), Lysandre's second 92 % (Zygarde Outrage),
  Giovanni both fights 58 % (Kangaskhan Outrage), Ghetsis's first 58 %, Penny's second 50 %.
- Admins: Ariana 100 % at W114 (Vileplume Petal Dance), Aliana and Eri 67 %, Xerosic and Giacomo 58 %.
- Gym leaders (two seeds each past Morty, so 50 % / 100 % is "one" / "both"): Clair, Gardenia, Cilan, Chili, Elesa,
  Clay, Brycen, Drayden, Milo, Marnie, Raihan, Brassius and Larry carried one in both samples; Erika and Blaine
  (12 seeds) 50 %.
- Elite Four: Bruno, Drake, Bertha, Marshal, Hassel and Lacey both samples; Lance, Grimsley, Drasna, Kahili,
  Raihan, Crispin and Drayton one. Champions: Nemona, Kieran both; Lance, Alder, Iris, Diantha and Kukui one.

The full per-type, per-wave rows and carriers are in `rosters.json`.

**Wild mons**, by level-up learnset alone (what wild movesets draw from): 76 species learn Thrash, 60 Outrage, 18
Petal Dance and 3 Raging Fury.

**Our side** (all 1,084 species, from the species data; whether a party has these equipped is not in any source):

- **Protect:** 1,062 species can learn it by TM, 93 by level-up, and it is a common-tier TM
  (`src/data/balance/tm-pool-tiers.ts:71`). Almost any mon can carry it; the open question is the player's moveslot.
- **Immune by type:** 68 Fairy species (vs Outrage) and 71 Ghost species (vs Thrash).
- **Immune by ability:** 28 with Flash Fire or Well-Baked Body (vs Raging Fury), 21 with Sap Sipper (vs Petal
  Dance). Grass and Fire have no immune type.

## 2. What it is worth in turn score

### The rules at 1.12.1.3, re-checked

- Thrash, Petal Dance, Outrage and Raging Fury each add a self `FRENZY` tag of 2–3 uses
  (`AddBattlerTagAttr(FRENZY, true, false, 2, 3)`, `src/data/moves/move.ts:9503`, `:9637`, `:10033`, `:12230`; the
  length is `randBattleSeedIntRange(2, 3)`, `:6517`). All four are `RANDOM_NEAR_ENEMY`.
- After every use, `MoveEndPhase` lapses `AFTER_MOVE` tags (`src/phases/move-end-phase.ts:37-39`), unless the use was
  virtual. A locked use is `IGNORE_PP` (2), not virtual (`isVirtual` is `>= INDIRECT` (3),
  `src/enums/move-use-mode.ts:103-105`). `MovePhase.end` queues that `MoveEndPhase` whatever the use did
  (`src/phases/move-phase.ts:902-909`).
- `MoveLockTag.lapse` is `super.lapse(...) && lastMove.targets.length > 0 && lastMove.result === MoveResult.SUCCESS`
  (`src/data/battler-tags.ts:1640-1641`). `BattlerTag.lapse` is `return --this.turnCount > 0` (`:226`). The `&&`
  short-circuits, so the decrement always runs and the result is checked only while uses remain.
- `lapseTags` calls `onRemove` on every tag whose lapse returned false (`src/field/pokemon.ts:4377-4389`).
  `FrenzyTag.onRemove` adds `CONFUSED` for `randBattleSeedIntRange(2, 5)` turns when `turnCount <= 0`
  (`src/data/battler-tags.ts:1685-1693`).
- A protected use is not SUCCESS: `hitCheck` returns PROTECTED (`src/phases/move-effect-phase.ts:380-381`) and
  `conductHitChecks` writes MISS or FAIL when no target was hit (`:244-250`).

So **Protect on the last use still confuses** (the count goes 1 → 0, the lapse returns false, `onRemove` sees 0), and
on an earlier use it ends the lock unconfused (2 → 1, then the result check fails, `onRemove` sees 1). The source
comment on `FrenzyTag.onRemove` ("only if … every use landed") is wrong about its own code: an unlanded *last* use
confuses too.

Two more facts the comparison rests on:

- **Protect always moves first:** priority 4 (`src/data/moves/move.ts:9957`). Its n-th success in a row holds at
  1/3ⁿ (`ProtectAttr.getCondition`, `:6812-6833`).
- **Confusion counts the foe's attempts, not turns:** `ConfusedTag.lapse` ticks down on `PRE_MOVE` only, then
  self-hits on `randBattleSeedInt(3) === 0` (`src/data/battler-tags.ts:1263-1297`). A 2–5 turn count is 1–4
  confused attempts, 2.5 on average.

### The trade

Both lines confuse the foe at the same moment, after its last use, so its confused attempts line up turn for turn.
What differs:

| | Foe's attempts before our knockout | Our hits |
| --- | --- | --- |
| Attack | locked hit, own 1, own 2, …, own A−1 | turns 1…A |
| Protect | (blocked), own 1, own 2, …, own A | turns 2…A+1 |

(A = the hits we need. With a slower foe both rows lose their last attempt.) **Protect trades the locked hit for one
more own-pick hit at the end of the race,** which is usually past the confusion, and costs one turn of ours. Speed
order doesn't change the trade, only how many attempts both rows hold. It pays when the locked hit is much the bigger,
as it usually is (120 BP, and the AI picked it): above all when the locked hit is the knockout.

### Measured: the planner's own numbers on stubbed turns

`turn-score.mjs`: Salamence locked into Outrage with one use left (`FRENZY` `turnCount` 1, its queued use at our
lead), our lead with Ice Beam and Protect, singles, no bench unless noted. Damage numbers are max rolls; the foe's own
pick once the lock is spent is Fire Blast. Scores are in the planner's turn units, attack as `one()` scores it and
Protect as `playOption` would, both less the terms that cancel (method in the script's header).

| Case | Attack: score (P we KO first / P they do, HP left) | Protect | Protect − attack | Protect again − attack | The card's ⚔ line today |
| --- | --- | --- | --- | --- | --- |
| 1 · foe faster, Outrage 150 / own 60, we 3HKO | -3.073 (0.617 / 0.383, 33 HP) | -3.507 (1.000 / 0.000, 126 HP) | -0.434 | -1.368 | ⚔ Lead Ice Ice Beam → Salamence 3 hits |
| 2 · as 1, foe slower | -2.475 (0.916 / 0.084, 75 HP) | -3.507 (1.000 / 0.000, 172 HP) | -1.032 | -1.533 | ⚔ Lead Ice Ice Beam → Salamence 3 hits |
| 3 · foe faster, Outrage KOs (300), own 60, we 3HKO | -4.307 (0.000 / 1.000, 0 HP) | -3.507 (1.000 / 0.000, 126 HP) | 0.800 | -0.533 | ⚔ Lead 💀 Dragon 100% Ice Ice Beam → Salamence 3 hits |
| 4 · we faster and 1HKO | -0.375 (1.000 / 0.000, 250 HP) | -1.637 (1.000 / 0.000, 250 HP) | -1.262 | -1.262 | ⚔ Lead Ice Ice Beam → Salamence 1 hit |
| 5 · we slower, 1HKO, Outrage 150 | -0.375 (1.000 / 0.000, 112 HP) | -1.637 (1.000 / 0.000, 213 HP) | -1.262 | -1.417 | ⚔ Lead Ice Ice Beam → Salamence 1 hit |
| 6 · Outrage resisted (40), own 60 | -2.307 (1.000 / 0.000, 135 HP) | -3.507 (1.000 / 0.000, 126 HP) | -1.200 | -1.354 | ⚔ Lead Ice Ice Beam → Salamence 3 hits |
| 7 · own pick as strong (150) | -4.180 (0.063 / 0.937, 0 HP) | -5.266 (0.120 / 0.880, 0 HP) | -1.086 | -1.228 | ⚔ Lead Ice Ice Beam → Salamence 3 hits |
| 3b · as 3, immune Clefable benched | -4.307 (0.000 / 1.000, 0 HP) | -3.507 (1.000 / 0.000, 126 HP) | 0.800 | -0.533 | now: ⇄ Lead 💀 Dragon 100% out › Clefable in · takes ~0% · immune to Outrage |
| 9 · we slower and 1HKO, both its hits KO | -2.375 (0.000 / 1.000, 0 HP) | -3.190 (0.224 / 0.776, 83 HP) | -0.815 | -1.113 | ⚔ Lead 💀 Dragon 100% Ice Ice Beam → Salamence 1 hit |
| 8 · foe faster, Outrage 130 / own 60, we 4HKO | -5.241 (0.274 / 0.726, 0 HP) | -5.623 (0.683 / 0.317, 20 HP) | -0.382 | -1.200 | ⚔ Lead Ice Ice Beam → Salamence |

Read off it:

- **The card never says Protect today**, in any case, including 3 and 9 where it attacks into a 💀 100 % hit.
- **Protect beats attacking in the score only where the locked hit is a sure knockout (case 3, +0.80).**
- **Where it flips most of a race it still loses in the score:** case 1 takes the foe's chance to win from 38 % to 0
  and scores −0.43; case 8 takes it from 73 % to 32 % and scores −0.38. The full turn plus 0.2 needs a swing above 1.2
  in `pWeKoFirst − pTheyKoFirst` to pay.
- **Case 9 is the scoring's blind spot:** attacking loses for sure, Protect wins 22 % (a self-hit lets our 1HKO land),
  and attacking still scores 0.82 higher. `eTurnsWe` prices our knockout clock as if we lived, so a dead attacker
  keeps its fast clock.
- **Attacking wins, as it should,** when our hit knocks out first (4, 5), when the blocked hit is small (6: a
  resisted Outrage under the Fire Blasts it is swapped for), and when the foe's own pick hits as hard (7).
- **After a Protect that held last turn, Protect again never pays** (last column; ⅓ holds).
- HP carried out is the one gain the turn score does not see: in cases 2 and 5 Protect wins the same duel with
  about 100 more HP (the planner's coarse `expectedHpLeft`). Neither the turn score nor the fight plan prices it for
  Protect, since the fight plan has no Protect step either.

## 3. Singles vs doubles

**The slot is known exactly; the ½ re-draw in the issue applies to later uses, not to the last one.** A lock queues
its next use, targets drawn, in `MoveLockTag.lapse` at the end of the use before
(`getNextTargets` → `getMoveTargets`, `src/data/battler-tags.ts:1643-1670`; `RANDOM_NEAR_ENEMY` draws
`opponents[randBattleSeedInt(opponents.length)]`, `src/data/moves/move-utils.ts:93-95`). At our command prompt that
draw has already happened: `EnemyPokemon.getNextMove` returns the queued move with its targets
(`src/field/pokemon.ts:6798-6811`), and a locked trainer foe skips the switch check
(`src/phases/enemy-command-phase.ts:58`). The planner already reads it: `likelyMoves` takes this use's target from the
game's own answer, and only later uses get the 1/n share (`30-planner.js:121-123`, "Only this use's target is drawn
yet"). The last use has no later locked use, so in a double the slot it is queued at is the one to Protect. The one
exception is a target removed before the foe moves, whose ally then takes it (`redirectPokemonMoves`,
game-code.md §5).

So the suggestion belongs to **the slot**, in both battles. A double makes the trade better, not worse: only that
slot gives up its attack, and `supportFor` already has the shape — a support move for one slot, gated on how little
that slot's own attack adds (`plan.joint.value - alone.value < 0.5`) and on `protectedLast` (`30-planner.js:1458-1499`).
Today its one Protect case needs the partner to knock that foe out first; a locked last use at the slot is a second
case of the same kind. In singles there is no `supportFor` at all (it returns early unless `plan.picks.length === 2`,
`:1473`), so singles needs the rule added where the turn line's pick is made.

## 4. The immune switch-in

**No timing logic needed: the switch pricing already has it, measured.** `threatFrom` marks a singles switch-in
immune to the locked move (`immune`, `30-planner.js:227-234`), and `lockStep` then ends the lock (`usesAfter = 0`)
but confuses only when the use was the last (`confuses = uses === 1`, `:547-565`). `plannertest.mjs`'s foe-lock
scenario (`:1423-1460`) and its golden (`golden/plannertest.txt:352-353`) carry the numbers: an immune Clefable facing
Outrage's last use keeps the foe off it for 4.81 turns, against 4.00 when two uses are left — the confusion is worth
0.81 turns, and the switch advice sees it. In case 3b above the card switches to the immune Clefable on the last use.

On the last use the singles-only `immune` guard costs nothing in a double: with one use left, `usesAfter` is 0 and
`ownFrom` is 1 whether or not the switch-in is immune, so a double prices it the same.

**One surprise for #716's settlement.** The switch pricing also picks an immune switch-in into a use that is *not*
the last, when that prices better: in an ad hoc run of case 1 with two uses left and Clefable benched, the card says
`now: ⇄ Lead out › Clefable in · immune to Outrage`, ending the lock unconfused, because two Outrages knock the lead
out. So "the coach never suggests breaking a lock early" now holds for Protect only. That is the pricing doing its
job, not a bug, but #716's wording no longer describes the switch advice.

## 5. Card wording

A proposal for the owner, in `supportFor`'s existing shape (`⚔ Lucario Protect · Garchomp KOs Hydreigon first`): the
⚔ row names the member and Protect, no target, and the note says why the Protect costs nothing.

```
⚔ Lead Protect · blocks Outrage's last use — Salamence still ends confused
```

It stays inside the Turn line contract (CONTEXT.md, Turn line): one decision's call, which member acts with what. "last
use" tells the player why this turn and not the one before; "still" says the confusion is not traded away, which is
what tells it apart from the early break #716 ruled out.

## 6. Recommendation

**Build it, as a rule-based suggestion, not by folding it into the lock pricing.**

- Folding it into the pricing (#783) would mean offering Protect as a status play. Measured above, the planner's score
  would still not pick it in the cases where it is right (1, 8, 9), because of how the score charges a stall turn.
  Fixing that charge is a planner-wide change to every status play, out of proportion to this one case.
- Dropping it leaves the card attacking into a 💀 100 % locked hit when a Protect wins the duel (case 3), at the
  biggest fights of the run.
- The rule, gated so it never fires where attacking wins:
  1. the foe's `FRENZY` tag shows one use left (`lockOf(foe).left === 1`),
  2. that use is queued at this slot and is a likely knockout before we move (`threatKoAt × koFirst ≥ 0.5`, the
     test `supportFor` already uses),
  3. the slot has a usable Protect and `!protectedLast(me)`,
  4. the turn line did not already pick a switch.
  In a double it is a second Protect case in `supportFor`; in singles the same rule, where the pick is made.

## Known limits

- **Rosters are generated, not met.** `rosters.ts` calls `Trainer.genPartyMember` directly at fixed sample waves
  with fresh seeds, outside a real run; they show who *can* field a lock-in at a wave, not how often a run meets each one; the biome trainer pools that weight which types appear are not applied. The 12-seed run was stopped for time after the gym leaders up to Morty, so the remaining gym leaders, the Elite Four, the champions and the rivals rest on two seeds each, whose shares read 0 / 50 / 100 %. Doubles variants were not generated. 15 samples threw inside the game's own generation (`Cannot read properties of undefined (reading '-1')`: five generic types at W55, Giovanni and Whitney at W50) and were skipped.
- **Our side's Protect is inferred.** The species data say nearly every mon can learn Protect (by TM), and it is a
  common-tier TM; how often a party actually carries it is not in any source here.
- **The turn-score cases are stubs**, single-hit damage tables with no boss bars, items, weather or field effects;
  `expectedHpLeft` is the planner's coarse figure. They show what the scoring does, not how often each case arises.
- **Doubles was read, not measured.** The doubles answer rests on the source and the planner code cited in §3.
