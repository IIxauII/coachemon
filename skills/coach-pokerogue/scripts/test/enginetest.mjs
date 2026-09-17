// Engine scenarios against the real 10-damage, 20-enemy-ai, 30-planner and 35-team-plan code on mocked game objects:
// moves the user can't pick, charge / recharge turns, a move's own costs (contact chip, recoil, Steel Beam, crash,
// self-KO, lock-in, stat drops, can't repeat), status and semi-invulnerability in the threat model, and the planner
// during a faint replacement. Prints one line per check, so run.mjs keeps a golden of the numbers.
// Usage: node test/enginetest.mjs
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

// Attr / condition stand-ins: the HUD identifies them by class name.
class MultiHitAttr { constructor(t) { this.multiHitType = t; } }
class RechargeAttr {}
class PreUseInterruptAttr {}
class RecoilAttr { constructor(useHp = false, damageRatio = 0.25, unblockable = false) { Object.assign(this, { useHp, damageRatio, unblockable }); } }
class HalfSacrificialAttr {}
class SacrificialAttr {}
class FrenzyAttr {}
class MissEffectAttr {}
class StatStageChangeAttr { constructor(stats, stages, selfTarget) { Object.assign(this, { stats, stages, selfTarget }); } }
class HitsTagAttr { constructor(tagType) { this.tagType = tagType; } }
class InstantChargeAttr { constructor(condition) { this.condition = condition; } }
class SemiInvulnerableAttr {}
class FirstMoveCondition {}
class PostDefendContactDamageAbAttr { constructor(r) { this.damageRatio = r; } }
class BattlerTag { constructor(tagType, turnCount = 1) { Object.assign(this, { tagType, turnCount }); } }
class SemiInvulnerableTag extends BattlerTag {}

// Damage per hit is the move's power unless a scenario's table says otherwise ("attacker>move>defender").
let TABLE = {};
const move = (id, name, power, { type = 0, cat = 0, acc = 100, attrs = [], flags = 0, cond = null, charging = false, chargeAttrs = [], conditions = [], restrictions = [], priority = 0 } = {}) => {
  const mv = {
    id, name, type, power, accuracy: acc, category: cat, moveTarget: 3, priority, flags, attrs, chance: -1, conditions, conditionsSeq2: [], conditionsSeq3: [], restrictions, chargeAttrs,
    hasFlag: f => !!(flags & f), getPriority: () => priority, calculateBattleAccuracy: () => acc,
    isChargingMove: () => charging, hasAttr: n => attrs.some(a => a.constructor.name === n), getAttrs: () => [], is: n => n === "AttackMove" && cat !== 2,
    applyConditions: (u, t) => (cond ? cond(u, t) : true),
    getUserBenefitScore: () => 0, getTargetBenefitScore: () => -power / 5,
  };
  return mv;
};
const pmOf = (mv, usable = true) => ({ moveId: mv.id, getMove: () => mv, getName: () => mv.name, getMovePp: () => 10, ppUsed: 0, isUsable: () => [usable, ""] });

const mon = (name, { hp = 300, maxHp = hp, player = true, field = true, moves = [], ability = null, abilities = [], status = null, tags = {}, semi = null, spe = 100, level = 50 } = {}) => {
  const p = {
    id: name, name, level, hp, status, aiType: 2, trainerSlot: 0, species: { legendary: false },
    getMaxHp: () => maxHp, isPlayer: () => player, isOnField: () => field, isActive: () => field, isBoss: () => false,
    getBattlerIndex: () => (field ? (player ? 0 : 2) : -1), getFieldIndex: () => 0,
    getTypes: () => [0], isOfType: () => false, getAbility: () => ability ?? { name: "x", getAttrs: () => [] }, hasPassive: () => false,
    getStat: i => (i === 5 ? spe : 100), getEffectiveStat: i => (i === 5 ? spe : 100),
    summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], abilitiesApplied: new Set(), tags: semi ? [semi] : [] },
    waveData: { abilitiesApplied: new Set(), abilityRevealed: true }, turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
    getHeldItems: () => [], hasAbilityWithAttr: a => abilities.includes(a), getTag: t => tags[t] ?? (semi && semi.tagType === t ? semi : null),
    getMoveType: mv => mv.type, getMoveCategory: (_, mv) => mv.category, getAccuracyMultiplier: () => 1, getCritStage: () => 0,
    getMoveEffectiveness: () => 1, getMoveQueue: () => [], isTrapped: () => false, getMatchupScore: () => 1,
    getAttackDamage({ source, move: mv, isCritical }) {
      const d = TABLE[`${source.name}>${mv.name}>${this.name}`] ?? mv.power;
      return { cancelled: false, result: 1, damage: Math.max(1, Math.floor(d * (isCritical ? 1.5 : 1))) };
    },
  };
  p.moveset = moves.map(m => (m.getMove ? m : pmOf(m)));
  p.getMoveset = () => p.moveset;
  return p;
};

let phase = { phaseName: "CommandPhase" };
let party = [], enemies = [];
let turn = 1;
const scene = {
  phaseManager: { getCurrentPhase: () => phase, queueMessage() {} },
  currentBattle: { waveIndex: 20, turn: 1, double: false, enemySwitchCounter: 0, battleSeedState: "seed", trainer: null, randSeedInt: (r, min = 0) => min },
  getField: active => {
    const f = [party.find(p => p.isOnField()), undefined, enemies.find(p => p.isOnField()), undefined];
    return active ? f.filter(Boolean) : f;
  },
  getPlayerParty: () => party, getEnemyParty: () => enemies, enemyModifiers: [],
  arena: { tags: [], getTag: () => null, isMoveWeatherCancelled: () => false, isMoveTerrainCancelled: () => false },
};
globalThis.window = globalThis;
globalThis.Phaser = {
  Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene } } } }] } } },
};
// The panel starts too, with nothing to show: the scene has no UI.
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: () => ({ style: {}, addEventListener() {} }) };
globalThis.setInterval = () => 0;
eval(bundle("hud", { expose: true }));
const hud = globalThis.__hud;
const E = { moveOutcome: hud["10-damage"].moveOutcome, moveOutcomes: hud["10-damage"].moveOutcomes, enemyMoveDistribution: hud["20-enemy-ai"].enemyMoveDistribution, threatFrom: hud["30-planner"].threatFrom,
  exchange: hud["30-planner"].exchange, duel: hud["30-planner"].duel, fieldPlan: hud["30-planner"].fieldPlan, actChance: hud["30-planner"].actChance,
  tpFight: hud["35-team-plan"].tpFight, TRAPS: hud["01-core"].TRAPS };
// Fresh field for each case: the turn number keys every per-turn cache.
const setup = (ours, foes) => {
  party = ours; enemies = foes;
  for (const p of [...ours, ...foes]) p.getOpponents = () => (p.isPlayer() ? foes : ours).filter(x => x.isOnField());
  scene.currentBattle.turn = ++turn;
};
const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const r2 = x => Math.round(x * 100) / 100;
const log = (...a) => console.log(...a);

// ---- D. Moves that can't be picked or would fail are left out; conditions that read the foe's command are kept.
{
  const fakeOut = move(252, "Fake Out", 40, { cond: () => false, conditions: [new FirstMoveCondition()] });
  const disabled = pmOf(move(2, "Slash", 70), false);
  const sucker = move(389, "Sucker Punch", 70, { cond: () => false, priority: 1 });
  const dreamEater = move(138, "Dream Eater", 100, { cat: 1, cond: (u, t) => t.status?.effect === 4 });
  const me = mon("Weavile", { moves: [fakeOut, disabled, sucker, dreamEater, move(3, "Tackle", 40)] });
  const foe = mon("Snorlax", { player: false });
  setup([me], [foe]);
  const names = E.moveOutcomes(scene, me, foe).map(o => o.name);
  log(`D usable (awake foe): ${names.join(", ")}`);
  assert.deepEqual(names, ["Sucker Punch", "Tackle"]);
  foe.status = { effect: 4, sleepTurnsRemaining: 3 };
  setup([me], [foe]);
  assert.ok(E.moveOutcomes(scene, me, foe).some(o => o.name === "Dream Eater"), "Dream Eater works on a sleeping target");
  phase = { phaseName: "MovePhase" };
  assert.equal(E.moveOutcomes(scene, me, foe).length, 5, "outside the command phase nothing is filtered by game calls");
  phase = { phaseName: "CommandPhase" };
  assert.equal(E.moveOutcome(scene, me, foe, pmOf(fakeOut)).once, true, "Fake Out is first-turn only");
}

// ---- E. What a move costs its user, with a note per cost.
{
  const barbs = { name: "Iron Barbs", getAttrs: n => (n === "PostDefendContactDamageAbAttr" ? [new PostDefendContactDamageAbAttr(8)] : []) };
  const furySwipes = move(154, "Fury Swipes", 18, { acc: 80, flags: 1, attrs: [new MultiHitAttr(1)] });
  const me = mon("Meowth", { hp: 200 });
  const ferro = mon("Ferrothorn", { player: false, hp: 1000, ability: barbs, abilities: ["PostDefendContactDamageAbAttr"] });
  setup([me], [ferro]);
  const o = E.moveOutcome(scene, me, ferro, pmOf(furySwipes), { crit: false });
  near(o.self, 25 * 3.1 * 0.8, "Iron Barbs: 1/8 max HP per landed contact hit");
  log(`E ${o.notes.join(" · ")}`);
  assert.ok(o.notes.includes("Iron Barbs: Fury Swipes ≈−31%"));
  const guard = mon("Clefable", { hp: 200, abilities: ["BlockNonDirectDamageAbAttr"] });
  setup([guard], [ferro]);
  assert.equal(E.moveOutcome(scene, guard, ferro, pmOf(furySwipes), { crit: false }).self, 0, "Magic Guard takes no chip");
  const noContact = move(155, "Bullet Seed", 25, { attrs: [new MultiHitAttr(1)] });
  setup([me], [ferro]);
  assert.equal(E.moveOutcome(scene, me, ferro, pmOf(noContact), { crit: false }).self, 0, "no contact, no chip");

  const target = mon("Blissey", { player: false, hp: 2000 });
  const cases = [
    [move(38, "Double-Edge", 120, { attrs: [new RecoilAttr(false, 0.33)] }), o => near(o.self, o.expected * 0.33, "recoil a third of damage dealt")],
    [move(796, "Steel Beam", 140, { cat: 1, acc: 95, attrs: [new HalfSacrificialAttr()] }), o => near(o.self, 100, "Steel Beam half max HP")],
    [move(136, "High Jump Kick", 130, { acc: 90, attrs: [new MissEffectAttr()] }), o => near(o.self, 100 * 0.1, "crash half max HP on a 10 % miss")],
    [move(153, "Explosion", 250, { attrs: [new SacrificialAttr()] }), o => assert.equal(o.selfKo, 1)],
    [move(200, "Outrage", 120, { attrs: [new FrenzyAttr(), new MissEffectAttr()] }), o => { assert.equal(o.lock, true); assert.equal(o.self, 0, "Outrage's miss isn't a crash"); }],
    [move(315, "Overheat", 130, { cat: 1, acc: 90, attrs: [new StatStageChangeAttr([3], -2, true)] }), o => assert.deepEqual(o.drops, { 3: -2 })],
    [move(893, "Gigaton Hammer", 160, { restrictions: [{ i18nkey: "battle:moveDisabledConsecutive" }] }), o => assert.equal(o.noRepeat, true)],
  ];
  for (const [mv, check] of cases) {
    setup([me], [target]);
    const out = E.moveOutcome(scene, me, target, pmOf(mv), { crit: false });
    check(out);
    log(`E ${out.notes.join(" · ")}`);
  }
}

// ---- A. Charge and recharge turns. Watchog into Golem: Hyper Beam 3HKO takes 5 turns (a recharge between hits);
// Body Slam's 68–80 rolls (a crit 1 in 24) 4HKO the 300 HP only 37 % of the time, so 5 hits in 5 turns — as long, but
// with no turn it can't act, so it's the pick.
{
  const hyperBeam = move(63, "Hyper Beam", 150, { cat: 1, attrs: [new RechargeAttr()] });
  const bodySlam = move(34, "Body Slam", 85);
  const golem = mon("Golem", { player: false, hp: 300, spe: 40, moves: [move(89, "Rock Throw", 10)] });
  const watchog = mon("Watchog", { hp: 300, spe: 80, moves: [hyperBeam, bodySlam] });
  TABLE = { "Watchog>Hyper Beam>Golem": 110, "Watchog>Body Slam>Golem": 80 };
  setup([watchog], [golem]);
  const hb = E.exchange(scene, watchog, watchog.moveset[0], golem);
  const bs = E.exchange(scene, watchog, watchog.moveset[1], golem);
  log(`A Hyper Beam: ${hb.hitsWe} hits in ${hb.turnsWe} turns · Body Slam: ${bs.hitsWe} hits in ${bs.turnsWe} turns`);
  assert.deepEqual([hb.hitsWe, hb.turnsWe, bs.hitsWe, bs.turnsWe], [3, 5, 5, 5]);
  assert.equal(E.duel(scene, watchog, golem).mine.name, "Body Slam");

  // Solar Beam charges a turn per hit, unless its instant-charge condition (sun) holds.
  let sunny = false;
  const solarBeam = move(76, "Solar Beam", 120, { cat: 1, charging: true, chargeAttrs: [new InstantChargeAttr(() => sunny)] });
  const bulba = mon("Venusaur", { hp: 300, spe: 80, moves: [solarBeam] });
  TABLE = { "Venusaur>Solar Beam>Golem": 110 };
  setup([bulba], [golem]);
  const dark = E.exchange(scene, bulba, bulba.moveset[0], golem);
  sunny = true;
  setup([bulba], [golem]);
  const sun = E.exchange(scene, bulba, bulba.moveset[0], golem);
  log(`A Solar Beam: ${dark.turnsWe} turns, in sun ${sun.turnsWe}`);
  assert.deepEqual([dark.turnsWe, sun.turnsWe], [6, 3]);

  // Focus Punch fails when the foe's attack lands first; Sucker Punch only works into an attack.
  const focusPunch = move(264, "Focus Punch", 400, { attrs: [new PreUseInterruptAttr()], priority: -3 });
  const sucker = move(389, "Sucker Punch", 400, { priority: 1 });
  const puncher = mon("Breloom", { hp: 300, spe: 70, moves: [focusPunch, sucker] });
  const attacker = mon("Golem", { player: false, hp: 300, spe: 40, moves: [move(89, "Rock Throw", 10)] });
  setup([puncher], [attacker]);
  const [fp, sp] = puncher.moveset.map(pm => E.exchange(scene, puncher, pm, attacker));
  const setter = mon("Golem", { player: false, hp: 300, spe: 40, moves: [move(14, "Swords Dance", 0, { cat: 2 })] });
  setup([puncher], [setter]);
  const [fpFree, spFree] = puncher.moveset.map(pm => E.exchange(scene, puncher, pm, setter));
  log(`A into an attacker: Focus Punch KO first ${r2(fp.pWeKoFirst)} in ${fp.turnsWe}, Sucker Punch ${r2(sp.pWeKoFirst)} in ${sp.turnsWe}; into a setup move: ${r2(fpFree.pWeKoFirst)} in ${fpFree.turnsWe}, ${r2(spFree.pWeKoFirst)} in ${spFree.turnsWe}`);
  assert.deepEqual([fp.turnsWe, sp.turnsWe, fpFree.turnsWe, spFree.turnsWe], [9, 1, 1, 9]);

  // Team plan: the same exchange, turn by turn.
  const T = { ours: [[{ dmg: 35, recharge: true }]], theirs: [[{ dmg: 1, e: 1 }]], first: [[0]], ourMax: [300], foeMax: [100], ourHeal: [null], foeHeal: [null] };
  const st = { oh: [300], ob: [0], fh: [100], fs: [0], fb: [0] };
  const withRecharge = E.tpFight(T, st, 0, 0, "free").turns;
  T.ours[0][0] = { dmg: 35 };
  const plain = E.tpFight(T, st, 0, 0, "free").turns;
  T.ours[0][0] = { dmg: 35, charge: true, semiCharge: true };
  const dig = E.tpFight(T, st, 0, 0, "free");
  log(`A team plan: 3 hits take ${plain} turns, ${withRecharge} with recharge, ${dig.turns} charging, taking ${300 - dig.mh} hits (none while underground)`);
  assert.deepEqual([plain, withRecharge, dig.turns, 300 - dig.mh], [3, 5, 6, 2]);
}

// ---- F. Status in the threat model: the foe's hits weighted by the chance it acts.
{
  const quake = move(89, "Earthquake", 100);
  const me = mon("Pikachu", { hp: 1000, spe: 50 });
  const base = () => mon("Garchomp", { player: false, hp: 300, spe: 100, moves: [quake] });
  const expectedWith = (edit, next = false) => {
    const foe = base();
    edit(foe);
    setup([me], [foe]);
    return E.threatFrom(scene, foe, me, null, { next }).expected;
  };
  const plain = expectedWith(() => {});
  const rows = [
    ["asleep 3 turns", f => { f.status = { effect: 4, sleepTurnsRemaining: 3 }; }, 0],
    ["asleep, wakes this turn", f => { f.status = { effect: 4, sleepTurnsRemaining: 1 }; }, 1],
    ["asleep 2 turns, Early Bird", f => { f.status = { effect: 4, sleepTurnsRemaining: 2 }; f.hasAbilityWithAttr = a => a === "ReduceStatusEffectDurationAbAttr"; }, 1],
    ["frozen", f => { f.status = { effect: 5, freezeTurnsRemaining: 3 }; }, 0.25],
    ["frozen, last turn", f => { f.status = { effect: 5, freezeTurnsRemaining: 1 }; }, 1],
    ["paralysed", f => { f.status = { effect: 3 }; }, 7 / 8],
    ["confused", f => { const t = new BattlerTag("CONFUSED", 3); f.getTag = n => (n === "CONFUSED" ? t : null); }, 2 / 3],
    ["recharging", f => { f.getTag = n => (n === "RECHARGING" ? new BattlerTag("RECHARGING") : null); }, 0],
  ];
  for (const [label, edit, share] of rows) {
    const x = expectedWith(edit);
    log(`F foe ${label}: ${r2(x / plain)} of its damage`);
    near(x, plain * share, label, 1e-6);
  }
  near(expectedWith(f => { f.getTag = n => (n === "RECHARGING" ? new BattlerTag("RECHARGING") : null); }, true), plain, "recharging acts again next turn");

  // Our side: asleep for two more turns, the KO waits; paralysis thins each turn's damage.
  const golem = mon("Golem", { player: false, hp: 300, spe: 40, moves: [move(88, "Rock Throw", 10)] });
  const slam = move(34, "Body Slam", 160);
  const sleeper = mon("Snorlax", { hp: 500, spe: 30, moves: [slam], status: { effect: 4, sleepTurnsRemaining: 3 } });
  setup([sleeper], [golem]);
  const asleep = E.exchange(scene, sleeper, sleeper.moveset[0], golem);
  sleeper.status = null;
  setup([sleeper], [golem]);
  const awake = E.exchange(scene, sleeper, sleeper.moveset[0], golem);
  log(`F our Snorlax: ${awake.turnsWe} turns awake, ${asleep.turnsWe} asleep`);
  // Body Slam's 136–160 rolls (1 in 24 a crit) take the 300 HP Golem in two uses only about 46 % of the time: its mean
  // (151) says 2, the odds say 3.
  assert.deepEqual([awake.turnsWe, asleep.turnsWe], [3, 5]);
  assert.ok(asleep.pWeKoFirst <= awake.pWeKoFirst);

  // A foe mid-Dig: a faster attacker's hit misses this turn; Earthquake reaches it.
  const tackle = move(33, "Strike", 400);
  const eq = move(89, "Earthquake", 400, { attrs: [new HitsTagAttr("UNDERGROUND")] });
  const digger = () => mon("Dugtrio", { player: false, hp: 300, spe: 50, semi: new SemiInvulnerableTag("UNDERGROUND"), moves: [move(91, "Dig", 80)] });
  const fast = mon("Jolteon", { hp: 300, spe: 130, moves: [tackle, eq] });
  let d = digger();
  setup([fast], [d]);
  const miss = E.exchange(scene, fast, fast.moveset[0], d);
  const reach = E.exchange(scene, fast, fast.moveset[1], d);
  const slow = mon("Slowbro", { hp: 300, spe: 10, moves: [tackle] });
  d = digger();
  setup([slow], [d]);
  const after = E.exchange(scene, slow, slow.moveset[0], d);
  log(`F foe underground: faster Strike ${miss.turnsWe} turns (KO first ${r2(miss.pWeKoFirst)}), Earthquake ${reach.turnsWe}, slower Strike ${after.turnsWe}`);
  assert.deepEqual([miss.turnsWe, reach.turnsWe, after.turnsWe], [2, 1, 1]);
}

// ---- Bug 8. Picking a fainted mon's replacement: our slot is empty, so the foe's own AI has nobody to aim at and
// scores every move −∞ (its first move "100 %"). The threat on the replacement must come from the replay instead.
{
  phase = { phaseName: "SwitchPhase", isModal: true, doReturn: false };
  const tackle = move(33, "Tackle", 20);
  const quake = move(89, "Earthquake", 400);
  const foe = mon("Garchomp", { player: false, hp: 300, spe: 120, moves: [tackle, quake] });
  const fainted = mon("Pikachu", { hp: 0, field: false });
  const bench = mon("Raichu", { hp: 300, field: false });
  setup([fainted, bench], [foe]);
  const raw = E.enemyMoveDistribution(scene, foe);
  log(`8 raw AI with no opponents: ${raw.map(r => `${r.name} ${Math.round(r.p * 100)}%`).join(", ")}`);
  assert.equal(raw[0].name, "Tackle", "reproduces the degenerate distribution");
  const t = E.threatFrom(scene, foe, bench);
  log(`8 threat on the replacement: ${t.move.name} ${Math.round(t.move.p * 100)}%, pKo ${r2(t.pKo)}`);
  assert.equal(t.move.name, "Earthquake");
  assert.ok(t.pKo > 0.9);
  phase = { phaseName: "CommandPhase" };
}

// ---- Drawbacks decide between moves. Steel Beam (−50 % HP) vs the slightly weaker, clean Flash Cannon.
{
  const steelBeam = move(796, "Steel Beam", 140, { cat: 1, attrs: [new HalfSacrificialAttr()] });
  const flashCannon = move(430, "Flash Cannon", 120, { cat: 1 });
  const pick = foeHp => {
    const foe = mon("Glaceon", { player: false, hp: foeHp, spe: 50, moves: [move(58, "Ice Beam", 30)] });
    const me = mon("Magnezone", { hp: 500, spe: 60, moves: [steelBeam, flashCannon] });
    setup([me], [foe]);
    const x = E.exchange(scene, me, me.moveset[0], foe), y = E.exchange(scene, me, me.moveset[1], foe);
    const best = E.fieldPlan(scene, [me], [foe], false).view.slots[0].move;
    log(`$ foe ${foeHp} HP: Steel Beam ${x.turnsWe} turns cost ${r2(x.cost)} · Flash Cannon ${y.turnsWe} turns · pick ${best}`);
    return [x.turnsWe, y.turnsWe, best];
  };
  assert.deepEqual(pick(220), [2, 2, "Flash Cannon"], "same turns: the clean move");
  assert.deepEqual(pick(120), [1, 2, "Steel Beam"], "Steel Beam saves a turn");

  // Outrage's confusion after the lock and Overheat's falling SpA stretch a long exchange.
  const outrage = move(200, "Outrage", 100, { attrs: [new FrenzyAttr()] });
  const overheat = move(315, "Overheat", 100, { cat: 1, attrs: [new StatStageChangeAttr([3], -2, true)] });
  const flat = move(1, "Pound", 100);
  const wall = () => mon("Blissey", { player: false, hp: 360, spe: 10, moves: [move(2, "Pound", 5)] });
  const user = mon("Dragonite", { hp: 400, spe: 80, moves: [outrage, overheat, flat] });
  const w = wall();
  setup([user], [w]);
  const [lock, drop, plain] = user.moveset.map(pm => E.exchange(scene, user, pm, w));
  log(`$ 4 hits needed: Pound ${plain.turnsWe} turns · Outrage ${lock.turnsWe} (cost ${r2(lock.cost)}) · Overheat ${drop.turnsWe}`);
  assert.equal(plain.turnsWe, 4);
  assert.equal(lock.turnsWe, 5);
  assert.ok(drop.turnsWe === 9, "Overheat at −2, −4, −6 never gets there");
  assert.ok(lock.cost > 0.1);
}

assert.ok(["Iron Barbs", "Rough Skin", "Moxie", "Magic Guard", "Unaware"].every(a => E.TRAPS.has(a)), "new trap abilities listed");
assert.equal(E.moveOutcome.lastError, undefined, `game path threw: ${E.moveOutcome.lastError?.stack}`);
assert.equal(Phaser.Math.RND.state(), "!rnd,0", "sandbox restored the RNG");
console.log("engine: ok");
