# The escape ladder is hand-curated, and its drift check runs at pin bump

The escape ladder (`src/escape-ladder/table.ts`) is written by hand from reading PokéRogue's source at a pinned tag, not generated from it. Each entry names the methods its claims rest on; `npm run ladder:drift` hashes those methods at a candidate tag and refuses to move the pin until every entry whose hash moved has been re-read and re-stamped. The check runs when the pin is bumped, not on every push, and the server suppresses the whole ladder when the live `gameVersion` differs from the pin.

## Considered options

- **Generate the table from source.** Rejected: the classification is judgement over deep if/else chains gated on runtime flags (`filterMode`, `transferMode`, `allowCancel()`), and a wrong guess on `STARTER_SELECT` removes a team member with no confirmation on the dev's real save.
- **Hash `processInput` only.** Rejected: the facts that matter most live in callees — `PartyUiHandler.allowCancel`, `StarterSelectUiHandler.popStarter`, `SummaryUiHandler.hideMoveSelect`, `SelectModifierPhase`'s cancel callback — so a change there would not trip the check.
- **Hash the full transitive `this.*` closure.** Rejected: `PARTY` pulls in 1,510 lines and `STARTER_SELECT` 2,830, mostly rendering, so any sprite tweak would trip it and reviews would turn into rubber stamps. Declared deps plus comment-stripped AST printing catch behaviour changes without that noise. Against v1.11.22, 58 of 67 deps were unchanged.
- **Run the check in CI on every push.** Rejected: at a fixed pinned tag the hashes cannot move, so the check would always pass. It only means something against a *candidate* tag.

## Consequences

- Stamping (`--stamp`) is the review sign-off. It also moves the pin, which is why it refuses while any dep is missing or any entry's `mode`/`handler` disagrees with the candidate's `UiMode` enum and `UI.handlers` array.
- Between bumps, a live build that has moved past the pin gets no ladder at all rather than a stale one. The stuck detector is version-independent and keeps running.
- #2's enum codegen resolves `gameVersion` to a tag the same way, so the two should share that resolution when codegen is built.
