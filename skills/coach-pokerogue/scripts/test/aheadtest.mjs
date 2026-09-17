// Look-ahead to the next big fight, against a mock game mode built to the pinned source's shape: the classic fixed
// battle table, the gym rule, every tenth wave a boss, wave 200 final. Covers the calendar itself, the no-heal
// stretch the Elite Four sits in, the readiness verdict against a roster the preview names, party luck and the tier
// upgrade it buys, the waves whose rewards are pinned so luck and a reroll can't move them, and the Eternatus
// checklist. Prints the models and the card, so run.mjs keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

// ---- The mock. The RNG is only here so the preview's replay has something to draw from; every claim this test
// makes about the schedule is arithmetic on the wave index, which is the point of the feature.
const hash = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h >>> 0; };
const RND = {
  _n: 1,
  sow(arr) { this._n = hash(String(arr[0])) || 1; },
  state(v) { if (v !== undefined) this._n = Number(v.slice(5)); return `!rnd,${this._n}`; },
  frac() { this._n = (Math.imul(this._n, 1664525) + 1013904223) >>> 0; return this._n / 4294967296; },
  integerInRange(min, max) { return min + Math.floor(this.frac() * (max - min + 1)); },
};
const randSeedInt = (range, min = 0) => (range <= 1 ? min : RND.integerInRange(min, range - 1 + min));
const shiftCharCodes = (str, n) => [...String(str)].map(c => String.fromCharCode(c.charCodeAt(0) + (n || 0))).join("");

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const SPECIES = {
  1: ["Garchomp", ["Dragon", "Ground"], 600], 2: ["Lucario", ["Fighting", "Steel"], 525],
  3: ["Milotic", ["Water"], 540], 4: ["Eternatus", ["Poison", "Dragon"], 690], 5: ["Pidgey", ["Normal", "Flying"], 251],
};
const species = id => ({ speciesId: id, name: SPECIES[id][0], baseTotal: SPECIES[id][2], types: SPECIES[id][1].map(t => TY.indexOf(t)) });
let destroyed = 0;
const MOVES = {
  Earthquake: ["Ground", 0, 100], "Dragon Claw": ["Dragon", 0, 80], Surf: ["Water", 1, 90],
  Eternabeam: ["Dragon", 1, 160], "Cosmic Power": ["Psychic", 2, -1], Tackle: ["Normal", 0, 40],
  "Ice Beam": ["Ice", 1, 90],
};
const gameMove = name => ({ name, type: TY.indexOf(MOVES[name][0]), category: MOVES[name][1], power: MOVES[name][2] });
const mon = (sp, level, { boss = 0, moves = ["Tackle"] } = {}) => ({
  species: sp, name: sp.name, level, bossSegments: boss, shiny: false,
  getTypes: () => sp.types, getAbility: () => ({ name: "Sturdy" }), hasPassive: () => false,
  getMaxHp: () => 50 + level * 2, getStat: i => 20 + level + i, getIconAtlasKey: () => "k", getIconId: () => String(sp.speciesId),
  moveset: moves.map(n => ({ getName: () => n, getMove: () => gameMove(n) })),
  destroy() { destroyed++; },
});

// A player mon: `pk("Milotic", 90, ["Water"], ["Surf"])`.
let nextId = 1;
const pk = (name, level, types, moves, luck = 1) => ({
  id: nextId++, name, level, hp: 100, luck,
  getMaxHp: () => 100, getLuck: () => luck, isAllowedInBattle: () => true,
  getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  species: { speciesId: 90 + nextId, baseTotal: 500, getEvolutionLevels: () => [] },
  moveset: moves.map(n => ({ moveId: n, getName: () => n, getMove: () => gameMove(n) })),
});

// The classic fixed-battle table, by the waves `ClassicFixedBossWaves` names. `rewards` is the config's
// `customModifierRewardSettings`, which pins the tiers and switches luck upgrades off.
const RIVAL = { 8: "Rival", 25: "Rival 2", 55: "Rival 3", 95: "Rival 4", 145: "Rival 5", 195: "Rival 6" };
const EVIL = { 35: "Grunt", 62: "Grunt", 64: "Grunt", 66: "Admin", 112: "Grunt", 114: "Admin", 115: "Boss", 164: "Admin", 165: "Boss" };
const E4 = { 182: "Lorelei", 184: "Bruno", 186: "Agatha", 188: "Lance", 190: "Cynthia" };
const FIXED_NAMES = { 5: "Youngster", ...RIVAL, ...EVIL, ...E4 };
const REWARDS = {
  25: { guaranteedModifierTiers: [2, 1, 1], allowLuckUpgrades: false },
  165: { guaranteedModifierTiers: [3, 3, 2, 2, 2, 2], allowLuckUpgrades: false },
};

class FakeBattle {
  constructor(gameMode, { waveIndex, battleType, trainer, double = false }) {
    Object.assign(this, { gameMode, waveIndex, battleType, trainer: trainer ?? null, double, enemyParty: [] });
    this.enemyLevels = battleType === 1
      ? trainer?.getPartyLevels(waveIndex)
      : Array.from({ length: double ? 2 : 1 }, () => Math.max(1, Math.round(waveIndex / 2)));
  }
  isBattleMysteryEncounter() { return this.battleType === 3; }
}

const makeTrainer = (scene, name, size, roster) => ({
  name, config: { trainerType: 20, hasStaticParty: true }, isDouble: () => false, getName: () => name,
  getPartyLevels: w => Array.from({ length: size }, () => Math.round(w / 2)),
  genPartyMember(index) {
    let ret;
    scene.executeWithSeedOffset(() => {
      ret = mon(species(roster[index % roster.length]), scene.currentBattle.enemyLevels[index],
        { moves: ["Earthquake", "Dragon Claw"] });
    }, 20 + ((index + 1) << 8));
    return ret;
  },
  destroy() { destroyed++; },
});

const makeScene = ({ wave, party = [], roster = [1, 2], offsetGym = false, wildSpecies = 5, modifiers = [] } = {}) => {
  const seed = "kAbC12";
  const scene = {
    seed, waveSeed: shiftCharCodes(seed, wave), rngOffset: 0, rngSeedOverride: "", offsetGym, waveCycleOffset: 0,
    money: 5000, modifiers, arena: { biomeId: 7 }, mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 3 },
    phaseManager: { pushPhase() {}, unshiftPhase() {}, pushNew() {}, unshiftNew() {}, queueMessage() {},
      queueAbilityDisplay() {}, hideAbilityBar() {}, queueFaintPhase() {} },
    getPlayerParty: () => party, getEnemyParty: () => scene.currentBattle?.enemyParty ?? [],
    gameMode: {
      isEndless: false, hasChallenge: () => false,
      isWaveFinal: w => w === 200,
      isBoss: w => w % 10 === 0,
      isFixedBattle: w => FIXED_NAMES[w] != null,
      getFixedBattle: w => (FIXED_NAMES[w] == null ? undefined : {
        battleType: 1, double: false, seedOffsetWaveIndex: 0, customModifierRewardSettings: REWARDS[w],
        getTrainer: () => makeTrainer(scene, FIXED_NAMES[w], 2, roster),
      }),
      // `GameMode.isWaveTrainer`: the gym rule, which returns before the chance roll — and never on the final wave.
      isWaveTrainer: w => w % 30 === (offsetGym ? 0 : 20) && w !== 200,
    },
    executeWithSeedOffset(fn, offset, seedOverride) {
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
    isWaveMysteryEncounter: () => false,
    generateNewBattleTrainer: w => makeTrainer(scene, "Youngster", 2, roster),
    checkIsDouble: ({ double, trainer }) => (double != null ? double : !!trainer?.isDouble()),
    getEncounterBossSegments: w => (w % 10 === 0 ? 4 : 0),
    addEnemyPokemon: (sp, level, _slot, boss) => mon(sp, level, { boss: boss ? 4 : 0, moves: ["Eternabeam", "Cosmic Power"] }),
    getMysteryEncounter: () => null,
    randomSpecies: (w, level, fromArenaPool) => species(wildSpecies),
  };
  scene.currentBattle = new FakeBattle(scene.gameMode, { waveIndex: wave, battleType: 0, double: false });
  scene.currentBattle.constructor = FakeBattle;
  return scene;
};

// ---- Mount the HUD with no `ui` on the scene, so its own tick draws nothing and the test drives the module.
const mount = opts => {
  globalThis.window = globalThis;
  delete globalThis.__coachHud;
  const scene = makeScene(opts);
  globalThis.Phaser = { Math: { RND }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__ah = { aheadModel, partyLuck, drawAhead, aheadSummary, learnRoster };\n})();\n"));
  return { scene, ah: globalThis.__ah };
};

// Ice Beam answers the rival's Garchomp (Dragon/Ground), Earthquake its Lucario (Fighting/Steel).
const team = () => [pk("Milotic", 18, ["Water"], ["Surf", "Ice Beam"]), pk("Lucario", 18, ["Fighting", "Steel"], ["Earthquake"])];
const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const card = (ah, m, v = "full") => { globalThis.localStorage = { getItem: () => v, setItem() {} };
  return ah.drawAhead(m, v).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"); };

// ---- 1. The calendar: four arithmetic rules, in precedence order, and no RNG anywhere in it.
{
  const { scene, ah } = mount({ wave: 1, party: team() });
  const m = ah.aheadModel(scene);
  console.log(`== schedule from wave 1 ${JSON.stringify(m.schedule)}`);
  assert.deepEqual(m.schedule.map(f => [f.wave, f.kind]), [[5, "fixed"], [8, "fixed"], [10, "boss"], [20, "gym"]]);
  // 190 is the champion *and* a tenth wave: the fixed battle wins, and 200 ends the list.
  const { scene: s2, ah: ah2 } = mount({ wave: 186, party: team() });
  const m2 = ah2.aheadModel(s2);
  console.log(`== schedule from wave 186 ${JSON.stringify(m2.schedule)}`);
  assert.deepEqual(m2.schedule.map(f => [f.wave, f.kind]), [[188, "fixed"], [190, "fixed"], [195, "fixed"], [200, "final"]]);
  // What a move learned now is judged against (#122): the named fight's foes, with what a disrupting move takes away.
  const roster = ah2.learnRoster(m2);
  assert.deepEqual([roster.wave, roster.exact, roster.foes.map(f => f.name)], [188, true, ["Garchomp", "Lucario"]]);
  assert.deepEqual([roster.foes[0].statusMoves, roster.foes[0].healMoves], [[], []]);
  // The gym rule follows the run's own gym offset.
  const { scene: s3, ah: ah3 } = mount({ wave: 11, party: team(), offsetGym: true });
  assert.equal(ah3.aheadModel(s3).schedule.find(f => f.kind === "gym").wave, 30);
}

// ---- 2. The no-heal stretch. The run heals entering every X1, so 181–190 holds the whole Elite Four with no heal
// in it — which is what the rewards card spends against.
{
  for (const wave of [17, 180, 181, 185]) {
    const { scene, ah } = mount({ wave, party: team() });
    const m = ah.aheadModel(scene);
    console.log(`== wave ${wave}: next heal W${m.heal?.wave} · ${m.fightsBeforeHeal} big fights before it · next ${m.next.kind} W${m.next.wave}`);
  }
  const { scene, ah } = mount({ wave: 181, party: team() });
  const m = ah.aheadModel(scene);
  assert.equal(m.heal.wave, 191, "the next X1 after the gauntlet");
  assert.equal(m.fightsBeforeHeal, 5, "four Elite Four fights and the champion");
  const { scene: s2, ah: ah2 } = mount({ wave: 17, party: team() });
  assert.equal(ah2.aheadModel(s2).fightsBeforeHeal, 1, "an ordinary boss wave is one fight, then a heal");
}

// ---- 3. Readiness against the roster the preview names, and the card.
{
  // Wave 25's rival is Garchomp and Lucario. A Water/Fighting-Steel pair answers both and outlevels them.
  const { scene, ah } = mount({ wave: 24, party: team() });
  const m = ah.aheadModel(scene);
  console.log(`== ready ${JSON.stringify({ who: m.next.trainer, exact: m.next.exact, verdict: m.readiness.verdict, notes: m.readiness.notes.map(n => n.text) })}`);
  assert.deepEqual(m.readiness.unanswered, [], "Ice Beam answers the Garchomp, Earthquake the Lucario");
  assert.equal(m.next.trainer, "Rival 2");
  assert.equal(m.next.exact, true, "a fixed battle's roster is exact end to end");
  assert.equal(m.readiness.verdict, "ready");
  console.log(`== card\n${card(ah, m)}`);

  // The same fight with a party that can't touch a Dragon/Ground and is under-levelled.
  const weak = [pk("Pidgeot", 8, ["Normal", "Flying"], ["Tackle"]), pk("Pidgey", 7, ["Normal", "Flying"], ["Tackle"])];
  const { scene: s2, ah: ah2 } = mount({ wave: 24, party: weak });
  const m2 = ah2.aheadModel(s2);
  console.log(`== risky ${JSON.stringify({ verdict: m2.readiness.verdict, unanswered: m2.readiness.unanswered, gap: m2.readiness.levelGap, notes: m2.readiness.notes.map(n => n.text) })}`);
  assert.equal(m2.readiness.verdict, "risky");
  assert.deepEqual(m2.readiness.unanswered, ["Garchomp", "Lucario"]);
  assert.ok(m2.readiness.levelGap < 0, "they out-level us");
  console.log(`== card\n${card(ah2, m2)}`);
  console.log(`== mini\n${card(ah2, m2, "mini")}`);
  console.log(`summary ${JSON.stringify(ah2.aheadSummary(m2))}`);
}

// ---- 4. Luck: the sum of the party's, and the tier-upgrade chance it buys. A wave whose rewards are pinned says
// luck can't move them.
{
  const { scene, ah } = mount({ wave: 24, party: [pk("Milotic", 90, ["Water"], ["Surf"], 7), pk("Lucario", 88, ["Fighting"], ["Earthquake"], 7)] });
  const m = ah.aheadModel(scene);
  console.log(`== luck ${JSON.stringify(m.luck)}`);
  assert.equal(m.luck.value, 14, "clamped to 14");
  assert.equal(m.luck.grade, "SSS");
  assert.equal(m.luck.upgradePct, 14.3, "4 / floor(512 / 18)");
  const { scene: s0, ah: ah0 } = mount({ wave: 24, party: [pk("Milotic", 90, ["Water"], ["Surf"], 0)] });
  assert.equal(ah0.aheadModel(s0).luck.upgradePct, 3.1, "4 / 128 at luck 0");
  // The rewards for the wave just cleared: wave 25's rival pins its tiers and switches luck upgrades off.
  const { scene: s25, ah: ah25 } = mount({ wave: 25, party: team() });
  const m25 = ah25.aheadModel(s25);
  console.log(`== pinned rewards after wave 25 ${JSON.stringify(m25.thisWave)}`);
  assert.deepEqual(m25.thisWave, { tiers: ["Ultra", "Great", "Great"], luckUpgrades: false });
  assert.equal(ah25.aheadModel(makeScene({ wave: 24, party: team() })).thisWave, null, "an ordinary wave pins nothing");
}

// ---- 5. Eternatus. Everything here is read from the source, not rolled, so it holds for every run.
{
  const packed = pk("Milotic", 100, ["Water"], ["Surf"]);
  const { scene, ah } = mount({ wave: 198, party: [packed, pk("Lucario", 100, ["Fighting", "Steel"], ["Earthquake"])],
    wildSpecies: 4, modifiers: [{ pokemonId: packed.id, getStackCount: () => 4 }, { pokemonId: packed.id, getStackCount: () => 1 }] });
  const m = ah.aheadModel(scene);
  assert.equal(m.next.kind, "final");
  assert.equal(m.next.wave, 200);
  assert.ok(m.eternatus, "the checklist is up before 200");
  const facts = m.eternatus.facts.map(f => f.text);
  console.log(`== eternatus ${JSON.stringify({ foe: m.eternatus.foe?.name, bars: m.next.bars, facts })}`);
  assert.ok(facts.some(f => /can't be KO'd/.test(f)));
  assert.ok(facts.some(f => /steals one held item/.test(f)));
  assert.ok(facts.some(f => /carries 5 held items/.test(f)), "the Mini Black Hole eats the stacked mon first");
  assert.equal(m.eternatus.foe?.name, "Eternatus");
  assert.equal(m.next.bars, 3, "four health bars");
  // A party too thin for the double phase 2 turns into is told so.
  const { scene: s1, ah: ah1 } = mount({ wave: 198, party: [pk("Milotic", 100, ["Water"], ["Surf"])], wildSpecies: 4 });
  assert.ok(ah1.aheadModel(s1).eternatus.facts.some(f => /double battle/.test(f.text)), "a one-mon party is warned");
  console.log(`== card\n${card(ah, m)}`);
  // Up ten waves out, so there are still shops left to act on it — but the roster only once 200 is near.
  const { scene: s190, ah: ah190 } = mount({ wave: 190, party: team(), wildSpecies: 4 });
  const m190 = ah190.aheadModel(s190);
  assert.ok(m190.eternatus, "up from wave 190, with two shops left");
  assert.equal(m190.eternatus.foe, null, "ten waves out, no roster is read");
  assert.equal(m190.next.wave, 195, "the rival is still the next fight");
  // Far from the end, none of it is on the card.
  const { scene: s2, ah: ah2 } = mount({ wave: 100, party: team() });
  assert.equal(ah2.aheadModel(s2).eternatus, null);
}

// ---- 6. No game mode (an older build, or the shop's own mock): the model stands down rather than guessing.
{
  const { scene, ah } = mount({ wave: 24, party: team() });
  delete scene.gameMode.isFixedBattle;
  assert.equal(ah.aheadModel(scene), null);
  assert.deepEqual(ah.drawAhead(null), []);
  assert.equal(ah.aheadSummary(null), null);
}

// ---- 7. The calendar holds at any distance; the roster is only read once the fight is close enough that the
// inputs it feeds on won't have moved by then.
{
  const { scene, ah } = mount({ wave: 1, party: team() });
  const m = ah.aheadModel(scene);
  assert.equal(m.next.wave, 5);
  assert.equal(m.next.trainer, "Youngster", "four waves out is near enough to read");
  const { scene: s2, ah: ah2 } = mount({ wave: 100, party: team() });
  const far = ah2.aheadModel(s2);
  assert.equal(far.next.wave, 110, "the calendar names it either way");
  assert.equal(far.next.kind, "gym", "110 is a gym wave, which outranks its being a tenth wave");
  assert.equal(far.next.trainer, null, "ten waves out, no roster is read");
  assert.equal(far.readiness, null);
  assert.deepEqual(far.next.foes, []);
  assert.equal(ah2.learnRoster(far), null, "no roster to judge a learned move against either");
  console.log(`== far fight ${JSON.stringify({ wave: far.next.wave, kind: far.next.kind, foes: far.next.foes, readiness: far.readiness })}`);
}

console.log("ok");
