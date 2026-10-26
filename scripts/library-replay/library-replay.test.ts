import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Carry } from "../../src/solver/gate.ts";
import { noAnswer } from "../../src/solver/no-answer.ts";
import type { ReplayResult } from "../../src/solver/oracle-line.ts";
import type { Script } from "../../src/solver/solver.ts";
import { type Given, replayLibrary, replayOracleLine } from "./library-replay.ts";

const PIN = "1.12.2.0";
const OLDER = "1.12.1.3";

const GORDIE = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";

const save = (over: object = {}) => ({
  gameVersion: PIN,
  gameMode: 0,
  seed: "Zu5cgKRQ0vigLcOhpJxYMUa0",
  waveIndex: 180,
  battleType: 1,
  trainer: { trainerType: 261, variant: 0 },
  party: [],
  enemyParty: [],
  ...over,
});

/** A solve's input as the recorder keeps it: `turn` past 1 is a mid-fight re-solve's, with its extras. */
const kept = (turn = 1, over: object = {}) => {
  const s = save(over);
  return {
    live: { wave: s.waveIndex, battleSeed: "U0QKEz8wJ8ea7832" },
    save: s,
    ...(turn > 1 && { extras: { turn, rndState: `rng-${turn}` } }),
    liveExport: { ...s, party: [{ id: 1 }] },
    cloneVersion: s.gameVersion,
    budget: { expansions: 3000, turns: 40 },
  };
};

const oracleLine = (move: "SURF" | "THUNDER" = "SURF"): Script => ({
  inputs: [{ kind: "move", move, tera: false }],
  known: { outcome: "won", after: [{ turn: 1 }, { turn: 2 }] },
});

/** A library folder holding each fight folder's solves, by `turn-<n>`; a solve given no oracle line found none. */
function library(fights: Record<string, Record<number, { input?: unknown; oracleLine?: unknown }>>): string {
  const root = mkdtempSync(path.join(tmpdir(), "coachemon-library-"));
  for (const [fight, solves] of Object.entries(fights)) {
    mkdirSync(path.join(root, fight));
    for (const [turn, { input = kept(Number(turn)), oracleLine: script }] of Object.entries(solves)) {
      const stem = path.join(root, fight, `turn-${turn}`);
      writeFileSync(`${stem}.json`, typeof input === "string" ? input : JSON.stringify(input));
      if (script !== undefined) writeFileSync(`${stem}.win.script.json`, typeof script === "string" ? script : JSON.stringify(script));
    }
  }
  return root;
}

const won = (turns: number): ReplayResult => ({
  kind: "replayed",
  replay: {
    confidence: "replay",
    outcome: "won",
    steps: Array.from({ length: turns }, (_, i) => ({ turn: i + 1, input: null, checkpoint: { ours: [], foes: [] } })),
    receipt: [],
    luck: [],
  },
});

const fake = (answer: (given: Given, script: Script) => ReplayResult = (_, script) => won(script.known?.after.length ?? 0)) => {
  const calls: { given: Given; script: Script; carry: Carry }[] = [];
  return {
    calls,
    replay: async (given: Given, script: Script, carry: Carry) => {
      calls.push({ given, script, carry });
      return answer(given, script);
    },
  };
};

test("the replay plays each fight's first-turn and mid-fight oracle lines at the pin, and reports each that still wins (#939)", async () => {
  const folder = library({ [GORDIE]: { 1: { oracleLine: oracleLine() }, 5: { oracleLine: oracleLine("THUNDER") } } });
  const { calls, replay } = fake();

  const run = await replayLibrary(folder, PIN, replay);

  assert.deepEqual(
    calls.map(c => [c.given.extras?.turn ?? 1, c.script.inputs[0], c.given.cloneVersion, c.carry]),
    [
      [1, { kind: "move", move: "SURF", tera: false }, PIN, { carried: false }],
      [5, { kind: "move", move: "THUNDER", tera: false }, PIN, { carried: false }],
    ],
  );
  assert.ok(calls.every(c => c.given.live && c.given.liveExport), "a replay needs the live battle and its export");
  assert.deepEqual(
    run.oracleLines.map(l => [l.fight, l.turn, l.outcome.kind]),
    [
      [GORDIE, 1, "still_wins"],
      [GORDIE, 5, "still_wins"],
    ],
  );
  assert.match(run.text, new RegExp(`${GORDIE} turn 1: still wins, won in 2 turns`));
  assert.match(run.text, new RegExp(`${GORDIE} turn 5: still wins`));
});

test("an oracle line that plays differently is reported with its first missed checkpoint, and one played past its end by what live did (#939)", async () => {
  const folder = library({
    [GORDIE]: { 1: { oracleLine: oracleLine() }, 5: { oracleLine: oracleLine() } },
    "Zu5cgKRQ0vigLcOhpJxYMUa0-w190-kieran": { 1: { input: kept(1, { waveIndex: 190 }), oracleLine: oracleLine() } },
  });
  const { replay } = fake(given => {
    if (given.save.waveIndex === 190) return noAnswer({ code: "known_turn_missed", misses: ["the replay lost, where live won"] });
    return given.extras === undefined
      ? noAnswer({
          code: "known_turn_missed",
          misses: [
            "the replay lost, where live won",
            "turn 3: our Reshiram hp 120, live 118",
            "turn 3: the foe's Coalossal status BURN, live NONE",
            "turn 4: no Gigalith among the foe's",
          ],
        })
      : noAnswer({ code: "illegal_step", index: 1, turn: 6, why: "isn't on the menu", tried: { kind: "move", move: "SURF", tera: false }, legal: [] });
  });

  const run = await replayLibrary(folder, PIN, replay);

  assert.deepEqual(
    run.oracleLines.map(l => [l.turn, l.outcome]),
    [
      [1, { kind: "plays_differently", checkpoint: 3, missed: "our Reshiram hp 120, live 118; the foe's Coalossal status BURN, live NONE" }],
      [5, { kind: "plays_differently", checkpoint: null, missed: "input 2, Surf, isn't on the menu at turn 6" }],
      [1, { kind: "plays_differently", checkpoint: null, missed: "the replay lost, where live won" }],
    ],
  );
  assert.match(run.text, new RegExp(`${GORDIE} turn 1: plays differently from the checkpoint after turn 3: our Reshiram hp 120, live 118; the foe's`));
  assert.match(run.text, new RegExp(`${GORDIE} turn 5: plays differently: input 2, Surf, isn't on the menu at turn 6\n`));
});

test("an older save is carried to the pin, and an oracle line whose save doesn't load on it is skipped, not failed, with why (#939)", async () => {
  const folder = library({
    [GORDIE]: {
      1: { input: kept(1, { gameVersion: OLDER }), oracleLine: oracleLine() },
      5: { input: kept(5, { gameVersion: OLDER }), oracleLine: oracleLine() },
    },
    "Zu5cgKRQ0vigLcOhpJxYMUa0-w190-kieran": { 1: { input: kept(1, { waveIndex: 190, gameVersion: "1.13.0.0" }), oracleLine: oracleLine() } },
    "Zu5cgKRQ0vigLcOhpJxYMUa0-w200-eternatus": { 1: { input: "{ not json", oracleLine: oracleLine() } },
    "Zu5cgKRQ0vigLcOhpJxYMUa0-w173-swimmers": { 1: { oracleLine: '{ "inputs": "not a list" }' } },
  });
  const { calls, replay } = fake(given => {
    if (given.save.gameVersion === "1.13.0.0") return noAnswer({ code: "version_mismatch", save: "1.13.0.0", live: null, clone: PIN });
    return given.extras === undefined
      ? noAnswer({ code: "harness_failed", why: "TypeError: Cannot read properties of undefined (reading 'sprites')" })
      : noAnswer({ code: "scene_mismatch", differences: ["our Reshiram (slot 0) hp: loaded 120, live 118"] });
  });

  const run = await replayLibrary(folder, PIN, replay);

  assert.deepEqual(
    calls.map(c => [c.given.save.waveIndex, c.given.extras?.turn ?? 1, c.carry]),
    [
      [180, 1, { carried: true }],
      [180, 5, { carried: true }],
      [190, 1, { carried: false }],
    ],
    "a save from a newer game is never carried",
  );
  assert.deepEqual(
    run.oracleLines.map(l => [l.fight.replace(/^.*-w/, "w"), l.turn, l.outcome.kind]),
    [
      ["w173-swimmers", 1, "doesnt_load"],
      ["w180-gordie", 1, "doesnt_load"],
      ["w180-gordie", 5, "doesnt_load"],
      ["w190-kieran", 1, "doesnt_load"],
      ["w200-eternatus", 1, "doesnt_load"],
    ],
  );
  assert.match(run.text, new RegExp(`${GORDIE} turn 1: doesn't load on ${PIN}, skipped: the oracle's harness failed: TypeError`));
  assert.match(run.text, new RegExp(`${GORDIE} turn 5: doesn't load on ${PIN}, skipped: the scene the oracle loaded isn't the live one`));
  assert.match(run.text, /w190-kieran turn 1: doesn't load on 1\.12\.2\.0, skipped: this fight's save is from game version 1\.13\.0\.0/);
  assert.match(run.text, /w200-eternatus turn 1: doesn't load on 1\.12\.2\.0, skipped: turn-1\.json doesn't read: /);
  assert.match(run.text, /w173-swimmers turn 1: doesn't load on 1\.12\.2\.0, skipped: turn-1\.win\.script\.json doesn't read as a script: /);
  assert.match(run.text, /carrying the 1\.12\.1\.3 saves of 2 oracle lines to 1\.12\.2\.0/);
  assert.match(run.text, /still wins: 0, plays differently: 0, doesn't load: 5 \(skipped\)$/);
});

test("a save already on the pin that fails to replay plays differently, as a regression, where a carried one is skipped (#939)", async () => {
  const folder = library({
    [GORDIE]: { 1: { oracleLine: oracleLine() }, 5: { oracleLine: oracleLine() } },
    "Zu5cgKRQ0vigLcOhpJxYMUa0-w190-kieran": { 1: { input: kept(1, { waveIndex: 190, gameVersion: OLDER }), oracleLine: oracleLine() } },
    "Zu5cgKRQ0vigLcOhpJxYMUa0-w200-eternatus": { 1: { input: kept(1, { waveIndex: 200 }), oracleLine: oracleLine() } },
  });
  const { replay } = fake(given => {
    if (given.save.waveIndex === 200) return noAnswer({ code: "no_clone", version: PIN, cause: "no clone" });
    return given.extras === undefined
      ? noAnswer({ code: "harness_failed", why: "TypeError: Cannot read properties of undefined (reading 'sprites')" })
      : noAnswer({ code: "scene_mismatch", differences: ["our Reshiram (slot 0) hp: loaded 120, live 118"] });
  });

  const run = await replayLibrary(folder, PIN, replay);

  assert.deepEqual(
    run.oracleLines.map(l => [l.fight.replace(/^.*-w/, "w"), l.turn, l.outcome.kind]),
    [
      ["w180-gordie", 1, "plays_differently"],
      ["w180-gordie", 5, "plays_differently"],
      ["w190-kieran", 1, "doesnt_load"],
      ["w200-eternatus", 1, "doesnt_load"],
    ],
  );
  assert.match(run.text, new RegExp(`${GORDIE} turn 1: plays differently: the oracle's harness failed: TypeError`));
  assert.match(run.text, new RegExp(`${GORDIE} turn 5: plays differently: the scene the oracle loaded isn't the live one`));
  assert.match(run.text, /w190-kieran turn 1: doesn't load on 1\.12\.2\.0, skipped: the oracle's harness failed/);
});

test("the fight and wave filters narrow the oracle lines replayed, and a solve that found no oracle line is never replayed (#939)", async () => {
  const kieran = "Zu5cgKRQ0vigLcOhpJxYMUa0-w190-kieran";
  const otherGordie = "AbC-w188-gordie";
  const folder = library({
    [GORDIE]: { 1: { oracleLine: oracleLine() }, 3: {}, 5: { oracleLine: oracleLine() } },
    [otherGordie]: { 1: { input: kept(1, { waveIndex: 188, seed: "AbC" }), oracleLine: oracleLine() } },
    [kieran]: { 1: { input: kept(1, { waveIndex: 190 }), oracleLine: oracleLine() } },
  });
  const replayed = async (filter: Parameters<typeof replayLibrary>[4]) =>
    (await replayLibrary(folder, PIN, fake().replay, undefined, filter)).oracleLines.map(l => `${l.fight} ${l.turn}`);

  assert.deepEqual(await replayed(undefined), [`${otherGordie} 1`, `${GORDIE} 1`, `${GORDIE} 5`, `${kieran} 1`]);
  assert.deepEqual(await replayed({ fights: ["gordie"] }), [`${otherGordie} 1`, `${GORDIE} 1`, `${GORDIE} 5`]);
  assert.deepEqual(await replayed({ fights: [kieran] }), [`${kieran} 1`]);
  assert.deepEqual(await replayed({ waves: [190, 188] }), [`${otherGordie} 1`, `${kieran} 1`]);
  assert.deepEqual(await replayed({ fights: ["gordie"], waves: [180] }), [`${GORDIE} 1`, `${GORDIE} 5`]);
  assert.deepEqual(await replayed({ fights: ["gord"] }), [], "a fight is named whole, never by part of its name");
});

test("one oracle line replays on its own, from its fight folder's turn stem, as the import replays a new one (#939)", async () => {
  const folder = library({ [GORDIE]: { 5: { input: kept(5, { gameVersion: OLDER }), oracleLine: oracleLine() } } });
  const { calls, replay } = fake();

  const outcome = await replayOracleLine(path.join(folder, GORDIE, "turn-5"), PIN, replay);

  assert.deepEqual(outcome, { kind: "still_wins", turns: 2 });
  assert.deepEqual(
    calls.map(c => [c.given.extras?.turn, c.given.cloneVersion, c.carry]),
    [[5, PIN, { carried: true }]],
  );
});
