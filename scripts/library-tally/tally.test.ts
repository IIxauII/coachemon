import assert from "node:assert/strict";
import test from "node:test";
import type { SolveStatistics } from "../../src/solver/capture.ts";
import type { SearchStatistics } from "../../src/solver/search.ts";
import { type Entry, report, tally } from "./tally.ts";

const GORDIE = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";
const GORDIE_AGAIN = "Hk2pQ0vigLcOhpJxYMUa0abc-w180-gordie";
const ETERNATUS = "Zu5cgKRQ0vigLcOhpJxYMUa0-w200-eternatus";

const DEFAULTS = {
  budget: { expansions: 3000, turns: 40 },
  lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 },
  portfolio: [
    { width: 8, ours: 1 },
    { width: 8, ours: 0.5 },
    { width: 16, ours: 0.5 },
  ],
};

const solve = (fight: string, ended: SolveStatistics["ended"], over: Entry["statistics"] = {}): Entry => ({
  fight,
  statistics: {
    schema: 1,
    turn: 1,
    at: "2026-10-20T10:00:00.000Z",
    ended,
    ...DEFAULTS,
    pluginVersion: "1.81.0",
    gameVersion: "1.12.2.0",
    ...over,
  },
});

const WON = { kind: "oracle_line" } as const;
const NO_WIN = { kind: "no_answer", code: "no_win" } as const;

test("a fight counts as won under a setting set where any of its solves under it found an oracle line (#948)", () => {
  const bigger = { budget: { expansions: 10000, turns: 40 } };
  const sets = tally([
    solve(GORDIE, NO_WIN),
    solve(GORDIE, WON, { turn: 4 }),
    solve(ETERNATUS, NO_WIN),
    solve(ETERNATUS, WON, bigger),
  ]);
  assert.equal(sets.length, 2);
  const [usual, more] = sets;
  assert.deepEqual(usual.fights, { won: 1, of: 2 });
  assert.deepEqual(usual.solves, { won: 1, of: 3 });
  assert.deepEqual(more.fights, { won: 1, of: 1 });
  assert.deepEqual(more.settings.budget, bigger.budget);
});

type Search = NonNullable<Entry["statistics"]["search"]>;

const byLds = (pass: number, spent: number, ms: number): { search: Search } => ({
  search: { found: { stage: "lds", pass, spent }, stages: [{ stage: "lds", ended: "won", spent, ms }] },
});

/** The discrepancy search ran out of budget first; the beams' `ms` counts from when they started. */
const byBeam = (index: number, turn: number, spent: number, ms: number): { search: Search } => ({
  search: {
    found: { stage: "beam", index, turn, spent },
    stages: [
      { stage: "lds", ended: "budget", spent: 3000, ms: 20_000 },
      ...[0, 1, 2].map(i => ({ stage: "beam" as const, index: i, ended: i === index ? ("won" as const) : ("stopped" as const), spent: 100, ms })),
    ],
  },
});

test("each win counts toward the stage that found it, and an entry written before stages were recorded still counts as a win (#948)", () => {
  const [set] = tally([
    solve(GORDIE, WON, byLds(1, 400, 5_000)),
    solve(GORDIE_AGAIN, WON, byBeam(2, 7, 3_900, 10_000)),
    solve(ETERNATUS, WON, byBeam(2, 11, 4_200, 30_000)),
    solve(ETERNATUS, WON, { turn: 3 }),
    solve(ETERNATUS, NO_WIN, { search: { found: null, stages: [] } }),
  ]);
  assert.deepEqual(set.solves, { won: 4, of: 5 });
  assert.deepEqual(set.foundBy, [
    { by: "beam 2 (16 wide, ours 0.5)", wins: 2 },
    { by: "discrepancy search, pass 1", wins: 1 },
    { by: "not recorded", wins: 1 },
  ]);
});

test("turns and time to the first win read the win's own stage, after the discrepancy search where the beams won (#948)", () => {
  const [set] = tally([
    solve(GORDIE, WON, byLds(1, 400, 5_000)),
    solve(GORDIE_AGAIN, WON, byBeam(2, 7, 3_900, 10_000)),
    solve(ETERNATUS, WON, byBeam(0, 11, 4_200, 30_000)),
    solve(ETERNATUS, WON, { turn: 3 }),
    solve(ETERNATUS, NO_WIN, { search: { found: null, stages: [] } }),
  ]);
  assert.deepEqual(set.toWin, { wins: 3, turns: { median: 3_900, max: 4_200 }, ms: { median: 30_000, max: 50_000 } });
});

test("a setting set with no win recorded with its stages has no turns or time to it (#948)", () => {
  const [set] = tally([solve(GORDIE, WON), solve(GORDIE, NO_WIN)]);
  assert.equal(set.toWin, null);
});

test("each setting set breaks down by trainer and wave, two seeds' fights against one trainer on one wave together (#948)", () => {
  const [set] = tally([
    solve(ETERNATUS, NO_WIN),
    solve(GORDIE, WON, byLds(1, 400, 5_000)),
    solve(GORDIE_AGAIN, NO_WIN),
    solve("not-a-fight-folder", NO_WIN),
  ]);
  assert.deepEqual(
    set.byFight.map(({ trainer, wave, fights, solves, foundBy }) => ({ trainer, wave, fights, solves, foundBy })),
    [
      { trainer: "gordie", wave: 180, fights: { won: 1, of: 2 }, solves: { won: 1, of: 2 }, foundBy: [{ by: "discrepancy search, pass 1", wins: 1 }] },
      { trainer: "eternatus", wave: 200, fights: { won: 0, of: 1 }, solves: { won: 0, of: 1 }, foundBy: [] },
      { trainer: "not-a-fight-folder", wave: null, fights: { won: 0, of: 1 }, solves: { won: 0, of: 1 }, foundBy: [] },
    ],
  );
  assert.deepEqual(set.byFight[0].toWin, { wins: 1, turns: { median: 400, max: 400 }, ms: { median: 5_000, max: 5_000 } });
});

test("the report heads each setting set with its settings, then its wins, turns and time to them, stages, and a row per trainer and wave (#948)", () => {
  const out = report([
    solve(GORDIE, WON, byLds(1, 400, 5_000)),
    solve(ETERNATUS, WON, byBeam(2, 11, 4_200, 3_000_000)),
    solve(ETERNATUS, NO_WIN),
    solve(ETERNATUS, NO_WIN, { lds: null, portfolio: [{ width: 16, ours: 0.5 }] }),
  ]);
  const [usual, beamsAlone] = out.split(/^### /m).slice(1);
  assert.match(
    usual,
    /^live: beams 8 wide ours 1, 8 wide ours 0\.5, 16 wide ours 0\.5, 3000 turns each, to turn 40; discrepancy search 3000 turns, 2 alternatives, 2 discrepancies, ours 1\n/,
  );
  assert.match(usual, /^fights won: 2 of 2; solves won: 2 of 3$/m);
  assert.match(usual, /^turns to the first win: median 2300, max 4200, over 2 wins$/m);
  assert.match(usual, /^time to the first win: median 25\.2 min, max 50\.3 min$/m);
  assert.match(usual, /^found by: discrepancy search, pass 1: 1; beam 2 \(16 wide, ours 0\.5\): 1$/m);
  assert.match(usual, /^\| gordie \| 180 \| 1 of 1 \| 1 of 1 \| 400 \| 5\.0 s \| discrepancy search, pass 1: 1 \|$/m);
  assert.match(usual, /^\| eternatus \| 200 \| 1 of 1 \| 1 of 2 \| 4200 \| 50\.3 min \| beam 2 \(16 wide, ours 0\.5\): 1 \|$/m);
  assert.match(beamsAlone, /^live: beams 16 wide ours 0\.5, 3000 turns each, to turn 40; no discrepancy search\n/);
  assert.match(beamsAlone, /^fights won: 0 of 1; solves won: 0 of 1$/m);
  assert.doesNotMatch(beamsAlone, /^(turns to the first win|time to the first win|found by):/m);
  assert.match(beamsAlone, /^\| eternatus \| 200 \| 0 of 1 \| 0 of 1 \| — \| — \| — \|$/m);
});

test("an entry that predates the settings it ran under is tallied apart, under settings not recorded (#948)", () => {
  const { budget: _b, lds: _l, portfolio: _p, ...bare } = solve(GORDIE, WON).statistics;
  const out = report([{ fight: GORDIE, statistics: bare }, solve(GORDIE, WON)]);
  assert.match(out, /^### live: settings not recorded\nfights won: 1 of 1; solves won: 1 of 1$/m);
  assert.match(out, /^found by: not recorded: 1$/m);
});

test("benchmark entries are tallied apart from live ones, a setting set each by its name, after the live sets (#950)", () => {
  const run = (set: string, over: Partial<SolveStatistics> = {}) => ({ benchmark: { set }, ...over });
  const sets = tally([
    solve(ETERNATUS, WON, run("total 40000", { budget: { expansions: 10000, turns: 40 } })),
    solve(ETERNATUS, NO_WIN),
    solve(ETERNATUS, NO_WIN, run("default")),
    solve(GORDIE, WON, run("default")),
    solve(GORDIE, WON),
  ]);
  assert.deepEqual(
    sets.map(s => ({ benchmark: s.benchmark, solves: s.solves })),
    [
      { benchmark: null, solves: { won: 1, of: 2 } },
      { benchmark: "total 40000", solves: { won: 1, of: 1 } },
      { benchmark: "default", solves: { won: 1, of: 2 } },
    ],
  );
  const out = report([solve(GORDIE, WON), solve(GORDIE, NO_WIN, run("default"))]);
  assert.match(out, /^### live: beams 8 wide ours 1, /m);
  assert.match(out, /^### benchmark "default": beams 8 wide ours 1, /m);
});

const started = (gateMs: number, loadMs: number | null, pool: { warm: boolean; ms: number } | null): Pick<SolveStatistics, "startup"> => ({
  startup: { gateMs, loadMs, pool },
});

test("startup totals the gate, the load check and the pool's start over the solves that recorded them, an older entry left out (#949)", () => {
  const [set] = tally([
    solve(GORDIE, WON, started(100, 3_000, { warm: false, ms: 9_000 })),
    solve(GORDIE, NO_WIN, started(50, 2_000, { warm: true, ms: 1_000 })),
    solve(ETERNATUS, NO_WIN, started(20, null, null)),
    solve(ETERNATUS, WON),
  ]);
  assert.deepEqual(set.time.startup, { solves: 3, ms: 15_170, gateMs: 170, loadMs: 5_000, poolMs: 10_000 });
  assert.deepEqual(set.byFight.find(f => f.trainer === "eternatus")?.time.startup, { solves: 1, ms: 20, gateMs: 20, loadMs: 0, poolMs: 0 });
});

test("each stage totals its own time, and the beams, which run side by side, their longest, over the solves whose search ended (#949)", () => {
  const [set] = tally([
    solve(GORDIE, WON, byLds(1, 400, 5_000)),
    solve(GORDIE_AGAIN, WON, byBeam(2, 7, 3_900, 10_000)),
    solve(ETERNATUS, NO_WIN, {
      search: {
        found: null,
        stages: [
          { stage: "lds", ended: "budget", spent: 3000, ms: 15_000 },
          { stage: "beam", index: 0, ended: "budget", spent: 3000, ms: 40_000 },
          { stage: "beam", index: 1, ended: "emptied", spent: 2233, ms: 25_000 },
        ],
      },
    }),
    solve(ETERNATUS, WON),
  ]);
  assert.deepEqual(set.time.lds, { solves: 3, ms: 40_000 });
  assert.deepEqual(set.time.beams, {
    solves: 2,
    ms: 50_000,
    each: [
      { beam: "beam 0 (8 wide, ours 1)", ms: 50_000 },
      { beam: "beam 1 (8 wide, ours 0.5)", ms: 35_000 },
      { beam: "beam 2 (16 wide, ours 0.5)", ms: 10_000 },
    ],
  });
});

const spread = (count: number, totalMs: number) => ({ count, totalMs, p50Ms: null, p95Ms: null, maxMs: null });

const searched = (over: Partial<SearchStatistics>): { search: SearchStatistics } => ({
  search: { found: null, stages: [], dropped: {}, replays: { ran: 0, failed: {}, ms: 0 }, merged: 0, stalled: 0, ...over },
});

test("confirming replays and the turns played total their count and time, an entry that predates them left out (#949)", () => {
  const [set] = tally([
    solve(GORDIE, WON, { ...searched({ replays: { ran: 2, failed: { lost: 1 }, ms: 1_500 } }), turnTimes: { restore: spread(900, 40_000), play: spread(900, 75_000) } }),
    solve(GORDIE, NO_WIN, { ...searched({ replays: { ran: 1, failed: {}, ms: 500 } }), turnTimes: null }),
    solve(ETERNATUS, WON, { ...byLds(1, 400, 5_000), turnTimes: { restore: spread(100, 2_000), play: spread(100, 5_000) } }),
  ]);
  assert.deepEqual(set.time.replays, { solves: 2, ran: 3, ms: 2_000 });
  assert.deepEqual(set.time.turns, { solves: 2, turns: 1_000, restoreMs: 42_000, playMs: 80_000 });
});

test("the top drop reasons are the three that dropped the most turns, summed over the solves that counted them (#949)", () => {
  const [set] = tally([
    solve(ETERNATUS, NO_WIN, searched({ dropped: { "the harness timed out": 100, "a move it could not pick": 40, "the fork point was gone": 8 } })),
    solve(ETERNATUS, NO_WIN, searched({ dropped: { "the harness timed out": 200, "a move it could not pick": 60, "a switch to a fainted mon": 57, "an odd one": 1 } })),
    solve(ETERNATUS, WON, searched({ dropped: {} })),
    solve(ETERNATUS, WON, byLds(1, 400, 5_000)),
  ]);
  assert.deepEqual(set.drops, {
    solves: 3,
    dropped: 466,
    top: [
      { reason: "the harness timed out", turns: 300 },
      { reason: "a move it could not pick", turns: 100 },
      { reason: "a switch to a fainted mon", turns: 57 },
    ],
  });
});

test("a setting set none of whose entries counted drops has no drop reasons (#949)", () => {
  const [set] = tally([solve(GORDIE, WON, byLds(1, 400, 5_000))]);
  assert.equal(set.drops, null);
});

test("the report says where each setting set's time went and its top drop reasons, then a row per trainer and wave (#949)", () => {
  const out = report([
    solve(GORDIE, WON, {
      ...started(100, 3_000, { warm: false, ms: 9_000 }),
      ...searched({ replays: { ran: 2, failed: { lost: 1 }, ms: 1_500 }, ...byLds(1, 400, 5_000).search }),
      turnTimes: { restore: spread(900, 40_000), play: spread(900, 75_000) },
    }),
    solve(ETERNATUS, NO_WIN, {
      ...started(60, 2_000, { warm: true, ms: 1_000 }),
      ...searched({ dropped: { "the harness timed out": 148, "a move it could not pick": 2 }, ...byBeam(1, 12, 9_000, 30_000).search }),
      turnTimes: { restore: spread(100, 2_000), play: spread(100, 5_000) },
    }),
    solve(ETERNATUS, NO_WIN),
  ]);
  assert.match(out, /^startup: 15\.2 s over 2 solves \(gate 0\.2 s, load check 5\.0 s, pool start 10\.0 s\)$/m);
  assert.match(out, /^discrepancy search: 25\.0 s over 2 solves$/m);
  assert.match(
    out,
    /^beams side by side: 30\.0 s over 1 solve \(beam 0 \(8 wide, ours 1\) 30\.0 s; beam 1 \(8 wide, ours 0\.5\) 30\.0 s; beam 2 \(16 wide, ours 0\.5\) 30\.0 s\)$/m,
  );
  assert.match(out, /^confirming replays: 2, in 1\.5 s, over 2 solves$/m);
  assert.match(out, /^turns played: 1000, restoring 42\.0 s and playing 1\.3 min of worker time, over 2 solves$/m);
  assert.match(out, /^top drop reasons: the harness timed out: 148; a move it could not pick: 2; of 150 dropped over 2 solves$/m);
  assert.match(
    out,
    /^\| trainer \| wave \| startup \| discrepancy search \| beams side by side \| confirming replays \| restoring \| playing \| top drop reason \|$/m,
  );
  assert.match(out, /^\| gordie \| 180 \| 12\.1 s \| 5\.0 s \| — \| 1\.5 s \| 40\.0 s \| 1\.3 min \| none \|$/m);
  assert.match(out, /^\| eternatus \| 200 \| 3\.1 s \| 20\.0 s \| 30\.0 s \| 0\.0 s \| 2\.0 s \| 5\.0 s \| the harness timed out: 148 \|$/m);
});

test("a setting set whose entries all predate the time split and drop counts reports neither (#949)", () => {
  const out = report([solve(GORDIE, WON), solve(ETERNATUS, NO_WIN)]);
  assert.doesNotMatch(out, /^(startup|discrepancy search|beams side by side|confirming replays|turns played|top drop reasons):/m);
  assert.match(out, /^\| gordie \| 180 \| — \| — \| — \| — \| — \| — \| — \|$/m);
});
