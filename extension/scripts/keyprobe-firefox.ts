/**
 * Starts the owner's Firefox binary in a throwaway profile with the key probe as a temporary add-on, for #1019's
 * scripted presses, and keeps it up until this process is stopped. The add-on goes in over WebDriver BiDi
 * (`webExtension.install`), as `about:debugging` would load it. BiDi allows one session, so this process holds it and
 * relays calls from `keyprobe-bidi.ts` over a local HTTP port. Nothing here sends a key: the presses come from
 * `keyprobe-press.swift`.
 *
 * Usage: node scripts/keyprobe-firefox.ts <profile-dir> [bidi-port] [relay-port]   (9558, 9559)
 * Prints `ready pid=<firefox pid> relay=<port>` once the game tab is open.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FIREFOX = "/Applications/Firefox.app/Contents/MacOS/firefox";
const EXT = join(homedir(), "Downloads", "coachemon-keyprobe-firefox");
const [profile, bidiArg, relayArg] = process.argv.slice(2);
if (!profile) throw new Error("usage: keyprobe-firefox.ts <profile-dir> [bidi-port] [relay-port]");
const bidiPort = Number(bidiArg ?? 9558);
const relayPort = Number(relayArg ?? 9559);
mkdirSync(profile, { recursive: true });
writeFileSync(join(profile, "user.js"), [
  `user_pref("browser.shell.checkDefaultBrowser", false);`,
  `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
  `user_pref("browser.aboutwelcome.enabled", false);`,
  `user_pref("browser.startup.homepage_override.mstone", "ignore");`,
  `user_pref("browser.tabs.warnOnClose", false);`,
].join("\n"));

// System access lets BiDi reach `about:addons` and `moz-extension:` pages; it is this throwaway instance's alone.
const child = spawn(FIREFOX, ["--no-remote", "--profile", profile, "--remote-debugging-port", String(bidiPort)],
  { stdio: "ignore", env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" } });
const stop = () => { child.kill("SIGTERM"); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", code => { process.stdout.write(`firefox exited ${code}\n`); process.exit(0); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let ws: WebSocket | null = null;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const s = new WebSocket(`ws://127.0.0.1:${bidiPort}/session`);
    await new Promise<void>((res, rej) => { s.onopen = () => res(); s.onerror = () => rej(new Error("no socket yet")); });
    ws = s;
  } catch {
    await sleep(500);
  }
}
if (!ws) throw new Error("Firefox's BiDi socket never opened");
const socket = ws;
let id = 0;
const pending = new Map<number, (m: Record<string, unknown>) => void>();
socket.onmessage = e => {
  const m = JSON.parse(String(e.data)) as Record<string, unknown>;
  if (typeof m.id === "number") pending.get(m.id)?.(m), pending.delete(m.id);
};
const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
  new Promise(res => {
    const n = ++id;
    pending.set(n, res);
    socket.send(JSON.stringify({ id: n, method, params }));
  });

await send("session.new", { capabilities: {} });
const installed = await send("webExtension.install", { extensionData: { type: "path", path: EXT } });
const tree = await send("browsingContext.getTree", {});
const context = ((tree.result as { contexts: { context: string }[] }).contexts)[0].context;
await send("browsingContext.navigate", { context, url: "https://pokerogue.net/", wait: "interactive" });

createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    const { method, params } = JSON.parse(body || "{}") as { method: string; params?: Record<string, unknown> };
    void send(method, params ?? {}).then(m => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(m)); });
  });
}).listen(relayPort, "127.0.0.1");
process.stdout.write(`ready pid=${child.pid} relay=${relayPort} installed=${JSON.stringify(installed.result ?? installed.error)}\n`);
