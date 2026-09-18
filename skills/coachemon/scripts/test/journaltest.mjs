// Mystery Encounter journal against a mock scene shaped like the pinned source: the encounter opens (the game pushes
// its own `SeenEncounterData`), the coach's card arrives, the player picks (the game writes `selectedOption` into
// that record), a fight the encounter started plays out, and the wave moves on. Covers: one entry per encounter, the
// card captured as shown, the pick read off the game's record rather than guessed, a step appended only when the run
// actually moved, the `MAX_STEPS` cap, the store surviving a reload, a panel injected mid-encounter carrying on
// with the entry already there, the entry cap, a store that refuses to write,
// and that a throw inside the journal never reaches the caller. Prints the journal and the tally, so run.mjs keeps a
// golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

// ---- A localStorage that behaves: a real store, optionally full or refusing.
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

// ---- The mock scene. Only what the journal reads: properties, the two party accessors, and the game's own
// `encounteredEvents`, which is where the pick lands.
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

// The game as it opens an encounter: `MysteryEncounterPhase.start` pushes the record, `handleOptionSelect` writes the
// index into it.
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

// `at` is a wall clock, so the golden reads it as a fixed stamp; every other field is the journal's own.
const clean = entries => entries.map(e => ({ ...e, at: e.at && /^\d{4}-/.test(e.at) ? "<timestamp>" : e.at }));

let store = makeStore();
globalThis.window = globalThis;
delete globalThis.__coachHud;
// No scene behind the pool, so the panel's own first tick finds nothing to coach and journals nothing.
globalThis.Phaser = { Math: { RND: {} }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => null } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node,
  getElementById: () => ({ dataset: { uiMode: "MYSTERY_ENCOUNTER" } }) };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
Object.defineProperty(globalThis, "localStorage", { get: () => store, configurable: true });

// Each instance is its own panel session: whether the store can be written to is decided once per session, so the
// refusing-store case needs a fresh one rather than a swapped store.
const src = bundle("hud", { expose: true });
const instance = () => { new Function(src)(); return globalThis.__hud["55-journal"]; };
const { journalCheck, journalEntries, journalStats, journalClear } = instance();

const out = [];
const show = (title, value) => out.push(`---- ${title}\n${JSON.stringify(value, null, 1)}`);

// ---- One encounter, played through
{
  journalClear();
  const s = scene();
  // Wave before the encounter: nothing to journal.
  s.currentBattle = { waveIndex: 10, turn: 1, battleType: 0, double: false };
  journalCheck(s, { kind: "battle", wave: 10 });
  assert.equal(journalEntries().length, 0, "a wave with no encounter leaves no entry");

  openEncounter(s, 11, 1, 0);
  journalCheck(s, null); // the option screen is up, the card has not been read yet
  assert.equal(journalEntries().length, 1, "the entry opens with the encounter");
  assert.equal(journalEntries()[0].card, null);

  journalCheck(s, card(11, "Mysterious Chest")); // the card arrives
  journalCheck(s, card(11, "Mysterious Chest")); // an unchanged tick writes no step
  assert.equal(journalEntries()[0].steps.length, 1, "an unchanged run appends nothing");
  assert.equal(journalEntries()[0].picked, null, "no pick while the game's record says −1");

  pick(s, 0);
  s.party[0].hp = 12; // the chest was trapped
  journalCheck(s, card(11, "Mysterious Chest"));
  assert.equal(journalEntries()[0].picked, 0);
  assert.equal(journalEntries()[0].pickedLabel, "Open it");

  // The fight the encounter started, on the same wave: `mysteryEncounter` stays, so the trace runs on.
  s.enemy = [mon(9, 143, "Snorlax", 22, 140, 140)];
  s.currentBattle.turn = 1;
  journalCheck(s, { kind: "battle", wave: 11 });
  s.party[0].hp = 0;
  s.currentBattle.turn = 2;
  journalCheck(s, { kind: "battle", wave: 11 });

  // The wave moves on: the encounter closes.
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

  // A reload: a fresh panel session over the same store, mid-encounter.
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

// ---- The step cap. A long fight leaves the first MAX_STEPS steps and says it was cut.
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
