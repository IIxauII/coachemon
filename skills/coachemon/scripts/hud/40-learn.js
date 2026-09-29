// The learn decision, for the level-up prompt and a TM alike, judged without battle state.
import { ABILITY_IMMUNE, CHART, SPREAD_TARGETS, STATUS_FRAMES, TYPES, abilitiesOf, effectiveness, iconOf, moveHasFlag, typesOf, vs } from "./01-core.js";
import { RANDBATS } from "./05-randbats.js";
import { costNotes, moveTraits } from "./07-move-traits.js";
import { partyProfile } from "./08-party.js";

// `new PokemonMove(id).getMove()`, off any move the party holds (game-code.md §17).
export const learnMoveById = (party, id) => {
  const pm = party.flatMap(p => p?.moveset ?? []).find(Boolean);
  try { return pm ? new pm.constructor(id).getMove() : null; } catch { return null; }
};

const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe", "Acc", "Eva"];
const attrsOf = (mv, name) => (mv.attrs || []).filter(a => a.constructor?.name === name);
export const isDamaging = mv => !!mv && mv.category !== MoveCategory.STATUS && (mv.power > 0 || mv.power === -1);
const unimplemented = mv => / \(N\)$/.test(mv.name ?? "");

// `getBaseDamage` inverted, `(2L/5+2)·P·A/D/50+2` with even Atk and Def and no STAB (game-code.md §1).
const fixedPower = (dmg, level) => Math.round(Math.max(0, dmg) * 50 / (2 * (level || 50) / 5 + 2));
// `[attr, power(pk, mv, attr, party), note, fixed?]` for a power −1 move; `fixed` damage ignores STAB and the type
// chart. 08-party's `FIXED_DAMAGE_ATTRS` is the `fixed` rows: change both.
const STAND_INS = [
  ["LevelDamageAttr", pk => fixedPower(pk.level, pk.level), "damage = level", true],
  ["RandomLevelDamageAttr", pk => fixedPower(pk.level, pk.level), "damage ≈ level", true],
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

// Only the first hit can miss, unless the move checks every hit; Triple Axel and Triple Kick also grow each hit
// (game-code.md §2).
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

export const isFixed = mv => mv.power === -1 && STAND_INS.some(([name, , , fixed]) => fixed && attrsOf(mv, name).length);
const seTypes = moves => new Set(moves.filter(m => isDamaging(m) && !isFixed(m)).flatMap(m => CHART[TYPES[m.type]]?.[0] ?? []));
// Gorilla Tactics is left out on purpose: its Atk comes with a lock into one move (game-code.md §1), which a per-move
// score can't carry.
const ATK_MULT = { "Huge Power": 2, "Pure Power": 2, Hustle: 1.5 };
const atkOf = pk => abilitiesOf(pk).reduce((n, a) => n * (ATK_MULT[a] ?? 1), pk.getStat(Stat.ATK));
const spaOf = pk => pk.getStat(Stat.SPATK);
const mainStats = pk => {
  const atk = atkOf(pk), spa = spaOf(pk);
  return new Set([atk >= spa * 0.9 ? Stat.ATK : null, spa >= atk * 0.9 ? Stat.SPATK : null].filter(Boolean));
};

const SELF_TARGETS = new Set([MoveTarget.USER, MoveTarget.NEAR_ALLY, MoveTarget.ALLY, MoveTarget.USER_OR_NEAR_ALLY, MoveTarget.USER_AND_ALLIES, MoveTarget.USER_SIDE, MoveTarget.PARTY]);
const ALLY_TARGETS = new Set([MoveTarget.NEAR_ALLY, MoveTarget.ALLY]);

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

// The randbats sets are a nudge and a note, never a veto: randbats is a different game (05-randbats.js).
const PRIOR_EXACT = { role: 1.2, any: 1.12 };
const PRIOR_EVO = { role: 1.12, any: 1.06 };
const moveName = mv => String(mv?.name ?? "").replace(/ \(N\)$/, "");
const rbId = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Own properties only: a nickname like "constructor" must not reach up the prototype chain and hand back a function.
const rbAt = (table, id) => (table && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null);
const rbRoles = (id, double) => {
  const row = rbAt(double ? RANDBATS.d : RANDBATS.s, id) ?? rbAt(RANDBATS.s, id) ?? [];
  return row.map(r => [RANDBATS.r[r[0]], new Set(r.slice(1).map(i => RANDBATS.m[i]))]);
};
// Its own sets, else its forms' (`f`: PokéRogue names only the base species), else those of what it grows into (`e`:
// randbats lists no species that can still evolve).
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

// Status values are in effective-power units, so a status move competes with the attacks for a slot (#70).
const STATUS_VALUE = [0, 30, 45, 45, 70, 55, 45]; // StatusEffect NONE, POISON, TOXIC, PARALYSIS, SLEEP, FREEZE, BURN
const TAG_VALUE = {
  TAUNT: 30, ENCORE: 30, DISABLED: 25, HEAL_BLOCK: 25, TORMENT: 20, IMPRISON: 15,
  SEEDED: 35, SALT_CURED: 30, PERISH_SONG: 25, TRAPPED: 15, DROWSY: 45,
  SUBSTITUTE: 25, ALWAYS_CRIT: 25, CRIT_BOOST: 20, AQUA_RING: 20, INGRAIN: 20, MAGNET_RISEN: 10, HELPING_HAND: 25,
  CENTER_OF_ATTENTION: 10, MINIMIZED: 5,
};
// `[value, label]`, keyed by the concrete class.
const STATUS_ATTR = {
  ProtectAttr: [25, "protect"], ConfuseAttr: [25, "confuse"], LeechSeedAttr: [35, "leech seed"],
  PartyStatusCureAttr: [25, "cures the party"], HealStatusEffectAttr: [15, "cures status"],
  AddArenaTagAttr: [25, "screen"], AddArenaTrapTagAttr: [20, "hazard"],
  WeatherChangeAttr: [20, "weather"], TerrainChangeAttr: [20, "terrain"],
  CopyStatsAttr: [20, "copies boosts"], SwapStatStagesAttr: [20, "swaps boosts"], ResetStatsAttr: [20, "clears boosts"],
  ForceSwitchOutAttr: [12, "forces a switch"], SacrificialFullRestoreAttr: [30, "full restore, user faints"],
};
// A flat value: these heal by the weather (game-code.md §14).
const HEAL_FLAT = { WeatherHealAttr: 45, PlantHealAttr: 45, SandHealAttr: 45 };
const isRecovery = mv => ["HealAttr", "BoostHealAttr", ...Object.keys(HEAL_FLAT)].some(n => moveTraits(mv).attrNames.has(n));
const inflictsStatus = mv => moveTraits(mv).inflicts.some(x => x.cls === "StatusEffectAttr" && !(x.self || x.side));

const doublesNote = share => `${Math.round(share * 100)}% doubles ahead`;

// The roster a status move will face (#122), judged by the rules in game-code.md §16.
const MOLD_BREAKERS = ["Mold Breaker", "Teravolt", "Turboblaze"];
const UNSUPPRESSABLE = new Set(["Comatose", "Shields Down"]);
const SIDE_TARGETS = new Set([MoveTarget.USER_SIDE, MoveTarget.ENEMY_SIDE, MoveTarget.BOTH_SIDES]);
const POISONS = [StatusEffect.POISON, StatusEffect.TOXIC];
// `[]` blocks every status.
const STATUS_ABILITIES = {
  Limber: [StatusEffect.PARALYSIS], Insomnia: [StatusEffect.SLEEP], "Vital Spirit": [StatusEffect.SLEEP], "Sweet Veil": [StatusEffect.SLEEP],
  Immunity: POISONS, "Pastel Veil": POISONS, "Magma Armor": [StatusEffect.FREEZE],
  "Water Veil": [StatusEffect.BURN], "Water Bubble": [StatusEffect.BURN], "Thermal Exchange": [StatusEffect.BURN],
  "Purifying Salt": [], Comatose: [], "Flower Veil": [],
};
const STATUS_TYPES = { [StatusEffect.POISON]: ["Poison", "Steel"], [StatusEffect.TOXIC]: ["Poison", "Steel"],
  [StatusEffect.PARALYSIS]: ["Electric"], [StatusEffect.FREEZE]: ["Ice"], [StatusEffect.BURN]: ["Fire"] };
const TAG_ABILITIES = { Oblivious: ["TAUNT"], "Aroma Veil": ["TAUNT", "ENCORE", "HEAL_BLOCK", "DISABLED", "TORMENT"] };
const DISRUPT_NEEDS = { TAUNT: "statusMoves", ENCORE: "statusMoves", HEAL_BLOCK: "healMoves" };
const DISRUPT_TAGS = new Set(["TAUNT", "ENCORE", "HEAL_BLOCK", "DISABLED", "TORMENT"]);
const STATUS_FLOOR = 0.3, DISRUPT_HIT = 1.4, DISRUPT_SPREAD = 0.4, DISRUPT_NONE = 0.3, UNSURE = 0.5;
// `healBlockedMoves`, by attribute (game-code.md §16).
const HEAL_BLOCKED = ["HealAttr", "RestAttr", "WeatherHealAttr", "PlantHealAttr", "SandHealAttr", "BoostHealAttr",
  "HealOnAllyAttr", "SwallowHealAttr", "WishAttr", "HitHealAttr"];
export const blockedByHealBlock = mv => HEAL_BLOCKED.some(n => moveTraits(mv).attrNames.has(n));

const foeAbilities = (pk, foe) => {
  const all = [foe.ability, foe.passive].filter(Boolean);
  return abilitiesOf(pk).some(a => MOLD_BREAKERS.includes(a)) ? all.filter(a => UNSUPPRESSABLE.has(a)) : all;
};
const statusMoveBlocked = (pk, mv, foe) => {
  const ab = foeAbilities(pk, foe);
  const types = foe.types ?? [];
  const type = TYPES[mv.type];
  if (ab.includes("Good as Gold") && !SIDE_TARGETS.has(mv.moveTarget)) return true;
  if (ab.includes("Magic Bounce") && moveHasFlag(mv, MoveFlags.REFLECTABLE)) return true;
  if (abilitiesOf(pk).includes("Prankster") && types.includes("Dark")) return true;
  // Levitate alone stops only attacks: the absorbing abilities take status moves too (game-code.md §16).
  if (ab.some(a => a !== "Levitate" && ABILITY_IMMUNE[a] === type)) return true;
  if (moveHasFlag(mv, MoveFlags.POWDER_MOVE) && (types.includes("Grass") || ab.includes("Overcoat"))) return true;
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

const weightOf = foe => Math.max(1, foe.segments ?? 0);
const shareOf = (foes, ok) => foes.reduce((t, f) => t + (ok(f) ? weightOf(f) : 0), 0) / foes.reduce((t, f) => t + weightOf(f), 0);
const unsure = (roster, mult) => (roster.exact ? mult : 1 + (mult - 1) * UNSURE);
const landNote = (n, roster) => (n === roster.foes.length ? null : n ? `lands on ${n} of ${roster.foes.length} at W${roster.wave}` : `can't land at W${roster.wave}`);
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
  const top = foes.filter(bites).sort((a, b) => weightOf(b) - weightOf(a))[0];
  return { mult: unsure(roster, DISRUPT_HIT + DISRUPT_SPREAD * share), note: `vs ${top.name}'s ${top[need][0]} at W${roster.wave}` };
};

// A typing written onto the foe (#233), judged against the roster (#122). Not counted: the STAB the rewrite hands the
// foe (`getTypes` reads `addedType` too, game-code.md §14), so Trick-or-Treat's gift of STAB to a Shadow Ball goes
// unseen.
const TYPE_SET = 35, TYPE_ADD = 30;
const TYPE_FLOOR = 0.35, TYPE_FULL = 2;
// `TYPE_MIN` floors a foe nothing touches: at 0, a rewrite of any immune foe is worth infinitely much.
const TYPE_STEPS = 2, TYPE_MIN = 0.25, TYPE_STAB = 0.5;
// Never through `foeAbilities`: Mold Breaker doesn't get past these (game-code.md §14).
const TYPE_FIXED = ["Multitype", "RKS System"];
const bestHit = (types, foe, ours) => {
  const def = { types, abilities: [foe.ability, foe.passive].filter(Boolean) };
  return Math.max(0, ...ours.map(t => effectiveness(t, def)));
};
const typeGain = (pk, mv, change, name, foe, ours) => {
  if (!ours.length || statusMoveBlocked(pk, mv, foe)) return 0;
  const types = foe.types ?? [];
  const set = change.kind === "set";
  // The game's conditions (game-code.md §14) but Terastallization, which the preview doesn't carry: a Tera'd foe is
  // scored as if it weren't.
  if (set ? types.length === 1 && types[0] === name : types.includes(name)) return 0;
  if (set && [foe.ability, foe.passive].some(a => a && TYPE_FIXED.includes(a))) return 0;
  const before = Math.max(TYPE_MIN, bestHit(types, foe, ours));
  const after = bestHit(set ? [name] : [...types, name], foe, ours);
  const open = after > before ? Math.min(1, Math.log2(after / before) / TYPE_STEPS) : 0;
  if (!set) return open;
  // `attackTypes` holds one entry per damaging move, so three Steel moves beside one Ground lose three quarters of
  // their STAB, not half (#266). Nothing stands in for a missing field: a preview that stopped filling it in fails the
  // goldens rather than quietly zeroing every rewrite's STAB.
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
  let at = 0;
  gains.forEach((g, i) => { if (g > gains[at] || (g === gains[at] && weightOf(foes[i]) > weightOf(foes[at]))) at = i; });
  return { mult, note: `vs ${foes[at].name} at W${roster.wave}` };
};

// `value` null when nothing here recognises the move: the card says "your call", and the slot stays off the forget list.
const statusScore = (pk, mv, others, double, ctx) => {
  const notes = [], why = [];
  let value = 0, known = false;
  const add = (n, text) => { value += n; why.push(text); known = true; };
  if (unimplemented(mv)) return { value: 0, notes: ["not implemented"], status: true, se: [], neutral: [], teamSe: [], drawbacks: [] };
  if (ALLY_TARGETS.has(mv.moveTarget) && !double) {
    return { value: 0, notes: ["ally only"], status: true, why: "nothing to target in a single battle", se: [], neutral: [], teamSe: [], drawbacks: [] };
  }
  const tr = moveTraits(mv, pk, { party: ctx.party ?? [pk] });
  const aimedAtFoe = x => !(x.self || x.side);
  for (const [name, [n, text]] of Object.entries(STATUS_ATTR)) if (tr.attrNames.has(name)) add(n, text);
  for (const [name, n] of Object.entries(HEAL_FLAT)) if (tr.attrNames.has(name)) add(n, "heal (weather)");
  if (tr.heal && (tr.heal.cls === "HealAttr" || tr.heal.cls === "BoostHealAttr")) {
    add(Math.round(120 * tr.heal.ratio), `heal ${Math.round(tr.heal.ratio * 100)}%`);
  }
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
  // Worded as the ⚔ line words it (`pure Water`, `+Grass`): change both.
  if (tr.typeChange && !SELF_TARGETS.has(mv.moveTarget)) {
    const name = TYPES[tr.typeChange.type];
    const set = tr.typeChange.kind === "set";
    if (name) {
      const n = set ? TYPE_SET : TYPE_ADD;
      add(n, set ? `pure ${name}` : `+${name}`);
      // `others`, never the whole moveset: that would sell a rewrite on the very move it replaces, and pure Water opens
      // nothing for a Ludicolo that gave up Energy Ball for the Soak.
      const ours = [...new Set([...(ctx.mateTypes ?? []),
        ...others.filter(o => isDamaging(o) && !isFixed(o)).map(o => TYPES[o.type]).filter(Boolean)])];
      if (roster) fits.push([n, typeFit(pk, mv, tr.typeChange, name, roster, ours)]);
    }
  }
  const setup = setupOf(pk, mv, others);
  if (setup) add(setup.value, setup.text);
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

  if (isRecovery(mv) && others.some(isRecovery)) { value *= 0.5; notes.push("already has recovery"); }
  if (inflictsStatus(mv) && others.some(inflictsStatus)) { value *= 0.5; notes.push("already has a status move"); }
  const status = others.filter(o => o.category === MoveCategory.STATUS).length;
  const crowd = status >= 2 ? (status >= 3 ? 0.35 : 0.6) : 1;
  if (crowd < 1) notes.push(`${status + 1} status moves`);
  const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
  if (!SELF_TARGETS.has(mv.moveTarget) && acc < 1) { value *= acc; notes.push(`${Math.round(acc * 100)}% acc`); }
  if (ALLY_TARGETS.has(mv.moveTarget) && double < 1) { value *= double; notes.push(doublesNote(double)); }
  const prior = priorOf(pk, mv, ctx);
  if (prior) { value *= prior.mult; notes.push(prior.note); }
  // The team audit's dead-slot check reads `alone`, which `crowd` stays off: charging every slot for a mostly-status
  // moveset named the good moves as the dead ones — a Gourgeist's Trick-or-Treat beside Will-O-Wisp and Leech Seed
  // is not the dead slot (#233).
  const alone = Math.round(value);
  return { value: Math.round(value * crowd), alone, notes: [...why, ...notes], status: true, why: why.join(" · "), se: [], neutral: [], teamSe: [], drawbacks: [] };
};

// The type a move lands as (game-code.md §4).
const ATE = { Refrigerate: "Ice", Pixilate: "Fairy", Aerilate: "Flying", Galvanize: "Electric", Dragonize: "Dragon" };
// Tera Blast is absent on purpose: it is Normal until the mon terastallizes (game-code.md §4).
const VARIABLE_TYPE = ["FormChangeItemTypeAttr", "TechnoBlastTypeAttr", "AuraWheelTypeAttr", "RagingBullTypeAttr",
  "IvyCudgelTypeAttr", "WeatherBallTypeAttr", "TerrainPulseTypeAttr", "HiddenPowerTypeAttr", "TeraStarstormTypeAttr",
  "CombinedPledgeTypeAttr"];
const SUN_ABILITIES = new Set(["Drought", "Desolate Land", "Orichalcum Pulse"]);
const effectiveType = (pk, mv) => {
  const base = TYPES[mv.type];
  const ab = abilitiesOf(pk);
  if (attrsOf(mv, "MatchUserTypeAttr").length) return { type: typesOf(pk)[0] ?? base, note: "user's type" };
  if (VARIABLE_TYPE.some(n => attrsOf(mv, n).length)) return { type: base, variable: true, note: "type varies" };
  const ate = ab.find(a => ATE[a]);
  if (ate && base === "Normal") return { type: ATE[ate], boost: 1.2, note: ate };
  if (ab.includes("Normalize")) return { type: "Normal", boost: 1.2, note: "Normalize" };
  if (ab.includes("Liquid Voice") && moveHasFlag(mv, MoveFlags.SOUND_BASED)) return { type: "Water", note: "Liquid Voice" };
  return { type: base };
};

// Effective power, the unit every score on this card is in. `others`: this mon's other moves.
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
  const sun = party.some(p => { try { return p && abilitiesOf(p).some(a => SUN_ABILITIES.has(a)); } catch { return false; } });
  const atk = atkOf(pk), spa = spaOf(pk);
  // Hustle's Atk is already in `atk`; this is its accuracy cost (game-code.md §5).
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
  if (!fixed && ability.includes("Technician") && power * (tr.hits.grows ? 3 : 1) <= 60) { power *= 1.5; notes.push("Technician"); }
  const mh = multiHit(tr, acc);
  if (mh.hits > 1) notes.push(`${mh.hits} hits`);
  const fit = fixed ? 1 : (mv.category === MoveCategory.PHYSICAL ? atk : spa) / Math.max(atk, spa);
  // A type the card can't pin down claims no STAB and no coverage.
  const blind = fixed || !!et.variable;
  const stab = !blind && typesOf(pk).includes(type) ? (ability.includes("Adaptability") ? 2 : 1.5) : 1;
  let value = power * mh.factor * stab * fit;

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
  // Fixed damage counts here, unlike in coverage: two Ghost moves are two Ghost moves.
  const sameType = et.variable ? 0 : others.filter(o => isDamaging(o) && TYPES[o.type] === type).length;
  if (sameType >= 1) { value *= sameType >= 2 ? 0.6 : 0.75; notes.push(`${sameType + 1}× ${type}`); }

  // Magic Guard and Rock Head are already off the traits they block.
  let drag = 1;
  const times = m => { drag *= m; };
  if (tr.recoil && !tr.recoil.blocked) {
    // `useHp`: a share of max HP, not of the damage (game-code.md §5).
    times(tr.recoil.useHp ? Math.max(0.5, 1 - 0.9 * tr.recoil.ratio) : Math.min(0.8, Math.max(0.5, 1 - tr.recoil.ratio)));
  }
  if (tr.selfKo) times(0.3);
  else if (tr.halfSac) times(0.55);
  if (tr.crash) times(Math.max(0.7, 0.95 - 0.6 * (1 - acc)));
  if (tr.lock) times(0.7);
  if (tr.noRepeat) times(0.7);
  if (tr.removesType) times(0.6);
  if (tr.needsAttack) times(0.6);
  let movesLast = null;
  if (tr.interrupt) times(0.4);
  else if (tr.charge) {
    times(tr.semiCharge ? 0.6 : !tr.charge.skip ? 0.5 : sun ? 0.85 : 0.5);
  } else if (tr.recharge) times(0.5);
  else if ((mv.priority ?? 0) < 0) { times(0.8); movesLast = "moves last"; }
  if (tr.once) times(0.4);
  else if ((mv.priority ?? 0) > 0) {
    const punch = Math.min(1, Math.max(0, (power * stab * fit - 30) / 90));
    value *= 1 + (0.15 + 0.2 * punch) * (mv.priority >= 2 ? 1.2 : 1);
    notes.push(`priority +${mv.priority}`);
  }
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

const scoringContext = (pk, double, party, roster = null) => {
  const current = movesOf(pk);
  const mates = party.filter(p => p && p !== pk);
  const profile = partyProfile(mates);
  const teamTypes = new Set(profile.ourTypes);
  // `mateTypes` leaves this mon's own moves out: which of them count depends on the slot being decided (#233).
  const ctx = { party, teamSe: new Set(profile.ourTypes.flatMap(t => CHART[t]?.[0] ?? [])),
    mateTypes: profile.ourTypes,
    prior: priorSets(pk, double >= 0.5), ownMoves: current.map(moveName), roster };
  return { current, mates, teamTypes, ctx };
};
const info = (pk, x, score) => ({ name: x.name, type: effectiveType(pk, x).type ?? "Normal", cat: ["physical", "special", "status"][x.category], ...score });
const scoreSlots = (pk, double, { current, mates, teamTypes, ctx }) => current.map((x, i) => {
  const rest = current.filter((_, j) => j !== i);
  const score = moveScore(pk, x, rest, double, ctx);
  const type = TYPES[x.type];
  const onlyOnTeam = mates.length > 0 && isDamaging(x) && !teamTypes.has(type) && !rest.some(o => isDamaging(o) && TYPES[o.type] === type);
  if (onlyOnTeam && score.value !== null) score.notes.push(`only ${type} move on team`);
  return { ...info(pk, x, score), onlyOnTeam, rest };
});
// `double`: a battle flag or a share of doubles ahead, as for `learnPlan`.
export const slotScores = (pk, { double: flag = false, party = [pk] } = {}) => {
  const double = Math.min(1, Math.max(0, Number(flag) || 0));
  const sc = scoringContext(pk, double, party);
  return { moves: scoreSlots(pk, double, sc).map(({ rest, ...m }) => m), atk: Math.round(atkOf(pk)), spa: Math.round(spaOf(pk)) };
};
// `double`: this battle's flag, or for a TM the share of double battles ahead (`doubleOdds`, 0–1). `roster`: the foes
// the move will face (49-ahead's `learnRoster`), or null to judge it blind.
const learnPlan = (pk, mv, { double: flag = false, party = [pk], roster = null } = {}) => {
  const double = Math.min(1, Math.max(0, Number(flag) || 0));
  const sc = scoringContext(pk, double, party, roster);
  const { current, ctx } = sc;
  const moves = scoreSlots(pk, double, sc).map(({ rest, ...m }) => ({ ...m, replacement: moveScore(pk, mv, rest, double, ctx).value }));
  const gainOf = m => (m.replacement ?? 0) - m.value;
  let compare = -1;
  moves.forEach((m, i) => { if (m.value !== null && (compare < 0 || gainOf(m) > gainOf(moves[compare]))) compare = i; });
  const free = current.length < 4;
  const against = free || compare < 0 ? current : current.filter((_, j) => j !== compare);
  const incoming = info(pk, mv, moveScore(pk, mv, against, double, ctx));
  // `statusScore` has already noted the boost: this is only for the verdict line.
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
    // Normal hits nothing super-effectively, so losing the last one is no coverage loss.
    onlyType: dropped?.onlyOnTeam && dropped.type !== incoming.type && dropped.type !== "Normal" ? dropped.type : null,
  };
  return { moves, incoming, forget, compare: free ? -1 : compare, kind, gain, team, atk: Math.round(atkOf(pk)), spa: Math.round(spaOf(pk)) };
};
// `learn` true, false or null (your call); `slot` the move it replaces, −1 for a free slot or none; `against` the slot
// it was weighed against, named on a skip too. The learn card and the TM advice both judge through this, so they
// can't disagree.
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
  const blind = roster?.unavailable ?? null;
  const { plan } = learnAdvice(pk, mv, { double, party: party?.length ? party : [pk], roster: blind ? null : roster });
  const { moves, incoming, forget, compare, team } = plan;
  // No colour: colour is the panel's and never the model's (#349).
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

export const learnSummary = m => {
  const only = m.team?.onlyType && m.forget >= 0 ? ` · ⚠ loses only ${m.team.onlyType} move` : "";
  return `${m.verdict}${only}`;
};
