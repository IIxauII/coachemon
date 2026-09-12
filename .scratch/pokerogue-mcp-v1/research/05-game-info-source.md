# `window.gameInfo`: producer, versioning, consumers, and localization

**Question:** ticket [#10](https://github.com/IIxauII/pokerogue-mcp/issues/10), source half, refocused to Q1 (write events), Q2 (version pinning), Q5 (consumers), plus the localization question.
**Source:** `pagefaultgames/pokerogue` at tag `v1.12.0.11`, commit `e4e9b5383be7c9e171d32a9daaea2658d475c521`. Full checkout, full git history (6707 commits). All line refs at that commit.
**Superseded:** Q4 is dropped — the peer session's `CanvasPool → parent → TextureManager → .game` route reaches the live scene, so everything `gameInfo` lacks is directly readable. Q3 is a brief enumeration only.

## Verdict

Three findings that change how `gameInfo` should be used:

1. **The observed write set is complete**, and the mechanism is the most fragile of the three candidates: **seven direct method calls**, no Phaser event subscription, no save-path hook. Three of the seven are **vestigial** — they exist to publish a field that was deleted in 2026 — and can be removed upstream without anyone noticing.
2. **`reset()` does rewrite to Title**, unconditionally. So a run lost without a wipe reports Title *byte-identically* to a wipe. `gameInfo` cannot distinguish them.
3. **The payload is partly localized and partly not**, split field by field with no marker. `biome`, `gameMode`, `ability`, `passiveAbility`, `moveset` and `name` go through i18next and follow the player's `prLang`. `nature`, `types`, `teraType`, `status`, `gender` do **not** — they are TS enum member names, lowercased and re-capitalized, and are stable identifiers. `form` is a raw identifier. An English capture cannot tell these apart, and two of the localized fields carry extra hazards beyond translation.

---

## 1. The write-event list

### The producer

`BattleScene.updateGameInfo()` — [`src/battle-scene.ts:3083`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3083). It constructs a fresh object and assigns it:

```ts
    // TODO: Don't store it here
    window["gameInfo"] = gameInfo;
```
— [`battle-scene.ts:3263-3264`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3263-L3264)

### Mechanism: none of the three candidates

**Not a Phaser event subscription.** `BattleScene` does own an event bus — `public readonly eventTarget: EventTarget` ([`battle-scene.ts:354`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L354)) with `MOVE_USED`, `TURN_INIT`, `TURN_END`, `NEW_ARENA` ([`src/events/battle-scene.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/events/battle-scene.ts)) — but `updateGameInfo` is **not subscribed to any of it**. Repo-wide, every `addEventListener` call is a DOM/touch-control one; nothing listens on `eventTarget` for this purpose.

**Not a save-path hook.** `saveAll` ([`game-data.ts:1315`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1315)) and `getSessionSaveData` ([`:882`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L882)) never touch it.

**Two of the seven are phase hooks**, in the loose sense of being the first statement of a `Phase.start()` override. The other five are plain method calls from the scene and the UI. There is no indirection anywhere — which is why the set is small and why it is fragile.

### All seven call sites

| # | Site | Trigger | Status |
|---|---|---|---|
| 1 | `BattleScene` constructor — [`battle-scene.ts:363`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L363) | Once at boot | Seeds the Title payload |
| 2 | `BattleScene.reset()` — [`battle-scene.ts:1216`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1216) | Every return-to-title path | **Live** — see §1.3 |
| 3 | `EncounterPhase.start()` — [`encounter-phase.ts:55`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L55) | Once per wave, at wave start | **Live** |
| 4 | `CommandPhase.start()` — [`command-phase.ts:172`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/command-phase.ts#L172) | Once per command prompt, per field slot | **Live** |
| 5 | `UI.setModeInternal` chain push — [`ui.ts:545`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L545) | `setOverlayMode` only | **Vestigial** |
| 6 | `UI.resetModeChain()` — [`ui.ts:597`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L597) | Mode chain cleared | **Vestigial** |
| 7 | `UI.revertMode()` — [`ui.ts:611`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L611) | Popping out of an overlay | **Vestigial** |

Sites 3 and 4, quoted:

```ts
  start() {
    super.start();

    globalScene.updateGameInfo();

    globalScene.initSession();
```
— `EncounterPhase.start()`, [`encounter-phase.ts:52-57`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L52-L57). `NextEncounterPhase` and `NewBiomeEncounterPhase` subclass it and share this, so it fires once per wave regardless of wave type.

```ts
  public override start(): void {
    super.start();

    globalScene.updateGameInfo();
    this.resetCursorIfNeeded();
```
— `CommandPhase.start()`, [`command-phase.ts:169-173`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/command-phase.ts#L169-L173). Note it is *above* the `turnCommands[...].skip` early-return at [`:181-184`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/command-phase.ts#L181-L184), so it writes even for command phases that are immediately skipped.

### The three `ui.ts` sites are dead weight

Added by [`0df40893`](https://github.com/pagefaultgames/pokerogue/commit/0df40893b24920462c2a23b31a825a5615e3692d) (2024-08-24, *"Add modeChain to gameInfo for debug purposes"*), which also added `modeChain: this.ui?.getModeChain() ?? []` to the payload. The 2.0.0 rewrite [`f32a580e`](https://github.com/pagefaultgames/pokerogue/commit/f32a580e7438e634fcfd33d3bb04c1ef957d3ca7) **deleted `modeChain` from the payload and left all three calls behind**. `UI.getModeChain()` ([`ui.ts:641`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L641)) now has zero callers repo-wide.

They still refresh the whole payload, so they are not inert — but nothing UI-related is published and nothing depends on them. **Do not build on sites 5-7.** They are the most likely thing in this file to be deleted by a passing cleanup.

Site 5 also has a falsy-zero guard:

```ts
          if (chainMode && this.mode && !clear) {
            this.modeChain.push(this.mode);
            globalScene.updateGameInfo();
          }
```
— [`ui.ts:543-546`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L543-L546). `UiMode.MESSAGE` is `0` ([`src/enums/ui-mode.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/ui-mode.ts)), so an overlay pushed on top of `MESSAGE` skips the write.

### The measurements reconcile exactly

| Measured live | Source explanation |
|---|---|
| Updates at a wave transition, **twice, ~1.5-3 s apart** | Site 3 (`EncounterPhase.start()`) then site 4 (`CommandPhase.start()`) for that wave's first turn. The gap is the summon / check-switch animation sequence between them. |
| Updates "at turn init" | Site 4. **Not** the `TURN_INIT` event — `TurnInitPhase` dispatches `TurnInitEvent` at [`turn-init-phase.ts:49`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/turn-init-phase.ts#L49) and pushes `CommandPhase` at [`:68`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/turn-init-phase.ts#L68); the coincidence is causal, not a subscription. |
| No update on a damage-dealing turn | Correct. No damage, faint, status, stat-stage, HP-restore or switch path calls it. |
| No update on the faint/EXP/level-up chain | Correct. `VictoryPhase`, `ExpPhase`, `LevelUpPhase`, `LearnMovePhase`, `EvolutionPhase` — none call it. |
| No update on the reward-select screen | Correct. The shop is entered by plain `setMode` ([`select-modifier-phase.ts:316`, `:355`, `:403`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/select-modifier-phase.ts#L316)), which is not site 5. |
| No update on opening/cancelling the Fight submenu | Correct, and the general rule: `setMode` is never a trigger, only `setOverlayMode`. |
| No update on idle | Correct. The 1 Hz `playTimeTimer` ([`battle-scene.ts:664-677`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L664-L677)) advances `sessionPlayTime` but never rewrites the payload. |

**Two things a menu-navigation sweep would miss**, both worth a confirming poke if cheap:

- **Doubles write twice per turn.** `TurnInitPhase` pushes one `CommandPhase` per player field index ([`turn-init-phase.ts:66-70`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/turn-init-phase.ts#L66-L70)), so site 4 fires twice.
- **Opening the pause menu should write.** That is `setOverlayMode(UiMode.MENU)` ([`ui-inputs.ts:198`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui-inputs.ts#L198)) → site 5; closing it → site 7. A sweep that tested "menu navigation" by moving the cursor inside a menu, or by entering a `setMode` submenu such as Fight, would not have seen it. Unless the underlying mode was `MESSAGE`, in which case the guard above suppresses it.

### Does anything call it on `reset(true)` / return-to-title? Yes — unconditionally

This is the question that matters for `run_over`.

`reset()` ([`battle-scene.ts:1131`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1131)) tears the run down and then calls `updateGameInfo()` at [`:1216`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1216) — at method-body indentation, **not inside any `if (clearScene)` or other conditional**. The teardown before it:

- `this.money = 0` — [`:1142`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1142)
- `this.modifiers = []; this.enemyModifiers = []` — [`:1159-1160`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1159-L1160)
- `this.party = []` — [`:1166`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1166)
- `this.currentBattle = null!` — [`:1176`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1176)

Because the payload guards every run-scoped field on `currentBattle` ([`:3190-3193`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3190-L3193)), the write produces:

```
{ gameInfoVersion: "2.1.0", playTime: <n>, gameMode: "Title", biome: "", wave: 0, luck: -1, party: [] }
```

So: **it is rewritten to Title; it does not keep reporting the dead run.** Good news for detecting "not in a run" — and bad news for `run_over`, because *every* teardown path produces that same payload:

| Path | Call site |
|---|---|
| Wipe / game over | `GameOverPhase.handleGameOver` → `PostGameOverPhase` → `saveAll` → `tryClearSession` → `globalScene.reset()` — [`post-game-over-phase.ts:20-31`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L20-L31) |
| **Per-wave save failure** (the map's "losing a run without wiping") | `globalScene.reset(true)` — [`encounter-phase.ts:302-304`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L302-L304) |
| Save & quit | [`menu-ui-handler.ts:654`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L654) |
| Logout | [`menu-ui-handler.ts:613`, `:633`, `:687`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L613) |
| Language change | [`base-settings-ui-handler.ts:503`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/settings/base-settings-ui-handler.ts#L503) |
| `PostGameOverPhase` save/clear failure | [`post-game-over-phase.ts:22`, `:26`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L22) |
| Starter-select / pokedex / gacha / save-slot back-outs, unavailable modal | various |

`GameOverPhase.isVictory` ([`game-over-phase.ts:38`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L38)) is `private` on a phase object — but since the scene is reachable, the distinguishing signal is more likely to come from the phase queue or `gameData.gameStats.sessionsWon` than from `gameInfo`. From `gameInfo` alone it is not recoverable.

### Freshness conclusion

A *settled* read is fresh only at the command family (`CommandPhase.start()` wrote it after the previous turn resolved, and nothing mutates while the player chooses), at wave start, and at the title screen. At `MODIFIER_SELECT` it is a payload from the last turn of the battle just won — pre-EXP, pre-level-up, pre-evolution, and `wave` is still the wave just *cleared*, since `NewBattlePhase` runs after the shop ([`new-battle-phase.ts:11`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/new-battle-phase.ts#L11)).

**One free tool regardless:** `playTime` is a 1 Hz counter *captured at write time*, so `gameInfo.playTime` is a timestamp of the payload. If `gameInfo` stays in the design at all, diffing it against elapsed time gives the snapshot's age for nothing.

---

## 2. Is `gameInfoVersion` pinnable for codegen?

### The literal

[`battle-scene.ts:3185-3189`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3185-L3189):

```ts
    const gameInfo: GameInfo = {
      //! Make sure to update this in accordance with semver when the output is changed
      // cf https://semver.org/
      gameInfoVersion: "2.1.0",
```

### Is there a TS type for the payload? No — and this is the blocker

`GameInfo` and `PartyInfo` are declared as **local type aliases inside the method body**, [`battle-scene.ts:3084-3179`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3084-L3179):

```ts
  public updateGameInfo(): void {
    type GameInfo = {
      /** @since 2.0.0 */
      gameInfoVersion: string;
      ...
```

Not exported, no `@types` module, and [`global.d.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/global.d.ts) does not declare `window.gameInfo`. Codegen cannot import them. It *could* walk into the method body with the compiler API — they are plain structural types, no generics — but it would also have to reconstruct `variantMap` ([`:3180-3184`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3180-L3184)) to type `variant` as `"Normal" | "Rare" | "Epic" | "N/A"`. Strictly more work than reading two exported enums, for a 25-field type that changes twice a year. **Hand-write the type in the mcp repo.**

### Is the constant bumped with discipline?

Pickaxing the full history of `battle-scene.ts` for `gameInfoVersion` returns exactly two commits:

| Commit | Date | Change | First shipped |
|---|---|---|---|
| [`f32a580e`](https://github.com/pagefaultgames/pokerogue/commit/f32a580e7438e634fcfd33d3bb04c1ef957d3ca7) (PR #7290, *"feat: add more data to `window.gameInfo`"*) | 2026-05-03 | Introduced the field as `"2.0.0"`; rewrote most of the payload and removed `modeChain` | `v1.11.19` |
| [`8af1c982`](https://github.com/pagefaultgames/pokerogue/commit/8af1c98263c68258b3a8d7dd0dfc7ebe1cb43f7c) (PR #7381, *"feat: add `luck` to `window.gameInfo`, add `@since` docs"*) | 2026-06-21 | Bumped to `"2.1.0"` for one additive field | `v1.12.0.0` |

So: **one bump since the field was introduced.** Before 2.0.0 there was no version field — the `1.0.0`–`1.3.0` values in the `@since` tags are retroactive labels backfilled by `8af1c982`. The producer itself dates to [`7bdb969a`](https://github.com/pagefaultgames/pokerogue/commit/7bdb969a731f59708e1f9c8dd476b62777da174f) (2024-05-10).

Evidence *for* discipline: the one bump was a correct MINOR for an additive change; every field carries an `@since` tag; the `//!` comment states the rule; and a real external consumer exists (§5) that would visibly break.

Evidence *against*: n=1. Nothing enforces it — repo-wide grep finds no test, no CI check, no doc, no other reference to the constant. It is hand-maintained by convention alone.

**Schema version ≠ game version**, with dates now attached: 2.0.0 first shipped in `v1.11.19`, 2.1.0 in `v1.12.0.0`. Confirms #2's trap.

### Verdict on pinning

Technically yes, exactly as #2 pins the enums: a plain string literal at a stable AST location, extractable with the TS compiler API at the resolved tag. But it is worth far less than the enum tables:

- It cannot resolve the tag (not a build id — #2 established this).
- There is nothing to branch on. `2.1.0` vs `2.2.0` need identical parsing code; only a MAJOR matters, and the only MAJOR so far rewrote nearly the whole payload.
- Its one real use is a **drift alarm**: compare live `window.gameInfo.gameInfoVersion` against the codegen-time literal and warn on mismatch. Cheap, and it needs no scene handle — though that advantage has evaporated now that one exists.

Recommendation: generate the constant, use it only as an alarm, never branch on it, and do not attempt to codegen the payload type.

---

## 3. Payload schema (brief enumeration)

**Top level, 7 fields, always present:** `gameInfoVersion`, `playTime`, `gameMode`, `biome`, `wave`, `luck`, `party`.

**Party entry, 25 fields:** `name`, `nickname`, `gender`, `form`, `types`, `tempTypes`, `teraType`, `isTerastallized`, `level`, `currentHP`, `maxHP`, `status`, `moveset`, `tempMoveset`, `ability`, `tempAbility`, `passiveAbility`, `isPassiveEnabled`, `nature`, `baseStats`, `tempStats`, `statStages`, `shiny`, `variant`, `isFusion`.

Four notes not visible in a live capture:

- **`baseStats` is misnamed** — it is `p.getStat(Stat.ATK)` etc., the *computed* battle stats, not species base stats. `{atk, def, spAtk, spDef, speed}`, no HP.
- **`tempStats` is the only conditionally-shaped field** — `{}` when `summonData.stats` is all zero; the TS type is a union with an all-`never` object, so the keys are genuinely absent, not zeroed. Everything else is uniformly shaped, with `""`/`[]` sentinels.
- **Party order is field order.** `getPlayerField()` is `party.slice(0, double ? 2 : 1)` ([`battle-scene.ts:759-764`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L759-L764)) and switches reorder the array ([`switch-summon-phase.ts:190-191`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/switch-summon-phase.ts#L190-L191)), so `party[0]` is the lead. But there is no `double` flag in the payload, so `party[1]`'s on-field status is not inferable.
- **No ids anywhere** — no `id`, no `speciesId`, no fusion detail despite `isFusion`, no IVs, no held items, no EXP, no field position.

---

## 4. Is the payload localized? Partly — and the split is invisible

Two distinct mechanisms produce the strings, and the payload does not mark which is which.

### Mechanism A — i18next. Follows the player's language.

| Field | Call path |
|---|---|
| `gameMode` | `this.gameMode.getName()` → `switch (this.modeId) { case GameModes.CLASSIC: return i18next.t("gameMode:classic"); ... }` — [`game-mode.ts:412-422`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/game-mode.ts#L412-L422) |
| `biome` | `getBiomeName(this.arena.biomeId)` → `return i18next.t(\`biome:${toCamelCase(enumValueToKey(BiomeId, biome))}\`)` — [`utils/common.ts:451-457`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/common.ts#L451-L457) |
| `ability`, `tempAbility`, `passiveAbility` | `p.getAbility(true).name` → the `Ability.name` getter, `const name = i18next.t(\`ability:${this.i18nKey}.name\`)` — [`abilities/ability.ts:50-65`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/abilities/ability.ts#L50-L65) |
| `moveset`, `tempMoveset` | `move.getName()` → `this.getMove().name` ([`pokemon-move.ts:114-116`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/moves/pokemon-move.ts#L114-L116)) → set by `Move.localize()`, `this.name = \`${i18next.t(\`move:${i18nKey}.name\`)}${this.nameAppend}\`` — [`moves/move.ts:293-303`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/moves/move.ts#L293-L303) |
| `name` | `p.name` ← `this.species.getName(this.formIndex)` ([`field/pokemon.ts:622`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/field/pokemon.ts#L622)) → `PokemonSpecies.name` = `i18next.t(\`pokemon:${toCamelCase(SpeciesId[this.speciesId])}\`)` ([`pokemon-species.ts:1052`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/pokemon-species.ts#L1052)); special forms wrap it further via `i18next.t(\`battlePokemonForm:...\`, { pokemonName })` ([`:913-943`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/pokemon-species.ts#L913-L943)) |

The language comes from `localStorage["prLang"]` — i18next's `lookupLocalStorage: "prLang"` ([`i18n.ts:186`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/i18n.ts#L186)), written by the language setting ([`settings-language.ts:20`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/settings/settings-language.ts#L20)). **A player with `prLang` set to another language gets those six fields in that language.** Since we ride the dev's own account and profile per #5, this is a live risk, not a theoretical one.

### Mechanism B — TS enum reverse mapping. *Not* localized.

| Field | Call path | Stable? |
|---|---|---|
| `gender` | `capitalizeFirstLetterOnly(Gender[p.gender])` — `Gender` is a real TS enum ([`data/gender.ts:1-5`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/gender.ts#L1-L5)) | **Yes** |
| `types`, `tempTypes`, `teraType` | `capitalizeFirstLetterOnly(PokemonType[pType])` — real TS enum ([`enums/pokemon-type.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/pokemon-type.ts)) | **Yes** |
| `status` | `capitalizeFirstLetterOnly(StatusEffect[p.status.effect])` — real TS enum ([`enums/status-effect.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/status-effect.ts)) | **Yes** |
| `nature` | `capitalizeFirstLetterOnly(Nature[p.getNature()])` — real TS enum ([`enums/nature.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/nature.ts)) | **Yes** |

`capitalizeFirstLetterOnly(str)` is `capitalizeFirstLetter(str.toLowerCase())` ([`utils/strings.ts:82-84`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/strings.ts#L82-L84)). So `"Bashful"` is `Nature.BASHFUL` → `"BASHFUL"` → `"Bashful"`, and `"Fire"` is `PokemonType.FIRE`. These are **not** display names — they are the enum member names, and they are locale-invariant.

This also answers the sub-question about #2's codegen: for these four fields, #2's generated name tables map onto `gameInfo` output **exactly**, modulo the lowercase-then-capitalize transform. Round-tripping `"Bashful"` → `Nature.BASHFUL` = `18` is a safe, deterministic operation against a generated table. For the six i18next fields, the enum tables are unrelated to the emitted strings — `getBiomeName` and `Move.localize` derive their i18n *keys* from the enum names (`toCamelCase(enumValueToKey(BiomeId, biome))`), but the *value* is a translation. So the tables give you the key, never the output.

### Mechanism C — raw identifiers and hardcoded literals

| Field | Source | Stable? |
|---|---|---|
| `form` | `p.getFormKey()` → `this.species.forms[this.formIndex].formKey`, `""` when no forms — [`field/pokemon.ts:924-929`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/field/pokemon.ts#L924-L929) | **Yes** — a raw data identifier, never translated |
| `variant` | hardcoded `{0:"Normal", 1:"Rare", 2:"Epic"}` / `"N/A"` — [`battle-scene.ts:3180-3184`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3180-L3184) | **Yes** — English literals in the producer, not i18n |
| `nickname` | `decodeNickname(p.nickname, p.name)` — base64 of user input, falling back to `p.name` on decode failure — [`utils/pokemon-utils.ts:193-200`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/pokemon-utils.ts#L193-L200) | Neither — arbitrary user text |
| `gameMode: "Title"` | hardcoded literal at [`:3191`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3191) | **Yes** — the one `gameMode` value that is *not* localized |

### Two hazards beyond translation

Both hit even a player locked to English, so an English capture will not have shown them:

1. **`ability` / `passiveAbility` carry an implementation-status suffix.** The getter appends `" (N)"` for unimplemented and `" (P)"` for partially-implemented abilities ([`ability.ts:58-64`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/abilities/ability.ts#L58-L64)). The source even flags this as unsettled: *"consider whether these markers should be localized"*. So `"Blaze"` may arrive as `"Blaze (P)"` and the suffix moves between releases as abilities get implemented. Any exact-match on an ability name is a latent bug.
2. **`moveset` carries `nameAppend`.** `Move.localize()` concatenates `this.nameAppend` ([`move.ts:302`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/moves/move.ts#L302)), the same mechanism for move status markers.

### Answer

**Yes, partly — six fields are i18next-localized and follow `prLang`; five are stable identifiers.**

- **Never match on:** `gameMode` (except the literal `"Title"`), `biome`, `ability`, `tempAbility`, `passiveAbility`, `moveset`, `tempMoveset`, `name`. Localized, and the ability/move ones additionally carry mutable status suffixes.
- **Safe to match on:** `nature`, `types`, `tempTypes`, `teraType`, `status`, `gender` (enum member names), `form` (raw identifier), `variant` (hardcoded), and all the numerics and booleans.

So "unfit for any programmatic matching" is too strong, but it is correct for exactly the fields an agent would most want to match on — biome, ability, moves. Given the scene is reachable, the clean answer is to read enum **ints** off the scene and resolve them through #2's generated tables, and treat `gameInfo` strings as display text for the model to read, never as keys. That also makes #2's enum codegen more valuable than it looked, not less: it becomes the only locale-safe naming path.

---

## 5. Does anything read `gameInfo` back?

**Game code: no.** Repo-wide at the pinned ref — including `test/`, `docs/`, `scripts/`, `plugins/`, `index.html`, `global.d.ts` — there are exactly **four** occurrences of `gameInfo`, all in the producer:

```
src/battle-scene.ts:3086:      gameInfoVersion: string;
src/battle-scene.ts:3185:    const gameInfo: GameInfo = {
src/battle-scene.ts:3188:      gameInfoVersion: "2.1.0",
src/battle-scene.ts:3264:    window["gameInfo"] = gameInfo;
```

No read, no test, no doc, no type declaration. This matches the live finding that nulling it mid-battle throws nothing and it repopulates.

**One nuance that is easy to get wrong:** each write replaces the *whole object*. A server that caches the reference holds a frozen snapshot forever. Read `window.gameInfo` fresh on every poll.

### The intended consumer: an unofficial Discord RPC desktop wrapper

`updateGameInfo` was introduced by [`7bdb969a`](https://github.com/pagefaultgames/pokerogue/commit/7bdb969a731f59708e1f9c8dd476b62777da174f) (2024-05-10), titled **"Add rich presence support"**, authored by Admiral-Billy — who maintains [`Admiral-Billy/Pokerogue-App`](https://github.com/Admiral-Billy/Pokerogue-App), the unofficial Electron wrapper. That repo's `src/discord_rpc.js` is the only consumer, and it only reads:

```js
  async function updateDiscordPresence() {
    globals.mainWindow.webContents.executeJavaScript('window.gameInfo', true)
      .then((gameInfo) => {
        let gameData = gameInfo;
        if (gameData.gameMode === 'Title') { /* 'On the menu' */ }
        else {
          const details = `${gameData.gameMode} | Wave: ${gameData.wave} | ${gameData.biome}`;
          let state = `Party: ${gameData.party.map((pokemon) => `Lv. ${pokemon.level} ${pokemon.name}`).join(', ')}`;
```

Polled on a 1000 ms `setInterval`. It uses only `gameMode`, `wave`, `biome`, `playTime`, `party[].level`, `party[].name` — and keys its "not in a run" check on `gameMode === 'Title'`, which per §4 is the one locale-safe `gameMode` value, so it happens to be correct. Its `biome.toLowerCase().replace(/\s/g, '_')` image-key derivation, however, breaks entirely under a non-English `prLang` — independent confirmation that the localization hazard is real and unnoticed upstream.

**No Steam wrapper, no analytics hook, no first-party external tool.** The only other Discord code in pokerogue is OAuth login ([`oauth-providers-ui-handler.ts:95-98`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/oauth-providers-ui-handler.ts#L95-L98)) and an invite link ([`menu-ui-handler.ts:38`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L38)).

### What the audience implies for us

The field's only consumer is a 1 Hz cosmetic poller needing six coarse fields. That explains the design (event-driven, partial, display strings) and cuts two ways:

- **The `//!` semver comment is likely to keep being honoured** — a real external consumer would visibly break. That is the strongest reason to trust `gameInfoVersion` at all, given n=1.
- **The payload will almost certainly never grow** money, enemy state or `ui.mode`. Nobody upstream needs them. Plan for the current shape being permanent.
- **Sites 5-7 are removable upstream at zero cost.** No consumer reads a UI field, because none is published.

We should never *write* to `window.gameInfo`. It cannot break pokerogue, but it would break Discord RPC for desktop-wrapper users. Irrelevant to our setup, but there is no reason to.

---

## Carried forward (two items from the dropped Q4 that still matter)

Both are cheap and bear on other tickets, so they are worth recording even though the scene is reachable:

1. **`data-ui-mode`.** `ui.setModeInternal` and `revertMode` mirror the mode onto a DOM attribute: `touchControls.dataset.uiMode = UiMode[mode]` ([`ui.ts:547-551`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L547-L551), [`:612-615`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L612-L615)). `#touchControls` is static in [`index.html:69`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/index.html#L69), hidden not removed on desktop ([`index.css:147`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/index.css#L147)), and the attribute is load-bearing production CSS ([`index.css:177-221`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/index.css#L177-L221)). It updates on *every* mode change — a redundant cross-check on `ui.mode` for free, and a fallback if the CanvasPool route ever breaks after an upstream Phaser bump. Caveat: it is a name, not an int, so it cannot distinguish the five `PARTY` screens — #7's `PartyUiMode` constraint stands.
2. **`game.config.gameVersion` without a scene handle.** The localStorage session save (`sessionData<slot||"">_<username>`, [`account.ts:59-67`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/account.ts#L59-L67)) includes `gameVersion: globalScene.game.config.gameVersion` ([`game-data.ts:882-909`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L882-L909)), AES-encrypted under a hardcoded public constant `saveKey = "x0i2O7WRiANTqPmZ"` ([`constants.ts:56`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/constants.ts#L56), commented *"Temporary; secure encryption is not yet necessary"*; `encrypt` at [`utils/data.ts:47-52`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/data.ts#L47-L52)). Relevant to **#2**: a second, scene-independent source for the tag-resolution input. The same blob also carries `money`, `enemyParty`, `modifiers`, `enemyModifiers`, `pokeballCounts`, `waveIndex`, `battleType`, `trainer` — but only as of the last per-wave save, so money is pre-shop and enemy HP is at-spawn.

**Note on the superseded recommendation.** An earlier version of this document concluded that money, live enemy HP and held items were reachable from no window handle, and recommended `gameInfo` + `data-ui-mode` as the primary snapshot source. That conclusion rested on the source-level observation that `main.ts` keeps the `Phaser.Game` in a function-local `const` ([`main.ts:24`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/main.ts#L24)), that `globalScene` is a module-scoped `export let` ([`global-scene.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/global-scene.ts)), and that the only `window[...]` assignment in the repo is the `gameInfo` write. All of that is still true of the *game's own* code — but it does not bound what Phaser's own module-level statics expose. The live session's `Phaser.Display.Canvas.CanvasPool` route reaches the scene, so `get_state` is built on the scene and `gameInfo` keeps only a liveness-check role. Recorded here so the reasoning is not repeated.

---

## Sources

All at `pagefaultgames/pokerogue` commit `e4e9b5383be7c9e171d32a9daaea2658d475c521` (tag `v1.12.0.11`) unless noted.

**Producer and call sites**
- [`src/battle-scene.ts#L3083-L3265`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3083-L3265) — `updateGameInfo()`, the method-local `GameInfo`/`PartyInfo` types, the `"2.1.0"` literal and `//!` comment, `variantMap`, the `window["gameInfo"]` write.
- [`src/battle-scene.ts#L363`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L363), [`#L1131-L1216`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1131-L1216) — constructor; `reset()` teardown and its unconditional call.
- [`src/phases/encounter-phase.ts#L52-L57`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L52-L57), [`src/phases/command-phase.ts#L169-L184`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/command-phase.ts#L169-L184) — the two live phase hooks.
- [`src/ui/ui.ts#L543-L546`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L543-L546), [`#L596-L597`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L596-L597), [`#L610-L611`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L610-L611), [`#L641`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L641) — the three vestigial sites; the caller-less `getModeChain`.
- [`src/battle-scene.ts#L354`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L354), [`src/events/battle-scene.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/events/battle-scene.ts) — the `eventTarget` bus that `updateGameInfo` is *not* wired to.
- [`src/phases/turn-init-phase.ts#L49`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/turn-init-phase.ts#L49), [`#L66-L70`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/turn-init-phase.ts#L66-L70) — `TurnInitEvent` dispatch and the one-`CommandPhase`-per-slot push.
- [`src/battle-scene.ts#L652-L678`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L652-L678) — the 1 Hz `playTimeTimer`.
- [`src/ui-inputs.ts#L198`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui-inputs.ts#L198), [`src/phases/select-modifier-phase.ts#L316`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/select-modifier-phase.ts#L316), [`src/phases/new-battle-phase.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/new-battle-phase.ts) — pause-menu overlay; shop via plain `setMode`; post-shop wave increment.

**Return-to-title paths**
- [`src/phases/post-game-over-phase.ts#L20-L31`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L20-L31), [`src/phases/encounter-phase.ts#L296-L308`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L296-L308), [`src/ui/handlers/menu-ui-handler.ts#L613`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L613), [`src/ui/settings/base-settings-ui-handler.ts#L503`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/settings/base-settings-ui-handler.ts#L503), [`src/phases/game-over-phase.ts#L38`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L38).

**Version history**
- [`7bdb969a`](https://github.com/pagefaultgames/pokerogue/commit/7bdb969a731f59708e1f9c8dd476b62777da174f) — "Add rich presence support" (2024-05-10), the origin.
- [`0f6170b3`](https://github.com/pagefaultgames/pokerogue/commit/0f6170b3) / [`2d0cf54a`](https://github.com/pagefaultgames/pokerogue/commit/2d0cf54a) / [`0df40893`](https://github.com/pagefaultgames/pokerogue/commit/0df40893b24920462c2a23b31a825a5615e3692d) — `modeChain` add/revert/re-add (2024-08-24); origin of the `ui.ts` call sites.
- [`f32a580e`](https://github.com/pagefaultgames/pokerogue/commit/f32a580e7438e634fcfd33d3bb04c1ef957d3ca7) — PR #7290, schema `2.0.0` (2026-05-03); removed `modeChain`, kept the calls. First in `v1.11.19`.
- [`8af1c982`](https://github.com/pagefaultgames/pokerogue/commit/8af1c98263c68258b3a8d7dd0dfc7ebe1cb43f7c) — PR #7381, schema `2.1.0` + backfilled `@since` (2026-06-21). First in `v1.12.0.0`.

**Localization**
- [`src/game-mode.ts#L412-L422`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/game-mode.ts#L412-L422), [`src/utils/common.ts#L451-L457`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/common.ts#L451-L457), [`src/data/abilities/ability.ts#L45-L65`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/abilities/ability.ts#L45-L65), [`src/data/moves/move.ts#L293-L303`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/moves/move.ts#L293-L303), [`src/data/moves/pokemon-move.ts#L114-L116`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/moves/pokemon-move.ts#L114-L116), [`src/data/pokemon-species.ts#L913-L943`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/pokemon-species.ts#L913-L943) and [`#L1052`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/pokemon-species.ts#L1052) — the six i18next paths.
- [`src/data/gender.ts#L1-L5`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/data/gender.ts#L1-L5), [`src/enums/pokemon-type.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/pokemon-type.ts), [`src/enums/status-effect.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/status-effect.ts), [`src/enums/nature.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/nature.ts), [`src/utils/strings.ts#L82-L84`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/strings.ts#L82-L84) — the four real TS enums and `capitalizeFirstLetterOnly`.
- [`src/field/pokemon.ts#L622`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/field/pokemon.ts#L622), [`#L924-L929`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/field/pokemon.ts#L924-L929), [`src/utils/pokemon-utils.ts#L193-L200`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/pokemon-utils.ts#L193-L200) — `name` assignment, `getFormKey`, `decodeNickname`.
- [`src/i18n.ts#L186`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/i18n.ts#L186), [`src/system/settings/settings-language.ts#L20`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/settings/settings-language.ts#L20) — `prLang` as the language source.

**Consumer**
- [`Admiral-Billy/Pokerogue-App`](https://github.com/Admiral-Billy/Pokerogue-App) — `src/discord_rpc.js`, read via the GitHub contents API on 2026-09-12. Corroborated by release notes for [v1.2.1 "Bug Squashin' + Rich Presence"](https://github.com/Admiral-Billy/Pokerogue-App/releases/tag/v1.2.1) and [v2.2.1 "Enhanced Presence"](https://github.com/Admiral-Billy/Pokerogue-App/releases/tag/v2.2.1).

**Superseded reachability claim**
- [`src/main.ts#L24`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/main.ts#L24), [`src/global-scene.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/global-scene.ts), [`src/touch-controls.ts#L248`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/touch-controls.ts#L248) — the game exposes no scene handle of its own; Phaser's module statics are another matter.

---

## Not answerable from source

- Whether `gameInfoVersion` will continue to be bumped with discipline. One correct bump plus a hand-maintained comment plus a real external consumer is the whole of the evidence.
- Whether the three vestigial `ui.ts` calls will survive upstream. Nothing depends on them.
