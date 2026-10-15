import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { MoveId, PokemonType, SpeciesId } from "../../../../src/enums/generated.ts";
import { GORDIE_LINE, GORDIE_SEED } from "../../../../src/game/fixtures/oracle-line.ts";
import { pageOracleLine } from "../../../../src/game/oracle-line.ts";
import { guard, writes } from "./game-writes.mjs";

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

const LINE = pageOracleLine(GORDIE_LINE);

const move = (key, name, type) => ({ moveId: MoveId[key], getMove: () => ({ id: MoveId[key], name, type: PokemonType[type] }) });
const mon = (key, name, hp, { field = false, moves = [], tera = null } = {}) => ({
  species: { speciesId: SpeciesId[key] }, name, hp, isOnField: () => field, moveset: moves,
  getTeraType: () => (tera ? PokemonType[tera] : PokemonType.UNKNOWN),
});
// Gordie's W180 as the game holds it on `turn`: who is in front is whoever the oracle line put there by then.
const at = (turn, { wave = 180, seed = GORDIE_SEED, phase = { phaseName: "CommandPhase" } } = {}) => {
  const front = turn <= 11 ? "RESHIRAM" : turn <= 13 ? "LEAVANNY" : turn <= 15 ? "GOLBAT" : "GYARADOS";
  const party = [
    mon("GYARADOS", "Gyarados", 570, { field: front === "GYARADOS", moves: [move("HYDRO_PUMP", "Hydro Pump", "WATER"), move("BOUNCE", "Bounce", "FLYING")], tera: "WATER" }),
    mon("PROBOPASS", "Probopass", 359),
    mon("SNORLAX", "Snorlax", 824),
    mon("RESHIRAM", "Reshiram", 577, { field: front === "RESHIRAM", moves: [move("DRAGON_PULSE", "Dragon Pulse", "DRAGON")] }),
    mon("LEAVANNY", "Leavanny", 280, { field: front === "LEAVANNY", moves: [move("LEAF_STORM", "Leaf Storm", "GRASS"), move("BUG_BITE", "Bug Bite", "BUG")] }),
    mon("GOLBAT", "Golbat", 493, { field: front === "GOLBAT", moves: [move("TOXIC", "Toxic", "POISON"), move("VENOSHOCK", "Venoshock", "POISON")] }),
  ];
  const foes = [["GIGALITH", "Gigalith"], ["CARRACOSTA", "Carracosta"], ["COALOSSAL", "Coalossal"], ["STONJOURNER", "Stonjourner"],
    ["BARBARACLE", "Barbaracle"], ["TYRANITAR", "Tyranitar"]].map(([key, name]) => mon(key, name, 100));
  return guard({ seed, currentBattle: { waveIndex: wave, turn }, phaseManager: { getCurrentPhase: () => phase },
    getPlayerParty: () => party, getEnemyParty: () => foes });
};

// The card's own read of the turn and of the fight, which the oracle line stands in for in the `plan` group alone.
const card = (oracleLine, over = {}) => ({
  kind: "battle", wave: 180, title: "W180", trainer: true, double: false, verdict: "trainer",
  field: { slots: [{ icon: null, name: "Golbat", move: "Venoshock", type: "Poison", target: { icon: null, name: "Tyranitar" }, ko: 3, koEach: null,
    threat: null, notes: [], enter: false }], switches: [], optional: [], freeSwitch: false, noSafeSwitch: false, targeting: null, freeEntry: null, nextIn: null },
  rows: [], enemySwitches: [], ifStay: null, order: [], team: [], moveTypes: ["Poison"], weak: [],
  teamPlan: { result: "lost", win: null, reserve: [], only: [], sacrifice: [], prefers: null, notes: [], warnings: ["likely lost: nothing outlasts Tyranitar"],
    steps: [{ send: { icon: null, name: "Golbat" }, entry: null, move: "Venoshock", type: "Poison", vs: { icon: null, name: "Tyranitar" }, why: "chips it", sacrifice: false }] },
  catch: null, preview: null, ahead: null, oracleLine, ...over,
});

const plan = (label, s, over) => {
  const c = card(oracleLineModel(s), over);
  const groups = flatGroups(drawBattle(c));
  const g = groups.find(x => x.id === "plan");
  console.log(`== ${label}`);
  console.log(`${g.label} | ${g.summary}`);
  for (const r of g.rows) console.log(`    ${r}`);
  return { rows: g.rows, summary: g.summary, card: c, groups };
};
const marks = rows => rows.map(r => [...r][0]).join("");
const hand = (label, line) => {
  const r = __coachHud.oracleLine(line);
  console.log(`${label.padEnd(40)}${r.ok ? "held" : r.why}`);
  return r;
};

// ---- Only the fight on screen keeps an oracle line: one for another seed or wave, or one out of shape, is ignored, held one or not
{
  console.log("== the handoff");
  scene = at(15);
  hand("another run's seed", { ...LINE, seed: "x9AbQ" });
  hand("the wave after", { ...LINE, wave: 181 });
  hand("no steps", { ...LINE, steps: [] });
  hand("its turns out of order", { ...LINE, steps: [LINE.steps[1], LINE.steps[0]] });
  assert.equal(oracleLineModel(scene), null, "nothing ignored is held");
  assert.equal(hand("Gordie's W180", LINE).ok, true);
  assert.equal(hand("another run's seed, with one held", { ...LINE, seed: "x9AbQ" }).ok, false);
  assert.equal(oracleLineModel(scene).steps[0].turn, 11, "the ignored oracle line left the held one as it was");
}

// ---- The plan group draws the oracle line in place of the fight plan: ✓ for turns played, ▸ for this one, · for the rest
{
  const { rows, summary, card: c } = plan("W180 T15", at(15));
  assert.equal(marks(rows), "✓✓✓✓▸····");
  assert.equal(summary, "~ oracle line wins in 9 turns · 4 of 6 left");
  assert.equal(cardSummary(c).plan, summary, "the summary's plan is the oracle line's too");
  assert.ok(!rows.some(r => r.includes("chips it")), "none of the fight plan's own steps");
}
{
  const { rows } = plan("W180 T11, the oracle line's first turn", at(11));
  assert.equal(marks(rows), "▸········");
}
{
  const { rows } = plan("W180 T19, its last", at(19));
  assert.equal(marks(rows), "✓✓✓✓✓✓✓✓▸");
}

// ---- At a faint's replacement ▸ stays on the step that fainted, whose pick is the one on screen
{
  const { rows } = plan("W180 T13's faint, the turn already 14", at(14, { phase: { phaseName: "SwitchPhase", isModal: true, doReturn: false } }));
  assert.equal(marks(rows), "✓✓▸······");
  assert.match(rows[2], /^▸ T13 .* send Golbat/);
  const { rows: uTurn } = plan("W180 T14, a U-turn's pick", at(14, { phase: { phaseName: "SwitchPhase", isModal: true, doReturn: true } }));
  assert.equal(marks(uTurn), "✓✓✓▸·····");
}

// ---- A card that cannot read the turn still draws a held oracle line
{
  const { groups, card: c } = plan("W180 T15, no exact enemy move", at(15), { unavailable: "the enemy's move can't be read" });
  assert.deepEqual(groups.map(g => g.id), ["act", "plan"]);
  assert.equal(cardSummary(c).plan, "~ oracle line wins in 9 turns · 4 of 6 left");
}

// ---- Off the oracle line's fight the card's own fight plan is back
{
  scene = at(1, { wave: 181 });
  const { rows, summary } = plan("W181", scene);
  assert.ok(summary.startsWith("likely lost"), summary);
  assert.ok(rows.some(r => r.includes("chips it")));
}

// ---- An oracle line that opens on a move names who plays it only when it was handed on that turn
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

const { cardEvent } = globalThis.__hud["60-card"];
const { strip } = globalThis.__hud["90-render"];
const flat = n => (n == null ? "" : typeof n !== "object" ? String(n) : (n.children ?? []).map(flat).filter(Boolean).join(" "));
const tyranitar = confidence => ({ icon: null, name: "Tyranitar", lv: 90, types: ["Rock", "Dark"], hp: 60, tera: false, boss: false, status: null,
  traps: [], weak: [], avoid: [], likely: { move: "Stone Edge", type: "Rock", pct: 40, first: 100, at: null, hits: 0, confidence }, pick: null, notes: [] });
const now = (label, s, over) => {
  const c = card(oracleLineModel(s), over);
  const drawn = drawBattle(c);
  const groups = flatGroups(drawn);
  const act = groups.find(x => x.id === "act");
  const shown = flat(strip(c, null, drawn));
  console.log(`== ${label}`);
  console.log(`strip | ${shown}`);
  for (const r of act.rows) console.log(`    ${r}`);
  return { act, groups, card: c, strip: shown };
};

// ---- While the oracle line holds, the strip leads with this turn's step and the card's own ⚔ call is hidden
{
  scene = at(12);
  hand("Gordie's W180, again", LINE);
  const { act, card: c, strip: shown } = now("W180 T12", scene);
  assert.equal(act.summary, "⚔ ~ T12/19 · Leavanny Leaf Storm");
  assert.ok(shown.endsWith(act.summary), shown);
  assert.equal(cardSummary(c).field, act.summary, "the summary's call is the oracle line's step too");
  assert.ok(!act.rows.some(r => r.includes("Venoshock")), "none of the turn line's own call");
  assert.equal(act.rows.filter(r => r.startsWith("⚔")).length, 1, "one call per card");
  assert.deepEqual(cardEvent(c).oracleLine, { state: "on", turn: 12, of: 19 });
}

// ---- The faint-prompt pick is shown on the turn it falls to, and is the call at the prompt itself
{
  const { act } = now("W180 T13", at(13));
  assert.equal(act.summary, "⚔ ~ T13/19 · Leavanny Bug Bite · then send Golbat");
  const { act: pick, card: c } = now("W180 T13's faint, the turn already 14", at(14, { phase: { phaseName: "SwitchPhase", isModal: true, doReturn: false } }));
  assert.equal(pick.summary, "⚔ ~ T13/19 · send Golbat");
  assert.deepEqual(cardEvent(c).oracleLine, { state: "on", turn: 13, of: 19 });
}

// ---- Tera's input is shown on the turn it is played, and on no other
{
  const { act } = now("W180 T16", at(16));
  assert.equal(act.summary, "⚔ ~ T16/19 · Gyarados Tera Water + Hydro Pump");
  assert.ok(act.rows.some(r => r.includes("← from Fight to the Tera button")), act.rows.join("\n"));
  const { act: next } = now("W180 T17", at(17));
  assert.ok(!next.rows.some(r => r.includes("Tera button")), next.rows.join("\n"));
}

// ---- A turn with no input of its own shows what the oracle line expects and asks for no press; the count counts turns
{
  const BOUNCE = pageOracleLine({ ...GORDIE_LINE, steps: GORDIE_LINE.steps.map(st => (st.turn === 17 ? { ...st, input: { kind: "move", move: "BOUNCE", tera: false } }
    : st.turn === 18 ? { ...st, input: null } : st)) });
  scene = at(17);
  hand("a Bounce on T17", BOUNCE);
  const { act } = now("W180 T17, Bounce", scene);
  assert.equal(act.summary, "⚔ ~ T17/19 · Gyarados Bounce");
  assert.ok(act.rows.some(r => /^· T18 no input → ~ Gyarados 423\/570/.test(r)), act.rows.join("\n"));
  const { act: lands, card: c } = now("W180 T18, Bounce lands", at(18));
  assert.equal(lands.summary, "~ T18/19 · no input · expect Gyarados 423/570 · Coalossal 238/711");
  assert.ok(!lands.rows.some(r => r.startsWith("⚔")), "no press asked for");
  assert.deepEqual(cardEvent(c).oracleLine, { state: "on", turn: 18, of: 19 });
  scene = at(12);
  hand("Gordie's W180, back", LINE);
}

// ---- Each checkpoint claims replay; this turn's enemy move keeps the turn read's own confidence
{
  const { act, groups } = now("W180 T12, Stone Edge read exact", at(12), { rows: [tyranitar("exact")] });
  assert.match(act.rows.find(r => r.startsWith("⚔")), /→ ~ Leavanny 249\/497/);
  const planned = groups.find(x => x.id === "plan").rows.filter(r => r.includes("→"));
  assert.ok(planned.length && planned.every(r => r.includes("→ ~ ")), planned.join("\n"));
  const enemy = rows => rows.map(r => r.slice(r.indexOf("↯"))).find(r => r.startsWith("↯"));
  const exact = enemy(groups.find(x => x.id === "foes").rows);
  console.log(`foes | ${exact}`);
  assert.ok(!exact.endsWith("· ~"), exact);
  const { groups: replayed } = now("W180 T12, Stone Edge read on a replay", at(12), { rows: [tyranitar("replay")] });
  assert.ok(enemy(replayed.find(x => x.id === "foes").rows).endsWith("· ~"));
}

// ---- A card that cannot read the turn still leads with the oracle line's step
{
  const { act, groups } = now("W180 T15, no exact enemy move", at(15), { unavailable: "the enemy's move can't be read" });
  assert.equal(act.summary, "⚔ ~ T15/19 · Golbat Venoshock · then send Gyarados");
  assert.deepEqual(groups.map(g => g.id), ["act", "plan"]);
}

// ---- Before the oracle line's first turn, and off its fight, the card's own turn line leads
{
  const fromT12 = { ...LINE, steps: LINE.steps.slice(1) };
  scene = at(11);
  hand("from T12, handed on T11", fromT12);
  const { act, card: c } = now("handed on T11, at T11", scene);
  assert.equal(act.summary, "Golbat Venoshock → Tyranitar · 3 hits");
  assert.equal(cardEvent(c).oracleLine, null);
  const { act: away } = now("W181", at(1, { wave: 181 }));
  assert.equal(away.summary, "Golbat Venoshock → Tyranitar · 3 hits");
}

// ---- Neither a handoff nor a card drawn from it writes to the game
{
  console.log(`writes to the game: ${writes.length ? writes.join(", ") : "none"}`);
  assert.deepEqual(writes, []);
}
