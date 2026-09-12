# Research: detecting a settled game

Ticket: `.scratch/pokerogue-mcp-v1/issues/02-settled-game.md`
Date: 2026-09-12

## Sources

Primary source is the PokéRogue repo, `github.com/pagefaultgames/pokerogue`, read at two refs:

- **`main` @ `e4e9b5383be7c9e171d32a9daaea2658d475c521`** — `chore!: Hotfix 1.12.0.11 to main (#7577)`, `package.json` version `1.12.0.11`. This is the production lineage; **all citations below are to `main` unless noted.**
- **`beta` @ `da1d0efff3c48b5b4f2b9eb448051793971999bd`** — read as a drift check. Every file this note depends on is functionally identical on both refs (`phase-manager.ts` differs only by an import reorder and a `DancerPhase` addition; the UI handlers differ only in cosmetics). The one relevant divergence is where game speed lives — see [Game speed](#game-speed).

Live verification was done against `https://pokerogue.net` **pre-login only** (no account exists yet — ticket 04). Claims are tagged **[source]** or **[live]**.

**[live]** The production build reports `Phaser.VERSION === "3.90.0"`, `window.gameInfo.gameInfoVersion === "2.1.0"` (matches `battle-scene.ts:3188` on `main`), `ui.handlers.length === 48` (matches the 48-entry `UiMode` enum on both refs), and `scene.gameSpeed === 3` — a property that exists on `main` (`battle-scene.ts:186`) and **not** on `beta`. So the live site is the `main` lineage.

**[live]** Minification preserves property and class names. `handler.constructor.name` returned `"LoginOrRegisterUiHandler"`, `ui.getMessageHandler().constructor.name` returned `"BattleMessageUiHandler"`, and every TypeScript `private`/`protected` field this note reads is a plain, readable runtime property:

```
scene.phaseManager   own keys: ["phaseQueue","dynamicQueueManager","currentPhase","standbyPhase"]
scene.ui             "overlayActive" in ui === true
pm.phaseQueue        own keys: ["levels","currentLevel","deferredActive"]
pm.getCurrentPhase() -> { phaseName: "LoginPhase" }
```

TypeScript `private` is erased at compile time, not mangled, and Vite/esbuild does not rename object properties by default. Everything below is therefore reachable over CDP.

---

## 1. What `scene.phaseManager` exposes

`PhaseManager` (`src/phase-manager.ts`) holds:

| Member | Access | Useful? |
|---|---|---|
| `getCurrentPhase(): Phase` | public method (`:270`) | **Yes** — `.phaseName` is a stable string (`src/phase.ts`, `Phase.phaseName` is `abstract readonly`, set per subclass) |
| `currentPhase` | TS `private` (`:248`), readable at runtime | same thing, one property read |
| `standbyPhase` | TS `private` (`:251`) | set only by `overridePhase`; non-null means a phase was temporarily displaced |
| `phaseQueue: PhaseTree` | TS `private` (`:242`) | queue depth via `phaseQueue.levels` (a `Phase[][]`, `src/phase-tree.ts:23`) |
| `dynamicQueueManager` | public (`:245`) | priority queues for `MovePhase` etc. |

**There is no "running" flag and no completion callback.** `Phase.end()` calls `phaseManager.shiftPhase()`, which starts the next phase synchronously (`phase-manager.ts:341-372`). A phase that is waiting on a tween, a `delayedCall`, or a `fetch` is simply a phase that has not called `end()` yet — indistinguishable, from the manager's point of view, from one waiting on the player.

**Queue length is not a busy signal.** `TurnInitPhase.start()` pre-queues `CommandPhase`, `EnemyCommandPhase` and `TurnStartPhase` (`src/phases/turn-init-phase.ts:68,70,75`) *before* the player is asked anything. So while the game sits settled at the command menu, `phaseQueue.levels` is non-empty. Conversely an empty queue does not mean idle: `shiftPhase` falls through to `turnStart()`, which manufactures a fresh `TurnInitPhase` (`:341-357`, `:476`). Use queue depth for diagnostics only, never as the predicate.

**`currentPhase.phaseName` is the single most useful field here**, but as a *progress* signal (it changes as the queue drains), not as a settled signal. See [§5](#5-the-fingerprint).

### Which phases wait for the player

There is no marker on the class. A phase awaits input exactly when it has called `ui.setMode(...)` with an interactive handler and handed it a callback, and will not `end()` until that callback fires. Grepping `src/phases/*.ts` for `ui.setMode*` gives the set: `CommandPhase` (COMMAND/FIGHT), `SelectTargetPhase` (TARGET_SELECT), `SelectModifierPhase` (MODIFIER_SELECT, PARTY), `SwitchPhase`/`CheckSwitchPhase` (PARTY/CONFIRM), `LearnMovePhase`, `GameOverPhase`, `SelectBiomePhase` (OPTION_SELECT), `MysteryEncounterPhase`, `TitlePhase`, `SelectStarterPhase`, `EvolutionPhase`, `EggHatchPhase`, `AttemptCapturePhase`, plus any `MessagePhase` constructed with `prompt = true`.

Enumerating that list in the server would be brittle. **Derive settledness from the UI instead** — that is where the game itself makes the decision.

---

## 2. The signal that actually distinguishes waiting from busy

### `ui.mode` alone is useless; `ui.mode === MESSAGE` is the *busy* default

`CommandPhase.end()` is `globalScene.ui.setMode(UiMode.MESSAGE).then(() => super.end())` (`src/phases/command-phase.ts`). Every non-interactive phase in a turn therefore runs with `ui.mode === UiMode.MESSAGE (0)`. Every genuine player decision happens in some *other* mode — with one exception: a **prompted message**, which waits in MESSAGE mode for an ACTION press.

### `ui.overlayActive` — the game's own "input is blocked" flag

```ts
// src/ui/ui.ts:262
public processInput(button: Button): boolean {
  if (this.overlayActive) { return false; }
  ...
}
```

`overlayActive` is set by `fadeOut()` (`ui.ts:490-496`) and cleared by `fadeIn()`. `setModeInternal` fades whenever the old or new mode is in `transitionModes` (`ui.ts:67-79`: SAVE_SLOT, PARTY, SUMMARY, STARTER_SELECT, EVOLUTION_SCENE, EGG_HATCH_SCENE, EGG_LIST, EGG_GACHA, POKEDEX, POKEDEX_PAGE, CHALLENGE_SELECT, RUN_HISTORY) and is not in `noTransitionModes`. The fade window is `fadeOut(250)` → `delayedCall(100)` → mode swap → `fadeIn(250)`; `fadeIn` clears `overlayActive` *synchronously at its start*, in the same tick as the mode swap, so **there is no frame where the new mode is live but `overlayActive` is still true.** Good: a straight `overlayActive === true ⇒ busy` rule has no false-busy tail and no false-settled window.

### `handler.active` — necessary, not sufficient

`UiHandler.active` is `public` (`src/ui/handlers/ui-handler.ts:11`), set in `show()` and cleared in `clear()`. For the handlers with no internal gate — `CommandUiHandler`, `FightUiHandler`, `BallUiHandler`, `TargetSelectUiHandler`, `MysteryEncounterUiHandler` — `active === true` *is* the whole readiness condition: their `processInput` has no early return, so any press lands.

For everything else there is a per-handler gate. A sweep of the first 10 lines of every `processInput` in `src/ui/handlers/*.ts` gives the complete gate inventory:

| Gate | Handlers |
|---|---|
| `blockInput` | `BaseOptionSelectUiHandler` (→ CONFIRM, OPTION_SELECT, MENU_OPTION_SELECT, TITLE, AUTO_COMPLETE), `PartyUiHandler`, `StarterSelectUiHandler`, `PokedexUiHandler`, `PokedexPageUiHandler` |
| `blockInputOverlay` | `PokedexPageUiHandler` |
| `transitioning` | `SummaryUiHandler`, `EggGachaUiHandler` |
| `blockExit` | `EggSummaryUiHandler` |
| `pendingPrompt` | `MessageUiHandler` subclasses (`PartyUiHandler` checks it explicitly) |
| `awaitingActionInput` **and** `onActionInput` | `BattleMessageUiHandler`, `EvolutionSceneUiHandler`, `ModifierSelectUiHandler` |

`BaseOptionSelectUiHandler` sets `blockInput = true` for `config.delay` ms after showing and clears it via `delayedCall(fixedInt(this.config.delay), () => this.unblockInput())` (`:183-186`) — a real, several-hundred-ms window in which a CONFIRM box is on screen and rejecting presses.

### `awaitingActionInput` is the flag for the three handlers that animate before accepting input

`ModifierSelectUiHandler` (the between-wave shop) is the load-bearing case. `show()` sets `active = true` immediately but then:

```ts
// src/ui/handlers/modifier-select-ui-handler.ts (main), inside show()
// DO NOT REMOVE: Fixes bug which allows action input to be processed before the UI is shown,
// causing errors if reroll is selected
this.awaitingActionInput = false;
```

…and only sets `awaitingActionInput = true` at the end of the reward-reveal animation chain (`:394`). `processInput` opens with `if (!this.awaitingActionInput) { return false; }` (`:409`). **Treating `active` as settled here would have the server pressing into the shop reveal animation — exactly the bug the upstream comment is guarding against.**

**A trap: `awaitingActionInput` is sticky.** `BattleMessageUiHandler.processInput` (`:158-169`) nulls `onActionInput` when it consumes a press but *never resets `awaitingActionInput`*, and neither `AwaitableUiHandler` nor `MessageUiHandler` resets it in `clear()`. After the first prompted message of a run, `awaitingActionInput` stays `true` forever. The predicate must require **`awaitingActionInput === true && onActionInput != null`**; `awaitingActionInput` on its own reports settled the whole time the turn is resolving.

**[live]** A related trap, confirmed on the idle pre-login screen: `MessageUiHandler.isTextAnimationInProgress()` (`message-ui-handler.ts:260`) returns `this.textTimer.repeatCount < this.textTimer.repeat`, and a finished timer has `repeatCount === 0` with `repeat` still at the character count. The live login screen, with nothing animating, reports:

```
textTimer: { repeat: 56, repeatCount: 0, hasDispatched: true, getOverallProgress: 1 }
isTextAnimationInProgress() -> true      // sticky, wrong
scene.time._active.length -> 0           // nothing actually scheduled
```

**Do not use `isTextAnimationInProgress()`.** The correct text-animating check is `h.textTimer && h.textTimer.hasDispatched !== true`. **[live]** `Phaser.Time.TimerEvent.prototype.remove` on 3.90.0 is `function(e){e===void 0&&(e=!1),this.elapsed=this.delay,this.hasDispatched=!e,this.repeatCount=0}` — so a timer killed by `showTextInternal`'s `this.textTimer.remove()` also ends up `hasDispatched === true`. The flag is only `false` while a timer is genuinely live (including while `paused` during an `@d{}`/`@f{}` char delay).

### Signals that look useful and are not

**[live]** Tween count and timer count, sampled on the *idle* pre-login screen:

```
scene.tweens.getTweens().length -> 7     // all playing; 6 with repeat:-1 and duration 4e14
scene.time._active.length       -> 0
```

- **`scene.tweens` is not a busy signal.** Six permanently-looping tweens run on a screen where nothing is happening. A filtered count (finite `duration`, `repeat !== -1`, `loop === 0`) is a plausible *corroborating* signal, but it is a heuristic over a private Phaser array and should not gate anything.
- **`scene.time._active.length === 0`** is a decent quiescence corroborator and matched reality here, but it is a Phaser internal. Diagnostics only.
- `scene.disableMenu` (`battle-scene.ts:185`) only suppresses the MENU button (`ui-inputs.ts:186`). Not a settle signal.
- `ui.modeChain` is a stack of pushed overlay modes, not a busy flag. Worth carrying in the fingerprint.

---

## 3. The predicate

`UiMode` integers below are from `src/enums/ui-mode.ts` and are **identical on `main` and `beta`** (the only difference is `SETTINGS` being renamed `SETTINGS_GENERAL` at index 18). `LOGIN_OR_REGISTER === 32` **[live]**, consistent with the README recon. Once ticket 01 lands the codegen'd enum table, substitute the generated names for these literals rather than re-typing them.

```js
(function () {
  var scene = Phaser.Display.Canvas.CanvasPool.pool[0].parent.game.scene.getScene('battle');
  if (!scene || !scene.ui || !scene.phaseManager) {
    return { settled: false, reason: 'no-scene' };
  }

  // UiMode, as of 1.12.0.11 (same on beta)
  var MESSAGE = 0, MODIFIER_SELECT = 6, EVOLUTION_SCENE = 11, EGG_HATCH_SCENE = 12,
      LOADING = 35, UNAVAILABLE = 36;

  var ui = scene.ui;
  var mode = ui.mode;
  var h = ui.handlers[mode];
  var mh = ui.handlers[MESSAGE];               // BattleMessageUiHandler
  var phase = scene.phaseManager.getCurrentPhase();
  var phaseName = phase ? phase.phaseName : null;

  // awaitingActionInput is never reset on consumption, so onActionInput is the live half
  function awaiting(x) {
    return !!x && x.awaitingActionInput === true && x.onActionInput != null;
  }
  // isTextAnimationInProgress() is sticky-true; hasDispatched is the honest flag
  function typing(x) {
    return !!x && !!x.textTimer && x.textTimer.hasDispatched !== true;
  }

  var settled = false, reason;
  if (ui.overlayActive === true)          { reason = 'ui-transition'; }
  else if (!h || h.active !== true)       { reason = 'handler-inactive'; }
  else if (h.blockInput === true)         { reason = 'block-input'; }
  else if (h.blockInputOverlay === true)  { reason = 'block-input-overlay'; }
  else if (h.transitioning === true)      { reason = 'transitioning'; }
  else if (h.blockExit === true)          { reason = 'block-exit'; }
  else if (h.pendingPrompt === true)      { reason = 'pending-prompt'; }
  else if (typing(h) || typing(mh))       { reason = 'text-animating'; }
  else if (mode === LOADING || mode === UNAVAILABLE) { reason = 'modal-blocking'; }
  else if (mode === MESSAGE || mode === EVOLUTION_SCENE || mode === MODIFIER_SELECT) {
    settled = awaiting(h);                     // these three gate on awaitingActionInput
    reason = settled ? 'awaiting-action' : 'resolving';
  }
  else if (mode === EGG_HATCH_SCENE) {
    settled = awaiting(mh);                    // delegates to the message handler
    reason = settled ? 'awaiting-action' : 'hatching';
  }
  else { settled = true; reason = 'menu-open'; }

  return {
    settled: settled,
    reason: reason,
    mode: mode,
    phaseName: phaseName,
    tutorialActive: h ? h.tutorialActive === true : false,
    // progress fingerprint - see section 5
    fp: [phaseName, mode, ui.modeChain.join('.'), h && h.cursor,
         mh && mh.message ? mh.message.text : ''].join('|')
  };
})()
```

Send it with `Runtime.evaluate({ expression, returnByValue: true })`. It mutates nothing — every call in it is a getter or an accessor. **[live]** Measured on the pre-login page: 1.8 ms for a cold `eval` of the source (compile included), 0.001 ms per call once compiled. Polling it at 10 Hz is free.

If a bare boolean is wanted, `….settled`. The object form is strictly better: `reason` is what makes a settle timeout debuggable, and `fp` is needed for the progress check.

**[live] verification.** The block above was extracted verbatim from this file and `eval`'d on the pre-login page; it returns:

```json
{"settled":true,"reason":"menu-open","mode":32,"phaseName":"LoginPhase",
 "tutorialActive":false,"fp":"LoginPhase|32||0|Log in or create an account…"}
```

which is correct — the game is genuinely waiting on the Login/Register menu. Each busy branch was also proved reachable live by toggling the underlying flag and re-running: `overlayActive=true → "ui-transition"`, `handler.active=false → "handler-inactive"`, `handler.blockInput=true → "block-input"`, then restored to `"menu-open"`.

**The in-battle branches (`resolving`, `awaiting-action`, `hatching`, `text-animating`) are source-derived only.** They could not be exercised without an account. They are the branches to re-check first in the one-wave prototype (ticket 05).

---

## 4. Poll interval and timeouts

### Game speed

**[live]** `scene.gameSpeed === 3` (the default, `GameSpeed.NORMAL`; the setting offers 2/3/4/5 — `src/system/settings/settings.ts:206-230`). `initGameSpeed` (`src/system/game-speed.ts`) monkey-patches `scene.time.addEvent`, `scene.tweens.add/chain/addCounter/create/addMultiple` and divides every `delay`/`duration`/`hold`/`startDelay`/… by `scene.gameSpeed`. `scene.time.timeScale` stays `1` **[live]** — the scaling is applied at schedule time, not globally, so it cannot be read off the clock.

Two consequences:

1. **Set game speed to 5 (Turbo).** All scaled animation time shrinks by 5/3. On `beta` this setting moved to `settings.general.gameSpeed`; on the live `main` build it is `scene.gameSpeed`, so ticket 04's profile provisioning should set it through the settings UI rather than by poking the property.
2. **`fixedInt(n)` durations are exempt** (`game-speed.ts:24-29`, `utils/common.ts:306-320`). Turbo does not shorten them, so the timeout must be sized against them.

### Poll interval: **100 ms**, settled requires **2 consecutive agreeing samples**

The page renders at 60 fps (16.7 ms/frame), so anything below ~20 ms samples the same frame twice and buys nothing. A local CDP `Runtime.evaluate` round-trip is ~1–5 ms, so 100 ms polling is ~10 evals/s — free. Above ~150 ms the added dead time per action starts to be felt: at roughly 10 presses per wave, a 100 ms poll costs ≤1 s per wave of pure waiting.

The 2-sample requirement (identical `fp`, `settled` true both times) adds ~200 ms per action, ~2 s per wave. It is cheap insurance against a transient settled-looking frame, and it comes for free with the fingerprint machinery below. Most mode changes in PokéRogue are synchronous within one tick (`setMode` resolves immediately when no fade is involved), so transients should be rare — but the `.then()` continuations after `setMode` mean the server cannot *prove* they are impossible without an in-battle session.

### Two timeouts, not one

**No-progress timeout: 20 s.** Reset whenever `fp` changes. This must exceed the longest stretch during which a single phase holds the game with nothing observable changing. The worst such stretch is `EvolutionPhase`:

| Source (`src/phases/evolution-phase.ts`, main) | ms at 1× | at speed 3 | at speed 5 |
|---|---|---|---|
| scaled chain (`delayedCall` 1000, 1000, 1100, 1500, 3000, 250, 1250, 900; `duration` 1500, 2000, 250, 2000; `delay` 500) | ~14 250 | ~4 750 | ~2 850 |
| `promptDelay: fixedInt(4000)` on the "evolved into" message (`:392`) | 4 000 | 4 000 | 4 000 |
| `delayedCall(fixedInt(4250), …)` (`:394`) | 4 250 | 4 250 | 4 250 |

≈ **13 s at the default speed, and still ≈ 11 s at Turbo** because the two `fixedInt` legs do not scale. `EggHatchPhase` is the runner-up (~1.8 s scaled + ~2.75 s of `fixedInt`). 20 s clears both with room to spare and still fires long before a human would give up.

**Hard settle timeout: 90 s.** This covers chains of long phases with no settle point between them, and — the real reason — the network. `EncounterPhase` blocks the whole queue on a server save every wave:

```ts
// src/phases/encounter-phase.ts:299-309
// Game syncs to server on waves X1 and X6 (As of 1.2.0)
globalScene.gameData
  .saveAll(true, battle.waveIndex % 5 === 1 || (globalScene.lastSavePlayTime ?? 0) >= 300)
  .then(success => { globalScene.disableMenu = false;
                     if (!success) { return globalScene.reset(true); } … });
```

Nothing in `src/api/*` passes an `AbortSignal` or a timeout, so a hung request is bounded only by the browser's own network timeout — minutes. 90 s is the point at which the server should stop waiting and report `settle_timeout` with `reason`, `phaseName`, `mode` and the last `fp`, rather than press blind into an unknown state.

Both timeouts are safety nets, not budgets; they should not be tuned down to match Turbo.

### Recommended settings for the throwaway profile (ticket 04)

| Setting | Value | Why |
|---|---|---|
| Game Speed | 5 (Turbo) | ~1.7× less scaled animation time |
| Tutorials | off | removes the `tutorialActive` trap entirely (see below) |
| Skip Seen Dialogues | on | fewer prompt stops per wave |
| Manual Message Clear | **off** (default) | on, it turns *every* message into a prompt stop (`message-phase.ts` constructor) |

---

## 5. The fingerprint

`fp` exists to answer "is the game making progress?", which is a different question from "is the game settled?" and is what makes the 20 s no-progress timeout meaningful. Its components:

- `phaseName` — changes every time the queue advances; the highest-frequency progress signal.
- `mode` + `modeChain.join('.')` — catches menu transitions that do not change phase.
- `handler.cursor` — catches the effect of the server's own directional presses.
- the message handler's current text — catches a run of `MessagePhase`s that all report the same `phaseName`.

Deliberately excluded: `phaseQueue.levels` lengths (churns constantly while settled — see §1), tween count (6 permanent loopers, §2).

---

## 6. Known cases where the predicate is wrong

Ordered by how likely they are to bite.

1. **Tutorials — settled but only ACTION/CANCEL work.** When `handler.tutorialActive === true`, `ui.processInput` diverts to `AwaitableUiHandler.processTutorialInput` (`ui.ts:271-275`), which accepts *only* ACTION and CANCEL and returns `false` for everything else. The predicate says `menu-open`/`awaiting-action` — which is true, but a `select_option` that moves the cursor first will silently no-op. Only `AwaitableUiHandler` subclasses have the flag, so `CommandUiHandler`/`FightUiHandler` are unaffected. The predicate surfaces `tutorialActive`; the server should refuse anything but ACTION/CANCEL while it is set. Disabling tutorials in settings removes this case.

2. **A blocked network save reported as busy forever.** `EncounterPhase`'s `saveAll` (§4) has no timeout. The predicate correctly says busy — but it says busy until the hard timeout. Worse, on failure `globalScene.reset(true)` throws the run back to the title screen, which *is* settled (`TITLE`, mode 1) and looks perfectly healthy. The server needs a run-level sanity check — an unexpected transition to `UiMode.TITLE` or `TitlePhase` means the run is gone, not that a menu opened.

3. **`MESSAGE` mode with a stale prompt.** Mitigated in the predicate by requiring `onActionInput != null` alongside `awaitingActionInput` (§2), but the asymmetry is upstream and fragile: if a future handler nulls `awaitingActionInput` without nulling `onActionInput`, or sets `onActionInput` before the prompt is actually live, this flips to a false settle. Re-verify after any upstream bump.

4. **Handlers with no readiness flag, mid-animation.** `MysteryEncounterUiHandler` slides its description in after `show()`; `CommandUiHandler`/`FightUiHandler`/`BallUiHandler`/`TargetSelectUiHandler` have no gate at all. The predicate calls these settled the instant `active` flips, which matches the game's own behaviour (the press *is* accepted) but can be visually mid-animation. Not a correctness bug for a text-driven agent; it will look wrong in a screenshot.

5. **Modes outside the analysed set fall through to `settled: true`.** The final `else` is a deliberate degrade-don't-block choice, consistent with the map's "unknown UiMode degrades to raw presses". It is wrong for any future mode that animates before accepting input the way `MODIFIER_SELECT` does. The three strict modes were found by reading every `processInput` in `src/ui/handlers/`; that sweep must be redone when the pinned upstream ref moves.

6. **`EGG_HATCH_SUMMARY` (13) and `SUMMARY` (9) are only partly covered.** `EggSummaryUiHandler.blockExit` and `SummaryUiHandler.transitioning` are both checked, but neither handler was traced end to end — they sit outside the wave loop.

7. **Double battles produce two settle points per turn** (two `CommandPhase`s, `turn-init-phase.ts:68`). Correct behaviour, but a caller assuming one decision per turn will be surprised.

8. **The in-battle branches are unverified.** Everything in §3 that is not the `menu-open` branch is source-derived. Until ticket 05 runs a wave, treat `resolving`/`awaiting-action`/`hatching` as the most likely place for this note to be wrong.

---

## 7. Recommended settle loop

```
press(button)                     # Runtime.evaluate: scene.ui.processInput(n)
deadline      = now + 90s         # hard
progressUntil = now + 20s         # no-progress
lastFp = null; agree = 0
loop every 100ms:
    r = evaluate(PREDICATE)
    if r.fp != lastFp:  lastFp = r.fp; progressUntil = now + 20s; agree = 0
    if r.settled:  agree += 1
    else:          agree  = 0
    if agree >= 2:  return snapshot()
    if now > progressUntil:  raise SettleTimeout('no progress', r)
    if now > deadline:       raise SettleTimeout('hard', r)
```

`SettleTimeout` should carry `reason`, `mode`, `phaseName` and `fp` — with those four fields a stuck run is diagnosable from the transcript without reattaching a browser.
