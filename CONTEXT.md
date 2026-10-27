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

## Next big fight

The first final wave, fixed battle, gym leader or boss on the **run calendar** the party still has to win, seen from the decision at hand. In a battle its own wave counts until it is won; every other decision stands past the wave on screen — a reward, a fusion and a biome pick come once that wave is won, and a mystery encounter takes its wave's place. The **threat set**, the **level projection**, **dead weight** and the weakest member are all read at the same one, so two cards of one **run read** never judge against different fights. The `road` a card shows starts past the wave on screen, so in a battle on a big-fight wave it starts at the one after.

## Party

The pokémon the player controls in the current run. The **active pokémon** is the one currently on the field; the rest are on the bench. Distinct from account-level collection data.

## Dead weight

A **party** member that holds a slot but can't battle at the next big fight: one a challenge bars from battle, or one
fainted with nothing to bring it back first — no party heal before that fight and no shop on the way, or Hardcore. It
counts for nothing when the party is judged, so replacing it costs only what the release destroys. A would-be newcomer
a challenge would bar is dead weight the moment it joins. Every other member is judged at full health, fainted or hurt
as it may be now; who can fight the battle in front of the party is a different question, asked of the members standing.

## Party profile

The **party** judged as a whole rather than member by member: the types it hits super-effectively, the types it can't, the types several members are weak to, and its weakest member — the one whose loss costs the least **team value**, with no newcomer in view. A would-be newcomer (a wild pokémon, a species in a biome, a trade offer, a fusion) is judged by the team value its swap makes rather than by the profile, and the member it replaces is the one its own swap picks, which need not be the weakest: the newcomer may cover what another member covered. The profile's tallies only phrase the reasons.

## Threat set

The foes a **party** is judged against when no fight is in front of it, in two halves of equal say. The standard
threats are always one half: one foe per type plus a few stat shapes (a fast sweeper, a physical wall, a special wall, a
bulky attacker), at the next big fight's level. The next big fight's roster is the other half when a **preview** has
it; without one, the standard threats stand alone. The halves are kept apart because a newcomer outlasts the fight
ahead: a party fitted to one gym alone would be told to drop answers the next fight needs. Not the field's foes, which
a **turn read** sees.

## Team value

What a **party** is worth against the **threat set**, in **turn score**: for each threat, the turns its **answer**
and a backup win by, credit for a member that can switch in on it or finish it from behind, less its **exposure**. A
would-be newcomer is worth the change in team value its swap makes, net of what the release destroys. Distinct from
the **party profile**, which tallies types and scores nothing.

## Exposure

The share of the **party**'s members one threat beats one-on-one, speed deciding who moves first. It grows the cost
faster than the share, because one member of six lost to a threat is ordinary and four is a sweep — which is what makes
a party that stacks one weakness worth less than its best answers suggest. A share and not a count, so a member that
joins a party a threat already sweeps is not one more for it to beat.

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

A single selectable entry in a menu, with a visible **label**. An option is selected by its label; the cursor movement it takes is an implementation detail the server hides. Where the label decorates a plain name with live data (`Great Ball ×9`), the option also carries that **name**, and the name selects it too.

## Progress fingerprint

A short, deliberately coarse summary of what the game is showing, read at each settled moment. Two moments with the same fingerprint are treated as the same place. It answers "have we been here before", which is a different question from **settled**'s "has the game stopped moving" — so the two are kept apart even where they read the same things.

## Stuck

The game is **settled**, presses are being delivered, and the **progress fingerprint** keeps returning to where it has already been. The run is alive; the agent is lost. Three shapes, named separately because their escapes differ: a **dead end**, where no press moves the fingerprint at all; a **loop**, where presses do move it but only around a cycle; and a **hang**, where the game is waiting on something that will never arrive and no input exists that reaches it.

Stuck is reported, never escaped unilaterally.

## Screen

What the game is actually asking, as a whole. A screen is *not* the same as a **UiMode**: one UiMode can serve several screens that differ in what they mean and in how they can be left, so a screen is identified by the UiMode together with whatever discriminates it. The **menu** is the choice a screen presents; the screen is the thing Claude is looking at.

## Overlay

The **coach** as it runs in the player's tab: the whole part that reads the game, works out the **card** and draws it over PokéRogue, and the box the card is drawn in. Its cost to the game includes every game function it calls while it runs. The code calls it the *HUD*. Not the *panel*, which names only the box.

## Decision

A choice the game is waiting on the player to make, of a kind the **coach** has a **card** for. In a battle, it is the command for a turn (in a double, each slot's command is its own decision), the free switch offered before the first turn of a battle with no trainer, when it starts, on a load or on a game-over retry, the replacement for one of ours that fainted, or the **pivot** for one of ours that left mid-turn by its own move or ability. A pivot is picked while the turn is still resolving, so its card is built without a **turn read**: the pick is planned at the command, where the turn read is live, and the card carries it while that field holds, or says it has none and shows only what needs no turn read. Outside one, it is a reward, free or from the shop, a move to learn, a biome, a mystery encounter's option, a starter or a fusion. A shop purchase commits a decision, and the shop that stays open asks a new one. A decision lasts from the moment the game starts waiting on it until the press that commits it, across every **screen** passed through on the way: the command, fight and target screens are one decision. A decision is only ever made while the game is **settled**, but not every settled moment is a decision: a message waiting for a press, or a level-up's stat box, asks for input without asking for a choice.

## Watch

How the **overlay** notices a **decision** and keeps its **card**: a look, every frame, at which decision the game is waiting on and with what key, read from what the game already shows, never by hooking it. A new decision has its card built at once, and the watch holds that card until the next decision: what the player opens or shuts redraws it as it is, a mon sent in redraws it once, and nothing else between decisions asks the game for a card. Coming back to a decision already built shows its card as it was.

## Card

The **coach**'s advice for the **decision** the player faces right now. There is one card per decision, so a card is coarser than a **screen**: a single battle card stays up while the player moves between the command, fight and target screens. A card is built when its decision begins and is held until the next one: what happens between two decisions (a faint, a level-up, a new wave) leaves it as it was. The one exception is a mon sent in mid-turn, on either side, which redraws the card once from the type chart alone. What a card is showing is also available as plain text, for whoever follows the game without seeing it. A card is shown as a **strip** over a **drawer** of **group**s.

## Group

One named part of a **card**, drawn from one closed set of eight: `act`, what to do now; `options`, the choices being judged; `foes`; `plan`, the **fight plan**; `catch`; `road`, what lies ahead, a **preview** among it; `audit`, the **team audit**; and `notes`. A card is a list of groups and nothing else, and a group means the same thing on every card it appears on, which is what lets one be remembered as the cards change under it. Every card has an act group, whatever kind of decision it is.

## Strip

The line of a **card** that stays in front of the player whatever else they have open or shut: its **caption** — the kind's emoji and what the card is about — the first line of its act **group**, and, on a battle card, its **verdict**, unless that is unavailable. While a randomizer challenge is on, the strip also says the run is randomized, since a species' moves and abilities are then not what the coach knows of it. The thing to do now is never a click away.

## Drawer

Where a **card**'s **group**s sit, one shown at a time: the one the player last picked, never one the coach chose for them. A **tab bar** names every group the card has, one **tab** each, in an order that is the same on every card; the open group's own contents are its **pane**, and a pane too tall for the overlay's box scrolls inside itself. A tab carries its group's name and nothing else — no mark, no count, no state but being the open one. The drawer can be shut by the caret in the box's corner, leaving the **strip** alone, and the box dismissed by the × beside it, leaving a bare glyph that is the same on every wave and is only the way back. A dismissal covers the box rather than replacing it, and the overlay goes on reading the game underneath, so reopening comes back to the strip or the drawer the player left. Which group is open is remembered by id as the cards change under it and across a reload; a card with no group of that id moves the drawer to `act` and does not move it back when the group returns.

## Minigame turn

One turn of a **continuous encounter**: an encounter that re-opens its own screen with a fresh menu until it is done — Safari Zone's ball / bait / mud / run, three wild mons in turn. The options on that menu are the game's **override options**, not the encounter's own, so nothing keys them by index and only an encounter the coach knows by name can judge them. A turn is its own decision, and so gets its own card, told apart by the mon in front of you and by the two stages its odds are read from.

## Verdict

A battle card's one-word call on the wave: **easy**, **trainer**, **danger**, **catch**, **fight** or **unavailable**. It lets whoever watches alongside the coach stay quiet on an easy wave and speak up on a dangerous one. A verdict sums the card up; it never adds advice the card doesn't show.

**Unavailable** is the call when the coach can't read the enemy's move exactly: the card, the **fight plan** and the catch advice stop together and say why. The **strip** shows no verdict for it, since the card's act line already says why.

Only a battle card has a verdict. It is that card's **leading call**; every other kind of card has a leading call of its own.

## Leading call

The call a **card** leads with: one per card, saying in a few words what the card comes to, and never adding advice the card doesn't show. What it is depends on the card's kind:

- **battle** — its **verdict**.
- **learn** — the learn call: learn the move, naming the one to forget, skip it, or leave it to the player where nothing can be scored. At a move prompt a held **oracle line** answers, it is that line's **learn pick** instead (`Bulbasaur skips Leech Seed`), except on the oracle line's last step, whose picks are no claim.
- **rewards** — the first clause of the rewards line.
- **biome** — the biome the coach picks.
- **encounter** — `take` and the option the coach picks, `your call` on an encounter it judges without picking one, or `not judged` on one it can't judge.
- **pivot** — `send X`, the pick the battle card planned at that turn's command, while the field it was planned on still holds (for a move expected to KO its target, the field after that KO as well); `your pick` otherwise, since a **pivot** is picked without a **turn read** and the card judges none of its own. A held **oracle line** whose step names this pivot leads instead (`send Vaporeon`), as it leads the battle card.

Starters and fusion cards have a leading call too, but the card event never sends those kinds.

The card event the overlay streams carries the leading call in its field named `verdict`, for every kind it sends. The field keeps that name because renaming it breaks every reader of the stream. Only a battle's leading call is a verdict, so an **oracle** answer can be a learn card's leading call but never a verdict.

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

One step the **hub** carries to a game tab: a read, an act or a handoff — a single look at the game, a single input to it, or something given to the **overlay** to hold, which changes the overlay alone and never the game. The set of commands is closed, fixed by the extension a player installed, and nothing else can be sent. A tool call issues many commands, and all the waiting, walking and judging between them belongs to the process that issued them. Only acts need the **driver**.

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

## Job

Work the coach plugin runs in the background because it outlasts one tool call, such as an **oracle**'s solve or setting up the clone it solves in. The call that starts a job returns at once and the job runs on after it, with a progress line short enough for the coach to relay as it is. A job ends **done** with its answer, **failed** with what stopped it, or **cancelled**, and whichever comes first is final: an answer that arrives after a cancel is dropped. A job lives in the plugin's own process and goes when it does. One solve runs at a time, from the decision it was started at: starting one for a new fight, or for a later turn of the same fight, cancels the one running. A fight's solves share the oracle's workers, kept warm from its first solve until the fight ends.

## Confidence

How sure the **coach** is of something it claims, carried by the claim itself rather than left to the reader to guess:

- **exact** — settled independently of how much of the **run** has been played, so it cannot drift.
- **replay** — right only while the game's own draws are exactly the draws the coach made.
- **estimate** — read off state that may have moved on by the time the thing it describes arrives.

A claim is never surer than what it derives from. Confidence is claimed, then **scored**: it is checked against what actually happens, and a claim that has ever been wrong is marked as such for the rest of the run.

**exact** survives a live input only where nothing the player could do sits between the claim and the thing it describes: a read off a draw the run cannot move, and off a table the run cannot rebuild, is exact even when one of its inputs is read live.

On a **card**, exact carries no mark, replay is `~`, estimate is `≈`, and a claim that has been wrong is `!`.

Every **preview** field carries one, and so does the enemy's move in a **turn read**. An **oracle line** claims
**replay** at most, never exact: the player's own inputs sit between it and every turn after the first.

## Journal

What the **coach** wrote down about decisions already taken, kept so that a claim can be checked later against what
the game actually did. A journal entry pairs the **card** as it was shown with the outcome that followed; it records
and never judges, so reading one is how a live check is done rather than the check itself.

It outlives the thing it describes — the **run**, the reload, the session — because what it is for is the case that
takes many runs to gather. It is bounded, and the oldest entries fall off the end rather than growing without limit.

Each **checkpoint** of an **oracle line** is a claim like any other, journalled as the fight goes.

Distinct from a **preview**'s scoring, which grades one claim as the run goes and keeps only the tally.

## Oracle

The game itself, played headless on upstream's own test harness in a clone pinned to one **game version**. It has
two uses. It **checks** a coach claim: a **card** reads that scene exactly as it would read a tab, and what the card
claims is compared with what the game then did. And it **solves** a trainer fight: from the run's own save, it plays
inputs forward on the battle's seed until a sequence of them wins, and that sequence becomes an **oracle line**.

An oracle answers only what is falsifiable — a destination, a payout, a roll, whether a sequence of inputs wins — never a
**verdict**, which is judgement and has no answer to be checked against. Where a solve can't reach **replay**
confidence, the oracle says "no answer" rather than guess.

Checking is a dev tool. Solving is opt-in. It is a standing setting in the coach plugin that the player turns on, and
it runs on their own machine. It is never offered in a Daily run, whose seed every player shares. The extension never
runs an oracle, and neither does the tab.

Distinct from a **journal**, which waits for a real **run** to serve the case: an oracle asks for the case it
wants, so it reaches what a run may never show.

## Oracle line

The **oracle**'s answer to a trainer fight: the inputs, turn by turn, that it has played to a win on the battle's own
seed, with a **checkpoint** after each turn — what the battle will look like when the next **decision** comes, if the
game has drawn what the oracle drew. Every checkpoint is a **replay** claim, checked when that decision arrives. An
oracle line leads only from the decision it was solved from: one that comes after the fight has moved past that
decision never leads at all.

An oracle line names the luck it rides: each draw that went its way with less than a sure chance, with its turn and
that chance. One that rides none says so, naming the draws it read.

While every checkpoint has matched, the oracle line's step is the call for the turn in place of the **turn line**,
and it stands in for the **fight plan**. One miss and the game is **off the line**: the oracle line is void for the
rest of the run, the turn line leads again and the fight plan returns, and the oracle may solve again from where the
game now stands.

Always said in full. A bare *line* is ambiguous next to a **turn line**, which is one decision's call, and the **fight
plan**, which is the card's own read of the whole battle.

## Learn pick

The answer to a level-up that would give one of our **party** a fifth move: which of its four moves it forgets, or
that it declines the new one. The game asks in the middle of a turn, once the KO that brought the level has landed, so
an **oracle line** names the pick inside the step whose turn asked, as it names a faint replacement. One turn can ask
more than once, two members levelling or one levelling past two new moves, and its picks follow the order asked. A
member with a move slot free learns without being asked, and needs no pick.

Each pick is a choice the **oracle** solves over, as it does a command. A line that leaves a prompt unanswered, or
answers one the game never asks, does not replay.

## Pivot

The mon one of ours sends in when it leaves the field mid-turn by its own move or ability: U-turn, Volt Switch, Flip
Turn, Parting Shot, Baton Pass, Shed Tail, Wimp Out, Emergency Exit. The game asks for it on a party screen inside the turn, so an **oracle line** names
the pivot inside the step whose turn asked, as it names a faint replacement, and in a double by the field slot it
fills. Like a **learn pick**, each pivot is a choice the oracle solves over.

Distinct from a switch, which is the turn's command, and from a faint replacement, which fills a slot a faint emptied.

## Augmented export

What the **oracle** solves from when the fight is already under way: the session export taken at a **decision**, and
the extras read live at that same decision, which the export lacks or a reload resets. It serves a coach that joined
late and every re-solve once the game is off the line. Missing any one of the extras, it is "no answer", never a guess
at what the reload would have kept.

Distinct from the save the game writes at the start of a wave, which a solve from the first turn loads as it is.

## Game version

The PokéRogue release the live tab serves, as the game itself reports it. An **oracle** runs exactly one game version,
and it refuses a save from any other, because the game would load it under the wrong rules without a word. What holds
an oracle to its version is the test harness having replayed a **known fight** on it, not the clone. A save from an older
game is **carried** to the oracle's version through the game's own migration, as the live game carries it: a known
fight's in that re-check, and a player's once the live game serves the oracle's version, since the game rewrites a
continued run's wave-start save only at the next wave. The loaded scene is held to the live export, migrated the same
way. A save from a newer game is never carried.

Distinct from a **build id**, which is which build of the extension a tab runs.

## Known fight

A trainer fight won live, kept in the repo with the save it started from and, turn by turn, the inputs played and what
live showed after each. It is re-checked at every pin bump: the new **game version** must replay it to the same win,
every fact live showed matched, before the **oracle** solves on that version. Known fights are few and strict, and they
are what hold the oracle to its version. A fight joins them only on the maintainer's word that it was won live, by hand
or on its **oracle line**. One that stops replaying on a new version is replaced by another played live, never simply
dropped.

Distinct from the **fight library**, which keeps every solved fight, won or not, and gates nothing.

## Fight library

Every fight the maintainer solved with the dev switch on: what each solve started from, at the first turn or mid-fight,
the **oracle line** where it found one, and how the search went. Each **solve start** keeps only its latest solve's
pair. It keeps the fights the oracle could not win too, and has no limit. It is for offline use alone: replaying its oracle lines on changed code to see what broke, and solving its
fights again to compare how the oracle searches. It is never a gate: no pin bump replays it, nothing in it holds a solve
back, and a player never sees it.

Distinct from a **known fight**: a library fight records how a solve went, not that the game was seen to play it that
way. It becomes a known fight only once the maintainer has won it live on its oracle line and promotes it, and the
library never adds to the known fights on its own.

## Solve start

What one solve in the **fight library** started from: a fight's first turn, or a mid-fight re-solve kept under the turn
it started at, held with the **oracle line** that solve found as one pair. A repeat solve from the same turn replaces
the pair, so an oracle line never sits beside a start it was not solved from.

## Statistics entry

One line per solve in a fight's statistics file: what the solve ran under, how it ended, and the solver's report of how
it went where it got that far. Every entry is read against a baseline schema, and a line that doesn't read is named and
skipped, never counted.

## Setting set

A named choice of the oracle's search settings: its budget, turn limit, discrepancy search and beams. A benchmark run
solves the **fight library**'s fights again under one or more setting sets, once for each **solve start**. Each of
those solves appends a **statistics entry** marked with its set's name, so the tally counts it apart from live solves
and from the other sets. A live solve runs under no setting set.

## Game read

A name our code takes from the game: a field or method it reads off a game object, a phase's name, a storage key, a
module the harness imports, a table it reads by shape. Every game read is registered with where the game defines it,
so a new **game version** that renames or drops one is caught before the pin moves, not by a card that goes quiet.

A **mirror** is a game read written down by hand: a constant of ours that copies game data (a biome's links, a tier's
cut, a title option's index) and goes stale without a word when the game changes it. A **game set** is one of the
game's lists that we switch on (its UI modes, phases, challenges), whose members we know; a member the game adds is one
we have not handled yet.

## Preview

What the **run seed** already decides about something the run has not reached yet, read out ahead of time: a **wave** ahead, the rewards a reroll the player hasn't paid for would bring, or the three mons behind Safari Zone's fee. A preview is a read: it never advances the game or the run's own sequence of rolls.

The last two are the same shape — what an unpaid purchase would buy — and it is what makes the price a real decision rather than a sum of money.

Each field of a preview carries its own **confidence**, and all of them are conditional on the run not changing first: a catch, an evolution, a shop pick or a biome change re-rolls what a preview was read from.

Not to be confused with a **tier**, which throughout is the game's own word for a rarity band (an encounter's, a species').

## Team audit

The **coach**'s check of how the **party** is built, as opposed to what to do with it now: the part of a **card** that
judges the team the decisions made rather than the decision at hand. It is said between waves, where a reward, a TM or
a relearned move can still fix it. Party checks read the **party profile** (a weakness nobody resists, the types
nothing hits) plus each member's moveset and level (dead move slots, members left behind) and the **weakest member**,
the first to replace; roster checks read the next big fight's foes from a **preview** (who outspeeds them, a foe with
a single **answer**). A finding either loses fights or only costs tempo, and the card leads with the first kind.

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
turn — the **fight plan** contributes a price to it and never overrides it. The one exception is an **oracle line**
that still holds, which makes the call in its place.

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

An **oracle line** that still holds stands in for the plan.

## Boss-fight plan

The **coach**'s written record of one boss fight — a gym leader, an Elite Four member, a champion, a rival or an
evil-team leader — kept outside the session so that a new session, or a retry of the same fight through Continue,
picks it up where the last one left it. The **card** is the live view of the fight; the boss-fight plan holds what
spans turns: the call and what it rests on, the phases each ending in a check the player can read off the battle, the
inputs to get right, what to do off the plan, and the principles behind them.

Without an **oracle line** it is the **fight plan** written out across turns, never a second opinion: its call is the
fight plan's own verdict made conditional, and a call the coach knows is wrong is fixed in the card rather than
overridden in the plan. With one, the oracle line is its plan.

A boss fight is named by who the trainer is, not by the wave: every tenth wave is a boss wave, and a boss is any foe
behind **boss bars**, but only those five trainers make a boss fight.

Distinct from the **fight plan**, which is the card's own read of the battle and lives only on the card.

## Turn score

The single currency every number the **coach** weighs is denominated in: turns of ours. A move is worth the turns it
saves; a mon of ours lost is worth the turns its absence costs; chip damage laid down for a foe still on the bench is
worth the turns of ours it spares later. One currency is what lets a turn's mechanics, a **fight plan**'s price and the
cost of losing a mon be added up at all.

What removing a foe is worth has its own entry: the **removal price**.

In a single battle a duel carries two prices of ours. The chance our mon falls first is charged at a **mon lost**, 4
turns, where a foe of theirs falling first is credited at 1. The HP the duel costs the mon fighting it is charged at 1
turn a whole bar, measured from its HP before any entry hit. A double charges neither per slot: its joint value already
prices our HP and our losses through the foes' danger.

A quantity in some other unit — a bare probability, a fraction of a health bar — cannot be compared with one in turns,
however reasonable each looks alone; summing them silently picks an exchange rate nobody chose. So a weight the coach
carries is stated in turns before it is given a number, and one whose unit is unclear is a bug waiting rather than a
value to tune.

## Mon lost

What losing one of our mons costs, in **turn score**: 4 turns of ours. The same price covers a duel our mon loses in a
single battle and a partner our own spread move knocks out in a double. It pairs with the price of a foe's whole bar
left to the rest of the team, also 4.

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

The **coach**'s look at a battle while the game waits on the player's decision (a command, a free switch or a faint replacement). Every damage number, enemy move, enemy switch and Terastallization the coach shows then comes from the game's own code, as the battle stands. The enemy's move is the game's own decision rather than a guess at it, and carries a **confidence**: **exact**, except where a command of ours draws first and so decides which move the enemy picks, where it is a **replay** of that command. Outside a decision the game can't be asked, so the coach falls back to numbers worked out from the type chart alone. When the game's own code can't be asked *at* a decision, the coach says why and withholds the turn read rather than advising from an **estimate** — the fight, the team's plan and what lies ahead go quiet together. A **card** built from a turn read is held like any card until the next decision. A mon sent in mid-turn redraws it from the type chart alone: the enemy has already chosen, and asking the game again would replay a choice already made.

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

In a double, the switch-in that is the mon the **other** slot is withdrawing this same turn: both slots' benches name the same party index, the game resolves the two switches one after the other, and so the later send-in is the mon the earlier switch has already pulled. The card says *returns from the other slot* where an ordinary switch-in *switches*, because the usual wording, read while the player watches that mon leave the other slot, looks like a broken overlay. A return is also the one switch-in that the coach sees still carrying stat stages it is about to lose — it is on the field as the coach reads it, and a switch-in's summon data is reset when it lands — so the turn read and the fight plan both price it at base stages.

## Hypothesis

The battle as it would stand one move from now: our stat stages after a Swords Dance, a foe paralysed by Thunder Wave, or a foe turned pure Water by Soak. The coach asks the game's own code about it as if it were so, and a hypothesis is never played out: the battle is left exactly as it was. A foe predicted to Terastallize this turn is read the same way, but only for how hard hits land, never for what the foe decides, since it picks its move before it Terastallizes. Our own Tera is the mirror: every hit lands at its type, while this turn's foe still picks against the typing before it.

## Combatant

A pokémon as a duel is scored: its stats at a level, its types, its ability and passive, the moves it can use, the
**boss bars** it stands behind and the health it has left. Most of what the coach weighs is not a pokémon on the field
— a standard threat, a stand-in for a newcomer, a foe in a **preview**, a **party** member at the level, and in the
form, it will reach by the next big fight, a **fusion** the player hasn't committed — so each is built into a
combatant first, and the duel never learns which kind it was handed. What is known of a live member is kept: its IVs,
its nature, its moves, its ability, its passive and the stat investment it has been fed. What is unknown is neutral,
never favourable. The one thing a member can lose on the way is what belongs to the species rather than to it: a
member judged in the form it evolves into (see **Level projection**) brings the evolved species' base stats, typing,
passive and ability — the last at the member's own ability index, which an evolution keeps — and leaves its own
base-stat row behind, so the investment it has been fed does not reach the form it will be. A
combatant is built off the field and carries base stat stages, even where the member behind it is standing on raised
ones. A foe in a preview is the one built from no species at all — a preview holds plain data, never a game object —
so its stat row is handed over whole rather than computed, and the row is what the duel then scores it by. A fusion is
the one combatant built out of two: the base half's level, IVs, nature, moves and passive, the other
half's ability, and half of every base stat off each half's species — so the investment either half has been fed is
left behind, the game folding a fusion's base stats out of the species' own.

## Level projection

The level a **party** member, or a would-be newcomer, stands at by the time the run reaches the next big fight: the
waves between it and now come off the **run calendar**, and each of them is worth an EXP a model supplies rather than
the game. What the projection does read off the run is how the EXP is split — a mon that fights a wave takes a
participant's share, a mon on the bench only the share EXP. All hands it — along with a Lucky Egg, a Golden Egg and
Pokérus, and the **level cap**, which no projection ever passes: a member already at the cap gains nothing, and the
share it would have taken is lost rather than passed to the members below it. A mon whose place in the fighting is not
stated is projected on the bench share alone, in keeping with a **combatant**'s unknowns being neutral, never
favourable. A projection is always an *estimate*, and that is what it carries into the judgment that reads it.

The projection also answers which *species* the mon stands as at that fight, since a level is what carries a line
forward: an evolution counts only where it can be read to land by then, and otherwise the mon is scored as it is, a
distant final form inflating nobody's worth. What lands is an evolution whose level is above where the mon stands now
and at or below the projected one. What does not: a level the mon is already past, since a member standing past its own
evolution level has not evolved for a reason the coach cannot see; one waiting on an item, which has to be drawn, and
luck is not counted; one carrying a condition, refused on purpose, because a condition reads the mon as it stands now
where the question is whether it holds at the fight; and any at all on a member whose evolutions the player has paused.

## Level cap

The highest level a pokémon in a run can be given EXP towards. It is a function of the wave alone, rounded up to its
decade, and it is about the level of that decade's boss; Daily runs sit well above Classic's. A Rare Candy is the only
way past it.

## Stand-in

A would-be newcomer with no pokémon behind it — a species the player could catch in a biome they might pick, a trade
offer — judged as the **combatant** the game would hand them if they took it: the level a wild spawn joins at on this
wave, which is most of the way to the **level cap** but not at it, the last four level-up moves its learnset hands out
at that level, the species' default ability, no passive, and neutral IVs and nature. A stand-in is judged exactly as a
live catch is, and its answer is marked an *estimate*, because none of the five is the mon the player would actually
be handed. The **moveset prior** is deliberately not the moves: a competitive set is nothing like what a wild spawn
turns up knowing, and a biome sold on one would promise a catch that does not exist.
