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

Resolved on branch `research/reading-menus` (commit `410a607`). Full findings at `.scratch/pokerogue-mcp-v1/research/03-reading-menus.md` on that branch; the answer section on the ticket there carries the summary. Gist is recorded in the map under Decisions so far.
