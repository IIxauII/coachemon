# How much of the HUD is derived from PokéRogue

Research for [#134](https://github.com/IIxauII/pokerogue-mcp/issues/134), a child of map [#98 "Map: HUD as a browser extension"](https://github.com/IIxauII/pokerogue-mcp/issues/98). It follows [#116](https://github.com/IIxauII/pokerogue-mcp/issues/116) ([`docs/research/agpl-apple-pla.md` on `research/agpl-apple-pla`](https://github.com/IIxauII/pokerogue-mcp/blob/research/agpl-apple-pla/docs/research/agpl-apple-pla.md)).

All sources retrieved **2026-09-16**.

> **This is a risk assessment, not legal advice.** It compares text with text and reports what matches, how closely, and how it got there. Where the line between a mechanic and its expression falls is a legal question. This document does not answer it. It only sets out the evidence someone answering it would need.

Every claim is labelled:

- **[primary]**: read directly from the upstream source, the served game build, this repo's files or its git history.
- **[inference]**: follows from primary sources, but no source says it in those words.

---

## 1. Answer

**About 4% of the HUD bundle (215 of 5,271 lines; 13.8 KB of 404 KB) follows PokéRogue's code closely enough to count as copied or closely paraphrased. Almost all of it is in `20-enemy-ai.js` (172 lines) and `10-damage.js` (17 lines).** The rest of the bundle calls the game's code or models mechanics in its own structure. **[primary]** for the diff, **[inference]** for the boundaries of each unit.

- **Copied, near-verbatim: 31 lines.**
  - `10-damage.js`:
    - `calculateBossSegmentDamage`, 11 lines. The file calls it "verbatim", and it is the minified build's function statement for statement.
    - The classic-final-boss damage cap, 1 line.
    - The Beat Up hit count, 2 lines.
  - Comments that quote the minified build word for word: 15 lines in `45-catch.js` and 2 in `47-biome.js`.
- **Close paraphrase: 184 lines.**
  - **`20-enemy-ai.js`, 172 lines.** Every part of the enemy AI's move and switch choice follows the game's code step by step, with the random draws replaced by exact probabilities:
    - `getMoveTargets`
    - `getNextTargets`
    - the step-7 move score
    - the KO filter, which is near-verbatim at its core
    - the opening steps of `getNextMove`
    - the `EnemyCommandPhase` switch rule, also near-verbatim at its core
  - One-line formulas in `10-damage.js`, `45-catch.js` and `48-preview.js` make up the other 12.
- **Independent re-implementation or game calls: everything else.** This covers:
  - all of `30-planner.js`, `35-team-plan.js`, `40-learn.js`, `49-ahead.js`, `50-shop.js` and the render files
  - `01-core.js`'s sandbox
  - the probability model around the damage call in `10-damage.js`
  - the closed-form AI chain in `20-enemy-ai.js`
  - `47-biome.js`, which imports the game's tables at runtime
  - `48-preview.js`, which calls the game's own methods in order
- **Not PokéRogue at all:** `05-randbats.js` is a snapshot of `pkmn/randbats`, which is MIT-licensed (§9).

**The copied part came from reading the served, minified build of v1.12.0.11, not the GitHub source.** Three marks survive in the HUD, and the source has none of them:

- the minifier's variable names `a` and `c`
- `0.1 ** (…)` where the source has `Math.pow(0.1, …)`
- a comma-expression `reduce` where the source has a block body

The build is compiled from the same `AGPL-3.0-only` files. **[primary]**

**Most of it can be reached at runtime instead of shipped. Some units are cheap to move and some are not:**

| Unit | Runtime route | Cost |
|---|---|---|
| Boss-segment clamp and final-boss cap | Call `EnemyPokemon.prototype.damage` on an `Object.create(enemy)` stub | Cheap |
| Hit counts (Beat Up, 2–5 hits) | `MultiHitAttr.getHitCount` under forced RNG | Cheap |
| `getMoveTargets` | Exported from the `loading-scene` chunk with its name intact | Cheap |
| `getNextTargets` | A prototype method; enumerate its one draw | Moderate |
| Switch rule | `phaseManager.create("EnemyCommandPhase", i).start()`, with `end` stubbed and turn commands restored | Moderate |
| Catch helpers, `randSeedInt`, `shiftCharCodes`, `getDexAttr` | Exported by name, or prototype methods | Cheap |
| **Move score and KO filter** | Only inside `getNextMove()`, one monolithic method that draws several RNG values (a target per move, then the choice chain) and rewrites the move queue. Getting its distribution means enumerating every draw by bisection. | **Expensive, and it reverses `game-code.md`'s "never call it" rule** |
| Quoted minified code in comments | Rewrite as prose, or strip comments in the extension build | Free |

None of the runtime routes has been tried on a live tab. §7 has the details. **[primary]** that the entry points exist in the served build. **[inference]** that the call patterns work.

`references/game-code.md` is not in the bundle, but it lives in the (public) repo. About 80 of its 775 lines quote minified game code. That includes the whole of `calculateBossSegmentDamage` and the KO filter (§8).

---

## 2. What was compared

| Source | Ref | Why |
|---|---|---|
| `pagefaultgames/pokerogue` at tag **`v1.12.0.11`** | **`e4e9b5383be7c9e171d32a9daaea2658d475c521`** | The repo's pinned game ref (`src/escape-ladder/reviewed.json`). All line numbers below are at this commit. |
| `pagefaultgames/pokerogue` `master` | **`e3e2778e60ea51c0d6defda5c3120c069f1fbfdf`** (2026-09-16, `package.json` 1.12.1.0) | Checks for drift. Of the compared units, only `getNextMove` changed: `move.name.endsWith(" (N)")` became `move.isUnimplemented`, and `20-enemy-ai.js:109` already accepts both. |
| Served build at `https://pokerogue.net` | `loading-scene-BqCzRPcm.js`, `battle-scene-BmkpVc5x.js`, `FadeOut-uwSF2QOP.js` | What the HUD was actually read from (`game-code.md:3–4`). `FadeOut-uwSF2QOP.js` carries the version string `1.12.0.11`, which matches the pin. |
| This repo, `research/hud-derivation` branched from `2f60886` | `skills/coach-pokerogue/scripts/hud/*.js`, `references/game-code.md`, `scripts/hud-deps.ts` | The bundle is every `hud/*.js` joined in name order, **comments included** (`scripts/hud-bundle.mjs`). |

**Upstream licence.** `REUSE.toml` gives `src/**/*.ts` the default `SPDX-License-Identifier: AGPL-3.0-only`, "SPDX-FileCopyrightText: 2024-2025 Pagefault Games". `src/utils/damage.ts` repeats that in its own header. `docs/enemy-ai.md`, a prose description of the same AI, is **`CC-BY-NC-SA-4.0`**, not AGPL. **[primary]**

**Existing index of dependencies.** `scripts/hud-deps.ts` already lists, per HUD module, every upstream function the HUD "re-implements" or "calls, or replays in order". It says `game-code.md` "was read off a live minified bundle rather than the pinned tag". That list was the starting point for this sweep. Each entry was then diffed, and the files it does not cover were read too. **[primary]**

---

## 3. How the derived units arrived (git history)

All authored commits are by `xau` (see #116 for the identity breakdown). **[primary]**

| Commit | Date | What arrived |
|---|---|---|
| `44ce05d` | 2026-09-15 14:55 | `hud.js`: "Replicates the game's EnemyCommandPhase rule (read from the live build)". The switch threshold `0.1 ** (1 / counter)` first appears here. |
| `1bb75f2` | 2026-09-15 15:00 | Swaps the replica of `getMatchupScore` for calls to the game's own functions. The threshold arithmetic stays. |
| `49ad8a9` | 2026-09-15 15:12 | Splits `hud.js` into `hud/*.js`. `10-damage.js` is still a pure approximation with no game code, and `20-enemy-ai.js` holds only `predictSwitches`. |
| `0d1e2bb` | 2026-09-15 15:36 | Adds `references/game-code.md` (564 lines): "Research into the live build…". §3 includes `calculateBossSegmentDamage` under "Module-private (re-implement verbatim; pure)", and §6 has `getNextMove` as "(verbatim logic)". |
| `01c3ee8` | 2026-09-15 16:08 | "**Built by four agents** on the module split, integrated and reviewed". Adds `bossSegmentDamage` ("verbatim boss-segment clamp") and the Beat Up expression to `10-damage.js`, and adds `aiMoveTargets`, `aiNextTargets`, `aiTargetScore`, `aiKoChance` and `aiDistribution` ("RNG-free enemyMoveDistribution replicating getNextMove") to `20-enemy-ai.js`. |
| `95cce69` | 2026-09-15 16:16 | `45-catch.js` ("catch agent"), including the header comments that quote the minified `AttemptCapturePhase` and `getCriticalCaptureChance`. |
| `1109c4a` | 2026-09-16 | Predicted Tera. It touches `20-enemy-ai.js` but adds no transcribed logic. |

`git log -S` confirms the first appearance of each marker string used in §5: `Math.log2(excess / segSize)`, `n?.status && n.status.effect !== 0 ? 0 : 1`, `x?.isActive(true)` and `let m=3*e.getMaxHp()`. **[primary]**

So the derived units arrived in two bursts on 2026-09-15:

1. A human-directed read of the minified build: the switch rule and `game-code.md`.
2. Agents that wrote modules from `game-code.md`: the damage clamp, the enemy AI and the catch formula.

The spec document was the intermediate step between the game and the code. **[inference]**

---

## 4. Per-file classification

Line counts are physical lines in the file at `2f60886`.

| File | Lines | Copied expression | Close paraphrase | Independent / calls the game | Upstream compared |
|---|---:|---:|---:|---|---|
| `00-prelude.js` | 8 | 0 | 0 | all | — |
| `01-core.js` | 119 | 0 | 0 | all. The type chart is Pokémon's public type chart. The `TYPES` order is the `PokemonType` enum. `sandbox` is the HUD's own mechanism. | `apply-ab-attrs.ts#applySingleAbAttrs` (motivation only) |
| `05-randbats.js` | 14 (75 KB) | — | — | not PokéRogue: generated `pkmn/randbats` snapshot, MIT | — |
| **`10-damage.js`** | 540 | **14** (L86–96, L124, L265, L268) | **3** (L105–106, L218) | 523: the probability model (`resolve`, `landHit` apart from L124, `applyHits`), turn-end HP, crit, accuracy and costs, all built around the game's own `getAttackDamage` | `utils/damage.ts#calculateBossSegmentDamage`, `field/pokemon.ts#EnemyPokemon.damage`, `data/moves/move.ts#MultiHitAttr.getHitCount`, `modifier/modifier.ts#EnemyTurnHealModifier.apply` |
| **`20-enemy-ai.js`** | 379 | 0 (near-verbatim cores inside paraphrased units: L141–145, L349–356) | **172** (L41–64, 66–92, 94–118, 120–130, 132–149, 195–215, 235, 324–327, 329–369) | 207: `forcedRng`/`withPick`, `aiChain` (closed form), the outcome enumeration in `aiDistribution` steps 5–8, `finish`, `approxDistribution`, caches, predicted Tera | `field/pokemon.ts#EnemyPokemon.getNextMove` (L6560), `#getNextTargets` (L6808), `data/moves/move-utils.ts#getMoveTargets` (L56), `phases/enemy-command-phase.ts#EnemyCommandPhase` |
| `30-planner.js` | 1136 | 0 | 0 | all. It models turn order, act chances, status tokens, item theft and boss-bar boosts from constants and prose (`game-code.md` §5, §8, §9), in its own structure. | `hud-deps.ts` entries for 30-planner |
| `35-team-plan.js` | 393 | 0 | 0 | all | — |
| `40-learn.js` | 494 | 0 | 0 | all. It reads attribute fields by name; its formulas are its own stand-ins. | `hud-deps.ts` entries for 40-learn |
| **`45-catch.js`** | 349 | **15** (comment quotes: L6–9, 13–14, 16–17, 19–21, 24, 27–28, 36) | **5** (L60, 63–64, 77–78) + **2** (L181–182) | 327: the closed-form P(catch), refusal rules, account and team value, ball choice | `phases/attempt-capture-phase.ts#AttemptCapturePhase.start` (L63–73), `data/pokeball.ts#getCriticalCaptureChance` (L91), `field/pokemon.ts#Pokemon.getDexAttr` (L605) |
| `47-biome.js` | 268 | **2** (comment quotes: L4–5) | 0 | 266. Tables are **imported from the game's chunks at runtime**; its own words: "Nothing is copied from the game." | `phases/select-biome-phase.ts`, `field/arena.ts#Arena.randomSpecies` |
| `48-preview.js` | 308 | 0 | **2** (L73 `randSeedInt`, L76 `shiftCharCodes`) | 306: calls the game's own methods in the game's order inside `executeWithSeedOffset` | `utils/common.ts#randSeedInt`, `#shiftCharCodes`, `battle-scene.ts#newBattle` |
| `49-ahead.js` | 238 | 0 | 0 | all. The one-line rules (`upgradeChance`, `isGym`) and the Eternatus facts are stated as arithmetic and prose. | `modifier-type.ts#getNewModifierTypeOption` and others |
| `50-shop.js` | 274 | 0 | 0 | all | — |
| `90-render.js` … `99-start.js` (7 files) | 751 | 0 | 0 | all (UI) | — |
| **Total** | **5,271** | **31** | **184** | 5,056 | |
| `references/game-code.md` (not bundled) | 775 | ~51 lines in fenced blocks and ~30 with inline fragments quote the minified build | §6 steps 1–8 and the `getNextTargets` paragraph restate the code step by step | the rest is analysis | the files above plus `move-effect-phase.ts#hitCheck`, `check-switch-phase.ts`, `pokemon.ts#getMoveType` and others |

Bytes: 2,756 copied and 11,067 paraphrased, so 13,823 of 404,428 (3.4%). Leaving out `05-randbats.js`, it is 13,823 of 329,096 (4.2%). **[primary]** for the counts; which lines belong to which bucket is **[inference]**, and the choice was to count against the project when in doubt.

The three classes, as used here:

- **Copied expression.** The HUD reproduces the upstream code's statements in order, with the same operators, constants and branch structure. Only names and trivial inlining differ.
- **Close paraphrase.** The same sequence of steps and the same conditions, re-expressed. Typically a random draw becomes a probability, or an early return becomes a branch.
- **Independent.** The HUD states a mechanic's facts (a constant, a threshold, an order of events) in a structure of its own, or calls the game's function instead.

Whether each class is protected expression is outside this document.

---

## 5. Side by side

Each unit shows three versions: the upstream TypeScript at `e4e9b538`, the served minified build, and the HUD at `2f60886`. Excerpts are trimmed with `…` only.

### 5.1 `10-damage.js` L86–96: boss segments — **copied**

Upstream `src/utils/damage.ts:22–67` (46 lines with JSDoc and comments):

```ts
export function calculateBossSegmentDamage(damage, currentHp, segmentHp, minSegmentIndex = 0, currentSegmentIndex?) {
  const segmentIndex = currentSegmentIndex ?? Math.ceil(currentHp / segmentHp) - 1;
  if (segmentIndex <= 0) { return [damage, 1]; }
  const segmentThreshold = segmentHp * segmentIndex;
  const roundedSegmentThreshold = Math.round(segmentThreshold);
  const remainingSegmentHp = currentHp - roundedSegmentThreshold;
  const leftoverDamage = damage - remainingSegmentHp;
  if (leftoverDamage < 0) { return [damage, segmentIndex + 1]; }
  if (leftoverDamage === 0) { return [damage, segmentIndex]; }
  const segmentsBypassed = Math.min(Math.max(Math.floor(Math.log2(leftoverDamage / segmentHp)), 0), segmentIndex - minSegmentIndex);
  const adjustedDamage = toDmgValue(currentHp - segmentThreshold + segmentHp * segmentsBypassed);
  const clearedBossSegmentIndex = segmentIndex - segmentsBypassed;
  return [adjustedDamage, clearedBossSegmentIndex];
}
```

Served `loading-scene-BqCzRPcm.js`:

```js
function calculateBossSegmentDamage(e,t,n,r=0,i){let a=i??Math.ceil(t/n)-1;if(a<=0)return[e,1];let o=n*a,s=e-(t-Math.round(o));if(s<0)return[e,a+1];if(s===0)return[e,a];let c=Math.min(Math.max(Math.floor(Math.log2(s/n)),0),a-r);return[N(t-o+n*c),a-c]}
```

HUD `10-damage.js:86–96`:

```js
  // EnemyPokemon's module-private calculateBossSegmentDamage, verbatim.
  const bossSegmentDamage = (dmg, hp, segSize, minIdx = 0, idx) => {
    const a = idx ?? Math.ceil(hp / segSize) - 1;
    if (a <= 0) return [dmg, 1];
    const floorHp = segSize * a;
    const excess = dmg - (hp - Math.round(floorHp));
    if (excess < 0) return [dmg, a + 1];
    if (excess === 0) return [dmg, a];
    const c = Math.min(Math.max(Math.floor(Math.log2(excess / segSize)), 0), a - minIdx);
    return [Math.max(Math.floor(hp - floorHp + segSize * c), 1), a - c];
  };
```

It matches statement for statement:

- the same signature, parameter order and defaults
- the same three early returns
- the same nested `Math.min(Math.max(Math.floor(Math.log2(…)),0), …)`
- `toDmgValue` inlined as `Math.max(Math.floor(x), 1)`, its body in `utils/common.ts`

The minifier's `a` and `c` are kept. `o` and `s` were renamed `floorHp` and `excess`. **[primary]**

The same function is reproduced in `game-code.md:230–239`, under the instruction "re-implement verbatim".

### 5.2 `10-damage.js` L124, L105–106: final-boss cap — **copied** (1 line) and **paraphrase** (2 lines)

- **Upstream** `EnemyPokemon.damage`: `if (globalScene.currentBattle.isClassicFinalBoss && this.formIndex === 0 && this.bossSegmentIndex < 1) { damage = Math.min(damage, this.hp - 1); }`
- **Upstream** `getMinimumSegmentIndex`: `if (globalScene.currentBattle.isClassicFinalBoss && !this.formIndex) { return 1; } return 0;`
- **HUD L124:** `if (f.finalBoss && st.idx < 1) d = Math.min(d, st.hp - 1);`
- **HUD L105–106:** `minIdx: s?.currentBattle?.isClassicFinalBoss && !t.formIndex ? 1 : 0` and `finalBoss: enemy && !!s?.currentBattle?.isClassicFinalBoss && !t.formIndex`

### 5.3 `10-damage.js` L265, L268: Beat Up hit count — **copied**

Upstream `move.ts:3018–3027`:

```ts
case MultiHitType.BEAT_UP: {
  const party = user.isPlayer() ? globalScene.getPlayerParty() : globalScene.getEnemyParty();
  return party.reduce((total, pokemon) => {
    return total + (pokemon.id === user.id ? 1 : pokemon?.status && pokemon.status.effect !== StatusEffect.NONE ? 0 : 1);
  }, 0);
}
```

HUD:

```js
const party = () => (atk.isPlayer?.() ? s.getPlayerParty() : s.getEnemyParty()) ?? [];
… party().reduce((t, n) => t + (n.id === atk.id ? 1 : n?.status && n.status.effect !== 0 ? 0 : 1), 0)
```

By contrast, the 2–5 hit table on L267 (`[{n:2,p:0.35},{n:3,p:0.35},{n:4,p:0.15},{n:5,p:0.15}]`) is the **closed form** of upstream's `randBattleSeedInt(20)` thresholds (`>= 13 → 2`, `>= 6 → 3`, `>= 3 → 4`, else 5). It is classed **independent**. **[primary]**

L218, the enemy wave heal, is a one-line **paraphrase**. Upstream has `Math.max(Math.floor(enemyPokemon.getMaxHp() / (100 / this.healPercent)) * this.stackCount, 1)` with `healPercent = 2`; the HUD has `Math.max(Math.floor(max / 50) * n, 1)`.

### 5.4 `20-enemy-ai.js` L41–64: `aiMoveTargets` — **close paraphrase** of `getMoveTargets`

Upstream `move-utils.ts:56–139` is a `switch (moveTarget)` over named `MoveTarget` members. HUD:

```js
  switch (t) {
    case 0: case 18: return [out([e], false)];
    case 19: if (!e.isOfType(7, { returnOriginalTypesIfStellar: true })) return [out([e], false)];
    // falls through: a Ghost's Curse targets like OTHER
    case 1: case 2: case 3: case 4: return [out(ally == null ? opponents : [...opponents, ally], t === 2 || t === 4)];
    case 5: case 6: case 8: case 16: return [out(opponents, t !== 5)];
    case 7: return opponents.length <= 1 ? [out([opponents[0]], false)] : opponents.map(o => out([o], false, 1 / opponents.length));
    …
```

Upstream, side by side:

```ts
    case MoveTarget.CURSE:
      if (!user.isOfType(PokemonType.GHOST, { returnOriginalTypesIfStellar: true })) { set = [user]; break; }
    case MoveTarget.NEAR_OTHER: case MoveTarget.OTHER: case MoveTarget.ALL_NEAR_OTHERS: case MoveTarget.ALL_OTHERS:
      set = ally == null ? opponents : opponents.concat([ally]);
      multiple = moveTarget === MoveTarget.ALL_NEAR_OTHERS || moveTarget === MoveTarget.ALL_OTHERS;
      break;
    case MoveTarget.NEAR_ENEMY: case MoveTarget.ALL_NEAR_ENEMIES: case MoveTarget.ALL_ENEMIES: case MoveTarget.ENEMY_SIDE:
      set = opponents; multiple = moveTarget !== MoveTarget.NEAR_ENEMY; break;
    case MoveTarget.RANDOM_NEAR_ENEMY:
      set = [opponents[user.randBattleSeedInt(opponents.length)]]; break;
  …
  return { targets: set.filter(p => p?.isActive(true)).map(p => p.getBattlerIndex()).filter(t => t !== undefined), multiple };
```

They share:

- the case grouping
- the intentional fall-through from CURSE
- each `multiple` expression
- the `VariableTargetAttr` loop (HUD L45–46)
- the final `filter(isActive(true)).map(getBattlerIndex).filter(!== undefined)` chain (HUD L50, near-verbatim)

The one real change is `RANDOM_NEAR_ENEMY`, where a draw becomes one outcome per opponent. **[primary]**

### 5.5 `20-enemy-ai.js` L66–92: `aiNextTargets` — **close paraphrase** of `getNextTargets`

| Step | Upstream `pokemon.ts:6808+` | HUD |
|---|---|---|
| score | `move.getTargetBenefitScore(this, p, move) * (p.isPlayer() === this.isPlayer() ? 1 : -1)` | `mv.getTargetBenefitScore(e, p, mv) * (p.isPlayer() === e.isPlayer() ? 1 : -1)` |
| sort | `return scoreA < scoreB ? 1 : scoreA > scoreB ? -1 : 0;` | `(a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)` |
| empty | `if (move.hasAttr("CounterDamageAttr")) return [BattlerIndex.ATTACKER]; return [];` | `targets: aiHas(mv, "CounterDamageAttr") ? [-1] : []` |
| shift | `if (lowestWeight < 1) { … targetWeights[w] += Math.abs(lowestWeight - 1); }` | `if (lowest < 1) w = w.map(x => x + Math.abs(lowest - 1));` |
| cut | `targetWeights.findIndex(s => s < targetWeights[0] / 2)` | `w.findIndex(x => x < w[0] / 2)` |
| cumulate | `targetWeights.reduce((total, w) => { total += w; thresholds.push(total); totalWeight = total; return total; }, 0)` · minified: `a.reduce((e,t)=>(e+=t,c.push(e),l=e,e),0)` | `w.reduce((t, x) => (t += x, cum.push(t), t), 0)` |
| draw | `randBattleSeedInt(totalWeight)`, then `thresholds.every(...)` | the exact probability of each index |

The HUD's cumulate step has the **comma-expression form of the minified build**, not the block body of the source. **[primary]**

### 5.6 `20-enemy-ai.js` L94–149: move score and KO filter — **close paraphrase**, near-verbatim core

Upstream `getNextMove`, KO filter (`pokemon.ts`, step 5):

```ts
const doesNotFail =
  !globalScene.arena.isMoveWeatherCancelled(this, move)
  && !globalScene.arena.isMoveTerrainCancelled(this, [p.getBattlerIndex()], move)
  && (move.applyConditions(this, p, -1) || [MoveId.SUCKER_PUNCH, MoveId.UPPER_HAND, MoveId.THUNDERCLAP].includes(move.id));
return doesNotFail && p.getAttackDamage({ source: this, move, ignoreAbility: !p.waveData.abilityRevealed,
  ignoreSourceAbility: false, ignoreAllyAbility: !p.getAlly()?.waveData.abilityRevealed, ignoreSourceAllyAbility: false,
  isCritical, simulated: true }).damage >= p.hp;
```

HUD `aiKoChance`, L141–145:

```js
!s.arena.isMoveWeatherCancelled(e, mv) && !s.arena.isMoveTerrainCancelled(e, [p.getBattlerIndex()], mv)
  && (mv.applyConditions(e, p, -1) || NO_CONDITION_CHECK.includes(mv.id))
  && p.getAttackDamage({ source: e, move: mv, ignoreAbility: !p.waveData.abilityRevealed, ignoreSourceAbility: false,
    ignoreAllyAbility: !p.getAlly?.()?.waveData.abilityRevealed, ignoreSourceAllyAbility: false, isCritical: crit, simulated: true }).damage >= p.hp);
```

The conjunction order, the object literal and the key order are the same. Most of the tokens are the game's own call interface (method names and `getAttackDamage`'s parameter object), so the HUD could not call the function without them. The chosen *combination* and *order* are what match. **[primary]** for the match, **[inference]** for the interface point.

The step-7 score (upstream) against `aiTargetScore` (HUD L98–107):

```ts
let targetScore = move.getUserBenefitScore(this, target, move)
  + move.getTargetBenefitScore(this, target, move) * (mt < BattlerIndex.ENEMY === this.isPlayer() ? 1 : -1);
if (Number.isNaN(targetScore)) { … targetScore = 0; }
… else if (move.is("AttackMove")) {
  const effectiveness = target.getMoveEffectiveness(this, move, !target.waveData.abilityRevealed, undefined, undefined, true);
  if (target.isPlayer() !== this.isPlayer()) { targetScore *= effectiveness; if (this.isOfType(move.type)) targetScore *= 1.5; }
  else if (effectiveness) { targetScore /= effectiveness; if (this.isOfType(move.type)) targetScore /= 1.5; }
  if (!targetScore) targetScore = -20;
}
```

```js
let n = mv.getUserBenefitScore(e, p, mv) + mv.getTargetBenefitScore(e, p, mv) * ((bi < 2) === e.isPlayer() ? 1 : -1);
if (Number.isNaN(n)) n = 0;
… if (!isAttackMove(mv)) return n;
const eff = p.getMoveEffectiveness(e, mv, !p.waveData.abilityRevealed, undefined, undefined, true);
if (p.isPlayer() !== e.isPlayer()) { x *= eff; if (e.isOfType(mv.type)) x *= 1.5; }
else if (eff) { x /= eff; if (e.isOfType(mv.type)) x /= 1.5; }
return x || -20;
```

The HUD reorders the unimplemented, condition and weather checks so that a condition which draws (consecutive Protect) can branch. `aiMoveOptions` (L120–130) keeps upstream's "break at the attacker index −1, then `Math.max` over targets". `aiDistribution` L195–215 follows `getNextMove`'s opening in order:

1. the queued move, with `isVirtual`/`isIgnorePP` as `useMode >= 3` / `>= 2`
2. the usable pool
3. Struggle
4. a single move
5. Encore
6. `RANDOM` (uniform)

Its sort on L235 reuses the same comparator. **[primary]**

**Independent** in the same file:

- **`aiChain` (L151–166).** It replaces upstream's two `while` loops (`randBattleSeedInt(8) >= 5`, and `randBattleSeedInt(100) < Math.round(ratio * 50)`) with the product of per-step advance probabilities.
- **The KO-pass × target × condition outcome enumeration (L217–243).** It has no counterpart in the game.

### 5.7 `20-enemy-ai.js` L324–369: switch rule — **close paraphrase**, near-verbatim core

Upstream `enemy-command-phase.ts:58–84`:

```ts
if (trainer && enemyPokemon.getMoveQueue().length === 0) {
  const opponents = enemyPokemon.getOpponents();
  if (!enemyPokemon.isTrapped()) {
    const partyMemberScores = trainer.getPartyMemberMatchupScores(enemyPokemon.trainerSlot, true);
    if (partyMemberScores.length > 0) {
      const matchupScores = opponents.map(opp => enemyPokemon.getMatchupScore(opp));
      const matchupScore = matchupScores.reduce((total, score) => (total += score), 0) / matchupScores.length;
      const sortedPartyMemberScores = trainer.getSortedPartyMemberMatchupScores(partyMemberScores);
      const switchMultiplier = 1 - (battle.enemySwitchCounter ? Math.pow(0.1, 1 / battle.enemySwitchCounter) : 0);
      if (sortedPartyMemberScores[0][1] * switchMultiplier >= matchupScore * (trainer.config.isBoss ? 2 : 3)) {
        const index = trainer.getNextSummonIndex(enemyPokemon.trainerSlot, partyMemberScores);
```

Minified: `…w=1-(t.enemySwitchCounter?.1**(1/t.enemySwitchCounter):0);if(C[0][1]*w>=S*(m.config.isBoss?2:3)){let v=m.getNextSummonIndex(e.trainerSlot,y);…`

HUD L349–358:

```js
if (!e.getMoveQueue().length && !e.isTrapped()) {
  const scores = tr.getPartyMemberMatchupScores(e.trainerSlot, true);
  if (scores.length) {
    const own = e.getOpponents().map(o => e.getMatchupScore(o));
    const avg = own.reduce((t, x) => t + x, 0) / own.length;
    const best = tr.getSortedPartyMemberMatchupScores(scores)[0][1];
    const w = 1 - (counter ? 0.1 ** (1 / counter) : 0);
    if (best * w >= avg * (tr.config.isBoss ? 2 : 3)) {
      switched = true;
      const to = enemies[tr.getNextSummonIndex(e.trainerSlot, scores)];
```

The counter update on L364 (`switched ? counter + 1 : Math.max(counter - 1, 0)`) folds upstream's `enemySwitchCounter++` and `Math.max(enemySwitchCounter - 1, 0)`. `skipsTurn` (L324–327) restates the constructor's `mysteryEncounter?.skipEnemyBattleTurns` and `start()`'s Commander check. The `0.1 **` form is the minified build's, not the source's `Math.pow`. **[primary]**

### 5.8 `45-catch.js`: capture — **copied** in comments, **paraphrase** in code

The header comments (L6–9, 13–14, 16–17, 19–21, 24, 27–28, 36) quote the minified build directly, for example:

```
//   B.pokeballCounts[this.pokeballType]--; let m=3*e.getMaxHp(),v=2*e.hp,y=e.species.catchRate,
//   x=getPokeballCatchMultiplier(ball), S=e.status?getStatusEffectCatchRateMultiplier(e.status.effect):1,
//   C=e.isShiny()?timedEventManager.getShinyCatchMultiplier():1, w=Math.round((m-v)*y*x/m*S*C),
//   E=Math.round(65536/(255/w)**.1875), O=getCriticalCaptureChance(w), k=e.randBattleSeedInt(256)<O
```

The code restates the two arithmetic lines. Upstream `attempt-capture-phase.ts:69–72`: `Math.round((((_3m - _2h) * catchRate * pokeballMultiplier) / _3m) * statusMultiplier * shinyMultiplier)`, and `Math.round(65536 / Math.pow(255 / modifiedCatchRate, 0.1875)); // Formula taken from gen 6`. HUD L60 and L63:

```js
const w = Math.round((m - 2 * hp) * catchRate * mult / m * (STATUS_MULT[status] ?? 1) * (shiny ? shinyMult : 1));
const shake = Math.min(1, Math.round(65536 / (255 / w) ** 0.1875) / 65536);
```

- **L78** restates `getCriticalCaptureChance`'s ternary ladder: `isDaily || n > 800 ? 2.5 : n > 600 ? 2 : n > 400 ? 1.5 : n > 200 ? 1 : n > 100 ? 0.5 : 0`.
- **L181–182** restate `Pokemon.getDexAttr` with its enum constants resolved.
- **Independent:** combining shake and critical capture into `c·s + (1−c)·s³` (L65).

Upstream's own comment attributes the shake formula to the mainline games ("gen 6"). **[primary]**

### 5.9 `47-biome.js` L4–5 and `48-preview.js` L73, L76

- **`47-biome.js` L4–5** quote `` `let{biomeLinks:v}=allBiomes.get(arena.biomeId)` `` and a `ui.setMode(15 …)` fragment. Everything else in the file is independent, and the data comes from the game at runtime.
- **`48-preview.js` L73** `const rnd = range => (range <= 1 ? 0 : Phaser.Math.RND.integerInRange(0, range - 1));` restates `utils/common.ts:101–106` (`if (range <= 1) return min; return Phaser.Math.RND.integerInRange(min, range - 1 + min);`). Its comment says "the same three lines".
- **`48-preview.js` L76** restates `shiftCharCodes` (a per-character `charCodeAt(i) + shiftCount` loop) as a `map`.

---

## 6. Who wrote the upstream units

GitHub blame at `e4e9b538` (`repository.object.blame` via `gh api graphql`) shows the **last commit to touch each line**. A move or reformat resets the attribution, so this is a lower bound on the number of hands, not a record of who wrote each line first. **[primary]**

| Upstream unit | Lines by last-touching author |
|---|---|
| `EnemyPokemon.getNextMove` (L6560–6806) | Flashfyre 63, innerthunder 58, Bertie690 41, DayKev 35, SirzBenjie 17, Greenlamp2 8, cmampbell 8, torranx 4, bennybroseph 4, Xavion3 4, td76099 3, schmidtc1 2 |
| `EnemyPokemon.getNextTargets` (L6808–6880) | Flashfyre 49, innerthunder 12, Greenlamp2 6, bennybroseph 4, SirzBenjie 1, torranx 1 |
| `EnemyCommandPhase.start` (L41–105) | f-fsantos 43, innerthunder 8, torranx 5, ben-lear 4, Xavion3 3, emdeann 1, Bertie690 1 |
| `getMoveTargets` (L56–139) | SirzBenjie 67, Bertie690 12, DayKev 5 |
| `calculateBossSegmentDamage` (`utils/damage.ts` L22–67) | SirzBenjie 46 (commits #6574 "Refactor boss health segment calculation to improve clarity" and #6609) |
| capture formula (`attempt-capture-phase.ts` L63–73) | Fontbane 6, f-fsantos 5 |

So the paraphrased enemy-AI code draws on lines last touched by at least 15 distinct contributors. **[inference]** from the table.

---

## 7. Can it be reached at runtime instead?

**The model.** `47-biome.js` re-`import()`s the game's already-loaded Vite chunks (`/assets/<name>-<hash>.js` from `performance.getEntriesByType("resource")`). The browser returns the same module instances without re-running them, and the HUD picks exports by shape or by `function.name`. The served build keeps function and class names. Two other routes need no import at all:

- prototype methods, reached through a live object
- `s.phaseManager.create(name, …)`, which looks phases up in the `PhaseMap`

**[primary]** (`47-biome.js:17–21, 58–74`, and the served chunks).

The routes below were **checked against the served v1.12.0.11 chunks and the pinned source. None was run on a live tab.**

### 7.1 Per unit

| Unit (lines) | Reachable? | Route | What it costs |
|---|---|---|---|
| **`bossSegmentDamage` + final-boss cap** (10-damage L86–96, 105–106, 124; 14 lines) | **Not exported.** Its one occurrence is module-private inside `loading-scene-BqCzRPcm.js`. The source exports it from `#utils/damage` (at the pin and on `master`), but a Vite chunk re-exports only what other chunks import. | **Indirectly, yes.** Call `Object.getPrototypeOf(enemy).damage.call(stub, d, ohko, /*preventEndure*/ true, /*ignoreFaintPhase*/ true)`. The stub is `Object.create(enemy, { hp, bossSegmentIndex, battleInfo: { updateBossSegments(){} }, handleBossSegmentCleared: i => … })`. In the served build that method runs `calculateBossSegmentDamage`, the final-boss cap and `super.damage`. With those two flags, `super.damage` only does `Math.min` and `this.hp -= e` on the stub, and it reports the cleared index through `handleBossSegmentCleared`. | Cheap: one call per hit. The HUD then depends on `damage`'s signature and on its side-effect surface (`battleInfo.updateBossSegments`, `handleBossSegmentCleared`). Both are already on the drift list (`hud-deps.ts`). Mock tests (`damagetest.mjs` builds bosses from plain fields) need a `damage` stand-in. |
| **Beat Up / 2–5 hit counts** (L265–268) | Yes. `MultiHitAttr` is an instance on `move.attrs`. | Call `mh.getHitCount(atk, def)` inside `sandbox` + `forcedRng`, with `withPick` enumerating `randBattleSeedInt(20)`'s 20 values. That gives the full distribution, with Skill Link applied by the game's own `applyAbAttrs`. | 20 calls per multi-hit move per turn key. It would also retire the independent 0.35/0.15 table. |
| **`aiMoveTargets`** (L41–64) | **Yes, exported:** `getMoveTargets as Io` from `loading-scene-BqCzRPcm.js`, with `function getMoveTargets` named. | Scan for it like `47-biome.js` does (`v.name === "getMoveTargets"`). Call it under `forcedRng`, picking each opponent for `RANDOM_NEAR_ENEMY`. | Async, so the first ticks have no targets. It depends on Vite continuing to export it across chunks, which is a bundling detail and not an API. |
| **`aiNextTargets`** (L66–92) | Yes: `EnemyPokemon.prototype.getNextTargets`. | Call `e.getNextTargets(moveId)` under `forcedRng` and enumerate its one draw, either every pick in `[0, ceil(total))` or a bisection for each threshold. It also covers `getMoveTargets`. | Up to `ceil(Σw)` calls, or `O(log Σw)` per boundary with bisection. The last bucket's weight is fractional when the weights are. |
| **Step 7 score, KO filter, `aiMoveOptions`, steps 1–4** (L94–149, 195–215, 235; 78 lines) | **Only inside `EnemyPokemon.getNextMove()`**, a single ~250-line method. | Call `e.getNextMove()` inside `sandbox` + `forcedRng`, save and restore `summonData.moveQueue` (it `splice`s or clears the queue), mute its four `console.log`s (`quiet` exists in `48-preview.js`), and enumerate each draw. At v1.12.0.11 every draw on that path is a threshold comparison: `>= 5` of 8, `< Math.round(ratio*50)` of 100, the cumulative `every` of `getNextTargets`, and `Protect`'s `=== 0`. Bisecting each draw's pick therefore finds the branch boundaries, and each leaf's probability is the product of the widths. | **Expensive, and it overturns a written rule.** `game-code.md` §6 and "Unsafe to call" say "never call it". The enumeration is correct only while every draw stays a monotone threshold, and a change there would make it silently wrong rather than throw. Calls grow with the draw tree. Mock tests would test only the enumerator. |
| **`predictSwitches` + `skipsTurn`** (L324–369; 45 lines) | Yes: `s.phaseManager.create("EnemyCommandPhase", fieldIndex)` (the served `create(e,...t){let m=Rf[e];…return new m(...t)}`). | Call `.start()` on the instance with `end` shadowed to a no-op and `enemy.getNextMove` shadowed, or run it under the enumeration above. Save and restore `currentBattle.turnCommands`, `preTurnCommands` and `enemySwitchCounter`. Read `turnCommands[fieldIndex + 2]`: `command === 2` means a switch, with `cursor`. Running slot 0 then slot 1 before restoring gives the doubles counter sequencing for free. | Moderate. It is exposed to refactors of turn-command storage (the served `battle-scene` already has a `turnCommandManager`). `Phase.end()` calls `phaseManager.shiftPhase()`, so a missed stub would advance the real game, which is worse than a wrong number. |
| **Catch formula** (45-catch L60, 63–64, 77–78) | Partly. `getCriticalCaptureChance as wa`, `getPokeballCatchMultiplier as Ea` and `getStatusEffectCatchRateMultiplier as Ka` are exported with names intact. The modified catch rate and shake probability are inline in `AttemptCapturePhase.start`, which spends a ball, draws and tweens. | Import the three helpers. The two arithmetic lines have no callable home. | Cheap for the helpers. Two lines of formula remain (upstream attributes one of them to "gen 6"). |
| **`getDexAttr` restatement** (45-catch L181–182) | Yes: `Pokemon.prototype.getDexAttr`. | `foe.getDexAttr()`. It reads `globalScene.gameData.getFormAttr`. | Trivial. |
| **`randSeedInt`, `shiftCharCodes`** (48-preview L73, L76) | **Yes, exported by name:** `randSeedInt as $` and `shiftCharCodes as at` from `FadeOut-uwSF2QOP.js`. | Scan for them by name. | Trivial. It also contradicts `hud-deps.ts`, which says "minification drops their names". In the v1.12.0.11 served build it does not. |
| **Enemy wave heal** (10-damage L218) | Partly: `EnemyTurnHealModifier` instances carry `healPercent`, and `apply` heals for real. | Read `healPercent` and `stackCount`. The one-line formula stays. | Trivial. |
| **Comment quotes** (45-catch, 47-biome; 17 lines) | n/a | Rewrite them as prose descriptions, or strip comments when building the extension bundle (`hud-bundle.mjs` keeps them today). | Free. |

### 7.2 What moving costs in general

**[inference]** throughout.

- **Version tracking changes shape.** The copies are pinned to v1.12.0.11 and guarded by `npm run drift:check` hashes. If a body changes upstream, the HUD is quietly wrong until the next pin bump. A runtime call follows whatever build `pokerogue.net` serves, so a changed *rule* is picked up for free. A changed *interface* (a signature, a side effect the stub doesn't cover, an export renamed or merged by the bundler) throws, or with `Phase.end`, acts on the game. The drift list would have to record entry points and export shapes, not bodies.
- **Which game version.** The live build and the pin are both 1.12.0.11 today (the `FadeOut` chunk's version string). `master` is at 1.12.1.0. The only difference among the compared units is `isUnimplemented`.
- **Fallbacks can't be the copy.** Wherever a game call is missing (mocks, outside the command phase, an async import still loading), the HUD today falls back on its own approximation or a copied helper. Taking the copy out of the bundle means those paths use the approximation or show nothing.
- **Tests.** `damagetest.mjs`, `enemyaitest.mjs` and `enginetest.mjs` run the copied logic against mocked game objects. After a move they would test orchestration only, unless the mocks re-create the game's logic, and a mock that does that is the copy again, moved into `test/`. Whether test files ship is a packaging choice, but they are in the public repo either way.
- **Budget.** Everything except the `getNextMove` enumeration is cheap. That one is the only unit where the runtime route costs more than keeping the code. It holds 78 of the 184 paraphrased lines.

### 7.3 What stays if everything cheap moves

Say the cheap routes are taken, the comments are rewritten, and `getNextMove` stays paraphrased. Then **about 81 lines remain**: `aiTargetScore`, `aiKoChance`, `aiMoveOptions` and the step 1–4 skeleton (78 lines), plus three one-line formulas (the capture arithmetic on 45-catch L60 and L63, and the heal on 10-damage L218). All 31 copied lines and the other ~103 paraphrased lines leave the bundle. If `getNextMove` is enumerated at runtime too, only those three one-line formulas are left. **[inference]**

---

## 8. `references/game-code.md`

**[primary]** throughout.

- **Not bundled.** `hud-bundle.mjs` reads only `hud/*.js`. The file is a skill reference that the coach loads. It is in the repo, which GitHub reports public (#116).
- **Quoted minified code:**
  - About 51 lines sit in fenced blocks: `applySingleAbAttrs`, `getHitCount`, `EnemyPokemon.damage`, `calculateBossSegmentDamage` (in full, L230–239), `getMoveType`, `hitCheck`, the KO filter (L360–367), `EnemyCommandPhase.start` (L435–442) and `CheckSwitchPhase.start` (L603–608).
  - About 30 more lines carry inline fragments, for example L94, L193, L344 and L395–396.
- **Restated step by step:** §6 steps 1–8 and the `getNextTargets` paragraph.
- **The rest** (the side-effect analysis, safe/unsafe call lists, turn order, the preview and calendar sections) is analysis in its own words, with short quotes.

---

## 9. Not PokéRogue, but also third-party

`05-randbats.js` is "a trimmed pkmn/randbats snapshot (MIT)", generated by `scripts/gen-randbats.ts` (its header). It is not derived from PokéRogue. As shipped, it carries no copy of the MIT notice. **[primary]**

---

## 10. What this does not settle

- **Where the idea/expression line falls** for:
  - a statement-for-statement copy of an 11-line arithmetic function
  - a probability re-expression that keeps another program's step order, conditions and call interface
  - formulas the game itself attributes to the mainline Pokémon games

  That is a question for a lawyer, not for a diff.
- **Whether the path through a minified build matters.** The HUD was read off the compiled output of the same AGPL-3.0-only source. This document records the path; it does not assess its effect.
- **Agent authorship.** `01c3ee8` and `95cce69` say the derived modules were written by agents working from `game-code.md`. #116 counted human authors, and what authorship means for agent-written lines was not asked there either.
- **`docs/enemy-ai.md` is CC-BY-NC-SA-4.0.** A re-implementation written from that prose rather than from the code would carry that licence's terms on anything taken from its wording. It is not an AGPL-free spec by default.
- **None of the runtime routes in §7 has run on a live tab.**
