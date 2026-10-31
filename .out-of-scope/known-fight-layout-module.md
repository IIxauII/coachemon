# A module for the known-fight output layout

The known fights' layout, a flat `<stem>.json` plus the winning script beside it under the solver fixtures and the
`known-fights.json` list, is spelled by its writer (`scripts/recheck/promote.ts`) and its reader
(`scripts/recheck/recheck.ts`), and does not move onto a shared module the way the fight library's layout did in #971.

## Why this is out of scope

#971 deepened the fight library and judged the known-fight layout "a different layout", on purpose: the glossary keeps
known fights distinct from the fight library, and the library never adds to the known fights on its own. ADR-0001 makes
this layout part of the pin-bump gate, since the stamp refuses while the re-check fails.

The layout has one writer and one reader in one folder. The only inconsistency between them is that promote takes its
fixtures path injected while the re-check reads a fixed one, which is a two-line change if it ever matters, not a
module. The fixtures folder also holds scripts that are not known fights (the attempt, queued-lead and tier fixtures,
and the hand-copied fight the pin-bump runbook names), which any module would have to step around. A module for two
call sites is the seam the architecture review warned about: one adapter's worth, with nothing to pull it.

## Prior requests

- #975: "promote.ts known-fight output layout stays outside the fight library module (deferred from #971)"
