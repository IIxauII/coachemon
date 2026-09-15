// Damage module against a mocked slice of the game: getAttackDamage returns the move's power (×1.5 on a crit),
// reading the user's turnData the way the game's multi-hit attrs do, so the numbers below are exact.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

class MultiHitAttr { constructor(t) { this.multiHitType = t; } }
class MultiHitPowerIncrementAttr { constructor(n) { this.maxHits = n; } }
class SurviveDamageModifier { getStackCount() { return 1; } }
class PokemonMoveAccuracyBoosterModifier { getStackCount() { return 1; } }
class BerryModifier { constructor(t) { this.berryType = t; } getStackCount() { return 1; } }
class TurnHealModifier { getStackCount() { return 1; } }

let damageCalls = 0;
const move = (id, name, type, power, { acc = 100, attrs = [], flags = 0, cat = 0 } = {}) => ({
  id, name, type, power, accuracy: acc, category: cat, moveTarget: 3, priority: 0, flags, attrs,
  hasFlag: f => !!(flags & f), getPriority: () => 0,
  calculateBattleAccuracy: (atk, def, simulated) => {
    assert.equal(simulated, true, "accuracy must be simulated");
    return acc + 5 * atk.getHeldItems().filter(m => m instanceof PokemonMoveAccuracyBoosterModifier).length;
  },
});
const pmOf = mv => ({ getMove: () => mv, getName: () => mv.name, getMovePp: () => 10, ppUsed: 0 });
const mon = (id, { hp = 1000, maxHp = hp, abilities = [], items = [], player = true, boss = 0, types = [0], formIndex = 0, moves = [] } = {}) => {
  const p = {
    id, name: id, level: 50, hp, formIndex, getMaxHp: () => maxHp, isPlayer: () => player, isOnField: () => true,
    getTypes: () => types, getAbility: () => ({ name: "x" }), hasPassive: () => false,
    getStat: () => 100, summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], abilitiesApplied: new Set() },
    waveData: { abilitiesApplied: new Set(), abilityRevealed: true },
    turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
    bossSegments: boss, bossSegmentIndex: boss ? boss - 1 : 0, isBoss: () => boss > 0,
    getHeldItems: () => items, hasAbilityWithAttr: a => abilities.includes(a), getTag: () => null,
    getMoveType: mv => (mv.name === "Aura Wheel" ? (p.formIndex === 1 ? 16 : 12) : mv.type),
    getMoveCategory: (_, mv) => mv.category,
    getAccuracyMultiplier: () => 1, getCritStage: () => 0,
    getMoveEffectiveness: () => 1,
    getAttackDamage({ source, move: mv, isCritical, simulated }) {
      assert.equal(simulated, true);
      damageCalls++;
      const td = source.turnData;
      let power = mv.power;
      const inc = mv.attrs.find(a => a instanceof MultiHitPowerIncrementAttr);
      if (inc) power *= 1 + (td.hitCount - Math.max(td.hitsLeft, 0)) % inc.maxHits;
      if (source.hasAbilityWithAttr("AddSecondStrikeAbAttr") && td.hitCount > 1 && td.hitsLeft === 1) power *= 0.25;
      // Side effects the real call can have: RNG draws and a Tera Shell turnData write.
      Phaser.Math.RND.state("!rnd,dirty");
      this.turnData.moveEffectiveness = 0.5;
      return { cancelled: false, result: 1, damage: Math.max(1, Math.floor(power * (isCritical ? 1.5 : 1))) };
    },
  };
  p.moveset = moves.map(pmOf);
  return p;
};

let phaseName = "CommandPhase";
const queued = [];
const party = [], enemies = [];
const scene = {
  phaseManager: { getCurrentPhase: () => ({ phaseName }), queueMessage: m => queued.push(m) },
  currentBattle: { waveIndex: 10, turn: 1, enemySwitchCounter: 0, battleSeedState: "seed" },
  getField: () => [...party, ...enemies], getPlayerParty: () => party, getEnemyParty: () => enemies,
  enemyModifiers: [], arena: { tags: [] },
};
globalThis.window = globalThis;
globalThis.Phaser = {
  Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } },
};
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
const src = bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__dmg = { moveOutcome, moveOutcomes, applyHits, endOfTurnHeal, hits, bestMove };\n})();\n");
eval(src);
const { moveOutcome, moveOutcomes, applyHits, endOfTurnHeal, hits, bestMove } = globalThis.__dmg;

// Expected damage of one hit whose max roll is `max`: the mean of the 16 rolls 85..100 %.
const avgRoll = max => { let t = 0; for (let r = 85; r <= 100; r++) t += Math.max(1, Math.floor(max * r / 100)); return t / 16; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
// Fresh field for each case; the turn number keys the damage cache.
let turn = 1;
const setup = (atk, def) => { party.length = 0; enemies.length = 0; party.push(atk); enemies.push(def); scene.currentBattle.turn = turn++; };

const tripleAxel = move(813, "Triple Axel", 14, 20, { acc: 90, attrs: [new MultiHitAttr(2), new MultiHitPowerIncrementAttr(3)], flags: 65536 });
const bigHit = move(1, "Big Hit", 14, 120);

// Triple Axel: hits of 20/40/60, each rolling 90 % accuracy and stopping at the first miss.
{
  const atk = mon("weavile", { player: false }), def = mon("target");
  setup(atk, def);
  const ta = moveOutcome(scene, atk, def, pmOf(tripleAxel), { crit: false });
  const single = moveOutcome(scene, atk, def, pmOf(bigHit), { crit: false });
  assert.deepEqual(ta.dist, [{ n: 3, p: 1 }]);
  assert.deepEqual(ta.perHit.map(h => h.max), [20, 40, 60]);
  assert.deepEqual(ta.perHit.map(h => h.min), [17, 34, 51]);
  assert.equal(ta.max, 120);
  assert.equal(single.max, 120);
  near(ta.acc, 0.9, "Triple Axel accuracy");
  near(ta.expected, 0.9 * avgRoll(20) + 0.81 * avgRoll(40) + 0.729 * avgRoll(60), "Triple Axel expected");
  near(single.expected, avgRoll(120), "single-hit expected");
  assert.ok(ta.expected < single.expected, "accuracy per hit makes Triple Axel worth less than an equal max single hit");
  assert.ok(ta.notes.includes("3 hits"));
  // Wide Lens: +5 accuracy on every rolled hit.
  const lens = mon("weavile2", { player: false, items: [new PokemonMoveAccuracyBoosterModifier()] });
  setup(lens, def);
  near(moveOutcome(scene, lens, def, pmOf(tripleAxel), { crit: false }).expected, 0.95 * avgRoll(20) + 0.95 ** 2 * avgRoll(40) + 0.95 ** 3 * avgRoll(60), "Wide Lens Triple Axel");
  // Crits (1/24 per hit) only add damage.
  setup(atk, def);
  assert.ok(moveOutcome(scene, atk, def, pmOf(tripleAxel)).expected > ta.expected);
  // Triple Axel into 100 HP: needs all three hits at good rolls.
  const low = mon("low", { hp: 115 });
  setup(atk, low);
  const lowTa = moveOutcome(scene, atk, low, pmOf(tripleAxel), { crit: false });
  assert.ok(lowTa.pKo > 0 && lowTa.pKo < 0.729, `Triple Axel pKo ${lowTa.pKo}`);
}

// 2–5 hits, Skill Link, Parental Bond.
{
  const bullet = move(2, "Bullet Seed", 11, 25, { attrs: [new MultiHitAttr(1)] });
  const def = mon("target");
  const atk = mon("a");
  setup(atk, def);
  const o = moveOutcome(scene, atk, def, pmOf(bullet), { crit: false });
  assert.deepEqual(o.dist, [{ n: 2, p: 0.35 }, { n: 3, p: 0.35 }, { n: 4, p: 0.15 }, { n: 5, p: 0.15 }]);
  near(o.expected, 3.1 * avgRoll(25), "2–5 hit expected");
  const sl = mon("sl", { abilities: ["MaxMultiHitAbAttr"] });
  setup(sl, def);
  assert.deepEqual(moveOutcome(scene, sl, def, pmOf(bullet), { crit: false }).dist, [{ n: 5, p: 1 }]);
  const pb = mon("pb", { abilities: ["AddSecondStrikeAbAttr"] });
  const tackle = { ...move(3, "Tackle", 0, 100), canBeMultiStrikeEnhanced: () => true };
  setup(pb, def);
  const pbo = moveOutcome(scene, pb, def, pmOf(tackle), { crit: false });
  assert.deepEqual(pbo.dist, [{ n: 2, p: 1 }]);
  assert.deepEqual(pbo.perHit.map(h => h.max), [100, 25]);
}

// Boss segments: a 2-bar boss at full HP can't be one-shot below 1.5 × max HP of damage.
{
  const atk = mon("a");
  const boss = mon("boss", { hp: 200, player: false, boss: 2 });
  setup(atk, boss);
  const o = moveOutcome(scene, atk, boss, pmOf(move(4, "Nuke", 0, 250)), { crit: false });
  assert.equal(o.pKo, 0, "boss clamp stops a 1HKO");
  assert.equal(o.max, 100, "stops at the segment boundary");
  assert.equal(o.expected, 100);
  // 320 max: only rolls leaving ≥ 200 excess past the boundary (≥ 300 damage, rolls 94–100) break both bars.
  const big = moveOutcome(scene, atk, boss, pmOf(move(5, "Bigger Nuke", 0, 320)), { crit: false });
  near(big.pKo, 7 / 16, "boss break chance");
  // Each hit clamps separately; the second continues from the new bar.
  assert.deepEqual(applyHits(boss, [150]), { hp: 100, segIdx: 0, ko: false, pSurvive: 1 });
  assert.deepEqual(applyHits(boss, [150, 150]), { hp: 0, segIdx: 0, ko: true, pSurvive: 0 });
  const plain = mon("plain", { hp: 200 });
  assert.equal(applyHits(plain, [250]).ko, true);
}

// Sturdy at full HP, Focus Band, Mold Breaker.
{
  const atk = mon("a");
  const nuke = pmOf(move(6, "Nuke", 0, 300));
  const sturdy = mon("sturdy", { hp: 100, abilities: ["PreDefendFullHpEndureAbAttr"] });
  setup(atk, sturdy);
  const o = moveOutcome(scene, atk, sturdy, nuke, { crit: false });
  assert.equal(o.pKo, 0);
  assert.equal(o.max, 99);
  assert.ok(o.notes.includes("sturdy"));
  const hurt = mon("sturdy2", { hp: 99, maxHp: 100, abilities: ["PreDefendFullHpEndureAbAttr"] });
  setup(atk, hurt);
  assert.equal(moveOutcome(scene, atk, hurt, nuke, { crit: false }).pKo, 1, "Sturdy needs full HP");
  const mold = mon("mold", { abilities: ["MoveAbilityBypassAbAttr"] });
  setup(mold, sturdy);
  assert.equal(moveOutcome(scene, mold, sturdy, nuke, { crit: false }).pKo, 1, "Mold Breaker ignores Sturdy");
  const band = mon("band", { hp: 100, items: [new SurviveDamageModifier()] });
  setup(atk, band);
  near(moveOutcome(scene, atk, band, nuke, { crit: false }).pKo, 0.9, "Focus Band");
  assert.equal(applyHits(band, [300]).ko, true);
  near(applyHits(band, [300]).pSurvive, 0.1, "Focus Band pSurvive");
  // Two lethal hits need two Focus Band saves.
  near(applyHits(band, [300, 300]).pSurvive, 0.01, "Focus Band twice");
}

// Accuracy scales expected damage; form-dependent type from getMoveType.
{
  const atk = mon("morpeko", { formIndex: 1 }), def = mon("target");
  setup(atk, def);
  const sure = moveOutcome(scene, atk, def, pmOf(move(7, "Sure", 0, 80)), { crit: false });
  const coin = moveOutcome(scene, atk, def, pmOf(move(8, "Coin", 0, 80, { acc: 50 })), { crit: false });
  near(coin.expected, sure.expected / 2, "50 % accuracy halves expected");
  assert.equal(coin.max, sure.max, "max ignores accuracy");
  near(coin.pKo + sure.pKo, 0, "no KO into 1000 HP");
  assert.equal(moveOutcome(scene, atk, def, pmOf(move(9, "Aura Wheel", 12, 110))).type, "Dark");
}

// Sandbox: the call leaves RNG, turnData and the phase queue as they were; the cache avoids repeat calls.
{
  const atk = mon("a", { player: false }), def = mon("target");
  setup(atk, def);
  Phaser.Math.RND.state("!rnd,before");
  const turnData = [JSON.stringify(atk.turnData), JSON.stringify(def.turnData)];
  const calls = damageCalls;
  moveOutcome(scene, atk, def, pmOf(tripleAxel));
  assert.ok(damageCalls > calls, "game damage code was called");
  assert.equal(Phaser.Math.RND.state(), "!rnd,before");
  assert.equal(scene.currentBattle.battleSeedState, "seed");
  assert.deepEqual([JSON.stringify(atk.turnData), JSON.stringify(def.turnData)], turnData);
  assert.equal(Object.prototype.hasOwnProperty.call(scene.phaseManager, "pushPhase"), false);
  const again = damageCalls;
  moveOutcome(scene, atk, def, pmOf(tripleAxel));
  assert.equal(damageCalls, again, "cached per turn");
}

// hits / bestMove keep the old record shape, backed by the game path: expected for ours, max for a foe's.
{
  const ours = mon("ours", { moves: [bigHit, move(10, "Growl", 0, 0, { cat: 2 })] });
  const foe = mon("foe", { player: false, moves: [bigHit] });
  setup(ours, foe);
  const mine = hits(ours, foe);
  assert.equal(mine.length, 1, "status moves skipped");
  assert.deepEqual(Object.keys(mine[0]).filter(k => ["name", "type", "cat", "e", "dmg", "spread", "priority"].includes(k)).sort(), ["cat", "dmg", "e", "name", "priority", "spread", "type"]);
  assert.ok(mine[0].dmg < 120 && mine[0].dmg > 102);
  assert.ok(hits(foe, ours, true)[0].dmg >= 120, "foe damage is the max roll (crit-weighted rolls don't lower it)");
  assert.equal(bestMove(ours, foe).name, "Big Hit");
  assert.equal(moveOutcomes(scene, ours, foe).length, 1);
  JSON.stringify(mine);
}

// Present (power from Phaser's RNG), Psywave, OHKO, Disguise; a 10-hit move into a big boss stays cheap.
{
  class PresentPowerAttr {}
  class RandomLevelDamageAttr {}
  class FixedDamageAttr {}
  class PsywaveAttr extends FixedDamageAttr {}
  class OneHitKOAttr {}
  class FormBlockDamageAbAttr { constructor(f) { this.formIndex = f; } }
  const atk = mon("a"), def = mon("target");
  const realDamage = def.getAttackDamage;
  def.getAttackDamage = function (args) {
    const mv = args.move;
    if (mv.attrs.some(a => a instanceof PresentPowerAttr)) {
      const seed = Phaser.Math.RND.integerInRange?.(0, 254) ?? 0;
      return { cancelled: false, result: 1, damage: seed <= 102 ? 40 : seed <= 178 ? 80 : seed <= 204 ? 120 : 0 };
    }
    if (mv.attrs.some(a => a instanceof FixedDamageAttr)) return { cancelled: false, result: 1, damage: 50 };
    if (mv.attrs.some(a => a instanceof OneHitKOAttr)) return { cancelled: false, result: 6, damage: this.hp };
    return realDamage.call(this, args);
  };
  setup(atk, def);
  const present = moveOutcome(scene, atk, def, pmOf(move(11, "Present", 0, 0, { attrs: [new PresentPowerAttr()] })), { crit: false });
  near(present.expected, 0.4 * avgRoll(40) + 0.3 * avgRoll(80) + 0.1 * avgRoll(120), "Present expected");
  assert.equal(present.max, 120);
  assert.equal(Object.prototype.hasOwnProperty.call(Phaser.Math.RND, "integerInRange"), false, "RNG pin removed");
  const psy = moveOutcome(scene, atk, def, pmOf(move(12, "Psywave", 13, 1, { attrs: [new PsywaveAttr(), new RandomLevelDamageAttr()] })));
  assert.ok(Math.abs(psy.expected - 50) < 1, `Psywave ~ level: ${psy.expected}`);
  const fixed = moveOutcome(scene, atk, def, pmOf(move(13, "Seismic Toss", 1, 1, { attrs: [new FixedDamageAttr()] })));
  assert.equal(fixed.expected, 50);
  assert.equal(fixed.crit, 0);
  const boss = mon("boss", { hp: 600, player: false, boss: 3 });
  boss.getAttackDamage = def.getAttackDamage;
  setup(atk, boss);
  const ohko = moveOutcome(scene, atk, boss, pmOf(move(14, "Fissure", 4, 0, { acc: 30, attrs: [new OneHitKOAttr()] })));
  near(ohko.pKo, 0.3, "OHKO ignores boss bars");
  const mimikyu = mon("mimikyu", { hp: 100 });
  mimikyu.getAbility = () => ({ name: "Disguise", getAttrs: n => (n === "FormBlockDamageAbAttr" ? [new FormBlockDamageAbAttr(0)] : []) });
  setup(atk, mimikyu);
  assert.equal(moveOutcome(scene, atk, mimikyu, pmOf(bigHit)).pKo, 0, "Disguise takes the hit");
  const popBomb = move(15, "Population Bomb", 0, 30, { acc: 90, attrs: [new MultiHitAttr(3)], flags: 65536 });
  const bigBoss = mon("bigboss", { hp: 3000, player: false, boss: 5, items: [new SurviveDamageModifier()] });
  setup(atk, bigBoss);
  const t0 = performance.now();
  const pop = moveOutcome(scene, atk, bigBoss, pmOf(popBomb));
  const ms = performance.now() - t0;
  assert.ok(pop.expected > 0 && pop.notes.includes("10 hits"));
  assert.ok(ms < 50, `10-hit resolve took ${ms} ms`);
}

assert.equal(moveOutcome.lastError, undefined, `game path threw: ${moveOutcome.lastError?.stack}`);

// End-of-turn heals.
{
  const p = mon("berry", { hp: 90, maxHp: 200, items: [new BerryModifier(0), new BerryModifier(2), new TurnHealModifier()] });
  assert.equal(endOfTurnHeal(p), 50 + 12);
  assert.equal(endOfTurnHeal(p, { tookSuperEffective: true, hp: 60 }), 50 + 50 + 12);
  assert.equal(endOfTurnHeal(p, { hp: 150 }), 12, "Sitrus waits for half HP");
  assert.equal(endOfTurnHeal(p, { hp: 195 }), 5, "capped at max HP");
  assert.equal(endOfTurnHeal(p, { hp: 0 }), 0);
}

// Outside the command phase no game code runs; the approximation still answers.
{
  phaseName = "MovePhase";
  const atk = mon("a", { moves: [bigHit] }), def = mon("target");
  setup(atk, def);
  const calls = damageCalls;
  const o = moveOutcome(scene, atk, def, pmOf(bigHit));
  assert.deepEqual(o.notes, ["estimate"]);
  assert.ok(o.max > 0 && o.expected > 0);
  assert.equal(hits(atk, def).length, 1);
  assert.equal(damageCalls, calls, "no game calls outside CommandPhase");
  phaseName = "CommandPhase";
}

console.log("damage: ok");
