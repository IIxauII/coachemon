import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

test("a session started in the repo is told how many fights wait for import, and to offer /import-fights once (#947)", () => {
  const home = mkdtempSync(path.join(tmpdir(), "coachemon-session-hook-"));
  mkdirSync(path.join(home, "fights", "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie"), { recursive: true });
  assert.match(sessionStart(home), /^1 recorded fight is waiting for import into the fight library\. .*offer `\/import-fights` once/);
  mkdirSync(path.join(home, "fights", "Ab12-w173-swimmers"));
  assert.match(sessionStart(home), /^2 recorded fights are waiting for import/);
});
