# What PokéRogue does with the keyboard, and whether it can be made deaf

Research for [What PokéRogue does with the keyboard, and whether it can be made deaf](https://github.com/IIxauII/coachemon/issues/393), a child of [Operate the coach panel from the keyboard](https://github.com/IIxauII/coachemon/issues/391). Read against the **pinned clone**, `.cache/pokerogue/v1.12.0.11`, and the Phaser it vendors, **3.90.0** (`node_modules/phaser`, `package.json` `"phaser": "^3.90.0"`).

Facts are tagged the way [Extension distribution](../spec/extension-distribution.md) tags them:

- **[doc]**: read from the pinned game source or from Phaser's own source. Never exercised here.
- **[live]**: observed against a running game, with the version named. Only facts the repo already holds as live are marked so, and each says where it was recorded; **nothing in this document was newly exercised** — no game was run for it.
- **[unverified]**: an accepted premise nobody measured. §8 lists every one.

Vocabulary is `CONTEXT.md`. This document also says **grab key** for the one browser-level shortcut that hands the panel the keyboard, and **held state** for what `InputsController` believes is pressed.

---

## 1. The answer

**Yes — "while the panel holds the keyboard, the game hears nothing" is achievable, cleanly, and it costs one listener.**

The game reaches the keyboard through exactly one DOM listener pair, installed by Phaser's `KeyboardManager` on **`window`**, in the **bubble** phase **[doc]**. Phaser's own handler bails on its first line if `event.defaultPrevented` is already true **[doc]**. So a single `keydown`/`keyup` listener on `window` in the **capture** phase, calling `preventDefault()`, makes the game completely deaf — every key, every screen, no exceptions, no unbinding, no reaching into the game's internals, and nothing to undo but removing the listener.

Three further things the map assumed, which turn out differently and matter:

1. **DOM focus is irrelevant.** The game does not listen on the canvas and never consults `document.activeElement` (§3.4). Giving the panel focus does nothing on its own; the listener is the whole mechanism. Focus remains worth having for the panel's *own* keys, not for muting the game.
2. **Modifiers are ignored.** `InputsController` maps `event.keyCode` with no modifier check (§3.3). A grab key like `Ctrl+Shift+K` still reads to the game as bare `K`. Whatever the grab key is, it must be neutralised at the DOM level even when it carries modifiers — unless the browser swallows it first, which is §8's open premise.
3. **A swallowed `keyup` is a stuck, self-repeating button** (§5). This is the one real hazard in the handover and it needs a deliberate answer; §5.3 names the cheapest one.

---

## 2. Where the game binds keys

### 2.1 One listener pair, on `window`, bubble phase

`src/main.ts` builds the `Phaser.Game` with an `input` block that sets `mouse.target` and `touch.target` to `"app"` and `gamepad: true`, and **says nothing about `keyboard`** **[doc]**:

```ts
input: {
  mouse: { target: "app" },
  touch: { target: "app" },
  gamepad: true,
},
```

Phaser's defaults therefore apply (`node_modules/phaser/src/core/Config.js`) **[doc]**:

| Config | Default | Effect here |
|---|---|---|
| `input.keyboard` | `true` | the Keyboard Plugin runs |
| `input.keyboard.target` | `window` | **the listener target is `window`**, not `#app` and not the canvas |
| `input.keyboard.capture` | `[]` | Phaser itself never calls `preventDefault` on anything |

`KeyboardManager.startListeners` then does, verbatim **[doc]**:

```js
target.addEventListener('keydown', this.onKeyDown, false);
target.addEventListener('keyup', this.onKeyUp, false);
```

The third argument is `false` — **bubble phase**. That is the game's entire DOM keyboard surface. Nothing else in `src/` adds a `keydown` or `keyup` listener to any DOM node: a grep for `addEventListener` over the game's source turns up touch, pointer, resize, click and one file-input `change`, and no keyboard at all **[doc]**. The game's `index.html` adds only `load` and `beforeinstallprompt` **[doc]**.

### 2.2 Phaser bails on an already-prevented event

Both handlers begin identically (`KeyboardManager.js`) **[doc]**:

```js
this.onKeyDown = function (event) {
    if (event.defaultPrevented || !_this.enabled || !_this.manager) {
        // Do nothing if event already handled
        return;
    }
    _this.queue.push(event);
    ...
};
```

This is the seam. A capture-phase listener on `window` runs during the descent, strictly before any bubble-phase listener on `window`, and `preventDefault()` there sets `defaultPrevented` for everyone downstream. Phaser then discards the event without queueing it. No `stopPropagation` is needed, and the panel's own DOM listeners still see the key.

Because `input.keyboard.capture` is empty, `KeyboardManager.preventDefault` is `false` and Phaser never prevents a default itself **[doc]** — so today arrows and Space keep whatever native behaviour the page would give them. That also means nothing of the game's competes with a `preventDefault` of ours.

### 2.3 Delivery is deferred to the game step

`KeyboardManager` only queues. `KeyboardPlugin.update()` drains the queue on the game step and emits the scene-level `keydown`/`keyup` (`ANY_KEY_DOWN` / `ANY_KEY_UP`) events, and `KeyboardManager.postUpdate` clears the queue every step **[doc]**. `update()` returns early when `isActive()` is false, which is `this.enabled && this.scene.sys.canInput()` **[doc]** — and because the queue is cleared regardless, **events that arrive while the plugin is inactive are dropped, not replayed**. That is a second, coarser mute (§4.2).

---

## 3. What it takes, and how it decides

### 3.1 The listener the game hangs off Phaser

`src/inputs-controller.ts#InputsController.init` **[doc]**:

```ts
globalScene.input.keyboard?.on("keydown", this.keyboardKeyDown, this).on("keyup", this.keyboardKeyUp, this);
```

Two footnotes worth carrying:

- That line sits **inside** `if (typeof globalScene.input.gamepad !== "undefined")`, so the keyboard hookup is accidentally gated on the gamepad plugin existing. `main.ts` sets `gamepad: true`, so it always does **[doc]**. Not a lever — just a fragility to know about if a future pin removes gamepad support.
- `src/ui/settings/keyboard-binding-ui-handler.ts` registers a **second** `keydown` listener on the same plugin, in its constructor, permanently — guarded at runtime by `this.listening` **[doc]**. And `src/ui/settings/keyboard-settings-ui-handler.ts` creates real Phaser `Key` objects for `DELETE` and `HOME` **[doc]**. Both ride the same queue, so both die under the same mute.

### 3.2 Which keys it takes

`src/configs/inputs/cfg-keyboard-qwerty.ts` is the only keyboard layout the game has — `getConfigKeyboard` returns it for every id **[doc]**. Its `deviceMapping` enumerates **essentially the whole keyboard**: A–Z, 0–9, F1–F12, arrows, Enter, Esc, Space, Backspace, Tab, Shift, Ctrl, Alt, Del, Home, End, Insert, PageUp, PageDown, backtick, brackets, semicolon, quote, comma, period, both slashes, numpad `+`/`-` **[doc]**.

Bound out of the box (`default`) **[doc]**:

| Key | Button |
|---|---|
| ↑ ↓ ← → | `UP` `DOWN` `LEFT` `RIGHT` |
| W S A D | the same four (alt) |
| Enter | `SUBMIT` |
| Space, Z | `ACTION` |
| Backspace, X | `CANCEL` |
| Esc, M | `MENU` |
| C, Shift | `STATS` |
| R, Y | `CYCLE_SHINY` |
| F, T | `CYCLE_FORM` |
| G | `CYCLE_GENDER` |
| E | `CYCLE_ABILITY` |
| N | `CYCLE_NATURE` |
| V | `CYCLE_TERA` |
| PageUp / PageDown | `SPEED_UP` / `SLOW_DOWN` |
| Q | `DEV_CUSTOM`, **dev builds only** |

Unbound by default (`-1`): B, H, I, J, K, L, O, P, U, the digits, F1–F12, Ctrl, Alt, Del, End, Home, Insert, Tab, backtick, brackets, semicolon, quote, comma, period, both slashes, numpad `+`/`-` **[doc]**.

### 3.3 Modifiers are not looked at

`keyboardKeyDown` does one thing with the event **[doc]**:

```ts
const buttonDown = getButtonWithKeycode(this.getActiveConfig(Device.KEYBOARD)!, event.keyCode);
```

`getButtonWithKeycode` walks `deviceMapping` by keycode and nothing else (`src/configs/inputs/config-handler.ts`) **[doc]**. There is no `altKey`/`ctrlKey`/`metaKey`/`shiftKey` test anywhere on the path. Phaser's own modifier test exists only to decide whether to call `preventDefault` for a *captured* key, and the capture list is empty **[doc]**.

Consequence: `Cmd+R` reads as `R` → `CYCLE_SHINY`; `Ctrl+Shift+K` reads as `K` → unbound today, but assignable (§3.5). **A modified grab key is not automatically invisible to the game.**

### 3.4 DOM focus changes nothing

Nothing in the game's source reads `document.activeElement` or `document.hasFocus()` — the only focus words in `src/` are `InputText.setFocus` and `isFocused` on the game's own login fields **[doc]**.

The game's own text fields are the proof. `FormModalUiHandler` builds real DOM `<input>` elements through `phaser3-rex-plugins`' `InputText`, focuses the first after 50 ms, and that plugin does not call `stopPropagation` or `preventDefault` on keystrokes **[doc]**. So while the player types their password, every keystroke still bubbles to `window`, still reaches `InputsController`, and still becomes a `Button` — which is precisely how `FormModalUiHandler.processInput` gets `Button.SUBMIT` to submit the form on Enter **[doc]**.

That settles the ticket's third question flatly: **the game listens regardless of DOM focus, and only `preventDefault`, `stopImmediatePropagation` at capture, unbinding, or flipping one of Phaser's own flags will stop a key reaching it.** Blurring the canvas does nothing at all, because the canvas was never the target.

### 3.5 There is no key we can assume the player has not taken

The game has a full rebinding UI: Settings → Keyboard, `SettingsKeyboardUiHandler` and `KeyboardBindingUiHandler` **[doc]**. `assign()` will bind any keycode present in `deviceMapping` to any setting, clearing whatever held it **[doc]**. The result is written to `localStorage` under `mappingConfigs` (`GameData.saveMappingConfigs`) **[doc]**, so it survives reloads and differs per player.

The only protection is the layout's `blacklist` — `Enter, Esc, Space, Backspace, the four arrows, Del, Home` **[doc]**. `canIAssignThisKey`, `canIOverrideThisSetting` and `canIDeleteThisKey` all refuse on it **[doc]**. Those nine keys can never be reassigned or freed; everything else on the keyboard can be bound by the player, including Tab, the backtick, the brackets, Alt, Ctrl and every F-key.

So: **yes, a player can already have bound the key we want, and there is no key for which that is impossible.** A "pick a key the game doesn't use" strategy has no safe pick. That is an argument for the modal mute, not against it.

---

## 4. The mechanisms that actually make it deaf

Ranked by how little of the game they touch.

### 4.1 Capture-phase `preventDefault` on `window` — recommended

```js
const swallow = e => e.preventDefault();
window.addEventListener("keydown", swallow, true);
window.addEventListener("keyup", swallow, true);   // but see §5
```

- Kills the whole game input path at once: `InputsController`, the binding UI's second listener, and the settings UI's `Key` objects (§3.1) all feed off the queue Phaser refuses to fill **[doc]**.
- Touches no game object and no game module. Reverses by `removeEventListener`.
- The panel's own `keydown` handlers still run, in any phase, because propagation is untouched.
- Costs: it also suppresses the **browser's** default for those keys while the panel holds them — which is what we want for arrows and Space, and harmless for the panel, which has no text field (out of scope per #391).
- **Real keys and the driver's synthetic keys are separated by dispatch, not by intent.** A real `keydown` targets the focused element — `document.body`, or the panel — so `window` is only ever an ancestor, and a capture listener there runs strictly before Phaser's bubble listener. The driver's `key()` act calls `window.dispatchEvent` (`src/page/acts.ts`), so `window` is the **target**, the event is `AT_TARGET` there, and both listeners are invoked in registration order regardless of their capture flag — Phaser registered at game boot, long before the panel. So the driver's rung of the escape ladder should keep working through a held panel, while the player's own keys do not. Convenient, and fragile enough to be worth a test rather than a comment. **[unverified]** — read off the DOM dispatch rules, not exercised.

### 4.2 Flipping one of Phaser's flags — available, but reaches into the game

The panel already holds the live `Phaser.Game`: `skills/coachemon/scripts/hud/90-render.js` finds it through `Phaser.Display.Canvas.CanvasPool`, the same locator `src/page/locate.ts` documents **[doc]**. So all of these are one assignment away from the panel:

- `game.input.keyboard.manager.enabled = false` — `onKeyDown`/`onKeyUp` bail on the same line as `defaultPrevented` **[doc]**.
- `game.input.keyboard.manager.stopListeners()` — removes the listeners outright **[doc]**.
- `scene.input.keyboard.enabled = false` — `isActive()` false, `update()` returns early, and the queue is cleared anyway, so the keys are dropped rather than deferred **[doc]**.

All three work. None is recommended as the primary mechanism: each is a mutation of game state the panel would have to restore exactly, each would also mute the driver's synthetic `key()` rung of the escape ladder, and each is a new drift surface on a file the drift list does not yet watch (§7).

### 4.3 `stopImmediatePropagation` at capture — works, worse ergonomics

Stops dispatch dead at `window`, so Phaser's bubble listener never runs. But it also stops the descent to the panel's own element, so the panel would have to handle every key inside that one window-capture listener rather than on its controls. Strictly more coupling for the same result as §4.1.

### 4.4 Unbinding the game's handlers, or blurring the canvas — no

`scene.input.keyboard.off("keydown", ...)` needs the exact bound references and misses the binding UI's second listener. Blurring the canvas does nothing (§3.4).

---

## 5. Held keys across the handover — the real hazard

### 5.1 What the game remembers

`InputsController` keeps two pieces of held state **[doc]**:

- `buttonLock: Button[]` — a `keydown` for a button already in it returns immediately, so the button is *dead* until its `keyup`.
- `inputInterval[button]` — a `setInterval` started on `keydown` that re-emits `input_down` **every 250 ms** (`repeatInputDelayMillis`). This is the game's key-repeat.

Both are cleared only by `keyboardKeyUp`, by a fresh `keydown` of the same button, or by `deactivatePressedKey()`.

Note the asymmetry with the gamepad path: the gamepad's repeat callback re-checks `buttonLock` and clears itself when the button is gone; **the keyboard's repeat callback has no such guard** **[doc]**:

```ts
this.inputInterval[buttonDown] = setInterval(() => {
  this.events.emit("input_down", { controller_type: "keyboard", button: buttonDown });
}, repeatInputDelayMillis);
```

### 5.2 So: a key held across the grab, released after it

If the player is holding ↓ to walk a list, hits the grab key, and the panel then swallows the `keyup`:

- the game never runs `keyboardKeyUp`;
- `buttonLock` keeps `DOWN` forever, so the key is dead when the panel hands it back;
- `inputInterval[DOWN]` **keeps firing `input_down` at 4 Hz, forever**, driving the cursor through whatever UI is showing.

That is a run-ruining bug, not a cosmetic one, and it is entirely a consequence of a symmetric swallow. **[doc]**, from reading the handlers; not exercised.

The reverse case — a key pressed *during* the handover and released after it — is the benign one, provided keyups are let through (§5.3).

### 5.3 What does not save us, and what does

- **`Phaser.Core.Events.BLUR` will not fire.** `InputsController.init` hooks BLUR to `loseFocus()` → `deactivatePressedKey()` **[doc]**, but Phaser emits BLUR from `window.onblur` in `core/VisibilityHandler.js` **[doc]**. Focusing a DOM element inside the same window does not blur the window. The handover is invisible to it.
- **Let `keyup` through; swallow only `keydown`.** The narrowest fix. Every `keydown` the panel owns is refused, and every `keyup` still resolves the game's held state, so nothing can stick. The residue is small and worth naming: a `keyup` for a button the game never saw pressed runs `buttonLock.splice(buttonLock.indexOf(buttonUp), 1)` with `indexOf` returning `-1`, and **`splice(-1, 1)` removes the last element of `buttonLock`** **[doc]** — it can evict some *other* genuinely-held button from the lock. With keydowns swallowed the lock is normally empty, so this is near-harmless, but it is a real sharp edge. It also emits `input_up`, which is a no-op for every button except `STATS` (hides the stat overlay) and `CYCLE_TERA` (hides the flyout) **[doc]**.
- **Or clear the game's held state at the moment of the grab**, once, and then swallow both: `battleScene().inputController.deactivatePressedKey()` is public, clears every repeat interval and empties `buttonLock` **[doc]**, and the panel already has the scene. This is the §4.2 category — a reach into the game — but it is one idempotent call with no state to restore, which is a far smaller reach than muting by flag.

The two can be combined; `#397`/`#399` should pick one and say why.

---

## 6. Does it differ by screen?

**No, not at the level this question is about.** **[doc]**

`BattleScene.create()` removes the `LoadingScene` outright (`this.scene.remove(LoadingScene.KEY)`) and constructs the single `InputsController` and `UiInputs`. From then on there is **one Phaser scene** (`"battle"`), one `KeyboardManager`, one `KeyboardPlugin`, one listener pair on `window`. The title screen, a battle, the shop, the starter select and the menus are all `UiMode`s of that one scene — `src/enums/ui-mode.ts` holds about fifty of them, and `globalScene.ui.getMode()` is what changes.

What differs is only what a delivered button *does*, decided in `src/ui-inputs.ts` and the active handler:

- `buttonMenu()` refuses outright when `globalScene.disableMenu` is set, and otherwise switches on the mode: it opens the menu overlay from `TITLE`, `COMMAND`, `MODIFIER_SELECT` and `MYSTERY_ENCOUNTER`; from `MESSAGE` only when the handler has a `pendingPrompt` and no text animation running; from `STARTER_SELECT` and `POKEDEX_PAGE` it falls through to a touch/submit; from `MENU` it reverts; everything else falls to `default: return` **[doc]**. So there genuinely are screens where the game will not open or close its menu — but it still *hears* the key on every one of them.
- `buttonGoToFilter` and `buttonCycleOption` gate on the handler class through whitelists **[doc]**.

The practical reading for #391: a mute installed on `window` is mode-independent and needs no knowledge of the game's state machine; and conversely, "a menu the game will not release" is not a keyboard-layer problem at all, it is the handler refusing the button. The panel's mute neither helps nor hurts there.

One more difference worth recording: the **touch controls do not go through the DOM keyboard at all**. `TouchControl.simulateKeyboardEvent` emits `input_down`/`input_up` straight onto the `InputsController` event emitter **[doc]**, despite the name. Nothing that intercepts DOM keys will mute the on-screen controls. Irrelevant to the sighted keyboard player #391 serves; not irrelevant if the mute is ever sold as "the game is frozen".

---

## 7. What this forces

1. **The map's modal handover stands, and its mechanism is one capture-phase listener on `window` that calls `preventDefault()`.** Not unbinding, not blurring, not per-key interception, and not — for the primary path — mutating Phaser. §4.1.
2. **Focus stops are for the panel, not for the game.** `tabindex` and a focus ring earn their place because the panel's own controls need them (#391's "all three controls are keyboard-reachable"), not because focus mutes anything. Any ticket that reasons "the game stops listening once we have focus" is wrong. §3.4.
3. **The handover must decide what it does with `keyup`, explicitly.** Swallow both and a key held across the grab repeats forever at 4 Hz; swallow only `keydown` and the game's held state always resolves, at the price of a `splice(-1, 1)` sharp edge. §5. This is the one decision in this area that can break a run, and it belongs in the ticket that specifies the handover — probably [#397](https://github.com/IIxauII/coachemon/issues/397).
4. **The grab key cannot be chosen by "the game doesn't use it".** Every key but the nine blacklisted ones is player-assignable, and the game ignores modifiers. The grab key's safety comes from the mute and from whether the browser consumes the chord (§8), never from the key itself. §3.3, §3.5.
5. **"Whether the key should ever be refused"** (#391's fog) gets a partial answer: the *game* has no moment at which a DOM-level mute is unsafe, because it has one scene and one listener. The reasons to refuse a grab, if any, are about the player's attention mid-animation, not about the game's input layer.
6. **A drift watch is now justified on the input path.** [Extension distribution §10.4](../spec/extension-distribution.md) already promised that `InputsController.keyboardKeyDown` and `getButtonWithKeycode` "join `scripts/hud-deps.ts`'s drift list" — a grep of `scripts/hud-deps.ts` and `src/escape-ladder/` finds neither, so **that promise is unkept**. If the panel's mute rests on `KeyboardManager`'s `defaultPrevented` bail and on the `keyup` bookkeeping in `InputsController`, those refs should be on the list at the next pin bump. §5.1, §2.2.
7. **Nothing here needs a permission**, and nothing here needs the panel to be inside `#app`. The panel is a `position: fixed` child of `document.body` with `zIndex: 2147483647` (`90-render.js`) **[doc]**, a sibling of the game's container, which is exactly right for a `window`-level listener.

---

## 8. Open premises

Every one of these is **[unverified]**. A build ticket that meets one checks it rather than assuming it.

1. **Does a browser `commands` shortcut deliver its `keydown` to the page at all?** If Chrome/Firefox consume the chord, the grab key never reaches `window` and §3.3's "modifiers are ignored" is moot for the grab key specifically — but not for anything else the panel binds. If they do deliver it, the mute must already be installed by the time the command's handler runs, which it cannot be on the first press. **This is the sharpest untested thing on the path and it decides whether the first press of the grab key leaks a button into the game.**
2. **macOS `Cmd`-chords and missing `keyup`.** A held `Cmd` is widely reported to suppress `keyup` for the other key. If the grab key carries `Cmd`, §5's stuck-repeat case can be produced by the grab key itself. Unmeasured here.
3. **Nothing in this document was exercised against a running game.** The mechanism in §4.1 has not been watched working; the stuck-repeat in §5.2 has not been reproduced. Both are read from source that is unambiguous, but "unambiguous" is not "observed". A prototype ticket on this map is the cheap place to close both.
4. **Firefox and Safari.** Everything here is engine-neutral DOM and Phaser behaviour, so it should hold, but the repo's only **[live]** fact on this path — "Phaser never checks `isTrusted`", recorded in [Extension distribution §10.4](../spec/extension-distribution.md) against Chrome — is itself marked unverified on Firefox and Safari.
5. **Whether a held panel still lets the driver through.** §4.1's last bullet argues it does, from registration order at `AT_TARGET`. If it does not, the mute and the escape ladder's `key` rung are in conflict and one of them needs a flag.
6. **The CDP transport.** #391 already notes that only one of `hud.js`'s two injection routes has a background page to deliver a browser command. Nothing here changes that; a capture listener works identically under either route, but the *grab* does not exist under CDP.

---

## 9. Sources

All paths relative to `.cache/pokerogue/v1.12.0.11` unless marked as this repo's.

| Claim | Source |
|---|---|
| No `keyboard` key in the game config | `src/main.ts` |
| `target` defaults to `window`, `capture` to `[]` | `node_modules/phaser/src/core/Config.js` |
| Listeners added with `false` (bubble); `defaultPrevented` bail; `enabled`; `stopListeners`; `addCapture` | `node_modules/phaser/src/input/keyboard/KeyboardManager.js` |
| Deferred dispatch, `isActive()`, queue cleared each step, `resetKeys` | `node_modules/phaser/src/input/keyboard/KeyboardPlugin.js` |
| `canInput()` | `node_modules/phaser/src/scene/Systems.js` |
| BLUR comes from `window.onblur` | `node_modules/phaser/src/core/VisibilityHandler.js`, `src/core/Game.js` |
| `keyboardKeyDown`/`keyboardKeyUp`, `buttonLock`, `inputInterval`, `deactivatePressedKey`, BLUR hookup | `src/inputs-controller.ts` |
| `Button` enum | `src/enums/buttons.ts` |
| Layout, defaults, blacklist | `src/configs/inputs/cfg-keyboard-qwerty.ts` |
| `getButtonWithKeycode`, `assign`, `canIAssignThisKey`, `deleteBind` | `src/configs/inputs/config-handler.ts` |
| Button → action, `buttonMenu` mode switch, whitelists | `src/ui-inputs.ts` |
| Second `keydown` listener, binding blacklist | `src/ui/settings/keyboard-binding-ui-handler.ts` |
| `Key` objects for DELETE/HOME | `src/ui/settings/keyboard-settings-ui-handler.ts` |
| DOM `<input>`s, autofocus, `processInput(SUBMIT)` | `src/ui/handlers/form-modal-ui-handler.ts` |
| rex `InputText` does not stop propagation | `node_modules/phaser3-rex-plugins/plugins/gameobjects/dom/inputtext/` |
| Touch controls bypass the DOM keyboard | `src/touch-controls.ts` |
| One scene; `LoadingScene` removed; `InputsController` constructed in `create()` | `src/battle-scene.ts`, `src/loading-scene.ts` |
| Bindings persisted to `localStorage.mappingConfigs` | `src/system/game-data.ts` |
| Panel is a fixed `document.body` child; holds the Phaser game | this repo, `skills/coachemon/scripts/hud/90-render.js` |
| The locator; the synthetic `key()` act on `window` | this repo, `src/page/locate.ts`, `src/page/acts.ts` |
| `isTrusted` unchecked **[live]** Chrome; the unkept drift promise | this repo, `docs/spec/extension-distribution.md` §10.4 |
