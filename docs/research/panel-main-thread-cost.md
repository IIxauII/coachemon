# What the panel makes the game's main thread do (#483)

An independent reading of the panel's source, taken without the earlier note on the same question. Sources are the
panel (`skills/coachemon/scripts/hud/*.js`), the extension entrypoints (`extension/entrypoints/`, `extension/src/`),
the pinned game (`.cache/pokerogue/v1.12.0.11/src/`) and its Phaser copy
(`.cache/pokerogue/v1.12.0.11/node_modules/.pnpm/phaser@3.90.0/node_modules/phaser/src/`). Paths below are relative
to those roots; `hud/` means the panel, `game/` the pinned game, `phaser/` its Phaser.

Every claim is tagged **[code]** (read off the cited lines) or **[inferred]** (a cost or a browser behaviour the code
does not state). Vocabulary is CONTEXT.md's: card, group, strip, drawer, turn read, run read, preview, journal,
fight plan, settled.

The one fact everything else rests on: the game renders on `requestAnimationFrame`
(`phaser/dom/RequestAnimationFrame.js:95`), and the panel refreshes on a 1 s `setInterval` in the same window
(`hud/99-start.js:63`). Whatever a refresh does runs between two of the game's frames, so a refresh longer than a frame
budget is a dropped frame, and a refresh that lands while an animation plays is a visible hitch. The refresh is
timed already: `__coachHud.stats()` reports `lastTickMs` and `maxTickMs` (`hud/99-start.js:55-62, 69`).

## 1. The loop: what one refresh runs, in order

`timedTick` (`hud/99-start.js:56-62`) is `tick()` then `stream()`.

`tick` (`hud/98-tick.js:66-98`):

1. `battleScene()` — finds the game once through Phaser's `CanvasPool` and then reads `game.scene.getScene("battle")`
   (`hud/90-render.js:9-12`). [code] Trivial after the first call.
2. `rerollCheck(s)` and `previewCheck(s)` (`hud/98-tick.js:72-73`). Both return at once unless a prediction is armed
   and unscored for this wave (`hud/50-reroll.js:55-69`, `hud/48-preview.js:191-217`); `previewCheck` scores once per
   wave and calls `foeOf` on each foe, which asks `getMove()`, `getAbility()`, `getStat()` per foe
   (`hud/48-preview.js:48-68`). [code] Once per wave.
3. `accountRead(s)` (`hud/98-tick.js:50-64, 74`): reads `gameData`, calls `gameEvents()` and `gameTables()` — each of
   which runs `loadGameTables` (`hud/04-game-tables.js:83-85`). After the tables have landed that is a boolean test
   (`hud/04-game-tables.js:68`). Until they land, every 30 s it reads `performance.getEntriesByType("resource")`,
   filters the game's chunk URLs, and appends one `<script type="module">` per chunk to import it
   (`hud/04-game-tables.js:67-81, 58-66`). [code] If `rewardFns` is never found in a build, that retry runs every
   30 s for the life of the page (`hud/04-game-tables.js:68` tests `tables && rewardFns`). [code]
4. `readCard(s, account)` (`hud/60-card.js:91-129`) — §1.1.
5. `previewArm` / `rerollArm` (`hud/98-tick.js:76-77`): assignments. [code]
6. `journalCheck(s, card)` (`hud/98-tick.js:79`, `hud/55-journal.js:119-129`) — returns after two property reads
   unless the wave is a Mystery Encounter; during one it runs `record` (§1.3). [code]
7. `setShown(card)` and `sigOf(card)` — `JSON.stringify([panelState(), openGroup(), card])` of the **whole card**
   (`hud/98-tick.js:32, 81-82`). [code] Every refresh, on identical input: the same string is built and compared each
   second while the card stands. The battle card carries the fight plan, the foe rows, the catch advice, the preview
   and the ahead model, so this is the largest object the panel serialises. [inferred: size]
8. `el.style.display = "block"` and `el.style.width = …` (`hud/98-tick.js:83-84`), every refresh with the same
   values. [code] Blink treats an unchanged inline value as no mutation, so this should not invalidate style.
   [inferred]
9. If the signature moved: `clearMissed()`, then `el.replaceChildren(...)` with the strip, the tab bar and the open
   pane, built by `open()` from `shownGroups()` (`hud/98-tick.js:85-90, 26-29, 38-42`). `shownGroups` runs the
   kind's `draw` once per shown card and builds **every** group's rows as detached DOM nodes, not only the open pane's
   (`hud/98-tick.js:38-42`, `hud/96-render-battle.js:17-145`). [code] §3.4 has what the browser then does.
10. `last = missedSprite() ? "" : sigOf(card)` (`hud/98-tick.js:89`): a second full serialisation on every rebuild,
    and if any wanted sprite was not yet in an atlas, `last` is cleared and the **whole DOM is rebuilt again next
    refresh, every refresh, until the atlas loads** (`hud/90-render.js:71-80, 15-17`). [code]

`stream` (`hud/99-start.js:35-53`): `lastFailure()`, then `cardEvent(shownCard())`, which runs `cardSummary` — the
act, foes, plan, road and audit strings of the card (`hud/60-card.js:205-238`) — on every refresh, whether or not
anything changed; only if the `kind|key|verdict` signature moved does it flatten the groups to text (`wireCard`,
`hud/90-render.js:245-249`) and dispatch a `CustomEvent` whose detail is a JSON string (`hud/99-start.js:16-21`).
[code] The relay's listener then UTF-8-encodes the detail to check its size and forwards it with
`runtime.sendMessage` (`extension/src/relay/relay.ts:95-105, 40-42`). [code] Per card change, not per refresh.

### 1.1 `readCard`: the screen tests, then one of eight builders

Every refresh (`hud/60-card.js:93-96`): `s.ui.getHandler()`, `starterScreen(s)` (`hud/51-starters.js:21-24`),
`learnState(s)` (`hud/02-screens.js:5-15` — while a `LearnMovePhase` has not yet opened its summary this constructs a
`PokemonMove` and resolves it with `getMove()` **per refresh**, `:14`), `rewardsScreen(s)` (`hud/02-screens.js:18-21`).
[code] Then one branch:

| Screen | Builder | Memoised across refreshes? |
|---|---|---|
| starters | `starterModel` (`hud/51-starters.js:170-193`) | yes, on its own key (`:182-185`) — but the key itself loops the whole `starterData` table every refresh (`:179-181`) [code] |
| move-learn prompt | `readRun` → `learnModel` (`hud/60-card.js:102`, `hud/40-learn.js:558-575`) | **no**: `learnAdvice` runs every refresh; `aheadModel` inside it is memoised [code] |
| splice | `fusionModel` (`hud/49-fusion.js:153`) | **no** [code] |
| rewards (shop) | `readRun` → `rewardsModel` (`hud/52-shop.js:70-262`) | **partly**: `aheadModel` (`:75`), `rerollPreview` (`:248`) and `teamAudit` (`:261`) are run memos; the body — `judge` over every free offer and shop row (`:129, :239`), the buy planner (`:100-…`), the needs scan over the party — runs every refresh [code] |
| biome choice | `readRun` → `biomeModel` (`hud/47-biome.js:380-388`) | yes, keyed on tables present, labels, party movesets, challenges [code] |
| mystery encounter | `readRun` → `encounterModel` (`hud/46-encounter.js:852-862`) | yes — but the key reads `h.optionsContainer.list.map(o => o.text)` and each member's `hp` (`:860-861`), so every hit in a minigame is a rebuild [code] |
| battle | `battleCard` (`hud/60-card.js:62-71`) | yes, `held` on `[wave, turn, enemySwitchCounter, party ids, foe ids]` (`:66`) [code] |

The battle branch first filters both parties by HP (`hud/60-card.js:113-114`) and then **always opens a turn read**
(`readTurn`, `hud/25-turn.js:346-365`) before it can test `held` (`:62-67`). What a turn read costs before its callback
runs, every refresh in a battle:

- `sceneEnv(s)` — `getEnemyParty`, `getPlayerParty`, `getField(true)`, `getField()`, arena reads
  (`hud/25-turn.js:75-97`). [code]
- `awaitingDecision(s)` — the current phase's name (`hud/01-core.js:171-177`). [code] `live` is true at a command
  prompt, a check-switch prompt and a faint replacement, i.e. when the game is **settled**.
- `sceneFacts` (`hud/25-turn.js:120-141`), which when live calls the mode's `isFullFreshStartChallenge`,
  `isFreshStartChallenge`, `hasAnyChallenges`, `isBattleClassicFinalBoss`, `isEndlessMinorBoss`, `isWaveFinal`
  (`:99-118`). [code]
- `makeTurn` with a **fresh** memo map (`hud/25-turn.js:240`): turn memos live for one callback and nothing of a turn
  read survives to the next refresh except the `held` card. [code]
- `turnKeyOf` — a string over every mon with `isOnField()` each (`hud/25-turn.js:337-338`). [code]
- When live: `sandbox(s, …)` (`hud/01-core.js:131-160`) snapshots the phase-manager queue methods, `Phaser.Math.RND.state()`
  (a string join, `phaser/math/random-data-generator/RandomDataGenerator.js:458-471`), the battle seed, and copies every
  mon's `abilitiesApplied` sets and `turnData` (`:138-143`), then restores all of it. [code]
- When live: `withPredictedTera(predictedTeras(env, turn), …)` (`hud/25-turn.js:363, 340-343`). In a **trainer**
  battle `predictedTeras` calls `turn.teraNow(e)` for each active foe, and `teraNow` calls `turn.switches()`
  (`:293`), which is `sceneSwitches` (`:299`, `hud/20-enemy-ai.js:364-401`): per active foe,
  `trainer.getPartyMemberMatchupScores(slot, true)` (`game/field/trainer.ts:551-584` — `getMatchupScore` for every
  bench member against every player field mon, `game/field/pokemon.ts:2680-2730`, each two `getEffectiveStat` calls and
  one `getAttackTypeEffectiveness` per defending type and per damaging move), then `getMatchupScore` against each
  opponent again (`hud/20-enemy-ai.js:377`), and `getNextSummonIndex` (`:383`). Then `trainer.shouldTera(foe)`.
  **This runs on every refresh at a trainer prompt whether or not the card is held**, because it precedes the
  callback that tests `held`. [code]

Only then does the callback test `held` and, on a hit, return the held card. On a miss it composes (§2.1).

After the builder, for a battle or rewards card, a **run read** (`hud/60-card.js:120-127`): `readRun` builds
`runFacts` — both parties, a `members` tuple per member, the modifier count, the encounter list (`hud/26-run.js:9-24`) —
JSON-stringifies them into the run key (`:25-26`), opens a sandbox (`:65`, same snapshot as above), and runs
`previewNext(run)` and `card.ahead ??= aheadModel(run)`. Both are run memos (`hud/48-preview.js:231`,
`hud/49-ahead.js:122`); on a hit this is the sandbox and the JSON alone. [code] Note `card.preview = …` (`:123`) is an
assignment **onto the held card**: a preview that moves changes the held card's signature. [code]

### 1.2 What repeats on identical inputs, every second

[code], in the order it runs: the screen tests; `sceneEnv`/`sceneFacts`/`turnKeyOf` and (live) the sandbox snapshot;
(live, trainer) `sceneSwitches` and `shouldTera`; `runFacts` + run-key JSON + a second sandbox; `sigOf` (one full
card JSON); `cardSummary`; and for the learn, splice and shop screens the whole builder body. Nothing in that list is
keyed, memoised or short-circuited by "the scene has not changed".

### 1.3 The journal's per-refresh work on a Mystery Encounter wave

`record` (`hud/55-journal.js:87-110`) builds `step(s)` — both parties mapped through `mon` (a `getMaxHp()` each), every
modifier's name and stack count sorted, and `document.getElementById("touchControls").dataset.uiMode`
(`:45-56`) — and JSON-stringifies it to compare with the last step (`:102-104`). Every refresh of the wave, fights and
shop included (`:124-125`). [code] Writes are at the milestones only (§3.1).

## 2. What each state change sets off, and the refresh it lands in

"Lands in" is the first refresh at or after the change; refreshes are 1 s apart, so a change lands 0–1 s later, during
whatever the game is animating then.

### 2.1 The composed battle card (the reference cost)

A compose (`composeBattleCard`, `hud/60-card.js:34-57`) happens when the held key misses, and the result is held only
if the turn was live (`:69`). On a live turn it runs:

- `turn.exact()` → `sceneExactMoves` for the active foes not switching (`hud/25-turn.js:325-332`,
  `hud/20-enemy-ai.js:306-329`): the game's own `getNextMove` per active foe (`game/field/pokemon.ts:6560-6700`), which
  for a SMART foe runs `getAttackDamage` per move per target (`:6643`) and `getTargetBenefitScore` per move per target
  (`:6688`). It opens a **second, nested sandbox** for the call (`hud/20-enemy-ai.js:320`). [code]
- On a trainer wave, the fight plan: `teamPlanner(arrivalTurn(turn))` (`hud/60-card.js:43`,
  `hud/35-team-plan.js:510-517`). `arrivalTurn` may derive a turn with `assuming` (`hud/30-planner.js:1529-1536`), and a
  derived turn has its **own empty memo map** (`hud/25-turn.js:318, 240`), so answers the base turn already holds are
  asked of the game again. The tables ask, for every (our mon, foe) pair, `turn.outcomes` both ways
  (`hud/35-team-plan.js:32, 65`) and `turn.sendInScore` (`:90`, a `getMatchupScore`, `hud/20-enemy-ai.js:404`). Each
  `outcomes` is one simulated `getAttackDamage` per usable move (`hud/10-damage.js:515, 709-718`). Six against six is
  36 pairs × 2 directions × up to 4 moves ≈ **288 damage calls and 36 matchup scores**, plus `enemyAction` for each
  foe (`:399`), which for a benched foe is `enemyDistribution` → `aiDistribution` — the panel's own re-run of the AI
  that calls `getAttackDamage` per move (`hud/20-enemy-ai.js:116-117`) and builds every outcome combination
  (`:139-209`). [code; the count is the shape, not a measurement]
- `battleModel(turn, { team })` (`hud/30-planner.js:1541-…`): `predictedSwitches` (`:1520-1523`, memo hits),
  `fieldPlan` under a turn memo (`:1562-1565`), which branches into `assuming` derived turns per hypothesis
  (`:795, :980`) — each a fresh memo map — and `replayAI` (`:124`, `sceneReplayAI`, the game's AI re-run against a
  target with a hypothetical HP, `hud/20-enemy-ai.js:213-247`). [code]
- `catchAdvice` on a wild wave (`hud/60-card.js:50`, `hud/45-catch.js:286-293`): `turn.outcomes` per active foe
  (mostly memo hits). [code]
- `partyTypes` (`hud/60-card.js:53, 26-29`), pure. [code]

Where it lands: at the command prompt, the game settled, one refresh. The player sees a hitch on an idle frame, not a
broken animation. [inferred] The cost is the largest single piece of work the panel does per turn. [inferred]

### 2.2 Per state change

| Change | What the panel does | Lands in |
|---|---|---|
| **Player attacks** (leaves the command prompt) | `live` goes false; the turn read still opens (§1.1) but without the sandbox or `sceneSwitches`; held key unchanged (`wave, turn, counter, ids`) → held card returned; run read → memo hits. No compose, no rebuild. [code] | the refresh after the press; nothing visible |
| **Enemy switches** (trainer AI) | `enemySwitchCounter` moves → held key misses **mid-animation** → a non-live compose from `approxOutcome` (type-chart, no game calls; `hud/25-turn.js:261-263`) — not held (`hud/60-card.js:69`) — so the signature moves and the DOM rebuilds; next command prompt: live compose again, second rebuild. [code] Two composes and two rebuilds per enemy switch, the first during the switch animation. | the switch animation, then the next prompt |
| **Player switches out** | Same as attacking: party ids unchanged → held. If the switch was a faint replacement, the modal `SwitchPhase` is live (`hud/01-core.js:175`) but the held key has no `decision` field, so the card composed at the command prompt is served unchanged at the replacement prompt; the recompose lands at the next turn's command prompt. [code] (A correctness note more than a cost: CONTEXT.md's turn read says a foe sent in ends the card's hold; a replacement of ours does not.) | no extra work |
| **Party member levels up** | `runFacts.members` carries `level` (`hud/26-run.js:19`) → **new run key** → new memo buckets (`:30-38`, two kept) → `previewNext` **replays wave+1** (§3.3) and, on a learn/rewards card, `aheadModel` rebuilds: `bigFightsAhead` = 30 × `isFixedBattle`, each a `new FixedBattleConfig()` plus the challenge hooks (`hud/03-calendar.js:31-43`, `game/game-mode.ts:357-363`), and a **second replay** for the next big fight if it is within 5 waves (`hud/49-ahead.js:9, 127-133`). On the battle card `card.ahead ??=` keeps the old ahead but `card.preview =` writes the new preview onto the held card → signature moves → DOM rebuild. [code] One level-up per member per wave is common; each is its own key. | the exp-bar / level-up animation |
| **Foe faints** (wild single) | `foes.filter(hp > 0)` empty → `readCard` returns null → panel hidden (`hud/98-tick.js:80`). Then the rewards card: a new signature → rebuild. [code] In a double or a trainer wave the foe list (all ids) is unchanged → held. | the faint animation (hide), then the shop |
| **Our mon faints** | `members[3]` (`hp > 0`) flips → new run key → replay(s) as for a level-up; the held battle card survives (ids unchanged) but its `preview` is rewritten → rebuild. [code] A revive flips it back: `RUNS_KEPT = 2` keeps the previous bucket so a faint-then-revive does not replay a third time (`hud/26-run.js:28`). | the faint animation |
| **Wave starts** | `waveIndex` in both keys → held miss → compose (non-live during the intro, live at the prompt: **two composes, two rebuilds**), new run key → replay of the new wave+1, `aheadModel` rebuild with its 30 `isFixedBattle` calls and possibly a second replay; `previewCheck` scores the armed preview (`foeOf` per foe). [code] | the wave intro (trainer walk-in, send-out), then the prompt |
| **Shop opens** | `rewardsScreen` → `rewardsModel`: `aheadModel` (hit unless the fight leveled someone — then rebuild), `rerollPreview` (§3.5: 1–2 rolls of the game's reward generator, three `regenerateModifierPoolThresholds` calls), `teamAudit` (keyed on roster + movesets, `hud/50-audit.js:186-192`), then the unmemoised body every second. New signature → rebuild. The modifier count moves on the pick (`modifierCount`, `hud/26-run.js:20`) → new run key → replays again on the next battle card. [code] | the shop's first refresh; the body every refresh after |
| **Move-learn prompt opens** | `learnState` (a `PokemonMove` built per refresh until the summary opens) → run read → `aheadModel` (rebuild if the level-up that caused the prompt changed the key — it did — with `bigFightsAhead` and possibly a replay) → `learnAdvice` every refresh. [code] | the prompt, and every second while it is open |

## 3. Work that is known to block, and who asks for it

### 3.1 Synchronous storage

- `localStorage.getItem` once at inject for the panel view (`hud/90-render.js:198-215`) and the journal
  (`hud/55-journal.js:15-20`), and a set/remove probe the first time the journal writes (`:23-28`). [code]
- `localStorage.setItem(PANEL_KEY, …)` on a tab click, a drawer toggle or a dismissal (`hud/90-render.js:195-197,
  221-223`): user actions, tiny payload. [code]
- `localStorage.setItem(KEY, JSON.stringify(journal))` — **the whole journal**, up to 40 entries of up to 60 steps
  each plus a deep copy of the encounter card (`hud/55-journal.js:30-38, 6, 90`) — at an encounter's start, when the
  card arrives, when the pick is seen, and at close (`:83, :109, :116`). Four synchronous writes per Mystery
  Encounter wave, of a string that grows with the journal. [code] A full store loops shift-and-retry (`:33-37`). [code]
  Size is not bounded in bytes anywhere; hundreds of KB is plausible after a few runs. [inferred]

### 3.2 Canvas encoding

`sprite(key, frame)` → `game.textures.getBase64(key, frame)` (`hud/90-render.js:19-29`), which in Phaser takes a 2D
canvas from the pool, `getContext("2d", { willReadFrequently: true })`, `drawImage`s the atlas region, and calls
`canvas.toDataURL("image/png")` — a synchronous PNG encode — then returns the canvas
(`phaser/textures/TextureManager.js:406-449`). [code] The result is cached for the page's life per `key/frame`, and
a miss is never cached (`hud/90-render.js:21-26`). So: one encode per distinct sprite ever drawn, front-loaded on the
first card that shows it (a trainer card with six foes, their types, status marks and our party: a few dozen encodes
in one refresh). [code; count inferred] Frames are icon-sized, so each encode is small. [inferred]

### 3.3 Constructing the game's own display objects, and the GPU uploads they carry

The **preview replay** (`hud/48-preview.js:75-178`) runs inside the run read's sandbox and builds, for the wave it
reads:

- `new (s.currentBattle.constructor)(…)` — a plain `Battle` (`:112`, `game/battle.ts:109-125`). Cheap. [code]
- On a trainer wave, `s.generateNewBattleTrainer(w)` (`:105`) → `new Trainer(type, variant)`
  (`game/battle-scene.ts:1481-1506`). `Trainer` is a `Phaser.GameObjects.Container` (`game/field/trainer.ts:24`) whose
  constructor creates two sprites (four for a double) through `addFieldSprite` → `this.add.sprite(...)`
  (`:108-141`, `game/battle-scene.ts:2061-2070`). Phaser's factory puts each sprite on the scene's display list
  (`phaser/gameobjects/sprite/SpriteFactory.js:27`) and the container's `add` takes it off again
  (`phaser/gameobjects/container/Container.js:431-444`). [code] Then, per party slot, `trainer.genPartyMember(e)`
  (`hud/48-preview.js:125`) → `globalScene.addEnemyPokemon` (`game/field/trainer.ts:429`).
- On a wild wave, `s.addEnemyPokemon(species, level, …)` per level (`hud/48-preview.js:133`).
- `addEnemyPokemon` (`game/battle-scene.ts:916-980`) does `new EnemyPokemon(...)` (`:935`) — a
  `Phaser.GameObjects.Container` (`game/field/pokemon.ts:193, 334`) with `calculateStats` — and then **`pokemon.init()`**
  (`:978`). `init` (`game/field/pokemon.ts:511-548`) calls `initBattleInfo()` → `new EnemyBattleInfo()` and
  `initInfo(pokemon)` (`:5825`), inserts it into the live `fieldUI` container (`:515`), and creates two sprites
  through `addPokemonSprite` (`:517-543`, `game/battle-scene.ts:2078-2090`). A `BattleInfo` is itself a container
  (`game/ui/battle-info/battle-info.ts:43, 209`) of sprites and images plus **text objects** — three `addTextObject`
  in the base, one in the enemy subclass, one in its `BattleFlyout` (`game/ui/battle-info/battle-info.ts`,
  `game/ui/battle-info/enemy-battle-info.ts:81, 92`, `game/ui/containers/battle-flyout.ts`) — and `addTextObject`
  is `scene.add.text` (`game/ui/text.ts:13-23`), a Phaser `Text`. A Phaser `Text` calls `setText` in its constructor
  (`phaser/gameobjects/text/Text.js:297`), which runs `updateText` (`:637`), which draws the string on its own canvas
  and, on WebGL, **uploads that canvas as a GPU texture** — `canvasToTexture` (`:1455`) →
  `createTexture2D` (`phaser/renderer/webgl/WebGLRenderer.js:3090`) → `gl.texImage2D`
  (`phaser/renderer/webgl/wrappers/WebGLTextureWrapper.js:342`). `initInfo` sets more text (`battle-info.ts:341-349`),
  each a re-render and re-upload. [code]
- Every built object is then `destroy()`ed (`hud/48-preview.js:46, 176`; `game/field/pokemon.ts:5687-5691` destroys
  the `BattleInfo` too). [code]

So one replay of a six-mon trainer wave constructs one trainer container, six pokémon containers, six `BattleInfo`
containers inserted into and removed from the live `fieldUI`, roughly 14 sprites, and around 30 text objects each
with a canvas rasterisation and a `texImage2D`, and destroys all of it — synchronously, inside one refresh. [code for
the objects; counts approximate] Text canvases and GL texture creation are the expensive part; `texImage2D` of a small
canvas is cheap on its own but each is a driver call and each canvas is a 2D raster. [inferred] The replay also
swaps `console.log/warn/info` out and back (`hud/48-preview.js:34-38`) and swaps `currentBattle` and `waveSeed`
(`:41-45, 81, 175`). [code]

A replay runs on every **run-key** miss (§4): each wave, each level-up, each faint or revive, each change in the
modifier count — and twice when a big fight is within five waves, since `aheadModel` previews it with the same
mechanism (`hud/49-ahead.js:127-133`). The Mystery Encounter branch builds `getMysteryEncounter()` instead
(`hud/48-preview.js:117`, `game/battle-scene.ts:3520-3560` — a `new MysteryEncounter`, no display objects). [code]

`previewCheck` and the reroll preview build nothing on the display list. [code]

### 3.4 DOM rebuilds and layout

On a signature change the panel builds every group's rows as DOM nodes (`hud/96-render-battle.js:17-145`: a row per
field slot and switch, a block per foe with type badges, an HP bar, weakness lines, the likely move; then the catch,
plan and road groups), each node an element with an inline style object (`hud/90-render.js:62-67`) whose lengths are
`round(calc(...))` strings (`:42, 38, 41`), each sprite an `<img>` whose `src` is a `data:image/png;base64` URL
(`:71-87`). Only the strip, the tab bar and the **open** pane are attached (`hud/90-render.js:226-233`,
`hud/98-tick.js:87`); the other groups' nodes are built, flattened to text by `rowText` (`:256-263`, reads
`textContent`, no layout) and dropped. [code]

The panel is `position: fixed` with the maximum z-index, appended to `body` over the game canvas
(`hud/90-render.js:321-334`). [code] A rebuild replaces the subtree, so the next frame recalculates style and lays
out the panel's subtree and re-rasterises its layer; each new `<img>` decodes its data URL. [inferred] The panel
reads no layout property anywhere, so it forces no synchronous layout of its own; the cost lands in the browser's
next rendering step, on the same thread as the game's `requestAnimationFrame` callback. [code for the absence;
inferred for where it lands]

Rebuild frequency: every card change (§2.2), every held-card mutation through `preview`, every tab or control click
(`hud/90-render.js:178, 221-223`; the redraw clears `last`, `hud/98-tick.js:100`), and **every refresh while a
wanted sprite is missing** (§1 step 10). [code]

### 3.5 The reward generator at the shop

`rerollPreview` (`hud/50-reroll.js:80-95`) runs `fns.regenerate(party, PLAYER, n)`, constructs a
`SelectModifierPhase` copy for its `getModifierCount()`, and calls the game's `getPlayerModifierTypeOptions`
(`:31-46`) once, or twice with a Lock Capsule, then `regenerate` once more to put the thresholds back (`:91`). Memoised
under a key that includes `Phaser.Math.RND.state()`, the reroll count, every member's moves and PP, every modifier's
stack count and the ball counts (`:21-29`). [code] Any RNG draw the game makes while the shop is open changes the
key and re-runs the rolls; the shop UI does not draw on `Phaser.Math.RND`, so this should be once per shop screen
and once per reroll. [inferred]

### 3.6 The extension entrypoints

The relay does nothing periodic on the page's thread but a 20 s keepalive that reads `document.title` and calls
`runtime.sendMessage` (`extension/src/relay/relay.ts:116`, `extension/src/messages.ts:30`,
`extension/entrypoints/relay.ts:26-30`), and per-event forwarding (§1). The page script registers listeners and
answers commands inside the dispatch that delivered them (`extension/src/page/register.ts:79-95`); nothing runs
between commands. [code] The screenshot command is not in the page table (`src/page/handlers.ts` has `snapshot`, a
state read; screenshot lives on the CDP link, `src/game/link.ts:44`), so the extension path asks for no canvas
readback. [code]

## 4. The memos

| Memo | Lives | Key | Where a key moves mid-animation |
|---|---|---|---|
| `held` battle card (`hud/60-card.js:61-71`) | until the key misses; only a live card is stored | `wave, turn, enemySwitchCounter, party ids, foe ids` | `enemySwitchCounter` during the enemy's switch; `turn` at `TurnInitPhase` before the next prompt (a non-live compose that is not held, then the live one); `wave` during the wave intro. `hp` is deliberately out (`:59-60`); `decision` is out, so a replacement prompt serves the prompt's card. |
| turn memos (`hud/25-turn.js:240-252`) | one turn-read callback | per bucket: `mon` by object; `outcome` by `atk.id\|def.id\|slot\|moveId\|aiView\|crit`; `outcomes`/`statusMoves`/`stopped` by `atk.id\|def.id`; `enemyAction:ranges` by foe; `dist`, `tera`, `activeFoes`, `switches` (`""`); `replay` by `foe\|target\|hp\|bi`; `sendIn`, `benefit`, `speedTie` by ids; `caller` (planner's `field:…`, `stay:…`, `o:…`, `t:…`, `protect:…`, `arrival`) | Never across refreshes: the map is rebuilt per read, so a refresh that composes pays everything again; a derived turn (`assuming`) starts empty (`:318`). |
| run memos (`hud/26-run.js:25-38`), two run keys kept | across refreshes, per run key | run key = `seed, wave, biomeId, waveCycleOffset, offsetGym, members[speciesId, level, luck, hp>0], modifierCount, encounteredEvents, encounterSpawnChance` | **`level`** at a level-up; **`hp>0`** at a faint and a revive; **`modifierCount`** on a reward pick and on an item consumed; `wave` at the intro. Each is a new bucket: every run memo below misses together. |
| `preview` (`hud/48-preview.js:231`) | run memo | wave number | as the run key |
| `ahead` (`hud/49-ahead.js:122`) | run memo | `"model"` | as the run key |
| `audit` (`hud/50-audit.js:186-192`) | run memo | next big wave, its foes, party ids + movesets | as the run key; a move learned |
| `reroll` (`hud/50-reroll.js:82`) | run memo | RND state, reroll count, lock, offers, party tuple, modifiers, balls | any game RNG draw at the shop (none expected) |
| `biome` (`hud/47-biome.js:385-388`) | run memo | tables present, labels, party movesets, challenges | a game chunk landing (`tablesPresent`) |
| `encounter` (`hud/46-encounter.js:856-862`) | run memo | type, seed offset, money, minigame counters, option texts, party `hp`/status/nature/moves | **every HP change** in an encounter's battle and every minigame stage |
| `starterModel` cache (`hud/51-starters.js:182-185`) | module | limit, candy unlocks, chosen, container count, tables | a chunk landing |
| `sprites` (`hud/90-render.js:6, 19-29`) | page | `key/frame` | never; a miss is never stored |
| `sig`/`last` (`hud/98-tick.js:31, 82-90`) | module | JSON of `[panelState, openGroup, card]` | any change in the card, including `preview` rewritten on the held card; cleared on a missed sprite |
| `sentCard` (`hud/99-start.js:14, 47-51`) | module | `kind\|key\|verdict` | a verdict change |

## 5. Ranked findings

Ranked by expected cost per occurrence × frequency. Each says what a measurement has to show to confirm it; the
measurement is a DevTools performance trace of a run with the panel on, plus `__coachHud.stats()`.

1. **The preview replay builds and destroys the game's display objects, text canvases and GPU textures, and does so
   on every run-key change — mid-animation.** [code for the path (§3.3); inferred for the ms] Frequency: every wave,
   every level-up, every faint/revive, every reward pick, ×2 when a big fight is within five waves. Confirm: in the
   trace, a long task on the panel's `setInterval` callback whose stack holds `previewFor` → `replay` →
   `addEnemyPokemon` → `init` → `Text.updateText` → `canvasToTexture`, coinciding with the exp-bar or faint frames;
   `maxTickMs` jumping on a level-up with no prompt in sight. A count of `texImage2D` calls per refresh ≥ 20 on those
   ticks. Disprove: those ticks measure under a frame budget (≈ 16 ms) even on a six-mon gym preview.
2. **The live compose at each prompt asks the game for hundreds of simulated damage calls, several `getNextMove`
   runs and matchup scores, and derived turns ask again for answers the base turn holds.** [code for the shape
   (§2.1); inferred for the ms] Once per turn, at a settled prompt; also once more, non-live and cheaper, on the wave
   intro and each enemy switch. Confirm: `lastTickMs` on the first refresh of a trainer prompt is the tick maximum
   of the wave and the trace shows `getAttackDamage`/`getNextMove` dominating under `composeBattleCard`; the share
   under `assuming`-derived turns is the repeated part. Disprove: the compose tick is within a frame budget on a 6v6.
3. **At a trainer prompt, every refresh re-runs the trainer's switch AI even when the card is held.** [code (§1.1)]
   Once a second for the whole time the player thinks. Confirm: `lastTickMs` on consecutive idle ticks at a trainer
   prompt is measurably above the same ticks at a wild prompt, with `getPartyMemberMatchupScores` on the profile;
   dropping `predictedTeras` to run after the held test removes it. Disprove: the idle-tick difference is noise.
4. **DOM rebuilds land mid-animation, and a missing sprite rebuilds every second.** [code for the triggers (§3.4);
   inferred for the cost] Triggers: every card change, the held card's `preview` rewrite, and any wanted sprite not in
   a loaded atlas. Confirm: in the trace, "Recalculate style"/"Layout"/"Paint" entries right after the panel's
   task on level-up and enemy-switch ticks; a wave where `missedSprite()` stays true showing a rebuild every
   second (`last === ""` after each tick). Disprove: rebuild ticks cost under a few ms of style/layout/paint.
5. **The shop, learn and splice cards rebuild their model every refresh on identical inputs.** [code (§1.1)] Once a
   second while the screen is open; the shop's `judge` walks every offer and shop row and the learn card runs
   `learnAdvice` each time. Confirm: `lastTickMs` at a rewards screen stays at a steady non-trivial value with the
   game idle, with `rewardsModel`/`learnAdvice` on the profile and no memo above them. Disprove: those ticks are
   under a millisecond.
6. **The constant floor: two sandbox snapshots, `sceneEnv`/`sceneFacts`/`turnKeyOf`, the run-key JSON, one full card
   JSON for the signature, and `cardSummary` — every second, in every battle.** [code (§1, §1.2)] Confirm: the median
   `lastTickMs` on held-card ticks in a wild battle, and its split in the profile between `JSON.stringify` and the
   game reads. Disprove: the median is well under a millisecond.
7. **The journal writes the whole journal to `localStorage` synchronously four times per Mystery Encounter wave, and
   serialises a step every refresh of the wave.** [code (§3.1, §1.3)] Confirm: a `localStorage.setItem` long task on
   the encounter's first tick, its length growing with `journalStats().entries`. Disprove: under a millisecond with
   40 entries stored.
8. **Sprite encoding: one canvas draw plus a synchronous PNG `toDataURL` per distinct sprite, front-loaded on the
   first card that shows it.** [code (§3.2)] Confirm: the first trainer card of a session showing `getBase64` →
   `toDataURL` repeated tens of times under one tick; never again for those sprites. Disprove: the sum is a
   millisecond or two.
9. **The reroll preview runs the game's reward generator (1–2 rolls, 2–3 threshold regenerations) once per shop and
   per reroll.** [code (§3.5)] Confirm: `getPlayerModifierTypeOptions` under the shop's first tick only. Disprove
   (or upgrade): it re-runs on later ticks, meaning something draws on `Phaser.Math.RND` while the shop is open.
10. **The game-tables scan injects a module script per game chunk every 30 s until both table sets land, and forever
    if `rewardFns` never lands.** [code (§1 step 3)] Confirm: repeated `<script type="module">` appends in the trace
    every 30 s with `__coachHud.reroll()` reporting the reward roll unavailable. Disprove: one round after boot.

The relay and page entrypoints contribute nothing periodic beyond a 20 s keepalive (§3.6). [code]

## 6. Side observations from the same reading

- The held key omits `decision`, so a faint-replacement prompt serves the card composed at the turn's command prompt
  (`hud/60-card.js:66`); the fresh read arrives one turn later.
- `card.preview = previewNext(run)` writes onto the held card (`hud/60-card.js:123`): the hold is on the key, not on
  the object, so a run-key change reaches the panel through the signature even though the turn read is held.
- `sceneExactMoves` opens a sandbox inside the turn read's sandbox (`hud/20-enemy-ai.js:320`); the queue-method stubs
  and the RNG snapshot are taken twice on that path.
- A wave transition composes twice (non-live on the intro, live at the prompt) and the non-live card is drawn — a
  card from the type chart alone is shown for up to a second before the game's own numbers replace it.
