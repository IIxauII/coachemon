# One section per tally statistic

The fight-library tally (`scripts/library-tally/tally.ts`) keeps one summary type, one fold and one set of print
bands for all of its statistics. It is not split into a section per statistic, each owning its fold and its print.

## Why this is out of scope

The split buys nothing a reader of the report can see. The tally's report text is pinned by its tests and described in
CONTRIBUTING.md, so a byte-identical refactor would only move code, and adding a statistic through one summary type,
one fold and one report in one file is a single, reviewable change.

The split came out of the architecture review after #971 (#972). Its case was that every new statistic threads through
the summary type, the fold and the report, so two statistics PRs touch the same lines; its own caveat was that it pays
off only if more statistics are coming, and that otherwise it is one adapter's worth of seam. The statistics planned in
#932 have all shipped, so that case has nothing to stand on.

Reopen only when a new tally statistic is actually being added and collides with another in flight.

## Prior requests

- #972: "Give each tally statistic its own section (deferred from #971)"
