// Rewards card: buys for current needs, and the free reward judged by what it does for this party — permanent
// upgrades (Rare Candy, PP Up) over heals nobody needs, TMs scored with the learn scorer on members the game says can
// learn them, setup TMs for the member they suit, key/evolution items only when someone can use them, held items
// against their stack limit, and heals weighed up before a boss wave. Held items, mints, vitamins, EXP items and candy
// go to the member they do the most for, against the level cap and the carry. Prints the rendered card (golden) and asserts
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
class AllPokemonLevelIncrementModifierType extends ModifierType {}
class PokemonNatureChangeModifierType extends PokemonModifierType {}
class BaseStatBoosterModifierType extends PokemonHeldItemModifierType {}
class SpeciesStatBoosterModifierType extends PokemonHeldItemModifierType {}
class ExpBoosterModifierType extends ModifierType {}
class DoubleBattleChanceBoosterModifier {}
class LockModifierTiersModifier {}
// The reward phase as the reroll preview reads it: its reroll count, the options on screen, its cost rule and count.
class SelectModifierPhase {
  constructor(rerollCount = 0, modifierTiers) { this.phaseName = "SelectModifierPhase"; this.rerollCount = rerollCount; this.modifierTiers = modifierTiers; }
  getRerollCost(lock) { return this.noReroll ? -1 : lock ? 700 : 250 * 2 ** this.rerollCount; }
  getModifierCount() { return 3; }
}
// The game's two reward functions, drawing from the mocked stream: `regenerate` draws once (a generator), each option
// draws once and takes the pool entry at draw + reroll count (+ 2 when tiers are locked). Every call is logged.
const draw = () => { const n = Number(Phaser.Math.RND._s.split(",")[1]); Phaser.Math.RND._s = `!rnd,${n + 1}`; return n; };
const mockRewardFns = (pool, log) => {
  let n = 0;
  return {
    regenerate: (party, poolType, rerollCount) => { log.push(["regenerate", poolType, rerollCount]); n = rerollCount; draw(); },
    options: (count, party, tiers) => {
      log.push(["options", count, tiers ?? null]);
      console.log("the game logs every item it draws");
      return Array.from({ length: count }, () => ({ type: pool[(draw() + n + (tiers ? 2 : 0)) % pool.length], upgradeCount: 0 }));
    },
  };
};
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
  nuzzle: move("Nuzzle", "Electric", 20, 0), quickAttack: move("Quick Attack", "Normal", 40, 0), hyperVoice: move("Hyper Voice", "Normal", 90, 1),
  // A status move with no attr the learn card recognises: its advice is `your call`, which is the one branch that
  // reaches the model's own relearn note rather than the recipient row's.
  screech: move("Screech", "Normal", -1, 2),
};
MOVES[M.hyperVoice].moveTarget = 6; // ALL_NEAR_ENEMIES: a spread move

// [id, ppUsed, maxPp]
let monId = 0;
const pk = (name, hp, max, status, moves, f = {}) => ({
  id: ++monId, name, hp, level: f.level ?? 40, getMaxHp: () => max, status: status ? { effect: status } : null, getIconAtlasKey: () => "k", getIconId: () => 1,
  getTypes: () => (f.types ?? ["Normal"]).map(t => TY.indexOf(t)), getAbility: () => ({ name: f.ability ?? "x" }),
  getStat: i => ({ 1: f.atk ?? 100, 2: f.def ?? 100, 3: f.spa ?? 100, 4: f.spd ?? 100, 5: f.spe ?? 100 }[i] ?? 100),
  getNature: () => f.nature ?? 0, getLuck: () => f.luck ?? 0,
  species: { speciesId: f.speciesId ?? 0, forms: (f.forms ?? []).map(formKey => ({ formKey })), getEvolutionLevels: () => f.evolutions ?? [] },
  moveset: moves.map(([id, used, maxPp]) => new PokemonMove(id, used, maxPp)),
  // `relearn`: what `getLearnableLevelMoves()` answers — `[level, MoveId, source]` per move a Memory Mushroom could
  // put back, `level` being 0 for an evolution move, the level it was learnable at for a relearner, and null for an
  // egg move or a used TM. Left off, the member doesn't expose the method.
  ...(f.relearn ? { getLearnableLevelMoves: () => f.relearn } : {}),
});
// A TM the listed members can learn (the game's selectFilter: null = compatible and not known).
const tm = (id, learners, tier = 1) => mk(TmModifierType, { name: `TM ${MOVES[id].name}`, iconImage: "tm", tier, moveId: id,
  selectFilter: p => (learners.includes(p.name) && !p.moveset.some(m => m.moveId === id) ? null : "no effect") });

const rareCandy = () => mk(PokemonLevelIncrementModifierType, { name: "Rare Candy", iconImage: "rare_candy", tier: 0, selectFilter: () => null });
const held = (id, name, tier) => mk(PokemonHeldItemModifierType, { name, iconImage: name.toLowerCase().replace(/\W+/g, "_"), tier, id, selectFilter: () => null });
const mint = (nature, stat) => mk(PokemonNatureChangeModifierType, { name: "Mint", iconImage: `mint_${stat}`, tier: 2, id: "MINT", nature, selectFilter: p => (p.getNature() === nature ? "no effect" : null) });
const snorlax = (f = {}) => pk("Snorlax", 250, 250, 0, [[M.bodySlam, 0, 15], [M.crunch, 0, 15]], { atk: 130, spa: 60, def: 110, spd: 110, spe: 30, level: 45, ...f });
const jolteon = (f = {}) => pk("Jolteon", 130, 130, 0, [[M.thunderShock, 0, 30], [M.psybeam, 0, 20]], { types: ["Electric"], atk: 65, spa: 110, def: 60, spd: 95, spe: 130, level: 42, nature: 10, ...f });
const charizard = () => pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10], [M.airSlash, 0, 15]], { types: ["Fire", "Flying"], atk: 110, spa: 150 });
const scenarios = {
  hurt: { money: 15256, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 9, 10], [M.airSlash, 0, 15]]), pk("Blastoise", 70, 187, 0, [[M.aquaTail, 0, 10]]), pk("Morpeko", 0, 157, 0, [[M.spark, 0, 20]]), pk("Scrafty", 150, 161, 6, [[M.brickBreak, 0, 15]])],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(BerryModifierType, { name: "Leppa Berry", iconImage: "leppa_berry", tier: 0, berryType: 10 }), mk(TempStatStageBoosterModifierType, { name: "X Accuracy", iconImage: "x_accuracy", tier: 0 }), mk(AddVoucherModifierType, { name: "1× Egg Voucher", iconImage: "coupon", tier: 1 })] },
  healthy: { money: 15256, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10]])],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 }), mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 })] },
  // Live, wave 13: a fresh team, $1824. Rare Candy (Common) is a permanent level; Max Ether (Great) fixes nothing.
  // The level cap at wave 13 is 16: Charizard, the carry, is at it and EXP can't level it, while Morpeko will get
  // there from battles anyway — so the candy (which ignores the cap) goes to Charizard.
  "wave 13 rare candy": { wave: 13, money: 1824, balls: 12, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10], [M.airSlash, 0, 15]], { level: 16, types: ["Fire", "Flying"], atk: 110, spa: 150 }),
      pk("Morpeko", 120, 120, 0, [[M.spark, 0, 20], [M.bite, 0, 25]], { level: 14, types: ["Electric", "Dark"] })],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), rareCandy(),
      mk(PokemonPpRestoreModifierType, { name: "Max Ether", iconImage: "max_ether", tier: 1, restorePoints: -1 })],
    expect: m => {
      const c = m.free[m.pick];
      assert.equal(c.name, "Rare Candy");
      assert.match(c.why, /^Charizard · Lv 16, at the Lv 16 cap/);
      assert.equal(c.holder.name, "Charizard");
    } },
  // Nobody at the cap yet: the candy is a catch-up level for whoever is furthest behind.
  "rare candy catch-up": { wave: 13, money: 100, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10]], { level: 15 }), pk("Morpeko", 120, 120, 0, [[M.spark, 0, 20]], { level: 11 })],
    free: [rareCandy()],
    expect: m => { assert.match(m.free[0].why, /^Morpeko · Lv 11/); assert.equal(m.free[0].holder.name, "Morpeko"); } },
  // One level short of evolving beats everything else: Charmander (Lv 15, evolves at 16) over the capped carry.
  "rare candy evolves": { wave: 13, money: 100, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10]], { level: 20 }),
      pk("Charmander", 60, 60, 0, [[M.fireFang, 0, 15]], { level: 15, speciesId: 4, evolutions: [[5, 16], [6, 36]] })],
    free: [rareCandy(), mk(AllPokemonLevelIncrementModifierType, { name: "Rarer Candy", iconImage: "rarer_candy", tier: 2 })],
    expect: m => {
      assert.match(m.free[0].why, /^Charmander · evolves at Lv 16/);
      assert.ok(m.free[0].v > 12, "an evolution is worth more than a plain level");
      assert.match(m.free[1].why, /1 at the Lv 16 cap/, "Charizard is past the cap");
    } },
  // Held items stop scoring the same: each goes to the member it does the most for. Leftovers to the bulky Snorlax
  // (which already holds one), Quick Claw to the slow one, King's Rock to the fast one.
  "held items by holder": { wave: 42, money: 100, party: [snorlax(), jolteon()],
    modifiers: [{ pokemonId: 0, type: { id: "LEFTOVERS" }, getStackCount: () => 1 }],
    free: [held("LEFTOVERS", "Leftovers", 3), held("QUICK_CLAW", "Quick Claw", 2), held("KINGS_ROCK", "King's Rock", 3)],
    setup: sc => { sc.modifiers[0].pokemonId = sc.party[0].id; },
    expect: m => {
      const [lo, qc, kr] = m.free;
      assert.equal(m.pick, 0);
      assert.equal(lo.holder.name, "Snorlax");
      assert.match(lo.why, /\(2\/4\)/, "stacks on the Leftovers it holds");
      assert.equal(qc.holder.name, "Snorlax");
      assert.equal(kr.holder.name, "Jolteon");
      assert.equal(new Set(m.free.map(f => f.v)).size, 3, `three different values: ${m.free.map(f => f.v)}`);
      assert.ok(lo.v < 30, "no longer the Rogue tier's 30 + 3");
    } },
  // A status orb is for a member that wants the status (the game's own pool rule): Guts Machamp takes the Flame Orb.
  // With nobody who can use it, it hurts whoever holds it.
  "status orb": { wave: 42, money: 100, party: [snorlax(), pk("Machamp", 180, 180, 0, [[M.brickBreak, 0, 15]], { types: ["Fighting"], ability: "Guts", atk: 140, spa: 60, level: 44 })],
    free: [held("FLAME_ORB", "Flame Orb", 2), held("TOXIC_ORB", "Toxic Orb", 2)],
    expect: m => { assert.equal(m.free[0].holder.name, "Machamp"); assert.match(m.free[0].why, /Guts/); assert.ok(m.free[0].v > 10); } },
  "status orb nobody": { wave: 42, money: 100, balls: 3, party: [pk("Charizard", 186, 186, 0, [[M.heatWave, 0, 10]], { types: ["Fire", "Flying"], ability: "Guts" })],
    free: [held("FLAME_ORB", "Flame Orb", 2), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: m => { assert.ok(m.free[0].v < 0, "Fire types can't be burned"); assert.equal(m.pick, 1); } },
  // Mints by nature fit: Adamant fixes a Modest physical Snorlax; Modest helps nobody on a physical team.
  "mints": { wave: 42, money: 100, party: [snorlax({ nature: 15 }), pk("Machamp", 180, 180, 0, [[M.brickBreak, 0, 15]], { types: ["Fighting"], atk: 140, spa: 60, level: 44, nature: 3 })],
    free: [mint(3, "atk"), mint(15, "spatk")],
    expect: m => {
      const [adamant, modest] = m.free;
      assert.equal(m.pick, 0);
      assert.equal(adamant.holder.name, "Snorlax");
      assert.match(adamant.why, /^Snorlax · Adamant \+Atk −SpA, was Modest$/);
      assert.ok(adamant.v >= 15);
      assert.ok(modest.v < 0, modest.why);
    } },
  // EXP items count the members still under the level cap (38 at wave 42): at the cap, EXP is lost.
  "exp at the cap": { wave: 42, money: 100, party: [snorlax(), jolteon()],
    free: [mk(ModifierType, { name: "EXP. All", iconImage: "exp_share", tier: 2, id: "EXP_SHARE" }), mk(ExpBoosterModifierType, { name: "EXP. Charm", iconImage: "exp_charm", tier: 2, id: "EXP_CHARM", boostPercent: 25 })],
    expect: m => {
      assert.match(m.free[0].why, /nobody on the bench under the Lv 38 cap/);
      assert.match(m.free[1].why, /whole party at the Lv 38 cap/);
      assert.ok(m.free.every(f => f.v <= 1));
    } },
  "exp for the bench": { wave: 42, money: 100, party: [snorlax(), jolteon(), pk("Pichu", 40, 40, 0, [[M.thunderShock, 0, 30]], { level: 20, types: ["Electric"] })],
    free: [mk(ModifierType, { name: "EXP. All", iconImage: "exp_share", tier: 2, id: "EXP_SHARE" })],
    expect: m => { assert.match(m.free[0].why, /1 under the Lv 38 cap/); assert.ok(m.free[0].v >= 9); } },
  // An evolution item on a member holding an Eviolite costs the boost: the other member evolves first.
  "evolution item and eviolite": { wave: 42, money: 100, party: [pk("Gloom", 120, 120, 0, [[M.magicalLeaf, 0, 20]], { level: 30 }), pk("Pikachu", 90, 90, 0, [[M.spark, 0, 20]], { level: 28, speciesId: 25 })],
    modifiers: [{ pokemonId: 0, type: { id: "EVIOLITE" }, getStackCount: () => 1 }],
    setup: sc => { sc.modifiers[0].pokemonId = sc.party[0].id; },
    free: [mk(EvolutionItemModifierType, { name: "Leaf Stone", iconImage: "leaf_stone", tier: 1, selectFilter: () => null })],
    expect: m => { assert.equal(m.free[0].holder.name, "Pikachu"); assert.match(m.free[0].why, /^Pikachu · evolves now$/); } },
  // Vitamins by the stat the member uses; species boosters only for their species.
  "vitamins and species boosters": { wave: 42, money: 100, party: [snorlax(), jolteon(), pk("Pikachu", 90, 90, 0, [[M.spark, 0, 20]], { level: 30, speciesId: 25, types: ["Electric"] })],
    free: [mk(BaseStatBoosterModifierType, { name: "Protein", iconImage: "protein", tier: 1, id: "BASE_STAT_BOOSTER", stat: 1, selectFilter: () => null }),
      mk(SpeciesStatBoosterModifierType, { name: "Light Ball", iconImage: "light_ball", tier: 2, id: "RARE_SPECIES_STAT_BOOSTER", key: "LIGHT_BALL", selectFilter: () => null }),
      mk(SpeciesStatBoosterModifierType, { name: "Thick Club", iconImage: "thick_club", tier: 2, id: "RARE_SPECIES_STAT_BOOSTER", key: "THICK_CLUB", selectFilter: () => null })],
    expect: m => {
      assert.equal(m.free[0].holder.name, "Snorlax", "Protein for the physical carry");
      assert.equal(m.free[1].holder.name, "Pikachu");
      assert.match(m.free[1].why, /×2 Atk\/SpA/);
      assert.ok(m.free[2].v < 0, "no Cubone line");
    } },
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
  // A fainted member can still be taught a TM (only Hardcore takes that away): Morpeko is down, and is the only one
  // who can learn Fire Fang.
  "tm fainted recipient": { wave: 22, money: 400, party: [charizard(), pk("Morpeko", 0, 120, 0, [[M.spark, 0, 20], [M.bite, 0, 25], [M.tackle, 0, 35], [M.quickAttack, 0, 30]], { types: ["Electric", "Dark"], atk: 95, spa: 70 })],
    free: [tm(M.fireFang, ["Morpeko"], 1), mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 })],
    expect: m => {
      const ff = m.free[0];
      assert.equal(ff.tm, "take");
      assert.equal(ff.best.name, "Morpeko");
      assert.equal(ff.best.fainted, true);
      assert.match(ff.why, /^TM for Morpeko \(fainted\) \(over Tackle\)/);
    } },
  "tm fainted hardcore": { wave: 22, money: 400, challenges: [{ id: 9, value: 1 }], party: [charizard(), pk("Morpeko", 0, 120, 0, [[M.spark, 0, 20], [M.tackle, 0, 35]], { types: ["Electric", "Dark"], atk: 95, spa: 70 })],
    free: [tm(M.fireFang, ["Morpeko"], 1)],
    expect: m => { assert.equal(m.free[0].tm, "skip"); assert.match(m.free[0].why, /nobody can learn it/); } },
  // A challenge is on when its value is anything but 0, which is `GameMode.hasChallenge`'s own test: a negative
  // value is still Hardcore, and the fainted member is still offered nothing.
  "tm fainted hardcore negative value": { wave: 22, money: 400, challenges: [{ id: 9, value: -1 }], party: [charizard(), pk("Morpeko", 0, 120, 0, [[M.spark, 0, 20], [M.tackle, 0, 35]], { types: ["Electric", "Dark"], atk: 95, spa: 70 })],
    free: [tm(M.fireFang, ["Morpeko"], 1)],
    expect: m => { assert.equal(m.free[0].tm, "skip"); assert.match(m.free[0].why, /nobody can learn it/); } },
  // A spread TM is kept for the run, so its bonus follows the game's double-battle odds over the next ten waves, not
  // the wave just won: 1/8 a wave (1/32 on wave 30) with no lure, 1/2 (1/8) while a Lure's ten battles last.
  "tm spread by doubles ahead": { wave: 22, money: 400, double: true, party: [pk("Charizard", 186, 186, 0, [[M.airSlash, 0, 15], [M.tackle, 0, 35]], { types: ["Fire", "Flying"], atk: 110, spa: 150 })],
    free: [tm(M.hyperVoice, ["Charizard"], 1)],
    expect: (m, api, sc, scene) => {
      assert.equal(api.doubleOdds(scene, 23), (9 / 8 + 1 / 32) / 10);
      const lured = { ...scene, modifiers: [Object.assign(new DoubleBattleChanceBoosterModifier(), { getBattleCount: () => 10 })] };
      assert.equal(api.doubleOdds(lured, 23), (9 / 2 + 1 / 8) / 10);
      assert.equal(api.doubleOdds({ ...lured, modifiers: [Object.assign(new DoubleBattleChanceBoosterModifier(), { battleCount: 3 })] }, 23), (3 / 2 + 6 / 8 + 1 / 32) / 10, "a lure covers only the battles it has left");
      const mv = MOVES[M.hyperVoice];
      const gain = double => api.learnAdvice(sc.party[0], mv, { double, party: sc.party }).gain;
      assert.ok(gain(0) < gain(api.doubleOdds(scene, 23)) && gain(api.doubleOdds(lured, 23)) < gain(1), `${gain(0)} ${gain(0.12)} ${gain(0.46)} ${gain(1)}`);
      assert.equal(m.free[0].best.gain, gain(api.doubleOdds(scene, 23)), "the finished wave's double flag is not what counts");
    } },
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
  // Reroll preview: a weak screen (Poké Balls we have plenty of, an X item, a Potion nobody needs). The next reroll,
  // read off the stream, is worth its $250. With a Lock Capsule the locked roll is read too, from the same stream
  // position. The stream, the threshold tables and the console are left as they were.
  "reroll preview": { wave: 14, money: 3000, party: [snorlax(), jolteon()], modifiers: [new LockModifierTiersModifier()],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 }),
      mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 })],
    rewardPool: () => [held("LEFTOVERS", "Leftovers", 3), mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 }),
      mk(TempStatStageBoosterModifierType, { name: "X Attack", iconImage: "x_attack", tier: 0 }), rareCandy(),
      mk(AddVoucherModifierType, { name: "1× Egg Voucher", iconImage: "coupon", tier: 1 })],
    expect: (m, api, sc, scene) => {
      const r = m.rerollAhead;
      assert.ok(r, "the preview is read");
      assert.equal(m.reroll, null, "no hint when the preview answers");
      assert.equal(r.rolls.length, 2, "the lock as it stands, then toggled");
      const [plain, locked] = r.rolls;
      assert.deepEqual([plain.lock, plain.cost, locked.lock, locked.cost], [false, 250, true, 700]);
      assert.equal(plain.verdict, "reroll");
      assert.equal(Phaser.Math.RND.state(), "!rnd,0", "the live stream is untouched");
      const log = sc.rewardLog;
      assert.deepEqual(log.at(-1), ["regenerate", 0, 0], "the tables are put back for the live reroll count");
      assert.deepEqual(log.filter(x => x[0] === "options").map(x => x[2]), [null, [0, 0, 0]], "the locked roll passes the tiers on screen");
      assert.equal(log.filter(x => x[0] === "regenerate" && x[2] === 1).length, 2, "each roll regenerates for reroll 1");
      assert.equal(console.log, sc.consoleLog, "console restored");
      const before = log.length;
      api.rewardsModel(scene, scene.ui.getHandler());
      assert.equal(log.length, before, "an unchanged screen is served from the cache");
      assert.match(api.cardSummary(m).rewards, /reroll \$250 → .* \(reroll\) \[~\]/);

      // The player rerolls: the new phase shows exactly the previewed offers — a hit.
      const rolled = sc.pool.filter(t => plain.offers.some(f => f.name === t.name));
      const next = new SelectModifierPhase(1, [0, 0, 0]);
      next.typeOptions = plain.offers.map(f => ({ type: rolled.find(t => t.name === f.name) }));
      scene.phase = next;
      api.rerollCheck(scene);
      assert.deepEqual([api.rerollStats().hit, api.rerollStats().miss], [1, 0]);
      // Read again on the new screen and arm it, as the tick does; then a reroll that comes out different — a miss,
      // marked `!` from then on.
      Phaser.Math.RND._s = "!rnd,7";
      const m2 = api.rewardsModel(scene, scene.ui.getHandler());
      assert.equal(m2.rerollAhead.missed, false);
      api.rerollArm(scene, m2.rerollAhead);
      const third = new SelectModifierPhase(2, [0, 0, 0]);
      third.typeOptions = [0, 1, 2].map(() => ({ type: { name: "Nope", tier: 0 } }));
      scene.phase = third;
      api.rerollCheck(scene);
      assert.deepEqual([api.rerollStats().hit, api.rerollStats().miss], [1, 1]);
      const m3 = api.rewardsModel(scene, scene.ui.getHandler());
      assert.equal(m3.rerollAhead.missed, true);
      assert.match(api.cardSummary(m3).rewards, /\[!\]/);
    } },
  // A good screen and little money: the reroll is read, but keeping the screen wins, and the locked roll can't be paid.
  "reroll keep": { wave: 14, money: 400, party: [snorlax(), jolteon()], modifiers: [new LockModifierTiersModifier()],
    free: [held("LEFTOVERS", "Leftovers", 3), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    rewardPool: () => [mk(TempStatStageBoosterModifierType, { name: "X Attack", iconImage: "x_attack", tier: 0 }), mk(AddPokeballModifierType, { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 })],
    expect: m => {
      const [plain, locked] = m.rerollAhead.rolls;
      assert.equal(plain.verdict, "keep");
      assert.ok(plain.gain < 0);
      assert.equal(locked.verdict, "short");
    } },
  // No Lock Capsule: one roll. The reroll only fits by skipping the heal the hurt Blastoise needs.
  "reroll over the buys": { wave: 14, money: 1300, party: [charizard(), pk("Blastoise", 60, 187, 0, [[M.aquaTail, 0, 10]])],
    free: [mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 })],
    rewardPool: () => [mk(AddPokeballModifierType, { name: "Master Ball", iconImage: "mb", tier: 4, pokeballType: 4 })],
    expect: m => {
      const roll = m.rerollAhead.rolls[0];
      assert.equal(m.rerollAhead.rolls.length, 1);
      assert.ok(m.buys.length && m.left < 250, `a heal is planned: ${m.buys.map(b => b.name)} → $${m.left}`);
      assert.equal(roll.verdict, "instead of buys");
      assert.equal(roll.offers[roll.best].name, "Master Ball");
    } },
  // Grip Claw rolls after any attacking move, contact or not (`MoveEffectPhase.applyOnTargetEffects` asks only
  // `move.is("AttackMove")`): a special attacker earns it as much as a physical one, and only a mon with no attack
  // at all is left out.
  "grip claw off contact": { wave: 42, money: 100, party: [jolteon(), pk("Wobbuffet", 190, 190, 0, [[M.calmMind, 0, 20]], { level: 40 })],
    free: [held("GRIP_CLAW", "Grip Claw", 2)],
    expect: (m, api, sc, scene) => {
      const gc = m.free[0];
      assert.equal(gc.holder.name, "Jolteon", "its special attacks roll it all the same");
      assert.match(gc.why, /^Jolteon · 10% to steal an item when it attacks$/);
      assert.deepEqual(gc.users, ["Jolteon", "Wobbuffet"]);
      assert.ok(gc.v >= 9, `worth a full roll, not a contact share: ${gc.v}`);
      // Every entry in the table answers with a `[value, reason]` tuple or a plain falsy value — never with whatever
      // its own guard returned. Wobbuffet has no attacking move, which is the guard the seven `attacks(p).length`
      // entries share, and `length` is a number: 0 read like a value where none was meant.
      const ctx = api.rewardContext(scene, sc.party);
      const wobbuffet = sc.party[1];
      for (const [id, fn] of Object.entries(api.HELD)) {
        const r = fn(wobbuffet, ctx, null);
        assert.ok(r === false || r == null || Array.isArray(r), `${id} answered ${JSON.stringify(r)} (${typeof r})`);
      }
    } },
  // The level cap runs the rounded wave through `getWaveForDifficulty` first, which a Daily run pushes 30 waves and a
  // fifth of itself ahead: wave 30 caps at Lv 52 there, at Lv 24 in a classic run. Only the fallback is exercised
  // here — the mocked scene has no `getMaxExpLevel`.
  "daily level cap": { wave: 30, money: 100, daily: true, party: [snorlax({ level: 40 }), jolteon({ level: 38 })],
    free: [mk(ExpBoosterModifierType, { name: "EXP. Charm", iconImage: "exp_charm", tier: 2, id: "EXP_CHARM", boostPercent: 25 })],
    expect: m => { assert.match(m.free[0].why, /^more EXP · 2 under the Lv 52 cap$/); assert.ok(m.free[0].v > 1); } },
  "classic level cap": { wave: 30, money: 100, party: [snorlax({ level: 40 }), jolteon({ level: 38 })],
    free: [mk(ExpBoosterModifierType, { name: "EXP. Charm", iconImage: "exp_charm", tier: 2, id: "EXP_CHARM", boostPercent: 25 })],
    expect: m => { assert.equal(m.free[0].why, "whole party at the Lv 24 cap"); } },
  // The offer is drawn from `getCompatibleTms(true, true, true)`, which drops each member's known moves, its level-up
  // and relearn moves *at or below its current level*, and the TMs it has already used (#249). A member the TM could
  // not have been drawn for gets the move for free from none of those: all three cases leave it reachable only
  // through the move relearner, behind a Memory Mushroom. So the member stays in the scoring, and the card names the
  // Mushroom as the other route instead of calling the reward free.
  // Case 1: a level-0 evolution move of the species Comfey already is — learned when it evolved, never again.
  "tm the evolution move already passed": { wave: 27, money: 200, party: [pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90, relearn: [[0, M.magicalLeaf, 2]] })],
    free: [tm(M.magicalLeaf, ["Comfey"], 1), mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: m => {
      const f = m.free[0];
      assert.deepEqual(f.users, ["Comfey"], "still a payer: nothing hands it the move");
      assert.deepEqual(f.relearn, ["Comfey"], "the Memory Mushroom is the other route");
      assert.doesNotMatch(f.why, /without the TM/);
    } },
  // Case 2: a relearner move, learnable at Lv 12 and so behind the Lv 40 Comfey — level-up never offers it again.
  "tm the relearner move": { wave: 27, money: 200, party: [pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90, level: 40, relearn: [[12, M.magicalLeaf, 0]] })],
    free: [tm(M.magicalLeaf, ["Comfey"], 1)],
    expect: m => {
      const f = m.free[0];
      assert.deepEqual(f.relearn, ["Comfey"]);
      assert.ok(f.v > -4, `not priced as a free learn: ${f.v}`);
    } },
  // Case 3: the TM was taught once already. `usedTMs` keeps it off the draw pool for good, even though the move was
  // overwritten since — getting it back needs this TM again, or a Memory Mushroom.
  "tm already used once": { wave: 27, money: 200, party: [pk("Snorlax", 250, 250, 0, [[M.tackle, 0, 35]], { atk: 130, spa: 60, level: 45, relearn: [[null, M.crunch, 3]] })],
    free: [tm(M.crunch, ["Snorlax"], 1)],
    expect: m => {
      const f = m.free[0];
      assert.equal(f.tm, "take", "Crunch over Tackle is still the upgrade it was");
      assert.equal(f.best.name, "Snorlax");
      assert.deepEqual(f.relearn, ["Snorlax"]);
    } },
  // A status TM nobody's card can score is `your call`, and there is no recipient row to carry the note — so the
  // model's reason names the route itself. One relearner names them; more than one says `all`.
  "tm status your call, one relearner": { wave: 27, money: 200, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90, relearn: [[14, M.screech, 0]] })],
    free: [tm(M.screech, ["Comfey"], 1)],
    expect: m => {
      const f = m.free[0];
      assert.equal(f.tm, "maybe");
      assert.match(f.why, /^status TM — Comfey can learn it · Comfey can relearn it \(Memory Mushroom\)$/);
    } },
  "tm status your call, all relearners": { wave: 27, money: 200, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90, relearn: [[14, M.screech, 0]] }),
      pk("Snorlax", 250, 250, 0, [[M.tackle, 0, 35]], { atk: 130, spa: 60, level: 45, relearn: [[null, M.screech, 3]] })],
    free: [tm(M.screech, ["Comfey", "Snorlax"], 1)],
    expect: m => {
      const f = m.free[0];
      assert.match(f.why, /· all can relearn it \(Memory Mushroom\)$/);
      assert.deepEqual(f.relearn, ["Comfey", "Snorlax"]);
    } },
  // One member still paying keeps the note off: the route is only worth naming when it covers everyone.
  "tm status your call, one still paying": { wave: 27, money: 200, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90, relearn: [[14, M.screech, 0]] }),
      pk("Snorlax", 250, 250, 0, [[M.tackle, 0, 35]], { atk: 130, spa: 60, level: 45, relearn: [] })],
    free: [tm(M.screech, ["Comfey", "Snorlax"], 1)],
    expect: m => {
      assert.doesNotMatch(m.free[0].why, /relearn/);
      assert.deepEqual(m.free[0].relearn, ["Comfey"]);
    } },
  // With a payer alongside, the relearner is weighed like anyone else rather than stepping aside.
  "tm weighs the relearner with the payer": { wave: 27, money: 200, party: [
      pk("Comfey", 110, 110, 0, [[M.drainingKiss, 0, 10], [M.tackle, 0, 35]], { types: ["Fairy"], atk: 50, spa: 90, relearn: [[18, M.crunch, 0]] }),
      pk("Snorlax", 250, 250, 0, [[M.tackle, 0, 35]], { atk: 130, spa: 60, level: 45, relearn: [] })],
    free: [tm(M.crunch, ["Comfey", "Snorlax"], 1)],
    expect: m => {
      assert.equal(m.free[0].tm, "take");
      assert.equal(m.free[0].best.name, "Snorlax", "the physical attacker gains most from Crunch");
      assert.deepEqual(m.free[0].users, ["Comfey", "Snorlax"]);
      assert.deepEqual(m.free[0].relearn, ["Comfey"]);
    } },
  // Rerolls switched off on this screen (a negative reroll multiplier): nothing to preview, and no hint.
  "reroll disabled": { wave: 14, money: 3000, reroll: -1, noReroll: true, party: [snorlax()],
    free: [mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 })],
    rewardPool: () => [held("LEFTOVERS", "Leftovers", 3)],
    expect: m => { assert.equal(m.rerollAhead, null); assert.equal(m.reroll, null); } },
  // The reward functions aren't found in the live build (yet): the old hint stands in.
  "reroll preview unavailable": { wave: 14, money: 3000, reroll: 250, phase: true, party: [snorlax()],
    free: [mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 })],
    expect: m => { assert.equal(m.rerollAhead, null); assert.match(m.reroll, /reroll for \$250/); } },
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
  sc.setup?.(sc);
  const handler = { options: sc.free.map(t => opt(t)), shopOptionsRows: shopRows, rerollCost: sc.reroll ?? 2250 };
  // Most scenarios leave `gameMode` off: the card has to fall back to the tenth-wave rule when the live build hides
  // it. The ones that set `mode` get the classic calendar, which is what the look-ahead reads.
  const scene = { money: sc.money, pokeballCounts: { 0: sc.balls ?? 34, 1: sc.balls ?? 34, 2: sc.balls ?? 34 }, modifiers: sc.modifiers ?? [], currentBattle: { waveIndex: sc.wave ?? 0, double: !!sc.double }, ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => sc.party, getEnemyParty: () => [],
    ...(sc.mode ? { gameMode: classicMode() } : sc.daily ? { gameMode: { isDaily: true } } : sc.challenges ? { gameMode: { challenges: sc.challenges } } : {}) };
  // The reroll scenarios put the reward phase on the phase queue; the others leave it off, as a read from an older HUD did.
  if (sc.rewardPool || sc.phase) {
    scene.phase = Object.assign(new SelectModifierPhase(0), { typeOptions: sc.free.map(t => ({ type: t })), noReroll: !!sc.noReroll });
    scene.phaseManager = { getCurrentPhase: () => scene.phase };
  }
  sc.pool = sc.rewardPool?.();
  sc.rewardLog = [];
  sc.consoleLog = console.log;
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const hud = globalThis.__hud;
  const { rerollArm, rerollCheck, rerollStats } = hud["50-reroll"];
  const { cardSummary } = hud["60-card"], { tick } = hud["98-tick"];
  // The rewards card is read through the run read, as the panel reads it: each call here opens one.
  const rewardsModel = (s, h) => hud["26-run"].readRun(s, run => hud["52-shop"].rewardsModel(run, h));
  globalThis.__sm = rewardsModel;
  globalThis.__api = { learnAdvice: hud["40-learn"].learnAdvice, doubleOdds: hud["49-ahead"].doubleOdds, rewardsModel, rerollArm, rerollCheck, rerollStats, cardSummary,
    setRewardFns: hud["04-game-tables"].setRewardFns, tick, HELD: hud["51-items"].HELD, rewardContext: hud["51-items"].rewardContext };
  // The chunk scan finds nothing under node: hand the reroll preview its functions, and draw the card again.
  if (sc.pool) { globalThis.__api.setRewardFns(mockRewardFns(sc.pool, sc.rewardLog)); globalThis.__api.tick(); }
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  console.log(`== ${label}\n` + (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : ""));
  const m = globalThis.__sm(scene, handler);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m), `${label}: JSON-safe`);
  sc.expect?.(m, globalThis.__api, sc, scene);
}
console.log("ok");
