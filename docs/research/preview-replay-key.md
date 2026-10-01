# Preview replay key, cross-check — what the replay reads at v1.12.0.11

> **Second, independent reading.** The primary note for #520 is `docs/research/preview-replay-key.md` on branch
> `research/preview-replay-key`. This one was traced without sight of it and agrees on every substantive point. Where
> they differ, the primary note is the sharper one: it keys the arena pool as `(biomeId, arena.lastTimeOfDay)` rather
> than treating `biomeId` + live wave as a proxy, and it keys luck, Shiny Charm and Bug Net on wild waves only.

Source of truth: the pinned game at `.cache/pokerogue/v1.12.0.11/src` (paths below are relative to it) and the overlay
in `skills/coachemon/scripts/hud/`. This note comes from reading the source. Nothing was run.

## Answer

The **preview** replay (`48-preview.js` `replay`, which `previewFor` memoises by target wave) reads only these run
facts, and none of them is a party member's level:

- the seed and the target wave;
- the live wave and live battle, through the trainer party template, field size and arena pool;
- the arena's biome, plus `waveCycleOffset` and `offsetGym`, which the seed already fixes;
- the clamped party luck value;
- the double-battle chance, which depends on lure instances and on how many live-field ability slots carry
  `DoubleBattleChanceAbAttr`;
- Shiny Charm and Ability Charm **stack counts**;
- Golden Bug Net presence;
- the Endless `EnemyFusionChanceModifier` stacks, which live in **`enemyModifiers`**, not `modifiers`;
- `encounteredEvents` (append-only, so its length stands for it) and `encounterSpawnChance`;
- the active timed event, which depends on the wall clock;
- on a target wave that can roll a mystery encounter, a handful of party facts — but as **threshold classes**, not raw
  values.

The unreviewed claim gets the inventory mostly right. Its two biggest errors are in the mystery-encounter terms. Every
"primary pokémon" requirement makes a draw (`qualified[randSeedInt(n)]`) when **two or more** members qualify, and that
shifts the final encounter pick. So the HP ≥ 0.51 term, and the held-item and Bug-type terms, must be keyed as counts
classed 0 / 1 / ≥2, not as "any". Money only matters as a band against four wave-scaled thresholds. Its second miss: the
claim leaves out the active timed event, which the replay reads through luck, the shiny rate and the encounter pool.
Party levels, party order past the live field, and per-member `hp>0` are indeed not read directly; `hp>0` reaches the
replay only through luck, the field's ability slots and the allowed-member count. Today's run key misses charm stacks,
fusion luck, enemy-fusion stacks, money, berry stacks, held items, HP ratios and the event.

## Every game call the replay makes

`replay` (48-preview.js:75-178) runs inside `fork(s, w, s.seed)`, with `s.waveSeed` temporarily set to
`shiftCharCodes(seed, w)` (48-preview.js:79-81, 175). In call order:

| Overlay call (48-preview.js) | Game code | Live state read |
|---|---|---|
| `gm.isFixedBattle/getFixedBattle` :84 | game-mode.ts:357-376 | `battleConfig`, challenge hooks (static per run) |
| `fixedCfg.getTrainer()` :93-95 | data/trainers/fixed-battle-configs.ts:36,45,77,150,231,383; battle.ts:582-618 | `gameData.gender` (rival variant); unseeded `randInt` for grunts |
| `gm.isWaveTrainer(w)` :101 | game-mode.ts:206-247 | `arena.trainerChance` (= `allBiomes.get(biomeId)`, field/arena.ts:117-119), `offsetGym`, `isFixedBattle`, daily manipulation |
| `s.isWaveMysteryEncounter` :102 | battle-scene.ts:3452-3493, 3503-3512 | `encounteredEvents` (length, last `waveIndex`), `encounterSpawnChance`, mode's legal waves |
| `s.generateNewBattleTrainer` :105 (live battle still current) | battle-scene.ts:1481-1505; field/arena.ts:524-541; field/trainer.ts:45-104 | `arena.trainerPool`, `isTrainerBoss(…, offsetGym)`, `getDoubleBattleChance`, i18n name tables (`utils/i18n.ts:16-19`) |
| `s.checkIsDouble` :110 (live battle still current) | battle-scene.ts:1512-1538, 1261-1269 | lure instances; `getPlayerField()` = `party.slice(0, live currentBattle.double ? 2 : 1)` (battle-scene.ts:759-764); each field mon's ability and passive |
| `new Battle(…)` :111-112 (live battle still current) | battle.ts:109-157; field/trainer.ts:255-308 | `gameMode`; trainer `partyTemplateFunc` reads **live** `currentBattle.waveIndex` (data/trainers/trainer-party-template.ts:254-300) |
| `withBattle` → `s.getMysteryEncounter()` :117 | battle-scene.ts:3520-3664 | `encounteredEvents` (tiers, last type, per-type counts), `arena.biomeId`, timed event, `gameMode`/challenges, each candidate's `meetsRequirements()` |
| `trainer.genPartyMember(e)` :125 | field/trainer.ts:310-443, 445-530; ai/ai-species-gen.ts:127-164 | replayed battle (`enemyParty`, `waveIndex`, `trainer`); no player state |
| `s.randomSpecies(w, level, true)` :19 | battle-scene.ts:2326-2335 → field/arena.ts:577-634; modifier/modifier-type.ts:2906-2934 | `getPartyLuckValue(this.party)`; `arena.pokemonPool` (built at the last rebuild, field/arena.ts:546-562); `biomeId`; daily forced tier |
| Bug Net roll :130 | mirrors phases/encounter-phase.ts:112-120 | `BoostBugSpawnModifier` presence |
| `s.addEnemyPokemon(…)` :133 | battle-scene.ts:916-975; field/pokemon.ts:320-449, 6354-6436 | Ability Charm stacks (:640), enemy-fusion stacks (:431-433), Shiny Charm stacks (:2883-2886), `gameData.trainerId ^ secretId` (:2869), timed event (:2874-2880), `waveSeed` (:2977-2981), `arena.biomeId`/`getTimeOfDay` (battle-scene.ts:1909-1932), current phase (battle-scene.ts:1765-1767) |
| `s.getEncounterBossSegments` :133 | battle-scene.ts:1964-2005 | `seed`, `gameMode`, daily config |
| notes / confidence :144-170 | 03-calendar.js, 47-biome.js:147-155 | live wave, `biomeId`, `waveCycleOffset`, `arena.trainerChance` |

Enemy levels never read the party. `getLevelForWave` reads only the wave, the game mode and the RNG (battle.ts:131-157).
`Trainer.getPartyLevels` reads the wave, the game mode and the party template (field/trainer.ts:262-308).

## The claim, item by item

| Claim component | Verdict | Evidence |
|---|---|---|
| seed | **Confirmed** | `executeWithSeedOffset` sows `shiftCharCodes(seedOverride \|\| this.seed, offset)` (battle-scene.ts:2045-2060); 48-preview.js:27,83 |
| live wave | **Confirmed** | Live `currentBattle` is current at 48-preview.js:105-112, so `partyTemplateFunc` reads its `waveIndex` (trainer-party-template.ts:254-300) and `getPlayerField` reads its `double` (battle-scene.ts:759-764). The arena pool dates from the live wave's last rebuild (battle-scene.ts:1576-1578). `here` (48-preview.js:145) |
| target wave | **Confirmed** | It is the memo `k` (48-preview.js:231) |
| `biomeId` | **Confirmed** | `trainerChance` (arena.ts:117-119), `trainerPool` (arena.ts:524-541), `pokemonPool`, ME biome list (battle-scene.ts:3601-3602), shiny lock (48-preview.js:121). The biome changes mid-wave (SwitchBiomePhase, Teleporting Hijinks), so it is not covered by the wave |
| `waveCycleOffset`, `offsetGym` | **Confirmed, but redundant** | Both are set only by `setSeed` (battle-scene.ts:1110-1114). Cheap to keep |
| party luck as one value (`getPartyLuckValue`, allowed members, `luck + fusionLuck`) | **Confirmed** | modifier-type.ts:2906-2934; `isAllowedInBattle` = not fainted and allowed by challenge (pokemon.ts:577-579); `getLuck` (pokemon.ts:1815-1817). Read only on wild rolls (arena.ts:595-600). Includes the event boost and boosted species, and is seed-derived in Daily |
| count of applicable `DoubleBattleChanceAbAttr` on the live field | **Confirmed, with refinement** | Each field mon's **ability and passive count separately** (apply-ab-attrs.ts:80-103; a passive is skipped only if it has the same id, :27-29). `hasAbilityWithAttr` returns one boolean per mon, so it undercounts (pokemon.ts:2311-2316). `canApplyAbility` reads `hp>0`, suppression, the Neutralizing Gas tag, transform and fusion (pokemon.ts:2247-2286). The field has 2 slots when the **live** battle is a double |
| lure instances | **Confirmed** | Every `DoubleBattleChanceBoosterModifier` divides by 4 whatever its `battleCount` (modifier.ts:487-492; battle-scene.ts:1263). `battleCount` itself is not read |
| Shiny Charm stacks | **Confirmed** | `2^(1+stacks)` (modifier.ts:3006-3010), wild mons only (pokemon.ts:2883) |
| Ability Charm stacks | **Confirmed (wider than stated)** | `2^(-1-stacks)` (modifier.ts:2981-2985). It runs in the base constructor before `EnemyPokemon` sets `trainerSlot` (pokemon.ts:340 then :6378), so `hasTrainer()` is still false (:6897-6899) and the charm reaches **trainer** mons too |
| Bug Net presence | **Confirmed** | 48-preview.js:130,180; phases/encounter-phase.ts:112-120; max stack 1 (modifier.ts:3107-3126) |
| Endless enemy-fusion stacks | **Confirmed, location corrected** | `applyModifier(EnemyFusionChanceModifier, false, …)` reads **`s.enemyModifiers`** (battle-scene.ts:2964-2980; pokemon.ts:431-433). Each instance draws `randSeedFloat()` (modifier.ts:3703-3711). It runs during the base constructor, so trainer mons count too. Added after Endless X50 victories (phases/victory-phase.ts:116-121), while the live wave is unchanged |
| `encounteredEvents.length` | **Confirmed** | Its content is read (battle-scene.ts:3464-3470, 3572-3578, 3599, 3632-3638), but it is append-only (only `push`, phases/mystery-encounter-phases.ts:60), so the length stands for it |
| `encounterSpawnChance` | **Confirmed** | battle-scene.ts:3463. Read only when `isMysteryEncounterValidForWave` passes |
| money (ME only) | **Partially** | Read only against `getWaveMoneyAmount(m)` at the **target** wave for m ∈ {1.5, 1.75, 2, 4} (mystery-encounter-requirements.ts:383-412; battle-scene.ts:2399-2406; encounter files: shady-vitamin-dealer :47, fun-and-games :46, teleporting-hijinks :66, safari-zone :59, delibirdy :86, the-pokemon-salesman :54). A band 0-4 is exact; raw money over-keys |
| allowed-member count (ME only) | **Confirmed, narrower possible** | `PartySizeRequirement` defaults to `excludeDisallowedPokemon = true` → `getPokemonAllowedInBattle` (mystery-encounter.ts:862-868; requirements :313-348; battle-scene.ts:738-740). Minimums are 2, 3 and 4, max 6, so `min(n, 4)` is exact |
| berry stacks (ME only) | **Confirmed, narrower possible** | Absolute Avarice needs `Σ stackCount ≥ 6` over `BerryModifier` (absolute-avarice-encounter.ts:58; requirements :350-381): a boolean |
| held-item and type fingerprint (ME only) | **Partially** | Only two encounter-level requirements exist. Bug-Type Superfan takes the first non-empty of: transferable Quick Claw / Grip Claw holders, transferable Silver Powder holders, Bug-type members with fainted ones included (bug-type-superfan-encounter.ts:167-174). Delibirdy takes transferable Berry / Reviver Seed holders, else holders of any other transferable item outside its blacklist (delibirdy-encounter.ts:44-54, 87-93). Because of the draw above, each is a count class **0 / 1 / ≥2** (mystery-encounter.ts:357-415, draw at :412; `randSeedInt` does not draw for range ≤ 1, utils/common.ts:101-106) |
| any member at HP ratio ≥ 0.51 (ME only) | **Refuted as stated** | It has to be a count class **0 / 1 / ≥2** of members with `getHpRatio()` ∈ [0.51, 1], for the same draw reason (shady-vitamin-dealer-encounter.ts:48; requirements :1029-1075). `getHpRatio` rounds to the nearest 1% (pokemon.ts:1691-1693). Fainted members count as 0 |
| party levels not read | **Confirmed** | battle.ts:131-157; trainer.ts:262-308; no encounter-level `LevelRequirement`. Level reaches the replay only through the HP-ratio class |
| order beyond the lead not read | **Partially refuted** | During a live **double** battle, slot 1 is on the field too (battle-scene.ts:759-764). Past the field slots, order is not read; ME queries ignore order |
| per-member `hp>0` not read | **Partially refuted** | It is read, but only through derived values: luck (`isAllowedInBattle`), field `canApplyAbility`, the allowed count, the HP class. The derived values are the key; the raw vector is not needed |
| today's key misses charm stacks and fusion luck | **Confirmed** | 26-run.js:20 keys `modifiers.length`, but a stacked pickup increments `stackCount` in place (modifier.ts:201-212). 26-run.js:19 keys `p.luck`, which excludes `fusionLuck` |

## Reads the claim missed

1. **The timed event (wall clock).** It changes the luck boost (modifier-type.ts:2925-2933), the shiny threshold
   (pokemon.ts:2874-2880), the disabled encounters and the event tier of each encounter (battle-scene.ts:3600, 3612).
   `timedEventManager.isActive` compares `new Date()` (timed-event-manager.ts:24-30). Luck already folds the event's
   luck terms in; the rest still needs a proxy.
2. **The live battle's `double` and `waveIndex`** during trainer, double and level generation (see the table above).
   Both are covered by the live wave.
3. **`arena.pokemonPool`**, which is arena state rebuilt only on a new arena or at X5 (field/arena.ts:93-100, 546-562;
   battle-scene.ts:1576-1578). Covered by `biomeId` together with the live wave.
4. **Account constants:** `gameData.trainerId ^ secretId` (pokemon.ts:2869) and `gameData.gender` for the rival's
   variant (fixed-battle-configs.ts:36…383).
5. **The i18next language:** the locale's trainer-name table decides whether a name draw happens and which name comes
   out (field/trainer.ts:65-90; utils/i18n.ts:16-19).
6. **The current phase:** `getSpeciesFormIndex` checks for `EggLapsePhase`/`EggHatchPhase` (battle-scene.ts:1765-1767).
   This moves a few forms (Eevee and Pikachu for trainers before wave 30, Gimmighoul, specialty-type forms).
7. **Daily config** (`getDaily*`, `isDailyFinalBoss`), **game mode and challenges**. All are static within a run, so the
   seed covers them.
8. **Overlay state, not game state:** `model.missed` reads the module-level `stats.miss` inside the memo
   (48-preview.js:231-235). A miss recorded after the build stays invisible until the next rebuild, and a longer-lived
   key makes that worse.

Not read at all: `lastEnemyTrainer`, `lastMysteryEncounter`, the live `waveSeed` (overwritten), `rngOffset` and
`rngSeedOverride` (written and restored, never read for generation), weather, terrain, dex, starter and achievement
data, `pokeballCounts`, and `queuedEncounters`. That last loop never runs, because `encounter` is null there
(battle-scene.ts:3542-3555).

**What the replay mutates:**

- `s.waveSeed` and `s.currentBattle` (restored by the overlay);
- the RNG state, `rngOffset` and `rngSeedOverride` (restored by `executeWithSeedOffset` and by the sandbox);
- field mons' `waveData`/`summonData.abilitiesApplied`, because `getDoubleBattleChance` applies abilities
  non-simulated (apply-ab-attrs.ts:74-77). The sandbox restores these (01-core.js:138-157);
- `primaryPokemon`/`secondaryPokemon` on the shared `allMysteryEncounters` singletons, and `requiredMoney` on shared
  `MoneyRequirement`s. These are not restored. They are harmless, because the game recomputes both before any use and
  `new MysteryEncounter()` resets the former (mystery-encounter.ts:289-321);
- `movesetGenInProgress` (ai/ai-moveset-gen.ts:1222, 1320). It stays `true` if moveset generation throws, and while it
  is set, `canApplyAbility` skips the suppression checks (pokemon.ts:2256-2258).

## The exact replay key

```js
// s: the scene, w: target wave. Helpers: partyLuck (08-party.js), gameEvents (04-game-tables.js).
const named = (list, n) => (list ?? []).filter(m => m?.constructor?.name === n);
const stacks = (list, n) => named(list, n).reduce((t, m) => t + m.getStackCount(), 0);
// Ability and passive count separately, as applyAbAttrsInternal does.
const doubleSlots = p => [false, true].filter(passive => {
  const ab = passive ? p.getPassiveAbility() : p.getAbility();
  return (!passive || ab.id !== p.getAbility().id) && p.canApplyAbility(passive) && ab.hasAttr("DoubleBattleChanceAbAttr");
}).length;
const waveMoney = (w, m) => { const k = Math.ceil(w / 10) - 1;
  return Math.floor(Math.pow((k + 1 + (0.75 + (((w - 1) % 10) + 1) / 10)) * 100, 1 + 0.005 * k) * m / 10) * 10; };
const cls = a => Math.min(a.length, 2);
const holders = (party, pred) => party.filter(p => p.getHeldItems().some(it => it.isTransferable && pred(it)));
const firstHit = lists => lists.find(l => l.length) ?? [];
const OPT3 = ["BerryModifier", "PokemonInstantReviveModifier", "TerastallizeModifier", "PokemonBaseStatModifier", "PokemonBaseStatTotalModifier"];

const canBeME = (s, w) => {
  const ev = s.mysteryEncounterSaveData.encounteredEvents;
  return s.gameMode.isDaily // a daily seed can force one (battle-scene.ts:3453)
    || (s.isMysteryEncounterValidForWave(BattleType.WILD, w) && !s.gameMode.isFixedBattle(w)
      && (ev.length === 0 || w > 3 + ev.at(-1).waveIndex));
};
const meFacts = (s, w) => {
  const party = s.getPlayerParty();
  return [
    [1.5, 1.75, 2, 4].filter(m => s.money >= waveMoney(w, m)).length,
    Math.min(s.getPokemonAllowedInBattle().length, 4),
    named(s.modifiers, "BerryModifier").reduce((t, m) => t + m.stackCount, 0) >= 6,
    cls(firstHit([
      holders(party, it => ["BypassSpeedChanceModifier", "ContactHeldItemTransferChanceModifier"].includes(it.constructor.name)),
      holders(party, it => it.constructor.name === "AttackTypeBoosterModifier" && it.type.moveType === PokemonType.BUG),
      party.filter(p => p.isOfType(PokemonType.BUG, { includeTeraType: false })),
    ])),
    cls(firstHit([
      holders(party, it => ["BerryModifier", "PokemonInstantReviveModifier"].includes(it.constructor.name)),
      holders(party, it => !OPT3.includes(it.constructor.name)),
    ])),
    cls(party.filter(p => p.getHpRatio() >= 0.51 && p.getHpRatio() <= 1)),
  ];
};

const replayKey = (s, w) => JSON.stringify([
  s.seed,                                                          // high
  s.currentBattle.waveIndex,                                       // high
  w,                                                               // high (already the memo k)
  s.arena.biomeId,                                                 // high
  s.waveCycleOffset, s.offsetGym,                                  // high (redundant with seed)
  partyLuck(s.getPlayerParty(), s, gameEvents()),                  // high
  Math.min(named(s.modifiers, "DoubleBattleChanceBoosterModifier").length
    + s.getPlayerField().reduce((t, p) => t + doubleSlots(p), 0), 3), // high: max(base/4^n, 1) is the same for all n ≥ 3
  stacks(s.modifiers, "ShinyRateBoosterModifier"),                 // high
  stacks(s.modifiers, "HiddenAbilityRateBoosterModifier"),         // high
  named(s.modifiers, "BoostBugSpawnModifier").length > 0,          // high
  named(s.enemyModifiers, "EnemyFusionChanceModifier").map(m => m.getStackCount()), // high in source; medium on access (private field)
  s.mysteryEncounterSaveData.encounteredEvents.length,             // high
  s.mysteryEncounterSaveData.encounterSpawnChance,                 // high
  gameEvents()?.activeEvent?.()?.name ?? null,                     // medium (a proxy, see below)
  canBeME(s, w) ? meFacts(s, w) : null,                            // medium-high
]);
```

The overlay already relies on modifier constructor names surviving the build (48-preview.js:180; 49-ahead.js:36). The
money formula copies battle-scene.ts:2399-2406.

**Overall confidence: medium-high.** The non-ME core is high. The ME block is medium-high: it rests on the 31
encounter files' top-level requirement chains, which are the only ones evaluated before the pick. Option requirements
run after the pick (mystery-encounter.ts:486-489) and do not change the replay's output.

## The look-ahead remainder's key

`aheadModel` (49-ahead.js:118-156) reads these, outside the replay:

- **Schedule, heal, `rewardRules`, `finalNear`:** the live wave and static mode or challenge facts (03-calendar.js;
  49-ahead.js:20-27). `bigFightsAhead` makes 30 `isFixedBattle` calls (03-calendar.js:31-43).
- **Luck:** `partyLuck(party, s, events)`, the same value as the replay's luck term (49-ahead.js:131).
- **Readiness:** `partyProfile` over the **alive** members (49-ahead.js:150). It reads each member's `name`, `level`,
  `getTypes()`, ability and passive (01-core.js:33-34, 40-53) and moveset (08-party.js:10-15, 88-126), plus the
  previewed foes.
- **Eternatus facts:** only when the final wave is ≤ 10 waves ahead. It reads `party.length`, how many members have
  `hp > 0`, and each member's held-item stack total (49-ahead.js:97-114).

```js
const aheadKey = (s, nextWave /* schedule[0].wave or null */, finalNear) => {
  const party = s.getPlayerParty().filter(Boolean);
  const alive = party.filter(p => p.hp > 0);
  const wave = s.currentBattle.waveIndex;
  return JSON.stringify([
    wave,                                                          // high: schedule, heal, rewards, finalNear
    partyLuck(party, s, gameEvents()),                             // high
    alive.map(p => [p.id, p.name, p.level, p.getTypes(), abilitiesOf(p),
      (p.moveset ?? []).map(m => m?.moveId ?? null)]),             // medium-high; ordered, since hitters list in party order
    finalNear ? [party.length, party.map(p => [p.id, (s.modifiers ?? [])
      .filter(m => m?.pokemonId === p.id).reduce((t, m) => t + m.getStackCount(), 0)])] : null, // high
    nextWave != null && nextWave - wave <= 5 ? replayKey(s, nextWave) : null, // readiness reads the preview's foes
  ]);
};
```

**Confidence: medium-high.** Splitting the schedule into its own memo, keyed on the live wave alone, keeps the 30
`isFixedBattle` calls off party changes. The run key itself has to stay, because other buckets (biome, rewards,
encounter, learn, audit) still memoise on it.

Today's key misses one of the remainder's own inputs: moveset and type changes with no level or species change. A TM,
a Tera or a form change leaves readiness stale.

## What can't be keyed exactly

| Read | Proxy | Risk |
|---|---|---|
| Timed event (wall clock) | `gameEvents()?.activeEvent?.()?.name` | An event that starts or ends mid-session flips at the boundary the proxy sees. That is exact unless two events overlap with the same name. Low |
| `gameData.trainerId ^ secretId`, `gameData.gender` | omit | Constant for an account. A new account means a new run and a new seed. Very low |
| i18next language | omit (or `i18next.language`) | A mid-run language switch leaves trainer names in the old language until the next rebuild. Low |
| Egg phase in `getSpeciesFormIndex` | don't build or memoise a preview while `EggLapsePhase`/`EggHatchPhase` is current | A handful of form indices (and so the shown form, types and ability). Low |
| `enemyModifiers` (private TS field) | `s.enemyModifiers` by constructor name | Renamed by a refactor, it reads as "no stacks": an Endless preview goes stale after X50. Medium. The drift check would catch it |
| `arena.pokemonPool` | `biomeId` + live wave | Wrong only if the pool rebuilds without either changing. The source has no such path (battle-scene.ts:1576-1578; arena.ts:93-153). Low |

## Which of the 154 rebuild triggers still rebuild

| Trigger (wave-35 run) | Replay under the new key | Remainder under the new key |
|---|---|---|
| Faints and send-outs (66) | **Mostly no.** Rebuilds only when: the fainted or sent-out mon changes the field's `DoubleBattleChanceAbAttr` slot count; the fainted mon had luck > 0 (a shiny or a shiny fusion half); or the target wave can be an ME and the faint moves the allowed count across 2/3/4 or the HP ≥ 0.51 class across 0/1/≥2. Classic waves 10-180 are ME-eligible except X0/X1, so this applies through most of a wave-35 run | Faints: **yes** (the alive set changes). A pure send-out reorders the party: yes if the key stays ordered, no if alive members are keyed by id order |
| New waves (32) | **Yes, always** (live wave and target wave) | **Yes** |
| Level-ups (23) | **No.** Exceptions are rare: a level-up's HP gain moves the HP class on an ME-eligible target, or an evolution adds or removes Illuminate / Arena Trap / No Guard / Commander on the field, or changes Bug typing | **Yes** (level; types on an evolution) |
| Our switches (16) | **Only** when the field's double-chance slot count changes | Only through party order (see faints) |
| Items (13) | **Only** for: Shiny or Ability Charm stacks; a lure instance added or expired; the Golden Bug Net; Endless enemy-fusion stacks; and, on an ME-eligible target, berries crossing 6, held-item classes and the money band | Only when the Eternatus block is live (held stacks), or never otherwise |

Rebuilds the new key **adds** over today's: money-band crossings (shop, rewards), HP-class crossings from damage taken
(today keys only `hp>0`), held-item moves, charm stacks, enemy-fusion stacks and event boundaries. Each is either rare or
bounded by a coarse class, and each one fixes a case where today's preview can be stale.
