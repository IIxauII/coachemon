---
name: pin-bump
description: Bump the PokéRogue pin (`pinned` in src/escape-ladder/reviewed.json) to a newer game version, end to end, from the drift check to the PR. Use when asked to bump the pin, move Coachemon to a new PokéRogue release, or when the live game is past the pin.
---

# Pin bump

The pin bump as a workflow. `docs/runbooks/pin-bump.md` is the reference behind every step: the drift categories, the
clone setup, the stamp and its harness re-check, and what each re-check failure means. Read it once before step 1.

`<pin>` is `pinned.gameVersion` in `src/escape-ladder/reviewed.json`. `<new>` is the version the owner named, else the
latest release: `gh release view -R pagefaultgames/pokerogue --json tagName`.

## 1. Setup

1. `git fetch origin`, then enter a worktree off `origin/master` (EnterWorktree, name `pin-bump-v<new>`).
2. Link the main checkout's `node_modules` and `.cache` into it exactly as `CLAUDE.md` §Worktrees says.
3. `npm run drift:check -- --version <new>` clones `.cache/pokerogue/v<new>`. Its report is step 2's input; keep it.
4. Provision that clone for the harness: submodules and pnpm, per the runbook's setup block. A clone that already has
   `node_modules` and non-empty `assets`/`locales` is done.
5. `.cache/pokerogue/v<pin>` must exist too, for the diff: `npm run drift:check` at the pin clones it if absent.

Done when both checkouts exist and `v<new>` has `node_modules`, `assets` and `locales`.

## 2. Fan out

Dispatch these subagents in one message, so they run in parallel. Their briefs are in [fan-out.md](fan-out.md); hand
each its brief with `<pin>`, `<new>` and its slice filled in.

- **Release notes**: one per game release after `<pin>` up to `<new>` (the brief says how to list them).
- **Diff**: one per registry area in `scripts/game-reads/registry/` (`page`, `server`, `hud`, `harness`, `templates`), each over
  the game's changes from `<pin>` to `<new>` scoped to the reads its area registers.
- **Checks**: one that runs `npm run reads:check`, `npm run drift:check -- --version <new>` and
  `npm run bump:suite -- --version <new>` (a quarter of an hour) and returns every named entry and failed step.

Done when every subagent has reported. One that failed to report is dispatched again, never skipped.

## 3. Analyze

Merge the reports into one **change list** at `.cache/pin-bump/v<new>.md`. Each item is one upstream change, with:
the game ref or release-note line, where it was found (drift category, suite step, diff, release note), the repo files
it touches (`path:line`), and its verdict:

- **fix**: our code, registry, ladder, HUD, harness or generated files must change. Name the change.
- **follow-up**: it changes what the coach should advise (a move, an ability, a trainer, a pool, a new mechanic) and
  no code is wrong today. File it now: `gh issue create` per `docs/agents/issue-tracker.md`, after
  `gh issue list --search` finds no duplicate, as a sub-issue of the bump's ticket when there is one. Record the URL.
- **no effect**: say why in one line.

Done when every drift entry, every `reads:check` finding, every failed suite step, every diff finding and every
release-note item sits on the list exactly once, and every follow-up has its issue URL.

## 4. Fix, then re-check

Work the **fix** items. Per drift category, the runbook says what each one asks of you. Generated enums are part of
the bump: regenerate them with `npm run enums:gen -- --version <new> --source .cache/pokerogue/v<new>`, then read the
diff of `src/enums/generated.ts` and treat every shifted value as a fix item of its own. A HUD golden that changes is
updated (`node skills/coachemon/scripts/test/run.mjs --update <name>`) only once its diff is understood and on the list.

Then re-check, and loop back to the fix items until all three are clean in one pass:

1. `npm run reads:check` passes.
2. `npm run drift:check -- --version <new>` names nothing but MOVED and UNREVIEWED entries, each already on the change
   list as re-read. Those two clear only when the stamp records the new hashes.
3. `npm run bump:suite -- --version <new>` passes every step.

Then stamp: `npm run drift:check -- --version <new> --stamp`. It runs the harness re-check on every known fight and
writes the pin only when all pass. A failure goes back to the fix items, read through the runbook's "When the re-check
fails". A known fight that no longer carries has to be played again live (the runbook's "Record a known fight
again"): that is the owner's account, so ask the owner before it.

Done when the stamp has written `pinned.gameVersion: <new>` and `recheck.gameVersion: <new>`, and `npm test` and
`npm run typecheck` pass with the new pin.

## 5. Live run, on the owner's go

The live MCP smoke run plays on the owner's real account, so it waits for their yes, asked each time. Check
`npm run smoke -- status` reports pokerogue.net serving `<new>`; until it does, the live run cannot happen yet: say so
and go on to step 6.

Ask with AskUserQuestion: run it now, and in which save slot that holds nothing of theirs, or leave it out of this
bump. On a yes, from the worktree, so the branch's server plays:

1. `npm run smoke -- read_starters`, then `npm run smoke -- start_run '{"species":[…],"slot":<slot>,"overwrite":true}'`
   with three starters the read offered.
2. `node scripts/autoplay.ts --waves 3`, which plays through a shop on the way.
3. Read `.cache/autoplay.jsonl`: every screen known, no stuck report, no refused call.

What it finds goes on the change list and back through step 4. Done when the run passed, or the owner left it out.

## 6. PR

Commit on the worktree's branch (`reviewed.json` with the fixes), push, and open the PR with `gh pr create` against
`master`. The body, from the change list:

- **Upstream**: what changed in the game, per release, with the refs that mattered.
- **Changed**: what this PR changes and why, each tied to its upstream item.
- **Filed**: each follow-up issue, linked.
- **Checks**: `reads:check` and `drift:check` clean, each `bump:suite` step's result, the re-check's fights (carried
  or replayed), and the live run's result or that the owner left it out.

Done when the PR is open and its URL is in your final message.
