# Elite Four Drayton, wave 188: solved on the seed and played live

The first real second trainer-fight export for the battle oracle (#632). `research/solve-search` had only Gordie W180
and game-generated stand-ins ("No second trainer-fight export exists"). Same run and team as Gordie, eight waves on.

- **Date:** 2026-10-13. **Game version:** 1.12.0.11, live and pinned clone alike.
- **Run:** classic, session slot 3 (`Slot 4` on the load screen), run seed `VTAUX0Kaz7T3GDMR7LXP1Bhn`, battle seed
  `DAihNIyy0o8ef1c1`.
- **Ours (L188):** Gyarados (lead), Snorlax (asleep), Reshiram, Probopass, Golbat, Leavanny.
- **Drayton's team:** Dragonite L179 (lead), Sceptile L182, Flygon L182, Haxorus L182, Archaludon L190 (boss, 2 bars),
  Tatsugiri L179.
- **HUD card at T1:** `likely lost · 💀 Haxorus KOs 2/6 · nobody KOs Haxorus 1-on-1 or outspeeds it`.

## How it was made

1. **Export.** The game was in Orion at T1, on `CommandPhase`. `export/export.js` ran in the page world through
   `export/orion-eval.sh` (Apple Events JS), and read `gameData.getSession(slot)`: the **wave-start save** that Continue
   loads (replay-fidelity's Fix A). It also read `getSessionSaveData()` live for comparison. Nothing was written.
   - `session-w188.json` is the wave-start save, the solver's input.
   - `live-w188-t1.json` is the live T1 save. Its wave, seed, party and foe HP match the wave-start save.
2. **Search.** `research/solve-search`'s `harness/portfolio.py` ran unchanged, with `--workers 4 --budget 9000
   --session session-w188.json` and `SS_HEAP_MB=1536`. The machine's load average was about 25, from other sessions.
   - It booted, then found a win at depth 10 in 369 s, after 2,084 expansions in all.
   - Beams W8@1 and W8@0.5 both had 32 winning children at L10. W8@1's first five replayed from T1 5/5 at 376 s.
   - Output: `search/` (`summary.json`, `pf.log`, `mem.jsonl`).
3. **Replay with messages.** The first win was played twice in one process (`probe.sh`, `kind: lines`). Both
   matched turn for turn. Output: `replay/out.json`.
4. **Live.** The Orion tab stayed at T1. Chrome (the coachemon MCP tab) loaded slot 4. Its save timestamp,
   `2026-10-12 23:37:59`, and its play time, `3:04:38`, were the same as the export's. An agent then drove the line with
   `select_option` and `press`. It checked each turn's end state against the replay before the next input.

## The line, and what the live game did

Ten inputs. The win is fixed by the end of turn 9: any attack wins turn 10 (the 32 winning children differ only there).

| # | Input | Replay: after the turn | Live |
|---|---|---|---|
| 1 | switch → Probopass | Dragonite Breaking Swipe crit; Probopass 346/461, −1 Atk | 346 ✓ |
| 2 | Earth Power | Drayton swaps to Archaludon; Archaludon 289/578 | 289 ✓ |
| 3 | switch → Reshiram | Flash Cannon; Reshiram 587/622 | 587 ✓ |
| 4 | Blue Flare | Archaludon faints; Tatsugiri in; Reshiram 622 | ✓ |
| 5 | Fickle Beam | double-power proc; Tatsugiri faints; Haxorus in | ✓ |
| 6 | **Tera** (Bug) + Fickle Beam | Haxorus Outrage first; Haxorus faints; Dragonite in; Reshiram 318 | 318 ✓ |
| 7 | Dragon Pulse | Air Slash SE → Enigma heal + stat berries; Dragonite 226 (Sitrus) +2 Atk; Reshiram 307 | 307 / 226 ✓ |
| 8 | Hyper Voice | Dragonite faints; Flygon in; Reshiram 383 | 383 ✓ |
| 9 | Hyper Voice | Flygon Dragon Rush first; crit, Flygon faints; Sceptile in; Reshiram 221 | 221 ✓ |
| 10 | Hyper Voice | Sceptile Teras Dragon, Dual Chop ×2; Sceptile faints; **win**; Reshiram 38 → Leftovers → 114 | **win**, 114 ✓ |

**Won, with all six alive. All 10 checkpoints matched.** At first T10 looked like a miss: the search and the replay
said Reshiram 38, and the live rewards screen showed 114. `harness/t10.test.ts` (run by `t10.sh`, output in `t10/`)
followed the last turn phase by phase through to `SelectModifierPhase`:

- Dual Chop took Reshiram 221 → 130 → 38. On a winning turn, the harness's snapshot is taken at `VictoryPhase`.
- After that, the end of the turn still runs: "Reshiram restored a little HP using its Leftovers!" takes it to **114**,
  before "You defeated Elite Four Drayton!". That is the live value.
- On the rewards screen the fainted foes' max HP drops (Sceptile 515 → 490, Dragonite 584 → 552, Haxorus 528 → 503).
  The harness shows the same drop at the same point, so the MCP's post-battle read is right.

**For the harness:** a winning turn's end state is read before the end-of-turn effects that follow the last faint
(Leftovers here). A checkpoint for the final turn should be read at `SelectModifierPhase`, or say "before Leftovers".

Tera in the MCP: on `COMMAND`, `press("LEFT")` moves the cursor to 4, then `press("ACTION")` opens `FIGHT` in Tera mode.
`read_menu` doesn't show the mode, so a screenshot confirmed it (#642).

## Not kept

The worker pool's job and result files (`pf/jobs`, `pf/results`, about 5.6 MB) and the harness, which is unchanged on
`research/solve-search`.
