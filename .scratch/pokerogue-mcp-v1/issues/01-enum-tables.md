# Button and UiMode enum tables

Type: research
Status: resolved

## Question

`scene.ui.processInput(button)` takes ints from PokéRogue's `Button` enum, and `scene.ui.mode` is an int from `UiMode`. Neither table was dumped during recon, so every press and every menu reading is currently a magic number.

Find, in the public PokéRogue source (`pagefaultgames/pokerogue`):

- The full `Button` enum: every member, its int value, and the file it lives in.
- The full `UiMode` enum: same.
- How stable these are across releases — do values get renumbered, or only appended? Check the git history of both files.
- Whether the live `pokerogue.net` build can be pinned to a source ref (a version string, build hash, or `gameInfoVersion` exposed on the page) so generated tables can be matched against the running game.
- Whether anything else the server will need is enum-shaped and worth generating at the same time (e.g. `BattlerIndex`, `PokemonType`, `StatusEffect`, `Biome`).

Report the enums as data plus a recommendation for how a codegen script should extract them (parse TS source at a pinned ref vs. import from a published package, if one exists).

## Answer

Both tables read from `pagefaultgames/pokerogue` @ `main` (`e4e9b53`, tag `v1.12.0.11`) — `main` is the branch `deploy.yml` ships to pokerogue.net; the repo's *default* branch is `beta` and already differs. `Button` is `src/enums/buttons.ts`, 18 members, `UP`=0 … `DEV_CUSTOM`=17 — note **`ACTION` is 5**, because `SUBMIT`=4 sits before it. `UiMode` is `src/enums/ui-mode.ts`, 48 members, `MESSAGE`=0 … `ALERT_MODAL`=47; both verified against the live production bundle, and `LOGIN_OR_REGISTER`=32 plus 48 handlers match the recon in `README.md` exactly.

Stability is **asymmetric**. `Button` has not renumbered once since 2024 — append-only plus two in-place renames. `UiMode` renumbers roughly every five months: mid-list inserts (`RENAME_RUN`, `LOGIN_OR_REGISTER`) and a removal (`SESSION_RELOAD`) all shifted live values, and `beta` already renames `SETTINGS`→`SETTINGS_GENERAL`. So `UiMode` must be regenerated per release and drift-checked, not trusted.

Pinning works: `game.config.gameVersion` (from `main.ts`, via Phaser config) is `"1.12.0.11"`, and `v${that}` is a real upstream git tag. `gameInfo.gameInfoVersion` is **not** this — it is the `gameInfo` payload schema version (`"2.1.0"`) and is useless for pinning. Runtime drift checks are free: `scene.inputController.configs["default"].settings` exposes the live `Button` values outright, and `scene.ui.handlers.length` (48) catches every `UiMode` insert/remove.

Codegen: the package is `"private": true` and not on npm, so parse TS source at the pinned tag via raw.githubusercontent (no clone). Use the `typescript` compiler API, not a regex — `BiomeId` and `PartyUiMode` are `as const` objects rather than `enum`s, and `BiomeId` has non-contiguous values (31→40→41→50). Also worth generating now: `Command`, `BattlerIndex`, `PartyUiMode` (its non-cancellable modes will hang a run), `StatusEffect`, `PokemonType`, `PokeballType`, `Stat`, `FieldPosition`, `MoveCategory`, `BiomeId`. Skip `MoveId`/`SpeciesId`/`AbilityId` — `gameInfo` already returns those as strings.

Full tables, git-history evidence, extracted live-bundle proof and the codegen recommendation: `.scratch/pokerogue-mcp-v1/research/01-enum-tables.md`.
