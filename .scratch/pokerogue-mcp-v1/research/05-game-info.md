# Research: what `window.gameInfo` covers

Ticket: [#10 What window.gameInfo covers](https://github.com/IIxauII/pokerogue-mcp/issues/10)
Date: 2026-09-12

## Sources

- **[live]** `https://pokerogue.net` in the persistent profile from [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) (`~/.pokerogue-mcp/chrome-profile`, port 9222), logged in as `xauyxau2`, driving a **real Classic run** through waves 1→5. Title screen reports `v1.12.0.11`, and `game.config.gameVersion === "1.12.0.11"` — the same build [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2) pinned its enum tables to. All probes were bare `Runtime.evaluate` over a raw CDP websocket; key input was `Input.dispatchKeyEvent`; ground truth for every freshness claim is a paired `Page.captureScreenshot`.
- **[live]** The probe harness is `cdp.mjs` (eval / press / shot) plus the watcher scripts, reproduced inline below.
- Cost figures and the scene locator come from [#9 *Reaching the running game from injected JS*](https://github.com/IIxauII/pokerogue-mcp/issues/9), independently reproduced here (see [§6](#6-the-premise-this-ticket-was-written-on-is-gone)).

Claims are tagged **[live]** (measured on the running game) or **[source]** (read from the PokéRogue repo at tag `v1.12.0.11` / `e4e9b53`).

---

## Answer in one line

`gameInfo` is a **turn- and wave-boundary snapshot, not a settled-state snapshot** — it is demonstrably stale at settled decision points — so `get_state` is built on the **scene**, and `gameInfo` is kept only as a locator-free liveness check.

---

## 1. What it is, mechanically

**[live]** `window.gameInfo` is a plain data property — `{ writable: true, enumerable: true, configurable: true }`, no getter — holding one object with seven keys:

```
gameInfoVersion, playTime, gameMode, biome, wave, luck, party
```

**[live] It is replaced wholesale, not patched.** A poller comparing object identity every 30 ms recorded `ref !== lastRef` on updates (`why: "newObject+content"`). **Consumers must re-read `window.gameInfo` on every access; a cached reference goes stale silently and never throws.**

**[live] At the title screen it is present but empty-ish:** `{ gameInfoVersion: "2.1.0", playTime: 0, gameMode: "Title", biome: "", wave: 0, luck: -1, party: [] }`. So `gameMode === "Title"` and `party.length === 0` do distinguish "no run in progress" — with the caveat in [§5](#5-the-liveness-check-caveat-that-matters-for-the-map).

**[live] Nothing else of the game is on `window`.** A scan of all 1251 `Object.getOwnPropertyNames(window)` entries for any object carrying `scene`/`scenes`/`ui`/`phaseManager`/`currentBattle`/`money`/`gameData`/`arena`/`modifiers`/`gameMode` returned exactly one hit: `gameInfo` itself (on `gameMode`). `Phaser.GAMES` is absent, `document.querySelector('canvas')` has no own keys, and `document.body.innerText` is empty. This confirms #5's finding — but it is **not** the whole story, see [§6](#6-the-premise-this-ticket-was-written-on-is-gone).

## 2. Freshness: a settled read *can* return a stale payload

This was the ticket's central question. **It can, and the gap is large enough to make wrong decisions.**

**[live] Method.** A 30 ms poller logged every change to `JSON.stringify(window.gameInfo)` and every change of object identity, timestamped against `performance.now()`. Because `playTime` is part of the payload and is refreshed on every update, **`playTime` doubles as a write canary**: if `playTime` has not moved, no update has happened.

**[live] Where updates do NOT happen.** Zero updates were recorded across all of:

| Sequence | Elapsed | Updates |
|---|---|---|
| Open the Fight submenu, then cancel back to the command menu | ~4 s | **0** |
| Idle at the command menu | 30 s | **0** |
| Idle at the command menu (second trial, wave 3) | 25 s | **0** |
| A whole turn that dealt damage but took none (Ember → enemy fainted) | ~14 s | **0** |
| The post-battle chain: faint message → EXP gain → level-up → stat-gain panel | ~20 s | **0** |
| Sitting on the reward-select screen | — | **0** |
| The killing turn of a wave (damage taken, then enemy faints) | ~12 s | **0** |

**[live] Where updates do happen.** Two places only, in every trial:

1. **Wave transition** — **two** updates, 1.5–3 s apart, at three of the four transitions observed (1→2 at +52.4/+54.4 s, 2→3 at +40.5/+43.2 s, 3→4 at +33.1/+34.6 s). The fourth (4→5) shows one update in the log because I stopped sampling ~3 s after it; treat the pair as the norm and the single as unsampled, not as a counter-example.
2. **Turn init** — when the command menu is re-presented for a new turn. This is the one that produced `14/22 → 9/22` mid-wave.

**[live] The decisive measurement.** Wave 3, after Ember killed a Pidgey that had just hit Fuecoco:

| | Screen (ground truth) | `gameInfo` |
|---|---|---|
| At the faint message | **4/22** | 9/22 |
| At the EXP-gain message | **4/22** | 9/22 |
| At the level-up message | **Lv.6, 6/24** | **Lv.5**, 9/22 |
| At the reward-select screen | **Lv.6, 6/24** | **Lv.5**, 9/22 |

Three fields — `level`, `currentHP`, `maxHP` — wrong at a fully settled decision point, stale by one turn's damage *plus* a level-up. `playTime` was stale by **233 units** at the wave-1 reward screen (reading `2` when the run's live value turned out to be `235`).

**[live] The failure this would cause.** The reward screen is exactly where an agent decides whether to take a Potion. An agent reading `gameInfo` there sees `9/22` — comfortable — when the real state is `6/24`, one hit from losing the run. Both updates land only at the *next* wave transition, i.e. after the decision is made.

**So: settling the game (per [#3](https://github.com/IIxauII/pokerogue-mcp/issues/3)) does not make `gameInfo` fresh.** The two are unrelated: #3's predicate detects that the *game* is quiet, while `gameInfo` refreshes on its own coarse event set. A settled read is fresh only by coincidence — when nothing changed since the last turn init.

## 3. Schema: all display strings, no identifiers

**[live]** Full party-entry key set, from the live payload:

```
name, nickname, gender, form, types, tempTypes, teraType, isTerastallized,
level, currentHP, maxHP, status, moveset, tempMoveset, ability, tempAbility,
passiveAbility, isPassiveEnabled, nature, baseStats, statStages, shiny,
variant, isFusion
```

with `baseStats: {atk, def, spAtk, spDef, speed}`, `statStages: {atk, def, spAtk, spDef, speed, acc, eva}`, and `tempStats: {}` / `tempTypes: []` / `tempMoveset: []` empty in the observed run.

**[live] Every string is a display name, not a stable identifier**: `gameMode: "Classic"`, `biome: "Town"`, `nature: "Bashful"`, `ability: "Blaze"`, `passiveAbility: "Flame Body"`, `types: ["Fire"]`, `gender: "Male"`, `variant: "N/A"`, `status: ""` when healthy, `moveset: ["Tackle","Leer","Ember"]`. **No enum ints anywhere.** If those strings come from i18n (unverified — see [§7](#7-open-from-the-live-side)), the payload is locale-dependent and unfit for any programmatic matching.

**[live] `playTime` is not a usable clock.** It only changes on update, and its increments do not track elapsed real time: `+197` across 33 s in one interval, `+75` across 50 s in another. Units and origin unestablished from the live side. Useful as a write canary, nothing more.

## 4. What it lacks — and where that data actually lives

**[live]** Measured against the lean snapshot [#7](https://github.com/IIxauII/pokerogue-mcp/issues/7) specifies. Every gap is present on the scene, read in the same `Runtime.evaluate`:

| #7 needs | In `gameInfo`? | On the scene **[live]** |
|---|---|---|
| wave | yes | `scene.currentBattle.waveIndex` → `4` |
| biome | yes | — |
| money | **no** (visible on screen as ₱1,000) | `scene.money` → `1000` |
| active pokémon | yes, but stale | live party objects |
| enemy | **no** | `scene.currentBattle.enemyParty` → `Pidgey L3 2/16` |
| current menu | **no** | `scene.ui.mode` → `2` |
| `run_over` | **no** | see [§5](#5-the-liveness-check-caveat-that-matters-for-the-map) |
| held items | **no** (visible on screen) | `scene.modifiers.length` → `2` |
| move PP | **no** (`moveset` is names only) | live moveset objects |
| EXP | **no** | live party objects |

## 5. The liveness-check caveat that matters for the map

`gameInfo` *is* good at one thing: it needs no locator, so one property read answers "is the game up at all". But **[live]** it is stale by design, and I did **not** establish whether the mid-run `globalScene.reset(true)` path — the map's *"Losing a run without wiping"* fog item, where a failed per-wave `saveAll` dumps the player on a title screen with the run gone — rewrites it.

`gameMode` reads `"Title"` after a fresh page load. That is not evidence about an in-page reset. If that path does not update `gameInfo`, a `gameInfo`-based liveness check reports `Classic` / wave N for a run that no longer exists — precisely the failure that fog item exists to prevent. **Do not derive `run_over` from `gameInfo`.**

## 6. The premise this ticket was written on is gone

The ticket's leverage was *"a free, stable, versioned snapshot source that needs no reach into Phaser internals"*. #9 removed both halves of that, and I reproduced its locator here.

**[live] The scene is reachable from a bare `Runtime.evaluate`.** Phaser's module-level `CanvasPool` retains its canvases' parents; exactly one is the `TextureManager`, which carries `.game`:

```js
const pool = window.Phaser.Display.Canvas.CanvasPool.pool;   // 1677 entries, {parent, canvas, type}
const game = pool.find(e => e.parent?.constructor?.name === "TextureManager").parent.game;
const scene = game.scene.scenes[0];                          // the only scene: BattleScene
```

Parent census over the 1677 entries: `TextureManager` ×1, `Text` ×1626, `BBCodeText` ×36. From `game`: `config.gameVersion === "1.12.0.11"`, `scene.ui.mode === 2`, `scene.money === 1000`, `scene.currentBattle.waveIndex === 4`, `scene.currentBattle.enemyParty` → `Pidgey L3 2/16`, `scene.modifiers.length === 2`.

**And `gameInfo` is not cheaper.** #9's measurements, warm websocket, full CDP round trips: `window.gameInfo` alone **0.18 ms**; a lean scene read (settle predicate + wave/money/biome/party/enemy, 338 bytes) **0.21 ms**; a fat scene read (party IVs/stats/moveset+PP, enemy party, held modifiers, 950 bytes) **0.27 ms**; `Page.captureScreenshot` 29 ms / 86 KB for scale. `gameInfo` saves **0.03 ms** and returns strictly less, staler.

A "`gameInfo` plus a thin supplement" `get_state` would have to fetch money, enemy, items and `ui.mode` from the scene anyway — i.e. do the entire locator job — and then pay for `gameInfo` on top, and reconcile two snapshots taken at different instants. There is no version of that which beats reading the scene once.

## 7. Write safety

**[live] Safe to clobber; nothing reads it back.** Mid-battle on wave 4 I set `window.gameInfo = null`, then played a full turn with an `error` / `unhandledrejection` listener attached. The turn resolved normally, `window.__errs.length === 0`, and the next update repopulated the property with a correct payload (`wave: 4`, `19/24`). Because updates replace the object wholesale, a clobbered value self-heals at the next update point.

An earlier attempt to instrument it with an accessor (`Object.defineProperty` with get/set) is **not** recommended and was abandoned: no write happened while it was installed, so it never demonstrated that a producer assignment survives an accessor. The identity-diffing poller below is non-invasive and answers the same question.

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

## 8. Open from the live side

Left to the source read, because live probing cannot settle them:

- The authoritative producer and its full call-site list — whether the observed set (turn init + wave transition ×2) is complete, and whether the `reset(true)` / return-to-title path is in it ([§5](#5-the-liveness-check-caveat-that-matters-for-the-map)).
- Whether `gameInfoVersion` is pinnable for codegen the way #2 pins `Button`/`UiMode`: where `"2.1.0"` is defined, whether a TS interface for the payload exists, and whether the constant is bumped with discipline.
- Whether the payload's display strings go through i18n, which would make it locale-dependent ([§3](#3-schema-all-display-strings-no-identifiers)).
- Who the intended consumer is (a Discord RPC / Steam wrapper is the obvious guess, given a versioned payload nothing in-game reads).

## Live run state left behind

The dev's real Classic run was advanced **waves 1 → 5** (a Potion reward was taken and applied, healing Fuecoco to full; it levelled to 6). It is parked at the wave-5 trainer-battle intro (Youngster Cody), Fuecoco Lv.6 19/24, ₱1,000.
