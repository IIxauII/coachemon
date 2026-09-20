/**
 * Game code the coach HUD leans on, per HUD module.
 *
 * HAND-CURATED, the same deal as the escape ladder (ADR 0001): the HUD is
 * written by reading PokéRogue's source, so what is automated is not the
 * writing but the *check* — `npm run drift:check` hashes every ref below at a
 * candidate tag and refuses to move the pin until each HUD module whose deps
 * moved has been re-read and re-stamped. The pin, the hashes and the stamp are
 * shared with the ladder: one game version, one sign-off.
 *
 * Two kinds of dep, both worth watching and not told apart here:
 *
 *  - **Re-implemented.** The HUD computes it itself, because calling the game's
 *    own copy would draw from the battle RNG, rewrite the move queue, or give
 *    one draw where the HUD wants every branch with its chance. A changed body
 *    makes the HUD quietly wrong.
 *  - **Called, or replayed in order.** The HUD calls it inside `sandbox`, or
 *    replays the sequence it sits in. A changed signature, return shape or draw
 *    order breaks the HUD just as silently — `48-preview.js` replays
 *    `newBattle`'s draws, so a reordered call there desynchronises every field
 *    after it.
 *
 * `skills/coachemon/references/game-code.md` is the reading these rest on,
 * read from the pinned tag; what is true only of the live minified bundle sits
 * apart in its §22. Its line citations go stale at a pin bump; these hashes name
 * which of its readings to redo.
 *
 * Keys are HUD modules under `skills/coachemon/scripts/hud/`; a moved hash
 * names the modules to re-read. `52-shop.js` owns only its TM claims (§16):
 * its spending rules rest on `03-calendar.js`'s run calendar and its item
 * judgements on `51-items.js`, which are listed under those modules.
 */
import type { SourceRef } from "../src/escape-ladder/types.ts";

const P = "src/field/pokemon.ts";
const M = "src/data/moves/move.ts";
const SCENE = "src/battle-scene.ts";

export const HUD_DEPS = {
  /**
   * §0: why every HUD call runs inside `sandbox` — the bookkeeping `simulated` does not suppress, and the
   * draws and writes it restores: the battle stream and the seed-fork state, Outrage-type targeting, Shell
   * Side Arm's tie, Present's roll and heal, Tera Shell's `moveEffectiveness`.
   */
  "01-core.js": [
    `src/data/abilities/apply-ab-attrs.ts#applySingleAbAttrs`,
    `src/battle.ts#Battle.randSeedInt`,
    `${SCENE}#BattleScene.executeWithSeedOffset`,
    `src/data/moves/move-utils.ts#getMoveTargets`,
    `${M}#ShellSideArmCategoryAttr.apply`,
    `${M}#PresentPowerAttr.apply`,
    `src/data/abilities/ab-attrs.ts#FullHpResistTypeAbAttr.apply`,
  ],

  /**
   * §12 and §10. The **run calendar**: the four rules that say what kind of fight a
   * wave is, the heal schedule and who it revives, and `isWaveTrainer` as odds. All
   * *re-implemented* — they are pure arithmetic on the wave index, so the HUD reads
   * them rather than calling the game every tick, and this file holds the only
   * game-less fallbacks in the HUD. A changed rule silently moves every "next big
   * fight" the look-ahead names, every trainer share the biome card scores, and
   * whether the rewards card thinks a boss is next.
   */
  "03-calendar.js": [
    `src/game-mode.ts#GameMode.isWaveFinal`,
    `src/game-mode.ts#GameMode.isFixedBattle`,
    `src/game-mode.ts#GameMode.isBoss`,
    `src/game-mode.ts#GameMode.isWaveTrainer`,
    // `hasTrainers` and `kindIsRolled`: who asks `isWaveTrainer` at all, which of its paths returns before the roll,
    // and the `range <= 1` short-circuit that makes a trainer chance of 1 a rule rather than a draw.
    `${SCENE}#BattleScene.handleNonFixedBattle`,
    `src/data/daily-seed/daily-run.ts#getDailyTrainerManipulation`,
    `src/utils/common.ts#randSeedInt`,
    // `isGruntWave`: the four fixed waves whose double comes off an unseeded `Math.random`.
    `src/battle.ts#getRandomTrainerFunc`,
    `src/utils/common.ts#randInt`,
    // `poolAnchorWave` and `arenaRebuiltBetween`: when the arena — and with it the spawn pool — is built again.
    `src/field/arena.ts#Arena.updatePoolsForTimeOfDay`,
    `${SCENE}#BattleScene.newArena`,
    `${SCENE}#BattleScene.doPostBattleCleanup`,
    `src/phases/switch-biome-phase.ts#SwitchBiomePhase.start`,
    `src/data/trainers/fixed-battle-configs.ts#classicFixedBattles`,
    // The heal: which waves it lands on, and who gets up from it.
    `src/phases/victory-phase.ts#VictoryPhase.start`,
    `${SCENE}#BattleScene.isNewBiome`,
    `src/phases/select-biome-phase.ts#SelectBiomePhase.setNextBiomeAndEnd`,
    `src/phases/party-heal-phase.ts#PartyHealPhase.start`,
    `src/data/challenge.ts#LimitedSupportChallenge.applyPartyHeal`,
    `src/data/challenge.ts#HardcoreChallenge.applyPreventRevive`,
  ],

  /**
   * The one place the HUD reads a move's *attributes*. It calls nothing: it reads
   * the shape of every attribute the damage module, the planner and the learn card
   * used to walk for themselves (#128) — which field holds the recoil ratio and
   * whether it is a share of damage or of max HP, the heal ratio and the weather
   * one, the inflicted status, the battler tag, the arena trap, the stat change and
   * whether it is self-targeted, the multi-hit type. A renamed field silently
   * changes what every card says a move costs. The hit count is re-implemented from
   * `getHitCount` and the two extra-strike sources, so a changed roll or a changed
   * `canBeMultiStrikeEnhanced` makes every multi-hit number wrong at once. Three
   * things are matched by name rather than by field: the abilities that block a
   * cost (Magic Guard, Rock Head, Skill Link, Parental Bond) by their *attribute*,
   * the consecutive-use restriction by its exact i18n key, and Ash-Greninja's form.
   */
  "07-move-traits.js": [
    `${M}#MoveAttr.constructor`,
    // Turns and failure.
    `src/data/moves/move-condition.ts#FirstMoveCondition.constructor`,
    `src/data/moves/move-condition.ts#consecutiveUseRestriction`,
    `${M}#RechargeAttr.constructor`,
    `${M}#PreUseInterruptAttr.apply`,
    `${M}#InstantChargeAttr.constructor`,
    `${M}#WeatherInstantChargeAttr.constructor`,
    `${M}#SemiInvulnerableAttr.apply`,
    // What a move costs its user, and who blocks it.
    `${M}#RecoilAttr.constructor`,
    `${M}#RecoilAttr.apply`,
    `${M}#HalfSacrificialAttr.apply`,
    `${M}#SacrificialAttr.apply`,
    `${M}#SacrificialAttrOnHit.apply`,
    `${M}#MissEffectAttr.apply`,
    `${M}#FrenzyAttr.apply`,
    `${M}#RemoveTypeAttr.apply`,
    `src/data/abilities/ab-attrs.ts#BlockNonDirectDamageAbAttr.constructor`,
    `src/data/abilities/ab-attrs.ts#BlockRecoilDamageAttr.apply`,
    // §2 hit counts: the multi-hit type and the strikes Parental Bond and Multi-Lens add.
    `${M}#MultiHitAttr.getHitCount`,
    `${M}#MultiHitAttr.apply`,
    `${M}#MultiHitPowerIncrementAttr.apply`,
    `${M}#WaterShurikenMultiHitTypeAttr.apply`,
    `${M}#Move.canBeMultiStrikeEnhanced`,
    `src/data/abilities/ab-attrs.ts#MaxMultiHitAbAttr.apply`,
    `src/data/abilities/ab-attrs.ts#AddSecondStrikeAbAttr.canApply`,
    `src/modifier/modifier.ts#PokemonMultiHitModifier.apply`,
    // Status effects, as data: the fields each attribute carries.
    `${M}#StatStageChangeAttr.constructor`,
    `${M}#CutHpStatStageBoostAttr.constructor`,
    `${M}#StatusEffectAttr.constructor`,
    `${M}#AddBattlerTagAttr.constructor`,
    `${M}#AddArenaTrapTagAttr.getCondition`,
    `${M}#HealAttr.constructor`,
    `${M}#BoostHealAttr.constructor`,
    `${M}#PlantHealAttr.getWeatherHealRatio`,
    `${M}#HitHealAttr.constructor`,
    `${M}#FlinchAttr.constructor`,
    `${M}#ProtectAttr.constructor`,
    `${M}#ChangeTypeAttr.constructor`,
    `${M}#AddTypeAttr.constructor`,
    `src/enums/multi-hit-type.ts#MultiHitType`,
    `src/enums/move-target.ts#MoveTarget`,
  ],

  /**
   * §1–§5, §8, §18 drain, §21 end of turn. `getAttackDamage` is called (simulated,
   * sandboxed); everything the simulated call leaves out is re-implemented: the
   * damage roll, crits, accuracy, multi-hit counts, boss segments, Sturdy / Focus
   * Band / endure, and turn-end HP — the phases that run after the moves: weather,
   * berries, status chip and the turn-end heals.
   */
  "10-damage.js": [
    // Two orderings inside this one function are load-bearing, and both are named in `hud/10-damage.js`:
    // its `FixedDamageAttr` branch returns *before* the `PreDefendFullHpEndureAbAttr` step, so Sturdy does not
    // save a full-HP mon from Seismic Toss (upstream #7620 moves that and is unreleased — if this hash moves,
    // check whether it landed and set `STURDY_VS_FIXED_FROM` to the version that ships it); and the roll sits
    // inside the main product, *before* the post-roll multipliers and `ModifiedDamageAttr`'s cap, which is why
    // every roll of a capped move is asked of the game rather than spread from its max.
    `${P}#Pokemon.getAttackDamage`,
    // The factor the HUD scales to ask for a given roll: it reads nothing off the mon it is called on, and sits
    // beside the roll under the same `toDmgValue`, so scaling it scales exactly what the roll would.
    `${P}#Pokemon.calculateStabMultiplier`,
    `${M}#ModifiedDamageAttr.apply`,
    `${M}#SurviveDamageAttr.getModifiedDamage`,
    `${P}#Pokemon.getCriticalHitResult`,
    `${P}#Pokemon.getAccuracyMultiplier`,
    `${P}#Pokemon.getEffectiveStat`,
    `${P}#Pokemon.getMoveEffectiveness`,
    `${P}#Pokemon.damage`,
    `${P}#EnemyPokemon.damage`,
    `${P}#EnemyPokemon.handleBossSegmentCleared`,
    `src/utils/damage.ts#calculateBossSegmentDamage`,
    // KO pacing over later turns: a heal stops at max HP and never raises the bar index back; a Reviver Seed's second life.
    `${P}#Pokemon.heal`,
    `src/modifier/modifier.ts#PokemonInstantReviveModifier.apply`,
    `src/utils/common.ts#toDmgValue`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.hitCheck`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.checkBypassAccAndInvuln`,
    // Lock-On / Mind Reader's IGNORE_ACCURACY covers only the target that move named, which `checkBypassAccAndInvuln`
    // reads back out of the user's move history.
    `${P}#Pokemon.getLastXMoves`,
    // Present's power branch and its heal share, pinned draw by draw.
    `${M}#PresentPowerAttr.apply`,
    `${M}#MultiHitAttr.getHitCount`,
    `${M}#Move.calculateBattleAccuracy`,
    `${SCENE}#BattleScene.getEncounterBossSegments`,
    `src/modifier/modifier.ts#SurviveDamageModifier.apply`,
    `src/modifier/modifier.ts#EnemyEndureChanceModifier.apply`,
    `src/data/abilities/ab-attrs.ts#FormBlockDamageAbAttr.apply`,
    `src/phases/turn-end-phase.ts#TurnEndPhase.start`,
    // A move's flinch chance (Fake Out, Iron Head), read through the attr's own effect chance.
    `${M}#MoveEffectAttr.getMoveChance`,
    `${M}#AddBattlerTagAttr.apply`,
    // Moves stopped before the damage step (primordial weather, Psychic Terrain), and what goes through Protect.
    `src/field/arena.ts#Arena.isMoveWeatherCancelled`,
    `src/field/arena.ts#Arena.isMoveTerrainCancelled`,
    `src/phases/move-phase.ts#MovePhase.secondFailureCheck`,
    `src/phases/move-phase.ts#MovePhase.thirdFailureCheck`,
    `${M}#Move.doesFlagEffectApply`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.protectedCheck`,
    // §18 drain: the share of each hit's damage dealt that heals the user, Heal Block, Healing Charm, Liquid Ooze.
    `${M}#HitHealAttr.apply`,
    `${M}#HitHealAttr.getHealAmount`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.applyMoveEffects`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.applyMoveDamage`,
    `src/phases/pokemon-heal-phase.ts#PokemonHealPhase.end`,
    `src/modifier/modifier.ts#HealingBoosterModifier.apply`,
    `src/data/abilities/ab-attrs.ts#ReverseDrainAbAttr.canApply`,
    `src/data/abilities/ab-attrs.ts#ReverseDrainAbAttr.apply`,
    // Called: the move's type, category and crit stage.
    `${P}#Pokemon.getMoveType`,
    `${P}#Pokemon.getMoveCategory`,
    `${P}#Pokemon.getCritStage`,
    // §2 hit counts and per-hit power: the multi-hit type (Ash-Greninja's Water Shuriken), Skill Link, Parental Bond
    // and Multi-Lens strikes, the `turnData` MoveEffectPhase sets and the power steps read off it, a miss or faint
    // ending the use, and a spread move's target count.
    `${M}#MultiHitAttr.apply`,
    `${M}#WaterShurikenMultiHitTypeAttr.apply`,
    `src/data/abilities/ab-attrs.ts#MaxMultiHitAbAttr.apply`,
    `src/data/abilities/ab-attrs.ts#AddSecondStrikeAbAttr.canApply`,
    `${M}#Move.canBeMultiStrikeEnhanced`,
    `src/modifier/modifier.ts#PokemonMultiHitModifier.apply`,
    `src/modifier/modifier.ts#PokemonMultiHitModifier.applyDamageModifier`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.start`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.conductHitChecks`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.end`,
    `${M}#MultiHitPowerIncrementAttr.apply`,
    `src/data/moves/move-utils.ts#getMoveTargets`,
    // Damage outside the formula: Present's power draw, Psywave's range, Tera Shell's full-HP resist.
    `${M}#PresentPowerAttr.apply`,
    `${M}#RandomLevelDamageAttr.getDamage`,
    `src/data/abilities/ab-attrs.ts#FullHpResistTypeAbAttr.apply`,
    // §3, §8 survival: the classic final boss's last segment, Sturdy.
    `${P}#EnemyPokemon.getMinimumSegmentIndex`,
    `src/data/abilities/ab-attrs.ts#PreDefendFullHpEndureAbAttr.canApply`,
    // §21 `endOfTurnHp`: the turn-end phase order, weather chip and who it spares, berries, status chip and the
    // status orbs, the TURN_END tags, Leftovers, Shell Bell, the enemy's per-turn heal, and the weather, status and
    // turn-end abilities. The order between these phases is the model, not a detail: the weather chip lands before
    // the berry predicate reads the HP, and the berry before the status chip, which is what decides survival.
    `src/phase-manager.ts#turnEndPhases`,
    `src/phases/weather-effect-phase.ts#WeatherEffectPhase.start`,
    `src/data/weather.ts#Weather.isTypeDamageImmune`,
    `src/data/abilities/ab-attrs.ts#BlockWeatherDamageAttr.canApply`,
    `src/phases/berry-phase.ts#BerryPhase.eatBerries`,
    `src/data/berry.ts#getBerryPredicate`,
    `src/data/berry.ts#getBerryEffectFunc`,
    `src/phases/post-turn-status-effect-phase.ts#PostTurnStatusEffectPhase.start`,
    `src/modifier/modifier.ts#TurnStatusEffectModifier.apply`,
    `src/modifier/modifier.ts#TurnHealModifier.apply`,
    `src/modifier/modifier.ts#HitHealModifier.apply`,
    `src/modifier/modifier.ts#EnemyTurnHealModifier.apply`,
    `src/data/abilities/ab-attrs.ts#PostWeatherLapseDamageAbAttr.apply`,
    `src/data/abilities/ab-attrs.ts#PostWeatherLapseHealAbAttr.apply`,
    `src/data/abilities/ab-attrs.ts#PostTurnStatusHealAbAttr.apply`,
    `src/data/abilities/ab-attrs.ts#PostTurnHurtIfSleepingAbAttr.apply`,
    // The Sitrus bar is a *rounded* ratio: `getHpRatio()` to the whole percent, so < 0.495 rather than < 0.5.
    `${P}#Pokemon.getHpRatio`,
    // The TURN_END tags, each read by its class rather than its `BattlerTagType` member (inlined by then). A tag that
    // changes its share of max HP, or moves off TURN_END, silently drops out of the turn-end number.
    `${P}#Pokemon.lapseTags`,
    `src/data/battler-tags.ts#SeedTag.lapse`,
    `src/data/battler-tags.ts#NightmareTag.lapse`,
    `src/data/battler-tags.ts#DamagingTrapTag.lapse`,
    `src/data/battler-tags.ts#SaltCuredTag.lapse`,
    `src/data/battler-tags.ts#CursedTag.lapse`,
    `src/data/battler-tags.ts#IngrainTag.lapse`,
    `src/data/battler-tags.ts#AquaRingTag.lapse`,
    // Read as bare bits: contact (an ability's counter-attack), and the flags a hit ignores.
    `src/enums/move-flags.ts#MoveFlags`,
    // Which moves can be picked at all (`selectable`), and — for a slot left with nothing to do — which restriction
    // took one away (`sceneStopped`, #263). `isMoveSelectable` refuses on the first `MoveRestrictionBattlerTag`
    // whose `isMoveRestricted` bites, so the HUD asks the same tags, by class, and names them; it is listed here
    // because it is where that base class is tested for, and a tag moved off it stops being asked. A restriction
    // added or renamed goes unnamed rather than wrong — the pool still shrinks, the line just loses its reason.
    `src/data/moves/pokemon-move.ts#PokemonMove.isUsable`,
    `${P}#Pokemon.isMoveSelectable`,
    `src/data/battler-tags.ts#DisabledTag.isMoveRestricted`,
    `src/data/battler-tags.ts#TauntTag.isMoveRestricted`,
    `src/data/battler-tags.ts#EncoreTag.isMoveRestricted`,
    `src/data/battler-tags.ts#TormentTag.isMoveRestricted`,
    `src/data/battler-tags.ts#ImprisonTag.isMoveRestricted`,
    `src/data/battler-tags.ts#ThroatChoppedTag.isMoveRestricted`,
    `src/data/battler-tags.ts#HealBlockTag.isMoveRestricted`,
    `src/data/battler-tags.ts#GorillaTacticsTag.isMoveRestricted`,
  ],

  /**
   * §6, §7. Two readings of one decision. `sceneExactMoves` **calls the game's own**
   * `getNextMove` at the command prompt, which returns the move and target the enemy
   * will use rather than a sample (§6, #158 live: 69/69); this turn's plan is played
   * on it (#183). The rest re-implements the whole choice to get every outcome with
   * its chance, which later turns, `aiReplay` and the pin-bump oracle need.
   * `predictSwitches` calls the trainer's matchup scoring, also listed under
   * `35-team-plan.js`.
   */
  "20-enemy-ai.js": [
    `${P}#EnemyPokemon.getNextMove`,
    `${P}#EnemyPokemon.getNextTargets`,
    `src/phases/enemy-command-phase.ts#EnemyCommandPhase.start`,
    `${M}#Move.getTargetBenefitScore`,
    `${M}#Move.getUserBenefitScore`,
    `${M}#AttackMove.getTargetBenefitScore`,
    // `aiReplay`: a foe's setup move scored per stage it can still add.
    `${M}#StatStageChangeAttr.getTargetBenefitScore`,
    // `forcedRng` stands in for the battle stream's draw; `aiMoveTargets` restates the targeting (RANDOM_NEAR_ENEMY
    // draws); `aiTargetScore` enumerates consecutive Protect's draw; a queued move is read by its use mode.
    `src/battle.ts#Battle.randSeedInt`,
    `src/data/moves/move-utils.ts#getMoveTargets`,
    // The exact call: what makes the command prompt a fixed position on the battle
    // stream (`incrementTurn` nulls `battleSeedState`, which re-sows it), and the one
    // thing that draws before `EnemyCommandPhase` — our own `RANDOM_NEAR_ENEMY`
    // command, whose draw `sceneExactMoves` makes first (`ranges`).
    `src/battle.ts#Battle.incrementTurn`,
    `src/phases/command-phase.ts#CommandPhase.handleFightCommand`,
    `${M}#ProtectAttr.getCondition`,
    `src/enums/move-use-mode.ts#isVirtual`,
    `src/enums/move-use-mode.ts#isIgnorePP`,
    `${P}#Pokemon.getMoveType`,
    // `sceneSwitches`.
    `${P}#Pokemon.getMatchupScore`,
    `${P}#Pokemon.isTrapped`,
    `src/field/trainer.ts#Trainer.getPartyMemberMatchupScores`,
    `src/field/trainer.ts#Trainer.getSortedPartyMemberMatchupScores`,
    `src/field/trainer.ts#Trainer.getNextSummonIndex`,
    // Its two-line party swap, replayed locally so a doubles double-switch reads the
    // arriving mon off the post-swap party the way the game does (#285, #290).
    `src/phases/switch-summon-phase.ts#SwitchSummonPhase.switchAndSummon`,
  ],

  /**
   * §0, §7, §14. The one door between the coach engine and the live battle: it opens the single sandbox, settles the
   * Tera a trainer is about to use, writes a hypothesis on and off, and makes every per-mon game call the planner,
   * the fight plan and the catch card used to make for themselves. Nothing below it decides *when* a game call is
   * allowed, so a change to any of these reaches all three cards at once.
   */
  "25-turn.js": [
    // §7 predicted Tera: `shouldTera` is called, and the flag replays what TeraPhase writes — the added type it
    // clears included. Damage is asked with it on, the AI with it off (EnemyCommandPhase runs first).
    `src/field/trainer.ts#Trainer.shouldTera`,
    `src/phases/tera-phase.ts#TeraPhase.end`,
    `src/phases/enemy-command-phase.ts#EnemyCommandPhase.start`,
    // §14 a typing written onto a mon: the two fields `assuming` sets are the ones the game's own type read goes
    // through, so a changed read (or a changed write) silently stops a retype from reaching any number.
    `${P}#Pokemon.getTypes`,
    `${P}#Pokemon.getBaseTypes`,
    `${M}#ChangeTypeAttr.apply`,
    `${M}#AddTypeAttr.apply`,
    // The turn key: the enemy decides after our command, so one read of this moment answers every question in it.
    `src/phases/turn-init-phase.ts#TurnInitPhase.start`,
    // The per-mon record. Turn order's priority and bracket, and the effective Speed they are compared at.
    `${M}#Move.getPriority`,
    `${M}#Move.getPriorityModifier`,
    `${P}#Pokemon.getEffectiveStat`,
    // Whether a status can be put on a mon at all, and the Stealth Rock share a hazard would take off it.
    `${P}#Pokemon.canSetStatus`,
    `${P}#Pokemon.getAttackTypeEffectiveness`,
    `${P}#Pokemon.isOfType`,
    // The stages a setup move of its own would add: the attribute's own count, the ability multiplier, the ±6 cap.
    `${M}#StatStageChangeAttr.getLevels`,
    `src/data/abilities/ab-attrs.ts#StatStageChangeMultiplierAbAttr.apply`,
    `${P}#Pokemon.getStatStage`,
    // The weather a move of its own is judged in: an override answers first and beats suppression, so a Cloud Nine
    // on the field doesn't take it away.
    `src/data/weather.ts#getEffectiveWeatherForMove`,
    `src/data/abilities/ab-attrs.ts#PreAttackWeatherOverrideAbAttr.apply`,
    // The trainer's send-in score, asked once with our HP at 0 so the fight plan can put the HP back itself.
    `${P}#Pokemon.getMatchupScore`,
  ],

  /** §5 turn order and §9 free switches: no safe call returns either, so both are re-derived. */
  "30-planner.js": [
    // The benefit nudge (#128): a move's cost to its user, as the game's own move scoring measures it — full step 7
    // of getNextMove for *our* move, through 20-enemy-ai's `aiTargetScore`. A changed benefit score changes which
    // move the ⚔ line picks between two that hit alike, and which count as drawbacks.
    `${M}#MoveAttr.getUserBenefitScore`,
    `${M}#MoveAttr.getTargetBenefitScore`,
    `${M}#Move.getUserBenefitScore`,
    `${M}#Move.getTargetBenefitScore`,
    `src/utils/speed-order.ts#sortInSpeedOrder`,
    `src/modifier/modifier.ts#BypassSpeedChanceModifier.apply`,
    `src/phases/turn-start-phase.ts#TurnStartPhase.start`,
    `${P}#Pokemon.isTrapped`,
    `src/phases/check-switch-phase.ts#CheckSwitchPhase.start`,
    `src/phases/encounter-phase.ts#EncounterPhase.end`,
    `src/data/abilities/ab-attrs.ts#ForceSwitchOutHelper.switchOutLogic`,
    // The consistency prior: a mon that came in last turn, read off `tempSummonData.turnCount` — reset on a switch-in,
    // one short for a switch made as a command, counted up at turn end.
    `${P}#Pokemon.resetSummonData`,
    `src/phases/switch-summon-phase.ts#SwitchSummonPhase.onEnd`,
    `src/phases/turn-end-phase.ts#TurnEndPhase.start`,
    // Status moves as a turn's action: stat stages written onto a mon and read back, paralysis's 1-in-8, toxic's
    // growing chip, a second Protect's odds, and what setup, status, heal and hazard moves do when they land.
    `src/phases/move-phase.ts#MovePhase.checkPara`,
    `src/data/status-effect.ts#Status.incrementTurn`,
    `${M}#ProtectAttr.getCondition`,
    `${M}#ChangeTypeAttr.getCondition`,
    `${M}#AddTypeAttr.getCondition`,
    `${M}#StatStageChangeAttr.apply`,
    `${M}#CutHpStatStageBoostAttr.apply`,
    `${M}#StatusEffectAttr.apply`,
    `${M}#HealAttr.apply`,
    `${M}#PlantHealAttr.getWeatherHealRatio`,
    `${M}#SandHealAttr.getWeatherHealRatio`,
    `src/data/arena-tag.ts#EntryHazardTag.apply`,
    `src/data/arena-tag.ts#DamagingTrapTag.activateTrap`,
    `src/data/arena-tag.ts#SpikesTag.getDamageHpRatio`,
    `src/data/arena-tag.ts#StealthRockTag.getDamageHpRatio`,
    `src/data/arena-tag.ts#ToxicSpikesTag.activateTrap`,
    // §18 on-KO boosts: who gains stages when a mon faints, and Beast Boost's pick of stat. Also 35-team-plan's.
    `src/phases/faint-phase.ts#FaintPhase.doFaint`,
    `src/data/abilities/ab-attrs.ts#PostVictoryStatStageChangeAbAttr.apply`,
    `src/data/abilities/ab-attrs.ts#PostKnockOutStatStageChangeAbAttr.apply`,
    `src/data/abilities/init-abilities.ts#beastBoostHighestStatCalc`,
    // `actionOrder`: a switch, item or run goes first; then priority, bracket (Quick Claw, Quick Draw) and speed.
    `src/phases/turn-start-phase.ts#TurnStartPhase.getCommandOrder`,
    `src/queues/move-phase-priority-queue.ts#MovePhasePriorityQueue.sortPostSpeed`,
    `src/data/abilities/ab-attrs.ts#BypassSpeedChanceAbAttr.canApply`,
    // Either bypass only lands if the tag can go on at all, which is where Mycelium Might stops it.
    `src/data/battler-tags.ts#BypassSpeedTag.canAdd`,
    `src/data/abilities/ab-attrs.ts#PreventBypassSpeedChanceAbAttr.canApply`,
    // A speed tie is the turn shuffle's, re-implemented: the seed offset, the queue it shuffles and the Fisher-Yates
    // draw itself. `sortInSpeedOrder` above is the function this replays.
    `src/utils/common.ts#randSeedShuffle`,
    `${SCENE}#BattleScene.executeWithSeedOffset`,
    `src/queues/priority-queue.ts#PriorityQueue.pop`,
    // Sleep: the 2-or-3 turn roll, the countdown `actChance` / `actDelay` / `STATUS_SKIP` restate, Early Bird.
    `${P}#Pokemon.doSetStatus`,
    `src/phases/move-phase.ts#MovePhase.checkSleep`,
    `src/data/abilities/ab-attrs.ts#ReduceStatusEffectDurationAbAttr.apply`,
    // `statusPlay` reads a weather-boosted heal's fields by name; the weather it is priced in is the turn's read.
    `${M}#BoostHealAttr.constructor`,
  ],

  /**
   * The trainer's send-in after a faint, re-scored at the HP the plan has reached:
   * `getMatchupScore`'s HP factor is re-implemented around one game call.
   */
  "35-team-plan.js": [
    `${P}#Pokemon.getMatchupScore`,
    `src/field/trainer.ts#Trainer.getPartyMemberMatchupScores`,
    `src/field/trainer.ts#Trainer.getNextSummonIndex`,
  ],

  /**
   * The party judged as a whole. Four pure reads, each guarded: the luck the party
   * carries (`getPartyLuckValue`'s own rule, re-implemented around `getLuck` /
   * `isAllowedInBattle`), the line a mon belongs to, the evolutions still ahead of it
   * (read as `[[speciesId, level], …]`, which is what makes a final BST an estimate)
   * and a fusion's averaged base stats. The type chart and the ability immunities are
   * `01-core.js`'s.
   */
  "08-party.js": [
    `src/modifier/modifier-type.ts#getPartyLuckValue`,
    // The luck value's three terms that aren't the party's: Daily's own fork, the event seed's pinned luck, and the
    // timed event's boosted species and flat boost.
    `${SCENE}#BattleScene.executeWithSeedOffset`,
    `src/utils/common.ts#randSeedInt`,
    `src/data/daily-seed/daily-run.ts#getDailyEventSeedLuck`,
    `src/timed-event-manager.ts#TimedEventManager.getEventLuckBoost`,
    `src/timed-event-manager.ts#TimedEventManager.getEventLuckBoostedSpecies`,
    `${P}#Pokemon.getLuck`,
    `${P}#Pokemon.isAllowedInBattle`,
    `${P}#Pokemon.calculateBaseStats`,
    `src/data/pokemon-species.ts#PokemonSpecies.getEvolutionLevels`,
    `src/data/pokemon-species.ts#PokemonSpeciesForm.getRootSpeciesId`,
  ],

  /**
   * §13. Safari Zone's three mons, replayed before the fee is paid (#313). The whole
   * module is a replay of one draw sequence, so every function in it *and their order*
   * are the dependency: `summonSafariPokemon`'s fork offset, the parameters it hands
   * `getRandomEncounterPokemon`, that function's own branch order (the event arm before
   * the species function, both shiny rerolls before the hidden-ability one), and the
   * two `randSeedInt` calls `getRandomSpeciesByStarterCost` makes in the order it makes
   * them — the index is drawn against the *unshuffled* band. The two base rates are
   * spelled out as numbers, so a rebalance moves the odds silently. The reroll methods
   * and the constructor are *called*, not re-implemented, which is why the shiny
   * threshold picks up the player's Shiny Charm stacks without this module knowing.
   */
  "44-safari.js": [
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#summonSafariPokemon`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#getSafariSpeciesSpawn`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#NUM_SAFARI_ENCOUNTERS`,
    `src/data/mystery-encounters/utils/encounter-phase-utils.ts#getRandomEncounterPokemon`,
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#getRandomSpeciesByStarterCost`,
    `src/data/balance/special-species-groups.ts#NON_LEGEND_PARADOX_POKEMON`,
    `src/data/balance/rates.ts#BASE_SHINY_CHANCE`,
    `src/data/balance/rates.ts#BASE_HIDDEN_ABILITY_RATE`,
    `${P}#Pokemon.trySetShinySeed`,
    `${P}#Pokemon.tryRerollHiddenAbilitySeed`,
    `${SCENE}#BattleScene.addEnemyPokemon`,
    `${SCENE}#BattleScene.executeWithSeedOffset`,
    `src/battle.ts#Battle.getLevelForWave`,
    `src/timed-event-manager.ts#TimedEventManager.getAllValidEventEncounters`,
    `src/utils/common.ts#randSeedItem`,
  ],
  /**
   * §20. Catch odds and whether a ball is allowed at all, both re-implemented; the
   * fusion-aware shiny check and its candy, the event's shiny multiplier, and the move
   * that leaves a foe at 1 HP. What a catch does (Limited Catch, a full party, the dex
   * bits and candy) is re-implemented too; the game-mode checks are called, with
   * fallbacks. What the catch is worth to the party is `08-party.js`'s.
   */
  "45-catch.js": [
    `src/phases/attempt-capture-phase.ts#AttemptCapturePhase.start`,
    `src/data/pokeball.ts#getCriticalCaptureChance`,
    `src/phases/command-phase.ts#CommandPhase.checkCanUseBall`,
    `${P}#Pokemon.isShiny`,
    `src/system/game-data.ts#GameData.setPokemonSpeciesCaught`,
    `src/timed-event-manager.ts#TimedEventManager.getShinyCatchMultiplier`,
    `src/data/moves/move.ts#SurviveDamageAttr.getModifiedDamage`,
    // The capture formula's factors: ball, status, Catching Charm.
    `src/data/pokeball.ts#getPokeballCatchMultiplier`,
    `src/data/status-effect.ts#getStatusEffectCatchRateMultiplier`,
    `src/modifier/modifier.ts#CriticalCatchChanceBoosterModifier.apply`,
    // Whether a ball is allowed: a boss with bars left (Wonder Guard aside), the final bosses, Fresh Start.
    `src/phases/command-phase.ts#CommandPhase.handleBallCommand`,
    `${P}#Pokemon.hasAbility`,
    `src/game-mode.ts#GameMode.isBattleClassicFinalBoss`,
    `src/game-mode.ts#GameMode.isEndlessMinorBoss`,
    `src/game-mode.ts#GameMode.isFullFreshStartChallenge`,
    `src/game-mode.ts#GameMode.isFreshStartChallenge`,
    `src/game-mode.ts#GameMode.hasAnyChallenges`,
    `src/game-mode.ts#GameMode.isWaveFinal`,
    `src/data/daily-seed/daily-run.ts#getDailyEventSeedBoss`,
    `src/data/daily-seed/daily-seed-utils.ts#isDailyFinalBoss`,
    `src/system/game-data.ts#GameData.getStarterCount`,
    // What a catch does.
    `src/phases/attempt-capture-phase.ts#AttemptCapturePhase.catch`,
    `src/data/challenge.ts#LimitedCatchChallenge.applyPokemonAddToParty`,
    `${P}#Pokemon.getDexAttr`,
    // Which species the catch writes to: the starter root the IVs and the ability unlock follow, and the
    // prevolution-free root the candy is paid at, whose own mask decides whether a Daily run pays it.
    `src/data/pokemon-species.ts#PokemonSpeciesForm.getRootSpeciesId`,
    `src/data/pokemon-species.ts#PokemonSpecies.getFullUnlocksData`,
    `src/data/species-data-registry.ts#SpeciesDataRegistry.getSpecies`,
  ],

  /**
   * The learn card calls nothing. What a move *does* now comes from
   * `07-move-traits.js`, which owns the attribute shapes; what is left here is what
   * the card prices itself: the stand-in power of a move whose power is set by the
   * target or the moment (fixed damage priced back through the base damage formula,
   * Present at its expected power) and the type a move actually lands as. Two enums
   * come through as bare values — `MoveTarget` and `StatusEffect` as numbers the
   * card indexes tables with, `BattlerTagType` as the strings it keys `TAG_VALUE`
   * by — so a reordered member silently mis-scores every move that carries it. With
   * a roster (#122) it re-implements who a status move can land on and what a
   * disrupting tag takes away: the status and tag immunities of the abilities (read
   * off `initAbilities` by name), the type checks, powder and Thunder Wave's type
   * immunity, and the moves Taunt, Heal Block and Encore act on.
   */
  "40-learn.js": [
    `${P}#Pokemon.getBaseDamage`,
    `${M}#PresentPowerAttr.apply`,
    `${P}#Pokemon.canSetStatus`,
    `${P}#Pokemon.getMoveEffectiveness`,
    `${M}#Move.isTypeImmune`,
    `src/data/abilities/init-abilities.ts#initAbilities`,
    `src/data/battler-tags.ts#TauntTag.isMoveRestricted`,
    `src/data/battler-tags.ts#HealBlockTag.isMoveRestricted`,
    `src/data/battler-tags.ts#EncoreTag.canAdd`,
    `src/data/moves/invalid-moves.ts#healBlockedMoves`,
    `src/enums/move-target.ts#MoveTarget`,
    `src/enums/status-effect.ts#StatusEffect`,
    `src/enums/battler-tag-type.ts#BattlerTagType`,
  ],

  /**
   * §13. The Mystery Encounter card calls nothing that decides an outcome: it
   * reads the handler's requirement answers, and re-implements what each of the
   * common, great, ultra and rogue encounters it knows does from its source file — so
   * every encounter const, the helpers and tuning constants its outcome is spelled
   * from, and the phases that fork the RNG are the dependency. A moved fork offset
   * (`handleOptionSelect` ×1, `MysteryEncounterOptionSelectedPhase` ×500,
   * `PostMysteryEncounterPhase` ×2000) or a reordered draw inside an option makes
   * every 🔮 outcome confidently wrong. Two enums come through as bare numbers:
   * the encounter type the rules are keyed by and the Nature the dealer rolls.
   * Every fork is run through `executeWithSeedOffset`; `randSeedInt` is restated.
   * The great tier adds two readings that are not draws and drift just as quietly:
   * a trainer-battle config, whose team size the card spells from the party
   * templates the encounter sets, and the modifier classes it looks up by class
   * name to tell a charm that is about to degrade into a Shell Bell.
   */
  "46-encounter.js": [
    `src/ui/handlers/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.displayEncounterOptions`,
    `src/ui/handlers/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.processInput`,
    `src/phases/mystery-encounter-phases.ts#MysteryEncounterPhase.start`,
    `src/phases/mystery-encounter-phases.ts#MysteryEncounterPhase.handleOptionSelect`,
    `src/phases/mystery-encounter-phases.ts#MysteryEncounterOptionSelectedPhase.start`,
    `src/phases/mystery-encounter-phases.ts#PostMysteryEncounterPhase.start`,
    `src/phases/mystery-encounter-phases.ts#MysteryEncounterRewardsPhase.doEncounterRewardsAndContinue`,
    `src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.updateSeedOffset`,
    `${SCENE}#BattleScene.executeWithSeedOffset`,
    `src/utils/common.ts#randSeedInt`,
    `src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOption.meetsRequirements`,
    `src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOption.meetsPrimaryRequirementAndPrimaryPokemonSelected`,
    `src/data/mystery-encounters/mystery-encounter-requirements.ts#MoneyRequirement.meetsRequirement`,
    `src/data/mystery-encounters/requirements/requirement-groups.ts#STEALING_MOVES`,
    `src/data/mystery-encounters/requirements/requirement-groups.ts#CHARMING_MOVES`,
    `src/data/mystery-encounters/requirements/requirement-groups.ts#FIRE_RESISTANT_ABILITIES`,
    `src/data/mystery-encounters/utils/encounter-phase-utils.ts#leaveEncounterWithoutBattle`,
    `src/data/mystery-encounters/utils/encounter-phase-utils.ts#handleMysteryEncounterVictory`,
    `src/data/mystery-encounters/utils/encounter-phase-utils.ts#initBattleWithEnemyConfig`,
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#getHighestLevelPlayerPokemon`,
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#getEncounterPokemonLevelForWave`,
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#applyDamageToPokemon`,
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#modifyPlayerPokemonBST`,
    `src/modifier/modifier.ts#PokemonBaseStatTotalModifier.apply`,
    `src/modifier/modifier.ts#MoneyMultiplierModifier.apply`,
    `src/modifier/modifier.ts#MoneyMultiplierModifier.getMaxStackCount`,
    `${SCENE}#BattleScene.getWaveMoneyAmount`,
    `src/enums/mystery-encounter-type.ts#MysteryEncounterType`,
    `src/enums/mystery-encounter-tier.ts#MysteryEncounterTier`,
    `src/enums/nature.ts#Nature`,
    `src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#MysteriousChestEncounter`,
    `src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#TRAP_PERCENT`,
    `src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#COMMON_REWARDS_PERCENT`,
    `src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#ULTRA_REWARDS_PERCENT`,
    `src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#ROGUE_REWARDS_PERCENT`,
    `src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#MASTER_REWARDS_PERCENT`,
    `src/data/mystery-encounters/encounters/fight-or-flight-encounter.ts#FightOrFlightEncounter`,
    `src/data/mystery-encounters/encounters/department-store-sale-encounter.ts#DepartmentStoreSaleEncounter`,
    `src/data/mystery-encounters/encounters/shady-vitamin-dealer-encounter.ts#ShadyVitaminDealerEncounter`,
    `src/data/mystery-encounters/encounters/lost-at-sea-encounter.ts#LostAtSeaEncounter`,
    `src/data/mystery-encounters/encounters/lost-at-sea-encounter.ts#DAMAGE_PERCENTAGE`,
    `src/data/mystery-encounters/encounters/fiery-fallout-encounter.ts#FieryFalloutEncounter`,
    `src/data/mystery-encounters/encounters/fiery-fallout-encounter.ts#DAMAGE_PERCENTAGE`,
    `src/data/mystery-encounters/encounters/the-strong-stuff-encounter.ts#TheStrongStuffEncounter`,
    `src/data/mystery-encounters/encounters/berries-abound-encounter.ts#BerriesAboundEncounter`,
    `src/data/mystery-encounters/encounters/part-timer-encounter.ts#PartTimerEncounter`,
    `src/data/mystery-encounters/encounters/part-timer-encounter.ts#applyMoneyMultipliers`,
    `src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#TeleportingHijinksEncounter`,
    `src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#BIOME_CANDIDATES`,
    `src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#doBiomeTransitionDialogueAndBattleInit`,
    `src/data/mystery-encounters/encounters/uncommon-breed-encounter.ts#UncommonBreedEncounter`,
    `src/data/mystery-encounters/encounters/global-trade-system-encounter.ts#GlobalTradeSystemEncounter`,
    `src/data/mystery-encounters/encounters/global-trade-system-encounter.ts#getPokemonTradeOptions`,
    // The great tier (#144): the three challengers and their party templates, the
    // Snorlax nap's full heal, the Safari fee and its odds, which charm Delibird-y
    // hands back and when it degrades, Avarice's berry return, the Oricorio on the
    // field, the Superfan's tutor moves and bug ladder, the Fun and Games prizes.
    `src/data/mystery-encounters/encounters/mysterious-challengers-encounter.ts#MysteriousChallengersEncounter`,
    `src/data/mystery-encounters/encounters/slumbering-snorlax-encounter.ts#SlumberingSnorlaxEncounter`,
    `src/phases/party-heal-phase.ts#PartyHealPhase.start`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SafariZoneEncounter`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SAFARI_MONEY_MULTIPLIER`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#NUM_SAFARI_ENCOUNTERS`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#safariZoneGameOptions`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#throwPokeball`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#getSafariSpeciesSpawn`,
    // The minigame turn (#297): the two rolls the card prices — the ball's three shakes and the flee roll every
    // other turn ends on — the stage changes bait and mud buy, and the re-opened option screen they run on.
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#trainerThrowPokeball`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#isPokemonFlee`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeCatchStage`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeFleeStage`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#doEndTurn`,
    `src/data/mystery-encounters/encounters/safari-zone-encounter.ts#summonSafariPokemon`,
    `src/data/mystery-encounters/utils/encounter-phase-utils.ts#initSubsequentOptionSelect`,
    `src/data/mystery-encounters/encounters/delibirdy-encounter.ts#DelibirdyEncounter`,
    `src/data/mystery-encounters/encounters/delibirdy-encounter.ts#DELIBIRDY_MONEY_PRICE_MULTIPLIER`,
    `src/data/mystery-encounters/encounters/delibirdy-encounter.ts#OPTION_2_ALLOWED_MODIFIERS`,
    `src/data/mystery-encounters/encounters/delibirdy-encounter.ts#OPTION_3_DISALLOWED_MODIFIERS`,
    `src/modifier/modifier.ts#LevelIncrementBoosterModifier.getMaxStackCount`,
    `src/modifier/modifier.ts#PreserveBerryModifier.getMaxStackCount`,
    `src/modifier/modifier.ts#HealingBoosterModifier.getMaxStackCount`,
    `src/modifier/modifier.ts#MegaEvolutionAccessModifier.getMaxStackCount`,
    `src/modifier/modifier.ts#GigantamaxAccessModifier.getMaxStackCount`,
    `src/data/mystery-encounters/encounters/absolute-avarice-encounter.ts#AbsoluteAvariceEncounter`,
    `src/data/mystery-encounters/encounters/dancing-lessons-encounter.ts#DancingLessonsEncounter`,
    `src/data/mystery-encounters/requirements/requirement-groups.ts#DANCING_MOVES`,
    `src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#BugTypeSuperfanEncounter`,
    `src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#PHYSICAL_TUTOR_MOVES`,
    `src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#SPECIAL_TUTOR_MOVES`,
    `src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#STATUS_TUTOR_MOVES`,
    `src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#MISC_TUTOR_MOVES`,
    `src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#getTrainerConfigForWave`,
    `src/data/mystery-encounters/encounters/fun-and-games-encounter.ts#FunAndGamesEncounter`,
    `src/data/mystery-encounters/encounters/fun-and-games-encounter.ts#handleNextTurn`,
    `src/data/mystery-encounters/encounters/fun-and-games-encounter.ts#handleLoseMinigame`,
    `src/data/mystery-encounters/encounters/fun-and-games-encounter.ts#summonPlayerPokemon`,
    // The ultra tier (#145): the mirror-match prizes and bar counts, the salesman's
    // mon and price, the dig's Black Sludge, the clown's ability pool and type
    // shuffle, the breeder's egg maths and its soft loss.
    `src/data/mystery-encounters/encounters/training-session-encounter.ts#TrainingSessionEncounter`,
    `src/data/mystery-encounters/encounters/the-pokemon-salesman-encounter.ts#ThePokemonSalesmanEncounter`,
    `src/data/mystery-encounters/encounters/the-pokemon-salesman-encounter.ts#getSalesmanSpeciesOffer`,
    `src/data/mystery-encounters/encounters/trash-to-treasure-encounter.ts#TrashToTreasureEncounter`,
    `src/data/mystery-encounters/encounters/clowning-around-encounter.ts#ClowningAroundEncounter`,
    `src/data/mystery-encounters/encounters/the-expert-pokemon-breeder-encounter.ts#TheExpertPokemonBreederEncounter`,
    // The rogue tier (#145): which member Dark Deal takes and what it pays with,
    // the stat trainer's rewards, the whole Weird Dream transformation, the
    // Winstrate run of five.
    `src/data/mystery-encounters/encounters/dark-deal-encounter.ts#DarkDealEncounter`,
    `src/data/mystery-encounters/encounters/a-trainers-test-encounter.ts#ATrainersTestEncounter`,
    `src/data/mystery-encounters/encounters/weird-dream-encounter.ts#WeirdDreamEncounter`,
    `src/data/mystery-encounters/encounters/the-winstrate-challenge-encounter.ts#TheWinstrateChallengeEncounter`,
    // The draws those rules replay, and the party template a trainer fight's size
    // is read off.
    `src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#getRandomPlayerPokemon`,
    `src/utils/common.ts#randSeedShuffle`,
    `src/utils/pokemon-utils.ts#getRandomRegularPokemonType`,
    `src/data/trainers/trainer-config.ts#TrainerConfig.initForStatTrainer`,
    `src/data/trainers/trainer-party-template.ts#trainerPartyTemplates`,
    `src/data/trainers/trainer-party-template.ts#TrainerPartyCompoundTemplate.constructor`,
    // Why a trainer's own templates settle nothing: the func wins, and the index is drawn.
    `src/field/trainer.ts#Trainer.getPartyTemplate`,
    `src/field/trainer.ts#Trainer.getPartyLevels`,
  ],

  /**
   * §10: the biome choice the phase offers, and what each of the ten waves it
   * covers holds: the spawn and trainer rules behind the pools it scans, the gym
   * leader on the gym wave, and wild evolutions by level. All re-implemented as
   * odds. Which wave is which, how likely a trainer is on it and who comes back
   * from fainting at the X1 heal are the run calendar's (`03-calendar.js`).
   */
  "47-biome.js": [
    `src/phases/select-biome-phase.ts#SelectBiomePhase.start`,
    `src/field/arena.ts#Arena.randomSpecies`,
    `src/field/arena.ts#Arena.randomTrainerType`,
    `src/field/arena.ts#Arena.generateNonBossBiomeTier`,
    `src/field/arena.ts#Arena.generateBossBiomeTier`,
    `src/field/arena.ts#Arena.checkLegendBST`,
    `src/field/arena.ts#Arena.getTimeOfDay`,
    `src/game-mode.ts#GameMode.isTrainerBoss`,
    `src/game-mode.ts#GameMode.getWaveForDifficulty`,
    `src/data/daily-seed/daily-run.ts#getDailyForcedWaveBiomePoolTier`,
    `src/field/trainer.ts#Trainer.genNewPartyMemberSpecies`,
    `${SCENE}#BattleScene.randomSpecies`,
    `src/data/trainers/trainer-config.ts#TrainerConfig.initForGymLeader`,
    `src/ai/ai-species-gen.ts#determineEnemySpecies`,
    `src/ai/ai-species-gen.ts#calcEvoChance`,
    `src/ai/ai-species-gen.ts#getRequiredPrevo`,
    // `wavesIn`: the pools merged per tier for a time of day (*when* they are rebuilt is `03-calendar.js`'s
    // `poolAnchorWave`), and the boss-spawn rule, the random Endless boss past 250 included.
    `src/field/arena.ts#Arena.updatePoolsForTimeOfDay`,
    `${SCENE}#BattleScene.getEncounterBossSegments`,
    // `formsAt`'s WILD vs NORMAL evolution kind, and each trainer config's default `speciesFilter`.
    `src/data/pokemon-species.ts#PokemonSpecies.getWildSpeciesForLevel`,
    `src/data/trainers/trainer-config.ts#TrainerConfig.constructor`,
  ],

  /**
   * §11. The preview replays `newBattle`'s own draws in the game's own order inside
   * `executeWithSeedOffset`, so every method it calls *and their order* are the
   * dependency: a reordered draw desynchronises every field after it, and the
   * arrival tally would only notice after the fact. `shiftCharCodes` and
   * `randSeedInt` are restated in `48-preview.js`, though both are exported by name
   * (upstream keeps names through minification, §22); if either changes, the wave
   * seed or every draw position is wrong.
   */
  "48-preview.js": [
    `${SCENE}#BattleScene.newBattle`,
    `${SCENE}#BattleScene.handleFixedBattle`,
    `${SCENE}#BattleScene.handleNonFixedBattle`,
    `${SCENE}#BattleScene.executeWithSeedOffset`,
    `${SCENE}#BattleScene.resetSeed`,
    `${SCENE}#BattleScene.isWaveMysteryEncounter`,
    `${SCENE}#BattleScene.generateNewBattleTrainer`,
    `${SCENE}#BattleScene.checkIsDouble`,
    `${SCENE}#BattleScene.getEncounterBossSegments`,
    `${SCENE}#BattleScene.randomSpecies`,
    `${SCENE}#BattleScene.addEnemyPokemon`,
    `${SCENE}#BattleScene.getMysteryEncounter`,
    `src/field/arena.ts#Arena.randomSpecies`,
    `src/game-mode.ts#GameMode.isFixedBattle`,
    `src/game-mode.ts#GameMode.getFixedBattle`,
    `src/game-mode.ts#GameMode.isWaveTrainer`,
    `src/game-mode.ts#GameMode.isBoss`,
    `src/field/arena.ts#Arena.getTimeOfDay`,
    `src/field/arena.ts#Arena.updatePoolsForTimeOfDay`,
    `src/field/trainer.ts#Trainer.constructor`,
    `src/field/trainer.ts#Trainer.genPartyMember`,
    `src/field/trainer.ts#Trainer.getPartyLevels`,
    `src/battle.ts#Battle.constructor`,
    `src/battle.ts#Battle.getLevelForWave`,
    `src/phases/encounter-phase.ts#EncounterPhase.start`,
    `src/phases/encounter-phase.ts#EncounterPhase.isEncounterShinyLocked`,
    `${P}#Pokemon.constructor`,
    `${P}#EnemyPokemon.constructor`,
    `src/utils/common.ts#shiftCharCodes`,
    `src/utils/common.ts#randSeedInt`,
  ],

  /**
   * §12. Reward luck and the classic final boss, plus what the run calendar's
   * answers mean for the party. The schedule and the heal themselves are
   * `03-calendar.js`'s and the party's luck value is `08-party.js`'s; what is left
   * here is re-implemented: the HUD quotes the luck upgrade odds and the Eternamax
   * checklist without calling anything.
   */
  "49-ahead.js": [
    `src/game-mode.ts#GameMode.isFixedBattle`,
    `src/game-mode.ts#GameMode.getFixedBattle`,
    `src/modifier/modifier-type.ts#getNewModifierTypeOption`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.getRerollCost`,
    `src/modifier/modifier-type.ts#getPlayerModifierTypeOptions`,
    `${SCENE}#BattleScene.initFinalBossPhaseTwo`,
    `${SCENE}#BattleScene.generateEnemyModifiers`,
    `${P}#Pokemon.hasPassive`,
    `${P}#EnemyPokemon.generateAndPopulateMoveset`,
    `${P}#EnemyPokemon.getMinimumSegmentIndex`,
    `src/data/moves/pokemon-move.ts#PokemonMove.getMovePp`,
    `src/phases/damage-anim-phase.ts#DamageAnimPhase.end`,
    // §16: `doubleOdds`, the share of double battles ahead a TM is judged by — the abilities that shorten the odds,
    // and the evil-team grunt's unseeded 1/3 (which waves those are is `03-calendar.js`'s).
    `src/utils/common.ts#randInt`,
    `${SCENE}#BattleScene.checkIsDouble`,
    `${SCENE}#BattleScene.getDoubleBattleChance`,
    `${SCENE}#BattleScene.generateNewBattleTrainer`,
    `src/game-mode.ts#GameMode.isWaveFinal`,
    `src/game-mode.ts#GameMode.isEndlessBoss`,
    `src/modifier/modifier.ts#DoubleBattleChanceBoosterModifier.apply`,
    `src/modifier/modifier.ts#DoubleBattleChanceBoosterModifier.match`,
    `src/battle.ts#getRandomTrainerFunc`,
    `src/modifier/modifier.ts#LapsingPersistentModifier.lapse`,
    `src/phases/battle-end-phase.ts#BattleEndPhase.start`,
    `src/data/abilities/ab-attrs.ts#DoubleBattleChanceAbAttr.apply`,
  ],

  /**
   * §17. The team audit. It calls only `getLearnableLevelMoves` (the relearn
   * list a Memory Mushroom indexes, read as `[level, MoveId]`) and scores with
   * the learn card; the rest is re-implemented: status type immunities, which
   * priority an ability grants an attack, raw Speed for turn order, and the
   * EXP split behind "at the level cap" and "EXP. All feeds the bench".
   */
  "50-audit.js": [
    `${P}#Pokemon.getLearnableLevelMoves`,
    `src/modifier/modifier-type.ts#RememberMoveModifierType.constructor`,
    `src/modifier/modifier.ts#RememberMoveModifier.apply`,
    `${P}#Pokemon.canSetStatus`,
    `${M}#Move.getPriority`,
    `src/data/abilities/ab-attrs.ts#ChangeMovePriorityAbAttr.apply`,
    `src/utils/speed-order.ts#sortInSpeedOrder`,
    `${SCENE}#BattleScene.applyPartyExp`,
    `${SCENE}#BattleScene.getMaxExpLevel`,
  ],

  /**
   * The fusion advisor (§24): the Splicer's select filter and party screen, pick order (first = base), and what a
   * fusion is — averaged base stats, the stat formula, the second type rule, the other half's ability (and the
   * abilities that don't work fused) — all re-implemented from species data.
   */
  "49-fusion.js": [
    `src/modifier/modifier-type.ts#FusePokemonModifierType.constructor`,
    `src/modifier/modifier.ts#FusePokemonModifier.apply`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.openFusionMenu`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.show`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.getFilterResult`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.processActionButtonForOptions`,
    `src/data/challenge.ts#HardcoreChallenge.applyPokemonFusion`,
    `${P}#PlayerPokemon.fuse`,
    `${P}#Pokemon.calculateBaseStats`,
    `${P}#Pokemon.calculateStats`,
    `${P}#Pokemon.getBaseTypes`,
    `${P}#Pokemon.getAbility`,
    `${P}#Pokemon.canApplyAbility`,
    `src/data/pokemon-species.ts#PokemonSpeciesForm.getAbility`,
    `src/modifier/init-modifier-pools.ts#initGreatModifierPool`,
    `src/modifier/init-modifier-pools.ts#initMasterModifierPool`,
  ],

  /**
   * §15. The rewards card judges held items, mints, vitamins, EXP items, candy
   * and evolution items by the member they would go to. It calls only select
   * filters and `getMaxExpLevel`; what an item does is re-implemented from its
   * modifier (per-stack effects, stack limits), who benefits from the game's
   * own pool weights (status orbs, Mystical Rock), and the level-cap rules from
   * the EXP split — a member at the cap gets nothing and a Rare Candy ignores
   * it, `getWaveForDifficulty` included — a Daily run's cap sits far above its
   * wave number. Three enums come through as bare numbers: the Nature grid a
   * mint is read with, the Stat a vitamin names, and the BerryType. The
   * species-booster and Leek species ids are the generators' tables.
   */
  "51-items.js": [
    // Eviolite and the evolution items ask whether the holder still has a stage to go.
    `src/data/pokemon-species.ts#PokemonSpecies.getEvolutionLevels`,
    `src/modifier/modifier-type.ts#PokemonHeldItemModifierType.constructor`,
    `src/modifier/modifier-type.ts#PokemonNatureChangeModifierType.constructor`,
    `src/modifier/modifier-type.ts#EvolutionItemModifierType.constructor`,
    `src/modifier/modifier-type.ts#SpeciesStatBoosterModifierTypeGenerator.constructor`,
    `src/modifier/init-modifier-pools.ts#initUltraModifierPool`,
    `src/modifier/modifier.ts#TurnHealModifier.apply`,
    `src/modifier/modifier.ts#HitHealModifier.apply`,
    `src/modifier/modifier.ts#SurviveDamageModifier.apply`,
    `src/modifier/modifier.ts#CritBoosterModifier.apply`,
    `src/modifier/modifier.ts#FieldEffectModifier.apply`,
    `src/modifier/modifier.ts#ContactHeldItemTransferChanceModifier.getTransferredItemCount`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.applyOnTargetEffects`,
    `src/modifier/modifier.ts#PokemonMoveAccuracyBoosterModifier.apply`,
    `src/modifier/modifier.ts#BypassSpeedChanceModifier.apply`,
    `src/modifier/modifier.ts#FlinchChanceModifier.apply`,
    `src/modifier/modifier.ts#PokemonInstantReviveModifier.apply`,
    `src/modifier/modifier.ts#EvolutionStatBoosterModifier.apply`,
    `src/modifier/modifier.ts#PokemonMultiHitModifier.applyDamageModifier`,
    `src/modifier/modifier.ts#PokemonNatureWeightModifier.apply`,
    `src/modifier/modifier.ts#BaseStatModifier.getMaxHeldItemCount`,
    `src/modifier/modifier.ts#BerryModifier.getMaxHeldItemCount`,
    `src/modifier/modifier.ts#ExpShareModifier.apply`,
    `src/modifier/modifier.ts#PokemonLevelIncrementModifier.apply`,
    `${SCENE}#BattleScene.getMaxExpLevel`,
    `src/game-mode.ts#GameMode.getWaveForDifficulty`,
    `${SCENE}#BattleScene.applyPartyExp`,
    `${P}#PlayerPokemon.addExp`,
    `src/enums/nature.ts#Nature`,
    `src/enums/stat.ts#Stat`,
    `src/enums/berry-type.ts#BerryType`,
  ],

  /**
   * §19. The reroll preview calls the reward roll's two module functions from the
   * live stream position and replays what a reroll's `SelectModifierPhase` does
   * with them: the reroll count it passes, the tiers it carries (used only under
   * the lock), the settings it drops, the count and the cost. A changed draw
   * order inside the roll is the game's own and needs nothing here; a changed
   * phase flow — a reroll that keeps custom settings, re-seeds, or regenerates
   * with another count — makes every preview quietly wrong.
   */
  "50-reroll.js": [
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.constructor`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.start`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.rerollModifiers`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.toggleRerollLock`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.getModifierCount`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.getRerollCost`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.getModifierTypeOptions`,
    `src/modifier/modifier-type.ts#regenerateModifierPoolThresholds`,
    `src/modifier/modifier-type.ts#getPlayerModifierTypeOptions`,
    `src/ui/handlers/modifier-select-ui-handler.ts#ModifierSelectUiHandler.show`,
  ],

  /**
   * The Mystery Encounter journal records the option the player picked by
   * reading the game's own record of it rather than watching the input: the
   * phase pushes a `SeenEncounterData` as the encounter opens and writes the
   * chosen index into that same record on select, and only for the encounter's
   * own option list. Everything else the journal reads is a property or one of
   * the two party accessors, which have no body worth watching.
   */
  "55-journal.js": [
    `src/phases/mystery-encounter-phases.ts#MysteryEncounterPhase.start`,
    `src/phases/mystery-encounter-phases.ts#MysteryEncounterPhase.handleOptionSelect`,
    `src/data/mystery-encounters/mystery-encounter-save-data.ts#SeenEncounterData.constructor`,
  ],

  /**
   * §16. Who a TM can be taught to: the select filter (called), the pool drawn
   * from the whole party's compatible TMs, the party screen's TM
   * mode (a fainted member is offered TEACH) and Hardcore's exception, which
   * gives a fainted member only Release. The challenge id comes through as a
   * bare number.
   */
  "52-shop.js": [
    // Whether a challenge is on at all: `isHardcore` re-implements this test, value and all.
    `src/game-mode.ts#GameMode.hasChallenge`,
    `src/modifier/modifier-type.ts#TmModifierType.constructor`,
    `src/modifier/modifier-type.ts#TmModifierTypeGenerator.constructor`,
    `${P}#PlayerPokemon.isTmCompatible`,
    `${P}#PlayerPokemon.getCompatibleTms`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.updateOptions`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.updateOptionsHardcore`,
    `src/enums/challenges.ts#Challenges`,
  ],

  /**
   * §23. The starter card: the grid's handler (which starters are valid, the
   * point budget, the challenge-adjusted account data, the strict check a team
   * needs one member to pass), what a starter costs and the luck it brings,
   * the species' own evolution and passive reads, what the run starts with,
   * and the challenges that change the grid (Fresh Start strips unlocks,
   * single type and generation narrow it, the two starter-point rules).
   */
  "51-starters.js": [
    `src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.show`,
    `src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.getValueLimit`,
    `src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.getSpeciesData`,
    `src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.getCurrentDexProps`,
    `src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.isPartyValid`,
    `src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.addToParty`,
    `src/utils/challenge-utils.ts#checkStarterValidForChallenge`,
    `src/system/game-data.ts#GameData.getSpeciesStarterValue`,
    `src/system/game-data.ts#GameData.getSpeciesDexAttrProps`,
    `src/system/game-data.ts#GameData.getDexAttrLuck`,
    `src/data/pokemon-species.ts#PokemonSpecies.getEvolutionLevels`,
    `src/data/pokemon-species.ts#PokemonSpeciesForm.getPassiveAbility`,
    `src/data/species-data-registry.ts#SpeciesDataRegistry.getEvolutions`,
    `src/phases/select-starter-phase.ts#SelectStarterPhase.start`,
    `src/game-mode.ts#GameMode.getStartingLevel`,
    `src/data/challenge.ts#SingleGenerationChallenge.applyStarterChoice`,
    `src/data/challenge.ts#SingleTypeChallenge.applyStarterChoice`,
    `src/data/challenge.ts#FreshStartChallenge.applyStarterChoice`,
    `src/data/challenge.ts#FreshStartChallenge.applyStarterCost`,
    `src/data/challenge.ts#FreshStartChallenge.applyStarterSelectModify`,
    `src/data/challenge.ts#LowerStarterMaxCostChallenge.applyStarterChoice`,
    `src/data/challenge.ts#LowerStarterPointsChallenge.applyStarterPoints`,
    `src/data/challenge.ts#InverseBattleChallenge.applyTypeEffectiveness`,
    `src/data/type.ts#getTypeDamageMultiplier`,
  ],
} satisfies Record<string, readonly SourceRef[]>;
