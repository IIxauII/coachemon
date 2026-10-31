# A module for the known-fight output layout

The known fights' layout, a flat `<stem>.json` plus the winning script beside it under the solver fixtures and the
`known-fights.json` list, is spelled by its writer (`scripts/recheck/promote.ts`), its reader
(`scripts/recheck/recheck.ts`) and the pin-bump runbook's hand-copy step, and does not move onto a shared module the way
the fight library's layout did in #971.

## Why this is out of scope

#971 deepened the fight library and judged the known-fight layout "a different layout", on purpose: the glossary keeps
known fights distinct from the fight library, and the library never adds to the known fights on its own. ADR-0001 makes
this layout part of the pin-bump gate, since the stamp refuses while the re-check fails.

Outside tests the layout has one writer and one reader in one folder, and they already share one fixtures path:
`promote-run.ts` hands promote the re-check's own `FIXTURES`, and the injection exists only for tests. The one manual
writer is the runbook copying the fight not recorded live (`eternatus-w200.iv-scanner`), which a module would not
replace. The fixtures folder also holds files that are not known fights (the attempt and queued-faint scripts, the
queued-lead script, the turn-5 fixture, and the fight library's `library/` folder), which any module would have to step
around. As with the tally split (#972), a module for two call sites is one adapter's worth of seam, with nothing to pull
it.

Reopen only when a third piece of non-test code needs to read or write the known-fight layout.

## Prior requests

- #975: "promote.ts known-fight output layout stays outside the fight library module (deferred from #971)"
