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

Settledness is not readable from the phase system — `PhaseManager` has no running flag, and queue depth is non-empty while the player sits at the command menu. It is readable from the UI: `ui.overlayActive` is the game's own input-blocked flag, `handler.active` plus the per-handler gates (`blockInput` / `transitioning` / `pendingPrompt`) cover the menus, and the three handlers that animate before accepting input (MESSAGE, EVOLUTION_SCENE, MODIFIER_SELECT) gate on `awaitingActionInput` — which is never reset on consumption, so the predicate must pair it with `onActionInput != null`.

Recommended: poll a ~1200-char read-only expression every **100 ms**, require **2 consecutive settled samples** with an identical progress fingerprint, and use **two** timeouts — **20 s no-progress** (sized against the ~13 s `EvolutionPhase` chain, which barely shrinks at Turbo because of its `fixedInt` legs) and **90 s hard** (the per-wave `saveAll` server call has no timeout at all).

Traps found: `isTextAnimationInProgress()` is permanently true after the first message; tween count is useless (6 infinite tweens run on an idle screen); an active tutorial looks settled but accepts only ACTION/CANCEL; a failed save silently resets the run to a perfectly settled title screen.

Predicate, poll/timeout reasoning, source citations and the full list of known-wrong cases: `.scratch/pokerogue-mcp-v1/research/02-settled-game.md`. Read against `main @ e4e9b53` (1.12.0.11) with a `beta` drift check; the predicate is live-verified on the pre-login page only — the in-battle branches are source-derived and are the first thing ticket 05 should re-check.
