# Plan: Gym Leader Gordie (wave 180), attempt 2

**Verdict: a 19-turn line that wins with four of six alive, checked turn by turn in the real game engine.**

## Why this is more than a guess

- The battle RNG is re-seeded every turn from a fixed per-battle seed and the turn number
  (`battle.ts randSeedInt`: `sow(shiftCharCodes(battleSeed, turn << 6))`). The live tab's seed is
  `U0QKEz8wJ8ea7832`. Same state and same inputs give the same rolls, crits, misses and AI choices.
- `sim/` loads the live session (exported read-only at W180 T1) into upstream's headless test harness in the pinned clone
  (`.cache/pokerogue/v1.12.0.11`, the same version as live). It undoes the harness's max-roll mock and its 31-IV/neutral-nature
  stats, then plays scripted turns.
- **Validation:** replaying attempt 1's 23 inputs reproduced attempt 1 HP for HP (282, 359, 457/270, 568, 419 … 129, 29,
  534), through to the loss. The winning line below then won identically in three separate runs.
- **What it rests on:** the live tab still being at W180 T1 with that seed (both checked live this session), and every input matching
  exactly. A different move, target or switch order on any turn changes that turn's rolls and everything after it.

## The line

Faint replacements are part of the line. Our mons faint on **T13 (send Golbat)** and **T15 (send Gyarados)**.
"After" is the state at the end of that turn: ours, then Gordie's.

| T | Our input | What happens | After (check this) |
|---|---|---|---|
| 1 | Reshiram **Dragon Pulse** | Gigalith Rock Slide; Reshiram eats Enigma + Sitrus | Reshiram 577/577 · Gigalith **282**/525 |
| 2 | Switch → **Probopass** | Gigalith **Explosion**, faints; Carracosta in | Probopass **359**/427 |
| 3 | Switch → **Leavanny** | Carracosta Brine | Leavanny **413**/497 |
| 4 | Leavanny **Pollen Puff** | Gordie swaps Carracosta → **Coalossal**; PP hits it | Leavanny 382 · Coalossal **657**/711 |
| 5 | Leavanny **Bug Bite** | Coalossal Teras Rock; **crit, steals its Lum**; Burn Up **fails** | Leavanny 351 · Coalossal **515** (Tera) |
| 6 | Leavanny **Leaf Storm** | Stone Edge **misses** Leavanny | Leavanny 320 (−2 SpA) · Coalossal **238** |
| 7 | Leavanny **Bug Bite** | Gordie swaps → Carracosta; **steals its Enigma**, Leavanny heals | Leavanny **413** · Carracosta **380**/467 |
| 8 | Leavanny **Leaf Storm** | Carracosta Iron Defense | Leavanny 382 (−4) · Carracosta **121** |
| 9 | Switch → **Reshiram** | Gordie swaps Carracosta → **Stonjourner** | Reshiram 577 · Stonjourner 574 |
| 10 | Reshiram **Dragon Pulse** | **Stonjourner faints** (one-shot); Barbaracle in | Reshiram 577 |
| 11 | Switch → **Leavanny** | Barbaracle Razor Shell into Leavanny | Leavanny **280** |
| 12 | Leavanny **Leaf Storm** | **Barbaracle faints**; Tyranitar in | Leavanny 249 (−2) |
| 13 | Leavanny **Bug Bite** | steals Leppa; Tyranitar Stone Edge, **Leavanny faints** → **send Golbat** | Golbat 493 · Tyranitar **512**/569 (Enigma used) |
| 14 | Golbat **Toxic** | Stone Edge **misses** | Golbat 463 · Tyranitar **477**, badly poisoned |
| 15 | Golbat **Venoshock** | Stone Edge, **Golbat faints** → **send Gyarados** (Intimidate) | Gyarados 570 · Tyranitar **339** (−1 Atk) |
| 16 | Gyarados **Tera** + **Hydro Pump** | Tera Water; Tyranitar Stone Edge, eats Sitrus | Gyarados **351** · Tyranitar **109** |
| 17 | Gyarados **Hydro Pump** | **Tyranitar faints**; Carracosta in | Gyarados 316 |
| 18 | Gyarados **Hydro Pump** | **Carracosta faints**; Coalossal in; Gyarados Sitrus | Gyarados 423 |
| 19 | Gyarados **Hydro Pump** | crit; **Coalossal faints. Win.** | Gyarados 423, Probopass 359, Snorlax 824, Reshiram 577 |

PP spent: Leaf Storm 3 of 5 (+1 back from the stolen Leppa), Hydro Pump 4 of 8, Dragon Pulse 2. Nothing runs dry.
T19 doesn't need its crit: Tera Hydro Pump's minimum roll into Tera Rock Coalossal (~35%) still beats its 33%.

## Driving it with the coachemon tools

- **Starting point:** at the end of planning, the tab had been reloaded (page uptime ~17 min) and sat on the W180 encounter
  intro (`EncounterPhase`, message on screen) with the same seed, turn 1 and everyone at full HP. Acknowledge the
  messages with `press("ACTION")` until `COMMAND` appears, then check: Reshiram vs Gigalith, sand, Gigalith 525/525.
- Moves: `COMMAND` → `Fight` → move label. Switches: `COMMAND` → `Pokémon` → mon → `Switch`/`Send Out`.
  Faint prompts (T13, T15): `PARTY/FAINT_SWITCH` → the named mon → `Send Out`.
- **T16 Tera:** on `COMMAND`, `press("LEFT")` moves the cursor from Fight to the Tera button (shown only while Tera
  is available), then `press("ACTION")` opens the move list in Tera mode → `Hydro Pump`. Confirm the message
  "Gyarados Terastallized into the Water type!". (`command-ui-handler.ts`: LEFT from Fight → `Command.TERA`.)
- Pollen Puff (T4) needs no target prompt in a single battle.
- After every turn, read state (`get_state` / `read_card`) and compare with the **After** column **before the next input**.
  Reading is safe: the HUD sandbox restores the RNG, and attempt 1 matched the sim with the HUD running.

## If a checkpoint doesn't match

Stop. Don't improvise into the scripted turns that follow, because their luck (T6/T14 misses, T5 crit, the T7 Enigma steal)
belongs to this exact sequence.

1. **Preferred: restart the fight.** The session save is at the start of the wave. Reload the tab, press **Continue**, and
   check that it says wave 180, turn 1, full party, sand up, Gigalith out. Then replay from T1. Watch for the stale-save
   gotcha from the handoff: this Chrome once loaded a wave-176 save from its own localStorage.
2. To understand a divergence, re-run the sim (below) with the inputs actually played. If the sim agrees with live, the input
   was wrong. If it doesn't, the session changed and the line has to be re-searched from a fresh export.
3. Fallback if neither is possible: play to the principles below.

## Principles (for a fresh search or a manual fallback)

These are verified in source and reproduced in the sim.

- **Gordie switches on matchup, not on our move.** A foe swaps when a benched teammate's `getMatchupScore` vs our active
  mon is ≥ 2× its own (he's a boss trainer), damped after each swap. Benched scores halve against legendary Reshiram, so he
  rarely swaps against it. Faint send-ins pick the best score vs our active mon. `sim/pr.sh` computes this.
- **Leavanny pulls Coalossal only until Coalossal Terastallizes.** Pre-Tera it scores 5.17 vs Leavanny, everyone else
  about 2. Tera Rock Coalossal scores 3.0, so after its first move nothing switches away from Leavanny.
- **Coalossal's first move vs Leavanny is Burn Up, and it fails** (Tera happens first, so it is no longer Fire). That's
  a free turn.
- **Bug Bite steals berries:** Coalossal's Lum, Carracosta's Enigma (heals us), Tyranitar's Leppa. It turns their healing
  into ours and opens Coalossal to Toxic.
- **Tera Water Gyarados is the Tyranitar answer:** Stone Edge 114% → 57% (≈38% after Intimidate), Hydro Pump into
  Tyranitar 36% → 48%, Stonjourner 153%. No foe's matchup clears the 2× bar against it, so nothing switches.
- Mean Look is useless: the trap ends when Golbat leaves the field. Lum holders (Stonjourner, Barbaracle, Coalossal) shrug
  off Toxic until Bug Bite takes the Lum.
- Enemy move choice is deterministic: a KO move if one exists, else the top benefit score (≤1% chance of the second pick).
  `sim/ai.sh` predicts it from the live tab.

## Tools in `sim/`

| File | Use |
|---|---|
| `br.py '<prefix>' '<alt>' …` | Run a prefix plus alternative continuations in the real engine (~10–25 s). Tokens: move abbreviations (`DP LS BB PP HP TX VS EP …`) or full `MOVE_ID`, `>Name` switch, `T:HP` Tera + move, `X!Name\|Name` faint-replacement order from that step on. |
| `sim.sh`, `gordie-sim.test.ts` | The harness. It copies the test into the pinned clone, runs vitest, then removes it again. |
| `session-w180.json` | Live session at W180 T1 (read-only export). Re-export it if the live state changes. |
| `pr.sh '<json>'` | Gordie's switch / send-in prediction at hypothetical HP and Tera states, read from the live tab. |
| `ai.sh '<json>'` | Each foe's predicted move vs one of ours, from the live tab. |
| `cdp.mjs` | Like the handoff's, but matches the game tab only. `wiki.pokerogue.net` is open in that Chrome and fooled the original. |
| `winning-line.sim.txt` | Full sim output of the line above, with every message. |
