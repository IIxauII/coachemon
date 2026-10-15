# Pin bump

The pin is the PokéRogue **game version** this repo reads the game's source at: `pinned` in
`src/escape-ladder/reviewed.json`. The escape ladder, the coach HUD and solving all lean on it, and one stamp signs off
all three. A live game past the pin gets no ladder, and no solving.

Decisions: [ADR 0001](../adr/0001-escape-ladder-hand-curated-checked-at-pin-bump.md) (the drift check) and
[ADR 0003](../adr/0003-solving-a-fight-is-an-opt-in-plugin-feature.md) (the version lock). Ticket:
[#665](https://github.com/IIxauII/coachemon/issues/665).

## The bump

```sh
npm run drift:check -- --version <new>
```

It clones `.cache/pokerogue/v<new>` and names every dep whose body **MOVED**, is **MISSING** or was never stamped
(**UNREVIEWED**), each with the ladder entry or HUD module that leans on it, and every ladder entry whose mode or handler
is **MISPLACED**. Re-read each one and fix what changed: screens in `src/escape-ladder/table.ts`, HUD modules in
`skills/coachemon/scripts/hud/`, their deps in `scripts/hud-deps.ts`. Run it again until it says only what you have
re-read.

Set the clone up for the harness. The checkout `drift:check` makes has no submodules and no `node_modules`; the stamp
names whichever step is missing. In a worktree, link the main checkout's `.cache` first (`CLAUDE.md`), or the `assets`
submodule is fetched again.

```sh
cd .cache/pokerogue/v<new>
git submodule update --init --depth 1 assets locales
npx --yes pnpm@<the game's packageManager pnpm> install --frozen-lockfile
```

Then stamp:

```sh
npm run drift:check -- --version <new> --stamp
```

The stamp refuses while a dep is MISSING or an entry MISPLACED, or when the game's `package.json` names no pnpm. Then
it runs the **harness re-check** in that clone:

1. It replays the three known fights from their wave-start saves (`src/solver/fixtures/`): Gordie W180, Drayton W188
   and Kieran W190. Each replay passes the replay protocol and must reproduce every fact live recorded on its line,
   down to the win.
2. Then it runs the fork check and the chained-restore check on each line (#662).

Each check's straight run must also end as live did. Any failure stops the stamp, which names the fight and the check
that failed. When all of them pass, the stamp writes
the pin, the hashes and `recheck: { "gameVersion": "<new>" }`. The solver's refusal gate reads that record, and solves
on a version without it get "no answer". Players have no override.

On 1.12.0.11 the whole stamp took about five minutes on the dev's Mac. Commit `reviewed.json` with the fixes; the release carries
the new pin to players.

## When the re-check fails

- **"the live game is 1.12.0.11, but solving runs on <new> only"**: the known fights are 1.12.0.11 saves, and a replay
  refuses a save of another version. So for now the re-check passes only on the version its fights were played on. How
  a known fight reaches a new version is open (#703).
- **A fact live recorded that the replay shows otherwise** (`known_turn_missed`): the harness drifted since the last
  stamp, through this repo's own harness or the clone's test framework. No line the oracle finds can be trusted until
  it is fixed.
- **A restore that played a turn otherwise**: the fork point's restore lost state the straight run kept. #662 found one
  this way (Intimidate firing again on every reload).
- **The clone isn't set up**: the message names the command that sets it up.

`npm run oracle:battle -- --replay <script> <export>` and `-- --check <script> <export>` run one fight's replay or checks
alone. `-- --unchecked` solves on a version the re-check hasn't passed. It exists for the dev only, and the plugin never
passes it.
