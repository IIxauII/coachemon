# Coachemon

An MCP server that lets Claude play PokéRogue. See `README.md` for what it is and `CONTEXT.md` for the domain vocabulary — read `CONTEXT.md` before naming anything.

## Agent skills

### Issue tracker

GitHub issues on the private repo `IIxauII/coachemon`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain

Single-context. The glossary is `CONTEXT.md` at the repo root; ADRs, when there are any, go in `docs/adr/`.

## Worktrees

Agent worktrees may share the main checkout's dependencies by symlinking `node_modules`, but only when the main `node_modules` is a real directory and the current directory is not the main checkout. Otherwise run `npm ci` in the worktree. A link from the main checkout to itself makes every `npm run` exit 194 with no output (#87).

```sh
MAIN=/Users/xau/Documents/projects/coachemon
[ "$PWD" != "$MAIN" ] && [ -d "$MAIN/node_modules" ] && [ ! -L "$MAIN/node_modules" ] \
  && ln -s "$MAIN/node_modules" node_modules || npm ci
```

## Wayfinding

This effort is mapped as [#1 Map: Coachemon v1](https://github.com/IIxauII/coachemon/issues/1) — the destination, the decisions locked so far, and what is still fog. Tickets are sub-issues of the map, labelled `wayfinder:<type>`, with native GitHub issue dependencies for blocking. Continue the effort with `/wayfinder 1`.
