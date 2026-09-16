# Can the game's own code do our calculations?

The question (the user's words): *"since pokerogue is a public repo, couldn't we do a bunch of the calculation & prediction & other data all from the game's files? … I'm worried that our approach is not a carbon copy of what the game will calculate due to us building duplicated methods that already exist possibly publicly in the game code js."*

All sources retrieved **2026-09-16**. This builds on [#134](https://github.com/IIxauII/pokerogue-mcp/issues/134) ([`docs/research/hud-derivation.md` on `research/hud-derivation`](https://github.com/IIxauII/pokerogue-mcp/blob/research/hud-derivation/docs/research/hud-derivation.md)). That note looked at the same code for **licence** exposure. This one looks at **fidelity**: does what we compute match what the game does?

Location: research notes in this repo live at `docs/research/<topic>.md` on `research/*` branches (`research/hud-derivation`, `research/agpl-apple-pla`, …). None of them is on `master` yet, so this file follows that convention.

Claims are tagged **[verified]** (read from source or the served build, or run here), **[inference]** (follows from sources, but not run), or **[unverified]** (plausible, never tried on a live tab).

---

## 1. TL;DR

**Mostly, we already do.** The live coach HUD runs the game's own functions inside the player's tab for the numbers that matter most:

- `Pokemon.getAttackDamage` (simulated), `getMoveEffectiveness`, `getEffectiveStat` and `getMoveType`
- move priority and the move-scoring functions
- `canSetStatus` and `getMatchupScore`
- the biome tables
- the wave generator itself

The MCP server (the play loop) calculates nothing: it reads the scene and presses buttons. **[verified]**

**What we re-implement is the glue between those calls.** The game has no side-effect-free function for any of these:

- the damage-roll, crit, accuracy and hit-count distributions
- the boss-bar clamp and survival effects (Sturdy, Focus Band, the enemy's endure token)
- turn order
- the enemy AI's choice procedure
- the catch odds
- Mystery Encounter outcomes
- turn-end HP

On top of that there is a hand-written type chart used by every estimate path. **Your worry is justified for exactly these parts**, and there are real divergences today (§4c):

1. **Sturdy vs fixed-damage moves.** On the live build (1.12.0.11), Seismic Toss, Night Shade, Dragon Rage and Final Gambit skip Sturdy. The HUD assumes Sturdy always holds. **[verified]**
2. **Speed ties.** The HUD treats them as 50/50. The game breaks them with a shuffle seeded per turn, so the result is fixed and callable (`sortInSpeedOrder` is exported by name). **[verified]** that the tie is seeded; **[unverified]** that the call reproduces it.
3. **Damage rolls.** The HUD scales the max-roll result by 85–100 %. The game applies the roll *before* several post-multipliers and caps, so values can be off by a HP or two, and False Swipe's spread is wrong outright. **[verified]**
4. **The type chart.** It matches the game in all 324 cells. **[verified]** The wrapper around it doesn't: it ignores the Inverse Battle challenge, Scrappy, Freeze-Dry, strong winds, Tar Shot and Tera/Stellar, and it folds Thick Fat and Filter into "effectiveness". **[verified]**
5. **Upstream drift.** Upstream `master` is 133 commits past our pin. **18 of the 150** game functions the HUD depends on have already changed there. **[verified]**

**A finding that changes one decision.** In battles, the game's RNG restarts every turn from a seed stored on the battle (`battleSeed` plus the turn number). In a single battle, nothing draws from it between the command prompt and the enemy's decision. So a sandboxed call to the game's own `EnemyPokemon.getNextMove()` at the command prompt would return **the move the enemy is actually about to use**, not a random sample. `game-code.md:518` rules the call out because it "returns one sample". **[verified]** from source; **[unverified]** on a live tab.

### Recommendation

1. **Keep calling the live game; don't import or port its code into what we ship.**
   - A live call always matches whatever build pokerogue.net serves.
   - An offline copy has to be re-synced to that build anyway. It also drags in Phaser, jsdom, i18n and two asset submodules, and the source is AGPL-3.0-only.
2. **Replace re-implementations with live calls where it's cheap.** Priority: speed ties, hit counts, the boss clamp, `effectiveness()` for mons on the field, and the preview's `randSeedInt`/`shiftCharCodes`. Also fix the two concrete bugs (Sturdy vs fixed damage, and rolls on capped damage).
3. **Use PokéRogue's own headless test harness as a dev-only oracle.** Run it at pin bump (vitest runs whole battles in Node): script battle scenarios, record the game's real outcomes, and compare them with the HUD's numbers. The drift check then goes from "a hash moved, re-read the code" to "the numbers still match".
4. **Score predictions against what actually happens in play,** the way the 🔮 preview already scores itself: damage dealt, enemy move and turn order.
5. **Decide [#136](https://github.com/IIxauII/pokerogue-mcp/issues/136) with the finding above in hand.** In singles, calling `getNextMove()` gives the enemy's real choice. It makes the replica unnecessary, and it moves the coach from odds to certainty, which is a product call for you.

---

## 2. What was compared

| Source | Ref |
|---|---|
| This repo | worktree branch `worktree-research-game-code-reuse` @ `91d66ec` (v0.12.1) |
| Game pin (`src/escape-ladder/reviewed.json:2-6`) | `v1.12.0.11` = [`e4e9b538`](https://github.com/pagefaultgames/pokerogue/tree/e4e9b5383be7c9e171d32a9daaea2658d475c521), committed 2026-08-23 |
| Upstream `master`, shallow clone | [`9468ffb0`](https://github.com/pagefaultgames/pokerogue/tree/9468ffb04a77dc67e613fe5792872823a8dec1c0) (2026-09-16, `package.json` 1.12.1.0, 133 commits ahead of the pin, 0 behind) |
| Served build, pokerogue.net | `FadeOut-uwSF2QOP.js` carries `1.12.0.11`; `loading-scene-BqCzRPcm.js`, `battle-scene-BmkpVc5x.js` (fetched 2026-09-16) |

The live site and the pin are the same version today. Game permalinks below are at `master` `9468ffb0` unless marked **pin** (then at `e4e9b538`).

---

## 3. How we compute things today

### 3.1 How we reach the game

- **The server.** It finds Phaser's module-level `CanvasPool`, reads `.parent.game` off the pool entry that has one, then calls `game.scene.getScene('battle')`. That object is the game's `globalScene` (`README.md:68-87`, `src/game/js.ts:14-15`). It reads and presses; it holds no game logic (`README.md:110`; non-goal "Reimplementing game rules", `README.md:130`; `CONTEXT.md:23` "a snapshot is … never computed or simulated").
- **The HUD.** `skills/coach-pokerogue/scripts/hud/*.js` is bundled into one IIFE and injected into the page (`hud/00-prelude.js:1-2`), so it holds live references to the game's objects and calls their prototype methods directly (`10-damage.js:32`, `10-damage.js:311`).
- **Module-private tables.** `47-biome.js` reaches these by re-`import()`ing the Vite chunks the page already loaded. The browser returns the same module instances, and the HUD picks exports by shape or by `function.name` (`47-biome.js:16-22`, `47-biome.js:68-75`).
- **The sandbox.** Every game call runs inside `sandbox` (`01-core.js:92-121`). It mutes the phase queue and restores Phaser's RNG state, the battle seed state, `abilitiesApplied` and `turnData`. Calls are only made while the game waits on a decision (`01-core.js:126-133`).
- **Drift tracking.** `scripts/hud-deps.ts` names, per HUD module, every game function the module calls or re-implements (`hud-deps.ts:11-21`). `npm run drift:check` hashes each one, printed without comments, at a candidate tag. It refuses to move the shared pin until every module whose deps moved has been re-read and re-stamped (`scripts/drift.ts:1-24`; the same deal as ADR 0001, `docs/adr/0001-escape-ladder-hand-curated-checked-at-pin-bump.md`). Commit `1f64e87` added `49-ahead.js`'s 17 refs to that list.

### 3.2 Inventory

Column meanings:

- **Now**:
  - **call**: runs the game's function live
  - **re-impl**: our own code restating the game's rule
  - **own**: no game counterpart
- **Feasibility**:
  - **live-call**: route it through the game at runtime
  - **port**: keep a copy of the game's rule, drift-checked
  - **keep custom**: nothing in the game to call

| Our code | What it computes | Game equivalent | Now | Feasibility | Drift risk |
|---|---|---|---|---|---|
| `src/game/js.ts` | settled snapshot, menus | `BattleScene` fields, UI handlers | reads | — | low (escape-ladder drift check) |
| `01-core.js:4-51` `CHART`, `ABILITY_IMMUNE`, `effectiveness()` | type × type, ability immunities, Filter/Thick Fat/Heatproof/Wonder Guard | [`Pokemon.getAttackTypeEffectiveness`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L2726), [`getMoveEffectiveness`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L2643), [`getTypeDamageMultiplier`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/data/type.ts#L19-L23) (module-private in the served build) | re-impl; used by the fallback damage path and by team-plan, catch, learn, biome, ahead, encounter, render (`10-damage.js:482`, `35-team-plan.js:101-102`, `45-catch.js:153-173`, `40-learn.js:89,323-326`, `47-biome.js:177,192`, `49-ahead.js:102-118`, `46-encounter.js:110-111`, `90-render.js:230-234`) | **live-call** for mons that exist (`getAttackTypeEffectiveness` in sandbox); keep the chart only for hypothetical species, with the Inverse Battle challenge applied | chart identical (324/324 at pin and at master); **wrapper diverges** (§4c.3) |
| `01-core.js:92-121` `sandbox` | undo the game's hidden writes | none | own | keep custom | medium: must track new impurities (`hud-deps.ts:41`) |
| `10-damage.js:275-463` `fromGame` | per-move damage outcome | [`getAttackDamage`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3679) (simulated) | **call** | already reused | low for the call itself |
| `10-damage.js:261-266` `addRolls` | 16-value damage roll | roll inside `getAttackDamage` ([L3815](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3815)), fixed at 1.0 when simulated | re-impl | keep custom (no hook), but fix the order (§4c.2) | **medium: already wrong for False Swipe** |
| `10-damage.js:325-331` crit | P(crit) from stage | [`getCriticalHitResult`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3953) (draws); `getCritStage` called live | re-impl + call | live-call `getCriticalHitResult` under `forcedRng`, enumerating the draw | low–medium |
| `10-damage.js:361-369` accuracy | P(hit) | `MoveEffectPhase.hitCheck` (draws); `calculateBattleAccuracy` and `getAccuracyMultiplier` called live | re-impl + call | keep (hitCheck is phase-bound) | medium |
| `10-damage.js:292-303` hit counts | 2–5, Beat Up, Parental Bond, Multi-Lens | `MultiHitAttr.getHitCount` (draws) | re-impl | **live-call** under `forcedRng` enumerating 20 values (#134 §7.1) | low–medium |
| `10-damage.js:87-132` boss clamp, Sturdy, Focus Band, endure | per-hit resolution | [`EnemyPokemon.damage`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L7075), `calculateBossSegmentDamage`, `PreDefendFullHpEndureAbAttr` | re-impl (clamp copied verbatim) | **live-call** the clamp via `EnemyPokemon.prototype.damage` on a stub (#134 §7.1); fix Sturdy | **high: already wrong on live (§4c.1)** |
| `10-damage.js:215-255` `endOfTurnHp` | turn-end chip and heals | `WeatherEffectPhase`, `PostTurnStatusEffectPhase`, `BerryPhase`, `TurnEndPhase` | re-impl | keep custom (spans phases); check with the offline oracle | medium (`TurnEndPhase.start` moved on master; the value is equivalent) |
| `10-damage.js:468-506` `approx` | estimate outside the command phase | `getAttackDamage` | own estimate | **live-call** in other idle phases, e.g. LearnMove and rewards **[unverified]** safe | high by design |
| `20-enemy-ai.js:169,278` `aiDistribution`, `enemyMoveDistribution` | P(move, target) | [`EnemyPokemon.getNextMove`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L6717), [`getNextTargets`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L6965) | re-impl skeleton; scoring pieces called | **live-call** `getNextMove()` in sandbox (singles: the exact choice, §4a.4) or enumerate draws (#134) | medium (moved on master: a refactor, same behaviour) |
| `20-enemy-ai.js:335` `predictSwitches` | trainer switch | [`EnemyCommandPhase.start`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/enemy-command-phase.ts#L58-L84) | re-impl; calls `getMatchupScore` and friends | live-call via `phaseManager.create` with `end` stubbed (#134, moderate risk) | low–medium |
| `30-planner.js:96-113` `actionOrder` | P(a moves first) | [`MovePhasePriorityQueue`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/queues/move-phase-priority-queue.ts#L23-L36), [`sortInSpeedOrder`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/utils/speed-order.ts#L21-L42), `BypassSpeedChanceModifier` | re-impl; priority and speed called | **live-call** `sortInSpeedOrder` (exported) for ties **[unverified]**; Quick Claw stays odds | medium: ties modelled wrong (§4c.4) |
| `30-planner.js:244-300` status model | status immunity, sleep/freeze turns lost | `canSetStatus` (called when live), `MovePhase` status checks | re-impl + call | keep (expectations over future turns) | medium |
| `30-planner.js:417,534,699` KO curve, exchange, `fieldPlan`, consistency prior | strategy | none | own | keep custom | n/a |
| `35-team-plan.js:202,389` | whole-fight beam search | none; `getMatchupScore` called (`35-team-plan.js:92`) | own + call | keep custom | low |
| `40-learn.js` | learn / forget / TM value | none (the game has no player advice) | own; reads attr fields and enum numbers | keep custom; generate enums (#94) | medium (`HealAttr`, `StatStageChangeAttr` constructors moved on master) |
| `45-catch.js:51-62` `captureChance` | P(catch) per ball | inline in [`AttemptCapturePhase.start`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/attempt-capture-phase.ts#L64-L89) and its shake loop; [`getCriticalCaptureChance`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/data/pokeball.ts#L91-L111) | re-impl (checked equal, §4c.5) | **port** (no callable home); live-call the exported helpers | low |
| `46-encounter.js` | outcomes of 12 Mystery Encounters | async closures in `src/data/mystery-encounters/encounters/*` | re-impl | keep/port (the closures can't be called safely) | **high**: 4 encounter files moved on master (spot-checked: renames only) |
| `47-biome.js` | biome ranking | `allBiomes` and the species registry, imported at runtime | **call** (tables) + own scoring | already reused | low |
| `48-preview.js` | next-wave preview | `newBattle` draw sequence, replayed with game calls | **call** + 2 one-liners (`48-preview.js:73,76`) | live-call `randSeedInt`/`shiftCharCodes`: exported by name in the `FadeOut` chunk (the comment at `hud-deps.ts:222` is wrong) | medium: draw order (`genPartyMember`, `getPartyLevels`, `EnemyPokemon` constructor moved on master) |
| `49-ahead.js` | big-fight calendar, luck, final boss | `gameMode.*` (called), [`getNewModifierTypeOption`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/modifier/modifier-type.ts#L2798-L2811) | call + re-impl one-liners (`49-ahead.js:53,68`) | keep | medium (`classicFixedBattles` moved on master) |
| `50-shop.js` | reward judgement | none | own | keep custom | low |
| `05-randbats.js` | moveset prior | none (`pkmn/randbats` Showdown sets) | external data | keep custom | n/a |

**Game data tables we hold ourselves:** the `TYPES` order and `CHART`, `ABILITY_IMMUNE`/`TRAPS` ability-name lists (`01-core.js:2-78`), ball multipliers and `STATUS_MULT` (`45-catch.js:43-50`), the encounter and nature name tables (`46-encounter.js:30-40`), and a set of enum numbers (#94). No species, move or learnset tables: those are read off live objects.

---

## 4. Feasibility findings

### 4a. Is the game code reachable from page JS at runtime?

**Yes, and the repo already proves it.**

1. **Names survive minification on purpose.** Upstream's Vite/rolldown config sets `keepNames: true` and `mangle: { keepNames: true }, compress: { keepNames: { class: true, function: true } }` ([`vite.config.ts#L46-L54`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/vite.config.ts#L46-L54)). In the served chunk you can read `AttemptCapturePhase=class extends PokemonPhase` and `function getCriticalCaptureChance(e){…}`. **[verified]**
   - What changes between builds is the **export alias** (`getMoveTargets as Io`, `sortInSpeedOrder as Mo`, `getCriticalCaptureChance as wa`, `randSeedInt as $`, `shiftCharCodes as at`), so scan by `function.name`, never by alias. **[verified]** in the served chunks.
   - Enums are **inlined as numbers** by `unplugin-inline-enum` ([`vite.config.ts#L69`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/vite.config.ts#L69)), so enum names don't exist at runtime. That's why the HUD hard-codes numbers (#94).
2. **Nothing is deliberately put on `window` except `gameInfo`** ([`battle-scene.ts#L3231`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/battle-scene.ts#L3231)). `globalScene` is a module export ([`global-scene.ts#L3`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/globals/global-scene.ts#L3)). The `CanvasPool` scan is the way in (#9, `README.md:68-87`). **[verified]**
3. **Calling methods on live Pokémon works, but "simulated" is not side-effect-free.**
   - `getAttackDamage({…, simulated = true})` defaults to simulated ([`pokemon.ts#L3679-L3689`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3679-L3689)). Simulated, it pins the roll at 1.0 ([L3815](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3815)). It still calls [`getMoveTargets`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3786), which draws battle RNG for Outrage-type targeting in doubles ([`move-utils.ts#L94`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/data/moves/move-utils.ts#L94)).
   - Several internal ability calls omit `simulated` and write `abilitiesApplied`, and Tera Shell writes `turnData` (`game-code.md` §0).
   - Hence `sandbox` (`01-core.js:92-121`), with a breach counter that should stay 0 (`01-core.js:91,119`).
   - Calling a phase's `start()` for real is dangerous: `Phase.end()` moves the real queue forward (#134 §7.1).
4. **The enemy's move this turn is already decided at the command prompt (singles).**
   - `Battle.randSeedInt` re-sows from `shiftCharCodes(battleSeed, turn << 6)` whenever `battleSeedState` is null ([`battle.ts#L493-L511`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/battle.ts#L493-L511)). `incrementTurn()` nulls it ([L173-L178](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/battle.ts#L173-L178)), and it is called from `TurnEndPhase` ([`turn-end-phase.ts#L27`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/turn-end-phase.ts#L27)).
   - `battleSeed` itself is a seeded `randomString(16, true)` ([`battle.ts#L81`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/battle.ts#L81), [`common.ts#L21-L31`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/utils/common.ts#L21-L31)).
   - `TurnInitPhase` queues player `CommandPhase`s, then `EnemyCommandPhase`s ([`turn-init-phase.ts#L59-L75`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/turn-init-phase.ts#L59-L75)). `EnemyCommandPhase` then calls `getNextMove()` ([`enemy-command-phase.ts#L91`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/enemy-command-phase.ts#L91)), whose draws (`randBattleSeedInt(8)`, `(100)`, the target draw) come off that stream ([`pokemon.ts#L6913-L6923`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L6913-L6923), [L7031](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L7031)).
   - The player's `CommandPhase` draws only through `getMoveTargets` ([`command-phase.ts#L279`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/command-phase.ts#L279)), and that draws only for random-target moves with two or more opponents. In a single battle `randSeedInt(1)` returns without drawing ([`common.ts#L102-L107`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/utils/common.ts#L102-L107)).
   - The trainer's send-in tie-break is a seed fork ([`trainer.ts#L619-L622`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/trainer.ts#L619-L622)).
   - **So** in singles, `sandbox(s, () => enemy.getNextMove())`, with `summonData.moveQueue` saved and restored, should return exactly what `EnemyCommandPhase` will pick. The game's own tests call `getNextMove()` directly ([`test/tests/ai/enemy-command.test.ts#L21-L33`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/test/tests/ai/enemy-command.test.ts#L21-L33)). **[verified]** from source. **[unverified]** live: it needs an arrival check. In doubles, the player's random-target move choice can shift the stream first.
   - The rest of the turn (hit, crit, roll) is on the same stream, but its draw order depends on both commands and on speed order, so it can't be read off before the turn without running the turn's phases. **[inference]**
5. **Speed ties are seeded too.** `sortInSpeedOrder` shuffles inside `executeWithSeedOffset(…, turn * 1000 + groups, waveSeed)` before a stable speed sort ([`speed-order.ts#L21-L42`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/utils/speed-order.ts#L21-L42)). The move queue re-sorts with it on every pop ([`pokemon-phase-priority-queue.ts#L6-L8`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/queues/pokemon-phase-priority-queue.ts#L6-L8), [`move-phase-priority-queue.ts#L73-L80`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/queues/move-phase-priority-queue.ts#L73-L80)). `game-code.md:332` calls this "deterministic per turn but not queryable". It is queryable: `sortInSpeedOrder` is exported by name from `loading-scene` (`as Mo`). **[verified]** the export; **[unverified]** that a two-mon call reproduces the queue's grouping.

### 4b. Can we import the game's TS modules offline in Node?

**Technically yes, but not as a product dependency.**

- **It works:** upstream runs 457 test files that play whole battles headlessly. The setup is vitest with `environment: "jsdom"` ([`vitest.config.ts#L36`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/vitest.config.ts#L36)), `vitest-canvas-mock`, msw serving locale JSON, and `new Phaser.Game({ type: Phaser.HEADLESS })` ([`enemy-command.test.ts#L40-L44`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/test/tests/ai/enemy-command.test.ts#L40-L44)). A `GameManager` offers overrides, `classicMode.startBattle`, `move.select` and `forceEnemyMove` ([`test/framework/game-manager.ts`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/test/framework/game-manager.ts), [`test/helpers/move-helper.ts`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/test/helpers/move-helper.ts)), and `RngHelper` mocks both RNGs ([`rng-helper.ts#L28-L47`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/test/helpers/rng-helper.ts#L28-L47)). **[verified]** from source; not run here.
- **What it costs:**
  - Node ≥ 24.9 and pnpm 10 ([`package.json#L98-L101`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/package.json#L98-L101)).
  - `#`-alias path resolution through Vite.
  - Two git submodules, `assets` and `locales` ([`.gitmodules`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/.gitmodules)).
  - `src` is 11 MB.
  - Our repo runs `.ts` directly on Node ≥ 23.6 with two runtime deps (`package.json`).
- **Version match:** an offline copy is only right for the build it was cloned at. The live site can move while a copy stands still. Live calls can't have that problem.
- **Licence:** `src/**/*.ts` and `test/**/*.ts` are `AGPL-3.0-only` ([`REUSE.toml#L9-L38`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/REUSE.toml#L9-L38)).
  - **Calling the code the user's browser already loaded from pokerogue.net** copies nothing into our bundle.
  - **Importing or porting TS into what we ship** makes it derived code, the exposure #134, [#116](https://github.com/IIxauII/pokerogue-mcp/issues/116) and [#135](https://github.com/IIxauII/pokerogue-mcp/issues/135) are about.
  - **A dev-only harness that isn't shipped** is the lower-exposure middle. **[inference]**, not legal advice.

**Verdict:** use the offline harness as a **test oracle** at pin bump, not as a runtime engine.

### 4c. Where our logic diverges, or could, from the game's

**1. Sturdy vs fixed-damage moves: wrong on the live build today.**

- **Pin / live:** the `FixedDamageAttr` branch returns before `PreDefendFullHpEndureAbAttr` is applied ([pin `pokemon.ts#L3604-L3621`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/field/pokemon.ts#L3604-L3621)). The served chunk matches: `if(applyMoveAttrs(\`FixedDamageAttr\`…),g.value){…return{cancelled:!1,result:1,damage:g.value}}`. No STURDY tag is set, so `Pokemon.damage` lets the hit KO.
- **Upstream fix:** [#7620](https://github.com/pagefaultgames/pokerogue/pull/7620) "Sturdy now applies to moves that deal fixed damage" is on master ([`pokemon.ts#L3739-L3747`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3739-L3747)) but not yet released.
- **HUD:** `targetFacts.sturdy` and `landHit` apply Sturdy to every hit at full HP (`10-damage.js:107,126`). Against live 1.12.0.11, it says a full-HP Sturdy mon survives a Seismic Toss, Night Shade or Final Gambit that the game lets through.
- **Why it matters:** a hand model mirrors *mainline* behaviour. The game's own call mirrors *the game*.

**2. Damage rolls: applied after the caps instead of before.**

- **Game:** `randomMultiplier` sits inside the main product before `toDmgValue` ([L3815-L3877](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3815-L3877)). After that come the Enemy Damage Booster/Reducer tokens ([L3891-L3894](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3891-L3894)), `ReceivedMoveDamageMultiplierAbAttr` (Multiscale, Fluffy…, [L3906](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3906)) and `ModifiedDamageAttr` ([L3916](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L3916)), each re-floored.
- **HUD:** takes the finished max-roll value and scales it: `floor(max × r / 100)` (`10-damage.js:261-266`).
- **Effect on multipliers:** off by a HP or so (`game-code.md:139` already estimates ≤ 2 HP).
- **Effect on False Swipe (`SurviveDamageAttr`: `Math.min(damage, target.hp - 1)`, [`move.ts#L2171-L2174`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/data/moves/move.ts#L2171-L2174)):** a structural error. The game leaves exactly 1 HP whenever the uncapped roll reaches `hp - 1`; the HUD spreads the capped value across 85–100 %. **[verified]** by reading.

**3. The type-chart wrapper.**

- `chartcheck`: every one of the 324 attack × defence cells in `CHART` (`01-core.js:4-23`) equals the game's `getTypeChartMultiplier`, at both the pin and master. **[verified]** by script.
- `effectiveness()` (`01-core.js:42-51`) differs from [`getAttackTypeEffectiveness`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L2726-L2787) and [`getMoveEffectiveness`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/field/pokemon.ts#L2643-L2717). It:
  - ignores the **Inverse Battle** challenge (`applyChallenges(TYPE_EFFECTIVENESS)`, [`type.ts#L19-L23`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/data/type.ts#L19-L23))
  - ignores Scrappy and Mind's Eye, Foresight and Miracle Eye (`checkIgnoreTypeImmunity`)
  - ignores Freeze-Dry and Flying Press (`MoveTypeChartOverrideAttr`), strong winds, Tar Shot, Stellar/Tera and forced grounding (Gravity, Smack Down)
  - puts Thick Fat, Heatproof and Filter into the effectiveness figure, where the game applies them as damage modifiers. So a 2× hit into Filter reads as 1.5×, not super effective.
- These are only estimates on the damage path. But team-plan, catch, learn, biome, ahead and encounter judge *only* through this wrapper (inventory row 2).

**4. Speed ties.**

`actionOrder` returns 0.5 on a tie (`30-planner.js:109`). The game's outcome is fixed and reproducible (§4a.5). Speed is also re-sorted on every pop in the game, so a mid-turn speed change (Icy Wind, Quick Claw) reorders the rest of the turn. The HUD computes one order. **[verified]** by reading.

**5. Catch: matches.**

`captureChance` (`45-catch.js:51-62`) reproduces:

- the modified catch rate and shake probability ([`attempt-capture-phase.ts#L64-L73`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/attempt-capture-phase.ts#L64-L73))
- the critical roll ([L89](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/attempt-capture-phase.ts#L89))
- the 3-vs-1 shake checks ([L150-L165](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/phases/attempt-capture-phase.ts#L150-L165))
- the Catching Charm `1.5 + stack/2` and the dex-count ladder ([`pokeball.ts#L91-L111`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/src/data/pokeball.ts#L91-L111))

The HUD's `c·s + (1−c)·s³` is the exact closed form. None of its deps moved on master. This is the model case of a port that's fine to keep. **[verified]**

**6. Upstream drift has already started.**

`node scripts/drift.ts --source <master clone> --only hud`, run from a scratch copy, reports **18 moved of 150 HUD deps**:

- `getAttackDamage` and `getMoveEffectiveness` (behaviour changes: the Sturdy fix and a refactor of type immunity)
- `getNextMove` (`move.name.endsWith(" (N)")` → `move.isUnimplemented`, same behaviour; `20-enemy-ai.js` accepts both per #134)
- `toDmgValue` (lost its `minValue` parameter)
- `TurnEndPhase.start` (Leftovers `maxHp >> 4` → `toDmgValue(maxHp / 16)`, the same value)
- `EnemyPokemon.constructor`, `Trainer.genPartyMember`, `Trainer.getPartyLevels` (the preview's replay path)
- `classicFixedBattles`, `CheckSwitchPhase.start`, `SelectBiomePhase.start`, `Pokemon.isTrapped`
- `HealAttr` and `StatStageChangeAttr` constructors
- four Mystery Encounter files (spot-checked Part-Timer and Fiery Fallout: import moves and parameter renames only)

The drift check catches all of it at pin bump. Until then, **the live-called parts pick up changes for free and the re-implemented parts don't**. The Sturdy case shows the reverse can also bite: the HUD already assumes a rule the live game doesn't have yet. **[verified]**

### 4d. What can't come from the game's code, and what should

**Can't (keep custom):**

- **Strategy.** The game has no player advisor. That covers `fieldPlan`, `exchange`, `koCurve`, the consistency prior (`30-planner.js:417-699`), the team-plan beam search (`35-team-plan.js:202,389`), learn/TM value, shop, biome and encounter judgement, and catch *worth*.
- **Odds over future turns.** The game resolves one draw per event. Distributions over rolls, crits, accuracy, status turns and turn-end HP have to be ours, though each piece can be checked against the game.
- **Information the game doesn't hold.** The randbats moveset prior (`05-randbats.js`), and anything about a species the run hasn't built an object for yet. The biome card's hypothetical spawns still need a chart, but the game's species registry and pools can supply the data (already done).
- **Async closures and phase-bound logic.** Mystery Encounter option closures, `hitCheck` and the turn-end phases can't be called without running the game forward. Port them, and verify them with the offline oracle.
- **The sandbox itself.**

**Should come from the game (live calls):**

- effectiveness for mons that exist
- the boss-bar clamp and final-boss cap (`EnemyPokemon.prototype.damage` on a stub)
- multi-hit counts and crit (enumerate the forced draw)
- speed ties (`sortInSpeedOrder`)
- `getMoveTargets`
- the preview's `randSeedInt`/`shiftCharCodes`
- the exported catch helpers
- in singles, the enemy's move (`getNextMove`)

Most of these routes are laid out in #134 §7.1. None has run on a live tab.

---

## 5. Risks and tradeoffs of leaning further on live calls

- **Bundler, not API.** Class and function names survive only because upstream's build keeps them ([`vite.config.ts#L46-L54`](https://github.com/pagefaultgames/pokerogue/blob/9468ffb04a77dc67e613fe5792872823a8dec1c0/vite.config.ts#L46-L54)). If that config changes, every name-based route breaks at once. It fails loudly, not silently, so pair it with a "game calls unavailable" state rather than fallback copies. Export aliases change every build, so always scan by `function.name`.
- **Side effects.** Every new call path needs its impurities mapped into `sandbox`. `getNextMove` splices or clears `summonData.moveQueue` (`pokemon.ts#L6720-L6733`), and a stubbed `Phase.start()` that misses `end` would advance the real game. Keep the breach counter, and add `moveQueue` to what it restores.
- **RNG.** Anything that draws must run under `sandbox`, or under `forcedRng` if we want every branch. The singles `getNextMove` shortcut depends on nothing drawing before `EnemyCommandPhase`. A future upstream change could quietly break that, so it needs an arrival check (predicted vs actual) running permanently, like the preview's tally.
- **Version churn.** A live call follows the served build: a changed *rule* comes free, a changed *signature* throws. A port follows the pin: a changed rule is silently wrong until the next bump. Today pin and live match (1.12.0.11), and master is 133 commits ahead with 18 HUD deps moved. The next release will exercise both failure modes.
- **When calls may run.** Game calls are currently limited to Command, CheckSwitch and faint-switch (`01-core.js:126-133`). The learn, rewards and biome cards therefore use the chart estimate. Widening that to other idle UI phases is plausible, but nobody has checked which of them are safe.
- **Tests.** The HUD's golden tests run against mocks (`skills/coach-pokerogue/scripts/test/*.mjs`). As logic moves into live calls, mock tests cover only orchestration. The offline oracle is what would test the numbers again.
- **Product character.** Exact enemy moves (and in principle exact speed ties) turn the coach from odds into foreknowledge. The 🔮 preview already sets that precedent for waves (`CONTEXT.md` "Preview"). It's still your call per card.

---

## 6. Recommended next steps

1. **Fix the two concrete bugs.**
   - Sturdy: skip it for `FixedDamageAttr` hits while the live build predates #7620, keyed on `gameVersion` (`10-damage.js:107,126`).
   - False Swipe: roll the uncapped damage, then cap (`10-damage.js:261-266,351-353`). Better still, derive every roll from the game's own sequence (next step).
2. **Prototype `getNextMove()` in sandbox (singles)** against the live tab, logging predicted vs actual enemy moves over a few waves. If it holds, feed that into [#136](https://github.com/IIxauII/pokerogue-mcp/issues/136) and correct `game-code.md:405,518`.
3. **Take the cheap live-call routes** in this order: effectiveness for real mons, speed ties via `sortInSpeedOrder`, hit counts, the boss clamp, and the preview's `randSeedInt`/`shiftCharCodes`. Correct the claim at `hud-deps.ts:222` that minification drops their names.
4. **Build a dev-only differential oracle** on upstream's vitest harness at the pinned tag:
   - scenario files: species, level, items, ability, move, field
   - run them with `RngHelper.equalSample` to get the real roll, crit and hit-count distributions, the enemy move distribution, the catch rate and turn-end HP
   - compare with the HUD modules run on the same state
   - run it as part of `drift:check --stamp`, so a stamp means the numbers still match, not only that the code was re-read

   Keep it outside the shipped plugin (licence, §4b).
5. **Arrival scoring for battle predictions**, like `window.__coachHud.preview()`: damage dealt vs `perHit`, first mover vs `actionOrder`, enemy move vs distribution.
6. **Generate the HUD's enum numbers from the pinned tag** (#94), since inlined enums leave no names to read at runtime.

**Unverified in this note:** every live-tab route (§4a.4 `getNextMove` exactness, §4a.5 `sortInSpeedOrder` reproduction, the #134 stub routes), the safety of widening game calls to other idle phases, and the offline harness (read, not run).
