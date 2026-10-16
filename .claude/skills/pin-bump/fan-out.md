# Fan-out briefs

One brief per subagent kind. Fill in `<pin>`, `<new>` and the slice, and paste the brief as the subagent's prompt.
Every brief ends on the same report shape, so step 3 can merge them: one **finding** per line, each with the game ref
or note, what changed, the repo files it touches as `path:line`, and a proposed verdict (fix, follow-up, no effect).

## Release notes (one per release)

List the releases with
`gh release list -R pagefaultgames/pokerogue --limit 100 --exclude-pre-releases --json tagName,publishedAt`, and keep
each tag above `v<pin>` up to `v<new>`, compared numerically.

> Read PokéRogue's release notes for `<tag>`: `gh release view <tag> -R pagefaultgames/pokerogue`. For every item in
> them, decide whether it can touch Coachemon's tooling (a screen, UI mode, phase, menu, starter select, shop or reward
> flow, challenge, save format, enum, data table) or the coach's advice (a move, ability, item, trainer, pool, level
> curve or new mechanic). Grep this repo (`src/`, `skills/coachemon/`, `scripts/`) for the names the item mentions to
> find what reads them. Report every item, including the ones that touch nothing, as findings: tooling items propose
> **fix**, advice-only items propose **follow-up**, the rest **no effect**. Done when every item of the notes is a
> finding.

## Diff (one per registry area)

> Compare PokéRogue `v<pin>` with `v<new>` for what `scripts/game-reads/registry/<area>.ts` registers. The checkouts
> are `.cache/pokerogue/v<pin>` and `.cache/pokerogue/v<new>`; diff them with
> `git diff --no-index --stat .cache/pokerogue/v<pin>/src .cache/pokerogue/v<new>/src`, then file by file. For each
> entry, at each of its `at` refs: is the symbol still there and unchanged, renamed (find the new name), removed,
> moved to another file, or changed in shape (a field's type, a table's row shape, a method's arguments or what it
> calls)? For each `GameSet`, list members the game added or dropped. For each `Mirror`, say whether the data it
> copies changed. Then read the repo code that uses each changed entry (`grep` its `name`) and say what breaks.
> Report a finding per changed entry and per added or dropped member, and one line naming the entries that did not
> change. Done when every entry of the area is either a finding or on that line.

## Checks

> In the bump's worktree, run `npm run reads:check`, `npm run drift:check -- --version <new>` and
> `npm run bump:suite -- --version <new>` (a quarter of an hour: run it in the background and wait for it). Report each
> as findings: every entry `reads:check` or `drift:check` names, with its category (MOVED, MISSING, UNREVIEWED,
> MISPLACED, ADDED, SHIFTED, UNREGISTERED, STALE) and the dependents it names; every `bump:suite` step that failed,
> with its log path and the first error in that log, read far enough to say what in the game or our code caused it.
> Done when every named entry and every failed step is a finding.
