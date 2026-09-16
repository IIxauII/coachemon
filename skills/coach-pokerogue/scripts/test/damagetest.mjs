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
const held = (name, props = {}, n = 1) => Object.assign(new ({ [name]: class { getStackCount() { return n; } } })[name](), props);
// An ability attribute carrying its constructor arguments, as the game stores them.
const abAttr = (name, props = {}) => Object.assign(new ({ [name]: class {} })[name](), props);

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
const mon = (id, { hp = 1000, maxHp = hp, abilities = [], attrs = [], items = [], player = true, boss = 0, types = [0], formIndex = 0, moves = [], status = null, tags = [] } = {}) => {
  const p = {
    id, name: id, level: 50, hp, formIndex, getMaxHp: () => maxHp, isPlayer: () => player, isOnField: () => true,
    getTypes: () => types, getAbility: () => ({ name: "x", getAttrs: n => attrs.filter(a => a.constructor.name === n) }), hasPassive: () => false, status,
    getStat: () => 100, summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], abilitiesApplied: new Set() },
    waveData: { abilitiesApplied: new Set(), abilityRevealed: true },
    turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
    bossSegments: boss, bossSegmentIndex: boss ? boss - 1 : 0, isBoss: () => boss > 0,
    getHeldItems: () => items, hasAbilityWithAttr: a => abilities.includes(a) || attrs.some(x => x.constructor.name === a), getTag: t => (tags.includes(t) ? {} : null),
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
const src = bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__dmg = { moveOutcome, moveOutcomes, statusMoves, applyHits, endOfTurnHp, hits, bestMove, sandbox };\n})();\n");
eval(src);
const { moveOutcome, moveOutcomes, statusMoves, applyHits, endOfTurnHp, hits, bestMove, sandbox } = globalThis.__dmg;

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
  // A boss 1 HP above its bar boundary takes 1 from this use; `uncapped` is what the same use deals on a later bar.
  const edge = mon("edge", { hp: 501, maxHp: 1000, boss: 2, player: false });
  setup(atk, edge);
  const clamped = moveOutcome(scene, atk, edge, pmOf(bigHit), { crit: false });
  near(clamped.expected, 1, "clamped at the boundary");
  near(clamped.uncapped, avgRoll(120), "uncapped single hit");
  // `use`: the whole use's damage, uncut by the boundary — it keeps the uncapped mean, and Triple Axel's first-hit miss
  // (10 %) sits at 0 on its own; a single-hit move rolls 102–120 with no 0 at all.
  const mean = use => use.reduce((t, x) => t + x.d * x.p, 0);
  near(mean(clamped.use), clamped.uncapped, "use keeps the uncapped mean");
  assert.ok(clamped.use.length <= 12 && !clamped.use.some(x => x.d === 0), `single hit: rolls only (${JSON.stringify(clamped.use)})`);
  near(mean(ta.use), ta.uncapped, "Triple Axel use mean");
  near(ta.use.find(x => x.d === 0)?.p ?? 0, 0.1, "Triple Axel misses its first hit 10 %");
  assert.ok(Math.max(...ta.use.map(x => x.d)) <= 120, "nothing above all three hits at max roll");
  setup(atk, edge);
  near(moveOutcome(scene, atk, edge, pmOf(tripleAxel), { crit: false }).uncapped, ta.expected, "uncapped Triple Axel");
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
  // Inside a caller's sandbox (a whole HUD refresh) the restore waits for that sandbox to close, but game code run
  // in between — the enemy AI scoring its moves — must already see the user's turnData untouched.
  setup(atk, def);
  const during = sandbox(scene, () => { moveOutcome(scene, atk, def, pmOf(tripleAxel)); return JSON.stringify(atk.turnData); });
  assert.equal(during, turnData[0], "multi-hit turnData restored before the next game call");
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

// Turn end: the signed HP change between this turn's moves and the next command.
{
  const p = mon("berry", { hp: 90, maxHp: 200, items: [new BerryModifier(0), new BerryModifier(2), new TurnHealModifier()] });
  assert.equal(endOfTurnHp(p, { s: scene }), 50 + 12);
  assert.equal(endOfTurnHp(p, { s: scene, tookSuperEffective: true, hp: 60 }), 50 + 50 + 12);
  assert.equal(endOfTurnHp(p, { s: scene, hp: 150 }), 12, "Sitrus waits for half HP");
  assert.equal(endOfTurnHp(p, { s: scene, hp: 195 }), 5, "capped at max HP");
  assert.equal(endOfTurnHp(p, { s: scene, hp: 0 }), 0);
}
{
  const at = (weatherType = 0, terrainType = 0, extra = {}) => ({ ...scene, arena: { tags: [], weather: weatherType ? { weatherType } : null, terrain: terrainType ? { terrainType } : null }, ...extra });
  const [SUN, RAIN, SAND, HAIL] = [1, 2, 3, 4];
  const m = (opts = {}) => mon("m", { hp: 100, maxHp: 160, ...opts });
  // Sandstorm / hail: 1/16, not for the types it spares, Magic Guard, Overcoat-type abilities or a mon underground.
  assert.equal(endOfTurnHp(m(), { s: at(SAND) }), -10, "sandstorm 1/16");
  assert.equal(endOfTurnHp(m({ types: [5] }), { s: at(SAND) }), 0, "Rock ignores sand");
  assert.equal(endOfTurnHp(m({ types: [5] }), { s: at(HAIL) }), -10, "but not hail");
  assert.equal(endOfTurnHp(m({ types: [14] }), { s: at(HAIL) }), 0, "Ice ignores hail");
  assert.equal(endOfTurnHp(m({ abilities: ["BlockNonDirectDamageAbAttr"] }), { s: at(SAND) }), 0, "Magic Guard");
  assert.equal(endOfTurnHp(m({ attrs: [abAttr("BlockWeatherDamageAttr", { weatherTypes: [] })] }), { s: at(HAIL) }), 0, "Overcoat");
  const sandVeil = m({ attrs: [abAttr("BlockWeatherDamageAttr", { weatherTypes: [SAND] })] });
  assert.equal(endOfTurnHp(sandVeil, { s: at(SAND) }), 0, "Sand Veil in sand");
  assert.equal(endOfTurnHp(sandVeil, { s: at(HAIL) }), -10, "Sand Veil in hail");
  assert.equal(endOfTurnHp(m({ tags: ["UNDERGROUND"] }), { s: at(SAND) }), 0, "mid-Dig");
  const cloudNine = mon("cloud nine", { attrs: [abAttr("SuppressWeatherEffectAbAttr")] });
  assert.equal(endOfTurnHp(m(), { s: at(SAND, 0, { getField: () => [cloudNine] }) }), 0, "Cloud Nine on the field");
  // Weather abilities: Rain Dish / Ice Body 1/16, Dry Skin 1/8 in rain and −1/8 in sun, Solar Power −1/8.
  const drySkin = [abAttr("PostWeatherLapseHealAbAttr", { healFactor: 2, weatherTypes: [RAIN, 7] }), abAttr("PostWeatherLapseDamageAbAttr", { damageFactor: 2, weatherTypes: [SUN, 8] })];
  assert.equal(endOfTurnHp(m({ attrs: [abAttr("PostWeatherLapseHealAbAttr", { healFactor: 1, weatherTypes: [RAIN, 7] })] }), { s: at(RAIN) }), 10, "Rain Dish");
  assert.equal(endOfTurnHp(m({ attrs: drySkin }), { s: at(RAIN) }), 20, "Dry Skin in rain");
  assert.equal(endOfTurnHp(m({ attrs: drySkin }), { s: at(SUN) }), -20, "Dry Skin in sun");
  assert.equal(endOfTurnHp(m({ attrs: drySkin }), { s: at() }), 0, "Dry Skin without weather");
  // Status: poison 1/8, toxic n/16 with the counter ticking first, burn 1/16 (Heatproof halves it).
  assert.equal(endOfTurnHp(m({ status: { effect: 1 } }), { s: at() }), -20, "poison");
  assert.equal(endOfTurnHp(m({ status: { effect: 2, toxicTurnCount: 2 } }), { s: at() }), -30, "toxic, third turn");
  assert.equal(endOfTurnHp(m({ status: { effect: 6 } }), { s: at() }), -10, "burn");
  assert.equal(endOfTurnHp(m({ status: { effect: 6 }, attrs: [abAttr("ReduceBurnDamageAbAttr", { multiplier: 0.5 })] }), { s: at() }), -5, "Heatproof");
  assert.equal(endOfTurnHp(m({ status: { effect: 1 }, abilities: ["BlockNonDirectDamageAbAttr"] }), { s: at() }), 0, "Magic Guard vs poison");
  const poisonHeal = [abAttr("BlockStatusDamageAbAttr", { effects: [1, 2] }), abAttr("PostTurnStatusHealAbAttr", { effects: [1, 2] })];
  assert.equal(endOfTurnHp(m({ status: { effect: 2, toxicTurnCount: 4 }, attrs: poisonHeal }), { s: at() }), 20, "Poison Heal");
  assert.equal(endOfTurnHp(m({ status: { effect: 6 }, attrs: poisonHeal }), { s: at() }), -10, "Poison Heal doesn't cover burn");
  // Toxic / Flame Orb: the status lands at turn end, so its chip counts as recurring; not on the types it can't affect.
  assert.equal(endOfTurnHp(m({ items: [held("TurnStatusEffectModifier", { effect: 2 })] }), { s: at() }), -10, "Toxic Orb");
  assert.equal(endOfTurnHp(m({ types: [8], items: [held("TurnStatusEffectModifier", { effect: 2 })] }), { s: at() }), 0, "Toxic Orb on Steel");
  assert.equal(endOfTurnHp(m({ items: [held("TurnStatusEffectModifier", { effect: 6 })] }), { s: at() }), -10, "Flame Orb");
  // Chip comes before berries (Sitrus reads the HP after it) and can faint the mon, which then heals nothing.
  const sitrus = [new BerryModifier(0), new TurnHealModifier()];
  assert.equal(endOfTurnHp(m({ hp: 90, items: sitrus }), { s: at(SAND) }), -10 + 10, "80/160 isn't below half");
  assert.equal(endOfTurnHp(m({ hp: 85, items: sitrus }), { s: at(SAND) }), -10 + 40 + 10, "75/160 is");
  assert.equal(endOfTurnHp(m({ hp: 5, items: sitrus, status: { effect: 1 } }), { s: at() }), -5, "poison faints it");
  // Grassy Terrain: 1/16 to grounded mons.
  assert.equal(endOfTurnHp(m(), { s: at(0, 3) }), 10, "Grassy Terrain");
  assert.equal(endOfTurnHp(m({ types: [2] }), { s: at(0, 3) }), 0, "Flying isn't grounded");
  // The enemy's wave heal tokens: 2 % max HP per stack; players don't get it.
  const waveHeal = at(0, 0, { enemyModifiers: [held("EnemyTurnHealModifier", {}, 3)] });
  assert.equal(endOfTurnHp(m({ player: false }), { s: waveHeal }), 9, "enemy turn heal ×3");
  assert.equal(endOfTurnHp(m(), { s: waveHeal }), 0, "not for the player");
  assert.equal(endOfTurnHp(m({ hp: 20, maxHp: 40, player: false }), { s: waveHeal }), 1, "the 1 HP floor covers all stacks");
  // Shell Bell: 1/8 of the damage dealt this turn per stack.
  assert.equal(endOfTurnHp(m({ items: [held("HitHealModifier", {}, 2)] }), { s: at(), dealt: 100 }), 24, "Shell Bell ×2");
  assert.equal(endOfTurnHp(m({ items: [held("HitHealModifier")] }), { s: at() }), 0, "Shell Bell without damage");
}

// Reviver Seed: a lethal hit isn't a KO — it's back at half HP.
{
  const atk = mon("a");
  const seed = mon("seed", { hp: 100, maxHp: 300, items: [held("PokemonInstantReviveModifier")] });
  setup(atk, seed);
  const o = moveOutcome(scene, atk, seed, pmOf(bigHit), { crit: false });
  assert.equal(o.pKo, 0, "revives");
  assert.equal(o.revive, 150);
  assert.ok(o.notes.includes("reviver seed"));
  setup(atk, mon("plain", { hp: 100 }));
  assert.equal(moveOutcome(scene, atk, enemies[0], pmOf(bigHit), { crit: false }).revive, 0);
}

// Stopped before the damage step: primordial weather (a Fire move in heavy rain) and Psychic Terrain (priority into a
// grounded target) cancel the move in MovePhase, which the simulated damage call never sees.
{
  const atk = mon("a", { moves: [bigHit] }), def = mon("target");
  for (const [check, why] of [["isMoveWeatherCancelled", "weather"], ["isMoveTerrainCancelled", "terrain"]]) {
    setup(atk, def);
    scene.arena[check] = (user, x, y) => (y ?? x).name === "Big Hit";
    const o = moveOutcome(scene, atk, def, pmOf(bigHit));
    delete scene.arena[check];
    assert.equal(o.expected, 0, `${why}: no damage`);
    assert.equal(o.pKo, 0);
    assert.deepEqual(o.notes, [`stopped by ${why}`]);
  }
  setup(atk, def);
  assert.ok(moveOutcome(scene, atk, def, pmOf(bigHit)).expected > 0, "nothing stops it otherwise");
  // Protect blocks it unless it ignores Protect (MoveFlags.IGNORE_PROTECT, 1 << 1).
  const feint = move(364, "Feint", 0, 30, { flags: 2 });
  assert.equal(moveOutcome(scene, atk, def, pmOf(feint)).bypassProtect, true, "Feint goes through Protect");
  assert.equal(moveOutcome(scene, atk, def, pmOf(bigHit)).bypassProtect, false);
}

// Status moves: the usable ones with their accuracy, and 0 effectiveness where the target is immune.
{
  const thunderWave = move(86, "Thunder Wave", 12, 0, { acc: 90, cat: 2 });
  const swordsDance = move(14, "Swords Dance", 0, 0, { acc: -1, cat: 2 });
  const atk = mon("a", { moves: [bigHit, thunderWave, swordsDance] });
  const ground = mon("ground");
  ground.getMoveEffectiveness = (src, mv) => (mv.name === "Thunder Wave" ? 0 : 1);
  setup(atk, ground);
  const st = statusMoves(scene, atk, ground);
  assert.deepEqual(st.map(x => x.name), ["Thunder Wave", "Swords Dance"], "status moves only");
  const tw = st.find(x => x.name === "Thunder Wave");
  assert.equal(tw.acc, 0.9);
  assert.equal(tw.e, 0, "Thunder Wave into a Ground type");
  assert.equal(tw.cat, "status");
  assert.equal(st.find(x => x.name === "Swords Dance").acc, 1, "no accuracy check");
  phaseName = "MovePhase";
  assert.deepEqual(statusMoves(scene, atk, ground), [], "game calls only");
  phaseName = "CommandPhase";
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

  // Move-flag immunities: a sound move into Soundproof, a ball move into Bulletproof, a wind move into Wind Rider.
  for (const [ability, flag] of [["Soundproof", 1 << 2], ["Bulletproof", 1 << 10], ["Wind Rider", 1 << 13]]) {
    const flagged = move(9, "Flagged", 14, 120, { flags: flag });
    const wall = mon("wall");
    wall.getAbility = () => ({ name: ability, getAttrs: () => [] });
    setup(atk, wall);
    const w = moveOutcome(scene, atk, wall, pmOf(flagged));
    assert.equal(w.e, 0, `${ability} blocks the estimate`);
    assert.equal(w.max, 0, `${ability}: no damage`);
    assert.ok(moveOutcome(scene, atk, wall, pmOf(bigHit)).max > 0, `${ability} lets unflagged moves through`);
  }
  phaseName = "CommandPhase";
}

console.log("damage: ok");
