# One section per tally statistic

The fight-library tally (`scripts/library-tally/tally.ts`) keeps one summary type, one fold and one set of print
bands for all of its statistics. It is not split into a section per statistic, each owning its fold and its print.

## Why this is out of scope

The split was architecture-review candidate 3 after #971. Its case was that every new statistic threads through the
summary type, the fold and the report in one file, so two statistics PRs touch the same lines; its own caveat was that
it "pays off only if more statistics are coming", and that two sections today would be one adapter's worth of seam.

No more statistics are coming. The statistics planned in #932 have all shipped, and the tally's report text is pinned
by its tests and described in CONTRIBUTING.md, so a byte-identical refactor would move code and change nothing a
reader of the report can see. The seam waits for a third statistic that wants it. Until one lands, the decision stands.

Reopen only when a new tally statistic is actually being added and collides with another in flight.

## Prior requests

- #972: "Give each tally statistic its own section (deferred from #971)"
