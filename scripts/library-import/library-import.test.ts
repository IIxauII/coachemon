import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { type Recorder, recordSolveStart, solveStartsIn, statisticsEntriesIn, type Where } from "../../src/solver/fight-library.ts";
import { noAnswer } from "../../src/solver/no-answer.ts";
import type { ReplayResult } from "../../src/solver/oracle-line.ts";
import type { Script, SessionSave, SolveInput } from "../../src/solver/solver.ts";
import type { Given } from "../library-replay/library-replay.ts";
import { importFights, waiting } from "./library-import.ts";

const GORDIE = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";
const SWIMMERS = "Ab12-w173-swimmers";
const AT = new Date("2026-10-26T09:30:00.000Z");
const PIN = "1.12.2.0";

const RECORDER: Recorder = { now: () => new Date("2026-10-25T20:00:00.000Z"), pluginVersion: "1.89.0" };

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

const input = (turn: number, budget = 12000, over: Partial<SessionSave> = {}): SolveInput => ({
  live: { wave: 180, battleSeed: "U0QKEz8wJ8ea7832" },
  save: save(over),
  ...(turn === 1 ? {} : { extras: { turn } as unknown as NonNullable<SolveInput["extras"]> }),
  cloneVersion: PIN,
  budget: { expansions: budget, turns: 40 },
});

const swimmers = (turn: number) => input(turn, 12000, { seed: "Ab12", waveIndex: 173, trainer: { trainerType: 57, variant: 2 } });

const LINE: Script = { inputs: [{ kind: "move", move: "SURF", tera: false }], known: { outcome: "won", after: [{ turn: 1 }] } };

/** A solve recorded as `COACHEMON_CAPTURE=1` records it: one that found `oracleLine` won, any other found none. */
const record = (where: Where, solve: SolveInput, oracleLine?: Script) =>
  recordSolveStart(where, solve, RECORDER)?.finish({ ended: oracleLine ? { kind: "oracle_line" } : { kind: "no_answer", code: "no_win" }, report: null, oracleLine });

const won: ReplayResult = {
  kind: "replayed",
  replay: { confidence: "replay", outcome: "won", steps: [{ turn: 1, input: null, checkpoint: { ours: [], foes: [] } }], receipt: [], luck: [] },
};

/** A replay at the pin that answers `answer`, and the turns it was asked to replay. */
const fake = (answer: (given: Given) => ReplayResult = () => won) => {
  const calls: { turn: number; script: Script }[] = [];
  return {
    calls,
    version: PIN,
    replay: async (given: Given, script: Script) => {
      calls.push({ turn: (given.extras as { turn?: number } | undefined)?.turn ?? 1, script });
      return answer(given);
    },
  };
};

function setUp() {
  const root = mkdtempSync(path.join(tmpdir(), "coachemon-library-import-"));
  const home = path.join(root, "home");
  const library = path.join(root, "library");
  mkdirSync(library);
  /** Each solve start in the library, as `[turn, budget, oracle line]`. */
  const held = () => solveStartsIn({ library }).map(s => [s.turn, (s.input as SolveInput).budget.expansions, s.oracleLine]);
  const entries = () => statisticsEntriesIn({ library }).entries.map(e => [e.statistics.turn, e.statistics.ended.kind]);
  return { home, library, held, entries };
}

test("a fight the library doesn't hold is copied in whole (#944)", async () => {
  const { home, library, held, entries } = setUp();
  record({ home }, input(1), LINE);

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(held(), [[1, 12000, LINE]]);
  assert.deepEqual(entries(), [[1, "oracle_line"]]);
  assert.deepEqual(out.imported, [
    { fight: GORDIE, merged: false, added: ["turn-1.json", "turn-1.win.script.json"], statistics: 1, differs: [], unread: [], failed: [], nicknames: [] },
  ]);
});

test("a fight the library holds gains the new solves' inputs and oracle lines, and its statistics entries are appended once (#944)", async () => {
  const { home, library, held, entries } = setUp();
  record({ library }, input(1), LINE);
  record({ home }, input(1), LINE);
  record({ home }, input(1, 40000));
  record({ home }, input(5), LINE);

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(
    held(),
    [
      [1, 12000, LINE],
      [5, 12000, LINE],
    ],
    "the same position solved again under another budget keeps the library's pair",
  );
  assert.deepEqual(entries(), [
    [1, "oracle_line"],
    [1, "no_answer"],
    [5, "oracle_line"],
  ]);
  assert.deepEqual(out.imported, [
    { fight: GORDIE, merged: true, added: ["turn-5.json", "turn-5.win.script.json"], statistics: 2, differs: [], unread: [], failed: [], nicknames: [] },
  ]);
});

test("an oracle line joins the library's input only when it was solved from that same position (#944)", async () => {
  const { home, library, held } = setUp();
  record({ library }, input(1));
  record({ library }, input(5));
  record({ home }, input(1, 40000), LINE);
  record({ home }, input(5, 12000, { party: [{ id: 1, weather: "RAIN" }] }), LINE);

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(held(), [
    [1, 12000, LINE],
    [5, 12000, null],
  ]);
  assert.deepEqual(out.imported, [
    { fight: GORDIE, merged: true, added: ["turn-1.win.script.json"], statistics: 2, differs: ["turn-5"], unread: [], failed: [], nicknames: [] },
  ]);
});

test("each imported fight moves whole to this import's folder under the home's imported fights, and a second import finds none (#944)", async () => {
  const { home, library } = setUp();
  record({ home }, input(1), LINE);
  record({ home }, swimmers(1));

  const { asideUnder } = await importFights(home, library, AT, fake());

  const aside = path.join(home, "fights-imported", "2026-10-26T09-30-00.000Z");
  assert.equal(asideUnder, path.join(home, "fights-imported"));
  assert.equal(waiting(home), 0);
  assert.deepEqual(
    solveStartsIn({ library: aside }).map(s => [s.fight.folder, s.oracleLine]),
    [
      [SWIMMERS, null],
      [GORDIE, LINE],
    ],
  );
  assert.deepEqual(
    statisticsEntriesIn({ library: aside }).entries.map(e => [e.fight.folder, e.statistics.ended.kind]),
    [
      [SWIMMERS, "no_answer"],
      [GORDIE, "oracle_line"],
    ],
  );
  assert.deepEqual(await importFights(home, library, new Date("2026-10-26T10:00:00.000Z"), fake()), { imported: [], asideUnder });
  assert.deepEqual(readdirSync(asideUnder), ["2026-10-26T09-30-00.000Z"]);
});

test("the waiting count is the home's fight folders, and a home that never recorded one has none to wait or import (#944)", async () => {
  const { home, library } = setUp();
  assert.equal(waiting(home), 0);
  assert.deepEqual((await importFights(home, library, AT, fake())).imported, []);

  record({ home }, input(1));
  record({ home }, swimmers(1));
  writeFileSync(path.join(home, "fights", ".DS_Store"), "");
  assert.equal(waiting(home), 2);

  assert.deepEqual(
    (await importFights(home, library, AT, fake())).imported.map(i => i.fight),
    [SWIMMERS, GORDIE],
  );
  assert.equal(waiting(home), 0);
});

test("a newly imported oracle line that fails its replay is listed with how it failed, and its fight is imported anyway (#945)", async () => {
  const { home, library, held } = setUp();
  record({ home }, input(1), LINE);
  record({ home }, input(5), LINE);
  const replay = fake(given =>
    given.extras === undefined ? won : noAnswer({ code: "known_turn_missed", misses: ["turn 6: Gordie's Lycanroc has 12 HP, not 40"] }),
  );

  const out = await importFights(home, library, AT, replay);

  assert.deepEqual(
    replay.calls.map(c => c.turn),
    [1, 5],
  );
  assert.deepEqual(held(), [
    [1, 12000, LINE],
    [5, 12000, LINE],
  ]);
  assert.deepEqual(
    out.imported.map(i => [i.fight, i.failed]),
    [[GORDIE, [{ turn: 5, outcome: { kind: "plays_differently", checkpoint: 6, missed: "Gordie's Lycanroc has 12 HP, not 40" } }]]],
  );
  assert.equal(waiting(home), 0);
});

test("only the oracle lines this import adds are replayed, and a replay that throws fails its line, not the import (#945)", async () => {
  const { home, library } = setUp();
  record({ library }, input(1), LINE);
  record({ home }, input(1), LINE);
  record({ home }, input(5), LINE);
  const calls: unknown[] = [];
  const replay = async (given: Given) => {
    calls.push(given.extras);
    throw new Error("the clone's vitest exited 1");
  };

  const out = await importFights(home, library, AT, { version: PIN, replay });

  assert.equal(calls.length, 1);
  assert.deepEqual(
    out.imported.map(i => [i.added, i.failed]),
    [[["turn-5.json", "turn-5.win.script.json"], [{ turn: 5, outcome: { kind: "doesnt_load", why: "the replay threw: the clone's vitest exited 1" } }]]],
  );
});

test("a waiting solve start that doesn't read is left out of the library and listed, and stays aside with its fight (#944)", async () => {
  const { home, library, held } = setUp();
  record({ home }, input(1), LINE);
  record({ home }, input(5), LINE);
  const [, fifth] = solveStartsIn({ home });
  writeFileSync(fifth.files.input, "{ not json");

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(held(), [[1, 12000, LINE]]);
  assert.deepEqual(out.imported[0].added, ["turn-1.json", "turn-1.win.script.json"]);
  assert.match(out.imported[0].unread.join("\n"), /^turn-5: turn-5\.json doesn't read: /);
  assert.deepEqual(
    solveStartsIn({ library: path.join(home, "fights-imported", "2026-10-26T09-30-00.000Z") }).map(s => s.turn),
    [1, 5],
  );
});

const nicknamed = (turn: number, nicknames: { ours?: string; foe?: string }) => {
  const kept = input(turn);
  return {
    ...kept,
    save: {
      ...kept.save,
      party: [{ id: 1, species: 25, ...(nicknames.ours && { nickname: nicknames.ours }) }, { id: 2, species: 134 }],
      enemyParty: [{ id: 3, species: 745, ...(nicknames.foe && { nickname: nicknames.foe }) }],
    },
  };
};

test("a fight holding a nicknamed Pokémon lists the nickname as the game shows it, and a fight without one lists none (#945)", async () => {
  const { home, library } = setUp();
  record({ home }, nicknamed(1, { ours: "U3Bhcmt5" }));
  record({ home }, nicknamed(5, { ours: "U3Bhcmt5", foe: "RmzDtmNrY2hlbg==" }));
  record({ home }, swimmers(1));

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(
    out.imported.map(i => [i.fight, i.nicknames]),
    [
      [SWIMMERS, []],
      [GORDIE, ["Flöckchen", "Sparky"]],
    ],
  );
});

test("a nickname the game couldn't decode is listed as the fight keeps it (#945)", async () => {
  const { home, library } = setUp();
  record({ home }, nicknamed(1, { ours: "Sparky!" }));

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(
    out.imported.map(i => i.nicknames),
    [["Sparky!"]],
  );
});
