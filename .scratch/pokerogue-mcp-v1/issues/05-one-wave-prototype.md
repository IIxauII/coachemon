# One wave, driven by a raw script

Type: prototype
Status: open
Blocked by: 01, 02, 03, 04

## Question

Before any MCP server exists, prove the control loop works end to end with a throwaway CDP script: connect to the logged-in tab, start or resume a run, and clear a single wave — select a move, survive the enemy turn, get through whatever reward or message screens follow — using only structured state and button presses. No MCP, no abstractions, no tests.

What it must answer:

- Does the settle predicate from *Detecting a settled game* actually hold across a whole wave, or does it return early / hang?
- Does generic label + cursor reading from *Reading menus generically* survive every screen a single wave throws at it? Log every `UiMode` encountered and whether it was readable.
- Is `processInput` alone sufficient, or do some screens need raw keyboard or a direct cursor set?
- How many round-trips and how much text does one wave actually cost? Record the number, it sizes the whole tool surface.
- What broke, and what would have to be true for it not to break.

Link the script as an asset. It is throwaway — it is evidence, not the server.

Also measure, and correct, the settle numbers the research could only derive from source: the 100 ms poll interval, the 20 s no-progress timeout and the 90 s hard timeout. Confirm the in-battle branches of the predicate (`resolving`, `awaiting-action`, `text-animating`) actually fire, and re-check the shop (`MODIFIER_SELECT`) first.
