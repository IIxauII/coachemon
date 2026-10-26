import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  appendStatisticsEntry,
  fightsWaiting,
  mergeWaitingFights,
  recordSolveStart,
  type Recorder,
  solveStartAt,
  solveStartsIn,
  statisticsEntriesIn,
  type Why,
} from "./fight-library.ts";
import type { Script } from "./script.ts";
import type { SessionSave, SolveInput, SolveReport } from "./solver.ts";

const temp = (name: string) => mkdtempSync(path.join(tmpdir(), `coachemon-fight-library-${name}-`));

const AT = "2026-10-26T09:30:00.000Z";

const RECORDER: Recorder = { now: () => new Date(AT), pluginVersion: "1.83.0" };

const save = (over: Partial<SessionSave> = {}): SessionSave => ({
  gameVersion: "1.12.1.3",
  gameMode: 0,
  seed: "Zu5cgKRQ0vigLcOhpJxYMUa0",
  waveIndex: 180,
  battleType: 1,
  trainer: { trainerType: 261, variant: 0 },
  party: [],
  enemyParty: [],
  ...over,
});

/** A first-turn solve's input, or a mid-fight re-solve's augmented export when `turn` is past 1. */
const input = (turn = 1, over: Partial<SessionSave> = {}, rest: Partial<SolveInput> = {}): SolveInput => {
  const s = save(turn === 1 ? over : { party: [{ id: 1, hp: turn }], ...over });
  return {
    save: s,
    ...(turn > 1 && { extras: { turn, rndState: `rng-${turn}` } as unknown as NonNullable<SolveInput["extras"]> }),
    live: { wave: s.waveIndex, battleSeed: "U0QKEz8wJ8ea7832" },
    liveExport: { ...s, party: [{ id: 1 }] },
    cloneVersion: "1.12.1.3",
    budget: { expansions: 3000, turns: 40 },
    ...rest,
  };
};

const line = (move = "SURF"): Script => ({
  inputs: [{ kind: "move", move: move as "SURF", tera: false }],
  known: { outcome: "won", after: [{ turn: 1 }] },
});

const WON = { kind: "oracle_line" } as const;
const NO_WIN = { kind: "no_answer", code: "no_win" } as const;

test("a recorded fight is kept as <seed>-w<wave>-<fight>/ with turn-<n>.json, turn-<n>.win.script.json and statistics.jsonl", () => {
  const home = temp("names");

  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(5), RECORDER)?.finish({ ended: NO_WIN, report: null });

  assert.deepEqual(readdirSync(path.join(home, "fights")), ["Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie"]);
  const fight = path.join(home, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie");
  assert.deepEqual(readdirSync(fight).sort(), ["statistics.jsonl", "turn-1.json", "turn-1.win.script.json", "turn-5.json"]);
  const { live, save, liveExport, cloneVersion, budget } = input();
  assert.deepEqual(JSON.parse(readFileSync(path.join(fight, "turn-1.json"), "utf8")), { live, save, liveExport, cloneVersion, budget });
  assert.deepEqual(JSON.parse(readFileSync(path.join(fight, "turn-5.json"), "utf8")).extras, { turn: 5, rndState: "rng-5" });
  assert.deepEqual(JSON.parse(readFileSync(path.join(fight, "turn-1.win.script.json"), "utf8")), line());
  assert.equal(readFileSync(path.join(fight, "statistics.jsonl"), "utf8").split("\n").length, 3);
});

const GORDIE = { folder: "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie", name: "gordie", wave: 180 };

test("a recorded fight reads back with its name, wave and each solve start's turn, mid-fight turns in number order, turn 2 before turn 10 (#937)", () => {
  const home = temp("read-back");

  for (const turn of [10, 1, 2]) recordSolveStart({ home }, input(turn), RECORDER)?.finish({ ended: turn === 2 ? NO_WIN : WON, report: null, oracleLine: turn === 2 ? undefined : line() });

  const starts = solveStartsIn({ home });
  assert.deepEqual(
    starts.map(s => [s.fight, s.turn, s.oracleLine]),
    [
      [GORDIE, 1, line()],
      [GORDIE, 2, null],
      [GORDIE, 10, line()],
    ],
  );
  const { live, save, extras, liveExport, cloneVersion, budget } = input(10);
  assert.deepEqual(starts[2].input, { live, save, extras, liveExport, cloneVersion, budget });
  assert.equal("extras" in starts[0].input, false);
});

const budgetOf = (start: { input: unknown }) => (start.input as SolveInput).budget;

test("a repeat solve from the same turn replaces the pair: a new solve start removes that turn's oracle line, which comes back only with this solve's own (#969)", () => {
  const home = temp("pair");
  const from = (position: string) => input(3, { party: [{ id: 1, position }] });
  recordSolveStart({ home }, from("A"), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  const repeat = recordSolveStart({ home }, { ...from("B"), budget: { expansions: 40000, turns: 40 } }, RECORDER);
  const [between] = solveStartsIn({ home });
  repeat?.finish({ ended: NO_WIN, report: null });

  assert.equal(between.oracleLine, null, "the old oracle line goes as the new solve starts");
  const [start] = solveStartsIn({ home });
  assert.deepEqual([start.turn, (start.input as SolveInput).save.party, budgetOf(start), start.oracleLine], [3, [{ id: 1, position: "B" }], { expansions: 40000, turns: 40 }, null]);
});

test("a repeat solve that finds an oracle line writes it beside its own input (#969)", () => {
  const home = temp("pair-won");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  recordSolveStart({ home }, { ...input(), budget: { expansions: 40000, turns: 40 } }, RECORDER)?.finish({ ended: WON, report: null, oracleLine: line("THUNDER") });

  const [start] = solveStartsIn({ home });
  assert.deepEqual([budgetOf(start), start.oracleLine], [{ expansions: 40000, turns: 40 }, line("THUNDER")]);
});

test("a recording finishes once: a cancel finished first keeps a later oracle line and entry out", () => {
  const home = temp("once");
  const recording = recordSolveStart({ home }, input(), RECORDER);

  recording?.finish({ ended: { kind: "cancelled", progress: null }, report: null });
  recording?.finish({ ended: WON, report: null, oracleLine: line() });

  assert.deepEqual(
    solveStartsIn({ home }).map(s => s.oracleLine),
    [null],
  );
  assert.deepEqual(
    statisticsEntriesIn({ home }).entries.map(e => e.statistics.ended),
    [{ kind: "cancelled", progress: null }],
  );
});

test("an old oracle line that can't be removed leaves the old pair whole and the new solve start unwritten, and the solve's statistics entry is still appended", () => {
  const home = temp("unremovable");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: NO_WIN, report: null });
  const [{ files }] = solveStartsIn({ home });
  mkdirSync(files.oracleLine);

  recordSolveStart({ home }, { ...input(), budget: { expansions: 40000, turns: 40 } }, RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  const [start] = solveStartsIn({ home });
  assert.deepEqual(budgetOf(start), { expansions: 3000, turns: 40 });
  assert.match((start.oracleLine as Why).why, /^turn-1\.win\.script\.json doesn't read as a script: /);
  assert.deepEqual(readdirSync(files.oracleLine), []);
  assert.deepEqual(
    statisticsEntriesIn({ home }).entries.map(e => e.statistics.ended),
    [NO_WIN, WON],
  );
});

test("an oracle line that can't be written leaves the solve start, no part file, and no throw", () => {
  const home = temp("unwritable");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: NO_WIN, report: null });
  const [{ files }] = solveStartsIn({ home });
  mkdirSync(`${files.oracleLine}.part`);

  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  const [start] = solveStartsIn({ home });
  assert.deepEqual([start.input, start.oracleLine], [JSON.parse(JSON.stringify(input())), null]);
  assert.deepEqual(readdirSync(`${files.oracleLine}.part`), []);
});

test("an augmented export with no turn isn't recorded (#937)", () => {
  const home = temp("no-turn");

  const recording = recordSolveStart({ home }, { ...input(4), extras: { turn: null } as unknown as NonNullable<SolveInput["extras"]> }, RECORDER);

  assert.equal(recording, null);
  assert.deepEqual(readdirSync(home), []);
});

test("two solves of one fight share its folder, and another fight on the same wave gets its own (#936)", () => {
  const home = temp("share");

  for (const over of [{}, {}, { trainer: { trainerType: 57, variant: 2 } }] as Partial<SessionSave>[]) recordSolveStart({ home }, input(1, over), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  assert.deepEqual(
    solveStartsIn({ home }).map(s => [s.fight, s.turn]),
    [
      [GORDIE, 1],
      [{ folder: "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-swimmers", name: "swimmers", wave: 180 }, 1],
    ],
  );
});

test("more than 12 fights are all kept, each in a folder of its own (#936)", () => {
  const home = temp("thirteen");

  for (let wave = 1; wave <= 13; wave++) recordSolveStart({ home }, input(1, { waveIndex: wave }), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  const starts = solveStartsIn({ home });
  assert.deepEqual(
    starts.map(s => s.fight.wave).sort((a, b) => (a ?? 0) - (b ?? 0)),
    Array.from({ length: 13 }, (_, i) => i + 1),
  );
  assert.ok(starts.every(s => s.oracleLine !== null && !("why" in s.oracleLine)));
});

test("each finish appends its own statistics entry under the settings it ran with, a mid-fight solve's beside the first turn's, and none is overwritten (#937, #938)", () => {
  const home = temp("entries");
  const lds = { ours: 0.5, alternatives: 3, discrepancies: 1, expansions: 500 };

  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(1, {}, { budget: { expansions: 40000, turns: 60 }, lds, portfolio: [{ width: 4, ours: 1 }] }), RECORDER)?.finish({ ended: NO_WIN, report: null });
  recordSolveStart({ home }, input(5, {}, { lds: null }), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });

  const { entries, unread } = statisticsEntriesIn({ home });
  assert.deepEqual(unread, []);
  assert.deepEqual(
    entries.map(e => e.fight),
    [GORDIE, GORDIE, GORDIE],
  );
  assert.deepEqual(entries[0].statistics, {
    schema: 1,
    turn: 1,
    at: AT,
    ended: WON,
    budget: { expansions: 3000, turns: 40 },
    lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 },
    portfolio: [
      { width: 8, ours: 1 },
      { width: 8, ours: 0.5 },
      { width: 16, ours: 0.5 },
    ],
    pluginVersion: "1.83.0",
    gameVersion: "1.12.1.3",
  });
  const [, second, third] = entries.map(e => e.statistics);
  assert.deepEqual([second.turn, second.ended, second.budget, second.lds, second.portfolio], [1, NO_WIN, { expansions: 40000, turns: 60 }, lds, [{ width: 4, ours: 1 }]]);
  assert.deepEqual([third.turn, third.ended, third.lds], [5, WON, null]);
});

/** Every field of the solver's report filled, so one the schema doesn't know fails the strict read. */
const REPORT = {
  startup: { gateMs: 4, loadMs: 1_840, pool: { warm: false, ms: 6_210 } },
  pool: { size: 4, died: 1, lastDeath: "the worker ran out of heap", peakHeapMb: 812, heapLimitMb: 4096, slowPoll: "the phase poll", realClock: null },
  turnTimes: {
    restore: { count: 3, totalMs: 61.5, p50Ms: 20.1, p95Ms: 22, maxMs: 22 },
    play: { count: 0, totalMs: 0, p50Ms: null, p95Ms: null, maxMs: null },
  },
  cores: 8,
  search: {
    found: { stage: "beam", index: 1, turn: 5, spent: 16 },
    stages: [
      { stage: "lds", ended: "exhausted", spent: 2, ms: 30 },
      { stage: "beam", index: 0, ended: "stalled", spent: 4, ms: 55 },
      { stage: "beam", index: 1, ended: "won", spent: 10, ms: 310 },
    ],
    dropped: { "the turn timed out": 3 },
    replays: { ran: 2, failed: { lost: 1, scene_mismatch: 1 }, ms: 420 },
    merged: 5,
    stalled: 1,
  },
} satisfies Required<SolveReport>;

test("a full statistics entry, every SolveReport field filled, reads back unchanged against the baseline schema", () => {
  const home = temp("full-entry");

  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: REPORT, oracleLine: line() });
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: { kind: "no_answer", code: "a_code_the_solver_added_later" as "no_win" }, report: REPORT });

  const { entries, unread } = statisticsEntriesIn({ home });
  assert.deepEqual(unread, []);
  assert.deepEqual(entries[0].statistics, {
    schema: 1,
    turn: 1,
    at: AT,
    budget: { expansions: 3000, turns: 40 },
    lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 },
    portfolio: [
      { width: 8, ours: 1 },
      { width: 8, ours: 0.5 },
      { width: 16, ours: 0.5 },
    ],
    pluginVersion: "1.83.0",
    gameVersion: "1.12.1.3",
    ...REPORT,
    ended: WON,
  });
  assert.deepEqual(entries[1].statistics.ended, { kind: "no_answer", code: "a_code_the_solver_added_later" });
});

test("an entry written before the solver reported reads too", () => {
  const home = temp("report-less");

  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: { kind: "cancelled", progress: null }, report: null });
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: { kind: "failed", failure: "the clone's worker died" }, report: null });

  const { entries, unread } = statisticsEntriesIn({ home });
  assert.deepEqual(unread, []);
  assert.deepEqual(
    entries.map(e => [e.statistics.ended, "cores" in e.statistics]),
    [
      [{ kind: "cancelled", progress: null }, false],
      [{ kind: "failed", failure: "the clone's worker died" }, false],
    ],
  );
});

test("a line that isn't JSON, lacks a required field, or holds only part of the solver's report is named <path> line <n> and skipped, and the rest of the file counts (#948)", () => {
  const library = temp("unread");
  recordSolveStart({ library }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  const [{ files }] = solveStartsIn({ library });
  const file = path.join(path.dirname(files.input), "statistics.jsonl");
  const [whole] = readFileSync(file, "utf8").split("\n");
  const { turn: _turn, ...noTurn } = JSON.parse(whole);
  writeFileSync(
    file,
    [whole, '{"schema":1,"tur', "", JSON.stringify(noTurn), JSON.stringify({ ...JSON.parse(whole), cores: 8 }), JSON.stringify({ ...JSON.parse(whole), turn: 3 })].join("\n") + "\n",
  );

  const { entries, unread } = statisticsEntriesIn({ library });

  assert.deepEqual(
    entries.map(e => e.statistics.turn),
    [1, 3],
  );
  const at = `${GORDIE.folder}/statistics.jsonl`;
  assert.deepEqual(
    unread.map(u => u.slice(0, u.indexOf(":"))),
    [`${at} line 2`, `${at} line 4`, `${at} line 5`],
  );
  assert.match(unread[0], /: not JSON: /);
  assert.match(unread[1], /: turn: /);
  assert.match(unread[2], /: the entry: .*"cores"/);
});

test("a folder not named as the recorder names a fight is named by its folder, has no wave, and no wave filter selects it", () => {
  const library = temp("unnamed");
  recordSolveStart({ library }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  const [{ files }] = solveStartsIn({ library });
  mkdirSync(path.join(library, "Not A Fight"));
  writeFileSync(path.join(library, "Not A Fight", "turn-1.json"), readFileSync(files.input));

  const unnamed = { folder: "Not A Fight", name: "Not A Fight", wave: null };
  assert.deepEqual(
    solveStartsIn({ library }).map(s => s.fight),
    [unnamed, GORDIE],
  );
  assert.deepEqual(
    solveStartsIn({ library }, { fights: ["Not A Fight"] }).map(s => s.fight),
    [unnamed],
  );
  assert.deepEqual(
    solveStartsIn({ library }, { waves: [180, Number.NaN] }).map(s => s.fight),
    [GORDIE],
  );
});

test("the filter selects by folder or fight name, whole, and by wave (#939)", () => {
  const library = temp("filter");
  for (const over of [{}, { seed: "AbC", waveIndex: 188 }, { waveIndex: 190, trainer: { trainerType: 365, variant: 0 } }] as Partial<SessionSave>[]) {
    recordSolveStart({ library }, input(1, over), RECORDER)?.finish({ ended: WON, report: null });
  }
  const folders = (filter: Parameters<typeof solveStartsIn>[1]) => solveStartsIn({ library }, filter).map(s => s.fight.folder);
  const [kieran, otherGordie] = ["Zu5cgKRQ0vigLcOhpJxYMUa0-w190-kieran", "AbC-w188-gordie"];

  assert.deepEqual(folders({}), [otherGordie, GORDIE.folder, kieran]);
  assert.deepEqual(folders({ fights: ["gordie"] }), [otherGordie, GORDIE.folder]);
  assert.deepEqual(folders({ fights: [kieran] }), [kieran]);
  assert.deepEqual(folders({ waves: [190, 188] }), [otherGordie, kieran]);
  assert.deepEqual(folders({ fights: ["gordie"], waves: [180] }), [GORDIE.folder]);
  assert.deepEqual(folders({ fights: ["gord"] }), [], "a fight is named whole, never by part of its name");
});

test("a home's fights are its waiting ones, then each import's, oldest first, and nothing else under the home (#948)", () => {
  const home = temp("home-walk");
  const library = temp("home-walk-library");
  recordSolveStart({ home }, input(1, { waveIndex: 200 }), RECORDER)?.finish({ ended: WON, report: null });
  mergeWaitingFights(home, library, new Date("2026-10-20T10:00:00.000Z"));
  recordSolveStart({ home }, input(1, { waveIndex: 190 }), RECORDER)?.finish({ ended: WON, report: null });
  mergeWaitingFights(home, library, new Date("2026-10-26T09:30:00.000Z"));
  recordSolveStart({ home }, input(1, { waveIndex: 210 }), RECORDER)?.finish({ ended: WON, report: null });
  for (const stray of ["clone", "chrome-profile/Default"]) {
    mkdirSync(path.join(home, stray, GORDIE.folder), { recursive: true });
    writeFileSync(path.join(home, stray, GORDIE.folder, "turn-1.json"), JSON.stringify(input()));
  }

  assert.deepEqual(
    solveStartsIn({ home }).map(s => s.fight.wave),
    [210, 200, 190],
  );
  assert.deepEqual(
    statisticsEntriesIn({ home }).entries.map(e => e.fight.wave),
    [210, 200, 190],
  );
  assert.deepEqual(
    solveStartsIn({ library: path.join(home, "fights") }).map(s => s.fight.wave),
    [210],
  );
});

test("a missing folder holds no fights, and a home with none waits on none", () => {
  const home = path.join(temp("missing"), "nowhere");

  assert.deepEqual(solveStartsIn({ home }), []);
  assert.deepEqual(solveStartsIn({ library: home }), []);
  assert.deepEqual(statisticsEntriesIn({ home }), { entries: [], unread: [] });
  assert.equal(fightsWaiting(home), 0);
});

test("the waiting count counts the home's waiting fight folders (#944, #947)", () => {
  const home = temp("waiting");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null });
  recordSolveStart({ home }, input(5), RECORDER)?.finish({ ended: WON, report: null });
  recordSolveStart({ home }, input(1, { waveIndex: 173, trainer: { trainerType: 57, variant: 2 } }), RECORDER)?.finish({ ended: WON, report: null });
  writeFileSync(path.join(home, "fights", ".DS_Store"), "");

  assert.equal(fightsWaiting(home), 2);
});

test("a solve start that doesn't read says why: no save, an input that doesn't read, an oracle line that isn't a script, which leaves the input readable (#939)", () => {
  const library = temp("whys");
  recordSolveStart({ library }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  const [{ files }] = solveStartsIn({ library });
  const folder = path.dirname(files.input);
  writeFileSync(path.join(folder, "turn-2.json"), JSON.stringify({ budget: { expansions: 3000, turns: 40 } }));
  writeFileSync(path.join(folder, "turn-3.json"), "{ not json");
  writeFileSync(path.join(folder, "turn-4.json"), readFileSync(files.input));
  writeFileSync(path.join(folder, "turn-4.win.script.json"), '{ "inputs": "not a list" }');
  writeFileSync(path.join(folder, "turn-5.win.script.json"), readFileSync(files.oracleLine));

  const [, two, three, four, five] = solveStartsIn({ library });

  assert.deepEqual(two.input, { why: "turn-2.json holds no save" });
  assert.match((three.input as Why).why, /^turn-3\.json doesn't read: /);
  assert.equal("why" in four.input, false);
  assert.match((four.oracleLine as Why).why, /^turn-4\.win\.script\.json doesn't read as a script: /);
  assert.match((five.input as Why).why, /^turn-5\.json doesn't read: /);
  assert.deepEqual(five.oracleLine, line());
});

test("a fight folder reads as its first turn's solve start, either file of a solve start as its turn, and any other path says why (#787, #937)", () => {
  const home = temp("at");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(5), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line("THUNDER") });
  const [first, fifth] = solveStartsIn({ home });
  const folder = path.dirname(first.files.input);

  assert.deepEqual(solveStartAt(folder), first);
  assert.deepEqual(solveStartAt(fifth.files.input), fifth);
  assert.deepEqual(solveStartAt(fifth.files.oracleLine), fifth);
  const notes = path.join(folder, "notes.txt");
  assert.deepEqual(solveStartAt(notes), { why: `${notes} is no fight folder and no solve start's file` });
});

test("a benchmark entry is marked with its setting set, built as a recording builds one; one that can't be appended says why and throws nothing (#950)", () => {
  const library = temp("benchmark");
  recordSolveStart({ library }, input(5), RECORDER)?.finish({ ended: NO_WIN, report: null });
  const [start] = solveStartsIn({ library });
  const run = { input: { ...input(5), budget: { expansions: 10000, turns: 40 } }, ended: WON, report: REPORT, set: "total 40000" };

  assert.equal(appendStatisticsEntry(start, run, RECORDER), null);

  const [live, benchmarked] = statisticsEntriesIn({ library }).entries.map(e => e.statistics);
  assert.equal(live.benchmark, undefined);
  assert.deepEqual(benchmarked, { ...live, ...REPORT, ended: WON, budget: { expansions: 10000, turns: 40 }, benchmark: { set: "total 40000" } });
  const file = path.join(path.dirname(start.files.input), "statistics.jsonl");
  rmSync(file);
  mkdirSync(file);
  assert.match(appendStatisticsEntry(start, run, RECORDER)?.why ?? "(appended)", /EISDIR/);
});

const AT_IMPORT = new Date("2026-10-26T09:30:00.000Z");

/** A home and a library beside it, each recorded into through `record`. */
function homeAndLibrary() {
  const root = temp("merge");
  const home = path.join(root, "home");
  const library = path.join(root, "library");
  mkdirSync(library);
  return { home, library, aside: path.join(home, "fights-imported", "2026-10-26T09-30-00.000Z") };
}

test("a new fight is copied in whole and moved aside under fights-imported/<at> (#944)", () => {
  const { home, library, aside } = homeAndLibrary();
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(1, { waveIndex: 173, trainer: { trainerType: 57, variant: 2 } }), RECORDER)?.finish({ ended: NO_WIN, report: null });
  const waiting = solveStartsIn({ home });

  const { asideUnder, fights } = mergeWaitingFights(home, library, AT_IMPORT);

  assert.equal(asideUnder, path.join(home, "fights-imported"));
  assert.deepEqual(
    fights.map(f => [f.fight.folder, f.merged, f.added, f.differs, f.statistics, f.unread]),
    [
      ["Zu5cgKRQ0vigLcOhpJxYMUa0-w173-swimmers", false, ["turn-1.json"], [], 1, []],
      [GORDIE.folder, false, ["turn-1.json", "turn-1.win.script.json"], [], 1, []],
    ],
  );
  assert.deepEqual(
    solveStartsIn({ library }).map(({ files: _files, ...start }) => start),
    waiting.map(({ files: _files, ...start }) => start),
  );
  assert.deepEqual(statisticsEntriesIn({ library }).entries.length, 2);
  assert.equal(fightsWaiting(home), 0);
  assert.deepEqual(readdirSync(aside), ["Zu5cgKRQ0vigLcOhpJxYMUa0-w173-swimmers", GORDIE.folder]);
  assert.deepEqual(mergeWaitingFights(home, library, new Date("2026-10-26T10:00:00.000Z")).fights, []);
  assert.deepEqual(readdirSync(path.join(home, "fights-imported")), ["2026-10-26T09-30-00.000Z"]);
});

test("a held fight gains the solve starts it lacks, and an oracle line only for a solve start held from the same position, budget aside (#944)", () => {
  const { home, library } = homeAndLibrary();
  const elsewhere = input(7, { party: [{ id: 1, weather: "RAIN" }] });
  for (const turn of [1, 7]) recordSolveStart({ library }, input(turn), RECORDER)?.finish({ ended: NO_WIN, report: null });
  recordSolveStart({ home }, input(1, {}, { budget: { expansions: 40000, turns: 40 } }), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, elsewhere, RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(10), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line("THUNDER") });
  recordSolveStart({ home }, input(2), RECORDER)?.finish({ ended: NO_WIN, report: null });

  const [merge] = mergeWaitingFights(home, library, AT_IMPORT).fights;

  assert.deepEqual(
    [merge.merged, merge.added, merge.differs],
    [true, ["turn-1.win.script.json", "turn-2.json", "turn-10.json", "turn-10.win.script.json"], ["turn-7"]],
  );
  assert.deepEqual(
    merge.placed.map(p => [p.start.turn, p.input, p.oracleLine]),
    [
      [1, false, true],
      [2, true, false],
      [10, true, true],
    ],
  );
  assert.deepEqual(budgetOf(merge.placed[0].start), { expansions: 3000, turns: 40 }, "the library keeps its own input");
  assert.deepEqual(
    solveStartsIn({ library }).map(s => [s.turn, s.oracleLine]),
    [
      [1, line()],
      [2, null],
      [7, null],
      [10, line("THUNDER")],
    ],
  );
});

test("statistics entries the library holds aren't appended twice (#944)", () => {
  const { home, library } = homeAndLibrary();
  recordSolveStart({ library }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(5), RECORDER)?.finish({ ended: NO_WIN, report: null });

  const [merge] = mergeWaitingFights(home, library, AT_IMPORT).fights;

  assert.equal(merge.statistics, 1);
  assert.deepEqual(
    statisticsEntriesIn({ library }).entries.map(e => e.statistics.turn),
    [1, 5],
  );
});

test("a library solve start that doesn't read counts as another position, and a waiting one that doesn't read is left out and listed (#944)", () => {
  const { home, library, aside } = homeAndLibrary();
  recordSolveStart({ library }, input(), RECORDER)?.finish({ ended: NO_WIN, report: null });
  const [held] = solveStartsIn({ library });
  writeFileSync(held.files.input, "{ not json");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  recordSolveStart({ home }, input(5), RECORDER)?.finish({ ended: WON, report: null });
  const [, fifth] = solveStartsIn({ home });
  writeFileSync(fifth.files.oracleLine, '{ "inputs": "not a list" }');

  const [merge] = mergeWaitingFights(home, library, AT_IMPORT).fights;

  assert.deepEqual([merge.added, merge.differs, merge.placed], [[], ["turn-1"], []]);
  assert.deepEqual(merge.unread.length, 1);
  assert.match(merge.unread[0], /^turn-5: turn-5\.win\.script\.json doesn't read as a script: /);
  assert.deepEqual(
    solveStartsIn({ library }).map(s => s.turn),
    [1],
  );
  assert.deepEqual(readdirSync(path.join(aside, GORDIE.folder)).sort(), ["statistics.jsonl", "turn-1.json", "turn-1.win.script.json", "turn-5.json", "turn-5.win.script.json"]);
});

test("files the layout doesn't know stay aside with their fight (#944)", () => {
  const { home, library, aside } = homeAndLibrary();
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  const [{ files }] = solveStartsIn({ home });
  writeFileSync(path.join(path.dirname(files.input), "notes.txt"), "won it live");

  mergeWaitingFights(home, library, AT_IMPORT);

  assert.equal(readdirSync(path.join(library, GORDIE.folder)).includes("notes.txt"), false);
  assert.equal(readFileSync(path.join(aside, GORDIE.folder, "notes.txt"), "utf8"), "won it live");
});

test("nothing planted under a home or a library makes a read throw", () => {
  const home = temp("planted");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  const [{ files }] = solveStartsIn({ home });
  const folder = path.dirname(files.input);
  mkdirSync(path.join(folder, "turn-2.json"));
  mkdirSync(path.join(folder, "turn-3.win.script.json"));
  rmSync(path.join(folder, "statistics.jsonl"));
  mkdirSync(path.join(folder, "statistics.jsonl"));
  writeFileSync(path.join(home, "fights-imported"), "");

  const starts = solveStartsIn({ home });
  assert.deepEqual(
    starts.map(s => s.turn),
    [1, 2, 3],
  );
  assert.match((starts[1].input as Why).why, /^turn-2\.json doesn't read: /);
  assert.match((starts[2].oracleLine as Why).why, /^turn-3\.win\.script\.json doesn't read as a script: /);
  const { entries, unread } = statisticsEntriesIn({ home });
  assert.deepEqual(entries, []);
  assert.match(unread.join("\n"), /^fights\/Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie\/statistics\.jsonl: doesn't read: /);
  assert.equal(fightsWaiting(files.input), 0);
});

test("a part file is never a solve start", () => {
  const home = temp("part");
  recordSolveStart({ home }, input(), RECORDER)?.finish({ ended: WON, report: null, oracleLine: line() });
  const [{ files }] = solveStartsIn({ home });
  writeFileSync(path.join(path.dirname(files.input), "turn-2.json.part"), "{");
  writeFileSync(path.join(path.dirname(files.input), "turn-3.win.script.json.part"), "{");

  assert.deepEqual(
    solveStartsIn({ home }).map(s => s.turn),
    [1],
  );
});
