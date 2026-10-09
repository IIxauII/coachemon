# What a team-value model could read from the HUD, and its cost

For *Inventory what a team-value model could read from the HUD, and its cost per tick* (#558), on the map *Judging a
newcomer against the party* (#555). The HUD is `skills/coachemon/scripts/hud/`, every path below is under it.

## "Per tick" is per decision

A card is not rebuilt each tick. `02-decision.js` keys every decision. On the first ready frame of a new key, `tick` builds the
card once inside the `read` stage. It is then held (`watchCached`, last 8; `heldBattleCard`), and memoised under the
run key (`26-run.js`, last 2 runs). A 1 s fallback timer builds only when no frames arrive (`99-start.js:102-119`).
So the budget a team-value model spends is **once per decision build**, and anything keyed on the party alone can be
memoised across decisions in the run memo.

Nesting is the one hard constraint. A turn read and a run read never nest (`01-core.js:164` throws). The battle card,
and with it the catch judgment, is built inside `readTurn`. Its road group (`previewNext` + `aheadModel`) is read
afterwards, deferred to `setTimeout(0)` (`60-card.js:104`, `99-start.js:72`). The catch judgment **cannot read the
preview or the next big fight synchronously today**. It would have to take the previous decision's road from the run
memo, or the road would have to move ahead of the turn read.

## Signals

| Signal | Entry | Works from | Cost (bench, p50) | Notes |
|---|---|---|---|---|
| Type chart + ability immunities | `effectiveness`, `defenderOf`, `vs` (`01-core.js:35-51`) | live mon or plain `{types, ability, passive}` | coverage over 7 teams × 6 threats: **0.08–0.10 ms** | Defender-side abilities only (Levitate, Flash Fire, Filter…). No attacker-side abilities (Scrappy, Tinted Lens) |
| Party profile | `partyProfile` (`08-party.js:88`) | live members | **0.41–0.44 ms** | Type tallies (`hitters`, `weakTo`, `weakTypes`, `holes`) + lazy `weakest` (final BST). No stats, level power, items, HP |
| Today's per-candidate judge | `partyReasons` | plain cand `{species, level, types, moveTypes?, abilities?}` | **0.002 ms** per candidate; profile + all 6 swaps 0.43 ms | Reasons, no numbers, by design |
| Final BST | `finalBstOf` | live mon (own `calculateBaseStats`) or species | 0.0005 ms | Asymmetric: members get vitamins + form, plain candidates the base form |
| Damage estimate | `approxOutcomes(env, atk, def)` (`10-damage.js:735`) | `env = {isEnemy, party}`; mons need `getStat`, `getTypes`, `getAbility`, moveset… | **0.035–0.04 ms** per pair per direction | **Not pure:** reaches game code (`FlinchAttr.getMoveChance` → `applyAbAttrs` → `canApplyAbility`), so a stub from a preview row fails. Threats must be real `Pokemon` or near-complete stubs. ×1.15 margin on foes, reliability on ours; no items, weather, crits |
| KO pacing | `koCurve` + `koTurns` on an approx record | `{facts: targetFacts(env, def)}` | **0.025 ms** per pair | Needs `getHeldItems` etc. on the target |
| Duel matrix, all swaps | approx both ways, best member per threat | — | 7 teams × 6 × 6 threats × 2 dirs: uncached **22–30 ms**; memoised per (member, threat) **3.7–4.0 ms**; newcomer's row alone ≈ 0.5 ms (12 pairs, derived) | Only the newcomer's row is new per decision. The party's rows are reusable while the run key holds |
| Exact damage / fight plan | `sceneOutcomes`, `planOutcomes`, `threatFrom`, `exchange`, `tpFight`/`tpTables` | a live `turn` (`readTurn`) | battle card build, live: p50 51 / p95 642 ms | Only inside a decision prompt, against the field's foes. No hypothetical-foe entry without a fake turn |
| Stub from species + level | `s.addEnemyPokemon(species, level, TrainerSlot.NONE)` | species, level | **0.30–0.40 ms** each (+destroy) | How preview and safari build mons. Needed for species-only newcomers (biome) to get stats and moves |
| Run calendar | `bigFightsAhead(s, from, 30)`, `waveKind`, `nextHeal`, `trainerOdds` (`03-calendar.js`) | scene's game mode | 0.002 ms for 30 waves | Kinds only (final/fixed/gym/boss), never species |
| Preview | `previewFor(run, w)` (`48-preview.js:223`) | a run read | cold **0.5–3.5 ms** per wave; memoised per run key | Foe rows: `{name, level, types, ability, passive, hp, stats[5], segments, moves(names), attackTypes, statusMoves, healMoves}` + per-field confidence. Real mons built then destroyed |
| Next big fight | `aheadModel(run)`, `learnRoster` (`49-ahead.js:119,160`) | a run read | cold **2.0–8.3 ms**; warm 0.003 ms | Roster **only when the fight is ≤ 5 waves away** (`LOOKAHEAD`); otherwise kind and wave only |
| Team audit | `teamAudit(run, ahead)` (`50-audit.js:186`) | run read + ahead | cold 2.1–6.5 ms (first call 53 ms, cold JIT); live shop stage p50 10 / p95 88 ms | `answersTo(p, foe)` (:153) is the pairwise test, private and boolean (SE moves on the stronger attacking stat) |
| Held-item value | `rewardContext(s, alive).held(p)` + `HELD[id](p, ctx)` (`51-items.js:59,103`) | live members, `s.modifiers` | 0.002 ms (bench party held nothing: a floor) | What a release would delete, on the rewards card's 10-per-tier scale |
| Moveset prior | `RANDBATS` (`05-randbats.js`): 780 singles, 501 doubles species, 453 NFE links | species name | 0.001 ms names → move objects | Readers are private to `40-learn.js` (`priorSets`). Names only. A prior, never decisive (CONTEXT.md, *Moveset prior*) |
| Fusion value | `partyValue` (`49-fusion.js:7,40-42`) | live members | not timed | An existing rank-weighted team value: power = offence^0.45 × bulk^0.35 × speed^0.2, weights [1, .8, .55, .35, .2, .1] |
| Starter team score | `teamScore` (`51-starters.js:122`) | species + account | not timed | Another existing team model, with randbats roles |

Bench setup: Apple M4, upstream's headless vitest harness in the pinned clone v1.12.0.11. Party of six at L30 with
game-generated movesets, wave 27, classic, six real `EnemyPokemon` threats at L32, previews under six seeds (next big
fight: the wave-30 gym, 3 foes). Two runs, ~30 % apart; ranges cover both. Live numbers come from five lag runs on the
1 Oct build (`lag-by-card.mjs` over `.cache/lag-run`).

## Live card build costs (lag runs, 1 Oct build)

| Card | builds | p50 | p95 | max |
|---|---|---|---|---|
| battle (holds catch) | 2115 | 51 ms | 642 ms | 12.9 s |
| rewards / shop (holds audit, ahead) | 344 | 34 ms | 153 ms | 233 ms |
| encounter | 14 | 10 ms | 17 ms | 17 ms |
| biome | 2 | 131 ms | — | 131 ms |
| catch, fusion, safari | not met in these runs | | | |

A swap judgment at ~4 ms, memoised, is under a tenth of a battle-card build's median. The uncached matrix at 22–30 ms
is half a median build again, so it wants the memo.

## Per newcomer card

| Card | Newcomer held | Party set | Reads today | Could also read |
|---|---|---|---|---|
| Catch (`45-catch.js:72-96`) | live `EnemyPokemon`: level, stats, real moves, ability + passive, IVs, nature, form, fusion | every member, **fainted included** | `partyReasons` with `moveTypes` + `abilities`; damage/planner for "ends it sooner" only | approx duel vs any threat set; items of the replaced member. **Not** preview/ahead synchronously (nesting, above) |
| Safari, 3 ahead (`44-safari.js:70-130`) | live mon inside a seed fork, **destroyed before return** | as catch (`catchWorth`) | `catchWorth` | anything computed inside the fork's callback; the run read is open there |
| Safari minigame (`46-encounter.js:775-815`) | live mon | as catch | `catchWorth` | as catch, plus run read |
| Salesman, Uncommon Breed, Dancing (`46-encounter.js:241,576,715`) | live mon (`me.misc.pokemon` / enemy party) | as catch, via `catchWorth` (encounters' own `context` uses standing + allowed) | `catchWorth` | preview / ahead / calendar: the encounter builds inside a run read |
| GTS trade (`46-encounter.js:594-616`) | **live `EnemyPokemon` per offer**, but only `.species` is read | standing members except the carry | `partyReasons(…, {replacing: p})` with no `moveTypes`/`abilities`; final-BST delta | the offer's real level, stats, moves and ability. Upstream builds a legendary's offers at **L5**, the others at the traded member's level, and the received mon keeps the offer's level and **inherits the traded member's passive**. The card assumes the traded member's level for all |
| Biome (`47-biome.js:252-417`) | **species only**, evolved to the party's **max level** (not the spawn's) | standing, or everyone when a heal is due | `partyReasons` with no `moveTypes`/`abilities`; calendar | a stub per species (0.3–0.4 ms each × spawn pool) for stats and moves; preview/ahead (run read open) |
| Fusion (`49-fusion.js`) | both halves live party members | whole party | its own `partyValue`, not 08-party | — |
| Keep / release prompt | **no card** | — | — | the game's own full-party prompt is unjudged; only the catch card's "replaces X" line exists |

## What this means for the shortlist

- **Cheap enough everywhere:** type-chart threat coverage, the party profile, held-item price, calendar, randbats. All are sub-ms.
- **Cheap enough with a memo:** an approx duel matrix (best member per threat, both directions). The party's rows are kept
  per run key, and only the newcomer's row is new. It needs real `Pokemon` threats, not preview rows.
- **Not per decision:** the exact damage call and the fight plan. They exist only inside a live turn against the field.
- **Threat sets that exist:**
  - the next big fight's roster: ≤ 5 waves out, through the road, not reachable from catch synchronously;
  - the field's foes, battle only;
  - the biome spawn pool (`spawnsFor`).
  - Nothing supplies a generic threat set when no roster is previewed.
- **Uneven inputs across cards:**
  - Three different party sets.
  - Biome and GTS drop real level, moves and abilities.
  - Members' BST includes vitamins; candidates' doesn't.

  "One shared judgment" needs one candidate shape and one party set first.
