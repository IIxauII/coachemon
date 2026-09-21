// The run read on its own: its key moves exactly when an input a reader keys on moves, its memo outlives the
// callback and answers the same thing for the same run, a build that throws is an `unavailable` with a reason, a run
// used after its callback is dead, and a run read never nests with a turn read.
import assert from "node:assert";
import { bundle } from "../hud-bundle.mjs";

globalThis.window = globalThis;
let rnd = "!rnd,0";
globalThis.Phaser = { Math: { RND: { state: v => { if (v !== undefined) rnd = v; return rnd; } } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
const node = () => ({ style: {}, addEventListener() {}, append() {}, replaceChildren() {}, remove() {} });
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
eval(bundle("hud", { expose: true }));
const { readRun } = globalThis.__hud["26-run"];
const { readTurn } = globalThis.__hud["25-turn"];

const mon = (id, over = {}) => ({ id, species: { speciesId: id }, level: 10, luck: 0, hp: 30, ...over });
// A scene with every field the run key reads, and a phase queue so the sandbox has something to mute.
const scene = (over = {}) => ({
  seed: "seed-1", currentBattle: { waveIndex: 12 }, arena: { biomeId: 3 }, waveCycleOffset: 0, offsetGym: 0,
  modifiers: [], mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 3 },
  getPlayerParty: () => [mon(1), mon(2)], getEnemyParty: () => [],
  phaseManager: { pushPhase() {}, queueMessage() {} },
  ...over,
});
const keyOf = s => readRun(s, run => run.key);

// ---- 1. The key: one per run state, and every keyed input moves it.
{
  const base = keyOf(scene());
  assert.equal(keyOf(scene()), base, "the same run state is the same key");
  console.log(`== key ${base}`);
  const moved = {
    seed: scene({ seed: "seed-2" }),
    wave: scene({ currentBattle: { waveIndex: 13 } }),
    biome: scene({ arena: { biomeId: 4 } }),
    waveCycleOffset: scene({ waveCycleOffset: 1 }),
    offsetGym: scene({ offsetGym: 1 }),
    species: scene({ getPlayerParty: () => [mon(1), mon(3)] }),
    level: scene({ getPlayerParty: () => [mon(1), mon(2, { level: 11 })] }),
    luck: scene({ getPlayerParty: () => [mon(1), mon(2, { luck: 1 })] }),
    standing: scene({ getPlayerParty: () => [mon(1), mon(2, { hp: 0 })] }),
    modifiers: scene({ modifiers: [{}] }),
    encountered: scene({ mysteryEncounterSaveData: { encounteredEvents: [{}], encounterSpawnChance: 3 } }),
    spawnChance: scene({ mysteryEncounterSaveData: { encounteredEvents: [], encounterSpawnChance: 4 } }),
  };
  for (const [what, s] of Object.entries(moved)) assert.notEqual(keyOf(s), base, `${what} moves the key`);
  // What a reader keys on *inside* a run key does not move it: a hit taken, money spent.
  assert.equal(keyOf(scene({ getPlayerParty: () => [mon(1), mon(2, { hp: 1 })] })), base, "HP short of a faint does not move the key");
  assert.equal(keyOf(scene({ money: 999 })), base, "money does not move the key");
  console.log(`moved by ${Object.keys(moved).join(", ")}`);
}

// ---- 2. The memo: built once per run key, shared across refreshes and across readers, dropped when the key moves.
{
  let builds = 0;
  const ask = (s, k = 13) => readRun(s, run => run.memo("preview", k, () => ({ built: ++builds, wave: k })));
  const first = ask(scene());
  assert.equal(ask(scene()), first, "a second refresh of the same run is the memo, not a rebuild");
  assert.equal(builds, 1);
  ask(scene(), 20);
  assert.equal(builds, 2, "another key in the same bucket builds once more");
  assert.equal(ask(scene()), first, "…and the first is still held");
  ask(scene({ currentBattle: { waveIndex: 13 } }));
  assert.equal(builds, 3, "a moved run key builds again");
  assert.equal(ask(scene()), first, "the previous run key is still held (a flicker doesn't replay)");
  assert.equal(builds, 3);
  ask(scene({ currentBattle: { waveIndex: 14 } }));
  assert.notEqual(ask(scene()), first, "two run keys later, the oldest is gone");
  console.log(`builds ${builds}`);
}

// ---- 3. Unavailable: a build that throws is an answer with a reason, kept like any other.
{
  let tries = 0;
  const ask = () => readRun(scene(), run => run.memo("reroll", 1, () => { tries++; throw new Error("no reward phase"); }));
  const v = ask();
  assert.deepEqual(v, { unavailable: "reroll: no reward phase" });
  assert.equal(ask(), v, "not retried on the next refresh");
  assert.equal(tries, 1);
  console.log(`unavailable ${v.unavailable}`);
}

// ---- 4. Facts, the scene handle, and the sandbox around the callback.
{
  const s = scene();
  const seen = readRun(s, run => ({ scene: run.scene === s, wave: run.facts.wave, party: run.facts.party.length, muted: typeof s.phaseManager.pushPhase }));
  assert.deepEqual(seen, { scene: true, wave: 12, party: 2, muted: "function" });
  rnd = "!rnd,0";
  readRun(s, () => { rnd = "!rnd,moved"; });
  assert.equal(rnd, "!rnd,0", "the stream is put back when the callback returns");
  assert.equal(readRun(null, run => run.facts.wave), 0, "no scene: facts default, no sandbox");
}

// ---- 5. Dead after the callback; never nested with a turn read, in either order.
{
  let run;
  readRun(scene(), r => { run = r; });
  assert.throws(() => run.memo("x", 1, () => 1), /after its callback returned/);
  assert.throws(() => readRun(scene(), () => readRun(scene(), () => 1)), /run read while a run read is open/);
  assert.throws(() => readRun(scene(), () => readTurn(scene(), () => 1)), /turn read while a run read is open/);
  assert.throws(() => readTurn(scene(), () => readRun(scene(), () => 1)), /run read while a turn read is open/);
  // A throw inside releases the latch: the next read opens.
  assert.throws(() => readRun(scene(), () => { throw new Error("boom"); }), /boom/);
  assert.equal(readRun(scene(), () => "open again"), "open again");
  console.log("dead after callback; nesting refused both ways");
}
