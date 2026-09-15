---
name: coach-pokerogue
description: Coach the user through their own PokéRogue game without touching the controls — read the live tab (Chrome or Orion) and recommend starters, moves, switches, or a plan against a trainer. Use when the user is playing themselves and asks what to pick, what to do against their opponent, or how to beat a trainer/boss.
---

# Coaching PokéRogue

The user holds the controller. You read the game and advise. **Never press, select, or start anything** — no `press`, `select_option`, `start_run`. If the user wants you to drive, that is `play-pokerogue`.

## Reading the game

`scripts/read.sh <chrome|orion> <battle|starters>` prints one JSON snapshot. It injects `scripts/probe.js` into the page and reads the result back off the DOM; the probe is read-only.

- **Which browser:** ask if unclear. Chrome = the MCP server's tab on debug port 9222. Orion = the user's own browser.
- **Orion** needs Develop → *Allow JavaScript from Apple Events*. If the script errors saying so, stop and ask the user to enable it. Security: that toggle lets any local script run JS in every Orion tab — remind them to turn it off when done.
- **Read fresh before every recommendation.** The user keeps playing between messages; a snapshot from two turns ago is stale.
- `error` in the JSON → report it; don't guess the state.

`battle` gives wave, double, trainer, money, `uiMode`, party and enemy (level, HP, types, ability, passive, stats, stat stages, status, on-field, boss, moves with type/power/category/PP remaining) and held items. `enemy` lists the trainer's **whole** party, not just the lead — plan for all of them.

`starters` gives unlocked species by national dex id with IV total, passive/hidden-ability unlock, egg moves, cost reduction and candy. `cost` is only filled while the user is on the starter grid; otherwise it is `null`.

## Always-on coaching

When the user wants the coach running for the whole session ("keep coaching", "watch my run"), start both layers:

1. **HUD** — `scripts/read.sh <browser> hud` draws a panel in the top-left corner of the game tab, built from the game's own sprites (Pokémon icons, type badges, move categories). Each live foe gets its weaknesses, hard walls (×0 / ×¼, counting immunity abilities), trap abilities, and the party member + move to use against it. The header shows the send-in order. It refreshes every second with no Claude involved. Header buttons switch between **full**, **mini** (one line per foe) and **closed** (a small 🎯 tab); the last view is remembered in the page's localStorage. `hud-off` removes it. It is a type-chart heuristic — it knows nothing about Sturdy, Guts or setup moves, which is what your brief is for.
2. **Watcher** — start `node scripts/watch.mjs <browser>` with the `Monitor` tool (`timeout_ms` 1800000; re-arm when it expires). It prints `NEW BATTLE <battle JSON>` once per new battle and re-injects the HUD after a page reload. It prints `COACH ERROR <msg>` once per distinct failure, so report that line rather than staying silent.

On each `NEW BATTLE`, reply with a brief built from that JSON; no extra read is needed. Keep it to a few lines: enemy team weak / strong against, send-in order, one move per matchup, and any ability trap from the rules below. Only go deeper if the user asks.

## Rules learned the hard way

- **Never quote a starter cost from memory.** PokéRogue costs differ from intuition (Bunnelby 3, Lechonk 2, Popplio 4). No `cost` in the read → ask the user to open the starter grid, or say costs are unverified.
- **Abilities come from the read, not the species' best ability.** Hidden abilities (Huge Power, Gale Wings, Protean…) are only in play if `hiddenAbility` is true / the battle read shows them.
- **Check every enemy ability for traps** before recommending a move: Dry Skin / Water Absorb / Volt Absorb / Flash Fire / Sap Sipper / Levitate (immunity or heal), Fluffy (halves contact), Simple (doubled stat stages), Guts (don't status it), Sturdy, Intimidate.
- Prefer special moves into Defense boosts, physical into Special Defense boosts; read `statStages` (7 entries: atk, def, spa, spd, spe, acc, eva — no HP slot).
- Compare Speed stats to say who moves first. Priority moves (Quick Attack, Fake Out) go before that.
- Flag danger unprompted: an on-field ally at low HP, a status condition, a move about to run out of PP.

## Answer shape

Lead with the move (or pick). Then a short per-opponent plan: what to click, why (type, ability, stat), what to watch for. Tables for starter picks. Keep it scannable — the user is mid-battle.
