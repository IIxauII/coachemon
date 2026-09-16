// Next-wave preview against a mock game built to the pinned source's shape: a seeded RNG, the real
// `executeWithSeedOffset` (sow a shifted seed, restore the state), and a `newBattle` that draws in the game's order.
// The central check is a replay check — the preview taken at wave w-1 is compared with what the mock's own
// `newBattle`/`EncounterPhase` produce when wave w is actually played, on the same seed. Also covers: the fork
// offsets the preview uses, a fixed battle, a trainer wave, a Mystery Encounter, that the live stream / currentBattle
// / waveSeed come back untouched and every throwaway object is destroyed, the accuracy tally and its `?` marks, and
// the card in both views. Prints the models and the card, so run.mjs keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

// ---- A seeded RNG with Phaser's surface: sow from a string, save and restore state as a string.
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

// ---- The mock game. Every draw below is in the same order as the pinned source, so a replay that gets the order
// wrong shows up as a mismatch rather than as a passing test.
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

const mon = (sp, level, { boss = 0, moves = ["Tackle"] } = {}) => ({
  species: sp, name: sp.name, level, bossSegments: boss, shiny: false,
  getTypes: () => sp.types, getAbility: () => ({ name: "Sturdy" }), hasPassive: () => false,
  getMaxHp: () => 50 + level * 2, getStat: i => 20 + level + i, getIconAtlasKey: () => "k", getIconId: () => String(sp.speciesId),
  moveset: moves.map(n => ({ getName: () => n })),
  destroy() { destroyed++; },
});

// A trainer: its template size and its party are its own, and `genPartyMember` forks per member exactly as the game
// does (`waveIndex + (type << 10) + ((index + 1) << 8)`).
const makeTrainer = (scene, { name, type, size = 2, double = false, staticParty = false }) => {
  // The constructor's own draws: the party template, then the name.
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

const FIXED = { 8: { seedOffsetWaveIndex: 0, name: "Rival", type: 20 }, 25: { seedOffsetWaveIndex: 8, name: "Rival", type: 20 } };

// `offsets` records every fork the code under test opens, so the test can assert the offsets themselves.
const makeScene = ({ wave = 12, seed = "kAbC12", party = [], modifiers = [], meRate = 0 } = {}) => {
  const offsets = [];
  const scene = {
    seed, waveSeed: shiftCharCodes(seed, wave), rngOffset: 0, rngSeedOverride: "", offsetGym: false, waveCycleOffset: 0,
    // `randomSpecies` sits on the arena, as `references/game-code.md` §11 has it: the preview must reach it
    // through `s.arena`, never off the scene.
    arena: { biomeId: 7, randomSpecies: () => species(POOL[randSeedInt(POOL.length)]) }, modifiers, mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 3 },
    phaseManager: { pushPhase() {}, unshiftPhase() {}, pushNew() {}, unshiftNew() {}, queueMessage() {},
      queueAbilityDisplay() {}, hideAbilityBar() {}, queueFaintPhase() {} },
    getPlayerParty: () => party, getEnemyParty: () => scene.currentBattle?.enemyParty ?? [],
    gameMode: {
      isEndless: false, hasChallenge: () => false, isWaveFinal: () => false, isBoss: w => w % 10 === 0,
      isFixedBattle: w => !!FIXED[w],
      getFixedBattle: w => FIXED[w] && { battleType: 1, double: false, seedOffsetWaveIndex: FIXED[w].seedOffsetWaveIndex,
        getTrainer: () => makeTrainer(scene, { name: FIXED[w].name, type: FIXED[w].type, size: 3 }) },
      // Gym waves draw nothing; every other legal wave rolls the biome's trainer chance.
      isWaveTrainer(w) {
        if (w % 30 === (scene.offsetGym ? 0 : 20)) return true;
        if (w % 10 === 1 || w % 10 === 0) return false;
        return !randSeedInt(4);
      },
    },
    // The real one: sow the shifted seed, run, put the state and the offset fields back.
    executeWithSeedOffset(fn, offset, seedOverride) {
      // "run" or "wave": which seed the fork is shifted from. Passing the run seed explicitly is the same fork as
      // omitting it, which is what the preview's outer fork does.
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
      const type = randSeedInt(3) + 1; // the pool tier and type roll
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
    addEnemyPokemon: (sp, level, _slot, boss) => mon(sp, level, { boss: boss ? 2 : 0 }),
    getMysteryEncounter: () => ({ localizationKey: "departmentStoreSale", encounterTier: 0 }),
  };
  scene.currentBattle = new FakeBattle(scene.gameMode, { waveIndex: wave, battleType: 0, double: false });
  scene.currentBattle.constructor = FakeBattle;
  return { scene, offsets };
};

// What the mock game itself does when wave `w` is really played: `newBattle` then `EncounterPhase`'s party loop.
// The preview has to land on this, from the wave before, without touching the live stream.
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
    type = gm.isWaveTrainer(w) ? 1 : 0;
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
        : scene.addEnemyPokemon(scene.arena.randomSpecies(w, level, true), level, 0, !!scene.getEncounterBossSegments(w, level));
    });
  }
  return battle;
};

// ---- Mount the HUD with no `ui` on the scene, so its own tick draws nothing and the test drives the module.
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
  eval(bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__pv = { previewFor, previewNext, previewCheck, previewStats, fixedAhead, drawPreview, previewSummary };\n})();\n"));
  return { scene, offsets, pv: globalThis.__pv };
};

const shape = m => ({ wave: m.wave, type: m.type, fixed: m.fixed, double: m.double, levels: m.levels,
  trainer: m.trainer?.name ?? null, me: m.me?.name ?? null, foes: m.foes.map(f => `${f.name} L${f.level}${f.segments ? ` ×${f.segments}` : ""}`),
  confidence: m.confidence, notes: m.notes, missed: m.missed });

// ---- 1. The replay check: predict wave w from wave w-1, then play wave w for real and compare.
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

// ---- 2. Nothing the preview touches stays touched: the stream, the battle, the wave seed, the objects it built.
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
  // And a second call with the same inputs is the cached model, not a second replay.
  destroyed = 0;
  assert.equal(pv.previewNext(scene), m, "cached per wave and per input");
  assert.equal(destroyed, 0, "the cache hit builds nothing");
}

// ---- 3. Shapes: a wild wave, a gym wave (trainer, no trainer-chance draw), a fixed battle, an ME.
{
  const cases = [["wild", 12], ["gym", 19], ["fixed rival", 7], ["fixed rival, seed offset", 24]];
  for (const [label, from] of cases) {
    const { scene, pv } = mount({ wave: from });
    console.log(`== ${label} (wave ${from + 1})\n${JSON.stringify(shape(pv.previewNext(scene)), null, 1)}`);
  }
  const { scene, pv } = mount({ wave: 12, meRate: 256 }); // every legal wild wave rolls an ME
  const me = pv.previewNext(scene);
  console.log(`== mystery encounter\n${JSON.stringify(shape(me), null, 1)}`);
  assert.equal(me.type, "me");
  assert.equal(me.me.name, "departmentStoreSale");
  assert.deepEqual(me.foes, [], "an ME has no enemy party to preview");
  // The ME roll is its own fork, but reaching it runs through the trainer-chance roll on the stream, so the wave's
  // kind — and everything under it — is only ever as sure as a replay.
  assert.equal(me.confidence.type, "replay");
  assert.equal(me.confidence.foes, "replay");
}

// ---- 3b. A field is never surer than what it derives from.
{
  // A fixed battle: the trainer is a table lookup, so its party and levels are exact end to end.
  const { scene: sf, pv: pvf } = mount({ wave: 7 });
  const fixed = pvf.previewNext(sf);
  assert.deepEqual(fixed.confidence, { type: "exact", trainer: "exact", foes: "exact", double: "exact", levels: "exact" },
    "a fixed battle is exact end to end");
  // A gym wave: the calendar decides its kind with no draw, but the trainer itself is drawn on the stream — so the
  // party forked off that trainer cannot be exact, however fork-isolated each member's own roll is.
  const { scene: sg, pv: pvg } = mount({ wave: 19 });
  const gym = pvg.previewNext(sg);
  console.log(`== gym confidence ${JSON.stringify(gym.confidence)}`);
  assert.equal(gym.type, "trainer");
  assert.equal(gym.confidence.type, "exact", "a gym wave's kind costs no draw");
  assert.equal(gym.confidence.trainer, "replay", "its trainer is still drawn on the stream");
  assert.equal(gym.confidence.foes, "replay", "so the party under it is no surer than the trainer");
  assert.equal(gym.confidence.levels, "replay", "and neither are the levels");
}

// ---- 4. The fork offsets are the game's own.
{
  const { scene, offsets, pv } = mount({ wave: 7 });
  offsets.length = 0;
  const m = pv.previewNext(scene); // wave 8: the rival, seedOffsetWaveIndex 0
  assert.equal(m.fixed, true);
  assert.equal(m.confidence.type, "exact");
  assert.equal(m.confidence.trainer, "exact");
  assert.deepEqual(offsets[0], [8, "run"], "the whole replay forks at the wave on the run seed");
  assert.deepEqual(offsets[1], [8 << 8, "run"], "the fixed trainer forks at (seedOffsetWaveIndex || wave) << 8");
  assert.deepEqual(offsets[2], [8 << 3, "wave"], "the levels fork at wave << 3 on the wave seed");
  assert.deepEqual(offsets[3], [8 + (20 << 10) + (1 << 8), "run"], "each party member forks on wave, type and index");
  // Wave 25 uses seedOffsetWaveIndex 8: the same roster as wave 8's rival battle.
  const { scene: s2, offsets: o2, pv: pv2 } = mount({ wave: 24 });
  o2.length = 0;
  pv2.previewNext(s2);
  assert.deepEqual(o2[1], [8 << 8, "run"], "seedOffsetWaveIndex wins over the wave");
}

// ---- 5. The tally: a field that was wrong once is marked from then on.
{
  const { scene, pv } = mount({ wave: 12 });
  const m = pv.previewNext(scene);
  playWave(scene, 13); // the same seed, so every field should score a hit
  pv.previewCheck(scene);
  let stats = pv.previewStats();
  assert.equal(stats.checked, 1);
  assert.equal(stats.miss.levels + stats.miss.foes + stats.miss.type + stats.miss.double, 0, JSON.stringify(stats.last));
  // Now a wave the preview never saw coming: the battle on the field disagrees with the prediction.
  const next = pv.previewFor(scene, 14);
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

// ---- 6. A build that has moved past the pin: the card says so rather than guessing.
{
  const { scene, pv } = mount({ wave: 12 });
  delete scene.generateNewBattleTrainer;
  const m = pv.previewFor(scene, 13);
  assert.equal(m.unavailable, "the live build has no generateNewBattleTrainer");
  assert.equal(m.foes, undefined);
  console.log(`== unavailable ${JSON.stringify(m)}`);
}

// ---- 7. The fixed-battle schedule ahead needs no RNG at all.
{
  const { scene, pv } = mount({ wave: 1 });
  const ahead = pv.fixedAhead(scene, 2, 30);
  console.log(`== fixed ahead ${JSON.stringify(ahead)}`);
  assert.deepEqual(ahead, [{ wave: 8, kind: "fixed" }, { wave: 20, kind: "gym" }, { wave: 25, kind: "fixed" }]);
}

// ---- 8. The card, in both views, plus the one-line summary.
{
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
  for (const from of [12, 19, 7]) {
    const { scene, pv } = mount({ wave: from });
    const m = pv.previewNext(scene);
    for (const v of ["full", "mini"]) {
      globalThis.localStorage = { getItem: () => v, setItem() {} };
      console.log(`== card wave ${from + 1} (${v})\n${pv.drawPreview(m, v).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n")}`);
    }
    console.log(`summary ${JSON.stringify(pv.previewSummary(m))}`);
  }
}

console.log("ok");
