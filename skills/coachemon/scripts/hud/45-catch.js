// Catch coach: for a wild foe, the chance each ball we hold catches it, what catching it is worth (to the team, to
// the account) and whether a throw ends a dangerous encounter cheaper than fighting it out.
//
// ---- How the game decides (see game-code.md §20; not called live)
// AttemptCapturePhase.start (B = the scene):
//   B.pokeballCounts[this.pokeballType]--; let m=3*e.getMaxHp(),v=2*e.hp,y=e.species.catchRate,
//   x=getPokeballCatchMultiplier(ball), S=e.status?getStatusEffectCatchRateMultiplier(e.status.effect):1,
//   C=e.isShiny()?timedEventManager.getShinyCatchMultiplier():1, w=Math.round((m-v)*y*x/m*S*C),
//   E=Math.round(65536/(255/w)**.1875), O=getCriticalCaptureChance(w), k=e.randBattleSeedInt(256)<O
// - Ball multipliers (getPokeballCatchMultiplier): 0 Poké 1, 1 Great 1.5, 2 Ultra 2, 3 Rogue 3, 4 Master -1
//   (5 Luxury 1, not in pokeballCounts). Atlas frames (getPokeballAtlasKey / AddPokeballModifierType icons in the
//   `items` atlas): pb gb ub rb mb.
// - Status (getStatusEffectCatchRateMultiplier): `case 1:case 2:case 3:case 6:return 1.5;case 4:case 5:return 2.5`
//   → poison/toxic/paralysis/burn ×1.5, sleep/freeze ×2.5. Shiny: `timedEventManager.getShinyCatchMultiplier()`,
//   `activeEvent()?.shinyCatchMultiplier ?? 2` (×3 during some events). The manager is module-private: 47-biome's
//   chunk scan picks it up by shape, and ×2 stands in until it has. `isShiny()` is the base *or* the fusion shiny.
// - Shakes (the tween's onRepeat): `if(t++<(k?1:3)) x===-1||k||w>=255||e.randBattleSeedInt(65536)<E ? shake : failCatch
//   else if(k&&e.randBattleSeedInt(65536)>=E) failCatch else lock` → a normal throw needs 3 checks of E/65536, a
//   critical capture 1; Master Ball (x=-1) and w≥255 always hold.
// - getCriticalCaptureChance(w): `if(isFreshStartChallenge())return 0; t=getSpeciesCount(e=>!!e.caughtAttr);
//   n=1 (×(1.5+stack/2) with CriticalCatchChanceBoosterModifier / Catching Charm);
//   Math.floor(n*(isDaily||t>800?2.5:t>600?2:t>400?1.5:t>200?1:t>100?.5:0)*Math.min(255,w)/6)` out of 256.
//   So P(catch) = c·s + (1−c)·s³ with s = min(1, E/65536), c = O/256. No abilities, biomes or held items enter it.
// When a ball may be thrown (CommandPhase.checkCanUseBall / handleBallCommand):
// - trainer battles never (`y===1 → noPokeballTrainer`); mystery encounters only with `mysteryEncounter.catchAllowed`;
// - the End biome (biomeId 50, wild), checkCanUseBall: classic (challenge runs too) before the final boss only when every
//   active foe's species is caught; the classic final boss only while at most one starter is uncaught
//   (`getStarterCount(caught) < getAllStarters().length - 1` refuses); a full Fresh Start never; endless never (wave
//   % 250 bosses included); daily only away from its final boss, or at a final boss its event seed marks catchable;
// - only one foe on the field (`t.length>1 → noPokeballMulti`): in doubles, KO one first;
// - bosses: `x.isBoss()&&x.bossSegmentIndex>=1&&!x.hasAbility(25 /* Wonder Guard */)` → the classic final boss
//   refuses everything but a challenge-free Master Ball (`hasAnyChallenges()` — true for every challenge run, since
//   the mode copies the whole challenge list); any other boss refuses every ball but Master (`e<4`) until its last
//   bar, and a *catchable Daily* final boss refuses that one too (`isCatchableDailyBoss||e<4`). The formula itself
//   has no boss term: on the last bar hp ≤ maxHp/segments.
// What a catch does (AttemptCapturePhase.catch):
// - `unshiftNew('VictoryPhase')` → full EXP and the win (battle ends if it was the last wild foe on the field);
// - `gameData.setPokemonCaught(e)` → dexData[species].caughtAttr |= getDexAttr() (gender 4n/8n, shiny 2n/non 1n,
//   variant 16n/32n/64n, form 1n<<(7+formIndex)), the same up the prevolution chain (so the root starter unlocks),
//   starterData[starter].abilityAttr |= 1<<abilityIndex (ABILITY_1 1, ABILITY_2 2, ABILITY_HIDDEN 4), candy to the
//   **prevolution-free** species the walk ends at, not to the first starter it passes: `isShiny()?5*2**variant:1`,
//   ×2 for a boss — but in a Daily run only when the catch adds a dex attribute of its own
//   (`!isDaily||hasNewAttr||fromEgg`, `hasNewAttr = (caughtAttr & dexAttr) !== dexAttr`, `dexAttr` itself masked by
//   that species' `getFullUnlocksData()`); `updateSpeciesDexIvs(getRootSpeciesId(true), ivs)` keeps the max IV per
//   stat, from the starter root down;
// - LimitedCatchChallenge (challenge 7) keeps it out of the party unless met on a wave ending in 1; otherwise a full
//   party (6) asks to release someone or let it go.
// A failed throw uses the turn: the ball command resolves before any move, then the foe acts.
//
// What this card reads, and from where. The **turn** (`25-turn.js`) answers everything about the battle — the
// damage that would lower the foe's HP, what it does back, the mode flags a ball is refused on, the ball counts.
// The **account** is the run's own data, read once a refresh by 98-tick and handed in: the dex, the starter table,
// the party and the event's shiny multiplier. Neither is the scene, so this file has no path to it — and
// 46-encounter, which judges a mon a Mystery Encounter hands over with no battle turn at all, reads `catchWorth`
// with the same account.
import { abilitiesOf, hasAttr, iconOf, typesOf } from "./01-core.js";
import { damagingTypes, partyProfile, partyReasons } from "./08-party.js";
import { koCurve, koTurn, useOf } from "./10-damage.js";
import { exchange, threatFrom } from "./30-planner.js";

const BALLS = [
  { id: PokeballType.POKEBALL, ball: "Poké Ball", short: "PB", key: "pb", mult: 1 },
  { id: PokeballType.GREAT_BALL, ball: "Great Ball", short: "GB", key: "gb", mult: 1.5 },
  { id: PokeballType.ULTRA_BALL, ball: "Ultra Ball", short: "UB", key: "ub", mult: 2 },
  { id: PokeballType.ROGUE_BALL, ball: "Rogue Ball", short: "RB", key: "rb", mult: 3 },
  { id: PokeballType.MASTER_BALL, ball: "Master Ball", short: "MB", key: "mb", mult: -1 },
];
const STATUS_MULT = {
  [StatusEffect.POISON]: 1.5, [StatusEffect.TOXIC]: 1.5, [StatusEffect.PARALYSIS]: 1.5,
  [StatusEffect.SLEEP]: 2.5, [StatusEffect.FREEZE]: 2.5, [StatusEffect.BURN]: 1.5,
};

// P(catch) for one throw, in closed form. `critFactor`: the multiplier in front of min(255, w)/6 (0 = no criticals).
export const captureChance = ({ maxHp, hp, catchRate, ball, status = 0, shiny = false, critFactor = 0, shinyMult = 2 }) => {
  const mult = BALLS[ball]?.mult ?? 1;
  if (mult === -1) return 1;
  const m = 3 * maxHp;
  const w = Math.round((m - 2 * hp) * catchRate * mult / m * (STATUS_MULT[status] ?? 1) * (shiny ? shinyMult : 1));
  if (w >= 255) return 1;
  if (!(w > 0)) return 0;
  const shake = Math.min(1, Math.round(65536 / (255 / w) ** 0.1875) / 65536);
  const crit = Math.max(0, Math.min(256, Math.floor(critFactor * Math.min(255, w) / 6))) / 256;
  return crit * shake + (1 - crit) * shake ** 3;
};

const big = x => { try { return BigInt(x ?? 0); } catch { return 0n; } };
const tryDo = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const isShinyMon = p => tryDo(() => p.isShiny(), !!p.shiny || (!!p.fusionSpecies && !!p.fusionShiny));

const critFactorOf = (turn, account) => {
  const { mode, modifiers } = turn.facts;
  if (mode.noCriticalCatch) return 0;
  let n = 0;
  for (const d of Object.values(account.dex)) if (d && big(d.caughtAttr)) n++;
  const charm = modifiers.find(x => x.constructor?.name === "CriticalCatchChanceBoosterModifier");
  const boost = charm ? 1.5 + (charm.getStackCount?.() ?? charm.stackCount ?? 1) / 2 : 1;
  return boost * (mode.daily || n > 800 ? 2.5 : n > 600 ? 2 : n > 400 ? 1.5 : n > 200 ? 1 : n > 100 ? 0.5 : 0);
};

// Why no ball can be thrown at all this battle, or null.
const battleBlocked = (turn, account, active) => {
  const { trainer, battleType, mysteryEncounter, biomeId, mode } = turn.facts;
  if (trainer || battleType === BattleType.TRAINER) return "trainer";
  if (battleType === BattleType.MYSTERY_ENCOUNTER && !mysteryEncounter?.catchAllowed) return "mystery encounter";
  if (biomeId === BiomeId.END && (battleType ?? BattleType.WILD) === BattleType.WILD) {
    const dex = account.dex;
    const uncaught = active.some(f => !big(dex[f.species?.speciesId]?.caughtAttr));
    // starterData holds an entry for every starter (initStarterData), so its keys are getAllStarters().
    const missing = Object.keys(account.starter).filter(id => !big(dex[id]?.caughtAttr)).length;
    if ((mode.classic && !mode.finalBoss && uncaught) || (mode.freshStart && !mode.finalBoss) || (mode.endless && !mode.endlessMinorBoss)) return "End biome";
    if ((mode.classic && mode.finalBoss && missing > 1) || (mode.freshStart && mode.finalBoss) || (mode.endless && mode.endlessMinorBoss)
      || (mode.daily && mode.waveFinal && !mode.dailyBossCatchable)) return "final boss";
  }
  return null;
};

// A boss with bars left refuses every ball but a Master Ball — except where `CommandPhase.handleBallCommand`
// refuses that one too: the classic final boss of a **challenge** run (`hasAnyChallenges()`, which is every
// challenge run — the mode copies the whole challenge list, values and all), and a Daily final boss its event seed
// marks catchable (`isCatchableDailyBoss`), the one boss the End-biome rule above lets a ball through to at all.
const masterBlocked = turn => {
  const { mode } = turn.facts;
  if (mode.finalBoss) return mode.anyChallenges;
  return mode.daily && mode.waveFinal && !!mode.dailyBossCatchable;
};

// ---- Team value
// What the foe is worth to *this* party is the party profile's call (`08-party.js`), so the biome card judging the
// same species reaches the same verdict. What each reason is worth in a ball is this card's own: `w` below.
const teamReasons = (account, foe, limited) => {
  const all = account.party.filter(Boolean);
  const out = [];
  if (limited) return { out: [{ kind: "team", text: "Limited Catch: won't join the party", w: 0 }], replace: null };
  if (!all.length) return { out, replace: null };

  const profile = partyProfile(all);
  // A wild foe is a candidate with a known moveset: its own damaging types are what it would bring to the team.
  const reasons = partyReasons(profile, { species: foe.species, fusion: foe.fusionSpecies ?? null, level: foe.level,
    types: typesOf(foe), abilities: abilitiesOf(foe), moveTypes: damagingTypes(foe) });
  // Its line is already on the team: a second one adds nothing, whatever else it brings.
  if (reasons.some(r => r.kind === "dupe")) return { out, replace: null };

  const show = x => (x.estimated ? `~${x.final}` : `${x.final}`);
  for (const r of reasons) {
    if (r.kind === "covers") out.push({ kind: "team", text: `covers ${r.types.slice(0, 2).join("/")} weakness`, w: r.types.length > 1 ? 1.5 : 1 });
    if (r.kind === "hole") out.push({ kind: "team", text: `hits ${r.types.slice(0, 3).join("/")} (no one else does)`, w: 0.5 });
    if (r.kind === "upgrade") {
      out.push({ kind: "team", w: 2,
        text: `stronger than ${r.against.name} (${r.estimated || r.against.estimated ? "final " : ""}BST ${show(r)} vs ${show(r.against)})` });
    }
  }
  // A full party makes room by releasing someone: name who, if the catch is a team upgrade at all.
  const weakest = profile.weakest?.mon ?? null;
  const replace = all.length >= 6 && out.length && weakest ? { icon: iconOf(weakest), name: weakest.name } : null;
  if (replace) out.push({ kind: "team", text: `party full: replaces ${weakest.name}`, w: 0 });
  return { out, replace };
};

// The line a species belongs to, for the dex reasons below: a starter unlock and "already using one" are about
// the root, not the form in front of you. The team side asks the party profile instead.
const rootOf = p => tryDo(() => p.species.getRootSpeciesId(true), p.species?.speciesId) ?? p.species?.speciesId;
// Candy is a different root. `setPokemonSpeciesCaught` walks the line down and pays at the species that has no
// prevolution at all (`!hasPrevolution`, `src/system/game-data.ts:1845`) — `getRootSpeciesId(false)`, not the first
// starter `getRootSpeciesId(true)` stops at. The two differ only on Pikachu's line, the game's own TODO at
// `game-data.ts:1869-1871` saying Pikachu is the only evolved starter: for a caught Raichu the candy, and the
// `hasNewAttr` that gates it in a Daily run, are Pichu's entry and not Pikachu's.
const candyRootOf = p => tryDo(() => p.species.getRootSpeciesId(false), p.species?.speciesId) ?? p.species?.speciesId;

// ---- Account value (dex, starter unlocks, abilities, IVs, shinies). Pure reads of gameData.
const IV_TOTAL = 30, IV_STAT = 15;
const accountReasons = (account, foe) => {
  const out = [];
  const sp = foe.species;
  if (!sp) return out;
  const dex = account.dex[sp.speciesId];
  const caught = big(dex?.caughtAttr);
  const root = rootOf(foe);
  const rootDex = account.dex[root];
  // Nothing cuts that walk short on the way down. A species that is itself a starter and is new to the dex shows the
  // "added as a starter" message first and recurses from the message's own callback
  // (`checkPrevolution(true)`, `game-data.ts:1866-1885`), so a first Pikachu still reaches Pichu and still pays. The
  // one return that skips the recursion is `!showMessage` (`:1871`), and no thrown ball takes it: `AttemptCapturePhase`
  // calls `setPokemonCaught(pokemon)` with its defaults (`attempt-capture-phase.ts:311`), as does a Mystery
  // Encounter's catch.
  const candyRoot = candyRootOf(foe);
  const candyDex = account.dex[candyRoot];
  const rare = sp.legendary || sp.subLegendary || sp.mythical;
  if (!caught) {
    out.push({ kind: "account", text: root !== sp.speciesId && !big(rootDex?.caughtAttr) ? "new species + starter" : "new species", w: 3 });
    if (rare) out.push({ kind: "account", text: sp.mythical ? "mythical" : "legendary", w: 2 });
  }
  // getDexAttr(): gender, shiny, variant, form bits.
  const variant = foe.variant ?? 0;
  const attr = (foe.gender === Gender.GENDERLESS || foe.gender == null ? 0n : foe.gender === Gender.FEMALE ? 8n : 4n)
    | (foe.shiny ? 2n : 1n) | (variant >= 2 ? 64n : variant === 1 ? 32n : 16n) | (1n << BigInt(7 + (foe.formIndex ?? 0)));
  // Candy follows isShiny() (a shiny fusion half counts) with the base variant; the dex's shiny bit only the base.
  const candy = 5 * 2 ** variant * (foe.isBoss?.() ? 2 : 1);
  // A Daily run pays candy only for a catch that adds a dex attribute of its own (`!isDaily || hasNewAttr`), asked of
  // the entry the candy would go to: a shiny already in the dex with this gender, variant and form is worth the same
  // shiny it always was, and no candy.
  // The game asks `hasNewAttr` of the **masked** attributes: `pokemon.getDexAttr() & species.getFullUnlocksData()`
  // (`game-data.ts:1766`, mask at `pokemon-species.ts:1203-1230`), which drops the bits that species can never own —
  // an `isUnobtainable` form, a gender its ratio rules out. The mask only ever narrows, so reading `attr` raw makes
  // "something new here" too easy to believe and promises candy a Daily run won't pay. The mask is the one belonging
  // to the species the candy goes to, which is why the account carries the registry; without it, the raw bits stand.
  // Only this line is masked. The reasons below read the foe's *own* entry, and every bit they test is one the foe in
  // front of us demonstrably has — it is standing there with that gender, variant and form — so the mask would drop
  // nothing, bar an `isUnobtainable` form, which is left standing on purpose: masking it away would turn "new form"
  // into a claim about no form at all.
  const unlocks = tryDo(() => account.species?.getSpecies?.(candyRoot)?.getFullUnlocksData?.());
  const candyAttr = typeof unlocks === "bigint" ? attr & unlocks : attr;
  const candyText = account.daily && (big(candyDex?.caughtAttr) & candyAttr) === candyAttr ? "" : ` · +${candy} candy`;
  if (foe.shiny) {
    if (caught && !(caught & 2n)) out.push({ kind: "account", text: `first shiny${candyText}`, w: 3 });
    else if (caught && (caught & attr & 112n) !== (attr & 112n)) out.push({ kind: "account", text: `new shiny variant${candyText}`, w: 2.5 });
    else out.push({ kind: "account", text: `shiny${candyText}`, w: 2 });
  } else if (isShinyMon(foe)) out.push({ kind: "account", text: `shiny fusion${candyText}`, w: 1.5 });
  if (caught && (caught & (attr & ~127n)) === 0n) out.push({ kind: "account", text: "new form", w: 2 });

  const ab = foe.abilityIndex ?? 0;
  const bit = ab !== 1 || sp.ability2 ? 1 << ab : AbilityAttr.ABILITY_HIDDEN;
  // Unknown root (no game call to find it): don't guess.
  const known = account.starter[root]?.abilityAttr;
  if (known != null && !(known & bit)) {
    if (ab === 2 && sp.abilityHidden) out.push({ kind: "account", text: "new hidden ability", w: 2 });
    else if (caught) out.push({ kind: "account", text: "new ability", w: 0.5 });
  }

  const dexIvs = rootDex?.ivs;
  if (big(rootDex?.caughtAttr) && Array.isArray(dexIvs) && Array.isArray(foe.ivs)) {
    const gains = foe.ivs.map((v, i) => Math.max(0, v - (dexIvs[i] ?? 0)));
    const total = gains.reduce((t, x) => t + x, 0);
    // Early dex IVs are low, so small gains come with nearly every wild mon: only a big one counts, and it's only
    // worth a card for a line we're using.
    const using = account.party.some(p => p && rootOf(p) === root);
    if (total >= IV_TOTAL || Math.max(...gains) >= IV_STAT) {
      out.push({ kind: "account", text: `IVs +${total} on ${gains.filter(Boolean).length} stats${using ? " (on the team)" : ""}`, w: using ? 2 : 1 });
    }
  }
  return out;
};

// ---- Ending the encounter
// Our fastest KO of `foe` from the field against what it deals meanwhile. `p`: the throw's chance with a cheap ball.
// Chip damage over the whole fight that makes it dangerous, as a share of our HP: only a fight that wears us down to a
// KO. A slow fight that costs HP a heal fixes isn't worth a ball and a party slot.
const CHIP = 1;
// Without the planner: the `hits` record that KOs `target` soonest by the KO pacing core, then the hardest hitting.
const fastestHit = (turn, a, target) => turn.outcomes(a, target).filter(x => x.dmg > 0)
  .map(x => ({ x, turns: koTurn(koCurve(turn.mon(target), useOf(x)).by) }))
  .reduce((b, y) => (!b || y.turns < b.turns || (y.turns === b.turns && y.x.dmg > b.x.dmg) ? y : b), null);
const escapeReason = (turn, foe, party, p) => {
  if (!(p > 0)) return null;
  let best = null;
  for (const me of party.filter(x => x.isOnField?.())) {
    let turns = 9, first = turn.mon(me).speed >= turn.mon(foe).speed ? 1 : 0, theyFirst = 0;
    try {
      for (const pm of (me.moveset ?? []).filter(Boolean)) {
        const mv = pm.getMove?.();
        if (!mv || mv.category === MoveCategory.STATUS) continue;
        const x = exchange(turn, me, pm, foe);
        if (x && (x.turnsWe < turns || (x.turnsWe === turns && x.pTheyKoFirst < theyFirst))) {
          turns = x.turnsWe; theyFirst = x.pTheyKoFirst ?? 0; first = x.pFirst ?? first;
        }
      }
    } catch { turns = fastestHit(turn, me, foe)?.turns ?? 9; }
    let dmg = 0, pKo = 0;
    try {
      const t = threatFrom(turn, foe, me);
      if (t) { dmg = t.expected ?? 0; pKo = t.pKo ?? 0; }
      else { dmg = fastestHit(turn, foe, me)?.x.dmg ?? 0; pKo = dmg >= me.hp ? 1 : 0; }
    } catch {}
    // Foe turns before our finishing blow, against failed throws (each gives it one).
    const hitsFight = turns >= 9 ? 9 : Math.max(0, turns - first);
    const hitsThrow = (1 - p) / p;
    const danger = theyFirst >= 0.3 || (pKo >= 0.5 && turns >= 2) || dmg * hitsFight >= me.hp * CHIP;
    if (danger && hitsThrow + 0.25 < hitsFight && (!best || hitsFight - hitsThrow > best.gain)) {
      best = { gain: hitsFight - hitsThrow, me, turns, pKo };
    }
  }
  if (!best) return null;
  const how = best.turns >= 9 ? "we can't KO it" : `${best.turns} turns to KO`;
  return { kind: "escape", text: `ends it: ${how}${best.pKo >= 0.5 ? `, it KOs ${best.me.name}` : ""}`, w: 0 };
};

// A throw's odds rise as HP falls, but a hit that KOs it ends the catch: name what brings it down safely. False Swipe
// and Hold Back (SurviveDamageAttr) leave at least 1 HP; otherwise the strongest attack on the field that can't KO it.
const RISKY_KO = 0.05;
const lowerHpTip = (turn, foe, party) => {
  const field = party.filter(x => x.isOnField?.());
  const by = me => (field.length > 1 ? `${me.name}'s ` : "");
  for (const me of field) {
    for (const pm of (me.moveset ?? []).filter(Boolean)) {
      let mv = null;
      try { mv = pm.getMove(); } catch {}
      if (mv && hasAttr(mv, "SurviveDamageAttr") && (pm.getMovePp?.() ?? 1) - (pm.ppUsed ?? 0) > 0) return `lower its HP with ${by(me)}${pm.getName()}`;
    }
  }
  let safe = null, risky = false;
  for (const me of field) {
    for (const o of turn.outcomes(me, foe)) {
      if (!(o.expected > 0)) continue;
      if (o.pKo > RISKY_KO) risky = true;
      else if (!safe || o.expected > safe.o.expected) safe = { me, o };
    }
  }
  if (safe) return `lower its HP with ${by(safe.me)}${safe.o.name} (won't KO)`;
  return risky ? "careful: our attacks can KO it" : "lower its HP first";
};

// ---- Ball choice
// The dearest ball a catch of this value deserves: Poké/Great for nothing special (Ultra when there are plenty),
// Ultra for a solid catch, Rogue for a valuable one, Master only for something rare.
const maxBallFor = (value, counts) => (value >= 5 ? PokeballType.MASTER_BALL : value >= 2.5 ? PokeballType.ROGUE_BALL : value >= 1.5 || counts[PokeballType.ULTRA_BALL] >= 5 ? PokeballType.ULTRA_BALL : PokeballType.GREAT_BALL);
const GOOD = 0.6;
// The least value that earns a card: one real reason (new species/form, hidden ability, shiny, clear upgrade, a big
// IV gain on the team's line) or two lesser ones together.
const SHOW = 2;
const pickBall = (chance, maxId) => {
  const allowed = chance.filter(c => c.id <= maxId && c.count > 0 && c.p > 0);
  return allowed.find(c => c.p >= GOOD) ?? allowed.reduce((b, c) => (!b || c.p > b.p ? c : b), null);
};

const targetAdvice = (turn, account, foe, party, crit, counts, multi, noMaster) => {
  const bossLocked = !!foe.isBoss?.() && (foe.bossSegmentIndex ?? 0) >= 1
    && !(turn.live ? turn.mon(foe).hasAbility(AbilityId.WONDER_GUARD) : abilitiesOf(foe).includes("Wonder Guard"));
  // With bars left this boss refuses every ball there is, Master included.
  const sealed = bossLocked && noMaster;
  const chance = BALLS.filter(x => counts[x.id] > 0).map(x => ({
    id: x.id, ball: x.ball, short: x.short, key: x.key, count: counts[x.id],
    p: bossLocked && (sealed || x.id < PokeballType.MASTER_BALL) ? 0 : Math.round(captureChance({
      maxHp: foe.getMaxHp(), hp: foe.hp, catchRate: foe.species?.catchRate ?? 0, ball: x.id,
      status: foe.status?.effect ?? 0, shiny: isShinyMon(foe), shinyMult: account.shinyCatchMultiplier, critFactor: crit,
    }) * 1000) / 1000,
  }));

  const team = teamReasons(account, foe, turn.facts.mode.limitedCatch && turn.facts.wave % 10 !== 1);
  const reasons = [...accountReasons(account, foe), ...team.out];
  let value = reasons.reduce((t, r) => t + r.w, 0);
  const cheap = pickBall(chance, value >= 1.5 ? maxBallFor(value, counts) : maxBallFor(0, counts));
  const escape = !multi && cheap ? escapeReason(turn, foe, party, cheap.p) : null;
  if (escape) reasons.push(escape);
  const best = pickBall(chance, maxBallFor(value, counts));
  const p = best?.p ?? 0;
  const hp = foe.hp / foe.getMaxHp();

  // Below SHOW nothing is worth a ball (a covered weakness or a small IV gain alone isn't): skip, and skips aren't drawn.
  let verdict = "skip";
  if ((value >= 2.5 && p >= 0.3) || (value >= SHOW && p >= 0.5) || (escape && p >= 0.5)) verdict = "catch";
  else if (value >= SHOW || (escape && p >= 0.25)) verdict = "maybe";

  // Ending a dangerous fight leads when it's there: it's what makes a throw urgent this turn.
  const rank = r => (r.kind === "escape" ? 9 : r.w);
  const main = reasons.filter(r => r.w > 0 || r.kind === "escape").sort((x, y) => rank(y) - rank(x)).map(r => r.text);
  // What blocks a throw goes first; how to raise a middling chance goes last.
  const blockers = [], tips = [];
  if (multi && verdict !== "skip") { verdict = "maybe"; blockers.push("KO the other foe first"); }
  if (sealed && verdict !== "skip") blockers.push("break its bars first — no ball works on this boss");
  else if (bossLocked && verdict !== "skip") blockers.push(counts[PokeballType.MASTER_BALL] > 0 && value >= 5 ? "Master Ball, or break its bars first" : "break its bars first — only a Master Ball works now");
  else if (verdict !== "skip" && p < GOOD) {
    if (hp > 0.5) tips.push(lowerHpTip(turn, foe, party));
    else if (!foe.status?.effect) {
      // The wave's status-cure tokens (EnemyStatusEffectHealChanceModifier): 2.5 % a stack at each turn end.
      const cure = turn.facts.enemyModifiers.filter(m => m.constructor?.name === "EnemyStatusEffectHealChanceModifier")
        .reduce((t, m) => t + 2.5 * (m.getStackCount?.() ?? 1), 0);
      tips.push(`sleep/paralyse it for better odds${cure ? ` (it cures itself ${Math.min(100, cure)}%/turn)` : ""}`);
    }
  }
  let why;
  if (verdict === "skip") why = reasons.some(r => r.w > 0) ? `low chance, ${main.slice(0, 2).join(", ")}` : p < 0.3 ? "low chance, nothing new" : "nothing new";
  else why = [...blockers, ...main.slice(0, 2), ...tips].join(", ");

  return {
    icon: iconOf(foe), name: foe.name, hp: Math.round(hp * 100),
    chance: chance.map(({ id, ...c }) => c),
    best: best && p > 0 ? { ball: best.ball, short: best.short, key: best.key, count: best.count, p } : null,
    reasons: reasons.map(({ kind, text }) => ({ kind, text })),
    replace: team.replace, boss: bossLocked, verdict, why,
  };
};

export const catchAdvice = (turn, account) => {
  const party = turn.facts.party.filter(p => p && p.hp > 0);
  const foes = turn.facts.foes.filter(f => f && f.hp > 0);
  if (!foes.length || !party.length) return null;
  const counts = BALLS.map(x => turn.facts.balls(x.id));
  const onField = foes.filter(f => f.isOnField?.());
  const active = onField.length ? onField : foes.slice(0, 1);
  if (battleBlocked(turn, account, active) || !counts.some(Boolean)) return null;
  const crit = critFactorOf(turn, account);
  const multi = active.length > 1;
  const noMaster = masterBlocked(turn);
  const targets = active.map(f => targetAdvice(turn, account, f, party, crit, counts, multi, noMaster));
  // Two foes out: no ball can be thrown yet, so only speak up for one worth keeping alive.
  if (multi && targets.every(t => t.verdict === "skip")) return null;
  return { targets };
};

// What owning `foe` is worth with no ball in the picture: the account and team reasons a throw is weighed on, for a
// mon a Mystery Encounter hands over. No turn: this is the account's question, not the battle's.
export const catchWorth = (account, foe) => {
  const reasons = [...accountReasons(account, foe), ...teamReasons(account, foe, false).out];
  return { value: reasons.reduce((t, r) => t + r.w, 0), reasons: reasons.map(r => r.text), show: SHOW };
};
