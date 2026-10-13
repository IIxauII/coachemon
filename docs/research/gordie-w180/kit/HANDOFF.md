# Handoff: retry Gym Leader Gordie (wave 180), attempt 2

**Goal of the next session:** build a new fight plan from this log and the original plan, then play the
retry for the user through the coachemon MCP tools (`coachemon:play-pokerogue`). Attempt 1 was **lost**.

## Where the game is

- Run lives in the **coachemon Chrome** (CDP 9222, profile `~/.coachemon/chrome-profile`), not Orion. Logged in.
- Attempt 1 ended at the game-over screen. The tab then went back to TITLE; **Continue** reloads **wave 180,
  turn 1** with a full team (verified). The tab was left at the turn-1 COMMAND menu with nothing pressed.
  If it's back on TITLE, press Continue.
- Same state as attempt 1, so the opening is reproducible. Unknown whether the battle RNG seed is identical.
- Active party-wide boosts: **X Defense** (5 battles), **Dire Hit** (4 battles, +1 crit stage → 1/8).
- Money 18,315. The shop is irrelevant until after the fight. W181 brings a full heal (HP, PP, revives, Tera),
  then **Elite Four Crispin at W182** (Fire team, 2 bars).

## Files here

- `gordie-teams.json`: both teams at W180 turn 1 (stats, moves, items, abilities, tera types).
- `original/`: the first handoff (`HANDOFF.md`, HUD card `card.json`, Monte Carlo `mc2.py`, Orion tools).
  **Its numbers are stale:** they predate the Elixir, X Defense, Dire Hit, Sitrus on Gyarados and Rare Candy.
- `cdp.mjs`: `node cdp.mjs '<js expr>'` evaluates in the Chrome pokerogue tab (awaits promises).
- `mx.js`: engine damage matrix (game's own `getAttackDamage`, simulated, RNG/state restored), with output
  `"normal/crit"` as % of target max HP, **max roll**. Knobs set in the same expression:
  `globalThis.__MX_FOES=['Coalossal']` (default: active foe), `globalThis.__MX_TERA=['Coalossal']` (simulate
  that enemy Terastallized). Run: `node cdp.mjs "globalThis.__MX_FOES=[...]; $(cat mx.js)"`.
- The HUD panel is live in Chrome: `read_card` gives the per-turn card and plan.

## Teams (W180 turn 1)

Gordie (sandstorm from Gigalith/Tyranitar; Rock types take no sand damage, get ×1.5 SpD in sand):

| Foe | Lv | HP | Spe | Ability | Moves | Key items |
|---|---|---|---|---|---|---|
| Gigalith | 169 | 525 | 131 | Sand Stream | Rock Slide, Explosion, Spiky Shield, Body Press | Sitrus ×2, Starf ×2, Apicot |
| Carracosta | 169 | 467 | 180 | Solid Rock | Rock Slide, Brine, Curse, Iron Defense | **Enigma**, Ganlon, Starf, Liechi, Petaya |
| Tyranitar | 169 | 569 | 270 | Sand Stream | Crunch, Stone Edge, Earthquake, Taunt | **Sitrus, Enigma**, Ganlon, Lansat, Soft Sand |
| Stonjourner | 172 | 574 | 283 | Power Spot | Accelerock (priority), Stealth Rock, Earthquake, Body Slam | Sitrus, Lansat, Petaya, Lum, Leppa ×2 |
| Barbaracle | 172 | 460 | 285 | Sniper | Stone Edge, Razor Shell, Nature Power, Skull Bash | **Salac, Ganlon, Sitrus**, Lum |
| Coalossal | 179 | 711 | 184 | Flame Body | Burn Up, Stone Edge, Iron Defense, Body Press | **Salac**, Lum |

Ours: Reshiram (Spe 373; Dragon Pulse/Fickle Beam/Blue Flare/Hyper Voice; holds Leftovers ×2, **Enigma,
Sitrus**, Quick Claw, Wide Lens ×3, Lum ×2 and stat berries), Leavanny (413; Leaf Storm 5 PP, Bug Bite,
Pollen Puff, Helping Hand; Wide Lens), Snorlax (135; Body Slam, Belly Drum, Sleep Talk, Rest; Enigma),
Gyarados (299; Intimidate; Hydro Pump 8 PP, Hurricane, Bounce, Twister; Sitrus), Golbat (372; Toxic never
misses from a Poison type, Mean Look, Venoshock, Poison Fang), Probopass (159; Earth Power, Zap Cannon,
Power Gem, Tri Attack; Soft Sand).

**Tera Orb is owned. Untested in this fight; check the FIGHT screen for a Tera toggle and its charge.**
Our tera types: Reshiram Bug, Leavanny Bug, Snorlax Normal, **Gyarados Water** (drops the Flying ×2
weakness to Rock), **Golbat Poison** (same), Probopass Rock.

## Hard facts learned in attempt 1 (verified in game source or play)

1. **Coalossal Terastallizes to pure Rock on its first move** (`INSTANT_TERA`, team index 5,
   `trainer.ts shouldTera`). Its move is chosen *before* the Tera, so a Burn Up chosen that turn **fails**
   (`move.ts` Burn Up needs the user to be Fire type). That gives one free turn. After that the AI skips
   Burn Up and uses Stone Edge or Body Press.
   - Tera Rock Coalossal, max roll: Stone Edge → Leavanny 111%, Gyarados 101% (67% at −1 Atk), Reshiram 86%,
     Snorlax 42%, Probopass 21%; Body Press → Probopass 90%, Snorlax 45%.
   - Into Tera Rock Coalossal: fresh Leaf Storm ~45%, Dragon Pulse 32%, Hydro Pump 31%, Earth Power 24%,
     Body Slam 13%. 711 HP, so it took six of our turns and most of three mons' HP.
2. **Gordie's AI switches out of losing matchups.** Seen three times: Carracosta → Coalossal on Leavanny's
   Leaf Storm, Coalossal → Carracosta on Gyarados's Hydro Pump, Coalossal → Barbaracle on Reshiram's Dragon Pulse.
   The switch-in takes the hit. Plan around the switch, not the target.
3. **Carracosta's Enigma Berry** healed 25% after the first super-effective hit (Earth Power did ~10 HP net).
4. **Barbaracle's berries:** a crit Dragon Pulse left it under 25%. Sitrus, Ganlon (+1 Def) and **Salac
   (+1 Spe → 427, faster than all of ours)** then fired. Its Sniper Stone Edge then outsped and KO'd
   Reshiram at 53%. **One-shot Barbaracle** (fresh Leaf Storm 128%) or make sure the next hit KOs through Sitrus.
5. Gigalith uses **Explosion** at ~54% HP. Switching Probopass in on it cost only 16% (Normal ×¼).
6. AI move scoring rejects moves that will fail (`pokemon.ts getNextMove`, score −20). Brine doubles below
   50% HP and the AI accounts for it.
7. Reshiram's Enigma and Sitrus let it survive one Stone Edge from full HP. Leftovers ×2 heals 12.5% a turn.

## Turn log, attempt 1

| T | Our action | Result |
|---|---|---|
| 1 | Reshiram Dragon Pulse → Gigalith | Gigalith 525→282. Reshiram untouched. |
| 2 | Switch → Probopass | Gigalith **Explosion** into Probopass (427→359); Gigalith out. Carracosta in. |
| 3 | Probopass Earth Power | Carracosta 467→457 (**Enigma**). Brine: Probopass →270. |
| 4 | Switch → Leavanny | Brine + sand: Leavanny 497→412. |
| 5 | Leavanny Leaf Storm | **Gordie switched to Coalossal**; LS did 20% (711→568). Leavanny −2 SpA. |
| 6 | Leavanny Leaf Storm (−2) | Coalossal Tera Rock, **Burn Up failed**; Coalossal →419. |
| 7 | Switch → Probopass | Stone Edge: Probopass →190. |
| 8 | Switch → Gyarados | Body Press + sand: Gyarados 570→431. Intimidate. |
| 9 | Gyarados Hydro Pump | **Gordie switched to Carracosta**; it took the hit (457→350). |
| 10 | Switch → Probopass | Rock Slide: Probopass →141. |
| 11 | Probopass Earth Power | Brine first: **Probopass fainted**. Leavanny in free. |
| 12 | Leavanny Leaf Storm | **Carracosta fainted.** Coalossal back in. |
| 13 | Switch → Snorlax | Stone Edge + sand: Snorlax 824→450. |
| 14 | Snorlax Body Slam | Coalossal 419→341; Snorlax →241. |
| 15 | Snorlax Body Slam | Coalossal moved first: **Snorlax fainted**. Reshiram in free. |
| 16 | Reshiram Dragon Pulse | Coalossal 341→146; Stone Edge: Reshiram →268. |
| 17 | Reshiram Dragon Pulse | **Gordie switched to Barbaracle**; crit, then Sitrus/Ganlon/**Salac**: 129 HP, +1 Def/Spe. |
| 18 | Reshiram Dragon Pulse | Barbaracle outsped, Stone Edge: **Reshiram fainted**. Gyarados in free. |
| 19 | Gyarados Hydro Pump | Barbaracle 129→29; Stone Edge (−1): Gyarados →255. |
| 20 | Gyarados Hydro Pump | Barbaracle first: **Gyarados fainted**. Golbat in free. |
| 21 | Golbat Venoshock | **Barbaracle fainted.** Golbat →152. Tyranitar in. |
| 22 | Golbat Toxic | Tyranitar badly poisoned (→534); **Golbat fainted**. |
| 23 | Leavanny Leaf Storm | Tyranitar 534→262; Stone Edge: **Leavanny fainted. Loss.** |

At the end Gordie still had Tyranitar (46%, toxic), Stonjourner (100%, never seen) and Coalossal (20%).

## Mistakes to fix

- **T3:** Earth Power into an unknown item. Enigma ate it. Probopass's whole contribution was soaking hits.
- **T5:** Leaf Storm aimed at Carracosta. Gordie predictably switched, so a full-power Leaf Storm (the
  one-shot resource for Carracosta, Barbaracle and Stonjourner) did 20% to Coalossal, and Leavanny was stuck at −2.
- **T6 to T16:** Coalossal soaked ten of our turns. No plan accounted for its Tera.
- **T17/T18:** Reshiram stayed in after Barbaracle came in low. Salac made it faster and Sniper Stone Edge KO'd
  a 53% Reshiram. Reshiram should have left, or something faster with priority should have finished it.
- **Never used:** Tera, Mean Look (trapping blocks Gordie's switching), Golbat's Toxic on Coalossal,
  Belly Drum behind Intimidate, Helping Hand.

## Questions for the new plan

1. Is Tera available, and who gets it? Tera Water Gyarados neutralises Stone Edge and keeps the Hydro Pump STAB.
   Tera Poison Golbat survives Stone Edge and can Toxic and stall.
2. How do we use Coalossal's free first turn? Whoever is in when it arrives gets a free action or switch.
3. Golbat Mean Look stops the switching. Is trapping Coalossal or Tyranitar with Toxic ticking worth it?
4. Who answers Stonjourner? Reshiram Dragon Pulse 121% and Gyarados Hydro Pump 115% both one-shot it, but
   Accelerock is priority (31–48%).
5. Tyranitar is the win condition: Stone Edge one-shots Reshiram (96.5%), Leavanny, Gyarados and Golbat. It
   holds Sitrus + Enigma (+50% HP of healing). Only Toxic and big chained hits got through.

## Gotchas

- `read_card`'s plan does not model Gordie's switching or the enemy berries, and it labels Coalossal "Rock TERA"
  before it has Terastallized. Use it for rough damage numbers, not for the plan.
- The auto-mode classifier blocks reading the auth cookie and deleting localStorage keys. Neither is needed now.
- Chrome first loaded a stale wave-176 save from its own localStorage. The user said they had exited before
  saving, and we replayed waves 176–179. The wave-176 cache backup is at
  `~/.coachemon/sessionData3_xauyxau2.chrome-w176.bak` (no longer needed).
