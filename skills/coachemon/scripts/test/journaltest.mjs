import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const makeStore = ({ refuse = false, quota = Infinity } = {}) => {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    removeItem: k => map.delete(k),
    setItem(k, v) {
      if (refuse) throw new Error("the store refuses everything");
      if (String(v).length > quota) throw new Error("QuotaExceededError");
      map.set(k, String(v));
    },
  };
};

const mon = (id, speciesId, name, level, hp, max, status = 0) => ({
  id, species: { speciesId }, name, level, hp, getMaxHp: () => max, status: status ? { effect: status } : null,
});

const scene = () => ({
  seed: "SEED123",
  game: { config: { gameVersion: "1.12.0.11" } },
  money: 2000,
  arena: { biomeId: 4 },
  modifiers: [{ type: { name: "Lure" }, stackCount: 1 }],
  currentBattle: null,
  mysteryEncounterSaveData: { encounteredEvents: [] },
  party: [mon(1, 25, "Pikachu", 20, 60, 60), mon(2, 4, "Charmander", 18, 50, 50)],
  enemy: [],
  getPlayerParty() { return this.party; },
  getEnemyParty() { return this.enemy; },
});

// The record the game pushes as the encounter opens, and the index it writes into it on a pick (game-code.md §13).
const openEncounter = (s, wave, type, tier) => {
  s.currentBattle = { waveIndex: wave, turn: 0, battleType: 3, double: false, mysteryEncounter: { encounterType: type, encounterTier: tier } };
  s.mysteryEncounterSaveData.encounteredEvents.push({ type, tier, waveIndex: wave, selectedOption: -1 });
};
const pick = (s, index) => { s.mysteryEncounterSaveData.encounteredEvents.at(-1).selectedOption = index; };

const card = (wave, name) => ({
  kind: "encounter", wave, key: `me:${wave}`, verdict: "take", type: 1, name, tier: "common", known: true,
  options: [{ label: "Open it", index: 0, verdict: "take", outcome: "pick of 3 Ultra items" },
    { label: "Leave", index: 1, verdict: "avoid", outcome: "nothing" }],
  pick: 0, notes: [],
});

const clean = entries => entries.map(e => ({ ...e, at: e.at && /^\d{4}-/.test(e.at) ? "<timestamp>" : e.at }));

let store = makeStore();
globalThis.window = globalThis;
delete globalThis.__coachHud;
// No scene behind the pool, so the panel's own tick journals nothing of its own.
globalThis.Phaser = { Math: { RND: {} }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => null } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node,
  getElementById: () => ({ dataset: { uiMode: "MYSTERY_ENCOUNTER" } }), addEventListener() {}, removeEventListener() {} };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
Object.defineProperty(globalThis, "localStorage", { get: () => store, configurable: true });

// The store is probed once per panel session, so a refusing store needs a fresh `instance()`, not a swapped `store`.
const src = bundle("hud", { expose: true });
const instance = () => { new Function(src)(); return globalThis.__hud["55-journal"]; };
const { journalCheck, journalCheckpoint, journalEntries, journalStats, journalClear } = instance();

const out = [];
const show = (title, value) => out.push(`---- ${title}\n${JSON.stringify(value, null, 1)}`);

// ---- One encounter, played through
{
  journalClear();
  const s = scene();
  s.currentBattle = { waveIndex: 10, turn: 1, battleType: 0, double: false };
  journalCheck(s, { kind: "battle", wave: 10 });
  assert.equal(journalEntries().length, 0, "a wave with no encounter leaves no entry");

  openEncounter(s, 11, 1, 0);
  journalCheck(s, null);
  assert.equal(journalEntries().length, 1, "the entry opens with the encounter");
  assert.equal(journalEntries()[0].card, null);

  journalCheck(s, card(11, "Mysterious Chest"));
  journalCheck(s, card(11, "Mysterious Chest"));
  assert.equal(journalEntries()[0].steps.length, 1, "an unchanged run appends nothing");
  assert.equal(journalEntries()[0].picked, null, "no pick while the game's record says −1");

  pick(s, 0);
  s.party[0].hp = 12;
  journalCheck(s, card(11, "Mysterious Chest"));
  assert.equal(journalEntries()[0].picked, 0);
  assert.equal(journalEntries()[0].pickedLabel, "Open it");

  s.enemy = [mon(9, 143, "Snorlax", 22, 140, 140)];
  s.currentBattle.turn = 1;
  journalCheck(s, { kind: "battle", wave: 11 });
  s.party[0].hp = 0;
  s.currentBattle.turn = 2;
  journalCheck(s, { kind: "battle", wave: 11 });

  s.enemy = [];
  s.currentBattle = { waveIndex: 12, turn: 0, battleType: 0, double: false };
  journalCheck(s, { kind: "battle", wave: 12 });
  assert.equal(journalEntries().length, 1, "closing adds no second entry");
  show("one encounter, played through", clean(journalEntries()));
  show("tally", journalStats());
}

// ---- It survives a reload: the store is what is read back, not the module's memory.
{
  const stored = JSON.parse(store.getItem("coach-me-journal"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].picked, 0, "the pick is in the store, not only in memory");
  assert.equal(stored[0].steps.length, 4, "every step up to the last save is stored");
  out.push(`---- stored after the encounter\nentries ${stored.length}, steps ${stored[0].steps.length}, picked ${stored[0].picked}`);
}

// ---- A second encounter of the same type on a later wave is its own entry.
{
  const s = scene();
  openEncounter(s, 25, 1, 0);
  journalCheck(s, card(25, "Mysterious Chest"));
  pick(s, 1);
  journalCheck(s, card(25, "Mysterious Chest"));
  assert.equal(journalEntries().length, 2);
  assert.equal(journalEntries()[1].pickedLabel, "Leave");
  show("tally after a second chest", journalStats());
}

// ---- A panel injected part-way through an encounter carries on with the entry already in the store.
{
  journalClear();
  const s = scene();
  openEncounter(s, 40, 2, 0);
  journalCheck(s, null);
  pick(s, 1);
  journalCheck(s, null);
  assert.equal(journalEntries().length, 1);

  const reloaded = instance();
  s.money = 1500;
  reloaded.journalCheck(s, card(40, "Dark Deal"));
  const j = reloaded.journalEntries();
  assert.equal(j.length, 1, "the reload does not open a second row for one encounter");
  assert.equal(j[0].picked, 1, "the pick made before the reload is still there");
  assert.equal(j[0].name, "Dark Deal", "the card read after the reload lands on the same entry");
  assert.equal(j[0].steps.length, 2, "the steps from before the reload are kept");
  out.push(`---- reload mid-encounter\nentries ${j.length}, picked ${j[0].picked}, steps ${j[0].steps.length}`);
}

// ---- A long fight keeps the first MAX_STEPS steps and says it was cut.
{
  journalClear();
  const s = scene();
  openEncounter(s, 30, 17, 2);
  for (let i = 0; i < 80; i++) { s.currentBattle.turn = i; journalCheck(s, null); }
  const e = journalEntries()[0];
  assert.equal(e.steps.length, 60, "steps stop at MAX_STEPS");
  assert.equal(e.truncated, true);
  out.push(`---- step cap\nsteps ${e.steps.length}, truncated ${e.truncated}`);
}

// ---- The entry cap: the oldest encounters fall off the end.
{
  journalClear();
  const s = scene();
  for (let w = 1; w <= 45; w++) {
    openEncounter(s, w, w % 3, 0);
    journalCheck(s, null);
  }
  const j = journalEntries();
  assert.equal(j.length, 40, "entries stop at MAX_ENTRIES");
  assert.equal(j[0].wave, 6, "the oldest are the ones dropped");
  out.push(`---- entry cap\nentries ${j.length}, first wave ${j[0].wave}, last wave ${j.at(-1).wave}`);
}

// A step of an oracle line as `oracleLineCheck` scores it, and the card the player saw it on.
const checkpoint = (hp, foeHp) => ({
  ours: [{ slot: 0, species: 25, onField: true, hp, maxHp: 60, status: 0, statStages: [0, 0, 0, 0, 0, 0, 0], tera: false }],
  foes: [{ slot: 0, species: 143, onField: true, hp: foeHp, maxHp: 140, status: 0, statStages: [0, 0, 0, 0, 0, 0, 0], tera: false }],
});
const scored = (turn, misses = [], wrong = false) => ({
  turn, of: 19, input: { kind: "move", move: 85, tera: false }, checkpoint: checkpoint(60 - turn, 140 - 10 * turn),
  misses: misses.map(m => ({ icon: { atlas: "pokemon_icons_1", frame: "143" }, ...m })), wrong,
});
const shownCard = turn => ({ kind: "battle", key: "180", wave: 180, verdict: "trainer", oracleLine: { state: "on", turn, of: 19 },
  groups: [{ id: "act", label: "Now", summary: `⚔ ~ T${turn}/19 · Pikachu Thunderbolt`, rows: [`▸ T${turn} Pikachu Thunderbolt`] }] });
const trainerFight = () => {
  const s = scene();
  s.currentBattle = { waveIndex: 180, turn: 8, battleType: 1, double: false };
  return s;
};

// ---- Each checkpoint scored is an entry: the card as shown, the claim, and what came of it
{
  journalClear();
  const s = trainerFight();
  journalCheckpoint(s, scored(6), shownCard(6));
  journalCheckpoint(s, scored(7, [{ name: "Snorlax", expected: "70/140", came: "82/140" }], true), shownCard(7));
  journalCheckpoint(s, null, shownCard(8));
  const j = journalEntries();
  assert.equal(j.length, 2, "a decision that scored nothing adds no entry");
  assert.deepEqual(j.map(e => [e.kind, e.turn, e.matched, e.wrong]), [["checkpoint", 6, true, false], ["checkpoint", 7, false, true]]);
  assert.deepEqual(j[1].misses, [{ name: "Snorlax", expected: "70/140", came: "82/140" }], "a miss keeps its words, not its sprite");
  assert.equal(j[1].card.groups[0].summary, "⚔ ~ T7/19 · Pikachu Thunderbolt", "the card is the one the player saw");
  assert.equal(j[0].seed, "SEED123");
  assert.equal(j[0].game, "1.12.0.11");
  assert.equal(j[0].wave, 180);
  show("two checkpoints, a match then a miss", clean(j));
  show("tally with checkpoints", journalStats());

  const stored = JSON.parse(store.getItem("coach-me-journal"));
  assert.equal(stored.length, 2, "each checkpoint is written to the store as it is scored");
  // An encounter after the fight opens its own entry, and the checkpoints before it are not taken for one.
  openEncounter(s, 181, 1, 0);
  journalCheck(s, card(181, "Mysterious Chest"));
  assert.deepEqual(journalEntries().map(e => e.kind ?? "encounter"), ["checkpoint", "checkpoint", "encounter"]);
  assert.equal(journalStats().encounters["Mysterious Chest"].met, 1);
}

// ---- Checkpoints share the encounters' bound: the oldest entries fall off whichever kind they are
{
  journalClear();
  const s = scene();
  for (let w = 1; w <= 5; w++) {
    openEncounter(s, w, w % 3, 0);
    journalCheck(s, null);
  }
  const fight = trainerFight();
  for (let t = 1; t <= 38; t++) journalCheckpoint(fight, scored(t), shownCard(t));
  const j = journalEntries();
  assert.equal(j.length, 40, "entries stop at MAX_ENTRIES with checkpoints in them");
  assert.deepEqual(j.slice(0, 2).map(e => e.wave), [4, 5], "the oldest encounters are the ones dropped");
  assert.equal(j.filter(e => e.kind === "checkpoint").length, 38);
  assert.equal(JSON.parse(store.getItem("coach-me-journal")).length, 40, "the store holds no more than the bound");
  out.push(`---- shared bound\nentries ${j.length}, encounters ${j.length - 38}, checkpoints 38, first wave ${j[0].wave}`);

  for (let t = 39; t <= 45; t++) journalCheckpoint(fight, scored(t), shownCard(t));
  assert.equal(journalEntries().length, 40);
  assert.equal(journalEntries().filter(e => e.kind !== "checkpoint").length, 0, "a long enough fight pushes every encounter out");
  assert.equal(journalEntries()[0].turn, 6);
}

// ---- A store that refuses every write: the journal keeps recording in memory and says so.
{
  store = makeStore({ refuse: true });
  const fresh = instance();
  const s = scene();
  openEncounter(s, 7, 5, 1);
  fresh.journalCheck(s, card(7, "Training Session"));
  assert.equal(fresh.journalEntries().length, 1, "a refusing store does not stop the journal");
  assert.equal(fresh.journalStats().stored, false);
  assert.equal(store.map.size, 0, "nothing was written");
  out.push(`---- refusing store\nentries ${fresh.journalEntries().length}, stored ${fresh.journalStats().stored}`);
}

// ---- A throw inside the journal never reaches the tick.
{
  store = makeStore();
  const fresh = instance();
  const broken = { get currentBattle() { throw new Error("scene is gone"); } };
  assert.doesNotThrow(() => fresh.journalCheck(broken, null));
  out.push("---- a broken scene\njournalCheck did not throw");
}

console.log(out.join("\n"));
