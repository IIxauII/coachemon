# Weighing a starter's passive and egg moves by its final form

For *Research: weigh a starter's passive and egg moves by how good they are for its final form* (#742), split off
from #725. The pin is `v1.12.1.3` (`a6995c5`, `src/escape-ladder/reviewed.json`). Paths under `hud/` are
`skills/coachemon/scripts/hud/`. Game paths are in the pinned clone.

## Answer

**Recommendation: (c).** Keep the flat weights, and make the card tell the coach what it knows about each unlock. The
one exception is a passive that does nothing in a single battle; the build can cut that one's weight.

- **Egg moves: not derivable from the learn card, as is or with a small adapter.** A small adapter does let the learn
  card's judgement run on a starter's final form. The judgement then misranks the moves that make rare egg moves
  strong:
  - Setup is priced as one hit's worth. Dragon Dance on Garchomp and Quiver Dance on Galvantula come out as *skip*.
  - Strength Sap's heal goes unseen.
  - 12 of 571 rare moves can't be scored at all.
  - Against #740's verdicts on the nine 1.12.1.0 changes, it agrees on 3 and flips 2 (it calls Milcery's
    Geomancy → Sparkly Swirl an upgrade).
  - Its ranking also moves with the level the final form is judged at (Spearman 0.65 between L30 and L50).
  - A usable egg-move weight needs a second model for status moves, which are a quarter of all rare egg moves.
- **Passives: a version-proof signal exists only at the edges.** Ally-only and out-of-battle passives are 16 of 572
  final forms. Their attribute classes have existed at every one of 47 upstream tags. Type immunities, weather setters
  and terrain setters have readable data, but their worth is judgement. Another 471 final forms (82 %) have no
  generic signal, because the class is generic and the condition is a closure: `MovePowerBoostAbAttr` covers Tough
  Claws, Sheer Force, Iron Fist and Technician alike.
- **Worth it? The weights matter a lot, so a wrong weight costs a lot.** On synthetic accounts, derived egg weights
  change the best proposal for 14 % (early accounts) to 97 % (complete accounts) of accounts.
  - Handing the same weights to starters at random changes about as many: 12 % to 100 %.
  - So the change rate measures how spread out the weights are, not whether they are right. With the egg signal
    biased as above, most veteran proposals would move on a known-biased number.
  - The inert-passive cut alone moves 0–8 % of best proposals.
- **A curated tier list** means ~571 rare-move rows and ~156 distinct passives, each judged per final form, to write
  once.
  - Upkeep: across 46 upstream releases the median release changes nothing, but changes come in drops. Rare slots
    changed in 6 releases (73 at once in `v1.12.0.0`), starter passives in 8 (up to 34).
  - The pin bumps this repo took (1.12.0.11 → .1.1 → .1.2 → .1.3) changed 9, 0 and 0 rare slots.
  - A diff script can flag the rows, but someone has to re-judge them. That is the (b) cost, and it buys a judgement
    the coach already makes.

## Terms

- **Stand-in final**: the line's final form as `lineOf` (`hud/51-starters.js:70`) picks it, built by `combatantOf`
  (`hud/09-combatant.js:205`).
  - Level 50, first ability, no passive, neutral IVs and nature.
  - Its moveset is the last four level-up moves at L50 (`learnsetMoves`, `hud/12-value.js:222`), as CONTEXT.md's
    *Stand-in* builds one.
- **Gain**: the learn card's `learnAdvice(pk, move).gain` (`hud/40-learn.js:588`) on the stand-in final, in its
  effective-power units. It is the move's score minus the score of the slot it would replace, or *skip* when that is
  not worth it. *status* means the card can't score the move.
- **Derived egg weight**: `6 × clamp(gain / 79, 0, 2)`, where 79 is the median positive rare-move gain. Unscorable
  moves stay at 6, so the median rare move keeps the flat +6.
- **Inert passive**: a passive whose every attribute class is ally-only (class name contains `Ally`/`Allied`) or out of
  battle (`MoneyAbAttr`, `PostBattleLootAbAttr`, `RunSuccessAbAttr`, `DoubleBattleChanceAbAttr`). In practice that is
  Friend Guard, Power Spot, Hospitality, Pickup, Honey Gather and Run Away.

## How it was measured

Everything is **measured** unless marked *inferred*.

- `run.mjs` bundles the HUD with four research-only patches (it exposes `moveScore`, `learnsetMoves` and `lineOf`,
  hooks the card's two weights, and turns the card's memo off). No product code changes.
  - It runs `starter742.test.ts.template` in the pinned clone's vitest harness (`testInClone`), the route the
    encounter oracle uses.
  - The test reads `speciesDataRegistry`, `allMoves`, `allAbilities` and `speciesEggMoves`
    (`src/data/balance/moves/egg-moves.ts:17`) live, and calls the HUD's own functions on them.
  - Output: `results.json`, read by `analyze.mjs` into `analysis.json` and the tables below.
- `history.mjs` reads upstream `pagefaultgames/pokerogue` at 47 tags (1.10.0 to v1.12.1.3) through `gh api`. It diffs
  `speciesEggMoves`, every species' passive and the set of ability attribute classes per release (`history.json`).
  Check: v1.12.0.11 → v1.12.1.0 gives exactly #740's 20 starters and nine rare slots, and its 10 passive changes.
- No real account was read. Question 3 runs the real `starterModel` (`hud/51-starters.js:228`) on synthetic accounts
  (`config.json`), and on `startertest.mjs`'s fixture account mapped onto the real species.

## 1. Egg moves

### Can the learn card's judgement be reused?

**Mechanically, yes, with a small adapter.** `learnAdvice` and `moveScore` need a live-shaped `pk`. `combatantOf`
already builds one from plain data, so all it takes is `combatantOf({ species: final, level, moves })`. Without a live
`Pokemon`, the inputs it lacks are:

| Input | What the adapter puts in | Effect |
|---|---|---|
| Level | 50 (a guess) | stats, fixed-damage stand-ins, and the stand-in moveset |
| Current moveset (`others`) | the last 4 level-up moves at L50 | redundancy (`2× type`, `hasSetup` × 0.3), which slot it is weighed against |
| Ability index, passive | first ability, no passive | STAB/Adaptability, Technician, -ate, Huge Power |
| IVs, nature | neutral | the Atk / SpA fit |
| Friendship | 0 | Return / Frustration |
| Party, roster, doubles share | itself; none; 0 | Beat Up, sun charge; status fit against the foes ahead (judged blind) |

**On judgement, no.** Run as is, it misranks the moves a rare slot is valued for:

- **Setup is priced as one hit.** `setupOf` (`hud/40-learn.js:85-104`) gives +1 in a main stat 30 power, +1 Spe 20,
  and ×0.3 when the moveset already holds a setup move.
  - Dragon Dance on Garchomp is therefore 50, against Bite. Quiver Dance on Galvantula is 60, against Leech Life.
    Both come out *skip*.
  - Shell Smash's six stages reach 160 and win everywhere.
  - Across all 146 status rare moves the median gain is 35, against 89 for the 425 damaging ones. Setup is worth what
    the boosted attacks after it deal, which a per-slot score has no term for.
- **Some heals and effects go unseen.** Strength Sap heals through `HitHealAttr` (`src/data/moves/move.ts:11618`).
  `statusScore` counts only `HealAttr` and `VariableHealAttr` (`hud/40-learn.js:337`), so it scores 8 (the foe's
  −1 Atk) on all 11 starters that hold it.
  - Shed Tail (`AddSubstituteAttr`, `:12518`) scores 12.
  - Revival Blessing, Topsy-Turvy, Pain Split, Electrify and Sketch are unscorable (`value: null`,
    `hud/40-learn.js:376`), 12 of 571 in all.
- **Combos are invisible.** Stored Power on Venomoth is *skip*, because the card does not see Quiver Dance coming.
- **It depends on the guessed level.** The stand-in moveset changes with level. The rank correlation of the 559
  scorable rare moves is 0.65 between L30 and L50, and 0.67 between L50 and L80.

The TM advice already works around the setup bias: `tmAdvice` takes a setup move that fits even with no gain
(`hud/52-shop.js:58`). The Memory Mushroom advice (`tmRelearners`, `hud/52-shop.js:37`) only answers who *can*
relearn a move, so it has no quality judgement to reuse. A usable egg-move weight needs a setup model that prices
stages against the final form's own best attack over several turns, plus valuations for the unseen heals and
utility. **That is a second model**, and status moves are 146 of 571 rare egg moves (26 %).

### The nine 1.12.1.0 rare-slot changes (#725, PR #740)

The old and new rare move on the same stand-in final. "Card says" compares the two gains, within ±15 a sidegrade.

| Starter → final | Stand-in moves | Before | gain | After | gain | Card says | #740 said |
|---|---|---|---|---|---|---|---|
| Milcery → Alcremie | Dazzling Gleam, Recover, Misty Terrain, Entrainment | Geomancy | learn +60 | Sparkly Swirl | learn +103 | stronger (+43) | much weaker |
| Sewaddle → Leavanny | X-Scissor, Entrainment, Swords Dance, Leaf Storm | Victory Dance | skip 0 | Bitter Blade | learn +57 | stronger (+57) | weaker |
| Seel → Dewgong | Brine, Take Down, Dive, Aqua Tail | Steam Eruption | learn +51 | Bouncy Bubble | learn +11 | weaker (−40) | weaker |
| Manaphy → Manaphy | Dazzling Gleam, Aqua Ring, Dive, Take Heart | Origin Pulse | learn +88 | Wildbolt Storm | learn +81 | sidegrade (−7) | loses STAB nuke |
| Latias → Latias | Wish, Reflect Type, Zen Headbutt, Dragon Pulse | Mystical Power | learn +29 | Sparkly Swirl | learn +27 | sidegrade (−2) | sidegrade |
| Great Tusk → Great Tusk | Brick Break, Stomping Tantrum, Knock Off, Earthquake | Shift Gear | skip −14 | Collision Course | learn +49 | stronger (+63) | sidegrade |
| Zangoose → Zangoose | X-Scissor, Taunt, Swords Dance, Close Combat | Tidy Up | skip −15 | Extreme Speed | learn +151 | stronger (+166) | sidegrade |
| Corsola → Corsola | Power Gem, Mirror Coat, Earth Power, Flail | Salt Cure | learn +16 | Strength Sap | skip −24 | weaker (−40) | sidegrade |
| Dondozo → Dondozo | Body Slam, Aqua Tail, Rain Dance, Order Up | Salt Cure | learn +47 | Soft-Boiled | learn +40 | sidegrade (−7) | sidegrade |

It agrees with #740 on Seel, Latias and Dondozo. Some disagreements have a reason:

- Leavanny and Zangoose already know Swords Dance at L50, so a second setup move is redundant.
- Great Tusk's Collision Course is a 100-power STAB move, against Shift Gear's one-hit price.

Milcery's flip is the setup bias plainly: +2 SpA/SpD/Spe is priced at about one Sparkly Swirl.

### Sample of strong and weak rare egg moves

*Why these moves:* the strong list is moves commonly cited by players as top rare egg moves (community consensus, not
evidence). The weak list is moves whose use to that final form is doubtful by inspection: a utility or support move on
an attacker, or a move needing a combo. The derived weight is what question 3 replays.

| Starter → final | Rare egg move | Cat. | Learn card | vs | Derived weight (flat 6) |
|---|---|---|---|---|---|
| Gible → Garchomp | Dragon Dance | status | skip −26 | Bite | 0.0 |
| Joltik → Galvantula | Quiver Dance | status | skip −13 | Leech Life | 0.0 |
| Oshawott → Samurott | Shell Smash | status | learn +130 | Encore | 9.9 |
| Lapras → Lapras | Shell Smash | status | learn +135 | Safeguard | 10.3 |
| Mew → Mew | Shell Smash | status | learn +150 | Barrier | 11.4 |
| Tarountula → Spidops | Spore | status | skip +3 | Circle Throw | 0.2 |
| Oddish → Vileplume | Spore | status | learn +45 | Lucky Chant | 3.4 |
| Elekid → Electivire | Shift Gear | status | learn +63 | Screech | 4.8 |
| Beldum → Metagross | Shift Gear | status | learn +54 | Scary Face | 4.1 |
| Mankey → Annihilape | No Retreat | status | learn +68 | Screech | 5.2 |
| Magikarp → Gyarados | Dragon Ascent | physical | learn +126 | Bounce | 9.6 |
| Squirtle → Blastoise | Origin Pulse | special | learn +102 | Iron Defense | 7.8 |
| Larvesta → Volcarona | Sandsear Storm | special | learn +97 | Screech | 7.4 |
| Spinarak → Ariados | Strength Sap | status | skip −71 | Cross Poison | 0.0 |
| Gulpin → Swalot | Strength Sap | status | skip −64 | Poison Jab | 0.0 |
| Ekans → Arbok | Shed Tail | status | skip −61 | Sludge Bomb | 0.0 |
| Guzzlord → Guzzlord | Shed Tail | status | skip −75 | Body Slam | 0.0 |
| Stunky → Skuntank | Parting Shot | status | skip −8 | Venom Drench | 0.0 |
| Venonat → Venomoth | Stored Power | special | skip −17 | Sleep Powder | 0.0 |
| Emolga → Emolga | Electrify | status | unscorable | Agility | 6.0 |
| Luvdisc → Luvdisc | Revival Blessing | status | unscorable | Aqua Ring | 6.0 |
| Sableye → Sableye | Topsy-Turvy | status | unscorable | Night Slash | 6.0 |
| Shuckle → Shuckle | Pain Split | status | unscorable | Stone Edge | 6.0 |

Damaging nukes and Shell Smash are ranked sensibly. Weak utility moves land at 0, but so do Dragon Dance and Quiver
Dance on their best-known users. Across all rare moves, gain quartiles are 40 / 74 / 106 and the derived weight runs
1.1 (p10) to 10.5 (p90): 27 rare moves weigh 0, 29 hit the cap of 12.

The game's own moveset generator is no help here. It weighs every rare egg move at 5/6 of a common one, whatever the
move (`getEggMoveWeight`, `src/ai/ai-moveset-gen.ts:238-248`), and scales damaging moves by power and stat fit
(`adjustDamageMoveWeights`, `:443`). That is a flat rare weight too, with the learn card's blind spot for setup.

## 2. Passives

### Signals, on the 572 starters' final-form passives

The final-form passive is the one the card names since #740: `getPassive(final, 0)`,
`src/data/species-data-registry.ts:236`.

| Signal | Starters | Candidate weight | Example passives | Read from |
|---|---|---|---|---|
| none: no generic signal | 471 (82 %) | 8 | Tough Claws, Adaptability, Intimidate, Regenerator, Multiscale, Sheer Force | — |
| immunity | 42 (7 %) | 12 when the final is weak to the type, 8 otherwise (5 if it resists) | Levitate, Water Absorb, Sap Sipper, Earth Eater, Flash Fire, Lightning Rod | `TypeImmunityAbAttr.immuneType` (`src/data/abilities/ab-attrs.ts:406`), `UngroundedAbAttr` (`:216`) |
| weather setter | 26 (5 %) | 11 when it boosts the final's type, 6 otherwise | Drizzle, Drought, Sand Stream, Snow Warning, Desolate Land | `PostSummonWeatherChangeAbAttr.weatherType` (`:2576`) |
| terrain setter | 17 (3 %) | 11 / 6, the same rule | Psychic Surge, Grassy Surge, Electric Surge, Misty Surge, Hadron Engine | `PostSummonTerrainChangeAbAttr` (`:2602`) |
| no battle effect | 9 (2 %) | 1 | Honey Gather, Pickup, Run Away | `MoneyAbAttr`, `PostBattleLootAbAttr`, `RunSuccessAbAttr` |
| ally-only | 7 (1 %) | 1 | Friend Guard, Power Spot, Hospitality | `AlliedFieldDamageReductionAbAttr`, `AllyMoveCategoryPowerBoostAbAttr`, `PostSummonAllyHealAbAttr` |

The 156 distinct passives on final forms use 112 attribute classes. The big classes are parametric with a closure
condition, so the class says nothing about strength:

- `MovePowerBoostAbAttr`, on 80 starters: Tough Claws, Sheer Force, Iron Fist, Technician, Reckless, Analytic.
- `ReceivedMoveDamageMultiplierAbAttr`, on 62: Fur Coat, Multiscale, Filter, Solid Rock, Ice Scales.
- `StatMultiplierAbAttr`, on 22: Huge Power, Chlorophyll, Swift Swim, Hustle, Compound Eyes.

Reading the condition means running it on a battle, or a per-ability table, which is (b) under another name.

### What survives a pin bump (`history.json`, 47 tags)

- **Ally-only and out-of-battle classes:** present at every tag. The ally and out-of-battle names are in no release's
  add/remove list, so they existed throughout (*inferred* from the diff).
  - `AlliedFieldDamageReductionAbAttr`, `AllyMoveCategoryPowerBoostAbAttr` and `RunSuccessAbAttr` were checked
    directly.
  - Two blind spots: a classifier keyed on class names misses ally-only abilities written as a conditional attribute
    (Plus/Minus: `conditionalAttr(… currentBattle.double …, StatMultiplierAbAttr …)`,
    `src/data/abilities/init-abilities.ts:483-502`), and Telepathy (`MoveImmunityAbAttr`, `:972`). Neither is a
    final-form passive at the pin.
- **Weather and terrain setters:** `PostSummonWeatherChangeAbAttr` and `PostSummonTerrainChangeAbAttr` are present at
  every tag. The weather → boosted type map is game mechanics, not balance.
- **Immunities: broke once.** Levitate moved from `AttackTypeImmunityAbAttr` to the new `UngroundedAbAttr` in
  v1.12.1.0, so a classifier keyed on Levitate's class would have broken at exactly that release.
  - The `immuneType` field is private TS state, a second thing to keep up.
  - The HUD already keeps a name-keyed table for this (`ABILITY_IMMUNE`, `hud/01-core.js:26`).
- **Attribute classes overall:** 9 of 46 releases added or removed classes, three of them renames (`DamageBoostAbAttr`
  → `MoveDamageBoostAbAttr` in v1.11.3, `IncreasePpAbAttr` → `IncreasePpUsedAbAttr` in v1.12.0.8, and part of v1.11.7).

### Cost of a curated tier list per pin bump

| Line | Releases | Rare slots changed | Starter passives changed (form 0) | Attr classes +/− |
|---|---|---|---|---|
| 1.10 | 7 | 1 | 1 | +1/−0 |
| 1.11 | 23 | 32 | 20 | +6/−6 |
| 1.12.0 | 12 | 74 | 36 | +3/−2 |
| 1.12.1 | 4 | 9 | 4 | +2/−1 |

- **Per release:** rare slots mean 2.5, median 0, max 73 (v1.12.0.0). Starter passives mean 1.3, median 0, max 34.
- **Releases with a rare-slot change:** v1.10.2 (1), v1.11.0 (14), v1.11.7 (18), v1.12.0.0 (73), v1.12.0.2 (1),
  v1.12.1.0 (9).
- **This repo's bumps:** 1.12.0.11 → 1.12.1.1 (9 rare, 4 starter passives, 10 passives counting evolutions), then
  1.12.1.2 (one common slot) and 1.12.1.3 (nothing).
- **Cost, inferred from these counts:**
  - Writing the table once: ~571 rare-move rows, plus a tier for ~156 distinct passives, each judged per final form.
  - Upkeep: nothing on most bumps, 10–20 rows on a balance patch, and a near rewrite on a major one (v1.12.0.0
    changed 141 starters' egg moves and 64 species' passives).
  - Spotting the rows is mechanical, since `history.mjs`'s diff is already the pin-bump check. Re-judging them is not,
    and it needs an owner who plays.

## 3. Is it worth it?

Each run is the real `starterModel` with flat weights, then again with candidate weights. It counts how often the
`best` proposal's members differ ("best"), and how often any of the up-to-three proposals differ ("any"). The last
number in each cell is members swapped into `best` per account. There are 200 synthetic accounts per profile, and
`config.json` holds each profile's odds of a starter being caught and of each unlock. The profiles are assumptions,
not measured players.

| Account profile | Accounts | egg | egg (damaging only) | passive | passive (inert only) | both | control: shuffled egg |
|---|---|---|---|---|---|---|---|
| fixture | 1 | 100 % best · 100 % any · 2 | 100 % · 100 % · 2 | 0 % · 0 % · 0 | 0 % · 0 % · 0 | 100 % · 100 % · 2 | 100 % · 100 % · 2 |
| early | 200 | 14 % best · 34 % any · 0.24 | 11 % · 27 % · 0.2 | 5 % · 16 % · 0.1 | 0 % · 1 % · 0 | 17 % · 41 % · 0.32 | 12 % · 30 % · 0.23 |
| mid | 200 | 51 % best · 79 % any · 0.93 | 38 % · 69 % · 0.71 | 28 % · 56 % · 0.46 | 2 % · 8 % · 0.03 | 54 % · 86 % · 0.98 | 48 % · 78 % · 0.94 |
| late | 200 | 81 % best · 97 % any · 1.82 | 76 % · 93 % · 1.63 | 53 % · 77 % · 1 | 8 % · 13 % · 0.14 | 83 % · 98 % · 1.79 | 88 % · 99 % · 2.01 |
| complete | 200 | 97 % best · 100 % any · 2.04 | 90 % · 98 % · 1.72 | 69 % · 91 % · 1.65 | 3 % · 4 % · 0.08 | 97 % · 100 % · 2.56 | 100 % · 100 % · 2.41 |

The columns:

- **egg:** the derived egg weight.
- **egg (damaging only):** derived for damaging rare moves; status ones stay at 6, as the TM advice's setup rule
  would have it.
- **passive:** the signal table's weights.
- **passive (inert only):** only the 16 inert passives drop to 1.
- **both:** egg plus passive.
- **control: shuffled egg:** the derived egg weights handed to starters at random. Same spread, no information.

What it says:

- **The weights move proposals a lot.** The card's flat +6 and +8 are large next to the spread between near-equal
  candidates. Once an account has unlocks on many starters, almost any non-flat weight reorders the top picks. It is
  1.8 to 2.6 members swapped per proposal on late and complete accounts.
- **The change rate can't tell good weights from bad.** The shuffled control changes as many proposals as the derived
  weights do. So the question is whether the weight is *right*, and section 1 shows the derived egg weight is biased
  against setup. Turned on, it would steer most veteran proposals away from Dragon Dance Gible and Quiver Dance
  Joltik.
- **The fixture account:** Magikarp's Dragon Ascent (9.6) pulls Magikarp and Rattata into `best`, in place of Charmander and
  Squirtle (`Charmander+Gible+Squirtle` → `Gible+Magikarp+Rattata`). One account, and the shuffled control flips it
  too.
- **The inert-passive cut is safe:** it changes ≤ 8 % of best proposals, and only where an account's top pick leans
  on a Friend Guard or Honey Gather passive.

## 4. Recommendation: (c) keep flat, improve what the card tells the coach

A derived egg weight would be the learn card plus a second model for setup and utility moves. Its ranking moves with an
assumed level and moveset, it gets two of the nine 1.12.1.0 changes backwards, and the replay shows it would rewrite
most veteran proposals. A curated table (b) would be judged right, but it costs ~700 judgements up front and an owner
to re-judge tens to a hundred rows on each balance patch. It buys a judgement the coach is already told to make
(SKILL.md 🌱 Starter card: "Say what the card can't weigh…"). So the card should hand the coach the facts that
judgement needs, which it can read off the game's tables without scoring them. The one derived change that is
version-proof, cheap and plainly right is a near-zero weight for a passive that does nothing in a single battle.

**What the build ticket would contain:**

1. **The rare egg move's facts on its reason:** type, category and power, set against the final form, all read off
   `allMoves` and the final's types and base stats. Example: `rare egg move Dragon Dance (setup +1 Atk/Spe)`,
   `rare egg move Bouncy Bubble (60 Water special · STAB · weak SpA)`.
   - STAB on the final's types.
   - Whether the category matches its better attacking stat (the `fit` test, `hud/40-learn.js:451`).
   - `setup` with its stages when it is a self-boosting status move (`moveTraits(...).stages`).
   - No score.
2. **An inert passive gets weight ~1 and says why:** `passive Friend Guard (Minun) · ally-only, nothing in singles`.
   - The classifier is the attribute classes in *Terms*.
   - Add a test that each class still exists at the pin, in `scripts/hud-deps.ts`'s drift refs or the pin-bump skill.
3. **Immunities and weather/terrain setters named, not weighed:** for example
   `passive Levitate · immune to Ground, its weakness` and `passive Drought · sun boosts its Fire`. Read the
   immunity from `ABILITY_IMMUNE` (`hud/01-core.js:26`), which already has an owner.
4. **SKILL.md's 🌱 line updated** to say the card now names these facts, and that a setup or utility rare move, or a
   passive's real worth, is still the coach's call.
5. **Out of scope:** a derived or curated weight for egg moves or for passives beyond the inert cut, and the
   multi-form starting form (#776).

## What was measured and what was inferred

- **Measured:**
  - every score and table above, on the pinned game data through the HUD's own code;
  - the upstream churn per release;
  - the attribute-class presence for the nine watched classes;
  - the proposal-change counts on the synthetic accounts.
- **Inferred:**
  - The other inert classes' presence at every tag, from their absence in every release's add/remove list.
  - The cost of a curated list, from the churn counts.
  - Which moves are "strong" in the sample, from community consensus, labelled as such.
  - The synthetic profiles' unlock odds, which are assumptions.
- **Not measured:**
  - Whether any weighting picks *better* teams. There is no ground truth short of playing runs.
  - Real accounts, which are out of bounds on a public repo.
  - The stand-in moveset as a player would build it: egg moves and TMs change `others`.

## Reproduce

```sh
ln -s <main-checkout>/.cache .cache
node docs/research/742-starter-unlock-quality/run.mjs
node docs/research/742-starter-unlock-quality/history.mjs
node docs/research/742-starter-unlock-quality/analyze.mjs
```

The first command needs the provisioned clone at `.cache/pokerogue/v1.12.1.3`; in a worktree, link the main
checkout's `.cache` as shown. `run.mjs` takes about a minute and writes `results.json`. `history.mjs` needs `gh` and
caches under `/tmp/742-history-cache`. `analyze.mjs` prints these tables and writes `analysis.json`. The one unhandled
`getItem` error in the vitest output is the clone's own i18n rejection (game-code.md §13).
