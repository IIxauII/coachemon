# Map: pokerogue-mcp v1

Label: `wayfinder:map`

## Destination

A working `pokerogue-mcp` in this repo that Claude Code connects to over stdio and uses to play a live PokéRogue run unattended — start a run, fight wave after wave, handle shop/reward/party menus, until the party wipes — driven by text state and button/option calls, with screenshots as an optional sanity check only.

## Notes

**Domain:** browser-game automation. Chrome DevTools Protocol against a live `pokerogue.net` tab running Phaser 3.90.0. The game is the source of truth; the server holds no game logic. See `README.md` for the verified recon and `CONTEXT.md` for vocabulary.

**Execution is in scope.** This map overrides wayfinder's plan-only default: build tickets live on the map alongside decision tickets. The map is done when an unattended run has actually been played.

**Skills every session should consult:** `mattpocock-skills:grilling` + `mattpocock-skills:domain-modeling` by default; `mattpocock-skills:research` for research tickets; `mattpocock-skills:prototype` for prototype tickets; `mattpocock-skills:codebase-design` when shaping the tool surface; `mattpocock-skills:tdd` once implementation starts.

**Locked at charting** (not ticket-backed; these framed the map):

- **Stack:** TypeScript + `@modelcontextprotocol/sdk`, stdio transport.
- **Browser ownership:** attach to an existing `pokerogue.net` debug-port tab if one is present, otherwise launch and own Chrome with a persistent profile dir.
- **Settling:** after every action the server polls a cheap JS predicate until the game is quiet, then returns a fresh snapshot. Every tool call returns settled state.
- **Enums:** `Button` / `UiMode` int→name tables are code-generated from the public PokéRogue source at a pinned ref, not hand-transcribed.
- **Tool granularity:** semantic tools (`select_option(label)`) ship alongside raw `press` from day 1. Raw `press` always stays as the escape hatch.
- **State verbosity:** tiered. Lean default snapshot; `inspect_*` tools pull party/item detail on demand.
- **On wipe:** the server reports `run_over`; Claude decides whether to start a new run. No auto-restart.
- **Unknown UiMode:** degrade, never block. `read_menu` returns the mode int, its name if known, and whatever text it can scrape; Claude falls back to raw `press`.
- **Auth:** one throwaway account, registered manually once into the persistent Chrome profile. The server never handles credentials.

## Decisions so far

<!-- one line per closed ticket -->

- [Reading menus generically](issues/03-reading-menus.md): No uniform base class — `cursor` means a different thing per handler. `UI.handlers` is positionally indexed by `UiMode`, so `ui.mode` identifies the handler exactly. 48 handlers → **13 families**, only 7 on a run's critical path. The modal/form family (10 modes, incl. login) has **no cursor and ignores `processInput` entirely** — raw `press` is not a universal escape hatch. `setCursor` is safe from outside for 5 families, unsafe for party-list scrolling and settings. Recommendation: press-driven `select_option` by default. Findings on branch `research/reading-menus` at `.scratch/pokerogue-mcp-v1/research/03-reading-menus.md`, pinned to upstream `da1d0eff`.

## Not yet specified

- **Server scaffold and CDP session** — attach-else-launch discovery rule, tab matching, who cleans up, reconnect after a closed tab. Shape depends on what the prototype proves it needs.
- **Enum codegen script** — pinning strategy, where the generated module lands, how drift against the live build is detected.
- **Implementing each tool** — one ticket per tool, or grouped; depends on the v1 tool surface.
- **Timeout and error model** — what "settle timed out" returns, how a stuck run is reported, whether retries are automatic.
- **Packaging and registration** — how Claude Code is pointed at the server (`.mcp.json`, `npx`, local path), and the one-command start story.
- **Unattended soak and cost** — measuring tokens per wave and calls per decision; whether more semantic tools are needed to make a full run affordable.
- **Driving the modal/form family** — 10 modes that ignore `processInput` and need DOM text entry or a direct `config.buttonActions[i]()` call. Manual login dodges most of them; whether an unattended run hits any of the rest is unknown until the prototype logs its modes.
- **Recovery from stuck states** — the run is alive but the agent is lost. Detection and escape.

## Out of scope

- Reimplementing or simulating game rules. The live game is the only source of truth.
- Multiplayer, ranking, leaderboards, or running more than one account.
- Vision-driven control as the primary loop. Screenshots stay an optional sanity check.
- Playing *well*. The finish line is surviving a run unattended, not score, wave depth, or strategy quality.
- Browsers other than Chrome/Chromium, and any hosted or remote deployment of the server.
