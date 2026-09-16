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
   - **Easy wild waves collapse to one line**, in either view: `🎯 W12 ⚔ Charizard Heat Wave → Rattata · 1 hit [+] [×]` (one ⚔ per slot in doubles). Easy = wild, no boss, no 💀/⚠ tag, no switch or missing safe switch, every slot KOs in 1–2 hits, no catch worth a ball. Anything else expands on its own; a view button the user presses holds for the rest of the wave.
   - **Battle card.**
     - ⚔ who should be out and what each slot does (`2 hits` to KO: more likely than not by then, from the damage rolls rather than the average), with `now:` / `next:` when a switch uses the turn, and `then X` when this turn's move sets up a different follow-up (Fake Out, then the attack).
     - **Status moves** (single battles): setup, a status on the foe, a heal or a hazard can be this turn's move when the turns after it win the fight faster or more surely than attacking, e.g. `Swords Dance +2 Atk · then Leaf Blade`, `Spore → Machamp sleep · then Seed Bomb`, `Stealth Rock 4 to come` (the trainer's mons still to come). The note carries the chance it works when below 100 % (accuracy, a likely Protect). Doubles still get only Protect and Helping Hand.
     - A foe's own setup counts: its expected boosts make its later hits harder, our hits into it weaker, and a Dragon Dance can take the Speed order. This turn's hit counts only as often as the foe doesn't Protect, and Primordial weather or Psychic Terrain stopping a move leaves it out.
     - The planner is exact for this turn and the next; past that it races KO odds on expected play. Near-equal options lean to the move the mon used last turn, and a mon that just came in isn't switched straight back out without a real gain.
     - ⇄ switches: kept to failing fields, never into a KO on entry or before acting; *optional* when merely better; "no safe switch" otherwise.
     - ⇆ predicted enemy switches aim the plan at the switch-in, with a dim ↺ *if it stays*.
     - ◎ focus targeting in doubles (a split shows in the ⚔ targets).
     - 💀 / ⚠ danger tags with the hit's % of current HP, including next turn's.
     - Each foe row (full view): trap abilities only, ▲ weaknesses / ✕ walls among the types the party has moves of, ↯ its likely move into our mon, and ➜ a pick only for foes no slot is on yet. Trainers add "foes weak to:".
     - **Mini**: one line per slot, with ⚠ the trap ability its move runs into; the fight plan as one line.
   - **Free switches.** The "Will you switch?" prompt (encounter start, "Switch" battle style, wild/mystery encounters only) and replacing a fainted mon cost no hit and no turn: the card shows `⇄ free switch? X → Y` or `stay`. Mid-turn switches (U-turn, Eject Button) and every trainer-battle switch cost the turn.
   - **🎯 Catch card** (wild): catch chance per ball from the game's capture formula, and a catch / maybe verdict — shown only when a catch is worth it, silent otherwise. It weighs account value (new species or form, hidden ability, shiny, a big IV gain on a line on the team), team value (covers weaknesses, clearly outclasses the weakest member, who it would replace; nothing for a line already on the team) and ending an encounter that would cost a party member. It picks the cheapest ball that works, and saves Rogue/Master balls for valuable catches. A fused mon is judged by both halves (averaged base stats, a shiny on either half), and "lower its HP" names a move that won't KO it (False Swipe first) or warns when every attack can.
   - **♟ Fight plan** (trainers): one line `♟ winnable · N steps [+]` for a plain win; opens by itself on "likely lost", a sacrifice or a mon to reserve — the enemy win condition, who to reserve for it, sacrifices for free switch-ins, step order and warnings. A step whose ending is closer to a coin flip than a given shows its odds (`KO (62%)`). The trainer's next mon is predicted from the game's own send-in score at the HP the plan has reached; a tie there is the game's coin flip, so a plan can name either. Steps are marked approximate (`~`) in doubles.
   - **🎓 Learn-move card:** new move vs current four as effective power (`power 96`, `3rd Water move`), with reasons and a learn / forget / skip verdict (a skip names the slot it lost to, ↔). Full view adds Atk / SpA and a `team:` line (SE types gained / lost, ⚠ losing the team's only move of a type). Mini shows the move to forget and only that ⚠.
     - **Status moves are scored on the same scale as attacks**, so Roost or Nasty Plot gets a real verdict and a dead slot (Growl, Howl on a special attacker, Helping Hand in a single battle) is offered as the move to forget. The number covers recovery, setup, disruption (Taunt, Encore), inflicted status scaled by accuracy, and a foe's stat drops — worth far less than the same boost on us. `your call` is left for the few moves nothing recognises.
     - **Moveset prior:** a bundled [pkmn/randbats](https://pkmn.cc/randbats) snapshot (`hud/05-randbats.js`, regenerated at release by `npm run randbats:gen`) notes a move that shows up on the species' competitive sets — `set move (Bulky Attacker)`, or `, evolved` when the sets belong to what it grows into. It nudges a score by 6–20%, most when the move completes the role the moveset already plays. It is never a veto: a move nobody runs still wins when the numbers say so.
     - Atk is the number the mon actually attacks with, so Huge Power is doubled in it; an -ate ability's type change (Pixilate's Fairy Hyper Voice) drives STAB and coverage, and a move whose type the card can't pin down (Weather Ball) claims neither.
   - **🛒 Rewards card:** buys for current needs (revive, heal, potion, ether) first ("buy first" only when there are buys), then the free reward by what it does for the party, and a reroll hint; `👑 boss next` when the next wave is a big fight (a boss wave, a fixed battle or a gym leader — the ⚑ card's calendar, not just `wave % 10`). Through a **gauntlet** — more than one big fight before the next full heal, which is what waves 181–190 are — the hurt threshold rises to 90 % and a spare revive or heal is worth holding rather than passing over.
     - **TMs** are judged with the learn card's own decision, on every member the game says can learn the move (and doesn't know it yet): the recipient gaining the most, the move it replaces (`→ forget X`, `free slot`, or `setup +1 SpA` for a setup move it suits) and the power gained. A TM that's no upgrade for anyone, or that nobody can learn, reads `skip` and ranks below other rewards.
   - `window.__coachHud.summary()` is the panel's verdict in plain text; the battle read carries it as `hud`.
   - **🗺 Biome card** (the next-biome choice a Map offers): ranks each biome for the party with a score and ★ pick / ≈ close. Spawns come from the game's own biome pools (tier odds, time of day of the next ten waves, the boss wave as one in ten, species taken at the party's level): ✓/✗ who's weak, who resists, how many mons hit them SE, and a 🎯 catch that covers a weakness, outclasses the weakest member or is new. Full view adds the type mix, the species met most and where the biome leads (★ rare: Space, Fairy Cave, Laboratory). The pools are read from the game's loaded modules a moment after the HUD starts; until then the card only lists the options. Trainers and gym leaders aren't judged.
   - **🎭 Mystery Encounter card** (the encounter's option screen): every option with what it really does for this
     party, and ★ take / · ok / ✗ avoid; – for an option the party can't pick, with what it needs. Full view adds a
     line per option: ⚔ the battle it starts (with the foe's level against yours and who hits it super-effectively),
     the mon the game will use, and why. Built from the pinned source (`46-encounter.js`, `references/game-code.md`
     §13), never from the wiki.
     - **Judged:** the twelve common encounters — Mysterious Chest, Fight or Flight, Department Store Sale, Shady
       Vitamin Dealer, Lost at Sea, Fiery Fallout, The Strong Stuff, Berries Abound, Part-Timer, Teleporting Hijinks,
       Uncommon Breed, Global Trade System. Every other encounter shows its options, who qualifies and what they cost,
       marked "not judged".
     - **🔮 = fixed by the run seed.** An option's first rolls are forked from the seed, so the card can say what
       *will* happen, not just the odds: whether the chest is a trap, the store's item rolls, where the teleport
       lands, who Fiery Fallout burns (and whose ability it overwrites), the vitamin dealer's new nature. Like the 🔮
       next-wave card, treat it as the coach's own read: say it where it changes the decision.
     - Money is spent only while it leaves three waves' worth of reward money; a fight is "hard" 5+ levels over your
       best mon, or when nothing hits it super-effectively at your level. Both are first cuts.
   - **🔮 Next wave** (on the rewards and battle cards): what the run seed has already decided about the wave ahead —
     wild / trainer / Mystery Encounter, which trainer and its party with levels, types, ability and moves, single or
     double, and boss bars. It replays the game's own wave generation in a seed fork (`48-preview.js`,
     `references/game-code.md` §11): a read, with the live RNG stream, `currentBattle` and `waveSeed` restored.
     **Only a fixed battle — a rival, evil team, gym leader or Elite Four wave, whose trainer is a table lookup — is
     exact end to end.** Anywhere else the wave's trainer is drawn on the stream, so the party under it is no surer
     than the trainer, however precisely each member is computed: fields are marked `~` (holds only while the game
     draws what the replay draws), `?` (a guess — the spawn pool shifts with the time of day) or `!` (this run has
     already proved it wrong). The card always closes with **"if nothing changes"**: a catch, an evolution, a shop
     pick or a biome change re-rolls what the preview was read from, marks or no marks. It scores itself against every
     wave on arrival: `window.__coachHud.preview()` prints hits and misses per field. Nothing is drawn if the live
     build has moved past the pin. Treat it as the coach's own read, not as something the user asked to be told —
     say it only where it changes a decision (what to buy, whether to heal, what to catch).
   - **⚑ Next big fight** (on the rewards and battle cards): the next wave that is a boss wave, a fixed battle
     (rival, evil team, Elite Four, champion), a gym leader or the run's final wave, how many waves out it is, and —
     once it is close — the exact roster from the same replay the 🔮 card uses, with a **ready / watch / risky**
     verdict: what nothing on the team hits super-effectively, the level gap, a type half the party is weak to, extra
     health bars. `49-ahead.js`, `references/game-code.md` §12; the schedule itself is arithmetic on the wave index,
     so it needs no roll and holds at any distance. It also carries what the calendar decides about **preparing**:
     the next full heal (entering every X1 — HP, status, PP, revives and Tera), how many big fights stand before it,
     the tiers a fixed battle's rewards are pinned to, and party **luck** with the tier-upgrade chance it buys
     (`4 / floor(512 / (luck + 4))` per reward — and nothing at all on a wave whose rewards are pinned).
   - **☠ Eternatus checklist** (classic, from ten waves out): read from the source, so it holds for every run —
     phase 1 can't be KO'd (damage is capped at 1 HP, so the fight always reaches Eternamax), Eternamax carries a
     Mini Black Hole that **steals one held item per turn** and turns the fight into a **double**, it knows Recover
     at −4 priority, phase 1's Cosmic Power raises its defences every use, and phase 1 itself has no held items and
     no passive. It names a mon carrying most of the party's held items, since that is what the thief eats first.
   - Your brief still covers what the panel can't judge: setup lines, long-term team building, and anything the user asks. The split is deliberate (after PokéChamp): the panel is exact for a turn or two and coarse beyond; you judge the long horizon — whether a reserve is worth holding, when a trade is worth it, what the rest of the run needs.
2. **Watcher** — start `node scripts/watch.mjs <browser>` with the `Monitor` tool (`timeout_ms` 1800000; re-arm when it expires). It prints one short summary line per event and re-injects the HUD after a page reload. Lines carry the HUD's verdict when it's running:
   - `NEW BATTLE w<wave> [double] <trainer|wild> · <easy|trainer|DANGER|catch|fight> | <foes> [💀 <our mon>]` — an easy wave lists only foe names and levels. `(resumed, turn N)` when the watcher started mid-battle.
   - `DANGER w<wave> <our mon> ← <foe> <move>` the first time a 💀 appears mid-battle, once per mon per wave.
   - `LEARN MOVE w<wave> <pokémon> wants <move> | has: <moves> | <pokémon> Atk<n>/SpA<n> | HUD: <verdict> [· ⚠ loses only <type> move]`
   - `REWARDS w<wave> money $<n> reroll $<n> | free: … | shop: … | HUD: take X [→ <TM recipient> (forget <move>)] · buy Y` (again after a reroll)
   - `COACH ERROR <msg>`, once per distinct failure. Report it rather than staying silent.
   - `BIOME w<wave> | HUD: <biome> <score> pick — <reasons> · <other biome> <score>` once per biome choice, only with the HUD running.
   - `ENCOUNTER w<wave> | HUD: <encounter>: take <option> — <outcome> · avoid <options>` once per Mystery Encounter, only with the HUD running (`your call` when no option stands out, `not judged` for an encounter the card doesn't know).

Lines are summaries, because notifications truncate long ones. Run `read.sh <browser> battle` for detail: the snapshot has `turn`, `hud` (the panel's `verdict`, `field` ⚔ text, `danger`, `learn`, `rewards`, `biome`, `encounter`: the Mystery Encounter call, `next`: the next-wave
preview in one line, with its marks in brackets, and `ahead`: the next big fight, its verdict and what makes it risky), `learn` (pokémon + new move) and `rewards` (free / shop items with description and cost, reroll cost) when those screens are up.

The panel already shows the decision; the user glances at it mid-battle. Speak only when you add something.

- **Easy wild wave:** no reply.
- **Catch:** one line — catch or not, and why, if you'd weigh it differently from the panel.
- **DANGER / boss:** 2–3 lines, move first: what to click, then the threat and the out (switch, sacrifice, heal).
- **Trainer:** send-in order and the win condition, ≤4 lines. Don't repeat the ⚔ line; add ability traps from the rules below and what the plan can't see.
- **Learn move:** reply only if the HUD verdict is "your call" or you disagree — coverage the party loses (dropping the only Dark move), setup and status value, recoil, accuracy, spread moves in doubles.
- **Rewards:** only what the HUD can't judge: held items (`items`), long-term team building, whether a reroll is worth it. Buy shop items **before** taking the free reward: taking it ends the screen. Don't quote item effects from memory; use `desc`.
- **Biome:** reply only to add what the card doesn't weigh: the gym leader or evil-team boss ahead, trainers, a rare biome two steps away, or a close call.
- **Mystery Encounter:** reply when the card says `not judged` or `your call` (read the options off the screenshot or the card and weigh them), or when the run's longer plan disagrees — a vitamin on the wrong mon, money the next boss shop needs, a biome detour before a gym.

## Rules learned the hard way

- **Never quote a starter cost from memory.** PokéRogue costs differ from intuition (Bunnelby 3, Lechonk 2, Popplio 4). No `cost` in the read → ask the user to open the starter grid, or say costs are unverified.
- **Abilities come from the read, not the species' best ability.** Hidden abilities (Huge Power, Gale Wings, Protean…) are only in play if `hiddenAbility` is true / the battle read shows them.
- **Check every enemy ability for traps** before recommending a move: Dry Skin / Water Absorb / Volt Absorb / Flash Fire / Sap Sipper / Levitate (immunity or heal), Soundproof / Bulletproof / Wind Rider / Overcoat (move-flag immunity), Fluffy (halves contact), Simple (doubled stat stages), Guts (don't status it), Sturdy, Intimidate.
- Prefer special moves into Defense boosts, physical into Special Defense boosts; read `statStages` (7 entries: atk, def, spa, spd, spe, acc, eva — no HP slot).
- Compare Speed stats to say who moves first. Priority moves (Quick Attack, Fake Out) go before that.
- Flag danger unprompted: an on-field ally at low HP, a status condition, a move about to run out of PP.

## Answer shape

Lead with the move (or pick). Then a short per-opponent plan: what to click, why (type, ability, stat), what to watch for. Tables for starter picks. Keep it scannable — the user is mid-battle.
