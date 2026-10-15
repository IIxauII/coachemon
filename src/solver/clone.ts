import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import reviewed from "../escape-ladder/reviewed.json" with { type: "json" };
import type { JobControl, JobWork } from "../jobs.ts";
import { noAnswer } from "./no-answer.ts";
import type { NoAnswer } from "./oracle-line.ts";

/** `sha` is the game's commit; `locales` and `assets` are its submodules' commits at it. */
export type ClonePin = { gameVersion: string; sha: string; locales: string; assets: string; pnpm: string };

export type CloneSetup = { kind: "clone"; gameVersion: string; dir: string } | NoAnswer;

export type CloneDeps = { pin: ClonePin; fetch?: typeof globalThis.fetch; npx?: readonly string[] };

export const CLONE_JOB = "clone";

export const cloneJob =
  (home: string, deps?: CloneDeps): JobWork =>
  (_args, ctl) =>
    setUpClone(home, ctl, deps);

const STEPS = 4;

export async function setUpClone(home: string, { signal, progress }: JobControl, deps: CloneDeps = { pin: reviewed.pinned }): Promise<CloneSetup> {
  const { pin, fetch = globalThis.fetch, npx = ["npx"] } = deps;
  const root = path.join(home, "clone");
  const versionDir = path.join(root, `v${pin.gameVersion}`);
  const dir = path.join(versionDir, "game");
  const step = (n: number, what: string) => progress(`setting up the clone for ${pin.gameVersion}, step ${n} of ${STEPS}: ${what}`);
  const download = async (url: string, what: string): Promise<Buffer> => {
    const host = new URL(url).host;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new SetupFailed(`${host} answered HTTP ${res.status} for ${what}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e instanceof SetupFailed || signal.aborted) throw e;
      throw new SetupFailed(`couldn't reach ${host} for ${what} (${causeOf(e)})`);
    }
  };

  const unpack = (what: string, tarball: Buffer, into: string) => {
    mkdirSync(into, { recursive: true });
    return execute(`unpacking ${what}`, ["tar", "-xzf", "-", "--strip-components", "1", "-C", into], { cwd: into, signal, input: tarball });
  };

  // Written last: a version without it is a setup that never finished, and the next one starts it over.
  const ready = path.join(versionDir, "ready");
  const clone: CloneSetup = { kind: "clone", gameVersion: pin.gameVersion, dir };
  if (existsSync(ready)) return clone;
  const waiting = () => progress(`setting up the clone for ${pin.gameVersion}: waiting on another setup of it to finish`);
  return locked(root, signal, waiting, async () => {
    if (existsSync(ready)) return clone;
    try {
      rmSync(versionDir, { recursive: true, force: true });
      step(1, "fetching the game");
      await unpack("the game", await download(`https://codeload.github.com/pagefaultgames/pokerogue/tar.gz/${pin.sha}`, "the game"), dir);
      step(2, "fetching the game's locales");
      const locales = await download(`https://codeload.github.com/pagefaultgames/pokerogue-locales/tar.gz/${pin.locales}`, "the game's locales");
      await unpack("the game's locales", locales, path.join(dir, "locales"));
      step(3, "fetching a battle animation");
      mkdirSync(path.join(dir, "assets/battle-anims"), { recursive: true });
      writeFileSync(
        path.join(dir, "assets/battle-anims/tackle.json"),
        await download(`https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/${pin.assets}/battle-anims/tackle.json`, "a battle animation"),
      );
      step(4, "installing the game's dependencies");
      const install = [...npx, "--yes", `pnpm@${pin.pnpm}`, "install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", path.join(versionDir, "store")];
      await execute("installing the game's dependencies", install, {
        cwd: dir,
        signal,
        onLine: line => {
          const counted = /^Progress: (.*)$/.exec(line);
          if (counted) step(4, `installing the game's dependencies (${counted[1]})`);
        },
      });
      for (const other of readdirSync(root)) {
        if (other !== path.basename(versionDir) && !other.startsWith(LOCK)) rmSync(path.join(root, other), { recursive: true, force: true });
      }
      writeFileSync(ready, "");
      return clone;
    } catch (e) {
      rmSync(versionDir, { recursive: true, force: true });
      if (e instanceof SetupFailed) return noAnswer({ code: "no_clone", version: pin.gameVersion, cause: e.message });
      throw e;
    }
  });
}

const LOCK = ".lock";

/**
 * Held for a whole setup by every plugin process sharing the home: a pidfile linked into place already written, so it
 * is never read empty, and taken over once its holder has died.
 */
async function locked<T>(root: string, signal: AbortSignal, waiting: () => void, work: () => Promise<T>): Promise<T> {
  const lock = path.join(root, LOCK);
  mkdirSync(root, { recursive: true });
  while (!take(lock)) {
    const holder = holderOf(lock);
    if (holder === null) continue;
    if (!alive(holder)) {
      rmSync(lock, { force: true });
      continue;
    }
    waiting();
    await sleep(250, undefined, { signal });
  }
  try {
    return await work();
  } finally {
    rmSync(lock, { force: true });
  }
}

function take(lock: string): boolean {
  const written = `${lock}.${randomUUID()}`;
  writeFileSync(written, String(process.pid));
  try {
    linkSync(written, lock);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  } finally {
    rmSync(written, { force: true });
  }
}

/** `null` once the lock has been let go since it was found taken. */
function holderOf(lock: string): number | null {
  try {
    return Number(readFileSync(lock, "utf8"));
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** A step that failed for a reason the player can be told, as the no answer's cause. */
class SetupFailed extends Error {}

/** Node's `fetch` says only "fetch failed", and keeps what went wrong in its `cause`. */
function causeOf(e: unknown): string {
  const cause = e instanceof Error ? e.cause : undefined;
  if (cause instanceof Error) return cause.message;
  return e instanceof Error ? e.message : String(e);
}

type Execution = { cwd: string; signal: AbortSignal; input?: Buffer; onLine?: (line: string) => void };

/** Most telling first: npm's own failure, fetching pnpm, ends on a pointer to its log. */
const CAUSES = [/ERR_PNPM_/, /^npm error .*reason:/, /^npm error code /];

async function execute(doing: string, [file, ...args]: readonly string[], { cwd, signal, input, onLine }: Execution): Promise<void> {
  const { code, output } = await new Promise<{ code: number | null; output: string }>(resolve => {
    const child = spawn(file, args, { cwd, signal, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    createInterface({ input: child.stdout }).on("line", line => {
      output += `${line}\n`;
      onLine?.(line);
    });
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.on("error", (err: Error) => (output += `\n${err.message}`));
    child.on("close", code => resolve({ code, output }));
    // A tar that rejects a tarball can exit before reading all of it, and the rest of the write then raises EPIPE: with
    // no listener that is an uncaught error, which ends the plugin rather than the setup.
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
  signal.throwIfAborted();
  if (code === 0) return;
  const lines = output.split("\n").map(line => line.trim()).filter(Boolean);
  const cause = CAUSES.map(telling => lines.findLast(line => telling.test(line))).find(line => line !== undefined);
  throw new SetupFailed(`${doing} failed: ${cause ?? lines.at(-1) ?? `exit code ${code}`}`);
}
