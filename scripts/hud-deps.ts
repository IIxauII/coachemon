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
 *    own copy would draw from the battle RNG, rewrite the move queue, or return
 *    one sample where the HUD wants every branch with its chance. A changed body
 *    makes the HUD quietly wrong.
 *  - **Called, or replayed in order.** The HUD calls it inside `sandbox`, or
 *    replays the sequence it sits in. A changed signature, return shape or draw
 *    order breaks the HUD just as silently — `48-preview.js` replays
 *    `newBattle`'s draws, so a reordered call there desynchronises every field
 *    after it.
 *
 * `skills/coach-pokerogue/references/game-code.md` is the reading these rest on.
 * It was read off a live minified bundle rather than the pinned tag, so until a
 * pin bump re-reads them these hashes are the doc's only tie to a fixed ref.
 *
 * Keys are HUD modules under `skills/coach-pokerogue/scripts/hud/`; a moved hash
 * names the modules to re-read. Modules absent from this map (`50-shop.js`)
 * build on the ones here and read live state directly; they own no game-code
 * claim of their own — its spending rules rest on
 * `49-ahead.js`'s calendar, which does.
 */
import type { SourceRef } from "../src/escape-ladder/types.ts";

const P = "src/field/pokemon.ts";
const M = "src/data/moves/move.ts";
const SCENE = "src/battle-scene.ts";

export const HUD_DEPS = {
  /** §0: why every HUD call runs inside `sandbox` — the bookkeeping `simulated` does not suppress. */
  "01-core.js": [`src/data/abilities/apply-ab-attrs.ts#applySingleAbAttrs`],

  /**
   * §1–§5, §8. `getAttackDamage` is called (simulated, sandboxed); everything the
   * simulated call leaves out is re-implemented: the damage roll, crits, accuracy,
   * multi-hit counts, boss segments, Sturdy / Focus Band / endure, turn-end HP.
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
  ],

  /**
   * §6, §7. `getNextMove` / `getNextTargets` are never called — they draw from the
   * battle RNG and rewrite the move queue — so the whole choice is re-implemented
   * to get every outcome with its chance instead of one draw.
   */
  "20-enemy-ai.js": [
    `${P}#EnemyPokemon.getNextMove`,
    `${P}#EnemyPokemon.getNextTargets`,
    `src/phases/enemy-command-phase.ts#EnemyCommandPhase.start`,
    `${M}#Move.getTargetBenefitScore`,
    `${M}#Move.getUserBenefitScore`,
    `${M}#AttackMove.getTargetBenefitScore`,
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
   * Catch odds and whether a ball is allowed at all, both re-implemented; a fusion's
   * averaged base stats, the fusion-aware shiny check and its candy, the event's shiny
   * multiplier, and the move that leaves a foe at 1 HP.
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
  ],

  /**
   * The learn card calls nothing, but it reads a move apart by the *shape* of its
   * attributes: which field holds the heal ratio, the inflicted status, the battler
   * tag, the stat change and whether it is self-targeted (#70). Three enums come
   * through as bare values — `MoveTarget` and `StatusEffect` as numbers the card
   * indexes tables with, `BattlerTagType` as the strings it keys `TAG_VALUE` by —
   * so a reordered member silently mis-scores every move that carries it.
   */
  "40-learn.js": [
    `${M}#MoveAttr.constructor`,
    `${M}#HealAttr.constructor`,
    `${M}#StatusEffectAttr.constructor`,
    `${M}#AddBattlerTagAttr.constructor`,
    `${M}#StatStageChangeAttr.constructor`,
    `${M}#MultiHitAttr.constructor`,
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

  /** §10: the biome choice the phase offers, and the spawn rules behind the pools it scans. */
  "47-biome.js": [`src/phases/select-biome-phase.ts#SelectBiomePhase.start`, `src/field/arena.ts#Arena.randomSpecies`],

  /**
   * §11. The preview replays `newBattle`'s own draws in the game's own order inside
   * `executeWithSeedOffset`, so every method it calls *and their order* are the
   * dependency: a reordered draw desynchronises every field after it, and the
   * arrival tally would only notice after the fact. `shiftCharCodes` and
   * `randSeedInt` are re-implemented in `48-preview.js` (minification drops their
   * names); if either changes, the wave seed or every draw position is wrong.
   */
  "48-preview.js": [
    `${SCENE}#BattleScene.newBattle`,
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
    `src/field/trainer.ts#Trainer.constructor`,
    `src/field/trainer.ts#Trainer.genPartyMember`,
    `src/field/trainer.ts#Trainer.getPartyLevels`,
    `src/battle.ts#Battle.constructor`,
    `src/battle.ts#Battle.getLevelForWave`,
    `src/phases/encounter-phase.ts#EncounterPhase.start`,
    `src/phases/encounter-phase.ts#EncounterPhase.isEncounterShinyLocked`,
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
    `${P}#Pokemon.getLuck`,
    `${P}#Pokemon.isAllowedInBattle`,
    `${SCENE}#BattleScene.initFinalBossPhaseTwo`,
    `${SCENE}#BattleScene.generateEnemyModifiers`,
    `${P}#Pokemon.hasPassive`,
    `${P}#EnemyPokemon.generateAndPopulateMoveset`,
    `${P}#EnemyPokemon.getMinimumSegmentIndex`,
    `src/phases/damage-anim-phase.ts#DamageAnimPhase.end`,
  ],
} satisfies Record<string, readonly SourceRef[]>;
