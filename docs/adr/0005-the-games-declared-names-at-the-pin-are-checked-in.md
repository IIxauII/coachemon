# The game's declared names at the pin are checked in, so `reads:check` asks the game without a clone

`npm run reads:check` passed a read whose name our own code or the DOM also declares: the declaration made it ours.
Only `drift:check` asked the game's source, and drift runs at a pin bump. So a game read hidden that way passed its PR
and CI, and turned master's drift check red later: 51-lead's `row` stood unregistered across two bumps (#767), and two
solver reads and a HUD name (`switchOutStatus`, `triggerPokemonBattleAnim`, `se`) waited for #806 to be found.

Every member name the game declares at the pin now sits in `scripts/game-reads/game-names.txt`, sorted, one per line,
under a header naming the pinned version and sha. `reads:check` reads it, so `npm test` holds the whole registry rule
offline: a name the game declares needs an entry, real or `from: "ours"`, even where our code or the DOM declares it
too. A JavaScript builtin never does. Drift asks the same question of `check()` against the live source, so the two
cannot disagree, and at the pin it names any difference between the file and the game (NAMES).

## Considered options

- **Run `drift:check` in CI.** Rejected: it clones the game, and ADR 0001's reason stands for the hashes. The rig's
  verify runs offline with no clone at all, so a rule CI alone enforced would still go red after a rig run.
- **Fetch the game's source in CI, as `enums:gen -- --check` does.** Rejected: about 720 files at every run, and the
  rig still could not reach them.
- **Keep the names inside `reviewed.json`.** Rejected: `reviewed.json` ships to players, and the names would double its
  size for a check only this repo runs.
- **Keep each name's refs, so the offline message can say where the game declares it.** Rejected: five to eight times
  the size, and the file would churn whenever the game moves a declaration between files. Drift names the refs.
- **Write the names only at the stamp.** Rejected: a derived file would then cost the harness re-check to refresh.

## Consequences

- Two writers, and only two: the stamp, which writes the names at the new pin right after `reviewed.json`, and
  `npm run drift:check -- --write-names`, which rewrites them at the unchanged pin, refuses a clone at any other sha,
  and touches nothing else. Neither moves the pin without the other.
- `reads:check` refuses outright while the file is missing, behind the pin, or not as the writer gives it.
- A hand edit that deletes a name keeps its form and passes offline; drift at the pin names it.
- Supersedes ADR 0004's consequence that only drift finds what our own declaration hides.
- UNREVIEWED, a ref with no stamped hash, is still found only by drift.
