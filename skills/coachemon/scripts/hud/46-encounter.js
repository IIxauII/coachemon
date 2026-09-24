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
// A **continuous encounter** re-opens the same screen with `overrideOptions` — options that are not on `me.options`,
// so nothing keys them by index. Safari Zone is the only one, and its menu is where its real decisions are, so those
// menus are judged by a second table (`OVERRIDES`) keyed by encounter type and read positionally; every other
// secondary menu still gets the generic reading, because the card knows nothing about it.
// The draws inside those closures are forks: `MysteryEncounterPhase.handleOptionSelect` runs onPreOptionPhase in
// `executeWithSeedOffset(fn, encounter.getSeedOffset())`, MysteryEncounterOptionSelectedPhase the option phase at
// `getSeedOffset() * 500`, PostMysteryEncounterPhase the post phase at `getSeedOffset() * 2000` — all on the run seed.
// `getSeedOffset()` is wave·1000 + 512 per MysteryEncounterPhase start. `executeWithSeedOffset` restores the stream when
// the callback returns, and these callbacks are async, so only the draws before their first `await` are forked: those
// are **exact** (the chest's trap roll, the store's item rolls, the teleport destination, who the fallout burns, the
// dealer's new nature, which member Dark Deal takes and the tier of the legendary it pays with, the second type
// Clowning Around gives every member), everything after is on the live stream and the card gives odds. An encounter
// whose `onInit` already rolled its outcome needs no replay at all: the salesman's mon and price, the clown's random
// ability and Blacephalon's types, Weird Dream's whole transformed team and the breeder's three candidates and their
// egg counts are all sitting on `misc`, on `enemyPartyConfigs` or among the dialogue tokens by the time the screen opens.
//
// ---- Judging (first cuts, all of them)
// A fight is "hard" when the foe is 5+ levels over our best, or nothing hits it super-effectively and it's at our level
// (a boss: within 3 levels under it). A **trainer** fight has no party to match up against — the mons are built when the
// battle starts — so it is hard on the level gap alone, or when it brings more than MONS_EACH mons for each member of
// ours still fit to fight. Money is spent freely only while it leaves RESERVE_WAVES waves' worth of reward money.
import { TYPES, abilityValue, natureOf, stage, typesOf } from "./01-core.js";
import { finalBstOf, partyProfile, partyReasons, typesOfSpecies } from "./08-party.js";
import { SAFARI_MONS, safariMonData, safariPreview, safariReady } from "./44-safari.js";
import { catchWorth } from "./45-catch.js";

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
// Great tier (weight 40).
const CHALLENGERS = MysteryEncounterType.MYSTERIOUS_CHALLENGERS, SNORLAX = MysteryEncounterType.SLUMBERING_SNORLAX,
  SAFARI = MysteryEncounterType.SAFARI_ZONE, DELIBIRDY = MysteryEncounterType.DELIBIRDY,
  AVARICE = MysteryEncounterType.ABSOLUTE_AVARICE, DANCING = MysteryEncounterType.DANCING_LESSONS,
  SUPERFAN = MysteryEncounterType.BUG_TYPE_SUPERFAN, FUN_AND_GAMES = MysteryEncounterType.FUN_AND_GAMES;
const TRAINING = MysteryEncounterType.TRAINING_SESSION, SALESMAN = MysteryEncounterType.THE_POKEMON_SALESMAN,
  TRASH = MysteryEncounterType.TRASH_TO_TREASURE, CLOWN = MysteryEncounterType.CLOWNING_AROUND,
  BREEDER = MysteryEncounterType.THE_EXPERT_POKEMON_BREEDER, DARK_DEAL = MysteryEncounterType.DARK_DEAL,
  TRAINERS_TEST = MysteryEncounterType.A_TRAINERS_TEST, WEIRD_DREAM = MysteryEncounterType.WEIRD_DREAM,
  WINSTRATE = MysteryEncounterType.THE_WINSTRATE_CHALLENGE;
const TIERS = { [MysteryEncounterTier.COMMON]: "common", [MysteryEncounterTier.GREAT]: "great", [MysteryEncounterTier.ULTRA]: "ultra", [MysteryEncounterTier.ROGUE]: "rogue" };
const DISABLED_MODES = new Set([MysteryEncounterOptionMode.DISABLED_OR_DEFAULT, MysteryEncounterOptionMode.DISABLED_OR_SPECIAL]);
// Teleporting Hijinks' BIOME_CANDIDATES, and the ones worth the trip (the biome card's rare destinations).
const TELEPORT_BIOMES = [[BiomeId.SPACE, "Space"], [BiomeId.FAIRY_CAVE, "Fairy Cave"], [BiomeId.LABORATORY, "Laboratory"],
  [BiomeId.ISLAND, "Island"], [BiomeId.WASTELAND, "Wasteland"], [BiomeId.DOJO, "Dojo"]];
const RARE_BIOMES = new Set([BiomeId.SPACE, BiomeId.FAIRY_CAVE, BiomeId.LABORATORY]);
const RESERVE_WAVES = 3;
const HARD_LEVEL_GAP = 5, BOSS_LEVEL_EDGE = 3;
// How many of a trainer's mons one fit member of ours is reckoned to get through, for the fights whose party the card
// can't see and so can't match up by type.
const MONS_EACH = 3;
// Mysterious Challengers' three fights, in option order, each richer than the last.
const CHALLENGER_REWARDS = ["a Common TM, a Great TM, a Memory Mushroom + the usual rolls",
  "2 Ultra + 2 Great + the usual rolls", "2 Rogue + 1 Ultra + 1 Great + the usual rolls, but 0.9× EXP"];
// Bug-Type Superfan's move tutor: one draw per pool, in this order. Only the pick is forked, so the names ride along.
const BUG_TUTORS = [
  [[MoveId.MEGAHORN, "Megahorn"], [MoveId.ATTACK_ORDER, "Attack Order"], [MoveId.BUG_BITE, "Bug Bite"], [MoveId.FIRST_IMPRESSION, "First Impression"], [MoveId.LUNGE, "Lunge"]],
  [[MoveId.SILVER_WIND, "Silver Wind"], [MoveId.SIGNAL_BEAM, "Signal Beam"], [MoveId.BUG_BUZZ, "Bug Buzz"], [MoveId.POLLEN_PUFF, "Pollen Puff"], [MoveId.STRUGGLE_BUG, "Struggle Bug"]],
  [[MoveId.STRING_SHOT, "String Shot"], [MoveId.DEFEND_ORDER, "Defend Order"], [MoveId.RAGE_POWDER, "Rage Powder"], [MoveId.STICKY_WEB, "Sticky Web"], [MoveId.SILK_TRAP, "Silk Trap"]],
  [[MoveId.LEECH_LIFE, "Leech Life"], [MoveId.U_TURN, "U-turn"], [MoveId.HEAL_ORDER, "Heal Order"], [MoveId.QUIVER_DANCE, "Quiver Dance"], [MoveId.INFESTATION, "Infestation"]],
];

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
const strip = t => String(t ?? "").replace(/\[\/?[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
const money = n => `$${Math.round(n).toLocaleString("en-US")}`;
// A chance, as the card says it: never a rounded-away 0% for something that can still happen.
const pct = x => (x >= 0.995 ? "100%" : x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const joinNames = names => (names.length > 2 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names.join(" & "));
// The game's `randSeedInt(range, min)` on whatever stream is sown.
const int = (range, min = 0) => (range <= 1 ? min : Phaser.Math.RND.integerInRange(min, range - 1 + min));

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

// ---- Safari Zone's minigame (§13)
// Paying opens a continuous encounter: three wild mons in turn, each offering ball / bait / mud / run until it is
// caught, it bolts, or you walk away. Both odds are arithmetic on two stages that reset with every mon.
// `throwPokeball`: `catchRate = round(species.catchRate × 1.5 × stageMod(catchStage))`, then a twitch rate of its own
// and — through `trainerThrowPokeball` — **three** checks of `randSeedInt(65536) < twitch`, with no HP term, no
// status or shiny multiplier and no critical capture, which is the whole of what makes it unlike a normal throw.
// `isPokemonFlee`: the flee rate is read off the **species** catch rate, never the modified one, and rolled against
// `randSeedInt(256)` at the end of every turn that is not a catch and not a run — a failed ball included.
// Both rolls are on the live stream, not a fork, so these are odds and the card never calls them `fixed`.
const clampStage = st => Math.min(Math.max(st ?? 0, -6), 6);
const stageMod = st => stage(clampStage(st));
const safariCatch = (rate, st) => {
  const catchRate = Math.round(rate * 1.5 * stageMod(st));
  if (!(catchRate > 0)) return 0;
  return Math.min(1, Math.round(1048560 / Math.sqrt(Math.sqrt(16711680 / catchRate))) / 65536) ** 3;
};
// `randSeedInt(256)` is 0–255, so a flee rate of 12.3 bolts on 13 of the 256 rolls.
const safariFlee = (rate, st) => Math.min(1, Math.max(0, Math.ceil(((255 * 255 - rate * rate) / 255 / 2) * stageMod(st))) / 256);
// `tryChangeCatchStage(2)` / `tryChangeFleeStage(1, 8)` on bait, the mirror on mud: the ×8 arm does nothing when
// `randSeedInt(10) >= 8`, so the side effect lands 4 times in 5. Both stages clamp to ±6.
const BAIT_FLEES = 0.8, MUD_DULLS = 0.8;

// The three mons the fee buys, replayed out of their own seed forks by `44-safari.js` before a coin is spent. What
// each is *worth* is the account's question rather than the game's, so `catchWorth` is asked here — on the live
// objects, while the replay still holds them — and the replay drops them afterwards.
const safariThree = c => {
  const out = safariPreview(c.s, p => ({ ...safariMonData(p), worth: tryDo(() => catchWorth(c.account, p)) }));
  if (!out.mons) return out;
  return { mons: out.mons.map(m => ({ ...m, wanted: worthKeeping(m.worth) })) };
};
const worthKeeping = worth => !!worth && worth.value >= worth.show;
const safariName = m => `${m.name}${m.shiny ? " shiny" : ""} L${m.level ?? "?"}${m.hiddenAbility ? " (hidden ability)" : ""}`;
// The two reasons a catch is weighed on, as the card says them everywhere else it prices one.
const worthWhy = worth => (worth?.reasons?.length ? worth.reasons.slice(0, 2).join(", ") : "nothing new");
// The menu the fee buys, spelled once: the fee names it a screen early and every turn re-opens it.
const SAFARI_MENU = "ball, bait, mud or run each time, each turn judged as it comes";

// What each move is worth, played out to the end: the chance this mon is eventually caught under best play. The two
// stages are the only state (13 × 13, reset per mon) and there is no turn limit, so the minigame is a small Markov
// decision problem rather than a lookup — "throw now" against "set up first" is a real comparison, and bait's +1 flee
// is paid on the same turn it buys the catch stage. Throwing leaves both stages where they were, so committing to the
// ball is a geometric race between the two rolls and closes in one line; bait and mud move the state, and can cycle,
// so those settle by value iteration (169 states, a few dozen passes).
const safariPlay = rate => {
  const at = (c, f) => (c + 6) * 13 + (f + 6);
  const p = [], q = [];
  for (let k = -6; k <= 6; k++) { p[k + 6] = safariCatch(rate, k); q[k + 6] = safariFlee(rate, k); }
  const V = new Array(169).fill(0);
  const moves = (c, f) => {
    const pc = p[c + 6], qf = q[f + 6], race = pc + qf - pc * qf;
    const bc = clampStage(c + 2), bf = clampStage(f + 1), mf = clampStage(f - 2), mc = clampStage(c - 1);
    return {
      ball: race > 0 ? pc / race : 0,
      bait: BAIT_FLEES * (1 - q[bf + 6]) * V[at(bc, bf)] + (1 - BAIT_FLEES) * (1 - qf) * V[at(bc, f)],
      mud: (1 - q[mf + 6]) * (MUD_DULLS * V[at(mc, mf)] + (1 - MUD_DULLS) * V[at(c, mf)]),
    };
  };
  for (let pass = 0; pass < 200; pass++) {
    let delta = 0;
    for (let c = -6; c <= 6; c++) for (let f = -6; f <= 6; f++) {
      const m = moves(c, f), best = Math.max(m.ball, m.bait, m.mud);
      delta = Math.max(delta, Math.abs(best - V[at(c, f)]));
      V[at(c, f)] = best;
    }
    if (delta < 1e-9) break;
  }
  return (c, f) => moves(clampStage(c), clampStage(f));
};

// ---- What the rules share
const context = (s, me, options, account) => {
  const b = s.currentBattle;
  const wave = b.waveIndex;
  const party = s.getPlayerParty().filter(Boolean);
  const alive = party.filter(p => p.hp > 0 && tryDo(() => p.isAllowedInBattle(), true));
  const top = alive.reduce((t, p) => (!t || p.level > t.level ? p : t), null);
  const profile = partyProfile(alive);
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
    // Who can hit it and who it hits back are the party profile's two matchup queries, so this card reads a foe the
    // same way the look-ahead reads the roster ahead, rather than multiplying the chart out by hand.
    const hitters = profile.hitters(f);
    const weak = [...new Set(f.types.flatMap(t => profile.weakTo(t)))];
    const gap = f.level - top.level;
    const hard = gap >= HARD_LEVEL_GAP || (!hitters.length && gap >= (f.boss ? -BOSS_LEVEL_EDGE : 0));
    const who = `${double ? "2× " : ""}${f.estimated ? "~" : ""}L${f.level}${f.boss ? " boss" : ""}${f.bars > 1 ? ` (${f.bars} bars)` : ""} vs your L${top.level}`;
    const text = [who, hitters.length ? `${plural(hitters.length, "mon")} hit${hitters.length === 1 ? "s" : ""} it SE` : "nothing hits it SE",
      weak.length ? `${weak.length} weak to it` : null].filter(Boolean).join(", ");
    return { hard, text };
  };
  // A trainer the encounter set up: how many mons it brings (its own configs, else the party template it was given)
  // and the level the battle will give them.
  const trainer = (k = 0) => {
    const cfg = me.enemyPartyConfigs?.[k];
    if (!cfg || (!cfg.trainerConfig && cfg.trainerType == null)) return null;
    const size = cfg.pokemonConfigs?.length || tryDo(() => cfg.trainerConfig.partyTemplates?.[0]?.size) || 0;
    const scale = Math.max(Math.round(wave / 10 * (cfg.levelAdditiveModifier ?? 0)), 0);
    return { name: tryDo(() => cfg.trainerConfig?.name), size, level: (b.enemyLevels?.[0] ?? top?.level ?? 1) + scale };
  };
  // A trainer fight, whose party the card can't see: no types to match up, so it is judged on the level gap and on how
  // many mons we would have to get through against how many of ours are still fit to.
  // `mons: null` is a team whose size nothing here settles — a trainer keeping its own party templates, which
  // `Trainer.getPartyTemplate` picks from by a template func, else by a random index (`field/trainer.ts:61`, `:255`),
  // so `partyTemplates[0]` is not what the battle will use. Then the call is the level gap alone, and the card says so.
  const gauntlet = (t, { mons = t?.size ?? 0, ours = null } = {}) => {
    if (!t || !alive.length) return { hard: false, text: "" };
    const fit = ours ?? alive.filter(p => tryDo(() => p.getHpRatio(), p.hp / p.getMaxHp()) >= 0.5).length;
    const gap = t.level - top.level;
    return { hard: gap >= HARD_LEVEL_GAP || (mons != null && mons > fit * MONS_EACH), fit,
      text: `${mons == null ? "their own team" : plural(mons, "mon")} at ~L${t.level} vs your L${top.level}, ${fit} of yours fit to fight` };
  };
  // The first party member not already holding a full stack of a held item, which is who the game hands a fresh one to.
  const roomFor = cls => party.find(p => {
    const cur = (tryDo(() => p.getHeldItems(), []) ?? []).find(m => m?.constructor?.name === cls);
    return !cur || (tryDo(() => cur.getStackCount()) ?? 0) < (tryDo(() => cur.getMaxStackCount()) ?? Infinity);
  }) ?? null;
  const spare = cost => s.money - cost - RESERVE_WAVES * waveMoney(1);
  // The whole party's best level, fainted included — what `getHighestLevelPlayerPokemon(false, true)` reads.
  const best = party.reduce((t, p) => Math.max(t, p.level ?? 0), 0) || (top?.level ?? 1);
  // How beaten up the party is, for the encounters that offer a heal against a reward.
  const maxHp = party.reduce((t, p) => t + tryDo(() => p.getMaxHp(), 0), 0);
  const wounded = maxHp ? party.reduce((t, p) => t + Math.max(tryDo(() => p.getMaxHp(), 0) - p.hp, 0), 0) / maxHp : 0;
  const fainted = party.filter(p => p.hp <= 0).length;
  // A held modifier of the player's by class name, and whether it is at the stack count that makes a reward degrade.
  const held = name => (s.modifiers ?? []).find(m => m?.constructor?.name === name) ?? null;
  const maxed = name => {
    const m = held(name);
    return !!m && (tryDo(() => m.getStackCount()) ?? m.stackCount ?? 0) >= (tryDo(() => m.getMaxStackCount()) ?? Infinity);
  };
  return { s, account, me, b, wave, party, alive, top, profile, waveMoney, coins, opt, foe, fight, spare,
    trainer, gauntlet, roomFor, best, wounded, fainted, held, maxed, token: k => strip(me.dialogueTokens?.[k]) || null,
    pre: seeded(1), during: seeded(500), post: seeded(2000) };
};

const LEAVE = { outcome: "shop only, no reward", verdict: "ok" };

// ---- Per encounter: one entry per `me.options` index. { outcome, battle, verdict: take|ok|avoid|null, why, exact, needs }
const RULES = {
  // ---- Ultra tier (weight 19)
  [TRAINING]: c => {
    // The mon you pick is pulled out of the party and fights you as a boss of itself — same level, form, IVs, moves and
    // held items — for a prize on the mon that fought. Bars grow with the wave, one option at a time.
    const bars = (every, cap) => Math.min(2 + Math.floor(c.wave / every), cap);
    const room = p => (p.ivs ?? []).reduce((t, iv) => t + Math.max(31 - iv, 0), 0);
    const fit = c.alive.filter(p => tryDo(() => p.isAllowedInChallenge(), true));
    const pickBy = score => fit.map(p => ({ p, v: score(p) })).filter(x => x.v > 0).reduce((t, x) => (!t || x.v > t.v ? x : t), null);
    // Which prize has someone to spend it on: IV room, a nature working against the mon's own attacking stat (the
    // vitamin dealer's test), an ability the tier list calls a liability.
    const ivs = pickBy(p => (p.ivs ? room(p) : 0));
    const nature = pickBy(p => {
      const fx = tryDo(() => natureOf(p.nature));
      if (!fx?.down) return 0;
      const main = tryDo(() => (p.getStat(Stat.ATK) >= p.getStat(Stat.SPATK) ? "Atk" : "SpA"), "Atk");
      return fx.down === main || fx.down === "Spe" ? 2 : 0;
    });
    const ability = pickBy(p => {
      const name = tryDo(() => p.getAbility().name);
      return name && abilityValue(name) < 0 ? 2 : 0;
    });
    const who = x => (x ? x.p.name : "the mon you pick");
    const out = [
      { outcome: `it fights you as a ${bars(50, 5)}-bar boss of itself → 2 of its weakest IVs go up (+10 under 11, +5 under 21, else +3)`,
        why: ivs ? `${who(ivs)} has the most IV room` : fit.some(p => p.ivs) ? "every member is near-maxed" : null, worth: ivs ? 1 : 0 },
      { outcome: `it fights you as a ${bars(40, 6)}-bar boss of itself → pick any nature for it`,
        why: nature ? `${who(nature)}'s nature works against it` : "no member's nature is hurting it", worth: nature ? 2 : 0.5 },
      { outcome: `it fights you as a ${bars(30, 6)}-bar boss of itself, +1 to every stat on entry → pick any of its abilities, hidden included`,
        why: ability ? `${who(ability)} is stuck with ${tryDo(() => ability.p.getAbility().name)}` : "no member's ability is a liability",
        worth: ability ? 3 : 0.5 },
      { ...LEAVE },
    ];
    // The prize with someone to spend it on wins, and a harder mirror is only worth it for a bigger prize.
    const best = out.slice(0, 3).reduce((b, o, k) => (o.worth > out[b].worth ? k : b), 0);
    return out.map((o, k) => (k === 3 ? { ...o, verdict: out[best].worth > 0.5 ? "ok" : "take" }
      : { ...o, verdict: k === best && o.worth > 0.5 ? "take" : "ok" }));
  },

  [SALESMAN]: c => {
    const mon = c.me.misc?.pokemon;
    const price = c.me.misc?.price ?? c.opt(0).cost ?? c.waveMoney(4);
    const worth = mon ? tryDo(() => catchWorth(c.account, mon)) : null;
    const wanted = worth && worth.value >= worth.show;
    const hidden = tryDo(() => mon.abilityIndex === 2);
    const name = mon ? `${tryDo(() => mon.getNameToRender(), mon.name) ?? mon.name}${mon.shiny ? " shiny" : ""}${hidden ? " (hidden ability)" : ""}`
      : c.token("purchasePokemon") ?? "a mon";
    const afford = c.spare(price) >= 0;
    const why = worth?.reasons?.length ? worth.reasons.slice(0, 2).join(", ") : "nothing new";
    return [
      // It is caught, not recruited: it arrives at level 5, so what it is worth is an unlock, which is the catch
      // card's account question and not this card's.
      { outcome: `${money(price)}: ${name} joins at L5`,
        verdict: wanted && afford ? "take" : wanted ? "ok" : "avoid",
        why: wanted ? (afford ? why : `${why}, but it leaves only ${money(c.s.money - price)}`) : `L5 and ${why}`, needs: "the money" },
      { ...LEAVE, verdict: wanted && afford ? "ok" : "take" },
    ];
  },

  [TRASH]: c => {
    const f = c.foe(0);
    const fight = c.fight(f);
    const lands = (item, p) => `${item} to ${p?.name ?? "a party member"}`;
    return [
      { outcome: `fight a Gmax Garbodor boss (${f?.bars || "6+"} bars, opens Toxic on your lead and Stockpile on itself; no switching) → Leftovers + Rogue / Ultra / Great rewards`,
        battle: "boss", verdict: fight.hard ? "ok" : "take", why: fight.text },
      // Black Sludge is the whole cost: the encounter only spawns from wave 100, so it taxes every shop left in the run.
      { outcome: `${lands("Leftovers", c.roomFor("TurnHealModifier"))}, ${lands("Shell Bell", c.roomFor("HitHealModifier"))} — and shop items cost 2.5× for the rest of the run`,
        verdict: fight.hard ? "take" : "ok", why: `${plural(Math.max(180 - c.wave, 0), "wave")} of shopping left to pay it` },
    ];
  },

  [CLOWN]: c => {
    const ability = c.token("ability");
    const worth = ability ? abilityValue(ability) : 0;
    const types = tryDo(() => c.me.enemyPartyConfigs[0].pokemonConfigs[1].customPokemonData.types
      .map(t => TYPES[t]).filter(Boolean).join(" / "));
    const fight = c.gauntlet(c.trainer(0), { mons: 2 });
    // Whose items the shuffle would reroll: the most transferable non-berry items, berries not counted.
    const carried = p => (tryDo(() => p.getHeldItems(), []) ?? [])
      .filter(m => m?.isTransferable && m?.constructor?.name !== "BerryModifier")
      .reduce((n, m) => n + (m.stackCount ?? 1), 0);
    const richest = c.party.reduce((best, p) => (!best || carried(p) > carried(best) ? p : best), null);
    // Every member's second type is redrawn in the pre-option fork, preferring a type it already attacks with — all of
    // it before the closure's first `await`, so the card replays the draws rather than describing them.
    const shuffled = c.pre(() => c.party.map(p => {
      const own = tryDo(() => p.getTypes({ includeTeraType: false, bypassSummonData: true, ignoreThirdType: true }));
      if (!own) return null;
      let pri = (p.moveset ?? []).filter(Boolean).map(m => tryDo(() => m.getMove()))
        .filter(mv => mv && mv.category !== MoveCategory.STATUS && !own.includes(mv.type)).map(mv => mv.type);
      pri = [...new Set(pri)].sort(); // the game's own sort, which orders these numbers as strings
      for (let i = pri.length - 1; i > 0; i--) { const j = int(i + 1); [pri[i], pri[j]] = [pri[j], pri[i]]; }
      const stab = pri.length > 0;
      let type, guard = 0;
      do { type = pri.length ? pri.pop() : int(18); } while (own.includes(type) && ++guard < 40);
      return { name: p.name, type: TYPES[type], stab };
    }));
    const named = shuffled?.filter(Boolean) ?? [];
    const gains = named.filter(x => x.stab).length;
    return [
      { outcome: `double vs boss Mr. Mime and boss Blacephalon (${types ?? "two random types"}, ${ability ?? "a random ability"}; Mr. Mime copies that ability, both Taunt your slots) → rewards, then ${ability ?? "that ability"} onto one of your mons for good`,
        battle: "double", verdict: fight.hard ? "ok" : worth > 0 ? "take" : "ok",
        why: worth > 0 ? `${ability} is worth keeping — ${fight.text}` : fight.text },
      { outcome: `${richest?.name ?? "your best holder"}'s berries and Ultra / Rogue items are rerolled inside their own tiers`,
        verdict: null, why: "same count, different items" },
      { outcome: named.length
        ? `every member's 2nd type is redrawn: ${named.map(x => `${x.name} → ${x.type}`).join(", ")}`
        : "every member's 2nd type is redrawn, preferring a type it already attacks with",
        exact: !!named.length, verdict: null,
        why: gains ? `${plural(gains, "member")} gain${gains === 1 ? "s" : ""} STAB on a move it already has` : "a reshuffle of every weakness" },
    ];
  },

  [BREEDER]: c => {
    const m = c.me.misc ?? {};
    const t = c.trainer(0);
    // The three on offer are the party's three least-friendly members, and only the one picked fights: the rest are
    // taken out of the party for it. Losing is not the run — the party comes back and the mon is fainted at 0
    // friendship with none of the rewards — so the fight is a free roll on a bench mon.
    const rows = [0, 1, 2].map(k => {
      const mon = m[`pokemon${k + 1}`];
      const common = m[`pokemon${k + 1}CommonEggs`] ?? 0, rare = m[`pokemon${k + 1}RareEggs`] ?? 0;
      const eggs = [rare ? plural(rare, "Great egg") : null, common ? plural(common, "Common egg") : null].filter(Boolean).join(" + ");
      return { mon, value: rare * 3 + common, eggs };
    });
    const solo = c.gauntlet(t, { mons: t?.size ?? 3, ours: 1 });
    const best = rows.reduce((b, r, k) => (r.value > rows[b].value ? k : b), 0);
    return rows.map((r, k) => ({
      outcome: `${r.mon?.name ?? `option ${k + 1}`} fights the breeder's ${t?.size ?? 3} alone → ${r.eggs || "eggs"} + a Soothe Bell + rewards`,
      verdict: k === best && r.value > 0 ? "take" : "ok",
      why: `${solo.text || "the rest of your party sits it out"} — lose and the party comes back, ${r.mon?.name ?? "it"} fainted at 0 friendship with no rewards`,
    }));
  },

  // ---- Rogue tier (weight 3, at most one a run)
  [DARK_DEAL]: c => {
    // `getRandomPlayerPokemon(true, false, true)`: a random legal member still standing — or, when only one of those is
    // left, a random fainted legal one. The draw is the pre-option fork's first, so which mon it takes is settled.
    const legal = c.party.filter(p => tryDo(() => p.isAllowedInChallenge(), true));
    const standing = legal.filter(p => p.hp > 0);
    const pool = standing.length === 1 ? legal.filter(p => p.hp <= 0) : standing;
    const k = pool.length ? c.pre(() => int(pool.length)) : null;
    const taken = k != null ? pool[k] : null;
    // The boss's starter tier is the option fork's first draw; which species of that tier is drawn after it, off
    // tables this card doesn't read.
    const roll = c.during(() => int(100));
    const tier = roll == null ? null : roll >= 65 ? "6" : roll >= 15 ? "7" : roll >= 5 ? "8" : "9–10";
    const carry = taken && taken === c.top;
    const spare = taken && taken === c.profile.weakest?.mon;
    const prize = `5 Rogue Balls + a catchable legendary boss${tier ? ` (starter tier ${tier})` : ""} of its types, holding its items`;
    return [
      { outcome: taken ? `${taken.name} is taken for good → ${prize}` : `a random member is taken for good → ${prize}`,
        battle: "boss", exact: !!taken && !!tier, verdict: carry ? "avoid" : spare ? "take" : taken ? "ok" : null,
        why: carry ? `${taken.name} is your strongest` : spare ? `${taken.name} is your weakest link`
          : taken ? `L${taken.level} ${taken.name} for a legendary` : "you don't choose who goes" },
      { ...LEAVE, verdict: carry ? "take" : "ok" },
    ];
  },

  [TRAINERS_TEST]: c => {
    const t = c.trainer(0);
    const fight = c.gauntlet(t);
    const name = t?.name ?? c.token("statTrainerName") ?? "a stat trainer";
    return [
      { outcome: `fight ${name}: ${t?.size ?? 6} mons, Elite Four strength → an Epic egg + Relic Gold + 2 Rogue rewards`,
        battle: "trainer", verdict: fight.hard ? "avoid" : "take", why: fight.text },
      { outcome: "a full party heal + a Rare egg, then the shop with no free reward",
        verdict: fight.hard ? "take" : "ok", why: fight.hard ? "the heal is worth more than a fight you lose" : null },
    ];
  },

  [WEIRD_DREAM]: c => {
    const bstOf = p => tryDo(() => p.getSpeciesForm().getBaseStatTotal(), p?.species?.baseTotal ?? 0) ?? 0;
    // `onInit` has already rolled the whole team, so the species each member becomes is settled before the screen
    // opens. Its ability, IVs, nature and second type are redrawn later, on the live stream.
    const rows = (c.me.misc?.teamTransformations ?? []).map(t => {
      const to = tryDo(() => t.newSpecies.getName(), t?.newSpecies?.name);
      return to ? { from: t.previousPokemon?.name, to, gain: (tryDo(() => t.newSpecies.getBaseStatTotal()) ?? 0) - bstOf(t.previousPokemon) } : null;
    }).filter(Boolean);
    const total = rows.reduce((n, r) => n + r.gain, 0);
    const list = rows.map(r => `${r.from} → ${r.to} (${r.gain >= 0 ? "+" : "−"}${Math.abs(r.gain)})`).join(", ");
    const tr = c.trainer(0) ?? (rows.length ? { size: rows.length, level: c.top?.level ?? 1 } : null);
    const fight = c.gauntlet(tr, { mons: rows.length || 3 });
    const drop = c.top ? c.top.level - Math.max(Math.ceil(0.9 * c.top.level), 1) : null;
    return [
      { outcome: rows.length
        ? `your whole party is swapped: ${list} — same levels, held items and the better IVs, then a full heal; pick one of a Memory Mushroom, a Rogue Ball or 4 Mints`
        : "your whole party is swapped for stronger species, then a full heal; pick one of a Memory Mushroom, a Rogue Ball or 4 Mints",
        verdict: total > 0 ? "take" : "ok",
        why: rows.length ? `+${total} base stats across the party; natures come out neutral, which is what the Mints are for` : null },
      { outcome: "fight that same team at your own levels, holding your items → pick one of 2 Rogue / 2 Ultra / 2 Great, and one member without a passive gets one for the run",
        battle: "trainer", verdict: fight.hard ? "avoid" : "ok", why: fight.text },
      { outcome: `every member loses 10% of its level${drop ? ` (your L${c.top.level} drops ${drop})` : ""}`,
        verdict: "avoid", why: "the only option that costs you something and gives nothing back" },
    ];
  },

  [WINSTRATE]: c => {
    // One battle per config, popped back to front, with no heal between them — only per-battle state is reset.
    const cfgs = c.me.enemyPartyConfigs ?? [];
    const mons = cfgs.reduce((n, cf) => n + (cf.pokemonConfigs?.length ?? 0), 0);
    const fight = c.gauntlet(c.trainer(0), { mons: mons || cfgs.length });
    return [
      { outcome: `${plural(cfgs.length || 5, "trainer battle")} back to back, ${plural(mons || 13, "mon")} in all, no healing between → a Premium Voucher + a Macho Brace`,
        battle: "trainer", verdict: fight.hard ? "avoid" : "take", why: fight.text },
      { outcome: "a full party heal + a Rarer Candy",
        verdict: fight.hard ? "take" : "ok", why: fight.hard ? "you would not finish the run of five" : null },
    ];
  },

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
    const worth = mon ? tryDo(() => catchWorth(c.account, mon)) : null;
    const wanted = worth && worth.value >= worth.show;
    const name = mon ? `${mon.name}${mon.shiny ? " shiny" : ""}` : "it";
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
      // An offer is judged against the member it would replace (`replacing`), at that member's own level — a trade
      // hands the new mon over at the same level. The rule is the party profile's, which is the catch card's: this
      // much more final BST, and a real mon rather than a route-1 one beating another (the 400 floor it gains here).
      for (const p of c.alive) {
        if (p === c.top) continue; // trading the carry away is never the upgrade it looks like
        for (const e of offers.get(p.id) ?? []) {
          const cand = { species: e.species, level: p.level, types: typesOfSpecies(e.species) };
          const up = partyReasons(c.profile, cand, { replacing: p }).some(r => r.kind === "upgrade");
          const gain = finalBstOf(cand).final - finalBstOf(p).final;
          if (!best || (up && !best.up) || (up === best.up && gain > best.gain)) best = { p, e, gain, up };
        }
      }
    }
    const upgrade = !!best?.up;
    return [
      { outcome: best ? `trade: best offer ${best.p.name} → ${tryDo(() => best.e.species.getName(), best.e.name)} (final BST ${best.gain >= 0 ? "+" : ""}${best.gain})` : "trade a mon for one of 3 offers",
        verdict: upgrade ? "take" : "ok", why: upgrade ? "same level, stronger line" : "no clear upgrade" },
      { outcome: "wonder trade: a random mon at the same level (better shiny / hidden ability odds)", verdict: null, why: "a gamble" },
      { outcome: "trade a held item for a random item one tier up", verdict: null },
      LEAVE,
    ];
  },

  // ---- Great tier (weight 40)

  [CHALLENGERS]: c => {
    // Three trainer battles off one wave, richer the harder they are. Nothing about their teams is readable — the
    // configs hold a `trainerConfig`, not species — so the call is the gauntlet one: the level, and how many mons
    // they bring against how many of ours are still fit. Only the last two have a size to read: the encounter hands
    // them their templates itself (1 STRONGER + min(ceil(wave / 20), 5) AVERAGE, then ELITE_FOUR). The first keeps
    // the biome trainer's own, which the battle picks from later, so its size is left unclaimed.
    const rows = [c.trainer(0), c.trainer(1), c.trainer(2)].map((t, k) => ({
      t, g: c.gauntlet(t, k === 0 ? { mons: null } : {}), reward: CHALLENGER_REWARDS[k],
    }));
    // The richest fight that isn't hard; if all three are, the mildest one. A row we couldn't read is never promoted —
    // reading nothing is not evidence the fight is safe.
    let best = 0;
    for (let k = 1; k < rows.length; k++) if (rows[k].t && !rows[k].g.hard) best = k;
    return rows.map(({ t, g, reward }, k) => ({
      outcome: `fight ${t?.name ?? ["a trainer", "a tougher trainer", "a gym leader"][k]}${k === 2 ? " with an Elite Four team" : ""} → ${reward}`,
      battle: "trainer", verdict: k === best ? "take" : g.hard ? "avoid" : "ok", why: g.text || null,
    }));
  },

  [SNORLAX]: c => {
    const f = c.foe(0);
    const fight = c.fight(f);
    const steal = c.opt(2).enabled;
    // The nap is a PartyHealPhase and then nothing: it leaves with addHealPhase false, so no reward screen at all.
    const hurt = c.wounded >= 0.35 || c.fainted > 0;
    return [
      { outcome: `fight ${f?.name ?? "Snorlax"} (asleep 6 turns, but it opens with Snore and holds Sitrus + Enigma) → Leftovers + rewards; catchable`,
        battle: "boss", verdict: steal || hurt ? "ok" : fight.hard ? "avoid" : "take", why: fight.text },
      { outcome: "nap beside it: the whole party is healed and revived, then nothing — no reward, no shop",
        verdict: hurt && !steal ? "take" : "ok",
        why: hurt ? `${c.fainted ? `${plural(c.fainted, "mon")} down, ` : ""}${Math.round(c.wounded * 100)}% of your HP is gone` : "your party is fine" },
      { outcome: "steal its Leftovers: no fight, Leftovers, and its EXP to the thief", verdict: "take",
        needs: "a Thief / Covet / Knock Off / Pluck / Trick / Switcheroo user" },
    ];
  },

  [SAFARI]: c => {
    const price = c.opt(0).cost ?? c.waveMoney(2);
    const afford = c.spare(price) >= 0;
    // The fee is the one Safari decision that hangs on something money can't say, so the three mons are named before
    // it is paid — and named even when the fee is out of reach, since knowing a shiny sat behind an unaffordable door
    // is what tells you whether to sell something first.
    const three = safariThree(c);
    const mons = three.mons ?? null;
    const wanted = mons ? mons.filter(m => m.wanted) : [];
    // With nothing to name, the call falls back to what the fee buys in general — the line this option carried before
    // the three were reachable.
    const buys = mons
      ? `${mons.map(safariName).join(", ")} in turn — ${SAFARI_MENU}`
      : `three wild mons in turn — ${SAFARI_MENU}. Safari-ball odds (×1.5), doubled shiny and hidden-ability rolls, species of starter cost 5 or less at this wave's level`;
    // Money alone decides it only while the three are unknown; once they are named, one wanted mon out of three is a
    // take and none is a leave.
    const worthIt = !mons || wanted.length > 0;
    const left = money(c.s.money - price);
    // What the three are worth is the whole reason they are named while the fee is out of reach — so the
    // unaffordable line says it too, and the money becomes the clause rather than the answer.
    const worthLine = !mons ? null
      : wanted.length ? `${wanted.length === 1 ? "one of the three is" : `${wanted.length} of the three are`} worth a ball: ${worthWhy(wanted[0].worth)}`
        : `none of the three is worth a ball — ${worthWhy(mons[0].worth)}`;
    return {
      // What bait and mud are worth is a per-turn call on the mon in front of you, so it is left to `OVERRIDES`
      // rather than guessed at here, a screen early.
      rows: [
        { outcome: `${money(price)}: ${buys}`, exact: !!mons,
          verdict: afford && worthIt ? "take" : "ok",
          why: worthLine ? `${worthLine}, ${afford ? `and it leaves ${left}` : `but it leaves only ${left}`}`
            : afford ? `leaves ${left}` : `leaves only ${left}`,
          needs: "the money" },
        { ...LEAVE, verdict: afford && worthIt ? "ok" : "take" },
      ],
      notes: mons ? [] : [`can't name the three mons: ${three.why}`],
    };
  },

  [DELIBIRDY]: c => {
    const price = c.opt(0).cost ?? c.waveMoney(2);
    const afford = c.spare(price) >= 0;
    // Each option gives a charm, or a Shell Bell on your lead when that charm is already at max stacks.
    const shell = " — but yours is maxed, so it's a Shell Bell on your lead instead";
    const coin = c.maxed("MoneyMultiplierModifier"), jar = c.maxed("LevelIncrementBoosterModifier"),
      pouch = c.maxed("PreserveBerryModifier"), charm = c.maxed("HealingBoosterModifier");
    // Rank by what you would actually get: the Amulet Coin compounds, a spare berry is the cheapest thing to give up.
    // With every charm maxed all three hand back a Shell Bell, so the money is only worth it if it's spare.
    const best = !coin && afford ? 0 : !jar || !pouch ? 1 : !charm ? 2 : afford ? 0 : 1;
    return [
      { outcome: `${money(price)}: an Amulet Coin${coin ? shell : ""}`, verdict: best === 0 ? "take" : "ok",
        why: afford ? `leaves ${money(c.s.money - price)}` : `leaves only ${money(c.s.money - price)}`, needs: "the money" },
      { outcome: `hand over a berry for a Candy Jar${jar ? shell : ""}, or a Reviver Seed for a Berry Pouch${pouch ? shell : ""}`,
        verdict: best === 1 ? "take" : "ok", why: "the item is gone for good", needs: "a mon holding a berry or a Reviver Seed" },
      { outcome: `hand over any other held item for a Healing Charm${charm ? shell : ""}`, verdict: best === 2 ? "take" : "ok",
        why: "the item is gone for good — pick something you don't use", needs: "a mon holding something that isn't a berry, Reviver Seed, vitamin or Tera shard" },
    ];
  },

  [AVARICE]: c => {
    // onVisualsStart has already taken every berry; `misc.berryItemsMap` is the record of what it took, by holder.
    const map = c.me.misc?.berryItemsMap;
    const per = map ? [...map.values()].map(mods => mods.reduce((t, m) => t + (m.stackCount ?? 1), 0)) : [];
    const stolen = per.reduce((t, n) => t + n, 0);
    // Each holder gets 2/5 of their own back, rounded down. The count is arithmetic; which berries they are is a
    // shuffle on the option fork, and not replayed here — the loop that draws it builds modifiers in between.
    const back = per.reduce((t, n) => t + Math.floor(n * 2 / 5), 0);
    const f = c.foe(0);
    const fight = c.fight(f);
    // `givePartyPokemonReviverSeeds` walks the whole party — fainted included — and skips whoever already holds one.
    const seedless = c.party.filter(p => !(tryDo(() => p.getHeldItems(), []) ?? [])
      .some(m => m?.constructor?.name === "PokemonInstantReviveModifier")).length;
    const enraged = c.wave < 50 ? "+1 SpD" : "+1 SpD/Spe";
    return [
      { outcome: `fight Greedent (${f?.bars || 3} bars, ${enraged}, Stuff Cheeks on turn 1, eating the ${plural(stolen, "berry", "berries")} it took) → rewards, and a Reviver Seed for every mon without one`,
        battle: "boss", exact: !!stolen, verdict: fight.hard ? "ok" : "take",
        why: [fight.text, seedless ? `${plural(seedless, "seed")} at stake` : null].filter(Boolean).join(" · ") },
      { outcome: `beg: ${plural(back, "berry", "berries")} of your ${stolen} come back, random types, the rest are gone`,
        exact: !!stolen, verdict: back && fight.hard ? "take" : "ok", why: back ? null : "you get nothing back" },
      // `getHighestLevelPlayerPokemon(false, true)` takes the whole party's best level, a fainted mon's included.
      { outcome: `let it eat: Greedent joins at L${Math.max(c.best - 2, 1)} with its passive and Thrash / Body Press / Stuff Cheeks / Slack Off; every berry is gone`,
        verdict: "ok", why: "a free mon, for every berry you own" },
    ];
  },

  [DANCING]: c => {
    // onInit put the real Oricorio on the field, so its level, form and shininess are a read, not a guess.
    const live = tryDo(() => c.s.getEnemyParty()[0]);
    const shown = live
      ? { name: tryDo(() => live.name, "Oricorio"), types: typesOf(live), level: live.level, boss: true, bars: 0, estimated: false }
      : c.foe(0);
    const fight = c.fight(shown);
    const worth = live ? tryDo(() => catchWorth(c.account, live)) : null;
    const wanted = worth && worth.value >= worth.show;
    const why = worth?.reasons?.length ? worth.reasons.slice(0, 2).join(", ") : "nothing new";
    const name = `${shown?.name ?? "Oricorio"}${live?.shiny ? " shiny" : ""}`;
    const recruit = c.opt(2).enabled;
    return [
      { outcome: `fight ${name} (+1 Atk/Def/SpA/SpD on entry, opens with Revelation Dance) → a Baton + rewards; catchable`,
        battle: "boss", verdict: recruit || !wanted ? "ok" : fight.hard ? "avoid" : "take", why: fight.text },
      { outcome: "learn the dance: one mon of your choice is taught Revelation Dance (100 power, special, always the user's own first type)",
        verdict: recruit || wanted ? "ok" : "take", why: "free, and it keeps the move for the run" },
      { outcome: `show it a dance: ${name} joins, keeping the dance move you used`, verdict: recruit ? "take" : "ok",
        why: wanted ? why : `a free mon (${why})`, needs: "a mon with a dancing move" },
    ];
  },

  [SUPERFAN]: c => {
    const t = c.trainer(0);
    const quinn = c.gauntlet(t);
    // The four tutor picks are the option fork's first four draws, one per pool, before anything is awaited.
    const tutors = c.during(() => BUG_TUTORS.map(pool => pool[int(pool.length)][1]));
    // The reward tier counts every Bug type in the party, fainted ones too.
    const bugs = c.party.filter(p => tryDo(() => p.isOfType(PokemonType.BUG), typesOf(p).includes("Bug"))).length;
    const extras = [c.held("MegaEvolutionAccessModifier") ? null : "a Mega Bracelet",
      // The fourth slot is pushed only `if (specialOptions.length > 0)`, so it is an "up to", not a promise.
      c.held("GigantamaxAccessModifier") ? null : "a Dynamax Band", "likely an evolution or form-change item"].filter(Boolean);
    const prize = bugs < 2 ? "a Super Lure + a Great Ball" : bugs < 4 ? "a Quick Claw + a Max Lure + an Ultra Ball"
      : bugs < 6 ? "a Grip Claw + a Max Lure + a Rogue Ball" : `a Master Ball, ${joinNames(extras)}`;
    const net = c.opt(2).enabled;
    const best = bugs >= 6 ? 1 : net ? 2 : 0;
    return [
      { outcome: `fight ${t?.name ?? "the Bug-Type Superfan"} → rewards, then a free tutor move${tutors ? `: ${joinNames(tutors)}` : " from four bug pools"}`,
        battle: "trainer", exact: !!tutors, verdict: best === 0 ? "take" : "ok", why: quinn.text || null },
      { outcome: `show off your bug types (${plural(bugs, "bug")}) → ${prize}`, verdict: best === 1 ? "take" : "ok",
        why: bugs < 6 ? `${6 - bugs} more bugs would make it a Master Ball` : "every slot is a bug", needs: "a Bug type" },
      { outcome: "hand over the bug item → a Golden Bug Net (Rogue) + a Reviver Seed, no fight",
        verdict: best === 2 ? "take" : "ok", why: "the item is gone for good", needs: "a mon holding a Quick Claw, Grip Claw or Bug-type booster" },
    ];
  },

  [FUN_AND_GAMES]: c => {
    const price = c.opt(0).cost ?? c.waveMoney(1.5);
    const afford = c.spare(price) >= 0;
    return [
      { outcome: `${money(price)}: pick a mon, then three turns on a Wobbuffet at that mon's level (0 IVs, Mild, it never attacks). Under 3% HP a Multi Lens, under 15% a Scope Lens, under 33% a Wide Lens, over that nothing. KO it and you lose and pay ${money(price)} again`,
        verdict: afford ? "ok" : "avoid",
        why: afford ? "pick a mon whose damage you can hold back, not your hardest hitter" : `leaves only ${money(c.s.money - price)}`,
        needs: "the money" },
      { ...LEAVE, verdict: afford ? "ok" : "take" },
    ];
  },
};

// ---- Per encounter: the secondary menu it re-opens the screen with. Keyed by encounter type, read **positionally**
// (an override option is not on `me.options`, so it has no index), and free to return `null` when the screen holds
// something it can't read — the card then falls back to the generic reading, the same as an unknown encounter.
// `{ rows, state, notes }`: one row per override option, the turn the card event keys off, and the lines the card
// carries under the options.
const OVERRIDES = {
  [SAFARI]: c => {
    const misc = c.me.misc ?? {};
    // `summonSafariPokemon` puts the mon on `misc.pokemon` and at the head of the enemy party; either is the read.
    const mon = misc.pokemon ?? tryDo(() => c.s.getEnemyParty()[0]);
    const rate = tryDo(() => mon.species.catchRate);
    if (!mon || !(rate > 0)) return null;
    const name = tryDo(() => mon.getNameToRender(), mon.name) ?? mon.name ?? "it";
    // The count is decremented as a mon is summoned, so it is how many come *after* this one.
    const left = misc.safariPokemonRemaining ?? 0;
    const cs = clampStage(misc.catchStage), fs = clampStage(misc.fleeStage);
    const now = safariPlay(rate)(cs, fs);
    const p = safariCatch(rate, cs), q = safariFlee(rate, fs);
    const worth = tryDo(() => catchWorth(c.account, mon));
    const wanted = worthKeeping(worth);
    const why = worthWhy(worth);
    const best = ["bait", "mud"].reduce((b, k) => (now[k] > now[b] + 1e-9 ? k : b), "ball");
    const odds = k => `${pct(now[k])} of the time from here`;
    // Running is priced against what it buys, so the same replay the fee screen used names what comes next. The
    // count is decremented as a mon is summoned, so the mon after this one is the fork at `remaining === left`.
    const next = left ? safariThree(c).mons?.[SAFARI_MONS - left] ?? null : null;
    return {
      state: { mon: name, shiny: !!tryDo(() => mon.isShiny(), mon.shiny), left, catchStage: cs, fleeStage: fs,
        catchRate: rate, catch: p, flee: q, wanted, best, value: now[best],
        next: next ? { name: next.name, shiny: next.shiny, level: next.level, wanted: next.wanted } : null },
      notes: [`${name} at L${mon.level ?? "?"}: catch rate ${rate}, stages ${cs >= 0 ? "+" : ""}${cs} catch / ${fs >= 0 ? "+" : ""}${fs} flee, `
        + `${left ? `${plural(left, "mon")} after this one` : "the last of the three"}`,
      wanted ? `worth a ball: ${why}` : `not worth the turns: ${why}`],
      rows: [
        // A twitch rate at or over 65536 passes all three shakes, so the throw locks: `doEndTurn` never runs and the
        // flee roll — which reads the unmodified species rate and so is positive either way — never comes.
        { outcome: `${pct(p)} to catch it now${p >= 1 ? " — it cannot miss, so it never gets its roll to bolt"
          : q > 0 ? `, and a miss ends the turn — it bolts at ${pct(q)}` : ", and it never bolts"}`,
          verdict: wanted && best === "ball" ? "take" : "ok", why: `throwing until it is settled lands it ${odds("ball")}` },
        { outcome: `catch +2 → ${pct(safariCatch(rate, clampStage(cs + 2)))}, and 4 times in 5 flee +1 → ${pct(safariFlee(rate, clampStage(fs + 1)))}; then it rolls to bolt`,
          verdict: wanted && best === "bait" ? "take" : "ok", why: `baiting first lands it ${odds("bait")}` },
        { outcome: `flee −2 → ${pct(safariFlee(rate, clampStage(fs - 2)))}, and 4 times in 5 catch −1 → ${pct(safariCatch(rate, clampStage(cs - 1)))}; then it rolls to bolt`,
          verdict: wanted && best === "mud" ? "take" : "ok", why: `mudding first lands it ${odds("mud")}` },
        { outcome: left
          ? `let it go — ${next ? `${safariName(next)} is next, ` : ""}${plural(left, "mon")} left after this one`
          : "let it go — the last of the three, so this ends the safari",
        verdict: wanted ? "avoid" : "take",
        why: wanted ? `you would be giving up a ${pct(now[best])} catch`
          : next?.wanted ? `nothing here, and ${safariName(next)} is worth a ball: ${worthWhy(next.worth)}` : why },
      ],
    };
  },
};

// ---- The model
const build = (s, h, account) => {
  const me = s.currentBattle.mysteryEncounter;
  const party = s.getPlayerParty().filter(Boolean);
  const options = readOptions(s, h, me, party);
  const type = me.encounterType;
  // Which menu is on screen: the encounter's own options, or the secondary menu a continuous encounter re-opens it
  // with. A mixed list is neither, and is read rather than judged.
  const own = options.length > 0 && options.every(o => o.index >= 0);
  const override = options.length > 0 && options.every(o => o.index < 0);
  const rule = own ? RULES[type] : override ? OVERRIDES[type] : null;
  let notes = [];
  let judged = null;
  let minigame = null;
  if (rule) {
    try {
      const out = rule(context(s, me, options, account));
      // Rows alone, or `{ rows, state, notes }` — an override rule answers with the turn it read as well as its rows,
      // and an encounter's own rule uses the longer form when it has something to say outside an option (Safari
      // Zone's, when it can't name the three mons the fee buys).
      if (Array.isArray(out)) judged = out;
      else if (out) { judged = out.rows; minigame = out.state ?? null; notes.push(...(out.notes ?? [])); }
    } catch (e) { notes.push(`couldn't judge this encounter: ${e.message}`); }
  }
  for (const [i, o] of options.entries()) {
    const r = judged?.[override ? i : o.index];
    if (r) Object.assign(o, { outcome: r.outcome, battle: r.battle ?? null, exact: !!r.exact, verdict: r.verdict ?? null, why: r.why ?? null });
    else Object.assign(o, { outcome: null, battle: null, exact: false, verdict: null, why: null });
    if (!o.enabled) Object.assign(o, { verdict: "off", why: `needs ${r?.needs ?? "something your party lacks"}` });
  }
  const pick = options.findIndex(o => o.verdict === "take");
  if (me.catchAllowed) notes.push("balls work in its battle");
  return {
    kind: "encounter", type, name: NAMES[type] ?? `Encounter #${type}`, tier: TIERS[me.encounterTier] ?? null,
    known: !!judged, options, pick, notes, minigame,
  };
};

// `run` is the run read: the model is built inside its sandbox and kept in its memo. The wave, the modifier count and
// each member's level and standing are the run key's; what the card reads beyond that — the encounter and its
// minigame's stage, the money, the options on screen, each member's exact HP, status, nature and moveset — is its
// key within the run. A build that throws is the run read's `{ unavailable }`, shaped here as an unjudged card that
// carries the reason, so the panel says why rather than dying on it.
export const encounterModel = (run, h, account) => {
  const s = run.scene;
  const me = s.currentBattle.mysteryEncounter;
  const party = run.facts.party;
  const key = JSON.stringify([me.encounterType, tryDo(() => me.getSeedOffset()), s.money,
    // A minigame turn is a new decision on the same encounter: the mon in front of you and its two stages are what moved.
    [me.misc?.safariPokemonRemaining, me.misc?.catchStage, me.misc?.fleeStage, tryDo(() => me.misc?.pokemon?.id)],
    // The game's tables are scanned out of the page's chunks asynchronously, so a card built before the scan landed
    // says it can't name Safari Zone's three mons. That answer stops being true mid-encounter, and nothing else in
    // this key moves when it does.
    tryDo(() => safariReady(s), false),
    h.optionsMeetsReqs, tryDo(() => h.optionsContainer.list.map(o => o.text), []),
    party.map(p => [p.id, p.hp, p.status?.effect ?? 0, p.nature, p.moveset.filter(Boolean).map(m => m.moveId)])]);
  const value = run.memo("encounter", key, () => build(s, h, account));
  if (value.kind) return value;
  const type = me.encounterType;
  return { kind: "encounter", type, name: NAMES[type] ?? `Encounter #${type}`, tier: TIERS[me.encounterTier] ?? null,
    known: false, options: [], pick: -1, notes: [`unread: ${value.unavailable}`], minigame: null };
};

// `Mysterious Chest: take Open it — pick of 3 Ultra items · avoid Leave`, for the watcher and the battle read.
export const encounterSummary = m => {
  const pick = m.pick >= 0 ? m.options[m.pick] : null;
  const avoid = m.options.filter(o => o.verdict === "avoid").map(o => o.label);
  const head = pick ? `take ${pick.label}${pick.outcome ? ` — ${pick.outcome}` : ""}` : m.known ? "your call" : "not judged";
  // A minigame turn is about the mon in front of you, not the encounter as a whole, so the read names it.
  const who = m.minigame ? ` vs ${m.minigame.mon}${m.minigame.shiny ? " shiny" : ""}` : "";
  return `${m.name}${who}: ${head}${avoid.length ? ` · avoid ${avoid.join(", ")}` : ""}`;
};
