---
name: import-fights
description: Import the fights recorded under COACHEMON_CAPTURE=1 into the fight library, end to end, from a branch off origin/master to the PR. Use when asked to import fights, when a session is told recorded fights are waiting for import, or on /import-fights.
---

# Import fights

The fights waiting in the coachemon home (`$COACHEMON_HOME`, else `~/.coachemon`) under `fights/`, brought into the
**fight library** (`src/solver/fixtures/library/`) on a PR. `npm run library:import` does the work; `CONTRIBUTING.md`
says what it merges, replays and lists. This skill is the wiring around it. Read `CONTEXT.md` §Fight library once.

The repo is public: every pushed branch is world-readable, before any merge. The library holds no account name or
session id, but a Pokémon's nickname goes out with it.

## 1. Anything waiting?

`npm run library:import -- --count`, from any checkout. `0`: say no fights are waiting, and stop.

## 2. Setup

1. `git fetch origin`, then enter a worktree off `origin/master` (EnterWorktree, name `import-fights-<YYYY-MM-DD>`), on
   a branch `test/import-fights-<YYYY-MM-DD>`.
2. Link the main checkout's `node_modules` and `.cache` into it exactly as `CLAUDE.md` §Worktrees says. The import
   writes the library of the checkout it runs in, so it runs here, never in the main checkout.
3. The replay needs the pinned clone (`pinned.gameVersion` in `src/escape-ladder/reviewed.json`, `<pin>`):
   `.cache/pokerogue/v<pin>` with `node_modules`, `assets` and `locales`. Missing: `npm run clone:provision -- --version
   <pin>`. Without it every new oracle line fails as not loading, and the import still moves the fights aside.

## 3. Import

`npm run library:import > <scratchpad>/import.txt`: its stdout is the report and the PR body's source. Per fight it
prints whether it is new or merged, the files added, the statistics entries appended, any turn kept from another
position, each new oracle line that failed its replay, and the nicknames; then the totals. A replay failure never stops
the import. Stderr carries the clone's own test run, the game's warnings and an `Unhandled Errors` block included, even
when every line still wins: only stdout says how a replay went.

The fights are now moved aside to `<home>/fights-imported/<when>/`. If anything after this fails and the PR is lost,
move those folders back into `<home>/fights/` and start again from step 2.

`git status` shows changes under `src/solver/fixtures/library/` and nowhere else. Then
`node --test scripts/release/plugin-copy.test.ts` passes: none of the library ships.

## 4. Nicknames, before anything leaves the machine

When the import listed nicknames, show them to the owner and wait for their yes before step 5: pushing the branch
publishes them. A no: leave the branch unpushed, move the fights back as step 3 says, and stop.

## 5. Commit, push, PR

Commit the library with `test(solver): import <n> fights into the fight library`, the fight names in the body. Never
write GitHub's CI skip marker into the message, not even to describe it (`CLAUDE.md` §Commits): a commit carrying it
gets no CI run, which looks like a pass.

Push, then `gh pr create` against `master`. The body, from step 3's output:

- **Imported**: one line per fight: its name, new or merged, the files added, the statistics entries appended, and any
  turn the library kept from another position.
- **Replay failures**: each oracle line that failed, by fight and turn, with how it failed, or "none".
- **Nicknames**: every one listed, or "none".

Paths in the body are repo-relative or start at `<home>`: the import's own output names the home's absolute path,
which holds the owner's user name.

Done when the PR is open and its URL is in your final message.
