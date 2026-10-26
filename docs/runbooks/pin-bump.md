# Pin bump

The pin is the PokéRogue **game version** this repo reads the game's source at: `pinned` in
`src/escape-ladder/reviewed.json`. The escape ladder, the coach HUD and solving all lean on it, and one stamp signs off
all three. A live game past the pin gets no ladder, and no solving.

Decisions: [ADR 0001](../adr/0001-escape-ladder-hand-curated-checked-at-pin-bump.md) (the drift check) and
[ADR 0003](../adr/0003-solving-a-fight-is-an-opt-in-plugin-feature.md) (the version lock), and
[ADR 0005](../adr/0005-the-games-declared-names-at-the-pin-are-checked-in.md) (the game's declared names). Ticket:
[#665](https://github.com/IIxauII/coachemon/issues/665), [#711](https://github.com/IIxauII/coachemon/issues/711).

## The bump

Bump with the repo's `pin-bump` skill (`.claude/skills/pin-bump/`): ask a session in this repo to bump the pin to
`<new>`. It runs the steps below as one workflow: setup, subagents over the game's release notes and its diff, the
checks and the suite, one change list, fixes until everything is clean, the stamp, the live run on the owner's go, and
the PR. The rest of this page is the reference it works from, and the way to run any one step by hand.

The skill is repo-only: plugin users never load it, and `scripts/plugin-skills.test.ts` fails if the plugin's
loadable skills ever hold more than `skills/coachemon` and `skills/play-pokerogue`.

## The checks

```sh
npm run reads:check
npm run drift:check -- --version <new>
```

`reads:check` holds at any version: every game name our code reads (in the page readers, the server files that read
the page, the HUD scripts, the harness template, its fake clock and its fast poll) is registered in
`scripts/game-reads/registry/`. A read with no entry is **UNREGISTERED**, an entry nothing reads is **STALE**, and an
entry that names no game ref (an empty `at` with no `from`, or a mirror with an empty `of`) or a mirror id that is not
lower-kebab is **INVALID**. A name the game declares at the pin is UNREGISTERED without an entry even where our code,
the DOM or Node declares it too, and the line says so: register it with the game's ref, or `from: "ours"` when the name is ours
and the game only shares it. The game's declared names come from `scripts/game-reads/game-names.txt`, which the stamp
writes ([ADR 0005](../adr/0005-the-games-declared-names-at-the-pin-are-checked-in.md)). A name any `lib.es*` type
declares (`species`, `status`, `type`, `move` among them) is the one exception: neither check asks the game about it.
It runs inside `npm test` too.

`drift:check` clones `.cache/pokerogue/v<new>` and names every dep whose body **MOVED**, is **MISSING** or was never
stamped (**UNREVIEWED**), each with the ladder entry, HUD module or registry entry that leans on it, and every ladder
entry whose mode or handler is **MISPLACED**. At the target version it also names:

- **ADDED**: a member of a game enum or list we mirror or switch on (UiMode, PartyUiMode, the phases, `Challenges`)
  that the registry's `known` lacks. Handle it where the entry's `handledIn` points, so a new mode never falls through
  to a generic entry, then add it to `known`.
- **SHIFTED**: a generated enum's value at `<new>` differs from `src/enums/generated.ts`. Regenerate
  (`npm run enums:gen -- --version <new> --source .cache/pokerogue/v<new>`) and re-read each user of the shifted
  member.
- **UNREGISTERED**: a name our code reads that the game at `<new>` declares, but the registry lacks. Register it.
  It is the same line `reads:check` gives at the pin, naming where `<new>` declares it.
- **NAMES**: at the pinned version only, `game-names.txt` differs from what the game declares there.
  `npm run drift:check -- --write-names` rewrites it at the pin and touches nothing else. At `<new>` drift prints the
  count the stamp will write instead, which is no finding.

Re-read each entry and fix what changed: screens in `src/escape-ladder/table.ts`, HUD modules in
`skills/coachemon/scripts/hud/`, their deps in `scripts/hud-deps.ts`, the reads in `scripts/game-reads/registry/`.
Run both again until they name only what you have re-read.

`PhaseInterceptor.run` **MOVED** is the search's fast poll (`src/solver/fast-poll.ts.template`, #759): it replaces that
method with a copy that polls every 1 ms, and only while the method matches the copy's `UPSTREAM_RUN`. Left as it is, a
solve still answers, but its workers keep the game's own poll, about six times slower, and the solve's progress says
so. Bring `UPSTREAM_RUN` and the copy up to the new body.

`PhaseInterceptor.run` or `.to`, `MockClock` or `PromptHandler` **MOVED** can also stop the search's fake clock
(`src/solver/fake-clock.ts.template`, #782). At load it checks that `run` and `to` still wait through `vi.waitUntil`,
that `MockClock` and `PromptHandler` still make their intervals with the global `setInterval`, and that `vi.waitUntil`
is still vitest's own, which it copies as `UPSTREAM_WAIT_UNTIL`. The drift check doesn't hash vitest, so when the
clone's vitest version moves, compare the copy with `waitUntil` in its `node_modules/vitest/dist/chunks/test.*.js`. A
failed check leaves a solve answering, but its workers wait on real timers, about four times slower per try, and the
solve's progress says so, as `npm run oracle:battle`'s last line does.

Set the clone up for the harness. The checkout `drift:check` makes has no submodules and no `node_modules`; the stamp
names whichever step is missing. In a worktree, link the main checkout's `.cache` first (`CLAUDE.md`), or the `assets`
submodule is fetched again.

```sh
npm run clone:provision -- --version <new>
```

It clones the version if absent, fetches the empty `assets` and `locales` submodules and installs with the pnpm the
game's `package.json` names, skipping each step already done.

## The suite

```sh
npm run bump:suite -- --version <new>
```

It runs, at `<new>`, everything but the stamp's harness re-check and the live run: the typecheck, the unit tests, the
HUD goldens, `enums:gen --check` against the `<new>` checkout, `clone:smoke`, `oracle:encounter` and `oracle:preview`.
Each step's output goes to its own log under `.cache/bump-suite/v<new>/`; the summary names each step's result,
duration and log, and a failed step prints its log's tail. It exits 1 on any failure. At 1.12.0.11 it took 16 minutes
on the dev's Mac, 15 of them `oracle:preview`.

The clone steps run off the pin through `COACHEMON_GAME_VERSION=<new>`, which any of them takes alone:
`oracle:encounter` and `oracle:preview` run in the `<new>` checkout with its own pnpm, and `clone:smoke` sets a player's
clone up from a pin read off that checkout, in `.cache/coachemon-home` so the player's own clone in `~/.coachemon` is
left alone. `enums:gen --check` fails until the enums are regenerated at `<new>`, which the bump does.

## The stamp

```sh
npm run drift:check -- --version <new> --stamp
```

The stamp refuses while any MISSING, MISPLACED, ADDED, SHIFTED or UNREGISTERED remain, or when the game's
`package.json` names no pnpm. Then
it runs the **harness re-check** in that clone:

1. It replays the six known fights from their wave-start saves (`src/solver/fixtures/`): Gordie W180, Drayton W188,
   Kieran W190, Eternatus W200, the one that turns double (#788), Swimmers W173, a trainer double loaded from a
   `Continue` (#835), and Eternatus W200 with an IV Scanner, the one fight not recorded live: Eternatus W200 with an
   `IvScannerModifier` added to its save and live export, which queues the scanner's phase on the load (`game-code.md`
   §36). It replays Eternatus W200's line, since the phase changes nothing in the fight. Each replay passes the replay
   protocol and must reproduce every fact live recorded on its line, down to the win.
2. Then it runs the fork check and the chained-restore check on each line (#662).

A known fight recorded on an older version than `<new>` is **carried** to it (#703). The clone loads the old save
through the game's own migration, as it loads a player's (`game-code.md` §31), and the harness migrates the fight's live
export the same way. The loaded scene must then match that migrated export, which carries `<new>` as its version. The
known facts and the win are held to the line as live recorded it. The re-check names each carried fight and the version
it came from. A fight recorded on `<new>` itself replays as it always did.

Each check's straight run must also end as live did. Any failure stops the stamp, which names the fight and the check
that failed. When all of them pass, the stamp writes
the pin, the hashes and `recheck: { "gameVersion": "<new>" }`, then the game's declared names at `<new>` into
`scripts/game-reads/game-names.txt`. The solver's refusal gate reads that record, and solves on a version without it get
"no answer". Players have no override.

On 1.12.0.11 the whole stamp took about five minutes on the dev's Mac. Commit `reviewed.json` and `game-names.txt` with the
fixes; the release carries the new pin to players.

## The live run

The last check is a short run on pokerogue.net through this checkout's server once it serves `<new>`: a start, the
starter screen, a few waves and a shop (the skill's step 5 has the commands). It plays on the owner's real account, so
it runs only on the owner's go, asked before each run, in a save slot they name.

## When the re-check fails

- **A carried fight whose harness failed** (`harness_failed`): the harness leans on a game internal that `<new>`
  changed, and a fight recorded on `<new>` would fail the same way. Fix the harness
  (`src/solver/harness.test.ts.template`). Part of the reload's sweep runs only on a restore, so the replays can pass
  and the fork checks still fail on it.
- **A carried fight that played otherwise**: a `scene_mismatch` names the field the migration and the load disagree
  on. A `known_turn_missed` or an `illegal_step` is the line playing out otherwise. The re-check ends by naming each
  such fight. Once `<new>`'s change to the fight is understood (a move, an ability, an item, the AI, or what the
  migration rewrites), record another fight in its place (below).
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

A known fight is two files in `src/solver/fixtures/`, named in `scripts/recheck/known-fights.json`:

- **`<stem>.json`**: `{ live: { wave, battleSeed }, save, liveExport }`. The driver's `read_session` gives all three at
  the fight's first decision: `battle_wave` and `battle_seed`, `wave_start` and `export`.
- **`<stem>.win.script.json`**: the inputs played, each naming the faint replacement and the learn picks its turn
  asked for, and `known`: the outcome, and after each turn what live showed (HP, status, stat stages, who is in front,
  Tera, boss bars) for the mons the line turns on.

The old fight can't be played again on `<new>`: pokerogue.net offers no session import (only a dev, beta or app build
does, `src/ui/handlers/menu-ui-handler.ts` in the clone), and the extension reads pokerogue.net alone. So a fight that
no longer carries is replaced by a new one, played live on pokerogue.net.

Whichever path records it, the fight is like the one it replaces: a single trainer fight, a trainer double, or the
classic final boss for Eternatus W200. For Swimmers W173, a trainer double reached by a `Continue`, with no input since:
its save's `enemyModifiers` is `null`, and the load re-rolls its partner's name (#821, #829). Not a Daily or a Mystery
Encounter, which the solver refuses. A new Eternatus W200 brings its IV Scanner copy with it: copy its `<stem>.json`
with an `IvScannerModifier` added to the save's `modifiers` and to `liveExport`'s, and its `<stem>.win.script.json` as
it is, both under `<stem>.iv-scanner`. Name the copy in `known-fights.json` in place of the old one, and remove the old
copy's two files with the fight it replaces.

### Capture it, then promote it

The solver solves only on the pin (a newer save gets `version_mismatch`), so this path records fights while live serves
the pin: ahead of a bump, or after the stamp, to replace a fight that only carries. A fight that stops carrying in the
middle of a bump is recorded by hand (below).

1. Start the plugin's server with `COACHEMON_CAPTURE=1` and solving on. Each fight gets a folder,
   `<home>/fights/<seed>-w<wave>-<fight>/`, and every fight is kept. A solve from the fight's first turn keeps `turn-1.json`
   there (what it solved from) and, once it finds an oracle line, `turn-1.win.script.json` beside it, its `known` taken
   from the oracle line's checkpoints. A re-solve past the first turn keeps its pair the same way under the turn it started
   at, `turn-<n>.json` (the augmented export and its extras) and `turn-<n>.win.script.json`. A repeat solve from the same
   turn replaces that turn's input, and the oracle line only with one it found. Every solve that keeps its input,
   cancelled and failed ones too, appends one line to the folder's `statistics.jsonl`: the turn it started at, how it
   ended, and the settings and versions it ran under.
2. Solve the fight at its first decision, and win it live on that oracle line. Promoting is your word that you did: nothing
   checks it.
3. Run `npm run recheck:promote -- <home>/fights/<seed>-w<wave>-<fight>`. It copies the first-turn pair into
   `src/solver/fixtures/` as `<fight>-w<wave>` (`--stem <name>` picks another), names it in `known-fights.json`, and
   re-checks that fight at the pin without a carry. It refuses a fight with no oracle line file, a mid-fight file, a save from
   another version than the pin, and a stem already taken. A failed re-check takes the fight back out.
4. Remove the fight it replaces from `known-fights.json` and `src/solver/fixtures/`.

### By hand

1. At the first decision, before any input, call `read_session`, and write `<stem>.json` from it.
2. Play it to a win. After each turn, write down what live shows for the mons the line turns on.
3. Write `<stem>.win.script.json`, and name the fight in `known-fights.json` in place of the one it replaces.
4. Stamp again. The new fight replays on `<new>` without a carry.
