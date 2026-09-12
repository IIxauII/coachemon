# pokerogue-mcp

MCP server that lets Claude play [PokéRogue](https://pokerogue.net) — a browser roguelite where you fight wave after wave of Pokémon battles, shop between waves, and restart from wave 1 on a party wipe.

## Goal

Give an agent a **text-first** control loop over a live PokéRogue run. No pixel reading, no screenshot-per-action. Structured state in, button presses out.

## Why it's feasible (verified 2026-09-12)

Recon against the live site, Phaser 3.90.0. Everything below was confirmed working in a real browser session via CDP.

### Reading state

- `window.gameInfo` → `{ gameInfoVersion, playTime, gameMode, biome, wave, luck, party }`. Live, JSON-serialisable, zero cost.
- The Phaser `Game` instance is not on `window`, but is reachable:

  ```js
  const game = Phaser.Display.Canvas.CanvasPool.pool[0].parent.game;
  const scene = game.scene.getScene('battle'); // BattleScene
  ```

- `BattleScene` exposes the full run:
  `party`, `currentBattle`, `money`, `score`, `pokeballCounts`, `gameData`,
  `arena`, `modifierBar`, `enemyModifierBar`, `phaseManager`, `gameMode`, `trainer`
- Current menu is readable as **text**, not pixels:
  - `scene.ui.mode` — UiMode enum int (e.g. `32` = login/register)
  - `scene.ui.modeChain` — the mode stack
  - `scene.ui.getHandler()` — the active handler (48 registered), with `.cursor` and label objects (e.g. `buttonLabels[].text` → `["Login","Register"]`)

### Acting

- `scene.ui.processInput(button)` is a live function → drive the game by **button enum**, no synthetic keystrokes, no clicking canvas coordinates.
- Raw keyboard (`ArrowUp/Down/Left/Right`, `z`, `x`, `Enter`) also works as a fallback; Phaser listens on the document.

**Consequence:** a whole wave costs text, not images. Screenshots become an optional sanity check rather than the control loop.

## Architecture

```
Claude  ──MCP──>  pokerogue-mcp  ──CDP──>  Chrome  ──>  pokerogue.net
```

Thin wrapper. The server holds no game logic — the game is the source of truth. It connects to a Chrome instance over the DevTools Protocol and does `Runtime.evaluate` against the page.

## Tool surface (first cut)

| Tool | Does |
|---|---|
| `get_state` | Structured snapshot: wave, biome, mode, money, party (species/level/HP/moves/status), enemy field, held items |
| `read_menu` | Active UI mode + option labels + cursor position — "what can I press right now" |
| `press` | Send one button (`UP`/`DOWN`/`LEFT`/`RIGHT`/`ACTION`/`CANCEL`/`MENU`/…) |
| `screenshot` | Optional visual check, for when text state is ambiguous |

Later, if the loop proves too chatty: `select_option(label)` (move cursor to a named option and confirm in one call), `wait_for_mode(mode)`.

## Open questions

- **Button enum values.** `ui.processInput` takes ints from PokéRogue's `Button` enum; the mapping wasn't dumped during recon. Read it off the source repo or derive from `inputController.configs`.
- **UiMode enum.** Same — need the int→name table to make `read_menu` legible.
- **Account.** pokerogue.net has no guest mode: *"Log in or create an account to start. No email required!"* Only `Login` / `Register`. Plan is a throwaway account (random username + password, no email). Not yet created.
- **Phase timing.** Battles are async (animations, `phaseManager`). The server likely needs a "settled" check before returning state, or `press` will race the animation queue.
- **Chrome lifecycle.** Attach to an existing tab, or launch and own one?

## Non-goals

- Reimplementing game rules.
- Any kind of multiplayer, ranking, or account farming. One throwaway account, one agent, playing the game as a player would.
