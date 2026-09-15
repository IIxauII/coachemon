// Catch coach against wild encounters: the capture formula for a known species/ball/HP/status, trainer and boss
// rules, a new species worth a ball, a caught weak mon not worth one, a dangerous foe a throw ends sooner than a
// fight, and no Master Ball on a low-value catch. Prints the rendered sections, so run.mjs also keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// moves: [name, type, power, cat, target=3]; sp: species fields
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, sp = {}, extra = {}) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0,
  species: { speciesId: sp.id ?? 0, catchRate: sp.catchRate ?? 45, baseTotal: sp.bst ?? 400, ability2: 1, abilityHidden: 2, legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field,
  isBoss: () => (extra.bossSegments ?? 0) > 0, bossSegments: 0, bossSegmentIndex: 0,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, shiny: false, variant: 0, gender: 0, formIndex: 0, abilityIndex: 0,
  ivs: [15, 15, 15, 15, 15, 15],
  moveset: moves.map(([n, t, p, c, target = 3]) => ({ getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, accuracy: 100, priority: 0 }), getMovePp: () => 10, ppUsed: 0 })),
  ...extra,
});

const venusaur = () => mon("Venusaur", 50, ["Grass","Poison"], "Overgrow", [160,90,100,110,110,80], [["Giga Drain","Grass",75,"S"],["Sludge Bomb","Poison",90,"S"]], true, undefined, { id: 3, bst: 525 });
const blastoise = () => mon("Blastoise", 50, ["Water"], "Torrent", [160,90,110,90,115,80], [["Surf","Water",90,"S"]], false, undefined, { id: 9, bst: 530 });

// dexData: caught species 3, 9, 16 (Pidgey), 58 (Growlithe, root of Arcanine 59). 160 caught entries → crit factor 0.5.
const dexData = () => {
  const d = {};
  for (let i = 1000; i < 1156; i++) d[i] = { caughtAttr: 1n, ivs: [0,0,0,0,0,0] };
  for (const id of [3, 9, 16, 58, 59]) d[id] = { caughtAttr: 1n | 4n | 16n | 128n, ivs: [20,20,20,20,20,20] };
  d[25] = { caughtAttr: 0n, ivs: [0,0,0,0,0,0] };
  return d;
};

const run = ({ party, foes, phase = null, trainer = null, counts = { 0: 5, 1: 0, 2: 0, 3: 0, 4: 0 }, double = false }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase } : null) };
  for (const f of foes) f.getOpponents = () => party.filter(p => p.isOnField());
  const scene = {
    phaseManager: pm, getField: () => [...party, ...foes].filter(p => p.isOnField()),
    currentBattle: { waveIndex: 23, turn: 1, double, battleType: trainer ? 1 : 0, enemySwitchCounter: 0, getBattlerCount: () => (double ? 2 : 1), trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes,
    pokeballCounts: counts, modifiers: [], arena: { biomeId: 3 },
    gameMode: { isDaily: false, isClassic: true, challenges: [] },
    gameData: { dexData: dexData(), starterData: { 3: { abilityAttr: 1 }, 9: { abilityAttr: 1 }, 16: { abilityAttr: 1 }, 58: { abilityAttr: 1 } } },
  };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  // The catch coach lives inside the bundle's IIFE; expose it for the test only.
  eval(bundle("hud").replace(/\}\)\(\);\s*$/, "globalThis.__ca = { catchAdvice, captureChance, drawCatch, setViewMode: v => { view = v; } };\n})();\n"));
  const advice = globalThis.__ca.catchAdvice(scene, scene.currentBattle, party.filter(p => p.hp > 0), foes.filter(f => f.hp > 0));
  return { advice, scene };
};

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const show = (label, advice) => {
  for (const v of ["full", "mini"]) {
    globalThis.__ca.setViewMode(v);
    console.log(`== ${label} (${v})`);
    console.log(globalThis.__ca.drawCatch(advice).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  }
};
const jsonSafe = (x, label) => assert.equal(JSON.stringify(JSON.parse(JSON.stringify(x))), JSON.stringify(x), `${label}: JSON-safe`);

// ---- 1. The formula, written out from AttemptCapturePhase: Pidgeot-like catchRate 45, 100 max HP at 50, Great Ball,
// paralysed, 160 caught species (critical factor 0.5).
{
  const pidgey = mon("Pidgeotto", 22, ["Normal","Flying"], "Keen Eye", [100,50,50,40,40,60], [["Gust","Flying",40,"S"]], true, 50,
    { id: 16, catchRate: 45, bst: 349 }, { status: { effect: 3 } });
  const { advice, scene } = run({ party: [venusaur()], foes: [pidgey], counts: { 0: 5, 1: 3, 2: 0, 3: 0, 4: 0 } });
  const m = 300, v = 100, w = Math.round((m - v) * 45 * 1.5 / m * 1.5 * 1);
  assert.equal(w, 68);
  const E = Math.round(65536 / (255 / w) ** 0.1875);
  const O = Math.floor(0.5 * Math.min(255, w) / 6);
  const s = E / 65536, c = O / 256;
  const expected = c * s + (1 - c) * s ** 3;
  const got = globalThis.__ca.captureChance({ maxHp: 100, hp: 50, catchRate: 45, ball: 1, status: 3, critFactor: 0.5 });
  assert.ok(Math.abs(got - expected) < 1e-12, `formula: ${got} vs ${expected}`);
  const great = advice.targets[0].chance.find(x => x.ball === "Great Ball");
  assert.equal(great.p, Math.round(expected * 1000) / 1000, "the advice uses the formula with the scene's dex count and status");
  assert.equal(globalThis.__ca.captureChance({ maxHp: 100, hp: 100, catchRate: 3, ball: 4 }), 1, "Master Ball always catches");
  assert.equal(globalThis.__ca.captureChance({ maxHp: 100, hp: 1, catchRate: 255, ball: 2 }), 1, "w ≥ 255 always catches");
  assert.ok(globalThis.__ca.captureChance({ maxHp: 100, hp: 100, catchRate: 45, ball: 0, status: 4 })
    > globalThis.__ca.captureChance({ maxHp: 100, hp: 100, catchRate: 45, ball: 0, status: 3 }), "sleep beats paralysis");
  jsonSafe(advice, "formula");
  assert.ok(scene);
}

// ---- 2. Trainer battles: never.
{
  const { advice } = run({ party: [venusaur()], foes: [mon("Pikachu", 20, ["Electric"], "Static", [60,50,40,50,50,90], [["Thunderbolt","Electric",90,"S"]], true, 10, { id: 25, catchRate: 190 })],
    trainer: { getName: () => "Youngster", config: { isBoss: false }, isDouble: () => false } });
  assert.equal(advice, null, "no advice in trainer battles");
}

// ---- 3. Boss with two bars left: only a Master Ball works; we don't spend one on a merely new species.
{
  const boss = () => mon("Pikachu", 30, ["Electric"], "Static", [200,60,50,60,50,90], [["Thunderbolt","Electric",90,"S"]], true, 150,
    { id: 25, catchRate: 190, bst: 320 }, { bossSegments: 2, bossSegmentIndex: 1 });
  const { advice } = run({ party: [venusaur()], foes: [boss()], counts: { 0: 5, 1: 5, 2: 5, 3: 0, 4: 1 } });
  const t = advice.targets[0];
  assert.ok(t.boss, "boss rule applies");
  assert.ok(t.chance.filter(x => x.ball !== "Master Ball").every(x => x.p === 0), "every ball but Master fails on a boss with bars left");
  assert.equal(t.chance.find(x => x.ball === "Master Ball").p, 1);
  assert.notEqual(t.best?.ball, "Master Ball", "no Master Ball for a common new species");
  assert.equal(t.verdict, "maybe");
  assert.match(t.why, /break its bars first/);
  show("boss", advice);
  // Last bar: normal balls work again.
  const last = boss(); last.bossSegmentIndex = 0; last.hp = 80;
  const again = run({ party: [venusaur()], foes: [last], counts: { 0: 5, 1: 5, 2: 5, 3: 0, 4: 1 } }).advice.targets[0];
  assert.ok(!again.boss && again.chance.find(x => x.ball === "Poké Ball").p > 0, "last bar: any ball");
}

// ---- 4. New species, high chance → catch with the cheapest good ball.
{
  const pika = mon("Pikachu", 20, ["Electric"], "Static", [60,50,40,50,50,90], [["Thunderbolt","Electric",90,"S"]], true, 15, { id: 25, catchRate: 190, bst: 320 });
  const { advice } = run({ party: [venusaur(), blastoise()], foes: [pika], counts: { 0: 5, 1: 3, 2: 2, 3: 1, 4: 1 } });
  const t = advice.targets[0];
  assert.equal(t.verdict, "catch");
  assert.equal(t.best.ball, "Poké Ball", "cheapest ball that does the job");
  assert.ok(t.best.p >= 0.6);
  assert.ok(t.reasons.some(r => r.kind === "account" && r.text.startsWith("new species")));
  assert.match(t.why, /new species/);
  jsonSafe(advice, "new species");
  show("new species", advice);
}

// ---- 5. Already caught, weak, full HP, catch rate 3 → skip; and a Master Ball in the bag is not suggested.
{
  const pidgey = () => mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [55,30,30,30,30,40], [["Tackle","Normal",40,"P"]], true, undefined, { id: 16, catchRate: 3, bst: 251 });
  const { advice } = run({ party: [venusaur()], foes: [pidgey()], counts: { 0: 5, 1: 5, 2: 0, 3: 0, 4: 0 } });
  const t = advice.targets[0];
  assert.equal(t.verdict, "skip");
  assert.equal(t.why, "low chance, nothing new");
  show("skip", advice);

  const withMaster = run({ party: [venusaur()], foes: [pidgey()], counts: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 1 } }).advice.targets[0];
  assert.equal(withMaster.chance.find(x => x.ball === "Master Ball").p, 1);
  assert.notEqual(withMaster.best?.ball, "Master Ball", "no Master Ball on a low-value catch");
  assert.notEqual(withMaster.best?.ball, "Rogue Ball", "no Rogue Ball either");
  assert.equal(withMaster.verdict, "skip");
}

// ---- 6. A caught Arcanine at a third of its HP that KOs our Venusaur while we need several turns: an Ultra Ball ends
// the encounter sooner than fighting.
{
  const arcanine = mon("Arcanine", 55, ["Fire"], "Intimidate", [180,160,110,120,100,120], [["Flare Blitz","Fire",120,"P"]], true, 60, { id: 59, catchRate: 75, bst: 555 });
  const weak = mon("Venusaur", 50, ["Grass","Poison"], "Overgrow", [160,40,100,40,110,80], [["Absorb","Grass",20,"S"]], true, undefined, { id: 3, bst: 525 });
  const { advice } = run({ party: [weak], foes: [arcanine], counts: { 0: 5, 1: 0, 2: 5, 3: 0, 4: 0 } });
  const t = advice.targets[0];
  assert.ok(t.reasons.some(r => r.kind === "escape"), "ending the encounter is a reason");
  assert.equal(t.verdict, "catch");
  assert.equal(t.best.ball, "Ultra Ball", "the Poké Ball's odds are too low; Ultra is plentiful");
  assert.match(t.why, /ends it/);
  jsonSafe(advice, "escape");
  show("escape", advice);

  // Same during the command phase: goes through the sandbox (mocks lack game functions → fallbacks) and restores RNG.
  const live = run({ party: [weak], foes: [arcanine], counts: { 0: 5, 1: 0, 2: 5, 3: 0, 4: 0 }, phase: "CommandPhase" });
  assert.equal(live.advice.targets[0].verdict, "catch");
  assert.equal(globalThis.Phaser.Math.RND.state(), "!rnd,0", "sandbox restored the RNG");
  // Cached per turn.
  assert.equal(globalThis.__ca.catchAdvice(live.scene, live.scene.currentBattle, [weak], [arcanine]), live.advice, "second call hits the cache");
}

// ---- 7. Team value: a full party weak to Ground meets a caught Pidgeot that is immune to it and outclasses Pikachu.
{
  const m6 = (name, types, bst, id) => mon(name, 40, types, "None", [120,70,70,70,70,70], [["Tackle","Normal",40,"P"]], false, undefined, { id, bst });
  const party = [
    mon("Raichu", 40, ["Electric"], "Static", [120,90,60,90,70,110], [["Thunderbolt","Electric",90,"S"]], true, undefined, { id: 26, bst: 485 }),
    m6("Pikachu", ["Electric"], 320, 25), m6("Arcanine", ["Fire"], 555, 59), m6("Golem", ["Rock","Ground"], 495, 76),
    m6("Muk", ["Poison"], 500, 89), m6("Blastoise", ["Water"], 530, 9),
  ];
  const pidgeot = mon("Pidgeot", 38, ["Normal","Flying"], "Keen Eye", [130,80,75,70,70,101], [["Air Slash","Flying",75,"S"]], true, 40, { id: 18, catchRate: 45, bst: 479 });
  const { advice } = run({ party, foes: [pidgeot], counts: { 0: 5, 1: 5, 2: 5, 3: 0, 4: 0 } });
  const t = advice.targets[0];
  assert.ok(t.reasons.some(r => r.text.startsWith("covers") && r.text.includes("Ground")), "covers the Ground weakness");
  assert.ok(t.reasons.some(r => r.text.startsWith("stronger than Pikachu")), "outclasses the weakest member");
  assert.equal(t.replace?.name, "Pikachu", "a full party names who it replaces");
  assert.equal(t.verdict, "catch");
  jsonSafe(advice, "team");
  show("team", advice);
}

// ---- 8. Doubles with two foes out and nothing worth catching: silent.
{
  const a = mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [55,30,30,30,30,40], [["Tackle","Normal",40,"P"]], true, undefined, { id: 16, catchRate: 3, bst: 251 });
  const b = mon("Pidgey2", 20, ["Normal","Flying"], "Keen Eye", [55,30,30,30,30,40], [["Tackle","Normal",40,"P"]], true, undefined, { id: 16, catchRate: 3, bst: 251 });
  assert.equal(run({ party: [venusaur(), blastoise()], foes: [a, b], double: true }).advice, null);
}
console.log("ok");
