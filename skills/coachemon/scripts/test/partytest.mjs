// The party profile (`hud/08-party.js`): the party judged as a whole, and whether a newcomer is worth it. Checked
// against one shared team (`test/fixtures/party.mjs`) rather than through a card, because nothing in a profile depends
// on a scene, a battle or a screen — that is the point of the module. Covers the coverage table and the two readings
// that used to differ between cards (variable power counts, fixed damage doesn't), the shared weaknesses, the holes,
// the weakest member, the two matchup queries, `partyReasons` with and without `replacing`, and that the biome card
// and the catch card get the same reasons for the same species at the same level. Prints the tables, so run.mjs keeps
// a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { party, mon, species, SPECIES, ATTRS, TY } from "./fixtures/party.mjs";

// ---- Mount the HUD once with a bare scene and no `ui`, so its tick draws nothing. Every case below then builds its
// own party and hands it straight to the module, which is all a profile reads.
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => ({ gameMode: {} }) } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { partyProfile, partyReasons, damagingTypes, finalBstOf, partyLuck, typesOfSpecies } = globalThis.__hud["08-party"];

const row = (label, cells) => console.log(`${label.padEnd(18)}${[].concat(cells).join("  ")}`);
// A reason without the live mons hanging off it, so it prints and compares as data.
const flat = r => (r.kind === "upgrade" ? `upgrade ${r.final}${r.estimated ? "~" : ""} over ${r.against.name} ${r.against.final}${r.against.estimated ? "~" : ""}`
  : r.kind === "dupe" ? "dupe" : `${r.kind} ${r.types.join("/")}`);
const flatten = rs => rs.map(flat);

// ---- 1. The coverage table. One reading for every card, and the two rules the cards used to disagree on.
{
  const team = party();
  const profile = partyProfile(team);
  console.log("== attacks");
  team.forEach((p, i) => row(p.name, profile.attacks[i].map(a => `${a.t}${a.stab === 1.5 ? "*" : ""}`)));
  row("team", profile.ourTypes);
  assert.deepEqual(profile.attacks[0], [{ t: "Ground", stab: 1.5 }, { t: "Dragon", stab: 1.5 }], "STAB is the mon's own types");
  assert.deepEqual(profile.attacks[3], [{ t: "Normal", stab: 1 }], "Magikarp's Tackle is off-type");

  // A move the game prices from the situation (`power === -1`) is coverage of its type; one that sets damage outright
  // ignores the type chart, so it is coverage of nothing. The catch, biome and look-ahead cards read the first as no
  // coverage at all before this module existed; the learn card already had both right.
  const odd = mon(SPECIES.sudowoodo, 40, [
    ["Gyro Ball", "Steel", -1, "P", [new ATTRS.GyroBallPowerAttr()]],
    ["Seismic Toss", "Fighting", -1, "P", [new ATTRS.FixedDamageAttr()]],
    ["Rock Polish", "Normal", 0, "X"],
  ]);
  row("Sudowoodo", damagingTypes(odd));
  assert.deepEqual(damagingTypes(odd), ["Steel"], "variable power counts, fixed damage and status don't");
}

// ---- 2. What the team is weak to, and what it can't hit.
{
  const profile = partyProfile(party());
  console.log("== weaknesses and holes");
  row("weak to", profile.weakTypes);
  row("holes", profile.holes);
  assert.deepEqual(profile.weakTypes, ["Fighting", "Grass", "Electric"],
    "two members weak and fewer resisting — Fighting through Snorlax and Lapras's Ice half");
  assert.ok(!profile.weakTypes.includes("Ice"), "only Garchomp is weak to Ice, and Lapras resists it");
  assert.deepEqual(profile.holes, ["Normal", "Fighting", "Bug", "Water", "Ice", "Dark", "Fairy"]);
  assert.ok(!profile.holes.includes("Ghost"), "Snorlax's Crunch hits Ghost");
}

// ---- 3. The weakest member: the lowest final BST, not the lowest BST now, and the lower level breaking a tie.
{
  const profile = partyProfile(party());
  console.log("== weakest");
  row(profile.weakest.mon.name, [`final ${profile.weakest.final}${profile.weakest.estimated ? "~" : ""}`, `L${profile.weakest.level}`]);
  assert.equal(profile.weakest.mon.name, "Magikarp");
  assert.equal(profile.weakest.final, 400, "one stage left: max(200×1.3, 200+110, 400)");
  assert.equal(profile.weakest.estimated, true, "the game only says a line has an evolution, not what it grows into");
  // Two members on the same final BST: the lower level is the one to replace.
  const twins = [mon(SPECIES.lapras, 40, [["Surf", "Water", 90, "S"]]), mon(SPECIES.lapras, 30, [["Surf", "Water", 90, "S"]])];
  assert.equal(partyProfile(twins).weakest.level, 30, "a tie on final BST goes to the lower level");
}

// ---- 4. The two matchup queries, which is how every card asks about a foe. A foe is a plain defender: the replay
// hands over `{ types, ability, passive }` and a mon on the field answers the game's own methods; both read the same.
{
  const profile = partyProfile(party());
  const foe = { name: "Magnezone", types: ["Electric", "Steel"], ability: "Sturdy", passive: null };
  console.log("== matchups");
  row("hit Magnezone", profile.hitters(foe).map(p => p.name));
  row("weak to Electric", profile.weakTo("Electric").map(p => p.name));
  assert.deepEqual(profile.hitters(foe).map(p => p.name), ["Garchomp"], "Earthquake; Steel/Electric resists the rest");
  assert.deepEqual(profile.weakTo("Electric").map(p => p.name), ["Lapras", "Magikarp"], "Garchomp is Ground: immune, not weak");
  // An ability immunity is the defender's, wherever it is read from.
  const levitator = { types: ["Steel"], abilities: ["Levitate"] };
  assert.deepEqual(profile.hitters(levitator).map(p => p.name), [], "Levitate takes Earthquake away, and nothing else hits Steel");
}

// ---- 5. `partyReasons`: reasons with no weights, against the weakest member by default.
{
  const team = party();
  const profile = partyProfile(team);
  const lucario = { species: SPECIES.lucario, level: 45, types: typesOfSpecies(SPECIES.lucario) };
  console.log("== reasons");
  row("Lucario L45", flatten(partyReasons(profile, lucario)));
  assert.deepEqual(flatten(partyReasons(profile, lucario)),
    ["covers Grass", "hole Normal/Ice/Dark/Fairy", "upgrade 525 over Magikarp 400~"]);

  // `replacing`: judged against the member it would actually replace. Snorlax is no upgrade to make.
  row("vs Snorlax", flatten(partyReasons(profile, lucario, { replacing: team[1] })));
  assert.deepEqual(flatten(partyReasons(profile, lucario, { replacing: team[1] })), ["covers Grass", "hole Normal/Ice/Dark/Fairy"]);

  // Too far below the member it would replace to be worth catching up: the level gap, which the biome card gains here.
  row("Lucario L20", flatten(partyReasons(profile, { ...lucario, level: 20 })));
  assert.ok(!partyReasons(profile, { ...lucario, level: 20 }).some(r => r.kind === "upgrade"), "15 levels behind Magikarp is no upgrade");
  assert.ok(partyReasons(profile, { ...lucario, level: 25 }).some(r => r.kind === "upgrade"), "10 behind still counts");

  // The 400 floor: a stronger line than Magikarp's, but not a real mon. Sudowoodo is 410 final, +10 over the floor and
  // only +10 over Magikarp's line.
  row("Sudowoodo", flatten(partyReasons(profile, { species: SPECIES.sudowoodo, level: 40, types: typesOfSpecies(SPECIES.sudowoodo) })));
  assert.ok(!partyReasons(profile, { species: SPECIES.sudowoodo, level: 40, types: ["Rock"] }).some(r => r.kind === "upgrade"),
    "410 is over the floor but not 100 over the line it would replace");

  // Its line is already on the team, which is the one reason that stands on its own: the cards read it and stop.
  row("Gyarados", flatten(partyReasons(profile, { species: SPECIES.gyarados, level: 45, types: typesOfSpecies(SPECIES.gyarados) })));
  assert.ok(partyReasons(profile, { species: SPECIES.gyarados, level: 45, types: ["Water", "Flying"] }).some(r => r.kind === "dupe"),
    "Gyarados's root is the Magikarp on the team");
  // A hole reason wants a team to have holes in: two members are not a team.
  assert.deepEqual(flatten(partyReasons(partyProfile(team.slice(0, 2)), lucario)).filter(r => r.startsWith("hole")), [],
    "no holes named for a party of two");
}

// ---- 6. The biome card and the catch card, on one species at one level. Each builds its candidate its own way — the
// biome card knows a species and picks the level itself, the catch card holds the mon in front of you — and the rules
// they then apply are this module's, so the two cannot give different reasons.
{
  const profile = partyProfile(party());
  const level = 45;
  // As 47-biome builds it: a species, the level the card picks forms at, no moveset.
  const fromBiome = { species: SPECIES.lucario, level, types: typesOfSpecies(SPECIES.lucario) };
  // As 45-catch builds it: the wild mon, with the moves it actually knows.
  const wild = mon(SPECIES.lucario, level, [["Close Combat", "Fighting", 120, "P"], ["Flash Cannon", "Steel", 80, "S"]]);
  const fromCatch = { species: wild.species, fusion: null, level: wild.level, types: ["Fighting", "Steel"],
    abilities: ["Pressure"], moveTypes: damagingTypes(wild) };
  console.log("== one species, both cards");
  row("biome", flatten(partyReasons(profile, fromBiome)));
  row("catch", flatten(partyReasons(profile, fromCatch)));
  assert.deepEqual(flatten(partyReasons(profile, fromCatch)), flatten(partyReasons(profile, fromBiome)),
    "same species, same level, same reasons");
}

// ---- 7. Luck and a fused line's strength, the two facts about a party the cards used to keep their own copies of.
{
  const team = party();
  console.log("== luck and fusions");
  row("luck", String(partyLuck(team)));
  assert.equal(partyLuck(team), 6, "3 + 1 + 2 + 0, summed over everyone allowed in battle");
  const benched = [...team.slice(0, 3), mon(SPECIES.gyarados, 40, [["Waterfall", "Water", 80, "P"]], { luck: 9, allowed: false })];
  assert.equal(partyLuck(benched), 6, "a member not allowed in battle adds none");
  assert.equal(partyLuck([mon(SPECIES.lapras, 40, [], { luck: 14 }), mon(SPECIES.snorlax, 40, [], { luck: 9 })]), 14, "clamped at 14");

  // A fusion is judged by the pair: per-stat averages aren't readable from a BST alone, so two final forms average.
  const fused = finalBstOf({ species: SPECIES.snorlax, fusion: SPECIES.lapras });
  row("Snorlax←Lapras", [`final ${fused.final}`, fused.estimated ? "estimated" : "exact"]);
  assert.deepEqual(fused, { bst: 538, final: 538, estimated: false }, "both halves are final forms: their averaged BST stands");
  const growing = finalBstOf({ species: SPECIES.magikarp, fusion: SPECIES.snorlax });
  row("Magikarp←Snorlax", [`final ${growing.final}~`]);
  assert.equal(growing.estimated, true, "one half still grows, so the pair's number is an estimate");
  assert.equal(growing.final, Math.ceil((400 + 540) / 2));
  // A bare species, which is all a biome spawn or a trade offer is.
  assert.deepEqual(finalBstOf({ species: SPECIES.lapras }), { bst: 535, final: 535, estimated: false });

  // `calculateBaseStats` starts from the *form*'s stats, so a mon standing in an alternate form is worth that form's
  // total, not the species entry's. Deoxys-like: the species row is the Normal form, form 1 is the Attack form.
  const deoxys = { speciesId: 386, baseTotal: 600, baseStats: [50, 150, 50, 150, 50, 150], getEvolutionLevels: () => [],
    forms: [{ baseTotal: 600, baseStats: [50, 150, 50, 150, 50, 150] }, { baseTotal: 700, baseStats: [50, 180, 20, 180, 20, 250] }] };
  assert.equal(finalBstOf({ species: deoxys }).bst, 600, "no mon, no form index: the species' own row");
  assert.equal(finalBstOf({ species: deoxys, formIndex: 1 }).bst, 700, "the form the mon is standing in");
  row("Deoxys form 1", [`final ${finalBstOf({ species: deoxys, formIndex: 1 }).final}`]);

  // A live mon answers for itself: Flip Stat, Shuckle Juice, Old Gateau, Spliced Endless halving and vitamins are all
  // already in `calculateBaseStats`, so its sum wins over any species row.
  const vitamined = { species: deoxys, formIndex: 1, calculateBaseStats: () => [60, 190, 30, 190, 30, 260] };
  assert.equal(finalBstOf(vitamined).bst, 760, "vitamins and the rest come through the game's own call");
  const spliced = { species: deoxys, formIndex: 1, calculateBaseStats: () => [25, 90, 10, 90, 10, 125] };
  assert.equal(finalBstOf(spliced).bst, 350, "Spliced Endless halves the pair, and the profile follows");
  const broken = { species: deoxys, formIndex: 1, calculateBaseStats: () => { throw new Error("hidden in this build"); } };
  assert.equal(finalBstOf(broken).bst, 700, "a build that hides the method falls back to the form");

  // A fusion: the pair's stats are the mon's, while each half's *line* is projected from its own form.
  const fusedForm = { species: SPECIES.magikarp, fusionSpecies: deoxys, fusionFormIndex: 1,
    calculateBaseStats: () => [55, 180, 30, 130, 30, 210] };
  const pair = finalBstOf(fusedForm);
  assert.equal(pair.bst, 635, "the mon's own fused stats");
  assert.equal(pair.final, Math.ceil((400 + 700) / 2), "Magikarp's line grows; the Attack form is already final");
}

// ---- 8. Nothing to judge: an empty party has no reasons to give, and no card should crash asking.
{
  const empty = partyProfile([]);
  assert.deepEqual(empty.weakTypes, []);
  assert.equal(empty.weakest, null);
  assert.deepEqual(partyReasons(empty, { species: SPECIES.lucario, level: 20, types: ["Fighting"] }), []);
  assert.deepEqual(partyReasons(partyProfile(party()), null), []);
  assert.deepEqual(damagingTypes({}), [], "a mon with no moveset attacks with nothing");
  console.log("== empty party ok");
}

// A profile carries live mons and two queries, so it is deliberately not JSON-safe; what the cards put on a model is
// their own shape. Only the numbers and names above cross that line.
assert.equal(typeof partyProfile(party()).hitters, "function");
assert.equal(TY.length, 18);
assert.equal(species(1, "Bulbasaur", ["Grass", "Poison"], 318).baseTotal, 318);
