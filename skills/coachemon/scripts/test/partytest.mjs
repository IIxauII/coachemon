import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { party, mon, species, SPECIES, ATTRS, TY } from "./fixtures/party.mjs";

// A bare scene with no `ui`, so the HUD's own tick draws nothing.
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => ({ gameMode: {} }) } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { partyAtFight, partyProfile, partyReasons, damagingTypes, finalBstOf, partyLuck, typesOfSpecies } = globalThis.__hud["08-party"];

const row = (label, cells) => console.log(`${label.padEnd(18)}${[].concat(cells).join("  ")}`);
// A reason without the live mons hanging off it, so it prints and compares as data.
const flat = r => (r.kind === "upgrade" ? `upgrade ${r.final}${r.estimated ? "~" : ""} over ${r.against.name} ${r.against.final}${r.against.estimated ? "~" : ""}`
  : r.kind === "dupe" ? "dupe" : `${r.kind} ${r.types.join("/")}`);
const flatten = rs => rs.map(flat);

// ---- The coverage table: STAB, and variable power counting where fixed damage doesn't.
{
  const team = party();
  const profile = partyProfile(team);
  console.log("== attacks");
  team.forEach((p, i) => row(p.name, profile.attacks[i].map(a => `${a.t}${a.stab === 1.5 ? "*" : ""}`)));
  row("team", profile.ourTypes);
  assert.deepEqual(profile.attacks[0], [{ t: "Ground", stab: 1.5 }, { t: "Dragon", stab: 1.5 }], "STAB is the mon's own types");
  assert.deepEqual(profile.attacks[3], [{ t: "Normal", stab: 1 }], "Magikarp's Tackle is off-type");

  const odd = mon(SPECIES.sudowoodo, 40, [
    ["Gyro Ball", "Steel", -1, "P", [new ATTRS.GyroBallPowerAttr()]],
    ["Seismic Toss", "Fighting", -1, "P", [new ATTRS.FixedDamageAttr()]],
    ["Rock Polish", "Normal", 0, "X"],
  ]);
  row("Sudowoodo", damagingTypes(odd));
  assert.deepEqual(damagingTypes(odd), ["Steel"], "variable power counts, fixed damage and status don't");
}

// ---- What the team is weak to, and what it can't hit.
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

// ---- The lightest member: the lowest final BST, not the lowest BST now, and the lower level breaking a tie. It is
// not the weakest member and no longer claims to be — the weakest is what the party loses least by, which only a run
// read can price (#582).
{
  const profile = partyProfile(party());
  console.log("== lightest");
  row(profile.lightest.mon.name, [`final ${profile.lightest.final}${profile.lightest.estimated ? "~" : ""}`, `L${profile.lightest.level}`]);
  assert.equal(profile.lightest.mon.name, "Magikarp");
  assert.equal(profile.lightest.final, 400, "one stage left: max(200×1.3, 200+110, 400)");
  assert.equal(profile.lightest.estimated, true, "the game only says a line has an evolution, not what it grows into");
  const twins = [mon(SPECIES.lapras, 40, [["Surf", "Water", 90, "S"]]), mon(SPECIES.lapras, 30, [["Surf", "Water", 90, "S"]])];
  assert.equal(partyProfile(twins).lightest.level, 30, "a tie on final BST goes to the lower level");
}

// ---- The weakest member is handed in or it is absent: this file never opens a run read, so no profile it builds has
// one. Which member it is, and what it costs to lose, is 12-value's `weakestMember` and judgmenttest's to pin (#582).
{
  const team = party();
  const bare = partyProfile(team);
  const told = partyProfile(team, { weakest: { mon: team[0], name: "Garchomp", cost: 1.5, dead: null } });
  console.log("== weakest");
  row("told nothing", [String(bare.weakest)]);
  row("told Garchomp", [told.weakest.name, `${told.weakest.cost} turns`]);
  assert.equal(bare.weakest, null, "a reader holding only a profile gets no weakest member at all");
  assert.equal(told.weakest.mon, team[0], "and the one handed in comes back untouched, cost and all");
  assert.notEqual(bare.lightest.mon, told.weakest.mon, "the two answers are free to disagree, and here they do");
  // The tallies are the profile's own and the handing-in moves none of them.
  for (const key of ["ourTypes", "weakTypes", "holes"]) assert.deepEqual(told[key], bare[key], key);
  assert.deepEqual(told.members, bare.members);
  assert.deepEqual(told.attacks, bare.attacks);
  assert.equal(told.luck, bare.luck);
}

// ---- The two matchup queries: who hits a foe, and who is weak to a type.
{
  const profile = partyProfile(party());
  const foe = { name: "Magnezone", types: ["Electric", "Steel"], ability: "Sturdy", passive: null };
  console.log("== matchups");
  row("hit Magnezone", profile.hitters(foe).map(p => p.name));
  row("weak to Electric", profile.weakTo("Electric").map(p => p.name));
  assert.deepEqual(profile.hitters(foe).map(p => p.name), ["Garchomp"], "Earthquake; Steel/Electric resists the rest");
  assert.deepEqual(profile.weakTo("Electric").map(p => p.name), ["Lapras", "Magikarp"], "Garchomp is Ground: immune, not weak");
  const levitator = { types: ["Steel"], abilities: ["Levitate"] };
  assert.deepEqual(profile.hitters(levitator).map(p => p.name), [], "Levitate takes Earthquake away, and nothing else hits Steel");
}

// ---- The party at the next big fight: every member at full health, and dead weight holding its slot at zero.
{
  const LIMITED_SUPPORT = 8, HARDCORE = 9; // `Challenges`, which only the bundle's prelude holds
  const scene = (...challenges) => ({ gameMode: { isClassic: true, challenges } });
  const limited = value => scene({ id: LIMITED_SUPPORT, value });
  const karp = opts => mon(SPECIES.magikarp, 35, [["Tackle", "Normal", 40, "P"]], opts);
  const at = (s, member, from, fight) => partyAtFight(s, [...party().slice(0, 3), member], { from, fight });
  const show = (label, r) => row(label, [`up ${r.members.map(p => p.name).join("/")}`,
    `zero ${r.dead.length ? r.dead.map(d => `${d.name}:${d.why}`).join(",") : "—"}`,
    r.revive ? `back on W${r.revive.wave} (${r.revive.kind})` : "no way back"]);
  console.log("== the party at the next big fight");

  const bar = at(scene(), karp({ barred: true }), 24, 25);
  show("barred", bar);
  assert.deepEqual(bar.members.map(p => p.name), ["Garchomp", "Snorlax", "Lapras"]);
  assert.deepEqual(bar.dead.map(d => [d.name, d.why]), [["Magikarp", "barred"]]);

  const hard = at(scene({ id: HARDCORE, value: 1 }), karp({ hp: 0 }), 24, 25);
  show("fainted hardcore", hard);
  assert.deepEqual(hard.dead.map(d => [d.name, d.why]), [["Magikarp", "fainted"]], "Hardcore keeps the heal from reviving");
  const stranded = at(limited(3), karp({ hp: 0 }), 24, 25);
  show("fainted stranded", stranded);
  assert.deepEqual(stranded.dead.map(d => [d.name, d.why]), [["Magikarp", "fainted"]], "Limited Support 3 removes both");

  const healed = at(scene(), karp({ hp: 0 }), 20, 25);
  show("fainted, heal W21", healed);
  assert.deepEqual(healed.dead, [], "the W21 heal is before the fight");
  assert.deepEqual(healed.revive, { kind: "heal", wave: 21 });
  const shopped = at(limited(1), karp({ hp: 0 }), 24, 25);
  show("fainted, shop W24", shopped);
  assert.deepEqual(shopped.dead, [], "no heal under Limited Support 1, but W24's clear still opens the shop row");
  assert.deepEqual(shopped.revive, { kind: "shop", wave: 24 });

  const late = at(limited(2), karp({ hp: 0 }), 24, 25);
  show("heal too late", late);
  assert.deepEqual(late.dead.map(d => [d.name, d.why]), [["Magikarp", "fainted"]], "W31's heal is past W25, and 2 removes the shop");
  assert.deepEqual(at(limited(2), karp({ hp: 0 }), 24, 31).dead, [], "the same heal counts for a fight on W31");

  // The modifiers below are read by nothing: luck is not a way back (#569).
  const seeded = karp({ hp: 0 });
  const rescued = { ...scene({ id: HARDCORE, value: 1 }),
    modifiers: [{ constructor: { name: "PokemonInstantReviveModifier" }, pokemonId: seeded.id },
      { constructor: { name: "ReviveModifier" } }] };
  show("seed and a Revive", partyAtFight(rescued, [...party().slice(0, 3), seeded], { from: 24, fight: 25 }));
  assert.deepEqual(partyAtFight(rescued, [...party().slice(0, 3), seeded], { from: 24, fight: 25 }).dead.map(d => d.name),
    ["Magikarp"], "a held Reviver Seed and a Revive in the bag rescue nobody");

  const open = partyAtFight(scene(), [karp({ hp: 0 }), mon(SPECIES.sudowoodo, 40, [], { barred: true })], {});
  show("no fight named", open);
  assert.deepEqual(open.dead.map(d => [d.name, d.why]), [["Sudowoodo", "barred"]], "a heal ahead and no fight to beat it to");
  assert.deepEqual(partyAtFight(scene(), null, {}), { members: [], dead: [], revive: { kind: "heal", wave: 1 } },
    "no party is no dead weight");
}

// ---- `partyReasons`: reasons with no weights, against the lightest member by default.
{
  const team = party();
  const profile = partyProfile(team);
  const lucario = { species: SPECIES.lucario, level: 45, types: typesOfSpecies(SPECIES.lucario) };
  console.log("== reasons");
  row("Lucario L45", flatten(partyReasons(profile, lucario)));
  assert.deepEqual(flatten(partyReasons(profile, lucario)),
    ["covers Grass", "hole Normal/Ice/Dark/Fairy", "upgrade 525 over Magikarp 400~"]);

  // `replacing`: judged against the member it would actually replace.
  row("vs Snorlax", flatten(partyReasons(profile, lucario, { replacing: team[1] })));
  assert.deepEqual(flatten(partyReasons(profile, lucario, { replacing: team[1] })), ["covers Grass", "hole Normal/Ice/Dark/Fairy"]);

  row("Lucario L20", flatten(partyReasons(profile, { ...lucario, level: 20 })));
  assert.ok(!partyReasons(profile, { ...lucario, level: 20 }).some(r => r.kind === "upgrade"), "15 levels behind Magikarp is no upgrade");
  assert.ok(partyReasons(profile, { ...lucario, level: 25 }).some(r => r.kind === "upgrade"), "10 behind still counts");

  // Sudowoodo's 410 final clears the 400 floor but is only +10 over Magikarp's line.
  row("Sudowoodo", flatten(partyReasons(profile, { species: SPECIES.sudowoodo, level: 40, types: typesOfSpecies(SPECIES.sudowoodo) })));
  assert.ok(!partyReasons(profile, { species: SPECIES.sudowoodo, level: 40, types: ["Rock"] }).some(r => r.kind === "upgrade"),
    "410 is over the floor but not 100 over the line it would replace");

  // A dupe is the one reason that stands on its own: the cards read it and stop.
  row("Gyarados", flatten(partyReasons(profile, { species: SPECIES.gyarados, level: 45, types: typesOfSpecies(SPECIES.gyarados) })));
  assert.ok(partyReasons(profile, { species: SPECIES.gyarados, level: 45, types: ["Water", "Flying"] }).some(r => r.kind === "dupe"),
    "Gyarados's root is the Magikarp on the team");
  assert.deepEqual(flatten(partyReasons(partyProfile(team.slice(0, 2)), lucario)).filter(r => r.startsWith("hole")), [],
    "no holes named for a party of two");
}

// ---- The biome card and the catch card give one species at one level the same reasons.
{
  const profile = partyProfile(party());
  const level = 45;
  // As 47-biome builds it.
  const fromBiome = { species: SPECIES.lucario, level, types: typesOfSpecies(SPECIES.lucario) };
  // As 45-catch builds it.
  const wild = mon(SPECIES.lucario, level, [["Close Combat", "Fighting", 120, "P"], ["Flash Cannon", "Steel", 80, "S"]]);
  const fromCatch = { species: wild.species, fusion: null, level: wild.level, types: ["Fighting", "Steel"],
    abilities: ["Pressure"], moveTypes: damagingTypes(wild) };
  console.log("== one species, both cards");
  row("biome", flatten(partyReasons(profile, fromBiome)));
  row("catch", flatten(partyReasons(profile, fromCatch)));
  assert.deepEqual(flatten(partyReasons(profile, fromCatch)), flatten(partyReasons(profile, fromBiome)),
    "same species, same level, same reasons");
}

// ---- Party luck follows the game's own terms, and a fusion is judged by the pair.
{
  const team = party();
  console.log("== luck and fusions");
  row("luck", String(partyLuck(team)));
  assert.equal(partyLuck(team), 6, "3 + 1 + 2 + 0, summed over everyone allowed in battle");
  const benched = [...team.slice(0, 3), mon(SPECIES.gyarados, 40, [["Waterfall", "Water", 80, "P"]], { luck: 9, allowed: false })];
  assert.equal(partyLuck(benched), 6, "a member not allowed in battle adds none");
  assert.equal(partyLuck([mon(SPECIES.lapras, 40, [], { luck: 14 }), mon(SPECIES.snorlax, 40, [], { luck: 9 })]), 14, "clamped at 14");

  // The three terms of `getPartyLuckValue` that are not the party's at all (game-code.md §12).
  const rnd = globalThis.Phaser.Math.RND;
  let forked = null, drew = null;
  rnd.integerInRange = (min, max) => { drew = [min, max]; return 11; };
  const daily = { seed: "kAbC12", gameMode: { isDaily: true },
    executeWithSeedOffset(fn, offset, seedOverride) { forked = [offset, seedOverride]; fn(); } };
  row("daily luck", String(partyLuck(team, daily)));
  assert.equal(partyLuck(team, daily), 11, "in Daily the luck is a roll of the run seed's, not the party's 6");
  assert.deepEqual(forked, [0, "kAbC12"], "in a fork at offset 0 on the run seed, so it costs the stream nothing");
  assert.deepEqual(drew, [0, 14], "randSeedInt(15)");
  assert.equal(partyLuck(team, { ...daily, gameMode: { isDaily: true, dailyConfig: { luck: 3 } } }), 3, "the event seed's own luck");
  assert.equal(partyLuck(team, { ...daily, gameMode: { isDaily: true, dailyConfig: { luck: 99 } } }), 11, "out of range is no pin");
  assert.equal(partyLuck(team, { gameMode: { isDaily: true } }), 6, "with no scene to fork on, the party's sum is all there is");
  const event = { getEventLuckBoostedSpecies: () => [team[0].species.speciesId], getEventLuckBoost: () => 2 };
  row("event luck", String(partyLuck(team, null, event)));
  assert.equal(partyLuck(team, null, event), 6 + 1 + 2, "a boosted species is +1, and the event's boost is on top");
  assert.equal(partyLuck(team, null, { getEventLuckBoostedSpecies: () => [], getEventLuckBoost: () => 9 }), 14, "capped at 14 again");
  assert.equal(partyLuck(team), 6, "without the event manager it is the floor it always was");
  delete rnd.integerInRange;

  const fused = finalBstOf({ species: SPECIES.snorlax, fusion: SPECIES.lapras });
  row("Snorlax←Lapras", [`final ${fused.final}`, fused.estimated ? "estimated" : "exact"]);
  assert.deepEqual(fused, { bst: 538, final: 538, estimated: false }, "both halves are final forms: their averaged BST stands");
  const growing = finalBstOf({ species: SPECIES.magikarp, fusion: SPECIES.snorlax });
  row("Magikarp←Snorlax", [`final ${growing.final}~`]);
  assert.equal(growing.estimated, true, "one half still grows, so the pair's number is an estimate");
  assert.equal(growing.final, Math.ceil((400 + 540) / 2));
  assert.deepEqual(finalBstOf({ species: SPECIES.lapras }), { bst: 535, final: 535, estimated: false });

  // `calculateBaseStats` starts from the form's stats (game-code.md §20). Form 0 gets a row of its own here, so the
  // species' own row and form 0's are different numbers.
  const deoxys = { speciesId: 386, baseTotal: 600, baseStats: [50, 150, 50, 150, 50, 150], getEvolutionLevels: () => [],
    forms: [{ baseTotal: 590, baseStats: [50, 145, 50, 145, 50, 150] }, { baseTotal: 700, baseStats: [50, 180, 20, 180, 20, 250] }] };
  assert.equal(finalBstOf({ species: deoxys }).bst, 600, "no mon, no form index: the species' own row, not form 0's");
  assert.equal(finalBstOf({ species: deoxys, formIndex: 0 }).bst, 590, "a mon standing in form 0 is worth form 0");
  assert.equal(finalBstOf({ species: deoxys, formIndex: 1 }).bst, 700, "the form the mon is standing in");
  row("Deoxys form 1", [`final ${finalBstOf({ species: deoxys, formIndex: 1 }).final}`]);

  // A live mon's own `calculateBaseStats` wins over any species row (game-code.md §20).
  const vitamined = { species: deoxys, formIndex: 1, calculateBaseStats: () => [60, 190, 30, 190, 30, 260] };
  assert.equal(finalBstOf(vitamined).bst, 760, "vitamins and the rest come through the game's own call");
  const spliced = { species: deoxys, formIndex: 1, calculateBaseStats: () => [25, 90, 10, 90, 10, 125] };
  assert.equal(finalBstOf(spliced).bst, 350, "Spliced Endless halves the pair, and the profile follows");
  const broken = { species: deoxys, formIndex: 1, calculateBaseStats: () => { throw new Error("hidden in this build"); } };
  assert.equal(finalBstOf(broken).bst, 700, "a build that hides the method falls back to the form");

  // Cached against the mon and its `stats`: the call logs once per modifier (game-code.md §20), and uncached a party
  // carrying vitamins would print on every HUD tick.
  let calls = 0;
  const vitaminCache = { species: deoxys, formIndex: 1, level: 50, stats: [1, 1, 1, 1, 1, 1],
    calculateBaseStats: () => { calls++; return [60, 190, 30, 190, 30, 260]; } };
  assert.equal(finalBstOf(vitaminCache).bst, 760);
  assert.equal(finalBstOf(vitaminCache).bst, 760);
  assert.equal(calls, 1, "the second read comes from the cache, so the game logs once");
  vitaminCache.stats = [2, 1, 1, 1, 1, 1];
  assert.equal(finalBstOf(vitaminCache).bst, 760);
  assert.equal(calls, 2, "a modifier that moves the mon's stats moves its base stats too: ask again");
  const twin = { species: deoxys, formIndex: 1, level: 50, stats: [1, 1, 1, 1, 1, 1],
    calculateBaseStats: () => [10, 10, 10, 10, 10, 10] };
  assert.equal(finalBstOf(twin).bst, 60, "the cache is keyed on the mon, not on its species");

  // A fusion: the pair's stats are the mon's, while each half's *line* is projected from its own form.
  const fusedForm = { species: SPECIES.magikarp, fusionSpecies: deoxys, fusionFormIndex: 1,
    calculateBaseStats: () => [55, 180, 30, 130, 30, 210] };
  const pair = finalBstOf(fusedForm);
  assert.equal(pair.bst, 635, "the mon's own fused stats");
  assert.equal(pair.final, Math.ceil((400 + 700) / 2), "Magikarp's line grows; the Attack form is already final");
}

// ---- Nothing to judge: an empty party has no reasons to give, and no card should crash asking.
{
  const empty = partyProfile([]);
  assert.deepEqual(empty.weakTypes, []);
  assert.equal(empty.lightest, null);
  assert.equal(empty.weakest, null);
  assert.deepEqual(partyReasons(empty, { species: SPECIES.lucario, level: 20, types: ["Fighting"] }), []);
  assert.deepEqual(partyReasons(partyProfile(party()), null), []);
  assert.deepEqual(damagingTypes({}), [], "a mon with no moveset attacks with nothing");
  console.log("== empty party ok");
}

// A profile carries live mons and two queries, so it is deliberately not JSON-safe.
assert.equal(typeof partyProfile(party()).hitters, "function");
assert.equal(TY.length, 18);
assert.equal(species(1, "Bulbasaur", ["Grass", "Poison"], 318).baseTotal, 318);
