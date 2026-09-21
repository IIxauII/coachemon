// The run read: the one door between the coach and the run around the battle.
//
// `readRun(s, fn)` opens the single sandbox, hands `fn` a **run** — what the seed, the wave, the biome, the party and
// what it holds already decide — and closes when `fn` returns. The between-waves cards ask it: the next-wave
// preview (48), the look-ahead (49), the team audit (50), the reroll (50), the biome pick (47), the shop (52), the
// Mystery Encounter (46). It is the twin of the turn read (25-turn): that one looks at the fight in front of the
// player, this one at the run around it, and the two never look at once (01-core's read latch).
//
// What it owns, each of which used to be a reader's problem:
// - **One key.** Everything a replay or a roster judgement reads off the run: the seed, the wave, the biome, the
//   run's two offsets, each member's species / level / luck / standing, the modifier count and the Mystery Encounter
//   history. Seven readers kept six keys, and 49-ahead's dropped two fields 48-preview's carried, so the look-ahead
//   could hold a preview the preview itself had thrown away.
// - **One memo, across refreshes.** A replay costs, and the panel refreshes every second, so what a run read
//   answers outlives the callback: `run.memo(bucket, k, fn)` is kept under the run key until the run key moves, and
//   the last two run keys are held so a flicker (a faint, then a revive) doesn't replay. `k` is what varies *within*
//   a run key — a wave for the preview, money and the option texts for an encounter, the reroll count for a reroll.
// - **One sandbox.** It opens around `fn` whether or not anything replays, so a reader can't forget it. A memo hit
//   pays one snapshot and restore per refresh, which is cheap.
// - **One way to be unavailable.** A memo whose `fn` throws answers `{ unavailable }` naming the bucket and the
//   error, and that answer is kept like any other. Nothing here swallows: the card that wanted the field shows why.
//
// The replays themselves stay where they belong — 48-preview knows how a wave is rolled, 50-reroll how a shop is —
// and take the run rather than the scene. `run.scene` is the raw handle for the game calls they make inside the
// sandbox; the turn read hides its scene because nothing below it needs one, and the replays do.
import { closeRead, openRead, sandbox } from "./01-core.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// The facts every reader keys on, read once. A member's HP is read as standing or not: the look-ahead judges the
// roster by who is up, and keying on the number would miss on every hit taken.
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

// ---- The memo, across refreshes
const RUNS_KEPT = 2;
const runs = new Map(); // run key → Map(bucket → Map(k → answer)), insertion order = age
const bucketsFor = key => {
  let b = runs.get(key);
  if (!b) {
    b = new Map();
    runs.set(key, b);
    while (runs.size > RUNS_KEPT) runs.delete(runs.keys().next().value);
  }
  return b;
};

// ---- The run
export const readRun = (s, fn) => {
  openRead("run"); // refuses while a turn or a run read is open: sequential, never nested
  try {
    const facts = runFacts(s);
    const key = runKeyOf(facts);
    const buckets = bucketsFor(key);
    let closed = false;
    const guard = () => { if (closed) throw new Error("run read after its callback returned"); };
    const run = {
      key, scene: s, facts,
      // What this run answers for `k` in `bucket`, computed once per run key. A `fn` that throws answers
      // `{ unavailable }` — kept, so a broken replay is not retried every second — and the reader shapes it.
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
