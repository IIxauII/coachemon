# Coachemon

An MCP server that lets Claude play PokéRogue. See `README.md` for what it is and `CONTEXT.md` for the domain vocabulary — read `CONTEXT.md` before naming anything.

## Agent skills

### Issue tracker

GitHub issues on the private repo `IIxauII/coachemon`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain

Single-context. The glossary is `CONTEXT.md` at the repo root; ADRs, when there are any, go in `docs/adr/`.

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

## Wayfinding

**No map is live.** All four are closed, kept for the decisions indexed on them, not maps to add to: [#1 Map: Coachemon v1](https://github.com/IIxauII/coachemon/issues/1) (the shipped MCP server), [#98 Map: HUD as a browser extension](https://github.com/IIxauII/coachemon/issues/98), [#124 Map: architecture deepening](https://github.com/IIxauII/coachemon/issues/124) and [#78 Map: coach quality](https://github.com/IIxauII/coachemon/issues/78) (79 tickets, closed with its fog left standing — the coach's gates and weights are verified against mocks and the pinned source, never a live run).

So a fresh effort **charts a new map** with `/wayfinder <idea>`; it does not continue an old one. A ticket parented to a closed map lands off every frontier query, so a session that starts from it looks like it has no work to do — check a map is open before parenting to it (#316 was filed against #1 this way).

Issues outside a map are ordinary `gh issue` work, not wayfinder tickets: #210 and #240 (Safari extension) are the standing example.

Tickets are sub-issues of their map, labelled `wayfinder:<type>`, with native GitHub issue dependencies for blocking.
