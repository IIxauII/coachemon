// The card stream, through the script the extension actually ships (§11.1): `hudScript(bundle("hud"))` stamped with a
// build id, run against a mocked page, with every `document` event captured. The relay's own validators judge what
// came out, so a detail the extension would drop fails here instead of on a live tab (§9.5).
import assert from "node:assert";
import { bundle } from "../hud-bundle.mjs";
import { hudScript, stamp } from "../../../../extension/src/build/artifact.ts";
import { EVENT, GROUP_IDS, cardBody, coachErrorBody } from "../../../../extension/src/relay/channel.ts";

// The strip is two lines, then an ellipsis — about 115 characters at reference width — and **the leading clause must
// fit**; what follows the first ` · ` may clip, because it is reasoning and not the call (#349 §6). The clamp only
// ever eats the end, so what CI can hold is the clause, and this is where it is held: every act summary that reaches
// the wire is one the strip drew.
const CLAUSE_BUDGET = 115;

/**
 * What every card detail on the wire has to be (#361): the relay's gate, `groups` flattened, and `text` the
 * projection of `groups` in the fixed tab order — each group headed by its label and its summary, `act` by its
 * summary alone, then its rows one per line — so the two cannot disagree by construction.
 */
const wireOk = card => {
  const body = cardBody(card);
  assert.notEqual(body, null, `the relay refuses this detail: ${JSON.stringify(card)}`);
  const ids = body.groups.map(g => g.id);
  assert.deepEqual(ids, ids.slice().sort((a, b) => GROUP_IDS.indexOf(a) - GROUP_IDS.indexOf(b)), "the groups come in the fixed tab order");
  assert.equal(ids[0], "act", "every card leads with act");
  // Pre-flattened: nodes cannot cross a wire, so a row is already the one line it reads as.
  for (const g of body.groups) for (const r of g.rows) assert.equal(typeof r, "string", `${g.id} row is not flattened: ${JSON.stringify(r)}`);
  // The heading law restated by hand rather than imported from the panel: projecting the groups with the panel's own
  // projection would assert the function equals itself. This is the second opinion, and the golden's text below is
  // the third — a change to the law has to be made here as well as in `90-render.js`, deliberately.
  const heading = g => (g.id === "act" ? g.summary : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;
  const projected = body.groups.map(g => [heading(g), ...g.rows].filter(Boolean).join("\n")).filter(Boolean).join("\n");
  assert.equal(body.text, projected, "the text is the projection of the groups and nothing else");
  const call = body.groups[0].summary;
  assert.equal(body.text.split("\n")[0], call, "the first line of the text is the act summary");
  // The strip's budget, held on the clause alone.
  const clause = call.split(" · ")[0];
  assert.ok(clause.length <= CLAUSE_BUDGET, `the act summary's leading clause is ${clause.length} > ${CLAUSE_BUDGET}: ${clause}`);
  return body;
};

const BUILD = "0.0.0+cafef00dbeef";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const mv = ([n, t, p, c, a = 100]) => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: 3, isChargingMove: () => false, attrs: [] });
const pk = (name, types, atk, spa, moves) => ({ name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })) });

const charmeleon = pk("Charmeleon", ["Fire"], 64, 80, [["Tackle","Normal",40,"P"],["Ember","Fire",40,"S"],["Dragon Breath","Dragon",60,"S"],["Scratch","Normal",40,"P"]]);
// The learn-move prompt: the card, its key and its call all come off this one screen.
const learnScene = move => ({
  currentBattle: { waveIndex: 12, double: false },
  ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(move) }) },
  getEnemyParty: () => [], getPlayerParty: () => [charmeleon],
});

// ---- The page: a DOM that remembers tag names (the text rendering reads them), and a captured event channel.
let scene = learnScene(["Flamethrower","Fire",90,"S"]);
let el = null, ticker = null;
const events = [];
// Every node the panel makes, counted: what proves the card is drawn once per refresh rather than again per read.
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
};
globalThis.setInterval = fn => { ticker = fn; return 0; };
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };

eval(stamp(hudScript(bundle("hud")), BUILD));
const tick = () => ticker();

/** Every event of one kind, decoded the way the relay decodes it, with its build id checked as the relay checks it. */
const seen = name => events.filter(e => e.type === name).map(e => {
  const detail = JSON.parse(e.detail);
  assert.equal(detail.build, BUILD, "every detail carries this build's id");
  return detail;
});
const cards = () => seen(EVENT.card);
const errors = () => seen(EVENT.coachError);
const drawn = () => (el.kids ?? []).map(function text(n) {
  return n == null ? "" : typeof n === "string" ? n : n.children && n.children.length ? n.children.map(text).join(" ") : String(n.textContent ?? "");
});

// ---- One event per decision, deduplicated on key and verdict
{
  assert.equal(cards().length, 1, "the first refresh pushes the card it drew");
  const card = cards()[0];
  const body = wireOk(card);
  assert.equal(body.kind, "learn");
  assert.equal(body.key, "12|Charmeleon|Flamethrower");
  assert.equal(body.wave, 12);
  console.log(`verdict ${body.verdict}`);
  // The groups as the agent reads them: a decision by name, not by line.
  for (const g of body.groups) console.log(`group ${g.id} | ${g.label} | ${g.summary ?? "—"} | rows ${g.rows.length}`);
  console.log(`text\n${body.text}`);
  // The text is the card the panel drew, not the panel's own footer.
  assert.ok(body.text.includes("Flamethrower"), body.text);
  assert.ok(!/Unofficial\./.test(body.text), "the disclaimer is the panel's footer, never a card's text");

  // A late joiner reads the very event it missed: `card()` is the `card` command's answer (§11.1, §11.4).
  const made0 = made;
  assert.deepEqual(window.__coachHud.card(), { kind: body.kind, key: body.key, wave: body.wave, verdict: body.verdict, groups: body.groups, text: body.text });
  // **The groups are built once per fire and both projections come off them** (#361 §5): the read that follows the
  // refresh draws no card of its own, where the stream used to draw one to say what it said.
  assert.equal(made, made0, `the card read drew ${made - made0} nodes of its own`);

  tick();
  assert.equal(cards().length, 1, "the same card again is not a second event");

  scene = learnScene(["Fire Blast","Fire",110,"S"]);
  tick();
  assert.equal(cards().length, 2, "a new move on offer is a new decision");
  assert.equal(cards()[1].key, "12|Charmeleon|Fire Blast");

  // A refresh with nothing to coach between two looks at the same card is not a second event.
  scene = { currentBattle: null, ui: { getMode: () => 0, getHandler: () => ({}) }, getEnemyParty: () => [], getPlayerParty: () => [] };
  tick();
  scene = learnScene(["Fire Blast","Fire",110,"S"]);
  tick();
  assert.equal(cards().length, 2, "the same card after an empty refresh is not re-sent");
  console.log("dedupe ok");
}

// ---- A verdict that changes mid-wave is a new event under the same key (§11.1)
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
    return { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, ...foes],
      currentBattle: { waveIndex: 20, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1 },
      ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  };
  const before = cards().length;
  scene = battle(false);
  tick();
  scene = battle(true);
  tick();
  const wave = cards().slice(before);
  assert.deepEqual(wave.map(c => [c.kind, c.key, c.verdict]), [["battle", "20", "easy"], ["battle", "20", "danger"]]);
  // Every card on the wire, not only the first: a battle card carries more groups than a learn card does.
  for (const c of wave) console.log(`groups ${wireOk(c).groups.map(g => g.id).join(" ")}`);
  console.log(`mid-wave ${wave.map(c => c.verdict).join(" → ")}`);
}

// ---- The panel carries the disclaimer, once, as its last line (§3)
{
  const lines = drawn();
  assert.equal(lines.filter(l => /^Unofficial\./.test(l)).length, 1, JSON.stringify(lines));
  console.log(`footer ${lines[lines.length - 1]}`);
}

// ---- A failed refresh: one event per distinct message
{
  const before = cards().length;
  // The scene goes out from under the panel, the way a page reload takes it.
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
