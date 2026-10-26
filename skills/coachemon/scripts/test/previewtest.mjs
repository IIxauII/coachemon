import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { PokemonType } from "../../../../src/enums/generated.ts";
import { ATTRS } from "./fixtures/party.mjs";
import { cat as CAT, TY } from "./fake-mon.mjs";

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
const POOL = [1, 2, 3, 4];
const SIGNATURE = [4, 2, 5];
let destroyed = 0;
const species = id => ({ speciesId: id, name: SPECIES[id][0], baseTotal: SPECIES[id][2],
  types: SPECIES[id][1].map(t => TY.indexOf(t)) });

// A bare name is a move the preview can't read past its name — no id and no `getMove`; an array is one it can, in
// `fixtures/party.mjs`'s form, and goes into `MOVES` under the id the game would give it, which is where a combatant
// rebuilt from a preview row looks its moveset up (#574).
const MOVES = [];
const moveIds = new Map();
const idOf = name => { if (!moveIds.has(name)) moveIds.set(name, moveIds.size + 1); return moveIds.get(name); };
const fakeMove = m => {
  if (typeof m === "string") return { getName: () => m };
  const id = idOf(m[0]);
  const mv = (MOVES[id] = { id, name: m[0], type: TY.indexOf(m[1]), power: m[2], category: CAT[m[3] ?? "P"],
    accuracy: 100, pp: 10, moveTarget: 3, priority: 0, flags: 0, attrs: (m[4] ?? []).map(a => new ATTRS[a]()) });
  return { moveId: id, getName: () => mv.name, getMove: () => mv, getMovePp: () => mv.pp, ppUsed: 0 };
};

// `getStat(Stat.HP)` is what `getMaxHp` answers (game-code.md §24), so the two agree here as they do on a live mon.
const statsAt = level => [50 + level * 2, ...[1, 2, 3, 4, 5].map(i => 20 + level + i)];
const mon = (sp, level, { boss = 0, moves = ["Tackle"] } = {}) => { const m = {
  id: sp.speciesId * 1000 + level, species: sp, name: sp.name, level, bossSegments: boss,
  bossSegmentIndex: boss ? boss - 1 : 0, shiny: false, stats: statsAt(level),
  getTypes: () => sp.types, getAbility: () => ({ name: "Sturdy" }), hasPassive: () => false,
  // Sturdy's own attr, the one ability the approx duel asks for by attr rather than by name (game-code.md §8).
  hasAbilityWithAttr: a => a === "PreDefendFullHpEndureAbAttr",
  getMaxHp: () => m.stats[0], getStat: i => m.stats[i], calculateStats: () => { m.stats = statsAt(m.level); },
  getIconAtlasKey: () => "k", getIconId: () => String(sp.speciesId),
  hp: 50 + level * 2, getHeldItems: () => [], getTag: () => null,
  isBoss: () => boss > 0, isPlayer: () => false, isOnField: () => false,
  summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], abilitiesApplied: new Set(), tags: [] },
  waveData: { abilitiesApplied: new Set(), abilityRevealed: true, endured: false },
  turnData: { hitCount: 0, hitsLeft: -1, moveEffectiveness: null },
  moveset: moves.map(fakeMove),
  destroy() { destroyed++; },
}; return m; };

// `getEvilGruntPartyTemplate` (game-code.md §12).
const evilTemplate = wave => (wave <= 62 ? [0, 0, 0] : wave <= 64 ? [0, 0, 3] : [0, 0, 0, 3, 3, 5]);

/** `relevel`: slot → the level a rival's `postProcess` writes over the member once it is built (game-code.md §11). */
const makeTrainer = (scene, { name, type, size = 2, double = false, staticParty = false, relevel = {}, template = null }) => {
  const templateIndex = randSeedInt(2);
  const nameRoll = randSeedInt(4);
  return {
    name: `${name}${nameRoll}`, config: { trainerType: type, hasStaticParty: staticParty },
    isDouble: () => double, getName: () => `${name}${nameRoll}`,
    getPartyLevels: w => (template
      ? template(scene.currentBattle?.waveIndex).map(bump => 5 + Math.floor(w / 2) + bump)
      : Array.from({ length: size }, (_, i) => 5 + Math.floor(w / 2) + i + templateIndex)),
    genPartyMember(index) {
      const level = scene.currentBattle.enemyLevels[index];
      let ret;
      scene.executeWithSeedOffset(() => {
        ret = mon(species(SIGNATURE[randSeedInt(SIGNATURE.length)]), level, { moves: ["Tackle", "Rock Slide"] });
        if (relevel[index] != null) ret.level = relevel[index];
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
  25: { seedOffsetWaveIndex: 8, name: "Rival", type: 20, relevel: { 2: 40 } },
  35: { seedOffsetWaveIndex: 0, name: "Rocket Grunt", type: 30 },
  64: { seedOffsetWaveIndex: 35, name: "Rocket Grunt", type: 30, template: evilTemplate },
  66: { seedOffsetWaveIndex: 35, name: "Rocket Admin", type: 31, template: evilTemplate },
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
        getTrainer: () => makeTrainer(scene, { name: FIXED[w].name, type: FIXED[w].type, size: 3, relevel: FIXED[w].relevel, template: FIXED[w].template }) },
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
    money: 0,
    getWaveMoneyAmount: m => Math.floor(scene.currentBattle.waveIndex * 100 * m / 10) * 10,
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
    // The encounter's `updateModifiers(false)` (game-code.md §11).
    for (const p of battle.enemyParty) p.calculateStats();
  }
  return battle;
};

// No `ui` on the scene, so the HUD's own tick draws nothing and the test drives the module.
const mount = opts => {
  const { scene, offsets } = makeScene(opts);
  mountHud({ scene, rnd: RND });
  const { previewFor, previewNext, previewArm, previewCheck, previewStats, previewActual, previewGrade } =
    globalThis.__hud["48-preview"];
  const { drawPreview } = globalThis.__hud["95-render-preview"], { previewSummary } = globalThis.__hud["48-preview"];
  const { readRun } = globalThis.__hud["26-run"];
  const onRun = fn => (s, ...a) => readRun(s, run => fn(run, ...a));
  // The move table a combatant looks a move id up in; the fake has no game chunk to scan for one.
  globalThis.__hud["04-game-tables"].setGameTables({ moves: MOVES, abilities: [] });
  const { combatantOf, duelEnv } = globalThis.__hud["09-combatant"];
  const { approxOutcomes } = globalThis.__hud["10-damage"];
  return { scene, offsets, duel: { combatantOf, env: duelEnv(scene), approxOutcomes },
    pv: { previewFor: onRun(previewFor), previewNext: onRun(previewNext), previewArm, previewCheck, previewStats, previewActual,
      previewGrade, drawPreview, previewSummary } };
};

const shape = m => ({ wave: m.wave, type: m.type, fixed: m.fixed, double: m.double, levels: m.levels,
  trainer: m.trainer?.name ?? null, me: m.me?.name ?? null, foes: m.foes.map(f => `${f.name} L${f.level}${f.segments ? ` ×${f.segments}` : ""}`),
  confidence: m.confidence, notes: m.notes, missed: m.missed });

// ---- The replay check: a preview from the wave before lands on the wave the game plays.
{
  for (const wave of [11, 12, 19, 20, 24, 25]) {
    const { scene, pv } = mount({ wave: wave - 1 });
    const predicted = pv.previewNext(scene);
    const actual = playWave(scene, wave);
    const actualShape = {
      type: actual.battleType === 3 ? "me" : actual.battleType === 1 ? "trainer" : "wild",
      double: actual.double, levels: actual.battleType === 3 ? actual.enemyLevels : actual.enemyParty.map(p => p.level),
      trainer: actual.trainer?.getName() ?? null, foes: actual.enemyParty.map(p => `${p.name} L${p.level}`),
    };
    const mine = { type: predicted.type, double: predicted.double, levels: predicted.levels,
      trainer: predicted.trainer?.name ?? null, foes: predicted.foes.map(f => `${f.name} L${f.level}`) };
    console.log(`== wave ${wave} predicted ${JSON.stringify(mine)}`);
    assert.deepEqual(mine, actualShape, `wave ${wave}: the replay lands on the wave the game plays`);
  }
}

// ---- A trainer member re-levelled once it is built previews at the level and the stats the game fields (#621).
{
  const { scene, pv } = mount({ wave: 24 });
  const m = pv.previewNext(scene);
  const battle = playWave(scene, 25);
  const fielded = battle.enemyParty.map(p => p.level);
  assert.notDeepEqual(battle.enemyLevels, fielded, "the rival's slot 3 is re-levelled after it is built");
  assert.deepEqual(m.levels, fielded, `the preview reads the levels the game fields: ${JSON.stringify(m.levels)}`);
  assert.deepEqual(m.foes.map(f => f.stats),
    battle.enemyParty.map(p => [p.getMaxHp(), ...[1, 2, 3, 4, 5].map(i => p.getStat(i))]),
    "and the stats the game recomputes at that level");
  const graded = pv.previewGrade(m, pv.previewActual(scene));
  assert.deepEqual(graded.wrong, [], `graded right: ${JSON.stringify(graded)}`);
  console.log(`== re-levelled rival ${JSON.stringify({ battle: battle.enemyLevels, preview: m.levels })}`);
}

// ---- An evil team's party is the one the game fields, whichever wave it's read from (#622).
{
  for (const [wave, froms] of [[64, [50, 62, 63]], [66, [56, 64, 65]]]) {
    const { scene: played } = mount({ wave: wave - 1 });
    const theirs = playWave(played, wave).enemyParty.map(p => `${p.name} L${p.level}`);
    for (const from of froms) {
      const { scene, pv } = mount({ wave: from });
      const live = scene.currentBattle;
      const mine = pv.previewFor(scene, wave).foes.map(f => `${f.name} L${f.level}`);
      assert.deepEqual(mine, theirs, `wave ${wave} read from ${from}: the party the game fields`);
      assert.equal(scene.currentBattle, live, "currentBattle is back");
    }
    console.log(`== evil wave ${wave} from ${froms.join("/")} ${JSON.stringify(theirs)}`);
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

// ---- A read from further out is graded by the tally's own comparison, and grading it leaves the tally alone (#590).
{
  const { scene, pv } = mount({ wave: 12 });
  const far = pv.previewFor(scene, 14);
  playWave(scene, 13);
  playWave(scene, 14);
  const same = pv.previewGrade(far, pv.previewActual(scene));
  assert.deepEqual(same.wrong, [], `an unchanged run plays the wave read two out: ${JSON.stringify(same)}`);
  scene.currentBattle = new FakeBattle(scene.gameMode, { waveIndex: 14, battleType: 0, double: true });
  scene.currentBattle.enemyParty = [mon(species(6), 99), mon(species(5), 99)];
  const off = pv.previewGrade(far, pv.previewActual(scene));
  assert.ok(off.wrong.includes("foes") && off.wrong.includes("levels"), `a wrong wave is graded wrong: ${JSON.stringify(off)}`);
  assert.equal(pv.previewStats().checked, 0, "grading is not scoring");
  console.log(`== graded from two out ${JSON.stringify({ same: same.right, off: off.wrong })}`);
}

// ---- A Mystery Encounter fields no foes, so a right call on one has no levels to get wrong (#590).
{
  const { scene, pv } = mount({ wave: 12, meRate: 256 });
  const me = pv.previewNext(scene);
  playWave(scene, 13);
  const graded = pv.previewGrade(me, pv.previewActual(scene));
  assert.equal(graded.actual.type, "me");
  assert.deepEqual(graded.wrong, [], `a right ME call is graded right: ${JSON.stringify(graded)}`);
  console.log(`== mystery encounter graded on ${JSON.stringify(graded.right)}`);
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

// ---- A grunt's double, and the name that follows it, are estimates in an exact fixed battle (game-code.md §12).
{
  const { scene, pv } = mount({ wave: 34 });
  const m = pv.previewNext(scene);
  assert.equal(m.fixed, true);
  assert.equal(m.confidence.type, "exact");
  assert.equal(m.confidence.double, "estimate", "but whether it is a double doesn't");
  assert.equal(m.confidence.trainer, "estimate", "and the trainer's name follows the double");
  assert.equal(m.confidence.foes, "exact", "while the party, keyed on the run seed, doesn't");
  assert.equal(m.confidence.levels, "estimate", "and the levels are fed the double, so they are no surer");
  assert.ok(m.notes.some(n => n.includes("unseeded")), `and it says so: ${JSON.stringify(m.notes)}`);
  console.log(`== grunt wave 35 ${JSON.stringify({ confidence: m.confidence, notes: m.notes })}`);
}

// ---- A gym leader or a wild boss read on the X0 before it is the next biome's, and a guess (#590).
{
  const { scene, pv } = mount({ wave: 10 });
  const before = RND.state();
  const gym = pv.previewFor(scene, 20);
  assert.equal(RND.state(), before, "a read ten waves out leaves the live stream where it was");
  assert.equal(gym.type, "trainer");
  assert.deepEqual(gym.confidence, { type: "exact", trainer: "estimate", foes: "estimate", double: "estimate", levels: "estimate" },
    "the old biome's trainer pool named the leader, and every such read missed it");
  assert.ok(gym.notes.some(n => n.includes("next biome")), `and it says why: ${JSON.stringify(gym.notes)}`);
  const { scene: sb, pv: pvb } = mount({ wave: 30 });
  const boss = pvb.previewFor(sb, 40);
  assert.equal(boss.type, "wild");
  assert.deepEqual(boss.confidence, { type: "exact", trainer: null, foes: "estimate", double: "estimate", levels: "estimate" },
    "a wild boss drawn from the old biome's pool is no surer");
  console.log(`== across a biome  gym 20 from 10 ${JSON.stringify(gym.confidence)}  boss 40 from 30 ${JSON.stringify(boss.confidence)}`);
}

// ---- Read inside its own biome a gym keeps its replay, and a fixed battle's party never hangs on the biome (#590).
{
  const { scene: si, pv: pvi } = mount({ wave: 11 });
  const inside = pvi.previewFor(si, 20);
  assert.deepEqual([inside.confidence.trainer, inside.confidence.foes, inside.confidence.levels], ["replay", "replay", "replay"]);
  const { scene: sf, pv: pvf } = mount({ wave: 20 });
  assert.deepEqual(pvf.previewFor(sf, 25).confidence,
    { type: "exact", trainer: "exact", foes: "exact", double: "exact", levels: "exact" }, "a rival across a biome change");
  // An X1 read on the X0 is never a gym or a boss: only its spawn is the next biome's.
  const next = pvf.previewNext(sf);
  assert.deepEqual([next.wave, next.confidence.double, next.confidence.levels], [21, "replay", "replay"]);
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

// ---- A previewed foe carries the stat row and the move ids a combatant is rebuilt from (#574).
{
  const foeMoves = [["Rock Slide", "Rock", 75], ["Earthquake", "Ground", 100], ["Iron Defense", "Steel", -1, "X"]];
  const { scene, pv, duel } = mount({ wave: 12, foeMoves });
  const row = pv.previewNext(scene).foes[0];
  console.log(`== row for a combatant ${JSON.stringify({ name: row.name, level: row.level,
    stats: row.stats, moves: row.moves, moveIds: row.moveIds })}`);
  assert.equal(row.moveIds.length, row.moves.length, "an id for every move the row names");

  // The same wave, played: the row describes the foe the game goes on to build, and rebuilds it as a combatant.
  const foe = playWave(scene, 13).enemyParty[0];
  assert.equal(foe.name, row.name);
  const rebuilt = duel.combatantOf({ name: row.name, level: row.level, stats: row.stats,
    types: row.types.map(t => TY.indexOf(t)), ability: row.ability, passive: row.passive, moves: row.moveIds,
    boss: row.segments, player: false });
  assert.deepEqual(row.stats, [foe.getMaxHp(), ...[1, 2, 3, 4, 5].map(i => foe.getStat(i))], "one `Stat`-indexed row, HP first");
  assert.deepEqual(rebuilt.stats, row.stats, "handed over whole, it is the live foe's own stat row");
  assert.deepEqual(rebuilt.moveset.map(pm => pm.getName()), row.moves, "and its moveset, looked up by id");

  // A Rock Slide into a Poison/Flying foe hits for more than its whole health, so the row's Sturdy has to endure on
  // both sides of the comparison as well.
  const target = duel.combatantOf({ name: "ours", level: 20, stats: [120, 400, 60, 70, 60, 65],
    types: [TY.indexOf("Water")], ability: "Torrent", moves: [idOf("Rock Slide")], player: true });
  assert.equal(JSON.stringify(duel.approxOutcomes(duel.env, rebuilt, target)),
    JSON.stringify(duel.approxOutcomes(duel.env, foe, target)), "the rebuilt foe hits as the live one does, move by move");
  assert.equal(JSON.stringify(duel.approxOutcomes(duel.env, target, rebuilt)),
    JSON.stringify(duel.approxOutcomes(duel.env, target, foe)), "and takes a hit the same way");
  const into = duel.approxOutcomes(duel.env, target, rebuilt)[0];
  assert.equal(into.pKo, 0, `Sturdy holds, off the row's ability name alone: ${JSON.stringify(into.pKo)}`);
  console.log(`== rebuilt ${rebuilt.stats.join("/")} | out `
    + duel.approxOutcomes(duel.env, rebuilt, target).map(o => `${o.name} ×${o.e} ${o.max}`).join(", ")
    + ` | in ${into.name} ×${into.e} ${into.max} pKo ${into.pKo}`);
}

// ---- The card and its one-line summary, which mark an estimate `≈` and never `?` (#678).
{
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
  for (const from of [12, 19, 7, 20, 34]) {
    const { scene, pv } = mount({ wave: from });
    const m = pv.previewNext(scene);
    const card = pv.drawPreview(m).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    const summary = pv.previewSummary(m);
    if (Object.values(m.confidence).includes("estimate")) {
      assert.ok(card.includes("≈") && summary.includes("≈"), `an estimate is marked ≈:\n${card}\n${summary}`);
    }
    assert.ok(!`${card}${summary}`.includes("?"), `and never ?:\n${card}\n${summary}`);
    console.log(`== card wave ${from + 1}\n${card}`);
    console.log(`summary ${JSON.stringify(summary)}`);
  }
}

// ---- The replay is kept under the replay key: party levels, members and the item count leave it alone (#922).
{
  const mod = (name, over = {}) => Object.assign(new ({ [name]: class {} })[name](), { stackCount: 1, getStackCount() { return this.stackCount; } }, over);
  const member = (id, over = {}) => ({ id, species: species(id), name: SPECIES[id][0], level: 20, hp: 60, getMaxHp: () => 60,
    getHpRatio: () => 1, getLuck: () => 0, isAllowedInBattle: () => true, getHeldItems: () => [], ...over });
  for (const meRate of [0, 256]) {
    const party = [member(5), member(6)];
    const { scene, offsets, pv } = mount({ wave: 11, party, modifiers: [], meRate });
    const kinds = {};
    for (let w = 12; w < 20; w++) kinds[pv.previewFor(scene, w).type] ??= w;
    if (meRate) delete kinds.trainer;
    assert.deepEqual(Object.keys(kinds).sort(), meRate ? ["me"] : ["trainer", "wild"]);
    const replays = w => { const n = offsets.length; pv.previewFor(scene, w); return offsets.length - n; };
    for (const [kind, w] of Object.entries(kinds)) {
      const kept = {
        "a level-up": () => { party[0].level++; },
        "an evolution": () => { party[1].species = species(3); party[1].name = "Onix"; },
        "a Dire Hit expiring": () => { scene.modifiers = scene.modifiers.filter(m => m.constructor.name !== "TempCritBoosterModifier"); },
        "a trainer reward": () => { scene.modifiers = [...scene.modifiers, mod("AttackTypeBoosterModifier", { pokemonId: party[0].id })]; },
        ...(kind === "me" ? { "money within its tier": () => { scene.money += 10; } } : { "a catch": () => { party.push(member(4)); } }),
      };
      scene.modifiers = [mod("TempCritBoosterModifier")];
      replays(w);
      for (const [what, change] of Object.entries(kept)) {
        change();
        assert.equal(replays(w), 0, `${kind} W${w}: ${what} keeps the replay`);
      }
      const set = (o, k, v) => () => { const was = o[k]; o[k] = v; return () => { o[k] = was; }; };
      const tables = globalThis.__hud["04-game-tables"];
      const moved = {
        seed: set(scene, "seed", "other"),
        "live wave": set(scene.currentBattle, "waveIndex", 10),
        biome: set(scene.arena, "biomeId", 8),
        "time of day": set(scene.arena, "lastTimeOfDay", 2),
        "encounters met": set(scene.mysteryEncounterSaveData, "encounteredEvents", [{}]),
        "encounter chance": set(scene.mysteryEncounterSaveData, "encounterSpawnChance", 9),
        event: () => { tables.setGameTables({ moves: MOVES, abilities: [], events: { activeEvent: () => ({ name: "Halloween" }) } });
          return () => tables.setGameTables({ moves: MOVES, abilities: [] }); },
        "Ability Charm stack": set(scene, "modifiers", [...scene.modifiers, mod("HiddenAbilityRateBoosterModifier")]),
        "enemy fusion": set(scene, "enemyModifiers", [mod("EnemyFusionChanceModifier", { chance: 0.01 })]),
        "egg phase": set(scene.phaseManager, "getCurrentPhase", () => ({ phaseName: "EggLapsePhase" })),
        ...(kind === "me" ? {
          "money tier": set(scene, "money", 1e6),
          "berries to six": set(scene, "modifiers", [...scene.modifiers, mod("BerryModifier", { stackCount: 6, pokemonId: party[0].id })]),
          "a catch": set(scene, "getPlayerParty", () => [...party, member(4)]),
          "members over half HP": set(party[0], "getHpRatio", () => 0.5),
          "a member turned Bug": set(party[0], "isOfType", t => t === PokemonType.BUG),
          "a Quick Claw held": set(party[0], "getHeldItems", () => [mod("BypassSpeedChanceModifier", { isTransferable: true })]),
          "a Quick Claw it can't give": set(party[0], "getHeldItems", () => [mod("BypassSpeedChanceModifier", { isTransferable: false })]),
          "a member barred from battle": set(party[1], "isAllowedInBattle", () => false),
        } : {
          lure: set(scene, "modifiers", [...scene.modifiers, mod("DoubleBattleChanceBoosterModifier")]),
          "an Illuminate lead with a No Guard passive": () => {
            const ability = id => ({ id, hasAttr: a => a === "DoubleBattleChanceAbAttr" });
            Object.assign(party[0], { getAbility: () => ability(35), hasPassive: () => true, getPassiveAbility: () => ability(99), canApplyAbility: () => true });
            return () => { for (const k of ["getAbility", "hasPassive", "getPassiveAbility", "canApplyAbility"]) delete party[0][k]; };
          },
        }),
        ...(kind === "wild" ? {
          luck: set(party[0], "getLuck", () => 2),
          "Shiny Charm stack": set(scene, "modifiers", [...scene.modifiers, mod("ShinyRateBoosterModifier")]),
          "Bug Net": set(scene, "modifiers", [...scene.modifiers, mod("BoostBugSpawnModifier")]),
        } : {}),
        ...(kind === "trainer" ? { "live double": set(scene.currentBattle, "double", true) } : {}),
      };
      for (const [what, change] of Object.entries(moved)) {
        const undo = change();
        assert.ok(replays(w) > 0, `${kind} W${w}: ${what} replays`);
        undo();
        assert.equal(replays(w), 0, `${kind} W${w}: back from ${what}, the replay held before`);
      }
      console.log(`== replay key ${kind} W${w}: kept by ${Object.keys(kept).join(", ")}; moved by ${Object.keys(moved).join(", ")}`);
    }
  }
}

console.log("ok");
