import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { MoveId, PokemonType, SpeciesId } from "../../../../src/enums/generated.ts";
import { GORDIE_LINE, GORDIE_SEED } from "../../../../src/game/fixtures/oracle-line.ts";
import { pageLine } from "../../../../src/game/oracle-line.ts";

let scene = null;
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud", { expose: true }));
const { oracleLineModel } = globalThis.__hud["57-oracle-line"];
const { cardSummary } = globalThis.__hud["60-card"];
const { flatGroups } = globalThis.__hud["90-render"];
const { drawBattle } = globalThis.__hud["96-render-battle"];

const LINE = pageLine(GORDIE_LINE);

const move = (key, name, type) => ({ moveId: MoveId[key], getMove: () => ({ id: MoveId[key], name, type: PokemonType[type] }) });
const mon = (key, name, hp, { field = false, moves = [], tera = null } = {}) => ({
  species: { speciesId: SpeciesId[key] }, name, hp, isOnField: () => field, moveset: moves,
  getTeraType: () => (tera ? PokemonType[tera] : PokemonType.UNKNOWN),
});
// Gordie's W180 as the game holds it on `turn`: who is in front is whoever the line put there by then.
const at = (turn, { wave = 180, seed = GORDIE_SEED } = {}) => {
  const front = turn <= 11 ? "RESHIRAM" : turn <= 13 ? "LEAVANNY" : turn <= 15 ? "GOLBAT" : "GYARADOS";
  const party = [
    mon("GYARADOS", "Gyarados", 570, { field: front === "GYARADOS", moves: [move("HYDRO_PUMP", "Hydro Pump", "WATER")], tera: "WATER" }),
    mon("PROBOPASS", "Probopass", 359),
    mon("SNORLAX", "Snorlax", 824),
    mon("RESHIRAM", "Reshiram", 577, { field: front === "RESHIRAM", moves: [move("DRAGON_PULSE", "Dragon Pulse", "DRAGON")] }),
    mon("LEAVANNY", "Leavanny", 280, { field: front === "LEAVANNY", moves: [move("LEAF_STORM", "Leaf Storm", "GRASS"), move("BUG_BITE", "Bug Bite", "BUG")] }),
    mon("GOLBAT", "Golbat", 493, { field: front === "GOLBAT", moves: [move("TOXIC", "Toxic", "POISON"), move("VENOSHOCK", "Venoshock", "POISON")] }),
  ];
  const foes = [["GIGALITH", "Gigalith"], ["CARRACOSTA", "Carracosta"], ["COALOSSAL", "Coalossal"], ["STONJOURNER", "Stonjourner"],
    ["BARBARACLE", "Barbaracle"], ["TYRANITAR", "Tyranitar"]].map(([key, name]) => mon(key, name, 100));
  return { seed, currentBattle: { waveIndex: wave, turn }, getPlayerParty: () => party, getEnemyParty: () => foes };
};

// The card's own read of the turn and of the fight, which the line stands in for in the `plan` group alone.
const card = oracleLine => ({
  kind: "battle", wave: 180, title: "W180", trainer: true, double: false, verdict: "trainer",
  field: { slots: [{ icon: null, name: "Golbat", move: "Venoshock", type: "Poison", target: { icon: null, name: "Tyranitar" }, ko: 3, koEach: null,
    threat: null, notes: [], enter: false }], switches: [], optional: [], freeSwitch: false, noSafeSwitch: false, targeting: null, freeEntry: null, nextIn: null },
  rows: [], enemySwitches: [], ifStay: null, order: [], team: [], moveTypes: ["Poison"], weak: [],
  teamPlan: { result: "lost", win: null, reserve: [], only: [], sacrifice: [], prefers: null, notes: [], warnings: ["likely lost: nothing outlasts Tyranitar"],
    steps: [{ send: { icon: null, name: "Golbat" }, entry: null, move: "Venoshock", type: "Poison", vs: { icon: null, name: "Tyranitar" }, why: "chips it", sacrifice: false }] },
  catch: null, preview: null, ahead: null, oracleLine,
});

const plan = (label, s) => {
  const c = card(oracleLineModel(s));
  const g = flatGroups(drawBattle(c)).find(x => x.id === "plan");
  console.log(`== ${label}`);
  console.log(`${g.label} | ${g.summary}`);
  for (const r of g.rows) console.log(`    ${r}`);
  return { rows: g.rows, summary: g.summary, card: c };
};
const marks = rows => rows.map(r => [...r][0]).join("");
const hand = (label, line) => {
  const r = __coachHud.oracleLine(line);
  console.log(`${label.padEnd(40)}${r.ok ? "held" : r.why}`);
  return r;
};

// ---- Only the fight on screen keeps a line: one keyed to another seed or wave is ignored, held line or not
{
  console.log("== the handoff");
  scene = at(15);
  hand("another run's seed", { ...LINE, seed: "x9AbQ" });
  hand("the wave after", { ...LINE, wave: 181 });
  hand("a line with no steps", { ...LINE, steps: [] });
  assert.equal(oracleLineModel(scene), null, "nothing ignored is held");
  assert.equal(hand("Gordie's W180", LINE).ok, true);
  assert.equal(hand("another run's seed, with one held", { ...LINE, seed: "x9AbQ" }).ok, false);
  assert.equal(oracleLineModel(scene).steps[0].turn, 11, "the ignored line left the held one as it was");
}

// ---- The plan group draws the line in place of the fight plan: ✓ for turns played, ▸ for this one, · for the rest
{
  const { rows, summary, card: c } = plan("W180 T15", at(15));
  assert.equal(marks(rows), "✓✓✓✓▸····");
  assert.equal(summary, "~ line wins in 9 turns · 4 of 6 left");
  assert.equal(cardSummary(c).plan, summary, "the summary's plan is the line's too");
  assert.ok(!rows.some(r => r.includes("chips it")), "none of the fight plan's own steps");
}
{
  const { rows } = plan("W180 T11, the line's first turn", at(11));
  assert.equal(marks(rows), "▸········");
}
{
  const { rows } = plan("W180 T19, its last", at(19));
  assert.equal(marks(rows), "✓✓✓✓✓✓✓✓▸");
}

// ---- Off the line's fight the card's own fight plan is back
{
  scene = at(1, { wave: 181 });
  const { rows, summary } = plan("W181", scene);
  assert.ok(summary.startsWith("likely lost"), summary);
  assert.ok(rows.some(r => r.includes("chips it")));
}

// ---- A line that opens on a move names who plays it only when it was handed on that turn
{
  const fromT12 = { ...LINE, steps: LINE.steps.slice(1) };
  scene = at(12);
  hand("from T12, handed on T12", fromT12);
  const onTime = plan("handed on T12, at T12", scene).rows;
  assert.match(onTime[0], /^▸ T12 Leavanny /);
  scene = at(13);
  hand("from T12, handed on T13", fromT12);
  const late = plan("handed on T13, at T13", scene).rows;
  assert.match(late[0], /^✓ T12 Grass Leaf Storm/);
}
