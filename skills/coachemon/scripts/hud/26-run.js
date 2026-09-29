// The run read (CONTEXT.md, `Run read`): `readRun(s, fn)` hands `fn` the run inside one sandbox, and what `run.memo`
// answers outlives the callback.
import { closeRead, openRead, sandbox } from "./01-core.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// A replay may read only what the run key or its memo's `k` holds: any other fact is served stale from the memo. HP
// keys as standing or not, or every hit taken would miss the memo.
const runFacts = s => {
  const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
  const me = s?.mysteryEncounterSaveData;
  return {
    seed: s?.seed ?? null,
    wave: s?.currentBattle?.waveIndex ?? 0,
    biomeId: s?.arena?.biomeId ?? null,
    waveCycleOffset: s?.waveCycleOffset ?? null,
    offsetGym: s?.offsetGym ?? null,
    party,
    members: party.map(p => [p.species?.speciesId ?? null, p.level ?? null, p.luck ?? null, (p.hp ?? 0) > 0]),
    modifierCount: (s?.modifiers ?? []).length,
    encounteredEvents: (me?.encounteredEvents ?? []).length,
    encounterSpawnChance: me?.encounterSpawnChance ?? null,
  };
};
const runKeyOf = f => JSON.stringify([f.seed, f.wave, f.biomeId, f.waveCycleOffset, f.offsetGym, f.members,
  f.modifierCount, f.encounteredEvents, f.encounterSpawnChance]);

const RUNS_KEPT = 2; // at 1, a faint then a revive replays everything
const runs = new Map(); // run key → Map(bucket → Map(k → answer))
const bucketsFor = key => {
  let b = runs.get(key);
  if (!b) {
    b = new Map();
    runs.set(key, b);
    while (runs.size > RUNS_KEPT) runs.delete(runs.keys().next().value);
  }
  return b;
};

export const readRun = (s, fn) => {
  openRead("run"); // throws inside a turn read or another run read
  try {
    const facts = runFacts(s);
    const key = runKeyOf(facts);
    const buckets = bucketsFor(key);
    let closed = false;
    const guard = () => { if (closed) throw new Error("run read after its callback returned"); };
    const run = {
      key, scene: s, facts,
      // Kept across refreshes for the last `RUNS_KEPT` run keys. `k` is what varies within one; a `build` that throws
      // is kept too, as `{ unavailable }`.
      memo: (bucket, k, build) => {
        guard();
        let m = buckets.get(bucket);
        if (!m) buckets.set(bucket, (m = new Map()));
        if (!m.has(k)) {
          let v;
          try { v = build(); } catch (e) { v = { unavailable: `${bucket}: ${e?.message ?? e}` }; }
          m.set(k, v);
        }
        return m.get(k);
      },
    };
    const finish = () => { try { return fn(run); } finally { closed = true; } };
    return s ? sandbox(s, finish) : finish();
  } finally { closeRead(); }
};
