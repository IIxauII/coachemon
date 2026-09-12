# Research: what `window.gameInfo` covers

Ticket: [#10 What window.gameInfo covers](https://github.com/IIxauII/pokerogue-mcp/issues/10)
Date: 2026-09-12

## Sources

- **[live]** `https://pokerogue.net` in the persistent profile from [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) (`~/.pokerogue-mcp/chrome-profile`, port 9222), logged in as `xauyxau2`, driving a **real Classic run** through waves 1→5. Title screen reports `v1.12.0.11`, and `game.config.gameVersion === "1.12.0.11"` — the same build [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2) pinned its enum tables to. All probes were bare `Runtime.evaluate` over a raw CDP websocket; key input was `Input.dispatchKeyEvent`; ground truth for every freshness claim is a paired `Page.captureScreenshot`.
- **[source]** `pagefaultgames/pokerogue` at tag `v1.12.0.11` / commit `e4e9b53`, read in full with git history. The complete source-side write-up is the companion file [`05-game-info-source.md`](./05-game-info-source.md); this note carries the decision and quotes its citations where they bear on it.
- Cost figures and the scene locator come from [#9 *Reaching the running game from injected JS*](https://github.com/IIxauII/pokerogue-mcp/issues/9), independently reproduced here (see [§6](#6-the-premise-this-ticket-was-written-on-is-gone)).

Claims are tagged **[live]** (measured on the running game) or **[source]** (read at the pinned ref).

---

## Answer in one line

`gameInfo` is a **command-prompt snapshot, fresh at the command menu and stale at the reward shop** — so `get_state` is built on the **scene**, and `gameInfo` keeps only the locator-free liveness-check job.

---

## 1. What it is, mechanically

**[source]** The producer is `BattleScene.updateGameInfo()` (`src/battle-scene.ts:3083`), which builds a fresh object and assigns it:

```ts
    // TODO: Don't store it here
    window["gameInfo"] = gameInfo;
```
— `src/battle-scene.ts:3263-3264`

**[live]** Observed as a plain data property — `{ writable: true, enumerable: true, configurable: true }`, no getter — holding one object with seven keys:

```
gameInfoVersion, playTime, gameMode, biome, wave, luck, party
```

**[live] It is replaced wholesale, not patched**, matching the plain assignment above: a poller comparing object identity every 30 ms recorded `ref !== lastRef` on updates. **Consumers must re-read `window.gameInfo` on every access; a cached reference goes stale silently and never throws.**

**[live] At the title screen it is present but empty-ish:** `{ gameInfoVersion: "2.1.0", playTime: 0, gameMode: "Title", biome: "", wave: 0, luck: -1, party: [] }` — the payload seeded by the `BattleScene` constructor **[source]** (`battle-scene.ts:363`).

## 2. Freshness: a settled read *can* return a stale payload

This was the ticket's central question. **It can, and the gap lands in exactly the wrong place.**

**[source] There are seven call sites.** Two are the game-state refreshes that matter, two bracket the run (boot and teardown), and three fire on overlay transitions:

| Site | Fires on | Useful? |
|---|---|---|
| `BattleScene` constructor (`battle-scene.ts:363`) | once at boot | seeds the `Title` payload |
| `BattleScene.reset()` (`battle-scene.ts:1216`) | game over, per-wave save failure, save & quit, logout, language change, starter-select/pokedex/gacha back-out | the run-over write |
| `EncounterPhase.start()` (`encounter-phase.ts:55`) | once per wave at wave start (shared by `NextEncounterPhase` / `NewBiomeEncounterPhase`) | **main refresh** |
| `CommandPhase.start()` (`command-phase.ts:172`) | once per command prompt, per turn, per field slot | **main refresh** |
| `UI.setModeInternal` chain push (`ui.ts:545`) | `setOverlayMode` only, and only when the current mode is truthy | **vestigial by intent, live in effect** |
| `UI.resetModeChain()` (`ui.ts:597`) | mode chain cleared | same |
| `UI.revertMode()` (`ui.ts:611`) | popping out of an overlay | same |

The three `ui.ts` sites were added in 2024 (`0df40893`, *"Add modeChain to gameInfo for debug purposes"*) to keep a `modeChain` field fresh; that field was deleted in the 2.0.0 payload rewrite **without removing the calls**. So they are dead weight upstream — removable without anyone noticing — but they *do* still write today, and **[live]** I confirmed both ends of one (see the overlay rows below). Nothing else writes: no damage, faint, level-up, evolution, money change, item pickup, or ordinary `ui.setMode`.

**[source] `CommandPhase.start()` fires once per player field slot** (`TurnInitPhase` pushes one `CommandPhase` per index, `turn-init-phase.ts:66-70`), so in a double battle site 4 writes **twice** per turn.

**[live] The live measurements match that list exactly.** A 30 ms poller logged every payload change and every object-identity change, timestamped against `performance.now()`.

Zero updates were recorded across all of:

| Sequence | Elapsed | Updates |
|---|---|---|
| Open the Fight submenu, then cancel back to the command menu | ~4 s | **0** |
| Idle at the command menu | 30 s | **0** |
| Idle at the command menu (second trial, wave 3) | 25 s | **0** |
| A whole turn that dealt damage but took none (Ember → enemy fainted) | ~14 s | **0** |
| The post-battle chain: faint message → EXP gain → level-up → stat-gain panel | ~20 s | **0** |
| Sitting on the reward-select screen | — | **0** |
| The killing turn of a wave (damage taken, then enemy faints) | ~12 s | **0** |

The Fight-submenu result confirms the rule from the outside: ordinary `setMode` is never a trigger — only `setOverlayMode` is.

**[live] And where updates do happen, they come in the predicted pair.** Every wave transition produced **two** updates 1.5–3 s apart (1→2 at +52.4/+54.4 s, 2→3 at +40.5/+43.2 s, 3→4 at +33.1/+34.6 s; the 4→5 log shows one because sampling stopped ~3 s after the first). That pair is `EncounterPhase.start()` followed by `CommandPhase.start()` for turn 1. Mid-wave, the single update at each new turn's command prompt is `CommandPhase.start()` — the one that produced `14/22 → 9/22`.

**[live] The overlay sites fire too**, tested as a prediction from the source read rather than found by sweeping menus:

| Action | Site | Update |
|---|---|---|
| Open the pause menu (`setOverlayMode(UiMode.MENU)`, `ui-inputs.ts:198`) | 5 | **yes** — 260 ms after the keypress, `playTime` 965 → 1072 |
| Dismiss the two tutorial messages layered over it | — | **no** — the underlying mode is `MESSAGE`, which the site-5 guard suppresses |
| Close the pause menu (`revertMode`) | 7 | **yes** — `playTime` → 1114 |

This is why a menu-navigation sweep alone would have missed them: moving a cursor inside a menu, or entering a `setMode` submenu such as Fight, never triggers a write, but an **overlay** does. It also means a `gameInfo` consumer could force a refresh by opening and closing the pause menu — a fact worth recording and not worth using, given the scene is readable directly.

**[live] The decisive measurement.** Wave 3, after Ember killed a Pidgey that had just hit Fuecoco:

| | Screen (ground truth) | `gameInfo` |
|---|---|---|
| At the faint message | **4/22** | 9/22 |
| At the EXP-gain message | **4/22** | 9/22 |
| At the level-up message | **Lv.6, 6/24** | **Lv.5**, 9/22 |
| At the reward-select screen | **Lv.6, 6/24** | **Lv.5**, 9/22 |

Three fields — `level`, `currentHP`, `maxHP` — wrong at a fully settled decision point, stale by one turn's damage *plus* a level-up, because the last write was the *previous* turn's `CommandPhase.start()`.

**[live] The failure this would cause.** The reward screen is exactly where an agent decides whether to take a Potion. An agent reading `gameInfo` there sees `9/22` — comfortable — when the real state is `6/24`, one hit from losing the run. **[source]** And `wave` there is the wave just *cleared*, not the one about to start.

**So: settling the game (per [#3](https://github.com/IIxauII/pokerogue-mcp/issues/3)) does not make `gameInfo` fresh.** The two are unrelated: #3's predicate detects that the *game* is quiet, while `gameInfo` refreshes only at wave start and at command prompts. Stated positively: **`gameInfo` is fresh at the `COMMAND` family** (and its `setMode` sub-menus, since nothing mutates while the player is choosing) **and stale at `MODIFIER_SELECT`.**

### `playTime` is the payload's timestamp

**[source]** `playTime` is a 1 Hz counter captured at write time, so `gameInfo.playTime` **is** the snapshot's clock: hold the wall-clock time at which a new `playTime` was first seen, and the snapshot's age follows.

**[live]** Confirmed on consecutive write pairs: `+1` over 1.53 s, `+1` over 2.0 s, `+2` over 2.7 s. (An earlier draft of this note claimed `playTime` did not track real time; that was an artifact of comparing values across a poller reset, and is wrong.) It is also a **write canary** — `playTime` unmoved means no write happened, which is how the zero-update rows above were established.

## 3. Schema: all display strings, no identifiers

**[live]** Full party-entry key set, from the live payload:

```
name, nickname, gender, form, types, tempTypes, teraType, isTerastallized,
level, currentHP, maxHP, status, moveset, tempMoveset, ability, tempAbility,
passiveAbility, isPassiveEnabled, nature, baseStats, statStages, shiny,
variant, isFusion
```

with `baseStats: {atk, def, spAtk, spDef, speed}`, `statStages: {atk, def, spAtk, spDef, speed, acc, eva}`, and `tempStats: {}` / `tempTypes: []` / `tempMoveset: []` empty in the observed run.

**[live]** Every value is a string or a number — `gameMode: "Classic"`, `biome: "Town"`, `nature: "Bashful"`, `ability: "Blaze"`, `passiveAbility: "Flame Body"`, `types: ["Fire"]`, `gender: "Male"`, `variant: "N/A"`, `status: ""` when healthy, `moveset: ["Tackle","Leer","Ember"]`. **No enum ints anywhere.**

**[source] But the strings are two different kinds, and the payload does not mark which is which.** An English capture cannot tell them apart:

| | Fields | Why |
|---|---|---|
| **i18next — follows `prLang`** | `gameMode` (except the literal `"Title"`), `biome`, `ability`, `tempAbility`, `passiveAbility`, `moveset`, `tempMoveset`, `name` | `gameMode.getName()` (`game-mode.ts:412-422`), `getBiomeName()` (`utils/common.ts:451-457`), `Ability.name` (`abilities/ability.ts:50-65`), `Move.localize()` (`moves/move.ts:293-303`), `PokemonSpecies.name` (`pokemon-species.ts:1052`) |
| **TS enum member names — locale-invariant** | `nature`, `types`, `tempTypes`, `teraType`, `status`, `gender` | `capitalizeFirstLetterOnly(Nature[…])` etc. — `"Bashful"` is `Nature.BASHFUL` lowercased and re-capitalized, not a display name |
| **Raw identifiers / hardcoded literals** | `form` (`formKey`), `variant` (`{0:"Normal",1:"Rare",2:"Epic"}` at `battle-scene.ts:3180-3184`), `gameMode: "Title"` (literal at `:3191`) | never translated |

The language is `localStorage["prLang"]` (`i18n.ts:186`). Since the server rides the dev's own account and profile per #5, **this is a live risk, not a theoretical one.**

**[source] Two hazards that bite even in English:** `ability` / `passiveAbility` carry an implementation-status suffix — `" (N)"` unimplemented, `" (P)"` partial (`ability.ts:58-64`) — so `"Blaze"` can arrive as `"Blaze (P)"`, and the suffix moves between releases as abilities get implemented. `moveset` carries the same kind of marker via `nameAppend` (`move.ts:302`). **Any exact-match on an ability or move name is a latent bug.**

So "unfit for programmatic matching" is too strong — but it is right for exactly the fields an agent would most want to match on: biome, ability, moves. The locale-safe path is to read enum **ints** off the scene and resolve them through #2's generated tables, and treat `gameInfo` strings as display text for the model to read, never as keys. That makes #2's codegen *more* valuable than it looked, not less: it is the only locale-safe naming path.

### `gameInfoVersion` is pinnable, and worth little

**[source]** It is a plain string literal at `battle-scene.ts:3188`, so codegen *can* pin it — but it is not a build id and there is nothing to branch on, so its only value is as a **drift alarm**. Its history is thin: introduced as `"2.0.0"` in `f32a580e` (2026-05-03), bumped once to `"2.1.0"` in `8af1c982` (2026-06-21); the `1.x` `@since` tags are retroactive. There is **no consumable type** — `GameInfo` and `PartyInfo` are declared inside the method body and never exported, so codegen would have to transcribe the shape rather than import it.

## 4. What it lacks — and where that data actually lives

**[live]** Measured against the lean snapshot [#7](https://github.com/IIxauII/pokerogue-mcp/issues/7) specifies. Every gap is present on the scene, read in the same `Runtime.evaluate`:

| #7 needs | In `gameInfo`? | On the scene **[live]** |
|---|---|---|
| wave | yes (the *cleared* wave at the shop) | `scene.currentBattle.waveIndex` → `4` |
| biome | yes | — |
| money | **no** (visible on screen as ₱1,000) | `scene.money` → `1000` |
| active pokémon | yes, but stale | live party objects |
| enemy | **no** | `scene.currentBattle.enemyParty` → `Pidgey L3 2/16` |
| current menu | **no** | `scene.ui.mode` → `2`, or the DOM handle in [§5](#5-two-further-window-reachable-handles) |
| `run_over` | **no** | see [§6](#6-the-premise-this-ticket-was-written-on-is-gone) and [§8](#8-run_over-must-not-come-from-gameinfo) |
| held items | **no** (visible on screen) | `scene.modifiers.length` → `2` |
| move PP | **no** (`moveset` is names only) | live moveset objects |
| EXP | **no** | live party objects |

## 5. Two further window-reachable handles

Found by the source read, both verified live here. Neither is this ticket's question, and both matter beyond it.

**`data-ui-mode` — the current `UiMode` by name, always fresh.** **[source]** `ui.setModeInternal` and `revertMode` write `touchControls.dataset.uiMode = UiMode[mode]` (`ui.ts:548-551`, `612-615`); `#touchControls` is a static div in `index.html`, present on desktop (hidden, not removed), and the attribute is load-bearing CSS rather than debug scaffolding.

**[live]** Confirmed: `#touchControls` exists with `display: none`, and `dataset` carries exactly one key, `uiMode`. It read `"MESSAGE"` while `scene.ui.mode` was `0`, and both flipped to `"COMMAND"` / `2` in lockstep when the dialogue was advanced. So it is a fresher, cheaper read for *mode alone* than either `gameInfo` (which never carries mode) or the scene locator, and it partially rescues [#3](https://github.com/IIxauII/pokerogue-mcp/issues/3) and [#4](https://github.com/IIxauII/pokerogue-mcp/issues/4) from the no-scene-handle problem they were written under.

**`localStorage["sessionData_<user>"]` — the saved session.** **[source]** AES-encrypted with a hardcoded, public key, `saveKey = "x0i2O7WRiANTqPmZ"` (`constants.ts:56`). Contains `money`, `enemyParty`, `modifiers`, `enemyModifiers`, `pokeballCounts`, `waveIndex`, `battleType`, `trainer` **and `gameVersion`** — the pinning input #2 wants, obtainable with no scene handle at all. But it is written only at start-of-wave, so its money is pre-shop and its enemy HP is at-spawn: **useless for live enemy HP**.

**[live]** The key exists for this account (`sessionData_xauyxau2`, alongside `data_xauyxau2` and `runHistoryData_xauyxau2`). Decryption was not exercised.

## 6. The premise this ticket was written on is gone

The ticket's leverage was *"a free, stable, versioned snapshot source that needs no reach into Phaser internals"*. #9 removed both halves, and I reproduced its locator here.

**[live] The scene is reachable from a bare `Runtime.evaluate`.** Phaser's module-level `CanvasPool` retains its canvases' parents; exactly one is the `TextureManager`, which carries `.game`:

```js
const pool = window.Phaser.Display.Canvas.CanvasPool.pool;   // 1677 entries, {parent, canvas, type}
const game = pool.find(e => e.parent?.constructor?.name === "TextureManager").parent.game;
const scene = game.scene.scenes[0];                          // the only scene: BattleScene
```

Parent census over the 1677 entries: `TextureManager` ×1, `Text` ×1626, `BBCodeText` ×36. From `game`: `config.gameVersion === "1.12.0.11"`, `scene.ui.mode === 2`, `scene.money === 1000`, `scene.currentBattle.waveIndex === 4`, `scene.currentBattle.enemyParty` → `Pidgey L3 2/16`, `scene.modifiers.length === 2`.

**[live] Nothing of the game is on `window` itself**, so this is the only route: a scan of all 1251 `Object.getOwnPropertyNames(window)` entries for any object carrying `scene`/`scenes`/`ui`/`phaseManager`/`currentBattle`/`money`/`gameData`/`arena`/`modifiers`/`gameMode` returned exactly one hit — `gameInfo` itself, on `gameMode`. `Phaser.GAMES` is absent and the canvas has no own keys. #5's finding holds; the scene is reached *through* `Phaser`, not through a backref.

**And `gameInfo` is not cheaper.** #9's measurements, warm websocket, full CDP round trips: `window.gameInfo` alone **0.18 ms**; a lean scene read (settle predicate + wave/money/biome/party/enemy, 338 bytes) **0.21 ms**; a fat scene read (party IVs/stats/moveset+PP, enemy party, held modifiers, 950 bytes) **0.27 ms**; `Page.captureScreenshot` 29 ms / 86 KB for scale. `gameInfo` saves **0.03 ms** and returns strictly less, staler.

A "`gameInfo` plus a thin supplement" `get_state` would have to fetch money, enemy, items and mode from the scene anyway — i.e. do the entire locator job — then pay for `gameInfo` on top and reconcile two snapshots taken at different instants. There is no version of that which beats reading the scene once.

## 7. Write safety and the intended consumer

**[source] Nothing in the game reads it back.** Repo-wide there are only four `gameInfo` references, all inside the producer; no game code, test or doc consumes it.

**[live] Safe to clobber.** Mid-battle on wave 4 I set `window.gameInfo = null`, then played a full turn with `error` / `unhandledrejection` listeners attached. The turn resolved normally, `window.__errs.length === 0`, and the next write repopulated the property correctly (`wave: 4`, `19/24`). Because writes replace the object wholesale, a clobbered value self-heals at the next write point.

**[source] It exists for an external reader.** `updateGameInfo` arrived with commit `7bdb969a`, *"Add rich presence support"*, and `Admiral-Billy/Pokerogue-App`'s `src/discord_rpc.js` polls it at 1 Hz via `executeJavaScript('window.gameInfo')`, using `gameMode === 'Title'` as its not-in-a-run check. That is the design intent, and it explains the shape: display strings for a human-readable presence line, refreshed about as often as a presence line needs.

An accessor-based watcher (`Object.defineProperty` with get/set) is **not** recommended for instrumenting it and was abandoned here: no write happened while it was installed, so it never demonstrated that a producer assignment survives an accessor. The identity-diffing poller is non-invasive and answers the same question:

```js
// non-invasive update watcher: never touches the property definition
const P = { log: [], t0: performance.now(), reassigns: 0 };
let lastRef = window.gameInfo, lastJson = JSON.stringify(lastRef);
setInterval(() => {
  const ref = window.gameInfo, json = JSON.stringify(ref);
  if (ref !== lastRef) P.reassigns++;
  if (ref !== lastRef || json !== lastJson) { P.log.push({ t: performance.now() - P.t0, json }); lastRef = ref; lastJson = json; }
}, 30);
```

## 8. `run_over` must not come from `gameInfo`

`gameInfo` *is* good at one thing — it needs no locator, so one property read answers "is the game up at all". But it cannot carry `run_over`:

**[source] The good news first:** `reset()` calls `updateGameInfo()` at `battle-scene.ts:1216`, at method-body indentation — **not** inside any conditional — after zeroing `money`, `modifiers`, `party` and `currentBattle`. Because the payload guards every run-scoped field on `currentBattle` (`:3190-3193`), the write always produces the Title payload. So a `gameInfo` liveness check will **not** report a dead run as live, which is the caveat I flagged live and could not settle.

`gameMode === "Title"` is also safe to match on, despite `gameMode` being localized in general: that one value is a hardcoded literal at `battle-scene.ts:3191`, not an i18next lookup. `party.length === 0 && wave === 0` is an equally good check.

**The bad news:** the payload cannot say *why* the run ended. **[source]** Every teardown path calls the same `reset()` and produces the same Title payload — game over (`post-game-over-phase.ts:20-31`), **per-wave save failure** (`encounter-phase.ts:302-304`, the map's *"Losing a run without wiping"*), save & quit (`menu-ui-handler.ts:654`), logout, language change, and the starter-select / pokedex / gacha back-outs. `GameOverPhase.isVictory` exists (`game-over-phase.ts:38`) but is `private` on a phase object; since the scene is reachable, a distinguishing signal is likelier to come from the phase queue or `gameData.gameStats.sessionsWon` than from `gameInfo`. **From `gameInfo` alone it is not recoverable** — which is what graduates that fog item into its own ticket.

## Live run state left behind

The dev's real Classic run was advanced **waves 1 → 5** (a Potion reward was taken and applied, healing Fuecoco to full; it levelled to 6). It is parked at the wave-5 trainer battle (Youngster Cody), Fuecoco Lv.6 19/24, ₱1,000, `ui.mode` `COMMAND`.
