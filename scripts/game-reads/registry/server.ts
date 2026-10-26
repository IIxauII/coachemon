import type { Area } from "../types.ts";

export const SERVER: Area = {
  reads: [
    { name: "EncounterPhase", kind: "phase", at: ["src/phases/encounter-phase.ts#EncounterPhase"] },
    { name: "NextEncounterPhase", kind: "phase", at: ["src/phases/next-encounter-phase.ts#NextEncounterPhase"] },
    {
      name: "NewBiomeEncounterPhase",
      kind: "phase",
      at: ["src/phases/new-biome-encounter-phase.ts#NewBiomeEncounterPhase"],
    },
    { name: "GameOverPhase", kind: "phase", at: ["src/phases/game-over-phase.ts#GameOverPhase"] },
    { name: "LoginPhase", kind: "phase", at: ["src/phases/login-phase.ts#LoginPhase"] },
    { name: "SelectStarterPhase", kind: "phase", at: ["src/phases/select-starter-phase.ts#SelectStarterPhase"] },
  ],
  sets: [
    {
      at: "src/enums/ui-mode.ts#UiMode",
      known: [
        "MESSAGE", "TITLE", "COMMAND", "FIGHT", "BALL", "TARGET_SELECT", "MODIFIER_SELECT", "SAVE_SLOT", "PARTY",
        "SUMMARY", "STARTER_SELECT", "EVOLUTION_SCENE", "EGG_HATCH_SCENE", "EGG_HATCH_SUMMARY", "CONFIRM",
        "OPTION_SELECT", "MENU", "MENU_OPTION_SELECT", "SETTINGS_DISPLAY", "SETTINGS_AUDIO", "SETTINGS_GAMEPAD",
        "GAMEPAD_BINDING", "SETTINGS_KEYBOARD", "KEYBOARD_BINDING", "ACHIEVEMENTS", "GAME_STATS", "EGG_LIST",
        "EGG_GACHA", "POKEDEX", "POKEDEX_SCAN", "POKEDEX_PAGE", "LOGIN_OR_REGISTER", "LOGIN_FORM", "REGISTRATION_FORM",
        "LOADING", "UNAVAILABLE", "CHALLENGE_SELECT", "RENAME_POKEMON", "RENAME_RUN", "RUN_HISTORY", "RUN_INFO",
        "TEST_DIALOGUE", "AUTO_COMPLETE", "ADMIN", "MYSTERY_ENCOUNTER", "CHANGE_PASSWORD_FORM", "ALERT_MODAL",
        "SETTINGS_GENERAL",
      ],
      handledIn: ["src/screen.ts", "src/escape-ladder/table.ts", "src/page/menu.ts"],
    },
    {
      at: "src/enums/party-ui-mode.ts#PartyUiMode",
      known: [
        "SWITCH", "FAINT_SWITCH", "POST_BATTLE_SWITCH", "REVIVAL_BLESSING", "MODIFIER", "MOVE_MODIFIER", "TM_MODIFIER",
        "REMEMBER_MOVE_MODIFIER", "MODIFIER_TRANSFER", "SPLICE", "RELEASE", "CHECK", "SELECT", "DISCARD",
        "EVOLUTION_ITEM_MODIFIER", "FORM_CHANGE_ITEM_MODIFIER",
      ],
      handledIn: ["src/screen.ts", "src/escape-ladder/lookup.ts"],
    },
  ],
  mirrors: [
    {
      ours: "src/driver.ts#overwrite-confirm-yes",
      of: [
        "src/ui/handlers/confirm-ui-handler.ts#ConfirmUiHandler.show",
        "src/ui/handlers/save-slot-select-ui-handler.ts#SaveSlotSelectUiHandler.processInput",
      ],
    },
    {
      ours: "src/driver.ts#save-slot-count",
      of: [
        "src/ui/handlers/save-slot-select-ui-handler.ts#SESSION_SLOTS_COUNT",
      ],
    },
    {
      ours: "src/driver.ts#starter-add-option",
      of: [
        "src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.openPokemonMenu",
      ],
    },
    { ours: "src/driver.ts#starter-party-max", of: ["src/constants.ts#PLAYER_PARTY_MAX_SIZE"] },
    {
      ours: "src/driver.ts#submit-confirm-yes",
      of: [
        "src/ui/handlers/confirm-ui-handler.ts#ConfirmUiHandler.show",
        "src/ui/handlers/starter-select-ui-handler.ts#StarterSelectUiHandler.tryStart",
      ],
    },
    { ours: "src/driver.ts#title-classic", of: ["src/phases/title-phase.ts#TitlePhase.showOptions"] },
    { ours: "src/driver.ts#title-new-game", of: ["src/phases/title-phase.ts#TitlePhase.showOptions"] },
    { ours: "src/game/save.ts#salted", of: ["src/utils/data.ts#encrypt"] },
    { ours: "src/game/save.ts#save-key", of: ["src/constants.ts#saveKey"] },
    { ours: "src/screen.ts#settings-mode-range", of: ["src/enums/ui-mode.ts#UiMode"] },
    {
      ours: "src/solver/replay.ts#ended-arena-fields",
      of: [
        "src/field/arena.ts#Arena.trySetWeather",
        "src/field/arena.ts#Arena.trySetTerrain",
        "src/system/game-data.ts#GameData.initSessionFromData",
      ],
    },
    { ours: "src/solver/replay.ts#load-defaults", of: ["src/field/pokemon.ts#Pokemon.constructor"] },
    {
      ours: "src/solver/extras.ts#classic-final-boss",
      of: ["src/battle.ts#Battle.isClassicFinalBoss", "src/game-mode.ts#GameMode.isWaveFinal", "src/game-mode.ts#getGameMode"],
    },
  ],
};
