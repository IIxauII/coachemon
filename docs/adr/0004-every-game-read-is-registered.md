# Every game read is registered, and a static check holds the registry to the code

Everything our code takes from the game by name is a **game read**, and every game read has an entry in one registry
(`scripts/game-reads/registry/`): property names read off game objects, phase-name strings, storage keys, the harness
template's `#…` imports, and the hand constants that copy game data (**mirrors**, marked `// @mirrors <id>` where they
are declared). The game's enums and lists we switch on are **game sets**, whose members we know. `npm run reads:check`,
also run by `npm test`, fails on a read with no entry and on an entry nothing reads. `npm run drift:check` checks every
entry at a candidate game version beside the hand-registered deps of ADR 0001, and the stamp refuses while anything is
missing, added to a game set, shifted in the generated enums, or read without an entry (#711).

## Considered options

- **Hand-registered deps alone (ADR 0001 as it stood).** Rejected: they cover only what someone remembered to add, and
  only functions, methods and top-level declarations. Class fields, phase-name strings, data tables, mirrored
  constants, the harness template's reads and imports, and new members of the enums we switch on went unchecked;
  v1.12.1.1 broke the starter screen's fields and the harness's sparkle handler with no drift line naming either.
- **A dynamic probe of the game in the clone.** Rejected by the owner: the registry is enforced by a convention a
  static check can find. The suite's runtime checks stay as they are.
- **Type-check our page code against the game's own types.** Rejected: the page and HUD code is stringified into the
  tab and must stay free of game imports, and the HUD is plain JavaScript.

## Consequences

- The static check works by syntax and needs no clone. A read passes when it is a JavaScript, DOM or Node builtin,
  a name our own product code declares, or a registered name; in typed files only a read off an `any` counts. Our own
  declarations can hide a game name, so drift also asks the target's source: a name a scanned file reads that the game
  declares and no entry registers is UNREGISTERED, and the stamp refuses on it.
- An entry names where the game defines it (`file#Class.member`), and drift hashes each one. Fields hash their
  declaration, a class its shape, a data table its whole declaration, a library read the version the game asks for.
- Drift also hashes the callees one level down of every hashed dep, so the ADR 0001 rejection of the full transitive
  closure still holds: one level, not the closure.
- Drift regenerates the enums at the candidate and reports every value that would move (SHIFTED), so the stamp never
  lands a pin whose regenerated enums CI would then reject.
- The hand-registered deps stay for what our code re-implements; the registry is what it reads. Both hash into
  `reviewed.json`, whose `pinned` keeps its shape.
