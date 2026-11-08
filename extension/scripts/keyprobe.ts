/**
 * Builds the key probe (#1018) and places it where the owner loads it by hand (`CLAUDE.md` → Sideload builds):
 *
 *   ~/Downloads/coachemon-keyprobe-chrome    Chrome's unpacked build
 *   ~/Downloads/coachemon-keyprobe-firefox   Firefox's temporary add-on (load its manifest.json)
 *   ~/Downloads/coachemon-keyprobe-orion     Orion's one folder; `--orion chrome|firefox` picks which build it holds
 *
 * Each folder is emptied and refilled in place, never replaced, because Orion keys an unpacked extension by its path.
 *
 * Usage: node scripts/keyprobe.ts [--orion chrome|firefox] [--no-build]
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extension = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const at = argv.indexOf("--orion");
const orion = at > -1 ? argv[at + 1] : "chrome";
if (orion !== "chrome" && orion !== "firefox") throw new Error(`--orion takes chrome or firefox, not ${orion}`);

const say = (line: string) => process.stderr.write(`${line}\n`);

if (!argv.includes("--no-build")) {
  for (const target of ["chrome", "firefox"]) {
    const r = spawnSync("npx", ["wxt", "build", "-b", target, "--mode", "store"], { cwd: extension, stdio: ["ignore", "ignore", "inherit"] });
    if (r.status !== 0) throw new Error(`build ${target} failed`);
  }
}

const out = (target: string) => join(extension, ".output", `${target}-mv3-store`);
/** The build id `build:done` stamped in. */
const buildOf = (dir: string) => /\d+\.\d+\.\d+\+[0-9a-f]{12}/.exec(readFileSync(join(dir, "keyprobe.js"), "utf8"))?.[0] ?? "unknown";

function place(target: string, dest: string, label: string): void {
  const src = out(target);
  if (!existsSync(join(src, "manifest.json"))) throw new Error(`no ${target} build at ${src}`);
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(dest)) rmSync(join(dest, name), { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  const build = buildOf(src);
  writeFileSync(join(dest, "KEYPROBE.txt"), `Coachemon key probe, ${target}-flavoured build ${build}, placed ${new Date().toISOString()} (${label})\n`);
  say(`${label}: ${target}-flavoured ${build} → ${dest}`);
}

const downloads = join(homedir(), "Downloads");
place("chrome", join(downloads, "coachemon-keyprobe-chrome"), "Chrome");
place("firefox", join(downloads, "coachemon-keyprobe-firefox"), "Firefox");
place(orion, join(downloads, "coachemon-keyprobe-orion"), "Orion");
