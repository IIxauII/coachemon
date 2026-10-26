import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { BattlerIndex, Command, MoveId, PokemonType, SpeciesId } from "../../../../src/enums/generated.ts";
import { GORDIE_LINE, GORDIE_SEED } from "../../../../src/game/fixtures/oracle-line.ts";
import { pageOracleLine } from "../../../../src/game/oracle-line.ts";
import { guard, writes } from "./game-writes.mjs";

let scene = null;
mountHud({ scene: () => scene });
const { offTheLineModel, oracleLineCheck, oracleLineModel, oracleLineNow, oracleLineSeen, oracleStepSummary, sendsToCome } = globalThis.__hud["57-oracle-line"];
const { cardSummary } = globalThis.__hud["60-card"];
const { flatGroups } = globalThis.__hud["90-render"];
const { drawBattle } = globalThis.__hud["96-render-battle"];

const LINE = pageOracleLine(GORDIE_LINE);

const move = (key, name, type) => ({ moveId: MoveId[key], getMove: () => ({ id: MoveId[key], name, type: PokemonType[type] }) });
const mon = (key, name, hp, { field = false, moves = [], tera = null } = {}) => ({
  species: { speciesId: SpeciesId[key] }, name, hp, isOnField: () => field, moveset: moves,
  getTeraType: () => (tera ? PokemonType[tera] : PokemonType.UNKNOWN),
  status: null, summonData: { statStages: [0, 0, 0, 0, 0, 0, 0] }, isTerastallized: false, isBoss: () => false,
});
// A checkpoint as the game would hold it, on the mons `at` builds.
const live = (side, states) => {
  for (const p of side) {
    const st = states.find(m => m.species === p.species.speciesId);
    if (st) Object.assign(p, { hp: st.hp, isOnField: () => st.onField, status: st.status ? { effect: st.status } : null,
      summonData: { statStages: [...st.statStages] }, isTerastallized: st.tera });
  }
};
// `cmd`: the turn's committed command, `{ move, tera }` or `{ switchTo }`.
const commands = cmd => (!cmd ? [{}, {}] : [
  { 0: cmd.switchTo !== undefined ? { command: Command.POKEMON, cursor: cmd.switchTo } : { command: Command.FIGHT, move: { move: MoveId[cmd.move] } } },
  { 0: { command: cmd.tera ? Command.TERA : cmd.switchTo !== undefined ? Command.POKEMON : Command.FIGHT } },
]);
// Gordie's W180 as the game holds it on `turn`: who is in front is whoever the oracle line put there by then.
// `edit(party, foes)` changes either side before the scene is guarded.
const at = (turn, { wave = 180, seed = GORDIE_SEED, phase = { phaseName: "CommandPhase" }, cp = null, cmd = null, edit = () => {} } = {}) => {
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
  edit(party, foes);
  if (cp) { live(party, cp.ours); live(foes, cp.foes); }
  const [turnCommands, preTurnCommands] = commands(cmd);
  return guard({ seed, currentBattle: { waveIndex: wave, turn, turnCommands, preTurnCommands }, phaseManager: { getCurrentPhase: () => phase },
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

const cardAt = (s, over) => card(oracleLineModel(s), { offTheLine: offTheLineModel(s), ...over });
const plan = (label, s, over) => {
  const c = cardAt(s, over);
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
  // The relay refuses a card whose oracle line state counts from turn 0, and with it the whole card (#675).
  hand("a step before the first turn", { ...LINE, steps: [{ ...LINE.steps[0], turn: 0 }, ...LINE.steps.slice(1)] });
  assert.equal(oracleLineModel(scene), null, "nothing ignored is held");
  assert.equal(hand("Gordie's W180", LINE).ok, true);
  assert.equal(hand("another run's seed, with one held", { ...LINE, seed: "x9AbQ" }).ok, false);
  assert.equal(oracleLineModel(scene).steps[0].turn, 11, "the ignored oracle line left the held one as it was");
}

// ---- A foe the oracle line puts in front is the one in its own slot, though the trainer fields its species twice
{
  const twin = (p, iconId) => Object.assign(p, { getIconAtlasKey: () => "pkmn", getIconId: () => iconId });
  const s = at(15, { edit: (_, foes) => {
    twin(Object.assign(foes[0], { species: { speciesId: SpeciesId.TYRANITAR }, name: "Tyranitar" }), "248s");
    twin(foes[5], "248");
  } });
  const fronts = oracleLineModel(s).steps.flatMap(st => st.after).filter(m => m.name === "Tyranitar");
  assert.ok(fronts.length, "the oracle line puts Tyranitar in front");
  assert.deepEqual([...new Set(fronts.map(m => m.icon?.[1]))], ["248"], "slot 5's Tyranitar, not slot 0's");
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
  const c = cardAt(s, over);
  const drawn = drawBattle(c);
  const groups = flatGroups(drawn);
  // `summary` is the call as the strip draws it: the wire's leads with the strip head's facts (#905).
  const act = { ...groups.find(x => x.id === "act"), summary: drawn.find(x => x.id === "act").summary };
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

// ---- A turn with no input of its own that faints our lead names the replacement, and the faint prompt is the call (#702)
{
  const toSnorlax = { kind: "queued", replacement: { slot: 2, species: "SNORLAX" } };
  const steps = GORDIE_LINE.steps.map(st => (st.turn === 17 ? { ...st, input: { kind: "move", move: "BOUNCE", tera: false } }
    : st.turn === 18 ? { ...st, input: toSnorlax } : st));
  const FAINTS = pageOracleLine({ ...GORDIE_LINE, steps });
  scene = at(17);
  assert.equal(hand("a Bounce on T17, Gyarados down on T18", { ...FAINTS, steps: FAINTS.steps.map(st => (st.turn === 18 ? { ...st, input: { kind: "queued" } } : st)) }).why,
    "malformed");
  hand("a Bounce on T17, Gyarados down on T18", FAINTS);
  const { act } = now("W180 T17, Bounce", scene);
  assert.equal(act.summary, "⚔ ~ T17/19 · Gyarados Bounce");
  assert.ok(act.rows.some(r => /^· T18 no input then send Snorlax → ~ /.test(r)), act.rows.join("\n"));
  const { rows } = plan("W180 T17, Bounce", scene);
  assert.ok(rows.some(r => /^· T18 no input · send Snorlax/.test(r)), rows.join("\n"));
  const { act: lands } = now("W180 T18, Bounce lands", at(18));
  assert.match(lands.summary, /^~ T18\/19 · no input · then send Snorlax · expect /);
  const { act: pick } = now("W180 T18's faint, the turn already 19", at(19, { phase: { phaseName: "SwitchPhase", isModal: true, doReturn: false } }));
  assert.equal(pick.summary, "⚔ ~ T18/19 · send Snorlax");
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

// The checkpoint the oracle line holds after `turn`, as the game would show it at the next decision, `tweak`ed.
const after = (turn, tweak = () => {}, line = LINE) => {
  const cp = structuredClone(line.steps.find(st => st.turn === turn).checkpoint);
  tweak(cp);
  return cp;
};
const bySpecies = (side, key) => side.find(m => m.species === SpeciesId[key]);
// A frame inside `turn`, once the player has committed `cmd`, and the decision the game reaches next.
const play = (turn, cmd, opts) => oracleLineSeen(at(turn, { phase: { phaseName: "MovePhase" }, cmd, ...opts }));
let scored = null;
const decide = (turn, opts) => { const s = at(turn, opts); scored = oracleLineCheck(s); return s; };
const scoredText = sc => (sc ? `T${sc.turn}/${sc.of} ${sc.misses.length ? `miss${sc.wrong ? " !" : ""} ${sc.misses.map(m => `${m.name} ${m.expected} · ${m.came}`).join("; ")}` : "match"}` : "nothing");
const offRows = act => act.rows.filter(r => r.startsWith("✗"));

// ---- A checkpoint that matches ticks its step, and the oracle line leads on
{
  scene = at(12, { cp: after(11) });
  hand("Gordie's W180, to score", LINE);
  play(12, { move: "LEAF_STORM" });
  const s = decide(13, { cp: after(12) });
  console.log(`scored ${scoredText(scored)}`);
  assert.deepEqual([scored.turn, scored.of, scored.misses, scored.wrong], [12, 19, [], false]);
  assert.deepEqual(scored.checkpoint, LINE.steps.find(st => st.turn === 12).checkpoint, "the claim scored is the step's own");
  assert.deepEqual(scored.input, LINE.steps.find(st => st.turn === 12).input);
  assert.equal(oracleLineCheck(at(13, { cp: after(12) })), null, "the same decision again scores nothing");
  assert.equal(marks(plan("W180 T13, T12's checkpoint matched", s).rows), "✓✓▸······");
  assert.equal(now("W180 T13, on the oracle line", s).act.summary, "⚔ ~ T13/19 · Leavanny Bug Bite · then send Golbat");
}

// ---- A different input from the player leaves the oracle line: the turn line and fight plan lead again, and Now shows expected against what came
{
  play(13, { move: "LEAF_STORM" });
  const s = decide(14, { cp: after(13, cp => { bySpecies(cp.foes, "TYRANITAR").hp = 455; }) });
  const { act, card: c, groups } = now("W180 T14, Leaf Storm where the oracle line said Bug Bite", s);
  assert.equal(act.summary, "off the line · ~ re-solving… · Golbat Venoshock → Tyranitar · 3 hits");
  assert.deepEqual(offRows(act), ["✗ T13 Tyranitar expected 512/569 · came 455/569"]);
  console.log(`scored ${scoredText(scored)}`);
  assert.deepEqual([scored.turn, scored.wrong], [13, false], "leaving the line is no wrong claim");
  assert.ok(act.rows.some(r => r.includes("Venoshock")), "the turn line's own call is back");
  const planned = groups.find(x => x.id === "plan");
  assert.ok(planned.summary.startsWith("likely lost"), planned.summary);
  assert.ok(planned.rows.some(r => r.includes("chips it")), "the fight plan is back");
  assert.equal(oracleLineModel(s), null);
  assert.deepEqual(cardEvent(c).oracleLine, { state: "off", turn: 13, of: 19 }, "the card event tells the coach the line is off");
}

// ---- An oracle line off the line stays void at every later decision of the run, a Continue retry of its wave included
{
  play(14, { move: "TOXIC" });
  const s = decide(15, { cp: after(14) });
  assert.equal(scored, null, "an oracle line off the line scores nothing more");
  assert.equal(oracleLineModel(s), null, "a later checkpoint that happens to match brings nothing back");
  assert.ok(now("W180 T15, the state as T14's checkpoint", s).act.summary.startsWith("off the line · ~ "));
  const retry = decide(1);
  assert.equal(oracleLineModel(retry), null);
  assert.ok(now("W180 T1, a Continue retry", retry).act.summary.startsWith("off the line · ~ "));
}

// ---- A miss on the oracle line's own input marks its replay claim ! for the rest of the run
{
  const fromT15 = { ...LINE, steps: LINE.steps.slice(4) };
  scene = at(15, { cp: after(14) });
  hand("a re-solve from T15", fromT15);
  assert.equal(now("W180 T15, the re-solve", scene).act.summary, "⚔ ~ T15/19 · Golbat Venoshock · then send Gyarados");
  play(15, { move: "VENOSHOCK" });
  const s = decide(16, { cp: after(15, cp => { bySpecies(cp.foes, "TYRANITAR").hp = 360; }) });
  const { act } = now("W180 T16, Venoshock as the oracle line said, drawn otherwise", s);
  assert.equal(act.summary, "off the line · ! re-solving… · Golbat Venoshock → Tyranitar · 3 hits");
  assert.deepEqual(offRows(act), ["✗ T15 Tyranitar expected 339/569 · came 360/569"]);
  console.log(`scored ${scoredText(scored)}`);
  assert.equal(scored.wrong, true, "the miss that marks the claim ! says so");

  const fromT16 = { ...LINE, steps: LINE.steps.slice(5) };
  scene = at(16, { cp: after(15) });
  hand("a re-solve from T16, the same run", fromT16);
  const again = now("W180 T16, an oracle line after a wrong one", scene);
  assert.equal(again.act.summary, "⚔ ! T16/19 · Gyarados Tera Water + Hydro Pump");
  const { rows, summary } = plan("W180 T16, its plan", scene);
  assert.equal(summary, "! oracle line wins in 4 turns · 4 of 6 left");
  assert.ok(rows.filter(r => r.includes("→")).every(r => r.includes("→ ! ")), rows.join("\n"));

  const other = { ...fromT16, seed: "another run's seed" };
  scene = at(16, { seed: other.seed, cp: after(15) });
  hand("the same oracle line in another run", other);
  assert.equal(now("another run, T16", scene).act.summary, "⚔ ~ T16/19 · Gyarados Tera Water + Hydro Pump");
}

// ---- A switch the oracle line asked for is its own input; a faint replacement it didn't ask for is the player's
{
  const seed = "a switching run";
  scene = at(11, { seed });
  hand("from T11, a switch first", { ...LINE, seed });
  play(11, { switchTo: 4 }, { seed });
  const s = decide(12, { seed, cp: after(11, cp => { bySpecies(cp.ours, "LEAVANNY").hp = 300; }) });
  assert.ok(now("T12, the switch played, Leavanny took less", s).act.summary.startsWith("off the line · ! "));

  const picked = "a picking run";
  scene = at(13, { seed: picked, cp: after(12) });
  hand("from T13, Bug Bite then send Golbat", { ...LINE, seed: picked, steps: LINE.steps.slice(2) });
  play(13, { move: "BUG_BITE" }, { seed: picked });
  const sent = decide(14, { seed: picked, cp: after(13, cp => {
    bySpecies(cp.ours, "GOLBAT").onField = false;
    bySpecies(cp.ours, "GYARADOS").onField = true;
  }) });
  const { act } = now("T14, Gyarados sent where the oracle line said Golbat", sent);
  assert.ok(act.summary.startsWith("off the line · ~ "), act.summary);
  assert.deepEqual(offRows(act), ["✗ T13 Gyarados expected benched · came in front", "✗ T13 Golbat expected in front · came benched"]);
}

// ---- A free switch taken at "Will you switch?" is the player's input, not the oracle line's
{
  const seed = "a free-switching run";
  scene = at(17, { seed, cp: after(16) });
  hand("from T17, Hydro Pump KOs Tyranitar", { ...LINE, seed, steps: LINE.steps.slice(6) });
  play(17, { move: "HYDRO_PUMP" }, { seed });
  oracleLineSeen(at(18, { seed, phase: { phaseName: "SwitchPhase", isModal: false, doReturn: true } }));
  const s = decide(18, { seed, cp: after(17, cp => {
    bySpecies(cp.ours, "GYARADOS").onField = false;
    bySpecies(cp.ours, "SNORLAX").onField = true;
  }) });
  assert.ok(now("T18, Snorlax switched in for free", s).act.summary.startsWith("off the line · ~ "));
}

// ---- A fight lost on the oracle line voids it, and a Continue retry of the wave leaves it void
{
  const seed = "a losing run";
  scene = at(15, { seed, cp: after(14) });
  hand("from T15, to a lost fight", { ...LINE, seed, steps: LINE.steps.slice(4) });
  play(15, { move: "VENOSHOCK" }, { seed });
  const lost = oracleLineSeen(at(15, { seed, cmd: { move: "VENOSHOCK" }, phase: { phaseName: "GameOverPhase" } }));
  console.log(`scored at the game over ${scoredText(lost)}`);
  assert.deepEqual([lost.turn, lost.wrong, lost.misses.map(m => m.came)], [15, true, ["lost"]]);
  assert.equal(oracleLineSeen(at(15, { seed, cmd: { move: "VENOSHOCK" }, phase: { phaseName: "GameOverPhase" } })), null, "the next frame of the game over scores nothing");
  const retry = decide(1, { seed });
  assert.equal(oracleLineModel(retry), null);
  const { act } = now("T1, a Continue retry after the lost fight", retry);
  assert.ok(act.summary.startsWith("off the line · ! "), act.summary);
  assert.deepEqual(offRows(act), ["✗ T15 the fight expected won · came lost"]);
}

// ---- A fight lost to a TURN_END tag is scored on the turn it was played, not the one the game has moved on to
{
  const seed = "a run lost at turn end";
  scene = at(15, { seed, cp: after(14) });
  hand("from T15, lost to Leech Seed", { ...LINE, seed, steps: LINE.steps.slice(4) });
  play(15, { move: "VENOSHOCK" }, { seed });
  oracleLineSeen(at(16, { seed, phase: { phaseName: "GameOverPhase" } }));
  const { act } = now("T1, a Continue retry after Leech Seed", decide(1, { seed }));
  assert.ok(act.summary.startsWith("off the line · ! "), act.summary);
  assert.deepEqual(offRows(act), ["✗ T15 the fight expected won · came lost"]);
}

// ---- The final turn is scored at the rewards screen, after the end-of-turn effects that follow the last faint
{
  const seed = "a W188 run", wave = 188;
  const W188 = { ...LINE, seed, wave, steps: LINE.steps.slice(7) };
  scene = at(18, { seed, wave, cp: after(17) });
  hand("W188 from T18", W188);
  play(18, { move: "HYDRO_PUMP" }, { seed, wave });
  decide(19, { seed, wave, cp: after(18) });
  play(19, { move: "HYDRO_PUMP" }, { seed, wave });
  // Leftovers' 35 has yet to land: the level-up's move prompt comes between the last faint and the turn's end.
  const learn = decide(19, { seed, wave, phase: { phaseName: "LearnMovePhase" }, cp: after(19, cp => { bySpecies(cp.ours, "GYARADOS").hp = 388; }) });
  assert.notEqual(oracleLineModel(learn), null, "the move prompt scores nothing");
  const rewards = decide(20, { seed, wave, phase: { phaseName: "SelectModifierPhase" }, cp: after(19) });
  assert.deepEqual([scored.turn, scored.of, scored.misses], [19, 19, []], "the final checkpoint is journalled as a match");
  console.log(`W188 rewards: ${oracleLineModel(rewards)?.steps.map(st => st.at).join(" ")} | off ${JSON.stringify(offTheLineModel(rewards))}`);
  assert.deepEqual(oracleLineModel(rewards).steps.map(st => st.at), ["done", "done"]);
  assert.equal(offTheLineModel(rewards), null);

  // A tenth wave has no rewards screen: the biome screen is the decision after its win (game-code.md §12).
  const x0 = "a W180 run to the biome screen";
  scene = at(19, { seed: x0, cp: after(18) });
  hand("W180 from T19", { ...LINE, seed: x0, steps: LINE.steps.slice(8) });
  play(19, { move: "HYDRO_PUMP" }, { seed: x0 });
  const biome = decide(20, { seed: x0, phase: { phaseName: "SelectBiomePhase" }, cp: after(19, cp => { bySpecies(cp.ours, "GYARADOS").hp = 388; }) });
  console.log(`W180 biome screen: off ${JSON.stringify(offTheLineModel(biome))}`);
  assert.equal(oracleLineModel(biome), null);
  assert.equal(offTheLineModel(biome).misses[0].came, "388/570");
}

// Youngster Roland's W5: Charmander Scratches Lillipup out on T3, and benched Bulbasaur levels on that KO into a prompt
// for Leech Seed over four moves; Patrat comes in and falls on T6. A Roland's mons outlive its scenes, as the game's do,
// so a prompt answered on one scene is in the moveset the next one reads.
const ROLAND_MOVES = { SCRATCH: ["Scratch", "NORMAL"], EMBER: ["Ember", "FIRE"], TACKLE: ["Tackle", "NORMAL"], GROWL: ["Growl", "NORMAL"],
  VINE_WHIP: ["Vine Whip", "GRASS"], SUNNY_DAY: ["Sunny Day", "FIRE"], LEECH_SEED: ["Leech Seed", "GRASS"] };
// `new pm.constructor(id)` is how the overlay names a move no mon knows yet (game-code.md §17).
function PokemonMove(id) {
  const [name, type] = ROLAND_MOVES[Object.keys(MoveId).find(k => MoveId[k] === id)];
  return { moveId: id, constructor: PokemonMove, getMove: () => ({ id, name, type: PokemonType[type] }) };
}
const knowing = (...keys) => keys.map(k => PokemonMove(MoveId[k]));
const roland = seed => ({ seed,
  party: [mon("CHARMANDER", "Charmander", 39, { field: true, moves: knowing("SCRATCH", "EMBER") }),
    mon("BULBASAUR", "Bulbasaur", 45, { moves: knowing("TACKLE", "GROWL", "VINE_WHIP", "SUNNY_DAY") })],
  foes: [mon("LILLIPUP", "Lillipup", 30, { field: true }), mon("PATRAT", "Patrat", 30)] });
const NONE = [0, 0, 0, 0, 0, 0, 0];
const rolandCp = turn => ({
  ours: [{ slot: 0, species: SpeciesId.CHARMANDER, onField: true, hp: 39 - 3 * Math.min(turn, 5), maxHp: 39, status: 0, statStages: NONE, tera: false },
    { slot: 1, species: SpeciesId.BULBASAUR, onField: false, hp: 45, maxHp: 45, status: 0, statStages: NONE, tera: false }],
  foes: [{ slot: 0, species: SpeciesId.LILLIPUP, onField: turn < 3, hp: Math.max(0, 30 - 10 * turn), maxHp: 30, status: 0, statStages: NONE, tera: false },
    { slot: 1, species: SpeciesId.PATRAT, onField: turn >= 3 && turn < 6, hp: Math.min(30, 60 - 10 * turn), maxHp: 30, status: 0, statStages: NONE, tera: false }],
});
const SCRATCH = { kind: "move", move: MoveId.SCRATCH, tera: false };
const SKIP_LEECH_SEED = { slot: 1, species: SpeciesId.BULBASAUR, move: MoveId.LEECH_SEED, forget: null };
const OVER_SUNNY_DAY = { ...SKIP_LEECH_SEED, forget: MoveId.SUNNY_DAY };
const learning = (...learns) => ({ ...SCRATCH, learns });
// T1 to T6, every turn a Scratch unless `inputs` holds that turn's.
const rolandLine = (seed, inputs) => ({ seed, wave: 5, gameVersion: "1.12.1.2", receipt: [], luck: [],
  steps: [1, 2, 3, 4, 5, 6].map(turn => ({ turn, input: inputs[turn] ?? SCRATCH, checkpoint: rolandCp(turn) })) });
const rolandAt = (r, turn, { phase = { phaseName: "CommandPhase" }, cp = null, cmd = null } = {}) => {
  if (cp) { live(r.party, cp.ours); live(r.foes, cp.foes); }
  const [turnCommands, preTurnCommands] = commands(cmd);
  return guard({ seed: r.seed, currentBattle: { waveIndex: 5, turn, turnCommands, preTurnCommands }, phaseManager: { getCurrentPhase: () => phase },
    getPlayerParty: () => r.party, getEnemyParty: () => r.foes });
};
const PROMPT = { phaseName: "LearnMovePhase", partyMemberIndex: 1, moveId: MoveId.LEECH_SEED };
// The answer as the game leaves it: Leech Seed in the slot Sunny Day held.
const learnOverSunnyDay = r => { r.party[1].moveset[3] = PokemonMove(MoveId.LEECH_SEED); };

// ---- An oracle line's step may carry its move prompts' answers, a queued step those alone; one out of shape is still ignored
{
  const r = roland("a W5 run, handed");
  scene = rolandAt(r, 1);
  assert.equal(hand("a skip on T3", rolandLine(r.seed, { 3: learning(SKIP_LEECH_SEED) })).ok, true);
  assert.equal(hand("a forget on T3", rolandLine(r.seed, { 3: learning(OVER_SUNNY_DAY) })).ok, true);
  assert.equal(hand("a switch's", rolandLine(r.seed, { 3: { kind: "switch", to: { slot: 1, species: SpeciesId.BULBASAUR }, learns: [SKIP_LEECH_SEED] } })).ok, true);
  assert.equal(hand("a queued step's, with no replacement", rolandLine(r.seed, { 3: { kind: "queued", learns: [SKIP_LEECH_SEED] } })).ok, true);
  const bad = learns => hand("out of shape", rolandLine(r.seed, { 3: { ...SCRATCH, learns } })).why;
  assert.equal(bad(SKIP_LEECH_SEED), "malformed", "learns is a list");
  assert.equal(bad([{ ...SKIP_LEECH_SEED, slot: "1" }]), "malformed", "a pick's slot is a number");
  assert.equal(bad([{ ...SKIP_LEECH_SEED, move: "LEECH_SEED" }]), "malformed", "a pick's move is the game's id");
  assert.equal(bad([{ ...SKIP_LEECH_SEED, species: undefined }]), "malformed", "a pick names its mon");
  assert.equal(bad([{ slot: 1, species: SpeciesId.BULBASAUR, move: MoveId.LEECH_SEED }]), "malformed", "a skip's forget is null, never missing");
  assert.equal(bad([null]), "malformed");
  assert.equal(hand("a queued step with an empty list", rolandLine(r.seed, { 3: { kind: "queued", learns: [] } })).why, "malformed");
}

// ---- A move prompt the oracle line answers is named after its turn's call: a skip, or the move it learns over
{
  const r = roland("a W5 run, skipping");
  scene = rolandAt(r, 3, { cp: rolandCp(2) });
  hand("Roland's W5, Leech Seed skipped", rolandLine(r.seed, { 3: learning(SKIP_LEECH_SEED) }));
  const { act, strip: shown } = now("W5 T3, Leech Seed skipped", scene);
  assert.equal(act.summary, "⚔ ~ T3/6 · Charmander Scratch · then Bulbasaur skips Leech Seed");
  assert.ok(shown.endsWith(act.summary), shown);
  assert.ok(act.rows.includes("⤵ then Bulbasaur skips Leech Seed at the move prompt"), act.rows.join("\n"));
  assert.ok(plan("W5 T3, its plan", scene).rows.some(x => /^▸ T3 .*Scratch · Bulbasaur skips Leech Seed → ~ /.test(x)));

  const o = roland("a W5 run, forgetting");
  scene = rolandAt(o, 3, { cp: rolandCp(2) });
  hand("Roland's W5, Leech Seed over Sunny Day", rolandLine(o.seed, { 3: learning(OVER_SUNNY_DAY) }));
  assert.equal(now("W5 T3, Leech Seed over Sunny Day", scene).act.summary, "⚔ ~ T3/6 · Charmander Scratch · then Bulbasaur learns Leech Seed over Sunny Day");

  const q = roland("a W5 run, queued");
  scene = rolandAt(q, 3, { cp: rolandCp(2) });
  hand("Roland's W5, a queued T3", rolandLine(q.seed, { 3: { kind: "queued", learns: [SKIP_LEECH_SEED] } }));
  assert.equal(now("W5 T3, queued", scene).act.summary, "~ T3/6 · no input · then Bulbasaur skips Leech Seed · expect Charmander 30/39 · Patrat 30/30");
}

const { drawLearn, captionLearn } = globalThis.__hud["96-render-learn"];
const { readOracleLine } = globalThis.__hud["60-card"];
// The learn card's own read of the prompt, which says to forget Sunny Day.
const learnCard = () => ({ kind: "learn", wave: 5, icon: null, name: "Bulbasaur", atk: 9, spa: 11,
  move: { name: "Leech Seed", type: "Grass", cat: "status", value: null, notes: [] },
  moves: [["Tackle", "Normal", 40], ["Growl", "Normal", null], ["Vine Whip", "Grass", 45], ["Sunny Day", "Fire", null]]
    .map(([name, type, value]) => ({ name, type, cat: value ? "physical" : "status", value, notes: [] })),
  forget: 3, compare: 3, verdict: "Learn → forget Sunny Day", decision: "learn", gain: 5, team: { gains: ["Water"], loses: [], onlyType: null }, blind: null });
const prompt = (label, s) => {
  const c = learnCard();
  readOracleLine(s, c);
  const drawn = drawLearn(c);
  const groups = flatGroups(drawn);
  const shown = flat(strip(c, captionLearn(c), drawn));
  console.log(`== ${label}`);
  console.log(`strip | ${shown}`);
  for (const g of groups) for (const x of g.rows) console.log(`  ${g.id.padEnd(8)}${x}`);
  return { card: c, groups, strip: shown, act: { ...groups.find(g => g.id === "act"), summary: drawn.find(g => g.id === "act").summary } };
};

// ---- At the move prompt itself the oracle line's answer is the learn card's call, though the turn has moved on
{
  const r = roland("a W5 run, at the prompt");
  scene = rolandAt(r, 3, { cp: rolandCp(2) });
  hand("Roland's W5, Leech Seed skipped", rolandLine(r.seed, { 3: learning(SKIP_LEECH_SEED) }));
  const at = prompt("W5 T3's Leech Seed prompt, skipped", rolandAt(r, 3, { phase: PROMPT }));
  assert.equal(at.act.summary, "⚔ ~ T3/6 · Bulbasaur skips Leech Seed");
  assert.ok(at.strip.endsWith(at.act.summary), at.strip);
  assert.equal(cardSummary(at.card).learn, at.act.summary);
  assert.deepEqual([cardEvent(at.card).verdict, cardEvent(at.card).oracleLine], ["Bulbasaur skips Leech Seed", { state: "on", turn: 3, of: 6 }]);
  assert.ok(!at.groups.find(g => g.id === "options").rows.some(x => x.startsWith("✗")), "the card's own forget is not the call");
  assert.ok(!at.groups.some(g => g.id === "audit"), "nor what its own forget would cost the team");
  // A faint at the turn's end levels after the turn has moved on (game-code.md §21).
  assert.equal(prompt("W5 T3's prompt, the turn already 4", rolandAt(r, 4, { phase: PROMPT })).act.summary, "⚔ ~ T3/6 · Bulbasaur skips Leech Seed");
  const other = prompt("W5 T3, a prompt the oracle line has no answer for", rolandAt(r, 3, { phase: { ...PROMPT, moveId: MoveId.EMBER } }));
  assert.equal(other.act.summary, "Learn → forget Sunny Day");
  assert.equal(cardEvent(other.card).oracleLine, null);

  const o = roland("a W5 run, forgetting at the prompt");
  scene = rolandAt(o, 3, { cp: rolandCp(2) });
  hand("Roland's W5, Leech Seed over Sunny Day", rolandLine(o.seed, { 3: learning(OVER_SUNNY_DAY) }));
  const forget = prompt("W5 T3's Leech Seed prompt, over Sunny Day", rolandAt(o, 3, { phase: PROMPT }));
  assert.equal(forget.act.summary, "⚔ ~ T3/6 · Bulbasaur learns Leech Seed over Sunny Day");
  assert.deepEqual(forget.groups.find(g => g.id === "options").rows.filter(x => x.startsWith("✗")), ["✗ Fire Sunny Day status"]);
}

// A W5 run handed `inputs` at T1 and played on the oracle line through `to`, its prompt on `at` `answer`ed (or never
// asked), then scored at the decision after `to`: T4's command, or the rewards screen after T6.
const rolandPlayed = (seed, inputs, answer, { at = 3, to = 3, asked = true } = {}) => {
  const r = roland(seed);
  scene = rolandAt(r, 1);
  hand(seed, rolandLine(seed, inputs));
  for (let t = 1; t <= to; t++) {
    oracleLineSeen(rolandAt(r, t, { phase: { phaseName: "MovePhase" }, cmd: { move: "SCRATCH" } }));
    if (t === at && asked) oracleLineSeen(rolandAt(r, t, { phase: PROMPT }));
    if (t === at) answer(r);
    if (t < to) oracleLineCheck(rolandAt(r, t + 1, { cp: rolandCp(t) }));
  }
  const s = rolandAt(r, to + 1, { phase: { phaseName: to === 6 ? "SelectModifierPhase" : "CommandPhase" }, cp: rolandCp(to) });
  scored = oracleLineCheck(s);
  console.log(`scored ${scoredText(scored)}`);
  return s;
};

// ---- A move prompt answered as the oracle line said scores as a match, and the oracle line leads on
{
  rolandPlayed("a W5 run, skipped as said", { 3: learning(SKIP_LEECH_SEED) }, () => {});
  assert.deepEqual(scored.misses, []);
  const s = rolandPlayed("a W5 run, forgotten as said", { 3: learning(OVER_SUNNY_DAY) }, learnOverSunnyDay);
  assert.deepEqual(scored.misses, []);
  assert.equal(now("W5 T4, Leech Seed learned as said", s).act.summary, "⚔ ~ T4/6 · Charmander Scratch");
}

// ---- A move prompt answered otherwise leaves the oracle line, and is the player's input rather than a wrong claim
{
  const s = rolandPlayed("a W5 run, learned, not skipped", { 3: learning(SKIP_LEECH_SEED) }, learnOverSunnyDay);
  assert.deepEqual([scored.turn, scored.wrong], [3, false]);
  const { act } = now("W5 T4, Leech Seed learned where the oracle line skipped it", s);
  assert.ok(act.summary.startsWith("off the line · ~ "), act.summary);
  assert.deepEqual(offRows(act), ["✗ T3 Bulbasaur expected skip Leech Seed · came learned Leech Seed"]);
  rolandPlayed("a W5 run, skipped, not learned", { 3: learning(OVER_SUNNY_DAY) }, () => {});
  assert.deepEqual([scored.misses.map(m => `${m.expected} · ${m.came}`), scored.wrong], [["Leech Seed over Sunny Day · skipped Leech Seed"], false]);
  rolandPlayed("a W5 run, Growl forgotten instead", { 3: learning(OVER_SUNNY_DAY) }, r => { r.party[1].moveset[1] = PokemonMove(MoveId.LEECH_SEED); });
  assert.deepEqual([scored.misses.map(m => `${m.expected} · ${m.came}`), scored.wrong], [["Leech Seed over Sunny Day · kept Sunny Day"], false]);
}

// ---- A move prompt the game never asked misses on the oracle line's own claim
{
  const s = rolandPlayed("a W5 run, never asked", { 3: learning(OVER_SUNNY_DAY) }, () => {}, { asked: false });
  assert.deepEqual([scored.misses.map(m => `${m.name} ${m.expected} · ${m.came}`), scored.wrong], [["Bulbasaur Leech Seed over Sunny Day · no prompt"], true]);
  assert.ok(now("W5 T4, never asked", s).act.summary.startsWith("off the line · ! "));
}

// ---- A replacement the oracle line names for a faint that never came is its own miss: the mover is still in front
{
  const seed = "a W5 run, Charmander never falls";
  const r = roland(seed);
  const line = rolandLine(seed, { 3: { ...SCRATCH, replacement: { slot: 1, species: SpeciesId.BULBASAUR } } });
  const [charmander, bulbasaur] = rolandCp(3).ours;
  line.steps[2].checkpoint = { ...rolandCp(3), ours: [{ ...charmander, hp: 0, onField: false }, { ...bulbasaur, onField: true }] };
  scene = rolandAt(r, 1);
  hand(seed, line);
  for (let t = 1; t <= 3; t++) {
    oracleLineSeen(rolandAt(r, t, { phase: { phaseName: "MovePhase" }, cmd: { move: "SCRATCH" } }));
    scored = oracleLineCheck(rolandAt(r, t + 1, { cp: rolandCp(t) }));
  }
  console.log(`scored ${scoredText(scored)}`);
  assert.deepEqual([scored.turn, scored.wrong], [3, true]);
}

// ---- A pick on the oracle line's last step is no claim: no text names it, the learn card keeps its own call, and no answer scores
{
  const r = roland("a W5 run, a pick on the winning turn");
  scene = rolandAt(r, 6, { cp: rolandCp(5) });
  const LAST = { 6: learning(SKIP_LEECH_SEED) };
  hand("Roland's W5, Leech Seed skipped on T6", rolandLine(r.seed, LAST));
  assert.equal(now("W5 T6, the winning turn", scene).act.summary, "⚔ ~ T6/6 · Charmander Scratch");
  assert.ok(!plan("W5 T6, its plan", scene).rows.some(x => x.includes("Leech Seed")));
  const at = prompt("W5 T6's Leech Seed prompt", rolandAt(r, 6, { phase: PROMPT }));
  assert.deepEqual([at.act.summary, cardEvent(at.card).oracleLine], ["Learn → forget Sunny Day", null]);
  const s = rolandPlayed("a W5 run, learned on the winning turn", LAST, learnOverSunnyDay, { at: 6, to: 6 });
  assert.deepEqual([scored.turn, scored.misses], [6, []]);
  assert.equal(offTheLineModel(s), null);
}

// Eternatus's W200 (#788): Rayquaza alone until Eternatus's last bar breaks on T2, then Eternamax, back at full HP behind
// five bars, against Rayquaza and Zacian. Rayquaza falls on T4 and Blissey takes its field slot; Snorlax stays benched.
const ETERNA = { RAYQUAZA: ["Rayquaza", ["DRAGON_ASCENT"], "FLYING"], ZACIAN: ["Zacian", ["BEHEMOTH_BLADE", "CLOSE_COMBAT"], "STEEL"],
  BLISSEY: ["Blissey", ["SEISMIC_TOSS", "POLLEN_PUFF"]], SNORLAX: ["Snorlax", []], ETERNATUS: ["Eternatus", []],
  LIEPARD: ["Liepard", []], GARBODOR: ["Garbodor", []], SCRAGGY: ["Scraggy", []] };
const ETERNA_MOVES = { DRAGON_ASCENT: ["Dragon Ascent", "FLYING"], BEHEMOTH_BLADE: ["Behemoth Blade", "STEEL"],
  CLOSE_COMBAT: ["Close Combat", "FIGHTING"], SEISMIC_TOSS: ["Seismic Toss", "FIGHTING"], POLLEN_PUFF: ["Pollen Puff", "BUG"] };
const keyOf = id => Object.keys(SpeciesId).find(k => SpeciesId[k] === id);
const state = (key, slot, onField, hp, maxHp, more = {}) => ({ slot, species: SpeciesId[key], onField, hp, maxHp, status: 0, statStages: NONE, tera: false, ...more });
const eternaCp = (ours, eterna) => ({ ours, foes: [state("ETERNATUS", 0, eterna.bossBars > 0, ...eterna.hp, { bossBars: eterna.bossBars })] });
const bench = (b = 600, s = 500) => [state("BLISSEY", 2, false, b, 600), state("SNORLAX", 3, false, s, 500)];
const ETERNA_CP = {
  0: eternaCp([state("RAYQUAZA", 0, true, 400, 400), state("ZACIAN", 1, false, 350, 350), ...bench()], { hp: [1600, 1600], bossBars: 2 }),
  1: eternaCp([state("RAYQUAZA", 0, true, 300, 400), state("ZACIAN", 1, false, 350, 350), ...bench()], { hp: [400, 1600], bossBars: 1 }),
  2: eternaCp([state("RAYQUAZA", 0, true, 250, 400), state("ZACIAN", 1, true, 350, 350), ...bench()], { hp: [2400, 2400], bossBars: 5 }),
  3: eternaCp([state("RAYQUAZA", 0, true, 200, 400), state("ZACIAN", 1, true, 300, 350, { tera: true }), ...bench()], { hp: [1500, 2400], bossBars: 3 }),
  4: eternaCp([state("BLISSEY", 0, true, 600, 600), state("ZACIAN", 1, true, 250, 350, { tera: true }), state("RAYQUAZA", 2, false, 0, 400),
    state("SNORLAX", 3, false, 500, 500)], { hp: [900, 2400], bossBars: 2 }),
  5: eternaCp([state("BLISSEY", 0, true, 500, 600), state("ZACIAN", 1, true, 250, 350, { tera: true }), state("RAYQUAZA", 2, false, 0, 400),
    state("SNORLAX", 3, false, 500, 500)], { hp: [0, 2400], bossBars: 0 }),
};
const ASCENT = { kind: "move", move: MoveId.DRAGON_ASCENT, tera: false };
const BLADE = { kind: "move", move: MoveId.BEHEMOTH_BLADE, tera: false };
const double = (commands, more = {}) => ({ kind: "double", commands, ...more });
const ETERNA_INPUTS = {
  1: ASCENT,
  2: ASCENT,
  3: double([{ ...ASCENT, target: { side: "foes", field: 0 } }, { ...BLADE, tera: true }]),
  4: double([null, BLADE], { replacements: [{ slot: 2, species: SpeciesId.BLISSEY, field: 0 }] }),
  5: double([{ kind: "move", move: MoveId.SEISMIC_TOSS, tera: false }, BLADE]),
};
const eternaLine = (seed, inputs = {}) => ({ seed, wave: 200, gameVersion: "1.12.1.3", receipt: [], luck: [],
  steps: [1, 2, 3, 4, 5].map(turn => ({ turn, input: turn in inputs ? inputs[turn] : ETERNA_INPUTS[turn], checkpoint: ETERNA_CP[turn] })) });
// The game on `turn`, standing as `cp` (by default the checkpoint before it): a field slot is its party slot.
// `cmds`: each field slot's committed command, `{ move, tera, targets }` or `{ switchTo }`.
const eternaAt = (seed, turn, { cp = ETERNA_CP[turn - 1], phase = { phaseName: "CommandPhase" }, cmds = [], wave = 200,
  battlers = turn > 2 ? 2 : 1 } = {}) => {
  const build = m => {
    const [name, moves = [], tera] = ETERNA[keyOf(m.species)];
    const p = mon(keyOf(m.species), name, m.hp, { field: m.onField, moves: moves.map(k => move(k, ...ETERNA_MOVES[k])), tera });
    return Object.assign(p, { isTerastallized: m.tera }, m.bossBars === undefined ? {}
      : { isBoss: () => true, isFainted: () => m.hp <= 0, bossSegmentIndex: m.bossBars - 1 });
  };
  const command = c => (c.switchTo !== undefined ? { command: Command.POKEMON, cursor: c.switchTo }
    : { command: Command.FIGHT, move: { move: MoveId[c.move], targets: c.targets ?? [BattlerIndex.ENEMY] } });
  const turnCommands = Object.fromEntries(cmds.map((c, f) => [f, c && command(c)]));
  const preTurnCommands = Object.fromEntries(cmds.map((c, f) => [f, c && { command: c.tera ? Command.TERA : command(c).command }]));
  const ours = [...cp.ours].sort((a, b) => a.slot - b.slot), party = ours.map(build), foes = cp.foes.map(build);
  // By default the double starts on T3, Eternamax's first turn.
  const getBattlerCount = () => battlers, getPokemonAllowedInBattle = () => party.filter((_, i) => ours[i].hp > 0);
  return guard({ seed, currentBattle: { waveIndex: wave, turn, turnCommands, preTurnCommands, getBattlerCount },
    phaseManager: { getCurrentPhase: () => phase }, getPlayerParty: () => party, getEnemyParty: () => foes, getPokemonAllowedInBattle });
};
const eternaPlay = (seed, turn, cmds) => oracleLineSeen(eternaAt(seed, turn, { phase: { phaseName: "MovePhase" }, cmds }));
const eternaDecide = (seed, turn, cp) => { const s = eternaAt(seed, turn, { cp }); scored = oracleLineCheck(s); console.log(`scored ${scoredText(scored)}`); return s; };
const eternaTweak = (turn, tweak) => { const cp = structuredClone(ETERNA_CP[turn]); tweak(cp); return cp; };
const AS_SAID = { 3: [{ move: "DRAGON_ASCENT", targets: [BattlerIndex.ENEMY] }, { move: "BEHEMOTH_BLADE", tera: true }] };
const FAINT = field => ({ phaseName: "SwitchPhase", isModal: true, doReturn: false, fieldIndex: field });

// ---- A double's step holds both field slots' commands, each slot's own null, and its replacements by field slot; one out of shape is ignored
{
  const seed = "a W200 run, handed";
  scene = eternaAt(seed, 1);
  assert.equal(hand("Eternatus's W200, singles then a double", eternaLine(seed)).ok, true);
  assert.equal(hand("a double asking a replacement alone", eternaLine(seed, { 4: double([null, null], { replacements: [{ slot: 2, species: SpeciesId.BLISSEY, field: 0 }] }) })).ok, true);
  const bad = input => hand("out of shape", eternaLine(seed, { 3: input })).why;
  assert.equal(bad(double([ASCENT])), "malformed", "a command for each field slot");
  assert.equal(bad(double([{ ...ASCENT, move: "DRAGON_ASCENT" }, null])), "malformed", "a command's move is the game's id");
  assert.equal(bad(double([{ kind: "run" }, null])), "malformed", "a command is a move or a switch");
  assert.equal(bad(double([{ ...ASCENT, target: { side: "foes", field: 2 } }, null])), "malformed", "a target is a field slot");
  assert.equal(bad(double([{ ...ASCENT, target: { side: "theirs", field: 0 } }, null])), "malformed", "a target's side is foes or ours");
  assert.equal(bad(double([null, BLADE], { replacements: [{ slot: 2, species: SpeciesId.BLISSEY }] })), "malformed", "a replacement names its field slot");
  assert.equal(bad(double([null, BLADE], { replacement: { slot: 2, species: SpeciesId.BLISSEY } })), "malformed", "a double's replacements are a list");
  assert.equal(bad(double([null, null])), "malformed", "a double that asks nothing is a step with no input");
  assert.equal(oracleLineModel(scene).steps.length, 5, "the held oracle line is the last one held whole");
}

// ---- A double's step names each field slot's mover, its Tera, its target and its replacement, and only a slot the step asks
{
  const seed = "a W200 run, drawn";
  scene = eternaAt(seed, 1);
  hand("Eternatus's W200", eternaLine(seed));
  const { rows } = plan("W200 T1, the line into Eternamax", scene);
  assert.equal(marks(rows), "▸····");
  const { act: t3 } = now("W200 T3, the first double", eternaAt(seed, 3));
  assert.equal(t3.summary, "⚔ ~ T3/5 · Rayquaza Dragon Ascent → Eternatus ; Zacian Tera Steel + Behemoth Blade");
  assert.ok(t3.rows.some(r => r.includes("← from Fight to the Tera button")), t3.rows.join("\n"));
  const { act: t4 } = now("W200 T4, Rayquaza asked nothing", eternaAt(seed, 4));
  assert.equal(t4.summary, "⚔ ~ T4/5 · Zacian Behemoth Blade · then send Blissey for Rayquaza");
  const { act: pick, card: c } = now("W200 T4's faint, the turn already 5", eternaAt(seed, 5, { cp: ETERNA_CP[3], phase: FAINT(0) }));
  assert.equal(pick.summary, "⚔ ~ T4/5 · send Blissey for Rayquaza");
  assert.deepEqual(cardEvent(c).oracleLine, { state: "on", turn: 4, of: 5 });
  assert.equal(now("W200 T5, Blissey in Rayquaza's slot", eternaAt(seed, 5)).act.summary, "⚔ ~ T5/5 · Blissey Seismic Toss ; Zacian Behemoth Blade");

  const late = "a W200 run, solved from T3";
  scene = eternaAt(late, 3);
  hand("from T3, handed on T3", { ...eternaLine(late), steps: eternaLine(late).steps.slice(2) });
  assert.match(plan("handed on T3, at T3", scene).rows[0], /^▸ T3 Rayquaza .* ; Zacian /, "the game names the first double's movers");
}

// ---- Two faints in a double ask a replacement for each field slot, and each faint prompt's call is its own slot's
{
  const seed = "a W200 run, both down";
  const both = double([null, BLADE], { replacements: [{ slot: 2, species: SpeciesId.BLISSEY, field: 0 }, { slot: 3, species: SpeciesId.SNORLAX, field: 1 }] });
  scene = eternaAt(seed, 4);
  hand("T4 fells Rayquaza and Zacian", eternaLine(seed, { 4: both }));
  assert.equal(now("W200 T4, both to fall", scene).act.summary,
    "⚔ ~ T4/5 · Zacian Behemoth Blade · then send Blissey for Rayquaza · then send Snorlax for Zacian");
  const first = now("W200 T4's first faint prompt", eternaAt(seed, 5, { cp: ETERNA_CP[3], phase: FAINT(0) })).act;
  assert.equal(first.summary, "⚔ ~ T4/5 · send Blissey for Rayquaza · then send Snorlax for Zacian");
  assert.ok(first.rows.some(r => r.startsWith("⤵ then send Snorlax for Zacian at the faint prompt")), first.rows.join("\n"));
  assert.equal(now("W200 T4's second faint prompt", eternaAt(seed, 5, { cp: ETERNA_CP[3], phase: FAINT(1) })).act.summary,
    "⚔ ~ T4/5 · send Snorlax for Zacian");
}

// ---- A faint prompt for a field slot the oracle line names no replacement for has no pick, though another slot's has one
{
  const seed = "a W200 run, Zacian down unplanned";
  scene = eternaAt(seed, 4);
  hand(seed, eternaLine(seed));
  const s = eternaAt(seed, 5, { cp: ETERNA_CP[3], phase: FAINT(1) });
  assert.equal(oracleLineModel(s).sending, null);
  assert.equal(now("W200 T4, a faint prompt for Zacian's slot", s).act.summary, "⚔ ~ T4/5 · Zacian Behemoth Blade · then send Blissey for Rayquaza");
}

// ---- With one able mon left after both field slots fall, either slot's faint prompt fills field 0, as the game's does
{
  const seed = "a W200 run, one left";
  scene = eternaAt(seed, 4);
  hand(seed, eternaLine(seed));
  const cp = eternaTweak(3, cp => { for (const m of cp.ours) if (m.species !== SpeciesId.BLISSEY) m.hp = 0; });
  assert.equal(now("W200 T4, Zacian's slot's faint prompt with Blissey the last", eternaAt(seed, 5, { cp, phase: FAINT(1) })).act.summary,
    "⚔ ~ T4/5 · send Blissey for Rayquaza");
}

// ---- A copied oracle line model still finds the replacements left to come after this faint prompt's
{
  const seed = "a W200 run, both down, copied";
  scene = eternaAt(seed, 4);
  hand(seed, eternaLine(seed, { 4: double([null, BLADE], { replacements: [{ slot: 2, species: SpeciesId.BLISSEY, field: 0 },
    { slot: 3, species: SpeciesId.SNORLAX, field: 1 }] }) }));
  const m = structuredClone(oracleLineModel(eternaAt(seed, 5, { cp: ETERNA_CP[3], phase: FAINT(0) })));
  assert.deepEqual(sendsToCome(m, oracleLineNow(m)).map(x => x.name), ["Snorlax"]);
  assert.equal(oracleStepSummary(m), "⚔ ~ T4/5 · send Blissey for Rayquaza · then send Snorlax for Zacian");
}

// ---- Both field slots pressed as the oracle line said match through the double, Eternamax's fresh bars included
{
  const seed = "a W200 run, on the line";
  scene = eternaAt(seed, 1);
  hand("Eternatus's W200, to score", eternaLine(seed));
  eternaPlay(seed, 1, [{ move: "DRAGON_ASCENT" }]);
  eternaDecide(seed, 2, ETERNA_CP[1]);
  eternaPlay(seed, 2, [{ move: "DRAGON_ASCENT" }]);
  eternaDecide(seed, 3, ETERNA_CP[2]);
  assert.deepEqual([scored.turn, scored.misses], [2, []], "Eternamax at full HP behind five bars is the claim, not a miss");
  eternaPlay(seed, 3, AS_SAID[3]);
  eternaDecide(seed, 4, ETERNA_CP[3]);
  assert.deepEqual([scored.turn, scored.misses], [3, []]);
  // Rayquaza's slot asks nothing on T4, so whatever it plays is no miss.
  eternaPlay(seed, 4, [{ move: "DRAGON_ASCENT" }, { move: "BEHEMOTH_BLADE" }]);
  const s = eternaDecide(seed, 5, ETERNA_CP[4]);
  assert.deepEqual([scored.turn, scored.misses], [4, []]);
  assert.equal(marks(plan("W200 T5, every checkpoint matched", s).rows), "✓✓✓✓▸");
}

// ---- One field slot pressed otherwise leaves the oracle line as the player's input; both as said, drawn otherwise, is the oracle line's own miss
{
  const missed = (seed, cmds) => {
    scene = eternaAt(seed, 3);
    hand(seed, eternaLine(seed));
    eternaPlay(seed, 3, cmds);
    const s = eternaDecide(seed, 4, eternaTweak(3, cp => { cp.foes[0].hp = 1700; }));
    return now(`W200 T4, ${seed}`, s).act;
  };
  const other = missed("Zacian's Close Combat", [AS_SAID[3][0], { move: "CLOSE_COMBAT", tera: true }]);
  assert.equal(scored.wrong, false);
  assert.ok(other.summary.startsWith("off the line · ~ "), other.summary);
  assert.deepEqual(offRows(other), ["✗ T3 Eternatus expected 1500/2400 · came 1700/2400"]);
  missed("Zacian's Behemoth Blade without Tera", [AS_SAID[3][0], { move: "BEHEMOTH_BLADE" }]);
  assert.equal(scored.wrong, false, "Tera is part of the slot's command");
  missed("Dragon Ascent into Zacian", [{ move: "DRAGON_ASCENT", targets: [BattlerIndex.PLAYER_2] }, AS_SAID[3][1]]);
  assert.equal(scored.wrong, false, "a target the step names is part of its command");
  const drawn = missed("both pressed as said", AS_SAID[3]);
  assert.equal(scored.wrong, true);
  assert.ok(drawn.summary.startsWith("off the line · ! "), drawn.summary);
}

// ---- A replacement other than the oracle line's, sent into its field slot, is the player's input
{
  const seed = "a W200 run, Snorlax sent";
  scene = eternaAt(seed, 4);
  hand(seed, eternaLine(seed));
  eternaPlay(seed, 4, [null, { move: "BEHEMOTH_BLADE" }]);
  eternaDecide(seed, 5, eternaTweak(4, cp => {
    Object.assign(cp.ours[0], { slot: 3, onField: false });
    Object.assign(cp.ours[3], { slot: 0, onField: true });
  }));
  assert.equal(scored.wrong, false);
  assert.deepEqual(scored.misses.map(m => `${m.name} ${m.expected} · ${m.came}`),
    ["Blissey in front · benched", "Snorlax benched · in front"]);
}

// ---- A pivot is named after the turn's call and at the switch-out prompt's turn, in a single as in a double; one out of shape is ignored
{
  const seed = "a W200 run, pivoting";
  scene = eternaAt(seed, 1);
  const pivot = (slot, key, field) => ({ slot, species: SpeciesId[key], ...(field === undefined ? {} : { field }) });
  hand("T1 pivots to Blissey", eternaLine(seed, { 1: { ...ASCENT, pivots: [pivot(2, "BLISSEY")] } }));
  const { act: t1 } = now("W200 T1, Rayquaza pivoting out", scene);
  assert.equal(t1.summary, "⚔ ~ T1/5 · Rayquaza Dragon Ascent · then send Blissey for Rayquaza");
  assert.ok(t1.rows.some(r => r.startsWith("⤵ then send Blissey for Rayquaza at the switch-out prompt")), t1.rows.join("\n"));
  hand("T3's Zacian pivots to Snorlax", eternaLine(seed, { 3: double([ASCENT, BLADE], { pivots: [pivot(3, "SNORLAX", 1)] }) }));
  assert.equal(now("W200 T3, Zacian pivoting out", eternaAt(seed, 3)).act.summary,
    "⚔ ~ T3/5 · Rayquaza Dragon Ascent ; Zacian Behemoth Blade · then send Snorlax for Zacian");
  const bad = input => hand("out of shape", eternaLine(seed, { 3: input })).why;
  assert.equal(bad(double([ASCENT, BLADE], { pivots: [pivot(3, "SNORLAX")] })), "malformed", "a double's pivot names its field slot");
  assert.equal(bad({ ...ASCENT, pivots: pivot(2, "BLISSEY") }), "malformed", "a turn's pivots are a list");
  assert.equal(hand("a queued turn's pivot alone", eternaLine(seed, { 2: { kind: "queued", pivots: [pivot(2, "BLISSEY")] } })).ok, true);
}

// Plasma Grunts' double: Rayquaza and Zacian against Liepard and Garbodor, Scraggy behind them. Garbodor falls on T1 and
// Scraggy takes its field slot; Zacian pivots out to Blissey on T2.
const PAIR_CP = {
  0: { ours: [state("RAYQUAZA", 0, true, 400, 400), state("ZACIAN", 1, true, 350, 350), ...bench()],
    foes: [state("LIEPARD", 0, true, 300, 300), state("GARBODOR", 1, true, 350, 350), state("SCRAGGY", 2, false, 280, 280)] },
  1: { ours: [state("RAYQUAZA", 0, true, 380, 400), state("ZACIAN", 1, true, 350, 350), ...bench()],
    foes: [state("LIEPARD", 0, true, 120, 300), state("SCRAGGY", 1, true, 280, 280), state("GARBODOR", 2, false, 0, 350)] },
  2: { ours: [state("RAYQUAZA", 0, true, 360, 400), state("BLISSEY", 1, true, 600, 600), state("ZACIAN", 2, false, 350, 350), state("SNORLAX", 3, false, 500, 500)],
    foes: [state("LIEPARD", 0, true, 20, 300), state("SCRAGGY", 1, true, 80, 280), state("GARBODOR", 2, false, 0, 350)] },
  3: { ours: [state("RAYQUAZA", 0, true, 360, 400), state("BLISSEY", 1, true, 600, 600), state("ZACIAN", 2, false, 350, 350), state("SNORLAX", 3, false, 500, 500)],
    foes: [state("LIEPARD", 0, false, 0, 300), state("SCRAGGY", 1, false, 0, 280), state("GARBODOR", 2, false, 0, 350)] },
};
const aimed = (side, field) => ({ target: { side, field } });
const PAIR_INPUTS = {
  1: double([{ ...ASCENT, ...aimed("foes", 1) }, { ...BLADE, ...aimed("foes", 0) }]),
  2: double([{ ...ASCENT, ...aimed("foes", 1) }, { kind: "move", move: MoveId.CLOSE_COMBAT, tera: false, ...aimed("foes", 0) }],
    { pivots: [{ slot: 2, species: SpeciesId.BLISSEY, field: 1 }] }),
  3: double([ASCENT, { kind: "move", move: MoveId.SEISMIC_TOSS, tera: false, ...aimed("foes", 1) }]),
};
const pairLine = seed => ({ seed, wave: 62, gameVersion: "1.12.1.3", receipt: [], luck: [],
  steps: [1, 2, 3].map(turn => ({ turn, input: PAIR_INPUTS[turn], checkpoint: PAIR_CP[turn] })) });
const pairAt = (seed, turn, opts = {}) => eternaAt(seed, turn, { cp: PAIR_CP[turn - 1], wave: 62, battlers: 2, ...opts });

// ---- A trainer double's step names each field slot's target among two foes, the foe sent into a fallen one's slot included
{
  const seed = "a W62 run, a trainer double";
  scene = pairAt(seed, 1);
  assert.equal(hand("Plasma Grunts' W62", pairLine(seed)).ok, true);
  assert.equal(now("W62 T1", scene).act.summary, "⚔ ~ T1/3 · Rayquaza Dragon Ascent → Garbodor ; Zacian Behemoth Blade → Liepard");
  assert.equal(now("W62 T2, Scraggy in Garbodor's slot", pairAt(seed, 2)).act.summary,
    "⚔ ~ T2/3 · Rayquaza Dragon Ascent → Scraggy ; Zacian Close Combat → Liepard · then send Blissey for Zacian");
  assert.equal(now("W62 T3, Blissey in Zacian's slot", pairAt(seed, 3)).act.summary,
    "⚔ ~ T3/3 · Rayquaza Dragon Ascent ; Blissey Seismic Toss → Scraggy");
}

// ---- A trainer double pressed as said matches; a pivot other than the oracle line's is the player's input
{
  const seed = "a W62 run, on the line";
  const pairPlay = (turn, cmds) => oracleLineSeen(pairAt(seed, turn, { phase: { phaseName: "MovePhase" }, cmds }));
  const pairDecide = (turn, cp) => { scored = oracleLineCheck(pairAt(seed, turn, { cp })); console.log(`scored ${scoredText(scored)}`); };
  scene = pairAt(seed, 1);
  hand("Plasma Grunts' W62, to score", pairLine(seed));
  pairPlay(1, [{ move: "DRAGON_ASCENT", targets: [BattlerIndex.ENEMY_2] }, { move: "BEHEMOTH_BLADE", targets: [BattlerIndex.ENEMY] }]);
  pairDecide(2, PAIR_CP[1]);
  assert.deepEqual([scored.turn, scored.misses], [1, []]);
  pairPlay(2, [{ move: "DRAGON_ASCENT", targets: [BattlerIndex.ENEMY_2] }, { move: "CLOSE_COMBAT", targets: [BattlerIndex.ENEMY] }]);
  const snorlax = structuredClone(PAIR_CP[2]);
  Object.assign(snorlax.ours[1], { slot: 3, onField: false });
  Object.assign(snorlax.ours[3], { slot: 1, onField: true });
  pairDecide(3, snorlax);
  assert.equal(scored.wrong, false, "the pick at the switch-out prompt was the player's");
  assert.deepEqual(scored.misses.map(m => `${m.name} ${m.expected} · ${m.came}`), ["Blissey in front · benched", "Snorlax benched · in front"]);
}

// ---- A double's step aimed at our own partner names it as ours, and only that press follows it (#794)
{
  const seed = "a W62 run, aimed at our partner";
  const PUFF = { kind: "move", move: MoveId.POLLEN_PUFF, tera: false };
  const partnerLine = () => {
    const line = pairLine(seed);
    line.steps[0] = { ...line.steps[0], input: double([{ ...ASCENT, ...aimed("foes", 1) }, { ...BLADE, ...aimed("ours", 0) }]) };
    line.steps[2] = { ...line.steps[2], input: double([ASCENT, { ...PUFF, ...aimed("ours", 0) }]) };
    return line;
  };
  scene = pairAt(seed, 1);
  assert.equal(hand("Plasma Grunts' W62, at our partner", partnerLine()).ok, true);
  assert.equal(now("W62 T1, Behemoth Blade into Rayquaza", scene).act.summary,
    "⚔ ~ T1/3 · Rayquaza Dragon Ascent → Garbodor ; Zacian Behemoth Blade → our Rayquaza");
  scene = pairAt(seed, 3);
  hand("Plasma Grunts' W62, at our partner, T3", partnerLine());
  assert.equal(now("W62 T3, Pollen Puff on Rayquaza", scene).act.summary,
    "⚔ ~ T3/3 · Rayquaza Dragon Ascent ; Blissey Pollen Puff → our Rayquaza");

  const pressed = (name, blade, cp) => {
    scene = pairAt(seed, 1);
    hand(`W62 T1, Behemoth Blade at ${name}`, partnerLine());
    oracleLineSeen(pairAt(seed, 1, { phase: { phaseName: "MovePhase" },
      cmds: [{ move: "DRAGON_ASCENT", targets: [BattlerIndex.ENEMY_2] }, { move: "BEHEMOTH_BLADE", targets: [blade] }] }));
    scored = oracleLineCheck(pairAt(seed, 2, { cp }));
    console.log(`scored ${scoredText(scored)}`);
  };
  pressed("Rayquaza", BattlerIndex.PLAYER, PAIR_CP[1]);
  assert.deepEqual([scored.turn, scored.misses], [1, []], "Behemoth Blade into Rayquaza is the step as said");
  const liepardHit = structuredClone(PAIR_CP[1]);
  liepardHit.foes[0].hp = 20;
  pressed("Liepard", BattlerIndex.ENEMY, liepardHit);
  assert.equal(scored.wrong, false, "a foe hit where the step aims at our partner is the player's input");
}

// ---- Neither a handoff nor a card drawn from it writes to the game
{
  console.log(`writes to the game: ${writes.length ? writes.join(", ") : "none"}`);
  assert.deepEqual(writes, []);
}
