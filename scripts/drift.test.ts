import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DRIFT = path.join(ROOT, "scripts/drift.ts");
const PINNED = JSON.parse(readFileSync(path.join(ROOT, "src/escape-ladder/reviewed.json"), "utf8")).pinned.gameVersion;
const run = (...flags: string[]) => spawnSync(process.execPath, [DRIFT, ...flags], { encoding: "utf8", cwd: ROOT });

test("--write-names refuses --stamp, --only and another --version with exit 2", () => {
  const cases: [string[], string][] = [
    [["--stamp"], "--write-names cannot be combined with --stamp: the stamp writes the names itself."],
    [["--only", "reads"], "--write-names cannot be combined with --only: the names are the game's, not one source's."],
    [["--version", "0.0.1"], `--write-names writes the pinned version's names (${PINNED}), not 0.0.1: moving the pin is the stamp's.`],
  ];
  for (const [flags, said] of cases) {
    const r = run("--write-names", ...flags);
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stderr.trim(), said);
  }
});

test("--write-names refuses a source at another sha than the pin and writes nothing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "drift-cli-"));
  try {
    const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" });
    git("init", "-q");
    writeFileSync(path.join(dir, "README.md"), "not the game\n");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x");
    const files = ["src/escape-ladder/reviewed.json", "scripts/game-reads/game-names.txt"].map(f => path.join(ROOT, f));
    const before = files.map(f => readFileSync(f));
    const r = run("--write-names", "--source", dir);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^Refusing to write the names: .* is at [0-9a-f]{7}, the pin at [0-9a-f]{7}\.$/m);
    assert.deepEqual(files.map(f => readFileSync(f)), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
