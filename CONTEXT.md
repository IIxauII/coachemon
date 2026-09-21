# Context

Vocabulary for Coachemon. Glossary only — no implementation detail.

## Coachemon

The name the whole effort carries: the repo, the Claude Code plugin and the MCP server inside it, the coach skill, and the browser extension that draws the **card**. Spelled `Coachemon` wherever it is shown to a person and `coachemon` wherever it is an identifier — a slug, a plugin id, a directory, an event name. Which part is meant follows from what is being installed: a player installs the extension, an agent installs the plugin. PokéRogue is the game it reads, never part of the name.

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

## Fusion

Two **party** members made one by a DNA Splicer. The member picked first is the **base**: it keeps its level, nature,
moves and passive. The one picked second is the **other half**: it lends its ability, a type and half of every base
stat, then leaves the party for good. Order matters, so a fusion is always named base first (`Garchomp ← Salamence`).
A fusion is judged on the party it leaves, not on the base alone: it spends a member.

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

The **coach**'s advice for the decision the player faces right now: a battle, a move to learn, a reward choice, a biome choice or a mystery encounter. There is one card per decision, so a card is coarser than a **screen**: a single battle card stays up while the player moves between the command, fight and target screens. What a card is showing is also available as plain text, for whoever follows the game without seeing it. A card is shown as a **strip** over a **drawer** of **group**s.

## Group

One named part of a **card**, drawn from one closed set of eight: *act*, what to do now; *options*, the choices being judged; *foes*; *plan*, the **fight plan**; *catch*; *road*, what lies ahead, a **preview** among it; *audit*, the **team audit**; and *notes*. A card is a list of groups and nothing else, and a group means the same thing on every card it appears on, which is what lets one be remembered as the cards change under it. Every card has an act group, whatever kind of decision it is.

## Strip

The line of a **card** that stays in front of the player whatever else they have open or shut: what the card is about, the first line of its act **group**, and — where the card has one — its **verdict**. The thing to do now is never a click away.

## Drawer

Where a **card**'s **group**s sit, one shown at a time: always the one the player last picked, never one the coach chose for them.

## Minigame turn

One turn of a **continuous encounter**: an encounter that re-opens its own screen with a fresh menu until it is done — Safari Zone's ball / bait / mud / run, three wild mons in turn. The options on that menu are the game's **override options**, not the encounter's own, so nothing keys them by index and only an encounter the coach knows by name can judge them. A turn is its own decision on the same **card**, told apart by the mon in front of you and by the two stages its odds are read from.

## Verdict

A battle card's one-word call on the wave: **easy**, **trainer**, **danger**, **catch** or **fight**. It lets whoever watches alongside the coach stay quiet on an easy wave and speak up on a dangerous one. A verdict sums the card up; it never adds advice the card doesn't show.

## Driver

The one process on a machine allowed to press buttons in the game. A process becomes the driver the first time it acts, not when it starts: reading the game never needs the role, so any number of readers can follow a game while one driver plays it. A second process that tries to act while a live driver exists finds the game **contended** and refuses, since two drivers interleaving presses on one save is indistinguishable from the game misbehaving.

With more than one game tab reachable, there is nothing to drive or follow: acting and reading both refuse rather than guess which save they would touch.

## Hub

The one local process on a machine that the browser extension connects to. Every process that reads or drives the game reaches it through the hub; none of them talks to a browser directly. The hub knows which game tabs are reachable, across every browser, and which process is the **driver**. It carries commands and never decides anything about the game itself.

Never called the *host*: Apple's *host app* is the browser that hosts an extension, the opposite sense.

## Reach

Whether anything can be asked of a game tab at all, and when it cannot, the one thing standing in the way. The obstacles are ordered — no **hub**, no browser, an extension too old, a browser still waiting for the player's consent, no tab, more than one tab — and the first one that applies is the only one reported, because fixing it is what uncovers the next. Every tool checks reach before it does anything else, and refuses with the same words the player would read from a status check.

The ordered steps here are also called **rungs**, as on the **escape ladder**, but the two ladders are unrelated: an escape ladder's rungs are presses that leave a menu, a reach's rungs are things wrong between a process and the game.

## Command

One step the **hub** carries to a game tab: either a read or an act, each a single look at the game or a single input to it. The set of commands is closed, fixed by the extension a player installed, and nothing else can be sent. A tool call issues many commands, and all the waiting, walking and judging between them belongs to the process that issued them. Only acts need the **driver**.

Not to be confused with the game's own command menu (Fight, Ball, Pokémon, Run), which is a **screen**.

## Relay

The extension's presence in one game tab: it carries a **command** in and its answer straight back out, and nothing
else crosses. A tab becomes reachable only once its relay is there, so the relay is what the **hub** counts.

Nothing the page says is trusted, because anything already in the page could drive the game itself. Only answers the
relay is waiting for and **card**s shaped exactly as the coach sends them leave a tab.

## Flavour

Which of two builds of the extension a player has: the **store** flavour, which is what a store reviews and ships and
which asks for no permission of any kind, or the **dev** flavour, which carries the extra commands a developer needs
and its own **hub**, so the two never count the same tab twice.

## Build id

Which build of the extension a tab is running. Everything the extension says carries it, and the parts inside one tab
work together only when their build ids agree — so a tab left on an older build is out of play rather than half
working.

## Interrupted run

A run that ended without the party wiping — the game tore itself down and dropped back to the title. Distinct from a **wipe**: a wipe is an ending the agent played its way into, while an interrupted run is a failure, and the run may still exist server-side. The two are never reported as the same thing, because treating an interruption as a wipe invites starting a new run over a run that is still alive.

## Call outcome

What a tool call reports about the game and the run, apart from its own payload: it did what it says, it is still waiting on the game, the agent is **stuck**, the run is over, or the run was **interrupted**. It is decided over the whole call: every wait, every press, and how the call ended (settled, out of time, or refused). A call that runs out of time can still report that the run was interrupted while it waited. When more than one applies, what happened to the run beats what the screen is doing, and both beat the clock.

## Confidence

How sure the **coach** is of something it claims, carried by the claim itself rather than left to the reader to guess:

- **exact** — settled independently of how much of the **run** has been played, so it cannot drift.
- **replay** — right only while the game's own draws are exactly the draws the coach made.
- **estimate** — read off state that may have moved on by the time the thing it describes arrives.

A claim is never surer than what it derives from. Confidence is claimed, then **scored**: it is checked against what actually happens, and a claim that has ever been wrong is marked as such for the rest of the run.

**exact** survives a live input only where nothing the player could do sits between the claim and the thing it describes: a read off a draw the run cannot move, and off a table the run cannot rebuild, is exact even when one of its inputs is read live.

Every **preview** field carries one, and so does the enemy's move in a **turn read**.

## Journal

What the **coach** wrote down about decisions already taken, kept so that a claim can be checked later against what
the game actually did. A journal entry pairs the **card** as it was shown with the outcome that followed; it records
and never judges, so reading one is how a live check is done rather than the check itself.

It outlives the thing it describes — the **run**, the reload, the session — because what it is for is the case that
takes many runs to gather. It is bounded, and the oldest entries fall off the end rather than growing without limit.

Distinct from a **preview**'s scoring, which grades one claim as the run goes and keeps only the tally.

## Oracle

The game itself, played headless, used as the answer a coach claim is checked against. The pinned game is run on
upstream's own test harness, a **card** reads that live scene exactly as it would read a tab, and what the card
claims is compared with what the game then did.

An oracle answers only what is falsifiable — a destination, a payout, a roll — never a **verdict**, which is
judgement and has no answer to be checked against. It is a dev tool and never ships.

Distinct from a **journal**, which waits for a real **run** to serve the case: an oracle asks for the case it
wants, so it reaches what a run may never show.

## Preview

What the **run seed** already decides about something the run has not reached yet, read out ahead of time: a **wave** ahead, the rewards a reroll the player hasn't paid for would bring, or the three mons behind Safari Zone's fee. A preview is a read: it never advances the game or the run's own sequence of rolls.

The last two are the same shape — what an unpaid purchase would buy — and it is what makes the price a real decision rather than a sum of money.

Each field of a preview carries its own **confidence**, and all of them are conditional on the run not changing first: a catch, an evolution, a shop pick or a biome change re-rolls what a preview was read from.

Not to be confused with a **tier**, which throughout is the game's own word for a rarity band (an encounter's, a species').

## Team audit

The **coach**'s check of how the **party** is built, as opposed to what to do with it now: the part of a **card** that
judges the team the decisions made rather than the decision at hand. It is said between waves, where a reward, a TM or
a relearned move can still fix it. Party checks read the **party profile** (a weakness nobody resists, the types
nothing hits) plus each member's moveset and level (dead move slots, members left behind); roster checks read the next
big fight's foes from a **preview** (who outspeeds them, a foe with a single **answer**, the weakest member against
that roster). A finding either loses fights or only costs tempo, and the card leads with the first kind.

An **answer** to a foe is a member that can deal with it. A foe with one answer is a single point of failure: lose
that member and the fight is gone. The word has one meaning and two readings, by what the reader can afford: the team
audit answers between waves off the type chart and the stat a member attacks with, while the **fight plan**, which has
the battle in front of it, plays the one-on-one out and asks who wins it. A card says which reading it used.

The word points at our own members only. What a foe does to us is the other direction: a foe's typing or ability
**stops** a slot when it leaves that member with nothing worth doing — an immunity, a wall, a lock on the only move
it can still reach. A slot that is stopped is not an answer to anything, and the coach never calls it one.

## Turn line

The **coach**'s call for the decision in front of the player right now: which of our **party** acts, with what, at
whom. It is the one thing the coach says that reads the battle at full fidelity, and it is the authority for the
turn — the **fight plan** contributes a price to it and never overrides it.

A turn line always says something. Where the obvious move is gone it names what is left — a status play, a switch,
the member held back as an **answer** to a foe still to come — and only where the turn is genuinely lost does it say
so plainly. It never reports a member as empty when the reason is that something **stopped** it.

## Trap

A foe ability that changes what our side should do — the other direction from an **answer**, and narrower than
**stops**: a trap need only make one of our options worse, where stopping leaves the member with nothing worth doing.
An ability the coach can already see in the numbers is not a trap: Sturdy is in the KO count, and a foe's Intimidate
is in our stat stages the moment it is on the field, so neither is ever flagged.

Traps come in two kinds, because the question each asks is different. A **move trap** turns on which move we pick —
an immunity by type or by move flag, a damage cut, a punish on contact, Intimidate on a foe still coming in — so it is
asked of a move, and it bites or it doesn't. A **field trap** holds whatever we pick: it turns our hits, stat drops or
KOs into boosts, undoes chip or status, ignores our boosts, or changes what a status play is worth.

The two surfaces ask differently. A **turn line** names the move traps the move it picked runs into, because that is
the move being recommended. A foe row marks every field trap the foe has, and every move trap that bites some move in
the pool of the members we put in front of it — the whole pool, not the picked move, so an immunity that took the only
move worth using is still shown rather than hidden by the switch away from it.

## Fight plan

The **coach**'s read of a whole trainer battle: which of our **party** takes which foe, in the order the trainer sends
them, with HP carried from one exchange to the next. It exists because a single turn's advice cannot see that spending
the only **answer** to a foe still on the bench loses the fight three foes later.

The fight plan does not decide a turn. The **turn line** does — the coach's call for the decision in front of the
player, which alone reads the battle at full fidelity. The plan is re-searched with the turn line's action as its own
first step, so what it shows always explains the turn rather than arguing with it; where it would rather have played
the turn differently, it says so in one priced line and leaves the call where it was. What it contributes to the turn
line is a price: what the rest of the fight loses by taking the turn this way.

## Turn score

The single currency every number the **coach** weighs is denominated in: turns of ours. A move is worth the turns it
saves; a mon of ours lost is worth the turns its absence costs; chip damage laid down for a foe still on the bench is
worth the turns of ours it spares later. One currency is what lets a turn's mechanics, a **fight plan**'s price and the
cost of losing a mon be added up at all.

What removing a foe is worth has its own entry: the **removal price**.

A quantity in some other unit — a bare probability, a fraction of a health bar — cannot be compared with one in turns,
however reasonable each looks alone; summing them silently picks an exchange rate nobody chose. So a weight the coach
carries is stated in turns before it is given a number, and one whose unit is unclear is a bug waiting rather than a
value to tune.

## Field threat

In a double, the chance one of ours falls before it lands its kill, taken against the whole field rather than against
the foe it is aiming at: the worst duel on the field. It is the same number wherever that mon aims, which is the point
— the other foe hits us whichever foe we choose, so a target may not be charged for danger that arrives either way.
Charging it is what made the **coach** avoid the foe about to kill one of ours, since aiming there read as the losing
trade.

What a target *is* answerable for stays with it: how surely we can fell that foe, whether we take it off the field
before it acts, and what our move costs to use. In a single battle the field is the one foe, so the field threat and
the duel are the same number and nothing changes.

## Removal price

What taking a foe off the field is worth, in **turn score**: the bare fact of it, plus the danger it was carrying. The
second part is every turn that foe would have acted and now will not, so a foe about to take most of our health is
worth more to remove than a harmless one — which is what makes a pair focus the dangerous foe rather than the one it
can kill most cleanly.

The price is multiplied by the odds the KO actually happens, so a dangerous foe the pair cannot remove this turn earns
nothing from it and the killable foe is taken instead. The limit needs no rule of its own: a removal that will not
happen is worth nothing to price.

Separate from it, and kept: removing a foe *before it acts* is worth the hits that cancels, on top of the removal
itself. That is the one thing a target choice genuinely changes about the damage coming at us this turn.

## Moveset prior

Outside evidence about which moves a species is usually built around, used to break a tie the **coach**'s own numbers leave open. It is a prior in the plain sense: it shifts a score the coach already computed, and never decides on its own. A prior that overrules the computed score is a bug, not a stronger prior.

A prior is always named on the card that used it, along with the **role** — the named set it comes from — so a recommendation it moved can be argued with.

## Boss bar

One of the segments a boss pokémon's HP is split into. A hit that would carry past a bar's boundary stops there, unless it is big enough to break more than one bar at once. A wild boss grows stronger each time one of its bars breaks. A broken bar stays broken: a heal can lift the boss's HP past the boundary, but the next hit is judged against the bars it has left.

## KO pacing

How quickly one side can faint a target from a given HP, told as the chance the target is down by each coming turn. It runs through every **boss bar**, a Reviver Seed's second life, and the HP the target gains or loses at each turn end. Only the first turn is played at its exact odds; later turns follow from the spread of damage each attack can do.

The **likely** KO turn is the first by which the target is more likely down than not; the **expected** KO turn weighs every turn by its chance, and is what advice is scored on.

## Move traits

What a move does beyond its damage number, read once from the move and its user: the turns it spends (a charging turn, a recharge turn, a lock-in, not twice in a row), what it costs its user (recoil, HP, fainting, its own stat drops), when it fails (hit first, a target that doesn't attack, past the first turn), how many times it hits, and what a status move sets up (stat stages, a status, a heal, a hazard). Traits hold no battle state: whether a condition holds this turn, and what a trait is worth, belong to whoever reads them.

A move's **costs** are the traits that hurt its user, and are always named the same way wherever a card shows them. Not to be confused with a **drawback**, which is the coach's judgement that a move scores worse than it hits, taken from the game's own move scoring.

## Turn read

The **coach**'s look at a battle while the game waits on the player's decision (a command, a free switch or a faint replacement). Every damage number, enemy move, enemy switch and Terastallization the coach shows then comes from the game's own code, as the battle stands. The enemy's move is the game's own decision rather than a guess at it, and carries a **confidence**: **exact**, except where a command of ours draws first and so decides which move the enemy picks, where it is a **replay** of that command. Outside a decision the game can't be asked, so the coach falls back to numbers worked out from the type chart alone. When the game's own code can't be asked *at* a decision, the coach says why and withholds the turn read rather than advising from an **estimate** — the fight, the team's plan and what lies ahead go quiet together. A **card** built from a turn read stays up through the turn's animations, until the turn ends, the wave changes or a foe is sent in.

## Run read

The **coach**'s look at the **run** between decisions of a battle: what the run seed, the wave, the biome, the party
and what it holds already decide, read once and shared by every card that judges the road ahead — a **preview**, the
next big fight, a **team audit**, a biome pick, a shop, a reroll, a mystery encounter. It is the twin of the **turn
read**: the turn read looks at the fight in front of the player at full fidelity, the run read at the run around it,
and the two never look at once. A run read never advances the game or the run's own sequence of rolls.

Everything a run read hands out is the same answer for the same run state, so two cards built from one read cannot
disagree. A field it cannot answer says why, in the card that wanted it, rather than going quiet.

## Spare hit

In a double, the second of two hits aimed at the same foe when the first alone already fells it. A spare hit is never wasted: the game retargets a still-queued single-target move whose target has fainted onto the surviving foe (a **redirect**), so it lands there carrying the move its slot chose for the dying foe, not one picked for the survivor. The coach prices the slot on both branches at once — the redirect's worth where the target falls first, its own worth where it doesn't — so it spreads when the slot has a materially better move for the other foe than the redirect would carry, and focuses when it hasn't. A redirect settles only the turn it lands in, and the slot chooses freely again from the next one, so carrying the wrong move costs a turn rather than the fight.

Priced that way the pick turns on a second axis too: how sure the first hit is. The less certain the partner's KO, the more of the slot's worth is its own branch, where the hit is the **insurance** that fells the target if the partner's misses. A doubtful enough KO focuses a pair that would spread on the same field with the same movepool were it certain.

## Return

In a double, the switch-in that is the mon the **other** slot is withdrawing this same turn: both slots' benches name the same party index, the game resolves the slots in field order, and so the second slot's send-in is the mon the first has already pulled. The card says *returns from the other slot* where an ordinary switch-in *switches*, because the usual wording, read while the player watches that mon leave the other slot, looks like a broken panel. A return is also the one switch-in that the coach sees still carrying stat stages it is about to lose — it is on the field as the coach reads it, and a switch-in's summon data is reset when it lands — so the turn read and the fight plan both price it at base stages.

## Hypothesis

The battle as it would stand one move from now: our stat stages after a Swords Dance, a foe paralysed by Thunder Wave, or a foe turned pure Water by Soak. The coach asks the game's own code about it as if it were so, and a hypothesis is never played out: the battle is left exactly as it was. A foe predicted to Terastallize this turn is read the same way, but only for how hard hits land, never for what the foe decides, since it picks its move before it Terastallizes.
