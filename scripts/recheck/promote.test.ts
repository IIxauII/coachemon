import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { type KnownFight, promote, type PromoteDeps } from "./promote.ts";

const PIN = "1.12.1.3";

const save = {
  gameVersion: PIN,
  gameMode: 0,
  seed: "Zu5cgKRQ0vigLcOhpJxYMUa0",
  waveIndex: 180,
  battleType: 1,
  trainer: { trainerType: 261, variant: 0 },
  party: [],
  enemyParty: [],
};
const KEPT = {
  live: { wave: 180, battleSeed: "U0QKEz8wJ8ea7832" },
  save,
  liveExport: { ...save, party: [{ id: 1 }] },
  cloneVersion: PIN,
  budget: { expansions: 3000, turns: 40 },
};
const LINE = { inputs: [{ kind: "move", move: "SURF", tera: false }], known: { outcome: "won", after: [{ turn: 1 }] } };
const BEFORE: KnownFight[] = [{ stem: "drayton-w188", name: "Drayton W188" }];

/** A home's kept fight beside an empty fixtures folder and a known-fights list of one. */
function setUp({ kept = KEPT, line = LINE as unknown }: { kept?: unknown; line?: unknown } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "coachemon-promote-"));
  const fights = path.join(root, "home", "fights");
  const fixtures = path.join(root, "fixtures");
  mkdirSync(fights, { recursive: true });
  mkdirSync(fixtures);
  const keptFile = path.join(fights, "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie.json");
  writeFileSync(keptFile, JSON.stringify(kept));
  if (line !== null) writeFileSync(keptFile.replace(/\.json$/, ".win.script.json"), JSON.stringify(line));
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
  return { keptFile, fixtures, deps, known, rechecked };
}

test("promoting a kept fight adds its fixtures and its known-fights entry, then re-checks that fight at the pin (#787)", async () => {
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
  const { keptFile, deps, known } = setUp({ kept: { ...KEPT, extras: {} } });

  await refusedWith(promote(keptFile, deps()), /mid-fight.*wave-start save/);

  assert.deepEqual(known(), BEFORE);
});

test("promotion refuses a fight saved on another game version than the pin, which the re-check would carry (#787)", async () => {
  const { keptFile, deps } = setUp({ kept: { ...KEPT, save: { ...save, gameVersion: "1.12.0.11" } } });

  await refusedWith(promote(keptFile, deps()), /1\.12\.0\.11.*pin is 1\.12\.1\.3/);
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
