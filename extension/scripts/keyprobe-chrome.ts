/**
 * Starts the owner's Chrome binary in a throwaway profile with the key probe loaded, for #1019's scripted presses, and
 * keeps it up until this process is stopped. Branded Chrome no longer takes `--load-extension`, so the probe goes in
 * with CDP's `Extensions.loadUnpacked`, which Chrome allows only over `--remote-debugging-pipe` with
 * `--enable-unsafe-extension-debugging`. A port is opened too, for reading the box between presses
 * (`keyprobe-cdp.ts`). Neither touches how a key reaches the browser: the presses come from `keyprobe-press.swift`.
 *
 * Usage: node scripts/keyprobe-chrome.ts <profile-dir> [port]   (port defaults to 9557)
 * Prints `ready pid=<browser pid> extension=<id> port=<port>` once the game tab is open.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXT = join(homedir(), "Downloads", "coachemon-keyprobe-chrome");
const [profile, portArg] = process.argv.slice(2);
if (!profile) throw new Error("usage: keyprobe-chrome.ts <profile-dir> [port]");
const port = Number(portArg ?? 9557);
mkdirSync(profile, { recursive: true });

const child = spawn(CHROME, [
  `--user-data-dir=${profile}`, "--remote-debugging-pipe", `--remote-debugging-port=${port}`,
  "--enable-unsafe-extension-debugging", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
child.stderr!.resume();
const toChrome = child.stdio[3] as Writable;
const fromChrome = child.stdio[4] as Readable;

let id = 0;
const pending = new Map<number, (m: Record<string, unknown>) => void>();
let buffer = "";
fromChrome.on("data", (chunk: Buffer) => {
  buffer += chunk.toString("utf8");
  let at: number;
  while ((at = buffer.indexOf("\0")) > -1) {
    const m = JSON.parse(buffer.slice(0, at)) as Record<string, unknown>;
    buffer = buffer.slice(at + 1);
    if (typeof m.id === "number") pending.get(m.id)?.(m), pending.delete(m.id);
  }
});
const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, m => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res((m.result ?? {}) as Record<string, unknown>)));
    toChrome.write(`${JSON.stringify({ id: n, method, params })}\0`);
  });

const stop = () => { child.kill("SIGTERM"); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", code => { process.stdout.write(`chrome exited ${code}\n`); process.exit(0); });

await send("Browser.getVersion").then(v => process.stdout.write(`chrome ${String(v.product)}\n`));
const loaded = await send("Extensions.loadUnpacked", { path: EXT });
await send("Target.createTarget", { url: "https://pokerogue.net/" });
process.stdout.write(`ready pid=${child.pid} extension=${String(loaded.id)} port=${port}\n`);
