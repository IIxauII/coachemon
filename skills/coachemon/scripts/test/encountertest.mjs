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
const pk = (name, types, level, { stats = [100, 80, 80, 80, 80, 80], hp, bst = 500, moves = [], nature = 0, status = 0, ability = "x", id, ivs, held = [] } = {}) => {
  const sp = species(id ?? 100 + nextId, name, types, bst);
  const p = {
    id: id ?? nextId++, name, level, species: sp, nature, status: status ? { effect: status } : null,
    hp: hp ?? stats[0], getMaxHp: () => stats[0], getHpRatio: () => p.hp / stats[0], getStat: i => stats[i],
    getTypes: () => [sp.type1, sp.type2].filter(t => t != null), getAbility: () => ({ name: ability }), hasPassive: () => false,
    isAllowedInBattle: () => p.hp > 0, isAllowedInChallenge: () => true, isOfType: t => p.getTypes().includes(t),
    canSetStatus: () => true, getSpeciesForm: () => ({ getBaseStatTotal: () => bst }),
    getIconAtlasKey: () => "k", getIconId: () => name, getNameToRender: () => name, ivs, getHeldItems: () => held,
    moveset: moves.map(([n, t, pw, c, moveId]) => ({ moveId: moveId ?? n, getName: () => n, getMove: () => ({ name: n, type: TY.indexOf(t), power: pw, category: cat[c] }) })),
  };
  return p;
};
const team = () => [
  pk("Garchomp", ["Dragon", "Ground"], 40, { stats: [150, 130, 95, 80, 85, 102], bst: 600, nature: 3, moves: [["Earthquake", "Ground", 100, "P"], ["Dragon Claw", "Dragon", 80, "P"]] }),
  pk("Lapras", ["Water", "Ice"], 38, { stats: [170, 85, 80, 85, 95, 60], bst: 535, moves: [["Surf", "Water", 90, "S"], ["Ice Beam", "Ice", 90, "S"]] }),
  pk("Jolteon", ["Electric"], 36, { stats: [100, 65, 60, 110, 95, 130], bst: 525, ability: "Volt Absorb", moves: [["Thunderbolt", "Electric", 90, "S"]] }),
];

// The same three at a level the wave would actually have them at, for the encounters that price a fight.
const teamAt = level => team().map(p => Object.assign(p, { level }));

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
  tier = 66, catchAllowed = false, seedOffset = 30512, biome = 3, balls = [10, 10, 10, 0, 0], modifiers = [], dex = {}, menu = options, tokens = {} } = {}) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const forks = [];
  const me = { encounterType: type, encounterTier: tier, options, misc, catchAllowed, enemyPartyConfigs: configs, dialogueTokens: tokens,
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
  const m = show("field trip (not judged)", { type: 8, tier: 66, labels: ["Deal", "Refuse"], options: [option({ mode: 1, requirements: [money$(2)], primary: [typeReq(["Dragon", "Water"])] }), option()] }, ["full", "mini"]).model();
  assert.equal(m.known, false);
  assert.equal(m.tier, "common");
  assert.equal(m.options[0].cost, waveMoney(30, 2));
  assert.deepEqual(m.options[0].qualifies, ["Garchomp", "Lapras"]);
  assert.deepEqual(verdicts(m), [null, null]);
  assert.equal(globalThis.__coachHud.summary().encounter, "Field Trip: not judged");
  // A secondary menu (override options that aren't the encounter's own) is read, not judged.
  const sub = mount(chest({ draws: { 30512: [50] }, menu: [option(), option(), option()], labels: ["A", "B", "C"] })).model();
  assert.equal(sub.known, false);
  assert.deepEqual(sub.options.map(o => o.label), ["A", "B", "C"]);
}
// ---- 14. Training Session: the prize with someone to spend it on wins, and the mirror's bars grow with the wave.
{
  const training = (party, wave = 60) => ({ type: 5, tier: 19, wave, labels: ["Light", "Medium", "Heavy", "Leave"],
    options: [option(), option(), option(), option()], party });
  const stuck = [pk("Slaking", ["Normal"], 40, { ability: "Truant", ivs: [31, 31, 31, 31, 31, 31] }), ...team()];
  const m = show("training session, a liability ability", training(stuck)).model();
  assert.deepEqual(verdicts(m), ["ok", "ok", "take", "ok"]);
  assert.match(m.options[2].outcome, /4-bar boss of itself, \+1 to every stat/, "wave 60 → 2 + 60/30 bars, capped at 6");
  assert.match(m.options[2].why, /Slaking is stuck with Truant/);
  assert.match(m.options[0].outcome, /3-bar boss/, "the light mirror grows every 50 waves");
  // No liability ability, but Garchomp is Bold: its nature drops the stat it attacks with.
  const bold = [pk("Garchomp", ["Dragon", "Ground"], 40, { stats: [150, 130, 95, 80, 85, 102], bst: 600, nature: 5 }), ...team().slice(1)];
  const n = mount(training(bold)).model();
  assert.deepEqual(verdicts(n), ["ok", "take", "ok", "ok"]);
  assert.match(n.options[1].why, /Garchomp's nature works against it/);
  // Nothing to fix: the IV prize is the cheapest fight, and leaving is as good.
  const fine = mount(training(team())).model();
  assert.deepEqual(verdicts(fine), ["ok", "ok", "ok", "take"]);
}

// ---- 15. The Pokémon Salesman: a level-5 mon is an unlock buy, judged on the catch card's account reasons.
{
  const sale = (dex, money = 50000) => ({ type: 13, tier: 19, money, labels: ["Buy", "Leave"],
    options: [option({ mode: 1, requirements: [money$(4)] }), option()],
    misc: { price: waveMoney(30, 4), pokemon: { ...pk("Larvesta", ["Bug", "Fire"], 5, { id: 636 }), species: species(636, "Larvesta", ["Bug", "Fire"], 360), shiny: false, abilityIndex: 2, variant: 0, formIndex: 0 } },
    dex });
  const m = show("salesman, a new species", sale({})).model();
  assert.deepEqual(verdicts(m), ["take", "ok"]);
  assert.match(m.options[0].outcome, /Larvesta \(hidden ability\) joins at L5/);
  assert.equal(m.options[0].exact, false, 'what onInit left on the encounter is read, not replayed');
  // Already owned, so the price buys a level-5 mon and nothing else.
  const owned = mount(sale({ 636: { caughtAttr: 255n } })).model();
  assert.deepEqual(verdicts(owned), ["avoid", "take"]);
  // Wanted, but not at the price of the next three waves' money.
  const broke = mount(sale({}, waveMoney(30, 4) + 100)).model();
  assert.deepEqual(verdicts(broke), ["ok", "take"]);
}

// ---- 16. Trash to Treasure: the dig's two items land on the first member not already capped.
{
  const full = m => ({ constructor: { name: m }, getStackCount: () => 4, getMaxStackCount: () => 4 });
  const party = [pk("Garchomp", ["Dragon", "Ground"], 125, { stats: [150, 130, 95, 80, 85, 102], bst: 600, held: [full("TurnHealModifier")], moves: [["Earthquake", "Ground", 100, "P"]] }),
    pk("Lapras", ["Water", "Ice"], 124, { stats: [170, 85, 80, 85, 95, 60], bst: 535, moves: [["Surf", "Water", 90, "S"]] })];
  const m = show("trash to treasure", { type: 18, tier: 19, wave: 120, labels: ["Investigate", "Dig"], options: [option(), option()], party,
    configs: [{ levelAdditiveModifier: 0.5, pokemonConfigs: [{ species: species(569, "Garbodor", ["Poison"], 474), isBoss: true, bossSegments: 6 }] }] }).model();
  assert.deepEqual(verdicts(m), ["take", "ok"]);
  assert.match(m.options[0].outcome, /6 bars.*no switching/);
  assert.match(m.options[1].outcome, /^Leftovers to Lapras, Shell Bell to Garchomp/, "Garchomp's Leftovers are capped; nobody holds a Shell Bell");
  assert.match(m.options[1].why, /60 waves of shopping left/);
}

// ---- 17. Clowning Around: the ability and Blacephalon's types are read, the type shuffle is replayed.
{
  const party = [pk("Garchomp", ["Dragon", "Ground"], 90, { stats: [150, 130, 95, 80, 85, 102], bst: 600, moves: [["Earthquake", "Ground", 100, "P"]] }),
    pk("Lapras", ["Water", "Ice"], 88, { stats: [170, 85, 80, 85, 95, 60], bst: 535, moves: [["Body Slam", "Normal", 85, "P"], ["Surf", "Water", 90, "S"]] })];
  const { model } = show("clowning around", { type: 20, tier: 19, wave: 90, labels: ["Battle", "Item shuffle", "Type shuffle"],
    options: [option(), option(), option()], party, tokens: { ability: "[color=#fff]Prankster[/color]" },
    draws: { 30512: [6] },
    configs: [{ trainerConfig: { name: "Harlequin", partyTemplates: [{ size: 2 }] }, doubleBattle: true,
      pokemonConfigs: [{ species: species(122, "Mr. Mime", ["Psychic", "Fairy"], 460), isBoss: true },
        { species: species(806, "Blacephalon", ["Fire", "Ghost"], 570), isBoss: true, customPokemonData: { types: [9, 12] } }] }] });
  const m = model();
  assert.deepEqual(verdicts(m), ["take", null, null]);
  assert.match(m.options[0].outcome, /Fire \/ Electric, Prankster/);
  assert.match(m.options[0].why, /Prankster is worth keeping/);
  // Garchomp attacks only on its own types, so its new one is the fork's `randSeedInt(18)`; Lapras has an off-type
  // Normal move, which the game prefers and which hands it STAB it didn't have.
  assert.equal(m.options[2].outcome, "every member's 2nd type is redrawn: Garchomp → Bug, Lapras → Normal");
  assert.equal(m.options[2].exact, true);
  assert.match(m.options[2].why, /1 member gains STAB/);
}

// ---- 18. The Expert Pokémon Breeder: the most eggs wins, and losing costs only friendship.
{
  const bench = pk("Magikarp", ["Water"], 78, { bst: 200 });
  const m = show("expert breeder", { type: 30, tier: 19, wave: 80, labels: ["Magikarp", "Lapras", "Jolteon"],
    options: [option(), option(), option()], party: teamAt(80),
    misc: { pokemon1: bench, pokemon1CommonEggs: 5, pokemon1RareEggs: 4,
      pokemon2: teamAt(80)[1], pokemon2CommonEggs: 5, pokemon2RareEggs: 2,
      pokemon3: teamAt(80)[2], pokemon3CommonEggs: 3, pokemon3RareEggs: 0 },
    configs: [{ trainerType: 1, pokemonConfigs: [{ species: species(35, "Clefable", ["Fairy"], 483) }, { species: species(113, "Chansey", ["Normal"], 450) }, { species: species(132, "Ditto", ["Normal"], 288) }] }] }).model();
  assert.deepEqual(verdicts(m), ["take", "ok", "ok"]);
  assert.match(m.options[0].outcome, /Magikarp fights the breeder's 3 alone → 4 Great eggs \+ 5 Common eggs/);
  assert.match(m.options[0].why, /1 of yours fit to fight/);
  assert.match(m.options[0].why, /lose and the party comes back/);
}

// ---- 19. Dark Deal: which member it takes is the pre-option fork's draw, the legendary's tier the option fork's.
{
  const deal = draws => ({ type: 2, tier: 3, labels: ["Deal", "Refuse"], options: [option(), option()], draws });
  const { forks, model } = show("dark deal, it takes the weakest", deal({ 30512: [2], [30512 * 500]: [70] }));
  assert.ok(forks.includes(30512) && forks.includes(30512 * 500), `both forks: ${forks}`);
  const m = model();
  assert.deepEqual(verdicts(m), ["take", "ok"]);
  assert.match(m.options[0].outcome, /Jolteon is taken for good → .*starter tier 6/);
  assert.equal(m.options[0].exact, true);
  // It rolled the carry instead: the same deal, the opposite call.
  const carry = mount(deal({ 30512: [0], [30512 * 500]: [2] })).model();
  assert.deepEqual(verdicts(carry), ["avoid", "take"]);
  assert.match(carry.options[0].outcome, /Garchomp is taken for good → .*starter tier 9–10/);
}

// ---- 20. A Trainer's Test: an Elite Four party for an Epic egg, or a full heal for declining.
{
  const test = (party, level = 1) => ({ type: 17, tier: 3, wave: 60, labels: ["Accept", "Decline"], options: [option(), option()], party,
    configs: [{ levelAdditiveModifier: level, trainerConfig: { name: "Cheryl", partyTemplates: [{ size: 6 }] } }] });
  const m = show("a trainer's test", test(teamAt(65))).model();
  assert.deepEqual(verdicts(m), ["take", "ok"]);
  assert.match(m.options[0].outcome, /fight Cheryl: 6 mons, Elite Four strength → an Epic egg/);
  assert.match(m.options[0].why, /6 mons at ~L68 vs your L65, 3 of yours fit to fight/);
  // A party that is mostly down: six mons against one that can stand is a fight to decline.
  const hurt = [pk("Garchomp", ["Dragon", "Ground"], 65, { stats: [150, 130, 95, 80, 85, 102], bst: 600 }),
    pk("Lapras", ["Water", "Ice"], 64, { stats: [170, 85, 80, 85, 95, 60], bst: 535, hp: 10 })];
  const beaten = mount(test(hurt)).model();
  assert.deepEqual(verdicts(beaten), ["avoid", "take"]);
  assert.match(beaten.options[1].why, /the heal is worth more/);
}

// ---- 21. Weird Dream: `onInit` has already rolled the team, so the swap is named, and refusing costs levels.
{
  const party = teamAt(90);
  const to = (id, name, types, bst) => species(id, name, types, bst, { getBaseStatTotal: () => bst });
  const m = show("weird dream", { type: 23, tier: 3, wave: 90, labels: ["Accept", "Battle", "Refuse"],
    options: [option(), option(), option()], party,
    misc: { teamTransformations: [
      { previousPokemon: party[0], newSpecies: to(149, "Dragonite", ["Dragon", "Flying"], 700) },
      { previousPokemon: party[1], newSpecies: to(131, "Gyarados", ["Water", "Flying"], 640) },
      { previousPokemon: party[2], newSpecies: to(145, "Zapdos", ["Electric", "Flying"], 580) }] },
    configs: [{ trainerConfig: { name: "Your alternate self", partyTemplates: [{ size: 3 }] } }] }).model();
  assert.deepEqual(verdicts(m), ["take", "ok", "avoid"]);
  assert.match(m.options[0].outcome, /Garchomp → Dragonite \(\+100\), Lapras → Gyarados \(\+105\), Jolteon → Zapdos \(\+55\)/);
  assert.match(m.options[0].why, /\+260 base stats across the party/);
  assert.match(m.options[2].outcome, /^every member loses 10% of its level \(your L90 drops 9\)/);
}

// ---- 22. The Winstrate Challenge: five battles with no healing between, or a heal and a Rarer Candy.
{
  const mons = n => ({ trainerType: 1, pokemonConfigs: Array.from({ length: n }, (_, i) => ({ species: species(300 + i, `W${i}`, ["Normal"], 400) })) });
  // Pushed back to front: Vito's five are config 0, Victor's two are popped first.
  const configs = [mons(5), mons(1), mons(3), mons(2), mons(2)];
  const m = show("winstrate, three left standing", { type: 24, tier: 3, wave: 120, labels: ["Accept", "Refuse"],
    options: [option(), option()], configs, party: teamAt(120) }).model();
  assert.deepEqual(verdicts(m), ["avoid", "take"]);
  assert.match(m.options[0].outcome, /5 trainer battles back to back, 13 mons in all, no healing between/);
  assert.match(m.options[0].why, /13 mons at ~L122 vs your L120, 3 of yours fit to fight/);
  // A full, healthy party can get through thirteen.
  const six = [...teamAt(120), pk("Tyranitar", ["Rock", "Dark"], 120, { bst: 600 }), pk("Metagross", ["Steel", "Psychic"], 120, { bst: 600 }), pk("Dragonite", ["Dragon", "Flying"], 120, { bst: 600 })];
  const deep = mount({ type: 24, tier: 3, wave: 120, labels: ["Accept", "Refuse"], options: [option(), option()], configs, party: six }).model();
  assert.deepEqual(verdicts(deep), ["take", "ok"]);
}

console.log("ok");
