# pokerogue-mcp

MCP server that lets Claude play [PokéRogue](https://pokerogue.net) — a browser roguelite where you fight wave after wave of Pokémon battles, shop between waves, and restart from wave 1 on a party wipe.

## Goal

Give an agent a **text-first** control loop over a live PokéRogue run. No pixel reading, no screenshot-per-action. Structured state in, button presses out.

## Why it's feasible (verified 2026-09-12)

Recon against the live site, Phaser 3.90.0. Everything below was confirmed working in a real browser session via CDP.

### Reading state

- `window.gameInfo` → `{ gameInfoVersion, playTime, gameMode, biome, wave, luck, party }`. Live, JSON-serialisable, zero cost. (`gameInfoVersion` is this payload's schema version, hardcoded in `battle-scene.ts` — it is not a build id. The build is `game.config.gameVersion`.)
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

Superseded. The effort is mapped at `.scratch/pokerogue-mcp-v1/map.md` — decisions made so far, live tickets, and what is still fog. The enum tables, the settled-game predicate and the menu-handler families are all answered there, each pointing at findings on a `research/*` branch.

## Non-goals

- Reimplementing game rules.
- Any kind of multiplayer, ranking, or account farming. One throwaway account, one agent, playing the game as a player would.
