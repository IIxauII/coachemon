import type { Area } from "../types.ts";

export const HUD: Area = {
  reads: [
    { name: "a", kind: "field", at: ["src/utils/color-utils.ts#Rgba.a"] },
    {
      name: "ability",
      kind: "field",
      at: [],
      from: "ours",
      note: "our defender/combatant spec and roster rows (ability names)",
    },
    { name: "ability1", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.ability1"] },
    { name: "ability2", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.ability2"] },
    { name: "abilityHidden", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.abilityHidden"] },
    { name: "abilityIndex", kind: "field", at: ["src/field/pokemon.ts#Pokemon.abilityIndex"] },
    { name: "acc", kind: "field", at: ["src/ui/containers/move-info-overlay.ts#MoveInfoOverlay.acc"] },
    { name: "actualFps", kind: "field", at: [], from: "phaser", note: "Phaser.Core.TimeStep (game.loop)" },
    {
      name: "addedType",
      kind: "field",
      at: [
        "src/data/pokemon-data.ts#SerializedPokemonSummonData.addedType",
        "src/data/pokemon-data.ts#PokemonSummonData.addedType",
      ],
    },
    { name: "addEnemyPokemon", kind: "method", at: ["src/battle-scene.ts#BattleScene.addEnemyPokemon"] },
    {
      name: "aiType",
      kind: "field",
      at: [
        "src/data/mystery-encounters/utils/encounter-phase-utils.ts#EnemyPokemonConfig.aiType",
        "src/field/pokemon.ts#EnemyPokemon.aiType",
      ],
    },
    { name: "aiView", kind: "field", at: [], from: "ours", note: "our outcome() options flag" },
    {
      name: "allMapOptions",
      kind: "field",
      at: ["src/@types/daily-run.ts#DailyForcedBiome"],
      note: "dailyConfig.forcedBiomes entry (union type alias, not in candidates)",
    },
    {
      name: "allowLuckUpgrades",
      kind: "field",
      at: ["src/modifier/modifier-type.ts#CustomModifierSettings.allowLuckUpgrades"],
    },
    { name: "ally", kind: "field", at: ["src/data/abilities/ab-attrs.ts#PostSummonCopyAllyStatsAbAttr.ally"] },
    {
      name: "amount",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#PokemonMoveAccuracyBoosterModifierType.amount",
        "src/phases/damage-anim-phase.ts#DamageAnimPhase.amount",
      ],
    },
    { name: "applyConditions", kind: "method", at: ["src/data/moves/move.ts#Move.applyConditions"] },
    { name: "applyStarterChoice", kind: "method", at: ["src/data/challenge.ts#Challenge.applyStarterChoice"] },
    {
      name: "applyStarterSelectModify",
      kind: "method",
      at: ["src/data/challenge.ts#Challenge.applyStarterSelectModify"],
    },
    {
      name: "arenaTags",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#PostSummonRemoveArenaTagAbAttr.arenaTags",
        "src/ui/containers/arena-flyout.ts#ArenaFlyout.arenaTags",
      ],
    },
    { name: "b", kind: "field", at: ["src/utils/color-utils.ts#Rgba.b"] },
    { name: "balls", kind: "field", at: ["src/ui/containers/pokeball-tray.ts#PokeballTray.balls"] },
    {
      name: "base",
      kind: "field",
      at: [
        "src/api/api-base.ts#ApiBase.base",
        "src/field/arena-base.ts#ArenaBase.base",
        "test/utils/string-utils.ts#GetEnumStrValueOptions.base",
      ],
    },
    {
      name: "baseStats",
      kind: "field",
      at: [
        "src/battle-scene.ts#PartyInfo.baseStats",
        "src/data/pokemon-species.ts#PokemonSpeciesForm.baseStats",
        "src/ui/handlers/pokedex-page-ui-handler.ts#PokedexPageUiHandler.baseStats",
      ],
    },
    { name: "baseTotal", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.baseTotal"] },
    {
      name: "battleCount",
      kind: "field",
      at: [
        "src/@types/api.ts#TitleStatsResponse.battleCount",
        "src/modifier/modifier.ts#LapsingPersistentModifier.battleCount",
      ],
    },
    {
      name: "battlerIndex",
      kind: "field",
      at: [
        "src/@types/stat-change.ts#StatStageChangePhaseOptions.battlerIndex",
        "src/phases/pokemon-phase.ts#PokemonPhase.battlerIndex",
      ],
    },
    {
      name: "berryItemsMap",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/absolute-avarice-encounter.ts#AbsoluteAvariceEncounter"],
      note: "ME misc key set in onInit",
    },
    {
      name: "berryType",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#BerryModifierType.berryType",
        "src/modifier/modifier.ts#BerryModifier.berryType",
      ],
    },
    { name: "bi", kind: "field", at: [], from: "ours", note: "our replayAI() options (battler index)" },
    { name: "biome", kind: "field", at: [], from: "ours", note: "our card's biome section" },
    {
      name: "biomeLinks",
      kind: "table",
      at: [
        "src/@types/biomes.ts#Biome.biomeLinks",
        "src/data/balance/biomes/abyss.ts#biomeLinks",
        "src/data/balance/biomes/badlands.ts#biomeLinks",
        "src/data/balance/biomes/beach.ts#biomeLinks",
        "src/data/balance/biomes/cave.ts#biomeLinks",
        "src/data/balance/biomes/construction-site.ts#biomeLinks",
        "src/data/balance/biomes/desert.ts#biomeLinks",
        "src/data/balance/biomes/dojo.ts#biomeLinks",
        "src/data/balance/biomes/end.ts#biomeLinks",
        "src/data/balance/biomes/factory.ts#biomeLinks",
        "src/data/balance/biomes/fairy-cave.ts#biomeLinks",
        "src/data/balance/biomes/forest.ts#biomeLinks",
        "src/data/balance/biomes/grass.ts#biomeLinks",
        "src/data/balance/biomes/graveyard.ts#biomeLinks",
        "src/data/balance/biomes/ice-cave.ts#biomeLinks",
        "src/data/balance/biomes/island.ts#biomeLinks",
        "src/data/balance/biomes/jungle.ts#biomeLinks",
        "src/data/balance/biomes/laboratory.ts#biomeLinks",
        "src/data/balance/biomes/lake.ts#biomeLinks",
        "src/data/balance/biomes/meadow.ts#biomeLinks",
        "src/data/balance/biomes/metropolis.ts#biomeLinks",
        "src/data/balance/biomes/mountain.ts#biomeLinks",
        "src/data/balance/biomes/plains.ts#biomeLinks",
        "src/data/balance/biomes/power-plant.ts#biomeLinks",
        "src/data/balance/biomes/ruins.ts#biomeLinks",
        "src/data/balance/biomes/sea.ts#biomeLinks",
        "src/data/balance/biomes/seabed.ts#biomeLinks",
        "src/data/balance/biomes/slum.ts#biomeLinks",
        "src/data/balance/biomes/snowy-forest.ts#biomeLinks",
        "src/data/balance/biomes/space.ts#biomeLinks",
        "src/data/balance/biomes/swamp.ts#biomeLinks",
        "src/data/balance/biomes/tall-grass.ts#biomeLinks",
        "src/data/balance/biomes/temple.ts#biomeLinks",
        "src/data/balance/biomes/town.ts#biomeLinks",
        "src/data/balance/biomes/volcano.ts#biomeLinks",
        "src/data/balance/biomes/wasteland.ts#biomeLinks",
      ],
    },
    { name: "biomes", kind: "field", at: ["src/ui/handlers/pokedex-page-ui-handler.ts#PokedexPageUiHandler.biomes"] },
    { name: "blockEvolution", kind: "field", at: ["src/@types/game-events.ts#EventEncounter.blockEvolution"] },
    {
      name: "blockingDuration",
      kind: "field",
      at: [],
      from: "ours",
      note: "WEB API: Long Animation Frames (PerformanceLongAnimationFrameTiming)",
    },
    { name: "boost", kind: "field", at: ["src/modifier/modifier.ts#TempStatStageBoosterModifier.boost"] },
    {
      name: "boostPercent",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#AttackTypeBoosterModifierType.boostPercent",
        "src/modifier/modifier-type.ts#ExpBoosterModifierType.boostPercent",
        "src/modifier/modifier-type.ts#PokemonExpBoosterModifierType.boostPercent",
      ],
    },
    {
      name: "boss",
      kind: "field",
      at: ["src/@types/daily-run.ts#CustomDailyRunConfig.boss"],
      note: "gameMode.dailyConfig.boss; other sites read our facts/spec",
    },
    { name: "calculateBaseStats", kind: "method", at: ["src/field/pokemon.ts#Pokemon.calculateBaseStats"] },
    { name: "calculateBattleAccuracy", kind: "method", at: ["src/data/moves/move.ts#Move.calculateBattleAccuracy"] },
    { name: "calculateStabMultiplier", kind: "method", at: ["src/field/pokemon.ts#Pokemon.calculateStabMultiplier"] },
    { name: "calculateStats", kind: "method", at: ["src/field/pokemon.ts#Pokemon.calculateStats"] },
    { name: "canApplyAbility", kind: "method", at: ["src/field/pokemon.ts#Pokemon.canApplyAbility"] },
    { name: "canBeMultiStrikeEnhanced", kind: "method", at: ["src/data/moves/move.ts#Move.canBeMultiStrikeEnhanced"] },
    { name: "cancelled", kind: "field", at: ["src/@types/damage-result.ts#DamageCalculationResult.cancelled"] },
    { name: "canSetStatus", kind: "method", at: ["src/field/pokemon.ts#Pokemon.canSetStatus"] },
    { name: "cat", kind: "field", at: ["src/ui/containers/move-info-overlay.ts#MoveInfoOverlay.cat"] },
    { name: "catchable", kind: "field", at: ["src/@types/daily-run.ts#DailySeedBoss.catchable"] },
    {
      name: "catchAllowed",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#IMysteryEncounter.catchAllowed",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.catchAllowed",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounterBuilder.catchAllowed",
      ],
    },
    { name: "catchRate", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.catchRate"] },
    { name: "challenges", kind: "field", at: ["src/game-mode.ts#GameMode.challenges"] },
    { name: "changes", kind: "field", at: ["src/data/abilities/ab-attrs.ts#PostVictoryStatStageChangeAbAttr.changes"] },
    { name: "chargeAttrs", kind: "field", at: ["src/data/moves/move.ts#Charging.chargeAttrs"] },
    { name: "checkIsDouble", kind: "method", at: ["src/battle-scene.ts#BattleScene.checkIsDouble"] },
    {
      name: "color",
      kind: "field",
      at: ["src/data/battle-anims.ts#AnimFrame.color", "test/mocks/mocks-container/mock-text.ts#MockText.color"],
    },
    { name: "command", kind: "field", at: ["src/battle.ts#TurnCommand.command"] },
    { name: "common", kind: "field", at: ["test/@types/matcher-helpers.ts#MatchersBase.common"] },
    {
      name: "condition",
      kind: "field",
      at: [
        "src/data/moves/move.ts#InstantChargeAttr.condition",
        "src/data/balance/pokemon-evolutions.ts#SpeciesFormEvolution.condition",
      ],
    },
    { name: "conditions", kind: "field", at: ["src/data/moves/move.ts#Move.conditions"] },
    { name: "conditionsSeq2", kind: "field", at: ["src/data/moves/move.ts#Move.conditionsSeq2"] },
    { name: "conditionsSeq3", kind: "field", at: ["src/data/moves/move.ts#Move.conditionsSeq3"] },
    { name: "count", kind: "field", at: [], from: "ours", note: "our ball-chance rows" },
    {
      name: "customModifierRewardSettings",
      kind: "field",
      at: ["src/battle.ts#FixedBattleConfig.customModifierRewardSettings"],
    },
    {
      name: "customPokemonData",
      kind: "field",
      at: [
        "src/data/mystery-encounters/utils/encounter-phase-utils.ts#EnemyPokemonConfig.customPokemonData",
        "src/field/pokemon.ts#Pokemon.customPokemonData",
        "src/system/pokemon-data.ts#PokemonData.customPokemonData",
      ],
    },
    { name: "cutRatio", kind: "field", at: ["src/data/moves/move.ts#CutHpStatStageBoostAttr.cutRatio"] },
    { name: "daily", kind: "field", at: ["src/api/api.ts#PokerogueApi.daily"] },
    {
      name: "dailyConfig",
      kind: "field",
      at: ["src/@types/save-data.ts#SessionSaveData.dailyConfig", "src/game-mode.ts#GameMode.dailyConfig"],
    },
    {
      name: "damage",
      kind: "field",
      at: [
        "src/@types/damage-result.ts#DamageCalculationResult.damage",
        "src/data/moves/move.ts#FixedDamageAttr.damage",
      ],
    },
    {
      name: "damageFactor",
      kind: "field",
      at: ["src/data/abilities/ab-attrs.ts#PostWeatherLapseDamageAbAttr.damageFactor"],
    },
    {
      name: "damageRatio",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#PostDefendContactDamageAbAttr.damageRatio",
        "src/data/abilities/ab-attrs.ts#PostFaintContactDamageAbAttr.damageRatio",
        "src/data/moves/move.ts#RecoilAttr.damageRatio",
      ],
    },
    {
      name: "data",
      kind: "field",
      at: [
        "src/data/balance/pokemon-evolutions.ts#SpeciesEvolutionCondition.data",
        "src/data/species-data-registry.ts#SpeciesDataRegistry.data",
      ],
    },
    {
      name: "destroy",
      kind: "method",
      at: ["src/field/pokemon.ts#Pokemon.destroy"],
      note: "a built Trainer's destroy is Phaser's Container.destroy",
    },
    {
      name: "dialogueTokens",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#IMysteryEncounter.dialogueTokens",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.dialogueTokens",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounterBuilder.dialogueTokens",
      ],
    },
    { name: "display", kind: "field", at: [], from: "ours", note: "DOM style.display on our panel" },
    { name: "doesFlagEffectApply", kind: "method", at: ["src/data/moves/move.ts#Move.doesFlagEffectApply"] },
    {
      name: "doReturn",
      kind: "field",
      at: [
        "src/phases/switch-phase.ts#SwitchPhase.doReturn",
        "src/phases/switch-summon-phase.ts#SwitchSummonPhase.doReturn",
      ],
    },
    {
      name: "duration",
      kind: "field",
      at: [],
      from: "ours",
      note: "WEB API: PerformanceEventTiming / Long Animation Frames entries",
    },
    { name: "each", kind: "method", at: ["test/mocks/mocks-container/mock-container.ts#MockContainer.each"] },
    {
      name: "effectChanceOverride",
      kind: "field",
      at: [
        "src/data/moves/move.ts#MoveEffectAttrOptions.effectChanceOverride",
        "src/data/moves/move.ts#MoveEffectAttr.effectChanceOverride",
      ],
    },
    {
      name: "effects",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#BlockStatusDamageAbAttr.effects",
        "src/data/abilities/ab-attrs.ts#PostTurnStatusHealAbAttr.effects",
      ],
    },
    {
      name: "eggs",
      kind: "field",
      at: ["src/@types/save-data.ts#SystemSaveData.eggs", "src/system/game-data.ts#GameData.eggs"],
    },
    { name: "enabled", kind: "field", at: [], from: "ours", note: "our encounter option model" },
    {
      name: "encounter",
      kind: "field",
      at: [
        "src/data/dialogue.ts#TrainerTypeMessages.encounter",
        "src/field/mystery-encounter-intro.ts#MysteryEncounterIntroVisuals.encounter",
      ],
    },
    {
      name: "encounteredEvents",
      kind: "field",
      at: ["src/data/mystery-encounters/mystery-encounter-save-data.ts#MysteryEncounterSaveData.encounteredEvents"],
    },
    {
      name: "encounterOptions",
      kind: "field",
      at: ["src/ui/handlers/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.encounterOptions"],
    },
    {
      name: "encounterSpawnChance",
      kind: "field",
      at: ["src/data/mystery-encounters/mystery-encounter-save-data.ts#MysteryEncounterSaveData.encounterSpawnChance"],
    },
    {
      name: "encounterTier",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#IMysteryEncounter.encounterTier",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.encounterTier",
      ],
    },
    {
      name: "encounterType",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#IMysteryEncounter.encounterType",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.encounterType",
      ],
    },
    { name: "enemyLevels", kind: "field", at: ["src/battle.ts#Battle.enemyLevels"] },
    {
      name: "enemyPartyConfigs",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#IMysteryEncounter.enemyPartyConfigs",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.enemyPartyConfigs",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounterBuilder.enemyPartyConfigs",
      ],
    },
    {
      name: "enemySpeed",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/berries-abound-encounter.ts#BerriesAboundEncounter"],
      note: "ME misc key",
    },
    { name: "entry", kind: "field", at: ["src/@types/save-data.ts#RunEntry.entry"] },
    { name: "event", kind: "field", at: ["src/ui/containers/event-display.ts#TimedEventDisplay.event"] },
    {
      name: "events",
      kind: "field",
      at: [],
      from: "ours",
      note: "our located game-tables record (TimedEventManager slot) and meter ring",
    },
    {
      name: "evoLevelThreshold",
      kind: "field",
      at: ["src/data/balance/pokemon-evolutions.ts#SpeciesFormEvolution.evoLevelThreshold"],
    },
    { name: "executeWithSeedOffset", kind: "method", at: ["src/battle-scene.ts#BattleScene.executeWithSeedOffset"] },
    {
      name: "exists",
      kind: "method",
      at: [
        "src/dynamic-queue-manager.ts#DynamicQueueManager.exists",
        "src/phase-tree.ts#PhaseTree.exists",
        "test/mocks/mock-texture-manager.ts#MockTextureManager.exists",
      ],
    },
    {
      name: "extraCatchCandy",
      kind: "field",
      at: [],
      from: "ours",
      note: "our account record, filled from getExtraCatchCandy",
    },
    { name: "face", kind: "field", at: ["src/i18n.ts#LoadingFontFaceProperty.face"] },
    { name: "fainted", kind: "field", at: ["src/modifier/modifier.ts#PokemonHpRestoreModifier.fainted"] },
    {
      name: "fastestPokemon",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/berries-abound-encounter.ts#BerriesAboundEncounter"],
      note: "ME misc key",
    },
    {
      name: "forcedBiomes",
      kind: "field",
      at: [
        "src/@types/daily-run.ts#CustomDailyRunConfig.forcedBiomes",
        "src/@types/daily-run.ts#SerializedDailyRunConfig.forcedBiomes",
      ],
    },
    {
      name: "forcedWaves",
      kind: "field",
      at: [
        "src/@types/daily-run.ts#CustomDailyRunConfig.forcedWaves",
        "src/@types/daily-run.ts#SerializedDailyRunConfig.forcedWaves",
      ],
    },
    { name: "form", kind: "field", at: ["src/battle-scene.ts#PartyInfo.form"] },
    { name: "formIndex", kind: "field", at: ["src/field/pokemon.ts#Pokemon.formIndex"] },
    { name: "formKey", kind: "field", at: ["src/data/pokemon-species.ts#PokemonForm.formKey"] },
    {
      name: "forms",
      kind: "field",
      at: [
        "src/data/pokemon-species.ts#PokemonSpeciesConstructor.forms",
        "src/data/pokemon-species.ts#PokemonSpecies.forms",
      ],
    },
    {
      name: "frames",
      kind: "field",
      at: [
        "src/data/battle-anims.ts#AnimConfig.frames",
        "test/mocks/mocks-container/mock-texture.ts#MockTexture.frames",
      ],
    },
    { name: "freezeTurnsRemaining", kind: "field", at: ["src/data/status-effect.ts#Status.freezeTurnsRemaining"] },
    { name: "friendship", kind: "field", at: ["src/field/pokemon.ts#Pokemon.friendship"] },
    { name: "fuse", kind: "method", at: ["src/field/pokemon.ts#PlayerPokemon.fuse"] },
    { name: "fusion", kind: "field", at: ["src/data/challenge.ts#MonotypeOverride.fusion"] },
    { name: "fusionFormIndex", kind: "field", at: ["src/field/pokemon.ts#Pokemon.fusionFormIndex"] },
    { name: "fusionShiny", kind: "field", at: ["src/field/pokemon.ts#Pokemon.fusionShiny"] },
    { name: "fusionSpecies", kind: "field", at: ["src/field/pokemon.ts#Pokemon.fusionSpecies"] },
    { name: "g", kind: "field", at: ["src/utils/color-utils.ts#Rgba.g"] },
    { name: "gender", kind: "field", at: ["src/field/pokemon.ts#Pokemon.gender"] },
    {
      name: "generateNewBattleTrainer",
      kind: "method",
      at: ["src/battle-scene.ts#BattleScene.generateNewBattleTrainer"],
    },
    { name: "genPartyMember", kind: "method", at: ["src/field/trainer.ts#Trainer.genPartyMember"] },
    { name: "getAccuracyMultiplier", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getAccuracyMultiplier"] },
    {
      name: "getAllSpecies",
      kind: "method",
      at: ["src/data/species-data-registry.ts#SpeciesDataRegistry.getAllSpecies"],
    },
    {
      name: "getAllStarters",
      kind: "method",
      at: ["src/data/species-data-registry.ts#SpeciesDataRegistry.getAllStarters"],
    },
    {
      name: "getAllValidEventEncounters",
      kind: "method",
      at: ["src/timed-event-manager.ts#TimedEventManager.getAllValidEventEncounters"],
    },
    { name: "getAlly", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getAlly"] },
    { name: "getAttackDamage", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getAttackDamage"] },
    {
      name: "getAttackTypeEffectiveness",
      kind: "method",
      at: ["src/field/pokemon.ts#Pokemon.getAttackTypeEffectiveness"],
    },
    {
      name: "getAttrs",
      kind: "method",
      at: ["src/data/abilities/ability.ts#Ability.getAttrs", "src/data/moves/move.ts#Move.getAttrs"],
    },
    { name: "getBase64", kind: "method", at: [], from: "phaser", note: "Phaser.Textures.TextureManager.getBase64" },
    {
      name: "getBaseStatTotal",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.getBaseStatTotal"],
    },
    {
      name: "getBattleCount",
      kind: "method",
      at: ["src/modifier/modifier.ts#LapsingPersistentModifier.getBattleCount"],
    },
    {
      name: "getBattlerIndex",
      kind: "method",
      at: [
        "src/field/pokemon.ts#Pokemon.getBattlerIndex",
        "src/field/pokemon.ts#PlayerPokemon.getBattlerIndex",
        "src/field/pokemon.ts#EnemyPokemon.getBattlerIndex",
      ],
    },
    { name: "getCritStage", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getCritStage"] },
    { name: "getEffectiveStat", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getEffectiveStat"] },
    {
      name: "getEncounterBossSegments",
      kind: "method",
      at: ["src/battle-scene.ts#BattleScene.getEncounterBossSegments"],
    },
    {
      name: "getEventBiomeLinks",
      kind: "method",
      at: ["src/timed-event-manager.ts#TimedEventManager.getEventBiomeLinks"],
    },
    {
      name: "getEventLuckBoost",
      kind: "method",
      at: ["src/timed-event-manager.ts#TimedEventManager.getEventLuckBoost"],
    },
    {
      name: "getEventLuckBoostedSpecies",
      kind: "method",
      at: ["src/timed-event-manager.ts#TimedEventManager.getEventLuckBoostedSpecies"],
    },
    {
      name: "getEvolutionLevels",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpecies.getEvolutionLevels"],
    },
    {
      name: "getEvolutions",
      kind: "method",
      at: ["src/data/species-data-registry.ts#SpeciesDataRegistry.getEvolutions"],
    },
    {
      name: "getExtraCatchCandy",
      kind: "method",
      at: ["src/timed-event-manager.ts#TimedEventManager.getExtraCatchCandy"],
    },
    { name: "getFixedBattle", kind: "method", at: ["src/game-mode.ts#GameMode.getFixedBattle"] },
    {
      name: "getFullUnlocksData",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpecies.getFullUnlocksData"],
    },
    { name: "getHpRatio", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getHpRatio"] },
    {
      name: "getIconAtlasKey",
      kind: "method",
      at: [
        "src/data/pokemon-species.ts#PokemonSpeciesForm.getIconAtlasKey",
        "src/field/pokemon.ts#Pokemon.getIconAtlasKey",
      ],
    },
    {
      name: "getIconId",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.getIconId", "src/field/pokemon.ts#Pokemon.getIconId"],
    },
    { name: "getLastXMoves", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getLastXMoves"] },
    { name: "getLearnableLevelMoves", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getLearnableLevelMoves"] },
    { name: "getLevelForWave", kind: "method", at: ["src/battle.ts#Battle.getLevelForWave"] },
    {
      name: "getLevelMoves",
      kind: "method",
      at: [
        "src/data/pokemon-species.ts#PokemonSpeciesForm.getLevelMoves",
        "src/data/pokemon-species.ts#PokemonForm.getLevelMoves",
      ],
    },
    {
      name: "getLevels",
      kind: "method",
      at: [
        "src/data/moves/move.ts#StatStageChangeAttr.getLevels",
        "src/data/moves/move.ts#GrowthStatStageChangeAttr.getLevels",
      ],
    },
    { name: "getLuck", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getLuck"] },
    { name: "getMatchupScore", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getMatchupScore"] },
    { name: "getMaxExpLevel", kind: "method", at: ["src/battle-scene.ts#BattleScene.getMaxExpLevel"] },
    {
      name: "getModifierCount",
      kind: "method",
      at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase.getModifierCount"],
    },
    { name: "getMoveCategory", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getMoveCategory"] },
    { name: "getMoveChance", kind: "method", at: ["src/data/moves/move.ts#MoveEffectAttr.getMoveChance"] },
    { name: "getMoveEffectiveness", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getMoveEffectiveness"] },
    { name: "getMoveType", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getMoveType"] },
    { name: "getMysteryEncounter", kind: "method", at: ["src/battle-scene.ts#BattleScene.getMysteryEncounter"] },
    { name: "getNameToRender", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getNameToRender"] },
    { name: "getNature", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getNature"] },
    { name: "getNextMove", kind: "method", at: ["src/field/pokemon.ts#EnemyPokemon.getNextMove"] },
    { name: "getNextSummonIndex", kind: "method", at: ["src/field/trainer.ts#Trainer.getNextSummonIndex"] },
    { name: "getOpponents", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getOpponents"] },
    { name: "getOrInferTier", kind: "method", at: ["src/modifier/modifier-type.ts#ModifierType.getOrInferTier"] },
    {
      name: "getPartyMemberMatchupScores",
      kind: "method",
      at: ["src/field/trainer.ts#Trainer.getPartyMemberMatchupScores"],
    },
    {
      name: "getPrevolution",
      kind: "method",
      at: ["src/data/species-data-registry.ts#SpeciesDataRegistry.getPrevolution"],
    },
    {
      name: "getPrevolutionLevels",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpecies.getPrevolutionLevels"],
    },
    {
      name: "getPriority",
      kind: "method",
      at: [
        "src/data/moves/move.ts#Move.getPriority",
        "src/phases/post-summon-activate-ability-phase.ts#PostSummonActivateAbilityPhase.getPriority",
        "src/phases/post-summon-phase.ts#PostSummonPhase.getPriority",
      ],
    },
    { name: "getPriorityModifier", kind: "method", at: ["src/data/moves/move.ts#Move.getPriorityModifier"] },
    {
      name: "getRerollCost",
      kind: "method",
      at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase.getRerollCost"],
    },
    {
      name: "getRootSpeciesId",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.getRootSpeciesId"],
    },
    {
      name: "getSeedOffset",
      kind: "method",
      at: ["src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.getSeedOffset"],
    },
    {
      name: "getShinyCatchMultiplier",
      kind: "method",
      at: ["src/timed-event-manager.ts#TimedEventManager.getShinyCatchMultiplier"],
    },
    {
      name: "getSortedPartyMemberMatchupScores",
      kind: "method",
      at: ["src/field/trainer.ts#Trainer.getSortedPartyMemberMatchupScores"],
    },
    {
      name: "getSpecies",
      kind: "method",
      at: [
        "src/data/species-data-registry.ts#SpeciesDataRegistry.getSpecies",
        "src/modifier/modifier.ts#PokemonHeldItemModifier.getSpecies",
        "src/modifier/modifier.ts#EvoTrackerModifier.getSpecies",
      ],
    },
    { name: "getSpeciesForm", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getSpeciesForm"] },
    {
      name: "getStarterCost",
      kind: "method",
      at: ["src/data/species-data-registry.ts#SpeciesDataRegistry.getStarterCost"],
    },
    {
      name: "getStarterDexAttrPropsFromPreferences",
      kind: "method",
      at: ["src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.getStarterDexAttrPropsFromPreferences"],
    },
    { name: "getTag", kind: "method", at: ["src/field/arena.ts#Arena.getTag", "src/field/pokemon.ts#Pokemon.getTag"] },
    { name: "getTagOnSide", kind: "method", at: ["src/field/arena.ts#Arena.getTagOnSide"] },
    { name: "getTargetBenefitScore", kind: "method", at: ["src/data/moves/move.ts#Move.getTargetBenefitScore"] },
    { name: "getTeraType", kind: "method", at: ["src/field/pokemon.ts#Pokemon.getTeraType"] },
    { name: "getTrainer", kind: "field", at: ["src/battle.ts#FixedBattleConfig.getTrainer"] },
    { name: "getUserBenefitScore", kind: "method", at: ["src/data/moves/move.ts#Move.getUserBenefitScore"] },
    { name: "getWaveForDifficulty", kind: "method", at: ["src/game-mode.ts#GameMode.getWaveForDifficulty"] },
    { name: "getWaveMoneyAmount", kind: "method", at: ["src/battle-scene.ts#BattleScene.getWaveMoneyAmount"] },
    {
      name: "getWildSpeciesForLevel",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpecies.getWildSpeciesForLevel"],
    },
    {
      name: "guaranteedModifierTiers",
      kind: "field",
      at: ["src/modifier/modifier-type.ts#CustomModifierSettings.guaranteedModifierTiers"],
    },
    { name: "hasAbility", kind: "method", at: ["src/field/pokemon.ts#Pokemon.hasAbility"] },
    { name: "hasAbilityWithAttr", kind: "method", at: ["src/field/pokemon.ts#Pokemon.hasAbilityWithAttr"] },
    { name: "hasAnyChallenges", kind: "method", at: ["src/game-mode.ts#GameMode.hasAnyChallenges"] },
    {
      name: "hasAttr",
      kind: "method",
      at: ["src/data/abilities/ability.ts#Ability.hasAttr", "src/data/moves/move.ts#Move.hasAttr"],
    },
    { name: "hasChallenge", kind: "method", at: ["src/game-mode.ts#GameMode.hasChallenge"] },
    { name: "hasFlag", kind: "method", at: ["src/data/moves/move.ts#Move.hasFlag"] },
    {
      name: "hasPrevolution",
      kind: "method",
      at: ["src/data/species-data-registry.ts#SpeciesDataRegistry.hasPrevolution"],
    },
    {
      name: "hasRandomBosses",
      kind: "field",
      at: ["src/game-mode.ts#GameModeConfig.hasRandomBosses", "src/game-mode.ts#GameMode.hasRandomBosses"],
    },
    {
      name: "hasTrainer",
      kind: "method",
      at: [
        "src/field/pokemon.ts#Pokemon.hasTrainer",
        "src/field/pokemon.ts#PlayerPokemon.hasTrainer",
        "src/field/pokemon.ts#EnemyPokemon.hasTrainer",
      ],
    },
    {
      name: "hasTrainers",
      kind: "field",
      at: ["src/game-mode.ts#GameModeConfig.hasTrainers", "src/game-mode.ts#GameMode.hasTrainers"],
    },
    { name: "hasVoucher", kind: "field", at: ["src/data/trainers/trainer-config.ts#TrainerConfig.hasVoucher"] },
    {
      name: "heal",
      kind: "field",
      at: ["src/@types/locales.ts#StatusEffectTranslationEntry.heal", "src/field/pokemon.ts#Pokemon.heal"],
    },
    { name: "healFactor", kind: "field", at: ["src/data/abilities/ab-attrs.ts#PostWeatherLapseHealAbAttr.healFactor"] },
    { name: "healFunc", kind: "field", at: ["src/data/moves/move.ts#VariableHealAttr.healFunc"] },
    {
      name: "healPercent",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#HealFromBerryUseAbAttr.healPercent",
        "src/modifier/modifier.ts#EnemyTurnHealModifier.healPercent",
      ],
    },
    {
      name: "healRatio",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#PostSummonAllyHealAbAttr.healRatio",
        "src/data/moves/move.ts#HealAttr.healRatio",
        "src/data/moves/move.ts#HitHealAttr.healRatio",
      ],
    },
    { name: "healStat", kind: "field", at: ["src/data/moves/move.ts#HitHealAttr.healStat"] },
    {
      name: "hitCount",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#AddSecondStrikeAbAttrParams.hitCount",
        "src/data/pokemon-data.ts#PokemonSummonData.hitCount",
        "src/data/pokemon-data.ts#PokemonTurnData.hitCount",
      ],
    },
    { name: "hits", kind: "field", at: ["src/data/abilities/ab-attrs.ts#MaxMultiHitAbAttrParams.hits"] },
    { name: "hitsLeft", kind: "field", at: ["src/data/pokemon-data.ts#PokemonTurnData.hitsLeft"] },
    { name: "hpCost", kind: "field", at: ["src/data/moves/move.ts#AddSubstituteAttr.hpCost"] },
    { name: "i18nkey", kind: "field", at: ["src/data/moves/move-condition.ts#MoveRestriction.i18nkey"] },
    {
      name: "icon",
      kind: "field",
      at: ["src/ui/containers/starter-container.ts#StarterContainer.icon"],
      note: "other sites read our card rows",
    },
    {
      name: "iconImage",
      kind: "field",
      at: ["src/modifier/modifier-type.ts#ModifierType.iconImage", "src/system/achv.ts#Achv.iconImage"],
    },
    { name: "info", kind: "method", at: ["test/mocks/mock-console/mock-console.ts#MockConsole.info"] },
    { name: "intrinsicMultiHitType", kind: "field", at: ["src/data/moves/move.ts#MultiHitAttr.intrinsicMultiHitType"] },
    {
      name: "invert",
      kind: "field",
      at: [
        "src/data/moves/move.ts#FriendshipPowerAttr.invert",
        "src/data/form-change-triggers.ts#SpeciesFormChangeStatusEffectTrigger.invert",
      ],
    },
    { name: "isAllowedInBattle", kind: "method", at: ["src/field/pokemon.ts#Pokemon.isAllowedInBattle"] },
    { name: "isAllowedInChallenge", kind: "method", at: ["src/field/pokemon.ts#Pokemon.isAllowedInChallenge"] },
    { name: "isBattleClassicFinalBoss", kind: "method", at: ["src/game-mode.ts#GameMode.isBattleClassicFinalBoss"] },
    { name: "isBattleMysteryEncounter", kind: "method", at: ["src/battle.ts#Battle.isBattleMysteryEncounter"] },
    { name: "isCatchable", kind: "method", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.isCatchable"] },
    {
      name: "isChargingMove",
      kind: "method",
      at: ["src/data/moves/move.ts#Move.isChargingMove", "src/data/moves/move.ts#Charging.isChargingMove"],
    },
    {
      name: "isClassic",
      kind: "field",
      at: ["src/game-mode.ts#GameModeConfig.isClassic", "src/game-mode.ts#GameMode.isClassic"],
    },
    { name: "isClassicFinalBoss", kind: "method", at: ["src/battle.ts#Battle.isClassicFinalBoss"] },
    { name: "isCopy", kind: "field", at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase.isCopy"] },
    {
      name: "isDaily",
      kind: "field",
      at: ["src/game-mode.ts#GameModeConfig.isDaily", "src/game-mode.ts#GameMode.isDaily"],
    },
    { name: "isDouble", kind: "method", at: ["src/field/trainer.ts#Trainer.isDouble"] },
    {
      name: "isEndless",
      kind: "field",
      at: ["src/game-mode.ts#GameModeConfig.isEndless", "src/game-mode.ts#GameMode.isEndless"],
    },
    { name: "isEndlessBoss", kind: "method", at: ["src/game-mode.ts#GameMode.isEndlessBoss"] },
    { name: "isEndlessMinorBoss", kind: "method", at: ["src/game-mode.ts#GameMode.isEndlessMinorBoss"] },
    {
      name: "isEnemy",
      kind: "method",
      at: [
        "src/field/pokemon.ts#Pokemon.isEnemy",
        "src/field/pokemon.ts#PlayerPokemon.isEnemy",
        "src/field/pokemon.ts#EnemyPokemon.isEnemy",
      ],
    },
    { name: "isFixedBattle", kind: "method", at: ["src/game-mode.ts#GameMode.isFixedBattle"] },
    { name: "isFreshStartChallenge", kind: "method", at: ["src/game-mode.ts#GameMode.isFreshStartChallenge"] },
    { name: "isFullFreshStartChallenge", kind: "method", at: ["src/game-mode.ts#GameMode.isFullFreshStartChallenge"] },
    { name: "isGrounded", kind: "method", at: ["src/field/pokemon.ts#Pokemon.isGrounded"] },
    { name: "isModal", kind: "field", at: ["src/phases/switch-phase.ts#SwitchPhase.isModal"] },
    {
      name: "isMoveRestricted",
      kind: "method",
      at: ["src/data/battler-tags.ts#MoveRestrictionBattlerTag.isMoveRestricted"],
    },
    { name: "isMoveTerrainCancelled", kind: "method", at: ["src/field/arena.ts#Arena.isMoveTerrainCancelled"] },
    {
      name: "isMoveWeatherCancelled",
      kind: "method",
      at: ["src/data/weather.ts#Weather.isMoveWeatherCancelled", "src/field/arena.ts#Arena.isMoveWeatherCancelled"],
    },
    {
      name: "isOfType",
      kind: "method",
      at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.isOfType", "src/field/pokemon.ts#Pokemon.isOfType"],
    },
    { name: "isSetTimeOut", kind: "field", at: [], from: "phaser", note: "Phaser.DOM.RequestAnimationFrame" },
    { name: "isShiny", kind: "method", at: ["src/field/pokemon.ts#Pokemon.isShiny"] },
    {
      name: "isSplicedOnly",
      kind: "field",
      at: ["src/game-mode.ts#GameModeConfig.isSplicedOnly", "src/game-mode.ts#GameMode.isSplicedOnly"],
    },
    { name: "isTmCompatible", kind: "method", at: ["src/field/pokemon.ts#PlayerPokemon.isTmCompatible"] },
    { name: "isTransferable", kind: "field", at: ["src/modifier/modifier.ts#PokemonHeldItemModifier.isTransferable"] },
    {
      name: "isUnimplemented",
      kind: "field",
      at: [],
      from: "ours",
      note: "ABSENT: Move has no isUnimplemented; Move.unimplemented() only appends \" (N)\" to the name, which the HUD fallback regex reads",
    },
    { name: "isWaveFinal", kind: "method", at: ["src/game-mode.ts#GameMode.isWaveFinal"] },
    { name: "isWaveMysteryEncounter", kind: "method", at: ["src/battle-scene.ts#BattleScene.isWaveMysteryEncounter"] },
    { name: "isWaveTrainer", kind: "method", at: ["src/game-mode.ts#GameMode.isWaveTrainer"] },
    { name: "item", kind: "field", at: ["src/data/balance/pokemon-evolutions.ts#SpeciesFormEvolution.item"] },
    {
      name: "known",
      kind: "field",
      at: ["src/data/form-change-triggers.ts#SpeciesFormChangeMoveLearnedTrigger.known"],
    },
    {
      name: "lastStarterId",
      kind: "field",
      at: ["src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.lastStarterId"],
    },
    { name: "layers", kind: "field", at: ["src/data/arena-tag.ts#EntryHazardTag.layers"] },
    {
      name: "legendary",
      kind: "field",
      at: [
        "src/data/pokemon-species.ts#PokemonSpeciesConstructor.legendary",
        "src/data/pokemon-species.ts#PokemonSpecies.legendary",
      ],
    },
    {
      name: "levelAdditiveModifier",
      kind: "field",
      at: ["src/data/mystery-encounters/utils/encounter-phase-utils.ts#EnemyPartyConfig.levelAdditiveModifier"],
    },
    { name: "levels", kind: "field", at: ["src/phase-tree.ts#PhaseTree.levels"] },
    {
      name: "localizationKey",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.localizationKey",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounterBuilder.localizationKey",
        "src/system/achv.ts#Achv.localizationKey",
      ],
    },
    { name: "locked", kind: "field", at: ["src/data/battle-anims.ts#AnimFrame.locked"] },
    { name: "lockModifierTiers", kind: "field", at: ["src/battle-scene.ts#BattleScene.lockModifierTiers"] },
    {
      name: "luck",
      kind: "field",
      at: ["src/field/pokemon.ts#Pokemon.luck", "src/@types/daily-run.ts#CustomDailyRunConfig.luck"],
    },
    { name: "main", kind: "field", at: ["src/audio/audio-manager.ts#GameVolume.main"] },
    { name: "misc", kind: "field", at: ["src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.misc"] },
    { name: "modeId", kind: "field", at: ["src/game-mode.ts#GameMode.modeId"] },
    { name: "moveEffectiveness", kind: "field", at: ["src/data/pokemon-data.ts#PokemonTurnData.moveEffectiveness"] },
    {
      name: "moveQueue",
      kind: "field",
      at: [
        "src/data/pokemon-data.ts#SerializedPokemonSummonData.moveQueue",
        "src/data/pokemon-data.ts#PokemonSummonData.moveQueue",
      ],
    },
    { name: "moveset", kind: "field", at: ["src/field/pokemon.ts#Pokemon.moveset"] },
    { name: "moveTarget", kind: "field", at: ["src/data/moves/move.ts#Move.moveTarget"] },
    {
      name: "moveType",
      kind: "field",
      at: [
        "src/modifier/modifier.ts#AttackTypeBoosterModifier.moveType",
        "src/modifier/modifier-type.ts#AttackTypeBoosterModifierType.moveType",
      ],
    },
    { name: "mult", kind: "field", at: ["src/data/abilities/ab-attrs.ts#VariableMovePowerBoostAbAttr.mult"] },
    { name: "multiHitType", kind: "field", at: ["src/data/moves/move.ts#MultiHitAttr.multiHitType"] },
    { name: "multiple", kind: "field", at: ["src/@types/move-target-set.ts#MoveTargetSet.multiple"] },
    {
      name: "multiplier",
      kind: "field",
      at: [
        "src/modifier/modifier.ts#StatBoosterModifier.multiplier",
        "src/modifier/modifier.ts#HealingBoosterModifier.multiplier",
        "src/data/abilities/ab-attrs.ts#ReduceBurnDamageAbAttr.multiplier",
        "src/data/abilities/ab-attrs.ts#StatStageChangeMultiplierAbAttr.multiplier",
      ],
    },
    {
      name: "mysteryEncounter",
      kind: "field",
      at: [
        "src/@types/game-events.ts#EventMysteryEncounterTier.mysteryEncounter",
        "src/battle.ts#Battle.mysteryEncounter",
        "test/helpers/overrides-helper.ts#OverridesHelper.mysteryEncounter",
      ],
    },
    {
      name: "mysteryEncounterSaveData",
      kind: "field",
      at: [
        "src/@types/save-data.ts#SessionSaveData.mysteryEncounterSaveData",
        "src/battle-scene.ts#BattleScene.mysteryEncounterSaveData",
      ],
    },
    {
      name: "mythical",
      kind: "field",
      at: [
        "src/data/pokemon-species.ts#PokemonSpeciesConstructor.mythical",
        "src/data/pokemon-species.ts#PokemonSpecies.mythical",
      ],
    },
    {
      name: "newSpecies",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/weird-dream-encounter.ts#PokemonTransformation.newSpecies"],
    },
    {
      name: "numBerries",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/berries-abound-encounter.ts#BerriesAboundEncounter"],
      note: "ME misc key",
    },
    { name: "offsetGym", kind: "field", at: ["src/battle-scene.ts#BattleScene.offsetGym"] },
    { name: "only", kind: "field", at: ["src/i18n.ts#LoadingFontFaceProperty.only"] },
    {
      name: "optionMode",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter-option.ts#IMysteryEncounterOption.optionMode",
        "src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOption.optionMode",
        "src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOptionBuilder.optionMode",
      ],
    },
    {
      name: "optionsMeetsReqs",
      kind: "field",
      at: ["src/ui/handlers/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.optionsMeetsReqs"],
    },
    { name: "order", kind: "field", at: ["src/data/pokemon-data.ts#PokemonTurnData.order"] },
    {
      name: "origin",
      kind: "field",
      at: ["src/ui/handlers/login-register-info-container-ui-handler.ts#BuildInteractableImageOpts.origin"],
    },
    {
      name: "partyMemberIndex",
      kind: "field",
      at: ["src/phases/party-member-pokemon-phase.ts#PartyMemberPokemonPhase.partyMemberIndex"],
    },
    {
      name: "partyStarters",
      kind: "field",
      at: ["src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.partyStarters"],
    },
    {
      name: "partyTemplates",
      kind: "table",
      at: [
        "src/data/trainers/trainer-config.ts#TrainerConfig.partyTemplates",
        "src/data/trainers/trainer-config.ts#trainerConfigs",
      ],
    },
    {
      name: "passive",
      kind: "field",
      at: [],
      from: "ours",
      note: "our defender/combatant spec and roster rows (ability names)",
    },
    {
      name: "passiveAbility",
      kind: "field",
      at: [
        "src/data/pokemon-data.ts#SerializedPokemonSummonData.passiveAbility",
        "src/data/pokemon-data.ts#PokemonSummonData.passiveAbility",
      ],
    },
    {
      name: "pauseEvolutions",
      kind: "field",
      at: [
        "src/field/pokemon.ts#Pokemon.pauseEvolutions",
        "src/field/pokemon.ts#PlayerPokemon.pauseEvolutions",
        "src/system/pokemon-data.ts#PokemonData.pauseEvolutions",
      ],
    },
    { name: "play", kind: "field", at: [], from: "ours", note: "our planner option rows" },
    { name: "player", kind: "field", at: [], from: "ours", note: "our combatant spec" },
    { name: "playerParty", kind: "field", at: ["src/ui/handlers/summary-ui-handler.ts#SummaryUiHandler.playerParty"] },
    {
      name: "pokeballType",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#AddPokeballModifierType.pokeballType",
        "src/modifier/modifier.ts#AddPokeballModifier.pokeballType",
        "src/phases/attempt-capture-phase.ts#AttemptCapturePhase.pokeballType",
      ],
    },
    {
      name: "pokemonConfigs",
      kind: "field",
      at: ["src/data/mystery-encounters/utils/encounter-phase-utils.ts#EnemyPartyConfig.pokemonConfigs"],
    },
    {
      name: "pokemonPool",
      kind: "table",
      at: [
        "src/@types/biomes.ts#Biome.pokemonPool",
        "src/data/balance/biomes/abyss.ts#pokemonPool",
        "src/data/balance/biomes/badlands.ts#pokemonPool",
        "src/data/balance/biomes/beach.ts#pokemonPool",
        "src/data/balance/biomes/cave.ts#pokemonPool",
        "src/data/balance/biomes/construction-site.ts#pokemonPool",
        "src/data/balance/biomes/desert.ts#pokemonPool",
        "src/data/balance/biomes/dojo.ts#pokemonPool",
        "src/data/balance/biomes/end.ts#pokemonPool",
        "src/data/balance/biomes/factory.ts#pokemonPool",
        "src/data/balance/biomes/fairy-cave.ts#pokemonPool",
        "src/data/balance/biomes/forest.ts#pokemonPool",
        "src/data/balance/biomes/grass.ts#pokemonPool",
        "src/data/balance/biomes/graveyard.ts#pokemonPool",
        "src/data/balance/biomes/ice-cave.ts#pokemonPool",
        "src/data/balance/biomes/island.ts#pokemonPool",
        "src/data/balance/biomes/jungle.ts#pokemonPool",
        "src/data/balance/biomes/laboratory.ts#pokemonPool",
        "src/data/balance/biomes/lake.ts#pokemonPool",
        "src/data/balance/biomes/meadow.ts#pokemonPool",
        "src/data/balance/biomes/metropolis.ts#pokemonPool",
        "src/data/balance/biomes/mountain.ts#pokemonPool",
        "src/data/balance/biomes/plains.ts#pokemonPool",
        "src/data/balance/biomes/power-plant.ts#pokemonPool",
        "src/data/balance/biomes/ruins.ts#pokemonPool",
        "src/data/balance/biomes/sea.ts#pokemonPool",
        "src/data/balance/biomes/seabed.ts#pokemonPool",
        "src/data/balance/biomes/slum.ts#pokemonPool",
        "src/data/balance/biomes/snowy-forest.ts#pokemonPool",
        "src/data/balance/biomes/space.ts#pokemonPool",
        "src/data/balance/biomes/swamp.ts#pokemonPool",
        "src/data/balance/biomes/tall-grass.ts#pokemonPool",
        "src/data/balance/biomes/temple.ts#pokemonPool",
        "src/data/balance/biomes/town.ts#pokemonPool",
        "src/data/balance/biomes/volcano.ts#pokemonPool",
        "src/data/balance/biomes/wasteland.ts#pokemonPool",
      ],
    },
    {
      name: "pokerus",
      kind: "field",
      at: [
        "src/@types/save-data.ts#Starter.pokerus",
        "src/field/pokemon.ts#Pokemon.pokerus",
        "src/system/pokemon-data.ts#PokemonData.pokerus",
      ],
    },
    {
      name: "pokerusSpeciesIds",
      kind: "field",
      at: ["src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.pokerusSpeciesIds"],
    },
    { name: "ppUp", kind: "field", at: ["src/data/moves/pokemon-move.ts#PokemonMove.ppUp"] },
    { name: "preTurnCommands", kind: "field", at: ["src/battle.ts#Battle.preTurnCommands"] },
    {
      name: "previousPokemon",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/weird-dream-encounter.ts#PokemonTransformation.previousPokemon"],
    },
    {
      name: "price",
      kind: "field",
      at: [
        "src/data/mystery-encounters/encounters/the-pokemon-salesman-encounter.ts#ThePokemonSalesmanEncounter",
        "src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#TeleportingHijinksEncounter",
      ],
      note: "ME misc key (Salesman, Teleporting Hijinks)",
    },
    {
      name: "primaryPokemon",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOption.primaryPokemon",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.primaryPokemon",
      ],
    },
    {
      name: "primaryPokemonRequirements",
      kind: "field",
      at: ["src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOption.primaryPokemonRequirements"],
    },
    { name: "priority", kind: "field", at: ["src/data/moves/move.ts#Move.priority"] },
    { name: "profile", kind: "method", at: ["test/mocks/mock-console/mock-console.ts#MockConsole.profile"] },
    {
      name: "queryParty",
      kind: "method",
      at: ["src/data/mystery-encounters/mystery-encounter-requirements.ts#EncounterPokemonRequirement.queryParty"],
    },
    {
      name: "quiet",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#PostSummonAddArenaTagAbAttr.quiet",
        "src/data/pokemon-forms.ts#SpeciesFormChangeConstructor.quiet",
        "src/data/pokemon-forms.ts#SpeciesFormChange.quiet",
      ],
    },
    { name: "r", kind: "field", at: ["src/utils/color-utils.ts#Rgba.r"] },
    { name: "raf", kind: "field", at: [], from: "phaser", note: "Phaser.Core.TimeStep.raf" },
    {
      name: "randomSpecies",
      kind: "method",
      at: ["src/battle-scene.ts#BattleScene.randomSpecies", "src/field/arena.ts#Arena.randomSpecies"],
    },
    { name: "randSeedInt", kind: "method", at: ["src/battle.ts#Battle.randSeedInt"] },
    { name: "recoil", kind: "field", at: ["src/data/abilities/ab-attrs.ts#FormBlockDamageAbAttr.recoil"] },
    {
      name: "removeEventListener",
      kind: "method",
      at: ["src/@types/typed-event-target.ts#TypedEventTarget.removeEventListener"],
    },
    {
      name: "renderStart",
      kind: "field",
      at: [],
      from: "ours",
      note: "WEB API: Long Animation Frames (PerformanceLongAnimationFrameTiming)",
    },
    {
      name: "requiredMoney",
      kind: "field",
      at: ["src/data/mystery-encounters/mystery-encounter-requirements.ts#MoneyRequirement.requiredMoney"],
    },
    {
      name: "requirements",
      kind: "field",
      at: ["src/data/mystery-encounters/mystery-encounter-option.ts#MysteryEncounterOption.requirements"],
    },
    { name: "reroll", kind: "field", at: ["src/battle-scene.ts#BattleScene.reroll"] },
    { name: "rerollCount", kind: "field", at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase.rerollCount"] },
    {
      name: "restorePercent",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#PokemonHpRestoreModifierType.restorePercent",
        "src/modifier/modifier.ts#PokemonHpRestoreModifier.restorePercent",
      ],
    },
    {
      name: "restorePoints",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#PokemonHpRestoreModifierType.restorePoints",
        "src/modifier/modifier-type.ts#PokemonPpRestoreModifierType.restorePoints",
      ],
    },
    { name: "restrictions", kind: "field", at: ["src/data/moves/move.ts#Move.restrictions"] },
    {
      name: "result",
      kind: "field",
      at: ["src/@types/damage-result.ts#DamageCalculationResult.result", "src/@types/turn-move.ts#TurnMove.result"],
      note: "getAttackDamage() result; getLastXMoves() entry",
    },
    { name: "revive", kind: "field", at: ["src/phases/pokemon-heal-phase.ts#PokemonHealPhase.revive"] },
    { name: "right", kind: "field", at: ["src/ui/containers/move-info-overlay.ts#MoveInfoOverlaySettings.right"] },
    { name: "rngOffset", kind: "field", at: ["src/battle-scene.ts#BattleScene.rngOffset"] },
    { name: "rngSeedOverride", kind: "field", at: ["src/battle-scene.ts#BattleScene.rngSeedOverride"] },
    { name: "rows", kind: "field", at: ["src/ui/containers/filter-text.ts#FilterText.rows"] },
    { name: "run", kind: "method", at: ["test/framework/phase-interceptor.ts#PhaseInterceptor.run"] },
    {
      name: "safariPokemonRemaining",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SafariZoneEncounter"],
      note: "ME misc key",
    },
    { name: "scale", kind: "field", at: [], from: "ours", note: "our koCurve() options" },
    {
      name: "scalingMultiplier",
      kind: "field",
      at: ["src/data/mystery-encounters/mystery-encounter-requirements.ts#MoneyRequirement.scalingMultiplier"],
    },
    { name: "score", kind: "field", at: [], from: "ours", note: "our enemy-AI pick and combo rows" },
    { name: "seed", kind: "field", at: ["src/battle-scene.ts#BattleScene.seed"] },
    { name: "seedOffsetWaveIndex", kind: "field", at: ["src/battle.ts#FixedBattleConfig.seedOffsetWaveIndex"] },
    { name: "segments", kind: "field", at: ["src/@types/daily-run.ts#DailySeedBoss.segments"] },
    {
      name: "selectedOption",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter-save-data.ts#SeenEncounterData.selectedOption",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.selectedOption",
      ],
    },
    {
      name: "selectFilter",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#PokemonModifierType.selectFilter",
        "src/modifier/modifier-type.ts#PokemonReviveModifierType.selectFilter",
        "src/ui/handlers/party-ui-handler.ts#PartyUiHandler.selectFilter",
      ],
    },
    { name: "selfTarget", kind: "field", at: ["src/data/moves/move.ts#MoveAttr.selfTarget"] },
    { name: "setup", kind: "method", at: [], from: "ours", note: "our turn.mon().setup() and learn plan" },
    { name: "shinyCatchMultiplier", kind: "field", at: ["src/@types/game-events.ts#TimedEvent.shinyCatchMultiplier"] },
    {
      name: "shouldTera",
      kind: "method",
      at: ["src/field/trainer.ts#Trainer.shouldTera", "src/phases/enemy-command-phase.ts#EnemyCommandPhase.shouldTera"],
    },
    { name: "show", kind: "field", at: [], from: "ours", note: "our account-worth row" },
    { name: "shown", kind: "field", at: [], from: "ours", note: "our statusField() result" },
    { name: "shuffle", kind: "method", at: [], from: "phaser", note: "Phaser.Math.RandomDataGenerator.shuffle" },
    { name: "skip", kind: "field", at: [], from: "ours", note: "our move traits charge.skip" },
    {
      name: "skipEnemyBattleTurns",
      kind: "field",
      at: [
        "src/data/mystery-encounters/mystery-encounter.ts#IMysteryEncounter.skipEnemyBattleTurns",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounter.skipEnemyBattleTurns",
        "src/data/mystery-encounters/mystery-encounter.ts#MysteryEncounterBuilder.skipEnemyBattleTurns",
      ],
    },
    {
      name: "sourceFunctionName",
      kind: "field",
      at: [],
      from: "ours",
      note: "WEB API: Long Animation Frames (PerformanceScriptTiming)",
    },
    { name: "sourceIndex", kind: "field", at: ["src/data/battler-tags.ts#SeedTag.sourceIndex"] },
    { name: "specialtyType", kind: "field", at: ["src/data/trainers/trainer-config.ts#TrainerConfig.specialtyType"] },
    {
      name: "speciesFilter",
      kind: "field",
      at: [
        "src/@types/pokemon-common.ts#RandomEncounterParams.speciesFilter",
        "src/data/trainers/trainer-config.ts#TrainerConfig.speciesFilter",
      ],
    },
    {
      name: "speciesId",
      kind: "field",
      at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.speciesId"],
      note: "always off a PokemonSpecies",
    },
    { name: "speciesPools", kind: "field", at: ["src/data/trainers/trainer-config.ts#TrainerConfig.speciesPools"] },
    {
      name: "start",
      kind: "field",
      at: [],
      from: "ours",
      note: "our koCurve()/foeCurve() options and team-plan model",
    },
    { name: "starter", kind: "field", at: ["src/@types/pokemon-species.ts#PokemonSpeciesData.starter"] },
    {
      name: "starterContainers",
      kind: "field",
      at: ["src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.starterContainers"],
    },
    { name: "starters", kind: "field", at: ["src/@types/daily-run.ts#CustomDailyRunConfig.starters"] },
    {
      name: "starterSelectCallback",
      kind: "field",
      at: ["src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.starterSelectCallback"],
    },
    {
      name: "stat",
      kind: "field",
      at: [
        "src/data/abilities/ab-attrs.ts#PostKnockOutStatStageChangeAbAttr.stat",
        "src/modifier/modifier-type.ts#BaseStatBoosterModifierType.stat",
      ],
    },
    {
      name: "stop",
      kind: "field",
      at: [
        "src/audio/background-music.ts#BackgroundMusic.stop",
        "test/mocks/mock-video-game-object.ts#MockVideoGameObject.stop",
        "test/mocks/mocks-container/mock-sprite.ts#MockSprite.stop",
      ],
    },
    {
      name: "subLegendary",
      kind: "field",
      at: [
        "src/data/pokemon-species.ts#PokemonSpeciesConstructor.subLegendary",
        "src/data/pokemon-species.ts#PokemonSpecies.subLegendary",
      ],
    },
    { name: "tag", kind: "field", at: ["src/data/abilities/ab-attrs.ts#PreApplyBattlerTagAbAttrParams.tag"] },
    {
      name: "teamTransformations",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/weird-dream-encounter.ts#WeirdDreamEncounter"],
      note: "ME misc key",
    },
    {
      name: "texture",
      kind: "field",
      at: [
        "test/mocks/mocks-container/mock-image.ts#MockImage.texture",
        "test/mocks/mocks-container/mock-nineslice.ts#MockNineslice.texture",
        "test/mocks/mocks-container/mock-sprite.ts#MockSprite.texture",
      ],
    },
    {
      name: "tier",
      kind: "field",
      at: ["src/@types/daily-run.ts#DailyForcedWave"],
      note: "dailyConfig.forcedWaves entry (union type alias, not in candidates); other sites are our spawn rows",
    },
    {
      name: "title",
      kind: "field",
      at: [],
      from: "ours",
      note: "DOM HTMLElement.title on our panel nodes; our card title",
    },
    { name: "token", kind: "field", at: ["src/@types/api.ts#AccountLoginResponse.token"] },
    { name: "top", kind: "field", at: ["src/ui/containers/move-info-overlay.ts#MoveInfoOverlaySettings.top"] },
    {
      name: "tradeOptionsMap",
      kind: "field",
      at: ["src/data/mystery-encounters/encounters/global-trade-system-encounter.ts#GlobalTradeSystemEncounter"],
      note: "ME misc key",
    },
    {
      name: "trainerChance",
      kind: "field",
      at: ["src/@types/biomes.ts#Biome.trainerChance", "src/field/arena.ts#Arena.trainerChance"],
    },
    {
      name: "trainerConfig",
      kind: "field",
      at: ["src/data/mystery-encounters/utils/encounter-phase-utils.ts#EnemyPartyConfig.trainerConfig"],
    },
    {
      name: "trainerPool",
      kind: "field",
      at: ["src/@types/biomes.ts#Biome.trainerPool", "src/field/arena.ts#Arena.trainerPool"],
    },
    { name: "trainerSlot", kind: "field", at: ["src/field/pokemon.ts#EnemyPokemon.trainerSlot"] },
    {
      name: "trainerType",
      kind: "table",
      at: [
        "src/data/trainers/trainer-config.ts#TrainerConfig.trainerType",
        "src/data/mystery-encounters/utils/encounter-phase-utils.ts#EnemyPartyConfig.trainerType",
        "src/data/trainers/trainer-config.ts#trainerConfigs",
      ],
      note: "trainerConfigs shape probe; also read on ME enemyPartyConfigs",
    },
    {
      name: "transferCursor",
      kind: "field",
      at: ["src/ui/handlers/party-ui-handler.ts#PartyUiHandler.transferCursor"],
    },
    {
      name: "tryRerollHiddenAbilitySeed",
      kind: "method",
      at: ["src/field/pokemon.ts#Pokemon.tryRerollHiddenAbilitySeed"],
    },
    { name: "trySetShinySeed", kind: "method", at: ["src/field/pokemon.ts#Pokemon.trySetShinySeed"] },
    { name: "turnCommands", kind: "field", at: ["src/battle.ts#Battle.turnCommands"] },
    { name: "turnData", kind: "field", at: ["src/field/pokemon.ts#Pokemon.turnData"] },
    { name: "turns", kind: "field", at: ["src/data/abilities/ab-attrs.ts#PostDefendPerishSongAbAttr.turns"] },
    { name: "type1", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.type1"] },
    { name: "type2", kind: "field", at: ["src/data/pokemon-species.ts#PokemonSpeciesForm.type2"] },
    { name: "typeOptions", kind: "field", at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase.typeOptions"] },
    {
      name: "types",
      kind: "field",
      at: [],
      from: "ours",
      note: "our defender/combatant spec, roster rows and patches",
    },
    { name: "unblockable", kind: "field", at: ["src/data/moves/move.ts#RecoilAttr.unblockable"] },
    { name: "upgradeCount", kind: "field", at: ["src/modifier/modifier-type.ts#ModifierTypeOption.upgradeCount"] },
    {
      name: "upPoints",
      kind: "field",
      at: [
        "src/modifier/modifier-type.ts#PokemonPpUpModifierType.upPoints",
        "src/modifier/modifier.ts#PokemonPpUpModifier.upPoints",
      ],
    },
    { name: "useHp", kind: "field", at: ["src/data/moves/move.ts#RecoilAttr.useHp"] },
    {
      name: "val",
      kind: "field",
      at: [
        "src/ui/containers/dropdown.ts#DropDownOption.val",
        "src/ui/containers/move-info-overlay.ts#MoveInfoOverlay.val",
      ],
    },
    { name: "variant", kind: "field", at: ["src/field/pokemon.ts#Pokemon.variant"] },
    { name: "warn", kind: "method", at: ["test/mocks/mock-console/mock-console.ts#MockConsole.warn"] },
    { name: "waveCycleOffset", kind: "field", at: ["src/battle-scene.ts#BattleScene.waveCycleOffset"] },
    { name: "waveSeed", kind: "field", at: ["src/battle-scene.ts#BattleScene.waveSeed"] },
    {
      name: "weatherTypes",
      kind: "field",
      at: [
        "src/data/moves/move.ts#WeatherInstantChargeAttr.weatherTypes",
        "src/data/abilities/ab-attrs.ts#BlockWeatherDamageAttr.weatherTypes",
        "src/data/abilities/ab-attrs.ts#PostWeatherLapseAbAttr.weatherTypes",
      ],
    },
    { name: "weight", kind: "field", at: [], from: "ours", note: "our threat-reason rows" },
    { name: "width", kind: "field", at: [], from: "ours", note: "DOM style.width on our panel" },
    { name: "x", kind: "field", at: [], from: "ours", note: "our scored-hit rows ({ x })" },
    { name: "CheckSwitchPhase", kind: "phase", at: ["src/phases/check-switch-phase.ts#CheckSwitchPhase"] },
    { name: "LearnMovePhase", kind: "phase", at: ["src/phases/learn-move-phase.ts#LearnMovePhase"] },
    {
      name: "MysteryEncounterPhase",
      kind: "phase",
      at: ["src/phases/mystery-encounter-phases.ts#MysteryEncounterPhase"],
    },
    { name: "SelectBiomePhase", kind: "phase", at: ["src/phases/select-biome-phase.ts#SelectBiomePhase"] },
    { name: "SelectModifierPhase", kind: "phase", at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase"] },
    { name: "SelectTargetPhase", kind: "phase", at: ["src/phases/select-target-phase.ts#SelectTargetPhase"] },
    { name: "TitlePhase", kind: "phase", at: ["src/phases/title-phase.ts#TitlePhase"] },
    { name: "coach-hud-panel", kind: "storage-key", at: [], from: "ours", note: "the HUD's own key" },
    { name: "coach-hud-view", kind: "storage-key", at: [], from: "ours", note: "the HUD's own key" },
    { name: "coach-me-journal", kind: "storage-key", at: [], from: "ours", note: "the HUD's own key" },
    {
      name: "prLang",
      kind: "storage-key",
      at: ["src/i18n.ts#*"],
      note: "the language detector's key, set up at the module's top level",
    },
  ],
  sets: [
    {
      at: "src/phase-manager.ts#PHASES",
      known: [
        "AddEnemyBuffModifierPhase", "AttemptCapturePhase", "AttemptRunPhase", "BattleEndPhase", "BerryPhase",
        "CheckInterludePhase", "CheckStatusEffectPhase", "CheckSwitchPhase", "CommandPhase", "CommonAnimPhase",
        "DamageAnimPhase", "DynamicPhaseMarker", "EggHatchPhase", "EggLapsePhase", "EggSummaryPhase", "EncounterPhase",
        "EndCardPhase", "EndEvolutionPhase", "EnemyCommandPhase", "EvolutionPhase", "ExpPhase", "FaintPhase",
        "FormChangePhase", "GameOverPhase", "GameOverModifierRewardPhase", "HideAbilityPhase", "HidePartyExpBarPhase",
        "InitEncounterPhase", "LearnMovePhase", "LevelCapPhase", "LevelUpPhase", "LoadMoveAnimPhase", "LoginPhase",
        "MessagePhase", "ModifierRewardPhase", "MoneyRewardPhase", "MoveAnimPhase", "MoveChargePhase",
        "MoveEffectPhase", "MoveEndPhase", "MoveHeaderPhase", "MoveReflectPhase", "MovePhase", "MysteryEncounterPhase",
        "MysteryEncounterOptionSelectedPhase", "MysteryEncounterBattlePhase",
        "MysteryEncounterBattleStartCleanupPhase", "MysteryEncounterRewardsPhase", "PostMysteryEncounterPhase",
        "NewBattlePhase", "NewBiomeEncounterPhase", "NextEncounterPhase", "ObtainStatusEffectPhase", "PartyExpPhase",
        "PartyHealPhase", "PokemonAnimPhase", "PokemonHealPhase", "PokemonTransformPhase", "PositionalTagPhase",
        "PostGameOverPhase", "PostSummonPhase", "PostTurnStatusEffectPhase", "QuietFormChangePhase",
        "ResetStatusPhase", "ReturnPhase", "RevivalBlessingPhase", "RibbonModifierRewardPhase", "ScanIvsPhase",
        "SelectBiomePhase", "SelectChallengePhase", "SelectGenderPhase", "SelectModifierPhase", "SelectStarterPhase",
        "SelectTargetPhase", "ShinySparklePhase", "ShowAbilityPhase", "ShowPartyExpBarPhase", "ShowTrainerPhase",
        "StatStageChangePhase", "SummonMissingPhase", "SummonPhase", "SwitchBiomePhase", "SwitchPhase",
        "SwitchSummonPhase", "TeraPhase", "TitlePhase", "ToggleDoublePositionPhase", "TrainerVictoryPhase",
        "TurnEndPhase", "TurnInitPhase", "TurnStartPhase", "UnavailablePhase", "UnlockPhase", "VictoryPhase",
        "WeatherEffectPhase", "DancerPhase", "PartyReorderSwitchPhase",
      ],
      handledIn: ["skills/coachemon/scripts/hud/02-decision.js", "src/call-outcome.ts"],
    },
    {
      at: "src/enums/challenges.ts#Challenges",
      known: [
        "SINGLE_GENERATION", "SINGLE_TYPE", "LOWER_MAX_STARTER_COST", "LOWER_STARTER_POINTS", "FRESH_START",
        "INVERSE_BATTLE", "FLIP_STAT", "LIMITED_CATCH", "LIMITED_SUPPORT", "HARDCORE", "PASSIVES",
        "MOVESET_RANDOMIZER", "ABILITY_RANDOMIZER",
      ],
      handledIn: ["skills/coachemon/scripts/hud/03-calendar.js", "skills/coachemon/scripts/hud/25-turn.js", "skills/coachemon/scripts/hud/51-starters.js"],
    },
    {
      at: "src/enums/mystery-encounter-type.ts#MysteryEncounterType",
      known: [
        "MYSTERIOUS_CHALLENGERS", "MYSTERIOUS_CHEST", "DARK_DEAL", "FIGHT_OR_FLIGHT", "SLUMBERING_SNORLAX",
        "TRAINING_SESSION", "DEPARTMENT_STORE_SALE", "SHADY_VITAMIN_DEALER", "FIELD_TRIP", "SAFARI_ZONE",
        "LOST_AT_SEA", "FIERY_FALLOUT", "THE_STRONG_STUFF", "THE_POKEMON_SALESMAN", "AN_OFFER_YOU_CANT_REFUSE",
        "DELIBIRDY", "ABSOLUTE_AVARICE", "A_TRAINERS_TEST", "TRASH_TO_TREASURE", "BERRIES_ABOUND", "CLOWNING_AROUND",
        "PART_TIMER", "DANCING_LESSONS", "WEIRD_DREAM", "THE_WINSTRATE_CHALLENGE", "TELEPORTING_HIJINKS",
        "BUG_TYPE_SUPERFAN", "FUN_AND_GAMES", "UNCOMMON_BREED", "GLOBAL_TRADE_SYSTEM", "THE_EXPERT_POKEMON_BREEDER",
      ],
      handledIn: ["skills/coachemon/scripts/hud/46-encounter.js"],
    },
    {
      at: "src/enums/game-modes.ts#GameModes",
      known: [
        "CLASSIC", "ENDLESS", "SPLICED_ENDLESS", "DAILY", "CHALLENGE",
      ],
      handledIn: ["skills/coachemon/scripts/hud/03-calendar.js"],
    },
  ],
  mirrors: [
    {
      ours: "skills/coachemon/scripts/hud/01-core.js#ability-immune",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/01-core.js#ungrounded",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/01-core.js#ability-immune-flag",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/01-core.js#chart", of: ["src/data/type.ts#getTypeDamageMultiplier"] },
    { ours: "skills/coachemon/scripts/hud/01-core.js#natures", of: ["src/enums/nature.ts#Nature"] },
    {
      ours: "skills/coachemon/scripts/hud/01-core.js#nature-stats",
      of: [
        "src/data/nature.ts#getNatureStatMultiplier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/01-core.js#nature-stat-ids",
      of: [
        "src/data/nature.ts#getNatureStatMultiplier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/01-core.js#queue-methods",
      of: [
        "src/phase-manager.ts#PhaseManager.pushPhase",
        "src/phase-manager.ts#PhaseManager.unshiftPhase",
        "src/phase-manager.ts#PhaseManager.pushNew",
        "src/phase-manager.ts#PhaseManager.unshiftNew",
        "src/phase-manager.ts#PhaseManager.queueMessage",
        "src/phase-manager.ts#PhaseManager.queueAbilityDisplay",
        "src/phase-manager.ts#PhaseManager.hideAbilityBar",
        "src/phase-manager.ts#PhaseManager.queueFaintPhase",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/01-core.js#status-frames", of: ["src/enums/status-effect.ts#StatusEffect"] },
    { ours: "skills/coachemon/scripts/hud/01-core.js#stat-names", of: ["src/enums/stat.ts#Stat"] },
    { ours: "skills/coachemon/scripts/hud/01-core.js#tier-names", of: ["src/enums/modifier-tier.ts#ModifierTier"] },
    { ours: "skills/coachemon/scripts/hud/01-core.js#types", of: ["src/enums/pokemon-type.ts#PokemonType"] },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#grunt-waves",
      of: [
        "src/enums/fixed-boss-waves.ts#ClassicFixedBossWaves",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#rival-waves",
      of: [
        "src/enums/fixed-boss-waves.ts#ClassicFixedBossWaves",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/03-calendar.js#gym-rule", of: ["src/game-mode.ts#GameMode.isWaveTrainer"] },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#heals-at-all",
      of: [
        "src/data/challenge.ts#LimitedSupportChallenge.applyPartyHeal",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/03-calendar.js#is-boss-wave", of: ["src/game-mode.ts#GameMode.isBoss"] },
    { ours: "skills/coachemon/scripts/hud/03-calendar.js#is-final-wave", of: ["src/game-mode.ts#GameMode.isWaveFinal"] },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#next-heal",
      of: [
        "src/phases/select-biome-phase.ts#SelectBiomePhase.setNextBiomeAndEnd",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#pool-anchor-wave",
      of: [
        "src/battle-scene.ts#BattleScene.doPostBattleCleanup",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#shop-after",
      of: [
        "src/phases/victory-phase.ts#VictoryPhase.start",
        "src/phases/select-biome-phase.ts#SelectBiomePhase.setNextBiomeAndEnd",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/03-calendar.js#shops-at-all",
      of: [
        "src/data/challenge.ts#LimitedSupportChallenge.applyShop",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/04-game-tables.js#reward-fns",
      of: [
        "src/modifier/modifier-type.ts#regenerateModifierPoolThresholds",
        "src/modifier/modifier-type.ts#getPlayerModifierTypeOptions",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/04-game-tables.js#biome-name-fn", of: ["src/utils/common.ts#getBiomeName"] },
    { ours: "skills/coachemon/scripts/hud/04-game-tables.js#biome-table-shape", of: ["src/@types/biomes.ts#Biome"] },
    {
      ours: "skills/coachemon/scripts/hud/04-game-tables.js#egg-moves-shape",
      of: [
        "src/data/balance/moves/egg-moves.ts#speciesEggMoves",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/04-game-tables.js#events-shape",
      of: [
        "src/timed-event-manager.ts#TimedEventManager.getShinyCatchMultiplier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/04-game-tables.js#species-registry-shape",
      of: [
        "src/data/species-data-registry.ts#SpeciesDataRegistry.getSpecies",
        "src/data/species-data-registry.ts#SpeciesDataRegistry.getAllSpecies",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/04-game-tables.js#trainer-config-shape",
      of: [
        "src/data/trainers/trainer-config.ts#TrainerConfig.trainerType",
        "src/data/trainers/trainer-config.ts#TrainerConfig.partyTemplates",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/07-move-traits.js#command-condition",
      of: [
        "src/data/moves/move.ts#initMoves",
        "src/data/moves/move-condition.ts#failIfTargetNotAttackingCondition",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/07-move-traits.js#no-repeat-key",
      of: [
        "src/data/moves/move-condition.ts#consecutiveUseRestriction",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/07-move-traits.js#multi-hit-odds",
      of: [
        "src/data/moves/move.ts#MultiHitAttr.getHitCount",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/08-party.js#fixed-damage-attrs",
      of: [
        "src/data/moves/move.ts#FixedDamageAttr",
        "src/field/pokemon.ts#Pokemon.getAttackDamage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/09-combatant.js#attrs-by-ability",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
        "src/data/abilities/ab-attrs.ts#PreDefendFullHpEndureAbAttr",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/09-combatant.js#neutral-nature", of: ["src/enums/nature.ts#Nature.HARDY"] },
    {
      ours: "skills/coachemon/scripts/hud/09-projection.js#exp-multipliers",
      of: [
        "src/battle-scene.ts#BattleScene.applyPartyExp",
        "src/modifier/modifier-type.ts#modifierTypeInitObj",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/09-projection.js#level-cap-at",
      of: [
        "src/battle-scene.ts#BattleScene.getMaxExpLevel",
        "src/game-mode.ts#GameMode.getWaveForDifficulty",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#ate",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/10-damage.js#orb-spared", of: ["src/field/pokemon.ts#Pokemon.canSetStatus"] },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#present",
      of: [
        "src/data/moves/move.ts#PresentPowerAttr.apply",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#present-heal",
      of: [
        "src/data/moves/move.ts#PresentPowerAttr.apply",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#result-mult",
      of: [
        "src/field/pokemon.ts#Pokemon.getAttackDamage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#salt-doubled",
      of: [
        "src/data/battler-tags.ts#SaltCuredTag.getDamageHpRatio",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#weather-spared",
      of: [
        "src/data/weather.ts#Weather.isTypeDamageImmune",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#add-rolls",
      of: [
        "src/field/pokemon.ts#Pokemon.getAttackDamage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#bar-break-factors",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.handleBossSegmentCleared",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#crit-odds",
      of: [
        "src/field/pokemon.ts#Pokemon.getCriticalHitResult",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#lens-share",
      of: [
        "src/modifier/modifier.ts#PokemonMultiHitModifier.applyDamageModifier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#psywave-range",
      of: [
        "src/data/moves/move.ts#RandomLevelDamageAttr.getDamage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/10-damage.js#target-facts",
      of: [
        "src/modifier/modifier.ts#SurviveDamageModifier.shouldApply",
        "src/modifier/modifier.ts#EnemyEndureChanceModifier.apply",
        "src/modifier/modifier.ts#PokemonInstantReviveModifier.apply",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/10-damage.js#with-dmg", of: ["src/field/pokemon.ts#Pokemon.getAttackDamage"] },
    { ours: "skills/coachemon/scripts/hud/12-value.js#party-size", of: ["src/constants.ts#PLAYER_PARTY_MAX_SIZE"] },
    {
      ours: "skills/coachemon/scripts/hud/20-enemy-ai.js#no-condition-check",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.getNextMove",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/20-enemy-ai.js#ai-chain",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.getNextMove",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/20-enemy-ai.js#ai-next-targets",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.getNextTargets",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/20-enemy-ai.js#ai-target-score",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.getNextMove",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/20-enemy-ai.js#enemy-switch-threshold",
      of: [
        "src/phases/enemy-command-phase.ts#EnemyCommandPhase.start",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/25-turn.js#type-status-immune",
      of: [
        "src/field/pokemon.ts#Pokemon.canSetStatus",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/25-turn.js#speed-tie-seed",
      of: [
        "src/utils/speed-order.ts#shufflePokemonList",
        "src/utils/common.ts#randSeedShuffle",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/25-turn.js#stealth-rock-chip",
      of: [
        "src/data/arena-tag.ts#StealthRockTag.getDamageHpRatio",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#status-skip",
      of: [
        "src/field/pokemon.ts#Pokemon.doSetStatus",
        "src/phases/move-phase.ts#MovePhase.checkSleep",
        "src/phases/move-phase.ts#MovePhase.checkFreeze",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/30-planner.js#stat-abbr", of: ["src/enums/stat.ts#Stat"] },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#thieves",
      of: [
        "src/modifier/modifier.ts#ContactHeldItemTransferChanceModifier",
        "src/modifier/modifier.ts#TurnHeldItemTransferModifier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#act-chance",
      of: [
        "src/phases/move-phase.ts#MovePhase.checkSleep",
        "src/phases/move-phase.ts#MovePhase.checkFreeze",
        "src/phases/move-phase.ts#MovePhase.checkPara",
        "src/data/battler-tags.ts#ConfusedTag.lapse",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#ai-advance-chance",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.getNextMove",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#combo-damage-roll",
      of: [
        "src/field/pokemon.ts#Pokemon.getAttackDamage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#confusion-hit",
      of: [
        "src/data/battler-tags.ts#ConfusedTag.lapse",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#flinch-chance",
      of: [
        "src/modifier/modifier.ts#FlinchChanceModifier.constructor",
        "src/modifier/modifier.ts#FlinchChanceModifier.apply",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#helping-hand-roll",
      of: [
        "src/data/moves/move.ts#Move.calculateBattlePower",
        "src/field/pokemon.ts#Pokemon.getAttackDamage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#kings-rock",
      of: [
        "src/modifier/modifier.ts#FlinchChanceModifier.constructor",
        "src/modifier/modifier.ts#FlinchChanceModifier.apply",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/30-planner.js#stat-names", of: ["src/enums/stat.ts#Stat"] },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#para-skip",
      of: [
        "src/phases/move-phase.ts#MovePhase.checkPara",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#quick-chance",
      of: [
        "src/modifier/modifier.ts#BypassSpeedChanceModifier.apply",
        "src/data/abilities/ab-attrs.ts#BypassSpeedChanceAbAttr",
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#spikes-ratio",
      of: [
        "src/data/arena-tag.ts#SpikesTag.getDamageHpRatio",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/30-planner.js#spread-mult",
      of: [
        "src/field/pokemon.ts#Pokemon.getAttackDamage",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/30-planner.js#para-act-chance", of: ["src/phases/move-phase.ts#MovePhase.checkPara"] },
    {
      ours: "skills/coachemon/scripts/hud/35-team-plan.js#tp-send-base",
      of: [
        "src/field/pokemon.ts#Pokemon.getMatchupScore",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/35-team-plan.js#tp-send-score",
      of: [
        "src/field/pokemon.ts#Pokemon.getMatchupScore",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#ate",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#atk-mult",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#heal-blocked",
      of: [
        "src/data/moves/invalid-moves.ts#healBlockedMoves",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#mold-breakers",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#never-trapped",
      of: [
        "src/field/pokemon.ts#Pokemon.isTrapped",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#stand-ins",
      of: [
        "src/data/moves/move.ts#FriendshipPowerAttr",
        "src/data/moves/move.ts#MagnitudePowerAttr",
        "src/data/moves/move.ts#PresentPowerAttr",
        "src/data/moves/move.ts#BeatUpAttr",
        "src/data/moves/move.ts#TargetHalfHpDamageAttr",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#curse-blocked",
      of: [
        "src/data/moves/move.ts#MoveEffectAttr.getMoveChance",
        "src/data/moves/move.ts#AddBattlerTagAttr.apply",
        "src/data/battler-tags.ts#DamagingBattlerTag",
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#status-abilities",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#status-types",
      of: [
        "src/field/pokemon.ts#Pokemon.canSetStatus",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#sun-abilities",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#tag-abilities",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#type-fixed",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#unsuppressable",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#variable-type",
      of: [
        "src/data/moves/move.ts#VariableMoveTypeAttr",
        "src/data/moves/move.ts#initMoves",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#weather-heals",
      of: [
        "src/data/moves/move.ts#sunnyHealRatioFunc",
        "src/data/moves/move.ts#shoreUpHealRatioFunc",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/40-learn.js#fixed-power", of: ["src/field/pokemon.ts#Pokemon.getBaseDamage"] },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#hustle-accuracy",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#stab-multiplier",
      of: [
        "src/field/pokemon.ts#Pokemon.calculateStabMultiplier",
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/40-learn.js#technician-boost",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/44-safari.js#base-hidden-ability-rate",
      of: [
        "src/data/balance/rates.ts#BASE_HIDDEN_ABILITY_RATE",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/44-safari.js#base-shiny-chance",
      of: [
        "src/data/balance/rates.ts#BASE_SHINY_CHANCE",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/44-safari.js#non-legend-paradox",
      of: [
        "src/data/balance/special-species-groups.ts#NON_LEGEND_PARADOX_POKEMON",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/44-safari.js#safari-mons",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#NUM_SAFARI_ENCOUNTERS",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/44-safari.js#safari-event-chance",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#summonSafariPokemon",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/44-safari.js#rand-seed-item", of: ["src/utils/common.ts#randSeedItem"] },
    { ours: "skills/coachemon/scripts/hud/44-safari.js#rand-seed-int", of: ["src/utils/common.ts#randSeedInt"] },
    {
      ours: "skills/coachemon/scripts/hud/44-safari.js#safari-species",
      of: [
        "src/data/mystery-encounters/utils/encounter-pokemon-utils.ts#getRandomSpeciesByStarterCost",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#getSafariSpeciesSpawn",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/45-catch.js#balls", of: ["src/data/pokeball.ts#getPokeballCatchMultiplier"] },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#status-mult",
      of: [
        "src/data/status-effect.ts#getStatusEffectCatchRateMultiplier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#dex-attr",
      of: [
        "src/field/pokemon.ts#Pokemon.getDexAttr",
        "src/enums/dex-attr.ts#DexAttr",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#catch-candy",
      of: [
        "src/system/game-data.ts#GameData.setPokemonSpeciesCaught",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#capture-chance",
      of: [
        "src/phases/attempt-capture-phase.ts#AttemptCapturePhase.start",
        "src/data/pokeball.ts#getCriticalCaptureChance",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#crit-factor-of",
      of: [
        "src/data/pokeball.ts#getCriticalCaptureChance",
        "src/modifier/modifier.ts#CriticalCatchChanceBoosterModifier.apply",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#status-heal-chance",
      of: [
        "src/modifier/modifier.ts#EnemyStatusEffectHealChanceModifier.constructor",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/45-catch.js#limited-catch",
      of: [
        "src/data/challenge.ts#LimitedCatchChallenge.applyPokemonAddToParty",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#bait-flees",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SafariZoneEncounter",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeFleeStage",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeCatchStage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#bug-tutors",
      of: [
        "src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#PHYSICAL_TUTOR_MOVES",
        "src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#SPECIAL_TUTOR_MOVES",
        "src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#STATUS_TUTOR_MOVES",
        "src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#MISC_TUTOR_MOVES",
        "src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#BugTypeSuperfanEncounter",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#challenger-rewards",
      of: [
        "src/data/mystery-encounters/encounters/mysterious-challengers-encounter.ts#MysteriousChallengersEncounter",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#disabled-modes",
      of: [
        "src/ui/handlers/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.processInput",
        "src/ui/handlers/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.unblockInput",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#names",
      of: [
        "src/enums/mystery-encounter-type.ts#MysteryEncounterType",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#overrides",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SafariZoneEncounter",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeFleeStage",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeCatchStage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#rare-biomes",
      of: [
        "src/data/balance/biomes/mountain.ts#biomeLinks",
        "src/data/balance/biomes/factory.ts#biomeLinks",
        "src/data/balance/biomes/cave.ts#biomeLinks",
        "src/data/balance/biomes/abyss.ts#biomeLinks",
        "src/data/balance/biomes/fairy-cave.ts#biomeLinks",
        "src/data/balance/biomes/meadow.ts#biomeLinks",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#rules",
      of: [
        "src/data/mystery-encounters/encounters/training-session-encounter.ts#TrainingSessionEncounter",
        "src/data/mystery-encounters/encounters/the-pokemon-salesman-encounter.ts#ThePokemonSalesmanEncounter",
        "src/data/mystery-encounters/encounters/the-pokemon-salesman-encounter.ts#MAX_POKEMON_PRICE_MULTIPLIER",
        "src/data/mystery-encounters/encounters/trash-to-treasure-encounter.ts#TrashToTreasureEncounter",
        "src/data/mystery-encounters/encounters/trash-to-treasure-encounter.ts#SHOP_ITEM_COST_MULTIPLIER",
        "src/data/mystery-encounters/encounters/clowning-around-encounter.ts#ClowningAroundEncounter",
        "src/data/mystery-encounters/encounters/the-expert-pokemon-breeder-encounter.ts#TheExpertPokemonBreederEncounter",
        "src/data/mystery-encounters/encounters/dark-deal-encounter.ts#DarkDealEncounter",
        "src/data/mystery-encounters/encounters/a-trainers-test-encounter.ts#ATrainersTestEncounter",
        "src/data/mystery-encounters/encounters/weird-dream-encounter.ts#WeirdDreamEncounter",
        "src/data/mystery-encounters/encounters/weird-dream-encounter.ts#PERCENT_LEVEL_LOSS_ON_REFUSE",
        "src/data/mystery-encounters/encounters/the-winstrate-challenge-encounter.ts#TheWinstrateChallengeEncounter",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#MysteriousChestEncounter",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#RAND_LENGTH",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#TRAP_PERCENT",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#COMMON_REWARDS_PERCENT",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#ULTRA_REWARDS_PERCENT",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#ROGUE_REWARDS_PERCENT",
        "src/data/mystery-encounters/encounters/mysterious-chest-encounter.ts#MASTER_REWARDS_PERCENT",
        "src/data/mystery-encounters/encounters/fight-or-flight-encounter.ts#FightOrFlightEncounter",
        "src/data/mystery-encounters/encounters/department-store-sale-encounter.ts#DepartmentStoreSaleEncounter",
        "src/data/mystery-encounters/encounters/shady-vitamin-dealer-encounter.ts#ShadyVitaminDealerEncounter",
        "src/data/mystery-encounters/encounters/shady-vitamin-dealer-encounter.ts#VITAMIN_DEALER_CHEAP_PRICE_MULTIPLIER",
        "src/data/mystery-encounters/encounters/shady-vitamin-dealer-encounter.ts#VITAMIN_DEALER_EXPENSIVE_PRICE_MULTIPLIER",
        "src/data/mystery-encounters/encounters/lost-at-sea-encounter.ts#LostAtSeaEncounter",
        "src/data/mystery-encounters/encounters/lost-at-sea-encounter.ts#DAMAGE_PERCENTAGE",
        "src/data/mystery-encounters/encounters/fiery-fallout-encounter.ts#FieryFalloutEncounter",
        "src/data/mystery-encounters/encounters/fiery-fallout-encounter.ts#DAMAGE_PERCENTAGE",
        "src/data/mystery-encounters/encounters/the-strong-stuff-encounter.ts#TheStrongStuffEncounter",
        "src/data/mystery-encounters/encounters/the-strong-stuff-encounter.ts#HIGH_BST_REDUCTION_VALUE",
        "src/data/mystery-encounters/encounters/the-strong-stuff-encounter.ts#BST_INCREASE_VALUE",
        "src/data/mystery-encounters/encounters/berries-abound-encounter.ts#BerriesAboundEncounter",
        "src/data/mystery-encounters/encounters/part-timer-encounter.ts#PartTimerEncounter",
        "src/data/mystery-encounters/encounters/part-timer-encounter.ts#applyMoneyMultipliers",
        "src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#TeleportingHijinksEncounter",
        "src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#MONEY_COST_MULTIPLIER",
        "src/data/mystery-encounters/encounters/uncommon-breed-encounter.ts#UncommonBreedEncounter",
        "src/data/mystery-encounters/encounters/global-trade-system-encounter.ts#GlobalTradeSystemEncounter",
        "src/data/mystery-encounters/encounters/mysterious-challengers-encounter.ts#MysteriousChallengersEncounter",
        "src/data/mystery-encounters/encounters/slumbering-snorlax-encounter.ts#SlumberingSnorlaxEncounter",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SafariZoneEncounter",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SAFARI_MONEY_MULTIPLIER",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#NUM_SAFARI_ENCOUNTERS",
        "src/data/mystery-encounters/encounters/delibirdy-encounter.ts#DelibirdyEncounter",
        "src/data/mystery-encounters/encounters/delibirdy-encounter.ts#DELIBIRDY_MONEY_PRICE_MULTIPLIER",
        "src/data/mystery-encounters/encounters/absolute-avarice-encounter.ts#AbsoluteAvariceEncounter",
        "src/data/mystery-encounters/encounters/dancing-lessons-encounter.ts#DancingLessonsEncounter",
        "src/data/mystery-encounters/encounters/bug-type-superfan-encounter.ts#BugTypeSuperfanEncounter",
        "src/data/mystery-encounters/encounters/fun-and-games-encounter.ts#FunAndGamesEncounter",
        "src/data/mystery-encounters/encounters/fun-and-games-encounter.ts#handleNextTurn",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#teleport-biomes",
      of: [
        "src/data/mystery-encounters/encounters/teleporting-hijinks-encounter.ts#BIOME_CANDIDATES",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#safari-catch",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#throwPokeball",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#safari-flee",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#isPokemonFlee",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/46-encounter.js#safari-play",
      of: [
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#SafariZoneEncounter",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeFleeStage",
        "src/data/mystery-encounters/encounters/safari-zone-encounter.ts#tryChangeCatchStage",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#boss-cuts",
      of: [
        "src/field/arena.ts#Arena.generateBossBiomeTier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#boss-pool-tiers",
      of: [
        "src/field/arena.ts#Arena.generateBossBiomeTier",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/47-biome.js#catch-tier", of: ["src/enums/biome-pool-tier.ts#BiomePoolTier"] },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#evo-spread",
      of: [
        "src/ai/ai-species-gen.ts#STRONG_LEVEL_DIFF_PERCENT",
        "src/ai/ai-species-gen.ts#NORMAL_TRAINER_LEVEL_DIFF_PERCENT",
        "src/ai/ai-species-gen.ts#WILD_LEVEL_DIFF_PERCENT",
        "src/enums/evo-level-threshold-kind.ts#EvoLevelThresholdKind",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#daily-forced-biomes",
      of: [
        "src/data/daily-seed/daily-run.ts#getDailyForcedBiomes",
        "src/phases/select-biome-phase.ts#SelectBiomePhase.start",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#pool-tiers",
      of: [
        "src/field/arena.ts#Arena.generateNonBossBiomeTier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#rare-onward",
      of: [
        "src/data/balance/biomes/mountain.ts#biomeLinks",
        "src/data/balance/biomes/factory.ts#biomeLinks",
        "src/data/balance/biomes/cave.ts#biomeLinks",
        "src/data/balance/biomes/abyss.ts#biomeLinks",
        "src/data/balance/biomes/fairy-cave.ts#biomeLinks",
        "src/data/balance/biomes/meadow.ts#biomeLinks",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#tier-cuts",
      of: [
        "src/field/arena.ts#Arena.generateNonBossBiomeTier",
        "src/field/trainer.ts#Trainer.genNewPartyMemberSpecies",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#trainer-pool-tiers",
      of: [
        "src/field/trainer.ts#Trainer.genNewPartyMemberSpecies",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/47-biome.js#trainer-boss", of: ["src/game-mode.ts#GameMode.isTrainerBoss"] },
    { ours: "skills/coachemon/scripts/hud/47-biome.js#legal-at", of: ["src/field/arena.ts#Arena.checkLegendBST"] },
    { ours: "skills/coachemon/scripts/hud/47-biome.js#pool-tier-roll-max", of: ["src/field/arena.ts#Arena.randomSpecies"] },
    {
      ours: "skills/coachemon/scripts/hud/47-biome.js#random-boss-chance",
      of: [
        "src/battle-scene.ts#BattleScene.getEncounterBossSegments",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/47-biome.js#time-of-day-at", of: ["src/field/arena.ts#Arena.getTimeOfDay"] },
    {
      ours: "skills/coachemon/scripts/hud/48-preview.js#needed",
      of: [
        "src/battle-scene.ts#BattleScene.executeWithSeedOffset",
        "src/battle-scene.ts#BattleScene.isWaveMysteryEncounter",
        "src/battle-scene.ts#BattleScene.generateNewBattleTrainer",
        "src/battle-scene.ts#BattleScene.checkIsDouble",
        "src/battle-scene.ts#BattleScene.getEncounterBossSegments",
        "src/battle-scene.ts#BattleScene.addEnemyPokemon",
        "src/battle-scene.ts#BattleScene.getMysteryEncounter",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/48-preview.js#new-battle-replay",
      of: [
        "src/battle-scene.ts#BattleScene.newBattle",
        "src/battle-scene.ts#BattleScene.handleFixedBattle",
        "src/phases/encounter-phase.ts#EncounterPhase.start",
        "src/phases/encounter-phase.ts#EncounterPhase.isEncounterShinyLocked",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/48-preview.js#rand-seed-int", of: ["src/utils/common.ts#randSeedInt"] },
    { ours: "skills/coachemon/scripts/hud/48-preview.js#wave-seed-of", of: ["src/utils/common.ts#shiftCharCodes"] },
    {
      ours: "skills/coachemon/scripts/hud/49-ahead.js#double-abilities",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
        "src/data/abilities/ab-attrs.ts#DoubleBattleChanceAbAttr",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/49-ahead.js#eternatus-facts",
      of: [
        "src/field/pokemon.ts#EnemyPokemon.generateAndPopulateMoveset",
        "src/field/pokemon.ts#EnemyPokemon.damage",
        "src/battle-scene.ts#BattleScene.initFinalBossPhaseTwo",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/49-ahead.js#grunt-double", of: ["src/battle.ts#getRandomTrainerFunc"] },
    {
      ours: "skills/coachemon/scripts/hud/49-ahead.js#luck-grades",
      of: [
        "src/modifier/modifier-type.ts#getLuckString",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/49-ahead.js#double-odds",
      of: [
        "src/battle-scene.ts#BattleScene.checkIsDouble",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/49-ahead.js#upgrade-chance",
      of: [
        "src/modifier/modifier-type.ts#getNewModifierTypeOption",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/49-fusion.js#bst-pair",
      of: [
        "src/field/pokemon.ts#Pokemon.calculateBaseStats",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/50-audit.js#atk-doubled",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/50-audit.js#exp-classes",
      of: [
        "src/modifier/modifier.ts#ExpBoosterModifier",
        "src/modifier/modifier.ts#ExpShareModifier",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/50-audit.js#priority-abilities",
      of: [
        "src/data/abilities/init-abilities.ts#initAbilities",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/50-audit.js#status-immune",
      of: [
        "src/field/pokemon.ts#Pokemon.canSetStatus",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/51-items.js#berry-names", of: ["src/enums/berry-type.ts#BerryType"] },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#field-abilities",
      of: [
        "src/modifier/init-modifier-pools.ts#initUltraModifierPool",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#field-moves",
      of: [
        "src/modifier/init-modifier-pools.ts#initUltraModifierPool",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#held",
      of: [
        "src/modifier/modifier-type.ts#modifierTypeInitObj",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#leek-species",
      of: [
        "src/modifier/modifier-type.ts#modifierTypeInitObj",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#orb",
      of: [
        "src/modifier/init-modifier-pools.ts#initUltraModifierPool",
        "src/field/pokemon.ts#Pokemon.canSetStatus",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#species-boosters",
      of: [
        "src/modifier/modifier-type.ts#SpeciesStatBoosterModifierTypeGenerator.items",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-items.js#status-abilities",
      of: [
        "src/modifier/init-modifier-pools.ts#initUltraModifierPool",
      ],
    },
    { ours: "skills/coachemon/scripts/hud/51-items.js#cap-of", of: ["src/battle-scene.ts#BattleScene.getMaxExpLevel"] },
    {
      ours: "skills/coachemon/scripts/hud/51-starters.js#ability-randomizer",
      of: [
        "src/data/challenge.ts#AbilityRandomizerChallenge.applySpeciesAbilityModify",
        "src/data/challenge.ts#AbilityRandomizerChallenge.applyPassiveAbilityModify",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-starters.js#moveset-randomizer-evolutions",
      of: [
        "src/data/challenge.ts#MovesetRandomizerChallenge.applyModifyEvolutions",
        "src/data/challenge.ts#MovesetRandomizerChallenge.applyLevelUpMoveset",
        "src/field/pokemon.ts#Pokemon.getEvolution",
      ],
    },
    {
      ours: "skills/coachemon/scripts/hud/51-starters.js#dex-attr-luck",
      of: [
        "src/system/game-data.ts#GameData.getDexAttrLuck",
      ],
    },
    { ours: "skills/coachemon/scripts/probe.js#cats", of: ["src/enums/move-category.ts#MoveCategory"] },
    { ours: "skills/coachemon/scripts/probe.js#stats", of: ["src/enums/stat.ts#Stat"] },
  ],
};
