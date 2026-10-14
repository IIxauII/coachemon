# Boss-fight plan

The record of one boss fight, kept as a file so that it outlives the session. The HUD card is the live view of the
fight; the plan holds what spans turns. Without an oracle line — every plan, until solving exists — it is the card's
own **fight plan** written out across turns.

`<home>` is `$COACHEMON_HOME`, else `~/.coachemon`. The battle read's `planFile` is the plan's path under it:
`plans/<seed>-w<wave>-<trainer>.md`.

## Steps

1. **Find.** On every read of a boss fight, list `<home>/plans/<seed>-w<wave>-*.md`, with the seed and the wave from
   the read. The seed and the wave are the fight; the trainer part of the name is only there to be read, and a
   language switch can change it. Done when you know which case you are in:
   - **Found, and the battle is at its first turn while the file has already ticked a check:** a retry through
     Continue — the same seed, the same wave, the same fight. Start the next attempt in the same file: carry what
     broke into *Off the plan*, clear the ticks, and count the attempt up in the status line. Then step 3.
   - **Found, any other status:** a new session, a restart or a late join. Read the file's status line and the
     battle, and resume at step 3.
   - **Not found:** step 2.
2. **Write** at the fight's first command, once the card shows its ⚔ call. At the intro the card can't ask the
   engine and reads the fight off the type chart alone, so a plan written there argues with the card that follows.
   Build every section below from the `plan` group in the read's `card` text, write the file (`mkdir -p` its
   folder), and give the user its path in one line. Done when the file holds the status line and all seven sections.
3. **Tick** on every read after. Mark each phase whose check has come due ✓ with what the battle showed, or ✗ with
   what came instead; the phase in play is ▸. A ✗ adds its break, and the play it leaves, to *Off the plan*. When the
   card's verdict changes (a `LIKELY LOST` line), rewrite the call to the card's new verdict and name the turn.
   Rewrite the status line each time. Done when the status line names the last check the battle has reached.

The status line is the file's second line, and what the next session resumes from: `on the plan · checked through
<phase> · attempt <n>`, `off the plan at <phase>: <what broke> · attempt <n>`, `won · attempt <n>` or `lost at
<phase> · attempt <n>`.

## One call

The plan's call is the card's call. Now, the card's `plan` group and this file say one thing, because the file is the
card's fight plan re-cut into phases: its call is the card's verdict, its phases follow the card's step order, the
mons it keeps back (⤵) and its sacrifices, and its first phase opens with what the card calls now.

A call you know is wrong — Moonblast into an Enigma Berry, a hit from a mon that never gets to act — is a **card gap**:
tell the user it is a gap in the card, and keep the plan on the card's call. The mechanic behind it belongs under
*Principles*, where the player weighs it for themselves.

An oracle line is the one thing that takes the call from the card, and the card then draws the line's step in place
of its own ⚔, so there is still one call. Solving isn't built yet.

## Sections

In this order. Marks as on the card: no mark is exact, `~` replay, `≈` estimate, `!` a claim already proved wrong.

1. **The call** — `≈`, conditional. The card's verdict word, `winnable` or `likely lost`, with the one condition it
   rests on: a check the player can read off the battle. `≈ winnable if Dragonite meets Rayquaza at full HP`,
   `≈ likely lost unless Raichu breaks a bar before Outrage`. A lean, not a promise: on Gordie W180 the fight plan's
   read of whether a position was winnable matched how the card's own play then went at only 9 of 22 points.
2. **Why trust it** — what the call rests on, one line each, each with its own mark:
   - both teams, held items, abilities and stats, from the battle read at the first command (exact);
   - each foe's move and the trainer's swaps, from the turn read, on the turn it reads them (exact, `~` where our
     own command draws first);
   - every one-on-one further ahead, worked from the damage formula (`≈`).
3. **The phases** — `≈`. First the win condition and its answers: the foe the card's 💀 names, who answers it, and who
   is kept back for it. Then the fight in the phases it falls into, one per foe that matters in the trainer's send-in
   order. Each phase is what to do and the **check** that ends it, something the player can read off the battle: HP,
   bars left, a berry spent, who is standing.
4. **Where the card disagrees** — without the oracle, nowhere. The section is the one line `Nowhere: this plan is the
   card's own.`
5. **Inputs to get right** — no claim. The presses a mistake costs here: faint replacements (who, and who never),
   waiting for the first command before reading the card, a Tera.
6. **Off the plan** — no claim. The likely breaks, each with what the player does next, then `Anything else: the
   card's turn line leads.` The plan carries on from where the game stands; a reload is never the answer.
7. **Principles** — the mechanics that decide this fight, exact (a boss bar stops a hit at its edge; an Enigma Berry
   heals 25% on a super-effective hit; Extreme Speed hits first whatever the Speed), and hand-worked damage `≈`. They
   are what the player plays by once off the plan.

## Shape

```markdown
# Plan: Rival Ivy · W145 · singles
on the plan · checked through Kingdra · attempt 1
Marks as on the card: none exact, `≈` estimate, `!` proved wrong. Inputs and Off the plan claim nothing.

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
- Anything else: the card's turn line leads.

## Principles
- A boss bar stops a hit at its edge unless the hit is big enough to break more than one.
- An Enigma Berry heals 25% on a super-effective hit.
```
