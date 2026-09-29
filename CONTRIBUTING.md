# Contributing

Contributor-facing notes that used to live in the README: the release pipeline and the dev scripts.

## Releases

Releases are automatic: every push to `master` runs [semantic-release](.github/workflows/release.yml), which reads the [Conventional Commits](https://www.conventionalcommits.org/) since the last `v*` tag (`fix:` → patch, `feat:` → minor, `BREAKING CHANGE` → major), stamps the version into `package.json` and `.claude-plugin/plugin.json`, tags, and publishes GitHub release notes. `claude plugin update` only sees a change when that version moves, so commits on `master` must follow the convention — with squash merges, the PR title is the commit.

The browser extension releases on its own `extension-v*` tags, and its Chrome and Firefox builds submit themselves. Safari has no store: after every extension release, `npm run release:safari -- <version>` signs, notarizes and uploads the macOS build by hand, on a Mac ([runbook](docs/runbooks/safari-release.md)).

The MCP server is declared in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json). Its `"timeout": 60000` is a documented requirement, not a tuning knob ([#20](https://github.com/IIxauII/coachemon/issues/20)): the settle budget is 30 s and progress notifications do not extend the client's per-call limit.

## Running from a checkout

```bash
npm install
npm run smoke -- status          # attaches (launching Chrome if no debug port answers) and reports
npm run smoke -- read_menu       # what the game is asking right now
claude --plugin-dir .            # a session with this checkout's server and skill loaded
```

There is no project `.mcp.json`: a plugin at the repo root merges the root `.mcp.json` into its own servers, and a cwd-relative path there breaks once the plugin is copied into the cache. `--plugin-dir .` loads exactly what an installed plugin gets. Don't run it alongside an installed copy — two servers contend for one tab.

The server **attaches to an existing `pokerogue.net` tab on debug port 9222 if there is one, otherwise launches Chrome** with the persistent profile (`~/.coachemon/chrome-profile`; log in by hand once — the server never touches credentials, see [#5](https://github.com/IIxauII/coachemon/issues/5)). It never closes the tab or Chrome. One driver per tab: a lock at `~/.coachemon/driver.lock` makes a second server report `tab_contended` and refuse to press, because [#6](https://github.com/IIxauII/coachemon/issues/6) had three sessions interleaving presses on one live save. The lock is taken the first time a server acts, not when it starts, so any number of servers can read the same tab while one plays it.

## Dev scripts

- `npm run smoke -- <tool> '<json args>'` — calls tools over real stdio
- `node scripts/autoplay.ts --waves N` — drives waves with a dumb policy and logs every call to `.cache/autoplay.jsonl` (the soak driver for [#25](https://github.com/IIxauII/coachemon/issues/25))
- `node scripts/eval.ts '<js body>'` — evaluates against the live scene
- `npm run enums:gen` — regenerates the enum tables from the pinned game tag (`--check` fails if `src/enums/generated.ts` is stale, and CI runs it on every PR)
- `npm run randbats:gen` — refreshes the coach's bundled moveset-prior snapshot (`--check` fails if it is stale; `.github/workflows/randbats.yml` re-runs it weekly and opens a pull request carrying the new snapshot and the regenerated goldens)
- `npm run drift:check` — checks the escape ladder and the coach HUD's game-code deps against a candidate build (`ladder:drift` is kept as an alias)
- `npm run oracle:encounter` — plays each Mystery Encounter headless in the pinned clone and checks the coach's encounter card against what the game actually does (its header says what the clone needs first)

Only the enums check is a CI gate: it rebuilds from an immutable pin, so a mismatch is always real drift, while randbats rebuilds from live upstream and would go red the day the data moves.

## Architecture

```
Claude  ──MCP──>  Coachemon  ──CDP──>  Chrome  ──>  pokerogue.net
```

Thin wrapper. The server holds no game logic — the game is the source of truth. It holds one CDP page session against the tab and does `Runtime.evaluate` against the page, rediscovering the scene on every call. Focus emulation is re-applied on every attach so a hidden or minimised window keeps the Phaser loop running ([#23](https://github.com/IIxauII/coachemon/issues/23)).

```
src/server.ts        MCP entry: seven tools over stdio
src/driver.ts        settle → press → auto-advance → detect → envelope
src/settle.ts        the settle loop and its budgets (#14)
src/game/port.ts     the typed game operations the driver reaches the game through (#127)
src/game/link-game.ts that port over a GameLink; a page throw never leaves it as a throw
src/game/link.ts     GameLink, the transport seam: one method per store command
src/page/            the command handlers that run in the tab: locator, probe, menu reader, snapshot, acts
src/protocol/        the store command table, hub frames and ports, shared with the hub and the extension
src/cdp/             the CDP link, the page session (attach-else-launch) and the driver lock
src/screen.ts        composite screen ids
src/enums/           generated from the pinned game tag (scripts/gen-enums.ts)
src/escape-ladder/   the hand-curated per-screen escape ladder and its drift check (#15)
src/stuck/           the stuck detector and hang watch (#16)
```

## Where things are documented

The effort is mapped as [#1 Map: Coachemon v1](https://github.com/IIxauII/coachemon/issues/1) — the destination, every decision locked so far with its evidence, and what is still fog. `CONTEXT.md` is the vocabulary; ADRs are in `docs/adr/`. The tool contract is [`docs/spec/v1-tool-surface.md`](docs/spec/v1-tool-surface.md).
