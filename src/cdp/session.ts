/**
 * One long-lived CDP page session against the PokéRogue tab.
 *
 * Attach-else-launch: if the debug port answers and a `pokerogue.net` tab
 * exists, attach to it; if the port answers but no tab does, open one; if the
 * port is dead, launch Chrome with #5's command against the persistent profile.
 * The server never closes the tab or Chrome — the dev watches the game there.
 *
 * Focus emulation is re-applied on every attach (#23): it dies with the CDP
 * session that set it, and without it a hidden page freezes the Phaser loop.
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type SessionOptions = {
  port: number;
  home: string;
  chromePath: string;
  url: string;
  log: (line: string) => void;
};

export const DEFAULTS: SessionOptions = {
  port: Number(process.env.POKEROGUE_MCP_PORT ?? 9222),
  home: process.env.POKEROGUE_MCP_HOME ?? path.join(homedir(), ".pokerogue-mcp"),
  chromePath: process.env.POKEROGUE_MCP_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  url: "https://pokerogue.net",
  log: line => process.stderr.write(`[pokerogue-mcp] ${line}\n`),
};

type Target = { id: string; type: string; url: string; webSocketDebuggerUrl: string };

/** A page-side throw, returned rather than thrown so a read degrades instead of failing the call. */
export type Thrown = { __throw: string };
export const isThrown = (v: unknown): v is Thrown => typeof v === "object" && v !== null && "__throw" in v;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class CdpSession {
  #ws: WebSocket | null = null;
  #id = 0;
  #pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  #opts: SessionOptions;
  #launched = false;
  /** Called for every `Runtime.exceptionThrown` the page reports (#16's hang corroboration). */
  onException: ((t: number) => void) | null = null;
  /** The page's recent console errors/warnings and uncaught exceptions, for diagnostics. Never read by the game loop. */
  #console: { t: string; level: string; text: string }[] = [];

  constructor(opts: Partial<SessionOptions> = {}) {
    this.#opts = { ...DEFAULTS, ...opts };
  }

  get attached(): boolean {
    return this.#ws !== null && this.#ws.readyState === WebSocket.OPEN;
  }

  get launchedChrome(): boolean {
    return this.#launched;
  }

  /** Attach if not attached; attach-else-launch. Idempotent. */
  async ensure(): Promise<void> {
    if (this.attached) return;
    let target = await this.#findTab();
    if (!target) {
      if (await this.#portUp()) {
        this.#opts.log("debug port up but no pokerogue.net tab; opening one");
        await fetch(`http://127.0.0.1:${this.#opts.port}/json/new?${this.#opts.url}`, { method: "PUT" });
      } else {
        this.#launch();
      }
      target = await this.#waitForTab(60_000);
    }
    await this.#open(target);
  }

  async #portUp(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.#opts.port}/json/version`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async #findTab(): Promise<Target | null> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.#opts.port}/json/list`, { signal: AbortSignal.timeout(1000) });
      const targets = (await res.json()) as Target[];
      return targets.find(t => t.type === "page" && t.url.includes("pokerogue.net")) ?? null;
    } catch {
      return null;
    }
  }

  async #waitForTab(ms: number): Promise<Target> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const t = await this.#findTab();
      if (t) return t;
      await sleep(500);
    }
    throw new Error(`no pokerogue.net tab appeared on port ${this.#opts.port} within ${ms} ms`);
  }

  #launch(): void {
    const profile = path.join(this.#opts.home, "chrome-profile");
    mkdirSync(profile, { recursive: true });
    const log = openSync(path.join(this.#opts.home, "chrome.log"), "a");
    this.#opts.log(`launching Chrome on port ${this.#opts.port} with profile ${profile}`);
    const child = spawn(
      this.#opts.chromePath,
      [
        `--remote-debugging-port=${this.#opts.port}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        this.#opts.url,
      ],
      { detached: true, stdio: ["ignore", log, log] },
    );
    child.unref();
    this.#launched = true;
  }

  async #open(target: Target): Promise<void> {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res(), { once: true });
      ws.addEventListener("error", () => rej(new Error("CDP websocket failed to open")), { once: true });
    });
    ws.addEventListener("message", ev => this.#onMessage(String(ev.data)));
    ws.addEventListener("close", () => {
      if (this.#ws === ws) this.#ws = null;
      for (const p of this.#pending.values()) p.rej(new Error("CDP session closed"));
      this.#pending.clear();
      this.#opts.log("CDP session closed; will re-attach on next call");
    });
    this.#ws = ws;
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    this.#opts.log(`attached to ${target.url}`);
  }

  #onMessage(raw: string): void {
    const msg = JSON.parse(raw) as {
      id?: number;
      method?: string;
      params?: {
        type?: string;
        args?: { value?: unknown; description?: string }[];
        exceptionDetails?: { text?: string; exception?: { description?: string } };
        entry?: { level?: string; text?: string };
      };
      result?: unknown;
      error?: unknown;
    };
    if (msg.id !== undefined) {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      msg.error ? p.rej(new Error(`CDP ${JSON.stringify(msg.error)}`)) : p.res(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      this.onException?.(Date.now());
      const d = msg.params?.exceptionDetails;
      this.#log("exception", d?.exception?.description ?? d?.text ?? "");
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const type = msg.params?.type ?? "";
      if (type === "error" || type === "warning") {
        this.#log(type, (msg.params?.args ?? []).map(a => (a.value !== undefined ? String(a.value) : (a.description ?? ""))).join(" "));
      }
    } else if (msg.method === "Log.entryAdded") {
      const e = msg.params?.entry;
      if (e && (e.level === "error" || e.level === "warning")) this.#log(`log:${e.level}`, e.text ?? "");
    }
  }

  #log(level: string, text: string): void {
    this.#console.push({ t: new Date().toISOString(), level, text: text.slice(0, 300) });
    if (this.#console.length > 30) this.#console.shift();
  }

  consoleTail(): { t: string; level: string; text: string }[] {
    return this.#console.slice();
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("not attached"));
    return new Promise<T>((res, rej) => {
      const id = ++this.#id;
      this.#pending.set(id, { res: res as (v: unknown) => void, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate a self-contained expression (see `src/cdp/link.ts`) and return its JSON value, or the page's throw. */
  async evaluate<T>(expression: string): Promise<T | Thrown> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true, generatePreview: false },
    );
    if (r.exceptionDetails) {
      return { __throw: r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text };
    }
    return r.result.value;
  }

  /** Re-apply focus emulation (#23) — cheap, and it silently dies with any prior session. */
  async keepAlive(): Promise<void> {
    await this.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  }

  async screenshot(): Promise<string> {
    const r = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    return r.data;
  }

  /** Raw keyboard fallback: Phaser binds to `window`, so a dispatched key reaches the game (#9). */
  async rawKey(key: string, code: string, keyCode: number): Promise<void> {
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
        text: key.length === 1 ? key : undefined,
      });
    }
  }

  async reload(): Promise<void> {
    await this.send("Page.reload");
  }

  detach(): void {
    this.#ws?.close();
    this.#ws = null;
  }
}

