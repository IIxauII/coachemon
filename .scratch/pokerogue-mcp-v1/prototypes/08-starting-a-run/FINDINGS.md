# #8 Starting a run — prototype findings

Prototype for [#8 Starting a run](https://github.com/IIxauII/pokerogue-mcp/issues/8).
Driven live against the dev's account on `pokerogue.net`, game version `1.12.0.11`,
Chrome debug port 9222. Source read at pinned tag `v1.12.0.11`.

Throwaway. `lib.mjs` is the reusable part; everything else is a probe.

## Verdict

**A full legal party can be driven end to end using only presses, and the run
actually starts.** Cold `TITLE` → live run at wave 1 cost **13 presses**, every
one of them accepted, no raw-keyboard fallback needed.

**v1 should expose a dedicated `start_run(species[])` tool**, not a generic menu
and not a hardcoded party. Reasons in [What v1 exposes](#what-v1-exposes).

## The measured route

Cold `TITLE` (post-wipe, no resumable session) to a live run:

| # | press | lands on | note |
|---|---|---|---|
| 1 | ACTION | `15` OPTION_SELECT `[Classic, Daily Run, Cancel]` | a **game-mode select** the ticket didn't anticipate |
| 2 | ACTION | `10` STARTER_SELECT | `SelectStarterPhase` |
| 3 | ACTION | `15` OPTION_SELECT `[Add to Party, Toggle IVs, Manage Moves, Add to Favorites, Rename, Pokédex, Use Candies, Cancel]` | selecting a mon drops into a **normal F1 option-select** |
| 4 | ACTION | `10` STARTER_SELECT | Bulbasaur added, 3/10 |
| 5–7 | RIGHT, ACTION, ACTION | `10` | Charmander added, 6/10 |
| 8–10 | RIGHT, ACTION, ACTION | `10` | Squirtle added, 9/10, `partyValid: true` |
| 11 | SUBMIT | `14` CONFIRM `[Yes, No]` | `tryStart()` |
| 12 | ACTION | `7` SAVE_SLOT | a **save-slot select** the ticket didn't anticipate, *after* the confirm |
| 13 | ACTION | `0` MESSAGE, `EncounterPhase`, **wave 1** | run live, party 3 |

Five distinct `UiMode`s on the path: `TITLE(1)`, `OPTION_SELECT(15)`,
`STARTER_SELECT(10)`, `CONFIRM(14)`, `SAVE_SLOT(7)`. Only one of them
(`STARTER_SELECT`) is the hard screen; the other four are ordinary families
where `select_option(label)` carries.

**Press cost of one party:** `2 per mon + 3` when the server uses `setCursor`
(no navigation presses), so 3 mons = **9 presses** on the starter screen itself,
plus 2 to reach it. With directional navigation, add the grid distance.

## The cursor address space

There is no single cursor. `STARTER_SELECT` is a **tagged union of five cursor
spaces**, and which one is live is signalled by visibility flags, not by a mode
field:

| space | selected when | cursor field |
|---|---|---|
| grid | `cursorObj.visible` | `cursor` (+ `scrollCursor`) |
| filter bar | `filterMode === true` | `filterBarCursor` |
| party icons | `starterIconsCursorObj.visible` | `starterIconsCursorIndex` |
| START button | `startCursorObj.visible` | — |
| RANDOM button | `randomCursorObj.visible` | — |

The grid cursor is a **flat index into `filteredStarterContainers`**, 9 per row,
exactly as `calcStarterPosition` computes it:

```js
x = (index % 9) * 18
y = 13 + (Math.floor(index / 9) - scrollCursor) * 17
```

`scrollCursor` is the topmost visible **row**; the window is **9 rows = 81 cells**.
So it is a flat index *plus* an independent row offset — neither pure grid
coordinates nor page+index.

## `setCursor` — safe, with two traps

Measured live, grid mode, 27-entry grid:

```
setCursor(  13) -> changed=true  cursor=13 (Tepig)     sprite=(71,31)  want=(71,31)  synced
setCursor(  26) -> changed=true  cursor=26 (Quaxly)    sprite=(143,48) want=(143,48) synced
setCursor( 999) -> changed=false cursor=26 (clamped)   synced
setCursor(  -5) -> changed=true  cursor=0  (clamped)   synced
```

It clamps to `[0, length-1]`, moves the sprite correctly, and fires the side
effects (`setSpecies`, `updateInstructions`). **It works.** Two traps:

1. **It never calls `updateScroll()`.** The sprite always matches
   `calcStarterPosition`, but nothing brings the target into the visible window.
   Constructed and measured (reversibly): with `scrollCursor = 1, cursor = 0` the
   sprite lands at `y = -3`, off-screen, while `cursor` still reads 0. The bug is
   only reachable for an index outside `[scrollCursor*9, scrollCursor*9 + 81)`.
   The two in-game paths that move both (UP/DOWN out of the filter bar) set
   `scrollCursor`, call `updateScroll()`, **then** `setCursor` — that is the
   correct recipe and what the server must do.
2. **In filter mode, `setCursor(n)` writes `filterBarCursor`, not the grid
   cursor.** Same method, two address spaces, switched by `filterMode`. Measured:
   `setCursor(3)` with `filterMode: true` left `cursor` at 0 and set
   `filterBarCursor` to 3.

## The grid is smaller — and less stable — than assumed

`filteredStarterContainers.length` was **27** (3 rows) against
`starterContainers.length` of **572**. The 27 are exactly the gen 1–9 starters,
i.e. every species this account has caught.

Two consequences:

- **The 9-wide grid never scrolls on this account.** 3 rows against a 9-row
  window, and normal navigation clamps `scrollCursor` to
  `Math.max(0, numOfRows - 9) = 0`. The scrolling difficulty the ticket feared is
  not on the critical path here.
- **Grid length depends on the dev's persisted filter preferences.** The Caught
  column reads `hasDefaultValues() === false` — it has been changed from its
  default on this profile. So **species → index is not stable** across profiles
  or sessions, and an agent must never hardcode an index. Only the server, which
  can read `filteredStarterContainers`, can resolve a species id to an index.

Also: the filter-bar index space is **not** the `DropDownColumn` enum. Six
filters `[Gen, Type, Caught, Unlocks, Misc, Sort]` map to columns
`[0, 1, 3, 4, 5, 6]` — index 2 is column 3.

## Is the filter bar avoidable? Yes

Nothing on the run-start path requires it. It is entered only deliberately:
`STATS` from the grid, or UP from row 0. Since `setCursor` is safe in grid mode,
the server never needs directional presses for the grid, so the filter bar is
**fully avoidable**.

If something does enter it, the safe exit is **DOWN** (with the dropdown closed
and `filterBarCursor` not the last column). **Do not use CANCEL to leave it:**
`CANCEL` in filter mode resets a non-default filter (which would clobber the
dev's saved preferences), and if the filters are already default it falls through
to `popStarter()` and silently eats a party member.

## `processInput`'s return value is unreliable

`STATS` on `STARTER_SELECT` returned **`false` while performing its action** —
the handler's `STATS` branch never sets `success = true`. So `accepted === false`
does not mean "not applied", and any press tool that retries on `false` will
double-apply. **Judge a press by observed state, not by the return value.**

## The settle rule from #3 is too weak

#3's "poll 100 ms, two identical consecutive samples" exits early. A press is
handled asynchronously, so the first two samples after it are both the
*pre-change* state: press #1 on TITLE reported settled in **103 ms** while
`ui.mode` was still `1`, and the real destination (`OPTION_SELECT`) arrived
later. Requiring **3 identical samples plus a 500 ms floor** fixed it; every
press afterwards settled at a consistent ~510 ms. This affects every timing
measured under the weaker rule.

## A measured stuck state

Spamming ACTION to advance dialogue is unsafe, and the reason is specific: at
the start of the wave-1 fight the game **asks whether you want to switch
Pokémon**, and ACTION answers **yes**. So the spam consented to a switch it was
never asked to make → `PARTY(8)` "Choose a Pokémon." → one more ACTION opened a
single Pokémon's detail view, `SUMMARY(9)`, where `processInput(ACTION)` returned
**false 26 consecutive times with zero state change**. The run was alive and
healthy; the agent was simply trapped in a detail screen. `CANCEL` escapes
(SUMMARY → PARTY → COMMAND).

The correct answer to that prompt is **no**, so the server must not treat ACTION
as a safe "advance dialogue" key: on any prompt that is a question, ACTION is a
consent. Nothing was fought — verified afterwards at the COMMAND prompt:
`turn: 1`, Whismur 14/14 unfainted, money 1000, party at full HP.

"Run alive, storage intact, N identical rejected presses" is a usable stuck-state
signature, and belongs to the map's *recovery from stuck states* fog.

## Storage and run-start markers

`sessionData_xauyxau2` (6316 bytes), `currentBattle != null` and
`party.length > 0` **all flip in the same settle**, at the save-slot ACTION.
`classicSessionsPlayed` ticks 3 → 4 at that same moment — a second run-start
marker co-located with the first, not an independent one. Nothing appears earlier:
the key is absent through New Game, the mode select, all of starter select, the
confirm and the slot screen. (Captured for [#11](https://github.com/IIxauII/pokerogue-mcp/issues/11).)

`SAVE_SLOT` exposes **5 slots**, and `sessionSlots[i].hasData` is readable
*before* committing. All five read `false` here, so nothing was overwritten.

## What v1 exposes

**A dedicated `start_run(species[])` tool**, with generic `press` / `select_option`
still available underneath.

Not a generic menu, because:

1. The path crosses **five** `UiMode`s. An agent driving it generically has to
   know all five and their orderings, including two screens nobody had mapped
   (the game-mode select and the save-slot select).
2. **Species → grid index is not stable** — it depends on the profile's caught
   set *and* its persisted filter preferences. Only the server can resolve it.
3. **Save-slot choice is destructive** and needs the `hasData` guard. It must not
   be left to a blind agent.
4. `processInput` reports success unreliably on this screen, so a generic press
   tool cannot tell the agent whether its press landed.

Not a hardcoded party either: resolving species → index server-side is cheap
(one read of `filteredStarterContainers`), so there is no reason to deny the
agent the choice. The tool should validate against the **value limit** (10 for
Classic, `getValueLimit()`, challenge-adjusted) and reject an invalid party
before pressing anything.

Shape suggested by the measurements:

```
start_run(species: SpeciesId[], slot?: number)
  -> { wave, party, money, mode }
```

- resolve each species to its flat index via `filteredStarterContainers`
- refuse if any species is uncaught, duplicated, or the party exceeds
  `getValueLimit()`
- default `slot` to the lowest index with `hasData === false`; refuse to
  overwrite a filled slot unless the caller names it explicitly
- per mon: `setCursor(index)` (fixing `scrollCursor` first), ACTION, ACTION
- then SUBMIT, ACTION (Yes), ACTION (slot)
- return the settled state at the first `EncounterPhase`

## Files

| file | what |
|---|---|
| `lib.mjs` | reusable: #9 locator, hardened settle, `press`/`rawPress`, STARTER_SELECT-aware snapshot |
| `step.mjs` | press a named sequence, settle and log full state after each |
| `peek.mjs` | one read-only snapshot |
| `grid.mjs` | dump the grid: flat index → species, row/col, cost, caught |
| `setcursor.mjs` | `setCursor` in grid mode, sprite-sync check |
| `filterprobe.mjs` | the `filterMode` `setCursor` overload, restores what it touches |
| `scrolldesync.mjs` | the missing-`updateScroll` mechanism, reversible |
| `slotprobe.mjs` | SAVE_SLOT slots and `hasData` |
| `partyprobe.mjs`, `enemy.mjs`, `advance.mjs` | party/enemy reads, dialogue walker |

`rawPress` (CDP `Input.dispatchKeyEvent`) was implemented but **never needed** —
every press on this path went through `ui.processInput`.

## Left open

- **Scrolling is unmeasured.** This account's grid is 3 rows, so no press ever
  moved `scrollCursor`. On a large dex (up to 572 entries, 64 rows) the scroll
  paths are untested, and the `setCursor` desync becomes reachable. The server's
  scroll-fixing recipe above is derived from source, not measured.
- **The `EncounterPhase` → first `COMMAND` leg has no clean press count.** It was
  only walked under the polluted ACTION-spam run. The screens crossed are known
  (MESSAGE ×n → `SwitchPhase`/PARTY → CANCEL → COMMAND) but the count is not.
- **Tutorials never fired** during starter select on this account, so the
  `tutorialActive` trap is unexercised on this path.
- **Daily Run** on the mode select is untouched; only Classic was driven.
