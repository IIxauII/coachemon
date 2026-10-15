# Boss-fight plan

The record of one boss fight, kept as a file so that it outlives the session. The HUD card is the live view of the
fight; the plan holds what spans turns. Without an oracle line it is the card's own **fight plan** written out across
turns.

The plan lives at `<home>/<planFile>`. `<home>` is `$COACHEMON_HOME` when it is set, else `~/.coachemon`; `planFile`
is the battle read's `plans/<seed>-w<wave>-<trainer>.md`. Everything up to `-w<wave>-` is the fight, and the trainer
part follows the game's language.

## Steps

1. **Find.** On every read of a boss fight, list `<home>/<planFile>` with its trainer part as `*`
   (`plans/U0QKEz8wXq3LmN7pR2sT9vYb-w145-*.md`). Done when you know which case you are in:
   - **Found, and the battle is at its first turn while the file has already ticked a check:** a retry through
     Continue — the same seed, the same wave, the same fight. Start the next attempt in the same file: carry what
     broke into *Off the plan*, clear the ticks, and count the attempt up in the status line. Then step 3.
   - **Found, any other case:** the plan this fight already has — from this session, an earlier one, or before a
     restart or a late join. Read its status line and the battle, and resume at step 3.
   - **Not found:** step 2.

   The first time this session finds or writes the plan, give the user its path in one line.
2. **Write** at the first command you see in the fight — its first, or the turn you joined on — once the card shows
   its ⚔ call. At the intro the card can't ask the engine and reads the fight off the type chart alone, so a plan
   written there argues with the card that follows. Build every section below from the `plan` group in the read's
   `card` text; `card` is `null` while the HUD is off, so start it (`read.sh <browser> hud`) and read again. Write the
   file, making its folder if need be. Done when the file holds its three opening lines and all seven sections.
3. **Tick** on every read after. Mark each phase whose check has come due ✓ with what the battle showed, or ✗ with
   what came instead; the phase in play is ▸. A ✗ adds its break, and the play it leaves, to *Off the plan*. From the
   first command on, keep the file the card's, which works its fight plan out again every turn: when the call's word
   is not the one the `plan` group opens with (`winnable` or `likely lost`), rewrite the call and name the turn; when
   the card's step order, the mons it keeps back or its sacrifices have moved, rewrite the phases not yet ticked. A
   `LIKELY LOST` line is no stand-in: a resume or a retry never sees it. With `card` null, start the HUD as in step 2.
   Rewrite the status line each time. Done when the call and the phases ahead are the card's, and the status line
   names the last check the battle has reached.

The file opens with three lines:
- the title, `# Plan: <trainer> · W<wave> · singles` (or `doubles`);
- the status line, which is what the next session resumes from: `on the plan · checked through <phase> · attempt
  <n>`, `off the plan at <phase>: <what broke> · attempt <n>`, `won · attempt <n>` or `lost at <phase> · attempt <n>`;
- the marks line, `Marks as on the card: none exact, ~ replay, ≈ estimate, ! proved wrong. Inputs and Off the plan
  claim nothing.`

## One call

The plan's call is the card's call. Now, the card's `plan` group and this file say one thing, because the file is the
card's fight plan re-cut into phases: its call is the card's verdict, its phases follow the card's step order, the
mons it keeps back (⤵) and its sacrifices, and its first phase opens with what the card calls now.

A call you know is wrong — Moonblast into an Enigma Berry, a hit from a mon that never gets to act — is a gap in the
card: tell the user so, and keep the plan on the card's call. The mechanic behind it belongs under *Principles*, where
the player weighs it for themselves.

An oracle line is the one thing that takes the call from the card, and the card then draws the line's step in place
of its own ⚔, so there is still one call.

## Sections

In this order. Marks as on the card: no mark is exact, `~` replay, `≈` estimate, `!` a claim already proved wrong.

1. **The call** — `≈`, conditional. The card's verdict word, `winnable` or `likely lost`, with the one condition it
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

## Shape

```markdown
# Plan: Ivy · W145 · singles
on the plan · checked through Kingdra · attempt 1
Marks as on the card: none exact, ~ replay, ≈ estimate, ! proved wrong. Inputs and Off the plan claim nothing.

## The call ≈
**Winnable if Dragonite meets Rayquaza at full HP.** The card's verdict: a lean, not a promise.

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
