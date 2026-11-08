/**
 * The key probe's automated smoke check (#1018): loads each build into a throwaway profile, opens pokerogue.net, sends
 * one key and one synthetic key, and prints what the probe box drew; then opens the options page twice.
 *
 * It shows the log draws. It is **not** a press: CDP and BiDi keys skip the browser's shortcut layer, which is the
 * whole question, so the presses #1019 records are made by hand.
 *
 * Chrome for Testing 148 (it still takes `--load-extension`) over CDP; Firefox headless over WebDriver BiDi. Orion has
 * no automation hook, so its smoke check is the first step of the owner's script.
 *
 * Usage: node scripts/keyprobe-smoke.ts [chrome] [firefox]   (both when neither is named)
 * Env: KEYPROBE_CHROME, KEYPROBE_FIREFOX (binaries), KEYPROBE_TMP (where the throwaway profiles go).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.KEYPROBE_CHROME ??
  join(homedir(), ".cache/puppeteer/chrome/mac_arm-148.0.7778.97/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const FIREFOX = process.env.KEYPROBE_FIREFOX ?? "/Applications/Firefox.app/Contents/MacOS/firefox";
const TMP = process.env.KEYPROBE_TMP ?? tmpdir();
const DOWNLOADS = join(homedir(), "Downloads");
const GAME = "https://pokerogue.net/";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const say = (line: string) => process.stdout.write(`${line}\n`);

/** One JSON-over-WebSocket peer, for CDP and BiDi alike: both answer `{ id, ... }`. */
class Peer {
  #ws: WebSocket;
  #id = 0;
  #pending = new Map<number, (m: Record<string, unknown>) => void>();
  private constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.addEventListener("message", e => {
      const m = JSON.parse(String(e.data)) as Record<string, unknown>;
      if (typeof m.id === "number") this.#pending.get(m.id)?.(m), this.#pending.delete(m.id);
    });
  }
  static async open(url: string): Promise<Peer> {
    const ws = new WebSocket(url);
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res(), { once: true });
      ws.addEventListener("error", () => rej(new Error(`websocket to ${url} failed`)), { once: true });
    });
    return new Peer(ws);
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.#id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${method} timed out`)), 60_000);
      this.#pending.set(id, m => {
        clearTimeout(t);
        if (m.error) rej(new Error(`${method}: ${JSON.stringify(m.error)} ${String(m.message ?? "")}`));
        else res((m.result ?? {}) as Record<string, unknown>);
      });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close(): void { this.#ws.close(); }
}

async function until<T>(what: string, ms: number, fn: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + ms;
  let last: unknown = null;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v != null) return v;
    } catch (e) {
      last = e;
    }
    await sleep(500);
  }
  throw new Error(`${what}: nothing within ${ms} ms${last ? ` (${String(last)})` : ""}`);
}

const BOX = `(() => { const b = document.getElementById("coachemon-keyprobe"); return b ? b.innerText : null; })()`;
/** Ready once the background answered: the box then lists the commands. */
const ready = (text: string | null) => (text && text.includes("probe-opt-k") ? text : null);
const SYNTHETIC = `window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", key: "j", keyCode: 74, bubbles: true })), "sent"`;

/** Waits for the browser to exit, so its throwaway profile can go with it. */
async function stop(child: ChildProcess, profile: string): Promise<void> {
  const exited = new Promise<void>(res => (child.exitCode !== null ? res() : child.once("exit", () => res())));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await Promise.race([exited, sleep(2000)]);
  rmSync(profile, { recursive: true, force: true });
}

async function chrome(): Promise<void> {
  say("\n=== Chrome for Testing 148 (CDP) ===");
  const ext = join(DOWNLOADS, "coachemon-keyprobe-chrome");
  const profile = mkdtempSync(join(TMP, "keyprobe-chrome-"));
  const port = 9555;
  const child = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", `--load-extension=${ext}`, `--disable-extensions-except=${ext}`, GAME,
  ], { stdio: "ignore" });
  try {
    const list = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json() as Promise<{ type: string; url: string; webSocketDebuggerUrl: string }[]>);
    const page = await until("the game tab", 30_000, async () => (await list()).find(t => t.type === "page" && t.url.startsWith(GAME)) ?? null);
    const cdp = await Peer.open(page.webSocketDebuggerUrl);
    const evaluate = async (expression: string) =>
      ((await cdp.send("Runtime.evaluate", { expression, returnByValue: true })).result as { value?: unknown })?.value ?? null;
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await until("the probe box, with the background's answer", 60_000, async () => ready((await evaluate(BOX)) as string | null));
    // One CDP key (trusted, but past the shortcut layer) and one synthetic one (untrusted).
    for (const type of ["keyDown", "keyUp"]) {
      await cdp.send("Input.dispatchKeyEvent", { type, key: "k", code: "KeyK", windowsVirtualKeyCode: 75, text: type === "keyDown" ? "k" : undefined });
    }
    await sleep(1500);
    await evaluate(SYNTHETIC);
    await sleep(500);
    say(String(await evaluate(BOX)));

    const sw = await until("the extension's service worker", 10_000, async () => (await list()).find(t => t.url.startsWith("chrome-extension://") && t.url.endsWith("/background.js")) ?? null);
    const options = sw.url.replace(/background\.js$/, "options.html");
    for (const round of ["first open", "reopened"]) {
      const t = await fetch(`http://127.0.0.1:${port}/json/new?${options}`, { method: "PUT" }).then(r => r.json() as Promise<{ id: string; webSocketDebuggerUrl: string }>);
      const p = await Peer.open(t.webSocketDebuggerUrl);
      await sleep(2000);
      const text = ((await p.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true })).result as { value?: string }).value;
      say(`\n--- options page, ${round} (opened as a tab; the embedded dialog is for the owner's hand check) ---\n${text}`);
      p.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
    }
    cdp.close();
  } finally {
    await stop(child, profile);
  }
}

async function firefox(): Promise<void> {
  say("\n=== Firefox headless (WebDriver BiDi) ===");
  const ext = join(DOWNLOADS, "coachemon-keyprobe-firefox");
  const profile = mkdtempSync(join(TMP, "keyprobe-firefox-"));
  writeFileSync(join(profile, "user.js"), [
    `user_pref("browser.shell.checkDefaultBrowser", false);`,
    `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
    `user_pref("browser.aboutwelcome.enabled", false);`,
  ].join("\n"));
  const port = 9556;
  // System access lets BiDi read a `moz-extension:` page; it is this throwaway headless instance's alone.
  const child = spawn(FIREFOX, ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port", String(port)],
    { stdio: "ignore", env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" } });
  try {
    const bidi = await until("Firefox's BiDi socket", 30_000, () => Peer.open(`ws://127.0.0.1:${port}/session`));
    await bidi.send("session.new", { capabilities: {} });
    const installed = await bidi.send("webExtension.install", { extensionData: { type: "path", path: ext } });
    say(`installed as a temporary add-on: ${JSON.stringify(installed)}`);
    const tree = await bidi.send("browsingContext.getTree", {});
    const context = (tree.contexts as { context: string }[])[0].context;
    const evaluate = async (expression: string) => {
      const r = await bidi.send("script.evaluate", { expression, target: { context }, awaitPromise: false });
      const v = r.result as { type: string; value?: unknown };
      return v?.type === "null" || v?.type === "undefined" ? null : v?.value ?? null;
    };
    await bidi.send("browsingContext.navigate", { context, url: GAME, wait: "interactive" });
    const before = await until("the probe box, with the background's answer", 60_000, async () => ready((await evaluate(BOX)) as string | null));
    const optionsUrl = /options page: (moz-extension:\/\/\S+)/.exec(before)?.[1];
    await bidi.send("input.performActions", {
      context,
      actions: [{ type: "key", id: "kb", actions: [{ type: "keyDown", value: "k" }, { type: "keyUp", value: "k" }] }],
    });
    await sleep(1500);
    await evaluate(SYNTHETIC);
    await sleep(500);
    say(String(await evaluate(BOX)));
    const click = (label: string) => evaluate(`[...document.querySelectorAll("#coachemon-keyprobe button")].find(b => b.textContent.startsWith(${JSON.stringify(label)})).click(), "clicked"`);
    // The update check is an API call, not a press, so it may be automated.
    // The `commands.getAll()` row, not the button that names the same command.
    const optJ = (text: string) => /probe-opt-j +\S+ +declared +\S+ +→ (.*)/.exec(text)?.[1];
    await click("commands.update");
    await sleep(1500);
    const updated = String(await evaluate(BOX));
    await click("commands.reset");
    await sleep(1500);
    const reset = String(await evaluate(BOX));
    say(`\ncommands.update: probe-opt-j → ${optJ(updated)} (${/commands\.update: .*/.exec(updated)?.[0]})`);
    say(`commands.reset: probe-opt-j → ${optJ(reset)} (${/commands\.reset: .*/.exec(reset)?.[0]})`);
    if (!optionsUrl) throw new Error("the box drew no options page URL");
    // BiDi may not navigate to a `moz-extension:` page, so the box's own button opens it, through the background.
    for (const round of ["first open", "reopened"]) {
      await click("options in a tab");
      const opened = await until("the options tab", 10_000, async () => {
        const t = await bidi.send("browsingContext.getTree", {});
        return (t.contexts as { context: string; url: string }[]).find(c => c.url === optionsUrl) ?? null;
      });
      await sleep(2000);
      const r = await bidi.send("script.evaluate", { expression: "document.body.innerText", target: { context: opened.context }, awaitPromise: false });
      say(`\n--- options page, ${round} (as a tab) ---\n${String((r.result as { value?: unknown }).value)}`);
      await bidi.send("browsingContext.close", { context: opened.context });
    }
    await bidi.send("session.end", {}).catch(() => {});
    bidi.close();
  } finally {
    await stop(child, profile);
  }
}

const which = process.argv.slice(2);
const all = which.length === 0;
let failed = false;
for (const [name, run] of [["chrome", chrome], ["firefox", firefox]] as const) {
  if (!all && !which.includes(name)) continue;
  try {
    await run();
  } catch (e) {
    failed = true;
    say(`${name}: FAILED: ${String(e)}`);
  }
}
process.exitCode = failed ? 1 : 0;
