# Button and UiMode enum tables

Type: research
Status: claimed

## Question

`scene.ui.processInput(button)` takes ints from PokéRogue's `Button` enum, and `scene.ui.mode` is an int from `UiMode`. Neither table was dumped during recon, so every press and every menu reading is currently a magic number.

Find, in the public PokéRogue source (`pagefaultgames/pokerogue`):

- The full `Button` enum: every member, its int value, and the file it lives in.
- The full `UiMode` enum: same.
- How stable these are across releases — do values get renumbered, or only appended? Check the git history of both files.
- Whether the live `pokerogue.net` build can be pinned to a source ref (a version string, build hash, or `gameInfoVersion` exposed on the page) so generated tables can be matched against the running game.
- Whether anything else the server will need is enum-shaped and worth generating at the same time (e.g. `BattlerIndex`, `PokemonType`, `StatusEffect`, `Biome`).

Report the enums as data plus a recommendation for how a codegen script should extract them (parse TS source at a pinned ref vs. import from a published package, if one exists).
