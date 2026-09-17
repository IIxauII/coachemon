// Offline divergence dump for #113: ⚔ turn line vs ♟ fight plan step 1, over mocked battle states.
// Throwaway research harness (branch research/hud-authority). It never touches the live game and never edits HUD
// source: the bundle is rewritten in memory only, the way test/plannertest.mjs already does.
//
// Usage: node research/hud-authority/dump.mjs [--json] [--only <name-regex>]
//
// Each scenario is mounted like the golden tests mount theirs (a mocked scene in the CommandPhase, the whole HUD bundle
// eval'd, `window.__coachHud.last()` read back), so ⚔ and ♟ come from the exact objects the panel draws. Damage comes
// from 10-damage's own approximation records (`fromApprox`: rolls, accuracy, KO odds), the same for both models.
// In-memory hooks add what only an offline run can ask:
// - `noReserve`: ♟ re-searched without the reserve holdback (does step 1 then agree with ⚔?);
// - `pinPlan`: ♟ with step 1 pinned to ⚔'s mon — the plan value that costs ("⚔ seeds ♟");
// - `pinTurn`: ⚔ restricted to fields holding ♟'s mon — the turn score that costs ("♟ constrains ⚔");
// - `stale`: the ♟ cache replayed across a phase change (bucket 8);
// - timings of `teamPlan` and `fieldPlan` from cold caches.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "../../skills/coach-pokerogue/scripts/hud-bundle.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const testDir = fileURLToPath(new URL("../../skills/coach-pokerogue/scripts/test/", import.meta.url));
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.includes("--only") ? new RegExp(args[args.indexOf("--only") + 1]) : null;

// ---- The bundle, with stubs (plannertest's technique) and research hooks.
const replaceOnce = (src, from, to) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`hook anchor found ${n}× (HUD source moved?): ${from.slice(0, 60)}`);
  return src.replace(from, () => to);
};
const STUBBED = ["statusMoves", "endOfTurnHp", "enemyMoveDistribution", "predictSwitches"];
// Mock-side status moves (as plannertest), a turn-end stub (poison chip), and optional AI / switch overrides that
// otherwise fall through to the real module (its own approximation on mocks).
const STUBS = `
const statusMoves = (s, atk, def) => atk.moveset.filter(pm => pm.getMove().category === 2).map(pm => ({
  pm, name: pm.getName(), type: TYPES[pm.getMove().type], cat: "status", acc: pm.getMove().accuracy > 0 ? pm.getMove().accuracy / 100 : 1,
  e: 1, priority: pm.getMove().priority ?? 0, bypassProtect: false, bounce: false, blocked: null,
}));
const endOfTurnHp = (p, opts) => globalThis.__stub?.heal ? globalThis.__stub.heal(p, opts) : 0;
const enemyMoveDistribution = (s, e) => (globalThis.__stub?.dist ? globalThis.__stub.dist(e) : null) ?? __real_enemyMoveDistribution(s, e);
const predictSwitches = (s, b, active) => globalThis.__stub?.switches ? globalThis.__stub.switches(active) : __real_predictSwitches(s, b, active);
`;
const researchBundle = () => {
  let src = bundle("hud");
  for (const n of STUBBED) {
    src = src.replace(new RegExp(`^(const|let|function)\\s+${n}\\b`, "m"), `$1 __real_${n}`);
    src = src.replace(/^const \{([^}]*)\}\s*=/gm, (all, names) => all.replace(names, names.replace(new RegExp(`(^|[,\\s])${n}(?=\\s*[,}]|\\s*$)`), `$1${n}: __real_${n}`)));
  }
  src = replaceOnce(src, "// ---- 30-planner.js", `${STUBS}\n// ---- 30-planner.js`);
  // ♟: pin step 1's mon, switch the reserve holdback off, expose the plan's value.
  src = replaceOnce(src, `let cands = tpAlive(st.oh).map(mi => [mi, st.cur == null ? "free" : mi === st.cur ? "stay" : "switch"]);`,
    `let cands = tpAlive(st.oh).map(mi => [mi, st.cur == null ? "free" : mi === st.cur ? "stay" : "switch"]);
      if (globalThis.__tpPin != null && !st.steps.length) cands = cands.filter(([mi]) => T.party[mi].name === globalThis.__tpPin);`);
  src = replaceOnce(src, "const held = reserve.length ? tpSearch(T, start, reserve, win) : null;",
    "const held = reserve.length && !globalThis.__noReserve ? tpSearch(T, start, reserve, win) : null;");
  src = replaceOnce(src, "  return {\n    result: plan.result,", "  return {\n    val: plan.val, held: plan === held, result: plan.result,");
  // ⚔: restrict the candidate fields to ones holding a named mon, expose the chosen plan's score and its inputs.
  src = replaceOnce(src, "  for (const members of kept) {", "  for (const members of kept.filter(ms => globalThis.__fpPin == null || ms.some(p => p.name === globalThis.__fpPin))) {");
  src = replaceOnce(src, "    picks, // live objects", "    score: best.score, stayScore: bestStay?.score ?? null,\n    picks, // live objects");
  src = replaceOnce(src, "  const ifStay = active.some(switching)",
    "  globalThis.__fpArgs = { party, facing, attackers, double: !!b.double, freeSwitch, locked };\n  const ifStay = active.some(switching)");
  const end = src.lastIndexOf("})();");
  return src.slice(0, end) + `globalThis.__h = { model, fieldPlan, teamPlan, tpTables, tpView, sandbox, withPredictedTera, predictedTeras,
  reset: () => { teamPlanCache = { key: null, live: false, value: null }; plannerMemo = { key: null, map: new Map() };
    switchCache = { key: null, wave: null, turn: null, value: new Map() }; moveCache = { key: null, wave: null, turn: null, value: new Map() }; },
  cacheKey: () => teamPlanCache.key };\n` + src.slice(end);
};
const SRC = researchBundle();
eval(readFileSync(here + "agreement.js", "utf8"));

// ---- Mocks (test/plannertest.mjs's mon, with an ability and a battler index).
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const attr = a => (Array.isArray(a) ? Object.assign(new ({ [a[0]]: class {} })[a[0]](), a[1]) : new ({ [a]: class {} })[a]());
// moves: [name, type, power, cat, { priority, target, attrs, acc, id }]
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => !!extra.bossSegments,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, getHeldItems: () => [],
  moveset: moves.map(([n, t, p, c, { priority = 0, target = 3, attrs = [], acc = 100, id } = {}]) => ({ getName: () => n, moveId: id,
    getMove: () => ({ id, name: n, type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, priority, accuracy: acc, attrs: attrs.map(attr) }), getMovePp: () => 10, ppUsed: 0 })),
  ...extra,
});
const boss = (bars, left = bars) => ({ bossSegments: bars, bossSegmentIndex: left - 1 });
const beastBoost = stat => ({
  hasAbilityWithAttr: a => a === "PostVictoryStatStageChangeAbAttr",
  getAbility: () => ({ name: "Beast Boost", getAttrs: a => (a === "PostVictoryStatStageChangeAbAttr" ? [{ changes: () => [{ stat, stages: 1 }] }] : []) }),
});
// Ids unique across both sides; battler indices in field order (ours 0–1, theirs 2–3).
const normalise = (party, foes) => {
  const tag = (list, side, base) => {
    let k = 0;
    for (const p of list) {
      p.id = `${side}:${p.name}`;
      if (!p.getBattlerIndex) { const idx = p.isOnField() ? base + k++ : -1; p.getBattlerIndex = () => idx; }
      p.getFieldIndex ??= () => Math.max(0, p.getBattlerIndex() - base);
      p.getHeldItems ??= () => [];
      p.moveset = p.moveset.map(pm => { const mv = pm.getMove(); if (!("accuracy" in mv) || !mv.attrs) { const get = pm.getMove; pm.getMove = () => ({ accuracy: 100, attrs: [], ...get() }); } return pm; });
    }
  };
  tag(party, "p", 0); tag(foes, "f", 2);
};

// ---- Scenarios reused from the test suite, sliced from their own source so they can't drift.
const slice = (file, from, to) => { const t = readFileSync(testDir + file, "utf8"); const a = t.indexOf(from), b = t.indexOf(to, a); if (a < 0 || b < 0) throw new Error(`slice ${file}`); return t.slice(a, b); };
const battletest = new Function(`${slice("battletest.mjs", "const TY", "const txt =")}\nreturn scenarios;`)();
const teamplan = new Function(`${slice("teamplantest.mjs", "const TY", "const run =")}\nreturn { mon, party, foes };`)();

// A trainer mock. `scores`: bench matchup scores the real predictSwitches reads (none: no switch predicted).
const trainerOf = ({ name = "Tester", isBoss = false, scores = null, teras = [], double = false } = {}) => ({
  getName: () => name, config: { isBoss }, isDouble: () => double,
  getPartyMemberMatchupScores: () => scores ?? [], getSortedPartyMemberMatchupScores: x => x.slice().sort((a, b) => b[1] - a[1]),
  getNextSummonIndex: () => 1, shouldTera: e => teras.includes(e.name),
});

const scenarios = [];
const add = (name, source, sc) => scenarios.push({ name, source, ...sc });

// battletest: the native trainer states as they are; the wild ones re-run as a trainer battle (♟ exists only there).
for (const [label, sc] of Object.entries(battletest)) {
  const native = !!sc.trainer;
  add(`battle/${label}`, native ? "battletest (trainer)" : "battletest (wild → trainer)", {
    fresh: () => { const s = new Function(`${slice("battletest.mjs", "const TY", "const txt =")}\nreturn scenarios;`)()[label];
      for (const f of s.foes) f.getMatchupScore = () => 1;
      return { party: s.party, foes: s.foes, double: s.double,
        trainer: trainerOf({ isBoss: false, teras: s.teras ?? [], scores: native ? s.foes.slice(1).map((f, i) => [i + 1, 5]) : [] }) }; },
  });
}
// teamplantest: the Cyrus-like 4 v 6 with a boss Weavile win condition, and its small fixtures.
add("teamplan/cyrus-4v6", "teamplantest", { fresh: () => { const t = new Function(`${slice("teamplantest.mjs", "const TY", "const run =")}\nreturn { party, foes };`)(); return { party: t.party, foes: t.foes, trainer: trainerOf({ name: "Cyrus", isBoss: true }) }; } });
// The same fight with the reserved answer already out: Scrafty (saved for Weavile) on the field against Honchkrow.
add("teamplan/cyrus-4v6 (answer on field)", "teamplantest, Scrafty leads", { fresh: () => {
  const t = new Function(`${slice("teamplantest.mjs", "const TY", "const run =")}\nreturn { party, foes };`)();
  t.party[0].isOnField = () => false; t.party[1].isOnField = () => true;
  return { party: t.party, foes: t.foes, trainer: trainerOf({ name: "Cyrus", isBoss: true }) };
} });
// …and with Blastoise (also saved for Weavile) out against Houndoom, which it hits super-effectively.
add("teamplan/cyrus-4v6 (Blastoise vs Houndoom)", "teamplantest, Blastoise leads into Houndoom", { fresh: () => {
  const t = new Function(`${slice("teamplantest.mjs", "const TY", "const run =")}\nreturn { party, foes };`)();
  t.party[0].isOnField = () => false; t.party[2].isOnField = () => true;
  t.foes[0].isOnField = () => false; t.foes[3].isOnField = () => true;
  return { party: t.party, foes: t.foes, trainer: trainerOf({ name: "Cyrus", isBoss: true }) };
} });
add("teamplan/youngster", "teamplantest", { fresh: () => {
  const { mon: m } = teamplan;
  return { party: [m("Charizard", 30, ["Fire","Flying"], "Blaze", [95,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true), m("Blastoise", 30, ["Water"], "Torrent", [95,58,70,62,75,55], [["Surf","Water",90,"S"]], false)],
    foes: [m("Rattata", 12, ["Normal"], "Run Away", [32,20,15,12,15,30], [["Tackle","Normal",40,"P"]], true), m("Pidgey", 12, ["Normal","Flying"], "Keen Eye", [34,18,17,16,16,26], [["Gust","Flying",40,"S"]], false)],
    trainer: trainerOf() };
} });
add("teamplan/youngster-double", "teamplantest", { fresh: () => {
  const { mon: m } = teamplan;
  return { double: true, party: [m("Charizard", 30, ["Fire","Flying"], "Blaze", [95,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true), m("Blastoise", 30, ["Water"], "Torrent", [95,58,70,62,75,55], [["Surf","Water",90,"S"]], true)],
    foes: [m("Rattata", 12, ["Normal"], "Run Away", [32,20,15,12,15,30], [["Tackle","Normal",40,"P"]], true), m("Pidgey", 12, ["Normal","Flying"], "Keen Eye", [34,18,17,16,16,26], [["Gust","Flying",40,"S"]], true)],
    trainer: trainerOf({ double: true }) };
} });
add("teamplan/beast-boost-fodder", "teamplantest", { fresh: () => {
  const { mon: m } = teamplan;
  const bb = beastBoost(1);
  return { party: [m("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [60,450,30,30,30,300], [["Brave Bird","Flying",120,"P"]], true, 10),
      m("Blastoise", 100, ["Water"], "Torrent", [400,150,300,150,300,250], [["Hydro Pump","Water",110,"S"]], false)],
    foes: [Object.assign(m("Buzzwole", 100, ["Bug","Fighting"], "Beast Boost", [400,300,300,100,100,200], [["Lunge","Bug",80,"P"],["Thunder Punch","Electric",75,"P"]], true), bb)],
    trainer: trainerOf() };
} });

// plannertest-derived states (its mons and fields; damage from the approximation instead of its hand table).
const cyrus = withMetagross => ({
  party: [
    mon("Morpeko", 80, ["Electric", "Dark"], "Hunger Switch", [220, 150, 90, 120, 100, 170], [["Aura Wheel", "Electric", 110, "P"]], true, 180),
    mon("Scrafty", 80, ["Dark", "Fighting"], "Shed Skin", [254, 152, 172, 63, 165, 80], [["High Jump Kick", "Fighting", 130, "P", { acc: 90 }]], false, 133),
    ...(withMetagross ? [mon("Metagross", 80, ["Steel", "Psychic"], "Clear Body", [250, 180, 170, 120, 120, 120], [["Meteor Mash", "Steel", 90, "P", { acc: 90 }]], false)] : []),
  ],
  foes: [
    mon("Gyarados", 82, ["Water", "Flying"], "Intimidate", [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true),
    mon("Weavile", 84, ["Dark", "Ice"], "Pressure", [300, 250, 100, 60, 110, 299], [["Triple Axel", "Ice", 60, "P", { acc: 90 }], ["Knock Off", "Dark", 65, "P"]], false, undefined, { ...boss(2), aiType: 2 }),
  ],
});
const gyaradosToWeavile = foes => active => new Map(active.includes(foes[0]) ? [[foes[0], { to: foes[1], ratio: 1 }]] : []);
add("planner/cyrus-switch-predicted", "plannertest 1", { fresh: () => { const c = cyrus(true); return { ...c, trainer: trainerOf({ name: "Cyrus", isBoss: true }), stub: { switches: gyaradosToWeavile(c.foes) } }; } });
add("planner/cyrus-no-metagross", "plannertest 2", { fresh: () => { const c = cyrus(false); return { ...c, trainer: trainerOf({ name: "Cyrus", isBoss: true }), stub: { switches: gyaradosToWeavile(c.foes) } }; } });
add("planner/cyrus-no-switch", "plannertest 1, no prediction", { fresh: () => ({ ...cyrus(true), trainer: trainerOf({ name: "Cyrus", isBoss: true }), stub: { switches: () => new Map() } }) });
add("planner/switch-in-never-acts", "plannertest 5", { fresh: () => ({
  party: [mon("Charizard", 66, ["Fire", "Flying"], "Blaze", [190, 125, 118, 160, 128, 120], [["Flamethrower", "Fire", 90, "S"]], true, 120),
    mon("Blastoise", 64, ["Water"], "Torrent", [187, 122, 144, 125, 151, 116], [["Wave Crash", "Water", 120, "P", { attrs: ["RecoilAttr"] }]], false)],
  foes: [mon("Lycanroc", 70, ["Rock"], "Keen Eye", [200, 190, 100, 80, 90, 140], [["Stone Edge", "Rock", 100, "P", { acc: 80 }]], true)],
  trainer: trainerOf() }) });
add("planner/fake-out", "plannertest 5c", { fresh: () => ({
  party: [mon("Ambipom", 70, ["Normal"], "Technician", [250, 180, 120, 60, 120, 200], [["Fake Out", "Normal", 40, "P", { priority: 3, attrs: [["FlinchAttr", {}], "FirstMoveCondition"] }], ["Return", "Normal", 102, "P"]], true)],
  foes: [mon("Slowbro", 70, ["Water", "Psychic"], "Oblivious", [320, 120, 200, 180, 150, 60], [["Psychic", "Psychic", 90, "S"]], true)],
  trainer: trainerOf() }) });
const SWORDS_DANCE = ["Swords Dance", "Normal", 0, "X", { target: 0, id: 14, attrs: [["StatStageChangeAttr", { stats: [1], stages: 2, selfTarget: true }]] }];
add("planner/swords-dance", "plannertest 5e", { fresh: () => ({
  party: [mon("Gallade", 80, ["Psychic", "Fighting"], "Sharpness", [300, 200, 110, 90, 150, 100], [["Leaf Blade", "Grass", 90, "P"], SWORDS_DANCE], true)],
  foes: [mon("Snorlax", 80, ["Normal"], "Thick Fat", [450, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], true)],
  trainer: trainerOf() }) });
add("planner/spore", "plannertest 5f", { fresh: () => ({
  party: [mon("Breloom", 80, ["Grass", "Fighting"], "Technician", [250, 200, 110, 60, 90, 100], [["Seed Bomb", "Grass", 80, "P"], ["Spore", "Grass", 0, "X", { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }]], true)],
  foes: [mon("Machamp", 80, ["Fighting"], "Guts", [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true)],
  trainer: trainerOf() }) });
add("planner/slack-off", "plannertest 5g", { fresh: () => ({
  party: [mon("Slowbro", 80, ["Water", "Psychic"], "Oblivious", [400, 90, 180, 120, 110, 30], [["Scald", "Water", 80, "S"], ["Slack Off", "Normal", 0, "X", { target: 0, id: 303, attrs: [["HealAttr", { healRatio: 0.5, selfTarget: true }]] }]], true, 200)],
  foes: [mon("Gengar", 80, ["Ghost", "Poison"], "Cursed Body", [250, 60, 90, 180, 100, 130], [["Shadow Ball", "Ghost", 80, "S"]], true)],
  trainer: trainerOf() }) });
add("planner/stealth-rock", "plannertest 5h", { fresh: () => ({
  party: [mon("Skarmory", 80, ["Steel", "Flying"], "Sturdy", [330, 110, 200, 60, 100, 70], [["Drill Peck", "Flying", 80, "P"], ["Stealth Rock", "Rock", 0, "X", { target: 16, id: 446, attrs: [["AddArenaTrapTagAttr", { tagType: "STEALTH_ROCK" }]] }]], true)],
  foes: [mon("Chansey", 80, ["Normal"], "Natural Cure", [600, 20, 20, 50, 200, 50], [["Seismic Toss", "Fighting", 50, "P"]], true),
    ...["Charizard", "Talonflame", "Moltres", "Volcarona"].map(n => mon(n, 80, n === "Volcarona" ? ["Bug", "Fire"] : ["Fire", "Flying"], "x", [300, 100, 100, 100, 100, 100], [["Ember", "Fire", 40, "S"]], false))],
  trainer: trainerOf() }) });
const doublesParty = () => [
  mon("Garchomp", 80, ["Dragon", "Ground"], "Rough Skin", [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"], ["Earthquake", "Ground", 100, "P", { target: 4 }]], true),
  mon("Lucario", 80, ["Fighting", "Steel"], "Inner Focus", [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"]], true),
  mon("Metagross", 80, ["Steel", "Psychic"], "Clear Body", [250, 180, 170, 120, 120, 120], [["Meteor Mash", "Steel", 90, "P"]], false),
];
add("planner/doubles-focus", "plannertest 6", { fresh: () => ({ double: true, party: doublesParty(),
  foes: [mon("Hydreigon", 80, ["Dark", "Dragon"], "Levitate", [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]], true),
    mon("Snorlax", 80, ["Normal"], "Thick Fat", [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true)],
  trainer: trainerOf({ double: true }) }) });
add("planner/doubles-leaving-foe", "plannertest 8", { fresh: () => {
  const foes = [mon("Hydreigon", 80, ["Dark", "Dragon"], "Levitate", [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]], true),
    mon("Snorlax", 80, ["Normal"], "Thick Fat", [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true),
    mon("Ferrothorn", 80, ["Grass", "Steel"], "Iron Barbs", [280, 140, 200, 70, 160, 30], [["Gyro Ball", "Steel", 80, "P"]], false)];
  return { double: true, party: doublesParty(), foes, trainer: trainerOf({ double: true }), stub: { switches: active => new Map(active.includes(foes[0]) ? [[foes[0], { to: foes[2], ratio: 1 }]] : []) } };
} });

// ---- Constructed states, one or more per bucket.
// Guzma w165 (#90's read; boss bars and Golisopod's damage are guesses the read didn't carry).
const guzmaParty = ({ t3 = false } = {}) => [
  mon("Mamoswine", 162, ["Ice", "Ground"], "Snow Cloak", [546, 414, 290, 260, 220, 328], [["Precipice Blades", "Ground", 120, "P", { acc: 85 }], ["Thrash", "Normal", 120, "P"]], !t3),
  mon("Crobat", 162, ["Poison", "Flying"], "Inner Focus", [497, 307, 282, 248, 291, 409], [["Cross Poison", "Poison", 70, "P"], ["Wing Attack", "Flying", 60, "P"], ["Crunch", "Dark", 80, "P"]], false),
  mon("Metagross", 162, ["Steel", "Psychic"], "Clear Body", [474, 456, 504, 346, 352, 256], [["Zen Headbutt", "Psychic", 80, "P", { acc: 90 }], ["Psyshield Bash", "Psychic", 90, "P", { acc: 90 }], ["Meteor Mash", "Steel", 90, "P", { acc: 90 }], ["Hammer Arm", "Fighting", 100, "P", { acc: 90 }]], false),
  mon("Golduck", 162, ["Water"], "Damp", [431, 324, 301, 322, 277, 316], [["Surf", "Water", 90, "S"], ["Aqua Tail", "Water", 90, "P", { acc: 90 }], ["Zen Headbutt", "Psychic", 80, "P", { acc: 90 }]], t3, t3 ? 23 : undefined, t3 ? { status: { effect: 1 } } : {}),
  mon("Comfey", 162, ["Fairy"], "Flower Veil", [387, 223, 307, 312, 405, 339], [["Play Rough", "Fairy", 90, "P", { acc: 90 }], ["Giga Drain", "Grass", 75, "S"], ["Petal Dance", "Grass", 120, "S"]], false, 257),
  mon("Dudunsparce", 162, ["Normal"], "Run Away", [607, 353, 278, 301, 269, 225], [["Boomburst", "Normal", 140, "S"], ["Hyper Drill", "Normal", 120, "P"], ["Drill Run", "Ground", 80, "P", { acc: 95 }], ["Blizzard", "Ice", 110, "S", { acc: 70 }]], false),
];
const guzmaFoes = ({ golisopodHp } = {}) => [
  mon("Golisopod", 153, ["Bug", "Steel"], "Shell Armor", [439, 581, 568, 289, 456, 176], [["Leech Life", "Bug", 80, "P"], ["Iron Head", "Steel", 80, "P"], ["First Impression", "Bug", 100, "P"]], true, golisopodHp, boss(2)),
  mon("Kleavor", 150, ["Bug", "Rock"], "Sharpness", [427, 437, 315, 165, 278, 303], [["Stone Axe", "Rock", 65, "P", { acc: 90 }], ["X-Scissor", "Bug", 80, "P"], ["Double-Edge", "Normal", 120, "P"]], false),
  mon("Araquanid", 150, ["Water", "Bug"], "Water Bubble", [410, 270, 350, 215, 444, 174], [["Aqua Jet", "Water", 40, "P", { priority: 1 }], ["Leech Life", "Bug", 80, "P"], ["Crunch", "Dark", 80, "P"]], false),
  Object.assign(mon("Xurkitree", 153, ["Electric"], "Beast Boost", [484, 318, 274, 578, 286, 254], [["Discharge", "Electric", 80, "S"], ["Giga Drain", "Grass", 75, "S"]], false), beastBoost(3)),
  mon("Flygon", 153, ["Ground", "Dragon"], "Levitate", [490, 312, 334, 315, 315, 404], [["Dragon Rush", "Dragon", 100, "P", { acc: 75 }], ["Earth Power", "Ground", 90, "S"], ["Bug Buzz", "Bug", 90, "S"], ["Boomburst", "Normal", 140, "S"]], false, undefined, boss(2)),
  Object.assign(mon("Buzzwole", 159, ["Bug", "Fighting"], "Beast Boost", [579, 478, 478, 201, 245, 334], [["Lunge", "Bug", 80, "P"], ["Thunder Punch", "Electric", 75, "P"]], false, undefined, boss(2)), beastBoost(1)),
];
const poisonChip = { heal: p => (p.status?.effect === 1 ? -Math.floor(p.getMaxHp() / 8) : 0) };
add("built/guzma-t1 (reserve)", "#90 turn 1", { fresh: () => ({ party: guzmaParty(), foes: guzmaFoes(), trainer: trainerOf({ name: "Guzma", isBoss: true }), stub: { switches: () => new Map() } }) });
add("built/guzma-t3 (doomed lead)", "#90 turn 3", { fresh: () => ({ party: guzmaParty({ t3: true }), foes: guzmaFoes({ golisopodHp: 330 }), trainer: trainerOf({ name: "Guzma", isBoss: true }), stub: { switches: () => new Map(), ...poisonChip } }) });
// Doomed lead: a worn, slower Jolteon that Garchomp KOs first; a healthy bench answer Mamoswine. Paying the switch costs
// Mamoswine an Earthquake; letting Jolteon fall brings it in free.
add("built/doomed-lead", "constructed (bucket 5)", { fresh: () => ({
  party: [mon("Jolteon", 70, ["Electric"], "Volt Absorb", [200, 90, 90, 160, 130, 150], [["Thunderbolt", "Electric", 90, "S"], ["Shadow Ball", "Ghost", 80, "S"]], true, 40),
    mon("Mamoswine", 70, ["Ice", "Ground"], "Oblivious", [300, 190, 120, 90, 90, 110], [["Icicle Crash", "Ice", 85, "P", { acc: 90 }], ["Earthquake", "Ground", 100, "P"]], false),
    mon("Vaporeon", 70, ["Water"], "Water Absorb", [360, 90, 100, 150, 140, 90], [["Surf", "Water", 90, "S"], ["Ice Beam", "Ice", 90, "S"]], false)],
  foes: [mon("Garchomp", 72, ["Dragon", "Ground"], "Rough Skin", [290, 210, 150, 120, 130, 160], [["Earthquake", "Ground", 100, "P"], ["Dragon Claw", "Dragon", 80, "P"]], true),
    mon("Scizor", 72, ["Bug", "Steel"], "Technician", [260, 200, 160, 70, 120, 90], [["Bullet Punch", "Steel", 40, "P", { priority: 1 }], ["X-Scissor", "Bug", 80, "P"]], false)],
  trainer: trainerOf(), stub: { switches: () => new Map() } }) });
// Reserve holdback: Mamoswine is the one answer to a boss Xurkitree (Ground, Discharge-immune) and is out against
// Kleavor, which it can fight; Golduck on the bench handles Kleavor and folds to Xurkitree.
add("built/answer-on-field (reserve)", "constructed (bucket 4)", { fresh: () => ({
  party: [mon("Mamoswine", 100, ["Ice", "Ground"], "Oblivious", [360, 300, 200, 150, 150, 200], [["Earthquake", "Ground", 100, "P"], ["Icicle Crash", "Ice", 85, "P", { acc: 90 }]], true),
    mon("Golduck", 100, ["Water"], "Damp", [330, 180, 190, 250, 200, 220], [["Surf", "Water", 90, "S"], ["Ice Beam", "Ice", 90, "S"]], false),
    mon("Crobat", 100, ["Poison", "Flying"], "Inner Focus", [320, 250, 200, 150, 200, 320], [["Cross Poison", "Poison", 70, "P"], ["Brave Bird", "Flying", 120, "P", { attrs: ["RecoilAttr"] }]], false)],
  foes: [mon("Kleavor", 100, ["Bug", "Rock"], "Sharpness", [320, 330, 250, 100, 200, 250], [["Stone Axe", "Rock", 65, "P", { acc: 90 }], ["X-Scissor", "Bug", 80, "P"]], true),
    Object.assign(mon("Xurkitree", 105, ["Electric"], "Beast Boost", [420, 200, 220, 430, 220, 210], [["Discharge", "Electric", 80, "S"], ["Signal Beam", "Bug", 75, "S"]], false, undefined, boss(2)), beastBoost(3))],
  trainer: trainerOf({ isBoss: true }), stub: { switches: () => new Map() } }) });
// Same matchup, different move rule: Flare Blitz (recoil) and Blaze Kick both 2HKO; ♟ takes the bigger hit, ⚔ the clean one.
add("built/recoil-vs-clean", "constructed (bucket 2)", { fresh: () => ({
  party: [mon("Blaziken", 75, ["Fire", "Fighting"], "Blaze", [260, 220, 140, 180, 140, 160], [["Flare Blitz", "Fire", 120, "P", { attrs: ["RecoilAttr"] }], ["Blaze Kick", "Fire", 85, "P", { acc: 90 }], ["Close Combat", "Fighting", 120, "P", { attrs: [["StatStageChangeAttr", { stats: [2, 4], stages: -1, selfTarget: true }]] }]], true),
    mon("Swampert", 75, ["Water", "Ground"], "Torrent", [320, 190, 170, 140, 160, 110], [["Waterfall", "Water", 80, "P"]], false)],
  foes: [mon("Scizor", 72, ["Bug", "Steel"], "Technician", [300, 200, 160, 70, 120, 90], [["Bullet Punch", "Steel", 40, "P", { priority: 1 }], ["X-Scissor", "Bug", 80, "P"]], true),
    mon("Ferrothorn", 72, ["Grass", "Steel"], "Iron Barbs", [300, 150, 220, 70, 190, 30], [["Power Whip", "Grass", 120, "P", { acc: 85 }]], false)],
  trainer: trainerOf(), stub: { switches: () => new Map() } }) });
add("built/charge-vs-reliable", "constructed (bucket 2)", { fresh: () => ({
  party: [mon("Sceptile", 75, ["Grass"], "Overgrow", [250, 140, 120, 200, 140, 190], [["Solar Beam", "Grass", 120, "S", { attrs: ["ChargeAttr"] }], ["Giga Drain", "Grass", 75, "S"], ["Focus Blast", "Fighting", 120, "S", { acc: 70 }]], true)],
  foes: [mon("Quagsire", 72, ["Water", "Ground"], "Unaware", [340, 150, 160, 120, 140, 60], [["Earthquake", "Ground", 100, "P"]], true),
    mon("Rhydon", 72, ["Ground", "Rock"], "Lightning Rod", [330, 220, 200, 90, 90, 70], [["Stone Edge", "Rock", 100, "P", { acc: 80 }]], false)],
  trainer: trainerOf(), stub: { switches: () => new Map() } }) });
// Stay margin: Starmie holds its own against Tangrowth, Heatran would do better, but not by the 3 a paid switch needs.
add("built/stay-margin", "constructed (bucket 9)", { fresh: () => ({
  party: [mon("Starmie", 72, ["Water", "Psychic"], "Natural Cure", [240, 110, 150, 180, 150, 200], [["Psychic", "Psychic", 90, "S"], ["Ice Beam", "Ice", 90, "S"]], true),
    mon("Heatran", 72, ["Fire", "Steel"], "Flash Fire", [290, 140, 180, 200, 180, 130], [["Flamethrower", "Fire", 90, "S"]], false)],
  foes: [mon("Tangrowth", 72, ["Grass"], "Regenerator", [320, 170, 220, 160, 90, 80], [["Power Whip", "Grass", 120, "P", { acc: 85 }], ["Sludge Bomb", "Poison", 90, "S"]], true),
    mon("Gastrodon", 72, ["Water", "Ground"], "Storm Drain", [340, 120, 120, 150, 140, 60], [["Earth Power", "Ground", 90, "S"]], false)],
  trainer: trainerOf(), stub: { switches: () => new Map() } }) });
// Predicted switch: Arcanine (weak to Water) is predicted out to Ludicolo; ⚔ aims Swampert's move at Ludicolo, ♟ at Arcanine.
add("built/predicted-switch", "constructed (bucket 6)", { fresh: () => {
  const foes = [mon("Arcanine", 75, ["Fire"], "Intimidate", [280, 190, 140, 150, 130, 160], [["Flare Blitz", "Fire", 120, "P"], ["Extreme Speed", "Normal", 80, "P", { priority: 2 }]], true),
    mon("Ludicolo", 75, ["Water", "Grass"], "Swift Swim", [270, 110, 120, 170, 170, 110], [["Giga Drain", "Grass", 75, "S"], ["Ice Beam", "Ice", 90, "S"]], false)];
  return { party: [mon("Swampert", 75, ["Water", "Ground"], "Torrent", [320, 190, 170, 140, 160, 110], [["Waterfall", "Water", 80, "P"], ["Earthquake", "Ground", 100, "P"], ["Ice Punch", "Ice", 75, "P"]], true),
      mon("Togekiss", 75, ["Fairy", "Flying"], "Serene Grace", [280, 90, 160, 180, 170, 150], [["Air Slash", "Flying", 75, "S", { acc: 95 }], ["Dazzling Gleam", "Fairy", 80, "S"]], false)],
    foes, trainer: trainerOf(), stub: { switches: active => new Map(active.includes(foes[0]) ? [[foes[0], { to: foes[1], ratio: 1 }]] : []) } };
} });
// A plain two-exchange fight where the lead wins its trade: granularity / objective control.
add("built/lead-wins-trade", "constructed (control)", { fresh: () => ({
  party: [mon("Lucario", 75, ["Fighting", "Steel"], "Inner Focus", [250, 170, 130, 190, 130, 170], [["Aura Sphere", "Fighting", 80, "S"], ["Flash Cannon", "Steel", 80, "S"]], true, 150),
    mon("Gyarados", 75, ["Water", "Flying"], "Intimidate", [310, 210, 150, 110, 170, 150], [["Waterfall", "Water", 80, "P"], ["Earthquake", "Ground", 100, "P"]], false)],
  foes: [mon("Tyranitar", 75, ["Rock", "Dark"], "Sand Stream", [320, 220, 200, 120, 170, 100], [["Stone Edge", "Rock", 100, "P", { acc: 80 }], ["Crunch", "Dark", 80, "P"]], true),
    mon("Magmortar", 75, ["Fire"], "Flame Body", [280, 130, 120, 210, 150, 130], [["Fire Blast", "Fire", 110, "S", { acc: 85 }], ["Thunderbolt", "Electric", 90, "S"]], false)],
  trainer: trainerOf(), stub: { switches: () => new Map() } }) });

// Live case #1 (user screenshot, W12 Plains, trainer double "Glenn & Adelaide"). Species stats at their levels from base
// stats with mid IVs; HP bars, moves and our bench beyond Squirtle are read off the screenshot or guessed (marked).
// Bulbasaur is PAR, Charmander PSN; Budew at 17 %, Toxel full. The HUD there showed ⚔ Bulbasaur Tackle → Budew and
// Charmander Scratch → Budew (both "spare hit", focus Budew), and ♟ ~1 Bulbasaur "switch in" Tackle → Budew,
// ~2 Squirtle Water Gun → Toxel falls, ~3 Charmander free Ember → Toxel.
// Party order is unknown: the game lists the field first in doubles, but ♟'s "switch in" for Bulbasaur means its `cur`
// (the first party member on the field) was Charmander. Both orders are run.
const w12 = charmanderFirst => {
  const bulbasaur = mon("Bulbasaur", 10, ["Grass", "Poison"], "Overgrow", [30, 16, 16, 19, 19, 15],
    [["Tackle", "Normal", 40, "P"], ["Growl", "Normal", 0, "X", { target: 6, attrs: [["StatStageChangeAttr", { stats: [1], stages: -1 }]] }], ["Vine Whip", "Grass", 45, "P"]], true, 13, { status: { effect: 3 } });
  const charmander = mon("Charmander", 8, ["Fire"], "Blaze", [25, 14, 13, 15, 14, 16],
    [["Scratch", "Normal", 40, "P"], ["Growl", "Normal", 0, "X", { target: 6, attrs: [["StatStageChangeAttr", { stats: [1], stages: -1 }]] }], ["Ember", "Fire", 40, "S"]], true, 21, { status: { effect: 1 } });
  const squirtle = mon("Squirtle", 8, ["Water"], "Torrent", [26, 13, 16, 13, 16, 13], [["Tackle", "Normal", 40, "P"], ["Water Gun", "Water", 40, "S"]], false);
  return {
    double: true,
    party: charmanderFirst ? [charmander, bulbasaur, squirtle] : [bulbasaur, charmander, squirtle],
    foes: [mon("Budew", 8, ["Grass", "Poison"], "Poison Point", [25, 11, 11, 13, 17, 15], [["Absorb", "Grass", 20, "S"]], true, 4),
      mon("Toxel", 8, ["Electric", "Poison"], "Static", [25, 12, 11, 14, 11, 12], [["Acid", "Poison", 40, "S", { target: 6 }], ["Nuzzle", "Electric", 20, "P"]], true)],
    trainer: trainerOf({ name: "Glenn & Adelaide", double: true }), stub: { switches: () => new Map(), ...poisonChip },
  };
};
add("live1/w12-glenn-adelaide (Bulbasaur first)", "live case #1 reconstruction", { fresh: () => w12(false) });
add("live1/w12-glenn-adelaide (Charmander first)", "live case #1 reconstruction", { fresh: () => w12(true) });

// ---- Runner
const ORDER = ["CommandPhase", null];
const mount = (sc, { phase = "CommandPhase", turn = 3 } = {}) => {
  const { party, foes, double = false, trainer, stub = {} } = sc;
  normalise(party, foes);
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase, fieldIndex: 0 } : null), queueMessage() {} };
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents ??= () => onField(); }
  globalThis.__stub = stub;
  const scene = { phaseManager: pm, getField: () => [...onField(), ...foes.filter(f => f.isOnField())],
    currentBattle: { waveIndex: 150, turn, double, turnCommands: [], enemySwitchCounter: 0, getBattlerCount: () => (double ? 2 : 1), trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes, enemyModifiers: [] };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  for (const k of ["__tpPin", "__fpPin", "__noReserve"]) delete globalThis[k];
  (0, eval)(SRC);
  if (el?.textContent) throw new Error(`panel error: ${el.textContent}`);
  const b = scene.currentBattle;
  const live = () => ({ party: party.filter(p => p.hp > 0), foes: foes.filter(p => p.hp > 0) });
  return { scene, b, live, m: globalThis.__coachHud.last(), h: globalThis.__h, set phase(p) { phase = p; } };
};

const inGame = (ctx, fn) => (ctx.h.sandbox(ctx.scene, () => ctx.h.withPredictedTera(ctx.h.predictedTeras(ctx.scene, ctx.b), fn)));
const planOnly = (ctx, flags = {}) => {
  Object.assign(globalThis, flags);
  ctx.h.reset();
  const { party, foes } = ctx.live();
  try { return inGame(ctx, () => ctx.h.teamPlan(ctx.scene, ctx.b, party, foes)); } finally { for (const k of Object.keys(flags)) delete globalThis[k]; ctx.h.reset(); }
};
const turnOnly = (ctx, pin) => {
  const a = globalThis.__fpArgs;
  globalThis.__fpPin = pin;
  try { return inGame(ctx, () => ctx.h.fieldPlan(ctx.scene, a.party, a.facing, a.double, a.attackers, { freeSwitch: a.freeSwitch, locked: a.locked })); } finally { delete globalThis.__fpPin; }
};
const median = xs => xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)];
const time = fn => { const out = []; for (let i = 0; i < 7; i++) { const t0 = performance.now(); fn(); out.push(performance.now() - t0); } return median(out); };

const rows = [];
for (const sc0 of scenarios) {
  if (only && !only.test(sc0.name)) continue;
  const sc = { ...sc0, ...sc0.fresh() };
  const ctx = mount(sc);
  const a = hudAgreement(ctx.m);
  if (!a) { rows.push({ name: sc.name, source: sc.source, skipped: "no ⚔ or ♟" }); continue; }
  const extra = {};
  const single = !ctx.m.double;
  if (a.verdict !== "agree") {
    // Would ♟ agree without the reserve holdback?
    if (ctx.m.teamPlan.reserve.length) {
      const free = planOnly(ctx, { __noReserve: true });
      const again = hudAgreement({ ...ctx.m, teamPlan: free });
      // Only a change of mon counts: the holdback moves who goes first, never the move.
      extra.noReserveAgrees = a.verdict === "mon" && !!ctx.m.teamPlan.held && again?.plan.mon === a.turn[a.slot]?.mon;
      extra.planHeld = !!ctx.m.teamPlan.held;
    }
    if (single && a.verdict === "mon") {
      // ⚔ seeds ♟: the plan's own value with step 1 pinned to ⚔'s mon.
      const pinned = planOnly(ctx, { __tpPin: a.turn[a.slot].mon });
      const base = ctx.m.teamPlan;
      extra.pinPlan = pinned ? { val: +(pinned.val - base.val).toFixed(1), result: `${base.result}→${pinned.result}` } : null;
      // ♟ constrains ⚔: the turn score with the field restricted to ♟'s mon.
      const tBase = turnOnly(ctx, null), tPin = turnOnly(ctx, a.plan.mon);
      extra.pinTurn = tBase && tPin ? { score: +(tPin.score - tBase.score).toFixed(2), line: tPin.view.slots.map(sl => `${sl.name} ${sl.enter ? "in, " : ""}${sl.move ?? "—"}`).join(" ; ") } : null;
    }
  }
  const final = hudAgreement(ctx.m, { extra });
  // Cost: whole refresh cold, ⚔ side (♟ cache warm), ♟ alone cold.
  const { party, foes } = ctx.live();
  const total = time(() => { ctx.h.reset(); ctx.h.model(ctx.scene, ctx.b, party, foes); });
  const warm = (() => { ctx.h.reset(); ctx.h.model(ctx.scene, ctx.b, party, foes); return time(() => ctx.h.model(ctx.scene, ctx.b, party, foes)); })();
  const planCold = time(() => { ctx.h.reset(); inGame(ctx, () => ctx.h.teamPlan(ctx.scene, ctx.b, party, foes)); });
  // Bucket 8: the same state after the command is chosen (animation, no phase): ⚔ drops to the approximation, ♟ keeps
  // its command-phase plan from cache.
  let stale = null;
  {
    const c2 = mount({ ...sc0, ...sc0.fresh() });
    const before = hudAgreement(c2.m);
    c2.phase = null;
    c2.scene.phaseManager.getCurrentPhase = () => null;
    const s = c2.scene;
    const { party: p2, foes: f2 } = c2.live();
    const cachedPlan = c2.h.teamPlan(s, s.currentBattle, p2, f2);
    const mOff = { ...c2.m, ...c2.h.model(s, s.currentBattle, p2, f2), wave: c2.m.wave };
    const after = hudAgreement(mOff, { stale: true });
    stale = { planCached: cachedPlan === c2.m.teamPlan, before: before?.verdict ?? null, after: after?.verdict ?? null };
  }
  rows.push({ name: sc.name, source: sc.source, ...final, cost: { totalMs: +total.toFixed(2), planColdMs: +planCold.toFixed(2), warmMs: +warm.toFixed(2) }, stale });
}

// ---- Where ♟'s time goes, on the biggest rosters: the tables (every our×foe move and threat, game calls live) against
// the search (sweeps, answers, two beams), and what a second, pinned search costs on the same tables.
const costRows = [];
for (const name of ["built/guzma-t1 (reserve)", "teamplan/cyrus-4v6", "planner/cyrus-no-switch", "live1/w12-glenn-adelaide (Charmander first)"]) {
  const sc0 = scenarios.find(x => x.name === name);
  if (!sc0 || (only && !only.test(name))) continue;
  const ctx = mount({ ...sc0, ...sc0.fresh() });
  const { party, foes } = ctx.live();
  const dbl = !!ctx.m.double;
  const tables = time(() => { ctx.h.reset(); inGame(ctx, () => ctx.h.tpTables(ctx.scene, party, foes, true)); });
  const whole = time(() => { ctx.h.reset(); const T = inGame(ctx, () => ctx.h.tpTables(ctx.scene, party, foes, true)); ctx.h.tpView(T, party, foes, dbl); });
  const T = inGame(ctx, () => ctx.h.tpTables(ctx.scene, party, foes, true));
  ctx.h.tpView(T, party, foes, dbl);
  const pinTo = ctx.m.field.slots[0].name;
  const pinned = time(() => { globalThis.__tpPin = pinTo; try { ctx.h.tpView(T, party, foes, dbl); } finally { delete globalThis.__tpPin; } });
  const a = globalThis.__fpArgs;
  const field = time(() => { ctx.h.reset(); inGame(ctx, () => ctx.h.fieldPlan(ctx.scene, a.party, a.facing, a.double, a.attackers, { freeSwitch: a.freeSwitch, locked: a.locked })); });
  // Mid-turn (no command phase), each HP change is a new ♟ key: the refresh re-runs the whole model on the approximation.
  ctx.scene.phaseManager.getCurrentPhase = () => null;
  const chip = foes.find(f => f.hp > 20);
  const midTurn = time(() => { chip.hp -= 1; ctx.h.model(ctx.scene, ctx.b, party, foes); });
  costRows.push({ name, party: party.length, foes: foes.length, tablesMs: +tables.toFixed(1), searchMs: +(whole - tables).toFixed(1), pinnedSearchWarmMs: +pinned.toFixed(1), fieldPlanColdMs: +field.toFixed(1), midTurnHpChangeMs: +midTurn.toFixed(1) });
}

if (asJson) { console.log(JSON.stringify({ rows, cost: costRows }, null, 1)); process.exit(0); }
const pad = (s, n) => String(s).padEnd(n);
for (const r of rows) {
  if (r.skipped) { console.log(`${pad(r.name, 34)} skipped: ${r.skipped}`); continue; }
  const t = r.turn.map(x => `${x.switchIn ? "⇄" : ""}${x.mon} ${x.move ?? "—"}${x.then ? `,then ${x.then}` : ""}→${x.target ?? "·"}`).join(" ; ");
  const p = `${r.plan.entry === "switch" ? "⇄" : ""}${r.plan.mon} ${r.plan.move ?? "—"}→${r.plan.target} (${r.plan.why})`;
  console.log(`${pad(r.name, 34)} ${pad(r.verdict, 6)} ${pad(r.buckets.join(","), 6)} ⚔ ${t}\n${pad("", 48)}♟ ${p}`);
  const f = r.features;
  const flags = Object.entries(f).filter(([k, v]) => v === true).map(([k]) => k);
  console.log(`${pad("", 48)}· ${flags.join(" ")}${f.reserve.length ? ` reserve=${f.reserve.map(x => `${x.mon}>${x.for}`).join(",")}` : ""}${f.pinPlan ? ` pinPlan Δval=${f.pinPlan.val} ${f.pinPlan.result}` : ""}${f.pinTurn ? ` pinTurn Δscore=${f.pinTurn.score} [${f.pinTurn.line}]` : ""}`);
  console.log(`${pad("", 48)}· cost total ${r.cost.totalMs} ms · ♟ cold ${r.cost.planColdMs} ms · warm ${r.cost.warmMs} ms · after command: ♟ cached ${r.stale.planCached}, ${r.stale.before} → ${r.stale.after}`);
}
const judged = rows.filter(r => !r.skipped);
const tally = {};
for (const r of judged) for (const k of r.buckets) tally[k] = (tally[k] ?? 0) + 1;
const primary = {};
for (const r of judged) if (r.bucket) primary[r.bucket] = (primary[r.bucket] ?? 0) + 1;
console.log(`\n${judged.length} scenarios compared (${rows.length - judged.length} skipped) · verdicts ${JSON.stringify(judged.reduce((t, r) => ({ ...t, [r.verdict]: (t[r.verdict] ?? 0) + 1 }), {}))}`);
console.log(`buckets, any label: ${JSON.stringify(tally)}`);
console.log(`buckets, primary:   ${JSON.stringify(primary)}`);
for (const c of costRows) console.log(`cost ${c.name} (${c.party}v${c.foes}): ♟ tables ${c.tablesMs} ms · ♟ search ${c.searchMs} ms · pinned re-search on warm tables ${c.pinnedSearchWarmMs} ms · ⚔ fieldPlan cold ${c.fieldPlanColdMs} ms · whole model per mid-turn HP change ${c.midTurnHpChangeMs} ms`);
console.log(`after the command is chosen (animation): verdict changed in ${judged.filter(r => r.stale.before !== r.stale.after).length} of ${judged.length}`);
