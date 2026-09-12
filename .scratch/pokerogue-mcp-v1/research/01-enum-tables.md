# Research: Button and UiMode enum tables

Resolves `.scratch/pokerogue-mcp-v1/issues/01-enum-tables.md`.
Researched 2026-09-12.

## Sources and refs

Primary source is the upstream game repo, read from a local clone:

| Thing | Value |
|---|---|
| Repo | `https://github.com/pagefaultgames/pokerogue` |
| Branch that serves `pokerogue.net` | `main` |
| Ref read | `main` @ `e4e9b5383be7c9e171d32a9daaea2658d475c521` (2026-08-23), tagged `v1.12.0.11` |
| `package.json` version at that ref | `1.12.0.11` |
| Beta ref, for contrast | `beta` @ `da1d0efff3c48b5b4f2b9eb448051793971999bd`, `package.json` version `1.12.1.0` |
| Live bundle cross-checked | `https://pokerogue.net/assets/battle-scene-BmkpVc5x.js` (fetched 2026-09-12) |

Files:

- `src/enums/buttons.ts` — `Button`
- `src/enums/ui-mode.ts` — `UiMode`
- `src/ui/ui.ts` — `Ui.processInput`, `Ui.handlers`
- `src/configs/inputs/cfg-keyboard-qwerty.ts` — `SettingKeyboard` → `Button` map (runtime-reachable)
- `.github/workflows/deploy.yml` / `deploy-beta.yml` — which branch reaches which host

**`main` → `pokerogue.net`** is established by `.github/workflows/deploy.yml`: it triggers on push to `main`, runs `pnpm build` with `NODE_ENV=production`, rsyncs `dist/` to the server and purges the Cloudflare cache for `https://pokerogue.net/`. `deploy-beta.yml` is the `beta` branch's equivalent. So **read `main`, never the default branch** — GitHub's default branch for this repo is `beta`, which is a trap: a plain `git clone` or a raw.githubusercontent URL without an explicit ref gives you the *beta* enum, which already differs (see Stability).

---

## `Button`

`src/enums/buttons.ts` @ `main` / `v1.12.0.11`. Unannotated TS numeric enum, so values are positional from 0.

```json
{
  "UP": 0,
  "DOWN": 1,
  "LEFT": 2,
  "RIGHT": 3,
  "SUBMIT": 4,
  "ACTION": 5,
  "CANCEL": 6,
  "MENU": 7,
  "STATS": 8,
  "CYCLE_SHINY": 9,
  "CYCLE_FORM": 10,
  "CYCLE_GENDER": 11,
  "CYCLE_ABILITY": 12,
  "CYCLE_NATURE": 13,
  "CYCLE_TERA": 14,
  "SPEED_UP": 15,
  "SLOW_DOWN": 16,
  "DEV_CUSTOM": 17
}
```

Notes for the server:

- **`ACTION` is 5, not 4.** `SUBMIT` (4) sits between `RIGHT` and `ACTION` and is the single easiest value to get wrong by counting the README's tool-surface list (`UP/DOWN/LEFT/RIGHT/ACTION/CANCEL/MENU`). `SUBMIT` is bound to Enter and is used by the text-input/form handlers; `ACTION` is bound to Space/Z and is the confirm in ordinary menus.
- `DEV_CUSTOM` (17) exists in the enum on production but is only *bound* to a key when `isDev` (`src/configs/inputs/cfg-keyboard-qwerty.ts:222`, `src/system/settings/settings-keyboard.ts:85`). `ui-inputs.ts:133` maps it to a no-op outside dev. Harmless to generate; never useful to send.
- `SPEED_UP` / `SLOW_DOWN` change battle animation speed. Worth exposing — they directly reduce how long the "settled" poll has to wait.

Verified against the live build: the production `battle-scene-*.js` chunk has `Button` **inlined** by the bundler (the enum object does not survive), but the keyboard config object does, carrying the same numbers:

```
settings:{BUTTON_UP:0,BUTTON_DOWN:1,BUTTON_LEFT:2,BUTTON_RIGHT:3,BUTTON_SUBMIT:4,
BUTTON_ACTION:5,BUTTON_CANCEL:6,BUTTON_MENU:7,BUTTON_STATS:8,BUTTON_CYCLE_SHINY:9,
BUTTON_CYCLE_FORM:10,BUTTON_CYCLE_GENDER:11,BUTTON_CYCLE_ABILITY:12,
BUTTON_CYCLE_NATURE:13,BUTTON_CYCLE_TERA:14,BUTTON_SPEED_UP:15,BUTTON_SLOW_DOWN:16}
```

That object is the compiled form of `cfg-keyboard-qwerty.ts:187-205` (`[SettingKeyboard.BUTTON_UP]: Button.UP, …`) — i.e. the live `Button` values, confirmed independently of the source read.

---

## `UiMode`

`src/enums/ui-mode.ts` @ `main` / `v1.12.0.11`. Unannotated TS numeric enum, positional from 0.

```json
{
  "MESSAGE": 0,
  "TITLE": 1,
  "COMMAND": 2,
  "FIGHT": 3,
  "BALL": 4,
  "TARGET_SELECT": 5,
  "MODIFIER_SELECT": 6,
  "SAVE_SLOT": 7,
  "PARTY": 8,
  "SUMMARY": 9,
  "STARTER_SELECT": 10,
  "EVOLUTION_SCENE": 11,
  "EGG_HATCH_SCENE": 12,
  "EGG_HATCH_SUMMARY": 13,
  "CONFIRM": 14,
  "OPTION_SELECT": 15,
  "MENU": 16,
  "MENU_OPTION_SELECT": 17,
  "SETTINGS": 18,
  "SETTINGS_DISPLAY": 19,
  "SETTINGS_AUDIO": 20,
  "SETTINGS_GAMEPAD": 21,
  "GAMEPAD_BINDING": 22,
  "SETTINGS_KEYBOARD": 23,
  "KEYBOARD_BINDING": 24,
  "ACHIEVEMENTS": 25,
  "GAME_STATS": 26,
  "EGG_LIST": 27,
  "EGG_GACHA": 28,
  "POKEDEX": 29,
  "POKEDEX_SCAN": 30,
  "POKEDEX_PAGE": 31,
  "LOGIN_OR_REGISTER": 32,
  "LOGIN_FORM": 33,
  "REGISTRATION_FORM": 34,
  "LOADING": 35,
  "UNAVAILABLE": 36,
  "CHALLENGE_SELECT": 37,
  "RENAME_POKEMON": 38,
  "RENAME_RUN": 39,
  "RUN_HISTORY": 40,
  "RUN_INFO": 41,
  "TEST_DIALOGUE": 42,
  "AUTO_COMPLETE": 43,
  "ADMIN": 44,
  "MYSTERY_ENCOUNTER": 45,
  "CHANGE_PASSWORD_FORM": 46,
  "ALERT_MODAL": 47
}
```

48 members, 0–47 contiguous.

**Verified three ways.**

1. Source read at `main`.
2. The live production bundle still carries the full `UiMode` runtime object (this enum *is not* inlined, because `ui.ts` uses `UiMode[this._mode]` reflectively). Extracted verbatim from `battle-scene-BmkpVc5x.js`:
   ```
   MESSAGE:0,0:`MESSAGE`,TITLE:1,1:`TITLE`,COMMAND:2,2:`COMMAND`,FIGHT:3,3:`FIGHT`,
   … LOGIN_OR_REGISTER:32,32:`LOGIN_OR_REGISTER`, … ALERT_MODAL:47,47:`ALERT_MODAL`
   ```
   Byte-identical to the table above, all 48 members.
3. Two independent facts from the recon in `README.md` fall out exactly: `scene.ui.mode === 32` on the login screen is `LOGIN_OR_REGISTER`, and "48 registered handlers" matches the 48 members — `Ui.handlers` is built in UiMode order and indexed by mode (`src/ui/ui.ts:135-194`, `getHandler()` is `this.handlers[this._mode]` at `ui.ts:245`).

### Which modes the v1 loop actually meets

Ordinary play cycles through a small subset; the rest are menus the agent should never enter.

| Mode | Int | Why it matters |
|---|---|---|
| `MESSAGE` | 0 | Dialogue / battle text. The auto-advance state the "settled" check must ride out. |
| `TITLE` | 1 | Run start. |
| `COMMAND` | 2 | Fight / Ball / Pokémon / Run — see `Command` below. |
| `FIGHT` | 3 | Move select. |
| `BALL` | 4 | Poké Ball select. |
| `TARGET_SELECT` | 5 | Doubles targeting. |
| `MODIFIER_SELECT` | 6 | Between-wave reward / shop screen. |
| `SAVE_SLOT` | 7 | Slot pick on run start. |
| `PARTY` | 8 | Switch, item apply, forced switch on faint. Behaviour depends on `PartyUiMode`. |
| `STARTER_SELECT` | 10 | Team pick at run start. |
| `CONFIRM` | 14 | Yes/No. |
| `OPTION_SELECT` | 15 | Generic option list. |
| `MENU` | 16 | Pause menu. |
| `MYSTERY_ENCOUNTER` | 45 | Mystery encounter choices. |
| `LOGIN_OR_REGISTER` / `LOGIN_FORM` | 32 / 33 | Only if the profile lost its session. |
| `LOADING` / `UNAVAILABLE` / `ALERT_MODAL` | 35 / 36 / 47 | Not-settled and error states — good "stop, don't press" signals. |

---

## Stability across releases

Read from `git log --follow -p` on both files, back to creation.

### `Button` — effectively frozen

Created 2024-05-05 in [#429](https://github.com/pagefaultgames/pokerogue/pull/429) (`d98f7733d410`) with 17 members. Every commit since:

| Commit | Date | Change | Renumbered? |
|---|---|---|---|
| `d98f7733d410` | 2024-05-05 | created, `UP`(0) … `SLOW_DOWN`(16) | — |
| `9b5c1cdadbc9` | 2024-05-29 | `CYCLE_VARIANT` → `V` (slot 14) | no |
| `2d067ec7ce82` | 2025-02-21 | `V` → `CYCLE_TERA` (slot 14) | no |
| `c0da686ba0da` | 2025-09-08 | tabs → spaces (Biome 2.2.3) | no |
| `34903dd88984` | 2026-04-09 | appended `DEV_CUSTOM` (17) | no |

**In ~2 years, no existing `Button` value has ever changed.** Slot 14 was renamed twice; everything else is append-only. Values 0–16 are as old as the file. Treating `Button` as stable is safe.

### `UiMode` — renumbers. Do not assume append-only.

The file `src/enums/ui-mode.ts` only dates to 2025-04-19 (`5854b21da0a1`, "Remove circular imports part 1") — before that the same enum lived in `src/ui/ui.ts` as `Mode`, with a long history of its own (`src/ui/ui.ts` has ~40 touching commits back to 2024). Since the extraction:

| Commit | Date | Change | Renumbered? |
|---|---|---|---|
| `5854b21da0a1` | 2025-04-19 | extracted, 45 members `MESSAGE`(0) … `MYSTERY_ENCOUNTER`(44) | — |
| `1633df75c4c0` | 2025-08-05 | appended `CHANGE_PASSWORD_FORM` | no |
| `1517e0512e73` | 2025-08-13 | **inserted `RENAME_RUN` after `RENAME_POKEMON`** | **yes — `RUN_HISTORY` and everything after shifted +1** |
| `e6de0fb95dca` | 2025-12-18 | **inserted `LOGIN_OR_REGISTER` before `LOGIN_FORM`** | **yes — `LOGIN_FORM` 32→33 and everything after shifted +1** |
| `833ac0c5b201` | 2026-06-24 | appended `ALERT_MODAL` | no |
| `d9dd844c9ea1` | 2026-07-05 | **removed `SESSION_RELOAD`** | **yes — `UNAVAILABLE` and everything after shifted −1** |
| `4da4ac69f92f` | 2026-08-04 | `SETTINGS` → `SETTINGS_GENERAL` (slot 18) | no (rename in place) |

Three renumbering events in ~16 months, i.e. **roughly one every five months**, and they are mid-list inserts/removals, not appends. Two of them touched values in the 32–41 range, which is exactly where the login/registration modes the server must recognise live.

There is also an **already-pending name change on `beta`**: `SETTINGS` → `SETTINGS_GENERAL` at value 18, landing whenever `1.12.1.0` promotes to `main`. Value unchanged, name changed. A generated table keyed by name will silently disagree with the live build across that promotion.

Conclusion: **`UiMode` must be regenerated per release and drift-checked at runtime.** A hand-transcribed or stale table is a live hazard, not a cosmetic one — a mis-mapped `UiMode` makes `read_menu` confidently report the wrong screen, which is worse than reporting an unknown one.

---

## Pinning the live build to a source ref

### What the page exposes

`src/main.ts:8,73` passes `version` (imported straight from `package.json`) into the Phaser `Game` config. Phaser stores that at `game.config.gameVersion`. So:

```js
const game = Phaser.Display.Canvas.CanvasPool.pool[0].parent.game;
game.config.gameVersion            // => "1.12.0.11"
```

That string is exactly `package.json#version` at the deployed commit, and it is also the tag name: `git tag --points-at origin/main` → `v1.12.0.11`. **`v${game.config.gameVersion}` is a git tag in the upstream repo.** That is the pin: one string read from the page resolves to an immutable ref.

Confirmed from the live bundle, which hardcodes the same literal in its save-data version check:

```
compareVersions(m.gameVersion,`1.12.0.11`)===1 ? (await B.ui.setMode(47, …GAME_OUT_OF_DATE…
```

(Note the `47` there — that is `UiMode.ALERT_MODAL`, another incidental confirmation of the table.)

### What `gameInfoVersion` is *not*

`window.gameInfo.gameInfoVersion` is **not** the build version. It is a hand-maintained semver for the *shape of the `gameInfo` object*, hardcoded as `"2.1.0"` at `src/battle-scene.ts:3155` with a comment telling contributors to bump it when the output changes. It is useful for validating the snapshot parser, and useless for pinning a source ref. The README's recon listed it without this distinction; worth correcting there.

### Secondary fingerprints

- `https://pokerogue.net/manifest.json` maps every built asset to a timestamp, and asset filenames carry Rollup content hashes (`battle-scene-BmkpVc5x.js`). A changed hash means a redeploy even when the version string did not move (hotfix branches ship as `1.12.0.N`, so in practice the version does move).
- `index.html` carries **no** version string. Don't look for one there.

### Recommended pinning protocol

1. At server start, read `game.config.gameVersion`.
2. Compare against the `pinnedVersion` recorded in the generated module.
3. On mismatch: warn, keep running, mark every `read_menu` mode name as unverified. Do not hard-fail — the game is playable via raw `press` regardless, and the map already says unknown modes degrade rather than block.

### Runtime drift check (cheap, and better than version-string trust)

Two live probes that need no network:

```js
// UiMode: handlers are constructed one-per-mode, in mode order.
scene.ui.handlers.length         // === 48 at v1.12.0.11
// Button: the keyboard config survives minification as a SettingKeyboard -> Button map.
scene.inputController.configs["default"].settings   // { BUTTON_UP: 0, ..., BUTTON_SLOW_DOWN: 16 }
```

`configs` is `private` in TypeScript, which is erased at runtime — it is a plain readable property. This makes `Button` verifiable *exactly* against the running build at every startup, for free. `handlers.length` only gives a member *count* for `UiMode`, but a count mismatch catches every insert/remove event in the history above except a pure rename. Combined with the version-string check, that is sufficient coverage.

A shortcoming worth knowing: `Ui` calls `this.setName(\`ui-${UiMode[this._mode]}\`)` once in `setup()` (`ui.ts:198`) and never again, so `scene.ui.name` is permanently `"ui-MESSAGE"` and is **not** a live mode-name readout. Don't build on it. Likewise `getHandler().constructor.name` is minified in the production build for most handlers, so it is not a reliable mode label either.

---

## Other enum-shaped things worth generating now

`src/enums/` holds ~100 files at this ref. Most are irrelevant. The ones the server will actually touch:

**Generate now — small, and appear in the control loop:**

```json
{
  "Command":       { "FIGHT": 0, "BALL": 1, "POKEMON": 2, "RUN": 3, "TERA": 4 },

  "BattlerIndex":  { "ATTACKER": -1, "PLAYER": 0, "PLAYER_2": 1, "ENEMY": 2, "ENEMY_2": 3 },

  "StatusEffect":  { "NONE": 0, "POISON": 1, "TOXIC": 2, "PARALYSIS": 3, "SLEEP": 4,
                     "FREEZE": 5, "BURN": 6, "FAINT": 7 },

  "PokemonType":   { "UNKNOWN": -1, "NORMAL": 0, "FIGHTING": 1, "FLYING": 2, "POISON": 3,
                     "GROUND": 4, "ROCK": 5, "BUG": 6, "GHOST": 7, "STEEL": 8, "FIRE": 9,
                     "WATER": 10, "GRASS": 11, "ELECTRIC": 12, "PSYCHIC": 13, "ICE": 14,
                     "DRAGON": 15, "DARK": 16, "FAIRY": 17, "STELLAR": 18 },

  "PokeballType":  { "POKEBALL": 0, "GREAT_BALL": 1, "ULTRA_BALL": 2, "ROGUE_BALL": 3,
                     "MASTER_BALL": 4, "LUXURY_BALL": 5 },

  "Stat":          { "HP": 0, "ATK": 1, "DEF": 2, "SPATK": 3, "SPDEF": 4, "SPD": 5,
                     "ACC": 6, "EVA": 7 },

  "FieldPosition": { "CENTER": 0, "LEFT": 1, "RIGHT": 2 },

  "MoveCategory":  { "PHYSICAL": 0, "SPECIAL": 1, "STATUS": 2 },

  "PartyUiMode":   { "SWITCH": 0, "FAINT_SWITCH": 1, "POST_BATTLE_SWITCH": 2,
                     "REVIVAL_BLESSING": 3, "MODIFIER": 4, "MOVE_MODIFIER": 5,
                     "TM_MODIFIER": 6, "REMEMBER_MOVE_MODIFIER": 7,
                     "MODIFIER_TRANSFER": 8, "SPLICE": 9, "RELEASE": 10,
                     "CHECK": 11, "SELECT": 12, "DISCARD": 13 },

  "BiomeId":       { "TOWN": 0, "PLAINS": 1, "GRASS": 2, "TALL_GRASS": 3, "METROPOLIS": 4,
                     "FOREST": 5, "SEA": 6, "SWAMP": 7, "BEACH": 8, "LAKE": 9, "SEABED": 10,
                     "MOUNTAIN": 11, "BADLANDS": 12, "CAVE": 13, "DESERT": 14,
                     "ICE_CAVE": 15, "MEADOW": 16, "POWER_PLANT": 17, "VOLCANO": 18,
                     "GRAVEYARD": 19, "DOJO": 20, "FACTORY": 21, "RUINS": 22,
                     "WASTELAND": 23, "ABYSS": 24, "SPACE": 25, "CONSTRUCTION_SITE": 26,
                     "JUNGLE": 27, "FAIRY_CAVE": 28, "TEMPLE": 29, "SLUM": 30,
                     "SNOWY_FOREST": 31, "ISLAND": 40, "LABORATORY": 41, "END": 50 }
}
```

`PartyUiMode` is the highest-value one after `UiMode`: `UiMode.PARTY` (8) means five different screens depending on it, and — critically — `FAINT_SWITCH` (1) and `REVIVAL_BLESSING` (3) **cannot be cancelled**. An agent that reflexively presses `CANCEL` on a party screen will hang the run. Encode the cancellable/not-cancellable bit alongside the value; the doc comments in `src/enums/party-ui-mode.ts` state it for every member.

`Command` matters because `MODIFIER_SELECT` / `COMMAND` handler cursors index it directly.

**Skip:** `MoveId` (~1800 members), `SpeciesId` (~2100), `AbilityId` (~640), `TrainerType` (~320). The live game already hands these back as *strings* — `window.gameInfo.party[].moveset`, `.ability`, `.types`, `.status` and `.name` are all human-readable text (`src/battle-scene.ts:3145+`), and `scene.arena.biomeId` has `getBiomeName()`. Generating thousands of int→name pairs to re-derive text the game already renders is pure weight in the MCP server. Pull them only if a tool turns out to need int→name for a field `gameInfo` doesn't cover.

---

## Recommendation: how codegen should work

### Not a published package

`package.json` at both refs has `"private": true`, and `pokemon-rogue-battle` is **not on npm** (`registry.npmjs.org/pokemon-rogue-battle` → `{"error":"Not found"}`; an npm search for "pokerogue" returns nothing relevant). There is no importable artifact. Parsing source at a pinned ref is the only option.

### Fetch, don't clone

At the pinned tag, fetch just the files needed:

```
https://raw.githubusercontent.com/pagefaultgames/pokerogue/v1.12.0.11/src/enums/buttons.ts
https://raw.githubusercontent.com/pagefaultgames/pokerogue/v1.12.0.11/src/enums/ui-mode.ts
…
```

A dozen small files beats a ~1 GB clone of a repo full of sprite assets. Use the **tag**, never `main` (a moving target) and never the bare repo default (which is `beta`).

### Parse with the TypeScript compiler, not a regex

Three traps a regex will fall into, all present in the shortlist above:

1. **Not everything is an `enum`.** `BiomeId` and `PartyUiMode` are `export const X = { … } as const` objects with an `ObjectValues<typeof X>` companion type. The repo is visibly migrating enums to this form — anything could convert next release. A generator that only matches `export enum` will silently emit nothing for those and leave the caller with an empty table.
2. **Values are not always positional.** `BiomeId` jumps `SNOWY_FOREST: 31 → ISLAND: 40 → LABORATORY: 41 → END: 50`. `BattlerIndex` and `PokemonType` start at `-1`. Counting members is wrong.
3. **Comments and doc blocks interleave members.** `PartyUiMode` has a JSDoc block before every single member; `PokemonType` has doc comments and trailing `export const MIN_REGULAR_POKEMON_TYPE = …` declarations in the same file.

Use `typescript` as a library: `ts.createSourceFile` → walk for `EnumDeclaration` and for `VariableStatement` whose initializer is an `ObjectLiteralExpression` (optionally `as const`), and evaluate initializers with TypeScript's own constant-folding (`ts.TypeChecker#getConstantValue` for enums, or a small literal evaluator that handles the `implicit = previous + 1` rule and negative numeric literals). `typescript` is already a plausible devDependency for a TS project, so this adds nothing to the runtime tree.

Alternative if a TS dependency is unwanted: `oxc-parser` or `@babel/parser` in TS mode. Do not hand-roll.

### Emit shape

Generate one committed TS module, e.g. `src/generated/pokerogue-enums.ts`, containing for each enum a frozen forward map, a derived reverse map, and the pin metadata:

```ts
/** GENERATED — do not edit. Source: pagefaultgames/pokerogue @ v1.12.0.11 */
export const PINNED_VERSION = "1.12.0.11";
export const PINNED_REF = "v1.12.0.11";
export const PINNED_COMMIT = "e4e9b5383be7c9e171d32a9daaea2658d475c521";

export const Button = { UP: 0, /* … */ DEV_CUSTOM: 17 } as const;
export const UiMode = { MESSAGE: 0, /* … */ ALERT_MODAL: 47 } as const;
export const UiModeName: Record<number, string> = /* reverse */;
```

Committed, not generated at build time: the server must work offline against a live game, and a network fetch in the startup path is a failure mode for no benefit. Regeneration is a maintenance command (`pnpm gen:enums [version]`), run when the version check fires.

Because `Button` is the table that gets *sent* to the game and `UiMode` is only *read*, and because `Button` has never renumbered while `UiMode` renumbers about twice a year, the drift policy should be asymmetric: verify `Button` against `scene.inputController.configs["default"].settings` at startup and refuse to send presses if it disagrees; for `UiMode`, compare `scene.ui.handlers.length` against the generated member count and, on mismatch, degrade every mode to "unknown name, int only" rather than reporting a wrong name.

---

## Corrections to existing notes

- `README.md` lists `gameInfoVersion` among the live-state reads without saying what it is. It is the `gameInfo` **payload schema** version (`"2.1.0"`), not the build version. The build version is `game.config.gameVersion`.
- `README.md`'s open question "derive [Button] from `inputController.configs`" is a *correct and working* fallback — it is the runtime drift check recommended above — but it yields `SettingKeyboard` keys (`"BUTTON_ACTION"`), not `Button` member names, so it needs the `BUTTON_`/`ALT_BUTTON_` prefix stripped before the names line up.
- The map's line "Enums: `Button` / `UiMode` int→name tables are code-generated from the public PokéRogue source at a pinned ref" holds up. The only refinement is *which* ref: the tag matching `game.config.gameVersion`, on the `main` branch, not the repo default branch `beta`.
