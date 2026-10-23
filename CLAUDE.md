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

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
