// The boss Weavile outspeeds and KOs all four of ours.
import assert from "node:assert/strict";
import { mountHud, panelText } from "./fake-page.mjs";
import { benchMatchupScore, onGame } from "./game-proto.mjs";
import { cat, mon as fakeMon, outcomeFrom, TY } from "./fake-mon.mjs";
import { fakeTurn } from "./fake-turn.mjs";
import { fightState } from "./fake-fight.mjs";

// moves: as fake-mon.mjs's `mon` takes them.
const mon = (name, lv, types, ability, [hp, atk, def, spa, spd, spe], moves, field, curHp, boss = 0, next) => onGame({
  next, id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: ability }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field,
  isBoss: () => boss > 0, bossSegments: boss, bossSegmentIndex: boss - 1,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c, priority = 0, { target = 3 } = {}], i) => ({ moveId: i + 1, getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, priority }), getMovePp: () => 10, ppUsed: 0 })),
});
const party = [
  mon("Morpeko", 100, ["Electric","Dark"], "Hunger Switch", [260,250,160,150,160,250], [["Aura Wheel","Electric",110,"P"],["Crunch","Dark",80,"P"]], true),
  mon("Scrafty", 100, ["Dark","Fighting"], "Intimidate", [290,250,280,100,280,120], [["High Jump Kick","Fighting",130,"P"],["Crunch","Dark",80,"P"]], false, 151),
  mon("Blastoise", 100, ["Water"], "Torrent", [300,200,260,230,270,180], [["Hydro Pump","Water",110,"S"],["Focus Blast","Fighting",120,"S"]], false, 150),
  mon("Venusaur", 100, ["Grass","Poison"], "Overgrow", [310,200,240,240,240,170], [["Giga Drain","Grass",75,"S"],["Sludge Bomb","Poison",90,"S"]], false, 90),
];
const foes = [
  mon("Honchkrow", 100, ["Dark","Flying"], "Super Luck", [320,280,160,220,160,200], [["Brave Bird","Flying",120,"P"],["Night Slash","Dark",70,"P"]], true),
  mon("Crobat", 100, ["Poison","Flying"], "Inner Focus", [300,230,200,160,200,290], [["Cross Poison","Poison",70,"P"],["Air Slash","Flying",75,"S"]], false),
  mon("Gyarados", 100, ["Water","Flying"], "Moxie", [330,260,210,160,230,200], [["Waterfall","Water",80,"P"],["Crunch","Dark",80,"P"]], false),
  mon("Houndoom", 100, ["Dark","Fire"], "Flash Fire", [290,190,170,260,190,230], [["Flamethrower","Fire",90,"S"],["Dark Pulse","Dark",80,"S"]], false),
  mon("Magnezone", 100, ["Electric","Steel"], "Sturdy", [280,160,270,290,210,140], [["Thunderbolt","Electric",90,"S"],["Flash Cannon","Steel",80,"S"]], false),
  // Triple Axel's power is its three hits summed: the approximate model counts one hit per move. Brick Break is never
  // its best hit, but without it Houndoom ties Weavile's matchup score and a roll picks the send-in (game-code.md §7).
  mon("Weavile", 110, ["Dark","Ice"], "Pressure", [560,330,190,110,210,320], [["Triple Axel","Ice",120,"P"],["Brick Break","Fighting",75,"P"]], false, undefined, 2),
];

const run = (phase, { party: ours = party, foes: theirs = foes, double = false, enemyModifiers } = {}) => {
  const party = ours, foes = theirs;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase } : null) };
  for (const f of foes) f.getOpponents = () => party.filter(p => p.isOnField());
  const trainer = { getName: () => "Cyrus", config: { isBoss: true }, isDouble: () => false };
  const scene = { phaseManager: pm, getField: () => [...party, ...foes].filter(p => p.isOnField()), currentBattle: { waveIndex: 115, turn: 1, double, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { mode: 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes, enemyModifiers };
  const { el } = mountHud({ scene });
  const { teamPlan, tpHealProfile, tpSendScore, tpFight, tpTables, tpActs } = globalThis.__hud["35-team-plan"];
  const { readTurn } = globalThis.__hud["25-turn"];
  globalThis.__tp = { readTurn, teamPlan, drawTeamPlan: globalThis.__hud["95-render-team"].drawTeamPlan, tpHealProfile, tpSendScore, tpFight, tpTables, tpActs };
  const plan = readTurn(scene, turn => teamPlan(turn));
  return { plan, scene, nodes: globalThis.__tp.drawTeamPlan(plan) };
};

const t0 = performance.now();
const { plan, scene, nodes } = run(null);
const ms = performance.now() - t0;
console.log(nodes.map(n => panelText(n)).filter(Boolean).join("\n"));

assert.equal(JSON.stringify(JSON.parse(JSON.stringify(plan))), JSON.stringify(plan), "plan is JSON-safe");
assert.equal(plan.win?.name, "Weavile", "Weavile is the win condition");
assert.equal(plan.win.kills, 4, "Weavile KOs all four");

const reserved = plan.reserve.map(r => r.name).sort();
assert.deepEqual(reserved, ["Blastoise", "Scrafty"], "Scrafty and Blastoise are saved");
assert.ok(plan.reserve.every(r => r.for.name === "Weavile"), "saved for Weavile");
const firstWeavile = plan.steps.findIndex(x => x.vs.name === "Weavile");
assert.ok(firstWeavile > 0, "the plan reaches Weavile");
assert.ok(plan.steps.slice(0, firstWeavile).every(x => !reserved.includes(x.send.name)), "no answer is spent before Weavile comes in");

assert.deepEqual(plan.sacrifice.map(x => x.name), ["Venusaur"], "Venusaur is the sacrifice");
const sac = plan.steps.findIndex(x => x.sacrifice);
assert.equal(plan.steps[sac].send.name, "Venusaur");
assert.equal(plan.steps[sac + 1].entry, "free", "the sacrifice buys a free switch-in");
assert.ok(reserved.includes(plan.steps[sac + 1].send.name), "and the free switch-in is an answer");

assert.notEqual(plan.result, "win");
assert.ok(plan.warnings.some(w => /^likely lost/.test(w) && w.includes("Weavile")), "warns the fight is likely lost to Weavile");

assert.deepEqual(globalThis.__tp.readTurn(scene, turn => globalThis.__tp.teamPlan(turn)), plan, "the same turn gives the same plan");
assert.ok(ms < 500, `cheap enough to run every turn (${ms.toFixed(0)} ms incl. bundling)`);

// In the command phase the game-code paths are missing on the mocks: the plan falls back to the approximation, not
// a throw.
const live = run("CommandPhase").plan;
assert.equal(live.win?.name, "Weavile");
assert.equal(globalThis.Phaser.Math.RND.state(), "!rnd,0", "sandbox restored the RNG");
assert.ok(!plan.compact && plan.summary === null, "a lost fight is never compact");
assert.equal(plan.approxDoubles, false);

// An early trainer with nothing to plan around: the plan is a win in two steps and no more. In a double battle the
// plan is still one-on-one exchanges, and says so.
{
  const ours = [
    mon("Charizard", 30, ["Fire","Flying"], "Blaze", [95,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true),
    mon("Blastoise", 30, ["Water"], "Torrent", [95,58,70,62,75,55], [["Surf","Water",90,"S"]], true),
  ];
  const youngster = [
    mon("Rattata", 12, ["Normal"], "Run Away", [32,20,15,12,15,30], [["Tackle","Normal",40,"P"]], true),
    mon("Pidgey", 12, ["Normal","Flying"], "Keen Eye", [34,18,17,16,16,26], [["Gust","Flying",40,"S"]], true),
  ];
  const single = run(null, { party: ours, foes: youngster }).plan;
  console.log(`== easy trainer\n${single.summary}`);
  assert.equal(single.result, "win");
  assert.ok(single.compact, `compact: ${JSON.stringify(single)}`);
  assert.match(single.summary, /^winnable · Charizard/);
  const double = run(null, { party: ours, foes: youngster, double: true }).plan;
  assert.ok(double.approxDoubles, "doubles are flagged as approximated");
  assert.ok(double.compact);
  // Counting one field mon as `cur` read the other as a switch, and put "⇄ switch in X" on screen for a mon already
  // out (#113).
  assert.deepEqual(double.steps.map(x => x.entry), double.steps.map(() => "stay"), `no step pays to switch in a mon already out: ${JSON.stringify(double.steps)}`);
}
// Turn-end chip carries into the fight as a negative per-turn change.
{
  const { scene: s } = run(null);
  const zard = mon("Charizard", 30, ["Fire","Flying"], "Blaze", [96,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true);
  s.arena = { weather: { weatherType: 3 } };
  assert.deepEqual(globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, zard)), { base: -6, pre: -6, sitrus: 0, enigma: 0, enigmas: 0 }, "sandstorm chip in the profile, all of it ahead of the berries");
  // A Sitrus is read at the HP after the chip (game-code.md §21): 38/96, chipped to 32, heals a quarter of max.
  const held = Object.assign(new ({ BerryModifier: class { berryType = 0; getStackCount() { return 1; } } }).BerryModifier(), {});
  assert.deepEqual(globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, Object.assign(zard, { getHeldItems: () => [held] }))), { base: -6, pre: -6, sitrus: 24, enigma: 0, enigmas: 0 }, "Sitrus after the chip");
}
// A foe one of ours can eat a berry off gets its heal profile after each count of steals, and the thief what each draw
// heals it (#646, #833). The draw is uniform over the berry types held, so a lone Sitrus is sure to go and two types
// each take half; a stack of two loses its turn-end Sitrus only to the second steal.
{
  const steal = new ({ StealEatBerryAttr: class {} }).StealEatBerryAttr();
  const berry = (berryType, n = 1) => Object.assign(new ({ BerryModifier: class { getStackCount() { return n; } } }).BerryModifier(), { berryType, isTransferable: true });
  const biter = bites => {
    const p = mon("Beedrill", 100, ["Bug","Poison"], "Swarm", [260,300,120,100,120,250], [["Bug Bite","Bug",60,"P"]], true);
    const mv = p.moveset[0].getMove();
    p.moveset[0].getMove = () => ({ ...mv, attrs: bites ? [steal] : [] });
    return p;
  };
  const holder = (items, extra = {}) => Object.assign(mon("Snorlax", 100, ["Normal"], "Thick Fat", [400,200,160,120,160,60], [["Tackle","Normal",40,"P"]], true), { getHeldItems: () => items }, extra);
  const sticky = { hasAbilityWithAttr: a => a === "BlockItemTheftAbAttr" };
  const at = (bites, items, extra = {}, thief = {}) => {
    const me = Object.assign(biter(bites), thief), f = holder(items, extra);
    const { scene: s } = run(null, { party: [me], foes: [f] });
    const T = globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpTables(turn, [me], [f]));
    return { kept: T.foeHeal[0], by: T.foeHealBy[0], eats: T.stealHeal[0][0], after: T.stealHealAfter[0][0] };
  };
  const sitrus = at(true, [berry(0)]);
  console.log(`== a bug bite pairing's foe heal profile\nit keeps ${JSON.stringify(sitrus.kept)} · after the steal ${JSON.stringify(sitrus.by[1])} · we eat ${sitrus.eats}`);
  assert.equal(sitrus.kept.sitrus, 100, "a 400 HP Snorlax heals a quarter off a held Sitrus");
  assert.deepEqual(sitrus.by, [sitrus.kept, { base: 0, pre: 0, sitrus: 0, enigma: 0, enigmas: 0 }], "its one berry is sure to go, so the profile loses that heal");
  assert.deepEqual(sitrus.eats, [65], "a 260 HP thief eats a quarter of its own max HP");
  const blunt = at(false, [berry(0)]);
  assert.deepEqual([blunt.by, blunt.eats], [null, null], "nobody who can steal: no steal is priced");
  const bare = at(true, []);
  assert.deepEqual([bare.by, bare.eats], [null, null], "and nothing to steal: the same");
  assert.equal(at(true, [berry(0), berry(1)]).by[1].sitrus, 50, "beside a Lum, half the draw takes the Sitrus");
  const two = at(true, [berry(0, 2)]);
  assert.deepEqual(two.by.map(x => x.sitrus), [100, 100, 0], "a stack of two keeps one turn-end Sitrus, and loses it to the second steal");
  assert.deepEqual(two.eats, [65, 65], "…and feeds the thief twice");
  // `after`, by the foe's own eaten-berry bits (`fb`): what is left to steal once it has eaten some itself.
  assert.deepEqual([...sitrus.after], [[1, []]], "a foe that ate its one Sitrus has nothing left to steal");
  assert.deepEqual([...two.after], [[1, [65]]], "…and a Sitrus x2 one berry");
  const enigma = at(true, [berry(2)]);
  assert.deepEqual([enigma.eats, [...enigma.after]], [[65], [[2, []]]], "an Enigma it ate itself is gone too");
  {
    const me = biter(true), f = holder([berry(2)]);
    const { scene: s } = run(null, { party: [me], foes: [f] });
    const pouch = new (class PreserveBerryModifier { getStackCount() { return 1; } })();
    s.modifiers = s.enemyModifiers = [pouch];
    const by = globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpTables(turn, [me], [f])).foeHealBy[0];
    assert.deepEqual(by.map(x => [x.enigmas, x.keep]), [[1, 0.3], [0, 0.3]], "a Berry Pouch is the side's, so a steal leaves its keep whole (#822)");
  }
  assert.equal(at(true, [berry(0)], sticky).eats, null, "Sticky Hold blocks the steal, so the fight plays the heal it keeps");
  assert.deepEqual(at(true, [berry(0)], sticky, { hasAbilityWithAttr: a => a === "MoveAbilityBypassAbAttr" }).eats, sitrus.eats, "a Mold Breaker thief gets past it");
}
// A foe that already ate its own Sitrus leaves our Bug Bite nothing to eat (#833).
{
  const { tpFight } = globalThis.__tp;
  const kept = { base: 0, pre: 0, sitrus: 50, enigma: 0 };
  const base = { theirs: [[{ dmg: 10, e: 1 }]], first: [[0]], ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [kept] };
  // A 60 into 100 HP: it eats its Sitrus at 40, read off the `fb` that fight leaves (#847).
  const fb = tpFight({ ...base, ours: [[{ dmg: 60, e: 1 }]] }, fightState({ oh: [100], ob: [0], fh: [100], fs: [0], fb: [0] }), 0, 0, "free").ends.win.fb;
  const T = { ...base, ours: [[{ dmg: 50, steals: true }]], foeHealBy: [[kept, { ...kept, sitrus: 0 }]], stealHeal: [[[50]]],
    stealHealAfter: [[new Map([[1, []]])]] };
  const won = used => tpFight(T, fightState({ oh: [100], ob: [0], fh: [100], fs: [0], fb: [used] }), 0, 0, "free").ends.win.mh;
  const [held, eaten] = [won(0), won(fb)];
  console.log(`== bug bite after the foe ate its own Sitrus\nwe end on ${eaten} (${held} when it still held it)`);
  // Two Bug Bites fell it, and its one hit lands between them: 100 − 10, plus 50 for a Sitrus still there to steal.
  assert.deepEqual([held, eaten], [140, 90], "no heal for a berry already eaten");
}
// …and an Enigma it ate on an earlier exchange the same, read off the eaten bits that exchange left (#833, #822).
{
  const { tpFight } = globalThis.__tp;
  const kept = { base: 0, pre: 0, sitrus: 0, enigma: 50, enigmas: 1 };
  const base = { theirs: [[{ dmg: 10, e: 1 }]], first: [[0]], ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [kept] };
  // A super-effective 60 into 100 HP: it eats its Enigma at 40 and goes down on the third hit.
  const fb = tpFight({ ...base, ours: [[{ dmg: 60, e: 2 }]] }, fightState({ oh: [100], ob: [0], fh: [100], fs: [0], fb: [0] }), 0, 0, "free").ends.win.fb;
  const T = { ...base, ours: [[{ dmg: 50, steals: true }]], foeHealBy: [[kept, { ...kept, enigma: 0, enigmas: 0 }]], stealHeal: [[[50]]],
    stealHealAfter: [[new Map([[2, []]])]] };
  const won = bits => tpFight(T, fightState({ oh: [100], ob: [0], fh: [100], fs: [0], fb: [bits] }), 0, 0, "free").ends.win.mh;
  assert.deepEqual([won(0), won(fb)], [140, 90], `no heal for an Enigma already eaten (fb ${fb})`);
}
// A switch-in's entry turn ends before our Bug Bite has gone off, so the foe still eats its own Sitrus then (#646).
{
  const { tpFight } = globalThis.__tp;
  const kept = { base: 0, sitrus: 50, enigma: 0 };
  const T = { ours: [[{ dmg: 100, steals: true }]], theirs: [[{ dmg: 10, e: 1 }]], first: [[0]], ourMax: [200], foeMax: [200], ourHeal: [null],
    foeHeal: [kept], foeHealBy: [[kept, { ...kept, sitrus: 0 }]], stealHeal: [[[0]]] };
  const st = fightState({ oh: [200], ob: [0], fh: [90], fs: [0], fb: [0] });
  const [switched, free] = ["switch", "free"].map(e => tpFight(T, st, 0, 0, e));
  console.log(`== a bug bite switch-in's entry turn\nswitch: won in ${switched.ends.win.turns} · free: won in ${free.ends.win.turns}`);
  assert.equal(switched.ends.win.turns, 2, "the Sitrus eaten at the entry turn's end takes a second Bug Bite");
  assert.equal(free.ends.win.turns, 1, "with no entry turn, the first Bug Bite fells it");
}
// A branch where our Bug Bite never went off keeps the foe's own Sitrus (#833)
{
  const { tpFight } = globalThis.__tp;
  const kept = { base: 0, pre: 0, sitrus: 50, enigma: 0 }, gone = { ...kept, sitrus: 0 };
  // The foe outspeeds; half its hits fell our 150 HP before we move, half take 50.
  const T = { ours: [[{ dmg: 40, steals: true }]], theirs: [[{ dmg: 100, e: 1, use: [{ r: 2, p: 0.5 }, { r: 0.5, p: 0.5 }] }]], first: [[1]],
    ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [kept], foeHealBy: [[kept, gone]], stealHeal: [[[0]]] };
  const r = tpFight(T, fightState({ oh: [150], ob: [0], fh: [90], fs: [0], fb: [0] }), 0, 0, "free");
  console.log(`== bug bite that never went off\nlost with the foe on ${r.ends.loss.fh} on average`);
  // Felled on turn 1 (½): it ate its Sitrus, 140. Felled on turn 2 (¼) or 3 (¼) after our steal: 50, then 10.
  assert.equal(r.ends.loss.fh, 85, "the foe eats its own Sitrus where our Bug Bite never landed, and not where it did");
}
// A stealing move pinned on a pairing whose own pick steals nothing prices the steal (#113, #833)
{
  const { tpFight } = globalThis.__tp;
  const kept = { base: 0, pre: 0, sitrus: 50, enigma: 0 }, gone = { ...kept, sitrus: 0 };
  const T = { ours: [[{ dmg: 80, steals: false }]], theirs: [[{ dmg: 1, e: 1 }]], first: [[0]],
    ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [kept], foeHealBy: [[kept, gone]], stealHeal: [[[0]]] };
  const fight = over => tpFight(T, fightState({ oh: [200], ob: [0], fh: [200], fs: [0], fb: [0] }), 0, 0, "free", over).ends.win.turns;
  const [own, pinned] = [null, { dmg: 80, steals: true }].map(fight);
  console.log(`== a pinned bug bite\nthe pairing's own pick wins in ${own} · a pinned Bug Bite in ${pinned}`);
  assert.deepEqual([own, pinned], [4, 3], "200 → 120 → 40, and only the pinned steal keeps its Sitrus from bringing it back to 90");
}
// A Sitrus x2 holder loses both berries to two landed Bug Bites, and the thief eats each (#833)
{
  const { tpFight } = globalThis.__tp;
  const kept = { base: 0, pre: 0, sitrus: 50, enigma: 0 }, gone = { ...kept, sitrus: 0 };
  const T = { ours: [[{ dmg: 30, steals: true }]], theirs: [[{ dmg: 20, e: 1 }]], first: [[0]],
    ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [kept], foeHealBy: [[kept, kept, gone]], stealHeal: [[[30, 30]]] };
  const r = tpFight(T, fightState({ oh: [150], ob: [0], fh: [200], fs: [0], fb: [0] }), 0, 0, "free");
  console.log(`== bug bite into a Sitrus x2\nwon in ${r.ends.win.turns} on ${r.ends.win.mh} HP · ${r.fl} berries gone`);
  assert.equal(r.ends.win.turns, 7, "two steals by turn 2, so the foe at 80 on turn 4 has no Sitrus left: seven 30s fell it");
  // 150, +30 −20, +30 −20, then four more of its hits: 90.
  assert.equal(r.ends.win.mh, 90, "each steal heals the thief");
  assert.equal(r.fl, 2, "the count carries to the next exchange");
}
// A foe switching in spends its first turn coming in (#846). It outspeeds us and two of its hits fell our 150 HP;
// two of ours fell its 200.
{
  const { tpFight } = globalThis.__tp;
  const T = { ours: [[{ dmg: 100 }]], theirs: [[{ dmg: 100, entry: 100, e: 1 }]], first: [[1]], ourMax: [150], foeMax: [200], ourHeal: [null], foeHeal: [null] };
  const st = () => fightState({ oh: [150], ob: [0], fh: [200], fs: [0], fb: [0] });
  const fight = (entry, entering) => tpFight(T, st(), 0, 0, entry, null, entering);
  const [stays, enters] = [false, true].map(e => fight("stay", e));
  console.log(`== a foe's entry turn\nstay: ${stays.pWin} win at ${stays.mh} · into a switch-in: ${enters.pWin} win at ${enters.mh}`);
  assert.equal(stays.pLoss, 1, "a foe already out hits first on turn 1 and wins the race");
  assert.equal(enters.pWin, 1, "against a switch-in our first hit is free, so we win it");
  assert.equal(enters.mh, 50, "having taken one hit, not two");
  const both = fight("switch", true), free = fight("free", false);
  assert.deepEqual([both.pWin, both.mh], [free.pWin, free.mh], "switching in as it does costs no entry hit: both sides spend the turn");
  assert.equal(fight("switch", false).mh, 0, "where a foe already out does hit the entry");
}
// A switch-in that Teras later takes our hit on its entry turn at the typing it comes in at (#825). We outspeed it, its
// hits fell our 150 HP in two, and Surf deals 50 a use against its Tera but 100 against its entry typing.
{
  const { tpFight } = globalThis.__tp;
  const T = ourEntry => ({ ours: [[{ name: "Surf", dmg: 50 }]], theirs: [[{ dmg: 100, entry: 100, e: 1 }]], first: [[0]], ourMax: [150], foeMax: [200],
    ourHeal: [null], foeHeal: [null], ...(ourEntry ? { ourEntry: [[ourEntry]] } : {}) });
  const st = () => fightState({ oh: [150], ob: [0], fh: [200], fs: [0], fb: [0] });
  const entry = { Surf: { name: "Surf", dmg: 100, e: 2 } };
  const [plain, priced] = [null, entry].map(x => tpFight(T(x), st(), 0, 0, "stay", null, true));
  console.log(`== a tera switch-in's entry hit\nat its tera: ${plain.pWin} win, foe at ${plain.fh} · at its entry typing: ${priced.pWin} win at ${priced.mh}`);
  assert.deepEqual([plain.pLoss, plain.fh], [1, 50], "priced at its Tera, four uses are one too many");
  assert.deepEqual([priced.pWin, priced.mh], [1, 50], "the entry turn's 100 then two uses at 50 win, after one hit taken");
  const recoil = tpFight({ ...T({ Surf: { ...entry.Surf, self: 10 } }), ours: [[{ name: "Surf", dmg: 50, self: 5 }]] }, st(), 0, 0, "stay", null, true);
  assert.equal(recoil.mh, 30, "recoil follows the damage: 10 off the entry hit, 5 off each use after");
  for (const [kind, entering, over] of [["stay", false, null], ["switch", true, null], ["stay", true, { name: "Muddy Water", dmg: 50 }]]) {
    assert.deepEqual(tpFight(T(entry), st(), 0, 0, kind, over, entering), tpFight(T(null), st(), 0, 0, kind, over, entering),
      `no entry price for ${kind}${entering ? " into a switch-in" : ""}${over ? ` pinned to ${over.name}` : ""}`);
  }
  const memo = { ...T(entry), memo: new Map() };
  tpFight(memo, st(), 0, 0, "stay", null, true);
  assert.deepEqual(tpFight(memo, st(), 0, 0, "stay", null, false), tpFight(T(entry), st(), 0, 0, "stay", null, false),
    "a later exchange from the same state is never served the entry-priced one");
}
// Item thieves and wave status tokens carry through the exchange: a long Blastoise–Snorlax fight.
{
  const item = (name, props = {}, n = 1) => Object.assign(new ({ [name]: class { isTransferable = true; getStackCount() { return n; } } })[name](), props);
  const token = effect => new ({ EnemyAttackStatusEffectChanceModifier: class { effect = effect; chance = effect === 1 ? 0.05 : 0.025; getStackCount() { return 10; } } }).EnemyAttackStatusEffectChanceModifier();
  const blastoise = (items = []) => Object.assign(mon("Blastoise", 60, ["Water"], "Torrent", [200,100,120,160,120,80], [["Water Gun","Water",40,"S"]], true), { getHeldItems: () => items });
  const snorlax = (items = []) => Object.assign(mon("Snorlax", 60, ["Normal"], "Thick Fat", [300,80,90,65,110,30], [["Tackle","Normal",40,"P"]], true), { getHeldItems: () => items });
  const step = opts => run(null, opts).plan.steps[0];
  const plain = step({ party: [blastoise([item("TurnHealModifier")])], foes: [snorlax()] });
  const robbed = step({ party: [blastoise([item("TurnHealModifier")])], foes: [snorlax([item("TurnHeldItemTransferModifier")])] });
  console.log(`== thieves and tokens\n${plain.why}`);
  assert.ok(robbed.hp < plain.hp, `a foe's Mini Black Hole takes our Leftovers (${plain.hp}% → ${robbed.hp}%)`);
  const bare = step({ party: [blastoise()], foes: [snorlax([item("TurnHealModifier")])] });
  const clawed = step({ party: [blastoise([item("ContactHeldItemTransferChanceModifier", { chance: 0.1 }, 5)])], foes: [snorlax([item("TurnHealModifier")])] });
  assert.ok(bare.foeHp > 0 && clawed.foeHp === 0, `our Grip Claw takes its Leftovers, and the fight (${bare.why} → ${clawed.why})`);
  const poisoned = step({ party: [blastoise()], foes: [snorlax()], enemyModifiers: [token(1)] });
  const clean = step({ party: [blastoise()], foes: [snorlax()] });
  assert.ok(poisoned.hp < clean.hp, `poison tokens chip us (${clean.hp}% → ${poisoned.hp}%)`);
  const slept = step({ party: [blastoise()], foes: [snorlax()], enemyModifiers: [token(4)] });
  assert.ok(slept.hp < clean.hp, `sleep tokens cost us turns, so Snorlax gets more hits in (${clean.hp}% → ${slept.hp}%)`);
}
// The trainer's send-in is scored at the HP the plan has reached: a worn-down Morpeko makes a 30 % bench mon a better
// send-in than a healthy one does.
{
  const { tpSendScore } = globalThis.__tp;
  const T = { send: [[{ base: 3, outspeed: false }], [{ base: 3, outspeed: true }]], foeMax: [100, 100], ourMax: [200] };
  const at = (ourHp, fi) => Math.round(tpSendScore(T, fightState({ oh: [ourHp], fh: [30, 30] }), fi, 0) * 1000) / 1000;
  assert.deepEqual([at(200, 0), at(20, 0), at(200, 1), at(20, 1)], [0.45, 1.8, 1.125, 3], "the HP factor follows the simulated HP");
}
// The plan's send-in score at any HP it reaches is the game's there (#464): a slower foe at 30 % HP is halved once.
{
  const { tpTables, tpSendScore } = globalThis.__tp;
  const { sceneSendInScore } = globalThis.__hud["20-enemy-ai"];
  const me = mon("Blastoise", 100, ["Water"], "Torrent", [200,200,260,230,270,180], [["Hydro Pump","Water",110,"S"]], true);
  const foe = (name, spe, hp) => Object.assign(mon(name, 100, ["Normal"], "x", [300,200,200,200,200,spe], [["Tackle","Normal",40,"P"]], false, hp),
    { typeScore: 2.5, getMatchupScore: benchMatchupScore });
  const foes = [foe("Slow30", 120, 90), foe("Fast30", 240, 90), foe("Slow60", 120, 180), foe("Slow15", 120, 45)];
  const turn = fakeTurn({ party: [me], foes, sendIn: (f, p) => sceneSendInScore(null, f, p) });
  const T = tpTables(turn, [me], foes);
  for (const ourHp of [100, 200]) {
    const st = fightState({ oh: [ourHp], fh: foes.map(f => f.hp) });
    for (const [fi, f] of foes.entries()) {
      const want = f.getMatchupScore(Object.assign(Object.create(me), { hp: ourHp }));
      const got = tpSendScore(T, st, fi, 0);
      assert.ok(Math.abs(got - want) < 1e-9, `${f.name} against our ${ourHp / 2} %: plan ${got}, game ${want}`);
    }
  }
}
// Speed order and rolls as chances: a mirror match at a speed tie with a coin-flip KO is a coin flip, not a sure win.
{
  const { tpFight } = globalThis.__tp;
  const rolls = [{ r: 0.92, p: 0.5 }, { r: 1.08, p: 0.5 }];
  const T = { ours: [[{ dmg: 100, use: rolls }]], theirs: [[{ dmg: 100, e: 1, use: rolls }]], first: [[0.5]], ourMax: [200], foeMax: [200], ourHeal: [null], foeHeal: [null] };
  const r = tpFight(T, fightState({ oh: [200], ob: [0], fh: [200], fs: [0], fb: [0] }), 0, 0, "free");
  console.log(`== mirror at a speed tie\nwin ${r.pWin.toFixed(3)} · loss ${r.pLoss.toFixed(3)}`);
  assert.ok(Math.abs(r.pWin - r.pLoss) < 1e-9 && Math.abs(r.pWin + r.pLoss - 1) < 1e-9, `symmetric (${r.pWin}, ${r.pLoss})`);
  T.first = [[0]];
  const faster = tpFight(T, fightState({ oh: [200], ob: [0], fh: [200], fs: [0], fb: [0] }), 0, 0, "free");
  assert.ok(faster.pWin > 0.8 && faster.pWin < 1, `outspeeding wins most, not all: ${faster.pWin}`);
}
// An ending's HP is its pool's mean, and its berries the likeliest combination's (#527). We win on turn 2 at 116 with
// the Sitrus Berry kept (40 %), or at 142 or 130 with it eaten (30 % each): the likeliest single branch kept it.
{
  const { tpFight } = globalThis.__tp;
  const T = { ours: [[{ dmg: 100 }]], theirs: [[{ dmg: 120, e: 1, use: [{ r: 0.7, p: 0.4 }, { r: 0.9, p: 0.3 }, { r: 1, p: 0.3 }] }]],
    first: [[0]], ourMax: [200], foeMax: [200], ourHeal: [{ base: 0, sitrus: 50 }], foeHeal: [null] };
  const r = tpFight(T, fightState({ oh: [200], ob: [0], fh: [200], fs: [0], fb: [0] }), 0, 0, "free");
  console.log(`== an ending's one branch\nwin ${r.pWin} · ${r.ends.win.mh.toFixed(2)} HP · berry ${r.ends.win.mb ? "eaten" : "kept"}`);
  assert.equal(r.pWin, 1);
  assert.ok(Math.abs(r.ends.win.mh - (0.4 * 116 + 0.3 * 142 + 0.3 * 130)) < 1e-9, `HP is the pool's mean: ${r.ends.win.mh}`);
  assert.notEqual(r.ends.win.mb, 0, "the berry follows the likeliest combination, eaten, not the likeliest branch");
  assert.equal(r.ends.win.turns, 2);
}
// Acting is taking at least 1 HP off the foe (#527). Outsped and OHKO'd on every roll we land nothing, but the mean of
// 101 over these weights is a float error under 101.
{
  const { tpFight, tpActs } = globalThis.__tp;
  const T = { ours: [[{ dmg: 50 }]], theirs: [[{ dmg: 100, e: 1, use: [{ r: 0.9, p: 0.1 }, { r: 1, p: 0.6 }, { r: 1.1, p: 0.3 }] }]],
    first: [[1]], ourMax: [80], foeMax: [101], ourHeal: [null], foeHeal: [null] };
  const r = tpFight(T, fightState({ oh: [80], ob: [0], fh: [101], fs: [0], fb: [0] }), 0, 0, "free");
  assert.equal(r.pLoss, 1);
  assert.ok(r.fh < 101 && r.fh > 101 - 1e-9, `the knife edge is still there: ${r.fh}`);
  assert.equal(tpActs(r, 101), false, "no hit landed");
  assert.equal(tpActs({ fh: 100 }, 101), true, "1 HP is a hit");
  assert.equal(tpActs({ fh: 100.5 }, 101), false, "half of one is not");
}
// Drain (#90): the foe heals 30 of each 60 it lands, so our 100 a turn needs a fourth turn (300 → 230 → 160 → 90).
{
  const { tpFight } = globalThis.__tp;
  const T = drain => ({ ours: [[{ dmg: 100 }]], theirs: [[{ dmg: 60, e: 1, drain }]], first: [[0]], ourMax: [400], foeMax: [300], ourHeal: [null], foeHeal: [null] });
  const st = () => fightState({ oh: [400], ob: [0], fh: [300], fs: [0], fb: [0] });
  const [plain, drained] = [0, 0.5].map(d => tpFight(T(d), st(), 0, 0, "free"));
  console.log(`== drain\n${plain.turns} → ${drained.turns} turns`);
  assert.deepEqual([plain.turns, drained.turns], [3, 4], "the foe's drain costs us a turn");
  // Ours: three hits win back 50 each against its two of 60 (200 → 230), never past max (390 → 380, not 420).
  const ours = { ...T(0), ours: [[{ dmg: 100, drain: 0.5 }]] };
  assert.equal(tpFight(ours, { ...st(), oh: [200] }, 0, 0, "free").mh, 230, "our drain heals on every hit");
  assert.equal(tpFight(ours, { ...st(), oh: [390] }, 0, 0, "free").mh, 380, "never past max");
  // Recoil (#235): 400 − 2×60 = 280 for a cost-free move, and 3 × 20 less for one that spends 20 a use.
  const recoil = self => tpFight({ ...T(0), ours: [[{ dmg: 100, self }]] }, st(), 0, 0, "free").mh;
  assert.deepEqual([recoil(0), recoil(20)], [280, 220], "recoil is spent on every landed use");
}
// On-KO boosts (#90, game-code.md §18): each KO Buzzwole's Beast Boost scores raises its Atk a stage.
{
  const { tpTables, tpFight } = globalThis.__tp;
  const { scene: s } = run(null);
  const beastBoost = {
    hasAbilityWithAttr: a => a === "PostVictoryStatStageChangeAbAttr",
    getAbility: () => ({ name: "Beast Boost", getAttrs: a => (a === "PostVictoryStatStageChangeAbAttr" ? [{ changes: () => [{ stat: 1, stages: 1 }] }] : []) }),
  };
  const buzzwole = extra => Object.assign(mon("Buzzwole", 100, ["Bug","Fighting"], "Beast Boost", [400,300,300,100,100,200], [["Lunge","Bug",80,"P"]], true), extra);
  // Blastoise is faster and 2HKOs only on high rolls, so it takes about two Lunges however many KOs Buzzwole has had.
  const blastoise = mon("Blastoise", 100, ["Water"], "Torrent", [400,150,300,150,300,250], [["Hydro Pump","Water",110,"S"]], false);
  const hitsOn = (foe, fk) => {
    const T = globalThis.__tp.readTurn(s, turn => tpTables(turn, [blastoise], [foe], false));
    return 400 - tpFight(T, fightState({ oh: [400], ob: [0], fh: [400], fs: [0], fb: [0], fk: [fk] }), 0, 0, "free").mh;
  };
  const boosted = [0, 1, 2].map(k => hitsOn(buzzwole(beastBoost), k));
  const plainHits = [0, 1, 2].map(k => hitsOn(buzzwole({}), k));
  console.log(`== beast boost\nBlastoise loses ${boosted.map(Math.round).join(" / ")} HP after 0 / 1 / 2 KOs (no ability: ${plainHits.map(Math.round).join(" / ")})`);
  assert.ok(plainHits.every(x => x === plainHits[0]), "no ability, no change");
  assert.ok(boosted[0] === plainHits[0] && boosted[1] > boosted[0] && boosted[2] > boosted[1], "each KO fed makes its hits hurt more");
  // The plan names the step that feeds it: a worn Pidgey chips Buzzwole past half and falls, and Blastoise comes in
  // free.
  const fodder = mon("Pidgey", 20, ["Normal","Flying"], "Keen Eye", [60,450,30,30,30,300], [["Brave Bird","Flying",120,"P"]], true, 10);
  const puncher = Object.assign(mon("Buzzwole", 100, ["Bug","Fighting"], "Beast Boost", [400,300,300,100,100,200], [["Lunge","Bug",80,"P"],["Thunder Punch","Electric",75,"P"]], true), beastBoost);
  const plan = run(null, { party: [fodder, blastoise], foes: [puncher] }).plan;
  console.log(`== feeding Beast Boost\n${plan.steps.map(x => `${x.send.name} → ${x.vs.name}: ${x.why}`).join("\n")}`);
  const fed = plan.steps.find(x => x.send.name === "Pidgey");
  assert.ok(fed && fed.hp === 0, `Pidgey falls to Buzzwole: ${JSON.stringify(plan.steps)}`);
  assert.match(fed.why, /feeds Beast Boost \+1 Atk/, "a fall into Beast Boost is named");
}
// A priority move from a slower mon lands before the faster foe that KOs it: the order is taken per move, not per
// pairing (#650). Hitmonchan at 40 of 100 is outsped and one-shot by Golem's Rock Slide. Close Combat is the pairing's
// pick and never goes off; Mach Punch (+1) takes its use off Golem first.
{
  const { tpTables, tpFight } = globalThis.__tp;
  const { scene: s } = run(null);
  const golem = mon("Golem", 100, ["Rock","Ground"], "Sturdy", [300,250,230,100,100,90], [["Rock Slide","Rock",75,"P"]], true);
  const MACH = ["Mach Punch","Fighting",40,"P",1], UPPERCUT = ["Sky Uppercut","Fighting",40,"P"];
  const tablesFor = moves => globalThis.__tp.readTurn(s, turn => tpTables(turn,
    [mon("Hitmonchan", 100, ["Fighting"], "Iron Fist", [100,200,100,100,100,60], moves, true, 40)], [golem], false));
  const T = tablesFor([MACH, ["Close Combat","Fighting",120,"P"]]);
  const mach = tablesFor([MACH]).ours[0][0];
  // Two uses that fell Golem in the same number of turns, the second of them first: the order is part of what a move
  // costs, so the tie goes to Mach Punch rather than to whichever use the moveset lists first.
  const even = tablesFor([UPPERCUT, MACH]);
  const fight = move => tpFight(T, fightState({ oh: [40], ob: [0], fh: [300], fs: [0], fb: [0] }), 0, 0, "free", move);
  const slow = fight(T.ours[0][0]), quick = fight(mach);
  console.log(`== a priority move from a slower mon (#650)\n${T.ours[0][0].name} at ${T.first[0][0]} leaves ${slow.fh}` +
    ` · ${mach.name} at ${T.firstBy[0][0][mach.name]} leaves ${Math.round(quick.fh)}`);
  assert.equal(T.ours[0][0].name, "Close Combat", "two uses still beat four, order and all");
  assert.equal(T.first[0][0], 1, "the pairing's pick is outsped");
  assert.equal(T.firstBy[0][0][mach.name], 0, "the priority move is not: the order is taken per move");
  assert.equal(slow.fh, 300, `the pick never goes off, so it takes nothing off: ${slow.why ?? slow.fh}`);
  assert.equal(Math.round(quick.fh), Math.round(300 - mach.dmg), `the priority move lands one use first: ${quick.fh}`);
  assert.equal(quick.pLoss, 1, "and still loses the race");
  assert.equal(even.ours[0][0].name, "Mach Punch", "a KO one use slower that moves first is the better use of the mon");

  // A mon that already moves first gains nothing from priority, off the live game as on it (#650).
  const fast = moves => globalThis.__tp.readTurn(s, turn => tpTables(turn,
    [mon("Hitmonchan", 100, ["Fighting"], "Iron Fist", [300,200,100,100,100,120], moves, true)], [golem], false));
  const F = fast([["Mach Punch","Fighting",70,"P",1], ["Drain Punch","Fighting",75,"P"]]);
  console.log(`== priority from a mon already first (#650): ${F.ours[0][0].name} · first ${F.first[0][0]}`);
  assert.equal(F.ours[0][0].name, "Drain Punch", "two uses either way, and the harder hit");
}
// A free entry goes to a mon that acts (#651, W145 T9–13). Breloom at 93 of 240 is outsped and one-shot by Rayquaza's
// Outrage, and so are Tentacruel and Crawdaunt behind it; only Raichu is faster, and takes a Thunderbolt off Rayquaza
// before it falls. Every ordering loses the line and lands the same 150, so the beam has no damage to tell them apart:
// the free entry Breloom's fall buys still goes to the member that acts, and the two that cannot are kept for the
// sacrifices after it.
{
  // "attacker>move>defender": [[max damage], accuracy, effectiveness].
  const W145 = {
    "Breloom>Drain Punch>Rayquaza": [[40], 1, 0.5], "Rayquaza>Outrage>Breloom": [[339], 1, 1],
    "Tentacruel>Surf>Rayquaza": [[60], 1, 0.5], "Rayquaza>Outrage>Tentacruel": [[431], 1, 1],
    "Crawdaunt>Crabhammer>Rayquaza": [[80], 1, 0.5], "Rayquaza>Outrage>Crawdaunt": [[346], 1, 1],
    "Raichu>Thunderbolt>Rayquaza": [[150], 1, 1], "Rayquaza>Outrage>Raichu": [[437], 1, 1],
    // Ivy's bench: a Pidgeot two of ours KO one-on-one, so it is neither the win condition nor held for by anyone.
    "Breloom>Drain Punch>Pidgeot": [[40], 1, 0.5], "Pidgeot>Air Slash>Breloom": [[120], 1, 4],
    "Tentacruel>Surf>Pidgeot": [[70], 1, 1], "Pidgeot>Air Slash>Tentacruel": [[60], 1, 1],
    "Crawdaunt>Crabhammer>Pidgeot": [[240], 1, 1], "Pidgeot>Air Slash>Crawdaunt": [[60], 1, 1],
    "Raichu>Thunderbolt>Pidgeot": [[240], 1, 2], "Pidgeot>Air Slash>Raichu": [[60], 1, 1],
  };
  const stub = outcomeFrom(W145);
  const w145 = (name, ...rest) => fakeMon(name, 80, ...rest);
  const planOf = (party, foes, double = false) => {
    for (const f of foes) f.getOpponents = () => party.filter(p => p.isOnField());
    const turn = fakeTurn({
      live: true, wave: 145, turn: 9, party, foes, double,
      trainer: { getName: () => "Ivy", config: { isBoss: false }, isDouble: () => false },
      outcome: stub,
      moves: e => [{ name: e.moveset[0].getName(), type: TY[e.moveset[0].getMove().type], p: 1, score: 10, targets: [0] }],
    });
    const planner = globalThis.__hud["35-team-plan"].teamPlanner(turn);
    return { plan: planner.view(null), freeEntry: planner.after(null)?.freeEntry ?? null, planner };
  };
  const breloom = () => w145("Breloom", ["Grass","Fighting"], [240,230,120,100,120,130], [["Drain Punch","Fighting",75,"P"]], true, 93);
  const rayquaza = () => w145("Rayquaza", ["Dragon","Flying"], [350,250,120,250,120,200], [["Outrage","Dragon",120,"P"]], true);
  const ninjask = () => w145("Ninjask", ["Bug","Flying"], [220,150,90,50,90,260], [["X-Scissor","Bug",80,"P"]], false);
  const sentOn = (party, foes) => planOf(party, foes).plan.steps.map(x => x.send.name);
  Object.assign(W145, {
    "Ninjask>X-Scissor>Rayquaza": [[12], 1, 1], "Rayquaza>Outrage>Ninjask": [[400], 1, 1],
    "Haxorus>Dragon Rush>Rayquaza": [[420], 0.75, 2], "Rayquaza>Outrage>Haxorus": [[400], 1, 2],
    "Granbull>Earthquake>Rayquaza": [[0], 1, 0], "Rayquaza>Outrage>Granbull": [[0], 1, 0],
  });
  // A free entry that more often falls than wins still takes it when its win is worth more than a chip (#651).
  {
    const haxorus = w145("Haxorus", ["Dragon"], [260,250,120,100,120,200], [["Dragon Rush","Dragon",100,"P"]], false);
    const order = sentOn([breloom(), ninjask(), haxorus], [rayquaza()]);
    console.log(`== a free entry that more often falls than wins (#651): ${order.join(" → ")}`);
    assert.deepEqual(order.slice(0, 2), ["Breloom", "Haxorus"], order.join(" → "));
  }
  // A free entry that walls the foe for good is not dropped for one that chips it and falls (#651).
  {
    const granbull = w145("Granbull", ["Fairy"], [290,200,150,100,120,90], [["Earthquake","Ground",100,"P"]], false);
    // Breloom stays, as the ⚔ line has it: switching Granbull straight in is the other way to wall it.
    const order = planOf([breloom(), ninjask(), granbull], [rayquaza()]).planner.at({ mi: 0 }).steps.map(x => ["Breloom", "Ninjask", "Granbull"][x.mi]);
    console.log(`== a free entry that walls the foe (#651): ${order.join(" → ")}`);
    assert.deepEqual(order.slice(0, 2), ["Breloom", "Granbull"], order.join(" → "));
  }
  // In a double with one slot open, a bench mon that can't hurt the foe still fills it (#651).
  {
    const granbull = w145("Granbull", ["Fairy"], [290,200,150,100,120,90], [["Earthquake","Ground",100,"P"]], false);
    const { plan } = planOf([breloom(), granbull], [rayquaza()], true);
    const order = plan.steps.map(x => `${x.send.name} ${x.entry}`);
    console.log(`== an open slot in a double (#651): ${order.join(" → ")}`);
    assert.equal(order[0], "Granbull free", order.join(" → "));
  }
  const planFor = withPidgeot => {
    const party = [
      w145("Breloom", ["Grass","Fighting"], [240,230,120,100,120,130], [["Drain Punch","Fighting",75,"P"]], true, 93),
      w145("Tentacruel", ["Water","Poison"], [300,140,120,160,160,170], [["Surf","Water",90,"S"]], false),
      w145("Crawdaunt", ["Water","Dark"], [300,220,110,130,110,155], [["Crabhammer","Water",100,"P"]], false),
      w145("Raichu", ["Electric"], [240,120,100,160,110,220], [["Thunderbolt","Electric",90,"S"]], false),
    ];
    const foes = [
      w145("Rayquaza", ["Dragon","Flying"], [350,250,120,250,120,200], [["Outrage","Dragon",120,"P"]], true),
      ...(withPidgeot ? [w145("Pidgeot", ["Normal","Flying"], [220,140,110,130,110,190], [["Air Slash","Flying",75,"S"]], false)] : []),
    ];
    return planOf(party, foes);
  };
  for (const withPidgeot of [false, true]) {
    const { plan, freeEntry } = planFor(withPidgeot);
    console.log(`== a free entry that acts (#651)${withPidgeot ? ", Pidgeot on the bench" : ""}\n` +
      `⤵ ${freeEntry?.out.name} falls this turn › ${freeEntry?.in.name} in free\n` +
      plan.steps.map((x, i) => `➜ ${i + 1}. ${x.send.name} ${x.entry} ${x.move} → ${x.vs.name} ${x.why}`).join("\n"));
    const where = `${withPidgeot ? "with" : "without"} Pidgeot`;
    assert.equal(plan.steps[0].send.name, "Breloom", `Breloom leads ${where}`);
    assert.ok(plan.steps[0].sacrifice, `Breloom's fall is the sacrifice ${where}: ${plan.steps[0].why}`);
    assert.equal(plan.steps[1].entry, "free", `and buys a free entry ${where}`);
    assert.equal(plan.steps[1].send.name, "Raichu", `the only member that acts takes it ${where}`);
    assert.equal(freeEntry?.in.name, "Raichu", `the ⤵ line names it too ${where}`);
    assert.deepEqual(plan.sacrifice.map(x => `${x.name} → ${x.frees.name}`).slice(0, 1), ["Breloom → Raichu"],
      `the card's sacrifice line follows the plan ${where}`);
    assert.deepEqual(plan.steps.map(x => x.send.name), ["Breloom", "Raichu", "Tentacruel", "Crawdaunt"], `nothing is spent for nothing before Raichu acts ${where}`);
  }
}
// The move pick's pace counts the Enigma Berry a super-effective hit feeds (#652, Ivy W145 T11–13).
{
  // "attacker>move>defender": [max damage, effectiveness]. One hit, always lands, 16 rolls at 85–100 %.
  const T11 = {
    "Raichu>Moonblast>Rayquaza": [240, 2], "Raichu>Thunderbolt>Rayquaza": [200, 1], "Rayquaza>Outrage>Raichu": [437, 1],
    "Raichu>Moonblast>Garchomp": [200, 2], "Raichu>Thunderbolt>Garchomp": [170, 1], "Garchomp>Outrage>Raichu": [437, 1],
  };
  const stub = (atk, def, pm) => {
    const row = T11[`${atk.name}>${pm.getName()}>${def.name}`];
    if (!row) return null;
    const [max, e] = row;
    let expected = 0, pKo = 0, uncapped = 0;
    for (let r = 0; r < 16; r++) {
      const d = Math.floor(max * (85 + r) / 100);
      uncapped += d / 16;
      expected += Math.min(d, def.hp) / 16;
      if (d >= def.hp) pKo += 1 / 16;
    }
    return { name: pm.getName(), type: TY[pm.getMove().type], cat: pm.getMove().category ? "special" : "physical",
      e, priority: 0, spread: false, acc: 1, dist: [{ n: 1, p: 1 }], perHit: [{ max, min: Math.floor(max * 0.85) }],
      expected, uncapped, max: Math.min(max, def.hp), pKo,
      traits: { charge: false, semiCharge: false, recharge: false, noRepeat: false }, costs: [], notes: [] };
  };
  const { sceneTurnEndHp, koCurve, koTurns, useOf } = globalThis.__hud["10-damage"];
  const enigma = Object.assign(new ({ BerryModifier: class {} }).BerryModifier(), { berryType: 2, getStackCount: () => 1 });
  const raichu = mon("Raichu", 80, ["Electric"], "Static", [240,120,100,160,110,220],
    [["Moonblast","Fairy",95,"S"],["Thunderbolt","Electric",90,"S"]], true);
  const pick = (foe, held) => {
    const f = Object.assign(Object.create(foe), { getHeldItems: () => (held ? [enigma] : []), getOpponents: () => [raichu] });
    const turn = fakeTurn({
      live: true, wave: 145, turn: 11, party: [raichu], foes: [f],
      trainer: { getName: () => "Ivy", config: { isBoss: false }, isDouble: () => false },
      outcome: stub, heal: (p, o) => sceneTurnEndHp({ field: [] }, p, o),
      moves: e => [{ name: e.moveset[0].getName(), type: TY[e.moveset[0].getMove().type], p: 1, score: 10, targets: [0] }],
    });
    const T = globalThis.__tp.tpTables(turn, [raichu], [f], false);
    const fed = T.foeHeal[0].enigma;
    const pace = Object.fromEntries(turn.outcomes(raichu, f).map(o => [o.name, koTurns(koCurve(turn.mon(f), useOf(o)).by)]));
    return { move: T.ours[0][0], fed, pace };
  };
  const show = x => `${x.move.name} ×${x.move.e} (${Math.round(x.move.dmg)})`;
  // Rayquaza: 428 over three bars, 285 on the second. Either move breaks a bar a turn, and 143 + 107 is out of one
  // Moonblast's reach.
  const ray = mon("Rayquaza", 80, ["Dragon","Flying"], "Air Lock", [428,250,120,250,120,200], [["Outrage","Dragon",120,"P"]], true, 285, 3);
  Object.assign(ray, { bossSegmentIndex: 1 });
  // Garchomp, no boss: Moonblast fells its 300 in two sure turns and Thunderbolt in two most of the time.
  const chomp = mon("Garchomp", 80, ["Dragon","Ground"], "Rough Skin", [300,250,120,250,120,200], [["Outrage","Dragon",120,"P"]], true);
  for (const [foe, why] of [[ray, "bars"], [chomp, "no bars"]]) {
    const bare = pick(foe, false), fed = pick(foe, true);
    console.log(`== the move pick sees the Enigma Berry it feeds (#652), ${why}\n` +
      `pace with nothing fed: ${Object.entries(bare.pace).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}\n` +
      `no berry: ${show(bare)}\nEnigma:   ${show(fed)}, the berry would pay ${fed.fed}`);
    assert.equal(bare.move.name, "Moonblast", `with nothing to feed, Moonblast is at least as fast (${why})`);
    assert.equal(fed.fed, Math.floor(foe.getMaxHp() / 4), "a quarter of its max HP");
    assert.equal(fed.move.name, "Thunderbolt", `the ×1 move hands the berry nothing and is now the faster (${why})`);
  }
}
// The plan eats an Enigma Berry as the game does (#652): on a landed super-effective hit, one a turn while any is left,
// capped before the chip.
{
  const { tpFight } = globalThis.__tp;
  const st = (fh = 200) => fightState({ oh: [400], ob: [0], fh: [fh], fs: [0], fb: [0] });
  const T = (us, them, foeHeal) => ({ ours: [[us]], theirs: [[them]], first: [[0]], ourMax: [400], foeMax: [200], ourHeal: [null], foeHeal: [foeHeal] });
  const enigma = (n, base = 0) => ({ base, sitrus: 0, enigma: 50, enigmas: n });
  // 70 a turn into 200: 130 → 180 → 110 → 40 → down on turn 4 with one berry; the second puts 50 back on turn 2.
  const [one, two] = [1, 2].map(n => tpFight(T({ dmg: 70, e: 2 }, { dmg: 1, e: 1 }, enigma(n)), st(), 0, 0, "free"));
  console.log(`== the plan's Enigma Berry\none berry: down on turn ${one.turns} · two: turn ${two.turns}`);
  assert.deepEqual([one.turns, two.turns], [4, 5], "the second berry is eaten on the second super-effective turn");
  const missed = tpFight(T({ dmg: 70, e: 2, use: [{ r: 0, p: 1 }] }, { dmg: 1, e: 1 }, enigma(1)), st(100), 0, 0, "free");
  assert.equal(missed.fh, 100, `a super-effective move that never lands feeds nothing: ${missed.fh}`);
  // We move first and fall to its reply: one turn, 200 → 190 → 200 with the berry, then 25 of chip.
  const capped = tpFight({ ...T({ dmg: 10, e: 2 }, { dmg: 1000, e: 1 }, enigma(1, -25)) }, st(), 0, 0, "free");
  assert.equal(capped.ends.loss.fh, 175, "the berry caps at max HP before the chip, not after");
  // Hail's 12 comes ahead of the berry: 200 → 195 → 183 → 200.
  const hail = tpFight(T({ dmg: 5, e: 2 }, { dmg: 1000, e: 1 }, { ...enigma(1, -12), pre: -12 }), st(), 0, 0, "free");
  assert.equal(hail.ends.loss.fh, 200, "the berry heals after the weather chip");
  // Ours, against a foe that is ×½ on 60 % of its uses and ×2 on the rest, first, before we fell it.
  const mixed = tpFight({ ...T({ dmg: 1000, e: 1 }, { dmg: 50, e: 0.5, use: [{ r: 0.3, p: 0.6, se: 0 }, { r: 2, p: 0.4, se: 1 }] }, null),
    first: [[1]], ourHeal: [enigma(1)] }, st(), 0, 0, "free");
  assert.ok(Math.abs(mixed.ends.win.mh - (0.6 * 385 + 0.4 * 350)) < 1e-9, `the berry pays on the super-effective share alone: ${mixed.ends.win.mh}`);
}
// An Unnerve blocks the berry in its own pairing, wherever it stands now (#652).
{
  const { sceneTurnEndHp } = globalThis.__hud["10-damage"];
  const stub = outcomeFrom({ "Bisharp>Iron Head>Garchomp": [[100], 1, 2], "Garchomp>Earthquake>Bisharp": [[10], 1, 1] });
  const enigma = Object.assign(new ({ BerryModifier: class {} }).BerryModifier(), { berryType: 2, getStackCount: () => 1 });
  const bisharp = (id, field, extra = {}) => fakeMon("Bisharp", 80, ["Dark", "Steel"], [300, 200, 200, 100, 100, 100], [["Iron Head", "Steel", 80, "P"]], field, undefined, { id, ...extra });
  const party = [bisharp("Unnerve", true, { hasAbilityWithAttr: a => a === "PreventBerryUseAbAttr" }), bisharp("Plain", false)];
  const chomp = fakeMon("Garchomp", 80, ["Dragon", "Fairy"], [300, 200, 200, 100, 100, 50], [["Earthquake", "Ground", 100, "P"]], true, undefined,
    { getHeldItems: () => [enigma], getOpponents: () => [party[0]] });
  const turn = fakeTurn({ live: true, party, foes: [chomp], outcome: stub, heal: (p, o) => sceneTurnEndHp({ field: [] }, p, o),
    moves: e => [{ name: "Earthquake", type: "Ground", p: 1, score: 10, targets: [0] }] });
  const T = globalThis.__tp.tpTables(turn, party, [chomp], false);
  const fight = mi => globalThis.__tp.tpFight(T, fightState({ oh: [300, 300], ob: [0, 0], fh: [300], fs: [0], fb: [0] }), mi, 0, "free");
  const [blocked, eaten] = [0, 1].map(fight);
  console.log(`== an Unnerve in its own pairing\nthe Unnerve on the field fells Garchomp in ${blocked.turns} turns, the one on the bench without it in ${eaten.turns}`);
  assert.equal(T.foeHeal[0].enigma, 75, "the profile keeps the berry an Unnerve on the field would block");
  assert.ok(eaten.turns > blocked.turns, "the pairing without the Unnerve pays for the berry");
}
// The profile's Enigma is the berry's own quarter, whatever heals after it at the turn end.
{
  const { scene: s } = run(null);
  const zard = mon("Charizard", 30, ["Fire","Flying"], "Blaze", [96,60,55,80,60,75], [["Flamethrower","Fire",90,"S"]], true);
  const item = (name, fields = {}) => Object.assign(new ({ [name]: class { getStackCount() { return 1; } } })[name](), fields);
  const held = [item("BerryModifier", { berryType: 2 }), item("TurnHealModifier")];
  const prof = globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, Object.assign(zard, { getHeldItems: () => held })));
  assert.equal(prof.enigma, 24, `a quarter of 96, though Leftovers would top 72 + 24 past max: ${JSON.stringify(prof)}`);
  assert.equal(prof.keep, undefined, "no Berry Pouch, no keep");
  s.modifiers = [item("PreserveBerryModifier")];
  assert.equal(globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, zard)).keep, 0.3, "our Berry Pouch, one stack (#822)");
  const sitrus = Object.create(zard, { getHeldItems: { value: () => [item("BerryModifier", { berryType: 0 })] } });
  const pouched = globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpHealProfile(turn, sitrus));
  assert.deepEqual([pouched.sitrus, pouched.enigmas, pouched.keep], [24, 0, 0.3], `a Sitrus with no Enigma keeps under it too (#847): ${JSON.stringify(pouched)}`);
  delete s.modifiers;
}
// A Berry Pouch keeps our Enigma Berry on part of each feed, so the plan prices more of it (#822). We take 120 a turn
// super-effective into 400 and fell the foe on turn 3, before its third hit. No Pouch: 280 + 100 → 380 → 260.
{
  const { tpFight } = globalThis.__tp;
  const T = keep => ({ ours: [[{ dmg: 100, e: 1 }]], theirs: [[{ dmg: 120, e: 2 }]], first: [[0]], ourMax: [400], foeMax: [300],
    ourHeal: [{ base: 0, sitrus: 0, enigma: 100, enigmas: 1, ...(keep == null ? {} : { keep }) }], foeHeal: [null] });
  const fight = keep => tpFight(T(keep), fightState({ oh: [400], ob: [0], fh: [300], fs: [0], fb: [0] }), 0, 0, "free");
  const [old, none, one, three] = [null, 0, 0.3, 0.9].map(fight);
  console.log(`== a Berry Pouch keeps our Enigma Berry (#822)\nwe win on ${none.ends.win.mh} HP with no Pouch, ` +
    `${one.ends.win.mh.toFixed(1)} with one stack, ${three.ends.win.mh.toFixed(1)} with three`);
  assert.equal(none.ends.win.mh, 260, "no Pouch: one berry on turn 1");
  assert.deepEqual(none, old, "a profile that carries no keep reads as no Pouch");
  assert.ok(one.ends.win.mh > none.ends.win.mh && three.ends.win.mh > one.ends.win.mh, "each stack keeps more of the berry for turn 2");
}
// …and our Sitrus Berry the same, which heals again each turn end below half by the chance it is still held (#847). We
// take 120 a turn into 400 and fell the foe on turn 5, before its fifth hit, and that turn's end still heals us. No
// Pouch: 280 → 160 + 100 → 140 → 20 → 20. One stack: 280 → 160 + 100 → 140 + 30 → 50 + 9 → 59 + 3. Three: 280 →
// 160 + 100 → 140 + 90 → 110 + 81 → 191 + 73.
{
  const { tpFight } = globalThis.__tp;
  const T = keep => ({ ours: [[{ dmg: 100, e: 1 }]], theirs: [[{ dmg: 120, e: 1 }]], first: [[0]], ourMax: [400], foeMax: [500],
    ourHeal: [{ base: 0, pre: 0, sitrus: 100, enigma: 0, ...(keep == null ? {} : { keep }) }], foeHeal: [null] });
  const fight = keep => tpFight(T(keep), fightState({ oh: [400], ob: [0], fh: [500], fs: [0], fb: [0] }), 0, 0, "free");
  const [old, none, one, three] = [null, 0, 0.3, 0.9].map(fight);
  const near = (x, want, msg) => assert.ok(Math.abs(x - want) < 1e-9, `${msg}: ${x}`);
  console.log(`== a Berry Pouch keeps our Sitrus Berry (#847)\nwe win on ${none.ends.win.mh} HP with no Pouch, ` +
    `${one.ends.win.mh.toFixed(1)} with one stack, ${three.ends.win.mh.toFixed(1)} with three`);
  assert.deepEqual([none, one, three].map(r => [r.pWin, r.ends.win.turns]), [[1, 5], [1, 5], [1, 5]], "a sure win on turn 5");
  assert.equal(none.ends.win.mh, 20, "no Pouch: one berry on turn 2");
  assert.deepEqual(none, old, "a profile that carries no keep reads as no Pouch");
  near(one.ends.win.mh, 62, "one stack");
  near(three.ends.win.mh, 264, "three stacks");
}
// A bench mon the trainer Teras (#648, Gordie W180): Coalossal's team index is in `instantTeras`, so the plan prices our
// hits at Tera Rock, Water ×2 — it Teras at its first FIGHT command, before anything hits it once sent in after a KO —
// while the trainer scores it for that send-in at its Fire/Rock (game-code.md §7). Coalossal sits in slot 1 carrying
// team index 5, the W180 party's T5 order, so only `shouldTera` finds it.
{
  const water = mon("Blastoise", 100, ["Water"], "Torrent", [300,200,260,230,270,180], [["Hydro Pump","Water",110,"S"]], true);
  const lead = mon("Barbaracle", 100, ["Rock","Water"], "Tough Claws", [300,240,200,120,160,180], [["Razor Shell","Water",75,"P"]], true);
  const coal = mon("Coalossal", 100, ["Fire","Rock"], "Steam Engine", [300,180,240,180,240,100], [["Stone Edge","Rock",100,"P"]], false);
  const base = coal.getTypes();
  Object.assign(coal, { getTeraType: () => TY.indexOf("Rock"), getTypes: () => (coal.isTerastallized ? [TY.indexOf("Rock")] : base) });
  Object.assign(lead, { initialTeamIndex: 0 });
  Object.assign(coal, { initialTeamIndex: 5 });
  const instantTeras = [5];
  const pricedAt = teras => {
    const { scene: s } = run("CommandPhase", { party: [water], foes: [lead, coal] });
    Object.assign(s.currentBattle.trainer, {
      config: { ...s.currentBattle.trainer.config, trainerAI: { instantTeras } },
      shouldTera: m => teras && !m.isTerastallized && instantTeras.includes(m.initialTeamIndex),
    });
    const T = globalThis.__tp.readTurn(s, turn => globalThis.__tp.tpTables(turn, [water], [coal], false));
    return { e: T.ours[0][0].e, send: T.send[0][0].base };
  };
  const [plain, tera] = [pricedAt(false), pricedAt(true)];
  console.log(`== an instant Tera on the bench (#648)\nHydro Pump into Coalossal: ×${plain.e} as Fire/Rock, ×${tera.e} at Tera Rock`);
  assert.equal(plain.e, 4, "Fire/Rock takes Water ×4");
  assert.equal(tera.e, 2, "its team index in instantTeras prices our hits at Tera Rock, slot 1 and all");
  assert.equal(tera.send, plain.send, "and its send-in score at the Fire/Rock it is sent in at");
  assert.equal(coal.isTerastallized, undefined, "and the flag is off again afterwards");
}
console.log("ok");
