import assert from "node:assert/strict";
import { mountHud, panelText } from "./fake-page.mjs";
import { TY } from "./fake-mon.mjs";

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
  // Power −1 is a move the game prices from the situation.
  "Gyro Ball": ["Steel", 0, -1],
};
// Every move the game knows has an id, and a slot on a mon holds it: a preview row carries those ids over (#574).
const MOVE_IDS = Object.fromEntries(Object.keys(MOVES).map((n, i) => [n, i + 1]));
const gameMove = name => ({ id: MOVE_IDS[name], name, type: TY.indexOf(MOVES[name][0]), category: MOVES[name][1], power: MOVES[name][2] });
const mon = (sp, level, { boss = 0, moves = ["Tackle"] } = {}) => ({
  species: sp, name: sp.name, level, bossSegments: boss, shiny: false,
  getTypes: () => sp.types, getAbility: () => ({ name: "Sturdy" }), hasPassive: () => false,
  getMaxHp: () => 50 + level * 2, getStat: i => 20 + level + i, getIconAtlasKey: () => "k", getIconId: () => String(sp.speciesId),
  moveset: moves.map(n => ({ moveId: MOVE_IDS[n], getName: () => n, getMove: () => gameMove(n) })),
  destroy() { destroyed++; },
});

let nextId = 1;
const pk = (name, level, types, moves, luck = 1, hp = 100) => ({
  id: nextId++, name, level, hp, luck,
  getMaxHp: () => 100, getLuck: () => luck, isAllowedInBattle: () => true,
  getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  species: { speciesId: 90 + nextId, baseTotal: 500, getEvolutionLevels: () => [] },
  moveset: moves.map(n => ({ moveId: n, getName: () => n, getMove: () => gameMove(n) })),
});

// The classic fixed-battle table and its pinned rewards (game-code.md §12).
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

const makeTrainer = (scene, name, size, roster, foeMoves) => ({
  name, config: { trainerType: 20, hasStaticParty: true }, isDouble: () => false, getName: () => name,
  getPartyLevels: w => Array.from({ length: size }, () => Math.round(w / 2)),
  genPartyMember(index) {
    let ret;
    scene.executeWithSeedOffset(() => {
      ret = mon(species(roster[index % roster.length]), scene.currentBattle.enemyLevels[index], { moves: foeMoves });
    }, 20 + ((index + 1) << 8));
    return ret;
  },
  destroy() { destroyed++; },
});

const makeScene = ({ wave, party = [], roster = [1, 2], offsetGym = false, wildSpecies = 5, modifiers = [], challenges = [],
  foeMoves = ["Earthquake", "Dragon Claw"] } = {}) => {
  const seed = "kAbC12";
  const scene = {
    seed, waveSeed: shiftCharCodes(seed, wave), rngOffset: 0, rngSeedOverride: "", offsetGym, waveCycleOffset: 0,
    money: 5000, modifiers, arena: { biomeId: 7 }, mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 3 },
    phaseManager: { pushPhase() {}, unshiftPhase() {}, pushNew() {}, unshiftNew() {}, queueMessage() {},
      queueAbilityDisplay() {}, hideAbilityBar() {}, queueFaintPhase() {} },
    getPlayerParty: () => party, getEnemyParty: () => scene.currentBattle?.enemyParty ?? [],
    gameMode: {
      isEndless: false, isClassic: true, hasChallenge: () => false, challenges,
      isWaveFinal: w => w === 200,
      isBoss: w => w % 10 === 0,
      isFixedBattle: w => FIXED_NAMES[w] != null,
      // No classic config calls `setDouble`, so `double` stays unset (game-code.md §16).
      getFixedBattle: w => (FIXED_NAMES[w] == null ? undefined : {
        battleType: 1, seedOffsetWaveIndex: 0, customModifierRewardSettings: REWARDS[w],
        getTrainer: () => makeTrainer(scene, FIXED_NAMES[w], 2, roster, foeMoves),
      }),
      // `isWaveTrainer`'s gym rule alone, without its roll (game-code.md §12).
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
    generateNewBattleTrainer: w => makeTrainer(scene, "Youngster", 2, roster, foeMoves),
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

const mount = opts => {
  const scene = makeScene(opts);
  mountHud({ scene, rnd: RND });
  const { aheadModel, partyLuck, learnRoster, doubleOdds } = globalThis.__hud["49-ahead"];
  const { drawAhead } = globalThis.__hud["95-render-ahead"], { aheadSummary } = globalThis.__hud["49-ahead"];
  const { readRun } = globalThis.__hud["26-run"];
  return { scene, ah: { aheadModel: s => readRun(s, aheadModel), partyLuck, drawAhead, aheadSummary, learnRoster, doubleOdds } };
};

const team = () => [pk("Milotic", 18, ["Water"], ["Surf", "Ice Beam"]), pk("Lucario", 18, ["Fighting", "Steel"], ["Earthquake"])];
const card = (ah, m) => ah.drawAhead(m).map(n => panelText(n)).filter(Boolean).join("\n");

// ---- The schedule follows the calendar's precedence and the run's gym offset
{
  const { scene, ah } = mount({ wave: 1, party: team() });
  const m = ah.aheadModel(scene);
  console.log(`== schedule from wave 1 ${JSON.stringify(m.schedule)}`);
  assert.deepEqual(m.schedule.map(f => [f.wave, f.kind]), [[5, "fixed"], [8, "fixed"], [10, "boss"], [20, "gym"]]);
  const { scene: s2, ah: ah2 } = mount({ wave: 186, party: team() });
  const m2 = ah2.aheadModel(s2);
  console.log(`== schedule from wave 186 ${JSON.stringify(m2.schedule)}`);
  assert.deepEqual(m2.schedule.map(f => [f.wave, f.kind]), [[188, "fixed"], [190, "fixed"], [195, "fixed"], [200, "final"]]);
  const roster = ah2.learnRoster(m2);
  assert.deepEqual([roster.wave, roster.exact, roster.foes.map(f => f.name)], [188, true, ["Garchomp", "Lucario"]]);
  assert.deepEqual([roster.foes[0].statusMoves, roster.foes[0].healMoves], [[], []]);
  const { scene: s3, ah: ah3 } = mount({ wave: 11, party: team(), offsetGym: true });
  assert.equal(ah3.aheadModel(s3).schedule.find(f => f.kind === "gym").wave, 30);
}

// ---- A grunt's name is marked unsure while its roster stays exact (game-code.md §12)
{
  const { scene, ah } = mount({ wave: 31, party: team() });
  const m = ah.aheadModel(scene);
  console.log(`== grunt ahead ${JSON.stringify({ wave: m.next.wave, who: m.next.trainer, exact: m.next.exact })}`);
  assert.equal(m.next.wave, 35);
  assert.equal(m.next.exact, true, "the party is keyed on the run seed");
  assert.match(ah.aheadSummary(m), /Grunt≈/, "but the name rides the unseeded double");
}

// ---- The Elite Four sits in a stretch with no heal, and Limited Support 1 has no heal at all
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
  const { scene: s3, ah: ah3 } = mount({ wave: 17, party: team(), challenges: [{ id: 8, value: 1 }] });
  const m3 = ah3.aheadModel(s3);
  console.log(`== limited support 1: heal ${JSON.stringify(m3.heal)} · ${m3.fightsBeforeHeal} fights before it`);
  assert.equal(m3.heal, null, "no full heal in the run at all");
  assert.equal(m3.fightsBeforeHeal, 5, "with no heal ahead, every big fight the schedule holds counts");
  assert.match(ah3.aheadSummary(m3), /no full heal left before the final wave/);
}

// ---- Readiness is judged against the roster the preview names
{
  const { scene, ah } = mount({ wave: 24, party: team() });
  const m = ah.aheadModel(scene);
  console.log(`== ready ${JSON.stringify({ who: m.next.trainer, exact: m.next.exact, verdict: m.readiness.verdict, notes: m.readiness.notes.map(n => n.text) })}`);
  assert.deepEqual(m.readiness.unanswered, [], "Ice Beam answers the Garchomp, Earthquake the Lucario");
  assert.equal(m.next.trainer, "Rival 2");
  assert.equal(m.next.exact, true, "a fixed battle's roster is exact end to end");
  assert.equal(m.readiness.verdict, "ready");
  console.log(`== card\n${card(ah, m)}`);

  const weak = [pk("Pidgeot", 8, ["Normal", "Flying"], ["Tackle"]), pk("Pidgey", 7, ["Normal", "Flying"], ["Tackle"])];
  const { scene: s2, ah: ah2 } = mount({ wave: 24, party: weak });
  const m2 = ah2.aheadModel(s2);
  console.log(`== risky ${JSON.stringify({ verdict: m2.readiness.verdict, unanswered: m2.readiness.unanswered, gap: m2.readiness.levelGap, notes: m2.readiness.notes.map(n => n.text) })}`);
  assert.equal(m2.readiness.verdict, "risky");
  assert.deepEqual(m2.readiness.unanswered, ["Garchomp", "Lucario"]);
  assert.ok(m2.readiness.levelGap < 0, "they out-level us");
  console.log(`== card\n${card(ah2, m2)}`);
  console.log(`summary ${JSON.stringify(ah2.aheadSummary(m2))}`);

  // The preview dropped a variable-power move, the foes' own types stood in, and an Ice party facing Gyro Ball was
  // warned of Dragon rather than the Steel aimed at it (#266).
  const icy = [pk("Glaceon", 60, ["Ice"], ["Ice Beam"]), pk("Vanilluxe", 60, ["Ice"], ["Ice Beam"])];
  const { scene: s4, ah: ah4 } = mount({ wave: 24, party: icy, roster: [1, 3], foeMoves: ["Gyro Ball"] });
  const m4 = ah4.aheadModel(s4);
  assert.ok(!m4.next.foes.some(f => f.types.includes("Steel")), `the typing offers no Steel: ${JSON.stringify(m4.next.foes.map(f => f.types))}`);
  assert.deepEqual(m4.readiness.threats.map(x => x.type), ["Steel"], `a variable-power STAB is a threat: ${JSON.stringify(m4.readiness.threats)}`);
  assert.ok(m4.readiness.notes.some(n => n.text === "2 of us weak to Steel"), JSON.stringify(m4.readiness.notes.map(n => n.text)));
  console.log(`== variable power ${JSON.stringify({ threats: m4.readiness.threats, verdict: m4.readiness.verdict })}`);
}

// ---- Readiness judges the party at the fight: a fainted member with a way back counts, dead weight does not
{
  const hurt = () => [pk("Milotic", 18, ["Water"], ["Surf", "Ice Beam"], 1, 0),
    pk("Lucario", 18, ["Fighting", "Steel"], ["Earthquake"])];
  const shown = r => JSON.stringify({ verdict: r.verdict, hitters: r.hitters, unanswered: r.unanswered });
  const { scene, ah } = mount({ wave: 24, party: hurt() });
  const m = ah.aheadModel(scene);
  console.log(`== fainted, shop on W24 ${shown(m.readiness)}`);
  assert.equal(m.readiness.verdict, "ready", "W24's own clear opens the shop row, so the Revive is there before W25");
  assert.deepEqual(m.readiness.hitters, ["Milotic", "Lucario"], "counted at full health, hurt as it is now");

  const { scene: s2, ah: ah2 } = mount({ wave: 24, party: hurt(), challenges: [{ id: 9, value: 1 }] });
  const m2 = ah2.aheadModel(s2);
  console.log(`== fainted under hardcore ${shown(m2.readiness)}`);
  assert.deepEqual(m2.readiness.hitters, ["Lucario"], "Hardcore takes the Revive off the row: Milotic holds its slot at zero");
  assert.deepEqual(m2.readiness.unanswered, ["Garchomp"], "its Ice Beam went with it");
  assert.equal(m2.readiness.verdict, "watch");
  console.log(`== card\n${card(ah2, m2)}`);
}

// ---- Party luck buys a tier-upgrade chance, which a wave with pinned rewards denies
{
  const { scene, ah } = mount({ wave: 24, party: [pk("Milotic", 90, ["Water"], ["Surf"], 7), pk("Lucario", 88, ["Fighting"], ["Earthquake"], 7)] });
  const m = ah.aheadModel(scene);
  console.log(`== luck ${JSON.stringify(m.luck)}`);
  assert.equal(m.luck.value, 14, "clamped to 14");
  assert.equal(m.luck.grade, "SSS");
  assert.equal(m.luck.upgradePct, 14.3, "4 / floor(512 / 18)");
  const { scene: s0, ah: ah0 } = mount({ wave: 24, party: [pk("Milotic", 90, ["Water"], ["Surf"], 0)] });
  assert.equal(ah0.aheadModel(s0).luck.upgradePct, 3.1, "4 / 128 at luck 0");
  const { scene: s25, ah: ah25 } = mount({ wave: 25, party: team() });
  const m25 = ah25.aheadModel(s25);
  console.log(`== pinned rewards after wave 25 ${JSON.stringify(m25.thisWave)}`);
  assert.deepEqual(m25.thisWave, { tiers: ["Ultra", "Great", "Great"], luckUpgrades: false });
  assert.equal(ah25.aheadModel(makeScene({ wave: 24, party: team() })).thisWave, null, "an ordinary wave pins nothing");
}

// ---- The Eternatus checklist is up from wave 190, and reads its roster only near 200
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
  const { scene: s1, ah: ah1 } = mount({ wave: 198, party: [pk("Milotic", 100, ["Water"], ["Surf"])], wildSpecies: 4 });
  assert.ok(ah1.aheadModel(s1).eternatus.facts.some(f => /double battle/.test(f.text)), "a one-mon party is warned");
  console.log(`== card\n${card(ah, m)}`);
  const { scene: s190, ah: ah190 } = mount({ wave: 190, party: team(), wildSpecies: 4 });
  const m190 = ah190.aheadModel(s190);
  assert.ok(m190.eternatus, "up from wave 190, with two shops left");
  assert.equal(m190.eternatus.foe, null, "ten waves out, no roster is read");
  assert.equal(m190.next.wave, 195, "the rival is still the next fight");
  const { scene: s2, ah: ah2 } = mount({ wave: 100, party: team() });
  assert.equal(ah2.aheadModel(s2).eternatus, null);
}

// ---- With no game mode the model stands down rather than guessing
{
  const { scene, ah } = mount({ wave: 24, party: team() });
  delete scene.gameMode.isFixedBattle;
  assert.equal(ah.aheadModel(scene), null);
  assert.deepEqual(ah.drawAhead(null), []);
  assert.equal(ah.aheadSummary(null), null);
}

// ---- The road reaches the next big fight wherever it is, and a roster read across a biome change is a guess (#591)
{
  const { scene, ah } = mount({ wave: 1, party: team() });
  const m = ah.aheadModel(scene);
  assert.equal(m.next.wave, 5);
  assert.equal(m.next.trainer, "Youngster", "four waves out is near enough to read");

  const { scene: s6, ah: ah6 } = mount({ wave: 14, party: team() });
  const six = ah6.aheadModel(s6);
  assert.deepEqual([six.next.wave, six.next.kind, six.next.in], [20, "gym", 6]);
  assert.ok(six.readiness, "six waves out, readiness is judged against the gym's roster");
  assert.deepEqual(six.readiness.unanswered, [], "Ice Beam answers the Garchomp, Earthquake the Lucario");
  assert.equal(six.next.confidence.foes, "replay", "read in the biome it is fought in, the roster keeps its replay");
  assert.ok(ah6.aheadSummary(six).startsWith("Youngster~ "), "and so does the trainer's name");
  assert.equal(ah6.learnRoster(six)?.wave, 20, "and a learned move is judged against the same fight");
  console.log(`== six out ${JSON.stringify({ wave: six.next.wave, who: six.next.trainer, verdict: six.readiness.verdict, confidence: six.next.confidence })}`);
  console.log(`== card\n${card(ah6, six)}`);
  console.log(`summary ${JSON.stringify(ah6.aheadSummary(six))}`);

  const { scene: s2, ah: ah2 } = mount({ wave: 100, party: team() });
  const far = ah2.aheadModel(s2);
  assert.equal(far.next.wave, 110);
  assert.equal(far.next.kind, "gym", "110 is a gym wave, which outranks its being a tenth wave");
  assert.equal(far.next.in, 10, "every tenth wave is a boss, so the next big fight is never further");
  assert.ok(far.next.foes.length, "ten waves out, the roster is read");
  assert.ok(far.readiness, "and readiness reaches it");
  assert.deepEqual(far.next.confidence, { type: "exact", trainer: "estimate", foes: "estimate", double: "estimate", levels: "estimate" },
    "read on the X0 before it, the gym leader is the old biome's");
  assert.equal(far.next.exact, false);
  assert.ok(ah2.aheadSummary(far).startsWith("Youngster≈ "), "the trainer's name is marked an estimate (#678)");
  const roster = ah2.learnRoster(far);
  assert.deepEqual(roster && [roster.wave, roster.exact], [110, false]);
  console.log(`== ten out ${JSON.stringify({ wave: far.next.wave, who: far.next.trainer, verdict: far.readiness.verdict, confidence: far.next.confidence })}`);
  console.log(`== card\n${card(ah2, far)}`);
  console.log(`summary ${JSON.stringify(ah2.aheadSummary(far))}`);
}

// ---- The threat set's roster half is the road's next fight, named as the road names it, as sure as its preview (#592)
{
  const read = (wave, fight) => {
    const { scene } = mount({ wave, party: team() });
    // The move table a combatant looks its moveset up in, which a preview row hands over by id (#574).
    globalThis.__hud["04-game-tables"].setGameTables({ moves: Object.keys(MOVES).reduce((t, n) => { t[MOVE_IDS[n]] = gameMove(n); return t; }, []) });
    const { rosterThreats } = globalThis.__hud["11-threats"];
    const { aheadModel } = globalThis.__hud["49-ahead"];
    const rnd = RND.state();
    const out = globalThis.__hud["26-run"].readRun(scene, run => ({ r: rosterThreats(run, fight), next: aheadModel(run).next }));
    assert.equal(RND.state(), rnd, "the replay behind the roster leaves the run's stream where it stood");
    assert.equal(globalThis.__hud["01-core"].sandboxBreachCount(), 0);
    return out;
  };
  const shown = r => r && JSON.stringify({ wave: r.wave, name: r.name, confidence: r.confidence,
    threats: r.threats.map(t => `${t.label} ${t.combatant.stats.join("/")} ${t.combatant.moveset.map(pm => pm.getName()).join("+")}`) });
  for (const [wave, fight] of [[1, 5], [14, 20], [100, 110]]) {
    const { r, next } = read(wave, fight);
    console.log(`== roster from wave ${wave} ${shown(r)}`);
    assert.equal(r.wave, next.wave, "the road's next fight");
    assert.deepEqual(r.threats.map(t => t.label), next.foes.map(f => `${f.name} L${f.level}`), "one threat per foe it fields");
    r.threats.forEach((t, i) => {
      assert.deepEqual(t.combatant.stats, next.foes[i].stats, "rebuilt off the preview's own stat row");
      assert.deepEqual(t.combatant.moveset.map(pm => pm.moveId), next.foes[i].moveIds, "with its moves by id");
      assert.equal(t.kind, "roster");
      assert.equal(t.fight, r.name);
      assert.equal(t.confidence, r.confidence);
    });
  }
  assert.deepEqual([read(1, 5).r.name, read(1, 5).r.confidence], ["Youngster W5", "exact"], "a fixed battle is exact");
  assert.deepEqual([read(14, 20).r.name, read(14, 20).r.confidence], ["Youngster W20~", "replay"],
    "a gym read in the biome it is fought in keeps its replay");
  assert.deepEqual([read(100, 110).r.name, read(100, 110).r.confidence], ["Youngster W110≈", "estimate"],
    "read on the X0 before it, a gym leader is an estimate (#591), marked ≈ (#678)");
  assert.equal(read(14, 30).r, null, "a fight past the road's next is no roster");
  assert.equal(read(1, 8).r, null, "nor is one the road reaches only after another");
  const { scene } = mount({ wave: 24, party: team() });
  delete scene.gameMode.isFixedBattle;
  assert.equal(globalThis.__hud["26-run"].readRun(scene, run => globalThis.__hud["11-threats"].rosterThreats(run, 25)), null,
    "and with no road to read, there is no roster to stand beside the standard threats");
}

// ---- Double-battle odds ahead follow the game's chance, its abilities and the grunts' unseeded roll (game-code.md §16)
{
  const { scene, ah } = mount({ wave: 40, party: team() });
  assert.equal(ah.doubleOdds(scene, 41, 4), 1 / 8, "the flat chance on an ordinary wave");
  // 1/32 on an X0 (game-code.md §16).
  assert.equal(ah.doubleOdds(scene, 47, 4), (1 / 8 + 1 / 8 + 1 / 8 + 1 / 32) / 4);
  // `DoubleBattleChanceAbAttr` is four abilities, not two (game-code.md §16).
  const durant = pk("Durant", 18, ["Bug", "Steel"], ["Tackle"]);
  durant.getAbility = () => ({ name: "No Guard" });
  const { scene: sng, ah: ahng } = mount({ wave: 40, party: [durant, ...team()] });
  assert.equal(ahng.doubleOdds(sng, 41, 4), 1 / 2, "No Guard on the field: 8 → 2");
  const dondozo = pk("Dondozo", 18, ["Water"], ["Tackle"]);
  dondozo.getAbility = () => ({ name: "Commander" });
  const { scene: sc, ah: ahc } = mount({ wave: 40, party: [dondozo, ...team()] });
  assert.equal(ahc.doubleOdds(sc, 41, 4), 1 / 2, "and so does Commander");
  // A grunt wave's double is an unseeded `randInt(3)` (game-code.md §16).
  console.log(`== doubles ahead  41–44 ${ah.doubleOdds(scene, 41, 4)}  grunt 35 ${ah.doubleOdds(scene, 35, 1)}`
    + `  admin 66 ${ah.doubleOdds(scene, 66, 1)}  rival 25 ${ah.doubleOdds(scene, 25, 1)}`);
  assert.equal(ah.doubleOdds(scene, 35, 1), 1 / 3, "an evil-team grunt is a double one time in three");
  for (const w of [62, 64, 112]) assert.equal(ah.doubleOdds(scene, w, 1), 1 / 3, `grunt wave ${w}`);
  assert.equal(ah.doubleOdds(scene, 66, 1), 0, "an admin takes no such roll");
  assert.equal(ah.doubleOdds(scene, 25, 1), 0, "nor does a rival");
  assert.equal(ah.doubleOdds(scene, 200, 1), 0, "and the final wave is never double");
}

// ---- A switch reorders the party and nothing else: the preview is served from the memo, not replayed (#563).
{
  const party = team();
  const { scene } = mount({ wave: 24, party });
  const { readRun } = globalThis.__hud["26-run"];
  const { aheadModel } = globalThis.__hud["49-ahead"];
  const { previewNext } = globalThis.__hud["48-preview"];
  const road = () => readRun(scene, run => ({ ahead: aheadModel(run), preview: previewNext(run) }));
  const before = road();
  party.reverse();
  destroyed = 0;
  const after = road();
  assert.deepEqual(after.ahead.next, before.ahead.next, "the look-ahead's road is the same");
  assert.equal(after.preview, before.preview, "the preview is the memo's");
  assert.equal(destroyed, 0, "nothing was replayed");
  console.log(`== switched in ${party[0].name}: road served from the memo`);
}

// ---- A level-up, a faint or a move learned rebuilds the readiness, and replays nothing (#922)
{
  const party = team();
  // Hardcore, so a faint keeps the member off the fight (game-code.md §12).
  const { scene, ah } = mount({ wave: 24, party, challenges: [{ id: 9, value: 1 }] });
  const before = ah.aheadModel(scene);
  const steps = {
    "a level-up": () => { party[0].level = 30; },
    "a faint": () => { party[1].hp = 0; },
    "a move learned": () => { party[0].moveset.push({ moveId: "Earthquake", getName: () => "Earthquake", getMove: () => gameMove("Earthquake") }); },
  };
  let last = before;
  for (const [what, change] of Object.entries(steps)) {
    change();
    destroyed = 0;
    const now = ah.aheadModel(scene);
    assert.equal(destroyed, 0, `${what}: nothing replayed`);
    assert.notDeepEqual(now.readiness, last.readiness, `${what}: the readiness is rebuilt`);
    assert.deepEqual(now.next, before.next, `${what}: the road ahead is the same`);
    console.log(`== ${what}: ${now.readiness.verdict} · ${now.readiness.notes.map(n => n.text).join("; ")}`);
    last = now;
  }
  assert.equal(ah.aheadModel(scene), last, "an unchanged party is the memo's");
}

// ---- On a cleared wave the road's next fight is the run read's next big fight, around Rival 2 on 25 (#587, #877)
for (const [wave, fight] of [[24, 25], [25, 30], [26, 30]]) {
  const { scene } = mount({ wave, party: team() });
  const { aheadModel } = globalThis.__hud["49-ahead"];
  const [road, next] = globalThis.__hud["26-run"].readRun(scene, run => [aheadModel(run).next.wave, run.nextFight.fight],
    { cleared: true });
  assert.equal(road, fight, `W${wave}: the road's next fight`);
  assert.equal(next, road, `W${wave}: the fight the team audit's "first to replace" is judged at is the judgments' own`);
}

console.log("ok");
