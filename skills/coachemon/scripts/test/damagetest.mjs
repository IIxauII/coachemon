// The mock's `getAttackDamage` returns the move's power, ×1.5 on a crit, and reads the user's turnData as the game's
// multi-hit attrs do: the numbers below are exact.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { MoveId, MultiHitType } from "../../../../src/enums/generated.ts";
import { GAME_PROTO } from "./game-proto.mjs";

class MultiHitAttr { constructor(t) { this.multiHitType = t; } }
// False Swipe's cap (game-code.md §1).
class ModifiedDamageAttr {}
class SurviveDamageAttr extends ModifiedDamageAttr {}
class MultiHitPowerIncrementAttr { constructor(n) { this.maxHits = n; } }
class SurviveDamageModifier { getStackCount() { return 1; } }
class PokemonMoveAccuracyBoosterModifier { getStackCount() { return 1; } }
class BerryModifier { constructor(t) { this.berryType = t; } getStackCount() { return 1; } }
class TurnHealModifier { getStackCount() { return 1; } }
const held = (name, props = {}, n = 1) => Object.assign(new ({ [name]: class { getStackCount() { return n; } } })[name](), props);
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
const pmOf = (mv, i = 0) => ({ moveId: mv.id ?? i + 1, getMove: () => mv, getName: () => mv.name, getMovePp: () => 10, ppUsed: 0 });
// `battlerTags`: the instances `summonData.tags` holds, read by class — not `tags`, which only `getTag` sees. `bi`:
// the battler index a Leech Seed names its seeder by.
const mon = (id, { hp = 1000, maxHp = hp, abilities = [], attrs = [], items = [], player = true, boss = 0, types = [0], formIndex = 0, moves = [], status = null, tags = [], battlerTags = [], bi = 0 } = {}) => {
  const p = Object.assign(Object.create(GAME_PROTO), {
    id, name: id, level: 50, hp, formIndex, getMaxHp: () => maxHp, isPlayer: () => player, isOnField: () => true,
    getTypes: () => types, getAbility: () => ({ name: "x", getAttrs: n => attrs.filter(a => a.constructor.name === n) }), hasPassive: () => false, status,
    getBattlerIndex: () => bi,
    getStat: () => 100, summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], abilitiesApplied: new Set(), tags: battlerTags },
    waveData: { abilitiesApplied: new Set(), abilityRevealed: true },
    turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
    bossSegments: boss, bossSegmentIndex: boss ? boss - 1 : 0, isBoss: () => boss > 0,
    getHeldItems: () => items, hasAbilityWithAttr: a => abilities.includes(a) || attrs.some(x => x.constructor.name === a), getTag: t => (tags.includes(t) ? {} : null),
    getMoveType: mv => (mv.name === "Aura Wheel" ? (p.formIndex === 1 ? 16 : 12) : mv.type),
    getMoveCategory: (_, mv) => mv.category,
    getAccuracyMultiplier: () => 1, getCritStage: () => 0,
    getMoveEffectiveness: () => 1,
    // The damage module reads each roll by scaling this factor (game-code.md §1).
    calculateStabMultiplier: () => 1,
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
      let damage = Math.max(1, Math.floor(power * (isCritical ? 1.5 : 1) * this.calculateStabMultiplier(source, mv, false, true)));
      if (mv.attrs.some(a => a instanceof SurviveDamageAttr)) damage = Math.min(damage, this.hp - 1);
      return { cancelled: false, result: 1, damage };
    },
  });
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
  game: { config: { gameVersion: "1.12.0.11" } },
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
eval(bundle("hud", { expose: true }));
const D = globalThis.__hud["10-damage"];
const { hitOn, koTurn, koTurns, useOf, koChanceAt } = D;
const { gameVersionOf, versionAtLeast } = globalThis.__hud["01-core"];
const { readTurn } = globalThis.__hud["25-turn"];

const ask = (s, fn) => readTurn(s, fn);
const moveOutcome = (s, ...a) => ask(s, t => t.outcome(...a));
const moveOutcomes = (s, ...a) => ask(s, t => t.outcomes(...a));
const statusMoves = (s, ...a) => ask(s, t => t.statusMoves(...a));
const endOfTurnHp = (p, { s = scene, ...opts } = {}) => ask(s, t => t.turnEndHp(p, opts));
const hits = (a, d) => ask(scene, t => t.outcomes(a, d));
const recOf = (p, s = scene) => ask(s, t => t.mon(p));
const stateOf = (p, hp, bar) => D.stateOf(recOf(p).facts, hp, bar);
const koCurve = (target, use, opts) => D.koCurve(recOf(target), use, opts);

const avgRoll = max => { let t = 0; for (let r = 85; r <= 100; r++) t += Math.max(1, Math.floor(max * r / 100)); return t / 16; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
// A fresh turn number per case: it is part of the turn's memo key.
let turn = 1;
const setup = (atk, def) => { party.length = 0; enemies.length = 0; party.push(atk); enemies.push(def); scene.currentBattle.turn = turn++; };

const tripleAxel = move(813, "Triple Axel", 14, 20, { acc: 90, attrs: [new MultiHitAttr(2), new MultiHitPowerIncrementAttr(3)], flags: 65536 });
const bigHit = move(1, "Big Hit", 14, 120);

// ---- Triple Axel rolls accuracy per hit and stops at the first miss (game-code.md §2)
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
  // `uncapped` and `use` are what the same use deals uncut by the bar boundary.
  const edge = mon("edge", { hp: 501, maxHp: 1000, boss: 2, player: false });
  setup(atk, edge);
  const clamped = moveOutcome(scene, atk, edge, pmOf(bigHit), { crit: false });
  near(clamped.expected, 1, "clamped at the boundary");
  near(clamped.uncapped, avgRoll(120), "uncapped single hit");
  const mean = use => use.reduce((t, x) => t + x.d * x.p, 0);
  near(mean(clamped.use), clamped.uncapped, "use keeps the uncapped mean");
  assert.ok(clamped.use.length <= 12 && !clamped.use.some(x => x.d === 0), `single hit: rolls only (${JSON.stringify(clamped.use)})`);
  near(mean(ta.use), ta.uncapped, "Triple Axel use mean");
  near(ta.use.find(x => x.d === 0)?.p ?? 0, 0.1, "Triple Axel misses its first hit 10 %");
  assert.ok(Math.max(...ta.use.map(x => x.d)) <= 120, "nothing above all three hits at max roll");
  setup(atk, edge);
  near(moveOutcome(scene, atk, edge, pmOf(tripleAxel), { crit: false }).uncapped, ta.expected, "uncapped Triple Axel");
  assert.ok(ta.notes.includes("3 hits"));
  const lens = mon("weavile2", { player: false, items: [new PokemonMoveAccuracyBoosterModifier()] });
  setup(lens, def);
  near(moveOutcome(scene, lens, def, pmOf(tripleAxel), { crit: false }).expected, 0.95 * avgRoll(20) + 0.95 ** 2 * avgRoll(40) + 0.95 ** 3 * avgRoll(60), "Wide Lens Triple Axel");
  setup(atk, def);
  assert.ok(moveOutcome(scene, atk, def, pmOf(tripleAxel)).expected > ta.expected);
  const low = mon("low", { hp: 115 });
  setup(atk, low);
  const lowTa = moveOutcome(scene, atk, low, pmOf(tripleAxel), { crit: false });
  assert.ok(lowTa.pKo > 0 && lowTa.pKo < 0.729, `Triple Axel pKo ${lowTa.pKo}`);
}

// ---- A 2–5-hit move rolls its count, Skill Link maxes it and Parental Bond adds a quarter strike (game-code.md §2)
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

// ---- A boss's bars clamp each hit on its own (game-code.md §3)
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
  const once = hitOn(stateOf(boss), 150);
  assert.deepEqual([once.hp, once.bar], [100, 0]);
  assert.deepEqual([hitOn(once, 150).hp, hitOn(once, 150).bar], [0, 0]);
  assert.equal(hitOn(stateOf(mon("plain", { hp: 200 })), 250).hp, 0);
}

// ---- Sturdy saves only at full HP and never past Mold Breaker, and Focus Band saves one time in ten
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
  assert.equal(hitOn(stateOf(band), 300).hp, 0, "hitOn has no luck");
  const banded = koCurve(band, [{ d: 300, p: 1 }]).by;
  near(banded[0], 0.9, "Focus Band over a use");
  near(banded[1], 0.99, "Focus Band twice");
}

// ---- Accuracy scales expected damage, and `getMoveType` gives a form its type
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

// ---- The sandbox leaves RNG, turnData and the phase queue as they were, and a turn asks the game once
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
  const twice = ask(scene, t => {
    const a = t.outcome(atk, def, pmOf(tripleAxel));
    const before = damageCalls;
    return [a === t.outcome(atk, def, pmOf(tripleAxel)), damageCalls - before];
  });
  assert.deepEqual(twice, [true, 0], "one answer per turn, asked once");
  // The turn's one sandbox restores only at its end, so a read that writes multi-hit turnData puts it back itself.
  setup(atk, def);
  const during = ask(scene, t => { t.outcome(atk, def, pmOf(tripleAxel)); return JSON.stringify(atk.turnData); });
  assert.equal(during, turnData[0], "multi-hit turnData restored before the next game call");
}

// ---- An assumption holds only while the game is asked, and a handed-back turn is dead
{
  const atk = mon("a", { player: false }), def = mon("target");
  setup(atk, def);
  const stages = () => def.summonData.statStages.join();
  const before = stages();
  const seen = ask(scene, t => {
    const t2 = t.assuming([{ mon: def, stages: { 2: 2 } }]);
    const asked = [];
    const orig = def.getAttackDamage;
    def.getAttackDamage = o => { asked.push(stages()); return orig.call(def, o); };
    t2.outcome(atk, def, pmOf(tripleAxel));
    def.getAttackDamage = orig;
    return { asked, after: stages() };
  });
  assert.ok(seen.asked.length && seen.asked.every(s => s !== before), `the assumption is on while the game is asked (${seen.asked})`);
  assert.equal(seen.after, before, "and off again as soon as it has answered");
  assert.equal(stages(), before, "the mon is left as it was found");

  let dead;
  ask(scene, t => { dead = t; return null; });
  assert.throws(() => dead.outcomes(atk, def), /after its callback/, "a turn used after its callback throws");
}

// ---- A speed tie reads the draw the turn's own shuffle makes (game-code.md §5)
{
  const ours = mon("ours", { player: true }), theirs = mon("theirs", { player: false });
  setup(ours, theirs);
  const tieScene = (over = {}) => ({ ...scene, waveSeed: "w", executeWithSeedOffset: fn => fn(),
    currentBattle: { ...scene.currentBattle, double: false, turn: 3 }, ...over });
  const tie = (draw, over) => {
    const rnd = Phaser.Math.RND;
    const had = Object.prototype.hasOwnProperty.call(rnd, "integerInRange"), orig = rnd.integerInRange;
    rnd.integerInRange = () => draw;
    try { return ask(tieScene(over), t => t.speedTie(ours, theirs)); }
    finally { if (had) rnd.integerInRange = orig; else delete rnd.integerInRange; }
  };
  assert.equal(tie(1), 1, "the queue's order stands: ours first");
  assert.equal(tie(0), 0, "the shuffle swaps them: theirs first");
  assert.equal(tie(0, { arena: { tags: [], getTag: t => t === "TRICK_ROOM" } }), 1, "Trick Room reverses the tie too");
  assert.equal(tie(0, { currentBattle: { ...scene.currentBattle, double: true, turn: 3 } }), null, "doubles: nothing settles it");
  assert.equal(ask(tieScene({ executeWithSeedOffset: undefined }), t => t.speedTie(ours, theirs)), null, "nor a scene that can't be asked");
}

// ---- `hits` keeps its record shape: expected damage for ours, the max roll for a foe's
{
  const ours = mon("ours", { moves: [bigHit, move(10, "Growl", 0, 0, { cat: 2 })] });
  const foe = mon("foe", { player: false, moves: [bigHit] });
  setup(ours, foe);
  const mine = hits(ours, foe);
  assert.equal(mine.length, 1, "status moves skipped");
  assert.deepEqual(Object.keys(mine[0]).filter(k => ["name", "type", "cat", "e", "dmg", "spread", "priority"].includes(k)).sort(), ["cat", "dmg", "e", "name", "priority", "spread", "type"]);
  assert.ok(mine[0].dmg < 120 && mine[0].dmg > 102);
  assert.ok(hits(foe, ours, true)[0].dmg >= 120, "foe damage is the max roll (crit-weighted rolls don't lower it)");
  assert.equal(moveOutcomes(scene, ours, foe).length, 1);
  JSON.stringify(mine);
}

// ---- Present, Psywave, fixed damage, OHKO and Disguise are read off the game's own branches, and 10 hits stay cheap
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
      // `PresentPowerAttr`'s own branch (game-code.md §4).
      const td = args.source.turnData ?? {};
      const first = td.hitCount === td.hitsLeft;
      const seed = Phaser.Math.RND.integerInRange?.(0, (first ? 100 : 80) - 1) ?? 0;
      return { cancelled: false, result: 1, damage: seed <= 40 ? 40 : seed <= 70 ? 80 : seed <= 80 ? 120 : 0 };
    }
    if (mv.attrs.some(a => a instanceof FixedDamageAttr)) return { cancelled: false, result: 1, damage: 50 };
    if (mv.attrs.some(a => a instanceof OneHitKOAttr)) return { cancelled: false, result: 6, damage: this.hp };
    return realDamage.call(this, args);
  };
  setup(atk, def);
  const present = moveOutcome(scene, atk, def, pmOf(move(11, "Present", 0, 0, { attrs: [new PresentPowerAttr()] })), { crit: false });
  near(present.expected, 0.41 * avgRoll(40) + 0.3 * avgRoll(80) + 0.1 * avgRoll(120), "Present expected");
  assert.equal(present.max, 120);
  // Out-of-range seeds once read as 40 / 30 / 10 / 20 % and left every row at ~1 damage (#178).
  near(present.use.find(u => u.d === 0)?.p ?? 0, 0.19, "Present heals 19 % of the time");
  assert.ok(present.use.every(u => u.d !== 1), "no row falls back to a powerless 1 damage");
  assert.equal(Object.prototype.hasOwnProperty.call(Phaser.Math.RND, "integerInRange"), false, "RNG pin removed");
  const psy = moveOutcome(scene, atk, def, pmOf(move(12, "Psywave", 13, 1, { attrs: [new PsywaveAttr(), new RandomLevelDamageAttr()] })));
  assert.ok(Math.abs(psy.expected - 50) < 1, `Psywave ~ level: ${psy.expected}`);
  // Multi-Lens once added a full strike to a fixed-damage move: two 75s, not 56 + 18 (#178, game-code.md §1).
  const psywave = move(12, "Psywave", 13, 1, { attrs: [new PsywaveAttr(), new RandomLevelDamageAttr()] });
  const lensAtk = mon("lens-a", { items: [held("PokemonMultiHitModifier")] });
  setup(lensAtk, def);
  const psyLens = moveOutcome(scene, lensAtk, def, pmOf(psywave));
  assert.equal(psyLens.dist[0].n, 2, "one lens adds a strike");
  assert.deepEqual(psyLens.perHit.map(h => h.max), [56, 18], "0.75 then 0.25 of the level-1.5 roll");
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

// ---- The endure token rolls on the pre-clamp hit, so a two-strike move faces two rolls (game-code.md §3)
{
  const atk = mon("a");
  const boss = mon("endureboss", { hp: 200, maxHp: 200, boss: 2, player: false });
  scene.enemyModifiers.push(held("EnemyEndureChanceModifier", { chance: 50 }));
  setup(atk, boss);
  const twin = move(20, "Twin Nuke", 0, 250, { attrs: [new MultiHitAttr(MultiHitType.TWO)] });
  const o = moveOutcome(scene, atk, boss, pmOf(twin), { crit: false });
  assert.equal(o.dist[0].n, 2);
  near(o.pKo, 0.25, "both rolls have to miss the token");
  scene.enemyModifiers.length = 0;
}

// ---- Lock-On covers only the mon it was aimed at (game-code.md §5)
{
  const sniper = mon("sniper", { tags: ["IGNORE_ACCURACY"] });
  sniper.getLastXMoves = () => [{ move: MoveId.LOCK_ON, targets: [2] }];
  const aimed = mon("aimed", { player: false, bi: 2 });
  const other = mon("other", { player: false, bi: 3 });
  const shaky = move(21, "Shaky", 0, 100, { acc: 50 });
  setup(sniper, aimed);
  assert.equal(moveOutcome(scene, sniper, aimed, pmOf(shaky), { crit: false }).acc, 1, "the locked-on target is a sure hit");
  setup(sniper, other);
  assert.equal(moveOutcome(scene, sniper, other, pmOf(shaky), { crit: false }).acc, 0.5, "the foe it wasn't aimed at rolls");
  const blind = mon("blind", { tags: ["IGNORE_ACCURACY"] });
  setup(blind, other);
  assert.equal(moveOutcome(scene, blind, other, pmOf(shaky), { crit: false }).acc, 1, "no history: the tag stands");
}

assert.equal(moveOutcome.lastError, undefined, `game path threw: ${moveOutcome.lastError?.stack}`);

// ---- Turn-end HP is the signed change between this turn's moves and the next command
{
  const p = mon("berry", { hp: 90, maxHp: 200, items: [new BerryModifier(0), new BerryModifier(2), new TurnHealModifier()] });
  assert.equal(endOfTurnHp(p, { s: scene }), 50 + 12);
  assert.equal(endOfTurnHp(p, { s: scene, tookSuperEffective: true, hp: 60 }), 50 + 50 + 12);
  assert.equal(endOfTurnHp(p, { s: scene, hp: 150 }), 12, "Sitrus waits for half HP");
  assert.equal(endOfTurnHp(p, { s: scene, hp: 195 }), 5, "capped at max HP");
  assert.equal(endOfTurnHp(p, { s: scene, hp: 0 }), 0);
}

// ---- Turn-end chip and heals land in the game's order and amounts (game-code.md §21)
{
  const at = (weatherType = 0, terrainType = 0, extra = {}) => ({ ...scene, arena: { tags: [], weather: weatherType ? { weatherType } : null, terrain: terrainType ? { terrainType } : null }, ...extra });
  const [SUN, RAIN, SAND, HAIL] = [1, 2, 3, 4];
  const m = (opts = {}) => mon("m", { hp: 100, maxHp: 160, ...opts });
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
  const drySkin = [abAttr("PostWeatherLapseHealAbAttr", { healFactor: 2, weatherTypes: [RAIN, 7] }), abAttr("PostWeatherLapseDamageAbAttr", { damageFactor: 2, weatherTypes: [SUN, 8] })];
  assert.equal(endOfTurnHp(m({ attrs: [abAttr("PostWeatherLapseHealAbAttr", { healFactor: 1, weatherTypes: [RAIN, 7] })] }), { s: at(RAIN) }), 10, "Rain Dish");
  assert.equal(endOfTurnHp(m({ attrs: drySkin }), { s: at(RAIN) }), 20, "Dry Skin in rain");
  assert.equal(endOfTurnHp(m({ attrs: drySkin }), { s: at(SUN) }), -20, "Dry Skin in sun");
  assert.equal(endOfTurnHp(m({ attrs: drySkin }), { s: at() }), 0, "Dry Skin without weather");
  assert.equal(endOfTurnHp(m({ status: { effect: 1 } }), { s: at() }), -20, "poison");
  assert.equal(endOfTurnHp(m({ status: { effect: 2, toxicTurnCount: 2 } }), { s: at() }), -30, "toxic, third turn");
  assert.equal(endOfTurnHp(m({ status: { effect: 6 } }), { s: at() }), -10, "burn");
  assert.equal(endOfTurnHp(m({ status: { effect: 6 }, attrs: [abAttr("ReduceBurnDamageAbAttr", { multiplier: 0.5 })] }), { s: at() }), -5, "Heatproof");
  assert.equal(endOfTurnHp(m({ status: { effect: 1 }, abilities: ["BlockNonDirectDamageAbAttr"] }), { s: at() }), 0, "Magic Guard vs poison");
  const poisonHeal = [abAttr("BlockStatusDamageAbAttr", { effects: [1, 2] }), abAttr("PostTurnStatusHealAbAttr", { effects: [1, 2] })];
  assert.equal(endOfTurnHp(m({ status: { effect: 2, toxicTurnCount: 4 }, attrs: poisonHeal }), { s: at() }), 20, "Poison Heal");
  assert.equal(endOfTurnHp(m({ status: { effect: 6 }, attrs: poisonHeal }), { s: at() }), -10, "Poison Heal doesn't cover burn");
  assert.equal(endOfTurnHp(m({ items: [held("TurnStatusEffectModifier", { effect: 2 })] }), { s: at() }), -10, "Toxic Orb");
  assert.equal(endOfTurnHp(m({ types: [8], items: [held("TurnStatusEffectModifier", { effect: 2 })] }), { s: at() }), 0, "Toxic Orb on Steel");
  assert.equal(endOfTurnHp(m({ items: [held("TurnStatusEffectModifier", { effect: 6 })] }), { s: at() }), -10, "Flame Orb");
  const sitrus = [new BerryModifier(0), new TurnHealModifier()];
  assert.equal(endOfTurnHp(m({ hp: 90, items: sitrus }), { s: at(SAND) }), -10 + 10, "80/160 isn't below half");
  assert.equal(endOfTurnHp(m({ hp: 85, items: sitrus }), { s: at(SAND) }), -10 + 40 + 10, "75/160 is");
  // Sitrus eats before the poison chip lands (game-code.md §21).
  assert.equal(endOfTurnHp(m({ hp: 5, items: sitrus, status: { effect: 1 } }), { s: at() }), 40 - 20 + 10, "Sitrus beats the poison chip");
  assert.equal(endOfTurnHp(m({ hp: 5, maxHp: 400, items: sitrus, status: { effect: 1 } }), { s: at(SAND) }), -5, "the weather chip faints it first");
  const justOver = mon("just over", { hp: 99, maxHp: 200, items: [new BerryModifier(0)] });
  assert.equal(endOfTurnHp(justOver, { s: at() }), 0, "99/200 rounds to 50 %");
  assert.equal(endOfTurnHp(mon("just under", { hp: 98, maxHp: 200, items: [new BerryModifier(0)] }), { s: at() }), 50, "98/200 rounds to 49 %");
  const unnerve = mon("unnerve", { player: false, abilities: ["PreventBerryUseAbAttr"] });
  const hungry = m({ hp: 5, items: sitrus });
  assert.equal(endOfTurnHp(hungry, { s: at(0, 0, { getField: () => [hungry, unnerve] }) }), 10, "Unnerve keeps the Sitrus down");
  assert.equal(endOfTurnHp(m(), { s: at(0, 3) }), 10, "Grassy Terrain");
  assert.equal(endOfTurnHp(m({ types: [2] }), { s: at(0, 3) }), 0, "Flying isn't grounded");
  const waveHeal = at(0, 0, { enemyModifiers: [held("EnemyTurnHealModifier", {}, 3)] });
  assert.equal(endOfTurnHp(m({ player: false }), { s: waveHeal }), 9, "enemy turn heal ×3");
  assert.equal(endOfTurnHp(m(), { s: waveHeal }), 0, "not for the player");
  assert.equal(endOfTurnHp(m({ hp: 20, maxHp: 40, player: false }), { s: waveHeal }), 1, "the 1 HP floor covers all stacks");
  assert.equal(endOfTurnHp(m({ items: [held("HitHealModifier", {}, 2)] }), { s: at(), dealt: 100 }), 24, "Shell Bell ×2");
  assert.equal(endOfTurnHp(m({ items: [held("HitHealModifier")] }), { s: at() }), 0, "Shell Bell without damage");
  // Shell Bell heals in `MoveEffectPhase`, so Sitrus reads the HP after it (game-code.md §8).
  assert.equal(endOfTurnHp(m({ hp: 70, items: [new BerryModifier(0)] }), { s: at() }), 40, "70/160 eats the berry");
  assert.equal(endOfTurnHp(m({ hp: 70, items: [new BerryModifier(0), held("HitHealModifier")] }), { s: at(), dealt: 80 }), 10, "Shell Bell lifts it over the bar first");

  // Every turn-end heal is a `PokemonHealPhase`, which Heal Block and Healing Charm reach (game-code.md §21).
  assert.equal(endOfTurnHp(m({ tags: ["HEAL_BLOCK"], items: [new TurnHealModifier()] }), { s: at() }), 0, "Heal Block");
  const charmed = at(0, 0, { modifiers: [held("HealingBoosterModifier", { multiplier: 1.1 }, 2)] });
  assert.equal(endOfTurnHp(m({ items: [new TurnHealModifier()] }), { s: charmed }), 12, "Healing Charm ×2 on Leftovers");
  assert.equal(endOfTurnHp(m({ player: false, items: [new TurnHealModifier()] }), { s: charmed }), 10, "which is the player's, not the foe's");
  assert.equal(endOfTurnHp(m({ hp: 155, player: false }), { s: at(0, 0, { enemyModifiers: [held("EnemyTurnHealModifier", {}, 3)] }) }), 4, "the token stops at max − 1");

  // The TURN_END battler tags, read by class (game-code.md §21).
  const tag = name => new ({ [name]: class {} })[name]();
  class DamagingTrapTag {}
  class BindTag extends DamagingTrapTag {}
  assert.equal(endOfTurnHp(m({ battlerTags: [tag("NightmareTag")] }), { s: at() }), -40, "Nightmare");
  assert.equal(endOfTurnHp(m({ battlerTags: [tag("CursedTag")] }), { s: at() }), -40, "Curse");
  assert.equal(endOfTurnHp(m({ battlerTags: [new BindTag()] }), { s: at() }), -20, "a binding move");
  assert.equal(endOfTurnHp(m({ battlerTags: [tag("SaltCuredTag")] }), { s: at() }), -10, "Salt Cure");
  assert.equal(endOfTurnHp(m({ types: [10], battlerTags: [tag("SaltCuredTag")] }), { s: at() }), -20, "Salt Cure on a Water mon");
  assert.equal(endOfTurnHp(m({ battlerTags: [tag("AquaRingTag")] }), { s: at() }), 10, "Aqua Ring");
  assert.equal(endOfTurnHp(m({ abilities: ["BlockNonDirectDamageAbAttr"], battlerTags: [tag("NightmareTag")] }), { s: at() }), 0, "Magic Guard vs Nightmare");
  const seed = Object.assign(tag("SeedTag"), { sourceIndex: 1 });
  const seeder = mon("seeder", { hp: 50, maxHp: 160, bi: 1 });
  const seeded = mon("seeded", { hp: 160, maxHp: 160, player: false, battlerTags: [seed], bi: 2 });
  const seedField = at(0, 0, { getField: () => [seeder, seeded] });
  assert.equal(endOfTurnHp(seeded, { s: seedField }), -20, "the seed takes a 1/8");
  assert.equal(endOfTurnHp(seeder, { s: seedField }), 20, "and hands it over");
  const oozed = mon("oozed", { hp: 160, maxHp: 160, player: false, abilities: ["ReverseDrainAbAttr"], battlerTags: [seed], bi: 2 });
  assert.equal(endOfTurnHp(seeder, { s: at(0, 0, { getField: () => [seeder, oozed] }) }), -20, "Liquid Ooze sends it back");
  // Bad Dreams' `apply` asks the holder's Magic Guard (game-code.md §21).
  const sleeper = m({ status: { effect: 4 } });
  const dreamer = mon("dreamer", { player: false, abilities: ["PostTurnHurtIfSleepingAbAttr"] });
  assert.equal(endOfTurnHp(sleeper, { s: at(0, 0, { getField: () => [sleeper, dreamer] }) }), -20, "Bad Dreams");
  const guarded = mon("guarded dreamer", { player: false, abilities: ["PostTurnHurtIfSleepingAbAttr", "BlockNonDirectDamageAbAttr"] });
  assert.equal(endOfTurnHp(sleeper, { s: at(0, 0, { getField: () => [sleeper, guarded] }) }), 0, "a Magic Guard holder deals none");
}

// ---- A Reviver Seed turns a lethal hit into half HP
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

// ---- Primordial weather and Psychic Terrain stop a move before the damage step (game-code.md §14)
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
  // `flags: 2` is `MoveFlags.IGNORE_PROTECT`.
  const feint = move(364, "Feint", 0, 30, { flags: 2 });
  assert.equal(moveOutcome(scene, atk, def, pmOf(feint)).bypassProtect, true, "Feint goes through Protect");
  assert.equal(moveOutcome(scene, atk, def, pmOf(bigHit)).bypassProtect, false);
}

// ---- Status moves: the usable ones with their accuracy, and 0 effectiveness where the target is immune
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

// ---- Outside the command phase no game code runs, and the approximation still answers
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

// ---- Drain is a share of the damage dealt, which Heal Block, Healing Charm and Liquid Ooze change (game-code.md §18)
{
  const hitHeal = (healRatio, healStat = null) => abAttr("HitHealAttr", { healRatio, healStat });
  const gigaDrain = move(202, "Giga Drain", 11, 75, { cat: 1, attrs: [hitHeal(0.5)] });
  const kiss = move(577, "Draining Kiss", 17, 50, { cat: 1, attrs: [hitHeal(0.75)] });
  const drainOf = (atk, def, mv) => { setup(atk, def); return moveOutcome(scene, atk, def, pmOf(mv), { crit: false }); };
  const plain = drainOf(mon("venusaur"), mon("target"), gigaDrain);
  assert.equal(plain.drain, 0.5, "Giga Drain heals half");
  assert.ok(plain.notes.includes("drains 50%"), `named: ${plain.notes}`);
  assert.equal(drainOf(mon("comfey"), mon("target"), kiss).drain, 0.75, "Draining Kiss heals three quarters");
  assert.equal(drainOf(mon("venusaur"), mon("target"), bigHit).drain, 0, "no drain on a plain hit");
  assert.equal(drainOf(mon("tangela", { tags: ["HEAL_BLOCK"] }), mon("target"), gigaDrain).drain, 0, "Heal Block");
  const ooze = drainOf(mon("venusaur"), mon("tentacruel", { abilities: ["ReverseDrainAbAttr"] }), gigaDrain);
  assert.equal(ooze.drain, -0.5, "Liquid Ooze turns the heal into damage");
  assert.ok(ooze.notes.includes("Liquid Ooze: Giga Drain hurts 50%"), `named: ${ooze.notes}`);
  assert.equal(drainOf(mon("clefable", { abilities: ["BlockNonDirectDamageAbAttr"] }), mon("tentacruel", { abilities: ["ReverseDrainAbAttr"] }), gigaDrain).drain, 0, "Magic Guard ignores the ooze");
  scene.modifiers = [held("HealingBoosterModifier", { multiplier: 1.1 }, 2)];
  near(drainOf(mon("venusaur"), mon("target"), gigaDrain).drain, 0.6, "Healing Charm ×2: ×1.2");
  near(drainOf(mon("foe", { player: false }), mon("target"), gigaDrain).drain, 0.5, "the charm is the player's");
  delete scene.modifiers;
  const sap = move(668, "Strength Sap", 11, -1, { cat: 2, attrs: [hitHeal(null, 1)] });
  assert.equal(drainOf(mon("venusaur"), mon("target"), { ...sap, category: 1, power: 10 }).drain, 0, "a heal by a stat isn't a drain");
}

// ---- The KO curve plays each use through the target's HP, bars, heals, chip and saves
{
  const round = by => by.map(x => Math.round(x * 1000) / 1000);
  const sure = (d, n) => [{ d, p: 1, ...(n ? { n } : {}) }];
  const seed = held("PokemonInstantReviveModifier");
  const boss3 = (hp = 300) => mon("boss3", { hp, maxHp: 300, boss: 3, player: false });
  // [what, target, use, options, P(down) by use]
  const TABLE = [
    ["plain 2HKO", mon("t", { hp: 100 }), sure(60), {}, [0, 1]],
    ["a bar stops a hit at its boundary", mon("b", { hp: 200, boss: 2, player: false }), sure(150), {}, [0, 1]],
    ["hits of a multi-hit use clamp one by one", boss3(250), sure(150, 3), {}, [0, 1]],
    ["…where one hit of the same total wastes its overflow at each bar", boss3(250), sure(150), {}, [0, 0, 1]],
    ["a hit past a bar by twice its size breaks two", boss3(), sure(350), {}, [0, 1]],
    ["heals only on turns survived", mon("t", { hp: 100 }), sure(60), { turnEnd: 30 }, [0, 0, 1]],
    ["chip counts on the KO turn", mon("t", { hp: 250 }), sure(64.3), { turnEnd: -61 }, [0, 1]],
    ["hit and chip finish it this turn", mon("t", { hp: 40 }), sure(30), { turnEnd: -10 }, [1]],
    ["chip alone", mon("t", { hp: 100 }), sure(0), { turnEnd: -30 }, [0, 0, 0, 1]],
    // 200 → 120 → 100 (the bar) → 20 → down; without bars it would go on the third.
    ["a bar also stops chip", mon("b", { hp: 200, boss: 2, player: false }), sure(0), { turnEnd: -80 }, [0, 0, 0, 1]],
    ["Reviver Seed: a second life at half HP", mon("t", { hp: 100, maxHp: 200, items: [seed] }), sure(100), {}, [0, 1]],
    ["firstKo sets use 1, the rolls the HP after it", mon("t", { hp: 100 }), [{ d: 90, p: 0.5 }, { d: 110, p: 0.5 }], { firstKo: 0.2 }, [0.2, 1]],
    ["a wild boss's Def rises as a bar breaks", mon("b", { hp: 200, boss: 2, player: false }), sure(100), { cat: "physical" }, [0, 0, 1]],
    ["…a trainer's doesn't", Object.assign(mon("b", { hp: 200, boss: 2, player: false }), { hasTrainer: () => true }), sure(100), { cat: "physical" }, [0, 1]],
    ["lost turns deal nothing", mon("t", { hp: 100 }), sure(100), { act: i => (i === 0 ? 0.5 : 1) }, [0.5, 1]],
  ];
  for (const [what, target, use, opts, want] of TABLE) {
    setup(mon("a"), target);
    const by = round(koCurve(target, use, opts).by);
    assert.deepEqual(by.slice(0, want.length), want, `${what}: ${by}`);
    assert.equal(by[want.length - 1], 1, `${what}: down by then`);
  }
  // Three hits of 50 take the 3-bar boss 250 → 100; one hit of 150 stops at the bar, on 200.
  const b = boss3(250);
  const three = [50, 50, 50].reduce(hitOn, stateOf(b));
  assert.deepEqual([three.hp, three.bar], [100, 0]);
  assert.deepEqual([hitOn(stateOf(b), 150).hp, hitOn(stateOf(b), 150).bar], [200, 1]);
  assert.equal(hitOn(stateOf(boss3()), 500).hp, 0, "a big enough hit KOs through the bars");
  scene.currentBattle.isClassicFinalBoss = true;
  const eternatus = mon("eternatus", { hp: 100, player: false });
  assert.equal(hitOn(stateOf(eternatus), 999).hp, 1, "final boss floor");
  assert.ok(koCurve(eternatus, sure(999)).by.every(x => x === 0), "never down");
  delete scene.currentBattle.isClassicFinalBoss;
  assert.deepEqual(koCurve(mon("t", { hp: 100 }), sure(10), { turnEnd: 30 }).after1.map(x => x.hp), [100]);
  assert.deepEqual(koCurve(mon("b", { hp: 200, boss: 2, player: false }), sure(150)).after1.map(x => [x.hp, x.bar]), [[100, 0]]);
  // A boss's status chip is clamped at the bar (game-code.md §3).
  assert.deepEqual(koCurve(mon("bar", { hp: 220, maxHp: 400, boss: 2, player: false }), sure(0), { turnEnd: -30 }).after1.map(x => [x.hp, x.bar]), [[200, 0]]);
  // `start`: an earlier turn's branches.
  assert.deepEqual(round(koCurve(mon("t", { hp: 100 }), sure(60), { start: [{ hp: 50, p: 0.5 }, { hp: 100, p: 0.5 }] }).by).slice(0, 2), [0.5, 1]);
  scene.enemyModifiers = [held("EnemyEndureChanceModifier", { chance: 50 })];
  const tough = mon("tough", { hp: 100, player: false });
  assert.deepEqual(round(koCurve(tough, sure(300)).by).slice(0, 2), [0.5, 1], "once a wave");
  assert.deepEqual(round(koCurve(tough, sure(600, 2)).by).slice(0, 2), [0.5, 1], "the rest of that use too");
  scene.enemyModifiers = [];
  assert.deepEqual(koCurve(boss3(), sure(100)).perChunk, [1, 1, 1]);
  assert.deepEqual(koCurve(boss3(), sure(60)).perChunk, [2, 2, 2]);
  assert.equal(koTurn([0.4, 0.6, 1]), 2);
  near(koTurns([0.4, 0.6, 1, 1, 1, 1, 1, 1, 1]), 2, "expected use");
  assert.equal(koTurn([0.5, 1]), 1);
  near(koTurns([0.5, 1, 1, 1, 1, 1, 1, 1, 1]), 1.5, "a coin flip on use 1");

  const atk = mon("weavile", { player: false }), def = mon("target");
  setup(atk, def);
  const ta = moveOutcome(scene, atk, def, pmOf(tripleAxel), { crit: false });
  assert.equal(ta.use.find(x => x.d === 0).n, 0);
  assert.ok(ta.use.every(x => x.d === 0 || (x.n > 1 - 1e-9 && x.n < 3 + 1e-9)), `hit counts ${JSON.stringify(ta.use)}`);
  assert.ok(ta.use.some(x => Math.round(x.n) === 2) && ta.use.some(x => Math.round(x.n) === 3), "two-hit and three-hit uses stay apart");
  assert.ok(useOf({ max: 100, acc: 1, dist: [{ n: 2, p: 0.6 }, { n: 3, p: 0.4 }], perHit: [{ max: 50 }, { max: 50 }, { max: 50 }] }).every(x => x.n === 2));
  near(useOf({ dmg: 100 }).reduce((t, x) => t + x.p, 0), 1, "a hits record rolls its damage");
  const o = { max: 100, pKo: 0.2, acc: 1, targetHp: 150 };
  assert.deepEqual([koChanceAt(o, 150), koChanceAt(o, 200), koChanceAt(o, 101)], [0.2, 0.2, 0]);
  near(koChanceAt(o, 90), 10 / 15 + 1 / 16, "into the roll range");
  assert.equal(koChanceAt({ ...o, live: false }, 90), 1, "an estimate is all or nothing");
  assert.equal(koChanceAt({ ...o, revive: 50 }, 90), 0, "a Reviver Seed");
}

// ---- The record carries the move's traits, and costs worded with this matchup's amounts
{
  const recoiler = move(38, "Double-Edge", 0, 120, { attrs: [Object.assign(new (class RecoilAttr {})(), { damageRatio: 0.33 })] });
  const hyperBeam = move(63, "Hyper Beam", 0, 150, { attrs: [new (class RechargeAttr {})()] });
  const atk = mon("user", { maxHp: 400, moves: [hyperBeam] }), def = mon("target", { player: false });
  setup(atk, def);
  const rec = moveOutcome(scene, atk, def, pmOf(recoiler), { crit: false });
  assert.deepEqual(rec.traits.recoil, { ratio: 0.33, useHp: false, blocked: false }, "the traits ride on the record");
  near(rec.self, rec.expected * 0.33, "recoil off the damage this matchup deals");
  assert.deepEqual(rec.costs, [`recoil \u2248\u2212${Math.round(rec.self / 400 * 100)}%`], "...and the wording carries its share of max HP");
  const beam = moveOutcome(scene, atk, def, pmOf(hyperBeam), { crit: false });
  assert.ok(beam.traits.recharge && beam.costs.includes("recharge turn"), `recharge: ${beam.costs}`);
  assert.ok(!beam.notes.includes("recharge turn"), "a cost is in `costs`, not mixed into the notes");
  phaseName = "MovePhase";
  setup(atk, def);
  const rough = moveOutcomes(scene, atk, def).find(o => o.name === "Hyper Beam");
  phaseName = "CommandPhase";
  assert.ok(rough.traits.recharge && rough.costs.includes("recharge turn"), `estimate: ${JSON.stringify(rough.costs)}`);
  console.log(`traits: ${rec.costs.join(" \u00b7 ")} | ${beam.costs.join(" \u00b7 ")}`);
}

// ---- The page's game version, compared segment by segment
{
  assert.equal(gameVersionOf(scene), "1.12.0.11");
  assert.equal(gameVersionOf(null), null);
  assert.equal(versionAtLeast("1.12.0.11", "1.12.0.11"), true, "at the version counts as at least it");
  assert.equal(versionAtLeast("1.12.0.11", "1.12.0.12"), false);
  assert.equal(versionAtLeast("1.12.1", "1.12.0.99"), true, "compared segment by segment, not as text");
  assert.equal(versionAtLeast("1.13", "1.12.9.9"), true, "a missing segment is 0");
  assert.equal(versionAtLeast(null, "1.0.0"), false, "an unreadable version is older than everything");
}

// ---- A fixed-damage hit goes through a full-HP Sturdy and a rolled hit doesn't (game-code.md §1)
{
  // Upstream PR 7620 flips this, and the version constant flips with it.
  class FixedDamageAttr {}
  const atk = mon("tosser");
  const pineco = mon("pineco", { hp: 40, abilities: ["PreDefendFullHpEndureAbAttr"] });
  const real = pineco.getAttackDamage;
  pineco.getAttackDamage = function (args) {
    return args.move.attrs.some(a => a instanceof FixedDamageAttr)
      ? { cancelled: false, result: 1, damage: 50 } : real.call(this, args);
  };
  setup(atk, pineco);
  const toss = moveOutcome(scene, atk, pineco, pmOf(move(64, "Seismic Toss", 1, 1, { attrs: [new FixedDamageAttr()] })));
  assert.equal(toss.pKo, 1, "fixed damage goes through Sturdy");
  assert.equal(toss.max, 40);
  assert.ok(!toss.notes.includes("sturdy"), `no sturdy note on a fixed hit: ${toss.notes}`);
  const rolled = moveOutcome(scene, atk, pineco, pmOf(move(65, "Nuke", 0, 300)), { crit: false });
  assert.equal(rolled.pKo, 0, "Sturdy still holds a rolled hit");
  assert.ok(rolled.notes.includes("sturdy"));
}

// ---- False Swipe caps each roll, rather than spreading the rolls under the capped max
{
  const atk = mon("swiper");
  const prey = mon("prey", { hp: 100 });
  setup(atk, prey);
  const swipe = moveOutcome(scene, atk, prey, pmOf(move(66, "False Swipe", 0, 110, { attrs: [new SurviveDamageAttr()] })), { crit: false });
  assert.equal(swipe.pKo, 0, "False Swipe never KOs");
  assert.equal(swipe.max, 99, "the cap is the max roll");
  assert.equal(swipe.perHit[0].min, 93, "the lowest roll is the game's, not 85 % of the cap");
  near(swipe.expected, (93 + 94 + 95 + 96 + 97 + 99 * 11) / 16, "every roll is capped, so the mean sits just under 99");
  const plain = moveOutcome(scene, atk, prey, pmOf(move(67, "Cut", 0, 110)), { crit: false });
  assert.equal(plain.perHit[0].min, Math.floor(110 * 0.85), "an uncapped move keeps the cheap spread");
  near(plain.pKo, 10 / 16, "...and reaches on 10 of its 16 rolls the KO the cap denies");
  console.log(`false swipe: ${swipe.perHit[0].min}–${swipe.max} of ${prey.hp} HP, pKo ${swipe.pKo}`);
}

console.log("damage: ok");
