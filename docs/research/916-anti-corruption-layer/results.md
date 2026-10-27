# An anti-corruption layer between the game's objects and the overlay's logic

Research for [#916](https://github.com/IIxauII/coachemon/issues/916). Read and measured at `origin/master` `ebbaaf3b`,
game pin v1.12.2.0 (`pinned` in `src/escape-ladder/reviewed.json`), on 2026-10-27.

Paths: `hud/` is `skills/coachemon/scripts/hud/`, `test/` is `skills/coachemon/scripts/test/`, `game/` is the pinned
game's `src/`. Terms are CONTEXT.md's (decision, card, watch, turn read, run read, game read, combatant).

Every claim is labelled:

- **[code]**: read from source, git history or a PR, with file:line or commit;
- **[measured]**: counted or timed with a command given in [§9](#9-how-to-reproduce);
- **[inferred]**: my reading of the evidence, not stated by any source.

---

## Recommendation: keep the current setup and close this issue

Keep the registry of game reads (ADR 0004), `drift:check` and the battle oracle. Don't add the layer.

1. **On the history so far, the layer would have saved almost nothing.** Over the four pin bumps the layered HUD has
   seen, *shape* fixes, where the game renamed or moved something the HUD reads, came from 7 upstream changes. They
   made up about 162 of the 1,326 HUD lines changed, and all came in one release, 1.12.1.0. Six of the seven hit one
   file. The one that spread, the removal of `UI.getMode`, was 7 one-token edits in 4 files, and drift named it as one
   missing entry. A layer would have saved about 3–5 file edits and 20 lines across four bumps. About 86% of the
   changed lines were *rule* fixes, where the game changed a mechanic, a number or its content. No layer absorbs
   those. [measured counts; inferred savings] ([§1](#1-pin-bump-history))
2. **The line would sit high, and getting there is a large rewrite.** Today plain data starts at the card, and no
   layer number has only game-free files above it. The lowest workable line is above layer 26, the turn read and the
   run read. Moving it there means:
   - turning 520 reads of game-only names in 22 files into reads of plain views;
   - keying the turn read's queries by mon id;
   - making hypotheses id-keyed patches;
   - moving the per-frame look, screen detection, four generators and the entry points below the line.

   A low line, above layer 06, would leave 805 of the 876 reads to convert. [measured counts; inferred design]
   ([§3](#3-where-the-line-could-go))
3. **Plain data is not safer by itself.** Three bump fixes came from the HUD reading a *stored* field where the game's
   accessor applies a hook: `ability1` instead of `getAbility`, raw evolution rows, raw starter data. A layer would
   still have to call the game's computed accessors at read time (`getTypes`, `getAbility`, `getHeldItems`, …). Those
   are the very calls the registry already tracks. The live-shaped stand-in that #572 built shows the opposite risk:
   game code can call it and find a method missing ([§7](#7-found-along-the-way)). [code]
4. **Nothing in place can hold the line.** The bundler could guard the entry points in about ten lines. But game
   objects cross as *values* (live mons in `turn.facts`, the scene in `run.scene`), and neither the bundler nor the
   name-based read check can see where a value came from. A static guard on values needs a typed pass over about 11k
   lines. [code; measured] ([§5](#5-enforcement))
5. **Cost and tests neither block it nor argue for it.**
   - The mapping would run once per decision, at about 22 µs. A card build at the same size takes 57–134 ms on the
     test fakes. [measured]
   - Moving the tests to plain data rewrites their inputs, not their assertions: about 290–420 test lines and about 60
     lines of fakes. [inferred from measured counts] ([§4](#4-cost), [§6](#6-tests))

**What would reopen this:** a game release whose shape changes spread over many HUD files even though drift named
them. A release that renames a method the HUD calls everywhere, such as `getTypes`, would be the test.

A lag run that showed repeated game calls in one build costing real milliseconds would not reopen it: one build reads
`hasAbilityWithAttr` 11,252 times and `getHeldItems` 7,278 times. That calls for a memo inside the turn read, not a
layer.

## Answers in brief

1. **Pin-bump history.** Four bumps (1.12.0.11 → 1.12.1.1 → .2 → .3 → 1.12.2.0) and their follow-ups touched 30 HUD
   files in 33 commits. Shape fixes: 10 files, all from 1.12.1.0, concentrated. Rule fixes: 29 files, in every layer
   from 01 to 98.
2. **Inventory.**
   - 39 of the 57 HUD files touch game objects, and 12 reach the game through a global. The issue counted 31 of 55
     and 11; it missed `04-game-tables.js`.
   - The 876 reads of names only the game declares split into 121 computed, 419 plain, 93 live handles and 243
     navigation reads. On top of those come 328 calls to the game's computed mon methods.
   - Counted by receiver, plain reads outnumber computed ones about five to one in layers 07–57.
3. **The line.**
   - Today plain data starts at the card's consumers.
   - The lowest workable line is above layer 26. The plain shapes it would hand up are `MonView`, `MoveView`,
     `FieldView`, `PartyView`, `TrainerView`, `ModeView`, `RunView`, `AccountView`, `ScreenView`, `ShopView`,
     `EncounterView` and an id-keyed `Patch`.
   - `07-move-traits` would fold in as `MoveView.traits`.
   - The live-shaped stand-in in `09-combatant` would go; the code that builds a combatant would stay.
4. **Cost.**
   - A card build runs once per decision, never per frame.
   - The mapping would cost 22 µs median (p95 33 µs) for 12 mons and the field. That is 0.02–0.06% of a build, and
     about 1% of a build's property reads.
   - The real-game cost is inferred higher on both sides. The lag run that would settle it is named in §4.
5. **Enforcement.** The bundler can hold the entry points. Neither it nor the ADR 0004 check can hold values. That
   needs a typed pass over about 11k lines, or a runtime plainness assertion in clone tests.
6. **Tests.** Of 36 test files and 19,744 lines:
   - 11 files (39% of the lines) would move to plain data;
   - 9 (24%) would split;
   - 12 (31%) stay game-shaped;
   - 4 have no game shapes either way.

   The actual rewrite is about 290–420 lines of test inputs and about 60 lines of fakes.

---

## 1. Pin-bump history

### The four steps

| Step | Kind | Bump commit (PR) | Date | Follow-ups with HUD changes |
|---|---|---|---|---|
| 1.12.0.11 → 1.12.1.1 | feature release 1.12.1.0 plus hotfix | `ba1bdea5` (#734) | 2026-10-16 | 20 commits, #713–#733 |
| 1.12.1.1 → 1.12.1.2 | hotfix | `8c03a6a3` (#767) | 2026-10-18 | `a64f674d` (#765) |
| 1.12.1.2 → 1.12.1.3 | hotfix | `3ae23cb6` (#781) | 2026-10-19 | `755f50ff` (#776) |
| 1.12.1.3 → 1.12.2.0 | feature release | `06e6e2e0` (#926) | 2026-10-24 | none yet; #924 and #925 are open |

- The first pin, 1.12.0.11, came with `reviewed.json` in `13ff50cc` (2026-09-12). No game version was pinned before
  it. [code]
- The HUD was split into numbered layer files in `49ad8a97` (2026-09-15). So these four steps are every bump the
  layered HUD has seen. [code]
- `bf6bc812` (#711) is not a fifth bump. It is the stamp commit on the unmerged branch that was squashed into
  `ba1bdea5`: `git diff --stat ba1bdea5 22a12679 -- skills/coachemon/scripts/hud/` is empty. [code]

### How each change was classified

- **shape**: the game renamed, moved or retyped a field, method or class, or changed how a function must be called.
  A layer could absorb it in one place.
- **rule**: the game changed a mechanic, number, table or balance, or added content. The HUD's logic changes
  whichever layer reads the game.
- **bookkeeping**: registry entries, `// @mirrors` markers, stamps. Not counted as a fix.
- **latent**: a bug already present at the old pin that the bump's review turned up.

### Every shape change, grouped by upstream change

All seven come from 1.12.1.0. [code: `git show <commit> -- skills/coachemon/scripts/hud/`]

| Upstream change | HUD files (layer) | Sites | Commit | Example hunk |
|---|---|---|---|---|
| `UI.getMode` removed; `ui.mode` is a getter | `02-decision` (02), `02-screens` (02), `49-fusion` (49), `98-watch` (98) | 7 one-token edits | `6df809c5` | `- mode = ui.getMode()` → `+ mode = ui.mode` |
| Heal attrs merged into `VariableHealAttr` | `07-move-traits` (07), `40-learn` (40); `30-planner` (30) follows 07's new `ratioIn` | 07: the heal trait; 40: 2 class-name lists | `91658ea5` | `["HealAttr", …, "WeatherHealAttr", "PlantHealAttr", …]` → `["HealAttr", "RestAttr", "VariableHealAttr", …]` |
| `FrenzyAttr` became a self-targeted FRENZY tag | `07-move-traits` (07) | 1 | `91658ea5` | `attrsNamed(mv, "FrenzyAttr")` → `attrsNamed(mv, "AddBattlerTagAttr").some(a => a.tagType === "FRENZY" && a.selfTarget)` |
| `Weather.isEffectSuppressed` removed | `25-turn` (25) | 2 | `91658ea5` | `s.arena?.weather?.isEffectSuppressed?.()` → `field.some(q => q?.hasAbilityWithAttr?.("SuppressWeatherEffectAbAttr"))` |
| `Pokemon.tempSummonData` removed | `30-planner` (30) | 2 | `91658ea5` | `me.tempSummonData?.turnCount` → `me.summonData?.turnCount` |
| Starter select rework | `51-starters` (51) | about 10 reads | `41542ceb` | `starterSpecies` → `partyStarterIds`, `getValueLimit()` → parse `valueLimitLabel.text` |
| Levitate's bypass now runs through `arena.ignoreAbilities` | `10-damage` (10) | 1 call wrapper | `b408ab8a` (#732) | `+ arena.ignoreAbilities = true;` around the simulated `getAttackDamage` |

### Totals

| Step | HUD files touched (bookkeeping excluded) | Shape: upstream changes / files | Rule files | Latent |
|---|---|---|---|---|
| → 1.12.1.1 | 29 (layers 01–98) | 7 / 10 | 28 | 2 (#729, #730) |
| → 1.12.1.2 | 5: 10, 20, 25, 30, 46 | 0 | 5 | 0 |
| → 1.12.1.3 | 3: 10, 40, 51-starters | 0 | 3 | 0 |
| → 1.12.2.0 | 1: 51-starters | 0 | 1 | 0 |
| **All four** | **30** | **7 / 10** | **29** | **2** |

- 33 commits carry the HUD fixes: 1,326 HUD lines added or removed. [measured]
- About 162 of those lines are shape hunks (12%). Four commits mix shape and rule hunks; those were split by reading
  each hunk. [inferred]
- The 2 latent fixes are 21 lines, so rule fixes are about 1,143 lines (86%). [measured]
- 1.12.1.1's bump also added 160 `// @mirrors` lines across 24 files. That is bookkeeping, left out of all counts
  above (`59133728`, `262ee8a7`). [measured]

### What drift named that needed no HUD code

The 1.12.1.1 bump's change list counted 39 MISSING drift rows with a HUD dependent. That list is produced locally by
the pin-bump procedure and kept out of the repo; [#734](https://github.com/IIxauII/coachemon/pull/734)'s body quotes
its totals.

- 18 of those rows needed no HUD code: file moves (`events.ts` → `game-events.ts` and others) and registry
  reclassifications, all fixed by repointing the registry in `262ee8a7`. The HUD reads by property name off live
  objects and imports no game module, so a moved declaration costs a registry line and nothing else. [code]
- Several signature changes cost nothing *because* the HUD calls the game's own method live:
  - `getMoveEffectiveness` lost an argument;
  - `getLevelMoves` renamed `formKey` to `form`;
  - the signatures of `hasAbilityWithAttr`, `getIconId`, `isOfType` and `isTmCompatible` changed;
  - `genPartyMember` and `addEnemyPokemon` changed, which the preview calls live;
  - 1.12.2.0 added an optional `forMoveGen` parameter to `getTypes`.

  [code, from the PR bodies of #734 and #926]

### What this says about the layer

- **Shape fixes concentrate.** Only `getMode` spread, and the drift check named it as one entry. [code]
- **Little to save.** Under the layer, `getMode` would drop from 4 files to 1 or 2, since `02-*` would sit inside the
  layer anyway. The heal merge would drop from 3 files to 1. The other four changes would move into the layer, not
  disappear. That comes to about 3–5 file edits and 20 lines over four bumps. [inferred]
- **The layer does not reach code outside the HUD.** That code took as many shape fixes as the HUD: `src/page`, the
  harness template, the escape ladder, the oracle template and the enums. Three upstream changes (`getMode`,
  `tempSummonData`, the starter rework) crossed bundles. The registry and drift check already name every one of those
  reads, in every bundle, in one report. [code]
- **Reading plain fields caused fixes.** `4b0df70e` changed `form?.ability1` to `form.getAbility(0)`, because the
  Ability Randomizer hooks the accessor. `38045b6a` replays the challenge's `applyModifyEvolutions` over raw evolution
  rows, and `41542ceb` and `2fa6e872` read the challenge-modified starter data. [code]
- **Caveat: a small sample.** One release carries every shape fix. A release that renames a method read in many
  files would spread wider than anything here. [inferred]

---

## 2. Inventory by layer

### How the reads were counted

1. **Name scan.** [measured] `scan-hud.ts` runs the repo's own scanner (`readsIn`, `scripts/game-reads/scan.ts:62`)
   over every HUD file and joins each property read to the registry.
   - A **game-only** name is one the registry has and none of our product code, the DOM or Node declares. It can only
     be read off a game object.
   - Every other registered name is **shared**, and the receiver decides whether it is a game read.
2. **Classes.** [measured counts; inferred class per name] `classes.mjs` gives each game-only name one class:
   - **computed**: the game derives the answer, from fusion, Tera, forms, held items, stages or challenges;
   - **plain**: a stored field, or a method that only returns one;
   - **live handle**: a live object handed to a game function, or game code that writes state, draws from the RNG or
     builds game objects;
   - **nav**: a hop only to reach another game object.
3. **Receivers, checked by hand for layers 07–57.** Shared names read off live objects count here; reads off our own
   records do not. [measured, hand count, ±5 per file]
4. **The computed calls were checked in the game source** [code, at v1.12.2.0]:
   - `getTypes` folds in Tera, Stellar, `summonData.addedType`/`types`, illusion and fusion
     (`game/field/pokemon.ts:2087–2160`);
   - `getAbility` folds in `summonData.ability`, overrides and fusion (`:2211–2226`);
   - `getMoveset` returns the Transform or Mimic copy (`:1883–1889`);
   - `getStat(i)` with its default argument returns the stored `stats[i]` (`:1364–1370`), so it counts as plain.

### The issue's numbers, checked

- **39 of 57 files** touch game objects. 37 read at least one game-only name. Two more read none but still touch
  game objects:
  - `35-team-plan.js` takes live mons from `turn.facts` (`35-team-plan.js:720–721`) and clones them with
    `Object.create(p, { hp })` (`:132`);
  - `99-start.js` hooks the Phaser game loop (`:70`).

  The other 18 are `00-prelude`, `01-meter`, `05-randbats` and the 15 renderers. There are 57 files, not 55:
  `53-pivot.js` and `96-render-pivot.js` landed in `ebbaaf3b`, after the issue was filed. [measured; code]
- **12 files reach the game through a global**, not 11:
  - the `Phaser` global: `01-core`, `08-party`, `10-damage`, `25-turn`, `44-safari`, `46-encounter`, `48-preview`,
    `50-reroll` and `90-render`;
  - `battleScene()`: `98-watch` and `99-start`;
  - the game's own module chunks, through an injected module script and a `window` handoff: `04-game-tables`
    (`:57–93`). The issue's regex missed this one, and it serves tables to 14 files.

  [measured; code]
- **A name count alone misleads.**
  - It over-counts: the renderers hold 204 reads of registered names, all off our own card data (`rows`, `boss`,
    `icon` happen to match game declarations).
  - It under-counts: the check never asks about `name`, `type` and `species`, which are JavaScript builtins. The HUD
    reads `.species` 108 times, mostly off live mons. [measured]

### Totals by layer band

Game-only reads per band, from the name scan. [measured]

| Band | Files | Files with game-only reads | Game-only reads | computed | plain | live | nav |
|---|---:|---:|---:|---:|---:|---:|---:|
| 00–09: core, decision, screens, calendar, tables, move traits, party, combatant, projection | 12 | 9 | 154 | 20 | 81 | 8 | 45 |
| 10–26: damage, threats, value, enemy AI, turn read, run read | 6 | 6 | 202 | 21 | 93 | 55 | 33 |
| 30–57: the model builders | 20 | 19 | 497 | 78 | 241 | 29 | 149 |
| 60–99: card, render, watch, start | 19 | 3 | 23 | 2 | 4 | 1 | 16 |
| **All** | **57** | **37** | **876** | **121** | **419** | **93** | **243** |

The table counts only game-only *names*. Calls to the game's computed mon methods (`getTypes`, `getAbility`,
`getMaxHp`, `hasAbilityWithAttr`, `getHeldItems`, …) are shared names, because `09-combatant`'s stand-in declares
them. Those calls, made directly or through `01-core`'s helpers (`typesOf`, `abilitiesOf`, `battleMoveset`, …), add
another 328. [measured]

Checked by receiver, layers 07–57 hold about 335 computed, 1,740 plain, 390 live-handle and 460 navigation reads.
Plain outnumbers computed about five to one. [measured, hand count] The computed reads are few, but they carry the
drift risk. The live handles cluster in two places [code]:

- the turn read and its callers: `20-enemy-ai`, `25-turn`, `30-planner`, `35-team-plan`;
- the generators: `44-safari`, `46-encounter`, `48-preview`.

The per-file table is in [Appendix A](#appendix-a-game-reads-per-file).

### Where a computed value is re-implemented

The HUD carries 181 `// @mirrors` hand copies of game data, in 23 files. [measured] The copies of a *computed* value,
which the game could answer differently after a change, include [code]:

- type effectiveness with ability immunities (`01-core.js:5–63`);
- fusion base stats and types, and stats at a level (`09-combatant.js:36, 169–175`);
- status immunity by type (`25-turn.js:229–232`) and the Stealth Rock chip (`:288–289`), each the fallback for a game
  call;
- the hand fallback of every game-mode call (`03-calendar.js:17–18, 26, 30, 185`);
- the enemy-AI chain (`20-enemy-ai.js`);
- the wave seed (`48-preview.js:26–28`).

A read layer only wraps the game's calls. It removes a re-implementation only where the call could have been made at
read time, as with the fallbacks. Where no live object exists to ask, such as a would-be fusion or a projected level,
the re-implementation stays. [inferred]

---

## 3. Where the line could go

### Where the plain/live boundary is today: at the card's consumers

Game objects enter at the top and are handed *down* [code]:

1. `98-watch` obtains the scene (`98-watch.js:205`).
2. It passes the scene to `readCard` (`60-card.js:140`).
3. `readCard` opens the turn read (`25-turn.js:465`) or the run read (`26-run.js:60`).
4. A model builder in layers 30–57 turns that read into the card.

The card is plain. `60-card.js:48–50` strips its one live field, `pin`, because the card "is plain data read whole by
`__coachHud.last()`".

So the issue's "from the card layer up, the code already takes plain data" holds for the card's *consumers*: the
summaries (`60-card.js:185–301`), the card event and the 15 renderers. It does not hold for layer 60 as a whole.
`readCard` reads the scene and both parties (`60-card.js:142–180`), and `composeBattleCard` hands the live party to
`partyProfile` (`:57`). [code]

**Below the card, a read layer already exists in pieces** [code]:

- **The turn read is a facade, but its keys are live.** It answers `turn.outcome(atk, def, pm)`, `turn.mon(p)`,
  `turn.enemyAction(foe)` and `turn.turnEndHp(p, opts)`, memoised and inside the sandbox (`25-turn.js:310–372`). But
  it takes live mons as keys, and `turn.facts` hands up the live party, foes, field, trainer and modifiers
  (`:185–210`).
- **`turn.mon(p)` is already a per-mon view of computed answers** (`monRecord`, `25-turn.js:260–307`):
  - `speed` from `getEffectiveStat`;
  - `order(pm)` from `getPriority`;
  - `canTake` from `canSetStatus`;
  - `facts` from `targetFacts` (`10-damage.js:93–110`), a plain record.

  It still exposes the live `p`.
- **Hypotheses are already plain patches.** A patch is `{ mon, stages, status, types, addedType, tera, waveTurnCount,
  lessBerry, delayedAttack }` (`25-turn.js:71`). It is written onto the live mon and undone afterwards (`:68–124`).
  Only `mon` is live. `35-team-plan.js:132` clones a mon only because a patch has no `hp`.
- **The run read hands up the scene** (`run.scene`, `26-run.js:93`). Its `facts` are plain apart from the live party
  (`:12–27`).
- **Smaller plain views:**
  - `liveOf` (`57-oracle-line.js:168–173`);
  - `foeData` (`48-preview.js:52`);
  - `accountRead` (`98-watch.js:177–194`), plain apart from `party` and the species table.
- **Game calls already go through the two reads.** The bundler's `@only` makes `sandbox`, `openRead` and every
  `scene*` function of `10-damage` and `20-enemy-ai` importable only by the turn read and the run read
  (`01-core.js:151, 184`; `10-damage.js:36, 54, 620, 935`; `20-enemy-ai.js:308, 357`).

### What must hold a live object

Four kinds of work can't run on a copy [code]:

1. **The per-frame look.** Each frame the watch keys the decision on the *identity* of live objects:
   - the battle and phase in `detect` (`02-decision.js:56–89`);
   - the party fronts in the send-in check (`98-watch.js:95–115`);
   - each slot's command object in `oracleLineSeen` (`57-oracle-line.js:162–166`, called every frame from
     `98-watch.js:313`).

   A once-per-decision mapping can't serve these.
2. **Game code run on a live mon in the sandbox.**
   - `sceneOutcome` hands live mons to `getAttackDamage` and `getMoveEffectiveness` (`10-damage.js:738, 741`).
   - The enemy-AI replica calls `getNextMove`, `getMatchupScore` and the benefit scores (`20-enemy-ai.js:51, 74, 287,
     370, 380`).
   - The turn read writes hypotheses onto live mons (`25-turn.js:68–124`) and calls `shouldTera`, `getEffectiveStat`
     and `canSetStatus` (`:376, 263, 278`).
   - `09-projection.js:51–55` runs the challenges' `applyModifyEvolutions` on the live member.
3. **Generation under the run's seed.**
   - `48-preview.js` swaps `s.currentBattle` (`:42–46`) and runs `generateNewBattleTrainer`, `genPartyMember` and
     `addEnemyPokemon` (`:117–150`).
   - `44-safari.js` builds its mons the same way (`:38, 100–105`).
   - `50-reroll.js` saves and restores `Phaser.Math.RND` around the game's reward functions (`:22–44, 76`).
   - `46-encounter.js` checks options under `executeWithSeedOffset` (`:289–291`).

   Their *outputs* are already plain.
4. **Entry points.**
   - `battleScene()` and the sprite atlas (`90-render.js:12–33`);
   - the tables (`04-game-tables.js:57–93`);
   - the frame loop (`99-start.js:70`);
   - `sandbox` and `forcedRng` (`01-core.js:153–252`).

### Candidate lines

| Line | What sits below it | Game-only reads left above it | Files above it with any |
|---|---|---:|---:|
| above 57 (today, the card) | every model builder | 23 of 876 | 3 (`60`, `90`, `98`) |
| **above 26 (the two reads)** | core, decision, screens, calendar, tables, move traits, party, combatant, projection, damage, threats, value, enemy AI, turn read, run read | **520 of 876** | **22** |
| above 06 (a low layer) | core, decision, screens, calendar, tables | 805 of 876 | 32 |

[measured; shared names add more, so these counts are floors]

**The lowest workable line is above layer 26.** [inferred] It is the lowest line that doesn't re-express the game's
damage, AI or generation code. That code already runs inside the two reads, and `@only` already makes the two reads
its only importers. Getting there takes five moves:

1. **The reads hand up plain views keyed by id.**
   - `turn.facts` carries `MonView`s and a `FieldView` instead of live mons.
   - `turn.outcome`, `turn.mon`, `turn.enemyAction` and `turn.turnEndHp` take a mon id and look up the live mon
     inside.
   - A `Patch` names `monId` and gains `hp`.
   - `run` drops `scene` and carries a plain party.
   - Outcome records drop their live `pm`.
2. **The per-frame look moves down whole.** The game reads of `oracleLineSeen` and the send-in key join `detect` in
   `02-decision.js`, which hands up plain keys.
3. **Screen detection moves down.** `readCard`'s look at the screen, and the UI handlers that the shop, biome, splice,
   pivot and encounter builders read, become plain screen views built in the read layer.
4. **Generation becomes run-read services:** `run.preview(wave)`, `run.safari()`, `run.rerollAhead()` and
   `run.encounterOptions()`, each returning the plain rows it already builds.
5. **Entry points move below.**
   - `battleScene` moves out of `90-render.js`.
   - The renderer calls a `spriteOf(key, frame)` function instead of reading the atlas.
   - `99-start` gets a frame-hook function.

**Not proposed: a line above 06.** It would put damage, the enemy-AI replica and the turn read on plain data too.
Those are the heaviest game readers: 62, 72 and 58 game-only reads. [measured] Their game calls run on live mons
with hypotheses written in. They would have to become id-keyed services, and the logic around them would have to be
rewritten onto plain shapes. [inferred]

**Within 25→30 there is no plain seam today.** [code] `30-planner.js` keeps live `pm` handles (`:52, 60`) and live
`fieldPlan.picks` (`:2151`). It builds `Object.create` clones of live mons (`:591, 651–652, 695, 780, 1011`). One of
those clones reaches the game's `getEffectiveStat` to halve speed under paralysis. Its first plain output is
`battleModel`'s return (`:2400–2524`). So the line above 26 converts the planner from live mons to views. Its clones
become patch kinds the turn read applies. [inferred]

### The plain shapes it would hand up

Field lists come from what the files above layer 26 read today. Each field is marked as **stored** (copy it) or
**computed** (call the game once at read time and copy the answer). [inferred from the inventory]

```ts
type MonId = number;     // Pokemon.id; the read layer maps it back to the live mon
type TypeName = string;  // TYPES order, 01-core.js:2

interface MonView {
  id: MonId; side: "player" | "enemy"; partyIndex: number;
  fieldIndex: number | null; battlerIndex: number | null;   // stored
  name: string; speciesId: number; formIndex: number;
  rootSpeciesId: number;                                     // computed: getRootSpeciesId
  fusion: { speciesId: number; formIndex: number } | null;
  level: number; luck: number; friendship: number; gender: number; shiny: boolean;
  nature: number; ivs: number[]; abilityIndex: number;
  hp: number; maxHp: number; fainted: boolean;               // computed: getMaxHp
  status: { effect: number; turns: number } | null;
  types: TypeName[];        // computed: getTypes (Tera, Stellar, addedType, Soak, fusion, form)
  baseTypes: TypeName[];    // computed: the same with Tera off
  teraType: TypeName; terastallized: boolean;                // computed: getTeraType
  ability: AbilityView; passive: AbilityView | null;         // computed: getAbility, getPassiveAbility
  stats: number[];          // stored: stats
  stages: number[];         // stored: summonData.statStages
  speed: number;            // computed, turn read only: getEffectiveStat(SPD)
  moves: MoveSlotView[];    // computed: getMoveset (a Transform or Mimic copy)
  learnable: number[];      // computed: getLearnableLevelMoves
  heldItems: ItemView[];    // computed: getHeldItems
  boss: { bars: number; bar: number } | null;                // stored
  onField: boolean; allowedInBattle: boolean;                // computed: isOnField, isAllowedInBattle
  lastMoves: number[]; moveQueue: number[];                  // stored
  aiType?: number; trainerSlot?: number;                     // enemy only
  icon: [atlasKey: string, frame: string];                   // computed: getIconAtlasKey, getIconId
  facts: TargetFacts;       // 10-damage.js:93–110, already plain
}
interface AbilityView { id: number; name: string; attrs: string[] }
interface MoveSlotView { moveId: number; ppUsed: number; ppUp: number; maxPp: number; move: MoveView }
interface MoveView {
  id: number; name: string; power: number; accuracy: number; pp: number; chance: number;
  target: number; flags: number;                             // stored
  type: TypeName;           // computed for this user: getMoveType
  category: number;         // computed for this user: getMoveCategory
  priority: number; bracket: number;                         // computed: getPriority, getPriorityModifier
  usable: boolean;          // computed: isUsable (Disable, Taunt, Encore, PP)
  traits: MoveTraits;       // 07-move-traits, closures evaluated for this user
}
interface ItemView { typeId: string; className: string; stack: number; berryType?: number; holder: MonId | null }
interface PartyView { player: MonView[]; enemy: MonView[]; field: MonId[] }
interface TrainerView {
  type: number; name: string; double: boolean; config: object;
  teraNow: MonId[]; teraLater: MonId[];                      // computed: shouldTera
}
interface FieldView {
  wave: number; turn: number; double: boolean; battleType: number;
  decision: "command" | "check-switch" | "faint-switch" | null;
  weather: { type: number; suppressed: boolean }; terrain: number; trickRoom: boolean;
  hazards: { side: number; tag: string; layers: number }[];
  delayedAttacks: { targetIndex: number }[];
  biomeId: number; playerTerasUsed: number; money: number; balls: Record<number, number>;
  playerItems: ItemView[]; enemyItems: ItemView[]; enemySwitchCounter: number;
  trainer: TrainerView | null; encounter: EncounterView | null;
  command: { kind: number; cursor: number; move: number | null; targets: number[]; tera: boolean } | null;
  mode: ModeView;
}
interface ModeView {
  classic: boolean; daily: boolean; endless: boolean; challenges: { id: number; value: number }[];
  freshStart: boolean; anyChallenges: boolean; dailyBossCatchable: boolean;
  waves: { wave: number; kind: string; final: boolean; boss: boolean; fixedTrainer: boolean }[];  // computed per wave
}
interface Patch {                                            // 25-turn.js:71, keyed by id, plus hp
  monId: MonId; stages?: Record<number, number>; status?: object; types?: number[]; addedType?: number;
  tera?: boolean; waveTurnCount?: number; lessBerry?: number; delayedAttack?: boolean; hp?: number;
}
interface RunView {
  key: string; seed: string; wave: number; biomeId: number; waveCycleOffset: number; offsetGym: boolean;
  party: MonView[]; modifierCount: number; encounteredEvents: number; encounterSpawnChance: number | null;
  account: AccountView; mode: ModeView;
}
interface AccountView { dex: object; starter: object; daily: boolean; shinyCatchMultiplier: number; extraCatchCandy: number }
type ScreenView =
  | { kind: "learn"; mon: MonId; move: MoveView }
  | { kind: "rewards"; shop: ShopView }
  | { kind: "biome"; options: { biomeId: number; label: string }[] }
  | { kind: "encounter"; encounter: EncounterView }
  | { kind: "starters"; /* the starter screen's own fields, 51-starters.js:181–443 */ }
  | { kind: "splice"; first: MonId | null; filter: number }
  | { kind: "pivot"; out: MonId; slot: number };
interface ShopView { free: OfferView[]; shop: OfferView[]; rerollCount: number; rerollCost: number; locked: boolean; money: number }
interface OfferView {
  typeId: string; className: string; name: string; tier: number; cost: number;
  tm?: { moveId: number; compatible: MonId[] };              // computed: isTmCompatible
}
interface EncounterView {
  type: number; tier: number; name: string;
  options: { label: string; meetsReqs: boolean; requiredMoney?: number; primary?: MonId }[];  // computed: queryParty
  enemyParty?: object[]; safari?: { left: number; mon: MonView | null; catchStage: number; fleeStage: number };
}
```

The two reads would also serve these queries, live inside and plain outside:

- on the turn read: `outcome(atk: MonId, def: MonId, moveId, opts)`, `outcomes`, `statusMoves`,
  `enemyAction(foe: MonId)`, `turnEndHp(mon: MonId, patch)` and `with(patches)`;
- on the run read: `preview(wave)`, `safari()`, `rerollAhead()` and `encounterOptions()`.

The game tables (species, moves, abilities, biomes, trainer configs) would stay below the line, read through
functions. They are fixed for a pin and large, so copying them per decision would be waste. [inferred]

### `07-move-traits` and `09-combatant`

**`07-move-traits` (#128) folds in as `MoveView.traits`.** [code; verdict inferred]

- Its input is live: `moveTraits(mv, user, { party, target })` (`07-move-traits.js:77`) reads the move's attrs by
  class name, `chargeAttrs`, `getLevels(user)` and the user's ability attrs.
- Its output is plain apart from two closures over the live user:
  - `charge.now` (`:84`), called at `10-damage.js:69`;
  - `heal.ratioIn` (`:113–117`), called at `30-planner.js:2296`.
- In the layer, both would be evaluated at read time for each party member.
- #128's "read each move once" is the pattern the layer would generalise, so the file is not made obsolete.

**`09-combatant` (#572): the stand-in goes, the builder stays.** [code; verdict inferred]

- `combatantOf` (`09-combatant.js:207`) returns an object shaped like a live mon. It carries 15 of the game's method
  names (`getMaxHp`, `getStat`, `getTypes`, `getAbility`, `hasAbilityWithAttr`, `getHeldItems`, `isOnField`, …), plus
  stub `summonData`, `waveData` and `turnData` (`:279–293`).
- It still holds live objects:
  - the species;
  - move slots built from the game's move table (`:254`);
  - the member's held items (`:245`);
  - a `hasAbilityWithAttr` closure over the live member (`:266`).
- Its `key` (`:272`) already serialises everything the duel reads, which shows the data underneath is plain.
- If the duel took `MonView`, the stand-in (`:279–293`) would go, and `combatantOf(spec)` would return a `MonView`.
  It would be the one producer of mons that no live mon backs: a stand-in, a projected level, a would-be fusion, a
  preview foe.
- Its re-implementations (`statsAt` `:36`, `fusedBase`/`fusedTypes` `:169–175`) would stay, because there is nothing
  live to ask.
- The approximate duel also calls the move objects' own methods (`pm.getMove()`, `getMoveType`, `getPriority`;
  `10-damage.js:955–962`). `MoveView` would have to carry those answers.

---

## 4. Cost

### How often: once per decision, never per frame [code]

**Every frame,** `watchFrame` (`98-watch.js:326–336`, driven by the meter's `requestAnimationFrame`,
`01-meter.js:151–173`) does three things:

- `oracleLineSeen` returns at once unless an oracle line is held (`57-oracle-line.js:145–147`);
- `detect(s)` reads the phase name, the UI mode and a few battle fields (`02-decision.js:48–93`). It "allocates
  nothing per frame" (`:1–2`). At a shop it also hashes the party's ids and moves and the modifiers. It makes no
  call into the game's damage, AI, stat or type code;
- between decisions, `sentIn(s)` compares the party fronts by identity (`98-watch.js:108–115`).

**Once per decision.** `look` returns true only when the decision is ready *and* its key differs from the one
already built (`98-watch.js:57–62`). Then:

- a decision built recently shows its cached card and reads nothing;
- otherwise `build` → `readCard` runs (`:203–228`; `60-card.js:140–183`). For a battle that is one turn read
  (`25-turn.js:465–500`).
- The road (preview, ahead) lands in its own task right after (`98-watch.js:293–304`).
- At a shop, the team audit lands one chunk per task (`:282–288`).

**Between decisions, only these build:**

- A mon sent in mid-turn: one rebuild in estimate mode, with no game damage call (`98-watch.js:333–334`).
- The 1 s fallback (`99-start.js:67`; `98-watch.js:338–353`), which builds only when no frame has arrived since its
  last tick.
- The first screen after injecting the HUD.

A mapping placed where the two reads open (`25-turn.js:471–476`, `26-run.js:60–108`) would run once per decision,
plus once per send-in. [inferred placement]

Two things widen that [inferred]:

- **The per-frame look reads live objects.** It can't map the battle every frame, so the layer needs a second,
  narrow read for the look. That read sits in layer 02, below any line.
- **Hypotheses patch live objects.** The planner's hypothetical turns write onto live mons and ask the game again
  (`25-turn.js:68–124, 432`). A snapshot taken once doesn't see a patch. A value read under a hypothesis (types after
  Soak, stages after a setup move, a Tera) must be patched in the plain copy too, or re-mapped for each hypothetical
  turn. This run did not count how many hypothetical turns one build opens.

**#483's note is partly stale.** The note
([`docs/research/panel-main-thread-cost.md` on `research/panel-main-thread-cost`](https://github.com/IIxauII/coachemon/blob/research/panel-main-thread-cost/docs/research/panel-main-thread-cost.md))
used the same method, reading the loop and labelling each claim. Its finding that the composed battle card is the
largest single piece of work still holds. [code]

Its findings 3, 5 and 6 read a 1 s tick in `hud/98-tick.js`, which rebuilt the trainer switch AI, the shop, learn and
splice models, and a floor of game reads every second. They no longer hold. That file is gone, and the watch builds
on a decision's first ready frame and holds the card (`98-watch.js:41–47, 78–88`). [code]

### Measured in Node

**What was run.**

- **How the HUD was loaded:** the way the suite loads it. `mountHud` from `test/fake-page.mjs` compiles the bundle
  and runs it on a fake page (`test/fake-page.mjs:67–92`). [code]
- **Fixture:** a doubles trainer wave at its command, six mons a side, four moves each, built from the suite's fakes
  (`test/fake-mon.mjs`, `test/game-proto.mjs`). Every field the mapping reads is filled in: fusion on one mon, Tera,
  abilities with attrs, a passive, held items, IVs, nature and status.
- **The prototype mapping** (`plainBattle` in `map-bench.mjs`) copies an upper bound per mon: every name the registry
  records on a mon, move, moveset entry, species, summon data, arena or battle that some HUD file spells.
- **Two card-build variants:**
  - *suite's fakes*: the fake mons have no `getAttackDamage`, so every damage call throws and falls back to the type
    chart (`10-damage.js:936–945`). This is what scene-mounted battle tests run today.
  - *damage stubbed*: six game methods answer constants, so the build takes the live path a real turn read takes
    (`10-damage.js:712–760`).

Node v26.9.0, Apple Silicon Mac. The table is one run on a machine running other work, so the tails are noisy.
[measured]

- Earlier runs of the same bench gave build medians of 52–60 ms (fakes) and 118–134 ms (stubbed).
- A second full run while this note was written gave:
  - a mapping median of 19.6 µs;
  - build medians of 52.5–57.8 ms (fakes) and 115–121 ms (stubbed);
  - identical read counts.
- The gap of three orders of magnitude between mapping and build held in every run.

| What | Median | p95 | n |
|---|---:|---:|---:|
| map the full battle (12 mons + field) | 22.0 µs | 33.2 µs | 20,000 |
| map one mon | 1.8 µs | 2.8 µs | 20,000 |
| per frame: `detect(s)` | 10 ns | 41 ns | 2,000 × 100 |
| card build, suite's fakes: watch `rebuild` | 60.0 ms | 88.9 ms | 200 |
| card build, suite's fakes: `readCard`, no road | 56.9 ms | 67.2 ms | 200 |
| card build, damage stubbed: watch `rebuild` | 134.3 ms | 178.3 ms | 200 |
| card build, damage stubbed: `readCard`, no road | 130.2 ms | 171.2 ms | 200 |
| card build, estimate only (the send-in redraw) | 38.8–40.3 ms | 55.7–78.6 ms | 200 |

- **Time:** the mapping is 0.016–0.057% of a build by median, across the variants. [measured]
- **Size:** the mapped battle is 26 KB as JSON. [measured]
- **Where the build's time goes:** the meter puts all of it in the `read` stage. `road`, `groups` and `dom` take
  0.2 ms or less. [measured]

**Reads, not just time.** A counting proxy sat on every game-shaped object. [measured]

- One stubbed watch rebuild reads **218,516** properties off game-shaped objects. One full mapping reads **2,100**,
  about 1%.
- The build's busiest reads on mons are:

  | Read | Times |
  |---|---:|
  | `isPlayer` | 12,068 |
  | `hasAbilityWithAttr` | 11,252 |
  | `isOnField` | 10,740 |
  | `getHeldItems` | 7,278 |
  | `getTag` | 3,934 |
  | `getTypes` | 1,394 |

- On moves, `attrs` is read 40,154 times.

These counts come from the HUD's code and the fixture, so they carry over to the real game better than the times do.
[inferred]

**Some reads can't be snapshotted at all.** Their answer depends on an argument or on the moment, so no snapshot can
carry them [measured names; inferred class]:

- on mons: `getAttackDamage`, `getMoveEffectiveness`, `getMoveType`, `getMatchupScore`, `hasAbilityWithAttr(attr)`,
  `getTag(type)`;
- on moves: `applyConditions`, `getPriority(user)`;
- on the arena: `isMoveWeatherCancelled`;
- on the trainer: `shouldTera`, `getNextSummonIndex`.

Before each damage call the build also writes `turnData.hitCount`, `hitsLeft` and `moveEffectiveness`
(`10-damage.js:721, 737, 952`). These stay with the turn read, below any line. [code]

**In the real game** [inferred]:

- The game's methods do more work per call than the fakes:
  - `getHeldItems` filters the scene's whole modifier list (`game/field/pokemon.ts:1201–1209`);
  - `getTypes` builds a set from Tera, summon data, form and fusion (`:2087–2125`);
  - `hasAbilityWithAttr` runs the fusion, Transform and suppression checks.
- So both sides grow: the mapping's ~2,100 reads and the build's ~218,000. The build also runs the game's own damage
  and AI code, which the mapping never calls.
- The real mapping is likely tens to low hundreds of µs per decision.
- A mapping could even *save* time on values the build reads thousands of times. That holds only for values no
  hypothesis patches. A memo inside the turn read would buy the same saving without a layer.

**What would settle the real cost** (not run here):

- *Without a browser:* a clone test of the kind `npm run oracle:encounter` runs. It would evaluate the HUD bundle
  inside the pinned game's vitest with `GameManager` (`scripts/clone-test/clone-test.ts:101–107`), start a doubles
  trainer battle, and time `plainBattle(globalScene)` against `__hud["98-watch"].rebuild()` on real `Pokemon` objects.
- *In the browser:* `npm run lag:run -- --slot 4` on master and on a prototype that maps inside the turn read,
  compared with `npm run lag:report -- --before <run> --after <run>`. Read the **turn card ms** column and the meter's
  `read` stage (`01-meter.js:81–92`).

---

## 5. Enforcement

### How game reads are identified today [code]

- **By syntax and by name.** `readsIn` (`scripts/game-reads/scan.ts:62–160`) walks each file's syntax tree and
  records every property access, destructured key, phase-name string, storage key and `// @mirrors` comment.
- **The HUD gets no types.** The HUD is plain JavaScript, and the typed path (`typedReceiver`, `scan.ts:68`) applies
  only to `.ts` files (`check.ts:66`). `tsconfig.json` has no `checkJs`.
- **A read passes on its name alone.** `check` (`check.ts:86–155`) passes a property read when its name is
  registered in *any* area (all areas pooled, `:89`) or is a JavaScript builtin (`:108`).
- **The registry says where the game defines a name, not who reads it.** An entry is
  `{ name, kind, at: ["<game file>#Class.member"], from? }` (`scripts/game-reads/types.ts:17–29`), filed under one of
  five areas, never under a HUD file.
- **The only per-file list is the ADR 0001 hand-registered deps** (`scripts/hud-deps.ts:12`). It is hand-curated and
  lists what each module leans on, not what it reads.
- **The bundler enforces imports, not values.** `hud-bundle.mjs` refuses two things:
  - an import from a file with an equal or higher number (`forward-import`, `:197–209`);
  - an import that a `// @only` list forbids (`only-violation`, `:180–189, 213–216`).

### What each tool can hold

| What must not happen above the line | Bundler | ADR 0004 check | What it would take |
|---|---|---|---|
| a file obtains a game handle (`battleScene()`, `gameTables()`, `Phaser.`, `window[…]`) | **yes** | no | About ten lines: `@only` on `battleScene` and the three table getters (`04-game-tables.js:90–93`), plus a regex refusal of `\bPhaser\.` and `window[` above the line. `battleScene` must first move out of `90-render.js`. |
| a file calls game code on a live object | partly, already, by `@only` | no | Already held for `sandbox` and the `scene*` functions. Other game calls are method calls on objects, which only a type or a name can catch. |
| a game object reaches a file *as a value* (an argument, a return, a field of `turn.facts` or `run`) | **no** | **no** | a typed pass, or a runtime check |

The third row *is* the line. Live mons travel up as values: `turn.facts.party` (`25-turn.js:193`), `run.scene` and
`run.facts.party` (`26-run.js:13, 21, 93`), and `accountRead().party` (`98-watch.js:189`). Neither tool sees where a
value came from. [code]

### Four ways to add a per-layer rule

1. **Fail a game-only name above the line.** A few lines: give each scanned read its layer number (the bundler's
   `numberOf`) and refuse game-only names above N. It works as a tripwire and nothing more [measured]:
   - It misses every shared name: 226 of the 547 registered game field names are also declared by our code, among
     them `level`, `hp`, `moveset` and `moveId`.
   - It misses `name`, `type` and `species`.
   - It gets weaker as the layer is built: the plain shapes would declare the game's names, so those names stop being
     game-only. The combatant stand-in has already done that to 15 of the game's method names.
2. **Fail any registered name above the line.** Also a few lines, but unworkable: it fails today's renderers 204
   times on names like `rows`, `boss` and `icon`, which are ours. [measured]
3. **A typed pass.** Put the files above the line under `checkJs`, declare the plain shapes in a `.d.ts`, type every
   exported function, and widen the check's program to those files so `typedReceiver` applies. It is the only static
   rule that judges the receiver, not the name. Its cost: types on 11,055 lines of files above layer 26. [measured]
4. **A runtime plainness assertion (not static).** In tests, assert that everything the read layer hands up is plain:
   prototypes are only `Object.prototype` or `Array.prototype`, and there are no functions. Run it where cards are
   built from a real scene, in the oracle's clone. About tens of lines. [inferred]

**Answer.** The bundler can hold the entry points cheaply. Nothing in place can hold the values. A real line needs
option 3 or 4. [inferred]

---

## 6. Tests

**Counts** [measured]:

- 36 test files, 19,744 lines.
- The shared fakes and fixtures are 457 lines.
- 818 lines in the tests define a game-shaped member: a method the game declares, or a game field written into a
  literal. The regex is in [§9](#9-how-to-reproduce).

### Totals by bucket

Each bucket assumes the line sits above layer 26 (§3). The per-file table is in
[Appendix B](#appendix-b-tests-per-file).

| Bucket | Files | Lines | Game-shaped lines |
|---|---:|---:|---:|
| **P**, moves to plain data (planner, judgment, team plan, learn, combatant, render, threats, party, card event, lead, boss plan) | 11 | 7,753 (39%) | 287 |
| **M**, mixed: would split (encounter, shop, catch, biome, ahead, engine, audit, fusion, projection) | 9 | 4,809 (24%) | 259 |
| **G**, stays game-shaped (oracle line, damage, enemy AI, decision, preview, starter, battle, calendar, journal, move traits, game tables, run) | 12 | 6,165 (31%) | 267 |
| **N**, no game shapes either way (group, card, meter, watch) | 4 | 1,017 (5%) | 5 |
| **All** | 36 | 19,744 | 818 |

[measured lines; inferred buckets]

- **What changes in a P file is its input builders, not its assertions.** Splitting the M files moves roughly half
  their game-shaped lines too. That puts the rewrite at about 290–420 of the 818 lines. [inferred]
- **The fakes.** About 131 of their 457 lines exist only to copy game shapes. [inferred classification of measured
  ranges]
  - `game-proto.mjs`, `game-writes.mjs` and `fixtures/challenges.mjs` (69 lines) stay with the G tests.
  - The mon builders in `fake-mon.mjs` and `fixtures/party.mjs` (about 60 lines) would give way to plain records for
    the P tests.

---

## 7. Found along the way

These are independent of the recommendation. Each could be its own issue.

- **A Parental Bond combatant may throw in the team-value duel.** [code; not run]
  1. `koRace` in `12-value.js:41` calls `approxOutcomes` on two combatants.
  2. That reaches `traitsNow` (`10-damage.js:913`) and `moveTraits(mv, combatant, { target })` (`10-damage.js:68`).
  3. For a combatant whose ability has `AddSecondStrikeAbAttr`, the stand-in answers true (`09-combatant.js:266–268`).
  4. `07-move-traits.js:68` then calls the real game's `Move.canBeMultiStrikeEnhanced(combatant, true, target)`,
     through `enhanced` (`:65`). Nothing catches an error there.
  5. At the pin, that method calls `getMoveTargets(user, id)` (`game/data/moves/move.ts:1351`), which calls
     `user.getOpponents(false)` (`game/data/moves/move-utils.ts:57`). The stand-in has no `getOpponents`
     (`09-combatant.js:279–293`).

  The suite can't see this: its fake moves stub `canBeMultiStrikeEnhanced` (`test/movetraitstest.mjs:21`,
  `test/damagetest.mjs:157`). Whether an outer catch saves the card was not traced. A clone test with a Parental Bond
  member in a team-value duel would settle it. It is a small instance of the risk any live-shaped stand-in carries:
  game code calls it and finds a method missing.
- **One 6v6 doubles trainer card costs over 100 ms of the overlay's own code on fakes.** [measured on fakes]
  - It takes 57 ms with the damage calls failing over to the type chart, and 130 ms with them stubbed.
  - All of it lands in the meter's `read` stage, before any game code runs.
  - It may deserve its own look against the lag run's turn card ms.
- **#483's findings 3, 5 and 6 no longer hold.** The once-a-second rebuilds they describe went with `98-tick.js`
  (§4). [code]

---

## 8. Why not "adopt" or "adopt partially"

- **Adopt (line above 26, first slice: `turn.facts` hands up `MonView`s and id-keyed patches).** This would shrink
  the tests' game-shaped inputs and replace the combatant stand-in with a real plain type. It would make the turn
  read's interface honest. But its payoff in pin bumps is about 3–5 file edits over four bumps. It doesn't touch the
  86% that is rule work. Its line needs a typed pass or a runtime assertion to stay held. And the rewrite runs through
  the planner, the heaviest file in the HUD. [inferred from §1–§6]
- **Adopt partially.** The cheap partial steps are each worth less than the issue's question assumes:
  - The bundler's entry-point guard (~10 lines) stops a new file grabbing the scene. But today's 12 global readers are
    known and stable, and the guard doesn't hold values.
  - An id-keyed `Patch` with `hp` would remove one `Object.create` clone (`35-team-plan.js:132`). That is a local
    tidy-up a planner change can make when it next touches that code.
  - Replacing the combatant stand-in needs the duel on `MonView`, which is most of the full layer's first slice.

  None of these is a partial *layer*. Each is a small improvement that stands on its own. [inferred]
- **Keep.** The registry already names every game read across all bundles. Drift turns every shape change into a
  named row at bump time. The oracle checks predictions against the real game. Shape fixes have been rare and
  concentrated, and the costs above are real. [inferred]

---

## 9. How to reproduce

From the repository root at `ebbaaf3b`, with `node_modules` installed. The scripts are in this directory.

**Inventory (§2, §3):**

```sh
node docs/research/916-anti-corruption-layer/scan-hud.ts "$PWD" json > /tmp/scan.json
node docs/research/916-anti-corruption-layer/classes.mjs /tmp/scan.json
```

`scan-hud.ts` imports the repo's own `scan.ts`, `check.ts`, `files.ts` and the registry, and adds only the join.
`classes.mjs` prints each file's game-only reads by class, plus the total row `876 121 419 93 243`.

**Mapping cost (§4):**

```sh
node docs/research/916-anti-corruption-layer/map-bench.mjs
```

It takes about 2–3 minutes. `BUILD_WARM` and `BUILD_RUNS` (default 20 and 200) set the card-build sample count.

**Pin-bump history (§1):**

```sh
git log --format='%h %ad %s' --date=short -G'"gameVersion"' origin/master -- src/escape-ladder/reviewed.json
git log --diff-filter=A --format='%h %ad %s' --date=short origin/master -- 'skills/coachemon/scripts/hud/*.js'
git diff --stat ba1bdea5 22a12679 -- skills/coachemon/scripts/hud/
git show --format= --numstat ba1bdea5 -- skills/coachemon/scripts/hud/
git log --no-merges --format='@@ %h %s' --numstat origin/master..origin/pin-bump-v1.12.1.1 -- skills/coachemon/scripts/hud/
git show --format= 59133728 -- skills/coachemon/scripts/hud/ | grep -c -E '^\+\s*// @mirrors'
git log --format='%h %s' -E --grep='#(71[3-9]|72[0-9]|73[0-3])[^0-9]' origin/master
git show --format= 6df809c5 -- skills/coachemon/scripts/hud/ | grep -c -E '^-.*getMode'
gh pr view 734 --repo IIxauII/coachemon --json body
```

**Tests (§6):**

```sh
wc -l skills/coachemon/scripts/test/*test.mjs
cd skills/coachemon/scripts/test && for f in *test.mjs; do printf '%s %s\n' "$f" "$(grep -vE '^\s*//' "$f" | grep -cE '\b(get|is|has|can|should|apply|calculate)[A-Z][A-Za-z0-9_]*\s*(:\s*(async\s*)?(\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>|\([^)]*\)\s*\{)|\b(summonData|moveset|currentBattle|phaseManager|turnCommands|waveIndex|getScene|bossSegments|bossSegmentIndex|statStages|fusionSpecies|speciesId|moveId|ppUsed|enemyModifiers|turnData|waveData)\s*:')"; done
```

The regex is a heuristic. It counts `getX: () =>`, `isX() {` and the listed game field keys, and misses a game shape
built another way.

---

## Appendix A: game reads per file

These columns cover game-only names. **comp.** also counts calls to the game's computed mon methods and `01-core`'s
helpers that wrap them. Counts are occurrences in source. [measured]

**Must hold live?** means the file can't work on plain data unless something below it holds the live object. [code]

| File | Game objects, and how they arrive | Notable reads (file:line) | only | comp. | plain | live | nav | Must hold live? |
|---|---|---|---:|---:|---:|---:|---:|---|
| `01-core` | mons, moves, scene as arguments; `Phaser.Math.RND` | `getTypes` 40, `getAbility` 41, `getMoveset` 218, `getHeldItems` 203; `sandbox` 153–182; `forcedRng` 247–252 | 17 | 7 | 8 | 0 | 6 | yes: `sandbox` and `forcedRng` write game state |
| `02-decision` | the scene every frame, from `98-watch` | `detect` 48–93 keys on the live battle and phase; `turnCommands` 18; `getHandler` 67, 81, 85 | 22 | 0 | 12 | 0 | 10 | yes: identity keys |
| `02-screens` | the scene, from `60-card` | `learnState` 6–16 returns live mon, move and party; `rewardsScreen` returns the live handler 19–22 | 10 | 1 | 0 | 0 | 10 | yes |
| `03-calendar` | `s.gameMode` | `isWaveFinal` 17, `isBoss` 26, `isFixedBattle` 30, `getFixedBattle` 185, each with a hand fallback | 15 | 6 | 9 | 0 | 1 | no: a mode view would do |
| `04-game-tables` | the game's module chunks via an injected script (57–88) | species, moves, abilities, biomes, trainer configs, egg moves, reward functions, events (90–93) | 7 | 1 | 0 | 0 | 6 | yes: the entry point for tables |
| `07-move-traits` | a move and its user, from 10, 25, 30, 40 | attrs by class name 11–14; `chargeAttrs` 80; `getLevels(user)` 103; `healFunc(u)` 113 | 36 | 2 | 22 | 4 | 8 | as written, yes |
| `08-party` | live party mons; the scene for one draw | `typesOf`; `calculateBaseStats` 21–31; `getEvolutionLevels` 46; `executeWithSeedOffset` 70–74 | 19 | 9 | 8 | 2 | 1 | only the seeded draw |
| `09-combatant` | an optional live member; species and moves from `gameTables()` | `getTypes` 161, 249; `getAbility(true)` 164, 226; `getHeldItems` 245; `hasAbilityWithAttr` 266; stand-in 279–293 | 20 | 18 | 17 | 0 | 2 | as written, yes |
| `09-projection` | species, the game mode, the member | `getEvolutions` 50, 82; `applyModifyEvolutions` 51–55 | 8 | 1 | 5 | 2 | 1 | yes: the challenge hook |
| `10-damage` | live mons, moves and `env.s` from the turn read | `getAttackDamage` 738, `getMoveEffectiveness` 741, `calculateBattleAccuracy` 677, `applyConditions` 32–33; `targetFacts` 93–110 plain | 62 | 34 | 31 | 22 | 8 | yes: the `scene*` functions |
| `11-threats` | species registry; `run` | `getAllSpecies` 63, 143; `baseStats` 65 | 4 | 0 | 2 | 0 | 2 | no |
| `12-value` | combatants; `run` | `isTransferable` 170, `getLevelMoves` 229, `isAllowedInChallenge` 271 | 4 | 7 | 3 | 0 | 0 | no, given plain combatants |
| `20-enemy-ai` | live mons and `env` from the turn read | `getNextMove` 287, `getMatchupScore` 380, 410, benefit scores 51, 74, `getAttackDamage` 118, 250 | 72 | 31 | 35 | 26 | 9 | yes: built on the game's AI |
| `25-turn` | the scene (`readTurn` 465) | `sceneEnv` 126–152; `withPatches` 68–124; `monRecord` 260–307; `executeWithSeedOffset` 218, 221; `shouldTera` 376 | 58 | 25 | 22 | 7 | 12 | yes: it is the turn read |
| `26-run` | the scene | `runFacts` 12–27; `run.scene` 93 | 2 | 0 | 0 | 0 | 2 | yes: it is the run read |
| `30-planner` | live mons and moves from `turn` | `getOpponents` 123, 130, 811; `getLastXMoves` 330; `getEffectiveStat` 1010; `isGrounded` 2312; `heal.ratioIn` 2296 | 33 | 72 | 26 | 0 | 5 | no: its game calls go through `turn` |
| `35-team-plan` | live mons from `turn.facts` (720–721) | `getMaxHp` 131, 138, 209; `Object.create(p, { hp })` 132 | 0 | 7 | 0 | 0 | 0 | no, with an `hp` patch |
| `40-learn` | the live learn state | `attrs` 14, `friendship` 37, `moveTarget`; 8 `moveTraits` calls | 11 | 17 | 10 | 0 | 1 | no |
| `44-safari` | the scene and game tables | `addEnemyPokemon` 38, 100; `getWildSpeciesForLevel` 95; `Phaser.Math.RND` 26, 28, 82 | 26 | 4 | 7 | 7 | 8 | yes: generation under the seed |
| `45-catch` | live foes from `turn`; `account` | `caughtAttr`, `getRootSpeciesId` 85, `isShiny` 42, `getFullUnlocksData` 118 | 26 | 13 | 21 | 0 | 2 | no |
| `46-encounter` | `run.scene`, the encounter handler, `account` | `queryParty` 133, `getWaveMoneyAmount` 136, `executeWithSeedOffset` 289, `canSetStatus` 676 | 115 | 56 | 40 | 4 | 51 | yes for option checks; the judgement no |
| `47-biome` | `run`, the biome handler, tables | `biomeLinks` 50, `getEventBiomeLinks` 51, `speciesPools` 163, `trainerPool` 200 | 48 | 9 | 24 | 0 | 16 | no, given tables as data |
| `48-preview` | `run.scene`; the scene from `98-watch` | `executeWithSeedOffset` 32; `withBattle` 42–46; `genPartyMember` 139; `addEnemyPokemon` 150 | 44 | 32 | 9 | 12 | 10 | yes: generation |
| `49-ahead` | `run` | `isFixedBattle` 25, 52, `getBattleCount` 44 | 15 | 10 | 5 | 0 | 5 | no |
| `49-fusion` | `run`, the splice handler | `getSpeciesForm` 21, `selectFilter` 144–163 | 11 | 9 | 9 | 0 | 1 | no; its screen read moves down |
| `50-audit` | `run` | `getLearnableLevelMoves` 94; `getMaxExpLevel` 133 | 8 | 12 | 3 | 0 | 3 | no |
| `50-reroll` | the scene | `Phaser.Math.RND.state` 22, 36, 44; `gameRewardFns()` 76 | 25 | 6 | 14 | 0 | 6 | yes: reward generation |
| `51-items` | `run.scene` via `52-shop` | `getMaxExpLevel` 78, `getEvolutionLevels` 125, `getNature` 129 | 13 | 18 | 9 | 0 | 1 | no |
| `51-lead` | `run` | `isAllowedInBattle` 14 | 1 | 2 | 0 | 0 | 0 | no |
| `51-starters` | the scene | starter handler internals 316–443; `applyStarterSelectModify` 185 | 61 | 7 | 39 | 4 | 13 | yes for the screen and hooks |
| `52-shop` | `run`, the shop handler | `shopOptionsRows` 93, `isTmCompatible` 31–32, `getOrInferTier` 67 | 24 | 15 | 13 | 2 | 5 | no; its handler read moves down |
| `53-pivot` | the scene, `run` | `getCurrentPhase` 18; both parties 34 | 4 | 7 | 0 | 0 | 4 | no; its screen read moves down |
| `55-journal` | the scene | both parties 49–50; `mysteryEncounterSaveData` 62 | 10 | 1 | 4 | 0 | 6 | no |
| `56-boss-plan` | the scene | `hasVoucher` 10 | 1 | 1 | 1 | 0 | 0 | no |
| `57-oracle-line` | the scene, every frame | `oracleLineSeen` 145–166 on command identity; `liveOf` 168–173 plain | 21 | 7 | 7 | 0 | 12 | yes for the per-frame look |
| `60-card` | the scene; live party via `turn.facts` | `readCard` 140–183; `composeBattleCard` strips `pin` 48–50 | 7 | 0 | 1 | 0 | 6 | `readCard` yes; summaries no |
| `90-render` | the Phaser game via `CanvasPool` (13) | `battleScene` 12–15; sprites 25–33 | 1 | 0 | 0 | 1 | 0 | yes |
| `98-watch` | obtains the scene (205, 237, 263, 308, 342) | `detect(s)` 51; send-in 95–115; `accountRead` 177–194 | 15 | 2 | 3 | 0 | 10 | yes: the scene enters here |
| `99-start` | the Phaser game loop (70) | frame hook | 0 | 0 | 0 | 0 | 0 | yes |
| `00-prelude`, `01-meter`, `05-randbats`, `95-*`, `96-*`, `97-*` | none | — | 0 | 0 | 0 | 0 | 0 | no |
| **Total** | | | **876** | **449** | **419** | **93** | **243** | |

## Appendix B: tests per file

| File | Lines | Fakes imported | Game-shaped lines | Bucket | Why |
|---|---:|---|---:|---|---|
| plannertest | 2971 | fake-mon, fake-turn, game-proto, fake-page | 117 | P | the planner over `fakeTurn`; mons are inputs |
| judgmenttest | 1450 | fake-mon, fixtures/party, fake-page | 15 | P | team value, newcomer and fusion judgments |
| teamplantest | 716 | fake-mon, fake-turn, fake-fight, game-proto, fake-page | 37 | P | fight plan tables over `fakeTurn` |
| learntest | 576 | fake-mon, fake-page | 10 | P | learn advice takes a mon and a move |
| combatanttest | 529 | fake-mon, fake-page | 19 | P | builds a combatant from a member |
| rendertest | 519 | fake-mon, fake-page | 41 | P | renderers take a card; the scenes only build one |
| threatstest | 280 | fake-mon, fake-page | 9 | P | threat sets from tables and a level |
| partytest | 227 | fake-mon, fixtures/party, fake-page | 10 | P | party profile from types and moves |
| cardeventtest | 217 | fake-mon | 20 | P | the event over a card |
| leadtest | 201 | fake-mon, fixtures/party, fake-page | 4 | P | lead advice over the party |
| bossplantest | 67 | fake-page | 5 | P | a file name from seed, wave and trainer |
| encountertest | 1315 | fake-mon, game-proto, fake-page | 52 | M | the encounter's handler and options; judges members |
| shoptest | 638 | fake-mon, fake-page | 31 | M | offers are game modifier types; the reroll runs the game's generator |
| catchtest | 536 | fake-mon, game-proto, fake-page | 27 | M | catch odds from data; advice through a turn read |
| biometest | 524 | fake-mon, fake-page | 38 | M | the biome handler's options and spawn tables |
| aheadtest | 451 | fake-mon, fake-page | 27 | M | through a run read, with the preview replay |
| enginetest | 360 | game-proto, fake-fight, fake-page | 22 | M | move traits off moves, and a turn read |
| projectiontest | 343 | fixtures/party, fixtures/challenges, fake-page | 16 | M | party is data; the challenge hook is the game's |
| audittest | 342 | fake-mon, fake-page | 22 | M | through a run read and the shop |
| fusiontest | 300 | fake-mon, fake-page | 24 | M | the splice screen and species data |
| oraclelinetest | 996 | game-writes, fake-page | 23 | G | reads the battle's commands every frame |
| damagetest | 963 | game-proto, fake-page | 51 | G | the game's damage call, through a turn read |
| enemyaitest | 891 | game-proto | 39 | G | the game's own move pick and switch AI |
| decisiontest | 716 | fake-mon, game-writes | 25 | G | the per-frame look reads the scene |
| previewtest | 676 | fake-mon, fixtures/party, fake-page | 41 | G | the preview replays wave generation |
| startertest | 463 | fake-mon, fake-page | 15 | G | the starter screen and game data |
| battletest | 359 | fake-mon, game-proto, fake-page | 18 | G | a scene in, a card out |
| calendartest | 279 | fake-page | 6 | G | the game mode's wave predicates |
| journaltest | 268 | – | 14 | G | records the scene through an encounter |
| movetraitstest | 244 | fake-page | 8 | G | reads a game `Move`; would test the move half of the layer |
| gametablestest | 156 | – | 7 | G | imports the game's modules |
| runtest | 154 | fake-page | 20 | G | the reads' sandbox |
| grouptest | 446 | fake-page | 0 | N | renderers over plain cards |
| cardtest | 242 | fake-page | 2 | N | cards as object literals |
| metertest | 223 | – | 3 | N | the meter |
| watchtest | 106 | – | 0 | N | tests `scripts/watch.mjs`, not the HUD |

[measured lines and imports; inferred buckets]
