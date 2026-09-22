// The group list, as plain data and with no drawn card in sight (#349 §1, §5, §6). A renderer's product is an
// ordered list of `{ id, label, summary, rows }`, so this is where the content half of the card is pinned: which
// groups a kind has and in what order, where each summary is read from, that a group with nothing to say is headed
// by its label alone, and that the card's plain text is the projection of the list and nothing else.
//
// Cards are built from tables here, the way cardtest builds them: a layout change and a wording change belong in
// different diffs, and nothing below asserts a node.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

// Enough page for the bundle to build its element and for a row to be a node; nothing here reads one.
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud", { expose: true }));
const { drawBattle } = globalThis.__hud["96-render-battle"];
const { GROUP_IDS, cardText, groupsText } = globalThis.__hud["90-render"];


const show = (label, card) => {
  const groups = groupsText(drawBattle(card));
  console.log(`== ${label}`);
  for (const g of groups) {
    console.log(`${g.id} | ${g.label || "—"} | ${g.summary ?? "—"}`);
    for (const r of g.rows) console.log(`    ${r}`);
  }
  // The ids are closed at eight and come in one fixed order, the tabs cap at five, and every card has an `act`
  // group that is never empty (§1).
  for (const g of groups) assert.ok(GROUP_IDS.includes(g.id), `${g.id} is not one of the eight`);
  assert.deepEqual(groups.map(g => g.id), groups.map(g => g.id).slice().sort((a, b) => GROUP_IDS.indexOf(a) - GROUP_IDS.indexOf(b)), "groups come in the fixed order");
  // Five tabs is the cap, enforced by the vocabulary rather than by the layout: the bar never wraps, never scrolls
  // and has no overflow menu (#349 §1). It lives in that spec and nowhere else — CONTEXT.md stays glossary-only.
  assert.ok(groups.length <= 5, "five tabs is the cap");
  assert.equal(groups[0]?.id, "act", "every card leads with act");
  assert.ok(groups[0].summary, "act is never empty");
  // `text` is derived from the group list rather than read back off the drawn card (§5), so it carries every group
  // in the same fixed order and nothing besides — and its first line is the call, which is the line the watch CLI
  // prints per event. What a heading reads is pinned against literals at each card below.
  const lines = cardText(card).split("\n");
  assert.equal(lines[0], groups[0].summary, "the first line of the text is the act summary");
  const rows = groups.flatMap(g => g.rows);
  assert.deepEqual(lines.filter(l => rows.includes(l)), rows, "every group's rows, in the group order and no other");
  assert.equal(lines.length, rows.length + groups.filter(g => g.label || g.summary).length, "a heading a group, and nothing else");
  return groups;
};

// ---- The tables
const slot = (over = {}) => ({ icon: null, name: "Charizard", move: "Flamethrower", type: "Fire", target: { icon: null, name: "Lycanroc" },
  ko: 2, koEach: null, threat: null, notes: [], enter: false, ...over });
// `level` is the planner's own: "ko" before our mon acts, "risk" otherwise, where `after` marks a risk that is a
// likely KO all the same, only once it has acted.
const threat = (over = {}) => ({ level: "ko", after: false, from: "Lycanroc", move: "Stone Edge", type: "Rock", e: 4, pct: 567, pko: 100, hits: 0, next: false, ...over });
const foe = (over = {}) => ({ icon: null, name: "Lycanroc", lv: 70, types: ["Rock"], hp: 100, tera: false, boss: false, status: null,
  traps: [], weak: [["Water", "×2"]], avoid: [], likely: null, pick: null, notes: [], ...over });
const field = (over = {}) => ({ slots: [slot()], switches: [], optional: [], freeSwitch: false, noSafeSwitch: false,
  targeting: null, freeEntry: null, nextIn: null, ...over });
const battle = (over = {}) => ({
  kind: "battle", wave: 89, title: "W89", trainer: false, double: false, verdict: "fight",
  field: field(), rows: [foe()], enemySwitches: [], ifStay: null, order: [], team: [],
  moveTypes: ["Fire", "Water", "Grass"], weak: [], teamPlan: null, catch: null, preview: null, ahead: null, ...over,
});

// A wild wave's road: the wave the seed already holds, then the big fight the calendar does.
const preview = { wave: 90, type: "wild", double: false, fixed: false, trainer: null, me: null,
  foes: [{ icon: null, name: "Toxicroak", level: 71, types: ["Poison", "Fighting"], ability: "Dry Skin", segments: 1, moves: ["Sludge Bomb"] }],
  notes: [], missed: [], confidence: {} };
const ahead = { next: { wave: 95, in: 6, label: "gym leader", trainer: null, exact: false, double: false, bars: 1,
    foes: [{ name: "Garchomp", level: 96 }], rewards: { tiers: ["Rogue"] } },
  readiness: { verdict: "watch", notes: [{ good: false, text: "nothing hits Garchomp super-effectively" }] },
  heal: { wave: 100 }, fightsBeforeHeal: 1, thisWave: null,
  luck: { value: 3, grade: "C", upgradePct: 6 }, eternatus: null };
// A ball worth throwing, and a second target that isn't: the best target is the one the summary names.
const catchAdvice = {
  targets: [
    { icon: null, name: "Toxicroak", verdict: "catch", why: "new species, covers Ground weakness",
      best: { ball: "Ultra Ball", short: "UB", key: "ub", count: 4, p: 0.62 },
      chance: [{ ball: "Great Ball", short: "GB", key: "gb", count: 9, p: 0.44 }, { ball: "Ultra Ball", short: "UB", key: "ub", count: 4, p: 0.62 }],
      reasons: [{ kind: "account", text: "not in the dex" }, { kind: "team", text: "resists Ground" }] },
    { icon: null, name: "Zubat", verdict: "skip", why: "nothing new", best: null, chance: [], reasons: [] },
  ],
};

// ---- Wild: act · foes · catch · road, and a threat turn that wants a switch
{
  const card = battle({
    verdict: "danger",
    field: field({ slots: [slot({ threat: threat() })],
      switches: [{ out: { icon: null, name: "Charizard", threat: threat() }, in: { icon: null, name: "Blastoise", takes: { pct: 23, e: 0.5, move: "Stone Edge" } } }] }),
    rows: [foe({ likely: { move: "Stone Edge", type: "Rock", pct: 567, first: 100, at: null, hits: 0, confidence: "exact" } })],
    weak: [["Rock", 2], ["Electric", 2]],
    catch: catchAdvice, preview, ahead,
  });
  const groups = show("wild · threat turn needing a switch", card);
  assert.deepEqual(groups.map(g => g.id), ["act", "foes", "catch", "road"]);
  // The danger entries, not the fallback: something threatens a KO (§6).
  assert.equal(groups[1].summary, "💀 Charizard ← Lycanroc Stone Edge");
  assert.equal(groups[2].summary, "catch Toxicroak — Ultra 62%");
  // `road` merges the preview and the look-ahead, joined with ` · `.
  assert.ok(groups[3].summary.includes(" · gym leader in 6 (W95) watch"), groups[3].summary);
}

// ---- Wild with nothing threatening a KO: the foes line falls back to the party's own weakness
{
  const card = battle({ weak: [["Fire", 2]], preview });
  const groups = show("wild · quiet, and no catch", card);
  assert.deepEqual(groups.map(g => g.id), ["act", "foes", "road"]);
  assert.equal(groups[1].summary, "we're weak to Fire ×2");
  // A group is headed by its label and its summary; `act` by its summary alone, since the strip above it is its
  // label (§6). Literals, so the rule is pinned rather than restated.
  const text = cardText(card);
  assert.ok(text.includes("\nFoes: we're weak to Fire ×2\n"), text);
  assert.ok(text.includes("\nRoad: W90 wild — Toxicroak L71\n🔮 Next W90 wild\n"), text);
  assert.ok(text.startsWith("Charizard Flamethrower → Lycanroc · 2 hits\n🎯 W89\n"), text);
  // No ball worth throwing means no catch group at all — an empty tab is filler (§6).
  assert.ok(!groups.some(g => g.id === "catch"));
  // Only the preview: the look-ahead is absent, so the road line is the preview string alone.
  assert.equal(groups[2].summary, "W90 wild — Toxicroak L71");
}

// ---- A catch worth a second thought but not a verdict: the group is drawn, and heads itself with its label alone
{
  const card = battle({ weak: [["Fire", 2]], catch: { targets: [
    { icon: null, name: "Zubat", verdict: "maybe", why: "covers Flying", best: { ball: "Great Ball", short: "GB", key: "gb", count: 9, p: 0.44 },
      chance: [{ ball: "Great Ball", short: "GB", key: "gb", count: 9, p: 0.44 }], reasons: [] },
  ] } });
  const groups = show("wild · a maybe, which is not a catch verdict", card);
  assert.deepEqual(groups.map(g => g.id), ["act", "foes", "catch"]);
  // A `maybe` is drawn but concludes nothing: `catch.summary` is empty where there is no catch verdict (§6), and the
  // group falls back on the same rule any group with nothing to conclude lives by.
  assert.equal(groups[2].summary, null);
  assert.ok(groups[2].rows.length, "the maybe is still drawn");
  assert.ok(cardText(card).includes("\nCatch\n🎯 Zubat maybe:"), cardText(card));
}

// ---- Trainer: act · foes · plan · road, six foes and a fight plan
{
  const chomp = { icon: null, name: "Garchomp" };
  const card = battle({
    trainer: true, verdict: "trainer", title: "W89 · Cynthia", order: [{ icon: null, name: "Blastoise" }, { icon: null, name: "Venusaur" }],
    field: field({ slots: [slot({ name: "Blastoise", move: "Wave Crash", type: "Water", target: chomp, ko: 2 })] }),
    rows: [foe({ name: "Garchomp", lv: 96, types: ["Dragon", "Ground"], weak: [["Ice", "×4"]], boss: true }),
      foe({ name: "Spiritomb", lv: 95, types: ["Ghost", "Dark"], weak: [] }),
      foe({ name: "Roserade", lv: 95, types: ["Grass", "Poison"], weak: [["Fire", "×2"]] })],
    team: [["Ice", 2], ["Fire", 1]],
    moveTypes: ["Water", "Ice", "Fire"],
    teamPlan: { result: "win", summary: null,
      win: { icon: null, name: "Garchomp", boss: true, kills: 2, of: 4 },
      reserve: [{ icon: null, name: "Lapras", for: { icon: null, name: "Garchomp" }, per: 34, acts: true }],
      only: [], sacrifice: [], prefers: null, warnings: ["Roserade outspeeds the whole bench"], notes: [],
      steps: [{ send: { icon: null, name: "Blastoise" }, entry: null, move: "Wave Crash", type: "Water", vs: chomp, why: "KO · 40% left", sacrifice: false, notes: [] },
        { send: { icon: null, name: "Lapras" }, entry: "switch", move: "Ice Beam", type: "Ice", vs: { icon: null, name: "Roserade" }, why: "KO · 70% left", sacrifice: false, notes: [] }] },
    preview, ahead,
  });
  const groups = show("trainer · fight plan", card);
  assert.deepEqual(groups.map(g => g.id), ["act", "foes", "plan", "road"]);
  // Nothing threatens a KO and no attacking type hits two of us, so the foes group has no summary: its label alone
  // heads it, in the text as in the pane, with no filler count (§6).
  assert.equal(groups[1].summary, null);
  assert.ok(cardText(card).includes("\nFoes\nfoes weak to: Ice ×2 Fire ×1\n"), cardText(card));
  assert.equal(groups[2].summary, "winnable · ☠ Garchomp KOs 2/4 · Roserade outspeeds the whole bench");
  // A trainer battle never offers a ball, so there is no catch group whatever the wave holds.
  assert.ok(!groups.some(g => g.id === "catch"));
}

// ---- A double with a return: the foe coming back from the other slot this same turn (#285)
{
  const card = battle({
    trainer: true, double: true, verdict: "trainer", title: "W89 · Tester",
    field: field({ slots: [slot({ name: "Blastoise", move: "Wave Crash", type: "Water", target: { icon: null, name: "Ludicolo" } }),
      slot({ name: "Venusaur", move: "Power Whip", type: "Grass", target: { icon: null, name: "Arcanine" }, threat: threat({ level: "risk", after: true, from: "Arcanine", move: "Flare Blitz", type: "Fire", e: 2, pct: 88, pko: 70 }) })] }),
    enemySwitches: [{ from: { icon: null, name: "Arcanine" }, to: { icon: null, name: "Gyarados" }, sure: true, back: true }],
    rows: [foe({ name: "Ludicolo", lv: 80, types: ["Water", "Grass"] }), foe({ name: "Arcanine", lv: 80, types: ["Fire"] })],
    weak: [["Rock", 2]],
  });
  const groups = show("double · a return from the other slot", card);
  assert.deepEqual(groups.map(g => g.id), ["act", "foes"]);
  // A threat that only lands once the mon has acted is `⚠`, not `💀`.
  assert.equal(groups[1].summary, "⚠ Venusaur ← Arcanine Flare Blitz");
}

// ---- The coach that cannot read the enemy's move: one act group, and nothing else
{
  const card = battle({ unavailable: "the enemy AI call threw", verdict: "unavailable", field: null, rows: [], weak: [] });
  const groups = show("unavailable", card);
  assert.deepEqual(groups.map(g => g.id), ["act"]);
  assert.equal(groups[0].summary, "no advice — the enemy AI call threw");
  assert.equal(cardText(card), "no advice — the enemy AI call threw\n🎯 W89");
  // The inline ⚠ row that used to carry it is gone: the summary carries it.
  assert.ok(!groups[0].rows.some(r => r.includes("no advice")), groups[0].rows.join("\n"));
}

console.log("ok");
