import { bundle } from "../hud-bundle.mjs";
class ModifierType {}
class PokemonModifierType extends ModifierType {}
class PokemonHpRestoreModifierType extends PokemonModifierType {}
class PokemonReviveModifierType extends PokemonHpRestoreModifierType {}
class PokemonStatusHealModifierType extends PokemonModifierType {}
class PokemonMoveModifierType extends PokemonModifierType {}
class PokemonPpRestoreModifierType extends PokemonMoveModifierType {}
class PokemonAllMovePpRestoreModifierType extends PokemonModifierType {}
class AddVoucherModifierType extends ModifierType {}
class AddPokeballModifierType extends ModifierType {}
class TempStatStageBoosterModifierType extends ModifierType {}
class PokemonHeldItemModifierType extends PokemonModifierType {}
class BerryModifierType extends PokemonHeldItemModifierType {}
const mk = (C, f) => Object.assign(new C(), f);
const opt = (t, cost = 0) => ({ modifierTypeOption: { type: t, cost } });
const shopRows = [[
  opt(mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", restorePoints: 20, restorePercent: 10 }), 266),
  opt(mk(PokemonPpRestoreModifierType, { name: "Ether", iconImage: "ether", restorePoints: 10 }), 532),
  opt(mk(PokemonReviveModifierType, { name: "Revive", iconImage: "revive", restorePoints: 0, restorePercent: 50 }), 2660),
  opt(mk(PokemonHpRestoreModifierType, { name: "Super Potion", iconImage: "super_potion", restorePoints: 50, restorePercent: 25 }), 599),
], [
  opt(mk(PokemonStatusHealModifierType, { name: "Full Heal", iconImage: "full_heal" }), 1330),
  opt(mk(PokemonAllMovePpRestoreModifierType, { name: "Elixir", iconImage: "elixir", restorePoints: 10 }), 1330),
  opt(mk(PokemonPpRestoreModifierType, { name: "Max Ether", iconImage: "max_ether", restorePoints: -1 }), 1330),
  opt(mk(PokemonHpRestoreModifierType, { name: "Hyper Potion", iconImage: "hyper_potion", restorePoints: 200, restorePercent: 50 }), 1064),
]];
const pk = (name, hp, max, status, moves) => ({ name, hp, getMaxHp: () => max, status: status ? { effect: status } : null, getIconAtlasKey: () => "k", getIconId: () => 1,
  moveset: moves.map(([n, used, maxPp]) => ({ getName: () => n, ppUsed: used, getMovePp: () => maxPp })) });
const scenarios = {
  hurt: { money: 15256, party: [pk("Charizard", 186, 186, 0, [["Heat Wave", 9, 10], ["Air Slash", 0, 15]]), pk("Blastoise", 70, 187, 0, [["Aqua Tail", 0, 10]]), pk("Morpeko", 0, 157, 0, [["Spark", 0, 20]]), pk("Scrafty", 150, 161, 6, [["Brick Break", 0, 15]])],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(BerryModifierType, { name: "Leppa Berry", iconImage: "leppa_berry", tier: 0 }), mk(TempStatStageBoosterModifierType, { name: "X Accuracy", iconImage: "x_accuracy", tier: 0 }), mk(AddVoucherModifierType, { name: "1× Egg Voucher", iconImage: "coupon", tier: 1 })] },
  healthy: { money: 15256, party: [pk("Charizard", 186, 186, 0, [["Heat Wave", 0, 10]])],
    free: [mk(AddPokeballModifierType, { name: "5× Poké Ball", iconImage: "pb", tier: 0, pokeballType: 0 }), mk(TempStatStageBoosterModifierType, { name: "X Defense", iconImage: "x_defense", tier: 0 }), mk(PokemonHpRestoreModifierType, { name: "Potion", iconImage: "potion", tier: 0, restorePoints: 20, restorePercent: 10 })] },
};
for (const [label, sc] of Object.entries(scenarios)) {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const handler = { options: sc.free.map(t => opt(t)), shopOptionsRows: shopRows, rerollCost: 2250 };
  const scene = { money: sc.money, pokeballCounts: { 0: 34 }, currentBattle: {}, ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => sc.party, getEnemyParty: () => [] };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud"));
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  console.log(`== ${label}\n` + (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : ""));
}
