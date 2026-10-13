# Gordie W180: the HUD's card against the engine

Research for #638 ("How far did the HUD's card diverge from the engine on Gordie?"), part of the map
"seed-exact fight knowledge for the player" (#633). HUD at `origin/master` `aca70ca`; game at the pinned clone
`v1.12.0.11`, the same version the live fight ran on.

## Answer

**The card's turn read matched the engine on every check. Its fight plan and verdict did not, and following the card
from the start of the fight loses.**

- **Right every time:**
  - Gordie's move: 213 of 213, including the T2 Explosion that was a ≤1% AI roll.
  - His switches: 27 of 27 predicted swaps, and 292 of 292 turns where it said he would stay.
  - One-hit KOs: 89 of 89.
  - 💀 tags: 67 right, and none where our mon survived the hit.
- **Wrong or unreliable:**
  - **The verdict** (winnable / likely lost) matched how the card's own line ended at 9 of 22 points.
  - **The "free entry" flag** said our mon falls this turn 32 times when the hit landed, and was right 9 times.
  - **The foe's move at a faint prompt** is an estimate shown as `p=100`, and it was right 22 times out of 56.
  - **The ⚔ line and the fight plan disagree.** On several turns the plan's own "prefers" line names a better first
    move than the ⚔ line, or the same move with the opposite verdict.
- **Following the card:**
  - From T1, it loses. Gordie keeps Tyranitar at full HP.
  - From any point of the winning line up to T7, it loses. From T8 on, it wins.
  - From attempt 1's T5, T7, T13 or T17 it would have won. From T3 or T9 it loses.
  - The deciding turn is **T7**:
    - the card switches Leavanny out to Probopass;
    - the winning line stays in and Bug Bites the incoming Carracosta, eating its Enigma Berry.
- **What only a rollout found:**
  - that T7 is the deciding turn, and that the line's other departures from the card (T2, T5, T13, T16) don't matter
    on their own;
  - whether a position is winnable at all;
  - the plays the card has no words for: berry theft, our Tera, Toxic on the win condition.

Everything below is for this seed (`U0QKEz8wJ8ea7832`). Each turn's battle RNG is reseeded from the seed and the turn
number, so a line is exactly reproducible. A different input on any turn changes its luck and everything after it.

## Method

### The harness

`harness/hud-vs-engine.test.ts` is #632's `gordie-sim.test.ts`, with the card read added. It keeps all of #632's fixes:

- the real `randBattleSeedInt` restored;
- IVs and nature copied from the raw session;
- `enemyModifiers` cleared before each reload;
- the faint prompt answered only when it comes.

It loads the HUD the way `scripts/encounter-oracle/run.ts` does:

- `harness/make-bundle.mjs` bundles every `hud/*.js` except `99-start.js`, in expose mode;
- the test `eval`s the bundle;
- it hands the bundle `speciesDataRegistry` and `timedEventManager`.

At each `CommandPhase`, and inside every faint prompt, it calls `hud["60-card"].readCard(scene, accountRead(scene),
{ road: false })` and `cardSummary(card)`. Both run in the HUD's own sandbox, exactly as the panel's refresh does.

`harness/run.sh` copies the test into the shared clone as `test/tests/zz-g638-<pid>-<random>.test.ts` and removes it on
exit. `harness/multi.py` runs one process per line, six at a time.

### Validation

The winning line with a card read at every decision reproduced `winning-line.sim.txt` exactly, on all 19 turns:

- every HP, stat stage and status;
- every message;
- both send-ins.

So the reads leave the RNG alone. Over all 687 reads in the four runs:

- the RNG state, `battleSeedState`, `rngOffset` and `rngSeedOverride` were identical before and after every read;
- no read breached its sandbox, and none threw;
- a read took about 110–160 ms (median), and 1.6 s at most.

Attempt 1's 23 inputs replay the loss HP for HP against `HANDOFF.md`'s turn log:

- Gigalith 282, Probopass 359, Carracosta 457 / Probopass 270, Coalossal 568 → 419, and so on;
- Barbaracle 129 → 29;
- Tyranitar 534.

The replay-fidelity research (#636) lists four harness traps. Three are covered:

- **31 IVs / neutral nature.** Covered by the per-mon IV and nature patch. Turning off the helper's `normalizeIVs`,
  `normalizeNatures` and `disableShinies` would make the patch unnecessary.
- **Stacked enemy modifiers.** Covered: the array is emptied before each reload. Attempt 1 ran second in one process
  and still matched every HP.
- **T1 entry effects firing twice on reload.** Covered: no foe has Intimidate, and T1 replays exactly.

The fourth trap is **enemy Tera keyed on `initialTeamIndex`**. Every reload here is from the T1 export in party order,
so the index is right. In all 30 runs:

- Coalossal Terastallized on its first move;
- every Burn Up it chose came on that turn and failed.

### Lines played (`runs/s1.json` … `s4.json`)

- **`win`**: the 19-turn winning line, and **`a1`**: attempt 1's 23 inputs.
- **`win>H@Tk` / `a1>H@Tk`**: the line's own inputs up to turn k−1, then the card's action every turn from k on.
  - The card's action is the switch it names, else the slot's move.
  - At faint prompts it sends in the card's pick.
  - Up to 40 turns.
- **`hud@T1`**: the card from the first turn.
- **`swapTk`**: the winning line with only turn k replaced by the card's action. Where a later step becomes illegal, the
  card plays on from there (`+card`).

### Scoring (`harness/score.py`, `claims.py`, `faint-estimates.py`)

Each card read is compared with the turn the engine then played. Lines share prefixes, so each decision point is counted
once, keyed by its input history.

## Where the card was right

| Claim | Right | What it covered |
|---|---|---|
| Gordie's move this turn (the row at `exact` confidence, or the entry hit when the ⚔ line switches) | **213 / 213** | Every move he used, in every line |
| Predicted switch (`enemySwitches`, marked sure) | **27 / 27** | Win line: T4 Carracosta→Coalossal, T7 Coalossal→Carracosta, T9 Carracosta→Stonjourner. Attempt 1: T5, T9, T17 Coalossal→Barbaracle |
| "Stays" (no switch predicted) | **292 / 292** | — |
| Send-in after a KO (`nextIn`) | **29 / 33** | Three of the four misses came after we played a mon other than the one the card planned. Gordie scores his send-in against our mon on the field |
| One-hit KO on the ⚔ line, when the move went off | **89 / 89** | — |
| 💀 tag (ko / after) on our mon, when the named hit landed | **67 / 67** | 48 more were moot: the move missed, or the foe fell or left first |

Notable reads:

- **T2 Explosion.** The card read `Explosion [exact]` the turn before. It is the ≤1% step to the AI's second-best move
  (#632), and the card had it because it asks the game's own `getNextMove` under the real seed
  (`20-enemy-ai.js:306`).
  - Every read came out `exact`, never `replay`. None of our commands drew from the RNG before the enemy chose
    (`25-turn.js:294`).
- **The instant-Tera Burn Up.** At T5 (win) and T6 (a1) the card showed:
  - Coalossal `tera: Rock`, `Burn Up [exact]`;
  - no 💀 tag on Leavanny, although Burn Up from a Fire-type Coalossal would hit Leavanny ×4.

  The engine Terastallized Coalossal, and Burn Up failed both times. This bears on #637's candidate (b): the card does
  not raise a false alarm. It also does nothing with the free turn.
- **Every Gordie swap was on the card the turn before it happened.** So was every one in the card's own lines.

## Where the card was wrong

1. **The verdict.** Where a line starts following the card, the verdict was compared with how that line ended. It
   matched at **9 of 22 points** (`runs/claims.txt`).
   - **"Winnable" from positions that lose:**
     - T1, T2, T4, T5 and T6 of the winning line;
     - attempt 1's T3 and T9.
   - **"Likely lost" from positions where the card's own line wins:**
     - T8 and T9 of the winning line;
     - attempt 1's T5, T7, T13 and T17.
   - **It flips from turn to turn.** Attempt 1's reads go `W W W W L W L W W L W L L W W W L L L L L L L`.
   - At win-line T8 and T9, and attempt-1 T12, the card says "likely lost". Yet its own `prefers` line names **the same
     first action** as the ⚔ line and says it flips to a win (+106, +278, +92).
     - The verdict comes from the plan pinned to the ⚔ line's outcome (`35-team-plan.js:491`, `:584`).
     - The unpinned plan, starting with that same action, wins.
     - So on those turns the verdict is an artefact of the pin.
2. **The ⚔ line contradicts its own fight plan.** Turns where the plan's `prefers` line names a different first move:
   - **Win T10.** The ⚔ line says switch Reshiram → Leavanny and Leaf Storm Stonjourner. The plan prefers "Reshiram
     Dragon Pulse → Stonjourner" (+54), and Dragon Pulse one-shot it in the engine.
   - **Attempt 1 T17.** The ⚔ line keeps Reshiram in (Blue Flare) against the incoming Barbaracle, while the plan
     prefers "Leavanny in (+277, flips)". The card did tag the KO: `💀 after` at T17, `💀 ko` at T18. Reshiram fell at
     T18, as it did in attempt 1.
   - In total, 7 of the 19 win-line reads and 12 of the 23 attempt-1 reads carry a `prefers` line (`runs/*.cards.txt`).
3. **"Free entry" fires on turns our mon survives.** The flag says our mon goes down this turn and the next comes in
   free. Of the 32 times the named hit landed, it was right 9 times. The other 23 times the mon took the hit and lived.
   - Often the card already had the foe's exact move, and that move does not KO. Example: Tyranitar's `Earthquake
     [exact]` into a full-HP Reshiram, with "free entry Reshiram → Snorlax" on the same card.
   - Likely cause: `30-planner.js:1320` sets the flag when we lose the whole exchange (`trade.pTheyKoFirst ≥ 0.5`), not
     only when we fall this turn (`doomedNowOf`).
4. **The foe's move at a faint prompt.** The row for the foe on the field against our send-in is an `estimate` shown
   with `p=100`. It matched the move the foe then used 22 times out of 56 (`runs/faint-estimates.txt`).
   - Typical miss: Tyranitar "Crunch p=100" against an incoming Golbat, Gyarados or Reshiram, when Stone Edge or
     Earthquake came.
   - Coalossal and Carracosta "Iron Defense p=100" when Stone Edge came.
   - The same foe's move at the next `CommandPhase` read was exact and right. Only the faint-prompt read is wrong.
   - Not traced to a cause. The pattern (a status move or Crunch winning) looks like damage against a mon not yet on the
     field reading as zero. That is a guess.
5. **Belly Drum.** The card told Snorlax to Belly Drum in five positions across the rollouts.
   - It paid off once: a +6 Body Slam KO'd Tyranitar in `win>H@T5`, and Snorlax fell to sand the same turn.
   - Twice, Snorlax fell before the boosted Body Slam.
   - Once, the card switched Snorlax out on the very next turn.
   - Once, Snorlax drummed into a swap the card had predicted (Tyranitar → Stonjourner). It was then paralysed, Rested,
     and landed one +6 Body Slam on Stonjourner before falling.

   Attempt 1's handoff had already ruled Belly Drum out with a Monte Carlo.
6. **Unflagged KOs:** four in all. Three were sandstorm chip after a hit left the mon low; one was a crit.

## Turn by turn: the winning line

"Card" is the ⚔ line read at that turn's decision; ✓ marks a read the engine confirmed.

| T | Line played | Card | Card's read of Gordie | Engine |
|---|---|---|---|---|
| 1 | Reshiram Dragon Pulse | **same** (3 hits) | Rock Slide (exact), stays | ✓ |
| 2 | → Probopass | Dragon Pulse again (2 hits) | **Explosion (exact)**, no 💀 | ✓ Explosion. Into Reshiram it does 49% (`swapT2`) |
| 3 | → Leavanny | **same** (takes 12% Brine) | Brine as the entry hit | ✓ |
| 4 | Pollen Puff | → Reshiram, Fickle Beam into Coalossal | **Carracosta → Coalossal (sure)** | ✓ swap |
| 5 | Bug Bite | Pollen Puff, then Leaf Storm | Coalossal Teras Rock, Burn Up (exact), no 💀 | ✓ Tera, Burn Up fails |
| 6 | Leaf Storm | **same** | Stone Edge (exact), 💀 after on Leavanny | Stone Edge missed |
| 7 | **Bug Bite** | → Probopass, Earth Power into Carracosta | **Coalossal → Carracosta (sure)** | ✓ swap; Enigma stolen. Verdict turns "likely lost" |
| 8 | Leaf Storm | **same** (2 hits) | Iron Defense (exact) | ✓ |
| 9 | → Reshiram | **same**, Dragon Pulse one-shots Stonjourner | **Carracosta → Stonjourner (sure)** | ✓ swap |
| 10 | Dragon Pulse | → Leavanny, Leaf Storm (its plan prefers Dragon Pulse) | Earthquake as the entry hit | Dragon Pulse one-shots, Stonjourner never moves |
| 11 | → Leavanny | Reshiram Fickle Beam (2 hits) | Razor Shell (exact) | ✓ |
| 12 | Leaf Storm | **same** (1 hit), next in Tyranitar | Stone Edge (exact) | ✓ one-shot, Tyranitar in |
| 13 | Bug Bite | Pollen Puff, then Bug Bite | Stone Edge (exact), 💀 after | ✓ Leavanny falls. Line sends Golbat, card Reshiram |
| 14 | Golbat Toxic | → Reshiram, Dragon Pulse | Stone Edge as the entry hit | ✓ (missed Golbat) |
| 15 | Venoshock | **same** | Stone Edge (exact), free entry | ✓ Golbat falls. Line sends Gyarados, card Reshiram |
| 16 | **Tera** + Hydro Pump | Hydro Pump, no Tera (2 hits) | Stone Edge (exact) | ✓ |
| 17–19 | Hydro Pump ×3 | **same** (1 hit each) | Stone Edge / Iron Defense / Stone Edge (exact) | ✓ three one-shots |

The card agreed with the line on 11 of 19 turns (`runs/score.txt`).

The verdict ran winnable T1–T6, "likely lost" T7–T9, then winnable T10–T19. T8–T9 are the pin artefact in finding 1.

At T1 the card said:

- Reshiram Dragon Pulse → Gigalith, 3 hits;
- **winnable**, "sacrifice Golbat → Reshiram in free";
- next in Carracosta ← Probopass.

Its first fight plan was close to the line's matchups:

- Leavanny's Leaf Storms for Carracosta and Barbaracle;
- Golbat, then Gyarados, on Tyranitar;
- Gyarados finishing.

It missed:

- Gordie's mid-fight swaps. The plan doesn't model them by design (`35-team-plan.js:1`), though the turn read predicts
  every one;
- Probopass absorbing Explosion;
- the berry thefts;
- Toxic;
- Tera.

## Turn by turn: attempt 1, against the mistakes its handoff listed

`HANDOFF.md` lists the mistakes; the turns below show what today's card said at each one.

- **T3, Earth Power into Carracosta's unknown Enigma.** The card said switch to Leavanny for Leaf Storm (taking 12%
  Brine). It did not suggest Earth Power.
- **T5, Leaf Storm into the predicted switch.** The card marked **Carracosta → Coalossal (sure)** and said switch to
  Reshiram. **Following the card from here wins** (`a1>H@T5`).
- **T7.** The card said → Gyarados rather than the played → Probopass. Following it from here **wins**.
- **T13.** The card said → Reshiram rather than → Snorlax. Following it from here **wins**.
- **T17/T18, Reshiram staying in on the Salac-boosted Barbaracle.**
  - At T17 the card predicted the Coalossal → Barbaracle swap (sure) and tagged `💀 after`.
  - At T18 it tagged `💀 ko Reshiram ← Barbaracle Stone Edge`.
  - Both were right. Its ⚔ line still kept Reshiram in; its plan preferred Leavanny.
  - Following the card from T17 **wins**, because Reshiram's +1 SpA and focus from the stat berries let Fickle Beam
    sweep.
- **T3 and T9.** Following the card from either loses.

The attempt-1 HUD was older (`original/card.json`, coachemon 1.11.1). Its T1 card was taken before the Elixir, X
Defense, Dire Hit and Rare Candy, so the state differs, and it is no measure of today's card. Against today's card on
the T1 export:

- **Same:** the ⚔ line (Dragon Pulse → Gigalith, 3 hits) and the next-in (Carracosta ← Probopass).
- **Opposite verdict:** it said "likely lost · Tyranitar KOs 6/6"; today's says "winnable".

Two of the handoff's gotchas have changed since:

- **"Doesn't model Gordie's switching."** No longer true of the turn read, which caught every swap. Still true of the
  fight plan.
- **"Labels Coalossal Rock TERA before it Terastallizes."** Today the Tera label appears only on the read of the turn
  it Teras.

## Would following the card have won?

`runs/branches.txt` has every line in full.

| Start following the card at | Result | Card's verdict there |
|---|---|---|
| T1 | **loss**: Gordie keeps Tyranitar 569/569, Barbaracle 99, Stonjourner | winnable |
| win T2 / T4 / T5 / T6 | **loss** | winnable |
| win T7 | **loss** | likely lost |
| win T8 / T9 | **win** | likely lost |
| win T10 / T11 / T12 / T13 / T14 / T15 / T16 | **win** | winnable |
| a1 T3 / T9 | **loss** | winnable |
| a1 T5 / T7 / T13 / T17 | **win** | likely lost |

**From T1, the card loses this way:**

- **T2:** it Dragon Pulses into Explosion, and Reshiram is left at 49%.
- **T4:** it meets the predicted Coalossal with Reshiram, then Gyarados. Coalossal Teras on its first move and gets no
  free turn: Burn Up is never picked against them.
- **T5–T8:** Gyarados trades into Stone Edge and Body Press, then falls.
- **Midgame:** Leavanny, then Reshiram fall to Carracosta (a Rock Slide crit) and Barbaracle.
- **Endgame:** Snorlax Belly Drums into the switch-in Tyranitar and falls to Stone Edge. Golbat's Toxic comes too late,
  and Tyranitar never drops below full.

**Single departures from the card, the rest of the winning line kept:**

| Swap | Result |
|---|---|
| T2 Dragon Pulse (eat Explosion with Reshiram, 285/577 left) | **win** (the card finishes from T18) |
| T5 Pollen Puff instead of Bug Bite (the crit still lands, Lum stays) | **win**, same endgame |
| T13 Pollen Puff instead of Bug Bite | **win** (Tyranitar 166 instead of 109 after T16) |
| T16 Hydro Pump without Tera | **win**, but Carracosta's Rock Slide KOs Gyarados on T18, and Reshiram finishes with Fickle Beam (3 left, not 4) |
| T13 send-in Reshiram (the card's pick) instead of Golbat, then the card | **win** |

So none of the line's departures at T2, T5, T13 and T16 decides the fight on its own. **T7 does.** Card from T7 on
loses, the line's T7 then the card from T8 wins. Staying in with Leavanny and Bug Biting the incoming Carracosta:

- steals its Enigma, which heals Leavanny a quarter of its HP (320 → 413 after sand);
- keeps Leavanny on the field for the T8 Leaf Storm that leaves Carracosta at 26%.

The card's T7 instead switches to Probopass and Earth Powers into Carracosta. Rock Slide and Razor Shell then wear the
team down in a different order.

## What only a rollout found

- **Which decision matters.** The card's T7 call looks reasonable on one turn: Probopass resists Rock and hits
  Carracosta super-effectively. Only playing the line out shows it loses and Bug Bite wins.
- **Whether a position is winnable.** The verdict was right at 9 of 22 points. The card's own line had to be played
  forward to say which openings lose. Only late positions (win T10 on) got a reliable "winnable".
- **The seed's luck.** The winning line runs on:
  - the T5 crit;
  - the Stone Edge misses on T6 and T14;
  - the T7 Enigma steal.

  The card's lines draw different luck: a Rock Slide crit on Leavanny, Fickle Beam doubling. A turn-local reader cannot
  know which inputs buy which luck.
- **Plays the card can't name:**
  - **Berry theft.** The planner models item theft only as a foe's Grip Claw or Mini Black Hole (`30-planner.js:346`).
  - **Our Tera.** `25-turn.js` predicts only the enemy's.
  - **Toxic** on the win condition. It appears only as "Toxic, then Venoshock" with Golbat as the last mon.
  - **Staying in on a predicted swap** to use the incoming foe's free turn. The card reads the swap and the failing
    Burn Up correctly, but its ⚔ line switches away (T4) or chips (T5).

## The bridge as "the oracle as the fight plan's grader"

It works as built, and most of it is reusable:

- **Grading a known line.** Feed it a T1 session export and a validated line. It scores every one-turn claim (move,
  switch, send-in, KO counts, 💀 tags) at each decision, and the card's reads stay RNG-neutral.
- **Grading the plan and the verdict.** For each decision, roll the card's own line forward (`@Tk`) and compare it with
  the verdict. One process per line, about 35–45 s wall each. Six ran in parallel without trouble: 17 lines in about
  2 minutes.

Traps found while building it:

- **A second reload in the same process after a lost line throws** (`TypeError … getStartingBiome`). So: one process
  per line.
- **Messages break between "used" and the move** (`"Foe Gigalith used\nRock Slide!"`).
- **The foe's replacement after a KO is announced after the turn's messages are taken.** Read it from the next
  snapshot.
- **`scripts/encounter-oracle/oracle.test.ts.template:95` still calls `hud["98-tick"].accountRead`.**
  - `98-tick.js` was removed in #551 (`2f42cb2`); `accountRead` now lives in `98-watch.js`.
  - As it stands, every encounter-oracle case would throw at `readCard`. The run would then report "the card
    contradicts the game", accusing the card of the oracle's own fault.
  - The bridge here uses `98-watch`.

## Files

| File | What it is |
|---|---|
| `harness/hud-vs-engine.test.ts` | The harness test: #632's sim plus the card read at every decision, and the `hud` step |
| `harness/make-bundle.mjs` | The HUD bundle as the encounter oracle builds it |
| `harness/run.sh`, `harness/multi.py` | Runners: a unique test name in the shared clone, one process per line |
| `harness/lines.py` | Script builder. Takes #632's `br.py` tokens, plus `H` (the card's action) and `!hud` (the card's send-in) |
| `harness/show.py`, `score.py`, `claims.py`, `faint-estimates.py`, `branches.py`, `report.sh` | The views and tallies in `runs/` |
| `runs/s1.json` … `s4.json` | The lines played |
| `runs/win.cards.txt`, `a1.cards.txt`, `hud-from-T1.cards.txt` | Each turn's card next to what the engine did |
| `runs/score.txt`, `claims.txt`, `faint-estimates.txt`, `branches.txt` | The tallies quoted above |

To rerun:

```sh
ln -s <main>/.cache .cache
G638_SESSION=<kit>/sim/session-w180.json python3 -I harness/multi.py runs/s2.json /tmp/o2.json 6
```

`<kit>` is `docs/research/gordie-w180/kit` on `research/gordie-w180`. `run.sh` does the same for one scripts file in one
process.
