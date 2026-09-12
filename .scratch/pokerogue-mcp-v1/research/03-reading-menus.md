# Research: reading menus generically

Ticket: `.scratch/pokerogue-mcp-v1/issues/03-reading-menus.md`
Date: 2026-09-12

**Primary source:** `github.com/pagefaultgames/pokerogue`, cloned and read at commit
`da1d0efff3c48b5b4f2b9eb448051793971999bd` (2026-09-12). All file paths below are
relative to that repo. Nothing here comes from a write-up; every claim cites the
file and symbol it was read from.

**Corroboration with the live site.** `src/enums/ui-mode.ts` lists `UiMode` with
`LOGIN_OR_REGISTER` at index 32, which matches the recon in `README.md`
(`scene.ui.mode === 32` on the login screen). `src/ui/ui.ts` constructs exactly 48
handlers, matching the recon's "48 registered". The pinned ref is therefore a safe
basis for the live build.

---

## 1. The invariant that makes this tractable

`UI.handlers` is a **positional array indexed by `UiMode`** — `src/ui/ui.ts`
constructs it in enum order and `getHandler()` is literally
`this.handlers[this._mode]`. So:

- `ui.mode` (int) fully determines which handler class is live. **Identify the
  menu by `ui.mode`, never by inspecting shape.**
- `ui.modeChain` is the stack of suspended modes (`setModeWithoutClear` pushes).

Every handler derives from `UiHandler` (`src/ui/handlers/ui-handler.ts`), which
gives three universal members:

```ts
protected cursor = 0;
public active = false;
getCursor(): number      // default: return this.cursor
setCursor(n): boolean    // default: assign + return whether it changed
processInput(button): boolean   // abstract
```

That is the **only** thing all 48 share. `cursor` is *not* universally an index
into a list of options — see §3 — and there is **no** base-class accessor for
"the options". Anything generic has to be built per family.

**Private fields are readable from CDP.** `private`/`protected` are TypeScript
compile-time only. More importantly, `vite.config.ts` sets
`output.keepNames: true`, `minify.mangle: { keepNames: true }` and
`compress.keepNames: { class: true, function: true }`, and property mangling is
not enabled. So in the shipped bundle every field name survives verbatim **and
`handler.constructor.name` is reliable** (useful as a cross-check, though `ui.mode`
remains the primary key).

### Class hierarchy

```
UiHandler                                  (cursor, active, getCursor, setCursor, processInput)
├── AwaitableUiHandler                      (awaitingActionInput, onActionInput, tutorialActive)
│   ├── MessageUiHandler                    (message, pendingPrompt, showText, showPrompt)
│   │   ├── BattleMessageUiHandler          MESSAGE
│   │   ├── MenuUiHandler                   MENU
│   │   ├── PartyUiHandler                  PARTY
│   │   ├── SaveSlotSelectUiHandler         SAVE_SLOT
│   │   ├── StarterSelectUiHandler          STARTER_SELECT
│   │   ├── AchvsUiHandler                  ACHIEVEMENTS
│   │   ├── EggListUiHandler                EGG_LIST
│   │   ├── EggGachaUiHandler               EGG_GACHA
│   │   ├── EggSummaryUiHandler             EGG_HATCH_SUMMARY
│   │   ├── EvolutionSceneUiHandler         EVOLUTION_SCENE
│   │   ├── RunHistoryUiHandler             RUN_HISTORY
│   │   ├── PokedexUiHandler                POKEDEX
│   │   ├── PokedexPageUiHandler            POKEDEX_PAGE
│   │   └── BaseSettingsUiHandler           SETTINGS_GENERAL/DISPLAY/AUDIO
│   │       ├── GeneralSettingsUiHandler
│   │       ├── SettingsDisplayUiHandler
│   │       └── SettingsAudioUiHandler
│   └── ModifierSelectUiHandler             MODIFIER_SELECT
├── BaseOptionSelectUiHandler                (config.options, fullCursor, scrollCursor, unskippedIndices)
│   ├── OptionSelectUiHandler               OPTION_SELECT, MENU_OPTION_SELECT
│   │   └── TitleUiHandler                  TITLE
│   ├── ConfirmUiHandler                    CONFIRM
│   └── AutoCompleteUiHandler               AUTO_COMPLETE
├── ModalUiHandler                           (buttonLabels[], buttonContainers[], NO cursor)
│   ├── AlertModalUiHandler                 ALERT_MODAL
│   ├── LoadingModalUiHandler               LOADING
│   ├── UnavailableModalUiHandler           UNAVAILABLE
│   └── FormModalUiHandler                   (inputs[]: rex InputText, formLabels[])
│       ├── AdminUiHandler                  ADMIN
│       ├── ChangePasswordFormUiHandler     CHANGE_PASSWORD_FORM
│       ├── PokedexScanUiHandler            POKEDEX_SCAN
│       ├── RenameFormUiHandler             RENAME_POKEMON
│       ├── RenameRunFormUiHandler          RENAME_RUN
│       ├── TestDialogueUiHandler           TEST_DIALOGUE
│       └── LoginRegisterInfoContainerUiHandler
│           ├── LoginOrRegisterUiHandler    LOGIN_OR_REGISTER
│           ├── RegistrationFormUiHandler   REGISTRATION_FORM
│           └── OAuthProvidersUiHandler
│               └── LoginFormUiHandler      LOGIN_FORM
├── CommandUiHandler                        COMMAND
├── FightUiHandler                          FIGHT
├── BallUiHandler                           BALL
├── TargetSelectUiHandler                   TARGET_SELECT
├── SummaryUiHandler                        SUMMARY
├── EggHatchSceneUiHandler                  EGG_HATCH_SCENE
├── GameStatsUiHandler                      GAME_STATS
├── RunInfoUiHandler                        RUN_INFO
├── GameChallengesUiHandler                 CHALLENGE_SELECT
├── MysteryEncounterUiHandler               MYSTERY_ENCOUNTER
├── BaseControlSettingsUiHandler            SETTINGS_GAMEPAD, SETTINGS_KEYBOARD
└── BaseBindingUiHandler                    GAMEPAD_BINDING, KEYBOARD_BINDING
```

**`MessageUiHandler` is not an option-shaped base.** It adds text typing and
prompts only. Inheriting from it says nothing about how a handler stores options —
`PartyUiHandler` and `AchvsUiHandler` are both `MessageUiHandler` and have nothing
structurally in common. Group by *option/cursor storage*, not by superclass.

---

## 2. Per-family table

13 families. "Mode" column gives the `UiMode` int.

| # | Family | Handlers (mode) | Read option labels | Read cursor | Move cursor |
|---|---|---|---|---|---|
| **F1** | **Config option-select** | `OptionSelectUiHandler` (15 OPTION_SELECT, 17 MENU_OPTION_SELECT), `ConfirmUiHandler` (14), `TitleUiHandler` (1), `AutoCompleteUiHandler` (43) | `h.config.options[i].label` — plain strings, no BBCode. Visible window only: `h.getOptionsWithScroll()` (public). Entries with `.skip === true` are unselectable | **`h.fullCursor`**, an index into `h.unskippedIndices`. Selected option = `h.config.options[h.unskippedIndices[h.fullCursor]]`. **`h.cursor` is a screen row, not the option index** | UP/DOWN, both wrap. `setCursor(fullCursorIdx)` is safe and handles scroll maths itself |
| **F2** | **Static text-block list** | `MenuUiHandler` (16), `BallUiHandler` (4), `EggGachaUiHandler` (28) | One `Phaser.Text` whose `.text` is `\n`-joined. MENU: `h.optionSelectText.text.split("\n")`. BALL/GACHA: the text child of `pokeballSelectContainer` / `eggGachaOptionsContainer` | `h.cursor` — direct index into that split | UP/DOWN linear with wrap. `setCursor(n)` safe |
| **F3** | **Fixed 2-D button grid** | `CommandUiHandler` (2), `FightUiHandler` (3), `MysteryEncounterUiHandler` (45) | Text children of a named container: COMMAND `commandsContainer` (named `"commands"`; child 0 is the tera sprite, then Fight/Ball/Pokémon/Run); FIGHT `movesContainer` (named `"moves"`, 4 texts, `"-"` = empty slot); ME `optionsContainer` (BBCode texts, **last child is "View Party"**) | COMMAND/FIGHT: `h.getCursor()` (returns `fieldIndex ? cursor2 : cursor`; **plain `h.cursor` is wrong on the second field slot in doubles**). ME: `h.cursor`, index into `optionsContainer` children | 2-D: UP/DOWN ±2, LEFT/RIGHT ±1. COMMAND also has an off-grid `Command.TERA = 4` reached by LEFT. `setCursor(n)` safe (see §4 for the tera caveat) |
| **F4** | **Two-phase party** | `PartyUiHandler` (8) | *Slot phase:* names from `globalScene.getPlayerParty()` (slot i), plus slot 6 = Cancel, slot 7 = transfer/discard toggle (item modes only). *Option phase:* BBCode children of `h.optionsContainer`; **rendered bottom-up** — sort text children by `y` **descending**, and index *i* of that sorted list is `optionsCursor === i`. `h.options[]` holds `PartyOption` ints, not strings | `h.optionsMode` (bool) says which phase. Slot phase: `h.cursor`. Option phase: `h.optionsCursor` (+ `h.getOptionsCursorWithScroll()` for the absolute index when scrolled) | Slot phase 2-D (doubles change adjacency). Option phase UP/DOWN with wrap. **See §4 — `setCursor` on the option phase is unsafe when `h.optionsScroll` is true** |
| **F5** | **Shop row/column grid** | `ModifierSelectUiHandler` (6) | `h.options[]` (free rewards) and `h.shopOptionsRows[][]` (paid), both **public**. Name: `opt.modifierTypeOption.type.name`; cost `.cost`; description `.type.getDescription()`. Row 0 buttons are i18n literals: `reroll`, `manageItems`, `checkTeam`, `lockRarities` | Two fields: `h.rowCursor` and `h.cursor`. Row 0 = button row (0 reroll / 1 manage items / 2 check team / 3 lock rarities); row 1 = free rewards; row *n*≥2 = `h.shopOptionsRows.at(-(n-1))`. ACTION calls `onActionInput(rowCursor, cursor)` | UP/DOWN change row, LEFT/RIGHT change column, both wrap. Drive with **`h.setRowCursor(row)` then `h.setCursor(col)`** — in that order, `setRowCursor` resets `cursor` to −1 |
| **F6** | **Scrolling row list** | `SaveSlotSelectUiHandler` (7), `RunHistoryUiHandler` (40) | Row objects, not a label array: SAVE_SLOT `h.sessionSlots[abs]`; RUN_HISTORY `h.runs[abs]`. Synthesise a label from the row's data | **Absolute index = `h.cursor + h.scrollCursor`**; `h.cursor` alone is a screen row | UP/DOWN, spilling into `setScrollCursor` at the edges. Prefer presses; `setScrollCursor` is private on RUN_HISTORY |
| **F7** | **Row + horizontal value** | `BaseSettingsUiHandler` → `GeneralSettingsUiHandler` (18), `SettingsDisplayUiHandler` (19), `SettingsAudioUiHandler` (20); `BaseControlSettingsUiHandler` → `SettingsGamepadUiHandler` (21), `SettingsKeyboardUiHandler` (23); `GameChallengesUiHandler` (37) | Settings: `h.settingLabels[row].text` and `h.optionValueLabels[row][v].text`. Challenges: `h.challengeLabels[i].label.text` / `.value.text` | Row = `h.cursor + h.scrollCursor`; current value = `h.optionCursors[row]` | UP/DOWN move rows (with scroll), LEFT/RIGHT change the value. Value changes must go through `h.setOptionCursor(row, v, /* save */ true)` — see §4 |
| **F8** | **Scrolling icon grid** | `AchvsUiHandler` (25), `EggListUiHandler` (27), `EggSummaryUiHandler` (13), `PokedexUiHandler` (29), `StarterSelectUiHandler` (10) | No label list. Icons over a backing array; a label has to be derived (species name, achievement title, egg data). STARTER_SELECT additionally has a filter-bar mode and dropdowns | `h.cursor` (position within the visible grid) + `h.scrollCursor` (row offset); `COLS` is per-handler (9 for starters). Several delegate to `ScrollableGridHelper` (`src/ui/utils/scrollable-grid-helper.ts`), which keeps its *own* private `cursor`/`scrollCursor` | 2-D grid with vertical scroll; STARTER_SELECT also has `h.filterMode` and `CYCLE_*` buttons. **Press-only in practice** |
| **F9** | **Field target picker** | `TargetSelectUiHandler` (5) | None exist. Build them from `globalScene.getField()[i]` for each `i` in `h.targets` (`BattlerIndex[]`) | `h.cursor` **is a `BattlerIndex`, not a list index**. If `h.isMultipleTargets` the cursor is frozen and ACTION hits all of `h.targets` | UP/DOWN jump player↔enemy side, LEFT/RIGHT ±1 within a side, all constrained to `h.targets`. `setCursor(battlerIndex)` is safe |
| **F10** | **Paged viewer** | `SummaryUiHandler` (9), `GameStatsUiHandler` (26), `RunInfoUiHandler` (41), `PokedexPageUiHandler` (31) | Page titles / stat text objects; content is informational | `h.cursor` is a **page index**, not an option. SUMMARY additionally has `h.moveCursor` on the Moves page | LEFT/RIGHT (or UP/DOWN) page through. Not a decision menu — read it, then CANCEL out |
| **F11** | **Acknowledge-only** | `BattleMessageUiHandler` (0), `EvolutionSceneUiHandler` (11), `EggHatchSceneUiHandler` (12), `AlertModalUiHandler` (47), `LoadingModalUiHandler` (35) | None. The only text is `h.message.text` (MESSAGE family) or the modal title | No cursor. `EvolutionSceneUiHandler.setCursor` and `EggHatchSceneUiHandler.setCursor` are hardcoded `return false`. Readiness signal is `h.awaitingActionInput` / `h.pendingPrompt` | Only ACTION or CANCEL, and only while `awaitingActionInput` is true. LOADING accepts nothing at all |
| **F12** | **Modal + text form** | `ModalUiHandler`/`FormModalUiHandler` subclasses: LOGIN_OR_REGISTER (32), LOGIN_FORM (33), REGISTRATION_FORM (34), UNAVAILABLE (36), RENAME_POKEMON (38), RENAME_RUN (39), TEST_DIALOGUE (42), ADMIN (44), CHANGE_PASSWORD_FORM (46), POKEDEX_SCAN (30) | `h.buttonLabels[i].text` (this is what the recon saw), field labels `h.formLabels[i].text`, current field values `h.inputs[i].text` | **There is none.** `cursor` stays 0 and is never used | **Not keyboard-drivable.** `ModalUiHandler.processInput` returns `false` unconditionally; `FormModalUiHandler.processInput` handles only `Button.SUBMIT` (Enter), which fires `submitAction` = button 0. Buttons are wired to Phaser `pointerdown` on `h.buttonBgs[i]`. See §3 |
| **F13** | **Binding capture** | `GamepadBindingUiHandler` (22), `KeyboardBindingUiHandler` (24) | Two fixed buttons | `h.cursor` ∈ {0,1} | LEFT/RIGHT toggle; while capturing, the handler swallows raw device input. Avoid entirely |

---

## 3. Handlers that are NOT list-shaped, and what each needs instead

| Handler(s) | Why it isn't a list | What it needs |
|---|---|---|
| **All 10 modal/form handlers (F12)** — LOGIN_OR_REGISTER, LOGIN_FORM, REGISTRATION_FORM, CHANGE_PASSWORD_FORM, RENAME_POKEMON, RENAME_RUN, POKEDEX_SCAN, TEST_DIALOGUE, ADMIN, UNAVAILABLE | No cursor, and `processInput` ignores every button except `SUBMIT`. The buttons are pointer-only. Free-text entry lives in rex `InputText` DOM elements | Type into the DOM: set `h.inputs[i].text` (or focus the underlying `<input>` and type via CDP `Input.insertText`). Activate a button either by Enter (`Button.SUBMIT` → button 0 only) or by calling `config.buttonActions[i]()`. In practice: **register the throwaway account by hand once** (already the plan in `map.md`) and treat these as "unknown, stop and report" |
| **`TargetSelectUiHandler` (5)** | `cursor` is a `BattlerIndex` in a spatial field layout. `h.targets` is a sparse set of legal indices, so cursor values are non-contiguous. With `isMultipleTargets` there is nothing to choose | Enumerate `h.targets` and label each from `globalScene.getField()[idx]`. Select by `setCursor(battlerIndex)` + ACTION, or by counting LEFT/RIGHT within the side |
| **`FightUiHandler` (3), `CommandUiHandler` (2), `MysteryEncounterUiHandler` (45)** | 2×2 / 2×N grids; UP/DOWN are ±2, not ±1. COMMAND has an extra off-grid `TERA` slot | Treat the flat index as the option id and use `setCursor(idx)`; a "delta of UP/DOWN presses" model is simply wrong here |
| **`PartyUiHandler` (8)** | Two nested menus (slot grid → per-slot option list), a doubles-dependent slot layout, a scrolling option list rendered bottom-up, plus transfer/discard sub-modes | Model as two menus keyed on `h.optionsMode`. Read option labels by sorting `optionsContainer` text children by `y` descending |
| **`ModifierSelectUiHandler` (6)** | A (row, column) address, not an index. Rows are a button bar + a rewards row + 0..n shop rows, and `shopOptionsRows` is indexed **backwards** (`at(-(row-1))`) | Expose as a flat list of `(row, col)` addresses. Drive with `setRowCursor(row)` then `setCursor(col)` |
| **`StarterSelectUiHandler` (10), `PokedexUiHandler` (29), `AchvsUiHandler` (25), `EggListUiHandler` (27), `EggSummaryUiHandler` (13)** | 9-wide scrolling icon grids with no label text objects; starter select adds a filter bar (`h.filterMode`), dropdown filters and `CYCLE_*` buttons | Derive labels from the backing data (`speciesDataRegistry`, achievement list, egg list). Note `ScrollableGridHelper` holds its own private cursor — read `helper.cursor`, not the handler's, where one is used |
| **`SummaryUiHandler` (9), `GameStatsUiHandler` (26), `RunInfoUiHandler` (41), `PokedexPageUiHandler` (31)** | `cursor` is a page index. These are read-only viewers | Scrape the page text; the only meaningful "option" is CANCEL |
| **Settings (18–21, 23) and `GameChallengesUiHandler` (37)** | Each row is a named setting with its own horizontal value list — two cursors, not one | Expose as rows-with-values, not as options. Use LEFT/RIGHT presses (see §4) |
| **`BattleMessageUiHandler` (0), `EvolutionSceneUiHandler` (11), `EggHatchSceneUiHandler` (12), `LoadingModalUiHandler` (35), `AlertModalUiHandler` (47)** | No options at all | Report zero options + the message text; the only action is ACTION-to-advance (and LOADING takes nothing) |
| **`GamepadBindingUiHandler` (22), `KeyboardBindingUiHandler` (24)** | Capture raw device input to rebind keys | Never enter these. If entered, CANCEL out |

---

## 4. Is calling `setCursor` from outside safe?

**Mostly yes, but not universally — and the exceptions are real.** The pattern
across the codebase is that `processInput` *computes* the next cursor and delegates
the state change to `setCursor`, so `setCursor` usually contains the whole
side-effect payload (redraw, description text, tweens). It does **not** commit a
selection — selection only happens on `Button.ACTION` — so calling it cannot
accidentally choose an option.

Verdict per family:

| Family | `setCursor` from outside | Note |
|---|---|---|
| F1 config option-select | **Safe** | Handles scroll maths internally. Skips `option.onHover?.()`, which `processInput` calls when `config.supportHover` is set. Only pokédex-page, starter-select and mystery-encounter helper configs set `supportHover` (`grep supportHover src/`) — a hover callback there only updates a preview, so skipping it is cosmetic |
| F2 text-block, F9 target-select, F13 binding | **Safe** | Pure reposition |
| F3 grid | **Safe, with one cosmetic gap** | `CommandUiHandler.processInput` calls `toggleTeraButton()` alongside `setCursor` when crossing into/out of `Command.TERA`; `setCursor` alone leaves the tera glow stale. Selection still works. `FightUiHandler.setCursor` does the full job (`setMoveInfo`, effectiveness recalc). `MysteryEncounterUiHandler.setCursor` is pure |
| F5 shop | **Safe if you call both** | `setRowCursor(row)` then `setCursor(col)`. `setRowCursor` sets `this.cursor = -1` before re-entering `setCursor`, so column must be set after |
| F4 party — slot phase | **Safe** | Skips the `lastLeftPokemonCursor`/`lastRightPokemonCursor` bookkeeping that `processPartyDirectionalInput` does first; that only affects where a *later* UP/DOWN lands |
| F4 party — option phase | **UNSAFE when `h.optionsScroll` is true** | `setOptionsCursor` assumes ±1 steps: it detects scrolling by checking whether the destination option is the `SCROLL_DOWN` sentinel and by the special case `Math.abs(cursor - optionsCursor) === options.length - 1`. A multi-step jump desynchronises `optionsScrollCursor` from the rendered list. **Step with presses here** |
| F6 scrolling row list | **Partly** | `setCursor` moves only the on-screen row; you must also drive `scrollCursor`, and `RunHistoryUiHandler.setScrollCursor` is private-by-convention and not re-entrant with `setCursor`. Prefer presses |
| F7 settings rows | **Rows: safe. Values: NOT via `setCursor`** | Value changes go through `setOptionCursor(row, v, save)`. `processInput` passes `save = true`, which is what persists the setting and fires the update. Calling `setOptionCursor` without `save` changes the UI and not the setting |
| F8 icon grid | **Avoid** | Handlers that use `ScrollableGridHelper` keep the authoritative cursor inside the helper; the handler's `setCursor` won't update it |
| F10 paged | **Avoid** | `SummaryUiHandler.setCursor` drives page-transition tweens and has an `overrideChanged` second parameter; jumping pages mid-tween is not exercised by any code path |
| F11 acknowledge-only | **No-op** | `setCursor` returns `false` by construction |
| F12 modal | **Meaningless** | No cursor exists |

**Recommendation.** Make `select_option(label)` **press-driven by default** —
compute the press sequence from the family's movement rule (not a naive UP/DOWN
delta; F3/F5/F8/F9 are 2-D) and send the presses, then ACTION. That is
behaviourally identical to a human and needs no per-handler safety argument.
Keep `setCursor` as a **fast path for F1/F2/F3/F5/F9 only**, where it is verified
safe and saves up to N round-trips on long lists (the shop can be 10+ options
wide). Even on the fast path, *never* substitute `setCursor` for the final
`ACTION` press — selection lives entirely in `processInput`.

Two universal rules regardless of path:

1. Send buttons through `ui.processInput(button)` (the recon confirmed it is live),
   never by mutating `cursor` directly — `cursor` is read by `processInput`, and a
   raw write skips every redraw.
2. Re-read `ui.mode` after every press. Many handlers change mode from inside
   `processInput` (`CommandUiHandler` → FIGHT/BALL/PARTY, `BallUiHandler` → MESSAGE),
   so a press can invalidate the handler you were holding.

---

## 5. Recommended generic fallback for an unrecognised handler

When `ui.mode` matches no family entry (a new `UiMode` after a game update, or a
handler deliberately left unmodelled), `read_menu` should **degrade, not block** —
consistent with the "unknown menus degrade to raw presses" rule in `CONTEXT.md`
and `map.md`. Return a best-effort payload built from the base class plus a text
scrape:

```js
// evaluated against the live page
const h = scene.ui.getHandler();
const texts = [];
const walk = (obj, depth) => {
  if (!obj || depth > 4) return;
  // Phaser Text and BBCodeText both expose .text; skip empties
  if (typeof obj.text === "string" && obj.text.trim() && obj.visible !== false) {
    texts.push({ text: obj.text, x: obj.x, y: obj.y, name: obj.name });
  }
  if (typeof obj.getAll === "function") obj.getAll().forEach(c => walk(c, depth + 1));
};
// walk the handler's own container fields, not the whole scene
for (const k of Object.keys(h)) walk(h[k], 0);

return {
  mode: scene.ui.mode,
  modeName: /* from the generated UiMode table */ null,
  handler: h.constructor.name,      // reliable: vite keepNames is on
  known: false,
  cursor: typeof h.getCursor === "function" ? h.getCursor() : h.cursor ?? null,
  scrollCursor: h.scrollCursor ?? null,
  awaitingInput: h.awaitingActionInput ?? null,
  pendingPrompt: h.pendingPrompt ?? null,
  text: texts,                       // sorted by y then x = reading order
};
```

Plus these behaviours:

- **Report `known: false` loudly** so Claude knows labels are unverified scrape,
  not a modelled option list.
- **Refuse `select_option` on unknown handlers.** Do not guess a press sequence
  from scraped y-coordinates; offer raw `press` instead.
- **Probe safely when asked.** `processInput` returns `boolean` — `true` means the
  handler acted. A single `UP` that returns `false` is strong evidence the handler
  has no vertical list. This is a cheap, side-effect-free discriminator (no
  handler commits anything on a direction button).
- **Detect drift, don't silently mis-drive.** The generated `UiMode` table (ticket
  01) should be validated at connect time against the live enum length; if the
  live `scene.ui.handlers.length` differs from the pinned table, mark every mode
  unknown rather than trusting stale indices.

---

## 6. Practical notes for the v1 tool surface

- The modes actually on the critical path of an unattended run are few:
  **MESSAGE (0), COMMAND (2), FIGHT (3), BALL (4), TARGET_SELECT (5),
  MODIFIER_SELECT (6), PARTY (8), CONFIRM (14), OPTION_SELECT (15),
  MENU_OPTION_SELECT (17), MYSTERY_ENCOUNTER (45)**, plus TITLE (1),
  SAVE_SLOT (7) and STARTER_SELECT (10) to begin a run. That is families
  F1–F5, F9 and F11 — seven of the thirteen. Everything else can ship as
  "known-unknown" and fall back to raw presses.
- `ui.processInput` short-circuits when `AwaitableUiHandler.tutorialActive` is set
  (`UI.processInput` → `processTutorialInput`), which accepts only ACTION/CANCEL.
  Tutorials fire on first encounter of the shop and party screens. The settled
  check (ticket 02) should surface `tutorialActive` so this doesn't look like a
  stuck menu.
- `ModifierSelectUiHandler` gates all input on `awaitingActionInput`, which is only
  set after its reward animations settle (`Promise.allSettled(...)` in `show`).
  Reading options before that yields an empty `options` array.
- `BaseOptionSelectUiHandler` has a `config.delay` that sets `blockInput`; ACTION
  during the delay plays an error and returns `false`.
- `Button.CANCEL` in an option-select does **not** close the menu — it jumps the
  cursor to the last option and activates it (`processInput`, CANCEL branch). Safe
  for Yes/No (No is last), but "cancel" is not a no-op there.
