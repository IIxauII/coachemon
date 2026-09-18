// Look-ahead to the next big fight: which wave it lands on, who it is, whether the party is ready for it, and what
// the run gives you to prepare with. Built on 48-preview's replay, so a fixed fight is named exactly rather than
// guessed from a hand-kept roster table.
//
// ---- The schedule
// Which wave is a big fight and where the run heals are the **run calendar**'s (`03-calendar.js`) — pure arithmetic
// on the wave index, no roll anywhere in it. This file asks it three things and says what they mean for the party:
// `bigFightsAhead` for the schedule, `nextHeal` for the next full heal, and `isBossWave` for the double-battle odds.
// The one reading worth repeating here is why `fightsBeforeHeal` exists: a classic run heals entering 11, 21 … 191
// and nowhere else, so **waves 181–190 hold the four Elite Four fights and the champion with no heal between them**,
// and the rewards card spends against that stretch — the difference between topping one mon up and stocking the
// whole party.
//
// ---- Rewards and luck
// `getNewModifierTypeOption` rolls a tier and then upgrades it while `randSeedInt(floor(512 / (luck + 4))) < 4`, so
// party luck is a per-item chance of a tier upgrade: 3.1 % at luck 0, 14.3 % at luck 14. A fixed battle's
// `customModifierRewardSettings` can pin the tiers outright and set `allowLuckUpgrades: false` — the rival at 25 and
// every boss after it — and then luck buys nothing on the screen as rolled. A reroll drops those settings (it queues a
// plain `SelectModifierPhase`), so it rolls rarities and takes luck upgrades like any other wave. Luck is the party's
// `getLuck()` summed and clamped to 14; timed-event boosts add to it unseen, so the HUD's number is a floor.
//
// Everything here is a read: the calendar is arithmetic on the wave index, and the roster comes from `previewFor`,
// which replays inside a seed fork. Nothing is called that the preview doesn't already call.
const { aheadModel, doubleOdds, learnRoster } = (() => {
  // How far ahead the roster is still worth reading. The calendar holds at any distance, but the replay feeds on the
  // party, the luck value and the biome, and a catch, an evolution or a shop pick re-rolls it — so a roster read more
  // than a few waves out is a number that will have moved by the time the fight arrives.
  const LOOKAHEAD = 5;
  // How early the run's last wave is worth preparing for. Longer than LOOKAHEAD on purpose: the Eternatus checklist
  // is about what to carry into 200, and it has to be up while there are still shops left to act on it.
  const FINAL_NOTICE = 10;
  // `label` is what the card says when the fight has no trainer name yet.
  const KIND_LABEL = { final: "final boss", fixed: "fixed battle", gym: "gym leader", boss: "boss" };

  const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

  // ---- Luck. The value itself is the party profile's (`08-party.js`, `partyLuck`): it is a fact about the party, and
  // the biome card reads the same one. What it buys is this file's — the per-reward upgrade chance below.
  const LUCK_GRADES = ["D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+", "A++", "S", "S+", "SS", "SS+", "SSS"];
  // One reward's chance of being upgraded a tier at least once: the loop rolls `randSeedInt(odds) < 4` and repeats
  // while it hits, so the first roll is the one worth quoting.
  const upgradeChance = luck => 4 / Math.floor(128 / ((luck + 4) / 4));

  // The tiers this wave's rewards are pinned to, and whether luck can still move them. A fixed battle's config
  // carries them; every other wave rolls freely. `TIER_NAMES` is 01-core's, because the look-ahead names a pinned
  // tier waves before there is a shop to name it on.
  const rewardRules = (s, wave) => {
    const cfg = tryDo(() => (s.gameMode?.isFixedBattle?.(wave) ? s.gameMode.getFixedBattle(wave) : null));
    const custom = cfg?.customModifierRewardSettings;
    if (!custom) return null;
    const tiers = (custom.guaranteedModifierTiers ?? []).map(t => TIER_NAMES[t] ?? `tier ${t}`);
    if (!tiers.length && custom.allowLuckUpgrades !== false) return null;
    return { tiers, luckUpgrades: custom.allowLuckUpgrades !== false };
  };

  // ---- Double battles. `checkIsDouble` rolls every wave, `randSeedInt(getDoubleBattleChance(w)) === 0`, and
  // `generateNewBattleTrainer` rolls the same chance for a generic trainer's double variant. The chance is 8, or 32 on
  // an X0 wave, divided by 4 for each lure held (`DoubleBattleChanceBoosterModifier`, one per lure kind) and for each
  // mon on the field with Illuminate or Arena Trap (`DoubleBattleChanceAbAttr`), floored at 1. `BattleEndPhase` lapses
  // a lure before the rewards screen, so its `battleCount` there is the number of battles ahead it still covers. The
  // final wave and an Endless boss are never double; a fixed battle's config pins it when it says, and one that doesn't
  // (an evil-team grunt rolls 1/3 on the trainer, unreadable without the draw) counts as single. A Mystery Encounter
  // is never double either, but whether a wave is one is itself a roll, so every other wave counts as a battle.
  // `doubleOdds` is the share of double battles over the next `n` waves at those odds: what a permanent choice (a TM)
  // is judged against, rather than whichever way one roll falls.
  const DOUBLE_HORIZON = 10;
  const DOUBLE_ABILITIES = ["Illuminate", "Arena Trap"];
  const doubleOdds = (s, from, n = DOUBLE_HORIZON) => {
    const gm = s?.gameMode;
    const lures = (s?.modifiers ?? []).filter(m => m?.constructor?.name === "DoubleBattleChanceBoosterModifier")
      .map(m => tryDo(() => m.getBattleCount(), m.battleCount ?? 0));
    const field = tryDo(() => s.getPlayerField(), null) ?? tryDo(() => s.getPlayerParty().filter(Boolean).slice(0, 1), []);
    const abilities = field.filter(p => tryDo(() => p.hasAbilityWithAttr("DoubleBattleChanceAbAttr"), null)
      ?? tryDo(() => abilitiesOf(p).some(a => DOUBLE_ABILITIES.includes(a)), false)).length;
    let doubles = 0;
    for (let i = 0; i < n; i++) {
      const w = from + i;
      if (tryDo(() => gm.isWaveFinal(w), false) || tryDo(() => gm.isEndlessBoss(w), false)) continue;
      const fixed = tryDo(() => (gm.isFixedBattle(w) ? gm.getFixedBattle(w) : null));
      if (fixed) { doubles += fixed.double === true ? 1 : 0; continue; }
      const lured = lures.filter(left => left > i).length;
      doubles += 1 / Math.max(1, (isBossWave(s, w) ? 32 : 8) / 4 ** (lured + abilities));
    }
    return doubles / n;
  };

  // ---- Readiness: the party against the roster the preview hands over.
  // The party comes as a profile (`08-party.js`): `hitters` answers who can hit a foe and `weakTo` who it hits back,
  // the same two queries the biome and encounter cards ask. A foe's types, ability and passive come from the replay,
  // so `hitters` prices the real matchup, immunities included; its damaging move types come from the moveset the
  // replay generated, and when those are missing its own types stand in as a STAB proxy.
  const readiness = (model, profile) => {
    const foes = model?.foes ?? [];
    const party = profile.members;
    if (!foes.length || !party.length) return null;
    const ourLevel = Math.max(...party.map(p => p.level ?? 1));
    const theirLevel = Math.max(...foes.map(f => f.level ?? 0));
    const answering = foes.map(f => new Set(profile.hitters(f)));
    const unanswered = foes.filter((_, i) => !answering[i].size);
    const hitters = party.filter(p => answering.some(set => set.has(p))).map(p => p.name);
    // What they swing back with: their damaging moves when the replay generated a moveset, else their own types.
    const theirTypes = [...new Set(foes.flatMap(f => (f.moveTypes?.length ? f.moveTypes : f.types) ?? []))];
    const threats = theirTypes.map(t => ({ type: t, n: profile.weakTo(t).length }))
      .filter(x => x.n >= Math.max(2, Math.ceil(party.length / 2))).sort((a, b) => b.n - a.n);
    const bars = foes.reduce((t, f) => t + Math.max(0, (f.segments ?? 0) - 1), 0);

    const notes = [];
    if (unanswered.length) {
      notes.push({ good: false, text: `nothing hits ${unanswered.slice(0, 2).map(f => f.name).join("/")} super-effectively` });
    }
    if (theirLevel > ourLevel) notes.push({ good: false, text: `they're +${theirLevel - ourLevel} levels on us` });
    else if (ourLevel - theirLevel >= 5) notes.push({ good: true, text: `we're +${ourLevel - theirLevel} levels on them` });
    if (threats.length) notes.push({ good: false, text: `${threats[0].n} of us weak to ${threats[0].type}` });
    if (hitters.length >= 2) notes.push({ good: true, text: `${hitters.length} mons hit super-effectively` });
    else if (hitters.length === 1) notes.push({ good: false, text: `only ${hitters[0]} hits super-effectively` });
    if (bars) notes.push({ good: false, text: `${bars} extra health ${bars === 1 ? "bar" : "bars"} to break` });

    const bad = unanswered.length + (theirLevel > ourLevel ? 1 : 0) + threats.length + (hitters.length ? 0 : 1);
    return {
      verdict: bad === 0 ? "ready" : bad === 1 ? "watch" : "risky",
      levelGap: ourLevel - theirLevel, ourLevel, theirLevel, bars,
      unanswered: unanswered.map(f => f.name), hitters, threats: threats.slice(0, 2), notes,
      // A roster the preview itself only half-believes makes a readiness call worth only as much.
      sure: model.confidence?.foes === "exact",
    };
  };

  // ---- The final boss, from the source rather than from memory. None of this is a roll, so it holds for every run.
  // Phase one can't be knocked out: `Pokemon.damage` caps damage at `hp - 1` while the classic final boss is in form
  // 0 on its last shield, and `getMinimumSegmentIndex` keeps that shield up. `DamageAnimPhase.end` then calls
  // `initFinalBossPhaseTwo`, which hands Eternamax a **non-transferrable Mini Black Hole** — a
  // `TurnHeldItemTransferModifier` that takes one of your held items every turn — regenerates its moveset at form 1
  // and **turns the battle into a double**. Phase one itself carries no held items at all
  // (`generateEnemyModifiers` returns early for the classic final boss) and has no passive ability.
  const ETERNATUS_FACTS = [
    { good: false, text: "phase 1 can't be KO'd — damage is capped at 1 HP, so it always reaches Eternamax" },
    { good: false, text: "Eternamax steals one held item per turn (Mini Black Hole) and the fight turns double" },
    { good: false, text: "Eternamax knows Recover at −4 priority: out-damage it, don't chip it" },
    { good: false, text: "phase 1's Cosmic Power raises its defences every use — stalling makes it worse" },
    { good: true, text: "it carries no held items in phase 1 and has no passive ability" },
  ];
  // Who is carrying the most held-item stacks: those are what the Mini Black Hole eats first.
  const heldStacks = (s, party) => party.map(p => ({
    name: p.name,
    n: (s.modifiers ?? []).filter(m => m?.pokemonId != null && m.pokemonId === p.id)
      .reduce((t, m) => t + (tryDo(() => m.getStackCount(), 1) ?? 1), 0),
  })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);

  const eternatusCard = (s, model, party) => {
    const foe = model?.foes?.[0] ?? null;
    const carrying = heldStacks(s, party);
    const facts = [...ETERNATUS_FACTS];
    // Worth saying only when there is somewhere to spread to and one mon is holding most of it: the thief takes one
    // item a turn from whatever is on the field, so a stack on a single mon is a stack handed over.
    if (party.length > 1 && carrying[0]?.n >= 3 && carrying[0].n >= (carrying[1]?.n ?? 0) * 2) {
      facts.push({ good: false, text: `${carrying[0].name} carries ${carrying[0].n} held items — spread them before 200` });
    }
    if (party.filter(p => p.hp > 0).length < 2) {
      facts.push({ good: false, text: "phase 2 is a double battle: bring a second mon that can stand in it" });
    }
    return { foe: foe && { name: foe.name, level: foe.level, types: foe.types, segments: foe.segments, moves: foe.moves }, facts };
  };

  // ---- The model the card draws. One replay at most (the next big fight's), and only when it is close enough to
  // prepare for. Cached like the preview: the schedule walks thirty waves through `isFixedBattle`, which builds a
  // `FixedBattleConfig` and runs the challenge hooks each time, and the panel redraws every second.
  let cache = { key: null, value: null };
  const aheadModel = s => {
    const wave = s?.currentBattle?.waveIndex ?? 0;
    if (!wave || typeof s.gameMode?.isFixedBattle !== "function") return null;
    // Everything below is read from the wave, the party and the run's own offsets; the replay's own inputs are
    // keyed again inside `previewFor`.
    const cacheKey = JSON.stringify([s.seed, wave, s.offsetGym, s.arena?.biomeId,
      // Whether a member is standing, not how much HP it has: nothing here reads the number, and keying on it
      // would miss the cache on every hit taken.
      (s.getPlayerParty?.() ?? []).filter(Boolean).map(p => [p.species?.speciesId, p.level, p.hp > 0, p.luck]),
      (s.modifiers ?? []).length]);
    if (cache.key === cacheKey) return cache.value;
    const value = build(s, wave);
    cache = { key: cacheKey, value };
    return value;
  };

  const build = (s, wave) => {
    // The calendar answers what each wave is; naming it for a reader is this card's own job.
    const schedule = bigFightsAhead(s, wave + 1).map(f => ({ ...f, label: KIND_LABEL[f.kind] }));
    const next = schedule[0] ?? null;
    const heal = nextHeal(s, wave + 1);
    const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
    const luck = partyLuck(party);

    // A preview only for the fight itself, and only once it is near: a replay for a wave 20 away is a cost with no
    // advice attached, and the inputs it reads will have moved long before then.
    const model = next && next.wave - wave <= LOOKAHEAD ? previewFor(s, next.wave) : null;
    const named = model && !model.unavailable ? model : null;
    if (next) {
      next.in = next.wave - wave;
      next.trainer = named?.trainer?.name ?? null;
      next.foes = named?.foes ?? [];
      next.double = named?.double ?? null;
      next.bars = (named?.foes ?? []).reduce((t, f) => t + Math.max(0, (f.segments ?? 0) - 1), 0);
      next.exact = named?.confidence?.foes === "exact";
      // What beating it pays, when the fixed-battle table pins it. Exact, and a reason to spend on getting there.
      next.rewards = rewardRules(s, next.wave);
    }
    // The run's last wave, which is worth preparing for earlier than its roster is worth reading.
    const final = schedule.find(f => f.kind === "final");
    const finalNear = final && final.wave - wave <= FINAL_NOTICE;
    return {
      wave, next, heal: heal == null ? null : { wave: heal, in: heal - wave },
      // The stretch the rewards card spends against: how many big fights stand between here and the next full heal.
      fightsBeforeHeal: heal == null ? schedule.length : schedule.filter(f => f.wave < heal).length,
      schedule: schedule.slice(0, 4).map(f => ({ ...f, in: f.wave - wave })),
      readiness: named ? readiness(named, partyProfile(party.filter(p => p.hp > 0))) : null,
      luck: { value: luck, grade: LUCK_GRADES[luck] ?? String(luck), upgradePct: Math.round(upgradeChance(luck) * 1000) / 10 },
      // What the rewards for the wave just cleared are pinned to — the fixed battle you have already won, not the
      // one ahead. This is what decides whether luck can upgrade the screen as first rolled (a reroll drops the pin).
      thisWave: rewardRules(s, wave),
      eternatus: finalNear ? eternatusCard(s, next?.kind === "final" ? named : null, party) : null,
    };
  };

  // ---- The foes a move being learned now will be used against (#122). A learned move is kept for the run, so it is
  // judged against the next big fight rather than whatever the next wave rolls: that is where a Taunt or a burn
  // decides a run, and the roster is only read once the fight is near (LOOKAHEAD), so both the learn card and the
  // rewards card see the same foes or none. Plain data, as the preview hands it over.
  const learnRoster = model => {
    const next = model?.next;
    if (!next?.foes?.length) return null;
    return { wave: next.wave, exact: !!next.exact, foes: next.foes };
  };

  return { aheadModel, doubleOdds, learnRoster };
})();

// ---- How the card and its one-line summary name the fight ahead.
const aheadIn = n => (n === 1 ? "next wave" : `in ${n}`);

// `Cynthia`, `gym leader`, `boss` — the trainer's own name when the preview could name it, else what the calendar
// says it is. A fight the preview can only half-believe carries the preview's own `~`.
const aheadWho = a => (a.next.trainer ? `${a.next.trainer}${a.next.exact ? "" : "~"}` : a.next.label);

// `Cynthia in 3 (W195) risky — nothing hits Garchomp super-effectively; 2 big fights before the next full heal`.
const aheadSummary = a => {
  if (!a?.next) return null;
  const reasons = [...(a.readiness?.notes ?? []).filter(n => !n.good).map(n => n.text),
    !a.heal ? `no full heal left before the final wave`
      : a.fightsBeforeHeal >= 2 ? `${a.fightsBeforeHeal} big fights before the next full heal` : null].filter(Boolean);
  return `${aheadWho(a)} ${aheadIn(a.next.in)} (W${a.next.wave})${a.readiness ? ` ${a.readiness.verdict}` : ""}`
    + (reasons.length ? ` — ${reasons.slice(0, 3).join("; ")}` : "");
};
