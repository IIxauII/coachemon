# Solving a fight on the seed is an opt-in plugin feature, never the extension's

The **oracle** stops being dev-only. Once the player turns it on, the coach plugin may play a trainer fight forward on
the run's own seed and hand back an **oracle line** that wins it. It runs only on the player's own machine, in a clone of
the game pinned to the live **game version**, and never in the extension or the tab. The extension's **card** does not
change what it is. It is still a seed-exact read of the **decision** in front of the player. While a line is running it
also checks the line's checkpoints.

## Why

**The precedent.** The card already reads the seed. A **preview** reads waves ahead, a reroll the player hasn't paid
for, and the mons behind Safari Zone's fee. The **turn read** gives the enemy's move at **exact** or **replay**. The
project has already decided that knowing what the seed holds is coaching, not cheating.

**The step.** Searching the seed for a win is a different act from reading it. It plays the fight forward, so the
coach knows how the fight ends as well as what the next roll is. The game already lets a player take this step by
hand. The session is saved at wave start, and Continue replays the same battle seed, so a lost fight can be retried
with the same rolls. The oracle runs those retries off screen. What changes is how much effort the step costs, not
what the player is allowed to know.

**What the card can't do without it.** On Gordie W180 the turn read was engine-exact: 213 of 213 enemy moves, 27 of 27
swaps and 89 of 89 one-hit KOs. Followed from T1, the card still loses. Its verdict matched its own line's outcome at
only 9 of 22 points. Only a rollout found that T7 was the deciding turn, that a position was winnable at all, and
which plays the card has no words for (#638). The eight HUD gaps shipping from #640 close named gaps. They do not tell
the player which decision matters. On Ivy W145 the card alone won, but only on the third try.

**Why opt-in.** A solved line is something to follow, not to understand. Left on by default, every boss would turn
into a walkthrough, and the overlay is meant to coach (`README.md`). By default the coach teaches. Solving is a
standing setting in the plugin that the player turns on. While it is on, the coach offers a line for each trainer
fight. A player who has turned it on has already decided to hand fights over, so being asked again every fight would
only get in the way.

**Not in a Daily.** A Daily's seed is shared by every player and ranked on a leaderboard, so a solved line there could
be passed to all of them. Reading the seed is still fine: the card runs in full in a Daily, previews included. Solving
is not offered there.

**Why in the plugin.** That is the only place it can run without breaking something (#635):

- **The live tab.** Every fork there plays on screen. It also writes achievements and `gameStats`, and on a lost line
  it clears the run on the server.
- **A hosted runner.** It contradicts `PRIVACY.md`.
- **A local clone.** The plugin sets one up per game version: about 10 s, about 0.6 GB, and one 4 KB asset in place of
  815 MB. It boots in about 8 s, and a 19-turn line takes about 4 s.

## Considered options

- **Keep it dev-only, as `CONTEXT.md` says today.** The oracle grades the card, and what it finds becomes card fixes.
  #640 did this for eight gaps. This is the cheaper option: nothing to maintain per game version, no new store command,
  no background jobs. Rejected because the deciding turn and winnability are exactly what card fixes can't reach
  (#638). It is still the right call if the maintenance below turns out to be the binding cost.
- **Run it in the extension:**
  - **A module Web Worker loading the served game again.** It needs a per-build port of about 5,200 lines of harness to
    minified exports, plus a DOM shim and a stubbed server API, for every game release.
  - **A hidden same-origin frame.** It has the same port cost, and it shares the site's `localStorage` and cookies, so
    one missed stub writes to the real account.

  Rejected for both. Extension-only players keep the card.
- **Run it in the live tab.** Rejected: forks play on screen, write account state, and clear the run on a loss (#635).
- **Run it on a hosted runner.** Rejected: `PRIVACY.md` says nothing is sent to any server, and a hosted runner also
  carries an AGPL §13 source offer.
- **Run it for every boss by default.** Rejected: it turns coaching into a walkthrough, and it costs a setup that a
  player who never wants it shouldn't pay.
- **Ask per fight instead of a standing setting.** Rejected: once a player has turned solving on, asking again on every
  fight is only friction.

## Consequences

- **A new read command.** It returns the session export and the wave-start save, and it means a store release of the
  extension. The data goes to the plugin over the local hub, as game state already does. `PRIVACY.md` should name it.
- **A version lock.** A solve runs only where the session's `gameVersion` equals the clone's. It also needs that
  version's harness test to have replayed a known fight. The harness test pins the version, not the clone: 14 upstream
  commits touched `test/framework/` in 2026. Each game release costs a re-check before solves answer again. Until
  then, the coach says "no answer".
- **A solve is a background job.** A search outgrows the 60 s MCP call limit. A line costs about 4 s, or about 40 s
  with the card read every turn. Each line runs in its own process, because a second reload after a loss throws.
- **Trust is earned before anything is shown.** A line is shown only after the replay protocol's steps 1–5 pass (#636).
  Otherwise the coach says "no answer". It also refuses in these cases:
  - a version mismatch;
  - an item dropped on load;
  - a Mystery Encounter battle;
  - a double, until doubles are supported;
  - Safeguard up mid-fight;
  - a Daily run.
- **A line claims replay at most, never exact.** The player's own inputs sit between the claim and every later turn.
  One checkpoint miss voids the rest of the line for the run.
- **Estimate gets a mark.** On the card, `≈` marks an **estimate**, as #639 drew it. The biome card's `≈` for "close"
  stays as it is: the two mean nearly the same thing, so one mark serves both.
- **The line leads the card while it holds.** The **turn line** stops being the card's only authority: while every
  checkpoint has matched, the oracle line's step is the call (#639). Once the game leaves the line, the turn line leads
  again, and the coach re-solves from there.
- **A mid-fight solve needs about ten live fields the save lacks:** the turn, each foe's team index, the boss bars and
  the global RNG state (#636). That is a second read, and it can follow the first. A coach that joins at T1 doesn't
  need it.
- **The journal widens.** Each checkpoint is scored as a claim and journalled, not only Mystery Encounter outcomes.
- **Extension-only players get no solving.** A Web Worker that loads the served game a second time is not pursued.
- **The dev keeps the same harness.** It also serves as the fight plan's grader (#638). The encounter oracle is
  unchanged.
