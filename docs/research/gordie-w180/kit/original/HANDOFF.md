# Handoff — play PokéRogue wave 180 (Gordie) for the user

**Goal of the next session:** the user wants Claude to *play* the Gordie trainer fight (wave 180, classic run)
instead of coaching it. Win it if possible. Play to the plan below, re-reading state every turn.

## Blocker to resolve first: which browser

- The run is live in the user's **Orion** tab (pokerogue.net). The previous session only *read* it, through
  AppleScript `do JavaScript` (Develop → *Allow JavaScript from Apple Events* is on).
- The `play-pokerogue` skill's MCP tools (`press`, `select_option`, `read_menu`, …) drive **only the coachemon
  server's own Chrome** (CDP on port 9222, profile `~/.coachemon/chrome-profile`). They cannot press keys in Orion.
- So before acting, ask the user (via `AskUserQuestion`) how to proceed. The likely path is for the user to close the
  Orion tab, then open the same account in the MCP Chrome and continue the saved session there. That only works if
  PokéRogue resumes mid-wave from the save, so check after loading that you're back at wave 180, turn 1, at the
  command menu. The user logs in by hand; never type credentials.
- Remind the user to switch Orion's *Allow JavaScript from Apple Events* back off if Orion is no longer needed.

## State at handoff (wave 180, turn 1, CommandPhase, sandstorm up)

Raw snapshots in this folder: `b.json` (the `read.sh battle` output) and `card.json` (`window.__coachHud.card()`).
Re-read fresh before acting; they're from turn 1.

- **Party (all L174, full HP):** Reshiram (on field; Dragon Pulse 4 PP, Blue Flare 3 PP; Leftovers ×2, Sitrus ×2
  and many berries), Leavanny (Leaf Storm, Bug Bite, Pollen Puff, Helping Hand), Snorlax (Body Slam, Belly Drum,
  Sleep Talk, Rest), Gyarados (**Intimidate**; Hydro Pump, Hurricane, Bounce, Twister), Golbat (Toxic, Mean Look,
  Venoshock, Poison Fang), Probopass (Earth Power, Zap Cannon, Power Gem, Tri Attack).
- **Gordie (all Rock types):** Gigalith L169 (on field; Sand Stream, Explosion, Rock Slide, Body Press, Spiky
  Shield), Carracosta L169 (Solid Rock), **Tyranitar L169** (Sand Stream; Stone Edge 5 PP, Crunch, Earthquake,
  Taunt; Sitrus, Enigma, Lansat, Ganlon and Leppa Berries), Stonjourner L172 (Accelerock priority), Barbaracle L172
  (Sniper), Coalossal L179 (Flame Body, Burn Up).
- After this: W181 wild, full heal entering W181, then **Elite Four Crispin at W182** (Fire team, 2 health bars).

## Analysis already done (engine numbers, via the game's `getAttackDamage`, simulated)

- The HUD's own plan says **likely lost**: Tyranitar can KO all 6 and ends at ~28% after the HUD's greedy line
  (see the `plan` group in `card.json` for its 11 steps).
- Key damage (max roll, % of target max HP, sand up):
  - Tyranitar Stone Edge one-shots Reshiram (116%), Leavanny (151%), Gyarados (138%) and Golbat (175%).
    Its Earthquake does 134% to Probopass. At −1 Atk (after Intimidate): Reshiram 77%, Gyarados 92%, Snorlax 38%.
  - Into Tyranitar: Leaf Storm 52.5% (26.7% at −2 SpA), Bug Bite 38%, Dragon Pulse 37.8%, Hydro Pump 35.9%,
    Earth Power 27.6%, Snorlax Body Slam 18% (72% at +6).
  - One-shots: Dragon Pulse → Stonjourner (121%); Leaf Storm → Carracosta (114%), Barbaracle (128%) and
    Stonjourner (168%); Hydro Pump → Stonjourner (114%). Coalossal is a two-hit KO for Hydro Pump (61%).
- **Golbat's Toxic has `ToxicAccuracyAttr`**, so it never misses from a Poison type, and Golbat (372 Speed)
  outspeeds Tyranitar (270).
- Tyranitar endgame Monte Carlo (`mc2.py`; assumes Tyranitar comes last, always picks Stone Edge, no crits):

  | Still alive when Tyranitar arrives | Win |
  |---|---|
  | Leavanny 53%, Reshiram 42%, Gyarados 32% (the HUD's line) | ~23% |
  | Golbat, Leavanny 53%, Reshiram 42% | ~41% |
  | Golbat, Gyarados 32%, Reshiram 42% | ~35% |

- Ruled out: Snorlax Belly Drum. It drops to ~15% before it can attack, even into an Intimidated Tyranitar.

## The plan to play

1. Turn 1: **Reshiram Dragon Pulse → Gigalith** (the HUD's call). Watch for Gigalith Explosion.
2. Follow the HUD's plan through the early foes: Probopass and Snorlax are the mons given up so others come in
   free (Probopass on Carracosta, Snorlax as fodder so Gyarados comes in free on Coalossal). Leavanny comes in free
   for one-shot Leaf Storms on Carracosta, Barbaracle and Stonjourner. Reshiram handles Stonjourner if it shows.
3. **Never spend Golbat before Tyranitar is out.** When something faints with Tyranitar on the field, send Golbat
   in for free and use **Toxic** first. Mean Look/Venoshock only if Stone Edge misses.
4. Then Gyarados (Intimidate on entry) and Hydro Pump. Leavanny uses **Bug Bite** on Tyranitar, not a dropped
   Leaf Storm. Reshiram uses Dragon Pulse.
5. Gordie picks send-ins by matchup, so the order will drift. Re-read every turn and re-plan against what is out.
   Trainer battles give no free "Will you switch?" prompt; only a faint gives a free switch.

## Tools from the previous session (in this folder)

- `evalorion.sh '<js expr>'` runs a JS expression in the Orion pokerogue tab's page world and prints
  `JSON.stringify` of the result. Read-only use only.
- `matrix2.js` builds the damage matrix both ways plus −1/−2 Atk variants, mutes the phase queue and restores
  RNG, abilitiesApplied, turnData and stat stages (the same discipline as the HUD's `sandbox`, `scripts/hud/01-core.js`).
  Run with `./evalorion.sh "$(cat matrix2.js)"`. For Chrome, adapt it to `evaluate_script` or the CDP path in `read.sh`.
- `mc2.py` is the endgame Monte Carlo (`python3 mc2.py`).
- HUD and read scripts: `~/.claude/plugins/cache/coachemon/coachemon/1.11.1/skills/coachemon/scripts/`
  (`read.sh <chrome|orion> battle|hud`, `watch.mjs`). The HUD is already injected in the Orion tab.

## Suggested skills

- `coachemon:play-pokerogue`: required; it's how to drive the fight through the coachemon MCP tools.
- `coachemon:coachemon`: for `read.sh`, the HUD card format and the fight-plan semantics, used as the per-turn
  advisor while playing.
