# Where the panel spends the game's frame budget

Research for the lags and freezes a player reports while playing PokéRogue with the extension installed. The question: **what else, besides the four costs already on the list, does the extension make the game's main thread do, how often, and what triggers it?**

Nothing here was measured. This is a code reading of the repo at `b64a847`, of the pinned game (`.cache/pokerogue/v1.12.0.11`) and of the Phaser 3.90.0 copy pinned under it. No browser was driven. Every cost is an estimate by shape (per refresh, per turn, per wave, per run), and §5 lists what would confirm each one.

Vocabulary is `CONTEXT.md`: **card**, **group**, **strip**, **drawer**, **pane**, **turn read**, **run read**, **preview**, **journal**, **hypothesis**. A **refresh** is one run of `timedTick` (`hud/99-start.js:56`), once a second. The HUD's files are cited as `hud/NN-name.js`, short for `skills/coachemon/scripts/hud/`. Game files are cited as `game:src/…`, short for `.cache/pokerogue/v1.12.0.11/src/…`.

Tags: **[source]** is read from code at a named path and line. **[docs]** is stated by a vendor or a spec. **[unverified]** is inferred and not confirmed. §6 collects the unverified items.

---

## 1. Summary

The HUD runs in the page's main world, in the same event loop as Phaser's `requestAnimationFrame` loop. A refresh is one task, and the browser cannot render a frame while a task is running ([HTML event loop processing model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)). A task over 50 ms counts as a long task ([web.dev, Optimize long tasks](https://web.dev/articles/optimize-long-tasks)) **[docs]**. So each cost below shows up as a dropped frame or a hitch at the moment it runs.

New findings, most likely impact first:

1. **In 23 of the game's languages the type and status atlases have other names.** The panel's type badge never finds its sprite, so the fallback path in known item 3 fires on every battle card, on every refresh, for the whole session (§3.1).
2. **The battle card's hold key changes after the player has already committed.** The game changes `enemySwitchCounter` in `EnemyCommandPhase`, so in trainer fights the whole turn animation runs with a new key and no live read. The full card, fight plan included, is then rebuilt on every refresh and thrown away (§3.2).
3. **A preview builds real game objects**, and it runs again every time the run key changes. The two preview replays construct `EnemyPokemon`s together with their `EnemyBattleInfo` UI. That UI holds Phaser `Text` objects, and each one renders on a canvas and uploads a GPU texture. The replays run again after every level-up, faint or change in the number of held items, often in the middle of a battle animation (§3.3).
4. **The rewards and learn cards are never memoised.** Each refresh while the shop is open re-judges every offer: each TM against each learner, and each offer in each previewed reroll (§3.4).
5. **Each journal save re-serialises the whole journal synchronously.** That can be megabytes, several times per mystery encounter wave. The journal shares the origin's 5 MiB `localStorage` quota with the game's own save data, and when that quota runs out the save loop becomes quadratic (§3.5).
6. **A draw builds the DOM for every group, not only the open pane**, and it happens again on any read of the card after each refresh. This multiplies the cost of known item 3 (§3.6).
7. Lower-impact items: the sprite path's synchronous `toDataURL` (§3.7); the starter screen's beam search (§3.8); the chunk-scan retry loop (§3.9); the sandbox leaving game objects in V8 dictionary mode (§3.10); caches that never shrink (§3.11); small costs paid on every refresh (§3.12).

The extension outside the page (relay, background, transport) adds nothing measurable to the game's thread (§3.13).

§4 confirms or corrects the four items already known. §5 says how to measure each one.

---

## 2. The loop, as it runs

- `setInterval(timedTick, 1000)` (`hud/99-start.js:63`). `timedTick` runs `tick()` and then `stream()`, and times the two together (`:56-62`) **[source]**.
- `tick()` (`hud/98-tick.js:66-98`) does the following, in order:
  - `rerollCheck` and `previewCheck`.
  - `accountRead`, then `readCard`.
  - `previewArm` and `rerollArm`, then `journalCheck`.
  - `sigOf(card)`, which is `JSON.stringify([panelState, openGroup, card])` (`:32`).
  - On a changed signature, `el.replaceChildren(...)` with freshly drawn groups (`:85-90`).
- `readCard` (`hud/60-card.js:91-129`) opens a turn read for a battle (`readTurn`, `hud/25-turn.js:346`). It opens a run read (`readRun`, `hud/26-run.js:40`) for a learn, rewards, biome or encounter screen, and opens a second run read for the preview and the look-ahead on battle and rewards cards (`hud/60-card.js:120-127`) **[source]**.
- A turn read's memo lives for one refresh. `makeTurn` creates a new `caches` Map each time (`hud/25-turn.js:240`). So a battle card survives between refreshes only through `held` (`hud/60-card.js:61-71`). A run read's memo survives for the last two run keys (`hud/26-run.js:28-37`) **[source]**.

---

## 3. New findings, ranked

### 3.1 Localized type and status atlases: known item 3 becomes permanent for most languages

**What.** `badge()` draws a type through `img("types", type.toLowerCase(), type, ICON.mark)`, with a non-null text fallback (`hud/90-render.js:106-112`). If the texture key `"types"` does not exist, `img` sets `missed = true` (`:71-80`), and `tick` then stores `last = ""` (`hud/98-tick.js:89`). The next refresh rebuilds the whole panel, and so does every refresh after it **[source]**.

The game loads `types` and `statuses` **only in English**. For any language that `hasAllLocalizedSprites` accepts, it loads `types_<lang>` and `statuses_<lang>` instead, and nothing else ever loads the plain key:

```ts
// game:src/loading-scene.ts:190-193
const lang = i18next.resolvedLanguage ?? "en";
const keySuffix = lang !== "en" && hasAllLocalizedSprites(lang) ? `_${lang}` : "";
this.loadAtlas(`statuses${keySuffix}`, "").loadAtlas(`types${keySuffix}`, "");
```

The comment above that line says non-English loads *both* atlases, and the code says otherwise. Every in-game use goes through `getLocalizedSpriteKey("types")` (`game:src/utils/common.ts:412`; for example `game:src/ui/handlers/summary-ui-handler.ts:880`). The localized list is es-ES, es-419, eu, fr, da, de, it, zh-Hans, zh-Hant, pt-BR, th, tr, ko, ja, ca, ru, id, hi, tl, sv, uk, vi and pl (`game:src/utils/common.ts:328-360`) **[source]**.

**Trigger and frequency.** Every refresh, for as long as a card containing a type badge is on show. That covers every battle card: the act line draws `badge(sl.type)` for each slot (`hud/96-render-battle.js:40`, `:49`). It also covers the learn, preview, team, fusion and biome renderers, which draw `badge()` too. The cost is paid whatever the language, and ends only if the player plays in English. **[source]**

**Why it costs.** Each refresh redraws every group of the card (§3.6), creates a fresh `<img>` for every mon icon, re-parses the inline `clamp()`/`round()` styles on every node, and replaces the whole panel subtree. Style, layout and paint for the subtree then follow in the same frame. The status sprite (`img("statuses", …, null)`, `hud/96-render-battle.js:109`) has a null fallback, so it does not trigger a rebuild. In these languages it is simply never drawn, which is a display bug rather than a cost **[source]**.

**Confidence.** High that the key is absent in these languages: it is read straight from the pinned loader. Whether *this* player's game runs in one of them is unknown. The user's other tooling points to Germany, which is suggestive and not evidence **[unverified]**.

**Fix direction.** Ask the game for the key, not a literal: the game's own `getLocalizedSpriteKey` rule, with the plain key as the fallback. Separately, stop a missing *optional* sprite from forcing a rebuild: cap the retries, or retry only when a texture-add event fires.

### 3.2 The battle card's hold key moves after the player commits (trainer fights)

**What.** `held` is keyed on `wave, turn, enemySwitchCounter, party ids, foe ids` (`hud/60-card.js:66`), and is only set when `turn.live` (`:69`). The game changes `enemySwitchCounter` inside `EnemyCommandPhase`, which runs *after* the player's `CommandPhase`:

- It goes up when the AI decides to switch (`game:src/phases/enemy-command-phase.ts:82`).
- It goes down whenever the AI picks a move: `Math.max(counter - 1, 0)` (`:103`).

So on any turn where the counter is above 0 (the turn after an enemy switch, and the one after that), the key changes the moment the enemy commits. The whole move animation of that turn then runs non-live, under a key that `held` does not have **[source]**.

The game also increments `battle.turn` at the *start* of `TurnEndPhase` (`game:src/phases/turn-end-phase.ts:26`), so the end-of-turn animations are non-live under a new key as well: weather, Leftovers, status damage and the next turn's setup **[source]**.

**Trigger and frequency.** Every refresh in each of these windows. In an ordinary turn that is the end-of-turn animation, one to three refreshes. In a trainer fight it is the whole turn after a switch, several refreshes per turn. Each of those refreshes runs `composeBattleCard`, which includes `teamPlanner(arrivalTurn(turn))` (`hud/60-card.js:43`). The planner is a beam search (`TP_BEAM 24`, `TP_TURNS 15`, `hud/35-team-plan.js:9-11`), run on type-chart numbers because the read is not live **[source]**.

**Why it costs.** It is the same model cost as known item 1, paid many times per turn instead of once. It also has a visible side effect. The non-live card, built on estimates, replaces the live card on the panel partway through the turn. Its HP-dependent rows (`hp:` in `battleModel`, `hud/30-planner.js`) change as the bars drain, so the signature changes and the DOM is rebuilt on top of the model cost **[source]**.

**Confidence.** High for the mechanism. How long the windows last depends on animation speed **[unverified]**.

**Fix direction.** Remove `enemySwitchCounter` from the *hold* key, or read it as it stood when the live read happened. Keep the last live card until the next live read or a change of wave or foe (`CONTEXT.md`, *Turn read*: "stays up through the turn's animations"), instead of recomputing a non-live card only to discard it.

### 3.3 A preview replay constructs real game display objects, and runs again on every run-key change

**What.** `previewFor` replays the next wave inside a seed fork (`hud/48-preview.js:75-178`). It calls:

- `s.generateNewBattleTrainer(w)` (`:105`).
- `new (s.currentBattle.constructor)(…)` (`:112`).
- `s.addEnemyPokemon(...)` for each foe (`:133`).

It then destroys what it built (`:176`) **[source]**. In the game, `addEnemyPokemon` ends in `pokemon.init()` (`game:src/battle-scene.ts:978`), and `init()` does the following (`game:src/field/pokemon.ts:511-545`):

- It builds an `EnemyBattleInfo` and adds it to the live `fieldUI`.
- It creates two pokemon sprites with the sprite pipeline.

`EnemyBattleInfo`'s constructor (`game:src/ui/battle-info/enemy-battle-info.ts:48-73`, `game:src/ui/battle-info/battle-info.ts:227-259`) creates a box sprite, name and gender `Text` objects, level and HP images, stat containers, and the owned icon and champion ribbon. `addTextObject` is `globalScene.add.text(...).setScale().setShadow()` plus `setLineSpacing()` (`game:src/ui/text.ts:13-31`). In Phaser, every `Text` takes a canvas from the shared pool (`phaser/src/gameobjects/text/Text.js:139`). Each `updateText` re-renders that canvas and, under WebGL, uploads it with `renderer.canvasToTexture` (`:1455`) **[source]**. A generated trainer builds two field sprites of its own (`game:src/field/trainer.ts:108-124`).

**Trigger and frequency.** The memo is keyed on the wave (`hud/48-preview.js:231`) inside a run-key bucket. The run key holds each member's level, luck and standing, the modifier *count*, the encounter spawn chance and more (`hud/26-run.js:9-26`). So the replay runs again after each of these:

- Every level-up. Each KO's EXP can level several members.
- Every faint or revive.
- Every held item added, or a berry stack used up.
- Every new wave.

`aheadModel` runs a *second* replay for the next big fight within five waves (`hud/49-ahead.js:133`), and it too is memoised only for the run key (`:122`). On a battle card, the preview and the look-ahead are read on every refresh (`hud/60-card.js:122-126`). The rebuild therefore lands on the first refresh after a level-up, which is often during the EXP-bar or level-up animation. Expect several replays per wave, each building one to six foes' worth of display objects **[source]**.

**Why it costs.** Each foe allocates a container, a dozen or so game objects, several canvases, and GPU texture uploads that are thrown away in the same task. It also runs the game's own `EnemyPokemon` constructor: moveset generation, IVs and the boss roll. All of this is synchronous inside a refresh **[source]**. The exact cost per foe is **[unverified]**.

**Confidence.** High for the mechanism. Medium for the size of the impact.

**Fix direction.** Key the preview on the inputs the replay actually reads, not on the whole run key, because a level-up changes the enemy levels only through `getWaveForDifficulty`/party level. Alternatively, build foes without `init()`. The pieces the preview reads (moveset, stats, ability, species) exist before `init()`. Or run the replay only at a decision point, never during an animation.

### 3.4 The rewards and learn cards are rebuilt from scratch on every refresh

**What.** `rewardsModel` (`hud/52-shop.js:70-252`) has no memo of its own. On each refresh it does the following:

- It judges every free offer, and every offer in each previewed reroll through `rerollAdvice`, which calls `judge(t)` per offer (`:256-270`).
- For each TM it calls `tmAdvice` (`:192`), which runs `learnAdvice` for *each* party member that can learn it (`:49-62`). `learnAdvice` scores all four current moves plus the incoming one against the roster ahead (`hud/40-learn.js:509-540`).
- It recomputes `doubleOdds` (`:128`, `:192`) and `rewardContext` (`:128`).

Only `rerollPreview` (`hud/50-reroll.js:82`), `teamAudit` (`hud/50-audit.js:192`), `aheadModel` and the fusion options (`hud/49-fusion.js:118`) are memoised **[source]**.

The rewards branch also opens *two* run reads per refresh, one for the model and one for the preview (`hud/60-card.js:106`, `:122`), so it pays two sandbox snapshots.

The learn card is the same. `learnModel` (`hud/40-learn.js:558`) runs on every refresh while the prompt is up (`hud/60-card.js:102`), and `learnState` builds a new move object each time (`hud/02-screens.js:14`) **[source]**.

**Trigger and frequency.** Every refresh while the shop or the learn prompt is open. These are exactly the screens where the player stops to read the panel, so there are many refreshes. The DOM is left alone, because the signature does not change unless §3.1 applies.

**Why it costs.** It is pure JS model time, repeated with identical inputs. The reroll memo's key includes `Phaser.Math.RND.state()` (`hud/50-reroll.js:22`). If anything on that screen draws from the seeded stream between refreshes, that memo misses every time and re-runs the game's reward roll two or three times per refresh (`:31-46`, `:85-91`) **[unverified]**. Nothing in the pinned UI code was found drawing from it while idle.

**Confidence.** High that the work is repeated. Low to medium that it costs much per refresh, probably a few milliseconds **[unverified]**.

**Fix direction.** Memoise `rewardsModel` in the run read on what it reads beyond the run key: the offers' ids and tiers, the shop rows, `money` and `rerollCount`. Memoise `learnModel` on the mon id, its moveset, the incoming move id and the roster wave.

### 3.5 The journal re-serialises the whole store synchronously, and shares the game's save quota

**What.** Every `save()` does `localStorage.setItem(KEY, JSON.stringify(journal))` over up to 40 entries (`hud/55-journal.js:6`, `:30-38`). Each entry holds:

- A deep copy of the encounter card (`:90`).
- Up to 60 `step`s, each with both parties, the item list, money and the UI mode (`:45-56`, `:102-108`).

A save happens when an encounter starts, when its card arrives, when the pick lands, and when the entry closes (`:83`, `:109`, `:116`). If the write throws (quota), the loop drops one entry and **re-stringifies everything**, again and again until it fits (`:33-37`) **[source]**.

**Trigger and frequency.** Up to four writes per mystery encounter wave, every run. The store is bounded by entry count, not size, so each write gets more expensive as the journal fills over many runs.

**Why it costs.** "LocalStorage should be avoided because it is synchronous and will block the main thread" ([web.dev, Storage for the web](https://web.dev/articles/storage-for-the-web)) **[docs]**. The quota is 5 MiB of `localStorage` per origin ([MDN, Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) **[docs]**. The game keeps its own encrypted save data and run history in the same origin's `localStorage` (`game:src/system/game-data.ts:321`, `:476`, `:547`) **[source]**.

A rough size: a step is about 1 KB of JSON and an entry about 40–100 KB, which puts a full journal around 1.5–4 MB **[unverified]**. Each save is then a multi-megabyte stringify and write in one task. A journal that fills the quota also takes room from the game's saves, which is a correctness risk beyond the lag.

**Confidence.** High for the mechanism. The size is an estimate.

**Fix direction.** Cap by bytes as well as by entries. Save only the entry that changed, one key per entry. Defer writes to idle time or `pagehide`. Consider leaving the journal out of the store flavour, since it is an instrument for checking claims and no player reads it (`CONTEXT.md`, *Journal*).

### 3.6 A draw builds every group's DOM, and any read after a refresh draws again

**What.** `setShown(card)` runs on every refresh and resets `groups` to `undefined` (`hud/98-tick.js:43`, `:81`). `shownGroups()` then calls the kind's full `draw(shown)`. That builds DOM rows for **every** group, including those in closed tabs, so that `drawer()` can show one pane and `wireCard` can flatten all of them (`hud/90-render.js:226-249`). Draws happen in three places:

- On a panel rebuild (`hud/98-tick.js:87`).
- On the card event when its signature changes (`hud/99-start.js:25-29`, `:49`).
- On every `card` command, the agent's late-join read (`hud/99-start.js:72`, `src/page/card.ts:18`).

Each draw is a fresh set of nodes, with `Object.assign(n.style, …)` on each (`hud/90-render.js:62-67`) and new listeners on the tab and control nodes (`:178`, `:274`) **[source]**.

**Trigger and frequency.** Once per rebuild, which is every refresh under §3.1. Also once per agent read.

**Why it costs.** Node creation and inline style parsing scale with the size of the card, not with the one pane on screen. The nodes for hidden tabs are built only to be dropped, or walked back into text (`rowText`, `:256-263`).

**Confidence.** High. The cost is modest when the panel rebuilds rarely and multiplied when §3.1 applies.

**Fix direction.** Keep `groups` across refreshes when the signature has not changed. Build the plain text from the model rather than from DOM. Draw only the open pane's rows.

### 3.7 Sprite capture: a synchronous PNG encode per new sprite

**What.** The first time the panel draws a sprite, `game.textures.getBase64(key, frame)` runs (`hud/90-render.js:25`). Phaser takes a canvas from the **shared** `CanvasPool`, calls `getContext('2d', { willReadFrequently: true })`, then `drawImage` and `toDataURL('image/png')`, and hands the canvas back (`phaser/src/textures/TextureManager.js:406-450`, `phaser/src/display/canvas/CanvasPool.js`) **[source]**.

**Why it costs.** `toDataURL` encodes the image synchronously on the calling thread ([HTML, `toDataURL`](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl)) **[docs]**. Per icon this is small, but a new card full of mons that have not been seen yet pays for all of them in one refresh: a biome card's catch list, a starter grid pick list, a preview's foes.

The canvas is software-backed: `willReadFrequently` "will force the use of a software (instead of hardware accelerated) 2D canvas" ([MDN, `getContext`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)) **[docs]**. A worry that the HUD leaves a software context on a pooled canvas for the game's `Text` objects to inherit does not hold. Phaser's own `MeasureText` already asks for `willReadFrequently: true` on the same pooled canvases (`phaser/src/gameobjects/text/MeasureText.js:22`) **[source]**.

The cache of data URLs (`hud/90-render.js:6`) is never cleared. It grows with every distinct icon seen in the session, which includes every species the player's cursor rests on in the starter grid (`hud/51-starters.js:281-290`) **[source]**.

**Confidence.** Medium for the per-card spike.

**Fix direction.** Crop the atlas with CSS (`background-image` plus `background-position` on the atlas's own source URL) instead of encoding PNGs. Or use a private canvas that never enters Phaser's pool. Bound the cache.

### 3.8 The starter screen: a beam search on every team change

**What.** `starterModel` rebuilds when its key changes (`hud/51-starters.js:182-185`). The key covers the chosen species, their passive and ability flags, and the tables. The key itself sums over every `starterData` entry on every refresh (`:179-181`). A rebuild does the following:

- It scores every caught starter container (`:227-231`).
- It runs `search()` up to twice, `BEAM 40` over up to 36 candidates to a depth of six, calling `teamScore` for each state it considers (`:138-166`, `:239`, `:252`).

**Trigger.** Each time a starter is added to or removed from the team. Cursor moves change only `viewing`, which is cheap, though the panel is then rebuilt, as intended.

**Why it costs.** It is the one screen where the panel does whole-dex work. That means a spike per click on the starter screen, not a lag during play. It is roughly thousands of `teamScore` calls, each looping over 18 types against the members **[unverified: magnitude]**.

**Confidence.** Medium.

**Fix direction.** Score the containers once per account state. Run the search off the input path, for example after the cursor settles.

### 3.9 The chunk scan retries every 30 s while any table is missing

**What.** `loadGameTables` returns early only when both `tables` *and* `rewardFns` are set (`hud/04-game-tables.js:68`). Otherwise, every 30 s, it does the following:

- It re-reads `performance.getEntriesByType("resource")`.
- It injects one `<script type=module>` per game chunk (`:58-66`, `:80`).
- It re-scans every export of every chunk, including `Object.keys()` of every object export (`:10-42`, `:35`).

`accountRead` calls it on every refresh (`hud/98-tick.js:53-55`) **[source]**.

**Trigger.** Only while something is missing: a function upstream renames, or a chunk that never appears in the resource timeline. Re-importing an already-loaded module URL does not evaluate it again, because it is served from the module map ([HTML, module map](https://html.spec.whatwg.org/multipage/webappapis.html#module-map)) **[docs]**. The scan's allocations are still repeated on every retry.

The resource timing buffer starts at 250 entries or more ([MDN, `setResourceTimingBufferSize`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/setResourceTimingBufferSize)) **[docs]**. The game loads far more assets than that, so a chunk loaded late could fall outside the buffer. The pinned game has few dynamic imports (`game:src/main.ts:22-23`, `game:src/global-audio-manager.ts:8`), which makes this unlikely **[source]**.

**Confidence.** Low that it fires on the pinned build. The pinned build keeps function names (`keepNames: true`, `.cache/pokerogue/v1.12.0.11/vite.config.ts:45-53`), so `rewardFns` is findable.

**Fix direction.** Back off exponentially after a failed scan. Scan only chunks not scanned yet.

### 3.10 The sandbox adds and deletes own properties on hot game objects

**What.** On each entry, `sandbox` assigns eight own properties (`pushPhase`, `unshiftPhase`, …) to `s.phaseManager`. On exit it restores them, `delete`-ing each one in *insertion* order (`hud/01-core.js:133`, `:144`, `:148`). `forcedRng` does the same to `currentBattle.randSeedInt` (`:189-194`). With known item 4 this happens up to twice per refresh during a battle, and more often inside a compute (`hud/20-enemy-ai.js:319`) **[source]**.

**Why it may cost.** V8 keeps "slow properties" for objects that have "many properties … added and deleted", because keeping hidden classes for them costs time and memory ([v8.dev, Fast properties in V8](https://v8.dev/blog/fast-properties)) **[docs]**. Whether this pattern moves `phaseManager` or `currentBattle` into dictionary mode, and whether any game path hot enough to matter reads them, is **[unverified]**.

**Confidence.** Low.

**Fix direction.** Swap the methods on a stand-in, or restore them in reverse order. Or check with `%HasFastProperties` in a d8 or Node REPL against the pinned build before touching it.

### 3.11 Caches that never shrink

- `formsCache` (`hud/47-biome.js:67`) is keyed `id|level|kind`, and each biome choice at a new party level adds a spawn list's worth of entries. `trainerCache` (`:113`) is bounded by the number of trainer types. Both are cleared only when a table lands (`:29-33`) **[source]**.
- `sprites` (`hud/90-render.js:6`) is covered in §3.7.
- Bounded, and fine: `runs` (2 keys, `hud/26-run.js:28`), `relearnMemo` (24, `hud/50-audit.js:96`), the journal (40 entries, though see §3.5), `teraSaved` (emptied in `finally`, `hud/25-turn.js:22`).

The impact is memory growth over a long session, not frame time. **Confidence** is high for the growth and low that it causes lag.

### 3.12 Small costs paid on every refresh

Each of these is small. Together they set the floor a refresh costs even when nothing changes **[source]**:

- **`accountRead`** (`hud/98-tick.js:50-64`): `getShinyCatchMultiplier()` and the table getters.
- **Live battle refresh with a held card.** `readTurn` still does the following before `held` is checked:
  - `sceneEnv` and `sceneFacts`, including `modeFlags`'s game calls (`hud/25-turn.js:99-118`, `:352-357`).
  - A sandbox (known item 4).
  - In trainer fights, `predictedTeras` → `trainer.shouldTera(foe)`, the game's AI, for each active foe (`:340-343`, `:363`).
- **`stream()`** builds `cardSummary` and `cardEvent` on every refresh just to compare a signature (`hud/99-start.js:35-53`).
- **`el.style.display` and `el.style.width`** are written on every refresh, even when they are unchanged (`hud/98-tick.js:83-84`). Whether writing an identical inline value invalidates style in Blink is **[unverified]**, and it is one element either way.
- **A tab or control click** runs a full `tick()` synchronously inside the click handler (`hud/98-tick.js:100`, `hud/90-render.js:178`).

### 3.13 The extension outside the page: cleared

- **Relay.** Once every 20 s it calls `runtime.sendMessage` for the keepalive (`extension/src/relay/relay.ts:116`, `extension/src/messages.ts:30`). Card events are sent only when the `kind|key|verdict` signature changes (`hud/99-start.js:47-52`). Each one costs a JSON parse, a structure check and a `TextEncoder` pass over the detail to measure it (`extension/src/relay/relay.ts:40-42`, `:95-105`). All of this is per card change, not per refresh **[source]**.
- **Background.** It runs a WebSocket with retries at 1, 2 and 5 s and then every 20 s (`extension/src/transport/transport.ts:19-22`), plus a 20 s ping. This runs in the service worker, off the page's thread **[source]**.
- **Page script.** It installs no console or error recorder (`src/page/errors.ts:10-14`). `probe`'s `pump` runs a synchronous `game.loop.tick()` only when the hub asks and the frame counter has not moved (`src/page/probe.ts:55-58`). That happens when a background tab is being driven, never while the player is playing **[source]**.
- **Injection.** `hud.js` is about 600 KB, parsed once at `document_idle` (`extension/src/build/manifest.ts:77`) **[source]**.

---

## 4. The four known items, checked

1. **All model work runs in one task per refresh, and on a miss everything runs together.** Confirmed (`hud/60-card.js:34-57`, `:122-126`, `hud/98-tick.js:66-98`). Two more pieces of evidence:
   - A hypothesis turn (`turn.assuming`) gets a **new memo every call**, even for the same patches (`hud/25-turn.js:318`, `:240`). Each branch of `statusField`'s `2^n` loop (`hud/30-planner.js:976-981`) and each status play's `follow()` (`:794-796`) re-asks the game for damage from scratch.
   - A turn read's memo dies with the refresh, so nothing is reused across refreshes except through `held`.
2. **When a turn read is not live and the key changed, `composeBattleCard` reruns on every refresh and is thrown away.** Confirmed (`hud/60-card.js:67-70`), with a correction on when it happens.
   - The same turn's animations are covered by `held`, because the key has not moved.
   - The windows where it does fire are the ones in §3.2: after `TurnEndPhase` increments `turn` (`game:src/phases/turn-end-phase.ts:26`); a wave's intro; and, in trainer fights, whole turns once `EnemyCommandPhase` has changed `enemySwitchCounter`.
   - In trainer fights each of those refreshes includes the fight plan.
3. **`last = missedSprite() ? "" : sigOf(card)` gives a full rebuild on every refresh while a sprite is missing, possibly forever.** Confirmed (`hud/98-tick.js:85-90`, `hud/90-render.js:71-80`), and the "forever" case now has a concrete trigger: §3.1, the type atlas key in 23 languages. In English every sprite the HUD asks for with a non-null fallback is loaded at boot:
   - `types` (`game:src/loading-scene.ts:193`).
   - `pokemon_icons_*` (`:315`, `:608-615`).

   Item and category sprites pass a `null` fallback and never retry (`hud/90-render.js:134`, `hud/96-render-battle.js:126`).
4. **Fixed cost: two sandbox snapshots per refresh, and a `JSON.stringify` of the card for the signature.** Mostly confirmed, with detail:
   - A live battle refresh opens a turn-read sandbox (`hud/25-turn.js:363`) and a run-read sandbox (`hud/26-run.js:65`).
   - A non-live battle refresh opens only the run read's, because `readOpened` skips the sandbox when not live (`hud/25-turn.js:363`).
   - A rewards refresh opens two run-read sandboxes (§3.4).
   - Each snapshot builds a `Set` per party and enemy member (`hud/01-core.js:138-143`).
   - The stringifies per refresh are `sigOf` once, and twice on a rebuild (`hud/98-tick.js:82`, `:89`), plus `runKeyOf` for each run read (`hud/26-run.js:25`).

---

## 5. How to measure later

Everything here can be read from the page console of a live tab without changing code.

- **Refresh time.** `__coachHud.stats()` gives `{ breaches, lastTickMs, maxTickMs }` (`hud/99-start.js:69`). It times only the JS of `tick()` plus `stream()`. The style, layout and paint that `replaceChildren` causes happen later, in the frame's rendering step, and do **not** appear in it. Sample it once a second next to the game, and write down which screen is up.
- **Frames the refresh cost.** Observe `new PerformanceObserver(l => …).observe({ type: "long-animation-frame", buffered: true })`. The entries' `scripts[]` attribution names the function and source URL that held up each frame ([Chrome, Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames)) **[docs]**. A LoAF whose script is `hud.js`'s `timedTick` is the panel. One attributed to a game `update` is not.
- **Rebuild rate (§3.1, known item 3).** Put a `MutationObserver` on `#coach-hud` with `{ childList: true }` and count callbacks per minute. On a battle card held still, anything near one a second means the missed-sprite path. Then check the cause directly: `Phaser.Display.Canvas.CanvasPool.pool.find(p => p.parent?.game).parent.game.textures.exists("types")`, plus the game's language.
- **Hold misses (§3.2).** Log `scene.currentBattle.enemySwitchCounter` and `turn` on each refresh through a trainer fight, next to `lastTickMs`. The refreshes with a high `lastTickMs` should line up with the counter or the turn moving while the phase is not `CommandPhase`.
- **Preview replays (§3.3).** `__coachHud.preview()` gives the scoring tally only. To count replays, watch `scene.fieldUI.list.length` spike and fall back within a refresh, or record a Performance trace across a level-up and look for `EnemyBattleInfo` / `Text.updateText` under `timedTick`.
- **Journal (§3.5).** Check `localStorage.getItem("coach-me-journal").length` for the store's size in UTF-16 code units, and `__coachHud.journalStats().entries`. Trace a mystery encounter wave and look for `setItem` under `timedTick`.
- **Memory (§3.7, §3.11).** Take heap snapshots at wave 1 and wave 50, and compare the sizes of `Map`s retained from `hud.js`.
- **Baseline.** Run the same wave with the panel off (`__coachHud.stop()`), and again on a `hud-off` build, to get the game's own frame profile.

---

## 6. Open questions, and what would close each

1. **Is this player's game in a localized-sprite language?** Read `i18next.resolvedLanguage`, or check `textures.exists("types")` as in §5. If it is, §3.1 alone could explain a steady lag on every battle card.
2. **What does one preview replay cost?** Record a Performance trace across a level-up in a trainer fight. It closes §3.3's magnitude.
3. **Does `Phaser.Math.RND` advance while the rewards screen is idle?** Log `Phaser.Math.RND.state()` across a few refreshes on the shop. If it moves, §3.4's reroll memo misses every refresh.
4. **How big does the journal get over a real session?** Read its length after some tens of mystery encounters.
5. **Does writing an identical inline style value dirty style in Blink?** It is one element per refresh either way. A trace with the panel idle closes it.
6. **Does the sandbox put `phaseManager` into dictionary mode?** Check with `%HasFastProperties` under `--allow-natives-syntax` against the pinned build in the oracle harness.

---

## 7. Sources

**Specifications and vendor documentation**
- [WHATWG HTML: event loop processing model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model): rendering runs between tasks.
- [WHATWG HTML: module map](https://html.spec.whatwg.org/multipage/webappapis.html#module-map): a module URL is fetched and evaluated once per document.
- [WHATWG HTML: `toDataURL`](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl).
- [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks): the 50 ms long-task threshold, and blocked interaction.
- [web.dev: Storage for the web](https://web.dev/articles/storage-for-the-web): `localStorage` is synchronous and blocks the main thread.
- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): 5 MiB of `localStorage` per origin.
- [MDN: `HTMLCanvasElement.getContext`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext): `willReadFrequently` forces a software canvas.
- [MDN: `Performance.setResourceTimingBufferSize`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/setResourceTimingBufferSize): the buffer starts at 250 or more.
- [Chrome: Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames).
- [v8.dev: Fast properties in V8](https://v8.dev/blog/fast-properties).

**Implementation source**
- Phaser 3.90.0 as pinned under PokéRogue `v1.12.0.11`: `src/textures/TextureManager.js` (`getBase64`), `src/display/canvas/CanvasPool.js`, `src/gameobjects/text/Text.js`, `src/gameobjects/text/MeasureText.js`.
- PokéRogue `v1.12.0.11`, read from `.cache/pokerogue/v1.12.0.11`:
  - `src/loading-scene.ts` and `src/utils/common.ts` (`hasAllLocalizedSprites`, `getLocalizedSpriteKey`).
  - `src/battle-scene.ts` (`addEnemyPokemon`), `src/field/pokemon.ts` (`init`, `initBattleInfo`, `destroy`), `src/field/trainer.ts`.
  - `src/ui/battle-info/{battle-info,enemy-battle-info}.ts`, `src/ui/text.ts`.
  - `src/phases/{turn-end-phase,enemy-command-phase}.ts`.
  - `src/game-mode.ts`, `src/system/game-data.ts`, `vite.config.ts`.
- This repo:
  - `skills/coachemon/scripts/hud/{01-core,02-screens,04-game-tables,25-turn,26-run,30-planner,35-team-plan,40-learn,45-catch,47-biome,48-preview,49-ahead,49-fusion,50-audit,50-reroll,51-starters,52-shop,55-journal,60-card,90-render,96-render-battle,98-tick,99-start}.js`.
  - `extension/entrypoints/{background,relay,page}.ts`, `extension/src/relay/{relay,channel}.ts`, `extension/src/transport/transport.ts`, `extension/src/page/register.ts`, `extension/src/build/manifest.ts`, `extension/src/messages.ts`.
  - `src/page/{card,probe,locate,dispatch,errors}.ts`.
