// Learn-move card: effective power per move (multi-hit, stand-in power for level/HP/weight-based moves, Technician,
// drawbacks such as recoil, HP costs, lock-in, recharge and self stat drops), type-chart coverage for the mon and
// the team, and the learn / forget / skip verdict. Prints the rendered card, so run.mjs also keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { wholeCard } from "./panel.mjs";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// An attr: "Name" or ["Name", { fields }] — the game's attr instances, identified by constructor name. The HUD
// matches through the prototype chain (a subclass counts), so the classes the game subclasses carry their parent
// here too, or a WeatherInstantChargeAttr wouldn't read as an instant charge.
const PARENTS = {
  WeatherInstantChargeAttr: "InstantChargeAttr",
  BoostHealAttr: "HealAttr", WeatherHealAttr: "HealAttr", PlantHealAttr: "HealAttr", SandHealAttr: "HealAttr",
  LeechSeedAttr: "AddBattlerTagAttr", ConfuseAttr: "AddBattlerTagAttr", ProtectAttr: "AddBattlerTagAttr",
  AddArenaTrapTagAttr: "AddArenaTagAttr",
};
const ctorFor = name => {
  const parent = PARENTS[name];
  return Object.assign(Object.create(parent ? ctorFor(parent) : null), { name });
};
const attr = a => (typeof a === "string" ? { constructor: ctorFor(a) } : Object.assign({ constructor: ctorFor(a[0]) }, a[1]));
// [name, type, power, cat, acc, attrs, charging, target, extra]
const mv = ([n, t, p, c, a = 100, attrs = [], charge = false, target = 3, extra = {}]) => ({
  name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: target, priority: 0, chance: -1,
  isChargingMove: () => charge, attrs: attrs.map(attr), chargeAttrs: (extra.chargeAttrs ?? []).map(attr),
  restrictions: extra.restrictions ?? [], conditions: (extra.conditions ?? []).map(attr), flags: extra.flags ?? 0,
  hasFlag(f) { return (this.flags & f) !== 0; }, ...extra.fields,
});
// The ability attributes 07-move-traits asks for, by the ability names these scenarios use: it reads abilities by
// attribute, as the game does, not by name.
const AB_ATTRS = { "Skill Link": ["MaxMultiHitAbAttr"], "Magic Guard": ["BlockNonDirectDamageAbAttr"], "Rock Head": ["BlockRecoilDamageAttr"], "Parental Bond": ["AddSecondStrikeAbAttr"] };
const mon = (name, types, atk, spa, moves, extra = {}) => ({
  name, level: 64, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: extra.ability ?? "x" }),
  hasAbilityWithAttr: a => (AB_ATTRS[extra.ability] ?? []).includes(a), getHeldItems: () => [],
  getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, friendship: 70,
  moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })),
});

const run = (pk, newMove, { double = false, party = [pk], roster = null } = {}) => {
  let el; const ds = {};
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const scene = { currentBattle: { double }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: pk, newMove: mv(newMove) }) }, getEnemyParty: () => [], getPlayerParty: () => party };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], title: "", addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: ds }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const { learnModel, learnAdvice, blockedByHealBlock } = globalThis.__hud["40-learn"];
  const { learnState } = globalThis.__hud["02-screens"];
  globalThis.__lm = { learnModel, learnState, learnAdvice, tmAdvice: globalThis.__hud["52-shop"].tmAdvice, blockedByHealBlock };
  const model = learnModel({ ...learnState(scene), roster });
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(model))), JSON.stringify(model), "learn model is JSON-safe");
  const txt = n => typeof n === "string" ? n : n.children.map(txt).join(" ");
  // The card as the shell draws it, less the panel's own controls — the caret and the × sit together in the panel's
  // corner, so they are one child (#358). Dropped by the × its cluster holds rather than by position, so a shell that
  // reorders its chrome doesn't silently eat a row; the wrapper itself stays unnamed, because a title on it would put
  // a tooltip over the panel's corner. What leads what is left is the **strip**: the card's identity line as the
  // caption, and beside it the call the card came to (#356).
  const rest = wholeCard(el).filter(k => ![...(k.children ?? [])].some(c => c.title === "Close"));
  return { model, text: rest.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") };
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
  assert.ok(r.model.forget >= 0 && r.model.forget !== 3, `a power −1 move can be forgotten (${r.model.verdict})`);
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
  // Outrage does clear Dragon Claw here, but only because randbats runs it on Dragonite: the moveset-prior
  // section below pins that down by scoring the same moveset on a species randbats has never heard of.
  const claw = byName(o.model, "Dragon Claw");
  assert.ok(claw.replacement > claw.value, `Outrage outscores Dragon Claw (${claw.replacement} vs ${claw.value})`);

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

// ---- Live, wave 22: Emolga (Atk 26 / SpA 26) wants Spark. Charge is the slot that goes — a +1 SpD on a mon that
// attacks with neither defence is worth less than a second Electric attack; Quick Attack and Icicle Crash stay.
{
  const emolga = mon("Emolga", ["Electric","Flying"], 26, 26, [["Thunder Shock","Electric",40,"S"],["Quick Attack","Normal",40,"P",100,[],false,3,{ fields: { priority: 1 } }],
    ["Icicle Crash","Ice",85,"P",90],["Charge","Electric",-1,"X",-1,[["StatStageChangeAttr",{ stats: [4], stages: 1, selfTarget: true }]]]]);
  const r = run(emolga, ["Spark","Electric",65,"P"]);
  show("Emolga ← Spark", r);
  assert.equal(r.model.moves[r.model.forget]?.name, "Charge");
  // The shared advice (also behind TM advice) says the same as the card: learn, over Charge, same gain.
  const a = globalThis.__lm.learnAdvice(emolga, mv(["Spark","Electric",65,"P"]), { party: [emolga] });
  assert.deepEqual([a.learn, a.slot, a.forget, a.gain, a.reason], [true, r.model.forget, "Charge", r.model.gain, "over Charge"]);
  // A skip names the slot it lost to but replaces nothing. Four real attacks, so there is no dead slot to take.
  const armed = mon("Emolga", ["Electric","Flying"], 26, 26, [["Thunder Shock","Electric",40,"S"],["Quick Attack","Normal",40,"P",100,[],false,3,{ fields: { priority: 1 } }],
    ["Icicle Crash","Ice",85,"P",90],["Air Slash","Flying",75,"S",95]]);
  const skip = globalThis.__lm.learnAdvice(armed, mv(["Tackle","Normal",40,"P"]), { party: [armed] });
  assert.deepEqual([skip.learn, skip.slot, skip.forget, skip.against != null], [false, -1, null, true]);
  // A foe's −1 Atk is scored now, and it loses to every attack in the moveset: a skip, not a shrug.
  const growl = globalThis.__lm.learnAdvice(armed, mv(["Growl","Normal",-1,"X",100,[["StatStageChangeAttr", { stats: [1], stages: -1 }]],false,6]), { party: [armed] });
  assert.deepEqual([growl.learn, growl.kind], [false, "skip"]);
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
// ---- Status moves are scored, so a dead one is the slot to forget (#70)
// Every case below is a real prompt from the wave 10–35 coaching session on the issue, where the card proposed
// dropping an attack while a zero-value status move sat in the moveset.
const statChange = (stats, stages, self) => ["StatStageChangeAttr", { stats, stages, ...(self ? { selfTarget: true } : {}) }];
const HOWL = ["Howl","Normal",-1,"X",-1,[statChange([1], 1)],false,13];      // USER_AND_ALLIES, and the attr carries no selfTarget
const GROWL = ["Growl","Normal",-1,"X",100,[statChange([1], -1)],false,6];   // ALL_NEAR_ENEMIES
const ROOST = ["Roost","Flying",-1,"X",-1,[["HealAttr",{ healRatio: 0.5 }],["AddBattlerTagAttr",{ tagType: "ROOSTED", selfTarget: true }]],false,0];
const NASTY_PLOT = ["Nasty Plot","Dark",-1,"X",-1,[statChange([3], 2, true)],false,0];
const HELPING_HAND = ["Helping Hand","Normal",-1,"X",-1,[["AddBattlerTagAttr",{ tagType: "HELPING_HAND" }]],false,10];
const SING = ["Sing","Normal",55,"X",55,[["StatusEffectAttr",{ effect: 4 }]]];
const TAUNT = ["Taunt","Dark",-1,"X",100,[["AddBattlerTagAttr",{ tagType: "TAUNT" }]]];
{
  // Wave 33: the TM offers Nasty Plot. The card used to propose dropping Snarl — a scored STAB special move on the
  // mon's better stat — because Howl, +1 Atk on a special attacker, had no number at all.
  const houndoom = mon("Houndoom", ["Dark","Fire"], 120, 160, [["Crunch","Dark",80,"P"], HOWL, ["Snarl","Dark",55,"S",95], ["Incinerate","Fire",60,"S"]]);
  const r = run(houndoom, NASTY_PLOT);
  show("Houndoom ← Nasty Plot (TM)", r);
  assert.equal(r.model.moves[r.model.forget]?.name, "Howl", "+1 Atk on a special attacker is the dead slot");
  assert.ok(byName(r.model, "Howl").value < byName(r.model, "Snarl").value, "Howl is worth less than a STAB special move");
  assert.ok(r.model.move.value > 0 && r.model.move.notes.some(n => /\+2 SpA/.test(n)), `Nasty Plot is scored: ${r.model.move.notes}`);

  // Wave 34: Roost on the main attacker, with revives at $1100. Half its max HP back beats another Growl.
  const fletchinder = mon("Fletchinder", ["Fire","Flying"], 130, 62, [["Acrobatics","Flying",55,"P"], GROWL, ["Flame Charge","Fire",50,"P"], ["Quick Attack","Normal",40,"P",100,[],false,3,{ fields: { priority: 1 } }]]);
  const roost = run(fletchinder, ROOST);
  show("Fletchinder ← Roost", roost);
  assert.equal(roost.model.decision, "learn");
  assert.equal(roost.model.moves[roost.model.forget]?.name, "Growl");
  assert.ok(roost.model.move.notes.includes("heal 50%"));
  assert.ok(byName(roost.model, "Growl").value <= 10, `a foe's −1 Atk is worth little (${byName(roost.model, "Growl").value})`);

  // Wave 25/28: Helping Hand only ever targets an ally, so in a single battle it does nothing at all.
  const minccino = mon("Minccino", ["Normal"], 110, 60, [["Pound","Normal",40,"P"],["Baby-Doll Eyes","Fairy",-1,"X",100,[statChange([1], -1)]], HELPING_HAND, SING]);
  const hh = run(minccino, ["Triple Axel","Ice",20,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 2 }],"MultiHitPowerIncrementAttr"],false,3,{ flags: 65536 }]);
  show("Minccino ← Triple Axel", hh);
  assert.equal(byName(hh.model, "Helping Hand").value, 0);
  assert.ok(byName(hh.model, "Helping Hand").notes.includes("ally only"));
  assert.equal(hh.model.moves[hh.model.forget]?.name, "Helping Hand", "the dead slot goes before Pound");
  const dbl = run(minccino, ["Triple Axel","Ice",20,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 2 }],"MultiHitPowerIncrementAttr"],false,3,{ flags: 65536 }], { double: true });
  assert.ok(byName(dbl.model, "Helping Hand").value > 0, "in a double battle it is worth something again");
  // A TM on the rewards card is judged over the battles ahead: at a quarter doubles, a quarter of that.
  const quarter = globalThis.__lm.learnAdvice(minccino, mv(["Triple Axel","Ice",20,"P",90,[["MultiHitAttr",{ intrinsicMultiHitType: 2 }],"MultiHitPowerIncrementAttr"],false,3,{ flags: 65536 }]), { double: 0.25 });
  const hhQuarter = quarter.plan.moves.find(x => x.name === "Helping Hand");
  assert.ok(Math.abs(hhQuarter.value - byName(dbl.model, "Helping Hand").value / 4) <= 1, `a quarter of its doubles worth (${hhQuarter.value})`);
  assert.ok(hhQuarter.notes.includes("25% doubles ahead"));

  // Sleep is the strongest thing a status move does, discounted by Sing's 55% accuracy. On Minccino it is worth
  // less again, for the reason the old card couldn't state: three of its four slots are already status moves.
  const clean = run(mon("Jigglypuff", ["Normal","Fairy"], 70, 65, [["Body Slam","Normal",85,"P"],["Dazzling Gleam","Fairy",80,"S"],["Play Rough","Fairy",90,"P",90]]), SING);
  const sing = clean.model.move;
  assert.ok(sing.value >= 30 && sing.value <= 45, `Sing ≈ sleep × 55% accuracy (${sing.value})`);
  assert.ok(sing.notes.includes("55% acc") && sing.notes.includes("sleep"));
  const crowded = byName(hh.model, "Sing");
  assert.ok(crowded.notes.includes("3 status moves") && crowded.value < sing.value, "a moveset that is mostly status has no room for another");
  const taunted = run(mon("Sableye", ["Dark","Ghost"], 75, 65, [["Knock Off","Dark",65,"P"],["Shadow Sneak","Ghost",40,"P"],["Fake Out","Normal",40,"P"]]), TAUNT);
  assert.ok(taunted.model.move.value > 0 && taunted.model.move.notes.includes("taunt"), `Taunt is scored: ${taunted.model.move.notes}`);

  // Nothing here recognises a move with no attributes at all: no invented number, and it stays off the forget list.
  const unknown = run(mon("Smeargle", ["Normal"], 60, 60, [["Tackle","Normal",40,"P"],["Swift","Normal",60,"S"],["Quick Attack","Normal",40,"P"],["Sketch","Normal",-1,"X",-1]]), ["Pound","Normal",40,"P"]);
  assert.equal(byName(unknown.model, "Sketch").value, null);
  const call = globalThis.__lm.learnAdvice(mon("Smeargle", ["Normal"], 60, 60, [["Tackle","Normal",40,"P"],["Swift","Normal",60,"S"],["Quick Attack","Normal",40,"P"],["Pound","Normal",40,"P"]]), mv(["Sketch","Normal",-1,"X",-1]));
  assert.deepEqual([call.learn, call.kind], [null, "status"], "an unscorable status move is still the user's call");
}

// ---- The moveset prior (05-randbats.js): a nudge and a note, never a veto
{
  // Houndour is not fully evolved, so randbats has no sets for it — Houndoom's stand in, and count for less.
  const houndour = mon("Houndour", ["Dark","Fire"], 60, 80, [["Bite","Dark",60,"P"], HOWL, ["Leer","Normal",-1,"X",100,[statChange([2], -1)]], ["Incinerate","Fire",60,"S"]]);
  const r = run(houndour, NASTY_PLOT);
  show("Houndour ← Nasty Plot", r);
  const note = r.model.move.notes.find(n => n.startsWith("set move"));
  assert.match(note ?? "", /^set move \(.*, evolved\)$/, `the prior stands in for the evolution: ${r.model.move.notes}`);
  // Both dead slots are below every attack, and the weaker of the two goes.
  assert.ok(["Howl", "Leer"].includes(r.model.moves[r.model.forget]?.name), `forgets a dead status slot, not an attack (${r.model.moves[r.model.forget]?.name})`);

  // A species randbats has never heard of gets no note and no nudge — and then Outrage's lock-in keeps it a skip,
  // which is what tips Dragonite the other way above.
  const moves = [["Dragon Claw","Dragon",80,"P"],["Extreme Speed","Normal",80,"P",100,[],false,3,{ fields: { priority: 2 } }],["Fire Punch","Fire",75,"P"],["Thunder Punch","Electric",75,"P"]];
  const outrage = ["Outrage","Dragon",120,"P",100,["FrenzyAttr",["MissEffectAttr",{}],["NoEffectAttr",{}]],false,7];
  const known = run(mon("Dragonite", ["Dragon","Flying"], 134, 100, moves), outrage);
  const unknown = run(mon("Dracowidget", ["Dragon","Flying"], 134, 100, moves), outrage);
  assert.ok(known.model.move.notes.some(n => n.startsWith("set move")), "randbats runs Outrage on Dragonite");
  assert.ok(!unknown.model.move.notes.some(n => n.startsWith("set move")));
  assert.equal(unknown.model.decision, "skip", "without the prior the lock-in keeps Outrage off the set");
  assert.equal(known.model.decision, "learn", "with it, a close call tips");
  assert.ok(known.model.move.value / unknown.model.move.value <= 1.2, "a nudge, not a veto");
}

// ---- Which stat the mon attacks with, and which type the move lands as
{
  // Huge Power doubles Atk outright: Azumarill is a physical attacker with a 50-something raw Atk stat.
  const azu = mon("Azumarill", ["Water","Fairy"], 90, 110, [["Aqua Jet","Water",40,"P",100,[],false,3,{ fields: { priority: 1 } }],["Play Rough","Fairy",90,"P",90],["Ice Beam","Ice",90,"S"],["Surf","Water",90,"S",100,[],false,4]], { ability: "Huge Power" });
  const r = run(azu, ["Liquidation","Water",85,"P",100]);
  show("Azumarill (Huge Power) ← Liquidation", r);
  assert.equal(r.model.atk, 180, "the card reports the doubled Atk");
  assert.ok(!r.model.move.notes.includes("weak Atk"), "a physical move is not a weak fit on a Huge Power mon");
  const plain = run(mon("Marillish", ["Water","Fairy"], 90, 110, [["Aqua Jet","Water",40,"P",100,[],false,3,{ fields: { priority: 1 } }],["Play Rough","Fairy",90,"P",90],["Ice Beam","Ice",90,"S"],["Surf","Water",90,"S",100,[],false,4]]), ["Liquidation","Water",85,"P",100]);
  assert.ok(plain.model.move.notes.includes("weak Atk"), "without the ability the same stats are a weak fit");

  // Pixilate turns a Normal move Fairy — a different type, different STAB, different coverage.
  const sylveon = mon("Sylveon", ["Fairy"], 65, 130, [["Shadow Ball","Ghost",80,"S"],["Psyshock","Psychic",80,"S"],["Mystical Fire","Fire",75,"S"]], { ability: "Pixilate" });
  const p = run(sylveon, ["Hyper Voice","Normal",90,"S",100,[],false,2]);
  show("Sylveon (Pixilate) ← Hyper Voice", p);
  assert.equal(p.model.move.type, "Fairy");
  assert.ok(p.model.move.stab && p.model.move.notes.includes("Pixilate"));
  assert.equal(p.model.move.power, Math.round(90 * 1.2));

  // Adaptability is a 2× STAB, not 1.5×.
  const scoreOf = ability => run(mon("Porygon-Z", ["Normal"], 80, 135, [["Thunderbolt","Electric",90,"S"],["Ice Beam","Ice",90,"S"],["Shadow Ball","Ghost",80,"S"]], { ability }), ["Tri Attack","Normal",80,"S"]).model.move.value;
  assert.ok(scoreOf("Adaptability") / scoreOf("Download") > 1.3, "Adaptability is worth a third more than plain STAB");

  // Weather Ball's type follows the weather, which the card can't see: no STAB claim, no coverage claim.
  const w = run(mon("Castform", ["Normal"], 70, 70, [["Thunder","Electric",110,"S",70],["Ice Beam","Ice",90,"S"],["Sunny Day","Fire",-1,"X",-1,[["WeatherChangeAttr",{}]]]]), ["Weather Ball","Normal",50,"S",100,["WeatherBallTypeAttr"]]);
  assert.ok(w.model.move.notes.includes("type varies"));
  assert.deepEqual(w.model.move.se, [], "no super-effective claim for a type it can't pin down");
  assert.ok(!w.model.move.stab);

  // Solar Beam's charge turn is real without a sun setter, and mostly skipped with one in the party.
  const venu = types => mon("Venusaur", ["Grass","Poison"], 100, 142, [["Sludge Bomb","Poison",90,"S"],["Giga Drain","Grass",75,"S"],["Sleep Powder","Grass",-1,"X",75,[["StatusEffectAttr",{ effect: 4 }]]]], types);
  const solar = ["Solar Beam","Grass",120,"S",100,[],true,3,{ chargeAttrs: ["WeatherInstantChargeAttr"] }];
  const dry = run(venu({}), solar);
  const sunny = run(venu({}), solar, { party: [venu({}), mon("Torkoal", ["Fire"], 85, 85, [["Lava Plume","Fire",80,"S"]], { ability: "Drought" })] });
  show("Venusaur ← Solar Beam (no sun)", dry);
  assert.ok(dry.model.move.drawbacks.includes("charge turn (not in sun)"));
  assert.ok(sunny.model.move.drawbacks.includes("charge turn (skipped in sun)"));
  assert.ok(sunny.model.move.value > dry.model.move.value * 1.5, "sun is most of the move");
}

// ---- Priority is worth what it can finish
{
  const moves = [["Earthquake","Ground",100,"P",100,[],false,4],["Stone Edge","Rock",100,"P",80],["Crunch","Dark",80,"P"]];
  const boost = move => {
    const pk = mon("Ursaluna", ["Ground","Normal"], 140, 60, moves);
    const withPriority = run(pk, move).model.move.value;
    const without = run(pk, [move[0], move[1], move[2], move[3], move[4], move[5], move[6], move[7], {}]).model.move.value;
    return withPriority / without;
  };
  const quick = boost(["Quick Attack","Normal",40,"P",100,[],false,3,{ fields: { priority: 1 } }]);
  const espeed = boost(["Extreme Speed","Normal",80,"P",100,[],false,3,{ fields: { priority: 2 } }]);
  assert.ok(quick > 1 && quick < espeed, `priority is worth more on a move that can finish something (${quick} vs ${espeed})`);
}
// ---- The roster a status move will face (#122)
// Both cards hand in the next big fight's foes as the preview has them. Disruption is worth what it takes away from
// that roster, an inflicted status what it can land on; with no roster both stay as they were.
{
  const foe = (name, types, extra = {}) => ({ name, types, ability: extra.ability ?? null, passive: null, segments: extra.segments ?? 0,
    statusMoves: extra.statusMoves ?? [], healMoves: extra.healMoves ?? [] });
  const at30 = (...foes) => ({ wave: 30, exact: true, foes });
  // Wave 30 on #70: Whitney's Miltank drinks milk behind two health bars.
  const whitney = at30(foe("Clefairy", ["Fairy"]), foe("Miltank", ["Normal"], { segments: 2, statusMoves: ["Milk Drink"], healMoves: ["Milk Drink"] }));
  const brutes = at30(foe("Machoke", ["Fighting"]), foe("Graveler", ["Rock","Ground"]));
  const sableye = ability => mon("Sableye", ["Dark","Ghost"], 75, 65, [["Knock Off","Dark",65,"P"],["Shadow Sneak","Ghost",40,"P"],["Fake Out","Normal",40,"P"]], { ability });
  const judge = (move, roster, ability) => globalThis.__lm.learnAdvice(sableye(ability), mv(move), { roster }).plan.incoming;

  const blind = judge(TAUNT, null);
  const healer = judge(TAUNT, whitney);
  const attackers = judge(TAUNT, brutes);
  assert.ok(healer.value > blind.value * 1.3, `Taunt against a healing boss (${healer.value} vs ${blind.value})`);
  assert.ok(healer.notes.includes("vs Miltank's Milk Drink at W30"), `named by what it stops: ${healer.notes}`);
  assert.ok(attackers.value < blind.value * 0.5 && attackers.notes.includes("nothing to stop at W30"), `Taunt into plain attackers (${attackers.value})`);
  const unsure = judge(TAUNT, { ...whitney, exact: false });
  assert.ok(unsure.value > blind.value && unsure.value < healer.value, "a roster the preview isn't sure of moves the score half as far");
  // Oblivious stops Taunt and nothing else; Heal Block still reaches the milk.
  const HEAL_BLOCK = ["Heal Block","Psychic",-1,"X",100,[["AddBattlerTagAttr",{ tagType: "HEAL_BLOCK" }]],false,6,{ flags: 262144 }];
  const oblivious = at30(foe("Miltank", ["Normal"], { ability: "Oblivious", segments: 2, statusMoves: ["Milk Drink"], healMoves: ["Milk Drink"] }));
  assert.ok(judge(TAUNT, oblivious).notes.includes("nothing to stop at W30"));
  assert.ok(judge(HEAL_BLOCK, oblivious).notes.includes("vs Miltank's Milk Drink at W30"));

  // Will-O-Wisp: a Fire type can't be burned, and Flash Fire takes the move itself.
  const WISP = ["Will-O-Wisp","Fire",-1,"X",85,[["StatusEffectAttr",{ effect: 6 }]],false,3,{ flags: 262144 }];
  const wispBlind = judge(WISP, null);
  const half = judge(WISP, at30(foe("Arcanine", ["Fire"]), foe("Machoke", ["Fighting"])));
  const none = judge(WISP, at30(foe("Arcanine", ["Fire"]), foe("Lampent", ["Ghost"], { ability: "Flash Fire" })));
  assert.ok(half.notes.includes("lands on 1 of 2 at W30") && half.value < wispBlind.value && half.value > none.value, `${half.notes}`);
  assert.ok(none.notes.includes("can't land at W30") && none.value <= Math.round(wispBlind.value * 0.3) + 1, `${none.value} vs ${wispBlind.value}`);
  assert.equal(judge(WISP, brutes).value, wispBlind.value, "a roster that can take it all changes nothing");

  // Thunder Wave alone respects type immunity; Magic Bounce sends any of these back, unless Mold Breaker ignores it.
  const TWAVE = ["Thunder Wave","Electric",-1,"X",90,[["StatusEffectAttr",{ effect: 3 }],"RespectAttackTypeImmunityAttr"],false,3,{ flags: 262144 }];
  assert.ok(judge(TWAVE, brutes).notes.includes("lands on 1 of 2 at W30"), "Graveler is Ground");
  const bouncer = at30(foe("Espeon", ["Psychic"], { ability: "Magic Bounce" }));
  assert.ok(judge(TWAVE, bouncer).notes.includes("can't land at W30"));
  assert.ok(!judge(TWAVE, bouncer, "Mold Breaker").notes.some(n => /W30/.test(n)), "Mold Breaker ignores Magic Bounce");
  // Powder moves fail on Grass types.
  const SPORE = ["Spore","Grass",-1,"X",100,[["StatusEffectAttr",{ effect: 4 }]],false,3,{ flags: 262144 | 2048 }];
  assert.ok(judge(SPORE, at30(foe("Venusaur", ["Grass","Poison"]), foe("Snorlax", ["Normal"]))).notes.includes("lands on 1 of 2 at W30"));

  // What the preview lists as a foe's heals: recovery and drain, not a status cure.
  const hb = m => globalThis.__lm.blockedByHealBlock(mv(m));
  assert.deepEqual([hb(["Milk Drink","Normal",-1,"X",-1,[["HealAttr",{ healRatio: 0.5 }]]]), hb(["Giga Drain","Grass",75,"S",100,[["HitHealAttr",{}]]]),
    hb(["Rest","Psychic",-1,"X",-1,["RestAttr"]]), hb(["Refresh","Normal",-1,"X",-1,["HealStatusEffectAttr"]])], [true, true, true, false]);

  // The learn card and the rewards card's TM advice read the same roster through the same decision.
  const tm = globalThis.__lm.tmAdvice(mv(TAUNT), [sableye()], { roster: whitney });
  assert.equal(tm.best?.gain, globalThis.__lm.learnAdvice(sableye(), mv(TAUNT), { roster: whitney }).gain, "the TM card and the learn card agree");
  assert.ok(run(sableye(), TAUNT, { roster: whitney }).model.move.notes.includes("vs Miltank's Milk Drink at W30"), "the learn card model carries the roster");
}
// ---- A typing written onto the foe (#233)
// Soak and Magic Powder make the target one type; Forest's Curse and Trick-or-Treat add a third. The battle plan
// prices one against the foe in front of us; here it is judged against the roster ahead and the party's own coverage:
// what it opens, and (a `set` only) the STAB it takes away. Blind of a roster both keep a flat value, which is what
// keeps the team audit's dead-slot check off them.
{
  const foe = (name, types, extra = {}) => ({ name, types, ability: extra.ability ?? null, passive: null,
    segments: extra.segments ?? 0, attackTypes: extra.attackTypes ?? types, statusMoves: [], healMoves: [] });
  const at40 = (...foes) => ({ wave: 40, exact: true, foes });
  const SOAK = ["Soak","Water",-1,"X",100,[["ChangeTypeAttr",{ type: TY.indexOf("Water") }]],false,3,{ flags: 262144 }];
  const TREAT = ["Trick-or-Treat","Ghost",-1,"X",100,[["AddTypeAttr",{ type: TY.indexOf("Ghost") }]],false,3,{ flags: 262144 }];
  const ludicolo = mon("Ludicolo", ["Water","Grass"], 70, 90, [["Scald","Water",80,"S"],["Energy Ball","Grass",90,"S"],["Zen Headbutt","Psychic",80,"P",90],["Ice Beam","Ice",90,"S"]]);
  const judge = (pk, move, roster) => globalThis.__lm.learnAdvice(pk, mv(move), { roster }).plan.incoming;

  // Skarmory answers to nothing Ludicolo has better than neutral; pure Water hands Energy Ball a ×2 and takes the
  // STAB off both its attacks.
  const skarm = at40(foe("Skarmory", ["Steel","Flying"]));
  const blind = judge(ludicolo, SOAK, null);
  const helps = judge(ludicolo, SOAK, skarm);
  assert.ok(blind.notes.includes("pure Water"), `named the way the ⚔ line names it: ${blind.notes}`);
  assert.ok(helps.value > blind.value * 1.5, `Soak into a roster it opens (${helps.value} vs ${blind.value})`);
  assert.ok(helps.notes.includes("vs Skarmory at W40"), `named by the foe it pays against: ${helps.notes}`);
  // A foe already that one type: `ChangeTypeAttr.getCondition` refuses, so the move does nothing there.
  const pool = at40(foe("Vaporeon", ["Water"], { attackTypes: ["Water","Ice"] }));
  const dead = judge(ludicolo, SOAK, pool);
  assert.ok(dead.value < blind.value * 0.5 && dead.notes.includes("no opening at W40"), `${dead.value}: ${dead.notes}`);
  // Aggron: Scald already hits it ×2, so the rewrite opens nothing — but it still takes both its STABs away.
  const strip = judge(ludicolo, SOAK, at40(foe("Aggron", ["Steel","Rock"])));
  assert.ok(strip.value > blind.value && strip.value < helps.value, `STAB alone (${strip.value} vs ${blind.value}/${helps.value})`);
  // The STAB is a share of its *attacks*, one entry per move, and not of its coverage (#266): an Aggron with three
  // Steel moves beside one Ground loses three quarters of them to pure Water, where the distinct types alone read
  // that as half.
  const many = judge(ludicolo, SOAK, at40(foe("Aggron", ["Steel","Rock"], { attackTypes: ["Steel","Steel","Steel","Ground"] })));
  const byType = judge(ludicolo, SOAK, at40(foe("Aggron", ["Steel","Rock"], { attackTypes: ["Steel","Ground"] })));
  assert.ok(many.value > byType.value, `three Steel moves are more STAB than one (${many.value} vs ${byType.value})`);
  assert.ok(many.value < strip.value, `and still less than a foe whose every attack is STAB (${many.value} vs ${strip.value})`);
  // And it is arithmetic, not an ordering: Aggron's opening is nil (Scald already hits it ×2), so what is left is the
  // share alone. A quarter more of its attacks losing STAB is worth the same step each time, and the same *ratio* of
  // Steel to Ground scores the same however many moves it is spread over — which is what makes it a share of its
  // moveset rather than a count of its moves.
  const stab = (...attackTypes) => judge(ludicolo, SOAK, at40(foe("Aggron", ["Steel","Rock"], { attackTypes }))).value;
  const G = "Ground", S = "Steel";
  const q = [stab(G, G, G, G), stab(S, G, G, G), stab(S, S, G, G), stab(S, S, S, G), stab(S, S, S, S)];
  // The card rounds, so the ladder is even to within that: each rung sits a quarter of the way up, ±1.
  q.forEach((v, i) => assert.ok(Math.abs(v - q[0] - (i / 4) * (q[4] - q[0])) <= 1, `rung ${i} of ${q}`));
  assert.ok(q[4] > q[0], `and it climbs: ${q}`);
  assert.equal(q[3], many.value, "three quarters is three quarters");
  assert.equal(q[4], strip.value, "and every attack losing STAB is the whole of it");
  assert.equal(stab(S, S, S, S, S, S, G, G), q[3], "six Steel beside two Ground is the same three quarters");
  console.log(`== STAB by share ${JSON.stringify(q)}`);

  const unsure = judge(ludicolo, SOAK, { ...skarm, exact: false });
  assert.ok(unsure.value > blind.value && unsure.value < helps.value, "a roster the preview isn't sure of moves the score half as far");
  // Good as Gold takes a status move outright, so only half this roster is rewritable.
  const half = judge(ludicolo, SOAK, at40(foe("Skarmory", ["Steel","Flying"]), foe("Gholdengo", ["Steel","Ghost"], { ability: "Good as Gold" })));
  assert.ok(half.value < helps.value && half.notes.includes("vs Skarmory at W40"), `${half.value}: ${half.notes}`);
  // `ChangeTypeAttr.getCondition` is refused by Multitype and RKS System, the same two the battle plan refuses.
  for (const ab of ["Multitype", "RKS System"]) {
    assert.ok(judge(ludicolo, SOAK, at40(foe("Arceus", ["Normal"], { ability: ab }))).notes.includes("no opening at W40"), ab);
  }
  // The opening is judged against the coverage that would face the foe — the party, plus the slots the move sits
  // beside — not the moveset as it stands. Ludicolo's ×2 into pure Water is Energy Ball's, so Soak is worth much less
  // in Energy Ball's own slot than in Scald's: a rewrite must not be sold on the coverage it replaces.
  const plan = globalThis.__lm.learnAdvice(ludicolo, mv(SOAK), { roster: skarm }).plan;
  const slot = n => plan.moves.find(m => m.name === n).replacement;
  assert.ok(slot("Energy Ball") < slot("Scald") * 0.7, `Soak over Energy Ball ${slot("Energy Ball")} vs over Scald ${slot("Scald")}`);

  // Health bars: the same rewrite pays more when what it opens is the boss and not the grunt beside it.
  const boss = judge(ludicolo, SOAK, at40(foe("Skarmory", ["Steel","Flying"], { segments: 5 }), foe("Vaporeon", ["Water"])));
  const grunt = judge(ludicolo, SOAK, at40(foe("Skarmory", ["Steel","Flying"]), foe("Vaporeon", ["Water"], { segments: 5 })));
  assert.ok(boss.value > grunt.value * 1.5, `a boss-weighted opening (${boss.value} vs ${grunt.value})`);

  // An added type only multiplies: Trick-or-Treat turns Machamp into a Knock Off / Shadow Sneak target …
  const sable = mon("Sableye", ["Dark","Ghost"], 75, 65, [["Knock Off","Dark",65,"P"],["Shadow Sneak","Ghost",40,"P"],["Fake Out","Normal",40,"P"],["Night Shade","Ghost",-1,"S",100,["LevelDamageAttr"]]]);
  const addBlind = judge(sable, TREAT, null);
  const added = judge(sable, TREAT, at40(foe("Machamp", ["Fighting"])));
  assert.ok(addBlind.notes.includes("+Ghost") && added.value > addBlind.value, `${added.value} vs ${addBlind.value}`);
  // Multitype and RKS System refuse a `set`, not an `add`: `AddTypeAttr.getCondition` asks only about Terastallization
  // and a typing the target already has.
  assert.ok(!judge(sable, TREAT, at40(foe("Arceus", ["Normal"], { ability: "Multitype" }))).notes.includes("no opening at W40"));
  // … and it can take one away: a Hitmonlee whose one answer is Fighting is worse off for it, which is worth 0 here
  // rather than a negative — nobody has to use the move.
  const kicker = mon("Hitmonlee", ["Fighting"], 120, 35, [["Close Combat","Fighting",120,"P"],["Mega Kick","Normal",120,"P",75],["Rock Slide","Rock",75,"P",90],["Feint","Normal",30,"P"]]);
  const worse = judge(kicker, TREAT, at40(foe("Snorlax", ["Normal"])));
  assert.ok(worse.value < addBlind.value * 0.5 && worse.notes.includes("no opening at W40"), `${worse.value}: ${worse.notes}`);

  // The crowded-moveset penalty is about the company a move keeps, not the move, so it is kept off `alone` — which is
  // what the audit's dead-slot bar reads. A Gourgeist's Trick-or-Treat beside Will-O-Wisp and Leech Seed is cut to 11
  // as a score, and is still not a dead slot.
  const WISP = ["Will-O-Wisp","Fire",-1,"X",85,[["StatusEffectAttr",{ effect: 6 }]],false,3,{ flags: 262144 }];
  const SEED = ["Leech Seed","Grass",-1,"X",90,[["LeechSeedAttr",{ tagType: "SEEDED" }]],false,3,{ flags: 262144 }];
  const gourgeist = mon("Gourgeist", ["Ghost","Grass"], 100, 60, [["Shadow Ball","Ghost",80,"S"], WISP, SEED, TREAT]);
  const crowded = globalThis.__lm.learnAdvice(gourgeist, mv(TREAT), {}).plan.moves.find(m => m.name === "Trick-or-Treat");
  assert.ok(crowded.value < 20 && crowded.alone >= 20, `crowded ${crowded.value}, on its own ${crowded.alone}`);
  assert.ok(crowded.notes.includes("3 status moves"), `the crowding is still named: ${crowded.notes}`);

  // The verdict is a real one now, not "your call" — and blind of a roster the score clears the audit's dead-slot bar
  // (50-audit's WEAK_STATUS, 20), so a slot the run wants kept is no longer offered up as dead weight.
  const advice = globalThis.__lm.learnAdvice(ludicolo, mv(SOAK), { roster: skarm });
  assert.notEqual(advice.kind, "status");
  assert.ok(advice.learn !== null, `a type-changing move gets a verdict: ${advice.reason}`);
  assert.ok(blind.value >= 20 && addBlind.value >= 20, `${blind.value} / ${addBlind.value} clear the dead-slot bar`);
  assert.ok(run(ludicolo, SOAK, { roster: skarm }).model.move.notes.includes("vs Skarmory at W40"), "the learn card model carries the roster");
  // The card below is the HUD's own tick, which has no look-ahead in this fake scene: the blind value, and a verdict.
  show("Ludicolo ← Soak (Skarmory ahead)", run(ludicolo, SOAK, { roster: skarm }));
}
console.log("ok");
