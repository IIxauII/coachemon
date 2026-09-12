# The progress fingerprint carries the battle clock

#13 pinned the stuck detector's progress fingerprint at five fields (`phaseName | ui.mode | modeChain | handler.cursor | message text`) and warned that every field added makes the detector less able to fire. We append two more anyway: `currentBattle.waveIndex` and `currentBattle.turn`.

Replaying the detector against #6's transcripts showed why. Every turn's COMMAND prompt ("What will Bulbasaur do?", cursor 0) produces the same five fields. With `MESSAGE(0)` auto-advanced inside the acting call, a turn costs about two decisions, so any battle lasting five turns shows COMMAND five times in the 12-sample window and is reported as a `loop`. A healthy wave in run5 reached 4. The real limit on legitimate repeats is battle length, not the three identical level-up messages #13 measured.

The warning in #13 is about fields that tell apart screens *inside* a cycle (`optionsCursor` splits PARTY from its option list). Wave and turn don't: nothing a stuck agent does moves the turn forward, so they stay the same across every stuck cycle we have. They only change when the game makes real progress. With them added, both recorded loops (run2's shop↔party, run3's PARTY→SUMMARY) trip on exactly the same call as before, and the healthy runs peak at 2 repeats (3 when MESSAGE screens count as decisions).

## Considered options

- **Raise the threshold.** Rejected: a longer battle just needs more turns to trip it, and every step up makes the real loops take longer to catch.
- **Skip COMMAND screens.** Rejected: that hard-codes one screen into a detector that works on any screen, and a loop that goes through COMMAND (FIGHT → CANCEL → COMMAND) would never be seen.
