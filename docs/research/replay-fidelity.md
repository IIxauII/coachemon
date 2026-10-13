# How faithfully does the harness replay a live session beyond Gordie?

Ticket: [#636](https://github.com/IIxauII/coachemon/issues/636), on the map
[Map: seed-exact fight knowledge for the player](https://github.com/IIxauII/coachemon/issues/633). Background:
[Battle oracle: replay and solve a trainer fight in the pinned clone](https://github.com/IIxauII/coachemon/issues/632)
(its "Harness traps") and
[Where can a seed-exact rollout run for a player?](https://github.com/IIxauII/coachemon/issues/635)
(branch `research/rollout-location`).

**The question.** On Gordie, a T1 session export replayed HP for HP once three harness traps were fixed. Which parts
of a live session does `parseSessionData` + `reloadSession()` fail to carry into the harness? Can a fight be replayed
from a mid-fight export, or only from T1? And what **confidence** can a solved line honestly claim?

All sources were read and all probes were run on **2026-10-13**. Every claim carries one of three tags:

- **[verified]**: read in source, or run here.
- **[inference]**: follows from the sources, but was not run.
- **[unverified]**: plausible, but never tried.

| Source | Ref |
|---|---|
| This repo | `origin/master` @ `aca70ca` (v1.24.0) |
| Game pin | `.cache/pokerogue/v1.12.0.11`. Game paths below (`src/…`, `test/…`) are in that clone |
| Gordie kit | `research/gordie-w180`: `docs/research/gordie-w180/kit/sim/session-w180.json` (T1 export), `gordie-sim.test.ts`, `winning-line.sim.txt` |
| Probes | `docs/research/replay-fidelity/probe-a-e.test.ts`, `probe-f-h.test.ts` and their raw output, on this branch. Run in the shared clone as `test/tests/zz-636-de0c08*.test.ts` and removed again |
| Machine | Apple M4, Node 26.9.0, vitest via `npx pnpm@10.33.2 exec vitest run` |

---

## 1. Answer

- **At T1, the save carries everything the battle reads.** With the harness set up right, Gordie's export makes a
  clean round trip: load it, export again, and the only difference is one entry in Reshiram's `abilitiesApplied`
  (Turboblaze, re-applied on summon). IVs, natures, stats, HP, PP, held items, enemy items, weather, the battle seed
  and the Tera count all come back as they were. **[verified]** (probe B)
- **Two of Gordie's three traps are harness defaults, not save gaps.** The 31 IVs and neutral natures come from
  upstream's test helper, not the save. Turn three flags off before `startBattle` and the manual IV/nature patch is
  not needed (§3). **[verified]**
- **The real T1 gap is entry effects.** A T1 export taken with `getSessionSaveData()` already holds what the live
  summon did. The reload summons again, and then:
  - in a trainer fight, an entry effect that lands on our side is applied **twice** (an enemy Intimidate went −1 → −2);
  - in a wild fight, an entry effect we put on the foe is **lost**.

  Gordie matched only because nothing on entry touched our side. **The fix is to load the wave-start save, which is
  what the game's own Continue loads.** (§4) **[verified]**
- **Mystery Encounter battles don't reload as battles.** The reload goes back to the encounter's option screen (§7).
  **[verified]**
- **Mid-fight replay is possible, but not from the save alone.** Reloaded naively, a T5 Gordie export flips the
  fight: Coalossal never Terastallizes, and its Burn Up KOs Leavanny on the spot. Read about ten more fields live and
  put them back after the reload, and T5–T8 match HP for HP. Two of those fields, the battle turn and the enemy team
  index, each changed the outcome on their own (§5). The other route needs no new fields: replay the recorded inputs
  from the T1 save. **[verified]**
- **A solved line can claim `replay` at best, never `exact`.** Until a run has passed the validation protocol (§8),
  the honest answer is "no answer" (§9).

---

## 2. Field-by-field audit

Columns:

- **Saved?** is whether `getSessionSaveData` (`src/system/game-data.ts:882-909`) writes the field, through
  `PokemonData` (`src/system/pokemon-data.ts`), `PersistentModifierData` (`src/system/modifier-data.ts`) and
  `ArenaData` (`src/system/arena-data.ts`).
- **Back after reload?** is what `initSessionFromData` (`game-data.ts:999-1133`) and the Continue path leave in the
  scene.

| Area | Saved? | Back after reload? | Gap / note |
|---|---|---|---|
| IVs, nature, mint (`customPokemonData.nature`), stats | yes | yes, once the harness flags are off (§3) | `stats` are recomputed by `updateModifiers`, so the saved array is not what counts. **[verified]** |
| HP, PP (`ppUsed`/`ppUp`), status, sleep turns | yes | yes at T1 | A trainer reload runs `PostSummonPhase`, which resets the Toxic counter: saved 3 came back 0 (`src/phases/post-summon-phase.ts:18-20`). Mid-fight only. **[verified]** (probe D) |
| Fusions | yes (`fusionSpecies` … `fusionCustomPokemonData`) | yes | Leavanny ← Charizard came back as "Learizard", Bug/Flying, Blaze, fused stats. **[verified]** (D) |
| Passives | `passive` flag per mon | yes | Snorlax with `passive: true` had its passive. An enemy boss gets one through `isBoss()` (`src/field/pokemon.ts:2196-2236`). **[verified]** (D) |
| Ability overrides | `customPokemonData.ability/passive/types`, `summonData.ability/passiveAbility` | custom data yes; `summonData` only on our side | Ability and type overrides from custom data came back. The enemy's `summonData` (Skill Swap, Entrainment, Soak …) is wiped (row "summonData"). **[verified]** |
| Mystery-Encounter-modified mons | `customPokemonData` (`spriteScale`, `ability`, `passive`, `nature`, `types`), plus ME items as modifiers | yes | As above. `mysteryEncounterSaveData` comes back too. **[verified]** |
| Held items, enemy items, enemy buff tokens, X items, Dire Hit | yes | yes, once | Two traps. A second reload in one process stacks enemy items (§3). `toModifier` returns `null` for an unknown `typeId` or a throw, so an item can vanish silently (`modifier-data.ts:31-62`). **[verified]** |
| Weather, terrain | yes, with `turnsLeft` | yes | Gordie's sand is the biome's permanent sand (`turnsLeft: 0`). **[verified]** (B, D) |
| Arena tags (screens, hazards, rooms …) | only `SerializableArenaTag` | yes | **Safeguard is dropped**: `SafeguardTag extends ArenaTag` (`src/data/arena-tag.ts:1333`), so neither save nor parse keeps it. On a trainer reload, entry hazards hit the incoming mons again: Stealth Rock took Gigalith 525 → 460 (`post-summon-phase.ts:24`). **[verified]** (D) |
| Positional tags (Future Sight, Wish) | yes | yes | **[inference]** (code path `game-data.ts:1107`, not probed) |
| Battler tags | only `SerializableBattlerTag` | ours yes, the enemy's no | The ones dropped are all one-turn tags (Protect, Flinch, Helping Hand, Endure …), so harmless at a turn boundary. A confusion tag on our lead survived. **[verified]** (D) |
| `summonData` (stat stages, tags, moveHistory, type changes, Transform) | yes | **ours kept, the enemy's reset** | `EncounterPhase` calls `fieldSetup(true)` on the enemy's active mons (`src/phases/encounter-phase.ts:141-145`); ours never is. A saved enemy +2 came back 0. **[verified]** (C) |
| `tempSummonData` (turns on field: Fake Out, First Impression), `waveData` (once-per-battle abilities, Endure token used, ability revealed) | **no** | reset | Mid-fight gap. **[verified]** (code) |
| Boss bars | `boss`, `bossSegments` | yes | **`bossSegmentIndex` is not saved**: `setBoss` starts it at full (`pokemon.ts:6463-6474`). A boss already past a bar mid-fight is treated as having every bar again. Fine at T1. **[verified]** (D: 3 bars → index 2) |
| Doubles | derived: trainer `variant`/`doubleOnly`, wild `enemyParty.length > 1` | yes | A wild double reloaded with both sides on the field (probe G). Gordie's script drives slot 0 only (§7). **[verified]** |
| Challenges | `challenges` (id, value, severity) | yes | Battle code reads `gameMode.challenges`. **[inference]**, not run |
| Daily | `gameMode`, `dailyConfig` | yes | `trySetCustomDailyConfig` on load (`game-data.ts:1020`). **[inference]** |
| Endless | `gameMode`, enemy buff tokens as `enemyModifiers` | yes | The item-stacking trap applies to the tokens. Their status and heal rolls draw the global RNG (§6). **[inference]** |
| Tera | `teraType`, `isTerastallized`, `stellarTypesBoosted`, `arena.playerTerasUsed`, the Tera Orb as a modifier | yes | `playerTerasUsed: 1` came back 1 (D). **Enemy Tera is keyed by `initialTeamIndex`, which is not saved** (row "Team index"). **[verified]** |
| Trainer | `trainerType`, `variant`, name keys | yes | Upstream bug: `TrainerData` reads `source.partyMemberTemplateIndex`, a field `Trainer` doesn't have (`src/system/trainer-data.ts:20`), so the template index is re-rolled on load. No battle effect found, since the party is loaded rather than generated. **[verified]** bug, **[inference]** harmless |
| Battle seed | **not saved, but derived** | yes | The `Battle` is built under `executeWithSeedOffset(…, waveIndex << 3, waveSeed)` (`src/battle-scene.ts:1325-1332`), and `waveSeed = shiftCharCodes(seed, wave)` (`:2038-2043`). So `battleSeed` depends only on run seed + wave: Gordie came back as `U0QKEz8wJ8ea7832`. **[verified]** (B) |
| **Battle turn** | **no** | reset to 1 (`newBattle` → `incrementTurn`) | Mid-fight gap. [#635](https://github.com/IIxauII/coachemon/issues/635) found it missing; it is confirmed to change the rolls in §5. **[verified]** |
| **Team index** (`initialTeamIndex`) | **no** | reassigned from the saved party order (`pokemon.ts:6379`) | Switches swap party slots (`src/phases/switch-summon-phase.ts:190-191`), so mid-fight the order no longer matches the team. Instant Tera keys on this index (`src/field/trainer.ts:784-795`). Mid-fight gap. **[verified]** (§5) |
| Battle counters: `enemySwitchCounter` (switch damping), `lastMove` (Copycat), `enemyFaints`, faint histories (Last Respects, Supreme Overlord, `shouldTera`) | **no** | reset | Mid-fight gap (`src/battle.ts:69-97`, `src/phases/enemy-command-phase.ts:70-103`). **[verified]** (code) |
| Global RNG state (`Phaser.Math.RND`) | **no** | re-sown at the encounter | Deterministic from T1. Needed mid-fight (§6). **[verified]** |
| Battle style (SET / SWITCH) | setting, not session | harness forces SET (`test/helpers/settings-helper.ts:34`) | SET skips the wave-start "switch?" offer in wild waves (`src/phases/check-switch-phase.ts:30`). It is an input to mirror, not a draw. **[verified]** (code) |
| `gameVersion` | yes | migrated if older (`applySessionVersionMigration`) | A save from a newer live build than the clone can lose items silently (`toModifier` → `null`). **[inference]** |

---

## 3. The harness traps, root-caused

1. **Max rolls.** `GameManager`'s constructor replaces `BattleScene.prototype.randBattleSeedInt` with
   `min + range - 1` (`test/framework/game-manager.ts:84`). Restore the original after every `new GameManager()` and
   every `reloadSession()`, and assert it. **[verified]**
2. **31 IVs and a neutral nature: a test default, not the save.** `OverridesHelper` defaults `normalizeIVs`,
   `normalizeNatures` and `disableShinies` to `true` (`test/helpers/overrides-helper.ts:39-54`).
   `classicMode.runToSummon` turns them into `vi.spyOn` getter overrides (`test/helpers/classic-mode-helper.ts:29-37`).
   They outlive the first battle, and `addPlayerPokemon` / `addEnemyPokemon` apply them to every mon the reload builds
   (`src/battle-scene.ts:890-909`, `:957-976`). `PokemonData` itself passes the saved IVs and nature through
   (`src/field/pokemon.ts:356-365`).
   - **Fix:** set `game.override.normalizeIVs = normalizeNatures = disableShinies = false` before `startBattle`.
   - **Measured.** With the defaults, all 12 mons load at IV 31 / Hardy (Probopass 467 HP, Gigalith 545). With the
     flags off, IVs, natures and stats equal the save without any manual patch, and the winning line replays T1–T8
     exactly. **[verified]** (probes A, B, E0)
   - `disableShinies` only touches looks and luck. **[verified]** (code, `pokemon.ts:5802-5811`)
3. **Stacked enemy items.** `initSessionFromData` clears `scene.modifiers` but never `scene.enemyModifiers`
   (`game-data.ts:1111-1130`), and `addEnemyModifier` merges into the stack already there. So the entry count stays
   at 47 while the stacks grow: Gigalith went 545 → 576 on a second reload (probe A). **Check the stack totals, not
   the array length.** **[verified]**
4. **Silent item drops** (`modifier-data.ts:31-62`). Compare per-`typeId` stack totals between the input and the
   scene after load. **[verified]** (code)
5. **Script hygiene.** These are in the battle oracle issue and are unchanged here: a faint prompt registered early,
   a reload in mid-turn, a wipe read as a win, an illegal step.

---

## 4. Entry effects: which T1 file to load

**Mechanism.** **[verified]**

- On load, the enemy's active mons get `fieldSetup(true)`, which resets their `summonData`
  (`encounter-phase.ts:141-145`, `pokemon.ts:5118-5155`). Ours keep theirs.
- `PostSummonPhase` re-runs only for trainer and ME battles and on waves ≡ 1 (mod 10)
  (`src/phases/summon-phase.ts:271-287`). It brings ability triggers (Intimidate, weather setters …), entry hazards,
  pending heals and the Toxic-counter reset (`post-summon-phase.ts:18-24`).
- A T1 export from `getSessionSaveData()` is taken after the live summon, so it already holds all of that.

**Measured.** **[verified]**

| Probe | Setup | After reload | Live had |
|---|---|---|---|
| C (trainer, wave 180) | Foe lead with Intimidate. Our lead's saved Atk stage −1, as the live summon left it | **−2** | −1 |
| C | Foe's saved Atk stage +2 | 0 | +2 |
| F (wild, wave 182) | Our lead with Intimidate. Foe's saved Atk −1 | **0**: reset, and Intimidate not re-fired | −1 |
| F (wild, wave 181) | same | −1 (re-fired) | −1 |
| D (trainer) | Stealth Rock on the foe's side | Gigalith 525 → 460 again | one hit |

Gordie came through because none of these applied: our lead was Reshiram, Gigalith has no stat-changing entry
ability, and Sand Stream re-set a sand that was already permanent.

**Fix A: the wave-start save, for any fight replayed from T1.**

- `EncounterPhase` writes the session to localStorage before the summon (`encounter-phase.ts:290-308`,
  `game-data.ts:1366-1369`). Nothing overwrites it mid-wave: the menu's save-and-quit re-sends the cached copy
  (`src/ui/handlers/menu-ui-handler.ts:653`). **[verified]**
- `gameData.getSession(globalScene.sessionSlotId)` reads and parses that copy without writing anything when it is
  present (`game-data.ts:919-927`). **[verified]**
- It is exactly what Continue loads. Gordie's attempt 2 was played after a Continue and still matched the sim
  ([#632](https://github.com/IIxauII/coachemon/issues/632)). **[verified]**
- For trainer fights, the Continue path runs the same summon and `PostSummon` as the fresh one. **[inference]**
- Check that its `waveIndex` and `seed` match the live battle. The Gordie handoff once found a stale wave-176 save
  in that browser's localStorage.

**The one exception: wild waves not ≡ 1 (mod 10).** There the game's own Continue already differs from fresh play,
because our entry effects on the foe are never re-applied. No file reproduces a freshly played wild wave without
Fix B. **[verified]** (F, and code)

**Fix B: any fight, from any decision.** Load the export, then overwrite the on-field state from it:

- `summonData` for both sides;
- HP and status;
- weather and terrain `turnsLeft`;
- the extras in §5.

This is the mid-fight patch. **[verified]** for the fields §5 exercises.

---

## 5. Mid-fight replay

There are two routes.

1. **Replay the recorded inputs from the T1 save.**
   - It needs no new fields: battle RNG is re-sown each turn from `battleSeed` and the turn
     (`src/battle.ts:491-509`), and the global RNG is re-sown at the encounter (§6). The same inputs therefore give
     the same draws. Gordie's attempt 1 replayed this way, through to the loss. **[verified]**
   - It needs every input since T1, including faint replacements and Tera presses.
   - It can't serve a coach that joined late, as in the Ivy W145 log
     (`research/gordie-w180`: `docs/research/gordie-w180/w145-ivy-rayquaza.md`), where it joined at T10.
2. **An augmented export: `getSessionSaveData()` plus fields read live, put back after the reload.**

**Experiment E (Gordie).** **[verified]**

- Setup: play T1–T4 of the winning line in the harness (Dragon Pulse, → Probopass, → Leavanny, Pollen Puff), then
  export at T5's command. Carried in the export: `turn` 5; `enemySwitchCounter` 1; enemy order now Coalossal-first,
  where Coalossal was team index 5; `battleSeedState` null.
- Play T5–T8 (Bug Bite, Leaf Storm, Bug Bite, Leaf Storm) as the reference.
- Then reload the export several ways and play T5–T8 again:

| Reload | T5 | Outcome vs reference |
|---|---|---|
| Reference | Coalossal Teras, Bug Bite **crits** (→ 515) and steals the Lum, Burn Up fails | Leavanny 351 → 320 → 413 → 382; Carracosta 121 at T8 |
| **Naive** (export only) | Turn back to 1. Coalossal's team index is now **0**, so it never Teras. **Burn Up KOs Leavanny** | Diverged at T5 |
| **Patched** (all of the below) | identical | **HP for HP through T8** |
| Patched, turn left at 1 | Tera yes, no crit (→ 566) | By T7 Gordie no longer switches and Stone Edge KOs Leavanny |
| Patched, team index from the party order | crit yes, no Tera, Burn Up KO | Diverged at T5 |
| Patched, switch counter left at 0 | identical | Matched: damping 0.9 vs 1.0 didn't move T7's switch |
| Patched, global RNG as reloaded | identical | Matched: nothing in T5–T8 draws the global RNG |

**What the export must add, read live at the decision** (most rows trace to §2):

- `currentBattle.turn`, and `battleSeedState` (null at a command);
- `initialTeamIndex` per enemy id;
- `bossSegmentIndex` per enemy id;
- `enemySwitchCounter`, `lastMove`, `enemyFaints`, and the two faint histories;
- `Phaser.Math.RND.state()`;
- `tempSummonData` and `waveData` per mon;
- the enemy's on-field `summonData`, which the save carries but the load resets;
- weather and terrain `turnsLeft`.

The HUD's `sandbox` already saves and restores the RNG state and `battleSeedState`
(`skills/coachemon/scripts/hud/01-core.js:131-160`), so reading these live is safe.

**Still out of reach mid-fight:**

- Safeguard (§2);
- an ME battle (§7);
- a turn exported anywhere but at a command prompt. `reloadSession()` force-ends the current phase.

**Not re-derived here (from [#635](https://github.com/IIxauII/coachemon/issues/635)).** Only
`assets/battle-anims/tackle.json` is needed for HP-for-HP fidelity, not the 815 MB `assets`. Results were identical
across Node 23.6 and 24.9, three reloads in one process, and four parallel processes.

---

## 6. The global RNG

Most battle rolls go through `randBattleSeedInt`: damage, crits, accuracy, secondary effects and enemy AI. Some
battle code draws the global `Phaser.Math.RND` instead, which nothing re-sows per turn. **[verified]**

| Draw | Source |
|---|---|
| Tri Attack and Dire Claw status pick | `src/data/moves/move.ts:3141` |
| Thief and Covet steal chance | `move.ts:3220` |
| Present | `move.ts:5165` |
| Shed Skin | `src/data/abilities/init-abilities.ts:524` |
| Healer | `init-abilities.ts:918` |
| Harvest | `src/data/abilities/ab-attrs.ts:4165`, `:4182` |
| Trace's target in doubles | `ab-attrs.ts:2672` |
| Grip Claw | `src/modifier/modifier.ts:3301` |
| Endless status and heal tokens | `modifier.ts:3576`, `:3616` |
| A wild boss's stat boost when a bar breaks | `weightedPick`, `src/utils/random.ts:60-62`, from `pokemon.ts:6973` |

Both the fresh and the Continue paths call `resetSeed()` right after `doEncounter` (`encounter-phase.ts:290-308`).
So these draws repeat from T1 given the same inputs, but a mid-fight replay needs `RND.state()`.

Three seed-offset draws are keyed by `turn` as well: speed-tie shuffles (`src/utils/speed-order.ts:32-41`, "seeded
with the current turn"), Fickle Beam (`DoublePowerChanceAttr`, `move.ts:4716-4729`) and Magnitude. So the turn
matters beyond the battle seed.

---

## 7. Fight types beyond Gordie

- **Doubles.** The engine side reloads fine: both sides came back on the field (probe G). The Gordie script drives
  slot 0 only. It needs two things: per-slot `move.select(id, slot, target)`, and two faint prompts per turn. Fixable
  in the harness. **[verified]** engine, **[inference]** harness
- **Mystery Encounter battles.** Reloading a save whose `battleType` is `MYSTERY_ENCOUNTER` regenerates the
  encounter (`encounter-phase.ts:71-87`), skips the saved enemies (`:104-107`) and stops at `MysteryEncounterPhase`
  with the option menu up. Probe H timed out there, with "Something shiny is sparkling…". **[verified]**
  - To replay one: load the wave-start save, pick the same option (as the encounter oracle does), then fight. The
    enemy party and the ME's battle effects come from the encounter's code, not the save.
  - Whether the battle draws then match live is **[unverified]**.
- **Boss bars** (the Ivy fight: Torterra 2 bars, Rayquaza 3). Fine at T1. Mid-fight they need `bossSegmentIndex`. A
  trainer boss gets no stat boost on a bar break (`!this.hasTrainer()`); a wild boss's boost draws the global RNG
  (§6). **[verified]** (code)
- **Challenges, Daily, Endless.** Carried. Not run here. **[inference]**
- **Fusions, passives, custom data.** Carried (probe D). **[verified]**
- **Wild waves.** See §4's exception, and the SET-style switch offer (§2). **[verified]**
- **Account data.** The harness runs a blank account. The battle code read for this note reads only per-mon and
  session fields, not account data. **[inference]**, not exhaustively checked

---

## 8. Validation protocol: what a run does before it trusts a line

1. **Version gate.** The input's `gameVersion` must equal the clone's (`1.12.0.11`). Otherwise: no answer.
2. **Load hygiene.** Assert all of:
   - `randBattleSeedInt` is the real one after every reload;
   - the three override flags are off;
   - `enemyModifiers` were emptied before each reload;
   - per-`typeId` stack totals equal the input's, for both sides.
3. **Pick the input** (§4).
   - From T1: the wave-start save, and its `waveIndex` and `seed` equal the live battle's.
   - Mid-fight: the augmented export (§5), applied after the reload.
4. **Identity at the decision.** The reloaded scene must match the live one:
   - `battleSeed` and `turn`;
   - every mon's HP, status, stat stages and tags on the field;
   - `isTerastallized`, `initialTeamIndex` and `bossSegmentIndex`.

   Then export the loaded scene again and diff it against the input. Only `abilitiesApplied` entries may differ.
5. **A turn with a known outcome.** Before trusting a fresh line, reproduce a turn whose result is already known:
   - a previous attempt's inputs, as Gordie's attempt 1 was;
   - or, mid-fight, the last turn just played, re-run from the export taken before it.

   On a first attempt with no history, the line's T1 is itself the test. Trust nothing past T1 until it resolves
   live with the predicted HP and messages.
6. **Checkpoints during play.** After every live turn, compare HP, status, stat stages, who is on the field and who
   Terastallized with the line's **After** column, before the next input. On any mismatch, stop. The rest of the
   line is void: re-export and re-solve. This is the battle oracle's `PLAN.md` rule.
7. **Refuse what isn't supported yet:**
   - an ME battle past its option screen;
   - doubles, until the script drives both slots;
   - Safeguard on the field mid-fight;
   - a version mismatch;
   - any dropped item.

   Answer "no answer", as the encounter oracle does.

---

## 9. What confidence a solved line can claim

`CONTEXT.md` defines three levels:

- **exact**: cannot drift;
- **replay**: right only while the game's own draws are exactly the draws the coach made;
- **estimate**: read off state that may have moved on.

- **A line is `replay` at most.** Each turn's predicted outcome holds only while the live draws equal the
  harness's, which means the same starting state and every earlier input played as scripted. It is never `exact`:
  the player's own inputs sit between the claim and every turn after the first, and one different input re-rolls
  the rest. **[inference]** from the definitions, **[verified]** that one changed input changes later draws (§5)
- **It reaches `replay` only after §8 steps 1–5 pass.** Before that, the state the line was solved on may not be
  the live state, and the line is not even `estimate`, which `CONTEXT.md` reserves for a read off live state that
  may have moved on. Say "no answer" rather than show a hypothetical as fact.
- **The first enemy action at the current decision** keeps the turn read's own claim: `exact` unless a command of
  ours draws first, then `replay`. The line as a whole stays `replay`.
- **Scoring.** Each step-6 checkpoint scores the line's claim. Per `CONTEXT.md`, one miss marks it wrong for the rest
  of the run, so the remaining turns are void, not "probably still fine".
- **Not optimal.** A winning line found by a greedy search is *a* win under replay, not the best one
  ([#632](https://github.com/IIxauII/coachemon/issues/632)).

---

## 10. What this changes elsewhere on the map

- **[Rollout location](https://github.com/IIxauII/coachemon/issues/635).** Its recommended read command hands the
  plugin `gameData.getSessionSaveData()`. Taken at T1, that double-applies entry effects on our side in trainer
  fights and loses ours on the foe in wild ones.
  - For T1, the command should hand over the **wave-start save** (`gameData.getSession(sessionSlotId)`).
  - For mid-fight, it should add the §5 extras.
  - Its note "set `currentBattle.turn`" is necessary but not sufficient: the team index alone flipped the Gordie
    replay.
- **[HUD gaps](https://github.com/IIxauII/coachemon/issues/637) and
  [HUD vs engine on Gordie](https://github.com/IIxauII/coachemon/issues/638).**
  - Drive the harness with the three override flags off rather than patching IVs.
  - Expect the enemy-item stacking trap to show up in stack counts, not in the array length.
  - Gordie's T1 export is safe for these comparisons (no entry effects on our side).
  - Anything that reasons about enemy Tera must read `initialTeamIndex` off the mon, never derive it from party
    order.
- **[Boss-fight plan prototype](https://github.com/IIxauII/coachemon/issues/639).**
  - The plan's **After** checkpoints are §8 step 6.
  - A mid-fight re-plan needs either the input log since T1 or the augmented export.
  - A boss fight like Ivy's also needs `bossSegmentIndex`.
- **[ADR draft](https://github.com/IIxauII/coachemon/issues/641).**
  - The ceiling is `replay`.
  - ME battles and doubles are out of scope until the harness supports them.
  - The export contract (wave-start save + live extras) and the version gate belong in the decision.

---

## Appendix: rerunning the probes

The probes are on this branch under `docs/research/replay-fidelity/`: `probe-a-e.test.ts` and `probe-f-h.test.ts`,
with this run's raw output in `out-a-e.json`, `out-e3-e6.json` and `out-f-h.json`. To run one:

1. Copy it into the clone's `test/tests/` under a **unique** name containing `636`.
2. Set `RF_SESSION` to `session-w180.json` (from `research/gordie-w180`) and `RF_OUT` to an output path.
3. Run `npx --yes pnpm@10.33.2 exec vitest run test/tests/<name>`.
4. Remove the file.

On Node ≥25, vitest exits 1 even when every case passes (the clone's i18n rejection; see #635). Read the per-test
results, not the exit code.

| Probe | What it does |
|---|---|
| A | Default harness overrides: IVs, natures and item stacking |
| B | Clean overrides: round-trip diff and battle identity |
| C | Entry effects on a trainer reload |
| D | Fusion, passive, custom data, boss bars, status, tags, terrain and arena tags |
| E0–E6 | Mid-fight export: reference, naive, patched, and one field left out at a time |
| F | Wild Intimidate on reload |
| G | Wild double |
| H | ME battle |
