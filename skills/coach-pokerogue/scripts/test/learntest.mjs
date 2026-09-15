// Learn-move card: effective power per move (multi-hit, stand-in power for level/HP/weight-based moves, Technician,
// drawbacks such as recoil, HP costs, lock-in, recharge and self stat drops), type-chart coverage for the mon and
// the team, and the learn / forget / skip verdict. Prints the rendered card, so run.mjs also keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// An attr: "Name" or ["Name", { fields }] — the game's attr instances, identified by constructor name.
const attr = a => (typeof a === "string" ? { constructor: { name: a } } : Object.assign({ constructor: { name: a[0] } }, a[1]));
// [name, type, power, cat, acc, attrs, charging, target, extra]
const mv = ([n, t, p, c, a = 100, attrs = [], charge = false, target = 3, extra = {}]) => ({
  name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: target, priority: 0, chance: -1,
  isChargingMove: () => charge, attrs: attrs.map(attr), chargeAttrs: (extra.chargeAttrs ?? []).map(attr),
  restrictions: extra.restrictions ?? [], conditions: (extra.conditions ?? []).map(attr), flags: extra.flags ?? 0,
  hasFlag(f) { return (this.flags & f) !== 0; }, ...extra.fields,
});
const mon = (name, types, atk, spa, moves, extra = {}) => ({
  name, level: 64, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: extra.ability ?? "x" }),
  getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, friendship: 70,
  moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })),
});

const run = (pk, newMove, { double = false, party = [pk] } = {}) => {
  let el; const ds = {};
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const scene = { currentBattle: { double }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: pk, newMove: mv(newMove) }) }, getEnemyParty: () => [], getPlayerParty: () => party };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], title: "", addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: ds }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__lm = { learnModel, learnState };\n})();\n"));
  const model = globalThis.__lm.learnModel(globalThis.__lm.learnState(scene));
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(model))), JSON.stringify(model), "learn model is JSON-safe");
  const txt = n => typeof n === "string" ? n : n.children.map(txt).join(" ");
  return { model, text: el.kids.slice(1).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") };
};
const show = (label, r) => console.log(`== ${label}\n${r.text}`);
const byName = (m, n) => m.moves.find(x => x.name === n);

const cases = [
  ["Charizard ← Flare Blitz", mon("Charizard", ["Fire","Flying"], 122, 154, [["Heat Wave","Fire",95,"S",90,[],false,6],["Dragon Breath","Dragon",60,"S"],["Air Slash","Flying",75,"S",95],["Flamethrower","Fire",90,"S"]]), ["Flare Blitz","Fire",120,"P",100,["RecoilAttr"]], true],
  ["Venusaur ← Solar Beam", mon("Venusaur", ["Grass","Poison"], 133, 142, [["Double-Edge","Normal",120,"P",100,["RecoilAttr"]],["Sleep Powder","Grass",-1,"X",75],["Synthesis","Grass",-1,"X"],["Power Whip","Grass",120,"P",85]]), ["Solar Beam","Grass",120,"S",100,[],true], true],
  ["Blastoise ← Skull Bash", mon("Blastoise", ["Water"], 119, 121, [["Aqua Tail","Water",90,"P",90],["Flash Cannon","Steel",80,"S"],["Wave Crash","Water",120,"P",100,["RecoilAttr"]],["Hydro Pump","Water",110,"S",80]]), ["Skull Bash","Normal",130,"P",100,[],true], true],
  ["Scrafty ← Head Smash", mon("Scrafty", ["Dark","Fighting"], 150, 62, [["Focus Punch","Fighting",150,"P"],["Rock Climb","Normal",90,"P",85],["Brick Break","Fighting",75,"P"],["High Jump Kick","Fighting",130,"P",90]]), ["Head Smash","Rock",150,"P",80,["RecoilAttr"]], true],
];
for (const [label, pk, newMove, double] of cases) {
  const r = run(pk, newMove, { double });
  show(label, r);
  if (label.startsWith("Venusaur")) {
    // Skipping: the new move is scored against the slot it would take, so Solar Beam isn't "coverage" next to Power Whip.
    assert.equal(r.model.forget, -1);
    assert.equal(r.model.moves[r.model.compare].name, "Double-Edge");
    assert.ok(!r.model.move.notes.some(n => /SE on|coverage/.test(n)), `Solar Beam notes: ${r.model.move.notes}`);
  }
  if (label.startsWith("Blastoise")) assert.ok(!r.model.move.se.length, "Normal hits nothing super-effectively");
}

// ---- Multi-hit: Double Kick is the only Fighting move — two hits of 30, not one.
{
  const pk = mon("Nidoking", ["Poison","Ground"], 120, 100, [["Tackle","Normal",40,"P"],["Poison Jab","Poison",80,"P"],["Earthquake","Ground",100,"P",100,[],false,4],["Pin Missile","Bug",25,"P",95,[["MultiHitAttr",{ intrinsicMultiHitType: 1 }]]]]);
  const r = run(pk, ["Double Kick","Fighting",30,"P",100,[["MultiHitAttr",{ intrinsicMultiHitType: 0 }]]]);
  show("Nidoking ← Double Kick", r);
  assert.equal(r.model.move.hits, 2);
  assert.equal(r.model.forget, r.model.moves.findIndex(m => m.name === "Tackle"), "Double Kick replaces Tackle");
  assert.equal(byName(r.model, "Pin Missile").hits, 3.1, "2–5 hits average 3.1");
  assert.ok(byName(r.model, "Pin Missile").value > byName(r.model, "Tackle").value, "Pin Missile outscores Tackle");
}

// ---- Technician + Skill Link, and Triple Axel's growing hits with per-hit accuracy.
{
  const pk = mon("Cloyster", ["Water","Ice"], 140, 90, [["Icicle Spear","Ice",25,"P",100,[["MultiHitAttr",{ intrinsicMultiHitType: 1 }]]],["Rock Blast","Rock",25,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 1 }]]],["Tackle","Normal",40,"P"]], { ability: "Skill Link" });
  const r = run(pk, ["Triple Axel","Ice",20,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 2 }],"MultiHitPowerIncrementAttr"],false,3,{ flags: 65536 }]);
  show("Cloyster (Skill Link) ← Triple Axel", r);
  assert.equal(byName(r.model, "Icicle Spear").hits, 5, "Skill Link: 5 hits");
  // Skill Link skips the per-hit checks: all three land once the first does (20+40+60 at 90%).
  assert.equal(r.model.move.power, 20);
  assert.equal(r.model.move.hits, 2.7);
  const tech = mon("Scizor", ["Bug","Steel"], 130, 55, [["Bullet Punch","Steel",40,"P"]], { ability: "Technician" });
  const t = run(tech, ["Double Hit","Normal",35,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 0 }]]]);
  assert.ok(t.model.move.notes.includes("Technician"), "Technician boosts 35-power hits");
  const axel = run(mon("Weavile", ["Dark","Ice"], 120, 45, [["Tackle","Normal",40,"P"]]), ["Triple Axel","Ice",20,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 2 }],"MultiHitPowerIncrementAttr"],false,3,{ flags: 65536 }]);
  // .9·20 + .81·40 + .729·60 = 94.14 → × STAB 1.5 × coverage.
  assert.equal(axel.model.move.hits, 2.4, "hits stop at the first miss");
}

// ---- Level / HP / weight-based moves (power −1) are attacks with stand-in power, and can be forgotten.
{
  const pk = mon("Gengar", ["Ghost","Poison"], 70, 140, [["Night Shade","Ghost",-1,"S",100,["LevelDamageAttr"]],["Super Fang","Normal",-1,"P",90,["TargetHalfHpDamageAttr"]],["Grass Knot","Grass",-1,"S",100,["WeightPowerAttr"]],["Sludge Bomb","Poison",90,"S"]]);
  const r = run(pk, ["Shadow Ball","Ghost",80,"S"]);
  show("Gengar ← Shadow Ball", r);
  for (const n of ["Night Shade", "Super Fang", "Grass Knot"]) assert.ok(byName(r.model, n).value > 0, `${n} is scored`);
  assert.equal(byName(r.model, "Night Shade").power, Math.round(64 * 50 / (2 * 64 / 5 + 2)), "damage = level, as power at this level");
  assert.ok(byName(r.model, "Night Shade").fixed && !byName(r.model, "Night Shade").se.length, "fixed damage ignores type effectiveness");
  assert.equal(byName(r.model, "Grass Knot").power, 60);
  assert.ok(r.model.forget >= 0 && r.model.forget !== 3, `a power −1 move can be forgotten (${r.model.verdict[0]})`);
  assert.equal(r.model.atk, 70); assert.equal(r.model.spa, 140);
}

// ---- Drawbacks: Steel Beam's HP cost vs Iron Head, Outrage's lock-in vs Dragon Claw, Overheat's SpA drop vs Flamethrower.
{
  const metagross = mon("Metagross", ["Steel","Psychic"], 135, 125, [["Zen Headbutt","Psychic",80,"P",90],["Earthquake","Ground",100,"P"],["Iron Head","Steel",80,"P"],["Bullet Punch","Steel",40,"P",100,[],false,3,{ fields: { priority: 1 } }]]);
  const r = run(metagross, ["Steel Beam","Steel",140,"S",95,["HalfSacrificialAttr"]]);
  show("Metagross ← Steel Beam", r);
  assert.ok(r.model.move.drawbacks.includes("−50% HP each use"));
  assert.ok(r.model.move.value < byName(r.model, "Iron Head").value, "Steel Beam's HP cost makes it worse than Iron Head");
  assert.notEqual(r.model.moves[r.model.forget]?.name, "Iron Head", "keeps Iron Head");

  const dragonite = mon("Dragonite", ["Dragon","Flying"], 134, 100, [["Dragon Claw","Dragon",80,"P"],["Extreme Speed","Normal",80,"P",100,[],false,3,{ fields: { priority: 2 } }],["Fire Punch","Fire",75,"P"],["Thunder Punch","Electric",75,"P"]]);
  const o = run(dragonite, ["Outrage","Dragon",120,"P",100,["FrenzyAttr",["MissEffectAttr",{}],["NoEffectAttr",{}]],false,7]);
  show("Dragonite ← Outrage", o);
  assert.ok(o.model.move.drawbacks.includes("locks 2–3 turns, then confused"));
  assert.ok(!o.model.move.drawbacks.some(d => /misses/.test(d)), "Outrage's miss effect isn't crash damage");
  const claw = byName(o.model, "Dragon Claw");
  assert.ok(claw.replacement <= claw.value * 1.1, `Outrage isn't a clear upgrade over Dragon Claw (${claw.replacement} vs ${claw.value})`);
  assert.notEqual(o.model.moves[o.model.forget]?.name, "Dragon Claw");

  const arcanine = mon("Arcanine", ["Fire"], 110, 120, [["Flamethrower","Fire",90,"S"],["Extreme Speed","Normal",80,"P"],["Wild Charge","Electric",90,"P",100,[["RecoilAttr",{ damageRatio: 0.25 }]]],["Crunch","Dark",80,"P"]]);
  const h = run(arcanine, ["Overheat","Fire",130,"S",90,[["StatStageChangeAttr",{ stats: [3], stages: -2, selfTarget: true }]]]);
  show("Arcanine ← Overheat", h);
  assert.ok(h.model.move.drawbacks.includes("−2 SpA after use"));
  assert.notEqual(h.model.moves[h.model.forget]?.name, "Flamethrower", "keeps Flamethrower");
  assert.equal(byName(h.model, "Wild Charge").drawbacks[0], "recoil 25% of damage");

  const hitmon = mon("Hitmonlee", ["Fighting"], 120, 35, [["High Jump Kick","Fighting",130,"P",90,[["MissEffectAttr",{}],["NoEffectAttr",{}]]],["Gigaton Hammer","Steel",160,"P",100,[],false,3,{ restrictions: [{ i18nkey: "battle:moveDisabledConsecutive" }] }],["Hyper Beam","Normal",150,"S",90,["RechargeAttr"]],["Close Combat","Fighting",120,"P",100,[["StatStageChangeAttr",{ stats: [2, 4], stages: -1, selfTarget: true }]]]]);
  const k = run(hitmon, ["Low Kick","Fighting",-1,"P",100,["WeightPowerAttr"]]);
  assert.deepEqual(byName(k.model, "High Jump Kick").drawbacks, ["−50% HP if it misses"]);
  assert.deepEqual(byName(k.model, "Gigaton Hammer").drawbacks, ["not twice in a row"]);
  assert.deepEqual(byName(k.model, "Hyper Beam").drawbacks, ["recharge turn"]);
  assert.deepEqual(byName(k.model, "Close Combat").drawbacks, ["−1 Def/SpD after use"]);
}

// ---- Live, wave 22: Emolga (Atk 26 / SpA 26) wants Spark. Thunder Shock is the same type and weaker — the one to
// forget; Quick Attack's priority and Normal coverage stay.
{
  const emolga = mon("Emolga", ["Electric","Flying"], 26, 26, [["Thunder Shock","Electric",40,"S"],["Quick Attack","Normal",40,"P",100,[],false,3,{ fields: { priority: 1 } }],
    ["Icicle Crash","Ice",85,"P",90],["Charge","Electric",-1,"X",-1,[["StatStageChangeAttr",{ stats: [4], stages: 1, selfTarget: true }]]]]);
  const r = run(emolga, ["Spark","Electric",65,"P"]);
  show("Emolga ← Spark", r);
  assert.equal(r.model.moves[r.model.forget]?.name, "Thunder Shock");
}

// ---- Team view: forgetting the team's only Dark move is flagged; a move the team lacks coverage for is noted.
{
  const tyranitar = mon("Tyranitar", ["Rock","Dark"], 134, 95, [["Crunch","Dark",80,"P"],["Stone Edge","Rock",100,"P",80],["Tackle","Normal",40,"P"],["Bite","Dark",60,"P"]]);
  const mate = mon("Blastoise", ["Water"], 100, 110, [["Surf","Water",90,"S",100,[],false,4],["Ice Beam","Ice",90,"S"]]);
  const r = run(tyranitar, ["Iron Head","Steel",80,"P"], { party: [tyranitar, mate] });
  show("Tyranitar ← Iron Head (team)", r);
  assert.match(r.text, /^team: \+SE Fairy/m, "team gains shown on the team line");
  assert.deepEqual(r.model.team.gains, ["Fairy"]);
  const solo = mon("Umbreon", ["Dark"], 70, 60, [["Foul Play","Dark",95,"P"],["Tackle","Normal",40,"P"],["Quick Attack","Normal",40,"P"],["Swift","Normal",60,"S"]]);
  const u = run(solo, ["Psychic","Psychic",90,"S"], { party: [solo, mate] });
  assert.ok(byName(u.model, "Foul Play").onlyOnTeam, "Foul Play is the team's only Dark move");
  assert.ok(byName(u.model, "Foul Play").notes.includes("only Dark move on team"));
}
console.log("ok");
