# Coachemon

An MCP server that lets Claude play PokéRogue. See `README.md` for what it is and `CONTEXT.md` for the domain vocabulary — read `CONTEXT.md` before naming anything.

## Agent skills

### Issue tracker

GitHub issues on the public repo `IIxauII/coachemon`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`. Every pushed branch, `research/*` included, is world-readable: keep personal details, account names and session ids out of it.

### Triage labels

The five default triage labels, each named after its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. The glossary is `CONTEXT.md` at the repo root (not `GLOSSARY.md`); ADRs are in `docs/adr/`. See `docs/agents/domain.md`.

### Comments

See `docs/agents/comments.md` before you write or judge a comment.

## Commits

**Never write GitHub's CI suppression marker into a commit message** — the two-word bracketed token that `.releaserc.json` puts on a `chore(release)` commit. GitHub matches it anywhere in the message, a sentence merely *talking about* it included, and then runs no workflow at all on that push. A pull request with zero runs looks exactly like one that passed: nothing is red, and `gh pr checks` reports no checks rather than a failure (#275). Two sessions tripped this in one afternoon while writing about it (#258, #259).

A workflow file, a PR body, an issue comment and this file can all spell it freely — only the commit message counts. So when a commit touches CI or the release, *describe* the marker instead of writing it.

The release is the one commit that is supposed to carry it: `npm test` runs in `release.yml` before the bot commits, so the release commit needs no run of its own.

## Worktrees

Agent worktrees may share the main checkout's dependencies by symlinking `node_modules`, but only when the main `node_modules` is a real directory and the current directory is not the main checkout. Otherwise run `npm ci` in the worktree. A link from the main checkout to itself makes every `npm run` exit 194 with no output (#87).

The main checkout's `node_modules` can also be *stale* — it has been seen missing `ws`, a declared dependency, which
leaves the linked worktree failing `npm test` with `ERR_MODULE_NOT_FOUND` before any code is touched (#298). So check a
declared package is actually there before linking, and fall back to `npm ci` when it is not.

```sh
MAIN=/Users/xau/Documents/projects/coachemon
[ "$PWD" != "$MAIN" ] && [ -d "$MAIN/node_modules" ] && [ ! -L "$MAIN/node_modules" ] && [ -d "$MAIN/node_modules/ws" ] \
  && ln -s "$MAIN/node_modules" node_modules || npm ci
```

Link `.cache` the same way. `npm run drift:check` in a fresh worktree leaves a **bare** pinned clone — no submodules, no
`node_modules` — and anything that drives the real game (`npm run oracle:encounter`) refuses until it is provisioned;
provisioning it again re-fetches the 815 MB `assets` submodule for no gain (#296).

```sh
[ "$PWD" != "$MAIN" ] && [ -d "$MAIN/.cache" ] && ln -s "$MAIN/.cache" .cache
```

## Contended tab

**Find the holder, then message only its session.** `tab_contended` gives the server pid as `holder`. The hub's
`contended` gives none, so take candidates from `pgrep -fl src/server.ts` (every session with the plugin runs one).
`ps -o ppid= -p <server-pid>` is its Claude session; `~/.claude/sessions/<session-pid>.json` has that session's `name`.

**The tab frees only when that server exits**: there is no release tool, and the classifier denies killing another
session's server. A holder mid-test keeps the tab. For a stale one (no live session, or its session is done), the user
runs `! kill <server-pid>`.

## Sideload builds

**A build the user loads by hand** (unpacked or zip) goes to `~/Downloads`: give that path, not a worktree's
`extension/.output/`. Swap a rebuild into the folder already loaded. Orion keys an unpacked extension by its path
(#418), so a new folder loads as a second Coachemon without the site grant.

## graphify

**The graph is committed.** `graphify-out/graph.json`, the graph of files, symbols and the links between them, is
tracked, so every clone and worktree checks it out with its branch. `.githooks/pre-commit` rebuilds and stages it with
each commit, in worktrees too; a clone runs `sh scripts/graphify/setup.sh` once to turn the hook and the graph's merge
driver on. The rest of `graphify-out/` is built locally. Between commits the graph lags your uncommitted edits: run
`graphify update .` before a structure question about code you just changed. Without graphify on `PATH` this whole
section is skipped.

**A structure question goes to the graph, a literal lookup to grep.** A *structure question* asks how code connects:
who calls X, what X imports or re-exports, what depends on X, what a change to X reaches. Answer it with
`graphify explain "<file or symbol>" --all` (every edge, with line numbers) or `graphify path "<A>" "<B>"`, then read
only the lines those edges point at. Pass a node id when a bare name like `press()` matches several nodes, and use
`graphify query "<question>"` only to find a starting node: its free-text matching drags in unrelated neighbours. A
*literal lookup* (an error code or other string, a constant, an npm script, config, a doc line) goes straight to grep:
the graph holds symbols and imports, not string literals or `package.json`. Confirm in source any edge marked
`INFERRED` and any hop between processes (server → hub → extension → page), which the graph lacks. Put this split in
every subagent brief that explores code. It overrides the hook's "MANDATORY: run graphify" nudge on a literal lookup.
`CONTEXT.md` and `docs/adr/` are read directly.

In a four-question comparison the graph matched grep on accuracy at about a quarter more tokens, and found more only
on structure questions (a module's outside importers, which tool never takes the tab lock).

**Broad navigation** goes through `graphify-out/wiki/index.md` when it exists, and `graphify-out/GRAPH_REPORT.md` only
for an architecture review or when explain and path fall short.
