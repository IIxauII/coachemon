Quotes below are from `pagefaultgames/pokerogue` (https://github.com/pagefaultgames/pokerogue), tag `v1.12.0.11`, AGPL-3.0-only, Copyright Pagefault Games and contributors.

# PokéRogue game-code spec for the coach HUD

The game code the coach HUD (`skills/coachemon/scripts/hud/`) calls, replays or re-implements, read from the
**pinned source**: `pagefaultgames/pokerogue` tag `v1.12.0.11`, commit `e4e9b5383be7c9e171d32a9daaea2658d475c521`
(the pin in `src/escape-ladder/reviewed.json`). `npm run drift:check` clones it to `.cache/pokerogue/v1.12.0.11`.

**Citations.** `src/path/file.ts:LINE` is a line at that commit, i.e.
`https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/path/file.ts#LLINE`.
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
| Switching | §9 free switches, §18 switch-in cost |
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
   (`src/data/abilities/ab-attrs.ts:116`), and every `CancelInteractionAbAttr` (`:199`) keeps that default.
   These call sites leave `simulated` out:
   - `Move.hitsSubstitute` → Infiltrator (`src/data/moves/move.ts:493`). Reached from `getMoveEffectiveness` for
     status moves (`src/field/pokemon.ts:2556`) and from `FormBlockDamageAbAttr.canApply` (`src/data/abilities/ab-attrs.ts:5441`).
   - `WeakenMoveScreenTag.apply` → Infiltrator (`src/data/arena-tag.ts:380`). `Pokemon.isSafeguarded` does the same (`src/field/pokemon.ts:5107`).
   - `getEffectiveWeatherForMove` → `PreAttackWeatherOverrideAbAttr`, i.e. Mega Sol (`src/data/weather.ts:235`).
     Reached from `getWeatherMultiplierForMove` (`:260`) and from `getEffectiveStat` with `forDefend` (`src/field/pokemon.ts:1516-1519`).
   - `getAccuracyMultiplier`, on every ability call (`src/field/pokemon.ts:3347-3400`).
   - `getCritStage` → Super Luck (`:1422`). `getCriticalHitResult` → Merciless, Battle Armor (`:3829`, `:3840`).
   - `OneHitKOAttr.getCondition` → Sturdy's `BlockOneHitKOAbAttr`, flyout included (`src/data/moves/move.ts:3680`).
   - `ForceSwitchOutAttr.getSwitchOutCondition` / `getFailedText` → `ForceSwitchOutImmunityAbAttr`, flyout included (`:7556`, `:7511`).
   - `failIfDampCondition` → `FieldPreventExplosiveMovesAbAttr`. This one is simulated only while the current phase
     is `EnemyCommandPhase`. Otherwise it queues a flyout and a "cannot use" message (`src/data/moves/move-condition.ts:206-218`).
   - `Pokemon.canSetStatus` → `IgnoreTypeStatusEffectImmunityAbAttr` (`src/field/pokemon.ts:4808`).
   - `getBerryPredicate` → `ReduceBerryUseThresholdAbAttr` (`src/data/berry.ts:43-61`).

   Muting stops the queued flyouts and messages. It does **not** undo the `abilitiesApplied` writes, and those are
   read by `getOncePerBattleCondition` (`src/data/abilities/init-abilities.ts:2218-2220`) and Battle Bond (`:1459`).
2. **Battle RNG.** `Battle.randSeedInt` (`src/battle.ts:491-509`) returns `min` without drawing when `range ≤ 1`.
   Otherwise it:
   - loads `battleSeedState`, or sows `shiftCharCodes(battleSeed, turn << 6)` when that is null;
   - draws;
   - stores the new `battleSeedState`;
   - puts back the global `RND.state()` and `rngSeedOverride`, with no try/finally.

   The callers are `BattleScene.randBattleSeedInt` (`src/battle-scene.ts:1126`) and `Pokemon.randBattleSeedInt`
   (`src/field/pokemon.ts:5638`). Draws on HUD paths:
   - `getMoveTargets` for `RANDOM_NEAR_ENEMY` (Outrage, Thrash) with 2+ opponents (`src/data/moves/move-utils.ts:94-95`).
     Reached from `getAttackDamage` (`src/field/pokemon.ts:3654`). Also reached from `canBeMultiStrikeEnhanced`, but
     only with `restrictSpread = true` (`src/data/moves/move.ts:1340-1341`): Parental Bond's hit-count and last-strike checks.
   - `ProtectAttr.getCondition` after a streak of successful protects: `randBattleSeedInt(3 ** n)` (`:6949`).
   - `ShellSideArmCategoryAttr.apply` on a physical/special tie (`:5736`).
   - `RandomLevelDamageAttr.getDamage`, i.e. Psywave (`:2149`).
   - `getCriticalHitResult` (`src/field/pokemon.ts:3836`).
   - `EnemyPokemon.getNextMove` (`:6606`, `:6756`, `:6766`) and `getNextTargets`, which draws only when the target
     weight sum is above 1 (`:6874`).
3. **Global RNG and the phase queue.** `PresentPowerAttr.apply` (`src/data/moves/move.ts:5157-5186`) calls `randSeedInt`
   directly, which is `Phaser.Math.RND.integerInRange` (`src/utils/common.ts:101-106`). On the heal branch it also
   writes `user.turnData.hitCount = hitsLeft = 1` and calls `unshiftNew("PokemonHealPhase")`. That applies even
   when simulated. It's reached from `calculateBattlePower` (`move.ts:1102`) and `AttackMove.getTargetBenefitScore` (`:1434`).

   `executeWithSeedOffset` (`src/battle-scene.ts:2045-2059`) is used by Magnitude (`move.ts:4996`), `DoublePowerChanceAttr`
   (`:4716`) and the `sortInSpeedOrder` shuffle (`src/utils/speed-order.ts:35`). It saves and restores `RND.state()`,
   `rngOffset` and `rngSeedOverride`, with no try/finally. Its draws are seeded from `waveSeed` and `turn << 6`, so one
   sandboxed call returns this turn's actual Magnitude or Fickle Beam result.
4. **turnData writes.** `FullHpResistTypeAbAttr.apply` (Tera Shell) sets `turnData.moveEffectiveness = 0.5` even when
   simulated (`src/data/abilities/ab-attrs.ts:546-549`). `getMoveEffectiveness` returns that cached value before
   anything else (`src/field/pokemon.ts:2487-2489`). Only `MoveEffectPhase` (`src/phases/move-effect-phase.ts:898`)
   or a fresh `PokemonTurnData` clears it. The multi-hit math also needs the HUD to set `hitCount`/`hitsLeft`
   itself (§2).

Benign writes:
- The `RepeatMoveAttr` condition stores `this.movesetMove` on the shared attr (`src/data/moves/move.ts:8338`).
- `EnemyPokemon.getNextMove` splices or replaces `summonData.moveQueue` (`src/field/pokemon.ts:6570`, `:6576`).
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

Called on the **defender** (`src/field/pokemon.ts:3559-3819`):
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

1. **Category.** `VariableMoveCategoryAttr`: Photon Geyser, Shell Side Arm (`:3574`).
2. **Effectiveness.** The call runs `effectiveness ?? this.getMoveEffectiveness(source, move, ignoreAbility, simulated, cancelled)` (`:3589-3590`).
   If the move is cancelled or the multiplier is 0, it returns `{ result: move is Sheer Cold ? IMMUNE : NO_EFFECT, damage: 0 }` (`:3594-3600`).
   `getMoveEffectiveness` (`:2479-2561`) covers:
   - the cached `turnData.moveEffectiveness`, checked first;
   - `getAttackTypeEffectiveness` (`:2569-2631`): Stellar, grounded Flying against Ground, Scrappy/Foresight,
     `MoveTypeChartOverrideAttr` (Freeze-Dry), and strong winds (its message is queued only when not simulated);
   - `move.isTypeImmune`, and Tar Shot ×2 for Fire;
   - `TypeImmunityAbAttr` (Levitate, Volt Absorb, Flash Fire, Wonder Guard…). Their heal, stat boost or tag happens
     only when not simulated (`src/data/abilities/ab-attrs.ts:447`, `:479`, `:504`);
   - `MoveImmunityAbAttr`;
   - the ally's Dazzling-family `FieldPriorityMoveImmunityAbAttr`, checked **only** when simulated;
   - `TypeImmuneTag`;
   - Tera Shell;
   - Substitute blocking status moves.

   `ignoreAbility` skips the defender's ability steps.
3. **Fixed damage and OHKO.**
   - `FixedDamageAttr` (`:3604`) returns `{ EFFECTIVE, toDmgValue(fixed × Multi-Lens factor) }` (`:3605-3621`). This
     happens **before** the Sturdy step below, so at this pin a fixed-damage hit — Seismic Toss, Night Shade, Super
     Fang, Dragon Rage, Final Gambit, and Psywave through `RandomLevelDamageAttr extends FixedDamageAttr`
     (`src/data/moves/move.ts:2143`) — takes a full-HP Sturdy mon down. Upstream
     [#7620](https://github.com/pagefaultgames/pokerogue/pull/7620) reorders this and is on the game's master,
     unreleased: it is the live build's version that decides, which is why `hud/10-damage.js` keys the rule on a
     version constant rather than picking a side.
   - `OneHitKOAttr.apply` (`:3626`; `src/data/moves/move.ts:3667-3676`) returns `{ ONE_HIT_KO, damage: this.hp }`.
     A boss is `isBossImmune`, so it falls through to the normal formula. The level check and Sturdy's block live in
     the attr's condition, not here.
4. **Base.** `getBaseDamage` (`src/field/pokemon.ts:3413-3474`) returns `(2·L/5 + 2) × power × Atk / Def / 50 + 2`,
   unfloored:
   - power is `move.calculateBattlePower(source, this, simulated)`;
   - Atk is `source.getEffectiveStat(phys ? ATK : SPATK, { opponent, isCritical, simulated, … })`, then
     `VariableAtkAttr` (Foul Play, Body Press);
   - Def is `this.getEffectiveStat(phys ? DEF : SPDEF, { …, forDefend: true })`, then `VariableDefAttr` (Psyshock).

   `getEffectiveStat` (`:1456-1572`) applies, in order:
   - `StatBoosterModifier` items;
   - field `FieldMultiplyStatAbAttr` (the Ruin abilities);
   - the mon's own `StatMultiplierAbAttr` (Huge Power, Hustle, Marvel Scale);
   - the ally's `AllyStatMultiplierAbAttr`;
   - `getStatStageMultiplier` (`:3276-3322`): a crit ignores the attacker's drops and the defender's boosts;
     Unaware's `IgnoreOpponentStatStagesAbAttr` or Chip Away's `IgnoreOpponentStatStagesAttr` zero the stages;
     `TempStatStageBoosterModifier` applies X items; the result is capped at ×4;
   - Slow Start;
   - Snow ×1.5 Def for Ice and Sandstorm ×1.5 SpD for Rock (with `forDefend`, the weather is the one after the
     attacker's Mega Sol);
   - Speed only: Tailwind, Grass/Water Pledge, paralysis, Unburden;
   - `HighestStatBoostTag` (Protosynthesis, Quark Drive);
   - finally `max(floor(x), 1)`.
5. **Power.** `Move.calculateBattlePower` (`src/data/moves/move.ts:1095-1189`) defaults to `simulated = false`, so pass
   `true` when calling it directly. In order:
   - `VariablePowerAttr` (Knock Off, Facade, Gyro Ball, Acrobatics, Hex, Triple Axel, Magnitude, Present…);
   - `VariableMovePowerAbAttr` (Technician, -ate abilities, Tough Claws, Strong Jaw, Blaze family, Punk Rock…);
   - the ally's `AllyMoveCategoryPowerBoostAbAttr`;
   - a Tera floor of 60 power: the Tera type equals the base move type, priority ≤ 0, the move isn't multi-hit, and
     the user has no Multi-Lens;
   - field auras and `UserFieldMoveTypePowerBoostAbAttr`;
   - `TypeBoostTag` (Charge);
   - `WeakenMoveTypeTag` (Mud Sport, Water Sport);
   - `AttackTypeBoosterModifier`: `floor(power × (1 + stacks × 0.2))` (`src/modifier/modifier.ts:1475-1478`, `src/constants.ts:21`);
   - Helping Hand ×1.5, then Supreme Overlord;
   - terrain ×1.3 for a grounded user (`src/field/arena.ts:507-518`);
   - Misty Terrain ×0.5 on Dragon moves into a grounded target.

   Charge, the Sports, type boosters and Misty key on the base type after `MoveTypeChangeAbAttr` only, **not** after
   `VariableMoveTypeAttr`. So Hangry Aura Wheel still checks Electric boosters. Terrain uses the full `getMoveType`.
6. **Main product** (`src/field/pokemon.ts:3651-3745`). `toDmgValue` (`max(floor(x), 1)`, `src/utils/common.ts:403-405`) of
   base × each of these:
   - **spread** 0.75 when `getMoveTargets` says `multiple` with 2+ targets;
   - **Multi-Lens / Parental Bond factor** (`PokemonMultiHitModifier`);
   - **weather** from `getWeatherMultiplierForMove` (`src/data/weather.ts:259-291`): sun/rain 1.5 or 0.5, and 1.5 for
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

   STAB comes from `calculateStabMultiplier` (`src/field/pokemon.ts:3492-3521`):
   - 1 for Struggle;
   - +0.5 if `getMoveType` is one of the user's non-Tera types (not Stellar);
   - `CombinedPledgeStabBoostAttr`;
   - Adaptability +0.5 when STAB already applies;
   - Tera: +0.5 for the Tera type; Stellar gives +0.5 or +0.2 once per type;
   - capped at 2.25.
7. **Post steps** (`:3747-3787`), each re-floored:
   - `MoveDamageBoostAbAttr`: Tinted Lens ×2, Parental Bond ×0.25 on the last strike, and Unseen Fist / Piercing Drill
     ×0.25 through Protect (`src/data/abilities/init-abilities.ts:768`, `:1246`, `:1802`, `:2170`);
   - Damage Booster token when the attacker is an enemy: `× 1.05^stacks`;
   - Damage Reducer token when the defender is an enemy: `× 0.975^stacks` (`src/modifier/modifier.ts:3436-3437`, `:3450`, `:3473`);
   - the defender's `ReceivedMoveDamageMultiplierAbAttr`: Multiscale, Fur Coat, Fluffy, Filter / Solid Rock / Prism
     Armor, Punk Rock, Disguise / Ice Face, and Thick Fat / Heatproof through the `ReceivedTypeDamageMultiplierAbAttr`
     subclass (`src/data/abilities/ab-attrs.ts:372`);
   - Friend Guard (doubles only);
   - `ModifiedDamageAttr`: False Swipe's `min(damage, hp − 1)` (`src/data/moves/move.ts:2168`);
   - at full HP, `PreDefendFullHpEndureAbAttr` (Sturdy). It **adds the `STURDY` tag only when not simulated**
     (`src/data/abilities/ab-attrs.ts:293-307`) and never lowers the damage. `Pokemon.damage` honours the tag
     (`src/field/pokemon.ts:3873-3875`).
8. **Result**, from effectiveness (`:3796-3812`): ≥4 is EXTREMELY_EFFECTIVE, ≥2 SUPER_EFFECTIVE, ≤0.25
   MOSTLY_INEFFECTIVE, ≤0.5 NOT_VERY_EFFECTIVE, anything else EFFECTIVE.

**What `simulated: true` changes:**
- The roll is fixed at 1, so the call returns the **max roll** (`:3683`) — and it is the *finished* max roll, with
  step 7's multipliers and `ModifiedDamageAttr`'s cap already applied to it. A caller that wants the other 15 rolls
  cannot take 85–100 % of that number and be right: the multipliers commute with the roll only to within a HP of
  rounding, and a cap doesn't commute at all (False Swipe's `min(damage, hp − 1)` lands on every roll alike). The
  roll can be re-asked of the game instead, by scaling `calculateStabMultiplier` (`:3492`, `:3686`): it is a factor
  of the same product under the same `toDmgValue`, and reads nothing off the mon it is called on.
- No strong-winds message.
- Flash Fire's tag, Volt Absorb's heal and Sturdy's tag are skipped.
- `FormBlockDamageAbAttr.apply` returns early (`src/data/abilities/ab-attrs.ts:5445-5448`), so simulated damage
  **ignores Disguise and Ice Face**.

Crit isn't rolled; it's the `isCritical` input. Nothing is consumed and no berries trigger.

**Not in `getAttackDamage` at all:**
- Focus Band, Sturdy survival and the enemy endure token (`Pokemon.damage`, `src/field/pokemon.ts:3863-3880`);
- boss segments (`EnemyPokemon.damage`);
- berries.

Life Orb, Choice items, Expert Belt and Focus Sash don't exist: there's no key for them in `modifierTypeInitObj`
(`src/modifier/modifier-type.ts:1812`). §8 lists the held items that do.

**Random roll:** `randBattleSeedIntRange(85, 100) / 100` gives 16 uniform values. No call gives the min roll without
drawing RNG. Scaling the max (`floor(max × r)`) is off by a few HP, because the post steps re-floor. It is structurally
wrong for False Swipe, whose cap comes after the roll.

**Per hit:** the call computes **one hit**. The Multi-Lens factor reads `source.turnData` (`src/modifier/modifier.ts:2762-2776`):
- if `hitsLeft === hitCount` (the first strike): ×(1 − 0.25 × stacks);
- else if `hitCount − hitsLeft ≠ stacks + 1`: ×0.25;
- otherwise (Parental Bond's strike): ×1.

`TurnInitPhase` resets turnData (`src/phases/turn-init-phase.ts:65`, `src/field/pokemon.ts:5205-5207`) to `hitCount 0,
hitsLeft −1, moveEffectiveness null` (`src/data/pokemon/pokemon-data.ts:333`, `:340`, `:348`). So at the command
prompt:
- Triple Axel reads its hit-1 power;
- a Multi-Lens holder gets **×0.25**, fixed damage included;
- the enemy AI's KO check has the same quirk (`src/field/pokemon.ts:6643`).

Set turnData explicitly (§2).

**Crit.** `getCriticalHitResult` (`:3821-3848`) works like this:
1. It never crits with `FixedDamageAttr`.
2. A crit is forced by `CritOnlyAttr`, `ConditionalCritAbAttr` (Merciless into a poisoned target), the `ALWAYS_CRIT`
   tag, or stage ≥ 3.
3. Otherwise it rolls `randBattleSeedInt([24, 8, 2, 1][clamp(stage, 0, 3)]) === 0`.
4. `BlockCritAbAttr` (Battle Armor, Shell Armor) or a `NoCritTag` (Lucky Chant) on the defender's side or both sides
   cancels it (`src/field/arena.ts:702`).

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
- `atk.getMoveType(move)` (`src/field/pokemon.ts:2433`, §4) is pure: `MoveTypeChangeAbAttr` gets `simulated = true`.
- `def.getMoveEffectiveness(atk, move, ignoreAbility, true)`.
- `move.calculateBattlePower(atk, def, true)`.
- `atk.getEffectiveStat(stat, { opponent: def })` is pure, unless `forDefend` is set against a Mega Sol user.

---

## 2. Multi-hit

A use's hit count is fixed once, on its first `MoveEffectPhase` (`turnData.hitsLeft === -1`, the fresh `PokemonTurnData` value, `src/data/pokemon/pokemon-data.ts:333-340`), in this order (`src/phases/move-effect-phase.ts:148-158`): `MultiHitAttr` → Parental Bond (`AddSecondStrikeAbAttr`) → Multi-Lens (`PokemonMultiHitModifier`), then `turnData.hitCount = turnData.hitsLeft = n`. — draws battle RNG (2–5 roll); writes `turnData.hitCount`/`hitsLeft`, the attr's `multiHitType`, and `abilitiesApplied` (both ability calls are non-simulated).

**`MultiHitAttr`** (`src/data/moves/move.ts:2946`). `apply` (`:2974-2981`) runs `ChangeMultiHitTypeAttr` on the intrinsic type, stores the result in `this.multiHitType` (a write on the shared move object), then calls `getHitCount` (`:2995-3027`):
```ts
case MultiHitType.TWO_TO_FIVE: {
  const hitValue = new NumberHolder(user.randBattleSeedInt(20));
  applyAbAttrs("MaxMultiHitAbAttr", { pokemon: user, hits: hitValue });
  // >= 13 → 2, >= 6 → 3, >= 3 → 4, else 5
```
— draws battle RNG (TWO_TO_FIVE only); the ability call writes `abilitiesApplied`. Other types are pure.

`MultiHitType` (`src/enums/multi-hit-type.ts:1-7`): `TWO`=0, `TWO_TO_FIVE`=1, `THREE`=2, `TEN`=3, `BEAT_UP`=4. A bare `MultiHitAttr` is TWO_TO_FIVE (`move.ts:2955`).
- TWO_TO_FIVE: P(2)=P(3)=7/20, P(4)=P(5)=3/20, mean 3.1. Skill Link's `MaxMultiHitAbAttr` sets the roll to 0 → 5 (`src/data/abilities/ab-attrs.ts:4789-4797`). The game has no Loaded Dice.
- TWO: Double Kick (`move.ts:9538`), Dual Wingbeat (`:12266`). THREE: Triple Kick (`:9968`, power 10, acc 90) and Triple Axel (`:12262`, power 20, acc 90), both `.attr(MultiHitPowerIncrementAttr, 3).checkAllHits()`. TEN: Population Bomb (`:12531`, `checkAllHits`). BEAT_UP (`:10284`): 1 for the user plus 1 per party member whose `status` is unset or NONE (`:3017-3025`).
- Type override: `WaterShurikenMultiHitTypeAttr` (`move.ts:3087-3094`, the only `ChangeMultiHitTypeAttr` subclass) makes it THREE when `species.speciesId === SpeciesId.BATTLE_BOND_GRENINJA` (2658) `&& formIndex === 1`. Pure.

**Extra strikes.** `Move.canBeMultiStrikeEnhanced(user, restrictSpread = false, target?)` (`move.ts:1335`) is false for charging moves, status moves, `MultiHitAttr` / `SacrificialAttr*` moves, Pollen Puff on an ally, and a fixed exception list; with `restrictSpread` it is also false when `getMoveTargets` returns more than one target. — pure, except that `getMoveTargets` draws battle RNG for `RANDOM_NEAR_ENEMY` with ≥ 2 opponents (`src/data/moves/move-utils.ts:94`).
- Parental Bond (`src/data/abilities/init-abilities.ts:1242-1252`): `AddSecondStrikeAbAttr` adds 1 if `canBeMultiStrikeEnhanced(user, true, target)` (`ab-attrs.ts:1436-1444`). Its `MoveDamageBoostAbAttr(0.25)` hits the strike where `hitCount > 1 && hitsLeft === 1`, i.e. the last one, as `toDmgValue(damage × 0.25)` (`ab-attrs.ts:1478-1480`), inside `getAttackDamage` (`src/field/pokemon.ts:3747-3755`).
- Multi-Lens (`src/modifier/modifier.ts:2702`, max 2 at `:2778`): `apply` (`:2721-2749`) needs `canBeMultiStrikeEnhanced(user)` with no spread restriction. The count goes up by the stack (`:2752`). Damage (`:2762-2776`): first strike ×(1 − 0.25·stack); later strikes ×0.25, except the one at `hitCount − hitsLeft === stack + 1`, which is left to Parental Bond. Pure.

**Per-strike power.** `MultiHitPowerIncrementAttr.apply` (`move.ts:5289-5296`): `power = move.power * (1 + ((hitCount − max(hitsLeft, 0)) % maxHits))`, so Triple Axel is 20/40/60. Pure; it reads `turnData`, and `hitsLeft` drops in `MoveEffectPhase.end` (`move-effect-phase.ts:880`). `BeatUpAttr` (`move.ts:4671`) uses the same index to pick the member whose Attack sets power.

**Accuracy and early stop.** `MoveEffectPhase.hitCheck` (`move-effect-phase.ts:410-416`): strikes after the first always hit, unless the move has `CHECK_ALL_HITS` (`1 << 16`, `src/enums/move-flags.ts:47`) and the user lacks `MaxMultiHitAbAttr`. If no target is hit, `conductHitChecks` sets `hitCount = hitsLeft = 1` (`move-effect-phase.ts:245-249`), which ends the use. `end()` queues another strike only while `--hitsLeft >= 1` and `getFirstTarget()` finds an active, unfainted target (`move-effect-phase.ts:880`, `:923-930`), so a faint also ends it.

**AI heuristics, not damage** (pure unless noted):
- `MultiHitAttr.calculateExpectedHitCount` (`move.ts:3040-3077`) gives 3.1 / 5 (max) / 2 / 3 / 10 / max(1, partySize/2). Its accuracy term, `Math.min((accuracy / 100) × accMultiplier, 100)` (`:3071`), caps at 100 instead of 1.
- `Move.calculateEffectivePower` (`move.ts:1268-1313`): Triple Kick/Axel get ×6 or `47.07 × power/10` (`:1294`); other multi-hit moves get expected hits × power; the result is divided by charge/recharge/delay turns. Given a `pokemon`, it tests the `maxMultiHit` holder object rather than its value (`:1288`, `:1298`), so the ×6 and plain power × accuracy branches always win. Its `VariableMovePowerAbAttr` call is non-simulated → writes `abilitiesApplied`.

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

`EnemyPokemon.damage(damage, ignoreSegments = false, preventEndure = false, ignoreFaintPhase = false)` (`src/field/pokemon.ts:6918-6954`):
```ts
const segmentSize = this.getMaxHp() / this.bossSegments;
let clearedBossSegmentIndex = this.isBoss() ? this.bossSegmentIndex + 1 : 0;
if (this.isBoss() && !ignoreSegments)
  [damage, clearedBossSegmentIndex] = calculateBossSegmentDamage(damage, this.hp, segmentSize, this.getMinimumSegmentIndex(), this.bossSegmentIndex);
if (globalScene.currentBattle.isClassicFinalBoss && this.formIndex === 0 && this.bossSegmentIndex < 1)
  damage = Math.min(damage, this.hp - 1);
```
Then comes `super.damage` (below). With `ignoreSegments`, the index is recomputed afterwards as `ceil(hp / segmentSize)`. `handleBossSegmentCleared` runs if the index dropped. — writes `hp` and `bossSegmentIndex`; queues phases; a wild boss's clear draws global RNG. `isBoss()` is `!!bossSegments` (`:6901`). `getMinimumSegmentIndex` (private, `:6956-6962`) is 1 for the classic final boss at form 0, else 0.

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
Here `toDmgValue(v) = max(floor(v), 1)` (`src/utils/common.ts:403`).

`ignoreSegments` is true for an OHKO move's hit (`isOneHitKo`, `src/phases/move-effect-phase.ts:669,687`) and for most indirect damage: weather chip (`src/phases/weather-effect-phase.ts:61`), recoil and self-KO (`move.ts:2249-2419`), and KO tags (`src/data/battler-tags.ts:966,2072`). Status chip calls `damage(…, false, true)` and **is** clamped (`src/phases/post-turn-status-effect-phase.ts:57`).

One hit deals at most `hp − segSize·idx` (down to the current boundary). The only exception is overflow past that boundary of at least `2^c · segSize` (c ≥ 1), which breaks `c` more segments, capped at `idx − minIdx`. A 2-segment boss at full HP H is one-shot only by a hit ≥ `H − round(H/2) + H` ≈ **1.5 × maxHp**; anything less stops at H/2. Each strike of a multi-hit move is clamped on its own and starts from the new index.

`handleBossSegmentCleared(segmentIndex)` (private, `pokemon.ts:6973-7014`) lowers `bossSegmentIndex` to `max(segmentIndex − 1, 0)`. **Wild** bosses (`!hasTrainer()`) get one stat raise per cleared segment. The stat comes from `weightedPick` over non-maxed effective stats, weighted by `getStat(s, false)` (`:6988`); `weightedPick` draws global RNG through `randSeedInt` (`src/utils/random.ts:60-62`). The raise is +1, or +2 on the segment that reaches index 0 (bosses with ≥ 3 segments) and on index 1 (≥ 5 segments) (`pokemon.ts:6997-7004`). The function always ends with `phaseManager.unshiftNew("StatStageChangePhase", …)` (`pokemon.ts:7008`); for trainer bosses `changes` is empty. Healing (berries, Leftovers) raises `hp` but never `bossSegmentIndex`, so HP above the current boundary is only buffer before the next clamp.

**Survival.** `Pokemon.damage` (`pokemon.ts:3863-3901`) checks these only when `!preventEndure && hp − damage <= 0`: the `ENDURING` tag (Endure), else the `STURDY` tag at `hp === maxHp`, else `ENDURE_TOKEN`, each lapsed when used. Failing those, `SurviveDamageModifier` (Focus Band, `src/modifier/modifier.ts:1520-1537`) saves on `randBattleSeedInt(10) < stack`, i.e. 10 % per stack (max 5), leaving 1 HP. Then `hp -= min(damage, hp)`, and a faint queues `FaintPhase` unless `ignoreFaintPhase`. — writes `hp`, lapses tags, draws battle RNG (Focus Band), queues messages/phases. `damageAndUpdate` passes `preventEndure = true` for INDIRECT results (`pokemon.ts:3933`), so none of these save from chip.
- The STURDY tag is only added by a non-simulated `getAttackDamage`, through `PreDefendFullHpEndureAbAttr` (full HP, maxHp > 1, damage ≥ hp; `ab-attrs.ts:293-307`) at `pokemon.ts:3786-3788`. `FixedDamageAttr` moves (Seismic Toss, Night Shade, Dragon Rage, Super Fang, Final Gambit, Psywave) return earlier (`:3602-3621`), so **at the pin Sturdy doesn't save from them**. OHKO moves return at `:3625-3633`; Sturdy blocks those separately with `BlockOneHitKOAbAttr`.
- Enemy Endure token (`EnemyEndureChanceModifier.apply`, `modifier.ts:3660-3670`) is rolled in `MoveEffectPhase.applyMoveDamage` whenever the enemy's **pre-clamp** damage ≥ `hp` (`move-effect-phase.ts:677-678`). It needs `!waveData.endured` and `randBattleSeedInt(100) < 2 × stack` (max 10 stacks); on success it adds `ENDURE_TOKEN` and sets `waveData.endured`. A boss hit the clamp would stop anyway can still spend it. — draws battle RNG; writes a tag and `waveData.endured`.

**Berries do not trigger on hit.** `BerryModifier` is applied only in `BerryPhase.eatBerries` (`src/phases/berry-phase.ts:33-82`), a turn-end phase that runs after `WeatherEffectPhase` and before `CheckStatusEffectPhase` (status chip) and `TurnEndPhase` (`src/phase-manager.ts:227-233`). The only other ways to eat one are Bug Bite / Pluck / Stuff Cheeks / Teatime (`EatBerryAttr`, `move.ts:3371`) and Cud Chew / Harvest. An opposing Unnerve (`PreventBerryUseAbAttr`) skips the phase for that mon (`berry-phase.ts:43-52`). Predicates (`getBerryPredicate`, `src/data/berry.ts:23-65`, pure):
- Sitrus: `getHpRatio() < 0.5`, with the ratio rounded to 0.01 (`pokemon.ts:1691-1693`), so 49.5 % doesn't trigger it. Enigma: any `turnData.attacksReceived` this turn with result SUPER_EFFECTIVE or EXTREMELY_EFFECTIVE. Both heal `toDmgValue(maxHp / 4)`, ×2 with Ripen (`DoubleBerryEffectAbAttr`), via `PokemonHealPhase` (`berry.ts:73-89`). They are separate modifiers, so both can fire in the same phase.
- Liechi–Salac: HP ratio below 0.25 (or Gluttony's `ReduceBerryUseThresholdAbAttr` value) and stat stage < 6. Lansat and Starf build the holder but compare against a literal 0.25 (`:46-57`), so Gluttony doesn't reach them. Leppa: any move at 0 PP.
- Each trigger eats one (`consumed`, `modifier.ts:1832-1846`) unless Berry Pouch saves it (`PreserveBerryModifier`: `randBattleSeedInt(10) < 3·stack`, `:1881-1882`). Max stacks: Sitrus / Lum / Enigma / Leppa 2, others 3 (`:1848-1853`).

---

## 4. Move type / power overrides

`Pokemon.getMoveType(move, simulated = true)` (`src/field/pokemon.ts:2433-2465`), called on the user, applies in order:
1. `VariableMoveTypeAttr`s, with target `null` (nothing target-dependent);
2. `MoveTypeChangeAbAttr` (-ate abilities, Normalize, Liquid Voice), skipped for `CallMoveAttr` moves;
3. Tera Blast while Terastallized, or a Stellar Tera Starstorm, returns here;
4. the Ion Deluge arena tag, then the `ELECTRIFIED` tag.

Pure, except through Weather Ball (below). Cost is trivial.

`VariableMoveTypeAttr` subclasses (`src/data/moves/move.ts`):
- `FormChangeItemTypeAttr` (Judgment / Multi-Attack by Arceus / Silvally form, `:5772`)
- `TechnoBlastTypeAttr` (Genesect drive form, `:5816`)
- `AuraWheelTypeAttr` (Morpeko or a Morpeko fusion: form 1 → Dark, else Electric, `:5860`)
- `RagingBullTypeAttr` (`:5894`), `IvyCudgelTypeAttr` (`:5932`)
- `WeatherBallTypeAttr` (`:5977`)
- `TerrainPulseTypeAttr` (grounded users only, `:6035`)
- `HiddenPowerTypeAttr` (IV parity, `:6082`)
- `TeraBlastTypeAttr` (`:6136`), `TeraStarstormTypeAttr` (`:6186`)
- `MatchUserTypeAttr` (Revelation Dance, primary type, `:6214`)
- `CombinedPledgeTypeAttr` (`turnData.combiningPledge`, `:6250`)

Only Weather Ball has a side effect. `getEffectiveWeatherForMove` (`src/data/weather.ts:233-250`) applies `PreAttackWeatherOverrideAbAttr` without `simulated`, which writes `waveData`/`summonData.abilitiesApplied` when it applies (`src/data/abilities/apply-ab-attrs.ts:73-76`). So call it in the sandbox. Hunger Switch flips Morpeko's form at turn end (`PostTurnFormChangeAbAttr`, not while Terastallized; `src/data/abilities/init-abilities.ts:1787-1792`), so Aura Wheel alternates; the move uses this turn's `formIndex`.

**Power.** `Move.calculateBattlePower(source, target, simulated = false)` (`move.ts:1095`) returns the final power the damage formula uses: `VariablePowerAttr`s, `VariableMovePowerAbAttr`, ally boosts, the Tera 60 floor, auras, `TypeBoostTag`, type-boost items, Helping Hand, Supreme Overlord, terrain (all items and abilities in §1 step 5). Pass `simulated = true`, because the default is false. The `VariablePowerAttr`s get no simulated flag:
- `PresentPowerAttr` (`:5157-5185`) draws `randSeedInt(firstHit ? 100 : 80)` from the **global** Phaser RND. 0–40 → 40, 41–70 → 80, 71–80 → 120, 81–99 → heals the target ¼, sets `hitCount = hitsLeft = 1` and queues `PokemonHealPhase`. So 41 / 30 / 10 / 19 %. — draws global RNG; writes `turnData`; queues a phase.
- `DoublePowerChanceAttr` (Fickle Beam, `:4716`) and `MagnitudePowerAttr` (`:4996`) roll inside `executeWithSeedOffset(…, turn << 6, waveSeed)`, a seed fork that restores Phaser RND (`src/battle-scene.ts:2045-2059`). The value is fixed for the turn and the call leaves no trace.
- Values read at the command prompt, where `turnData` is fresh (reset in `TurnInitPhase`, `src/phases/turn-init-phase.ts:65`):
  - Bolt Beak / Fishious Rend double on `!target.turnData.acted` (`move.ts:12053-12057`) → read as doubled.
  - Payback doubles on `target.turnData.acted` or a BALL command (`:10722-10729`) → read as not doubled.
  - Assurance (`damageTaken > 0`, `:10730`) and Avalanche / Revenge (`TurnDamagedDoublePowerAttr` on `attacksReceived`, `:4960`) → read as not doubled.
- `LastMoveDoublePowerAttr` (Fusion Flare / Bolt, `:5304-5337`) reads `dynamicQueueManager.getLastTurnOrder()` (`src/dynamic-queue-manager.ts:142`). `TurnEndPhase.start` clears that order (`src/phases/turn-end-phase.ts:28`), so the move never reads as doubled at the prompt.
- Low Kick / Grass Knot (`WeightPowerAttr`, `move.ts:4781`) call `getWeight()`, which applies `WeightMultiplierAbAttr` without `simulated` (`pokemon.ts:2335-2346`) → writes `abilitiesApplied` for Heavy / Light Metal. Gyro Ball (`:4836`, simulated `getEffectiveStat`), Stored Power (`:5115`), Knock Off, Facade, Hex, Acrobatics and Brine (`MovePowerMultiplierAttr` predicates) are pure reads.

**Category.** `Pokemon.getMoveCategory(target, move)` (`pokemon.ts:1440-1444`) applies `VariableMoveCategoryAttr`:
- `PhotonGeyserCategoryAttr`: Atk > SpA by `getEffectiveStat` (`move.ts:5636`).
- `TeraMoveCategoryAttr`: Tera Blast / Tera Starstorm while Terastallized, ignoring abilities and items (`:5658`).
- `ShellSideArmCategoryAttr`: compares physical and special `getBaseDamage` (`:5707-5741`). On a tie it draws battle RNG with `randBattleSeedInt(2)` (`:5736`).

`getAttackDamage` applies the same attrs itself (`pokemon.ts:3572-3574`), so even a simulated damage call draws on that tie. Use the sandbox.

---

## 5. Accuracy, priority, turn order

**Hit chance**: `MoveEffectPhase.hitCheck` (`src/phases/move-effect-phase.ts:348`) runs once per target on every strike,
because each hit gets its own MoveEffectPhase. The checks, in order:
1. A self-targeted move hits (`:353`). A target that is off the field gives TARGET_NOT_ON_FIELD. In doubles, Commander makes the move miss (`:359-370`).
2. `bypass = fieldTargeted || checkBypassAccAndInvuln(target)` (`:373`). A semi-invulnerable target misses unless `bypass` holds or the move has a matching `HitsTagAttr` (`:374-378`).
3. Protect gives PROTECTED (`:380`). Magic Coat or Magic Bounce gives REFLECTED (`:385`). A field-targeted move then hits (`:390`).
4. If `target.getMoveEffectiveness(user, move, false, false, …)` returns 0, the result is NO_EFFECT (`:400`). This is also where a Prankster
   status move fails against a Dark type: `Move.isTypeImmune` (`src/data/moves/move.ts:469`, called from `src/field/pokemon.ts:2502`).
5. `acc = move.calculateBattleAccuracy(user, target)` (`:408`). Strikes after the first hit without a roll, unless the move is
   CHECK_ALL_HITS and the user lacks Skill Link (`MaxMultiHitAbAttr`) (`:412-417`).
6. The move hits if `bypass` holds, the target has `ALWAYS_GET_HIT`, the target has `TELEKINESIS` (not against OHKO moves), or `acc === -1` (`:419-426`).
7. Otherwise `user.randBattleSeedInt(100) < acc * user.getAccuracyMultiplier(target, move)` decides hit or miss (`:428-435`).

So **P(hit) = min(ceil(acc·mult), 100) / 100**, and 0 when acc·mult ≤ 0. `hitCheck` draws from the battle RNG in step 7 only.
Its sub-calls write ability bookkeeping. The caller `conductHitChecks` (`:216`) writes `moveHistoryEntry.result`, and when
nothing hits it sets `turnData.hitCount/hitsLeft = 1`.
`checkBypassAccAndInvuln` (`:455`) is pure. It is true for `AlwaysHitAbAttr` on either side (No Guard), a `ToxicAccuracyAttr` move used by a
Poison type, the user's `IGNORE_ACCURACY` tag when its last Lock-On or Mind Reader targeted this target, and field-targeted moves.
- `move.calculateBattleAccuracy(user, target, simulated = false)` (`src/data/moves/move.ts:1051`) returns an integer, or −1 for a move that never misses.
  It applies these in order:
  1. `VariableAccuracyAttr`. Thunder/Hurricane: 50 in sun, −1 in rain (`:5537`). Bleakwind/Wildbolt/Sandsear Storm: −1 in rain (`:5563`).
     Minimize: −1 (`:5584`). Toxic by a Poison type: −1 (`:5605`). Blizzard in hail or snow: −1 (`:5617`).
     OHKO moves: 0 below the target's level, else `30 + 100·(1 − lvT/lvU)` (`:6454`).
  2. Wonder Skin on the target sets a status move of accuracy ≥ 50 to 50 (`src/data/abilities/ab-attrs.ts:617`). A −1 returns here.
  3. Wide Lens adds `5·stack`, not for OHKO moves (`src/modifier/modifier.ts:2691`; the 5 is at `src/modifier/modifier-type.ts:2097`).
  4. Fog: `floor(×0.9)` (`:1073`). Gravity, not for OHKO moves: `floor(×1.67)` (`:1081`).

  Pass `true`, and **call it inside the sandbox**: the weather attrs call `getEffectiveWeatherForMove`, which applies
  `PreAttackWeatherOverrideAbAttr` without `simulated` (`src/data/weather.ts:235`).
- `user.getAccuracyMultiplier(target, move)` (`src/field/pokemon.ts:3334`) returns 1 for OHKO moves. Otherwise:
  - The accuracy stage comes from the user, plus X Accuracy (`TempStatStageBoosterModifier`, `:3351`), capped at +6. The evasion stage comes from the target.
  - Unaware on the target ignores the accuracy stage. Keen Eye, Mind's Eye or Unaware on the user, or Chip Away (`IgnoreOpponentStatStagesAttr`), ignores the evasion stage.
  - `ExposedTag` (Foresight, Miracle Eye) caps evasion at 0 (`:3356`).
  - Stage ratio: `(3+min(d,6))/3` when accuracy is ahead by d, else `3/(3+min(−d,6))`.
  - The ratio is multiplied by `StatMultiplierAbAttr` on accuracy (Compound Eyes 1.3, Victory Star 1.1 also for allies, Hustle 0.8 on physical moves).
    It is divided by the same attr on the target's evasion (Sand Veil or Snow Cloak 1.25 in their weather, Tangled Feet 2 while confused).

  **Call it inside the sandbox**: every `applyAbAttrs` here omits `simulated`, so each call writes `abilitiesApplied`. None of these attrs has `showAbility` set.

**Priority**: `move.getPriority(user, simulated = true)` (`move.ts:1191`) = base priority + `IncrementMovePriorityAttr` (Grassy Glide) +
`ChangeMovePriorityAbAttr` (`ab-attrs.ts:3590`): Prankster status moves +1 (`src/data/abilities/init-abilities.ts:1082`),
Gale Wings Flying moves at full HP +1 (`:1204`), Triage heals +3 (`:1410`). Pure. Gale Wings calls `getMoveType`, which needs the sandbox when the type can change (§4).
Bracket: `move.getPriorityModifier(user, true)` (`move.ts:1199`) returns FIRST when the user has a `BYPASS_SPEED` tag.
It returns LAST through `ChangeMovePriorityInBracketAbAttr` (`ab-attrs.ts:3614`): Stall on any move (`init-abilities.ts:720`),
Mycelium Might on status moves (`:2097`). Otherwise NORMAL. Pure.
Psychic Terrain stops a move with priority > 0 that is not spread or field-targeted when it targets a grounded opponent.
The check is `Arena.isMoveTerrainCancelled` (`src/field/arena.ts:487`, pure), called in `MovePhase.thirdFailureCheck` (`src/phases/move-phase.ts:860`).

**Turn order**: `TurnStartPhase.start` (`src/phases/turn-start-phase.ts:51`) runs these steps:
1. `getCommandOrder` (`:21`, pure) keeps field order (player side, then enemy side) but puts every non-FIGHT command before every FIGHT (`:32-39`).
   Switches, balls and runs unshift their phases (`:114-135`), so they resolve before any move, and a switch-in takes the hit.
2. Tera commands push a `TeraPhase` (`:57-68`).
3. For each FIGHT command, in speed order (`:71-78`):
   - `BypassSpeedChanceAbAttr.canApply` (Quick Draw, `ab-attrs.ts:5583`): `!simulated && randBattleSeedInt(100) < 30`. The draw happens before the check that the move is an attack.
   - `BypassSpeedChanceModifier.apply` (Quick Claw, `modifier.ts:1555`): `randBattleSeedInt(10) < stack`, any move, up to 3 stacks.

   Either one adds the `BYPASS_SPEED` tag. This draws from the battle RNG, writes the tag and queues a message.
   `BypassSpeedTag.canAdd` (`src/data/battler-tags.ts:3630`) refuses the tag through `PreventBypassSpeedChanceAbAttr` (Mycelium Might on a status move).
4. Each FIGHT command pushes a `MovePhase` (`:153`). `PhaseManager.checkDynamic` (`src/phase-manager.ts:314`) parks the phase in the
   `MovePhasePriorityQueue` and leaves a marker in the queue. `CheckInterludePhase` and the turn-end phases follow (`:98-104`, §21).
5. Each time a marker comes up, `MovePhasePriorityQueue.pop` (`src/queues/move-phase-priority-queue.ts:73`) re-sorts the moves still waiting.
   It runs `sortInSpeedOrder` (`src/queues/pokemon-phase-priority-queue.ts:8`), then a stable sort (`sortPostSpeed`, `move-phase-priority-queue.ts:23-36`) by
   `timingModifier` (Quash, After You), then priority descending, then bracket descending. A speed change mid-turn reorders the rest of the turn.

`sortInSpeedOrder(list)` (`src/utils/speed-order.ts:21`) returns a new array:
1. `groupPokemon` (`:91`) groups consecutive entries of the same mon.
2. `shufflePokemonList` (`:32`) shuffles the groups with `randSeedShuffle` (Fisher–Yates on `Phaser.Math.RND`, `src/utils/common.ts:149`).
   The shuffle runs inside `executeWithSeedOffset(…, turn * 1000 + groupCount, waveSeed)`. That function (`src/battle-scene.ts:2045`)
   re-sows the RNG and afterwards restores `RND.state()`, `rngOffset` and `rngSeedOverride`.
3. `sortBySpeed` (`:57`) does a stable sort by `getEffectiveStat(SPD)` descending, then reverses the whole list when a `TRICK_ROOM` tag applies.
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

---

## 6. Enemy AI move choice

**Who decides what.** The `EnemyPokemon` constructor sets `aiType = boss || hasTrainer() ? SMART : SMART_RANDOM`
(`src/field/pokemon.ts:6443`): trainer mons and bosses (wild or trainer) are SMART, wild non-bosses SMART_RANDOM. A
Mystery Encounter's enemy config can override it (`src/data/mystery-encounters/utils/encounter-phase-utils.ts:352`);
the only one that does sets SMART (`src/data/mystery-encounters/encounters/slumbering-snorlax-encounter.ts:102`).
Nothing sets RANDOM ("No enemy should spawn with this AI type", `src/field/pokemon.ts:6604`).
`trainer.config.isBoss` only moves the switch threshold (§7).

**When.** `TurnInitPhase.start` resets each active mon's `turnData`, then queues `CommandPhase` for our slots and
`EnemyCommandPhase` for the foe's, in field order (`src/phases/turn-init-phase.ts:60-75`). So the enemy decides after
our command is in `turnCommands`. The move conditions that read it (Sucker Punch, Thunderclap, Upper Hand;
`src/data/moves/move-condition.ts:133-142,166-175`) are the three the AI skips. What still sees our command is
Payback's power, doubled when our command is a ball (`src/data/moves/move.ts:10723-10728`), through the KO filter's
damage call.

**`EnemyPokemon.getNextMove`** (`src/field/pokemon.ts:6560`). It draws battle RNG (below), writes
`summonData.moveQueue` (splices or clears it), and logs to the console. The scoring calls it makes have their own
side effects (see the end of this section).
1. **Move queue** (`:6563-6576`). It returns the first queued move that is virtual (`isVirtual(useMode)`) or usable
   from the moveset (`isUsable(this, isIgnorePP(useMode), true)`), dropping the entries before it. Otherwise it clears
   the queue. This covers charging moves, Outrage/Rollout locks and Bide.
2. **Pool** (`:6579`): moveset entries with `PokemonMove.isUsable(this, false, true)[0]`
   (`src/data/moves/pokemon-move.ts:57`). That excludes `(N)` moves and moves out of PP, plus selection restrictions
   (`isMoveSelectable`: Disable, Taunt, Torment, Encore, Imprison…). An empty pool means **Struggle** with
   `IGNORE_PP` (`pokemon.ts:6795-6799`).
3. A single move in the pool is used (`:6583`). **Encore** (`getTag(EncoreTag)`) with its move in the pool: that move
   (`:6592-6601`).
4. RANDOM: `movePool[randBattleSeedInt(len)]` (`:6605-6608`).
5. **KO filter** (`:6616-6660`), for SMART and SMART_RANDOM:
   ```ts
   move.category !== MoveCategory.STATUS && moveTargets.some(p =>
     !isMoveWeatherCancelled(this, move) && !isMoveTerrainCancelled(this, [p.getBattlerIndex()], move)
     && (move.applyConditions(this, p, -1) || [SUCKER_PUNCH, UPPER_HAND, THUNDERCLAP].includes(move.id))
     && p.getAttackDamage({ source: this, move, ignoreAbility: !p.waveData.abilityRevealed,
          ignoreAllyAbility: !p.getAlly()?.waveData.abilityRevealed, isCritical, simulated: true }).damage >= p.hp)
   ```
   `ATTACKER`-target moves (Counter) are skipped first. `moveTargets` comes from `getMoveTargets`
   (`src/data/moves/move-utils.ts:56`), which draws battle RNG for `RANDOM_NEAR_ENEMY` (`:94-95`). `isCritical` is
   set only for `CritOnlyAttr` or Laser Focus (`ALWAYS_CRIT`). In words: if any damaging move's simulated single-hit
   damage reaches a foe's current HP, only those moves stay in the pool. The simulated call is §1–§5's: max roll, and
   our unrevealed abilities are ignored.
6. **Targets** (`pokemon.ts:6668`): `getNextTargets(moveId)` for every move in the pool (below).
7. **Score** (`:6669-6741`). A move's score is the max over its targets, and the loop stops at `BattlerIndex.ATTACKER`
   (no targets gives `-Infinity`). Per target:
   ```ts
   score = move.getUserBenefitScore(this, t, move)
         + move.getTargetBenefitScore(this, t, move) * (t on the enemy's side ? 1 : -1);   // NaN → 0
   if ((name endsWith " (N)" || !move.applyConditions(this, t, -1)) && !exempt) score = -20;
   else if (weather- or terrain-cancelled) score = -20;
   else if (move.is("AttackMove")) {
     eff = t.getMoveEffectiveness(this, move, !t.waveData.abilityRevealed, undefined, undefined, true);
     foe: score *= eff, and ×1.5 if this.isOfType(move.type);  ally: if (eff) score /= eff, and /1.5 for STAB
     score ||= -20;
   }
   ```
   `move.type` is the base type. The scoring pieces are called, not re-implemented:
   - `Move.getUserBenefitScore` (`src/data/moves/move.ts:1006`): the sum over attributes and conditions.
     `FirstMoveCondition` gives +10 or −20 (`src/data/moves/move-condition.ts:53-63`), `HighCritAttr` +3, and
     `CritOnlyAttr` +5 (`src/data/moves/move.ts:1950,1962`).
   - `Move.getTargetBenefitScore` (`src/data/moves/move.ts:1027`): the sum over attributes. A `selfTarget` attribute is
     scored on the user, sign-flipped when the target isn't the user. If the target is a Tatsugiri commanding its ally,
     the result is `20 × (same side ? −1 : 1)` instead (`:1030-1032`).
   - `AttackMove.getTargetBenefitScore` (`:1414`) is `super − attackScore`. `attackScore` starts as
     `(eff−1)²·(eff<1 ? −2 : 2)` with `eff = getAttackTypeEffectiveness(this.type, { source, move })`. It is ×2 when
     the user's other attacking stat is ≤ 0.75× the one this move uses (×1.5 at ≤ 0.875). Then
     `floor(power / 5)` is added, with `power` from `calculateEffectivePower()` through `VariablePowerAttr`. It is pure,
     except for Present (below).
   - Attribute scores include `StatusEffectAttr` (`floor(chance × −0.1)`, −10 when guaranteed, if `canSetStatus`,
     `:3119-3125`), `AddBattlerTagAttr` (`floor(tagScore × chance/100)`, `:6713`) and `MultiHitAttr` −5 (`:2983`).
   - `StatStageChangeAttr` (`:3991-4042`) counts only the stages still under ±6: `levels·4 ∓ 2` per stat. A game
     quirk: a self-targeted SpA boost, and a target SpD drop, score only if the user knows a *physical* attack
     (`:4020-4034` test `PHYSICAL`, as for Atk and Def).
8. **Pick** (`:6744-6772`). The pool is sorted by score, descending and stable. The index starts at 0.
   - SMART_RANDOM: `while (i < len−1 && randBattleSeedInt(8) >= 5) i++`, so it advances with chance 3/8.
   - SMART: `while (i < len−1 && ratio >= 0 && randBattleSeedInt(100) < round(ratio·50)) i++`, where
     `ratio = score[i+1]/score[i]`. It advances with chance `clamp(round(ratio·50), 0, 100)/100`, and the draw is made
     even when that is 0. Two negative scores give ratio > 1 and a certain advance to the worse move. `0` followed by
     `0` is NaN, which stops.

**`getNextTargets(moveId)`** (`src/field/pokemon.ts:6808`). It draws battle RNG. A spread move (`multiple`) returns
every active target. For a single target, each candidate's `getTargetBenefitScore × (same side ? 1 : −1)` is sorted
descending. If the lowest is < 1, `|lowest−1|` is added to all. Candidates are dropped from the first weight below
top/2. Then `randBattleSeedInt(Σw)` is compared with the cumulative weights (`:6874`). `Battle.randSeedInt` returns
without drawing when range ≤ 1 (`src/battle.ts:491-494`), and otherwise draws `floor(U·Σw)` even for a non-integer
Σw. No candidate: `[ATTACKER]` for `CounterDamageAttr`, else `[]`.

**Singles: the call returns the real choice.** The battle stream re-seeds from `shiftCharCodes(battleSeed, turn << 6)`
whenever `battleSeedState` is null (`src/battle.ts:497-505`). `incrementTurn` nulls it (`:171-176`). Between our
command prompt and `EnemyCommandPhase` in a single battle, nothing draws from it:
- our `CommandPhase` draws only through `getMoveTargets` (`src/phases/command-phase.ts:278`), and one opponent means
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
- **Present:** its power draws the *global* stream (`randSeedInt`, `src/data/moves/move.ts:5165`), which the prompt
  can't pin down.
- **Payback into a ball command** (above).
- **Trainer mons:** they may switch instead (§7).

`20-enemy-ai.js` still re-implements the procedure to get every outcome with its chance.

**Side effects of the scoring calls (sandbox them):**
- `applyConditions`: consecutive Protect draws `user.randBattleSeedInt(3^n)` (`src/data/moves/move.ts:6949`), and some
  conditions queue messages.
- `getMoveEffectiveness`: Tera Shell writes and reads `turnData.moveEffectiveness` (`src/field/pokemon.ts:2487`).
- `PresentPowerAttr.apply`: draws global RND, writes `turnData.hitCount`/`hitsLeft`, and can queue a
  `PokemonHealPhase` (`src/data/moves/move.ts:5157-5182`).
- `getAttackDamage` → `getMoveTargets`: draws battle RNG in doubles.
- `isMoveWeatherCancelled` and `isMoveTerrainCancelled` are pure (`src/field/arena.ts:323,487`).

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
- **`Trainer.getPartyMemberMatchupScores`** (`src/field/trainer.ts:551`). It scores each non-fainted bench mon of the
  slot's trainer by `getMatchupScore` against our field, halved per legendary. With `forSwitch`, the score is also
  scaled by each hazard's `getMatchupScoreMultiplier` on the enemy side (`:574-577`). No RNG, no writes beyond
  `getMatchupScore`'s. `getSortedPartyMemberMatchupScores` (`:586`) is pure.
- **`Trainer.getNextSummonIndex`** (`:597`). It picks the top score, and breaks a tie with `randSeedInt` inside
  `executeWithSeedOffset(…, turn << 2)` (`:615-618`). That is a seed fork: the global RND state is restored and the
  battle stream is untouched.
- **`Pokemon.getMatchupScore`** (`src/field/pokemon.ts:2680`) passes `simulated: false` for the opponent's second type
  (`:2695-2699`). Under strong winds that queues a message (`:2620-2628`), so keep it in the sandbox. It also reads
  `isActive` and effective Speed.
- **`Pokemon.isTrapped`** (`:2398`). It is true when a `COMMANDED` tag's source is active, so a Commanded Dondozo never
  switches. Otherwise it applies `CheckTrappedAbAttr` simulated over `inSpeedOrder`, and checks `TrappedTag` and
  Fairy Lock.
- **Doubles sequencing.** Slot 0 decides first and moves `enemySwitchCounter` (+1 on a switch, −1 floored at 0
  otherwise) before slot 1 reads it.
- **`skipTurn`.** It is set for a Commander Tatsugiri inside Dondozo, and for
  `mysteryEncounter.skipEnemyBattleTurns` (`src/phases/enemy-command-phase.ts:27,41-47`). The command is still
  written, and the counter still moves, but `TurnStartPhase` drops skipped commands
  (`src/phases/turn-start-phase.ts:84`).
- **A locked move queue** (charging, Outrage, Uproar, Bide, Rollout…) never switches; `getNextMove` repeats the queued
  move (§6 step 1).
- **Tera.** `Trainer.shouldTera` (`src/field/trainer.ts:784`) is pure, safe unsandboxed. It needs all of:
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
| Type boosters (Never-Melt Ice…) | `calculateBattlePower` (`move.ts:1167`) → `AttackTypeBoosterModifier.apply` (`modifier.ts:1475`): `floor(power·(1+0.2·stack))` (20 at `src/constants.ts:21`) | no | inside getAttackDamage |
| Wide Lens | `calculateBattleAccuracy`: `+5·stack`, not on OHKO (§5) | no | `move.calculateBattleAccuracy(atk,def,true)` (sandbox) |
| Multi-Lens | `PokemonMultiHitModifier` (`modifier.ts:2721`), only for moves passing `canBeMultiStrikeEnhanced`: hits +stack (`:2752`); hit 1 ×(1−0.25·stack), later lens hits ×0.25 (`:2762`) | no | set turnData (§2) |
| Scope Lens / Leek / Dire Hit | `getCritStage` (`pokemon.ts:1417`): `CritBoosterModifier`, `TempCritBoosterModifier`, `BonusCritAbAttr` (no `simulated`), `CritBoostTag`; chance `[24,8,2,1]` in `getCriticalHitResult` (`:3831`) | battle | `def.getCritStage(atk,move)` (sandbox) |
| Eviolite, Light Ball, Thick Club, Deep Sea items | `getEffectiveStat` (`pokemon.ts:1472`) → `StatBoosterModifier.apply` (`modifier.ts:1173`); Eviolite halved for a half-evolved fusion (`:1219`) | no | inside getAttackDamage |
| Enemy damage / resistance tokens | `getAttackDamage` (`pokemon.ts:3758-3763`): `toDmgValue(dmg·1.05^stack)` / `·0.975^stack` (`modifier.ts:3436`, `:3450`, `:3473`) | no | inside getAttackDamage |
| Focus Band | `Pokemon.damage` (`pokemon.ts:3881`), direct damage only, after Enduring/Sturdy/endure token: `SurviveDamageModifier.apply` (`modifier.ts:1520`) `randBattleSeedInt(10) < stack` → 1 HP | battle | held items → P(survive lethal hit) |
| Enemy Endure Chance | `MoveEffectPhase` (`move-effect-phase.ts:677`), enemy target, damage ≥ hp, no substitute: `randBattleSeedInt(100) < 2·stack`, once per wave → `ENDURE_TOKEN` (`modifier.ts:3660`) | battle | `s.enemyModifiers` `EnemyEndureChanceModifier`, `!p.waveData.endured` |
| Sturdy | `PreDefendFullHpEndureAbAttr` (`ab-attrs.ts:293`), non-simulated → `STURDY` tag → survive at 1 from full (`pokemon.ts:3873`) | no | `isFullHp() && getMaxHp()>1 && hasAbilityWithAttr(…)` unless Mold Breaker |
| Disguise / Ice Face | `FormBlockDamageAbAttr` (`ab-attrs.ts:5408`), non-simulated: damage 0, form change; Disguise recoil `toDmgValue(maxHp/8)` (`init-abilities.ts:1433`), Ice Face none | no | `getAbility().getAttrs('FormBlockDamageAbAttr')` + `formIndex` |
| Multiscale / Shadow Shield / Tera Shell | `ReceivedMoveDamageMultiplierAbAttr` ×0.5 at full HP (`ab-attrs.ts:338`); `FullHpResistTypeAbAttr` writes `turnData.moveEffectiveness` even simulated (`:536`) | no | inside getAttackDamage (sandbox for Tera Shell) |
| Reviver Seed | `FaintPhase.start` after `resetSummonData` (`faint-phase.ts:60-74`) → `PokemonInstantReviveModifier.apply` (`modifier.ts:1906`) heals `toDmgValue(maxHp/2)`; **not** after an indirect KO (§21) | no | held item → `pKo 0`, `revive` |
| Sitrus / Enigma | BerryPhase only (§21): `getBerryPredicate` (`src/data/berry.ts:23`) rounded HP ratio < 0.5 / hit super-effectively this turn → `toDmgValue(maxHp/4)`, Ripen ×2 (`:76`) | no | held items + §3 |
| Lum | BerryPhase: status or confusion → cured | no | held item |
| Liechi/Ganlon/Petaya/Apicot/Salac | BerryPhase: < 25 % (Gluttony 50 %, `ab-attrs.ts:5145`) and stage < 6 → +1 | no | held item |
| Starf | BerryPhase < 25 %: +2 to a random one of Atk…Spe, `randSeedInt(5, 1)` (`berry.ts:136`) | global | expectation |
| Lansat | BerryPhase < 25 % (Gluttony ignored, `berry.ts:50`): `CRIT_BOOST` tag | no | |
| Quick Claw / Quick Draw | TurnStartPhase → `BYPASS_SPEED` → FIRST bracket (§5) | battle | held item / ability |
| King's Rock | `applyHeldItemFlinchCheck` (`move-effect-phase.ts:855`): damaging move without `FlinchAttr`, no Shield Dust, no substitute; `randBattleSeedInt(100) < 10·stack` (`modifier.ts:1617`); `FLINCHED` ends at turn end, so only a holder moving first flinches | battle | held item |
| Leftovers / Shell Bell | TurnEndPhase queued heal `toDmgValue(maxHp/16)·stack` (§21) / `MoveEffectPhase.end` (`move-effect-phase.ts:896`) `toDmgValue(totalDamageDealt/8)·stack` (`modifier.ts:1744`) | no | held item |
| Toxic / Flame Orb | TurnEndPhase `TurnStatusEffectModifier.apply` → `trySetStatus` (`modifier.ts:1711`); chip starts next turn (§21) | no | held item + `effect` |
| Boss bar break | `EnemyPokemon.handleBossSegmentCleared` (`pokemon.ts:6973`), wild bosses only: +1 to a stat below +6 by `weightedPick` on `getStat(s,false)` (`:6988`); +2 on reaching index 0 with ≥3 bars, index 1 with ≥5 | global | expectation, on its defences (our hits) and Atk/SpA (its hits) |
| Grip Claw | `MoveEffectPhase` after each hit of any attack move (`move-effect-phase.ts:815`): `randSeedFloat() <= 0.1·stack` (`modifier.ts:3300`), then `HeldItemTransferModifier.apply` (`:3174`) picks one transferable item | global + battle | expectation: steals per landed hit |
| Mini Black Hole | TurnEndPhase, holder not fainted (`modifier.ts:3255`): opponent picked, then `stack` items picked, all `randBattleSeedInt` (`:3174`) | battle | expectation: steals per turn |
| Sticky Hold | `tryTransferHeldItemModifier` (`src/battle-scene.ts:2547-2555`): `BlockItemTheftAbAttr` on the holder cancels a cross-side transfer | no | ability attr |
| Sleep / freeze / paralysis | `doSetStatus` (`pokemon.ts:4989`): sleep counter 2 (⅓) or 3 (⅔), freeze 3 (`:5032`). `MovePhase.checkSleep` (`move-phase.ts:317`) ticks it (Early Bird −1 more), wakes at ≤0 → 1 or 2 turns lost; `checkFreeze` (`:361`) ticks, thaws on `randBattleSeedInt(4)===0` or ≤0 → lost with ¾, then 9/16, never a third; `checkPara` (`:518`) `randBattleSeedInt(8)===0`; Speed `>>1` (`pokemon.ts:1555`) | battle | expectation |
| Enemy wave heal | TurnEndPhase `EnemyTurnHealModifier.apply` (`modifier.ts:3520`): `max(floor(maxHp/50)·stack, 1)` when not full, never past maxHp−1 (§21) | no | `s.enemyModifiers` |
| Enemy wave status | Each hit of an enemy attack move (`move-effect-phase.ts:810`): `applyShuffledModifiers` (order shuffled in a seed fork, `battle-scene.ts:2897`), each `randSeedFloat() <= chance·stack` (5 % burn/poison, 2.5 % others, max 10; `modifier.ts:3555`, `:3575`) → `trySetStatus`. `EnemyStatusEffectHealChanceModifier` 2.5 %·stack cure at turn end (`:3615`) | global | `s.enemyModifiers` |
| Choice items, Life Orb, Expert Belt, Focus Sash, Loaded Dice | no modifier type exists (`src/modifier/modifier-type.ts`) | — | drop from models |

Item lookup: `p.getHeldItems()` (`pokemon.ts:1194`) is a pure read. It returns the player's `s.modifiers` or the enemy's `s.enemyModifiers` filtered by `pokemonId`.
Identify items by `m.constructor.name` plus `m.berryType` or `m.moveType`, and count with `m.getStackCount()`.
Choice-like locks that do exist (the `GORILLA_TACTICS` and `TORMENT` tags, Encore, the move queue) are already reflected by `isUsable` and the move queue.

### Turn-end HP order

Moved to §21.

---

## Unsafe to call (never, even sandboxed, unless noted)

- `EnemyPokemon.getNextMove()` (`pokemon.ts:6560`) draws from the battle RNG and splices or clears `summonData.moveQueue` (`:6570`, `:6576`).
  It also calls `getNextTargets` (`:6808`), which draws from the battle RNG. If you call it inside the sandbox, save and restore `moveQueue` as well.
  At the command prompt, a sandboxed call reproduces the move `EnemyCommandPhase` picks
  (`src/phases/enemy-command-phase.ts:91`) rather than a random sample. The battle stream re-sows from `battleSeed` and the turn
  whenever `battleSeedState` is null (`src/battle.ts:491-509`), and `TurnEndPhase` nulls it (`:175`). A trainer's switch
  check runs first. Checked on a live tab (#158, §6); the exceptions are listed there.
- `Pokemon.getCriticalHitResult` (`pokemon.ts:3821`) draws from the battle RNG (`:3836`).
- `Pokemon.damage` (`:3863`), `damageAndUpdate` (`:3910`) and `heal` (`:3963`) write HP, run endure and Focus Band, and queue faint or animation phases.
  `EnemyPokemon.damage` (`:6918`) also breaks boss bars. The private `handleBossSegmentCleared` draws from the global RNG and queues a stat change.
- `getAttackDamage({simulated:false})` rolls the damage and adds the Sturdy tag. It also triggers Disguise's form change and recoil.
- `move.calculateEffectivePower(pokemon)` applies `VariableMovePowerAbAttr` without `simulated` (`move.ts:1249`).
  `calculateBattleAccuracy` without `true` only adds bookkeeping that the sandbox undoes, but pass `true` anyway.
- `BerryModifier.shouldApply/apply` (`modifier.ts:1823`, `:1832`): `apply` eats the berry and draws Berry Pouch from the battle RNG.
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
  - `trainer.shouldTera(e)` (`src/field/trainer.ts:784`), `getHeldItems`, `getMoveQueue`, `getTag`, `isFullHp`, `hasAbilityWithAttr`, `getStatStage`, `getTypes`.
  - `isTrapped()` (`pokemon.ts:2398`, `simulated` defaults to true).

---

## Recommended API for the HUD

Game calls are cited where they're named; unmarked names are HUD functions.

### Shared (01-core.js)
- `sandbox(s, fn)` — §0; `muted` stays as an alias. Returns `fn()`.
- `heldItems(p)` → `Map<constructorName, {stack, list}>` via `Pokemon.getHeldItems()` (`src/field/pokemon.ts:1194`); `berries(p)` → `[{ type: m.berryType, stack }]` (`BerryModifier`, `src/modifier/modifier.ts:1795`).
- `SKIP_RNG_MOVE = m => m.hasAttr("PresentPowerAttr") || m.hasAttr("RandomLevelDamageAttr")`: Present draws global RNG (§4), and Psywave draws battle RNG inside `getAttackDamage` (`src/data/moves/move.ts:2143-2150`). Use modelled values for both.
- `effectiveness(type, defender, mv?)` → the multiplier, the one place the type chart and the ability immunities are read. `defender` is a plain `{ types: [name], abilities: [name] }`; `mv`, where the caller has the move, adds the flag immunities (Soundproof, Bulletproof, Overcoat, Wind Rider). Wonder Guard, Thick Fat, Heatproof and the ×0.75 reducers are in it. No game calls.
- `defenderOf(x)` → that plain defender, from whatever the caller holds: a live mon (through `Pokemon.getTypes` / `getAbility` / `getPassiveAbility`), a replayed foe (`{ types, ability, passive }`, 48-preview) or a defender already, which it hands back. Idempotent, and `effectiveness` runs it itself, so a caller cannot pass the wrong shape. **No card multiplies the chart out by hand**: `foeMult`, 47's `mult` and 46's bare `vs` products are gone.
- `TIER_NAMES` — reward rarities by `ModifierTier`. Here rather than on the shop card, because the look-ahead names a fixed battle's pinned tiers waves before there is a shop.

### Run calendar (03-calendar.js)
- `waveKind(s, w)` → `"final" | "fixed" | "gym" | "boss" | null`, by the precedence in §12. Precedence, not membership: wave 20 is `"gym"` though it is also a tenth wave.
- `isBossWave(s, w)` → whether `w` is a tenth wave at all, which is what `getDoubleBattleChance`'s 32 asks (§16).
- `bigFightsAhead(s, from, n)` → `[{ wave, kind }]` in wave order, stopping at the run's last wave. Empty without a `gameMode`. What a fight is *called* stays with the card.
- `nextHeal(s, from)` → the next X1 the run heals on, or `null` past the last wave or under a Limited Support with no heal (§10).
- `healRevives(s)` → whether that heal brings the fainted back (false under Hardcore, or with no heal at all).
- `trainerOdds(s, w, biome)` → 0..1, `isWaveTrainer` (§10) as odds rather than as the roll `48-preview.js` replays.
- **The only game-less fallbacks in the HUD live here**, each marked where it sits: the last wave per mode (classic 200, Daily 50, Endless every 250) and the tenth-wave boss rule. No caller writes `% 10` or `% 30` for itself.

### Move traits (07-move-traits.js)
- `moveTraits(mv, user, { party, target })` → the move read once, by attribute: `charge` (`false`, or `{ skip, now(user) }` — the instant-charge condition as data and judged live), `semiCharge`, `recharge`, `interrupt`, `needsAttack` (Sucker Punch / Thunderclap), `once` (`FirstMoveCondition` across `conditions` / `conditionsSeq2` / `conditionsSeq3`), `lock` (`FrenzyAttr`), `noRepeat` (`consecutiveUseRestriction`'s exact `battle:moveDisabledConsecutive` key), `recoil` (`{ ratio, useHp, blocked }`, default ratio 0.25, blocked by Magic Guard / Rock Head *by ability attribute* unless `unblockable`), `halfSac`, `crash`, `selfKo` (`"always"` / `"onHit"`), `drops` (guaranteed self stat changes, signed), `removesType`, `guarded`, `hits` (`{ dist, mean, checkAll, grows }`, §2), `flinches`, `stages` / `inflicts` / `tags` (each with `self` / `side` / `ally` and the concrete `cls`), `heal` (`{ ratio, ratioIn(weather), self, cls }`), `hazard`, `protect`, `cutHp`, `drain`, `typeChange` (`{ kind: "set" | "add", type }` — Soak and Magic Powder replace a target's types, Forest's Curse and Trick-or-Treat add a third; whether it would do anything is the caller's, live), `attrNames`. **No game calls and no battle state**, so the learn card uses it outside a battle. Attributes match through the prototype chain; `attrNames` holds concrete class names for callers whose tables are keyed that way.
- `costNotes(traits, amounts)` → the wording for each cost, shared by the ⚔ line's `costs` and the learn card's drawbacks. `amounts` carries this matchup's numbers when the caller has them: `recoil` (share of max HP), `sun`, `type`.
- What a trait is *worth* stays with the caller: 10-damage's `reliability`, the learn card's multipliers, the planner's benefit nudge.

### Party profile (08-party.js)
The **party** judged as a whole, and one query for whether a newcomer is worth it. Four cards asked those two questions with four copies of the answer; the copies are gone. Weights stay with each card — a reason has no number on it.
- `partyProfile(party)` → `{ attacks, ourTypes, weakTypes, holes, weakest, roots, luck, members, hitters(defender), weakTo(type) }`.
  - `attacks` — per member, `[{ t, stab }]`: the types it hits for damage, `stab` 1.5 on its own types. `ourTypes` flattens it.
  - `weakTypes` — attacking types two or more members are weak to and more are weak to than resist. `holes` — defending types nothing on the team hits super-effectively.
  - `weakest` — `{ mon, final, estimated, level }`, the lowest final BST with the lower level breaking a tie. `roots` — the party's root species ids (`Pokemon.getRootSpeciesId`), which is what makes a catch a duplicate. `luck` — `partyLuck`. All three are worked out on first read, so a caller that wants only coverage pays for nothing else.
  - `hitters(defender)` / `weakTo(type)` — the members that hit it super-effectively, and the members that type hits super-effectively. The two matchup queries every card asks.
- `partyReasons(profile, cand, { replacing })` → `[{ kind: "covers" | "hole" | "upgrade" | "dupe", … }]`, against `replacing` (default: the weakest member). `cand` is `{ species, fusion?, level, types, moveTypes? }` — a species with no moveset lets its own types stand in, so the same species at the same level gets the same reasons on the catch card and the biome card. Thresholds: a `hole` wants a party of 3 and 2 types, an `upgrade` a final BST over 400, 100 above the member replaced and no more than 10 levels behind it.
- `damagingTypes(p)` → the types a mon can hit for damage. **Variable power counts** (`power === -1`: Grass Knot, Gyro Ball) and **fixed damage does not** (§4.3 — it ignores the chart), which is how the learn card always read it and how the catch, biome and look-ahead cards now do.
- `finalBstOf(x)` → `{ bst, final, estimated }` for a live mon, a `{ species, fusion }` pair or a bare species: a line's final evolution's BST, estimated from `PokemonSpecies.getEvolutionLevels()`, a fusion averaging both halves (`Pokemon.calculateBaseStats`).
- `partyLuck(party)` → `getPartyLuckValue`'s rule re-implemented over `Pokemon.getLuck` / `isAllowedInBattle`, clamped to 14. A floor, not the value: the timed-event boost isn't readable from the scene.
- `typesOfSpecies(sp)` → a species' own types by name, for a candidate that is a species and not a mon.

### Damage (10-damage.js)
- `moveInfo(s, atk, def, pm)` → `{ move, type: atk.getMoveType(move), category: atk.getMoveCategory(def, move), power: move.calculateBattlePower(atk, def, true), priority: move.getPriority(atk, true), spread: [2,4,6,8].includes(move.moveTarget), acc: hitChance(...), critChance }`. `getPriority` is at `move.ts:1191`. The spread targets 2/4/6/8 are ALL_OTHERS / ALL_NEAR_OTHERS / ALL_NEAR_ENEMIES / ALL_ENEMIES (`src/enums/move-target.ts`). Sandbox.
- `hitChance(atk, def, move, hitIndex = 0)` → 0..1. Uses `move.calculateBattleAccuracy(atk, def, true)` (`move.ts:1051`, where `simulated` defaults to false), `atk.getAccuracyMultiplier(def, move)` (`pokemon.ts:3334`), and `hasAbilityWithAttr("AlwaysHitAbAttr")` on either side (`MoveEffectPhase.checkBypassAccAndInvuln`, `src/phases/move-effect-phase.ts:455-457`). Later hits are 1 unless `move.hasFlag(MoveFlags.CHECK_ALL_HITS)` and the user lacks Skill Link (§2). Sandbox.
- `critChance(atk, def, move)` → `[1/24, 1/8, 1/2, 1][clamp(def.getCritStage(atk, move), 0, 3)]` (`pokemon.ts:1417`, table at `:3831`). It is 1 with `CritOnlyAttr`, the `ALWAYS_CRIT` tag or `ConditionalCritAbAttr`. It is 0 for `FixedDamageAttr` moves, for a target with `BlockCritAbAttr`, and on a side with a `NoCritTag` (Lucky Chant) (`getCriticalHitResult`, `:3822-3846`).
- `hitCounts(s, atk, def, move)` → `[{n, p}]` (§2: MultiHitAttr type, Skill Link, Parental Bond, Multi-Lens, Beat Up, Water Shuriken).
- `hitDamage(s, atk, def, move, { hit, hits, crit = false, aiView = false })` → `{ max, min, result, cancelled }`. It sets `atk.turnData.hitCount = hits; hitsLeft = hits - hit`, then calls `def.getAttackDamage({ source: atk, move, isCritical: crit, simulated: true, ignoreAbility: aiView && !def.waveData.abilityRevealed, ignoreAllyAbility: aiView && !def.getAlly()?.waveData.abilityRevealed })` (`pokemon.ts:3559`; `abilityRevealed` at `src/data/pokemon/pokemon-data.ts:319`). `getNextMove` passes the same flags (`pokemon.ts:6644-6651`). `min ≈ floor(max × 0.85)` is an approximation: the game rolls `randBattleSeedIntRange(85, 100)` inside the product, before later multipliers and floors (`:3683`, `:3739`). Sandbox (turnData restored).
- This turn's resolution of a move on its target (private `resolve` / `landHit`), pure math on read fields. Per hit:
  - Disguise / Ice Face (`FormBlockDamageAbAttr`, `src/data/abilities/ab-attrs.ts:5408`) takes the first hit.
  - Boss clamp by `calculateBossSegmentDamage` (exported; §3) with `getMaxHp() / bossSegments`, `bossSegmentIndex`, the classic final-boss minimum index and its HP − 1 cap (`EnemyPokemon.damage`, `pokemon.ts:6918-6939`; the cap checks the bar index before the hit).
  - Sturdy at full HP → 1 HP, except against `FixedDamageAttr` moves (§3).
  - Focus Band 0.1·stack, and the enemy Endure token 0.02·stack, rolled when the hit would faint it.
- `moveOutcome(s, atk, def, pm)` → `{ type, cat, e: result→multiplier, perHit: [{max,min}], dist: [{n,p}], acc, expected, uncapped, max, pKo, revive, use, targetHp, name, priority, spread, traits, costs, notes }`. `traits` is 07-move-traits' record with the charging turn judged against this moment; `costs` is `costNotes` with this matchup's amounts, plus the target's contact chip; `notes` keeps the rest (hit counts, boss bars, Sturdy, Focus Band, a crit, an estimate). It combines the above; `targetHp` is the HP the odds were worked out for. It also sets `bypassProtect` from `move.doesFlagEffectApply({ flag: MoveFlags.IGNORE_PROTECT, user, target })` (`move.ts:893`; flag `1 << 1`, `src/enums/move-flags.ts:12`). A move cancelled by primordial weather or Psychic Terrain comes back as "no effect" (`stopped by weather` / `terrain`), from `arena.isMoveWeatherCancelled(user, move)` / `isMoveTerrainCancelled(user, targets, move)` (`src/field/arena.ts:323`, `:487`; §14).
- `endOfTurnHp(p, { s, hp, tookSuperEffective, dealt })` → the signed turn-end HP change, following the game's phase order (`src/phase-manager.ts:227-233`):
  1. weather chip and Dry Skin / Solar Power (`WeatherEffectPhase`);
  2. berries (`BerryPhase`, §3: Sitrus below a rounded 50 %, Enigma on a SE hit, Ripen, Unnerve);
  3. status chip (`CheckStatusEffectPhase`; orbs counted as already on);
  4. `TurnEndPhase.start` (`src/phases/turn-end-phase.ts:23-61`): Leftovers (`TurnHealModifier`), Grassy Terrain `maxHp >> 4` when grounded, the enemy's `EnemyTurnHealModifier`, `PostTurnAbAttr`s.

  Shell Bell (`HitHealModifier`) is applied from `dealt` at the end of the move (`move-effect-phase.ts:896`).
- `statusMoves(s, atk, def)` → `[{ pm, name, type, acc, e, priority, bypassProtect, bounce, blocked }]`. These are the status moves `atk` can pick that would work on `def`:
  - usable per `PokemonMove.isUsable(pokemon, ignorePp, forSelection)` (`src/data/moves/pokemon-move.ts:57`) and `move.applyConditions(user, target, -1)` (`move.ts:944`);
  - `e` 0 for an immunity (`def.getMoveEffectiveness(atk, move)`, `pokemon.ts:2479`);
  - `bounce` for Magic Bounce (`ReflectStatusMoveAbAttr`, `ab-attrs.ts:5268`, checked by the module-private `isMoveReflectableBy`, `move-effect-phase.ts:998`);
  - `blocked` for a weather / terrain cancel.

  Game calls only. Every cache key carries `hypothesisKey`, so numbers for a written-on state (§14) never mix with the real ones.

### Enemy AI (20-enemy-ai.js)
- `aiTargets(s, e, move)` → `[{battlerIndex, p}]`: `getMoveTargets` (`src/data/moves/move-utils.ts:56`) on the opponent side, weighted the way `EnemyPokemon.getNextTargets` does it (`pokemon.ts:6808`), with `move.getTargetBenefitScore(e, p, move)` (`move.ts:1027`). Sandbox.
- `aiKoPool(s, e, usable)` → the moves that survive `getNextMove`'s KO filter (`pokemon.ts:6616-6660`). A move stays if it:
  - isn't a status move or ATTACKER-targeted;
  - isn't weather- or terrain-cancelled;
  - passes `applyConditions(e, p, -1)`, or is Sucker Punch / Upper Hand / Thunderclap;
  - does simulated `getAttackDamage` ≥ `p.hp` with the AI's `ignoreAbility` flags (crit only for `CritOnlyAttr` / `ALWAYS_CRIT`).
- `aiMoveScore(s, e, pm, targetIdx)` → a number, exactly step 7 (`pokemon.ts:6680-6745`):
  - base score `getUserBenefitScore + getTargetBenefitScore` (`move.ts:1006`, `:1027`);
  - −20 for a failed `applyConditions(e, p, -1)`, a weather / terrain cancel, or a zero score;
  - attack moves × `target.getMoveEffectiveness(e, move, !target.waveData.abilityRevealed, undefined, undefined, true)` (the trailing `true` is `useIllusion`, `pokemon.ts:6712-6719`);
  - STAB ×1.5 via `e.isOfType(move.type)`, which checks the base move type, not `getMoveType`;
  - divided instead for an ally target.
- `enemyMoveDistribution(s, e)` → `[{ pm, move, targets: [{battlerIndex, p}], p, score }]` (§6 algorithm: move queue, Struggle, Encore, `aiType` RANDOM / SMART_RANDOM / SMART = 0/1/2 from `src/enums/ai-type.ts`, Protect branch). Cache it per turn key. `EnemyPokemon.getNextMove()` (`pokemon.ts:6560`) draws battle RNG and rewrites `summonData.moveQueue` (`:6563-6576`). At the command prompt, a sandboxed call returns the move the enemy actually picks, not a sample: the battle seed is re-sown each turn and, unless one of our commands draws a random target, nothing draws before `EnemyCommandPhase` (#158, checked live in singles and doubles). The distribution is for later turns and for turns where our command draws.
- `aiReplay(s, e, target, { hp })` → rows like `enemyMoveDistribution`'s, without targets: `getNextMove` replayed against one of our mons, which needn't be on the field (§6), status moves included. Sandbox per call.
- `predictSwitches(s, b, active)` mirrors `EnemyCommandPhase.start` (`src/phases/enemy-command-phase.ts:36-106`). A trainer mon that isn't trapped (`isTrapped`) and has an empty move queue switches when `best bench score × (1 − 0.1^(1/enemySwitchCounter)) ≥ avg own score × (isBoss ? 2 : 3)`, sending `getNextSummonIndex`. The counter goes +1 on a switch and −1 (floor 0) on a move. Keep it, run it in `sandbox`, and sequence the counter across doubles slots. A Commander Tatsugiri's command carries `skip` (`skipTurn`, `:40-46`), and `TurnStartPhase` drops that command (`src/phases/turn-start-phase.ts:84`).
- `enemyAction(s, e)` → `{ kind: 'switch', to } | { kind: 'move', dist, tera: b.trainer?.shouldTera(e) ?? false }`. `Trainer.shouldTera` (`src/field/trainer.ts:784-795`, pure) is true in INSTANT_TERA mode for a listed `initialTeamIndex` that isn't yet Terastallized and hasn't fainted.
- `predictedTeras(s, b)` → the active foes whose action this turn Terastallizes. `withPredictedTera(mons, fn)` runs `fn` with `isTerastallized` set and `summonData.addedType` cleared on them, as `TeraPhase.end` does (`src/phases/tera-phase.ts:38-41`). `beforeTera(fn)` takes that back off, and `teraTypeOf(e)` names the type via `getTeraType()` (`pokemon.ts:2353`).

### Planner (30-planner.js)
- `actionOrder(s, a, aMove, b, bMove)` → `P(a acts before b)`. Switches go first. Otherwise mirror `MovePhasePriorityQueue.sortPostSpeed` (`src/queues/move-phase-priority-queue.ts:23-36`), which sorts by, in order:
  1. timing modifier;
  2. `move.getPriority(p, true)` (`move.ts:1191`);
  3. `move.getPriorityModifier(p, true)` (`:1199-1211`: FIRST=2 whenever the `BYPASS_SPEED` tag is on, whatever the ability bracket);
  4. the speed order from `sortInSpeedOrder` (`src/utils/speed-order.ts:21`): `getEffectiveStat(Stat.SPD)` descending, reversed under Trick Room (`:57-82`).

  `BYPASS_SPEED` comes from `TurnStartPhase.start` (`turn-start-phase.ts:70-78`): Quick Draw 30 % with a damaging move (`BypassSpeedChanceAbAttr`, `ab-attrs.ts:5583-5593`), Quick Claw 10 % per stack, max 3 (`BypassSpeedChanceModifier`, `modifier.ts:1555-1576`). Mycelium Might blocks it for status moves. **A speed tie is not a coin flip.** `sortInSpeedOrder` shuffles under `executeWithSeedOffset(…, turn × 1000 + groups.length, waveSeed)` (`speed-order.ts:32-43`) before a stable sort, so the order is fixed for the turn. It is exported, and a sandboxed call on the same list the queue sorts returns the order; in singles the first pop sorts exactly the two move phases (`src/queues/pokemon-phase-priority-queue.ts:8`). The HUD **replays the shuffle rather than calling it** (#178): reaching a module export means 47-biome's chunk scan, which 30-planner sits below and cannot import from, while the draw itself is one `randSeedInt(0, 1)` inside the scene's own `executeWithSeedOffset` — a method on `globalScene`, which restores the RNG state, offset and override itself. So `speedTie` resolves the tie only where the replay is exact: a single battle, both sides using a move, both on the field, this turn. Anything else keeps the 0.5.
- `threatFrom(s, foe, me)` → Σ over `enemyMoveDistribution` of `p × moveOutcome(foe, me, …)`. It exposes the worst case (`max` roll + crit) for the "ko" flag, the expectation for scoring, and `use`: the turn's damage distribution over those moves. Replaces `hits(f, me, true)` + `FOE_MARGIN`.
- `moveOutcome(...).use` → `[{ d, p, n }]`, the damage of one use before the target's HP or a boss bar cuts it, and the hits it lands in. It is the per-hit roll × crit maps convolved over the hit counts, with a miss at 0 (every hit rolls for CHECK_ALL_HITS), cut to 12 points by joining the closest neighbours (`n` averaged). `flinch` is P(a landed use flinches the target) from `FlinchAttr` (`move.ts:6888`) via `MoveEffectAttr.getMoveChance` (`:1758-1776`: Serene Grace's `MoveEffectChanceMultiplierAbAttr`, Shield Dust's `IgnoreMoveEffectsAbAttr`, simulated when `showAbility` is false). It is 0 through Inner Focus (`BattlerTagImmunityAbAttr(FLINCHED)`, `init-abilities.ts:402-403`).
- KO pacing lives in 10-damage (#125, #140); the planner, team plan and catch card call it:
  - `stateOf(target, hp?, bar?)` → `{ hp, bar, revived, tok, facts }`; `hitOn(state, dmg)` → the state after one landed hit, no luck: `calculateBossSegmentDamage` per hit (a hit past a bar by `segSize · 2^k` breaks k more, down to the minimum index; enough damage KOs through every bar), then the final-boss HP − 1 cap.
  - `koCurve(target, use, { hp, bar, start, scale(i, broken), act(i), turnEnd, firstKo, cat })` → `{ by, after1, perChunk }`, `by[n-1]` = P(down by use n), n ≤ 9: KO/survive bucketing (after Foul Play). Each use lands every point of `use` hit by hit on each standing branch. A lethal hit meets the endure token (once a wave, `waveData.endured`; every lethal hit of that use leaves 1 HP), Focus Band and a Reviver Seed (back at `floor(maxHp / 2)`, ending the use). `cat` applies a wild boss's expected Def / SpD rise per bar broken (`barBreakFactors`, `handleBossSegmentCleared`, `pokemon.ts:6973`).
  - Turn end per branch: a heal is capped at max HP only (`Pokemon.heal`, `pokemon.ts:3963`: the bar index never rises back); chip goes through the bar rule and ignores Focus Band and the endure token, as status chip does (`PostTurnStatusEffectPhase`, `pokemon.damage(dmg, false, true)`). Weather chip really ignores bars (`damageAndUpdate(…, ignoreSegments: true)`, `weather-effect-phase.ts:61`), but the signed turn-end change can't tell them apart. Standing branches merge to 4 HP levels per bar, seed and token state.
  - `firstKo` pins use 1 to this turn's exact odds (Sturdy, the roll on the real HP). `after1` hands the standing branches to a later turn. `perChunk`: the uses each bar takes before it more likely than not breaks.
  - `koTurn(by)` is the likely use, `koTurns(by)` the expected one; `useOf(o)` is a record's `use`, or 16 rolls of its likeliest hit count's max (a `hits` record's `dmg`); `koChanceAt(o, hp)` a record's KO odds at another HP.

  Replaces mean-damage turn counts: a 2HKO that lands 48 % of the time is a 3HKO, not a sure 2.
- `exchange(s, me, myPm, foe, { after })` → `{ pWeKoFirst, pTheyKoFirst, turnsWe, turnsThey, eTurnsWe, eTurnsThey, expectedHpLeft, turn1 }`.
  - Turn 1 is exact: order, KO odds, King's Rock and our own flinch.
  - After that, the two KO curves race turn by turn, independently; the order decides a turn where both would KO.
  - `turnsWe` / `turnsThey` are medians (the panel's "N hits"); `eTurns*` are expectations, which scoring uses.
  - `after` starts both curves from an earlier exchange's `turn1` branches. Feeds `fieldPlan` scores.
- Depth 2 (`fieldPlan`): each option's turn 1 is played exactly. From its standing branches, the planner tries the best of our top two moves and a priority move, and keeps one that beats repeating the move by 0.1 (Fake Out then an attack). No minimax: the foe's reply is the AI replica's distribution, re-picked for turn 2. Doubles keep the three best options per slot plus any priority / flinch / first-turn-only move. A follow-up that also hits our partner is never proposed.
- Consistency prior (after PokéLLMon): +0.15 for the move last used (`getLastXMoves(1)`, `pokemon.ts:4392`) by a mon that has been out since before last turn (`tempSummonData.turnCount ≥ 2`). −0.5 for a plan that switches out a mon that came in last turn (`turnCount ≤ 1` past turn 1). `turnCount` starts at 1 (`src/data/pokemon/pokemon-data.ts:268`) and is reset by `resetSummonData` on a switch-in (`pokemon.ts:5147-5156`). `SwitchSummonPhase.onEnd` takes one off for a command or forced switch (`src/phases/switch-summon-phase.ts:238-245`), and `TurnEndPhase.start` adds one (`turn-end-phase.ts:61`).
- Next turn's pick (`likelyMoves` with `next`, or a foe not on the field) is `aiReplay` against our mon. The old damage stand-in for the move score is used only where the replay can't run.
- Status moves as this turn's action (singles; §14). Each status move `statusPlay` can price (setup, a status on the foe, a heal, a hazard in a trainer battle, a typing written onto the foe) is turn 1 of an `exchange` in which we deal nothing.
  - Turn 2 is the best of our top two moves and a priority move from its branches, as in depth 2.
  - The effect is written onto the mons (`withHypothesis`: stat stages, a status, a typing — `summonData.types` and `summonData.addedType`, the two fields `Pokemon.getTypes` reads), so the game's own damage, order and AI replay price the turns after.
  - A typing (Soak, Magic Powder, Forest's Curse, Trick-or-Treat) is ruled out by the game's own conditions where it would do nothing: a Terastallized target, Multitype or RKS System, or a typing the target already has. This turn's incoming hit is still priced on the typing as it stands, as every play here is.
  - It lands with P(we act, not flinched) × accuracy × (1 − P(Protect)), and not at all through an immunity or Magic Bounce. A second Protect succeeds 1 in 3^n (`ProtectAttr.getCondition`, `move.ts:6930-6950`, draws battle RNG). A miss plays on from the unchanged state.
  - A sleep or paralysis that lands before the foe moves cancels this turn's hit too: all of it for sleep, 1 in 8 for paralysis (`MovePhase.checkPara`: `randBattleSeedInt(8) === 0`, `src/phases/move-phase.ts:518-530`). Sleep's later lost attempts go by `STATUS_SKIP`.
  - A heal lifts our HP branches (before its hit when we're faster).
  - A hazard adds `HAZARD_TURNS` (2) per whole HP bar it takes off the trainer's mons still to come.
  - Scored like a depth-2 line minus `STATUS_COST` (0.2). Doubles keep only Protect and Helping Hand.
- A foe's setup: `threatFrom(...).boost` = the expected stages its status moves add per turn (`selfStages`, after Simple / Contrary via `StatStageChangeMultiplierAbAttr` ×2 / ×−1, `init-abilities.ts:647-648,895-896`, and the ±6 cap).
  - `foeCurve` ramps its later hits by the Atk / SpA stages (`setupRamp`).
  - `exchange` ramps our hits by its Def / SpD stages, and the deciding turn's order by its Speed stages once it has had the turns to pass us.
  - Doubles' joint value counts setup as its next two turns' extra damage (`setupDanger`) instead of a flat half.
- `exchange` discounts this turn's hit by the foe's Protect chance unless the move goes through Protect. Toxic's chip in `turnEndCourse` grows by a 16th each turn (`toxicTurnCount / 16`, `src/phases/post-turn-status-effect-phase.ts:46`, incremented by `Status.incrementTurn`, `src/data/status-effect.ts:21`).

### Team plan (35-team-plan.js)
- `tpFight` plays both speed orders each turn, weighted by P(foe first) (token paralysis mixed in, not a 0.5 cut). Each side's damage comes from ≤ 4 levels of its `use` relative to the mean, carrying ≤ 4 HP branches. It returns the likelier ending plus `pWin` / `pLoss` / `pStall`; the beam carries the likelier ending and values every ending by its chance. A foe's hits on a mon not on the field (or from a foe not on it) use its re-picked moves (`next`).
- Send-in after a faint: `Trainer.getNextSummonIndex` (`src/field/trainer.ts:597-626`) picks the best `getPartyMemberMatchupScores` entry (`:551-584`). That is the average of `getMatchupScore(benchMon, ourMon)` over our field, halved per legendary opponent.
  - `getMatchupScore` (`src/field/pokemon.ts:2680-2763`) = `(atkScore + defScore) × min(hpDiff, 1)`, with `hpDiff = benchHp% + (1 − ourHp%)` (`getHpRatio`, rounded to 0.01).
  - ×1.25 if the bench mon outspeeds (`getStat(SPD, false)` off the field, `>=` vs our `getEffectiveStat`, `:2683-2685`), else ×0.5 at 20–40 % HP. The "dying" branch applies only to a mon on the field.
  - With a full-HP bench mon the factor caps at 1, so speed can't matter and ties are common. The game breaks ties with `executeWithSeedOffset(randSeedInt(n), turn << 2)` on the run seed (`trainer.ts:612-621`), which is deterministic for the turn.
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
  `PositionalTagPhase`, `BerryPhase`, `CheckStatusEffectPhase`, `TurnEndPhase` (`src/phase-manager.ts:228-234,589`).
- `unshiftPhase` adds to the level above the current one (`src/phase-tree.ts:66-73`), and `queueDeferred` to a deferred
  level (`src/phase-manager.ts:539-544`). Both run before control returns to level 0.

**`CheckSwitchPhase.start`** ("Will you switch Pokémon?", `src/phases/check-switch-phase.ts:22-82`). It writes UI mode
and may unshift a phase. No RNG. It ends early, in this order:
- when the battle style is Set (`:30`);
- when the mon isn't on the field, after unshifting `SummonMissingPhase` (`:36-39`);
- when no party member after index 0 is allowed in battle (`:42-50`);
- when the mon is `FRENZY`, trapped, or any of our field is `COMMANDED` (`:53-60`).

Otherwise it shows the question, then `CONFIRM`. Yes unshifts `SwitchPhase(INITIAL_SWITCH, slot, isModal false,
doReturn true)` (`:72`).

- **Where it is queued**, always as `pushNew("CheckSwitchPhase", 0, double)`, plus slot 1 in doubles:
  - `EncounterPhase.end` (`src/phases/encounter-phase.ts:598-609`): not a trainer battle, `waveIndex > 1 || !isDaily`,
    and more allowed party members than battlers.
  - `MysteryEncounterBattlePhase.endBattleSetup` (`src/phases/mystery-encounter-phases.ts:440-447`): not a trainer
    battle, `!disableSwitch`, and the same party size.
  - `TitlePhase.end` on loading a session (`src/phases/title-phase.ts:381-391`): the `EncounterPhase` rule.
  - `GameOverPhase` retry (`src/phases/game-over-phase.ts:99-107`): `waveIndex > 1` and not a trainer battle, with no
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
| U-turn / Volt Switch / Flip Turn / Baton Pass / Shed Tail | `ForceSwitchOutAttr.apply` → `leaveField`, `queueDeferred("SwitchPhase", type, slot, true, true)` (`src/data/moves/move.ts:7350,7399-7408`); Baton Pass transfers stages in `SwitchSummonPhase.onEnd` (`src/phases/switch-summon-phase.ts:247-248`) | yes, if the enemy moves later in the turn (its command was chosen against the old mon's slot) | old field this turn; new field next turn |
| Wimp Out / Emergency Exit | `PostDamageForceSwitchAbAttr` → `ForceSwitchOutHelper.switchOutLogic` → `queueDeferred("SwitchPhase", SWITCH, slot, true, true)` (`src/data/abilities/ab-attrs.ts:6003,5730-5744`) | same as above | same |
| Roar / Dragon Tail on us | `ForceSwitchOutAttr.apply` with `FORCE_SWITCH`: `queueDeferred("SwitchSummonPhase", …)` to a bench mon drawn with `user.randBattleSeedInt` (`src/data/moves/move.ts:7389-7398`) | same as above | same |

The faint-replacement `SwitchPhase` is also idle UI (the party screen), so game calls are safe there. Tell it apart
from a mid-turn `SwitchPhase` by `isModal && !doReturn`; the check-switch one has `!isModal`.

---

## 10. Biome choice, and module-private game tables

Read at the pinned tag (`v1.12.0.11`).

**The choice.** `SelectBiomePhase.start` (`src/phases/select-biome-phase.ts:16`) — draws global RND; sets the UI
mode — first calls `resetSeed()` (line 19), then forces END when the stretch ahead
reaches the classic final wave, the Daily final wave or an Endless X50 (lines 26–33). Otherwise it filters the biome's
`biomeLinks`: a plain id stays, `[id, n]` stays when `!randSeedInt(n)` (1/n, line 43). With ≥ 2 left and a
`MapModifier` it opens UiMode 15 OPTION_SELECT with one `{label: getBiomeName(id), handler}` per link (lines 46–60),
else `randSeedItem` picks. The handler closes over the id: a reader sees only the labels. No biome links to END; it is
reached only by the forced rule.

**The tables.** `allBiomes` (`src/data/data-lists.ts:17`, a `Map<BiomeId, Biome>` filled by `initBiomes`,
`src/init/init-biomes.ts:79`; shape `src/@types/biomes.ts:34`: `biomeId, pokemonPool, trainerPool, trainerChance,
weatherPool, terrainPool, bgm?, biomeLinks`), `speciesDataRegistry` (`src/global-species-data-registry.ts:3`, set by
`setSpeciesDataRegistry`, line 5), `getBiomeName` (`src/utils/common.ts:451`, pure) and `trainerConfigs`
(`src/data/trainers/trainer-config.ts:1043`) are module exports, not scene fields: nothing on the scene reaches another
biome's pools. `Arena` keeps only its own (`src/field/arena.ts:93`): `trainerPool`, and a `pokemonPool` merged per tier
as `[...pool[ALL], ...pool[timeOfDay]]` by `updatePoolsForTimeOfDay` (`src/field/arena.ts:546` — writes `pokemonPool`,
`lastTimeOfDay`). That merge runs when `newArena` builds the arena, while `currentBattle` is still the X0 wave, and again
on an X5 wave (`src/battle-scene.ts:1577`): waves X1–X4 spawn from X0's time of day, X5–X0 from X5's. Time of day is
`(wave + waveCycleOffset) % 40`: < 15 DAY, < 20 DUSK, < 35 NIGHT, else DAWN; ABYSS always NIGHT (`Arena.getTimeOfDay`,
`src/field/arena.ts:922`, pure). Pool keys: tier 0–4 COMMON…ULTRA_RARE, 5–8 BOSS…BOSS_ULTRA_RARE
(`src/enums/biome-pool-tier.ts`); time of day -1 ALL, 0 DAWN, 1 DAY, 2 DUSK, 3 NIGHT (`src/enums/time-of-day.ts`). A
gym leader's signature species are closures in `partyMemberFuncs` (`initForGymLeader`,
`src/data/trainers/trainer-config.ts:680`), so a leader is judged by `specialtyType`. How `47-biome.js` reaches these
tables at runtime is a live-bundle matter (its header).

**What the ten waves after a biome choice hold.** A choice at wave X0 covers X1…X10 of the new biome.
`GameMode.isWaveTrainer` (`src/game-mode.ts:206`) — draws global RND: forks per earlier wave, one draw on the stream.

| Wave | Holds | Rule |
|---|---|---|
| fixed or final | not the biome's | `isFixedBattle` / `isWaveFinal` (§12) |
| gym `w % 30 === (offsetGym ? 0 : 20)`, not final | a trainer, always | early return, `src/game-mode.ts:217` |
| X2…X9 | a trainer with 1/`trainerChance` | blocked by a gym or fixed wave in `[max(w−2, X2), min(w+2, X10)]` and by a hit on each earlier wave of that window, each rolled `randSeedInt(c)` in its own fork at offset `v` (lines 227–247): `(1 − 1/c)^k / c` |
| X1, X0 (not gym) | wild | X1 skipped for a sprite bug; X0 is a wild boss |
| Daily | trainer on X5, and on X0 from 20 to 40 | line 215; `getDailyTrainerManipulation` (`src/data/daily-seed/daily-run.ts:279`) can override |

**A trainer.** `Arena.randomTrainerType` (`src/field/arena.ts:524`) — draws global RND: `randSeedInt(512)` through
`generateNonBossBiomeTier` (line 223: ≥ 156 COMMON, ≥ 32 UNCOMMON, ≥ 6 RARE, ≥ 1 SUPER_RARE, 0 ULTRA_RARE; no luck), or
`randSeedInt(64)` through `generateBossBiomeTier` (line 196: ≥ 20, ≥ 6, ≥ 1, 0) when the BOSS tier is non-empty and
`isTrainerBoss` holds (`src/game-mode.ts:256`: the gym wave, outside END unless classic or final; Daily X0 in 20–40) —
**the gym leader is the biome's**. An empty tier drops one at a time; an empty COMMON gives BREEDER; the pick is
`randSeedItem`. Its party, slot by slot, is `Trainer.genNewPartyMemberSpecies` (`src/field/trainer.ts:445`) — draws
global RND: `speciesPools` by the same 512 cut (a nested entry is rerolled until a number, line 472), else
`BattleScene.randomSpecies(w, level, false, speciesFilter)` (`src/battle-scene.ts:2326`, pure but for one
`randSeedItem`): every catchable species passing the filter, taken back to its root. Every config has a filter (no
legendary, sub-legendary, mythical or trainer-forbidden species, `src/data/trainers/trainer-config.ts:199`). It retries
up to 10 times when an evolving pool species came out evolved, a balanced template repeats a type (line 489), the
specialty type doesn't fit, or the species is already in the party (line 517).

**A wild spawn.** `Arena.randomSpecies` (`src/field/arena.ts:577`) — draws global RND. A Daily override species wins
(`getOverrideSpecies`, `src/game-mode.ts:268`). It is a boss spawn when `getEncounterBossSegments(w, level) > 0`, the
BOSS tier is non-empty and the biome isn't END (unless classic or final) (lines 584–589): `randSeedInt(64 − luck/2)`
over the boss cuts, else `randSeedInt(512 − 2·luck)`. A Daily event seed's `forcedWaves[].tier` replaces the roll for
a wave's first spawn (`getDailyForcedWaveBiomePoolTier`, `src/data/daily-seed/daily-run.ts:231`). Empty tiers drop; an
all-empty pool falls back to any catchable species. A legend-like pick is rerolled (up to 10 attempts) while
`getWaveForDifficulty(w, true)` (`src/game-mode.ts:192`; Daily adds 30) is below 80 for BST ≥ 660, else 55
(`checkLegendBST`, `src/field/arena.ts:646`). Luck is `getPartyLuckValue` (§12).

**Evolutions.** `PokemonSpecies.getWildSpeciesForLevel` (`src/data/pokemon-species.ts:1056`) calls
`determineEnemySpecies` (`src/ai/ai-species-gen.ts:106`) — draws global RND — with kind WILD (2), or NORMAL (1) for a
boss; a trainer passes its template's kind (default NORMAL). First `getRequiredPrevo` (line 63): below a prevolution's
threshold for the kind (else its required level; the `min` of both unless that level is 1) the prevolution is returned
outright. Then `calcEvoChance` (line 33) keeps each evolution whose `t = max(required level, evoLevelThreshold[kind])`
the spawn has reached, `randSeedItem` picks one, and it is taken when `randSeedIntRange(t, round(t·m)) ≤ level` (m: 1.2
wild, 1.1 normal, 1 strong), recursing without the prevolution step. So a level-1 trade or item evolution is sure unless
it carries a threshold. Classic wave 20's trainer never evolves (line 127).

**The heal.** `setNextBiomeAndEnd` (`src/phases/select-biome-phase.ts:90`) — phase queue — unshifts `PartyHealPhase`
when the next wave is an X1 and `PARTY_HEAL` allows it (`LimitedSupportChallenge.applyPartyHeal`,
`src/data/challenge.ts:1088`: only value 2 keeps the heal), else a `SelectModifierPhase` in its place.
`PartyHealPhase.start` (`src/phases/party-heal-phase.ts:18`) skips the fainted under `PREVENT_REVIVE` (Hardcore,
`src/data/challenge.ts:1176`). So the fainted fight in the next biome, except under those two — `healRevives` (§12).

`47-biome.js` turns this into odds per wave, taking which wave is which and how likely a trainer is on it from the run
calendar (`trainerOdds`, §12).

---

## 11. The run seed, and previewing a wave before it starts

**The seeded RNG, in one place.** Every seeded draw comes off one generator, Phaser's global `RND`, which the game
re-sows in place. There is no draw counter.

- `randSeedInt(range, min = 0)` (`src/utils/common.ts:101`) — returns `min` **without drawing** when `range <= 1`, else
  `RND.integerInRange(min, range - 1 + min)`: one global draw. `randSeedItem` (`:140`, no draw for a one-item list),
  `randSeedFloat` (`:132`) and `randSeedShuffle` (`:149`) draw from the same generator; `randInt` / `randItem` are
  `Math.random`, unseeded.
- `shiftCharCodes(str, n)` (`src/utils/common.ts:32`) — pure: adds `n` to every char code. Every seed below is
  `shiftCharCodes(base, offset)`.
- `resetSeed(w?)` (`src/battle-scene.ts:2038`) — writes `waveSeed = shiftCharCodes(seed, w ?? currentBattle.waveIndex)`
  and sows the live stream with it. Called at the top of `newBattle` (`:1291`), again by `EncounterPhase` once the
  enemy party exists (`src/phases/encounter-phase.ts:293`, `:307`), by a wave's first reward roll (§19) and by
  `SelectBiomePhase.start` (`src/phases/select-biome-phase.ts:19`).
- `executeWithSeedOffset(fn, offset, seedOverride?)` (`src/battle-scene.ts:2045`) — saves `RND.state()`, `rngOffset`
  and `rngSeedOverride`; sows `shiftCharCodes(seedOverride || seed, offset)`; runs `fn`; puts the three back. It does
  not save `waveSeed` or anything `fn` writes, and has no `try/finally` (a throwing `fn` leaves the fork's stream
  live). This is a **fork**: its draws depend only on the seed and offset, and the live stream carries on as if it never
  ran — for draws made before `fn` returns, so an async `fn` is forked only up to its first `await` (§13).
- The battle stream. `Battle.battleSeed` is `randomString(16, true)` (`src/battle.ts:81`), 16 global draws when the
  `Battle` is built. `Battle.randSeedInt(range, min)` (`src/battle.ts:491`) — no draw for `range <= 1`; otherwise it
  saves the global state, resumes `battleSeedState` or, when that is null, sows `shiftCharCodes(battleSeed, turn << 6)`,
  draws through `randSeedInt`, stores `battleSeedState` and restores the global state and `rngSeedOverride`. It never
  moves the global stream; it writes `battleSeedState`. `incrementTurn()` (`:171`) nulls it, so every turn restarts from
  its own seed. It is reached as `BattleScene.randBattleSeedInt` (`src/battle-scene.ts:1126`) and
  `Pokemon.randBattleSeedInt` (`src/field/pokemon.ts:5638`, which falls back to `randSeedInt` with no battle).

Forks by offset, run seed unless marked: `isWaveTrainer` look-back `w`; ME roll `w * 3000`; which ME `w * 16`; ME
`onInit` `w`; fixed-battle trainer `(seedOffsetWaveIndex || w) << 8`; `new Battle` `w << 3` (**wave** seed); boss bars
`w << 2` (`getEncounterBossSegments`, `src/battle-scene.ts:1964`); a trainer's party members (below); Pokérus
`w + (slot << 8)` (`:2008`); `waveCycleOffset` / `offsetGym` at 0 (`:1940`, `:1952`); speed-tie shuffle
`turn * 1000 + groups` (wave seed, `src/utils/speed-order.ts:34`); `applyShuffledModifiers` `turn << 4` (wave seed,
`src/battle-scene.ts:2905`); Daily luck at 0 (`src/modifier/modifier-type.ts:2906`).

**What a wave's content hangs on.** `newBattle()` (`src/battle-scene.ts:1284`) sows the wave seed at its top, then:

| # | Call | Draws | Stream or fork |
|---|---|---|---|
| 1 | `gameMode.isWaveTrainer(w)` (`src/game-mode.ts:206`) | look-back per earlier wave, then `!randSeedInt(arena.trainerChance)` | look-back forks at `w` (`:237`); the final roll (`:248`) is on the stream. A gym wave (`w % 30 === (offsetGym ? 0 : 20)`, `:217`) and Daily's calendar return before drawing. Skipped entirely when `!gameMode.hasTrainers` (Endless, `src/battle-scene.ts:1450`) |
| 2 | `isWaveMysteryEncounter(type, w)` (`src/battle-scene.ts:3452`) | `randSeedInt(256)` vs the spawn rate | fork `w * 3000`, run seed (`:3487`). The caller then writes `encounterSpawnChance` (`:1463`) |
| 3 | `generateNewBattleTrainer(w)` (`:1480`) | `arena.randomTrainerType` tier + type (`src/field/arena.ts:524`), the double roll, the variant roll, then the `Trainer` constructor's party template (`src/field/trainer.ts:62`) and name(s) (`:77`, `:90`) | stream |
| 3′ | `getFixedBattle(w).getTrainer()` (`src/battle-scene.ts:1409`) | the `Trainer` constructor's template and name | fork `(seedOffsetWaveIndex \|\| w) << 8`, run seed (`:1418`) — replaces 1–3 on a fixed wave |
| 4 | `checkIsDouble(...)` (`:1512`) | the wild double roll, `randSeedInt(getDoubleBattleChance(w))` (`:1535`); a trainer's is its variant, no draw | stream |
| 5 | `new Battle(...)` (`src/battle.ts:109`) | `battleSeed`, then per slot `getLevelForWave` (`:131`: `randSeedFloat` loop, or `RND.realInRange` on a boss wave); a trainer's levels are `getPartyLevels`, no draw | fork `w << 3`, **wave** seed (`src/battle-scene.ts:1325`) |

On a Mystery Encounter wave `EncounterPhase.start` picks *which* encounter with `getMysteryEncounter()`
(`src/battle-scene.ts:3520`) in a fork at `w * 16` (`src/phases/encounter-phase.ts:72`), then runs its `onInit` in a
fork at `w` (`:81`).

**The enemy party** is built in `EncounterPhase.start`. A trainer's `genPartyMember(i)` (`src/field/trainer.ts:310`)
**forks per member** at `waveIndex + (getDerivedType() << 10) + (((useSameSeedForAllMembers ? 0 : i) + 1) << 8)`, or
`getDerivedType() + ((i + 1) << 8)` with `hasStaticParty` (`:435`), run seed. A wild member rides the stream:
`BattleScene.randomSpecies(w, level, true)` (`src/battle-scene.ts:2326`) → `arena.randomSpecies(w, level, 0,
getPartyLuckValue(party))` (`src/field/arena.ts:577`: a luck-shifted tier roll, `randSeedItem` of the pool, up to ten
retries on a legendary BST mismatch); a Golden Bug Net holder's `randSeedInt(10)` (`src/phases/encounter-phase.ts:115`);
then `addEnemyPokemon` (`src/battle-scene.ts:916`). That constructor draws ability, id (the IVs), gender, nature
(`src/field/pokemon.ts:340`–`418`), the moveset and shiny unless shiny-locked (`:6404`–`6408`), a trainer member's IVs
(`:6432`), and a boss's second IV set (`src/battle-scene.ts:941`). `isEncounterShinyLocked()`
(`src/phases/encounter-phase.ts:317`) therefore changes the draw count. The scene wrapper's third argument is
`fromArenaPool`; the arena method's is `attempt`, so calling the arena method with the scene's argument list is a
different draw (retry counter 1, no luck).

**So**: a fork is exact from any point in the run; the stream is only as good as a replay that draws what the game
draws, in order. A fork is exact about its own roll, **not about its inputs**: a generic trainer's members are each
forked, but keyed on a trainer drawn on the stream, so the party is `replay`. Only a fixed battle — kind and trainer
both a table lookup — is exact end to end; a gym wave's *kind* is exact, its trainer is not. `48-preview.js` replays
the table inside `executeWithSeedOffset(fn, w, seed)` (the same sow as `resetSeed(w)`) with `currentBattle` swapped
for the `Battle` it built and `waveSeed` pinned, labels fields `exact` / `replay` / `estimate`, and scores itself on
arrival.

**Side effects of the calls it makes.** Pure: `isFixedBattle` / `getFixedBattle` (`src/game-mode.ts:357`, `:370`;
both run challenge hooks), `isBoss` (`:313`). Draws only inside their own fork: `isWaveMysteryEncounter`,
`getEncounterBossSegments`. Draws wherever called (the preview calls them inside its fork): `isWaveTrainer`,
`generateNewBattleTrainer`, `checkIsDouble`, `randomSpecies`, `addEnemyPokemon`, `genPartyMember`, `new Battle` /
`getLevelForWave`, `getMysteryEncounter`. Writes:
`getPartyLevels` sets a shared party template's `size` to 2 for a double (`src/field/trainer.ts:269`; idempotent, the
real battle does the same); the `Trainer` constructor builds sprites via `addFieldSprite` (`:109`);
`getMysteryEncounter` runs `meetsRequirements()` on the shared encounter templates (assigning their primary /
secondary Pokémon, §13) inside its fork. **Not safe**: `newBattle()` itself — it re-sows the live stream, assigns
`currentBattle`, `field.add`s the trainer (`src/battle-scene.ts:1426`, `:1472`), calls `incrementTurn` and queues
phases in `doPostBattleCleanup` (`:1563`).

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
| `gameMode.isWaveFinal(w)` | `src/game-mode.ts:296` | classic and challenge 200; daily 50; endless every 250 |
| `gameMode.isFixedBattle(w)` | `src/game-mode.ts:357`, table `classicFixedBattles` (`src/data/trainers/fixed-battle-configs.ts:24`, waves `src/enums/fixed-boss-waves.ts`) | 5 youngster; rival 8/25/55/95/145/195; evil team 35/62/64/66/112/114/115/164/165; Elite Four 182/184/186/188; champion 190 |
| the gym rule | `src/game-mode.ts:217`, the early return in `isWaveTrainer` | `w % 30 === (offsetGym ? 0 : 20)`, except the final wave |
| `gameMode.isBoss(w)` | `src/game-mode.ts:313` | every tenth wave |

Only classic and challenge modes carry the table. `isFixedBattle` and `getFixedBattle` (line 370) also ask the
`FIXED_BATTLES` challenge hook, which writes only a throwaway config; Single Generation rewrites the evil team, Elite Four
and champion there (`src/data/challenge.ts:497`). The rules overlap (190 is both the champion and a tenth wave); the
table's order is the precedence the HUD uses. The calendar holds from any point in a run; the roster of a fixed wave
comes from `48-preview.js`'s replay and is only read a few waves out.

**Who the fixed trainers are.** `handleFixedBattle` (`src/battle-scene.ts:1409`) runs `config.getTrainer()` in a fork
at `(seedOffsetWaveIndex || w) << 8` on the run seed and `field.add`s the trainer. Rivals take their variant from the
player's gender (no draw); the youngster rolls `randSeedInt(2)`. Every evil-team wave sets `seedOffsetWave(35)` and the
Elite Four and champion `seedOffsetWave(182)`, so each group rolls in the same fork and the same `randSeedItem` index
picks one team (or one region) for the whole group; admins take `randSeedUniqueItem(choice, 1 | 2)`
(`src/utils/random.ts:41`), so 66, 114 and 164 are different people. In `getRandomTrainerFunc` (`src/battle.ts:582`)
the gender and a grunt's 1/3 double use `randInt`, which is `Math.random` (`src/utils/common.ts:88`): **unseeded, not
replayable**. `new Trainer` (`src/field/trainer.ts:45`) draws a party template (`randSeedItem`) and a name.
`Trainer.genPartyMember` (`src/field/trainer.ts:310`) — forks the run seed; adds the member via `addEnemyPokemon` —
seeds each member at `w + (derivedType << 10) + (((sameSeed ? 0 : i) + 1) << 8)`, or `derivedType + ((i + 1) << 8)`
for `hasStaticParty` (rivals, admins, evil leaders, gym leaders, Elite Four, champions; `trainer-config.ts:459`), whose
party is therefore the same at any wave of the run. A `partyMemberFuncs` slot (negative keys count back from the end,
`index − template.size`) wins over `genNewPartyMemberSpecies` (§10).

**Full heals.** `VictoryPhase.start` (`src/phases/victory-phase.ts:23`) — phase queue — pushes `SelectBiomePhase` when
`hasRandomBiomes || isNewBiome()` (line 125); `isNewBiome` (`src/battle-scene.ts:1271`, pure) is every X0, plus X5 with
short biomes and X49 in Endless and Daily. `setNextBiomeAndEnd` heals entering an X1 (§10). `PartyHealPhase.start` —
writes `hp = getMaxHp()`, `resetStatus`, every `ppUsed = 0`, `arena.playerTerasUsed = 0` — revives the fallen unless
`PREVENT_REVIVE`. So a classic run heals entering 11, 21 … 191 and nowhere else, and **waves 181–190 hold the four
Elite Four fights and the champion with no heal between them**. `VictoryPhase` pushes `SelectModifierPhase` only when
`currentWaveIndex % 10` (line 85): **no rewards screen after a tenth wave** (X0 grants fixed items through
`ModifierRewardPhase` instead), except under Limited Support 1 and 3, whose X1 transition queues one in the heal's place.

**Reward tiers and luck.** `getNewModifierTypeOption` (`src/modifier/modifier-type.ts:2762`) — draws global RND — rolls
`randSeedInt(1024)`: > 255 COMMON, > 60 GREAT, > 12 ULTRA, 1–12 ROGUE, 0 MASTER. For the player pool, when the roll isn't
0 and `allowLuckUpgrades`, it repeats `randSeedInt(floor(128 / ((luck + 4) / 4))) < 4`, adding a tier each hit; a pinned
tier runs the same loop, stopping at an empty tier. So luck is a per-reward chance of a tier upgrade: **3.1 % at luck 0,
14.3 % at luck 14**. `getPartyLuckValue` (line 2906) — pure but for a fork — is, **in Daily, `randSeedInt(15)` in a
fork at offset 0 on the run seed** (or the event seed's luck), not the party's. Elsewhere it sums `getLuck()`
(`src/field/pokemon.ts:1815`: `luck`, plus `fusionLuck` when fused) over members `isAllowedInBattle()`
(`src/field/pokemon.ts:577`), +1 for each whose species the timed event boosts, clamps to 0–14, then adds the event's
`luckBoost` (capped at 14). A fixed battle's `customModifierRewardSettings` pins `guaranteedModifierTiers` and sets
`allowLuckUpgrades: false` for the rival from 25 on and both evil bosses (`src/data/trainers/fixed-battle-configs.ts:48`
and after; read by `getPlayerModifierTypeOptions`, `src/modifier/modifier-type.ts:2496`): luck buys nothing on that
screen as first rolled. **A reroll drops those settings** (`rerollModifiers`,
`src/phases/select-modifier-phase.ts:188`, queues `SelectModifierPhase(rerollCount + 1, tiers)`), so it takes luck
upgrades like any other wave (§19). `getRerollCost` (`src/phases/select-modifier-phase.ts:419`, pure) is
`ceil(wave / 10) × base × 2 ** rerollCount × rerollMultiplier`, base 250, or the summed tier values
`[50, 125, 300, 750, 2000]` when rarities are locked; a negative `rerollMultiplier` returns -1 (no reroll); a cost
modifier applies last.

**The classic final boss (wave 200).** All read, none rolled:

- `generateEnemyModifiers` (`src/battle-scene.ts:2679`) returns early for `currentBattle.isClassicFinalBoss`
  (`src/battle.ts:127`), so **phase 1 carries no held items**; `Pokemon.hasPassive` (`src/field/pokemon.ts:2196`)
  returns false for it unless the Passives challenge is on — **no passive ability**.
- `EnemyPokemon.damage` (`src/field/pokemon.ts:6918`) caps damage at `hp - 1` in form 0 while `bossSegmentIndex < 1`,
  and `getMinimumSegmentIndex` (`src/field/pokemon.ts:6956`) returns 1 in form 0: **phase 1 cannot be knocked out**.
- `DamageAnimPhase.end` (`src/phases/damage-anim-phase.ts:96`) calls `BattleScene.initFinalBossPhaseTwo`
  (`src/battle-scene.ts:3294`) — state writes, phase queue — which gives Eternamax a **non-transferrable Mini Black
  Hole** (`TurnHeldItemTransferModifier`: one of the player's held items every turn), regenerates its moveset at form 1,
  changes form and sets `currentBattle.double = true`: **the fight becomes a double**.
- Movesets are fixed (`EnemyPokemon.generateAndPopulateMoveset`, `src/field/pokemon.ts:6520`): form 0 Eternabeam /
  Sludge Bomb / Flamethrower / **Cosmic Power**; form 1 Dynamax Cannon / Cross Poison / Flamethrower / Recover, built as
  `new PokemonMove(MoveId.RECOVER, 0, -4)` — `ppUp` −4 on a 5-PP move, so **Recover has 1 PP** at normal priority
  (`PokemonMove.getMovePp`, `src/data/moves/pokemon-move.ts:98`). Inverse Battle swaps Flamethrower for Earth Power.
- Bars come from `getEncounterBossSegments(200, level, ETERNATUS, true)` (`src/battle-scene.ts:1964`, pure when forced):
  2, +1 at level ≥ 100, +1 for BST ≥ 670, +1 per 250 waves. Each break boosts a stat picked by weight, +2 for the last
  shield (≥ 3 bars) and the second-last (≥ 5) (`handleBossSegmentCleared`, `src/field/pokemon.ts:6973`) — §3.

**Safe to call this way** (pure reads of the wave index or the player's own party): `gameMode.isWaveFinal` /
`isFixedBattle` / `getFixedBattle` / `isBoss`, `Pokemon.getLuck` / `isAllowedInBattle`, a modifier's `getStackCount()`,
`getPartyLuckValue` (its Daily fork restores the stream). `getFixedBattle(w).getTrainer()` is *not*: it draws, calls
`Math.random`, and builds sprites; `48-preview.js` only calls it inside a fork.

---

## 13. Mystery Encounters: the option screen, its forks, and what the common encounters do

Read from the pinned source; nothing here has been checked against a live encounter yet.

**The screen.** `MysteryEncounterPhase.start` (`src/phases/mystery-encounter-phases.ts:48`) — writes: bumps the seed
offset with `updateSeedOffset()` (`src/data/mystery-encounters/mystery-encounter.ts:551`: `seedOffset ?? waveIndex ×
1000`, then `+ 512`), pushes the encounter onto `encounteredEvents`, and opens `UiMode.MYSTERY_ENCOUNTER` (45, `:66`).
`MysteryEncounterUiHandler.displayEncounterOptions` (`src/ui/handlers/mystery-encounter-ui-handler.ts:350`) calls
`option.meetsRequirements()` once per option and keeps the answers in `optionsMeetsReqs` (`:400`); the labels are text
objects in `optionsContainer`, "view party" last. `processInput` (`:126`) refuses an unmet option only in optionMode
`DISABLED_OR_DEFAULT` (1) or `DISABLED_OR_SPECIAL` (3) (`:152`).

**Requirements are not reads.** `MysteryEncounterOption.meetsRequirements`
(`src/data/mystery-encounters/mystery-encounter-option.ts:90`) writes `primaryPokemon` / `secondaryPokemon`. Without
secondary requirements it takes the **first** qualifier (`:166`) — the mon the game uses when the option opens no
party picker; with `excludePrimaryFromSecondaryRequirements` and secondaries it draws `randSeedInt` for the primary
(`:150`, `:156`). The encounter's own `meetsRequirements` (`src/data/mystery-encounters/mystery-encounter.ts:328`)
draws a **random** primary among the qualifiers (`:411`). Each requirement's `queryParty(party)` only filters, and no
requirement draws. `MoneyRequirement.meetsRequirement`
(`src/data/mystery-encounters/mystery-encounter-requirements.ts:393`) writes `requiredMoney` from
`getWaveMoneyAmount(scalingMultiplier)` (`src/battle-scene.ts:2399`), which is pure arithmetic on the wave index.

**The forks.** `EncounterPhase` runs `onInit` and the dialogue tokens in a fork at `waveIndex`
(`src/phases/encounter-phase.ts:81`). An option's closures run on the run seed at offsets from `getSeedOffset()`
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
(`src/data/mystery-encounters/utils/encounter-phase-utils.ts:137`); a party picker's callback runs later, on the live
stream. The reward *screen* is not in the `× 1000` fork: it is a queued `SelectModifierPhase(0, …)`, whose `start`
re-sows the wave seed (§19). `handleOptionSelect` (`src/phases/mystery-encounter-phases.ts:74`) first calls
`populateDialogueTokensFromRequirements()` (`src/data/mystery-encounters/mystery-encounter.ts:452`) on the live
stream: it re-runs the encounter's and every option's `meetsRequirements()`, so it can draw there and re-assign
primaries, but it can't move the forks.

**Leaving.** `leaveEncounterWithoutBattle(true)` (`src/data/mystery-encounters/utils/encounter-phase-utils.ts:811`)
queues `MysteryEncounterRewardsPhase(addHealPhase)`. With no `doEncounterRewards` set, that unshifts a
`SelectModifierPhase` with `{ fillRemaining: false, rerollMultiplier: -1 }` (`src/phases/mystery-encounter-phases.ts:549`):
the shop with **no free reward and no reroll**, not a heal. `setEncounterRewards(settings)` (`encounter-phase-utils.ts:729`)
unshifts `SelectModifierPhase(0, undefined, settings)`: `fillRemaining: false` is a screen of exactly the guaranteed
items, **pick one**; `fillRemaining: true` tops it up to the normal count with ordinary rolls
(`src/phases/select-modifier-phase.ts:383`).

**The twelve common encounters** (tier weight 66, `src/enums/mystery-encounter-tier.ts:6`, less 6 per common already
seen, `src/battle-scene.ts:3574`; Field Trip is common too but commented out,
`src/data/mystery-encounters/mystery-encounter-biomes.ts:145`). All are gated to waves 10–180
(`src/constants.ts:16`) unless a row says otherwise. Files are `src/data/mystery-encounters/encounters/<name>-encounter.ts`;
bare line numbers in a row are in that file.

| Encounter | Gate | Options, as the source does them | Forked before an `await` |
|---|---|---|---|
| Mysterious Chest | party ≥ 2 (`:44`) | open: `roll = randSeedInt(100)` (`:121`) — ≥ 75 pick of Common×2 + Great×2, ≥ 45 Ultra×3, ≥ 35 Rogue×2, ≥ 30 Master×1 (`:141`–`179`), else **trap**: `getHighestLevelPlayerPokemon(true, false)` is KO'd, then a Gimmighoul boss (level additive 0.5) with normal rewards (`:182`–`198`) · leave | pre ×1: the roll |
| Fight or Flight | — | fight a boss (+2 to one of Atk/Def/SpA/SpD, `randSeedInt(4, 1)` on entry, `:82`) for `misc`, itself a `ModifierTypeOption` (> 160 Master, > 120 Rogue, > 40 Ultra, else Great; TMs and Candy Jars rerolled; `:93`–`113`), catchable · steal it with a `STEALING_MOVES` user, EXP (`:167`) · leave | option ×500: the boss build |
| Department Store Sale | waves 10–100 (`:24`) | pick of 5 TMs (`randSeedInt(5)`: < 2 Common, < 4 Great, else Ultra) · pick of 3 (`randSeedInt(3)`: 0 PP Up, else a vitamin) · pick of 5 (`randSeedInt(5)`: 0 Dire Hit, else an X item) · pick of 4 ball packs (`randSeedInt(65)`: < 10 Poké, < 40 Great, < 60 Ultra, else Rogue) (`:64`–`160`) | option ×500: every roll (no `await`); the exact item is rolled on the reward screen |
| Shady Vitamin Dealer | money ≥ ×1.5; HP ratio ≥ 0.51 (`:46`–`48`) | ×1.5: 2 random vitamins (drawn in the picker callback, `:101`) on a mon over half HP; post: it loses `floor(maxHp / 2)` and `newNature = randSeedInt(25)`, redrawn while equal to its `nature` (`:150`–`156`), 100 EXP · ×5: 2 vitamins on any mon, 100 EXP (`:184`–`224`) · leave | post ×2000: the nature, for a given mon |
| Lost at Sea | — | a Surf learner guides, EXP (`:63`) · a Fly learner guides, EXP (`:81`) · every allowed mon takes `floor(maxHp × 25 %)` (`:108`), never below 1 HP (`applyDamageToPokemon`, `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts:345`) | no draws |
| Fiery Fallout | waves 40–180 (`:71`) | double battle vs 2 Volcarona (+1 SpD/Spe, Fire Spin on both player slots, sun) → party slot 0 gets a random attack-type booster + rewards (`:88`–`300`) · every allowed non-Fire mon (`isOfType(FIRE, { includeTeraType: false })`) takes 20 %, then `burnable[randSeedInt(burnable.length)]` (no status) is burned if `canSetStatus(BURN, true)`, and **its ability is overridden to Heatproof** (`:228`–`251`) · a Fire type or `FIRE_RESISTANT_ABILITIES` mon: no fight, booster + rewards, EXP (`:262`–`291`) | option ×500: the burn target |
| The Strong Stuff | party ≥ 3 allowed, once a run (`:50`–`52`) | drink: the two highest `getSpeciesForm().getBaseStatTotal()` (stable sort, fainted included) get −15, the rest +10 (`:162`–`180`) — every base stat by that, HP by half (`src/modifier/modifier.ts:969`) — then rewards · fight Shuckle (5 bars, +1 Def/SpD, berries; Gastro Acid and Stealth Rock on the player's lead) → Soul Dew + rewards (`:89`–`229`) | no draws; Shuckle is built after an `await` |
| Berries Abound | — | fight a boss → pick of 5 berries + `numBerries` (> 160: 7, > 120: 5, > 40: 4, else 2; `:92`) · race: `d = fastest.getStat(SPD) / (enemySpeed × 1.1)` (`:199`); `d ≥ 1` grabs `max(min(round((d − 1) / 0.08), numBerries), 2)` berries + the pick of 5, no fight, EXP (`:267`); `d < 1` is the fight with the boss +1 Def/SpD/Spe (wave < 50) or all five (`:240`) · leave | option ×500: the 5 berry options (`:202`); `d` is arithmetic |
| Part-Timer | — | a picked mon earns `getWaveMoneyAmount(mult)` × Amulet Coin (`value += floor(value × 0.2 × stacks)`, `src/modifier/modifier.ts:2896`): deliver `mult = clamp(2.5 × Spe / base, 1, 4)`, `base = floor(196 · L / 100) + 5` (`:107`); warehouse the same on `HP + 1.5 (Atk + Def)` against `floor(166 · L / 100) + L + 10 + 1.5 × 2 (floor(166 · L / 100) + 5)` (`:181`); sell (a `CHARMING_MOVES` user) ×2.5 (`:281`). Every move of that mon is left with **at most 2 PP** (`:118`); 100 EXP, normal rewards | no draws |
| Teleporting Hijinks | waves X2–X4, money ≥ ×1.75 (`:64`–`66`) | pay ×1.75, or free with a Steel/Electric mon (+EXP): `BIOME_CANDIDATES` minus the current biome, `[randSeedInt(n)]` (`:195`) — Space, Fairy Cave, Laboratory, Island, Wasteland, Dojo — then an enraged boss there · stay: a boss here, Magnet and Metal Coat among the rewards | option ×500: the destination (before `:200`); the boss there is drawn after |
| Uncommon Breed | — | `misc.pokemon` (level = top party level − 2, egg move `randSeedInt(4)`; `:66`–`82`), not a boss (`:104`) — fight it, it opens with its egg move, catchable · spend 4 random berries: it joins, +2nd egg move · a `CHARMING_MOVES` user: it joins with each IV `max(iv, randSeedInt(31))` (never 31, `:261`), +2nd egg move, EXP; both with rewards | option ×500: the berries, and the charm's IVs (not replayed) |
| Global Trade System | party ≥ 2 allowed for trades (`:153`, `:260`) | trade a mon for one of 3 offers built in `onInit` (`getPokemonTradeOptions`: non-legendary, non-paradox species within ±100 BST, widened until > 20, same level; a legendary gets a fixed pool; `:481`–`538`) · wonder trade: random species, boosted shiny / hidden-ability odds (all in the picker callback, `:270`) · a held item for a random item one tier up (`:433`) · leave | `onInit` fork at `w`: the offers, readable in `misc.tradeOptionsMap` |

`onInit` leaves what it rolled on the encounter: `misc` (Fight or Flight's item, Berries Abound's `numBerries` /
`fastestPokemon` / `enemySpeed`, Uncommon Breed's `pokemon`, the GTS offers, Teleporting Hijinks' `price`) and
`enemyPartyConfigs[0].pokemonConfigs` (species, `level` when fixed, `isBoss`). `initBattleWithEnemyConfig` adds
`max(round(wave / 10 × (levelAdditiveModifier ?? 0)), 0)` to the wave's levels (`encounter-phase-utils.ts:199`), a
config `level` overriding it, and gives an `isBoss` config without `bossSegments` its bars from
`getEncounterBossSegments` (`:302`).

**Safe to call this way** (inside `sandbox`): `encounter.getSeedOffset()`, `executeWithSeedOffset` with a callback
that only draws, a primary requirement's `queryParty`, `getWaveMoneyAmount`, `Pokemon.isOfType` / `canSetStatus(effect,
true)` (§17: it can write `abilitiesApplied`, which `sandbox` restores). **Not safe**: `meetsRequirements()` on an
encounter or an option, `populateDialogueTokensFromRequirements`, any `on…Phase` closure.

**Unmeasured**: every 🔮 outcome is a replay of the source's draw order, never checked against an encounter as it
resolved. A closure that gains an early `await`, or a draw before the one the HUD replays, makes it confidently wrong.

---

## 14. Status moves as a turn's action, and a foe's setup

Read at the pinned tag. The refs are under `30-planner.js`, `10-damage.js` and `20-enemy-ai.js` in
`scripts/hud-deps.ts`.

**What each class of move does when it lands**, as the planner writes it onto the mons (`withHypothesis`, 01-core):
- **Setup.** `StatStageChangeAttr.apply` (`src/data/moves/move.ts:3967-3986`) draws battle RNG for a partial chance,
  then unshifts `StatStageChangePhase` for `getLevels(user)` stages on each stat. It targets the user when
  `selfTarget`, else the move's target. Growth's `getLevels` adds 1 in sun (`:4344-4350`). Howl carries no `selfTarget`
  and still boosts the user, through its `USER_AND_ALLIES` target (`:10599-10602`).
  `StatStageChangeMultiplierAbAttr` scales the change: Simple ×2, Contrary ×−1
  (`src/data/abilities/init-abilities.ts:647-648,895-896`; applied at
  `src/phases/stat-stage-change-phase.ts:93`). Stages clamp to ±6 (`:217`). `CutHpStatStageBoostAttr.apply` (Belly
  Drum) first takes `toDmgValue(maxHp / cutRatio)` (`src/data/moves/move.ts:4368-4369`). `Pokemon.getStatStage` is
  `summonData.statStages[stat − 1]` (`src/field/pokemon.ts:1396-1398`), so writing that array moves every damage,
  accuracy and Speed number the game computes.
- **Status.**
  - **Landing.** `StatusEffectAttr.apply` → `trySetStatus` (`src/data/moves/move.ts:3107-3117`). A chance < 0 (every
    status move) always tries; otherwise it draws `randBattleSeedInt(100)`.
  - **Sleep.** `doSetStatus` rolls the length on the battle stream: `randBattleSeedInt(3) === 0 ? 2 : 3`
    (`src/field/pokemon.ts:4987-4990`). `MovePhase.checkSleep` counts down before the check and wakes at ≤ 0
    (`src/phases/move-phase.ts:317-340`), so sleep cancels the next 1 or 2 attempts. Early Bird subtracts one more
    (`src/data/abilities/ab-attrs.ts:5066-5068`).
  - **Paralysis.** It halves Speed in `getEffectiveStat` (`src/field/pokemon.ts:1555-1557`), and `MovePhase.checkPara`
    cancels a move on `randBattleSeedInt(8) === 0` (`src/phases/move-phase.ts:518-530`).
  - **Burn** halves physical damage in `getAttackDamage` (`src/field/pokemon.ts:3688-3695`).
  - **Toxic.** `PostTurnStatusEffectPhase` calls `Status.incrementTurn` first and then deals
    `toDmgValue(maxHp × toxicTurnCount / 16)` (`src/phases/post-turn-status-effect-phase.ts:26,46`;
    `src/data/status-effect.ts:21-22`). That is `(count + 1)/16` of the count read before the turn ends.
  - **Immunity to a status move.** It comes from `getMoveEffectiveness` (`src/field/pokemon.ts:2479`): a type chart the
    move respects (`RespectAttackTypeImmunityAttr`, `:2497`; Thunder Wave into Ground), a powder move into Grass
    (`Move.isTypeImmune`, `src/data/moves/move.ts:457-466`), `MoveImmunityAbAttr` such as Good as Gold (`:2525`), or
    a Substitute (`:2556-2558`). It also comes from `canSetStatus` (`:4764`).
  - **Magic Bounce** (`ReflectStatusMoveAbAttr`, `src/data/abilities/ab-attrs.ts:5268`) sends the move back.
- **Heal.**
  - `HealAttr.apply` unshifts a `PokemonHealPhase` for `toDmgValue(maxHp × healRatio)`
    (`src/data/moves/move.ts:2461-2478`).
  - `HealAttr.canApply` fails at full HP, and queues a message only inside a `MovePhase` (`:2487-2503`).
  - `WeatherHealAttr` reads `getEffectiveWeatherForMove(user)` (`:2743`), which honours
    `PreAttackWeatherOverrideAbAttr` before suppression (`src/data/weather.ts:233-248`). The HUD's `effectiveWeather`
    (`30-planner.js`) does the same, so an override beats a Cloud Nine on the field and only the live weather is
    suppressible. It reads the attribute's `weatherType` by name: an override the live bundle carries under another
    name is simply not found, and the live weather stands — a quiet miss, so it wants a live look.
  - `PlantHealAttr` (Synthesis, Moonlight, Morning Sun) heals ⅔ in sun or harsh sun; ¼ in rain, heavy rain, sand,
    hail, snow or fog; ½ otherwise (`src/data/moves/move.ts:2752-2769`).
  - `SandHealAttr` (Shore Up) heals ⅔ in sand (`:2771-2780`), and `BoostHealAttr` its boosted ratio when its condition
    holds (`:2786`).
- **Hazards.**
  - `AddArenaTrapTagAttr.getCondition` fails once the tag can't take another layer (`canAdd`;
    `src/data/moves/move.ts:7095-7104`, `src/data/arena-tag.ts:806`).
  - On a switch-in, `EntryHazardTag.apply` (`src/data/arena-tag.ts:832-842`) skips an ungrounded mon unless the tag
    isn't grounded-only. Only Stealth Rock isn't (`:961`).
  - Stealth Rock takes `0.125 × Rock effectiveness` of max HP (`:981-984`), and Spikes `1 / (10 − 2·layers)`
    (`:945-948`), both through `DamagingTrapTag.activateTrap`, where Magic Guard (`BlockNonDirectDamageAbAttr`) cancels
    them (`:877-890`).
  - Toxic Spikes poison, or badly poison at 2 layers, and a grounded Poison type removes them (`:1016-1030`).
- **Typing.** Both moves write one field and nothing else, which is why a hypothesis can stand in for them.
  - `ChangeTypeAttr.apply` sets `target.summonData.types = [type]` (Soak → Water, Magic Powder → Psychic;
    `src/data/moves/move.ts:7836-7838`). Its `getCondition` (`:7850-7858`) fails on a Terastallized target, on
    Multitype or RKS System, and when the target is already that one type.
  - `AddTypeAttr.apply` sets `target.summonData.addedType` (Forest's Curse → Grass, Trick-or-Treat → Ghost;
    `:7872-7873`). Its `getCondition` (`:7886-7888`) fails on a Terastallized target and on one already of that type.
  - `Pokemon.getTypes` (`src/field/pokemon.ts:1962-1999`) returns `[teraType]` alone when Terastallized — hence both
    conditions — else `getBaseTypes`, which is `summonData.types` whenever that array is non-empty
    (`:2004-2007`), with `summonData.addedType` added on top (`:1994-1995`). So writing those two fields moves every
    number the game computes from typing: the chart, STAB, the AI's own scores, and a foe's matchup score.
  - Neither field is `summonData` state the HUD has to invent: the write is exactly the game's, and `withHypothesis`
    puts the previous value back.
- **Protect.** `ProtectAttr.getCondition` (`src/data/moves/move.ts:6930-6951`): the n-th success in a row passes when
  `randBattleSeedInt(3^n) === 0`, a battle-stream draw. `MoveEffectPhase.protectedCheck` lets a move through when
  `doesFlagEffectApply({ flag: IGNORE_PROTECT })` holds (Feint; Unseen Fist on contact;
  `src/phases/move-effect-phase.ts:497-527`, `src/data/moves/move.ts:893`).
- **Stopped before damage.** `MovePhase.secondFailureCheck` cancels a move in primordial weather
  (`src/phases/move-phase.ts:716-730`; `Weather.isMoveWeatherCancelled`: a Water attack in harsh sun, Fire in heavy
  rain, `src/data/weather.ts:77-88`). `thirdFailureCheck` cancels a non-spread priority move aimed at a grounded foe
  under Psychic Terrain (`src/phases/move-phase.ts:851-860`; `src/field/arena.ts:487-497`). `getAttackDamage` sees
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
  branch below 20 % (`src/field/pokemon.ts:2734-2760`). So the further the chip drives the foe, the lower its own
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

`50-items.js` judges these rewards on the member they'd go to; `50-shop.js` keeps needs, TMs, balls and the tier
fallback. The HUD calls only select filters and `getMaxExpLevel`; everything else here is restated from the source.

**Ids.** `WeightedModifierType` stamps each pool entry with its key in `modifierTypeInitObj`
(`src/modifier/modifier-type.ts:1750`), and `ModifierTypeGenerator.generateType` (`:291`) — draws through its
generator; writes only the new type — copies the generator's id and tier onto what it builds. So generated rewards
carry the generator's id (`MINT`, `BERRY`, `BASE_STAT_BOOSTER`, `RARE_SPECIES_STAT_BOOSTER`, `EVOLUTION_ITEM`,
`TERA_SHARD` …) and are told apart by field: `nature` (`:687`), `berryType` (`:787`), `stat` (`:934`), `key`
(`:876`), `teraType` (`:424`), `moveType` (`:839`), `evolutionItem` (`:1166`). Plain items keep their own id
(`LEFTOVERS`). TypeScript `private` / `protected` fields are ordinary properties at runtime.

**Held items.** `PokemonHeldItemModifierType`'s select filter (`src/modifier/modifier-type.ts:392`) — pure: it builds
a throwaway modifier and checks **only the stack limit** (`inoperable` when the max is 0, `tooMany` at the max): not
the species (a Leek or Light Ball passes for anyone), not whether an Eviolite holder can evolve, not whether the holder
has a move of a type booster's type. Per stack, and the max (`src/modifier/modifier.ts`):

| Item | Effect a stack | Max |
|---|---|---|
| Leftovers (`TurnHealModifier`, `:1630`) | `maxHp / 16` at turn end, below full HP; queues a heal phase | 4 |
| Shell Bell (`HitHealModifier`, `:1724`) | `damage / 8`, below full HP | 4 |
| Focus Band (`SurviveDamageModifier`, `:1520`) | 10 % to survive a KO hit (`randBattleSeedInt(10) < stacks`) | 5 |
| Quick Claw (`BypassSpeedChanceModifier`, `:1556`) | 10 % to move first in its bracket (battle stream) | 3 |
| King's Rock (`FlinchChanceModifier`, `:1582`) | 10 % flinch (battle stream) | 3 |
| Reviver Seed (`PokemonInstantReviveModifier`, `:1906`) | revive at ½ HP once | 1 |
| Scope Lens / Leek (`CritBoosterModifier`, `:1348`) | +1 / +2 crit stages (Leek: Farfetch'd, Galarian Farfetch'd, Sirfetch'd, `src/modifier/modifier-type.ts:2027`) | 1 |
| Eviolite (`EvolutionStatBoosterModifier`, `:1187`) | ×1.5 Def / SpD while the species has evolutions; ×1.25 when one fusion half can't evolve; none while `isMax()` (G-Max, Eternamax) | 1 |
| Toxic / Flame Orb (`TurnStatusEffectModifier`, `:1671`) | badly poisons / burns the holder; either blocks the other | 1 |
| Mystical Rock (`FieldEffectModifier`, `:1992`) | the holder's weather / terrain +2 turns | 2 |
| Soul Dew (`PokemonNatureWeightModifier`, `:2636`) | a non-neutral nature multiplier 0.1 further from 1 — both ways | 10 |
| Grip Claw (`ContactHeldItemTransferChanceModifier`, `modifier.ts:3269`) | 10 % to steal an item after **any** attack (`src/phases/move-effect-phase.ts:814`), rolled with `randSeedFloat` on the global stream (`src/modifier/modifier.ts:3300`) | 5 |
| Wide Lens (`PokemonMoveAccuracyBoosterModifier`, `:2650`) | +5 accuracy | 3 |
| Multi Lens (`PokemonMultiHitModifier`, `:2702`) | +1 hit; first hit ×(1 − ¼·stacks), extras ×¼ — **the same total damage** | 2 |
| Attack type booster (`AttackTypeBoosterModifier`, `:1415`) | power ×(1 + 0.2·stacks) | 99 |
| Species booster (`SpeciesStatBoosterModifier`, `:1243`) | ×2 to its stats, its species only (Light Ball, Thick Club, Metal / Quick Powder, DeepSea Tooth / Scale) | 1 |
| Vitamin (`BaseStatModifier`, `:856`) | base stat ×(1 + 0.1·stacks) | the stat's IV (`:864`) |
| Berry (`BerryModifier`, `:1795`) | Sitrus / Lum / Leppa / Enigma max 2, the rest 3 | 2–3 |

Who benefits comes from the game's own pool weights where it has one (`initUltraModifierPool`,
`src/modifier/init-modifier-pools.ts:341`; weight functions read, never draw or write). A status orb (`:396`, `:442`)
weighs in for a member holding neither orb that it can status (`canSetStatus(…, quiet)`) and that has Toxic Boost /
Poison Heal (Flare Boost for the Flame Orb), or Guts / Quick Feet / Marvel Scale / Magic Guard without the opposite
ability, or knows Facade / Psycho Shift; a Mystical Rock (`:488`) for a weather or terrain setter by ability or move,
below its max. Lucky and Golden Eggs are only in the wild and trainer pools (`:51`–`55`, `:672`).

**Mints.** `PokemonNatureChangeModifierType.nature`; the filter (`src/modifier/modifier-type.ts:698`, pure) rejects the
member's current nature. Picking it calls `setCustomNature` (`src/field/pokemon.ts:1654`) — writes
`customPokemonData.nature`, recalculates stats, unlocks the nature in save data — which `getNature()` (`:1644`, pure)
returns. The `Nature` enum (`src/enums/nature.ts:1`) is the grid `5·raised + lowered` over `[Atk, Def, Spe, SpA,
SpD]`, neutral on the diagonal. There is **no Ability Capsule** at this tag; the Ability Charm
(`src/modifier/modifier.ts:2981`) only multiplies a wild mon's hidden-ability chance by `2^(−1 − stacks)` (1/256 →
1/64 … 1/8, 4 stacks).

**EXP and the level cap.** `getMaxExpLevel(ignoreLevelCap)` (`src/battle-scene.ts:2310`) — pure: `w =
getWaveForDifficulty(ceil(wave / 10) × 10)` (the wave itself outside Daily), cap `ceil((1 + w/2 + (w/25)²) × 1.2 / 2) ×
2 + 2` (wave 10 → 10, 20 → 16, 50 → 38, 200 → 200); with `ignoreLevelCap`, `MAX_SAFE_INTEGER`. `applyPartyExp`
(`:3332`, §17) shares EXP only among members **below** the cap — a member at it gets nothing and its share is not
passed on — and `PlayerPokemon.addExp` (`src/field/pokemon.ts:6329`, writes `exp` / `level`) stops at it. Exp Share
gives the bench `0.2 × stacks` of a participant's share; EXP Charms multiply every member's share in `ExpPhase`.
**Rare Candy ignores the cap**: `PokemonLevelIncrementModifier.apply` (`src/modifier/modifier.ts:2263`) checks
`getMaxExpLevel(true)`, writes `level` / `exp` and queues a `LevelUpPhase`, so it is the only way to level a member at
the cap. EXP Balance and the Oval Charm aren't in any reward pool at this tag.

**Evolution items.** `EvolutionItemModifierType`'s filter (`src/modifier/modifier-type.ts:1171`, pure) runs the
evolution's full `validate` (level, form, condition such as time of day) and refuses Gigantamax; taking the item
applies at once and `EvolutionItemModifier.apply` (`src/modifier/modifier.ts:2338`) unshifts the `EvolutionPhase`. A
form-change item's filter (`src/modifier/modifier-type.ts:1224`) only checks the species' item trigger; its generator
(`:1575`, draws) is what checks Mega Bracelet / Dynamax Band access.

**Luck and locking.** Party luck is already on the ⚑ card (§12). A Lock Capsule keeps rarities on a reroll, but its
pool weight is 0 in classic (`src/modifier/init-modifier-pools.ts:580`); locked tiers can still be upgraded by luck
(§19).

**Unmeasured.** None of this has met a live rewards screen, and the weights (a first cut on the card's 10-a-tier
scale) are untested against how a strong player would rank them.

---

## 16. TMs: who can be taught, and how often battles are doubles

Read at the pinned tag (`v1.12.0.11`). `50-shop.js` judges a TM with the learn card's own decision (`learnAdvice`,
`40-learn.js`); this section is what it reads besides the move.

**Fainted members.** `TmModifierType`'s select filter (`src/modifier/modifier-type.ts:1128`) is
`isTmCompatible(moveId, true)` and nothing else (`PlayerPokemon.isTmCompatible`, `src/field/pokemon.ts:5882`, pure:
`getCompatibleTms` at line 5858 — the species' and fusion's TMs minus known moves). `PartyUiHandler.updateOptions`
(`src/ui/handlers/party-ui-handler.ts:1382`) offers `TEACH` in `PartyUiMode.TM_MODIFIER` (line 1452) whoever the cursor
is on, fainted or not. The one exception is Hardcore (`Challenges.HARDCORE`, 9): a fainted member there goes through
`updateOptionsHardcore` (line 1512), which has no TM case, so it is offered nothing to teach. The TM pool
(`TmModifierTypeGenerator`, `src/modifier/modifier-type.ts:1500` — draws global RND) takes
`getCompatibleTms(true, true, true)` over the **whole** party (known, level-up and already-used TMs removed), keeps the
tier's, and picks with `randSeedInt`. The card considers every member outside Hardcore, the living ones in it, and marks
a fainted recipient.

**Double battles.** `newBattle` asks `checkIsDouble` (`src/battle-scene.ts:1512`, draws global RND) every wave:

| Wave | Double when |
|---|---|
| final wave (`isWaveFinal`), Endless boss (`isEndlessBoss`, `src/game-mode.ts:329`), Mystery Encounter | never |
| fixed battle whose config sets `double` | that value (no classic config calls `setDouble`) |
| wild | `randSeedInt(getDoubleBattleChance(w)) === 0` |
| any trainer, fixed ones included | the trainer's `DOUBLE` variant |

A generic trainer's variant comes from `generateNewBattleTrainer` (`src/battle-scene.ts:1481`): `doubleOnly` always, no
`hasDouble` (or a `trainerTypeDouble` other than Tate & Liza) never, else the same roll. A fixed evil-team grunt is
double on `randInt(3) === 0`, which is unseeded (§12).

`getDoubleBattleChance(w)` (`src/battle-scene.ts:1261`) starts at **8** (**32** on an X0 wave), is divided by **4** by
each `DoubleBattleChanceBoosterModifier` (`src/modifier/modifier.ts:461`) — one per lure kind, since `match` requires
the same `maxBattles` (Lure / Super Lure / Max Lure: 10 / 15 / 30 battles); taking one the party already has only
resets its count (`LapsingPersistentModifier.add`, `src/modifier/modifier.ts:373`) — and by 4 again for each mon in
`getPlayerField()` with `DoubleBattleChanceAbAttr` (`src/data/abilities/ab-attrs.ts:232`: Illuminate, Arena Trap, No
Guard, Commander, `src/data/abilities/init-abilities.ts:380,567,716,1930`), floored at 1. It is pure but for
`applyAbAttrs` bookkeeping (§0). `getPlayerField` (`src/battle-scene.ts:759`) is party slot 0, and slot 1 when the
battle before was a double, read when `newBattle` runs. `BattleEndPhase.start` (`src/phases/battle-end-phase.ts:66`)
lapses every `LapsingPersistentModifier` before `SelectModifierPhase`, so on the rewards screen a lure's `battleCount`
is the number of battles ahead it still covers.

A TM stays for the run, so the rewards card judges its spread bonus (×1.15 in the learn scorer) and an ally move's
worth by `doubleOdds` (`49-ahead.js`): the expected share of double battles over the next 10 waves at those odds, each
lure counted only for the battles it has left. A fixed battle counts as single, and Mystery Encounter waves count as
battles, since whether a wave is one is itself a roll. At base odds that is ~12 %, a +2 % nudge; under a fresh lure
~46 %. The learn card keeps the current battle's flag.

**Spread damage.** `getAttackDamage` multiplies by 0.75 only when a move has more than one target
(`src/field/pokemon.ts:3654-3656`), so a spread move loses nothing in a single battle; the bonus is only ever an upside.

**Status moves against the roster ahead (#122).** A learned move is kept for the run, so both the learn card and the
TM advice hand `learnAdvice` the same foes: the next big fight's, from `49-ahead.js` (`learnRoster`), which reads a
roster only within 5 waves. With none, nothing below applies. Only an inflicted status and a disrupting tag are scaled,
each decided from what the preview hands over per foe (types, ability, passive, moveset). Paths relative to `src/`:

- **Can a status move reach the foe at all.** Status moves ignore the type chart unless they carry
  `RespectAttackTypeImmunityAttr` (`field/pokemon.ts:2496-2500`), which only Thunder Wave has (`data/moves/move.ts:9726`):
  it misses Ground types. Powder moves fail on Grass types (`Move.isTypeImmune`, `data/moves/move.ts:463-467`;
  `field/pokemon.ts:2502-2504`) and on Overcoat (`data/abilities/init-abilities.ts:981-986`). A Prankster user's status
  moves fail on Dark types (`data/moves/move.ts:469-472`). `TypeImmunityAbAttr.canApply` checks no move category
  (`data/abilities/ab-attrs.ts:401-407`), so Volt Absorb / Lightning Rod / Motor Drive take Thunder Wave, Flash Fire /
  Well-Baked Body Will-O-Wisp, Sap Sipper the Grass powders; Levitate only stops attacks (`ab-attrs.ts:431`). Magic
  Bounce reflects every `REFLECTABLE` move (`init-abilities.ts:1074-1077`, `phases/move-effect-phase.ts:998-1004`), and
  Good as Gold blocks every status move not aimed at a side (`init-abilities.ts:1973-1983`). Mold Breaker ignores all
  of these but the unsuppressable Comatose and Shields Down (`init-abilities.ts:1509,1373`).
- **Inflicted status** (`Pokemon.canSetStatus`, `field/pokemon.ts:4764`): Poison and Toxic miss Poison and Steel types
  unless the user has Corrosion (`:4792-4815`, `init-abilities.ts:1497-1503`), paralysis Electric, freeze Ice, burn
  Fire; sleep has no type immunity. Then `StatusEffectImmunityAbAttr` (`immuneEffects`, empty = every status,
  `ab-attrs.ts:3206-3222`): Limber paralysis, Insomnia and Vital Spirit sleep, Immunity poison, Magma Armor freeze, Water
  Veil / Water Bubble / Thermal Exchange burn, Purifying Salt and Comatose all; Leaf Guard (sun) and Shields Down (form)
  are left out. The side-wide veils cover the foe itself (`field/pokemon.ts:4846-4858`): Pastel Veil poison, Sweet Veil
  sleep, Flower Veil everything on a Grass type. Scaled by the share of the roster it lands on (a boss weighs one per
  health bar), keeping 0.3 of its value into a roster that takes none of it.
- **Disruption** (`data/battler-tags.ts`): Taunt stops every status move (`TauntTag.isMoveRestricted`, `:3384`); Heal
  Block stops `healBlockedMoves` (`:2965`, `data/moves/invalid-moves.ts:276`: recovery and drain) and cancels every heal
  in `PokemonHealPhase` (`phases/pokemon-heal-phase.ts:69-74`), Leftovers included, which the preview can't see; Encore
  needs a last move to lock (`EncoreTag.canAdd`, `:1325`), and is worth most locking a foe into a status move. Oblivious
  blocks only Taunt (`init-abilities.ts:276`), Aroma Veil Taunt, Encore, Heal Block, Disable and Torment
  (`:1126-1133`). A disrupting move with something to take away is worth ×1.4 plus 0.4 × the share of the roster it
  bites on, ×0.3 with nothing; Disable and Torment only by the share they land on. The preview lists a foe's
  `statusMoves` and `healMoves` (recovery attrs and `HitHealAttr`) for this.
- A roster whose foes aren't `exact` (a generic trainer's replay) moves a score half as far.

**Unmeasured.** The size of the spread bonus itself (a first cut), and every roster multiplier above.

---

## 17. The team audit: relearning, held items, EXP, status immunity and speed

`49-audit.js` checks how the party is built, between waves, on the rewards card. It calls one game function
(`getLearnableLevelMoves`) and scores moves with the learn card's scorer (`40-learn.js`); the rest is below.

**Memory Mushroom.** `RememberMoveModifierType`'s select filter (`src/modifier/modifier-type.ts:730`) greys out a
member whose `getLearnableLevelMoves()` is empty. `RememberMoveModifier.apply` (`src/modifier/modifier.ts:2319`)
— phase queue: unshifts a `LearnMovePhase` with `getLearnableLevelMoves()[i][1]`. `Pokemon.getLearnableLevelMoves`
(`src/field/pokemon.ts:1922`) — pure, returns `[level | null, MoveId, source][]`: `getLevelMoves(1, true, true, true)`
(evolution, prevolution and relearner moves; the fusion partner's are added by the learnset code,
`src/field/learnsets.ts:230`) cut to levels ≤ the mon's (`:163`), plus unlocked egg moves when `metBiome === -1`
outside Daily and Fresh Start (`src/field/pokemon.ts:1925`), plus every used TM (`:1933`), minus known moves
(`:1941`), sorted by source. The mushroom is a GREAT reward weighted `min(1 + floor(w / 30), 4)` on
`w = getWaveForDifficulty(wave, true)` (`src/modifier/init-modifier-pools.ts:293`), a shop item from wave 81 (`src/modifier/modifier-type.ts:2651`, rows cut
at `ceil((wave + 10) / 30)`), and a guaranteed Mysterious Challengers / Weird Dream reward. Taking it costs nothing and
re-queues a copy of the reward phase (`src/phases/select-modifier-phase.ts:275`). The rewards card gives it to the
member whose relearn list holds the biggest learn-card upgrade.

**No unattached held items.** A held item is a `PokemonHeldItemModifier` with a `pokemonId`
(`src/modifier/modifier.ts:656`). It is created with its holder — the reward / shop path's
`newModifier(party[slot])` once a slot is picked (`src/phases/select-modifier-phase.ts:356`) — or cloned onto a new
holder by `tryTransferHeldItemModifier` (`src/battle-scene.ts:2537`; theft, the transfer screen, encounters).
`BattleScene.updateModifiers` (`:2781`) — writes `modifiers`: deletes any whose holder `getPokemonById` (`:849`)
can't find, or that no longer has the item's species. Releasing (or fusing) a mon deletes its items
(`removePartyMemberModifiers`, `:2665`); a fainted mon keeps them. So "held items sitting in the bag" can't happen,
and the audit has no such check.

**EXP.** `BattleScene.applyPartyExp` (`src/battle-scene.ts:3332`) — no draw; writes friendship and Macho Brace stacks
and unshifts the EXP phases. Only non-fainted members below `getMaxExpLevel()` get a share (`:3345`): a participant
`1 / participants` (+0.2 a `MultipleParticipantExpBonusModifier` stack when several fought), a non-participant
nothing, or `0.2 · EXP. All stacks / participants` with EXP. All (`ExpShareModifier`, 5 stacks); then ×1.5 for a
trainer, the encounter's `expMultiplier`, ×1.5 Pokérus and Lucky / Golden Egg (`:3355`–`3397`). The charms
(`ExpBoosterModifier`: +25 % / +60 % / +100 %, 99 / 30 / 10 stacks) multiply each share later, in `ExpPhase` /
`ShowPartyExpBarPhase` (`src/phases/exp-phase.ts:28`, `src/phases/show-party-exp-bar-phase.ts:23`). EXP. Balance
exists (`battle-scene.ts:3401`) but is in no pool. So a party at the cap gains nothing from any EXP item, and a member far behind
the carry only catches up by fighting or through EXP. All.

**Status immunity.** `Pokemon.canSetStatus(effect, quiet, …)` (`src/field/pokemon.ts:4766`) — no draw, but not a
read: the Corrosion check applies ability attributes unsimulated and writes the source's `abilitiesApplied` (§0), and
`quiet = false` shows messages. It refuses: an existing status (`:4774`); anything under Misty Terrain, grounded
(`:4778`); poison and toxic on Poison or Steel unless the source's `IgnoreTypeStatusEffectImmunityAbAttr` (Corrosion)
cancels it (`:4792`); paralysis on Electric (`:4818`); sleep in Electric Terrain, grounded (`:4820`); freeze on Ice
or in sun (`:4825`); burn on Fire (`:4833`); a status-immunity ability on the target or its ally (`:4845`);
Safeguard (`:4865`). The audit uses the type checks only.

**Priority and speed.** `Move.getPriority(user, simulated = true)` (`src/data/moves/move.ts:1191`) — pure when
simulated: `move.priority`, then `IncrementMovePriorityAttr`, then `ChangeMovePriorityAbAttr` — Prankster +1 on status
moves, Gale Wings +1 on Flying moves at full HP, Triage +3 on healing moves (`src/data/abilities/init-abilities.ts:1083`,
`:1204`, `:1411`). Only Gale Wings makes an attack faster, so it is the one ability the audit counts. On every pop the
move queue runs `sortInSpeedOrder` (`src/utils/speed-order.ts:21`) — groups shuffled in a fork at
`turn * 1000 + groups` on the wave seed (`:35`), stable-sorted by `getEffectiveStat(SPD)` descending, reversed under
Trick Room (`:79`) — then sorts by timing modifier, `getPriority` and the in-bracket modifier (Quick Claw)
(`src/queues/move-phase-priority-queue.ts:23`, `:73`). The audit compares raw `getStat(SPD)` on both sides — stages,
items and abilities move during a fight.

**Mega and Tera** (not audited). A Mega Bracelet only lets MEGA / PRIMAL form-change items into the reward pool
(`src/modifier/modifier-type.ts:1591`); attaching the stone applies the modifier at once (`src/battle-scene.ts:2427`),
which queues the form-change phase (`:3013`). A Tera is limited by `MAX_TERAS_PER_ARENA = 1` (`src/constants.ts:114`)
on `arena.playerTerasUsed` (`src/phases/tera-phase.ts:47`), reset by a new `Arena` (`src/battle-scene.ts:1623`), a
party heal (`src/phases/party-heal-phase.ts:48`) or post-battle cleanup with a Terapagos (`src/battle-scene.ts:1598`).
Neither leaves an "owned but unused" state the audit could read before a fight.

**Unmeasured.** Every threshold is a first cut: a shared weakness at two members and a third of the party with no
resist, a dead status slot below 20 on the learn scorer's scale, an attack off a stat under 75 % of the other one,
"behind" at 5 levels and under three quarters of the carry's level, a relearn worth naming at +10 power.

---

## 18. Drain, on-KO boosts, and what a switch-in takes

Read at the pinned tag (`v1.12.0.11`), for the battle guidance gaps a Guzma fight (wave 165) exposed: a draining
Golisopod out-healed the damage the HUD promised, and a Buzzwole with Beast Boost was fed KOs.

**Drain.**
- **The attribute.** `HitHealAttr` is a self-targeted `MoveEffectAttr` (`src/data/moves/move.ts:2845-2854`) with the
  default `POST_APPLY` trigger (`:1687-1688`). `MoveEffectPhase.applyMoveEffects` fires it after **every hit**
  (`src/phases/move-effect-phase.ts:573-581`).
- **The amount.** `getHealAmount` is `toDmgValue(user.turnData.singleHitDamageDealt × healRatio)`
  (`src/data/moves/move.ts:2897-2900`). `singleHitDamageDealt` is `damageAndUpdate`'s return in `applyMoveDamage`,
  capped by the target's HP and a boss bar, and written only when > 0 (`src/phases/move-effect-phase.ts:681-709`).
  `apply` unshifts a `PokemonHealPhase` for it (`src/data/moves/move.ts:2878`).
- **`healRatio`** defaults to ½ (`:2852`). Draining Kiss and Oblivion Wing carry ¾ (`:11427-11428,11570-11571`),
  Bouncy Bubble 1 (`:11971-11972`). Strength Sap uses `healStat` and heals by the target's stat (`:11715-11716`): a
  status move, not a drain.
- **`PokemonHealPhase.end`** (`src/phases/pokemon-heal-phase.ts:59-92`):
  - Heal Block (`HEAL_BLOCK`) cancels a positive heal.
  - The healed mon's side applies `HealingBoosterModifier` (Healing Charm, `× (1 + 0.1·stacks)`;
    `src/modifier/modifier.ts:2444-2445`), to a negative amount too.
  - A negative amount is dealt as indirect damage, and `heal` caps a positive one at max HP.
- **Liquid Ooze** (`ReverseDrainAbAttr`, `src/data/abilities/ab-attrs.ts:678-702`). `HitHealAttr.apply` returns without
  healing (`src/data/moves/move.ts:2866`). The target's PostDefend then unshifts the same amount as a negative heal on
  the attacker, unless the attacker has Magic Guard (`BlockNonDirectDamageAbAttr`), which cancels it.
- **The HUD.** `10-damage.js` records a move's `drain`: the signed share of damage dealt. The planner adds
  `drain × expected damage` a turn to the side's turn-end change, capped at max HP (a boss at its bar's top), and the
  team plan heals each simulated hit by its share.

**On-KO boosts.** `FaintPhase.doFaint` (`src/phases/faint-phase.ts:96`) runs after a mon faints, in two steps.
1. Every mon on the field, in speed order, runs `PostKnockOutAbAttr` (`:140-142`). That is Soul-Heart:
   `PostKnockOutStatStageChangeAbAttr`, +1 SpA on **any** faint, allies' included
   (`src/data/abilities/init-abilities.ts:1545-1546`).
2. If the victim took an attack this turn and `source` is still on the field, the source runs `PostVictoryAbAttr`
   (`src/phases/faint-phase.ts:143-147`). That is `PostVictoryStatStageChangeAbAttr` (`src/data/abilities/ab-attrs.ts:2056-2073`) with either:
   - fixed `changes` (all in `src/data/abilities/init-abilities.ts`):
     - Moxie +1 Atk (`:1048-1049`);
     - Chilling Neigh +1 Atk (`:1819-1820`);
     - Grim Neigh +1 SpA (`:1822-1823`);
     - As One (Glastrier) +1 Atk and As One (Spectrier) +1 SpA (`:1826-1844`);
     - Battle Bond +1 Atk/SpA/Spe on a holder that isn't the Battle Bond Greninja form, once
       (`abilitiesApplied`, `:1458-1461`);
   - or a function of the holder: Beast Boost and Eelevate use `beastBoostHighestStatCalc`, +1 on the highest of Atk,
     Def, SpA, SpD, Spe by `getStat(s, false)`, the first on a tie (`:1566-1567,2182-2188,2394-2404`).

Both attributes unshift `StatStageChangePhase` (±6 cap), and the stages last until the mon leaves the field. The
move's own `PostVictoryStatStageChangeAttr` (Fell Stinger) comes after and isn't read
(`src/phases/faint-phase.ts:148-153`). `Pokemon.hasAbilityWithAttr` respects suppression
(`src/field/pokemon.ts:2311`). The planner prices a KO it would score on us at `FEED_COST` (0.5 turns) a stage on an
attacking stat or Speed, half that on a defence, times P(it KOs us first), while someone is left to face it. The team
plan counts each side's KOs and scales later exchanges' hits by the stages (Speed left out).

**Switch-in cost.** A command switch resolves before moves (`src/phases/turn-start-phase.ts:28-45,122-130`), so the
switch-in takes what the foe chose against the mon leaving (§9). The ⇄ line names that share of its HP and the likeliest
move's effectiveness on it, from the same threat the planner already scores the switch with.

**Unmeasured.** `FEED_COST` is a first cut. A boost gained mid-exchange isn't applied inside that exchange (it ends it,
except Soul-Heart). A drain's expected heal uses this turn's expected damage for every later turn.

---

## 19. The reward roll, and previewing a reroll

`50-reroll.js` previews what the next reroll offers, before paying for it.

**The roll.** `SelectModifierPhase.start` (`src/phases/select-modifier-phase.ts:60`) re-seeds only on a wave's first
roll (`rerollCount` 0, not a copy): `updateSeed()` → `resetSeed()` (`:67`, `:411`), which sows the wave seed (§11).
A reroll never re-seeds; it continues the stream — `start` only clears `scene.reroll` (`:70`). Every non-copy roll
then calls `regenerateModifierPoolThresholds(party, PLAYER, rerollCount)` (`:75`) and
`getModifierTypeOptions(getModifierCount())` (`:79`, `:459`) → `getPlayerModifierTypeOptions(count, party,
lockModifierTiers ? modifierTiers : undefined, customModifierSettings)`.

- `regenerateModifierPoolThresholds` (`src/modifier/modifier-type.ts:2354`) — **draws, and writes module state.** It
  calls `generateType(party)` on every generator entry of every tier whatever its weight (`:2382`): attack-type,
  base-stat and temp-stat boosters, species items, TMs, evolution and form-change items, mints, Tera Shards, berries
  (their draws: `:1321`–`1978`). A generator with no candidates returns before drawing and a one-item pick draws
  nothing, so the draw count depends on the party. The weight functions (`src/modifier/init-modifier-pools.ts`) don't
  draw or write; they read party HP, PP, status, held items, abilities, mode, wave and ball counts, and the vouchers'
  read `rerollCount` (`:328`, `:599`, `:619`). It writes the module-private `modifierPoolThresholds` /
  `ignoredPoolIndexes` (`src/modifier/modifier-type.ts:2332`, `:2440`) and the exported `itemPoolChecks` (`:2352`,
  no reader in `src/`).
- `getPlayerModifierTypeOptions` (`:2496`) — draws; writes nothing but its result. Custom settings go first:
  pre-built options (no draw), `guaranteedModifierTypeFuncs` (a generator draws), `guaranteedModifierTiers` (with
  `allowLuckUpgrades`), then `fillRemaining`; without settings, `count` options, the `i`th with `modifierTiers[i]`.
- One option: `getModifierTypeOptionWithRetry` (`:2570`) → `getNewModifierTypeOption` (`:2762`). With no tier,
  `randSeedInt(1024)` (`:2791`) and, unless it rolled 0, the luck loop `randSeedInt(floor(128 / ((luck + 4) / 4))) < 4`
  (`:2800`); with a tier (locked or guaranteed), the luck loop while a non-empty next tier exists (`:2832`); then the
  item by weight (`:2847`) and `generateType` for a generator — a null result recurses on the same tier, dropping a
  tier after 100 retries. A duplicate — same `type.name` or same `type.group`, and two undefined groups count — is
  redrawn up to `min(count × 5, 50)` times, **with the candidate's tier and upgrade count passed in** (`:2589`), so a redraw
  skips the tier roll and the luck loop; a candidate `applyChallenges(WAVE_REWARD)` rejects is redrawn with no cap
  (Hardcore rejects revives).
- `getPartyLuckValue` (`:2906`) — pure outside Daily; Daily's luck is a fork at 0.
- `getModifierCount` (`src/phases/select-modifier-phase.ts:377`) — pure: `3 + ExtraModifierModifier +
  TempExtraModifierModifier`; with custom settings, the guaranteed count, or the larger of the two with
  `fillRemaining`.

**A reroll.** `rerollModifiers` (`:188`) — writes `scene.reroll` and `money`, and unshifts
`SelectModifierPhase(rerollCount + 1, typeOptions.map(o => o.type?.tier))` (`:195`), nothing else: **the custom
settings are dropped**. So after a fixed battle (`src/phases/victory-phase.ts:85`; classic's pin tiers with
`allowLuckUpgrades: false`, `src/data/trainers/fixed-battle-configs.ts:48`) or an encounter's `setEncounterRewards`
(`src/data/mystery-encounters/utils/encounter-phase-utils.ts:740`), the reroll is an ordinary roll — three-plus
options, rolled rarities, luck upgrades. `getRerollCost` (`src/phases/select-modifier-phase.ts:419`, pure) is 250, or
the summed tier values `[50, 125, 300, 750, 2000]` when locked, × `ceil(wave / 10)` × `2^rerollCount` × the settings'
`rerollMultiplier` — negative means −1, rerolls off — so only the first reroll carries the wave's multiplier. The tiers
passed on are the final, upgraded tiers on screen, used only while `scene.lockModifierTiers` is set; locked tiers still
climb by luck. `toggleRerollLock` (`:249`) writes `lockModifierTiers`; the handler shows its button only with a
`LockModifierTiersModifier` (`src/ui/handlers/modifier-select-ui-handler.ts:187`).

**What else draws while the screen idles.** Nothing found on the seeded stream: `ModifierSelectUiHandler.show`
(`:162`), the shop row (`getPlayerShopModifierTypeOptionsForWave`, `src/modifier/modifier-type.ts:2627`),
`getRerollCost`, the lock toggle, buying a heal / revive / PP item, the held-item transfer screen, and the TM / Memory
Mushroom `LearnMovePhase` with its `copy()` (`src/phases/select-modifier-phase.ts:468`: the same options passed back
as pre-built ones, so no re-seed, no regenerate and no draw). A fusion palette patches `Math.random` to the
seeded stream only inside a fork (`src/field/pokemon.ts:5483`). Phaser's own internals weren't read. What *does* move a
preview without drawing: anything that changes the party or its held items (the weights and generator candidates),
and the lock toggle.

**The preview.** Inside `sandbox` (§0), from `RND.state()` as it stands: `regenerateModifierPoolThresholds(party,
PLAYER, n)` and `getPlayerModifierTypeOptions(count, party, lock ? tiers : undefined)`, `n` the next reroll count and
`count` from a fresh `SelectModifierPhase(n, tiers)` (the constructor only stores its arguments,
`src/phases/select-modifier-phase.ts:46`) — never the
live phase's, which counts its custom settings. Once with the lock as it stands and, with a Lock Capsule, once
toggled, each from the same state; then `regenerate` for the live reroll count restores the tables (nothing reads them
before the next non-copy roll regenerates) and the sandbox restores the stream. Offers are judged on `50-shop.js`'s
scale (≈10 a tier); `REROLL_GAIN` 5 is a first cut.

**Unmeasured.** Whether a real reroll matches its preview: the HUD scores every reroll against the last preview for it
(`window.__coachHud.reroll()`).

---

## 20. Catching: AttemptCapturePhase and checkCanUseBall

Read at the pinned tag (`v1.12.0.11`); not called live.

**When a ball may be thrown.** `CommandPhase.handleBallCommand` (`src/phases/command-phase.ts:406`) — queues a message
on refusal; on success writes `turnCommands[fieldIndex]` (BALL, targets) and skips the partner's command — checks, in
order:

1. `checkCanUseBall` (`src/phases/command-phase.ts:353`; pure apart from the message):
   - **End biome, wild battle.** Refused (`noPokeballForce`) in classic (challenge runs included) short of the final boss
     while any active foe's species has no `caughtAttr`; under a full Fresh Start (`isFullFreshStartChallenge`,
     `src/game-mode.ts:121`, value 1) short of the final boss; in Endless except on a minor boss (`isEndlessMinorBoss`,
     `src/game-mode.ts:339`, w % 250). Refused (`noPokeballForceFinalBoss`) at the classic final boss
     (`isBattleClassicFinalBoss`, `src/game-mode.ts:320`) while `getStarterCount(caught) < getAllStarters().length - 1`
     (`src/system/game-data.ts:2036`: two or more starters uncaught); at the final boss under a full Fresh Start; at an
     Endless minor boss; in Daily unless `isDailyFinalBoss()` (`src/data/daily-seed/daily-seed-utils.ts:89`) and the
     event seed's boss is `catchable` (`getDailyEventSeedBoss`, `src/data/daily-seed/daily-run.ts:189`). END is only
     reached by the forced biome rule (§10): classic 191–200, the Daily wave 50, each Endless X50 wave.
   - **Otherwise** a trainer battle is refused, and a Mystery Encounter unless its `catchAllowed`.
2. More than one foe `isActive(true)` on the field: refused (`noPokeballMulti`).
3. **Boss bars.** When `getEnemyPokemon(false)` `isBoss()`, has `bossSegmentIndex >= 1` and not
   `hasAbility(WONDER_GUARD, false, true)` (lines 428–447): the classic final boss refuses every ball but the Master Ball,
   and the Master Ball too when `hasAnyChallenges()`; any other boss refuses every ball but the Master Ball, and a
   catchable Daily event boss refuses that too. A Wonder Guard boss takes any ball on any bar.

**The throw.** `AttemptCapturePhase.start` (`src/phases/attempt-capture-phase.ts:45`) ends at once on a foe with 0 HP,
before the ball is spent; otherwise it writes `pokeballCounts[type]--` (line 59) and computes (lines 63–73, 88):

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
  (`src/timed-event-manager.ts:69`): the active event's `shinyCatchMultiplier`, else `SHINY_CATCH_RATE_MULTIPLIER` = 2
  (`src/data/balance/rates.ts:62`). An event is active by the wall clock (`isActive`, line 24).
- **Critical**, `getCriticalCaptureChance` (`src/data/pokeball.ts:91`), out of 256: 0 under any Fresh Start
  (`isFreshStartChallenge`, `src/game-mode.ts:113`); else `floor(charm · dex · min(255, rate) / 6)` with dex 2.5 in
  Daily or past 800 caught species (`getSpeciesCount(d => !!d.caughtAttr)`, `src/system/game-data.ts:2025`), 2 past
  600, 1.5 past 400, 1 past 200, 0.5 past 100, else 0; charm `1.5 + stacks / 2` from
  `CriticalCatchChanceBoosterModifier.apply` (`src/modifier/modifier.ts:3031`, max 3 stacks), else 1.

No ability, biome, level or held item enters, and there is no boss term: bars only gate the throw (above).

**Shakes.** The tween's `onRepeat` (`src/phases/attempt-capture-phase.ts:150-168`) — draws battle RNG
(`Pokemon.randBattleSeedInt`, `src/field/pokemon.ts:5638` → `Battle.randSeedInt`, `src/battle.ts:491`, the stream
re-sown from `battleSeed` and the turn and kept in `battleSeedState`). A normal throw makes three checks
`randBattleSeedInt(65536) < shakeProbability`, each skipped without a draw for a Master Ball (`ball === -1`) or a rate
≥ 255; a critical capture makes one check after its first shake. A failed check calls `failCatch` (line 210, writes
`currentBattle.lastUsedPokeball`, ends the phase). So a throw draws 1 + (3 or 1) battle values, and
**P(catch) = c·s + (1 − c)·s³** with `s = min(1, shakeProbability / 65536)` and `c = clamp(critical, 0, 256) / 256`.
A Master Ball's rate is negative, so it is never critical and every check is skipped: a sure catch; so is rate ≥ 255.

**A catch.** `AttemptCapturePhase.catch` (line 243) — state writes, UI, phase queue: `updateSpeciesDexIvs(root, ivs)`
(`src/system/game-data.ts:2010`), the `POKEMON_ADD_TO_PARTY` challenge (Limited Catch,
`src/data/challenge.ts:1121`: kept only if met on an X1 wave, or through Teleporting Hijinks' biome-change option),
`setPokemonCaught` (`src/system/game-data.ts:1729`), a release prompt when the party holds 6, then
`unshiftNew("VictoryPhase")`. Candy goes to the prevolution-free species of the chain: `isShiny() ? 5·2^variant : 1`,
×2 for a boss, and not at all in Daily unless the catch adds a dex attribute (`src/system/game-data.ts:1845-1850`). The
dex attribute (`Pokemon.getDexAttr`, `src/field/pokemon.ts:605`, pure) reads the base `shiny` and `variant` only.

**Shiny and fusion reads.** `Pokemon.isShiny(useIllusion = false)` (`src/field/pokemon.ts:1734`, pure) is the base
`shiny`, or `fusionShiny` when fused; `getVariant` (line 1775) is the higher of the two when fused.
`Pokemon.calculateBaseStats` (`src/field/pokemon.ts:1618`, pure) takes the *form's* base stats, applies the Flip Stat
challenge and Shuckle Juice / Old Gateau, averages with the fusion's form stat by stat rounding up (halves them in Spliced
Endless when unfused), then applies vitamins. Shininess itself is set at spawn by `trySetShiny`
(`src/field/pokemon.ts:2865`) — writes `shiny`, no draw of its own (the `id` was drawn at construction, line 398):
`(trainerId ^ secretId) ^ (id >>> 16 ^ id & 0xffff) < threshold`, threshold 64 of 65536 (`BASE_SHINY_CHANCE`,
`src/data/balance/rates.ts:10`), raised for wild spawns by the event's `shinyEncounterMultiplier` and by the Shiny Charm
(`ShinyRateBoosterModifier`, ×2^(1 + stacks)), and for a trainer's mon to the event's trainer shiny chance.

`45-catch.js` restates the formula in closed form and the ball rules above.

---

## 21. End of turn: TurnEndPhase and what runs after the moves

`TurnStartPhase.start` pushes these phases behind the turn's MovePhase markers (`src/phases/turn-start-phase.ts:98-104`). The list is the constant
`turnEndPhases` (`src/phase-manager.ts:228`), pushed by `PhaseManager.queueTurnEndPhases` (`:589`):
**CheckInterludePhase → WeatherEffectPhase → PositionalTagPhase → BerryPhase → CheckStatusEffectPhase (→ PostTurnStatusEffectPhase ×n)
→ TurnEndPhase**. Next come any phases pushed during the turn: a player `SwitchPhase` after a faint, a trainer's `SwitchSummonPhase`, and
`BattleEndPhase` with the rewards. When the queue is empty, `PhaseManager.turnStart` (`:474`) clears the dynamic queues and starts
`TurnInitPhase`, which pushes `CommandPhase`/`EnemyCommandPhase` per active mon and then `TurnStartPhase` (`src/phases/turn-init-phase.ts:59-75`).

**Queue rules that decide the order.**
- `pushNew` appends to the bottom level. `unshiftNew` adds one level above the running phase, first in first out
  (`src/phase-tree.ts:66`, `:98`). A heal that a turn-end phase queues (`PokemonHealPhase`) therefore resolves after that phase's
  `start` returns, in queue order. `damageAndUpdate` writes `hp` at once and only queues its animation (`src/field/pokemon.ts:3910`).
- A phase with `getPokemon()` that is not listed in `nonDynamicPokemonPhases` (`src/dynamic-queue-manager.ts:13`, `:164`) is dynamic:
  it is re-sorted by speed on every pop. `PostTurnStatusEffectPhase` is dynamic. `PokemonHealPhase`, `WeatherEffectPhase` and `FaintPhase` are not.
- Per-mon loops (`FieldPhase.executeForAll`, `src/phases/field-phase.ts:9`) walk `inSpeedOrder` (`src/utils/speed-order-generator.ts:14`).
  That is a `PokemonPriorityQueue` of the active field that re-runs `sortInSpeedOrder` on every pop (`src/queues/pokemon-priority-queue.ts:7`).
  Ties break on the seed fork `turn * 1000 + remaining`, `waveSeed` (§5). Inside `TurnEndPhase` the turn has already been incremented.
  The loops are pure apart from what each step does.

**1. `CheckInterludePhase.start`** (`src/phases/check-interlude-phase.ts:7`). On an X0 wave where every enemy has fainted,
`PhaseManager.onInterlude` (`src/phase-manager.ts:596`) removes WeatherEffectPhase, BerryPhase and CheckStatusEffectPhase (not
PositionalTagPhase), and sets `TurnEndPhase.upcomingInterlude`. Side effect: phase queue only.

**2. `WeatherEffectPhase.start`** (`src/phases/weather-effect-phase.ts:26`). With no weather it ends.
- Sandstorm and hail (`Weather.isDamaging`, `src/data/weather.ts:56`) do nothing if `SuppressWeatherEffectAbAttr` applies to any field mon (Cloud Nine, Air Lock; `:39-41`).
- Otherwise each mon in speed order takes `damageAndUpdate(toDmgValue(maxHp/16), {result: INDIRECT, ignoreSegments: true})` (`:44-73`). It is spared if any of these hold:
  - it has switched out;
  - it has a type that `Weather.isTypeDamageImmune` spares (Ground, Rock or Steel in sand, Ice in hail; `weather.ts:66`);
  - `PreWeatherDamageAbAttr` cancels it (`BlockWeatherDamageAttr`: Sand Veil, Snow Cloak, Ice Body…);
  - it has Magic Guard (`BlockNonDirectDamageAbAttr`);
  - it is UNDERGROUND or UNDERWATER.

  Because segments are ignored, the chip can break several boss bars at once (`pokemon.ts:6943-6949`, §3).
- After the weather message, `PostWeatherLapseAbAttr` runs per mon (`:77-83`). Its condition `getWeatherCondition` is false while the weather is suppressed (`ab-attrs.ts:6086`).
  - `PostWeatherLapseHealAbAttr` (`:3953`), below full HP only, queues a heal of `toDmgValue(maxHp·factor/16)`: Rain Dish and Ice Body 1/16, Dry Skin in rain 1/8.
  - `PostWeatherLapseDamageAbAttr` (`:3983`) deals 1/8 at once to Dry Skin or Solar Power in sun, unless the mon has Magic Guard.

Side effects: writes `hp`, queues heals and messages, ability bookkeeping. No RNG apart from bar breaks (global RNG).

**3. `PositionalTagPhase.start`** (`src/phases/positional-tag-phase.ts:13`). `activateAllTags`
(`src/data/positional-tags/positional-tag-manager.ts:40`) ticks each tag. Future Sight and Doom Desire come due and unshift a `MoveEffectPhase`
(`positional-tag.ts:100-112`); Wish unshifts a heal (`:158-166`). Side effects: writes the tag list. The delayed attack draws from the battle RNG as usual.

**4. `BerryPhase.start`** (`src/phases/berry-phase.ts:18`). For each mon in speed order, `eatBerries` (`:33`) runs if any `BerryModifier.shouldApply` holds
(`modifier.ts:1823` → `getBerryPredicate`, `src/data/berry.ts:23`).
- Unnerve (`PreventBerryUseAbAttr` on an opponent) stops all of that mon's berries (`:45`).
- Otherwise every usable berry applies once (`BerryModifier.apply`, `modifier.ts:1832`; effects in `getBerryEffectFunc`, `berry.ts:69`).
- Berry Pouch (`PreserveBerryModifier.apply`, `modifier.ts:1881`) keeps the berry on `randBattleSeedInt(10) < 3·stack`.
- Stat berries are batched into one `StatStageChangePhase` (`:70-76`). Cheek Pouch follows, then Cud Chew replays last turn's berries (`ab-attrs.ts:4224`).

Thresholds read the HP at this point: after the weather chip, **before** the status chip. `getHpRatio()` rounds to 2 decimals
(`pokemon.ts:1692`), so Sitrus needs `hp/maxHp < 0.495`. Side effects: draws from the battle RNG (Berry Pouch) and the global RNG
(Starf); writes held items and `berriesEaten`; queues heal and stat phases.

**5. `CheckStatusEffectPhase.start`** (`src/phases/check-status-effect-phase.ts:9`). For each mon with poison, toxic or burn
(`Status.isPostTurn`, `src/data/status-effect.ts:31`), it unshifts a `PostTurnStatusEffectPhase`. Pure apart from the queue.
`PostTurnStatusEffectPhase.start` (`src/phases/post-turn-status-effect-phase.ts:19`):
- It skips a mon that is inactive or switched out.
- `status.incrementTurn()` runs first (`:26`), so the toxic counter ticks even when the chip is blocked.
- Magic Guard, or `BlockStatusDamageAbAttr` (Poison Heal, against poison and toxic), cancels the chip (`:27-34`).
- Chip (`:41-52`): poison `toDmgValue(maxHp/8)`; toxic `toDmgValue(maxHp·toxicTurnCount/16)`; burn `toDmgValue(maxHp/16)`, halved by Heatproof (`ReduceBurnDamageAbAttr`).
- The chip goes through `pokemon.damage(dmg, false, true)` (`:57`). **Boss bars hold**: the chip stops at a bar boundary (`pokemon.ts:6927`).
  `preventEndure` skips Sturdy, Focus Band and the endure token, and a faint from it cannot use a Reviver Seed.
- On the classic final boss, `end` starts phase two (`:64-69`).

Side effects: writes `hp` and status counters. No RNG.

**6. `TurnEndPhase.start`** (`src/phases/turn-end-phase.ts:23`), in order:
1. `currentBattle.incrementTurn()` (`:26`, `src/battle.ts:171`) increments `turn`, clears `turnCommands` and `preTurnCommands`, and nulls `battleSeedState`.
   From here on, every battle-RNG draw (Moody, Mini Black Hole, then next turn's AI) comes from the next turn's re-sown stream (`battle.ts:497-500`).
   It then dispatches `TurnEndEvent` and clears the last turn order (`:27-28`).
2. Unless `upcomingInterlude` is set, each field mon in speed order goes through the steps below (`:32-66`):
   1. If not switched out, `lapseTags(TURN_END)` (`pokemon.ts:4173`) ends one-turn tags (`FLINCHED`, `BYPASS_SPEED`, `STURDY`, protect…) and runs the tag effects in tag order:
      - Leech Seed: 1/8 at once, then a queued heal to the seeder, reversed by Liquid Ooze (`src/data/battler-tags.ts:1110`).
      - Nightmare 1/4 (`:1252`), binding moves 1/8 (`DamagingTrapTag`, `:1621`), Salt Cure 1/16 or 1/8 on Water/Steel (`:2527`), Curse 1/4 (`:2576`). Magic Guard blocks all of these.
      - Perish Song faints the mon when its count runs out (`:2061`). Ingrain and Aqua Ring queue a 1/16 heal (`:1453`, `:1525`). Yawn puts the mon to sleep (`:1585`).
   2. Leftovers (`TurnHealModifier.apply`, `modifier.ts:1644`) queues a heal of `toDmgValue(maxHp/16)·stack` if the mon is below full HP.
   3. Grassy Terrain queues a heal of `max(maxHp>>4, 1)` for a grounded mon (`:38-48`).
   4. Enemies only:
      - `EnemyTurnHealModifier.apply` (`modifier.ts:3520`) queues a heal of `max(floor(maxHp/50)·stack, 1)` with `preventFullHeal`, so it stops at maxHp−1 (`pokemon-heal-phase.ts:89`).
      - `EnemyStatusEffectHealChanceModifier.apply` (`modifier.ts:3615`) cures the status on `randSeedFloat() <= 0.025·stack` (global RNG).
   5. `applyAbAttrs("PostTurnAbAttr")` (`:55`), non-simulated:
      - Poison Heal queues a 1/8 heal (`ab-attrs.ts:4062`).
      - `PostTurnResetStatusAbAttr` (`:4097`): Shed Skin cures at `randSeedInt(10) < 3` (global; `init-abilities.ts:524`), Hydration in rain (`:678`), Healer cures its ally at `randSeedInt(2)` (global; `:918`).
      - Harvest draws from the global RNG (`ab-attrs.ts:4132`). Moody draws from the battle RNG (`:4282`).
      - Speed Boost (`:4322`), the Hunger Switch form change (`:4364`), Bad Dreams dealing 1/8 at once to sleeping foes (`:4389`), Cud Chew's record, Ball Fetch.
   6. Even for a mon that switched out:
      - Toxic Orb or Flame Orb: `TurnStatusEffectModifier.apply` → `trySetStatus` (`modifier.ts:1711`). The status lands after step 5, so its chip starts next turn.
      - Mini Black Hole (`modifier.ts:3255`), unless the holder has fainted, steals immediately with battle-RNG picks (§8). This happens before the queued heals resolve.
   7. `tempSummonData.turnCount++` and `waveTurnCount++` (`:61-62`).
3. `arena.lapseTags()` (`src/field/arena.ts:845`; `ArenaTag.lapse`, `src/data/arena-tag.ts:228`) ticks Tailwind, Trick Room, screens and so on,
   and calls `onRemove` on tags that expire. It is skipped on an interlude. Trick Room ending here changes next turn's order.
4. `weather.lapse()` (`weather.ts:33`; primordial weather never lapses) clears the weather and weather-based forms when it runs out.
   `terrain.lapse()` (`src/data/terrain.ts:34`) likewise clears the terrain (`:71-78`). This happens even on an interlude, after this turn's weather chip and Grassy heal.

The heals queued during `start` then resolve in queue order in `PokemonHealPhase.end` (`src/phases/pokemon-heal-phase.ts:59`):
- nothing for a mon that has left the field or fainted (`:62`), or has Heal Block (`:72`);
- player heals are multiplied by Healing Charm (`HealingBoosterModifier`, `:81`);
- `heal` caps at max HP.

Nothing in §21 is pure. RNG, by stream:
- **global**: Starf, Shed Skin, Healer, Harvest, the enemy status cure, bar-break stat picks;
- **battle**: Berry Pouch, Moody, Mini Black Hole;
- **seed fork** (restored): every speed ordering.

**Faints and the end of a wave.**
- Indirect damage that KOs a mon (weather, status, tags) queues a deferred `FaintPhase` with `preventInstantRevive = true` (`pokemon.ts:3893`,
  `:3945`; `src/phase-manager.ts:528`; `src/phases/faint-phase.ts:37`). It runs after the phases the current one queued, and **no Reviver Seed** (`faint-phase.ts:62`).
- An enemy faint unshifts `VictoryPhase` (`faint-phase.ts:184`). Once no enemy is left, `VictoryPhase.start` pushes `BattleEndPhase`, `TrainerVictoryPhase`
  and the rewards to the bottom of the queue (`src/phases/victory-phase.ts:43-58`). They run after the turn-end phases.
  So on the turn a wave is won, the player's mons still take the chip, eat berries and heal, except on X0 waves (step 1).
- A fainted player mon's replacement (`SwitchPhase`, `faint-phase.ts:181`) and a trainer's send-in (`SwitchSummonPhase`, `:192`) are also pushed.
  They arrive after `TurnEndPhase`, so the newcomer gets no turn-end effect that turn.

**The HUD's version** is `endOfTurnSteps` / `endOfTurnHp` in `10-damage.js`, and it follows the order above rather than
summing it, because the order is what decides survival: the weather chip lands before the berry predicate reads the HP,
and the berry before the status chip, so a mon that a chip-first reading buried walks away. The steps it carries, in
order: the moves' own Shell Bell (`MoveEffectPhase.end`, before any turn-end phase), the weather chip and the two
weather-lapse abilities, the berries (Sitrus on the *rounded* ratio, `< 0.495`; Enigma; an opposing Unnerve skips both),
the status chip and the status orbs, the TURN_END tags (Leech Seed and its heal to the seeder — reversed by Liquid Ooze,
cancelled whole by Magic Guard — the binding moves, Nightmare, Curse, Salt Cure, Ingrain and Aqua Ring), then Leftovers,
Grassy Terrain, the enemy's wave-heal token with its `preventFullHeal` cap at max − 1, Poison Heal and an opposing Bad
Dreams. Every one of those heals is a queued `PokemonHealPhase`, so Heal Block cancels it and the healed mon's own side
scales it by Healing Charm, floored — which is also what deepens a Liquid Ooze drain (§18).

Deliberately left out, each either rare at a command prompt or not a change in HP: `PositionalTagPhase` (Future Sight,
Wish), Perish Song's count and Yawn's sleep, Cheek Pouch and Cud Chew, the stat berries and Lum, the Shed Skin /
Hydration / Healer cures, Harvest and Moody, and the enemy's 2.5 % status cure. Two more come of the model being **one
mon's turn end at a time**, not the field's: a Leech Seed's payout to the seeder is read off the seeded mon's HP as it
stands, so a seed that this same turn's weather or status chip would fell the mon before it ever lapsed still pays; and
Bad Dreams asks the *sleeper's* Magic Guard, like `canApply`, where `apply` asks the **holder's**
(`ab-attrs.ts:4394`, `:4413`) — the holder's is modelled, so a Magic Guard holder deals none, but in doubles a sleeper
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
- Upstream's `vite.config.ts:45-53` sets `keepNames`, so class and function names survive minification. The HUD
  relies on it: attrs, tags and modifiers are matched by `constructor.name` / `hasAttr("…")` / `attr.is("…")`
  (`MultiHitAttr`, `PokemonMultiHitModifier`, `EnemyEndureChanceModifier`, `BerryModifier`, `AttemptCapturePhase`,
  `getCriticalCaptureChance`…). A build without `keepNames` would break all of these at once.
- Export **aliases** change per build (`getCriticalCaptureChance as wa`, `sortInSpeedOrder` as `Mo` when last read,
  `allBiomes` as `ar as us`, the species registry as `t as $t`, the trainer configs as `do`). Find an export by
  its function name or by shape, never by alias.
- `randSeedInt` and `shiftCharCodes` are exported by name from the `FadeOut` chunk; `randSeedInt` is also reachable
  as `Phaser.Math.RND.integerInRange`. `Phaser.Math.RND.state()` returns a `"!rnd,…"` string (observed live).
- Enums are numbers at runtime (see the header); e.g. `UiMode.MYSTERY_ENCOUNTER` is the bare `45`.

**Reaching module-private or unexported tables.**
- `47-biome.js` re-`import()`s the already-loaded `/assets/<name>-<hash>.js` chunk URLs; the browser returns the same
  module instances without re-running them. It scans the namespaces by shape: a Map whose values carry
  `biomeLinks` + `pokemonPool` (`allBiomes`), an object with `getSpecies` / `getAllSpecies` (the species registry),
  a function named `getBiomeName`, an object whose values carry `trainerType` + `partyTemplates` (trainer configs),
  an object with `getShinyCatchMultiplier` (`timedEventManager`), and the reward functions of §19
  (`regenerateModifierPoolThresholds`, `getPlayerModifierTypeOptions`). The scan is async, so the first ticks have
  no tables.
- Checked in Chrome on 1.12.0.11 (2026-09-16, title screen, fresh profile): all five tables found across the 10
  loaded chunks, `TrainerConfig` keeps its class and field names, a BOSS trainer carries `specialtyType`, the
  registry keeps `getEvolutions` / `getPrevolution` / `hasPrevolution`, `getEvolutions` returns `level` +
  `evoLevelThreshold`. `signatureSpecies` was **not** among the live exports. **Not checked in Orion.**
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

Read at the pinned tag (`v1.12.0.11`). The starter card (`51-starters.js`) calls only the pure reads marked below; nothing
here draws from an RNG stream or queues a phase, so it runs outside `sandbox`.

**The screen.** `StarterSelectUiHandler` (`src/ui/handlers/starter-select-ui-handler.ts:296`) serves
`UiMode.STARTER_SELECT` (10). Its own pop-ups change the UI mode (`OPTION_SELECT` for add / moves / nature, `:2114`;
`CONFIRM` for start and exit, `:4483,4525`), so `ui.getHandler()` stops returning it; `ui.handlers[STARTER_SELECT]` is the
same instance throughout (`src/ui/ui.ts:117`). `SelectStarterPhase.start` (`src/phases/select-starter-phase.ts:22`) is the
only outside caller; `starterSelectCallback` is set by `show` (`:1199`) and cleared when the run starts (`:4533`), so a
set callback during `SelectStarterPhase` means a team is being chosen. The Pokédex is a different handler
(`src/ui/handlers/pokedex-ui-handler.ts:213`). Daily runs never show the grid (`getDailyRunStarters`,
`src/phases/title-phase.ts:245`). `gameMode` and its challenges are final before the grid opens
(`src/phases/title-phase.ts:360-365`, `src/ui/handlers/challenges-select-ui-handler.ts:377`).

**What is offered.** `starterContainers` holds every starter (`:302`, from `speciesDataRegistry.getAllStarters()`,
`:801-811`); each container has `species`, `cost` and an `icon` sprite (`src/ui/containers/starter-container.ts:6-17`).
`validStarterContainers` (`:304`) is the list the active challenges allow, by the **soft** check: the species or any
evolution or item form change passes (`checkStarterValidForChallenge(species, props, true)`,
`src/utils/challenge-utils.ts:359-388`); outside challenge mode it is every starter (`:3141`). Uncaught species are in it:
`dexData[id].caughtAttr` tells them apart. `filteredStarterContainers` is that list after the filter bar (`:3159-3380`).
No container carries a validity flag: the grid greys an icon (`icon.alpha` 0.375) in `tryUpdateValue` (`:4419-4465`),
which is a state write — never call it.

**The team being built.** `starterSpecies` (`:392`) with a parallel `starters` (`:391`), each built in `addToParty`
(`:2831-2845`): `{ speciesId, shiny, variant, formIndex, female, abilityIndex, passive, nature, moveset, pokerus,
nickname, teraType, ivs }`, `passive` true only when `passiveAttr` is `UNLOCKED | ENABLED` (`:2838`). At most
`PLAYER_PARTY_MAX_SIZE` 6 (`:1946`), no duplicates (`:1943`). **A team may start** once `isPartyValid()` (`:4561-4578`,
pure): at least one member passes the **strict** check (`soft` false: each active challenge's
`applyStarterChoice(species, holder, props)` on the species itself); the others need only the soft one.

**The budget.** `getValueLimit()` (`:3076-3090`, pure): 15 in Endless and Spliced Endless, 10 otherwise, less
`LowerStarterPointsChallenge`'s value (`src/data/challenge.ts:1057`). A species costs
`gameData.getSpeciesStarterValue(id)` (`src/system/game-data.ts:2148-2170`, pure): the base cost from the species registry
less `starterData[id].valueReduction` steps (−1 while above 1, then halve; the grid allows two, `:210,1465`), then
`ChallengeType.STARTER_COST`, where Fresh Start restores the base cost (`src/data/challenge.ts:867-869`).
`LowerStarterMaxCostChallenge` excludes base costs above `10 − value` (`:1031-1037`).

**Account data, challenge-adjusted.** `getSpeciesData(id)` (`:3856-3871`, pure) returns copies of `dexData[id]` and
`starterData[id]` after `ChallengeType.STARTER_SELECT_MODIFY`. Fresh Start's (`src/data/challenge.ts:872-908`) clears egg
moves and the passive, masks `abilityAttr` to abilities 1 and 2, resets `valueReduction`, caps IVs at 15, removes
shiny and variant bits and limits natures to the neutral five. `dexData` carries `caughtAttr` (bigint: NON_SHINY 1n,
SHINY 2n, MALE 4n, FEMALE 8n, DEFAULT_VARIANT 16n, VARIANT_2 32n, VARIANT_3 64n, form *i* `1n << (7 + i)`) and `ivs`
(HP, Atk, Def, SpA, SpD, Spe); `starterData` carries `eggMoves` (a 4-bit mask over `speciesEggMoves[id]`, bit 3 the
rare move, `src/system/game-data.ts:1981`), `abilityAttr` (ABILITY_1 1, ABILITY_2 2, ABILITY_HIDDEN 4), `passiveAttr`
(UNLOCKED 1, ENABLED 2), `candyCount`, `valueReduction`. `getCurrentDexProps(id)` (`:4608-4630`, pure) and
`gameData.getSpeciesDexAttrProps(species, props)` (`src/system/game-data.ts:2086`, pure) give the props a challenge
check takes.

**Challenges on the grid** (`s.gameMode.challenges`, active when `value !== 0`): Single Generation
(`species.generation === value`, `src/data/challenge.ts:460-466`), Single Type (the form's types include `value − 1`,
`:780-788`), Fresh Start (value 1: default starters and their evolutions only, `:859-865`), Lower Starter Max Cost and
Lower Starter Points. Inverse Battle flips each defending type's multiplier (below 1 → 2, above 1 → 0.5,
`:979-990`, applied per type in `getTypeDamageMultiplier`, `src/data/type.ts:19-23`). Flip Stat, Limited Catch,
Hardcore, Limited Support and Passives don't change the grid.

**Species reads** (on `container.species`, all pure): `baseStats`, `baseTotal`, `type1` / `type2`, `abilityHidden`,
`generation`; `getEvolutionLevels()` (`src/data/pokemon-species.ts:1094-1112`: every descendant flattened as
`[speciesId, level]`, item evolutions at level 1); `getPassiveAbility(formIndex)` (`:211`). The registry
(`SpeciesDataRegistry`, found by the chunk scan, §10) adds `getSpecies(id)` for the evolved forms and
`getEvolutions(id)` (`src/data/species-data-registry.ts:316`: `level`, `item`, `condition`). Ability and move names
need `allAbilities` / `allMoves` (`src/data/data-lists.ts:8-9`) and egg-move ids `speciesEggMoves`
(`src/data/balance/moves/egg-moves.ts:16`), all module exports (§22). `h.lastSpecies` is the species in the info panel
(`:3620`); `h.pokerusSpecies` the day's Pokérus starters (`:393`), which earn 1.5× EXP (`src/battle-scene.ts:3390-3392`).

**What a run starts with.** `getStartingLevel()` (`src/game-mode.ts:137-149`): 5, or 20 in Daily. `SelectStarterPhase`
(`src/phases/select-starter-phase.ts:63-101`) adds each starter with its ability index, form, gender, shiny, variant,
dex IVs and nature; the moveset the grid chose; passive, Pokérus and nickname copied; then `STARTER_MODIFY`, which only
Fresh Start uses (ability index `% 2`, passive off, egg moves replaced by level 1–5 moves, not shiny, IVs capped at 15,
`src/data/challenge.ts:913-943`). **Luck**: each starter adds `getDexAttrLuck(dexData[id].caughtAttr)`
(`src/system/game-data.ts:2126-2128`: VARIANT_3 3, VARIANT_2 2, SHINY 1) — the best tier ever caught, even when the
non-shiny form is picked (`src/phases/select-starter-phase.ts:80-82`) — capped at 14 for the party, none under Fresh
Start (`src/data/challenge.ts:928`).

## 24. DNA Splicers: who can be fused, pick order, and what a fusion is

Read at the pinned tag (`v1.12.0.11`). The fusion advisor (`49-fusion.js`) re-implements everything below from species
data and calls only pure reads (species forms, `getAbility`, the select filter), so it runs outside `sandbox`. The game
has no fusion preview: the party screen offers only APPLY / SPLICE / UNSPLICE (`src/ui/handlers/party-ui-handler.ts:1456-1468`).

**The item.** `DNA_SPLICERS` is a `FusePokemonModifierType` (`src/modifier/modifier-type.ts:1263-1283`, `:2197`); its
modifier is consumable and `apply` is `playerPokemon.fuse(playerPokemon2)` (`src/modifier/modifier.ts:2363`, `:2390-2393`),
so it can't be held or kept for later. There is no reverse item: unsplicing is a free party option. Pools: **Great**,
weight 4 in Spliced Endless, 2 in classic (challenge runs included) during a fusion event
(`timedEventManager.areFusionsBoosted()`), else 0 (`src/modifier/init-modifier-pools.ts:310-323`); **Master**, weight 24
outside Spliced Endless and that event (`:625-633`). Both need more than one unfused member. Never sold in the shop;
no Mystery Encounter names it, though a Master-tier roll (Mysterious Chest, Fight or Flight past wave 160) can bring it.

**The party screen.** Taking it runs `SelectModifierPhase.openFusionMenu` (`src/phases/select-modifier-phase.ts:175-180`,
`:299-325`): `UiMode.PARTY` with `PartyUiMode.SPLICE` and `modifierType.selectFilter` as the handler's `selectFilter`
(`src/ui/handlers/party-ui-handler.ts:282-290`). The first pick (APPLY) records `transferCursor` and sets `transferMode`
(`:833-834`, `:1731-1738`); SPLICE on another slot calls back `(transferCursor, cursor)` (`:830-832`), and the phase
builds the modifier with `party[fromSlotIndex]` first (`select-modifier-phase.ts:309-318`). Backing out clears the first
pick (`party-ui-handler.ts:1019-1026`) and then returns to the rewards screen with the Splicer unspent
(`select-modifier-phase.ts:322-324`).
**Filter** (both picks, `modifier-type.ts:1270-1275`): not `isFusion()`, and `ChallengeType.POKEMON_FUSION`, which only
Hardcore uses, refusing a fainted member (`src/data/challenge.ts:1151-1157`). Same species, legendaries and fainted
members (outside Hardcore) are allowed.

**`PlayerPokemon.fuse(other)`** (`src/field/pokemon.ts:6233-6294`; party write, phase queue, an unseeded status draw).
The **first pick is the base**: it keeps its level, EXP and growth rate, IVs, nature, Tera type, friendship, passive
unlock, Pokérus, used TMs and moveset. From the second it copies `fusionSpecies`, `fusionFormIndex`,
`fusionAbilityIndex`, shiny, variant, gender, luck and custom data (`:6234-6244`). HP becomes the halves' mean HP share
of the base's pre-fusion max, then `updateModifiers` recalculates (`:6250-6265`, `:6283`). Every held item of the second
moves over, `isTransferable` unchecked, up to the base's stack limits; the rest is lost (`:6276-6285`,
`src/battle-scene.ts:2537-2610`). The second leaves the party (`:6285`), and a `LearnMovePhase` is queued for each of its
moves the base doesn't know (`:6287-6291`). No evolution check.

**What a fusion is.** Base stats (`calculateBaseStats`, `:1618-1640`): each stat `Math.ceil((base + other) / 2)`, after
the base half's Shuckle Juice / Old Gateau and before vitamins; Spliced Endless halves an **unfused** mon's instead.
Stats (`calculateStats`, `:1575-1616`): `floor((2·base + iv) · level / 100)`, HP `+ level + 10` (1 with Wonder Guard),
the rest `+ 5` then the nature (×1.1 ceil, ×0.9 floor). Types (`getBaseTypes`, `:2004-2034`): type 1 is the base's;
type 2 is the other half's type2 when set and not type 1, else its type1 when that differs, else the base's own type2.
Ability (`getAbility`, `:2076-2104`): the **other half's** at its `fusionAbilityIndex` (`PokemonSpeciesForm.getAbility`:
0 / 1 / 2 hidden, `src/data/pokemon-species.ts:194-204`), with no fallback to ability 1; `canApplyAbility` turns off one
carrying `NoFusionAbilityAbAttr` (`pokemon.ts:2247-2254`: Disguise, Zen Mode, Schooling, Stance Change, …). The passive
stays the base's (`:2115-2135`). Learnsets merge both halves (`src/field/learnsets.ts:213-236`), TMs are the union
(`pokemon.ts:5858-5875`), egg moves the base's only (`:1899-1913`). Evolution checks the base's line first, then the
other half's, one at a time (`:2771-2793`). Shiny if either half, luck summed (`:1734-1736`, `:1815-1817`).

**Unsplice** (`party-ui-handler.ts:353-395`, `pokemon.ts:3079-3091`): free, in SPLICE mode or on the party check screen
during the reward phase; the second half is gone for good, its moves and items stay with the base.
