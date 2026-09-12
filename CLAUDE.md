# pokerogue-mcp

An MCP server that lets Claude play PokéRogue. See `README.md` for what it is and `CONTEXT.md` for the domain vocabulary — read `CONTEXT.md` before naming anything.

## Agent skills

### Issue tracker

GitHub issues on the private repo `IIxauII/pokerogue-mcp`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain

Single-context. The glossary is `CONTEXT.md` at the repo root; ADRs, when there are any, go in `docs/adr/`.

## Wayfinding

This effort is mapped as [#1 Map: pokerogue-mcp v1](https://github.com/IIxauII/pokerogue-mcp/issues/1) — the destination, the decisions locked so far, and what is still fog. Tickets are sub-issues of the map, labelled `wayfinder:<type>`, with native GitHub issue dependencies for blocking. Continue the effort with `/wayfinder 1`.
