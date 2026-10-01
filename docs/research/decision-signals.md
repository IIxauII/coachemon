# The game's decision signals: what the watch reads each frame, and when reading is safe

Research for [#518](https://github.com/IIxauII/coachemon/issues/518), on the map
[the overlay's lag while a human plays](https://github.com/IIxauII/coachemon/issues/480), feeding the provisional
refresh model of [#487](https://github.com/IIxauII/coachemon/issues/487) and the prototype in
[#519](https://github.com/IIxauII/coachemon/issues/519).

**Sources.**

- **The game.** The pinned clone `.cache/pokerogue/v1.12.0.11`, tag `v1.12.0.11`, commit
  `e4e9b5383be7c9e171d32a9daaea2658d475c521`. A game claim is cited `src/…:line` at that commit, and Phaser
  `phaser@3.90.0` from the clone's `node_modules`.
- **The overlay.** `skills/coachemon/scripts/hud/`, cited `hud/…:line` at master `4631a7b`. The ticket named
  `b64a847`, which the main checkout was still on. Of the files cited, only two differ between the two commits:
  `01-meter.js` is new, and `60-card.js` gained one import, so its lines are one later than at `b64a847`.
- **Measurements.** Commands are in [Cost](#cost) and the scripts in `docs/research/decision-signals/`.
- **Prior notes.** `research/settled-game` (the readiness flags) and `research/panel-main-thread-cost` (what a refresh
  runs).

Words are `CONTEXT.md`'s: **decision**, **card**, **settled**, **turn read**, **run read**, **flavour**, **overlay**.
Where this note says **watch**, it means #487's per-frame check. **Ready** means the ticket's "safe": the phase has
finished starting, the UI mode and its handler are set, and in battle the enemy has not chosen.

## Answer

| Kind | Signal (current phase → ready when) | Key (same decision while equal) | Earliest safe frame (Normal speed) | Input opens | One read, Orion's JSC |
|---|---|---|---|---|---|
| Command | `CommandPhase` or `SelectTargetPhase` → mode ≠ `MESSAGE` and `turnCommands[2..3]` empty | `currentBattle` object + `turn` | the first frame the phase is current | at once | 11 ns |
| Free switch | `CheckSwitchPhase` → `CONFIRM`; then `SwitchPhase` with `!isModal` → `PARTY` | `currentBattle` + `fieldIndex` | once the question has typed out (~0.2 s) | at once | 11 ns |
| Replacement | `SwitchPhase` with `isModal && !doReturn` → `PARTY` | the `SwitchPhase` object | +118 ms, the party screen's fade (~7 frames) | at once | 12 ns |
| Reward (shop) | `SelectModifierPhase` → `MODIFIER_SELECT` with `options.length > 0` | the `SelectModifierPhase` object | the first frame | after the reveal, ≥ ~0.6 s | 11–15 ns |
| Move to learn | `LearnMovePhase` whose member has 4 moves and not the new one | the `LearnMovePhase` object | the first frame | two prompted messages later | 16–23 ns |
| Biome | `SelectBiomePhase` → `OPTION_SELECT` with options | the `SelectBiomePhase` object | the first frame | +1000 ms, fixed | 11–12 ns |
| Mystery encounter option | `MysteryEncounterPhase` → `MYSTERY_ENCOUNTER` with `encounterOptions` | the `MysteryEncounterPhase` object | the first frame | +1000 ms, wall clock | 11 ns |
| Starter | `SelectStarterPhase` → `STARTER_SELECT` with `starterSelectCallback` | the `SelectStarterPhase` object | the first frame from the mode menu | at once | 11 ns |
| Fusion | `SelectModifierPhase` and mode `PARTY` with `partyUiMode === SPLICE` | the `SelectModifierPhase` object + party size | +118 ms, the party screen's fade | at once | 10–17 ns |
| (none) | any other phase | — | — | — | 7–8 ns |

- **The whole watch costs about 10 ns a frame** once optimised, on Orion's own JavaScriptCore
  (`JavaScriptCore.framework` 625.1.8 from `Orion.app`, run in its `jsc` shell on a synthetic scene with the game's
  shapes). That is 0.00006 % of a 16.7 ms frame.
  - **Cold start:** the first call costs about 0.1 ms. Frames run at about 1.5 µs over the first second and about
    1 µs over the next nine, then settle at about 0.2 µs while the engine finishes optimising.
  - **On the real game's objects** (V8, headless), one read is 19–58 ns, against 22–143 ns for the overlay's
    current detector chain.
  - **In an Orion tab**, against a live game, it is **not measured**: no game tab was open. `bench-live.mjs` is the
    probe for that.
- **No kind needs a hook into game code.** Every signal, key and ready condition is a plain field read.
  - The meter already runs one `requestAnimationFrame` callback a frame (`hud/01-meter.js:104-122,191`) for the watch
    to ride on.
  - A per-frame read is at most one frame late, and every kind but the command gives more slack than that before input
    opens.
- **A decision cannot open inside an animation.** Phases run one at a time, so a move to learn after a KO opens only
  after the `MoveEffectPhase`, `FaintPhase`, `VictoryPhase`, `ExpPhase` and `LevelUpPhase` have each ended. What is
  true is that it opens **mid-turn**: the enemy has already chosen and the rest of the turn is queued. The learn card
  therefore takes a run read only, never a turn read, and the battle card stays held under it. See
  [Mid-animation decisions](#mid-animation-decisions).

## How the watch sees a frame

**Within a frame, a reader only ever sees finished states.** All three of these hold:

- **Phase changes are synchronous.** `Phase.end()` calls `shiftPhase()`, and that sets `currentPhase` and calls the
  next phase's `start()` in the same call (`src/phase.ts:20-22`, `src/phase-manager.ts:341-373`).
- **There is no running flag.** `getCurrentPhase()` returns the field (`src/phase-manager.ts:270-272`).
- **Phase work runs as tasks.** Every phase change runs inside a task: Phaser's frame callback (tweens, the clock,
  input), a `setTimeout`, or a promise callback that one of them queued. Promise callbacks run when that task ends.

A read at a frame boundary therefore never sees a half-started phase. What can lag behind the phase is only the UI:

- a fade before the mode changes;
- a handler that refuses input until its animation ends.

**The fade.** `setMode` fades whenever the old or the new mode is a transition mode (`PARTY`, `SUMMARY`,
`STARTER_SELECT` among them) and neither is a no-transition mode (`src/ui/ui.ts:67-111`).

- **The sequence:** `fadeOut(250)`, then `delayedCall(100)`, then the mode and `handler.show()`, then `fadeIn(250)`
  (`src/ui/ui.ts:563-567`).
- **No blocked frame after it.** `fadeIn` clears `overlayActive` synchronously as it starts (`:506-523`), so input is
  accepted from the frame the mode lands.
- **Every other mode is set at once**, inside the `setMode` call (`:534-557`).

**Game speed divides those times.** Every tween duration and clock delay is divided by `gameSpeed` and rounded up,
except `fixedInt` values (`src/system/game-speed.ts:24-29,91-104`). The setting offers 2, 3, 4 and 5, with Normal
(3) the default (`src/system/settings/settings.ts:209-228`).

| Game speed | `fadeOut` + `delayedCall` before a transition mode lands |
|---|---|
| Slow (2) | 175 ms |
| Normal (3) | 118 ms, about 7 frames at 60 Hz |
| Fast (4) | 88 ms |
| Turbo (5) | 70 ms |

**Where to run the read.** Use a `requestAnimationFrame` callback, not Phaser's `POST_STEP` event.

- `POST_STEP` is emitted inside the game's step (`phaser/src/core/Game.js:474-523`), before the step's promise
  callbacks have run. There it sees the commit window `CommandPhase` + `MESSAGE`, because
  `end()` is `setMode(MESSAGE).then(() => super.end())` (`src/phases/command-phase.ts:686-688`).
- A rAF callback queued after Phaser's runs after the step and after those callbacks. Phaser calls its own callback
  and then queues the next frame (`phaser/src/dom/RequestAnimationFrame.js:89-97`), so the order holds frame after
  frame.
- If the meter's callback was queued before Phaser's, it reads the previous step's state instead. That is still a
  finished state, one frame older.
- The command's ready condition (mode not `MESSAGE`) also rejects the commit window, so either placement is correct;
  the rAF one simply never meets that window.

## The kinds

The watch prototype is `docs/research/decision-signals/watch.js`. The rows below are what it reads, and each claim
of the form *harness:* is a row of `results/real-game-v8.json`. That file comes from the real game played to that
decision on upstream's headless test harness (see [Cost](#cost)).

### Command

- **Signal.** The current phase is `CommandPhase`, or `SelectTargetPhase` in a double.
  - `TurnInitPhase` queues one `CommandPhase` per field slot of ours, before every `EnemyCommandPhase`
    (`src/phases/turn-init-phase.ts:59-75`, with player slots first in `getField()`, `src/battle-scene.ts:804-811`).
  - Choosing a move with more than one target ends the `CommandPhase` and runs a `SelectTargetPhase`
    (`src/phases/command-phase.ts:296-311`). Cancelling that unshifts a new `CommandPhase` for the slot
    (`src/phases/select-target-phase.ts:56-58`).
- **Ready.** Mode is not `MESSAGE` and `turnCommands[ENEMY]` and `[ENEMY_2]` are empty.
  - `start()` sets `COMMAND` synchronously (`FIGHT` when an encounter skips to it), with no fade from `MESSAGE`
    (`src/phases/command-phase.ts:169-199`).
  - The enemy chooses only in `EnemyCommandPhase` (`src/phases/enemy-command-phase.ts:75,97`), which runs after every
    command of ours. `turnCommands` are emptied each turn (`src/battle.ts:171-173`, from
    `src/phases/turn-end-phase.ts:26`).
  - *Harness:* ready on the first look, `enemyChosen: false`, in a single, at both slots of a double and at target
    select.
- **Key:** the `currentBattle` object and `turn`. A new wave is a new `Battle` (`src/battle-scene.ts:1328`), so the
  object tells a wave-1 turn-1 of a new run from the last run's. Within a turn, every screen and both slots are one
  decision, as `CONTEXT.md` says.
- **Earliest safe frame:** the first frame the phase is current. **Input opens at once:** `CommandUiHandler` has no
  gate (settled-game note, §2).
- **Pitfalls.**
  - **A command that is not asked.** A locked or queued move, a skipped slot or Commander makes `start()` end the
    phase in the same call (`src/phases/command-phase.ts:181-188`, `:145-167`), so no frame shows it waiting. The one
    exception, a queued move missing from the moveset, sets `COMMAND` and waits (`:161`). It is a real decision and
    reads as one.
  - **A gate that misses target select.** The overlay's `awaitingDecision` does not count `SelectTargetPhase`
    (`hud/01-core.js:171-177`), so the turn read is not live there. *Harness:* `overlay: "battle?"` at target
    select. The held card covers it today. A watch must list the phase, or a card first built at target select is
    built from a dead read.

### Free switch (a wild wave's "Will you switch?")

- **Signal.** The free switch the game offers when a foe faints is the question at the start of the next wild wave.
  - It is queued from `EncounterPhase.end` when the battle is not a trainer battle and the party has more members than
    battlers (`src/phases/encounter-phase.ts:598-609`). Mystery encounter battles, a loaded session and a retry queue
    it the same way (game-code.md §9).
  - It is never offered in a trainer battle.
- **Ready, the question.** `CheckSwitchPhase`'s question types out in `MESSAGE`, then the phase sets `CONFIRM`
  (`src/phases/check-switch-phase.ts:62-81`). Typing costs 20 ms a character at 1×
  (`src/ui/handlers/message-ui-handler.ts:69-70`), so about 7 ms a character at Normal: about 0.2 s for the English
  question.
- **Ready, the party.** "Yes" unshifts `SwitchPhase(INITIAL_SWITCH, slot, isModal false, doReturn true)` (`:72`),
  which sets `PARTY` (`POST_BATTLE_SWITCH`) after the fade (`src/phases/switch-phase.ts:70-82`).
- **The enemy is free.** The phase runs before the turn's first `TurnInitPhase`, so `turnCommands` are empty, and the
  turn is 1 (`src/battle-scene.ts:1333`). *Harness:* `enemyChosen: false`, `turn: 1`.
- **Ends early.** The phase ends in `start()` in Set style, with nobody to switch to, or while trapped
  (`src/phases/check-switch-phase.ts:30-60`). No frame shows those.
- **Key:** `currentBattle` + `fieldIndex`. It spans the question and the party screen, which is one decision across
  screens. *Harness:* the party screen is not `fresh`. A double asks twice, once per slot, so it gives two decisions.
- **Earliest safe frame.**
  - For a turn read, the game state is safe from the first frame: no turn has started.
  - For the ticket's ready condition (mode set), it is once `CONFIRM` is up, about 12 frames at Normal.
- **Pitfall: the mid-turn party screen.** `SwitchPhase` is also the party screen for U-turn, Volt Switch, Baton
  Pass, Wimp Out and Emergency Exit, queued with `isModal true, doReturn true` (`src/data/moves/move.ts:7399-7408`,
  `src/data/abilities/ab-attrs.ts:5730-5744`).
  - Those run mid-turn, after the enemy has chosen, and are not a decision kind with a card.
  - Only the phase's `isModal`/`doReturn` tell them apart: the handler shows `FAINT_SWITCH` for a replacement and for
    a U-turn alike (`src/phases/switch-phase.ts:72`).

### Replacement for one of ours that fainted

- **Signal:** `SwitchPhase` with `isModal && !doReturn`.
  - `FaintPhase` pushes it to the end of the turn's base queue, after `TurnEndPhase`
    (`src/phases/faint-phase.ts:181`).
  - A mystery encounter battle unshifts the same (`src/phases/mystery-encounter-phases.ts:253`).
- **Ready.** Mode `PARTY`, which arrives after the fade, 118 ms at Normal.
- **The enemy is free.** The turn has already ended and `turnCommands` are empty. *Harness:* `enemyChosen: false`,
  `turn: 2`, against `turn: 1` at the command before the faint.
- **Key:** the `SwitchPhase` object, so two of ours down in a double are two decisions. A replacement that is KO'd by
  hazards on entry is a third: a new `FaintPhase` pushes a new `SwitchPhase` for the same slot and the same turn.
- **Pitfalls.**
  - **The turn number repeats.** It is already the next turn's number, so `(wave, turn)` alone merges the
    replacement with the command that follows it. The kind in the key separates them.
  - **The party changes under the held card.** The send-in swaps party entries (`src/phases/switch-summon-phase.ts:190-191`),
    which moves the held battle card's key, since it carries party ids (`hud/60-card.js:67`). That is intended.
  - **Ends early.** The phase ends in `start()` when nobody is left to send, or when the fainted mon was revived
    (`src/phases/switch-phase.ts:42-62`). No frame shows those.

### Reward (the shop)

- **Signal:** `SelectModifierPhase`.
  - Its `start()` rolls the offers and calls `setMode(MODIFIER_SELECT, …)`, with no fade
    (`src/phases/select-modifier-phase.ts:60-125,401-409`).
  - `show()` builds every reward option synchronously (`src/ui/handlers/modifier-select-ui-handler.ts:162-230`).
- **Ready.** `MODIFIER_SELECT` with `options.length > 0`. On close the handler splices its options away
  (`:743`). The overlay already relies on that (`hud/02-screens.js:17-21`).
- **Input opens after the reveal.**
  - `awaitingActionInput` is set false in `show()` (`:274`) and true only after the reveal: a 1250 ms counter, every
    reward's upgrade animation, a 500 ms `delayedCall`, and the shop row's own animations, delayed 1000 ms + 2000 ms
    per upgrade tier (`:294-394`).
  - Divided by 3, that is at least ~0.6 s at Normal, plus ~0.67 s per upgrade tier.
  - `processInput` refuses until then (`:409`).
- **Key:** the `SelectModifierPhase` object.
  - **A reroll is a new decision.** It unshifts a new phase (`src/phases/select-modifier-phase.ts:188-200`).
    *Harness:* `fresh: true` after the reroll.
  - **A purchase from the shop row is not.** It keeps the same phase and the same offers (`:279-290`).
- **Pitfalls.**
  - **Coming back from a sub-screen rebuilds.** The fusion and TM party screens are sub-screens of this phase, and
    coming back calls `resetModifierSelect` (`:401-409`). A watch that remembers one decision then sees the reward
    again as new. *Harness:* `fresh: true` on the way back from the splice screen. Keep the previous card by key, and
    coming back costs nothing.
  - **The TM copy.** A TM or Memory Mushroom queues a copy of the phase with the same offers (`:270-276`, `copy()`
    `:468-480`), shown again only if the move is not learned. Learning it removes the copy
    (`src/phases/learn-move-phase.ts:211,214`). By object it is a new decision: one shop draw, and only after a
    refused TM.
  - **Not every shop comes from the wave's victory.** A wave ending in 0 gets no victory shop
    (`src/phases/victory-phase.ts:85-91`). Under a no-heal challenge the biome step queues one in place of the heal
    (`src/phases/select-biome-phase.ts:95-111`), and a mystery encounter queues its own. The object is the identity
    that needs no reasoning about which path queued the shop.
  - **Money moves under the held card.** A shop-row purchase changes money within one decision. The watch does not
    rebuild for it, so what the card says about affordability goes stale until the next decision.

### Move to learn

- **Signal:** `LearnMovePhase` whose member has a full moveset that does not yet hold the new move.
  - **Where it comes from.** It is unshifted by `LevelUpPhase.end` (`src/phases/level-up-phase.ts:80-93`), an
    evolution (`src/phases/evolution-phase.ts:409`), a TM or Memory Mushroom (`src/modifier/modifier.ts:2294,2320`),
    or Dancing Lessons.
  - **Which ones are decisions.** With fewer than four moves, `start()` teaches the move at once: `setMove` runs before
    the first `await` (`src/phases/learn-move-phase.ts:59-60,224`). A move it already knows, or one not implemented,
    ends the phase in `start()` (`:45-54`).
  - *Harness:* the move is already in the moveset straight after `start()` with three moves.
- **Ready.** The first frame. `start()` sets the message mode synchronously: `EVOLUTION_SCENE` inside an evolution,
  `MESSAGE` otherwise (`:56-58`).
- **When the choice is asked.** Two prompted messages come first, then `CONFIRM` ("forget a move?"), then the
  `SUMMARY` screen in `LEARN_MOVE` mode behind a fade (`:75-134`).
- **Key:** the `LearnMovePhase` object, one per move, so two moves at one level are two decisions.
- **Earliest safe frame:** the first frame. **Input:** the choice opens two prompted messages later, so there is
  slack.
- **Hook:** none.
- **Pitfall: a learn card for a move already learned.** The overlay's `learnState` answers for any `LearnMovePhase`
  (`hud/02-screens.js:10-14`), including the auto-learn case.
  - That phase stays current while "X learned Y!" is shown, so a refresh landing there builds a learn card for a
    move already learned.
  - `learnState` also builds a `PokemonMove` on every call (`:13-14`), which a per-frame read must not do. The watch
    compares move ids instead.

### Biome

- **Signal:** `SelectBiomePhase`. It asks only with a Map and more than one link.
  - With a Map and more than one linked biome it calls `setMode(OPTION_SELECT, { options, delay: 1000 })`
    (`src/phases/select-biome-phase.ts:40-60`).
  - Otherwise it picks and ends in `start()` (`:26-38,61-83`). No frame shows that.
  - It is queued after a wave that `isNewBiome` (`src/phases/victory-phase.ts:125-127`, `src/battle-scene.ts:1271-1277`).
- **Ready.** `OPTION_SELECT`, a no-transition mode, so the mode lands at once. `config.options` is set in
  `show()` (`src/ui/handlers/base-option-select-ui-handler.ts:165-186`).
- **Input opens after a fixed 1000 ms.** `blockInput` holds for `fixedInt(1000)`, so game speed does not shorten it
  (`:182-186`).
- **Key:** the `SelectBiomePhase` object.
- *Harness:* ready at wave 10 in Plains with a Map.

### Mystery encounter option

- **Signal:** `MysteryEncounterPhase`. `start()` clears the queue and sets `MYSTERY_ENCOUNTER`, a no-transition mode
  (`src/phases/mystery-encounter-phases.ts:47-67`).
- **Ready.** `encounterOptions` is set in `show()` → `displayEncounterOptions` (`src/ui/handlers/mystery-encounter-ui-handler.ts:94-123,353`).
- **Input opens after 1000 ms of wall clock.** `blockInput` is held by a real `setTimeout(…, 1000)`, which game speed
  does not shorten (`:116-119`).
- **Key:** the `MysteryEncounterPhase` object.
  - **Sub-screens are one decision.** After an option is picked the same phase stays current through its sub-screens
    until it ends (`src/phases/mystery-encounter-phases.ts:74-116`): a party pick (`src/data/mystery-encounters/utils/encounter-phase-utils.ts:535-546`), a
    secondary option list (`:609`, `:637-661`), "view party" and back.
  - **Each follow-up menu is a new decision.** A follow-up menu is a new `MysteryEncounterPhase` pushed by
    `initSubsequentOptionSelect` (`encounter-phase-utils.ts:801-803`). At the pin only Safari Zone does that
    (`src/data/mystery-encounters/encounters/safari-zone-encounter.ts:116,179`), so every Safari turn is a new object and a new decision. That is what the
    overlay keys a minigame turn on today, by mon and stages (`hud/60-card.js:193-196`). The object subsumes it.
- **Pitfall: stale options.** `encounterOptions` is not cleared on `clear()` (`:657-669`), so it must be read only
  while the mode is `MYSTERY_ENCOUNTER`.

### Starter

- **Signal:** `SelectStarterPhase`, which calls `setMode(STARTER_SELECT, callback)` (`src/phases/select-starter-phase.ts:17-34`).
- **Ready.** `STARTER_SELECT` with `starterSelectCallback` set (`src/ui/handlers/starter-select-ui-handler.ts:1191-1199`).
  The callback is nulled when the run starts (`:4532-4534`).
- **The fade depends on the screen before.** From the title or the mode menu, both no-transition modes, the mode
  lands at once. After the challenge screen it fades first (`CHALLENGE_SELECT` → `STARTER_SELECT`, 118 ms).
- **Key:** the `SelectStarterPhase` object.
- **Pitfall: the starter screen outlives its mode.** The decision spans the starter screen's own sub-screens, an
  option list and a confirm, opened without clearing it (`:4525-4534`).
  - The overlay reads `handlers[STARTER_SELECT]` rather than the current mode for that reason
    (`hud/51-starters.js:21-24`). A watch that keys on the phase object needs mode `STARTER_SELECT` only to open the
    decision.
  - The key holds through the sub-screens without it.

### Fusion

- **Signal:** a DNA Splicer reward opens `PARTY` in `SPLICE` mode from inside `SelectModifierPhase`
  (`src/phases/select-modifier-phase.ts:176-177,299-327`). The phase stays the shop's, so the fusion is told apart by
  mode and `partyUiMode`. That is the overlay's `spliceScreen` (`hud/49-fusion.js:151`).
- **Ready.** Mode `PARTY`, after the fade from `MODIFIER_SELECT` (118 ms).
- **Key:** the shop's phase object + the party size. A completed fusion removes a member, so a second splicer in the
  same shop is a new decision.
- **Pitfalls.**
  - **Back to the shop.** Coming back to the shop is the reward again: see the reward's pitfalls.
  - **Picking the base reorders the card, not the decision.** The first pick (the base, `transferMode`) changes
    which rows the card shows (`hud/49-fusion.js:156-157`), not which decision it is.

## Same decision or a new one

The key is compared by `===` on objects and numbers, so a frame allocates nothing (`watch.js`).

| Edge case | What the game does | Watch |
|---|---|---|
| Fight → back → command, or Ball/Pokémon → back | The same `CommandPhase`; the handler sets `COMMAND` again (`src/ui/handlers/fight-ui-handler.ts:174`) | same (battle, turn) → same decision |
| Double: slot 0, then slot 1 | Two `CommandPhase` objects, same turn (`turn-init-phase.ts:68`) | same decision, *harness* `fresh: false` at slot 1 |
| Double: cancel at slot 1 | New `CommandPhase` ×2 unshifted (`command-phase.ts:670-677`) | same decision, *harness* `fresh: false` |
| Double: target select, or cancelling it | `SelectTargetPhase`, then a new `CommandPhase` (`select-target-phase.ts:56-58`) | same decision |
| Free switch → command | `CheckSwitchPhase` (turn 1), then `CommandPhase` (turn 1) | kinds differ → new |
| Command → replacement → command | Turn N, then `SwitchPhase` at turn N+1, then `CommandPhase` at turn N+1 | kinds differ, then the turn differs → three decisions |
| Two of ours faint at once (double) | Two `SwitchPhase` objects | two decisions |
| Shop reroll | New `SelectModifierPhase` | new, *harness* `fresh: true` |
| Shop purchase | Same phase | same |
| Shop → fusion → shop | Same phase, mode `PARTY`/`SPLICE` and back | fusion new; the shop new again (cache the card by key) |
| Learn after a level-up mid-turn | A new `LearnMovePhase`, enemy has chosen | new learn decision; the battle card is held, not rebuilt |
| Encounter option → party pick → dialogue | Same `MysteryEncounterPhase` | same |
| Safari Zone turn | New `MysteryEncounterPhase` per turn | new |
| Form change on learning a move | `overridePhase` makes `FormChangePhase` current and puts the old phase on standby (`src/battle-scene.ts:3019-3020`, `src/phase-manager.ts:382-392`) | none while it shows; the standby phase comes back as the same object |
| New run, reload, retry | A new `Battle` object (`src/battle-scene.ts:1328`) | new |

**One decision per turn is a choice, not a reading.** The game asks a double's two slots as two phases, and this
note keys them as one decision because `CONTEXT.md`'s **decision** is "the command for a turn". A card per slot would
key on `fieldIndex` as well. Not the same as the **minigame turn** tension #487 noted.

## Mid-animation decisions

**Why a decision cannot open inside a running phase.** Phases are strictly sequential (`src/phase-manager.ts:341-373`),
and a phase with an animation ends only once its animation is over.

**The chain behind a move to learn after a KO.**

1. `MoveEffectPhase` queues a `FaintPhase` (`src/phases/move-effect-phase.ts:764`, `src/phase-manager.ts:528-530`).
2. The `FaintPhase` unshifts a `VictoryPhase` (`src/phases/faint-phase.ts:184`).
3. EXP is handed out as `ExpPhase` or `ShowPartyExpBarPhase` (`src/phases/victory-phase.ts:34`,
   `src/battle-scene.ts:3436-3437`).
4. A level gained unshifts a `LevelUpPhase` (`src/phases/exp-phase.ts:41`).
5. Its `end()`, after the stat box has been dismissed with a press (`src/phases/level-up-phase.ts:62-76`), unshifts
   the `LearnMovePhase` (`:80-93`).

So the watch sees a `LearnMovePhase` only after every earlier phase has finished its animations. A settled message,
the stat box, sits in between.

**What is true is that it opens mid-turn.**

- The rest of the turn is still queued: `MoveEndPhase`, the other battlers' `MovePhase`s, and the turn-end phases.
- `turnCommands` hold the enemy's choice. *Harness:* `enemyChosen: true` at a learn unshifted during `TurnStartPhase`.
- Our fainted or damaged mons are mid-resolution. A turn read there would replay an enemy command already made against
  a field halfway through changing. That is exactly what the "enemy has not chosen" condition exists to refuse
  (game-code.md §9, `hud/01-core.js:170-177`).

**How to handle it:**

1. **Build the learn card from a run read only.** That is what the overlay does now (`hud/60-card.js:101-103`), and
   the run read's sandbox restores the battle RNG and the rest (`hud/01-core.js:131-160`). Never open a turn read while
   the watch's kind is `learn`.
2. **Keep the battle card held, by its key, without rebuilding it.** Per #487's decision 2, the road group goes stale
   and is recomputed at the next decision.
3. **When the learn decision ends, let the rest of the turn play under the held card.** The next decision (command,
   replacement or shop) is fresh by key and gets its own read.

   Which card shows meanwhile, the learn card or the held battle card, is a display choice for #519. Showing the
   held battle card again costs nothing, because it is cached by key.

**The same reasoning covers the other mid-turn choices** the game asks without a decision kind: the U-turn and Baton
Pass party screen, Revival Blessing's party screen (`PartyUiMode.REVIVAL_BLESSING`), and a catch's nickname prompt.
The watch returns none for them, so the held card stays up and nothing is read.

## Cost

| Engine | Objects | Command | Per kind (ns per read) | Mixed, per frame |
|---|---|---|---|---|
| **Orion's JavaScriptCore** (`Orion.app/…/JavaScriptCore.framework` 625.1.8, its `jsc` shell) | synthetic, the game's shapes | `bench.sh` → `results/synthetic-orion-jsc.txt`, 3 runs | 7–23 (learn the dearest: a moveset loop) | **8.7–10.2 ns** |
| System JavaScriptCore (macOS 26.2, 21623.1.14) | synthetic | `results/synthetic-system-jsc-and-node.txt` | 10–18 | 13.2 ns |
| V8 (Node 26.9) | synthetic | same file | 10–33 | 13.0 ns |
| V8 (Node, vitest) | **the real game**, headless, at each decision | `node docs/research/decision-signals/run.ts` → `results/real-game-v8.json` | 19–58 (watch); overlay's detector chain 22–143 at the same states | — |

**Cold start, Orion's JSC.** The first call costs 0.09–0.11 ms: the closures are compiled on first use. The next 59
frames cost 1.4–1.7 µs each, the next 540 frames 0.6–1.2 µs, and the next 5,400 frames 0.16–0.22 µs, before the
engine settles at about 10 ns. Over the first ten seconds of a session the watch spends under 1 ms in all.

**The machine.** Apple M4, macOS 26.2, Orion 1.1.3. Orion ships its own WebKit; `DYLD_FRAMEWORK_PATH` makes Orion's
own `jsc` load Orion's `JavaScriptCore.framework`, which `DYLD_PRINT_LIBRARIES` confirmed. So the engine is Orion's;
what is not Orion's is the page, the WebContent process and the real game's objects.

**What is not measured:**

- **The watch inside an Orion tab, against a live game.** No `pokerogue.net` tab was open in Orion. Run
  `node docs/research/decision-signals/bench-live.mjs 120 | pbcopy`, paste into the tab's Web Inspector console, play
  two minutes, and read `window.__coachWatchProbe`. It reports:
  - ns per read on the live scene;
  - the watch's total ms;
  - per decision opened, the frames and ms from the first frame its phase was current to the frame it was ready. That
    is a live check of the earliest-safe-frame column.
- **The cost of a frame callback itself.** The meter's rAF callback already exists (`hud/01-meter.js:104-122`), so
  riding it adds no callback.

**How the numbers were taken:**

- **Synthetic.** `bench-jsc.js` builds a scene from classes shaped like the game's: phases as subclass instances whose
  `phaseName` is an own field, a `PhaseManager` getter, a `UI` with 48 handler classes, and
  `turnCommands` built with `Object.fromEntries` as `src/battle.ts:173` does.
  - It times 2 M reads per kind, the median of 5.
  - It then times a mixed sequence: every decision state and 40 busy phase classes, switched every 8 frames, so every
    read site sees all its shapes.
- **Real game.** `run.ts` copies `watch.js`, the overlay bundle (`hud-bundle.mjs`, expose mode) and
  `signals.test.ts.template` into the pinned clone, and plays each decision on upstream's vitest harness.
  - It records what the watch says (`kind`, `ready`, `fresh` against the previous decision) and times 1 M reads, plus
    50 k reads of the overlay's detector chain in `readCard`'s order.
  - The harness completes tweens at once and delays timers by 1 ms (`test/framework/game-wrapper.ts:119-132`,
    `test/mocks/mock-clock.ts`), so it checks signals and keys, not frame timings.
  - vitest exits 1 on an unhandled `localStorage` rejection from upstream's i18n init
    (`src/i18n.ts:207`, no `localStorage` under Node). All 10 tests pass.

## Hook or read

**No kind needs a hook.** The store flavour asks for no permission and runs in the page's own world, which is where
the overlay already reads `phaseManager`, `ui` and `currentBattle`. Every signal and key above is a field of those.
The cases where a hook might look tempting:

- **Learning of a phase the moment it starts**, for example by wrapping `startCurrentPhase`. The read is at most one
  frame late. A hook would only move the card's cost into the game's own step, the opposite of what #487 wants.
- **Knowing when input opens.** `awaitingActionInput`, `blockInput` and `overlayActive` are plain fields
  (settled-game note §2). The watch does not need them to tell a decision apart, only, optionally, to decide when to
  build.

## What this changes in the overlay's current detectors

- **`awaitingDecision`** (`hud/01-core.js:171-177`) misses `SelectTargetPhase`. It is right to exclude U-turn's
  `SwitchPhase` (`isModal && doReturn`).
- **`learnState`** (`hud/02-screens.js:5-15`) answers for an auto-learn and builds a `PokemonMove` per call. A
  per-frame check must use the full-moveset test.
- **The stream keys** (`hud/60-card.js:184-199`) key biome, starters and fusion on the wave alone and the shop on its
  free offers' names.
  - They are fine as the stream's dedupe.
  - They are not decision identity. Two fusions in one shop share a wave, and a TM's copy of the shop shares its
    free offers' names with the shop it copies.

## Open questions for follow-up tickets

1. **Live Orion numbers.** Run `bench-live.mjs` on a played session: ns per read in the page, and the frames from a
   phase to ready per kind. That checks the 118 ms fade and the reveal times, which are source arithmetic here. It
   fits inside #519's prototype run.
2. **When to build, given the slack.** The watch knows the decision on the first ready frame, but the slack before
   input opens differs by kind:
   - none for the command;
   - the fade for a replacement;
   - ≥ 0.6 s for the shop;
   - 1 s for a biome and an encounter;
   - two messages for a learn.

   Building in the first frame puts a 35–410 ms card (#486) on that frame, and for the shop that frame is in the
   middle of the reward reveal. Whether to build at once or yield first is #519's to measure.
3. **The display during a mid-turn learn.** After the learn decision, show the learn card until the next decision, or
   put the held battle card back. Either is free; it is a product choice.
4. **A card per double slot or per turn.** It is keyed per turn here (`CONTEXT.md`). If a card per slot is wanted,
   add `fieldIndex`, and settle it with the **minigame turn** glossary tension #487 left open.
5. **The overlay's `learnState` auto-learn card.** A small fix, independent of the watch: require a full moveset
   without the new move.
6. **Shop affordability.** Within one shop decision the card's money goes stale after a purchase. Decide whether a
   purchase refreshes the card, or whether the card stops claiming affordability.

## Files

All under `docs/research/decision-signals/`:

- `watch.js` — the prototype watch: signal, key and ready per kind, no allocation per frame.
- `bench-jsc.js` and `bench.sh` — the synthetic benchmark on Orion's JSC, the system JSC and Node. Its output is in
  `results/synthetic-*.txt`.
- `run.ts` and `signals.test.ts.template` — the real-game harness on the pinned clone. Its output is in
  `results/real-game-v8.json`.
- `bench-live.mjs` — the live-tab probe, not yet run.
