# Boss-fight plan

The record of one boss fight, kept as a file so that it outlives the session. The HUD card is the live view of the
fight; the plan holds what spans turns. Without an oracle line it is the card's own **fight plan** written out across
turns. With one, the **oracle line** is its plan: its inputs turn by turn, a checkpoint to check after each, and
what happens once the game leaves it.

The plan lives at `<home>/<planFile>`. `<home>` is `$COACHEMON_HOME` when it is set, else `~/.coachemon`; `planFile`
is the battle read's `plans/<seed>-w<wave>-<trainer>.md`. Everything up to `-w<wave>-` is the fight, and the trainer
part follows the game's language.

## Steps

1. **Find.** On every read of a boss fight, list `<home>/<planFile>` with its trainer part as `*`
   (`plans/U0QKEz8wXq3LmN7pR2sT9vYb-w145-*.md`). Done when you know which case you are in:
   - **Found, and the battle is at its first turn while the file has already ticked a check:** a retry through
     Continue — the same seed, the same wave, the same fight. Start the next attempt in the same file: carry what
     broke into *Off the plan*, clear the ticks, and count the attempt up in the status line. An oracle line the
     file holds is void for the rest of the run: it goes into *Off the plan* as at a miss (step 4), and the plan follows
     the card until a new oracle line is held. Then step 4.
   - **Found, any other case:** the plan this fight already has — from this session, an earlier one, or before a
     restart or a late join. Read its status line and the battle, and resume at step 4.
   - **Not found:** step 2.

   The first time this session finds or writes the plan, give the user its path in one line.
2. **Write** at the first command you see in the fight — its first, or the turn you joined on — once the card shows
   its ⚔ call. At the intro the card can't ask the engine and reads the fight off the type chart alone, so a plan
   written there argues with the card that follows. Build every section below from the `plan` group in the read's
   `card` text; `card` is `null` while the HUD is off, so start it (`read.sh <browser> hud`) and read again. Write the
   file, making its folder if need be. With solving on, the plan still starts without the oracle: a solve takes
   minutes, and the card leads meanwhile. Done when the file holds its three opening lines and all seven sections.
3. **Take the oracle line** once `hand_oracle_line` gives `held: true` for this fight (`references/solving.md`, step
   4). Rewrite the file in its form with an oracle line, below, from that solve's `read_job` with `detail: "full"`:
   `result.oracleLine` holds the steps, each with its input and checkpoint, the validation `receipt` and the `luck`.
   Keep the attempt, and keep every principle that still holds. A `read_job` is gone once the plugin restarts, so this is the only record of
   the oracle line that outlives the session: write it before anything else. A plan found with the card's `plan`
   group leading with an oracle line (`~ oracle line wins in …`, or `!`) that the file doesn't hold was held by a
   session that ended first: write the oracle line from the `plan` group's rows, and give each step whose After the
   card doesn't show yet `After: on the card at its turn`. The card carries no receipt and no luck, so in *Why trust
   it* the one line `Receipt and luck: lost with the session that held the oracle line.` stands in place of the
   receipt and the luck, and the rest of the section is written as usual. Done when *The oracle line* holds
   every step and the status line reads `on the line`.
4. **Tick** on every read after. Done when the file matches the card: the call and what leads next are the card's,
   and the status line names the last check the battle has reached. With `card` null, start the HUD as in step 2.
   Rewrite the status line each time.
   - **Without an oracle line:** mark each phase whose check has come due ✓ with what the battle showed, or ✗ with
     what came instead; the phase in play is ▸. A ✗ adds its break, and the play it leaves, to *Off the plan*. From
     the first command on, keep the file the card's, since the card works its fight plan out again every turn: when
     the call's word is not the one the `plan` group opens with (`winnable` or `likely lost`), rewrite the call and
     name the turn; when the card's step order, the mons it keeps back or its sacrifices have moved, rewrite the
     phases not yet ticked, and the call's condition with them. A `LIKELY LOST` line can't replace this check: a
     resume or a retry never sees it.
   - **On the line:** mark each step as the card's `plan` group marks it: ✓ a step whose checkpoint matched, ▸ the
     step in play, · a step still to come. The HUD scores each checkpoint at the next decision by itself, so a ✓
     there is a match and needs no check of yours. At the first ✓, tick the receipt's `known_turn` line too, if it
     was waiting on live. A won fight's last step is scored once the battle has ended, where the card has no `plan`
     group: tick it from the journal's checkpoint entry for its turn (`matched`), and the status line reads `won ·
     attempt <n>`.
   - **The miss.** A `read_card` whose `oracle_line` reads `{ state: "off", turn }`, the watch's `OFF LINE
     w<wave> · T<turn>/<of>`, or a strip that reads `off the line` means that turn's checkpoint missed. Mark its step
     ✗ and write under it each of Now's ✗ rows as it reads, `Tyranitar expected 512/569 · came 455/569`; once the card
     has moved past them, the journal's checkpoint entry for that turn carries the same `misses`. Then say whose miss
     it was, from that journal entry's `wrong`. The strip's mark can't tell you: once any oracle line has been wrong
     this run, every one after it reads `!` there, the player's own misses included.
     - `wrong: false`: an input other than the oracle line's was played. The player left the line; the oracle line's
       claim stands.
     - `wrong: true`: the oracle line's own inputs were played and the game drew otherwise. The oracle line was
       wrong: mark the call and every checkpoint `!`.

     A miss once the fight is over ends the plan there: its step ✗, its miss and whose it was, all from the journal
     entry, since the card has no `plan` group by then. On a fight already won, the status line reads `won · attempt
     <n>`. A fight lost while on the line is scored as a miss too, `expected won · came lost`, and the status line
     reads `lost at T<turn> · attempt <n>`.

     Otherwise the oracle line is void for the rest of the run, and the card leads again. Move it into *Off the
     plan* as ticked, under `The oracle line from T<first turn>, off at T<turn>`, with its miss and whose it was.
     Rewrite the call, *Why trust it* and the phases in their form without the oracle, from the card, as at step 2,
     and put *Where the card disagrees* back; the status line reads `off the line at T<turn>: <the first ✗ row> ·
     attempt <n>`. A re-solve's oracle line, once held, is step 3 again, and the void one stays where
     it is. A re-solve that answered no answer adds its cause to *Off the plan* in one line.

The file opens with three lines:
- the title, `# Plan: <trainer> · W<wave> · singles` (or `doubles`);
- the status line, which is what the next session resumes from: `on the plan · checked through <phase> · attempt
  <n>`, `off the plan at <phase>: <what broke> · attempt <n>`, `won · attempt <n>` or `lost at <phase> · attempt <n>`.
  While an oracle line leads, `line` for `plan` and the step's turn for `<phase>`: `on the line · checked through T6 ·
  attempt 1`;
- the marks line, `Marks as on the card: none exact, ~ replay, ≈ estimate, ! proved wrong. Inputs and Off the plan
  claim nothing.`

## One call

The plan's call is the card's call. Now, the card's `plan` group and this file say one thing, because the file is the
card's fight plan re-cut into phases: its call is the fight plan's verdict, its phases follow the card's step order, the
mons it keeps back (⤵) and its sacrifices, and its first phase opens with what the card calls now.

A call you know is wrong — Moonblast into an Enigma Berry, a hit from a mon that never gets to act — is a gap in the
card: tell the user so, and keep the plan on the card's call. The mechanic behind it belongs under *Principles*, where
the player weighs it for themselves.

An oracle line is the one thing that takes the call from the card, and the card then draws the oracle line's step in
place of its own ⚔, so there is still one call: the plan's is the oracle line's, as the card's `plan` group words
it. Off the line, the call is the card's again.

## Sections

In this order. Marks as on the card: no mark is exact, `~` replay, `≈` estimate, `!` a claim already proved wrong.

### Without an oracle line

1. **The call** — `≈`, conditional. The fight plan's verdict, `winnable` or `likely lost`, with the one condition it
   rests on: a check the player can read off the battle. `≈ winnable if Dragonite meets Rayquaza at full HP`,
   `≈ likely lost unless Raichu breaks a bar before Outrage`. A lean, not a promise.
2. **Why trust it** — what the call rests on, one line each, each with its own mark:
   - both teams, held items, abilities and stats, from the battle read at the first command (exact);
   - each foe's move and the trainer's swaps, from the turn read, on the turn it reads them (exact, `~` where our
     own command draws first);
   - every one-on-one further ahead, worked from the damage formula (`≈`).
3. **The phases** — `≈`. First the win condition and its answers: the foe the card's 💀 names, who answers it, and who
   is kept back for it. Then the fight in the phases it falls into, one per foe that matters in the trainer's send-in
   order. Each phase is what to do and the **check** that ends it, something the player can read off the battle: HP,
   bars left, a berry spent, who is standing.
4. **Where the card disagrees** — without an oracle line, nowhere. The section is the one line `Nowhere: this plan is
   the card's own.`
5. **Inputs to get right** — no claim. The presses a mistake costs here: faint replacements (who, and who never),
   waiting for the first command before reading the card, a Tera.
6. **Off the plan** — no claim. The likely breaks, each with what the player does next, then `Anything else: the
   card's turn line leads, from where the game stands. No reload.`
7. **Principles** — the mechanics that decide this fight, exact (a boss bar stops a hit at its edge; an Enigma Berry
   heals 25% on a super-effective hit; Extreme Speed hits first whatever the Speed), and hand-worked damage `≈`. They
   are what the player plays by once off the plan.

### With an oracle line

There is no *Where the card disagrees*, section 4, so the numbers below skip it: while the oracle line leads it is the
plan, and the card's own call is neither shown nor weighed against it. The section comes back, as without the oracle,
once the game leaves the line. Every part comes from `result.oracleLine`; name a mon and a move as the game does
(`LEAVANNY` is Leavanny, `BUG_BITE` is Bug Bite). Its replay claims are `~`, or `!` once an oracle line has been wrong
in this run, as the card marks them: a re-solve's oracle line after a `!` miss carries `!` too.

1. **The call** — `~`. What the oracle line promises, in the card's `plan` group's numbers: `This oracle line wins
   in 9 turns with 4 of 6 left.` The turns count from the oracle line's first step; the mons left are the last
   checkpoint's with HP. Name who is standing at the end, and that it holds while every checkpoint matches.
2. **Why trust it** — exact: a record of the checks run, not a claim about the fight.
   - **The validation receipt**, one line per entry, in its order, with what it `checked` as it reads. An entry
     marked `pending` (`known_turn` on a first attempt) waits on the first live checkpoint: write `(waits on the
     first checkpoint)` after it until step 4 ticks it ✓.
   - **What it rests on**: the decision it was solved from, `T<first turn> of W<wave>`, from the wave-start save on
     the fight's first turn, else from the augmented export at that decision; and every input exactly as written. A
     different move, Tera, switch, faint replacement or learn pick changes that turn's draws and every turn after it.
   - **The luck it rides**: each `luck` entry with its turn, as it reads (`T14 the foe's Tyranitar's Stone Edge
     misses (20%)`). An empty `luck` is `Rides no luck: no draw it read went its way with less than a sure chance.`
   - **This turn's enemy move and swaps**: the card's turn read, on the turn it reads them (exact). The oracle line
     doesn't name the foe's moves.
3. **The oracle line** — `~` on each checkpoint. One row per step, in a table: the mark (✓, ▸, ✗ or ·, as step 4
   ticks it), the turn, the input, what happens, and the **After** to check by hand.
   - **Input**, as the card words it: `Leavanny Bug Bite`, `⇄ Probopass`, `Gyarados Tera Water + Hydro Pump`, then
     `· send Golbat` for a faint replacement and `· Bulbasaur skips Leech Seed` or `· Bulbasaur learns Leech Seed over
     Sunny Day` for each learn pick. The last step's learn picks are placeholders the search never weighed: leave them
     off. A step with no input (a two-turn move's second turn) is `no input`.
   - **What happens**: what the checkpoint changed from the one before — HP, a faint and who comes in, status, stat
     stages, a Tera, a boss bar — and the turn's luck.
   - **After**: the checkpoint's mons in front, ours then the foes', with HP (`Golbat 493/493 · Tyranitar
     512/569`), then any status, stage, Tera or bar the step changed. It is what the HUD checks at the next decision.
5. **Inputs to get right** — no claim. The presses on the oracle line a mistake costs, each with its turn: every faint
   replacement (`T13, at the faint prompt: Golbat`), every learn pick before the last step, a Tera (`T16: ← from Fight
   to the Tera button, then Hydro Pump`). And: wait at the decision the oracle line was solved from until the card
   leads with it, since it holds only from there.
6. **Off the plan** — no claim. What a miss brings, before it comes:
   - the strip turns to `off the line · ~ re-solving…`, and Now shows what the oracle line expected against what
     came;
   - the oracle line is void for the rest of the run, and the card's turn line and fight plan lead again, from where
     the game stands;
   - the coach solves again from there in the background, and a new oracle line leads once it is held; with no win
     found, no answer, and the card and the principles below carry the fight. No reload;
   - a miss on the oracle line's own inputs marks its claim `!` for the run: the game drew otherwise. Another input is
     leaving the line, not the oracle being wrong.

   After a miss, the void oracle line and its miss, as step 4 writes them.
7. **Principles** — the mechanics the oracle line turns on, exact (Bug Bite eats the target's berry and heals with
   it; Tera Water halves a Rock hit), and odds `≈`. They are what the player plays by once off the line.

## Shape

Without an oracle line:

```markdown
# Plan: Ivy · W145 · singles
on the plan · checked through Kingdra · attempt 1
Marks as on the card: none exact, ~ replay, ≈ estimate, ! proved wrong. Inputs and Off the plan claim nothing.

## The call ≈
**Winnable if Dragonite meets Rayquaza at full HP.** The fight plan's verdict: a lean, not a promise.

## Why trust it
- Both teams, items, abilities and stats: the battle read at T1.
- Each foe's move and Ivy's swaps: the card's turn read, on the turn it reads them.
- Every one-on-one further ahead: worked from the damage formula. ≈

## The phases ≈
**Win condition:** 💀 Rayquaza, a boss with 3 bars, holding Sitrus, Enigma and Lum. Answers: Dragonite at full HP,
Raichu. ⤵ Dragonite is kept for it.
1. ✓ Torterra lead — ⇄ Dragonite into the Earthquake. Check: Dragonite in at 420/420. *Got 420/420.*
2. ▸ Kingdra — ⇄ Raichu on Ivy's swap. Check: Kingdra down, Dragonite 420/420 on the bench.
3. Rayquaza — …

## Where the card disagrees
Nowhere: this plan is the card's own.

## Inputs to get right
- Faint replacements while Rayquaza is up: Dragonite or Raichu, never Breloom.

## Off the plan
- Multiscale broke before Rayquaza: Dragonite's jobs become Torterra and the priority finish.
- Anything else: the card's turn line leads, from where the game stands. No reload.

## Principles
- A boss bar stops a hit at its edge unless the hit is big enough to break more than one.
- An Enigma Berry heals 25% on a super-effective hit.
```

With an oracle line, solved at T11 for a coach that joined late:

```markdown
# Plan: Gordie · W180 · singles
on the line · checked through T13 · attempt 1
Marks as on the card: none exact, ~ replay, ≈ estimate, ! proved wrong. Inputs and Off the plan claim nothing.

## The call ~
**This oracle line wins in 9 turns with 4 of 6 left**: Gyarados and three on the bench standing at the end, while
every checkpoint matches.

## Why trust it
The validation receipt:
- ✓ versions: the save, the clone and the pin are all game version 1.12.0.11
- ✓ load_hygiene: real battle draws after the build and the reload; … no prompt left queued in 9 turns
- ✓ augmented_export: the session export loaded wave 180 with battle seed J8ea7832, the live battle's own, and the
  live read put back turn 11 and what else a reload resets
- ✓ scene_matches: the loaded scene's export at the first decision is the live tab's export at the decision, …
- ✓ known_turn: every fact live recorded over 10 turns reproduced, and the replay left the fight on, as live did

Rests on T11 of W180 from the augmented export, and every input as written: a different move, Tera, switch, faint
replacement or learn pick changes that turn's draws and every turn after it.
Rides: T14 the foe's Tyranitar's Stone Edge misses (20%).
Gordie's move and swaps this turn: the card's turn read, on the turn it reads them.

## The oracle line ~
| | T | Input | What happens | After (check this) |
|---|---|---|---|---|
| ✓ | 11 | ⇄ Leavanny | Leavanny 497 → 280 | Leavanny 280/497 · Barbaracle 480/480 |
| ✓ | 12 | Leavanny Leaf Storm | Barbaracle faints, Tyranitar in · Leavanny 280 → 249 | Leavanny 249/497 · Tyranitar 569/569 |
| ✓ | 13 | Leavanny Bug Bite · send Golbat | Leavanny faints, Golbat in · Tyranitar 569 → 512 | Golbat 493/493 · Tyranitar 512/569 |
| ▸ | 14 | Golbat Toxic | Golbat 493 → 463 · Tyranitar 512 → 477 · rides the miss | Golbat 463/493 · Tyranitar 477/569 |
| · | 15 | Golbat Venoshock · send Gyarados | Golbat faints, Gyarados in · Tyranitar 477 → 339 | Gyarados 570/570 · Tyranitar 339/569 |
| · | 16 | Gyarados Tera Water + Hydro Pump | Gyarados Teras · Gyarados 570 → 351 · Tyranitar 339 → 109 | Gyarados 351/570 Tera · Tyranitar 109/569 |
| · | 17 | Gyarados Hydro Pump | Tyranitar faints, Carracosta in · Gyarados 351 → 316 | Gyarados 316/570 · Carracosta 121/467 |
| · | 18 | Gyarados Hydro Pump | Carracosta faints, Coalossal in · Gyarados 316 → 423 | Gyarados 423/570 · Coalossal 238/711 |
| · | 19 | Gyarados Hydro Pump | Coalossal faints: won | Gyarados 423/570 · Coalossal 0/711 |

## Inputs to get right
- Wait at T11's decision until the card leads with the oracle line: it holds only from there.
- T13 and T15, at the faint prompt: Golbat, then Gyarados.
- T16: ← from Fight to the Tera button, then Hydro Pump.

## Off the plan
- A checkpoint misses: the strip turns to `off the line · ~ re-solving…`, and Now shows what the oracle line
  expected against what came.
- The oracle line is void for the rest of the run; the card's turn line and fight plan lead from where the game stands.
- The coach solves again from there; a new oracle line leads once it is held. No win found: no answer, and the card
  and the principles carry the fight. No reload.
- A miss on the oracle line's own inputs marks its claim `!` for the run. Another input is leaving the line.

## Principles
- Toxic on Tyranitar does its damage whatever its Defense; Venoshock doubles into a poisoned foe.
- Tera Water halves Stone Edge into Gyarados. ≈
```
