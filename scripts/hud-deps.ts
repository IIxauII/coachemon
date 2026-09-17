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
 * `skills/coach-pokerogue/references/game-code.md` is the reading these rest on,
 * read from the pinned tag; what is true only of the live minified bundle sits
 * apart in its §22. Its line citations go stale at a pin bump; these hashes name
 * which of its readings to redo.
 *
 * Keys are HUD modules under `skills/coach-pokerogue/scripts/hud/`; a moved hash
 * names the modules to re-read. `50-shop.js` owns only its TM claims (§16):
 * its spending rules rest on `49-ahead.js`'s calendar and its item judgements
 * on `50-items.js`, which are listed under those modules.
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
   * §1–§5, §8, §18 drain, §21 end of turn. `getAttackDamage` is called (simulated,
   * sandboxed); everything the simulated call leaves out is re-implemented: the
   * damage roll, crits, accuracy, multi-hit counts, boss segments, Sturdy / Focus
   * Band / endure, and turn-end HP — the phases that run after the moves: weather,
   * berries, status chip and the turn-end heals.
   */
  "10-damage.js": [
    `${P}#Pokemon.getAttackDamage`,
    `${P}#Pokemon.getCriticalHitResult`,
    `${P}#Pokemon.getAccuracyMultiplier`,
    `${P}#Pokemon.getEffectiveStat`,
    `${P}#Pokemon.getMoveEffectiveness`,
    `${P}#Pokemon.damage`,
    `${P}#EnemyPokemon.damage`,
    `${P}#EnemyPokemon.handleBossSegmentCleared`,
    `src/utils/damage.ts#calculateBossSegmentDamage`,
    `src/utils/common.ts#toDmgValue`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.hitCheck`,
    `src/phases/move-effect-phase.ts#MoveEffectPhase.checkBypassAccAndInvuln`,
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
    // status orbs, Leftovers, Shell Bell, the enemy's per-turn heal, and the weather and status abilities.
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
  ],

  /**
   * §6, §7. `getNextMove` / `getNextTargets` are not called: the whole choice is
   * re-implemented to get every outcome with its chance, which doubles and later
   * turns need. In singles at the command prompt a sandboxed `getNextMove` returns
   * the move the enemy will use, not a sample (§6, #158) — verified from source,
   * not on a live tab. `predictSwitches` calls the trainer's matchup scoring, also
   * listed under `35-team-plan.js`.
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
    `${M}#ProtectAttr.getCondition`,
    `src/enums/move-use-mode.ts#isVirtual`,
    `src/enums/move-use-mode.ts#isIgnorePP`,
    `${P}#Pokemon.getMoveType`,
    // The prediction is cached per turn key: the enemy decides after our command.
    `src/phases/turn-init-phase.ts#TurnInitPhase.start`,
    // Tera: `shouldTera` is called, `teraOn` replays TeraPhase's writes.
    `src/field/trainer.ts#Trainer.shouldTera`,
    `src/phases/tera-phase.ts#TeraPhase.end`,
    // `predictSwitches`.
    `${P}#Pokemon.getMatchupScore`,
    `${P}#Pokemon.isTrapped`,
    `src/field/trainer.ts#Trainer.getPartyMemberMatchupScores`,
    `src/field/trainer.ts#Trainer.getSortedPartyMemberMatchupScores`,
    `src/field/trainer.ts#Trainer.getNextSummonIndex`,
  ],

  /** §5 turn order and §9 free switches: no safe call returns either, so both are re-derived. */
  "30-planner.js": [
    `${M}#Move.getPriority`,
    `${M}#Move.getPriorityModifier`,
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
    `${P}#Pokemon.getStatStage`,
    `src/phases/move-phase.ts#MovePhase.checkPara`,
    `src/data/status-effect.ts#Status.incrementTurn`,
    `${M}#ProtectAttr.getCondition`,
    `${M}#StatStageChangeAttr.apply`,
    `${M}#CutHpStatStageBoostAttr.apply`,
    `${M}#StatusEffectAttr.apply`,
    `${M}#HealAttr.apply`,
    `${M}#PlantHealAttr.getWeatherHealRatio`,
    `${M}#SandHealAttr.getWeatherHealRatio`,
    `src/data/abilities/ab-attrs.ts#StatStageChangeMultiplierAbAttr.apply`,
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
    // Sleep: the 2-or-3 turn roll, the countdown `actChance` / `actDelay` / `STATUS_SKIP` restate, Early Bird.
    `${P}#Pokemon.doSetStatus`,
    `src/phases/move-phase.ts#MovePhase.checkSleep`,
    `src/data/abilities/ab-attrs.ts#ReduceStatusEffectDurationAbAttr.apply`,
    // `statusPlay` reads a weather-boosted heal's fields by name.
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
   * §20. Catch odds and whether a ball is allowed at all, both re-implemented; a fusion's
   * averaged base stats, the fusion-aware shiny check and its candy, the event's shiny
   * multiplier, and the move that leaves a foe at 1 HP. What a catch does (Limited
   * Catch, a full party, the dex bits and candy) is re-implemented too; the game-mode
   * checks are called, with fallbacks.
   */
  "45-catch.js": [
    `src/phases/attempt-capture-phase.ts#AttemptCapturePhase.start`,
    `src/data/pokeball.ts#getCriticalCaptureChance`,
    `src/phases/command-phase.ts#CommandPhase.checkCanUseBall`,
    `${P}#Pokemon.calculateBaseStats`,
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
    `src/data/daily-seed/daily-run.ts#getDailyEventSeedBoss`,
    `src/system/game-data.ts#GameData.getStarterCount`,
    // What a catch does.
    `src/phases/attempt-capture-phase.ts#AttemptCapturePhase.catch`,
    `src/data/challenge.ts#LimitedCatchChallenge.applyPokemonAddToParty`,
    `${P}#Pokemon.getDexAttr`,
  ],

  /**
   * The learn card calls nothing, but it reads a move apart by the *shape* of its
   * attributes: which field holds the heal ratio, the inflicted status, the battler
   * tag, the stat change and whether it is self-targeted (#70). Three enums come
   * through as bare values — `MoveTarget` and `StatusEffect` as numbers the card
   * indexes tables with, `BattlerTagType` as the strings it keys `TAG_VALUE` by —
   * so a reordered member silently mis-scores every move that carries it. Fixed
   * damage is priced back into power through the base damage formula, and Present
   * at its expected power. With a roster (#122) it re-implements who a status move
   * can land on and what a disrupting tag takes away: the status and tag immunities
   * of the abilities (read off `initAbilities` by name), the type checks, powder and
   * Thunder Wave's type immunity, and the moves Taunt, Heal Block and Encore act on.
   */
  "40-learn.js": [
    `${P}#Pokemon.getBaseDamage`,
    `${M}#PresentPowerAttr.apply`,
    `${M}#MoveAttr.constructor`,
    `${M}#HealAttr.constructor`,
    `${M}#StatusEffectAttr.constructor`,
    `${M}#AddBattlerTagAttr.constructor`,
    `${M}#StatStageChangeAttr.constructor`,
    `${M}#MultiHitAttr.constructor`,
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
   * twelve common encounters does from its source file — so every encounter
   * const, the helpers and tuning constants its outcome is spelled from, and the
   * phases that fork the RNG are the dependency. A moved fork offset
   * (`handleOptionSelect` ×1, `MysteryEncounterOptionSelectedPhase` ×500,
   * `PostMysteryEncounterPhase` ×2000) or a reordered draw inside an option makes
   * every 🔮 outcome confidently wrong. Two enums come through as bare numbers:
   * the encounter type the rules are keyed by and the Nature the dealer rolls.
   * Every fork is run through `executeWithSeedOffset`; `randSeedInt` is restated.
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
  ],

  /**
   * §10: the biome choice the phase offers, and what each of the ten waves it
   * covers holds: the spawn and trainer rules behind the pools it scans, the
   * trainer odds, the gym leader on the gym wave, wild evolutions by level, and
   * who comes back from fainting at the X1 heal. All re-implemented as odds.
   */
  "47-biome.js": [
    `src/phases/select-biome-phase.ts#SelectBiomePhase.start`,
    `src/phases/select-biome-phase.ts#SelectBiomePhase.setNextBiomeAndEnd`,
    `src/phases/party-heal-phase.ts#PartyHealPhase.start`,
    `src/data/challenge.ts#HardcoreChallenge.applyPreventRevive`,
    `src/data/challenge.ts#LimitedSupportChallenge.applyPartyHeal`,
    `src/field/arena.ts#Arena.randomSpecies`,
    `src/field/arena.ts#Arena.randomTrainerType`,
    `src/field/arena.ts#Arena.generateNonBossBiomeTier`,
    `src/field/arena.ts#Arena.generateBossBiomeTier`,
    `src/field/arena.ts#Arena.checkLegendBST`,
    `src/field/arena.ts#Arena.getTimeOfDay`,
    `src/game-mode.ts#GameMode.isWaveTrainer`,
    `src/game-mode.ts#GameMode.isTrainerBoss`,
    `src/game-mode.ts#GameMode.getWaveForDifficulty`,
    `src/data/daily-seed/daily-run.ts#getDailyForcedWaveBiomePoolTier`,
    `src/field/trainer.ts#Trainer.genNewPartyMemberSpecies`,
    `${SCENE}#BattleScene.randomSpecies`,
    `src/data/trainers/trainer-config.ts#TrainerConfig.initForGymLeader`,
    `src/ai/ai-species-gen.ts#determineEnemySpecies`,
    `src/ai/ai-species-gen.ts#calcEvoChance`,
    `src/ai/ai-species-gen.ts#getRequiredPrevo`,
    // `wavesIn`: the pools refreshed for the time of day, fixed, final and boss waves, and the boss-spawn rule.
    `src/field/arena.ts#Arena.updatePoolsForTimeOfDay`,
    `src/game-mode.ts#GameMode.isFixedBattle`,
    `src/game-mode.ts#GameMode.isWaveFinal`,
    `src/game-mode.ts#GameMode.isBoss`,
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
    `src/game-mode.ts#GameMode.isWaveFinal`,
    `src/field/arena.ts#Arena.getTimeOfDay`,
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
   * §12. The big-fight calendar, the full-heal schedule, reward luck and the
   * classic final boss. The four calendar rules and the heal condition are
   * *read* — pure arithmetic on the wave index — but a changed rule silently
   * moves every "next big fight" the card names. The reward and final-boss refs
   * are re-implemented: the HUD quotes the luck upgrade odds and the Eternamax
   * checklist without calling anything.
   */
  "49-ahead.js": [
    `src/game-mode.ts#GameMode.isWaveFinal`,
    `src/game-mode.ts#GameMode.isFixedBattle`,
    `src/game-mode.ts#GameMode.getFixedBattle`,
    `src/game-mode.ts#GameMode.isBoss`,
    `src/game-mode.ts#GameMode.isWaveTrainer`,
    `src/data/trainers/fixed-battle-configs.ts#classicFixedBattles`,
    `src/phases/victory-phase.ts#VictoryPhase.start`,
    `src/phases/select-biome-phase.ts#SelectBiomePhase.setNextBiomeAndEnd`,
    `src/phases/party-heal-phase.ts#PartyHealPhase.start`,
    `${SCENE}#BattleScene.isNewBiome`,
    `src/modifier/modifier-type.ts#getNewModifierTypeOption`,
    `src/modifier/modifier-type.ts#getPartyLuckValue`,
    `src/phases/select-modifier-phase.ts#SelectModifierPhase.getRerollCost`,
    `src/modifier/modifier-type.ts#getPlayerModifierTypeOptions`,
    `${P}#Pokemon.getLuck`,
    `${P}#Pokemon.isAllowedInBattle`,
    `${SCENE}#BattleScene.initFinalBossPhaseTwo`,
    `${SCENE}#BattleScene.generateEnemyModifiers`,
    `${P}#Pokemon.hasPassive`,
    `${P}#EnemyPokemon.generateAndPopulateMoveset`,
    `${P}#EnemyPokemon.getMinimumSegmentIndex`,
    `src/data/moves/pokemon-move.ts#PokemonMove.getMovePp`,
    `src/phases/damage-anim-phase.ts#DamageAnimPhase.end`,
    // §16: `doubleOdds`, the share of double battles ahead a TM is judged by.
    `${SCENE}#BattleScene.checkIsDouble`,
    `${SCENE}#BattleScene.getDoubleBattleChance`,
    `${SCENE}#BattleScene.generateNewBattleTrainer`,
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
  "49-audit.js": [
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
   * §15. The rewards card judges held items, mints, vitamins, EXP items, candy
   * and evolution items by the member they would go to. It calls only select
   * filters and `getMaxExpLevel`; what an item does is re-implemented from its
   * modifier (per-stack effects, stack limits), who benefits from the game's
   * own pool weights (status orbs, Mystical Rock), and the level-cap rules from
   * the EXP split — a member at the cap gets nothing and a Rare Candy ignores
   * it. Four enums come through as bare numbers: the Nature grid a mint is
   * read with, the Stat a vitamin names, the BerryType and MoveFlags' contact
   * bit. The species-booster and Leek species ids are the generators' tables.
   */
  "50-items.js": [
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
    `${SCENE}#BattleScene.applyPartyExp`,
    `${P}#PlayerPokemon.addExp`,
    `src/enums/nature.ts#Nature`,
    `src/enums/stat.ts#Stat`,
    `src/enums/berry-type.ts#BerryType`,
    `src/enums/move-flags.ts#MoveFlags`,
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
   * §16. Who a TM can be taught to: the select filter (called), the pool drawn
   * from the whole party's compatible TMs, the party screen's TM
   * mode (a fainted member is offered TEACH) and Hardcore's exception, which
   * gives a fainted member only Release. The challenge id comes through as a
   * bare number.
   */
  "50-shop.js": [
    `src/modifier/modifier-type.ts#TmModifierType.constructor`,
    `src/modifier/modifier-type.ts#TmModifierTypeGenerator.constructor`,
    `${P}#PlayerPokemon.isTmCompatible`,
    `${P}#PlayerPokemon.getCompatibleTms`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.updateOptions`,
    `src/ui/handlers/party-ui-handler.ts#PartyUiHandler.updateOptionsHardcore`,
    `src/enums/challenges.ts#Challenges`,
  ],
} satisfies Record<string, readonly SourceRef[]>;
