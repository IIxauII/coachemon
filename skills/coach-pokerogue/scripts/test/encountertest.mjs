// Mystery Encounter card: on the encounter's option screen (UiMode 45) the HUD reads each option — label, whether it can
// be picked, who qualifies, what it costs — and, for the common encounters it knows, what the option really does and a
// take / ok / avoid call. Seed forks are mocked with scripted draws per offset, so the tests pin which fork each roll
// is read from (pre-option ×1, option ×500, post-option ×2000) and that every fork's sow is put back.
// Covers: the chest's trap and prize rolls and its odds without a seed offset, the store's exact item rolls and the
// low-on-balls switch, Fight or Flight with and without a thief, Fiery Fallout's burn target, Berries Abound faster and
// slower, Part-Timer pay, the vitamin dealer's new nature and money reserve, Teleporting Hijinks' destination, Uncommon
// Breed's catch value, a GTS upgrade, Lost at Sea's guide, The Strong Stuff's losers, an encounter it doesn't know, and
// the summary line. Prints the rendered card, so run.mjs keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };

// ---- Pokémon mocks. stats: [hp, atk, def, spa, spd, spe].
const species = (id, name, types, bst, extra = {}) => ({ speciesId: id, name, type1: TY.indexOf(types[0]), type2: types[1] ? TY.indexOf(types[1]) : null,
  baseTotal: bst, getEvolutionLevels: () => [], getRootSpeciesId: () => id, getName: () => name, getIconAtlasKey: () => "k", getIconId: () => String(id), ...extra });
let nextId = 1;
const pk = (name, types, level, { stats = [100, 80, 80, 80, 80, 80], hp, bst = 500, moves = [], nature = 0, status = 0, ability = "x", id } = {}) => {
  const sp = species(id ?? 100 + nextId, name, types, bst);
  const p = {
    id: id ?? nextId++, name, level, species: sp, nature, status: status ? { effect: status } : null,
    hp: hp ?? stats[0], getMaxHp: () => stats[0], getHpRatio: () => p.hp / stats[0], getStat: i => stats[i],
    getTypes: () => [sp.type1, sp.type2].filter(t => t != null), getAbility: () => ({ name: ability }), hasPassive: () => false,
    isAllowedInBattle: () => p.hp > 0, isAllowedInChallenge: () => true, isOfType: t => p.getTypes().includes(t),
    canSetStatus: () => true, getSpeciesForm: () => ({ getBaseStatTotal: () => bst }),
    getIconAtlasKey: () => "k", getIconId: () => name,
    moveset: moves.map(([n, t, pw, c, moveId]) => ({ moveId: moveId ?? n, getName: () => n, getMove: () => ({ name: n, type: TY.indexOf(t), power: pw, category: cat[c] }) })),
  };
  return p;
};
const team = () => [
  pk("Garchomp", ["Dragon", "Ground"], 40, { stats: [150, 130, 95, 80, 85, 102], bst: 600, nature: 3, moves: [["Earthquake", "Ground", 100, "P"], ["Dragon Claw", "Dragon", 80, "P"]] }),
  pk("Lapras", ["Water", "Ice"], 38, { stats: [170, 85, 80, 85, 95, 60], bst: 535, moves: [["Surf", "Water", 90, "S"], ["Ice Beam", "Ice", 90, "S"]] }),
  pk("Jolteon", ["Electric"], 36, { stats: [100, 65, 60, 110, 95, 130], bst: 525, ability: "Volt Absorb", moves: [["Thunderbolt", "Electric", 90, "S"]] }),
];

// ---- Requirement mocks: the game's classes by name, `queryParty` a filter.
const named = name => { const C = function () {}; Object.defineProperty(C, "name", { value: name }); return C; };
const make = (name, fields) => Object.assign(new (named(name))(), fields);
const money$ = (mult) => make("MoneyRequirement", { requiredMoney: 0, scalingMultiplier: mult });
const moveReq = moves => make("MoveRequirement", { queryParty: party => party.filter(p => p.moveset.some(m => moves.includes(m.moveId))) });
const typeReq = types => make("TypeRequirement", { queryParty: party => party.filter(p => p.getTypes().some(t => types.includes(TY[t]))) });

// optionMode: 0 DEFAULT, 1 DISABLED_OR_DEFAULT, 3 DISABLED_OR_SPECIAL
// `met`: force the requirement answer (a scene requirement the mock doesn't evaluate).
const option = ({ mode = 0, requirements = [], primary = [], met } = {}) => ({ optionMode: mode, requirements, primaryPokemonRequirements: primary, primaryPokemon: undefined, met });

const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
const lines = el => (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + (el.textContent ? `\nTEXT ${el.textContent}` : "");

// Scripted fork draws: `draws[offset]` is the sequence a fork sown at that offset yields (taken modulo the range);
// a fork at an unscripted offset yields 0s. `forks` records every offset sown.
const mount = ({ view = "full", type, labels, options, party = team(), wave = 30, money = 5000, draws = {}, misc = null, configs = [],
  tier = 66, catchAllowed = false, seedOffset = 30512, biome = 3, balls = [10, 10, 10, 0, 0], modifiers = [], dex = {}, menu = options } = {}) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const forks = [];
  const me = { encounterType: type, encounterTier: tier, options, misc, catchAllowed, enemyPartyConfigs: configs,
    ...(seedOffset == null ? {} : { getSeedOffset: () => seedOffset }) };
  // What displayEncounterOptions leaves behind: the requirement answers and the first qualifier as primaryPokemon.
  const meets = menu.map(o => {
    let q = party;
    for (const r of o.primaryPokemonRequirements) q = q.filter(p => r.queryParty(party).includes(p));
    if (o.primaryPokemonRequirements.length) o.primaryPokemon = q[0];
    const cash = o.requirements.find(r => r.constructor.name === "MoneyRequirement");
    return o.met ?? ((!o.primaryPokemonRequirements.length || q.length > 0) && (!cash || waveMoney(wave, cash.scalingMultiplier) <= money));
  });
  const handler = { encounterOptions: menu, optionsMeetsReqs: meets, optionsContainer: { list: [...labels, "View Party"].map(t => ({ text: `[color=#fff]${t}[/color]` })) } };
  const rnd = { _s: "!rnd,live", _q: null, _i: 0,
    state(v) { if (v !== undefined) { this._s = v; this._q = null; } return this._s; },
    integerInRange(min, max) { const q = this._q ?? []; const x = q[this._i++] ?? 0; return min + (x % (max - min + 1)); } };
  const scene = {
    phaseManager: { getCurrentPhase: () => ({ phaseName: "MysteryEncounterPhase" }), pushPhase() {}, unshiftNew() {}, queueMessage() {} },
    currentBattle: { waveIndex: wave, mysteryEncounter: me, enemyLevels: [wave + 2] }, arena: { biomeId: biome },
    ui: { getMode: () => 45, getHandler: () => handler }, getPlayerParty: () => party, getEnemyParty: () => [],
    money, modifiers, pokeballCounts: balls, gameData: { dexData: dex, starterData: {} },
    getWaveMoneyAmount: mult => waveMoney(wave, mult),
    executeWithSeedOffset(fn, offset) {
      forks.push(offset);
      const saved = rnd.state();
      rnd._s = `!rnd,${offset}`; rnd._q = draws[offset] ?? []; rnd._i = 0;
      fn();
      rnd.state(saved);
    },
  };
  globalThis.Phaser = { Math: { RND: rnd }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => view, setItem() {} };
  eval(bundle("hud"));
  return { el, scene, forks, model: () => globalThis.__coachHud.last(), rnd };
};
// BattleScene.getWaveMoneyAmount.
function waveMoney(waveIndex, mult) {
  const set = Math.ceil(waveIndex / 10) - 1;
  return Math.floor(Math.pow((set + 1 + (0.75 + (((waveIndex - 1) % 10) + 1) / 10)) * 100, 1 + 0.005 * set) * mult / 10) * 10;
}
const show = (title, args, views = ["full", "mini"]) => {
  for (const view of views) {
    const { el } = mount({ ...args, view });
    console.log(`== ${title} (${view})\n${lines(el)}`);
  }
  const r = mount(args);
  console.log(`summary ${globalThis.__coachHud.summary().encounter}`);
  assert.equal(globalThis.__coachHud.stats().breaches, 0, `${title}: sandbox restored`);
  assert.equal(r.rnd.state(), "!rnd,live", `${title}: live stream untouched`);
  return r;
};
const verdicts = m => m.options.map(o => o.verdict);

// ---- 1. Mysterious Chest: the trap roll is the pre-option fork's first draw (offset ×1).
const chest = extra => ({ type: 1, labels: ["Open it", "Leave"], options: [option(), option()], ...extra });
{
  const { forks, model } = show("chest, prize", chest({ draws: { 30512: [50] } }));
  assert.ok(forks.includes(30512), `pre-option fork at the seed offset: ${forks}`);
  const m = model();
  assert.equal(m.kind, "encounter");
  assert.equal(m.name, "Mysterious Chest");
  assert.equal(m.options[0].outcome, "pick of 3 Ultra items");
  assert.ok(m.options[0].exact);
  assert.deepEqual(verdicts(m), ["take", "ok"]);
  assert.equal(m.pick, 0);
}
{
  const m = show("chest, trap", chest({ draws: { 30512: [12] } }), ["full"]).model();
  assert.match(m.options[0].outcome, /^trap: Garchomp faints/);
  assert.deepEqual(verdicts(m), ["avoid", "take"]);
  assert.equal(globalThis.__coachHud.summary().encounter, "Mysterious Chest: take Leave — shop only, no reward · avoid Open it");
  for (const [roll, text] of [[30, "a Master item"], [35, "pick of 2 Rogue items"], [75, "pick of 2 Common + 2 Great items"]]) {
    assert.equal(mount(chest({ draws: { 30512: [roll] } })).model().options[0].outcome, text, `roll ${roll}`);
  }
  const blind = mount(chest({ seedOffset: null })).model();
  assert.match(blind.options[0].outcome, /^70% items/);
  assert.equal(blind.options[0].exact, false);
  assert.equal(blind.pick, -1, "no seed, no call on a gamble");
}

// ---- 2. Department Store Sale: each option's rolls come from the option fork (offset ×500), re-sown per option.
{
  const store = extra => ({ type: 6, labels: ["TMs", "Vitamins", "X Items", "Poké Balls"], options: [option(), option(), option(), option()],
    draws: { [30512 * 500]: [60, 11, 4, 42, 3] }, ...extra });
  const { forks, model } = show("store", store(), ["full"]);
  assert.ok(forks.every(f => f === 30512 * 500), `option forks only: ${forks}`);
  const m = model();
  assert.deepEqual(m.options.map(o => o.outcome), [
    "pick of 5 TMs: 2 Common, 2 Great, 1 Ultra",
    "pick of 3: 2 vitamins, 1 PP Up",
    "pick of 5: 4 X items, 1 Dire Hit",
    "pick of 4 ball packs: 1 Poké, 1 Great, 1 Ultra, 1 Rogue",
  ]);
  assert.equal(m.pick, 1, "a vitamin beats a Rogue Ball pack when balls aren't short");
  assert.equal(mount(store({ balls: [3, 1, 0, 0, 0] })).model().pick, 3, "low on good balls: the ball packs");
}

// ---- 3. Fight or Flight: a thief takes the item for free; without one, a boss far over our level means leave.
{
  const fof = (party, level) => ({ type: 3, labels: ["Battle", "Steal", "Leave"],
    options: [option(), option({ mode: 3, primary: [moveReq(["THIEF"])] }), option()],
    misc: { type: { name: "Leftovers" } }, configs: [{ pokemonConfigs: [{ species: species(9, "Tyranitar", ["Rock", "Dark"], 600), level, isBoss: true }] }], party });
  const thief = [...team(), pk("Sneasel", ["Dark", "Ice"], 35, { moves: [["Thief", "Dark", 60, "P", "THIEF"]] })];
  const m = show("fight or flight, thief", fof(thief, 44), ["full"]).model();
  assert.deepEqual(verdicts(m), ["ok", "take", "ok"]);
  assert.equal(m.options[1].by, "Sneasel");
  assert.equal(m.options[1].outcome, "Leftovers (Great tier), no fight, EXP");
  const hard = mount(fof(team(), 47)).model();
  assert.deepEqual(verdicts(hard), ["avoid", "off", "take"], "L47 boss vs L40: leave");
  assert.match(hard.options[1].why, /^needs a Thief/);
  const easy = mount(fof(team(), 40)).model();
  assert.deepEqual(verdicts(easy), ["take", "off", "ok"], "our level and Garchomp hits it SE: fight");
}

// ---- 4. Fiery Fallout: who the search burns is the option fork's first draw over the burnable non-Fire mons.
{
  const party = [...team(), pk("Arcanine", ["Fire"], 37)];
  party[1].status = { effect: 1 }; // Lapras is poisoned: not burnable
  const fallout = extra => ({ type: 11, wave: 60, labels: ["Battle", "Search", "Fire help"],
    options: [option(), option(), option({ mode: 3, primary: [typeReq(["Fire"])] })],
    configs: [{ pokemonConfigs: [{ species: species(637, "Volcarona", ["Bug", "Fire"], 550) }, { species: species(637, "Volcarona", ["Bug", "Fire"], 550) }], doubleBattle: true }],
    party, draws: { [30512 * 500]: [1] }, ...extra });
  const m = show("fiery fallout", fallout(), ["full"]).model();
  assert.equal(m.options[1].outcome, "non-Fire mons lose 20% max HP; Jolteon is burned and its ability becomes Heatproof for good");
  assert.deepEqual(verdicts(m), ["ok", "avoid", "take"]);
  assert.equal(m.options[2].by, "Arcanine");
  const noFire = mount(fallout({ party: team() })).model();
  assert.equal(noFire.options[2].verdict, "off");
}

// ---- 5. Berries Abound: faster than 1.1× the boss's Speed grabs berries without a fight.
{
  const berries = (spe) => ({ type: 19, labels: ["Battle", "Race", "Leave"], options: [option(), option(), option()],
    configs: [{ pokemonConfigs: [{ species: species(20, "Ursaring", ["Normal"], 500), level: 34, isBoss: true }] }],
    misc: { numBerries: 2, fastestPokemon: team()[2], enemySpeed: spe } });
  const fast = show("berries, faster", berries(90), ["full"]).model();
  // 130 / 99 = 1.313 → round(0.313 / 0.08) = 4, capped at 2 berries.
  assert.equal(fast.options[1].outcome, "Jolteon outruns it: 2 berries + pick of 5 berries, no fight, EXP");
  assert.deepEqual(verdicts(fast), ["ok", "take", "ok"]);
  const slow = mount(berries(140)).model();
  assert.match(slow.options[1].outcome, /too slow: the same fight with the boss \+1 Def\/SpD\/Spe/);
  assert.deepEqual(verdicts(slow), ["take", "avoid", "ok"]);
}

// ---- 6. Part-Timer: pay from the game's formula (× Amulet Coin), the best earner named.
{
  const coin = new (named("MoneyMultiplierModifier"))(); coin.getStackCount = () => 1;
  const m = show("part-timer", { type: 21, labels: ["Deliver", "Warehouse", "Sell"], options: [option(), option(), option({ mode: 3, primary: [moveReq(["CHARM"])] })], modifiers: [coin] }, ["full"]).model();
  // Jolteon L36: baseline Spe floor(196·0.36)+5 = 75; 130/75 → ×2.5·1.733 = 4.33, capped at 4. Wave 30 money ×4 = 1480, +20%.
  assert.equal(m.options[0].outcome, `Jolteon earns $${(waveMoney(30, 4) + Math.floor(waveMoney(30, 4) * 0.2)).toLocaleString("en-US")} (Speed); its moves drop to 2 PP`);
  assert.equal(m.pick, 0);
  assert.equal(m.options[2].verdict, "off");
}

// ---- 7. Shady Vitamin Dealer: the cheap deal's new nature is the post-option fork's first draw that differs.
{
  const dealer = extra => ({ type: 7, labels: ["Cheap", "Pricey", "Leave"], options: [option({ mode: 1, requirements: [money$(1.5)] }), option({ mode: 1, requirements: [money$(5)] }), option()],
    draws: { [30512 * 2000]: [3, 15] }, ...extra });
  // Garchomp is Adamant (3): the first draw repeats it, the second is Modest (+SpA −Atk) — bad for a physical attacker.
  const { forks, model } = show("vitamin dealer, rich", dealer({ money: 20000 }), ["full"]);
  assert.ok(forks.includes(30512 * 2000), `post-option fork: ${forks}`);
  const m = model();
  assert.match(m.options[0].outcome, /Garchomp becomes Modest \(\+SpA −Atk\)$/);
  assert.deepEqual(verdicts(m), ["avoid", "take", "ok"]);
  const poor = mount(dealer({ money: waveMoney(30, 5) + 100, draws: { [30512 * 2000]: [0] } })).model();
  assert.equal(poor.options[1].verdict, "ok", "affordable but leaves too little");
  assert.match(poor.options[0].outcome, /Garchomp becomes Hardy \(neutral\)$/);
  assert.equal(mount(dealer({ money: 100 })).model().options[1].verdict, "off");
}

// ---- 8. Teleporting Hijinks: the destination is the option fork's first draw over the candidates minus this biome.
{
  const tele = extra => ({ type: 25, wave: 32, labels: ["Pay", "Machine", "Inspect"], seedOffset: 32512,
    options: [option({ mode: 1, requirements: [money$(1.75)] }), option({ mode: 3, primary: [typeReq(["Steel", "Electric"])] }), option()],
    misc: { price: waveMoney(32, 1.75) }, ...extra });
  const m = show("teleport to a rare biome", tele({ draws: { [32512 * 500]: [1] } }), ["full"]).model();
  assert.match(m.options[1].outcome, /teleport to Fairy Cave/);
  assert.deepEqual(verdicts(m), ["ok", "take", "ok"]);
  assert.equal(m.options[1].by, "Jolteon");
  // Standing in Space: the candidates lose Space, so draw 0 is Fairy Cave, draw 3 is Wasteland.
  assert.match(mount(tele({ biome: 25, draws: { [32512 * 500]: [0] } })).model().options[0].outcome, /Fairy Cave/);
  const plain = mount(tele({ biome: 25, draws: { [32512 * 500]: [3] } })).model();
  assert.match(plain.options[0].outcome, /Wasteland/);
  assert.deepEqual(verdicts(plain), ["ok", "ok", "take"]);
}

// ---- 9. Uncommon Breed: a new species is worth charming; one already on the team isn't worth berries.
{
  const breed = (dex, berries = true, party = team()) => ({ type: 28, labels: ["Battle", "Berries", "Charm"],
    options: [option(), option({ mode: 3, requirements: [make("PersistentModifierRequirement", {})], met: berries }), option({ mode: 3, primary: [moveReq(["ATTRACT"])] })],
    misc: { pokemon: { ...pk("Eevee", ["Normal"], 38, { id: 133 }), species: species(133, "Eevee", ["Normal"], 325), shiny: false, abilityIndex: 0, gender: 0, variant: 0, formIndex: 0 } },
    configs: [{ pokemonConfigs: [{ species: species(133, "Eevee", ["Normal"], 325), level: 38 }] }], dex,
    party: [...party, pk("Milotic", ["Water"], 36, { moves: [["Attract", "Normal", 0, "X", "ATTRACT"]] })] });
  const fresh = show("uncommon breed, new species", breed({}), ["full"]).model();
  assert.deepEqual(verdicts(fresh), ["ok", "ok", "take"]);
  assert.match(fresh.options[2].why, /new species/);
  const seen = mount(breed({ 133: { caughtAttr: 255n } }, false)).model();
  assert.deepEqual(verdicts(seen), ["take", "off", "ok"]);
}

// ---- 10. GTS: the best offer for a mon that isn't the carry, by final BST.
{
  const party = team();
  const offers = new Map(party.map(p => [p.id, [{ species: species(1, "Rattata", ["Normal"], 253) }, { species: species(2, p === party[0] ? "Mewtwo" : "Salamence", ["Dragon", "Flying"], p === party[0] ? 680 : 600) }]]));
  const m = show("gts", { type: 29, labels: ["Trade", "Wonder Trade", "Item Trade", "Leave"], options: [option({ mode: 1 }), option({ mode: 1 }), option(), option()],
    misc: { tradeOptionsMap: offers }, party }, ["full"]).model();
  assert.equal(m.options[0].outcome, "trade: best offer Jolteon → Salamence (final BST +75)");
  assert.equal(m.options[0].verdict, "ok", "+75 isn't an upgrade; the carry's Mewtwo offer isn't considered");
}

// ---- 11. Lost at Sea: a Surf learner guides for free; the storm option chips everyone.
{
  const party = team();
  party[2].hp = 30;
  const learner = moves => make("CanLearnMoveRequirement", { queryParty: p => p.filter(x => x.name === (moves === "SURF" ? "Lapras" : "Nobody")) });
  const m = show("lost at sea", { type: 10, labels: ["Surf", "Fly", "Wander"], options: [option({ mode: 1, primary: [learner("SURF")] }), option({ mode: 1, primary: [learner("FLY")] }), option()], party }, ["full"]).model();
  assert.deepEqual(verdicts(m), ["take", "off", "avoid"]);
  assert.equal(m.options[0].by, "Lapras");
  assert.match(m.options[2].outcome, /Jolteon ends low$/);
}

// ---- 12. The Strong Stuff: the two highest-BST mons lose stats.
{
  const m = show("strong stuff", { type: 12, labels: ["Drink", "Battle"], options: [option(), option()],
    configs: [{ levelAdditiveModifier: 1, pokemonConfigs: [{ species: species(213, "Shuckle", ["Bug", "Rock"], 505), isBoss: true, bossSegments: 5 }] }] }, ["full"]).model();
  assert.match(m.options[0].outcome, /Garchomp & Lapras lose 15/);
  assert.deepEqual(verdicts(m), ["avoid", "take"]);
}

// ---- 13. An encounter the card doesn't know: options, requirements and costs only, no calls.
{
  const m = show("dark deal (not judged)", { type: 2, tier: 3, labels: ["Deal", "Refuse"], options: [option({ mode: 1, requirements: [money$(2)], primary: [typeReq(["Dragon", "Water"])] }), option()] }, ["full", "mini"]).model();
  assert.equal(m.known, false);
  assert.equal(m.tier, "rogue");
  assert.equal(m.options[0].cost, waveMoney(30, 2));
  assert.deepEqual(m.options[0].qualifies, ["Garchomp", "Lapras"]);
  assert.deepEqual(verdicts(m), [null, null]);
  assert.equal(globalThis.__coachHud.summary().encounter, "Dark Deal: not judged");
  // A secondary menu (override options that aren't the encounter's own) is read, not judged.
  const sub = mount(chest({ draws: { 30512: [50] }, menu: [option(), option(), option()], labels: ["A", "B", "C"] })).model();
  assert.equal(sub.known, false);
  assert.deepEqual(sub.options.map(o => o.label), ["A", "B", "C"]);
}
console.log("ok");
