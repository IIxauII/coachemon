# Solving a trainer fight

With **solving** on, the coach solves every trainer fight unasked, for an **oracle line**: the inputs, turn by turn,
that the oracle has played to a win on the battle's own seed. Once the panel holds the oracle line, the card leads with
it. The solve is a plugin **job**, run through the MCP tools named below, whatever the coach's own reads go through.

## Steps

1. **Start** at the fight's first command, the watcher's `NEW BATTLE` line naming a trainer rather than `wild`. A solve
   plays the fight from the save the game wrote at the start of the wave, so its oracle line starts at turn 1, and a
   fight the coach joins past turn 1 waits for the next trainer. Call `start_job` with `kind: "solve"` and no `args`:
   it reads the fight off the tab itself. Done when you hold the job's `job` and `end_file`, or a `no_answer` refusal,
   which goes to step 5.
2. **Wait on its end**: arm a `Monitor` on `until [ -e <end_file> ]; do sleep 10; done; cat <end_file>`, with
   `timeout_ms` 1800000, armed again while `poll_job` still reads `running` when it expires. Its one line is the cue
   for step 4. Done when the Monitor is armed.
3. **Tell the player once**, in two lines: the fight is being solved, for minutes on a fast machine and up to about
   forty on a laptop; and the oracle line plays from turn 1, so it takes the card over only while the fight still
   stands at its first turn. They choose: wait at this command for it, or play on with the card, which coaches with its
   own call meanwhile. Later in the fight, whenever you reply for another reason, add `poll_job`'s progress line as it
   is. Done when the player has the two lines.
4. **When the end file appears**, `read_job` the job and act on how it ended:
   - **An oracle line** (`result.kind` is `oracle_line`): call `hand_oracle_line` with the job's id at once.
     - `held: true`: tell the player in one line that the card now leads with the oracle line, as its `plan` group
       says (`~ oracle line wins in 19 turns · 4 of 6 left`), and name the luck it rides from `result.oracleLine.luck`,
       if any. The strip's ⚔ is now the oracle line's step (`⚔ ~ T1/19 · …`).
     - `moved_on`: the fight left its first turn before the oracle line came, so the line no longer holds. Say so in
       one line; the card carries the fight.
     - `held: false` with `no-hud`: start the panel and hand it again. With `other-fight`: the tab is on another fight,
       and the oracle line is done with.
   - **No answer** (`result.kind` is `no_answer`): step 5, with its `message`.
   - **Failed**: one line saying the solve broke, with its `failure`; the card carries the fight.
   - **Cancelled**: a newer fight's solve replaced it, and there is nothing to say.

   Done when the panel holds the oracle line and the player knows, or the player knows why there is none.
5. **No answer** is the oracle declining to give a line it can't trust. It says nothing about whether the fight can
   be won: the card and its fight plan carry the fight from there, and the player plays on. It comes two ways:
   - **At once, from `start_job`, with no job started**, for a fight solving can't take: a Daily, whose seed every
     player shares; a live game version other than the one solving is pinned to, or one its harness hasn't been
     re-checked on; a Mystery Encounter battle; a double; Safeguard up mid-fight; an item the clone would drop on load;
     or a plugin reading the game over CDP rather than the hub.
   - **As a finished solve's answer**, when no search found a win that replayed from the save, or the harness couldn't
     load the fight as the game has it.

   Its message names the cause and ends "The card still coaches.": relay it as given, in one line. A cause that holds
   for the whole run or session (a Daily, the game version, the hub) is said once, at the first fight it stops. Done
   when the player has heard the cause once.
