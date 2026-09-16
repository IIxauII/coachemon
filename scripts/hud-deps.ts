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
 * names the modules to re-read. Modules absent from this map (`35-team-plan.js`,
 * `50-shop.js`) build on the ones here and read live state directly; they own no
 * game-code claim of their own — `50-shop.js`'s spending rules rest on
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
  ],

  /** Catch odds and whether a ball is allowed at all, both re-implemented. */
  "45-catch.js": [
    `src/phases/attempt-capture-phase.ts#AttemptCapturePhase.start`,
    `src/data/pokeball.ts#getCriticalCaptureChance`,
    `src/phases/command-phase.ts#CommandPhase.checkCanUseBall`,
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
