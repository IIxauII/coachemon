/**
 * The escape ladder: for every screen, the ordered rungs that leave it.
 *
 * HAND-CURATED. Every claim was read at the pinned ref in `reviewed.json`
 * (PokéRogue v1.12.0.11 / e4e9b53) unless tagged `live`. Do not generate this
 * file: the classification is judgement over deep if/else chains gated on
 * runtime flags, and a classifier that gets `popStarter` wrong eats the team.
 * What is automated is the check — `npm run drift:check` hashes every `deps`
 * method and refuses a pin bump until each moved entry is re-read.
 *
 * Keys are the v1 tool surface's composite screen ids. Lookup falls back
 * `MODE/DISCRIMINATOR:options` → `MODE:options` → `MODE/DISCRIMINATOR` → `MODE`.
 *
 * Rungs are ordered safest first. The terminal reload is appended by the
 * lookup and is not listed here. Rules every entry obeys (#13):
 *   - no rung presses `MENU` — it never reaches a handler, and from
 *     STARTER_SELECT / POKEDEX_PAGE it is re-routed to a confirm;
 *   - no rung calls `ui.revertMode()` — it clears the handler without invoking
 *     the pending continuation and manufactures a hung phase;
 *   - no rung enters Settings — six settings reset the run on leaving.
 */
import type { Entry, Rung } from "./types.ts";

const H = "src/ui/handlers";

/** Must-answer screens: pick an option not yet tried on this fingerprint. */
const pickUntried = (discards: string): Rung => ({
  do: "select_untried_option",
  risk: "lossy",
  discards,
  effect: "choose an option not yet tried on this fingerprint; the report lists tried vs untried labels",
  provenance: "source",
});

const cancelExits = (effect: string, provenance: "source" | "live" = "source"): Rung => ({
  do: "press",
  button: "CANCEL",
  risk: "safe",
  effect,
  provenance,
});

/** Form modals: `SUBMIT` fires `submitAction`; every other button returns false. Mouse buttons are `config.buttonActions[i]`. */
const formModal = (mode: number, handler: string, file: `${string}.ts`, cancelIndex: number | null, onRunPath = false): Entry => ({
  mode,
  handler,
  class: "ladder",
  onRunPath,
  cancel: {
    effect: "rejected",
    provenance: "source",
    note: "FormModalUiHandler.processInput returns false for every button except SUBMIT",
  },
  rungs: [
    ...(cancelIndex === null
      ? []
      : [
          {
            do: "modal_button_action",
            index: cancelIndex,
            risk: "safe",
            effect: "the form's own Cancel / Go Back button, which the game wires to pointerdown only",
            provenance: "source",
          } as const,
        ]),
    {
      do: "press",
      button: "SUBMIT",
      risk: "lossy",
      discards: "commits whatever the form currently holds",
      effect: "fires submitAction",
      provenance: "source",
    },
  ],
  deps: [
    `${H}/form-modal-ui-handler.ts#FormModalUiHandler.processInput`,
    `${H}/${file}#${handler}.getButtonLabels`,
  ],
});

const PARTY_DEPS = [
  `${H}/party-ui-handler.ts#PartyUiHandler.processInput`,
  `${H}/party-ui-handler.ts#PartyUiHandler.processPartyCancelInput`,
  `${H}/party-ui-handler.ts#PartyUiHandler.allowCancel`,
] as const;

/** PARTY opened by the shop for a targeted reward: the callback resets MODIFIER_SELECT. */
const partyFromShop = (mode: number, provenance: "source" | "live"): Entry => ({
  mode,
  handler: "PartyUiHandler",
  class: "ladder",
  onRunPath: true,
  cancel: {
    effect: "exits",
    provenance,
    note:
      "selectCallback(6, CANCEL) → SelectModifierPhase resets MODIFIER_SELECT. It does NOT satisfy the shop: " +
      "re-picking the same reward is #6's 147-iteration loop, a policy bug. To leave the shop, CANCEL on MODIFIER_SELECT.",
  },
  rungs: [cancelExits("back to MODIFIER_SELECT with the reward still unchosen", provenance)],
  deps: [...PARTY_DEPS, "src/phases/select-modifier-phase.ts#SelectModifierPhase.start"],
});

export const LADDER = {
  MESSAGE: {
    mode: 0,
    handler: "BattleMessageUiHandler",
    class: "auto",
    onRunPath: true,
    cancel: {
      effect: "consents",
      provenance: "source",
      note: "CANCEL ≡ ACTION: both fire onActionInput, and only while awaitingActionInput && onActionInput",
    },
    rungs: [
      { do: "wait", risk: "safe", effect: "text still printing or no prompt shown yet", provenance: "live" },
      {
        do: "press",
        button: "ACTION",
        risk: "safe",
        effect: "advances a shown prompt",
        when: "onActionInput != null",
        provenance: "live",
      },
    ],
    deps: [`${H}/battle-message-ui-handler.ts#BattleMessageUiHandler.processInput`],
    note:
      "Frozen here with phaseName === EncounterPhase is #11's save-failure hang: onActionInput is null, no button " +
      "does anything, and only the reload remains. That verdict is the stuck detector's (#16), not this table's.",
  },

  TITLE: {
    mode: 1,
    handler: "TitleUiHandler",
    class: "must_answer",
    onRunPath: false,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note: "TitlePhase passes noCancel: true, so CANCEL returns false. Corrects spec §5, which had selects_last_option.",
    },
    rungs: [pickUntried("depends on the option: New Game / Load Game / Run History / Settings (never Settings)")],
    deps: [
      `${H}/base-option-select-ui-handler.ts#BaseOptionSelectUiHandler.processInput`,
      "src/phases/title-phase.ts#TitlePhase.showOptions",
    ],
  },

  COMMAND: {
    mode: 2,
    handler: "CommandUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "CommandPhase.cancel() only acts for fieldIndex > 0 (double battle, second slot): it re-queues both " +
        "CommandPhases so the first slot re-chooses. On the first slot it does nothing.",
    },
    rungs: [pickUntried("the turn: Fight / Ball / Pokémon / Run each commit or open a sub-screen")],
    deps: [
      `${H}/command-ui-handler.ts#CommandUiHandler.processInput`,
      "src/phases/command-phase.ts#CommandPhase.cancel",
    ],
  },

  FIGHT: {
    mode: 3,
    handler: "FightUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "back to COMMAND — rejected instead when a mystery encounter sets skipToFightInput",
    },
    rungs: [cancelExits("back to COMMAND"), pickUntried("the move used this turn")],
    deps: [`${H}/fight-ui-handler.ts#FightUiHandler.processInput`],
  },

  BALL: {
    mode: 4,
    handler: "BallUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: { effect: "exits", provenance: "source", note: "back to COMMAND" },
    rungs: [cancelExits("back to COMMAND")],
    deps: [`${H}/ball-ui-handler.ts#BallUiHandler.processInput`],
  },

  TARGET_SELECT: {
    mode: 5,
    handler: "TargetSelectUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "targetSelectCallback([]) discards the chosen move and the phase re-asks from COMMAND; nothing is spent",
    },
    rungs: [cancelExits("discard the move choice; COMMAND is asked again")],
    deps: [`${H}/target-select-ui-handler.ts#TargetSelectUiHandler.processInput`],
  },

  MODIFIER_SELECT: {
    mode: 6,
    handler: "ModifierSelectUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "asks_confirm",
      provenance: "source",
      note:
        "onActionInput(-1, -1) → 'skip item?' CONFIRM. Yes ends SelectModifierPhase with no reward; No resets the shop. " +
        "This is the exit #6's shop↔party loop never took. Gated on awaitingActionInput and this.player.",
    },
    rungs: [
      {
        do: "press",
        button: "CANCEL",
        risk: "safe",
        effect: "opens the skip-item CONFIRM; answering Yes there forfeits this wave's reward",
        provenance: "source",
      },
      pickUntried("a reward, or money for a shop item"),
    ],
    deps: [
      `${H}/modifier-select-ui-handler.ts#ModifierSelectUiHandler.processInput`,
      "src/phases/select-modifier-phase.ts#SelectModifierPhase.start",
    ],
  },

  SAVE_SLOT: {
    mode: 7,
    handler: "SaveSlotSelectUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "saveSlotSelectCallback(-1); what that means is the caller's — see SAVE_SLOT/SAVE and SAVE_SLOT/LOAD",
    },
    rungs: [],
    deps: [`${H}/save-slot-select-ui-handler.ts#SaveSlotSelectUiHandler.processInput`],
    note: "The base entry makes no rung claim: the discriminator (handler.uiMode) decides everything.",
  },

  "SAVE_SLOT/SAVE": {
    mode: 7,
    handler: "SaveSlotSelectUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "callback(-1) → toTitleScreen(): the starter selection is thrown away. No save is touched.",
    },
    rungs: [
      {
        do: "press",
        button: "CANCEL",
        risk: "lossy",
        discards: "the whole run setup (starters, game mode); no save slot is touched",
        effect: "back to the title screen",
        provenance: "source",
      },
    ],
    deps: [
      `${H}/save-slot-select-ui-handler.ts#SaveSlotSelectUiHandler.processInput`,
      "src/phases/select-starter-phase.ts#SelectStarterPhase.start",
      "src/phases/title-phase.ts#TitlePhase.initDailyRun",
    ],
    note: "ACTION on an occupied slot opens an overwrite CONFIRM whose Yes deletes that session — never a rung.",
  },

  "SAVE_SLOT/LOAD": {
    mode: 7,
    handler: "SaveSlotSelectUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: { effect: "exits", provenance: "source", note: "callback(-1) → TitlePhase re-shows its options" },
    rungs: [cancelExits("back to the title options")],
    deps: [
      `${H}/save-slot-select-ui-handler.ts#SaveSlotSelectUiHandler.processInput`,
      "src/phases/title-phase.ts#TitlePhase.showOptions",
    ],
    note: "ACTION opens Load / Rename / Delete / Cancel; Delete is destructive — never a rung.",
  },

  PARTY: {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "base entry is PARTY/SWITCH's behaviour; every other partyUiMode has its own entry",
    },
    rungs: [],
    deps: [...PARTY_DEPS],
    note: "The base entry makes no rung claim: partyUiMode decides everything.",
  },

  "PARTY:options": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "processOptionMenuInput: CANCEL always clearOptions() back to the slot grid, whatever partyUiMode",
    },
    rungs: [cancelExits("close the per-slot verb list, back to the slot grid")],
    deps: [...PARTY_DEPS, `${H}/party-ui-handler.ts#PartyUiHandler.processOptionMenuInput`],
  },

  "PARTY/SWITCH": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: { effect: "exits", provenance: "source", note: "no selectCallback from COMMAND → setMode(COMMAND)" },
    rungs: [cancelExits("back to COMMAND")],
    deps: [...PARTY_DEPS, `${H}/command-ui-handler.ts#CommandUiHandler.processInput`],
  },

  "PARTY/FAINT_SWITCH": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "allowCancel() is false: processPartyCancelInput skips both branches and returns true having done nothing — " +
        "not even playError(). Never observed live.",
    },
    rungs: [pickUntried("which party member is sent out")],
    deps: [...PARTY_DEPS, "src/phases/switch-phase.ts#SwitchPhase.start"],
  },

  "PARTY/POST_BATTLE_SWITCH": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "callback(6, CANCEL): slot 6 is not a party slot, so no switch is queued and the phase ends",
    },
    rungs: [cancelExits("decline the switch; the phase ends")],
    deps: [...PARTY_DEPS, "src/phases/switch-phase.ts#SwitchPhase.start"],
  },

  "PARTY/REVIVAL_BLESSING": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note: "allowCancel() is false: returns true having done nothing. Never observed live.",
    },
    rungs: [pickUntried("which fainted member is revived")],
    deps: [...PARTY_DEPS, "src/phases/revival-blessing-phase.ts#RevivalBlessingPhase.start"],
  },

  "PARTY/MODIFIER": partyFromShop(8, "live"),
  "PARTY/MOVE_MODIFIER": partyFromShop(8, "source"),
  "PARTY/TM_MODIFIER": partyFromShop(8, "source"),
  "PARTY/REMEMBER_MOVE_MODIFIER": partyFromShop(8, "source"),

  "PARTY/MODIFIER_TRANSFER": {
    ...partyFromShop(8, "source"),
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "first CANCEL clears an in-progress transfer (transferMode); the next returns to MODIFIER_SELECT",
    },
    rungs: [cancelExits("clear the pending transfer, then back to MODIFIER_SELECT")],
  },

  "PARTY/SPLICE": {
    ...partyFromShop(8, "source"),
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "first CANCEL clears a half-chosen splice (transferMode); the next returns to MODIFIER_SELECT",
    },
    rungs: [cancelExits("clear the half-chosen splice, then back to MODIFIER_SELECT")],
  },

  "PARTY/RELEASE": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "reopens",
      provenance: "source",
      note:
        "callback(6) → promptRelease() asks again. The one genuine 'reopens' in the codebase. " +
        "Declining at that prompt instead gives up the just-caught Pokémon.",
    },
    rungs: [pickUntried("a party member is released, or the new catch is given up at the re-asked prompt")],
    deps: [...PARTY_DEPS, "src/phases/attempt-capture-phase.ts#AttemptCapturePhase.catch"],
  },

  "PARTY/CHECK": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "view-only; the callback returns to MODIFIER_SELECT or MYSTERY_ENCOUNTER",
    },
    rungs: [cancelExits("back to the screen that opened the party view")],
    deps: [
      ...PARTY_DEPS,
      "src/phases/select-modifier-phase.ts#SelectModifierPhase.start",
      `${H}/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.processInput`,
    ],
  },

  "PARTY/SELECT": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note:
        "mystery-encounter party pick: slot 6 ≥ party length → onPokemonNotSelected, back to the encounter. " +
        "Corrects the spec's must-answer partition, which listed 12.",
    },
    rungs: [cancelExits("back to the mystery encounter with nobody chosen")],
    deps: [
      ...PARTY_DEPS,
      "src/data/mystery-encounters/utils/encounter-phase-utils.ts#selectPokemonForOption",
    ],
  },

  "PARTY/DISCARD": {
    mode: 8,
    handler: "PartyUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "no phase opens it directly; it is toggled from inside the party screen and CANCEL takes the ordinary path",
    },
    rungs: [cancelExits("leave discard mode through the ordinary cancel path")],
    deps: [...PARTY_DEPS],
  },

  SUMMARY: {
    mode: 9,
    handler: "SummaryUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: {
      effect: "exits",
      provenance: "live",
      note:
        "CANCEL is the only exit: back to PARTY if it opened from there, else MESSAGE. Inside the move list the first " +
        "CANCEL only closes the list. ACTION has nothing to commit (#8: rejected 26×, prose only).",
    },
    rungs: [cancelExits("back to PARTY (or MESSAGE)", "live")],
    deps: [
      `${H}/summary-ui-handler.ts#SummaryUiHandler.processInput`,
      `${H}/summary-ui-handler.ts#SummaryUiHandler.hideMoveSelect`,
    ],
  },

  "SUMMARY/LEARN_MOVE": {
    mode: 9,
    handler: "SummaryUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "asks_confirm",
      provenance: "source",
      note:
        "hideMoveSelect() → moveSelectFunction(4) → rejectMoveAndEnd: 'stop trying to teach?' CONFIRM, or straight to " +
        "'did not learn' when hideMoveSkipConfirm is set.",
    },
    rungs: [
      {
        do: "press",
        button: "CANCEL",
        risk: "lossy",
        discards: "the new move is not learned (a CONFIRM asks first unless hideMoveSkipConfirm)",
        effect: "decline the move",
        provenance: "source",
      },
      pickUntried("an existing move is forgotten to make room"),
    ],
    deps: [
      `${H}/summary-ui-handler.ts#SummaryUiHandler.processInput`,
      `${H}/summary-ui-handler.ts#SummaryUiHandler.hideMoveSelect`,
      "src/phases/learn-move-phase.ts#LearnMovePhase.rejectMoveAndEnd",
    ],
  },

  STARTER_SELECT: {
    mode: 10,
    handler: "StarterSelectUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "A cascade, first match wins: open filter dropdown → close it; filter column non-default → RESET the dev's " +
        "persisted filter; statsMode → leave it; team non-empty → popStarter() removes the last member, no confirm; " +
        "team empty → tryExit() asks a CONFIRM. `rejected` is a placeholder: the effect is never uniform, which is why " +
        "start_run owns this screen and never presses CANCEL on it.",
    },
    rungs: [
      {
        do: "press",
        button: "CANCEL",
        risk: "lossy",
        discards: "the run setup — after the CONFIRM, back to title (or challenge select)",
        effect: "tryExit() CONFIRM",
        when: "team empty, not filterMode, not statsMode",
        provenance: "source",
      },
      {
        do: "press",
        button: "CANCEL",
        risk: "destructive",
        discards: "the last team member (popStarter), or the dev's persisted filter column in filter mode",
        effect: "one press, one loss, no confirmation",
        when: "team non-empty, or filterMode with a non-default column",
        provenance: "source",
      },
    ],
    deps: [
      `${H}/starter-select-ui-handler.ts#StarterSelectUiHandler.processInput`,
      `${H}/starter-select-ui-handler.ts#StarterSelectUiHandler.popStarter`,
      `${H}/starter-select-ui-handler.ts#StarterSelectUiHandler.tryExit`,
    ],
  },

  EVOLUTION_SCENE: {
    mode: 11,
    handler: "EvolutionSceneUiHandler",
    class: "auto",
    onRunPath: true,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "while canCancel, the first CANCEL cancels the EVOLUTION, not the screen (then asks whether to pause " +
        "evolutions); afterwards CANCEL ≡ ACTION on prompts",
    },
    rungs: [
      { do: "wait", risk: "safe", effect: "the evolution animation plays out", provenance: "source" },
      {
        do: "press",
        button: "ACTION",
        risk: "safe",
        effect: "advances a shown prompt",
        when: "awaitingActionInput && onActionInput != null",
        provenance: "source",
      },
    ],
    deps: [
      `${H}/evolution-scene-ui-handler.ts#EvolutionSceneUiHandler.processInput`,
      "src/phases/evolution-phase.ts#EvolutionPhase.handleFailedEvolution",
    ],
    note: "CANCEL is deliberately not a rung: it forfeits the evolution to escape a screen that leaves on its own.",
  },

  EGG_HATCH_SCENE: {
    mode: 12,
    handler: "EggHatchSceneUiHandler",
    class: "auto",
    onRunPath: true,
    cancel: {
      effect: "consents",
      provenance: "source",
      note:
        "ACTION or CANCEL → EggHatchPhase.trySkip() (skips the animation), else delegates to the message handler. " +
        "Corrects #13, which listed this screen as no-escape.",
    },
    rungs: [
      { do: "wait", risk: "safe", effect: "the hatch plays out", provenance: "source" },
      { do: "press", button: "ACTION", risk: "safe", effect: "skip the animation via trySkip()", provenance: "source" },
    ],
    deps: [
      `${H}/egg-hatch-scene-ui-handler.ts#EggHatchSceneUiHandler.processInput`,
      "src/phases/egg-hatch-phase.ts#EggHatchPhase.trySkip",
    ],
  },

  EGG_HATCH_SUMMARY: {
    mode: 13,
    handler: "EggSummaryUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: { effect: "exits", provenance: "source", note: "ends EggSummaryPhase — rejected with playError while blockExit" },
    rungs: [cancelExits("end the egg summary", "source")],
    deps: [`${H}/egg-summary-ui-handler.ts#EggSummaryUiHandler.processInput`],
  },

  CONFIRM: {
    mode: 14,
    handler: "ConfirmUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "selects_last_option",
      provenance: "source",
      note:
        "CANCEL unblocks the anti-misclick delay AND selects 'No' in one press, where ACTION would be refused; " +
        "rejected when the config sets noCancel",
    },
    rungs: [pickUntried("whatever this Yes/No commits — read the preceding message before choosing")],
    deps: [
      `${H}/confirm-ui-handler.ts#ConfirmUiHandler.processInput`,
      `${H}/base-option-select-ui-handler.ts#BaseOptionSelectUiHandler.processInput`,
    ],
  },

  OPTION_SELECT: {
    mode: 15,
    handler: "OptionSelectUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "selects_last_option",
      provenance: "source",
      note:
        "moves to the last option and runs its handler; rejected when noCancel (unless options overflow maxOptions, " +
        "which selects the last option anyway)",
    },
    rungs: [pickUntried("whatever the chosen option's handler commits")],
    deps: [`${H}/base-option-select-ui-handler.ts#BaseOptionSelectUiHandler.processInput`],
  },

  MENU: {
    mode: 16,
    handler: "MenuUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: { effect: "exits", provenance: "source", note: "closes the pause menu (revertMode, else MESSAGE)" },
    rungs: [cancelExits("close the pause menu")],
    deps: [`${H}/menu-ui-handler.ts#MenuUiHandler.processInput`],
    note: "Contains Save & Quit and Settings; no rung selects an option here.",
  },

  MENU_OPTION_SELECT: {
    mode: 17,
    handler: "OptionSelectUiHandler",
    class: "must_answer",
    onRunPath: false,
    cancel: {
      effect: "selects_last_option",
      provenance: "source",
      note: "same handler as OPTION_SELECT; the save-slot manage menu's last option is Cancel",
    },
    rungs: [pickUntried("whatever the chosen option's handler commits")],
    deps: [`${H}/base-option-select-ui-handler.ts#BaseOptionSelectUiHandler.processInput`],
  },

  ...Object.fromEntries(
    (
      [
        ["SETTINGS", 18, "SettingsUiHandler"],
        ["SETTINGS_DISPLAY", 19, "SettingsDisplayUiHandler"],
        ["SETTINGS_AUDIO", 20, "SettingsAudioUiHandler"],
        ["SETTINGS_GAMEPAD", 21, "SettingsGamepadUiHandler"],
        ["SETTINGS_KEYBOARD", 23, "SettingsKeyboardUiHandler"],
      ] as const
    ).map(([name, mode, handler]): [string, Entry] => [
      name,
      {
        mode,
        handler,
        class: "ladder",
        onRunPath: false,
        cancel: {
          effect: "exits",
          provenance: "source",
          note: "revertMode back to the opener. Leaving after changing a requireReload setting resets the game (#11).",
        },
        rungs: [
          {
            do: "press",
            button: "CANCEL",
            risk: "destructive",
            discards:
              "the live run, if Language, UI Theme, Candy Upgrade Display, Time Of Day Widget, Sprite Set or " +
              "Battle Music was changed while inside",
            effect: "leave settings",
            provenance: "source",
          },
        ],
        deps:
          mode === 21 || mode === 23
            ? ["src/ui/settings/base-control-settings-ui-handler.ts#BaseControlSettingsUiHandler.processInput"]
            : ["src/ui/settings/base-settings-ui-handler.ts#BaseSettingsUiHandler.processInput"],
      },
    ]),
  ),

  ...Object.fromEntries(
    (
      [
        ["GAMEPAD_BINDING", 22, "GamepadBindingUiHandler"],
        ["KEYBOARD_BINDING", 24, "KeyboardBindingUiHandler"],
      ] as const
    ).map(([name, mode, handler]): [string, Entry] => [
      name,
      {
        mode,
        handler,
        class: "no_escape",
        onRunPath: false,
        cancel: {
          effect: "rejected",
          provenance: "source",
          note: "processInput returns false until a raw device key is captured; Button input cannot reach it",
        },
        rungs: [],
        deps: [`${H}/base-binding-ui-handler.ts#BaseBindingUiHandler.processInput`],
      },
    ]),
  ),

  ...Object.fromEntries(
    (
      [
        ["ACHIEVEMENTS", 25, "AchvsUiHandler", "achvs-ui-handler.ts"],
        ["GAME_STATS", 26, "GameStatsUiHandler", "game-stats-ui-handler.ts"],
        ["EGG_LIST", 27, "EggListUiHandler", "egg-list-ui-handler.ts"],
        ["RUN_HISTORY", 40, "RunHistoryUiHandler", "run-history-ui-handler.ts"],
        ["RUN_INFO", 41, "RunInfoUiHandler", "run-info-ui-handler.ts"],
      ] as const
    ).map(([name, mode, handler, file]): [string, Entry] => [
      name,
      {
        mode,
        handler,
        class: "ladder",
        onRunPath: false,
        cancel: {
          effect: "exits",
          provenance: "source",
          note: "the game's own revertMode back to the opener (these are opened by setOverlayMode, so it works)",
        },
        rungs: [cancelExits("back to the opener")],
        deps: [`${H}/${file}#${handler}.processInput`],
      },
    ]),
  ),

  EGG_GACHA: {
    mode: 28,
    handler: "EggGachaUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "mid-pull CANCEL speeds the animation; on the summary it hides it; otherwise revertMode",
    },
    rungs: [cancelExits("back to the opener (may take one press per pull animation / summary)")],
    deps: [`${H}/egg-gacha-ui-handler.ts#EggGachaUiHandler.processInput`],
  },

  POKEDEX: {
    mode: 29,
    handler: "PokedexUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "a cascade like STARTER_SELECT's: an open dropdown closes, a non-default filter column is RESET (the dev's " +
        "persisted prefs), and only then does CANCEL leave",
    },
    rungs: [
      {
        do: "press",
        button: "CANCEL",
        risk: "destructive",
        discards: "the dev's persisted Pokédex filter column, when in filter mode with a non-default value",
        effect: "leave the Pokédex",
        when: "not filterMode, or every filter column at default",
        provenance: "source",
      },
    ],
    deps: [`${H}/pokedex-ui-handler.ts#PokedexUiHandler.processInput`],
  },

  POKEDEX_SCAN: formModal(30, "PokedexScanUiHandler", "pokedex-scan-ui-handler.ts", 1),

  POKEDEX_PAGE: {
    mode: 31,
    handler: "PokedexPageUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "closes overlays/stats first, then pops to the previously viewed species, then leaves",
    },
    rungs: [cancelExits("back one species, or out of the page")],
    deps: [`${H}/pokedex-page-ui-handler.ts#PokedexPageUiHandler.processInput`],
    note: "MENU here is re-routed to buttonTouch — never press it.",
  },

  LOGIN_OR_REGISTER: formModal(32, "LoginOrRegisterUiHandler", "login-or-register-ui-handler.ts", null),
  LOGIN_FORM: formModal(33, "LoginFormUiHandler", "login-form-ui-handler.ts", 1),
  REGISTRATION_FORM: formModal(34, "RegistrationFormUiHandler", "registration-form-ui-handler.ts", 1),

  LOADING: {
    mode: 35,
    handler: "LoadingModalUiHandler",
    class: "auto",
    onRunPath: false,
    cancel: { effect: "rejected", provenance: "source", note: "ModalUiHandler.processInput returns false for every button" },
    rungs: [{ do: "wait", risk: "safe", effect: "the load finishes and the game changes mode", provenance: "source" }],
    deps: [`${H}/modal-ui-handler.ts#ModalUiHandler.processInput`],
  },

  UNAVAILABLE: {
    mode: 36,
    handler: "UnavailableModalUiHandler",
    class: "auto",
    onRunPath: true,
    cancel: { effect: "rejected", provenance: "source", note: "ModalUiHandler.processInput returns false for every button" },
    rungs: [
      {
        do: "wait",
        risk: "safe",
        effect: "the modal retries the server itself with exponential backoff and closes on reconnect",
        provenance: "source",
      },
    ],
    deps: [
      `${H}/modal-ui-handler.ts#ModalUiHandler.processInput`,
      `${H}/unavailable-modal-ui-handler.ts#UnavailableModalUiHandler.show`,
    ],
    note: "Corrects #13, which listed this as no-escape: no input leaves it, but it leaves on its own.",
  },

  CHALLENGE_SELECT: {
    mode: 37,
    handler: "GameChallengesUiHandler",
    class: "ladder",
    onRunPath: false,
    cancel: {
      effect: "exits",
      provenance: "source",
      note: "with the start cursor shown, CANCEL just hides it; otherwise toTitleScreen() with no confirmation",
    },
    rungs: [
      {
        do: "press",
        button: "CANCEL",
        risk: "lossy",
        discards: "the challenge setup — straight to title, no confirmation",
        effect: "back to title",
        provenance: "source",
      },
    ],
    deps: [`${H}/challenges-select-ui-handler.ts#GameChallengesUiHandler.processInput`],
  },

  RENAME_POKEMON: formModal(38, "RenameFormUiHandler", "rename-form-ui-handler.ts", 1, true),
  RENAME_RUN: formModal(39, "RenameRunFormUiHandler", "rename-run-ui-handler.ts", 1),

  TEST_DIALOGUE: formModal(42, "TestDialogueUiHandler", "test-dialogue-ui-handler.ts", 1),

  AUTO_COMPLETE: {
    mode: 43,
    handler: "AutoCompleteUiHandler",
    class: "must_answer",
    onRunPath: false,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note: "CANCEL and ACTION are explicitly swallowed (they are typing keys); SUBMIT selects",
    },
    rungs: [
      {
        do: "press",
        button: "SUBMIT",
        risk: "lossy",
        discards: "commits the highlighted suggestion",
        effect: "select the highlighted option",
        provenance: "source",
      },
    ],
    deps: [
      `${H}/autocomplete-ui-handler.ts#AutoCompleteUiHandler.processInput`,
      `${H}/base-option-select-ui-handler.ts#BaseOptionSelectUiHandler.processInput`,
    ],
  },

  ADMIN: {
    ...formModal(44, "AdminUiHandler", "admin-ui-handler.ts", 1),
    deps: [`${H}/admin-ui-handler.ts#AdminUiHandler.processInput`, `${H}/admin-ui-handler.ts#AdminUiHandler.getButtonLabels`],
  },

  MYSTERY_ENCOUNTER: {
    mode: 45,
    handler: "MysteryEncounterUiHandler",
    class: "must_answer",
    onRunPath: true,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "CANCEL enters an empty TODO branch. ACTION selects an option (disabled ones are refused). " +
        "Corrects #13, which listed this as no-escape: it is must-answer.",
    },
    rungs: [pickUntried("the encounter option's outcome")],
    deps: [`${H}/mystery-encounter-ui-handler.ts#MysteryEncounterUiHandler.processInput`],
  },

  CHANGE_PASSWORD_FORM: formModal(46, "ChangePasswordFormUiHandler", "change-password-form-ui-handler.ts", 1),

  ALERT_MODAL: {
    mode: 47,
    handler: "AlertModalUiHandler",
    class: "no_escape",
    onRunPath: true,
    cancel: {
      effect: "rejected",
      provenance: "source",
      note:
        "shown without closeDelay, allowClosing stays false forever: invalid-save and game-out-of-date alerts. " +
        "Out-of-date needs a reload onto the new build, and then the pin no longer matches.",
    },
    rungs: [],
    deps: [
      `${H}/alert-modal-ui-handler.ts#AlertModalUiHandler.processInput`,
      `${H}/alert-modal-ui-handler.ts#AlertModalUiHandler.show`,
    ],
  },

  "ALERT_MODAL/CLOSABLE": {
    mode: 47,
    handler: "AlertModalUiHandler",
    class: "ladder",
    onRunPath: true,
    cancel: { effect: "exits", provenance: "source", note: "once closeDelay elapses, any button closes it" },
    rungs: [cancelExits("close the alert")],
    deps: [
      `${H}/alert-modal-ui-handler.ts#AlertModalUiHandler.processInput`,
      `${H}/alert-modal-ui-handler.ts#AlertModalUiHandler.show`,
    ],
  },
} satisfies Record<string, Entry>;

/**
 * Behaviour every entry leans on, outside any one handler: the overlay and
 * tutorial gates in UI.processInput, and the MENU routing that disqualifies it.
 */
export const GLOBAL_DEPS = [
  "src/ui/ui.ts#UI.processInput",
  "src/ui/ui.ts#UI.revertMode",
  "src/ui-inputs.ts#UiInputs.buttonMenu",
  "src/ui/handlers/awaitable-ui-handler.ts#AwaitableUiHandler.processTutorialInput",
] as const;

export type ScreenKey = keyof typeof LADDER;
