// The group list, as plain data and with no drawn card in sight (#349 §1, §5, §6). A renderer's product is an
// ordered list of `{ id, label, summary, rows }`, so this is where the content half of the card is pinned: which
// groups a kind has and in what order, where each summary is read from, that a group with nothing to say is headed
// by its label alone, and that the card's plain text is the projection of the list and nothing else.
//
// Cards are built from tables here, the way cardtest builds them: a layout change and a wording change belong in
// different diffs, and nothing below asserts a node.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { GROUP_IDS as RELAY_GROUP_IDS, cardBody } from "../../../../extension/src/relay/channel.ts";

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
const { drawLearn } = globalThis.__hud["96-render-learn"];
const { drawRewards } = globalThis.__hud["96-render-rewards"];
const { drawEncounter } = globalThis.__hud["96-render-encounter"];
const { drawStarters } = globalThis.__hud["96-render-starters"];
const { drawFusion } = globalThis.__hud["96-render-fusion"];
const { drawBiome } = globalThis.__hud["97-render-biome"];
const { GROUP_IDS, MARKS, flatGroups, wireCard } = globalThis.__hud["90-render"];
const { EVENT_KINDS, cardEvent } = globalThis.__hud["60-card"];

// The relay keeps its own copy of the ids, because the panel is a source the extension bundles rather than imports
// (`extension/src/relay/channel.ts`). This is what pins the copy to the original: retiring or merging a group
// (#349 §1) has to be done on both, or a card the panel draws stops crossing the gate.
assert.deepEqual([...RELAY_GROUP_IDS], GROUP_IDS, "the relay's group ids are the panel's");


// ---- The closed alphabet (#349 §7)
// `MARKS` is the register itself, imported rather than restated: the set lives beside the gutter it governs, the way
// `GROUP_IDS` lives beside the tab bar, and a test that kept its own copy would pass while the panel drifted.
// What the alphabet does **not** govern: inline connectives inside prose are typography, and a fraction or a
// multiplier is a number.
const TYPOGRAPHY = [..."→←›—–−×…½¼⅓⅔"];
// The marks §7 retired, each named with what it became, so a reappearance fails by name rather than as a stray
// glyph. This is history and belongs here rather than in the panel: the renderers only need to know the set that is
// live. Two of them survive off the gutter and so are only retired *as marks* — `🎯` is still the battle card's
// caption emoji and the dismissed panel's glyph, and `✕` is the shape the close control was named for.
const RETIRED = {
  "✕": "▼ on the walls row, ✗ on the forgotten move", "⇆": "⇄", "↪": "⤵", "↔": "★", "⇥": "the word `escape`",
  "✝": "✗", "🛡": "⤵", "✚": "✓, or ⚠ on a caveat", "💰": "✓", "🎯": "★ / ≈", "🍀": "·", "👤": "·", "👁": "·",
  "⚑": "no mark — the tab carries it", "♟": "no mark — the tab carries it", "🩺": "no mark — the tab carries it",
  "🎁": "★ on the pick, · on a fact", "◎": "·", "⬆": "the word `upgraded`", "🔮": "the word `fixed`", "☠": "💀",
};
// Every glyph a card spends, anywhere in its text — the gutter marks, the marks that stand alone as a claim inside a
// row, and the model strings the summaries are read from. Letters, digits, whitespace and ASCII are not marks.
const glyphsIn = text => [...text].filter(ch => !/[\p{L}\p{N}\s]/u.test(ch) && !/[\x20-\x7e]/.test(ch));

// The card as plain text, off the renderer named at the call site: the panel's kind → draw dispatch is 98-tick's
// and stays there, so a test says which renderer it means rather than asking a second table (#388). The signature
// is `show`'s below, so a card and its renderer travel together here the way they do there.
const textOf = (card, draw = drawBattle) => wireCard(draw(card)).text;

// A build id for the gate below. Any string does: the relay checks that the key is there, not what is in it.
const BUILD = "0.0.0+cafef00dbeef";
// What `99-start.js`'s `stream()` pushes: one of the streamed kinds, and a card that has concluded something — a
// biome the tables have not loaded for has no call yet and so is no event yet. Restated here rather than imported,
// the way `cardeventtest.mjs` restates the heading law: this is the second opinion, so loosening the rule there has
// to be done here as well, deliberately.
const streams = ev => EVENT_KINDS.includes(ev.kind)
  && typeof ev.wave === "number" && typeof ev.key === "string" && typeof ev.verdict === "string";

const show = (label, card, draw = drawBattle) => {
  // One draw, both projections, the way a refresh takes them (#361 §5): the groups every assertion below reads, the
  // text derived from them, and — for a kind that streams — the very detail 99-start would push.
  const drawn = draw(card);
  const groups = flatGroups(drawn);
  const wire = wireCard(drawn);
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
  // **The strip's length budget** (#349 §6): two lines, then an ellipsis — about 115 characters at reference width —
  // and the **leading clause must fit**; what follows the first ` · ` may clip, because it is reasoning and not the
  // call. The clamp only ever eats the end, so the clause is what CI can hold. The wire golden holds the same budget
  // over what actually ships; here it is held over every kind, including the two that are never streamed.
  const clause = groups[0].summary.split(" · ")[0];
  assert.ok(clause.length <= 115, `${label}: the act summary's leading clause is ${clause.length} > 115: ${clause}`);
  // `text` is derived from the group list rather than read back off the drawn card (§5), so it carries every group
  // in the same fixed order and nothing besides — and its first line is the call, which is the line the watch CLI
  // prints per event. What a heading reads is pinned against literals at each card below.
  const lines = wire.text.split("\n");
  assert.equal(lines[0], groups[0].summary, "the first line of the text is the act summary");
  const rows = groups.flatMap(g => g.rows);
  assert.deepEqual(lines.filter(l => rows.includes(l)), rows, "every group's rows, in the group order and no other");
  assert.equal(lines.length, rows.length + groups.filter(g => g.label || g.summary).length, "a heading a group, and nothing else");
  // The alphabet is closed (§7). Held over the card's whole text rather than over the first token of a row, because a
  // foe row is a block of several lines and a mark can stand alone as a claim inside one — and because the summaries
  // this text is built from are the model's own strings, which is where three of the re-maps had to land.
  for (const ch of glyphsIn(wire.text)) {
    assert.ok(!RETIRED[ch], `${label}: ${ch} is retired — it is ${RETIRED[ch]} now`);
    assert.ok(MARKS.includes(ch) || TYPOGRAPHY.includes(ch), `${label}: ${ch} is not in the closed alphabet`);
  }
  // **Every card the panel would push crosses the relay's gate** (§11.1, #388). That gate is the card detail's
  // version point: it takes exactly the declared keys and refuses everything else, so a kind whose event shape
  // cannot cross — a group id the relay does not know, a field the panel sends and the gate does not — leaves the
  // panel drawing a card the tab silently never sends. `cardeventtest.mjs` runs the two kinds it has a scene for
  // past this same gate, on what actually ships; here every kind that streams crosses it, on the models below.
  // The five that stream are `EVENT_KINDS`: `starters` and `fusion` are cards and not events, and are gated nowhere.
  const ev = cardEvent(card);
  if (ev && streams(ev)) {
    assert.notEqual(cardBody({ build: BUILD, ...ev, ...wire }), null, `${label}: the relay refuses this card`);
  }
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
  const text = textOf(card);
  assert.ok(text.includes("\nFoes: we're weak to Fire ×2\n"), text);
  assert.ok(text.includes("\nRoad: W90 wild — Toxicroak L71\nNext W90 wild\n"), text);
  // The call leads the text and nothing heads it: the card's identity line has left the rows for the strip's
  // caption, which the text has no need of — the watch CLI already carries the kind, the wave and the verdict (§6).
  assert.ok(text.startsWith("Charizard Flamethrower → Lycanroc · 2 hits\n⚔ Charizard"), text);
  // No ball worth throwing means no catch group at all — an empty tab is filler (§6).
  assert.ok(!groups.some(g => g.id === "catch"));
  // Only the preview: the look-ahead is absent, so the road line is the preview string alone.
  assert.equal(groups[2].summary, "W90 wild — Toxicroak L71");
}

// ---- A catch worth a second thought but not a verdict: the group is drawn, and heads itself with its label alone
{
  const card = battle({ weak: [["Fire", 2]], catch: { targets: [
    { icon: null, name: "Zubat", verdict: "maybe", why: "covers Flying", best: { ball: "Great Ball", short: "GB", key: "gb", count: 9, p: 0.44 },
      chance: [{ ball: "Great Ball", short: "GB", key: "gb", count: 9, p: 0.44 }],
      // Why to catch, not how good it is: the three kinds are words in the row and the gutter stays neutral (§7).
      reasons: [{ kind: "account", text: "not in the dex" }, { kind: "team", text: "covers Flying" },
        { kind: "escape", text: "ends a fight that costs a member" }] },
  ] } });
  const groups = show("wild · a maybe, which is not a catch verdict", card);
  assert.deepEqual(groups.map(g => g.id), ["act", "foes", "catch"]);
  // A `maybe` is drawn but concludes nothing: `catch.summary` is empty where there is no catch verdict (§6), and the
  // group falls back on the same rule any group with nothing to conclude lives by.
  assert.equal(groups[2].summary, null);
  assert.ok(groups[2].rows.length, "the maybe is still drawn");
  assert.ok(textOf(card).includes("\nCatch\n≈ Zubat maybe:"), textOf(card));
}

// ---- Trainer: act · foes · plan · road, six foes and a fight plan
{
  const chomp = { icon: null, name: "Garchomp" };
  const card = battle({
    trainer: true, verdict: "trainer", title: "W89 · Cynthia", order: [{ icon: null, name: "Blastoise" }, { icon: null, name: "Venusaur" }],
    field: field({ slots: [slot({ name: "Blastoise", move: "Wave Crash", type: "Water", target: chomp, ko: 2 })] }),
    // The straining card, and the one that spends most of the gutter: a trap row, a walls row, an enemy move and a
    // pick for a foe no slot is on yet, so every mark the battle renderer can draw is drawn here (§7).
    rows: [foe({ name: "Garchomp", lv: 96, types: ["Dragon", "Ground"], weak: [["Ice", "×4"]], boss: true,
        likely: { move: "Earthquake", type: "Ground", pct: 62, first: 100, at: null, hits: 0, confidence: "exact" } }),
      foe({ name: "Spiritomb", lv: 95, types: ["Ghost", "Dark"], weak: [], traps: ["Pressure"], avoid: [["Water", "×½"]] }),
      foe({ name: "Roserade", lv: 95, types: ["Grass", "Poison"], weak: [["Fire", "×2"]],
        pick: { icon: null, name: "Lapras", cat: "special", type: "Ice", move: "Ice Beam", pct: 71, ko: 2, later: true, risky: false, notes: [] } })],
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
  assert.ok(textOf(card).includes("\nFoes\nfoes weak to: Ice ×2 Fire ×1\n"), textOf(card));
  assert.equal(groups[2].summary, "winnable · 💀 Garchomp KOs 2/4 · Roserade outspeeds the whole bench");
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
  assert.equal(textOf(card), "no advice — the enemy AI call threw");
  // The inline ⚠ row that used to carry it is gone: the summary carries it.
  assert.ok(!groups[0].rows.some(r => r.includes("no advice")), groups[0].rows.join("\n"));
}

// ---- Learn: act · options · audit · notes, with a team line (#352)
// `options` is the current move slots, `audit` the team line — the same two ids the battle card spends on other
// things, which is the point of a closed set: a tab means what it means whatever card is under it.
const move = (over = {}) => ({ name: "Earth Power", type: "Ground", cat: "special", value: 117, power: 90, hits: 1,
  acc: 100, stab: false, fixed: false, why: null, notes: [], ...over });
const learn = (over = {}) => ({
  kind: "learn", wave: 27, icon: null, name: "Espeon", atk: 65, spa: 130,
  move: move({ notes: ["SE on Rock/Steel/Fire…"] }),
  moves: [move({ name: "Bite", type: "Dark", cat: "physical", value: 30, power: 60, notes: ["weak Atk"] }),
    move({ name: "Psychic", type: "Psychic", value: 191, stab: true, notes: ["only Psychic move on team"] })],
  forget: 0, compare: 0, decision: "learn", gain: 87,
  verdict: "Learn → forget Bite",
  team: { gains: ["Steel", "Electric"], loses: ["Dark"], onlyType: "Dark" },
  blind: "the run seed is past the pinned build", ...over,
});
{
  const card = learn();
  const groups = show("learn · a team line, and a big fight it couldn't read", card, drawLearn);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "audit", "notes"]);
  // The call, verbatim off the model, and the only place the verdict itself appears. The only-type loss rides in the
  // same string, so the slot that loses it carries a bare ⚠ and the sentence stays on the team line that ⚠ points
  // at: a summary quotes what its rows say rather than replacing it, as the battle card's foes line does (#351).
  assert.equal(groups[0].summary, "Learn → forget Bite · ⚠ loses only Dark move");
  assert.ok(!groups.some(g => g.rows.some(r => r.includes("Learn → forget"))), "the verdict line has left the rows");
  // What the swap gains left the verdict line with it, and sits on the row of the move that gains it.
  assert.ok(groups[0].rows.some(r => r.includes("Earth Power") && r.includes("+87 power")), groups[0].rows.join("\n"));
  // `options` and `notes` head their panes with their label alone — no summary, and no count of what is below (§6).
  assert.deepEqual([groups[1].summary, groups[3].summary], [null, null]);
  const text = textOf(card, drawLearn);
  assert.ok(text.includes("\nMoves\n✗ Dark Bite ⚠ weak Atk power 30\n"), text);
  assert.ok(text.includes("\nTeam\nteam: +SE Steel/Electric · −SE Dark · ⚠ loses only Dark move\n"), text);
  assert.ok(text.endsWith("\nNotes\nnext big fight unread: the run seed is past the pinned build"), text);
}

// ---- Learn with nothing to say about the team: the group is not drawn at all
{
  const groups = show("learn · no team line, no notes", learn({ team: null, blind: null }), drawLearn);
  assert.deepEqual(groups.map(g => g.id), ["act", "options"]);
  assert.equal(groups[0].summary, "Learn → forget Bite");
}

// ---- Rewards: act · options · audit · road (#352)
{
  const card = {
    kind: "rewards", wave: 29, money: 1200, left: 950, affordable: 2, bossNext: true,
    buys: [{ icon: "potion", name: "Super Potion", cost: 250, target: null, targetName: "Charizard", why: "tops up the carry" }],
    free: [
      { icon: "tm", name: "TM Fire Fang", tm: "take", why: "", relearn: [], holder: null, users: [],
        best: { icon: null, name: "Morpeko", forget: "Tackle", gain: 25, setup: null, fainted: false, reason: null } },
      { icon: "leftovers", name: "Leftovers", tm: null, why: "Charizard · passive healing", best: null, users: [],
        holder: { icon: null, name: "Charizard" }, relearn: [] },
    ],
    pick: 0, audit: { findings: [{ level: "high", text: "nothing hits Ground" }], vs: { wave: 35, who: "Giovanni" } },
    preview: null, ahead: null, rerollAhead: null, reroll: null,
  };
  const groups = show("rewards · a TM to take and a potion to buy", card, drawRewards);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "audit"]);
  assert.equal(groups[0].summary, "take TM Fire Fang → Morpeko (forget Tackle) · buy Super Potion");
  // The reroll is a shop action, so it rides in `act` — and with no road to speak of there is no road group at all.
  assert.equal(groups[2].summary, "1 issue: nothing hits Ground");
}

// ---- The four light cards: encounter, starters, fusion and biome all take `act` · `options` · `notes` (#353)
// One shape, three groups, whatever the decision is about. Starters' *Picked* is in `act` and the species under the
// cursor is a row in `options`; neither earns a group of its own.
// Starters and fusion are asserted here even though neither is a streamed kind: their groups only ever reach a card
// read, so this golden is the only place they are pinned at all.

// Encounter: the judged options are `options`, and the card's own footnotes are `notes`.
const encounter = (over = {}) => ({
  kind: "encounter", wave: 33, type: 1, name: "Mysterious Chest", tier: "Common", known: true, minigame: null,
  options: [
    { label: "Open it", verdict: "take", outcome: "pick of 3 Ultra items", exact: false, battle: null, cost: 0, by: null, qualifies: [], why: "1 in 4 it bites" },
    { label: "Leave", verdict: "avoid", outcome: null, exact: false, battle: null, cost: 0, by: null, qualifies: [], why: "nothing for it" },
  ],
  pick: 0, notes: ["the trap is rolled on the option, not before it"], ...over,
});
{
  const card = encounter();
  const groups = show("encounter · a chest worth opening", card, drawEncounter);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "notes"]);
  assert.equal(groups[0].summary, "Mysterious Chest: take Open it — pick of 3 Ultra items · avoid Leave");
  // The picked option stays in `options` where it already is — there are no synthesized act rows (§6).
  assert.ok(groups[1].rows.some(r => r.includes("Open it")), groups[1].rows.join("\n"));
  assert.deepEqual([groups[1].summary, groups[2].summary], [null, null]);
  const text = textOf(card, drawEncounter);
  assert.ok(text.includes("\nOptions\n★ Open it — pick of 3 Ultra items\n"), text);
  assert.ok(text.endsWith("\nNotes\n· the trap is rolled on the option, not before it"), text);
}

// An encounter the card can't read: the options and their requirements only, with the caveat as a note.
{
  const groups = show("encounter · not judged yet", encounter({ known: false, pick: -1, notes: [] }), drawEncounter);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "notes"]);
  assert.equal(groups[0].summary, "Mysterious Chest: not judged · avoid Leave");
}

// Starters: *Picked* joins `act`, and the species under the cursor is a row in `options`.
const starters = (over = {}) => ({
  kind: "starters", wave: 1, limit: 10, spent: 4, room: 6, full: false, data: true,
  chosen: [{ icon: null, name: "Gible" }],
  picks: [{ label: "best", cost: 10, covers: 9, weak: ["Ice"], noCarry: false,
    members: [{ icon: null, name: "Gible", cost: 4, role: "carry", chosen: true, why: ["outspeeds"] },
      { icon: null, name: "Magikarp", cost: 1, role: null, chosen: false, why: ["Gyarados later"] }] }],
  viewing: { icon: null, name: "Rattata", cost: 1, rank: 18, of: 40, inPick: null, why: ["frail"] },
  fresh: true, mono: false, inverse: false, ...over,
});
{
  const card = starters();
  const groups = show("starters · a proposal, a pick made and a cursor", card, drawStarters);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "notes"]);
  assert.equal(groups[0].summary, "best: Gible (carry) + Magikarp · 10/10 pts · weak Ice");
  assert.ok(groups[0].rows.some(r => r.includes("picked: Gible")), groups[0].rows.join("\n"));
  // The row the cursor is on is a row of `options`, not a group of its own.
  assert.ok(groups[1].rows.some(r => r.includes("Rattata")), groups[1].rows.join("\n"));
  assert.ok(textOf(card, drawStarters).includes("\nProposals\n★ best"), textOf(card, drawStarters));
}

// Starters with nothing to add: an ordinary card with exactly one `act` group, and the shell never knows (§1).
{
  const groups = show("starters · nothing to add", starters({ picks: [], full: true, room: 0, viewing: null }), drawStarters);
  assert.deepEqual(groups.map(g => g.id), ["act"]);
  assert.equal(groups[0].summary, "nothing to add");
}

// Fusion: the call line leaves the rows, because `act.summary` carries it.
const fusionRow = (over = {}) => ({ base: { icon: null, name: "Garchomp" }, other: { icon: null, name: "Dragonite" },
  value: 21, fuse: true, types: ["Dragon", "Ground"], why: ["+42 BST"], notes: [], ...over });
{
  const card = { kind: "fusion", wave: 42, picked: null, better: null, spliced: true,
    rows: [fusionRow(), fusionRow({ other: { icon: null, name: "Lapras" }, value: 4, fuse: false, why: ["loses Ice"] })] };
  const groups = show("fusion · two candidates and a Spliced note", card, drawFusion);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "notes"]);
  assert.equal(groups[0].summary, "Garchomp ← Dragonite (+21) · pick Garchomp first, then Dragonite");
  assert.ok(!groups.some(g => g.rows.some(r => r.includes("pick Garchomp first"))), "the call has left the rows");
  assert.ok(textOf(card, drawFusion).endsWith("\nNotes\nSpliced Endless: unfused mons run on half their base stats"), textOf(card, drawFusion));
}

// Biome: the offered biomes are `options`, and a caveat on how they were judged is `notes`.
const biomeOption = (over = {}) => ({ label: "Swamp", id: 1, score: 72, offense: 30, defense: 20, opportunity: 12, bossFit: 10,
  verdict: "pick", mix: [["Water", 40], ["Poison", 30]], common: [["Wooper", 22]], trainers: null,
  reasons: [{ good: true, text: "Garchomp resists" }], catch: null, fight: null, onward: [], ...over });
{
  const card = { kind: "biome", wave: 30, from: "Slum", pick: 0, data: true, trainers: true, fainted: 1,
    options: [biomeOption(), biomeOption({ label: "Construction Site", id: 2, score: 55, verdict: "worse", common: [], reasons: [{ good: false, text: "Lapras weak" }] })] };
  const groups = show("biome · swamp over construction site, one fainted", card, drawBiome);
  assert.deepEqual(groups.map(g => g.id), ["act", "options", "notes"]);
  assert.equal(groups[0].summary, "Swamp 72 pick — Garchomp resists · Construction Site 55");
  assert.ok(textOf(card, drawBiome).includes("\nBiomes\n★ Swamp"), textOf(card, drawBiome));
  // Who the judging left out is a footnote, not a supporting line for the call.
  assert.ok(textOf(card, drawBiome).endsWith("\nNotes\n⚠ judged without 1 fainted — no revive at the next heal"), textOf(card, drawBiome));
}

// Nothing to footnote: the `notes` group is not drawn at all, the same as any group with nothing in it.
{
  const groups = show("biome · nobody fainted", { kind: "biome", wave: 30, from: "Slum", pick: 0, data: true, trainers: true, fainted: 0,
    options: [biomeOption()] }, drawBiome);
  assert.deepEqual(groups.map(g => g.id), ["act", "options"]);
}

// A biome with no scores: an ordinary card with exactly one `act` group, the same as starters with nothing to add.
{
  const card = { kind: "biome", wave: 30, from: null, pick: -1, data: false, trainers: false, fainted: 0, unread: null,
    options: [{ label: "Swamp", id: null }, { label: "Construction Site", id: null }] };
  const groups = show("biome · no spawn data yet", card, drawBiome);
  assert.deepEqual(groups.map(g => g.id), ["act"]);
  assert.equal(groups[0].summary, "Swamp · Construction Site");
}

console.log("ok");
