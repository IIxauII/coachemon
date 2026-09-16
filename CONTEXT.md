# Context

Vocabulary for pokerogue-mcp. Glossary only — no implementation detail.

## Run

One playthrough of PokéRogue, from wave 1 until the party wipes. A **wipe** ends the run; the next run starts again at wave 1 with nothing carried over except account-level unlocks. A run is the unit the agent plays.

## Wave

One encounter within a run — a battle, or a between-battle screen such as a shop or reward choice. Waves are numbered from 1 and never repeat within a run.

## Run calendar

What a run's wave numbers alone decide, before any roll: which waves are the final boss, a fixed battle, a gym leader or a boss, where the party heals, and the odds of a trainer on each wave. The game mode and challenges shape it; a roll never does. Not to be confused with a **preview**, which reads what the run seed has already rolled.

## Party

The pokémon the player controls in the current run. The **active pokémon** is the one currently on the field; the rest are on the bench. Distinct from account-level collection data.

## Party profile

The **party** judged as a whole rather than member by member: the types it hits super-effectively, the types it can't, the types several members are weak to, and its weakest member. Any would-be newcomer (a wild pokémon, a species in a biome, a trade offer) is judged against the profile, so every card gives the same reasons for the same pokémon.

## Settled

The state of the game when it is waiting for player input: no animation playing, no phase resolving, no message auto-advancing. Reading state or sending a press while **unsettled** races the game's own queue. Every tool call returns a settled game.

## Snapshot

The structured, text-only view of the game at a settled moment. **Lean** by default (wave, biome, money, active pokémon, enemy, current menu); detail is pulled on demand. A snapshot is read from the live game, never computed or simulated.

## Menu

Whatever the game is currently asking the player to choose between. Presented by a **screen**, and served by a **handler** — the game object that owns the menu's options and cursor. A menu is **known** when the server can read its labels and move its cursor, and **unknown** otherwise; unknown menus degrade to raw presses rather than blocking.

## Menu family

A set of menus the server reads, moves through and commits the same way: a list, a two-by-two grid, the party's slot cycle, a shop, a modal's buttons. A known menu belongs to exactly one family; an unknown menu belongs to none. A family is about how a menu is operated, not what it means: one family serves many **screens** (every yes/no confirm and the title share one).

## Button

One of the game's own input actions (UP, DOWN, LEFT, RIGHT, ACTION, CANCEL, MENU, …), identified by an int from the game's `Button` enum. A **press** delivers exactly one button to the game.

## Escape ladder

For a given menu, the ordered **rungs** that leave it, safest first. Each rung is a press, a pick among options not yet tried, a wait, or, last of all, a page **reload**. Each carries a risk: **safe** (nothing lost), **lossy** (gives up an in-run choice such as a reward, a move or an evolution) or **destructive** (loses something lasting: a team member, a save slot, saved preferences, or progress since the last save). A **must-answer** menu is one the game won't release until an option is chosen, so backing out is the wrong move. A **no-escape** menu can't be left by any input at all. The ladder is only offered for the game version it was reviewed against.

## Option

A single selectable entry in a menu, with a visible **label**. Selecting an option by label is a decision; the cursor movement it takes is an implementation detail the server hides. Where the label decorates a plain name with live data (`Great Ball ×9`), the option also carries that **name**, and the name selects it too.

## Progress fingerprint

A short, deliberately coarse summary of what the game is showing, read at each settled moment. Two moments with the same fingerprint are treated as the same place. It answers "have we been here before", which is a different question from **settled**'s "has the game stopped moving" — so the two are kept apart even where they read the same things.

## Stuck

The game is **settled**, presses are being delivered, and the **progress fingerprint** keeps returning to where it has already been. The run is alive; the agent is lost. Three shapes, named separately because their escapes differ: a **dead end**, where no press moves the fingerprint at all; a **loop**, where presses do move it but only around a cycle; and a **hang**, where the game is waiting on something that will never arrive and no input exists that reaches it.

Stuck is reported, never escaped unilaterally.

## Screen

What the game is actually asking, as a whole. A screen is *not* the same as a **UiMode**: one UiMode can serve several screens that differ in what they mean and in how they can be left, so a screen is identified by the UiMode together with whatever discriminates it. The **menu** is the choice a screen presents; the screen is the thing Claude is looking at.

## Card

The **coach**'s advice for the decision the player faces right now: a battle, a move to learn, a reward choice, a biome choice or a mystery encounter. There is one card per decision, so a card is coarser than a **screen**: a single battle card stays up while the player moves between the command, fight and target screens. What a card is showing is also available as plain text, for whoever follows the game without seeing it.

## Verdict

A battle card's one-word call on the wave: **easy**, **trainer**, **danger**, **catch** or **fight**. It lets whoever watches alongside the coach stay quiet on an easy wave and speak up on a dangerous one. A verdict sums the card up; it never adds advice the card doesn't show.

## Driver

The one process allowed to press buttons in a given game tab. The server takes the role on start; a second server that finds a live driver reports the tab as **contended** and refuses to act, since two drivers interleaving presses on one save is indistinguishable from the game misbehaving.

## Interrupted run

A run that ended without the party wiping — the game tore itself down and dropped back to the title. Distinct from a **wipe**: a wipe is an ending the agent played its way into, while an interrupted run is a failure, and the run may still exist server-side. The two are never reported as the same thing, because treating an interruption as a wipe invites starting a new run over a run that is still alive.

## Call outcome

What a tool call reports about the game and the run, apart from its own payload: it did what it says, it is still waiting on the game, the agent is **stuck**, the run is over, or the run was **interrupted**. It is decided over the whole call: every wait, every press, and how the call ended (settled, out of time, or refused). A call that runs out of time can still report that the run was interrupted while it waited. When more than one applies, what happened to the run beats what the screen is doing, and both beat the clock.

## Preview

What the **run seed** already decides about a **wave** the run has not reached yet, read out ahead of time. A preview is a read: it never advances the game or the run's own sequence of rolls.

Each field of a preview carries its **confidence**, and a field is never surer than what it derives from:

- **exact** — settled independently of how much of the run has been played, so it cannot drift.
- **replay** — right only while the game's own draws for that wave are exactly the draws the preview made.
- **estimate** — read off state that belongs to the current wave and may have moved on by the time the previewed wave arrives.

Every confidence is also conditional on the run not changing first: a catch, an evolution, a shop pick or a biome change re-rolls what a preview was read from. Confidence is claimed, then **scored** — each field is checked against the wave when it actually arrives, and a field that has ever been wrong is marked as such for the rest of the run.

Not to be confused with a **tier**, which throughout is the game's own word for a rarity band (an encounter's, a species').

## Team audit

The **coach**'s check of how the **party** is built, as opposed to what to do with it now: the part of a **card** that
judges the team the decisions made rather than the decision at hand. It is said between waves, where a reward, a TM or
a relearned move can still fix it. Party checks read the **party profile** (a weakness nobody resists, the types
nothing hits) plus each member's moveset and level (dead move slots, members left behind); roster checks read the next
big fight's foes from a **preview** (who outspeeds them, a foe with a single **answer**, the weakest member against
that roster). A finding either loses fights or only costs tempo, and the card leads with the first kind.

An **answer** to a foe is a member's attack that hits it super-effectively off the stat that member actually attacks
with. A foe with one answer is a single point of failure: lose that member and the fight is gone.

## Moveset prior

Outside evidence about which moves a species is usually built around, used to break a tie the **coach**'s own numbers leave open. It is a prior in the plain sense: it shifts a score the coach already computed, and never decides on its own. A prior that overrules the computed score is a bug, not a stronger prior.

A prior is always named on the card that used it, along with the **role** — the named set it comes from — so a recommendation it moved can be argued with.

## Boss bar

One of the segments a boss pokémon's HP is split into. A hit that would carry past a bar's boundary stops there, unless it is big enough to break more than one bar at once. A wild boss grows stronger each time one of its bars breaks.

## KO pacing

How quickly one side can faint a target from a given HP, told as the chance the target is down by each coming turn. It runs through every **boss bar**, a Reviver Seed's second life, and the HP the target gains or loses at each turn end. Only the first turn is played at its exact odds; later turns follow from the spread of damage each attack can do.

The **likely** KO turn is the first by which the target is more likely down than not; the **expected** KO turn weighs every turn by its chance, and is what advice is scored on.

## Move traits

What a move does beyond its damage number, read once from the move and its user: the turns it spends (a charging turn, a recharge turn, a lock-in, not twice in a row), what it costs its user (recoil, HP, fainting, its own stat drops), when it fails (hit first, a target that doesn't attack, past the first turn), how many times it hits, and what a status move sets up (stat stages, a status, a heal, a hazard). Traits hold no battle state: whether a condition holds this turn, and what a trait is worth, belong to whoever reads them.

A move's **costs** are the traits that hurt its user, and are always named the same way wherever a card shows them. Not to be confused with a **drawback**, which is the coach's judgement that a move scores worse than it hits, taken from the game's own move scoring.
