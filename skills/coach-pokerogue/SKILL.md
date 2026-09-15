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

1. **HUD** — `scripts/read.sh <browser> hud` draws a panel in the top-left corner of the game tab, built from the game's own sprites (Pokémon icons, type badges, move categories). Each live foe gets its weaknesses, hard walls (×0 / ×¼, counting immunity abilities), trap abilities, and the party member + move to use against it. The header shows the send-in order. A **field** section on top says who should be out and what each slot does: ⚔ `pokémon → move → target` (or `→ both` for a spread move in doubles), and ⇄ the switches to get there. Doubles try every pair of healthy party members with every per-slot option, scored by turns to KO against how fast the worse foe KOs them plus speed, with a bonus for covering both foes. It keeps the current field and gives each member its best move unless that field is failing (a member with nothing that damages, a member that loses its trade) or a switch is clearly better; a merely better field shows as a dim *optional* switch. A voluntary switch-in is scored after taking the incoming hit and losing a turn; one that would be KO'd coming in is never recommended, and the card says when no switch-in is safe. Enemy damage is estimated pessimistically (+15%, common attack abilities). Against trainers it predicts enemy switches with a replica of the game's own rule (switch when the best benched mon's matchup score × (1 − 0.1^(1/enemySwitchCounter)) ≥ the active mon's × 3, or × 2 for bosses): ⇆ *likely switch* aims the plan at the switch-in (the switching mon doesn't attack that turn), with a dim ↺ *if it stays* line; ⇆ *may switch* marks near-misses. Pokémon on the field (and ones being switched out) carry a danger tag with the threatening move's type: 💀 the worst foe's best move takes their current HP before they can act (faster, or priority), ⚠ it can KO but they act first, or a super-effective hit takes half their current HP or more. On a learn-move prompt it switches to a 🎓 card: the new move and the current four, each scored as effective power: power × accuracy × STAB × attack-stat fit, ×1.2 for type coverage no other move gives, ×0.8 for a third move of one type, ×0.67 recoil, ×0.5 charging or recharge, ×1.15 spread moves in doubles. The reasons show on each row, and a verdict — *learn → forget X*, *skip*, or *your call* for status moves it can't score. On the rewards screen it shows a 🛒 card: what to buy, cheapest item that covers each need (fainted → revive, status → heal, under 60% HP → potion, a move at ≤¼ PP → ether/elixir), then which free reward to take. Free rewards are ranked by the game's rarity tier, adjusted for current needs, Poké Ball stock, vouchers (kept past the run) and short-lived X items / lures, with a reroll hint when nothing is worth taking. It refreshes every second with no Claude involved. Header buttons switch between **full**, **mini** (one line per foe) and **closed** (a small 🎯 tab); the last view is remembered in the page's localStorage. `hud-off` removes it. It is a type-chart heuristic — it knows nothing about Sturdy, Guts or setup moves, which is what your brief is for.
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
