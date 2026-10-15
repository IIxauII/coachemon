import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { test, type TestContext } from "node:test";
import { setUpClone, type CloneDeps, type ClonePin } from "./clone.ts";

const PIN: ClonePin = { gameVersion: "1.12.0.11", sha: "e4e9b538", locales: "e46279a0", assets: "909b4361", pnpm: "10.33.2" };

function tempDir(t: TestContext, prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A gzipped tarball with one top directory, the way codeload serves a commit. */
function tarball(t: TestContext, top: string, files: Record<string, string>): Buffer {
  const dir = tempDir(t, "coachemon-tarball-");
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, top, file)), { recursive: true });
    writeFileSync(path.join(dir, top, file), text);
  }
  return execFileSync("tar", ["-czf", "-", "-C", dir, top]);
}

function github(t: TestContext, pin: ClonePin = PIN) {
  const routes = new Map<string, Buffer>([
    [
      `https://codeload.github.com/pagefaultgames/pokerogue/tar.gz/${pin.sha}`,
      tarball(t, `pokerogue-${pin.sha}`, { "package.json": JSON.stringify({ version: pin.gameVersion }), "test/tests/.keep": "" }),
    ],
    [
      `https://codeload.github.com/pagefaultgames/pokerogue-locales/tar.gz/${pin.locales}`,
      tarball(t, `pokerogue-locales-${pin.locales}`, { "en/common.json": '{"hello":"Hello"}' }),
    ],
    [`https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/${pin.assets}/battle-anims/tackle.json`, Buffer.from('{"frames":[]}')],
  ]);
  const fetched: string[] = [];
  const fetch = async (url: string | URL | Request): Promise<Response> => {
    fetched.push(String(url));
    const body = routes.get(String(url));
    return body ? new Response(new Uint8Array(body)) : new Response("Not Found", { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, fetched, routes };
}

/**
 * Stands in for `npx`: records the arguments it was run with, and installs a `node_modules` with pnpm's progress line —
 * or, given `fail`, prints it and exits 1 halfway through, or given `hang`, runs until its parent dies.
 */
function fakeNpx(t: TestContext, { fail, hang }: { fail?: string; hang?: boolean } = {}): string[] {
  const script = path.join(tempDir(t, "coachemon-npx-"), "npx.mjs");
  writeFileSync(
    script,
    [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'mkdirSync("node_modules");',
      'writeFileSync("node_modules/.npx-args.json", JSON.stringify(process.argv.slice(2)));',
      'console.error("npm warn exec The following package was not found and will be installed: pnpm@10.33.2");',
      fail === undefined ? "" : `console.error(${JSON.stringify(fail)}); console.error(""); process.exit(1);`,
      'console.log("Progress: resolved 343, reused 0, downloaded 343, added 343, done");',
      hang ? "const parent = process.ppid; setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(1); } }, 50);" : "",
    ].join("\n"),
  );
  return [process.execPath, script];
}

const deps = (t: TestContext, over: Partial<CloneDeps> = {}): CloneDeps => ({
  pin: over.pin ?? PIN,
  fetch: over.fetch ?? github(t, over.pin).fetch,
  npx: over.npx ?? fakeNpx(t),
});

const offline = (async () => {
  throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND codeload.github.com"), { code: "ENOTFOUND" }) });
}) as typeof globalThis.fetch;

function ctl() {
  const lines: string[] = [];
  return { signal: new AbortController().signal, progress: (line: string) => lines.push(line), lines };
}

test("setup lands the pinned version's clone in the home directory, from GitHub and pnpm alone (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const result = await setUpClone(home, ctl(), deps(t));

  assert.equal(result.kind, "clone", JSON.stringify(result));
  if (result.kind !== "clone") return;
  assert.equal(result.gameVersion, "1.12.0.11");
  assert.ok(result.dir.startsWith(home + path.sep), `${result.dir} is inside the home directory`);
  assert.ok(result.dir.includes("1.12.0.11"), `${result.dir} names the game version`);
  assert.deepEqual(JSON.parse(readFileSync(path.join(result.dir, "package.json"), "utf8")), { version: "1.12.0.11" });
  assert.equal(readFileSync(path.join(result.dir, "locales/en/common.json"), "utf8"), '{"hello":"Hello"}');
  assert.equal(readFileSync(path.join(result.dir, "assets/battle-anims/tackle.json"), "utf8"), '{"frames":[]}');
  const npxArgs: string[] = JSON.parse(readFileSync(path.join(result.dir, "node_modules/.npx-args.json"), "utf8"));
  assert.deepEqual(npxArgs.slice(0, 3), ["--yes", "pnpm@10.33.2", "install"]);
  assert.ok(npxArgs.includes("--frozen-lockfile") && npxArgs.includes("--ignore-scripts"), JSON.stringify(npxArgs));
  assert.ok(!existsSync(path.join(result.dir, ".git")));
});

test("setup reports each stage as a progress line, the install with pnpm's own count (#668)", async t => {
  const c = ctl();
  await setUpClone(tempDir(t, "coachemon-home-"), c, deps(t));
  const stages = ["the game", "locales", "battle animation", "dependencies"].map(stage => c.lines.findIndex(line => line.includes(stage)));
  assert.ok(stages.every((at, i) => at >= 0 && (i === 0 || at > stages[i - 1])), JSON.stringify(c.lines));
  assert.ok(c.lines.every(line => line.includes("1.12.0.11")), JSON.stringify(c.lines));
  assert.match(c.lines.at(-1) ?? "", /downloaded 343/);
});

test("a clone already set up for the pinned version answers at once and fetches nothing (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const gh = github(t);
  const first = await setUpClone(home, ctl(), deps(t, { fetch: gh.fetch }));
  const fetches = gh.fetched.length;
  const again = await setUpClone(home, ctl(), deps(t, { fetch: gh.fetch }));
  assert.deepEqual(again, first);
  assert.equal(gh.fetched.length, fetches);
});

test("setting up a new pin removes the old version's clone, and only once the new one is set up (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const old: ClonePin = { gameVersion: "1.12.0.10", sha: "d3adbeef", locales: "1ocale5", assets: "a55e7s", pnpm: "10.30.0" };
  const before = await setUpClone(home, ctl(), deps(t, { pin: old }));
  assert.equal(before.kind, "clone", JSON.stringify(before));
  if (before.kind !== "clone") return;

  assert.equal((await setUpClone(home, ctl(), deps(t, { fetch: offline }))).kind, "no_answer");
  assert.ok(existsSync(path.join(before.dir, "package.json")), "a failed setup of the new pin keeps the old clone");

  const after = await setUpClone(home, ctl(), deps(t));
  assert.equal(after.kind, "clone", JSON.stringify(after));
  assert.ok(!existsSync(before.dir), `${before.dir} is gone`);
  assert.deepEqual(filesUnder(home).filter(file => file.includes("1.12.0.10")), []);
});

test("setting up an older pin, from a plugin left running across an update, keeps the newer version's clone (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const newer = await setUpClone(home, ctl(), deps(t));
  assert.equal(newer.kind, "clone", JSON.stringify(newer));
  if (newer.kind !== "clone") return;

  const old: ClonePin = { gameVersion: "1.12.0.9", sha: "d3adbeef", locales: "1ocale5", assets: "a55e7s", pnpm: "10.30.0" };
  assert.equal((await setUpClone(home, ctl(), deps(t, { pin: old }))).kind, "clone");
  assert.ok(existsSync(path.join(newer.dir, "package.json")), `${newer.dir} is kept`);
});

test("a setup cancelled mid-install stops the install and leaves nothing behind for the next to trip on (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const cancel = new AbortController();
  const progress = (line: string) => {
    if (line.includes("downloaded")) cancel.abort();
  };
  const setup = setUpClone(home, { signal: cancel.signal, progress }, deps(t, { npx: fakeNpx(t, { hang: true }) }));
  await assert.rejects(setup, { name: "AbortError" });
  assert.deepEqual(filesUnder(home), []);
  assert.equal((await setUpClone(home, ctl(), deps(t))).kind, "clone");
});

test("two setups at once share one: the second waits for the first's clone instead of fetching its own (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const gh = github(t);
  const second = ctl();
  const [a, b] = await Promise.all([
    setUpClone(home, ctl(), deps(t, { fetch: gh.fetch })),
    setUpClone(home, second, deps(t, { fetch: gh.fetch })),
  ]);
  assert.equal(a.kind, "clone", JSON.stringify(a));
  assert.deepEqual(b, a);
  assert.equal(gh.fetched.length, 3, JSON.stringify(gh.fetched));
  assert.ok(second.lines.some(line => line.includes("waiting")), JSON.stringify(second.lines));
});

test("a setup whose process was killed mid-install is taken over and done again by the next (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const gh = github(t);
  const served = tempDir(t, "coachemon-served-");
  for (const [url, body] of gh.routes) writeFileSync(path.join(served, encodeURIComponent(url)), body);
  const script = path.join(served, "setup.mjs");
  writeFileSync(
    script,
    [
      'import { readFileSync } from "node:fs";',
      'import path from "node:path";',
      "const [clone, home, served, pin, ...npx] = process.argv.slice(2);",
      "const { setUpClone } = await import(clone);",
      "const fetch = async url => new Response(readFileSync(path.join(served, encodeURIComponent(String(url)))));",
      'const progress = line => line.includes("downloaded") && console.log("installing");',
      "await setUpClone(home, { signal: new AbortController().signal, progress }, { pin: JSON.parse(pin), fetch, npx });",
    ].join("\n"),
  );
  const killed = spawn(process.execPath, [script, path.join(import.meta.dirname, "clone.ts"), home, served, JSON.stringify(PIN), ...fakeNpx(t, { hang: true })]);
  await new Promise<void>(resolve => createInterface({ input: killed.stdout }).on("line", line => line === "installing" && resolve()));
  killed.kill("SIGKILL");
  await new Promise(resolve => killed.on("close", resolve));

  const result = await setUpClone(home, ctl(), deps(t, { fetch: gh.fetch }));
  assert.equal(result.kind, "clone", JSON.stringify(result));
  assert.equal(gh.fetched.length, 3, "the leftover was set up again from scratch");
});

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)));

test("with no network, setup ends in no answer naming the cause, the card still coaching, and leaves nothing behind (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const result = await setUpClone(home, ctl(), deps(t, { fetch: offline }));

  assert.equal(result.kind, "no_answer", JSON.stringify(result));
  if (result.kind !== "no_answer") return;
  assert.equal(result.reason.code, "no_clone");
  assert.match(result.message, /couldn't reach codeload\.github\.com/);
  assert.match(result.message, /ENOTFOUND/);
  assert.match(result.message, /1\.12\.0\.11/);
  assert.match(result.message, /The card still coaches\.$/);
  assert.deepEqual(filesUnder(home), []);
});

test("a download GitHub answers with an HTTP error ends in no answer naming it, leaving nothing behind (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const result = await setUpClone(home, ctl(), deps(t, { pin: { ...PIN, locales: "0000000" }, fetch: github(t).fetch }));
  assert.equal(result.kind, "no_answer", JSON.stringify(result));
  assert.match(result.kind === "no_answer" ? result.message : "", /codeload\.github\.com answered HTTP 404 for the game's locales/);
  assert.deepEqual(filesUnder(home), []);
});

test("an install that fails ends in no answer quoting pnpm's error, leaving nothing behind (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const error = " ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/vitest: request failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org";
  const result = await setUpClone(home, ctl(), deps(t, { npx: fakeNpx(t, { fail: error }) }));
  assert.equal(result.kind, "no_answer", JSON.stringify(result));
  const message = result.kind === "no_answer" ? result.message : "";
  assert.ok(message.includes(`installing the game's dependencies failed: ${error.trim()}`), message);
  assert.deepEqual(filesUnder(home), []);
});

test("npx that can't reach the registry for pnpm ends in no answer naming the network cause, not npm's log (#668)", async t => {
  const offlineNpm = [
    "npm error code ENOTFOUND",
    "npm error syscall getaddrinfo",
    "npm error network request to https://registry.npmjs.org/pnpm failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org",
    "npm error network This is a problem related to network connectivity.",
    "npm error A complete log of this run can be found in: /Users/player/.npm/_logs/2026-10-15T16_00_00_000Z-debug-0.log",
  ].join("\n");
  const result = await setUpClone(tempDir(t, "coachemon-home-"), ctl(), deps(t, { npx: fakeNpx(t, { fail: offlineNpm }) }));
  const message = result.kind === "no_answer" ? result.message : JSON.stringify(result);
  assert.match(message, /reason: getaddrinfo ENOTFOUND registry\.npmjs\.org/);
  assert.doesNotMatch(message, /complete log/);
});

test("a tarball that won't unpack ends in no answer naming what it held, leaving nothing behind (#668)", async t => {
  const home = tempDir(t, "coachemon-home-");
  const { fetch } = github(t);
  const corrupt = (async (url: string | URL | Request) =>
    String(url).includes("/pokerogue/tar.gz/") ? new Response("<html>not a tarball</html>".repeat(160_000)) : fetch(url)) as typeof globalThis.fetch;
  const result = await setUpClone(home, ctl(), deps(t, { fetch: corrupt }));
  assert.equal(result.kind, "no_answer", JSON.stringify(result));
  assert.match(result.kind === "no_answer" ? result.message : "", /unpacking the game failed/);
  assert.deepEqual(filesUnder(home), []);
});
