// The card module on its own: the battle verdict and the plain-text summary, asserted on models rather than on drawn
// nodes. The summary has one declared shape, so a contract test holds every card kind to exactly those keys — that is
// what probe.js's old hand-kept key list was guarding.
import assert from "node:assert";
import { bundle } from "../hud-bundle.mjs";

// 60-card and the summaries are pure. The bundle still builds the panel element and starts its timer, so stub only
// enough of the page for that: no DOM mock, and nothing here reads a node.
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
const node = () => ({ style: {}, addEventListener() {}, append() {}, replaceChildren() {}, remove() {} });
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud", { expose: true }));
const { cardSummary, summaryKeys } = globalThis.__hud["60-card"];

const threat = (level, from = "Rattata", move = "Tackle") => ({ level, from, move, type: "Normal", e: 1, pct: 80, pko: 90 });
const slot = (over = {}) => ({ name: "Charizard", move: "Ember", type: "Fire", cat: "special", target: { name: "Rattata" },
  then: null, ko: 1, koEach: null, threat: null, traps: [], notes: [], ...over });
const battle = (over = {}) => ({
  kind: "battle", wave: 12, trainer: false, double: false, title: "W12",
  field: { slots: [slot()], switches: [], optional: [], freeSwitch: false, noSafeSwitch: false, targeting: null },
  rows: [{ name: "Rattata", boss: false }], enemySwitches: [], order: [], team: [],
  teamPlan: null, catch: null, preview: null, ahead: null, ...over,
});
const verdictOf = m => cardSummary(m).verdict;

// ---- The verdict, most specific first
{
  // Nothing to decide: a wild fight every slot wins in one or two hits.
  assert.equal(verdictOf(battle()), "easy");
  // A second hit is still easy; a third is not.
  assert.equal(verdictOf(battle({ field: { ...battle().field, slots: [slot({ ko: 2 })] } })), "easy");
  assert.equal(verdictOf(battle({ field: { ...battle().field, slots: [slot({ ko: 3 })] } })), "fight");
  // A spread move that KOs the two foes on different turns is judged by the slower one.
  assert.equal(verdictOf(battle({ field: { ...battle().field, slots: [slot({ target: "both", ko: 0, koEach: [1, 3] })] } })), "fight");
  assert.equal(verdictOf(battle({ trainer: true })), "trainer");
  // A 💀 on a field slot, a boss, or nowhere safe to switch is danger — ahead of a catch.
  assert.equal(verdictOf(battle({ field: { ...battle().field, slots: [slot({ ko: 3, threat: threat("ko") })] } })), "danger");
  assert.equal(verdictOf(battle({ rows: [{ name: "Gyarados", boss: true }] })), "danger");
  assert.equal(verdictOf(battle({ field: { ...battle().field, noSafeSwitch: true } })), "danger");
  // A catch worth a ball, on a wave that is otherwise a plain fight.
  const worth = { targets: [{ name: "Rattata", verdict: "catch", why: "new species" }] };
  assert.equal(verdictOf(battle({ field: { ...battle().field, slots: [slot({ ko: 3 })] }, catch: worth })), "catch");
  // …and it beats the easy collapse too: an easy wave with a ball worth throwing still opens the panel.
  assert.equal(verdictOf(battle({ catch: worth })), "catch");
  assert.equal(verdictOf(battle({ catch: { targets: [{ name: "Rattata", verdict: "skip", why: "already caught" }] }, field: { ...battle().field, slots: [slot({ ko: 3 })] } })), "fight");
  // A fight plan that is going to be lost is never easy.
  assert.equal(verdictOf(battle({ teamPlan: { result: "lost", steps: [], warnings: [], sacrifice: [], reserve: [] } })), "fight");
  console.log("verdicts ok");
}

// ---- The battle summary: the ⚔ line, the KO-level danger and the plan
{
  const m = battle({
    trainer: true,
    field: { ...battle().field,
      slots: [slot({ ko: 2, threat: threat("ko", "Butterfree", "Gust") }), slot({ name: "Venusaur", move: "Vine Whip", target: "both", ko: 0, koEach: [2, 3] })],
      switches: [{ out: { name: "Pidgey", threat: { ...threat("risk"), after: true } }, in: { name: "Blastoise" } }] },
    teamPlan: { result: "win", steps: [], warnings: ["Butterfree outspeeds"], sacrifice: [],
      reserve: [{ name: "Pidgey", for: { name: "Butterfree" } }], win: { name: "Charizard", kills: 2, of: 3 } },
  });
  const s = cardSummary(m);
  // `trainer` outranks `danger`: the precedence is easy, trainer, danger, catch, fight.
  assert.equal(s.verdict, "trainer");
  assert.equal(s.field, "Charizard Ember → Rattata · 2 hits ; Venusaur Vine Whip → both · 3 hits");
  assert.deepEqual(s.danger, [
    { mon: "Charizard", from: "Butterfree", move: "Gust", level: "ko", saveFor: null },
    { mon: "Pidgey", from: "Rattata", move: "Tackle", level: "after", saveFor: "Butterfree" },
  ]);
  assert.equal(s.plan, "winnable · ☠ Charizard KOs 2/3 · Butterfree outspeeds");
  console.log("battle summary ok");
  console.log(JSON.stringify(s));
}

// ---- One declared shape: every kind carries exactly the same keys
{
  const kinds = {
    battle: battle(),
    learn: { kind: "learn", wave: 12, verdict: ["Learn → forget Ember", "#6d6"], forget: 1, team: { onlyType: "Dark" } },
    rewards: { kind: "rewards", wave: 12, pick: 0, free: [{ name: "Leftovers", holder: { name: "Charizard" } }], buys: [], rerollAhead: null,
      audit: { findings: [{ text: "Charizard has one answer", level: "high" }] }, preview: null, ahead: null },
    biome: { kind: "biome", wave: 30, options: [{ label: "Swamp", score: 85, verdict: "pick", reasons: [{ text: "2 mons hit SE" }] }] },
    encounter: { kind: "encounter", wave: 31, name: "Mysterious Chest", known: true, pick: 0,
      options: [{ label: "Open it", verdict: "take", outcome: "pick of 3 Ultra items" }, { label: "Leave", verdict: "avoid" }] },
    starters: { kind: "starters", wave: null, limit: 10, picks: [{ label: "best", cost: 10, weak: [], members: [{ name: "Gible", role: "carry" }] }] },
    fusion: { kind: "fusion", wave: 40, picked: null, better: null, rows: [{ base: { name: "Garchomp" }, other: { name: "Dragonite" }, value: 21, fuse: true }] },
  };
  const declared = summaryKeys();
  for (const [kind, model] of Object.entries(kinds)) {
    const s = cardSummary(model);
    assert.deepEqual(Object.keys(s), declared, `${kind} summary keys`);
    assert.equal(s.kind, kind);
    // Exactly one card field is filled in, and it is this card's own.
    const own = { battle: "verdict", learn: "learn", rewards: "rewards", biome: "biome", encounter: "encounter", starters: "starters", fusion: "fusion" }[kind];
    assert.notEqual(s[own], null, `${kind} fills ${own}`);
    for (const k of ["learn", "rewards", "encounter", "biome", "fusion", "starters"]) {
      if (k !== own) assert.equal(s[k], null, `${kind} leaves ${k} null`);
    }
  }
  assert.equal(cardSummary(null), null);
  console.log(`contract ok: ${declared.join(" ")}`);
  for (const [kind, model] of Object.entries(kinds)) {
    const s = cardSummary(model);
    const own = { battle: "verdict", learn: "learn", rewards: "rewards", biome: "biome", encounter: "encounter", starters: "starters", fusion: "fusion" }[kind];
    console.log(`${kind}: ${s[own]}`);
  }
}

// ---- The card event: the kind the stream uses, the key it deduplicates on, and the leading call (§11.1)
{
  const { cardEvent } = globalThis.__hud["60-card"];
  // A battle is keyed on the wave alone and carries the glossary's verdict.
  assert.deepEqual(cardEvent(battle()), { kind: "battle", key: "12", wave: 12, verdict: "easy" });
  // The panel's `rewards` card goes out as `reward`; a reroll changes the free names, so the key moves with them.
  const rewards = { kind: "rewards", wave: 15, pick: 0, free: [{ name: "Leftovers", holder: { name: "Charizard" } }, { name: "Ether" }], buys: [], rerollAhead: null, audit: null, preview: null, ahead: null };
  assert.deepEqual(cardEvent(rewards), { kind: "reward", key: "15|Leftovers,Ether", wave: 15, verdict: "take Leftovers → Charizard" });
  assert.equal(cardEvent({ ...rewards, free: [{ name: "Ether" }] }).key, "15|Ether");
  // Learn: wave, pokémon and the move on offer, with the learn call.
  const learn = { kind: "learn", wave: 14, name: "Charmeleon", move: { name: "Flamethrower" }, verdict: ["Learn → forget Ember", "#6d6"], forget: 1, team: { onlyType: "Dark" } };
  assert.deepEqual(cardEvent(learn), { kind: "learn", key: "14|Charmeleon|Flamethrower", wave: 14, verdict: "Learn → forget Ember" });
  // Biome: the wave, and the option the card picks — not the first one it lists.
  const biome = { kind: "biome", wave: 30, options: [{ label: "Construction Site", score: 55, verdict: "keep", reasons: [] }, { label: "Swamp", score: 85, verdict: "pick", reasons: [{ text: "2 mons hit SE" }] }] };
  assert.deepEqual(cardEvent(biome), { kind: "biome", key: "30", wave: 30, verdict: "Swamp" });
  // An encounter is keyed on its own name, and its call is `take …`, `your call` or `not judged`.
  const encounter = { kind: "encounter", wave: 31, name: "Mysterious Chest", known: true, pick: 0, options: [{ label: "Open it", verdict: "take", outcome: "pick of 3 Ultra items" }, { label: "Leave", verdict: "avoid" }] };
  assert.deepEqual(cardEvent(encounter), { kind: "encounter", key: "31|Mysterious Chest", wave: 31, verdict: "take Open it" });
  assert.equal(cardEvent({ ...encounter, pick: -1, known: false }).verdict, "not judged");
  assert.equal(cardEvent({ ...encounter, pick: -1 }).verdict, "your call");
  // A continuous encounter asks again on the same wave under the same name, so a minigame turn keys on the mon in
  // front of you and its two stages — otherwise all three Safari mons would stream as one event.
  const safari = { kind: "encounter", wave: 31, name: "Safari Zone", known: true, pick: 0,
    minigame: { mon: "Nidorina", left: 2, catchStage: 0, fleeStage: 0 },
    options: [{ label: "Throw a ball", verdict: "take", outcome: "37% to catch it now" }, { label: "Flee", verdict: "avoid" }] };
  assert.equal(cardEvent(safari).key, "31|Safari Zone|Nidorina|2|0,0");
  assert.notEqual(cardEvent({ ...safari, minigame: { ...safari.minigame, catchStage: 2 } }).key, cardEvent(safari).key);
  assert.equal(cardEvent(null), null);
  console.log("card events ok");
}
