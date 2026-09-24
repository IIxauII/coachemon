// The **drawn** panel: the skin it wears, the states it shows between decisions, and the watcher's summary of each
// card — the learn-move card with its team line and only-type warning, the rewards card's TM recipient and boss-next
// tag, and the fight plan the battle card always draws in full. The panel has one fidelity, so every card here is
// drawn once. The content half of a card is pinned in grouptest, which draws nothing.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const mv = ([n, t, p, c, a = 100]) => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: 3, isChargingMove: () => false, attrs: [] });
const pk = (name, types, atk, spa, moves) => ({ name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100), getIconAtlasKey: () => "k", getIconId: () => 1, moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })) });

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const mount = (scene, { expose = false, view = "full" } = {}) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener(ev, fn) { if (ev === "click") n.onclick = fn; }, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => view, setItem() {} };
  eval(bundle("hud", { expose }));
  return el;
};
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
  // Nothing inside the pane opens anything: a group is a tab, and a tab is open or it is not — there is no in-pane
  // expansion anywhere (§2). The controls the panel does draw are the shell's own: the close one, and the tabs.
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

// ---- The skin (#349 §8, §9), and what the panel shows between decisions (§11)
// The tokens are recorded rather than restated, so moving any of them is a golden diff and not a silent redesign.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene);
  console.log("== skin");
  // The game's window interior, opaque; its outline as one shadow at 1px offset for the whole panel; its message
  // white; and the one treatment the game never draws, a 1px flat gold rule around the whole object.
  for (const k of ["background", "color", "border", "boxShadow"]) console.log(`panel ${k}: ${el.style[k]}`);
  console.log(`chrome font: ${el.style.fontSize}/${el.style.lineHeight} ${el.style.fontFamily}`);
  // The two faces, split by the game's own density rule: the default face for chrome, the dense face at half the
  // size for rows. The shell decides which register a node is in, so a row is where the dense face shows up —
  // wherever the shell put it, which since #357 is inside the drawer's pane.
  const under = n => (n == null || typeof n !== "object" ? [] : (n.children ?? []).flatMap(k => [k, ...under(k)]));
  const rows = [...el.kids, ...el.kids.flatMap(under)].filter(n => n?.style?.fontFamily);
  const rowFonts = [...new Set(rows.map(n => `${n.style.fontSize}/${n.style.lineHeight} ${n.style.fontFamily}`))];
  console.log(`rows font: ${rowFonts.join(" | ")}`);
  assert.equal(rowFonts.length, 1, "one row register, not three");
  // What a row emphasises it keeps: the register must not flatten a weight already on it. No card leads with a bold
  // row any more — the header line that was one is the strip's caption now (#356) — so the emphasis the register has
  // to survive is the one inside a row, and the rule itself is held to the three longhands. The `font` shorthand
  // resets every longhand it does not name, which is exactly how the weight would go.
  assert.ok(rows.flatMap(under).some(n => n?.style?.fontWeight === "bold"), "a row's own emphasis survives the register");
  assert.equal(bundle("hud").match(/\bfont:/g), null, "the panel sets the two faces through the longhands, never the font shorthand");
  // **A register has one size**, which the shell sets on the row and nothing below the row overrides. This is the
  // assertion that bites: a leftover literal inside a row is not merely a third rung, it renders *larger* than the
  // row containing it, which the old base/small/tiny scale could never produce.
  const sized = rows.flatMap(under).filter(n => n?.style?.fontSize);
  assert.deepEqual(sized.map(n => n.style.fontSize), [], "nothing inside a row sets a size of its own");

  // §10: the panel never signals. No transition, no animation and no keyframe anywhere — asserted, which is how §10
  // is enforced rather than merely written down. Reduced motion needs no handling because there is no motion.
  const styles = n => (n == null || typeof n !== "object" ? [] : [n.style ?? {}, ...(n.children ?? []).flatMap(styles)]);
  const motion = p => [p.style, ...(p.kids ?? []).flatMap(styles)].flatMap(Object.keys).filter(k => /^(transition|animation)/i.test(k));
  assert.deepEqual(motion(el), [], "nothing drawn on the panel carries a transition or an animation");
  const src = bundle("hud");
  assert.ok(!src.includes("@keyframes"), "the panel declares no keyframes");
  // The words themselves can't be banned — the model's own prose talks about the game's turn animations — so the
  // guard is on the forms a style is set by: a property or an assignment, in any branch, drawn by this file's
  // fixtures or not. `cssText` and `setProperty` are banned outright, because either would let one in without the
  // guard ever seeing the word.
  assert.equal(src.match(/\b(transition|animation)[A-Za-z]*\s*[:=]/gi), null, "no branch of the panel sets a transition or an animation");
  assert.equal(src.match(/\b(cssText|setProperty)\b/g), null, "the panel sets no style through cssText or setProperty, which would slip past the guard above");
  // The drawn tree above only covers the branches this file's fixtures reach, and a leftover size can sit on one
  // they don't — a foe's TERA tag, say. So the source is checked as well: the shell's row register is the only
  // place in the panel that sets a size at all.
  assert.deepEqual(src.match(/fontSize:/g), ["fontSize:", "fontSize:"],
    "the two registers — the panel's own chrome and the shell's row register — are the only sizes the panel sets");

  // The panel carries no mark, wordmark or name of its own (§9).
  assert.ok(!/coachemon|coach hud/i.test(lines(el)), lines(el));

  // Dismissed: a bare glyph from the settled alphabet, inside the same rule. It names the panel no more than the
  // panel names itself — that was the one place a name would have cost no layout pixels, and it is declined (§9) —
  // and it carries nothing live, because dismissed means silent (§10).
  const shut = mount(scene, { view: "closed" });
  console.log(`== dismissed\n${lines(shut)}`);
  assert.equal(shut.style.border, "1px solid #f8b050");
  assert.deepEqual(motion(shut), [], "the dismissed glyph carries nothing live either");
  assert.ok(!/coachemon|coach hud/i.test(lines(shut)), lines(shut));
}

// ---- The strip (#349 §2, §6, #356)
// The one line the player always needs, across its two lines: the verdict dot, the verdict word and the caption on
// the first, the call on the second. It sits above everything else the panel shows, so the thing to do now is never
// a click away — and the act pane below it does not repeat it.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene, { expose: true });
  const { captionBattle, drawBattle } = globalThis.__hud["96-render-battle"];
  const { strip } = globalThis.__hud["90-render"];
  // The panel is its control, then the strip, then the drawer.
  const [head, call] = el.kids[1].children;
  const [dot, word, caption] = head.children;
  const flat = n => txt(n).replace(/\s+/g, " ").trim();
  console.log(`== strip\nhead ${flat(head)}\ncall ${flat(call)}\ndot ${dot.style.background} ${dot.style.width} ${dot.style.borderRadius}`);
  // The dot's five colours are outside the colour law and quoted from the game all the same; a trainer wave's is the
  // game's label gold, and the word beside it is what tells gold's two verdicts apart.
  assert.equal(dot.style.background, "#f8b050");
  assert.equal(flat(word), "trainer");
  // The caption is the kind's emoji and what the card is about, in gold chrome. Its arrow-separated list is **our**
  // mons — who we are sending — and never the foes the card is about.
  assert.equal(caption.style.color, "#f8b050");
  assert.ok(flat(caption).startsWith("🎯 W15 · Youngster"), flat(caption));
  assert.ok(flat(caption).includes("Charizard") && !/Paras|Oddish/.test(flat(caption)), flat(caption));
  // On a double that list is the pair on the field, in the same arrow-separated shape.
  assert.equal(flat(captionBattle({ kind: "battle", title: "W89 · Tester", trainer: true, double: true,
    field: { slots: [{ name: "Blastoise" }, { name: "Venusaur" }] },
    order: [{ icon: null, name: "Blastoise" }, { icon: null, name: "Venusaur" }] })),
    "🎯 W89 · Tester Blastoise › Venusaur");
  // The call is `act.summary` verbatim, so the strip, the verdict and the watch line are one string. It wraps to two
  // lines and is then cut by the browser — nothing on the panel truncates a string, so the group's own summary and
  // the card's text stay whole.
  const act = drawBattle(globalThis.__coachHud.last()).find(g => g.id === "act");
  assert.equal(flat(call), act.summary);
  assert.equal(call.style.WebkitLineClamp, "2");
  assert.deepEqual([call.style.display, call.style.overflow], ["-webkit-box", "hidden"]);
  // **The leading clause must fit**; what follows the first ` · ` may clip, because it is reasoning and not the
  // call. How much of the reasoning survives is a measurement against real fonts at a real width, which stays out
  // of CI (#349's testing decisions) — what is assertable here is the half that makes the budget mean anything: a
  // long summary reaches the node whole, leading clause first, so the browser's clamp can only ever eat the tail.
  // And `overflowWrap`, so an unbroken run clips with it instead of pushing past the panel's edge.
  const long = { id: "act", summary: "Blastoise Wave Crash → Garchomp · 2 hits · Garchomp outspeeds and Earthquake takes 88% · switch costs the turn" };
  const longCall = strip({ verdict: "danger" }, captionBattle({ kind: "battle", title: "W89" }), [long]).children[1];
  assert.equal(flat(longCall), long.summary, "the panel hands the browser the whole string, never a cut one");
  assert.ok(flat(longCall).startsWith(long.summary.split(" · ")[0]), "the leading clause leads it");
  assert.equal(longCall.style.overflowWrap, "anywhere");
  // The act pane does not repeat the call: the strip directly above it is its heading, so the drawer opens on the
  // supporting lines.
  const [, paneBox] = el.kids.slice(2);
  assert.ok(!(paneBox.children ?? []).some(n => flat(n) === act.summary), "the act pane does not repeat the call");
}

// ---- The drawer (#349 §1, §2, §4, #357)
// The tab bar under the strip and the pane under that: one group on screen at a time, the one the player picked.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene, { expose: true });
  const { drawer, openGroup } = globalThis.__hud["90-render"];
  const { drawBattle } = globalThis.__hud["96-render-battle"];
  const flat = n => txt(n).replace(/\s+/g, " ").trim();
  // The panel is its control, the strip, the bar, the pane, the footer — so the drawer is two children and not a
  // stack of every group the card has.
  const [bar, paneBox] = el.kids.slice(2);
  const tabs = bar.children;
  console.log(`== drawer\ntabs ${tabs.map(flat).join(" | ")}\nopen ${openGroup()}\npane ${paneBox.children.map(flat).join(" / ")}`);
  // The tokens are recorded rather than restated: which ink says a tab is open, and the pane's own budget, are both
  // golden diffs if they move.
  console.log(`bar ${tabs.map(t => `${t.style.fontWeight} ${t.style.color}`).join(" | ")}`);
  console.log(`pane cap ${paneBox.style.maxHeight} ${paneBox.style.overflowY}`);
  // One tab per group the card has, labels only, in the fixed global order — `foes` in the same place whatever kind
  // of decision is up, because the shell walks `GROUP_IDS` and not the order a renderer happened to return.
  const groups = drawBattle(globalThis.__coachHud.last());
  // A trainer wave with nothing to catch and nothing rolled ahead has three groups, so the bar has three tabs.
  assert.deepEqual(tabs.map(flat), ["Now", "Foes", "Plan"]);
  assert.deepEqual(tabs.map(flat), globalThis.__hud["90-render"].GROUP_IDS
    .flatMap(id => groups.filter(g => g.id === id)).map(g => g.label), "the bar is in the fixed global order");
  // The bar never wraps, never scrolls and has no overflow menu: a label that overruns is the browser's to cut.
  assert.equal(bar.style.flexWrap, "nowrap");
  assert.equal(bar.style.overflow, "hidden");
  assert.deepEqual([...new Set(tabs.map(t => t.style.textOverflow))], ["ellipsis"]);
  // With nothing remembered yet, the drawer opens on `act`, and no tab carries a mark, a count or any state beyond
  // being the open one — which is weight and ink, never the gold the authorship rule owns.
  assert.equal(openGroup(), "act");
  assert.deepEqual([tabs[0].style.fontWeight, tabs[0].style.color], ["bold", "#f8f8f8"]);
  assert.deepEqual([tabs[1].style.fontWeight, tabs[1].style.color], ["normal", "#9aa"]);
  assert.ok(!tabs.some(t => t.style.color === "#f8b050"), "gold never says which tab is open");
  assert.deepEqual(tabs.map(t => flat(t).replace(/[A-Za-z]/g, "")), tabs.map(() => ""), "labels only: no mark, no count");
  // The pane is what scrolls, past the budget the game's message box leaves — and the panel itself no longer does,
  // so the strip and the bar are never what scrolls away.
  assert.deepEqual([paneBox.style.maxHeight, paneBox.style.overflowY], ["calc(0.40 * min(100vw, 177.78vh) - 8px)", "auto"]);
  assert.deepEqual([el.style.maxHeight, el.style.overflowY], [undefined, undefined]);
  // A tab click opens that group's pane and nothing else: the panel never switches the open group by itself.
  tabs[1].onclick({ stopPropagation() {} });
  const [bar2, pane2] = el.kids.slice(2);
  console.log(`== drawer · foes\ntabs ${bar2.children.map(flat).join(" | ")}\nopen ${openGroup()}\npane ${pane2.children.map(flat).join(" / ")}`);
  assert.equal(openGroup(), "foes");
  // Its summary heads the pane, and **its label alone where the summary is absent** — which is this card's foes,
  // whose danger list is empty. One line then an ellipsis, because nothing there is the call.
  const foesGroup = groups.find(g => g.id === "foes");
  assert.equal(flat(pane2.children[0]), foesGroup.label);
  assert.equal(foesGroup.summary, null, "and this one concluded nothing");
  assert.deepEqual([pane2.children[0].style.whiteSpace, pane2.children[0].style.overflow, pane2.children[0].style.textOverflow],
    ["nowrap", "hidden", "ellipsis"]);
  // Where there is a summary it is the heading, and the label does not come with it: the tab directly above the pane
  // is the name, so a pane that repeated it would spend its first line on what the player just clicked.
  const said = "\u{1f480} Charizard ← Butterfree Gust";
  const [, saidPane] = drawer([{ id: "act", label: "Now", summary: "switch", rows: [] }, { id: "foes", label: "Foes", summary: said, rows: [] }]);
  assert.equal(openGroup(), "foes", "and the group the player is on stays open across a new card that has it");
  assert.equal(flat(saidPane.children[0]), said);
  // A card the player's group is not on moves the drawer to `act` as it draws, and does not jump back when the
  // group returns: the fallback is a move, not a detour (§3).
  const one = [{ id: "act", label: "Now", summary: "no advice — the enemy AI call threw", rows: [] }];
  const [oneBar, onePane] = drawer(one);
  console.log(`== drawer · one group\ntabs ${oneBar.children.map(flat).join(" | ")}\nopen ${openGroup()}\npane ${onePane.children.map(flat).join(" / ")}`);
  assert.deepEqual(oneBar.children.map(flat), ["Now"], "a whole-card replacement draws a bar with one tab");
  assert.equal(openGroup(), "act");
  assert.deepEqual(drawer(groups)[0].children.map(flat), ["Now", "Foes", "Plan"]);
  assert.equal(openGroup(), "act", "and the drawer does not jump back to the group the fallback left");
}

// A card with no verdict draws no dot and no word; the caption and the call still draw. The verdict is a battle
// card's one-word call, so the learn card has none.
{
  const scene = { currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] };
  const el = mount(scene);
  const [head, call] = el.kids[1].children;
  console.log(`== strip · no verdict\nhead ${txt(head).replace(/\s+/g, " ").trim()}\ncall ${txt(call)}`);
  assert.equal(head.children.length, 1, "the caption alone: no dot and no word");
  assert.equal(head.children[0].style.color, "#f8b050", "and the one thing on it is the caption");
  assert.ok(txt(call).startsWith("Learn → forget"), txt(call));
}

// ---- The footprint and the type ladder (#349 §4, #355)
// Every length on the panel is one knob's — the game's own drawn width, in pure CSS — so the panel covers the same
// share of the field at every window shape and wears the type the game is wearing. The numbers are recorded rather
// than restated: moving one is a golden diff. They are geometric facts about real fonts at real sizes, measured
// against the game's own font files, and nothing re-derives them here.
{
  const scene = { phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]], currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  const el = mount(scene);
  console.log("== footprint");
  // Position stays the viewport's top-left — off 16:9 that corner is the game's own letterbox bar — and the width is
  // a fraction of the game clamped to 0.75×–1.5× of its 300px reference, with the box as the footprint. The height
  // budget is not the panel's any more: it is the drawer's pane that stops growing and scrolls (#357).
  for (const k of ["position", "top", "left", "width", "boxSizing", "padding", "maxHeight", "overflowY"]) console.log(`panel ${k}: ${el.style[k]}`);
  // No canvas rect read and no resize observer: the footprint is pure CSS, which is what makes it survive a resize
  // with nothing listening.
  const src = bundle("hud");
  assert.equal(src.match(/getBoundingClientRect|ResizeObserver|addEventListener\("resize"/g), null,
    "the footprint reads no canvas rect and observes no resize");
  // The width cap that stood beside the old font-size knob is gone with it: nothing pins the panel to a pixel width.
  assert.equal(el.style.maxWidth, undefined, "no width cap of its own");
  // A dismissal is the one thing that shrinks the panel off the ladder, to whatever the glyph needs.
  assert.equal(mount(scene, { view: "closed" }).style.width, "auto");
}

// A refresh that threw: one line, inside the gold rule, with no strip, no tab bar, no drawer and no law frame (§11).
{
  const el = mount({ get ui() { throw new Error("the scene went away"); } });
  console.log(`== failed refresh\n${lines(el)}`);
  assert.equal(el.style.display, "block");
  assert.equal(el.style.border, "1px solid #f8b050", "a broken panel still reads as the coach's own object");
  assert.equal(el.kids, undefined, "nothing is shelled around the line");
}

// Nothing to coach — mid-reload or the title screen — hides the panel entirely, as today (§11).
{
  const el = mount({ ui: null });
  assert.equal(el.style.display, "none");
  console.log("== nothing to coach\nhidden");
}

// A sprite the atlas has not loaded falls back to the name it stands for, and the panel redraws on the next refresh
// until the sprite lands — the draw signature is never banked while a sprite is still missing (§11).
{
  const scene = { currentBattle: { waveIndex: 12, double: false }, ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: charmeleon, newMove: mv(["Flamethrower","Fire",90,"S"]) }) }, getEnemyParty: () => [], getPlayerParty: () => [charmeleon] };
  const el = mount(scene, { expose: true });
  assert.ok(lines(el).includes("Charmeleon"), "the icon falls back to the name");
  assert.ok(globalThis.__hud["90-render"].missedSprite(), "a wanted sprite that wasn't there is remembered");
  el.kids = undefined;
  globalThis.__hud["98-tick"].tick();
  assert.ok(el.kids, "the same card is drawn again while a sprite is still missing");
}
