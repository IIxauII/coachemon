import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ArenaTagSide, GameModes } from "../../src/enums/generated.ts";

const RUN = fileURLToPath(new URL("./run.ts", import.meta.url));
const drayton = JSON.parse(
  readFileSync(new URL("../../src/solver/fixtures/drayton-w188.wave-start.json", import.meta.url), "utf8"),
);

const oracle = (exported: unknown) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "battle-oracle-")), "export.json");
  writeFileSync(file, typeof exported === "string" ? exported : JSON.stringify(exported));
  return spawnSync(process.execPath, [RUN, file], { encoding: "utf8" });
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

test("oracle:battle reads the re-check record it ships with, which until the pin bump writes one is none (#659, #665)", () => {
  const run = oracle(drayton);

  assert.match(run.stdout, /^no answer: the oracle's harness hasn't been re-checked on game version 1\.12\.0\.11/);
  assert.equal(run.status, 2);
});
