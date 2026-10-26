import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { recordSolveStart, solveStartsIn } from "../../src/solver/fight-library.ts";
import type { Script, SessionSave, SolveInput } from "../../src/solver/solver.ts";
import { type KnownFight, promote, type PromoteDeps } from "./promote.ts";

const PIN = "1.12.1.3";

const save: SessionSave = {
  gameVersion: PIN,
  gameMode: 0,
  seed: "Zu5cgKRQ0vigLcOhpJxYMUa0",
  waveIndex: 180,
  battleType: 1,
  trainer: { trainerType: 261, variant: 0 },
  party: [],
  enemyParty: [],
};
const KEPT: SolveInput = {
  live: { wave: 180, battleSeed: "U0QKEz8wJ8ea7832" },
  save,
  liveExport: { ...save, party: [{ id: 1 }] },
  cloneVersion: PIN,
  budget: { expansions: 3000, turns: 40 },
};
const LINE: Script = { inputs: [{ kind: "move", move: "SURF", tera: false }], known: { outcome: "won", after: [{ turn: 1 }] } };
const BEFORE: KnownFight[] = [{ stem: "drayton-w188", name: "Drayton W188" }];

const midFight = (turn: number): SolveInput => ({ ...KEPT, extras: { turn } as unknown as NonNullable<SolveInput["extras"]> });

/** Records `input`'s solve into `home`, as `COACHEMON_CAPTURE=1` does, with `line` as the oracle line it found, if any; its input file. */
function recorded(home: string, input: SolveInput, line: Script | null = LINE): string {
  recordSolveStart({ home }, input)?.finish({ ended: line ? { kind: "oracle_line" } : { kind: "no_answer", code: "no_win" }, report: null, oracleLine: line ?? undefined });
  const start = solveStartsIn({ home }).find(s => s.turn === (input.extras?.turn ?? 1));
  if (start === undefined) throw new Error("not recorded");
  return start.files.input;
}

/** A home's fight folder, holding its first-turn solve, beside an empty fixtures folder and a known-fights list of one. */
function setUp({ kept = KEPT, line = LINE }: { kept?: SolveInput; line?: Script | null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "coachemon-promote-"));
  const home = path.join(root, "home");
  const fixtures = path.join(root, "fixtures");
  mkdirSync(fixtures);
  const keptFile = recorded(home, kept, line);
  const fight = path.dirname(keptFile);
  const knownFights = path.join(root, "known-fights.json");
  writeFileSync(knownFights, JSON.stringify(BEFORE));
  const rechecked: KnownFight[] = [];
  const deps = (failed: string[] | Error = []): PromoteDeps => ({
    fixtures,
    knownFights,
    pin: PIN,
    recheck: async fight => {
      rechecked.push(fight);
      if (failed instanceof Error) throw failed;
      return { failed };
    },
  });
  const known = () => JSON.parse(readFileSync(knownFights, "utf8")) as KnownFight[];
  return { home, fight, keptFile, fixtures, deps, known, rechecked };
}

test("promoting a kept fight's first-turn solve adds its fixtures and its known-fights entry, then re-checks that fight at the pin (#787, #936)", async () => {
  const { keptFile, fixtures, deps, known, rechecked } = setUp();

  const out = await promote(keptFile, deps());

  const fight = { stem: "gordie-w180", name: "Gordie W180" };
  assert.deepEqual(out, { promoted: fight });
  const { cloneVersion: _version, budget: _budget, ...given } = KEPT;
  assert.deepEqual(JSON.parse(readFileSync(path.join(fixtures, "gordie-w180.json"), "utf8")), given);
  assert.deepEqual(JSON.parse(readFileSync(path.join(fixtures, "gordie-w180.win.script.json"), "utf8")), LINE);
  assert.deepEqual(known(), [...BEFORE, fight]);
  assert.deepEqual(rechecked, [fight]);
});

test("promoting a fight folder promotes its first-turn solve (#936)", async () => {
  const { fight, fixtures, deps } = setUp();

  const out = await promote(fight, deps());

  assert.deepEqual(out, { promoted: { stem: "gordie-w180", name: "Gordie W180" } });
  assert.deepEqual(JSON.parse(readFileSync(path.join(fixtures, "gordie-w180.win.script.json"), "utf8")), LINE);
});

const refusedWith = async (out: Promise<unknown>, why: RegExp) => {
  const got = (await out) as { refused?: string };
  assert.match(got.refused ?? "(promoted)", why);
};

test("promotion refuses a kept fight with no oracle line file, naming why, and changes nothing (#787)", async () => {
  const { keptFile, fixtures, deps, known, rechecked } = setUp({ line: null });

  await refusedWith(promote(keptFile, deps()), /no oracle line file.*ended without an oracle line/);

  assert.equal(existsSync(path.join(fixtures, "gordie-w180.json")), false);
  assert.deepEqual(known(), BEFORE);
  assert.deepEqual(rechecked, []);
});

test("promotion refuses a mid-fight file, which the re-check can't replay from the wave start (#787)", async () => {
  const { keptFile, deps, known } = setUp();
  writeFileSync(keptFile, JSON.stringify({ ...KEPT, extras: {} }));

  await refusedWith(promote(keptFile, deps()), /mid-fight.*wave-start save/);

  assert.deepEqual(known(), BEFORE);
});

test("promotion refuses a fight folder's mid-fight solve, either of its files, as it refuses any mid-fight file, and changes nothing (#937)", async () => {
  const { home, fixtures, deps, known, rechecked } = setUp();
  recorded(home, midFight(5));
  const { files } = solveStartsIn({ home })[1];

  await refusedWith(promote(files.input, deps()), /turn-5\.json is a mid-fight solve's.*wave-start save/);
  await refusedWith(promote(files.oracleLine, deps()), /turn-5\.json is a mid-fight solve's.*wave-start save/);

  assert.equal(existsSync(path.join(fixtures, "gordie-w180.json")), false);
  assert.deepEqual(known(), BEFORE);
  assert.deepEqual(rechecked, []);
});

test("a fight folder holding mid-fight solves too still promotes its first-turn solve (#937)", async () => {
  const { home, fight, fixtures, deps } = setUp();
  recorded(home, midFight(5), { ...LINE, inputs: [{ kind: "move", move: "THUNDER", tera: true }] });

  const out = await promote(fight, deps());

  assert.deepEqual(out, { promoted: { stem: "gordie-w180", name: "Gordie W180" } });
  assert.deepEqual(JSON.parse(readFileSync(path.join(fixtures, "gordie-w180.win.script.json"), "utf8")), LINE);
});

test("promotion refuses a fight saved on another game version than the pin, which the re-check would carry (#787)", async () => {
  const { keptFile, deps } = setUp({ kept: { ...KEPT, save: { ...save, gameVersion: "1.12.0.11" } } });

  await refusedWith(promote(keptFile, deps()), /1\.12\.0\.11.*pin is 1\.12\.1\.3/);
});

test("promotion refuses a path that is no fight folder or solve start file, and an input that doesn't read, naming it, and changes nothing", async () => {
  const { fight, keptFile, deps, known, rechecked } = setUp();
  const notes = path.join(fight, "notes.txt");
  writeFileSync(notes, "won it live");

  await refusedWith(promote(notes, deps()), new RegExp(`^${notes.replaceAll(/[.\\/]/g, "\\$&")} is no fight folder and no solve start's file`));
  writeFileSync(keptFile, "{ not json");
  await refusedWith(promote(fight, deps()), /^turn-1\.json doesn't read: /);

  assert.deepEqual(known(), BEFORE);
  assert.deepEqual(rechecked, []);
});

test("promotion refuses a stem the fixtures already hold, so no known fight is overwritten (#787)", async () => {
  const { keptFile, fixtures, deps, known } = setUp();
  writeFileSync(path.join(fixtures, "gordie-w180.json"), "{}");

  await refusedWith(promote(keptFile, deps()), /gordie-w180.*--stem/);

  assert.equal(readFileSync(path.join(fixtures, "gordie-w180.json"), "utf8"), "{}");
  assert.deepEqual(known(), BEFORE);
});

test("promotion under a stem of the maintainer's own names the known fight from it (#787)", async () => {
  const { keptFile, fixtures, deps, known } = setUp();

  const out = await promote(keptFile, deps(), "gordie-w180-rematch");

  assert.deepEqual(out, { promoted: { stem: "gordie-w180-rematch", name: "Gordie W180 Rematch" } });
  assert.equal(existsSync(path.join(fixtures, "gordie-w180-rematch.win.script.json")), true);
  assert.equal(known().length, 2);
});

test("a promoted fight whose re-check fails is taken back out, fixtures and entry both (#787)", async () => {
  const { keptFile, fixtures, deps, known } = setUp();

  const out = await promote(keptFile, deps(["Gordie W180 didn't replay"]));

  assert.deepEqual(out, { refused: "the re-check of Gordie W180 failed: Gordie W180 didn't replay. Nothing was promoted." });
  assert.equal(existsSync(path.join(fixtures, "gordie-w180.json")), false);
  assert.equal(existsSync(path.join(fixtures, "gordie-w180.win.script.json")), false);
  assert.deepEqual(known(), BEFORE);
});

test("a promoted fight whose re-check throws is taken back out too (#787)", async () => {
  const { keptFile, fixtures, deps, known } = setUp();

  await assert.rejects(promote(keptFile, deps(new Error("no pinned clone"))), /no pinned clone/);

  assert.equal(existsSync(path.join(fixtures, "gordie-w180.json")), false);
  assert.deepEqual(known(), BEFORE);
});
