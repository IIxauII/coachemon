import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

const GORDIE = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";

test("with capture on, a T1 solve that ends in an oracle line keeps its input and an oracle line readScript reads, under the fight's folder (#787, #936)", async () => {
  const dir = home();
  const input = t1();

  const result = await withCapture(solved(), dir, ON)({ input }, ctl());

  assert.equal((result as SolveResult).kind, "oracle_line");
  const stem = path.join(dir, "fights", GORDIE, "turn-1");
  assert.deepEqual(JSON.parse(readFileSync(`${stem}.json`, "utf8")), {
    live: input.live,
    save: input.save,
    liveExport: input.liveExport,
    cloneVersion: "1.12.1.3",
    budget: { expansions: 3000, turns: 40 },
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

const NONE = { kind: "no_answer", reason: { code: "no_win", lds: null, beams: [], unreplayed: [], dropped: 0 }, message: "no win" } as const;

/** A re-solve from the augmented export taken at `turn`'s decision. */
const midFight = (turn: number): SolveInput => {
  const input = t1();
  const exported = { ...input.save, party: [{ id: 1, hp: turn }] };
  return { ...input, save: exported, extras: { turn, rndState: `rng-${turn}` } as unknown as NonNullable<SolveInput["extras"]> };
};

test("a fight's first-turn solve and a mid-fight re-solve share its folder, the re-solve's augmented export and oracle line kept under the turn it started at (#937)", async () => {
  const dir = home();
  const input = midFight(5);
  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  await withCapture(solved(), dir, ON)({ input }, ctl());

  const fight = path.join(dir, "fights", GORDIE);
  assert.deepEqual(readdirSync(fight).sort(), ["turn-1.json", "turn-1.win.script.json", "turn-5.json", "turn-5.win.script.json"]);
  assert.deepEqual(JSON.parse(readFileSync(path.join(fight, "turn-5.json"), "utf8")), {
    live: input.live,
    save: input.save,
    extras: input.extras,
    liveExport: input.liveExport,
    cloneVersion: "1.12.1.3",
    budget: { expansions: 3000, turns: 40 },
  });
  assert.deepEqual(readScript(readFileSync(path.join(fight, "turn-5.win.script.json"), "utf8")).inputs, [{ kind: "move", move: "SURF", tera: false }]);
  assert.equal(JSON.parse(readFileSync(path.join(fight, "turn-1.json"), "utf8")).extras, undefined);
});

test("two re-solves from different turns are both kept, one that found no oracle line with its input alone (#937)", async () => {
  const dir = home();

  await withCapture(solved(NONE), dir, ON)({ input: midFight(3) }, ctl());
  await withCapture(solved(), dir, ON)({ input: midFight(7) }, ctl());

  const fight = path.join(dir, "fights", GORDIE);
  assert.deepEqual(readdirSync(fight).sort(), ["turn-3.json", "turn-7.json", "turn-7.win.script.json"]);
  assert.equal(JSON.parse(readFileSync(path.join(fight, "turn-3.json"), "utf8")).extras.rndState, "rng-3");
  assert.equal(JSON.parse(readFileSync(path.join(fight, "turn-7.json"), "utf8")).extras.rndState, "rng-7");
});

test("a re-solve whose augmented export lacks the turn keeps nothing, there being no turn to keep it under, and its answer stands (#937)", async () => {
  const dir = home();
  const input = { ...midFight(4), extras: { turn: null, unread: ["turn"] } as unknown as NonNullable<SolveInput["extras"]> };

  const result = await withCapture(solved(NONE), dir, ON)({ input }, ctl());

  assert.deepEqual(result, NONE);
  assert.equal(existsSync(path.join(dir, "fights")), false);
});

test("a solve that ends with no oracle line keeps its input alone (#787, #936)", async () => {
  const dir = home();

  await withCapture(solved(NONE), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(readdirSync(path.join(dir, "fights", GORDIE)), ["turn-1.json"]);
});

test("a repeat solve from the same turn replaces the input, and an earlier oracle line stays when the repeat finds none (#936)", async () => {
  const dir = home();
  const stem = path.join(dir, "fights", GORDIE, "turn-1");
  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  const repeat = { ...t1(), budget: { expansions: 40000, turns: 40 } };
  await withCapture(solved(NONE), dir, ON)({ input: repeat }, ctl());

  assert.deepEqual(JSON.parse(readFileSync(`${stem}.json`, "utf8")).budget, { expansions: 40000, turns: 40 });
  assert.deepEqual(readScript(readFileSync(`${stem}.win.script.json`, "utf8")).inputs, [{ kind: "move", move: "SURF", tera: false }]);
});

test("a repeat solve that finds an oracle line replaces the earlier one (#936)", async () => {
  const dir = home();
  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  const other: OracleLine = { ...LINE, steps: [{ turn: 1, input: { kind: "move", move: "THUNDER", tera: true }, checkpoint: { ours: [], foes: [] } }] };
  await withCapture(solved({ kind: "oracle_line", oracleLine: other }), dir, ON)({ input: t1() }, ctl());

  const script = readScript(readFileSync(path.join(dir, "fights", GORDIE, "turn-1.win.script.json"), "utf8"));
  assert.deepEqual(script.inputs, [{ kind: "move", move: "THUNDER", tera: true }]);
});

test("a solve cancelled before its oracle line came back keeps none (#787, #936)", async () => {
  const dir = home();
  const controller = new AbortController();
  const work: JobWork = async () => {
    controller.abort();
    return { kind: "oracle_line", oracleLine: LINE };
  };

  await withCapture(work, dir, ON)({ input: t1() }, { signal: controller.signal, progress: () => {} });

  assert.deepEqual(readdirSync(path.join(dir, "fights", GORDIE)), ["turn-1.json"]);
});

test("more than 12 fights are all kept, each in a folder of its own (#936)", async () => {
  const dir = home();

  for (let wave = 1; wave <= 13; wave++) await withCapture(solved(), dir, ON)({ input: t1({ waveIndex: wave }) }, ctl());

  const fights = readdirSync(path.join(dir, "fights")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  assert.deepEqual(fights, Array.from({ length: 13 }, (_, i) => `Zu5cgKRQ0vigLcOhpJxYMUa0-w${i + 1}-gordie`));
  for (const fight of fights) assert.deepEqual(readdirSync(path.join(dir, "fights", fight)).sort(), ["turn-1.json", "turn-1.win.script.json"]);
});

test("two solves of one fight share its folder, and another fight on the same wave gets its own (#936)", async () => {
  const dir = home();

  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());
  await withCapture(solved(), dir, ON)({ input: t1() }, ctl());
  await withCapture(solved(), dir, ON)({ input: t1({ trainer: { trainerType: 57, variant: 2 } }) }, ctl());

  assert.deepEqual(readdirSync(path.join(dir, "fights")).sort(), [GORDIE, "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-swimmers"]);
  assert.deepEqual(readdirSync(path.join(dir, "fights", GORDIE)).sort(), ["turn-1.json", "turn-1.win.script.json"]);
});

test("a home where no fight folder can be made still gets the solve's own answer (#787, #936)", async () => {
  const dir = home();
  writeFileSync(path.join(dir, "fights"), "");

  const result = await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(result, { kind: "oracle_line", oracleLine: LINE });
});

test("an oracle line that can't be written leaves no part of it behind, and the input and the answer stand (#787, #936)", async () => {
  const dir = home();
  const fight = path.join(dir, "fights", GORDIE);
  mkdirSync(path.join(fight, "turn-1.win.script.json"), { recursive: true });

  const result = await withCapture(solved(), dir, ON)({ input: t1() }, ctl());

  assert.deepEqual(result, { kind: "oracle_line", oracleLine: LINE });
  assert.deepEqual(readdirSync(fight).sort(), ["turn-1.json", "turn-1.win.script.json"]);
  assert.deepEqual(readdirSync(path.join(fight, "turn-1.win.script.json")), []);
  assert.equal(JSON.parse(readFileSync(path.join(fight, "turn-1.json"), "utf8")).cloneVersion, "1.12.1.3");
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

  const script = readScript(readFileSync(path.join(dir, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w173-swimmers", "turn-1.win.script.json"), "utf8"));
  assert.deepEqual(script.inputs, [double]);
});

test("a species twice on one side is left out of what live must show, which keys each mon by species (#787)", async () => {
  const dir = home();
  const line: OracleLine = {
    ...LINE,
    steps: [{ turn: 1, input: null, checkpoint: { ours: [mon(0, "PALKIA"), mon(1, "MAGIKARP"), mon(2, "MAGIKARP", { hp: 3 })], foes: [] } }],
  };

  await withCapture(solved({ kind: "oracle_line", oracleLine: line }), dir, ON)({ input: t1() }, ctl());

  const script = readScript(readFileSync(path.join(dir, "fights", GORDIE, "turn-1.win.script.json"), "utf8"));
  assert.deepEqual(Object.keys(script.known?.after[0].ours ?? {}), ["PALKIA"]);
});
