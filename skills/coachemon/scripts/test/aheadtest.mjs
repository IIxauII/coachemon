import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

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
  // Power −1 is a move the game prices from the situation.
  "Gyro Ball": ["Steel", 0, -1],
};
const gameMove = name => ({ name, type: TY.indexOf(MOVES[name][0]), category: MOVES[name][1], power: MOVES[name][2] });
const mon = (sp, level, { boss = 0, moves = ["Tackle"] } = {}) => ({
  species: sp, name: sp.name, level, bossSegments: boss, shiny: false,
  getTypes: () => sp.types, getAbility: () => ({ name: "Sturdy" }), hasPassive: () => false,
  getMaxHp: () => 50 + level * 2, getStat: i => 20 + level + i, getIconAtlasKey: () => "k", getIconId: () => String(sp.speciesId),
  moveset: moves.map(n => ({ getName: () => n, getMove: () => gameMove(n) })),
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
  globalThis.window = globalThis;
  delete globalThis.__coachHud;
  const scene = makeScene(opts);
  globalThis.Phaser = { Math: { RND }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const { aheadModel, partyLuck, learnRoster, doubleOdds } = globalThis.__hud["49-ahead"];
  const { drawAhead } = globalThis.__hud["95-render-ahead"], { aheadSummary } = globalThis.__hud["49-ahead"];
  const { readRun } = globalThis.__hud["26-run"];
  return { scene, ah: { aheadModel: s => readRun(s, aheadModel), partyLuck, drawAhead, aheadSummary, learnRoster, doubleOdds } };
};

const team = () => [pk("Milotic", 18, ["Water"], ["Surf", "Ice Beam"]), pk("Lucario", 18, ["Fighting", "Steel"], ["Earthquake"])];
const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const card = (ah, m) => ah.drawAhead(m).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

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

// ---- The calendar names a fight at any distance, and the roster is read only once it is near
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

console.log("ok");
