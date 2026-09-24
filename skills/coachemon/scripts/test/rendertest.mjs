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
  // Nothing on the panel opens a section: the only control it draws is the close one.
  const opener = n => (n == null || typeof n === "string" ? null : n.onclick && n.title !== "Close" ? n : (n.children ?? []).map(opener).find(Boolean));
  assert.equal(el.kids.map(opener).find(Boolean) ?? null, null, "the panel draws no in-pane opener");
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
  for (const k of ["background", "color", "border", "boxShadow", "font"]) console.log(`panel ${k}: ${el.style[k]}`);
  // The two faces, split by the game's own density rule: the default face for chrome, the dense face at half the
  // size for rows. The shell decides which register a node is in, so a row is where the dense face shows up.
  const rows = el.kids.filter(n => n?.style?.fontFamily);
  const rowFonts = [...new Set(rows.map(n => `${n.style.fontSize}/${n.style.lineHeight} ${n.style.fontFamily}`))];
  console.log(`rows font: ${rowFonts.join(" | ")}`);
  assert.equal(rowFonts.length, 1, "one row register, not three");
  // A row the shell put in the dense face keeps whatever weight it already had: the card's own header line is bold,
  // and the register must not flatten it.
  assert.ok(rows.some(n => n.style.fontWeight === "bold"), "the dense register keeps a row's weight");
  // **A register has one size**, which the shell sets on the row and nothing below the row overrides. This is the
  // assertion that bites: a leftover literal inside a row is not merely a third rung, it renders *larger* than the
  // row containing it, which the old base/small/tiny scale could never produce.
  const under = n => (n == null || typeof n !== "object" ? [] : (n.children ?? []).flatMap(k => [k, ...under(k)]));
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
  assert.deepEqual(src.match(/fontSize:/g), ["fontSize:"], "the shell's row register is the only size the panel sets");

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
