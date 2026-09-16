// Mystery Encounter card: on an encounter's option screen, what each option really does for this party — the outcome,
// who it takes, what it costs, what's at stake, whether it starts a battle — and a take / ok / avoid call.
//
// ---- How the game decides (read from the pinned source, v1.12.0.11; references/game-code.md §13)
// The screen is UiMode.MYSTERY_ENCOUNTER, served by MysteryEncounterUiHandler while MysteryEncounterPhase waits.
// `displayEncounterOptions` has already called `option.meetsRequirements()` for every option and kept the answers in
// `optionsMeetsReqs`; an unmet option is unselectable only in optionMode DISABLED_OR_DEFAULT / DISABLED_OR_SPECIAL.
// Calling `meetsRequirements()` again is not a read: it assigns `primaryPokemon` and can draw `randSeedInt`, so the
// card reads the handler's answers and `option.primaryPokemon` (the first qualifier) instead, and lists who qualifies
// with each primary requirement's `queryParty`, which only filters.
// What an option does lives in closures (`onPreOptionPhase`, `onOptionPhase`, `onPostOptionPhase`) that can't be read,
// so the outcome of each encounter below is re-implemented from its source file; the rest get the generic reading.
// The draws inside those closures are forks: `MysteryEncounterPhase.handleOptionSelect` runs onPreOptionPhase in
// `executeWithSeedOffset(fn, encounter.getSeedOffset())`, MysteryEncounterOptionSelectedPhase the option phase at
// `getSeedOffset() * 500`, PostMysteryEncounterPhase the post phase at `getSeedOffset() * 2000` — all on the run seed.
// `getSeedOffset()` is wave·1000 + 512 per MysteryEncounterPhase start. `executeWithSeedOffset` restores the stream when
// the callback returns, and these callbacks are async, so only the draws before their first `await` are forked: those
// are **exact** (the chest's trap roll, the store's item rolls, the teleport destination, who the fallout burns, the
// dealer's new nature), everything after is on the live stream and the card gives odds.
//
// ---- Judging (first cuts, all of them)
// A fight is "hard" when the foe is 5+ levels over our best, or nothing hits it super-effectively and it's at our level
// (a boss: within 3 levels under it). Money is spent freely only while it leaves RESERVE_WAVES waves' worth of reward money.
const { encounterScreen, encounterModel } = (() => {
  // MysteryEncounterType, in enum order.
  const NAMES = ["Mysterious Challengers", "Mysterious Chest", "Dark Deal", "Fight or Flight", "Slumbering Snorlax",
    "Training Session", "Department Store Sale", "Shady Vitamin Dealer", "Field Trip", "Safari Zone", "Lost at Sea",
    "Fiery Fallout", "The Strong Stuff", "The Pokémon Salesman", "An Offer You Can't Refuse", "Delibird-y",
    "Absolute Avarice", "A Trainer's Test", "Trash to Treasure", "Berries Abound", "Clowning Around", "Part-Timer",
    "Dancing Lessons", "Weird Dream", "The Winstrate Challenge", "Teleporting Hijinks", "Bug-Type Superfan",
    "Fun and Games", "Uncommon Breed", "Global Trade System", "The Expert Pokémon Breeder"];
  const CHEST = MysteryEncounterType.MYSTERIOUS_CHEST, FIGHT_OR_FLIGHT = MysteryEncounterType.FIGHT_OR_FLIGHT,
    STORE = MysteryEncounterType.DEPARTMENT_STORE_SALE, VITAMINS = MysteryEncounterType.SHADY_VITAMIN_DEALER,
    LOST_AT_SEA = MysteryEncounterType.LOST_AT_SEA, FALLOUT = MysteryEncounterType.FIERY_FALLOUT,
    STRONG_STUFF = MysteryEncounterType.THE_STRONG_STUFF, BERRIES = MysteryEncounterType.BERRIES_ABOUND,
    PART_TIMER = MysteryEncounterType.PART_TIMER, TELEPORT = MysteryEncounterType.TELEPORTING_HIJINKS,
    BREED = MysteryEncounterType.UNCOMMON_BREED, GTS = MysteryEncounterType.GLOBAL_TRADE_SYSTEM;
  const TIERS = { [MysteryEncounterTier.COMMON]: "common", [MysteryEncounterTier.GREAT]: "great", [MysteryEncounterTier.ULTRA]: "ultra", [MysteryEncounterTier.ROGUE]: "rogue" };
  const DISABLED_MODES = new Set([MysteryEncounterOptionMode.DISABLED_OR_DEFAULT, MysteryEncounterOptionMode.DISABLED_OR_SPECIAL]);
  // Teleporting Hijinks' BIOME_CANDIDATES, and the ones worth the trip (the biome card's rare destinations).
  const TELEPORT_BIOMES = [[BiomeId.SPACE, "Space"], [BiomeId.FAIRY_CAVE, "Fairy Cave"], [BiomeId.LABORATORY, "Laboratory"],
    [BiomeId.ISLAND, "Island"], [BiomeId.WASTELAND, "Wasteland"], [BiomeId.DOJO, "Dojo"]];
  const RARE_BIOMES = new Set([BiomeId.SPACE, BiomeId.FAIRY_CAVE, BiomeId.LABORATORY]);
  const RESERVE_WAVES = 3;
  const HARD_LEVEL_GAP = 5, BOSS_LEVEL_EDGE = 3;

  const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const strip = t => String(t ?? "").replace(/\[\/?[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const money = n => `$${Math.round(n).toLocaleString("en-US")}`;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const joinNames = names => (names.length > 2 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names.join(" & "));
  // The game's `randSeedInt(range, min)` on whatever stream is sown.
  const int = (range, min = 0) => (range <= 1 ? min : Phaser.Math.RND.integerInRange(min, range - 1 + min));

  const encounterScreen = (s, h) => s.ui.getMode() === UiMode.MYSTERY_ENCOUNTER && !!s.currentBattle?.mysteryEncounter
    && Array.isArray(h?.encounterOptions) && h.encounterOptions.length > 0;

  // ---- Generic reading of the options, any encounter
  const readOptions = (s, h, me, party) => {
    const labels = tryDo(() => h.optionsContainer.list.map(o => strip(o.text)), []);
    return h.encounterOptions.map((opt, i) => {
      const met = h.optionsMeetsReqs?.[i] !== false;
      const reqs = opt.primaryPokemonRequirements ?? [];
      const qualifies = reqs.length
        ? reqs.reduce((q, r) => { const ok = tryDo(() => r.queryParty(party), []); return q.filter(p => ok.includes(p)); }, party).map(p => p.name)
        : null;
      const cash = (opt.requirements ?? []).find(r => r?.constructor?.name === "MoneyRequirement");
      const cost = cash ? (cash.scalingMultiplier > 0 ? tryDo(() => s.getWaveMoneyAmount(cash.scalingMultiplier)) : cash.requiredMoney || null) : null;
      return {
        label: labels[i] || `Option ${i + 1}`, index: me.options.indexOf(opt),
        enabled: met || !DISABLED_MODES.has(opt.optionMode), met,
        by: reqs.length && met ? opt.primaryPokemon?.name ?? null : null, qualifies, cost,
      };
    });
  };

  // ---- What the rules share
  const context = (s, me, options) => {
    const b = s.currentBattle;
    const wave = b.waveIndex;
    const party = s.getPlayerParty().filter(Boolean);
    const alive = party.filter(p => p.hp > 0 && tryDo(() => p.isAllowedInBattle(), true));
    const top = alive.reduce((t, p) => (!t || p.level > t.level ? p : t), null);
    const waveMoney = mult => tryDo(() => s.getWaveMoneyAmount(mult), 0);
    const coins = (s.modifiers ?? []).filter(m => m?.constructor?.name === "MoneyMultiplierModifier")
      .reduce((t, m) => t + (tryDo(() => m.getStackCount()) ?? m.stackCount ?? 1), 0);
    const seeded = mul => fn => {
      const base = tryDo(() => me.getSeedOffset());
      if (typeof base !== "number" || typeof s.executeWithSeedOffset !== "function") return null;
      let out = null;
      s.executeWithSeedOffset(() => { out = fn(); }, base * mul);
      return out;
    };
    const opt = k => options.find(o => o.index === k) ?? { enabled: false, met: false, label: `Option ${k + 1}` };
    // An enemy the encounter set up in onInit: config `k` of its party config, with the level the battle will give it.
    const foe = (k = 0) => {
      const cfg = me.enemyPartyConfigs?.[0];
      const pc = cfg?.pokemonConfigs?.[k];
      const sp = pc?.species;
      if (!sp) return null;
      const scale = Math.max(Math.round(wave / 10 * (cfg.levelAdditiveModifier ?? 0)), 0);
      const level = pc.level || (b.enemyLevels?.[0] ?? top?.level ?? 1) + scale;
      return { name: tryDo(() => sp.getName(), sp.name), types: [sp.type1, sp.type2].filter(t => t != null).map(t => TYPES[t]).filter(Boolean),
        level, boss: !!pc.isBoss, bars: pc.bossSegments ?? 0, estimated: !pc.level };
    };
    const fight = (f, { double = false } = {}) => {
      if (!f || !alive.length) return { hard: false, text: "" };
      const hitters = alive.filter(p => damagingTypes(p).some(t => f.types.reduce((x, d) => x * vs(t, d), 1) >= 2));
      const weak = alive.filter(p => f.types.some(t => effectiveness(t, p) >= 2));
      const gap = f.level - top.level;
      const hard = gap >= HARD_LEVEL_GAP || (!hitters.length && gap >= (f.boss ? -BOSS_LEVEL_EDGE : 0));
      const who = `${double ? "2× " : ""}${f.estimated ? "~" : ""}L${f.level}${f.boss ? " boss" : ""}${f.bars > 1 ? ` (${f.bars} bars)` : ""} vs your L${top.level}`;
      const text = [who, hitters.length ? `${plural(hitters.length, "mon")} hit${hitters.length === 1 ? "s" : ""} it SE` : "nothing hits it SE",
        weak.length ? `${weak.length} weak to it` : null].filter(Boolean).join(", ");
      return { hard, text };
    };
    const spare = cost => s.money - cost - RESERVE_WAVES * waveMoney(1);
    return { s, me, b, wave, party, alive, top, waveMoney, coins, opt, foe, fight, spare,
      pre: seeded(1), during: seeded(500), post: seeded(2000) };
  };

  const LEAVE = { outcome: "shop only, no reward", verdict: "ok" };

  // ---- Per encounter: one entry per `me.options` index. { outcome, battle, verdict: take|ok|avoid|null, why, exact, needs }
  const RULES = {
    [CHEST]: c => {
      // getHighestLevelPlayerPokemon(true, false): the first of the highest level among the living.
      const victim = c.top?.name ?? "your top mon";
      const roll = c.pre(() => int(100));
      const prize = r => (r >= 75 ? "pick of 2 Common + 2 Great items" : r >= 45 ? "pick of 3 Ultra items" : r >= 35 ? "pick of 2 Rogue items" : r >= 30 ? "a Master item" : null);
      const trap = `${victim} faints, then a Gimmighoul boss fight`;
      if (roll == null) {
        return [{ outcome: `70% items (5% Master, 10% Rogue, 30% Ultra, 25% Common/Great), 30% trap: ${trap}`, verdict: null, why: "a gamble on your top mon" }, LEAVE];
      }
      if (prize(roll)) return [{ outcome: prize(roll), exact: true, verdict: "take", why: "no trap this time" }, LEAVE];
      return [{ outcome: `trap: ${trap}`, battle: "boss", exact: true, verdict: "avoid", why: `costs ${victim} a revive` }, { ...LEAVE, verdict: "take" }];
    },

    [FIGHT_OR_FLIGHT]: c => {
      const item = tryDo(() => c.me.misc.type.name, "its item");
      const tier = c.wave > 160 ? "Master" : c.wave > 120 ? "Rogue" : c.wave > 40 ? "Ultra" : "Great";
      const f = c.foe(0);
      const fight = c.fight(f);
      const steal = c.opt(1).enabled;
      return [
        { outcome: `fight ${f?.name ?? "a boss"} (+2 to a random stat) for ${item}; catchable`, battle: "boss",
          verdict: steal ? "ok" : fight.hard ? "avoid" : "take", why: fight.text },
        { outcome: `${item} (${tier} tier), no fight, EXP`, verdict: "take", why: "free", needs: "a Thief / Covet / Knock Off / Pluck / Trick / Switcheroo user" },
        { ...LEAVE, verdict: !steal && fight.hard ? "take" : "ok" },
      ];
    },

    [STORE]: c => {
      const rolls = (n, range) => c.during(() => Array.from({ length: n }, () => int(range)));
      // `names`: [one, many] per roll value.
      const count = (xs, names) => names.map(([one, many], k) => [xs.filter(x => x === k).length, one, many ?? one])
        .filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(", ");
      const tms = rolls(5, 5)?.map(r => (r < 2 ? 0 : r < 4 ? 1 : 2));
      const vits = rolls(3, 3)?.map(r => (r === 0 ? 1 : 0));
      const xs = rolls(5, 5)?.map(r => (r === 0 ? 1 : 0));
      const balls = rolls(4, 65)?.map(r => (r < 10 ? 0 : r < 40 ? 1 : r < 60 ? 2 : 3));
      const low = [PokeballType.GREAT_BALL, PokeballType.ULTRA_BALL, PokeballType.ROGUE_BALL].reduce((t, k) => t + (c.s.pokeballCounts?.[k] ?? 0), 0) < 5;
      const out = [
        { outcome: tms ? `pick of 5 TMs: ${count(tms, [["Common"], ["Great"], ["Ultra"]])}` : "pick of 5 TMs (Common 40%, Great 40%, Ultra 20%)",
          value: tms ? (tms.includes(2) ? 2 : tms.includes(1) ? 1.5 : 1) : 1.5 },
        { outcome: vits ? `pick of 3: ${count(vits, [["vitamin", "vitamins"], ["PP Up", "PP Ups"]])}` : "pick of 3: vitamins (⅔) or PP Up (⅓)",
          value: vits ? (vits.includes(0) ? 3 : 1) : 3, why: "a vitamin is permanent" },
        { outcome: xs ? `pick of 5: ${count(xs, [["X item", "X items"], ["Dire Hit", "Dire Hits"]])}` : "pick of 5 X items / Dire Hit", value: 0.5, why: "one-battle boosts" },
        { outcome: balls ? `pick of 4 ball packs: ${count(balls, [["Poké"], ["Great"], ["Ultra"], ["Rogue"]])}` : "pick of 4 ball packs",
          value: (balls ? [0.3, 0.8, 1.5, 2.5][Math.max(...balls)] : 1) + (low ? 1 : 0), why: low ? "you're low on good balls" : null },
      ];
      const best = out.reduce((b, o, k) => (o.value > out[b].value ? k : b), 0);
      return out.map((o, k) => ({ ...o, exact: !!tms, verdict: k === best ? "take" : "ok" }));
    },

    [VITAMINS]: c => {
      const [cheap, dear] = [c.opt(0).cost ?? c.waveMoney(1.5), c.opt(1).cost ?? c.waveMoney(5)];
      // The cheap deal only takes a mon over half HP; the carry is who a vitamin helps most.
      const carry = c.alive.filter(p => tryDo(() => p.getHpRatio(), p.hp / p.getMaxHp()) >= 0.51)
        .reduce((t, p) => (!t || p.level > t.level ? p : t), null);
      let nature = null;
      if (carry) {
        const n = c.post(() => { let x = int(25); while (x === carry.nature) x = int(25); return x; });
        if (n != null) {
          const fx = natureOf(n);
          const main = tryDo(() => (carry.getStat(Stat.ATK) >= carry.getStat(Stat.SPATK) ? "Atk" : "SpA"), "Atk");
          const verdict = fx.up === main ? "good" : fx.down === main || fx.down === "Spe" ? "bad" : "meh";
          nature = { text: `${carry.name} becomes ${fx.name}${fx.up ? ` (+${fx.up} −${fx.down})` : " (neutral)"}`, verdict };
        }
      }
      const dearOk = c.opt(1).enabled && c.spare(dear) >= 0;
      return [
        { outcome: `${money(cheap)}: 2 random vitamins on one mon; it loses ½ HP and its nature changes${nature ? ` — ${nature.text}` : ""}`,
          exact: !!nature, verdict: nature?.verdict === "good" && !dearOk ? "take" : nature?.verdict === "bad" ? "avoid" : "ok",
          why: nature ? `on ${carry.name}` : "the new nature is random", needs: "the money" },
        { outcome: `${money(dear)}: 2 random vitamins on one mon, no side effects`, verdict: dearOk ? "take" : "ok",
          why: dearOk ? `leaves ${money(c.s.money - dear)}` : `leaves only ${money(c.s.money - dear)}`, needs: "the money" },
        LEAVE,
      ];
    },

    [LOST_AT_SEA]: c => {
      const guided = c.opt(0).enabled || c.opt(1).enabled;
      const low = c.alive.filter(p => p.hp - Math.floor(p.getMaxHp() * 0.25) <= p.getMaxHp() * 0.25).map(p => p.name);
      return [
        { outcome: "sail through free, EXP", verdict: "take", needs: "a mon that can learn Surf" },
        { outcome: "fly out free, EXP", verdict: c.opt(0).enabled ? "ok" : "take", needs: "a mon that can learn Fly" },
        { outcome: `every mon loses ¼ max HP (never faints)${low.length ? `; ${joinNames(low)} end${low.length === 1 ? "s" : ""} low` : ""}`,
          verdict: guided ? "avoid" : "ok", why: guided ? "a guide costs nothing" : null },
      ];
    },

    [FALLOUT]: c => {
      const f = c.foe(0);
      const fight = c.fight(f, { double: true });
      const allowed = c.alive;
      const nonFire = allowed.filter(p => !tryDo(() => p.isOfType(PokemonType.FIRE, { includeTeraType: false }), typesOf(p).includes("Fire")));
      const burnable = nonFire.filter(p => !p.status?.effect);
      const idx = burnable.length ? c.during(() => int(burnable.length)) : null;
      const burned = idx != null ? burnable[idx] : null;
      const sticks = burned && tryDo(() => burned.canSetStatus(StatusEffect.BURN, true), true);
      const burn = burned
        ? sticks ? `; ${burned.name} is burned and its ability becomes Heatproof for good` : `; ${burned.name} shrugs off the burn`
        : burnable.length ? "; one of them is burned and its ability becomes Heatproof for good" : "";
      const hasOut = c.opt(2).enabled;
      return [
        { outcome: `fight 2 Volcarona (double, Fire Spin traps your leads, sun, +1 SpD/Spe) → your lead gets a type booster + rewards`,
          battle: "double", verdict: hasOut ? "ok" : fight.hard ? "avoid" : "take", why: fight.text },
        { outcome: `non-Fire mons lose 20% max HP${burn}`, exact: idx != null, verdict: sticks || (!burned && burnable.length) ? "avoid" : "ok",
          why: sticks ? `${burned.name} loses ${tryDo(() => burned.getAbility().name, "its ability")}` : null },
        { outcome: "no fight: your lead gets a type booster + rewards, EXP", verdict: "take", needs: "a Fire type or a fire-resistant ability" },
      ];
    },

    [STRONG_STUFF]: c => {
      // Sorted by the species form's BST, highest first; Array.sort is stable, so ties keep party order.
      const bst = p => tryDo(() => p.getSpeciesForm().getBaseStatTotal(), p.species?.baseTotal ?? 0);
      const sorted = [...c.party].sort((a, b) => bst(b) - bst(a));
      const losers = sorted.slice(0, 2).map(p => p.name);
      const f = c.foe(0);
      const fight = c.fight(f);
      return [
        { outcome: `no fight: ${joinNames(losers)} lose 15 in every base stat, the rest gain 10; rewards`, verdict: "avoid", why: "weakens your two strongest" },
        { outcome: `fight Shuckle (${f?.bars || 5} bars, +1 Def/SpD, berries; Gastro Acid + Stealth Rock on you) → Soul Dew + rewards`,
          battle: "boss", verdict: fight.hard ? "ok" : "take", why: fight.text },
      ];
    },

    [BERRIES]: c => {
      const f = c.foe(0);
      const fight = c.fight(f);
      const n = c.me.misc?.numBerries ?? 0;
      const fastest = c.me.misc?.fastestPokemon;
      const enemySpeed = c.me.misc?.enemySpeed;
      const ratio = fastest && enemySpeed ? fastest.getStat(Stat.SPD) / (enemySpeed * 1.1) : null;
      const slow = ratio != null && ratio < 1;
      const grabbed = ratio >= 1 ? Math.max(Math.min(Math.round((ratio - 1) / 0.08), n), 2) : 0;
      const enraged = c.wave < 50 ? "Def/SpD/Spe" : "Atk/Def/SpA/SpD/Spe";
      return [
        { outcome: `fight ${f?.name ?? "a boss"} → pick of 5 berries + ${plural(n, "berry", "berries")}`, battle: "boss",
          verdict: ratio >= 1 ? "ok" : fight.hard ? "avoid" : "take", why: fight.text },
        ratio == null ? { outcome: "race it: faster grabs berries with no fight, slower fights it enraged", verdict: null }
          : ratio >= 1 ? { outcome: `${fastest.name} outruns it: ${plural(grabbed, "berry", "berries")} + pick of 5 berries, no fight, EXP`, verdict: "take" }
            : { outcome: `${fastest.name} is too slow: the same fight with the boss +1 ${enraged}`, battle: "boss", verdict: "avoid", why: "fight it straight instead" },
        { ...LEAVE, verdict: slow && fight.hard ? "take" : "ok" },
      ];
    },

    [PART_TIMER]: c => {
      const pay = mult => { const v = c.waveMoney(mult); return v + Math.floor(v * 0.2 * c.coins); };
      const clamp = x => Math.min(Math.max(2.5 * (1 + x), 1), 4);
      const workers = c.alive.filter(p => tryDo(() => p.isAllowedInChallenge(), true));
      const best = score => workers.map(p => ({ p, mult: score(p) })).reduce((t, x) => (!t || x.mult > t.mult ? x : t), null);
      const deliver = best(p => { const base = Math.floor(196 * p.level * 0.01) + 5; return clamp((p.getStat(Stat.SPD) - base) / base); });
      const lift = best(p => {
        const hp = Math.floor(166 * p.level * 0.01) + p.level + 10, ad = Math.floor(166 * p.level * 0.01) + 5;
        const base = hp + 1.5 * ad * 2;
        return clamp((p.getStat(Stat.HP) + 1.5 * (p.getStat(Stat.ATK) + p.getStat(Stat.DEF)) - base) / base);
      });
      const tired = "; its moves drop to 2 PP";
      const out = [
        { outcome: deliver ? `${deliver.p.name} earns ${money(pay(deliver.mult))} (Speed)${tired}` : "earn by Speed", pay: deliver ? pay(deliver.mult) : 0 },
        { outcome: lift ? `${lift.p.name} earns ${money(pay(lift.mult))} (HP/Atk/Def)${tired}` : "earn by bulk", pay: lift ? pay(lift.mult) : 0 },
        { outcome: `${c.opt(2).by ?? "a charmer"} earns ${money(pay(2.5))}${tired}`, pay: c.opt(2).enabled ? pay(2.5) : 0, needs: "a mon with Charm / Attract / Captivate …" },
      ];
      const top = out.reduce((b, o, k) => (o.pay > out[b].pay ? k : b), 0);
      return out.map((o, k) => ({ ...o, verdict: k === top ? "take" : "ok", why: k === top ? "pick a mon you won't need PP on" : null }));
    },

    [TELEPORT]: c => {
      const here = c.s.arena?.biomeId;
      const cands = TELEPORT_BIOMES.filter(([id]) => id !== here);
      const k = c.during(() => int(cands.length));
      const dest = k != null ? cands[k] : null;
      const rare = dest && RARE_BIOMES.has(dest[0]);
      const price = c.me.misc?.price ?? c.opt(0).cost ?? c.waveMoney(1.75);
      const where = dest ? `teleport to ${dest[1]}` : "teleport to a random far biome";
      const free = c.opt(1).enabled;
      return [
        { outcome: `${money(price)}: ${where}, fight an enraged boss there`, battle: "boss", exact: !!dest,
          verdict: rare && !free ? "take" : "ok", why: dest ? (rare ? `${dest[1]} is a rare biome` : `${dest[1]}: nothing special`) : null, needs: "the money" },
        { outcome: `free: ${where}, fight an enraged boss there, EXP`, battle: "boss", exact: !!dest,
          verdict: rare ? "take" : "ok", why: dest ? (rare ? `${dest[1]} is a rare biome` : `${dest[1]}: nothing special`) : null, needs: "a Steel or Electric type" },
        { outcome: "stay: fight a boss here → Magnet / Metal Coat in the rewards", battle: "boss", verdict: rare ? "ok" : "take" },
      ];
    },

    [BREED]: c => {
      const mon = c.me.misc?.pokemon;
      const f = c.foe(0);
      const fight = c.fight(f);
      const worth = mon ? tryDo(() => catchWorth(c.s, mon, true)) : null;
      const wanted = worth && worth.value >= worth.show;
      const name = mon ? `${mon.name}${mon.shiny ? " ★shiny" : ""}` : "it";
      const why = worth?.reasons?.length ? worth.reasons.slice(0, 2).join(", ") : "nothing new";
      const charm = c.opt(2).enabled, berries = c.opt(1).enabled;
      return [
        { outcome: `fight ${name} (boosted); catchable → rewards`, battle: "wild",
          verdict: wanted && (charm || berries) ? "ok" : fight.hard ? "avoid" : "take", why: fight.text },
        { outcome: `give 4 random berries: ${name} joins with a 2nd egg move`, verdict: wanted && !charm ? "take" : wanted ? "ok" : "avoid",
          why: wanted ? why : `berries for a mon you don't need (${why})`, needs: "4 berries" },
        { outcome: `charm it: ${name} joins with better IVs and a 2nd egg move, EXP`, verdict: wanted ? "take" : "ok", why, needs: "a mon with Charm / Attract / Captivate …" },
      ];
    },

    [GTS]: c => {
      const offers = c.me.misc?.tradeOptionsMap;
      let best = null;
      if (offers?.get) {
        const fin = sp => finalBstOf({ species: sp }).final;
        for (const p of c.alive) {
          if (p === c.top) continue; // trading the carry away is never the upgrade it looks like
          for (const e of offers.get(p.id) ?? []) {
            const gain = fin(e.species) - fin(p.species);
            if (!best || gain > best.gain) best = { p, e, gain };
          }
        }
      }
      const upgrade = best && best.gain >= 100;
      return [
        { outcome: best ? `trade: best offer ${best.p.name} → ${tryDo(() => best.e.species.getName(), best.e.name)} (final BST ${best.gain >= 0 ? "+" : ""}${best.gain})` : "trade a mon for one of 3 offers",
          verdict: upgrade ? "take" : "ok", why: upgrade ? "same level, stronger line" : "no clear upgrade" },
        { outcome: "wonder trade: a random mon at the same level (better shiny / hidden ability odds)", verdict: null, why: "a gamble" },
        { outcome: "trade a held item for a random item one tier up", verdict: null },
        LEAVE,
      ];
    },
  };

  // ---- The model
  const build = (s, h) => {
    const me = s.currentBattle.mysteryEncounter;
    const party = s.getPlayerParty().filter(Boolean);
    const options = readOptions(s, h, me, party);
    const type = me.encounterType;
    const rule = RULES[type];
    let notes = [];
    let judged = null;
    // A secondary menu (override options) is not the encounter's own option list: read it, don't judge it.
    if (rule && options.every(o => o.index >= 0)) {
      try { judged = rule(context(s, me, options)); } catch (e) { notes.push(`couldn't judge this encounter: ${e.message}`); }
    }
    for (const o of options) {
      const r = judged?.[o.index];
      if (r) Object.assign(o, { outcome: r.outcome, battle: r.battle ?? null, exact: !!r.exact, verdict: r.verdict ?? null, why: r.why ?? null });
      else Object.assign(o, { outcome: null, battle: null, exact: false, verdict: null, why: null });
      if (!o.enabled) Object.assign(o, { verdict: "off", why: `needs ${r?.needs ?? "something your party lacks"}` });
    }
    const pick = options.findIndex(o => o.verdict === "take");
    if (me.catchAllowed) notes.push("balls work in its battle");
    return {
      kind: "encounter", type, name: NAMES[type] ?? `Encounter #${type}`, tier: TIERS[me.encounterTier] ?? null,
      known: !!judged, options, pick, notes,
    };
  };

  let cache = { key: null, value: null };
  const encounterModel = (s, h) => {
    const me = s.currentBattle.mysteryEncounter;
    const party = s.getPlayerParty().filter(Boolean);
    const key = JSON.stringify([s.currentBattle.waveIndex, me.encounterType, tryDo(() => me.getSeedOffset()), s.money,
      h.optionsMeetsReqs, tryDo(() => h.optionsContainer.list.map(o => o.text), []), (s.modifiers ?? []).length,
      party.map(p => [p.id, p.level, p.hp, p.status?.effect ?? 0, p.nature, p.moveset.filter(Boolean).map(m => m.moveId)])]);
    if (cache.key === key) return cache.value;
    const value = sandbox(s, () => build(s, h));
    cache = { key, value };
    return value;
  };

  return { encounterScreen, encounterModel };
})();
