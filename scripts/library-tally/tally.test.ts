import assert from "node:assert/strict";
import test from "node:test";
import type { SolveStatistics } from "../../src/solver/capture.ts";
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

const solve = (fight: string, ended: SolveStatistics["ended"], over: Partial<SolveStatistics> = {}): Entry => ({
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

const byLds = (pass: number, spent: number, ms: number): Pick<SolveStatistics, "search"> => ({
  search: { found: { stage: "lds", pass, spent }, stages: [{ stage: "lds", ended: "won", spent, ms }] },
});

/** The discrepancy search ran out of budget first; the beams' `ms` counts from when they started. */
const byBeam = (index: number, turn: number, spent: number, ms: number): Pick<SolveStatistics, "search"> => ({
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
    /^beams 8 wide ours 1, 8 wide ours 0\.5, 16 wide ours 0\.5, 3000 turns each, to turn 40; discrepancy search 3000 turns, 2 alternatives, 2 discrepancies, ours 1\n/,
  );
  assert.match(usual, /^fights won: 2 of 2; solves won: 2 of 3$/m);
  assert.match(usual, /^turns to the first win: median 2300, max 4200, over 2 wins$/m);
  assert.match(usual, /^time to the first win: median 25\.2 min, max 50\.3 min$/m);
  assert.match(usual, /^found by: discrepancy search, pass 1: 1; beam 2 \(16 wide, ours 0\.5\): 1$/m);
  assert.match(usual, /^\| gordie \| 180 \| 1 of 1 \| 1 of 1 \| 400 \| 5\.0 s \| discrepancy search, pass 1: 1 \|$/m);
  assert.match(usual, /^\| eternatus \| 200 \| 1 of 1 \| 1 of 2 \| 4200 \| 50\.3 min \| beam 2 \(16 wide, ours 0\.5\): 1 \|$/m);
  assert.match(beamsAlone, /^beams 16 wide ours 0\.5, 3000 turns each, to turn 40; no discrepancy search\n/);
  assert.match(beamsAlone, /^fights won: 0 of 1; solves won: 0 of 1$/m);
  assert.doesNotMatch(beamsAlone, /^(turns to the first win|time to the first win|found by):/m);
  assert.match(beamsAlone, /^\| eternatus \| 200 \| 0 of 1 \| 0 of 1 \| — \| — \| — \|$/m);
});

test("an entry that predates the settings it ran under is tallied apart, under settings not recorded (#948)", () => {
  const { budget: _b, lds: _l, portfolio: _p, ...bare } = solve(GORDIE, WON).statistics;
  const out = report([{ fight: GORDIE, statistics: bare }, solve(GORDIE, WON)]);
  assert.match(out, /^### settings not recorded\nfights won: 1 of 1; solves won: 1 of 1$/m);
  assert.match(out, /^found by: not recorded: 1$/m);
});
