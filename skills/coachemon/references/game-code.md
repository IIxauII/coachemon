Quotes below are from `pagefaultgames/pokerogue` (https://github.com/pagefaultgames/pokerogue), tag `v1.12.1.1`, AGPL-3.0-only, Copyright Pagefault Games and contributors.

# PokéRogue game-code spec for the coach HUD

The game code the coach HUD (`skills/coachemon/scripts/hud/`) calls, replays or re-implements, read from the
**pinned source**: `pagefaultgames/pokerogue` tag `v1.12.1.1`, commit `bdfbef6585baf8c34f71df8871f8d6c1c5efb488`
(the pin in `src/escape-ladder/reviewed.json`). `npm run drift:check` clones it to `.cache/pokerogue/v1.12.1.1`.

**Citations.** `src/path/file.ts:LINE` is a line at that commit, i.e.
`https://github.com/pagefaultgames/pokerogue/blob/bdfbef6585baf8c34f71df8871f8d6c1c5efb488/src/path/file.ts#LLINE`.
`:LINE` alone means the file last named. At a pin bump the lines move: `scripts/hud-deps.ts` lists the functions
the HUD leans on, per module, and the drift check names the ones whose bodies changed.

**Side effects.** Each function is marked pure or with what it does: an **RNG draw** (the global Phaser stream via
`randSeedInt`, the per-turn battle stream via `randBattleSeedInt`, or a seed fork via `executeWithSeedOffset`, §11),
a **phase queue** (`phaseManager.*`), or a **state write** (the field named). Every HUD call runs inside `sandbox` (§0).

**Enums.** The served build inlines enums as numbers (`unplugin-inline-enum`), so no enum names exist in the page.
The HUD names them anyway (`MoveCategory.STATUS`): `npm run enums:gen` generates the tables at the pin into
`src/enums/generated.ts`, and `hud-bundle.mjs` injects the members the HUD uses, failing on a member the tag lacks.
This spec uses the source names.

**Live bundle.** Anything true only of the served, minified build (export aliases, what survives minification,
what was only observed on a tab) is in §22, not in the sections.

## Areas

| Area | Sections |
|---|---|
| Side effects and the sandbox | §0, Unsafe to call |
| Damage and KO math | §1 damage, §2 multi-hit, §3 boss segments, §4 type / power overrides, §8 held items and abilities, §18 drain and on-KO boosts |
| Accuracy, priority, turn order | §5 |
| Enemy AI | §6 move choice, §7 switches, §14 status moves and a foe's setup |
| Switching | §9 free switches, §18 switch-in cost, §32 reordering the party from the reward screen and who leads |
| End of turn | §21 `TurnEndPhase` and the phases before it |
| Seeded RNG and the wave preview | §11 |
| Trainers and fixed battles | §11 trainer parties, §12 fixed-battle calendar, heals, luck |
| Biomes | §10 |
| Mystery Encounters | §13 |
| Rewards and shop | §15 rewards by holder, §16 TMs, double-battle odds and status moves against the roster ahead, §19 reward roll and reroll |
| Catching | §20 |
| Team audit | §17 |
| Starter select | §23 |
| DNA Splicers and fusion | §24 |
| Menu cursors | §13 the encounter's options, §25 the command grid, the target cursor and a committed command's object |
| The screens the MCP driver walks | §26 |
| The canvas and its message window | §27 |
| Loading a session save: doubles, Mystery Encounters, arena tags and items a reload keeps or loses | §28 |
| The wave-start save and the session export | §29 |
| The session save, and what a reload resets mid-fight | §30 |
| HUD API built on the above | Recommended API for the HUD |

---

## 0. The side-effect landscape, and the `sandbox` every HUD call must use

Muting the phase queue is **not enough**. The call graphs of `getAttackDamage`, move scoring and move conditions
have four kinds of hidden effect, even on the "simulated" paths.

1. **Ability bookkeeping.** `applySingleAbAttrs` (`src/data/abilities/apply-ab-attrs.ts:22`), the core of
   `applyAbAttrs` (`:111`), reads `simulated = false` by default (`:27`). For each attr that applies it:
   - queues the ability flyout if `attr.showAbility` (`:52-55`, `:68-70`);
   - queues the trigger message (`:57-63`);
   - adds the ability id to `waveData.abilitiesApplied` and `summonData.abilitiesApplied` (`:73-76`).

   The first two happen only when not simulated, and so does the third. `AbAttr.showAbility` defaults to `true`
   (`src/data/abilities/ab-attrs.ts:117`), and every `CancelInteractionAbAttr` (`:200`) keeps that default.
   These call sites leave `simulated` out:
   - `Move.hitsSubstitute` → Infiltrator (`src/data/moves/move.ts:496`). Reached from `getMoveEffectiveness` for
     status moves (`src/field/pokemon.ts:2790`) and from `FormBlockDamageAbAttr.canApply` (`src/data/abilities/ab-attrs.ts:5482`).
   - `WeakenMoveScreenTag.apply` → Infiltrator (`src/data/arena-tag.ts:380`). `Pokemon.isSafeguarded` does the same (`src/field/pokemon.ts:5310`).
   - `getEffectiveWeatherForMove` → `PreAttackWeatherOverrideAbAttr`, i.e. Mega Sol (`src/data/weather.ts:227`).
     Reached from `getWeatherMultiplierForMove` (`:253`) and from `getEffectiveStat` with `forDefend` (`src/field/pokemon.ts:1516-1519`).
   - `getAccuracyMultiplier`, on every ability call (`src/field/pokemon.ts:3544-3597`).
   - `getCritStage` → Super Luck (`:1422`). `getCriticalHitResult` → Merciless, Battle Armor (`:4038`, `:4049`).
   - `OneHitKOAttr.getCondition` → Sturdy's `BlockOneHitKOAbAttr`, flyout included (`src/data/moves/move.ts:3643`).
   - `ForceSwitchOutAttr.getSwitchOutCondition` / `getFailedText` → `ForceSwitchOutImmunityAbAttr`, flyout included (`:7445`, `:7400`).
   - `failIfDampCondition` → `FieldPreventExplosiveMovesAbAttr`. This one is simulated only while the current phase
     is `EnemyCommandPhase`. Otherwise it queues a flyout and a "cannot use" message (`src/data/moves/move-condition.ts:206-218`).
   - `Pokemon.canSetStatus` → `IgnoreTypeStatusEffectImmunityAbAttr` (`src/field/pokemon.ts:5011`).
   - `Pokemon.isForciblyUngrounded` → Levitate's and Eelevate's `UngroundedAbAttr`, which has no flyout
     (`src/field/pokemon.ts:2572-2574`, `src/data/abilities/ab-attrs.ts:216-224`). Reached from `isGrounded`
     (`src/field/pokemon.ts:2535`) and from `getAttackTypeEffectiveness` for every move, the call coming before the
     Ground check (`:2823-2829`).
   - `getBerryPredicate` → `ReduceBerryUseThresholdAbAttr` (`src/data/berry.ts:43-61`).

   Muting stops the queued flyouts and messages. It does **not** undo the `abilitiesApplied` writes, and those are
   read by `getOncePerBattleCondition` (`src/data/abilities/init-abilities.ts:2222-2224`) and Battle Bond (`:1458`).

   A caller that leaves `passive` out gets one pass for the ability and one for the passive
   (`src/data/abilities/apply-ab-attrs.ts:97-100`), and the passive pass returns at once when its id is the ability's
   (`:28`), so an ability held as both applies once. Each pass skips an attr whose `getCondition()` fails for the pokemon
   or whose `canApply(params)` is false (`:41-47`). `Pokemon.getAbilityAttrs` makes no such skip
   (`src/field/pokemon.ts:2273-2285`), and both ability getters hand out the shared `allAbilities[id]` (`:2201-2262`),
   whose `getAttrs` filters its stored attrs (`src/data/abilities/ability.ts:176-183`): a repeated ability's attrs come
   back twice, as the same objects.
2. **Battle RNG.** `Battle.randSeedInt` (`src/battle.ts:486-504`) returns `min` without drawing when `range ≤ 1`.
   Otherwise it:
   - loads `battleSeedState`, or sows `shiftCharCodes(battleSeed, turn << 6)` when that is null;
   - draws;
   - stores the new `battleSeedState`;
   - puts back the global `RND.state()` and `rngSeedOverride`, with no try/finally.

   The callers are `BattleScene.randBattleSeedInt` (`src/battle-scene.ts:1098`) and `Pokemon.randBattleSeedInt`
   (`src/field/pokemon.ts:5858`). Draws on HUD paths:
   - `getMoveTargets` for `RANDOM_NEAR_ENEMY` (Outrage, Thrash) with 2+ opponents (`src/data/moves/move-utils.ts:93-94`).
     Reached from `getAttackDamage` (`src/field/pokemon.ts:3863`). Also reached from `canBeMultiStrikeEnhanced`, but
     only with `restrictSpread = true` (`src/data/moves/move.ts:1344-1345`): Parental Bond's hit-count and last-strike checks.
   - `ProtectAttr.getCondition` after a streak of successful protects: `randBattleSeedInt(3 ** n)` (`:6831`).
   - `ShellSideArmCategoryAttr.apply` on a physical/special tie (`:5645`).
   - `RandomLevelDamageAttr.getDamage`, i.e. Psywave (`:2154`).
   - `getCriticalHitResult` (`src/field/pokemon.ts:4045`).
   - `EnemyPokemon.getNextMove` (`:6844`, `:6994`, `:7004`) and `getNextTargets`, which draws only when the target
     weight sum is above 1 (`:7112`).
3. **Global RNG and the phase queue.** `PresentPowerAttr.apply` (`src/data/moves/move.ts:5099-5128`) calls `randSeedInt`
   directly, which is `Phaser.Math.RND.integerInRange` (`src/utils/common.ts:102-107`). On the heal branch it also
   writes `user.turnData.hitCount = hitsLeft = 1` and calls `unshiftNew("PokemonHealPhase")`. That applies even
   when simulated. It's reached from `calculateBattlePower` (`move.ts:1106`) and `AttackMove.getTargetBenefitScore` (`:1438`).

   `executeWithSeedOffset` (`src/battle-scene.ts:2017-2031`) is used by Magnitude (`move.ts:4938`), `DoublePowerChanceAttr`
   (`:4658`) and the `sortInSpeedOrder` shuffle (`src/utils/speed-order.ts:35`). It saves and restores `RND.state()`,
   `rngOffset` and `rngSeedOverride`, with no try/finally. Its draws are seeded from `waveSeed` and `turn << 6`, so one
   sandboxed call returns this turn's actual Magnitude or Fickle Beam result.
4. **turnData writes.** `FullHpResistTypeAbAttr.apply` (Tera Shell) sets `turnData.moveEffectiveness = 0.5` even when
   simulated (`src/data/abilities/ab-attrs.ts:542-545`). `getMoveEffectiveness` returns that cached value before
   anything else (`src/field/pokemon.ts:2725-2727`). Only `MoveEffectPhase` (`src/phases/move-effect-phase.ts:898`)
   or a fresh `PokemonTurnData` clears it. The multi-hit math also needs the HUD to set `hitCount`/`hitsLeft`
   itself (§2).

Benign writes:
- The `RepeatMoveAttr` condition stores `this.movesetMove` on the shared attr (`src/data/moves/move.ts:8227`).
- `EnemyPokemon.getNextMove` splices or replaces `summonData.moveQueue` (`src/field/pokemon.ts:6808`, `:6814`).
  Save the queue if you call it.

**`sandbox(s, fn)`** (`scripts/hud/01-core.js`). It is synchronous, so the restore is exact:
- mute `phaseManager.{pushPhase, unshiftPhase, pushNew, unshiftNew, queueMessage, queueAbilityDisplay, hideAbilityBar, queueFaintPhase}`;
- save `Phaser.Math.RND.state()`, `currentBattle.battleSeedState` (string or null), `s.rngOffset` and `s.rngSeedOverride`;
- for every mon in `getPlayerParty()` and `getEnemyParty()`, copy both `abilitiesApplied` sets and
  `turnData.{hitCount, hitsLeft, moveEffectiveness}`;
- `try { return fn() } finally { restore all of it }`.

Wrap a whole refresh in one sandbox.

The sandbox doesn't make a draw deterministic. Special-case these two:
- **Present.** `randSeedInt(100)`: 0–40 gives 40 power, 41–70 gives 80, 71–80 gives 120, and 81–99 heals the target
  for ¼ of its max HP. That's **41 / 30 / 10 / 19 %**. Later strikes (Multi-Lens, Parental Bond) draw `randSeedInt(80)`
  and can't heal.
- **Psywave.** `toDmgValue(level × U{50..150} × 0.01)`, then the Multi-Lens factor.

---

## 1. Damage — `Pokemon.getAttackDamage`

Called on the **defender** (`src/field/pokemon.ts:3756-4028`):
```
getAttackDamage({ source, move, ignoreAbility = false, ignoreSourceAbility = false, ignoreAllyAbility = false,
                  ignoreSourceAllyAbility = false, isCritical = false, simulated = true, effectiveness })
  → { cancelled, result: HitResult, damage }
```
Even with `simulated: true`, the call has side effects:
- **Battle RNG** for a Shell Side Arm tie, Psywave, `RANDOM_NEAR_ENEMY` spread in doubles, and Parental Bond's
  last-strike check.
- **Global RNG, a `turnData.hitCount`/`hitsLeft` write and a queued heal phase** for Present.
- **`turnData.moveEffectiveness`** for Tera Shell.
- **`abilitiesApplied`** for Infiltrator (screens, substitute) and Mega Sol.

Call it only inside `sandbox`.

1. **Category.** `VariableMoveCategoryAttr`: Photon Geyser, Shell Side Arm (`:3771`).
2. **Effectiveness.** The call runs `effectiveness ?? this.getMoveEffectiveness(source, move, ignoreAbility, simulated, cancelled)` (`:3786-3787`).
   If the move is cancelled or the multiplier is 0, it returns `{ result: move is Sheer Cold ? IMMUNE : NO_EFFECT, damage: 0 }` (`:3791-3797`).
   `getMoveEffectiveness` (`:2717-2795`) covers:
   - the cached `turnData.moveEffectiveness`, checked first, then 1 for a `TypelessAttr` move;
   - `getAttackTypeEffectiveness` (`:2803-2865`): Stellar; 0 for a Ground move into a mon that `isForciblyUngrounded`
     (Levitate's and Eelevate's `UngroundedAbAttr`, Magnet Rise's `FLOATING`, `TELEKINESIS`), unless the move is
     Thousand Arrows (`:2823-2829`); a Flying type grounded by `IGNORE_FLYING` (Smack Down, Ingrain) or Gravity losing its Ground
     immunity (`:2888-2890`); Scrappy/Foresight; `MoveTypeChartOverrideAttr` (Freeze-Dry); and strong winds (its
     message is queued only when not simulated);
   - a `FixedDamageAttr` move's non-zero multiplier, set to 1 (`:2740-2742`);
   - `move.isTypeImmune`, and Tar Shot ×2 for Fire;
   - `TypeImmunityAbAttr` (Volt Absorb, Flash Fire, Wonder Guard…). Their heal, stat boost or tag happens
     only when not simulated (`src/data/abilities/ab-attrs.ts:447`, `:480`, `:505`);
   - `MoveImmunityAbAttr`;
   - the ally's Dazzling-family `FieldPriorityMoveImmunityAbAttr`, checked **only** when simulated;
   - Tera Shell;
   - Substitute blocking status moves.

   `ignoreAbility` skips the defender's ability steps, but not Levitate: `isForciblyUngrounded` applies
   `UngroundedAbAttr` with no such flag (`src/field/pokemon.ts:2572-2574`), and only the arena's `ignoreAbilities`,
   set while a Mold Breaker move runs, suppresses it (`:2392`).
3. **Fixed damage and OHKO.**
   - `FixedDamageAttr` (`src/field/pokemon.ts:3801`) returns `{ EFFECTIVE, toDmgValue(fixed × Multi-Lens factor) }`
     (`:3802-3831`). That return skips step 7, so it runs the Sturdy step itself first: a full-HP defender gets
     `PreDefendFullHpEndureAbAttr` unless `ignoreAbility` (`:3814-3824`). At this pin a fixed-damage hit — Seismic
     Toss, Night Shade, Super Fang, Dragon Rage, Final Gambit, and Psywave through `RandomLevelDamageAttr extends
     FixedDamageAttr` (`src/data/moves/move.ts:2148`) — leaves a full-HP Sturdy mon at 1 HP, as any other hit does.
     That step is upstream [#7620](https://github.com/pagefaultgames/pokerogue/pull/7620), first released in
     v1.12.1.0 (v1.12.0.11 returns before it); a tab on a game version from before it lets the hit through.
   - `OneHitKOAttr.apply` (`src/field/pokemon.ts:3835`; `src/data/moves/move.ts:3630-3639`) returns `{ ONE_HIT_KO, damage: this.hp }`.
     A boss is `isBossImmune`, so it falls through to the normal formula. The level check and Sturdy's block live in
     the attr's condition, not here.
4. **Base.** `getBaseDamage` (`src/field/pokemon.ts:3610-3671`) returns `(2·L/5 + 2) × power × Atk / Def / 50 + 2`,
   unfloored:
   - power is `move.calculateBattlePower(source, this, simulated)`;
   - Atk is `source.getEffectiveStat(phys ? ATK : SPATK, { opponent, isCritical, simulated, … })`, then
     `VariableAtkAttr` (Foul Play, Body Press);
   - Def is `this.getEffectiveStat(phys ? DEF : SPDEF, { …, forDefend: true })`, then `VariableDefAttr` (Psyshock).

   `getEffectiveStat` (`:1456-1572`) applies, in order:
   - `StatBoosterModifier` items;
   - field `FieldMultiplyStatAbAttr` (the Ruin abilities);
   - the mon's own `StatMultiplierAbAttr` (Huge Power, Hustle, Marvel Scale). Gorilla Tactics is not one: after the
     holder's first executed move other than Struggle, `GorillaTacticsTag` locks it into that move and writes ×1.5
     into its in-battle Atk, already counting for that first hit, until switching out, returning or fainting resets
     its summon data (`src/data/battler-tags.ts:490-522`, `src/phases/move-effect-phase.ts:262`,
     `src/field/pokemon.ts:5351-5357`);
   - the ally's `AllyStatMultiplierAbAttr`;
   - `getStatStageMultiplier` (`:3473-3519`): a crit ignores the attacker's drops and the defender's boosts;
     Unaware's `IgnoreOpponentStatStagesAbAttr` or Chip Away's `IgnoreOpponentStatStagesAttr` zero the stages;
     `TempStatStageBoosterModifier` applies X items; the result is capped at ×4;
   - Slow Start;
   - Snow ×1.5 Def for Ice and Sandstorm ×1.5 SpD for Rock (with `forDefend`, the weather is the one after the
     attacker's Mega Sol);
   - Speed only: Tailwind, Grass/Water Pledge, paralysis, Unburden;
   - `HighestStatBoostTag` (Protosynthesis, Quark Drive);
   - finally `max(floor(x), 1)`.
5. **Power.** `Move.calculateBattlePower` (`src/data/moves/move.ts:1099-1193`) defaults to `simulated = false`, so pass
   `true` when calling it directly. In order:
   - `VariablePowerAttr` (Knock Off, Facade, Gyro Ball, Acrobatics, Hex, Triple Axel, Magnitude, Present…);
   - `VariableMovePowerAbAttr` (Technician, -ate abilities, Tough Claws, Strong Jaw, Blaze family, Punk Rock…);
   - the ally's `AllyMoveCategoryPowerBoostAbAttr`;
   - a Tera floor of 60 power: the Tera type equals the base move type, priority ≤ 0, the move isn't multi-hit, and
     the user has no Multi-Lens;
   - field auras and `UserFieldMoveTypePowerBoostAbAttr`;
   - `TypeBoostTag` (Charge);
   - `WeakenMoveTypeTag` (Mud Sport, Water Sport);
   - `AttackTypeBoosterModifier`: `floor(power × (1 + stacks × 0.2))` (`src/modifier/modifier.ts:1475-1478`, `src/constants.ts:22`);
   - Helping Hand ×1.5, then Supreme Overlord;
   - terrain ×1.3 for a grounded user (`src/field/arena.ts:503-514`);
   - Misty Terrain ×0.5 on Dragon moves into a grounded target.

   Charge, the Sports, type boosters and Misty key on the base type after `MoveTypeChangeAbAttr` only, **not** after
   `VariableMoveTypeAttr`. So Hangry Aura Wheel still checks Electric boosters. Terrain uses the full `getMoveType`.
6. **Main product** (`src/field/pokemon.ts:3860-3954`). `toDmgValue` (`max(floor(x), 1)`, `src/utils/common.ts:369-371`) of
   base × each of these:
   - **spread** 0.75 when `getMoveTargets` says `multiple` with 2+ targets;
   - **Multi-Lens / Parental Bond factor** (`PokemonMultiHitModifier`);
   - **weather** from `getWeatherMultiplierForMove` (`src/data/weather.ts:252-284`): sun/rain 1.5 or 0.5, and 1.5 for
     `OverrideWeatherMultiplierAttr`;
   - **Glaive Rush** 2 (`RECEIVE_DOUBLE_DAMAGE`);
   - **crit** 1.5, times `MultCritAbAttr` (Sniper);
   - **random roll**;
   - **STAB**;
   - **effectiveness**;
   - **burn** 0.5 on physical moves, unless the move has `BypassBurnDamageReductionAttr` (Facade) or the user has Guts;
   - **screens** (`WeakenMoveScreenTag.apply`, `src/data/arena-tag.ts:375-386`): ½ in singles, ⅔ in doubles, skipped on
     a crit, bypassed by Infiltrator;
   - **×2** for each `HitsTagAttr` with `doubleDamage` whose tag the defender has (Stomp into Minimize, Surf into Dive).

   STAB comes from `calculateStabMultiplier` (`src/field/pokemon.ts:3689-3718`):
   - 1 for Struggle;
   - +0.5 if `getMoveType` is one of the user's non-Tera types (not Stellar);
   - `CombinedPledgeStabBoostAttr`;
   - Adaptability +0.5 when STAB already applies;
   - Tera: +0.5 for the Tera type; Stellar gives +0.5 or +0.2 once per type;
   - capped at 2.25.
7. **Post steps** (`:3956-3996`), each re-floored:
   - `MoveDamageBoostAbAttr`: Tinted Lens ×2, Parental Bond ×0.25 on the last strike, and Unseen Fist / Piercing Drill
     ×0.25 through Protect (`src/data/abilities/init-abilities.ts:766`, `:1245`, `:1802`, `:2170`);
   - Damage Booster token when the attacker is an enemy: `× 1.05^stacks`;
   - Damage Reducer token when the defender is an enemy: `× 0.975^stacks` (`src/modifier/modifier.ts:3442-3443`, `:3456`, `:3479`);
   - the defender's `ReceivedMoveDamageMultiplierAbAttr`: Multiscale, Fur Coat, Fluffy, Filter / Solid Rock / Prism
     Armor, Punk Rock, Disguise / Ice Face, and Thick Fat / Heatproof through the `ReceivedTypeDamageMultiplierAbAttr`
     subclass (`src/data/abilities/ab-attrs.ts:389`);
   - Friend Guard (doubles only);
   - `ModifiedDamageAttr`: False Swipe's `min(damage, hp − 1)` (`src/data/moves/move.ts:2173`);
   - at full HP, `PreDefendFullHpEndureAbAttr` (Sturdy). It **adds the `STURDY` tag only when not simulated**
     (`src/data/abilities/ab-attrs.ts:310-324`) and never lowers the damage. `Pokemon.damage` honours the tag
     (`src/field/pokemon.ts:4082-4084`).
8. **Result**, from effectiveness (`:4005-4021`): ≥4 is EXTREMELY_EFFECTIVE, ≥2 SUPER_EFFECTIVE, ≤0.25
   MOSTLY_INEFFECTIVE, ≤0.5 NOT_VERY_EFFECTIVE, anything else EFFECTIVE.

**What `simulated: true` changes:**
- The roll is fixed at 1, so the call returns the **max roll** (`:3892`) — and it is the *finished* max roll, with
  step 7's multipliers and `ModifiedDamageAttr`'s cap already applied to it. A caller that wants the other 15 rolls
  cannot take 85–100 % of that number and be right: the multipliers commute with the roll only to within a HP of
  rounding, and a cap doesn't commute at all (False Swipe's `min(damage, hp − 1)` lands on every roll alike). The
  roll can be re-asked of the game instead, by scaling `calculateStabMultiplier` (`:3689`, `:3895`): it is a factor
  of the same product under the same `toDmgValue`, and reads nothing off the mon it is called on.
- No strong-winds message.
- Flash Fire's tag, Volt Absorb's heal and Sturdy's tag are skipped.
- `FormBlockDamageAbAttr.apply` returns early (`src/data/abilities/ab-attrs.ts:5486-5489`), so simulated damage
  **ignores Disguise and Ice Face**.

Crit isn't rolled; it's the `isCritical` input. Nothing is consumed and no berries trigger.

**Not in `getAttackDamage` at all:**
- Focus Band, Sturdy survival and the enemy endure token (`Pokemon.damage`, `src/field/pokemon.ts:4072-4089`);
- boss segments (`EnemyPokemon.damage`);
- berries.

Life Orb, Choice items, Expert Belt and Focus Sash don't exist: there's no key for them in `modifierTypeInitObj`
(`src/modifier/modifier-type.ts:1819`). §8 lists the held items that do.

**Random roll:** `randBattleSeedIntRange(85, 100) / 100` gives 16 uniform values. No call gives the min roll without
drawing RNG. Scaling the max (`floor(max × r)`) is off by a few HP, because the post steps re-floor. It is structurally
wrong for False Swipe, whose cap comes after the roll.

**Per hit:** the call computes **one hit**. The Multi-Lens factor reads `source.turnData` (`src/modifier/modifier.ts:2765-2779`):
- if `hitsLeft === hitCount` (the first strike): ×(1 − 0.25 × stacks);
- else if `hitCount − hitsLeft ≠ stacks + 1`: ×0.25;
- otherwise (Parental Bond's strike): ×1.

`TurnInitPhase` resets turnData (`src/phases/turn-init-phase.ts:65`, `src/field/pokemon.ts:5425-5427`) to `hitCount 0,
hitsLeft −1, moveEffectiveness null` (`src/data/pokemon-data.ts:333`, `:340`, `:348`). So at the command
prompt:
- Triple Axel reads its hit-1 power;
- a Multi-Lens holder gets **×0.25**, fixed damage included;
- the enemy AI's KO check has the same quirk (`src/field/pokemon.ts:6881`).

Set turnData explicitly (§2).

**Crit.** `getCriticalHitResult` (`:4030-4057`) works like this:
1. It never crits with `FixedDamageAttr`.
2. A crit is forced by `CritOnlyAttr`, `ConditionalCritAbAttr` (Merciless into a poisoned target), the `ALWAYS_CRIT`
   tag, or stage ≥ 3.
3. Otherwise it rolls `randBattleSeedInt([24, 8, 2, 1][clamp(stage, 0, 3)]) === 0`.
4. `BlockCritAbAttr` (Battle Armor, Shell Armor) or a `NoCritTag` (Lucky Chant) on the defender's side or both sides
   cancels it (`src/field/arena.ts:698`).

It draws battle RNG and returns one sample. For odds, use `def.getCritStage(atk, move)` (`src/field/pokemon.ts:1417-1432`)
with the same forcing and blocking rules. It adds up `HighCritAttr`, `CritBoosterModifier` (Scope Lens, Leek),
`TempCritBoosterModifier` (Dire Hit), Super Luck and `CritBoostTag` (Focus Energy). It writes `abilitiesApplied` for
Super Luck, so sandbox it. The chance is `[1/24, 1/8, 1/2, 1]`.

**Recommended call**
```
sandbox(s, () => def.getAttackDamage({ source: atk, move, ignoreAbility, isCritical: crit, simulated: true }))
```
Phases can still be queued on this path: Present's heal, and flyouts from ability calls that leave `simulated` out.
The sandbox mutes both. Cache the results per field state; don't recompute every frame.

**Standalone calls, safe in the sandbox:**
- `atk.getMoveType(move)` (`src/field/pokemon.ts:2640`, §4) is pure: `MoveTypeChangeAbAttr` gets `simulated = true`.
- `def.getMoveEffectiveness(atk, move, ignoreAbility, true)`.
- `move.calculateBattlePower(atk, def, true)`.
- `atk.getEffectiveStat(stat, { opponent: def })` is pure, unless `forDefend` is set against a Mega Sol user.

---

## 2. Multi-hit

A use's hit count is fixed once, on its first `MoveEffectPhase` (`turnData.hitsLeft === -1`, the fresh `PokemonTurnData` value, `src/data/pokemon-data.ts:333-340`), in this order (`src/phases/move-effect-phase.ts:148-158`): `MultiHitAttr` → Parental Bond (`AddSecondStrikeAbAttr`) → Multi-Lens (`PokemonMultiHitModifier`), then `turnData.hitCount = turnData.hitsLeft = n`. — draws battle RNG (2–5 roll); writes `turnData.hitCount`/`hitsLeft`, the attr's `multiHitType`, and `abilitiesApplied` (both ability calls are non-simulated).

**`MultiHitAttr`** (`src/data/moves/move.ts:2909`). `apply` (`:2937-2944`) runs `ChangeMultiHitTypeAttr` on the intrinsic type, stores the result in `this.multiHitType` (a write on the shared move object), then calls `getHitCount` (`:2958-2990`):
```ts
case MultiHitType.TWO_TO_FIVE: {
  const hitValue = new NumberHolder(user.randBattleSeedInt(20));
  applyAbAttrs("MaxMultiHitAbAttr", { pokemon: user, hits: hitValue });
  // >= 13 → 2, >= 6 → 3, >= 3 → 4, else 5
```
— draws battle RNG (TWO_TO_FIVE only); the ability call writes `abilitiesApplied`. Other types are pure.

`MultiHitType` (`src/enums/multi-hit-type.ts:1-7`): `TWO`=0, `TWO_TO_FIVE`=1, `THREE`=2, `TEN`=3, `BEAT_UP`=4. A bare `MultiHitAttr` is TWO_TO_FIVE (`move.ts:2918`).
- TWO_TO_FIVE: P(2)=P(3)=7/20, P(4)=P(5)=3/20, mean 3.1. Skill Link's `MaxMultiHitAbAttr` sets the roll to 0 → 5 (`src/data/abilities/ab-attrs.ts:4830-4838`). The game has no Loaded Dice.
- TWO: Double Kick (`move.ts:9471`), Dual Wingbeat (`:12169`). THREE: Triple Kick (`:9897`, power 10, acc 90) and Triple Axel (`:12165`, power 20, acc 90), both `.attr(MultiHitPowerIncrementAttr, 3).checkAllHits()`. TEN: Population Bomb (`:12434`, `checkAllHits`). BEAT_UP (`:10211`): 1 for the user plus 1 per party member whose `status` is unset or NONE (`:2980-2988`).
- Type override: `WaterShurikenMultiHitTypeAttr` (`move.ts:3050-3057`, the only `ChangeMultiHitTypeAttr` subclass) makes it THREE when `species.speciesId === SpeciesId.BATTLE_BOND_GRENINJA` (2658) `&& formIndex === 1`. Pure.

**Extra strikes.** `Move.canBeMultiStrikeEnhanced(user, restrictSpread = false, target?)` (`move.ts:1339`) is false for charging moves, status moves, `MultiHitAttr` / `SacrificialAttr*` moves, Pollen Puff on an ally, and a fixed exception list; with `restrictSpread` it is also false when `getMoveTargets` returns more than one target. — pure, except that `getMoveTargets` draws battle RNG for `RANDOM_NEAR_ENEMY` with ≥ 2 opponents (`src/data/moves/move-utils.ts:93`).
- Parental Bond (`src/data/abilities/init-abilities.ts:1241-1251`): `AddSecondStrikeAbAttr` adds 1 if `canBeMultiStrikeEnhanced(user, true, target)` (`ab-attrs.ts:1460-1472`). Its `MoveDamageBoostAbAttr(0.25)` hits the strike where `hitCount > 1 && hitsLeft === 1`, i.e. the last one, as `toDmgValue(damage × 0.25)` (`ab-attrs.ts:1506-1508`), inside `getAttackDamage` (`src/field/pokemon.ts:3956-3964`).
- Multi-Lens (`src/modifier/modifier.ts:2705`, max 2 at `:2781`): `apply` (`:2724-2752`) needs `canBeMultiStrikeEnhanced(user)` with no spread restriction. The count goes up by the stack (`:2755`). Damage (`:2765-2779`): first strike ×(1 − 0.25·stack); later strikes ×0.25, except the one at `hitCount − hitsLeft === stack + 1`, which is left to Parental Bond. Pure.

**Per-strike power.** `MultiHitPowerIncrementAttr.apply` (`move.ts:5196-5203`): `power = move.power * (1 + ((hitCount − max(hitsLeft, 0)) % maxHits))`, so Triple Axel is 20/40/60. Pure; it reads `turnData`, and `hitsLeft` drops in `MoveEffectPhase.end` (`move-effect-phase.ts:880`). `BeatUpAttr` (`move.ts:4613`) uses the same index to pick the member whose Attack sets power.

**Accuracy and early stop.** `MoveEffectPhase.hitCheck` (`move-effect-phase.ts:410-416`): strikes after the first always hit, unless the move has `CHECK_ALL_HITS` (`1 << 16`, `src/enums/move-flags.ts:47`) and the user lacks `MaxMultiHitAbAttr`. If no target is hit, `conductHitChecks` sets `hitCount = hitsLeft = 1` (`move-effect-phase.ts:245-249`), which ends the use. `end()` queues another strike only while `--hitsLeft >= 1` and `getFirstTarget()` finds an active, unfainted target (`move-effect-phase.ts:880`, `:956-963`), so a faint also ends it.

**AI heuristics, not damage** (pure unless noted):
- `MultiHitAttr.calculateExpectedHitCount` (`move.ts:3003-3040`) gives 3.1 / 5 (max) / 2 / 3 / 10 / max(1, partySize/2). Its accuracy term, `Math.min((accuracy / 100) × accMultiplier, 100)` (`:3034`), caps at 100 instead of 1.
- `Move.calculateEffectivePower` (`move.ts:1272-1317`): Triple Kick/Axel get ×6 or `47.07 × power/10` (`:1298`); other multi-hit moves get expected hits × power; the result is divided by charge/recharge/delay turns. Given a `pokemon`, it tests the `maxMultiHit` holder object rather than its value (`:1292`, `:1302`), so the ×6 and plain power × accuracy branches always win. Its `VariableMovePowerAbAttr` call is non-simulated → writes `abilitiesApplied`.

**Exact multi-hit damage with game code** (one sandbox; the HUD's copy is `fromGame` in `10-damage.js`):
```
mh    = move.getAttrs("MultiHitAttr")[0]
type  = mh && (Water Shuriken && speciesId 2658 && formIndex 1 ? THREE : mh.intrinsicMultiHitType)
counts= none → [1]; TWO_TO_FIVE → Skill Link ? [5] : [2 .35, 3 .35, 4 .15, 5 .15]; else [2 | 3 | 10 | beatUpCount]
extra = (Parental Bond && move.canBeMultiStrikeEnhanced(atk, true, def) ? 1 : 0)
      + (move.canBeMultiStrikeEnhanced(atk) ? multiLensStack : 0)
for each H = n + extra, k in 0..H-1:
   atk.turnData.hitCount = H; atk.turnData.hitsLeft = H - k        // restored by sandbox
   perHit[k] = def.getAttackDamage({ source: atk, move, simulated: true, isCritical }).damage
```
For a CHECK_ALL_HITS move with per-strike hit chance `a`, expected damage is `Σ_k a^(k+1) · perHit[k]` (stops at the first miss); otherwise it is `a · Σ_k perHit[k]`. Resolve HP and segments one strike at a time (§3), never on the sum.

---

## 3. Boss segments

`EnemyPokemon.damage(damage, ignoreSegments = false, preventEndure = false, ignoreFaintPhase = false)` (`src/field/pokemon.ts:7156-7192`):
```ts
const segmentSize = this.getMaxHp() / this.bossSegments;
let clearedBossSegmentIndex = this.isBoss() ? this.bossSegmentIndex + 1 : 0;
if (this.isBoss() && !ignoreSegments)
  [damage, clearedBossSegmentIndex] = calculateBossSegmentDamage(damage, this.hp, segmentSize, this.getMinimumSegmentIndex(), this.bossSegmentIndex);
if (globalScene.currentBattle.isClassicFinalBoss && this.formIndex === 0 && this.bossSegmentIndex < 1)
  damage = Math.min(damage, this.hp - 1);
```
Then comes `super.damage` (below). With `ignoreSegments`, the index is recomputed afterwards as `ceil(hp / segmentSize)`. `handleBossSegmentCleared` runs if the index dropped. — writes `hp` and `bossSegmentIndex`; queues phases; a wild boss's clear draws global RNG. `isBoss()` is `!!bossSegments` (`:7139`). `getMinimumSegmentIndex` (private, `:7194-7200`) is 1 for the classic final boss at form 0, else 0. `setBoss` starts `bossSegmentIndex` at `bossSegments − 1` (`:6707`; 0 for a non-boss, `:6700`), so 0 is the last bar.

`calculateBossSegmentDamage` is **exported** from `src/utils/damage.ts:22-66`. Pure:
```ts
const segmentIndex = currentSegmentIndex ?? Math.ceil(currentHp / segmentHp) - 1;
if (segmentIndex <= 0) return [damage, 1];
const segmentThreshold = segmentHp * segmentIndex;
const leftoverDamage = damage - (currentHp - Math.round(segmentThreshold));
if (leftoverDamage < 0) return [damage, segmentIndex + 1];
if (leftoverDamage === 0) return [damage, segmentIndex];
const segmentsBypassed = Math.min(Math.max(Math.floor(Math.log2(leftoverDamage / segmentHp)), 0), segmentIndex - minSegmentIndex);
return [toDmgValue(currentHp - segmentThreshold + segmentHp * segmentsBypassed), segmentIndex - segmentsBypassed];
```
Here `toDmgValue(v) = max(floor(v), 1)` (`src/utils/common.ts:369`).

`ignoreSegments` is true for an OHKO move's hit (`isOneHitKo`, `src/phases/move-effect-phase.ts:669,687`) and for most indirect damage: weather chip (`src/phases/weather-effect-phase.ts:53`), recoil and self-KO (`move.ts:2252-2422`), and KO tags (`src/data/battler-tags.ts:1360,2184`). Status chip calls `damage(…, false, true)` and **is** clamped (`src/phases/post-turn-status-effect-phase.ts:57`).

One hit deals at most `hp − segSize·idx` (down to the current boundary). The only exception is overflow past that boundary of at least `2^c · segSize` (c ≥ 1), which breaks `c` more segments, capped at `idx − minIdx`. A 2-segment boss at full HP H is one-shot only by a hit ≥ `H − round(H/2) + H` ≈ **1.5 × maxHp**; anything less stops at H/2. Each strike of a multi-hit move is clamped on its own and starts from the new index.

`handleBossSegmentCleared(segmentIndex)` (private, `pokemon.ts:7211-7252`) lowers `bossSegmentIndex` to `max(segmentIndex − 1, 0)`. **Wild** bosses (`!hasTrainer()`) get one stat raise per cleared segment. The stat comes from `weightedPick` over non-maxed effective stats, weighted by `getStat(s, false)` (`:7226`); `weightedPick` draws global RNG through `randSeedInt` (`src/utils/random.ts:60-62`). The raise is +1, or +2 on the segment that reaches index 0 (bosses with ≥ 3 segments) and on index 1 (≥ 5 segments) (`pokemon.ts:7235-7242`). The function always ends with `phaseManager.unshiftNew("StatStageChangePhase", …)` (`pokemon.ts:7246`); for trainer bosses `changes` is empty. Healing (berries, Leftovers) raises `hp` but never `bossSegmentIndex`, so HP above the current boundary is only buffer before the next clamp.

**Survival.** `Pokemon.damage` (`pokemon.ts:4072-4110`) checks these only when `!preventEndure && hp − damage <= 0`: the `ENDURING` tag (Endure), else the `STURDY` tag at `hp === maxHp`, else `ENDURE_TOKEN`, each lapsed when used. Failing those, `SurviveDamageModifier` (Focus Band, `src/modifier/modifier.ts:1520-1537`) saves on `randBattleSeedInt(10) < stack`, i.e. 10 % per stack (max 5), leaving 1 HP. Then `hp -= min(damage, hp)`, and a faint queues `FaintPhase` unless `ignoreFaintPhase`. — writes `hp`, lapses tags, draws battle RNG (Focus Band), queues messages/phases. `damageAndUpdate` passes `preventEndure = true` for INDIRECT results (`pokemon.ts:4142`), so none of these save from chip.
- The STURDY tag is only added by a non-simulated `getAttackDamage`, through `PreDefendFullHpEndureAbAttr` (full HP, maxHp > 1, damage ≥ hp; `ab-attrs.ts:310-324`) at `pokemon.ts:3995-3997`. `FixedDamageAttr` moves (Seismic Toss, Night Shade, Dragon Rage, Super Fang, Final Gambit, Psywave) return earlier (`:3799-3831`) but run the same step first (`:3814-3824`), so **at the pin Sturdy saves from them too**. OHKO moves return at `:3834-3842`; Sturdy blocks those separately with `BlockOneHitKOAbAttr`.
- Enemy Endure token (`EnemyEndureChanceModifier.apply`, `modifier.ts:3666-3676`) is rolled in `MoveEffectPhase.applyMoveDamage` whenever the enemy's **pre-clamp** damage ≥ `hp` (`move-effect-phase.ts:677-678`). It needs `!waveData.endured` and `randBattleSeedInt(100) < 2 × stack` (max 10 stacks); on success it adds `ENDURE_TOKEN` and sets `waveData.endured`. A boss hit the clamp would stop anyway can still spend it. — draws battle RNG; writes a tag and `waveData.endured`.
  The token saves **one** lethal hit. It is an `EnduringTag` with lapse type `AFTER_HIT` (`src/data/battler-tags.ts:4000-4001`): `Pokemon.damage` lapses it as `CUSTOM`, which keeps it (`pokemon.ts:4085-4086`, `battler-tags.ts:2136-2139`), and `MoveEffectPhase` removes it after that hit (`move-effect-phase.ts:846`). The next lethal hit that turn, a later strike of the same move included, KOs.

**Berries do not trigger on hit.** `BerryModifier` is applied only in `BerryPhase.eatBerries` (`src/phases/berry-phase.ts:33-82`), a turn-end phase that runs after `WeatherEffectPhase` and before `CheckStatusEffectPhase` (status chip) and `TurnEndPhase` (`src/phase-manager.ts:231-237`). The only other ways to eat one are Bug Bite / Pluck / Stuff Cheeks / Teatime (`EatBerryAttr`, `move.ts:3334`) and Cud Chew / Harvest. An opposing Unnerve (`PreventBerryUseAbAttr`) skips the phase for that mon (`berry-phase.ts:43-52`). Predicates (`getBerryPredicate`, `src/data/berry.ts:23-65`, pure):
- Sitrus: `getHpRatio() < 0.5`, with the ratio rounded to 0.01 (`pokemon.ts:1692-1694`), so 49.5 % doesn't trigger it. Enigma: any `turnData.attacksReceived` this turn with result SUPER_EFFECTIVE or EXTREMELY_EFFECTIVE. Both heal `toDmgValue(maxHp / 4)`, ×2 with Ripen (`DoubleBerryEffectAbAttr`), via `PokemonHealPhase` (`berry.ts:73-85`). They are separate modifiers, so both can fire in the same phase.
- Liechi–Salac raise Atk, Def, SpA, SpD and Spe in that order: the game takes the stat as `berryType − BerryType.ENIGMA` (`:42`, `:104`), because `BerryType` lists them in `Stat`'s order. They trigger at an HP ratio below 0.25 (or Gluttony's `ReduceBerryUseThresholdAbAttr` value) and stat stage < 6. Lansat and Starf build the holder but compare against a literal 0.25 (`:46-57`), so Gluttony doesn't reach them. Leppa: any move at 0 PP.
- Each trigger eats one (`consumed`, `modifier.ts:1833-1847`) unless Berry Pouch saves it (`PreserveBerryModifier`: `randBattleSeedInt(10) < 3·stack`, `:1882-1883`). Max stacks: Sitrus / Lum / Enigma / Leppa 2, others 3 (`:1849-1854`).

---

## 4. Move type / power overrides

`Pokemon.getMoveType(move, simulated = true)` (`src/field/pokemon.ts:2640-2672`), called on the user, applies in order:
1. `VariableMoveTypeAttr`s, with target `null` (nothing target-dependent);
2. `MoveTypeChangeAbAttr` (-ate abilities, Normalize, Liquid Voice), skipped for `CallMoveAttr` moves;
3. Tera Blast while Terastallized, or a Stellar Tera Starstorm, returns here;
4. the Ion Deluge arena tag, then the `ELECTRIFIED` tag.

Pure, except through Weather Ball (below). Cost is trivial.

`VariableMoveTypeAttr` subclasses (`src/data/moves/move.ts`):
- `FormChangeItemTypeAttr` (Judgment / Multi-Attack by Arceus / Silvally form, `:5681`)
- `TechnoBlastTypeAttr` (Genesect drive form, `:5722`)
- `AuraWheelTypeAttr` (Morpeko or a Morpeko fusion: form 1 → Dark, else Electric, `:5767`)
- `RagingBullTypeAttr` (`:5802`), `IvyCudgelTypeAttr` (`:5841`)
- `WeatherBallTypeAttr` (`:5887`)
- `TerrainPulseTypeAttr` (grounded users only, `:5946`)
- `HiddenPowerTypeAttr` (IV parity, `:5987`)
- `TeraBlastTypeAttr` (`:6042`), `TeraStarstormTypeAttr` (`:6086`)
- `MatchUserTypeAttr` (Revelation Dance, primary type, `:6114`)
- `CombinedPledgeTypeAttr` (`turnData.combiningPledge`, `:6150`)

Only Weather Ball has a side effect. `getEffectiveWeatherForMove` (`src/data/weather.ts:225-243`) applies `PreAttackWeatherOverrideAbAttr` without `simulated`, which writes `waveData`/`summonData.abilitiesApplied` when it applies (`src/data/abilities/apply-ab-attrs.ts:73-76`). So call it in the sandbox. Hunger Switch flips Morpeko's form at turn end (`PostTurnFormChangeAbAttr`, not while Terastallized; `src/data/abilities/init-abilities.ts:1787-1792`), so Aura Wheel alternates; the move uses this turn's `formIndex`.

**Power.** `Move.calculateBattlePower(source, target, simulated = false)` (`move.ts:1099`) returns the final power the damage formula uses: `VariablePowerAttr`s, `VariableMovePowerAbAttr`, ally boosts, the Tera 60 floor, auras, `TypeBoostTag`, type-boost items, Helping Hand, Supreme Overlord, terrain (all items and abilities in §1 step 5). Pass `simulated = true`, because the default is false. The `VariablePowerAttr`s get no simulated flag:
- `PresentPowerAttr` (`:5099-5127`) draws `randSeedInt(firstHit ? 100 : 80)` from the **global** Phaser RND. 0–40 → 40, 41–70 → 80, 71–80 → 120, 81–99 → heals the target ¼, sets `hitCount = hitsLeft = 1` and queues `PokemonHealPhase`. So 41 / 30 / 10 / 19 %. — draws global RNG; writes `turnData`; queues a phase.
- `DoublePowerChanceAttr` (Fickle Beam, `:4658`) and `MagnitudePowerAttr` (`:4938`) roll inside `executeWithSeedOffset(…, turn << 6, waveSeed)`, a seed fork that restores Phaser RND (`src/battle-scene.ts:2017-2031`). The value is fixed for the turn and the call leaves no trace.
- Values read at the command prompt, where `turnData` is fresh (reset in `TurnInitPhase`, `src/phases/turn-init-phase.ts:65`):
  - Bolt Beak / Fishious Rend double on `!target.turnData.acted` (`move.ts:11958-11962`) → read as doubled.
  - Payback doubles on `target.turnData.acted` or a BALL command (`:10648-10655`) → read as not doubled.
  - Assurance (`damageTaken > 0`, `:10656`) and Avalanche / Revenge (`TurnDamagedDoublePowerAttr` on `attacksReceived`, `:4902`) → read as not doubled.
- `LastMoveDoublePowerAttr` (Fusion Flare / Bolt, `:5211-5244`) reads `dynamicQueueManager.getLastTurnOrder()` (`src/dynamic-queue-manager.ts:142`). `TurnEndPhase.start` clears that order (`src/phases/turn-end-phase.ts:29`), so the move never reads as doubled at the prompt.
- Low Kick / Grass Knot (`WeightPowerAttr`, `move.ts:4723`) call `getWeight()`: the current form's weight (`species.forms[formIndex]` when the species has forms) less Autotomize, then `WeightMultiplierAbAttr` applied without `simulated` (`pokemon.ts:2467-2481`) → writes `abilitiesApplied` for Heavy / Light Metal. Gyro Ball (`move.ts:4778`, simulated `getEffectiveStat`), Stored Power (`:5057`), Knock Off, Facade, Hex, Acrobatics and Brine (`MovePowerMultiplierAttr` predicates) are pure reads.

**Category.** `Pokemon.getMoveCategory(target, move)` (`pokemon.ts:1440-1444`) applies `VariableMoveCategoryAttr`:
- `PhotonGeyserCategoryAttr`: Atk > SpA by `getEffectiveStat` (`move.ts:5545`).
- `TeraMoveCategoryAttr`: Tera Blast / Tera Starstorm while Terastallized, ignoring abilities and items (`:5567`).
- `ShellSideArmCategoryAttr`: compares physical and special `getBaseDamage` (`:5616-5650`). On a tie it draws battle RNG with `randBattleSeedInt(2)` (`:5645`).

`getAttackDamage` applies the same attrs itself (`pokemon.ts:3769-3771`), so even a simulated damage call draws on that tie. Use the sandbox.

---

## 5. Accuracy, priority, turn order

**Hit chance**: `MoveEffectPhase.hitCheck` (`src/phases/move-effect-phase.ts:348`) runs once per target on every strike,
because each hit gets its own MoveEffectPhase. The checks, in order:
1. A self-targeted move hits (`:353`). A target that is off the field gives TARGET_NOT_ON_FIELD. In doubles, Commander makes the move miss (`:359-370`).
2. `bypass = fieldTargeted || checkBypassAccAndInvuln(target)` (`:373`). A semi-invulnerable target misses unless `bypass` holds or the move has a matching `HitsTagAttr` (`:374-378`).
3. Protect gives PROTECTED (`:380`). Magic Coat or Magic Bounce gives REFLECTED (`:385`). A field-targeted move then hits (`:390`).
4. If `target.getMoveEffectiveness(user, move, false, false, …)` returns 0, the result is NO_EFFECT (`:400`). This is also where a Prankster
   status move fails against a Dark type: `Move.isTypeImmune` (`src/data/moves/move.ts:475`, called from `src/field/pokemon.ts:2744`).
5. `acc = move.calculateBattleAccuracy(user, target)` (`move-effect-phase.ts:408`). Strikes after the first hit without a roll, unless the move is
   CHECK_ALL_HITS and the user lacks Skill Link (`MaxMultiHitAbAttr`) (`:412-417`).
6. The move hits if `bypass` holds, the target has `ALWAYS_GET_HIT`, the target has `TELEKINESIS` (not against OHKO moves), or `acc === -1` (`:419-426`).
7. Otherwise `user.randBattleSeedInt(100) < acc * user.getAccuracyMultiplier(target, move)` decides hit or miss (`:428-435`).

So **P(hit) = min(ceil(acc·mult), 100) / 100**, and 0 when acc·mult ≤ 0. `hitCheck` draws from the battle RNG in step 7 only.
Its sub-calls write ability bookkeeping. The caller `conductHitChecks` (`:216`) writes `moveHistoryEntry.result`, and when
nothing hits it sets `turnData.hitCount/hitsLeft = 1`.
`checkBypassAccAndInvuln` (`:455`) is pure. It is true for `AlwaysHitAbAttr` on either side (No Guard), a `ToxicAccuracyAttr` move used by a
Poison type, the user's `IGNORE_ACCURACY` tag when its last Lock-On or Mind Reader targeted this target, and field-targeted moves.
- `move.calculateBattleAccuracy(user, target, simulated = false)` (`src/data/moves/move.ts:1055`) returns an integer, or −1 for a move that never misses.
  It applies these in order:
  1. `VariableAccuracyAttr`. Thunder/Hurricane: 50 in sun, −1 in rain (`:5446`). Bleakwind/Wildbolt/Sandsear Storm: −1 in rain (`:5472`).
     Minimize: −1 (`:5493`). Toxic by a Poison type: −1 (`:5514`). Blizzard in hail or snow: −1 (`:5526`).
     OHKO moves: 0 below the target's level, else `30 + 100·(1 − lvT/lvU)` (`:6356`).
  2. Wonder Skin on the target sets a status move of accuracy ≥ 50 to 50 (`src/data/abilities/ab-attrs.ts:607`). A −1 returns here.
  3. Wide Lens adds `5·stack`, not for OHKO moves (`src/modifier/modifier.ts:2694`; the 5 is at `src/modifier/modifier-type.ts:2104`).
  4. Fog: `floor(×0.9)` (`move.ts:1077`). Gravity, not for OHKO moves: `floor(×1.67)` (`:1085`).

  Pass `true`, and **call it inside the sandbox**: the weather attrs call `getEffectiveWeatherForMove`, which applies
  `PreAttackWeatherOverrideAbAttr` without `simulated` (`src/data/weather.ts:227`).
- `user.getAccuracyMultiplier(target, move)` (`src/field/pokemon.ts:3531`) returns 1 for OHKO moves. Otherwise:
  - The accuracy stage comes from the user, plus X Accuracy (`TempStatStageBoosterModifier`, `:3548`), capped at +6. The evasion stage comes from the target.
  - Unaware on the target ignores the accuracy stage. Keen Eye, Mind's Eye or Unaware on the user, or Chip Away (`IgnoreOpponentStatStagesAttr`), ignores the evasion stage.
  - `ExposedTag` (Foresight, Miracle Eye) caps evasion at 0 (`:3553`).
  - Stage ratio: `(3+min(d,6))/3` when accuracy is ahead by d, else `3/(3+min(−d,6))`.
  - The ratio is multiplied by `StatMultiplierAbAttr` on accuracy (Compound Eyes 1.3, Victory Star 1.1 also for allies, Hustle 0.8 on physical moves).
    It is divided by the same attr on the target's evasion (Sand Veil or Snow Cloak 1.25 in their weather, Tangled Feet 2 while confused).

  **Call it inside the sandbox**: every `applyAbAttrs` here omits `simulated`, so each call writes `abilitiesApplied`. None of these attrs has `showAbility` set.

**Priority**: `move.getPriority(user, simulated = true)` (`move.ts:1195`) = base priority + `IncrementMovePriorityAttr` (Grassy Glide) +
`ChangeMovePriorityAbAttr` (`ab-attrs.ts:3623`): Prankster status moves +1 (`src/data/abilities/init-abilities.ts:1080`),
Gale Wings Flying moves at full HP +1 (`:1202`), Triage +3 on `healingMove()` moves (`MoveFlags.HEALING_MOVE`), draining attacks and Pollen Puff included (`:1409`). Pure. Gale Wings calls `getMoveType`, which needs the sandbox when the type can change (§4).
Bracket: `move.getPriorityModifier(user, true)` (`move.ts:1203`) returns FIRST when the user has a `BYPASS_SPEED` tag.
It returns LAST through `ChangeMovePriorityInBracketAbAttr` (`ab-attrs.ts:3647`): Stall on any move (`init-abilities.ts:718`),
Mycelium Might on status moves (`:2097`). Otherwise NORMAL. Pure.
Psychic Terrain stops a move with priority > 0 that is not spread or field-targeted when it targets a grounded opponent.
The check is `Arena.isMoveTerrainCancelled` (`src/field/arena.ts:484`, pure), called in `MovePhase.thirdFailureCheck` (`src/phases/move-phase.ts:858`).

**Turn order**: `TurnStartPhase.start` (`src/phases/turn-start-phase.ts:51`) runs these steps:
1. `getCommandOrder` (`:21`, pure) keeps field order (player side, then enemy side) but puts every non-FIGHT command before every FIGHT (`:32-39`).
   Switches, balls and runs unshift their phases (`:114-135`), so they resolve before any move, and a switch-in takes the hit.
2. Tera commands push a `TeraPhase` (`:57-68`).
3. For each FIGHT command, in speed order (`:71-78`):
   - `BypassSpeedChanceAbAttr.canApply` (Quick Draw, `ab-attrs.ts:5624`): `!simulated && randBattleSeedInt(100) < 30`. The draw happens before the check that the move is an attack.
   - `BypassSpeedChanceModifier.apply` (Quick Claw, `modifier.ts:1555`): `randBattleSeedInt(10) < stack`, any move, up to 3 stacks.

   Either one adds the `BYPASS_SPEED` tag. This draws from the battle RNG, writes the tag and queues a message.
   `BypassSpeedTag.canAdd` (`src/data/battler-tags.ts:3781`) refuses the tag through `PreventBypassSpeedChanceAbAttr` (Mycelium Might on a status move).
4. Each FIGHT command pushes a `MovePhase` (`turn-start-phase.ts:153`). `PhaseManager.checkDynamic` (`src/phase-manager.ts:319`) parks the phase in the
   `MovePhasePriorityQueue` and leaves a marker in the queue. `CheckInterludePhase` and the turn-end phases follow (`turn-start-phase.ts:98-104`, §21).
5. Each time a marker comes up, `MovePhasePriorityQueue.pop` (`src/queues/move-phase-priority-queue.ts:73`) re-sorts the moves still waiting.
   It runs `sortInSpeedOrder` (`src/queues/pokemon-phase-priority-queue.ts:8`), then a stable sort (`sortPostSpeed`, `move-phase-priority-queue.ts:23-36`) by
   `timingModifier` (Quash, After You), then priority descending, then bracket descending. A speed change mid-turn reorders the rest of the turn.

`sortInSpeedOrder(list)` (`src/utils/speed-order.ts:21`) returns a new array:
1. `groupPokemon` (`:91`) groups consecutive entries of the same mon.
2. `shufflePokemonList` (`:32`) shuffles the groups with `randSeedShuffle` (Fisher–Yates on `Phaser.Math.RND`, `src/utils/common.ts:150`).
   The shuffle runs inside `executeWithSeedOffset(…, turn * 1000 + groupCount, waveSeed)`. That function (`src/battle-scene.ts:2017`)
   re-sows the RNG and afterwards restores `RND.state()`, `rngOffset` and `rngSeedOverride`.
3. `sortBySpeed` (`speed-order.ts:57`) does a stable sort by `getEffectiveStat(SPD)` descending, then reverses the whole list when a `TRICK_ROOM` tag applies.
   `turnCommandManager.setOrder`, which tests and Mystery Encounters use, replaces the speed sort.

Net effect: **pure**. It forks the seed and moves neither the global nor the battle stream, and the speed read is simulated.
A speed tie is therefore **not a coin flip**. `waveSeed`, the turn, the number of groups and the input order fix the result,
and the function is exported. In singles, the first pop sorts the two MovePhases in field order (player, then enemy).
So `sortInSpeedOrder([playerMon, enemyMon])` at the command prompt, with the same `currentBattle.turn`, names the tie winner.
Checked once on a live tab (#158): a forced tie in a double, the list in field order (player slots, then enemy slots), named the order the moves ran in.

To rank moves before the turn, use the key `[priority, bracket, speed]`. Speed is `getEffectiveStat(Stat.SPD)` (`pokemon.ts:1456`), which includes
stat items, speed abilities, Tailwind ×2, Grass/Water Pledge ×¼, Slow Start ½, paralysis ½ and Unburden ×2 (`:1543-1560`).
Reverse the speed order under Trick Room. It is safe to call without the sandbox (`simulated` defaults to true).
Break ties with `sortInSpeedOrder`. Quick Claw puts the holder in the FIRST bracket with probability 0.1·stack; Quick Draw does so with 0.3, on attacks only.
The HUD's version is `actionOrder` in `30-planner.js`.

**A target that leaves the field before a move resolves.** In a double, `FaintPhase` calls
`globalScene.redirectPokemonMoves(pokemon, allyPokemon)` when the fainted mon has a field ally
(`src/phases/faint-phase.ts:197-201`); a forced switch-out calls it too (`src/data/moves/move.ts:7329`,
`src/data/abilities/ab-attrs.ts:5806`). `MovePhasePriorityQueue.redirectMoves`
(`src/queues/move-phase-priority-queue.ts:49-71`) rewrites `targets[0]` of each still-queued `MovePhase` to the ally's
battler index, and nothing else: the move is the one chosen for the fainted mon. It applies only to a single-target
move (`:60`) aimed at the removed mon (`:61`) by one of its opponents (`:62`), and only while the ally is active
(`:56`). Those phases were built from this turn's commands (`src/phases/turn-start-phase.ts:153-159`), and
`turnCommands` is cleared when the turn ends (`src/battle.ts:173-178`), so the redirect never reaches a later turn.

**Move conditions, restrictions, miss effects and recoil.** A `Move` keeps its conditions in three private lists, `conditions`
(`src/data/moves/move.ts:186`), `conditionsSeq2` (`:190`) and `conditionsSeq3` (`:227`), chosen by
`condition(c, checkSequence)` (`:507-524`). Fake Out, First Impression and Mat Block each put a fresh
`FirstMoveCondition` in `conditionsSeq3` (`:10215-10217`, `:11595-11596`, `:11281`). Gigaton Hammer and Blood Moon share
one `consecutiveUseRestriction` (`src/data/moves/move-condition.ts:292-295`), a `MoveRestriction` whose `i18nkey` is
`"battle:moveDisabledConsecutive"`, pushed onto the private `restrictions` list (`move.ts:601`). Thrash, Petal Dance,
Outrage and Raging Fury add a self `FRENZY` tag of 2–3 uses (`AddBattlerTagAttr(FRENZY, true, false, 2, 3)`,
`move.ts:9503`, `:9637`, `:10033`, `:12227`). `FrenzyTag` is a `MoveLockTag` (`src/data/battler-tags.ts:1625-1690`):
each `AFTER_MOVE` lapse (`src/phases/move-end-phase.ts:37-39`) ticks it down and, while it lasts and the use's
result was SUCCESS, queues the next use as `IGNORE_PP`, re-rolling a `RANDOM_NEAR_ENEMY` target
(`battler-tags.ts:1640-1647`, `:1662-1664`). A miss, no effect or failure ends the lock and deals no damage;
confusion (`randBattleSeedIntRange(2, 5)` turns) comes only once the count has run down to 0 (`:1686-1688`). Crash damage is
`crashDamageFunc` (`move.ts:6424-6438`), on the Jump Kick moves. `RecoilAttr(useHp = false, damageRatio = 0.25,
unblockable = false)` (`move.ts:2211`) takes `damageRatio` of the user's max HP when `useHp` is set, else of
`turnData.totalDamageDealt` (`:2250`); Chloroblast is `RecoilAttr(true, 0.5)` (`:12232-12233`). A move's `chance` is a
required constructor argument (`:267`), −1 on every move whose effect doesn't roll; `StatusEffectAttr`,
`StatStageChangeAttr` and `AddBattlerTagAttr` treat a negative chance or 100 as certain (`:3071-3072`, `:3923-3924`,
`:6513-6514`), reading it through `getMoveChance` (`:1762-1763`).

**Charging, interrupts and the conditions that read a command.** A `ChargingAttackMove` charges when its user lacks
`CHARGING` (`src/phases/move-phase.ts:201-205`) and spends its PP then (`:207-210`). `MoveChargePhase.end`
(`src/phases/move-charge-phase.ts:72-87`) unshifts the attack the same turn with FIRST timing when an
`InstantChargeAttr` holds, else queues it for next turn (§6 step 1). Solar Beam and Solar Blade charge instantly in sun
or harsh sun (`WeatherInstantChargeAttr`, `src/data/moves/move.ts:9620-9622`, `:11623-11625`). `SemiInvulnerableAttr`
adds its tag (Dig: UNDERGROUND) for the charge turn (`move.ts:6476-6482`), and the user's own release lapses it
(`src/phases/move-effect-phase.ts:141`), so a faster attacker misses it on the release turn (step 2 above). Earthquake
hits and doubles into UNDERGROUND (`move.ts:9663-9664`). Focus Punch (`move.ts:10272-10279`, priority −3) carries
`PreUseInterruptAttr` on `turnData.attacksReceived.some(r => r.damage > 0)`: any damaging hit taken earlier in the turn,
an ally's included, cancels it in `MovePhase.firstFailureCheck` (`move-phase.ts:278`, `:481-491`). Sucker Punch and
Thunderclap pass `failIfTargetNotAttackingCondition` (`src/data/moves/move-condition.ts:133-143`) only when the
target's `turnCommands` entry is FIGHT with a non-STATUS move and the target has not `turnData.acted`
(`move-phase.ts:153`): a switch, ball or status command fails it, and so does a target that already moved.

---

## 6. Enemy AI move choice

**Who decides what.** The `EnemyPokemon` constructor sets `aiType = boss || hasTrainer() ? SMART : SMART_RANDOM`
(`src/field/pokemon.ts:6677`): trainer mons and bosses (wild or trainer) are SMART, wild non-bosses SMART_RANDOM. A
Mystery Encounter's enemy config can override it (`src/data/mystery-encounters/utils/encounter-phase-utils.ts:354`);
the only one that does sets SMART (`src/data/mystery-encounters/encounters/slumbering-snorlax-encounter.ts:104`).
Nothing sets RANDOM ("No enemy should spawn with this AI type", `src/field/pokemon.ts:6842`).
`trainer.config.isBoss` only moves the switch threshold (§7).

**When.** `TurnInitPhase.start` resets each active mon's `turnData`, then queues `CommandPhase` for our slots and
`EnemyCommandPhase` for the foe's, in field order (`src/phases/turn-init-phase.ts:60-75`). So the enemy decides after
our command is in `turnCommands`. The move conditions that read it (Sucker Punch, Thunderclap, Upper Hand;
`src/data/moves/move-condition.ts:133-142,166-175`) are the three the AI skips. What still sees our command is
Payback's power, doubled when our command is a ball (`src/data/moves/move.ts:10649-10654`), through the KO filter's
damage call.

**`EnemyPokemon.getNextMove`** (`src/field/pokemon.ts:6798`). It draws battle RNG (below), writes
`summonData.moveQueue` (splices it, or clears it by assigning a new array, `:6814`), and logs to the console. The scoring calls it makes have their own
side effects (see the end of this section).
1. **Move queue** (`:6801-6814`). It returns the first queued move that is virtual (`isVirtual(useMode)`) or usable
   from the moveset (`isUsable(this, isIgnorePP(useMode), true)`), dropping the entries before it. Otherwise it clears
   the queue. This covers charging moves, Outrage/Rollout locks and Bide. `isVirtual` is
   `useMode >= MoveUseMode.INDIRECT`: INDIRECT 3 (Dancer), FOLLOW_UP 4 (move-calling moves), REFLECTED 5,
   DELAYED_ATTACK 6 (`src/enums/move-use-mode.ts:22-77`, `:103-105`). A virtual entry skips the moveset lookup and
   `isUsable`; NORMAL 1 and IGNORE_PP 2 must pass both.
2. **Pool** (`pokemon.ts:6817`): moveset entries with `PokemonMove.isUsable(this, false, true)[0]`
   (`src/data/moves/pokemon-move.ts:57`). That excludes `(N)` moves and moves out of PP, plus selection restrictions
   (`isMoveSelectable`: Disable, Taunt, Torment, Encore, Imprison…). An empty pool means **Struggle** with
   `IGNORE_PP` (`pokemon.ts:7033-7037`).
3. A single move in the pool is used (`:6821`). **Encore** (`getTag(EncoreTag)`) with its move in the pool: that move
   (`:6830-6839`).
4. RANDOM: `movePool[randBattleSeedInt(len)]` (`:6843-6846`).
5. **KO filter** (`:6854-6898`), for SMART and SMART_RANDOM:
   ```ts
   move.category !== MoveCategory.STATUS && moveTargets.some(p =>
     !isMoveWeatherCancelled(this, move) && !isMoveTerrainCancelled(this, [p.getBattlerIndex()], move)
     && (move.applyConditions(this, p, -1) || [SUCKER_PUNCH, UPPER_HAND, THUNDERCLAP].includes(move.id))
     && p.getAttackDamage({ source: this, move, ignoreAbility: !p.waveData.abilityRevealed,
          ignoreAllyAbility: !p.getAlly()?.waveData.abilityRevealed, isCritical, simulated: true }).damage >= p.hp)
   ```
   `ATTACKER`-target moves (Counter) are skipped first. `moveTargets` comes from `getMoveTargets`
   (`src/data/moves/move-utils.ts:55`), which draws battle RNG for `RANDOM_NEAR_ENEMY` (`:93-94`). `isCritical` is
   set only for `CritOnlyAttr` or Laser Focus (`ALWAYS_CRIT`). In words: if any damaging move's simulated single-hit
   damage reaches a foe's current HP, only those moves stay in the pool. The simulated call is §1–§5's: max roll, and
   our unrevealed abilities are ignored.
6. **Targets** (`pokemon.ts:6906`): `getNextTargets(moveId)` for every move in the pool (below).
7. **Score** (`:6907-6979`). A move's score is the max over its targets, and the loop stops at `BattlerIndex.ATTACKER`
   (no targets gives `-Infinity`). Per target:
   ```ts
   score = move.getUserBenefitScore(this, t, move)
         + move.getTargetBenefitScore(this, t, move) * (t on the enemy's side ? 1 : -1);   // NaN → 0
   if ((move.isUnimplemented || !move.applyConditions(this, t, -1)) && !exempt) score = -20;
   else if (weather- or terrain-cancelled) score = -20;
   else if (move.is("AttackMove")) {
     eff = t.getMoveEffectiveness(this, move, !t.waveData.abilityRevealed, undefined, undefined, true);
     foe: score *= eff, and ×1.5 if this.isOfType(move.type);  ally: if (eff) score /= eff, and /1.5 for STAB
     score ||= -20;
   }
   ```
   `move.type` is the base type. The scoring pieces are called, not re-implemented:
   - `Move.getUserBenefitScore` (`src/data/moves/move.ts:1010`): the sum over attributes and conditions.
     `FirstMoveCondition` gives +10 or −20 (`src/data/moves/move-condition.ts:53-63`), `HighCritAttr` +3, and
     `CritOnlyAttr` +5 (`src/data/moves/move.ts:1954,1966`). A move that costs its user scores it too: `RecoilAttr`
     `floor(power/5/−4)` (`:2261-2263`); `SacrificialAttr` and `SacrificialAttrOnHit` −20 on a boss, else
     `ceil(((1−hpRatio)·10−10)·(eff−0.5))` (`:2289-2297`, `:2327-2335`); `HalfSacrificialAttr` −10 on a boss, else the
     same on `hpRatio/2` (`:2371-2379`). So recoil is always ≤ 0, the sacrificial ones negative only while the target's effectiveness `eff` > 0.5.
   - `Move.getTargetBenefitScore` (`src/data/moves/move.ts:1031`): the sum over attributes. A `selfTarget` attribute is
     scored on the user, sign-flipped when the target isn't the user. If the target is a Tatsugiri commanding its ally,
     the result is `20 × (same side ? −1 : 1)` instead (`:1034-1036`).
   - `AttackMove.getTargetBenefitScore` (`:1418`) is `super − attackScore`. `attackScore` starts as
     `(eff−1)²·(eff<1 ? −2 : 2)` with `eff = getAttackTypeEffectiveness(this.type, { source, move })`. It is ×2 when
     the user's other attacking stat is ≤ 0.75× the one this move uses (×1.5 at ≤ 0.875). Then
     `floor(power / 5)` is added, with `power` from `calculateEffectivePower()` through `VariablePowerAttr`. It is pure,
     except for Present (below).
   - Attribute scores include `StatusEffectAttr` (`floor(chance × −0.1)`, −10 when guaranteed, if `canSetStatus`,
     `:3082-3088`), `AddBattlerTagAttr` (`floor(tagScore × chance/100)`, `:6582`) and `MultiHitAttr` −5 (`:2946`).
   - `StatStageChangeAttr` (`:3943-3994`) counts only the stages still under ±6: `levels·4 ∓ 2` per stat. A game
     quirk: a self-targeted SpA boost, and a target SpD drop, score only if the user knows a *physical* attack
     (`:3972-3986` test `PHYSICAL`, as for Atk and Def).
8. **Pick** (`pokemon.ts:6984-7012`). The pool is sorted by score, descending and stable. The index starts at 0.
   - SMART_RANDOM: `while (i < len−1 && randBattleSeedInt(8) >= 5) i++`, so it advances with chance 3/8.
   - SMART: `while (i < len−1 && ratio >= 0 && randBattleSeedInt(100) < round(ratio·50)) i++`, where
     `ratio = score[i+1]/score[i]`. It advances with chance `clamp(round(ratio·50), 0, 100)/100`, and the draw is made
     even when that is 0. Two negative scores give ratio > 1 and a certain advance to the worse move. `0` followed by
     `0` is NaN, which stops.

**`getNextTargets(moveId)`** (`src/field/pokemon.ts:7046`). It draws battle RNG. A spread move (`multiple`) returns
every active target. For a single target, each candidate's `getTargetBenefitScore × (same side ? 1 : −1)` is sorted
descending. If the lowest is < 1, `|lowest−1|` is added to all. Candidates are dropped from the first weight below
top/2. Then `randBattleSeedInt(Σw)` is compared with the cumulative weights (`:7112`). `Battle.randSeedInt` returns
without drawing when range ≤ 1 (`src/battle.ts:486-489`), and otherwise draws `floor(U·Σw)` even for a non-integer
Σw. No candidate: `[ATTACKER]` for `CounterDamageAttr`, else `[]`.

**Singles: the call returns the real choice.** The battle stream re-seeds from `shiftCharCodes(battleSeed, turn << 6)`
whenever `battleSeedState` is null (`src/battle.ts:492-500`). `incrementTurn` nulls it (`:173-178`). Between our
command prompt and `EnemyCommandPhase` in a single battle, nothing draws from it:
- our `CommandPhase` draws only through `getMoveTargets` (`src/phases/command-phase.ts:279`), and one opponent means
  `randSeedInt(1)`, which doesn't draw;
- the switch check before `getNextMove` uses only a seed fork (§7).

So `getNextMove()` at the command prompt, inside `sandbox` with `summonData.moveQueue` saved and restored, returns
**the move and target the enemy will use**, not a sample. Checked on a live tab (#158): 69 of 69 enemy moves over
waves 1–12, move and target, singles 32 and doubles 37, wild, trainer and boss, with no sandbox breach and the battle
stream at the real call equal to the stream the prediction started from. That includes a queued move and picks the
distribution gave 4–5 %. In doubles it holds when every foe is called **in field order inside one sandbox**, so slot 1's
call sees slot 0's draws. The exceptions:
- **Our random-target moves** (`RANDOM_NEAR_ENEMY` with two or more opponents) draw in our `CommandPhase` first. On a live
  tab one such draw changed the pick (Charm → Absorb), and a prediction replayed after the same draw matched. Predict per
  candidate command: make that draw, then call `getNextMove`.
- **Present:** its power draws the *global* stream (`randSeedInt`, `src/data/moves/move.ts:5108`), which the prompt
  can't pin down.
- **Payback into a ball command** (above).
- **Trainer mons:** they may switch instead (§7).

**The HUD makes this call** (`sceneExactMoves`, #183): this turn's plan is played on its one outcome at depth 1, and
`20-enemy-ai.js` still re-implements the procedure for everything that has no fixed draw to reproduce — later turns,
`aiReplay`, and the oracle the exact call is checked against at a pin bump. Two orderings the call has to keep, both
from §7's `EnemyCommandPhase`: the **switch check comes first**, so a foe the trainer switches out is never asked and
never spends a draw; and a **skipped** command (a Commander Tatsugiri) *is* still written, so that foe is asked and
does spend its draws — it simply never acts.

**Side effects of the scoring calls (sandbox them):**
- `applyConditions`: consecutive Protect draws `user.randBattleSeedInt(3^n)` (`src/data/moves/move.ts:6831`), and some
  conditions queue messages.
- `getMoveEffectiveness`: Tera Shell writes and reads `turnData.moveEffectiveness` (`src/field/pokemon.ts:2725`).
- `PresentPowerAttr.apply`: draws global RND, writes `turnData.hitCount`/`hitsLeft`, and can queue a
  `PokemonHealPhase` (`src/data/moves/move.ts:5099-5125`).
- `getAttackDamage` → `getMoveTargets`: draws battle RNG in doubles.
- `isMoveWeatherCancelled` and `isMoveTerrainCancelled` are pure (`src/field/arena.ts:330,484`).

**Replaying the choice against a mon that isn't its target yet** (`aiReplay`). These are the same steps with one
target of ours, which may be on the bench or in a hypothetical state (§14). Every scoring method takes the target as
an argument, so nothing needs it on the field; the terrain check gets our slot 0. A move on the foe's own side
(`USER`, `USER_SIDE`…) is aimed at the foe itself by `getNextTargets`, with sign +1, so a setup move keeps its real
score. Because `StatStageChangeAttr` counts only stages under the cap, the AI keeps picking setup at about the same
rate until it's capped or the KO filter narrows the pool to attacks.

---

## 7. Enemy switch logic (EnemyCommandPhase) — confirmation

`EnemyCommandPhase.start` (`src/phases/enemy-command-phase.ts:32-106`). It writes `currentBattle.turnCommands[slot+2]`,
`preTurnCommands` (Tera) and `enemySwitchCounter`, and calls `this.end()`.
```ts
if (battle.double && enemy.hasAbility(COMMANDER) && enemy.getAlly()?.getTag(COMMANDED)) this.skipTurn = true;
if (trainer && enemy.getMoveQueue().length === 0 && !enemy.isTrapped()) {
  const scores = trainer.getPartyMemberMatchupScores(enemy.trainerSlot, true);
  if (scores.length > 0) {
    const own = avg(enemy.getOpponents().map(o => enemy.getMatchupScore(o)));
    const mult = 1 - (battle.enemySwitchCounter ? 0.1 ** (1 / battle.enemySwitchCounter) : 0);
    if (trainer.getSortedPartyMemberMatchupScores(scores)[0][1] * mult >= own * (trainer.config.isBoss ? 2 : 3)) {
      turnCommands[slot] = { command: POKEMON, cursor: trainer.getNextSummonIndex(enemy.trainerSlot, scores), args: [false], skip };
      battle.enemySwitchCounter++; return this.end();
}}}
turnCommands[slot] = { command: FIGHT, move: enemy.getNextMove(), skip };   // + TERA pre-turn command if shouldTera
battle.enemySwitchCounter = Math.max(battle.enemySwitchCounter - 1, 0);
```
The HUD's `predictSwitches` (`20-enemy-ai.js`) follows this rule. The pieces:
- **`Trainer.getPartyMemberMatchupScores`** (`src/field/trainer.ts:541`). It scores each non-fainted bench mon of the
  slot's trainer by `getMatchupScore` against our field, halved per legendary. With `forSwitch`, the score is also
  scaled by each hazard's `getMatchupScoreMultiplier` on the enemy side (`:564-567`). No RNG, no writes beyond
  `getMatchupScore`'s. `getSortedPartyMemberMatchupScores` (`:576`) is pure.
- **`Trainer.getNextSummonIndex`** (`:587`). It picks the top score, and breaks a tie with `randSeedInt` inside
  `executeWithSeedOffset(…, turn << 2)` (`:605-608`). That is a seed fork: the global RND state is restored and the
  battle stream is untouched.
- **`Pokemon.getMatchupScore`** (`src/field/pokemon.ts:2920`) passes `simulated: false` for the opponent's second type
  (`:2935-2939`). Under strong winds that queues a message (`:2854-2862`), so keep it in the sandbox. It also reads
  `isActive` and effective Speed. It returns `(atkScore + defScore) × min(hpDiffRatio, 1)` (`:3002`), where
  `hpDiffRatio = hpRatio + (1 − oppHpRatio)` on two-decimal HP ratios (`:2980-2986`, rounding at `:1693`): ×1.25 when
  this mon's Speed is `>=` the opponent's effective Speed (`:2923-2925`, `:2996-2997`), else ×0.5 at
  0.2 < hpRatio ≤ 0.4 (`:2998-3000`). An on-field mon at ≤ 0.2 takes a "dying" branch instead (`:2985-2995`), which a
  bench mon never reaches. Off the field, this mon's Speed is the raw `getStat(SPD, false)` (`:2924`), and with the
  opponent at 0 HP the factor is 1, except for a slower mon at 0.2 < hpRatio ≤ 0.4.
- **`Pokemon.isTrapped`** (`:2585`). It is true when a `COMMANDED` tag's source is active, so a Commanded Dondozo never
  switches. Otherwise a Ghost type or a Run Away holder is never trapped (`:2591-2593`). For the rest it applies
  `CheckTrappedAbAttr` simulated over `inSpeedOrder`, and checks `TrappedTag` and Fairy Lock.
- **The two benches.** A double trainer's party is tagged by generation index, even `TRAINER`, odd
  `TRAINER_PARTNER` (`src/field/trainer.ts:437`), and every switch path picks from the leaver's tag:
  `getNextSummonIndex(trainerSlot)`, and `ForceSwitchOutAttr` when `isPartner()` (`src/data/moves/move.ts:7347-7355`),
  which holds for every `doubleOnly` trainer (`src/battle-scene.ts:1458-1476`). So the benches stay disjoint by
  party-index parity. An enemy Revival Blessing breaks it: it revives a random fainted mon of either tag into the
  ally's slot (`move.ts:7160-7198`).
- **Doubles sequencing.** Slot 0 decides first and moves `enemySwitchCounter` (+1 on a switch, −1 floored at 0
  otherwise) before slot 1 reads it.
- **The switch itself.** The field is the front of the party (`getEnemyField` is `party.slice(0, double ? 2 : 1)`,
  `src/battle-scene.ts:758-762`), so an on-field mon's party index is its field index (`getFieldIndex`,
  `src/field/pokemon.ts:7254-7255`). `SwitchSummonPhase` takes `party[slotIndex]` (`src/phases/switch-summon-phase.ts:128`),
  calls `resetSummonData()` on it (`:134`, stat stages back to 0; Baton Pass restores them later, `:247-248`) and swaps
  the two party entries (`:190-191`). Each slot scores only its own tag's bench (`src/field/trainer.ts:542-550`), so
  once the parity breaks (the two benches, above) both slots can hold one tag. Both then score the same bench and
  break ties at the same seed offset (`src/field/trainer.ts:605-607`), so they name the same index, and slot 1's
  switch, which runs second, finds slot 0's withdrawn mon in that entry and sends it straight back.
- **`skipTurn`.** It is set for a Commander Tatsugiri inside Dondozo, and for
  `mysteryEncounter.skipEnemyBattleTurns` (`src/phases/enemy-command-phase.ts:27,41-47`). The command is still
  written, and the counter still moves, but `TurnStartPhase` drops skipped commands
  (`src/phases/turn-start-phase.ts:84`).
- **A locked move queue** (charging, Outrage, Uproar, Bide, Rollout…) never switches; `getNextMove` repeats the queued
  move (§6 step 1).
- **Tera.** `Trainer.shouldTera` (`src/field/trainer.ts:774`) is pure, safe unsandboxed. It needs all of:
  `teraMode === INSTANT_TERA`, `!isTerastallized`, `instantTeras` including `initialTeamIndex`, and no entry in
  `enemyFaintsHistory`. `TurnStartPhase` pushes `TeraPhase` before any `MovePhase`
  (`src/phases/turn-start-phase.ts:64-66,153`). `TeraPhase.end` writes `isTerastallized = true` and
  `summonData.addedType = null` (`src/phases/tera-phase.ts:38-41`). So this turn the enemy defends with its Tera type
  and gets Tera STAB. The HUD sets both fields for the whole refresh (`withPredictedTera`) and takes them back off
  (`beforeTera`) for the AI's own choices, which `EnemyCommandPhase` makes before `TeraPhase`.

---

## 8. Held items and abilities that change KO math

| Effect | Where the game reads it | RNG | Query |
|---|---|---|---|
| Type boosters (Never-Melt Ice…) | `calculateBattlePower` (`move.ts:1171`) → `AttackTypeBoosterModifier.apply` (`modifier.ts:1475`): `floor(power·(1+0.2·stack))` (20 at `src/constants.ts:22`) | no | inside getAttackDamage |
| Wide Lens | `calculateBattleAccuracy`: `+5·stack`, not on OHKO (§5) | no | `move.calculateBattleAccuracy(atk,def,true)` (sandbox) |
| Multi-Lens | `PokemonMultiHitModifier` (`modifier.ts:2724`), only for moves passing `canBeMultiStrikeEnhanced`: hits +stack (`:2755`); hit 1 ×(1−0.25·stack), later lens hits ×0.25 (`:2765`) | no | set turnData (§2) |
| Scope Lens / Leek / Dire Hit | `getCritStage` (`pokemon.ts:1417`): `CritBoosterModifier`, `TempCritBoosterModifier`, `BonusCritAbAttr` (no `simulated`), `CritBoostTag`; chance `[24,8,2,1]` in `getCriticalHitResult` (`:4040`) | battle | `def.getCritStage(atk,move)` (sandbox) |
| Eviolite, Light Ball, Thick Club, Deep Sea items | `getEffectiveStat` (`pokemon.ts:1472`) → `StatBoosterModifier.apply` (`modifier.ts:1173`); Eviolite halved for a half-evolved fusion (`:1219`) | no | inside getAttackDamage |
| Enemy damage / resistance tokens | `getAttackDamage` (`pokemon.ts:3967-3972`): `toDmgValue(dmg·1.05^stack)` / `·0.975^stack` (`modifier.ts:3442`, `:3456`, `:3479`) | no | inside getAttackDamage |
| Focus Band | `Pokemon.damage` (`pokemon.ts:4090`), direct damage only, after Enduring/Sturdy/endure token: `SurviveDamageModifier.apply` (`modifier.ts:1520`) `randBattleSeedInt(10) < stack` → 1 HP | battle | held items → P(survive lethal hit) |
| Enemy Endure Chance | `MoveEffectPhase` (`move-effect-phase.ts:677`), enemy target, damage ≥ hp, no substitute: `randBattleSeedInt(100) < 2·stack`, once per wave → `ENDURE_TOKEN` (`modifier.ts:3666`) | battle | `s.enemyModifiers` `EnemyEndureChanceModifier`, `!p.waveData.endured` |
| Sturdy | `PreDefendFullHpEndureAbAttr` (`ab-attrs.ts:310`), non-simulated → `STURDY` tag → survive at 1 from full (`pokemon.ts:4082`) | no | `isFullHp() && getMaxHp()>1 && hasAbilityWithAttr(…)` unless Mold Breaker |
| Disguise / Ice Face | `FormBlockDamageAbAttr` (`ab-attrs.ts:5449`), non-simulated: damage 0, form change; Disguise recoil `toDmgValue(maxHp/8)` (`init-abilities.ts:1432`), Ice Face none | no | `getAbility().getAttrs('FormBlockDamageAbAttr')` + `formIndex` |
| Multiscale / Shadow Shield / Tera Shell | `ReceivedMoveDamageMultiplierAbAttr` ×0.5 at full HP (`ab-attrs.ts:355`); `FullHpResistTypeAbAttr` writes `turnData.moveEffectiveness` even simulated (`:537`) | no | inside getAttackDamage (sandbox for Tera Shell) |
| Reviver Seed | `FaintPhase.start` after `resetSummonData` (`faint-phase.ts:60-74`) → `PokemonInstantReviveModifier.apply` (`modifier.ts:1907`) heals `toDmgValue(maxHp/2)`; **not** after an indirect KO (§21) | no | held item → `pKo 0`, `revive` |
| Sitrus / Enigma | BerryPhase only (§21): `getBerryPredicate` (`src/data/berry.ts:23`) rounded HP ratio < 0.5 / hit super-effectively this turn → `toDmgValue(maxHp/4)`, Ripen ×2 (`:76`) | no | held items + §3 |
| Lum | BerryPhase: status or confusion → cured | no | held item |
| Liechi/Ganlon/Petaya/Apicot/Salac | BerryPhase: < 25 % (Gluttony 50 %, `ab-attrs.ts:5186`) and stage < 6 → +1 | no | held item |
| Starf | BerryPhase < 25 %: +2 to a random one of Atk…Spe, `randSeedInt(5, 1)` (`berry.ts:132`) | global | expectation |
| Lansat | BerryPhase < 25 % (Gluttony ignored, `berry.ts:50`): `CRIT_BOOST` tag | no | |
| Quick Claw / Quick Draw | TurnStartPhase → `BYPASS_SPEED` → FIRST bracket (§5) | battle | held item / ability |
| King's Rock | `applyHeldItemFlinchCheck` (`move-effect-phase.ts:855`): damaging move without `FlinchAttr`, no Shield Dust, no substitute; `randBattleSeedInt(100) < 10·stack` (`modifier.ts:1617`); `FLINCHED` ends at turn end, so only a holder moving first flinches | battle | held item |
| Move effect chance (flinch) | `MoveEffectAttr.getMoveChance` (`move.ts:1762-1780`): `effectChanceOverride ?? move.chance`; then the user's `MoveEffectChanceMultiplierAbAttr` when > 0 (`ab-attrs.ts:1289-1297`: Serene Grace ×2, Sheer Force ×0, capped at 100; `init-abilities.ts:367`, `:891`); then the Pledge rainbow on the user's side, ×2 uncapped, skipped for a flinch move the ability already raised and for Secret Power (`move.ts:1772`, `arena-tag.ts:1443`); then the target's Shield Dust (`IgnoreMoveEffectsAbAttr`, ignorable, `init-abilities.ts:315`) → 0. Every ability is read through `pokemon.canApplyAbility`. Negative means always | no | `fl.getMoveChance(atk,def,move,false,false)` on live mons |
| Leftovers / Shell Bell | TurnEndPhase queued heal `toDmgValue(maxHp/16)·stack` (§21) / `MoveEffectPhase.end` (`move-effect-phase.ts:896`) `toDmgValue(totalDamageDealt·stack/8)` (`modifier.ts:1744`) | no | held item |
| Toxic / Flame Orb | TurnEndPhase `TurnStatusEffectModifier.apply` → `trySetStatus` (`modifier.ts:1712`); chip starts next turn (§21) | no | held item + `effect` |
| Boss bar break | `EnemyPokemon.handleBossSegmentCleared` (`pokemon.ts:7211`), wild bosses only: +1 to a stat below +6 by `weightedPick` on `getStat(s,false)` (`:7226`); +2 on reaching index 0 with ≥3 bars, index 1 with ≥5 | global | expectation, on its defences (our hits) and Atk/SpA (its hits) |
| Grip Claw | `MoveEffectPhase` after each hit of any attack move (`move-effect-phase.ts:815`), holder not fainted (`HeldItemTransferModifier.shouldApply`, `modifier.ts:3176-3178`): `randSeedFloat() <= 0.1·stack` (`modifier.ts:3306`), then `HeldItemTransferModifier.apply` (`:3187`) picks one transferable item. A hit whose recoil (`move-effect-phase.ts:581`) or whose target's Rough Skin / Iron Barbs (`:805`) felled the holder rolls nothing | global + battle | expectation: steals per landed hit |
| Mini Black Hole | TurnEndPhase, holder not fainted (`HeldItemTransferModifier.shouldApply`, `modifier.ts:3176-3178`, Grip Claw's too): opponent picked, then `stack` items picked, all `randBattleSeedInt` (`:3187`) | battle | expectation: steals per turn |
| Sticky Hold | `tryTransferHeldItemModifier` (`src/battle-scene.ts:2514-2522`): `BlockItemTheftAbAttr` on the holder cancels a cross-side transfer | no | ability attr |
| Sleep / freeze / paralysis | `doSetStatus` (`pokemon.ts:5192`): sleep counter 2 (⅓) or 3 (⅔), freeze 3 (`:5235`). `MovePhase.checkSleep` (`move-phase.ts:317`) ticks it (Early Bird −1 more), wakes at ≤0 → 1 or 2 turns lost; `checkFreeze` (`:361`) ticks, thaws on `randBattleSeedInt(4)===0` or ≤0 → lost with ¾, then 9/16, never a third; `checkPara` (`:518`) `randBattleSeedInt(8)===0`; Speed `>>1` (`pokemon.ts:1555`) | battle | expectation |
| Confusion | `ConfusedTag.lapse` (`src/data/battler-tags.ts:1263-1297`), before each move: ticks down, and if still confused, `randBattleSeedInt(3) === 0` → the user takes `toDmgValue(((2·lv/5+2)·40·Atk/Def/50+2)·randBattleSeedIntRange(85,100)/100)` off its effective Atk and Def, and the move is cancelled | battle | expectation |
| Enemy wave heal | TurnEndPhase `EnemyTurnHealModifier.apply` (`modifier.ts:3526`): `maxHp·stack·2/100` when not full, which `PokemonHealPhase` floors and caps at maxHp−1 (`preventFullHeal`, `src/phases/pokemon-heal-phase.ts:195`), so 0 for one stack under 50 max HP (§21) | no | `s.enemyModifiers` |
| Enemy wave status | Each hit of an enemy attack move (`move-effect-phase.ts:810`): `applyShuffledModifiers` (order shuffled in a seed fork, `battle-scene.ts:2864`), each `randSeedFloat() <= chance·stack` (5 % burn/poison, 2.5 % others, max 10; `modifier.ts:3561`, `:3581`) → `trySetStatus`. `EnemyStatusEffectHealChanceModifier` 2.5 %·stack cure at turn end (`:3621`) | global | `s.enemyModifiers` |
| Choice items, Life Orb, Expert Belt, Focus Sash, Loaded Dice | no modifier type exists (`src/modifier/modifier-type.ts`) | — | drop from models |

Item lookup: `p.getHeldItems()` (`pokemon.ts:1194`) is a pure read. It returns the player's `s.modifiers` or the enemy's `s.enemyModifiers` filtered by `pokemonId`.
Identify items by `m.constructor.name` plus `m.berryType` or `m.moveType`, and count with `m.getStackCount()`.
Choice-like locks that do exist (the `GORILLA_TACTICS` and `TORMENT` tags, Encore, the move queue) are already reflected by `isUsable` and the move queue.

### Turn-end HP order

Moved to §21.

---

## Unsafe to call (never, even sandboxed, unless noted)

- `EnemyPokemon.getNextMove()` (`pokemon.ts:6798`) draws from the battle RNG and splices or clears `summonData.moveQueue` (`:6808`, `:6814`).
  It also calls `getNextTargets` (`:7046`), which draws from the battle RNG. If you call it inside the sandbox, save and restore `moveQueue` as well.
  At the command prompt, a sandboxed call reproduces the move `EnemyCommandPhase` picks
  (`src/phases/enemy-command-phase.ts:91`) rather than a random sample. The battle stream re-sows from `battleSeed` and the turn
  whenever `battleSeedState` is null (`src/battle.ts:486-504`), and `TurnEndPhase` nulls it (`:177`). A trainer's switch
  check runs first. Checked on a live tab (#158, §6); the exceptions are listed there.
- `Pokemon.getCriticalHitResult` (`pokemon.ts:4030`) draws from the battle RNG (`:4045`).
- `Pokemon.damage` (`:4072`), `damageAndUpdate` (`:4119`) and `heal` (`:4172`) write HP, run endure and Focus Band, and queue faint or animation phases.
  `EnemyPokemon.damage` (`:7156`) also breaks boss bars. The private `handleBossSegmentCleared` draws from the global RNG and queues a stat change.
- `getAttackDamage({simulated:false})` rolls the damage and adds the Sturdy tag. It also triggers Disguise's form change and recoil.
- `move.calculateEffectivePower(pokemon)` applies `VariableMovePowerAbAttr` without `simulated` (`move.ts:1253`).
  `calculateBattleAccuracy` without `true` only adds bookkeeping that the sandbox undoes, but pass `true` anyway.
- `BerryModifier.shouldApply/apply` (`modifier.ts:1824`, `:1833`): `apply` eats the berry and draws Berry Pouch from the battle RNG.
  `getBerryPredicate` applies `ReduceBerryUseThresholdAbAttr` without `simulated`.
- `BypassSpeedChanceModifier.apply`, `SurviveDamageModifier.apply` and `EnemyEndureChanceModifier.apply` draw from the battle RNG and write tags or `waveData`.
- `s.applyModifiers(...)` with RNG-drawing modifier classes; `s.applyShuffledModifiers`.
- Any phase's `start()`.
- **Sandbox only**: `getAttackDamage` (simulated), `getMoveType`, `getMoveEffectiveness`, `calculateBattlePower`, `applyConditions`,
  `get*BenefitScore`, `getAccuracyMultiplier`, `getCritStage`, `getMatchupScore`, `calculateBattleAccuracy(…, true)`.
- **Safe without the sandbox** (pure reads):
  - `getEffectiveStat(stat, {simulated: true, …})`, except with `forDefend` and an `opponent`, which calls `getEffectiveWeatherForMove` (`pokemon.ts:1519`).
  - `move.getPriority(p, true)` (sandbox for Gale Wings, §5) and `move.getPriorityModifier(p, true)`.
  - `sortInSpeedOrder` and `inSpeedOrder` (they fork the seed and restore it).
  - `trainer.shouldTera(e)` (`src/field/trainer.ts:774`), `getHeldItems`, `getMoveQueue`, `getTag`, `isFullHp`, `hasAbilityWithAttr`, `getStatStage`, `getTypes`.
  - `isTrapped()` (`pokemon.ts:2585`, `simulated` defaults to true).

---

## Recommended API for the HUD

Game calls are cited where they're named; unmarked names are HUD functions.

### Shared (01-core.js)
- `sandbox(s, fn)` — §0; `muted` stays as an alias. Returns `fn()`.
- `heldItems(p)` → `Map<constructorName, {stack, list}>` via `Pokemon.getHeldItems()` (`src/field/pokemon.ts:1194`); `berries(p)` → `[{ type: m.berryType, stack }]` (`BerryModifier`, `src/modifier/modifier.ts:1796`).
- `SKIP_RNG_MOVE = m => m.hasAttr("PresentPowerAttr") || m.hasAttr("RandomLevelDamageAttr")`: Present draws global RNG (§4), and Psywave draws battle RNG inside `getAttackDamage` (`src/data/moves/move.ts:2148-2155`). Use modelled values for both.
- `effectiveness(type, defender, mv?)` → the multiplier, the one place the type chart and the ability immunities are read. `defender` is a plain `{ types: [name], abilities: [name] }`; `mv`, where the caller has the move, adds the flag immunities (Soundproof, Bulletproof, Overcoat, Wind Rider). Wonder Guard, Thick Fat, Heatproof and the ×0.75 reducers are in it. No game calls.
- `defenderOf(x)` → that plain defender, from whatever the caller holds: a live mon (through `Pokemon.getTypes` / `getAbility` / `getPassiveAbility`), a replayed foe (`{ types, ability, passive }`, 48-preview) or a defender already, which it hands back. Idempotent, and `effectiveness` runs it itself, so a caller cannot pass the wrong shape. **No card multiplies the chart out by hand**: `foeMult`, 47's `mult` and 46's bare `vs` products are gone.
- `TIER_NAMES` — reward rarities by `ModifierTier`. Here rather than on the shop card, because the look-ahead names a fixed battle's pinned tiers waves before there is a shop.

### Run calendar (03-calendar.js)
- `waveKind(s, w)` → `"final" | "fixed" | "gym" | "boss" | null`, by the precedence in §12. Precedence, not membership: wave 20 is `"gym"` though it is also a tenth wave.
- `isBossWave(s, w)` → whether `w` is a tenth wave at all, which is what `getDoubleBattleChance`'s 32 asks (§16).
- `bigFightsAhead(s, from, n)` → `[{ wave, kind }]` in wave order, stopping at the run's last wave. Empty without a `gameMode`. What a fight is *called* stays with the card.
- `nextHeal(s, from)` → the next X1 the run heals on, or `null` past the last wave or under a Limited Support with no heal (§10).
- `healRevives(s)` → whether that heal brings the fainted back (false under Hardcore, or with no heal at all).
- `reviveBefore(s, from, fight?)` → `{ kind: "heal" | "shop", wave }`, how a fainted member gets back on its feet before the big fight on wave `fight`, or `null` for no way back: `null` under Hardcore, else the next party heal at or before the fight, else a shop row on a wave before it (which waves end in one is §12's). `from` is the wave the run stands on: its own shop counts, while the heal it entered on is behind it. Without a `fight`, any way back ahead counts. **Luck is never one** — a drawn Revive, a Reviver Seed and Sacred Ash do not count — and money is not priced. The shop walk is private: a caller that wants to know whether a fainted member is dead weight asks `partyAtFight`.
- `trainerOdds(s, w, biome)` → 0..1, `isWaveTrainer` (§10) as odds rather than as the roll `48-preview.js` replays.
- **The only game-less fallbacks in the HUD live here**, each marked where it sits: the last wave per mode (classic 200, Daily 50, Endless every 250) and the tenth-wave boss rule. No caller writes `% 10` or `% 30` for itself.

### Game tables (04-game-tables.js)
The game's own tables, read once out of its loaded chunks (§22) and handed to every card that needs them. Each getter starts the read and answers `null` until it lands, so a caller never waits and never checks a flag of its own.
- `gameTables()` → `{ biomes, species, biomeName, trainers, events, abilities, moves, eggMoves }`, or `null`. The biome card reads `biomes` / `species` / `biomeName` / `trainers`; the starter card reads `abilities` / `moves` / `eggMoves`; 98-watch reads `species`.
- `gameEvents()` → the timed event manager, or `null`: the catch card's shiny multiplier and `partyLuck`'s two event terms (§12).
- `gameRewardFns()` → `{ regenerate, options }`, the reward roll's two module functions for 50-reroll's preview (§19), or `null`. Kept apart from the tables: a build that renamed them still has biome data, and a build without biome data can still roll rewards.
- `setGameTables` / `setRewardFns` are `@only tests`: the chunk scan finds nothing under node, so a test hands over what it would have found.

### Move traits (07-move-traits.js)
- `moveTraits(mv, user, { party, target })` → the move read once, by attribute: `charge` (`false`, or `{ skip, now(user) }` — the instant-charge condition as data and judged live), `semiCharge`, `recharge`, `interrupt`, `needsAttack` (Sucker Punch / Thunderclap), `once` (`FirstMoveCondition` across `conditions` / `conditionsSeq2` / `conditionsSeq3`), `lock` (a self-targeted `AddBattlerTagAttr` of `FRENZY`), `noRepeat` (`consecutiveUseRestriction`'s exact `battle:moveDisabledConsecutive` key), `recoil` (`{ ratio, useHp, blocked }`, default ratio 0.25, blocked by Magic Guard / Rock Head *by ability attribute* unless `unblockable`), `halfSac`, `crash`, `selfKo` (`"always"` / `"onHit"`), `drops` (guaranteed self stat changes, signed), `removesType`, `guarded`, `hits` (`{ dist, mean, checkAll, grows }`, §2), `flinches`, `stages` / `inflicts` / `tags` (each with `self` / `side` / `ally` and the concrete `cls`), `heal` (`{ ratio, ratioIn(user), self, cls }`, the ratio after the user's `MoveHealBoostAbAttr`, §14), `hazard`, `protect`, `cutHp`, `drain`, `typeChange` (`{ kind: "set" | "add", type }` — Soak and Magic Powder replace a target's types, Forest's Curse and Trick-or-Treat add a third; whether it would do anything is the caller's, live), `attrNames`. **No game calls and no battle state**, so the learn card uses it outside a battle. Attributes match through the prototype chain; `attrNames` holds concrete class names for callers whose tables are keyed that way.
- `costNotes(traits, amounts)` → the wording for each cost, shared by the ⚔ line's `costs` and the learn card's drawbacks. `amounts` carries this matchup's numbers when the caller has them: `recoil` (share of max HP), `sun`, `type`.
- What a trait is *worth* stays with the caller: 10-damage's `reliability`, the learn card's multipliers, the planner's benefit nudge.

### Party profile (08-party.js)
The **party** judged as a whole: type tallies, luck, and the set of the party that reaches the next big fight. Nothing here scores. Whether a newcomer is worth it was once a query of this file's — `partyReasons`, whose `upgrade` reason was a +100 final-BST bar against the `lightest` member — and is now 12-value's judgment, which prices what the team loses inside a run read; both are deleted (#593).
- `partyAtFight(s, party, { from, fight })` → `{ members, dead, revive }`, the one definition of the **party at the next big fight** (CONTEXT.md, `Dead weight`), read by every reader that judges the team at that fight — the team audit's checks, the road-ahead readiness, the biome card's party (#570), and on the encounter card the newcomer questions: GTS's trade candidates and the Dark Deal's weakest link and carry (#571). A card that instead asks who can fight the battle in front of the party keeps its own standing set, and one mirroring a pick the game makes filters the whole party exactly as the game does. `members` holds every member at full health however hurt it is now; `dead` is `[{ mon, name, why: "barred" | "fainted" }]`, the **dead weight** holding its slot at zero: a member a challenge bars (`Pokemon.isAllowedInChallenge`), or one fainted with no `reviveBefore` way back. `revive` is that way back, for a card that wants to say when the slot fills again. Without a `fight` nothing is out of reach, so only a challenge bars a member.
- `partyProfile(party, { weakest })` → `{ attacks, ourTypes, weakTypes, holes, weakest, roots, luck, members, hitters(defender), weakTo(type) }`.
  - `attacks` — per member, `[{ t, stab }]`: the types it hits for damage, `stab` 1.5 on its own types. `ourTypes` flattens it.
  - `weakTypes` — attacking types two or more members are weak to and more are weak to than resist. `holes` — defending types nothing on the team hits super-effectively.
  - `weakest` — the **weakest member** (CONTEXT.md), 12-value's `weakestMember` answer handed in by the caller and null when it isn't: it is priced inside a run read, which lives above this file, so a reader holding only a profile has none (#582). There is no `lightest` any more: the lowest final BST was the old judgment's stand-in for the member a swap replaces, and nothing reads it (#593). `roots` — the party's root species ids (`Pokemon.getRootSpeciesId`), which is what makes a catch a duplicate. `luck` — `partyLuck` of the members alone (no scene, so no Daily roll and no event terms: the floor). Both are worked out on first read, so a caller that wants only coverage pays for neither.
  - `hitters(defender)` / `weakTo(type)` — the members that hit it super-effectively, and the members that type hits super-effectively. The two matchup queries every card asks.
- `isCoverage(mv)` → whether one move hits for damage off the type chart, the rule the two below are built on and the one rule for both sides of the field: the wave preview filters a **foe**'s moveset with it (48-preview's `attackTypes`), where it read `power > 0` until #266 and so lost a Steel foe whose STAB is Gyro Ball.
- `damagingTypes(p)` → the types a mon can hit for damage. **Variable power counts** (`power === -1`: Grass Knot, Gyro Ball) and **fixed damage does not** (§4.3 — it ignores the chart), which is how the learn card always read it and how the catch, biome and look-ahead cards now do.
- `finalBstOf(x)` → `{ bst, final, estimated }` for a live mon, a `{ species, fusion }` pair or a bare species: a line's final evolution's BST, estimated from `PokemonSpecies.getEvolutionLevels()`, a fusion averaging both halves (`Pokemon.calculateBaseStats`).
- `partyLuck(party, s?, event?)` → `getPartyLuckValue`'s rule re-implemented (§12). With the scene, **a Daily run answers with its own roll** — `randSeedInt(15)` in a fork at offset 0 on the run seed, or the event seed's pinned `dailyConfig.luck` — and never with the party's. Otherwise `Pokemon.getLuck` over the members `isAllowedInBattle`, **+1 for each species `event.getEventLuckBoostedSpecies()` names**, clamped to 0–14, then `event.getEventLuckBoost()` on top, capped at 14. `event` is the timed event manager (`04-game-tables.js`'s `gameEvents()`). Called without either it is the old floor, which is all `partyProfile`'s `luck` can be.
- `typesOfSpecies(sp)` → a species' own types by name, for a candidate that is a species and not a mon.

### Damage (10-damage.js)
- `moveInfo(s, atk, def, pm)` → `{ move, type: atk.getMoveType(move), category: atk.getMoveCategory(def, move), power: move.calculateBattlePower(atk, def, true), priority: move.getPriority(atk, true), spread: [2,4,6,8].includes(move.moveTarget), acc: hitChance(...), critChance }`. `getPriority` is at `move.ts:1195`. The spread targets 2/4/6/8 are ALL_OTHERS / ALL_NEAR_OTHERS / ALL_NEAR_ENEMIES / ALL_ENEMIES (`src/enums/move-target.ts`). Sandbox.
- `hitChance(atk, def, move, hitIndex = 0)` → 0..1. Uses `move.calculateBattleAccuracy(atk, def, true)` (`move.ts:1055`, where `simulated` defaults to false), `atk.getAccuracyMultiplier(def, move)` (`pokemon.ts:3531`), and `hasAbilityWithAttr("AlwaysHitAbAttr")` on either side (`MoveEffectPhase.checkBypassAccAndInvuln`, `src/phases/move-effect-phase.ts:455-457`). Later hits are 1 unless `move.hasFlag(MoveFlags.CHECK_ALL_HITS)` and the user lacks Skill Link (§2). Sandbox.
- `critChance(atk, def, move)` → `[1/24, 1/8, 1/2, 1][clamp(def.getCritStage(atk, move), 0, 3)]` (`pokemon.ts:1417`, table at `:4040`). It is 1 with `CritOnlyAttr`, the `ALWAYS_CRIT` tag or `ConditionalCritAbAttr`. It is 0 for `FixedDamageAttr` moves, for a target with `BlockCritAbAttr`, and on a side with a `NoCritTag` (Lucky Chant) (`getCriticalHitResult`, `:4031-4055`).
- `hitCounts(s, atk, def, move)` → `[{n, p}]` (§2: MultiHitAttr type, Skill Link, Parental Bond, Multi-Lens, Beat Up, Water Shuriken).
- `hitDamage(s, atk, def, move, { hit, hits, crit = false, aiView = false })` → `{ max, min, result, cancelled }`. It sets `atk.turnData.hitCount = hits; hitsLeft = hits - hit`, then calls `def.getAttackDamage({ source: atk, move, isCritical: crit, simulated: true, ignoreAbility: aiView && !def.waveData.abilityRevealed, ignoreAllyAbility: aiView && !def.getAlly()?.waveData.abilityRevealed })` (`pokemon.ts:3756`; `abilityRevealed` at `src/data/pokemon-data.ts:319`). `getNextMove` passes the same flags (`pokemon.ts:6882-6889`). `min ≈ floor(max × 0.85)` is an approximation: the game rolls `randBattleSeedIntRange(85, 100)` inside the product, before later multipliers and floors (`:3892`, `:3948`). Sandbox (turnData restored).
- This turn's resolution of a move on its target (private `resolve` / `landHit`), pure math on read fields. Per hit:
  - Disguise / Ice Face (`FormBlockDamageAbAttr`, `src/data/abilities/ab-attrs.ts:5449`) takes the first hit.
  - Boss clamp by `calculateBossSegmentDamage` (exported; §3) with `getMaxHp() / bossSegments`, `bossSegmentIndex`, the classic final-boss minimum index and its HP − 1 cap (`EnemyPokemon.damage`, `pokemon.ts:7156-7177`; the cap checks the bar index before the hit).
  - Sturdy at full HP → 1 HP, `FixedDamageAttr` moves included (§1, §3).
  - Focus Band 0.1·stack, and the enemy Endure token 0.02·stack, rolled when the hit would faint it.
- `moveOutcome(s, atk, def, pm)` → `{ type, cat, e: result→multiplier, perHit: [{max,min}], dist: [{n,p}], acc, expected, uncapped, max, pKo, revive, use, targetHp, name, priority, spread, traits, costs, notes }`. `traits` is 07-move-traits' record with the charging turn judged against this moment; `costs` is `costNotes` with this matchup's amounts, plus the target's contact chip; `notes` keeps the rest (hit counts, boss bars, Sturdy, Focus Band, a crit, an estimate). It combines the above; `targetHp` is the HP the odds were worked out for. It also sets `bypassProtect` from `move.doesFlagEffectApply({ flag: MoveFlags.IGNORE_PROTECT, user, target })` (`move.ts:897`; flag `1 << 1`, `src/enums/move-flags.ts:12`). A move cancelled by primordial weather or Psychic Terrain comes back as "no effect" (`stopped by weather` / `terrain`), from `arena.isMoveWeatherCancelled(user, move)` / `isMoveTerrainCancelled(user, targets, move)` (`src/field/arena.ts:330`, `:484`; §14).
- `endOfTurnHp(p, { s, hp, tookSuperEffective, dealt })` → the signed turn-end HP change, following the game's phase order (`src/phase-manager.ts:231-237`):
  1. weather chip and Dry Skin / Solar Power (`WeatherEffectPhase`);
  2. berries (`BerryPhase`, §3: Sitrus below a rounded 50 %, Enigma on a SE hit, Ripen, Unnerve);
  3. status chip (`CheckStatusEffectPhase`; orbs counted as already on);
  4. `TurnEndPhase.start` (`src/phases/turn-end-phase.ts:24-63`): Leftovers (`TurnHealModifier`), Grassy Terrain `toDmgValue(maxHp / 16)` when grounded, the enemy's `EnemyTurnHealModifier`, `PostTurnAbAttr`s.

  Shell Bell (`HitHealModifier`) is applied from `dealt` at the end of the move (`move-effect-phase.ts:896`).
- `statusMoves(s, atk, def)` → `[{ pm, name, type, acc, e, priority, bypassProtect, bounce, blocked }]`. These are the status moves `atk` can pick that would work on `def`:
  - usable per `PokemonMove.isUsable(pokemon, ignorePp, forSelection)` (`src/data/moves/pokemon-move.ts:57`) and `move.applyConditions(user, target, -1)` (`move.ts:948`);
  - `e` 0 for an immunity (`def.getMoveEffectiveness(atk, move)`, `pokemon.ts:2717`);
  - `bounce` for Magic Bounce (`ReflectStatusMoveAbAttr`, `ab-attrs.ts:5309`, checked by the module-private `isMoveReflectableBy`, `move-effect-phase.ts:1031`);
  - `blocked` for a weather / terrain cancel.

  Game calls only. Every cache key carries `hypothesisKey`, so numbers for a written-on state (§14) never mix with the real ones.

### Enemy AI (20-enemy-ai.js)
- `aiTargets(s, e, move)` → `[{battlerIndex, p}]`: `getMoveTargets` (`src/data/moves/move-utils.ts:55`) on the opponent side, weighted the way `EnemyPokemon.getNextTargets` does it (`pokemon.ts:7046`), with `move.getTargetBenefitScore(e, p, move)` (`move.ts:1031`). Sandbox.
- `aiKoPool(s, e, usable)` → the moves that survive `getNextMove`'s KO filter (`pokemon.ts:6854-6898`). A move stays if it:
  - isn't a status move or ATTACKER-targeted;
  - isn't weather- or terrain-cancelled;
  - passes `applyConditions(e, p, -1)`, or is Sucker Punch / Upper Hand / Thunderclap;
  - does simulated `getAttackDamage` ≥ `p.hp` with the AI's `ignoreAbility` flags (crit only for `CritOnlyAttr` / `ALWAYS_CRIT`).
- `aiMoveScore(s, e, pm, targetIdx)` → a number, exactly step 7 (`pokemon.ts:6918-6983`):
  - base score `getUserBenefitScore + getTargetBenefitScore` (`move.ts:1010`, `:1031`);
  - −20 for a failed `applyConditions(e, p, -1)`, a weather / terrain cancel, or a zero score;
  - attack moves × `target.getMoveEffectiveness(e, move, !target.waveData.abilityRevealed, undefined, undefined, true)` (the trailing `true` is `useIllusion`, `pokemon.ts:6950-6957`);
  - STAB ×1.5 via `e.isOfType(move.type)`, which checks the base move type, not `getMoveType`;
  - divided instead for an ally target.
- `exactMoves(s, foes, ranges)` → `{ ok: true, moves: Map(foe → row) }` or `{ ok: false, reason }`: the game's own `EnemyPokemon.getNextMove()` (`pokemon.ts:6798`), taken off the **prototype**, for every foe `EnemyCommandPhase` will ask — active, in field order, minus any the trainer switches out (§7) — inside **one** `sandbox`, with each `summonData.moveQueue` saved and restored by contents *and* identity (the call splices it and can clear it outright, `:6801-6814`). `ranges` are our own command's draws, made first with `battle.randSeedInt`. The row is one outcome at p 1, carrying the game's own targets and no score. Only at the command prompt, where the stream sits where `incrementTurn` re-sowed it. Three failures, and the coach then says so rather than advising from the distribution (#183): no `getNextMove` on the prototype, a call that throws, a sandbox breach.
- `enemyMoveDistribution(s, e)` → `[{ pm, move, targets: [{battlerIndex, p}], p, score }]` (§6 algorithm: move queue, Struggle, Encore, `aiType` RANDOM / SMART_RANDOM / SMART = 0/1/2 from `src/enums/ai-type.ts`, Protect branch). Cache it per turn key. It is **not** what this turn is planned on any more — the exact call above is — but it stays for later turns, for `aiReplay`, and as that call's oracle at a pin bump, where asking both at one prompt is how a drift between the game's own choice and this re-implementation shows up.
- `aiReplay(s, e, target, { hp })` → rows like `enemyMoveDistribution`'s, without targets: `getNextMove` replayed against one of our mons, which needn't be on the field (§6), status moves included. Sandbox per call.
- `predictSwitches(s, b, active)` mirrors `EnemyCommandPhase.start` (`src/phases/enemy-command-phase.ts:36-106`). A trainer mon that isn't trapped (`isTrapped`) and has an empty move queue switches when `best bench score × (1 − 0.1^(1/enemySwitchCounter)) ≥ avg own score × (isBoss ? 2 : 3)`, sending `getNextSummonIndex`. The counter goes +1 on a switch and −1 (floor 0) on a move. Keep it, run it in `sandbox`, and sequence the counter across doubles slots. A Commander Tatsugiri's command carries `skip` (`skipTurn`, `:40-46`), and `TurnStartPhase` drops that command (`src/phases/turn-start-phase.ts:84`).
- `enemyAction(s, e)` → `{ kind: 'switch', to } | { kind: 'move', dist, tera: b.trainer?.shouldTera(e) ?? false }`. `Trainer.shouldTera` (`src/field/trainer.ts:774-785`, pure) is true in INSTANT_TERA mode for a listed `initialTeamIndex` that isn't yet Terastallized and hasn't fainted.
- `predictedTeras(s, b)` → the active foes whose action this turn Terastallizes. `withPredictedTera(mons, fn)` runs `fn` with `isTerastallized` set and `summonData.addedType` cleared on them, as `TeraPhase.end` does (`src/phases/tera-phase.ts:38-41`). `beforeTera(fn)` takes that back off, and `teraTypeOf(e)` names the type via `getTeraType()` (`pokemon.ts:2487`).

### Planner (30-planner.js)
- `actionOrder(s, a, aMove, b, bMove)` → `P(a acts before b)`. Switches go first. Otherwise mirror `MovePhasePriorityQueue.sortPostSpeed` (`src/queues/move-phase-priority-queue.ts:23-36`), which sorts by, in order:
  1. timing modifier;
  2. `move.getPriority(p, true)` (`move.ts:1195`);
  3. `move.getPriorityModifier(p, true)` (`:1203-1215`: FIRST=2 whenever the `BYPASS_SPEED` tag is on, whatever the ability bracket);
  4. the speed order from `sortInSpeedOrder` (`src/utils/speed-order.ts:21`): `getEffectiveStat(Stat.SPD)` descending, reversed under Trick Room (`:57-82`).

  `BYPASS_SPEED` comes from `TurnStartPhase.start` (`turn-start-phase.ts:70-78`): Quick Draw 30 % with a damaging move (`BypassSpeedChanceAbAttr`, `ab-attrs.ts:5624-5634`), Quick Claw 10 % per stack, max 3 (`BypassSpeedChanceModifier`, `modifier.ts:1555-1576`). Mycelium Might blocks it for status moves. **A speed tie is not a coin flip.** `sortInSpeedOrder` shuffles under `executeWithSeedOffset(…, turn × 1000 + groups.length, waveSeed)` (`speed-order.ts:32-43`) before a stable sort, so the order is fixed for the turn. It is exported, and a sandboxed call on the same list the queue sorts returns the order; in singles the first pop sorts exactly the two move phases (`src/queues/pokemon-phase-priority-queue.ts:8`). The HUD **replays the shuffle rather than calling it** (#178): reaching a module export means the chunk scan, which sat in 47-biome and which 30-planner could not import from when #178 was decided (it is `04-game-tables.js` now, and reachable — rewiring the replay is its own work), while the draw itself is one `randSeedInt(0, 1)` inside the scene's own `executeWithSeedOffset` — a method on `globalScene`, which restores the RNG state, offset and override itself. So `speedTie` resolves the tie only where the replay is exact: a single battle, both sides using a move, both on the field, this turn. Anything else keeps the 0.5.
- `threatFrom(s, foe, me)` → Σ over `enemyMoveDistribution` of `p × moveOutcome(foe, me, …)`. It exposes the worst case (`max` roll + crit) for the "ko" flag, the expectation for scoring, and `use`: the turn's damage distribution over those moves. Replaces `hits(f, me, true)` + `FOE_MARGIN`.
- `moveOutcome(...).use` → `[{ d, p, n }]`, the damage of one use before the target's HP or a boss bar cuts it, and the hits it lands in. It is the per-hit roll × crit maps convolved over the hit counts, with a miss at 0 (every hit rolls for CHECK_ALL_HITS), cut to 12 points by joining the closest neighbours (`n` averaged). `flinch` is P(a landed use flinches the target) from `FlinchAttr` (`move.ts:6770`) via `MoveEffectAttr.getMoveChance` (`:1762-1780`: Serene Grace's `MoveEffectChanceMultiplierAbAttr`, Shield Dust's `IgnoreMoveEffectsAbAttr`, simulated when `showAbility` is false). It is 0 through Inner Focus (`BattlerTagImmunityAbAttr(FLINCHED)`, `init-abilities.ts:399-400`).
- KO pacing lives in 10-damage (#125, #140); the planner, team plan and catch card call it:
  - `stateOf(target, hp?, bar?)` → `{ hp, bar, revived, tok, facts }`; `hitOn(state, dmg)` → the state after one landed hit, no luck: `calculateBossSegmentDamage` per hit (a hit past a bar by `segSize · 2^k` breaks k more, down to the minimum index; enough damage KOs through every bar), then the final-boss HP − 1 cap.
  - `koCurve(target, use, { hp, bar, start, scale(i, broken), act(i), turnEnd, firstKo, cat })` → `{ by, after1, perChunk }`, `by[n-1]` = P(down by use n), n ≤ 9: KO/survive bucketing (after Foul Play). Each use lands every point of `use` hit by hit on each standing branch. A lethal hit meets the endure token (once a wave, `waveData.endured`; every lethal hit of that use leaves 1 HP), Focus Band and a Reviver Seed (back at `floor(maxHp / 2)`, ending the use). `cat` applies a wild boss's expected Def / SpD rise per bar broken (`barBreakFactors`, `handleBossSegmentCleared`, `pokemon.ts:7211`).
  - Turn end per branch: a heal is capped at max HP only (`Pokemon.heal`, `pokemon.ts:4172`: the bar index never rises back); chip goes through the bar rule and ignores Focus Band and the endure token, as status chip does (`PostTurnStatusEffectPhase`, `pokemon.damage(dmg, false, true)`). Weather chip really ignores bars (`damageAndUpdate(…, ignoreSegments: true)`, `weather-effect-phase.ts:53`), but the signed turn-end change can't tell them apart. Standing branches merge to 4 HP levels per bar, seed and token state.
  - `firstKo` pins use 1 to this turn's exact odds (Sturdy, the roll on the real HP). `after1` hands the standing branches to a later turn. `perChunk`: the uses each bar takes before it more likely than not breaks.
  - `koTurn(by)` is the likely use, `koTurns(by)` the expected one; `useOf(o)` is a record's `use`, or 16 rolls of its likeliest hit count's max (a `hits` record's `dmg`); `koChanceAt(o, hp)` a record's KO odds at another HP.

  Replaces mean-damage turn counts: a 2HKO that lands 48 % of the time is a 3HKO, not a sure 2.
- `exchange(s, me, myPm, foe, { after })` → `{ pWeKoFirst, pTheyKoFirst, turnsWe, turnsThey, eTurnsWe, eTurnsThey, expectedHpLeft, turn1 }`.
  - Turn 1 is exact: order, KO odds, King's Rock and our own flinch.
  - After that, the two KO curves race turn by turn, independently; the order decides a turn where both would KO.
  - `turnsWe` / `turnsThey` are medians (the panel's "N hits"); `eTurns*` are expectations, which scoring uses.
  - `after` starts both curves from an earlier exchange's `turn1` branches. Feeds `fieldPlan` scores.
- Depth 2 (`fieldPlan`): each option's turn 1 is played exactly. From its standing branches, the planner tries the best of our top two moves and a priority move, and keeps one that beats repeating the move by 0.1 (Fake Out then an attack). No minimax: the foe's reply is the AI replica's distribution, re-picked for turn 2. Doubles keep the three best options per slot plus any priority / flinch / first-turn-only move. A follow-up that also hits our partner is never proposed.
- Consistency prior (after PokéLLMon): +0.15 for the move last used (`getLastXMoves(1)`, `pokemon.ts:4592`) by a mon that has been out since before last turn (`summonData.turnCount ≥ 2`). −0.5 for a plan that switches out a mon that came in last turn (`turnCount ≤ 1` past turn 1). `turnCount` starts at 1 (`PokemonSummonData`, `src/data/pokemon-data.ts:161`) and is reset with the rest of `summonData` by `resetSummonData` on a switch-in (`pokemon.ts:5351-5359`). `SwitchSummonPhase.onEnd` takes one off for a command or forced switch (`src/phases/switch-summon-phase.ts:238-245`), and `TurnEndPhase.start` adds one (`turn-end-phase.ts:63`).
- Next turn's pick (`likelyMoves` with `next`, or a foe not on the field) is `aiReplay` against our mon. The old damage stand-in for the move score is used only where the replay can't run.
- Status moves as this turn's action (§14). Each status move `statusPlay` can price (setup, a status on the foe, a heal, a hazard in a trainer battle, a typing written onto the foe) is turn 1 of an `exchange` in which we deal nothing.
  - Turn 2 is the best of our top two moves and a priority move from its branches, as in depth 2.
  - The effect is written onto the mons (`withHypothesis`: stat stages, a status, a typing — `summonData.types` and `summonData.addedType`, the two fields `Pokemon.getTypes` reads), so the game's own damage, order and AI replay price the turns after.
  - A typing (Soak, Magic Powder, Forest's Curse, Trick-or-Treat) is ruled out by the game's own conditions where it would do nothing: a Terastallized target, Multitype or RKS System, or a typing the target already has. This turn's incoming hit is still priced on the typing as it stands, as every play here is.
  - It lands with P(we act, not flinched) × accuracy × (1 − P(Protect)), and not at all through an immunity or Magic Bounce. A second Protect succeeds 1 in 3^n (`ProtectAttr.getCondition`, `move.ts:6812-6832`, draws battle RNG). A miss plays on from the unchanged state.
  - A sleep or paralysis that lands before the foe moves cancels this turn's hit too: all of it for sleep, 1 in 8 for paralysis (`MovePhase.checkPara`: `randBattleSeedInt(8) === 0`, `src/phases/move-phase.ts:518-530`). Sleep's later lost attempts go by `STATUS_SKIP`.
  - A heal lifts our HP branches (before its hit when we're faster).
  - A hazard adds `HAZARD_TURNS` (2) per whole HP bar it takes off the trainer's mons still to come.
  - Scored like a depth-2 line minus `STATUS_COST` (0.2) — in a **single battle**. A double is priced differently (below), because `follow()`'s 1-v-1 exchange would weigh the effect against the whole of one foe's damage where the field splits it.
- Status plays in a **double** (#262): one exchange of the field, not two 1-v-1s.
  - A slot carries at most `STATUS_CANDS` (2) status plays into the field search, best first by **effect value**: `turn.benefit` — the game's own score for the move against that foe — times how often the play works, so a sure Spore outranks a Hypnosis that misses two times in five. A self-targeted play is carried once, not once per foe.
  - A candidate has no standalone score: the field search prices it. Each play lands or it doesn't, so a field is the weighted mix over which of them landed; in each branch the effect is written with `turn.assuming` **before the partner slot is scored**, so Spore in slot 0 changes what slot 1's option is worth.
  - On that state: the slot that spent its turn is worth what its own best move is worth there, one turn later; the partner's own pick is re-scored there; and `joint` counts only the hits that still happen.
  - `getNextMove` picks a move whether or not the mon is asleep, so a written-on sleep changes no distribution. The attempts it costs ride separately, as `foeCurve`'s `act` / `exchange`'s `foeAct`: index 0 is this turn's attempt (cancelled by `skip0` when we move first), and every later one is #74's `foeAct`. `joint` discounts a silenced foe's `danger` and its chance of acting first by the same share.
  - Bounded to this turn: `options` under a hypothesis runs no depth 2 and offers no status plays of its own.
  - The turn a status play spends keeps its score below an attack's by construction, so it is not read as the slot losing its trade when the stay margin asks which fields are failing.
- A foe's setup: `threatFrom(...).boost` = the expected stages its status moves add per turn (`selfStages`, after Simple / Contrary via `StatStageChangeMultiplierAbAttr` ×2 / ×−1, `init-abilities.ts:645-646,893-894`, and the ±6 cap).
  - `foeCurve` ramps its later hits by the Atk / SpA stages (`setupRamp`).
  - `exchange` ramps our hits by its Def / SpD stages, and the deciding turn's order by its Speed stages once it has had the turns to pass us.
  - Doubles' joint value counts setup as its next two turns' extra damage (`setupDanger`) instead of a flat half.
- `exchange` discounts this turn's hit by the foe's Protect chance unless the move goes through Protect. Toxic's chip in `turnEndCourse` grows by a 16th each turn (`toxicTurnCount / 16`, `src/phases/post-turn-status-effect-phase.ts:46`, incremented by `Status.incrementTurn`, `src/data/status-effect.ts:21`).

### Team plan (35-team-plan.js)
- `tpFight` plays both speed orders each turn, weighted by P(foe first) (token paralysis mixed in, not a 0.5 cut). Each side's damage comes from ≤ 4 levels of its `use` relative to the mean, carrying ≤ 4 HP branches. It returns the likelier ending plus `pWin` / `pLoss` / `pStall`; the beam carries the likelier ending and values every ending by its chance. A foe's hits on a mon not on the field (or from a foe not on it) use its re-picked moves (`next`).
- Send-in after a faint: `Trainer.getNextSummonIndex` (`src/field/trainer.ts:587-616`) picks the best `getPartyMemberMatchupScores` entry (`:541-574`). That is the average of `getMatchupScore(benchMon, ourMon)` over our field, halved per legendary opponent.
  - `getMatchupScore` (`src/field/pokemon.ts:2920-3003`) = `(atkScore + defScore) × min(hpDiff, 1)`, with `hpDiff = benchHp% + (1 − ourHp%)` (`getHpRatio`, rounded to 0.01).
  - ×1.25 if the bench mon outspeeds (`getStat(SPD, false)` off the field, `>=` vs our `getEffectiveStat`, `:2923-2925`), else ×0.5 at 20–40 % HP. The "dying" branch applies only to a mon on the field.
  - With a full-HP bench mon the factor caps at 1, so speed can't matter and ties are common. The game breaks ties with `executeWithSeedOffset(randSeedInt(n), turn << 2)` on the run seed (`trainer.ts:602-611`), which is deterministic for the turn.
  - The plan asks the game once with our HP at 0 (the factor caps, and the call returns the type scores) and puts the simulated HP back itself.
- **Who decides a turn (#113).** The ⚔ line is the authority; the ♟ plan is re-searched with step 1 pinned to the turn it chose, so the panel never shows two answers to one turn. 60-card builds the plan's model first (`teamPlanner`), hands it to `battleModel`, and renders `view(pin)` with the ⚔ action. Measured on 19 live trainer decisions and 42 mocked states: every `move`, `target` and `action` disagreement went to ⚔, and every case where the plan had a point was about **which mon to spend**.
  - `at(pin)` re-searches with `pin` = `{ mi, outcome, free }` fixing the first exchange: the mon that acts, its move when the ⚔ line scored a damaging one, and whether the game is handing us the switch (`CheckSwitchPhase`). Later steps are searched as usual. Memoised per pin, so one search per candidate.
  - `after(pin)` reads that plan's step 2: the mon a faint brings in free, and the foe the trainer then sends with the answer the plan puts in front of it.
  - `prefers`: the **unpinned** plan's own first move, priced, shown as one line when it beats the pinned plan by `TP_PREFER` (20, a fifth of a KO) or turns a loss into a win. Never a competing step list.
- **The plan as a term in ⚔'s score.** `fieldPlan` scores each candidate field with `at({ mi })`, and the best candidate pays nothing while the others pay `(best − theirs) × PLAN_POINT` (0.02 a plan point, capped at `PLAN_CAP` 3). Single battles only: the plan reads a double as one-on-one exchanges. A cost of `PLAN_FAIL` (1) or more also makes the field count as failing, so the 3-point stay margin stops protecting a mon the plan needs elsewhere, and the ⚔ line names the foe it was being kept for.
- **Who is on the field.** `cur` is the **set** of our party indices standing, so in a double neither of ours pays to act. The plan used to hold one index and read the second field mon as a paid switch, which put "⇄ switch in X" on screen for a mon already out — the single biggest cause of ⚔/♟ disagreement on real waves (#113).
- **Which foe it starts against.** `tpFacing` takes the predicted switch-in from `predictSwitches` (§7), the same foe the ⚔ line plans against, instead of the foe walking off the field.
- **The answer matrix** (#170 §A): per foe, who takes ≥ 20 % of it a turn (`per`), who wins the exchange outright (`beats`) and who gets to hurt it at all (`acts`). It picks the win condition's two answers (`reserve`) and, separately, foes still to come that **only one** of ours beats (`only`) — `sweep` needs two KOs to call something a win condition, so a foe with one clean answer was never covered. Both are held back in the search, and both answer `saveFor` in the summary.

---

## 9. Free switches, and when a switch costs the turn

**Phase queue** (`src/phase-tree.ts`, `src/phase-manager.ts`).
- `pushPhase`/`pushNew` append to level 0, the turn's base queue (`src/phase-tree.ts:98-100`).
- `TurnStartPhase` pushes the `MovePhase`s there and then `queueTurnEndPhases`: `WeatherEffectPhase`,
  `PositionalTagPhase`, `BerryPhase`, `CheckStatusEffectPhase`, `TurnEndPhase` (`src/phase-manager.ts:232-238,594`).
- `unshiftPhase` adds to the level above the current one (`src/phase-tree.ts:66-73`), and `queueDeferred` to a deferred
  level (`src/phase-manager.ts:544-549`). Both run before control returns to level 0.

**`CheckSwitchPhase.start`** ("Will you switch Pokémon?", `src/phases/check-switch-phase.ts:23-80`). It writes UI mode
and may unshift a phase. No RNG. It ends early, in this order:
- when the battle style is Set (`:31`);
- when the mon isn't on the field, after unshifting `SummonMissingPhase` (`:37-41`);
- when no party member after index 0 is allowed in battle (`:44-52`);
- when `pokemon.canSwitch()` is false (`:55-58`): the mon is `FRENZY`, trapped, or any of our field is `COMMANDED`
  (`src/field/pokemon.ts:2619-2631`).

Otherwise it shows the question, then `CONFIRM`. Yes unshifts `SwitchPhase(INITIAL_SWITCH, slot, isModal false,
doReturn true)` (`check-switch-phase.ts:69`).

- **Where it is queued**, always as `pushNew("CheckSwitchPhase", 0, double)`, plus slot 1 in doubles:
  - `EncounterPhase.end` (`src/phases/encounter-phase.ts:599-610`): not a trainer battle, `waveIndex > 1 || !isDaily`,
    and more allowed party members than battlers.
  - `MysteryEncounterBattlePhase.endBattleSetup` (`src/phases/mystery-encounter-phases.ts:440-447`): not a trainer
    battle, `!disableSwitch`, and the same party size.
  - `TitlePhase.end` on loading a session (`src/phases/title-phase.ts:376-386`): the `EncounterPhase` rule.
  - `GameOverPhase` retry (`src/phases/game-over-phase.ts:108-116`): `waveIndex > 1` and not a trainer battle, with no
    party-size check for slot 0.
- **When it is never queued:** in a trainer battle, or when a trainer sends its next mon (`FaintPhase` queues nothing
  for us, below).
- **Yes.** `SwitchPhase` opens the party UI and unshifts `SwitchSummonPhase` (`src/phases/switch-phase.ts:70-82`).
  All of that runs before `InitEncounterPhase`/`TurnInitPhase`. `INITIAL_SWITCH` also skips `resetTurnData` in
  `SwitchSummonPhase.onEnd` (`src/phases/switch-summon-phase.ts:257`). The enemy has no command yet (§6 "When"), so its
  first move choice and switch check see the new field. No hit, no turn lost.
- **Game calls during it are safe.** The phase waits in UI callbacks with nothing mid-execution, like a waiting
  `CommandPhase`. `turnData` isn't reset yet (`TurnInitPhase` does that), and `turnCommands` are empty.

**Other switch moments**
| Moment | Phases | Enemy acts on the switch-in first? | Enemy's next command decided against |
|---|---|---|---|
| Switch command | `TurnStartPhase` orders non-FIGHT commands first (`src/phases/turn-start-phase.ts:28-45`) and unshifts `SwitchSummonPhase(SWITCH or BATON_PASS, slot, cursor, true, isPlayer)` (`:122-130`) | yes: every enemy move this turn (targets are battler indices) | old field this turn; new field next turn |
| Faint replacement (ours) | `FaintPhase.doFaint` → `pushNew("SwitchPhase", SWITCH, slot, isModal true, doReturn false)` (`src/phases/faint-phase.ts:181`), level 0, after `TurnEndPhase` | no (the turn is over) | new field |
| Trainer post-KO send-in | `pushNew("SwitchSummonPhase", SWITCH, slot, -1, false, false)` (`src/phases/faint-phase.ts:192`); `preSummon` resolves −1 with `getNextSummonIndex` (`src/phases/switch-summon-phase.ts:56-60`), a seed fork | — | its new mon decides next turn against our field then |
| U-turn / Volt Switch / Flip Turn / Baton Pass / Shed Tail | `ForceSwitchOutAttr.apply` → `leaveField`, `queueDeferred("SwitchPhase", type, slot, true, true)` (`src/data/moves/move.ts:7239,7288-7297`); Baton Pass transfers stages in `SwitchSummonPhase.onEnd` (`src/phases/switch-summon-phase.ts:247-248`) | yes, if the enemy moves later in the turn (its command was chosen against the old mon's slot) | old field this turn; new field next turn |
| Wimp Out / Emergency Exit | `PostDamageForceSwitchAbAttr` → `ForceSwitchOutHelper.switchOutLogic` → `queueDeferred("SwitchPhase", SWITCH, slot, true, true)` (`src/data/abilities/ab-attrs.ts:6044,5771-5785`) | same as above | same |
| Roar / Dragon Tail on us | `ForceSwitchOutAttr.apply` with `FORCE_SWITCH`: `queueDeferred("SwitchSummonPhase", …)` to a bench mon drawn with `user.randBattleSeedInt` (`src/data/moves/move.ts:7278-7287`) | same as above | same |

The faint-replacement `SwitchPhase` is also idle UI (the party screen), so game calls are safe there. Tell it apart
from a mid-turn `SwitchPhase` by `isModal && !doReturn`; the check-switch one has `!isModal`.

**A switch-in lands with fresh summon data.** `SwitchSummonPhase` calls `resetSummonData()` on the mon it sends in,
whatever the switch type (`src/phases/switch-summon-phase.ts:128-134`; `src/field/pokemon.ts:5351-5359`), so its stat
stages are 0 however it left. Baton Pass then copies the outgoing mon's stages and passable tags onto it
(`transferSummon`, `switch-summon-phase.ts:247-248`; `src/field/pokemon.ts:4458-4480`). In a double both slots may
name the same bench index. Each switch swaps its two party entries (`switch-summon-phase.ts:190-191`), and the
switches run in the outgoing mons' speed order (`SwitchSummonPhase` is a dynamic phase: `src/dynamic-queue-manager.ts:13-29`,
`src/queues/pokemon-phase-priority-queue.ts:6-9`), so the later one sends in the mon the earlier one withdrew, reset.

---

## 10. Biome choice, and module-private game tables

Read at the pinned tag (`v1.12.1.1`).

**The choice.** `SelectBiomePhase.start` (`src/phases/select-biome-phase.ts:19`) — draws global RND; sets the UI
mode — first calls `resetSeed()` (line 22), then forces END when the stretch ahead
reaches the classic final wave, the Daily final wave or an Endless X50 (lines 29–36). A Daily event seed's
`forcedBiomes` entry for the wave being left (`waveIndex` 10, 20, 30 or 40) comes next: one biome is taken outright
(lines 38–42); several, or `allMapOptions` (the biome's own `biomeLinks` with weights dropped, not the event's), stand in
for the filtered list below, with no 1/n roll (lines 52–56). `allMapOptions` on a one-link biome takes that link
outright. An entry with any id outside `BiomeId` forces nothing. Otherwise it filters the
biome's `biomeLinks` plus any the active timed event adds: a plain id stays, `[id, n]` stays when `!randSeedInt(n)`
(1/n, line 56). With ≥ 2 left and a `MapModifier` it opens UiMode 15 OPTION_SELECT with one
`{label: getBiomeName(id), handler}` per link and `blockCancelButton` (lines 58–75), else `randSeedItem` picks. The
forced list is `getDailyForcedBiomes` (`src/data/daily-seed/daily-run.ts:374`), the event's links
`getEventBiomeLinks` (`src/timed-event-manager.ts:376`; no event at this tag sets any). The handler closes over the id: a reader sees only the labels. No biome links to END; it is
reached only by the forced rule. Laboratory links to Construction Site and Island, both plain
(`src/data/balance/biomes/laboratory.ts:103`): a Map offers both, and without one it is a coin
flip. Island's only other way in is Beach's `[ISLAND, 2]` (`beach.ts:114`), and it leads on only to Sea (`island.ts:113`).

**The tables.** `allBiomes` (`src/data/data-lists.ts:17`, a `Map<BiomeId, Biome>` filled by `initBiomes`,
`src/init/init-biomes.ts:79`; shape `src/@types/biomes.ts:34`: `biomeId, pokemonPool, trainerPool, trainerChance,
weatherPool, terrainPool, bgm?, biomeLinks`), `speciesDataRegistry` (`src/globals/global-species-data-registry.ts:3`, set by
`setSpeciesDataRegistry`, line 5), `getBiomeName` (`src/utils/common.ts:418`, pure) and `trainerConfigs`
(`src/data/trainers/trainer-config.ts:1013`) are module exports, not scene fields: nothing on the scene reaches another
biome's pools. `Arena` keeps only its own (`src/field/arena.ts:94`): `trainerPool`, and a `pokemonPool` merged per tier
as `[...pool[ALL], ...pool[timeOfDay]]` by `updatePoolsForTimeOfDay` (`src/field/arena.ts:542` — writes `pokemonPool`,
`lastTimeOfDay`). That merge runs when `newArena` builds the arena, while `currentBattle` is still the X0 wave, and again
on an X5 wave (`src/battle-scene.ts:1549`): waves X1–X4 spawn from X0's time of day, X5–X0 from X5's. Time of day is
`(wave + waveCycleOffset) % 40`: < 15 DAY, < 20 DUSK, < 35 NIGHT, else DAWN; ABYSS always NIGHT (`Arena.getTimeOfDay`,
`src/field/arena.ts:918`, pure). Pool keys: tier 0–4 COMMON…ULTRA_RARE, 5–8 BOSS…BOSS_ULTRA_RARE
(`src/enums/biome-pool-tier.ts`); time of day -1 ALL, 0 DAWN, 1 DAY, 2 DUSK, 3 NIGHT (`src/enums/time-of-day.ts`). A
gym leader's signature species are closures in `partyMemberFuncs` (`initForGymLeader`,
`src/data/trainers/trainer-config.ts:662`), so a leader is judged by `specialtyType`. How `04-game-tables.js` reaches these
tables at runtime is a live-bundle matter (§22).

**What the ten waves after a biome choice hold.** A choice at wave X0 covers X1…X10 of the new biome.
`GameMode.isWaveTrainer` (`src/game-mode.ts:206`) — draws global RND: forks per earlier wave, one draw on the stream.

| Wave | Holds | Rule |
|---|---|---|
| fixed or final | not the biome's | `isFixedBattle` / `isWaveFinal` (§12) |
| gym `w % 30 === (offsetGym ? 0 : 20)`, not final | a trainer, always | early return, `src/game-mode.ts:217` |
| X2…X9 | a trainer with 1/`trainerChance` | blocked by a gym or fixed wave in `[max(w−2, X2), min(w+2, X10)]` and by a hit on each earlier wave of that window, each rolled `randSeedInt(c)` in its own fork at offset `v` (lines 227–247): `(1 − 1/c)^k / c` |
| X1, X0 (not gym) | wild | X1 skipped for a sprite bug; X0 is a wild boss |
| Daily | trainer on X5, and on X0 from 20 to 40 | line 215; `getDailyTrainerManipulation` (`src/data/daily-seed/daily-run.ts:280`) can override |

**A trainer.** `Arena.randomTrainerType` (`src/field/arena.ts:520`) — draws global RND: `randSeedInt(512)` through
`generateNonBossBiomeTier` (line 224: ≥ 156 COMMON, ≥ 32 UNCOMMON, ≥ 6 RARE, ≥ 1 SUPER_RARE, 0 ULTRA_RARE; no luck), or
`randSeedInt(64)` through `generateBossBiomeTier` (line 197: ≥ 20, ≥ 6, ≥ 1, 0) when the BOSS tier is non-empty and
`isTrainerBoss` holds (`src/game-mode.ts:256`: the gym wave, outside END unless classic or final; Daily X0 in 20–40) —
**the gym leader is the biome's**. An empty tier drops one at a time; an empty COMMON gives BREEDER; the pick is
`randSeedItem`. Its party, slot by slot, is `Trainer.genNewPartyMemberSpecies` (`src/field/trainer.ts:451`) — draws
global RND: `speciesPools` by the same 512 cut (a nested entry is rerolled until a number, line 478), else
`BattleScene.randomSpecies(w, level, false, speciesFilter)` (`src/battle-scene.ts:2293`, pure but for one
`randSeedItem`): every catchable species passing the filter, taken back to its root. Every config has a filter (no
legendary, sub-legendary, mythical or trainer-forbidden species, `src/data/trainers/trainer-config.ts:201`).
`genNewPartyMemberSpecies` retries up to 25 times (line 512) when the pick came out as a prevolution of the species
rolled (line 494), a balanced template repeats a type (line 496), or the pick is already in the party (line 507). That
last check compares the pick's own id with the party's root species (`checkDuplicateSpecies`, line 525), so an evolved
pick is not caught. Every slot without a `partyMemberFuncs` entry rolls it, even one a named double's pool or a
same-species template then replaces (lines 414–426). The specialty type steers the evolution instead (below).

**A wild spawn.** `Arena.randomSpecies` (`src/field/arena.ts:573`) — draws global RND. A Daily override species wins
(`getOverrideSpecies`, `src/game-mode.ts:268`). It is a boss spawn when `getEncounterBossSegments(w, level) > 0`, the
BOSS tier is non-empty and the biome isn't END (unless classic or final) (lines 580–585): `randSeedInt(64 − luck/2)`
over the boss cuts, else `randSeedInt(512 − 2·luck)`. `getEncounterBossSegments` (`src/battle-scene.ts:1936`) answers
in a fork at `w << 2`: every X0, **plus, when the mode `hasRandomBosses` (Endless and Spliced Endless),
`randSeedInt(100) < min(max(ceil((w − 250) / 50), 0) × 2, 30)`** — nothing before wave 250, then 2 % more of every
wave per 50 waves, capped at 30 %. A sub-legendary, legendary or mythical species is forced to a boss, but that is
read from the species the roll already picked, so it moves no pool. A Daily event seed's `forcedWaves[].tier` replaces the roll for
a wave's first spawn (`getDailyForcedWaveBiomePoolTier`, `src/data/daily-seed/daily-run.ts:232`). Empty tiers drop; an
all-empty pool falls back to any catchable species. A legend-like pick is rerolled (up to 10 attempts) while
`getWaveForDifficulty(w, true)` (`src/game-mode.ts:192`; Daily adds 30) is below 80 for BST ≥ 660, else 55
(`checkLegendBST`, `src/field/arena.ts:642`). Luck is `getPartyLuckValue` (§12).

**Evolutions.** `PokemonSpecies.getWildSpeciesForLevel` (`src/data/pokemon-species.ts:1068`) calls
`determineEnemySpecies` (`src/ai/ai-species-gen.ts:106`) — draws global RND — with kind WILD (2), or NORMAL (1) for a
boss; a trainer passes its template's kind (default NORMAL). Every `GYM_LEADER_1`–`5` and `ELITE_FOUR` slot is STRONG
(`src/data/trainers/trainer-party-template.ts:186-210`, `:212-217`), and a signature slot built by `partyMemberFuncs` gets that kind
too (`src/field/trainer.ts:327`, `:334`), which `getRandomPartyMemberFunc` forwards to `getTrainerSpeciesForLevel`
(`src/data/trainers/trainer-config.ts:963-972`); at 1.12.0.11 those slots took NORMAL. First `getRequiredPrevo` (line 63): below a prevolution's
threshold for the kind (else its required level; the `min` of both unless that level is 1) the prevolution is returned
outright. Then `calcEvoChance` (line 33) keeps each evolution whose `t = max(required level, evoLevelThreshold[kind])`
the spawn has reached, `randSeedItem` picks one, and it is taken when `randSeedIntRange(t, round(t·m)) ≤ level` (m: 1.2
wild, 1.1 normal, 1 strong), recursing without the prevolution step. In a battle whose trainer's config has a
`specialtyType`, the evolutions are first narrowed to those whose evolved form (`getPokemonSpeciesForm`, at `evoFormKey ?? 0`) is of
that type, when some but not all are (lines 134–143); this replaced the old reroll in
`genNewPartyMemberSpecies`. So a level-1 trade or item evolution is sure unless
it carries a threshold. Classic wave 20's trainer never evolves (line 127).

**The heal.** `setNextBiomeAndEnd` (`src/phases/select-biome-phase.ts:105`) — phase queue — unshifts `PartyHealPhase`
when the next wave is an X1 and `PARTY_HEAL` allows it (`LimitedSupportChallenge.applyPartyHeal`,
`src/data/challenge.ts:1202`: only value 2 keeps the heal), else a `SelectModifierPhase` in its place.
`PartyHealPhase.start` (`src/phases/party-heal-phase.ts:18`) skips the fainted under `PREVENT_REVIVE` (Hardcore,
`src/data/challenge.ts:1286`). So the fainted fight in the next biome, except under those two — `healRevives` (§12).

`47-biome.js` turns this into odds per wave, taking which wave is which and how likely a trainer is on it from the run
calendar (`trainerOdds`, §12).

---

## 11. The run seed, and previewing a wave before it starts

**The seeded RNG, in one place.** Every seeded draw comes off one generator, Phaser's global `RND`, which the game
re-sows in place. There is no draw counter.

- `randSeedInt(range, min = 0)` (`src/utils/common.ts:102`) — returns `min` **without drawing** when `range <= 1`, else
  `RND.integerInRange(min, range - 1 + min)`: one global draw. `randSeedItem` (`:141`, no draw for a one-item list),
  `randSeedFloat` (`:133`) and `randSeedShuffle` (`:150`) draw from the same generator; `randInt` / `randItem` are
  `Math.random`, unseeded.
- `shiftCharCodes(str, n)` (`src/utils/common.ts:33`) — pure: adds `n` to every char code. Every seed below is
  `shiftCharCodes(base, offset)`.
- `resetSeed(w?)` (`src/battle-scene.ts:2010`) — writes `waveSeed = shiftCharCodes(seed, w ?? currentBattle.waveIndex)`
  and sows the live stream with it. Called at the top of `newBattle` (`:1263`), again by `EncounterPhase` once the
  enemy party exists (`src/phases/encounter-phase.ts:294`, `:308`), by a wave's first reward roll (§19) and by
  `SelectBiomePhase.start` (`src/phases/select-biome-phase.ts:22`).
- `executeWithSeedOffset(fn, offset, seedOverride?)` (`src/battle-scene.ts:2017`) — saves `RND.state()`, `rngOffset`
  and `rngSeedOverride`; sows `shiftCharCodes(seedOverride || seed, offset)`; runs `fn`; puts the three back. It does
  not save `waveSeed` or anything `fn` writes, and has no `try/finally` (a throwing `fn` leaves the fork's stream
  live). This is a **fork**: its draws depend only on the seed and offset, and the live stream carries on as if it never
  ran — for draws made before `fn` returns, so an async `fn` is forked only up to its first `await` (§13).
- The battle stream. `Battle.battleSeed` is `randomString(16, true)` (`src/battle.ts:81`), 16 global draws when the
  `Battle` is built. `Battle.randSeedInt(range, min)` (`src/battle.ts:486`) — no draw for `range <= 1`; otherwise it
  saves the global state, resumes `battleSeedState` or, when that is null, sows `shiftCharCodes(battleSeed, turn << 6)`,
  draws through `randSeedInt`, stores `battleSeedState` and restores the global state and `rngSeedOverride`. It never
  moves the global stream; it writes `battleSeedState`. `incrementTurn()` (`:173`) nulls it, so every turn restarts from
  its own seed. It is reached as `BattleScene.randBattleSeedInt` (`src/battle-scene.ts:1098`) and
  `Pokemon.randBattleSeedInt` (`src/field/pokemon.ts:5858`, which falls back to `randSeedInt` with no battle).

**The run seed itself.** A new run's is `randomString(24)` (`src/battle-scene.ts:1152`), drawn from `A–Z a–z 0–9`
(`src/utils/common.ts:21`); a loaded session keeps its saved one (`src/system/game-data.ts:890`). A Daily's is not:
it is the text `GET /daily/seed` returns, unchecked (`src/api/daily-api.ts:6`), or offline the date through `btoa`,
`==` included (`src/phases/title-phase.ts:340`), passed through `trySetCustomDailyConfig` (`src/game-mode.ts:448`),
whose custom JSON form may set the seed to any string.

Forks by offset, run seed unless marked: `isWaveTrainer` look-back `w`; ME roll `w * 3000`; which ME `w * 16`; ME
`onInit` `w`; fixed-battle trainer `(seedOffsetWaveIndex || w) << 8`; `new Battle` `w << 3` (**wave** seed); boss bars
`w << 2` (`getEncounterBossSegments`, `src/battle-scene.ts:1936`); a trainer's party members (below); Pokérus
`w + (slot << 8)` (`:1980`); `waveCycleOffset` / `offsetGym` at 0 (`:1912`, `:1924`); speed-tie shuffle
`turn * 1000 + groups` (wave seed, `src/utils/speed-order.ts:34`); `applyShuffledModifiers` `turn << 4` (wave seed,
`src/battle-scene.ts:2872`); Daily luck at 0 (`src/modifier/modifier-type.ts:2913`).

**What a wave's content hangs on.** `newBattle()` (`src/battle-scene.ts:1256`) sows the wave seed at its top, then
runs the rows below while `currentBattle` is still wave w−1 (null on a run's first wave): it is reassigned only when
`new Battle` returns (`:1300`). So a `getPartyLevels` reached from row 5 sees w−1's `waveIndex`, and an evil team's
party template is read off it (§12).

| # | Call | Draws | Stream or fork |
|---|---|---|---|
| 1 | `gameMode.isWaveTrainer(w)` (`src/game-mode.ts:206`) | look-back per earlier wave, then `!randSeedInt(arena.trainerChance)` | look-back forks at `w` (`:237`); the final roll (`:248`) is on the stream. A gym wave (`w % 30 === (offsetGym ? 0 : 20)`, `:217`) and Daily's calendar return before drawing. Skipped entirely when `!gameMode.hasTrainers` (Endless, `src/battle-scene.ts:1422`) |
| 2 | `isWaveMysteryEncounter(type, w)` (`src/battle-scene.ts:3419`) | `randSeedInt(256)` vs the spawn rate | fork `w * 3000`, run seed (`:3457`). The caller then writes `encounterSpawnChance` (`:1435`) |
| 3 | `generateNewBattleTrainer(w)` (`:1452`) | `arena.randomTrainerType` tier + type (`src/field/arena.ts:520`), the double roll, the variant roll, then the `Trainer` constructor's party template (`src/field/trainer.ts:62`) and name(s) (`:77`, `:90`) | stream |
| 3′ | `getFixedBattle(w).getTrainer()` (`src/battle-scene.ts:1381`) | the `Trainer` constructor's template and name | fork `(seedOffsetWaveIndex \|\| w) << 8`, run seed (`:1390`) — replaces 1–3 on a fixed wave |
| 4 | `checkIsDouble(...)` (`:1484`) | the wild double roll, `randSeedInt(getDoubleBattleChance(w))` (`:1507`); a trainer's is its variant, no draw | stream |
| 5 | `new Battle(...)` (`src/battle.ts:111`) | `battleSeed`, then per slot `getLevelForWave` (`:133`: `randSeedFloat` loop, or `RND.realInRange` on a boss wave); a trainer's levels are `getPartyLevels`, no draw | fork `w << 3`, **wave** seed (`src/battle-scene.ts:1297`) |

On a Mystery Encounter wave `EncounterPhase.start` picks *which* encounter with `getMysteryEncounter()`
(`src/battle-scene.ts:3487`) in a fork at `w * 16` (`src/phases/encounter-phase.ts:73`), then runs its `onInit` in a
fork at `w` (`:82`).

**The enemy party** is built in `EncounterPhase.start`. A trainer's `genPartyMember(i)` (`src/field/trainer.ts:316`)
**forks per member** at `waveIndex + (getDerivedType() << 10) + (((useSameSeedForAllMembers ? 0 : i) + 1) << 8)`, or
`getDerivedType() + ((i + 1) << 8)` with `hasStaticParty` (`:440-444`), run seed. A wild member rides the stream:
`BattleScene.randomSpecies(w, level, true)` (`src/battle-scene.ts:2293`) → `arena.randomSpecies(w, level, 0,
getPartyLuckValue(party))` (`src/field/arena.ts:573`: a luck-shifted tier roll, `randSeedItem` of the pool, up to ten
retries on a legendary BST mismatch); a Golden Bug Net holder's `randSeedInt(10)` (`src/phases/encounter-phase.ts:116`);
then `addEnemyPokemon` (`src/battle-scene.ts:888`). That constructor draws ability, id (the IVs), gender, nature
(`src/field/pokemon.ts:341`–`419`), the moveset (`:6636`), a trainer member's IVs (`:6664`), and a boss's second IV set
unless a Daily config sets the boss's IVs (`src/battle-scene.ts:912-913`). The shiny check draws nothing — `trySetShiny` (`src/field/pokemon.ts:3053`) compares the
id already drawn — and a shiny's variant is rolled in a fork at the mon's id on the wave seed (`:3146`). So
`isEncounterShinyLocked()` (`src/phases/encounter-phase.ts:318`: the END biome, and either Endless — Spliced Endless
included — or Fresh Start; wild spawns only) changes the shiny flag and no stream draw. The scene wrapper's third argument is
`fromArenaPool`; the arena method's is `attempt`, so calling the arena method with the scene's argument list is a
different draw (retry counter 1, no luck).

Members are generated in slot order, each stored in `enemyParty[e]` before the next (`src/phases/encounter-phase.ts:104`–
`196`), and a later member reads the earlier ones off `currentBattle`. `genPartyMember` reads `enemyLevels[index]`
(`src/field/trainer.ts:318`), `waveIndex` (`:442`, `:483`) and `enemyParty` (the named-double pool `:362`, a
same-species slot `:419`, balanced types `:496`, the duplicate-species reroll through `getEnemyParty()` `:534`). The
`EnemyPokemon` constructor reads `enemyParty.length` (`src/field/pokemon.ts:6611`) and `waveIndex` (`:428`, and for a
trainer member's IV floor `:6661`), never `enemyLevels`.

**A member's level is not always `enemyLevels[i]`.** `addEnemyPokemon` runs a trainer member's `postProcess` after the
constructor and a boss's second IV set (`src/battle-scene.ts:925`), and the rival's write `level` outright
(`src/data/trainers/rival-party-config.ts:651`, `:392`, `:463`, `:579`), some changing `formIndex` too (`:398`). The
constructor has already computed the stats at the old level and form (`src/field/pokemon.ts:458`); they catch up at
the first `updateModifiers(false)` — the tail of `generateEnemyModifiers` (`src/battle-scene.ts:2711`, called from
`EncounterPhase.start`, `src/phases/encounter-phase.ts:279`), again in `doEncounter` (`:339`) — which runs
`calculateStats()` over the enemy party (`src/battle-scene.ts:2790`). `calculateStats` draws nothing, and the modifiers
it applies match by the Pokémon's own id (`PokemonHeldItemModifier.shouldApply`, `src/modifier/modifier.ts:691`).

**So**: a fork is exact from any point in the run; the stream is only as good as a replay that draws what the game
draws, in order. A fork is exact about its own roll, **not about its inputs**: a generic trainer's members are each
forked, but keyed on a trainer drawn on the stream, so the party is `replay`. Only a fixed battle — kind and trainer
both a table lookup — is exact end to end; a gym wave's *kind* is exact, its trainer is not. `48-preview.js` replays
the table inside `executeWithSeedOffset(fn, w, seed)` (the same sow as `resetSeed(w)`) with `currentBattle` swapped
for the `Battle` it built and `waveSeed` pinned, labels fields `exact` / `replay` / `estimate`, and scores itself on
arrival.

**Side effects of the calls it makes.** Pure: `isFixedBattle` / `getFixedBattle` (`src/game-mode.ts:357`, `:370`;
both run challenge hooks), `isBoss` (`:313`), `getPartyLevels` (`src/field/trainer.ts:262`; a double on a
one-member template is levelled from a local two-member copy, `:269-271`, not by resizing the shared one). Draws only inside their own fork: `isWaveMysteryEncounter`,
`getEncounterBossSegments`. Draws wherever called (the preview calls them inside its fork): `isWaveTrainer`,
`generateNewBattleTrainer`, `checkIsDouble`, `randomSpecies`, `addEnemyPokemon`, `genPartyMember`, `new Battle` /
`getLevelForWave`, `getMysteryEncounter`. Writes:
the `Trainer` constructor builds sprites via `addFieldSprite` (`src/field/trainer.ts:109`);
`getMysteryEncounter` runs `meetsRequirements()` on the shared encounter templates (assigning their primary /
secondary Pokémon, §13) inside its fork. **Not safe**: `newBattle()` itself — it re-sows the live stream, assigns
`currentBattle`, `field.add`s the trainer (`src/battle-scene.ts:1398`, `:1444`), calls `incrementTurn` and queues
phases in `doPostBattleCleanup` (`:1535`).

**Unmeasured**: whether anything draws on the stream between `newBattle`'s double roll and the wild party loop that
the replay doesn't (`doPostBattleCleanup`'s Pokérus spread is forked). The arrival check measures it;
`window.__coachHud.preview()` prints the tally.

---

## 12. The fixed-battle calendar, full heals, and reward luck

The **run calendar** (`03-calendar.js`) is four rules, all pure reads of the wave index. Every card asks it rather
than writing a rule of its own — the look-ahead for the schedule, the biome card for its ten waves, the rewards card
for whether a boss is next, the catch card for the run's last wave:

| Rule | Source | Waves |
|---|---|---|
| `gameMode.isWaveFinal(w)` | `src/game-mode.ts:296` | classic and challenge 200; daily 50; endless every 250, a final boss the run carries on past (`src/phases/victory-phase.ts:57`) |
| `gameMode.isFixedBattle(w)` | `src/game-mode.ts:357`, table `classicFixedBattles` (`src/data/trainers/fixed-battle-configs.ts:23`, waves `src/enums/fixed-boss-waves.ts`) | 5 youngster; rival 8/25/55/95/145/195; evil team 35/62/64/66/112/114/115/164/165; Elite Four 182/184/186/188; champion 190 |
| the gym rule | `src/game-mode.ts:217`, the early return in `isWaveTrainer` | `w % 30 === (offsetGym ? 0 : 20)`, except the final wave |
| `gameMode.isBoss(w)` | `src/game-mode.ts:313` | every tenth wave |

Only classic and challenge modes carry the table. `isFixedBattle` and `getFixedBattle` (line 370) also ask the
`FIXED_BATTLES` challenge hook, which writes only a throwaway config; Single Generation rewrites the evil team, Elite Four
and champion there (`src/data/challenge.ts:626`). The rules overlap (190 is both the champion and a tenth wave); the
table's order is the precedence the HUD uses. The calendar holds from any point in a run.

**Who the fixed trainers are.** `handleFixedBattle` (`src/battle-scene.ts:1381`) runs `config.getTrainer()` in a fork
at `(seedOffsetWaveIndex || w) << 8` on the run seed and `field.add`s the trainer. Rivals take their variant from the
player's gender (no draw); the youngster rolls `randSeedInt(2)`. Every evil-team wave sets `seedOffsetWave(35)` and the
Elite Four and champion `seedOffsetWave(182)`, so each group rolls in the same fork and the same `randSeedItem` index
picks one team (or one region) for the whole group; admins take `randSeedUniqueItem(choice, 1 | 2)`
(`src/utils/random.ts:41`), so 66, 114 and 164 are different people. In `getRandomTrainerFunc` (`src/battle.ts:577`)
the gender and a grunt's 1/3 double use `randInt`, which is `Math.random` (`src/utils/common.ts:89`): **unseeded, not
replayable**. Grunt fixed battles pass `randomGender` (`src/data/trainers/fixed-battle-configs.ts:59`), and a grunt is
DOUBLE on its 1/3, else the gender roll's variant (`src/battle.ts:611`). `TrainerConfig.getTitle`
(`src/data/trainers/trainer-config.ts:807`) names the variant — `nameDouble` ("Rocket Grunts") or `nameFemale` — and a
grunt's `Trainer.getName` is that title alone (`src/field/trainer.ts:156`), so a grunt's name is no more replayable
than its double. `new Trainer` (`src/field/trainer.ts:45`) draws a party template (`randSeedItem`) and a name.
Every grunt and admin instead sets `partyTemplateFunc` to `getEvilGruntPartyTemplate`
(`src/data/trainers/trainer-party-template.ts:271`), which reads `currentBattle?.waveIndex` each time it is asked:
≤35 `TWO_AVG`, ≤62 `THREE_AVG`, ≤64 `TWO_AVG_ONE_STRONG`, else `GYM_LEADER_5` (six members; also for a null battle).
`getPartyTemplate` (`src/field/trainer.ts:255`) re-asks on every call, so the party's size and levels come from
`getPartyLevels` under wave w−1 (§11), while each member's strength, from `genPartyMember`'s own `getPartyTemplate`
call (`:322`), comes from wave w.
`Trainer.genPartyMember` (`src/field/trainer.ts:316`) — forks the run seed; adds the member via `addEnemyPokemon` —
seeds each member at `w + (derivedType << 10) + (((sameSeed ? 0 : i) + 1) << 8)`, or `derivedType + ((i + 1) << 8)`
for `hasStaticParty` (rivals, admins, evil leaders, gym leaders, Elite Four, champions; `trainer-config.ts:441`), whose
party is therefore the same at any wave of the run. A `partyMemberFuncs` slot (negative keys count back from the end,
`index − template.size`) wins over `genNewPartyMemberSpecies` (§10).

**Which trainers are bosses.** `TrainerConfig.isBoss` (`src/data/trainers/trainer-config.ts:151`) is set by `setBoss`
(`:435`), which the evil-team admin (`:592`), Trainer's Test stat trainer (`:611`), evil-team leader (`:644`), gym
leader (`:694`), Elite Four (`:750`) and champion (`:782`) inits call, and rivals 4–6 directly (`:5824`, `:5843`,
`:5879`); rivals 1–3 never. `hasVoucher` (`:169`) is set true by exactly four inits — evil-team leader (`:646`), gym
leader (`:696`), Elite Four (`:752`) and champion (`:784`) — and false by the admin's (`:589`); no rival sets one.
`clone()` (`:893`) carries `isBoss` (`:904`) but never `hasVoucher`, so the gym leader that Mysterious Challengers'
brutal option clones from the biome's boss pool (`src/data/mystery-encounters/encounters/mysterious-challengers-encounter.ts:89`)
has none, and its battle stays `MYSTERY_ENCOUNTER` (`src/battle-scene.ts:1433`). A double trainer's `getName()`
carries its double title even without `includeTitle`: `Gym Leader Duo Tate & Liza` (`src/field/trainer.ts:196`).

**Full heals.** `VictoryPhase.start` (`src/phases/victory-phase.ts:23`) — phase queue — pushes `SelectBiomePhase` when
`hasRandomBiomes || isNewBiome()` (line 125); `isNewBiome` (`src/battle-scene.ts:1243`, pure) is every X0, plus X5 with
short biomes and X49 in Endless and Daily. `setNextBiomeAndEnd` heals entering an X1 (§10). `PartyHealPhase.start` —
writes `hp = getMaxHp()`, `resetStatus`, every `ppUsed = 0`, `arena.playerTerasUsed = 0` — revives the fallen unless
`PREVENT_REVIVE`. So a classic run heals entering 11, 21 … 191 and nowhere else, and **waves 181–190 hold the four
Elite Four fights and the champion with no heal between them**. `VictoryPhase` pushes `SelectModifierPhase` only when
`currentWaveIndex % 10` (line 85): **no rewards screen after a tenth wave** (X0 grants fixed items through
`ModifierRewardPhase` instead), except under Limited Support 1 and 3, whose X1 transition queues one in the heal's place.

**A battle that ends without a win.** `BattleEndPhase.start` (`src/phases/battle-end-phase.ts:80-89`) queues a rewards
screen of its own when the battle was not won and none is queued yet: the ordinary one if any foe fainted
(`currentBattle.enemyFaints > 0` — a double where one foe was KO'd and the other then fled, or the player then ran),
else — unless the player ran (`currentBattle.successfulRun`, set by `AttemptRunPhase`,
`src/phases/attempt-run-phase.ts:36`) — `SelectModifierPhase(0, undefined, { fillRemaining: false, rerollMultiplier: -1 })`:
**no free reward (an empty row with Continue) and a greyed-out, dead reroll; the shop rows still show** wherever the
mode has a shop (`GameMode.getShopStatus`: none in Daily, `hasNoShop`, nor under Limited Support 2 and 3). A wild battle
ends this way when its last active foe leaves the field with HP left: forced out by our Roar, Whirlwind, Dragon Tail or
Circle Throw, or switching itself out with Teleport, Parting Shot or Chilly Reception — a wild foe may self-switch only
with a status move and never with Baton Pass, and Shed Tail always fails for it (`ForceSwitchOutAttr`,
`src/data/moves/move.ts:7302-7345`, guard at 7451-7457) — or through Wimp Out / Emergency Exit
(`src/data/abilities/ab-attrs.ts:5790-5826`). Neither happens on an X0 wave (`move.ts:7455`, `ab-attrs.ts:5793`). So,
where the mode has a shop, every wave but an X0 and the final wave ends in a shop, won (a catch counts) or fled,
**except one the player runs from with no foe fainted**.

**Reward tiers and luck.** `getNewModifierTypeOption` (`src/modifier/modifier-type.ts:2769`) — draws global RND — rolls
`randSeedInt(1024)`: > 255 COMMON, > 60 GREAT, > 12 ULTRA, 1–12 ROGUE, 0 MASTER. For the player pool, when the roll isn't
0 and `allowLuckUpgrades`, it repeats `randSeedInt(floor(128 / ((luck + 4) / 4))) < 4`, adding a tier each hit; a pinned
tier runs the same loop, stopping at an empty tier. So luck is a per-reward chance of a tier upgrade: **3.1 % at luck 0,
14.3 % at luck 14**. `getPartyLuckValue` (line 2913) — pure but for a fork — is, **in Daily, `randSeedInt(15)` in a
fork at offset 0 on the run seed** (or the event seed's luck), not the party's. Elsewhere it sums `getLuck()`
(`src/field/pokemon.ts:1816`: `luck`, plus `fusionLuck` when fused) over members `isAllowedInBattle()`
(`src/field/pokemon.ts:578`), +1 for each whose species the timed event boosts, clamps to 0–14, then adds the event's
`luckBoost` (capped at 14). A fixed battle's `customModifierRewardSettings` pins `guaranteedModifierTiers` and sets
`allowLuckUpgrades: false` for the rival from 25 on and both evil bosses (`src/data/trainers/fixed-battle-configs.ts:39`
and after; read by `getPlayerModifierTypeOptions`, `src/modifier/modifier-type.ts:2503`): luck buys nothing on that
screen as first rolled. **A reroll drops those settings** (`rerollModifiers`,
`src/phases/select-modifier-phase.ts:189`, queues `SelectModifierPhase(rerollCount + 1, tiers)`), so it takes luck
upgrades like any other wave (§19). `getRerollCost` (`src/phases/select-modifier-phase.ts:420`, pure) is
`ceil(wave / 10) × base × 2 ** rerollCount × rerollMultiplier`, base 250, or the summed tier values
`[50, 125, 300, 750, 2000]` when rarities are locked; a negative `rerollMultiplier` returns -1 (no reroll); a cost
modifier applies last.

**The classic final boss (wave 200).** All read, none rolled:

- `generateEnemyModifiers` (`src/battle-scene.ts:2646`) returns early for `currentBattle.isClassicFinalBoss`
  (`src/battle.ts:129`), so **phase 1 carries no held items**; `Pokemon.hasPassive` (`src/field/pokemon.ts:2325`)
  returns false for it unless the Passives challenge is on — **no passive ability**.
- `EnemyPokemon.damage` (`src/field/pokemon.ts:7156`) caps damage at `hp - 1` in form 0 while `bossSegmentIndex < 1`,
  and `getMinimumSegmentIndex` (`src/field/pokemon.ts:7194`) returns 1 in form 0: **phase 1 cannot be knocked out**.
- `DamageAnimPhase.end` (`src/phases/damage-anim-phase.ts:97`) calls `BattleScene.initFinalBossPhaseTwo`
  (`src/battle-scene.ts:3261`) — state writes, phase queue — which gives Eternamax a **non-transferrable Mini Black
  Hole** (`TurnHeldItemTransferModifier`: one of the player's held items every turn), regenerates its moveset at form 1,
  changes form and sets `currentBattle.double = true`: **the fight becomes a double**.
- Movesets are fixed (`EnemyPokemon.generateAndPopulateMoveset`, `src/field/pokemon.ts:6758`): form 0 Eternabeam /
  Sludge Bomb / Flamethrower / **Cosmic Power**; form 1 Dynamax Cannon / Cross Poison / Flamethrower / Recover, built as
  `new PokemonMove(MoveId.RECOVER, 0, -4)` — `ppUp` −4 on a 5-PP move, so **Recover has 1 PP** at normal priority
  (`PokemonMove.getMovePp`, `src/data/moves/pokemon-move.ts:98`). Inverse Battle swaps Flamethrower for Earth Power.
- Bars come from `getEncounterBossSegments(200, level, ETERNATUS, true)` (`src/battle-scene.ts:1936`, pure when forced):
  2, +1 at level ≥ 100, +1 for BST ≥ 670, +1 per 250 waves. Each break boosts a stat picked by weight, +2 for the last
  shield (≥ 3 bars) and the second-last (≥ 5) (`handleBossSegmentCleared`, `src/field/pokemon.ts:7211`) — §3.

**Safe to call this way** (pure reads of the wave index or the player's own party): `gameMode.isWaveFinal` /
`isFixedBattle` / `getFixedBattle` / `isBoss`, `Pokemon.getLuck` / `isAllowedInBattle`, a modifier's `getStackCount()`,
`getPartyLuckValue` (its Daily fork restores the stream). `getFixedBattle(w).getTrainer()` is *not*: it draws, calls
`Math.random`, and builds sprites; `48-preview.js` only calls it inside a fork.

---

## 13. Mystery Encounters: the option screen, its forks, and what the common and great encounters do

Read from the pinned source; nothing here has been checked against a live encounter yet.

**The screen.** `MysteryEncounterPhase.start` (`src/phases/mystery-encounter-phases.ts:48`) — writes: bumps the seed
offset with `updateSeedOffset()` (`src/data/mystery-encounters/mystery-encounter.ts:551`: `seedOffset ?? waveIndex ×
1000`, then `+ 512`), pushes the encounter onto `encounteredEvents`, and opens `UiMode.MYSTERY_ENCOUNTER` (45, `:66`).
`MysteryEncounterUiHandler.displayEncounterOptions` (`src/ui/handlers/mystery-encounter-ui-handler.ts:346`) calls
`option.meetsRequirements()` once per option and keeps the answers in `optionsMeetsReqs` (`:396`); the labels are text
objects in `optionsContainer`, "view party" last. `processInput` (`:122`) refuses an unmet option only in optionMode
`DISABLED_OR_DEFAULT` (1) or `DISABLED_OR_SPECIAL` (3) (`:148`). Only four options form FIGHT's 2×2 grid
(`handleFourOptionMoveInput`, `:254`; dispatch `:164-176`, FIGHT's own at `src/ui/handlers/fight-ui-handler.ts:176-195`).
Three put DOWN from 0 or 1 on 2 (`:217`), and two, or any other count, are one row (`:188-211`). "View party"
(`viewPartyIndex`, the last index, `:323`) sits above the rows at the top right (`:465-473`): UP from the top row, and
RIGHT from 1 on the four-option grid, reach it, and DOWN or LEFT leave it for 1 (`:258-285`). Nothing wraps.

**Requirements are not reads.** `MysteryEncounterOption.meetsRequirements`
(`src/data/mystery-encounters/mystery-encounter-option.ts:90`) writes `primaryPokemon` / `secondaryPokemon`. Without
secondary requirements it takes the **first** qualifier (`:166`) — the mon the game uses when the option opens no
party picker; with `excludePrimaryFromSecondaryRequirements` and secondaries it draws `randSeedInt` for the primary
(`:150`, `:156`). The encounter's own `meetsRequirements` (`src/data/mystery-encounters/mystery-encounter.ts:328`)
draws a **random** primary among the qualifiers (`:411`). Each requirement's `queryParty(party)` only filters, and no
requirement draws. `MoneyRequirement.meetsRequirement`
(`src/data/mystery-encounters/mystery-encounter-requirements.ts:393`) writes `requiredMoney` from
`getWaveMoneyAmount(scalingMultiplier)` (`src/battle-scene.ts:2366`), which is pure arithmetic on the wave index.

**The forks.** `EncounterPhase` runs `onInit` and the dialogue tokens in a fork at `waveIndex`
(`src/phases/encounter-phase.ts:82`). An option's closures run on the run seed at offsets from `getSeedOffset()`
(`src/data/mystery-encounters/mystery-encounter.ts:543`):

| Closure | Where | Offset |
|---|---|---|
| `onPreOptionPhase` | `MysteryEncounterPhase.handleOptionSelect` (`src/phases/mystery-encounter-phases.ts:95`) | `getSeedOffset()` |
| `onOptionPhase` | `MysteryEncounterOptionSelectedPhase.start` (`:185`; after the intro visuals hide when `autoHideIntroVisuals`) | `getSeedOffset() × 500` |
| `onPostOptionPhase` | `PostMysteryEncounterPhase.start` (`:585`) | `getSeedOffset() × 2000` |
| `onRewards` | `MysteryEncounterRewardsPhase.start` (`:523`) | `waveIndex × 1000` |

`executeWithSeedOffset` restores the stream as soon as its callback *returns* (§11), and these callbacks are async, so
**only the draws before a closure's first `await` are forked**. An awaited helper runs synchronously up to its own
first `await`, so `initBattleWithEnemyConfig`'s party build still counts
(`src/data/mystery-encounters/utils/encounter-phase-utils.ts:139`); a party picker's callback runs later, on the live
stream. The reward *screen* is not in the `× 1000` fork: it is a queued `SelectModifierPhase(0, …)`, whose `start`
re-sows the wave seed (§19). `handleOptionSelect` (`src/phases/mystery-encounter-phases.ts:74`) first calls
`populateDialogueTokensFromRequirements()` (`src/data/mystery-encounters/mystery-encounter.ts:452`) on the live
stream: it re-runs the encounter's and every option's `meetsRequirements()`, so it can draw there and re-assign
primaries, but it can't move the forks.

**Leaving.** `leaveEncounterWithoutBattle(addHealPhase)` (`src/data/mystery-encounters/utils/encounter-phase-utils.ts:810`)
queues `MysteryEncounterRewardsPhase(addHealPhase)`. With no `doEncounterRewards` set and `addHealPhase` **true**, that
unshifts a `SelectModifierPhase` with `{ fillRemaining: false, rerollMultiplier: -1 }`
(`src/phases/mystery-encounter-phases.ts:549`): the shop with **no free reward and no reroll**, not a heal. With
`addHealPhase` **false** and no `doEncounterRewards`, `doEncounterRewardsAndContinue` takes *neither* branch and the
wave ends with **no screen at all** — which is what Slumbering Snorlax's nap does, having already unshifted its own
`PartyHealPhase(true)` (a full heal *and* revive, `src/phases/party-heal-phase.ts:18`, bar a PREVENT_REVIVE challenge).
`setEncounterRewards(settings)` (`encounter-phase-utils.ts:728`)
unshifts `SelectModifierPhase(0, undefined, settings)`: `fillRemaining: false` is a screen of exactly the guaranteed
items, **pick one**; `fillRemaining: true` tops it up to the normal count with ordinary rolls
(`src/phases/select-modifier-phase.ts:384`).

**The twelve common encounters** (tier weight 66, `src/enums/mystery-encounter-tier.ts:6`, less 6 per common already
seen, `src/battle-scene.ts:3540`; Field Trip is common too but commented out,
`src/data/mystery-encounters/mystery-encounter-biomes.ts:145`). All are gated to waves 10–180
(`src/constants.ts:17`) unless a row says otherwise. Files are `src/data/mystery-encounters/encounters/<name>-encounter.ts`;
bare line numbers in a row are in that file.

**No encounter on a boss wave or the one after it.** `isMysteryEncounterValidForWave` (`src/battle-scene.ts:3470`)
refuses `isBoss(w)` (`w % 10 === 0`) and `w % 10 === 1` on top of every gate, so a gate "from wave 100" is first
servable at 102; only a Daily's scheduled encounter returns before it (`:3420`). A rate override does not reach this
check, and on a refused wave `currentBattle.mysteryEncounter` is never set (`src/phases/encounter-phase.ts:72`).

| Encounter | Gate | Options, as the source does them | Forked before an `await` |
|---|---|---|---|
| Mysterious Chest | party ≥ 2 (`:44`) | open: `roll = randSeedInt(100)` (`:121`) — ≥ 75 pick of Common×2 + Great×2, ≥ 45 Ultra×3, ≥ 35 Rogue×2, ≥ 30 Master×1 (`:141`–`179`), else **trap**: `getHighestLevelPlayerPokemon(true, false)` is KO'd, then a Gimmighoul boss (level additive 0.5) with normal rewards (`:182`–`198`) · leave | pre ×1: the roll |
| Fight or Flight | — | fight a boss (+2 to one of Atk/Def/SpA/SpD, `randSeedInt(4, 1)` on entry, `:82`) for `misc`, itself a `ModifierTypeOption` (> 160 Master, > 120 Rogue, > 40 Ultra, else Great; TMs and Candy Jars rerolled; `:93`–`113`), catchable · steal it with a `STEALING_MOVES` user, EXP (`:167`) · leave | option ×500: the boss build |
| Department Store Sale | waves 10–100 (`:24`) | pick of 5 TMs (`randSeedInt(5)`: < 2 Common, < 4 Great, else Ultra) · pick of 3 (`randSeedInt(3)`: 0 PP Up, else a vitamin) · pick of 5 (`randSeedInt(5)`: 0 Dire Hit, else an X item) · pick of 4 ball packs (`randSeedInt(65)`: < 10 Poké, < 40 Great, < 60 Ultra, else Rogue) (`:64`–`160`) | option ×500: every roll (no `await`); the exact item is rolled on the reward screen |
| Shady Vitamin Dealer | money ≥ ×1.5; HP ratio ≥ 0.51 (`:46`–`48`) | ×1.5: 2 random vitamins (drawn in the picker callback, `:101`) on a mon over half HP; post: it loses `floor(maxHp / 2)` and `newNature = randSeedInt(25)`, redrawn while equal to its `nature` (`:150`–`156`), 100 EXP · ×5: 2 vitamins on any mon, 100 EXP (`:184`–`224`) · leave | post ×2000: the nature, for a given mon |
| Lost at Sea | — | a Surf learner guides, EXP (`:63`) · a Fly learner guides, EXP (`:81`) · every allowed mon takes `floor(maxHp × 25 %)` (`:108`), never below 1 HP (`applyDamageToPokemon`, `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts:346`) | no draws |
| Fiery Fallout | waves 40–180 (`:71`) | double battle vs 2 Volcarona (+1 SpD/Spe, Fire Spin on both player slots, sun) → party slot 0 gets a random attack-type booster + rewards (`:88`–`300`) · every allowed non-Fire mon (`isOfType(FIRE, { includeTeraType: false })`) takes 20 %, then `burnable[randSeedInt(burnable.length)]` (no status) is burned if `canSetStatus(BURN, true)`, and **its ability is overridden to Heatproof** (`:228`–`251`) · a Fire type or `FIRE_RESISTANT_ABILITIES` mon: no fight, booster + rewards, EXP (`:262`–`291`) | option ×500: the burn target |
| The Strong Stuff | party ≥ 3 allowed, once a run (`:50`–`52`) | drink: the two highest `getSpeciesForm().getBaseStatTotal()` (stable sort, fainted included) get −15, the rest +10 (`:162`–`180`) — every base stat by that, HP by half (`src/modifier/modifier.ts:969`) — then rewards · fight Shuckle (5 bars, +1 Def/SpD, berries; Gastro Acid and Stealth Rock on the player's lead) → Soul Dew + rewards (`:89`–`229`) | no draws; Shuckle is built after an `await` |
| Berries Abound | — | fight a boss → pick of 5 berries + `numBerries` (> 160: 7, > 120: 5, > 40: 4, else 2; `:92`) · race: `d = fastest.getStat(SPD) / (enemySpeed × 1.1)` (`:199`); `d ≥ 1` grabs `max(min(round((d − 1) / 0.08), numBerries), 2)` berries + the pick of 5, no fight, EXP (`:267`); `d < 1` is the fight with the boss +1 Def/SpD/Spe (wave < 50) or all five (`:240`) · leave | option ×500: the 5 berry options (`:202`); `d` is arithmetic |
| Part-Timer | — | a picked mon earns `getWaveMoneyAmount(mult)` × Amulet Coin (`value += floor(value × 0.2 × stacks)`, `src/modifier/modifier.ts:2899`): deliver `mult = clamp(2.5 × Spe / base, 1, 4)`, `base = floor(196 · L / 100) + 5` (`:107`); warehouse the same on `HP + 1.5 (Atk + Def)` against `floor(166 · L / 100) + L + 10 + 1.5 × 2 (floor(166 · L / 100) + 5)` (`:181`); sell (a `CHARMING_MOVES` user) ×2.5 (`:281`). Every move of that mon is left with **at most 2 PP** (`:118`); 100 EXP, normal rewards | no draws |
| Teleporting Hijinks | waves X2–X4, money ≥ ×1.75 (`:64`–`66`) | pay ×1.75, or free with a Steel/Electric mon (+EXP): `BIOME_CANDIDATES` minus the current biome, `[randSeedInt(n)]` (`:195`) — Space, Fairy Cave, Laboratory, Island, Wasteland, Dojo — then an enraged boss there · stay: a boss here, Magnet and Metal Coat among the rewards | option ×500: the destination (before `:200`); the boss there is drawn after |
| Uncommon Breed | — | `misc.pokemon` (level = top party level − 2, egg move `randSeedItem(eggMoves)` in its **last** move slot; `:67`–`87`), not a boss (`:102`) — fight it (+1 Def/SpD on entry, +1 Spe too from wave 150; `:92`–`94`, `:104`–`111`), it opens with its egg move, catchable · spend 4 random berries: it joins, +2nd egg move · a `CHARMING_MOVES` user: it joins with each IV `max(iv, randSeedInt(31))` (never 31, `:260`), +2nd egg move, EXP; both with rewards. The 2nd egg move goes in the third slot, and `givePokemonExtraEggMove` splices the first out of the pool by its move id rather than its index, so it can draw the first again (`:274`–`286`) | option ×500: the berries, and the charm's IVs (not replayed) |
| Global Trade System | party ≥ 2 allowed for trades (`:153`, `:260`) | trade a mon for one of 3 offers built in `onInit` (`getPokemonTradeOptions`: non-legendary, non-paradox species within ±100 BST, widened until > 20, same level; a legendary gets a fixed pool; `:481`–`538`) · wonder trade: random species, boosted shiny / hidden-ability odds (all in the picker callback, `:270`) · a held item for a random item one tier up (`:433`) · leave | `onInit` fork at `w`: the offers, readable in `misc.tradeOptionsMap` |

**The eight great encounters** (tier weight 40, less 4 per great already seen, `src/battle-scene.ts:3542`). An Offer You Can't Refuse is great tier
too but commented out of the biome table (`mystery-encounter-biomes.ts:153`), so a run can never serve it, and it is
left unjudged for the same reason Field Trip is. Gates are waves 10–180 unless a row says otherwise.

| Encounter | Gate | Options, as the source does them | Forked before an `await` |
|---|---|---|---|
| Mysterious Challengers | — | three **trainer** battles built in `onInit`: the biome's own trainer (`:47`) → TM_COMMON + TM_GREAT + MEMORY_MUSHROOM, filled · a second trainer on `1 STRONGER + min(ceil(wave / 20), 5) AVERAGE` with `levelAdditiveModifier 1` (`:66`) → 2 Ultra + 2 Great, filled · a **gym leader** on the ELITE_FOUR template (6, `trainer-party-template.ts:212`) with `levelAdditiveModifier 1.5` and `expMultiplier 0.9` (`:88`, `:206`) → 2 Rogue + Ultra + Great, filled | none readable: each option's `initBattleWithEnemyConfig` is nested in its own `executeWithSeedOffset` at wave ×10 / ×100 / ×1000 (`:154`), and a trainer's party is built from `trainerConfig`, not from species on the config |
| Slumbering Snorlax | waves 15–150 (`:50`), no flee | fight Snorlax (`levelAdditiveModifier 0.5`, asleep 6 turns, Docile, Body Slam / Crunch / Sleep Talk / Rest, Sitrus + Enigma + an HP booster, Soothe Bell and Lucky Egg at `randSeedInt(2, 0)` stacks) opening with Snore → LEFTOVERS, filled; catchable · nap: `PartyHealPhase(true)` then `leaveEncounterWithoutBattle()` — **no shop** · a `STEALING_MOVES` user: LEFTOVERS, `fillRemaining: false`, Snorlax's base EXP to the thief, no fight | `onInit` fork at `w`: the two stack counts |
| Safari Zone | money ≥ ×2 (`:57`) | pay ×2 → a **continuous encounter**: three wild mons in turn, each with ball / bait / mud / run as `overrideOptions`. Catch rate is `round(speciesCatchRate × 1.5 × (2 + max(catchStage, 0)) / (2 − min(catchStage, 0)))`, and that rate is **not** a probability: `throwPokeball` turns it into `ballTwitchRate = round(1048560 / ⁴√(16711680 / catchRate))` and hands it to `trainerThrowPokeball` (`encounter-pokemon-utils.ts:434`), which asks for **three** passes of `randSeedInt(65536) < ballTwitchRate` before it locks — so P(catch) = `min(1, twitch / 65536)³`, with no HP term, no status or shiny multiplier and no critical capture, unlike `AttemptCapturePhase` (§20). A **modified** rate of 256 or more puts the twitch rate over 65536, so the catch is certain and no flee roll follows; 255 lands at 65535/65536, which is 99.995 %, and at stage 0 the first certain species rate is 171 (×1.5 → 257). Flee is `((255² − rate²) / 255 / 2) × the same modifier on fleeStage` — off the **species** catch rate, never the modified one — rolled as `randSeedInt(256) < flee` at the end of every turn that is not a catch and not a run, a failed ball included (`:502`–`:510`). Bait: catch +2 always, flee +1 at 80 % (`randSeedInt(10) >= 8` refuses); mud: flee −2 always, catch −1 at 80 % (`:206`–`:251`) · leave | the mons are **not** on `getSeedOffset()`: `summonSafariPokemon` sows its own fork at `waveIndex × 1000 × safariPokemonRemaining` (`:322`), starter cost ≤ 5, non-legendary, with doubled shiny and hidden-ability rolls |
| Delibird-y | money ≥ ×2, and a mon holding either a berry / Reviver Seed or anything that is not one (`:85`–`:92`); at most 4 a run | pay ×2 → AMULET_COIN · give a berry → CANDY_JAR, or a Reviver Seed → BERRY_POUCH · give any other transferable held item that is not a berry, Reviver Seed, Tera shard or vitamin → HEALING_CHARM. **Each degrades**: at `getStackCount() >= getMaxStackCount()` for the charm it would give, it is a SHELL_BELL on party slot 0 instead (`:163`, `:253`, `:349`). All three leave with `addHealPhase` true | no draws (the event-only `doEventReward` aside) |
| Absolute Avarice | waves 20–180, ≥ 6 berries (`:58`), no flee | `onVisualsStart` **takes every berry** and `misc.berryItemsMap` records them by holder (`:264`) · fight Greedent (3 bars, `levelAdditiveModifier 1`, +1 SpD below wave 50 else SpD/Spe, Stuff Cheeks turn 1, holding copies of everything it took) → filled rewards **and a REVIVER_SEED for every party member without one**, fainted included: `givePartyPokemonReviverSeeds` walks `getPlayerParty()` (`:294`–`:306`) · beg: each holder gets `floor(own × 2 / 5)` back, types drawn by `Phaser.Math.RND.shuffle` + pop (`:341`) · let it eat: Greedent joins at `getHighestLevelPlayerPokemon(false, true).level − 2`, fainted members included (`encounter-pokemon-utils.ts:147`), with its passive and Thrash / Body Press / Stuff Cheeks / Slack Off; the berries are gone | option ×500: the returned types — but the loop calls `applyModifierTypeToPlayerPokemon` between shuffles, so the **count** is the safe claim and the types are not replayed |
| Dancing Lessons | waves 30–180 (`:70`), no flee | `onInit` puts a **real Oricorio on the field** (`currentBattle.enemyParty[0]`, `misc.oricorioData`), form by biome, else `randSeedInt(4)` (`:110`–`123`), level `getEncounterPokemonLevelForWave(STANDARD_ENCOUNTER_BOOSTED_LEVEL_MODIFIER)`, moveset forced to hold Revelation Dance (`:99`–`:130`) · fight it (boss, +1 Atk/Def/SpA/SpD on entry, opens with Revelation Dance) → BATON, filled; catchable · teach Revelation Dance (100 BP special, `MatchUserTypeAttr`) to a chosen mon · a `DANCING_MOVES` user: it **joins**, its moveset gaining the dance shown | no draws; the Oricorio, its form included, was built in the `onInit` fork at `w` |
| Bug-Type Superfan | waves 30–180, party ≥ 3, a Bug type or a Quick Claw / Grip Claw / Bug booster on the team (`:166`–`:176`); once a run | fight Quinn, whose team `getTrainerConfigForWave` shuffles out of four pools by `WAVE_LEVEL_BREAKPOINTS` (`:480`) → filled rewards, then `onRewards` is a **four-move tutor**, one `randSeedInt(5)` per pool in the order physical, special, status, misc (`:253`–`:257`) · show off: the reward is by how many Bug types are in the **whole** party — < 2 SUPER_LURE + GREAT_BALL, < 4 QUICK_CLAW + MAX_LURE + ULTRA_BALL, < 6 GRIP_CLAW + MAX_LURE + ROGUE_BALL, else MASTER_BALL + MEGA_BRACELET and DYNAMAX_BAND if not already owned + one of the evolution / form-change items at `randSeedInt(n)`, pushed only when any is on offer (`if (specialOptions.length > 0)`, `:349`) (`:283`–`:360`) · give the bug item → a Rogue-tier MYSTERY_ENCOUNTER_GOLDEN_BUG_NET + REVIVER_SEED, no fight | option ×500: the four tutor picks, drawn before `transitionMysteryEncounterIntroVisuals` is awaited |
| Fun and Games | money ≥ ×1.5 (`:47`) | pay ×1.5, pick a mon → a Wobbuffet at **that mon's level** with 0 IVs and a Mild nature that never attacks (`skipEnemyBattleTurns`, `skipToFightInput`), and three turns on it. The prize is its HP ratio at the end: < 3 % MULTI_LENS, < 15 % SCOPE_LENS, < 33 % WIDE_LENS, else nothing and a heal (`:266`–`:293`). **KO it and the player loses**: `handleLoseMinigame` ends the encounter and charges `getWaveMoneyAmount(1.5)` again (`:251`) · leave | no draws |

**Two readings the great tier adds.** A config carrying `trainerConfig` instead of `pokemonConfigs` has **no species to
read**: `initBattleWithEnemyConfig` takes its levels from `trainer.getPartyLevels(waveIndex)` (`src/field/trainer.ts:262`)
and only then adds the shared `max(round(wave / 10 × levelAdditiveModifier), 0)`, a `pokemonConfigs[i].level` replacing
both. `getPartyLevels` works on `d = getWaveForDifficulty(w)`: each slot is `ceil((1 + d/2 + (d/25)²) × m)` for its
template strength's `m` — WEAKEST 0.95, WEAKER 1, WEAK 1.05, AVERAGE 1.12, STRONG 1.22, STRONGER 1.24, STRONGEST 1.25 —
and a slot below STRONG has `m` raised by `0.025 × floor(d/25)`, capped at 1.225, then gives back
`floor(d/50 × (STRONG − strength))` levels (`:279`–`:309`). It reads no draw. A config naming only a `trainerType` takes
`trainerConfigs[trainerType]` (`encounter-phase-utils.ts:158`), and the trainer is a double when that config is
`doubleOnly`, or `hasDouble` with the party config's `doubleBattle` (`:160`); a double on a one-member template is
levelled as two of its strength (§11). The battle fields one member per level (`battle.enemyLevels.forEach`, `:205`),
however many `pokemonConfigs` there are. The template is whatever `Trainer.getPartyTemplate` answers: the config's
`partyTemplateFunc` when it has one, else `partyTemplates` at `partyTemplateIndex`, which is `randSeedItem` over the
indices (`field/trainer.ts:61`, `:255`) — so only a config with no func and a single template settles the party's size
and levels before the fight. Mysterious Challengers' first option keeps the biome trainer's own config, so it is settled
only when that config is. Its second option looks settled but isn't: `clone()` keeps a `partyTemplateFunc`
(`src/data/trainers/trainer-config.ts:921`) and `setPartyTemplates` doesn't clear it (`:472`–`475`), so an Ace Trainer,
Breeder, Hooligans, Interviewers or Mysterious Sisters drawn there fights on its own func, not
`1 STRONGER + min(ceil(w / 20), 5) AVERAGE`; only the third option nulls the func
(`mysterious-challengers-encounter.ts:95`).

Delibird-y's degradation is a **live modifier read**, not a draw: `getStackCount()` against `getMaxStackCount()` on the
charm each option would give.

**Only Safari Zone re-opens the option screen.** `initSubsequentOptionSelect` (`encounter-phase-utils.ts:800`) pushes a
fresh `MysteryEncounterPhase` with `overrideOptions`, and it is used by that encounter alone — Mysterious Challengers
does not. Two consequences. `MysteryEncounterPhase.start` calls `updateSeedOffset()` **outside** the
`optionSelectSettings` guard (`mystery-encounter-phases.ts:55`), so **every re-entry adds another 512** and all three
forks move with it; and the `encounteredEvents` push and the `selectedOption` write are both inside that guard, so the
journal records the encounter and its first pick only, never a minigame turn. Both rolls above are on the live stream
rather than a fork, so a minigame turn is odds and never `fixed`. There is no turn limit: a mon leaves only by being caught,
by bolting, or by the player running, which makes the stage pair (catch −6…+6, flee −6…+6, both reset per mon by
`summonSafariPokemon`) the whole state of a turn — and "throw now" against "set up first" a comparison of played-out
chances rather than a lookup. An override option is not on `me.options`, so `me.options.indexOf(opt)` is −1 for all of
them: the card tells the two menus apart by that and judges a Safari turn positionally, leaving every other secondary
menu to the generic reading. Each turn re-opens the menu **on the option just taken**: Safari Zone passes its index as
`startingCursorIndex` (`safari-zone-encounter.ts:552`), which the handler applies unless the cursor was last on "view
party" (`src/ui/handlers/mystery-encounter-ui-handler.ts:98-111`).

**The three mons are readable before the fee is paid** (#313). `summonSafariPokemon` (`:322`) sows its own fork at
`waveIndex × 1000 × safariPokemonRemaining` — 3, 2 and 1 — which is *not* the `getSeedOffset()` the re-entries move by
512, so all three are settled up front and stay put for the whole minigame. It decrements `safariPokemonRemaining`
only after that fork (`:332`), so while a mon is out the field counts the mons still to come after it. Inside each fork,
`getRandomEncounterPokemon` (`encounter-phase-utils.ts:988`) draws in this order: the event arm (`randSeedInt(100) <
eventChance` **only** when `getAllValidEventEncounters` is non-empty, so with no timed event live the branch costs the
stream nothing), else `getSafariSpeciesSpawn` → `getRandomSpeciesByStarterCost([0, 5], NON_LEGEND_PARADOX_POKEMON,
undefined, false, false, false)`, whose `randSeedInt(band.length)` is drawn against the **unshuffled** band and read out
of the shuffled one; then `new EnemyPokemon(…)`, whose constructor rolls shiny; then one extra `trySetShinySeed(64,
true, 0)` and one `tryRerollHiddenAbilitySeed(256)` — the doubled rolls, the hidden-ability one skipped when the
constructor already landed `abilityIndex === 2`. A timed-event pick takes one more of each, every shiny reroll before
the hidden-ability ones (`encounter-phase-utils.ts:1042-1055`). `getLevelForWave()` is called **inside** the fork, and it draws: the
three mons can sit at different levels on one wave. `eventChance` is module state (`50`, `+25` per non-event spawn, and
no further rise once any event spawn has happened, reset by `withOnInit`) and so unreadable from the scene — but it is
derivable, since `withOnInit` puts mon 1 at 50 and each replayed mon says whether the next starts over. The shiny
threshold is **not** a constant: `trySetShinySeed(…, true, …)` multiplies in `getShinyEncounterMultiplier()` and applies
`ShinyRateBoosterModifier`, the player's Shiny Charm stacks. The pool is `getAllStarters(true)`, a static table, not the
arena pool — so unlike a wild spawn nothing rebuilds it. Checked against the real game end to end by the encounter
oracle, which pays the fee and compares all three.

**The five ultra encounters** (tier weight 19) **and the four rogue ones** (weight 3, and `withMaxAllowedEncounters(1)`
on three of them, so at most one a run). Same file convention as the table above; bare line numbers are in that file.

| Encounter | Gate | Options, as the source does them | Forked before an `await` |
|---|---|---|---|
| Training Session | party ≥ 2 (`:51`), no flee | pick a member; it leaves the party and fights you as a boss **of itself** — same level, form, IVs, moveset and held items (`getEnemyConfig`, `:384`), the items untransferable — then comes back with the prize. Light: `min(2 + floor(wave / 50), 5)` bars, **2 random non-maxed IVs** up by +10 under 11, +5 under 21, else +3, capped at 31 (`:107`, `:131`–`150`) · medium: `min(2 + floor(wave / 40), 6)` bars, **any nature** (`:225`, `:233`) · heavy: `min(2 + floor(wave / 30), 6)` bars and a `MYSTERY_ENCOUNTER_POST_SUMMON` tag — **+1 to every stat on entry** — for **any ability the species has**, hidden included (`:317`–`320`, `:326`) · leave. All three set `fillRemaining: true`: an ordinary reward screen on top | no draws before the party picker; the IV shuffle is in `onBeforeRewardsPhase`, after the battle |
| The Pokémon Salesman | money ≥ ×4 (`:54`) | `onInit` builds the mon and the price outright and leaves both on `misc` (`:192`): a starter-cost ≤ 5 species with a hidden ability (rerolled up to 5×), or — on `randSeedInt(100) === 0`, or when a timed event is running — a **shiny Magikarp** or an event mon with 3 extra shiny rolls (`:90`–`163`). Price is `getWaveMoneyAmount(4 × max(starterTier, 2.5) / 5)`, always the full ×4 for a shiny (`:179`–`189`). Buying `catchPokemon`s it **at level 5** with `abilityIndex` 2 (`:229`) · leave | `onInit` fork at `w`: the whole offer, readable on `misc` |
| Trash to Treasure | waves 100–180 (`:51`), party ≥ 3, once a run, no flee | investigate: a Gmax Garbodor boss, `bossSegmentModifier: 1`, level additive 0.5, `disableSwitch` — **no switching all fight** — opening with **Toxic on your lead and Stockpile on itself** (`:81`–`180`) → guaranteed Leftovers plus Rogue / Ultra / Great and `fillRemaining` · dig: **one Leftovers and one Shell Bell**, each to the first party member not already holding a full stack (`tryApplyDigRewardItems`, `:230`), and a **Black Sludge**: every shop item costs **2.5× for the rest of the run** (`:205`) | `onInit` fork at `w`: the boss's held items; the dig itself draws nothing |
| Clowning Around | waves 80–180 (`:84`) | `onInit` draws Blacephalon's ability from a 15-strong pool and its **two random types** (`:144`–`153`), leaving the ability's localized name in the `ability` dialogue token and the types on `pokemonConfigs[1].customPokemonData`. Battle: a **double** vs boss Mr. Mime and boss Blacephalon, Mr. Mime **Role Plays** that ability off it and both **Taunt** your slots (`:209`–`229`) → ordinary rewards, then the post-option phase offers that **ability onto one of your mons for good** (`handleSwapAbility`, `:437`) · item shuffle: the member with the most transferable non-berry items has its berries redrawn and its Ultra / Rogue items rerolled **inside their own tiers**, count kept (`:284`–`336`) · type shuffle: **every member's second type is redrawn**, preferring a type it already has a non-status move for — `[...new Set(offTypes)].sort()` (the default, string, sort), `randSeedShuffle`, then `pop` — else `getRandomRegularPokemonType()`, one `randSeedInt(18)` (`src/utils/pokemon-utils.ts:195`), redrawn while it hits one of the mon's own types (`:375`–`413`) | `onInit` fork at `w`: the ability and the types · pre ×1: the whole type shuffle, the loop being synchronous |
| The Expert Pokémon Breeder | waves 25–180 (`:137`), party ≥ 4 | the three options are **your own three lowest-friendship members**, sorted in `onInit` (`:186`); each one's egg count is worked out there too and left on `misc` — `min(max(floor((680 − BST) / 20), 1), 18)` points plus `min(max((7 − starterCost) × 2, 0), 12)`, capped at 30, first 5 points Common, then one Great per 4 and one Common per point left (`calculateEggRewardsForPokemon`, `:600`). Picking one **removes every other member from the party** and fights the breeder's three alone → those eggs, a Soothe Bell and `fillRemaining` rewards. **Losing is not the run**: `onGameOver` (`:681`) puts the party back, leaves the chosen mon fainted at 0 friendship and drops the rewards | `onInit` fork at `w`: the breeder's party and all three egg counts |
| Dark Deal | waves 30–180, party ≥ 2 (`:129`), catchable | deal: `getRandomPlayerPokemon(true, false, true)` — a random legal member **still standing**, or a random fainted legal one when only one standing member is left (that one itself if no legal member has fainted; any legal member when none stands) (`encounter-pokemon-utils.ts:92`–`121`) — is **removed from the party for good** along with its held items, its name left in the `pokeName` token (`:154`–`167`). Then 5 Rogue Balls and a boss drawn from `getRandomSpeciesByStarterCost` at a tier from `randSeedInt(100)`: ≥ 65 → 6, ≥ 15 → 7, ≥ 5 → 8, else 9–10 (`:186`–`190`) — a band with no species of those types, excluded ones dropped first, widens `min` down to 0 and then `max` up to 10 (`encounter-pokemon-utils.ts:257`–`285`) — sharing the taken mon's types, or a mono-type challenge's own type in their place (`:176`–`182`), and **carrying its held items** (`:194`). Every species left at cost 6 and up is legendary or sub-legendary, the non-legendary paradox mons all being excluded, so the boss is a legendary except where the types have none left in or near the band: Bug drops to Scyther or Heracross (cost 5) at every tier, Ghost to an ordinary cost-4 starter at tiers 6–7 (85% of draws). A dual type stops widening at its first hit, so Bug/Ghost lands on Scyther or Heracross at tiers 6–7 and Normal/Bug is legendary 77% of the time. `withCatchAllowed(true)`, so the boss can be caught · leave | pre ×1: which member it takes · option ×500: the tier roll, then the species |
| A Trainer's Test | rogue, no wave gate of its own | `onInit` draws one of five stat trainers with `randSeedInt(5)` — Cheryl, Marley, Mira, Riley, else Buck — and leaves it on `misc` and in the `statTrainerName` token (`:53`–`107`); the config is `levelAdditiveModifier: 1` over an **`ELITE_FOUR` party template, 6 mons** (`initForStatTrainer`, `trainer-config.ts:605`). Accept: fight it → an **Epic egg** plus a Relic Gold, 2 Rogue tiers and `fillRemaining` (`:158`–`172`) · decline: a **full party heal** (`PartyHealPhase`) plus a **Rare egg**, and the shop with no free reward (`:184`–`193`) | `onInit` fork at `w`: which trainer |
| Weird Dream | waves 30–140 (`:142`), party ≥ 3, once a run | `onInit` transforms the **whole team** and leaves it on `misc.teamTransformations` (`:168`): two members (shuffled, so not the first two) to a species +90–110 BST, the rest +40–50, at most one over 600 and one in 570–600 (`getTeamTransformations`, `:394`). Accept: the party is swapped, each new mon keeping the old one's **level, held items, moveset, passive, luck, Pokérus and the better of the two IV sets**, with a **neutral nature**, a redrawn ability, an extra egg move and a random second type (`postProcessTransformedPokemon`, `:535`) — then a **full party heal** and a screen of exactly a Memory Mushroom, a Rogue Ball and 4 Mints (`:236`–`246`) · battle that same team at your own levels, holding your items, bosses over 570 BST → exactly 2 Rogue / 2 Ultra / 2 Great, and `onBeforeRewards` **unlocks the passive on one random member without one, for the run** (`:312`–`354`) · refuse: **every member drops to `ceil(0.9 × level)`** (`:372`) | `onInit` fork at `w`: the species each member becomes. The ability, IVs, nature and second type are redrawn later, on the live stream |
| The Winstrate Challenge | waves 100–180 (`:48`), party ≥ 3, once a run | accept: **five trainer battles back to back** — configs pushed Vito, Vicky, Vivi, Victoria, Victor and `pop`ped, so Victor is first and Vito's five last, 13 mons in all — with **no healing between them**: `endTrainerBattleAndShowDialogue` only resets per-battle state (`:184`–`256`). Clearing all five gives a **Premium Voucher** and a screen of exactly a **Macho Brace**, its tier forced to Master (`:165`–`178`) · refuse: a **full party heal** plus a Rarer Candy (`:146`–`150`) | no draws |

`onInit` leaves what it rolled on the encounter: `misc` (Fight or Flight's item, Berries Abound's `numBerries` /
`fastestPokemon` / `enemySpeed`, Uncommon Breed's `pokemon`, the GTS offers, Teleporting Hijinks' `price`) and
`enemyPartyConfigs[0].pokemonConfigs` (species, `level` when fixed, `isBoss`). `initBattleWithEnemyConfig` adds
`max(round(wave / 10 × (levelAdditiveModifier ?? 0)), 0)` to the wave's levels (`encounter-phase-utils.ts:201`), a
config `level` overriding it, and gives an `isBoss` config without `bossSegments` its bars from
`getEncounterBossSegments` (`:304`).

`getHighestLevelPlayerPokemon(isAllowed = false, isFainted = false)`
(`src/data/mystery-encounters/utils/encounter-pokemon-utils.ts:139`) skips a mon that fails `isAllowedInChallenge()`
when `isAllowed`, and a fainted one unless `isFainted`; a tie goes to the member nearer the front of the party.

**Safe to call this way** (inside `sandbox`): `encounter.getSeedOffset()`, `executeWithSeedOffset` with a callback
that only draws, a primary requirement's `queryParty`, `getWaveMoneyAmount`, `Pokemon.isOfType` / `canSetStatus(effect,
true)` (§17: it can write `abilitiesApplied`, which `sandbox` restores). **Not safe**: `meetsRequirements()` on an
encounter or an option, `populateDialogueTokensFromRequirements`, any `on…Phase` closure.

**The pick is the game's own record.** `MysteryEncounterPhase.start` (`:60`) pushes a `SeenEncounterData { type, tier,
waveIndex, selectedOption }` (`src/data/mystery-encounters/mystery-encounter-save-data.ts:5`) onto
`globalScene.mysteryEncounterSaveData.encounteredEvents` as the encounter opens, with `selectedOption` −1, and
`handleOptionSelect` (`:74`) writes the chosen index into that same record — but only when `optionSelectSettings` is
unset, so a follow-up option menu never overwrites it, and only when the record's `type` still matches the encounter
in play (`:83`). It is part of the save, so it survives a reload. `55-journal.js` reads the pick there rather than
watching the input.

**The encounter lasts the wave.** `currentBattle.mysteryEncounter` is set once, by `EncounterPhase`
(`src/phases/encounter-phase.ts:72-76`), and never reassigned or cleared; only its fields change. It stays through
every fight the encounter starts (`initBattleWithEnemyConfig` reuses the Battle,
`src/data/mystery-encounters/utils/encounter-phase-utils.ts:139`) and through its reward phases, until the
`NewBattlePhase` that `PostMysteryEncounterPhase` queues (`src/phases/mystery-encounter-phases.ts:606`) replaces the
Battle.

**Measured, in part**: `npm run oracle:encounter` runs the card against the real game headless on upstream's own vitest
harness in the pinned clone, so the seed-fixed claims it covers are checked against what the game then did rather than against a
mock — the teleport destination, the part-timer's pay, both chest branches, all four store shops, the fallout's burn
target, the dealer's nature, Bug-Type Superfan's four tutor moves and Absolute Avarice's returned berry count. Read the
exit code: `0` every case run agrees, `1` a case disagrees and nothing else, `2` no answer — the clone is unprovisioned,
nothing ran, or the run raised an unhandled error the oracle cannot place. `$?` is the oracle's own, not vitest's: the
clone raises one unhandled `localStorage` rejection during i18n init, which vitest counts as a run failure however the
cases went — upstream's own encounter tests exit non-zero in that clone for the same reason — so the oracle reads its
answer from vitest's results and ignores that one known rejection (#296).

**Unmeasured**: every other seed-fixed outcome is a replay of the source's draw order, never checked against an encounter as it
resolved. A closure that gains an early `await`, or a draw before the one the HUD replays, makes it confidently wrong.
The oracle (`npm run oracle:encounter`) arrives at every **common and great** encounter and checks two of the great tier's
claims outright, but it does not reach the **ultra or rogue** tiers at all — so those rules rest on the source alone,
including the two replays Dark Deal's taken member and Clowning Around's type shuffle, and the `misc` reads the rest of
them lean on. Widening it is #298.
The **Mystery Encounter journal** (`55-journal.js`) is what that check will be read off: it writes each encounter met
in a live run — the card as it was shown, the pick, and the run state at every tick it moved — to `localStorage`, so
the comparison is reading a harvested file rather than playing until every encounter has turned up.

---

## 14. Status moves as a turn's action, and a foe's setup

Read at the pinned tag. The refs are under `30-planner.js`, `10-damage.js` and `20-enemy-ai.js` in
`scripts/hud-deps.ts`.

**What each class of move does when it lands**, as the planner writes it onto the mons (`withHypothesis`, 01-core):
- **Setup.** `StatStageChangeAttr.apply` (`src/data/moves/move.ts:3918-3937`) draws battle RNG for a partial chance,
  then unshifts `StatStageChangePhase` for `getLevels(user)` stages on each stat. It targets the user when
  `selfTarget`, else the move's target. Growth's `getLevels` adds 1 in sun (`:4296-4302`). Howl carries no `selfTarget`
  and still boosts the user, through its `USER_AND_ALLIES` target (`:10526-10529`).
  `StatStageChangeMultiplierAbAttr` scales the change: Simple ×2, Contrary ×−1
  (`src/data/abilities/init-abilities.ts:645-646,893-894`; applied at
  `src/phases/stat-stage-change-phase.ts:94`). Stages clamp to ±6 (`:218`). `CutHpStatStageBoostAttr.apply` (Belly
  Drum) first takes `toDmgValue(maxHp / cutRatio)` (`src/data/moves/move.ts:4314-4315`). `Pokemon.getStatStage` is
  `summonData.statStages[stat − 1]` (`src/field/pokemon.ts:1396-1398`), so writing that array moves every damage,
  accuracy and Speed number the game computes.
- **Status.**
  - **Landing.** `StatusEffectAttr.apply` → `trySetStatus` (`src/data/moves/move.ts:3070-3080`). A chance < 0 (every
    status move) always tries; otherwise it draws `randBattleSeedInt(100)`.
  - **Sleep.** `doSetStatus` rolls the length on the battle stream: `randBattleSeedInt(3) === 0 ? 2 : 3`
    (`src/field/pokemon.ts:5190-5193`). `MovePhase.checkSleep` counts down before the check and wakes at ≤ 0
    (`src/phases/move-phase.ts:317-340`), so sleep cancels the next 1 or 2 attempts. Early Bird subtracts one more
    (`src/data/abilities/ab-attrs.ts:5107-5109`).
  - **Paralysis.** It halves Speed in `getEffectiveStat` (`src/field/pokemon.ts:1555-1557`), and `MovePhase.checkPara`
    cancels a move on `randBattleSeedInt(8) === 0` (`src/phases/move-phase.ts:518-530`).
  - **Burn** halves physical damage in `getAttackDamage` (`src/field/pokemon.ts:3897-3904`).
  - **Toxic.** `PostTurnStatusEffectPhase` calls `Status.incrementTurn` first and then deals
    `toDmgValue(maxHp × toxicTurnCount / 16)` (`src/phases/post-turn-status-effect-phase.ts:26,46`;
    `src/data/status-effect.ts:21-22`). That is `(count + 1)/16` of the count read before the turn ends.
  - **Immunity to a status move.** It comes from `getMoveEffectiveness` (`src/field/pokemon.ts:2717`): a type chart the
    move respects (`RespectAttackTypeImmunityAttr`, `:2736`; Thunder Wave into Ground), a powder move into Grass
    (`Move.isTypeImmune`, `src/data/moves/move.ts:464-478`), `MoveImmunityAbAttr` such as Good as Gold
    (`src/field/pokemon.ts:2767`), or a Substitute (`:2790-2792`). It also comes from `canSetStatus` (`:4967`).
  - **Magic Bounce** (`ReflectStatusMoveAbAttr`, `src/data/abilities/ab-attrs.ts:5309`) sends the move back.
- **Heal.**
  - `HealAttr.apply` first lets `MoveHealBoostAbAttr` scale the ratio — Mega Launcher, ×1.5 on a pulse move, so Heal
    Pulse heals ¾ (`src/data/abilities/init-abilities.ts:1211`) — then unshifts a `PokemonHealPhase` for
    `Math.round(maxHp × healRatio)`: a heal move rounds half up, not down (`src/data/moves/move.ts:2477-2506`).
  - `HealAttr.getCondition` fails the move at full HP unless the attr was built with `failOnFullHp = false`, and
    `getFailedText` supplies the "HP is full" line (`:2513-2522`).
  - `VariableHealAttr` sets the ratio from a function of the user at apply time (`:2573-2587`). Synthesis, Moonlight
    and Morning Sun use `sunnyHealRatioFunc`: ⅔ in sun or harsh sun; ¼ in rain, heavy rain, sand, hail, snow or fog;
    ½ in strong winds or clear weather (`:9017-9034`). Shore Up's `shoreUpHealRatioFunc` heals ⅔ in sand, else ½
    (`:9036-9038`), and Floral Healing ⅔ on Grassy Terrain, else ½ (`:11613`).
  - Both weather functions read `getEffectiveWeatherForMove(user)`, which honours `PreAttackWeatherOverrideAbAttr`
    before suppression (`src/data/weather.ts:225-243`). The HUD's `effectiveWeather`
    (`30-planner.js`) does the same, so an override beats a Cloud Nine on the field and only the live weather is
    suppressible. It reads the attribute's `weatherType` by name: an override the live bundle carries under another
    name is simply not found, and the live weather stands — a quiet miss, so it wants a live look.
- **Hazards.**
  - `AddArenaTrapTagAttr.getCondition` fails once the tag can't take another layer (`canAdd`;
    `src/data/moves/move.ts:6977-6986`, `src/data/arena-tag.ts:806`).
  - On a switch-in, `EntryHazardTag.apply` (`src/data/arena-tag.ts:832-842`) skips an ungrounded mon unless the tag
    isn't grounded-only. Only Stealth Rock isn't (`:961`).
  - Stealth Rock takes `0.125 × Rock effectiveness` of max HP (`:981-984`), and Spikes `1 / (10 − 2·layers)`
    (`:945-948`), both through `DamagingTrapTag.activateTrap`, where Magic Guard (`BlockNonDirectDamageAbAttr`) cancels
    them (`:877-890`).
  - Toxic Spikes poison, or badly poison at 2 layers, and a grounded Poison type removes them (`:1016-1030`).
- **Typing.** Both moves write one field and nothing else, which is why a hypothesis can stand in for them.
  - `ChangeTypeAttr.apply` sets `target.summonData.types = [type]` (Soak → Water, Magic Powder → Psychic;
    `src/data/moves/move.ts:7725-7727`). Its `getCondition` (`:7739-7747`) fails on a Terastallized target, on
    Multitype or RKS System, and when the target is already that one type. Mold Breaker doesn't get past the two
    abilities: `hasAbility` drops only an `ignorable()` ability under its ignore (`src/field/pokemon.ts:2392`), and
    neither is one (`src/data/abilities/init-abilities.ts:833-838`, `:1568-1573`); a fused target has no such
    protection (`src/field/pokemon.ts:2381`).
  - `AddTypeAttr.apply` sets `target.summonData.addedType` (Forest's Curse → Grass, Trick-or-Treat → Ghost;
    `src/data/moves/move.ts:7761-7762`). Its `getCondition` (`:7775-7777`) fails on a Terastallized target and on one already of that type.
  - `Pokemon.getTypes` (`src/field/pokemon.ts:2079-2116`) returns `[teraType]` alone when Terastallized — hence both
    conditions — else `getBaseTypes`, which is `summonData.types` whenever that array is non-empty
    (`:2121-2124`), with `summonData.addedType` added on top (`:2111-2112`). So writing those two fields moves every
    number the game computes from typing: the chart, STAB, the AI's own scores, and a foe's matchup score.
  - Neither field is `summonData` state the HUD has to invent: the write is exactly the game's, and `withHypothesis`
    puts the previous value back.
- **Protect.** `ProtectAttr.getCondition` (`src/data/moves/move.ts:6812-6833`): the n-th success in a row passes when
  `randBattleSeedInt(3^n) === 0`, a battle-stream draw. `MoveEffectPhase.protectedCheck` lets a move through when
  `doesFlagEffectApply({ flag: IGNORE_PROTECT })` holds (Feint; Unseen Fist on contact;
  `src/phases/move-effect-phase.ts:497-527`, `src/data/moves/move.ts:897`).
- **Stopped before damage.** `MovePhase.secondFailureCheck` cancels a move in primordial weather
  (`src/phases/move-phase.ts:716-730`; `Weather.isMoveWeatherCancelled`: a Water attack in harsh sun, Fire in heavy
  rain, `src/data/weather.ts:77-88`). `thirdFailureCheck` cancels a priority move aimed at a grounded foe under
  Psychic Terrain, a spread move included; only a field-targeted one gets through (`src/phases/move-phase.ts:849-858`;
  `src/field/arena.ts:484-493`). `getAttackDamage` sees
  neither.

**A foe's setup.** The enemy AI scores a setup move by the stages it can still add (§6 step 7), so a foe that picks
Swords Dance half the time keeps doing so until capped or until an attack KOs. The exception is the game's quirk that a
SpA boost scores 0 on a mon with no physical attack. The planner takes the stages the foe is expected to add a turn
(`threatFrom(...).boost`). It ramps the foe's later hits by the Atk / SpA they raise, our hits into it by the Def / SpD
they raise, and the Speed order once a Speed boost has had the turns it needs.

**Toxic stall is not searched, and the source says why.** A stall line — Toxic on a foe, then our mons spending
turns, even fainting, while the chip adds up — spans several exchanges, so it would have to live in the team plan
(35-team-plan). Two rules of the game take it apart against a trainer, which is the only battle where our mons can be
spent for turns at all:
- **A switch resets the counter.** `PostSummonPhase.start` sets `status.toxicTurnCount = 0` on every summon
  (`src/phases/post-summon-phase.ts:18-19`), and the chip is `toDmgValue(maxHp × toxicTurnCount / 16)`
  (`post-turn-status-effect-phase.ts:46`). A toxiced foe that leaves and comes back starts again at a sixteenth, so
  every turn bought before the switch is spent for nothing.
- **The chip itself invites that switch.** `EnemyCommandPhase` switches when a bench mon's matchup score is 3× the
  active one's (2× for a boss trainer; §7), and `getMatchupScore` scales its type scores by
  `min(1, its HP ratio + 1 − ours)` — halved while it sits between 20 % and 40 % HP, and replaced by a sacrifice
  branch below 20 % (`src/field/pokemon.ts:2974-3000`). So the further the chip drives the foe, the lower its own
  score and the likelier the trainer swaps it out: a stall line pays for the switch it provokes.
Against a wild boss, which never switches, the stall *is* worth pricing — and there it is already one exchange, which
the planner models: Toxic is a `statusPlay`, and its growing chip is in `turnEndCourse` and in `koCurve`'s pacing. What
is left out is only the multi-mon trainer line. Modelling it would also need what the plan deliberately does not carry
(§ the team plan's own note: status, stat changes and mid-exchange enemy switches are not modelled), and a way to
price a mon spent as a cost to the rest of the run, not just to this fight.

**Unmeasured.** None of the status plays has met a live fight. The hypothesis writes plain
`{ effect, toxicTurnCount, sleepTurnsRemaining }` objects as statuses, so a game read that calls a `Status` method on
one would throw. That drops only that option (each runs under its own `try`), not the panel.

---

## 15. Rewards judged by who they go to: held items, mints, EXP and the level cap

`51-items.js` judges these rewards on the member they'd go to; `52-shop.js` keeps needs, TMs, balls and the tier
fallback. The HUD calls only select filters and `getMaxExpLevel`; everything else here is restated from the source.

**Ids.** `WeightedModifierType` stamps each pool entry with its key in `modifierTypeInitObj`
(`src/modifier/modifier-type.ts:1757`), and `ModifierTypeGenerator.generateType` (`:294`) — draws through its
generator; writes only the new type — copies the generator's id and tier onto what it builds. So generated rewards
carry the generator's id (`MINT`, `BERRY`, `BASE_STAT_BOOSTER`, `RARE_SPECIES_STAT_BOOSTER`, `EVOLUTION_ITEM`,
`TERA_SHARD` …) and are told apart by field: `nature` (`:689`), `berryType` (`:789`), `stat` (`:936`), `key`
(`:878`), `teraType` (`:426`), `moveType` (`:841`), `evolutionItem` (`:1168`). Plain items keep their own id
(`LEFTOVERS`). TypeScript `private` / `protected` fields are ordinary properties at runtime.

**Held items.** `PokemonHeldItemModifierType`'s select filter (`src/modifier/modifier-type.ts:394`) — pure: it builds
a throwaway modifier and checks **only the stack limit** (`inoperable` when the max is 0, `tooMany` at the max): not
the species (a Leek or Light Ball passes for anyone), not whether an Eviolite holder can evolve, not whether the holder
has a move of a type booster's type. Per stack, and the max (`src/modifier/modifier.ts`):

| Item | Effect a stack | Max |
|---|---|---|
| Leftovers (`TurnHealModifier`, `:1630`) | `maxHp / 16` at turn end, below full HP; queues a heal phase | 4 |
| Shell Bell (`HitHealModifier`, `:1725`) | `damage / 8`, the stacks summed before the one floor; below full HP | 4 |
| Focus Band (`SurviveDamageModifier`, `:1520`) | 10 % to survive a KO hit (`randBattleSeedInt(10) < stacks`) | 5 |
| Quick Claw (`BypassSpeedChanceModifier`, `:1556`) | 10 % to move first in its bracket (battle stream) | 3 |
| King's Rock (`FlinchChanceModifier`, `:1582`) | 10 % flinch (battle stream) | 3 |
| Reviver Seed (`PokemonInstantReviveModifier`, `:1907`) | revive at ½ HP once | 1 |
| Scope Lens / Leek (`CritBoosterModifier`, `:1348`) | +1 / +2 crit stages (Leek: Farfetch'd, Galarian Farfetch'd, Sirfetch'd, `src/modifier/modifier-type.ts:2034`) | 1 |
| Eviolite (`EvolutionStatBoosterModifier`, `src/modifier/modifier.ts:1187`) | ×1.5 Def / SpD while the species has evolutions; ×1.25 when one fusion half can't evolve; none while `isMax()` (G-Max, Eternamax) | 1 |
| Toxic / Flame Orb (`TurnStatusEffectModifier`, `:1672`) | badly poisons / burns the holder; either blocks the other | 1 |
| Mystical Rock (`FieldEffectModifier`, `:1995`) | the holder's weather / terrain +2 turns | 2 |
| Soul Dew (`PokemonNatureWeightModifier`, `:2639`) | a non-neutral nature multiplier 0.1 further from 1 — both ways | 10 |
| Grip Claw (`ContactHeldItemTransferChanceModifier`, `modifier.ts:3275`) | 10 % to steal an item after **any** attack the holder survives (`src/phases/move-effect-phase.ts:814`, §8), rolled with `randSeedFloat` on the global stream (`src/modifier/modifier.ts:3306`) | 5 |
| Wide Lens (`PokemonMoveAccuracyBoosterModifier`, `:2653`) | +5 accuracy | 3 |
| Multi Lens (`PokemonMultiHitModifier`, `:2705`) | +1 hit; first hit ×(1 − ¼·stacks), extras ×¼ — **the same total damage** | 2 |
| Attack type booster (`AttackTypeBoosterModifier`, `:1415`) | power ×(1 + 0.2·stacks) | 99 |
| Species booster (`SpeciesStatBoosterModifier`, `:1243`) | ×2 to its stats, its species only (Light Ball, Thick Club, Metal / Quick Powder, DeepSea Tooth / Scale) | 1 |
| Vitamin (`BaseStatModifier`, `:856`) | base stat ×(1 + 0.1·stacks) | the stat's IV (`:864`) |
| Berry (`BerryModifier`, `:1796`) | Sitrus / Lum / Leppa / Enigma max 2, the rest 3 | 2–3 |

Who benefits comes from the game's own pool weights where it has one (`initUltraModifierPool`,
`src/modifier/init-modifier-pools.ts:346`; weight functions read, never draw or write). A status orb (`:401`, `:447`)
weighs in for a member holding neither orb that it can status (`canSetStatus(…, quiet)`) and that has Toxic Boost /
Poison Heal (Flare Boost for the Flame Orb), or Guts / Quick Feet / Marvel Scale / Magic Guard without the opposite
ability, or knows Facade / Psycho Shift; a Mystical Rock (`:493`) for a weather or terrain setter by ability or move,
below its max. Lucky and Golden Eggs are only in the wild and trainer pools (`:51`–`55`, `:677`).

**Mints.** `PokemonNatureChangeModifierType.nature`; the filter (`src/modifier/modifier-type.ts:700`, pure) rejects the
member's current nature. Picking it calls `setCustomNature` (`src/field/pokemon.ts:1654`) — writes
`customPokemonData.nature`, recalculates stats, unlocks the nature in save data — which `getNature()` (`:1644`, pure)
returns. The `Nature` enum (`src/enums/nature.ts:1`) is the grid `5·raised + lowered` over `[Atk, Def, Spe, SpA,
SpD]`, neutral on the diagonal. There is **no Ability Capsule** at this tag; the Ability Charm
(`src/modifier/modifier.ts:2984`) only multiplies a wild mon's hidden-ability chance by `2^(−1 − stacks)` (1/256 →
1/64 … 1/8, 4 stacks).

**EXP and the level cap.** `getMaxExpLevel(ignoreLevelCap)` (`src/battle-scene.ts:2277`) — pure: `w =
getWaveForDifficulty(r)` for the rounded wave `r = ceil(wave / 10) × 10`, which is `r` itself outside Daily and
`r + 30 + floor(r / 5)` in Daily (`src/game-mode.ts:192-198`), so wave 30 caps at 52 there and 24 in classic; cap
`ceil((1 + w/2 + (w/25)²) × 1.2 / 2) × 2 + 2` (wave 10 → 10, 20 → 16, 50 → 38, 200 → 200); with `ignoreLevelCap`,
`MAX_SAFE_INTEGER`. `applyPartyExp` (`src/battle-scene.ts:3299`, §17) shares EXP only among members **below** the cap — a member at
it gets nothing and its share is not passed on — and `PlayerPokemon.addExp` (`src/field/pokemon.ts:6561`, writes
`exp` / `level`) stops at it. Exp Share gives the bench `0.2 × stacks` of a participant's share; EXP Charms multiply
every member's share in `ExpPhase`.
**Rare Candy ignores the cap**: `PokemonLevelIncrementModifier.apply` (`src/modifier/modifier.ts:2266`) checks
`getMaxExpLevel(true)`, writes `level` / `exp` and queues a `LevelUpPhase`, so it is the only way to level a member at
the cap. EXP Balance and the Oval Charm aren't in any reward pool at this tag.

**Evolution items.** `EvolutionItemModifierType`'s filter (`src/modifier/modifier-type.ts:1173`, pure) runs the
evolution's full `validate` (level, form, condition such as time of day) and refuses Gigantamax; taking the item
applies at once and `EvolutionItemModifier.apply` (`src/modifier/modifier.ts:2341`) unshifts the `EvolutionPhase`. A
form-change item's filter (`src/modifier/modifier-type.ts:1226`) only checks the species' item trigger; its generator
(`:1582`, draws) is what checks Mega Bracelet / Dynamax Band access.

**Luck and locking.** Party luck is already in the `road` group (§12). A Lock Capsule keeps rarities on a reroll, but its
pool weight is 0 in classic (`src/modifier/init-modifier-pools.ts:585`); locked tiers can still be upgraded by luck
(§19).

**Unmeasured.** None of this has met a live rewards screen, and the weights (a first cut on the card's 10-a-tier
scale) are untested against how a strong player would rank them.

---

## 16. TMs: who can be taught, and how often battles are doubles

Read at the pinned tag (`v1.12.1.1`). `52-shop.js` judges a TM with the learn card's own decision (`learnAdvice`,
`40-learn.js`); this section is what it reads besides the move.

**Fainted members.** `TmModifierType`'s select filter (`src/modifier/modifier-type.ts:1130`) is
`isTmCompatible(moveId, true)` and nothing else (`PlayerPokemon.isTmCompatible`, `src/field/pokemon.ts:6108`:
`getCompatibleTms` at line 6080 — the species' and fusion's TMs, through `applyChallenges(PLAYER_TM_COMPATIBILITY)`
(`:6087`), minus known moves). It is pure but under the Moveset Randomizer challenge (`Challenges.MOVESET_RANDOMIZER`),
which swaps the set for as many TMs off a shuffle of every TM-pool move, seeded per species
(`executeWithSeedOffset(…, 500 * speciesId)`, `src/data/challenge.ts:1468-1481`), with the RNG put back (§0).
`PartyUiHandler.updateOptions`
(`src/ui/handlers/party-ui-handler.ts:1445`) offers `TEACH` in `PartyUiMode.TM_MODIFIER` (line 1515) whoever the cursor
is on, fainted or not. The one exception is Hardcore (`Challenges.HARDCORE`, 9): a fainted member there goes through
`updateOptionsHardcore` (line 1580), which has no TM case, so it is offered nothing to teach. A challenge is on when
`GameMode.hasChallenge` finds an entry with that id and `value !== 0` (`src/game-mode.ts:97-99`) — any value but
zero, not a positive one. The TM pool
(`TmModifierTypeGenerator`, `src/modifier/modifier-type.ts:1507` — draws global RND) takes
`getCompatibleTms(true, true, true)` over the **whole** party (known, level-up and already-used TMs removed), keeps the
tier's, and picks with `randSeedInt`. The card considers every member outside Hardcore, the living ones in it, and marks
a fainted recipient.

**What `getCompatibleTms`' exclusions really drop.** `excludeLevelUp` (`src/field/pokemon.ts:6092-6094`) asks
`getLevelMoves({ includeEvolutionMoves: true, includeRelearnerMoves: true })`, so `startingLevel` is the member's own
level (`:1971`) and `filterAndSortLevelMoves` (`src/field/learnsets.ts:194-199`) opens with `!(level > context.level)`,
`context.level` being the member's (`src/field/pokemon.ts:1984`) — **every move
above the member's current level is filtered out before the exclusion sees it**. It therefore never removes a move the
member is going to learn by levelling; it removes relearner moves (`isRelearner = level < startingLevel`) and level-0
evolution moves. A level-0 move there belongs to the species the member *already is* — the pool is built from the current form's own
list (`this.species.getTms(this.getFormKey())` plus the fusion's), so a move waiting on an evolution still ahead was
never in the pool to be excluded. Nothing ahead hands the member that move either: level-0 moves are granted only by
`EvolutionPhase.postEvolve` (`src/phases/evolution-phase.ts:409-421`), which reads the **evolved** form's list at the
moment of evolving, so either the member evolved into this form and was offered the move then, or it never evolved
into this form (a starter, or caught as this species) and was never offered it at all. `excludeUsedTMs` (`src/field/pokemon.ts:6095-6097`) reads `usedTMs`, pushed in
`src/phases/learn-move-phase.ts:194-197` when a TM is taught and never removed, so it outlives the move being
overwritten. So **no** member the TM could not have been drawn for gets the move for free: all three cases are fed
back into the move relearner, and the relearner is reachable only through the Memory Mushroom
(`RememberMoveModifierType`, `src/modifier/modifier-type.ts:725`, `:1994`, `PartyUiMode.REMEMBER_MOVE_MODIFIER`) — a
paid reward slot of its own.

**So the card reads the relearn list, not the pool.** `getLearnableLevelMoves` (`src/field/pokemon.ts:1928-1949`) is
the list the Mushroom indexes, and `52-shop.js` asks it per member for the one move on offer — the same read
`50-audit.js`'s relearn finding makes. It is a **superset** of what the TM pool excludes: `getLevelMoves({ startingLevel: 1,
… })` here sets `includePrevolutionMoves`, which `excludeLevelUp` leaves `false`, and the list also
carries the member's **unlocked egg moves** (`:1936-1942`, only when it started the run — `metBiome === -1` — outside
Daily and the challenges that turn `EGG_MOVE_RELEARN_AVAILABILITY` off: Fresh Start and Moveset Randomizer,
`src/data/challenge.ts:1067`, `:1587`) on top of relearner and evolution moves, past level-up moves and `usedTMs`. So a member can be
named as a relearner although the TM *could* have been drawn for it: an egg move or a prevolution move that is also
on the species TM list. That is still true — a Mushroom would put it back — and the card says only that, never
dropping a member from the scoring or skipping the TM over it.

**Double battles.** `newBattle` asks `checkIsDouble` (`src/battle-scene.ts:1484`, draws global RND) every wave:

| Wave | Double when |
|---|---|
| final wave (`isWaveFinal`), Endless boss (`isEndlessBoss`, `src/game-mode.ts:329`), Mystery Encounter | never |
| fixed battle whose config sets `double` | that value (no classic config calls `setDouble`) |
| wild | `randSeedInt(getDoubleBattleChance(w)) === 0` |
| any trainer, fixed ones included | the trainer's `DOUBLE` variant |

A generic trainer's variant comes from `generateNewBattleTrainer` (`src/battle-scene.ts:1453`): `doubleOnly` always, no
`hasDouble` (or a `trainerTypeDouble` other than Tate & Liza) never, else the same roll. A fixed evil-team grunt is
double on `randInt(3) === 0`, which is unseeded (§12).

`getDoubleBattleChance(w)` (`src/battle-scene.ts:1233`) starts at **8** (**32** on an X0 wave), is divided by **4** by
each `DoubleBattleChanceBoosterModifier` (`src/modifier/modifier.ts:461`) — one per lure kind, since `match` requires
the same `maxBattles` (Lure / Super Lure / Max Lure: 10 / 15 / 30 battles); taking one the party already has only
resets its count (`LapsingPersistentModifier.add`, `src/modifier/modifier.ts:373`) — and by 4 again for each mon in
`getPlayerField()` with `DoubleBattleChanceAbAttr` (`src/data/abilities/ab-attrs.ts:249`: Illuminate, Arena Trap, No
Guard, Commander, `src/data/abilities/init-abilities.ts:377,565,714,1930`), floored at 1. It is pure but for
`applyAbAttrs` bookkeeping (§0). `getPlayerField` (`src/battle-scene.ts:731`) is party slot 0, and slot 1 when the
battle before was a double, read when `newBattle` runs. `BattleEndPhase.start` (`src/phases/battle-end-phase.ts:66`)
lapses every `LapsingPersistentModifier` before `SelectModifierPhase`, so on the rewards screen a lure's `battleCount`
is the number of battles ahead it still covers.

A TM stays for the run, so the rewards card judges its spread bonus (×1.15 in the learn scorer) and an ally move's
worth by `doubleOdds` (`49-ahead.js`): the expected share of double battles over the next 10 waves at those odds, each
lure counted only for the battles it has left. A fixed battle counts as single, and Mystery Encounter waves count as
battles, since whether a wave is one is itself a roll. At base odds that is ~12 %, a +2 % nudge; under a fresh lure
~46 %. The learn card keeps the current battle's flag.

**Spread damage.** `getAttackDamage` multiplies by 0.75 only when a move has more than one target
(`src/field/pokemon.ts:3863-3865`), so a spread move loses nothing in a single battle; the bonus is only ever an upside.

**Status moves against the roster ahead (#122).** A learned move is kept for the run, so both the learn card and the
TM advice hand `learnAdvice` the same foes: the next big fight's, from `49-ahead.js` (`learnRoster`). With none, nothing
below applies. Only an inflicted status, a disrupting tag and a trapping tag are scaled,
each decided from what the preview hands over per foe (types, ability, passive, moveset). Paths relative to `src/`:

- **Can a status move reach the foe at all.** Status moves ignore the type chart unless they carry
  `RespectAttackTypeImmunityAttr` (`field/pokemon.ts:2736-2738`), which only Thunder Wave has (`data/moves/move.ts:9655`):
  it misses Ground types. Powder moves fail on Grass types (`Move.isTypeImmune`, `data/moves/move.ts:470-472`;
  `field/pokemon.ts:2744-2746`) and on Overcoat (`data/abilities/init-abilities.ts:979-984`). A Prankster user's status
  moves fail on Dark types (`data/moves/move.ts:473-476`). `TypeImmunityAbAttr.canApply` checks no move category
  (`data/abilities/ab-attrs.ts:418-424`), so Volt Absorb / Lightning Rod / Motor Drive take Thunder Wave, Flash Fire /
  Well-Baked Body Will-O-Wisp, Sap Sipper the Grass powders. Levitate and Eelevate are `UngroundedAbAttr`s (`init-abilities.ts:343-346`,
  `:2182-2186`), and an ungrounded target's Ground immunity sits in `getAttackTypeEffectiveness`
  (`field/pokemon.ts:2823-2829`), which a status move reaches only through `RespectAttackTypeImmunityAttr`: both stop
  attacks only. Magic
  Bounce reflects every `REFLECTABLE` move (`init-abilities.ts:1072-1075`, `phases/move-effect-phase.ts:1031-1037`), and
  Good as Gold blocks every status move not aimed at a side (`init-abilities.ts:1973-1983`). Mold Breaker ignores all
  of these but the unsuppressable Comatose and Shields Down (`init-abilities.ts:1508,1372`).
- **Inflicted status** (`Pokemon.canSetStatus`, `field/pokemon.ts:4967`): Poison and Toxic miss Poison and Steel types
  unless the user has Corrosion (`:4995-5018`, `init-abilities.ts:1496-1502`), paralysis Electric, freeze Ice, burn
  Fire; sleep has no type immunity. Then `StatusEffectImmunityAbAttr` (`immuneEffects`, empty = every status,
  `ab-attrs.ts:3239-3255`): Limber paralysis, Insomnia and Vital Spirit sleep, Immunity poison, Magma Armor freeze, Water
  Veil / Water Bubble / Thermal Exchange burn, Purifying Salt and Comatose all; Leaf Guard (sun) and Shields Down (form)
  are left out. The side-wide veils cover the foe itself (`field/pokemon.ts:5051-5063`): Pastel Veil poison, Sweet Veil
  sleep, Flower Veil everything on a Grass type. Scaled by the share of the roster it lands on (a boss weighs one per
  health bar), keeping 0.3 of its value into a roster that takes none of it.
- **Disruption** (`data/battler-tags.ts`): Taunt stops every status move (`TauntTag.isMoveRestricted`, `:3535`); Heal
  Block stops `healBlockedMoves` (`:3116`, `data/moves/invalid-moves.ts:277`: recovery and drain) and cancels every heal
  in `PokemonHealPhase` (`phases/pokemon-heal-phase.ts:123-127`), Leftovers included, which the preview can't see; Encore
  needs a last move to lock (`EncoreTag.canAdd`, `data/battler-tags.ts:1721`), and is worth most locking a foe into a status move. Oblivious
  blocks only Taunt (`init-abilities.ts:277`), Aroma Veil Taunt, Encore, Heal Block, Disable and Torment
  (`:1124-1131`). A disrupting move with something to take away is worth ×1.4 plus 0.4 × the share of the roster it
  bites on, ×0.3 with nothing; Disable and Torment only by the share they land on. The preview lists a foe's
  `statusMoves` and `healMoves` (recovery attrs and `HitHealAttr`) for this.
- **Trapping** (`TRAPPED`: Mean Look, Block, Spider Web): each fails on a Ghost type (`failIfGhostTypeCondition`,
  `data/moves/move.ts:8993`), and `isTrapped` never holds a Ghost type or a Run Away holder (§7). Run Away is asked at
  the switch, outside the `MovePhase`–`MoveEndPhase` window where a Mold Breaker user's `ignoreAbilities` is set
  (`phases/move-phase.ts:188`, `phases/move-end-phase.ts:42`), so Mold Breaker never gets past it.
- **A typing written onto the foe** (Soak, Magic Powder, Forest's Curse, Trick-or-Treat): worth what it opens for the
  party's own coverage — two doublings of the party's best answer is a full opening — plus, for a `set`, the STAB it
  takes away, a whole STAB being worth one of those doublings. That share is a share of the foe's **attacking moves**,
  not of its types: the preview's `attackTypes` carries one entry per attacking move, so three Steel moves beside one
  Ground read as three quarters and not as half (#266). What counts as an attack is `08-party.js`'s `isCoverage`, the
  one rule for both sides of the field: a move the game prices from the situation (`power === -1`: Gyro Ball, Grass
  Knot, Heavy Slam) is one, fixed damage is not — it ignores the type chart, so it is no one's answer and no one's
  STAB worth stripping. The look-ahead reads the same field for what the party is walking into, through a `Set`.
- A roster whose foes aren't `exact` (a generic trainer's replay) moves a score half as far.

**Unmeasured.** The size of the spread bonus itself (a first cut), and every roster multiplier above.

---

## 17. The team audit: relearning, held items, EXP, status immunity and speed

`50-audit.js` checks how the party is built, between waves, on the rewards card. It calls one game function
(`getLearnableLevelMoves`) and scores moves with the learn card's scorer (`40-learn.js`); the rest is below.

**Memory Mushroom.** `RememberMoveModifierType`'s select filter (`src/modifier/modifier-type.ts:732`) greys out a
member whose `getLearnableLevelMoves()` is empty. `RememberMoveModifier.apply` (`src/modifier/modifier.ts:2322`)
— phase queue: unshifts a `LearnMovePhase` with `getLearnableLevelMoves()[i][1]`. `Pokemon.getLearnableLevelMoves`
(`src/field/pokemon.ts:1928`) — pure, returns `[level | null, MoveId, source][]`: `getLevelMoves({ startingLevel: 1, … })`
(evolution, prevolution and relearner moves; the fusion partner's are added by the learnset code,
`src/field/learnsets.ts:246`) cut to levels ≤ the mon's (`:195`), plus unlocked egg moves when `metBiome === -1`
outside Daily, Fresh Start and Moveset Randomizer (`src/field/pokemon.ts:1936-1939`), plus every used TM (`:1944`),
minus known moves
(`:1949`), sorted by source. The mushroom is a GREAT reward weighted 0 while no member of `getPlayerParty()`,
fainted ones included, has a `getLearnableLevelMoves()` entry, else `min(1 + floor(w / 30), 4)` on
`w = getWaveForDifficulty(wave, true)` (`src/modifier/init-modifier-pools.ts:293-303`). Only that roll is gated: it is
also a shop item from wave 81 (`src/modifier/modifier-type.ts:2656`, rows cut at `ceil((wave + 10) / 30)`), and a
guaranteed Mysterious Challengers / Weird Dream reward. Taking it costs nothing and
re-queues a copy of the reward phase (`src/phases/select-modifier-phase.ts:276`). The rewards card gives it to the
member whose relearn list holds the biggest learn-card upgrade.

**The learn-move prompt.** `LearnMovePhase` keeps only `moveId` (`src/phases/learn-move-phase.ts:23`) and the inherited
`partyMemberIndex` (`src/phases/party-member-pokemon-phase.ts:6`). The Move itself (`allMoves[moveId]`, `src/phases/learn-move-phase.ts:45`) lives in
the prompt's closures until `forgetMoveProcess` opens the summary screen in `LEARN_MOVE` mode with it (`:116-120`).
`new PokemonMove(id).getMove()` is `allMoves[id]` (`src/data/moves/pokemon-move.ts:85-87`).

**Forgetting a move on the reward screen.** From 1.12.1.0 (pokerogue #7697), picking a move on the summary screen's
moves page opens a list instead of starting a swap (`src/ui/handlers/summary-ui-handler.ts:548-636`): Swap always, and
Delete while the current phase is `SelectModifierPhase` (`:566`, checked again on confirm at `:572`). The reward screen
reaches that summary through its party check and through the target picker of a TM or another party item
(`src/ui/handlers/party-ui-handler.ts:1407`, `:1511-1518`), not through the Memory Mushroom's; the phase stays
`SelectModifierPhase` throughout. A mon with one move gets the error sound and no list (`:551-553`). Delete, once
confirmed, is `moveset.splice(moveCursor, 1)` on the live array (`:611`): no phase, no cost, no draw, no undo. A TM or
a Memory Mushroom on a full moveset asks the same question itself: `TmModifier.apply` and `RememberMoveModifier.apply`
(`src/modifier/modifier.ts:2297`, `:2323`) unshift a `LearnMovePhase`, whose `start` learns into a free slot and
otherwise asks which move to forget (`src/phases/learn-move-phase.ts:62-66`). There the new move takes the forgotten
one's slot, and the prompt can be declined, back to the reward screen with the item unspent
(`src/phases/select-modifier-phase.ts:273-278`). A slot Delete frees is filled, unasked, by the next move learned, a
level-up move included (`src/phases/level-up-phase.ts:97`).

**No unattached held items.** A held item is a `PokemonHeldItemModifier` with a `pokemonId`
(`src/modifier/modifier.ts:656`). It is created with its holder — the reward / shop path's
`newModifier(party[slot])` once a slot is picked (`src/phases/select-modifier-phase.ts:357`) — or cloned onto a new
holder by `tryTransferHeldItemModifier` (`src/battle-scene.ts:2504`; theft, the transfer screen, encounters).
`BattleScene.updateModifiers` (`:2748`) — writes `modifiers`: deletes any whose holder `getPokemonById` (`:821`)
can't find, or that no longer has the item's species. Releasing (or fusing) a mon deletes its items
(`removePartyMemberModifiers`, `:2632`); a fainted mon keeps them. So "held items sitting in the bag" can't happen,
and the audit has no such check.

**EXP.** `BattleScene.applyPartyExp` (`src/battle-scene.ts:3299`) — no draw; writes friendship and Macho Brace stacks
and unshifts the EXP phases. Only non-fainted members below `getMaxExpLevel()` get a share (`:3312`): a participant
`1 / participants` (+0.2 a `MultipleParticipantExpBonusModifier` stack when several fought), a non-participant
nothing, or `0.2 · EXP. All stacks / participants` with EXP. All (`ExpShareModifier`, 5 stacks); then ×1.5 for a
trainer, the encounter's `expMultiplier`, ×1.5 Pokérus and Lucky / Golden Egg (`:3322`–`3364`). The charms
(`ExpBoosterModifier`: +25 % / +60 % / +100 %, 99 / 30 / 10 stacks) multiply each share later, in `ExpPhase` /
`ShowPartyExpBarPhase` (`src/phases/exp-phase.ts:28`, `src/phases/show-party-exp-bar-phase.ts:25`). EXP. Balance
exists (`battle-scene.ts:3368`) but is in no pool. So a party at the cap gains nothing from any EXP item, and a member far behind
the carry only catches up by fighting or through EXP. All.

**Status immunity.** `Pokemon.canSetStatus(effect, quiet, …)` (`src/field/pokemon.ts:4969`) — no draw, but not a
read: the Corrosion check applies ability attributes unsimulated and writes the source's `abilitiesApplied` (§0), and
`quiet = false` shows messages. It refuses: an existing status (`:4977`); anything under Misty Terrain, grounded
(`:4981`); poison and toxic on Poison or Steel unless the source's `IgnoreTypeStatusEffectImmunityAbAttr` (Corrosion)
cancels it (`:4995`); paralysis on Electric (`:5021`); sleep in Electric Terrain, grounded (`:5023`); freeze on Ice
or in sun (`:5028`); burn on Fire (`:5034`); a status-immunity ability on the target or its ally (`:5046`);
Safeguard (`:5066`). The audit uses the type checks only.

**Priority and speed.** `Move.getPriority(user, simulated = true)` (`src/data/moves/move.ts:1195`) — pure when
simulated: `move.priority`, then `IncrementMovePriorityAttr`, then `ChangeMovePriorityAbAttr` — Prankster +1 on status
moves, Gale Wings +1 on Flying moves at full HP, Triage +3 on moves flagged `healingMove()`
(`src/data/abilities/init-abilities.ts:1081`, `:1202`, `:1410`). That flag is on draining attacks as well as heals —
Absorb and Mega Drain carry it (`src/data/moves/move.ts:9603`–`9608`), and so does Pollen Puff (`:11662`) — so Gale Wings and Triage both make an attack
faster. On every pop the move queue runs `sortInSpeedOrder` (`src/utils/speed-order.ts:21`) — groups shuffled in a fork at
`turn * 1000 + groups` on the wave seed (`:35`), stable-sorted by `getEffectiveStat(SPD)` descending, reversed under
Trick Room (`:79`) — then sorts by timing modifier, `getPriority` and the in-bracket modifier (Quick Claw)
(`src/queues/move-phase-priority-queue.ts:23`, `:73`). The audit compares raw `getStat(SPD)` on both sides — stages,
items and abilities move during a fight.

**Mega and Tera** (not audited). A Mega Bracelet only lets MEGA / PRIMAL form-change items into the reward pool
(`src/modifier/modifier-type.ts:1598`); attaching the stone applies the modifier at once (`src/battle-scene.ts:2394`),
which queues the form-change phase (`:2980`). A Tera is limited by `MAX_TERAS_PER_ARENA = 1` (`src/constants.ts:120`)
on `arena.playerTerasUsed` (`src/phases/tera-phase.ts:47`), reset by a new `Arena` (`src/battle-scene.ts:1595`), a
party heal (`src/phases/party-heal-phase.ts:48`) or post-battle cleanup with a Terapagos (`src/battle-scene.ts:1570`).
Neither leaves an "owned but unused" state the audit could read before a fight.

**Unmeasured.** Every threshold is a first cut: a shared weakness at two members and a third of the party with no
resist, a dead status slot below 20 on the learn scorer's scale, an attack off a stat under 75 % of the other one,
"behind" at 5 levels and under three quarters of the carry's level, a relearn worth naming at +10 power.

---

## 18. Drain, on-KO boosts, and what a switch-in takes

Read at the pinned tag (`v1.12.1.1`), for the battle guidance gaps a Guzma fight (wave 165) exposed: a draining
Golisopod out-healed the damage the HUD promised, and a Buzzwole with Beast Boost was fed KOs.

**Drain.**
- **The attribute.** `HitHealAttr` is a self-targeted `MoveEffectAttr` (`src/data/moves/move.ts:2803-2812`) with the
  default `POST_APPLY` trigger (`:1691-1692`). `MoveEffectPhase.applyMoveEffects` fires it after **every hit**
  (`src/phases/move-effect-phase.ts:573-581`).
- **The amount.** `getHealAmount` is `toDmgValue(user.turnData.singleHitDamageDealt × healRatio)`
  (`src/data/moves/move.ts:2860-2863`): rounded down, at least 1. A drain is not a `HealAttr`, whose base
  amount rounds half up instead (`:2497-2499`). `singleHitDamageDealt` is `damageAndUpdate`'s return in `applyMoveDamage`,
  capped by the target's HP and a boss bar, and written only when > 0 (`src/phases/move-effect-phase.ts:681-709`).
  `apply` unshifts a `PokemonHealPhase` for it (`src/data/moves/move.ts:2836-2841`).
- **`healRatio`** defaults to ½ (`:2810`). Draining Kiss and Oblivion Wing carry ¾ (`:11339-11340,11482-11483`),
  Bouncy Bubble 1 (`:11874-11875`). Strength Sap uses `healStat` and heals by the target's stat (`:11617-11618`): a
  status move, not a drain.
- **`PokemonHealPhase.end`** → `heal` (`src/phases/pokemon-heal-phase.ts:108-148`):
  - A mon no longer `isActive(true)` gets nothing (`:118-120`).
  - Heal Block (`HEAL_BLOCK`) cancels a positive heal (`:123-127`), and a positive heal on a mon at full HP
    does nothing (`:154-159`).
  - `getHealAmount` (`:184-196`): the healed mon's side applies `HealingBoosterModifier` (Healing Charm,
    `× (1 + 0.1·stacks)`; `src/modifier/modifier.ts:2447-2448`), to a negative amount too, then
    `min(floor(amount × charm), maxHp)`.
  - A negative amount is dealt as indirect damage (`src/phases/pokemon-heal-phase.ts:163-167`), and `heal` caps a
    positive one at the HP missing (`src/field/pokemon.ts:4172-4176`).
- **Liquid Ooze** (`ReverseDrainAbAttr`, `src/data/abilities/ab-attrs.ts:668-692`). `HitHealAttr.apply` returns without
  healing (`src/data/moves/move.ts:2824`). The target's PostDefend then unshifts the same amount as a negative heal on
  the attacker, unless the attacker has Magic Guard (`BlockNonDirectDamageAbAttr`), which cancels it.
- **The HUD.** `10-damage.js` records a move's `drain`: the signed share of damage dealt. The planner adds
  `drain × expected damage` a turn to the side's turn-end change, capped at max HP (a boss at its bar's top), and the
  team plan heals each simulated hit by its share.

**On-KO boosts.** `FaintPhase.doFaint` (`src/phases/faint-phase.ts:96`) runs after a mon faints, in two steps.
1. Every mon on the field, in speed order, runs `PostKnockOutAbAttr` (`:140-142`). That is Soul-Heart:
   `PostKnockOutStatStageChangeAbAttr`, +1 SpA on **any** faint, allies' included
   (`src/data/abilities/init-abilities.ts:1544-1545`).
2. If the victim took an attack this turn and `source` is still on the field, the source runs `PostVictoryAbAttr`
   (`src/phases/faint-phase.ts:143-147`). That is `PostVictoryStatStageChangeAbAttr` (`src/data/abilities/ab-attrs.ts:2084-2101`) with either:
   - fixed `changes` (all in `src/data/abilities/init-abilities.ts`):
     - Moxie +1 Atk (`:1046-1047`);
     - Chilling Neigh +1 Atk (`:1819-1820`);
     - Grim Neigh +1 SpA (`:1822-1823`);
     - As One (Glastrier) +1 Atk and As One (Spectrier) +1 SpA (`:1826-1844`);
     - Battle Bond +1 Atk/SpA/Spe on a holder that isn't the Battle Bond Greninja form, once
       (`abilitiesApplied`, `:1457-1460`);
   - or a function of the holder: Beast Boost and Eelevate use `beastBoostHighestStatCalc`, +1 on the highest of Atk,
     Def, SpA, SpD, Spe by `getStat(s, false)`, the first on a tie (`:1565-1566,2182-2184,2398-2408`).

Both attributes unshift `StatStageChangePhase` (±6 cap), and the stages last until the mon leaves the field. The
move's own `PostVictoryStatStageChangeAttr` (Fell Stinger) comes after and isn't read
(`src/phases/faint-phase.ts:148-153`). `Pokemon.hasAbilityWithAttr` respects suppression
(`src/field/pokemon.ts:2440`). The planner prices a KO it would score on us at `FEED_COST` (0.5 turns) a stage on an
attacking stat or Speed, half that on a defence, times P(it KOs us first), while someone is left to face it. The team
plan counts each side's KOs and scales later exchanges' hits by the stages (Speed left out).

**A move aimed at a fainted mon.** In a double, `FaintPhase.doFaint` calls `redirectPokemonMoves(pokemon, ally)` when
the fainted mon has an ally (`src/phases/faint-phase.ts:197-201`); a mon forced out or fleeing does the same
(`src/data/moves/move.ts:7327-7330`, `src/data/abilities/ab-attrs.ts:5805-5807`). If that ally is active, every
still-queued `MovePhase` with exactly one target, aimed at the fainted mon by a user on the other side, is rewritten in
place to target the ally (`src/queues/move-phase-priority-queue.ts:49-71`). Spread moves and moves from the fainted
mon's own side are left alone. Nothing is checked at that point: the same move lands, status moves included, and its
accuracy and type are checked as usual when it runs. A move whose target is gone and wasn't redirected fails with its PP
spent (`src/phases/move-phase.ts:207,758-775`), unless it sets a hazard (`AddArenaTrapTagAttr`).

**Switch-in cost.** A command switch resolves before moves (`src/phases/turn-start-phase.ts:28-45,122-130`), so the
switch-in takes what the foe chose against the mon leaving (§9). The ⇄ line names that share of its HP and the likeliest
move's effectiveness on it, from the same threat the planner already scores the switch with.

**Unmeasured.** `FEED_COST` is a first cut. A boost gained mid-exchange isn't applied inside that exchange (it ends it,
except Soul-Heart). A drain's expected heal uses this turn's expected damage for every later turn.

---

## 19. The reward roll, and previewing a reroll

`50-reroll.js` previews what the next reroll offers, before paying for it.

**The roll.** `SelectModifierPhase.start` (`src/phases/select-modifier-phase.ts:61`) re-seeds only on a wave's first
roll (`rerollCount` 0, not a copy): `updateSeed()` → `resetSeed()` (`:68`, `:412`), which sows the wave seed (§11).
A reroll never re-seeds; it continues the stream — `start` only clears `scene.reroll` (`:71`). Every non-copy roll
then calls `regenerateModifierPoolThresholds(party, PLAYER, rerollCount)` (`:76`) and
`getModifierTypeOptions(getModifierCount())` (`:80`, `:460`) → `getPlayerModifierTypeOptions(count, party,
lockModifierTiers ? modifierTiers : undefined, customModifierSettings)`.

- `regenerateModifierPoolThresholds` (`src/modifier/modifier-type.ts:2361`) — **draws, and writes module state.** It
  calls `generateType(party)` on every generator entry of every tier whatever its weight (`:2389`): attack-type,
  base-stat and temp-stat boosters, species items, TMs, evolution and form-change items, mints, Tera Shards, berries
  (their draws: `:1328`–`1985`). A generator with no candidates returns before drawing and a one-item pick draws
  nothing, so the draw count depends on the party. The weight functions (`src/modifier/init-modifier-pools.ts`) don't
  draw or write; they read party HP, PP, status, held items, abilities, relearn lists (`getLearnableLevelMoves`,
  `:297`), mode, wave and ball counts, and the vouchers' read `rerollCount` (`:333`, `:604`, `:624`). It writes the module-private `modifierPoolThresholds` /
  `ignoredPoolIndexes` (`src/modifier/modifier-type.ts:2339-2340`, `:2444-2445`) and the exported `itemPoolChecks` (`:2359`,
  no reader in `src/`).
- `getPlayerModifierTypeOptions` (`:2503`) — draws; writes nothing but its result. Custom settings go first:
  pre-built options (no draw), `guaranteedModifierTypeFuncs` (a generator draws), `guaranteedModifierTiers` (with
  `allowLuckUpgrades`), then `fillRemaining`; without settings, `count` options, the `i`th with `modifierTiers[i]`.
- One option: `getModifierTypeOptionWithRetry` (`:2577`) → `getNewModifierTypeOption` (`:2769`). With no tier,
  `randSeedInt(1024)` (`:2798`) and, unless it rolled 0, the luck loop `randSeedInt(floor(128 / ((luck + 4) / 4))) < 4`
  (`:2807`); with a tier (locked or guaranteed), the luck loop while a non-empty next tier exists (`:2839`); then the
  item by weight (`:2854`) and `generateType` for a generator — a null result recurses on the same tier, dropping a
  tier after 100 retries. A duplicate — same `type.name` or same `type.group`, and two undefined groups count — is
  redrawn up to `min(count × 5, 50)` times, **with the candidate's tier and upgrade count passed in** (`:2596`), so a redraw
  skips the tier roll and the luck loop; a candidate `applyChallenges(WAVE_REWARD)` rejects is redrawn with no cap
  (Hardcore rejects revives).
- `getPartyLuckValue` (`:2913`) — pure outside Daily; Daily's luck is a fork at 0.
- `getModifierCount` (`src/phases/select-modifier-phase.ts:378`) — pure: `3 + ExtraModifierModifier +
  TempExtraModifierModifier`; with custom settings, the guaranteed count, or the larger of the two with
  `fillRemaining`.

**A reroll.** `rerollModifiers` (`:189`) — writes `scene.reroll` and `money`, and unshifts
`SelectModifierPhase(rerollCount + 1, typeOptions.map(o => o.type?.tier))` (`:196`), nothing else: **the custom
settings are dropped**. So after a fixed battle (`src/phases/victory-phase.ts:85`; classic's pin tiers with
`allowLuckUpgrades: false`, `src/data/trainers/fixed-battle-configs.ts:39`) or an encounter's `setEncounterRewards`
(`src/data/mystery-encounters/utils/encounter-phase-utils.ts:739`), the reroll is an ordinary roll — three-plus
options, rolled rarities, luck upgrades. `getRerollCost` (`src/phases/select-modifier-phase.ts:420`, pure) is 250, or
the summed tier values `[50, 125, 300, 750, 2000]` when locked, × `ceil(wave / 10)` × `2^rerollCount` × the settings'
`rerollMultiplier` — negative means −1, rerolls off — so only the first reroll carries the wave's multiplier. The tiers
passed on are the final, upgraded tiers on screen, used only while `scene.lockModifierTiers` is set; locked tiers still
climb by luck. `toggleRerollLock` (`:250`) writes `lockModifierTiers`; the handler shows its button only with a
`LockModifierTiersModifier` (`src/ui/handlers/modifier-select-ui-handler.ts:180`).

**What else draws while the screen idles.** Nothing found on the seeded stream: `ModifierSelectUiHandler.show`
(`:155`), the shop row (`getPlayerShopModifierTypeOptionsForWave`, `src/modifier/modifier-type.ts:2634`),
`getRerollCost`, the lock toggle, buying a heal / revive / PP item, the held-item transfer screen, and the TM / Memory
Mushroom `LearnMovePhase` with its `copy()` (`src/phases/select-modifier-phase.ts:469`: the same options passed back
as pre-built ones, so no re-seed, no regenerate and no draw). A fusion palette patches `Math.random` to the
seeded stream only inside a fork (`src/field/pokemon.ts:5703`). Phaser's own internals weren't read. What *does* move a
preview without drawing: anything that changes the party or its held items (the weights and generator candidates),
and the lock toggle.

**The preview.** Inside `sandbox` (§0), from `RND.state()` as it stands: `regenerateModifierPoolThresholds(party,
PLAYER, n)` and `getPlayerModifierTypeOptions(count, party, lock ? tiers : undefined)`, `n` the next reroll count and
`count` from a fresh `SelectModifierPhase(n, tiers)` (the constructor only stores its arguments,
`src/phases/select-modifier-phase.ts:47`) — never the
live phase's, which counts its custom settings. Once with the lock as it stands and, with a Lock Capsule, once
toggled, each from the same state; then `regenerate` for the live reroll count restores the tables (nothing reads them
before the next non-copy roll regenerates) and the sandbox restores the stream. Offers are judged on `52-shop.js`'s
scale (≈10 a tier); `REROLL_GAIN` 5 is a first cut.

**Unmeasured.** Whether a real reroll matches its preview: the HUD scores every reroll against the last preview for it
(`window.__coachHud.reroll()`).

---

## 20. Catching: AttemptCapturePhase and checkCanUseBall

Read at the pinned tag (`v1.12.1.1`); not called live.

**When a ball may be thrown.** `CommandPhase.handleBallCommand` (`src/phases/command-phase.ts:407`) — queues a message
on refusal; on success writes `turnCommands[fieldIndex]` (BALL, targets) and skips the partner's command — checks, in
order:

1. `checkCanUseBall` (`src/phases/command-phase.ts:354`; pure apart from the message):
   - **End biome, wild battle.** Refused (`noPokeballForce`) in classic (challenge runs included) short of the final boss
     while any active foe's species has no `caughtAttr`; under a full Fresh Start (`isFullFreshStartChallenge`,
     `src/game-mode.ts:121`, value 1) short of the final boss; in Endless except on a minor boss (`isEndlessMinorBoss`,
     `src/game-mode.ts:339`, w % 250). Refused (`noPokeballForceFinalBoss`) at the classic final boss
     (`isBattleClassicFinalBoss`, `src/game-mode.ts:320`) while `getStarterCount(caught) < getAllStarters().length - 1`
     (`src/system/game-data.ts:1913`: two or more starters uncaught); at the final boss under a full Fresh Start; at an
     Endless minor boss; in Daily unless `isDailyFinalBoss()` (`src/data/daily-seed/daily-seed-utils.ts:89`) and the
     event seed's boss is `catchable` (`getDailyEventSeedBoss`, `src/data/daily-seed/daily-run.ts:190`). That getter is
     not the raw config: it needs `isDailyEventSeed()` (`isDaily && dailyConfig != null`,
     `src/data/daily-seed/daily-seed-utils.ts:32`) and passes `dailyConfig.boss` through `validateDailyBossConfig`
     (`:160`), which returns `null` — no custom boss at all, so nothing catchable — for a `speciesId` the `SpeciesId`
     enum lacks. The seed schema only requires a positive integer there (`src/data/daily-seed/schema.json:100,152`), so
     a hand-written seed can pass it and still be rejected. END is only
     reached by the forced biome rule (§10): classic 191–200, the Daily wave 50, each Endless X50 wave.
   - **Otherwise** a trainer battle is refused, and a Mystery Encounter unless its `catchAllowed`.
2. More than one foe `isActive(true)` on the field: refused (`noPokeballMulti`).
3. **Boss bars.** When `getEnemyPokemon(false)` `isBoss()`, has `bossSegmentIndex >= 1` and not
   `hasAbility(WONDER_GUARD, false, true)` (lines 428–447): the classic final boss refuses every ball but the Master Ball,
   and the Master Ball too when `hasAnyChallenges()`; any other boss refuses every ball but the Master Ball, and a
   catchable Daily event boss refuses that too. A Wonder Guard boss takes any ball on any bar. `hasAnyChallenges()` is
   `challenges.length > 0` (`src/game-mode.ts:105`), and a challenge-mode run copies every challenge, values and all
   (`:65`, `:80`), so it holds for any challenge run, whatever each value is. `hasChallenge(id)` (`:97`) is the one
   that checks a value.

**The throw.** `AttemptCapturePhase.start` (`src/phases/attempt-capture-phase.ts:46`) ends at once on a foe with 0 HP,
before the ball is spent; otherwise it writes `pokeballCounts[type]--` (line 60) and computes (lines 64–74, 89):

```
modifiedCatchRate = round((3·maxHp − 2·hp) · catchRate · ball / (3·maxHp) · status · shiny)
shakeProbability  = round(65536 / (255 / modifiedCatchRate) ** 0.1875)
isCritical        = pokemon.randBattleSeedInt(256) < getCriticalCaptureChance(modifiedCatchRate)
```

The factors, all pure:

- **Ball**, `getPokeballCatchMultiplier` (`src/data/pokeball.ts:51`): POKEBALL 1, GREAT 1.5, ULTRA 2, ROGUE 3, MASTER −1,
  LUXURY 1 (`src/enums/pokeball.ts`, 0–5).
- **Status**, `getStatusEffectCatchRateMultiplier` (`src/data/status-effect.ts:113`): POISON, TOXIC, PARALYSIS, BURN
  (1, 2, 3, 6) ×1.5; SLEEP, FREEZE (4, 5) ×2.5; else 1.
- **Shiny**, when `pokemon.isShiny()`: `timedEventManager.getShinyCatchMultiplier()`
  (`src/timed-event-manager.ts:71`): the active event's `shinyCatchMultiplier`, else `SHINY_CATCH_RATE_MULTIPLIER` = 2
  (`src/data/balance/rates.ts:62`). An event is active by the wall clock (`isActive`, line 26).
- **Critical**, `getCriticalCaptureChance` (`src/data/pokeball.ts:91`), out of 256: 0 under any Fresh Start
  (`isFreshStartChallenge`, `src/game-mode.ts:113`); else `floor(charm · dex · min(255, rate) / 6)` with dex 2.5 in
  Daily or past 800 caught species (`getSpeciesCount(d => !!d.caughtAttr)`, `src/system/game-data.ts:1902`), 2 past
  600, 1.5 past 400, 1 past 200, 0.5 past 100, else 0; charm `1.5 + stacks / 2` from
  `CriticalCatchChanceBoosterModifier.apply` (`src/modifier/modifier.ts:3034`, max 3 stacks), else 1.

No ability, biome, level or held item enters, and there is no boss term: bars only gate the throw (above).

**Shakes.** The tween's `onRepeat` (`src/phases/attempt-capture-phase.ts:151-169`) — draws battle RNG
(`Pokemon.randBattleSeedInt`, `src/field/pokemon.ts:5858` → `Battle.randSeedInt`, `src/battle.ts:486`, the stream
re-sown from `battleSeed` and the turn and kept in `battleSeedState`). A normal throw makes three checks
`randBattleSeedInt(65536) < shakeProbability`, each skipped without a draw for a Master Ball (`ball === -1`) or a rate
≥ 255; a critical capture makes one check after its first shake. A failed check calls `failCatch` (line 211, writes
`currentBattle.lastUsedPokeball`, ends the phase). So a throw draws 1 + (3 or 1) battle values, and
**P(catch) = c·s + (1 − c)·s³** with `s = min(1, shakeProbability / 65536)` and `c = clamp(critical, 0, 256) / 256`.
A Master Ball's rate is negative, so it is never critical and every check is skipped: a sure catch; so is rate ≥ 255.

**A catch.** `AttemptCapturePhase.catch` (line 244) — state writes, UI, phase queue: `updateSpeciesDexIvs(root, ivs)`
(`src/system/game-data.ts:1887`), the `POKEMON_ADD_TO_PARTY` challenge (Limited Catch,
`src/data/challenge.ts:1233`: kept only if met on an X1 wave, or through Teleporting Hijinks' biome-change option),
`setPokemonCaught` (`src/system/game-data.ts:1604`), a release prompt when the party holds 6, then
`unshiftNew("VictoryPhase")`. Candy goes to the prevolution-free species of the chain: `isShiny() ? 5·2^variant : 1`,
×2 for a boss, plus the active event's flat `extraCatchCandy` (`getExtraCatchCandy`,
`src/timed-event-manager.ts:128-130`), and not at all in Daily unless the catch adds a dex attribute
(`src/system/game-data.ts:1720-1727`).
`variant` there is the base field, not `getVariant()` (`:1722`), though `isShiny()` counts a shiny fusion half. The
dex attribute (`Pokemon.getDexAttr`, `src/field/pokemon.ts:606`, pure) reads the base `shiny` and `variant` only.

Two details of that walk. `setPokemonSpeciesCaught` recurses down the chain a species at a time, and at each one asks
`hasNewAttr` of the **masked** attributes: `dexAttr = pokemon.getDexAttr() & species.getFullUnlocksData()`
(`src/system/game-data.ts:1641`; the mask is built at `src/data/pokemon-species.ts:1215-1242` from the species' own gender ratio, variants
and non-`isUnobtainable` forms), so a bit that species can never own never counts as new. **Nothing cuts the walk
short**: the branch at `src/system/game-data.ts:1743` (`!newCatch || !isStarter(species)`) is the one that recurses at once, and a species
that *is* a starter and is new to the dex only defers the recursion — it plays the fanfare, shows "added as a
starter", and recurses from that message's callback (`checkPrevolution(true)`, `:1759`). The single return that
skips the recursion is `!showMessage` (`:1749`), and no thrown ball reaches it: `AttemptCapturePhase` calls
`setPokemonCaught(pokemon)` with its defaults (`src/phases/attempt-capture-phase.ts:313`, `showMessage = true` at
`src/system/game-data.ts:1608`), as does a Mystery Encounter's catch (`encounter-pokemon-utils.ts:701`); `showMessage: false` appears only
where no ball is thrown (`encounter-pokemon-utils.ts:1001`, `weird-dream-encounter.ts:591`). So a first Pikachu still
pays Pichu. Where the two roots differ at all is Pikachu's line only — `getRootSpeciesId(true)` stops at Pikachu
while the candy is Pichu's, which the game's own TODO at `src/system/game-data.ts:1746-1748` names as the single evolved starter. The IVs
are not on this walk: `updateSpeciesDexIvs` is called with `getRootSpeciesId(true)` and walks prevolutions itself
(`:1887-1900`).

**The starter table.** `initStarterData` (`src/system/game-data.ts:1547`) builds `starterData` with one entry per
`getAllStarters()` species, but loading a save replaces it outright (`:352`), keys and all: only the version migrators
add or drop keys (`src/system/version-migration/versions/v1_0_3.ts:13`, `v1_12_0_0.ts:85`, `v1_12_0_10.ts:12`).

**Shiny and fusion reads.** `Pokemon.isShiny(useIllusion = false)` (`src/field/pokemon.ts:1735`, pure) is the base
`shiny`, or `fusionShiny` when fused; `getVariant` (line 1776) is the higher of the two when fused.
`Pokemon.calculateBaseStats` (`src/field/pokemon.ts:1618`, no state writes, no RNG) takes the *form's* base stats, applies the Flip Stat
challenge and Shuckle Juice / Old Gateau, averages with the fusion's form stat by stat rounding up (halves them in Spliced
Endless when unfused), then applies vitamins, and returns a fresh array (`:1619`). Its one side effect is a log: each of
its three `applyModifiers` calls (`:1622`, `:1624`, `:1638`) reaches `applyModifiersInternal`, which `console.log`s
`Applied …` once per applied modifier (`src/battle-scene.ts:2916`). A held-item change (`updatePartyForModifiers`,
`src/battle-scene.ts:2790`), `changeForm` (`src/field/pokemon.ts:4666`), `fuse` (`:6482`) and `unfuse` (through `clearFusionSpecies`,
`:3278`) each go on to `calculateStats` (`:1575`), which rewrites `stats`. Shininess itself is set at spawn by `trySetShiny`
(`src/field/pokemon.ts:3053`) — writes `shiny`, no draw of its own (the `id` was drawn at construction, line 399):
`(trainerId ^ secretId) ^ (id >>> 16 ^ id & 0xffff) < threshold`, threshold 64 of 65536 (`BASE_SHINY_CHANCE`,
`src/data/balance/rates.ts:10`), raised for wild spawns by the event's `shinyEncounterMultiplier` and by the Shiny Charm
(`ShinyRateBoosterModifier`, ×2^(1 + stacks)), and for a trainer's mon to the event's trainer shiny chance.

**The ball menu.** `BallUiHandler.setup` (`src/ui/handlers/ball-ui-handler.ts:29-33`) builds one text object in
`pokeballSelectContainer` (`:45`): `getPokeballName(pb)` for each `pb` from 0 below the key count of
`globalScene.pokeballCounts`, then the Cancel line. `countsText` (`:50-55`) is `Object.values(pokeballCounts)`, one per line (`:113-116`), refilled on
`show` (`:63`); the names are built once, in `setup`. The keys are the `PokeballType` values but the Luxury Ball, in enum
order (`src/battle-scene.ts:1122-1127`), so line *i* of both is key *i*, and Cancel is the cursor after the last ball
(`ball-ui-handler.ts:75,80`).

`45-catch.js` restates the formula in closed form and the ball rules above.

---

## 21. End of turn: TurnEndPhase and what runs after the moves

`TurnStartPhase.start` pushes these phases behind the turn's MovePhase markers (`src/phases/turn-start-phase.ts:98-104`). The list is the constant
`turnEndPhases` (`src/phase-manager.ts:232`), pushed by `PhaseManager.queueTurnEndPhases` (`:594`):
**CheckInterludePhase → WeatherEffectPhase → PositionalTagPhase → BerryPhase → CheckStatusEffectPhase (→ PostTurnStatusEffectPhase ×n)
→ TurnEndPhase**. Next come any phases pushed during the turn: a player `SwitchPhase` after a faint, a trainer's `SwitchSummonPhase`, and
`BattleEndPhase` with the rewards. When the queue is empty, `PhaseManager.turnStart` (`:479`) clears the dynamic queues and starts
`TurnInitPhase`, which pushes `CommandPhase`/`EnemyCommandPhase` per active mon and then `TurnStartPhase` (`src/phases/turn-init-phase.ts:59-75`).

**Queue rules that decide the order.**
- `pushNew` appends to the bottom level. `unshiftNew` adds one level above the running phase, first in first out
  (`src/phase-tree.ts:66`, `:98`). A heal that a turn-end phase queues (`PokemonHealPhase`) therefore resolves after that phase's
  `start` returns, in queue order. `damageAndUpdate` writes `hp` at once and only queues its animation (`src/field/pokemon.ts:4119`).
- A phase with `getPokemon()` that is not listed in `nonDynamicPokemonPhases` (`src/dynamic-queue-manager.ts:13`, `:164`) is dynamic:
  it is re-sorted by speed on every pop. `PostTurnStatusEffectPhase` is dynamic. `PokemonHealPhase`, `WeatherEffectPhase` and `FaintPhase` are not.
- Per-mon loops (`FieldPhase.executeForAll`, `src/phases/field-phase.ts:9`) walk `inSpeedOrder` (`src/utils/speed-order-generator.ts:14`).
  That is a `PokemonPriorityQueue` of the active field that re-runs `sortInSpeedOrder` on every pop (`src/queues/pokemon-priority-queue.ts:7`).
  Ties break on the seed fork `turn * 1000 + remaining`, `waveSeed` (§5). Inside `TurnEndPhase` the turn has already been incremented.
  The loops are pure apart from what each step does.

**1. `CheckInterludePhase.start`** (`src/phases/check-interlude-phase.ts:7`). On an X0 wave where every enemy has fainted,
`PhaseManager.onInterlude` (`src/phase-manager.ts:601`) removes WeatherEffectPhase, BerryPhase and CheckStatusEffectPhase (not
PositionalTagPhase), and sets `TurnEndPhase.upcomingInterlude`. Side effect: phase queue only.

**2. `WeatherEffectPhase.start`** (`src/phases/weather-effect-phase.ts:18`). With no weather it ends.
- Sandstorm and hail (`Weather.isDamaging`, `src/data/weather.ts:56`) do nothing if `SuppressWeatherEffectAbAttr` applies to any field mon (Cloud Nine, Air Lock; `:31-33`).
- Otherwise each mon in speed order takes `damageAndUpdate(toDmgValue(maxHp/16), {result: INDIRECT, ignoreSegments: true})` (`:36-65`). It is spared if any of these hold:
  - it has switched out;
  - it has a type that `Weather.isTypeDamageImmune` spares (Ground, Rock or Steel in sand, Ice in hail; `weather.ts:66`);
  - `PreWeatherDamageAbAttr` cancels it (`BlockWeatherDamageAttr`: Sand Veil, Snow Cloak, Ice Body…);
  - it has Magic Guard (`BlockNonDirectDamageAbAttr`);
  - it is UNDERGROUND or UNDERWATER.

  Because segments are ignored, the chip can break several boss bars at once (`pokemon.ts:7181-7187`, §3).
- After the weather message, `PostWeatherLapseAbAttr` runs per mon (`:69-75`). Its condition `getWeatherCondition` is false while `isWeatherSuppressed()` holds, i.e. while a mon on the field has Cloud Nine or Air Lock (`src/data/weather.ts:208`, `ab-attrs.ts:6127`).
  - `PostWeatherLapseHealAbAttr` (`:3979`), below full HP only, queues a heal of `toDmgValue(maxHp·factor/16)`: Rain Dish and Ice Body 1/16, Dry Skin in rain 1/8.
  - `PostWeatherLapseDamageAbAttr` (`:4010`) deals 1/8 at once to Dry Skin or Solar Power in sun, unless the mon has Magic Guard.

Side effects: writes `hp`, queues heals and messages, ability bookkeeping. No RNG apart from bar breaks (global RNG).

**3. `PositionalTagPhase.start`** (`src/phases/positional-tag-phase.ts:13`). `activateAllTags`
(`src/data/positional-tags/positional-tag-manager.ts:40`) ticks each tag. Future Sight and Doom Desire come due and unshift a `MoveEffectPhase`
(`positional-tag.ts:100-112`); Wish unshifts a heal (`:158-165`). Side effects: writes the tag list. The delayed attack draws from the battle RNG as usual.

**4. `BerryPhase.start`** (`src/phases/berry-phase.ts:18`). For each mon in speed order, `eatBerries` (`:33`) runs if any `BerryModifier.shouldApply` holds
(`modifier.ts:1824` → `getBerryPredicate`, `src/data/berry.ts:23`).
- Unnerve (`PreventBerryUseAbAttr` on an opponent) stops all of that mon's berries (`berry-phase.ts:45`).
- Otherwise every usable berry applies once (`BerryModifier.apply`, `modifier.ts:1833`; effects in `getBerryEffectFunc`, `berry.ts:69`).
- Berry Pouch (`PreserveBerryModifier.apply`, `modifier.ts:1882`) keeps the berry on `randBattleSeedInt(10) < 3·stack`.
- Stat berries are batched into one `StatStageChangePhase` (`berry-phase.ts:70-76`). Cheek Pouch follows, then Cud Chew replays last turn's berries (`ab-attrs.ts:4255`).

Thresholds read the HP at this point: after the weather chip, **before** the status chip. `getHpRatio()` rounds to 2 decimals
(`pokemon.ts:1693`), so Sitrus needs `hp/maxHp < 0.495`. Side effects: draws from the battle RNG (Berry Pouch) and the global RNG
(Starf); writes held items and `berriesEaten`; queues heal and stat phases.

**5. `CheckStatusEffectPhase.start`** (`src/phases/check-status-effect-phase.ts:9`). For each mon with poison, toxic or burn
(`Status.isPostTurn`, `src/data/status-effect.ts:31`), it unshifts a `PostTurnStatusEffectPhase`. Pure apart from the queue.
`PostTurnStatusEffectPhase.start` (`src/phases/post-turn-status-effect-phase.ts:19`):
- It skips a mon that is inactive or switched out.
- `status.incrementTurn()` runs first (`:26`), so the toxic counter ticks even when the chip is blocked.
- Magic Guard, or `BlockStatusDamageAbAttr` (Poison Heal, against poison and toxic), cancels the chip (`:27-34`).
- Chip (`:41-52`): poison `toDmgValue(maxHp/8)`; toxic `toDmgValue(maxHp·toxicTurnCount/16)`; burn `toDmgValue(maxHp/16)`, halved by Heatproof (`ReduceBurnDamageAbAttr`).
- The chip goes through `pokemon.damage(dmg, false, true)` (`:57`). **Boss bars hold**: the chip stops at a bar boundary (`pokemon.ts:7165`).
  `preventEndure` skips Sturdy, Focus Band and the endure token, and a faint from it cannot use a Reviver Seed.
- On the classic final boss, `end` starts phase two (`post-turn-status-effect-phase.ts:64-70`).

Side effects: writes `hp` and status counters. No RNG.

**6. `TurnEndPhase.start`** (`src/phases/turn-end-phase.ts:24`), in order:
1. `currentBattle.incrementTurn()` (`:27`, `src/battle.ts:173`) increments `turn`, clears `turnCommands` and `preTurnCommands`, and nulls `battleSeedState`.
   From here on, every battle-RNG draw (Moody, Mini Black Hole, then next turn's AI) comes from the next turn's re-sown stream (`battle.ts:492-495`).
   It then dispatches `TurnEndEvent` and clears the last turn order (`turn-end-phase.ts:28-29`).
2. Unless `upcomingInterlude` is set, each field mon in speed order goes through the steps below (`:33-68`):
   1. If not switched out, `lapseTags(TURN_END)` (`pokemon.ts:4377`) ends one-turn tags (`FLINCHED`, `BYPASS_SPEED`, `STURDY`, protect…) and runs the tag effects in tag order:
      - Leech Seed: 1/8 at once, then a queued heal to the seeder, reversed by Liquid Ooze (`src/data/battler-tags.ts:1504`).
      - Nightmare 1/4 (`:2716`), binding moves 1/8 (`DamagingTrapTag`, `:944`), Salt Cure 1/8, or 1/4 on a Water or Steel type (`:2662`, `:2681-2686`), Curse 1/4 (`:2689`).
        Each deals `toDmgValue(maxHp·ratio)` at once through `DamagingBattlerTag.damage`, which Magic Guard cancels (`:900-918`).
      - Perish Song faints the mon when its count runs out (`:2173`). Ingrain and Aqua Ring queue a 1/16 heal (`:821`, `:1847`). Yawn puts the mon to sleep (`:1908`).
   2. Leftovers (`TurnHealModifier.apply`, `modifier.ts:1644`) queues a heal of `toDmgValue(maxHp/16)·stack` if the mon is below full HP.
   3. Grassy Terrain queues a heal of `toDmgValue(maxHp/16)` for a grounded mon (`turn-end-phase.ts:39-50`).
   4. Enemies only:
      - `EnemyTurnHealModifier.apply` (`modifier.ts:3526`) queues an unfloored `maxHp·stack·2/100` with `preventFullHeal`. The heal phase floors it and caps the
        **amount** at maxHp − 1, not the HP (`pokemon-heal-phase.ts:195`), so the token heals a foe to full, and heals a foe under
        50 max HP with one stack by 0.
      - `EnemyStatusEffectHealChanceModifier.apply` (`modifier.ts:3621`) cures the status on `randSeedFloat() <= 0.025·stack` (global RNG).
   5. `applyAbAttrs("PostTurnAbAttr")` (`turn-end-phase.ts:57`), non-simulated:
      - Poison Heal queues a 1/8 heal (`ab-attrs.ts:4089`).
      - `PostTurnResetStatusAbAttr` (`:4128`): Shed Skin cures at `randSeedInt(10) < 3` (global; `init-abilities.ts:521`), Hydration in rain (`:676`), Healer cures its ally at `randSeedInt(2)` (global; `:916`).
      - Harvest draws from the global RNG (`ab-attrs.ts:4163`). Moody draws from the battle RNG (`:4313`).
      - Speed Boost (`:4353`), the Hunger Switch form change (`:4396`), Cud Chew's record, Ball Fetch.
      - Bad Dreams deals 1/8 at once to sleeping foes (`:4421`). `canApply` needs one sleeping foe without Magic Guard
        (`:4428`), and `apply` then asks only the holder's Magic Guard (`:4445`), so a sleeper with Magic Guard beside
        one without it takes the chip.
   6. Even for a mon that switched out:
      - Toxic Orb or Flame Orb: `TurnStatusEffectModifier.apply` → `trySetStatus` (`modifier.ts:1712`). The status lands after step 5, so its chip starts next turn.
      - Mini Black Hole (`TurnHeldItemTransferModifier`, `modifier.ts:3236`), unless the holder has fainted (`HeldItemTransferModifier.shouldApply`, `:3177`), steals immediately with battle-RNG picks (§8). This happens before the queued heals resolve.
   7. `summonData.turnCount++` and `summonData.waveTurnCount++` (`turn-end-phase.ts:63-64`).
3. `arena.lapseTags()` (`src/field/arena.ts:841`; `ArenaTag.lapse`, `src/data/arena-tag.ts:228`) ticks Tailwind, Trick Room, screens and so on,
   and calls `onRemove` on tags that expire. It is skipped on an interlude. Trick Room ending here changes next turn's order.
4. `weather.lapse()` (`weather.ts:33`; primordial weather never lapses) clears the weather and weather-based forms when it runs out.
   `terrain.lapse()` (`src/data/terrain.ts:35`) likewise clears the terrain (`turn-end-phase.ts:73-80`). This happens even on an interlude, after this turn's weather chip and Grassy heal.

The heals queued during `start` then resolve in queue order in `PokemonHealPhase.end` → `heal` (`src/phases/pokemon-heal-phase.ts:108`, `:114`):
- nothing for a mon that has left the field or fainted (`:118`), or has Heal Block (`:123-127`);
- the amount is floored after the player's Healing Charm (`HealingBoosterModifier`) multiplies it, then capped at max HP,
  or at max HP − 1 under `preventFullHeal` (`:192-195`);
- `heal` caps the HP at max HP (`src/field/pokemon.ts:4172`).

Nothing in §21 is pure. RNG, by stream:
- **global**: Starf, Shed Skin, Healer, Harvest, the enemy status cure, bar-break stat picks;
- **battle**: Berry Pouch, Moody, Mini Black Hole;
- **seed fork** (restored): every speed ordering.

**Faints and the end of a wave.**
- Indirect damage that KOs a mon (weather, status, tags) queues a deferred `FaintPhase` with `preventInstantRevive = true` (`pokemon.ts:4102`,
  `:4154`; `src/phase-manager.ts:533`; `src/phases/faint-phase.ts:37`). It runs after the phases the current one queued, and **no Reviver Seed** (`faint-phase.ts:62`).
- An enemy faint unshifts `VictoryPhase` (`faint-phase.ts:184`). Once no enemy is left, `VictoryPhase.start` pushes `BattleEndPhase`, `TrainerVictoryPhase`
  and the rewards to the bottom of the queue (`src/phases/victory-phase.ts:43-58`). They run after the turn-end phases.
  So on the turn a wave is won, the player's mons still take the chip, eat berries and heal, except on X0 waves (step 1).
- The EXP is not pushed: `VictoryPhase.start` calls `applyPartyExp` (`victory-phase.ts:34`), which unshifts `ExpPhase` or `ShowPartyExpBarPhase`
  (`src/battle-scene.ts:3401-3404`), whose level-up unshifts `LevelUpPhase` (`exp-phase.ts:41`, `show-party-exp-bar-phase.ts:33`) and in turn
  `LearnMovePhase` (`level-up-phase.ts:97`). So **a move prompt from a KO by a move comes before that turn's `TurnEndPhase`**, Leftovers and all;
  from a KO inside `TurnEndPhase` (Leech Seed, Curse, a trap, Toxic Orb), after it. `TurnEndPhase.start` increments the turn first
  (`turn-end-phase.ts:27`), so the rewards screen after a win reads one past the winning turn.
- A fainted player mon's replacement (`SwitchPhase`, `faint-phase.ts:181`) and a trainer's send-in (`SwitchSummonPhase`, `:192`) are also pushed.
  They arrive after `TurnEndPhase`, so the newcomer gets no turn-end effect that turn.

**The HUD's version** is `endOfTurnSteps` / `endOfTurnHp` in `10-damage.js`, and it follows the order above rather than
summing it, because the order is what decides survival: the weather chip lands before the berry predicate reads the HP,
and the berry before the status chip, so a mon that a chip-first reading buried walks away. The steps it carries, in
order: the moves' own Shell Bell (`MoveEffectPhase.end`, before any turn-end phase), the weather chip and the two
weather-lapse abilities, the berries (Sitrus on the *rounded* ratio, `< 0.495`; Enigma; an opposing Unnerve skips both),
the status chip and the status orbs, the TURN_END tags (Leech Seed and its heal to the seeder — reversed by Liquid Ooze,
cancelled whole by Magic Guard — the binding moves, Nightmare, Curse, Salt Cure, Ingrain and Aqua Ring), then Leftovers,
Grassy Terrain, the enemy's wave-heal token (whose `preventFullHeal` caps the amount, not the HP), Poison Heal and an opposing Bad
Dreams. Every one of those heals is a queued `PokemonHealPhase`, so Heal Block cancels it and the healed mon's own side
scales it by Healing Charm, floored — which is also what deepens a Liquid Ooze drain (§18).

Deliberately left out, each either rare at a command prompt or not a change in HP: `PositionalTagPhase` (Future Sight,
Wish), Perish Song's count and Yawn's sleep, Cheek Pouch and Cud Chew, the stat berries and Lum, the Shed Skin /
Hydration / Healer cures, Harvest and Moody, and the enemy's 2.5 % status cure. Two more come of the model being **one
mon's turn end at a time**, not the field's: a Leech Seed's payout to the seeder is read off the seeded mon's HP as it
stands, so a seed that this same turn's weather or status chip would fell the mon before it ever lapsed still pays; and
Bad Dreams asks the *sleeper's* Magic Guard, like `canApply`, where `apply` asks the **holder's**
(`ab-attrs.ts:4428`, `:4445`) — the holder's is modelled, so a Magic Guard holder deals none, but in doubles a sleeper
with Magic Guard beside one without it takes the chip in game and is spared here. One more is left out of the KO curve
alone: the weather chip's `ignoreSegments`. `koCurve` takes one net turn-end number per use — `turnEndCourse` builds it
from expectations over statuses and item steals, so there is no per-part signal left to carry — and the whole of it
meets the bar rule, where the game lets the weather chip through. A max/16 chip is smaller than any bar, so the cost is
the HP between a bar boundary and the chip's far side, once a turn. The status chip's clamp, which the same code gives
it, *is* the game's (`damage(dmg, false, true)`).

---

## 22. Live bundle notes

Facts about the served build at `https://pokerogue.net`, not the source. Most of §0–§9 was first read off
`loading-scene-BqCzRPcm.js` and `battle-scene-BmkpVc5x.js`; those readings have been replaced by the source.

**Names.**
- Upstream's `vite.config.ts:46-54` sets `keepNames`, so class and function names survive minification. The HUD
  relies on it: attrs, tags and modifiers are matched by `constructor.name` / `hasAttr("…")` / `attr.is("…")`
  (`MultiHitAttr`, `PokemonMultiHitModifier`, `EnemyEndureChanceModifier`, `BerryModifier`, `AttemptCapturePhase`,
  `getCriticalCaptureChance`…). A build without `keepNames` would break all of these at once.
- Export **aliases** change per build (`getCriticalCaptureChance as wa`, `sortInSpeedOrder` as `Mo` when last read,
  `allBiomes` as `ar as us`, the species registry as `t as $t`, the trainer configs as `do`). Find an export by
  its function name or by shape, never by alias.
- `randSeedInt` and `shiftCharCodes` are exported by name from the `FadeOut` chunk; `randSeedInt` is also reachable
  as `Phaser.Math.RND.integerInRange`. `Phaser.Math.RND.state()` returns a `"!rnd,…"` string (observed live).
- Enums are numbers at runtime (see the header); e.g. `UiMode.MYSTERY_ENCOUNTER` is the bare `45`.
- `i18next` is imported as a module (`src/i18n.ts`), not a page global, so the console has no `i18next` to ask. Its
  language detector (`lookupLocalStorage: "prLang"`, `caches: ["localStorage"]`, order localStorage then navigator)
  caches the language i18next picked under `localStorage.prLang`, and the Language setting's `i18next.changeLanguage` writes the same key
  through that cache, then reloads the page (`src/ui/settings/display-settings-ui-handler.ts:66-74`). i18next writes the code it matched back to that key on init, so
  `resolvedLanguage` differs from it only when that language's translations fail to load and a fallback has them
  (`es-419` → `es-ES` → `en`). Source, not checked live.

**Reaching module-private or unexported tables.**
- `04-game-tables.js` imports the already-loaded `/assets/<name>-<hash>.js` chunk URLs again; the browser returns the same
  module instances without re-running them. It imports each one by injecting a `<script type="module">` whose own
  source holds that URL as a literal, rather than calling `import(url)`, which the Firefox add-on linter rejects with
  a computed argument (#381); the namespace comes back through the `window.__coachHudChunk` handoff. It scans the
  namespaces by shape: a Map whose values carry
  `biomeLinks` + `pokemonPool` (`allBiomes`), an object with `getSpecies` / `getAllSpecies` (the species registry),
  a function named `getBiomeName`, an object whose values carry `trainerType` + `partyTemplates` (trainer configs),
  an object with `getShinyCatchMultiplier` (`timedEventManager`), and the reward functions of §19
  (`regenerateModifierPoolThresholds`, `getPlayerModifierTypeOptions`). The scan is async, so the first ticks have
  no tables.
- Checked in Chrome on 1.12.0.11 (2026-09-16, title screen, fresh profile): all five tables found across the 10
  loaded chunks, `TrainerConfig` keeps its class and field names, a BOSS trainer carries `specialtyType`, the
  registry keeps `getEvolutions` / `getPrevolution` / `hasPrevolution`, `getEvolutions` returns `level` +
  `evoLevelThreshold`. `signatureSpecies` was **not** among the live exports. **Not checked in Orion.**
- The injected module script was checked against the live build in Chrome (2026-09-24, title screen): all 10 loaded
  chunks handed their namespace back, `allBiomes` a Map of 35, 921 moves and 319 abilities, both reward functions
  found, and the page kept no injected element. The page serves no CSP that blocks an inline module script, which is
  the one thing this way of importing needs. **Not checked in Firefox or Orion**, where only the linter's objection to
  the old form (#381) is known.
- `48-preview.js` calls the scene's `randomSpecies` wrapper when the build exposes it, and reproduces it otherwise.

**Unverified on a live tab.**
- Whether a chunk exports `calculateBossSegmentDamage` or only inlines it into `EnemyPokemon.damage` (#134 §7.1
  suggests calling it through `EnemyPokemon.prototype.damage` on a stub).
- Whether a speed tie with priority or Quick Claw in play still follows `sortInSpeedOrder` at the prompt (§5): #158
  checked one plain tie. Present and Payback into a ball command (§6) weren't met.
- Whether `regenerateModifierPoolThresholds` / `getPlayerModifierTypeOptions` are found under those names (§19),
  whether every generated reward type exposes `nature` / `stat` / `key` / `berryType` / `teraType` as plain
  properties (§15), and whether Beast Boost's `changes` and `HitHealAttr.healRatio` read under those names (§18).
- Whether the chunk scan's shapes find `allAbilities` (an array whose entry 1 has `id` 1, a `name` and `attrs`),
  `allMoves` (entry 1 has `power` and `pp`) and `speciesEggMoves` (entries 1, 4 and 7 are four move ids) (§23); until
  they are, the starter card names no passive, hidden ability or rare egg move.
- Cost: ~0.05–0.2 ms per `getAttackDamage` call, ~300 calls a refresh, was a live-tab estimate; `__coachHud.stats()`
  is the measurement.

---

## 23. Starter select: the grid, the budget, and what a starter brings to a run

Read at `v1.12.1.1`, where 1.12.1.0's rework split the screen: the info panel is `StarterSummary`
(`src/ui/containers/starter-summary.ts`) and the pure helpers moved to module functions in
`src/ui/utils/starter-select-ui-utils.ts`, which the page cannot reach. The starter card (`51-starters.js`) calls only
the pure reads marked below; nothing here draws from an RNG stream or queues a phase, so it runs outside `sandbox`.

**The screen.** `StarterSelectUiHandler` (`src/ui/handlers/starter-select-ui-handler.ts:152`) serves
`UiMode.STARTER_SELECT` (10). Its own pop-ups change the UI mode (`OPTION_SELECT` for the starter's menu, `:2089`, whose
first option is Add to Party while the starter can join, `:1596-1601`; `CONFIRM` for start and exit, `:3162,3259`), so
`ui.getHandler()` stops returning it; `ui.handlers[STARTER_SELECT]` is the same instance throughout
(`src/ui/ui.ts:146`). `SelectStarterPhase.start` (`src/phases/select-starter-phase.ts:17`) is the only outside caller;
`starterSelectCallback` is set by `show` (`:587`) and cleared when the run starts (`:3150`), so a set callback during
`SelectStarterPhase` means a team is being chosen. The Pokédex is a different handler
(`src/ui/handlers/pokedex-ui-handler.ts:197`). Daily runs never show the grid (`getDailyRunStarters`,
`src/phases/title-phase.ts:239`). `gameMode` and its challenges are final before the grid opens
(`src/phases/title-phase.ts:355-360`, `src/ui/handlers/challenges-select-ui-handler.ts:553`).

**The grid cursor.** The grid is 81 on-screen containers (`starterContainers`, `:155`, built in `setup`, `:286-294`)
that `updateScroll` (`:2526-2623`) fills from `filteredStarterIds[scrollCursor × 9 + i]`, so `cursor` is an on-screen
index (0–80) and the grid index is `scrollCursor × 9 + cursor`. `setCursor` (`:2625-2651`) writes `filterBarCursor`
instead in filter mode; on the grid it clamps to 80, places the cursor by the on-screen index and calls
`setStarter(container.species.speciesId)`, which sets `lastStarterId` (`:2715`). It never scrolls. ACTION opens the
starter's menu only from the grid cursor (`cursorObj` shown): the party icons, the start button and the random button
each take their own inputs first (`:2131-2137`).

**What is offered.** `filterStarters` (`:2337-2524`) builds `filteredStarterIds` from
`speciesDataRegistry.getAllStarters()`: in challenge mode only those the challenges allow by the **soft** check, where
the species or any evolution or item form change passes (`isStarterValidForChallenge`,
`src/ui/utils/starter-select-ui-utils.ts:87-118`, over `checkStarterValidForChallenge(id, props, true)`,
`src/utils/challenge-utils.ts:600-626`), then the filter bar, whose Caught column defaults to caught only (`:748-760`).
No list of every allowed starter is kept. A container has `species`, `cost` and an `icon` sprite
(`src/ui/containers/starter-container.ts:9-20`); `setSpecies(id, props)` (`:88-120`) looks the species up first, then
replaces the sprite. The grid greys an icon (`icon.alpha` 0.375) in `tryUpdateValue` (`:3043-3125`), which is a state
write — never call it.

**The team being built.** `partyStarterIds` (`:170`) with a parallel `partyStarters` (`:168`), each built in
`addToParty` (`:2189-2236`): `{ speciesId, shiny, variant, formIndex, female, abilityIndex, passive, nature, moveset,
pokerus, nickname, teraType, ivs }`, `passive` true only when `passiveAttr` is `UNLOCKED | ENABLED`. At most
`PLAYER_PARTY_MAX_SIZE` 6, no duplicates (`:1596-1601`). **A team may start** once `isPartyValid()` (`:3179-3197`,
pure): at least one member passes the **strict** check (`soft` false: each active challenge's
`applyStarterChoice(species, holder, props)` on the species itself); the others need only the soft one. The props a
challenge check takes come from `getStarterDexAttrPropsFromPreferences(id)` (`:3221-3223`, pure, over the module
function at `src/ui/utils/starter-select-ui-utils.ts:376-390` and `gameData.getSpeciesDefaultDexAttrProps`,
`src/system/game-data.ts:1925`).

**The budget.** `getRunValueLimit()` (`src/ui/utils/starter-select-ui-utils.ts:438-452`, a module function): 15 in
Endless and Spliced Endless, 10 otherwise, less `LowerStarterPointsChallenge`'s value (`src/data/challenge.ts:1173`).
`tryUpdateValue` writes it into `valueLimitLabel` as `<party value>/<limit>` (`:3052-3053`), the one copy on the handler. A
species costs `gameData.getSpeciesStarterValue(id)` (`src/system/game-data.ts:2023`, pure): the base cost from the
species registry, then `ChallengeType.STARTER_COST`, then `starterData[id].valueReduction` steps (−1 while above 1, then
halve). Fresh Start adds the reduction back first, so the steps cancel it (`src/data/challenge.ts:991-996`); the Ability
Randomizer moves a few species' costs (`:1707-1733`). `LowerStarterMaxCostChallenge` excludes base costs above
`10 − value` (`:1150-1156`).

**Account data, challenge-adjusted.** `getStarterData(id)` (`src/ui/utils/starter-select-ui-utils.ts:278-293`, a module
function) returns copies of `dexData[id]` and `starterData[id]` after `ChallengeType.STARTER_SELECT_MODIFY`, each
active challenge's `applyStarterSelectModify(id, dexEntry, starterDataEntry)` in turn (`src/utils/challenge-utils.ts:428`).
Fresh Start's (`src/data/challenge.ts:998-1033`) clears egg moves and the passive, masks `abilityAttr` to abilities 1 and
2, resets `valueReduction`, caps IVs at 15 and limits natures to the neutral five; shiny and variant bits stay. The
Moveset Randomizer's clears egg moves (`:1349-1358`). `dexData` carries `caughtAttr` (bigint: NON_SHINY 1n,
SHINY 2n, MALE 4n, FEMALE 8n, DEFAULT_VARIANT 16n, VARIANT_2 32n, VARIANT_3 64n, form *i* `1n << (7 + i)`) and `ivs`
(HP, Atk, Def, SpA, SpD, Spe); `starterData` carries `eggMoves` (a 4-bit mask over `speciesEggMoves[id]`, bit 3 the
rare move, `src/system/game-data.ts:1844`), `abilityAttr` (ABILITY_1 1, ABILITY_2 2, ABILITY_HIDDEN 4), `passiveAttr`
(UNLOCKED 1, ENABLED 2), `candyCount`, `valueReduction`.

**Challenges on the grid** (`s.gameMode.challenges`, active when `value !== 0`): Single Generation
(`species.generation === value`, `src/data/challenge.ts:589-595`), Single Type (the form's types include `value − 1`,
`:906-914`), Fresh Start (value 1: default starters and their evolutions only, `:983-989`), Lower Starter Max Cost and
Lower Starter Points. Inverse Battle flips each defending type's multiplier (below 1 → 2, above 1 → 0.5,
`:1096-1107`, applied per type in `getTypeDamageMultiplier`, `src/data/type.ts:19-23`). Flip Stat, Limited Catch,
Hardcore, Limited Support and Passives don't change the grid; the Moveset and Ability Randomizers change it only
through their hooks above.

**What the randomizers hide from the grid.** The Ability Randomizer (`src/data/challenge.ts:1594-1734`, values 1–3)
rerolls each species ability from 1 (`SPECIES_ABILITY_MODIFY`, `:1645-1681`) and the passive too from 2
(`PASSIVE_ABILITY_MODIFY`, `:1683-1705`), each a seeded pick (offset `500 · speciesId + abilityId`); 3 spares nine
form-change abilities from the ability reroll (`:1657-1672`), never from the passive's. Both skip the Pokédex and
egg-hatch modes and `SelectStarterPhase`, so the grid shows the species' own. The Moveset Randomizer (`:1319-1592`,
values 1–2) empties the level-up list in `STARTER_SELECT` and outside it swaps each level-up move for a seeded pick
(`applyLevelUpMoveset`, `:1425-1454`). An evolution that needs a move (`EvoCondKey.MOVE`, or Tyrogue's own key, both
checked against the moveset, `src/data/balance/pokemon-evolutions.ts:171-206`) keeps that need at 1
(`applyModifyEvolutions`, `:1511-1557`, returns at once). From 2 the move datum goes, a condition left empty is null
and a level-1 evolution takes `evoLevelThreshold?.[0] ?? 50`; Tyrogue knowing none of its three moves has one branch,
picked by seed (offset `pokemon.id`), freed instead. The hook runs on copies `getEvolution` builds
(`src/field/pokemon.ts:3011-3038`) through a constructor that sets `evoLevelThreshold` only from `evoDelay`
(`pokemon-evolutions.ts:261-274`), so a level-1 one always lands on 50: Dipplin → Hydrapple.

**Species reads** (on a `PokemonSpecies`, all pure): `baseStats`, `baseTotal`, `type1` / `type2`, `abilityHidden`,
`generation`; `getEvolutionLevels()` (`src/data/pokemon-species.ts:1106-1123`: every descendant flattened as
`[speciesId, level]`, item evolutions at level 1); `getPassiveAbility(formIndex)` (`:217`, after
`PASSIVE_ABILITY_MODIFY`, which the Ability Randomizer skips during `SelectStarterPhase`,
`src/data/challenge.ts:1683-1695`). Every species carries its own passive (`passives` in
`src/data/balance/species/generation-*.ts`, one ability or one per form index, read by `SpeciesDataRegistry.getPassive`,
`src/data/species-data-registry.ts:236-245`, form 0 when the index has none), and in battle a mon has its
**current** species': `Pokemon.getPassiveAbility` reads `this.species.getPassiveAbility(this.formIndex)`
(`src/field/pokemon.ts:2261`) and `getAbility` the species form's at the mon's `abilityIndex` (`:2226`). Only the
switch is the starter's, `this.passive`, copied at run start (`hasPassive`, `:2361`). So an evolution fights with its
own passive and hidden ability, not the ones the grid shows: at 1.12.1.1, 126 of 394 evolved final forms carry another
form-0 passive than their starter (Abra Comatose → Alakazam Magician) and 94 another hidden ability (Magikarp Rattled →
Gyarados Moxie). The registry (`SpeciesDataRegistry`, found by the chunk scan, §10) gives every
species: `getSpecies(id)`, `getAllStarters()` (`src/data/species-data-registry.ts:293`) and `getEvolutions(id)`
(`:331`: `level`, `item`, `condition`); on the handler a species is only on the visible containers. Ability and move
names need `allAbilities` / `allMoves` (`src/data/data-lists.ts:8-9`) and egg-move ids `speciesEggMoves`
(`src/data/balance/moves/egg-moves.ts:17`), all module exports (§22). `h.lastStarterId` is the id in the info panel
(`:162`) and is not cleared when the cursor leaves the grid (`setNoStarter`, `:2686-2692`); `h.pokerusSpeciesIds` the
day's Pokérus starters (`:197`, set in `show`, `:581`), which earn 1.5× EXP (`src/battle-scene.ts:3357-3359`).

**What a run starts with.** `getStartingLevel()` (`src/game-mode.ts:137-147`): 5, or 20 in Daily. `SelectStarterPhase`
(`src/phases/select-starter-phase.ts:44-105`) adds each starter with its ability index, form, gender, shiny, variant,
dex IVs and nature; the moveset the grid chose; passive, Pokérus and nickname copied; then `STARTER_MODIFY`, which only
Fresh Start uses (ability index `% 2`, passive off, egg moves replaced by level 1–5 moves, IVs capped at 15,
`src/data/challenge.ts:1035-1065`). **Luck**: each starter adds `getDexAttrLuck(dexData[id].caughtAttr)`
(`src/system/game-data.ts:1990-1992`: VARIANT_3 3, VARIANT_2 2, SHINY 1) — the best tier ever caught, even when the
non-shiny form is picked (`src/phases/select-starter-phase.ts:80-82`) — none under Fresh Start, shiny or not
(`src/data/challenge.ts:1050`).

**Leaving.** CANCEL on the grid (`src/ui/handlers/starter-select-ui-handler.ts:2110-2121`) leaves the IV view
(`showIvsMode`, toggled from the starter's menu), else pops the last starter added, and only on an empty party calls
`tryExit` (`:3231-3261`); with the filter bar active (`:895-920`) it first closes an open dropdown or resets a filter
column off its default. `tryExit` shows the `confirmExit` text, then `CONFIRM`. Yes's callback sets `STARTER_SELECT`
again at once (`:3241`; `CONFIRM` is a no-transition mode, `src/ui/ui.ts:82-84`), then outside challenge mode goes to
the title (`phaseManager.toTitleScreen()`, `src/phase-manager.ts:262-269`), whose `TitlePhase.start` awaits
`checkLastSaveSlot` before it shows `TITLE` (`src/phases/title-phase.ts:49`); the mode stays `STARTER_SELECT` until
then. STATS no longer toggles a stats view: it opens the filter bar's first dropdown (`:2122-2130`).

## 24. DNA Splicers: who can be fused, pick order, and what a fusion is

Read at the pinned tag (`v1.12.1.1`). The fusion advisor (`49-fusion.js`) reads the run: the pairs come from the
fusion judgment in `12-value.js`, and what it adds on top is everything below — who can be fused, the pick order, and
what the fused mon is — from species data and pure reads (species forms, `getAbility`, the select filter). It is built
inside the run read's `sandbox` and opens no `sandbox` of its own. The game
has no fusion preview: the party screen offers only APPLY / SPLICE / UNSPLICE (`src/ui/handlers/party-ui-handler.ts:1519-1531`).

**The item.** `DNA_SPLICERS` is a `FusePokemonModifierType` (`src/modifier/modifier-type.ts:1265-1285`, `:2204`); its
modifier is consumable and `apply` is `playerPokemon.fuse(playerPokemon2)` (`src/modifier/modifier.ts:2366`, `:2393-2396`),
so it can't be held or kept for later. There is no reverse item: unsplicing is a free party option. Pools: **Great**,
weight 4 in Spliced Endless, 2 in classic (challenge runs included) during a fusion event
(`timedEventManager.areFusionsBoosted()`), else 0 (`src/modifier/init-modifier-pools.ts:315-328`); **Master**, weight 24
outside Spliced Endless and that event (`:630-638`). Both need more than one unfused member. Never sold in the shop;
no Mystery Encounter names it, though a Master-tier roll (Mysterious Chest, Fight or Flight past wave 160) can bring it.

**The party screen.** Taking it runs `SelectModifierPhase.openFusionMenu` (`src/phases/select-modifier-phase.ts:176-181`,
`:300-326`): `UiMode.PARTY` with `PartyUiMode.SPLICE` and `modifierType.selectFilter` as the handler's `selectFilter`
(`src/ui/handlers/party-ui-handler.ts:283-291`). The first pick (APPLY) records `transferCursor` and sets `transferMode`
(`:843-844`, `:1778-1785`); SPLICE on another slot calls back `(transferCursor, cursor)` (`:840-842`), and the phase
builds the modifier with `party[fromSlotIndex]` first (`select-modifier-phase.ts:310-319`). Backing out clears the first
pick (`party-ui-handler.ts:1076-1081`) and then returns to the rewards screen with the Splicer unspent
(`select-modifier-phase.ts:323-325`).
**Filter** (both picks, `modifier-type.ts:1272-1277`): not `isFusion()`, and `ChallengeType.POKEMON_FUSION`, which only
Hardcore uses, refusing a fainted member (`src/data/challenge.ts:1261-1267`). Same species, legendaries and fainted
members (outside Hardcore) are allowed.

**`PlayerPokemon.fuse(other)`** (`src/field/pokemon.ts:6461-6522`; party write, phase queue, an unseeded status draw).
The **first pick is the base**: it keeps its level, EXP and growth rate, IVs, nature, Tera type, friendship, passive
unlock, Pokérus, used TMs and moveset. From the second it copies `fusionSpecies`, `fusionFormIndex`,
`fusionAbilityIndex`, shiny, variant, gender, luck and custom data (`:6462-6472`). HP becomes the halves' mean HP share
of the base's pre-fusion max, then `updateModifiers` recalculates (`:6478-6493`, `:6511`). Every held item of the second
moves over, `isTransferable` unchecked, up to the base's stack limits; the rest is lost (`:6504-6513`,
`src/battle-scene.ts:2504-2577`). The second leaves the party (`:6513`), and a `LearnMovePhase` is queued for each of its
moves the base doesn't know (`:6515-6519`). No evolution check.

**What a fusion is.** Base stats (`calculateBaseStats`, `:1618-1640`): each stat `Math.ceil((base + other) / 2)`, after
the base half's Shuckle Juice / Old Gateau and before vitamins; Spliced Endless halves an **unfused** mon's instead.
Stats (`calculateStats`, `:1575-1616`): `floor((2·base + iv) · level / 100)`, HP `+ level + 10` (1 with Wonder Guard),
the rest `+ 5` then the nature (×1.1 ceil, ×0.9 floor). Types (`getBaseTypes`, `:2121-2151`): type 1 is the base's;
type 2 is the other half's type2 when set and not type 1, else its type1 when that differs, else the base's own type2.
Ability (`getAbility`, `:2201-2229`): the **other half's** at its `fusionAbilityIndex` (`PokemonSpeciesForm.getAbility`:
0 / 1 / 2 hidden, then `SPECIES_ABILITY_MODIFY`, `src/data/pokemon-species.ts:196-210`; the Ability Randomizer's swaps in a
seeded pick outside starter select and the Pokédex, through a seed fork, `src/data/challenge.ts:1645-1681`), with no fallback to ability 1; `canApplyAbility` turns off one
carrying `NoFusionAbilityAbAttr` (`pokemon.ts:2376-2383`: Disguise, Zen Mode, Schooling, Stance Change, …). The passive
stays the base's (`:2241-2262`). `getPassiveAbility` answers `summonData.passiveAbility` first (`:2242`), and only a
passive Trace writes one: the foe's passive, else its ability (`src/data/abilities/ab-attrs.ts:2709`,
`:2718`). Every other ability swap writes `summonData.ability`, which `getAbility(true)` skips. Learnsets merge both halves (`src/field/learnsets.ts:223-252`), TMs are the union, then
the Moveset Randomizer's `PLAYER_TM_COMPATIBILITY` (`pokemon.ts:6080-6100`), egg moves the base's only (`:1904-1918`).
Evolution checks the base's line first, then the other half's, one at a time, each list after the Moveset Randomizer's
`MODIFY_EVOLUTIONS` (`:3011-3038`). Shiny if either half, luck summed (`:1735-1737`, `:1816-1818`).

**Unsplice** (`party-ui-handler.ts:355-394`, `pokemon.ts:3267-3279`): free, in SPLICE mode or on the party check screen
during the reward phase; the second half is gone for good, its moves and items stay with the base.

## 25. Menu cursors: the command grid and the target cursor

Read from the pinned source.

**The command menu.** `Command` is FIGHT 0, BALL 1, POKEMON 2, RUN 3, TERA 4 (`src/enums/command.ts:1`), laid out 2×2
(`src/ui/handlers/command-ui-handler.ts:52-61`). UP/DOWN move ±2 and LEFT/RIGHT ±1, never wrapping (`:157-182`). TERA
sits off the grid: LEFT from FIGHT or POKEMON reaches it when `canTera()` (`:170-172`), RIGHT returns to FIGHT
(`:178-180`), and `show` moves a cursor left on POKEMON back to FIGHT (`:98-99`).

**The target cursor.** `TargetSelectUiHandler.processInput` (`src/ui/handlers/target-select-ui-handler.ts:89`) moves a
`BattlerIndex` — PLAYER 0, PLAYER_2 1, ENEMY 2, ENEMY_2 3 (`src/enums/battler-index.ts:5`) — and only ever lands on a
member of `targets` (`target-select-ui-handler.ts:48`). UP goes to the first entry of `targets` at or above `ENEMY`, DOWN to the first below it
(`:109-118`), and LEFT/RIGHT step ±1 within 0↔1 or 2↔3 (`:119-128`). Nothing wraps. When `getMoveTargets` says
`multiple` (`src/data/moves/move-utils.ts:84,91,107,112`) — side- and field-targeting moves as well as damaging spread
moves — no direction moves it and ACTION sends every target (`:95`, `:105-106`). CANCEL answers `[]` (`:96`).

**A committed command is a new object.** Every commit assigns a fresh literal to `currentBattle.turnCommands[fieldIndex]`:
FIGHT (`src/phases/command-phase.ts:265-270,315`), BALL (`:450-454`), POKEMON and RUN (`:548-556`). The target screen
writes its pick onto that same object (`src/phases/select-target-phase.ts:60`), or nulls the entry and asks the command
again (`:57-58`). Cancelling slot 1's command queues `CommandPhase` 0 then 1 (`command-phase.ts:671-676`), so slot 0
commits anew. While slot 1 is asked, slot 0's entry is one object, and a second ask of slot 1 sees a different one.

## 26. The screens the MCP driver walks: title, save slot, and who answers a prompt

Read at the pinned tag (`v1.12.1.1`) for the MCP driver (`src/driver.ts`), not the HUD; nothing here is called from the
page. §9 has the switch prompt, §23 the starter grid.

**Title.** `TitlePhase` (`src/phases/title-phase.ts:82-193`) offers, in order, [Continue,] New Game, Load Game, Run
History, Menu: Continue only when `checkLastSaveSlot` finds a session to load, and Menu opens the MENU overlay, which
holds the settings (`:182-189`). CANCEL does nothing there (`blockCancelButton`, `:191`). New Game opens a game-mode
`OPTION_SELECT` (`:105-157`): Classic, Daily Run, then Challenge and the Endless modes as unlocked, then Cancel.

**Save slot.** In SAVE mode (`src/ui/handlers/save-slot-select-ui-handler.ts:223-260`), ACTION on a slot with `hasData`
shows `overwriteData`, then a `CONFIRM` that refuses ACTION for its `inputDelay` (2000 ms outside beta and dev,
`:251-253`, `src/ui/handlers/base-option-select-ui-handler.ts:120-125`, `:383-391`); CANCEL in that delay lifts it and
answers No (`canBypassInputDelay`). Yes deletes that session, then starts the run, or calls `globalScene.reset(true)`
when the delete fails (`save-slot-select-ui-handler.ts:239-241`). On a free slot ACTION starts the run at once, and so
it does on one still loading: the test is `!hasData`, and `hasData` stays undefined until the slot loads (`:232-235`).
So on a free slot the first `CONFIRM` of the run is `CheckSwitchPhase`'s (§9), not an overwrite. The overwrite
`CONFIRM` is an overlay (`setOverlayMode`, `save-slot-select-ui-handler.ts:256-258`) over a `SAVE_SLOT` that `SelectStarterPhase` opened with a
plain `setMode` (`src/phases/select-starter-phase.ts:24`): `mode` is `CONFIRM`, the mode chain's top is `SAVE_SLOT`, and
`SelectStarterPhase` is still current, since it ends in `initBattle` (`select-starter-phase.ts:126`). §9's switch
question is a `CONFIRM` opened by a plain `setMode`.

**Message prompts.** `BattleMessageUiHandler` clears `onActionInput` synchronously before calling it, on ACTION and
CANCEL alike (`src/ui/handlers/battle-message-ui-handler.ts:130-140`). `awaitingActionInput` is never reset there or in
`MessageUiHandler` (`src/ui/handlers/message-ui-handler.ts:175-190`), so only `onActionInput` says a prompt is waiting.
The callback may arm a new prompt within the same press, and a prompt that a later `showText` replaced before it was
answered stays armed (`:244-300`).

**The level-up stats window** is `BattleMessageUiHandler`'s (`src/ui/handlers/battle-message-ui-handler.ts:12-15`). It
opens after the level-up prompt with the increments showing (`levelUpStatsIncrContent`); the first ACTION or CANCEL
swaps them for the totals, and the next hides `levelUpStatsContainer` (`promptLevelUpStats`, `:171-191`). It never
writes `message`, so the message text stays as it was. It is skipped when `settings.display.showStatsOnLevelUp` is off
(`:173-174`).

**A party screen's own message.** While `PartyUiHandler` awaits input on it, ACTION and CANCEL take the same path: clear
`onActionInput`, call it, clear `awaitingActionInput`. Every other button returns false, as does every button while the
text is still typing (`src/ui/handlers/party-ui-handler.ts:922-939`). The messages ("It won't
have any effect.", `:183`) are on the handler's own `message` text (`:236-243`), not the MESSAGE handler's; dismissed,
the text returns to the mode's own prompt, "Choose a Pokémon" outside item transfer and discard (`showPartyText`,
`:1336-1348`).

**Tutorials.** With `tutorialActive` on the current `AwaitableUiHandler`, `UI.processInput` hands input only to
`processTutorialInput`, which answers ACTION and CANCEL alike and refuses the rest; an active overlay short-circuits
both first (`src/ui/ui.ts:278-290`, `src/ui/handlers/awaitable-ui-handler.ts:15-26`).

**MENU never reaches a handler.** A MENU key-down goes only to `UiInputs.buttonMenu` (`src/ui-inputs.ts:185-214`);
nothing calls `ui.processInput(Button.MENU)`. It does nothing under `disableMenu`, opens the MENU overlay on TITLE,
COMMAND, MODIFIER_SELECT, MYSTERY_ENCOUNTER and a MESSAGE with a finished pending prompt, and leaves MENU by
`revertMode`. On STARTER_SELECT and POKEDEX_PAGE it is `buttonTouch` (`:148-150`): SUBMIT, then ACTION if SUBMIT
returned false, so on the grid a valid party is offered the start `CONFIRM`. Every other mode ignores it.

**The mode chain.** `ui.setOverlayMode` (`src/ui/ui.ts:581-583`) pushes the current mode onto `modeChain` (`:537-540`),
except MESSAGE (0), which the `this._mode &&` test skips. `ui.mode` and `ui.modeChain` are getters over private fields,
and there is no `getMode()` or `getModeChain()` (`:189-195`). `setMode` never touches the chain, `revertMode` pops it
(`:600`), and only `resetModeChain` (`:585-588`), called from `TitlePhase.loadSaveSlot` (`src/phases/title-phase.ts:199`), clears
it. So the entries below its top can be stale.

**`ui.revertMode()`** (`src/ui/ui.ts:590-620`) does nothing when the mode was entered by `setMode` (an empty
`modeChain`). Over an overlay it calls the handler's `clear()` and pops back to the previous mode, calling neither that
mode's `show()` nor any pending callback. `CONFIRM` and `OPTION_SELECT` drop their yes/no handlers unrun
(`src/ui/handlers/base-option-select-ui-handler.ts:544-558`), `SAVE_SLOT` drops its callback
(`src/ui/handlers/save-slot-select-ui-handler.ts:457-464`) and `PARTY` never calls its own
(`src/ui/handlers/party-ui-handler.ts:1964-1970`), so a phase waiting on any of them hangs. The Pokédex and game-stats
handlers do call their `exitCallback` on `clear()` (`src/ui/handlers/pokedex-ui-handler.ts:2428-2432`,
`src/ui/handlers/game-stats-ui-handler.ts:545-548`).

**`globalScene.reset(true)`** (`src/battle-scene.ts:1103-1230`) wipes the run in memory, destroys the UI and the scene,
and calls `launchBattle()`, which ends in `phaseManager.toTitleScreen(true)` (`:631-632`): the queue cleared, then
`LoginPhase` and `TitlePhase` (`src/phase-manager.ts:262-269`), with no `GameOverPhase` on the way. A failed per-wave
save takes this path: `EncounterPhase` calls it when `gameData.saveAll` resolves false
(`src/phases/encounter-phase.ts:300-306`, `src/system/game-data.ts:1190-1270`).

**A rejected per-wave save hangs instead.** That `saveAll(...).then(...)` has no `.catch` and is not returned
(`src/phases/encounter-phase.ts:291-310`), so a rejection skips both `reset(true)` and `doEncounter()`: the phase never
calls `end()`, and the rejection goes unhandled. The rejecting call is the unguarded verify fetch
(`src/api/system-savedata-api.ts:40-45`, `src/api/api-base.ts:97`), which `saveAll` reaches only on a logged-in wave
that does not sync (`src/system/game-data.ts:554-559`, `:1248-1249`); a syncing wave's `updateAll` catches its own
errors and resolves `false` (`src/api/savedata-api.ts:23-33`). Of a run's played waves only the first is an
`EncounterPhase`: later ones are `NextEncounterPhase` or `NewBiomeEncounterPhase` (`src/battle-scene.ts:1583-1586`),
subclasses with their own `phaseName` that inherit this save. Continue, Load Game and a retry after a loss push an
`EncounterPhase` too, with `loaded` set, which never saves (§29). The hung phase sits in MESSAGE with no
`onActionInput`, the state a healthy one also passes through during its 2 s intro tween and its unprompted wild-wave
text (`encounter-phase.ts:351-367`, `:430`).

**Settings.** The MENU overlay's settings entry opens `UiMode.SETTINGS_GENERAL` (`src/ui/handlers/menu-ui-handler.ts:551-552`),
the first of five tabs on `BaseSettingsUiHandler`. CYCLE_FORM and CYCLE_SHINY switch tab by a plain `setMode`
(`src/ui/settings/base-settings-ui-handler.ts:24-30`, `:82-84`, `:364-366`), and CANCEL only reverts the mode
(`:319-321`). Seven settings carry `requiresReload` (`src/ui/settings/settings-ui-items.ts`: Language `:240`, UI theme
`:255`, candy upgrade display `:305`, time-of-day widget `:329`, sprite set `:343`, Enable Audio `:413`, battle music
`:449`). LEFT or RIGHT onto a new value saves it (`base-settings-ui-handler.ts:358-363`, `:433-465`), and for one of
these the save is a page reload on the spot: `handleSaveSetting` calls `settings.updateAndReload`, which stores the
value and runs `window.location.reload()` (`base-settings-ui-handler.ts:544-562`,
`src/system/settings/settings-manager.ts:107-110`). Language's Change opens a language list that reloads the same way
(`src/ui/settings/display-settings-ui-handler.ts:16-23`, `:66-74`). Past a battle's first turn (`canLoseProgress`,
`currentBattle.turn > 1`) a `CONFIRM` with `losingProgressionWarning` asks first, and No puts the cursor back unsaved
(`base-settings-ui-handler.ts:547-555`, `:564-566`, `:589-595`). The reload drops the run in memory; only what the
session save holds comes back (§28).

## 27. The canvas and its message window

Read at the pinned tag (`v1.12.1.1`), for the panel's footprint (`90-render.js`).

**The canvas.** The game is 1920×1080 under `Phaser.Scale.FIT` (`src/main.ts:30-40`), with no zoom. Its parent `#app`
is stretched to the page by Phaser's default `expandParent`, so the drawn width is `min(page width, 16/9 × 100vh)`.

**The message window.** The UI works in a 320×180 space scaled ×6 (`src/scene-base.ts:17-20`,
`src/battle-scene.ts:479-482`), with the `UI` container anchored at its bottom edge (`src/ui/ui.ts:133`). The battle
message window is a 320×48 `bg` frame at origin `(0, 1)` there (`src/ui/handlers/battle-message-ui-handler.ts:27-30`):
the bottom 48 of 180, so its top edge is at 11/15 of the height (canvas y 792).

## 28. Loading a session save: what a reload keeps and what it loses

Read at the pinned tag (`v1.12.1.1`), for the solver's refusal gate (`src/solver/gate.ts`), which refuses a fight a
reload of its save would not rebuild.

**Doubles.** A session save carries no double flag. `newBattle(fromSession)` decides it from the save
(`src/battle-scene.ts:1320-1366`): a wild battle is double when `enemyParty` holds more than one mon, a trainer battle
when its config is `doubleOnly`, or `hasDouble` with the trainer's `DOUBLE` variant, and a Mystery Encounter never. A
save whose trainer carries `DOUBLE` with neither is loaded single (`:1338-1344`), and a `doubleOnly` trainer saved
without `DOUBLE` is given it (`:1345-1352`). That answer then passes through `checkIsDouble` (`:1280`, `:1484`), which
keeps a final wave and an Endless boss single whatever the save says (`:1491-1498`). Every `doubleOnly` config is a
generic trainer (`src/data/trainers/trainer-config.ts`, `setDoubleOnly`), and the live game gives each one `DOUBLE`
(§16), so on a save the live game wrote the variant alone tells a trainer's double from its single.

**Mystery Encounters.** `mysteryEncounterType` is `-1` on a save from a wave with no encounter
(`src/system/game-data.ts:782`, `src/@types/save-data.ts:69`), and `getNewBattleProps` reads `-1` as none
(`src/battle-scene.ts:1334`).

**Arena tags.** A save keeps only the `SerializableArenaTag` instances on the field: `ArenaData`'s constructor drops
every other tag (`src/system/arena-data.ts:32-35`), both when the save is written (`src/system/game-data.ts:769`) and
when it is read back (`:1155`). `SafeguardTag` extends plain `ArenaTag` (`src/data/arena-tag.ts:1340`), so Safeguard is
never saved and a reload loses it. The type `SerializableArenaTagType` (`src/@types/arena-tags.ts:28-31`) includes
`SAFEGUARD`, being every `ArenaTagType` outside `NonSerializableArenaTagType`; the runtime `instanceof` is what decides.

**Items.** `loadSession` (`src/system/game-data.ts:864`, through `initSessionFromData`) rebuilds each saved item with
`toModifier(Modifier[className])` and skips a `null` without a word (`:990-1003`). `toModifier` returns `null` when no
modifier type is registered under the item's `typeId` (`getModifierTypeFuncById`,
`src/modifier/modifier-type.ts:2492`), and when building the item throws, as `Reflect.construct` does for a `className`
that `#modifiers/modifier` does not export (`src/system/modifier-data.ts:31-62`); that throw reaches only
`console.error` (`:58-60`). A stack above `getMaxStackCount()` is clamped to it (`:53-55`).

## 29. The wave-start save and the session export

Read at the pinned tag (`v1.12.1.1`), for the `session` command (`src/page/session.ts`) and the oracle's input.

**The session export.** `gameData.getSessionSaveData()` (`src/system/game-data.ts:759-786`) builds the session as it
stands: seed, game mode, both parties, both modifier lists, the arena, money, `waveIndex`, `battleType`, the trainer,
`gameVersion`, the challenges, the ME save data and more. It writes nothing: each `*Data` constructor and
`getSerializedDailyRunConfig` only read their source (`src/system/pokemon-data.ts:79-146`,
`src/system/modifier-data.ts:15-29`, `src/system/arena-data.ts:28-57`, `src/system/trainer-data.ts:12-23`,
`src/system/challenge-data.ts:9-13`, `src/data/daily-seed/daily-seed-utils.ts:65-82`). Some fields are the live
objects, not copies: `pokeballCounts`, `mysteryEncounterSaveData`, the arena's `weather`, `terrain` and
`positionalTags`, and each Pokémon's `stats` and `ivs`. Its JSON holds no `bigint`: `saveAll` stringifies it with no
replacer (`src/system/game-data.ts:1243`), which would throw on one. It reads `currentBattle.waveIndex`, so it throws
with no battle.

**The wave-start save.** On a wave it did not load, `EncounterPhase` and its subclasses (§26) generate the enemy side,
set new-biome weather and terrain, then call `saveAll(true, sync)`, all before `doEncounter` and so before any summon
(`src/phases/encounter-phase.ts:291-310`). `loaded` is set by Continue and Load Game (`src/phases/title-phase.ts:88-90`,
`:162-169`, `:204`, `:366`) and by a retry after a loss (`src/phases/game-over-phase.ts:100`); a loaded wave is not saved
again, so the copy stays the one that was loaded. Whatever its `sync`, `saveAll` writes the session to `localStorage`
under `getSessionDataLocalStorageKey(sessionSlotId)` (`src/system/game-data.ts:1241-1244`); `sync` only decides the
save icon and the server push after the write (`:1220-1222`, `:1248-1258`). It returns before the write only on a failed
user-info check, which `skipVerification` skips here (`:1196-1201`), or on failed system-data validation (`:1215-1217`).
`gameData.getSession(slot)` reads it back (`:788-816`), but it is async, and with the key missing on a real login it
fetches the save from the server and writes the key.

- **The key** is `sessionData${slotId || ""}_${loggedInUser?.username}` (`src/account.ts:59-67`), so slot 0 has no
  digit; under `bypassLogin` the user is `Guest` (`:22-28`). `loggedInUser` is a module binding (`:6`). Nothing on the
  scene stores the username as data: it appears only inside display text, such as the title screen's `usernameLabel`
  (`src/ui/handlers/title-ui-handler.ts:47-59`), and not at all under `hideUsername`.
- **Who clears it.** Log Out removes only the session cookie (`src/ui/handlers/menu-ui-handler.ts:693-704`,
  `src/api/account-api.ts:83-95`). `clearLocalData` removes only the current account's keys
  (`src/system/game-data.ts:570-578`), so one browser can hold a copy per account per slot. It runs at login unless the
  cached system is newer than the server's (`:409-417`), and from `reinitializeSaveData` (`:585-594`): on failed
  validation, or when the server calls the save out of date, which can happen right after this save's write (`:566`,
  `:1265-1268`).
- **The encryption.** `encrypt(data, bypassLogin)` (`src/utils/data.ts:49-54`) is crypto-js 4.2.0's
  `AES.encrypt(data, saveKey).toString()`. `saveKey` (`src/constants.ts:57`) is a string, so crypto-js takes it as a
  passphrase: the output is Base64 of `Salted__`, a random 8-byte salt and the ciphertext, with key and IV from
  EVP_BytesToKey over MD5, one iteration, and AES-256-CBC with PKCS#7. The salt is new on every call, so the same
  session never encrypts the same way twice. With `bypassLogin` (`VITE_BYPASS_LOGIN=1`, which dev and app builds set,
  `src/constants/app-constants.ts:21`) it is `btoa(encodeURIComponent(data))` instead.

## 30. The session save, and what a reload resets mid-fight

Read at the pinned tag (`v1.12.1.1`), for the `extras` read (`src/page/extras.ts`).

**What the save never carries.** `getSessionSaveData()` writes each mon through `new PokemonData(p)`
(`src/system/game-data.ts:766`). None of these are in it, and a reload starts each one fresh:

- `Battle.turn` (`src/battle.ts:70`): `newBattle` → `incrementTurn` sets it to 1 (`src/battle-scene.ts:1305`,
  `src/battle.ts:173-178`).
- `enemySwitchCounter` (`:69`), the AI's switch damping (§7); `lastMove` (`:80`), which Copycat reads
  (`src/data/moves/move.ts:8080`); `enemyFaints` (`battle.ts:95`), which Last Respects (`move.ts:12419`) and Supreme Overlord
  (`src/data/battler-tags.ts:3867`) count.
- `playerFaintsHistory` and `enemyFaintsHistory` (`battle.ts:96-97`). An entry is `{ pokemon, turn }` (`:50-53`), and
  `pokemon` is the live mon: a Phaser container, circular. Its readers take only `pokemon.id` (`Trainer.shouldTera`,
  `src/field/trainer.ts:779`) and `turn` (Retaliate, `move.ts:11118-11122`).
- `EnemyPokemon.initialTeamIndex` (`src/field/pokemon.ts:6582`). The constructor sets it to the party's length so far
  (`:6611`), and a reload builds the party in its saved slot order (`src/system/game-data.ts:939-945`), so the index
  becomes the slot. That is wrong once a switch has swapped slots (`src/phases/switch-summon-phase.ts:190-191`).
  Trainer instant Tera keys on it (`trainer.ts:778`).
- `EnemyPokemon.bossSegmentIndex` (`pokemon.ts:6581`). Only `bossSegments` is saved, and `setBoss` starts the index on
  a full set of bars (`:6697-6708`). It is `undefined` on a mon that is not a boss (§3).
- `summonData.turnCount` and `summonData.waveTurnCount`, both starting at 1 (`src/data/pokemon-data.ts:161`, `:168`).
  The save's copy of `summonData` holds them, but its `toJSON` writes both as `undefined` (`:265-266`), so neither
  reaches the save. `waveData` (`pokemon.ts:292`): `endured`, `abilityRevealed`, and `abilitiesApplied`, a `Set`
  (`pokemon-data.ts:308-320`). `PokemonWaveData` has no `toJSON`, so the Set serializes as `{}`.
- The global `Phaser.Math.RND` state. A reload sows it again (`game-data.ts:890-891`, `battle-scene.ts:1263`).
  `RND.state()` reads it as a `"!rnd,…"` string, and given that string sets it.
- `Battle.battleSeedState` (`battle.ts:82`; private to TypeScript only), the battle stream's carry-over (§11,
  `battle.ts:486-504`). **It is not always null at a command.** `incrementTurn` clears it (`:177`), but `TurnEndPhase`
  draws from the battle stream after that: Mini Black Hole (`src/modifier/modifier.ts:3194`, `:3211`) and Moody
  (`src/data/abilities/ab-attrs.ts:4332`, `:4341`). So it can be set at the next `CommandPhase`.
- Every arena tag that is not a `SerializableArenaTag`, Safeguard among them (§28). The live tags are `Arena.tags`
  (`src/field/arena.ts:67`), each with a `tagType`, an `ArenaTagType` string, and a `side`, an `ArenaTagSide`
  (`src/data/arena-tag.ts:119`, `:125`).

**What the save carries and a reload resets.**

- The on-field enemy's `summonData`. `EncounterPhase` calls `fieldSetup(true)` on the enemy's field slots even on a load
  (`src/phases/encounter-phase.ts:143-146`). That calls `resetSummonData()` (`pokemon.ts:5341-5357`), which replaces
  `summonData`, its turn counts included. Ours is kept.
- The toxic counter, `status.toxicTurnCount` (`src/data/status-effect.ts:6-19`). A trainer reload summons the enemy
  again (`encounter-phase.ts:447-449`), and `PostSummonPhase` zeroes the counter
  (`src/phases/post-summon-phase.ts:18-20`). It then applies pending heals and entry hazards a second time (`:22-24`).
- A foe's `teraType` (`src/system/pokemon-data.ts:123`, restored at `src/field/pokemon.ts:395`). A trainer battle runs
  `trainer.genAI(enemyParty)` on a load too, with no `loaded` guard, after the party is rebuilt in its saved order
  (`src/phases/encounter-phase.ts:287-289`, `src/system/game-data.ts:939-945`). `setRandomTeraModifiers` then gives
  `party[slot]` the specialty type by its position in that array (`src/data/trainers/trainer-config.ts:516-533`). A
  gym leader's slot is -1, the last (`:699-702`; Giovanni -2, Clair -3), and it Teras only from wave 100 (`:65`). Once a
  switch has swapped slots (`src/phases/switch-summon-phase.ts:190-191`), the reload gives that type to whichever mon
  now sits there. Nothing on the load path puts the saved type back.

**How the save copies summon data.** `new PokemonData(p)` copies it with `new PokemonSummonData(p.summonData)`
(`src/system/pokemon-data.ts:139`). That copy constructor keeps only the `SerializableBattlerTag`s
(`src/data/pokemon-data.ts:212-217`), and rebuilds the Set and the moveset. The copy's `toJSON` writes species
forms as `{ id, formIdx }`, an illusion's species as its id, and the Set as an array (`:239-275`). A load reads that
shape back through the same constructor. A bare `JSON.stringify(p.summonData)` goes through `toJSON` too, so it drops
`turnCount` and `waveTurnCount` as well, but keeps the tags a load drops.

**Identity.** `Pokemon.id` (`src/field/pokemon.ts:199-201`) is saved (`src/system/pokemon-data.ts:19`) and restored as
it was (`pokemon.ts:357-358`), so it names the same mon on both sides of a reload. The saved party order is the order
after any switches.

## 31. Loading a save from an older game: the session migration

Read at the pinned tag (`v1.12.1.1`), for the pin bump's harness re-check (`scripts/recheck/recheck.ts`), which
replays a known fight's save on a newer game.

**When it runs.** `parseSessionData` runs `applySessionVersionMigration` on the raw `JSON.parse` result before it
builds any `PokemonData`, `TrainerData` or modifier data (`src/system/game-data.ts:1106-1175`); every session read
goes through it, `getSession` included (`:798`, `:815`). The migration acts only when the save's `gameVersion` is
lower than `package.json`'s `version` (`src/system/version-migration/version-converter.ts:4`, `:62`, `:154-157`). A
missing or non-string `gameVersion` skips it with a `console.warn` (`:150-153`), and `compareVersions` throws on a
string that is not `N.N.N` or `N.N.N.N` (`src/utils/migrator-utils.ts:60-65`).

**What it does.** It floors `money` (`version-converter.ts:159`), throws `SessionMigrationError` unless `party` is an
array of non-null objects (`:161-163`, `migrator-utils.ts:6-8`), turns a null `enemyParty` into `[]` and throws on any
other non-array (`:166-171`). It then runs, oldest first (`:114`, `:209-211`), each session migrator whose version is
strictly above the save's (`:219-224`): `migrateModifiers` and `migrateCustomPokemonData` (1.0.4), `migrateTera`
(1.7.0), `migratePartyData` (1.9.0), `fixMoveHistory` (1.10.0), and `migrateRageFistHitCount`,
`convertCustomPokemonDataTypes`, `shiftFormChangeItems` and `migrateSpeciesSplitSession` (1.12.0.0) (`:97-103`,
`versions/v1_12_0_0.ts:322-327`). 1.12.1.0 adds only a settings and a system migrator (`versions/v1_12_1_0.ts:441`,
`:461`), so a session saved on 1.12.0.0 or later runs no session migrator, only the checks above. Nothing on that path writes `gameVersion`: a migrated save keeps its old one until
`getSessionSaveData()` writes `globalScene.game.config.gameVersion` (`game-data.ts:779`).

**Which version a save reports.** That config value is `package.json`'s `version` in the game (`src/main.ts:8`, `:82`)
and in the test framework, whose `GameWrapper` sets `game.config.gameVersion` to it (`test/framework/game-wrapper.ts:7`,
`:77-80`). So a save exported from either reports the version of the clone it came from.

**No version gate.** Neither `loadSession` nor `initSessionFromData` checks the version (`game-data.ts:864-899`). A
session from a newer game skips the migration and loads as is. The only "out of date" refusal guards system data, in
`initSystem`, and not under dev or beta (`:441-449`). A `SessionMigrationError` on Load Game reaches
`TitlePhase`'s catch, which shows `failedToLoadSession` (`src/phases/title-phase.ts:201-212`).

## 32. The reward screen's party check: reordering, and who leads the next wave

Read at the pinned tag (`v1.12.1.1`), for the rewards card's lead advice (`51-lead.js`) and the play skill's reorder.
Switch is new in 1.12.1.0: the v1.12.0.11 clone has no `PartyOption.SWITCH`.

**Opening it.** The shop's bottom row (row 0 in Coachemon's `read_menu`), column 2, is Check Team (`checkTeam` in
`locales/en/modifier-select-ui-handler.json`). It opens the party screen in `PartyUiMode.CHECK` over the shop with
`setModeWithoutClear` (`src/phases/select-modifier-phase.ts:107-110`), and leaving it runs `resetModifierSelect`
(`:402-410`), which re-opens the shop on the same `typeOptions`: nothing is re-rolled.

**Switch.** In CHECK mode a picked member's options gain Switch at index 1 when the party has two or more members
(`src/ui/handlers/party-ui-handler.ts:1536-1540`). Its label is `toTitleCase(PartyOption[option])`, so it is "Switch"
in every language (`:1665-1671`).
- Choosing it marks the member (`startPartySwitch`, `:1800-1807`) when `isSwappable` holds (`:979-988`), which asks
  only `canSwitch()`: a member on the field that is `FRENZY`, trapped or `COMMANDED` refuses with `cannotSwitch` (§9).
  Fainted members are not refused.
- ACTION on another slot swaps the two `getPlayerParty()` entries at once, with no confirm (`swapPartyMembers`,
  `:992-1001`, `:1825-1835`). ACTION on the marked slot clears the mark (`:994-995`).
- While a member is marked, ACTION on Cancel (slot 6) does nothing (`:1007-1012`), and CANCEL only clears the mark
  (`processPartyCancelInput`, `:1069-1075`). The next CANCEL leaves.

**Who leads.** The field is the front of the party: `getPlayerField` is slot 0, and slot 1 in a double
(`src/battle-scene.ts:731-736`). A member sent out that is not allowed in battle, fainted or barred by a challenge, is
swapped with the first allowed member after it (`SummonPhase.preSummon`, `src/phases/summon-phase.ts:37-64`), so a wave
opens on the first one or two allowed members in party order. After the shop, `doPostBattleCleanup` queues
`PartyReorderSwitchPhase` (`src/battle-scene.ts:1535-1553`), which brings the party's new front onto the field
(`src/phases/party-reorder-switch-phase.ts:38-48`). A trainer battle offers no free switch before its first turn (§9),
so the reward screen is the only free place to choose a trainer fight's opener.
