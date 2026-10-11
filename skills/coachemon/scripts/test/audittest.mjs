import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

class ModifierType {}
class PokemonModifierType extends ModifierType {}
class RememberMoveModifierType extends PokemonModifierType {}
class AddPokeballModifierType extends ModifierType {}
class ExpBoosterModifier {}
class ExpShareModifier {}
const mk = (C, f) => Object.assign(new C(), f);

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const MOVES = {};
let nextId = 1;
const move = (name, type, power, category, accuracy = 100, f = {}) => {
  const id = nextId++;
  MOVES[id] = { id, name, type: TY.indexOf(type), power, category, accuracy, moveTarget: f.moveTarget ?? 3, priority: f.priority ?? 0, chance: -1,
    isChargingMove: () => false, attrs: (f.attrs ?? []).map(([n, a]) => Object.assign({ constructor: { name: n } }, a)),
    chargeAttrs: [], restrictions: [], conditions: [], hasFlag: () => false };
  return id;
};
const stat = (stats, stages, moveTarget, selfTarget) => ({ attrs: [["StatStageChangeAttr", { stats, stages, selfTarget }]], moveTarget });
const M = {
  pound: move("Pound", "Normal", 40, 0), babyDollEyes: move("Baby-Doll Eyes", "Fairy", -1, 2, 100, { ...stat([1], -1, 3), priority: 1 }),
  helpingHand: move("Helping Hand", "Normal", -1, 2, -1, { attrs: [["AddBattlerTagAttr", { tagType: "HELPING_HAND" }]], moveTarget: 10 }),
  sing: move("Sing", "Normal", -1, 2, 55, { attrs: [["StatusEffectAttr", { effect: 4 }]] }),
  howl: move("Howl", "Normal", -1, 2, -1, stat([1], 1, 13)), leer: move("Leer", "Normal", -1, 2, 100, { ...stat([2], -1, 6) }),
  ember: move("Ember", "Fire", 40, 1), bite: move("Bite", "Dark", 60, 0), scratch: move("Scratch", "Normal", 40, 0),
  mudSlap: move("Mud-Slap", "Ground", 20, 1), sandAttack: move("Sand Attack", "Ground", -1, 2, 100, stat([7], -1, 3)),
  bulldoze: move("Bulldoze", "Ground", 60, 0),
  flameCharge: move("Flame Charge", "Fire", 50, 0), acrobatics: move("Acrobatics", "Flying", 55, 0),
  takeDown: move("Take Down", "Normal", 90, 0, 85), waterGun: move("Water Gun", "Water", 40, 1),
  precipiceBlades: move("Precipice Blades", "Ground", 120, 0, 85), scaryFace: move("Scary Face", "Normal", -1, 2, 100, stat([5], -2, 3)),
  thrash: move("Thrash", "Normal", 120, 0), amnesia: move("Amnesia", "Psychic", -1, 2, -1, stat([4], 2, 0, true)),
  iceShard: move("Ice Shard", "Ice", 40, 0, 100, { priority: 1 }), icicleCrash: move("Icicle Crash", "Ice", 85, 0, 90),
  toxic: move("Toxic", "Poison", -1, 2, 90, { attrs: [["StatusEffectAttr", { effect: 2 }]] }), crossPoison: move("Cross Poison", "Poison", 70, 0),
  wingAttack: move("Wing Attack", "Flying", 60, 0), crunch: move("Crunch", "Dark", 80, 0),
  zenHeadbutt: move("Zen Headbutt", "Psychic", 80, 0, 90), psyshieldBash: move("Psyshield Bash", "Psychic", 90, 0, 90),
  meteorMash: move("Meteor Mash", "Steel", 90, 0, 90), hammerArm: move("Hammer Arm", "Fighting", 100, 0, 90),
  surf: move("Surf", "Water", 90, 1), soak: move("Soak", "Water", -1, 2, 100, { attrs: [["ChangeTypeAttr", { type: TY.indexOf("Water") }]] }), aquaTail: move("Aqua Tail", "Water", 90, 0, 90),
  playRough: move("Play Rough", "Fairy", 90, 0, 90), synthesis: move("Synthesis", "Grass", -1, 2, -1, { attrs: [["PlantHealAttr", {}]], moveTarget: 0 }),
  gigaDrain: move("Giga Drain", "Grass", 75, 1), petalDance: move("Petal Dance", "Grass", 120, 1, 100, { attrs: [["FrenzyAttr", {}]] }),
  boomburst: move("Boomburst", "Normal", 140, 1, 100, { moveTarget: 4 }), hyperDrill: move("Hyper Drill", "Normal", 120, 0),
  drillRun: move("Drill Run", "Ground", 80, 0, 95), blizzard: move("Blizzard", "Ice", 110, 1, 70, { moveTarget: 6 }),
};
class PokemonMove {
  constructor(id) { this.moveId = id; this.ppUsed = 0; }
  getMove() { return MOVES[this.moveId]; }
  getName() { return MOVES[this.moveId].name; }
  getMovePp() { return 10; }
}
let monId = 0;
// `base` is the species' real base-stat row, [HP, Atk, Def, SpA, SpD, Spe]. Without one 09-combatant builds no duel
// from the member, so the party has no team value and no weakest member to put first to replace (#582). It is the
// species' own row rather than one back-computed from `s`: `s` is what this fixture says the member's stats are and
// the audit's speed and offence checks read those, while a duel computes its own from the base row.
const pk = (name, level, types, moves, s, base, f = {}) => ({
  id: ++monId, name, level, hp: f.hp ?? 100, getMaxHp: () => 100, status: null, getIconAtlasKey: () => "k", getIconId: () => 1,
  getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: f.ability ?? "x" }), hasPassive: () => false,
  getStat: i => ({ 1: s[0], 2: s[1], 3: s[2], 4: s[3], 5: s[4] }[i] ?? 100), getNature: () => 0, getLuck: () => 0,
  calculateBaseStats: () => base.slice(),
  species: { speciesId: 1000 + monId, name, baseStats: base.slice(), baseTotal: base.reduce((t, x) => t + x, 0), getEvolutionLevels: () => [] },
  moveset: moves.map(id => new PokemonMove(id)),
  getLearnableLevelMoves: () => (f.learnable ?? []).map(id => [1, id]),
});

// The species table the standard threats are built against, which is what puts a team value — and so a weakest
// member — on a party at all (#582). Real species with their real base stats, one for every type, each listed in the
// randbats snapshot the bundle carries so the join the HUD does in the page is the join here. The move table is the
// snapshot's own names, every one an untyped attack of 80: what a threat brings is threatstest's and judgmenttest's
// subject, not this file's.
const THREAT_DEX = [
  [3, "Venusaur", ["Grass", "Poison"], [80, 82, 83, 100, 100, 80]],
  [59, "Arcanine", ["Fire"], [90, 110, 80, 100, 80, 95]],
  [65, "Alakazam", ["Psychic"], [55, 50, 45, 135, 95, 120]],
  [68, "Machamp", ["Fighting"], [90, 130, 80, 65, 85, 55]],
  [76, "Golem", ["Rock", "Ground"], [80, 120, 130, 55, 65, 45]],
  [94, "Gengar", ["Ghost", "Poison"], [60, 65, 60, 130, 75, 110]],
  [121, "Starmie", ["Water", "Psychic"], [60, 75, 85, 100, 85, 115]],
  [130, "Gyarados", ["Water", "Flying"], [95, 125, 79, 60, 100, 81]],
  [143, "Snorlax", ["Normal"], [160, 110, 65, 65, 110, 30]],
  [149, "Dragonite", ["Dragon", "Flying"], [91, 134, 95, 100, 100, 80]],
  [197, "Umbreon", ["Dark"], [95, 65, 110, 60, 130, 65]],
  [205, "Forretress", ["Bug", "Steel"], [75, 90, 140, 60, 60, 40]],
  [210, "Granbull", ["Fairy"], [90, 120, 75, 60, 60, 45]],
  [212, "Scizor", ["Bug", "Steel"], [70, 130, 100, 55, 80, 65]],
  [462, "Magnezone", ["Electric", "Steel"], [70, 70, 115, 130, 90, 60]],
  [473, "Mamoswine", ["Ice", "Ground"], [110, 130, 80, 70, 60, 80]],
];
// Lazy: the snapshot comes out of the bundle, which only a mount has evaluated.
const threatTables = () => {
  const dex = THREAT_DEX.map(([speciesId, name, types, baseStats]) => ({
    speciesId, name, baseStats, baseTotal: baseStats.reduce((t, x) => t + x, 0),
    type1: TY.indexOf(types[0]), type2: types[1] == null ? null : TY.indexOf(types[1]),
    getEvolutionLevels: () => [], forms: [],
  }));
  const moves = [null];
  for (const name of globalThis.__hud["05-randbats"].RANDBATS.m) {
    moves.push({ id: moves.length, name, type: 0, power: 80, accuracy: 100, category: 0, pp: 10, moveTarget: 3,
      priority: 0, chance: -1, attrs: [], chargeAttrs: [], restrictions: [], conditions: [],
      isChargingMove: () => false, hasFlag: () => false });
  }
  return { species: { getAllSpecies: () => dex, getSpecies: id => dex.find(s => s.speciesId === id) ?? null }, moves };
};
// Display only: a cost of a hair below zero prints as "-0.0" otherwise.
const turns = n => (n.toFixed(1) === "-0.0" ? "0.0" : n.toFixed(1));
const ladder = (scene, fight) =>
  globalThis.__hud["26-run"].readRun(scene, run => globalThis.__hud["12-value"].weakestMember(run, { fight }))
    .ranked.map(r => `${r.name}${r.dead ? ` ${r.dead}` : ""} ${turns(r.cost)}`).join(" · ");

const whitneyParty = ({ diglett = {} } = {}) => [
  pk("Fletchinder", 23, ["Fire", "Flying"], [M.flameCharge, M.acrobatics], [60, 50, 50, 45, 80], [62, 73, 55, 56, 52, 84]),
  pk("Minccino", 22, ["Normal"], [M.pound, M.babyDollEyes, M.helpingHand, M.sing], [50, 40, 40, 40, 70], [55, 50, 40, 40, 40, 75], { learnable: [M.takeDown] }),
  pk("Oinkologne", 19, ["Normal"], [M.takeDown], [55, 50, 40, 45, 40], [110, 100, 75, 59, 80, 65]),
  pk("Houndour", 16, ["Dark", "Fire"], [M.howl, M.leer, M.ember, M.bite], [35, 25, 45, 35, 40], [45, 60, 30, 80, 50, 65]),
  pk("Wiglett", 16, ["Water"], [M.waterGun], [40, 30, 25, 30, 60], [10, 55, 25, 35, 25, 95]),
  pk("Diglett", 12, ["Ground"], [M.scratch, M.sandAttack], [30, 20, 20, 25, 50], [10, 55, 25, 35, 45, 95], { learnable: [M.mudSlap, M.bulldoze], ...diglett }),
];
const whitneyFree = () => [
  mk(RememberMoveModifierType, { name: "Memory Mushroom", iconImage: "memory_mushroom", tier: 1, selectFilter: p => (p.getLearnableLevelMoves().length ? null : "no effect") }),
  mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }),
];

const scenarios = {
  "wave 29 whitney": {
    wave: 29,
    party: () => whitneyParty(),
    free: whitneyFree(),
    expect: (a, m) => {
      const t = a.findings.map(f => f.text);
      assert.ok(t.includes("Minccino: 1 attack, 3 status moves"), t.join("\n"));
      assert.ok(t.some(x => /^Houndour: Howl boosts Atk, it attacks with SpA/.test(x)));
      assert.ok(t.some(x => /^Houndour: Leer does little/.test(x)));
      const dig = a.findings.find(f => f.text === "Diglett: no Ground attack (no STAB)");
      assert.ok(dig && dig.level === "high", "a Ground type whose one attack is Scratch");
      assert.equal(dig.relearn?.move, "Bulldoze", "the relearn list's best Ground move");
      assert.ok(t.some(x => /^Houndour L16\/Wiglett L16\/Diglett L12 trail Fletchinder L23/.test(x)) || t.some(x => /Diglett L12.*trail Fletchinder L23/.test(x)), t.join("\n"));
      assert.equal(a.vs, null, "no big fight named: party checks only");
      // Diglett's Bulldoze gains more power, but a gain is weighed by the member's share of the fight, and Minccino
      // fights at the lead's level with one attack.
      const mush = m.free[0];
      assert.equal(mush.holder.name, "Minccino", `the mushroom goes where the relearn does the most: ${mush.why}`);
      assert.match(mush.why, /relearn Take Down over (Helping Hand|Baby-Doll Eyes)/);
      assert.equal(a.findings.find(f => f.mon === "Minccino").text, "Minccino: 1 attack, 3 status moves", "the relearn hangs on the member's top finding");
      assert.equal(a.findings.find(f => f.mon === "Minccino").relearn?.move, "Take Down");
    },
  },
  // Hardcore is `Challenges.HARDCORE`, whose number only the bundle's prelude holds.
  "wave 29 whitney, diglett fainted under hardcore": {
    wave: 29, challenges: [{ id: 9, value: 1 }],
    party: () => whitneyParty({ diglett: { hp: 0 } }),
    free: whitneyFree(),
    expect: (a, m) => {
      const t = a.findings.map(f => f.text);
      // Diglett holds its slot at zero, so no check about what it brings to the fight says its name — but zero is
      // what makes it the weakest member, and the one finding that names it says so plainly (#582).
      assert.deepEqual(t.filter(x => /Diglett/.test(x)), ["Diglett is dead weight at W29 — first to replace"], t.join("\n"));
      assert.equal(a.findings.find(f => f.kind === "link").level, "high", "dead weight loses fights");
      assert.ok(t.includes("Minccino: 1 attack, 3 status moves"), t.join("\n"));
      assert.ok(t.some(x => /Houndour L16\/Wiglett L16 trail Fletchinder L23/.test(x)), t.join("\n"));
      assert.ok(t.includes("2 of 5 weak to Electric, nobody resists"),
        "five counted, and the Ground immunity that answered Electric left with Diglett");
      assert.equal(m.free[0].holder.name, "Minccino", "the mushroom still goes to the best relearn");
    },
  },
  "wave 164 guzma": {
    wave: 164, cap: 162,
    modifiers: [mk(ExpBoosterModifier, { getStackCount: () => 14 }), mk(ExpBoosterModifier, { getStackCount: () => 9 }), mk(ExpShareModifier, { getStackCount: () => 5 })],
    party: () => [
      pk("Mamoswine", 162, ["Ice", "Ground"], [M.precipiceBlades, M.scaryFace, M.thrash, M.amnesia], [414, 290, 260, 220, 328], [110, 130, 80, 70, 60, 80], { learnable: [M.iceShard, M.icicleCrash] }),
      pk("Crobat", 162, ["Poison", "Flying"], [M.toxic, M.crossPoison, M.wingAttack, M.crunch], [307, 282, 248, 291, 409], [85, 90, 80, 70, 80, 130]),
      pk("Metagross", 162, ["Steel", "Psychic"], [M.zenHeadbutt, M.psyshieldBash, M.meteorMash, M.hammerArm], [456, 504, 346, 352, 256], [80, 135, 130, 95, 90, 70]),
      pk("Golduck", 162, ["Water"], [M.surf, M.soak, M.aquaTail, M.zenHeadbutt], [324, 301, 322, 277, 316], [80, 82, 78, 95, 80, 85]),
      pk("Comfey", 162, ["Fairy"], [M.playRough, M.synthesis, M.gigaDrain, M.petalDance], [223, 307, 312, 405, 339], [51, 52, 90, 82, 110, 100]),
      pk("Dudunsparce", 162, ["Normal"], [M.boomburst, M.hyperDrill, M.drillRun, M.blizzard], [353, 278, 301, 269, 225], [125, 100, 80, 85, 75, 55]),
    ],
    // `stats`: the `Stat`-indexed row [HP, Atk, Def, SpA, SpD, Spe], as 48-preview's `foeOf` hands it over. HP is
    // the game's formula at 31 IVs off each species' own base HP; the audit reads only Speed.
    ahead: { next: { wave: 165, in: 1, kind: "fixed", label: "fixed battle", trainer: "Guzma", foes: [
      { name: "Golisopod", level: 153, types: ["Bug", "Steel"], ability: "Shell Armor", stats: [439, 581, 568, 289, 456, 176] },
      { name: "Kleavor", level: 150, types: ["Bug", "Rock"], ability: "Sharpness", stats: [416, 437, 315, 165, 278, 303] },
      { name: "Araquanid", level: 150, types: ["Water", "Bug"], ability: "Water Bubble", stats: [410, 270, 350, 215, 444, 174] },
      { name: "Xurkitree", level: 153, types: ["Electric"], ability: "Beast Boost", stats: [464, 318, 274, 578, 286, 254] },
      { name: "Flygon", level: 153, types: ["Ground", "Dragon"], ability: "Levitate", passive: "Adaptability", stats: [455, 312, 334, 315, 315, 404] },
      { name: "Buzzwole", level: 159, types: ["Bug", "Fighting"], ability: "Beast Boost", stats: [558, 478, 478, 201, 245, 334] },
    ] } },
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: (a, m, summary, party) => {
      const t = a.findings.map(f => f.text);
      assert.deepEqual(a.vs, { wave: 165, who: "Guzma" });
      assert.ok(t.includes("Flygon (W165) has one answer: Dudunsparce Blizzard (70%)"), t.join("\n"));
      assert.ok(t.includes("Araquanid (W165) has one answer: Crobat Wing Attack"), "Wing Attack is Crobat's only answer to the Bugs");
      assert.ok(t.includes("only Crobat outspeeds Flygon (Spe 404) at W165 · no priority attack"));
      assert.equal(a.findings[0].level, "high");
      assert.ok(t.some(x => /^Mamoswine: Amnesia does little/.test(x)));
      assert.ok(t.some(x => /^Mamoswine: Scary Face does little/.test(x)));
      const fix = a.findings.find(f => f.relearn && f.mon === "Mamoswine");
      assert.equal(fix?.relearn.move, "Icicle Crash");
      assert.equal(fix.slot, fix.relearn.forget, "named under the slot it replaces");
      // Soak went unscored and the dead-slot check skipped it; scored, it has to clear the bar on its own (#233).
      const soak = globalThis.__slotScores(party.find(p => p.name === "Golduck"), { double: false, party }).moves.find(x => x.name === "Soak");
      assert.equal(soak.why, "pure Water");
      assert.ok(soak.alone >= 20, `Soak scores ${soak.alone} on its own, under 50-audit's WEAK_STATUS`);
      assert.ok(!t.some(x => /^Golduck: Soak does little/.test(x)), t.join("\n"));
      // Comfey answers nothing at W165 either, which is what the retired rule read — but what names it now is the
      // team value it holds: of the six slots it is the one the party is no worse off without (#582).
      assert.ok(t.includes("the party is no worse off without Comfey at W165 — first to replace"), t.join("\n"));
      assert.equal(a.findings.find(f => f.kind === "link").mon, "Comfey");
      assert.ok(t.includes("Metagross: Zen Headbutt is a second Psychic attack (Psyshield Bash)"));
      assert.ok(t.includes("Comfey: Play Rough is physical on Atk 223 (SpA 312)"));
      assert.ok(t.includes("whole party at the Lv 162 cap: 28 EXP item stacks do nothing — take battle items"));
      assert.match(summary.audit, /^\d+ issues: \w+ \(W165\) has one answer/, "what loses the fight leads the summary");
    },
  },
  "clean": {
    wave: 40,
    party: () => [
      pk("Charizard", 40, ["Fire", "Flying"], [M.flameCharge, M.acrobatics, M.crunch], [90, 80, 100, 80, 100], [78, 84, 78, 109, 85, 100]),
      pk("Blastoise", 40, ["Water"], [M.surf, M.bite, M.icicleCrash], [100, 100, 90, 105, 80], [79, 83, 100, 85, 105, 78]),
      pk("Venusaur", 40, ["Grass", "Poison"], [M.gigaDrain, M.crossPoison, M.bulldoze], [90, 90, 100, 100, 80], [80, 82, 83, 100, 100, 80]),
    ],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
    expect: a => {
      assert.deepEqual(a.findings.filter(f => f.level === "high"), [], a.findings.map(f => f.text).join("\n"));
    },
  },
};

for (const [label, sc] of Object.entries(scenarios)) {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const party = sc.party();
  const opt = t => ({ modifierTypeOption: { type: t, cost: 0 } });
  const handler = { options: sc.free.map(opt), shopOptionsRows: [], rerollCost: 1000 };
  const scene = { money: 500, pokeballCounts: { 0: 20 }, modifiers: sc.modifiers ?? [], currentBattle: { waveIndex: sc.wave, double: false },
    ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => party, getEnemyParty: () => [],
    ...(sc.cap ? { getMaxExpLevel: () => sc.cap } : {}),
    // Only where a scenario names challenges: a `gameMode` the others never had would move what they read.
    ...(sc.challenges ? { gameMode: { isClassic: true, challenges: sc.challenges } } : {}) };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  // The chunk scan finds nothing under node, so the table stands in for what it would have found in the page. The
  // panel above drew once without it, which is the point: a card judged before the table landed must not be served
  // after (#582), and every model below is read back after this call.
  globalThis.__hud["04-game-tables"].setGameTables(threatTables());
  const { rewardsModel } = globalThis.__hud["52-shop"], { teamAudit } = globalThis.__hud["50-audit"];
  const { drawRewards } = globalThis.__hud["96-render-rewards"], { cardSummary } = globalThis.__hud["60-card"];
  // The drawer shows one group at a time (#357), so this walks every group's pane: `audit.summary` is in a heading.
  const { pane } = globalThis.__hud["90-render"];
  const { previewNext } = globalThis.__hud["48-preview"];
  const { readRun } = globalThis.__hud["26-run"];
  globalThis.__slotScores = globalThis.__hud["40-learn"].slotScores;
  assert.ok(!el.textContent, `${label}: panel error ${el.textContent}`);
  const m = readRun(scene, run => rewardsModel(run, handler));
  if (sc.ahead) m.audit = readRun(scene, run => teamAudit(run, sc.ahead));
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  console.log(`== ${label}\n` + drawRewards({ ...m, wave: sc.wave, preview: readRun(scene, previewNext) }).flatMap(pane)
    .map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  const a = m.audit;
  for (const f of a.findings) console.log(`${f.level === "high" ? "✗" : "·"} ${f.kind} ${f.text}${f.relearn ? ` ↺ ${f.relearn.move} over ${f.relearn.forget ?? "(free slot)"} +${f.relearn.gain}` : ""}`);
  // The judgment's own ladder, weakest first: the member "first to replace" names above is this line's head, not a
  // reading the audit does of its own (#582). A party of three has nobody to spare and the rule stays quiet.
  if (party.length >= 4) console.log(`weakest first ${ladder(scene, sc.ahead?.next?.wave ?? null)}`);
  console.log(`mushroom ${m.free.map(f => `${f.name}: ${f.v} ${f.why}`).join(" | ")}`);
  const summary = cardSummary(m);
  console.log(`summary ${summary.audit}`);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m), `${label}: JSON-safe`);
  sc.expect?.(a, m, summary, party);
}
console.log("ok");
