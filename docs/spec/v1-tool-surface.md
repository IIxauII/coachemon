# The v1 tool surface

The MCP tool surface for `pokerogue-mcp` v1. Settled by [#7 The v1 tool surface](https://github.com/IIxauII/pokerogue-mcp/issues/7); the build tickets are cut from this document.

Every claim here is either a decision taken in #7 or a fact carried from a closed ticket. Facts are tagged **[live]** (observed against the running game) or **[source]** (read from PokéRogue source at `v1.12.0.11` / `e4e9b53`, never exercised). A **[source]** tag is a standing instruction to the build ticket: verify it before depending on it.

Vocabulary is `CONTEXT.md`. Terms used here without definition (*run*, *wave*, *settled*, *snapshot*, *menu*, *press*, *option*) are defined there.

---

## 1. Principles

These hold for every tool. A build ticket that cannot satisfy one must reopen the decision, not work around it.

1. **Settle before read.** Every tool waits for the game to settle before it reads. Reading or pressing an unsettled game races the game's own queue. Settling is cheap — a lean read is 0.21 ms / 338 bytes, 0.2 % of a 100 ms poll interval (#9) — and ~86 % of a wave's CDP round-trips are settle polls that never reach Claude (#6).
2. **The live game is the only source.** No field is computed, simulated, cached or remembered across calls. The scene locator is rediscovered on every evaluate (#9): scan `Phaser.Display.Canvas.CanvasPool.pool` for the entry whose `parent` is the `TextureManager`, take `.game`, then `game.scene.getScene('battle')`. Never `scenes[0]` (it is the `LoadingScene` during boot), never a cached `objectId`, never `window`.
3. **Acting tools return state; reading tools return their payload.** After an action Claude always needs to know what changed, so acting tools carry the lean snapshot. Reading tools carry only what was asked plus a two-field header. Tiering is a *token* decision, not a wire decision — the lean/fat gap on the wire is 0.06 ms (#9).
4. **Never judge success by `processInput`'s return value.** It lies in both directions: #8 logged `Button.STATS` on `STARTER_SELECT` returning `false` while performing its action; #6 logged one press returning `false` that moved the state, and one genuine refusal. **A tool that retries on `false` double-applies.** Success is decided by comparing the post-settle fingerprint against the pre-press fingerprint — which the settle loop already reads, so it is free.
5. **Degrade, never block.** An unmodelled screen returns its mode int, its name if known, and whatever text can be scraped. It never throws and never stops the run.
6. **Commit through `processInput`.** Selection lives entirely inside `processInput`. A cursor may be *positioned* by writing it where that is safe (§7), but the final ACTION always goes through `ui.processInput(Button.ACTION)`. Writing a cursor directly and calling nothing skips every redraw (#4).
7. **A label is never an identifier.** In-game strings are i18next-localized field by field (#10), and the option list is read fresh on every call. Nothing in the server hardcodes a label, and Claude only ever passes back a label it read this call. The one recorded violation — the prototype hardcoding the `MODIFIER_SELECT` row-0 buttons in English — is a bug this spec forbids (§6.6).
8. **Re-read `ui.mode` after every press.** Many handlers change mode from inside `processInput` (`CommandUiHandler` → FIGHT/BALL/PARTY; `BallUiHandler` → MESSAGE) (#4).

---

## 2. The tools

Seven. Three act, four read.

| Tool | Acts? | Purpose |
|---|---|---|
| `status()` | no | Is the server attached and is a run live |
| `get_state(detail?)` | no | The snapshot, tiered |
| `read_menu()` | no | What the game is asking right now |
| `select_option(label, expect_screen?)` | **yes** | Make one decision |
| `press(button)` | **yes** | Deliver one raw button — the escape hatch |
| `start_run(species, slot?, overwrite?)` | **yes** | Cold TITLE → live wave 1 |
| `screenshot()` | no | A picture, for the human |

### What is deliberately not in v1

Each of these was considered and rejected in #7; the reason matters as much as the exclusion.

- **Battle verbs** — `use_move`, `switch_to`, `buy`, `take_reward`, `run_away`. A turn is COMMAND → FIGHT → move: two `select_option` calls. A verb would make it one, saving ~3 calls per wave, but no measured cost problem justifies it yet. The map's **Unattended soak and cost** fog measures whether a full run is affordable; semantic tools get added on that evidence, not on guesswork.
- **`continue_run(slot)`** — resuming an existing save is an entry path #8 never exercised, with unknown settle behaviour. After a wipe the server reports `run_over` and Claude calls `start_run` again.
- **`back()`** — there is no back button in this game. See §5.
- **Any settings tool** — six settings carry `requireReload`, and the reload fires on *leaving* Settings, which kills a live run (#11). The server refuses to act on settings modes at all (§6.5). Game speed and tutorials are the human's to set once, out of band.
- **`connect()` / `disconnect()`** — attachment is the server's job, lazily on first use. Exposing detach hands the agent a new way to break a run for no gain. The map's **Server scaffold and CDP session** fog owns attachment itself.
- **Driving the modal/form family** — ten modes that ignore `processInput` and need DOM text entry (#4). None were hit live in either prototype. `press` falls back to raw keyboard (§6.4), which is the most v1 attempts.
- **Vision as an input to play** — out of scope on the map. `screenshot` exists for the human only (§6.7).
- **Auto-restart after a wipe** — locked at charting. The server reports; Claude decides.

---

## 3. The result envelope

Every tool result, acting or reading, carries a status discriminator and the two header fields.

```jsonc
{
  "status": "ok" | "timed_out" | "stuck" | "run_over" | "run_interrupted",
  "wave": 4,                    // scene.currentBattle.waveIndex, null outside a run
  "screen": "PARTY/FAINT_SWITCH",  // §4
  // ...the tool's own payload
}
```

On any status other than `ok`, a fixed diagnostic block is attached — enough to diagnose from a transcript without re-running:

```jsonc
{
  "diagnostic": {
    "reason": "ui-transition",      // which predicate branch held
    "mode": { "int": 8, "name": "PARTY" },
    "phase_name": "SelectModifierPhase",  // phaseManager.getCurrentPhase().phaseName
    "fingerprint": "…",             // last settle fingerprint
    "elapsed_ms": 23374,
    "presses": 3                    // presses spent without progress, where relevant
  }
}
```

`phaseName` is preferred over `constructor.name`: it is a public string the game compares at runtime via `Phase.is()`, so it cannot be minified away (#11).

### The five statuses

| Status | Meaning | Result or error? |
|---|---|---|
| `ok` | The call did what it says | result |
| `timed_out` | The game did not settle within budget. **Not fatal** — #6 measured a *healthy* game holding `overlayActive === true` for ~67 s after a Rare Candy, tripping three consecutive 20 s no-progress timeouts before recovering on its own. Aborting would have killed a live run. When the budget runs out with the game idle on a MESSAGE awaiting ACTION (a long auto-advanced chain, #55), the result carries `message_pending: true` and `next`, since waiting would never end. | result, carrying partial state |
| `stuck` | A press landed and nothing moved. Distinct from `timed_out` — *busy and still waiting* is not *I pressed and nothing changed*. Collapsing them is what produces a server that presses ACTION blindly into a live game to "escape". | result |
| `run_over` | The party wiped. `GameOverPhase` latched during settle (it dwells ≥ 6 s) (#11). Stands for **wipes only**. | result |
| `run_interrupted` | `LoginPhase` mid-session with no `GameOverPhase` and no menu action in flight ⇒ a `reset(true)` teardown, i.e. the per-wave save failed and dumped the run to TITLE (#11). The run may still exist server-side, so this must **never** read as an invitation to start a new one. | **error** |

When more than one applies, the precedence is `run_interrupted` > `run_over` > `stuck` > `timed_out` > `ok`, and it is the same for every way a call ends: settled, out of time, or refused. A call that runs out of time still reports `run_interrupted` (a `LoginPhase` latched, or #11's save hang held while it waited) or `run_over`, keeping the timeout's `note`. Only `stuck` needs a settled end (#126).

Detecting a run ending is a settle-loop concern, not a `get_state` concern: the phase is gone by the time the title screen settles. The settle loop latches `phaseManager.getCurrentPhase().phaseName` across the transition (0.21 ms / 21 B per poll, #11).

### Owned elsewhere — two open slots

This spec fixes the **shape**. Two behaviours behind it are owned by open sibling tickets, and a build ticket must read them as TBD rather than inventing a number:

- **[#14 The settle timeout contract](https://github.com/IIxauII/pokerogue-mcp/issues/14)** — the no-progress and hard budgets, whether they are counted in seconds or in presses, what the server does after a `timed_out` (keep polling, return partial, hand to Claude), and whether any retry is ever automatic.
- **[#13 Detecting and escaping a stuck screen](https://github.com/IIxauII/pokerogue-mcp/issues/13)** — the stuck detector (N identical presses against an unchanged fingerprint, and what N is), the safe escape ladder, and whether the server escapes on its own or reports `stuck` and hands the decision to Claude.

Neither blocks building the happy path. Both must be a **fingerprint-repetition** counter over a sliding window rather than a same-mode streak counter: #6's 147-iteration failure alternated `MODIFIER_SELECT(6) → PARTY(8) → 6 → 8`, which a same-mode counter cannot see.

---

## 4. Screen identity

`ui.mode` alone does not identify a screen. `UiMode.PARTY` (8) is five different screens distinguished only by `PartyUiMode`, each with a different meaning and a different escape (#2, #6).

So every tool reports a **composite screen id**, and this is the string Claude reasons about:

```
<UiModeName>                       e.g. "COMMAND", "MODIFIER_SELECT"
<UiModeName>/<discriminator>       e.g. "PARTY/FAINT_SWITCH", "STARTER_SELECT/FILTER"
<UiModeName>/<discriminator>:options   the option phase of a two-phase screen
UNKNOWN(<int>)                     mode not in the generated table
```

The discriminated screens are `PARTY/<PartyUiMode>[:options]`, `SAVE_SLOT/SAVE` and `SAVE_SLOT/LOAD`, `SUMMARY/LEARN_MOVE`, `ALERT_MODAL/CLOSABLE` and `STARTER_SELECT/FILTER` (the starter grid with its filter bar active, §6.5). The escape ladder falls back from a composite id to its mode, so `STARTER_SELECT/FILTER` answers to the `STARTER_SELECT` entry.

The game adapter identifies the Screen once per read (`CdpGame`, from one discriminator snippet shared by the settle predicate and the menu reader), and both reads carry it. The raw `{ int, name }` stays in the `read_menu` payload for debugging; the composite id is what the surface talks in.

### PARTY discrimination

Three fields on `scene.ui.handlers[8]`, all read in the one-wave prototype:

| Field | What it says | Live? |
|---|---|---|
| `partyUiMode` (int) | which of the PARTY screens is open | **partly** — 3 of 12 values read live: `1 FAINT_SWITCH`, `4 MODIFIER`, `6 TM_MODIFIER`. The must-answer/dismissible partition itself is **[source]** |
| `optionsMode` (bool) | `false` = slot grid, `true` = per-slot verb list. Different label source, different cursor field | **[live]**, both values |
| `optionsScroll` (bool) | gates `setCursor` safety on the option phase | **[live]**, always `false` so far |

`PARTY/FAINT_SWITCH` is the slot phase; `PARTY/FAINT_SWITCH:options` is the verb list for the chosen slot.

---

## 5. CANCEL is not "back"

There is no back button, and no tool offers a generic "go back". `read_menu` reports a `cancel_effect` field, which is **derived from the escape ladder** ([#15](https://github.com/IIxauII/pokerogue-mcp/issues/15), `src/escape-ladder/table.ts` on master once [#21](https://github.com/IIxauII/pokerogue-mcp/pull/21) merges). That table is the single source for what CANCEL does on every screen. This section used to keep its own table, and it is gone because the audit showed it was wrong in several places:

- `TITLE` is `rejected`, not `selects_last_option` (`TitlePhase` passes `noCancel: true`).
- Nothing `reopens` on the shop's party screens. CANCEL returns to `MODIFIER_SELECT`, and #6's loop was a policy bug (#13). The only real `reopens` is `PARTY/RELEASE`.
- `PARTY/SELECT (12)` is dismissible. `PartyUiMode` has **14** values, not 12.
- `MODIFIER_SELECT` is `asks_confirm`: a skip-item CONFIRM, which is the shop's real exit.
- `MESSAGE` is `consents` (CANCEL ≡ ACTION), not `exits`.

`cancel_effect` ∈ `exits` | `asks_confirm` | `consents` | `selects_last_option` | `reopens` | `rejected`, and screens with no ladder entry get `unknown`. Cost (`safe` / `lossy` / `destructive`) is carried by each rung, not by this field.

Consequence for the agent: to leave a screen, select the option that leaves it (`Cancel`, `No`) by label, like any other decision. `press(CANCEL)` remains available and remains dangerous.

---

## 6. Tool schemas

### 6.1 `status()`

No arguments.

```jsonc
{
  "status": "ok",
  "attached": true,
  "game_version": "1.12.0.11",   // game.config.gameVersion
  "run_live": true,              // scene.currentBattle != null
  "wave": 4,
  "screen": "COMMAND",
  "tab_contended": false         // another driver appears to hold the tab
}
```

The only tool that is meaningful before a run exists. No connect/disconnect: attachment is lazy, on first use, and is owned by the **Server scaffold and CDP session** fog. `tab_contended` exists because #6 had three sessions interleaving presses on one live save on the dev's real account; how it is detected is the scaffold ticket's problem, and reporting `false` when unknown is acceptable.

### 6.2 `get_state(detail?)`

```
detail?: "lean" | "party" | "items" | "full"    // default "lean"
```

**Every field is read inside its own try/catch.** A path that throws or is missing yields `null` for that field and never fails the read. This is what makes it safe to ship the unproven paths below.

Lean (`detail: "lean"`):

| Field | Path | Tag |
|---|---|---|
| `wave` | `scene.currentBattle.waveIndex` | **[live]** |
| `turn` | `scene.currentBattle.turn` | **[live]** |
| `money` | `scene.money` | **[live]** |
| `biome` | `scene.arena.biomeType` (**int**, resolved via the generated table — never the localized display string) | **[source]** — in the prototype's snapshot body, no transcript carries a value |
| `active` | `scene.getPlayerField()[handler.fieldIndex]` → name, level, hp, maxHp, moveset (`m.getName()`, `m.getMovePp() - m.ppUsed`, `power`, `category`) | **[live]** |
| `enemy` | `scene.currentBattle.enemyParty` → name, level, hp, maxHp | **[live]**. Note the prototype's `scene.getEnemyField()` path is **[source]** — prefer the proven one |
| `party` | `scene.getPlayerParty()` → per mon name, level, hp, `getMaxHp()`, `isFainted()` | **[live]** |
| `screen` | §4 | **[live]** |
| `run` | `{ state: "live" \| "over" \| "interrupted" }` | see §3 |

`detail: "party"` adds per-mon status (`p.status.effect`, **[source]**), IVs, stats and full movesets. `detail: "items"` reports held modifiers — **only `scene.modifiers.length` has ever been read (#10); no per-item name, type or stack-count path is proven anywhere.** It ships best-effort under the fault-isolation rule, and **its build ticket owns proving a path**. `detail: "full"` is party + items.

`scene.currentBattle.double` is **[source]** — a double battle was played (#6, wave 6, two enemy targets) but the field itself was never logged.

### 6.3 `select_option(label, expect_screen?)`

```
label: string
expect_screen?: string    // a composite screen id from read_menu
```

**Matching.** Normalize both sides — strip BBCode (`/\[\/?[^\]]*\]/g`; `[shadow]Apply[/shadow]` is real, observed live on the PARTY option phase), trim, collapse internal whitespace, case-fold — then match **exactly**. No fuzzy matching: on a screen where `Apply` and `Cancel` are one keystroke apart and one of them can end a run, a confident wrong match is the worst available failure.

- **No match** → error `no_match`, echoing the actual normalized option list and the current cursor position, so the next attempt uses a real label.
- **More than one match** → error `ambiguous`, echoing the same.
- **`expect_screen` given and the live screen differs** → error `screen_changed`, carrying the live screen. Nothing is pressed. This is advisory and optional: auto-advance (§6.8) and a contended tab both mean the screen can move between reading and acting, and on a party screen the wrong option destroys a run. Omitted ⇒ act on whatever is live.
- **The screen moves between the settled read and the menu read** → error `screen_changed`, carrying the menu read's screen and the settled one as `was`. Nothing is pressed. `start_run` refuses the same way on TITLE. A cursor-walk step whose menu read shows another screen than the walk started on also stops as `screen_changed`; its detail counts the presses already sent, and nothing is committed. Read-only calls (`read_menu`, `get_state`) never refuse on it: they report the menu read's newer screen. A menu read that failed identifies no screen, so it is never a change: the settled screen stands.

**Movement** follows the per-family table in §7. The final commit is always `ui.processInput(Button.ACTION)`.

### 6.4 `press(button)`

```
button: string    // Button enum member name, resolved via the generated table (#2)
```

One button, one press. The permanent escape hatch, and the only way to act on an unmodelled screen.

Delivery: try `ui.processInput(button)`. If the settle fingerprint has not left its pre-press value, retry **once** via a raw keyboard event dispatched to **`window`** (Phaser binds keyboard to `window`, not `document` — #9). The raw fallback was implemented in #8 and never needed; #6 spent 51 presses across a wave with zero requiring it, and the one time it did fire it also did nothing. No retry when a direction press moved the menu reader's cursor (both reads real cursors, not a failed read): that press landed on a handler whose cursor the fingerprint does not carry, and a retry would move it twice (#32).

`processInput`'s return value is **never reported and never used as a decision input** (Principle 4). The result carries `changed: true | false`, derived from the fingerprint, or `true` when the menu cursor moved.

### 6.5 Refusals

The server refuses, rather than pressing, in three cases. A refusal is an error carrying the live screen; nothing is sent to the game.

1. **Settings modes.** Six settings carry `requireReload` and the reload fires on *leaving* Settings, killing a live run (#11). If the game is ever on a settings screen, every acting tool refuses and reports it.
2. **The `STARTER_SELECT` filter bar, the `STARTER_SELECT/FILTER` screen.** Entered only by `STATS` from the grid or UP from row 0, and fully avoidable since `setCursor` is safe in grid mode. The server never navigates into it, and refuses `filter_bar` on `STARTER_SELECT/FILTER` — where `setCursor(n)` silently writes `filterBarCursor` instead of the grid cursor (**[live]** #8). The refusal is decided from the screen id alone: every acting tool's guard, and `start_run` when a setup step arrives on it. The in-page `starterSetCursor` keeps its own `filterMode` check as a last-moment safety.
3. **`start_run` onto an occupied slot** — see below.

### 6.6 `start_run(species, slot?, overwrite?)`

```
species: string[]          // species names, resolved at runtime
slot?: number              // 0-4; default: the lowest slot with hasData === false
overwrite?: boolean        // default false
```

Proved end to end by #8: **13 presses from a cold TITLE to a live wave 1**, all accepted, raw fallback never needed. The route crosses five modes: `TITLE(1)` → `OPTION_SELECT(15)` game-mode select `[Classic, Daily Run, Cancel]` → `STARTER_SELECT(10)` → `CONFIRM(14)` → `SAVE_SLOT(7)`. Note the slot screen comes **after** the starter confirm.

This tool earns its place not on press count but on two hazards:

- **Species → index is unstable.** The grid is `filteredStarterContainers`, whose length depends on the profile's caught set *and* its persisted filter preferences (27 of 572 entries on the dev's profile, with a non-default Caught column). An index hardcoded anywhere is wrong on the next profile or after any filter change. `species` is therefore a list of **names**, resolved at call time against `filteredStarterContainers[i].species.name`. A name not present → error listing what is available. The server never widens the filters to find it (§6.5).
- **Slot choice is destructive.** `sessionSlots[i].hasData` is readable *before* committing (**[live]**, all five read `false` in #8). If the target slot has data, `start_run` **refuses**, naming the occupied and free slots. `overwrite: true` is the only way past. #5 put this on the dev's real account, so overwriting a real save is never the default.

The server should also read `scene.gameData.getSpeciesStarterValue(id)` for each requested species and refuse before pressing if the party exceeds the cost budget, rather than discovering it at a rejected START.

**A setup step that runs out of the call budget is a result, not a refusal.** `start_run` returns `timed_out` (or whatever status outranks it, §3) with the setup's `step`, its `log` so far and a `next` hint: the setup is left part-way, and `start_run` needs TITLE again. Refusals stay for a screen that isn't the one the next step needs and for the checks made before anything is sent (#141).

Per-mon cost is `2 presses + 3` using `setCursor` on the grid; ACTION opens a per-mon `OPTION_SELECT(15)` whose index 0 is `Add to Party`.

**The `EncounterPhase` → first `COMMAND` leg after the run starts has no clean press count** — it was only ever walked under a polluted ACTION-spam run (#8). Auto-advance (§6.8) covers the MESSAGE screens on that leg; the switch prompt on it is a `CONFIRM` and must be answered, not advanced.

### 6.7 `screenshot()`

No arguments. Returns a `Page.captureScreenshot` image. **For the human reading a transcript, not an input to play.** Never returned by another tool, never called automatically. Measured at 29 ms and 86 KB — ~100× slower and ~91× larger than the entire text read (#9) — which is exactly why it is opt-in and why vision is out of scope as a control loop.

### 6.8 Auto-advance (behaviour of all acting tools)

`MESSAGE(0)` has **zero options**; the only legal input is ACTION. It cost 2 presses on one measured wave, 6 on another, 8 in a double battle, plus 5 tutorial prompts mid-battle at wave 6 with tutorials on (#6) — against only **5–6 real decisions per wave**. Up to a third of a run's tool calls would be spent pressing A at text.

So after any acting call, once the game settles, the server advances `MESSAGE(0)` screens itself until it reaches a screen with a decision, and returns everything it crossed:

```jsonc
{ "messages": ["Bulbasaur grew to Lv. 6!", "…"] }
```

Three constraints, all load-bearing:

- **Only `UiMode.MESSAGE` (0), and only with no pending question.** `CONFIRM(14)` is never auto-advanced. **ACTION is consent, not "advance dialogue"** — at the start of wave 1 the game asks whether to switch Pokémon and ACTION answers *yes*; spamming it consented to a switch, landed in `PARTY(8)`, then trapped in `SUMMARY(9)` (#8).
- **Advance only while `awaitingActionInput` is true and `onActionInput != null`.** `awaitingActionInput` is never reset on consumption, so it must be paired (#3).
- **Bounded by a press cap.** Hitting the cap stops pressing and hands the live `MESSAGE` back as it stands, with `next: press("ACTION")`, rather than pressing forever. The cap's value is #13's to set.

The text is returned, never discarded: level-ups, faints and item effects are announced only there. #6 logged three identical `"Bulbasaur grew to Lv. 6!"` prompts in a row, which is also why a settle rule that requires the fingerprint to *change* cannot be the only progress term.

---

## 7. Per-family movement

`select_option` does cursor math server-side, but the evidence for `setCursor` being safe is thin: it was exercised live on exactly **two** screens. So the rule is **`setCursor` only where measured or provably safe; directional presses everywhere else; presses for anything unknown.**

| Screen | Movement | Why |
|---|---|---|
| `MODIFIER_SELECT` | **`setCursor`** — `setRowCursor(row)` **then** `setCursor(col)`. Order is load-bearing: `setRowCursor` sets `this.cursor = -1` before re-entering `setCursor` | **[live]**, every wave, worked every time (#6) |
| `STARTER_SELECT` grid | **`setCursor`** — clamps, keeps the sprite synced, fires `setSpecies`/`updateInstructions` | **[live]** #8, measured reversibly |
| `TITLE` / `CONFIRM` / `OPTION_SELECT` | **`setCursor`** — handles scroll maths internally. Select via `config.options[unskippedIndices[fullCursor]]`; **`h.cursor` is a screen row, not the option index** — use `h.fullCursor` | **[source]** #4, not exercised live |
| `COMMAND` | presses. Read the cursor with **`h.getCursor()`** (`fieldIndex ? cursor2 : cursor`) — plain `h.cursor` is wrong on field slot 2 in doubles | `setCursor` is **[source]**-safe but leaves the tera glow stale |
| `FIGHT` | presses (UP/DOWN are ±2, LEFT/RIGHT ±1 over a 2×2). Read with `h.getCursor()` | `setCursor` is **[source]**-safe; the one live move change used `DOWN` |
| `PARTY` slot phase | presses | `setCursor` is **[source]**-safe but skips the `lastLeftPokemonCursor` bookkeeping; live runs used `DOWN` |
| `PARTY` option phase | **presses, always** | `setOptionsCursor` assumes ±1 steps and desynchronises `optionsScrollCursor` on a multi-step jump when `optionsScroll === true`. That branch has never been observed true — which is not a reason to risk it |
| `SAVE_SLOT` | presses | Absolute index is `h.cursor + h.scrollCursor`; `setCursor` moves only the on-screen row and is not re-entrant with `scrollCursor` |
| `TARGET_SELECT` | presses | **`h.cursor` is a `BattlerIndex`, not a list index** — sparse; the legal set is `h.targets[]` |
| `SUMMARY` | **never position** | `cursor` is a *page* index; `setCursor` drives page-transition tweens. CANCEL is the only exit anyway |
| `SUMMARY/LEARN_MOVE` move list | **`setCursor(row)`**, only while `h.moveSelect`; presses (UP/DOWN ±1, wrapping over rows 0–4) as fallback | **[source]** #31: with `moveSelect` on, `setCursor` writes `moveCursor` only, and UP/DOWN are themselves `setCursor(moveCursor ± 1)`. Off it, the same call turns the page, so the driver refuses |
| Anything unmodelled | presses, or nothing | Degrade, never block |

### Where labels come from

**Check `handler.config.options` first and never touch scene geometry when it exists** — that array is already in cursor order with clean strings (#6). Geometry is the fallback, and both known geometry bugs live in the one family that lacks `config.options`.

| Screen | Labels | Care |
|---|---|---|
| `TITLE` / `CONFIRM` / `OPTION_SELECT` | `handler.config.options[i].label` | clean, in cursor order |
| `COMMAND` | text children of `h.commandsContainer` | child 0 is the tera sprite |
| `FIGHT` | text children of `h.movesContainer` | `"-"` is an empty slot |
| `MODIFIER_SELECT` | `h.options[]` and `h.shopOptionsRows[][]`; label `opt.modifierTypeOption.type.name`, cost `.cost` | shop rows are indexed **backwards**: row *n* ≥ 2 is `h.shopOptionsRows.at(-(n-1))`. **Row 0 is the button bar** (`Reroll`, `Manage Items`, `Check Team`, `Lock Rarities`) — these must be read from the game's own i18n keys (`reroll`/`manageItems`/`checkTeam`/`lockRarities`), **not hardcoded in English as the prototype did** |
| `PARTY` slot phase | `scene.getPlayerParty()` objects | slot 6 is Cancel; slot 7 is the transfer/discard toggle in item modes |
| `PARTY` option phase | text children of `h.optionsContainer`, **sorted by `y` ASCENDING** | descending silently selects the wrong option — it yields `[Cancel, …, Apply]` and acting on index 1 opened **Summary** while the reader called it "Pause Evolution", twice. Ascending gives verb-first, `Cancel` last. **BBCode must be stripped.** `h.options[]` holds `PartyOption` ints, not strings |
| `TARGET_SELECT` | **no label objects exist** — synthesize from `scene.getField()[battlerIndex]` → name, hp, maxHp, for each `i` in `h.targets` | frozen when `h.isMultipleTargets` |
| `SAVE_SLOT` | no label array — synthesize from `h.sessionSlots[abs]` | `hasData` readable before committing |
| `STARTER_SELECT` | no label text — derive from `filteredStarterContainers[i].species.name` | index unstable across profiles |
| `SUMMARY` | none — informational | `unmapped` family; CANCEL out |
| `SUMMARY/LEARN_MOVE` | `learn_move` family: `h.pokemon.getMoveset()[i].getName()` for rows 0–3, `h.newMove.name` for row 4; cursor `h.moveCursor` | ACTION on a moveset row forgets it; on row 4 it goes through CANCEL and declines. `h.cursor` is the page. Empty while `moveSelect` is off |

---

## 8. Modes seen and unseen

Twelve `UiMode`s were hit live across both prototypes, and **no mode appeared that #4's table fails to describe** (#6):

`MESSAGE(0)`, `TITLE(1)`, `COMMAND(2)`, `FIGHT(3)`, `TARGET_SELECT(5)`, `MODIFIER_SELECT(6)`, `SAVE_SLOT(7)`, `PARTY(8)`, `SUMMARY(9)`, `STARTER_SELECT(10)`, `CONFIRM(14)`, `OPTION_SELECT(15)`.

Never hit live, and therefore handled only by the degrade rule in v1: `BALL(4)`, `MYSTERY_ENCOUNTER(45)`, `EVOLUTION_SCENE(11)`, `EGG_HATCH_SCENE(12)`, every modal/form mode, every settings mode.

`SUMMARY(9)` fell through to `family: "unmapped"` on first contact and the run continued — so "degrade, never block" has been exercised live, not merely assumed.

---

## 9. Build tickets cut from this

One per tool where the work is self-contained, plus the two that carry unproven ground:

1. **Result envelope and settle integration** — §3, with #13/#14's values left as configuration.
2. **`get_state`** — §6.2, including per-field fault isolation and **proving a held-modifier path** (`detail: "items"` has none).
3. **`read_menu`** — §4, §5, and the label table in §7. Owns the composite screen id and `cancel_effect`.
4. **`select_option`** — §6.3 and the movement table in §7.
5. **`press`** — §6.4, including the raw-keyboard fallback to `window`.
6. **`start_run`** — §6.6, including species-name resolution and the occupied-slot refusal.
7. **`status` and `screenshot`** — §6.1, §6.7. Small; may share a ticket.
8. **Auto-advance** — §6.8. Belongs with the envelope, not with any single tool.

Each inherits Principle 4 (never trust `processInput`'s return) and the **[source]** tags above as verification work.

---

## 10. Corrections from the build

[#24 Build the v1 server end to end](https://github.com/IIxauII/pokerogue-mcp/issues/24) built all eight in one pass and played a run from `start_run` to `run_over` through the server. What the live game corrected in this document, each **[live]**:

- **§6.2 `biome`:** the field is `scene.arena.biomeId`, not `biomeType`. `biomeType` reads `undefined` for the whole run.
- **§7 `PARTY` slot phase:** Cancel is the **fixed cursor 6**, not `party.length`; item-manage modes add the transfer/discard toggle at 7. DOWN walks `0 … n-1 → 6 → 0` (`PartyUiHandler.processInput`), so the driver navigates the slot list as a DOWN-cycle. A ±1 walk to index 3 oscillated between 2 and 6.
- **§6.6 the first prompt of a run** is `PARTY/POST_BATTLE_SWITCH` ("Will you switch Pokémon?"), not a `CONFIRM`. Leaving it is `select_option("Cancel")`; the lesson that ACTION consents still holds.
- **§6.6 slots:** `sessionSlots[i].hasData` is **`undefined` until the slot's server fetch resolves**, and the handler refuses ACTION on such a slot. The reader now reports `hasData: null` and the predicate treats any unresolved slot as busy (`slots-loading`). A logged-in account's slots live server-side, so **localStorage cannot pre-check them** — every `sessionData*` key was absent while slot 0 held a wave-1 run. `start_run` therefore decides on the slot screen itself; an occupied slot without `overwrite` answers the game's overwrite `CONFIRM` with **No** and refuses, leaving the setup on `SAVE_SLOT/SAVE` where `select_option("Slot N")` continues it.
- **§3 a fresh run can be interrupted on its very first save.** Observed once: `EncounterPhase` at wave 1 → `ALERT_MODAL` (the `showInvalidSaveModal` path in `game-data.ts`, no `closeDelay`) → `reset(true)` → `TITLE`, about five seconds later. The retry into the same slot succeeded; the local system data had been out of date and the game reinitialised it. #11's teardown shape, met live, before any wave was played.
- **§3 an alert shown without `closeDelay` is unclosable**, and one *with* a delay is unclosable until it elapses. The predicate reports both as busy (`alert-unclosable`) rather than settled, so a transient alert never trips the no-escape verdict on sight; a permanent one surfaces as `timed_out` carrying `alert_text` and the page's recent console errors.
- **§6.8 auto-advance** only ever crosses *prompts*: battle narration scrolls by itself and is never returned. Level-ups, faints and EXP gains are prompts and do come back in `messages[]`. The press cap is set at **12** (the stuck window), as configuration in `src/driver.ts`. Hitting it is **not** `stuck` (#45): a Rarer Candy on a full party, or a gym win's reward messages, crosses more than twelve prompts while every press makes progress. The capped result is `ok` with a top-level `next` hint; a `MESSAGE` that really repeats is left to the stuck detector, across calls.
- **§3 acting results also carry `menu`** — screen, labels in cursor order, cursor, text — because the agent needs it for the next decision anyway and it saves a `read_menu` per decision.
- **§7 shop row 0** labels are read from the four button containers' text objects (`rerollButtonContainer`, `transferButtonContainer`, `checkButtonContainer`, `lockRarityButtonContainer`, plus the continue button when the reward row is empty), invisible ones omitted, in the handler's own cursor order.
- **Measured on the dumb policy** (`scripts/autoplay.ts`, one run, waves 1–4): a decision on an idle game is ~0.6 s wall clock end to end (settle ≈ 200 ms of it), a turn that resolves is 2–9 s, a wave is 10–20 acting calls, and the stuck detector tripped twice on policy loops at exactly the twelfth decision each time (`PARTY/FAINT_SWITCH:options → SUMMARY → CANCEL`, and #6's `MODIFIER_SELECT ↔ PARTY/MODIFIER`), never on a healthy stretch.
