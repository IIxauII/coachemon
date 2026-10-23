# readCard asking the decision detector which screen it is on

`readCard` keeps its own screen checks (`starterScreen`, `learnState`, `spliceScreen`, `rewardsScreen`,
`biomeScreen`, `encounterScreen`, then a live battle) and does not take the screen from the per-frame decision
detector's `detect(s).card`.

## Why this is out of scope

The aim was one recogniser instead of two. Swapping wouldn't get there, because `readCard` runs at moments the
detector has no answer for, by design:

- **The send-in redraw.** When a new mon comes in between decisions, the watch rebuilds the card for the new matchup
  (`sentIn` in `98-watch.js` runs only while no decision is open). The detector returns nothing then.
- **The first build** when the overlay loads, on whatever screen is up.
- **`probe.js`** uses `learnState` and `rewardsScreen` directly.

So the screen checks stay either way, and the swap would only add five behaviour changes, each needing a check in the
live game:

1. A reload on the learn summary outside `LearnMovePhase` (#808): `learnState` answers in any phase; the detector needs
   the phase and a pending learn prompt.
2. The battle card: `readCard` builds one whenever a battle has a live mon on each side; the detector only during the
   command, target, check-switch and switch phases.
3. A starter grid under a `CONFIRM` or `OPTION_SELECT` overlay: the detector is not ready while `starterScreen`
   matches (it still names the starters card, so this one only bites if the swap gates on `ready`).
4. The shop, splice and Mystery Encounter handlers outside their phase: `readCard` builds a card, the detector none.
5. The send-in redraw above, lost unless special-cased.

The biome check already ties itself to its phase, so it agrees either way.

## Prior requests

- #888: "readCard takes which screen from the per-frame decision detector"
