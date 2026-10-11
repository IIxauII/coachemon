import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { onGame } from "./game-proto.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, sp = {}, extra = {}) => onGame({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0,
  species: { speciesId: sp.id ?? 0, catchRate: sp.catchRate ?? 45, baseTotal: sp.bst ?? 400, ability2: 1, abilityHidden: 2, legendary: false, getEvolutionLevels: () => sp.evos ?? [],
    ...(sp.roots ? { getRootSpeciesId: forStarter => (forStarter ? sp.roots[0] : sp.roots[1]) } : {}), ...(sp.more ?? {}) },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field,
  isBoss: () => (extra.bossSegments ?? 0) > 0, bossSegments: 0, bossSegmentIndex: 0,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, shiny: false, variant: 0, gender: 0, formIndex: 0, abilityIndex: 0,
  ivs: [15, 15, 15, 15, 15, 15],
  moveset: moves.map(([n, t, p, c, target = 3, attrs = []], i) => ({ moveId: i + 1, getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, accuracy: 100, priority: 0, attrs }), getMovePp: () => 10, ppUsed: 0 })),
  ...extra,
});

const venusaur = () => mon("Venusaur", 50, ["Grass","Poison"], "Overgrow", [160,90,100,110,110,80], [["Giga Drain","Grass",75,"S"],["Sludge Bomb","Poison",90,"S"]], true, undefined, { id: 3, bst: 525 });
const blastoise = () => mon("Blastoise", 50, ["Water"], "Torrent", [160,90,110,90,115,80], [["Surf","Water",90,"S"]], false, undefined, { id: 9, bst: 530 });

// Over 100 caught species, so the critical-capture dex factor is 0.5 (game-code.md §20).
const dexData = () => {
  const d = {};
  for (let i = 1000; i < 1156; i++) d[i] = { caughtAttr: 1n, ivs: [0,0,0,0,0,0] };
  for (const id of [3, 9, 16, 58, 59]) d[id] = { caughtAttr: 1n | 4n | 16n | 128n, ivs: [20,20,20,20,20,20] };
  d[25] = { caughtAttr: 0n, ivs: [0,0,0,0,0,0] };
  return d;
};

// `events`, `registry`: the timed event manager and the species registry, as 04-game-tables' chunk scan hands them over.
const run = ({ party, foes, phase = null, trainer = null, counts = { 0: 5, 1: 0, 2: 0, 3: 0, 4: 0 }, double = false, owned = [], enemyModifiers = [],
  wave = 23, biome = 3, mode = {}, starters = null, events = null, dex = null, registry = null, moves = null }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase } : null) };
  for (const f of foes) f.getOpponents = () => party.filter(p => p.isOnField());
  const scene = {
    phaseManager: pm, getField: () => [...party, ...foes].filter(p => p.isOnField()),
    currentBattle: { waveIndex: wave, turn: 1, double, battleType: trainer ? 1 : 0, enemySwitchCounter: 0, getBattlerCount: () => (double ? 2 : 1), trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes,
    pokeballCounts: counts, modifiers: [], enemyModifiers, arena: { biomeId: biome },
    gameMode: { isDaily: false, isClassic: true, isEndless: false, challenges: [], ...mode },
    gameData: { dexData: dexData(), starterData: { 3: { abilityAttr: 1 }, 9: { abilityAttr: 1 }, 16: { abilityAttr: 1 }, 58: { abilityAttr: 1 } } },
  };
  if (starters) scene.gameData.starterData = Object.fromEntries(starters.map(id => [id, { abilityAttr: 1 }]));
  for (const [id, entry] of Object.entries(dex ?? {})) scene.gameData.dexData[id] = { ivs: [20,20,20,20,20,20], ...entry };
  for (const id of owned) {
    scene.gameData.dexData[id] = { caughtAttr: 1n | 4n | 16n | 128n, ivs: [20,20,20,20,20,20] };
    scene.gameData.starterData[id] = { abilityAttr: 1 };
  }
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const { catchAdvice, catchLand, captureChance, keepCatchTeam } = globalThis.__hud["45-catch"];
  const { readTurn } = globalThis.__hud["25-turn"];
  const { readRun } = globalThis.__hud["26-run"];
  const { accountRead } = globalThis.__hud["98-watch"];
  const { finalBstOf } = globalThis.__hud["08-party"];
  globalThis.__ca = { catchAdvice, captureChance, readTurn, readRun, accountRead, catchLand, keepCatchTeam, RANDBATS: globalThis.__hud["05-randbats"].RANDBATS,
    catchWorth: globalThis.__hud["45-catch"].catchWorth,
    drawCatch: globalThis.__hud["95-render-catch"].drawCatch, catchSummary: globalThis.__hud["45-catch"].catchSummary, finalBstOf,
    sandboxBreachCount: globalThis.__hud["01-core"].sandboxBreachCount, setGameTables: globalThis.__hud["04-game-tables"].setGameTables };
  // One call: `setGameTables` replaces the tables wholesale, so a second would drop what the first put there.
  if (events || registry || moves) globalThis.__ca.setGameTables({ events, species: registry, moves });
  const advice = readTurn(scene, turn => catchAdvice(turn, accountRead(scene)));
  // The road the battle card owes, as 60-card's `readRoad` lands it: a *second*, separate read, which is the only
  // read that may ask the judgment (#584).
  const land = () => readRun(scene, r => catchLand(r, advice));
  return { advice, scene, land };
};

const sum = xs => xs.reduce((t, x) => t + x, 0);
// The game's species and move tables, small but real, so the landed road can run the *real* judgment (#584): the
// threat set it duels is built off these, and every species here is one the randbats snapshot lists with its own base
// stats. What those duels come to is judgmenttest's subject; here they only have to be real, so that a team verdict
// and an account value can be told apart on the card.
const THREAT_DEX = [
  [3, "Venusaur", ["Grass","Poison"], [80,82,83,100,100,80]],
  [59, "Arcanine", ["Fire"], [90,110,80,100,80,95]],
  [65, "Alakazam", ["Psychic"], [55,50,45,135,95,120]],
  [68, "Machamp", ["Fighting"], [90,130,80,65,85,55]],
  [94, "Gengar", ["Ghost","Poison"], [60,65,60,130,75,110]],
  [121, "Starmie", ["Water","Psychic"], [60,75,85,100,85,115]],
  [143, "Snorlax", ["Normal"], [160,110,65,65,110,30]],
  [149, "Dragonite", ["Dragon","Flying"], [91,134,95,100,100,80]],
  [205, "Forretress", ["Bug","Steel"], [75,90,140,60,60,40]],
  [232, "Donphan", ["Ground"], [90,120,120,60,60,50]],
  [248, "Tyranitar", ["Rock","Dark"], [100,134,110,95,100,61]],
  [468, "Togekiss", ["Fairy","Flying"], [85,50,95,120,115,80]],
  [473, "Mamoswine", ["Ice","Ground"], [110,130,80,70,60,80]],
];
// `__ca` is set by the first `run` above, and `RANDBATS` off it is a constant table rather than live state.
const tables = () => {
  const list = THREAT_DEX.map(([id, name, types, base]) => ({
    speciesId: id, name, type1: TY.indexOf(types[0]), type2: types[1] == null ? null : TY.indexOf(types[1]),
    baseStats: base, baseTotal: sum(base), catchRate: 45, legendary: false, ability2: 1, abilityHidden: 2,
    getEvolutionLevels: () => [],
  }));
  const byId = new Map(list.map(s => [s.speciesId, s]));
  // Every move the snapshot names, each the same plain attack: a set indexes this table, and the duel only has to
  // find something there to score.
  const moves = [null, ...globalThis.__ca.RANDBATS.m.map((name, i) => ({ id: i + 1, name, type: 0, power: 80,
    accuracy: 100, category: 0, pp: 10, moveTarget: 3, priority: 0, flags: 0, attrs: [] }))];
  return { registry: { getSpecies: id => byId.get(id) ?? null, getAllSpecies: () => list, getEvolutions: () => [] }, moves };
};

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
const show = (label, advice) => {
  console.log(`== ${label}`);
  console.log(globalThis.__ca.drawCatch(advice).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
};
const jsonSafe = (x, label) => assert.equal(JSON.stringify(JSON.parse(JSON.stringify(x))), JSON.stringify(x), `${label}: JSON-safe`);

// ---- The capture chance is `AttemptCapturePhase`'s formula (game-code.md §20)
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

// ---- No catch advice in a trainer battle
{
  const { advice } = run({ party: [venusaur()], foes: [mon("Pikachu", 20, ["Electric"], "Static", [60,50,40,50,50,90], [["Thunderbolt","Electric",90,"S"]], true, 10, { id: 25, catchRate: 190 })],
    trainer: { getName: () => "Youngster", config: { isBoss: false }, isDouble: () => false } });
  assert.equal(advice, null, "no advice in trainer battles");
}

// ---- A boss with bars left takes only a Master Ball, and a merely new species isn't worth one
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
  const last = boss(); last.bossSegmentIndex = 0; last.hp = 80;
  const again = run({ party: [venusaur()], foes: [last], counts: { 0: 5, 1: 5, 2: 5, 3: 0, 4: 1 } }).advice.targets[0];
  assert.ok(!again.boss && again.chance.find(x => x.ball === "Poké Ball").p > 0, "last bar: any ball");
}

// ---- A new species at high odds is caught with the cheapest good ball
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

// ---- A weak species already caught is skipped, and no Master Ball is spent on it
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

// ---- A ball that ends a losing encounter sooner than fighting is worth throwing
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

  const live = run({ party: [weak], foes: [arcanine], counts: { 0: 5, 1: 0, 2: 5, 3: 0, 4: 0 }, phase: "CommandPhase" });
  assert.equal(live.advice.targets[0].verdict, "catch");
  assert.equal(globalThis.Phaser.Math.RND.state(), "!rnd,0", "sandbox restored the RNG");
  assert.deepEqual(globalThis.__ca.readTurn(live.scene, turn => globalThis.__ca.catchAdvice(turn, globalThis.__ca.accountRead(live.scene))), live.advice, "the same turn gives the same advice");
}

// ---- The turn read shows its own part at once; the team verdict waits for the road (#584)
{
  const m6 = (name, types, base, id) => mon(name, 40, types, "None", [120,70,70,70,70,70], [["Tackle","Normal",40,"P"]], false, undefined,
    { id, bst: sum(base), more: { baseStats: base } });
  const party = [
    mon("Raichu", 40, ["Electric"], "Static", [120,90,60,90,70,110], [["Thunderbolt","Electric",90,"S"]], true, undefined,
      { id: 26, bst: 485, more: { baseStats: [60,90,55,90,80,110] } }),
    m6("Pikachu", ["Electric"], [35,55,40,50,50,90], 25), m6("Arcanine", ["Fire"], [90,110,80,100,80,95], 59),
    m6("Golem", ["Rock","Ground"], [80,120,130,55,65,45], 76), m6("Muk", ["Poison"], [105,105,75,65,100,50], 89),
    m6("Blastoise", ["Water"], [79,83,100,85,105,78], 9),
  ];
  const pidgeot = mon("Pidgeot", 38, ["Normal","Flying"], "Keen Eye", [130,80,75,70,70,101], [["Air Slash","Flying",75,"S"]], true, 40,
    { id: 18, catchRate: 45, bst: 479, more: { baseStats: [83,80,75,70,70,101] } });
  const counts = { 0: 5, 1: 5, 2: 5, 3: 0, 4: 0 };

  // The turn read alone: a turn read cannot open a run read, so there is no judgment to show yet and the group says
  // so rather than going quiet (story 26).
  const bare = run({ party, foes: [pidgeot], counts });
  const b = bare.advice.targets[0];
  assert.equal(b.team, null, "no team verdict out of the turn read");
  assert.equal(b.replace, null, "and so no `replaces X` line either — that line is the judgment's");
  assert.ok(b.reasons.some(r => r.kind === "team" && r.text === "verdict coming with the road"), JSON.stringify(b.reasons));
  assert.ok(!b.reasons.some(r => r.kind === "team" && /^(covers|stronger than)/.test(r.text)),
    "the team's own reasons are not read in the turn");
  assert.ok(b.reasons.some(r => r.kind === "account"), "the account reasons are there at once");
  jsonSafe(bare.advice, "team pending");
  show("team pending", bare.advice);

  // Then the road lands, and with it the judgment: a full party, so the newcomer can only join by somebody leaving.
  const { registry, moves } = tables();
  const landed = run({ party, foes: [pidgeot], counts, registry, moves });
  const t = landed.land().targets[0];
  assert.ok(["take", "swap", "skip"].includes(t.team.verdict), `a real verdict: ${JSON.stringify(t.team)}`);
  assert.equal(t.team.replaced?.name, "Pikachu", "the judgment's own first to replace is the weakest member (#582)");
  assert.equal(t.replace?.name, "Pikachu", "and the party-full `replaces X` comes from the judgment, not the profile");
  assert.ok(t.team.reasons.length, "and it carries its reasons");
  assert.ok(t.reasons.some(r => r.kind === "team" && r.text === t.team.text), "the verdict heads the team lines");
  for (const text of t.team.reasons) assert.ok(t.reasons.some(r => r.kind === "team" && r.text === text), text);
  assert.equal(t.verdict, "catch");
  jsonSafe(landed.advice, "team landed");
  show("team landed", landed.advice);
  assert.equal(globalThis.Phaser.Math.RND.state(), "!rnd,0", "the landing restored the RNG");
  assert.equal(globalThis.__ca.sandboxBreachCount(), 0, "and breached nothing");

  // A send-in redraws the card off the turn alone, and keeps the verdict of the battle card it replaces (98-watch).
  const again = run({ party, foes: [pidgeot], counts });
  const kept = globalThis.__ca.keepCatchTeam(landed.advice, again.advice).targets[0];
  assert.deepEqual(kept.team, t.team, "the same verdict, with no run read of its own");
  assert.equal(kept.verdict, "catch");

  // The wave's status-cure tokens can shake the status off before the throw (game-code.md §21).
  const cure = new (class EnemyStatusEffectHealChanceModifier { getStackCount() { return 4; } })();
  const cured = run({ party, foes: [{ ...pidgeot, id: "Pidgeot with cure tokens" }], counts, enemyModifiers: [cure] }).advice.targets[0];
  assert.match(cured.why, /sleep\/paralyse it for better odds \(it cures itself 10%\/turn\)/, cured.why);

  // A full party the team says no to: the account axis earns the card on its own, and *there* the `replaces X` line
  // is worth saying, since no swap has named the member that would go.
  const pidgey = mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [55,30,30,30,30,40], [["Tackle","Normal",40,"P"]], true, 20,
    { id: 16, catchRate: 255, bst: 251, more: { baseStats: [40,45,40,35,35,56] } });
  const no = run({ party, foes: [pidgey], counts, registry, moves, dex: { 16: { caughtAttr: 0n } } });
  const n = no.land().targets[0];
  assert.equal(n.team.verdict, "skip", `the team wants nothing to do with a Pidgey: ${JSON.stringify(n.team)}`);
  assert.equal(n.verdict, "catch", "the account axis reaches catch on its own (story 28)");
  assert.ok(n.reasons.some(r => r.kind === "team" && r.text === "party full: replaces Pikachu"), JSON.stringify(n.reasons));
  show("team says no", no.advice);
}

// ---- A team take reaches `catch` with nothing the account wants at all (story 27)
{
  const { registry, moves } = tables();
  const counts = { 0: 10, 1: 0, 2: 0, 3: 0, 4: 0 };
  const ours = (name, lv, types, id, base, stats) => mon(name, lv, types, "None", stats, [["Tackle","Normal",40,"P"]], true, undefined,
    { id, bst: sum(base), more: { baseStats: base } });
  // Two members, so the newcomer joins an empty slot rather than replacing anybody.
  const party = [
    ours("Venusaur", 50, ["Grass","Poison"], 3, [80,82,83,100,100,80], [160,90,100,110,110,80]),
    ours("Pikachu", 50, ["Electric"], 25, [35,55,40,50,50,90], [100,60,50,60,60,100]),
  ];
  // Already caught, every dex attribute and the candy entry with it, so the account axis has nothing to say — and at
  // level 18 against a level 50 Venusaur there is no dangerous fight to end early either.
  const tyranitar = mon("Tyranitar", 18, ["Rock","Dark"], "Sand Stream", [70,50,45,40,45,30], [["Bite","Dark",60,"P"]], true, undefined,
    { id: 248, catchRate: 45, bst: 600, more: { baseStats: [100,134,110,95,100,61] } });
  const r = run({ party, foes: [tyranitar], counts, registry, moves, owned: [248] });
  const before = r.advice.targets[0];
  assert.equal(before.account.value, 0, "nothing the account wants");
  assert.equal(before.verdict, "skip", "so the turn-read part alone says skip");
  assert.equal(globalThis.__ca.catchSummary(r.advice), null, "and there is no group line yet");

  const t = r.land().targets[0];
  assert.equal(t.account.value, 0, "the account axis is untouched by the landing: the two are never summed");
  assert.ok(["take", "swap"].includes(t.team.verdict), `the team wants it: ${JSON.stringify(t.team)}`);
  assert.equal(t.verdict, "catch", "a team take/swap alone reaches catch (story 27)");
  assert.equal(t.replace, null, "a party with room replaces nobody");
  show("team axis alone", r.advice);
  // The group's text summary carries the verdict and its reasons (story 40).
  const summary = globalThis.__ca.catchSummary(r.advice);
  assert.ok(summary.startsWith("catch Tyranitar — "), summary);
  for (const text of [t.team.text, ...t.team.reasons]) assert.ok(summary.includes(` · ${text}`), summary);
  console.log(`summary: ${summary}`);
}

// ---- Limited Catch: the mon won't join the party, road landed or not
{
  const { registry, moves } = tables();
  const counts = { 0: 10, 1: 0, 2: 0, 3: 0, 4: 0 };
  const limited = { challenges: [{ id: 7, value: 1 }] }; // `Challenges.LIMITED_CATCH`
  const pika = () => mon("Pikachu", 20, ["Electric"], "Static", [60,50,40,50,50,90], [["Thunderbolt","Electric",90,"S"]], true, 15,
    { id: 25, catchRate: 190, bst: 320, more: { baseStats: [35,55,40,50,50,90] } });
  const r = run({ party: [venusaur(), blastoise()], foes: [pika()], counts, registry, moves, mode: limited });
  const check = (t, where) => {
    assert.equal(t.verdict, "catch", `${where}: the account still wants a new species`);
    assert.deepEqual(t.reasons.filter(x => x.kind === "team"), [{ kind: "team", text: "Limited Catch: won't join the party" }], where);
    assert.equal(t.team, null, `${where}: there is no team to judge it against`);
    assert.equal(t.replace, null, where);
  };
  check(r.advice.targets[0], "turn read");
  check(r.land().targets[0], "road landed");
  show("limited catch", r.advice);
  assert.match(globalThis.__ca.catchSummary(r.advice), / · Limited Catch: won't join the party$/);
  // Wave X1 is the one wave the challenge lets a catch join on, so there the team is judged as ever.
  const x1 = run({ party: [venusaur(), blastoise()], foes: [pika()], counts, registry, moves, mode: limited, wave: 21 });
  assert.ok(!x1.advice.targets[0].turn.limited, "wave 21 catches join the party");
  assert.ok(x1.land().targets[0].team, "and so get a verdict");
}

// ---- Doubles with two foes out and nothing worth catching: silent
{
  const a = mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [55,30,30,30,30,40], [["Tackle","Normal",40,"P"]], true, undefined, { id: 16, catchRate: 3, bst: 251 });
  const b = mon("Pidgey2", 20, ["Normal","Flying"], "Keen Eye", [55,30,30,30,30,40], [["Tackle","Normal",40,"P"]], true, undefined, { id: 16, catchRate: 3, bst: 251 });
  assert.equal(run({ party: [venusaur(), blastoise()], foes: [a, b], double: true }).advice, null);
}

// ---- An early run's common, already-caught mons get no card
const early = () => {
  const e = (name, types, bst, id, field) => mon(name, 18, types, "None", [55,40,40,40,40,50], [["Tackle","Normal",40,"P"]], field, undefined, { id, bst });
  return [e("Comfey", ["Fairy"], 485, 764, true), e("Lechonk", ["Normal"], 255, 915, true), e("Patrat", ["Normal"], 255, 504, false),
    e("Espurr", ["Psychic"], 355, 677, false), e("Morpeko", ["Electric","Dark"], 418, 877, false)];
};
const OWNED = [764, 915, 504, 677, 877, 431, 263, 19];
const glameow = (extra = {}) => mon("Glameow", 16, ["Normal"], "Limber", [50,35,30,30,30,50], [["Scratch","Normal",40,"P"]], true, 40,
  { id: 431, catchRate: 190, bst: 310 }, extra);
{
  // Outclasses Lechonk by 55 BST and gains a few IVs (+18): neither is a reason to spend a ball.
  const { advice } = run({ party: early(), foes: [glameow({ ivs: [30,20,20,20,20,28] })], counts: { 0: 10, 1: 3, 2: 0, 3: 0, 4: 0 }, owned: OWNED });
  const t = advice.targets[0];
  assert.equal(t.verdict, "skip", `common owned Glameow: ${t.why}`);
  assert.ok(t.best.p >= 0.5, "a cheap ball would work — it's still not worth it");
  assert.deepEqual(globalThis.__ca.drawCatch(advice), [], "no card");
  show("common owned", advice);

  // Espurr resists the team's Fighting weakness, but one is already on the team.
  const patrat = mon("Patrat", 15, ["Normal"], "Run Away", [45,35,30,25,30,35], [["Tackle","Normal",40,"P"]], true, undefined, { id: 504, catchRate: 255, bst: 255 });
  const espurr = mon("Espurr", 16, ["Psychic"], "Keen Eye", [45,30,35,40,35,50], [["Confusion","Psychic",50,"S"]], true, undefined, { id: 677, catchRate: 190, bst: 355 });
  assert.equal(run({ party: early(), foes: [patrat, espurr], double: true, owned: OWNED }).advice, null, "common owned doubles: silent");
  const zig = mon("Zigzagoon", 18, ["Normal"], "Pickup", [55,35,40,30,40,60], [["Tackle","Normal",40,"P"]], true, undefined, { id: 263, catchRate: 255, bst: 240 });
  const rat = mon("Rattata", 19, ["Normal"], "Guts", [50,45,30,25,30,65], [["Tackle","Normal",40,"P"]], true, undefined, { id: 19, catchRate: 255, bst: 253 });
  assert.equal(run({ party: early(), foes: [zig, rat], double: true, owned: OWNED }).advice, null, "Zigzagoon + Rattata: silent");
}

// ---- A new hidden ability is worth a card, and a cheap ball
{
  const { advice } = run({ party: early(), foes: [glameow({ abilityIndex: 2 })], counts: { 0: 10, 1: 3, 2: 3, 3: 2, 4: 1 }, owned: OWNED });
  const t = advice.targets[0];
  assert.equal(t.verdict, "catch");
  assert.match(t.why, /new hidden ability/);
  assert.ok(!["Rogue Ball", "Master Ball"].includes(t.best.ball), `no Rogue/Master Ball for a hidden ability: ${t.best.ball}`);
  assert.ok(globalThis.__ca.drawCatch(advice).length, "card drawn");
  show("hidden ability", advice);
}
// ---- "Stronger than" compares lines and levels, not current stages
// `catchWorth` is the reader asked here, not the catch card: the party-upgrade reasons are the *encounter* card's,
// and as of #584 the catch card's team half is the judgment's instead (#585 moves this reader onto it too).
const upgradeOf = (party, foe, counts) => {
  const { scene } = run({ party, foes: [foe], counts });
  return globalThis.__ca.catchWorth(globalThis.__ca.accountRead(scene), foe).reasons.find(t => t.startsWith("stronger than")) ?? null;
};
{
  const member = (name, lv, bst, id, evos) => mon(name, lv, ["Bug","Poison"], "Swarm", [90,60,60,60,60,60], [["Poison Sting","Poison",15,"P"]], true, undefined, { id, bst, evos });
  const counts = { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0 };
  const spinarak = member("Spinarak", 20, 190, 167, [[168, 22]]);
  const wild = mon("Lickitung", 21, ["Normal"], "Oblivious", [100,60,70,60,70,30], [["Lick","Ghost",30,"P"]], true, 50, { id: 108, bst: 430 });
  assert.equal(upgradeOf([venusaur(), spinarak], wild, counts), null, "Spinarak's line isn't weaker than a 430 wild");
  const noEvo = member("Spinarak", 20, 190, 167, []);
  assert.match(upgradeOf([venusaur(), noEvo], wild, counts) ?? "", /stronger than Spinarak \(BST 430 vs 190\)/);
  const pikachu = mon("Pikachu", 45, ["Electric"], "Static", [90,60,50,60,60,90], [["Spark","Electric",65,"P"]], true, undefined, { id: 25, bst: 320 });
  const lowPidgeot = mon("Pidgeot", 15, ["Normal","Flying"], "Keen Eye", [60,40,40,40,40,50], [["Gust","Flying",40,"S"]], true, 30, { id: 18, bst: 479 });
  assert.equal(upgradeOf([venusaur(), pikachu], lowPidgeot, counts), null, "too far below our levels");
  const final400 = member("Ariados", 30, 400, 168, []);
  const charmander = mon("Charmander", 28, ["Fire"], "Blaze", [70,50,40,55,45,60], [["Ember","Fire",40,"S"]], true, 30, { id: 4, bst: 309, evos: [[5, 16], [6, 36]] });
  const text = upgradeOf([venusaur(), final400], charmander, counts);
  assert.match(text ?? "", /stronger than Ariados \(final BST ~\d+ vs 400\)/, text);
  const grows = run({ party: [venusaur(), final400], foes: [charmander], counts }).advice;
  jsonSafe(grows, "final BST");
  show("unevolved upgrade", grows);
}
// ---- A fusion is judged by the pair, not by its base species
{
  const mewtwo = { speciesId: 150, baseTotal: 680, baseStats: [106, 110, 90, 154, 90, 130], getEvolutionLevels: () => [] };
  const fused = mon("Rattwo", 45, ["Normal","Psychic"], "Guts", [140,90,70,100,70,120], [["Tackle","Normal",40,"P"]], true, undefined,
    { id: 19, bst: 253 }, { fusionSpecies: mewtwo });
  const wild = mon("Tauros", 44, ["Normal"], "Intimidate", [120,100,95,40,70,110], [["Tackle","Normal",40,"P"]], true, 60, { id: 128, bst: 490 });
  const counts = { 0: 10, 1: 5, 2: 0, 3: 0, 4: 0 };
  assert.equal(upgradeOf([venusaur(), fused], wild, counts), null, "the fused pair (467) isn't weaker than a 490");
  // Per-stat when both species carry baseStats: ceil((30+106)/2) + … for Rattata's 30/56/35/25/35/72.
  const perStat = { ...fused, species: { ...fused.species, baseStats: [30, 56, 35, 25, 35, 72] } };
  assert.equal(globalThis.__ca.finalBstOf(perStat).final, [68, 83, 63, 90, 63, 101].reduce((t, x) => t + x, 0));
  const unfused = { ...fused, fusionSpecies: undefined };
  assert.match(upgradeOf([venusaur(), unfused], wild, counts) ?? "", /stronger than Rattwo \(BST 490 vs 253\)/);
}

// ---- A shiny fusion half counts as shiny, and an event's multiplier replaces ×2
{
  const foe = extra => mon("Pikachu", 20, ["Electric"], "Static", [60,50,40,50,50,90], [["Thunderbolt","Electric",90,"S"]], true, undefined,
    { id: 16, catchRate: 45, bst: 320 }, extra);
  const ultra = t => t.chance.find(x => x.ball === "Ultra Ball").p;
  const counts = { 0: 0, 1: 0, 2: 5, 3: 0, 4: 0 };
  const expect = shinyMult => Math.round(globalThis.__ca.captureChance({ maxHp: 60, hp: 60, catchRate: 45, ball: 2, shiny: true, shinyMult, critFactor: 0.5 }) * 1000) / 1000;
  const half = run({ party: [venusaur()], foes: [foe({ fusionSpecies: { speciesId: 26, baseTotal: 485 }, fusionShiny: true })], counts }).advice.targets[0];
  assert.equal(ultra(half), expect(2), "a shiny fusion half gets the shiny multiplier");
  assert.ok(half.reasons.some(r => r.text === "shiny fusion · +5 candy"), JSON.stringify(half.reasons));
  const plain = run({ party: [venusaur()], foes: [foe()], counts }).advice.targets[0];
  assert.ok(ultra(plain) < ultra(half), "a plain one doesn't");
  const event = run({ party: [venusaur()], foes: [foe({ shiny: true })], counts, events: { getShinyCatchMultiplier: () => 3 } }).advice.targets[0];
  assert.equal(ultra(event), expect(3), "the event's ×3");
  assert.ok(ultra(event) > expect(2));
}

// ---- "Lower its HP" names a move that can't KO it, or warns that every attack can
{
  const SurviveDamageAttr = class SurviveDamageAttr {};
  const target = () => mon("Pikachu", 20, ["Electric"], "Static", [60,40,40,40,40,90], [["Thundershock","Electric",40,"S"]], true, undefined, { id: 25, catchRate: 3, bst: 320 });
  const counts = { 0: 10, 1: 0, 2: 0, 3: 0, 4: 0 };
  const why = party => { const t = run({ party, foes: [target()], counts }).advice.targets[0]; assert.equal(t.verdict, "maybe", t.why); return t.why; };
  const attacker = moves => mon("Venusaur", 50, ["Grass","Poison"], "Overgrow", [160,90,100,110,110,80], moves, true, undefined, { id: 3, bst: 525 });
  const nuke = ["Sludge Bomb","Poison",90,"S"];
  assert.match(why([attacker([nuke, ["False Swipe","Normal",40,"P",3,[new SurviveDamageAttr()]]])]), /lower its HP with False Swipe$/);
  assert.match(why([attacker([nuke, ["Absorb","Grass",20,"S"]])]), /lower its HP with Absorb \(won't KO\)$/);
  assert.match(why([attacker([nuke])]), /careful: our attacks can KO it$/);
}

// ---- The End biome refuses a ball where `checkCanUseBall` does (game-code.md §20)
{
  const blocked = opts => run({ party: [venusaur()], counts: { 0: 5, 1: 0, 2: 0, 3: 0, 4: 1 }, biome: 50, ...opts }).advice === null;
  const foe = (id, lv = 60) => mon("Paradox", lv, ["Dragon"], "Protosynthesis", [200,120,100,120,100,100], [["Dragon Claw","Dragon",80,"P"]], true, 100, { id, catchRate: 10, bst: 570 });
  assert.ok(blocked({ foes: [foe(25)], wave: 190 }), "classic: an uncaught species is refused");
  assert.ok(!blocked({ foes: [foe(9)], wave: 190 }), "classic: a caught species can be thrown at");
  // Starters 3, 9, 16 and 58 are caught in the fixture; 25 and 777 are not.
  assert.ok(!blocked({ foes: [foe(890, 200)], wave: 200, starters: [3, 9, 16, 58, 25] }), "final boss, one starter missing: catchable");
  assert.ok(blocked({ foes: [foe(890, 200)], wave: 200, starters: [3, 9, 16, 58, 25, 777] }), "final boss, two starters missing: refused");
  assert.ok(blocked({ foes: [foe(9)], wave: 190, mode: { isClassic: false, isEndless: true } }), "endless: never");
  assert.ok(!blocked({ foes: [foe(25)], wave: 45, mode: { isClassic: false, isDaily: true } }), "daily before its final boss: allowed");
  assert.ok(blocked({ foes: [foe(25)], wave: 50, mode: { isClassic: false, isDaily: true } }), "daily final boss: refused");
  assert.ok(!blocked({ foes: [foe(25)], wave: 50, mode: { isClassic: false, isDaily: true, dailyConfig: { boss: { catchable: true } } } }), "unless the event boss is catchable");
}
// ---- Only a challenge run's classic final boss and a catchable Daily boss refuse the Master Ball (game-code.md §20)
{
  const counts = { 0: 5, 1: 0, 2: 0, 3: 0, 4: 1 };
  const finalBoss = () => mon("Eternatus", 70, ["Poison","Dragon"], "Pressure", [400,150,120,150,120,130], [["Dynamax Cannon","Dragon",100,"S"]], true, 300,
    { id: 890, catchRate: 45, bst: 690 }, { bossSegments: 5, bossSegmentIndex: 3 });
  // One starter left uncaught, so `checkCanUseBall` lets the ball through.
  const at = (opts = {}) => run({ party: [venusaur()], foes: [finalBoss()], counts, biome: 50, wave: 200, starters: [3, 9, 16, 58, 25], ...opts }).advice.targets[0];
  const master = t => t.chance.find(x => x.ball === "Master Ball").p;

  const plain = at();
  assert.equal(master(plain), 1, "no challenges: the final boss still takes a Master Ball");
  // The ball cap is the *account* axis' alone as of #584 — the two axes are never summed, and the turn read only has
  // the account one. A merely-new species does not reach the Rogue/Master band on it, so the line names the Master
  // Ball as the only thing that could work here rather than offering to spend one.
  assert.match(plain.why, /break its bars first — only a Master Ball works now/);

  // A challenge at value 0 still makes a challenge run (game-code.md §20).
  const challenge = at({ mode: { challenges: [{ id: 1, value: 0 }] } });
  assert.equal(master(challenge), 0, "a challenge run: no ball works on the classic final boss");
  assert.ok(challenge.chance.every(x => x.p === 0), "and none of the others either");
  assert.match(challenge.why, /break its bars first — no ball works on this boss/);
  show("challenge final boss", { targets: [challenge] });

  const daily = { isClassic: false, isDaily: true, dailyConfig: { boss: { catchable: true } } };
  const dailyBoss = at({ wave: 50, mode: daily });
  assert.equal(master(dailyBoss), 0, "a catchable Daily boss refuses the Master Ball too");
  assert.match(dailyBoss.why, /no ball works on this boss/);
  const lastBar = finalBoss(); lastBar.bossSegmentIndex = 0; lastBar.hp = 80;
  const open = run({ party: [venusaur()], foes: [lastBar], counts, biome: 50, wave: 50, mode: daily }).advice.targets[0];
  assert.ok(!open.boss && open.chance.find(x => x.ball === "Poké Ball").p > 0, "last bar: any ball again");
  const midRun = run({ party: [venusaur()], foes: [finalBoss()], counts, wave: 30, mode: { isClassic: false, isDaily: true } }).advice.targets[0];
  assert.equal(master(midRun), 1, "a Daily boss short of the final wave takes a Master Ball");
}

// ---- A Daily run pays catch candy only for a dex attribute the catch adds (game-code.md §20)
{
  const counts = { 0: 0, 1: 0, 2: 5, 3: 0, 4: 0 };
  const shinyPika = () => mon("Pikachu", 20, ["Electric"], "Static", [60,50,40,50,50,90], [["Thunderbolt","Electric",90,"S"]], true, undefined,
    { id: 25, catchRate: 45, bst: 320 }, { shiny: true });
  // Male, non-variant, form 0 shiny Pikachu already in the dex: gender 4n | shiny 2n | variant 16n | form 128n.
  const known = { 25: { caughtAttr: 1n | 2n | 4n | 16n | 128n } };
  const reasons = opts => run({ party: [venusaur()], foes: [shinyPika()], counts, ...opts }).advice.targets[0].reasons.map(r => r.text);
  assert.ok(reasons({ dex: known }).includes("shiny · +5 candy"), "classic pays candy for a shiny it already has");
  assert.ok(reasons({ dex: known, mode: { isClassic: false, isDaily: true } }).includes("shiny"), "Daily pays none for the same catch");
  const variant = () => Object.assign(shinyPika(), { variant: 2 });
  const daily = run({ party: [venusaur()], foes: [variant()], counts, dex: known, mode: { isClassic: false, isDaily: true } }).advice.targets[0];
  assert.ok(daily.reasons.some(r => r.text === "new shiny variant · +20 candy"), JSON.stringify(daily.reasons));
}

// ---- Candy is read from the prevolution-free root, masked by that species' own unlocks (game-code.md §20)
{
  const counts = { 0: 0, 1: 0, 2: 5, 3: 0, 4: 0 };
  // Raichu: starter root Pikachu (25), prevolution-free root Pichu (172).
  const raichu = (extra = {}) => mon("Raichu", 30, ["Electric"], "Static", [120,90,55,90,80,110], [["Thunderbolt","Electric",90,"S"]], true, undefined,
    { id: 26, catchRate: 75, bst: 485, roots: [25, 172] }, { shiny: true, ...extra });
  const ALL = 1n | 2n | 4n | 16n | 128n; // non-shiny, shiny, male, default variant, form 0
  const reasons = opts => run({ party: [venusaur()], foes: [raichu(opts.foe)], counts, ...opts }).advice.targets[0].reasons.map(r => r.text);

  // Pichu has this shiny already; Pikachu, where `getRootSpeciesId(true)` stops, does not.
  const pichuKnows = { 26: { caughtAttr: ALL }, 25: { caughtAttr: 1n }, 172: { caughtAttr: ALL } };
  assert.ok(reasons({ dex: pichuKnows, mode: { isClassic: false, isDaily: true } }).includes("shiny"),
    "the candy entry is the prevolution-free root, not the first starter up the line");
  assert.ok(reasons({ dex: pichuKnows }).includes("shiny · +5 candy"), "a classic run pays it either way");

  // A starter new to the dex mid-line defers the walk and never ends it (game-code.md §20).
  const pikachuNew = { 26: { caughtAttr: ALL }, 25: { caughtAttr: 0n }, 172: { caughtAttr: 0n } };
  assert.ok(reasons({ dex: pikachuNew, starters: [3, 25] }).includes("shiny · +5 candy"),
    "an uncaught Pikachu in the middle of the line does not stop the walk");
  assert.ok(reasons({ dex: { ...pikachuNew, 25: { caughtAttr: 1n } }, starters: [3, 25] }).includes("shiny · +5 candy"),
    "nor does a caught one");

  // A Mega Charizard's form bit is one Charmander, where the candy is paid, cannot own: masked away, the catch adds
  // nothing new.
  const charizard = extra => mon("Charizard", 40, ["Fire","Flying"], "Blaze", [160,110,80,150,100,120], [["Heat Wave","Fire",95,"S"]], true, undefined,
    { id: 6, catchRate: 45, bst: 534, roots: [4, 4] }, { shiny: true, ...extra });
  const registry = { getSpecies: id => (id === 4 ? { getFullUnlocksData: () => ALL } : null), getAllSpecies: () => [] };
  const megaRun = opts => run({ party: [venusaur()], foes: [charizard({ formIndex: 1 })], counts,
    dex: { 6: { caughtAttr: ALL }, 4: { caughtAttr: ALL } }, mode: { isClassic: false, isDaily: true }, ...opts })
    .advice.targets[0].reasons.map(r => r.text);
  assert.ok(megaRun({ registry }).includes("shiny"), "the mask is the root species', and it drops a form bit Charmander cannot own");
  assert.ok(megaRun({}).includes("shiny · +5 candy"), "with no registry the raw bits stand, as they always did");
}
console.log("ok");
