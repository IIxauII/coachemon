# Detecting a settled game

Type: research
Status: resolved

## Question

Battles are asynchronous: animations, queued phases, message boxes. If the server returns state or accepts the next press mid-animation, it races the queue. The locked decision is to poll a cheap JS predicate after every action until the game is quiet — but the predicate is unknown.

Against the PokéRogue source and, where needed, a live browser session:

- What does `scene.phaseManager` expose? Is there a readable queue length, a current-phase name, or a "running" flag?
- Is there a signal that distinguishes *waiting for player input* (settled, safe to read and press) from *busy* (animating, resolving, playing a message)? The `ui` mode stack (`ui.mode`, `ui.modeChain`) and the active handler's state are candidates.
- Are there phases that legitimately sit idle for a long time without wanting input (e.g. a message box that auto-advances)? How would the predicate avoid returning early on those?
- What is a realistic upper bound for how long a single wave's slowest phase takes, so a settle timeout can be chosen?

Deliver a concrete JS predicate expression (evaluable via `Runtime.evaluate`) that returns whether the game is settled, plus a recommended poll interval and timeout, plus the known cases where it is wrong.

## Answer

Resolved on branch `research/settled-game` (commit `62d16d9`). Full findings, including the predicate, at `.scratch/pokerogue-mcp-v1/research/02-settled-game.md` on that branch. Gist is recorded in the map under Decisions so far.
