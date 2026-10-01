# The exact key for the preview replay (#520)

Question (#520, for #511): which live run state does the **preview** replay (`hud/48-preview.js` `replay`, reached
through `previewFor` from `previewNext` and from the look-ahead's `aheadModel`) actually read at the pinned game
version, and so what is the exact key it should be memoised under? And what does the look-ahead's cheap remainder
(readiness, luck, Eternatus facts, `bigFightsAhead` / `nextHeal`) read?

Sources, all primary:

- Overlay: `skills/coachemon/scripts/hud/` as of master `4631a7b` (the hud tree last changed in `1fdbf75`; line
  numbers below are from it). `26-run.js`, `48-preview.js`, `49-ahead.js`, `08-party.js`, `01-core.js`,
  `03-calendar.js`, `47-biome.js`.
- Game: the pinned PokéRogue `v1.12.0.11`, `.cache/pokerogue/v1.12.0.11/src/`. Paths below are relative to that
  `src/`.

Method: every game call the replay makes was traced to the end, including the calls those make (trainer configs,
party templates, the `Pokemon` / `EnemyPokemon` constructors, moveset generation, the mystery-encounter picker and
every encounter-level requirement of all 31 encounters). The claim in #520 was treated as a hypothesis.

## 1. Verdict per claim item

| # | Claim item | Verdict | Overlay | Game |
|---|---|---|---|---|
| 1 | seed | **confirmed** | `48-preview.js:79,83` (`waveSeedOf(s.seed, w)`, `fork(s, w, s.seed)`) | `battle-scene.ts:2038-2058` (`resetSeed`, `executeWithSeedOffset`) |
| 2 | live wave | **confirmed, and read by the game too**, not only by the overlay's notes | `48-preview.js:145-147` (`here`) | `Battle` is built *outside* `withBattle` (`48-preview.js:111-112`), so `Trainer.getPartyLevels` → `getPartyTemplate` → `getWavePartyTemplate` / `getEvilGruntPartyTemplate` / `getGymLeaderPartyTemplate` read the live `currentBattle.waveIndex` (`field/trainer.ts:255-270`, `data/trainers/trainer-party-template.ts:254-290`); `getPlayerField` reads the live `currentBattle.double` (`battle-scene.ts:759-764`) |
| 3 | target wave | **confirmed** | `48-preview.js:75` | everywhere |
| 4 | `biomeId` | **amended**: the species roll reads the arena's pool, which is `(biomeId, arena.lastTimeOfDay)`, not the biome alone | `48-preview.js:18-20` | `field/arena.ts:546-562` (pool built at `lastTimeOfDay`), `:577-630` (`randomSpecies` reads `this.pokemonPool`); rebuilt only at X5 (`battle-scene.ts:1576-1578`), at a new arena and on load (`system/game-data.ts:1056-1062`, `arena.init` at the loaded wave) |
| 5 | `waveCycleOffset`, `offsetGym` | **confirmed, redundant**: both are derived from the seed | `26-run.js:16-17` | `battle-scene.ts:1110-1114` (`setSeed`), `:1940-1962` |
| 6 | party luck as one value (`getPartyLuckValue`, allowed members, `luck + fusionLuck`) | **confirmed, amended**: `fusionLuck` counts only on a fused mon; event terms are wall-clock; Daily is a seeded constant; read only for a **wild** species roll | `48-preview.js:18-20`, `08-party.js:65-79` | `modifier/modifier-type.ts:2906-2934`, `field/pokemon.ts:1815-1817` (`getLuck`), `:577-590` (`isAllowedInBattle` = `hp > 0` and the challenge hook), `battle-scene.ts:2326-2334` |
| 7 | count of applicable `DoubleBattleChanceAbAttr` on the live field | **confirmed, amended**: it is a count of *applications* (ability and passive each, so up to 2 per mon) on `party[0 .. live double ? 1 : 0]`, each gated by `canApplyAbility`: `hp > 0`, passive unlocked, Gastro Acid, the **Neutralizing Gas arena tag**, `arena.ignoreAbilities`, plus the live `summonData` ability (Skill Swap, Entrainment, Transform) | — (the replay calls the game) | `battle-scene.ts:1261-1269`, `data/abilities/apply-ab-attrs.ts:22-103`, `field/pokemon.ts:2247-2286`; the four abilities are Illuminate, Arena Trap, No Guard, Commander (`data/abilities/init-abilities.ts:380-382, 567-569, 716-718, 1930-1932`) |
| 8 | lure instances | **confirmed**: instances, not stacks; `battleCount` is not read | — | `battle-scene.ts:1263`, `modifier/modifier.ts` `DoubleBattleChanceBoosterModifier.apply` (`/= 4` per instance, stack count ignored) |
| 9 | Shiny Charm and Ability Charm **stacks** | **confirmed, amended**: Shiny Charm reaches wild foes only, and changes only the `shiny` field, never a draw. Ability Charm reaches **trainer foes too**: `hasTrainer()` is `!!this.trainerSlot`, which is still unset while the `Pokemon` constructor runs, so `generateAbilityIndex` treats every enemy as wild. Its range changes `abilityIndex`, which moveset generation reads, so it can move later draws | `48-preview.js:56-57` (ability, passive, shiny fields) | `field/pokemon.ts:635-649` (`generateAbilityIndex`), `:2865-2898` (`trySetShiny`), `:6354-6420` (`trainerSlot` set after `super`), `:6897-6899`; `modifier/modifier.ts` `ShinyRateBoosterModifier` (`2^(1+stacks)`), `HiddenAbilityRateBoosterModifier` (`2^(-1-stacks)`) |
| 10 | Bug Net presence | **confirmed** (max stack 1) | `48-preview.js:130, 180` | `phases/encounter-phase.ts:111-120` |
| 11 | Endless enemy-fusion stacks | **confirmed, amended**: read from `s.enemyModifiers`, which today's key never looks at. The modifier draws a `randSeedFloat` when present, so its presence shifts the stream and its stacks change the outcome. The same `hasTrainer()` quirk applies it to trainer foes too | — | `field/pokemon.ts:432-441`, `modifier/modifier.ts` `EnemyFusionChanceModifier.apply` (`randSeedFloat() > chance * stacks`), `battle-scene.ts:2964-2980` (`applyModifier(_, false)` = enemy list) |
| 12 | `encounteredEvents.length` | **confirmed**: the picker reads the tiers, the last type, the last wave and per-type counts, but the list is append-only within a run, so its length stands for its content | `26-run.js:21` | `battle-scene.ts:3452-3493, 3566-3622`; `data/mystery-encounters/mystery-encounter-save-data.ts` (no removal) |
| 13 | `encounterSpawnChance` | **confirmed** | `26-run.js:22` | `battle-scene.ts:3463, 3481-3492` |
| 14a | ME only: money | **amended**: only `money ≥ getWaveMoneyAmount(m)` for `m ∈ {1.5, 1.75, 2, 4}` at the target wave is read. That is one 0–4 count, not the money | — | `data/mystery-encounters/mystery-encounter-requirements.ts:383-401`, `battle-scene.ts:2399-2406`; Fun and Games and Shady Vitamin Dealer 1.5, Teleporting Hijinks 1.75, Delibirdy and Safari Zone 2, Pokémon Salesman 4 |
| 14b | ME only: allowed-member count | **amended**: `min(allowed, 4)`; the thresholds are 2, 3 and 4 | — | `mystery-encounter-requirements.ts:313-342`, `battle-scene.ts:738-740` |
| 14c | ME only: berry stacks | **amended**: only `berry stacks ≥ 6` (Absolute Avarice) is read at encounter level | — | `mystery-encounter-requirements.ts:350-376`, `encounters/absolute-avarice-encounter.ts:58` |
| 14d | ME only: held-item and type fingerprint | **confirmed, made exact** in §2 | — | `encounters/bug-type-superfan-encounter.ts:167-177`, `encounters/delibirdy-encounter.ts:45-54, 84-94`, `mystery-encounter-requirements.ts:490-530, 806-930` |
| 14e | ME only: whether any member is at HP ratio ≥ 0.51 | **refuted**: what matters is how many, bucketed 0 / 1 / ≥ 2. A met primary requirement draws `randSeedInt(qualified.length)` to pick the primary mon, and that draws only for a length of 2 or more, so the count shifts the final `randSeedInt(availableEncounters.length)`. The ratio is rounded to the percent | — | `data/mystery-encounters/mystery-encounter.ts:328-334, 357-411` (draw at `:410`), `field/pokemon.ts:1691-1693`, `utils/common.ts:101-106`, `encounters/shady-vitamin-dealer-encounter.ts:48` |
| 14f | ME block "only when the target wave can be a mystery encounter" | **amended**: the block is needed only when the replay's own type answer is `me`, and that answer is a function of the base key alone | `48-preview.js:101-103` | `battle-scene.ts:1452-1466, 3452-3511` |
| 15 | party levels are not read | **confirmed**: no call in the replay reads a player level (moveset generation, trainer and wild species, levels and the ME picker all checked) | — | `ai/ai-moveset-gen.ts` (reads only the foe and `currentBattle`), `ai/ai-species-gen.ts:106-170`, `battle.ts:96-146` |
| 16 | order beyond the lead is not read | **refuted** for a live double: `getPlayerField` is the first *two* members then. Order matters only through item 7's count, so the key needs the count, not the order | — | `battle-scene.ts:759-764` |
| 17 | per-member `hp > 0` is not read | **refuted as a raw read, true as a key**: `hp > 0` feeds luck (`isAllowedInBattle`), the lead's ability gate (`canApplyAbility`) and the ME party-size count. Each is keyed as its derived value, so `hp > 0` itself drops out | — | as items 6, 7 and 14b |
| 18 | today's key misses charm stacks and fusion luck | **confirmed**: stacking an existing charm raises `stackCount` without changing `modifiers.length`, and `p.luck` lacks `fusionLuck`. Today's key also misses `enemyModifiers`, `arena.lastTimeOfDay`, the Neutralizing Gas tag and ability suppression, berry and held-item stacking or transfer, the money thresholds, the HP-ratio bucket and the active timed event | `26-run.js:9-26` | as above |

### Live state the claim missed

- **The arena's pool** (`lastTimeOfDay`); see item 4.
- **The active timed event.** `timed-event-manager.ts:28-50` reads `new Date()`. Through it the replay reads the wild
  shiny multiplier and the trainer shiny chance (`field/pokemon.ts:2873-2884`), the luck boost and boosted species
  (`modifier-type.ts:2925-2933`), and the ME tier remaps and disabled list (`battle-scene.ts:3588-3614`).
- **The current phase.** `getSpeciesFormIndex` asks whether it is in an egg phase, which changes Eevee's form on
  trainers before wave 30 and Gimmighoul's (`battle-scene.ts:1755-1830`).
- **Account constants.** `gameData.trainerId ^ secretId` decides shininess (`field/pokemon.ts:2869-2870`),
  `gameData.gender` decides the rival's variant (`data/trainers/fixed-battle-configs.ts:36` and the others), and the
  i18n language decides trainer names (`utils/i18n.ts:16-19`). These are constant within a session.
- **Not read, despite the suspicion:** money outside the ME picker, arena tags other than Neutralizing Gas, held items
  outside the ME picker, abilities other than the four double-chance ones, and challenge checks. The challenge set is
  constant within a run, and its per-mon `POKEMON_IN_BATTLE` hook reaches the key only through luck and the allowed
  count. Neither trainer nor species generation reads the player party: `data/trainers/` only reads
  `currentBattle.waveIndex` and `gameData.gender`.

## 2. The exact replay key

`previewFor(run, w)` should be memoised on two levels. A base key holds what every wave kind reads. The type
(`trainer` / `wild` / `me`, plus `fixed`) is a function of the base key alone, so it can be read from a first memo
level and then pick the kind-specific part.

**Base (every target wave):**

1. `seed`. It stands for the game mode, the challenges, the Daily config, `waveCycleOffset` and `offsetGym`, which
   are all constant within a run.
2. `liveWave`, `w`.
3. `arena.biomeId`, `arena.lastTimeOfDay`.
4. `encounteredEvents.length`, `encounterSpawnChance`.
5. The active timed event's identity, or `null`.
6. `abilityCharmStacks`: the sum of `HiddenAbilityRateBoosterModifier` stacks in `s.modifiers`.
7. `enemyFusion`: `[chance, stacks]` per `EnemyFusionChanceModifier` in `s.enemyModifiers` (empty outside Endless).
8. `eggPhase`: the current phase is `EggLapsePhase` or `EggHatchPhase`. Better still, do not replay during one.

**Trainer, random or fixed, adds:**

9. `doubleExp = min(3, lures + abilityApplications)`. `getDoubleBattleChance` is `max(base / 4^n, 1)` with a base of
   8 or 32, and `randSeedInt(1)` draws nothing, so `n ≥ 3` is all alike (`utils/common.ts:101-106`). `lures` is the
   number of `DoubleBattleChanceBoosterModifier` instances. `abilityApplications` is, over
   `getPlayerField()` × {ability, passive}, the number where `canApplyAbility(passive)` holds and the ability has
   `DoubleBattleChanceAbAttr`, skipping a passive with the same id as the ability. Call the game's own predicates; do
   not match ability names.
10. `liveDouble` (`currentBattle.double`), which the party templates and the field read.

A fixed trainer with a set `double`, and a `doubleOnly` or special trainer, never reads item 9. It is harmless to
keep it.

**Wild adds:** item 9, plus

11. `luck`: `getPartyLuckValue(party)`. The overlay's `partyLuck(party, s, gameEvents())` re-implements it
    (`08-party.js:65-79`).
12. `shinyCharmStacks`: the sum of `ShinyRateBoosterModifier` stacks.
13. `bugNet`: a `BoostBugSpawnModifier` is present.

**Mystery encounter adds (and drops 9–13: `checkIsDouble` returns false for an ME and no foe is generated):**

14. `moneyTier`: how many of `getWaveMoneyAmount(m)` at wave `w`, for `m ∈ {1.5, 1.75, 2, 4}`, are ≤ `money`.
15. `berries6`: the summed `BerryModifier` stacks are ≥ 6.
16. `allowed = min(4, count of isAllowedInBattle)`.
17. `hpOk = min(2, count of members with getHpRatio() in [0.51, 1])`, over the whole party.
18. Bug-Type Superfan, each `min(2, n)`: holders of a transferable Quick Claw (`BypassSpeedChanceModifier`) or Grip
    Claw (`ContactHeldItemTransferChanceModifier`); holders of a transferable Silver Powder (`AttackTypeBoosterModifier`
    with `moveType` Bug); Bug-type members, fainted included, by `isOfType` with tera excluded but `summonData` types
    included.
19. Delibirdy, each `min(2, n)`: holders of a transferable Berry or Reviver Seed; holders of any transferable held
    item other than those two.

Items 14–19 can be narrowed to the encounters `mysteryEncountersByBiome.get(biomeId)` lists, but they are cheap
enough to compute whole.

**Confidence:** high for items 1–13 at `w = liveWave + 1`, every call traced to its end. Medium-high for 14–19: every
encounter-level requirement of all 31 encounters was enumerated by reading where each builder chain's options begin.
Option-level requirements are not part of `meetsRequirements` (`mystery-encounter.ts:328-334`). A future encounter, or
a requirement added upstream, breaks this list, which is a drift-check concern.

## 3. The exact key for the look-ahead's remainder

`aheadModel` is memoised as `run.memo("ahead", "model")` (`49-ahead.js:118-123`). Its `build` (`:125-156`) reads:

| Part | Reads | Key |
|---|---|---|
| `schedule`, `next`, `in`, `thisWave` / `next.rewards`, `finalNear` | `bigFightsAhead` (`03-calendar.js:34-43`), `rewardRules` (`49-ahead.js:20-27`) | `seed`, `liveWave` |
| `heal`, `fightsBeforeHeal` | `nextHeal` (`03-calendar.js:51-58`) reads the `LIMITED_SUPPORT` challenge and the final wave | `seed`, `liveWave` |
| `luck` | `partyLuck` | the luck value (item 11; the same value at every kind of wave) |
| `next.trainer/foes/double/bars/exact` | `previewFor(run, next.wave)` when `next.wave − liveWave ≤ 5` | the replay key for `next.wave` (§2), or the identity of the memoised replay value |
| `readiness` | only when the preview is named: `partyProfile(party.filter(p => p.hp > 0))` → per alive member `name`, `level` (max), `typesOf` (`getTypes`, `summonData` included), `abilitiesOf` (`getAbility`, `hasPassive`, `getPassiveAbility`) and `damagingTypes` (moveset); party order sets the "only X hits" note | that list, in party order, alive members only, plus the replay value |
| `eternatus` | only when the final wave is within 10: `party.length > 1`, `alive < 2`, `heldStacks`: per member `[name, Σ getStackCount]` over `s.modifiers` with that `pokemonId` | that triple, plus the replay value when `next` is the final wave |

So the remainder key is `[seed, liveWave, luck, replayKey(next.wave) | null, alive member profiles | null,
eternatus inputs | null]`. **Confidence: high**: all of it is overlay code, read in full. It does read per-member
`hp > 0`, levels and order (readiness), and that is the cheap part.

## 4. What cannot be keyed exactly

- **Previews beyond `liveWave + 1`** (the look-ahead's next big fight, up to 5 waves out). The key is exact about what
  the replay reads, but the replay reads *today's* state where the game will read the state at `w − 1`: the field and
  its abilities, the lures (which lapse, `phases/battle-end-phase.ts:66-76`), luck, `encounterSpawnChance` (raised on
  every wild ME-legal wave between), money, the biome and pool (a new arena at X1, a rebuild at X5) and the party
  templates read at the live wave (item 2). That is an estimate whatever the key, and only the confidence marks can
  say so.
- **Wall-clock events.** The key can only poll the active event's identity. A refresh that straddles an event boundary
  is a rebuild, and that is correct.
- **Account constants** (trainer and secret id, the gender, the language): constant within a session and not worth a
  key slot.
- **An evil grunt's double**: `Math.random`, unseeded (`battle.ts:597-617`). The overlay already marks it `estimate`.

## 5. Correctness gaps in the replay itself (out of scope for #520)

1. **Golden Bug Net hit.** On `rnd(10) === 0` the game replaces the species with `getGoldenBugNetSpecies(level)`,
   which draws again (`phases/encounter-phase.ts:111-120`,
   `data/mystery-encounters/utils/encounter-pokemon-utils.ts:946-963`). The replay only adds a note and keeps the
   arena species (`48-preview.js:130-132`), so that member is wrong and the stream after it is out of step.
2. **Synchronize is not applied.** The game sets each wild foe's nature from the lead's Synchronize
   (`phases/encounter-phase.ts:127-133`, `data/abilities/ab-attrs.ts:5190-5198`), so a replayed foe's stats are wrong
   behind a Synchronize lead. No draw is involved.
3. **The classic final boss.** `ivs.fill(31)` and Eternatus's `setBoss()` run in `EncounterPhase`
   (`phases/encounter-phase.ts:124-126, 147-153`), not in the replay, so the wave-200 preview's stats and segments
   differ.
4. **Lures.** `BattleEndPhase` lapses them before `newBattle` (`phases/battle-end-phase.ts:66-76`). A mid-battle
   replay counts a lure with one battle left that the real roll will not see.
5. **Transient battle state in the double chance.** The replay reads a Neutralizing Gas tag, Gastro Acid, Skill Swap
   or `arena.ignoreAbilities` as they stand mid-fight. A tag whose source faints is gone before the real roll; the
   `summonData` changes survive, since `resetArenaState` runs after `checkIsDouble` (`battle-scene.ts:1308,
   1563-1600`).
6. **`model.missed` is computed inside the memo** from the module-global `stats.miss` (`48-preview.js:231-235`). Under
   today's key, which rebuilds constantly, that hides it. Under an exact key a miss scored after the build stays
   unmarked until the next rebuild, so `missed` has to be derived outside the memo once #511 lands.
7. **Look-ahead trainer levels.** `getPartyLevels` reads the live wave's party template (item 2), where the game reads
   wave `w − 1`'s. This only matters across a template threshold (`trainer-party-template.ts:254-290`).
8. **Shared encounter objects are mutated.** The replay's `getMysteryEncounter` sets `primaryPokemon` and
   `secondaryPokemon` on the shared `allMysteryEncounters` objects and `requiredMoney` on shared requirements, and the
   sandbox does not restore them. This is harmless today: the game copies each encounter, resetting both mons, and
   recomputes the money.

## 6. The wave-35 run's 154 rebuild triggers under the exact key

| Trigger | Count | Rebuilds the replay only when |
|---|---|---|
| New wave | 32 | **always**: `w` and `liveWave` change |
| Faint / send-out | 66 | the change moves `luck` (the fainted or revived mon is shiny, or an event species), moves `doubleExp` (a lead with one of the four abilities enters, leaves or faints, ability or passive), or the next wave is an ME and `allowed` / `hpOk` / the Bug count crosses a bucket |
| Level-up | 23 | never directly, since levels are unread. An evolution changing a lead's double-chance ability, or an ME next wave whose `hpOk` bucket moves, would |
| Our switch | 16 | the swap moves `doubleExp` |
| Item | 13 | it is a new lure instance, a Shiny or Ability Charm stack, the Bug Net, or (with an ME next) it crosses a money tier or the 6-berry line, or changes a Delibirdy or Bug holder bucket |
| Retry | 4 | the restored state differs in a keyed value, such as a revived shiny or an arena rebuilt at another time of day (a reload at X0) |

The source pins **32 of 154** as certain rebuilds. The other 122 rebuild only on the conditions above, which the run
log, not the source, would have to show. With no shiny member, no Illuminate, Arena Trap, No Guard or Commander on a
lead, and no ME on the next wave, the count is 32. Lures are a common reward early on, so some of the 13 item triggers
may count; each one that does is a real change to the wild double roll. The remainder (§3) still rebuilds on faints,
level-ups and switches, but it does no replay.
