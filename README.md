# pokerogue-mcp

MCP server that lets Claude play [PokéRogue](https://pokerogue.net) — a browser roguelite where you fight wave after wave of Pokémon battles, shop between waves, and restart from wave 1 on a party wipe.

## Goal

Give an agent a **text-first** control loop over a live PokéRogue run. No pixel reading, no screenshot-per-action. Structured state in, button presses out.

## Why it's feasible (verified 2026-09-12)

Recon against the live site, Phaser 3.90.0. Everything below was confirmed working in a real browser session via CDP.

### Reading state

- `window.gameInfo` → `{ gameInfoVersion, playTime, gameMode, biome, wave, luck, party }`. JSON-serialisable, and the only thing the game deliberately puts on `window`. (`gameInfoVersion` is this payload's schema version, hardcoded in `battle-scene.ts` — it is not a build id. The build is `game.config.gameVersion`.) **Not** a state source, though: it is written on wave transitions and turn init only, so it is *stale* at settled decision points — at a reward screen it has been observed a full turn's damage plus a level-up behind. And it is no cheaper than reading the whole scene (0.18 ms vs 0.21 ms, measured). `get_state` is built on the scene; `gameInfo` keeps only a liveness check. See [#9](https://github.com/IIxauII/pokerogue-mcp/issues/9) and [#10](https://github.com/IIxauII/pokerogue-mcp/issues/10).
- The Phaser `Game` instance is not on `window`, but is reachable — via Phaser's
  module-level `CanvasPool`, the only module-level object in Phaser 3.90.0 that retains a
  live `Game`. **Scan the pool; never index it:**

  ```js
  // pool[i].parent is the TextureManager (which carries .game) — NOT the Game itself.
  const entry = Phaser.Display.Canvas.CanvasPool.pool.find(e => e && e.parent && e.parent.game);
  const game = entry.parent.game;
  const scene = game.scene.getScene('battle'); // BattleScene — === the globalScene singleton
  ```

  A lean settled read through this costs **0.21 ms / 338 bytes**, measured. The production
  form is layered and guarded; see
  [#9](https://github.com/IIxauII/pokerogue-mcp/issues/9) for it, the measurements, and
  the ruled-out alternatives.

  Two things not to do, both of which look fine until they aren't: don't write
  `pool[0].parent.game` — only 1 of ~1670 entries has a `.game`, so the bare index is
  load-bearing and incidental. And don't fall back to `game.scene.scenes[0]` — that is the
  **`LoadingScene`** until `battle-scene.ts` removes it. Key by `'battle'`.

- `BattleScene` exposes the full run:
  `party`, `currentBattle`, `money`, `score`, `pokeballCounts`, `gameData`,
  `arena`, `modifierBar`, `enemyModifierBar`, `phaseManager`, `gameMode`, `trainer`
- Current menu is readable as **text**, not pixels:
  - `scene.ui.mode` — UiMode enum int (e.g. `32` = login/register)
  - `scene.ui.modeChain` — the mode stack
  - `scene.ui.getHandler()` — the active handler (48 registered), with `.cursor` and label objects (e.g. `buttonLabels[].text` → `["Login","Register"]`)

### Acting

- `scene.ui.processInput(button)` is a live function → drive the game by **button enum**, no synthetic keystrokes, no clicking canvas coordinates.
- Raw keyboard (`ArrowUp/Down/Left/Right`, `z`, `x`, `Enter`) also works as a fallback. Phaser binds its keyboard listeners to **`window`**, not the document — `getEventListeners(document)` has no `keydown` at all. Dispatched keys still arrive, because they bubble to `window`.

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

Superseded. The effort is mapped as [#1 Map: pokerogue-mcp v1](https://github.com/IIxauII/pokerogue-mcp/issues/1) — the destination, the decisions locked so far, the live tickets, and what is still fog. The enum tables ([#2](https://github.com/IIxauII/pokerogue-mcp/issues/2)), the settled-game predicate ([#3](https://github.com/IIxauII/pokerogue-mcp/issues/3)) and the menu-handler families ([#4](https://github.com/IIxauII/pokerogue-mcp/issues/4)) are answered and closed, each linking to its findings on a `research/*` branch.

One correction the research forced on the tool surface above: `ACTION` is button **5**, not 4 — `SUBMIT` sits at 4.

## Non-goals

- Reimplementing game rules.
- Any kind of multiplayer, ranking, or account farming. One account, one agent, playing the game as a player would. (v1 uses the dev's own existing account, decided in [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) — so agent mistakes land on a real save. The server never handles credentials; the session rides on a persisted cookie.)
