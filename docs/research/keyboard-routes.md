# Which routes can carry a key press into the panel

Research for [#1016 Which routes could carry a key press into the panel on Chrome, Firefox and Orion](https://github.com/IIxauII/coachemon/issues/1016),
on the map [#1010](https://github.com/IIxauII/coachemon/issues/1010). The question: **which routes could carry one physical key press
into the coach panel on macOS Chrome, Firefox and Orion, and what does PokéRogue hear of the press on each?**

This note feeds [#1018 Build a probe build that offers every candidate route and logs each press on the panel](https://github.com/IIxauII/coachemon/issues/1018),
so §6 names the exact variants to declare. The press table that
[#1019 What each candidate route does on a physical key press, on Chrome, Firefox and Orion](https://github.com/IIxauII/coachemon/issues/1019)
measures goes in §8, which is left empty here.

**Nothing here was pressed.** No key went into any browser for this note, over CDP, `osascript` or by hand. Every per-engine
expectation below is an expectation, and §7 lists what a physical press has to settle. Nothing here chooses a route either.

Vocabulary is `CONTEXT.md`'s: the **panel** is the box the **overlay** draws the **card** in, and the **relay** is the extension's
presence in the tab. *Grab* is the press that hands the panel the keyboard (the closed spec #405's word; not in `CONTEXT.md` yet).
The browser's own feature is written `manifest.commands`, a *named command*, or `onCommand`; *command* alone is the **hub**'s word.

Tags:

- **[docs]**: stated by the vendor (developer.chrome.com, MDN, Kagi's help or release notes, webkit.org, Apple).
- **[source]**: read from the engine's or the game's source at the revision named in §9.
- **[measured]**: observed on a real browser, by this repo's tickets or by a report on the engine's own tracker (said which), or read
  off the installed app bundles on the owner's machine (said so).
- **[inferred]**: reasoned from the above, not stated anywhere. Each one is a candidate for §7.

**In short** (each line is argued, with its sources, in §3–§5):

- **Chrome** should deliver a declared `manifest.commands` chord on a real press in every modifier class it accepts, Option included,
  *before* the page, which then gets neither the letter's `keydown` nor its `keyup`. The #418 failure is what CDP does: it bypasses
  the path a press takes.
- **Firefox** gives the page every chord *first*. An extension shortcut runs only if nothing in the page called `preventDefault()`, so
  "where the browser claims the chord the page never sees it" is false there. ⌘ plus any of the nine game-unbound letters is already a
  Firefox shortcut, and an Option dead key never fires.
- **Orion** runs its own closed-source extension host. Its tracker reports ⌘ chords firing, Control chords not, and a double fire;
  which AppKit hook it uses, and so whether the page hears the chord first, is for a press to show.
- **A page-level capture listener** on `window` works on all three for any chord the browser does not take first; it rests on DOM
  event dispatch, which all three implement alike, not on an extension host. **`accesskey`** (⌃⌥) is a second page-side route the browser matches.
- **What the game hears:** every modifier's own keydown, because no browser claims a bare modifier. **Shift is the game's second stats
  key**, so every Shift chord leaks STATS on every engine and route. ⌘ is never a game key. The letter itself is unbound by default
  for B H I J K L O P U, but the player can bind it.
- **Not key routes:** the toolbar click, a context menu (needs a permission), `chrome.userScripts`, macOS App Shortcuts. DOM focus is
  what the panel does after a grab, not a way in.
- **K is free on all three browsers with ⌥, ⌃, ⌥⇧, ⌃⇧, ⌘⇧ and ⌘⌃**, and with ⌘ everywhere but Firefox; it is the letter §6 probes,
  with J as a control.

---

## 1. The browsers this will be pressed on

Read on 2026-11-08 from each app bundle's `Info.plist` (`CFBundleShortVersionString`) on the owner's machine **[measured]**. #1019's
presses are made on these.

| | version | notes |
|---|---|---|
| macOS | 26.2 (25C56) | |
| Google Chrome | 156.0.8078.80 | |
| Firefox | 159.0 | the add-on's floor is `strict_min_version: "142.0"` (`extension/src/build/manifest.ts`) |
| Orion | 1.1.3 (build 152) | bundles its own `WebKit.framework`, version 625.1.8 |
| Safari | 26.2 | out of scope; noted only where a source covers it for free |

The earlier measurements were on other builds: Chrome for Testing 148 and Orion 1.1.2 (#411, #418).

---

## 2. What has been measured, and why it does not settle anything

| engine | build | how the key went in | result | source |
|---|---|---|---|---|
| Chrome | for Testing 148 | CDP `Input.dispatchKeyEvent` | `commands.getAll()` → `⌥C`; `onCommand` never fired; the game's bare-`C` stats panel opened | [#418](https://github.com/IIxauII/coachemon/pull/418), [#411](https://github.com/IIxauII/coachemon/issues/411) **[measured]** |
| Orion | 1.1.2 | System Events keystrokes over Apple Events | zero grabs from ⌘⇧U, ⌘B, ⌘K, ⌘⇧K, ⌥C, ⌃K, ⌃⇧K; content scripts live | #418, #411 **[measured]** |

Neither is a physical press. CDP injects into the renderer (§5.1). The Orion run declared only `Alt+C` in the manifest (#418's
`commands: { grab: { suggested_key: { default: "Alt+C", mac: "Alt+C" } } }`), so six of its seven chords were presses of keys no
command was bound to, and the seventh is the Option-only class (§5.1, §5.3). The one Orion fact that does carry forward is that Orion
parsed and stored the command from the Chrome-flavoured build and not the Firefox one (#411) **[measured]**.

The delivery leg after `onCommand` is not in question: background → `tabs.sendMessage` → relay → a `coachemon:grab` `CustomEvent` on
`document` was proven in Chrome for Testing 148 (#418) **[measured]**, and the same `tabs.sendMessage` hop already carries every hub
command on Chrome 153, Firefox 156 and Orion 1.1.2 with no permissions
([`research/browser-command-reach`](https://github.com/IIxauII/coachemon/blob/research/browser-command-reach/docs/research/browser-command-reach.md) §2, #392) **[measured]**.

---

## 3. What the game hears

Re-read for this note at the current pin, PokéRogue **v1.12.2.0** (`src/escape-ladder/reviewed.json`), with the Phaser it vendors,
**3.90.0**. The fuller account is #393's note on
[`research/game-keyboard`](https://github.com/IIxauII/coachemon/blob/research/game-keyboard/docs/research/game-keyboard.md), read at
v1.12.0.11; the lines below were checked again at v1.12.2.0 **[source]**.

- **One listener pair, on `window`, bubble phase, and it bails on a prevented event.** `KeyboardManager.js:186–231`:
  `if (event.defaultPrevented || !_this.enabled || !_this.manager)` returns early, and
  `target.addEventListener('keydown', this.onKeyDown, false)` with `target` defaulting to `window`. `src/main.ts` sets no `keyboard`
  input config. So a capture-phase listener on `window` that calls `preventDefault()` runs first and the game never queues the key.
- **The game maps `keyCode` and ignores modifiers.** `InputsController.keyboardKeyDown` calls
  `getButtonWithKeycode(..., event.keyCode)` (`src/inputs-controller.ts:354`), and nothing on that path reads `altKey`, `ctrlKey`,
  `metaKey` or `shiftKey`. ⌘⇧K reads to the game as `K`.
- **Unbound by default:** `KEY_B`, `KEY_H`, `KEY_I`, `KEY_J`, `KEY_K`, `KEY_L`, `KEY_O`, `KEY_P`, `KEY_U` are `-1`
  (`src/configs/inputs/cfg-keyboard-qwerty.ts:243–256`), as are the digits, F1–F12, `Tab`, `Ctrl` and `Alt`. `KEY_C` is
  `BUTTON_STATS` (`:233`). A keydown for an unbound key does nothing: `keyboardKeyDown` and `keyboardKeyUp` both test
  `if (buttonDown != null)` first (`:355`, `:383`).
- **The player can bind any of those.** The game's own Settings → Keyboard can assign every key in the layout except its blacklist
  (Enter, Esc, Space, Backspace, the arrows, Del, Home), and stores the result in `localStorage` (#393's note §3.5). "Unbound" is the
  default, not a promise.
- **The modifiers are keys too, and one of them is bound.** A `keydown` fires for every key, "regardless of whether they produce a
  character value" ([MDN `keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event)) **[docs]**, so the
  modifier of a chord reaches the page as its own keydown before the letter does, and no browser claims a bare modifier. At v1.12.2.0:
  - `KEY_SHIFT: SettingKeyboard.ALT_BUTTON_STATS` (`cfg-keyboard-qwerty.ts:291`). **Shift is the game's second stats key.** Its
    keydown runs `buttonGoToFilter(Button.STATS)` (`src/ui-inputs.ts:96`): on starter select and the Pokédex that is
    `processInput(STATS)`, elsewhere it shows the stats while held (`:163–171`, `:152–161`), and the game's own 250 ms repeat
    re-sends it while Shift stays down (`inputs-controller.ts:33`, `:364–369`).
  - `KEY_CTRL: -1` (`:271`) and `KEY_ALT: -1` (`:297`): unbound by default, assignable.
  - **Command has no entry in the layout at all**: the `deviceMapping` lists `KEY_CTRL`, `KEY_SHIFT` and `KEY_ALT` and no Meta key,
    so ⌘ can never be a game button, whatever the player binds.

  So **any chord with Shift in it leaks STATS to the game through the Shift keydown, on every engine and every route**, unless the panel
  swallows bare Shift, which would take the stats key away from the player **[inferred]** from the lines above. Option and Control
  chords leak nothing by default; Command chords leak nothing ever, through the modifier.
- **What the game hears of the letter depends on the route.** If the browser claims the chord before the renderer, the page never gets
  the letter's keydown (§5.1). If it doesn't, the page does, and the game maps it by `keyCode`: nothing for an unbound letter, the
  player's binding otherwise, unless the panel's capture listener prevents it first.
- **A swallowed keyup is a stuck key.** #393's note §5: the game clears its held state only on `keyup`, so a panel that prevents both
  `keydown` and `keyup` can leave a button held and repeating at 4 Hz. Relevant here because a Shift chord's Shift keyup comes *after*
  the grab.

---

## 4. Which chords each browser already holds

A `manifest.commands` chord that a browser already uses either never gets assigned (Chrome: `CanAutoAssign` returns
`!IsChromeAccelerator(...)` for a non-global command, `chrome/browser/extensions/commands/command_service.cc:574–575` **[source]**) or is
assigned and never fires (MDN: "You can define it, but your event handler will not be called when the user presses the key
combination" **[docs]**). On a page-level route the browser's binding wins too, for any chord the browser claims first. So the letter
has to be free in the class being probed, on all three browsers.

For the nine game-unbound letters, read from each browser's own key tables (§9 has the files) **[source]**, and for Orion from the
key equivalents in the installed 1.1.3 bundle's `MainMenu.nib`, parsed read-only **[measured]** (Orion is closed source, so menu
items it adds in code are not covered):

| chord | Chrome 156 | Firefox 159 | Orion 1.1.3 |
|---|---|---|---|
| ⌘ + letter | H hide, J jump to selection, L location, O open, P print | **all nine**: B bookmarks sidebar, H hide, I page info, J downloads, K search, L location, O open, P print, U page source | H hide, J jump to selection, L location, O open, P print, U focus window |
| ⌘⇧ + letter | B bookmarks bar, H home, I email page, J downloads, L vertical tabs | B bookmarks toolbar, H history sidebar, J browser console, O library, P private window | B bookmarks bar, H home, I pin tab, O passwords, P page setup |
| ⌘⌥ + letter | B bookmark manager, H hide others, I devtools, J console, P basic print, U view source | H hide others, I toolbox, K web console, U page source | B reading list, H hide others, I web inspector, L layers / downloads, O storage, P profile, U view source |
| ⌃ + letter (`MacCtrl`) | none | U open-tabs sidebar | none |
| ⌃⇧ + letter | none | none | none |
| ⌥ + letter, ⌥⇧ + letter | none | none | none |

**Free in every column: ⌥K, ⌥⇧K, ⌃K, ⌃⇧K, ⌘⇧K, ⌘⇧U**, and ⌥/⌃/⌃⇧ with most of the nine. **⌘ + any of the nine is taken on
Firefox**, so the Command-only class cannot be probed on Firefox with a game-unbound letter at all; ⌘K is free on Chrome and Orion only.
#418 rejected ⌘⇧K as "Firefox's Web Console"; that is the Windows and Linux binding. On macOS the console is ⌘⌥K
(`DevToolsStartup.sys.mjs:93`, `const modifiers = isMac ? "accel,alt" : "accel,shift"`) **[source]**.

Two more layers this table does not cover, both for the probe to expose: macOS's own system shortcuts, and the keyboard layout. An
Option chord types a character, and on some layouts and keys that character is a dead key that waits for the next letter (Apple's own
example is ⌥N for a tilde, [Enter characters with accent marks on Mac](https://support.apple.com/guide/mac-help/enter-characters-with-accent-marks-on-mac-mh27474/mac)
**[docs]**; ⌥U and ⌥I are dead keys on the US layout **[inferred]**), and on some non-US layouts an Option letter types a symbol people
need, `@` among them **[inferred]**. The Keyboard Viewer with Option held outlines the dead keys in orange (same page) **[docs]**, so
whoever presses the probe checks the Option letter there first, on the layout they actually type with.

---

## 5. The routes, per engine

### 5.0 At a glance

"Should" means the source says the engine is built to; "unknown" means no source settles it and §7 has the press that does.

| # | route | Chrome 156 | Firefox 159 | Orion 1.1.3 | what the game hears |
|---|---|---|---|---|---|
| 1 | `manifest.commands`, Option (`Alt+K`) | **should fire**, before the page (§5.1) | **should fire, after the page**, unless the page prevents the key; never on an Option dead key (§5.2) | unknown; never, if Orion's commands are menu key equivalents (§5.3) | Chrome: the ⌥ keydown only. Firefox: ⌥ and `K` (keyCode 75) |
| 2 | `manifest.commands`, Control (`MacCtrl+K`) | should fire, before the page | should fire, after the page | **reported not to** (#2121, 2022) | Chrome: ⌃ only. Firefox: ⌃ and `K` |
| 3 | `manifest.commands`, Command (`Command+K`) | should fire, before the page | **cannot**: ⌘ + each of the nine is a Firefox shortcut (§4) | **reported to fire** (#2121, 2022) | ⌘ is never a game key; Chrome: nothing; Firefox: `K` |
| 4 | `manifest.commands`, `MacCtrl+Shift+K` | should fire, before the page | should fire, after the page | reported not to (#2121) | **Shift → STATS** on all three (§3) |
| 5 | `manifest.commands`, `Command+Shift+K` | should fire, before the page | should fire, after the page | reported to fire for other extensions, with regressions (#11266) | **Shift → STATS** |
| 6 | `manifest.commands`, `Alt+Shift+K` | should fire, before the page | should fire, after the page | unknown | **Shift → STATS** |
| 7 | `manifest.commands`, a pair without Shift: `Command+MacCtrl+K` (⌘⌃K); `MacCtrl+Alt+K` (⌃⌥K) | ⌘⌃K **allowed**, should fire; ⌃⌥K **refused, and the whole manifest with it** (§5.1) | both allowed from Firefox 63 | ⌘⌃K unknown; ⌃⌥K cannot be carried in the Chrome-flavoured build Orion reads | the two modifiers only, both unbound by default |
| 8 | `manifest.commands` with `"global": true` (`Command+Shift+1`) | should fire, even unfocused (§5.1) | no `global` | unknown | Shift → STATS, when the game tab has focus |
| 9 | `_execute_action` | should fire `action.onClicked`; needs an `action` in the Chrome manifest | should; but the click is already the consent gesture | unknown | as the matching chord row |
| 10 | toolbar action, clicked | works (not a key) | works, but is the consent gesture | claimed | nothing |
| 11 | page-level capture `keydown` on `window` | **works for any chord Chrome does not claim** | **works; the page sees every chord first** | works for any chord Orion does not claim; WebKit gives the page ⌘ and ⌃ chords first (§5.3) | the panel can prevent the letter; the modifier keydowns already went through |
| 12 | 1 and 11 on the same chord | **one grab, from the command** | **two grabs, or one from the page if the panel prevents the key** | like Chrome or like Firefox, depending on Orion's hook (§5.3); a double fire is on the tracker (#12054) | as 1 or 11 |
| 13 | `accesskey` on a panel element (⌃⌥K) | should; after the page's keydown, and not stoppable by it | should; after the page's keydown, and stopped if the page prevents it | should, before the keydown, which arrives already prevented | Chrome, Firefox: `K`. Orion: nothing (Phaser bails) |
| 14 | DOM focus on a panel element | needs Tab (§5.5) | needs Tab | needs Tab | Tab, unbound by default |
| 15 | context-menu entry | needs the `contextMenus` permission; not a key | needs `menus`; not a key | the sheet claims `menus`; a permission all the same | nothing |
| 16 | `chrome.userScripts` | not a key route (§5.7) | not a key route | unknown | — |

### 5.1 Chrome

**A real press reaches an extension command before the page, Option-only chords included.** Read at `dbfbc95f` **[source]**:

- `ui/base/cocoa/command_dispatcher.mm:234–242`, in `preSendEvent:`: "AppKit does not call performKeyEquivalent: if the event only has
  the NSEventModifierFlagOption modifier. However, Chrome wants to treat these events just like keyEquivalents, since they can be
  consumed by extensions." Any keydown with Option set is offered to `performKeyEquivalent:` first.
- `chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm:32–37`: extension commands are registered through
  `ExtensionKeybindingRegistryViews`, which "always has high priority", and `prePerformKeyEquivalent:` (`:66–83`) asks the Views
  `FocusManager` at `kHighPriority` and returns `kHandled` before the window's first responder, the web contents, sees the event.
- The accelerator for ⌥K resolves to `VKEY_K` even though the character is `˚`: `KeyboardCodeFromNSEvent` tries `characters`, then
  `charactersIgnoringModifiers`, then the hardware key code, and `˚` is not in its character table
  (`ui/events/keycodes/keyboard_code_conversion_mac.mm:796–812`, table `:537–638`). An Option **dead key** still resolves (⌥U →
  `VKEY_U`, `:682`), and so does a layout where ⌥L types `@`, which is not in the table either. A layout where an Option letter types
  plain ASCII punctuation (`~`, `|`, `[` …) would resolve to that symbol instead and miss the command **[inferred]** from the table.
- **The letter's `keyup` is dropped too.** The web view forwards a keyup only after a matching keydown it forwarded itself:
  "Do not forward key up events unless preceded by a matching key down"
  (`content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm:1585–1593`, codes recorded at `:1618`) **[source]**. A keydown the
  command took never got there, so its keyup is dropped as well **[inferred]** from those lines. Modifier changes are not filtered by
  that check, so ⌥ / ⌃ / ⌘ / ⇧ still reach the page **[inferred]**.
- **⌘ keyups.** AppKit swallows a keyup while ⌘ is held; Chrome forwards it anyway from 149 on (`kForwardCmdKeyUpEventsToWindow`,
  enabled by default, `chrome/browser/chrome_browser_application_mac.mm:35`, `:372–379`; landed in
  [`708693710a`](https://github.com/chromium/chromium/commit/708693710a5a32e8d413bd81f55f07b62c932068), closing
  [crbug 40880986](https://issues.chromium.org/issues/40880986) and [438807261](https://issues.chromium.org/issues/438807261))
  **[source]**. So on Chrome 156 a ⌘ chord the page hears also gets its keyup; CfT 148 predates it.

So for a chord Chrome assigned, the expectation is that `onCommand` fires once and the page gets neither the letter's `keydown` nor its
`keyup`, only the modifier keydowns **[inferred]**. The game hears the modifiers, which are unbound by default except Shift (§3). Row 12
then gives exactly one grab.

**Why CfT 148 saw nothing.** CDP's `Input.dispatchKeyEvent` enters at `content/browser/devtools/protocol/input_handler.cc:1200` and
goes straight to `RenderWidgetHostImpl::ForwardKeyboardEventWithCommands` (`:790–804`), bypassing `sendEvent:`, `preSendEvent:` and
`prePerformKeyEquivalent:` **[source]**. Without a `nativeVirtualKeyCode` the browser's pre-handler and its unhandled-key path are both
skipped (`render_widget_host_impl.cc:1905`, `:2827–2828`); with one, extension accelerators are offered the key only for a
`rawKeyDown`, through the Views `FocusManager` (`chrome/browser/ui/views/frame/browser_view.cc:3283–3286`, `:3332–3341`) **[source]**.
#418 does not record which CDP call it made; the repo's own CDP transport sends `type: "keyDown"` (`src/cdp/session.ts:222–224`), the
type that path skips. Either way the #418 result is what CDP does, not what a press does **[inferred]**, and CDP keys are
`isTrusted: true` in the page
(`third_party/blink/renderer/core/dom/events/event_target.cc:883–887`) **[source]**.

**The rules.** From the [`chrome.commands` reference](https://developer.chrome.com/docs/extensions/reference/api/commands)
**[docs]**: modifiers are `Ctrl`, `Alt`, `Shift`, `MacCtrl`, `Option`, `Command`; "On macOS Ctrl is automatically converted into
Command"; "To use the Control key on macOS, replace Ctrl with MacCtrl when defining the "mac" shortcut"; "Key combinations that
involve Ctrl+Alt are not permitted"; "may specify at most four suggested keyboard shortcuts"; `_execute_action` does not dispatch
`onCommand`; global suggestions "are limited to Ctrl+Shift+[0..9]". Two of those bite a probe:

- **A fifth suggested key is a hard manifest error**, not a silent drop: `kMaxCommandsWithKeybindingPerExtension = 4`
  (`extensions/common/api/commands/commands_handler.cc:27`, check `:100–115`, error "Too many shortcuts specified for 'commands': The
  maximum is *.") **[source]**. The count is per platform, so it is the `mac` keys that count. Further commands can be declared with
  no `suggested_key` and bound by hand at `chrome://extensions/shortcuts` (docs).
- **Which chords parse.** `HasValidModifierCombination` (`ui/base/accelerators/command.cc:48–66`) requires a modifier, refuses Alt
  together with Ctrl or Command ("Usually Ctrl+Alt/Cmd+Option key combinations are not supported"), and accepts Shift only beside
  Ctrl, Alt or Command; an extension shortcut has at most three tokens (`:224–233`). On macOS `MacCtrl` becomes Ctrl and `Option`
  becomes Alt first (`extensions/common/command.cc:58–63`). So `Alt+K`, `MacCtrl+K`, `Command+K`, `Alt+Shift+K`, `MacCtrl+Shift+K`,
  `Command+Shift+K` and **`Command+MacCtrl+K`** parse; **`MacCtrl+Alt+K` and `Command+Alt+K` do not**. `Command` and `Option` outside
  the `mac` key are errors (`extensions/common/command.cc:205–228`), `MacCtrl` there is an unknown token, and Chrome parses every
  platform's entry and fails the manifest on any error, not just the current platform's (`:243–270`) **[source]**. One bad entry and
  the extension does not load.
- **A suggested key Chrome already uses is left unassigned**: `CanAutoAssign` returns `!IsChromeAccelerator(...)`
  (`chrome/browser/extensions/commands/command_service.cc:540–576`) **[source]**, so the probe has to show `commands.getAll()` to
  tell "never assigned" from "assigned and never fired".

**Global commands.** On macOS `CanAutoAssign` accepts a global suggestion only for ⌘⇧ plus a digit (`command_service.cc:560–571`)
**[source]**. The digits are unbound in the game (§3); ⌘⇧3, ⌘⇧4 and ⌘⇧5 are macOS screenshot keys **[inferred]**, so the candidate is
⌘⇧1 or ⌘⇧2. "Global commands also work while Chrome does not have focus" (docs). On macOS a global command is a Carbon hot key,
`RegisterEventHotKey(...)` (`ui/base/accelerators/global_accelerator_listener/global_accelerator_listener_mac.mm:257–261`), and the
window-level registry takes only non-global commands (`chrome/browser/ui/views/extensions/extension_keybinding_registry_views.cc:65–67`)
**[source]**. A registered hot key is taken by the system before the app sees a keydown, so the page should hear only the modifiers
**[inferred]**. It is the one route that does not go through Chrome's window at all, which makes it a useful control: if a global
⌘⇧1 fires and the in-window ⌘⇧K does not, the fault is in the window path.

**The tracker.** Nothing on issues.chromium.org reports an Option-only extension command failing on a real macOS press. The nearest are
old and closed (`chrome.commands.onCommand` not fired, 2014, OS X, [41085103](https://issues.chromium.org/issues/41085103);
"A keyboard shortcut defined in an extension manifest is no longer acted upon", Chrome 70, [41423856](https://issues.chromium.org/issues/41423856))
or Linux-only ("chrome.commands API doesn't prevent the default behavior of some sites", the key reaching both page and extension,
[41143012](https://issues.chromium.org/issues/41143012), still New) **[measured]**, third-party.

### 5.2 Firefox

**The page hears an extension shortcut first, and can stop it.** This is the finding that changes the earlier plan most, and it is
read from source at `b42441b0` **[source]**:

- `ExtensionShortcuts.sys.mjs` turns each command into a XUL `<key>` in a per-window `<keyset>` (`:408–431`), built by
  `buildKeyFromShortcut` (`:491–517`), which sets `modifiers` and `key` and **never sets `reserved`**. A letter key gets no `event`
  attribute, so it listens on `keypress`; only a `keycode` key (an F-key, an arrow) is set to `event="keydown"` (`:514–515`). Its
  `command` listener calls `onCommand(name)`, or `triggerAction` for `_execute_action` (`:455–473`).
- `GlobalKeyListener.cpp` handles those keys. For an event bound for a content process that a `<key>` matches, it stops it and
  "will wait the reply event" (`:240–256`); the handler only runs on the reply, and `WalkHandlers` returns at once
  `if (aKeyEvent->DefaultPrevented())` (`:93–96`). The parent side marks every keypress that is not typing text as waiting for the
  content process's reply (`widget/cocoa/TextInputHandler.mm:3491–3501`).
- Reserved keys skip that wait, but a `<key>` with no `reserved` attribute is reserved only when
  `nsContentUtils::ShouldBlockReservedKeys` says so (`GlobalKeyListener.cpp:466–492`), which is a per-site "shortcuts" permission set
  to deny (`dom/base/nsContentUtils.cpp:12951–12979`). By default, then, an extension shortcut is not reserved.

So on Firefox, for every chord: the page and the game get the trusted `keydown` first; if anything in the page calls
`preventDefault()` on it, the browser shortcut does not run; if nothing does, it runs after **[source]**, and the letter has already
reached the game by `keyCode` (`K` → nothing by default). MDN's "If a key combination is already used by the browser … you can't
override it. You can define it, but your event handler will not be called" ([`manifest.json/commands`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands))
**[docs]** is the other half: built-in `<key>`s win over an extension's on the same chord, which is why §4's ⌘ row is dead.

**The idea behind route 12 does not hold on Firefox.** "Where the browser claims the chord the page never sees it" is false here. With
the same chord declared and listened for, the panel's capture listener sees it first: if it prevents the key (it must, to keep the
letter from the game), the command never fires and the page route gives the one grab; if it does not, both fire and only a debounce
keeps it to one grab **[inferred]** from the lines above.

**Option chords.** MDN lists `Alt` as a modifier, and the `<key>` matches ⌥K through its unmodified-letter fallback when no text field
is focused (`TextInputHandler.mm:1333–1366`) **[source]**. An Option **dead key** (⌥U, ⌥I, ⌥E, ⌥N on the US layout) never fires: the
page gets `key: "Dead"`, `code: "KeyU"`, `keyCode: 85` and no `keypress` follows (`TextInputHandler.mm:1211–1221`, `:1636–1638`;
`WidgetEventImpl.cpp:1374–1393`), and a letter `<key>` listens on `keypress` (`dom/events/KeyEventHandler.cpp:537–539`) **[source]**.
So **U and I are out for an Option chord on Firefox**; K, J, L, B, H, O, P are not dead keys on the US layout **[inferred]**.

**Pairs.** "Any one of `Ctrl`, `Alt`, `Command`, or `MacCtrl`" as a secondary modifier, Firefox ≥ 63 (MDN) **[docs]**, so
`MacCtrl+Alt+K` and `Command+MacCtrl+K` are legal here, and they carry no Shift. Bare `F1`–`F12` are legal too ("mandatory, except
for function keys", MDN) **[docs]**, and the game leaves F1–F12 unbound (§3); on a Mac keyboard they need `fn` unless the
standard-function-keys setting is on **[inferred]**.

**Rebinding from code.** `commands.update()` and `reset()` exist on Firefox and nowhere else among the three except by Orion's own
claim (§5.3); `openShortcutSettings()` opens Manage Extension Shortcuts (MDN) **[docs]**. The probe can use `update()` to try a
second chord without a rebuild.

### 5.3 Orion

**Orion's extension host is its own, closed source, not WebKit's.** Kagi: "Orion has its own implementation of the entire
WebExtensions APIs collection" ([Orion macOS Web Extensions Support](https://help.kagi.com/orion/browser-extensions/macos-extensions.html))
**[docs]**. The installed 1.1.3 main binary agrees: no `WKWebExtension` string in either architecture slice, and the only WebKit
extension class it imports is `_WKWebExtensionDeclarativeNetRequestTranslator`, although the bundled WebKit 625.1.8 exports the whole
`WKWebExtension*` family **[measured]**, read off the bundle with `strings` and `nm`. So WebKit's open-source command code
(`WKWebExtensionCommand`, which Safari's host drives) is **not** evidence for Orion. WebKit's source still covers what happens once a
key reaches the web view.

What the binary carries for commands **[measured]**, strings only: Orion's own `ExtensionShortcutsViewController` (the per-extension
shortcut panel), `onCommand.AddListener`, `_execute_action`, `_execute_browser_action`, `command_overrides`, "Invalid extension
shortcut key", a target-action selector `performExtensionCommandWithSender:`, and every hook a command could hang off: menu key
equivalents (`setKeyEquivalent:`, the `NSMenuDelegate` method `menuHasKeyEquivalent:forEvent:target:action:`, an `Extensions` menu in
`MainMenu.nib`), `performKeyEquivalent:`, `sendEvent:`, local and global event monitors, and Carbon hot keys. Which one carries an
extension command cannot be read from the bundle. It decides everything for this note, so §7 asks it of a press.

What follows from each, from AppKit and WebKit rather than from Orion **[inferred]** unless tagged:

- **If commands are menu key equivalents:** the page hears a ⌘ or ⌃ chord first and can stop it, as on Firefox. WebKit's
  `WebViewImpl::performKeyEquivalent` sends key combos to the page before anything else, "This lets webpages have a crack at
  intercepting key-modified keypresses" (`Source/WebKit/UIProcess/mac/WebViewImpl.mm:6763–6774`); only if the page did not handle it is
  the event re-sent to AppKit and on to the menus (`WebPageProxy.cpp:15676–15679`, `WebViewImpl.mm:5826–5846`, `:6756–6760`)
  **[source]**, and "handled" includes `defaultPrevented()`. Apple: "If no object in the view hierarchy handles the key equivalent,
  NSApp then sends performKeyEquivalent: to the menus in the menu bar"
  ([Handling Key Events](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingKeyEvents/HandlingKeyEvents.html))
  **[docs]**. An **Option-only** chord would never reach a menu: AppKit does not call `performKeyEquivalent:` for it
  (`command_dispatcher.mm:234–236`, §5.1) **[source]**, and WebKit's re-send of a plain keydown goes up the responder chain, not to the
  menus (`WebViewImpl.mm:6791–6804`) **[source]**. #411's one declared chord, ⌥C, gave zero grabs (synthetic presses, §2) **[measured]**.
- **If commands hang off `sendEvent:` or a local event monitor:** Orion sees every chord before the web view and can swallow it
  ("return nil to stop the dispatching of the event", [`addLocalMonitorForEvents`](https://developer.apple.com/documentation/appkit/nsevent/addlocalmonitorforevents(matching:handler:))
  **[docs]**), and Orion behaves like Chrome, Option included.
- **If commands are Carbon hot keys:** as Chrome's global commands, the page hears nothing but the modifiers, and Option-only hot keys
  work again since macOS 15.2 (an Apple engineer, [developer forums 763878](https://developer.apple.com/forums/thread/763878))
  **[docs]**.

The tracker says the same in pieces, all third-party reports on Orion's own forum **[measured]**:

- **Control is not honoured** ([#2121](https://orionfeedback.org/d/2121-keyboard-shortcuts-for-webextension-commands-that-include-the-control-key-do-not-work-properly),
  2022-05-04, Orion 0.99.113.2.1-rc, tagged Planned, no later post): of a four-command test extension, `MacCtrl+Shift+U` and
  `MacCtrl+N` never fired; `Ctrl+B` with no `mac` entry fired on ⌘B and also, wrongly, on ⌃B; `Command+K` fired on ⌘K only. The
  reporter adds that Chrome and Firefox print all four "so long as its normal app-wide keyboard shortcuts for Command+B and Command+K
  are disabled".
- **Command chords fire, unreliably across versions** ([#11266](https://orionfeedback.org/d/11266-keyboard-shortcuts-for-extensions-bitwarden-autofill-not-working),
  2025-06-08 → 2026-06-24): Bitwarden's ⌘⇧L autofill fixed in 0.99.134-beta, reported broken again on 1.0.3, 1.0.4, 1.0.5 and 1.0.6
  with both the Chrome and the Firefox builds of Bitwarden, staff-reproduced 2026-02-14, "a fix is forthcoming" on 2026-05-06, tagged
  Done on 2026-06-24 (the day after 1.1). Kagi staff, 2025-06-11: "that panel allows you to add a new shortcut for an action".
- **Double fire** ([#12054](https://orionfeedback.org/d/12054-the-readwise-highlighter-chrome-extension-triggers-twice-when-you-use-the-keyboard-shortcut),
  2025-10-04 → 2026-01-30, tagged Planned): a Chrome extension's shortcut saves twice per press on 1.0.0 and 1.0.3; the shortcut
  cannot be cleared; "when I switch a website into compatibility mode, the keyboard shortcut doesn't appear to work at all".
- **Website first** ([#722](https://orionfeedback.org/d/722-extension-shortcuts-precedence-over-website-and-browser-shortcuts),
  2021-12-23, Under Review): a request that extension shortcuts take precedence over website and browser shortcuts; a merged 2021 Kagi
  reply there says "we have simply passed keyboard input to web app so it has precedence over browser" **[docs]**, vendor, old.
- **More of the same**, all third-party **[measured]**: [#427](https://orionfeedback.org/d/427-allow-remapping-extension-keyboard-shortcuts)
  (remapping, Done in 0.99.127) has "none of the shortcuts work regardless" on 2025-12-29, with both the Firefox and the Chrome build of
  Bitwarden; [#9579](https://orionfeedback.org/d/9579) (Done in 0.99.131) has Orion assigning ⌃⇧L where ⌘⇧L was declared, then ⌘⇧Y and
  ⌃⇧Y doing the same thing; [#10109](https://orionfeedback.org/d/10109) (Planned) has two extensions on ⌘⇧X with the later install
  winning; [#10312](https://orionfeedback.org/d/10312) (0.99.131.3 RC) has a chord with Control and Shift failing where one with Control,
  Option and Shift worked. Kagi staff on [#8184](https://orionfeedback.org/d/8184) (0.99.128): "using these shortcuts that are for sure
  not used in by a menu item already works for me".

None of these is on 1.1.x, and nothing is filed against 1.1.x about extension shortcuts; the release notes for 1.1 (build 148) through
1.1.3 (build 152, 2026-09-28) list no change to them ([orionbrowser.com release notes](https://orionbrowser.com/updates/orion-release-notes.html))
**[docs]**. Orion's own support sheet, linked from [help.kagi.com/orion/misc/technical.html](https://help.kagi.com/orion/misc/technical.html),
undated, marks `commands.Command`, `getAll`, `onCommand`, `reset` and `update` as *Full support* on macOS, `action.onClicked` and
`action.openPopup` *Full*, and `menus` *Full* (there is no `contextMenus` row); it has no `onChanged` row and nothing on content-script
`world` **[docs]**. An older tab of the same sheet has `commands` as "partial … Added only placeholder methods", so the sheet's dates
are unknown.

So for Orion the expectation per class is: **⌘ and ⌘⇧ likeliest to fire, ⌃ (MacCtrl) reported not to, ⌥ doubtful, a double fire
possible, and the page probably hearing the chord too** — every part of it for §7 to settle.

### 5.4 `accesskey`

An `accesskey="k"` on a real element in the panel (a hidden `<button>`) is the one web-platform key route that the browser matches for
the page, needs no extension API, and ends in a trusted click. It works only while the page has focus, like any page-level route. MDN
warns it "can conflict with a system or browser keyboard shortcut, or assistive technology functionality"
([`accesskey`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/accesskey)) **[docs]**.

- **Chrome:** the modifier on macOS is ⌃⌥, Shift ignored (`third_party/blink/renderer/core/input/keyboard_event_manager.h:31–37`,
  `.cc:211–216`). A real macOS keydown arrives as a `RawKeyDown`, so the page gets its `keydown` first and the access key is matched on
  the following `Char`: "Accesskeys are triggered by char events and can't be suppressed"
  (`core/frame/web_frame_widget_impl.cc:1487–1492`), which runs before the check for a prevented keydown (`:1502–1504`), so a page's
  `preventDefault()` does not stop it. The click is trusted (`keyboard_event_manager.cc:222` → `simulated_event_util.cc:180–183`) and the
  element is focused first (`:219–221`) **[source]**. The game hears the letter's `keydown` and `keyup` (`K` → nothing by default)
  **[inferred]**. VoiceOver uses the same ⌃⌥ chord; Chromium calls that conflict "Intended Behavior"
  ([crbug 41190972](https://issues.chromium.org/issues/41190972)) **[measured]**, tracker.
- **WebKit (Orion's page side):** ⌃⌥, Control alone only when the enhanced accessibility UI is on
  (`Source/WebCore/page/mac/EventHandlerMac.mm:764–772`), Shift ignored (`EventHandler.cpp:4284`). "On macOS, we process them before
  dispatching keydown … Then we dispatch keydown, but suppress its default handling", and the keydown goes out already
  `preventDefault()`ed (`EventHandler.cpp:4434–4457`); the element is focused and clicked (`HTMLElement.cpp:746–751`) **[source]**. So
  on WebKit the game's handler bails on that keydown (§3) and hears nothing of the letter **[inferred]**. Whether Orion's host takes
  ⌃⌥K before the web view is unknown (§5.3).
- **Firefox:** ⌃⌥ exactly (`ui.key.contentAccess` is `6` on Mac, "2 = Ctrl, 4 = Alt", `modules/libpref/init/StaticPrefList.yaml:20393–20397`;
  compared with `==`, so ⌃⌥⇧ does not count, `widget/WidgetEventImpl.cpp:1593–1605`). It is handled on the `keypress`, after the page's
  `keydown` listeners ran (`dom/events/EventStateManager.cpp:1346–1381`), and a page that prevents the `keydown` stops it, because the
  content process then never dispatches the `keypress` ("If content code called preventDefault() on a keydown event, then we don't
  want to process any following keypress events", `dom/ipc/BrowserChild.cpp:2453–2460`). The click is trusted
  (`EventStateManager.cpp:1937`, `dom/html/nsGenericHTMLElement.cpp:2489–2494`) and fires only if no other element shares the key
  (`EventStateManager.cpp:1908–1927`) **[source]**. The game hears `K`. **So on Firefox a panel that prevents ⌃⌥K kills its own access
  key**, where on Chrome and WebKit it does not **[inferred]** from the lines above.

None of the key tables read for §4 binds ⌃⌥K. It is a route the probe can carry for free: one hidden `<button accesskey="k">` in the panel
whose `click` logs `accesskey`.

### 5.5 DOM focus

Focus on a real element in the panel is not an entry route by itself. The game never reads `activeElement` and listens on `window`
whatever holds focus (#393's note §3.4) **[source]**, so focus mutes nothing, and the only key that moves focus to an element is Tab,
pressed once or several times depending on what else on the page can take focus. The game hears every Tab: it is unbound by default
and bindable (§3). The panel today has no focusable element at all: its controls are `div`s with `click` listeners
(`skills/coachemon/scripts/hud/90-render.js:190`, `:286`, `:304`) and the root stops `click`, `mousedown`, `pointerdown` and `touchstart`
(`:346`) **[source]**.

Whether Tab reaches a `<button>` by default on macOS differs per engine. In WebKit a form control with no `tabindex` is reached only
with macOS Full Keyboard Access or the browser's tab-to-links setting, which ⌥ flips (`Source/WebCore/html/HTMLFormControlElement.cpp:220–226`,
`page/EventHandler.cpp:5151–5173`, `WebProcess/WebPage/WebPage.cpp:5361–5365`) **[source]**; Orion has the setting
(`setTabFocusesLinks:` in its binary) **[measured]**. Firefox reaches a `<button>` by default: `accessibility.tabfocus` is 7 on every
platform, and the macOS checkbox toggles it between 7 and 3, both of which include buttons; Full Keyboard Access can only add to it
(`StaticPrefList.yaml:229–236`, `dom/base/FocusModel.h:36–45`) **[source]**. Chrome's default was not read here. An explicit
`tabindex="0"` makes the element reachable whatever the setting **[inferred]**.

Focus is what the panel does *after* a grab, for its own keys (#393's note §7.2), and the probe has nothing to measure for it as an
entry route beyond the Tab default.

### 5.6 The toolbar action and `_execute_action`

- **The click** is not a key press, but it is the one route that does not depend on any engine's keyboard handling, so it is the
  probe's baseline that "the action reaches the panel" works. `action` is a manifest key, not a permission. Today only the Firefox
  build declares one (`extension/src/build/manifest.ts`, `perTarget`), and there its click is the data-consent gesture:
  `startConsent` binds `action.onClicked` to `permissions.request(DATA_COLLECTION)` (`extension/src/transport/consent.ts:25`)
  **[source]**. A grab on that click gives one gesture two meanings.
- **`_execute_action`** "works like a click on a toolbar button" and `onCommand` "does not fire" (MDN, Chrome's reference) **[docs]**.
  In Firefox it is the same `<key>` as any command, with `triggerAction` instead of `onCommand` (`ExtensionShortcuts.sys.mjs:455–471`)
  **[source]**, so it hears the key after the page, as in §5.2. In Chrome it is an accelerator in the same high-priority registry
  (`chrome_command_dispatcher_delegate.mm:32–37`, item 2, "page/browser popup actions") **[source]**. It costs one of Chrome's four
  suggested keys, and on Chrome it needs an `action` key in the manifest that the Chrome build does not have. It can only do what a
  named command does, plus the click's meaning.
- **Orion**: its support sheet claims `action.onClicked` (§5.3). An open Orion report on 1.1.3 has `action.onClicked` firing where a
  popup was set ([orionfeedback #14707](https://orionfeedback.org/d/14707-actiongetpopup-gives-html-file-yet-actiononclicked-is-fired),
  2026-10-16, Under Review) **[measured]** by a third party; not this case, since the extension sets no popup.

### 5.7 Context menus, `chrome.userScripts`, and the OS

- **Context menu.** Chrome: "You must declare the `"contextMenus"` permission"
  ([`chrome.contextMenus`](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)); Firefox: "To use this API you
  need to have the `menus` permission" ([MDN `menus`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus))
  **[docs]**. The store build declares no permission of any kind (`BANNED_MANIFEST_KEYS` bans the `permissions` key itself,
  `manifest.ts`), and a right-click is a mouse gesture. Not a key route; adding it reverses the no-permission rule.
- **`chrome.userScripts`** needs the `userScripts` permission, `host_permissions`, Chrome 120+, and the user's per-extension "Allow User
  Scripts" toggle from Chrome 138 (Developer mode before) ([`chrome.userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts))
  **[docs]**. On Firefox (136+, MV3) "`userScripts` is an optional-only permission declared in the `optional_permissions` manifest
  key", plus host permissions ([MDN `userScripts`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts))
  **[docs]**; Orion's sheet has only Firefox's legacy rows. It injects scripts, which the content scripts already do; it adds nothing
  to how a key arrives. Not a route.
- **macOS App Shortcuts** (System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts) bind a key to a menu item by its title
  ([Kagi: Orion keyboard shortcuts](https://help.kagi.com/orion/support-and-community/keyboard-shortcuts.html) points Orion users there)
  **[docs]**. That reaches an extension only where the browser puts the command in its menu bar; none of the three is documented to,
  and Safari 26, which does, "prevented customization using System Settings" (Safari 26.0 release notes) **[docs]**. Not a route
  the product can set up.
- **`commands.update()`** is not a route but a probe tool: Firefox can set a command's chord at run time (§5.2), and Orion's sheet
  claims the same (§5.3).

---

## 6. What the probe build should declare

For #1018. A recommendation of what to probe, not a choice of route. Letters follow §4: **K** is free in every class probed here on all
three browsers, ⌘ on Firefox aside, so every class uses it, and the class is the only variable. **J** is a second letter for the classes where it is free too,
to tell a K-specific clash from a class that does not work.

### 6.1 Named commands

One command per chord, each logging its own name. Chrome refuses a manifest with more than four `mac` suggested keys (§5.1), and Orion
registers commands only from the Chrome-flavoured build (#411), so the Chrome-flavoured manifest carries **four suggested keys** and
declares the rest with no `suggested_key`, for the owner to bind by hand on each browser's shortcuts page. The Firefox build carries all
of them as suggested keys.

| command name | `suggested_key.mac` | class | Chrome build | Firefox build | expect (§5) |
|---|---|---|---|---|---|
| `probe-opt-k` | `Alt+K` | Option | suggested | suggested | Chrome fires; Firefox fires after the page; Orion unknown |
| `probe-ctrl-k` | `MacCtrl+K` | Control | suggested | suggested | Chrome, Firefox fire; Orion reported not to |
| `probe-cmd-k` | `Command+K` | Command | suggested | — (⌘K is Firefox's search) | Chrome fires; Orion reported to |
| `probe-cmd-shift-k` | `Command+Shift+K` | Command pair | suggested | suggested | fires; **Shift leaks STATS** |
| `probe-ctrl-shift-k` | `MacCtrl+Shift+K` | Control pair | bind by hand | suggested | Shift leaks STATS; Orion reported not to |
| `probe-opt-shift-k` | `Alt+Shift+K` | Option pair | bind by hand | suggested | Shift leaks STATS |
| `probe-cmd-ctrl-k` | `Command+MacCtrl+K` | pair, no Shift | bind by hand | suggested | Chrome and Firefox should fire; Orion unknown |
| `probe-ctrl-opt-k` | `MacCtrl+Alt+K` | pair, no Shift | **never** (fails the whole Chrome manifest) | suggested | Firefox only |
| `probe-opt-j` | `Alt+J` | Option, second letter | bind by hand | suggested | as `probe-opt-k` |
| `probe-ctrl-j` | `MacCtrl+J` | Control, second letter | bind by hand | suggested | as `probe-ctrl-k` |
| `probe-global` | `Command+Shift+1`, `"global": true` | Chrome global | bind by hand (as a suggestion it would be a fifth) | — | Chrome only |
| `_execute_action` | `Command+Shift+U` | the action | bind by hand; needs an `action` key in the Chrome build | suggested | as the named commands, then `action.onClicked` |

The four suggested keys in the Chrome-flavoured build are one per single modifier (⌥, ⌃, ⌘), plus ⌘⇧, the one pair with third-party
evidence on Orion (#11266). Binding by hand is a physical press into each browser's own shortcut recorder, so it is allowed; Orion's panel
"allows you to add a new shortcut for an action" (#11266, Kagi staff) **[measured]**. The alternative is two Chrome-flavoured builds
of four suggested keys each, swapped into the same folder; it costs a rebuild per swap but tests suggested keys rather than
user-bound ones, which on Orion may not be the same path **[inferred]**.

Chrome reads only the `mac` entry on macOS and needs no `default` when `mac` is present (`extensions/common/command.cc:231–241`), but
if a `default` is given it must parse on its own: no `Command`, `Option` or `MacCtrl` in it, and no `Ctrl+Alt` (§5.1) **[source]**. A
`default` of `Alt+Shift+K`-style Ctrl/Alt chords is safe. `MacCtrl+Alt+K` goes in the Firefox build only.

### 6.2 The page-level listener

One capture `keydown` listener on `window` in the panel (MAIN world), registered at `document_idle` with the rest of `hud.js`. It
**logs and does not prevent** on its first pass, so the command routes are measured undisturbed; a second, separately toggled mode
prevents the matched chord, which is what a shipped route would do and what decides row 12 on Firefox (§5.2).

- Match on `event.code` (`KeyK`, `KeyJ`, `Digit1`, `KeyU`) and the exact modifier set (`altKey`, `ctrlKey`, `metaKey`, `shiftKey`),
  never on `event.key` ([MDN: `code`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) "isn't altered by
  keyboard layout or the state of the modifier keys") **[docs]**.
- Log `isTrusted` rather than filter on it, in the probe. A shipped listener filters: `isTrusted` is false for anything sent with
  `dispatchEvent()` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)) **[docs]**, which stops the extension
  transport's `key` act (`src/page/acts.ts`, `window.dispatchEvent`) **[source]**. It does not stop the CDP transport's raw keys,
  which are trusted (§5.1); those are arrows, `z`, `x`, Enter and Escape only (`src/cdp/link.ts:22–31`), never a grab chord.
- Log `event.repeat`, `key`, `keyCode` and `defaultPrevented` as well; `key: "Dead"` marks a dead key.
- Listen for `keyup` too and log it. Whether the letter's `keyup` reaches the page after a command claimed its `keydown`, and after a
  ⌘ chord at all, decides whether a held key can stick (§3).

### 6.3 What the panel shows per press

A line per arrival, readable without devtools (the brief): the route (`command:<name>`, `action`, `page`, `accesskey`), the chord as
the page saw it, `isTrusted`, milliseconds since the previous arrival (so a double fire shows), and a counter. Plus, once on load, what
`commands.getAll()` reports for each command, because a suggested key Chrome did not assign, or one Firefox assigned under a built-in
shortcut, looks exactly like one that never fires (§5.1, §5.2). And a second, passive listener on `window` in the bubble phase, where
Phaser listens, which records whether the letter got there and with `defaultPrevented` set or not: that line is "what the game
heard". Phaser itself never prevents a key (#393's note §2.2), so the order of the two bubble listeners does not matter.

The relay already carries a `CustomEvent` from the background into the page; the probe's grab can be the same hop #418 built, with the
command name in its detail. `onCommand` passes the tab (Firefox from 126, MDN); where it does not (Orion, unknown), `tabs.query` for the
active tab needs no permission for its id (#392's note §4) **[docs]**.

### 6.4 Runbook notes for #1019

- Orion: swap each build into the folder already loaded, and press in a **newly opened** tab, never a reloaded one (#411). Read Orion's
  per-extension shortcuts panel after each swap to see what it registered. Try both the Chrome-flavoured and the Firefox build on
  Orion: #411 saw commands only from the Chrome one, but #11266's reporters ran Bitwarden's Firefox build with a working shortcut
  ([orionfeedback #11266](https://orionfeedback.org/d/11266-keyboard-shortcuts-for-extensions-bitwarden-autofill-not-working))
  **[measured]** by third parties.
- Not in Orion's compatibility mode, which "disables all extensions" for the site
  ([Kagi](https://help.kagi.com/orion/browser-extensions/macos-extensions.html)) **[docs]**.
- Press with the game page focused (click the canvas first), with no text field focused.
- Check the Option letter in Keyboard Viewer on the layout actually used (§4).
- Each press once, slowly, then once held for a second, to see repeats.

---

## 7. Open probes a physical press closes

Each is a question §5 answers only by expectation. The probe build of §6 closes all of them in one sitting per engine.

1. **Chrome, the command classes.** Do `probe-opt-k`, `probe-ctrl-k`, `probe-cmd-k`, `probe-cmd-shift-k` and `probe-cmd-ctrl-k`
   each fire `onCommand` exactly once, with no `keydown` for `K` reaching the page? Source says yes for all (§5.1). If ⌥K does not,
   and ⌃K does, Option is broken on this build despite `preSendEvent:`; if none fires, the extension path is.
2. **Chrome, the keyup after a claimed keydown.** Does the page get `K`'s `keyup` when the command took its `keydown`? Source says
   no (§5.1); if it does, a player-bound letter gets a keyup the game never saw pressed, the `splice(-1, 1)` edge of #393's note §5.3.
3. **Firefox, the order.** For each class, does the page log the `keydown` before the command arrives, and does the probe's
   "prevent" mode stop the command? Source says yes and yes (§5.2). With "prevent" off, how many milliseconds separate the page arrival
   from the command arrival? That sizes any debounce.
4. **Firefox, the dead key.** Does `Alt+U` never fire while `Alt+K` does (§5.2)? Closes whether the dead-key rule holds on the layout
   the owner types with.
5. **Orion, which class fires at all.** From the Chrome-flavoured build: which of ⌥K, ⌃K, ⌘K, ⌘⇧K, ⌘⌃K fire, and how many times per
   press? Then the same from the Firefox build, since #11266's reporters ran a Firefox build (§6.4). Read Orion's per-extension
   shortcut panel each time: it says what Orion registered. Closes #411's open Orion question and whether #2121 (MacCtrl, 2022) and
   #12054 (double fire, 1.0.3) still hold on 1.1.3.
6. **Orion, which hook carries a command.** When a command fires, does the page also log the `keydown`, and does the probe's
   "prevent" mode stop the command? Page first and stoppable means menu key equivalents, and Orion behaves like Firefox; the command
   with no page `keydown` means `sendEvent:`, a monitor or a hot key, and Orion behaves like Chrome (§5.3). The 2021 Kagi reply on #722
   ("passed keyboard input to web app so it has precedence over browser") points at the first, for browser shortcuts.
7. **Orion, `commands.update()` and `onCommand`'s `tab`.** Does `update()` change a binding (the sheet claims it, §5.3), and does
   `onCommand` pass a tab? Both are one line in the probe's background.
8. **The global command.** Does `probe-global` (⌘⇧1) fire on Chrome with the game focused and with Chrome in the background, with the
   page logging only the modifiers (§5.1)? If it fires and the in-window chords of probe 1 do not, Chrome's window path is at fault.
9. **`_execute_action`.** Does ⌘⇧U reach `action.onClicked` on each engine? On Firefox, also whether it raises the consent prompt
   when consent is not yet given.
10. **`accesskey`.** Does ⌃⌥K on a hidden `<button accesskey="k">` in the panel click it on each engine? Does the page log the `keydown`
    before the click (Chrome, Firefox) or with `defaultPrevented` already set (WebKit, §5.4)? With VoiceOver off.
11. **The Shift leak.** On a Shift chord, does the game show its stats (or, on starter select, jump to the filter) while the chord is
    held, as §3 reads from source? One look per engine.
12. **⌘ and keyup.** For each ⌘ chord the page hears, does the letter's `keyup` arrive? AppKit swallows it and Chrome 149+ forwards it
    (§5.1). Firefox has an open bug that it does not ("[Cocoa] Keyup events are not fired if cmd/meta key is pressed",
    [bug 1299553](https://bugzilla.mozilla.org/show_bug.cgi?id=1299553), NEW) **[measured]**, tracker; Orion is unread. If it does not
    arrive, a player-bound letter would stick in the game (§3) **[inferred]**.
13. **The page-level listener everywhere.** Does it see every chord its engine does not claim, with `isTrusted: true`, on all three?
    It is DOM-standard dispatch (`window` capture runs first, [DOM Standard, dispatching events](https://dom.spec.whatwg.org/#dispatching-events))
    **[docs]**, so the expectation is yes; this is the cheap confirmation.

---

## 8. Measured with a physical press

*Empty. Filled by [#1019](https://github.com/IIxauII/coachemon/issues/1019) from the owner's presses on the browsers in §1: engine ×
variant → fired / didn't / fired twice / leaked to the game, with what the panel logged.*

---

## 9. Sources

Line numbers in this note are at these revisions. Nothing below was run in a browser.

**Engine source**

- Chromium `main` at [`dbfbc95f6c55e99541f9c32c7a496a2faec69cc4`](https://github.com/chromium/chromium/tree/dbfbc95f6c55e99541f9c32c7a496a2faec69cc4)
  (2026-11-08): `ui/base/cocoa/command_dispatcher.mm`; `chrome/browser/ui/cocoa/chrome_command_dispatcher_delegate.mm`,
  `accelerators_cocoa.mm`, `main_menu_builder.mm`, `accelerator_utils_cocoa.mm`; `chrome/browser/chrome_browser_application_mac.mm`;
  `chrome/browser/extensions/commands/command_service.cc`; `chrome/browser/ui/views/extensions/extension_keybinding_registry_views.cc`;
  `chrome/browser/ui/views/frame/browser_view.cc`; `extensions/common/command.cc`,
  `extensions/common/api/commands/commands_handler.cc`, `extensions/common/manifest_constants.h`; `ui/base/accelerators/command.cc`,
  `ui/base/accelerators/global_accelerator_listener/global_accelerator_listener_mac.mm`;
  `ui/events/keycodes/keyboard_code_conversion_mac.mm`; `ui/views/controls/webview/unhandled_keyboard_event_handler.cc`;
  `components/input/web_input_event_builders_mac.mm`; `content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm`;
  `content/browser/devtools/protocol/input_handler.cc`; `content/browser/renderer_host/render_widget_host_impl.cc`;
  `third_party/blink/renderer/core/dom/events/event_target.cc`, `core/input/keyboard_event_manager.{h,cc}`,
  `core/frame/web_frame_widget_impl.cc`, `core/events/simulated_event_util.cc`; and commit
  [`708693710a`](https://github.com/chromium/chromium/commit/708693710a5a32e8d413bd81f55f07b62c932068) (⌘ keyups, 2026-05-01).
- Firefox `main` at [`b42441b06bc2b98160f12ee2dff262dd55583a9f`](https://github.com/mozilla-firefox/firefox/tree/b42441b06bc2b98160f12ee2dff262dd55583a9f)
  (2026-11-07): `toolkit/components/extensions/ExtensionShortcuts.sys.mjs`; `dom/events/GlobalKeyListener.cpp`,
  `dom/events/KeyEventHandler.cpp`; `dom/base/nsContentUtils.cpp`; `widget/cocoa/TextInputHandler.mm`, `widget/WidgetEventImpl.cpp`,
  `widget/TextEventDispatcher.cpp`, `widget/TextEvents.h`, `widget/NativeKeyToDOMCodeName.inc`;
  `browser/base/content/browser-sets.inc.xhtml`, `browser/locales/en-US/browser/browserSets.ftl`;
  `devtools/startup/DevToolsStartup.sys.mjs`, `devtools/startup/locales/en-US/key-shortcuts.ftl`;
  `modules/libpref/init/StaticPrefList.yaml`; `dom/events/EventStateManager.cpp`; `dom/ipc/BrowserChild.cpp`;
  `dom/html/nsGenericHTMLElement.cpp`; `dom/base/FocusModel.h`; `toolkit/components/extensions/schemas/user_scripts.json`.
- WebKit `main` at [`b2d2c2de1c74e095233e4ed243272fa7f0f89698`](https://github.com/WebKit/WebKit/tree/b2d2c2de1c74e095233e4ed243272fa7f0f89698)
  (2026-11-08): `Source/WebKit/UIProcess/mac/WebViewImpl.mm`, `Source/WebKit/UIProcess/WebPageProxy.cpp`,
  `Source/WebKit/WebProcess/WebPage/WebPage.cpp`, `Source/WebCore/page/EventHandler.cpp`, `Source/WebCore/page/mac/EventHandlerMac.mm`,
  `Source/WebCore/html/HTMLElement.cpp`, `Source/WebCore/html/HTMLFormControlElement.cpp`. For Safari's host only, not Orion's:
  `Source/WebKit/UIProcess/API/Cocoa/WKWebExtensionContext.h`, `Source/WebKit/UIProcess/Extensions/WebExtension.cpp`,
  `Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionCommandCocoa.mm`.
- PokéRogue v1.12.2.0 (the repo's pin), from the pinned clone: `src/main.ts`, `src/inputs-controller.ts`, `src/ui-inputs.ts`,
  `src/configs/inputs/cfg-keyboard-qwerty.ts`, `src/configs/inputs/config-handler.ts`; Phaser 3.90.0's
  `src/input/keyboard/KeyboardManager.js`.
- This repo: `extension/src/build/manifest.ts`, `extension/src/transport/consent.ts`, `extension/entrypoints/background.ts`,
  `src/page/acts.ts`, `src/cdp/link.ts`, `src/cdp/session.ts`, `skills/coachemon/scripts/hud/90-render.js`.

**The installed Orion 1.1.3 bundle**, read only, never run: `Contents/Info.plist`;
`Contents/Frameworks/WebKit.framework/Resources/Info.plist`; `strings` and `nm` over `Contents/MacOS/Orion`; and the `NSMenuItem` key
equivalents in `Contents/Resources/Base.lproj/Main.storyboardc/MainMenu.nib`, decoded from its NIBArchive format.

**Vendor documentation**

- Chrome: [`chrome.commands`](https://developer.chrome.com/docs/extensions/reference/api/commands),
  [`chrome.contextMenus`](https://developer.chrome.com/docs/extensions/reference/api/contextMenus),
  [`chrome.userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts).
- MDN: [`manifest.json/commands`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands),
  [`menus`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus),
  [`KeyboardEvent.code`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code),
  [`Event.isTrusted`](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted),
  [`keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event),
  [`accesskey`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/accesskey).
- Kagi: [Orion macOS Web Extensions Support](https://help.kagi.com/orion/browser-extensions/macos-extensions.html),
  [Orion WebExtensions API support](https://help.kagi.com/orion/misc/technical.html) and its linked support sheet,
  [Orion keyboard shortcuts](https://help.kagi.com/orion/support-and-community/keyboard-shortcuts.html),
  [release notes](https://orionbrowser.com/updates/orion-release-notes.html) (to 1.1.3; the
  [cdn.kagi.com copy](https://cdn.kagi.com/updates/orion-release-notes.html) stops at 1.1).
- Apple: [Handling Key Events](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/HandlingKeyEvents/HandlingKeyEvents.html),
  [`addLocalMonitorForEvents`](https://developer.apple.com/documentation/appkit/nsevent/addlocalmonitorforevents(matching:handler:)),
  [Enter characters with accent marks on Mac](https://support.apple.com/guide/mac-help/enter-characters-with-accent-marks-on-mac-mh27474/mac),
  [Safari 26.0 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) ("prevented
  customization using System Settings. (135360504)"), [developer forums 763878](https://developer.apple.com/forums/thread/763878)
  (Option-only hot keys, macOS 15.2).
- [DOM Standard, dispatching events](https://dom.spec.whatwg.org/#dispatching-events).

**Trackers**

- Orion, read through the forum's JSON API (`/api/discussions/<id>`):
  [#2121](https://orionfeedback.org/d/2121-keyboard-shortcuts-for-webextension-commands-that-include-the-control-key-do-not-work-properly),
  [#11266](https://orionfeedback.org/d/11266-keyboard-shortcuts-for-extensions-bitwarden-autofill-not-working),
  [#12054](https://orionfeedback.org/d/12054-the-readwise-highlighter-chrome-extension-triggers-twice-when-you-use-the-keyboard-shortcut),
  [#722](https://orionfeedback.org/d/722-extension-shortcuts-precedence-over-website-and-browser-shortcuts),
  [#427](https://orionfeedback.org/d/427-allow-remapping-extension-keyboard-shortcuts), [#9579](https://orionfeedback.org/d/9579),
  [#10109](https://orionfeedback.org/d/10109), [#10312](https://orionfeedback.org/d/10312), [#8184](https://orionfeedback.org/d/8184),
  [#14707](https://orionfeedback.org/d/14707-actiongetpopup-gives-html-file-yet-actiononclicked-is-fired).
  Searched for newer reports on 1.1.x: none about extension shortcuts.
- Chromium: [41085103](https://issues.chromium.org/issues/41085103), [41423856](https://issues.chromium.org/issues/41423856),
  [41143012](https://issues.chromium.org/issues/41143012), [41190972](https://issues.chromium.org/issues/41190972),
  [40880986](https://issues.chromium.org/issues/40880986), [438807261](https://issues.chromium.org/issues/438807261). No report found of an
  Option-only extension command failing on a real macOS press.
- Bugzilla: [1299553](https://bugzilla.mozilla.org/show_bug.cgi?id=1299553) (⌘ keyups on Cocoa, NEW). No bug found about an extension
  shortcut with Option failing on macOS; the nearest are Windows-side (`Alt+C` no longer assignable, 1952840 and 1954497, duplicates of
  1945032; a browser access key taking `Alt+A`, 2022691, fixed 2026-03).

**This repo's tickets and notes**: [#392](https://github.com/IIxauII/coachemon/issues/392) and its note on
[`research/browser-command-reach`](https://github.com/IIxauII/coachemon/blob/research/browser-command-reach/docs/research/browser-command-reach.md),
[#393](https://github.com/IIxauII/coachemon/issues/393) and its note on
[`research/game-keyboard`](https://github.com/IIxauII/coachemon/blob/research/game-keyboard/docs/research/game-keyboard.md),
[#405](https://github.com/IIxauII/coachemon/issues/405), [#411](https://github.com/IIxauII/coachemon/issues/411),
[#418](https://github.com/IIxauII/coachemon/pull/418), [#1010](https://github.com/IIxauII/coachemon/issues/1010). The owner's earlier
local note on this question was the starting list of sources; every source it cited and this note uses was read again here.
