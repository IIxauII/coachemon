# How established team-building approaches judge a team

Research for [#556](https://github.com/IIxauII/coachemon/issues/556), on the map [#555](https://github.com/IIxauII/coachemon/issues/555) "judging a newcomer against the party".

**Question.** What models do established team-building traditions use to judge a team and a candidate addition to it? Which of them fit a roguelike where members arrive one at a time and the **party** holds six? For each model: what it scores, what inputs it needs, what it costs, and how it judges the running example below.

**Short answer.** Every tradition looked at here treats raw power as necessary and not enough. Each one judges a team against a set of opponents: types, a threat list, or a matchup matrix. A newcomer is worth whatever it changes in that judgment. The model that fits our constraints is a **weighted threat-coverage value**: for each threat, take the best pairwise matchup score any member has against it, then sum over threats. A newcomer is judged by the change a swap makes, `V(party − member + newcomer) − V(party)`. A cheap pairwise score is enough to run it. PokéRogue's own `getMatchupScore` is one such score, scaled by a power term. Showing a second, explainable layer is optional: defensive and offensive type tallies with Showdown-style stacking caps. Simulation, genetic search and usage statistics are out for a per-tick judgment.

## The running example

The party has five pure-Water members and one pure-Grass member, G, with a final BST of 430. The newcomer N is pure Water with a final BST of 540. Every member uses its STAB attacks only.

Today `08-party.js` picks G as the weakest member, because it has the lowest final BST. N's final BST is 540, which is at least 430 + 100, so `partyReasons` calls N an `upgrade`, and `45-catch.js` says "party full: replaces G". `partyReasons` never asks what the replaced member was covering. It asks only whether the *newcomer* covers one of the `weakTypes`. Electric and Grass are already in `weakTypes` before the swap and are still there after it, so the swap's harm never shows up.

The type facts the models below lean on:

| Attacking type | Before (5 Water + G): weak / resist | After (6 Water): weak / resist |
|---|---|---|
| Electric | 5 / 1 | 6 / 0 |
| Grass | 5 / 1 | 6 / 0 |
| Fire, Ice | 1 / 5 | 0 / 6 |
| Poison, Flying, Bug | 1 / 0 | 0 / 0 |

Offensively, Water STAB hits Fire, Ground and Rock super-effectively, and Grass STAB hits Water, Ground and Rock. Losing G means nothing on the team hits **Water** super-effectively any more, so Water becomes a coverage hole.

## Models

### 1. Raw power: BST, final BST, level

- **What it scores:** each member on its own, with no interaction between members. This is what `finalBstOf` does today.
- **Inputs:** base stats and the evolution chain. Cost is *O(1)* per mon.
- **What the sources say:** none of them use it alone. Nuzlocke University tells players to sometimes pick "the 'right' Pokémon over a 'good' Pokémon". Its example is Dustox, whose "base stats that are well below the power curve" made it "the perfect answer" to a single fight [NU-2021, NU-2025]. Smogon's synergy primer pairs bulk that complements each other, such as Skarmory's physical bulk with Chansey's special bulk, rather than picking the most bulk [SM-SYN]. The integer program in [CHAGNET] maximises total base stats, but only *subject to* a type-coverage constraint.
- **Example:** replace G, upgrade. **This is the bug.** Power still belongs in the score as a factor, just not as the whole score.

### 2. Defensive and offensive type tallies (synergy calculators)

- **What it scores:** for each of the 18 attacking types, how many members are weak to it and how many resist it (defensive). For each defending type, whether any member hits it super-effectively (offensive). This is the Marriland team builder's two tables, "Total Weak / Total Resist" and super-effective / not-very-effective coverage [MARRILAND]. It is also the "synergy calculator" step of Smogon's threat-list method [SM-THREAT]. The `weakTypes` and `holes` in `partyProfile` are this model already.
- **Inputs:** the type chart, each member's types and its damaging move types. Abilities refine it: Showdown counts Dry Skin and Fluffy as Fire weaknesses [PS-TEAMS].
- **Cost:** 18 × 6 lookups.
- **Example:** after the swap, Electric goes from 5 weak / 1 resist to 6 / 0, Grass does the same, and Water joins the offensive holes. A tally compared before and after the swap judges it correctly. Today's code compares neither side, so the tally is right and only its use is wrong.
- **Limit:** it counts types, not foes. Every type gets the same weight, and it cannot see that one member is a *better* answer than another.

### 3. Stacking caps: Pokémon Showdown random battles

The Showdown generator for gen 9 random teams builds a team by rejection sampling. It draws a species and skips it if it would break a composition cap [PS-TEAMS, `randomTeam`]:

- `// Limit two of any type`: `typeCount[typeName] >= 2 * limitFactor`
- `// Limit three weak to any type, and one double weak to any type`: `typeWeaknesses[typeName] >= 3 * limitFactor`, `typeDoubleWeaknesses[typeName] >= limitFactor`
- `// Limit four weak to Freeze-Dry`
- Species Clause, and pairwise "incompatible" lists such as `['blissey', 'chansey']` ("considered too similar to each other"), double web setters or double screen setters (`getPokemonCompatibility`).
- Once a team has hazard removal or a status cure, other sets drop theirs (`teamDetails.defog`, `rapidSpin`, `statusCure`). This is role de-duplication.

The repo already ships a trimmed snapshot of the pkmn/randbats sets and roles, `05-randbats.js`, but none of these caps.

- **What it scores:** nothing. It is a yes/no gate on stacking: type count, shared weakness, double weakness, and too-similar roles.
- **Inputs:** types, the type chart and an ability list. Cost is 18 × 6 lookups.
- **Example:** N would be the sixth Water and the sixth member weak to Electric. **Rejected.** In a roguelike the party already breaks every cap (five Water), so as a hard gate it would reject almost every newcomer for this party. Its use here is as a *soft, convex stacking penalty*: the third member weak to a type costs more than the second. The numbers 2 and 3 are a well-tested prior on where stacking starts to hurt in six-member teams. They agree with community advice that "4 or more Pokemon of the same type is almost always bad", and that what matters is shared weaknesses rather than shared types [PDB-OVERLAP, low trust].

### 4. Threat list with checks and counters (Smogon)

- **What it scores:** for each threat on a list, how many members can reliably beat it. A **counter** "can consistently switch into a threat and either force it out or kill it". A **check** "can range anywhere from a revenge killer to a Pokémon that can only switch in on coverage moves but is faster and OHKOes". A threat is "covered" when the team has "at least two checks or one counter to a threat" [SM-UU101]. The process in [SM-THREAT] is: run a synergy calculator, then go through the tier's S–B viability rankings counting "how many team members can reliably defeat each threat versus how many are reliably beaten by it", then check common cores. Weak links are fixed by changing a set, or by replacing the member with one that fills the same role "while not having the same flaws". Nuzlocke practice is the same method aimed at the run's own bosses: "build your team with a focus on the most threatening enemies" and bring "tech" Pokémon for a threatening Gym Leader [NU-2025, NU-2021].
- **Inputs:** a threat list (in PokéRogue: the **run calendar**'s boss and gym waves, a **preview**, the biome pools) and a check/counter judgment for each pair of member and threat.
- **Cost:** threats × members pair judgments. That is cheap with a formula and expensive with damage calculations.
- **Example:** against an Electric threat, G is the only member that resists Electric, so G is the only check. After the swap there are none. Against a Water boss, G resists it and hits it super-effectively, so G is the one counter. After the swap the Water members only wall it and cannot hurt it. **The swap uncovers two threats, so keep G.**
- **Fit:** this is the shape the destination asks for. A generic threat list is the base, and the known road ahead *re-weights or extends* the list instead of being a separate model.

### 5. Matchup matrix and interaction value

The formal version of model 4: give every pair of member and threat a number, and score the team as a function of the matrix.

- **Sahovic, "Algorithmic Pokémon teambuilding"** (2025). It sets up teambuilding as an optimization problem with two models: a "no-interaction baseline" and an "interaction model that incorporates synergy and counterplay". The interaction model's best counter-team "defeats the best baseline team over 65% of the time", and the article also derives a "simplified Nash equilibrium" [SAHOVIC]. Only the Smogon announcement could be read; sahovic.fr did not resolve. Its matrix comes from simulated win rates, which is offline work.
- **PokéRogue's own pairwise score.** `Pokemon.getMatchupScore(opponent)` returns `(atkScore + defScore) * min(hpDiffRatio, 1)` [PR-POKEMON]:
  - `defScore` is `1 / max(effectiveness, 0.25)` over the opponent's types, capped at 4.
  - `atkScore` is the average effectiveness of the mon's damaging moves on the opponent, with ×1.5 for STAB.
  - `hpDiffRatio` folds in HP and speed.
  - The comment says it "ranges from near-zero to 16".

  The enemy trainer uses it to choose its next send-in (`Trainer.getPartyMemberMatchupScores`, which halves the score against legendaries) [PR-TRAINER]. `35-team-plan.js` and `20-enemy-ai.js` already call it.
- **Team value as facility location.** Score the team as `V(S) = Σ_t w_t · max_{m∈S} s(m, t)`: each threat t, weighted by `w_t`, is answered by the member best placed against it. This is a weighted facility-location or coverage function. It is monotone and submodular, the setting where greedy, one-at-a-time building gets within (1 − 1/e) of optimal, and where the swap ("interchange") heuristic is also analysed [NWF-1978]. A newcomer offered to a full party is judged by `max over members g of V(S − g + N) − V(S)`, and the `g` that wins is who it replaces.
- **Inputs:** a pairwise score s and a weighted threat set. The generic set is the 18 types, or the biome or calendar pools. The known road ahead raises the `w_t` of a preview's foes or the next boss.
- **Cost:** with |T| threats, the party's rows are |T| × 6 scores, cached for each **decision**. The newcomer's row is |T| scores. The six possible swaps are 6 × |T| max operations. For |T| ≈ 18–60 that is a few hundred arithmetic operations. There is no simulation.
- **Example:** with `getMatchupScore`'s type terms only (HP factor = 1) and STAB moves:

  | Threat | Water member | G (Grass) |
  |---|---|---|
  | Electric | 0.5 + 1.5 = 2.0 | 2 + 1.5 = 3.5 |
  | Water | 2 + 0.75 = 2.75 | 2 + 3 = 5.0 |
  | Ground | 1 + 3 = 4.0 | 2 + 3 = 5.0 |
  | Fire | 2 + 3 = 5.0 | 0.5 + 0.75 = 1.25 |

  With equal weights the party is worth 3.5 + 5 + 5 + 5 = 18.5. Dropping G for N leaves 2 + 2.75 + 4 + 5 = 13.75, a change of −4.75. Dropping any Water member for N leaves V unchanged on types, so the power term decides it. **The model keeps G and has N replace the weakest Water member, if anyone.**
- **Missing piece:** `getMatchupScore` has no notion of power beyond speed: a weak Water mon scores like a strong one. The "generic team strength" base therefore needs a power factor on s, such as level-adjusted stats or final BST, so that model 1 survives as a multiplier instead of a verdict.

### 6. Roles: role compendiums, redundancy, role compression

- **What it scores:** whether each job on the team is filled, filled twice, or filled by a member that does several jobs. Smogon role compendiums list Pokémon "broken up into different roles" [SM-ROLES]. Nuzlocke University defines redundancy as "having multiple Pokémon which can perform any given role" and role compression as "'compressing' multiple roles into a single team slot" [NU-2025]. Showdown removes duplicate support roles in code (model 3).
- **Inputs:** role labels for each species. The randbats snapshot already in `05-randbats.js` has them, for example "Bulky Support", "Fast Attacker" and "Setup Sweeper". Cost is a lookup.
- **Example:** it depends on which sets are involved. N and the Water members probably share a role, so N adds nothing new. It **does not decide the example on its own**. Its use is as a tie-breaker, or as a small penalty when a newcomer duplicates a role.

### 7. Search and simulation: genetic algorithms, metaheuristics, self-play

- **What it scores:** a team's win rate in simulated battles against a rival team or a field of teams. Approaches include a genetic algorithm over whole teams, whose fitness is performance "against as many other teams as possible" [SARANTINOS]; simulated annealing, tabu search, VNS, GA, ACO and cuckoo search under "the same dataset, fitness function, and simulator" [BUENO-2026]; and self-play over a space of about 10^139 team configurations [VGC-BENCH].
- **Cost:** thousands of battles for each evaluation. **This breaks the per-tick constraint.** Its only use is offline: calibrating the weights of model 5, or checking them against a replay corpus.

### 8. Usage co-occurrence: Smogon usage statistics

- **What it scores:** synergy learned from ladder teams. The moveset stats' `Teammates` value for a species pair is the co-occurrence count minus its expected value, `teammates[s] - (count*usage[s])`, which is a lift-like measure. `Checks and Counters` is the share of encounters where a species was KOed by, or switched out against, another, `(matchup[0]+matchup[3])/n`, kept only when `n > 20` [SMOGON-STATS].
- **Inputs:** a large corpus of real teams and battle logs. **PokéRogue has no such corpus**, and teams are drawn from what a run offers, so the idea does not carry over.

### 9. Mixed-integer programming: BST under coverage constraints

- **What it scores:** maximise the team's total base stats, `argmax Σ b_n x_n`, subject to team size and "for each type A, the team has a Pokémon resistant to it", solved with PuLP branch-and-bound [CHAGNET].
- **Example:** six Water members resist neither Electric nor Grass, so the swap is *infeasible*. **Keep G.**
- **Fit:** the shape is right: strength as the objective, coverage as the requirement. But hard constraints break when the party is built from whatever the run offers. Turn them into penalties and it becomes models 2 and 3 with a power term.

## PokéRogue facts that bear on a swap

- The party cap is `PLAYER_PARTY_MAX_SIZE = 6` (`src/constants.ts`). A full-party catch asks which member to release (`attempt-capture-phase.ts`) [PR-CAPTURE].
- **A release throws away the member's held items.** `PartyUiHandler.doRelease` calls `removePartyMemberModifiers(slotIndex)`, which splices out every `PokemonHeldItemModifier` with that `pokemonId` [PR-PARTY-UI, PR-SCENE]. A swap therefore costs the replaced member's items as well as its slot. No tradition above models this, and it belongs in the replacement cost. Fusion calls the same removal on the other half (`pokemon.ts:6284`).
- **A release cannot be undone.** A run has no box, unlike a Nuzlocke, where boxing is reversible. A swap is a one-way choice, which argues for a margin before calling something an upgrade.
- **The dex credit comes before the prompt.** `setPokemonCaught` runs before the full-party prompt [PR-CAPTURE], so declining the newcomer keeps the account value. This supports the map's decision to keep account value on its own axis.
- **Community sources.** No high-trust PokéRogue guidance on party composition or what to release turned up. `wiki.pokerogue.net` answers 403 to scripted fetches, and web results for "PokéRogue team building" are mostly SEO spam pages. This is a gap: everything specific to PokéRogue above comes from the game's code.

## Recommendation for shortlisting

1. **Model 5: weighted threat-coverage value with a swap delta.** This is the core. It contains models 2 and 4, gives one number per (party, newcomer) pair, which matches the destination's "one shared judgment", names who to replace, and takes the known road ahead as threat weights instead of a second model. It needs a pairwise score with a power factor. Candidates are `getMatchupScore`'s type terms × a level- or BST-based power factor, or the planner's damage functions if they are cheap enough. It also needs the generic threat set to be chosen.
2. **Models 2 and 3: type tallies with soft stacking caps.** Shortlist these as the cheap, explainable layer the card's reasons can quote: "would be the 6th weak to Electric", "no one else hits Water". They are also the fallback when no threat set is known. Showdown's 2-of-a-type, 3-weak and 1-double-weak caps are the starting thresholds for the penalty curve.
3. **Model 1, kept as a factor, not a verdict.** Power multiplies into s, or is added to V. The +100 final BST threshold becomes a margin on ΔV.
4. **Model 6, as a tie-breaker only.** Role duplication from the randbats roles.
5. **Not shortlisted:** model 7 (too costly per tick; offline calibration only), model 8 (no corpus) and model 9 (hard constraints break one-at-a-time arrival).
6. **For the replacement cost:** the replaced member's held items, and the fact that a release cannot be undone.

## Sources

- **[SM-SYN]** Metal Sonic, "Synergies and Cores – The Fundamentals of Teambuilding", Smogon. https://www.smogon.com/resources/beginner/synergy
- **[SM-THREAT]** frenzyplant, "Identifying and Eliminating Threats to Your Team", Smogon forums, 2015-01-24. https://www.smogon.com/forums/threads/identifying-and-eliminating-threats-to-your-team.3528038
- **[SM-UU101]** "UnderUsed 101: Teambuilding", Smogon. https://www.smogon.com/tiers/uu/uu101
- **[SM-ROLES]** SM OU team building resources (role compendium). https://www.smogon.com/forums/posts/10924673
- **[PS-TEAMS]** smogon/pokemon-showdown `data/random-battles/gen9/teams.ts`, `randomTeam` (around lines 1760–1860) and `getPokemonCompatibility`, at commit `6a0848812c06d73fe73c85bfe0b707e3f453612a`. https://github.com/smogon/pokemon-showdown/blob/6a0848812c06d73fe73c85bfe0b707e3f453612a/data/random-battles/gen9/teams.ts
- **[SMOGON-STATS]** Antar1011/Smogon-Usage-Stats `batchMovesetCounter.py` (teammates and checks-and-counters), at commit `59a9c1cf3570a9d68d89e073699cce17b1d999c7`. https://github.com/Antar1011/Smogon-Usage-Stats/blob/59a9c1cf3570a9d68d89e073699cce17b1d999c7/batchMovesetCounter.py
- **[SAHOVIC]** hsahovic, "Algorithmic Pokémon teambuilding", announced on Smogon on 2025-08-19 (https://www.smogon.com/forums/posts/10676712). The article itself, https://sahovic.fr/algorithmic-pokemon-teambuilding, could not be reached.
- **[NU-2021]** Nuzlocke University, "Pokémon Nuzlocke Team Building Tips", 2021-01-21. https://nuzlockeuniversity.ca/2021/01/21/pokemon-nuzlocke-team-building-tips/
- **[NU-2025]** Nuzlocke University, "5 Principles for Nuzlocke Team Building", 2025-04-02. https://nuzlockeuniversity.ca/2025/04/02/5-principles-for-nuzlocke-team-building/
- **[PDB-OVERLAP]** PokéBase Q&A, "How much type overlap is OK on a team?" (community; low trust). https://pokemondb.net/pokebase/354077/how-much-type-overlap-is-ok-on-a-team
- **[MARRILAND]** Marriland Team Builder. https://marriland.com/tools/team-builder/
- **[CHAGNET]** N. Chagnet, "Pokémon team optimization", 2025-12-26. https://nchagnet.eu/blog/pokemon-team-optimization
- **[SARANTINOS]** N. R. Sarantinos, "Teamwork under extreme uncertainty: AI for Pokemon ranks 33rd in the world", arXiv:2212.13338, 2022. https://arxiv.org/abs/2212.13338
- **[BUENO-2026]** G. B. Guimarães, R. C. Contreras, A. C. Gorgonio, A. M. P. Canuto, "Pokémon GO Team Optimization: A Comparative Study of Classic Metaheuristic Algorithms", Journal on Interactive Systems. https://journals-sol.sbc.org.br/index.php/jis/article/view/6773
- **[VGC-BENCH]** C. Angliss, J. Cui, J. Hu, A. Rahman, P. Stone, "VGC-Bench: Towards Mastering Diverse Team Strategies in Competitive Pokémon", arXiv:2506.10326, 2025. https://arxiv.org/abs/2506.10326
- **[NWF-1978]** G. L. Nemhauser, L. A. Wolsey, M. L. Fisher, "An analysis of approximations for maximizing submodular set functions—I", *Mathematical Programming* 14 (1978) 265–294.
- **PokéRogue source**, at the pinned clone `v1.12.0.11` (`.cache/pokerogue/v1.12.0.11`):
  - **[PR-POKEMON]** `src/field/pokemon.ts`, `getMatchupScore`
  - **[PR-TRAINER]** `src/field/trainer.ts`, `getPartyMemberMatchupScores`
  - **[PR-CAPTURE]** `src/phases/attempt-capture-phase.ts`
  - **[PR-PARTY-UI]** `src/ui/handlers/party-ui-handler.ts`, `doRelease`
  - **[PR-SCENE]** `src/battle-scene.ts`, `removePartyMemberModifiers`
  - `src/constants.ts`
