# Champion Kieran, wave 190: solved on the seed and played live

The third real trainer-fight export for the battle oracle (#632), after Gordie W180 and Drayton W188. It is the same
run and team, two waves after Drayton. It is the longest line so far: 31 inputs over 32 turns, against Drayton's 10.

- **Date:** 2026-10-13. **Game version:** 1.12.0.11, both in the live game and in the pinned clone.
- **Run:** Classic, session slot 3, run seed `VTAUX0Kaz7T3GDMR7LXP1Bhn`, battle seed `5XdJk1erBRjzqCqu`. The
  wave-start save is dated `2026-10-13 21:13:23`, at play time `3:10:25`.
- **Ours (L188):** Reshiram (lead), Snorlax (asleep), Probopass, Gyarados (601/611), Golbat, Leavanny.
- **Kieran's team:** Incineroar L185 (lead), Politoed L185, Gliscor L185, G-Max Grimmsnarl L185, Terapagos L193,
  Hydrapple L193.
- **HUD road before the wave:** `risky — nothing hits Terapagos super-effectively; +5 levels on us`.

## How it was made

1. **Export.** The game was open in Chrome only, with no Orion tab, at T1 on `CommandPhase`. `export/cdp-export.mjs`
   ran the Drayton export expression through CDP `Runtime.evaluate` on port 9222, with `awaitPromise`, so there was
   no async `dataset` round trip. Nothing was written to the game.
   - `session-w190.json` is the wave-start save, `gameData.getSession(3)`. It is the solver's input.
   - `live-w190-t1.json` is the live T1 save.
2. **Search.** `research/solve-search`'s `harness/portfolio.py` ran unchanged, with `--workers 6 --budget 9000
   --session session-w190.json` and `SS_HEAP_MB=1536`. The machine's load average was about 5 at the start and 23–28
   during the run.
   - The search reached a win at depth 32 at 4,805 s, after 6,274 expansions. Beam W8@1 had 16 winning children at
     L32, and its first five replayed from T1 5/5 at 4,819 s.
   - The other two beams found nothing: W8@0.5 emptied at L15 (288 stalled), and W16@0.5 was at L17.
   - Output: `search/` (`summary.json`, `pf.log`, `mem.jsonl`, and the worker logs in `logs/`).
3. **Replay with messages.** The first win was played once with `msgs: true` (`probe.sh`, `kind: lines`) and won in 32
   turns. Output: `replay/out.json`, and `replay/win0.txt`, which is `show_lines.py`'s turn-by-turn view.
4. **Live.** The Chrome tab was reloaded to T1 before the first input. A second CDP export of it was byte-identical to
   `session-w190.json`. An agent then drove the line with `select_option`, checking each turn's end state against the
   replay before giving the next input.

## The search lost its whole worker pool, and the coordinator waited forever

Every worker exited, and the coordinator never noticed. It has no respawn and no timeout on outstanding jobs: it kept
waiting on its outstanding jobs while no worker polled for them. In `mem.jsonl`, every `mb` is 0 from 3,685 s. The
rescue workers below are not the coordinator's children, so they never show there.

| Worker | Exit | Cause in the log |
|---|---|---|
| w1 | 1,157 s | `serve` returned and the test passed. No out-of-memory error. The exit lands next to W8@1 L21's 5 errors. |
| w0 | 3,541 s | The same: `serve` returned, with no out-of-memory error. |
| w2–w5 | 3,657–3,682 s | `FATAL ERROR: Ineffective mark-compacts near heap limit … JavaScript heap out of memory` |

The peak worker RSS was 1,524 MB, against a 1,632 MB V8 heap limit (`SS_HEAP_MB=1536`). A worker's memory grows over
an hour of expanding deep caps. Drayton finished in 6 minutes and never got near the limit.

**The rescue kept the search.** The beams live only in the coordinator's memory, so killing it would have thrown away
80 minutes. Instead:

- The newest `claimed/` file of each dead worker went back into `jobs/`. A result for a job that had already been
  handled is never read, so a duplicate does no harm.
- Four fresh workers were started under the live coordinator, with the same `SS_MODE=worker SS_DIR SS_SESSION`
  environment and `SS_HEAP_MB=2560` (`logs/w6`–`w9`).

The coordinator picked up their results without a restart, finished W8@1's L32 and replayed the win about two minutes
later.

**For the harness:**

- `portfolio.py` should notice a dead worker (`p.poll()`) and either respawn it and re-queue its claim, or stop with
  `"stop_reason": "workers died"`. As it is, a dead pool looks exactly like a slow layer.
- A long fight needs a larger `SS_HEAP_MB` than §6's 1536, or workers that recycle themselves.

## The line, and what the live game did

31 inputs. The Bounce on input 10 takes two turns, and its second turn needs no input. Only the last two inputs differ
between the 16 wins, so any of `{Blue Flare, Fickle Beam, Dragon Pulse}` × `{Blue Flare, Fickle Beam}` wins. No Tera.

| # | Input | Replay: after the turn | Live |
|---|---|---|---|
| 1 | Dragon Pulse | Incineroar Thrash; Reshiram 471, Incineroar 314 | ✓ |
| 2 | Fickle Beam | double-power proc; Incineroar faints; Grimmsnarl in; Reshiram 547 | ✓ |
| 3 | Hyper Voice | Foul Play; Reshiram 437, Grimmsnarl 488 | ✓ |
| 4 | Blue Flare | Grimmsnarl faints; Politoed in, rain; Reshiram 513 | ✓ |
| 5 | Dragon Pulse | Earthquake SE → Enigma Berry; Reshiram 517, Politoed 313 | ✓ |
| 6 | Fickle Beam | double-power proc; Politoed faints; Gliscor in; Reshiram 593 | ✓ |
| 7 | Dragon Pulse | Earthquake SE first; Reshiram 254, Gliscor 205 (Toxic Orb) | ✓ |
| 8 | switch → Gyarados | Earthquake doesn't affect it; Gyarados 601 | ✓ |
| 9 | Hurricane | Kieran swaps to Hydrapple; Hydrapple 354 | ✓ |
| 10 | Bounce | Hydrapple Teras Fighting; Giga Drain misses Gyarados in the air | ✓ |
| — | (Bounce lands) | Kieran swaps to Terapagos; Terapagos 508, Hydrapple 575 on the bench | ✓ |
| 11 | switch → Probopass | Tera Starstorm, mostly ineffective; Probopass 405 | ✓ |
| 12 | switch → Snorlax | Astral Barrage doesn't affect it; Snorlax 1096 | ✓ |
| 13 | switch → Probopass | Probopass 352 | ✓ |
| 14 | Zap Cannon | 50% hit; paralysis cured at once; Probopass 216, Terapagos 412 | ✓ |
| 15 | Power Gem | Kieran swaps to Gliscor; Gliscor 126, +2 SpA +1 SpD | ✓ |
| 16 | switch → Gyarados | Earthquake doesn't affect it; Gliscor 191 (Poison Heal) | ✓ |
| 17 | switch → Reshiram | Kieran swaps to Terapagos; Reshiram 330 | ✓ |
| 18 | switch → Probopass | Probopass 164 | ✓ |
| 19 | Power Gem | Kieran swaps to Gliscor; Gliscor 131 | ✓ |
| 20 | switch → Gyarados | Gliscor 196 | ✓ |
| 21 | Hurricane | Kieran swaps to Terapagos; Terapagos 311 | ✓ |
| 22 | switch → Snorlax | Astral Barrage doesn't affect it; Snorlax 1096 | ✓ |
| 23 | Sleep Talk | Kieran swaps to Hydrapple; Body Slam crit; Hydrapple 336 | ✓ |
| 24 | switch → Probopass | Fickle Beam ×2; Probopass 53 | ✓ |
| 25 | Tri Attack, replacement Snorlax | Tera Blast first; Probopass faints | ✓ |
| 26 | Sleep Talk | Body Slam; Snorlax 845, Hydrapple 120 | ✓ |
| 27 | Rest | wakes, Rests; Snorlax 1096 | ✓ |
| 28 | switch → Reshiram | Giga Drain; Reshiram 331, Hydrapple 157 | ✓ |
| 29 | Hyper Voice | Kieran swaps to Gliscor; Gliscor faints; Terapagos in; Reshiram 407, Hydrapple 378 | ✓ |
| 30 | Blue Flare | Quick Claw, crit; Terapagos faints; Hydrapple in; Reshiram 483 | ✓ |
| 31 | Blue Flare | Hydrapple faints; **win** | **win** ✓ |

**Won, losing only Probopass. All 31 checkpoints matched**, the final one included.

The line spends the oracle's whole advantage. It runs on a 50% Zap Cannon (14), two crits (23, 30) and a Quick Claw
proc (30). It also uses about a dozen free switches into immunities (Gyarados against Earthquake, Snorlax against
Astral Barrage) to farm Kieran's AI-driven swaps. The seed fixes all of them, and no turn line a person would play
looks like this.

## Not kept

- The worker pool's job and result files (`search/claimed`, about 25 MB, and `search/results`).
- The harness, which is unchanged on `research/solve-search`.
