# Reading menus generically

Type: research
Status: resolved

## Question

`read_menu` and `select_option(label)` both need to answer, for *any* of the ~48 registered UI handlers: what are the option labels, and where is the cursor? Recon confirmed this works for one handler (`buttonLabels[].text` → `["Login","Register"]`) but not that it generalises.

Against the PokéRogue source:

- Map the handler class hierarchy. Is there a common base (`UiHandler`, `MessageUiHandler`, `AbstractOptionSelectUiHandler`, …) that exposes options and cursor uniformly?
- For each handler family, what property holds the selectable options and their visible text, and what holds the cursor index?
- Which handlers are *not* list-shaped at all (free text entry, a party grid, a drag-and-drop shop, a 2D move-selection layout)? Those need a different reading and a different way to be driven.
- How does the cursor actually move for each family — is `select_option(label)` implementable as "compute delta, send that many UP/DOWN presses, then ACTION", or do some handlers need `setCursor` directly?
- Is calling something like `handler.setCursor(n)` from outside safe, or does it skip side effects that pressing would trigger?

Deliver a per-family table (handler family → how to read labels, how to read cursor, how to move the cursor) and a recommendation for the generic fallback when a handler matches no known family.

## Answer

There is **no** common base that exposes options uniformly. `UiHandler` gives only
`cursor` / `getCursor()` / `setCursor()` / `processInput()`, and `cursor` is not
always a list index (it is a `BattlerIndex` in TARGET_SELECT, a page number in
SUMMARY/GAME_STATS, a screen row in the scrolling handlers). The one solid
invariant is that `UI.handlers` is positionally indexed by `UiMode`, so `ui.mode`
identifies the handler exactly.

The 48 handlers group into **13 families**. Seven of them (config option-select,
text-block list, fixed 2-D grid, two-phase party, shop row/column grid, field
target picker, acknowledge-only) cover every menu on the critical path of a run;
the other six are menus a run never has to touch.

`setCursor` from outside is safe for most families and is a useful fast path, but
it is unsafe for the party option list while it scrolls, wrong for settings value
changes (needs `setOptionCursor(row, v, true)`), and useless for the ten
modal/form handlers, which have no cursor and are pointer/DOM-driven. Recommend
press-driven `select_option` by default with a verified `setCursor` fast path, and
a text-scrape + `known: false` fallback for unrecognised handlers.

Full findings, with the per-family table, the not-list-shaped list and the
fallback snippet: `.scratch/pokerogue-mcp-v1/research/03-reading-menus.md`
(source read at pokerogue commit `da1d0eff`).
