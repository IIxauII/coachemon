# Starting a run

Type: prototype
Status: open
Blocked by: 04

## Question

Every run begins at `STARTER_SELECT`, and so does every run after a wipe — so an unattended agent hits this screen more often than any other. *Reading menus generically* found it to be one of the two hardest screens in the game to drive: a 9-wide scrolling grid, a separate filter-bar mode with dropdowns, and `CYCLE_*` buttons that mutate the selection in place. It is not list-shaped and `select_option(label)` will not carry it.

Prove a starter selection can be driven end to end, and decide what the server exposes for it:

- Can a full legal party be picked using only presses, from a cold `STARTER_SELECT`? Script it and confirm the run actually starts.
- What is the cursor address space (grid coordinates? flat index? page + index?), and how does scrolling interact with it?
- Is the filter bar avoidable entirely, or does some necessary action require entering it?
- Does `setCursor` work here, or does the scroll logic break it the way it breaks the party option list?
- How many presses does one party cost? If it is large, that is an argument for a dedicated `start_run(species[])` tool that does the whole screen in one call.

Decide: does v1 expose starter select as a generic menu, as a dedicated tool, or as a fixed hardcoded party that the agent does not choose at all?
