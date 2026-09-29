import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { ATTRS } from "./fixtures/party.mjs";

const hash = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h >>> 0; };
const RND = {
  _n: 1,
  sow(arr) { this._n = hash(String(arr[0])) || 1; },
  state(v) { if (v !== undefined) this._n = Number(v.slice(5)); return `!rnd,${this._n}`; },
  frac() { this._n = (Math.imul(this._n, 1664525) + 1013904223) >>> 0; return this._n / 4294967296; },
  integerInRange(min, max) { return min + Math.floor(this.frac() * (max - min + 1)); },
  realInRange(min, max) { return min + this.frac() * (max - min); },
  pick(items) { return items[this.integerInRange(0, items.length - 1)]; },
};
const randSeedInt = (range, min = 0) => (range <= 1 ? min : RND.integerInRange(min, range - 1 + min));
const shiftCharCodes = (str, n) => [...String(str)].map(c => String.fromCharCode(c.charCodeAt(0) + (n || 0))).join("");

// Every draw in the mock game is in the pinned source's order (game-code.md §11), so a replay that gets the order
// wrong mismatches rather than passes.
const SPECIES = {
  1: ["Zubat", ["Poison", "Flying"], 245], 2: ["Geodude", ["Rock", "Ground"], 300], 3: ["Onix", ["Rock", "Ground"], 385],
  4: ["Machop", ["Fighting"], 305], 5: ["Gengar", ["Ghost", "Poison"], 500], 6: ["Steelix", ["Steel", "Ground"], 510],
};
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const POOL = [1, 2, 3, 4];
const SIGNATURE = [4, 2, 5];
let destroyed = 0;
const species = id => ({ speciesId: id, name: SPECIES[id][0], baseTotal: SPECIES[id][2],
  types: SPECIES[id][1].map(t => TY.indexOf(t)) });

// A bare name is a move the preview can't read past its name; an array is one it can, in `fixtures/party.mjs`'s form.
const CAT = { P: 0, S: 1, X: 2 };
const fakeMove = m => (typeof m === "string" ? { getName: () => m } : {
  getName: () => m[0],
  getMove: () => ({ name: m[0], type: TY.indexOf(m[1]), power: m[2], category: CAT[m[3] ?? "P"],
    attrs: (m[4] ?? []).map(a => new ATTRS[a]()) }),
});

const mon = (sp, level, { boss = 0, moves = ["Tackle"] } = {}) => ({
  species: sp, name: sp.name, level, bossSegments: boss, shiny: false,
  getTypes: () => sp.types, getAbility: () => ({ name: "Sturdy" }), hasPassive: () => false,
  getMaxHp: () => 50 + level * 2, getStat: i => 20 + level + i, getIconAtlasKey: () => "k", getIconId: () => String(sp.speciesId),
  moveset: moves.map(fakeMove),
  destroy() { destroyed++; },
});

const makeTrainer = (scene, { name, type, size = 2, double = false, staticParty = false }) => {
  const templateIndex = randSeedInt(2);
  const nameRoll = randSeedInt(4);
  return {
    name: `${name}${nameRoll}`, config: { trainerType: type, hasStaticParty: staticParty },
    isDouble: () => double, getName: () => `${name}${nameRoll}`,
    getPartyLevels: w => Array.from({ length: size }, (_, i) => 5 + Math.floor(w / 2) + i + templateIndex),
    genPartyMember(index) {
      const level = scene.currentBattle.enemyLevels[index];
      let ret;
      scene.executeWithSeedOffset(() => {
        ret = mon(species(SIGNATURE[randSeedInt(SIGNATURE.length)]), level, { moves: ["Tackle", "Rock Slide"] });
      }, staticParty ? type + ((index + 1) << 8) : scene.currentBattle.waveIndex + (type << 10) + ((index + 1) << 8));
      return ret;
    },
    destroy() { destroyed++; },
  };
};

class FakeBattle {
  constructor(gameMode, { waveIndex, battleType, trainer, double = false }) {
    Object.assign(this, { gameMode, waveIndex, battleType, trainer: trainer ?? null, double, enemyParty: [] });
    this.enemyLevels = battleType === 1
      ? trainer?.getPartyLevels(waveIndex)
      : Array.from({ length: double ? 2 : 1 }, () => Math.max(1, Math.round(1 + waveIndex / 2 + randSeedInt(3))));
  }
  isBattleMysteryEncounter() { return this.battleType === 3; }
}

// No classic fixed-battle config sets `double` (game-code.md §16).
const FIXED = {
  8: { seedOffsetWaveIndex: 0, name: "Rival", type: 20 },
  25: { seedOffsetWaveIndex: 8, name: "Rival", type: 20 },
  35: { seedOffsetWaveIndex: 0, name: "Rocket Grunt", type: 30 },
};

// getPartyLuckValue (game-code.md §12).
const partyLuckOf = party => Math.max(0, Math.min(14, party.reduce((t, p) => t + (p.getLuck?.() ?? 0), 0)));
let arenaArgs = [];

const makeScene = ({ wave = 12, seed = "kAbC12", party = [], modifiers = [], meRate = 0, hasTrainers = true,
  waveCycleOffset = 0, foeMoves = ["Tackle"] } = {}) => {
  const offsets = [];
  const scene = {
    seed, waveSeed: shiftCharCodes(seed, wave), rngOffset: 0, rngSeedOverride: "", offsetGym: false, waveCycleOffset,
    arena: { biomeId: 7, randomSpecies: (w, level, attempt = 0, luck = 0) => { arenaArgs.push([attempt, luck]); return species(POOL[randSeedInt(POOL.length)]); } },
    modifiers, mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 3 },
    phaseManager: { pushPhase() {}, unshiftPhase() {}, pushNew() {}, unshiftNew() {}, queueMessage() {},
      queueAbilityDisplay() {}, hideAbilityBar() {}, queueFaintPhase() {} },
    getPlayerParty: () => party, getEnemyParty: () => scene.currentBattle?.enemyParty ?? [],
    gameMode: {
      hasTrainers, isEndless: !hasTrainers, hasChallenge: () => false, isWaveFinal: () => false, isBoss: w => w % 10 === 0,
      isFixedBattle: w => !!FIXED[w],
      getFixedBattle: w => FIXED[w] && { battleType: 1, seedOffsetWaveIndex: FIXED[w].seedOffsetWaveIndex,
        getTrainer: () => makeTrainer(scene, { name: FIXED[w].name, type: FIXED[w].type, size: 3 }) },
      isWaveTrainer(w) {
        if (w % 30 === (scene.offsetGym ? 0 : 20)) return true;
        if (w % 10 === 1 || w % 10 === 0) return false;
        return !randSeedInt(4);
      },
    },
    // `executeWithSeedOffset` as the game has it (game-code.md §11).
    executeWithSeedOffset(fn, offset, seedOverride) {
      // Tagged by the seed it shifts: the run seed passed explicitly, as the preview's outer fork does, is still "run".
      offsets.push([offset, !seedOverride || seedOverride === scene.seed ? "run" : "wave"]);
      const state = RND.state();
      const [o, so] = [scene.rngOffset, scene.rngSeedOverride];
      RND.sow([shiftCharCodes(seedOverride || scene.seed, offset)]);
      scene.rngOffset = offset;
      scene.rngSeedOverride = seedOverride || "";
      fn();
      RND.state(state);
      scene.rngOffset = o;
      scene.rngSeedOverride = so;
    },
    isWaveMysteryEncounter(battleType, w) {
      if (battleType !== 0 || w < 10) return false;
      let roll = 0;
      scene.executeWithSeedOffset(() => { roll = randSeedInt(256); }, w * 3000);
      return roll < meRate;
    },
    generateNewBattleTrainer(w) {
      const type = randSeedInt(3) + 1;
      const double = !randSeedInt(8);
      return makeTrainer(scene, { name: "Youngster", type, size: 2, double });
    },
    checkIsDouble({ double, battleType, waveIndex, trainer }) {
      if (double != null) return double;
      if (battleType === 0) return !randSeedInt(8);
      return !!trainer?.isDouble();
    },
    getEncounterBossSegments(w, level) {
      let boss = false;
      scene.executeWithSeedOffset(() => { boss = w % 10 === 0 || randSeedInt(100) < 0; }, w << 2);
      return boss ? 2 : 0;
    },
    addEnemyPokemon: (sp, level, _slot, boss) => mon(sp, level, { boss: boss ? 2 : 0, moves: foeMoves }),
    getMysteryEncounter: () => ({ localizationKey: "departmentStoreSale", encounterTier: 0 }),
    // `BattleScene.randomSpecies`, whose third argument is not the arena method's (game-code.md §11).
    randomSpecies: (w, level, fromArenaPool) => (fromArenaPool
      ? scene.arena.randomSpecies(w, level, 0, partyLuckOf(party))
      : species(POOL[0])),
  };
  scene.currentBattle = new FakeBattle(scene.gameMode, { waveIndex: wave, battleType: 0, double: false });
  scene.currentBattle.constructor = FakeBattle;
  return { scene, offsets };
};

// The game's `newBattle`, then `EncounterPhase`'s party loop: what a preview from the wave before must land on.
const playWave = (scene, w) => {
  RND.sow([shiftCharCodes(scene.seed, w)]);
  scene.waveSeed = shiftCharCodes(scene.seed, w);
  const gm = scene.gameMode;
  let type, trainer = null, forcedDouble;
  const cfg = gm.isFixedBattle(w) ? gm.getFixedBattle(w) : null;
  if (cfg) {
    type = cfg.battleType;
    forcedDouble = cfg.double;
    scene.executeWithSeedOffset(() => { trainer = cfg.getTrainer(); }, (cfg.seedOffsetWaveIndex || w) << 8);
  } else {
    // `hasTrainers` first: Endless never spends the trainer roll (game-code.md §11).
    type = gm.hasTrainers && gm.isWaveTrainer(w) ? 1 : 0;
    if (scene.isWaveMysteryEncounter(type, w)) type = 3;
    else if (type === 1) trainer = scene.generateNewBattleTrainer(w);
  }
  const double = scene.checkIsDouble({ double: forcedDouble, battleType: type, waveIndex: w, trainer });
  let battle;
  scene.executeWithSeedOffset(() => { battle = new FakeBattle(gm, { waveIndex: w, battleType: type, trainer, double }); },
    w << 3, scene.waveSeed);
  scene.currentBattle = battle;
  if (type !== 3) {
    battle.enemyLevels.forEach((level, e) => {
      battle.enemyParty[e] = type === 1
        ? trainer.genPartyMember(e)
        : scene.addEnemyPokemon(scene.randomSpecies(w, level, true), level, 0, !!scene.getEncounterBossSegments(w, level));
    });
  }
  return battle;
};

// No `ui` on the scene, so the HUD's own tick draws nothing and the test drives the module.
const mount = opts => {
  globalThis.window = globalThis;
  delete globalThis.__coachHud;
  const { scene, offsets } = makeScene(opts);
  globalThis.Phaser = { Math: { RND }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const { previewFor, previewNext, previewArm, previewCheck, previewStats } = globalThis.__hud["48-preview"];
  const { drawPreview } = globalThis.__hud["95-render-preview"], { previewSummary } = globalThis.__hud["48-preview"];
  const { readRun } = globalThis.__hud["26-run"];
  const onRun = fn => (s, ...a) => readRun(s, run => fn(run, ...a));
  return { scene, offsets, pv: { previewFor: onRun(previewFor), previewNext: onRun(previewNext), previewArm, previewCheck, previewStats, drawPreview, previewSummary } };
};

const shape = m => ({ wave: m.wave, type: m.type, fixed: m.fixed, double: m.double, levels: m.levels,
  trainer: m.trainer?.name ?? null, me: m.me?.name ?? null, foes: m.foes.map(f => `${f.name} L${f.level}${f.segments ? ` ×${f.segments}` : ""}`),
  confidence: m.confidence, notes: m.notes, missed: m.missed });

// ---- The replay check: a preview from the wave before lands on the wave the game plays.
{
  for (const wave of [11, 12, 19, 20, 24]) {
    const { scene, pv } = mount({ wave: wave - 1 });
    const predicted = pv.previewNext(scene);
    const actual = playWave(scene, wave);
    const actualShape = {
      type: actual.battleType === 3 ? "me" : actual.battleType === 1 ? "trainer" : "wild",
      double: actual.double, levels: actual.enemyLevels ?? [],
      trainer: actual.trainer?.getName() ?? null, foes: actual.enemyParty.map(p => `${p.name} L${p.level}`),
    };
    const mine = { type: predicted.type, double: predicted.double, levels: predicted.levels,
      trainer: predicted.trainer?.name ?? null, foes: predicted.foes.map(f => `${f.name} L${f.level}`) };
    console.log(`== wave ${wave} predicted ${JSON.stringify(mine)}`);
    assert.deepEqual(mine, actualShape, `wave ${wave}: the replay lands on the wave the game plays`);
  }
}

// ---- Nothing the preview touches stays touched: the stream, the battle, the wave seed, the objects it built.
{
  const { scene, pv } = mount({ wave: 12 });
  const before = { state: RND.state(), battle: scene.currentBattle, waveSeed: scene.waveSeed, offset: scene.rngOffset };
  destroyed = 0;
  const m = pv.previewNext(scene);
  assert.equal(RND.state(), before.state, "the live stream is where it was");
  assert.equal(scene.currentBattle, before.battle, "currentBattle is back");
  assert.equal(scene.waveSeed, before.waveSeed, "waveSeed is back");
  assert.equal(scene.rngOffset, before.offset, "rngOffset is back");
  assert.equal(destroyed, m.foes.length + (m.trainer ? 1 : 0), `every throwaway object destroyed (${destroyed})`);
  destroyed = 0;
  assert.equal(pv.previewNext(scene), m, "cached per wave and per input");
  assert.equal(destroyed, 0, "the cache hit builds nothing");
}

// ---- A wild wave, a gym wave, a fixed battle and a Mystery Encounter each preview in their own shape.
{
  const cases = [["wild", 12], ["gym", 19], ["fixed rival", 7], ["fixed rival, seed offset", 24]];
  for (const [label, from] of cases) {
    const { scene, pv } = mount({ wave: from });
    console.log(`== ${label} (wave ${from + 1})\n${JSON.stringify(shape(pv.previewNext(scene)), null, 1)}`);
  }
  const { scene, pv } = mount({ wave: 12, meRate: 256 });
  const me = pv.previewNext(scene);
  console.log(`== mystery encounter\n${JSON.stringify(shape(me), null, 1)}`);
  assert.equal(me.type, "me");
  assert.equal(me.me.name, "departmentStoreSale");
  assert.deepEqual(me.foes, [], "an ME has no enemy party to preview");
  // The ME roll is a fork, but reaching it spends the trainer roll on the stream (game-code.md §11).
  assert.equal(me.confidence.type, "replay");
  assert.equal(me.confidence.foes, "replay");
}

// ---- A field is never surer than what it derives from.
{
  const { scene: sf, pv: pvf } = mount({ wave: 7 });
  const fixed = pvf.previewNext(sf);
  assert.deepEqual(fixed.confidence, { type: "exact", trainer: "exact", foes: "exact", double: "exact", levels: "exact" },
    "a fixed battle is exact end to end");
  const { scene: sg, pv: pvg } = mount({ wave: 19 });
  const gym = pvg.previewNext(sg);
  console.log(`== gym confidence ${JSON.stringify(gym.confidence)}`);
  assert.equal(gym.type, "trainer");
  assert.equal(gym.confidence.type, "exact", "a gym wave's kind costs no draw");
  assert.equal(gym.confidence.trainer, "replay", "its trainer is still drawn on the stream");
  assert.equal(gym.confidence.foes, "replay", "so the party under it is no surer than the trainer");
  assert.equal(gym.confidence.levels, "replay", "and neither are the levels");
}

// ---- The fork offsets are the game's own (game-code.md §11).
{
  const { scene, offsets, pv } = mount({ wave: 7 });
  offsets.length = 0;
  const m = pv.previewNext(scene);
  assert.equal(m.fixed, true);
  assert.equal(m.confidence.type, "exact");
  assert.equal(m.confidence.trainer, "exact");
  assert.deepEqual(offsets[0], [8, "run"], "the whole replay forks at the wave on the run seed");
  assert.deepEqual(offsets[1], [8 << 8, "run"], "the fixed trainer forks at (seedOffsetWaveIndex || wave) << 8");
  assert.deepEqual(offsets[2], [8 << 3, "wave"], "the levels fork at wave << 3 on the wave seed");
  assert.deepEqual(offsets[3], [8 + (20 << 10) + (1 << 8), "run"], "each party member forks on wave, type and index");
  const { scene: s2, offsets: o2, pv: pv2 } = mount({ wave: 24 });
  o2.length = 0;
  pv2.previewNext(s2);
  assert.deepEqual(o2[1], [8 << 8, "run"], "seedOffsetWaveIndex wins over the wave");
}

// ---- The tally: a field that was wrong once is marked from then on.
{
  const { scene, pv } = mount({ wave: 12 });
  const m = pv.previewNext(scene);
  pv.previewArm(m);
  playWave(scene, 13);
  pv.previewCheck(scene);
  let stats = pv.previewStats();
  assert.equal(stats.checked, 1);
  assert.equal(stats.miss.levels + stats.miss.foes + stats.miss.type + stats.miss.double, 0, JSON.stringify(stats.last));
  const next = pv.previewFor(scene, 14);
  pv.previewArm(next);
  scene.currentBattle = new FakeBattle(scene.gameMode, { waveIndex: 14, battleType: 1, trainer: makeTrainer(scene, { name: "Ghost", type: 9, size: 1 }), double: true });
  scene.currentBattle.enemyParty = [mon(species(6), 99)];
  pv.previewCheck(scene);
  stats = pv.previewStats();
  assert.ok(stats.miss.foes > 0 && stats.miss.levels > 0, `a wrong wave is scored wrong: ${JSON.stringify(stats.miss)}`);
  console.log(`== tally after a hit and a miss ${JSON.stringify({ checked: stats.checked, hit: stats.hit, miss: stats.miss })}`);
  const after = pv.previewFor(scene, 15);
  assert.ok(after.missed.includes("foes"), `a field that has missed is marked: ${JSON.stringify(after.missed)}`);
  console.log(`== marked ${JSON.stringify(after.missed)}`);
  assert.equal(next.wave, 14);
}

// ---- A build that has moved past the pin: the card says so rather than guessing.
{
  const { scene, pv } = mount({ wave: 12 });
  delete scene.generateNewBattleTrainer;
  const m = pv.previewFor(scene, 13);
  assert.equal(m.unavailable, "the live build has no generateNewBattleTrainer");
  assert.equal(m.foes, undefined);
  console.log(`== unavailable ${JSON.stringify(m)}`);
}

// ---- The wild spawn hands the arena the game's own arguments: attempt 0 and the party's luck.
{
  const { scene, pv } = mount({ wave: 12, party: [{ getLuck: () => 3, species: { speciesId: 1 }, level: 9 }] });
  arenaArgs = [];
  const m = pv.previewNext(scene);
  assert.equal(m.type, "wild");
  assert.deepEqual(arenaArgs, [[0, 3]], `the arena is handed (attempt 0, luck 3): ${JSON.stringify(arenaArgs)}`);
  console.log(`== wild spawn args ${JSON.stringify(arenaArgs)}`);
  const { scene: s2, pv: pv2 } = mount({ wave: 12, party: [{ getLuck: () => 3, species: { speciesId: 1 }, level: 9 }] });
  delete s2.randomSpecies;
  arenaArgs = [];
  pv2.previewNext(s2);
  assert.deepEqual(arenaArgs, [[0, 3]], `the fallback passes the same: ${JSON.stringify(arenaArgs)}`);
}

// ---- Only the next wave is armed: a look-ahead read in flight never displaces it.
{
  const { scene, pv } = mount({ wave: 12 });
  pv.previewArm(pv.previewNext(scene));
  pv.previewFor(scene, 20);
  playWave(scene, 13);
  pv.previewCheck(scene);
  const stats = pv.previewStats();
  assert.equal(stats.checked, 1);
  assert.equal(stats.miss.type + stats.miss.foes + stats.miss.levels + stats.miss.double, 0,
    `the look-ahead didn't displace the prediction: ${JSON.stringify(stats.last)}`);
  console.log(`== tally with a look-ahead in flight ${JSON.stringify({ checked: stats.checked, miss: stats.miss })}`);
}

// ---- Endless spends no trainer roll, so a gym-modulo wave is wild and the replay still lands (game-code.md §11).
{
  for (const wave of [13, 20]) {
    const { scene, pv } = mount({ wave: wave - 1, hasTrainers: false });
    const predicted = pv.previewNext(scene);
    assert.equal(predicted.type, "wild", `Endless wave ${wave} is wild`);
    assert.equal(predicted.trainer, null);
    assert.equal(predicted.confidence.type, "exact", "no roll decides the kind, so it can't drift");
    const actual = playWave(scene, wave);
    const mine = { double: predicted.double, levels: predicted.levels, foes: predicted.foes.map(f => `${f.name} L${f.level}`) };
    const theirs = { double: actual.double, levels: actual.enemyLevels, foes: actual.enemyParty.map(p => `${p.name} L${p.level}`) };
    console.log(`== endless wave ${wave} predicted ${JSON.stringify(mine)}`);
    assert.deepEqual(mine, theirs, `Endless wave ${wave}: the replay spends the same draws the game does`);
  }
}

// ---- The spawn pool is the arena's, rebuilt only at X0 and X5, not the wave ahead's time of day (game-code.md §10).
{
  // `waveCycleOffset` 3: the clock turns DAY → DUSK entering wave 12, and DUSK → NIGHT entering 17.
  const inner = mount({ wave: 11, waveCycleOffset: 3 });
  const m = inner.pv.previewNext(inner.scene);
  assert.equal(m.type, "wild");
  assert.equal(m.confidence.foes, "replay", "the clock turned, but the pool didn't: the spawn is a replay, not a guess");
  assert.ok(!m.notes.some(n => n.includes("pool")), `no pool note: ${JSON.stringify(m.notes)}`);
  const at5 = mount({ wave: 14, waveCycleOffset: 3 });
  const m5 = at5.pv.previewNext(at5.scene);
  assert.equal(m5.type, "wild");
  assert.equal(m5.confidence.foes, "estimate", "the X5 rebuild changes the pool the wave ahead draws from");
  assert.ok(m5.notes.some(n => n.includes("time of day")), `the pool note is said: ${JSON.stringify(m5.notes)}`);
  const across = mount({ wave: 20 });
  const m21 = across.pv.previewNext(across.scene);
  assert.equal(m21.type, "wild");
  assert.equal(m21.confidence.foes, "estimate", "a spawn read off the biome being left is a guess");
  assert.ok(m21.notes.some(n => n.includes("next biome")), `and says which: ${JSON.stringify(m21.notes)}`);
  console.log(`== pool shift  w12 ${m.confidence.foes}  w15 ${m5.confidence.foes} ${JSON.stringify(m5.notes)}`
    + `  w21 ${m21.confidence.foes} ${JSON.stringify(m21.notes)}`);
}

// ---- A grunt's double is unseeded, so it is an estimate in an otherwise exact fixed battle (game-code.md §12).
{
  const { scene, pv } = mount({ wave: 34 });
  const m = pv.previewNext(scene);
  assert.equal(m.fixed, true);
  assert.equal(m.confidence.type, "exact");
  assert.equal(m.confidence.trainer, "exact", "which grunt it is comes off the run seed");
  assert.equal(m.confidence.double, "estimate", "but whether it is a double doesn't");
  assert.equal(m.confidence.levels, "estimate", "and the levels are fed the double, so they are no surer");
  assert.ok(m.notes.some(n => n.includes("unseeded")), `and it says so: ${JSON.stringify(m.notes)}`);
  console.log(`== grunt wave 35 ${JSON.stringify({ confidence: m.confidence, notes: m.notes })}`);
}

// ---- A foe's attack types follow 08-party's coverage rule: variable power counts, fixed damage and status don't.
{
  // Requiring `power > 0` read a Steel foe whose STAB is Gyro Ball as having no Steel attack, and the look-ahead
  // believed it (#266).
  const { scene, pv } = mount({ wave: 12, foeMoves: [
    ["Gyro Ball", "Steel", -1],
    ["Iron Head", "Steel", 80],
    ["Heavy Slam", "Steel", -1],
    ["Earthquake", "Ground", 100],
    ["Seismic Toss", "Fighting", -1, "P", ["FixedDamageAttr"]],
    ["Iron Defense", "Steel", -1, "X"],
  ] });
  const foe = pv.previewNext(scene).foes[0];
  assert.deepEqual(foe.attackTypes, ["Steel", "Steel", "Steel", "Ground"],
    `variable power counts, fixed damage doesn't, one entry per move: ${JSON.stringify(foe.attackTypes)}`);
  assert.deepEqual(foe.statusMoves, ["Iron Defense"], `and the status move is still only a status move: ${JSON.stringify(foe.statusMoves)}`);
  console.log(`== foe attacks ${JSON.stringify(foe.attackTypes)}`);
}

// ---- The card and its one-line summary.
{
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
  for (const from of [12, 19, 7]) {
    const { scene, pv } = mount({ wave: from });
    const m = pv.previewNext(scene);
    console.log(`== card wave ${from + 1}\n${pv.drawPreview(m).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n")}`);
    console.log(`summary ${JSON.stringify(pv.previewSummary(m))}`);
  }
}

console.log("ok");
