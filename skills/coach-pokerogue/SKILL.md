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

1. **HUD** — `scripts/read.sh <browser> hud` draws a panel in the game tab's top-left corner and refreshes every second with no Claude involved. Source is `scripts/hud/*.js`, bundled by `hud-bundle.mjs`; behaviour is pinned by `node scripts/test/run.mjs`. `hud-off` removes it. Header buttons switch **full** / **mini** / **closed**.
   - **Engine.** Damage, move choice and switching come from the game's own code, per `references/game-code.md`:
     - damage via `getAttackDamage` (simulated), covering items, abilities, multi-hit, boss bars, rolls, crits, accuracy, Sturdy / Focus Band and berries;
     - the enemy AI's move-choice algorithm, reproduced as a probability per move and target;
     - the EnemyCommandPhase switch rule.
     Game calls run only in the command phase, inside `sandbox` (queue muted; RNG, abilitiesApplied and turnData restored), cached per turn. `window.__coachHud.stats()` reports sandbox restore mismatches (should stay 0) and refresh cost. Outside the command phase it falls back to a type-chart estimate.
   - **Battle card.**
     - ⚔ who should be out and what each slot does, with `now:` / `next:` when a switch uses the turn.
     - ⇄ switches: kept to failing fields, never into a KO on entry or before acting; *optional* when merely better; "no safe switch-in" otherwise.
     - ⇆ predicted enemy switches aim the plan at the switch-in, with a dim ↺ *if it stays*.
     - ◎ focus / ⋔ split targeting in doubles.
     - 💀 / ⚠ danger tags, including next turn's.
     - Each foe row: weaknesses, walls, trap abilities, its likely move (↯ with %), and the pick against it.
   - **Free switches.** The "Will you switch?" prompt (encounter start, "Switch" battle style, wild/mystery encounters only) and replacing a fainted mon cost no hit and no turn: the card shows `⇄ free switch? X → Y` or `stay`. Mid-turn switches (U-turn, Eject Button) and every trainer-battle switch cost the turn.
   - **🎯 Catch card** (wild): catch chance per ball from the game's capture formula, and a catch / maybe / skip verdict. It weighs account value (new species, hidden ability, shiny), team value (covers weaknesses, beats the weakest member, who it would replace) and ending a dangerous encounter early. It picks the cheapest ball that works, and saves Rogue/Master balls for valuable catches.
   - **♟ Fight plan** (trainers): the enemy win condition, who to reserve for it, sacrifices for free switch-ins, step order, and a "likely lost" warning.
   - **🎓 Learn-move card:** new move vs current four as effective power, with reasons and a learn / forget / skip verdict.
   - **🛒 Rewards card:** buys for current needs (revive, heal, potion, ether) first, then the free reward by rarity tier and need, and a reroll hint.
   - Your brief still covers what the panel can't judge: setup lines, long-term team building, and anything the user asks.
2. **Watcher** — start `node scripts/watch.mjs <browser>` with the `Monitor` tool (`timeout_ms` 1800000; re-arm when it expires). It prints one short summary line per event and re-injects the HUD after a page reload:
   - `NEW BATTLE w<wave> <double|single> <trainer|wild> | <foes>`
   - `LEARN MOVE w<wave> <pokémon> wants <move> | has: <moves>`
   - `REWARDS w<wave> money $<n> reroll $<n> | free: … | shop: …` (again after a reroll)
   - `COACH ERROR <msg>`, once per distinct failure. Report it rather than staying silent.

Lines are summaries, because notifications truncate long ones. Run `read.sh <browser> battle` for detail: the snapshot has `learn` (pokémon + new move) and `rewards` (free / shop items with description and cost, reroll cost) when those screens are up.

Reply to each event with a brief of a few lines. Only go deeper if the user asks.

- **Battle:** enemy team weak / strong against, send-in order, one move per matchup, and any ability trap from the rules below. Wild waves often end before the brief lands, so lead with the move.
- **Learn move:** learn or skip, and which move to forget. Weigh what the HUD can't: coverage the party loses (dropping the only Dark move), setup and status value, recoil, accuracy, spread moves in doubles.
- **Rewards:** what to buy, then which free reward to take. Consider party HP and PP, items already held (`items`), and money. Say whether a reroll is worth it. Buy shop items **before** taking the free reward: taking it ends the screen. Don't quote item effects from memory; use `desc`.

## Rules learned the hard way

- **Never quote a starter cost from memory.** PokéRogue costs differ from intuition (Bunnelby 3, Lechonk 2, Popplio 4). No `cost` in the read → ask the user to open the starter grid, or say costs are unverified.
- **Abilities come from the read, not the species' best ability.** Hidden abilities (Huge Power, Gale Wings, Protean…) are only in play if `hiddenAbility` is true / the battle read shows them.
- **Check every enemy ability for traps** before recommending a move: Dry Skin / Water Absorb / Volt Absorb / Flash Fire / Sap Sipper / Levitate (immunity or heal), Fluffy (halves contact), Simple (doubled stat stages), Guts (don't status it), Sturdy, Intimidate.
- Prefer special moves into Defense boosts, physical into Special Defense boosts; read `statStages` (7 entries: atk, def, spa, spd, spe, acc, eva — no HP slot).
- Compare Speed stats to say who moves first. Priority moves (Quick Attack, Fake Out) go before that.
- Flag danger unprompted: an on-field ally at low HP, a status condition, a move about to run out of PP.

## Answer shape

Lead with the move (or pick). Then a short per-opponent plan: what to click, why (type, ability, stat), what to watch for. Tables for starter picks. Keep it scannable — the user is mid-battle.
