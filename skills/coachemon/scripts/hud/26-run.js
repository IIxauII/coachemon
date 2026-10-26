// The run read (CONTEXT.md, `Run read`): `readRun(s, fn, { cleared })` hands `fn` the run inside one sandbox, and what
// `run.memo` answers outlives the callback.
import { closeRead, openRead, sandbox } from "./01-core.js";
import { fightsAhead } from "./03-calendar.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// A replay may read only what the run key or its memo's `k` holds: any other fact is served stale from the memo. HP
// keys as standing or not, or every hit taken would miss the memo. The members key in no order, or every switch would
// miss every memo (game-code.md §9, #563): a memo whose answer turns on slot order keeps that order in its own `k`.
const memberKey = p => JSON.stringify([p.species?.speciesId ?? null, p.level ?? null, p.luck ?? null, (p.hp ?? 0) > 0]);
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
    members: party.map(memberKey).sort(),
    modifierCount: (s?.modifiers ?? []).length,
    encounteredEvents: (me?.encounteredEvents ?? []).length,
    encounterSpawnChance: me?.encounterSpawnChance ?? null,
  };
};
const runKeyOf = f => JSON.stringify([f.seed, f.wave, f.biomeId, f.waveCycleOffset, f.offsetGym, f.members,
  f.modifierCount, f.encounteredEvents, f.encounterSpawnChance]);

const nextFightOf = (s, wave, cleared) => {
  const from = Math.max(1, Math.floor(wave) || 1);
  if (typeof cleared !== "boolean") {
    return Object.freeze({ from, fight: null, kind: null, cleared: null,
      unavailable: `this run read never said whether wave ${from} is cleared: open it with readRun(s, fn, { cleared })` });
  }
  const next = fightsAhead(s, from, { cleared })[0] ?? null;
  return Object.freeze({ from, fight: next?.wave ?? null, kind: next?.kind ?? null, cleared, unavailable: null });
};

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

// A replay keyed on what it reads (#520) outlives the run key, so it is held here by its own `k` (#922).
const EXACT_KEPT = 16;
const exact = new Map(); // bucket → Map(k → answer), oldest first
const built = (bucket, build) => {
  try { return build(); } catch (e) { return { unavailable: `${bucket}: ${e?.message ?? e}` }; }
};

export const readRun = (s, fn, { cleared = null } = {}) => {
  openRead("run"); // throws inside a turn read or another run read
  try {
    const facts = runFacts(s);
    const key = runKeyOf(facts);
    const buckets = bucketsFor(key);
    let closed = false;
    const guard = () => { if (closed) throw new Error("run read after its callback returned"); };
    // Kept across refreshes for the last `RUNS_KEPT` run keys. `k` is what varies within one; a `build` that throws is
    // kept too, as `{ unavailable }`.
    const memo = (bucket, k, build) => {
      guard();
      let m = buckets.get(bucket);
      if (!m) buckets.set(bucket, (m = new Map()));
      if (!m.has(k)) m.set(k, built(bucket, build));
      return m.get(k);
    };
    // `memo`'s twin held across run keys: `k` must hold every input `build` reads, the run key's included.
    const memoExact = (bucket, k, build) => {
      guard();
      let m = exact.get(bucket);
      if (!m) exact.set(bucket, (m = new Map()));
      const v = m.has(k) ? m.get(k) : built(bucket, build);
      m.delete(k);
      m.set(k, v);
      while (m.size > EXACT_KEPT) m.delete(m.keys().next().value);
      return v;
    };
    // What `memo` holds for `k`, or undefined: nothing is built.
    const held = (bucket, k) => { guard(); return buckets.get(bucket)?.get(k); };
    const run = {
      key, scene: s, facts, memo, memoExact, held,
      /**
       * The next big fight (CONTEXT.md, `Next big fight`), frozen, as `{ from, fight, kind, cleared, unavailable }`:
       * `from` is the wave on screen and `fight` the first big fight from it, which counts that wave until `cleared`
       * says it is won. The caller states the standing (60-card.js, `KINDS`) and the read never infers it: one opened
       * without it answers `fight: null` and says why in `unavailable`.
       *
       * The standing is not in the run key, so a memo whose answer turns on the fight keys on `nextFight.fight`.
       *
       * A Splicer after a fixed fight judged the pair against the fight just won (#877), as the biome card had judged
       * the boss just finished (#587).
       */
      get nextFight() { return memo("next-fight", String(cleared), () => nextFightOf(s, facts.wave, cleared)); },
    };
    const finish = () => { try { return fn(run); } finally { closed = true; } };
    return s ? sandbox(s, finish) : finish();
  } finally { closeRead(); }
};
