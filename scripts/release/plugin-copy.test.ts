import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { assemble, strays, workingTree } from "./plugin-copy.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("nothing the plugin copy holds reaches outside it, so a new runtime file cannot be left behind (extension-distribution.md §14.7)", () => {
  assert.deepEqual(strays(workingTree(REPO)), []);
});

const OUT = mkdtempSync(path.join(tmpdir(), "coach-plugin-copy-"));
after(() => rmSync(OUT, { recursive: true, force: true }));
const written = assemble(REPO, "HEAD", OUT);

test("the copy holds what the plugin runs, the data files its code reads included", () => {
  for (const file of [
    ".claude-plugin/plugin.json",
    "src/server.ts",
    "src/hub/main.ts",
    "src/escape-ladder/reviewed.json",
    "src/solver/harness.test.ts.template",
    "skills/coachemon/SKILL.md",
    "skills/coachemon/scripts/hud/01-core.js",
    "skills/play-pokerogue/SKILL.md",
    "package.json",
    "package-lock.json",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "README.md",
    "PRIVACY.md",
  ]) {
    assert.ok(existsSync(path.join(OUT, file)), file);
  }
  assert.ok(statSync(path.join(OUT, "skills/coachemon/scripts/read.sh")).mode & 0o100, "read.sh stays executable: watch.mjs runs it by path");
});

test("the copy holds nothing that is ours alone: docs, scripts, tests, fixtures, the repo's own skills", () => {
  for (const top of [".claude", ".github", ".rig", "docs", "scripts", "extension", "CLAUDE.md", "CONTEXT.md", ".claude-plugin/marketplace.json"]) {
    assert.equal(existsSync(path.join(OUT, top)), false, top);
  }
  const ours = written.filter(f => /\.test\.ts$|\/fixtures\/|^skills\/coachemon\/scripts\/test\/|\/fake-[\w-]+\.ts$/.test(f));
  assert.deepEqual(ours, []);
});

test("the copy's package.json and lockfile list the runtime dependencies alone, at the versions master locks", () => {
  const json = (file: string) => JSON.parse(readFileSync(path.join(OUT, file), "utf8"));
  const atHead = (file: string) => JSON.parse(execFileSync("git", ["show", `HEAD:${file}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const [pkg, lock, repoPkg, repoLock] = [json("package.json"), json("package-lock.json"), atHead("package.json"), atHead("package-lock.json")];
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.scripts, undefined);
  assert.equal(pkg.version, repoPkg.version);
  assert.deepEqual(pkg.dependencies, repoPkg.dependencies);
  // Claude Code's precondition for installing at all (extension-distribution.md §14.7).
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.equal(lock.packages[""].devDependencies, undefined);
  assert.equal(lock.packages["node_modules/typescript"], undefined);
  for (const [at, entry] of Object.entries(lock.packages as Record<string, { version?: string }>)) {
    if (at !== "") assert.equal(entry.version, repoLock.packages[at]?.version, at);
  }
});

const tree = (files: Record<string, string>, dependencies: Record<string, string> = {}) =>
  new Map(Object.entries({ "package.json": JSON.stringify({ dependencies }), ...files }));

test("a shipped file importing a file the copy leaves out is a stray (extension-distribution.md §14.7)", () => {
  const files = tree({
    "src/server.ts": 'import { fakeClient } from "./hub/fake-ext.ts";\n',
    "src/hub/fake-ext.ts": "export const fakeClient = 1;\n",
  });
  assert.deepEqual(strays(files), ["src/server.ts reaches src/hub/fake-ext.ts, which the plugin copy leaves out"]);
});

test("a side-effect import and a dynamic import reach their file too", () => {
  const files = tree({
    "src/server.ts": 'import "./hub/fake-ext.ts";\nconst { run } = await import("./game/fake-game.ts");\n',
    "src/hub/fake-ext.ts": "",
    "src/game/fake-game.ts": "",
  });
  assert.deepEqual(strays(files), [
    "src/server.ts reaches src/hub/fake-ext.ts, which the plugin copy leaves out",
    "src/server.ts reaches src/game/fake-game.ts, which the plugin copy leaves out",
  ]);
});

test("a file read through new URL(…, import.meta.url) must ship as well", () => {
  const files = tree({
    "src/plugin-version.ts": 'readFileSync(new URL("../package.json", import.meta.url), "utf8");\n',
    "src/solver/worker.ts": 'readFileSync(new URL("./fixtures/w1.json", import.meta.url), "utf8");\n',
    "src/solver/fixtures/w1.json": "{}",
  });
  assert.deepEqual(strays(files), ["src/solver/worker.ts reaches src/solver/fixtures/w1.json, which the plugin copy leaves out"]);
});

test("a reach to a file that is nowhere in the tree is a stray too", () => {
  const files = tree({ "src/server.ts": 'import { Driver } from "./driver.ts";\n' });
  assert.deepEqual(strays(files), ["src/server.ts reaches src/driver.ts, which does not exist"]);
});

test("a package a shipped file imports must be a runtime dependency, since the copy installs no devDependencies", () => {
  const files = tree(
    {
      "src/server.ts": [
        'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
        'import { readFileSync } from "node:fs";',
        'import { spawn } from "child_process";',
        'import type { Program } from "typescript";',
        'import ts from "typescript";',
      ].join("\n"),
    },
    { "@modelcontextprotocol/sdk": "^1.31.0" },
  );
  assert.deepEqual(strays(files), ["src/server.ts imports typescript, which is not a runtime dependency"]);
});

test("a script run by path from beside the file that runs it must ship: the hub's spawn, and read.sh's bundle", () => {
  const files = tree({
    "src/hub/client.ts": 'const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "main.ts");\n',
    "skills/coachemon/scripts/read.sh": 'here=$(cd "$(dirname "$0")" && pwd)\nprobe=$(node "$here/hud-bundle.mjs" "$mode")\n',
  });
  assert.deepEqual(strays(files), [
    "src/hub/client.ts reaches src/hub/main.ts, which does not exist",
    "skills/coachemon/scripts/read.sh reaches skills/coachemon/scripts/hud-bundle.mjs, which does not exist",
  ]);
});

test("the manifest ships, and a path it names under ${CLAUDE_PLUGIN_ROOT} must too", () => {
  const manifest = { mcpServers: { coachemon: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/src/serve.ts"] } } };
  const files = tree({ ".claude-plugin/plugin.json": JSON.stringify(manifest), "src/server.ts": "" });
  assert.deepEqual(strays(files), [".claude-plugin/plugin.json reaches src/serve.ts, which does not exist"]);
});

test("a directory read by URL ships when a shipped file sits under it", () => {
  const read = 'readdirSync(fileURLToPath(new URL("./hud/", import.meta.url)));\n';
  const ships = tree({ "skills/coachemon/scripts/hud-bundle.mjs": read, "skills/coachemon/scripts/hud/01-core.js": "" });
  assert.deepEqual(strays(ships), []);
  const empty = tree({ "skills/coachemon/scripts/hud-bundle.mjs": read });
  assert.deepEqual(strays(empty), ["skills/coachemon/scripts/hud-bundle.mjs reaches skills/coachemon/scripts/hud/, which does not exist"]);
});
