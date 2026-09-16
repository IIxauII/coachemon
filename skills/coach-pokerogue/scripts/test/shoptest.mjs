// Rewards card: buys for current needs, and the free reward judged by what it does for this party — permanent
// upgrades (Rare Candy, PP Up) over heals nobody needs, TMs scored with the learn scorer on members the game says can
// learn them, setup TMs for the member they suit, key/evolution items only when someone can use them, held items
// against their stack limit, and heals weighed up before a boss wave. Prints the rendered card (golden) and asserts
// the picks.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
class ModifierType {}
class PokemonModifierType extends ModifierType {}
class PokemonHpRestoreModifierType extends PokemonModifierType {}
class PokemonReviveModifierType extends PokemonHpRestoreModifierType {}
class PokemonStatusHealModifierType extends PokemonModifierType {}
class PokemonMoveModifierType extends PokemonModifierType {}
class PokemonPpRestoreModifierType extends PokemonMoveModifierType {}
class PokemonPpUpModifierType extends PokemonMoveModifierType {}
class PokemonAllMovePpRestoreModifierType extends PokemonModifierType {}
class PokemonLevelIncrementModifierType extends PokemonModifierType {}
class AddVoucherModifierType extends ModifierType {}
class AddPokeballModifierType extends ModifierType {}
class TempStatStageBoosterModifierType extends ModifierType {}
class PokemonHeldItemModifierType extends PokemonModifierType {}
class BerryModifierType extends PokemonHeldItemModifierType {}
class TmModifierType extends PokemonModifierType {}
class EvolutionItemModifierType extends PokemonModifierType {}
const mk = (C, f) => Object.assign(new C(), f);
const opt = (t, cost = 0) => ({ modifierTypeOption: { type: t, cost } });
const shopRows = [[
  opt(mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", restorePoints: 20, restorePercent: 10 }), 266),
  opt(mk(PokemonPpRestoreModifierType, { name: "Ether", iconImage: "ether", restorePoints: 10 }), 532),
  opt(mk(PokemonReviveModifierType, { name: "Revive", iconImage: "revive", restorePoints: 0, restorePercent: 50 }), 2660),
  opt(mk(PokemonHpRestoreModifierType, { name: "Super Potion", iconImage: "super_potion", restorePoints: 50, restorePercent: 25 }), 599),
], [
  opt(mk(PokemonStatusHealModifierType, { name: "Full Heal", iconImage: "full_heal" }), 1330),
  opt(mk(PokemonAllMovePpRestoreModifierType, { name: "Elixir", iconImage: "elixir", restorePoints: 10 }), 1330),
  opt(mk(PokemonPpRestoreModifierType, { name: "Max Ether", iconImage: "max_ether", restorePoints: -1 }), 1330),
  opt(mk(PokemonHpRestoreModifierType, { name: "Hyper Potion", iconImage: "hyper_potion", restorePoints: 200, restorePercent: 50 }), 1064),
]];

// Moves by id, for PokemonMove and TMs: [name, type, power, category, accuracy, attrs]
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const MOVES = {};
let nextId = 1;
const move = (name, type, power, category, accuracy = 100, attrs = []) => {
  const id = nextId++;
  MOVES[id] = { id, name, type: TY.indexOf(type), power, category, accuracy, moveTarget: 3, priority: 0, chance: -1, isChargingMove: () => false,
    attrs: attrs.map(([n, f]) => Object.assign({ constructor: { name: n } }, f)), chargeAttrs: [], restrictions: [], conditions: [], hasFlag: () => false };
  return id;
};
class PokemonMove {
  constructor(id, used = 0, maxPp = 15) { this.moveId = id; this.ppUsed = used; this.maxPp = maxPp; }
  getMove() { return MOVES[this.moveId]; }
  getName() { return MOVES[this.moveId].name; }
  getMovePp() { return this.maxPp; }
}
const M = {
  tackle: move("Tackle", "Normal", 40, 0), heatWave: move("Heat Wave", "Fire", 95, 1, 90), airSlash: move("Air Slash", "Flying", 75, 1, 95),
  aquaTail: move("Aqua Tail", "Water", 90, 0, 90), spark: move("Spark", "Electric", 65, 0), brickBreak: move("Brick Break", "Fighting", 75, 0),
  fireFang: move("Fire Fang", "Fire", 65, 0, 95), round: move("Round", "Normal", 60, 1),
  calmMind: move("Calm Mind", "Psychic", -1, 2, -1, [["StatStageChangeAttr", { stats: [3, 4], stages: 1, selfTarget: true }]]),
  drainingKiss: move("Draining Kiss", "Fairy", 50, 1), magicalLeaf: move("Magical Leaf", "Grass", 60, 1, -1),
  bite: move("Bite", "Dark", 60, 0), bodySlam: move("Body Slam", "Normal", 85, 0), crunch: move("Crunch", "Dark", 80, 0),
  confusion: move("Confusion", "Psychic", 50, 1), psybeam: move("Psybeam", "Psychic", 65, 1), thunderShock: move("Thunder Shock", "Electric", 40, 1),
  nuzzle: move("Nuzzle", "Electric", 20, 0), quickAttack: move("Quick Attack", "Normal", 40, 0),
};

// [id, ppUsed, maxPp]
const pk = (name, hp, max, status, moves, f = {}) => ({
  name, hp, level: f.level ?? 40, getMaxHp: () => max, status: status ? { effect: status } : null, getIconAtlasKey: () => "k", getIconId: () => 1,
  getTypes: () => (f.types ?? ["Normal"]).map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: f.atk ?? 100, 3: f.spa ?? 100 }[i] ?? 100),
  species: { forms: (f.forms ?? []).map(formKey => ({ formKey })) },
  moveset: moves.map(([id, used, maxPp]) => new PokemonMove(id, used, maxPp)),
});
// A TM the listed members can learn (the game's selectFilter: null = compatible and not known).
const tm = (id, learners, tier = 1) => mk(TmModifierType, { name: `TM ${MOVES[id].name}`, iconImage: "tm", tier, moveId: id,
  selectFilter: p => (learners.includes(p.name) && !p.moveset.some(m => m.moveId === id) ? null : "no effect") });

const charizard = () => pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10], [M.airSlash, 0, 15]], { types: ["Fire", "Flying"], atk: 110, spa: 150 });
const scenarios = {
  hurt: { money: 15256, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 9, 10], [M.airSlash, 0, 15]]), pk("Blastoise", 70, 187, 0, [[M.aquaTail, 0, 10]]), pk("Morpeko", 0, 157, 0, [[M.spark, 0, 20]]), pk("Scrafty", 150, 161, 6, [[M.brickBreak, 0, 15]])],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(BerryModifierType, { name: "Leppa Berry", iconImage: "leppa_berry", tier: 0 }), mk(TempStatStageBoosterModifierType, { name: "X Accuracy", iconImage: "x_accuracy", tier: 0 }), mk(AddVoucherModifierType, { name: "1× Egg Voucher", iconImage: "coupon", tier: 1 })] },
  healthy: { money: 15256, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10]])],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 }), mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 })] },
  // Live, wave 13: a fresh team, $1824. Rare Candy (Common) is a permanent level; Max Ether (Great) fixes nothing.
  "wave 13 rare candy": { wave: 13, money: 1824, balls: 12, party: [charizard(), pk("Morpeko", 120, 120, 0, [[M.spark, 0, 20], [M.bite, 0, 25]], { level: 14, types: ["Electric", "Dark"] })],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(PokemonLevelIncrementModifierType, { name: "Rare Candy", iconImage: "rare_candy", tier: 0, selectFilter: () => null }),
      mk(PokemonPpRestoreModifierType, { name: "Max Ether", iconImage: "max_ether", tier: 1, restorePoints: -1 })],
    expect: m => { assert.equal(m.free[m.pick].name, "Rare Candy"); assert.match(m.free[m.pick].why, /Morpeko Lv 14/); } },
  // Live, wave 14: TM Round, PP Up, Potion with a healthy party and strong moves: PP Up, and a reroll is worth a look.
  "wave 14 pp up": { wave: 14, money: 1824, reroll: 500, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.magicalLeaf, 0, 20], [M.calmMind, 0, 20], [M.bodySlam, 0, 15]], { types: ["Fairy"], atk: 50, spa: 90 }),
      pk("Snorlax", 200, 200, 0, [[M.bodySlam, 0, 15], [M.crunch, 0, 15], [M.brickBreak, 0, 15], [M.aquaTail, 0, 10]], { atk: 130, spa: 60 })],
    free: [tm(M.round, ["Comfey", "Snorlax"], 0), mk(PokemonPpUpModifierType, { name: "PP Up", iconImage: "pp_up", tier: 1, upPoints: 1, selectFilter: () => null }),
      mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 })],
    expect: m => { assert.equal(m.free[m.pick].name, "PP Up"); assert.ok(m.reroll, "weak options, money covers a reroll"); assert.equal(m.free[0].class, "TmModifierType"); assert.equal(m.free[0].moveId, M.round); } },
  // Live, wave 15: Calm Mind is a setup move Comfey (special attacker, no setup yet) can learn.
  "wave 15 calm mind": { wave: 15, money: 900, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.magicalLeaf, 0, 20], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90 }),
      pk("Morpeko", 120, 120, 0, [[M.spark, 0, 20], [M.bite, 0, 25]], { types: ["Electric", "Dark"], atk: 95, spa: 70 })],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), tm(M.calmMind, ["Comfey"], 1), mk(PokemonStatusHealModifierType, { name: "Full Heal", iconImage: "full_heal", tier: 1 })],
    expect: m => {
      const cm = m.free.find(f => f.moveId === M.calmMind);
      assert.equal(m.free[m.pick], cm, "Calm Mind beats Full Heal");
      assert.equal(cm.best.name, "Comfey");
      assert.ok(cm.v >= m.free.find(f => f.name === "Full Heal").v + 15, "far above");
    } },
  // TM Fire Fang: Morpeko can learn it and trades Tackle for it; Charizard can't. Unknown compatibility is said so.
  "tm recipient": { wave: 22, money: 400, party: [charizard(), pk("Morpeko", 120, 120, 0, [[M.spark, 0, 20], [M.bite, 0, 25], [M.tackle, 0, 35], [M.quickAttack, 0, 30]], { types: ["Electric", "Dark"], atk: 95, spa: 70 })],
    free: [tm(M.fireFang, ["Morpeko"], 1), mk(TmModifierType, { name: "TM Thunder Fang", iconImage: "tm", tier: 1, moveId: M.spark + 100 }), mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 })],
    expect: m => {
      const ff = m.free[0];
      assert.equal(m.pick, 0);
      assert.deepEqual(ff.users, ["Morpeko"]);
      assert.equal(ff.best.name, "Morpeko");
      assert.ok(["Tackle", "Quick Attack"].includes(ff.best.forget), ff.best.forget);
      assert.match(m.free[1].why, /can't check/);
      assert.equal(m.affordable, 1, "$400 buys one potion");
    } },
  // Live, wave 18, $1622: Ether, X Sp. Atk, Potion. Two members low on PP, one hurt: take the Ether free and buy one
  // Ether fewer. A status move run dry and a few PP spent aren't "low PP".
  "wave 18 free ether": { wave: 18, money: 1622, party: [
      pk("Comfey", 55, 110, 0, [[M.drainingKiss, 2, 10], [M.calmMind, 20, 20]], { types: ["Fairy"] }),
      pk("Morpeko", 120, 120, 0, [[M.spark, 17, 20], [M.bite, 0, 25]], { types: ["Electric", "Dark"] }),
      pk("Snorlax", 200, 200, 0, [[M.bodySlam, 14, 15], [M.crunch, 3, 15]])],
    free: [mk(PokemonPpRestoreModifierType, { name: "Ether", iconImage: "ether", tier: 0, restorePoints: 10 }), mk(TempStatStageBoosterModifierType, { name: "X Sp. Atk", iconImage: "x_sp_atk", tier: 0 }),
      mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 })],
    expect: m => {
      assert.equal(m.free[m.pick].name, "Ether");
      assert.equal(m.buys.filter(b => b.name === "Ether").length, 1, `one Ether bought: ${m.buys.map(b => b.name)}`);
      assert.ok(!m.buys.some(b => b.targetName === "Comfey" && !b.why.includes("HP")), "Calm Mind (status) and Draining Kiss 8/10 aren't low PP");
      assert.ok(m.buys.some(b => b.targetName === "Comfey" && b.why.includes("HP")), "Comfey's HP is still bought for");
    } },
  // Live, wave 23, $1474: Super Lure, 5× Poké Ball, Ether. A lure's tier mustn't outrank a free Ether the party needs.
  "wave 23 lure vs ether": { wave: 23, money: 1474, party: [
      pk("Morpeko", 120, 120, 0, [[M.spark, 17, 20], [M.bite, 0, 25]], { types: ["Electric", "Dark"] }),
      pk("Snorlax", 200, 200, 0, [[M.bodySlam, 14, 15], [M.crunch, 3, 15]])],
    free: [mk(ModifierType, { name: "Super Lure", iconImage: "super_lure", tier: 1, id: "SUPER_LURE" }),
      mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }),
      mk(PokemonPpRestoreModifierType, { name: "Ether", iconImage: "ether", tier: 0, restorePoints: 10 })],
    expect: m => {
      assert.equal(m.free[m.pick].name, "Ether");
      assert.ok(m.buys.filter(b => b.name === "Ether").length <= 1, `at most one Ether bought: ${m.buys.map(b => b.name)}`);
    } },
  // TM advice, take: two members can learn TM Crunch. Snorlax (physical, Tackle to spare) gains more than Comfey (weak
  // Atk), so it's the recipient — and the recipient and slot are exactly what the learn card would say for it.
  "tm best of two": { wave: 24, money: 200, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.magicalLeaf, 0, 20], [M.calmMind, 0, 20], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90 }),
      pk("Snorlax", 200, 200, 0, [[M.bodySlam, 0, 15], [M.brickBreak, 0, 15], [M.aquaTail, 0, 10], [M.tackle, 0, 35]], { atk: 130, spa: 60 })],
    free: [tm(M.crunch, ["Comfey", "Snorlax"], 1), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: (m, api, sc) => {
      const cr = m.free[0];
      assert.equal(m.pick, 0);
      assert.equal(cr.tm, "take");
      assert.equal(cr.best.name, "Snorlax");
      const a = api.learnAdvice(sc.party[1], MOVES[M.crunch], { double: false, party: sc.party });
      assert.equal(a.learn, true);
      assert.equal(cr.best.forget, a.forget, "same slot as the learn decision");
      assert.equal(cr.best.gain, a.gain, "same gain as the learn decision");
      assert.ok(api.learnAdvice(sc.party[0], MOVES[M.crunch], { double: false, party: sc.party }).gain < a.gain);
    } },
  // TM advice, skip: TM Tackle is no upgrade for anyone who can learn it, and a mon that already knows it is left out.
  // It's flagged skip and ranks below Poké Balls we're short of.
  "tm skip": { wave: 25, money: 200, balls: 3, party: [
      pk("Snorlax", 200, 200, 0, [[M.bodySlam, 0, 15], [M.crunch, 0, 15], [M.brickBreak, 0, 15], [M.aquaTail, 0, 10]], { atk: 130, spa: 60 }),
      pk("Comfey", 110, 110, 0, [[M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90 })],
    free: [tm(M.tackle, ["Snorlax", "Comfey"], 0), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: m => {
      const t = m.free[0];
      assert.equal(t.tm, "skip");
      assert.deepEqual(t.users, ["Snorlax"], "Comfey already knows Tackle");
      assert.ok(t.v < m.free[1].v, "a useless TM ranks below a Poké Ball");
      assert.match(t.why, /^skip · no upgrade for Snorlax · Snorlax keeps /);
      assert.equal(t.best, undefined);
    } },
  // No select filter on the type: compatibility comes from the member's own isTmCompatible. Nobody compatible: skip.
  "tm compatibility fallback": { wave: 26, money: 200, party: [
      Object.assign(pk("Morpeko", 120, 120, 0, [[M.spark, 0, 20], [M.bite, 0, 25], [M.tackle, 0, 35]], { types: ["Electric", "Dark"], atk: 95, spa: 70 }), { isTmCompatible: id => id === M.fireFang }),
      // Ignores excludeKnown: the coach still drops a member that already knows the move.
      Object.assign(pk("Arcanine", 150, 150, 0, [[M.fireFang, 0, 15]], { types: ["Fire"], atk: 110, spa: 100 }), { isTmCompatible: () => true })],
    free: [mk(TmModifierType, { name: "TM Fire Fang", iconImage: "tm", tier: 1, moveId: M.fireFang }),
      mk(TmModifierType, { name: "TM Psybeam", iconImage: "tm", tier: 1, moveId: M.psybeam })],
    expect: m => {
      assert.equal(m.free[0].tm, "take");
      assert.deepEqual(m.free[0].users, ["Morpeko"]);
      assert.equal(m.free[0].best.forget, null, "free slot");
      // Arcanine's mock says yes to everything: Psybeam goes to it (no Morpeko).
      assert.deepEqual(m.free[1].users, ["Arcanine"]);
    } },
  "tm nobody": { wave: 27, money: 200, party: [charizard()],
    free: [tm(M.nuzzle, [], 1), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: m => { assert.equal(m.free[0].tm, "skip"); assert.equal(m.pick, 1); assert.match(m.free[0].why, /nobody can learn it/); } },
  // A setup TM for a member with four moves: it names the weakest attack as the slot to give up.
  "tm setup full moveset": { wave: 28, money: 200, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.magicalLeaf, 0, 20], [M.tackle, 0, 35], [M.confusion, 0, 25]], { types: ["Fairy"], atk: 50, spa: 90 })],
    free: [tm(M.calmMind, ["Comfey"], 1), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: m => {
      const cm = m.free[0];
      assert.equal(m.pick, 0);
      assert.equal(cm.tm, "take");
      assert.equal(cm.best.setup, "+1 SpA/SpD");
      assert.equal(cm.best.forget, "Tackle", "weak-Atk Tackle is the attack to give up");
    } },
  // Mega Bracelet with no mega-capable mon, Egg Voucher, Master Ball.
  "key items": { wave: 31, money: 72, party: [charizard()],
    free: [mk(ModifierType, { name: "Mega Bracelet", iconImage: "mega_bracelet", tier: 3, id: "MEGA_BRACELET" }), mk(AddVoucherModifierType, { name: "Egg Voucher", iconImage: "coupon", tier: 1 }),
      mk(AddPokeballModifierType, { name: "Master Ball", iconImage: "mb", tier: 4, pokeballType: 4 })],
    expect: m => {
      assert.equal(m.free[m.pick].name, "Master Ball");
      assert.ok(m.free[0].v < 0, "no mega-capable mon: the bracelet is worth nothing");
      assert.equal(m.affordable, 0);
    } },
  "mega capable": { wave: 31, money: 72, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10]], { forms: ["", "mega-x", "mega-y"] })],
    free: [mk(ModifierType, { name: "Mega Bracelet", iconImage: "mega_bracelet", tier: 3, id: "MEGA_BRACELET" }), mk(EvolutionItemModifierType, { name: "Fire Stone", iconImage: "fire_stone", tier: 2, selectFilter: () => "no effect" }),
      mk(PokemonHeldItemModifierType, { name: "Leftovers", iconImage: "leftovers", tier: 2, selectFilter: () => "too many" })],
    expect: m => {
      assert.equal(m.free[m.pick].name, "Mega Bracelet");
      assert.match(m.free[1].why, /nobody can use it/);
      assert.match(m.free[2].why, /max stack/);
    } },
  // Wave 19: the boss is next. Blastoise at 75% gets the potion; a spare revive beats a voucher it otherwise loses to.
  "boss next": { wave: 19, money: 300, party: [charizard(), pk("Blastoise", 140, 187, 0, [[M.aquaTail, 0, 10]])],
    free: [mk(PokemonHpRestoreModifierType, { name: "Super Potion", iconImage: "super_potion", tier: 0, restorePoints: 50, restorePercent: 25 }), mk(PokemonReviveModifierType, { name: "Revive", iconImage: "revive", tier: 1, restorePoints: 0, restorePercent: 50 }),
      mk(TempStatStageBoosterModifierType, { name: "X Attack", iconImage: "x_attack", tier: 0 })],
    expect: m => { assert.ok(m.bossNext); assert.equal(m.free[m.pick].name, "Super Potion"); assert.match(m.free[1].why, /spare for the boss/); } },
  // Wave 181, with the game mode wired up: the Elite Four starts next wave and the run doesn't heal again until 191,
  // so the whole party has to last. A revive nobody needs yet is worth holding, and the hurt threshold rises.
  "elite four gauntlet": { wave: 181, money: 3000, mode: "classic", party: [charizard(), pk("Blastoise", 160, 187, 0, [[M.aquaTail, 0, 10]])],
    free: [mk(PokemonReviveModifierType, { name: "Max Revive", iconImage: "max_revive", tier: 2, restorePoints: 0, restorePercent: 100 }),
      mk(TempStatStageBoosterModifierType, { name: "X Attack", iconImage: "x_attack", tier: 0 }),
      mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 })],
    expect: m => {
      assert.ok(m.gauntlet, "five big fights before the next full heal");
      assert.equal(m.ahead.fightsBeforeHeal, 5);
      assert.equal(m.ahead.heal.wave, 191);
      assert.equal(m.free[m.pick].name, "Max Revive");
      assert.match(m.free[0].why, /spare for the gauntlet/);
      assert.ok(m.buys.some(b => b.targetName === "Blastoise"), "85% HP is worth topping up before the E4");
      assert.equal(m.luck.value, 0);
    } },
  // The control, with the same calendar: an ordinary boss run-up is one fight and then a full heal, so a spare
  // revive is back to being a spare and the same Great Ball wins.
  "ordinary boss run-up": { wave: 176, money: 3000, mode: "classic", party: [charizard(), pk("Blastoise", 160, 187, 0, [[M.aquaTail, 0, 10]])],
    free: [mk(PokemonReviveModifierType, { name: "Max Revive", iconImage: "max_revive", tier: 2, restorePoints: 0, restorePercent: 100 }),
      mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 })],
    expect: m => {
      assert.equal(m.gauntlet, false);
      assert.equal(m.ahead.next.wave, 180, "the boss wave");
      assert.equal(m.ahead.heal.wave, 181);
      assert.equal(m.ahead.fightsBeforeHeal, 1, "one fight, then the heal");
      assert.equal(m.free[m.pick].name, "5× Great Ball");
      assert.match(m.free[0].why, /^nobody fainted$/);
      assert.equal(m.ahead.eternatus, null, "24 waves out, the final boss is nobody's business yet");
    } },
  // Past the last heal: 195 and 200 with nothing in between, and no X1 left to restore anything.
  "no heal left": { wave: 192, money: 3000, mode: "classic", party: [charizard(), pk("Blastoise", 160, 187, 0, [[M.aquaTail, 0, 10]])],
    free: [mk(PokemonReviveModifierType, { name: "Max Revive", iconImage: "max_revive", tier: 2, restorePoints: 0, restorePercent: 100 }),
      mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 })],
    expect: m => {
      assert.equal(m.ahead.heal, null, "no X1 left before the final wave");
      assert.equal(m.ahead.fightsBeforeHeal, 2, "the rival at 195 and Eternatus at 200");
      assert.ok(m.gauntlet);
      assert.equal(m.free[m.pick].name, "Max Revive");
      assert.ok(m.ahead.eternatus, "the checklist is up with two shops left");
    } },
};
// The classic calendar, only as much of it as the rewards card reads. Waves 182–190 are the Elite Four and the
// champion; the run heals entering every X1.
const E4_WAVES = new Set([5, 8, 25, 35, 55, 62, 64, 66, 95, 112, 114, 115, 145, 164, 165, 182, 184, 186, 188, 190, 195]);
const classicMode = () => ({
  isWaveFinal: w => w === 200, isBoss: w => w % 10 === 0,
  isFixedBattle: w => E4_WAVES.has(w), getFixedBattle: () => ({}),
});
for (const [label, sc] of Object.entries(scenarios)) {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const handler = { options: sc.free.map(t => opt(t)), shopOptionsRows: shopRows, rerollCost: sc.reroll ?? 2250 };
  // Most scenarios leave `gameMode` off: the card has to fall back to the tenth-wave rule when the live build hides
  // it. The ones that set `mode` get the classic calendar, which is what the look-ahead reads.
  const scene = { money: sc.money, pokeballCounts: { 0: sc.balls ?? 34, 1: sc.balls ?? 34, 2: sc.balls ?? 34 }, modifiers: [], currentBattle: { waveIndex: sc.wave ?? 0 }, ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => sc.party, getEnemyParty: () => [], ...(sc.mode ? { gameMode: classicMode() } : {}) };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__sm = shopModel; globalThis.__api = { learnAdvice };\n})();\n"));
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  console.log(`== ${label}\n` + (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : ""));
  const m = globalThis.__sm(scene, handler);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m), `${label}: JSON-safe`);
  sc.expect?.(m, globalThis.__api, sc);
}
console.log("ok");
