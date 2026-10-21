import assert from "node:assert";
import { bundle } from "../hud-bundle.mjs";
import { hudScript, stamp } from "../../../../extension/src/build/artifact.ts";
import { EVENT, GROUP_IDS, cardBody, coachErrorBody } from "../../../../extension/src/relay/channel.ts";
import { UiMode } from "../../../../src/enums/generated.ts";
import { cat, TY } from "./fake-mon.mjs";

// The strip's two lines at reference width: only the act summary's leading clause must fit (#349).
const CLAUSE_BUDGET = 115;

const wireOk = card => {
  const body = cardBody(card);
  assert.notEqual(body, null, `the relay refuses this detail: ${JSON.stringify(card)}`);
  const ids = body.groups.map(g => g.id);
  assert.deepEqual(ids, ids.slice().sort((a, b) => GROUP_IDS.indexOf(a) - GROUP_IDS.indexOf(b)), "the groups come in the fixed tab order");
  assert.equal(ids[0], "act", "every card leads with act");
  for (const g of body.groups) for (const r of g.rows) assert.equal(typeof r, "string", `${g.id} row is not flattened: ${JSON.stringify(r)}`);
  // Restated by hand, not imported from `90-render.js`: a change to the heading law is made in both, deliberately.
  const heading = g => (g.id === "act" ? g.summary : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;
  const projected = body.groups.map(g => [heading(g), ...g.rows].filter(Boolean).join("\n")).filter(Boolean).join("\n");
  assert.equal(body.text, projected, "the text is the projection of the groups and nothing else");
  const call = body.groups[0].summary;
  assert.equal(body.text.split("\n")[0], call, "the first line of the text is the act summary");
  const clause = call.split(" · ")[0];
  assert.ok(clause.length <= CLAUSE_BUDGET, `the act summary's leading clause is ${clause.length} > ${CLAUSE_BUDGET}: ${clause}`);
  return body;
};

const BUILD = "0.0.0+cafef00dbeef";
const mv = ([n, t, p, c, a = 100]) => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: 3, isChargingMove: () => false, attrs: [] });
const pk = (name, types, atk, spa, moves) => ({ name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })) });

const charmeleon = pk("Charmeleon", ["Fire"], 64, 80, [["Tackle","Normal",40,"P"],["Ember","Fire",40,"S"],["Dragon Breath","Dragon",60,"S"],["Scratch","Normal",40,"P"]]);
// Each scene is a new decision to the watch: a fresh phase object, or a fresh battle.
const learnScene = move => ({
  phaseManager: { getCurrentPhase: (ph => () => ph)({ phaseName: "LearnMovePhase", partyMemberIndex: 0, moveId: -1 }) },
  currentBattle: { waveIndex: 12, double: false },
  ui: { mode: 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(move) }) },
  getEnemyParty: () => [], getPlayerParty: () => [charmeleon],
});

// Nodes keep their tag name: the text rendering reads it.
let scene = learnScene(["Flamethrower","Fire",90,"S"]);
let el = null, ticker = null;
const events = [];
let made = 0;
const node = tag => {
  made++;
  const n = { tagName: tag, style: {}, children: [], title: "",
    addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; n.children = k; } };
  return n;
};
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.document = {
  documentElement: { dataset: {} },
  body: { appendChild: e => (el = e) },
  createElement: node,
  dispatchEvent: e => { events.push(e); return true; },
  addEventListener() {},
  removeEventListener() {},
};
globalThis.setInterval = fn => { ticker = fn; return 0; };
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };

eval(stamp(hudScript(bundle("hud")), BUILD));
const tick = () => ticker();

const seen = name => events.filter(e => e.type === name).map(e => {
  const detail = JSON.parse(e.detail);
  assert.equal(detail.build, BUILD, "every detail carries this build's id");
  return detail;
});
const cards = () => seen(EVENT.card);
const errors = () => seen(EVENT.coachError);

// ---- One event per decision, deduplicated on key and verdict
{
  assert.equal(cards().length, 1, "the first refresh pushes the card it drew");
  const card = cards()[0];
  const body = wireOk(card);
  assert.equal(body.kind, "learn");
  assert.equal(body.key, "12|Charmeleon|Flamethrower");
  assert.equal(body.wave, 12);
  console.log(`verdict ${body.verdict}`);
  for (const g of body.groups) console.log(`group ${g.id} | ${g.label} | ${g.summary ?? "—"} | rows ${g.rows.length}`);
  console.log(`text\n${body.text}`);
  assert.ok(body.text.includes("Flamethrower"), body.text);

  // `card()` answers the `card` command with the event a late joiner missed (extension-distribution.md §11.4).
  const made0 = made;
  assert.deepEqual(window.__coachHud.card(), { kind: body.kind, key: body.key, wave: body.wave, verdict: body.verdict, groups: body.groups, text: body.text, oracleLine: null, randomized: false });
  assert.equal(made, made0, `the card read drew ${made - made0} nodes of its own`);

  tick();
  assert.equal(cards().length, 1, "the same card again is not a second event");

  scene = learnScene(["Fire Blast","Fire",110,"S"]);
  tick();
  assert.equal(cards().length, 2, "a new move on offer is a new decision");
  assert.equal(cards()[1].key, "12|Charmeleon|Fire Blast");

  scene = { currentBattle: null, ui: { mode: 0, getHandler: () => ({}) }, getEnemyParty: () => [], getPlayerParty: () => [] };
  tick();
  scene = learnScene(["Fire Blast","Fire",110,"S"]);
  tick();
  assert.equal(cards().length, 2, "the same card after an empty refresh is not re-sent");
  console.log("dedupe ok");
}

// ---- A verdict that changes mid-wave is a new event under the same key (extension-distribution.md §11.1)
{
  const fighter = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, boss) => ({
    id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
    name, level: lv, hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "Blaze" }), hasPassive: () => false,
    getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => true, isBoss: () => boss,
    getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
    moveset: moves.map(([n, t, p, c]) => ({ getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: 3 }), getMovePp: () => 10, ppUsed: 0 })),
  });
  const party = [fighter("Charizard", 50, ["Fire","Flying"], [160,100,90,130,100,120], [["Flamethrower","Fire",90,"S"]], false)];
  const battle = boss => {
    const foes = [fighter("Paras", 20, ["Bug","Grass"], [50,40,40,30,40,20], [["Scratch","Normal",40,"P"]], boss)];
    for (const f of foes) f.getOpponents = () => party;
    return { phaseManager: { getCurrentPhase: () => ({ phaseName: "SelectTargetPhase", fieldIndex: 0 }) }, getField: () => [...party, ...foes],
      currentBattle: { waveIndex: 20, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, turnCommands: {} },
      ui: { mode: 5, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  };
  const before = cards().length;
  scene = battle(false);
  tick();
  scene = battle(true);
  tick();
  const wave = cards().slice(before);
  assert.deepEqual(wave.map(c => [c.kind, c.key, c.verdict]), [["battle", "20", "easy"], ["battle", "20", "danger"]]);
  for (const c of wave) console.log(`groups ${wireOk(c).groups.map(g => g.id).join(" ")}`);
  console.log(`mid-wave ${wave.map(c => c.verdict).join(" → ")}`);
  assert.deepEqual(wave.map(c => c.oracleLine), [null, null], "no oracle line held, none carried");

  // ---- The card event carries the oracle line's state, the relay admits it, and each turn the oracle line leads is an event of its own
  party[0].species.speciesId = 6;
  party[0].moveset[0].moveId = 53;
  party[0].moveset[0].getMove = () => ({ name: "Flamethrower", type: TY.indexOf("Fire"), power: 90, category: cat.S, moveTarget: 3 });
  const onTurn = (turn, phase) => {
    const s = battle(false);
    s.seed = "eventSeed";
    s.currentBattle.turn = turn;
    if (phase) Object.assign(s, { phaseManager: { getCurrentPhase: () => phase }, ui: { mode: UiMode.PARTY, getHandler: () => ({}) } });
    return s;
  };
  const mon = (species, hp) => ({ slot: 0, species, onField: true, hp, maxHp: 100, status: 0, statStages: [0, 0, 0, 0, 0, 0, 0], tera: false });
  const line = { seed: "eventSeed", wave: 20, gameVersion: "1.12.0.11", receipt: [], luck: [],
    steps: [1, 2].map(turn => ({ turn, input: { kind: "move", move: 53, tera: false, ...(turn === 1 && { replacement: { slot: 0, species: 6 } }) },
      checkpoint: { ours: [mon(6, 100)], foes: [mon(46, 50 * (2 - turn))] } })) };
  const from = cards().length;
  scene = onTurn(1);
  tick();
  assert.deepEqual(window.__coachHud.oracleLine(line), { ok: true });
  // The faint prompt is still turn 1's step, and its pick is a call of its own.
  scene = onTurn(2, { phaseName: "SwitchPhase", isModal: true, doReturn: false });
  tick();
  scene = onTurn(2);
  tick();
  tick();
  const onLine = cards().slice(from);
  for (const c of onLine) console.log(`oracle line ${JSON.stringify(c.oracleLine)} | ${wireOk(c).groups[0].summary}`);
  assert.deepEqual(onLine.map(c => c.oracleLine),
    [null, { state: "on", turn: 1, of: 2 }, { state: "on", turn: 1, of: 2 }, { state: "on", turn: 2, of: 2 }]);
  assert.equal(onLine[2].groups[0].summary, "⚔ ~ T1/2 · send Charizard");
  assert.equal(onLine[3].groups[0].summary, "⚔ ~ T2/2 · Charizard Flamethrower");
  assert.deepEqual(window.__coachHud.card().oracleLine, { state: "on", turn: 2, of: 2 }, "the card read carries it too");

  // ---- Off the line the card event says so from the miss on, the relay admits it, and the checkpoint is journalled
  // Only a command prompt scores; the target prompt after it is the decision whose verdict turns to danger.
  const at = (turn, phaseName, boss) => {
    const s = battle(boss);
    s.seed = "eventSeed";
    s.currentBattle.turn = turn;
    s.phaseManager = { getCurrentPhase: (ph => () => ph)({ phaseName, fieldIndex: 0 }) };
    return s;
  };
  const fromOff = cards().length;
  scene = at(3, "CommandPhase", false);
  tick();
  tick();
  scene = at(3, "SelectTargetPhase", true);
  tick();
  const offLine = cards().slice(fromOff);
  for (const c of offLine) console.log(`off the line ${JSON.stringify(c.oracleLine)} | ${c.verdict} | ${wireOk(c).groups[0].summary}`);
  assert.deepEqual(offLine.map(c => c.oracleLine), [{ state: "off", turn: 2, of: 2 }, { state: "off", turn: 2, of: 2 }],
    "the miss is one event, and a later card of the fight still carries it");
  assert.ok(offLine[0].groups[0].summary.startsWith("off the line · ~ re-solving…"), offLine[0].groups[0].summary);
  assert.deepEqual(window.__coachHud.card().oracleLine, { state: "off", turn: 2, of: 2 }, "the card read carries it too");
  const journalled = window.__coachHud.journal().filter(e => e.kind === "checkpoint");
  console.log(`journalled ${journalled.map(e => `T${e.turn} ${e.matched ? "match" : `miss ${e.misses.map(m => m.name).join(", ")}`} on ${e.card.groups[0].summary}`).join("; ")}`);
  assert.deepEqual(journalled.map(e => [e.wave, e.turn, e.matched]), [[20, 2, false]]);
  assert.deepEqual(journalled[0].card.oracleLine, { state: "on", turn: 2, of: 2 }, "the card journalled is the one the step was played from");
  assert.notEqual(cardBody({ build: BUILD, ...journalled[0].card, text: "" }), null, "it is the card in the shape the wire carries, less its text");
}

// ---- A failed refresh: one event per distinct message
{
  const before = cards().length;
  globalThis.Phaser.Display.Canvas.CanvasPool.pool[0].parent.game.scene.getScene = () => {
    throw new Error("scene gone");
  };
  tick();
  const failed = errors();
  assert.equal(failed.length, 1, JSON.stringify(failed));
  assert.notEqual(coachErrorBody(failed[0]), null, "the relay forwards the coach error");
  tick();
  assert.equal(errors().length, 1, "the same failure again is not a second event");
  assert.equal(cards().length, before, "a failed refresh pushes no card");
  console.log(`coach error ${failed[0].message.split("\n")[0].slice(0, 40)}`);
}
