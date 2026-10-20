import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { JobControl, JobWork } from "../jobs.ts";
import { withCapture } from "./capture.ts";
import type { Input, MonState, OracleLine, SessionSave, SolveInput, SolveResult } from "./solver.ts";
import { readScript } from "./solver.ts";

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

test("with capture on, a T1 solve that ends in a line keeps its input and a line readScript reads (#787)", async () => {
  const dir = home();
  const input = t1();

  const result = await withCapture(solved(), dir, ON)({ input }, ctl());

  assert.equal((result as SolveResult).kind, "oracle_line");
  const stem = path.join(dir, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie");
  assert.deepEqual(JSON.parse(readFileSync(`${stem}.json`, "utf8")), {
    live: input.live,
    save: input.save,
    liveExport: input.liveExport,
    cloneVersion: "1.12.1.3",
  });
  const script = readScript(readFileSync(`${stem}.win.script.json`, "utf8"));
  assert.deepEqual(script, {
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

test("a mid-fight solve, from the export and its extras, writes nothing even with capture on (#787)", async () => {
  const dir = home();
  const input = { ...t1(), extras: {} as NonNullable<SolveInput["extras"]> };

  await withCapture(solved(), dir, ON)({ input }, ctl());

  assert.equal(existsSync(path.join(dir, "fights")), false);
});

test("a solve that ends with no line keeps its input alone, dropping an earlier solve's line of that fight (#787)", async () => {
  const dir = home();
  const stem = path.join(dir, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie");
  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  const none = { kind: "no_answer", reason: { code: "no_win", lds: null, beams: [], unreplayed: [], dropped: 0 }, message: "no win" } as const;
  await withCapture(solved(none), dir, ON)({ input: t1() }, ctl());

  assert.equal(existsSync(`${stem}.json`), true);
  assert.equal(existsSync(`${stem}.win.script.json`), false);
});

test("a solve cancelled before its line came back keeps no line (#787)", async () => {
  const dir = home();
  const controller = new AbortController();
  const work: JobWork = async () => {
    controller.abort();
    return { kind: "oracle_line", oracleLine: LINE };
  };

  await withCapture(work, dir, ON)({ input: t1() }, { signal: controller.signal, progress: () => {} });

  assert.deepEqual(readdirSync(path.join(dir, "fights")), ["Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie.json"]);
});

test("after a 13th kept fight, the oldest fight's input and line are gone and 12 fights remain (#787)", async () => {
  const dir = home();
  const fights = path.join(dir, "fights");
  const hourAgo = Date.now() / 1000 - 3600;
  for (let wave = 1; wave <= 13; wave++) {
    await withCapture(solved(), dir, ON)({ input: t1({ waveIndex: wave }) }, ctl());
    for (const name of readdirSync(fights).filter(n => n.includes(`-w${wave}-`))) utimesSync(path.join(fights, name), hourAgo + wave, hourAgo + wave);
  }

  const left = readdirSync(fights);
  assert.equal(left.length, 24);
  assert.equal(left.some(n => n.includes("-w1-")), false);
  assert.equal(left.filter(n => n.includes("-w2-")).length, 2);
});

test("a trainer double's line keeps each field slot's command and replacement as played, under the pair's name (#787)", async () => {
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

  const script = readScript(readFileSync(path.join(dir, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w173-swimmers.win.script.json"), "utf8"));
  assert.deepEqual(script.inputs, [double]);
});

test("a species twice on one side is left out of what live must show, which keys each mon by species (#787)", async () => {
  const dir = home();
  const line: OracleLine = {
    ...LINE,
    steps: [{ turn: 1, input: null, checkpoint: { ours: [mon(0, "PALKIA"), mon(1, "MAGIKARP"), mon(2, "MAGIKARP", { hp: 3 })], foes: [] } }],
  };

  await withCapture(solved({ kind: "oracle_line", oracleLine: line }), dir, ON)({ input: t1() }, ctl());

  const script = readScript(readFileSync(path.join(dir, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie.win.script.json"), "utf8"));
  assert.deepEqual(Object.keys(script.known?.after[0].ours ?? {}), ["PALKIA"]);
});
