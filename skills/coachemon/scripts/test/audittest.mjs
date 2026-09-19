// Team audit (50-audit) against the two runs that asked for it (#89): the wave-29 party that lost four of six to
// Whitney, and the wave-165 party that lost to Guzma at level parity, with Guzma's roster as the look-ahead hands it
// over. Also the rewards card's Memory Mushroom, which now goes to the member whose relearn list holds the biggest
// upgrade. Prints the rendered card and the findings (golden) and asserts the calls that matter.
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
// [name, type, power, category, accuracy, { attrs, moveTarget, priority }]
const move = (name, type, power, category, accuracy = 100, f = {}) => {
  const id = nextId++;
  MOVES[id] = { id, name, type: TY.indexOf(type), power, category, accuracy, moveTarget: f.moveTarget ?? 3, priority: f.priority ?? 0, chance: -1,
    isChargingMove: () => false, attrs: (f.attrs ?? []).map(([n, a]) => Object.assign({ constructor: { name: n } }, a)),
    chargeAttrs: [], restrictions: [], conditions: [], hasFlag: () => false };
  return id;
};
const stat = (stats, stages, moveTarget, selfTarget) => ({ attrs: [["StatStageChangeAttr", { stats, stages, selfTarget }]], moveTarget });
const M = {
  // Wave 29
  pound: move("Pound", "Normal", 40, 0), babyDollEyes: move("Baby-Doll Eyes", "Fairy", -1, 2, 100, { ...stat([1], -1, 3), priority: 1 }),
  helpingHand: move("Helping Hand", "Normal", -1, 2, -1, { attrs: [["AddBattlerTagAttr", { tagType: "HELPING_HAND" }]], moveTarget: 10 }),
  sing: move("Sing", "Normal", -1, 2, 55, { attrs: [["StatusEffectAttr", { effect: 4 }]] }),
  howl: move("Howl", "Normal", -1, 2, -1, stat([1], 1, 13)), leer: move("Leer", "Normal", -1, 2, 100, { ...stat([2], -1, 6) }),
  ember: move("Ember", "Fire", 40, 1), bite: move("Bite", "Dark", 60, 0), scratch: move("Scratch", "Normal", 40, 0),
  mudSlap: move("Mud-Slap", "Ground", 20, 1), sandAttack: move("Sand Attack", "Ground", -1, 2, 100, stat([7], -1, 3)),
  bulldoze: move("Bulldoze", "Ground", 60, 0),
  flameCharge: move("Flame Charge", "Fire", 50, 0), acrobatics: move("Acrobatics", "Flying", 55, 0),
  takeDown: move("Take Down", "Normal", 90, 0, 85), waterGun: move("Water Gun", "Water", 40, 1),
  // Wave 165
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
// `learnable`: the relearn list, as `getLearnableLevelMoves()` returns it ([level, MoveId]).
const pk = (name, level, types, moves, s, f = {}) => ({
  id: ++monId, name, level, hp: f.hp ?? 100, getMaxHp: () => 100, status: null, getIconAtlasKey: () => "k", getIconId: () => 1,
  getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: f.ability ?? "x" }), hasPassive: () => false,
  getStat: i => ({ 1: s[0], 2: s[1], 3: s[2], 4: s[3], 5: s[4] }[i] ?? 100), getNature: () => 0, getLuck: () => 0,
  species: { speciesId: 1000 + monId, name, getEvolutionLevels: () => [] },
  moveset: moves.map(id => new PokemonMove(id)),
  getLearnableLevelMoves: () => (f.learnable ?? []).map(id => [1, id]),
});

const scenarios = {
  // Wave 29, before Whitney at 30: Minccino with one attack and three status moves, Houndour with Howl and Leer on a
  // special attacker, Diglett with a Normal move for its only attack eleven levels behind the lead.
  "wave 29 whitney": {
    wave: 29,
    party: () => [
      pk("Fletchinder", 23, ["Fire", "Flying"], [M.flameCharge, M.acrobatics], [60, 50, 50, 45, 80]),
      pk("Minccino", 22, ["Normal"], [M.pound, M.babyDollEyes, M.helpingHand, M.sing], [50, 40, 40, 40, 70], { learnable: [M.takeDown] }),
      pk("Oinkologne", 19, ["Normal"], [M.takeDown], [55, 50, 40, 45, 40]),
      pk("Houndour", 16, ["Dark", "Fire"], [M.howl, M.leer, M.ember, M.bite], [35, 25, 45, 35, 40]),
      pk("Wiglett", 16, ["Water"], [M.waterGun], [40, 30, 25, 30, 60]),
      pk("Diglett", 12, ["Ground"], [M.scratch, M.sandAttack], [30, 20, 20, 25, 50], { learnable: [M.mudSlap, M.bulldoze] }),
    ],
    free: [mk(RememberMoveModifierType, { name: "Memory Mushroom", iconImage: "memory_mushroom", tier: 1, selectFilter: p => (p.getLearnableLevelMoves().length ? null : "no effect") }),
      mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 })],
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
      // Diglett's Bulldoze gains more power, but Minccino fights at the lead's level and has one attack: a gain is
      // weighed by the member's share of the fight, as every held item is.
      const mush = m.free[0];
      assert.equal(mush.holder.name, "Minccino", `the mushroom goes where the relearn does the most: ${mush.why}`);
      assert.match(mush.why, /relearn Take Down over (Helping Hand|Baby-Doll Eyes)/);
      assert.equal(a.findings.find(f => f.mon === "Minccino").text, "Minccino: 1 attack, 3 status moves", "the relearn hangs on the member's top finding");
      assert.equal(a.findings.find(f => f.mon === "Minccino").relearn?.move, "Take Down");
    },
  },
  // Wave 164, Guzma next: Flygon has one answer (a 70% Blizzard), only Crobat outspeeds it, and the party sits at the
  // level cap under 28 EXP item stacks.
  "wave 164 guzma": {
    wave: 164, cap: 162,
    modifiers: [mk(ExpBoosterModifier, { getStackCount: () => 14 }), mk(ExpBoosterModifier, { getStackCount: () => 9 }), mk(ExpShareModifier, { getStackCount: () => 5 })],
    party: () => [
      pk("Mamoswine", 162, ["Ice", "Ground"], [M.precipiceBlades, M.scaryFace, M.thrash, M.amnesia], [414, 290, 260, 220, 328], { learnable: [M.iceShard, M.icicleCrash] }),
      pk("Crobat", 162, ["Poison", "Flying"], [M.toxic, M.crossPoison, M.wingAttack, M.crunch], [307, 282, 248, 291, 409]),
      pk("Metagross", 162, ["Steel", "Psychic"], [M.zenHeadbutt, M.psyshieldBash, M.meteorMash, M.hammerArm], [456, 504, 346, 352, 256]),
      pk("Golduck", 162, ["Water"], [M.surf, M.soak, M.aquaTail, M.zenHeadbutt], [324, 301, 322, 277, 316]),
      pk("Comfey", 162, ["Fairy"], [M.playRough, M.synthesis, M.gigaDrain, M.petalDance], [223, 307, 312, 405, 339]),
      pk("Dudunsparce", 162, ["Normal"], [M.boomburst, M.hyperDrill, M.drillRun, M.blizzard], [353, 278, 301, 269, 225]),
    ],
    // As 48-preview's `foeOf` hands them over: stats are [Atk, Def, SpA, SpD, Spe].
    ahead: { next: { wave: 165, in: 1, kind: "fixed", label: "fixed battle", trainer: "Guzma", foes: [
      { name: "Golisopod", level: 153, types: ["Bug", "Steel"], ability: "Shell Armor", stats: [581, 568, 289, 456, 176] },
      { name: "Kleavor", level: 150, types: ["Bug", "Rock"], ability: "Sharpness", stats: [437, 315, 165, 278, 303] },
      { name: "Araquanid", level: 150, types: ["Water", "Bug"], ability: "Water Bubble", stats: [270, 350, 215, 444, 174] },
      { name: "Xurkitree", level: 153, types: ["Electric"], ability: "Beast Boost", stats: [318, 274, 578, 286, 254] },
      { name: "Flygon", level: 153, types: ["Ground", "Dragon"], ability: "Levitate", passive: "Adaptability", stats: [312, 334, 315, 315, 404] },
      { name: "Buzzwole", level: 159, types: ["Bug", "Fighting"], ability: "Beast Boost", stats: [478, 478, 201, 245, 334] },
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
      // Soak is scored now (#233), where before nothing recognised it and the dead-slot check skipped it for being
      // unscorable. What it scores has to clear the bar on its own merits, or scoring it would have made things worse.
      const soak = globalThis.__slotScores(party.find(p => p.name === "Golduck"), { double: false, party }).moves.find(x => x.name === "Soak");
      assert.equal(soak.why, "pure Water");
      assert.ok(soak.alone >= 20, `Soak scores ${soak.alone} on its own, under 50-audit's WEAK_STATUS`);
      assert.ok(!t.some(x => /^Golduck: Soak does little/.test(x)), t.join("\n"));
      assert.ok(t.includes("Comfey answers nothing at W165 — first to replace"));
      assert.ok(t.includes("Metagross: Zen Headbutt is a second Psychic attack (Psyshield Bash)"));
      assert.ok(t.includes("Comfey: Play Rough is physical on Atk 223 (SpA 312)"));
      assert.ok(t.includes("whole party at the Lv 162 cap: 28 EXP item stacks do nothing — take battle items"));
      assert.match(summary.audit, /^\d+ issues: \w+ \(W165\) has one answer/, "what loses the fight leads the summary");
    },
  },
  // A sound team: nothing to say, nothing drawn.
  "clean": {
    wave: 40,
    party: () => [
      pk("Charizard", 40, ["Fire", "Flying"], [M.flameCharge, M.acrobatics, M.crunch], [90, 80, 100, 80, 100]),
      pk("Blastoise", 40, ["Water"], [M.surf, M.bite, M.icicleCrash], [100, 100, 90, 105, 80]),
      pk("Venusaur", 40, ["Grass", "Poison"], [M.gigaDrain, M.crossPoison, M.bulldoze], [90, 90, 100, 100, 80]),
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
    ...(sc.cap ? { getMaxExpLevel: () => sc.cap } : {}) };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const { rewardsModel } = globalThis.__hud["52-shop"], { teamAudit } = globalThis.__hud["50-audit"];
  const { drawRewards } = globalThis.__hud["96-render-rewards"], { cardSummary } = globalThis.__hud["60-card"];
  const { previewNext } = globalThis.__hud["48-preview"];
  // The learn scorer the audit's dead-slot check reads, so a scenario can assert what a slot is actually worth.
  globalThis.__slotScores = globalThis.__hud["40-learn"].slotScores;
  assert.ok(!el.textContent, `${label}: panel error ${el.textContent}`);
  // The look-ahead is the audit's input, not what this test is about: hand over the roster the scenario names, and
  // draw the card the panel would draw from that audit.
  const m = rewardsModel(scene, handler);
  if (sc.ahead) m.audit = teamAudit(scene, sc.ahead);
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  console.log(`== ${label}\n` + drawRewards({ ...m, wave: sc.wave, preview: previewNext(scene) }).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  const a = m.audit;
  for (const f of a.findings) console.log(`${f.level === "high" ? "✗" : "·"} ${f.kind} ${f.text}${f.relearn ? ` ↺ ${f.relearn.move} over ${f.relearn.forget ?? "(free slot)"} +${f.relearn.gain}` : ""}`);
  console.log(`mushroom ${m.free.map(f => `${f.name}: ${f.v} ${f.why}`).join(" | ")}`);
  const summary = cardSummary(m);
  console.log(`summary ${summary.audit}`);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m), `${label}: JSON-safe`);
  sc.expect?.(a, m, summary, party);
}
console.log("ok");
