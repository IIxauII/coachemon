# What PokéRogue's mechanics say about a newcomer's real worth

Research for [#557](https://github.com/IIxauII/coachemon/issues/557), on the map
[#555 Judging a newcomer against the party](https://github.com/IIxauII/coachemon/issues/555). The question: **which game
mechanics change what a would-be newcomer is actually worth against the party member it would replace**, and so make
projected final BST (`finalBstOf` in `skills/coachemon/scripts/hud/08-party.js`) a poor stand-in for in-run value?

This file collects evidence and implications only. It decides nothing. The base model is for the map to choose.

**Sources.** Every game claim was read in the pinned PokéRogue source, tag `v1.12.0.11` (the `.cache` clone). Paths
are relative to its `src/`. Where `skills/coachemon/references/game-code.md` already covers a mechanic, its section is
named as well. Numbers marked **[derived]** come from the source's own formulas and were computed for this note. No
number here was measured in a live game.

Vocabulary is `CONTEXT.md`: **party**, **party profile**, **member**, **newcomer**, **fusion**, **wave**, **run
calendar**, **preview**. A *catch* is a newcomer from a thrown ball. A *starter* is a member picked on the starter grid.

---

## 0. The answer, ranked

Ranked by how much each mechanic moves a newcomer's value relative to a member's, largest first:

| # | Mechanic | Who it favours | Rough size | What the model needs |
|---|---|---|---|---|
| 1 | **Level.** A wild catch joins at the wave's wild level. Stats scale linearly with level, and both damage dealt and hits survived scale with roughly its square. | the member | ~20–25 % lower level than a party at the cap, so about 0.6× the combat output, from wave ~50 to the end | compare at actual level, quadratically, and project how the gap closes |
| 2 | **What the release destroys.** Every held item on the released member is deleted, and the release prompt has no transfer. Vitamins, Macho Brace, Shuckle Juice, Old Gateau and form-change items cannot be moved at all. | the member | from nothing to a run's worth of items | count the items at stake on the member to be replaced |
| 3 | **Passive ability.** Only starters can have one. A catch never has one, even a caught boss. | the member (starters) | one ability's worth, from nothing to decisive | read `hasPassive()` on the member, and assume false for a catch |
| 4 | **Moves.** A wild catch has a random level-up-only moveset, with no TMs and no egg moves, and can never relearn egg moves. A starter's moveset was chosen and may hold egg moves. | the member | coverage and power. TMs and the Memory Mushroom only partly repair it | judge the moves the mon actually knows, not its typing |
| 5 | **IVs, nature, ability.** Starters use the account's best IVs per stat, a chosen nature and a chosen ability. A catch rolls uniform IVs, a random nature and a 1/256 hidden ability. | the member (starters) | IVs alone are worth about 46 BST at the cap [derived] | use live stats, not base stats |
| 6 | **Evolution timing.** An evolution needs a level-up (that is, EXP) or a drawn item. A member at the cap can't level, and item evolutions are not free. | either | whether the projected final BST is reached at all, or reached late | discount projected BST by how far away the evolution is |
| 7 | **What a catch brings.** A wild mon's held items (berries, vitamins, type boosters, Lucky / Golden Egg) join with it. A shiny adds luck. | the newcomer | small to moderate | count them |
| 8 | **Small terms.** Pokérus (1.5× EXP, starters, spreads), friendship, joining at its current HP and status, Tera type (a wash). | mostly the member | small | ignore, or add as tie-breakers |
| — | **Account value is banked before the keep / release choice.** | n/a | n/a | keeping the newcomer is a pure team-value question |

Read together, one simple change covers 1, 5 and part of 2. Judge each member on its **live stats**, `pokemon.stats`.
These already fold in level, IVs, nature, vitamins and the other base-stat items. For a catch, read the same field off
the `EnemyPokemon`. Then add explicit terms for what live stats leave out: passive, moves, held items lost on release,
how soon the level gap closes, and how soon an evolution lands. Details and sources follow.

---

## 1. Level: the dominant term

### 1.1 Where a newcomer's level comes from

- **A wild catch** joins at its own level (`EnemyPokemon.addToParty`, `field/pokemon.ts:7035`, passes `this.level` to
  `addPlayerPokemon`). That level comes from `Battle.getLevelForWave` (`battle.ts:131`):
  `1 + w/2 + (w/25)²` for the difficulty wave `w`, plus a small non-negative Gaussian offset (`:153–156`). On a
  boss wave (`w % 10 === 0`, `game-mode.ts:313`) it is `floor(base × 1.2)` ± `floor(w/10)` (`battle.ts:139–148`).
- **The level cap** is `getMaxExpLevel` (`battle-scene.ts:2310`, game-code.md §15):
  `ceil((1 + r/2 + (r/25)²) × 1.2 / 2) × 2 + 2`, where `r` is the wave rounded up to the next 10. That is about the
  **boss** level of the current decade.
- **Mystery Encounter joins** (Uncommon Breed, and Absolute Avarice's Greedent) come at the *highest party level − 2*
  (`data/mystery-encounters/encounters/uncommon-breed-encounter.ts:66`, `absolute-avarice-encounter.ts:381`). The
  Safari Zone uses the wave's wild level (`safari-zone-encounter.ts:295`). A Global Trade System offer has the traded
  member's level, and a Weird Dream transform keeps each member's level (game-code.md §13).
- **Starters** start at 5, or 20 in Daily (`game-mode.ts:137`).

So the handicap depends on where the newcomer came from. Wild catches on ordinary waves carry it. Boss catches and the
"top − 2" encounters barely do.

**[derived]** A wild catch against a party sitting at the cap, classic (`getWaveForDifficulty` is the wave itself),
with the Gaussian offset left out:

| wave | wild level | cap | gap | level ratio | ≈ output ratio (ratio²) | boss on the decade's last wave |
|---|---|---|---|---|---|---|
| 15 | 9 | 16 | 7 | 56 % | 32 % | 20: 13 |
| 35 | 20 | 32 | 12 | 63 % | 39 % | 40: 28 |
| 55 | 33 | 48 | 15 | 69 % | 47 % | 60: 44 |
| 75 | 48 | 64 | 16 | 75 % | 56 % | 80: 61 |
| 95 | 63 | 84 | 21 | 75 % | 56 % | 100: 80 |
| 115 | 80 | 104 | 24 | 77 % | 59 % | 120: 100 |
| 135 | 98 | 126 | 28 | 78 % | 60 % | 140: 122 |
| 155 | 117 | 150 | 33 | 78 % | 61 % | 160: 146 |
| 175 | 138 | 174 | 36 | 79 % | 63 % | 180: 171 |
| 195 | 159 | 200 | 41 | 80 % | 63 % | 200: 198 |

The cap is a ceiling. A party below it has a smaller gap, so this table is the worst case. Two things follow:

- The absolute gap grows with the wave. `partyReasons` only calls a newcomer an upgrade within 10 levels
  (`UPGRADE_LEVEL_GAP`), so against a party near the cap **no ordinary wild catch can be an "upgrade" after about wave
  30**. The ratio, by contrast, is roughly constant (about 0.75–0.8) from mid-run on, so a ratio is the right shape for
  this rule.
- A **boss catch** on an X0 wave arrives within a few levels of the cap. The pinned source makes it catchable only on
  its last bar unless a Master Ball is used (game-code.md §20). It is the one wild newcomer with no level handicap.

### 1.2 Why level counts roughly quadratically

- Stats: `floor((2·base + iv) · level / 100) + 5`, and HP adds `level + 10` (`Pokemon.calculateStats`,
  `field/pokemon.ts:1584–1586`). Every stat is linear in level.
- Damage: `levelMultiplier = 2·level/5 + 2` (`:3427`), and `baseDamage = levelMultiplier · power · atk / def / 50 + 2`
  (`:3470`). The attacker's level enters twice: through the multiplier and through its attack stat.
- So against the same foe, **damage dealt ∝ level² × attacking base stat**. **Hits survived ∝ HP × defence ∝ level² ×
  bulk base stats**. At a level ratio of 0.8 a newcomer deals and absorbs about 0.64× what a same-species member
  would. Equal raw stats would need its base stats 25 % higher, and equal output needs 56 % higher. Speed is linear in
  level, and since it is a threshold it does not average.

BST says none of this. A 600-BST catch at 0.8× the level is worse than a 500-BST member at full level in raw stats
(480 against 500 equivalent) and much worse in damage.

### 1.3 How fast the gap closes

- **EXP per foe ignores the victor's level**: `getExpValue` is `baseExp · foeLevel / 5 + 1` (`field/pokemon.ts:5209`,
  where the comment notes that victor level was removed). Every recipient therefore gets the same absolute EXP, and a
  lower-level mon gains more *levels* from it because the curves are about cubic (`data/exp.ts:67–104`: MEDIUM_FAST
  is `L³`, and other curves are blended `0.325 × own + 0.675 × L³`).
- **Who gets EXP** (`applyPartyExp`, `battle-scene.ts:3332`, game-code.md §17): only non-fainted members **below the
  cap** (`:3346`). A participant gets `1 / participants`. A non-participant gets nothing, or `0.2 × EXP. All stacks /
  participants` with EXP. All (`:3388`). Pokérus multiplies by 1.5 (`:3390`), a held Lucky / Golden Egg adds 40 % /
  100 % (`:3397`, `modifier/modifier-type.ts:2010–2011`), and EXP Charms multiply later in `ExpPhase`. When the party
  is at the cap the members' shares are lost, not passed on, so the newcomer gains no faster.
- **[derived] The cubic curve makes the gap slow to close.** To draw level from a fraction `f` of a member's level, a
  newcomer needs `(1 − f³)` of that member's lifetime EXP: 49 % at `f = 0.8` and 58 % at `0.75`. When both gain the
  same stream, a newcomer at 0.8 reaches only 0.88 by the time the member has gained another 50 % of its lifetime EXP,
  and 0.91 after +100 %. In practice a wild catch that is not force-fed fights (or EXP. All stacks) stays about 10–20 %
  behind for dozens of waves. A toy simulation (one foe a wave, base EXP 150–250, newcomer the sole participant) never
  closed the gap to the cap before wave 200 from any catch wave past 20. Treat that as directional: real runs have
  trainers, doubles, charms and eggs.
- **Rare Candy** (COMMON, weight 2, `modifier/init-modifier-pools.ts:67`) adds `1 + Candy Jar stacks` levels to one
  member, ignoring the cap (`PokemonLevelIncrementModifier.apply`, `modifier/modifier.ts:2263`). It is the only direct
  level transfer. **Rarer Candy** (ULTRA, weight 4, `:544`) levels everyone, so it does not close a gap.

**Implication.** Value the newcomer at its current level against the member's, roughly as `(L_new / L_member)²` on
output, with a closure term that depends on EXP routing (EXP. All stacks, Lucky Egg, whether the coach will feed it
fights). Do not use a fixed window of levels. A boss catch or a "top − 2" join needs no discount.

---

## 2. What the release destroys

### 2.1 The flow

`AttemptCapturePhase.catch` (`phases/attempt-capture-phase.ts:243`, game-code.md §20):

1. Calls `setPokemonCaught` **before** any keep / release choice (`:311`). The dex entry, candy and IVs are banked
   whatever happens next.
2. With a full party (`:317`) it offers: keep (`PartyUiMode.RELEASE`, `:377`), view summary, view Pokédex, or don't
   keep (`removePokemon`, `:392`).
3. Picking a member to release runs `PartyUiHandler.doRelease` (`ui/handlers/party-ui-handler.ts:1753`). That calls
   `removePartyMemberModifiers(slot)` (`:1759`; `battle-scene.ts:2665`), which **deletes every held item whose
   `pokemonId` is the released member**. The member is destroyed, and the newcomer goes into the freed slot
   (`addToParty(slotIndex)`).
4. In `RELEASE` mode the party screen offers only RELEASE and the common options (`party-ui-handler.ts:1469–1471`).
   There is no item transfer.

A Mystery Encounter catch runs the same prompt (`data/mystery-encounters/utils/encounter-pokemon-utils.ts:685–793`).

### 2.2 Saving the items, and what cannot be saved

- **Transferable** held items can only be moved on a **rewards screen**, through its Transfer option
  (`SelectModifierPhase.openModifierTransferScreen`, `phases/select-modifier-phase.ts:212`). That screen only moves
  `isTransferable` items (`:227`). It is not reachable mid-battle, where the catch happens. So an item gets saved only
  if it was moved off the member before the catch wave. A coach can recommend that when a **preview** shows a wild
  worth catching next wave.
- **Non-transferable**, and so always lost with the member (`modifier/modifier.ts`, `isTransferable = false`): vitamins
  (`BaseStatModifier`, `:815`), Shuckle Juice (`PokemonBaseStatTotalModifier`, `:929`), Old Gateau
  (`PokemonBaseStatFlatModifier`, `:990`), Macho Brace (`PokemonIncrementingStatModifier`, `:1059`), Mega stones and
  other form-change items (`PokemonFormChangeItemModifier`, `:2783`), the Gimmighoul tracker (`EvoTrackerModifier`,
  `:869`), Mini Black Hole (`TurnHeldItemTransferModifier`, `:3223`), and the lapsing items (`:761`).
- Also gone are investments that are not items: a mint's nature (`customPokemonData.nature`, game-code.md §15), TMs
  taught (`usedTMs`), Memory Mushroom relearns, Rare Candies spent, an evolution item spent, a Tera Shard's type, Macho
  Brace stacks and friendship.
- Vitamins and the base-stat items already show up in `calculateBaseStats` and hence in `finalBstOf`. The model sees
  them as BST but not as **lost on release**.

**Implication.** Add a release cost for the member to be replaced: its transferable held items (lost unless moved at
an earlier rewards screen) plus its untransferable investment. A free slot has no release cost. A fusion, which spends a
member differently, keeps the second pick's items up to the base's stack limits (game-code.md §24).

---

## 3. Passive abilities: starters only

- `Pokemon.hasPassive()` (`field/pokemon.ts:2196`) is true for the `passive` field, for any boss, and for the overrides
  and Daily custom data.
- A starter's `passive` is set on the grid when the account has it unlocked and enabled
  (`phases/select-starter-phase.ts:77–78`, game-code.md §23).
- A catch copies the enemy's `passive` field (`dataSource.passive`, `field/pokemon.ts:361`). A wild enemy never sets
  it: its passive in battle comes only from `isBoss()`. So **a caught pokémon has no passive, and a boss loses the one
  it fought with**, even when the account has that species' passive unlocked.
- The only in-run grants are Weird Dream's battle option (one random member without one, `weird-dream-encounter.ts:315`)
  and a few encounter mons configured with one (Absolute Avarice's Greedent, `:395`). Fusion keeps the base's passive
  (game-code.md §24). Under the Passives challenge at value 2, `applyPassiveAccess` grants every mon one
  (`data/challenge.ts:1201–1208`). Fresh Start turns every passive off (`:915`).

**Implication.** A member with a passive is worth an extra ability. Read `member.hasPassive()` and
`member.getPassiveAbility()`, and treat a wild catch as having none. How much it is worth depends on the ability, so
the model needs at least a flag and at best an ability score.

---

## 4. Moves: chosen against random

- **Wild movesets**: `generateMoveset` (`ai/ai-moveset-gen.ts:1221`) uses the level-up pool only. TMs and egg moves
  are drawn only `if (hasTrainer)` (`:1236–1247`), and egg moves also need a trainer config allowing them and level
  ≥ 80 (`:293`, `data/balance/moves/moveset-generation.ts:59`). A wild catch therefore knows four weighted-random
  level-up moves, with STAB forced (`forceStabMove`, `:634`), and no coverage from TMs or egg moves.
- **Starters** enter with the moveset picked on the grid (`select-starter-phase.ts:74–75`), which may include unlocked
  egg moves. Only a mon with `metBiome === -1`, that is a starter, can relearn its unlocked egg moves
  (`Pokemon.getLearnableLevelMoves`, `field/pokemon.ts:1925`, game-code.md §17). A catch can never learn them.
- Both can be taught any compatible TM and relearn level moves with a Memory Mushroom, so part of the gap can be
  repaired with rewards.

**Implication.** Judge on the moves the newcomer actually knows (the live `moveset` is readable on the wild mon), not
on its species typing. `partyReasons` already takes `cand.moveTypes` for its "hole" reason, but its upgrade test is
BST alone.

---

## 5. IVs, nature, ability

- **IVs.** A wild mon's come from its id, five bits each, uniform 0–31 (`getIvsFromId`, `utils/common.ts:191`;
  `field/pokemon.ts:399`). A starter gets the account's dex IVs, the best ever seen for each stat
  (`updateSpeciesDexIvs` takes a per-stat max, `system/game-data.ts:2010–2023`). Fresh Start caps them at 15.
  **[derived]** In `(2·base + iv)·L/100`, one IV point is worth half a base point. A catch averaging 15.5 against a
  starter at 31 is about 7.75 base points down per stat, **≈ 46 BST** in total, at any level.
- **Nature.** Wild is random (`generateNature`). A starter's is picked from the natures unlocked
  (`starter-select-ui-handler.ts:2605`). A mint fixes it on either.
- **Ability.** Wild is ability 1 or 2 at random, hidden 1 / 256 (`BASE_HIDDEN_ABILITY_RATE`, `data/balance/rates.ts:13`;
  `generateAbilityIndex`, `field/pokemon.ts:635`). The Ability Charm improves those odds. A starter's is chosen from
  the abilities unlocked. In-run fixes are only encounter options (Training Session's heavy option, Weird Dream).

**Implication.** Live stats (`pokemon.stats`) include IVs and nature, which BST does not. Ability quality needs its own
term, or at least the hidden-ability flag.

---

## 6. Evolution timing

- **Wild spawns arrive evolved, probabilistically.** `determineEnemySpecies` (`ai/ai-species-gen.ts`) evolves a wild
  spawn once its level is past `randSeedIntRange(req, round(req × 1.2))` (`WILD_LEVEL_DIFF_PERCENT`, `:19`). A catch
  can therefore be unevolved at up to 1.2× its evolution level.
- **A player mon evolves on a level-up**: `LevelUpPhase` calls `getEvolution()` (`phases/level-up-phase.ts:106–110`).
  That runs `validate` (`data/balance/pokemon-evolutions.ts:302`), which needs `level ≥ ev.level`, the form, any
  condition and **no item**. So:
  - a catch already past its evolution level evolves on its **next** level-up, which needs EXP or a Rare Candy;
  - a member **at the cap** gets no EXP and can't evolve until the cap moves, unless given a Rare Candy;
  - **item evolutions** need the item to be drawn (`EvolutionItemModifierType`, game-code.md §15). `stagesLeft` in
    `08-party.js` counts every entry of `getEvolutionLevels()`, item evolutions included, so `finalBstOf` projects an
    item evolution as if it were free.
- An Eviolite (×1.5 Def / SpD while the mon can still evolve, game-code.md §15) makes an unevolved member better than
  its BST.

**Implication.** Projected final BST should be discounted by distance: levels to go given the EXP routing, or whether
an item is needed. An evolution one level-up away is close to certain. An item evolution is uncertain.

---

## 7. What a catch brings

- **Held items.** On a catch, every enemy `PokemonHeldItemModifier` is re-added as the player's
  (`attempt-capture-phase.ts:296–301`). The catch keeps the enemy's `id` (`field/pokemon.ts:357`), so its items stay
  attached to it. Wild mons roll `ceil(w/10)` item chances, at 1 / 18 each in classic or 1 / 6 for a boss, which
  always has at least half of them (`battle-scene.ts:2679–2740`, `game-mode.ts:400–405`). The draws come from the wild
  pool (`init-modifier-pools.ts:35–58`): berries, vitamins, type boosters, the **Lucky Egg** and the **Golden Egg**. An
  egg speeds up exactly the catch-up §1.3 needs. These items can be read on the foe before the throw.
- **Luck.** A shiny catch adds `variant + 1` luck (`field/pokemon.ts:441`, game-code.md §12). Party luck, capped at 14,
  raises reward tiers, so releasing a shiny member costs luck. `partyLuck` in `08-party.js` already computes this.

---

## 8. Small terms

- **Pokérus**: a 1.5× EXP share (`battle-scene.ts:3390`). Starters can enter with it (`select-starter-phase.ts:84`), and
  it spreads to a neighbouring slot at 1 / 10 (`trySpreadPokerus`, `battle-scene.ts:2008`). A catch starts without it
  (`field/pokemon.ts:428`).
- **Friendship** starts at the species' base for both (`:423`) and grows with battles (`applyPartyExp`). It matters for
  friendship evolutions and Return / Frustration.
- **HP and status**: a catch joins with the HP and status it was caught at (`dataSource.hp` / `status`,
  `field/pokemon.ts:358`, `:368`). This is a short-term cost until the next heal.
- **Tera**: a catch's Tera type is one of its own types at random (`:444`). A starter's is one of its own types, chosen
  (`select-starter-phase.ts:91–95`; the grid only cycles type 1 and type 2, `starter-select-ui-handler.ts:2619–2634`).
  In classic, Terastallizing needs the Tera Orb from the wave-95 rival (`data/trainers/trainer-config.ts:5658`;
  `enums/fixed-boss-waves.ts:10`; `utils/pokemon-utils.ts:174`), with one Tera an arena. A Tera Shard (GREAT,
  `init-modifier-pools.ts:303`) retypes anyone. This is **a wash** between newcomer and member.
- **Challenges**: Limited Catch keeps a catch only if met on an X1 wave (game-code.md §20). Fresh Start strips starters
  of passive, egg moves, IVs above 15 and the hidden ability, which shrinks §3–§5 almost to nothing.

---

## 9. Account value is banked either way

`setPokemonCaught` and `updateSpeciesDexIvs` run before the keep / release prompt (`attempt-capture-phase.ts:270`,
`:311`). The dex entry, candy and IV unlocks are earned **whether or not the newcomer is kept**. The ball is the only
cost of catching. Keeping is then purely a team-value decision, which fits the map's split of account value onto its
own axis.

---

## 10. What this means for a team-value model

1. **Replace BST with live stats.** `pokemon.stats` already reflects level, IVs, nature, vitamins, Shuckle Juice and Old
   Gateau. The wild mon carries the same field. It is cheap to read every tick.
2. **Weight level quadratically for output and bulk**, or compute an offence × bulk product from live stats so that the
   square falls out by itself. Drop the fixed 10-level window: the absolute gap of a wild catch grows to about 40 levels
   by wave 195, while the ratio stays near 0.8.
3. **Add a closure term**: how many waves until the newcomer is near the party's level. It depends on EXP. All stacks,
   a held Lucky / Golden Egg, Pokérus, and whether it will fight. Boss catches and "top − 2" encounter joins need no
   such term.
4. **Add a release cost** for the member to be replaced: held items at stake (transferable ones only saved by an
   earlier transfer, untransferable ones always lost) plus sunk mints and TMs. It is zero for a free slot.
5. **Add flags the stats miss**: the member's passive, which a catch never has; the newcomer's moves against the
   member's (egg moves and TMs); hidden or better ability.
6. **Discount projected evolution** by distance and kind. A level evolution one level-up away counts almost fully. An
   item evolution, or one many levels off for a member at the cap, counts much less.
7. **Small terms** (luck, Pokérus, Tera, HP) are tie-breakers at most.

## Unverified

- The closure dynamics in §1.3 are derived from formulas. They do not account for real EXP inflow (trainer
  multiplicity, doubles, charms), and no live run was measured.
- How often a real party sits at the cap, as against well below it, is unknown. The table in §1.1 is the worst case.
- No numbers here put a value on a passive, an egg move or a hidden ability. Those are species-specific.
