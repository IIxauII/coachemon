// Learn-move card model. The screen itself is detected in 02-screens (`learnState`), which the probe shares.
// No game functions run here (the game isn't waiting on a battle command): only move/attr fields are read.
import { ABILITY_IMMUNE, CHART, SPREAD_TARGETS, STATUS_FRAMES, TYPES, abilitiesOf, effectiveness, iconOf, moveHasFlag, typesOf, vs } from "./01-core.js";
import { RANDBATS } from "./05-randbats.js";
import { costNotes, moveTraits } from "./07-move-traits.js";
import { partyProfile } from "./08-party.js";

// A Move object for a move id, built the way LearnMovePhase's prompt is: from any PokemonMove's constructor.
export const learnMoveById = (party, id) => {
  const pm = party.flatMap(p => p?.moveset ?? []).find(Boolean);
  try { return pm ? new pm.constructor(id).getMove() : null; } catch { return null; }
};

const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
const attrsOf = (mv, name) => (mv.attrs || []).filter(a => a.constructor?.name === name);
export const isDamaging = mv => !!mv && mv.category !== MoveCategory.STATUS && (mv.power > 0 || mv.power === -1);
const unimplemented = mv => / \(N\)$/.test(mv.name ?? "");

// Fixed damage as the base power that deals about as much at this level with even Atk/Def and no STAB
// (getBaseDamage: (2L/5+2)·P·A/D/50+2).
const fixedPower = (dmg, level) => Math.round(Math.max(0, dmg) * 50 / (2 * (level || 50) / 5 + 2));
// Moves with power −1 in the move data: power set by the target or the moment. Stand-ins, by attribute:
// [attr, power(pk, mv, attr), note, fixed damage (no STAB, no type effectiveness)?]
const STAND_INS = [
  ["LevelDamageAttr", pk => fixedPower(pk.level, pk.level), "damage = level", true],
  ["RandomLevelDamageAttr", pk => fixedPower(pk.level, pk.level), "damage ≈ level", true],
  // Half the target's HP: about a quarter of a same-level foe's max HP over a fight, and it can't KO.
  ["TargetHalfHpDamageAttr", pk => fixedPower((2.1 * pk.level + 10) / 4, pk.level), "halves HP · can't KO", true],
  ["FixedDamageAttr", (pk, mv, a) => fixedPower(a.damage ?? 0, pk.level), "fixed damage", true],
  ["MatchHpAttr", () => 40, "HP to yours", true],
  ["UserHpDamageAttr", () => 40, "damage = your HP", true],
  ["CounterDamageAttr", () => 40, "needs to be hit first", true],
  ["WeightPowerAttr", () => 60, "weight-based"],
  ["CompareWeightPowerAttr", () => 60, "weight-based"],
  ["GyroBallPowerAttr", () => 60, "speed-based"],
  ["ElectroBallPowerAttr", () => 60, "speed-based"],
  ["LowHpPowerAttr", () => 40, "strong at low HP"],
  ["FriendshipPowerAttr", (pk, mv, a) => Math.max(1, Math.floor((a.invert ? 255 - (pk.friendship ?? 0) : pk.friendship ?? 0) / 2.5)), "friendship"],
  ["OpponentHighHpPowerAttr", () => 60, "weaker as the foe tires"],
  ["MagnitudePowerAttr", () => 71, "random power"],
  ["PresentPowerAttr", () => 52, "may heal the foe"],
  ["BeatUpAttr", (pk, mv, a, party) => 15 * Math.max(1, party.filter(p => p?.hp > 0 && !(p.status?.effect > StatusEffect.NONE)).length), "party-based"],
  ["SpitUpPowerAttr", () => 30, "needs Stockpile"],
  ["LessPPMorePowerAttr", () => 60, "stronger as PP drops"],
  ["PunishmentPowerAttr", () => 60, "stronger vs boosts"],
];
const standIn = (pk, mv, party) => {
  for (const [name, power, note, fixed] of STAND_INS) {
    const a = attrsOf(mv, name)[0];
    if (a) return { power: power(pk, mv, a, party), note, fixed: !!fixed };
  }
  return { power: 60, note: "variable power", fixed: false };
};

// Expected hits and the per-hit power multiple they add up to, from the traits' one hit model (07-move-traits):
// TWO_TO_FIVE's 2–5 distribution averages 3.1 (Skill Link 5), BEAT_UP counts the party the way the game does,
// Parental Bond and Multi-Lens add their strikes. Triple Axel/Kick grow by the base power each hit and check
// accuracy per hit (CHECK_ALL_HITS): Σ a^(k+1)·(k+1). Otherwise only the first hit can miss.
const multiHit = (t, acc) => {
  const n = t.hits.mean;
  if (n <= 1) return { hits: 1, factor: acc };
  if (!t.hits.checkAll && !t.hits.grows) return { hits: n, factor: acc * n };
  let factor = 0, reach = 1, hits = 0;
  for (let k = 0; k < Math.round(n); k++) {
    reach *= t.hits.checkAll || k === 0 ? acc : 1;
    factor += reach * (t.hits.grows ? k + 1 : 1);
    hits += reach;
  }
  return { hits: Math.round(hits * 10) / 10, factor };
};

// Defending types a set of moves hits super-effectively (single types). Fixed damage ignores effectiveness.
export const isFixed = mv => mv.power === -1 && STAND_INS.some(([name, , , fixed]) => fixed && attrsOf(mv, name).length);
const seTypes = moves => new Set(moves.filter(m => isDamaging(m) && !isFixed(m)).flatMap(m => CHART[TYPES[m.type]]?.[0] ?? []));
// ---- Which stat the mon actually attacks with
// Abilities that multiply an attack stat outright (Huge Power doubles Atk): a Marill's 50 Atk is a 100 Atk for
// every physical move it will ever pick, so the card compares and reports the multiplied number.
// Gorilla Tactics is left out: it multiplies Atk too, but locks the mon into the move it opens with, and that
// trade is not something a per-move score can carry.
const ATK_MULT = { "Huge Power": 2, "Pure Power": 2, Hustle: 1.5 };
const atkOf = pk => abilitiesOf(pk).reduce((n, a) => n * (ATK_MULT[a] ?? 1), pk.getStat(Stat.ATK));
const spaOf = pk => pk.getStat(Stat.SPATK);
// The stat(s) this mon attacks with: within 10% of its best is close enough to count as both.
const mainStats = pk => {
  const atk = atkOf(pk), spa = spaOf(pk);
  return new Set([atk >= spa * 0.9 ? Stat.ATK : null, spa >= atk * 0.9 ? Stat.SPATK : null].filter(Boolean));
};

// Self/ally-side move targets (MoveTarget): nothing on the far side is touched, so accuracy never applies and a
// stat change here is a buff, not a drop — Howl's attr carries no `selfTarget`, only this target.
const SELF_TARGETS = new Set([MoveTarget.USER, MoveTarget.NEAR_ALLY, MoveTarget.ALLY, MoveTarget.USER_OR_NEAR_ALLY, MoveTarget.USER_AND_ALLIES, MoveTarget.USER_SIDE, MoveTarget.PARTY]);
const ALLY_TARGETS = new Set([MoveTarget.NEAR_ALLY, MoveTarget.ALLY]); // there is nobody to aim at in a single battle

// A status move that raises the user's own stats (Calm Mind, Swords Dance, Dragon Dance): worth something when it
// boosts the stat this mon attacks with and it has no such setup move yet. `value` is in the same rough units as
// effective power; null when the move isn't setup.
const setupOf = (pk, mv, current) => {
  if (mv.category !== MoveCategory.STATUS) return null;
  const ownBoosts = m => moveTraits(m, pk).stages.filter(x => (x.self || x.side) && x.stages > 0);
  const boosts = ownBoosts(mv);
  if (!boosts.length) return null;
  const main = mainStats(pk);
  const weight = i => (main.has(i) ? 30 : i === Stat.SPD ? 20 : i === Stat.DEF || i === Stat.SPDEF ? 10 : i === Stat.ATK || i === Stat.SPATK ? 5 : 3);
  let value = 0;
  const parts = [];
  for (const a of boosts) {
    for (const i of a.stats) value += weight(i) * a.stages;
    parts.push(`+${a.stages} ${a.stats.map(i => STAT_NAMES[i]).join("/")}`);
  }
  const boostsMain = boosts.some(a => a.stats.some(i => main.has(i)));
  const hasSetup = current.some(o => o !== mv && o.category === MoveCategory.STATUS
    && ownBoosts(o).some(a => a.stats.some(i => main.has(i))));
  if (!boostsMain) value *= 0.5;
  if (hasSetup) value *= 0.3;
  return { value: Math.round(value), text: parts.join(" "), fits: boostsMain && !hasSetup };
};
const movesOf = p => (p?.moveset ?? []).filter(Boolean).map(pm => { try { return pm.getMove(); } catch { return null; } }).filter(Boolean);

// ---- The moveset prior (05-randbats.js)
// Which moves show up on this species' competitive sets, and under which role name. It is a *nudge* on a score
// and a note on the card, never a veto: randbats is a different game — no passives, no boss bars, level 80-ish
// fully-evolved mons. A move nobody runs is still the right pick when the numbers say so.
const PRIOR_EXACT = { role: 1.2, any: 1.12 };
const PRIOR_EVO = { role: 1.12, any: 1.06 }; // the sets belong to what this mon grows into, not to this mon
const moveName = mv => String(mv?.name ?? "").replace(/ \(N\)$/, "");
const rbId = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Own properties only: a nickname like "constructor" must not reach up the prototype chain and hand back a function.
const rbAt = (table, id) => (table && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null);
const rbRoles = (id, double) => {
  const row = rbAt(double ? RANDBATS.d : RANDBATS.s, id) ?? rbAt(RANDBATS.s, id) ?? [];
  return row.map(r => [RANDBATS.r[r[0]], new Set(r.slice(1).map(i => RANDBATS.m[i]))]);
};
// The sets to judge this mon by: its own, its forms' (PokéRogue names only the base species), or — randbats
// lists no not-fully-evolved species — the ones it grows into, which count for less.
const priorSets = (pk, double) => {
  if (typeof RANDBATS === "undefined") return null;
  const id = rbId(pk?.species?.name ?? pk?.name);
  if (!id) return null;
  if (rbAt(RANDBATS.s, id) || rbAt(RANDBATS.d, id)) return { roles: rbRoles(id, double), exact: true };
  for (const [key, exact] of [["f", true], ["e", false]]) {
    const stand = rbAt(RANDBATS[key], id);
    if (stand) return { roles: stand.flatMap(x => rbRoles(x, double)), exact };
  }
  return null;
};
// The role this moveset already looks most like, then whether `mv` belongs to it. A move that completes the role
// the mon is already playing is worth more than one that merely turns up on some other set.
const priorOf = (pk, mv, ctx) => {
  const sets = ctx.prior ?? null;
  if (!sets?.roles?.length) return null;
  const own = ctx.ownMoves ?? [];
  let best = null, bestHits = -1;
  for (const role of sets.roles) {
    const hits = own.filter(n => role[1].has(n)).length;
    if (hits > bestHits) { bestHits = hits; best = role; }
  }
  const name = moveName(mv);
  const inBest = !!best && best[1].has(name);
  const any = inBest ? best : sets.roles.find(r => r[1].has(name));
  if (!any) return null;
  const scale = sets.exact ? PRIOR_EXACT : PRIOR_EVO;
  return { mult: inBest ? scale.role : scale.any, note: `set move (${any[0]}${sets.exact ? "" : ", evolved"})` };
};

// ---- Status moves, on the same scale as effective power
// Before this they were unscored, so the card could neither recommend one nor offer a dead one as the slot to
// forget (#70). The numbers are what a class of move is worth over a wave in PokéRogue's single-file fights, not
// mainline theory: recovery and sleep are worth a lot, a foe's −1 Atk very little.
const STATUS_VALUE = [0, 30, 45, 45, 70, 55, 45]; // StatusEffect NONE, POISON, TOXIC, PARALYSIS, SLEEP, FREEZE, BURN
const TAG_VALUE = {
  // Shuts a foe's plan down. Worth most against the bosses that heal or set up: the roster scales these.
  TAUNT: 30, ENCORE: 30, DISABLED: 25, HEAL_BLOCK: 25, TORMENT: 20, IMPRISON: 15,
  // Chip, drain or a clock.
  SEEDED: 35, SALT_CURED: 30, PERISH_SONG: 25, TRAPPED: 15, DROWSY: 45,
  // Buys the user something.
  SUBSTITUTE: 25, ALWAYS_CRIT: 25, CRIT_BOOST: 20, AQUA_RING: 20, INGRAIN: 20, MAGNET_RISEN: 10, HELPING_HAND: 25,
  CENTER_OF_ATTENTION: 10, MINIMIZED: 5,
};
// Status attributes worth a flat amount, as [value, what the card calls it]. Keyed by the concrete class, so a
// subclass (ProtectAttr, LeechSeedAttr) is valued here rather than through the base class's branch below.
const STATUS_ATTR = {
  ProtectAttr: [25, "protect"], ConfuseAttr: [25, "confuse"], LeechSeedAttr: [35, "leech seed"],
  PartyStatusCureAttr: [25, "cures the party"], HealStatusEffectAttr: [15, "cures status"],
  AddArenaTagAttr: [25, "screen"], AddArenaTrapTagAttr: [20, "hazard"],
  WeatherChangeAttr: [20, "weather"], TerrainChangeAttr: [20, "terrain"],
  CopyStatsAttr: [20, "copies boosts"], SwapStatStagesAttr: [20, "swaps boosts"], ResetStatsAttr: [20, "clears boosts"],
  ForceSwitchOutAttr: [12, "forces a switch"], SacrificialFullRestoreAttr: [30, "full restore, user faints"],
};
// Recovery. HealAttr carries its own ratio; the weather-gated ones (Synthesis, Moonlight) heal half that in the
// wrong weather, so they take a flat, discounted value instead.
const HEAL_FLAT = { WeatherHealAttr: 45, PlantHealAttr: 45, SandHealAttr: 45 };
const isRecovery = mv => ["HealAttr", "BoostHealAttr", ...Object.keys(HEAL_FLAT)].some(n => moveTraits(mv).attrNames.has(n));
const inflictsStatus = mv => moveTraits(mv).inflicts.some(x => x.cls === "StatusEffectAttr" && !(x.self || x.side));

const doublesNote = share => `${Math.round(share * 100)}% doubles ahead`;

// ---- The roster a status move will face (#122)
// A level-up prompt has no opponent, and a TM is kept for the run, so both cards hand in the same foes: the next
// big fight's, once 49-ahead reads it (`learnRoster`). Only two classes of status move depend on who is across, and
// only they are scaled: an inflicted status, which is dead into a foe immune to it, and disruption, which is worth a
// lot against a foe that heals or sets up and little against one that just attacks. With no roster both are left
// as they are, so the two cards can't disagree. Every rule below is `Pokemon.canSetStatus`, the ability attrs and
// the battler tags as the pinned source has them (references/game-code.md §16), decided from what the preview hands
// over: a foe's types, ability, passive and moveset. Leaf Guard (sun), Shields Down (form) and held items (Leftovers
// under Heal Block) are out of its reach.
const MOLD_BREAKERS = ["Mold Breaker", "Teravolt", "Turboblaze"];
const UNSUPPRESSABLE = new Set(["Comatose", "Shields Down"]);
const SIDE_TARGETS = new Set([MoveTarget.USER_SIDE, MoveTarget.ENEMY_SIDE, MoveTarget.BOTH_SIDES]);
// StatusEffectImmunityAbAttr / UserFieldStatusEffectImmunityAbAttr: the effects each ability blocks, [] for all.
// A foe's own side-wide veil covers the foe itself. Flower Veil only covers Grass types.
const POISONS = [StatusEffect.POISON, StatusEffect.TOXIC];
const STATUS_ABILITIES = {
  Limber: [StatusEffect.PARALYSIS], Insomnia: [StatusEffect.SLEEP], "Vital Spirit": [StatusEffect.SLEEP], "Sweet Veil": [StatusEffect.SLEEP],
  Immunity: POISONS, "Pastel Veil": POISONS, "Magma Armor": [StatusEffect.FREEZE],
  "Water Veil": [StatusEffect.BURN], "Water Bubble": [StatusEffect.BURN], "Thermal Exchange": [StatusEffect.BURN],
  "Purifying Salt": [], Comatose: [], "Flower Veil": [],
};
const STATUS_TYPES = { [StatusEffect.POISON]: ["Poison", "Steel"], [StatusEffect.TOXIC]: ["Poison", "Steel"],
  [StatusEffect.PARALYSIS]: ["Electric"], [StatusEffect.FREEZE]: ["Ice"], [StatusEffect.BURN]: ["Fire"] };
// BattlerTagImmunityAbAttr: Oblivious stops only Taunt; Aroma Veil (side-wide) every disrupting tag.
const TAG_ABILITIES = { Oblivious: ["TAUNT"], "Aroma Veil": ["TAUNT", "ENCORE", "HEAL_BLOCK", "DISABLED", "TORMENT"] };
// Disruption that needs something to take away: Taunt stops every status move, Encore is worth most locking a foe
// into one, Heal Block stops recovery and drain (the preview lists both as `healMoves`).
const DISRUPT_NEEDS = { TAUNT: "statusMoves", ENCORE: "statusMoves", HEAL_BLOCK: "healMoves" };
const DISRUPT_TAGS = new Set(["TAUNT", "ENCORE", "HEAL_BLOCK", "DISABLED", "TORMENT"]);
// First cuts. An inflicted status keeps STATUS_FLOOR of its value into a roster that can't take it at all (the
// move is still kept past that fight). Disruption with a target in the roster is worth DISRUPT_HIT plus
// DISRUPT_SPREAD × the share of the roster it bites on, and DISRUPT_NONE with none. A roster the preview isn't
// sure of (a generic trainer's replay) moves a score half as far.
const STATUS_FLOOR = 0.3, DISRUPT_HIT = 1.4, DISRUPT_SPREAD = 0.4, DISRUPT_NONE = 0.3, UNSURE = 0.5;
// Moves Heal Block stops, by attr: recovery (HealAttr and its kin, Rest, Wish, Swallow) and drain (HitHealAttr).
const HEAL_BLOCKED = ["HealAttr", "RestAttr", "WeatherHealAttr", "PlantHealAttr", "SandHealAttr", "BoostHealAttr",
  "HealOnAllyAttr", "SwallowHealAttr", "WishAttr", "HitHealAttr"];
export const blockedByHealBlock = mv => HEAL_BLOCKED.some(n => moveTraits(mv).attrNames.has(n));

// The foe's abilities that still apply: Mold Breaker and its kin ignore every one but the unsuppressable.
const foeAbilities = (pk, foe) => {
  const all = [foe.ability, foe.passive].filter(Boolean);
  return abilitiesOf(pk).some(a => MOLD_BREAKERS.includes(a)) ? all.filter(a => UNSUPPRESSABLE.has(a)) : all;
};
// What stops any status move from `pk` reaching `foe` before its effect is tried.
const statusMoveBlocked = (pk, mv, foe) => {
  const ab = foeAbilities(pk, foe);
  const types = foe.types ?? [];
  const type = TYPES[mv.type];
  if (ab.includes("Good as Gold") && !SIDE_TARGETS.has(mv.moveTarget)) return true;
  if (ab.includes("Magic Bounce") && moveHasFlag(mv, MoveFlags.REFLECTABLE)) return true;
  if (abilitiesOf(pk).includes("Prankster") && types.includes("Dark")) return true;
  // Absorbing abilities check no move category (Volt Absorb takes Thunder Wave); Levitate only stops attacks.
  if (ab.some(a => a !== "Levitate" && ABILITY_IMMUNE[a] === type)) return true;
  if (moveHasFlag(mv, MoveFlags.POWDER_MOVE) && (types.includes("Grass") || ab.includes("Overcoat"))) return true;
  // Thunder Wave alone carries RespectAttackTypeImmunityAttr: Ground takes nothing from it.
  if (moveTraits(mv).attrNames.has("RespectAttackTypeImmunityAttr") && types.some(d => vs(type, d) === 0)) return true;
  return false;
};
const statusLands = (pk, mv, effect, foe) => {
  if (statusMoveBlocked(pk, mv, foe)) return false;
  const types = foe.types ?? [];
  const corrosion = POISONS.includes(effect) && abilitiesOf(pk).includes("Corrosion");
  if (!corrosion && (STATUS_TYPES[effect] ?? []).some(t => types.includes(t))) return false;
  return !foeAbilities(pk, foe).some(a => {
    const blocks = STATUS_ABILITIES[a];
    if (!blocks || (a === "Flower Veil" && !types.includes("Grass"))) return false;
    return !blocks.length || blocks.includes(effect);
  });
};
const tagLands = (pk, mv, tag, foe) => !statusMoveBlocked(pk, mv, foe)
  && !foeAbilities(pk, foe).some(a => (TAG_ABILITIES[a] ?? []).includes(tag));

// A boss counts once per health bar: the foe the fight is decided by weighs the most.
const weightOf = foe => Math.max(1, foe.segments ?? 0);
const shareOf = (foes, ok) => foes.reduce((t, f) => t + (ok(f) ? weightOf(f) : 0), 0) / foes.reduce((t, f) => t + weightOf(f), 0);
const unsure = (roster, mult) => (roster.exact ? mult : 1 + (mult - 1) * UNSURE);
const landNote = (n, roster) => (n === roster.foes.length ? null : n ? `lands on ${n} of ${roster.foes.length} at W${roster.wave}` : `can't land at W${roster.wave}`);
// How far the roster moves an inflicted status (its StatusEffect) or a disrupting tag: a multiplier and a note.
const statusFit = (pk, mv, effect, roster) => {
  const lands = f => statusLands(pk, mv, effect, f);
  return { mult: unsure(roster, STATUS_FLOOR + (1 - STATUS_FLOOR) * shareOf(roster.foes, lands)), note: landNote(roster.foes.filter(lands).length, roster) };
};
const disruptFit = (pk, mv, tag, roster) => {
  const foes = roster.foes;
  const need = DISRUPT_NEEDS[tag];
  const lands = f => tagLands(pk, mv, tag, f);
  if (!need) return { mult: unsure(roster, STATUS_FLOOR + (1 - STATUS_FLOOR) * shareOf(foes, lands)), note: landNote(foes.filter(lands).length, roster) };
  const bites = f => lands(f) && (f[need] ?? []).length > 0;
  const share = shareOf(foes, bites);
  if (!share) return { mult: unsure(roster, DISRUPT_NONE), note: `nothing to stop at W${roster.wave}` };
  // Named by the foe it matters most against: the most health bars, then the first.
  const top = foes.filter(bites).sort((a, b) => weightOf(b) - weightOf(a))[0];
  return { mult: unsure(roster, DISRUPT_HIT + DISRUPT_SPREAD * share), note: `vs ${top.name}'s ${top[need][0]} at W${roster.wave}` };
};

// ---- A typing written onto the foe (#233)
// Soak and Magic Powder replace the target's types with one; Forest's Curse and Trick-or-Treat hang a third on top
// (07-move-traits' `typeChange`). The battle plan prices one **against the foe in front of us**, by writing the typing
// on and asking the game (30-planner). A learned move is kept for the run, so the learn card's question is the roster
// one (#122): what does turning the next big fight's foes pure Water — or giving them Grass — buy *this* party?
// It is its own class, not disruption: disruption is worth what it takes off a foe that has something to take
// (DISRUPT_NEEDS), while a rewrite is worth whatever the type chart then says, and it pays just as well against a foe
// with nothing to lose. Two parts, and they are not the same value:
//   - **it opens a weakness**: the party's best answer to the foe, before the rewrite and after. A `set` is measured
//     against the foe's whole typing, an `add` against the typing plus the new row.
//   - **it takes STAB away** (`set` only): a Steel foe turned pure Water loses the STAB on every Steel move it has.
//     An `add` takes nothing away — it can even hand the foe a resistance (Trick-or-Treat turns a Normal foe's
//     Fighting weakness off), which is why an `add` that leaves the party worse off is worth 0 here rather than a
//     negative: nobody has to use the move.
// What it does **not** count: the STAB a rewrite *hands* the foe. `Pokemon.getTypes` reads `summonData.addedType` too,
// so Trick-or-Treat gives a foe's Shadow Ball a STAB it didn't have, and a `set` does the same for a Water move. The
// defensive half of that is already in `open` (the foe's new typing is what the party is scored against); the
// offensive half is left standing, a first cut like the numbers below.
// Nothing here runs game code: the type chart, the roster the preview hands over and the party's own moves, as every
// other class on this card. Blind of a roster both keep their flat value, which is what the team audit's dead-slot
// check reads.
// The magnitudes sit against the flat table above: a rewrite is worth about a Leech Seed (35) — it decides a matchup
// rather than a turn, and unlike a status it can't be shrugged off by an immunity. An `add` is the lesser of the two
// at 30, because it only ever multiplies: it takes no STAB away, and it can hand the foe a resistance.
const TYPE_SET = 35, TYPE_ADD = 30;
// A rewrite that opens nothing for the roster keeps TYPE_FLOOR of that; one that opens every foe all the way is worth
// TYPE_FULL, straight-line in between. The share is weighted by health bars like every other roster read, so a
// rewrite that pays against the boss alone still counts for most of the fight.
const TYPE_FLOOR = 0.35, TYPE_FULL = 2;
// Two doublings of the party's best answer is as far as this counts, and a foe nothing touches is read as ×TYPE_MIN
// so an immunity doesn't make every rewrite look infinite. Taking a foe's whole STAB away is worth one of those
// doublings, half its STAB half of one.
const TYPE_STEPS = 2, TYPE_MIN = 0.25, TYPE_STAB = 0.5;
// Abilities that refuse a rewritten typing outright (`ChangeTypeAttr.getCondition`). Read by name off the preview's
// foe, the way every other ability rule on this card is; Mold Breaker doesn't get past them — the game asks the
// target's own ability here, not a suppressable one.
const TYPE_FIXED = ["Multitype", "RKS System"];
// The best the party's attacking types do against a defender, as a multiplier. Not an *answer* in the glossary's
// sense — that is a member that can deal with a foe, stat and all; this is the type chart alone.
const bestHit = (types, foe, ours) => {
  const def = { types, abilities: [foe.ability, foe.passive].filter(Boolean) };
  return Math.max(0, ...ours.map(t => effectiveness(t, def)));
};
// What a rewrite is worth against one foe, 0–1.
const typeGain = (pk, mv, change, name, foe, ours) => {
  if (!ours.length || statusMoveBlocked(pk, mv, foe)) return 0;
  const types = foe.types ?? [];
  const set = change.kind === "set";
  // The game's own conditions (references/game-code.md §"Typing"): neither move may hand a target a typing it already
  // has, and a `set` is refused by Multitype and RKS System — the same three the battle plan refuses, so the two cards
  // agree about which foes a rewrite is simply wasted on. Terastallization is the one condition left out: it is a live
  // read the preview doesn't carry, and a Tera'd foe in the roster is scored as if it weren't.
  if (set ? types.length === 1 && types[0] === name : types.includes(name)) return 0;
  if (set && [foe.ability, foe.passive].some(a => a && TYPE_FIXED.includes(a))) return 0;
  const before = Math.max(TYPE_MIN, bestHit(types, foe, ours));
  const after = bestHit(set ? [name] : [...types, name], foe, ours);
  const open = after > before ? Math.min(1, Math.log2(after / before) / TYPE_STEPS) : 0;
  if (!set) return open;
  // The STAB it loses, off the preview's `attackTypes` — one entry per damaging move, so three Steel moves beside one
  // Ground read as three quarters of its attacks losing STAB and not as half (#266). A foe with nothing there has no
  // damaging move to lose STAB on, so it loses none: `foeData` always fills the field in, and an empty one is an
  // answer rather than a silence. Nothing stands in for a missing field, so a preview that stopped filling it in
  // would fail the goldens rather than quietly halve every rewrite's STAB.
  const attacks = foe.attackTypes ?? [];
  const stab = attacks.length ? attacks.filter(t => types.includes(t) && t !== name).length / attacks.length : 0;
  return Math.min(1, open + TYPE_STAB * stab);
};
const typeFit = (pk, mv, change, name, roster, ours) => {
  const foes = roster.foes;
  const gains = foes.map(f => typeGain(pk, mv, change, name, f, ours));
  const share = foes.reduce((t, f, i) => t + gains[i] * weightOf(f), 0) / foes.reduce((t, f) => t + weightOf(f), 0);
  const mult = unsure(roster, TYPE_FLOOR + (TYPE_FULL - TYPE_FLOOR) * share);
  if (!share) return { mult, note: `no opening at W${roster.wave}` };
  // Named by the foe it pays most against: the biggest gain, health bars breaking a tie.
  let at = 0;
  gains.forEach((g, i) => { if (g > gains[at] || (g === gains[at] && weightOf(foes[i]) > weightOf(foes[at]))) at = i; });
  return { mult, note: `vs ${foes[at].name} at W${roster.wave}` };
};

// What a status move is worth, and why. null value when nothing here recognises it: the card says "your call"
// rather than inventing a number, and the slot stays off the forget list.
const statusScore = (pk, mv, others, double, ctx) => {
  const notes = [], why = [];
  let value = 0, known = false;
  const add = (n, text) => { value += n; why.push(text); known = true; };
  if (unimplemented(mv)) return { value: 0, notes: ["not implemented"], status: true, se: [], neutral: [], teamSe: [], drawbacks: [] };
  if (ALLY_TARGETS.has(mv.moveTarget) && !double) {
    return { value: 0, notes: ["ally only"], status: true, why: "nothing to target in a single battle", se: [], neutral: [], teamSe: [], drawbacks: [] };
  }
  // What the move does comes from its traits (07-move-traits); the values below are this card's. The flat table is
  // keyed by the *concrete* attribute class, so a LeechSeedAttr is valued there rather than as a bare battler tag.
  const tr = moveTraits(mv, pk, { party: ctx.party ?? [pk] });
  const aimedAtFoe = x => !(x.self || x.side);
  for (const [name, [n, text]] of Object.entries(STATUS_ATTR)) if (tr.attrNames.has(name)) add(n, text);
  for (const [name, n] of Object.entries(HEAL_FLAT)) if (tr.attrNames.has(name)) add(n, "heal (weather)");
  if (tr.heal && (tr.heal.cls === "HealAttr" || tr.heal.cls === "BoostHealAttr")) {
    add(Math.round(120 * tr.heal.ratio), `heal ${Math.round(tr.heal.ratio * 100)}%`);
  }
  // What the roster says about each part, applied once the value is known to be scorable.
  const roster = ctx.roster?.foes?.length ? ctx.roster : null;
  const fits = [];
  for (const x of tr.inflicts) {
    if (!aimedAtFoe(x)) continue;
    const n = STATUS_VALUE[x.effect] ?? 20;
    add(n, STATUS_FRAMES[x.effect] ?? "status");
    if (roster) fits.push([n, statusFit(pk, mv, x.effect, roster)]);
  }
  for (const x of tr.tags) {
    if (x.cls !== "AddBattlerTagAttr") continue; // a subclass is valued by STATUS_ATTR above
    const n = TAG_VALUE[x.tag];
    if (n == null) continue;
    add(n, String(x.tag).toLowerCase().replace(/_/g, " "));
    if (roster && DISRUPT_TAGS.has(x.tag) && aimedAtFoe(x)) fits.push([n, disruptFit(pk, mv, x.tag, roster)]);
  }
  // A typing written onto the foe. The wording is the ⚔ line's (`pure Water`, `+Grass`), so the two cards can't call
  // one rewrite two things. All four moves aim at the far side; a self-targeting one would be a different question.
  if (tr.typeChange && !SELF_TARGETS.has(mv.moveTarget)) {
    const name = TYPES[tr.typeChange.type];
    const set = tr.typeChange.kind === "set";
    if (name) {
      const n = set ? TYPE_SET : TYPE_ADD;
      add(n, set ? `pure ${name}` : `+${name}`);
      // The coverage that would face the rewritten foe: the rest of the party, plus the slots this move sits beside —
      // `others`, which is the three surviving slots when a slot is scored and the survivors of the forget when the
      // incoming move is. Taking the mon's whole current moveset here would sell a rewrite on the very move it
      // replaces: pure Water opens nothing for a Ludicolo that gave up Energy Ball for the Soak.
      // Read the way `seTypes` and 08-party's `damagingTypes` read a moveset — variable power counts, fixed damage
      // doesn't, since it ignores the type chart — so the party's coverage is one table however it is asked for:
      // 08-party's `FIXED_DAMAGE_ATTRS` is exactly the `STAND_INS` entries marked fixed here, and the two can't drift
      // without one of those lists changing. The move being scored adds nothing of its own: every move that writes a
      // typing is a status move.
      const ours = [...new Set([...(ctx.mateTypes ?? []),
        ...others.filter(o => isDamaging(o) && !isFixed(o)).map(o => TYPES[o.type]).filter(Boolean)])];
      if (roster) fits.push([n, typeFit(pk, mv, tr.typeChange, name, roster, ours)]);
    }
  }
  const setup = setupOf(pk, mv, others);
  if (setup) add(setup.value, setup.text);
  // A foe's stat drop is worth a fraction of the same boost on us: it lasts only while that foe is out, and the
  // wave replaces it. This is what makes Growl and Leer the slot to forget rather than an attacking move.
  for (const x of tr.stages) {
    if (!aimedAtFoe(x) || x.stages >= 0) continue;
    const drop = i => (i === Stat.ATK || i === Stat.SPATK || i === Stat.SPD ? 8 : i === Stat.ACC ? 6 : 4);
    add(x.stats.reduce((t, i) => t + drop(i) * -x.stages, 0), `foe ${x.stats.map(i => STAT_NAMES[i]).join("/")} −${-x.stages}`);
  }
  if (!known) return { value: null, notes: [], status: true, se: [], neutral: [], teamSe: [], drawbacks: [] };
  for (const [n, fit] of fits) {
    value += n * (fit.mult - 1);
    if (fit.note) notes.push(fit.note);
  }

  // The same trick twice is worth less the second time, and a moveset that is mostly status has no room left.
  if (isRecovery(mv) && others.some(isRecovery)) { value *= 0.5; notes.push("already has recovery"); }
  if (inflictsStatus(mv) && others.some(inflictsStatus)) { value *= 0.5; notes.push("already has a status move"); }
  // A moveset that is mostly status has no room left. This one is about the *moveset*, not the move, so it is named
  // here but applied last, and kept off `alone` below.
  const status = others.filter(o => o.category === MoveCategory.STATUS).length;
  const crowd = status >= 2 ? (status >= 3 ? 0.35 : 0.6) : 1;
  if (crowd < 1) notes.push(`${status + 1} status moves`);
  const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
  if (!SELF_TARGETS.has(mv.moveTarget) && acc < 1) { value *= acc; notes.push(`${Math.round(acc * 100)}% acc`); }
  // Over the battles ahead (a TM), an ally move is worth what it is in the doubles among them.
  if (ALLY_TARGETS.has(mv.moveTarget) && double < 1) { value *= double; notes.push(doublesNote(double)); }
  const prior = priorOf(pk, mv, ctx);
  if (prior) { value *= prior.mult; notes.push(prior.note); }
  // What the move is worth on its own merits: everything above is about this move, `crowd` alone is about the company
  // it keeps. The team audit's dead-slot check reads this rather than `value`, since "this moveset is mostly status"
  // is a finding it already makes once, and charging every slot for it again would name the good moves as the dead
  // ones — a Gourgeist's Trick-or-Treat beside Will-O-Wisp and Leech Seed is not the dead slot (#233).
  const alone = Math.round(value);
  return { value: Math.round(value * crowd), alone, notes: [...why, ...notes], status: true, why: why.join(" · "), se: [], neutral: [], teamSe: [], drawbacks: [] };
};

// ---- The type a move actually lands as
// An -ate ability rewrites a Normal move's type and adds 20% power, Liquid Voice turns sound-based moves into
// Water, and a handful of moves take their type from something the card can't see (the weather, a held item,
// the IVs). STAB and the whole coverage read hang on this, so a type the card can't pin down claims neither.
const ATE = { Refrigerate: "Ice", Pixilate: "Fairy", Aerilate: "Flying", Galvanize: "Electric", Dragonize: "Dragon" };
// Variable-type attributes. Tera Blast is absent on purpose: it is Normal until the mon terastallizes.
const VARIABLE_TYPE = ["FormChangeItemTypeAttr", "TechnoBlastTypeAttr", "AuraWheelTypeAttr", "RagingBullTypeAttr",
  "IvyCudgelTypeAttr", "WeatherBallTypeAttr", "TerrainPulseTypeAttr", "HiddenPowerTypeAttr", "TeraStarstormTypeAttr",
  "CombinedPledgeTypeAttr"];
const SUN_ABILITIES = new Set(["Drought", "Desolate Land", "Orichalcum Pulse"]);
const effectiveType = (pk, mv) => {
  const base = TYPES[mv.type];
  const ab = abilitiesOf(pk);
  // Revelation Dance takes the user's own first type, so it is knowable — and always STAB.
  if (attrsOf(mv, "MatchUserTypeAttr").length) return { type: typesOf(pk)[0] ?? base, note: "user's type" };
  if (VARIABLE_TYPE.some(n => attrsOf(mv, n).length)) return { type: base, variable: true, note: "type varies" };
  const ate = ab.find(a => ATE[a]);
  if (ate && base === "Normal") return { type: ATE[ate], boost: 1.2, note: ate };
  if (ab.includes("Normalize")) return { type: "Normal", boost: 1.2, note: "Normalize" };
  if (ab.includes("Liquid Voice") && moveHasFlag(mv, MoveFlags.SOUND_BASED)) return { type: "Water", note: "Liquid Voice" };
  return { type: base };
};

// Effective power of a move on this pokémon: power × expected hits × accuracy × STAB × how well its attack stat
// suits the category, then adjusted for what it costs or adds, each adjustment named in `notes` so the card can
// show why. `others`: this mon's other moves; `teamSe`: types the rest of the party already hits super-effectively.
// Status moves go through `statusScore`, which values them on the same scale.
const moveScore = (pk, mv, others, double, ctx = {}) => {
  const party = ctx.party ?? [pk];
  const teamSe = ctx.teamSe ?? null;
  if (!isDamaging(mv)) return statusScore(pk, mv, others, double, ctx);
  const notes = [];
  const et = effectiveType(pk, mv);
  const type = et.type;
  if (unimplemented(mv)) return { value: 0, notes: ["not implemented"], power: 0 };
  const ability = abilitiesOf(pk);
  const tr = moveTraits(mv, pk, { party });
  // A party that brings its own sun keeps Solar Beam's charge turn off the board most waves.
  const sun = party.some(p => { try { return p && abilitiesOf(p).some(a => SUN_ABILITIES.has(a)); } catch { return false; } });
  const atk = atkOf(pk), spa = spaOf(pk);
  // Hustle buys its 50% Atk with 20% accuracy on physical moves; the Atk is already in `atk`.
  let acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
  if (mv.category === MoveCategory.PHYSICAL && ability.includes("Hustle")) { acc *= 0.8; notes.push("Hustle"); }
  let power = mv.power;
  let fixed = false;
  if (!(power > 0)) {
    const s = standIn(pk, mv, party);
    power = s.power; fixed = s.fixed;
    notes.push(s.note);
  }
  if (et.note) notes.push(et.note);
  if (et.boost && !fixed) power *= et.boost;
  // Technician: ×1.5 on hits of base power ≤ 60 (after variable power).
  if (!fixed && ability.includes("Technician") && power * (tr.hits.grows ? 3 : 1) <= 60) { power *= 1.5; notes.push("Technician"); }
  const mh = multiHit(tr, acc);
  if (mh.hits > 1) notes.push(`${mh.hits} hits`);
  const fit = fixed ? 1 : (mv.category === MoveCategory.PHYSICAL ? atk : spa) / Math.max(atk, spa);
  // A type the card can't pin down claims no STAB and no coverage: a wrong claim reads worse than a missing one.
  const blind = fixed || !!et.variable;
  const stab = !blind && typesOf(pk).includes(type) ? (ability.includes("Adaptability") ? 2 : 1.5) : 1;
  let value = power * mh.factor * stab * fit;

  // Coverage, by the type chart: defending types this move newly hits super-effectively (more if nobody on the team
  // does), and types that resist every other move of ours but not this one. Not just "no other move of this type".
  const ownSe = seTypes(others);
  const se = blind ? [] : (CHART[type]?.[0] ?? []).filter(d => !ownSe.has(d));
  const teamOnly = teamSe ? se.filter(d => !teamSe.has(d)) : [];
  const otherTypes = [...new Set(others.filter(o => isDamaging(o) && !isFixed(o)).map(o => TYPES[o.type]))];
  const neutral = blind ? [] : TYPES.filter(d => !se.includes(d) && vs(type, d) >= 1 && Math.max(0, ...otherTypes.map(t => vs(t, d))) < 1);
  if (se.length || neutral.length) {
    value *= 1 + Math.min(0.3, (se.length ? 0.1 : 0) + 0.04 * se.length + 0.04 * teamOnly.length + 0.02 * neutral.length);
    const list = xs => `${xs.slice(0, 3).join("/")}${xs.length > 3 ? "…" : ""}`;
    if (se.length) notes.push(`SE on ${list(se)}`);
    else if (neutral.length && otherTypes.length) notes.push(`neutral on ${list(neutral)}`);
  }
  // Same-type redundancy: a second move of a type adds little beyond the stronger one, a third less still.
  // A move whose type varies is a duplicate of nothing, so it is exempt — fixed damage still counts, since two
  // Ghost moves are two Ghost moves however their damage is worked out.
  const sameType = et.variable ? 0 : others.filter(o => isDamaging(o) && TYPES[o.type] === type).length;
  if (sameType >= 1) { value *= sameType >= 2 ? 0.6 : 0.75; notes.push(`${sameType + 1}× ${type}`); }

  // The move's own costs: which ones it carries is the traits' (07-move-traits), what each is worth is this card's,
  // in the same units as effective power. The wording is `costNotes`, the same the ⚔ line shows, so the two cards
  // can't describe one cost two ways. Magic Guard and Rock Head are already off the traits that they block.
  let drag = 1;
  const times = m => { drag *= m; };
  if (tr.recoil && !tr.recoil.blocked) {
    // useHp: a share of max HP each use (Chloroblast); else a share of the damage dealt.
    times(tr.recoil.useHp ? Math.max(0.5, 1 - 0.9 * tr.recoil.ratio) : Math.min(0.8, Math.max(0.5, 1 - tr.recoil.ratio)));
  }
  if (tr.selfKo) times(0.3);
  else if (tr.halfSac) times(0.55);
  // Crash damage: High Jump Kick-style moves lose half max HP on a miss or into an immunity.
  if (tr.crash) times(Math.max(0.7, 0.95 - 0.6 * (1 - acc)));
  if (tr.lock) times(0.7);
  if (tr.noRepeat) times(0.7);
  if (tr.removesType) times(0.6);
  // Sucker Punch and Thunderclap do nothing unless the foe attacks that turn (first cut).
  if (tr.needsAttack) times(0.6);
  let movesLast = null;
  if (tr.interrupt) times(0.4);
  else if (tr.charge) {
    // Solar Beam skips its charge turn in sun. A party that brings its own sun has it up most waves; without a
    // setter the charge turn is real, and costs what any other two-turn move costs.
    times(tr.semiCharge ? 0.6 : !tr.charge.skip ? 0.5 : sun ? 0.85 : 0.5);
  } else if (tr.recharge) times(0.5);
  else if ((mv.priority ?? 0) < 0) { times(0.8); movesLast = "moves last"; }
  if (tr.once) times(0.4);
  // Priority picks off weakened foes and faster threats before they act — but only if the hit is big enough to
  // finish something. Going first with a 40-power Quick Attack rarely decides a wave; Extreme Speed does, and a
  // move that outspeeds the other priority moves (+2 and up) does a little more.
  else if ((mv.priority ?? 0) > 0) {
    const punch = Math.min(1, Math.max(0, (power * stab * fit - 30) / 90));
    value *= 1 + (0.15 + 0.2 * punch) * (mv.priority >= 2 ? 1.2 : 1);
    notes.push(`priority +${mv.priority}`);
  }
  // Guaranteed self stat changes: drops cost more on the stat the move attacks with (Overheat's SpA) than on
  // defences (Close Combat); boosts (Flame Charge) add.
  const attackStat = mv.category === MoveCategory.PHYSICAL ? Stat.ATK : Stat.SPATK;
  let loss = 0;
  for (const [st, stages] of Object.entries(tr.drops)) {
    const i = Number(st);
    if (stages < 0) loss += (i === attackStat ? 0.1 : 0.05) * -stages;
    else { value *= 1.1; notes.push(`+${stages} ${STAT_NAMES[i]}`); }
  }
  if (loss) times(Math.max(0.7, 1 - loss));
  value *= drag;
  const drawbacks = [...costNotes(tr, { sun, type }), ...(movesLast ? [movesLast] : [])];
  notes.push(...drawbacks);
  if (double && SPREAD_TARGETS.includes(mv.moveTarget)) {
    value *= 1 + 0.15 * double;
    notes.push(double < 1 ? `spread · ${doublesNote(double)}` : "spread");
  }
  if (fit < 0.9) notes.push(mv.category === MoveCategory.PHYSICAL ? "weak Atk" : "weak SpA");
  const prior = priorOf(pk, mv, ctx);
  if (prior) { value *= prior.mult; notes.push(prior.note); }
  return {
    value: Math.round(value), notes,
    power: Math.round(power), hits: mh.hits, acc: Math.round(acc * 100), stab: stab > 1, fixed,
    se, neutral, teamSe: teamOnly, drawbacks,
  };
};

// The whole learn decision for `pk` and move `mv`: each current slot against the new move, which to forget, and
// what the team gains or loses. Callers go through learnAdvice below.
// `double` is this battle's flag on the learn card. The rewards card's TM advice passes the share of double battles
// ahead instead (`doubleOdds`, 0–1), since a TM is kept for the run: it scales the spread bonus and an ally move's
// worth, and the moveset prior reads the doubles sets once most battles ahead are doubles.
// What the learn scorer needs about a mon and its team, worked out once per mon: its moves, the types its teammates
// already hit super-effectively and attack with, and the moveset prior's inputs — the species' competitive sets and
// what this mon already knows, which is how "the role it is already playing" is worked out.
const scoringContext = (pk, double, party, roster = null) => {
  const current = movesOf(pk);
  const mates = party.filter(p => p && p !== pk);
  // What the teammates already bring is the party profile's coverage table (`08-party.js`), so "only Fire move on
  // team" here and "nothing hits X" on the catch, biome and look-ahead cards are one reading of one moveset.
  const profile = partyProfile(mates);
  const teamTypes = new Set(profile.ourTypes);
  // `mateTypes`: what the rest of the party can hit for damage. This mon's own share of that is *not* fixed here,
  // because it depends on which slot the decision is about: a rewritten typing is judged against the coverage the
  // party would have with this move in a slot, which is `mateTypes` plus the moves the scorer is handed (#233).
  // `ownMoves` below stays per-mon on purpose, and the difference is the question each asks: the prior asks which role
  // this mon is already built as, which wants the build it has, not a projection of the one the decision would give it.
  const ctx = { party, teamSe: new Set(profile.ourTypes.flatMap(t => CHART[t]?.[0] ?? [])),
    mateTypes: profile.ourTypes,
    prior: priorSets(pk, double >= 0.5), ownMoves: current.map(moveName), roster };
  return { current, mates, teamTypes, ctx };
};
const info = (pk, x, score) => ({ name: x.name, type: effectiveType(pk, x).type ?? "Normal", cat: ["physical", "special", "status"][x.category], ...score });
// Each slot is judged against the other three, so coverage counts for both the old move and its replacement.
const scoreSlots = (pk, double, { current, mates, teamTypes, ctx }) => current.map((x, i) => {
  const rest = current.filter((_, j) => j !== i);
  const score = moveScore(pk, x, rest, double, ctx);
  const type = TYPES[x.type];
  const onlyOnTeam = mates.length > 0 && isDamaging(x) && !teamTypes.has(type) && !rest.some(o => isDamaging(o) && TYPES[o.type] === type);
  if (onlyOnTeam && score.value !== null) score.notes.push(`only ${type} move on team`);
  return { ...info(pk, x, score), onlyOnTeam, rest };
});
// Every slot of a mon's current moveset scored as the learn card scores it, for whoever audits a moveset with no
// new move on offer (50-audit). `double`: a battle flag or a share of doubles ahead, as for `learnPlan`.
export const slotScores = (pk, { double: flag = false, party = [pk] } = {}) => {
  const double = Math.min(1, Math.max(0, Number(flag) || 0));
  const sc = scoringContext(pk, double, party);
  return { moves: scoreSlots(pk, double, sc).map(({ rest, ...m }) => m), atk: Math.round(atkOf(pk)), spa: Math.round(spaOf(pk)) };
};
// `roster`: the foes the move will face (49-ahead's `learnRoster`), or null to judge it blind.
const learnPlan = (pk, mv, { double: flag = false, party = [pk], roster = null } = {}) => {
  const double = Math.min(1, Math.max(0, Number(flag) || 0));
  const sc = scoringContext(pk, double, party, roster);
  const { current, ctx } = sc;
  const moves = scoreSlots(pk, double, sc).map(({ rest, ...m }) => ({ ...m, replacement: moveScore(pk, mv, rest, double, ctx).value }));
  const gainOf = m => (m.replacement ?? 0) - m.value;
  let compare = -1;
  moves.forEach((m, i) => { if (m.value !== null && (compare < 0 || gainOf(m) > gainOf(moves[compare]))) compare = i; });
  const free = current.length < 4;
  // Scored against the slot it would take (the best one to drop even when skipping), or all four with a free slot.
  const against = free || compare < 0 ? current : current.filter((_, j) => j !== compare);
  const incoming = info(pk, mv, moveScore(pk, mv, against, double, ctx));
  // `statusScore` already names the boost in the notes; this is only what the verdict line says about it.
  const setup = setupOf(pk, mv, current);
  if (setup) { incoming.setup = setup; if (!setup.fits) incoming.notes.push("weak fit"); }
  let kind, forget = -1, gain = 0;
  if (free) { kind = "free"; gain = incoming.value ?? 0; }
  else if (incoming.value === null) kind = "status";
  else if (compare < 0) kind = "only-status";
  else if (moves[compare].replacement > moves[compare].value * 1.1) { kind = "learn"; forget = compare; gain = gainOf(moves[compare]); }
  else { kind = "skip"; gain = gainOf(moves[compare]); }
  const dropped = compare >= 0 && !free ? moves[compare] : null;
  const team = {
    gains: incoming.teamSe ?? [],
    loses: dropped ? dropped.teamSe ?? [] : [],
    // Losing the team's only move of a type, unless the new move is that type.
    // Normal hits nothing super-effectively: losing the last one is no coverage loss worth a warning.
    onlyType: dropped?.onlyOnTeam && dropped.type !== incoming.type && dropped.type !== "Normal" ? dropped.type : null,
  };
  return { moves, incoming, forget, compare: free ? -1 : compare, kind, gain, team, atk: Math.round(atkOf(pk)), spa: Math.round(spaOf(pk)) };
};
// The learn decision as a verdict a caller can act on, whatever offers the move (level-up, TM): `learn` true (learn
// it), false (skip) or null (your call); `slot` the move it replaces (-1: a free slot, or none), `forget` that
// move's name, `against` the slot it was weighed against (named on a skip too), `gain` the effective power it
// adds, and a short `reason`.
// Status moves are scored on the same scale as attacks, so they get a real verdict and can be the slot to forget.
// "Your call" is left for the ones nothing recognises: the move names the weakest slot without deciding.
// The learn card and the rewards card's TM advice both judge a move through this, so they can't disagree.
export const learnAdvice = (pk, mv, ctx = {}) => {
  const plan = learnPlan(pk, mv, ctx);
  const { kind, moves, incoming, compare } = plan;
  const setup = incoming.setup ?? null;
  const slot = plan.forget >= 0 ? plan.forget : kind === "status" ? compare : -1;
  const learn = kind === "learn" || (kind === "free" && incoming.value !== null) ? true : kind === "skip" ? false : null;
  const reason = {
    free: "free slot",
    learn: `over ${moves[plan.forget]?.name}`,
    skip: `not an upgrade over ${moves[compare]?.name}`,
    status: setup ? `setup ${setup.text}${setup.fits ? "" : " (weak fit)"}` : "can't score this status move",
    "only-status": "nothing scorable to drop",
  }[kind];
  return { learn, kind, slot, forget: slot >= 0 ? moves[slot].name : null, against: compare >= 0 ? moves[compare].name : null, gain: plan.gain, reason, setup, plan };
};

export const learnModel = ({ pk, mv, double, party, roster = null }) => {
  // A roster the run read could not build: the move is judged blind, and the card says so (`blind`) rather than
  // silently scoring as if no big fight were near.
  const blind = roster?.unavailable ?? null;
  const { plan } = learnAdvice(pk, mv, { double, party: party?.length ? party : [pk], roster: blind ? null : roster });
  const { moves, incoming, forget, compare, team } = plan;
  // The call alone. It used to travel with an ink, from before the colour law: **colour is the panel's and never
  // the model's** (#349 §8), and the one thing that ink said — is this good news — is the gutter's question now,
  // answered by the mark the row wears. Nothing ever read it.
  const verdict = {
    free: "Learns it — free slot",
    status: "Can't score this one — your call",
    "only-status": "Nothing scorable to drop — your call",
    learn: `Learn → forget ${moves[forget]?.name}`,
    skip: `Skip — not an upgrade${moves[compare] ? ` over ${moves[compare].name}` : ""}`,
  }[plan.kind];
  return {
    kind: "learn", icon: iconOf(pk), name: pk.name, move: incoming, moves, forget, compare, verdict,
    decision: plan.kind, gain: plan.gain, atk: plan.atk, spa: plan.spa, team, blind,
  };
};

// `Learn → forget Tackle · ⚠ loses only Dark move`, for the watcher and the battle read.
export const learnSummary = m => {
  const only = m.team?.onlyType && m.forget >= 0 ? ` · ⚠ loses only ${m.team.onlyType} move` : "";
  return `${m.verdict}${only}`;
};
