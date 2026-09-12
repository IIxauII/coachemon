# Context

Vocabulary for pokerogue-mcp. Glossary only — no implementation detail.

## Run

One playthrough of PokéRogue, from wave 1 until the party wipes. A **wipe** ends the run; the next run starts again at wave 1 with nothing carried over except account-level unlocks. A run is the unit the agent plays.

## Wave

One encounter within a run — a battle, or a between-battle screen such as a shop or reward choice. Waves are numbered from 1 and never repeat within a run.

## Party

The pokémon the player controls in the current run. The **active pokémon** is the one currently on the field; the rest are on the bench. Distinct from account-level collection data.

## Settled

The state of the game when it is waiting for player input: no animation playing, no phase resolving, no message auto-advancing. Reading state or sending a press while **unsettled** races the game's own queue. Every tool call returns a settled game.

## Snapshot

The structured, text-only view of the game at a settled moment. **Lean** by default (wave, biome, money, active pokémon, enemy, current menu); detail is pulled on demand. A snapshot is read from the live game, never computed or simulated.

## Menu

Whatever the game is currently asking the player to choose between. Identified by its **UiMode** (an int from the game's own enum) and served by a **handler** — the game object that owns the menu's options and cursor. A menu is **known** when the server can read its labels and move its cursor, and **unknown** otherwise; unknown menus degrade to raw presses rather than blocking.

## Button

One of the game's own input actions (UP, DOWN, LEFT, RIGHT, ACTION, CANCEL, MENU, …), identified by an int from the game's `Button` enum. A **press** delivers exactly one button to the game.

## Option

A single selectable entry in a menu, with a visible **label**. Selecting an option by label is a decision; the cursor movement it takes is an implementation detail the server hides.

## Progress fingerprint

A short, deliberately coarse summary of what the game is showing, read at each settled moment. Two moments with the same fingerprint are treated as the same place. It answers "have we been here before", which is a different question from **settled**'s "has the game stopped moving" — so the two are kept apart even where they read the same things.

## Stuck

The game is **settled**, presses are being delivered, and the **progress fingerprint** keeps returning to where it has already been. The run is alive; the agent is lost. Three shapes, named separately because their escapes differ: a **dead end**, where no press moves the fingerprint at all; a **loop**, where presses do move it but only around a cycle; and a **hang**, where the game is waiting on something that will never arrive and no input exists that reaches it.

Stuck is reported, never escaped unilaterally.

## Escape ladder

The ordered ways out of a given **menu**, from the safest to the most costly, each labelled with what it destroys. There is no ladder that fits every menu: the same **button** commits on one screen, discards a choice on another, and abandons the **run** on a third. A menu with no rung at all is **no-escape**, and is reported on sight rather than pressed at.
