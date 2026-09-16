# pokerogue-mcp

MCP server that lets Claude play [PokéRogue](https://pokerogue.net) — a browser roguelite where you fight wave after wave of Pokémon battles, shop between waves, and restart from wave 1 on a party wipe.

## Goal

Give an agent a **text-first** control loop over a live PokéRogue run. No pixel reading, no screenshot-per-action. Structured state in, button presses out.

## Running it

Requirements: Node ≥ 23.6 (runs `.ts` directly), Google Chrome, and a PokéRogue account already logged in inside the server's own Chrome profile (`~/.pokerogue-mcp/chrome-profile`; log in by hand once — the server never touches credentials, see [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5)).

### As a Claude Code plugin

The repo is its own plugin marketplace. The plugin bundles the MCP server and the `play-pokerogue` skill (the play loop, screen table, stuck/timeout handling):

```bash
claude plugin marketplace add IIxauII/pokerogue-mcp   # private repo: uses your git/gh credentials
claude plugin install pokerogue@pokerogue-mcp
```

Claude Code runs `npm ci --ignore-scripts` in its plugin cache on install, so there is no build step. Then, in any directory, ask Claude to play PokéRogue. The first time, log in by hand in the Chrome window the server opens. Update with `claude plugin marketplace update pokerogue-mcp && claude plugin update pokerogue@pokerogue-mcp`.

Releases are automatic: every push to `master` runs [semantic-release](.github/workflows/release.yml), which reads the [Conventional Commits](https://www.conventionalcommits.org/) since the last `v*` tag (`fix:` → patch, `feat:` → minor, `BREAKING CHANGE` → major), stamps the version into `package.json` and `.claude-plugin/plugin.json`, tags, and publishes GitHub release notes. `claude plugin update` only sees a change when that version moves, so commits on `master` must follow the convention — with squash merges, the PR title is the commit.

The server is declared in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json). Its `"timeout": 60000` is a documented requirement, not a tuning knob ([#20](https://github.com/IIxauII/pokerogue-mcp/issues/20)): the settle budget is 30 s and progress notifications do not extend the client's per-call limit.

### From a checkout

```bash
npm install
npm run smoke -- status          # attaches (launching Chrome if no debug port answers) and reports
npm run smoke -- read_menu       # what the game is asking right now
claude --plugin-dir .            # a session with this checkout's server and skill loaded
```

There is no project `.mcp.json`: a plugin at the repo root merges the root `.mcp.json` into its own servers, and a cwd-relative path there breaks once the plugin is copied into the cache. `--plugin-dir .` loads exactly what an installed plugin gets. Don't run it alongside an installed copy — two servers contend for one tab.

The server **attaches to an existing `pokerogue.net` tab on debug port 9222 if there is one, otherwise launches Chrome** with the persistent profile (#5's command). It never closes the tab or Chrome. One driver per tab: a lock at `~/.pokerogue-mcp/driver.lock` makes a second server report `tab_contended` and refuse to press, because [#6](https://github.com/IIxauII/pokerogue-mcp/issues/6) had three sessions interleaving presses on one live save.

Dev scripts: `npm run smoke -- <tool> '<json args>'` calls tools over real stdio; `node scripts/autoplay.ts --waves N` drives waves with a dumb policy and logs every call to `.cache/autoplay.jsonl` (the soak driver for [#25](https://github.com/IIxauII/pokerogue-mcp/issues/25)); `node scripts/eval.ts '<js body>'` evaluates against the live scene; `npm run enums:gen` regenerates the enum tables from the pinned game tag; `npm run randbats:gen` refreshes the coach's bundled moveset-prior snapshot (`--check` fails if it is stale, and the release refreshes it); `npm run drift:check` checks the escape ladder and the coach HUD's game-code deps against a candidate build (`ladder:drift` is kept as an alias).

## Tool surface

Seven tools, three of which act. The contract is [`docs/spec/v1-tool-surface.md`](docs/spec/v1-tool-surface.md).

| Tool | Acts? | Does |
|---|---|---|
| `status()` | no | Attached? Run live? Game version vs the pinned one, tab contention |
| `get_state(detail?)` | no | The settled snapshot: wave, turn, money, biome, active, enemy, party; `party` / `items` / `full` widen it |
| `read_menu()` | no | Composite screen id, option labels in cursor order, cursor, message text, `cancel_effect` |
| `select_option(label, expect_screen?)` | **yes** | Move the cursor to that label and commit with ACTION; returns messages crossed, the lean snapshot and the next menu |
| `press(button)` | **yes** | One raw button — the escape hatch |
| `start_run(species, slot?, overwrite?)` | **yes** | Cold `TITLE` → live wave 1 with those starters, refusing an occupied slot |
| `screenshot()` | no | A PNG for the human |

Every result carries `status` ∈ `ok` / `timed_out` / `stuck` / `run_over` / `run_interrupted` plus `wave` and `screen`. `timed_out` is not fatal — the next `get_state` or `read_menu` resumes the wait. `stuck` names a `dead_end` / `loop` / `hang` verdict and hands over the per-screen escape ladder; the server never escapes on its own. There is no `back()`: CANCEL means four different things across screens, so the agent leaves a screen by selecting the option that leaves it.

Measured: with the dumb policy in `scripts/autoplay.ts`, a decision costs ~0.6 s wall clock when the game is idle, ~6–9 s when a turn resolves, and a wave is 10–20 acting calls. **Played unattended by Claude Sonnet** (headless Claude Code through the then-checked-in `.mcp.json`, now the plugin): waves 1–8 to a wipe in 106 calls, 450 s, $2.07 — ~13 calls and $0.26 a wave, one `ambiguous` label, no stuck, no timeout. Details in [`docs/soak/2026-09-13-sonnet.md`](docs/soak/2026-09-13-sonnet.md).

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
  form is `src/game/js.ts`; see
  [#9](https://github.com/IIxauII/pokerogue-mcp/issues/9) for the measurements and
  the ruled-out alternatives.

  Two things not to do, both of which look fine until they aren't: don't write
  `pool[0].parent.game` — only 1 of ~1670 entries has a `.game`, so the bare index is
  load-bearing and incidental. And don't fall back to `game.scene.scenes[0]` — that is the
  **`LoadingScene`** until `battle-scene.ts` removes it. Key by `'battle'`.

- `BattleScene` exposes the full run:
  `party`, `currentBattle`, `money`, `score`, `pokeballCounts`, `gameData`,
  `arena` (its biome is `arena.biomeId`), `modifierBar`, `enemyModifierBar`, `phaseManager`, `gameMode`, `trainer`
- Current menu is readable as **text**, not pixels:
  - `scene.ui.mode` — UiMode enum int (e.g. `32` = login/register)
  - `scene.ui.modeChain` — the mode stack
  - `scene.ui.getHandler()` — the active handler (48 registered), with `.cursor` and label objects (e.g. `buttonLabels[].text` → `["Login","Register"]`)

### Acting

- `scene.ui.processInput(button)` is a live function → drive the game by **button enum**, no synthetic keystrokes, no clicking canvas coordinates. Its return value lies in both directions, so nothing judges a press by it.
- Raw keyboard (`ArrowUp/Down/Left/Right`, `z`, `x`, `Enter`) also works as a fallback. Phaser binds its keyboard listeners to **`window`**, not the document — `getEventListeners(document)` has no `keydown` at all. Dispatched keys still arrive, because they bubble to `window`.

**Consequence:** a whole wave costs text, not images. Screenshots become an optional sanity check rather than the control loop.

## Architecture

```
Claude  ──MCP──>  pokerogue-mcp  ──CDP──>  Chrome  ──>  pokerogue.net
```

Thin wrapper. The server holds no game logic — the game is the source of truth. It holds one CDP page session against the tab and does `Runtime.evaluate` against the page, rediscovering the scene on every call. Focus emulation is re-applied on every attach so a hidden or minimised window keeps the Phaser loop running ([#23](https://github.com/IIxauII/pokerogue-mcp/issues/23)).

```
src/server.ts        MCP entry: seven tools over stdio
src/driver.ts        settle → press → auto-advance → detect → envelope
src/settle.ts        the settle loop and its budgets (#14)
src/game/js.ts       the JavaScript injected into the tab: locator, predicate, menu reader, snapshot
src/cdp/             the page session (attach-else-launch) and the driver lock
src/screen.ts        composite screen ids
src/enums/           generated from the pinned game tag (scripts/gen-enums.ts)
src/escape-ladder/   the hand-curated per-screen escape ladder and its drift check (#15)
src/stuck/           the stuck detector and hang watch (#16)
```

## Map

The effort is mapped as [#1 Map: pokerogue-mcp v1](https://github.com/IIxauII/pokerogue-mcp/issues/1) — the destination, every decision locked so far with its evidence, and what is still fog. `CONTEXT.md` is the vocabulary; ADRs are in `docs/adr/`.

## Non-goals

- Reimplementing game rules.
- Any kind of multiplayer, ranking, or account farming. One account, one agent, playing the game as a player would. (v1 uses the dev's own existing account, decided in [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) — so agent mistakes land on a real save. The server never handles credentials; the session rides on a persisted cookie.)
- Playing *well*. The finish line is surviving a run unattended, not score or wave depth.
