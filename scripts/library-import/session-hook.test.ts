import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { recordSolveStart } from "../../src/solver/fight-library.ts";
import type { SessionSave } from "../../src/solver/solver.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

type Hook = { matcher?: string; hooks: { type: string; command: string }[] };

/** What the session-start hook in the repo's own settings tells the agent, run as Claude Code runs it, against `home`. */
function sessionStart(home: string): string {
  const settings = JSON.parse(readFileSync(path.join(REPO, ".claude", "settings.json"), "utf8"));
  const [{ hooks }] = (settings.hooks.SessionStart as Hook[]).filter(h => h.matcher === "startup");
  return hooks
    .map(({ command }) =>
      execFileSync("sh", ["-c", command], {
        cwd: REPO,
        env: { ...process.env, CLAUDE_PROJECT_DIR: REPO, COACHEMON_HOME: home },
        encoding: "utf8",
      }),
    )
    .join("");
}

test("a session started in the repo hears nothing when no fight waits for import, a home with no fights folder included (#947)", () => {
  const home = mkdtempSync(path.join(tmpdir(), "coachemon-session-hook-"));
  assert.equal(sessionStart(home), "");
  mkdirSync(path.join(home, "fights"));
  assert.equal(sessionStart(home), "");
});

/** A first-turn solve of the fight on `wave`, recorded as `COACHEMON_CAPTURE=1` records it. */
const recorded = (home: string, waveIndex: number) => {
  const save: SessionSave = { gameVersion: "1.12.2.0", gameMode: 0, seed: "Zu5cgKRQ0vigLcOhpJxYMUa0", waveIndex, battleType: 1, trainer: { trainerType: 261, variant: 0 }, party: [], enemyParty: [] };
  recordSolveStart({ home }, { save, cloneVersion: "1.12.2.0", budget: { expansions: 3000, turns: 40 } })?.finish({ ended: { kind: "no_answer", code: "no_win" }, report: null });
};

test("a session started in the repo is told how many fights wait for import, and to offer /import-fights once (#947)", () => {
  const home = mkdtempSync(path.join(tmpdir(), "coachemon-session-hook-"));
  recorded(home, 180);
  assert.match(sessionStart(home), /^1 recorded fight is waiting for import into the fight library\. .*offer `\/import-fights` once/);
  recorded(home, 173);
  assert.match(sessionStart(home), /^2 recorded fights are waiting for import/);
});
