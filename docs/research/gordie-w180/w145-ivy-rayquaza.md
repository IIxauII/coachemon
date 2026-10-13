# W145 rival fight — Ivy's Rayquaza

Classic run, wave 145, singles, played on Orion with the coach live (skill `coachemon:coachemon`, plugin 1.11.1). Lost
twice, won on the third try. Logged on 2026-10-09 from the reads the coach took during the fight.

What this log knows comes from `read.sh orion battle` snapshots and the per-turn watcher, which logged a line when the
game reached the command menu, the party screen or the rewards screen. Turns between those snapshots weren't seen. Where
a step is inferred rather than read it says so. Damage figures marked *est.* are hand-worked from the damage formula,
not the engine. Only figures quoted from the panel (`· 1 hit`, `danger: ko`) come from the game's own code.

## The two teams

### Ours (L129–130)

| Mon | Types | Ability | Key stats | Moves | Held |
|---|---|---|---|---|---|
| Raichu L130 | Electric/Psychic | Surge Surfer | SpA 313, **Spe 387** | Thunderbolt, Beat Up, Psychic, Moonblast | Focus Band, Magnet, Soothe Bell, Lansat/Salac/Ganlon/Sitrus, Zinc ×2, Carbos ×2, Calcium |
| Crawdaunt | Water/Dark | Hyper Cutter | Atk 353, SpD 159, Spe 155 | Crabhammer, Close Combat, Crunch, Night Slash | four berries, no attack item |
| Tentacruel | Water/Poison | Liquid Ooze | SpA 193, SpD 340, Spe 265 | Hydro Pump, Surf, Poison Jab, Sludge Wave | Lum Berry |
| Breloom | Grass/Fighting | Effect Spore | Atk 414, Spe 220 | **Spore**, Sky Uppercut, Seed Bomb, Drain Punch | Hard Stone, Silk Scarf |
| Mega Dragonite | Dragon/Flying | **Multiscale**, passive **Aerilate** | Atk 390, **SpA 461**, Spe 299 | Extreme Speed, Hyper Voice, Hyper Beam, Dragon Hammer | Dragoninite, Leppa, Protein |
| Quaquaval | Water/Fighting | Torrent | Atk 332, Spe 233 | Liquidation, Aqua Step, Close Combat, Mega Kick | Mystic Water, Silk Scarf ×2, Wide Lens, Calcium |

### Ivy's (L125–129)

| Mon | Notes |
|---|---|
| Torterra L129 | **Boss, 2 bars.** Grass/Ground, passive Thick Fat. Wood Hammer, Earthquake, Stone Axe, **Shell Smash**. Lum ×2, Miracle Seed, Hard Stone |
| Pidgeot L127 | Spe 313. Hurricane, Double-Edge, Endure, Heat Wave. Salac ×2 |
| Alakazam L125 | SpA 438, Spe 355. Psychic, Aura Sphere, Nasty Plot, Curse |
| Tauros L125 | Fighting/Fire, Intimidate, Atk 392. Raging Bull, Close Combat, Outrage, Focus Energy |
| Kingdra L127 | Water/Dragon. Hydro Pump, Dragon Pulse, **Ice Beam**, Agility. Sitrus ×2 |
| **Rayquaza L129** | **Boss, 3 bars.** Dragon/Flying, Air Lock, passive Unnerve. **Atk 428, Spe 319.** Outrage, Fly, Scary Face, Dragon Dance. **Sitrus, Enigma, Lum**, Sharp Beak |

## Battle log

### Attempt 1: lost

The coach joined at turn 10. Turns 1–9 weren't seen.

- **T10:** Dragonite, Crawdaunt, Quaquaval and Breloom were already down. Only Kingdra was down on Ivy's side. Rayquaza
  was at 286/429 with 2 of 3 bars left, and Torterra, Pidgeot, Alakazam and Tauros were all at full HP. Raichu and
  Tentacruel were left.
- **Lost** shortly after: two of ours against five of Ivy's. The game restarted the wave.

### Attempt 2: lost on Pidgeot, after beating Rayquaza

| Turn | What happened |
|---|---|
| T1 | Raichu vs Torterra. Switched to **Dragonite**; Earthquake can't touch it. |
| T2–3 | Ivy switched Torterra → **Kingdra** (the panel predicted it). Dragonite's attack hit Kingdra and Kingdra fell, but its Ice Beam (4×) broke Multiscale. *Inferred from T4.* |
| T4 | **Dragonite 169/420 vs a fresh Rayquaza.** Rayquaza is faster (319 vs 303) and Outrage KOs. Extreme Speed (priority) took one bar → 286. Dragonite fainted. |
| T5 | Raichu came in free. Ivy switched Rayquaza → Torterra, so Raichu's Moonblast hit Torterra instead (436 → 304, not a bar). |
| T6 | Raichu → **Breloom** (resists all of Torterra's moves). |
| T7–8 | Ivy brought Rayquaza back. **Spore landed**, and Rayquaza fell asleep with its Lum Berry already gone. Breloom 231/338. |
| T8–10 | Breloom used Drain Punch into a sleeping Rayquaza. Fighting is resisted by Flying, so only ~80 damage got through over the whole sleep (286 → 206). |
| T11–13 | Rayquaza woke. Raichu's **Moonblast** broke the second bar, but Moonblast is super-effective, so the **Enigma Berry** healed 25% → 250 HP on the last bar. Raichu fainted. |
| T13–14 | Crawdaunt in → fainted without acting. Tentacruel in → fainted without acting. Rayquaza still at 250, now locked into Outrage. |
| T15–17 | Quaquaval survived one hit and landed one attack → Rayquaza 67. Quaquaval fainted. |
| T18–19 | Breloom came in free and Drain Punch finished **Rayquaza**. Breloom was left at 64/346. |
| T20 | Breloom vs Pidgeot (faster, Flying 4× on Breloom). **Lost.** |

### Attempt 3: won

| Turn | What happened |
|---|---|
| T1 | Same as before: Raichu → Dragonite. |
| T2–3 | Ivy switched to Kingdra again. The coach called Dragon Hammer, which has no recharge. Dragonite was still at 169/420 on T4, so either the same move was used again or Kingdra lived to Ice Beam. *Not seen.* |
| T4 | Dragonite 169 vs a full Rayquaza. The coach called Extreme Speed. **Dragonite was switched out instead** and kept 169 HP. |
| T4–8 | Quaquaval fainted. Rayquaza went to 305/429 with 2 bars left. Its **Lum and Sitrus were used up**, and the Enigma was still held. *Not seen.* |
| T9–13 | Breloom (93 HP) came in. Then, on the panel's sacrifice chain, **Crawdaunt and Tentacruel each came in and fainted without doing damage**. |
| T14–15 | Breloom back in at 93 HP. Spore didn't land; Breloom fainted. |
| T15 | **Raichu: Thunderbolt.** Electric is neutral on Dragon/Flying, so the Enigma Berry didn't trigger. Second bar broken → 143. Raichu survived the reply: its Ganlon (+1 Def), Salac (+1 Spe) and Sitrus were spent and it was left at 91 HP. |
| T16–17 | **Dragonite: Extreme Speed** (priority, neutral, no Enigma) → **Rayquaza down.** |
| T17–18 | Dragonite vs Torterra (436, 2 bars). Panel: **Hyper Voice · 1 hit.** Aerilate-boosted super-effective Hyper Voice did enough to break both bars at once. **Torterra down.** |
| T18–21 | Alakazam and Tauros fell. Dragonite fainted along the way; Raichu took Tauros's Intimidate (−1 Atk). |
| T21 | **Raichu: Thunderbolt → Pidgeot**, one hit, faster. **Won**, with Raichu alone at 55/356. |

## Why it was so hard

### 1. Rayquaza outspeeds and one-shots almost everything you have

Rayquaza's Outrage (120 power, STAB) from 428 Atk:

| Our mon | Speed vs 319 | Survives +0 Outrage? (*est.*) |
|---|---|---|
| Raichu | **faster** (387) | no (~437 vs 336 HP) |
| Mega Dragonite | slower (299) | **only at full HP** (Multiscale halves it to ~281) |
| Tentacruel | slower | no (~431 vs 384) |
| Quaquaval | slower | barely (~297–350 vs 369) |
| Breloom | slower | no (~339 vs 327); Fly is 4× |
| Crawdaunt | slower | no (~346 vs 318) |

Only one mon outspeeds it (Raichu), and only one takes a hit and stays healthy (Dragonite, and only once). Every other
member either can't hurt it or dies before acting. That is why Crawdaunt and Tentacruel fainted without doing damage
in both attempts.

### 2. Nobody hits it hard super-effectively

Rayquaza is weak to Ice 4×, and to Rock, Dragon and Fairy 2×. Your answers to that:

- **Ice:** none on the team. That was the single biggest gap. Even a non-STAB Ice Beam would have done ~2× Moonblast.
- **Rock:** none, though Breloom holds a Hard Stone.
- **Dragon:** Dragonite's Dragon Hammer, but Dragonite is slower, so it only lands when Rayquaza doesn't attack first.
- **Fairy:** Raichu's Moonblast, which isn't STAB and comes off a modest 313 SpA. It also triggers the Enigma Berry.

Two of your three Fighting attackers (Breloom, Quaquaval) are walled to half damage by its Flying type, and all three
Water types are resisted by its Dragon type. Half the team's offence was resisted.

### 3. Boss bars multiply the number of hits it takes

A boss bar caps a hit at the bar's edge unless the hit overflows by at least twice a bar's HP. Rayquaza's bars are
143 HP each, so your ~200-damage hits broke one bar each. That makes three separate hits against a mon that KOs in one.
Each bar break also gave Ivy's berries a turn to work: Sitrus on one, **Enigma +107 HP** on a super-effective hit.

Compare Torterra: Dragonite's Hyper Voice (Aerilate, STAB, 2×, 461 SpA) overflowed both bars in one hit. That's
what a real answer looks like against a boss. Nothing on the team did that to Rayquaza.

### 4. Three Water types, three slow physical attackers

Crawdaunt, Tentacruel and Quaquaval share a type, and with Breloom that's four of six below 270 Speed. Against
Ivy's team (Alakazam 355, Rayquaza 319, Pidgeot 313) they always moved second.

- **Tentacruel** has 193 SpA and four special-ish attacks. It contributes nothing offensively. Its value is SpD 340,
  but it has no utility move to cash that in: no Haze, Toxic Spikes, Rapid Spin or Knock Off.
- **Crawdaunt** has two Dark moves (Crunch, Night Slash), 159 SpD and 155 Speed. It's a glass cannon that's too slow to fire.

### 5. Held items that do nothing

| Mon | Dead item | Why |
|---|---|---|
| Breloom | Hard Stone | no Rock move |
| Breloom | Silk Scarf | no Normal move |
| Quaquaval | Calcium | SpA booster on a physical attacker |
| Quaquaval | Silk Scarf ×2 | boosts only Mega Kick (75% accurate) |
| Raichu | Soothe Bell | friendship only |
| Crawdaunt | nothing that boosts damage | |

Raichu's berry pile is what actually won attempt 3 (Ganlon, Salac and Sitrus let it survive Rayquaza), so that part is
well-placed.

### 6. What actually beat it

The winning formula, worth remembering for the next legendary boss:

1. **Strip its items first.** Spore made it use the Lum; an early hit used the Sitrus.
2. **Break bars with neutral hits when it holds an Enigma Berry.** Thunderbolt instead of Moonblast saved ~107 HP.
3. **Finish with priority.** Extreme Speed hits before Outrage.
4. **Keep Multiscale intact for the mon that matters.** Both losses started with Kingdra's Ice Beam breaking it on turn 2–3.

## Decisions that cost the losses

- **Turn 2–3, both attempts:** Ivy's switch to Kingdra (Ice Beam 4×) broke Dragonite's Multiscale before Rayquaza came
  in. Dragonite at full HP vs Rayquaza takes two bars, not one. Possible fixes: attack Kingdra with Dragon Hammer
  (super-effective, no recharge), or go into Kingdra with Raichu or a Water type rather than spend Dragonite there.
- **Sleep turns spent on resisted hits (attempt 2):** Breloom Drain-Punched a sleeping Rayquaza for ~80 total over the
  sleep. A free switch to Raichu or Quaquaval during the sleep would have broken a bar per turn instead.
- **Sacrificing mons that can't act:** Crawdaunt and Tentacruel were thrown in to get free switches. A sacrifice only pays
  if the mon it brings in does something, and here the mon coming in was usually the next sacrifice.
- **Moonblast into the Enigma Berry (attempt 2):** turned a 143-HP last bar into 250.

## What to change before W150 and beyond

- **Get an Ice move.** An Ice TM covers Dragons, Flyings and Ground types like Torterra and Garchomp. Crawdaunt can
  learn Ice Beam / Blizzard. Who else can isn't verified here; the rewards card judges a TM on every member the game says
  can learn it, so trust its `→ recipient` line. Raichu's Beat Up is its weakest slot if a fitting move turns up.
- **Replace one Water type.** Tentacruel is the weakest link. A **Steel or Fairy** type with real Speed would resist
  Outrage and hit back.
- **Move the dead held items.** Hard Stone and Silk Scarf on Breloom do nothing. A Leftovers or a Choice item would.
- **Speed control.** Only Raichu is fast. A Thunder Wave, Icy Wind or Tailwind user, or a priority attacker other than
  Dragonite, would stop every legendary from moving first.
- **Level gap:** the panel's road group says W150's boss is +3 levels on you and only Raichu hits it super-effectively.
  Check its roster on the next rewards screen before spending money.

## Coach and panel findings

Notes for the coachemon dev, from watching the panel during the fight:

1. **Outside the command phase the plan is misleading.** At the intro the fallback type-chart estimate said
   `likely lost · nobody KOs Torterra 1-on-1`. In the command phase the engine said `winnable` and `Hyper Voice → Torterra · 1 hit`.
   The fallback doesn't seem to count Aerilate's type change or the boss-bar overflow. Worth marking a fallback plan as
   such, or not drawing a verdict at all until the engine runs.
2. **Panel picked a move that never lands.** T4 (attempts 2 and 3): `Mega Dragonite Dragon Hammer → Rayquaza · 2 hits`
   with `danger: Dragonite ← Rayquaza Outrage, level ko`. Rayquaza is faster and KOs, so Dragon Hammer never fires.
   Extreme Speed (priority) breaks a bar first and is strictly better. The planner should discount a move by the
   chance its user acts at all.
3. **Close calls on accuracy.** T15 (attempt 2): `Quaquaval Mega Kick → Rayquaza · 2 hits` over Close Combat, which is
   also 2 hits and 100% accurate against Mega Kick's 75%.
4. **Sacrifice chains bring in mons that die without acting.** `sacrifice Breloom → Tentacruel in free, Tentacruel →
   Crawdaunt in free, Crawdaunt → Raichu in free` spent two members for no damage. A sacrifice step could require the
   member coming in to act before it's KO'd.
5. **The planner didn't weigh the Enigma Berry.** Moonblast was the panel's call into a Rayquaza holding an Enigma
   Berry (super-effective → +25% HP). Thunderbolt (neutral) was the better hit.
6. **Audit gap: dead held items.** The rewards card's team audit doesn't flag a type booster with no move of its
   type (Hard Stone, Silk Scarf on Breloom) or a stat booster on the wrong side (Calcium on Quaquaval).
7. **Coach-side:** the skill's watcher (`watch.mjs`) only emits on battle start, danger, learn and rewards, not per
   turn. A live-guidance session needed a hand-rolled per-turn poller, and the first one silently swallowed a Python
   error and missed turns 1–10 of attempt 1. A per-turn mode for `watch.mjs` would cover this.
