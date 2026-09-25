# Coachemon

An MCP server that lets Claude play PokéRogue. See `README.md` for what it is and `CONTEXT.md` for the domain vocabulary — read `CONTEXT.md` before naming anything.

## Agent skills

### Issue tracker

GitHub issues on the private repo `IIxauII/coachemon`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain

Single-context. The glossary is `CONTEXT.md` at the repo root; ADRs, when there are any, go in `docs/adr/`.

## Comments

**A comment earns its line by carrying a bug scar or a non-obvious gotcha** — the trap the next reader would walk into,
and what it cost the last time somebody did. The lazy-atlas retry in `90-render.js`, the flex-gap string fallback that
drew `YoungsterCharizard`, the `font` shorthand that silently un-bolds a row it does not name: each records something
the code cannot say and a passing test would not catch.

Design rationale is not that. Why a share is 0.234 and not 0.156, what was weighed and rejected, which costs were
accepted — that belongs in the ticket that decided it, which is where anyone revisiting the decision looks anyway. In
the source it goes stale the first time the value moves, and stale rationale is worse than none: `90-render.js` carried
389 comment lines of 661 (59%) against a 28% average across `hud/`, and one constant change falsified most of them
(#389).

So:

- **No section back-references.** A `(#349 §8)` hung on a line sends the reader to a document to learn what the line in
  front of them already says, and rots when the section is renumbered. Cite a ticket where it records a scar — `(#87)`,
  `(#275)` — never as a pointer to prose.
- **Constants ship bare.** No paragraph justifying a number. Where a derivation is worth keeping, one line of
  arithmetic beats ten of prose.
- **In a test, the assertion message is the comment.** A block restating what the `assert` under it already says is one
  more thing to keep in step, and it is the copy that will drift. Where the block says something the messages don't,
  that is a sign the messages are too thin — move the words into them.

**The bar binds what you write and what you touch, not the whole tree at once.** `90-render.js` and `rendertest.mjs`
were swept under #389; most of `hud/` and the `scripts/listing/` files still carry the `§` back-references the first
bullet bans. Clear one when you edit the line it sits on — that much is not a sweep, and it is how the rest goes.

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

