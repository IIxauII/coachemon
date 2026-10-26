import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { JobControl, JobWork } from "../jobs.ts";
import { withCapture } from "./capture.ts";
import { type Recorder, type SolveEnd, type SolveStart, solveStartsIn, statisticsEntriesIn } from "./fight-library.ts";
import type { Input, MonState, OracleLine, Script, SessionSave, SolveInput, SolveResult } from "./solver.ts";
import { solve } from "./solver.ts";
import type { SearchStatistics } from "./search.ts";
import { type SolveWork, solveJob } from "./solve-job.ts";

const ON = { COACHEMON_CAPTURE: "1" };

const home = () => mkdtempSync(path.join(tmpdir(), "coachemon-capture-"));

const ctl = (): JobControl => ({ signal: new AbortController().signal, progress: () => {} });

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

const t1 = (over: Partial<SessionSave> = {}): SolveInput => {
  const s = save(over);
  return {
    save: s,
    live: { wave: s.waveIndex, battleSeed: "U0QKEz8wJ8ea7832" },
    liveExport: { ...s, party: [{ id: 1 }] },
    cloneVersion: "1.12.1.3",
    budget: { expansions: 3000, turns: 40 },
  };
};

const mon = (slot: number, species: MonState["species"], over: Partial<MonState> = {}): MonState => ({
  slot,
  species,
  onField: slot === 0,
  hp: 100,
  maxHp: 200,
  status: "NONE",
  statStages: [0, 0, 0, 0, 0, 0, 0],
  tera: false,
  ...over,
});

const LINE: OracleLine = {
  seed: "Zu5cgKRQ0vigLcOhpJxYMUa0",
  wave: 180,
  gameVersion: "1.12.1.3",
  steps: [
    { turn: 1, input: { kind: "move", move: "SURF", tera: false }, checkpoint: { ours: [mon(0, "PALKIA")], foes: [mon(0, "LAPRAS", { hp: 0, onField: false, status: "FAINT" }), mon(1, "SNORLAX", { onField: true })] } },
    { turn: 2, input: null, checkpoint: { ours: [mon(0, "PALKIA", { hp: 90 })], foes: [mon(1, "SNORLAX", { hp: 0, status: "FAINT", bossBars: 0 })] } },
  ],
  receipt: [],
  luck: [],
};

const solved =
  (result: SolveResult = { kind: "oracle_line", oracleLine: LINE }): JobWork =>
  async () =>
    result;

const starts = (dir: string): SolveStart[] => solveStartsIn({ home: dir });

const oracleLines = (dir: string) => starts(dir).map(s => s.oracleLine);

const scriptOf = (dir: string): Script => starts(dir)[0].oracleLine as Script;

test("with capture on, a T1 solve that ends in an oracle line records its solve start with the oracle line it found, read back through the fight library (#787, #936)", async () => {
  const dir = home();
  const input = t1();

  const result = await withCapture(solved(), dir, ON)({ input }, ctl());

  assert.equal((result as SolveResult).kind, "oracle_line");
  const [start] = starts(dir);
  assert.deepEqual([start.fight.name, start.fight.wave, start.turn], ["gordie", 180, 1]);
  assert.deepEqual(start.input, {
    live: input.live,
    save: input.save,
    liveExport: input.liveExport,
    cloneVersion: "1.12.1.3",
    budget: { expansions: 3000, turns: 40 },
  });
  assert.deepEqual(start.oracleLine, {
    inputs: [{ kind: "move", move: "SURF", tera: false }],
    known: {
      outcome: "won",
      after: [
        {
          turn: 1,
          ours: { PALKIA: { onField: true, hp: 100, maxHp: 200, status: "NONE", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false } },
          foes: {
            LAPRAS: { onField: false, hp: 0, maxHp: 200, status: "FAINT", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false },
            SNORLAX: { onField: true, hp: 100, maxHp: 200, status: "NONE", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false },
          },
        },
        {
          turn: 2,
          ours: { PALKIA: { onField: true, hp: 90, maxHp: 200, status: "NONE", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false } },
          foes: { SNORLAX: { onField: false, hp: 0, maxHp: 200, status: "FAINT", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false, bossBars: 0 } },
        },
      ],
    },
  });
});

test("with capture unset, the same solve writes nothing under the home (#787)", async () => {
  const dir = home();

  const result = await withCapture(solved(), dir, {})({ input: t1() }, ctl());

  assert.equal((result as SolveResult).kind, "oracle_line");
  assert.deepEqual(readdirSync(dir), []);
});

const NONE = { kind: "no_answer", reason: { code: "no_win", lds: null, beams: [], unreplayed: [], dropped: 0 }, message: "no win" } as const;

/** A re-solve from the augmented export taken at `turn`'s decision. */
const midFight = (turn: number): SolveInput => {
  const input = t1();
  const exported = { ...input.save, party: [{ id: 1, hp: turn }] };
  return { ...input, save: exported, extras: { turn, rndState: `rng-${turn}` } as unknown as NonNullable<SolveInput["extras"]> };
};

test("a re-solve whose augmented export lacks the turn keeps nothing, there being no turn to keep it under, and its answer stands (#937)", async () => {
  const dir = home();
  const input = { ...midFight(4), extras: { turn: null, unread: ["turn"] } as unknown as NonNullable<SolveInput["extras"]> };

  const result = await withCapture(solved(NONE), dir, ON)({ input }, ctl());

  assert.deepEqual(result, NONE);
  assert.deepEqual(starts(dir), []);
  assert.deepEqual(statisticsEntriesIn({ home: dir }).entries, []);
});

test("a solve that ends with no oracle line keeps its input and no oracle line (#787, #936)", async () => {
  const dir = home();

  await withCapture(solved(NONE), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(
    starts(dir).map(s => [s.turn, "why" in s.input, s.oracleLine]),
    [[1, false, null]],
  );
});

test("a repeat solve from the same turn that finds no oracle line replaces the pair, leaving its new solve start with none (#969)", async () => {
  const dir = home();
  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  const repeat = { ...t1(), budget: { expansions: 40000, turns: 40 } };
  await withCapture(solved(NONE), dir, ON)({ input: repeat }, ctl());

  const [start] = starts(dir);
  assert.deepEqual([(start.input as SolveInput).budget, start.oracleLine], [{ expansions: 40000, turns: 40 }, null]);
});

test("a solve cancelled before its oracle line came back keeps none (#787, #936)", async () => {
  const dir = home();
  const controller = new AbortController();
  const work: JobWork = async () => {
    controller.abort();
    return { kind: "oracle_line", oracleLine: LINE };
  };

  await withCapture(work, dir, ON)({ input: t1() }, { signal: controller.signal, progress: () => {} });

  assert.deepEqual(oracleLines(dir), [null]);
});

test("a home where no fight folder can be made still gets the solve's own answer (#787, #936)", async () => {
  const dir = home();
  writeFileSync(path.join(dir, "fights"), "");

  const result = await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(result, { kind: "oracle_line", oracleLine: LINE });
});

/** A fight solved once without an oracle line, with a directory planted at `file`, its oracle line's or that one's part. */
async function plantedAt(file: (oracleLine: string) => string): Promise<string> {
  const dir = home();
  await withCapture(solved(NONE), dir, ON)({ input: t1() }, ctl());
  mkdirSync(file(starts(dir)[0].files.oracleLine));
  return dir;
}

test("an old oracle line that can't be removed still leaves the solve's own answer (#969)", async () => {
  const dir = await plantedAt(line => line);

  const result = await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(result, { kind: "oracle_line", oracleLine: LINE });
});

test("an oracle line that can't be written still leaves the solve's own answer (#787, #936)", async () => {
  const dir = await plantedAt(line => `${line}.part`);

  const result = await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(result, { kind: "oracle_line", oracleLine: LINE });
});

test("a trainer double's oracle line keeps each field slot's command and replacement as played, under the pair's name (#787, #936)", async () => {
  const dir = home();
  const double: Input = {
    kind: "double",
    commands: [{ kind: "move", move: "POWER_WHIP", tera: false, target: { side: "foes", field: 0 } }, null],
    replacements: [{ slot: 2, species: "ORICORIO", field: 1 }],
  };
  const line: OracleLine = { ...LINE, wave: 173, steps: [{ turn: 1, input: double, checkpoint: { ours: [], foes: [] } }] };

  await withCapture(solved({ kind: "oracle_line", oracleLine: line }), dir, ON)(
    { input: t1({ waveIndex: 173, trainer: { trainerType: 57, variant: 2 } }) },
    ctl(),
  );

  assert.deepEqual(starts(dir)[0].fight.name, "swimmers");
  assert.deepEqual(scriptOf(dir).inputs, [double]);
});

test("a species twice on one side is left out of what live must show, which keys each mon by species (#787)", async () => {
  const dir = home();
  const line: OracleLine = {
    ...LINE,
    steps: [{ turn: 1, input: null, checkpoint: { ours: [mon(0, "PALKIA"), mon(1, "MAGIKARP"), mon(2, "MAGIKARP", { hp: 3 })], foes: [] } }],
  };

  await withCapture(solved({ kind: "oracle_line", oracleLine: line }), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(Object.keys(scriptOf(dir).known?.after[0].ours ?? {}), ["PALKIA"]);
});

const AT = "2026-10-26T09:30:00.000Z";

const recorder = (): Recorder => ({ now: () => new Date(AT), pluginVersion: "1.83.0" });

const entries = (dir: string): unknown[] => statisticsEntriesIn({ home: dir }).entries.map(e => e.statistics);

test("a solve that ends in an oracle line appends one statistics entry: the turn it started from, when, how it ended, its settings and the versions (#938)", async () => {
  const dir = home();

  await withCapture(solved(), dir, ON, recorder())({ input: t1() }, ctl());

  assert.deepEqual(entries(dir), [
    {
      schema: 1,
      turn: 1,
      at: AT,
      ended: { kind: "oracle_line" },
      budget: { expansions: 3000, turns: 40 },
      lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 },
      portfolio: [
        { width: 8, ours: 1 },
        { width: 8, ours: 0.5 },
        { width: 16, ours: 0.5 },
      ],
      pluginVersion: "1.83.0",
      gameVersion: "1.12.1.3",
    },
  ]);
});

test("a failed solve gets an entry saying it failed and why, and still fails with its own error (#938)", async () => {
  const dir = home();
  const boom = new Error("the clone's worker died");
  const work: JobWork = async () => {
    throw boom;
  };

  await assert.rejects(withCapture(work, dir, ON, recorder())({ input: t1() }, ctl()), boom);

  assert.deepEqual((entries(dir) as Record<string, unknown>[]).map(e => e.ended), [{ kind: "failed", failure: "the clone's worker died" }]);
});

test("a cancelled solve gets its entry when cancelled, with the last progress it reported by then, and only that one (#938)", async () => {
  const dir = home();
  const controller = new AbortController();
  let atCancel: unknown[] = [];
  const work: JobWork = async (_args, { progress }) => {
    progress("searched 1,200 of 12,000 turns");
    controller.abort();
    atCancel = entries(dir);
    progress("searched 1,500 of 12,000 turns");
    return { kind: "oracle_line", oracleLine: LINE };
  };

  await withCapture(work, dir, ON, recorder())({ input: t1() }, { signal: controller.signal, progress: () => {} });

  const cancelled = { kind: "cancelled", progress: "searched 1,200 of 12,000 turns" };
  assert.deepEqual((atCancel as Record<string, unknown>[]).map(e => e.ended), [cancelled]);
  assert.deepEqual((entries(dir) as Record<string, unknown>[]).map(e => e.ended), [cancelled]);
});

test("a solve cancelled before it reported any progress says so (#938)", async () => {
  const dir = home();
  const controller = new AbortController();
  controller.abort();

  await withCapture(solved(NONE), dir, ON, recorder())({ input: t1() }, { signal: controller.signal, progress: () => {} });

  assert.deepEqual((entries(dir) as Record<string, unknown>[]).map(e => e.ended), [{ kind: "cancelled", progress: null }]);
});

test("a statistics file that can't be written leaves the solve's answer and its error as they were (#938)", async () => {
  const dir = home();
  mkdirSync(path.join(dir, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie", "statistics.jsonl"), { recursive: true });
  const boom = new Error("the clone's worker died");

  const result = await withCapture(solved(), dir, ON, recorder())({ input: t1() }, ctl());
  const won = oracleLines(dir);
  await assert.rejects(
    withCapture(async () => Promise.reject(boom), dir, ON, recorder())({ input: t1() }, ctl()),
    boom,
  );

  assert.deepEqual(result, { kind: "oracle_line", oracleLine: LINE });
  assert.equal(won.length === 1 && won[0] !== null && "inputs" in won[0], true, "the win's oracle line is kept");
  assert.deepEqual(oracleLines(dir), [null], "the failed repeat replaced the pair");
});

test("an answer no entry can be made from is still handed back as it came (#938)", async () => {
  const dir = home();

  const result = await withCapture(async () => undefined, dir, ON, recorder())({ input: t1() }, ctl());

  assert.equal(result, undefined);
  assert.deepEqual(oracleLines(dir), [null]);
  assert.deepEqual(entries(dir), []);
});

test("recording passes each progress line through as reported and hands back the solve's own answer (#938)", async () => {
  const dir = home();
  const lines: string[] = [];
  const answer: SolveResult = { kind: "oracle_line", oracleLine: LINE };
  const work: JobWork = async (_args, { progress }) => {
    progress("loading the fight in the clone and starting the search's workers");
    progress("searched 3,000 of 12,000 turns, slowly: 1 of 4 workers polls slowly");
    return answer;
  };

  const result = await withCapture(work, dir, ON, recorder())({ input: t1() }, { signal: new AbortController().signal, progress: line => lines.push(line) });

  assert.equal(result, answer);
  assert.deepEqual(lines, ["loading the fight in the clone and starting the search's workers", "searched 3,000 of 12,000 turns, slowly: 1 of 4 workers polls slowly"]);
});

test("a solve's entry carries how its search went, as the solve handed it on, and its answer is the solve's own (#940)", async () => {
  const dir = home();
  const search: SearchStatistics = {
    found: { stage: "beam", index: 1, turn: 5, spent: 16 },
    stages: [
      { stage: "lds", ended: "budget", spent: 2, ms: 30 },
      { stage: "beam", index: 0, ended: "emptied", spent: 4, ms: 55 },
      { stage: "beam", index: 1, ended: "won", spent: 10, ms: 310 },
    ],
    dropped: { "the turn timed out": 3 },
    replays: { ran: 2, failed: { lost: 1 }, ms: 420 },
    merged: 5,
    stalled: 1,
  };
  const answer: SolveResult = { kind: "oracle_line", oracleLine: LINE };
  const work: SolveWork = async (_args, { statistics }) => {
    statistics?.({ startup: { gateMs: 0, loadMs: 0, pool: { warm: true, ms: 0 } }, pool: null, turnTimes: null, cores: 1, search });
    return answer;
  };

  const result = await withCapture(work, dir, ON, recorder())({ input: t1() }, ctl());

  assert.equal(result, answer);
  assert.deepEqual((entries(dir) as Record<string, unknown>[]).map(e => [e.ended, e.search]), [[{ kind: "oracle_line" }, search]]);
});

test("a solve that never searched gets an entry with no search in it (#940)", async () => {
  const dir = home();

  await withCapture(solved(NONE), dir, ON, recorder())({ input: t1() }, ctl());

  assert.equal("search" in (entries(dir)[0] as object), false);
});

test("a solve the gate refuses still appends its entry, with the gate's time and no load check or pool (#942)", async () => {
  const dir = home();
  const work = solveJob(dir, {
    setUp: async () => ({ kind: "clone", gameVersion: "1.12.1.3", dir: path.join(dir, "clone") }),
    runIn: () => async () => assert.fail("the gate let it through"),
    solve: (input, deps) => solve(input, { ...deps, clock: { now: () => 0 }, cores: 8 }),
  });

  const result = await withCapture(work, dir, ON, recorder())({ input: t1() }, ctl());

  assert.equal((result as SolveResult).kind === "no_answer" && (result as { reason: { code: string } }).reason.code, "not_rechecked");
  const [entry] = entries(dir) as Record<string, unknown>[];
  assert.deepEqual([entry.ended, entry.startup, entry.pool, entry.cores], [{ kind: "no_answer", code: "not_rechecked" }, { gateMs: 0, loadMs: null, pool: null }, null, 8]);
});

test("a solve's startup, its pool's final stats, its turns' restore and play times and the machine's cores go into its entry as the solve reported them (#942, #943)", async () => {
  const dir = home();
  const report = {
    startup: { gateMs: 1, loadMs: 1_840, pool: { warm: false, ms: 6_210 } },
    pool: { size: 4, died: 1, lastDeath: "the worker ran out of heap", peakHeapMb: 812, heapLimitMb: 4096, slowPoll: null, realClock: "the page's timers were not found" },
    turnTimes: {
      restore: { count: 3, totalMs: 61.5, p50Ms: 20.1, p95Ms: 22, maxMs: 22 },
      play: { count: 3, totalMs: 702, p50Ms: 230, p95Ms: 260, maxMs: 260 },
    },
    cores: 8,
  };
  const work: SolveWork = async (_args, { statistics }) => {
    statistics?.(report);
    return { kind: "oracle_line", oracleLine: LINE };
  };

  await withCapture(work, dir, ON, recorder())({ input: t1() }, ctl());

  const [entry] = entries(dir) as Record<string, unknown>[];
  assert.deepEqual(
    [entry.ended, entry.startup, entry.pool, entry.turnTimes, entry.cores],
    [{ kind: "oracle_line" }, report.startup, report.pool, report.turnTimes, 8],
  );
});

test("a solve cancelled while it loads still writes the stages it had reached into its entry (#942)", async () => {
  const dir = home();
  const cancel = new AbortController();
  const work = solveJob(dir, {
    setUp: async () => ({ kind: "clone", gameVersion: "1.12.1.3", dir: path.join(dir, "clone") }),
    runIn: () => async () => {
      cancel.abort();
      return { out: undefined };
    },
    solve: (input, deps) => solve(input, { ...deps, unchecked: true, clock: { now: () => 0 }, cores: 8 }),
  });

  await withCapture(work, dir, ON, recorder())({ input: t1() }, { signal: cancel.signal, progress: () => {} });

  const [entry] = entries(dir) as Record<string, unknown>[];
  assert.deepEqual([(entry.ended as SolveEnd).kind, entry.startup, entry.pool, entry.cores], ["cancelled", { gateMs: 0, loadMs: null, pool: null }, null, 8]);
});
