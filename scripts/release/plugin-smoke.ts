/** The release-time smoke on an assembled plugin copy (extension-distribution.md §14.7): it returns one line per failure. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { strays } from "./plugin-copy.ts";

const REPO_ONLY = [".claude", ".github", ".rig", "docs", "scripts", "extension", "CLAUDE.md"];
const REPO_ONLY_ANYWHERE = /\.test\.ts$|\/fixtures\/|^skills\/coachemon\/scripts\/test\//;

// Ends the watcher at its first dial of the hub, by which point every module it imports has loaded and run; no hub, a
// player's or one it would spawn, is ever reached.
const DIAL_STOP = `data:text/javascript,${encodeURIComponent(
  'import net from "node:net"; import { writeSync } from "node:fs"; net.Socket.prototype.connect = function () { writeSync(1, "dialed\\n"); process.exit(0); };',
)}`;

export async function smoke(dir: string): Promise<string[]> {
  const failures: string[] = [];
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => path.relative(dir, path.join(d.parentPath, d.name)).split(path.sep).join("/"));
  for (const top of REPO_ONLY) if (existsSync(path.join(dir, top))) failures.push(`the copy holds ${top}`);
  for (const file of files) if (REPO_ONLY_ANYWHERE.test(file)) failures.push(`the copy holds ${file}`);
  failures.push(...strays(new Map(files.map(f => [f, readFileSync(path.join(dir, f), "utf8")]))));

  // A developer's `COACHEMON_*` would pick another transport or port than a player's session gets.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("COACHEMON_"))) as Record<string, string>;
  const run = (args: string[]) => spawnSync(process.execPath, args, { cwd: dir, env, encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  // Node ends a crash with the stack and its own version, so the error is the line naming one.
  const why = (text: string) => (text.split("\n").find(line => /Error\b/.test(line)) ?? text.trim().split("\n").at(-1) ?? "").trim();

  const install = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir, env, encoding: "utf8" });
  if (install.status !== 0) return [...failures, `npm ci failed: ${why(install.stderr)}`];
  for (const dev of ["typescript", "@types"]) {
    if (existsSync(path.join(dir, "node_modules", dev))) failures.push(`npm ci installed ${dev}, a devDependency`);
  }

  const client = new Client({ name: "plugin-smoke", version: "0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["src/server.ts"], cwd: dir, env, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", chunk => (stderr += String(chunk)));
  try {
    await client.connect(transport, { timeout: 30_000 });
    const name = client.getServerVersion()?.name;
    if (name !== "coachemon") failures.push(`the server answered initialize as ${String(name)}`);
  } catch (e) {
    failures.push(`the server did not answer initialize: ${(e as Error).message} ${why(stderr)}`);
  } finally {
    await client.close();
  }

  const hud = run(["skills/coachemon/scripts/hud-bundle.mjs", "hud"]);
  if (hud.status !== 0 || hud.stdout.length === 0) failures.push(`the HUD did not bundle: ${why(hud.stderr)}`);

  const watch = run(["--import", DIAL_STOP, "skills/coachemon/scripts/watch.ts"]);
  if (watch.status !== 0 || !watch.stdout.includes("dialed")) failures.push(`watch.ts did not load: ${why(watch.stderr)}`);

  return failures;
}
