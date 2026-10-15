import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ArenaTagSide, GameModes } from "../../src/enums/generated.ts";

const RUN = fileURLToPath(new URL("./run.ts", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../../src/solver/fixtures/", import.meta.url));
const exported = JSON.parse(readFileSync(path.join(FIXTURES, "drayton-w188.json"), "utf8"));
const drayton = exported.save;
const SCRIPT = path.join(FIXTURES, "drayton-w188.win.script.json");

const oracle = (exported: unknown, flags: string[] = []) => {
  // Never the repo's own `.cache`: it may hold a provisioned clone, which these tests mean never to start.
  const dir = mkdtempSync(path.join(tmpdir(), "battle-oracle-"));
  const file = path.join(dir, "export.json");
  writeFileSync(file, typeof exported === "string" ? exported : JSON.stringify(exported));
  return spawnSync(process.execPath, [RUN, ...flags, file], { encoding: "utf8", cwd: dir });
};

test("oracle:battle prints the gate's answer for a wave-start save and exits as no answer (#659)", () => {
  const run = oracle({ ...drayton, gameMode: GameModes.DAILY });

  assert.equal(run.stdout, "no answer: a Daily's seed is shared by every player, so solving is never offered there. The card still coaches.\n");
  assert.equal(run.status, 2);
});

test("oracle:battle reads a mid-fight export's live extras (#659)", () => {
  const run = oracle({ save: drayton, extras: { arenaTags: [{ tagType: "SAFEGUARD", side: ArenaTagSide.ENEMY }] } });

  assert.match(run.stdout, /^no answer: Safeguard is up/);
  assert.equal(run.status, 2);
});

test("oracle:battle answers no answer, never a crash's exit code, when the export can't be read (#659)", () => {
  const run = oracle("{ not json");

  assert.match(run.stdout, /^no answer: could not read .*export\.json/);
  assert.equal(run.status, 2);
});

test("oracle:battle says the solver failed, not that the export was unreadable, when the solver throws (#659)", () => {
  const run = oracle({ save: drayton, extras: {} });

  assert.match(run.stdout, /^no answer: the solver failed: /);
  assert.equal(run.status, 2);
});

test("oracle:battle reads the re-check record it ships with, so the gate lets the pin's version through to the clone (#659, #665)", () => {
  const run = oracle(exported);

  assert.doesNotMatch(run.stderr, /--unchecked/);
  assert.match(run.stdout, /^no answer: the oracle's clone of game version 1\.12\.0\.11 isn't set up/);
  assert.equal(run.status, 2);
});

test("oracle:battle --replay answers no answer naming what the clone lacks when it isn't provisioned (#660)", () => {
  const run = oracle(exported, ["--replay", SCRIPT]);

  assert.match(
    run.stdout,
    /^no answer: the oracle's clone of game version 1\.12\.0\.11 isn't set up: No pinned clone at .*v1\.12\.0\.11\. Set it up with `npm run drift:check/,
  );
  assert.equal(run.status, 2);
});

test("oracle:battle --replay answers with the gate's refusal before it looks for a clone (#660)", () => {
  const run = oracle({ ...exported, save: { ...drayton, gameMode: GameModes.DAILY } }, ["--replay", SCRIPT]);

  assert.match(run.stdout, /^no answer: a Daily's seed/);
  assert.equal(run.status, 2);
});

test("oracle:battle --replay answers no answer when the save comes with no live battle to match (#660)", () => {
  const run = oracle(drayton, ["--replay", SCRIPT]);

  assert.match(run.stdout, /^no answer: no live battle came with the save/);
  assert.equal(run.status, 2);
});

test("oracle:battle --unchecked passes the re-check's gate and no other, so it still needs the clone (#662)", () => {
  const run = oracle(exported, ["--unchecked"]);

  assert.match(run.stderr, /--unchecked solves on a game version the harness re-check hasn't passed/);
  assert.match(run.stdout, /^no answer: the oracle's clone of game version 1\.12\.0\.11 isn't set up/);
  assert.equal(run.status, 2);
});

test("oracle:battle --check answers no answer naming what the clone lacks when it isn't provisioned (#662)", () => {
  const run = oracle(exported, ["--check", SCRIPT]);

  assert.match(run.stdout, /^no answer: the oracle's clone of game version 1\.12\.0\.11 isn't set up: No pinned clone/);
  assert.equal(run.status, 2);
});

test("oracle:battle --replay answers no answer naming the script it couldn't read, and where it strays (#660)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "battle-oracle-"));
  const script = path.join(dir, "typo.script.json");
  writeFileSync(script, JSON.stringify({ inputs: [{ kind: "move", move: "DRAGON_PULS", tera: false }] }));
  const run = oracle(exported, ["--replay", script]);

  assert.match(run.stdout, /^no answer: could not read .*typo\.script\.json: .*inputs\[0\]\.move/s);
  assert.equal(run.status, 2);
});
