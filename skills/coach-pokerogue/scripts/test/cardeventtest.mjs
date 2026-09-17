// The card stream, through the script the extension actually ships (§11.1): `hudScript(bundle("hud"))` stamped with a
// build id, run against a mocked page, with every `document` event captured. The relay's own validators judge what
// came out, so a detail the extension would drop fails here instead of on a live tab (§9.5).
import assert from "node:assert";
import { bundle } from "../hud-bundle.mjs";
import { hudScript, stamp } from "../../../../extension/src/build/artifact.ts";
import { EVENT, cardBody, coachErrorBody } from "../../../../extension/src/relay/channel.ts";

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
const node = tag => {
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
  const body = cardBody(card);
  assert.notEqual(body, null, `the relay refuses this detail: ${JSON.stringify(card)}`);
  assert.equal(body.kind, "learn");
  assert.equal(body.key, "12|Charmeleon|Flamethrower");
  assert.equal(body.wave, 12);
  console.log(`verdict ${body.verdict}`);
  console.log(`text\n${body.text}`);
  // The text is the card the panel drew, not the panel's own footer.
  assert.ok(body.text.includes("Flamethrower"), body.text);
  assert.ok(!/Unofficial\./.test(body.text), "the disclaimer is the panel's footer, never a card's text");

  // A late joiner reads the very event it missed: `card()` is the `card` command's answer (§11.1, §11.4).
  assert.deepEqual(window.__coachHud.card(), { kind: body.kind, key: body.key, wave: body.wave, verdict: body.verdict, text: body.text });

  tick();
  assert.equal(cards().length, 1, "the same card again is not a second event");

  scene = learnScene(["Fire Blast","Fire",110,"S"]);
  tick();
  assert.equal(cards().length, 2, "a new move on offer is a new decision");
  assert.equal(cards()[1].key, "12|Charmeleon|Fire Blast");
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
  console.log(`mid-wave ${wave.map(c => c.verdict).join(" → ")}`);
}

// ---- The full view carries the disclaimer, once, as its last line (§3)
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
