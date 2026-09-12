# The v1 tool surface

Type: grilling
Status: open
Blocked by: 05, 07

## Question

Fix the exact MCP tool surface for v1, informed by what the prototype cost and what the handler research found: every tool name, its input schema, its output shape, and its failure mode.

Starting point from charting — to be confirmed or overturned by evidence, not accepted by default:

- `get_state` — lean tiered snapshot (wave, biome, money, active pokémon, enemy, current menu, `run_over`).
- `inspect_party` / `inspect_items` — on-demand detail.
- `read_menu` — mode int, mode name if known, scraped labels, cursor. Degrades rather than throwing on an unmodelled handler.
- `press` — one raw button. The permanent escape hatch.
- `select_option(label)` — cursor math server-side, one call per decision.
- `screenshot` — optional sanity check.
- Something to start a new run after a wipe.

What must be settled:

- Does every tool return a settled snapshot, or only the acting ones?
- Is `select_option` matched by exact label, by fuzzy match, or by index, and what happens on ambiguity or no match?
- What does a settle timeout return, and how does a stuck run surface to Claude?
- Which screens from the prototype's log justify a dedicated semantic tool, and which stay raw?
- What is deliberately *not* in v1?

Output a written v1 spec that the build tickets are cut from.

Two constraints from the enum research that v1 must answer for: `UiMode.PARTY` (8) is five different screens distinguished only by `PartyUiMode`, so `read_menu` cannot describe it from `ui.mode` alone; and `FAINT_SWITCH` / `REVIVAL_BLESSING` **cannot be cancelled**, so a reflexive `CANCEL` escape hatch will hang an unattended run. Decide how the tool surface exposes which menus refuse CANCEL.
