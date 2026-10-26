import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { recordSolveStart, type SolveStart, solveStartsIn, type StatisticsEntry, statisticsEntriesIn } from "../../src/solver/fight-library.ts";
import type { SessionSave, SolveInput, SolveReport, SolveResult } from "../../src/solver/solver.ts";
import { benchmark, type NamedSettings, settingSets } from "./benchmark.ts";

const PIN = "1.12.2.0";

const GORDIE = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";
const ETERNATUS = "Zu5cgKRQ0vigLcOhpJxYMUa0-w200-eternatus";

const save = (over: Partial<SessionSave> = {}): SessionSave => ({
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

const FIGHTS = {
  gordie: save(),
  eternatus: save({ waveIndex: 200, trainer: null, enemyParty: [{ species: 890 }] }),
  otherGordie: save({ seed: "Hk2pQ0vigLcOhpJxYMUa0abc", waveIndex: 190 }),
};

const LIVE = { now: () => new Date("2026-10-20T10:00:00.000Z"), pluginVersion: "1.81.0" };

/** A library folder whose fights each hold a first-turn solve recorded live, and that solve's statistics entry. */
function library(saves: SessionSave[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "coachemon-benchmark-"));
  for (const s of saves) {
    recordSolveStart({ library: root }, { save: s, cloneVersion: PIN, budget: { expansions: 3000, turns: 40 } }, LIVE)?.finish({
      ended: { kind: "no_answer", code: "no_win" },
      report: null,
    });
  }
  return root;
}

const startOf = (root: string, fight: string): SolveStart => {
  const start = solveStartsIn({ library: root }, { fights: [fight] })[0];
  if (start === undefined) throw new Error(`no solve start in ${fight}`);
  return start;
};

const entries = (root: string, fight: string): StatisticsEntry[] =>
  statisticsEntriesIn({ library: root }).entries.flatMap(e => (e.fight.folder === fight ? [e.statistics] : []));

const SETS: NamedSettings[] = [
  { name: "default", settings: { budget: { expansions: 3000, turns: 40 } } },
  { name: "total 40000", settings: { budget: { expansions: 10000, turns: 40 }, lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 10000 } } },
];

const REPORT: SolveReport = { startup: { gateMs: 1, loadMs: 2, pool: { warm: false, ms: 3 } }, pool: null, turnTimes: null, cores: 8 };

const fake = () => {
  const inputs: SolveInput[] = [];
  return {
    inputs,
    solve: async (input: SolveInput, statistics: (report: SolveReport) => void): Promise<SolveResult> => {
      inputs.push(input);
      statistics(REPORT);
      return { kind: "no_answer", message: "no win", reason: { code: "no_win" } } as SolveResult;
    },
  };
};

const RECORDER = { now: () => new Date("2026-10-26T09:00:00.000Z"), pluginVersion: "1.89.0" };

test("each fight is solved again under each setting set, and each solve appends the live statistics entry marked as a benchmark run with its set's name (#950)", async () => {
  const root = library([FIGHTS.gordie, FIGHTS.eternatus]);
  const { inputs, solve } = fake();
  await benchmark(root, SETS, solve, { version: PIN, recorder: RECORDER });
  assert.equal(inputs.length, 4);
  for (const fight of [GORDIE, ETERNATUS]) {
    const [live, ...runs] = entries(root, fight);
    assert.deepEqual([live.at, live.ended, live.benchmark], ["2026-10-20T10:00:00.000Z", { kind: "no_answer", code: "no_win" }, undefined]);
    assert.deepEqual(
      runs.map(r => ({ benchmark: r.benchmark, budget: r.budget, lds: r.lds?.expansions })),
      [
        { benchmark: { set: "default" }, budget: { expansions: 3000, turns: 40 }, lds: 3000 },
        { benchmark: { set: "total 40000" }, budget: { expansions: 10000, turns: 40 }, lds: 10000 },
      ],
    );
    assert.deepEqual(runs[0], {
      schema: 1,
      turn: 1,
      at: "2026-10-26T09:00:00.000Z",
      budget: { expansions: 3000, turns: 40 },
      lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 },
      portfolio: [
        { width: 8, ours: 1 },
        { width: 8, ours: 0.5 },
        { width: 16, ours: 0.5 },
      ],
      pluginVersion: "1.89.0",
      gameVersion: PIN,
      ...REPORT,
      ended: { kind: "no_answer", code: "no_win" },
      benchmark: { set: "default" },
    });
  }
});

test("the fight and wave filters narrow the fights solved again, a fight named by its folder or its fight's name (#950)", async () => {
  const OTHER_GORDIE = "Hk2pQ0vigLcOhpJxYMUa0abc-w190-gordie";
  const solved = async (filter: { fights?: string[]; waves?: number[] }) => {
    const { inputs, solve } = fake();
    await benchmark(library([FIGHTS.gordie, FIGHTS.otherGordie, FIGHTS.eternatus]), SETS.slice(0, 1), solve, { version: PIN, recorder: RECORDER, filter });
    return inputs.map(i => i.save.waveIndex);
  };
  assert.deepEqual(await solved({ fights: ["gordie"] }), [190, 180]);
  assert.deepEqual(await solved({ fights: [ETERNATUS] }), [200]);
  assert.deepEqual(await solved({ waves: [180, 200] }), [180, 200]);
  assert.deepEqual(await solved({ fights: ["gordie"], waves: [190] }), [190]);
  assert.deepEqual(await solved({}), [190, 180, 200]);
});

test("a solve that throws is recorded as failed and the benchmark goes on, and an input that doesn't read is named and skipped (#950)", async () => {
  const root = library([FIGHTS.gordie, FIGHTS.eternatus]);
  writeFileSync(path.join(path.dirname(startOf(root, GORDIE).files.input), "turn-4.json"), "{ not json");
  let solves = 0;
  const lines: string[] = [];
  const solve = async (input: SolveInput, statistics: (report: SolveReport) => void): Promise<SolveResult> => {
    solves++;
    if (input.save.waveIndex === 180) throw new Error("the harness fell over");
    return fake().solve(input, statistics);
  };
  await benchmark(root, SETS.slice(0, 1), solve, { version: PIN, recorder: RECORDER, print: line => lines.push(line) });
  assert.equal(solves, 2);
  assert.deepEqual(entries(root, GORDIE).at(-1)?.ended, { kind: "failed", failure: "the harness fell over" });
  assert.deepEqual(entries(root, ETERNATUS).at(-1)?.ended, { kind: "no_answer", code: "no_win" });
  assert.ok(lines.some(line => line.includes(`${GORDIE} turn 4`) && line.includes("doesn't read")), lines.join("\n"));
});

test("setting sets read from their file by name, each in oracle:battle's flags, and a set whose flags don't read is refused by name (#950)", () => {
  const read = settingSets(JSON.stringify({ default: {}, "beams alone": { budget: "5000", lds: "none", beams: "8:1,16:0.5" } }));
  assert.deepEqual(read, {
    ok: true,
    sets: [
      { name: "default", settings: { budget: { expansions: 3000, turns: 40 } } },
      {
        name: "beams alone",
        settings: {
          budget: { expansions: 5000, turns: 40 },
          lds: null,
          portfolio: [
            { width: 8, ours: 1 },
            { width: 16, ours: 0.5 },
          ],
        },
      },
    ],
  });
  assert.deepEqual(settingSets(JSON.stringify({ wide: { beams: "8" } })), { ok: false, why: 'setting set "wide": --beams 8 is not a list of width:weight' });
  assert.deepEqual(settingSets(JSON.stringify({ odd: { budget: 5000 } })), { ok: false, why: 'setting set "odd": budget is not a string' });
  assert.equal(settingSets("[]").ok, false);
  assert.equal(settingSets("{}").ok, false);
});

test("a save from an older game is carried to the pin as the re-check carries it, and one from a newer game is skipped with no entry (#950)", async () => {
  const OLDER = "Zu5cgKRQ0vigLcOhpJxYMUa0-w190-kieran";
  const NEWER = "Zu5cgKRQ0vigLcOhpJxYMUa0-w173-swimmers";
  const root = library([
    FIGHTS.gordie,
    save({ waveIndex: 190, trainer: { trainerType: 365, variant: 0 }, gameVersion: "1.12.1.3" }),
    save({ waveIndex: 173, trainer: { trainerType: 57, variant: 2 }, gameVersion: "1.13.0.0" }),
  ]);
  const carried: Record<string, boolean | undefined> = {};
  const lines: string[] = [];
  await benchmark(
    root,
    SETS.slice(0, 1),
    async (input, statistics, carry) => {
      carried[input.save.gameVersion] = carry.carried;
      return fake().solve(input, statistics);
    },
    { version: PIN, recorder: RECORDER, print: line => lines.push(line) },
  );
  assert.deepEqual(carried, { [PIN]: false, "1.12.1.3": true });
  assert.equal(entries(root, NEWER).length, 1);
  assert.ok(lines.some(line => line.includes(`${NEWER} turn 1: skipped`) && line.includes("1.13.0.0")), lines.join("\n"));
});

test("a statistics entry that can't be appended is reported and the benchmark goes on", async () => {
  const root = library([FIGHTS.gordie, FIGHTS.eternatus]);
  const statistics = path.join(path.dirname(startOf(root, GORDIE).files.input), "statistics.jsonl");
  rmSync(statistics);
  mkdirSync(statistics);
  const lines: string[] = [];

  await benchmark(root, SETS, fake().solve, { version: PIN, recorder: RECORDER, print: line => lines.push(line) });

  const unwritten = lines.filter(line => line.includes(", statistics entry not written: "));
  assert.deepEqual(
    unwritten.map(line => line.slice(0, line.indexOf(":"))),
    [`  ${GORDIE} turn 1, "default"`, `  ${GORDIE} turn 1, "total 40000"`],
  );
  assert.match(unwritten[0], /no answer \(no_win\), statistics entry not written: EISDIR/);
  assert.deepEqual(
    entries(root, ETERNATUS).map(e => e.benchmark?.set),
    [undefined, "default", "total 40000"],
  );
});
