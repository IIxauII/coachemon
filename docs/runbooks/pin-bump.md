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

A known fight recorded on an older version than `<new>` is **carried** to it (#703). The clone loads the old save
through the game's own migration, as it loads a player's (`game-code.md` §31), and the harness migrates the fight's live
export the same way. The loaded scene must then match that migrated export, which carries `<new>` as its version. The
known facts and the win are held to the line as live recorded it. The re-check names each carried fight and the version
it came from. A fight recorded on `<new>` itself replays as it always did.

Each check's straight run must also end as live did. Any failure stops the stamp, which names the fight and the check
that failed. When all of them pass, the stamp writes
the pin, the hashes and `recheck: { "gameVersion": "<new>" }`. The solver's refusal gate reads that record, and solves
on a version without it get "no answer". Players have no override.

On 1.12.0.11 the whole stamp took about five minutes on the dev's Mac. Commit `reviewed.json` with the fixes; the release carries
the new pin to players.

## When the re-check fails

- **A carried fight that doesn't replay**: the re-check ends by naming each one to record again on `<new>`. First rule
  out the harness, as for any fight. Then, if `<new>` changed the fight itself, record another in its place (below). That covers a
  move, an ability, an item, the AI, or what the migration rewrites. A `scene_mismatch` names the field the migration
  and the load disagree on. A `known_turn_missed` or an `illegal_step` is the line playing out otherwise.
- **A fact live recorded that the replay shows otherwise** (`known_turn_missed`) on a fight recorded on `<new>`: the
  harness drifted since the last stamp, through this repo's own harness or the clone's test framework. No line the
  oracle finds can be trusted until it is fixed.
- **A restore that played a turn otherwise**: the fork point's restore lost state the straight run kept. #662 found one
  this way (Intimidate firing again on every reload).
- **The clone isn't set up**: the message names the command that sets it up.

`npm run oracle:battle -- --replay <script> <export>` and `-- --check <script> <export>` run one fight's replay or checks
alone, in the pinned clone, so a carried fight replays only through the stamp. `-- --unchecked` solves on a version the
re-check hasn't passed. It exists for the dev only, and the plugin never passes it.

## Record a known fight again

A known fight is two files in `src/solver/fixtures/`, named in `KNOWN_FIGHTS` in `scripts/recheck/recheck.ts`:

- **`<stem>.json`**: `{ live: { wave, battleSeed }, save, liveExport }`. The driver's `read_session` gives all three at
  the fight's first decision: `battle_wave` and `battle_seed`, `wave_start` and `export`.
- **`<stem>.win.script.json`**: the inputs played, and `known`: the outcome, and after each turn the HP, status and
  stat stages live showed, for the mons the line turns on.

The old fight can't be played again on `<new>`: pokerogue.net offers no session import (only a dev, beta or app build
does, `src/ui/handlers/menu-ui-handler.ts` in the clone), and the extension reads pokerogue.net alone. So a fight that
no longer carries is replaced by a new one, played live on pokerogue.net once it serves `<new>`:

1. Reach a single trainer fight: not a Daily, a double or a Mystery Encounter, which the solver refuses.
2. At the first decision, before any input, call `read_session`, and write `<stem>.json` from it.
3. Play it to a win. After each turn, write down what live shows for the mons the line turns on.
4. Write `<stem>.win.script.json`, and name the fight in `KNOWN_FIGHTS` in place of the one it replaces.
5. Stamp again. The new fight replays on `<new>` without a carry.
