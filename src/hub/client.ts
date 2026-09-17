/**
 * The hub's Node client (§7.2): what an MCP server or the watch CLI talks to the hub through. It dials the loopback
 * port, spawns the hub when nothing answers, proves the hub is ours by the product marker, settles version skew, and
 * then carries one request at a time per id.
 *
 * It uses `ws` rather than the global `WebSocket` so the upgrade carries no `Origin`, which is what tells the hub a
 * local client from a browser (§7.4). Nothing here knows about the game: `src/hub/link.ts` turns these frames into
 * commands.
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { reach, type HubTrouble } from "./ladder.ts";
import { PRODUCT } from "../protocol/version.ts";
import type { Claimed, ClientReply, ClientRole, FromClient, HubState, ToClient, Welcome } from "../protocol/wire.ts";

/** How long a spawned hub has to answer before we call it a hub that would not start (§7.2). */
const SPAWN_BUDGET_MS = 3_000;
const SPAWN_POLL_MS = 100;
/** How long a connected port has to prove itself with a product-marked `welcome` (§7.2). */
const WELCOME_MS = 1_000;

/**
 * A hub being started (§7.2). The client dials the port while this runs, so the child comes up and the retries happen
 * together; `release` is what ends the stderr pipe and `unref()`s the child, once connected or once it exits.
 */
export type HubProcess = {
  pid: number | null;
  /** What the child has said on stderr so far: rung 2's line, when it never comes up. */
  stderr: () => string;
  /** The child's exit code, once it exits. A hub that stays up never settles this. */
  exited: Promise<number | null>;
  release: () => void;
};

export type ClientOptions = {
  port: number;
  /** This plugin copy's version, for the skew comparison (§7.3). */
  version: string;
  role?: ClientRole;
  /** Fired for every event and notice once subscribed. */
  onEvent?: (frame: Extract<ToClient, { t: "event" } | { t: "notice" }>) => void;
  /** Test seam: what starting a hub on the port does. The default spawns `src/hub/main.ts` detached (§7.2). */
  spawnHub?: (port: number) => HubProcess;
  /** Test seam: who holds the port when it answers but is not a hub (rung 1). */
  portHolder?: (port: number) => { process: string | null; pid: number | null };
};

/**
 * What one command came to. `unreachable` is this client's own: the hub's codes all describe a hub that answered, and
 * "there was no hub to ask" is not one of them (§7.6).
 */
export type CommandAnswer = ClientReply | { t: "reply"; id: number; ok: false; code: "unreachable"; message: string };

export class HubClient {
  readonly #o: ClientOptions;
  #ws: WebSocket | null = null;
  #connecting: Promise<HubTrouble | null> | null = null;
  #ids = 0;
  #pending = new Map<number, (r: CommandAnswer) => void>();
  #waiting: { match: (f: ToClient) => boolean; resolve: (f: ToClient) => void; timer: NodeJS.Timeout }[] = [];
  #subscribed = false;
  /** A hub is retired at most once per client: the replacement is ours, and a second round would be a loop (§7.3). */
  #retired = false;

  constructor(o: ClientOptions) {
    this.#o = o;
  }

  get connected(): boolean {
    return this.#ws !== null && this.#ws.readyState === WebSocket.OPEN;
  }

  /** Connects if the socket is not up. Null when the hub is ours to use; otherwise what stands in the way. */
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

  /** Takes the driver grant for this connection. `false` is `contended`: another session is driving (§7.5). */
  async claim(): Promise<boolean> {
    if ((await this.ready()) !== null) return false;
    this.#send({ t: "claim" });
    const c = await this.#await<Claimed>(f => f.t === "claimed");
    return c !== null && c.ok;
  }

  /** Fans the hub's `card` and `coach-error` events, and its `tabs` / `resume` notices, into `onEvent` (§7.5). */
  async subscribe(): Promise<void> {
    if ((await this.ready()) !== null) return;
    this.#subscribed = true;
    this.#send({ t: "subscribe" });
  }

  /** One command, answered by the hub itself or by the tab it routed to. A hub we cannot reach refuses `no-tab`. */
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

  // ------------------------------------------------------------- connection

  async #connect(): Promise<HubTrouble | null> {
    const port = this.#o.port;
    let ws = await dial(port).catch((e: NodeJS.ErrnoException) => e);
    if (ws instanceof Error) {
      // Something answers but will not talk to us: a foreign process holds the port (§7.2, rung 1).
      if (ws.code !== "ECONNREFUSED") return this.#foreign();
      const child = (this.#o.spawnHub ?? spawnHub)(port);
      // The dialling and the child's own start run together: the retries are what notice it came up (§7.2).
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

  /** Retries the connection every 100 ms while a spawned hub comes up, and gives up early once it has died (§7.2). */
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
    // We are the newer copy: retire the old hub, unless someone is driving on it (§7.3).
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

  /** Waits for the retired hub to release the port, so the next connection is to the hub we start ourselves (§7.3). */
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

  /** The next frame matching `match`, or null when none arrives in time: a silent hub is never waited on forever. */
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

/** One dial. Rejects with the socket error (`ECONNREFUSED` when nothing listens) or the HTTP status when it is refused. */
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

/** Spawns the hub from this same plugin copy, detached, and reads its stderr only while it might still fail (§7.2). */
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
    // Nothing is written to disk and nothing is waited on: the hub outlives whoever started it.
    release: () => {
      child.stderr?.destroy();
      child.unref();
    },
  };
}

/** Who holds the port, for rung 1. `lsof` is not everywhere, and the line works without it (§12.3). */
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

/** What a command says when there is no hub to send it to: the ladder's own line, so both sides say one thing (§12.3). */
function troubleMessage(t: HubTrouble): string {
  return reach({ trouble: t, extensions: [], tabs: [] })?.line ?? "The Coachemon hub is not reachable.";
}

/** Plugin versions, compared as the three numbers semantic-release writes; anything unparsable sorts as 0. */
export function compare(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.+-]/).slice(0, 3).map(n => (Number.isInteger(Number(n)) ? Number(n) : 0));
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
