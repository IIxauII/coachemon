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
//   refuses everything but a challenge-free Master Ball; any other boss refuses every ball but Master (`e<4`)
//   until its last bar. The formula itself has no boss term: on the last bar hp ≤ maxHp/segments.
// What a catch does (AttemptCapturePhase.catch):
// - `unshiftNew('VictoryPhase')` → full EXP and the win (battle ends if it was the last wild foe on the field);
// - `gameData.setPokemonCaught(e)` → dexData[species].caughtAttr |= getDexAttr() (gender 4n/8n, shiny 2n/non 1n,
//   variant 16n/32n/64n, form 1n<<(7+formIndex)), the same up the prevolution chain (so the root starter unlocks),
//   starterData[starter].abilityAttr |= 1<<abilityIndex (ABILITY_1 1, ABILITY_2 2, ABILITY_HIDDEN 4), candy to the
//   root: `isShiny()?5*2**variant:1`, ×2 for a boss; `updateSpeciesDexIvs(root, ivs)` keeps the max IV per stat;
// - LimitedCatchChallenge (challenge 7) keeps it out of the party unless met on a wave ending in 1; otherwise a full
//   party (6) asks to release someone or let it go.
// A failed throw uses the turn: the ball command resolves before any move, then the foe acts.
//
// Every game method call here (hasAbility, getRootSpeciesId, gameMode checks, the planner's damage code) runs inside
// `sandbox` while the game waits for a command; otherwise field reads and the approximations stand in.

const { captureChance, catchAdvice, catchWorth, damagingTypes, finalBstOf, teamWeakTypes } = (() => {
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
  const captureChance = ({ maxHp, hp, catchRate, ball, status = 0, shiny = false, critFactor = 0, shinyMult = 2 }) => {
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
  const call = (live, fn, fallback) => { if (!live) return fallback; try { return fn(); } catch { return fallback; } };

  // The event's shiny multiplier, when 47-biome has found the game's event manager.
  const shinyMultOf = () => {
    try { return (typeof gameEvents === "function" ? gameEvents()?.getShinyCatchMultiplier() : null) ?? 2; } catch { return 2; }
  };
  const isShinyMon = (p, live) => call(live, () => p.isShiny(), !!p.shiny || (!!p.fusionSpecies && !!p.fusionShiny));

  const critFactorOf = (s, live) => {
    const mode = s.gameMode ?? {};
    if (call(live, () => mode.isFreshStartChallenge(), (mode.challenges ?? []).some(c => c.id === Challenges.FRESH_START && c.value > 0))) return 0;
    let n = 0;
    for (const d of Object.values(s.gameData?.dexData ?? {})) if (d && big(d.caughtAttr)) n++;
    const charm = (s.modifiers ?? []).find(x => x.constructor?.name === "CriticalCatchChanceBoosterModifier");
    const boost = charm ? 1.5 + (charm.getStackCount?.() ?? charm.stackCount ?? 1) / 2 : 1;
    return boost * (mode.isDaily || n > 800 ? 2.5 : n > 600 ? 2 : n > 400 ? 1.5 : n > 200 ? 1 : n > 100 ? 0.5 : 0);
  };

  // Why no ball can be thrown at all this battle, or null.
  const battleBlocked = (s, b, active, live) => {
    if (!b || b.trainer || b.battleType === BattleType.TRAINER) return "trainer";
    if (b.battleType === BattleType.MYSTERY_ENCOUNTER && !b.mysteryEncounter?.catchAllowed) return "mystery encounter";
    if (s.arena?.biomeId === BiomeId.END && (b.battleType ?? BattleType.WILD) === BattleType.WILD) {
      const mode = s.gameMode ?? {}, w = b.waveIndex, dex = s.gameData?.dexData ?? {};
      const final = call(live, () => mode.isBattleClassicFinalBoss(w), !!mode.isClassic && w === 200);
      const freshStart = call(live, () => mode.isFullFreshStartChallenge(), (mode.challenges ?? []).some(c => c.id === Challenges.FRESH_START && c.value === 1));
      const endlessBoss = call(live, () => mode.isEndlessMinorBoss(w), !!mode.isEndless && w % 250 === 0);
      const dailyFinal = !!mode.isDaily && call(live, () => mode.isWaveFinal(w), w === 50);
      const uncaught = active.some(f => !big(dex[f.species?.speciesId]?.caughtAttr));
      // starterData holds an entry for every starter (initStarterData), so its keys are getAllStarters().
      const missing = Object.keys(s.gameData?.starterData ?? {}).filter(id => !big(dex[id]?.caughtAttr)).length;
      if ((mode.isClassic && !final && uncaught) || (freshStart && !final) || (mode.isEndless && !endlessBoss)) return "End biome";
      if ((mode.isClassic && final && missing > 1) || (freshStart && final) || (mode.isEndless && endlessBoss)
        || (dailyFinal && !mode.dailyConfig?.boss?.catchable)) return "final boss";
    }
    return null;
  };

  // ---- Team value
  const damagingTypes = p => (p.moveset ?? []).filter(Boolean).map(pm => { try { return pm.getMove(); } catch { return null; } })
    .filter(mv => mv && mv.category !== MoveCategory.STATUS && mv.power > 0).map(mv => TYPES[mv.type]).filter(Boolean);
  // A fusion's base stats are its two species' averaged stat by stat, rounded up (Pokemon.calculateBaseStats): a fused
  // mon is judged by the pair, not by the species it shows.
  const bstOf = p => {
    const sp = p.species, fu = p.fusionSpecies;
    if (!fu) return sp?.baseTotal ?? 0;
    if (Array.isArray(sp?.baseStats) && Array.isArray(fu.baseStats)) return sp.baseStats.reduce((t, x, i) => t + Math.ceil((x + (fu.baseStats[i] ?? 0)) / 2), 0);
    return Math.ceil(((sp?.baseTotal ?? 0) + (fu.baseTotal ?? 0)) / 2);
  };
  const rootOf = (p, live) => call(live, () => p.species.getRootSpeciesId(true), p.species?.speciesId) ?? p.species?.speciesId;
  // A line's strength is its final evolution's BST, not the current stage's: an unevolved Spinarak (190) isn't weaker
  // than a wild 400. The game only exposes evolutions as species ids (PokemonSpecies.getEvolutionLevels() →
  // [[speciesId, level], …], every descendant flattened, a pure data read), so the final BST is estimated from how many
  // stages are left: two when the first two entries are consecutive ids at different levels (Charmander 5@16, 6@36;
  // Oddish 44@21, 45@item), else one (Eevee's and Tyrogue's branches share a level).
  const stagesLeft = sp => {
    let evos;
    try { evos = sp?.getEvolutionLevels?.(); } catch { evos = null; }
    if (!Array.isArray(evos) || !evos.length) return 0;
    const [a, b] = evos;
    return b && b[0] === a[0] + 1 && b[1] !== a[1] ? 2 : 1;
  };
  // Typical growth per stage: ×1.3, +110, and a floor near 400 for a line's final form (Spinarak 190 → Ariados 400,
  // Charmander 309 → Charizard 534, Pidgey 251 → Pidgeot 479).
  const speciesFinal = sp => {
    const bst = sp?.baseTotal ?? 0, n = stagesLeft(sp);
    if (!n || !bst) return { bst, final: bst, estimated: false };
    return { bst, final: Math.round(Math.max(bst * 1.3 ** n, bst + 110 * n, 400 + 90 * (n - 1))), estimated: true };
  };
  // A fusion grows along both lines: the average of each half's final BST.
  const finalBstOf = p => {
    if (!p.fusionSpecies) return speciesFinal(p.species);
    const a = speciesFinal(p.species), b = speciesFinal(p.fusionSpecies), bst = bstOf(p);
    return a.estimated || b.estimated ? { bst, final: Math.ceil((a.final + b.final) / 2), estimated: true } : { bst, final: bst, estimated: false };
  };
  // A clear upgrade over our weakest member: this much more final BST, a real mon, not a route-1 one beating another,
  // and not so far below our weakest member's level that it would have to catch up first.
  const UPGRADE_BST = 100, UPGRADE_FLOOR = 400, UPGRADE_LEVEL_GAP = 10;

  // Attacking types that hit two or more of us super-effectively and that more of us are weak to than resist.
  const teamWeakTypes = all => TYPES.filter(t => {
    const n = all.filter(p => effectiveness(t, p) >= 2).length;
    return n >= 2 && n > all.filter(p => effectiveness(t, p) <= 0.5).length;
  });

  const teamReasons = (s, foe, b, live) => {
    const all = (s.getPlayerParty?.() ?? []).filter(Boolean);
    const out = [];
    const limited = (s.gameMode?.challenges ?? []).some(c => c.id === Challenges.LIMITED_CATCH && c.value > 0) && b.waveIndex % 10 !== 1;
    if (limited) return { out: [{ kind: "team", text: "Limited Catch: won't join the party", w: 0 }], replace: null };
    // Its line is already on the team: a second one adds nothing.
    if (!all.length || all.some(p => rootOf(p, live) === rootOf(foe, live))) return { out, replace: null };

    const weak = teamWeakTypes(all);
    const covers = weak.filter(t => effectiveness(t, foe) <= 0.5);
    if (covers.length) out.push({ kind: "team", text: `covers ${covers.slice(0, 2).join("/")} weakness`, w: covers.length > 1 ? 1.5 : 1 });

    // Defending types none of our damaging moves hit super-effectively, that the foe's moves do.
    if (all.length >= 3) {
      const ours = new Set(all.flatMap(damagingTypes));
      const hole = TYPES.filter(d => ![...ours].some(t => vs(t, d) >= 2));
      const adds = hole.filter(d => damagingTypes(foe).some(t => vs(t, d) >= 2));
      if (adds.length >= 2) out.push({ kind: "team", text: `hits ${adds.slice(0, 3).join("/")} (no one else does)`, w: 0.5 });
    }

    const fin = new Map([...all, foe].map(p => [p, finalBstOf(p)]));
    const weakest = all.reduce((w, p) => (!w || fin.get(p).final < fin.get(w).final || (fin.get(p).final === fin.get(w).final && p.level < w.level) ? p : w), null);
    const full = all.length >= 6;
    const mine = fin.get(weakest), theirs = fin.get(foe);
    if (mine.final && theirs.final >= UPGRADE_FLOOR && theirs.final >= mine.final + UPGRADE_BST
      && (foe.level ?? 0) >= (weakest.level ?? 0) - UPGRADE_LEVEL_GAP) {
      const show = x => (x.estimated ? `~${x.final}` : `${x.final}`);
      out.push({ kind: "team", text: `stronger than ${weakest.name} (${theirs.estimated || mine.estimated ? "final " : ""}BST ${show(theirs)} vs ${show(mine)})`, w: 2 });
    }
    // A full party makes room by releasing someone: name who, if the catch is a team upgrade at all.
    const replace = full && out.length ? { icon: iconOf(weakest), name: weakest.name } : null;
    if (replace) out.push({ kind: "team", text: `party full: replaces ${weakest.name}`, w: 0 });
    return { out, replace };
  };

  // ---- Account value (dex, starter unlocks, abilities, IVs, shinies). Pure reads of gameData.
  const IV_TOTAL = 30, IV_STAT = 15;
  const accountReasons = (s, foe, live) => {
    const out = [];
    const sp = foe.species;
    const gd = s.gameData;
    if (!sp || !gd?.dexData) return out;
    const dex = gd.dexData[sp.speciesId];
    const caught = big(dex?.caughtAttr);
    const root = rootOf(foe, live);
    const rootDex = gd.dexData[root];
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
    if (foe.shiny) {
      if (caught && !(caught & 2n)) out.push({ kind: "account", text: `first shiny · +${candy} candy`, w: 3 });
      else if (caught && (caught & attr & 112n) !== (attr & 112n)) out.push({ kind: "account", text: `new shiny variant · +${candy} candy`, w: 2.5 });
      else out.push({ kind: "account", text: `shiny · +${candy} candy`, w: 2 });
    } else if (isShinyMon(foe, live)) out.push({ kind: "account", text: `shiny fusion · +${candy} candy`, w: 1.5 });
    if (caught && (caught & (attr & ~127n)) === 0n) out.push({ kind: "account", text: "new form", w: 2 });

    const ab = foe.abilityIndex ?? 0;
    const bit = ab !== 1 || sp.ability2 ? 1 << ab : AbilityAttr.ABILITY_HIDDEN;
    // Unknown root (no game call to find it): don't guess.
    const known = gd.starterData?.[root]?.abilityAttr;
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
      const using = (s.getPlayerParty?.() ?? []).some(p => p && rootOf(p, live) === root);
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
  const fastestHit = (a, target, foe = false) => hits(a, target, foe).filter(x => x.dmg > 0)
    .map(x => ({ x, turns: koTurn(koCurve(target, useOf(x)).by) }))
    .reduce((b, y) => (!b || y.turns < b.turns || (y.turns === b.turns && y.x.dmg > b.x.dmg) ? y : b), null);
  const escapeReason = (s, foe, party, p) => {
    if (!(p > 0)) return null;
    let best = null;
    for (const me of party.filter(x => x.isOnField?.())) {
      let turns = 9, first = stat(me, Stat.SPD) >= stat(foe, Stat.SPD) ? 1 : 0, theyFirst = 0;
      const fallback = () => fastestHit(me, foe)?.turns ?? 9;
      try {
        if (typeof exchange === "function") {
          for (const pm of (me.moveset ?? []).filter(Boolean)) {
            const mv = pm.getMove?.();
            if (!mv || mv.category === MoveCategory.STATUS) continue;
            const x = exchange(s, me, pm, foe);
            if (x && (x.turnsWe < turns || (x.turnsWe === turns && x.pTheyKoFirst < theyFirst))) {
              turns = x.turnsWe; theyFirst = x.pTheyKoFirst ?? 0; first = x.pFirst ?? first;
            }
          }
        } else turns = fallback();
      } catch { turns = fallback(); }
      let dmg = 0, pKo = 0;
      try {
        const t = typeof threatFrom === "function" ? threatFrom(s, foe, me) : null;
        if (t) { dmg = t.expected ?? 0; pKo = t.pKo ?? 0; }
        else { dmg = fastestHit(foe, me, true)?.x.dmg ?? 0; pKo = dmg >= me.hp ? 1 : 0; }
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
  const lowerHpTip = (s, foe, party) => {
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
      let outs = [];
      try { outs = moveOutcomes(s, me, foe); } catch {}
      for (const o of outs) {
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

  const targetAdvice = (s, b, foe, party, crit, counts, multi, live) => {
    const bossLocked = !!foe.isBoss?.() && (foe.bossSegmentIndex ?? 0) >= 1
      && !call(live, () => foe.hasAbility(AbilityId.WONDER_GUARD, false, true), abilitiesOf(foe).includes("Wonder Guard"));
    const chance = BALLS.filter(x => counts[x.id] > 0).map(x => ({
      id: x.id, ball: x.ball, short: x.short, key: x.key, count: counts[x.id],
      p: bossLocked && x.id < PokeballType.MASTER_BALL ? 0 : Math.round(captureChance({
        maxHp: foe.getMaxHp(), hp: foe.hp, catchRate: foe.species?.catchRate ?? 0, ball: x.id,
        status: foe.status?.effect ?? 0, shiny: isShinyMon(foe, live), shinyMult: shinyMultOf(), critFactor: crit,
      }) * 1000) / 1000,
    }));

    const team = teamReasons(s, foe, b, live);
    const reasons = [...accountReasons(s, foe, live), ...team.out];
    let value = reasons.reduce((t, r) => t + r.w, 0);
    const cheap = pickBall(chance, value >= 1.5 ? maxBallFor(value, counts) : maxBallFor(0, counts));
    const escape = !multi && cheap ? escapeReason(s, foe, party, cheap.p) : null;
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
    if (bossLocked && verdict !== "skip") blockers.push(counts[PokeballType.MASTER_BALL] > 0 && value >= 5 ? "Master Ball, or break its bars first" : "break its bars first — only a Master Ball works now");
    else if (verdict !== "skip" && p < GOOD) {
      if (hp > 0.5) tips.push(lowerHpTip(s, foe, party));
      else if (!foe.status?.effect) {
        // The wave's status-cure tokens (EnemyStatusEffectHealChanceModifier): 2.5 % a stack at each turn end.
        const cure = (s.enemyModifiers ?? []).filter(m => m.constructor?.name === "EnemyStatusEffectHealChanceModifier")
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

  let cache = { key: null, live: false, value: null };
  const catchAdvice = (s, b, party, foes) => {
    if (!b || !foes?.length || !party?.length) return null;
    const live = awaitingCommand(s);
    const counts = BALLS.map(x => s.pokeballCounts?.[x.id] ?? 0);
    // The event multiplier arrives with the async table read, possibly mid-turn.
    const key = [b.waveIndex, b.turn, counts.join(","), shinyMultOf(), ...party.map(p => `${p.id}:${p.hp}`),
      ...foes.map(f => `${f.id}:${f.hp}:${f.status?.effect ?? 0}:${f.bossSegmentIndex ?? ""}:${f.isOnField?.() ? 1 : 0}`)].join("|");
    // Numbers from the game's own code stay until the turn changes; outside the command phase don't replace them.
    if (cache.key === key && (cache.live || !live)) return cache.value;
    const build = () => {
      const onField = foes.filter(f => f.isOnField?.());
      const active = onField.length ? onField : foes.slice(0, 1);
      if (battleBlocked(s, b, active, live) || !counts.some(Boolean)) return null;
      const crit = critFactorOf(s, live);
      const multi = active.length > 1;
      const targets = active.map(f => targetAdvice(s, b, f, party, crit, counts, multi, live));
      // Two foes out: no ball can be thrown yet, so only speak up for one worth keeping alive.
      if (multi && targets.every(t => t.verdict === "skip")) return null;
      return { targets };
    };
    const value = live ? sandbox(s, build) : build();
    cache = { key, live, value };
    return value;
  };

  // What owning `foe` is worth with no ball in the picture: the account and team reasons a throw is weighed on, for a
  // mon a Mystery Encounter hands over. `live`: game calls allowed (inside `sandbox`).
  const catchWorth = (s, foe, live) => {
    const b = s.currentBattle ?? { waveIndex: 0 };
    const reasons = [...accountReasons(s, foe, live), ...teamReasons(s, foe, b, live).out];
    return { value: reasons.reduce((t, r) => t + r.w, 0), reasons: reasons.map(r => r.text), show: SHOW };
  };

  return { captureChance, catchAdvice, catchWorth, damagingTypes, finalBstOf, teamWeakTypes };
})();
