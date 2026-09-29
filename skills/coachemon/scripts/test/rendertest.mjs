// A card's content is pinned in grouptest, which draws nothing.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "../hud-bundle.mjs";
const HUD = fileURLToPath(new URL("../hud", import.meta.url));
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const mv = ([n, t, p, c, a = 100]) => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: 3, isChargingMove: () => false, attrs: [] });
const pk = (name, types, atk, spa, moves) => ({ name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })) });

const PANEL_KEY = "coach-hud-panel";
const SHUT = { [PANEL_KEY]: JSON.stringify({ view: "drawer", closed: true, group: "act" }) };
const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
let store = new Map();
const mount = (scene, { expose = false, stored = null } = {}) => {
  let el;
  store = new Map(Object.entries(stored ?? {}));
  globalThis.window = globalThis; delete globalThis.__coachHud;
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener(ev, fn) { if (ev === "click") n.onclick = fn; }, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  eval(bundle("hud", { expose }));
  return el;
};
// A drawn panel is `[controls, strip, bar, pane]`; the strip view stops after the strip, and a dismissal is one glyph.
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

// Learn: Tackle is the clear drop for Flamethrower.
const charmeleon = pk("Charmeleon", ["Fire"], 64, 80, [["Tackle","Normal",40,"P"],["Ember","Fire",40,"S"],["Dragon Breath","Dragon",60,"S"],["Scratch","Normal",40,"P"]]);
{
  const scene = { currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] };
  const el = mount(scene);
  console.log(`== learn\n${lines(el)}`);
  console.log(`summary ${globalThis.__coachHud.summary().learn}`);
}

// Fight plan: a plain win draws in full like every other section — there is no in-pane expansion.
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "Blaze" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => false,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
  moveset: moves.map(([n, t, p, c]) => ({ getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: 3 }), getMovePp: () => 10, ppUsed: 0 })),
});
const party = [mon("Charizard", 50, ["Fire","Flying"], [160,100,90,130,100,120], [["Flamethrower","Fire",90,"S"]], true)];
const foes = [mon("Paras", 20, ["Bug","Grass"], [50,40,40,30,40,20], [["Scratch","Normal",40,"P"]], true), mon("Oddish", 20, ["Grass","Poison"], [50,40,40,40,40,20], [["Absorb","Grass",20,"S"]], false)];
for (const f of foes) f.getOpponents = () => party;
const trainer = { getName: () => "Youngster", config: { isBoss: false }, isDouble: () => false, getPartyMemberMatchupScores: () => [[1, 5]], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene);
  console.log(`== plan\n${lines(el)}`);
  const control = n => (n == null || typeof n === "string" ? null : n.onclick ? n : (n.children ?? []).map(control).find(Boolean));
  assert.equal(control(el.kids[3]) ?? null, null, "the pane draws no control of its own");
}

// Learn with a team: Espeon trades Bite, the team's only Dark move, for Earth Power — the team line carries the SE
// types gained and the only-type loss.
const espeon = pk("Espeon", ["Psychic"], 65, 130, [["Bite","Dark",60,"P"],["Psychic","Psychic",90,"S"],["Shadow Ball","Ghost",80,"S"],["Dazzling Gleam","Fairy",80,"S"]]);
const lapras = pk("Lapras", ["Water","Ice"], 85, 85, [["Surf","Water",90,"S"],["Ice Beam","Ice",90,"S"]]);
{
  const scene = { currentBattle: { waveIndex: 27, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: espeon, newMove: mv(["Earth Power","Ground",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [espeon, lapras] };
  const el = mount(scene);
  console.log(`== learn team\n${lines(el)}`);
  console.log(`summary ${globalThis.__coachHud.summary().learn}`);
}

// Rewards before a boss: the TM row shows its best recipient and the move it replaces, the other rewards say who can
// use them, and the watcher's summary names the recipient.
{
  class ModifierType {}
  class PokemonModifierType extends ModifierType {}
  class TmModifierType extends PokemonModifierType {}
  class PokemonHeldItemModifierType extends PokemonModifierType {}
  class AddPokeballModifierType extends ModifierType {}
  const MOVES = { 1: ["Tackle","Normal",40,"P"], 2: ["Spark","Electric",65,"P"], 3: ["Bite","Dark",60,"P"], 4: ["Quick Attack","Normal",40,"P"], 5: ["Fire Fang","Fire",65,"P",95], 6: ["Heat Wave","Fire",95,"S",90] };
  class PokemonMove {
    constructor(id) { this.moveId = id; this.ppUsed = 0; }
    getMove() { return mv(MOVES[this.moveId]); }
    getName() { return MOVES[this.moveId][0]; }
    getMovePp() { return 20; }
  }
  const member = (name, types, atk, spa, ids) => ({ ...pk(name, types, atk, spa, []), status: null, species: { forms: [] }, moveset: ids.map(id => new PokemonMove(id)) });
  const morpeko = member("Morpeko", ["Electric","Dark"], 95, 70, [2, 3, 1, 4]);
  const charizard = member("Charizard", ["Fire","Flying"], 110, 150, [6]);
  const team = [charizard, morpeko];
  const free = [
    Object.assign(new TmModifierType(), { name: "TM Fire Fang", iconImage: "tm", tier: 1, moveId: 5, selectFilter: p => (p === morpeko ? null : "no effect") }),
    Object.assign(new PokemonHeldItemModifierType(), { name: "Leftovers", iconImage: "leftovers", tier: 0, selectFilter: () => null }),
    Object.assign(new AddPokeballModifierType(), { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 }),
  ];
  const handler = { options: free.map(t => ({ modifierTypeOption: { type: t, cost: 0 } })), shopOptionsRows: [], rerollCost: 250 };
  const scene = { money: 500, pokeballCounts: { 1: 20 }, modifiers: [], currentBattle: { waveIndex: 29 }, ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => team, getEnemyParty: () => [] };
  const el = mount(scene);
  console.log(`== rewards boss next\n${lines(el)}`);
  console.log(`summary ${globalThis.__coachHud.summary().rewards}`);
}

// ---- The panel wears the game's window skin, in two faces, with no motion and no mark of its own.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene);
  console.log("== skin");
  for (const k of ["background", "color", "border", "boxShadow"]) console.log(`panel ${k}: ${el.style[k]}`);
  console.log(`chrome font: ${el.style.fontSize}/${el.style.lineHeight} ${el.style.fontFamily}`);
  const under = n => (n == null || typeof n !== "object" ? [] : (n.children ?? []).flatMap(k => [k, ...under(k)]));
  const rows = [...el.kids, ...el.kids.flatMap(under)].filter(n => n?.style?.fontFamily);
  const rowFonts = [...new Set(rows.map(n => `${n.style.fontSize}/${n.style.lineHeight} ${n.style.fontFamily}`))];
  console.log(`rows font: ${rowFonts.join(" | ")}`);
  assert.equal(rowFonts.length, 1, "one row register, not three");
  // The `font` shorthand resets every longhand it does not name, so a register set through it flattens a row's bold.
  assert.ok(rows.flatMap(under).some(n => n?.style?.fontWeight === "bold"), "a row's own emphasis survives the register");
  assert.equal(bundle("hud").match(/\bfont:/g), null, "the panel sets the two faces through the longhands, never the font shorthand");
  // A leftover size literal inside a row renders *larger* than the row containing it.
  const sized = rows.flatMap(under).filter(n => n?.style?.fontSize);
  assert.deepEqual(sized.map(n => n.style.fontSize), [], "nothing inside a row sets a size of its own");

  // No motion anywhere, so reduced motion needs no handling.
  const styles = n => (n == null || typeof n !== "object" ? [] : [n.style ?? {}, ...(n.children ?? []).flatMap(styles)]);
  const motion = p => [p.style, ...(p.kids ?? []).flatMap(styles)].flatMap(Object.keys).filter(k => /^(transition|animation)/i.test(k));
  assert.deepEqual(motion(el), [], "nothing drawn on the panel carries a transition or an animation");
  const src = bundle("hud");
  assert.ok(!src.includes("@keyframes"), "the panel declares no keyframes");
  // The bare words appear in the model's prose, so the guard matches only the forms a style is set by.
  assert.equal(src.match(/\b(transition|animation)[A-Za-z]*\s*[:=]/gi), null, "no branch of the panel sets a transition or an animation");
  assert.equal(src.match(/\b(cssText|setProperty)\b/g), null, "the panel sets no style through cssText or setProperty, which would slip past the guard above");
  // The drawn tree covers only the branches these fixtures reach, so the source is checked as well.
  assert.deepEqual(src.match(/fontSize:/g), ["fontSize:", "fontSize:"],
    "the two registers — the panel's own chrome and the shell's row register — are the only sizes the panel sets");

  // The panel carries no mark, wordmark or name of its own.
  assert.ok(!/coachemon|coach hud/i.test(lines(el)), lines(el));

  // Dismissed: a bare glyph from the settled alphabet, inside the same rule, carrying nothing the card knows.
  const shut = mount(scene, { stored: SHUT });
  console.log(`== dismissed\n${lines(shut)}`);
  assert.equal(shut.style.border, "1px solid #f8b050");
  assert.deepEqual(motion(shut), [], "the dismissed glyph carries nothing live either");
  assert.ok(!/coachemon|coach hud/i.test(lines(shut)), lines(shut));
}

// ---- The strip carries the verdict dot, word and caption, then the call, above everything else the panel shows.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene, { expose: true });
  const { captionBattle, drawBattle } = globalThis.__hud["96-render-battle"];
  const { strip } = globalThis.__hud["90-render"];
  const [head, call] = el.kids[1].children;
  const [dot, word, caption] = head.children;
  const flat = n => txt(n).replace(/\s+/g, " ").trim();
  console.log(`== strip\nhead ${flat(head)}\ncall ${flat(call)}\ndot ${dot.style.background} ${dot.style.width} ${dot.style.borderRadius}`);
  assert.equal(dot.style.background, "#f8b050");
  assert.equal(flat(word), "trainer");
  // The caption's list is **our** mons, never the foes the card is about.
  assert.equal(caption.style.color, "#f8b050");
  assert.ok(flat(caption).startsWith("🎯 W15 · Youngster"), flat(caption));
  assert.ok(flat(caption).includes("Charizard") && !/Paras|Oddish/.test(flat(caption)), flat(caption));
  // On a double that list is the pair on the field, in the same arrow-separated shape.
  assert.equal(flat(captionBattle({ kind: "battle", title: "W89 · Tester", trainer: true, double: true,
    field: { slots: [{ name: "Blastoise" }, { name: "Venusaur" }] },
    order: [{ icon: null, name: "Blastoise" }, { icon: null, name: "Venusaur" }] })),
    "🎯 W89 · Tester Blastoise › Venusaur");
  // The call is `act.summary` verbatim, clamped to two lines by the browser: nothing on the panel truncates a string.
  const act = drawBattle(globalThis.__coachHud.last()).find(g => g.id === "act");
  assert.equal(flat(call), act.summary);
  assert.equal(call.style.WebkitLineClamp, "2");
  assert.deepEqual([call.style.display, call.style.overflow], ["-webkit-box", "hidden"]);
  // Only the reasoning after the first ` · ` may clip, so the node gets the whole string and the clamp eats the tail;
  // `overflowWrap` makes an unbroken run clip too, instead of pushing past the panel's edge.
  const long = { id: "act", summary: "Blastoise Wave Crash → Garchomp · 2 hits · Garchomp outspeeds and Earthquake takes 88% · switch costs the turn" };
  const longCall = strip({ verdict: "danger" }, captionBattle({ kind: "battle", title: "W89" }), [long]).children[1];
  assert.equal(flat(longCall), long.summary, "the panel hands the browser the whole string, never a cut one");
  assert.ok(flat(longCall).startsWith(long.summary.split(" · ")[0]), "the leading clause leads it");
  assert.equal(longCall.style.overflowWrap, "anywhere");
  const [, paneBox] = el.kids.slice(2);
  assert.ok(!(paneBox.children ?? []).some(n => flat(n) === act.summary), "the act pane does not repeat the call");
}

// ---- The drawer shows one group at a time, the one the player picked.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene, { expose: true });
  const { drawer, openGroup } = globalThis.__hud["90-render"];
  const { drawBattle } = globalThis.__hud["96-render-battle"];
  const flat = n => txt(n).replace(/\s+/g, " ").trim();
  const [bar, paneBox] = el.kids.slice(2);
  const tabs = bar.children;
  console.log(`== drawer\ntabs ${tabs.map(flat).join(" | ")}\nopen ${openGroup()}\npane ${paneBox.children.map(flat).join(" / ")}`);
  console.log(`bar ${tabs.map(t => `${t.style.fontWeight} ${t.style.color}`).join(" | ")}`);
  console.log(`pane cap ${paneBox.style.maxHeight} ${paneBox.style.overflowY}`);
  const groups = drawBattle(globalThis.__coachHud.last());
  assert.deepEqual(tabs.map(flat), ["Now", "Foes", "Plan"]);
  assert.deepEqual(tabs.map(flat), globalThis.__hud["90-render"].GROUP_IDS
    .flatMap(id => groups.filter(g => g.id === id)).map(g => g.label), "the bar is in the fixed global order");
  assert.equal(bar.style.flexWrap, "nowrap", "the bar never wraps");
  assert.equal(bar.style.overflow, "hidden", "and never scrolls: there is no overflow menu");
  assert.deepEqual([...new Set(tabs.map(t => t.style.textOverflow))], ["ellipsis"], "a label that overruns is the browser's to cut");
  assert.equal(openGroup(), "act");
  assert.deepEqual([tabs[0].style.fontWeight, tabs[0].style.color], ["bold", "#f8f8f8"]);
  assert.deepEqual([tabs[1].style.fontWeight, tabs[1].style.color], ["normal", "#a0a0a0"]);
  assert.ok(!tabs.some(t => t.style.color === "#f8b050"), "gold never says which tab is open");
  assert.deepEqual(tabs.map(t => flat(t).replace(/[A-Za-z]/g, "")), tabs.map(() => ""), "labels only: no mark, no count");
  assert.deepEqual([paneBox.style.maxHeight, paneBox.style.overflowY], ["calc(0.40 * min(100vw, 177.78vh) - 8px)", "auto"],
    "the pane is what scrolls, past the budget the game's message box leaves");
  assert.deepEqual([el.style.maxHeight, el.style.overflowY], [undefined, undefined], "and the panel itself no longer does");
  // A tab click opens that group's pane and nothing else: the panel never switches the open group by itself.
  tabs[1].onclick({ stopPropagation() {} });
  const [bar2, pane2] = el.kids.slice(2);
  console.log(`== drawer · foes\ntabs ${bar2.children.map(flat).join(" | ")}\nopen ${openGroup()}\npane ${pane2.children.map(flat).join(" / ")}`);
  assert.equal(openGroup(), "foes");
  // With no summary the pane's heading is the group's label, on one line.
  const foesGroup = groups.find(g => g.id === "foes");
  assert.equal(flat(pane2.children[0]), foesGroup.label);
  assert.equal(foesGroup.summary, null, "and this one concluded nothing");
  assert.deepEqual([pane2.children[0].style.whiteSpace, pane2.children[0].style.overflow, pane2.children[0].style.textOverflow],
    ["nowrap", "hidden", "ellipsis"]);
  // With one, the summary is the heading and the label does not come with it.
  const said = "\u{1f480} Charizard ← Butterfree Gust";
  const [, saidPane] = drawer([{ id: "act", label: "Now", summary: "switch", rows: [] }, { id: "foes", label: "Foes", summary: said, rows: [] }]);
  assert.equal(openGroup(), "foes", "and the group the player is on stays open across a new card that has it");
  assert.equal(flat(saidPane.children[0]), said);
  // A card without the open group moves the drawer to `act`, and it does not jump back when the group returns.
  const one = [{ id: "act", label: "Now", summary: "no advice — the enemy AI call threw", rows: [] }];
  const [oneBar, onePane] = drawer(one);
  console.log(`== drawer · one group\ntabs ${oneBar.children.map(flat).join(" | ")}\nopen ${openGroup()}\npane ${onePane.children.map(flat).join(" / ")}`);
  assert.deepEqual(oneBar.children.map(flat), ["Now"], "a whole-card replacement draws a bar with one tab");
  assert.equal(openGroup(), "act");
  assert.deepEqual(drawer(groups)[0].children.map(flat), ["Now", "Foes", "Plan"]);
  assert.equal(openGroup(), "act", "and the drawer does not jump back to the group the fallback left");
}

// A card with no verdict draws no dot and no word; the caption and the call still draw.
{
  const scene = { currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] };
  const el = mount(scene);
  const [head, call] = el.kids[1].children;
  console.log(`== strip · no verdict\nhead ${txt(head).replace(/\s+/g, " ").trim()}\ncall ${txt(call)}`);
  assert.equal(head.children.length, 1, "the caption alone: no dot and no word");
  assert.equal(head.children[0].style.color, "#f8b050", "and the one thing on it is the caption");
  assert.ok(txt(call).startsWith("Learn → forget"), txt(call));
}

// ---- The colour law holds, and the palette is closed.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene, { expose: true });
  const { drawer, GROUP_IDS, GUTTER_INK, IMMUNE, LAW_INK, MARKS, line } = globalThis.__hud["90-render"];
  console.log("== colour law");
  console.log(`law ${Object.entries(LAW_INK).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
  assert.deepEqual(LAW_INK, { ours: "#40c8f8", theirs: "#f88880", later: "#e331c5", none: "#a0a0a0" });
  // `foes`' frame is not the law's ink as text: a frame has only colour, where text has words beside it.
  const frames = GROUP_IDS.map(id => drawer([{ id, label: id, summary: null, rows: [] }])[1].style.border);
  console.log(`frames ${GROUP_IDS.map((id, i) => `${id} ${frames[i]}`).join(" | ")}`);
  assert.deepEqual(frames, ["1px solid #40c8f8", "1px solid #f75231", "1px solid #40c8f8", "1px solid #e331c5",
    "1px solid #40c8f8", "1px solid #e331c5", "1px solid #e331c5", "1px solid #a0a0a0"]);
  // Pinned by value: a zero gap would let the two rules touch, silently.
  const [, pane] = drawer([{ id: "act", label: "Now", summary: null, rows: [] }]);
  console.log(`frame inset ${el.style.padding} · pane padding ${pane.style.padding}`);
  const RUNG = "clamp(10px, round(min(100vw, 177.78vh) / 240, 8px), 24px)";
  const rungs = n => `round(calc(${n} * ${RUNG}), 1px)`;
  assert.equal(el.style.padding, `${rungs(0.75)} ${RUNG}`, "one row's padding stands between the gold rule and the law frame");
  assert.equal(pane.style.padding, `${rungs(0.5)} ${rungs(0.75)}`, "and the frame keeps the rows off itself");
  assert.deepEqual(GUTTER_INK, { good: "#78c850", bad: "#e13d3d", flat: "#a0a0a0" });
  const gutter = mark => { const g = line(mark).children[0]; return `${txt(g) || "·blank·"} ${g.style.color || "·none·"}`; };
  console.log(`gutter ${[..."⚔➜★✓▲", "|", ..."↯✗✦⚠▼", "|", ..."⇄⤵≈↺·", IMMUNE, "|", "💀", "👑", "🎲", "🔒", ""].map(m => (m === "|" ? "|" : gutter(m))).join(" ")}`);
  for (const m of "⚔➜★✓▲") assert.equal(line(m).children[0].style.color, GUTTER_INK.good, m);
  for (const m of "↯✗✦⚠▼") assert.equal(line(m).children[0].style.color, GUTTER_INK.bad, m);
  for (const m of [..."⇄⤵≈↺·", IMMUNE]) assert.equal(line(m).children[0].style.color, GUTTER_INK.flat, m);
  assert.equal(txt(line(IMMUNE).children[0]).trim(), "▼", "immune is a mark, not a shape: it wears ▼'s glyph");
  for (const m of ["💀", "👑", "🎲", "🔒"]) assert.equal(line(m).children[0].style.color, "", `${m} forfeits the ink`);
  assert.equal(line("").children[0].style.color, "", "a blank gutter makes no claim, so it takes no ink");
  // A mark added to `MARKS` and to neither set above would otherwise fall through to grey unnoticed.
  const asked = [..."⚔➜★✓▲↯✗✦⚠▼⇄⤵≈↺·", "💀", "👑", "🎲", "🔒"];
  assert.deepEqual(MARKS.filter(m => !asked.includes(m)), [], "a mark the alphabet gained but the gutter was never told the news of");
  const under = n => (n == null || typeof n !== "object" ? [] : (n.children ?? []).flatMap(k => [k, ...under(k)]));
  const paneRows = (el.kids[3].children ?? []).flatMap(n => [n, ...under(n)]);
  assert.deepEqual(paneRows.filter(n => n?.style?.color === "#f8b050"), [], "gold never appears inside a row");
  // `badge` colours a suffix only when told it is a multiplier: `×4` on the foes-weak-to row counts four foes.
  const { badge } = globalThis.__hud["90-render"];
  const suffixInk = (...args) => badge(...args).children[1]?.style?.color ?? "";
  console.log(`effectiveness ×4 ${suffixInk("Fire", "×4", true)} · ×¼ ${suffixInk("Fire", "×¼", true)} · ×0 ${suffixInk("Fire", "×0", true)} · count ×4 ${suffixInk("Fire", "×4") || "·none·"}`);
  assert.deepEqual([suffixInk("Fire", "×4", true), suffixInk("Fire", "×¼", true), suffixInk("Fire", "×0", true)],
    ["#4AA500", "#FE8E00", "#929292"], "the game's own effectiveness table, quoted");
  assert.equal(suffixInk("Fire", "×4"), "", "a count of four foes is not ×4 effective");
  assert.equal(suffixInk("Fire", "70%", true), "", "and a share the table has no opinion about takes no colour either");
  const renderers = readdirSync(HUD).filter(f => /^9[0-9]-render/.test(f) && f !== "90-render.js");
  const spelt = renderers.filter(f => /"#[0-9a-fA-F]{3,6}"/.test(readFileSync(`${HUD}/${f}`, "utf8")));
  assert.deepEqual(spelt, [], "a renderer that spells a colour has left the law: the inks are the shell's to hand down");
  const src = bundle("hud");
  const SEATS = {
    skin: ["#362d3e", "#f8f8f8", "#f8b050", "#181818"],
    law: ["#40c8f8", "#f88880", "#e331c5", "#a0a0a0", "#f75231"],
    gutter: ["#78c850", "#e13d3d"],
    verdict: ["#78c850", "#f8b050", "#e13d3d", "#40c8f8"],
    effectiveness: ["#4AA500", "#FE8E00", "#929292"],
    hp: ["#39ff7b", "#f3b200", "#fb3041"],
    types: ["#a8a878", "#c03028", "#a890f0", "#a040a0", "#e0c068", "#b8a038", "#a8b820", "#705898", "#b8b8d0",
      "#f08030", "#6890f0", "#78c850", "#f8d030", "#f85888", "#98d8d8", "#7038f8", "#705848", "#e888c8", "#ffffff"],
  };
  const seated = new Set(Object.values(SEATS).flat());
  const inks = [...new Set((src.match(/"#[0-9a-fA-F]{3,6}"/g) ?? []).map(s => s.slice(1, -1)))].sort();
  console.log(`palette ${inks.join(" ")}`);
  assert.deepEqual(inks.filter(c => !seated.has(c)), [], "the panel invents no colour: every hex in it has a seat");
}

// ---- Every length is one knob's, the game's drawn width in pure CSS, so the footprint holds at every window shape.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene);
  console.log("== footprint");
  for (const k of ["position", "top", "left", "width", "boxSizing", "padding", "maxHeight", "overflowY"]) console.log(`panel ${k}: ${el.style[k]}`);
  const src = bundle("hud");
  assert.equal(src.match(/getBoundingClientRect|ResizeObserver|addEventListener\("resize"/g), null,
    "the footprint reads no canvas rect and observes no resize");
  assert.equal(el.style.maxWidth, undefined, "no width cap of its own");
  // A dismissal is the one thing that shrinks the panel off the ladder, to whatever the glyph needs.
  assert.equal(mount(scene, { stored: SHUT }).style.width, "auto");
}

// A refresh that threw: one line, inside the gold rule, with no strip, no tab bar, no drawer and no law frame.
{
  const el = mount({ get ui() { throw new Error("the scene went away"); } });
  console.log(`== failed refresh\n${lines(el)}`);
  assert.equal(el.style.display, "block");
  assert.equal(el.style.border, "1px solid #f8b050", "a broken panel still reads as the coach's own object");
  assert.equal(el.kids, undefined, "nothing is shelled around the line");
}

// Nothing to coach — mid-reload or the title screen — hides the panel entirely.
{
  const el = mount({ ui: null });
  assert.equal(el.style.display, "none");
  console.log("== nothing to coach\nhidden");
}

// A sprite the atlas has not loaded falls back to the name it stands for, and the panel redraws on the next refresh
// until the sprite lands: the draw signature is never banked while a sprite is still missing.
{
  const scene = { currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] };
  const el = mount(scene, { expose: true });
  assert.ok(lines(el).includes("Charmeleon"), "the icon falls back to the name");
  assert.ok(globalThis.__hud["90-render"].missedSprite(), "a wanted sprite that wasn't there is remembered");
  el.kids = undefined;
  globalThis.__hud["98-tick"].tick();
  assert.ok(el.kids, "the same card is drawn again while a sprite is still missing");
}

// ---- What the panel remembers is one key, holding the view and the last group id.
{
  // Every mount below is a reload, so what survives one is exactly what the key carried.
  const battle = () => ({ phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes });
  // A learn card has no `foes` group.
  const learn = () => ({ currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] });
  const flat = n => txt(n).replace(/\s+/g, " ").trim();
  const remembers = () => JSON.parse(store.get(PANEL_KEY));
  const open = () => globalThis.__hud["90-render"].openGroup();
  const state = el => (el.kids.length === 1 ? "closed" : el.kids.length === 2 ? "strip" : "drawer");
  const click = n => n.onclick({ stopPropagation() {} });
  const caret = el => el.kids[0].children[0];
  const close = el => el.kids[0].children[1];
  const tabs = el => el.kids[2].children;

  {
    const el = mount(battle(), { expose: true });
    console.log(`== remembers · first run\n${state(el)} · ${open()}`);
    assert.equal(state(el), "drawer", "first run, with nothing stored, is the drawer");
    assert.equal(open(), "act", "open on `act`");
  }

  // The old key's three values migrate, and the old key is dropped. It held no group and no view behind a dismissal,
  // so a migrated panel opens on `act` and a migrated dismissal has the drawer behind it.
  for (const [old, drawn, saved] of [
    ["full", "drawer", { view: "drawer", closed: false, group: "act" }],
    ["mini", "strip", { view: "strip", closed: false, group: "act" }],
    ["closed", "closed", { view: "drawer", closed: true, group: "act" }],
  ]) {
    const el = mount(battle(), { stored: { "coach-hud-view": old } });
    console.log(`== remembers · migrate ${old}\n${state(el)} · ${store.get(PANEL_KEY)}`);
    assert.equal(state(el), drawn);
    assert.deepEqual(remembers(), saved);
    assert.equal(store.has("coach-hud-view"), false, "the old key is dropped, not kept in step");
  }

  // The open group is remembered by id across a reload.
  {
    const el = mount(battle(), { expose: true });
    click(tabs(el)[1]);
    assert.deepEqual(remembers(), { view: "drawer", closed: false, group: "foes" });
    const back = mount(battle(), { expose: true, stored: Object.fromEntries(store) });
    console.log(`== remembers · reload on foes\ntabs ${tabs(back).map(flat).join(" | ")}\nopen ${open()}`);
    assert.equal(open(), "foes");
    assert.deepEqual(tabs(back).map(t => t.style.fontWeight), ["normal", "bold", "normal"]);

    // A card with no group of that id falls back to `act`, and stays there when the group returns.
    const moved = mount(learn(), { expose: true, stored: Object.fromEntries(store) });
    console.log(`== remembers · the fallback\ntabs ${tabs(moved).map(flat).join(" | ")}\nopen ${open()}`);
    assert.equal(open(), "act");
    assert.deepEqual(remembers(), { view: "drawer", closed: false, group: "act" }, "the move is written back, so it survives too");
    const returned = mount(battle(), { expose: true, stored: Object.fromEntries(store) });
    assert.equal(open(), "act", "and no jump back when the group returns");
    assert.ok(tabs(returned).map(flat).includes("Foes"), "the tab is there to be picked again");
  }

  // Shutting the drawer with the caret keeps the strip.
  {
    const el = mount(battle(), { expose: true });
    click(tabs(el)[1]);
    click(caret(el));
    console.log(`== remembers · drawer shut\n${state(el)} · ${store.get(PANEL_KEY)}\n${lines(el)}`);
    assert.equal(state(el), "strip");
    assert.deepEqual(remembers(), { view: "strip", closed: false, group: "foes" }, "and the group it was on is still remembered");
    assert.equal(el.kids[1].onclick, undefined, "the strip is not itself a control");
    const shut = mount(battle(), { expose: true, stored: Object.fromEntries(store) });
    assert.equal(state(shut), "strip", "a reload comes back to the strip the player left");
    // The caret says what the click does: one shape shuts the drawer, the other shows it.
    assert.deepEqual([flat(caret(el)), flat(caret(shut))].map(m => m.split(" ")[0]), ["⌄", "⌄"]);
    click(caret(shut));
    assert.equal(state(shut), "drawer");
    assert.equal(open(), "foes", "on the group the drawer was left on");
    assert.equal(flat(caret(shut)).split(" ")[0], "⌃", "and the caret now shuts what it opened");
  }

  // Closing dismisses the panel to a bare glyph, and reopening restores the drawer that was there.
  {
    const el = mount(battle(), { expose: true });
    click(tabs(el)[1]);
    click(close(el));
    console.log(`== remembers · dismissed\n${state(el)} · ${store.get(PANEL_KEY)}\n${lines(el)}`);
    assert.equal(state(el), "closed");
    assert.deepEqual(remembers(), { view: "drawer", closed: true, group: "foes" });
    const other = mount(learn(), { stored: Object.fromEntries(store) });
    assert.equal(lines(other), lines(el), "one mark from the settled alphabet, whatever kind of decision is up");
    assert.equal(lines(el).replace(/\{.*\}/, "").trim().length, 2, "a bare glyph and nothing beside it");
    click(el.kids[0]);
    assert.equal(state(el), "drawer");
    assert.equal(open(), "foes", "reopening restores the drawer that was there");
  }

  // The dismissal covers the view rather than replacing it: reopening comes back to the strip, not a drawer.
  {
    const el = mount(battle(), { expose: true });
    click(caret(el));
    click(close(el));
    assert.deepEqual(remembers(), { view: "strip", closed: true, group: "act" });
    const back = mount(battle(), { expose: true, stored: Object.fromEntries(store) });
    assert.equal(state(back), "closed", "a reload while dismissed stays dismissed");
    click(back.kids[0]);
    console.log(`== remembers · reopened onto the strip\n${state(back)}`);
    assert.equal(state(back), "strip");
  }

  // A key this build cannot read is ignored: the panel draws the first-run state.
  for (const raw of ["", "{", JSON.stringify({ view: "mini", closed: "yes", group: "elsewhere" })]) {
    const el = mount(battle(), { expose: true, stored: { [PANEL_KEY]: raw } });
    assert.equal(state(el), "drawer");
    assert.equal(open(), "act");
  }
}
