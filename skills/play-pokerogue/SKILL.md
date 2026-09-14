---
name: play-pokerogue
description: Play PokéRogue (pokerogue.net) through the pokerogue MCP tools — start a run, fight waves, shop, handle faints and stuck screens. Use when the user wants to play PokéRogue, start or continue a run, or asks Claude to take the driver's seat in the game.
---

# Playing PokéRogue

The `pokerogue` MCP server drives a live PokéRogue tab in Chrome over CDP. State comes back as text; you act by choosing options. The game is the source of truth; the server holds no game logic.

## Before the first call

- The server launches Chrome with its own profile (`~/.pokerogue-mcp/chrome-profile`) if no tab is attached on debug port 9222. If `status` or `read_menu` shows a login/register screen, **stop and ask the user to log in by hand in that Chrome window.** Never type credentials.
- It plays on the user's **real save**. `start_run` refuses an occupied slot unless `overwrite: true`. Never pass `overwrite: true` without the user's say-so for that slot.
- One driver per tab. `tab_contended` means another session holds `~/.pokerogue-mcp/driver.lock` — tell the user; don't retry in a loop.

## The loop

1. `status` — attached? run live? on `TITLE`?
2. No run: `start_run` with the user's starters (species names as on the starter grid; default e.g. `["Bulbasaur","Charmander","Squirtle"]`). If the party is over the cost budget or a name isn't on the grid it refuses and backs out to `TITLE` first, so fix the party and call `start_run` again. If the refusal carries `next`, the back-out failed: do what `next` says.
3. Until a result's `status` is `run_over` or `run_interrupted`:
   - Every acting result carries `menu` (screen, labels in cursor order, cursor, text). Decide from it. Call `read_menu` only when you need full option objects (move PP/power in `extra.moves`, shop costs, party HP) or `cancel_effect`.
   - Act with `select_option` using a label **exactly** as returned. If a label is duplicated (e.g. same item as free reward and in the shop), pass `index` (the option's `i` from `read_menu` this call). Pass `expect_screen` when acting on a screen read earlier.
   - `press(button)` is the escape hatch for screens with no options (acknowledge with `ACTION`; leave `SUMMARY` with `CANCEL`).

## Screens

| Screen | Do |
|---|---|
| `COMMAND` | `Fight` usually. `Pokémon` to switch, `Ball` to catch (wild mons only: in a trainer battle `extra.catchable` is `false` and `select_option` refuses a ball with `cannot_catch_trainer`). |
| `FIGHT` | A damaging move with PP left, favouring type advantage and power (`read_menu` → `extra.moves`). Avoid charge, recharge and recoil moves. |
| `TARGET_SELECT` | In doubles, the enemy you can KO or the bigger threat. |
| `PARTY/FAINT_SWITCH` | Must answer: pick a non-fainted, non-active mon, then `Send Out`. Never `Cancel`. |
| `PARTY/POST_BATTLE_SWITCH`, `PARTY/SWITCH` | `Cancel` unless a switch is wanted. |
| `MODIFIER_SELECT` (shop) | Buy first, reward last: taking the free reward (row 1, cost 0) ends the screen and starts the next wave, so buy any wanted shop-row item (cost > 0, only if money ≥ cost) **before** it. Then take one reward. Item that targets a mon opens `PARTY/MODIFIER` → pick mon → `Apply`/`Use`/`Teach`. |
| `SUMMARY/LEARN_MOVE`, move-replace confirm | `select_option` the move to forget by name, or the new move (last option) to decline. On the confirm, `No` declines. |
| `OPTION_SELECT` (biome etc.) | Choose; first option if indifferent. |
| Party full, release a mon | Ask the user which mon to release. Never pick one yourself. |
| `CONFIRM` you don't understand | `No`. |

`read_menu`'s `screen_class` says whether a screen is `must_answer`.

## Rival fights

Rival waves (e.g. 95) hit much harder than gym leaders or bosses.

- Go in at full HP. Heal in the shop before the wave.
- Don't hard-switch into a big hit. A switch-in takes the full blow.
- KO setup sweepers (e.g. Volcarona) the turn they come out, or have a faster answer ready.

## There is no back button

CANCEL means different things per screen: it consents on messages, selects the last option on lists, **abandons a run on the save-slot screen**, pops a team member on the starter grid. Check `cancel_effect` (`exits` / `asks_confirm` / `consents` / `selects_last_option` / `reopens` / `rejected` / `unknown`) before pressing `CANCEL`. To leave a screen, select the option that leaves it.

## Result statuses

- `ok` — carry on.
- `timed_out` — not fatal; the game is still busy. Call `get_state` (presses nothing) to keep waiting. **Never repeat a press because the last one seemed to fail.** One exception: a `timed_out` carrying `message_pending: true` means the call ran out of time with the game idle on a message; follow its `next` and `press(ACTION)`.
- `stuck` — a press landed and nothing moved. The result names a verdict (`dead_end` / `loop` / `hang`) and carries `escape` with `untried` labels and a `ladder`. Try an untried option first, else the first unspent rung (prefer `safe` over `lossy`; ask the user before a `destructive` rung). Don't bounce between the same two screens more than twice.
- `run_over` — party wiped. Report the wave reached; don't `start_run` again unless the user asks.
- `run_interrupted` — the run may still exist server-side. Report and check `status`.
- Refusals (`no_match`, `ambiguous`, `screen_changed`, …) pressed nothing: `read_menu` and retry with the right label or `index`. `message_pending` is different: a message is up (e.g. "It won't have any effect."), so `press(ACTION)` first, then retry.

## Pacing with a human watching

- A turn resolving takes ~6–9 s; idle decisions ~0.6 s. A wave is ~10–20 acting calls.
- Narrate briefly: one line per meaningful decision (move choice, reward, switch), not per call.
- `screenshot` only when the user wants to see the board; it's ~100× slower than a text read.
- `get_state` with `detail: "party"` (movesets, IVs, stats) before big choices — rival fights, boss waves (every 10th), picking which mon gets an item.
