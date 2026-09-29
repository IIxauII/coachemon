/** The hub's Node client (extension-distribution.md §7.2). Nothing here knows about the game. */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Not the global `WebSocket`: `ws` sends no `Origin`, which is how the hub tells a local client from a browser
// (extension-distribution.md §7.4).
import { WebSocket } from "ws";
import { reach, type HubTrouble } from "./ladder.ts";
import { PRODUCT } from "../protocol/version.ts";
import type { Claimed, ClientReply, ClientRole, FromClient, HubState, ToClient, Welcome } from "../protocol/wire.ts";

const SPAWN_BUDGET_MS = 3_000;
const SPAWN_POLL_MS = 100;
const WELCOME_MS = 1_000;

export type HubProcess = {
  pid: number | null;
  /** What the child has said on stderr so far. */
  stderr: () => string;
  /** A hub that stays up never settles this. */
  exited: Promise<number | null>;
  release: () => void;
};

export type ClientOptions = {
  port: number;
  /** This plugin copy's version (extension-distribution.md §7.3). */
  version: string;
  role?: ClientRole;
  /** Fired for every event and notice once subscribed. */
  onEvent?: (frame: Extract<ToClient, { t: "event" } | { t: "notice" }>) => void;
  /** Test seam. */
  spawnHub?: (port: number) => HubProcess;
  /** Test seam. */
  portHolder?: (port: number) => { process: string | null; pid: number | null };
};

/** `unreachable` is this client's own, never the hub's (extension-distribution.md §7.6). */
export type CommandAnswer = ClientReply | { t: "reply"; id: number; ok: false; code: "unreachable"; message: string };

export class HubClient {
  readonly #o: ClientOptions;
  #ws: WebSocket | null = null;
  #connecting: Promise<HubTrouble | null> | null = null;
  #ids = 0;
  #pending = new Map<number, (r: CommandAnswer) => void>();
  #waiting: { match: (f: ToClient) => boolean; resolve: (f: ToClient) => void; timer: NodeJS.Timeout }[] = [];
  #subscribed = false;
  /** At most once per client: the replacement is ours, and a second round would be a loop. */
  #retired = false;

  constructor(o: ClientOptions) {
    this.#o = o;
  }

  get connected(): boolean {
    return this.#ws !== null && this.#ws.readyState === WebSocket.OPEN;
  }

  ready(): Promise<HubTrouble | null> {
    if (this.connected) return Promise.resolve(null);
    this.#connecting ??= this.#connect().finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  async state(): Promise<HubState | null> {
    if ((await this.ready()) !== null) return null;
    this.#send({ t: "state" });
    return this.#await<HubState>(f => f.t === "state");
  }

  /** The driver grant, for this connection only (extension-distribution.md §7.5). */
  async claim(): Promise<boolean> {
    if ((await this.ready()) !== null) return false;
    this.#send({ t: "claim" });
    const c = await this.#await<Claimed>(f => f.t === "claimed");
    return c !== null && c.ok;
  }

  /** Outlives a reconnect: the handshake subscribes again. */
  async subscribe(): Promise<void> {
    if ((await this.ready()) !== null) return;
    this.#subscribed = true;
    this.#send({ t: "subscribe" });
  }

  /** The dev loop's reload (extension-distribution.md §5.4). Nothing answers it, so this resolves once the frame is away. */
  async devReload(): Promise<HubTrouble | null> {
    const trouble = await this.ready();
    if (trouble === null) this.#send({ t: "dev-reload" });
    return trouble;
  }

  async send(name: string, args: Record<string, unknown>): Promise<CommandAnswer> {
    const id = ++this.#ids;
    const trouble = await this.ready();
    if (trouble !== null) return { t: "reply", id, ok: false, code: "unreachable", message: troubleMessage(trouble) };
    return new Promise<CommandAnswer>(resolve => {
      this.#pending.set(id, resolve);
      this.#send({ t: "cmd", id, name, args });
    });
  }

  close(): void {
    this.#ws?.close();
    this.#ws = null;
  }

  async #connect(): Promise<HubTrouble | null> {
    const port = this.#o.port;
    let ws = await dial(port).catch((e: NodeJS.ErrnoException) => e);
    if (ws instanceof Error) {
      // Something answers but will not talk to us: a foreign process holds the port (extension-distribution.md §7.2, rung 1).
      if (ws.code !== "ECONNREFUSED") return this.#foreign();
      const child = (this.#o.spawnHub ?? spawnHub)(port);
      let exit: number | null | undefined;
      void child.exited.then(code => {
        exit = code;
      });
      ws = await this.#waitForHub(port, () => exit !== undefined && exit !== 0);
      child.release();
      if (ws instanceof Error) return { kind: "no-start", stderr: child.stderr() || ws.message };
    }
    return this.#handshake(ws);
  }

  async #waitForHub(port: number, died: () => boolean): Promise<WebSocket | Error> {
    const until = Date.now() + SPAWN_BUDGET_MS;
    let last: Error = new Error("the hub did not answer");
    while (Date.now() < until) {
      await new Promise(r => setTimeout(r, SPAWN_POLL_MS));
      const ws = await dial(port).catch((e: Error) => e);
      if (!(ws instanceof Error)) return ws;
      last = ws;
      if (died()) return new Error("the hub exited without taking the port");
    }
    return last;
  }

  async #handshake(ws: WebSocket): Promise<HubTrouble | null> {
    this.#attach(ws);
    this.#send({ t: "hello", role: this.#o.role ?? "server", version: this.#o.version, pid: process.pid });
    const welcome = await this.#await<Welcome>(f => f.t === "welcome", WELCOME_MS);
    if (welcome === null || welcome.product !== PRODUCT) {
      this.close();
      return this.#foreign();
    }
    const skew = compare(this.#o.version, welcome.version);
    if (skew === 0) {
      if (this.#subscribed) this.#send({ t: "subscribe" });
      return null;
    }
    if (skew < 0) {
      this.close();
      return { kind: "skew-hub-newer" };
    }
    // We are the newer copy (extension-distribution.md §7.3).
    this.#send({ t: "state" });
    const state = await this.#await<HubState>(f => f.t === "state");
    if (state?.driver === "other" || this.#retired) {
      this.close();
      return { kind: "skew-driving" };
    }
    this.#retired = true;
    this.#send({ t: "retire" });
    this.close();
    // The retired hub takes a moment to let the port go; connecting into its closing sockets would look foreign.
    await this.#awaitPortFree();
    return this.#connect();
  }

  async #awaitPortFree(): Promise<void> {
    const until = Date.now() + SPAWN_BUDGET_MS;
    while (Date.now() < until) {
      const ws = await dial(this.#o.port).catch((e: NodeJS.ErrnoException) => e);
      if (ws instanceof Error) {
        if (ws.code === "ECONNREFUSED") return;
      } else {
        ws.close();
      }
      await new Promise(r => setTimeout(r, SPAWN_POLL_MS));
    }
  }

  #foreign(): HubTrouble {
    const holder = (this.#o.portHolder ?? portHolder)(this.#o.port);
    return { kind: "foreign", port: this.#o.port, ...holder };
  }

  #attach(ws: WebSocket): void {
    this.#ws = ws;
    ws.on("message", raw => this.#frame(raw));
    ws.on("close", () => {
      if (this.#ws === ws) this.#ws = null;
      // Every request in flight loses its answer with the socket; the next call reconnects.
      for (const [id, resolve] of [...this.#pending]) {
        this.#pending.delete(id);
        resolve({ t: "reply", id, ok: false, code: "unreachable", message: "The Coachemon hub closed the connection." });
      }
    });
    ws.on("error", () => {});
  }

  #frame(raw: unknown): void {
    let f: ToClient;
    try {
      f = JSON.parse(String(raw)) as ToClient;
    } catch {
      return;
    }
    if (f.t === "reply") {
      const resolve = this.#pending.get(f.id);
      if (resolve) {
        this.#pending.delete(f.id);
        resolve(f);
      }
      return;
    }
    if (f.t === "event" || f.t === "notice") {
      this.#o.onEvent?.(f);
      return;
    }
    const i = this.#waiting.findIndex(w => w.match(f));
    if (i >= 0) {
      const w = this.#waiting.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(f);
    }
  }

  #send(frame: FromClient): void {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(frame));
  }

  #await<T extends ToClient>(match: (f: ToClient) => boolean, ms = WELCOME_MS): Promise<T | null> {
    return new Promise<T | null>(resolve => {
      const w = {
        match,
        resolve: (f: ToClient) => resolve(f as T),
        timer: setTimeout(() => {
          this.#waiting = this.#waiting.filter(x => x !== w);
          resolve(null);
        }, ms),
      };
      this.#waiting.push(w);
    });
  }
}

/** Rejects with the socket error, `ECONNREFUSED` when nothing listens, or with the HTTP status when refused. */
function dial(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { perMessageDeflate: false });
    const fail = (e: Error) => {
      ws.removeAllListeners();
      // Terminating a socket that never opened emits one more error; nothing is listening for it but Node.
      ws.on("error", () => {});
      ws.terminate();
      reject(e);
    };
    ws.once("open", () => {
      ws.removeAllListeners("error");
      ws.removeAllListeners("unexpected-response");
      resolve(ws);
    });
    ws.once("unexpected-response", (_req, res) => fail(new Error(`the port answered HTTP ${res.statusCode}`)));
    ws.once("error", fail);
  });
}

export function spawnHub(port: number): HubProcess {
  const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "main.ts");
  let stderr = "";
  const child = spawn(process.execPath, [entry, "--port", String(port)], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  child.stderr?.on("data", (b: Buffer) => {
    stderr += String(b);
  });
  const exited = new Promise<number | null>(resolve => {
    child.once("exit", code => resolve(code));
    child.once("error", e => {
      stderr ||= e.message;
      resolve(null);
    });
  });
  return {
    pid: child.pid ?? null,
    stderr: () => stderr,
    exited,
    // The hub outlives whoever started it.
    release: () => {
      child.stderr?.destroy();
      child.unref();
    },
  };
}

/** `lsof` is not everywhere, and rung 1's line works without it (extension-distribution.md §12.3). */
function portHolder(port: number): { process: string | null; pid: number | null } {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const line = out.split("\n")[1] ?? "";
    const [name, pid] = line.split(/\s+/);
    return { process: name || null, pid: Number.isInteger(Number(pid)) ? Number(pid) : null };
  } catch {
    return { process: null, pid: null };
  }
}

function troubleMessage(t: HubTrouble): string {
  return reach({ trouble: t, extensions: [], tabs: [] })?.line ?? "The Coachemon hub is not reachable.";
}

export function compare(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.+-]/).slice(0, 3).map(n => (Number.isInteger(Number(n)) ? Number(n) : 0));
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
