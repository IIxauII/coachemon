import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { noAnswer } from "../../src/solver/no-answer.ts";
import type { ReplayResult } from "../../src/solver/oracle-line.ts";
import type { Script } from "../../src/solver/script.ts";
import type { Given } from "../library-replay/library-replay.ts";
import { importFights, waiting } from "./library-import.ts";

const FIGHT = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";
const AT = new Date("2026-10-26T09:30:00.000Z");
const PIN = "1.12.2.0";

const input = (turn: number, budget = 12000) => ({
  live: { wave: 180, battleSeed: "U0QKEz8wJ8ea7832" },
  save: { seed: "Zu5cgKRQ0vigLcOhpJxYMUa0", waveIndex: 180, gameVersion: PIN },
  ...(turn === 1 ? {} : { extras: { turn } }),
  cloneVersion: "1.12.2.0",
  budget: { expansions: budget, turns: 40 },
});
const LINE = { inputs: [{ kind: "move", move: "SURF", tera: false }], known: { outcome: "won", after: [{ turn: 1 }] } };
const entry = (turn: number, at: string, kind = "oracle_line") => ({ schema: 1, turn, at, ended: { kind } });

/** A fight folder as `COACHEMON_CAPTURE=1` leaves it: `turn-<n>.json`, `turn-<n>.win.script.json` and `statistics.jsonl`. */
function fightFolder(dir: string, files: Record<string, unknown>, statistics: unknown[] = []) {
  mkdirSync(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) writeFileSync(path.join(dir, name), JSON.stringify(value) + "\n");
  if (statistics.length > 0) writeFileSync(path.join(dir, "statistics.jsonl"), statistics.map(s => JSON.stringify(s) + "\n").join(""));
}

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
  const read = (...parts: string[]) => readFileSync(path.join(...parts), "utf8");
  const json = (...parts: string[]) => JSON.parse(read(...parts));
  const lines = (...parts: string[]) =>
    read(...parts)
      .split("\n")
      .filter(l => l !== "")
      .map(l => JSON.parse(l));
  return { home, library, read, json, lines };
}

test("a fight the library doesn't hold is copied in whole (#944)", async () => {
  const { home, library, json, lines } = setUp();
  fightFolder(path.join(home, "fights", FIGHT), { "turn-1.json": input(1), "turn-1.win.script.json": LINE }, [entry(1, "2026-10-25T20:00:00.000Z")]);

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(readdirSync(path.join(library, FIGHT)).sort(), ["statistics.jsonl", "turn-1.json", "turn-1.win.script.json"]);
  assert.deepEqual(json(library, FIGHT, "turn-1.json"), input(1));
  assert.deepEqual(json(library, FIGHT, "turn-1.win.script.json"), LINE);
  assert.deepEqual(lines(library, FIGHT, "statistics.jsonl"), [entry(1, "2026-10-25T20:00:00.000Z")]);
  assert.deepEqual(out.imported, [{ fight: FIGHT, merged: false, added: ["turn-1.json", "turn-1.win.script.json"], statistics: 1, differs: [], failed: [], nicknames: [] }]);
});

test("a fight the library holds gains the new solves' inputs and oracle lines, and its statistics entries are appended once (#944)", async () => {
  const { home, library, json, lines } = setUp();
  const first = entry(1, "2026-10-24T20:00:00.000Z");
  fightFolder(path.join(library, FIGHT), { "turn-1.json": input(1), "turn-1.win.script.json": LINE }, [first]);
  const [again, resolve] = [entry(1, "2026-10-25T20:00:00.000Z", "no_answer"), entry(5, "2026-10-25T20:10:00.000Z")];
  fightFolder(path.join(home, "fights", FIGHT), { "turn-1.json": input(1, 40000), "turn-5.json": input(5), "turn-5.win.script.json": LINE }, [first, again, resolve]);

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(readdirSync(path.join(library, FIGHT)).sort(), ["statistics.jsonl", "turn-1.json", "turn-1.win.script.json", "turn-5.json", "turn-5.win.script.json"]);
  assert.deepEqual(json(library, FIGHT, "turn-1.json"), input(1), "the same position solved again under another budget keeps the library's input");
  assert.deepEqual(json(library, FIGHT, "turn-5.json"), input(5));
  assert.deepEqual(lines(library, FIGHT, "statistics.jsonl"), [first, again, resolve]);
  assert.deepEqual(out.imported, [{ fight: FIGHT, merged: true, added: ["turn-5.json", "turn-5.win.script.json"], statistics: 2, differs: [], failed: [], nicknames: [] }]);
});

test("an oracle line joins the library's input only when it was solved from that same position (#944)", async () => {
  const { home, library, json } = setUp();
  const elsewhere = { ...input(5), extras: { turn: 5, weather: "RAIN" } };
  fightFolder(path.join(library, FIGHT), { "turn-1.json": input(1), "turn-5.json": input(5) });
  fightFolder(path.join(home, "fights", FIGHT), {
    "turn-1.json": input(1, 40000),
    "turn-1.win.script.json": LINE,
    "turn-5.json": elsewhere,
    "turn-5.win.script.json": LINE,
  });

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(readdirSync(path.join(library, FIGHT)).sort(), ["turn-1.json", "turn-1.win.script.json", "turn-5.json"]);
  assert.deepEqual(json(library, FIGHT, "turn-5.json"), input(5));
  assert.deepEqual(out.imported, [{ fight: FIGHT, merged: true, added: ["turn-1.win.script.json"], statistics: 0, differs: ["turn-5"], failed: [], nicknames: [] }]);
});

test("each imported fight moves whole to this import's folder under the home's imported fights, and a second import finds none (#944)", async () => {
  const { home, library, json, lines } = setUp();
  const other = "Ab12-w173-swimmers";
  fightFolder(path.join(home, "fights", FIGHT), { "turn-1.json": input(1), "turn-1.win.script.json": LINE }, [entry(1, "2026-10-25T20:00:00.000Z")]);
  fightFolder(path.join(home, "fights", other), { "turn-1.json": input(1) }, [entry(1, "2026-10-25T21:00:00.000Z", "no_answer")]);

  await importFights(home, library, AT, fake());

  const aside = path.join(home, "fights-imported", "2026-10-26T09-30-00.000Z");
  assert.deepEqual(readdirSync(path.join(home, "fights")), []);
  assert.deepEqual(readdirSync(aside).sort(), [other, FIGHT]);
  assert.deepEqual(json(aside, FIGHT, "turn-1.win.script.json"), LINE);
  assert.deepEqual(lines(aside, other, "statistics.jsonl"), [entry(1, "2026-10-25T21:00:00.000Z", "no_answer")]);
  assert.deepEqual(await importFights(home, library, new Date("2026-10-26T10:00:00.000Z"), fake()), { imported: [] });
  assert.equal(existsSync(path.join(home, "fights-imported", "2026-10-26T10-00-00.000Z")), false);
});

test("the waiting count is the home's fight folders, and a home that never recorded one has none to wait or import (#944)", async () => {
  const { home, library } = setUp();
  assert.equal(waiting(home), 0);
  assert.deepEqual(await importFights(home, library, AT, fake()), { imported: [] });

  fightFolder(path.join(home, "fights", FIGHT), { "turn-1.json": input(1) });
  fightFolder(path.join(home, "fights", "Ab12-w173-swimmers"), { "turn-1.json": input(1) });
  writeFileSync(path.join(home, "fights", ".DS_Store"), "");
  assert.equal(waiting(home), 2);

  assert.deepEqual((await importFights(home, library, AT, fake())).imported.map(i => i.fight), ["Ab12-w173-swimmers", FIGHT]);
  assert.equal(waiting(home), 0);
});

test("a newly imported oracle line that fails its replay is listed with how it failed, and its fight is imported anyway (#945)", async () => {
  const { home, library, json } = setUp();
  fightFolder(path.join(home, "fights", FIGHT), {
    "turn-1.json": input(1),
    "turn-1.win.script.json": LINE,
    "turn-5.json": input(5),
    "turn-5.win.script.json": LINE,
  });
  const replay = fake(given =>
    given.extras === undefined ? won : noAnswer({ code: "known_turn_missed", misses: ["turn 6: Gordie's Lycanroc has 12 HP, not 40"] }),
  );

  const out = await importFights(home, library, AT, replay);

  assert.deepEqual(replay.calls.map(c => c.turn), [1, 5]);
  assert.deepEqual(json(library, FIGHT, "turn-5.win.script.json"), LINE);
  assert.deepEqual(out.imported.map(i => [i.fight, i.failed]), [
    [FIGHT, [{ turn: 5, outcome: { kind: "plays_differently", checkpoint: 6, missed: "Gordie's Lycanroc has 12 HP, not 40" } }]],
  ]);
  assert.deepEqual(readdirSync(path.join(home, "fights")), []);
});

test("only the oracle lines this import adds are replayed, and a replay that throws fails its line, not the import (#945)", async () => {
  const { home, library } = setUp();
  fightFolder(path.join(library, FIGHT), { "turn-1.json": input(1), "turn-1.win.script.json": LINE });
  fightFolder(path.join(home, "fights", FIGHT), { "turn-1.json": input(1), "turn-1.win.script.json": LINE, "turn-5.json": input(5), "turn-5.win.script.json": LINE });
  const calls: unknown[] = [];
  const replay = async (given: Given) => {
    calls.push(given.extras);
    throw new Error("the clone's vitest exited 1");
  };

  const out = await importFights(home, library, AT, { version: PIN, replay });

  assert.equal(calls.length, 1);
  assert.deepEqual(out.imported.map(i => [i.added, i.failed]), [
    [["turn-5.json", "turn-5.win.script.json"], [{ turn: 5, outcome: { kind: "doesnt_load", why: "the replay threw: the clone's vitest exited 1" } }]],
  ]);
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
  const other = "Ab12-w173-swimmers";
  fightFolder(path.join(home, "fights", FIGHT), {
    "turn-1.json": nicknamed(1, { ours: "U3Bhcmt5" }),
    "turn-5.json": nicknamed(5, { ours: "U3Bhcmt5", foe: "RmzDtmNrY2hlbg==" }),
  });
  fightFolder(path.join(home, "fights", other), { "turn-1.json": nicknamed(1, {}) });

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(out.imported.map(i => [i.fight, i.nicknames]), [
    [other, []],
    [FIGHT, ["Flöckchen", "Sparky"]],
  ]);
});

test("a nickname the game couldn't decode is listed as the fight keeps it (#945)", async () => {
  const { home, library } = setUp();
  fightFolder(path.join(home, "fights", FIGHT), { "turn-1.json": nicknamed(1, { ours: "Sparky!" }) });

  const out = await importFights(home, library, AT, fake());

  assert.deepEqual(out.imported.map(i => i.nicknames), [["Sparky!"]]);
});
